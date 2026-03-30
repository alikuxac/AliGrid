import type { Node } from 'reactflow';
import { ResourceType, RESOURCE_REGISTRY, Decimal } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { addStat, addCloudStat, getEdgeBackpressure, safeDecimal } from '../helpers';
import { CLOUD_BASE_CAPACITY, CLOUD_CAPACITY_GROWTH } from '../../../constants';

export const updateAntennas = (ctx: TickContext) => {
    const { dtSeconds, nodeIncoming, edgeBackpressures, inEdgesByTarget, edgeFlows, nodesById, nextCloudStorage, get, nodeDeltas = {} } = ctx;
    ctx.nodeDeltas = nodeDeltas;

    const antennasNodes: Node<NodeData>[] = [];
    for (const node of ctx.nextNodes) {
        if (node.type === 'antenna' || node.type === 'powerTransmitter') {
            antennasNodes.push(node);
        }
    }

    const nextCloudStorageLocal = ctx.nextCloudStorage;

    // 1. Calculate TOTAL requested inflow per ResourceType across ALL antennas/transmitters
    const totalRequestedByRt: Partial<Record<ResourceType, Decimal>> = {};
    for (const node of antennasNodes) {
        const incoming = nodeIncoming[node.id];
        if (incoming) {
            for (const [rtStr, amt] of Object.entries(incoming)) {
                const rt = rtStr as ResourceType;
                if (RESOURCE_REGISTRY[rt]?.isUploadAvailable) {
                    totalRequestedByRt[rt] = (totalRequestedByRt[rt] || safeDecimal(0)).plus(amt as Decimal);
                }
            }
        }
    }

    // 2. Calculate Global Acceptance Factors per ResourceType
    const globalAcceptanceByRt: Partial<Record<ResourceType, Decimal>> = {};
    const cloudLevel = ctx.cloudLevel || 1;
    const globalCloudCap = safeDecimal(CLOUD_BASE_CAPACITY).times(Math.pow(CLOUD_CAPACITY_GROWTH, cloudLevel - 1));

    const globalStorageAcceptanceByRt: Partial<Record<ResourceType, Decimal>> = {};

    for (const rtStr of Object.keys(totalRequestedByRt)) {
        const rt = rtStr as ResourceType;
        const totalReq = totalRequestedByRt[rt] || safeDecimal(0);
        const curAmt = nextCloudStorageLocal[rt] || safeDecimal(0);
        const space = Decimal.max(0, globalCloudCap.minus(curAmt));

        // BACKPRESSURE acceptance is now always 1.0 (requested by user: "dây vẫn chạy bình thường")
        globalAcceptanceByRt[rt] = safeDecimal(1);

        if (totalReq.gt(0)) {
            // How much of the intake actually fits in the cloud
            globalStorageAcceptanceByRt[rt] = Decimal.min(safeDecimal(1), space.dividedBy(totalReq));
        } else {
            globalStorageAcceptanceByRt[rt] = safeDecimal(1);
        }
    }

    const incomingRatesAll: Record<string, Record<string, { res: string; rate: string }>> = {};

    // 3. Apply Acceptance to Edges and Consume Items
    for (const node of antennasNodes) {
        const incoming = nodeIncoming[node.id];
        const incomingRates: Record<string, { res: string; rate: string }> = {};
        const inEdges = inEdgesByTarget[node.id] || [];

        // Track display rates for UI
        for (const edge of inEdges) {
            const flow = edgeFlows[edge.id];
            if (flow) {
                for (const [rt, amt] of Object.entries(flow)) {
                    const rateVal = dtSeconds > 0 ? (amt as Decimal).dividedBy(dtSeconds) : safeDecimal(0);
                    const targetH = edge.targetHandle || 'input-0';
                    if (rateVal.gt(0)) {
                        if (!incomingRates[targetH]) (incomingRates as any)[targetH] = [];
                        ((incomingRates as any)[targetH] as any[]).push({ res: rt, rate: rateVal.toString() });
                    }
                }
            }
        }
        const firstRt = Object.keys(totalRequestedByRt)[0] as ResourceType;
        const storageAcc = (globalStorageAcceptanceByRt[firstRt] || safeDecimal(1.0)).toNumber();
        const incomingAmt = incoming
            ? Object.values(incoming).reduce<Decimal>((sum, val) => sum.plus(safeDecimal(val)), safeDecimal(0))
            : safeDecimal(0);

        nodeDeltas[node.id] = {
            ...nodeDeltas[node.id],
            incomingRates,
            status: (storageAcc < 0.99 && incomingAmt.gt(0)) ? 'FULL' : 'active',
            debugInfo: `Acc:${storageAcc.toFixed(2)}`
        };

        // Handle Backpressures
        for (const edge of inEdges) {
            if (!edge.targetHandle) continue;
            let rt: ResourceType | null = null;
            const ratesData = incomingRates[edge.targetHandle];
            const srcNode = nodesById[edge.source];
            if (ratesData?.res) rt = ratesData.res as ResourceType;
            else {
                const flow = edgeFlows[edge.id];
                if (flow) rt = Object.keys(flow)[0] as ResourceType;
                else if (srcNode && srcNode.data?.resourceType) rt = srcNode.data.resourceType as ResourceType;
            }

            if (rt && globalAcceptanceByRt[rt]) {
                const acceptance = globalAcceptanceByRt[rt]!;
                edgeBackpressures[edge.id] = edgeBackpressures[edge.id]
                    ? Decimal.min(edgeBackpressures[edge.id], acceptance)
                    : acceptance;
            }
        }

        // Final Consumption Transfer
        if (incoming) {
            for (const [rtStr, amt] of Object.entries(incoming)) {
                const rt = rtStr as ResourceType;
                const decAmt = amt as Decimal;
                const storageAcceptance = globalStorageAcceptanceByRt[rt] || safeDecimal(1);

                // How much we actually save to cloud
                const acceptAmt = decAmt.times(storageAcceptance);

                // Add to cloud (limited by capacity)
                const cur = nextCloudStorageLocal[rt] || safeDecimal(0);
                nextCloudStorageLocal[rt] = Decimal.min(globalCloudCap, Decimal.max(0, cur.plus(acceptAmt)));

                // Track stats based on what we ACTUALLY stored (or requested? usually stats show throughput)
                // Let's show throughput in stats, but storage in cloudStats
                addCloudStat(ctx, 'production', rt, acceptAmt);
                addStat(ctx, 'consumption', rt, decAmt); // Factory consumed the full amount

                // VOID THE EXCESS: Clear 100% of incoming items from the machine intake
                if (nodeIncoming[node.id]) {
                    nodeIncoming[node.id][rt] = safeDecimal(0);
                }
            }
        }
    }
};
