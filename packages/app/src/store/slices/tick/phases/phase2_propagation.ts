import { Edge, Node } from 'reactflow';
import { ResourceType, Decimal } from '@aligrid/engine';
import { TickContext } from '../types';
import { pushToEdge, pushToMultipleEdges } from '../helpers';

export const resolvePropagation = (ctx: TickContext) => {
    const { nextNodes, nodeIncoming, outEdgesBySource } = ctx;
    const MAX_PASSES = 10;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let didWork = false;
        for (const node of nextNodes) {
            if (node.type === 'merger') {
                const incoming = nodeIncoming[node.id];
                if (incoming && Object.keys(incoming).length > 0) {
                    const targetEdges = outEdgesBySource[node.id] || [];
                    for (const edge of targetEdges) {
                        for (const [rt, amt] of Object.entries(incoming)) {
                            const pushed = pushToEdge(ctx, edge, rt as ResourceType, amt as Decimal);
                            if (nodeIncoming[node.id]![rt as ResourceType]) {
                                nodeIncoming[node.id]![rt as ResourceType] = (incoming[rt as ResourceType] as Decimal).minus(pushed);
                            }
                        }
                    }
                    didWork = true;
                }
            }
            if (node.type === 'splitter') {
                const incoming = nodeIncoming[node.id] || {};
                const ratios: number[] = node.data.ratios || [1, 1];
                const targetEdges = outEdgesBySource[node.id] || [];
                const bufferObj = node.data.outputBuffer || {};
                const currentResTypes = new Set([...Object.keys(incoming), ...Object.keys(bufferObj)]);

                for (const rt of currentResTypes) {
                    const resType = rt as ResourceType;
                    const incAmt = incoming[resType] || new Decimal(0);
                    const bufAmt = bufferObj[resType] ? new Decimal(bufferObj[resType]!) : new Decimal(0);

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

                        let pushedInThisSubIter = new Decimal(0);
                        const subIterStartResources = remainingToDistribute;

                        for (let i = 0; i < ratios.length; i++) {
                            if (currentActiveRatios[i] === 0) continue;

                            const fraction = ratios[i] / totalActiveRatio;
                            const handleId = `output-${i}`;
                            const handleEdges = targetEdges.filter((e) => e.sourceHandle === handleId);

                            if (handleEdges.length > 0) {
                                // Important: Portion is share of WHAT WE STARTED this sub-iteration with
                                const portion = subIterStartResources.times(fraction);
                                if (portion.lte(0)) continue;

                                const pushed = pushToMultipleEdges(ctx, handleEdges, resType, portion);
                                remainingToDistribute = remainingToDistribute.minus(pushed);
                                pushedInThisSubIter = pushedInThisSubIter.plus(pushed);

                                // If blocked, remove this output from subsequent redistributions in THIS tick
                                if (pushed.lt(portion.times(0.99))) {
                                    currentActiveRatios[i] = 0;
                                }
                            }
                        }

                        if (pushedInThisSubIter.lte(0)) break;
                    }

                    // Remaining amount stays in buffer for next tick
                    bufferObj[resType] = remainingToDistribute.toString();
                    if (incoming[resType]) incoming[resType] = new Decimal(0);
                    didWork = true;
                }
                node.data.outputBuffer = bufferObj;
                delete nodeIncoming[node.id];
            }
        }
        if (!didWork) break;
    }
};
