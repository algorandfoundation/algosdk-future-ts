import { describe, expect, it } from "vitest";
import algosdk from "algosdk";
import {
  TransactionComposer,
  type ComposerSender,
  type TransactionArgParams,
} from "../src/composer";
import type { ARC56Contract } from "../src/types/arc56";
import arc56Json from "../../../fixtures/ARC56Test.arc56.json";

const suggestedParams: algosdk.SuggestedParams = {
  fee: 0n,
  minFee: 1_000n,
  firstValid: 1n,
  lastValid: 1_000n,
  genesisHash: new Uint8Array(32),
};

// Each transaction uses one minimum fee's worth of group usage
const algod = {
  getTransactionParams: () => ({
    do: () => Promise.resolve(suggestedParams),
  }),
  simulateTransactions: (request: algosdk.modelsv2.SimulateRequest) => ({
    do: () => {
      const txns = request.txnGroups[0]?.txns ?? [];
      return Promise.resolve(
        new algosdk.modelsv2.SimulateResponse({
          version: 2,
          lastRound: 1n,
          txnGroups: [
            new algosdk.modelsv2.SimulateTransactionGroupResult({
              txnResults: [],
              groupUsage: BigInt(txns.length) * 1_000_000n,
              groupFeesPaid: txns.reduce((sum, t) => sum + t.txn.fee, 0n),
            }),
          ],
        }),
      );
    },
  }),
} as unknown as algosdk.Algodv2;

const arc56WithPay: ARC56Contract = {
  ...(arc56Json as unknown as ARC56Contract),
  methods: [
    {
      name: "deposit",
      args: [{ name: "payment", type: "pay" }],
      returns: { type: "void" },
      actions: { create: [], call: ["NoOp"] },
    },
  ],
};

function setup() {
  const account = algosdk.generateAccount();
  const sender = {
    address: account.addr,
    txnSigner: algosdk.makeBasicAccountTransactionSigner(account),
  };
  const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: sender.address,
    receiver: sender.address,
    amount: 100_000n,
    suggestedParams: { ...suggestedParams, fee: 0n, flatFee: true },
  });
  const composer = new TransactionComposer({
    getSuggestedParams: () => Promise.resolve(suggestedParams),
  });
  return { sender, payment, composer };
}

