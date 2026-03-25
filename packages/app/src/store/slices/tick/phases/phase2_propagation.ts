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
                const incoming = nodeIncoming[node.id];
                if (incoming && Object.keys(incoming).length > 0) {
                    const ratios: number[] = node.data.ratios || [1, 1];
                    const targetEdges = outEdgesBySource[node.id] || [];

                    const activeRatios = ratios.map((r, i) => {
                        const handleEdges = targetEdges.filter((e) => e.sourceHandle === `output-${i}`);
                        return handleEdges.length > 0 ? r : 0;
                    });

                    let remainder: Partial<Record<ResourceType, Decimal>> = {};
                    for (const [rt, amt] of Object.entries(incoming)) {
                        remainder[rt as ResourceType] = amt as Decimal;
                    }

                    let isProcessingOverflow = true;
                    // Prevent infinite loops by capping precision passes
                    let preventInfiniteLoop = 0;

                    while (isProcessingOverflow && preventInfiniteLoop < 5) {
                        isProcessingOverflow = false;
                        preventInfiniteLoop++;

                        const totalRatio = activeRatios.reduce((s, r) => s + r, 0);
                        if (totalRatio === 0) break;

                        let nextRemainder: Partial<Record<ResourceType, Decimal>> = {};
                        for (const [rt, amt] of Object.entries(remainder)) {
                            nextRemainder[rt as ResourceType] = amt as Decimal;
                        }

                        for (let i = 0; i < ratios.length; i++) {
                            if (activeRatios[i] === 0) continue;

                            const fraction = ratios[i] / totalRatio;
                            const handleId = `output-${i}`;
                            const handleEdges = targetEdges.filter((e) => e.sourceHandle === handleId);

                            if (handleEdges.length > 0) {
                                let branchFilled = false;
                                for (const [rt, amt] of Object.entries(remainder)) {
                                    if ((amt as Decimal).lte(0)) continue;

                                    const portion = (amt as Decimal).times(fraction);
                                    let totalPushedHandle = pushToMultipleEdges(ctx, handleEdges, rt as ResourceType, portion);

                                    nextRemainder[rt as ResourceType] = (nextRemainder[rt as ResourceType] || new Decimal(0)).minus(totalPushedHandle);

                                    // If we failed to push the full portion, this branch is full/bottlenecked.
                                    // Remove it from the active pool to redirect its overflow to siblings.
                                    if (totalPushedHandle.lt(portion)) {
                                        branchFilled = true;
                                    }
                                }

                                if (branchFilled) {
                                    activeRatios[i] = 0;
                                    isProcessingOverflow = true;
                                }
                            }
                        }

                        remainder = nextRemainder;
                    }

                    nodeIncoming[node.id] = remainder;
                    if (preventInfiniteLoop > 1 || ratios.length > 0) {
                        didWork = true;
                    }
                }
            }
        }
        if (!didWork) break;
    }
};
