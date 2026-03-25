import { Node } from 'reactflow';
import { Decimal, ResourceType, StorageNodeData, updateStorageNodeSingle } from '@aligrid/engine';
import { NodeData } from '../../../types';
import { TickContext } from '../types';

export const updateStorages = (ctx: TickContext) => {
    const { dtSeconds, nodeIncoming, edgeBackpressures, inEdgesByTarget, nodeDeltas = {} } = ctx;
    ctx.nodeDeltas = nodeDeltas;

    for (const node of ctx.nextNodes) {
        if (node.type === 'storage') {
            const incomingMap = nodeIncoming[node.id];
            let locked = node.data.lockedResourceType as ResourceType | undefined;
            let amount = node.data.currentAmount || new Decimal(0);
            let actualInputPerSec = new Decimal(0);

            if (incomingMap && Object.keys(incomingMap).length > 0) {
                const entries = Object.entries(incomingMap) as [ResourceType, Decimal][];
                const active = entries.find(([_, amt]) => amt.gt(0));

                if (active) {
                    const [inType, inAmt] = active;

                    if (!locked || locked !== inType) {
                        amount = new Decimal(0);
                        locked = inType;
                    }

                    actualInputPerSec = dtSeconds > 0 ? inAmt.dividedBy(dtSeconds) : new Decimal(0);

                    const simState: StorageNodeData = {
                        id: node.id, type: "storage", level: node.data.level || 1,
                        currentAmount: new Decimal(amount as any), lockedResourceType: locked, actualInputPerSec
                    };

                    const { updatedAmount } = updateStorageNodeSingle(simState, inAmt);
                    const added = updatedAmount.minus(amount);
                    const acceptance = inAmt.gt(0) && inAmt.gt(2e-9) ? added.dividedBy(inAmt) : new Decimal(1);
                    amount = updatedAmount;

                    const inEdges = inEdgesByTarget[node.id] || [];
                    const isEdge = inEdges[0];
                    if (isEdge) edgeBackpressures[isEdge.id] = acceptance;

                    delete incomingMap[inType];
                }
            } else {
                actualInputPerSec = new Decimal(0);
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
