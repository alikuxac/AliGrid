import type { Edge, Node } from 'reactflow';
import { ResourceType, Decimal } from '@aligrid/engine';
import { TickContext } from '../types';
import { pushToEdge, pushToMultipleEdges, safeDecimal, smoothValue } from '../helpers';
import { NodeData } from '../../../types';

export const resolvePropagation = (ctx: TickContext) => {
    const { nextNodes, nodeIncoming, outEdgesBySource, dtSeconds } = ctx;
    const MAX_PASSES = 5;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let didWork = false;
        for (const node of nextNodes) {
            if (node.type === 'merger') {
                const incoming = nodeIncoming[node.id];
                if (incoming && Object.keys(incoming).length > 0) {
                    const targetEdges = outEdgesBySource[node.id] || [];
                    let totalIncomingTick = safeDecimal(0);
                    let totalPushedTick = safeDecimal(0);

                    // Pre-sum incoming for stats
                    for (const amt of Object.values(incoming)) {
                        totalIncomingTick = totalIncomingTick.plus(safeDecimal(amt));
                    }

                    for (const edge of targetEdges) {
                        for (const [rt, amt] of Object.entries(incoming)) {
                            const decimalAmt = safeDecimal(amt);
                            if (decimalAmt.lte(0)) continue;

                            const pushed = pushToEdge(ctx, edge, rt as ResourceType, decimalAmt);
                            totalPushedTick = totalPushedTick.plus(pushed);
                            if (nodeIncoming[node.id]![rt as ResourceType]) {
                                nodeIncoming[node.id]![rt as ResourceType] = (safeDecimal(incoming[rt as ResourceType])).minus(pushed);
                            }
                            if (pushed.gt(0)) didWork = true;
                        }
                    }

                    // Report rates to UI
                    const inS = dtSeconds > 0 ? totalIncomingTick.dividedBy(dtSeconds) : safeDecimal(0);
                    const outS = dtSeconds > 0 ? totalPushedTick.dividedBy(dtSeconds) : safeDecimal(0);
                    nodeDelta(ctx, node.id, {
                        actualInputPerSec: smoothValue(node.data.actualInputPerSec, inS, dtSeconds, 0.5),
                        actualOutputPerSec: smoothValue(node.data.actualOutputPerSec, outS, dtSeconds, 0.5),
                    });
                }
            }
            if (node.type === 'splitter') {
                const incoming = nodeIncoming[node.id] || {};
                const ratios: number[] = node.data.ratios || [1, 1];
                const targetEdges = outEdgesBySource[node.id] || [];
                const bufferObj = node.data.outputBuffer || {};
                const currentResTypes = new Set([...Object.keys(incoming), ...Object.keys(bufferObj)]);

                let totalIncomingTick = safeDecimal(0);
                let totalPushedTick = safeDecimal(0);

                for (const rt of currentResTypes) {
                    const resType = rt as ResourceType;
                    const incAmt = safeDecimal(incoming[resType] || 0);
                    const bufAmt = safeDecimal(bufferObj[resType] || 0);
                    totalIncomingTick = totalIncomingTick.plus(incAmt);

                    let availableTotal = incAmt.plus(bufAmt);
                    if (availableTotal.lte(0)) continue;

                    let remainingToDistribute = availableTotal;
                    const currentActiveRatios = ratios.map((r, i) => {
                        const handleEdges = targetEdges.filter((e) => e.sourceHandle === `output-${i}`);
                        return handleEdges.length > 0 ? r : 0;
                    });

                    // Sub-iteration for overflow redistribution
                    for (let subIter = 0; subIter < 3; subIter++) {
                        const totalActiveRatio = currentActiveRatios.reduce((s, r) => s + r, 0);
                        if (totalActiveRatio === 0 || remainingToDistribute.lte(0.001)) break;

                        let pushedInThisSubIter = safeDecimal(0);
                        const subIterStartResources = remainingToDistribute;

                        for (let i = 0; i < ratios.length; i++) {
                            if (currentActiveRatios[i] === 0) continue;

                            const fraction = ratios[i] / totalActiveRatio;
                            const handleId = `output-${i}`;
                            const handleEdges = targetEdges.filter((e) => e.sourceHandle === handleId);

                            if (handleEdges.length > 0) {
                                const portion = subIterStartResources.times(fraction);
                                if (portion.lte(0)) continue;

                                const pushed = pushToMultipleEdges(ctx, handleEdges, resType, portion);
                                remainingToDistribute = remainingToDistribute.minus(pushed);
                                pushedInThisSubIter = pushedInThisSubIter.plus(pushed);
                                totalPushedTick = totalPushedTick.plus(pushed);

                                if (pushed.lt(portion.times(0.99))) {
                                    currentActiveRatios[i] = 0;
                                }
                            }
                        }
                        if (pushedInThisSubIter.lte(0)) break;
                    }

                    bufferObj[resType] = remainingToDistribute.toString();
                    if (incoming[resType]) incoming[resType] = safeDecimal(0);
                    if (totalPushedTick.gt(0)) didWork = true;
                }

                // Report rates to UI
                const inS = dtSeconds > 0 ? totalIncomingTick.dividedBy(dtSeconds) : safeDecimal(0);
                const outS = dtSeconds > 0 ? totalPushedTick.dividedBy(dtSeconds) : safeDecimal(0);
                nodeDelta(ctx, node.id, {
                    actualInputPerSec: smoothValue(node.data.actualInputPerSec, inS, dtSeconds, 0.5),
                    actualOutputPerSec: smoothValue(node.data.actualOutputPerSec, outS, dtSeconds, 0.5),
                    outputBuffer: bufferObj,
                });

                delete nodeIncoming[node.id];
            }
        }
        if (!didWork) break;
    }
};

const nodeDelta = (ctx: TickContext, id: string, delta: Partial<NodeData>) => {
    if (!ctx.nodeDeltas) ctx.nodeDeltas = {};
    ctx.nodeDeltas[id] = { ...ctx.nodeDeltas[id], ...delta };
};
