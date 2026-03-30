import type { Edge, Node } from 'reactflow';
import { Decimal } from '@aligrid/engine';
import { NodeData, RecipeConfig } from '../../../types';
import { NodeTemplate } from '@aligrid/schema';
import { TickContext, PowerGrid } from '../types';
import { getAbsPosition, safeDecimal } from '../helpers';
import { FALLBACK_NODES } from '../../../../config/fallbackNodes';

const POWER_BASE_CAPACITY = 1000;
const WIRELESS_BASE_CAPACITY = 2000;

export const resolvePowerGrid = (ctx: TickContext) => {
    const edges = Object.values(ctx.edgesById);
    const powerEdges = edges.filter((e: Edge) => e.type === 'power' || e.data?.resourceType === 'electricity');
    if (!ctx.edgeResourceTypes) ctx.edgeResourceTypes = {};
    const localEdgeResourceTypes = ctx.edgeResourceTypes;
    powerEdges.forEach(e => {
        localEdgeResourceTypes[e.id] = 'electricity';
    });

    // 1. Build Adjacency List for Power Grid
    const powerAdj: Record<string, string[]> = {};
    ctx.nextNodes.forEach((n: Node<NodeData>) => {
        powerAdj[n.id] = [];
    });

    powerEdges.forEach((e: Edge) => {
        if (powerAdj[e.source] && powerAdj[e.target]) {
            const srcNode = ctx.nodesById[e.source];
            const tgtNode = ctx.nodesById[e.target];
            if (srcNode && tgtNode) {
                const p1 = getAbsPosition(ctx, srcNode);
                const p2 = getAbsPosition(ctx, tgtNode);
                const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

                const lv1 = srcNode.data?.level || 0;
                const lv2 = tgtNode.data?.level || 0;
                const tier = e.data?.tier ?? 0;

                const isPole = srcNode.type === 'powerPole' || tgtNode.type === 'powerPole';

                // Base range for standard machines is 500. 
                // Power Poles increase range significantly.
                const baseDist = isPole ? 1200 : 500;
                const maxDist = baseDist + (tier * 200);

                if (dist > maxDist) {
                    if (!e.data) e.data = {};
                    e.data.isTripped = true;
                    return;
                }

                // Calculate and store capacity for this edge
                const baseCap = POWER_BASE_CAPACITY * Math.pow(4, tier);
                const capMult = isPole ? 2 : 1;
                if (!e.data) e.data = {};
                e.data.capacity = baseCap * capMult;
                e.data.isTripped = false; // Reset if it was tripped before
            }
            powerAdj[e.source].push(e.target);
            powerAdj[e.target].push(e.source);
        }
    });

    // Add Virtual Bluetooth Bridges (N-N)
    const transmitters = ctx.nextNodes.filter((n: Node<NodeData>) => n.type === 'powerTransmitter');
    const receivers = ctx.nextNodes.filter((n: Node<NodeData>) => n.type === 'powerReceiver');

    // Optimization: Group receivers by channel for faster lookup
    const receiversByChannel: Record<number, string[]> = {};
    receivers.forEach((rx) => {
        const chan = rx.data?.channel ?? 0;
        if (!receiversByChannel[chan]) receiversByChannel[chan] = [];
        receiversByChannel[chan].push(rx.id);
    });

    transmitters.forEach((tx: Node<NodeData>) => {
        const chan = tx.data?.channel ?? 0;
        const matchingRxIds = receiversByChannel[chan] || [];
        matchingRxIds.forEach((rxId) => {
            if (powerAdj[tx.id] && powerAdj[rxId]) {
                powerAdj[tx.id].push(rxId);
                powerAdj[rxId].push(tx.id);
            }
        });
    });

    // 2. Find Connected Components (Sub-networks)
    const visited = new Set<string>();
    const grids: PowerGrid[] = [];
    const nodeToGrid: Record<string, PowerGrid> = {};

    let gridCounter = 0;
    for (const nodeId of Object.keys(powerAdj)) {
        if (!visited.has(nodeId)) {
            const component: string[] = [];
            const queue = [nodeId];
            visited.add(nodeId);

            while (queue.length > 0) {
                const curr = queue.shift()!;
                component.push(curr);
                powerAdj[curr].forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                });
            }

            const gridNodes = component.map(id => ctx.nodesById[id]);
            const poles = gridNodes.filter(n => n.type && ['powerPole', 'powerTransmitter', 'powerReceiver'].includes(n.type));
            const producers = gridNodes.filter(n => {
                const isPowerProducerNode = n.type && ['hydroGenerator', 'coalPlant', 'fluidGenerator', 'coalPowerPlant', 'lavaPump'].includes(n.type);
                if (isPowerProducerNode) return true;
                const recipes = n.data?.recipes || (n.data?.recipe ? [n.data.recipe] : []);
                return recipes.some((r: RecipeConfig) => r.outputType === 'electricity');
            });
            const accumulators = gridNodes.filter(n =>
                n.type === 'accumulator' ||
                (n.data?.outputBuffer && (n.data.outputBuffer as any)['electricity'])
            );
            const consumers = gridNodes.filter(n => {
                const powerVal = n.data?.powerConsumption || n.data?.template?.power_demand || n.data?.template?.base_power_demand;
                const matchesGeneric = (!n.type || !['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(n.type));
                return powerVal && safeDecimal(powerVal).gt(0) && matchesGeneric && !producers.includes(n) && !n.data?.isOff;
            });

            const newGrid = {
                id: gridCounter++,
                poles,
                producers,
                accumulators,
                consumers,
                supply: safeDecimal(0),
                demand: safeDecimal(0),
                efficiency: safeDecimal(1),
                updatedAccumulators: {} as Record<string, Decimal>,
                maxCapacity: Infinity,
                edgeIds: [] as string[]
            };

            // Associate edges with this component for capacity checking
            Object.values(ctx.edgesById).forEach((e: Edge) => {
                if (component.includes(e.source) && component.includes(e.target) && (e.type === 'power' || e.data?.resourceType === 'electricity')) {
                    newGrid.edgeIds.push(e.id);
                    const cap = e.data?.capacity || Infinity;
                    if (cap < newGrid.maxCapacity) newGrid.maxCapacity = cap;
                }
            });

            grids.push(newGrid);

            component.forEach(id => {
                nodeToGrid[id] = newGrid;
            });
        }
    }
    ctx.powerGrids = grids;

    // 3. Match Consumers and Sum Demand
    const consumerGrids: Record<string, PowerGrid> = {};
    const channelStats: Record<number, { supply: Decimal; demand: Decimal; capacity: number }> = {};

    grids.forEach(grid => {
        grid.consumers.forEach((node: Node<NodeData>) => {
            const boost = ctx.nodeBoosts?.[node.id] || 1;
            const powerVal = node.data?.powerConsumption || node.data?.template?.power_demand || node.data?.template?.base_power_demand;
            const powerCons = safeDecimal(powerVal || 0).times(boost);
            grid.demand = grid.demand.plus(powerCons);
            consumerGrids[node.id] = grid;
        });
    });

    // 4. Sum available Supply & Resolve Accumulators
    grids.forEach(grid => {
        grid.producers.forEach((p: Node<NodeData>) => {
            if (p.data?.isOff) return;

            // Theoretical max rate
            let theoreticalRate = p.data?.outputRate
                ? safeDecimal(p.data.outputRate)
                : (p.data?.actualOutputPerSec ? safeDecimal(p.data.actualOutputPerSec) : safeDecimal(0));

            if (!p.data?.outputRate && (!p.data?.actualOutputPerSec || safeDecimal(p.data.actualOutputPerSec).eq(0))) {
                const templatesArr = Array.isArray(ctx.nodeTemplates) ? ctx.nodeTemplates : [];
                const fallbackArr = Array.isArray(FALLBACK_NODES) ? FALLBACK_NODES : [];
                const temp = templatesArr.find((t: NodeTemplate) => t.id === p.type) || fallbackArr.find((f: any) => f.id === p.type);
                if (temp?.initial_rate) theoreticalRate = safeDecimal(temp.initial_rate);
            }

            // Check if machine HAS fuel/ingredients to actually produce this tick
            // Processors store fuel in inputBuffer
            const inputBuf = p.data?.inputBuffer || {};
            const recipes = p.data?.recipes || (p.data?.recipe ? [p.data.recipe] : []);
            const selectedRecipe = recipes[p.data?.activeRecipeIndex || 0] || recipes[0];

            let hasFuel = true;
            if (selectedRecipe && selectedRecipe.inputType) {
                const inTypes = selectedRecipe.inputType.split(',').map((it: string) => it.trim());
                hasFuel = inTypes.every(it => {
                    if (it === 'electricity' || !it) return true;
                    return safeDecimal((inputBuf as any)[it] || 0).gt(0);
                });
            }

            const outRate = hasFuel ? theoreticalRate : safeDecimal(0);
            grid.supply = grid.supply.plus(outRate);
        });

        // Sum demand for Virtual Bluetooth Bridges (Transmitters/Receivers)
        // They also have a capacity limit per channel.
        grid.producers.forEach(p => {
            if (p.type === 'powerTransmitter') {
                const chan = p.data?.channel ?? 0;
                if (!channelStats[chan]) channelStats[chan] = { supply: safeDecimal(0), demand: safeDecimal(0), capacity: WIRELESS_BASE_CAPACITY * Math.pow(4, p.data?.level || 0) };
                // A transmitter "feeds" the channel with its entire connected grid's surplus? 
                // No, let's keep it simple: Transmitter capacity is the limit of what can cross the bridge.
            }
        });

        // ═══ Energy Allocation Logic ═══
        const initialSupplySec = grid.supply;
        const demandSec = grid.demand;

        // Step A: Can we satisfy some demand from Stored energy FIRST?
        // This allows users to "drain" high buffers and save fuel.
        const openAccumulators = grid.accumulators || [];
        let totalDischargedSec = safeDecimal(0);
        let remainingDemandSec = demandSec;

        if (remainingDemandSec.gt(0) && openAccumulators.length > 0) {
            let totalStorage = safeDecimal(0);
            openAccumulators.forEach((acc: Node<NodeData>) => {
                const amt = acc.type === 'accumulator'
                    ? safeDecimal(acc.data?.buffer || 0)
                    : safeDecimal((acc.data?.outputBuffer as any)?.['electricity'] || 0);
                totalStorage = totalStorage.plus(amt);
            });

            if (totalStorage.gt(0)) {
                // How much energy can we take for this tick?
                const energyNeededTick = remainingDemandSec.times(ctx.dtSeconds);
                const energyTakenTick = Decimal.min(energyNeededTick, totalStorage);
                const share = energyTakenTick.dividedBy(totalStorage);

                openAccumulators.forEach((acc: Node<NodeData>) => {
                    const amt = acc.type === 'accumulator'
                        ? safeDecimal(acc.data?.buffer || 0)
                        : safeDecimal((acc.data?.outputBuffer as any)?.['electricity'] || 0);
                    const taken = amt.times(share);
                    grid.updatedAccumulators[acc.id] = amt.minus(taken);
                });

                totalDischargedSec = energyTakenTick.dividedBy(ctx.dtSeconds);
                remainingDemandSec = Decimal.max(0, remainingDemandSec.minus(totalDischargedSec));
            }
        }

        // Step B: Resolve remaining demand from Producers
        let actualSuppliedSec = totalDischargedSec;
        if (remainingDemandSec.gt(0)) {
            const productionUsedSec = Decimal.min(remainingDemandSec, initialSupplySec);
            actualSuppliedSec = actualSuppliedSec.plus(productionUsedSec);
            remainingDemandSec = remainingDemandSec.minus(productionUsedSec);
        }

        // Step C: If we still have Surplus Production, Charge the Accumulators
        let surplusProducedSec = initialSupplySec.minus(actualSuppliedSec);
        let totalCharged = safeDecimal(0);
        if (surplusProducedSec.gt(0) && openAccumulators.length > 0) {
            const surplusEnergyTick = surplusProducedSec.times(ctx.dtSeconds);
            const chargePerAcc = surplusEnergyTick.dividedBy(openAccumulators.length);

            openAccumulators.forEach((acc: Node<NodeData>) => {
                const isAccNode = acc.type === 'accumulator';
                const cur = isAccNode
                    ? (grid.updatedAccumulators[acc.id] !== undefined ? grid.updatedAccumulators[acc.id] : safeDecimal(acc.data?.buffer || 0))
                    : (grid.updatedAccumulators[acc.id] !== undefined ? grid.updatedAccumulators[acc.id] : safeDecimal((acc.data?.outputBuffer as any)?.['electricity'] || 0));

                const Level = acc.data?.level || 0;
                const multiplier = Math.pow(2, Level);
                const defaultMax = 5000 * multiplier;
                const max = safeDecimal(acc.data?.maxBuffer || acc.data?.template?.maxBuffer || defaultMax);

                const spaces = Decimal.max(0, max.minus(cur));
                const fill = Decimal.min(chargePerAcc, spaces);
                grid.updatedAccumulators[acc.id] = cur.plus(fill);
                totalCharged = totalCharged.plus(fill);
            });
            // Update supplied if charging
            actualSuppliedSec = actualSuppliedSec.plus(totalCharged.dividedBy(ctx.dtSeconds));
        }

        grid.supply = actualSuppliedSec;

        if (demandSec.gt(0)) {
            grid.efficiency = Decimal.min(1, actualSuppliedSec.dividedBy(demandSec));
        } else {
            grid.efficiency = safeDecimal(1);
        }

        const totalUsefulSec = demandSec.plus(ctx.dtSeconds > 0 ? totalCharged.dividedBy(ctx.dtSeconds) : safeDecimal(0));
        if (totalUsefulSec.lt(0.00001)) {
            // No demand and accumulators are full - machine should still be "ready" (100% efficiency potential)
            // but not necessarily consuming fuel if we implement fuel-throttling later.
            // For now, we want them to produce to fill THEIR local buffers.
            grid.productionEfficiency = safeDecimal(1);
        } else {
            grid.productionEfficiency = initialSupplySec.gt(0) ? Decimal.min(1, totalUsefulSec.dividedBy(initialSupplySec)) : safeDecimal(1);
        }

        // ═══ Apply Wattage Caps ═══
        // If the total grid demand exceeds the weakest link, the whole grid throttles.
        // This is a simplification of power flow.
        if (grid.demand.gt(grid.maxCapacity)) {
            const capEfficiency = safeDecimal(grid.maxCapacity).dividedBy(grid.demand);
            grid.efficiency = Decimal.min(grid.efficiency, capEfficiency);
        }
    });

    // ═══ Virtual Flow for Power Edges ═══
    powerEdges.forEach((e: Edge) => {
        const grid = nodeToGrid[e.source] || nodeToGrid[e.target];
        if (grid) {
            const totalFlow = Decimal.min(grid.supply, grid.demand);
            if (!e.data) e.data = {};
            // Use actualFlow to match standard resource edges and UI expectations
            e.data.actualFlow = totalFlow.gt(0) ? totalFlow.toNumber() : 0;
            // Also keep .flow for backward compatibility in internal simulation phases if needed
            e.data.flow = e.data.actualFlow.toString();
            e.data.isOverloaded = grid.demand.gt(e.data.capacity || Infinity);

            // Record in tickTotalFlows for phase 6 rate calculation
            if (!ctx.tickTotalFlows) ctx.tickTotalFlows = {};
            if (!ctx.tickTotalFlows[e.id]) ctx.tickTotalFlows[e.id] = {};
            const tickFlow = totalFlow.times(ctx.dtSeconds);
            ctx.tickTotalFlows[e.id]['electricity'] = (ctx.tickTotalFlows[e.id]['electricity'] || safeDecimal(0)).plus(tickFlow);

            if (totalFlow.gt(0)) {
                if (!ctx.tickActivity) ctx.tickActivity = {};
                ctx.tickActivity[e.id] = true;
                ctx.tickActivity[e.source] = true;
                ctx.tickActivity[e.target] = true;
            }
        }
    });

    const producerGrids: Record<string, PowerGrid> = {};
    grids.forEach(g => {
        g.producers?.forEach((p: Node<NodeData>) => {
            producerGrids[p.id] = g;
        });
    });

    // 5. Apply wireless efficiency
    ctx.nextNodes = ctx.nextNodes.map((node: Node<NodeData>) => {
        const grid = consumerGrids[node.id];
        const pGrid = producerGrids[node.id];
        const res = { ...node, data: { ...node.data } };

        if (grid) {
            res.data.wirelessEfficiency = grid.efficiency;
        } else if (res.data?.powerConsumption && safeDecimal(res.data.powerConsumption).gt(0)) {
            res.data.wirelessEfficiency = safeDecimal(0);
        }

        if (pGrid) {
            res.data.productionEfficiency = pGrid.productionEfficiency;
        }

        const gridItem = nodeToGrid[node.id] || consumerGrids[node.id] || producerGrids[node.id];
        if (gridItem) {
            res.data.gridSupply = gridItem.supply;
            res.data.gridDemand = gridItem.demand;

            // If it's a consumer, populate the input buffer to reflect "Wired" reception in GenericNode UI
            const isConsumer = gridItem.consumers?.some((c: Node<NodeData>) => c.id === node.id);
            if (isConsumer) {
                const currentIn = res.data.inputBuffer || {};
                const demand = res.data.gridDemand || 0;
                // We "fill" the buffer with enough to cover the actual consumption of this tick
                // This ensures the UI Energy bar stays filled while operating.
                const supplyToBuffer = safeDecimal(demand).times(gridItem.efficiency).times(ctx.dtSeconds);
                if (supplyToBuffer.gt(0)) {
                    const currentAmt = safeDecimal((currentIn as any)['electricity'] || 0);
                    res.data.inputBuffer = { ...currentIn as any, electricity: currentAmt.plus(supplyToBuffer).toString() };
                }
            }
        }

        const gridItemForAcc = grids.find(g => g.accumulators?.some((a: Node<NodeData>) => a.id === node.id));
        if (gridItemForAcc && gridItemForAcc.updatedAccumulators?.[node.id] !== undefined) {
            const newVal = gridItemForAcc.updatedAccumulators[node.id].toString();
            if (node.type === 'accumulator') {
                res.data.buffer = newVal;
            } else {
                // For processors, update the outputBuffer
                const currentOut = res.data.outputBuffer || {};
                res.data.outputBuffer = { ...currentOut as any, electricity: newVal };
            }
        }
        return res;
    });

    return { gridToNode: nodeToGrid }; // Trả về nếu cần
};
