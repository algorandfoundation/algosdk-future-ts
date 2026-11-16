import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import {
  getABIType,
  getABITypeFromStructFields,
  getABIValue,
  getABIValuesFromStructFieldsAndObject,
  getObjectFromStructFieldsAndArray,
  getTypeScriptValue,
} from "../src/arc56_utils";
import type { ARC56Contract, StructField } from "../src/types/arc56";
import arc56Json from "../../../fixtures/ARC56Test.arc56.json";

describe("getTypeScriptValue", () => {
  const arc56 = arc56Json as unknown as ARC56Contract;
  const values = [0n, 5n, 2n ** 53n - 1n, 2n ** 53n, 2n ** 60n, 2n ** 64n - 1n];

  for (const type of ["AVMUint64", "uint64"]) {
    it.each(values)(`should decode ${type} %s as bigint`, (value) => {
      const decoded = getTypeScriptValue(
        arc56,
        type,
        algosdk.encodeUint64(value),
      );

      expect(typeof decoded).toBe("bigint");
      expect(decoded).toBe(value);
    });
  }
});

describe("struct field arrays", () => {
  const structs: StructField[] = [
    { name: "first", type: "uint8" },
    { name: "inner", type: "Inner" },
    {
      name: "nested",
      type: [
        { name: "x", type: "uint16" },
        { name: "y", type: "uint32" },
      ],
    },
  ];

  // The same structs in the legacy `{ [fieldName]: type }` representation
  const legacyStructs = {
    first: "uint8",
    inner: { a: "uint64", b: "byte[96]" },
    nested: { x: "uint16", y: "uint32" },
  };

  const arc56 = {
    name: "StructArrayForms",
    structs: {
      Inner: [
        { name: "a", type: "uint64" },
        { name: "b", type: "byte[96]" },
      ],
      Outer: structs,
      OuterLegacy: legacyStructs,
    },
  } as unknown as ARC56Contract;

  const bytes = new Uint8Array([1, 2, 3]);
  const obj = { first: 1, inner: { a: 2n, b: bytes }, nested: { x: 3, y: 4 } };
  const abiValues = [1, [2n, bytes], [3, 4]];
  const abiType = "(uint8,(uint64,byte[96]),(uint16,uint32))";

  it("builds the ABI type of named and inline field arrays", () => {
    expect(getABITypeFromStructFields(arc56, structs)).toBe(abiType);
    expect(getABIType(arc56, structs)).toBe(abiType);
    expect(getABIType(arc56, "Outer")).toBe(abiType);
    expect(getABIType(arc56, "OuterLegacy")).toBe(abiType);
  });

  it("encodes an object into nested ABI values", () => {
    expect(getABIValuesFromStructFieldsAndObject(arc56, structs, obj)).toEqual(
      abiValues,
    );
    expect(getABIValue(arc56, "Outer", obj)).toEqual(abiValues);
  });

  it("agrees with the legacy struct map representation", () => {
    expect(
      getABIValuesFromStructFieldsAndObject(arc56, legacyStructs, obj),
    ).toEqual(abiValues);
  });

  it("decodes nested ABI values back into an object", () => {
    expect(
      getObjectFromStructFieldsAndArray(arc56, structs, abiValues),
    ).toEqual(obj);
  });

  it("passes through struct values that are not plain objects", () => {
    const alreadyEncoded = {
      first: 1,
      inner: [2n, bytes],
      nested: [3, 4],
    };

    expect(
      getABIValuesFromStructFieldsAndObject(arc56, structs, alreadyEncoded),
    ).toEqual(abiValues);
  });

  it("leaves native AVM types alone", () => {
    expect(getABIValue(arc56, "AVMString", "hello")).toBe("hello");
    expect(getABIValue(arc56, "AVMUint64", 1n)).toBe(1n);
  });
});
