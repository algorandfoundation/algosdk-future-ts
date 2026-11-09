import { readFileSync } from "node:fs";
import type { ARC56Contract } from "@algosdk/transaction-composer";

export function loadContract(name: string): ARC56Contract {
  return JSON.parse(
    readFileSync(
      new URL(`./generated/${name}.arc56.json`, import.meta.url),
      "utf8",
    ),
  ) as ARC56Contract;
}

export default loadContract("ARC56Test");

// Deliberately synthetic legacy metadata; deployed code always comes from Puya.
export const legacyStructs: ARC56Contract["structs"] = {
  MapValue: { foo: "uint16", bar: "uint16" },
  Pair: { a: "uint64", b: "uint64" },
  Inputs: {
    add: { a: "uint64", b: "uint64" },
    subtract: { a: "uint64", b: "uint64" },
  },
  Outputs: { sum: "uint64", difference: "uint64" },
};
