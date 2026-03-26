import { Node } from 'reactflow';
import { Decimal, ResourceType, RESOURCE_REGISTRY } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { addCloudStat } from '../helpers';

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
                    totalRequestedByRt[rt] = (totalRequestedByRt[rt] || new Decimal(0)).plus(amt as Decimal);
                }
            }
        }
    }

    // 2. Calculate Global Acceptance Factors per ResourceType
    const globalAcceptanceByRt: Partial<Record<ResourceType, Decimal>> = {};
    const cloudLevel = get().cloudLevel || 1;
    const globalCloudCap = new Decimal(5000).times(Math.pow(2, cloudLevel - 1));

    for (const rtStr of Object.keys(totalRequestedByRt)) {
        const rt = rtStr as ResourceType;
        const totalReq = totalRequestedByRt[rt] || new Decimal(0);
        const curAmt = nextCloudStorageLocal[rt] || new Decimal(0);
        const space = Decimal.max(0, globalCloudCap.minus(curAmt));

        if (totalReq.gt(0)) {
            // Formula: min(1.0, remainingSpace / totalRequested)
            // No safety factors like +1 here to ensure 100% throughput saturation
            globalAcceptanceByRt[rt] = Decimal.min(new Decimal(1), space.dividedBy(totalReq));
        } else {
            globalAcceptanceByRt[rt] = new Decimal(1);
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
                    const rateVal = dtSeconds > 0 ? (amt as Decimal).dividedBy(dtSeconds) : new Decimal(0);
                    const targetH = edge.targetHandle || 'input-0';
                    if (rateVal.gt(0)) {
                        incomingRates[targetH] = { res: rt, rate: rateVal.toString() };
                    }
                }
            }
        }
        nodeDeltas[node.id] = { ...nodeDeltas[node.id], incomingRates };

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
                const acceptance = globalAcceptanceByRt[rt] || new Decimal(1);

                const acceptAmt = decAmt.times(acceptance);
                if (acceptAmt.gt(0)) {
                    const cur = nextCloudStorageLocal[rt] || new Decimal(0);
                    nextCloudStorageLocal[rt] = cur.plus(acceptAmt);
                    addCloudStat(ctx, 'production', rt, acceptAmt);

                    // Remove from nodeIncoming so subsequent phases don't double-process 
                    // (although antenna is usually at the end of the chain)
                    nodeIncoming[node.id]![rt] = Decimal.max(0, decAmt.minus(acceptAmt));
                }
            }
        }
    }
};
