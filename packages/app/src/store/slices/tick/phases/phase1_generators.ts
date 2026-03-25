import { Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { addStat, getEdgeBackpressure, pushToMultipleEdges, pushToEdge } from '../helpers';
import { isGenerator } from '../../../helpers';

export const updateGenerators = (ctx: TickContext) => {
    const { nextNodes, outEdgesBySource, dtSeconds, nextCloudStorage, nodeDeltas = {} } = ctx;
    ctx.nodeDeltas = nodeDeltas;

    const pumpsNodes: Node<NodeData>[] = [];
    const minersNodes: Node<NodeData>[] = [];
    const downloadersNodes: Node<NodeData>[] = [];

    nextNodes.forEach((node: Node<NodeData>) => {
        if (node.type === 'waterGenerator' || node.type === 'lavaPump') {
            pumpsNodes.push(node);
        } else if (isGenerator(node) && !['waterGenerator', 'lavaPump', 'cobbleGen'].includes(node.type || '')) {
            minersNodes.push(node);
        } else if (node.type === 'downloader' || node.type === 'powerReceiver') {
            downloadersNodes.push(node);
        }
    });

    // ═══ Phase 1: Generators (Pumps) ═══
    for (const node of pumpsNodes) {
        if (node.data.isOff) continue;
        const resType = node.data.resourceType as ResourceType || (node.type === 'lavaPump' ? 'lava' : 'water');
        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;

        const outRate = node.data.outputRate ? new Decimal(node.data.outputRate) : new Decimal(0);
        const maxOutputBuffer = node.data.maxBuffer ? new Decimal(node.data.maxBuffer) : new Decimal(100);
        let potentialGain = outRate.times(dtSeconds);
        const boost = ctx.nodeBoosts?.[node.id] || 1;
        if (boost > 1) {
            potentialGain = potentialGain.times(boost);
        }
        const bufferObj = node.data.outputBuffer || {};
        const bucket = bufferObj[resType] ? new Decimal(bufferObj[resType]!) : new Decimal(0);
        const capacityLeft = Decimal.max(0, maxOutputBuffer.minus(bucket));
        const actualGain = Decimal.min(potentialGain, capacityLeft);
        const totalGain = bucket.plus(actualGain);
        const pumpEff = potentialGain.gt(0) ? actualGain.dividedBy(potentialGain) : new Decimal(1);

        let pushedTotal = new Decimal(0);
        if (edgeCount > 0) {
            if (totalGain.gt(0)) {
                pushedTotal = pushToMultipleEdges(ctx, targetEdges, resType, totalGain);
            }
            const remainder = totalGain.minus(pushedTotal);
            nodeDeltas[node.id] = { ...nodeDeltas[node.id], outputBuffer: { ...bufferObj, [resType]: remainder.toString() } };
        } else {
            // Even without edges, we must persist the accumulated internal buffer
            nodeDeltas[node.id] = { ...nodeDeltas[node.id], outputBuffer: { ...bufferObj, [resType]: totalGain.toString() } };
        }
        addStat(ctx, 'production', resType, pushedTotal);
        const outputPerSec = dtSeconds > 0 ? pushedTotal.dividedBy(dtSeconds) : new Decimal(0);
        const lastOutput = node.data.actualOutputPerSec ? new Decimal(node.data.actualOutputPerSec as any) : outputPerSec;
        const smoothedOutput = lastOutput.times(0.8).plus(outputPerSec.times(0.2));

        const lastEff = node.data.efficiency ? new Decimal(node.data.efficiency as any) : pumpEff;
        const smoothedEff = lastEff.times(0.8).plus(pumpEff.times(0.2));

        nodeDeltas[node.id] = { ...nodeDeltas[node.id], efficiency: smoothedEff, actualOutputPerSec: smoothedOutput };
    }

    // ═══ Phase 1.5: Miners Pass (Consumes Electricity) ═══
    for (const node of minersNodes) {
        if (node.data.isOff) continue;
        const resTypeStr = (node.data.resourceType as string) || (node.data?.template as any)?.resource_type as string;
        if (!resTypeStr) continue;

        const resTypes = resTypeStr.split(',').map(r => r.trim() as ResourceType);
        const powerCons = node.data.powerConsumption ? new Decimal(node.data.powerConsumption) : new Decimal(0);
        const reqAmt = powerCons.times(dtSeconds);

        let efficiency = node.data.wirelessEfficiency !== undefined ? new Decimal(node.data.wirelessEfficiency) : new Decimal(1);

        const outRate = node.data.outputRate ? new Decimal(node.data.outputRate) : new Decimal(0);
        const maxOutputBuffer = node.data.maxBuffer ? new Decimal(node.data.maxBuffer) : new Decimal(100);

        const boost = ctx.nodeBoosts?.[node.id] || 1;
        const potentialGain = outRate.times(dtSeconds).times(efficiency).times(boost);
        const bufferObj = { ...(node.data.outputBuffer || {}) };

        // 1. Calculate minimum efficiency among all outputs (enforce backpressure)
        let minEff = new Decimal(1);
        for (const rType of resTypes) {
            const bucket = bufferObj[rType] ? new Decimal(bufferObj[rType]!) : new Decimal(0);
            const capacityLeft = Decimal.max(0, maxOutputBuffer.minus(bucket));
            const currentEff = potentialGain.gt(0) ? Decimal.min(potentialGain, capacityLeft).dividedBy(potentialGain) : new Decimal(1);
            if (currentEff.lt(minEff)) minEff = currentEff;
        }

        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;

        let firstPushedTotal = new Decimal(0);
        let first = true;

        // 2. Process outputs
        for (const rType of resTypes) {
            const bucket = bufferObj[rType] ? new Decimal(bufferObj[rType]!) : new Decimal(0);
            const actualGain = potentialGain.times(minEff);
            const totalGain = bucket.plus(actualGain);

            let pushedTotal = new Decimal(0);
            if (edgeCount > 0) {
                if (totalGain.gt(0)) {
                    pushedTotal = pushToMultipleEdges(ctx, targetEdges, rType, totalGain);
                }
                const remainder = totalGain.minus(pushedTotal);
                bufferObj[rType] = remainder.toString();
            } else {
                bufferObj[rType] = totalGain.toString();
            }
            addStat(ctx, 'production', rType, pushedTotal);

            if (first) {
                firstPushedTotal = pushedTotal;
                first = false;
            }
        }
        nodeDeltas[node.id] = { ...nodeDeltas[node.id], outputBuffer: bufferObj };

        if (reqAmt.gt(0)) {
            const actualEff = efficiency.times(minEff);
            addStat(ctx, 'consumption', 'electricity', reqAmt.times(actualEff));
        }

        const outputPerSec = dtSeconds > 0 ? firstPushedTotal.dividedBy(dtSeconds) : new Decimal(0);
        const lastOutput = node.data.actualOutputPerSec ? new Decimal(node.data.actualOutputPerSec as any) : outputPerSec;
        const smoothedOutput = lastOutput.times(0.8).plus(outputPerSec.times(0.2));

        const displayEff = efficiency.times(minEff);
        const lastEff = node.data.efficiency ? new Decimal(node.data.efficiency as any) : displayEff;
        const smoothedEff = lastEff.times(0.8).plus(displayEff.times(0.2));

        nodeDeltas[node.id] = { ...nodeDeltas[node.id], efficiency: smoothedEff, actualOutputPerSec: smoothedOutput };
    }

    // ═══ Phase 1.6: Cloud Downloaders ═══
    for (const node of downloadersNodes) {
        const resType = node.type === 'powerReceiver' ? 'electricity' : (node.data.resourceType as ResourceType);
        if (resType) {
            const targetEdges = outEdgesBySource[node.id] || [];
            const edgeCount = targetEdges.length;

            if (edgeCount > 0) {
                const bp = getEdgeBackpressure(ctx, node.id);
                const dlTier = ctx.get().downloaderTier || 0;
                const level = node.data?.level || 0;
                const lvlMult = Math.pow(2, level);
                const defaultRate = node.type === 'powerReceiver' ? new Decimal(2) : new Decimal(1);
                const tierRate = defaultRate.times(Math.pow(2, dlTier)).times(lvlMult);
                const rate = (node.data.outputRate ? Decimal.max(new Decimal(node.data.outputRate).times(lvlMult), tierRate) : tierRate).times(bp);
                const demand = rate.times(dtSeconds);
                const currentCloud = nextCloudStorage[resType] || new Decimal(0);

                const consumed = Decimal.min(demand, currentCloud);
                if (consumed.gt(0)) {
                    nextCloudStorage[resType] = currentCloud.minus(consumed);
                    addStat(ctx, 'production', resType, consumed);

                    const amountPerEdge = consumed.dividedBy(edgeCount);
                    for (const edge of targetEdges) {
                        pushToEdge(ctx, edge, resType, amountPerEdge);
                    }
                }

                const outPerSec = dtSeconds > 0 ? consumed.dividedBy(dtSeconds) : new Decimal(0);
                nodeDeltas[node.id] = {
                    ...nodeDeltas[node.id],
                    actualOutputPerSec: outPerSec,
                    efficiency: demand.gt(0) ? consumed.dividedBy(demand) : new Decimal(1)
                };
            }
        }
    }
};
