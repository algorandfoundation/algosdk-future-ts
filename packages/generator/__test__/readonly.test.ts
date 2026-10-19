import { describe, it, expect, beforeAll, vi } from "vitest";
import algosdk from "algosdk";
import ts from "typescript";
import * as path from "path";
import { Localnet } from "@algosdk/localnet";
import { ARC56AppClient } from "@algosdk/app-client";
import { ARC56Generator } from "../src/generator";
import { loadContract } from "../../../fixtures/arc56-test";
import { getConstantBlockOffset } from "@algosdk/transaction-composer";
import type {
  MethodParams,
  ARC56Contract,
} from "@algosdk/transaction-composer";

const readonlyContract = loadContract("Readonly");
const byteCode = readonlyContract.byteCode;
if (!byteCode) throw new Error("missing compiler bytecode");
const constantBlockOffset = getConstantBlockOffset(
  algosdk.base64ToBytes(byteCode.approval),
);

describe("readonly methods", () => {
  const localnet = new Localnet();
  let dispenser: algosdk.AddressWithTransactionSigner;
  /** pc of the assert in mustBePositive */
  let assertPc: number;

  /** The contract, with the assert's error message in the given format */
  const contract = (
    sourceInfo: "compiler" | "array" | "cblocks" | "none" = "compiler",
  ): ARC56Contract => ({
    ...readonlyContract,
    ...(sourceInfo === "array"
      ? {
          sourceInfo: [{ pc: [assertPc], errorMessage: "n must be positive" }],
        }
      : sourceInfo === "cblocks"
        ? {
            sourceInfo: {
              approval: {
                // A synthetic metadata variant exercises the cblocks format
                // against real compiler output without hard-coded offsets.
                pcOffsetMethod: "cblocks",
                sourceInfo: [
                  {
                    pc: [assertPc - constantBlockOffset],
                    errorMessage: "n must be positive",
                  },
                ],
              },
              clear: { pcOffsetMethod: "none", sourceInfo: [] },
            },
          }
        : sourceInfo === "none"
          ? { sourceInfo: undefined }
          : {}),
  });

  const create = async (
    sourceInfo: "compiler" | "array" | "cblocks" | "none" = "compiler",
  ) =>
    (
      await ARC56AppClient.bareCreate({
        arc56: contract(sourceInfo),
        algod: localnet.algod,
        sender: dispenser,
      })
    ).appClient;

  const generateClient = async () => {
    const clientPath = path.join(
      __dirname,
      "generated",
      "ReadonlyTestClient.ts",
    );
    await new ARC56Generator(contract()).generateToFile(clientPath);
    return (await import(clientPath)) as {
      ReadonlyClient: new (p: {
        appId: bigint;
        algod: algosdk.Algodv2;
      }) => GeneratedClient;
    };
  };

  type GeneratedClient = ARC56AppClient & {
    call: Record<
      "getPoint" | "getSeven" | "write",
      (params: unknown) => Promise<{
        returnValue: unknown;
        result: { simulateResponse?: algosdk.modelsv2.SimulateResponse };
      }>
    >;
    params: { getPoint: (params: unknown) => MethodParams };
  };

  beforeAll(async () => {
    dispenser = await localnet.dispenser();
    const info = readonlyContract.sourceInfo;
    if (!info || Array.isArray(info))
      throw Error("missing compiler source info");
    expect(info.approval.pcOffsetMethod).toBe("none");
    const pc = info.approval.sourceInfo.find(
      (entry) => entry.errorMessage === "n must be positive",
    )?.pc[0];
    if (pc === undefined) throw Error("assert pc not found");
    assertPc = pc;
  });

  it("generates simulate-backed call entries only for readonly methods", async () => {
    const code = await new ARC56Generator(contract()).generate();
    const callBody = code.split("call = {")[1]?.split("\n  };")[0] ?? "";
    for (const name of [
      "getPoint",
      "mustBePositive",
      "callOther",
      "getSeven",
    ]) {
      expect(callBody).toContain(
        `this.simulateMethodCall({\n        method: "${name}",`,
      );
    }
    expect(callBody).toContain('this.methodCall({\n        method: "write",');
    expect(callBody).toContain(
      'Promise<{\n      result: MethodSimulationResult;\n      returnValue: ReadonlyReturnTypes["getPoint"];',
    );
    expect(callBody).toContain(
      'Promise<{\n      result: MethodExecutionResult;\n      returnValue: ReadonlyReturnTypes["write"];',
    );

    // params are generated the same way for readonly methods
    const paramsBody = code.split("params = {")[1]?.split("\n  };")[0] ?? "";
    expect(paramsBody).toContain(
      'getPoint: (\n      methodParams: TypedMethodParams<{ x: uint64 }>,\n    ): MethodParams<ReadonlyReturnTypes["getPoint"]> => {',
    );

    // The generated client and its return types type check
    const usage = `
declare const client: ReadonlyClient;
const sender = { address: algosdk.Address.zeroAddress(), txnSigner: algosdk.makeEmptyTransactionSigner() };
async function usage() {
  const { returnValue, result } = await client.call.getPoint({
    sender,
    args: { x: 1n },
    staticFee: 2000n,
  });
  const point: Point = returnValue;
  const response: algosdk.modelsv2.SimulateResponse = result.simulateResponse;
  const n: bigint = (await client.call.mustBePositive({ sender, args: { n: 1n } })).returnValue;
  const seven: bigint = (await client.call.getSeven({ sender })).returnValue;
  // @ts-expect-error simulated methods require a sender
  await client.call.getSeven();
  const round: bigint = (await client.call.write({ sender })).result.confirmedRound;
  // @ts-expect-error execute results are not returned for readonly methods
  result.confirmedRound;
  return [point, response, n, seven, round];
}
`;
    expect(typeCheck(code + usage)).toEqual([]);
  });

  it("simulates a readonly method returning a struct without signing or sending", async () => {
    const appClient = await create();
    const { ReadonlyClient } = await generateClient();
    const client = new ReadonlyClient({
      appId: appClient.appId,
      algod: localnet.algod,
    });

    let signed = 0;
    const sender = {
      address: dispenser.address,
      txnSigner: (...args: Parameters<algosdk.TransactionSigner>) => {
        signed++;
        return dispenser.txnSigner(...args);
      },
    };
    const send = vi.spyOn(localnet.algod, "sendRawTransaction");
    try {
      const { returnValue, result } = await client.call.getPoint({
        sender,
        args: { x: 21n },
      });
      expect(returnValue).toEqual({ x: 21n, y: 42n });
      expect(result.simulateResponse?.txnGroups[0]?.failureMessage).toBe(
        undefined,
      );
      expect(signed).toBe(0);
      expect(send).not.toHaveBeenCalled();

      // Including readonly methods with no args
      expect((await client.call.getSeven({ sender })).returnValue).toBe(7n);
      expect(signed).toBe(0);
      expect(send).not.toHaveBeenCalled();

      // A non-readonly method is still sent
      await client.call.write({ sender });
      expect(signed).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
  });

  it("throws the ARC56 error message when a readonly method fails an assert", async () => {
    for (const sourceInfo of ["compiler", "array", "cblocks"] as const) {
      const appClient = await create(sourceInfo);

      const { returnValue } = await appClient.simulateMethodCall({
        method: "mustBePositive",
        sender: dispenser,
        methodArgs: [3n],
      });
      expect(returnValue).toBe(3n);

      const error = await appClient
        .simulateMethodCall({
          method: "mustBePositive",
          sender: dispenser,
          methodArgs: [0n],
        })
        .catch((e: unknown) => e as Error);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        `Runtime error when executing Readonly (appId: ${appClient.appId})`,
      );
      expect((error as Error).message).toContain("n must be positive");

      // Executing reports the same error
      await expect(
        appClient.methodCall({
          method: "mustBePositive",
          sender: dispenser,
          methodArgs: [0n],
        }),
      ).rejects.toThrow("n must be positive");
    }
  });

  it("throws the simulate failure message when there is no ARC56 error message", async () => {
    const appClient = await create("none");
    const error = await appClient
      .simulateMethodCall({
        method: "mustBePositive",
        sender: dispenser,
        methodArgs: [0n],
      })
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("assert failed");
    expect((error as Error).message).toContain(`pc=${assertPc}`);
    expect((error as Error).cause).toBeInstanceOf(
      algosdk.modelsv2.SimulateResponse,
    );
  });

  it("covers the fee of a readonly method's inner app call", async () => {
    const appClient = await create();
    const other = await create();

    // The app pays its inner call's fee from the outer call's fee
    const { returnValue, result } = await appClient.simulateMethodCall({
      method: "callOther",
      sender: dispenser,
      methodArgs: [other.appId],
    });
    expect(returnValue).toBe(14n);
    const txn = result.simulateResponse.txnGroups[0]?.txnResults[0];
    expect(txn?.txnResult.txn.txn.fee).toBeGreaterThanOrEqual(2000n);

    // Fee overrides still apply
    await expect(
      appClient.simulateMethodCall({
        method: "callOther",
        sender: dispenser,
        methodArgs: [other.appId],
        staticFee: 1000n,
      }),
    ).rejects.toThrow(/group fee .* too small/);
  });

  it("leaves params unchanged so readonly methods can be composed", async () => {
    const appClient = await create();
    const { ReadonlyClient } = await generateClient();
    const client = new ReadonlyClient({
      appId: appClient.appId,
      algod: localnet.algod,
    });

    const result = await localnet
      .composer()
      .addMethodCall(
        client.params.getPoint({ sender: dispenser, args: { x: 2n } }),
      )
      .execute(localnet.algod);
    expect(result.methodResults[0].returnValue).toEqual({ x: 2n, y: 4n });
  });
});

function typeCheck(code: string): string[] {
  const filename = path.join(
    import.meta.dirname,
    "generated",
    "ReadonlyCheck.ts",
  );
  const config = ts.readConfigFile(
    `${import.meta.dirname}/../tsconfig.json`,
    (file) => ts.sys.readFile(file),
  );
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    `${import.meta.dirname}/..`,
  );
  const host = ts.createCompilerHost(parsed.options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    file,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    file === filename
      ? ts.createSourceFile(file, code, languageVersion, true)
      : getSourceFile(
          file,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
  const program = ts.createProgram([filename], parsed.options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
