import { EdgeChange, applyEdgeChanges, Connection, addEdge, Edge } from 'reactflow';
import { Decimal, RESOURCE_REGISTRY } from '@aligrid/engine';
import { EDGE_UPGRADE_COSTS } from '../constants';
import { getNodeOutputResourceType, debouncedCloudSave } from '../helpers';

export const createEdgeSlice = (set: any, get: any) => ({
    edges: [],
    edgeTiers: { solid: 0, liquid: 0, gas: 0, power: 0 },
    downloaderTier: 0,
    edgeUpgradeCosts: EDGE_UPGRADE_COSTS,

    loadEdgeUpgradeCosts: async () => {
        const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8787';
        try {
            const res = await fetch(`${API_BASE_URL}/api/edge-costs`);
            if (!res.ok) throw new Error("Load error");
            const data = await res.json(); // Array of { matter, item_id, amount }

            const costs: any = {};
            data.forEach((item: any) => {
                const { matter, item_id, amount } = item;
                if (!costs[matter]) costs[matter] = {};
                costs[matter][item_id] = new Decimal(amount);
            });
            set({ edgeUpgradeCosts: costs });
        } catch (err) {
            console.error("Load edge upgrade costs failed from server, loading local fallback", err);
            set({ edgeUpgradeCosts: EDGE_UPGRADE_COSTS });
        }
    },

    onEdgesChange: (changes: EdgeChange[]) => {
        const newEdges = applyEdgeChanges(changes, get().edges);
        set({ edges: newEdges });

        // Reset merger lock if all connections removed
        const nodes = get().nodes;
        const updatedNodes = nodes.map((node: any) => {
            if (node.type === 'merger') {
                const hasConnections = newEdges.some((e) => e.target === node.id);
                if (!hasConnections && node.data.lockedResourceType) {
                    return { ...node, data: { ...node.data, lockedResourceType: undefined } };
                }
            }
            return node;
        });
        set({ nodes: updatedNodes });
        if (changes.some(c => c.type === 'remove')) {
            debouncedCloudSave(get());
        }
    },

    onConnect: (connection: Connection) => {
        const edges = get().edges;
        const exists = edges.some(
            (e: Edge) =>
                e.source === connection.source &&
                e.sourceHandle === connection.sourceHandle &&
                e.target === connection.target &&
                e.targetHandle === connection.targetHandle
        );
        if (exists) return;

        const nodes = get().nodes;
        const targetNode = nodes.find((n: any) => n.id === connection.target);
        const sourceNode = nodes.find((n: any) => n.id === connection.source);

        let updatedNodes = nodes;
        const resType = sourceNode ? getNodeOutputResourceType(sourceNode) : undefined;

        if (targetNode?.type === 'merger' && sourceNode && !targetNode.data.lockedResourceType) {
            if (resType) {
                updatedNodes = nodes.map((n: any) =>
                    n.id === targetNode.id
                        ? { ...n, data: { ...n.data, lockedResourceType: resType } }
                        : n
                );
            }
        }

        const isPowerNode = (n: any) => ['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(n?.type || '');
        const isPower = resType === 'electricity' ||
            connection.sourceHandle?.toLowerCase().includes('electricity') ||
            connection.targetHandle?.toLowerCase().includes('electricity') ||
            (isPowerNode(sourceNode) && isPowerNode(targetNode));
        const edgeType = isPower ? 'power' : 'fluid';
        const resourceColor = resType ? RESOURCE_REGISTRY[resType]?.color : undefined;

        const edgeStyle: any = {};
        if (resourceColor) edgeStyle.stroke = resourceColor;

        const tiers = get().edgeTiers || { solid: 0, liquid: 0, gas: 0, power: 0 };
        const config = resType ? RESOURCE_REGISTRY[resType] : undefined;
        let matter: 'solid' | 'liquid' | 'gas' | 'power' = 'solid';
        if (isPower) matter = 'power';
        else if (config?.type) matter = config.type;

        const tier = tiers[matter] || 0;

        const newConnection = {
            ...connection,
            type: edgeType,
            style: edgeStyle,
            data: { tier }
        };

        set({ edges: addEdge(newConnection, edges), nodes: updatedNodes });
        debouncedCloudSave(get());
    },

    upgradeEdgeTier: (matter: 'solid' | 'liquid' | 'gas' | 'power') => {
        const tiers = { ...get().edgeTiers };
        const currentTier = tiers[matter] || 0;
        const baseCost = get().edgeUpgradeCosts[matter] || {};

        const cost: Partial<Record<string, Decimal>> = {};
        for (const [res, amt] of Object.entries(baseCost)) {
            cost[res] = (amt as Decimal).times(Math.pow(3, currentTier));
        }

        if (!get().canAfford(cost)) return;

        get().deductMaterials(cost);
        tiers[matter] = currentTier + 1;
        set({ edgeTiers: tiers });
        debouncedCloudSave(get());
    },

    upgradeDownloaderTier: () => {
        const currentTier = get().downloaderTier || 0;
        const baseCost: Partial<Record<string, Decimal>> = { iron: new Decimal(50), copper: new Decimal(30) };

        const cost: Partial<Record<string, Decimal>> = {};
        for (const [res, amt] of Object.entries(baseCost)) {
            cost[res] = (amt as Decimal).times(Math.pow(3, currentTier));
        }

        if (!get().canAfford(cost)) return;

        get().deductMaterials(cost);
        set({ downloaderTier: currentTier + 1 });
        debouncedCloudSave(get());
    },

    upgradeEdge: (edgeId: string) => {
        set((state: any) => {
            const edge = state.edges.find((e: Edge) => e.id === edgeId);
            if (!edge) return {};

            const isPower = edge.type === 'power';
            const curTier = edge.data?.tier ?? 0;
            const costRt = isPower ? 'copper' : 'iron';

            const costAmt = new Decimal(20).times(Math.pow(3, curTier));
            const currentAmt = state.cloudStorage[costRt] || new Decimal(0);

            if (currentAmt.lt(costAmt)) {
                alert(`Not enough ${costRt} to upgrade edge!`);
                return {};
            }

            const nextCloudStorage = { ...state.cloudStorage, [costRt]: currentAmt.sub(costAmt) };
            const nextTier = curTier + 1;

            const updatedEdges = state.edges.map((e: Edge) =>
                e.id === edgeId
                    ? { ...e, data: { ...e.data, tier: nextTier } }
                    : e
            );

            return {
                cloudStorage: nextCloudStorage,
                edges: updatedEdges
            };
        });
        debouncedCloudSave(get());
    },
});
