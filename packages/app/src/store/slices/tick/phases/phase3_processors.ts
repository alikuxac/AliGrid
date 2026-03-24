import { Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData, RecipeConfig } from '../../../types';
import { NodeTemplate } from '@aligrid/schema';
import { TickContext } from '../types';
import { addStat, getEdgeBackpressure, pushToEdge, pushToMultipleEdges } from '../helpers';
import { isProcessor } from '../../../helpers';
import { FALLBACK_NODES } from '../../../../config/fallbackNodes';

export const updateProcessorsAndAssemblers = (ctx: TickContext) => {
    const { nextNodes, inEdgesByTarget, outEdgesBySource, dtSeconds, nodeIncoming, edgeBackpressures, nodesById, state } = ctx;

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

        for (const [rt, amt] of Object.entries(incoming)) {
            if (amt && (amt as Decimal).gt(0)) {
                const curAmt = bufferObj[rt] ? new Decimal(bufferObj[rt] as any) : new Decimal(0);
                bufferObj[rt] = curAmt.plus(amt as Decimal).toString();
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

        const Level = node.data.level || 0;
        const multiplier = Math.pow(2, Level);

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
            for (let i = 0; i < inTypes.length; i++) {
                const t = inTypes[i];
                const rate = inRates[i] || new Decimal(1);
                const reqAmt = rate.times(multiplier);
                reqAmountsMap[t] = reqAmt;

                const amt = bufferObj[t] ? new Decimal(bufferObj[t] as any) : new Decimal(0);
                const c = amt.dividedBy(reqAmt).floor();
                if (c.lt(crafts)) crafts = c;
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

        for (const edge of (inEdgesByTarget[node.id] || [])) {
            edgeBackpressures[edge.id] = new Decimal(1);
        }

        const inputPerSec = dtSeconds > 0 ? realConsumed.dividedBy(dtSeconds) : new Decimal(0);
        const outputPerSec = dtSeconds > 0 ? pushedTotalMain.dividedBy(dtSeconds) : new Decimal(0);

        node.data = {
            ...node.data,
            actualInputPerSec: inputPerSec,
            actualOutputPerSec: outputPerSec,
            efficiency: maxCraftsCount.gt(0) ? new Decimal(1) : new Decimal(0),
            inputEfficiency: new Decimal(1),
            inputBuffer: bufferObj,
        };
    }

    // ═══ Phase 3: Processors ═══
    for (const node of processorsNodes) {
        const incoming = nodeIncoming[node.id] || {};
        const currentBuffer = typeof node.data.inputBuffer === 'object' && node.data.inputBuffer ? node.data.inputBuffer : {};
        const inputBufferObj: Record<string, string> = { ...currentBuffer as any };

        let hasNewData = false;
        for (const [rt, amt] of Object.entries(incoming)) {
            if (amt && (amt as Decimal).gt(0)) {
                const curAmt = inputBufferObj[rt] ? new Decimal(inputBufferObj[rt] as any) : new Decimal(0);
                inputBufferObj[rt] = curAmt.plus(amt as Decimal).toString();
                hasNewData = true;
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
        const level = node.data.level || 0;
        let multiplier = Math.pow(2, level);
        const boost = ctx.nodeBoosts?.[node.id] || 1;
        if (boost > 1) {
            multiplier *= boost;
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
        const inEdges = inEdgesByTarget[node.id] || [];

        if (isMultiInputNode && inEdges.length === 0) {
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

            let candidateCrafts = new Decimal(Infinity);
            for (const t of inTypesCandidate) {
                const amt = inputBufferObj[t] ? new Decimal(inputBufferObj[t] as any) : new Decimal(0);
                const crafts = amt.dividedBy(reqCandidates);
                if (crafts.lt(candidateCrafts)) candidateCrafts = crafts;
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
            const r = recipes[0];
            selectedRecipe = r;
            inTypes = typeof r.inputType === 'string' ? r.inputType.split(',').map((t: string) => t.trim()) : [];
            const convRate = new Decimal(r.conversionRate);
            reqAmtPerCraft = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(multiplier);
            outputPerCraft = (convRate.lt(1) ? new Decimal(1) : convRate).times(multiplier);
        }

        const outType = selectedRecipe.outputType as ResourceType;
        const availableMap: Record<string, Decimal> = {};

        for (let j = 0; j < recipes.length; j++) {
            if (j !== activeRecipeIndex) {
                const r = recipes[j];
                const rInTypes = typeof r.inputType === 'string' ? r.inputType.split(',').map((t: string) => t.trim()) : [];
                for (const t of rInTypes) {
                    if (nodeIncoming[node.id]) {
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

        for (const t of inTypes) {
            const rt = t as ResourceType;
            const available = availableMap[t] || new Decimal(0);
            if (nodeIncoming[node.id]) {
                nodeIncoming[node.id]![rt] = available.minus(realConsumed);
            }
            const inEdges = inEdgesByTarget[node.id] || [];
            const isEdge = inEdges[0];
            if (isEdge) {
                edgeBackpressures[isEdge.id] = realConsumeRatio;
            }
            addStat(ctx, 'consumption', rt, realConsumed);
        }

        addStat(ctx, 'production', outType, pushedTotal);
        if (powerReqAmt.gt(0)) {
            const actualEff = powerEfficiency.times(realConsumeRatio);
            addStat(ctx, 'consumption', 'electricity', powerReqAmt.times(actualEff));
        }

        const inputPerSec = dtSeconds > 0 ? realConsumed.dividedBy(dtSeconds) : new Decimal(0);
        const lastInput = node.data.actualInputPerSec ? new Decimal(node.data.actualInputPerSec as any) : inputPerSec;
        const smoothedInput = lastInput.times(0.8).plus(inputPerSec.times(0.2));

        const outputPerSec = dtSeconds > 0 ? pushedTotal.dividedBy(dtSeconds) : new Decimal(0);
        const lastOutput = node.data.actualOutputPerSec ? new Decimal(node.data.actualOutputPerSec as any) : outputPerSec;
        const smoothedOutput = lastOutput.times(0.8).plus(outputPerSec.times(0.2));

        const effCalculated = bp.times(realConsumeRatio).times(powerEfficiency);
        const lastEff = node.data.efficiency ? new Decimal(node.data.efficiency as any) : effCalculated;
        const smoothedEff = lastEff.times(0.8).plus(effCalculated.times(0.2));

        node.data = { ...node.data, actualInputPerSec: smoothedInput, actualOutputPerSec: smoothedOutput, efficiency: smoothedEff, outputBuffer: { ...bufferObj, [outType]: outputBufferStr }, activeRecipeIndex, inputEfficiency, backpressure: realConsumeRatio.toString() };
    }
}
