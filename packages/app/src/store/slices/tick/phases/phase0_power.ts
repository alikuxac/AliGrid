import { Edge, Node } from 'reactflow';
import { Decimal } from '@aligrid/engine';
import { NodeData, RecipeConfig } from '../../../types';
import { NodeTemplate } from '@aligrid/schema';
import { TickContext, PowerGrid } from '../types';
import { getAbsPosition } from '../helpers';
import { FALLBACK_NODES } from '../../../../config/fallbackNodes';

export const resolvePowerGrid = (ctx: TickContext) => {
    const edges = Object.values(ctx.edgesById);
    const powerEdges = edges.filter((e: Edge) => e.type === 'power' || e.data?.resourceType === 'electricity');

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
                const maxLv = Math.max(lv1, lv2);
                const maxDist = 500 + (maxLv * 100);

                if (dist > maxDist) {
                    if (!e.data) e.data = {};
                    e.data.isTripped = true;
                    return;
                }
            }
            powerAdj[e.source].push(e.target);
            powerAdj[e.target].push(e.source);
        }
    });

    // Add Virtual Bluetooth Bridges (N-N)
    const transmitters = ctx.nextNodes.filter((n: Node<NodeData>) => n.type === 'powerTransmitter');
    const receivers = ctx.nextNodes.filter((n: Node<NodeData>) => n.type === 'powerReceiver');

    transmitters.forEach((tx: Node<NodeData>) => {
        receivers.forEach((rx: Node<NodeData>) => {
            const txChan = tx.data?.channel ?? 0;
            const rxChan = rx.data?.channel ?? 0;
            if (txChan === rxChan && powerAdj[tx.id] && powerAdj[rx.id]) {
                powerAdj[tx.id].push(rx.id);
                powerAdj[rx.id].push(tx.id);
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
                const isPowerProducerNode = n.type && ['hydroGenerator', 'coalPlant', 'fluidGenerator'].includes(n.type);
                if (isPowerProducerNode) return true;
                const recipes = n.data?.recipes || (n.data?.recipe ? [n.data.recipe] : []);
                return recipes.some((r: RecipeConfig) => r.outputType === 'electricity');
            });
            const accumulators = gridNodes.filter(n => n.type === 'accumulator');
            const consumers = gridNodes.filter(n => n.data?.powerConsumption && new Decimal(n.data.powerConsumption).gt(0) && (!n.type || !['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(n.type)) && !producers.includes(n) && !n.data?.isOff);

            const newGrid = {
                id: gridCounter++,
                poles,
                producers,
                accumulators,
                consumers,
                supply: new Decimal(0),
                demand: new Decimal(0),
                efficiency: new Decimal(1),
                updatedAccumulators: {} as Record<string, Decimal>
            };
            grids.push(newGrid);

            component.forEach(id => {
                nodeToGrid[id] = newGrid;
            });
        }
    }

    // 3. Match Consumers and Sum Demand
    const consumerGrids: Record<string, PowerGrid> = {};

    grids.forEach(grid => {
        grid.consumers.forEach((node: Node<NodeData>) => {
            const powerCons = node.data?.powerConsumption || new Decimal(0);
            grid.demand = grid.demand.plus(new Decimal(powerCons));
            consumerGrids[node.id] = grid;
        });
    });

    // 4. Sum available Supply & Resolve Accumulators
    grids.forEach(grid => {
        grid.producers.forEach((p: Node<NodeData>) => {
            if (p.data?.isOff) return;
            let rate = p.data?.outputRate
                ? new Decimal(p.data.outputRate).times(p.data.inputEfficiency !== undefined ? new Decimal(p.data.inputEfficiency) : 1)
                : (p.data?.actualOutputPerSec ? new Decimal(p.data.actualOutputPerSec) : new Decimal(0));

            if (!p.data?.outputRate && (!p.data?.actualOutputPerSec || new Decimal(p.data.actualOutputPerSec).eq(0))) {
                const temp = ctx.state.nodeTemplates.find((t: NodeTemplate) => t.id === p.type) || FALLBACK_NODES.find((f: NodeTemplate) => f.id === p.type);
                if (temp?.initial_rate) rate = new Decimal(temp.initial_rate);
            }
            if (!rate) rate = new Decimal(1);
            const outRate = typeof rate === 'object' ? rate : new Decimal(rate);
            grid.supply = grid.supply.plus(outRate);
        });

        const supplySec = grid.supply;
        const demandSec = grid.demand;
        let actualSuppliedSec = supplySec;

        let totalCharged = new Decimal(0);

        if (supplySec.gt(demandSec)) {
            const surplus = supplySec.minus(demandSec).times(ctx.dtSeconds);
            const openAccumulators = grid.accumulators || [];
            if (openAccumulators.length > 0) {
                const chargePerAcc = surplus.dividedBy(openAccumulators.length);
                openAccumulators.forEach((acc: Node<NodeData>) => {
                    const cur = new Decimal(acc.data?.buffer || 0);
                    const max = new Decimal(acc.data?.maxBuffer || acc.data?.template?.maxBuffer || 5000);
                    const spaces = Decimal.max(0, max.minus(cur));
                    const fill = Decimal.min(chargePerAcc, spaces);
                    grid.updatedAccumulators[acc.id] = cur.plus(fill);
                    totalCharged = totalCharged.plus(fill);
                });
            }
        } else if (supplySec.lt(demandSec)) {
            const deficit = demandSec.minus(supplySec).times(ctx.dtSeconds);
            let discharged = new Decimal(0);
            const openAccumulators = grid.accumulators || [];
            if (openAccumulators.length > 0) {
                let totalAvailable = new Decimal(0);
                openAccumulators.forEach((acc: Node<NodeData>) => totalAvailable = totalAvailable.plus(new Decimal(acc.data?.buffer || 0)));

                if (totalAvailable.gt(0)) {
                    const share = Decimal.min(1, deficit.dividedBy(totalAvailable));
                    openAccumulators.forEach((acc: Node<NodeData>) => {
                        const cur = new Decimal(acc.data?.buffer || 0);
                        const taken = cur.times(share);
                        grid.updatedAccumulators[acc.id] = cur.minus(taken);
                        discharged = discharged.plus(taken);
                    });
                    actualSuppliedSec = supplySec.plus(discharged.dividedBy(ctx.dtSeconds));
                    grid.supply = actualSuppliedSec;
                }
            }
        }

        if (demandSec.gt(0)) {
            grid.efficiency = Decimal.min(1, actualSuppliedSec.dividedBy(demandSec));
        } else {
            grid.efficiency = new Decimal(1);
        }

        const totalUsefulSec = demandSec.plus(ctx.dtSeconds > 0 ? totalCharged.dividedBy(ctx.dtSeconds) : new Decimal(0));
        if (totalUsefulSec.lt(0.00001)) {
            grid.productionEfficiency = new Decimal(0);
        } else {
            grid.productionEfficiency = supplySec.gt(0) ? Decimal.min(1, totalUsefulSec.dividedBy(supplySec)) : new Decimal(1);
        }
    });

    // ═══ Virtual Flow for Power Edges ═══
    powerEdges.forEach((e: Edge) => {
        const grid = nodeToGrid[e.source] || nodeToGrid[e.target];
        if (grid) {
            const totalFlow = Decimal.min(grid.supply, grid.demand);
            if (!e.data) e.data = {};
            e.data.flow = totalFlow.gt(0) ? totalFlow.toNumber() : 0;
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
        } else if (res.data?.powerConsumption && new Decimal(res.data.powerConsumption).gt(0)) {
            res.data.wirelessEfficiency = new Decimal(0);
        }

        if (pGrid) {
            res.data.productionEfficiency = pGrid.productionEfficiency;
        }

        const gridItem = nodeToGrid[node.id] || consumerGrids[node.id] || producerGrids[node.id];
        if (gridItem) {
            res.data.gridSupply = gridItem.supply;
            res.data.gridDemand = gridItem.demand;
        }

        if (node.type === 'accumulator') {
            const gridItem = grids.find(g => g.accumulators?.some((a: Node<NodeData>) => a.id === node.id));
            if (gridItem && gridItem.updatedAccumulators?.[node.id] !== undefined) {
                res.data.buffer = gridItem.updatedAccumulators[node.id].toString();
            }
        }
        return res;
    });

    return { gridToNode: nodeToGrid }; // Trả về nếu cần
};
