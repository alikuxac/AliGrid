import { nanoid } from "nanoid";

export interface SplitterNodeData {
    id: string;
    type: "splitter";
    maxOutputs: number;
    ratios: number[];   // e.g. [2, 1] → out1 gets 2/3, out2 gets 1/3
}

export const createSplitterNode = (ratios: number[] = [1, 1]): SplitterNodeData => {
    return {
        id: nanoid(),
        type: "splitter",
        maxOutputs: 5,
        ratios,
    };
};
