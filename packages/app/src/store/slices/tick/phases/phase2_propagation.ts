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
                    const totalRatio = activeRatios.reduce((s, r) => s + r, 0);

                    if (totalRatio > 0) {
                        const remainder: Partial<Record<ResourceType, Decimal>> = {};
                        for (const [rt, amt] of Object.entries(incoming)) {
                            remainder[rt as ResourceType] = amt as Decimal;
                        }

                        for (let i = 0; i < ratios.length; i++) {
                            if (activeRatios[i] === 0) continue;

                            const fraction = ratios[i] / totalRatio;
                            const handleId = `output-${i}`;
                            const handleEdges = targetEdges.filter((e) => e.sourceHandle === handleId);
                            const handleEdgeCount = handleEdges.length;

                            if (handleEdgeCount > 0) {
                                for (const [rt, amt] of Object.entries(incoming)) {
                                    const portion = (amt as Decimal).times(fraction);
                                    let totalPushedHandle = pushToMultipleEdges(ctx, handleEdges, rt as ResourceType, portion);
                                    remainder[rt as ResourceType] = (remainder[rt as ResourceType] || new Decimal(0)).minus(totalPushedHandle);
                                }
                            }
                        }

                        // Pass 2: Overflow
                        for (const [rt, left] of Object.entries(remainder)) {
                            if ((left as Decimal).gt(0)) {
                                const activeHandleEdges: Edge[] = [];
                                for (let i = 0; i < ratios.length; i++) {
                                    if (activeRatios[i] === 0) continue;
                                    const handleEdges = targetEdges.filter((e) => e.sourceHandle === `output-${i}`);
                                    activeHandleEdges.push(...handleEdges);
                                }
                                if (activeHandleEdges.length > 0) {
                                    const overflowPushed = pushToMultipleEdges(ctx, activeHandleEdges, rt as ResourceType, left as Decimal);
                                    remainder[rt as ResourceType] = (left as Decimal).minus(overflowPushed);
                                }
                            }
                        }

                        nodeIncoming[node.id] = remainder;
                        didWork = true;
                    }
                }
            }
        }
        if (!didWork) break;
    }
};