describe("TransactionComposer transaction method arguments", () => {
  const operations: {
    type: TransactionArgParams["type"];
    abiType: string;
    params: (sender: ComposerSender) => TransactionArgParams;
  }[] = [
    {
      type: "pay",
      abiType: "pay",
      params: (sender) => ({
        type: "pay",
        sender,
        receiver: sender.address,
        amount: 0n,
      }),
    },
    {
      type: "assetTransfer",
      abiType: "axfer",
      params: (sender) => ({
        type: "assetTransfer",
        sender,
        receiver: sender.address,
        assetIndex: 1n,
        amount: 0n,
      }),
    },
    {
      type: "assetFreeze",
      abiType: "afrz",
      params: (sender) => ({
        type: "assetFreeze",
        sender,
        assetIndex: 1n,
        freezeTarget: sender.address,
        frozen: true,
      }),
    },
    {
      type: "keyReg",
      abiType: "keyreg",
      params: (sender) => ({ type: "keyReg", sender, nonParticipation: true }),
    },
    {
      type: "assetCreate",
      abiType: "acfg",
      params: (sender) => ({
        type: "assetCreate",
        sender,
        total: 1n,
        decimals: 0,
        defaultFrozen: false,
      }),
    },
    {
      type: "assetConfig",
      abiType: "acfg",
      params: (sender) => ({
        type: "assetConfig",
        sender,
        assetIndex: 1n,
        manager: sender.address,
        strictEmptyAddressChecking: false,
      }),
    },
    {
      type: "assetDestroy",
      abiType: "acfg",
      params: (sender) => ({ type: "assetDestroy", sender, assetIndex: 1n }),
    },
    {
      type: "appCreate",
      abiType: "appl",
      params: (sender) => ({
        type: "appCreate",
        sender,
        approvalProgram: new Uint8Array([1]),
        clearProgram: new Uint8Array([1]),
        numGlobalInts: 0,
        numGlobalByteSlices: 0,
        numLocalInts: 0,
        numLocalByteSlices: 0,
      }),
    },
    {
      type: "appCall",
      abiType: "appl",
      params: (sender) => ({ type: "appCall", sender, appID: 2n }),
    },
  ];

  it.each(operations)(
    "should build $type via add() and both method APIs",
    async ({ params, abiType }) => {
      const { sender, composer } = setup();
      const arg = params(sender);
      const direct = await composer.add(arg).buildGroupOffline();
      for (const arc56 of [
        undefined,
        {
          ...arc56WithPay,
          methods: [
            {
              name: "deposit",
              returns: { type: "void" },
              actions: { create: [], call: ["NoOp"] },
              args: [{ name: "transaction", type: abiType }],
            },
          ],
        } satisfies ARC56Contract,
      ]) {
        const methodGroup = await setup()
          .composer.addMethodCall({
            arc56,
            appID: 1n,
            sender,
            method: algosdk.ABIMethod.fromSignature(`deposit(${abiType})void`),
            methodArgs: [arg],
          })
          .buildGroupOffline();
        expect(methodGroup).toHaveLength(2);
        const builtArg = methodGroup[0];
        if (!builtArg) throw Error("Missing transaction argument");
        builtArg.txn.group = undefined;
        expect(builtArg.txn.toByte()).toEqual(direct[0]?.txn.toByte());
        expect(methodGroup[0]?.signer).toBe(sender.txnSigner);
      }
    },
  );

  it("should accept method and pre-built transaction discriminators in add()", async () => {
    const { sender, payment, composer } = setup();
    const group = await composer
      .add({ type: "txn", txn: payment, signer: sender.txnSigner })
      .add({
        type: "method",
        sender,
        appID: 1n,
        method: algosdk.ABIMethod.fromSignature("deposit()void"),
      })
      .buildGroup(algod);
    expect(group.map((t) => t.txn.fee)).toEqual([0n, 2_000n]);
  });

  it("should reject legacy keyed objects in add()", () => {
    const { sender, composer } = setup();
    expect(() =>
      // @ts-expect-error add() requires a type discriminator
      composer.add({ pay: { sender, receiver: sender.address, amount: 0n } }),
    ).toThrow("type discriminator");
  });

  it.each([{ pay: {} }, { type: "unknown" }, { type: "method" }])(
    "should reject unsupported transaction argument params: %j",
    async (arg) => {
      const { sender, composer } = setup();
      await expect(
        composer
          .addMethodCall({
            arc56: arc56WithPay,
            appID: 1n,
            sender,
            method: "deposit",
            methodArgs: [arg],
          })
          .buildGroupOffline(),
      ).rejects.toThrow("type discriminator");
    },
  );

  it("should keep the fee of a pre-built argument to an ARC56 method", async () => {
    const { sender, payment, composer } = setup();
    const txns = await composer
      .addMethodCall({
        arc56: arc56WithPay,
        appID: 1n,
        method: "deposit",
        sender,
        methodArgs: [{ txn: payment, signer: sender.txnSigner }],
      })
      .buildGroup(algod);

    expect(txns.map((t) => t.txn.fee)).toEqual([0n, 2_000n]);
    expect(payment.fee).toBe(0n);
  });

  it("should keep the fee of a pre-built argument to an ABIMethod", async () => {
    const { sender, payment, composer } = setup();
    const txns = await composer
      .addMethodCall({
        appID: 1n,
        method: algosdk.ABIMethod.fromSignature("deposit(pay)void"),
        sender,
        methodArgs: [{ txn: payment, signer: sender.txnSigner }],
      })
      .buildGroup(algod);

    expect(txns.map((t) => t.txn.fee)).toEqual([0n, 2_000n]);
    expect(payment.fee).toBe(0n);
  });

  it("should build an argument to an ABIMethod from params", async () => {
    const { sender, composer } = setup();
    const txns = await composer
      .addMethodCall({
        appID: 1n,
        method: algosdk.ABIMethod.fromSignature("deposit(axfer)void"),
        sender,
        methodArgs: [
          {
            type: "assetTransfer",
            sender,
            receiver: sender.address,
            assetIndex: 1n,
            amount: 5n,
          },
        ],
      })
      .buildGroupOffline();

    expect(txns).toHaveLength(2);
    expect(txns[0]?.txn.assetTransfer?.amount).toBe(5n);
    expect(txns[0]?.signer).toBe(sender.txnSigner);
  });

  it("should build discriminated params for a txn argument", async () => {
    const { sender, composer } = setup();
    const txns = await composer
      .addMethodCall({
        appID: 1n,
        method: algosdk.ABIMethod.fromSignature("deposit(txn)void"),
        sender,
        methodArgs: [{ type: "appCall", sender, appID: 2n }],
      })
      .buildGroupOffline();

    expect(txns[0]?.txn.applicationCall?.appIndex).toBe(2n);
  });

  it("should reject params of the wrong transaction type", async () => {
    const { sender, composer } = setup();
    await expect(
      composer
        .addMethodCall({
          appID: 1n,
          method: algosdk.ABIMethod.fromSignature("deposit(acfg)void"),
          sender,
          methodArgs: [{ type: "appCall", sender, appID: 2n }],
        })
        .buildGroupOffline(),
    ).rejects.toThrow(
      'Params for appCall build a "appl" transaction, but the method argument is "acfg"',
    );
  });

  it("should reject params without a discriminator", async () => {
    const { sender, composer } = setup();
    await expect(
      composer
        .addMethodCall({
          arc56: arc56WithPay,
          appID: 1n,
          method: "deposit",
          sender,
          methodArgs: [{ sender, receiver: sender.address, amount: 0n }],
        })
        .buildGroupOffline(),
    ).rejects.toThrow('Unsupported value for "pay" method argument');
  });

  it("should apply fee params of an argument built from params", async () => {
    const { sender, composer } = setup();
    const txns = await composer
      .addMethodCall({
        arc56: arc56WithPay,
        appID: 1n,
        method: "deposit",
        sender,
        methodArgs: [
          {
            type: "pay",
            sender,
            receiver: sender.address,
            amount: 0n,
            feePercent: 1,
          },
        ],
        feePercent: 0,
      })
      .buildGroup(algod);

    expect(txns.map((t) => t.txn.fee)).toEqual([2_000n, 0n]);
  });

  it("should reject conflicting fee params on an argument", async () => {
    const { sender, composer } = setup();
    await expect(
      composer
        .addMethodCall({
          appID: 1n,
          method: algosdk.ABIMethod.fromSignature("deposit(keyreg)void"),
          sender,
          methodArgs: [
            { type: "keyReg", sender, staticFee: 0n, feePercent: 1 },
          ],
        })
        .buildGroupOffline(),
    ).rejects.toThrow(
      "staticFee, staticUsage and feePercent are mutually exclusive",
    );
  });
});
