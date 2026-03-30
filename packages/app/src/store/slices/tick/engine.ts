import type { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeTemplate } from '@aligrid/schema';
import { NodeData } from '../../types';
import { FALLBACK_NODES } from '../../../config/fallbackNodes';
import {
    TickContext,
    resolvePowerGrid,
    updateGenerators,
    resolvePropagation,
    updateProcessorsAndAssemblers,
    updateStorages,
    updateAntennas,
    finalizeNodesAndEdges,
    getAbsPosition,
    safeDecimal
} from './index';
import { CLOUD_CAPACITY_GROWTH, CLOUD_BASE_CAPACITY } from '../../constants';

export interface TickPayload {
    dtSeconds: number;
    nodes: Node<NodeData>[];
    edges: Edge[];
    nodeTemplates: NodeTemplate[];
    cloudStorage: Record<string, string | number>;
    downloaderTier: number;
    edgeTiers: Record<string, number>;
    cloudLevel: number;
    itemRegistry: Record<string, any>;
}

export const runSimulationTick = (payload: TickPayload) => {
    const {
        dtSeconds = 0.5,
        nodes = [],
        edges = [],
        nodeTemplates = [],
        cloudStorage = {},
        downloaderTier = 0,
        edgeTiers = {},
        cloudLevel = 1,
        itemRegistry = {}
    } = payload || {};

    let nextNodes = nodes.map((n: Node<NodeData>) => ({ ...n, data: { ...(n.data || {}) } }));

    // Cloud capacity calculation
    const currentCloudLevel = payload.cloudLevel || 1;
    const globalCloudCap = new Decimal(CLOUD_BASE_CAPACITY).times(Math.pow(CLOUD_CAPACITY_GROWTH, currentCloudLevel - 1));

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
    // Deduplicate edges to prevent double-counting flow or backpressure
    const uniqueEdges = edges.filter((e, index, self) =>
        index === self.findIndex((t) => (
            t.source === e.source &&
            t.target === e.target &&
            t.sourceHandle === e.sourceHandle &&
            t.targetHandle === e.targetHandle
        ))
    );

    uniqueEdges.forEach((e: Edge) => {
        if (!e || !nodesById[e.source] || !nodesById[e.target]) return;

        edgesById[e.id] = e;
        if (!outEdgesBySource[e.source]) outEdgesBySource[e.source] = [];
        outEdgesBySource[e.source].push(e);

        if (!inEdgesByTarget[e.target]) inEdgesByTarget[e.target] = [];
        inEdgesByTarget[e.target].push(e);
    });

    const nodeIncoming: Record<string, Partial<Record<ResourceType, Decimal>>> = {};

    nextNodes.forEach((node: Node<NodeData>) => {
        if (!node) return;
        const templatesArr = Array.isArray(nodeTemplates) ? nodeTemplates : [];
        const fallbackArr = Array.isArray(FALLBACK_NODES) ? FALLBACK_NODES : [];
        const template = templatesArr.find((t: NodeTemplate) => t.id === node.type) || fallbackArr.find((t: any) => t.id === node.type);
        if (template) {
            node.data.category = template.category;
            if (template.resource_type) {
                node.data.resourceType = template.resource_type as string;
            }
            if (!node.data.outputRate) {
                const initialRate = template.initial_rate ? safeDecimal(template.initial_rate) : safeDecimal(1);
                const level = node.data.level || 0;
                node.data.outputRate = initialRate.times(Math.pow(2, level)).round().toString();
            }
            if (template.power_demand !== undefined) {
                const level = node.data.level || 0;
                node.data.powerConsumption = safeDecimal(template.power_demand).times(Math.pow(1.5, level)).toString();
            }
            if (template.requires_power !== undefined) {
                node.data.requiresPower = !!template.requires_power;
            }
            if (node.type === 'downloader') {
                const resType = node.data.resourceType || 'iron';
                const item = itemRegistry[resType];
                const state = (item?.type || 'solid').toLowerCase();
                const globalTier = edgeTiers[state] || 0;
                // Capacity formula: 60 * 2^Tier (matches logic in helpers.ts pushToEdge)
                const capPerSec = 60 * Math.pow(2, globalTier);
                node.data.outputRate = capPerSec.toString();
            }
            if (node.type === 'accumulator' || node.type === 'powerPole' || node.type === 'powerTransmitter' || node.type === 'powerReceiver') {
                const level = node.data.level || 0;
                node.data.resourceType = 'electricity';
                if (node.type === 'accumulator') {
                    const baseMax = safeDecimal((template as any).maxBuffer || 5000);
                    node.data.maxBuffer = baseMax.times(Math.pow(2, level)).toString();
                }
            }
        }

        if (node.data?.outputRate) {
            node.data.outputRate = safeDecimal(node.data.outputRate).round().toString();
        }

        if (node.data?.outputBuffer) {
            if (typeof node.data.outputBuffer === 'string' || (typeof node.data.outputBuffer === 'object' && node.data.outputBuffer !== null && 'mantissa' in node.data.outputBuffer)) {
                node.data.outputBuffer = { [node.data.resourceType || 'unknown']: node.data.outputBuffer } as any;
            }
            // Hydrate inner buffers
            if (typeof node.data.outputBuffer === 'object' && node.data.outputBuffer !== null) {
                const buf = node.data.outputBuffer as Record<string, any>;
                Object.keys(buf).forEach(k => {
                    buf[k] = safeDecimal(buf[k]);
                });
            }
        }

        if (node.data?.inputBuffer && typeof node.data.inputBuffer === 'object') {
            const buf = node.data.inputBuffer as Record<string, any>;
            Object.keys(buf).forEach(k => {
                buf[k] = safeDecimal(buf[k]);
            });
        }

        if (node.data?.currentAmount) {
            node.data.currentAmount = safeDecimal(node.data.currentAmount);
        }
    });

    const edgeFlows: Record<string, Partial<Record<ResourceType, Decimal>>> = {};
    const nextCloudStorage: Record<string, Decimal> = {};
    Object.entries(cloudStorage).forEach(([k, v]) => {
        nextCloudStorage[k] = safeDecimal(v);
    });

    const globalProduction: Partial<Record<ResourceType, Decimal>> = {};
    const globalConsumption: Partial<Record<ResourceType, Decimal>> = {};
    const cloudProduction: Partial<Record<ResourceType, Decimal>> = {};
    const cloudConsumption: Partial<Record<ResourceType, Decimal>> = {};

    const edgeBackpressures: Record<string, Decimal> = {};
    const edgeBottlenecks: Record<string, boolean> = {};
    const nodeDeltas: Record<string, Partial<NodeData>> = {};

    const absPositions: Record<string, { x: number; y: number }> = {};
    const getAbs = (n: Node<NodeData>) => {
        if (absPositions[n.id]) return absPositions[n.id];
        let x = n.position.x;
        let y = n.position.y;
        let pId = n.parentId;
        while (pId) {
            const p = nodesById[pId];
            if (p) {
                x += p.position.x;
                y += p.position.y;
                pId = p.parentId;
            } else break;
        }
        absPositions[n.id] = { x, y };
        return absPositions[n.id];
    };

    // ═══ Multi-Step Internal Simulation Loop Calculation ═══
    const adaptiveMaxSubstep = dtSeconds > 1 ? 1.0 : 0.05;
    const numSteps = Math.min(1000, Math.ceil(dtSeconds / adaptiveMaxSubstep));
    const subDt = dtSeconds / numSteps;

    const ctx: TickContext = {
        dtSeconds: subDt, // Substep duration
        totalDt: dtSeconds, // FULL tick duration for rate calculation
        state: {} as any,
        get: () => ({}) as any,
        nodesById,
        edgesById,
        outEdgesBySource,
        inEdgesByTarget,
        nodeIncoming: {},
        nodeInputRates: {}, // Per-substep input tracking
        edgeFlows: {},      // Per-substep edge flow
        tickTotalInputRates: {}, // TICK-WIDE accumulation for telemetry
        tickTotalFlows: {},      // TICK-WIDE accumulation for telemetry
        edgeBackpressures,
        edgeBottlenecks,
        globalProduction,
        globalConsumption,
        cloudProduction,
        cloudConsumption,
        nextCloudStorage,
        cloudConsumptionReservation: {},
        nextNodes,
        nodeDeltas,
        downloaderTier,
        edgeTiers,
        cloudLevel,
        nodeTemplates,
        powerGrids: [],
        absPositions,
        itemRegistry,
        tickActivity: {},
        edgeResourceTypes: {}
    };

    const nodeBoosts: Record<string, number> = {};

    // DEBUG: Inject engine constants into ALL nodes
    ctx.nextNodes.forEach(node => {
        ctx.nodeDeltas![node.id] = {
            ...ctx.nodeDeltas![node.id],
            debugInfo: `G:${CLOUD_CAPACITY_GROWTH}|L:${cloudLevel}|B:${CLOUD_BASE_CAPACITY}`
        };
    });

    for (let step = 0; step < numSteps; step++) {
        // Reset sub-step flows but preserve the context structure
        ctx.edgeFlows = {};
        ctx.nodeIncoming = {};
        ctx.nodeInputRates = {};

        // ═══ Phase 0: Power Grid Resolution ═══
        resolvePowerGrid(ctx);

        // ═══ Phase 2: Propagation ═══
        resolvePropagation(ctx);
        resolvePropagation(ctx);

        // ═══ Phase 1: Generators ═══
        updateGenerators(ctx);

        // ═══ Phase 2.5: Final Propagation ═══
        resolvePropagation(ctx);

        // ═══ Phase 3: Processors ═══
        updateProcessorsAndAssemblers(ctx);

        // ═══ Phase 4: Storages ═══
        updateStorages(ctx);

        // ═══ Phase 5: Antennas ═══
        updateAntennas(ctx);

        // ═══ TICK ACCUMULATION: Aggregate substep results into tick totals ═══
        Object.entries(ctx.edgeFlows).forEach(([edgeId, flows]) => {
            if (!ctx.tickTotalFlows![edgeId]) ctx.tickTotalFlows![edgeId] = {};
            Object.entries(flows).forEach(([rt, amt]) => {
                ctx.tickTotalFlows![edgeId][rt as ResourceType] = (ctx.tickTotalFlows![edgeId][rt as ResourceType] || safeDecimal(0)).plus(amt as Decimal);
            });
        });

        Object.entries(ctx.nodeInputRates).forEach(([nodeId, flows]) => {
            if (!ctx.tickTotalInputRates![nodeId]) ctx.tickTotalInputRates![nodeId] = {};
            Object.entries(flows).forEach(([rt, amt]) => {
                ctx.tickTotalInputRates![nodeId][rt] = (ctx.tickTotalInputRates![nodeId][rt] || safeDecimal(0)).plus(amt as Decimal);
            });
        });
    }

    // ═══ Phase 6: Finalize ═══

    // ═══ Phase 6: Finalize ═══
    const { finalNodes, finalEdges, finalProd, finalCons, finalCloudProd, finalCloudCons, finalNodeStats, finalEdgeStats } = finalizeNodesAndEdges(ctx);

    const serializedCloudStorage: Record<string, string> = {};
    const cloudStorageDeltas: Record<string, string> = {};

    Object.entries(nextCloudStorage).forEach(([k, v]) => {
        // Enforce both lower and upper bounds globally.
        const clampedV = Decimal.min(globalCloudCap, Decimal.max(0, v));
        serializedCloudStorage[k] = clampedV.toString();
        // Calculate delta for this tick
        const initialVal = safeDecimal(cloudStorage[k] || 0);
        cloudStorageDeltas[k] = clampedV.minus(initialVal).toString();
    });

    return {
        nodes: finalNodes,
        edges: finalEdges,
        nodeStats: finalNodeStats,
        cloudStorage: serializedCloudStorage,
        cloudStorageDeltas,
        globalStats: {
            production: finalProd,
            consumption: finalCons,
            cloudProduction: finalCloudProd,
            cloudConsumption: finalCloudCons
        },
        edgeStats: finalEdgeStats
    };
};
