import { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { mergeResourceMaps } from '../../helpers';
import { NodeData } from '../../types';
import { TickContext } from './types';
import { RESOURCE_STATES } from '../../constants';

export const addStat = (ctx: TickContext, st: 'production' | 'consumption', rt: ResourceType, amt: Decimal) => {
    if (amt.lte(0)) return;
    const m = st === 'production' ? ctx.globalProduction : ctx.globalConsumption;
    m[rt] = (m[rt] || new Decimal(0)).plus(amt);
};

export const addCloudStat = (ctx: TickContext, st: 'production' | 'consumption', rt: ResourceType, amt: Decimal) => {
    if (amt.lte(0)) return;
    const m = st === 'production' ? ctx.cloudProduction : ctx.cloudConsumption;
    m[rt] = (m[rt] || new Decimal(0)).plus(amt);
};

export const getEdgeBackpressure = (ctx: TickContext, sourceId: string) => {
    const outEdges = ctx.outEdgesBySource[sourceId] || [];
    if (outEdges.length === 0) return new Decimal(1);
    return outEdges.reduce((min, e) => {
        const bp = e.data?.backpressureRate ? new Decimal(e.data.backpressureRate) : new Decimal(1);
        return Decimal.min(min, bp);
    }, new Decimal(1));
};

export const pushToEdge = (ctx: TickContext, edge: Edge, rt: ResourceType, amt: Decimal) => {
    if (amt.lte(0)) {
        if (!ctx.edgeFlows[edge.id]) ctx.edgeFlows[edge.id] = {};
        if (!ctx.edgeFlows[edge.id][rt]) ctx.edgeFlows[edge.id][rt] = new Decimal(0);
        return new Decimal(0);
    }

    const material = RESOURCE_STATES[rt] || 'solid';
    const edgeTier = edge.data?.tier ?? 0;
    const globalTier = ctx.get().edgeTiers[material] || 0;
    const tier = Math.max(edgeTier, globalTier);
    const capPerSec = new Decimal(60 * Math.pow(2, tier));
    const edgeFlowObj = ctx.edgeFlows[edge.id] || {};
    const alreadyPushedAll = Object.values(edgeFlowObj).reduce((sum: Decimal, val) => sum.plus(val || new Decimal(0)), new Decimal(0));
    const maxPush = Decimal.max(new Decimal(0), capPerSec.times(ctx.dtSeconds).minus(alreadyPushedAll));

    const targetNode = ctx.nodesById[edge.target];
    const isSink = targetNode?.type === 'sink' || targetNode?.type === 'antenna';
    const isLogistics = targetNode?.type === 'splitter' || targetNode?.type === 'merger';

    // Capacity calculation moved inside to support per-resource or global checks
    const targetLevel = targetNode?.data?.level || 0;
    const levelMult = Math.pow(2, targetLevel);
    const resolvedMaxBuf = isSink
        ? new Decimal(Infinity)
        : (isLogistics ? new Decimal(1000000) : (targetNode?.data?.maxBuffer ? new Decimal(targetNode.data.maxBuffer) : new Decimal(5000).times(levelMult)));

    const bufObj = targetNode?.data?.inputBuffer || {};
    const currentAmtForType = new Decimal(bufObj[rt] as any || 0);
    const incomingForType = ctx.nodeIncoming[edge.target]?.[rt] || new Decimal(0);

    let leftoverSpace = isSink ? new Decimal(Infinity) : Decimal.max(0, resolvedMaxBuf.minus(currentAmtForType).minus(incomingForType));

    // Special case: Antenna (Uploader) is a sink but still limited by ACTUAL cloud storage capacity
    if (targetNode?.type === 'antenna') {
        const curCloudAmt = ctx.nextCloudStorage[rt] || new Decimal(0);
        const cloudLevel = ctx.get().cloudLevel || 1;
        const cloudCap = new Decimal(5000).times(Math.pow(2, cloudLevel - 1));

        // Use the SHARED reservation to see what's already been pushed to the cloud in THIS tick
        const reservedTotal = ctx.cloudConsumptionReservation[rt] || new Decimal(0);
        const cloudSpace = Decimal.max(0, cloudCap.minus(curCloudAmt).minus(reservedTotal));

        leftoverSpace = Decimal.min(leftoverSpace, cloudSpace);
    }

    const actualPush = Decimal.min(amt, Decimal.min(maxPush, leftoverSpace));

    const isBottleneck = maxPush.lt(amt) && maxPush.lte(leftoverSpace);
    ctx.edgeBottlenecks[edge.id] = (ctx.edgeBottlenecks[edge.id] || false) || isBottleneck;

    mergeResourceMaps(ctx.nodeIncoming, edge.target, rt, actualPush);
    if (!ctx.edgeFlows[edge.id]) ctx.edgeFlows[edge.id] = {};
    const cur = ctx.edgeFlows[edge.id][rt] || new Decimal(0);
    ctx.edgeFlows[edge.id][rt] = cur.plus(actualPush);

    // If pushing to antenna, update the global reservaton
    if (targetNode?.type === 'antenna') {
        const res = ctx.cloudConsumptionReservation[rt] || new Decimal(0);
        ctx.cloudConsumptionReservation[rt] = res.plus(actualPush);
    }

    return actualPush;
};

export const pushToMultipleEdges = (ctx: TickContext, targetEdges: Edge[], resType: ResourceType, totalGain: Decimal) => {
    let pushedTotal = new Decimal(0);
    let remainder = totalGain;

    // Deduplicate edges to prevent split divisor inflation from overlayed UI edges
    const uniqueEdges = targetEdges.filter((e, index, self) =>
        index === self.findIndex((t) => t.target === e.target && t.targetHandle === e.targetHandle)
    );
    let activeEdges = [...uniqueEdges];

    while (remainder.gt(0.001) && activeEdges.length > 0) {
        const amountPerEdge = remainder.dividedBy(activeEdges.length);
        let nextActiveEdges: Edge[] = [];
        let anyPushed = false;

        for (const edge of activeEdges) {
            const pushed = pushToEdge(ctx, edge, resType, amountPerEdge);
            remainder = remainder.minus(pushed);
            pushedTotal = pushedTotal.plus(pushed);

            if (pushed.gt(0)) anyPushed = true;
            if (pushed.gte(amountPerEdge.times(0.99))) {
                nextActiveEdges.push(edge);
            }
        }
        if (!anyPushed) break;
        activeEdges = nextActiveEdges;
    }
    return pushedTotal;
};

export const getAbsPosition = (ctx: TickContext, n: Node<NodeData>) => {
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
    if (dt <= 0) return (lastVal !== undefined && lastVal !== null) ? new Decimal(lastVal) : currentVal;

    // Hard cutoff for zero: if current is 0 and last is small, snap to 0 immediately
    // This prevents "ghost flow" (lingering numbers like 100-200) when production stops.
    if (currentVal.eq(0)) {
        const lastDec = (lastVal !== undefined && lastVal !== null) ? new Decimal(lastVal) : new Decimal(0);
        if (lastDec.lt(1)) return new Decimal(0);
        // Faster decay when current is zero
        tau = tau * 0.4;
    }

    const alpha = 1 - Math.exp(-dt / tau);
    const prev = (lastVal !== undefined && lastVal !== null) ? new Decimal(lastVal) : currentVal;

    // Hysteresis: skip update if change is negligible (< 0.05%) 
    // to prevent UI flicker of tiny decimal fluctuations in steady state
    if (prev.gt(0) && currentVal.gt(0)) {
        const diff = currentVal.minus(prev).abs();
        const pct = diff.dividedBy(prev);
        if (pct.lt(0.0005) && dt < 1) return prev;
    }

    const result = prev.times(1 - alpha).plus(currentVal.times(alpha));

    // Final safety snap to zero
    return result.lt(0.01) ? new Decimal(0) : result;
};
