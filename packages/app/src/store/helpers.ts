import { Node } from 'reactflow';
import { Decimal, ResourceType, RESOURCE_REGISTRY } from '@aligrid/engine';
import { GENERATOR_TYPES, PROCESSOR_TYPES } from './constants';
import { NodeData } from './types';

export const isGenerator = (node: any) => node.data?.category === 'generator' || GENERATOR_TYPES.includes(node.type || '') || node.data?.template?.category === 'generator';
export const isProcessor = (node: any) => node.data?.category === 'processor' || PROCESSOR_TYPES.includes(node.type || '') || !!node.data?.recipe || !!node.data?.recipes;

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

export const getNodeOutputResourceType = (node: Node<NodeData>): ResourceType | undefined => {
    if (node.data?.resourceType) return node.data.resourceType;
    if (node.data?.recipes && Array.isArray(node.data.recipes)) {
        const activeIdx = node.data.activeRecipeIndex || 0;
        const activeRecipe = node.data.recipes[activeIdx];
        if (activeRecipe?.outputType) return activeRecipe.outputType;
    }
    if (node.data?.recipe?.outputType) return node.data.recipe.outputType;
    if (node.type === 'merger' && node.data?.lockedResourceType) return node.data.lockedResourceType;
    if (node.type === 'storage' && node.data?.lockedResourceType) return node.data.lockedResourceType;
    return undefined;
};

export const deserializeSaveData = (data: any) => {
    const cloud: any = {};
    for (const [k, v] of Object.entries(data.cloudStorage || {})) {
        cloud[k] = new Decimal(v as any);
    }

    const cloudLevel = data.cloudLevel || 1;

    const nodes = (data.nodes || []).map((n: any) => {
        if (n.data) {
            if (n.data.outputRate) n.data.outputRate = new Decimal(n.data.outputRate);
            if (n.data.currentAmount) n.data.currentAmount = new Decimal(n.data.currentAmount);
            if (n.data.powerConsumption) n.data.powerConsumption = new Decimal(n.data.powerConsumption);
            if (n.data.recipe && n.data.recipe.conversionRate) {
                n.data.recipe.conversionRate = new Decimal(n.data.recipe.conversionRate);
            }
            if (n.data.actualInputPerSec) n.data.actualInputPerSec = new Decimal(n.data.actualInputPerSec);
            if (n.data.actualOutputPerSec) n.data.actualOutputPerSec = new Decimal(n.data.actualOutputPerSec);
        }
        return n;
    });
    const edgeTiers = data.edgeTiers || { solid: 0, liquid: 0, gas: 0, power: 0 };
    return { nodes, edges: data.edges || [], cloud, cloudLevel, edgeTiers, lastTick: data.lastTick };
};

export const processOfflineProgress = (lastTick: number | undefined, state: any) => {
    if (lastTick) {
        const offlineMs = Date.now() - lastTick;
        const offlineSec = offlineMs / 1000;
        if (offlineSec > 2) {
            const passes = 20;
            const subDt = offlineSec / passes;
            for (let i = 0; i < passes; i++) {
                state.tick(subDt);
            }
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
