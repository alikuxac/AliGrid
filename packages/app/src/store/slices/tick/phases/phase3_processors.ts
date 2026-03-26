import { Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData, RecipeConfig } from '../../../types';
import { NodeTemplate } from '@aligrid/schema';
import { TickContext } from '../types';
import { addStat, getEdgeBackpressure, pushToEdge, pushToMultipleEdges, smoothValue } from '../helpers';
import { isProcessor } from '../../../helpers';
import { FALLBACK_NODES } from '../../../../config/fallbackNodes';
import { RESOURCE_STATES } from '../../../constants';

export const updateProcessorsAndAssemblers = (ctx: TickContext) => {
    const { nextNodes, inEdgesByTarget, outEdgesBySource, dtSeconds, nodeIncoming, edgeBackpressures, nodesById, state, nodeDeltas = {} } = ctx;
    ctx.nodeDeltas = nodeDeltas;

    const assemblersNodes: Node<NodeData>[] = [];
    const processorsNodes: Node<NodeData>[] = [];

    nextNodes.forEach((node: Node<NodeData>) => {
        const category = node.data?.template?.category;
        if (node.type === 'cobbleGen' || category === 'assembler') {
            assemblersNodes.push(node);
        } else if (isProcessor(node) && node.type !== 'cobbleGen') {
            processorsNodes.push(node);
        }
    });

    // ═══ Phase 4: Assemblers (Multi-Input) ═══
    for (const node of assemblersNodes) {
        const incoming = nodeIncoming[node.id] || {};
        const currentBuffer = typeof node.data.inputBuffer === 'object' && node.data.inputBuffer ? node.data.inputBuffer : {};
        const bufferObj: Record<string, string> = { ...currentBuffer as any };

        const Level = node.data.level || 0;
        const multiplierVal = Math.pow(2, Level);
        const maxBuf = node.data.maxBuffer ? new Decimal(node.data.maxBuffer) : new Decimal(5000).times(multiplierVal);

        for (const [rt, amt] of Object.entries(incoming)) {
            const decimalAmt = amt as Decimal;
            if (decimalAmt && decimalAmt.gt(0)) {
                const curAmt = bufferObj[rt] ? new Decimal(bufferObj[rt] as any) : new Decimal(0);
                const leftover = Decimal.max(0, maxBuf.minus(curAmt));
                const actualTaken = Decimal.min(decimalAmt, leftover);

                if (actualTaken.gt(0)) {
                    bufferObj[rt] = curAmt.plus(actualTaken).toString();
                }
            }
        }
        node.data.inputBuffer = bufferObj;
        delete nodeIncoming[node.id];

        if (node.data.isOff) {
            const inEdges = inEdgesByTarget[node.id] || [];
            for (const edge of inEdges) {
                edgeBackpressures[edge.id] = new Decimal(0);
            }
            node.data = { ...node.data, actualInputPerSec: new Decimal(0), actualOutputPerSec: new Decimal(0), efficiency: new Decimal(0), inputEfficiency: new Decimal(0) };
            continue;
        }

        let multiplier = multiplierVal;
        const boost = ctx.nodeBoosts?.[node.id] || 1;
        if (boost > 1) {
            multiplier *= boost;
        }

        const recipes = node.data.recipes || (node.data.recipe ? [node.data.recipe] : []);
        let selectedRecipe = recipes[node.data.activeRecipeIndex || 0] || recipes[0];

        const inEdges = inEdgesByTarget[node.id] || [];
        const connectedInputs = new Set<string>();

        inEdges.forEach((e) => {
            const srcNode = nodesById[e.source];
            if (srcNode) {
                const outType = srcNode.data?.recipe?.outputType || srcNode.data?.template?.output_type || srcNode.data?.resourceType;
                if (outType) {
                    outType.split(',').forEach((o: any) => connectedInputs.add(o.trim()));
                }
            }
        });

        const matchedRecipe = recipes.find((r: any) => {
            const tIn = typeof r.inputType === 'string' ? r.inputType.split(',').map((t: any) => t.trim()) : [];
            if (tIn.length === 0) return false;
            return tIn.every((t: any) => connectedInputs.has(t));
        });

        if (matchedRecipe) {
            selectedRecipe = matchedRecipe;
        }

        if (!selectedRecipe) continue;

        const outTypes = typeof selectedRecipe.outputType === 'string'
            ? selectedRecipe.outputType.split(',').map((o: any) => o.trim())
            : [selectedRecipe.outputType];
        const inTypes = typeof selectedRecipe.inputType === 'string' ? selectedRecipe.inputType.split(',').map((t) => t.trim()) : [];

        const convRate = new Decimal(selectedRecipe.conversionRate);
        const outputPerCraft = (convRate.lt(1) ? new Decimal(1) : convRate).times(multiplier);

        const inRates = typeof (selectedRecipe as any).inputRates === 'string'
            ? (selectedRecipe as any).inputRates.split(',').map((r: string) => new Decimal(r.trim()))
            : inTypes.map(() => convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1));

        const outBuffer = node.data.outputBuffer || {};
        const maxOutBuffer = node.data.maxBuffer || 5000;

        let crafts = new Decimal(Infinity);

        for (let idx = 0; idx < outTypes.length; idx++) {
            const outT = outTypes[idx];
            const currentAmt = outBuffer[outT] ? new Decimal(outBuffer[outT] as any) : new Decimal(0);
            const itemGainPerCraft = idx === 0 ? outputPerCraft : outputPerCraft.times(0.3);

            const leftoverSpace = Decimal.max(0, new Decimal(maxOutBuffer).minus(currentAmt));
            const maxByOutput = itemGainPerCraft.gt(0) ? leftoverSpace.dividedBy(itemGainPerCraft).floor() : new Decimal(Infinity);
            if (maxByOutput.lt(crafts)) crafts = maxByOutput;
        }

        const reqAmountsMap: Record<string, Decimal> = {};

        if (inTypes.length > 0) {
            const hasSolidInput = inTypes.some(t => (RESOURCE_STATES[t] || 'solid') === 'solid');

            for (let i = 0; i < inTypes.length; i++) {
                const t = inTypes[i];
                const rate = inRates[i] || new Decimal(1);
                const reqAmt = rate.times(multiplier);
                reqAmountsMap[t] = reqAmt;

                const amt = bufferObj[t] ? new Decimal(bufferObj[t] as any) : new Decimal(0);
                const c = amt.dividedBy(reqAmt).floor();

                const matter = RESOURCE_STATES[t] || 'solid';
                if (matter === 'solid' || !hasSolidInput) {
                    if (c.lt(crafts)) crafts = c;
                }
            }
        } else {
            if (crafts.eq(Infinity)) crafts = new Decimal(1);
        }

        let maxCraftsCount = Decimal.min(new Decimal(100), crafts);
        const realCraftsCount = maxCraftsCount;

        let realConsumed = new Decimal(0);
        const gainMax = outputPerCraft.times(realCraftsCount);

        for (let i = 0; i < inTypes.length; i++) {
            const t = inTypes[i];
            const req = reqAmountsMap[t] || new Decimal(0);
            const consumed = req.times(realCraftsCount);

            const currentAmt = bufferObj[t] ? new Decimal(bufferObj[t] as any) : new Decimal(0);
            bufferObj[t] = Decimal.max(0, currentAmt.minus(consumed)).toString();

            addStat(ctx, 'consumption', t as any, consumed);
            realConsumed = realConsumed.plus(consumed);
        }

        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;

        let pushedTotalMain = new Decimal(0);

        outTypes.forEach((outType: string, idx: number) => {
            const itemGain = idx === 0 ? gainMax : gainMax.times(0.3);
            const bucket = outBuffer[outType] ? new Decimal(outBuffer[outType] as any) : new Decimal(0);
            const totalGain = bucket.plus(itemGain);

            let pushedThisType = new Decimal(0);
            if (edgeCount > 0 && totalGain.gt(0)) {
                pushedThisType = pushToMultipleEdges(ctx, targetEdges, outType, totalGain);
                const remainder = totalGain.minus(pushedThisType);
                outBuffer[outType] = remainder.toString();
            } else {
                outBuffer[outType] = totalGain.toString();
            }

            if (idx === 0) pushedTotalMain = pushedThisType;
            if (outType === 'electricity' && idx === 0) pushedTotalMain = itemGain;

            addStat(ctx, 'production', outType, pushedThisType);
        });

        node.data.outputBuffer = outBuffer;

        const FUEL_RESOURCES = ['coal', 'wood_log', 'leaf', 'lava'];
        for (const edge of (inEdgesByTarget[node.id] || [])) {
            const rtForEdge = edge.data?.resourceType || '';
            const isFuelEdge = edge.targetHandle === 'fuel';
            const resourceIsFuel = FUEL_RESOURCES.includes(rtForEdge);

            const currentAmt = bufferObj[rtForEdge] ? new Decimal(bufferObj[rtForEdge] as any) : new Decimal(0);
            const bp = currentAmt.lt(maxBuf) ? new Decimal(1) : new Decimal(0);

            if ((isFuelEdge && resourceIsFuel) || (!isFuelEdge && !resourceIsFuel) || !edge.targetHandle) {
                edgeBackpressures[edge.id] = bp;
            }
        }

        const inputPerSec = dtSeconds > 0 ? realConsumed.dividedBy(dtSeconds) : new Decimal(0);
        const outputPerSec = dtSeconds > 0 ? pushedTotalMain.dividedBy(dtSeconds) : new Decimal(0);
        const smoothedInput = smoothValue(node.data.actualInputPerSec, inputPerSec, dtSeconds, 1.0);
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 1.0);
        const instantEff = maxCraftsCount.gt(0) ? new Decimal(1) : new Decimal(0);
        const smoothedEff = smoothValue(node.data.efficiency, instantEff, dtSeconds, 1.0);

        nodeDeltas[node.id] = {
            ...nodeDeltas[node.id],
            actualInputPerSec: smoothedInput,
            actualOutputPerSec: smoothedOutput,
            efficiency: smoothedEff,
            inputEfficiency: new Decimal(1),
            inputBuffer: bufferObj,
        };
    }

    // ═══ Phase 3: Processors ═══
    for (const node of processorsNodes) {
        const incoming = nodeIncoming[node.id] || {};
        const currentBuffer = typeof node.data.inputBuffer === 'object' && node.data.inputBuffer ? node.data.inputBuffer : {};
        const inputBufferObj: Record<string, string> = { ...currentBuffer as any };

        const level = node.data.level || 0;
        let multiplier = Math.pow(2, level);
        const boost = ctx.nodeBoosts?.[node.id] || 1;
        if (boost > 1) {
            multiplier *= boost;
        }
        const maxBuf = node.data.maxBuffer ? new Decimal(node.data.maxBuffer) : new Decimal(5000).times(multiplier);

        let hasNewData = false;
        for (const [rt, amt] of Object.entries(incoming)) {
            const decimalAmt = amt as Decimal;
            if (decimalAmt && decimalAmt.gt(0)) {
                const curAmt = inputBufferObj[rt] ? new Decimal(inputBufferObj[rt] as any) : new Decimal(0);

                // Respect per-resource capacity (usually consumption_per_tick * some buffer multiplier, but we use maxBuf here)
                const leftover = Decimal.max(0, maxBuf.minus(curAmt));
                const actualTaken = Decimal.min(decimalAmt, leftover);

                if (actualTaken.gt(0)) {
                    inputBufferObj[rt] = curAmt.plus(actualTaken).toString();
                    hasNewData = true;
                }
            }
        }
        if (hasNewData) {
            node.data.inputBuffer = inputBufferObj;
            delete nodeIncoming[node.id];
        }

        if (node.data.isOff) {
            const inEdges = inEdgesByTarget[node.id] || [];
            for (const edge of inEdges) {
                edgeBackpressures[edge.id] = new Decimal(0);
            }
            node.data = { ...node.data, actualInputPerSec: new Decimal(0), actualOutputPerSec: new Decimal(0), efficiency: new Decimal(0) };
            continue;
        }


        let powerEfficiency = node.data.wirelessEfficiency !== undefined ? new Decimal(node.data.wirelessEfficiency) : new Decimal(1);
        const isElectricityProducer = node.data?.recipe?.outputType === 'electricity' || node.type === 'hydroGenerator' || node.type === 'accumulator' || (node.data?.recipes && Array.isArray(node.data.recipes) && (node.data.recipes as RecipeConfig[]).some(r => r.outputType === 'electricity'));
        if (isElectricityProducer && node.data.productionEfficiency !== undefined) {
            powerEfficiency = new Decimal(node.data.productionEfficiency);
        }

        let powerReqAmt = new Decimal(0);
        if (node.data.powerConsumption) {
            powerReqAmt = new Decimal(node.data.powerConsumption).times(dtSeconds);
        }

        const template = state.nodeTemplates.find((t: NodeTemplate) => t.id === node.type) || FALLBACK_NODES.find((t: any) => t.id === node.type);
        const recipes = node.data.recipes || (node.data.recipe ? [node.data.recipe] : []) || (template as any)?.recipes || [];
        if (recipes.length === 0) continue;

        const isMultiInputNode = recipes.length > 1;
        const inEdgesCurrent = inEdgesByTarget[node.id] || [];

        if (isMultiInputNode && inEdgesCurrent.length === 0) {
            if (nodeIncoming[node.id]) {
                for (const t of Object.keys(nodeIncoming[node.id])) {
                    nodeIncoming[node.id][t as ResourceType] = new Decimal(0);
                }
            }
        }

        let selectedRecipe = recipes[0];
        let reqAmtPerCraft = new Decimal(1);
        let outputPerCraft = new Decimal(1);
        let inTypes: string[] = [];
        let maxCrafts = new Decimal(0);
        let activeRecipeIndex = node.data.activeRecipeIndex || 0;
        let inputEfficiency = new Decimal(0);

        for (let i = 0; i < recipes.length; i++) {
            const r = recipes[i];
            const inTypesCandidate = typeof r.inputType === 'string' ? r.inputType.split(',').map((t: string) => t.trim()) : [];
            const convRate = new Decimal(r.conversionRate);
            const reqCandidates = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(multiplier);
            const outCandidate = (convRate.lt(1) ? new Decimal(1) : convRate).times(multiplier);

            const hasSolidInput = inTypesCandidate.some(t => (RESOURCE_STATES[t] || 'solid') === 'solid');

            let candidateCrafts = new Decimal(Infinity);
            for (const t of inTypesCandidate) {
                const amt = inputBufferObj[t] ? new Decimal(inputBufferObj[t] as any) : new Decimal(0);
                const crafts = amt.dividedBy(reqCandidates);
                const matter = RESOURCE_STATES[t] || 'solid';
                if (matter === 'solid' || !hasSolidInput) {
                    if (crafts.lt(candidateCrafts)) candidateCrafts = crafts;
                }
            }
            if (candidateCrafts.eq(Infinity) && inTypesCandidate.length > 0) candidateCrafts = new Decimal(0);
            const fuelCrafts = candidateCrafts;

            const maxSpeedCrafts = new Decimal(dtSeconds).times(powerEfficiency);
            if (candidateCrafts.gt(maxSpeedCrafts)) candidateCrafts = maxSpeedCrafts;

            if (candidateCrafts.gt(0)) {
                selectedRecipe = r;
                reqAmtPerCraft = reqCandidates;
                outputPerCraft = outCandidate;
                inTypes = inTypesCandidate;
                maxCrafts = candidateCrafts;
                activeRecipeIndex = i;
                inputEfficiency = Decimal.min(1, fuelCrafts.dividedBy(dtSeconds));
                break;
            }
        }

        if (maxCrafts.eq(0)) {
            const lastIdx = node.data.activeRecipeIndex ?? 0;
            const r = recipes[lastIdx] || recipes[0];
            selectedRecipe = r;
            inTypes = typeof r.inputType === 'string' ? r.inputType.split(',').map((t: string) => t.trim()) : [];
            const convRate = new Decimal(r.conversionRate);
            reqAmtPerCraft = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(multiplier);
            outputPerCraft = (convRate.lt(1) ? new Decimal(1) : convRate).times(multiplier);
            activeRecipeIndex = lastIdx;
        }

        const outType = selectedRecipe.outputType as ResourceType;
        const availableMap: Record<string, Decimal> = {};

        const activeInTypes = new Set(inTypes);
        for (let j = 0; j < recipes.length; j++) {
            if (j !== activeRecipeIndex) {
                const r = recipes[j];
                const rInTypes = typeof r.inputType === 'string' ? r.inputType.split(',').map((t: string) => t.trim()) : [];
                for (const t of rInTypes) {
                    if (!activeInTypes.has(t) && nodeIncoming[node.id]) {
                        nodeIncoming[node.id][t as ResourceType] = new Decimal(0);
                    }
                }
            }
        }

        for (const t of inTypes) {
            const amt = nodeIncoming[node.id]?.[t as ResourceType] || new Decimal(0);
            availableMap[t] = amt;
        }
        const bp = getEdgeBackpressure(ctx, node.id);
        const actualConsumeMax = maxCrafts.eq(Infinity) ? new Decimal(0) : maxCrafts;
        const gainMax = actualConsumeMax.times(outputPerCraft);
        const bufferObj = node.data.outputBuffer || {};
        const bucket = bufferObj[outType] ? new Decimal(bufferObj[outType]!) : new Decimal(0);
        const totalGainMax = bucket.plus(gainMax);

        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;

        let pushedTotal = new Decimal(0);
        if (isElectricityProducer) {
            pushedTotal = gainMax;
        } else if (edgeCount > 0) {
            if (totalGainMax.gt(0)) {
                const producedPerEdge = totalGainMax.dividedBy(edgeCount);
                for (const edge of targetEdges) {
                    const pushed = pushToEdge(ctx, edge, outType, producedPerEdge);
                    pushedTotal = pushedTotal.plus(pushed);
                }
            }
        }

        const takenFromBucket = Decimal.min(bucket, pushedTotal);
        const remainderPushed = pushedTotal.minus(takenFromBucket);
        let actualCrafts = outputPerCraft.gt(0) ? remainderPushed.dividedBy(outputPerCraft) : new Decimal(0);
        if (actualCrafts.gt(maxCrafts)) actualCrafts = maxCrafts;

        const realConsumed = actualCrafts.times(reqAmtPerCraft);

        const newBucket = bucket.minus(takenFromBucket);
        const outputBufferStr = newBucket.toString();

        const realConsumeRatio = maxCrafts.gt(0) ? actualCrafts.dividedBy(maxCrafts) : new Decimal(0);

        const FUEL_RESOURCES = ['coal', 'wood_log', 'leaf', 'lava'];
        const inEdges = inEdgesByTarget[node.id] || [];

        for (const t of inTypes) {
            const rt = t as ResourceType;
            const currentAmt = inputBufferObj[t] ? new Decimal(inputBufferObj[t] as any) : new Decimal(0);
            inputBufferObj[rt] = Decimal.max(0, currentAmt.minus(realConsumed)).toString();

            // Calculate backpressure for this specific resource type
            // If we have less than maxBuf, backpressure = 1 (requesting)
            // If we are full, backpressure = 0 (blocking)
            const bpForResource = currentAmt.lt(maxBuf) ? new Decimal(1) : new Decimal(0);

            // Find edges providing this resource and update their context-specific backpressure
            for (const edge of inEdges) {
                const isFuelEdge = edge.targetHandle === 'fuel';
                const resourceIsFuel = FUEL_RESOURCES.includes(rt);

                if ((isFuelEdge && resourceIsFuel) || (!isFuelEdge && !resourceIsFuel)) {
                    edgeBackpressures[edge.id] = bpForResource;
                }
            }

            addStat(ctx, 'consumption', rt, realConsumed);
        }

        addStat(ctx, 'production', outType, pushedTotal);
        if (powerReqAmt.gt(0)) {
            const actualEff = powerEfficiency.times(realConsumeRatio);
            addStat(ctx, 'consumption', 'electricity', powerReqAmt.times(actualEff));
        }

        const inputPerSec = dtSeconds > 0 ? realConsumed.dividedBy(dtSeconds) : new Decimal(0);
        const smoothedInput = smoothValue(node.data.actualInputPerSec, inputPerSec, dtSeconds, 1.0);

        const outputPerSec = dtSeconds > 0 ? pushedTotal.dividedBy(dtSeconds) : new Decimal(0);
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 1.0);

        const effCalculated = bp.times(realConsumeRatio).times(powerEfficiency);
        const smoothedEff = smoothValue(node.data.efficiency, effCalculated, dtSeconds, 1.0);

        nodeDeltas[node.id] = {
            ...nodeDeltas[node.id],
            actualInputPerSec: smoothedInput,
            actualOutputPerSec: smoothedOutput,
            efficiency: smoothedEff,
            inputBuffer: inputBufferObj,
            outputBuffer: { ...bufferObj, [outType]: outputBufferStr },
            activeRecipeIndex,
            inputEfficiency,
            backpressure: realConsumeRatio.toString()
        };
    }
}
