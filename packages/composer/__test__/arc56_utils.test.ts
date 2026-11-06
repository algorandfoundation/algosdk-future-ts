import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import {
  decodeValue,
  encodeValue,
  encodeMethodArgs,
  decodeMethodReturnValue,
  getStructForType,
} from "../src/arc56_utils";
import type { ARC56Contract } from "../src/types/arc56";
import arc56Json from "../../../fixtures/ARC56Test.arc56.json";

describe("decodeValue", () => {
  const arc56 = arc56Json as unknown as ARC56Contract;
  const values = [0n, 5n, 2n ** 53n - 1n, 2n ** 53n, 2n ** 60n, 2n ** 64n - 1n];

  for (const type of ["AVMUint64", "uint64"]) {
    it.each(values)(`should decode ${type} %s as bigint`, (value) => {
      const decoded = decodeValue(arc56, type, algosdk.encodeUint64(value));

      expect(typeof decoded).toBe("bigint");
      expect(decoded).toBe(value);
    });
  }
});

describe("encodeValue and decodeValue", () => {
  const arc56 = arc56Json as unknown as ARC56Contract;

  it("round-trips a struct by name", () => {
    const outputs = { sum: 30n, difference: 35n };
    const encoded = encodeValue(arc56, "Outputs", outputs);

    expect(encoded).toEqual(
      algosdk.ABIType.from("(uint64,uint64)").encode([30n, 35n]),
    );
    expect(decodeValue(arc56, "Outputs", encoded)).toEqual(outputs);
  });

  it("round-trips nested struct fields", () => {
    const inputs = {
      add: { a: 10n, b: 20n },
      subtract: { a: 50n, b: 15n },
    };
    const encoded = encodeValue(arc56, "Inputs", inputs);

    expect(decodeValue(arc56, "Inputs", encoded)).toEqual(inputs);
  });

  it("keeps tuple arrays as tuples even when their shape matches a struct", () => {
    const encoded = algosdk.ABIType.from("(uint64,uint64)[]").encode([
      [1n, 2n],
      [3n, 4n],
    ]);

    expect(getStructForType(arc56, "(uint64,uint64)[]")).toBeUndefined();
    expect(decodeValue(arc56, "(uint64,uint64)[]", encoded)).toEqual([
      [1n, 2n],
      [3n, 4n],
    ]);
  });

  it("encodes arrays of structs from objects", () => {
    const outputs = [
      { sum: 1n, difference: 2n },
      { sum: 3n, difference: 4n },
    ];

    expect(encodeValue(arc56, "Outputs[]", outputs)).toEqual(
      algosdk.ABIType.from("(uint64,uint64)[]").encode([
        [1n, 2n],
        [3n, 4n],
      ]),
    );
  });

  it("encodes and decodes array struct types by name", () => {
    const outputs = [
      { sum: 1n, difference: 2n },
      { sum: 3n, difference: 4n },
    ];

    expect(
      decodeValue(arc56, "Outputs[]", encodeValue(arc56, "Outputs[]", outputs)),
    ).toEqual(outputs);
  });

  it.each([
    "((uint64,uint64),string,byte[])",
    "((uint64,uint64),string,byte[])[]",
    "((uint64,uint64),string,byte[])[1][]",
  ])("preserves tuples nested in %s despite matching struct shapes", (type) => {
    const tuple = [[1n, 2n], "hi", new Uint8Array([3, 4])];
    const wrap = (value: unknown) =>
      type.endsWith("[1][]")
        ? [[value]]
        : type.endsWith("[]")
          ? [value]
          : value;
    const abiValue = wrap(tuple) as algosdk.ABIValue;
    const value = wrap(tuple);
    const bytes = algosdk.ABIType.from(type).encode(abiValue);

    expect(decodeValue(arc56, type, bytes)).toEqual(value);
    expect(encodeValue(arc56, type, value)).toEqual(bytes);
    expect(
      encodeMethodArgs(
        arc56,
        {
          name: "nested",
          args: [{ name: "value", type }],
          returns: { type: "void" },
          actions: { create: [], call: ["NoOp"] },
        },
        [value],
      ),
    ).toEqual([abiValue]);
  });

  it("preserves tuples inside an explicitly named struct", () => {
    const spec: ARC56Contract = {
      ...arc56,
      structs: {
        ...arc56.structs,
        Wrapper: [{ name: "entry", type: "((uint64,uint64),string)" }],
      },
    };
    const value = { entry: [[1n, 2n], "hi"] };
    const bytes = algosdk.ABIType.from("(((uint64,uint64),string))").encode([
      [[1n, 2n], "hi"],
    ]);

    expect(encodeValue(spec, "Wrapper", value)).toEqual(bytes);
    expect(decodeValue(spec, "Wrapper", bytes)).toEqual(value);
  });

  it("uses explicit struct annotations for method arguments and returns", () => {
    const method = {
      name: "explicit",
      args: [{ name: "value", type: "(uint64,uint64)", struct: "Outputs" }],
      returns: { type: "(uint64,uint64)", struct: "Outputs" },
      actions: { create: [], call: ["NoOp" as const] },
    };
    const spec = { ...arc56, methods: [method] };
    const value = { sum: 1n, difference: 2n };
    const bytes = algosdk.ABIType.from("(uint64,uint64)").encode([1n, 2n]);
    expect(encodeMethodArgs(spec, method, [value])).toEqual([[1n, 2n]]);
    expect(decodeMethodReturnValue(spec, "explicit", bytes)).toEqual(value);
    const unannotated = {
      ...method,
      args: [{ name: "value", type: "(uint64,uint64)" }],
      returns: { type: "(uint64,uint64)" },
    };
    expect(
      decodeMethodReturnValue(
        { ...spec, methods: [unannotated] },
        "explicit",
        bytes,
      ),
    ).toEqual([1n, 2n]);
    expect(() => encodeValue(spec, "(uint64,uint64)", value)).toThrow();
  });

  it("round-trips explicitly named struct arrays inside struct fields", () => {
    const spec: ARC56Contract = {
      ...arc56,
      structs: {
        ...arc56.structs,
        Wrapper: [{ name: "entries", type: "Outputs[1][]" }],
      },
    };
    const value = { entries: [[{ sum: 1n, difference: 2n }]] };
    expect(getStructForType(spec, "Outputs[1][]")).toEqual({
      name: "Outputs",
      arrayDepth: 2,
    });
    expect(
      decodeValue(spec, "Wrapper", encodeValue(spec, "Wrapper", value)),
    ).toEqual(value);
  });
});
