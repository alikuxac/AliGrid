import type { Node } from 'reactflow';
import { Decimal, ResourceType, StorageNodeData, updateStorageNodeSingle } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';
import { safeDecimal } from '../helpers';

export const updateStorages = (ctx: TickContext) => {
    const { dtSeconds, nodeIncoming, edgeBackpressures, inEdgesByTarget, nodeDeltas = {} } = ctx;
    ctx.nodeDeltas = nodeDeltas;

    for (const node of ctx.nextNodes) {
        if (node.type === 'storage' || node.type === 'accumulator') {
            const incomingMap = nodeIncoming[node.id];

            if (node.type === 'accumulator') {
                const inAmt = incomingMap?.['electricity'] || safeDecimal(0);
                let currentBuf = safeDecimal(node.data.buffer || 0);

                const Level = node.data?.level || 0;
                const multiplier = Math.pow(2, Level);
                const defaultMax = 5000 * multiplier;
                const max = safeDecimal(node.data?.maxBuffer || node.data?.template?.maxBuffer || defaultMax);

                const added = Decimal.min(inAmt, max.minus(currentBuf));
                const total = currentBuf.plus(added);

                const acceptance = inAmt.gt(0) ? added.dividedBy(inAmt) : safeDecimal(1);

                const inEdges = inEdgesByTarget[node.id] || [];
                inEdges.forEach(e => {
                    const res = (e.data as any)?.resourceType || 'electricity';
                    if (res === 'electricity') edgeBackpressures[e.id] = acceptance;
                });

                nodeDeltas[node.id] = {
                    ...nodeDeltas[node.id],
                    buffer: total.toString(),
                    actualInputPerSec: dtSeconds > 0 ? added.dividedBy(dtSeconds) : safeDecimal(0)
                };

                if (incomingMap) delete incomingMap['electricity'];
                continue;
            }

            let locked = node.data.lockedResourceType as ResourceType | undefined;
            let amount = node.data.currentAmount || safeDecimal(0);
            let actualInputPerSec = safeDecimal(0);

            if (incomingMap && Object.keys(incomingMap).length > 0) {
                const entries = Object.entries(incomingMap) as [ResourceType, Decimal][];
                const active = entries.find(([_, amt]) => amt.gt(0));

                if (active) {
                    const [inType, inAmt] = active;

                    if (!locked || locked !== inType) {
                        amount = safeDecimal(0);
                        locked = inType;
                    }

                    actualInputPerSec = dtSeconds > 0 ? inAmt.dividedBy(dtSeconds) : safeDecimal(0);

                    const simState: StorageNodeData = {
                        id: node.id, type: "storage", level: node.data.level || 1,
                        currentAmount: safeDecimal(amount as any), lockedResourceType: locked, actualInputPerSec
                    };

                    const { updatedAmount } = updateStorageNodeSingle(simState, inAmt);
                    const added = updatedAmount.minus(amount);
                    const acceptance = inAmt.gt(0) && inAmt.gt(2e-9) ? added.dividedBy(inAmt) : safeDecimal(1);
                    amount = updatedAmount;

                    const inEdges = inEdgesByTarget[node.id] || [];
                    const isEdge = inEdges[0];
                    if (isEdge) edgeBackpressures[isEdge.id] = acceptance;

                    delete incomingMap[inType];
                }
            } else {
                actualInputPerSec = safeDecimal(0);
            }

            nodeDeltas[node.id] = {
                ...nodeDeltas[node.id],
                lockedResourceType: locked,
                currentAmount: amount,
                actualInputPerSec
            };
        }
    }
};
