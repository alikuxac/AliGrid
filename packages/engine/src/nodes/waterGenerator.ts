import { createBaseGenerator, BaseGeneratorData } from "./baseGenerator";

export const createWaterGenerator = (initialRateStr = "1"): BaseGeneratorData => {
    return createBaseGenerator('water', initialRateStr);
};
