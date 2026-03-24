import { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { RFState, NodeData } from '../types';
import { NodeTemplate } from '@aligrid/schema';
import { FALLBACK_NODES } from '../../config/fallbackNodes';

import {
    TickContext,
    resolvePowerGrid,
    updateGenerators,
    resolvePropagation,
    updateProcessorsAndAssemblers,
    updateStorages,
    updateAntennas,
    finalizeNodesAndEdges
} from './tick';
import { getAbsPosition } from './tick/helpers';

export const createTickSlice = (set: (fn: (state: RFState) => Partial<RFState>) => void, get: () => RFState) => ({
    globalStats: { production: {}, consumption: {} },

    tick: (dtSeconds: number) => {
        set((state: RFState) => {
            let nextNodes = state.nodes.map((n: Node<NodeData>) => ({ ...n, data: { ...(n.data || {}) } }));
            const edges = state.edges;

            // ═══ Index Optimization for Scaling ═══
            const outEdgesBySource: Record<string, Edge[]> = {};
            const inEdgesByTarget: Record<string, Edge[]> = {};
            const edgesById: Record<string, Edge> = {};
            const nodesById: Record<string, Node<NodeData>> = {};

            // 1. Map nodes first so we can validate edge targets
            nextNodes.forEach((node: Node<NodeData>) => {
                nodesById[node.id] = node;
            });

            // 2. Map edges, skipping ghost edges
            edges.forEach((e: Edge) => {
                if (!nodesById[e.source] || !nodesById[e.target]) return;

                edgesById[e.id] = e;
                if (!outEdgesBySource[e.source]) outEdgesBySource[e.source] = [];
                outEdgesBySource[e.source].push(e);

                if (!inEdgesByTarget[e.target]) inEdgesByTarget[e.target] = [];
                inEdgesByTarget[e.target].push(e);
            });

            const nodeIncoming: Record<string, Partial<Record<ResourceType, Decimal>>> = {};

            nextNodes.forEach((node: Node<NodeData>) => {

                const template = state.nodeTemplates.find((t: NodeTemplate) => t.id === node.type) || FALLBACK_NODES.find((t: any) => t.id === node.type);
                if (template) {
                    node.data.category = template.category;
                    if (template.resource_type) {
                        node.data.resourceType = template.resource_type as string;
                    }
                    if (!node.data.outputRate) {
                        const initialRate = template.initial_rate ? new Decimal(template.initial_rate) : new Decimal(1);
                        const level = node.data.level || 0;
                        node.data.outputRate = initialRate.times(Math.pow(2, level)).round().toNumber();
                    }
                    if (template.power_demand) {
                        const level = node.data.level || 0;
                        node.data.powerConsumption = new Decimal(template.power_demand).times(Math.pow(1.5, level)).toString();
                    }
                    if (node.type === 'accumulator') {
                        const level = node.data.level || 0;
                        const baseMax = new Decimal((template as any).maxBuffer || 5000);
                        node.data.maxBuffer = baseMax.times(Math.pow(2, level)).toString();
                    }
                }

                if (node.data?.outputRate) {
                    node.data.outputRate = new Decimal(node.data.outputRate).round().toNumber();
                }
                if (node.data?.outputBuffer) {
                    if (typeof node.data.outputBuffer === 'string') {
                        node.data.outputBuffer = { [node.data.resourceType || 'unknown']: node.data.outputBuffer };
                    }
                }
                if (node.data?.inputBuffer) {
                    for (const [rt, amt] of Object.entries(node.data.inputBuffer)) {
                        if (!nodeIncoming[node.id]) nodeIncoming[node.id] = {};
                        nodeIncoming[node.id]![rt as ResourceType] = new Decimal(amt as string);
                    }
                }
                if (node.data?.currentAmount) {
                    node.data.currentAmount = new Decimal(node.data.currentAmount);
                }
            });

            const edgeFlows: Record<string, Partial<Record<ResourceType, Decimal>>> = {};
            let nextCloudStorage = { ...state.cloudStorage } as Record<string, Decimal>;

            const globalProduction: Partial<Record<ResourceType, Decimal>> = {};
            const globalConsumption: Partial<Record<ResourceType, Decimal>> = {};
            const cloudProduction: Partial<Record<ResourceType, Decimal>> = {};
            const cloudConsumption: Partial<Record<ResourceType, Decimal>> = {};

            const edgeBackpressures: Record<string, Decimal> = {};
            const edgeBottlenecks: Record<string, boolean> = {};

            const ctx: TickContext = {
                dtSeconds,
                state,
                get,
                nodesById,
                edgesById,
                outEdgesBySource,
                inEdgesByTarget,
                nodeIncoming,
                edgeFlows,
                edgeBackpressures,
                edgeBottlenecks,
                globalProduction,
                globalConsumption,
                cloudProduction,
                cloudConsumption,
                nextCloudStorage,
                nextNodes
            };

            // ═══ Phase 0: Power Grid Resolution ═══
            resolvePowerGrid(ctx);

            // --- Phase 0.5: Amplifier (Overclockers) ---
            const nodeBoosts: Record<string, number> = {};
            const amplifiers = ctx.nextNodes.filter(n => n.type === 'amplifier' && !n.data?.isOff);
            const poweredAmps = amplifiers.filter(n => {
                const eff = n.data?.wirelessEfficiency ? new Decimal(n.data.wirelessEfficiency) : new Decimal(0);
                return eff.gte(0.99);
            });

            poweredAmps.forEach((amp) => {
                const template = amp.data?.template || state.nodeTemplates.find((t: any) => t.id === amp.type) || FALLBACK_NODES.find((f: any) => f.id === amp.type);
                const baseRad = Number((template as any)?.radius || 150);
                const lv = amp.data?.level || 0;
                const radius = baseRad + (lv * 25);

                const ampPos = getAbsPosition(ctx, amp);
                ctx.nextNodes.forEach((node) => {
                    if (node.id === amp.id) return;
                    if (node.type && ['powerTransmitter', 'powerReceiver', 'powerPole', 'accumulator'].includes(node.type)) return;

                    const nodePos = getAbsPosition(ctx, node);
                    const dist = Math.hypot(ampPos.x - nodePos.x, ampPos.y - nodePos.y);
                    if (dist <= radius) {
                        nodeBoosts[node.id] = (nodeBoosts[node.id] || 1) + 1;
                    }
                });
            });
            ctx.nodeBoosts = nodeBoosts;

            // ═══ Phase 1: Generators ═══
            updateGenerators(ctx);

            // ═══ Phase 3: Processors & Assemblers ═══
            updateProcessorsAndAssemblers(ctx);

            // ═══ Phase 2: Propagation ═══
            resolvePropagation(ctx);
            resolvePropagation(ctx);

            // ═══ Phase 4: Storages ═══
            updateStorages(ctx);

            // ═══ Phase 5: Antennas ═══
            updateAntennas(ctx);

            // ═══ Phase 6: Finalize ═══
            const { finalNodes, finalEdges, finalProd, finalCons, finalCloudProd, finalCloudCons } = finalizeNodesAndEdges(ctx);

            return {
                nodes: finalNodes,
                edges: finalEdges,
                cloudStorage: nextCloudStorage,
                globalStats: {
                    production: finalProd,
                    consumption: finalCons,
                    cloudProduction: finalCloudProd,
                    cloudConsumption: finalCloudCons
                }
            };
        });
    },
});