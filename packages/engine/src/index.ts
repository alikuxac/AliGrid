import Decimal from "break_infinity.js";
import { create } from "zustand";
import { nanoid } from "nanoid";

export { Decimal, create, nanoid };

export const createGameNode = (name: string) => {
  return {
    id: nanoid(),
    name,
    processed: new Decimal(0),
  };
};
export * from "./nodes/baseGenerator";
export * from "./nodes/baseProcessor";
export * from "./nodes/waterGenerator";
export * from "./nodes/rawGenerators";
export * from "./nodes/processors";
export * from "./nodes/storage";
export * from "./nodes/merger";
export * from "./nodes/splitter";
export * from "./nodes/antenna";
export * from "./resources";
export * from "./nodes/factory";
