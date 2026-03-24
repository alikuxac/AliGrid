import Decimal from "break_infinity.js";
import { nanoid } from "nanoid";
import { ResourceType } from "../resources";

export type { ResourceType };

export interface BaseGeneratorData {
    id: string;
    type: "generator";
    resourceType: ResourceType;
    level: number;
    tier: number;
    outputRate: Decimal; // generated per second
    powerConsumption?: Decimal;
}

export const createBaseGenerator = (
    resourceType: ResourceType,
    initialRateStr = "1",
    powerConsumptionStr?: string
): BaseGeneratorData => {
    return {
        id: nanoid(),
        type: "generator",
        resourceType,
        level: 0,
        tier: 0,
        outputRate: new Decimal(initialRateStr),
        powerConsumption: powerConsumptionStr ? new Decimal(powerConsumptionStr) : undefined,
    };
};
