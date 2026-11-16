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

export type StructDef = StructFields | StructField["type"];

/**
 * The name and type of each field of a struct definition. A field array is
 * listed in declaration order; a legacy struct map in its own key order.
 */
function structEntries(structFields: StructDef): [string, StructDef][] {
  if (Array.isArray(structFields)) {
    return structFields.map((field) => [field.name, field.type]);
  }
  return typeof structFields === "object" ? Object.entries(structFields) : [];
}

/** The fields of a struct type, whether defined inline or by name */
function getStructDef(
  arc56: ARC56Contract,
  type: StructDef,
): StructDef | undefined {
  // An inline struct definition
  if (typeof type !== "string") return type;
  return arc56.structs?.[type];
}

export function getABITypeFromStructFields(
  arc56: ARC56Contract,
  structFields: StructDef,
): string {
  // Join rather than reformatting a JSON array, so that the square brackets of
  // a sized element type such as `byte[96]` survive
  const types = structEntries(structFields).map(([, type]) =>
    getABIType(arc56, type),
  );
  return `(${types.join(",")})`;
}

export function getABIType(arc56: ARC56Contract, type: StructDef): string {
  const struct = getStructDef(arc56, type);
  return struct ? getABITypeFromStructFields(arc56, struct) : (type as string);
}

export function getABIValuesFromStructFieldsAndObject(
  arc56: ARC56Contract,
  structFields: StructDef,
  obj: unknown,
): algosdk.ABIValue[] {
  return structEntries(structFields).map(([key, type]) =>
    getABIValue(arc56, type, isRecord(obj) ? obj[key] : undefined),
  );
}

/**
 * Turn an argument object into the ABI value to encode. Only names listed in
 * `arc56.structs` are treated as structs, so a native AVM type such as
 * `AVMString` or `bytes` passes through untouched (as it could only be
 * mistaken for a struct if the contract defined one under that name).
 */
export function getABIValue(
  arc56: ARC56Contract,
  type: StructDef,
  value: unknown,
): algosdk.ABIValue {
  const struct = getStructDef(arc56, type);
  return struct && isRecord(value)
    ? getABIValuesFromStructFieldsAndObject(arc56, struct, value)
    : (value as algosdk.ABIValue);
}

export function getObjectFromStructFieldsAndArray(
  arc56: ARC56Contract,
  structFields: StructDef,
  valuesArray: unknown[],
): Record<string, unknown> {
  return Object.fromEntries(
    structEntries(structFields).map(([key, type], i) => {
      const struct = getStructDef(arc56, type);
      const val = valuesArray[i];
      return [
        key,
        struct
          ? getObjectFromStructFieldsAndArray(
              arc56,
              struct,
              Array.isArray(val) ? val : [],
            )
          : val,
      ];
    }),
  );
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

export function getTypeScriptValue(
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

  const struct = arc56.structs?.[type];
  if (struct) {
    return getObjectFromStructFieldsAndArray(
      arc56,
      struct,
      Array.isArray(abiValue) ? abiValue : [abiValue],
    );
  }

  return abiValue;
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
  return getTypeScriptValue(
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
        type: getABIType(
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
      // An int, or a byte string's length followed by its bytes
      let value: number;
      [value, pc] = readUvarint(program, pc);
      if (isBytecblock) pc += value;
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
  const txId = message.match(/transaction\s+(\S+?)(?=:|\s)/)?.[1];

  const appIdStr =
    message.match(/app=(\d+)/)?.[1] ??
    message.match(/application\s+\((\d+)\)/)?.[1];
  const errAppId = appIdStr !== undefined ? BigInt(appIdStr) : undefined;

  const pcStr = message.match(/pc=(\d+)/)?.[1];
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
