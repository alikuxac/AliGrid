import type { Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData, RecipeConfig } from '../../../types';
import { NodeTemplate } from '@aligrid/schema';
import { TickContext } from '../types';
import { addStat, getEdgeBackpressure, pushToEdge, pushToMultipleEdges, smoothValue, safeDecimal, nodeDelta } from '../helpers';
import { isProcessor } from '../../../helpers';
import { FALLBACK_NODES } from '../../../../config/fallbackNodes';

export const updateProcessorsAndAssemblers = (ctx: TickContext) => {
    const { nextNodes, inEdgesByTarget, outEdgesBySource, dtSeconds, nodeIncoming, edgeBackpressures, nodesById, nodeTemplates, nodeDeltas = {} } = ctx;
    ctx.nodeDeltas = nodeDeltas;

    const assemblersNodes: Node<NodeData>[] = [];
    const processorsNodes: Node<NodeData>[] = [];

    nextNodes.forEach((node: Node<NodeData>) => {
        const category = node.data?.template?.category;
        if (node.type === 'cobbleGen' || category === 'assembler') {
            assemblersNodes.push(node);
        } else if ((isProcessor(node) || ['sawmill', 'composter', 'greenhouse', 'bioplasticMixer'].includes(node.type || '')) && node.type !== 'cobbleGen') {
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
        const maxBuf = node.data.maxBuffer ? safeDecimal(node.data.maxBuffer) : safeDecimal(5000).times(multiplierVal);

        for (const [rt, amt] of Object.entries(incoming)) {
            const decimalAmt = safeDecimal(amt);
            if (decimalAmt.gt(0)) {
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

        if (node.data.isOff) {
            const inEdges = inEdgesByTarget[node.id] || [];
            for (const edge of inEdges) {
                edgeBackpressures[edge.id] = safeDecimal(0);
            }
            node.data = { ...node.data, actualInputPerSec: safeDecimal(0), actualOutputPerSec: safeDecimal(0), efficiency: safeDecimal(0), inputEfficiency: safeDecimal(0) };
            continue;
        }

        let multiplier = multiplierVal;
        const boost = ctx.nodeBoosts?.[node.id] || 1;
        if (boost > 1) {
            multiplier *= boost;
        }

        let recipes = node.data.recipes || (node.data.recipe ? [node.data.recipe] : []);
        const templatesArr = Array.isArray(nodeTemplates) ? nodeTemplates : [];
        const fallbackArr = Array.isArray(FALLBACK_NODES) ? FALLBACK_NODES : [];
        const template = templatesArr.find((t: NodeTemplate) => t.id === node.type) || fallbackArr.find((t: any) => t.id === node.type);
        const t = (node.data?.template || template) as any;
        if (recipes.length === 0 && (t?.input_type || t?.output_type || t?.inputType || t?.outputType)) {
            recipes = [{
                inputType: t.inputType || t.input_type || t.resource_type || '',
                outputType: t.outputType || t.output_type || '',
                conversionRate: t.conversionRate || t.conversion_rate || 1
            }];
        }

        let selectedRecipe = recipes[node.data.activeRecipeIndex || 0] || recipes[0];

        const inEdges = inEdgesByTarget[node.id] || [];
        const connectedInputs = new Set<string>();

        inEdges.forEach((e) => {
            const srcNode = nodesById[e.source];
            if (srcNode) {
                const outType = srcNode.data?.recipe?.outputType || srcNode.data?.template?.output_type || srcNode.data?.resourceType;
                if (outType) {
                    outType.split(',').forEach((o: string) => connectedInputs.add(o.trim()));
                }
            }
        });

        const matchedRecipe = recipes.find((r: any) => {
            const tIn = typeof (r.inputType || r.input_type) === 'string' ? (r.inputType || r.input_type).split(',').map((it: string) => it.trim()) : [];
            if (tIn.length === 0) return false;
            return tIn.every((it: string) => connectedInputs.has(it));
        });

        if (matchedRecipe) {
            selectedRecipe = matchedRecipe;
        }

        // ═══ Power Logic for Assemblers ═══
        let wirelessPowerEff = node.data.wirelessEfficiency !== undefined ? safeDecimal(node.data.wirelessEfficiency) : safeDecimal(1);
        const powerGrids = ctx.powerGrids || [];
        const powerGrid = powerGrids.find(g => g.consumers?.some(c => c.id === node.id));
        let powerEfficiency = powerGrid ? powerGrid.efficiency : wirelessPowerEff;

        // Wired Electricity Buffer Check
        const powerConsVal = safeDecimal(node.data.powerConsumption || 0);
        if (powerConsVal.gt(0)) {
            const reqElecTick = powerConsVal.times(dtSeconds).times(boost);
            const bufferElec = bufferObj['electricity'] ? safeDecimal(bufferObj['electricity']) : safeDecimal(0);
            if (bufferElec.gt(0) && reqElecTick.gt(0)) {
                const bufferPowerEff = Decimal.min(1.0, bufferElec.dividedBy(reqElecTick));
                powerEfficiency = Decimal.max(powerEfficiency, bufferPowerEff);
            } else if (!powerGrid && wirelessPowerEff.lte(0)) {
                powerEfficiency = safeDecimal(0);
            }
        }

        const requiresPower = node.data.requiresPower !== undefined ? node.data.requiresPower : (t?.requires_power !== undefined ? !!t.requires_power : true);
        if (powerConsVal.lte(0) || !requiresPower) {
            powerEfficiency = safeDecimal(1);
        }

        if (!selectedRecipe) continue;

        const outTypes = typeof (selectedRecipe.outputType || (selectedRecipe as any).output_type) === 'string'
            ? (selectedRecipe.outputType || (selectedRecipe as any).output_type).split(',').map((o: string) => o.trim())
            : [selectedRecipe.outputType || (selectedRecipe as any).output_type];
        const inTypes = typeof (selectedRecipe.inputType || (selectedRecipe as any).input_type) === 'string'
            ? (selectedRecipe.inputType || (selectedRecipe as any).input_type).split(',').map((it: string) => it.trim()) : [];

        const convRate = safeDecimal(selectedRecipe.conversionRate || (selectedRecipe as any).conversion_rate);
        const outputPerCraft = (convRate.lt(1) ? safeDecimal(1) : convRate).times(multiplier);

        const inRates = typeof (selectedRecipe as any).inputRates === 'string'
            ? (selectedRecipe as any).inputRates.split(',').map((r: string) => safeDecimal(r.trim()))
            : inTypes.map(() => convRate.lt(1) ? safeDecimal(1).dividedBy(convRate).round() : safeDecimal(1));

        const outBuffer = node.data.outputBuffer || {};

        // 1. Calculate how many crafts can actually fit in the output buffers (Buffer-First)
        let maxByStorage = safeDecimal(Infinity);
        for (let idx = 0; idx < outTypes.length; idx++) {
            const outT = outTypes[idx];
            const currentAmt = outBuffer[outT] ? safeDecimal(outBuffer[outT] as any) : safeDecimal(0);
            const itemGainPerCraft = idx === 0 ? outputPerCraft : outputPerCraft.times(0.3);
            const leftoverSpace = Decimal.max(0, maxBuf.minus(currentAmt));

            // For electricity, we only ignore backpressure if the grid REALLY needs power (efficiency < 1)
            const prodEff = node.data?.productionEfficiency ? safeDecimal(node.data.productionEfficiency) : safeDecimal(1);
            if (outT === 'electricity' && prodEff.lt(0.99)) {
                // Grid needs more power, ignore local buffer limits
                continue;
            }

            const canFit = itemGainPerCraft.gt(0) ? leftoverSpace.dividedBy(itemGainPerCraft).floor() : safeDecimal(Infinity);
            if (canFit.lt(maxByStorage)) maxByStorage = canFit;
        }

        const reqAmountsMap: Record<string, Decimal> = {};
        let craftsByInputs = safeDecimal(Infinity);

        if (inTypes.length > 0) {
            const hasSolidInput = inTypes.some((it: string) => {
                const item = ctx.itemRegistry?.[it];
                return (item?.type || 'solid').toLowerCase() === 'solid';
            });

            for (let i = 0; i < inTypes.length; i++) {
                const rt = inTypes[i];
                if (!rt || rt === 'electricity') continue;
                const rate = inRates[i] || safeDecimal(1);
                // Requirement for ONE full craft cycle
                const reqAmt = rate.times(multiplier);
                reqAmountsMap[rt || ''] = reqAmt;

                const amtAvailable = bufferObj[rt || ''] ? safeDecimal(bufferObj[rt || ''] as any) : safeDecimal(0);
                const c = amtAvailable.dividedBy(reqAmt).floor();

                const item = ctx.itemRegistry?.[rt || ''];
                const matter = (item?.type || 'solid').toLowerCase();
                if (matter === 'solid' || !hasSolidInput) {
                    if (c.lt(craftsByInputs)) craftsByInputs = c;
                }
            }
        } else {
            craftsByInputs = safeDecimal(1);
        }

        // 2. Real crafts count (limited by input buffer, speed, power, and output storage)
        const productionEfficiency = node.data?.productionEfficiency ? safeDecimal(node.data.productionEfficiency) : safeDecimal(1);
        const maxCraftsBatch = Decimal.min(safeDecimal(100), craftsByInputs);
        const actualCraftsCount = Decimal.min(maxCraftsBatch, maxByStorage).times(Decimal.min(powerEfficiency, productionEfficiency));
        const totalProducedMain = outputPerCraft.times(actualCraftsCount);

        // 3. Consume inputs
        let realConsumedTotal = safeDecimal(0);
        for (let i = 0; i < inTypes.length; i++) {
            const rt = inTypes[i];
            const req = reqAmountsMap[rt || ''] || safeDecimal(0);
            const consumed = req.times(actualCraftsCount);
            const currentAmt = bufferObj[rt || ''] ? safeDecimal(bufferObj[rt || ''] as any) : safeDecimal(0);
            bufferObj[rt || ''] = Decimal.max(0, currentAmt.minus(consumed)).toString();
            if (rt) {
                addStat(ctx, 'consumption', rt as ResourceType, consumed);
                realConsumedTotal = realConsumedTotal.plus(consumed);
            }
        }

        // Consume electricity from buffer
        if (powerConsVal.gt(0)) {
            const powerTick = powerConsVal.times(dtSeconds).times(boost).times(actualCraftsCount.gt(0) ? safeDecimal(1) : powerEfficiency);
            const curElec = bufferObj['electricity'] ? safeDecimal(bufferObj['electricity']) : safeDecimal(0);
            const consumedElec = Decimal.min(curElec, powerTick);
            bufferObj['electricity'] = curElec.minus(consumedElec).toString();
            addStat(ctx, 'consumption', 'electricity', consumedElec);
        }

        // 4. Update output buffers with produced gain
        outTypes.forEach((outType: string, idx: number) => {
            const gain = idx === 0 ? totalProducedMain : totalProducedMain.times(0.3);
            const cur = outBuffer[outType] ? safeDecimal(outBuffer[outType] as any) : safeDecimal(0);
            outBuffer[outType] = cur.plus(gain).toString();
        });

        // 5. Perform logistics (Push from updated buffers)
        const targetEdges = outEdgesBySource[node.id] || [];
        const edgeCount = targetEdges.length;
        let pushedTotalMain = safeDecimal(0);

        outTypes.forEach((outType: string, idx: number) => {
            const currentBucket = outBuffer[outType] ? safeDecimal(outBuffer[outType] as any) : safeDecimal(0);
            let pushedThisType = safeDecimal(0);

            if (edgeCount > 0 && currentBucket.gt(0)) {
                pushedThisType = pushToMultipleEdges(ctx, targetEdges, outType, currentBucket);
                const remainder = currentBucket.minus(pushedThisType);
                outBuffer[outType] = remainder.toString();
            }

            if (idx === 0) pushedTotalMain = pushedThisType;

            // Production Stat and UI Output reflect the rate of CREATION or EXCRETION
            const creationGain = idx === 0 ? totalProducedMain : totalProducedMain.times(0.3);
            const displayRate = Decimal.max(creationGain, pushedThisType);
            addStat(ctx, 'production', outType as ResourceType, displayRate);
        });

        node.data.outputBuffer = outBuffer;

        const FUEL_RESOURCES = ['coal', 'wood_log', 'leaf', 'lava'];
        for (const edge of (inEdgesByTarget[node.id] || [])) {
            const rtForEdge = edge.data?.resourceType || '';
            const isFuelEdge = edge.targetHandle === 'fuel';
            const isElecEdge = edge.targetHandle === 'electricity' || rtForEdge === 'electricity';
            const isMatchingHandle = edge.targetHandle === rtForEdge;
            const resourceIsFuel = FUEL_RESOURCES.includes(rtForEdge) && !inTypes.includes(rtForEdge);

            const currentAmt = bufferObj[rtForEdge] ? safeDecimal(bufferObj[rtForEdge] as any) : safeDecimal(0);

            // Buffer safety: Ensure capacity is at least 10x the required amount per craft
            const reqForResource = reqAmountsMap[rtForEdge] || (rtForEdge === 'electricity' ? powerConsVal.times(dtSeconds).times(boost) : safeDecimal(1));
            const scaledMaxBuf = Decimal.max(maxBuf, reqForResource.times(10));

            const bp = currentAmt.lt(scaledMaxBuf) ? safeDecimal(1) : safeDecimal(0);

            if (isMatchingHandle || isElecEdge || (isFuelEdge && resourceIsFuel) || (!isFuelEdge && !isElecEdge && !resourceIsFuel) || !edge.targetHandle) {
                edgeBackpressures[edge.id] = bp;
            }
        }

        const inputPerSec = dtSeconds > 0 ? realConsumedTotal.dividedBy(dtSeconds) : safeDecimal(0);
        const outputPerSec = dtSeconds > 0 ? (totalProducedMain.gt(pushedTotalMain) ? totalProducedMain : pushedTotalMain).dividedBy(dtSeconds) : safeDecimal(0);
        const smoothedInput = smoothValue(node.data.actualInputPerSec, inputPerSec, dtSeconds, 1.0);
        const smoothedOutput = smoothValue(node.data.actualOutputPerSec, outputPerSec, dtSeconds, 1.0);
        const instantEff = actualCraftsCount.gt(0) || (powerConsVal.gt(0) && powerEfficiency.gt(0) && craftsByInputs.gt(0)) ? powerEfficiency : safeDecimal(0);
        const smoothedEff = smoothValue(node.data.efficiency, instantEff, dtSeconds, 1.0);

        nodeDelta(ctx, node.id, {
            actualInputPerSec: smoothedInput,
            actualOutputPerSec: smoothedOutput,
            efficiency: smoothedEff,
            inputEfficiency: powerEfficiency,
            inputBuffer: bufferObj,
        });
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
        const maxBuf = node.data.maxBuffer ? safeDecimal(node.data.maxBuffer) : safeDecimal(5000).times(multiplier);

        let hasNewData = false;
        for (const [rt, amt] of Object.entries(incoming)) {
            const decimalAmt = safeDecimal(amt);
            if (decimalAmt.gt(0)) {
                const curAmt = inputBufferObj[rt] ? safeDecimal(inputBufferObj[rt] as any) : safeDecimal(0);

                // Respect per-resource capacity
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
                edgeBackpressures[edge.id] = safeDecimal(0);
            }
            nodeDelta(ctx, node.id, { actualInputPerSec: safeDecimal(0), actualOutputPerSec: safeDecimal(0), efficiency: safeDecimal(0) });
            continue;
        }

        const templatesArr = Array.isArray(nodeTemplates) ? nodeTemplates : [];
        const fallbackArr = Array.isArray(FALLBACK_NODES) ? FALLBACK_NODES : [];
        const template = templatesArr.find((t: NodeTemplate) => t.id === node.type) || fallbackArr.find((t: any) => t.id === node.type);
        const t = (node.data?.template || template) as any;

        let wirelessPowerEff = node.data.wirelessEfficiency !== undefined ? safeDecimal(node.data.wirelessEfficiency) : safeDecimal(1);
        const powerGrids = ctx.powerGrids || [];
        const powerGrid = powerGrids.find(g =>
            g.consumers?.some(c => c.id === node.id) ||
            g.producers?.some(p => p.id === node.id) ||
            g.poles?.some(p => p.id === node.id)
        );

        let powerEfficiency = wirelessPowerEff;
        if (powerGrid) {
            powerEfficiency = powerGrid.efficiency;
        }

        // Buffer-based Electricity (Wired handle)
        const powerConsVal = safeDecimal(node.data.powerConsumption || 0);
        if (powerConsVal.gt(0)) {
            const reqAmt = powerConsVal.times(dtSeconds).times(boost);
            const bufferElec = inputBufferObj['electricity'] ? safeDecimal(inputBufferObj['electricity']) : safeDecimal(0);
            if (bufferElec.gt(0)) {
                const bufferPowerEff = Decimal.min(1.0, bufferElec.dividedBy(reqAmt));
                powerEfficiency = Decimal.max(powerEfficiency, bufferPowerEff);
            }
        }

        const requiresPower = node.data.requiresPower !== undefined ? node.data.requiresPower : (t?.requires_power !== undefined ? !!t.requires_power : true);

        // Robust power check: if template says NO power, or demand is 0, efficiency is 100%
        if (!requiresPower || powerConsVal.lte(0)) {
            powerEfficiency = safeDecimal(1);
        }

        const isElectricityProducer = node.data?.recipe?.outputType === 'electricity' ||
            node.type === 'hydroGenerator' ||
            node.type === 'accumulator' ||
            (node.data?.recipes && Array.isArray(node.data.recipes) && (node.data.recipes as RecipeConfig[]).some(r => r.outputType === 'electricity'));

        let powerReqAmt = safeDecimal(0);
        if (node.data.powerConsumption) {
            powerReqAmt = safeDecimal(node.data.powerConsumption).times(dtSeconds);
        }

        let recipes = node.data.recipes || (node.data.recipe ? [node.data.recipe] : []) || (template as any)?.recipes || [];
        if (recipes.length === 0 && (t?.input_type || t?.output_type || t?.inputType || t?.outputType)) {
            recipes = [{
                inputType: t.inputType || t.input_type || t.resource_type || '',
                outputType: t.outputType || t.output_type || '',
                conversionRate: t.conversionRate || t.conversion_rate || 1
            }];
        }
        if (recipes.length === 0) continue;

        const isMultiInputNode = recipes.length > 1;
        const inEdgesCurrent = inEdgesByTarget[node.id] || [];

        if (isMultiInputNode && inEdgesCurrent.length === 0) {
            if (nodeIncoming[node.id]) {
                for (const rt of Object.keys(nodeIncoming[node.id])) {
                    nodeIncoming[node.id][rt as ResourceType] = safeDecimal(0);
                }
            }
        }

        let selectedRecipeResult = recipes[0];
        let outputPerCraftResult = safeDecimal(1);
        let inTypesResult: string[] = [];
        let maxCraftsResult = safeDecimal(0);
        let activeRecipeIndexResult = node.data.activeRecipeIndex || 0;
        let activeMaxIngredientsResult = safeDecimal(1);

        for (let i = 0; i < recipes.length; i++) {
            const r = recipes[i];
            const recipeIngredients = r.ingredients || [];
            const recipeInTypes = recipeIngredients.length > 0
                ? recipeIngredients.map((ing: any) => ing.itemId)
                : (typeof (r.inputType || (r as any).input_type) === 'string'
                    ? (r.inputType || (r as any).input_type).split(',').map((it: string) => it.trim())
                    : []);

            const ratePerSec = safeDecimal(r.conversionRate || (r as any).conversion_rate || 1);
            const inputAmtsMap: Record<string, Decimal> = {};
            if (recipeIngredients.length > 0) {
                recipeIngredients.forEach((ing: any) => { inputAmtsMap[ing.itemId] = safeDecimal(ing.amount); });
            } else {
                const flatAmts = (r as any).inputAmount ? String((r as any).inputAmount).split(',').map(s => safeDecimal(s.trim())) : recipeInTypes.map(() => safeDecimal(1));
                recipeInTypes.forEach((rt: string, idx: number) => { inputAmtsMap[rt] = flatAmts[idx] || safeDecimal(1); });
            }

            let maxPossibleByIngredients = safeDecimal(Infinity);
            for (const rt_ of recipeInTypes) {
                if (!rt_ || rt_ === 'electricity') continue;
                const amtAvailable = inputBufferObj[rt_] ? safeDecimal(inputBufferObj[rt_] as any) : safeDecimal(0);
                const reqPerSec = inputAmtsMap[rt_].times(ratePerSec).times(multiplier);
                if (reqPerSec.gt(0)) {
                    const possibleTicks = amtAvailable.dividedBy(reqPerSec.times(dtSeconds));
                    if (possibleTicks.lt(maxPossibleByIngredients)) maxPossibleByIngredients = possibleTicks;
                }
            }
            if (maxPossibleByIngredients.eq(Infinity)) maxPossibleByIngredients = safeDecimal(1);

            const productionEfficiency = node.data?.productionEfficiency ? safeDecimal(node.data.productionEfficiency) : safeDecimal(1);
            let craftsThisTick = Decimal.min(safeDecimal(100), Decimal.min(maxPossibleByIngredients, Decimal.min(powerEfficiency, productionEfficiency)));
            if (craftsThisTick.gt(0) || i === recipes.length - 1) {
                selectedRecipeResult = r;
                activeRecipeIndexResult = i;
                inTypesResult = recipeInTypes;
                activeMaxIngredientsResult = maxPossibleByIngredients;
                // Apply multiplier to production rate
                outputPerCraftResult = ratePerSec.times(multiplier).times(dtSeconds);
                maxCraftsResult = craftsThisTick;
                if (craftsThisTick.gt(0)) break;
            }
        }

        const outTypeR = (selectedRecipeResult.outputType || (selectedRecipeResult as any).output_type) as ResourceType;
        const outBufferR = node.data.outputBuffer || {};
        const currentOutAmtR = outBufferR[outTypeR] ? safeDecimal(outBufferR[outTypeR]!) : safeDecimal(0);
        const leftoverOutSpaceR = Decimal.max(0, safeDecimal(maxBuf).minus(currentOutAmtR));
        // If output is electricity, ignore storage backpressure for grid supply stability
        const maxByStorageR = (outTypeR === 'electricity')
            ? safeDecimal(999999)
            : (outputPerCraftResult.gt(0) ? leftoverOutSpaceR.dividedBy(outputPerCraftResult) : safeDecimal(1));

        const craftsToExecuteR = Decimal.min(maxCraftsResult, maxByStorageR);
        const actualTotalProducedR = outputPerCraftResult.times(craftsToExecuteR);

        outBufferR[outTypeR] = currentOutAmtR.plus(actualTotalProducedR).toString();
        node.data.outputBuffer = outBufferR;

        const craftsRatioR = maxCraftsResult.gt(0) ? craftsToExecuteR.dividedBy(maxCraftsResult) : safeDecimal(0);
        const inEdgesR = inEdgesByTarget[node.id] || [];

        const convRateR = safeDecimal(selectedRecipeResult.conversionRate || (selectedRecipeResult as any).conversion_rate || 1);
        const recipeIngredientsR = selectedRecipeResult.ingredients || [];
        const usageTypeMapR: Record<string, string> = {};
        const reqAmountMapR: Record<string, Decimal> = {};

        if (recipeIngredientsR.length > 0) {
            recipeIngredientsR.forEach((ing: any) => {
                usageTypeMapR[ing.itemId] = ing.usageType || 'MATERIAL';
                reqAmountMapR[ing.itemId] = safeDecimal(ing.amount);
            });
        } else {
            const FUEL_RES = ['coal', 'wood_log', 'leaf', 'lava'];
            const flatAmts = (selectedRecipeResult as any).inputAmount ? String((selectedRecipeResult as any).inputAmount).split(',').map(s => safeDecimal(s.trim())) : inTypesResult.map(() => safeDecimal(1));
            inTypesResult.forEach((rt, idx) => {
                usageTypeMapR[rt] = (idx > 0 && FUEL_RES.includes(rt)) ? 'FUEL' : 'MATERIAL';
                reqAmountMapR[rt] = flatAmts[idx] || safeDecimal(1);
            });
        }

        let consumedTotal = safeDecimal(0);
        for (const rt of inTypesResult) {
            const reqB = reqAmountMapR[rt] || safeDecimal(1);
            const totalCons = reqB.times(convRateR).times(multiplier).times(dtSeconds).times(craftsRatioR);
            const curA = inputBufferObj[rt] ? safeDecimal(inputBufferObj[rt] as any) : safeDecimal(0);
            inputBufferObj[rt] = Decimal.max(0, curA.minus(totalCons)).toString();

            const reqAmtTick = reqB.times(convRateR).times(multiplier).times(dtSeconds);
            const scaledMaxBufR = Decimal.max(maxBuf, reqAmtTick.times(10));
            const bpR = curA.lt(scaledMaxBufR) ? safeDecimal(1) : safeDecimal(0);
            const resUsage = usageTypeMapR[rt];

            for (const edge of inEdgesR) {
                const rtForE = edge.data?.resourceType || '';
                if (rtForE !== rt) continue;

                const targetH = (edge.targetHandle || '').toLowerCase();
                const resUsage = usageTypeMapR[rt];

                const isMatch = (targetH === rt.toLowerCase()) ||
                    (targetH === 'fuel' && resUsage === 'FUEL') ||
                    (targetH === 'material' && resUsage === 'MATERIAL') ||
                    ((targetH === 'input' || !targetH) && resUsage === 'MATERIAL');

                if (isMatch) {
                    edgeBackpressures[edge.id] = bpR;
                }
            }
            addStat(ctx, 'consumption', rt as ResourceType, totalCons);
            consumedTotal = consumedTotal.plus(totalCons);
        }

        if (powerReqAmt.gt(0)) {
            const currentE = inputBufferObj['electricity'] ? safeDecimal(inputBufferObj['electricity']) : safeDecimal(0);
            const bpElec = currentE.lt(maxBuf) ? safeDecimal(1) : safeDecimal(0);
            for (const edge of inEdgesR) {
                if (edge.targetHandle === 'electricity' || (edge.data as any)?.resourceType === 'electricity') {
                    edgeBackpressures[edge.id] = bpElec;
                }
            }
        }

        delete nodeIncoming[node.id];

        const outTargetEdges = outEdgesBySource[node.id] || [];
        let pT = safeDecimal(0);
        if (outTargetEdges.length > 0 && safeDecimal(outBufferR[outTypeR] as any).gt(0)) {
            const currentB = safeDecimal(outBufferR[outTypeR] as any);
            const normOutRT = outTypeR.toLowerCase().replace(/[\s_]/g, '');
            const handleEdges = outTargetEdges.filter(e => {
                const normSrc = e.sourceHandle?.toLowerCase().replace(/[\s_]/g, '') || '';
                return normSrc === normOutRT || !e.sourceHandle || e.sourceHandle === 'output' || e.sourceHandle === 'source';
            });
            pT = pushToMultipleEdges(ctx, handleEdges.length > 0 ? handleEdges : outTargetEdges, outTypeR, currentB);
            outBufferR[outTypeR] = currentB.minus(pT).toString();
        } else if (isElectricityProducer) {
            pT = actualTotalProducedR;
        }
        addStat(ctx, 'production', outTypeR, Decimal.max(actualTotalProducedR, pT));

        if (powerReqAmt.gt(0)) {
            const amountToCons = powerReqAmt.times(powerEfficiency.times(craftsRatioR));
            const curBE = inputBufferObj['electricity'] ? safeDecimal(inputBufferObj['electricity']) : safeDecimal(0);
            if (curBE.gt(0)) {
                const taken = Decimal.min(curBE, amountToCons);
                inputBufferObj['electricity'] = curBE.minus(taken).toString();
            }
            addStat(ctx, 'consumption', 'electricity', amountToCons);
        }

        const potentialProduction = convRateR.times(multiplier).times(dtSeconds);
        const instantEff = potentialProduction.gt(0) ? actualTotalProducedR.dividedBy(potentialProduction) : safeDecimal(0);

        const inS = dtSeconds > 0 ? actualTotalProducedR.dividedBy(dtSeconds) : safeDecimal(0);
        const outS = dtSeconds > 0 ? Decimal.max(actualTotalProducedR, pT).dividedBy(dtSeconds) : safeDecimal(0);
        const activeCRat = safeDecimal(selectedRecipeResult.conversionRate || (selectedRecipeResult as any).conversion_rate || 1);
        const pS = powerGrid ? 'WIRE' : (wirelessPowerEff.gt(0) ? 'AIR' : 'NONE');

        // Efficiency is throughput vs potential. 
        // We use craftsRatioR * powerEfficiency to show if machine is bottlenecked by downstream or power.
        // const instantEff = craftsRatioR.times(powerEfficiency); // Old calculation

        nodeDelta(ctx, node.id, {
            actualInputPerSec: smoothValue(node.data.actualInputPerSec, consumedTotal.dividedBy(dtSeconds), dtSeconds, 1.0),
            actualOutputPerSec: smoothValue(node.data.actualOutputPerSec, outS, dtSeconds, 1.0),
            efficiency: smoothValue(node.data.efficiency, instantEff, dtSeconds, 1.0),
            inputBuffer: inputBufferObj,
            outputBuffer: outBufferR,
            activeRecipeIndex: activeRecipeIndexResult,
            backpressure: craftsRatioR.toString(),
            debugInfo: `E:${instantEff.toFixed(2)}|MC:${maxCraftsResult.toFixed(2)}|MS:${maxByStorageR.toFixed(2)}|I:${activeMaxIngredientsResult.toFixed(0)}|P:${powerEfficiency.toFixed(2)}|Pw:${node.data.powerConsumption || '0'}|ST:${pS}`
        });
    }
};

