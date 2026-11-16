import algosdk from "algosdk";
import type {
  ARC56Contract,
  Method,
  StructField,
  StructFields,
} from "./types/arc56.ts";

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export type StructDef = StructField[] | StructFields | StructField["type"];

export function getABITypeFromStructFields(
  arc56: ARC56Contract,
  structFields: StructDef,
): string {
  const typesArray: string[] = [];

  // Join rather than reformatting a JSON array, so that the square brackets of
  // a sized element type such as `byte[96]` survive
  const pushType = (val: StructDef) => {
    if (typeof val !== "string") {
      typesArray.push(getABITypeFromStructFields(arc56, val));
    } else {
      // Expand struct references, including arrays of them, so the resulting
      // type string is a valid ABI type
      typesArray.push(getABIType(arc56, val));
    }
  };

  if (Array.isArray(structFields)) {
    for (const field of structFields) {
      pushType(field.type);
    }
  } else if (typeof structFields === "object") {
    for (const val of Object.values(structFields)) {
      pushType(val);
    }
  }

  return `(${typesArray.join(",")})`;
}

export function getABIType(arc56: ARC56Contract, type: string): string {
  if (arc56.structs && arc56.structs[type]) {
    return getABITypeFromStructFields(arc56, arc56.structs[type]);
  }

  // Expand struct references inside arrays, e.g. `Point[]` -> `(uint64,uint64)[]`
  const array = type.match(/^(.*)\[(\d*)\]$/);
  if (array) {
    const base = array[1] ?? "";
    const expanded = getABIType(arc56, base);
    if (expanded !== base) {
      return `${expanded}[${array[2]}]`;
    }
  }

  return type;
}

export interface StructTypeMatch {
  /** The full name of the matching ARC56 struct */
  name: string;
  /** How many arrays wrap the struct, e.g. 2 for `Point[][]` */
  arrayDepth: number;
}

/**
 * Find an ARC56 struct by name, including arrays of that struct.
 */
export function getStructForType(
  arc56: ARC56Contract,
  type: string,
): StructTypeMatch | undefined {
  const structs = arc56.structs;
  if (!structs) return undefined;

  if (structs[type]) return { name: type, arrayDepth: 0 };

  let base = type;
  let arrayDepth = 0;
  while (/\[\d*\]$/.test(base)) {
    base = base.replace(/\[\d*\]$/, "");
    arrayDepth += 1;
  }

  if (structs[base]) return { name: base, arrayDepth };

  return undefined;
}

/**
 * Apply `convert` to every leaf of a value nested `arrayDepth` arrays deep,
 * e.g. to each struct in a `Point[][]`
 */
function convertArrayDepth(
  type: string,
  value: unknown,
  arrayDepth: number,
  convert: (value: unknown) => unknown,
): unknown {
  if (arrayDepth === 0) return convert(value);
  if (!Array.isArray(value)) {
    throw new TypeError(
      `Expected an array for ${type}, got ${describeValue(value)}`,
    );
  }
  return value.map((child) =>
    convertArrayDepth(type, child, arrayDepth - 1, convert),
  );
}

export function getABIValuesFromStructFieldsAndObject(
  arc56: ARC56Contract,
  structFields: StructDef,
  obj: unknown,
  structName?: string,
): algosdk.ABIValue[] {
  const valuesArray: algosdk.ABIValue[] = [];
  const structLabel = structName ?? describeStructDef(structFields);

  const pushValue = (key: string, val: StructDef, prop: unknown) => {
    if (typeof val !== "string") {
      // Anonymous nested structs are labelled by their path, e.g. `Inputs.add`
      valuesArray.push(
        isRecord(prop)
          ? getABIValuesFromStructFieldsAndObject(
              arc56,
              val,
              prop,
              `${structLabel}.${key}`,
            )
          : (prop as algosdk.ABIValue),
      );
      return;
    }

    valuesArray.push(getABIValue(arc56, val, prop));
  };

  if (!isRecord(obj)) {
    throw new TypeError(
      `Expected an object for struct ${structLabel}, got ${describeValue(obj)}`,
    );
  }

  const fieldValue = (key: string): unknown => {
    if (!(key in obj) || obj[key] === undefined) {
      throw new TypeError(`Missing field "${key}" for struct ${structLabel}`);
    }
    return obj[key];
  };

  if (Array.isArray(structFields)) {
    for (const field of structFields) {
      pushValue(field.name, field.type, fieldValue(field.name));
    }
  } else if (typeof structFields === "object") {
    for (const [key, val] of Object.entries(structFields)) {
      pushValue(key, val, fieldValue(key));
    }
  }

  return valuesArray;
}

