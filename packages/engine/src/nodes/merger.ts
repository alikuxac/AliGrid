import { nanoid } from "nanoid";
import { ResourceType } from "./baseGenerator";

export interface MergerNodeData {
    id: string;
    type: "merger";
    activeInputs: number;
    maxInputs: number;
    lockedResourceType?: ResourceType; // set when first connection is made
}

export const createMergerNode = (): MergerNodeData => {
    return {
        id: nanoid(),
        type: "merger",
        activeInputs: 1,
        maxInputs: 5,
        lockedResourceType: undefined,
    };
};
