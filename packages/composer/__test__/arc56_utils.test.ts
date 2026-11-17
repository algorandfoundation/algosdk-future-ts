import { describe, it, expect, expectTypeOf } from "vitest";
import algosdk from "algosdk";
import {
  getABIType,
  getABITypeFromStructFields,
  getABIValue,
  getABIValuesFromStructFieldsAndObject,
  getAbiMethodFromDefinition,
  getObjectFromStructFieldsAndArray,
  getTypeScriptValue,
  type StructDef,
} from "../src/arc56_utils";
import type { ARC56Contract, Method, StructField } from "../src/types/arc56";
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

  const arc56: ARC56Contract = {
    arcs: [4, 56],
    name: "StructArrayForms",
    methods: [],
    structs: {
      Inner: [
        { name: "a", type: "uint64" },
        { name: "b", type: "byte[96]" },
      ],
      Outer: structs,
    },
  };

  const bytes = new Uint8Array([1, 2, 3]);
  const obj = { first: 1, inner: { a: 2n, b: bytes }, nested: { x: 3, y: 4 } };
  const abiValues = [1, [2n, bytes], [3, 4]];
  const abiType = "(uint8,(uint64,byte[96]),(uint16,uint32))";

  it("builds the ABI type of named and inline field arrays", () => {
    expect(getABITypeFromStructFields(arc56, structs)).toBe(abiType);
    expect(getABIType(arc56, structs)).toBe(abiType);
    expect(getABIType(arc56, "Outer")).toBe(abiType);
  });

  it("encodes an object into nested ABI values", () => {
    expect(getABIValuesFromStructFieldsAndObject(arc56, structs, obj)).toEqual(
      abiValues,
    );
    expect(getABIValue(arc56, "Outer", obj)).toEqual(abiValues);
    expect(getABIValue(arc56, structs, obj)).toEqual(abiValues);
  });

  it("only accepts field arrays as struct definitions", () => {
    type LegacyFields = { amount: "uint64" };
    expectTypeOf<LegacyFields>().not.toExtend<StructDef>();
    expectTypeOf<LegacyFields>().not.toExtend<
      NonNullable<ARC56Contract["structs"]>[string]
    >();

    // JSON input can bypass the TypeScript types, but is no longer supported.
    const legacy = { amount: "uint64" } as unknown as StructField[];
    expect(() => getABIType(arc56, legacy)).toThrow(TypeError);
    expect(() => getABIValue(arc56, legacy, { amount: 1n })).toThrow(TypeError);
    expect(() =>
      getObjectFromStructFieldsAndArray(arc56, legacy, [1n]),
    ).toThrow(TypeError);
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

describe("struct names that collide with native types", () => {
  const fields: StructField[] = [{ name: "x", type: "uint64" }];
  const arc56: ARC56Contract = {
    arcs: [4, 56],
    name: "NativeTypeCollisions",
    structs: {
      Input: fields,
      void: fields,
      bytes: fields,
      AVMBytes: fields,
      AVMString: fields,
      AVMUint64: fields,
    },
    methods: [],
  };

  it("preserves void returns when a named argument requires fallback resolution", () => {
    const method: Method = {
      name: "set",
      args: [{ name: "input", type: "Input" }],
      returns: { type: "void" },
      actions: { call: ["NoOp"], create: [] },
    };
    const expected = algosdk.ABIMethod.fromSignature("set((uint64))void");
    const actual = getAbiMethodFromDefinition(arc56, method);

    expect(actual.getSignature()).toBe(expected.getSignature());
    expect(actual.getSelector()).toEqual(expected.getSelector());
  });

  it.each(["bytes", "AVMBytes", "AVMString", "AVMUint64"])(
    "does not convert %s objects to struct tuples",
    (type) => {
      const value = { x: 42n };
      expect(getABIValue(arc56, type, value)).toBe(value);
    },
  );

  it.each([
    {
      type: "bytes",
      value: "hello",
      encoded: new TextEncoder().encode("hello"),
    },
    {
      type: "AVMString",
      value: "hello",
      encoded: new TextEncoder().encode("hello"),
    },
    {
      type: "AVMBytes",
      value: new Uint8Array([1, 2, 3]),
      encoded: new Uint8Array([1, 2, 3]),
    },
    { type: "AVMUint64", value: 42n, encoded: algosdk.encodeUint64(42n) },
  ])(
    "preserves native $type values despite a colliding struct name",
    ({ type, value, encoded }) => {
      expect(getABIValue(arc56, type, value)).toBe(value);
      expect(getTypeScriptValue(arc56, type, encoded)).toEqual(value);
    },
  );
});
