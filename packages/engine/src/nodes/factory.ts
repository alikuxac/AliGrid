import Decimal from "break_infinity.js";
import { createWaterGenerator } from "./waterGenerator";
import { createIronGenerator, createCopperGenerator, createCoalGenerator, createLavaPump } from "./rawGenerators";
import { createStorageNode } from "./storage";
import { createHydroGenerator } from "./processors";
import { createMergerNode } from "./merger";
import { createSplitterNode } from "./splitter";
import { createAntennaNode } from "./antenna";

export const NODE_DATA_FACTORY: Record<string, () => any> = {
    waterGenerator: () => createWaterGenerator('1'),
    ironGenerator: () => createIronGenerator('1.0'),
    copperGenerator: () => createCopperGenerator('1.0'),
    coalGenerator: () => createCoalGenerator('1.5'),
    lavaPump: () => ({ ...createLavaPump('1'), resourceType: 'lava', powerConsumption: undefined }),
    storage: () => createStorageNode(1),
    hydroGenerator: () => createHydroGenerator(),
    merger: () => createMergerNode(),
    splitter: () => createSplitterNode([1, 1]),
    antenna: () => createAntennaNode(),
    downloader: () => ({ resourceType: 'iron', outputRate: new Decimal(1) })
};
