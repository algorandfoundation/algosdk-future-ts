import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import ts from "typescript";
import { ARC56Generator } from "../src/generator";
import {
  TransactionComposer,
  type ARC56Contract,
} from "@algosdk/transaction-composer";

const transactionTypes = ["axfer", "afrz", "keyreg", "appl", "acfg", "txn"];
const arc56: ARC56Contract = {
  arcs: [4, 56],
  name: "Transactions",
  structs: {},
  state: {
    schema: { global: { ints: 0, bytes: 0 }, local: { ints: 0, bytes: 0 } },
    keys: { global: {}, local: {}, box: {} },
    maps: { global: {}, local: {}, box: {} },
  },
  bareActions: { create: [], call: [] },
  methods: [...transactionTypes, "pay"].map((type) => ({
    name: `accept_${type}`,
    args: [{ name: "transaction", type }],
    returns: { type: "void" },
    actions: { create: [], call: ["NoOp"] },
  })),
};

describe("generated transaction arguments", () => {
  it.each([...transactionTypes, "pay"])(
    "types %s as a TransactionArg",
    async (type) => {
      const code = await new ARC56Generator(arc56).generate();
      expect(code).toContain(`type ${type} = TransactionArg<"${type}">;`);
    },
  );

  it("accepts signed wrappers and discriminated params, but rejects plain transactions, bare params and mismatched types", async () => {
    const code = await new ARC56Generator(arc56).generate();
    const usage = `
declare const client: TransactionsClient;
declare const sender: algosdk.AddressWithTransactionSigner;
declare const txn: algosdk.Transaction;
declare const signer: algosdk.TransactionSigner;
declare const signed: algosdk.TransactionWithSigner;
declare const payment: PaymentParams;
declare const assetTransfer: AssetTransferParams;
declare const assetFreeze: AssetFreezeParams;
declare const keyReg: KeyRegParams;
declare const assetCreate: AssetCreateParams;
declare const appCall: AppCallParams;
${[...transactionTypes, "pay"]
  .flatMap((type) =>
    ["params", "call"].flatMap((api) => [
      `client.${api}.accept_${type}({ sender, args: { transaction: { txn, signer } } });`,
      `client.${api}.accept_${type}({ sender, args: { transaction: signed } });`,
      `// @ts-expect-error Plain transactions have no signer
client.${api}.accept_${type}({ sender, args: { transaction: txn } });`,
    ]),
  )
  .join("\n")}
${[
  ["pay", "pay", "payment"],
  ["axfer", "assetTransfer", "assetTransfer"],
  ["afrz", "assetFreeze", "assetFreeze"],
  ["keyreg", "keyReg", "keyReg"],
]
  .flatMap(([type, kind, params]) =>
    ["params", "call"].map(
      (api) =>
        `client.${api}.accept_${type}({ sender, args: { transaction: { ...${params}, type: "${kind}" } } });`,
    ),
  )
  .join("\n")}
client.call.accept_acfg({ sender, args: { transaction: { ...assetCreate, type: "assetCreate" } } });
client.call.accept_appl({ sender, args: { transaction: { ...appCall, type: "appCall" } } });
client.call.accept_txn({ sender, args: { transaction: { ...payment, type: "pay" } } });
client.call.accept_txn({ sender, args: { transaction: { ...assetCreate, type: "assetCreate" } } });
// @ts-expect-error Params require a type discriminator
client.call.accept_acfg({ sender, args: { transaction: assetCreate } });
// @ts-expect-error An app call is not an asset config transaction
client.call.accept_acfg({ sender, args: { transaction: { ...appCall, type: "appCall" } } });
// @ts-expect-error An asset transfer is not a payment transaction
client.call.accept_pay({ sender, args: { transaction: { ...assetTransfer, type: "assetTransfer" } } });
// @ts-expect-error Params require a type discriminator even for pay
client.call.accept_pay({ sender, args: { transaction: payment } });
// @ts-expect-error Keyed params are no longer supported
client.call.accept_pay({ sender, args: { transaction: { pay: payment } } });
// @ts-expect-error txn params require a type discriminator
client.call.accept_txn({ sender, args: { transaction: payment } });
`;
    const imports = `
import type {
  AppCallParams,
  AssetCreateParams,
  PaymentParams,
  AssetTransferParams,
  AssetFreezeParams,
  KeyRegParams,
} from "@algosdk/transaction-composer";
`;
    const filename = `${import.meta.dirname}/TransactionsClient.ts`;
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
        ? ts.createSourceFile(
            file,
            code + imports + usage,
            languageVersion,
            true,
          )
        : getSourceFile(
            file,
            languageVersion,
            onError,
            shouldCreateNewSourceFile,
          );
    const program = ts.createProgram([filename], parsed.options, host);
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    ).toEqual([]);
  });

  it.each(transactionTypes)(
    "builds a %s argument offline with its signer",
    async (type) => {
      const account = algosdk.generateAccount();
      const sender = {
        address: account.addr,
        txnSigner: algosdk.makeBasicAccountTransactionSigner(account),
      };
      const suggestedParams: algosdk.SuggestedParams = {
        fee: 1000n,
        minFee: 1000n,
        flatFee: true,
        firstValid: 1n,
        lastValid: 1000n,
        genesisHash: new Uint8Array(32),
        genesisID: "offline",
      };
      const common = { sender: account.addr, suggestedParams };
      const transactions: Record<string, () => algosdk.Transaction> = {
        axfer: () =>
          algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            ...common,
            receiver: account.addr,
            assetIndex: 1,
            amount: 0,
          }),
        afrz: () =>
          algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
            ...common,
            assetIndex: 1,
            freezeTarget: account.addr,
            frozen: true,
          }),
        keyreg: () =>
          algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
            ...common,
            nonParticipation: true,
          }),
        appl: () =>
          algosdk.makeApplicationNoOpTxnFromObject({ ...common, appIndex: 2 }),
        acfg: () =>
          algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
            ...common,
            total: 1,
            decimals: 0,
            defaultFrozen: false,
          }),
        txn: () =>
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            ...common,
            receiver: account.addr,
            amount: 0,
          }),
      };
      const makeTransaction = transactions[type];
      if (!makeTransaction) throw new Error(`Missing transaction for ${type}`);
      const txn = makeTransaction();
      const group = await new TransactionComposer({
        getSuggestedParams: () => Promise.resolve(suggestedParams),
      })
        .addMethodCall({
          arc56,
          appID: 1n,
          method: `accept_${type}`,
          sender,
          methodArgs: [{ txn, signer: sender.txnSigner }],
        })
        .buildGroupOffline();
      expect(group).toHaveLength(2);
      expect(group[0]?.txn).toBe(txn);
      expect(group[0]?.signer).toBe(sender.txnSigner);
      expect(group[1]?.txn.applicationCall?.appArgs[0]).toEqual(
        algosdk.ABIMethod.fromSignature(
          `accept_${type}(${type})void`,
        ).getSelector(),
      );
    },
  );

  it.each([
    [
      "pay",
      (address: algosdk.Address) => ({
        type: "pay",
        receiver: address,
        amount: 0n,
      }),
    ],
    [
      "axfer",
      (address: algosdk.Address) => ({
        type: "assetTransfer",
        receiver: address,
        assetIndex: 1n,
        amount: 0n,
      }),
    ],
    [
      "afrz",
      (address: algosdk.Address) => ({
        type: "assetFreeze",
        assetIndex: 1n,
        freezeTarget: address,
        frozen: true,
      }),
    ],
    ["keyreg", () => ({ type: "keyReg", nonParticipation: true })],
    [
      "acfg",
      () => ({
        type: "assetCreate",
        total: 1n,
        decimals: 0,
        defaultFrozen: false,
      }),
    ],
    ["appl", () => ({ type: "appCall", appID: 2n })],
    [
      "txn",
      (address: algosdk.Address) => ({
        type: "assetTransfer",
        receiver: address,
        assetIndex: 1n,
        amount: 0n,
      }),
    ],
  ] as const)("builds a %s argument from params", async (type, makeParams) => {
    const account = algosdk.generateAccount();
    const sender = {
      address: account.addr,
      txnSigner: algosdk.makeBasicAccountTransactionSigner(account),
    };
    const suggestedParams: algosdk.SuggestedParams = {
      fee: 0n,
      minFee: 1000n,
      firstValid: 1n,
      lastValid: 1000n,
      genesisHash: new Uint8Array(32),
    };
    const params = makeParams(account.addr);
    const arg = { ...params, sender };
    const group = await new TransactionComposer({
      getSuggestedParams: () => Promise.resolve(suggestedParams),
    })
      .addMethodCall({
        arc56,
        appID: 1n,
        method: `accept_${type}`,
        sender,
        methodArgs: [arg],
      })
      .buildGroupOffline();
    expect(group).toHaveLength(2);
    expect(group[0]?.txn.type).toBe(type === "txn" ? "axfer" : type);
    expect(group[0]?.txn.sender.toString()).toBe(account.addr.toString());
    expect(group[0]?.signer).toBe(sender.txnSigner);
  });
});