export function getABIValue(
  arc56: ARC56Contract,
  type: string,
  value: unknown,
): algosdk.ABIValue {
  if (
    type === "bytes" ||
    type === "AVMBytes" ||
    type === "AVMString" ||
    type === "AVMUint64"
  ) {
    return value as algosdk.ABIValue;
  }

  const match = getStructForType(arc56, type);
  const def = match ? arc56.structs?.[match.name] : undefined;
  if (match && def) {
    return convertArrayDepth(type, value, match.arrayDepth, (val) =>
      isRecord(val)
        ? getABIValuesFromStructFieldsAndObject(arc56, def, val, match.name)
        : val,
    ) as algosdk.ABIValue;
  }

  return value as algosdk.ABIValue;
}

export function getObjectFromStructFieldsAndArray(
  arc56: ARC56Contract,
  structFields: StructDef,
  valuesArray: unknown[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const arr = [...valuesArray];

  const setValue = (key: string, val: StructDef, nextVal: unknown) => {
    if (typeof val !== "string") {
      obj[key] = getObjectFromStructFieldsAndArray(
        arc56,
        val,
        Array.isArray(nextVal) ? nextVal : [],
      );
      return;
    }

    obj[key] = getDecodedValue(arc56, val, nextVal);
  };

  if (Array.isArray(structFields)) {
    for (const field of structFields) {
      setValue(field.name, field.type, arr.shift());
    }
  } else if (typeof structFields === "object") {
    for (const [key, val] of Object.entries(structFields)) {
      setValue(key, val, arr.shift());
    }
  }

  return obj;
}

function normalizeDecodedABIValue(
  type: algosdk.ABIType,
  value: algosdk.ABIValue,
): algosdk.ABIValue {
  if (!Array.isArray(value)) return value;

  if (
    type instanceof algosdk.ABIArrayStaticType ||
    type instanceof algosdk.ABIArrayDynamicType
  ) {
    if (type.childType instanceof algosdk.ABIByteType) {
      return new Uint8Array(value as number[]);
    }
    return value.map((child) =>
      normalizeDecodedABIValue(type.childType, child),
    );
  }

  if (type instanceof algosdk.ABITupleType) {
    return type.childTypes.map((childType, i) =>
      normalizeDecodedABIValue(childType, value[i] as algosdk.ABIValue),
    );
  }

  return value;
}

/**
 * Decode the raw bytes of a value of the given ARC56 type into its TypeScript
 * value. Named struct types are returned as objects.
 */
export function decodeValue(
  arc56: ARC56Contract,
  type: string,
  value: Uint8Array,
): unknown {
  if (type === "bytes" || type === "AVMString") {
    return new TextDecoder().decode(value);
  }
  if (type === "AVMBytes") {
    return value;
  }
  if (type === "AVMUint64") {
    return algosdk.decodeUint64(value, "bigint");
  }

  const abiType = algosdk.ABIType.from(getABIType(arc56, type));
  const abiValue = normalizeDecodedABIValue(abiType, abiType.decode(value));

  return getDecodedValue(arc56, type, abiValue);
}

/** Convert an already decoded ABI value to its TypeScript representation. */
function getDecodedValue(
  arc56: ARC56Contract,
  type: string,
  value: unknown,
): unknown {
  const match = getStructForType(arc56, type);
  const def = match ? arc56.structs?.[match.name] : undefined;
  if (match && def) {
    return convertArrayDepth(type, value, match.arrayDepth, (val) =>
      getObjectFromStructFieldsAndArray(
        arc56,
        def,
        Array.isArray(val) ? val : [val],
      ),
    );
  }

  return value;
}

function valueToBytes(value: unknown): Uint8Array {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value as number[]);
  }
  throw new TypeError(
    `Expected a string, Uint8Array or byte array, got ${describeValue(value)}`,
  );
}

const MAX_UINT64 = 2n ** 64n - 1n;

