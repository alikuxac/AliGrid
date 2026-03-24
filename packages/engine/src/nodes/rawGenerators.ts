import { createBaseGenerator, BaseGeneratorData } from "./baseGenerator";

export const createIronGenerator = (rateStr = "1"): BaseGeneratorData => {
    return createBaseGenerator('iron', rateStr, "0");
};

export const createCopperGenerator = (rateStr = "1"): BaseGeneratorData => {
    return createBaseGenerator('copper', rateStr, "0");
};

export const createCoalGenerator = (rateStr = "1"): BaseGeneratorData => {
    return createBaseGenerator('coal', rateStr, "0");
};

export const createLavaPump = (rateStr = "1"): BaseGeneratorData => {
    return createBaseGenerator('lava', rateStr, "5");
};
