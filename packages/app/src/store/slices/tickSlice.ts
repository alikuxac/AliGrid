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
        // We avoid updating state.nodes/state.edges on every tick to prevent massive re-renders.
        // Persistent data (level, position) should stay in 'nodes', 
        // while transient data (buffers, efficiency) lives in 'nodeStats'.
        let updatedNodes = state.nodes;
        let updatedEdges = state.edges;

        // Only sync nodes/edges if explicitly requested or on a full sync
        if (results.forceSync || (!results.isPartial && state.uiTickCount % 60 === 0)) {
            if (resultNodes) {
                updatedNodes = state.nodes.map(n => {
                    const resultNode = resultNodes.find((rn: any) => rn.id === n.id);
                    if (resultNode) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                // Only sync config/persistent fields if they differ
                                status: resultNode.data.status,
                                boost: resultNode.data.boost,
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
                            data: {
                                ...e.data,
                                capacity: resEdge.data.capacity,
                            }
                        };
                    }
                    return e;
                });
            }
        }

        set(() => ({
            ...(updatedNodes !== state.nodes ? { nodes: updatedNodes } : {}),
            ...(updatedEdges !== state.edges ? { edges: updatedEdges } : {}),
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
