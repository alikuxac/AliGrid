import type { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { mergeResourceMaps } from '../../helpers';
import { NodeData } from '../../types';
import { TickContext } from './types';
import { CLOUD_BASE_CAPACITY, CLOUD_CAPACITY_GROWTH } from '../../constants';

/**
 * Safely converts any value (string, number, or prototype-less Decimal object) 
 * into a proper Decimal instance with all methods intact.
 */
export const safeDecimal = (val: any): Decimal => {
    if (val === undefined || val === null) return new Decimal(0);
    if (val instanceof Decimal) return val;
    // Handle prototype-less clones from postMessage (break_infinity.js structure)
    if (typeof val === 'object' && 'mantissa' in val && 'exponent' in val) {
        return Decimal.fromMantissaExponent(val.mantissa, val.exponent);
    }
    // Handle strings, numbers, or other structures
    try {
        return new Decimal(val);
    } catch (e) {
        console.error('Error hydrating Decimal:', val);
        return new Decimal(0);
    }
};

export const addStat = (ctx: TickContext, st: 'production' | 'consumption', rt: ResourceType, amt: Decimal) => {
    if (amt.lte(0)) return;
    const m = st === 'production' ? ctx.globalProduction : ctx.globalConsumption;
    m[rt] = (m[rt] || safeDecimal(0)).plus(amt);
};

export const addCloudStat = (ctx: TickContext, st: 'production' | 'consumption', rt: ResourceType, amt: Decimal) => {
    if (amt.lte(0)) return;
    const m = st === 'production' ? ctx.cloudProduction : ctx.cloudConsumption;
    m[rt] = (m[rt] || safeDecimal(0)).plus(amt);
};

export const getEdgeBackpressure = (ctx: TickContext, sourceId: string) => {
    const outEdges = ctx.outEdgesBySource[sourceId] || [];
    if (outEdges.length === 0) return safeDecimal(1);
    return outEdges.reduce((min, e) => {
        // Prioritize current tick backpressure from context, fallback to smoothed value on edge data
        const bp = ctx.edgeBackpressures[e.id] ?? (e.data?.backpressureRate ? safeDecimal(e.data.backpressureRate) : safeDecimal(1));
        return Decimal.min(min, bp);
    }, safeDecimal(1));
};

export const pushToEdge = (ctx: TickContext, edge: Edge, rt: ResourceType, amt: Decimal) => {
    if (amt.lte(0)) {
        if (!ctx.edgeFlows[edge.id]) ctx.edgeFlows[edge.id] = {};
        if (!ctx.edgeFlows[edge.id][rt]) ctx.edgeFlows[edge.id][rt] = safeDecimal(0);
        return safeDecimal(0);
    }

    const item = ctx.itemRegistry?.[rt];
    const material = (item?.type || 'solid').toLowerCase();
    const edgeTier = edge.data?.tier ?? 0;
    const globalTier = ctx.edgeTiers[material] || 0;
    const tier = Math.max(edgeTier, globalTier);

    let capPerSec = safeDecimal(60 * Math.pow(2, tier));
    if (rt === 'electricity') {
        // Massively buff electricity throughput to match grid levels
        capPerSec = capPerSec.times(100);
    }

    const edgeFlowObj = ctx.edgeFlows[edge.id] || {};
    const alreadyPushedAll = Object.values(edgeFlowObj).reduce((sum: Decimal, val) => sum.plus(val || safeDecimal(0)), safeDecimal(0));
    const maxPush = Decimal.max(safeDecimal(0), capPerSec.times(ctx.dtSeconds).minus(alreadyPushedAll));

    const targetNode = ctx.nodesById[edge.target];
    const isSink = targetNode?.type === 'sink' || targetNode?.type === 'antenna';
    const isLogistics = targetNode?.type === 'splitter' || targetNode?.type === 'merger';

    // Capacity calculation moved inside to support per-resource or global checks
    const targetLevel = targetNode?.data?.level || 0;
    const levelMult = Math.pow(2, targetLevel);
    const resolvedMaxBuf = isSink
        ? safeDecimal(Infinity)
        : (isLogistics ? safeDecimal(1000000) : (targetNode?.data?.maxBuffer ? safeDecimal(targetNode.data.maxBuffer) : safeDecimal(CLOUD_BASE_CAPACITY).times(levelMult)));

    const bufObj = targetNode?.data?.inputBuffer || {};
    const currentAmtForType = safeDecimal(bufObj[rt] as any || 0);
    const incomingForType = ctx.nodeIncoming[edge.target]?.[rt] || safeDecimal(0);

    let leftoverSpace = isSink ? safeDecimal(Infinity) : Decimal.max(0, resolvedMaxBuf.minus(currentAmtForType).minus(incomingForType));

    // Special case: Antenna (Uploader) is a sink.
    // It should NEVER create backpressure even if cloud is full (requested by user).
    // The actual storage clamping happens in phase5_antenna.ts.
    if (targetNode?.type === 'antenna') {
        // Antenna acts as a pure sink for the purpose of wire throughput
        leftoverSpace = safeDecimal(Infinity);
    }

    const isMatchingHandle = (targetHandle: string, res: ResourceType) => {
        const normH = targetHandle.toLowerCase().replace(/[\s_]/g, '');
        const normR = res.toLowerCase().replace(/[\s_]/g, '');
        return normH === normR ||
            (res === 'electricity' && (normH === 'target' || normH === 'source')) ||
            (normH === 'input' && !ctx.itemRegistry?.[res]) || // Fallback
            (targetHandle === 'input-0' && !targetNode?.data?.recipes); // Multi-input fallback if not defined
    };

    const actualPush = Decimal.min(amt, Decimal.min(maxPush, leftoverSpace));

    const isBottleneck = maxPush.lt(amt) && maxPush.lte(leftoverSpace);
    ctx.edgeBottlenecks[edge.id] = (ctx.edgeBottlenecks[edge.id] || false) || isBottleneck;

    mergeResourceMaps(ctx.nodeIncoming, edge.target, rt, actualPush);

    // Record instantaneous input rates for UI machine display
    if (!ctx.nodeInputRates[edge.target]) ctx.nodeInputRates[edge.target] = {};
    const curIR = ctx.nodeInputRates[edge.target][rt] || safeDecimal(0);
    ctx.nodeInputRates[edge.target][rt] = curIR.plus(actualPush);

    if (!ctx.edgeFlows[edge.id]) ctx.edgeFlows[edge.id] = {};
    const cur = ctx.edgeFlows[edge.id][rt] || safeDecimal(0);
    ctx.edgeFlows[edge.id][rt] = cur.plus(actualPush);

    // Use a dedicated tracker for edge resource metadata to avoid polluting the flow record
    if (!ctx.edgeResourceTypes) ctx.edgeResourceTypes = {};
    ctx.edgeResourceTypes[edge.id] = rt;

    // Record activity for both nodes to keep them "active" in UI
    if (actualPush.gt(0)) {
        if (ctx.tickActivity) {
            ctx.tickActivity[edge.source] = true;
            ctx.tickActivity[edge.target] = true;
        }
    }

    // If pushing to antenna, update the global reservaton
    if (targetNode?.type === 'antenna') {
        const res = ctx.cloudConsumptionReservation[rt] || safeDecimal(0);
        ctx.cloudConsumptionReservation[rt] = res.plus(actualPush);
    }

    return actualPush;
};

export const pushToMultipleEdges = (ctx: TickContext, targetEdges: Edge[], resType: ResourceType, totalGain: Decimal) => {
    let pushedTotal = safeDecimal(0);
    let remainder = totalGain;

    // Deduplicate edges to prevent split divisor inflation from overlayed UI edges
    const uniqueEdges = targetEdges.filter((e, index, self) =>
        index === self.findIndex((t) => t.target === e.target && t.targetHandle === e.targetHandle)
    );
    let activeEdges = [...uniqueEdges];

    while (remainder.gt(0.001) && activeEdges.length > 0) {
        const amountPerEdge = remainder.dividedBy(activeEdges.length);
        let nextActiveEdges: Edge[] = [];
        let anyPushedInThisRound = false;

        for (const edge of activeEdges) {
            const pushed = pushToEdge(ctx, edge, resType, amountPerEdge);
            if (pushed.gt(0)) {
                remainder = remainder.minus(pushed);
                pushedTotal = pushedTotal.plus(pushed);
                anyPushedInThisRound = true;
            }

            // Keep edge active if it accepted most of what we offered
            if (pushed.gte(amountPerEdge.times(0.9))) {
                nextActiveEdges.push(edge);
            }
        }
        if (!anyPushedInThisRound) break;
        activeEdges = nextActiveEdges;
    }
    return pushedTotal;
};

export const getAbsPosition = (ctx: TickContext, n: Node<NodeData>) => {
    if (ctx.absPositions?.[n.id]) return ctx.absPositions[n.id];

    let x = n.position.x;
    let y = n.position.y;
    let pId = n.parentId;
    while (pId) {
        const p = ctx.nodesById[pId];
        if (p) {
            x += p.position.x;
            y += p.position.y;
            pId = p.parentId;
        } else {
            break;
        }
    }

    // Cache it for subsequent calls in THIS tick
    if (!ctx.absPositions) ctx.absPositions = {};
    ctx.absPositions[n.id] = { x, y };

    return { x, y };
};

/**
 * Exponential Moving Average for smoothing UI values like rates and efficiency.
 * alpha = 1 - exp(-dt / tau)
 * @param lastVal Previous value (Decimal, string, number)
 * @param currentVal Current instantaneous value
 * @param dt Time elapsed in seconds
 * @param tau Time constant (seconds) - higher means smoother/slower. Default 0.5s.
 */

export const smoothValue = (lastVal: any, currentVal: Decimal, dt: number, tau = 0.5): Decimal => {
    if (dt <= 0) return safeDecimal(lastVal);

    // Hard cutoff for zero: if current is 0 and last is small, snap to 0 immediately
    // This prevents "ghost flow" (lingering numbers like 100-200) when production stops.
    if (currentVal.eq(0)) {
        const lastDec = safeDecimal(lastVal);
        if (lastDec.lt(1)) return safeDecimal(0);
        // Faster decay when current is zero
        tau = tau * 0.4;
    }

    const alpha = 1 - Math.exp(-dt / tau);
    const prev = safeDecimal(lastVal);

    // Hysteresis: skip update if change is negligible (< 0.05%) 
    // to prevent UI flicker of tiny decimal fluctuations in steady state
    if (prev.gt(0) && currentVal.gt(0)) {
        const diff = currentVal.minus(prev).abs();
        const pct = diff.dividedBy(prev);
        if (pct.lt(0.0005) && dt < 1) return prev;
    }

    const result = prev.times(1 - alpha).plus(currentVal.times(alpha));

    // Final safety snap to zero
    return result.lt(0.01) ? safeDecimal(0) : result;
};

/**
 * Updates a node's data in the current tick context.
 * IMPORTANT: This updates both the nodeDeltas (returned to main thread)
 * and the live nextNodes reference (used by subsequent substeps).
 */
export const nodeDelta = (ctx: TickContext, id: string, delta: Partial<NodeData>) => {
    if (!ctx.nodeDeltas) ctx.nodeDeltas = {};
    ctx.nodeDeltas[id] = { ...ctx.nodeDeltas[id], ...delta };

    const node = ctx.nodesById[id];
    if (node) {
        // Deeply merge to avoid losing nested objects if they are partial, 
        // though for simplicity here we just spread.
        node.data = { ...node.data, ...delta };
    }
};
