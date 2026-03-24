import { Node, Edge } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { RESOURCE_STATES } from '../../../constants';

export const finalizeNodesAndEdges = (ctx: TickContext) => {
    const { nextNodes, nodeIncoming, edgeFlows, edgeBackpressures, edgeBottlenecks, nodesById, state, dtSeconds, outEdgesBySource, globalProduction, globalConsumption, cloudProduction, cloudConsumption } = ctx;

    const nextNodesMap: Record<string, Node<NodeData>> = {};
    nextNodes.forEach((n: Node<NodeData>) => nextNodesMap[n.id] = n);

    const finalNodes = state.nodes.map((liveNode: Node<NodeData>) => {
        const ticked = nextNodesMap[liveNode.id];
        if (!ticked) return liveNode;

        let status = 'active';
        if (ticked.type === 'waterGenerator' || ticked.type === 'lavaPump') {
            status = 'active';
        } else if (ticked.type === 'ironGenerator' || ticked.type === 'copperGenerator' || ticked.type === 'coalGenerator') {
            const eff = ticked.data.efficiency ? new Decimal(ticked.data.efficiency as any) : new Decimal(1);
            status = eff.eq(1) ? 'active' : eff.gt(0) ? 'idle' : 'warning';
        } else if (ticked.type && ['hydroGenerator', 'coalPlant', 'fluidGenerator'].includes(ticked.type)) {
            const out = ticked.data.actualOutputPerSec ? new Decimal(ticked.data.actualOutputPerSec as any) : new Decimal(0);
            status = out.gt(0) ? 'active' : 'idle';
        } else if (ticked.type === 'merger' || ticked.type === 'splitter' || ticked.type === 'antenna' || ticked.type === 'powerTransmitter') {
            const inc = nodeIncoming[ticked.id];
            const hasFlow = inc && Object.keys(inc).some(k => (inc[k as ResourceType] as Decimal).gt(0));
            status = hasFlow ? 'active' : 'idle';
        }

        const buffer: Record<string, string> = {};
        const inc = nodeIncoming[ticked.id];
        if (inc) {
            for (const [rt, amt] of Object.entries(inc)) {
                if (amt && (amt as Decimal).gt(0)) buffer[rt] = amt.toString();
            }
        }
        return { ...liveNode, data: { ...ticked.data, status, inputBuffer: buffer } };
    });

    const finalEdges = state.edges.map((e: Edge) => {
        const flow = edgeFlows[e.id];
        const bp = edgeBackpressures[e.id] || new Decimal(1);
        const isBottleneck = edgeBottlenecks[e.id] || false;
        const isTripped = e.data?.isTripped || false;
        const data = { ...e.data, backpressureRate: bp.toString(), flow: '0', isBottleneck, isTripped };

        let dominantRt = 'water';
        let hasFlow = false;
        const srcNode = nodesById[e.source];
        const isContinuous = (srcNode?.type?.includes('Generator') || srcNode?.type === 'downloader' || srcNode?.type === 'powerReceiver') && srcNode?.type !== 'splitter' && srcNode?.type !== 'merger';

        const status = srcNode?.data?.status || 'idle';
        const rate = srcNode?.data?.actualOutputPerSec !== undefined ? srcNode.data.actualOutputPerSec : srcNode?.data?.outputRate;
        if (isContinuous && rate && status === 'active') {
            hasFlow = true;
            let flowVal = new Decimal(rate as any);
            const edges = outEdgesBySource[e.source] || [];
            const uniqueTargetEdges = edges.filter((ed, index, self) =>
                index === self.findIndex((t) => t.target === ed.target && t.targetHandle === ed.targetHandle)
            );
            const outEdgesCount = uniqueTargetEdges.length;
            if (outEdgesCount > 1) flowVal = flowVal.dividedBy(outEdgesCount);
            data.flow = flowVal.toString();
            dominantRt = srcNode.data.resourceType || 'water';
            if (['hydroGenerator', 'powerTransmitter', 'powerReceiver', 'powerPole', 'accumulator'].includes(srcNode?.type || '')) dominantRt = 'electricity';
        } else if (flow && Object.keys(flow).length > 0) {
            [dominantRt] = Object.entries(flow).sort((a, b) => (b[1] as Decimal).sub(a[1] as Decimal).toNumber())[0];
            hasFlow = true;
            let flowVal = flow[dominantRt as ResourceType] as Decimal;
            if (dtSeconds > 0) flowVal = flowVal.dividedBy(dtSeconds);
            data.flow = flowVal.toString();
        } else {
            dominantRt = srcNode?.data?.resourceType || 'water';
            if (['hydroGenerator', 'powerTransmitter', 'powerReceiver', 'powerPole', 'accumulator'].includes(srcNode?.type || '')) dominantRt = 'electricity';
        }

        const isPowerEdge = e.type === 'power' || (e.data as any)?.resourceType === 'electricity';
        if (isPowerEdge) {
            dominantRt = 'electricity';
        }

        (data as any).resourceType = dominantRt;

        const matter = RESOURCE_STATES[dominantRt] || 'solid';
        const matterColors: Record<string, string> = {
            solid: '#64748b',
            liquid: '#0284c7',
            gas: '#059669',
            power: '#d97706'
        };
        const edgeColor = matterColors[matter];

        const edgeType = (e.type === 'power' || dominantRt === 'electricity') ? 'power' : 'fluid';

        const finalData = { ...data, tier: Math.max(e.data?.tier ?? 0, state.edgeTiers[matter] || 0) };

        if (hasFlow) {
            return {
                ...e,
                type: edgeType,
                animated: false,
                style: {
                    stroke: isTripped ? '#ef4444' : edgeColor,
                    strokeWidth: isTripped ? 2.5 : (bp.eq(1) ? 2 : 1.5),
                    opacity: isTripped ? 1 : (bp.eq(0) ? 0.4 : 1),
                    strokeDasharray: isTripped ? '5,5' : 'none'
                },
                data: finalData
            };
        }
        return {
            ...e,
            type: edgeType,
            animated: false,
            style: {
                stroke: isTripped ? '#ef4444' : edgeColor,
                strokeWidth: isTripped ? 2 : 1,
                opacity: isTripped ? 0.8 : 0.4,
                strokeDasharray: isTripped ? '5,5' : 'none'
            },
            data: finalData
        };
    });

    const finalProd: Partial<Record<ResourceType, Decimal>> = {};
    const finalCons: Partial<Record<ResourceType, Decimal>> = {};
    const finalCloudProd: Partial<Record<ResourceType, Decimal>> = {};
    const finalCloudCons: Partial<Record<ResourceType, Decimal>> = {};

    for (const [rt, v] of Object.entries(globalProduction)) {
        if (v && dtSeconds > 0) finalProd[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }
    for (const [rt, v] of Object.entries(globalConsumption)) {
        if (v && dtSeconds > 0) finalCons[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }
    for (const [rt, v] of Object.entries(cloudProduction)) {
        if (v && dtSeconds > 0) finalCloudProd[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }
    for (const [rt, v] of Object.entries(cloudConsumption)) {
        if (v && dtSeconds > 0) finalCloudCons[rt as ResourceType] = (v as Decimal).dividedBy(dtSeconds);
    }

    return { finalNodes, finalEdges, finalProd, finalCons, finalCloudProd, finalCloudCons };
};