function valueToUint64(value: unknown): bigint {
  let uint: bigint;
  if (typeof value === "bigint") {
    uint = value;
  } else if (typeof value === "number" && Number.isInteger(value)) {
    uint = BigInt(value);
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    uint = BigInt(value);
  } else {
    const got =
      typeof value === "number" || typeof value === "string"
        ? JSON.stringify(value)
        : describeValue(value);
    throw new TypeError(
      `Expected a bigint, integer or integer string for AVMUint64, got ${got}`,
    );
  }
  if (uint < 0n || uint > MAX_UINT64) {
    throw new RangeError(`AVMUint64 value ${uint} is out of range`);
  }
  return uint;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function describeStructDef(def: StructDef): string {
  return typeof def === "string" ? def : JSON.stringify(def);
}

/**
 * Encode a TypeScript value of the given ARC56 type into its ABI bytes. Struct
 * types accept objects; ABI tuple types accept tuples.
 */
export function encodeValue(
  arc56: ARC56Contract,
  type: string,
  value: unknown,
): Uint8Array {
  if (type === "bytes" || type === "AVMBytes" || type === "AVMString") {
    return valueToBytes(value);
  }
  if (type === "AVMUint64") {
    return algosdk.encodeUint64(valueToUint64(value));
  }

  const abiType = algosdk.ABIType.from(getABIType(arc56, type));
  return abiType.encode(getABIValue(arc56, type, value));
}

export function decodeMethodReturnValue(
  arc56: ARC56Contract,
  methodName: algosdk.ABIMethod | string,
  rawValue: Uint8Array,
): unknown {
  const { arc56Method: method } = getAbiMethod(arc56, methodName);
  if (method.returns.type === "void" || rawValue.length === 0) {
    return undefined;
  }
  return decodeValue(
    arc56,
    method.returns.struct ?? method.returns.type,
    rawValue,
  );
}

export function encodeMethodArgs(
  arc56: ARC56Contract,
  arc56Method: Method,
  rawArgs: unknown[],
): algosdk.ABIArgument[] {
  return rawArgs.map((a, i) => {
    if (algosdk.isTransactionWithSigner(a)) {
      return a;
    }

    const argDef = arc56Method.args[i];
    if (!argDef) return a as algosdk.ABIValue;

    return getABIValue(arc56, argDef.struct ?? argDef.type, a);
  });
}

export function getAbiMethod(
  arc56: ARC56Contract,
  method: algosdk.ABIMethod | string,
): { abiMethod: algosdk.ABIMethod; arc56Method: Method } {
  const identifier =
    typeof method === "string" ? method : method.getSignature();
  const isSignature = typeof method !== "string" || identifier.includes("(");
  const name = isSignature ? identifier.split("(")[0] : identifier;
  const candidates = arc56.methods
    .filter((m) => m.name === name)
    .map((arc56Method) => ({
      arc56Method,
      abiMethod: getAbiMethodFromDefinition(arc56, arc56Method),
    }));
  const matches = isSignature
    ? candidates.filter((m) => m.abiMethod.getSignature() === identifier)
    : candidates;

  const match = matches[0];
  if (!match) {
    throw new Error(
      `Method ${identifier} not found in ${arc56.name} ARC56 definition`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Method ${identifier} is ambiguous in ${arc56.name} ARC56 definition; use one of: ${matches.map((m) => m.abiMethod.getSignature()).join(", ")}`,
    );
  }

  return match;
}

export function getAbiMethodFromDefinition(
  arc56: ARC56Contract,
  arc56Method: Method,
): algosdk.ABIMethod {
  try {
    return new algosdk.ABIMethod(arc56Method);
  } catch {
    return new algosdk.ABIMethod({
      name: arc56Method.name,
      desc: arc56Method.desc,
      args: arc56Method.args.map((a) => ({
        name: a.name,
        type: getABIType(arc56, a.struct ?? a.type),
        desc: a.desc,
      })),
      returns: {
        type:
          arc56Method.returns.type === "void"
            ? "void"
            : getABIType(
                arc56,
                arc56Method.returns.struct ?? arc56Method.returns.type,
              ),
        desc: arc56Method.returns.desc,
      },
    });
  }
}

/** Read a uvarint, returning its value and the index of the byte after it */
function readUvarint(program: Uint8Array, index: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = program[index++];
    if (byte === undefined) throw Error("Unexpected end of program");
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, index];
    shift += 7;
  }
}

/**
 * The pc of the first op after the constant blocks at the start of a program,
 * which the pcs of "cblocks" source info are relative to (see parseLogicError).
 */
export function getConstantBlockOffset(program: Uint8Array): number {
  const BYTE_CBLOCK = 0x26;
  const INT_CBLOCK = 0x20;

  // The version is a uvarint
  let [, pc] = readUvarint(program, 0);

  while (program[pc] === BYTE_CBLOCK || program[pc] === INT_CBLOCK) {
    const isBytecblock = program[pc] === BYTE_CBLOCK;
    let count: number;
    [count, pc] = readUvarint(program, pc + 1);
    for (let i = 0; i < count; i++) {
      if (isBytecblock) {
        // A uvarint length followed by that many bytes
        let length: number;
        [length, pc] = readUvarint(program, pc);
        pc += length;
      } else {
        [, pc] = readUvarint(program, pc);
      }
    }
  }

  return pc;
}

/**
 * Whether an approval program was compiled by TEALScript, which starts every
 * approval program (after the constant blocks) with this routing prelude:
 *
 *   txn ApplicationID
 *   !
 *   int 6
 *   *
 *   txn OnCompletion
 *   +
 *   switch ...
 *
 * `int 6` becomes `pushint 6`, or `intc` when 6 is in the intcblock.
 *
 * @param firstOpPc - The pc of the first op after the constant blocks
 */
function isTEALScriptProgram(program: Uint8Array, firstOpPc: number): boolean {
  let pc = firstOpPc;
  const match = (...bytes: number[]) => {
    if (!bytes.every((b, i) => program[pc + i] === b)) return false;
    pc += bytes.length;
    return true;
  };

  return (
    match(0x31, 0x18, 0x14) && // txn ApplicationID, !
    (match(0x81, 0x06) || // pushint 6
      match(0x22) || // intc_0
      match(0x23) || // intc_1
      match(0x24) || // intc_2
      match(0x25) || // intc_3
      match(0x21, program[pc + 1] ?? -1)) && // intc n
    match(0x0b, 0x31, 0x19, 0x08, 0x8d) // *, txn OnCompletion, +, switch
  );
}

/** The ARC56 approval byteCode, if it is the deployed program (no template variables) */
function deployedByteCode(arc56: ARC56Contract): Uint8Array | undefined {
  if (Object.keys(arc56.templateVariables ?? {}).length > 0) return undefined;
  if (!arc56.byteCode?.approval) return undefined;
  return algosdk.base64ToBytes(arc56.byteCode.approval);
}

/**
 * Turn a logic error from algod (when executing or simulating) into an error
 * carrying the ARC56 errorMessage for the failing pc. Returns undefined when
 * the error is from another app or the source info has no message for it.
 *
 * @param appId - The app the contract is deployed as, or 0 when creating it
 * @param message - The text of the error, which includes the pc and app id
 * @param approvalProgram - The deployed approval program. Needed for the
 * "cblocks" pcOffsetMethod when the contract has template variables, because
 * the ARC56 byteCode is then a placeholder whose constant blocks can differ in
 * length from the deployed ones.
 */
export function parseLogicError(
  arc56: ARC56Contract,
  appId: bigint,
  message: string,
  cause?: unknown,
  approvalProgram?: Uint8Array,
): Error | undefined {
  const txId =
    message.match(/(?:transaction\s+)(\S+?)(?=:|\s)/)?.[1] ??
    message.match(/(?<=transaction\s+)\S+(?=:)/)?.[0];

  const appIdStr =
    message.match(/(?:app=)(\d+)/)?.[1] ??
    message.match(/(?:application\s+\((\d+)\))/)?.[1];
  const errAppId = appIdStr !== undefined ? BigInt(appIdStr) : undefined;

  const pcStr = message.match(/(?:pc=)(\d+)/)?.[1];
  const pc = pcStr !== undefined ? Number(pcStr) : undefined;

  if (appId !== 0n && errAppId !== undefined && errAppId !== appId) {
    return undefined;
  }

  if (pc === undefined || !arc56.sourceInfo) return undefined;

  let errorMessage: string | undefined;
  if (Array.isArray(arc56.sourceInfo)) {
    errorMessage = arc56.sourceInfo.find((s) =>
      s.pc.includes(pc),
    )?.errorMessage;
  } else {
    const approvalInfo = arc56.sourceInfo.approval;
    let targetPc = pc;
    if (approvalInfo.pcOffsetMethod === "cblocks") {
      const program = approvalProgram ?? deployedByteCode(arc56);
      // Without the deployed program the offset is unknown, and guessing it
      // could map the error to the message of another op
      if (!program) return undefined;
      // ARC56 is ambiguous about the base of "cblocks" pcs. puya (and the
      // pcOffsetMethod description) count from the first op after the
      // constant blocks, but TEALScript counts from the last byte of the
      // constant blocks, one before it.
      const firstOpPc = getConstantBlockOffset(program);
      const base = isTEALScriptProgram(program, firstOpPc)
        ? firstOpPc - 1
        : firstOpPc;
      targetPc = pc - base;
    }
    errorMessage = approvalInfo.sourceInfo.find((s) =>
      s.pc.includes(targetPc),
    )?.errorMessage;
  }

  if (!errorMessage) return undefined;

  return Error(
    `Runtime error when executing ${arc56.name} (appId: ${errAppId ?? appId}) in transaction ${txId}: ${errorMessage}`,
    { cause },
  );
}
