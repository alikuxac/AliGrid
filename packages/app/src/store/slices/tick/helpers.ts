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
    const maxBuf = targetNode?.type === 'sink'
        ? new Decimal(Infinity)
        : (targetNode?.data?.maxBuffer ? new Decimal(targetNode.data.maxBuffer) : new Decimal(100));

    const bufObj = targetNode?.data?.inputBuffer || {};
    const currentInBufAll = Object.values(bufObj).reduce((sum: Decimal, v) => sum.plus(new Decimal(v as any || 0)), new Decimal(0));
    const incomingAll = ctx.nodeIncoming[edge.target]
        ? Object.values(ctx.nodeIncoming[edge.target]).reduce((s: Decimal, v) => s.plus(v as Decimal), new Decimal(0))
        : new Decimal(0);

    const leftoverSpace = Decimal.max(0, maxBuf.minus(currentInBufAll).minus(incomingAll));
    const actualPush = Decimal.min(amt, Decimal.min(maxPush, leftoverSpace));

    const isBottleneck = maxPush.lt(amt) && maxPush.lte(leftoverSpace);
    ctx.edgeBottlenecks[edge.id] = (ctx.edgeBottlenecks[edge.id] || false) || isBottleneck;

    mergeResourceMaps(ctx.nodeIncoming, edge.target, rt, actualPush);
    if (!ctx.edgeFlows[edge.id]) ctx.edgeFlows[edge.id] = {};
    const cur = ctx.edgeFlows[edge.id][rt] || new Decimal(0);
    ctx.edgeFlows[edge.id][rt] = cur.plus(actualPush);
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
