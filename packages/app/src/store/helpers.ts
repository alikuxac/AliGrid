import type { Node } from 'reactflow';
import { Decimal, ResourceType, RESOURCE_REGISTRY } from '@aligrid/engine';
import { GENERATOR_TYPES, PROCESSOR_TYPES } from './constants';
import { NodeData } from './types';

export const safeDecimal = (val: any): Decimal => {
    if (val instanceof Decimal) return val;
    return new Decimal(val || 0);
};

export const isGenerator = (node: any) =>
    node.data?.category === 'generator' ||
    node.data?.template?.category === 'generator' ||
    GENERATOR_TYPES.includes(node.type || '');

export const isProcessor = (node: any) =>
    node.data?.category === 'processor' ||
    node.data?.template?.category === 'processor' ||
    PROCESSOR_TYPES.includes(node.type || '') ||
    !!node.data?.recipe ||
    !!node.data?.recipes;

export const mergeResourceMaps = (
    target: Record<string, Partial<Record<ResourceType, Decimal>>>,
    nodeId: string,
    resType: ResourceType,
    amount: Decimal
) => {
    if (!target[nodeId]) target[nodeId] = {};
    const cur = target[nodeId][resType] || new Decimal(0);
    target[nodeId][resType] = cur.plus(amount);
};

export const getNodeOutputResourceType = (node: Node<NodeData>, edges: any[] = [], nodes: any[] = []): ResourceType | undefined => {
    if (node.data?.resourceType) return node.data.resourceType;
    if (node.data?.recipes && Array.isArray(node.data.recipes)) {
        const activeIdx = node.data.activeRecipeIndex || 0;
        const activeRecipe = node.data.recipes[activeIdx];
        if (activeRecipe?.outputType) return activeRecipe.outputType;
    }
    if (node.data?.recipe?.outputType) return node.data.recipe.outputType;
    if (node.data?.lockedResourceType) return node.data.lockedResourceType;

    // Specialized Power/Electricity logic
    if (['powerPole', 'accumulator', 'powerTransmitter', 'hydroGenerator'].includes(node.type || '')) {
        return 'electricity' as ResourceType;
    }

    // Logistics recursive lookup
    if (node.type === 'splitter' || node.type === 'merger' || node.type === 'storage') {
        const findInflow = (nodeId: string, visited = new Set<string>()): ResourceType | undefined => {
            if (visited.has(nodeId)) return undefined;
            visited.add(nodeId);

            const inEdge = edges.find(e => e.target === nodeId);
            if (!inEdge) return undefined;
            if (inEdge.data?.resourceType) return inEdge.data.resourceType;

            const srcNode = nodes.find(n => n.id === inEdge.source);
            if (!srcNode) return undefined;
            return getNodeOutputResourceType(srcNode, edges, nodes);
        };

        return findInflow(node.id);
    }

    return undefined;
};

export const deserializeSaveData = (data: any) => {
    const cloud: any = {};
    for (const [k, v] of Object.entries(data.cloudStorage || {})) {
        cloud[k] = String(v || 0);
    }

    const cloudLevel = data.cloudLevel || 1;

    const nodes = (data.nodes || []).map((n: any) => {
        if (n.data) {
            if (n.data.outputRate) n.data.outputRate = String(n.data.outputRate);
            if (n.data.currentAmount) n.data.currentAmount = String(n.data.currentAmount);
            if (n.data.powerConsumption) n.data.powerConsumption = String(n.data.powerConsumption);
            if (n.data.recipe && n.data.recipe.conversionRate) {
                n.data.recipe.conversionRate = String(n.data.recipe.conversionRate);
            }
            if (n.data.actualInputPerSec) n.data.actualInputPerSec = String(n.data.actualInputPerSec);
            if (n.data.actualOutputPerSec) n.data.actualOutputPerSec = String(n.data.actualOutputPerSec);
        }
        return n;
    });
    const edgeTiers = data.edgeTiers || { solid: 0, liquid: 0, gas: 0, power: 0 };
    return { nodes, edges: data.edges || [], cloud, cloudLevel, edgeTiers, lastTick: data.lastTick };
};

export const processOfflineProgress = (lastTick: number | undefined, state: any) => {
    if (lastTick) {
        const offlineMs = Date.now() - lastTick;
        const offlineSec = Math.min(offlineMs / 1000, 3600 * 2); // Cap at 2 hours for safety
        if (offlineSec > 5) {
            // Use FEWER larger steps for offline progress to avoid hanging the main thread
            const passes = 10;
            const subDt = offlineSec / passes;
            for (let i = 0; i < passes; i++) {
                state.tick(subDt);
            }
            console.log(`Processed ${offlineSec.toFixed(1)}s of offline progress.`);
        }
    }
};

export const ENABLE_CLOUD_SAVE = true;

let cloudSaveDebounceTimer: any = null;
export const debouncedCloudSave = (state: any) => {
    if (!ENABLE_CLOUD_SAVE) return;
    if (cloudSaveDebounceTimer) clearTimeout(cloudSaveDebounceTimer);
    cloudSaveDebounceTimer = setTimeout(() => {
        state.saveStateToServer();
    }, 3000);
};
