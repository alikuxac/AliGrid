import { Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { addStat, getEdgeBackpressure, pushToMultipleEdges, pushToEdge, smoothValue } from '../helpers';
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

        const boost = ctx.nodeBoosts?.[node.id] || 1;
        const potentialGain = outRate.times(dtSeconds).times(boost);

        const bufferObj = node.data.outputBuffer || {};
        const bucket = bufferObj[resType] ? new Decimal(bufferObj[resType]!) : new Decimal(0);

        // Push-First Logic: Try to push current buffer + everything we COULD produce
        const totalToPush = bucket.plus(potentialGain);
        let pushedTotal = new Decimal(0);
        if (edgeCount > 0 && totalToPush.gt(0)) {
            pushedTotal = pushToMultipleEdges(ctx, targetEdges, resType, totalToPush);
        }

        // Update buffer with what didn't make it out
        const remainder = Decimal.min(maxOutputBuffer, totalToPush.minus(pushedTotal));
        nodeDeltas[node.id] = { ...nodeDeltas[node.id], outputBuffer: { ...bufferObj, [resType]: remainder.toString() } };

        addStat(ctx, 'production', resType, pushedTotal);

        const outputPerSec = dtSeconds > 0 ? pushedTotal.dividedBy(dtSeconds) : new Decimal(0);
        // Sync tau to 0.8 for both machine and wire
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 0.8);

        // Efficiency is throughput vs potential. 
        // We use potentialGain as the baseline to show if machine is bottlenecked by wires.
        const instEff = potentialGain.gt(0)
            ? Decimal.min(1.0, pushedTotal.dividedBy(potentialGain))
            : new Decimal(1);
        const smoothedEff = smoothValue(node.data.efficiency, instEff, dtSeconds, 0.8);

        nodeDeltas[node.id] = {
            ...nodeDeltas[node.id],
            efficiency: smoothedEff,
            actualOutputPerSec: smoothedOutput
        };
    }

    // ═══ Phase 1.5: Miners Pass (Consumes Electricity) ═══
    for (const node of minersNodes) {
        if (node.data.isOff) continue;
        const resTypeStr = (node.data.resourceType as string) || (node.data?.template as any)?.resource_type as string;
        if (!resTypeStr) continue;

        const resTypes = resTypeStr.split(',').map(r => r.trim() as ResourceType);
        const powerCons = node.data.powerConsumption ? new Decimal(node.data.powerConsumption) : new Decimal(0);
        const reqAmt = powerCons.times(dtSeconds);

        let wirelessEfficiency = node.data.wirelessEfficiency !== undefined ? new Decimal(node.data.wirelessEfficiency) : new Decimal(1);

        const outRate = node.data.outputRate ? new Decimal(node.data.outputRate) : new Decimal(0);
        const maxOutputBuffer = node.data.maxBuffer ? new Decimal(node.data.maxBuffer) : new Decimal(100);

        const boost = ctx.nodeBoosts?.[node.id] || 1;
        const potentialGain = outRate.times(dtSeconds).times(wirelessEfficiency).times(boost);
        const bufferObj = { ...(node.data.outputBuffer || {}) };

        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;

        let firstPushedTotal = new Decimal(0);
        let first = true;

        // Process outputs: Each resource tries to push its full potential + existing buffer
        for (const rType of resTypes) {
            const bucket = bufferObj[rType] ? new Decimal(bufferObj[rType]!) : new Decimal(0);
            const totalToPush = bucket.plus(potentialGain);

            let pushedTotal = new Decimal(0);
            if (edgeCount > 0 && totalToPush.gt(0)) {
                pushedTotal = pushToMultipleEdges(ctx, targetEdges, rType, totalToPush);
            }

            const remainder = Decimal.min(maxOutputBuffer, totalToPush.minus(pushedTotal));
            bufferObj[rType] = remainder.toString();

            addStat(ctx, 'production', rType, pushedTotal);

            if (first) {
                firstPushedTotal = pushedTotal;
                first = false;
            }
        }
        nodeDeltas[node.id] = { ...nodeDeltas[node.id], outputBuffer: bufferObj };

        if (reqAmt.gt(0)) {
            // Power consumption matches output throughput ratio
            const actualOutEff = potentialGain.gt(0) ? firstPushedTotal.dividedBy(potentialGain) : new Decimal(0);
            const powerEff = wirelessEfficiency.times(Decimal.min(1.0, actualOutEff));
            addStat(ctx, 'consumption', 'electricity', reqAmt.times(powerEff));
        }

        const outputPerSec = dtSeconds > 0 ? firstPushedTotal.dividedBy(dtSeconds) : new Decimal(0);
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 0.8);

        const instEff = potentialGain.gt(0) ? Decimal.min(1.0, firstPushedTotal.dividedBy(potentialGain)) : wirelessEfficiency;
        const smoothedEff = smoothValue(node.data.efficiency, instEff, dtSeconds, 0.8);

        nodeDeltas[node.id] = {
            ...nodeDeltas[node.id],
            efficiency: smoothedEff,
            actualOutputPerSec: smoothedOutput
        };
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
