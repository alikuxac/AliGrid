import { Node, Edge } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { RESOURCE_STATES } from '../../../constants';
import { smoothValue } from '../helpers';

export const finalizeNodesAndEdges = (ctx: TickContext) => {
    const { nextNodes, nodeIncoming, edgeFlows, edgeBackpressures, edgeBottlenecks, nodesById, state, dtSeconds, outEdgesBySource, globalProduction, globalConsumption, cloudProduction, cloudConsumption } = ctx;

    const nextNodesMap: Record<string, Node<NodeData>> = {};
    nextNodes.forEach((n: Node<NodeData>) => nextNodesMap[n.id] = n);

    const finalNodeStats: Record<string, Partial<NodeData>> = {};
    const finalNodes = state.nodes.map((liveNode: Node<NodeData>) => {
        const ticked = nextNodesMap[liveNode.id];
        if (!ticked) return liveNode;

        let status = 'active';
        if (ticked.type === 'waterGenerator' || ticked.type === 'lavaPump') {
            status = 'active';
        } else if (ticked.type === 'ironGenerator' || ticked.type === 'copperGenerator' || ticked.type === 'coalGenerator') {
            const eff = ticked.data.efficiency ? new Decimal(ticked.data.efficiency as any) : new Decimal(1);
            status = eff.gte(0.99) ? 'active' : eff.gt(0) ? 'active' : 'warning';
        } else if (ticked.type && ['hydroGenerator', 'coalPlant', 'fluidGenerator'].includes(ticked.type)) {
            const out = ticked.data.actualOutputPerSec ? new Decimal(ticked.data.actualOutputPerSec as any) : new Decimal(0);
            status = out.gt(0) ? 'active' : 'idle';
        } else if (ticked.type === 'merger' || ticked.type === 'splitter' || ticked.type === 'antenna' || ticked.type === 'powerTransmitter') {
            const inc = nodeIncoming[ticked.id];
            const hasFlow = inc && Object.keys(inc).some(k => (inc[k as ResourceType] as Decimal).gt(0));
            status = hasFlow ? 'active' : 'idle';
        }

        const delta = ctx.nodeDeltas?.[liveNode.id] || {};

        // 1. Resolve Input Buffer (Original machine buffer + incoming items from edges)
        const combinedInputBuffer: Record<string, string> = {};
        const baseInputBuffer = ticked.data.inputBuffer as Record<string, string | number | Decimal> || {};
        for (const [rt, amt] of Object.entries(baseInputBuffer)) {
            combinedInputBuffer[rt] = new Decimal(amt as any).toString();
        }

        const incomingItems = nodeIncoming[ticked.id];
        if (incomingItems) {
            for (const [rt, amt] of Object.entries(incomingItems)) {
                if (amt && (amt as Decimal).gt(0)) {
                    const currentAmount = combinedInputBuffer[rt] ? new Decimal(combinedInputBuffer[rt]) : new Decimal(0);
                    combinedInputBuffer[rt] = currentAmount.plus(amt as Decimal).toString();
                }
            }
        }

        // 2. Resolve Output Buffer (Merge deltas from phases)
        const combinedOutputBuffer: Record<string, string> = {};
        const baseOutputBuffer = ticked.data.outputBuffer as Record<string, string | number | Decimal> || {};
        for (const [rt, amt] of Object.entries(baseOutputBuffer)) {
            combinedOutputBuffer[rt] = new Decimal(amt as any).toString();
        }
        if (delta.outputBuffer) {
            for (const [rt, amt] of Object.entries(delta.outputBuffer)) {
                if (amt !== undefined) combinedOutputBuffer[rt] = new Decimal(amt as any).toString();
            }
        }

        const handleFlows: Record<string, string> = {};
        const handleResourceTypes: Record<string, string> = {};
        const incomingEdges = ctx.inEdgesByTarget[liveNode.id] || [];

        incomingEdges.forEach(edge => {
            let handleId = edge.targetHandle || 'target';
            if (liveNode.type === 'antenna' && !handleId.startsWith('input-')) {
                handleId = 'input-0'; // Default to first line for Uploaders if generic
            }
            const flow = ctx.edgeFlows[edge.id];
            if (flow) {
                // Sum all resource flows into this handle
                let total = new Decimal(handleFlows[handleId] || 0);
                let dominantRt = handleResourceTypes[handleId] || '';
                let maxAmt = new Decimal(-1);

                Object.entries(flow).forEach(([rt, amt]) => {
                    const decAmt = amt as Decimal;
                    total = total.plus(decAmt);
                    if (decAmt.gt(maxAmt)) {
                        maxAmt = decAmt;
                        dominantRt = rt;
                    }
                });

                if (ctx.dtSeconds > 0) total = total.dividedBy(ctx.dtSeconds);
                handleFlows[handleId] = total.toString();
                if (dominantRt) handleResourceTypes[handleId] = dominantRt;
            }
        });

        // 3. Prepare Node Stats for UI
        finalNodeStats[liveNode.id] = {
            ...ticked.data,
            ...delta,
            status,
            boost: delta.boost || ticked.data.boost || 1,
            boostedCount: delta.boostedCount !== undefined ? delta.boostedCount : ticked.data.boostedCount,
            inputBuffer: combinedInputBuffer,
            outputBuffer: combinedOutputBuffer,
            handleFlows,
            handleResourceTypes
        };

        // 4. Update Main Node Object (Persistent State)
        // We sync critical metrics back to the node so they are available in next tick's Phase 0 (Power/Amplifier)
        const nextData = {
            ...liveNode.data,
            status,
            inputBuffer: combinedInputBuffer,
            outputBuffer: combinedOutputBuffer,

            // Sync smoothed metrics
            actualInputPerSec: delta.actualInputPerSec !== undefined ? delta.actualInputPerSec.toString() : liveNode.data.actualInputPerSec,
            actualOutputPerSec: delta.actualOutputPerSec !== undefined ? delta.actualOutputPerSec.toString() : liveNode.data.actualOutputPerSec,
            efficiency: delta.efficiency !== undefined ? delta.efficiency.toString() : liveNode.data.efficiency,

            // Sync power metrics for resolvePowerGrid
            inputEfficiency: delta.inputEfficiency !== undefined ? delta.inputEfficiency.toString() : liveNode.data.inputEfficiency,
            productionEfficiency: delta.productionEfficiency !== undefined ? delta.productionEfficiency.toString() : liveNode.data.productionEfficiency,
            wirelessEfficiency: ticked.data.wirelessEfficiency !== undefined ? ticked.data.wirelessEfficiency.toString() : liveNode.data.wirelessEfficiency,
            gridSupply: ticked.data.gridSupply !== undefined ? ticked.data.gridSupply.toString() : liveNode.data.gridSupply,
            gridDemand: ticked.data.gridDemand !== undefined ? ticked.data.gridDemand.toString() : liveNode.data.gridDemand,

            // Other persistent deltas
            buffer: delta.buffer || ticked.data.buffer || liveNode.data.buffer,
            boost: delta.boost || ticked.data.boost || liveNode.data.boost || 1,
            boostedCount: delta.boostedCount !== undefined ? delta.boostedCount : (ticked.data.boostedCount !== undefined ? ticked.data.boostedCount : liveNode.data.boostedCount),
            currentAmount: delta.currentAmount !== undefined ? delta.currentAmount.toString() : (ticked.data.currentAmount ? ticked.data.currentAmount.toString() : liveNode.data.currentAmount),
            activeRecipeIndex: delta.activeRecipeIndex !== undefined ? delta.activeRecipeIndex : liveNode.data.activeRecipeIndex,
        };

        // Determine if we truly need to create a new object (performance)
        // Note: Decimal objects in nextData will be serialized to strings by JSON.stringify
        const isDirty = JSON.stringify(liveNode.data) !== JSON.stringify(nextData) || liveNode.type !== ticked.type;

        if (isDirty) {
            return {
                ...liveNode,
                data: nextData
            };
        }

        return liveNode;
    });

    const finalEdges = state.edges.map((e: Edge) => {
        // ... (existing edge logic)
        const flow = edgeFlows[e.id];
        const instantBp = edgeBackpressures[e.id] || new Decimal(1);

        // Smooth the backpressure feedback to prevent machine pulsation (binary toggling 1 <-> 0)
        const lastBpStr = e.data?.backpressureRate || '1';
        const bp = smoothValue(lastBpStr, instantBp, ctx.dtSeconds, 1.0); // Slow tau for backpressure stability

        const isBottleneck = edgeBottlenecks[e.id] || false;
        const isTripped = e.data?.isTripped || false;
        const data = { ...e.data, backpressureRate: bp.toString(), flow: '0', isBottleneck, isTripped };

        let dominantRt = 'water';
        let hasFlow = false;
        const srcNode = nodesById[e.source];
        const srcType = (srcNode?.type || '').toLowerCase();
        const srcCat = (srcNode?.data?.category || '').toLowerCase();
        const isContinuous = (srcType.includes('generator') || srcType === 'downloader' || srcType === 'powerreceiver') &&
            !srcType.includes('splitter') && !srcType.includes('merger') &&
            srcCat !== 'splitter' && srcCat !== 'merger';

        const status = srcNode?.data?.status || 'idle';
        const rate = srcNode?.data?.actualOutputPerSec !== undefined ? srcNode.data.actualOutputPerSec : srcNode?.data?.outputRate;
        if (isContinuous && rate && status === 'active') {
            hasFlow = true;
            let flowVal = new Decimal(rate as any);
            const edges = outEdgesBySource[e.source] || [];
            const uniqueTargetEdges = edges.filter((ed, index, self) =>
                index === self.findIndex((t) => t.target === ed.target && t.targetHandle === ed.targetHandle)
            );
            const outEdgesCount = uniqueTargetEdges.length;
            if (outEdgesCount > 1) {
                // Check if this specific edge has flow in the logic
                const actualMove = edgeFlows[e.id];
                const hasActualFlow = actualMove && Object.values(actualMove).some(v => (v as Decimal).gt(0));

                if (!hasActualFlow) {
                    flowVal = new Decimal(0);
                    hasFlow = false;
                } else {
                    // It has flow, try to distribute the total rate among ACTIVE wires.
                    // This ensures the sum of wire rates matches the machine's reported output.
                    const activeEdgesCount = uniqueTargetEdges.filter(ed => {
                        const move = edgeFlows[ed.id];
                        return move && Object.values(move).some(v => (v as Decimal).gt(0));
                    }).length;

                    flowVal = flowVal.dividedBy(Math.max(1, activeEdgesCount));
                }
            }

            // CLAMP by edge capacity
            dominantRt = srcNode.data.resourceType || 'water';
            if (['hydroGenerator', 'powerTransmitter', 'powerReceiver', 'powerPole', 'accumulator'].includes(srcNode?.type || '')) dominantRt = 'electricity';

            const material = RESOURCE_STATES[dominantRt] || 'solid';
            const edgeTier = e.data?.tier ?? 0;
            const globalTier = state.edgeTiers[material] || 0;
            const tier = Math.max(edgeTier, globalTier);
            const edgeCap = new Decimal(60 * Math.pow(2, tier));

            // Aggressive snapping for UI stability
            if (isBottleneck || flowVal.gte(edgeCap.times(0.98))) {
                flowVal = edgeCap;
            } else if (flowVal.gt(edgeCap)) {
                flowVal = edgeCap;
            }

            // Smooth the final display value
            const lastFlowStr = e.data?.flow || '0';
            flowVal = smoothValue(lastFlowStr, flowVal, ctx.dtSeconds, 1.0); // High stability

            data.flow = flowVal.toString();
        } else if (flow && Object.keys(flow).length > 0) {
            let total = new Decimal(0);
            Object.entries(flow).forEach(([rt, amt]) => {
                total = total.plus(amt as Decimal);
                dominantRt = rt;
            });
            hasFlow = true;
            let flowVal = ctx.dtSeconds > 0 ? total.dividedBy(ctx.dtSeconds) : new Decimal(0);

            const lastFlowStr = e.data?.flow || '0';
            flowVal = smoothValue(lastFlowStr, flowVal, ctx.dtSeconds, 0.8);

            const material = RESOURCE_STATES[dominantRt] || 'solid';
            const edgeTier = e.data?.tier ?? 0;
            const globalTier = state.edgeTiers[material] || 0;
            const tier = Math.max(edgeTier, globalTier);
            const edgeCap = new Decimal(60 * Math.pow(2, tier));

            if (isBottleneck || flowVal.gte(edgeCap.times(0.98))) {
                flowVal = edgeCap;
            } else if (flowVal.gt(edgeCap)) {
                flowVal = edgeCap;
            }
            data.flow = flowVal.toString();
        } else {
            dominantRt = srcNode?.data?.resourceType || 'water';
            if (['hydroGenerator', 'powerTransmitter', 'powerReceiver', 'powerPole', 'accumulator'].includes(srcNode?.type || '')) dominantRt = 'electricity';
        }

        const isPowerEdge = e.type === 'power' || (e.data as any)?.resourceType === 'electricity';
        if (isPowerEdge) {
            dominantRt = 'electricity';
        }

        (data as any).resourceType = dominantRt;

        const matter = RESOURCE_STATES[dominantRt] || 'solid';
        const isFlowing = hasFlow;
        const edgeType = (e.type === 'power' || dominantRt === 'electricity') ? 'power' : 'fluid';

        let className = `edge-${matter}`;
        if (isTripped) {
            className += ' edge-tripped';
        } else if (isFlowing) {
            className += ` edge-flowing-${matter}`;
        }

        // Low flow opacity handling
        if (!isFlowing || (data.flow && parseFloat(data.flow) < 1)) {
            className += ' edge-low-flow';
        }

        const finalData = { ...data, tier: Math.max(e.data?.tier ?? 0, state.edgeTiers[matter] || 0) };

        return {
            ...e,
            type: edgeType,
            className,
            animated: false,
            style: {
                strokeWidth: isTripped ? 3 : (bp.eq(1) ? 2.5 : 2),
            },
            data: finalData
        };
    });

    const finalProd: Partial<Record<ResourceType, Decimal>> = {};
    const finalCons: Partial<Record<ResourceType, Decimal>> = {};
    const finalCloudProd: Partial<Record<ResourceType, Decimal>> = {};
    const finalCloudCons: Partial<Record<ResourceType, Decimal>> = {};

    for (const [rt, v] of Object.entries(globalProduction)) {
        if (v && dtSeconds > 0) finalProd[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }
    for (const [rt, v] of Object.entries(globalConsumption)) {
        if (v && dtSeconds > 0) finalCons[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }
    for (const [rt, v] of Object.entries(cloudProduction)) {
        if (v && dtSeconds > 0) finalCloudProd[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }
    for (const [rt, v] of Object.entries(cloudConsumption)) {
        if (v && dtSeconds > 0) finalCloudCons[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }

    return { finalNodes, finalEdges, finalProd, finalCons, finalCloudProd, finalCloudCons, finalNodeStats };
};
