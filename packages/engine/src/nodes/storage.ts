import Decimal from "break_infinity.js";
import { nanoid } from "nanoid";
import { ResourceType } from "./baseGenerator";

export interface StorageNodeData {
    id: string;
    type: "storage";
    level: number; // Tier: 1, 2, 3...
    currentAmount: Decimal; // Single resource amount
    lockedResourceType?: ResourceType; // Locks to first item that flows in
    actualInputPerSec: Decimal; // rate
}

export const STORAGE_CAPACITIES: Record<number, Decimal> = {
    1: new Decimal("200"),
    2: new Decimal("1000"),
    3: new Decimal("5000"),
    4: new Decimal("25000"),
};

export const createStorageNode = (level: number = 1): StorageNodeData => {
    return {
        id: nanoid(),
        type: "storage",
        level,
        currentAmount: new Decimal(0),
        lockedResourceType: undefined,
        actualInputPerSec: new Decimal(0),
    };
};

export const getStorageCapacity = (level: number): Decimal => {
    return STORAGE_CAPACITIES[level] || STORAGE_CAPACITIES[1];
};

export const updateStorageNodeSingle = (
    node: StorageNodeData,
    incomingAmount: Decimal
): { updatedAmount: Decimal; overflow: Decimal } => {
    const capacity = getStorageCapacity(node.level);
    const total = node.currentAmount.plus(incomingAmount);

    if (total.greaterThan(capacity)) {
        return {
            updatedAmount: new Decimal(capacity),
            overflow: total.minus(capacity),
        };
    }
    return {
        updatedAmount: total,
        overflow: new Decimal(0),
    };
};
