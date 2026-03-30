import type { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { RFState, NodeData } from '../types';
import { NodeTemplate } from '@aligrid/schema';
import { FALLBACK_NODES } from '../../config/fallbackNodes';
import { safeDecimal } from './tick/helpers';
import { CLOUD_BASE_CAPACITY, CLOUD_CAPACITY_GROWTH } from '../constants';

import { runSimulationTick } from './tick/engine';

export const createTickSlice = (set: (fn: (state: RFState) => Partial<RFState>) => void, get: () => RFState) => ({
    globalStats: { production: {}, consumption: {} },
    nodeStats: {},
    uiTickCount: 0,

    incrementUiTickCount: () => set((state: any) => ({ uiTickCount: state.uiTickCount + 1 })),

    applyTickResults: (results: any) => {
        const state = get();
        const currentNodes = state.nodes;

        // --- SAFE GUARD ---
        const resultNodes = results.nodes || results.finalNodes;
        if (currentNodes.length > 0 && (!resultNodes || resultNodes.length === 0)) {
            console.warn("Simulation returned empty nodes while store has nodes. Aborting state update to prevent data loss.");
            return;
        }

        // 1. Prepare Node Stats for UI
        const incomingNodeStats = results.nodeStats || results.finalNodeStats || {};
        const incomingEdgeStats = results.edgeStats || results.finalEdgeStats || {};

        // 2. Apply Cloud Storage Deltas
        const currentCloud = { ...state.cloudStorage } as Record<string, any>;
        const deltas = results.cloudStorageDeltas || {};

        const cloudLevel = state.cloudLevel || 1;
        const globalCloudCap = new Decimal(CLOUD_BASE_CAPACITY).times(Math.pow(CLOUD_CAPACITY_GROWTH, cloudLevel - 1)).round();

        Object.entries(deltas).forEach(([rt, deltaStr]) => {
            const delta = safeDecimal(deltaStr as string);
            if (delta.eq(0)) return;
            const current = safeDecimal(currentCloud[rt] || 0);
            const nextVal = Decimal.min(globalCloudCap, Decimal.max(0, current.plus(delta)));
            currentCloud[rt] = nextVal.toString();
        });

        if (results.cloudStorage && Object.keys(deltas).length === 0) {
            Object.entries(results.cloudStorage).forEach(([k, v]) => {
                currentCloud[k] = v;
            });
        }

        const hydratedStats = {
            production: results.globalStats?.production || results.finalProd || {},
            consumption: results.globalStats?.consumption || results.finalCons || {},
            cloudProduction: results.globalStats?.cloudProduction || results.finalCloudProd || {},
            cloudConsumption: results.globalStats?.cloudConsumption || results.finalCloudCons || {},
        };

        // 3. Conditional Node & Edge Data Update
        let updatedNodes = state.nodes;
        let updatedEdges = state.edges;

        if (!results.isPartial) {
            if (resultNodes) {
                updatedNodes = state.nodes.map(n => {
                    const resultNode = resultNodes.find((rn: any) => rn.id === n.id);
                    if (resultNode) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                inputBuffer: resultNode.data.inputBuffer,
                                outputBuffer: resultNode.data.outputBuffer,
                                currentAmount: resultNode.data.currentAmount,
                                actualInputPerSec: resultNode.data.actualInputPerSec,
                                actualOutputPerSec: resultNode.data.actualOutputPerSec,
                                efficiency: resultNode.data.efficiency,
                                inputEfficiency: resultNode.data.inputEfficiency,
                                status: resultNode.data.status,
                                gridSupply: resultNode.data.gridSupply,
                                gridDemand: resultNode.data.gridDemand,
                                inputRates: resultNode.data.inputRates,
                                handleFlows: resultNode.data.handleFlows,
                                handleResourceTypes: resultNode.data.handleResourceTypes,
                                boost: resultNode.data.boost,
                                boostedCount: resultNode.data.boostedCount,
                                powerConsumption: resultNode.data.powerConsumption,
                                wirelessEfficiency: resultNode.data.wirelessEfficiency,
                                productionEfficiency: resultNode.data.productionEfficiency,
                                buffer: resultNode.data.buffer,
                            }
                        };
                    }
                    return n;
                });
            }

            const resultEdges = results.edges || results.finalEdges;
            if (resultEdges) {
                updatedEdges = state.edges.map(e => {
                    const resEdge = resultEdges.find((re: any) => re.id === e.id);
                    if (resEdge) {
                        return {
                            ...e,
                            className: resEdge.className,
                            duration: resEdge.duration,
                            data: {
                                ...e.data,
                                actualFlow: resEdge.data.actualFlow,
                                capacity: resEdge.data.capacity,
                                isBottleneck: resEdge.data.isBottleneck,
                                isOverloaded: resEdge.data.isOverloaded,
                                isTripped: resEdge.data.isTripped,
                            }
                        };
                    }
                    return e;
                });
            }
        }

        set(() => ({
            nodes: updatedNodes,
            edges: updatedEdges,
            nodeStats: incomingNodeStats,
            edgeStats: incomingEdgeStats,
            cloudStorage: currentCloud,
            globalStats: hydratedStats,
            uiTickCount: state.uiTickCount + 1
        }));
    },

    tick: (dtSeconds: number) => {
        const state = get();
        const results = runSimulationTick({
            dtSeconds,
            nodes: state.nodes,
            edges: state.edges,
            nodeTemplates: state.nodeTemplates || [],
            cloudStorage: (state.cloudStorage as any) || {},
            downloaderTier: state.downloaderTier || 0,
            edgeTiers: state.edgeTiers || {},
            cloudLevel: state.cloudLevel || 1,
            itemRegistry: state.itemRegistry || {}
        });

        // Use applyTickResults to ensure hydration
        get().applyTickResults(results);
    },
});
