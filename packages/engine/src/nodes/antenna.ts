import { nanoid } from "nanoid";

export interface AntennaNodeData {
    id: string;
    type: "antenna";
    efficiency: number; // multiplier if needed
}

export const createAntennaNode = (): AntennaNodeData => {
    return {
        id: nanoid(),
        type: "antenna",
        efficiency: 1,
    };
};
