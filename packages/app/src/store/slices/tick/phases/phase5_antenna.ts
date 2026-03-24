import { Node } from 'reactflow';
import { Decimal, ResourceType, RESOURCE_REGISTRY } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { addCloudStat } from '../helpers';

export const updateAntennas = (ctx: TickContext) => {
    const { dtSeconds, nodeIncoming, edgeBackpressures, inEdgesByTarget, edgeFlows, nodesById, nextCloudStorage, get } = ctx;

    const antennasNodes: Node<NodeData>[] = [];
    ctx.nextNodes.forEach((node: Node<NodeData>) => {
        if (node.type === 'antenna' || node.type === 'powerTransmitter') {
            antennasNodes.push(node);
        }
    });

    for (const node of antennasNodes) {
        if (node.type === 'antenna' || node.type === 'powerTransmitter') {
            const incoming = nodeIncoming[node.id];
            const incomingRates: Record<string, { res: string; rate: string }> = {};

            const inEdges = inEdgesByTarget[node.id] || [];
            for (const edge of inEdges) {
                const flow = edgeFlows[edge.id];
                if (flow) {
                    for (const [rt, amt] of Object.entries(flow)) {
                        const rateVal = dtSeconds > 0 ? (amt as Decimal).dividedBy(dtSeconds) : new Decimal(0);
                        if (edge.targetHandle && rateVal.gt(0)) {
                            incomingRates[edge.targetHandle] = { res: rt, rate: rateVal.toString() };
                        }
                    }
                }
            }
            node.data = { ...node.data, incomingRates };

            for (const edge of inEdges) {
                if (!edge.targetHandle) continue;
                let rt: ResourceType | null = null;
                const ratesData = node.data?.incomingRates?.[edge.targetHandle];
                const srcNode = nodesById[edge.source];
                if (ratesData?.res) rt = ratesData.res as ResourceType;
                else {
                    const flow = edgeFlows[edge.id];
                    if (flow) rt = Object.keys(flow)[0] as ResourceType;
                    else if (srcNode && srcNode.data?.resourceType) rt = srcNode.data.resourceType as ResourceType;
                }

                if (rt) {
                    const config = RESOURCE_REGISTRY[rt];
                    if (config && config.isUploadAvailable) {
                        const cur = nextCloudStorage[rt] || new Decimal(0);
                        const cap = new Decimal(5000).times(Math.pow(2, (get().cloudLevel || 1) - 1));
                        const space = Decimal.max(0, cap.minus(cur));

                        const decAmt = incoming?.[rt as ResourceType] || new Decimal(0);
                        const acceptance = decAmt.gt(0)
                            ? Decimal.min(space, decAmt).dividedBy(decAmt)
                            : (space.gt(0) ? new Decimal(1) : new Decimal(0));

                        edgeBackpressures[edge.id] = edgeBackpressures[edge.id]
                            ? Decimal.min(edgeBackpressures[edge.id], acceptance)
                            : acceptance;
                    }
                }
            }

            if (incoming) {
                for (const [rtStr, amt] of Object.entries(incoming)) {
                    const rt = rtStr as ResourceType;
                    const decAmt = amt as Decimal;

                    const config = RESOURCE_REGISTRY[rt];
                    if (!config || !config.isUploadAvailable) continue;

                    const cur = nextCloudStorage[rt] || new Decimal(0);
                    const cap = new Decimal(5000).times(Math.pow(2, (get().cloudLevel || 1) - 1));
                    const space = Decimal.max(0, cap.minus(cur));

                    const accept = Decimal.min(decAmt, space);
                    nextCloudStorage[rt] = cur.plus(accept);
                    addCloudStat(ctx, 'production', rt, accept);

                    if (nodeIncoming[node.id]) {
                        const curInc = nodeIncoming[node.id]![rt] || new Decimal(0);
                        nodeIncoming[node.id]![rt] = Decimal.max(0, curInc.minus(accept));
                    }
                }
            }
        }
    }
};
