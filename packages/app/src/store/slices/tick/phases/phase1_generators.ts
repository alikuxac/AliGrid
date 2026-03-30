import type { Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { addStat, addCloudStat, getEdgeBackpressure, pushToMultipleEdges, pushToEdge, smoothValue, safeDecimal, nodeDelta } from '../helpers';
import { isGenerator } from '../../../helpers';
import { CLOUD_BASE_CAPACITY, CLOUD_CAPACITY_GROWTH } from '../../../constants';

export const updateGenerators = (ctx: TickContext) => {
    const { nextNodes, outEdgesBySource, dtSeconds, nextCloudStorage, nodeIncoming, edgeBackpressures, nodeDeltas = {} } = ctx;
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

        const outRate = node.data.outputRate ? safeDecimal(node.data.outputRate) : safeDecimal(0);
        const maxOutputBuffer = node.data.maxBuffer ? safeDecimal(node.data.maxBuffer) : safeDecimal(100);

        const boost = ctx.nodeBoosts?.[node.id] || 1;
        const potentialGain = outRate.times(dtSeconds).times(boost);

        const bufferObj = node.data.outputBuffer || {};
        const bucket = bufferObj[resType] ? safeDecimal(bufferObj[resType]!) : safeDecimal(0);

        // Push-First Logic: Try to push current buffer + everything we COULD produce
        const totalToPush = bucket.plus(potentialGain);
        let pushedTotal = safeDecimal(0);
        if (edgeCount > 0 && totalToPush.gt(0)) {
            // Permissive matching: check if edge sourceHandle matches resource type, or is generic
            const normRT = resType.toLowerCase().replace(/[\s_]/g, '');
            const handleEdges = targetEdges.filter(e => {
                const normSrc = e.sourceHandle?.toLowerCase().replace(/[\s_]/g, '') || '';
                return normSrc === normRT || !e.sourceHandle || normSrc === 'output' || normSrc === 'source';
            });
            pushedTotal = pushToMultipleEdges(ctx, handleEdges, resType, totalToPush);
        }

        // Update buffer with what didn't make it out
        const remainder = Decimal.min(maxOutputBuffer, totalToPush.minus(pushedTotal));
        nodeDelta(ctx, node.id, { outputBuffer: { ...bufferObj, [resType]: remainder.toString() } });

        addStat(ctx, 'production', resType, pushedTotal);

        const outputPerSec = dtSeconds > 0 ? pushedTotal.dividedBy(dtSeconds) : safeDecimal(0);
        // Sync tau to 0.8 for both machine and wire
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 0.8);

        // Efficiency is throughput vs potential. 
        // We use potentialGain as the baseline to show if machine is bottlenecked by wires.
        const instEff = potentialGain.gt(0)
            ? Decimal.min(1.0, pushedTotal.dividedBy(potentialGain))
            : safeDecimal(1);
        const smoothedEff = smoothValue(node.data.efficiency, instEff, dtSeconds, 0.8);

        nodeDelta(ctx, node.id, {
            efficiency: smoothedEff,
            actualOutputPerSec: smoothedOutput,
            debugInfo: `P:${pushedTotal.toFixed(0)}/G:${potentialGain.toFixed(0)}`
        });
    }

    // ═══ Phase 1.5: Miners Pass (Consumes Electricity) ═══
    for (const node of minersNodes) {
        if (node.data.isOff) continue;

        // 1. Process Incoming Resources (Important for Miners with Handles)
        const incoming = nodeIncoming[node.id] || {};
        const currentBuffer = typeof node.data.inputBuffer === 'object' && node.data.inputBuffer ? node.data.inputBuffer : {};
        const bufferObj: Record<string, string> = { ...currentBuffer as any };

        const level = node.data.level || 0;
        let multiplier = Math.pow(2, level);
        const boost = ctx.nodeBoosts?.[node.id] || 1;
        if (boost > 1) {
            multiplier *= boost;
        }

        const maxBuf = node.data.maxBuffer ? safeDecimal(node.data.maxBuffer) : safeDecimal(5000).times(multiplier);

        for (const [rt, amt] of Object.entries(incoming)) {
            const decimalAmt = amt as Decimal;
            if (decimalAmt && decimalAmt.gt(0)) {
                const curAmt = bufferObj[rt] ? safeDecimal(bufferObj[rt] as any) : safeDecimal(0);
                const leftover = Decimal.max(0, maxBuf.minus(curAmt));
                const actualTaken = Decimal.min(decimalAmt, leftover);
                if (actualTaken.gt(0)) {
                    bufferObj[rt] = curAmt.plus(actualTaken).toString();
                }
            }
        }
        node.data.inputBuffer = bufferObj;
        delete nodeIncoming[node.id];

        const resTypeStr = (node.data.resourceType as string) || (node.data?.template as any)?.resource_type as string;
        if (!resTypeStr) continue;

        const resTypes = resTypeStr.split(',').map(r => r.trim() as ResourceType);
        const powerCons = node.data.powerConsumption ? safeDecimal(node.data.powerConsumption) : safeDecimal(0);
        const reqAmt = powerCons.times(dtSeconds).times(boost);

        let wirelessEfficiency = node.data.wirelessEfficiency !== undefined ? safeDecimal(node.data.wirelessEfficiency) : safeDecimal(1);

        // COMBINE: Wired Power (from buffer) + Wireless Power (from grid)
        let powerEfficiency = wirelessEfficiency;
        if (reqAmt.gt(0)) {
            const bufferElectricity = bufferObj['electricity'] ? safeDecimal(bufferObj['electricity']) : safeDecimal(0);
            const bufferPowerEff = Decimal.min(1.0, bufferElectricity.dividedBy(reqAmt));
            powerEfficiency = Decimal.max(wirelessEfficiency, bufferPowerEff);
        }

        const outRate = node.data.outputRate ? safeDecimal(node.data.outputRate) : safeDecimal(0);
        const maxOutputBuffer = node.data.maxBuffer ? safeDecimal(node.data.maxBuffer) : safeDecimal(100).times(multiplier);

        const potentialGain = outRate.times(dtSeconds).times(powerEfficiency).times(boost);
        const outBufferObj = { ...(node.data.outputBuffer || {}) };

        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;

        let firstPushedTotal = safeDecimal(0);
        let first = true;

        // Process outputs: Each resource tries to push its full potential + existing buffer
        for (const rType of resTypes) {
            const bucket = outBufferObj[rType] ? safeDecimal(outBufferObj[rType]!) : safeDecimal(0);
            const totalToPush = bucket.plus(potentialGain);

            let pushedTotal = safeDecimal(0);
            if (edgeCount > 0 && totalToPush.gt(0)) {
                // Better matching: check if edge sourceHandle matches resource type, or is generic
                const normRT = rType.toLowerCase().replace(/[\s_]/g, '');
                const handleEdges = targetEdges.filter(e => {
                    const normSrc = e.sourceHandle?.toLowerCase().replace(/[\s_]/g, '') || '';
                    return normSrc === normRT || !e.sourceHandle || e.sourceHandle === 'output' || e.sourceHandle === 'source';
                });
                pushedTotal = pushToMultipleEdges(ctx, handleEdges, rType, totalToPush);
            }

            const remainder = Decimal.min(maxOutputBuffer, totalToPush.minus(pushedTotal));
            outBufferObj[rType] = remainder.toString();

            addStat(ctx, 'production', rType, pushedTotal);

            if (first) {
                firstPushedTotal = pushedTotal;
                first = false;
            }
        }
        node.data.outputBuffer = outBufferObj;

        // 3. Consume Power (Subtract from buffer if used)
        if (reqAmt.gt(0)) {
            const actualOutEff = potentialGain.gt(0) ? firstPushedTotal.dividedBy(potentialGain) : (powerEfficiency.gt(0) ? safeDecimal(1) : safeDecimal(0));
            const totalPowerEff = powerEfficiency.times(Decimal.min(1.0, actualOutEff));
            const amountToConsume = reqAmt.times(totalPowerEff);

            // Subtract from buffer if available
            const bufferElectricity = bufferObj['electricity'] ? safeDecimal(bufferObj['electricity']) : safeDecimal(0);
            if (bufferElectricity.gt(0)) {
                const takenFromBuffer = Decimal.min(bufferElectricity, amountToConsume);
                bufferObj['electricity'] = bufferElectricity.minus(takenFromBuffer).toString();
            }

            addStat(ctx, 'consumption', 'electricity', amountToConsume);
        }
        node.data.inputBuffer = bufferObj;

        // 4. Set Backpressure for electricity handle
        const inEdges = ctx.inEdgesByTarget[node.id] || [];
        for (const edge of inEdges) {
            if (edge.targetHandle === 'electricity' || (edge.data as any)?.resourceType === 'electricity') {
                const currentElec = bufferObj['electricity'] ? safeDecimal(bufferObj['electricity']) : safeDecimal(0);
                edgeBackpressures[edge.id] = currentElec.lt(maxBuf) ? safeDecimal(1) : safeDecimal(0);
            }
        }

        const outputPerSec = dtSeconds > 0 ? firstPushedTotal.dividedBy(dtSeconds) : safeDecimal(0);
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 0.8);

        const instEff = potentialGain.gt(0) ? Decimal.min(1.0, firstPushedTotal.dividedBy(potentialGain)) : powerEfficiency;
        const smoothedEff = smoothValue(node.data.efficiency, instEff, dtSeconds, 0.8);

        nodeDelta(ctx, node.id, {
            efficiency: smoothedEff,
            actualOutputPerSec: smoothedOutput,
            wirelessEfficiency: powerEfficiency, // Report combined power status to UI
            inputBuffer: bufferObj,
            outputBuffer: outBufferObj,
            debugInfo: `P:${firstPushedTotal.toFixed(0)}|G:${potentialGain.toFixed(1)}|E:${powerEfficiency.toFixed(2)}`
        });
    }

    // ═══ Phase 1.6: Cloud Downloaders ═══
    for (const node of downloadersNodes) {
        const resType = node.type === 'powerReceiver' ? 'electricity' : (node.data.resourceType as ResourceType);
        if (resType) {
            const targetEdges = outEdgesBySource[node.id] || [];
            const edgeCount = targetEdges.length;

            if (edgeCount > 0) {
                // Determine the correct global tier based on resource matter state
                const item = ctx.itemRegistry?.[resType];
                const resState = (item?.type || 'solid').toLowerCase();
                const currentGlobalTier = ctx.edgeTiers?.[resState] ?? ctx.downloaderTier ?? 0;

                const level = node.data?.level || 0;
                const lvlMult = Math.pow(2, level);

                // UNIFIED RATE: base 60 scaled by tier and level
                const tierRate = safeDecimal(60).times(Math.pow(2, currentGlobalTier)).times(lvlMult);

                // Throttle Percent (0-100) from user slider
                const throttlePercent = node.data?.cloudReservePercent !== undefined ? Number(node.data.cloudReservePercent) : 100;

                // Identify base rate (template rate OR wire tier rate)
                // We prioritize tierRate logic for Downloaders to maintain industrial consistency
                const baseRate = tierRate;

                // Final rate = base rate throttled by user setting
                const rate = baseRate.times(throttlePercent / 100);
                const demand = rate.times(dtSeconds);
                const currentCloud = nextCloudStorage[resType] || safeDecimal(0);

                // Consumption limited by cloud availability
                const availableToTake = Decimal.min(demand, currentCloud);
                let consumed = safeDecimal(0);

                if (availableToTake.gt(0)) {
                    // Try to push up to availableToTake across all outputs
                    consumed = pushToMultipleEdges(ctx, targetEdges, resType, availableToTake);

                    if (consumed.gt(0)) {
                        nextCloudStorage[resType] = Decimal.max(0, currentCloud.minus(consumed));
                        addStat(ctx, 'production', resType, consumed);
                        addCloudStat(ctx, 'consumption', resType, consumed);
                    }
                }

                const outPerSec = dtSeconds > 0 ? consumed.dividedBy(dtSeconds) : safeDecimal(0);
                const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outPerSec, dtSeconds, 0.8);

                const instEff = demand.gt(0) ? consumed.dividedBy(demand) : safeDecimal(1);
                const smoothedEff = smoothValue(node.data.efficiency, instEff, dtSeconds, 0.8);

                nodeDelta(ctx, node.id, {
                    actualOutputPerSec: smoothedOutput,
                    efficiency: smoothedEff
                });
            }
        }
    }
};
