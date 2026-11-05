import { describe, expect, it } from "vitest";
import algosdk from "algosdk";
import { TransactionComposer } from "../src/composer";
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

  it("should build keyed params for a txn argument", async () => {
    const { sender, composer } = setup();
    const txns = await composer
      .addMethodCall({
        appID: 1n,
        method: algosdk.ABIMethod.fromSignature("deposit(txn)void"),
        sender,
        methodArgs: [{ appCall: { sender, appID: 2n } }],
      })
      .buildGroupOffline();

    expect(txns[0]?.txn.applicationCall?.appIndex).toBe(2n);
  });

  it("should reject keyed params of the wrong transaction type", async () => {
    const { sender, composer } = setup();
    await expect(
      composer
        .addMethodCall({
          appID: 1n,
          method: algosdk.ABIMethod.fromSignature("deposit(acfg)void"),
          sender,
          methodArgs: [{ appCall: { sender, appID: 2n } }],
        })
        .buildGroupOffline(),
    ).rejects.toThrow(
      'Params for appCall build a "appl" transaction, but the method argument is "acfg"',
    );
  });

  it("should reject bare params for a type that does not identify one kind", async () => {
    const { sender, composer } = setup();
    await expect(
      composer
        .addMethodCall({
          appID: 1n,
          method: algosdk.ABIMethod.fromSignature("deposit(acfg)void"),
          sender,
          methodArgs: [
            // @ts-expect-error acfg params must be keyed by kind
            { sender, total: 1n, decimals: 0, defaultFrozen: false },
          ],
        })
        .buildGroupOffline(),
    ).rejects.toThrow('Unsupported value for "acfg" method argument');
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
          { sender, receiver: sender.address, amount: 0n, feePercent: 1 },
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
          methodArgs: [{ keyReg: { sender, staticFee: 0n, feePercent: 1 } }],
        })
        .buildGroupOffline(),
    ).rejects.toThrow(
      "staticFee, staticUsage and feePercent are mutually exclusive",
    );
  });
});
