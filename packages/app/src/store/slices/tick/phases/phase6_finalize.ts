import type { Node, Edge } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { smoothValue, safeDecimal } from '../helpers';

export const finalizeNodesAndEdges = (ctx: TickContext) => {
    const { nextNodes, nodeIncoming, edgeFlows, edgeBackpressures, edgeBottlenecks, nodesById, edgesById, edgeTiers, totalDt, outEdgesBySource, globalProduction, globalConsumption, cloudProduction, cloudConsumption, nextCloudStorage } = ctx;

    const nextNodesMap: Record<string, Node<NodeData>> = {};
    nextNodes.forEach((n: Node<NodeData>) => nextNodesMap[n.id] = n);

    const finalNodeStats: Record<string, Partial<NodeData>> = {};
    const finalNodes = nextNodes.map((liveNode: Node<NodeData>) => {
        const ticked = nextNodesMap[liveNode.id];
        if (!ticked) return liveNode;

        let status = 'active';
        if (ticked.type === 'waterGenerator' || ticked.type === 'lavaPump') {
            status = 'active';
        } else if (ticked.type === 'ironGenerator' || ticked.type === 'copperGenerator' || ticked.type === 'coalGenerator') {
            const eff = ticked.data.efficiency ? safeDecimal(ticked.data.efficiency as any) : safeDecimal(1);
            status = eff.gte(0.99) ? 'active' : eff.gt(0) ? 'active' : 'warning';
        } else if (ticked.type && ['hydroGenerator', 'coalPlant', 'fluidGenerator'].includes(ticked.type)) {
            const out = ticked.data.actualOutputPerSec ? safeDecimal(ticked.data.actualOutputPerSec as any) : safeDecimal(0);
            status = out.gt(0) ? 'active' : 'idle';
        } else if (ticked.type === 'merger' || ticked.type === 'splitter' || ticked.type === 'antenna' || ticked.type === 'powerTransmitter') {
            const hasActivity = ctx.tickActivity?.[ticked.id];
            status = hasActivity ? 'active' : 'idle';
        }

        const delta = ctx.nodeDeltas?.[liveNode.id] || {};

        // 1. Resolve Input Buffer (Original machine buffer + incoming items from edges)
        const combinedInputBuffer: Record<string, string> = {};
        const baseInputBuffer = ticked.data.inputBuffer as Record<string, string | number | Decimal> || {};
        for (const [rt, amt] of Object.entries(baseInputBuffer)) {
            combinedInputBuffer[rt] = safeDecimal(amt as any).toString();
        }

        const incomingItems = nodeIncoming[ticked.id];
        if (incomingItems) {
            for (const [rt, amt] of Object.entries(incomingItems)) {
                if (amt && (amt as Decimal).gt(0)) {
                    const currentAmount = combinedInputBuffer[rt] ? safeDecimal(combinedInputBuffer[rt]) : safeDecimal(0);
                    combinedInputBuffer[rt] = currentAmount.plus(amt as Decimal).toString();
                }
            }
        }

        // 2. Resolve Output Buffer (Merge deltas from phases)
        const combinedOutputBuffer: Record<string, string> = {};
        const baseOutputBuffer = ticked.data.outputBuffer as Record<string, string | number | Decimal> || {};
        for (const [rt, amt] of Object.entries(baseOutputBuffer)) {
            combinedOutputBuffer[rt] = safeDecimal(amt as any).toString();
        }
        if (delta.outputBuffer) {
            for (const [rt, amt] of Object.entries(delta.outputBuffer)) {
                if (amt !== undefined) combinedOutputBuffer[rt] = safeDecimal(amt as any).toString();
            }
        }

        // 2.5 Resolve Handle Flows (Telemetry for UI)
        const handleFlows: Record<string, string> = {};
        const handleResourceTypes: Record<string, string> = {};

        // Accumulate tick totals from context
        const rawAmounts: Record<string, Decimal> = {};
        const rawResourceTypes: Record<string, string> = {};

        const gatherFlows = (edges: any[], isIncoming: boolean) => {
            edges.forEach(edge => {
                let handleId = isIncoming ? (edge.targetHandle || 'target') : (edge.sourceHandle || 'output');
                if (liveNode.type === 'antenna' && isIncoming && !handleId.startsWith('input-')) {
                    handleId = 'input-0';
                }

                const flow = ctx.tickTotalFlows?.[edge.id];
                if (flow) {
                    Object.entries(flow).forEach(([rt, amt]) => {
                        const decAmt = amt as Decimal;
                        if (decAmt.eq(0)) return;

                        rawAmounts[handleId] = (rawAmounts[handleId] || safeDecimal(0)).plus(decAmt);
                        rawResourceTypes[handleId] = rt; // Take last non-zero for discovery
                    });
                }
            });
        };

        gatherFlows(ctx.inEdgesByTarget[liveNode.id] || [], true);
        gatherFlows(ctx.outEdgesBySource[liveNode.id] || [], false);

        // Convert accumulated amounts to rates and smooth them
        Object.keys(rawAmounts).forEach(handleId => {
            const totalAmt = rawAmounts[handleId];
            const rate = totalDt > 0 ? totalAmt.dividedBy(totalDt) : totalAmt;

            // Get previous rate for smoothing
            const prevRateStr = ticked.data.handleFlows?.[handleId];
            const prevRate = prevRateStr ? safeDecimal(prevRateStr) : safeDecimal(0);

            const smoothed = smoothValue(prevRate, rate, totalDt, 0.5);
            handleFlows[handleId] = smoothed.toString();
            handleResourceTypes[handleId] = rawResourceTypes[handleId];
        });

        // 3. Prepare Node Stats for UI (STRICT SERIALIZATION for Worker safety)
        const normalizeBuffer = (buf: any, isRateValue: boolean = false) => {
            if (!buf || typeof buf !== 'object') return {};
            const out: Record<string, string> = {};
            Object.entries(buf).forEach(([k, v]) => {
                const dec = safeDecimal(v);
                // If it's a rate tracker (like inputRates), divide by TOTAL tick duration
                const val = (isRateValue && totalDt > 0) ? dec.dividedBy(totalDt) : dec;
                out[k] = val.toString();
            });
            return out;
        };

        const stringify = (val: any) => {
            if (val === undefined || val === null) return undefined;
            return safeDecimal(val).toString();
        };

        finalNodeStats[liveNode.id] = {
            ...ticked.data,
            ...delta,
            status,
            boost: delta.boost || ticked.data.boost || 1,
            boostedCount: delta.boostedCount !== undefined ? delta.boostedCount : ticked.data.boostedCount,
            inputBuffer: combinedInputBuffer,
            outputBuffer: combinedOutputBuffer,
            handleFlows,
            handleResourceTypes,
            // Ensure metrics are strings
            actualInputPerSec: stringify(delta.actualInputPerSec ?? ticked.data.actualInputPerSec),
            actualOutputPerSec: stringify(delta.actualOutputPerSec ?? ticked.data.actualOutputPerSec),
            efficiency: stringify(delta.efficiency ?? ticked.data.efficiency),
            inputEfficiency: stringify(delta.inputEfficiency ?? ticked.data.inputEfficiency),
            wirelessEfficiency: stringify(delta.wirelessEfficiency ?? ticked.data.wirelessEfficiency),
            gridSupply: stringify(delta.gridSupply ?? ticked.data.gridSupply),
            gridDemand: stringify(delta.gridDemand ?? ticked.data.gridDemand),
            maxBuffer: stringify(delta.maxBuffer ?? ticked.data.maxBuffer),
            inputRates: normalizeBuffer(ctx.tickTotalInputRates?.[liveNode.id] || {}, true),
        };

        // 4. Update Main Node Object (Persistent State)
        const nextData = {
            ...liveNode.data,
            ...delta,
            status,
            inputBuffer: combinedInputBuffer,
            outputBuffer: combinedOutputBuffer,
            actualInputPerSec: finalNodeStats[liveNode.id].actualInputPerSec,
            actualOutputPerSec: finalNodeStats[liveNode.id].actualOutputPerSec,
            efficiency: finalNodeStats[liveNode.id].efficiency,
            inputEfficiency: finalNodeStats[liveNode.id].inputEfficiency,
            wirelessEfficiency: finalNodeStats[liveNode.id].wirelessEfficiency,
            gridSupply: finalNodeStats[liveNode.id].gridSupply,
            gridDemand: finalNodeStats[liveNode.id].gridDemand,
            boost: finalNodeStats[liveNode.id].boost,
            boostedCount: finalNodeStats[liveNode.id].boostedCount,
            inputRates: finalNodeStats[liveNode.id].inputRates,
            handleFlows,
            handleResourceTypes,
        };

        // Update nodesById map so edge loop below sees the NEW status/data
        nodesById[liveNode.id].data = nextData;

        return {
            ...liveNode,
            data: nextData
        };
    });

    const powerEdges = Object.values(edgesById).filter((e: Edge) => e.type === 'power' || e.data?.resourceType === 'electricity');
    if (!ctx.edgeResourceTypes) ctx.edgeResourceTypes = {};
    const edgeResourceTypes = ctx.edgeResourceTypes;
    powerEdges.forEach(e => {
        edgeResourceTypes[e.id] = 'electricity';
    });

    const finalEdges = Object.values(edgesById).map((e: Edge) => {
        const flow = ctx.tickTotalFlows?.[e.id];
        const resourceId = ctx.edgeResourceTypes?.[e.id] || (e.data as any)?.resourceType;

        // Resolve matter type from item registry
        let matter: 'solid' | 'liquid' | 'gas' | 'power' = 'solid';
        if (resourceId === 'electricity') {
            matter = 'power';
        } else if (resourceId) {
            const item = ctx.itemRegistry?.[resourceId];
            if (item?.type) matter = item.type.toLowerCase() as any;
        }

        const globalTier = edgeTiers[matter] || 0;
        const edgeTier = e.data?.tier || 0;
        const tier = Math.max(edgeTier, globalTier);

        if (e.id.includes('accumulator') || (e.data as any)?.resourceType === 'electricity') {
            // console.log(`[TierDebug] Edge:${e.id} RT:${resourceId} Mat:${matter} GT:${globalTier} ET:${edgeTier} Final:${tier}`);
        }

        const bp = ctx.edgeBackpressures[e.id] || safeDecimal(0);
        const isBottleneck = ctx.edgeBottlenecks[e.id] || false;

        const duration = matter === 'power' ? 0.05 : matter === 'gas' ? 0.4 : matter === 'liquid' ? 0.8 : 1.2;
        const edgeType = matter === 'power' ? 'power' : (e.type === 'power' ? 'power' : 'fluid');
        const className = matter === 'power' ? 'edge-power' :
            matter === 'gas' ? 'edge-gas' :
                matter === 'liquid' ? 'edge-liquid' : 'edge-solid';

        const rawFlow = flow ? Object.values(flow).reduce((acc: Decimal, v: Decimal | undefined) => (v ? acc.plus(v) : acc), safeDecimal(0)) : safeDecimal(0);
        const actualFlowRate = (rawFlow.gt(0) && totalDt > 0) ? rawFlow.dividedBy(totalDt) : rawFlow;

        let capPerSecValue = 60 * Math.pow(2, tier);
        if (matter === 'power') {
            capPerSecValue *= 100;
        }

        const finalData = {
            ...e.data,
            tier,
            capacity: capPerSecValue.toString(),
            actualFlow: actualFlowRate.toString(),
            isBottleneck,
            isOverloaded: e.data?.isOverloaded || false,
            isTripped: e.data?.isTripped || false,
        };

        return {
            ...e,
            type: edgeType,
            className,
            duration,
            data: finalData,
            bp
        };
    });

    const finalEdgeStats: Record<string, any> = {};
    finalEdges.forEach((e: any) => {
        finalEdgeStats[e.id] = {
            actualFlow: e.data.actualFlow,
            capacity: e.data.capacity,
            isBottleneck: e.data.isBottleneck,
            isOverloaded: e.data.isOverloaded,
            isTripped: e.data.isTripped,
            backpressureRate: e.bp.toString(),
            duration: e.duration,
            className: e.className,
            tier: e.data.tier
        };
    });

    const finalProd: Record<string, string> = {};
    const finalCons: Record<string, string> = {};
    const finalCloudProd: Record<string, string> = {};
    const finalCloudCons: Record<string, string> = {};

    for (const [rt, v] of Object.entries(globalProduction)) {
        if (v && totalDt > 0) finalProd[rt] = (v as Decimal).dividedBy(totalDt).toString();
    }
    for (const [rt, v] of Object.entries(globalConsumption)) {
        if (v && totalDt > 0) finalCons[rt] = (v as Decimal).dividedBy(totalDt).toString();
    }
    for (const [rt, v] of Object.entries(cloudProduction)) {
        if (v && totalDt > 0) finalCloudProd[rt] = (v as Decimal).dividedBy(totalDt).toString();
    }
    for (const [rt, v] of Object.entries(cloudConsumption)) {
        if (v && totalDt > 0) finalCloudCons[rt] = (v as Decimal).dividedBy(totalDt).toString();
    }

    const serializableCloudStorage: Record<string, string> = {};
    for (const [rt, v] of Object.entries(nextCloudStorage)) {
        serializableCloudStorage[rt] = safeDecimal(v).toString();
    }

    return {
        finalNodes,
        finalEdges,
        finalProd,
        finalCons,
        finalCloudProd,
        finalCloudCons,
        finalNodeStats,
        finalEdgeStats,
        nextCloudStorage: serializableCloudStorage
    };
};
