import { describe, it, expect, beforeAll } from "vitest";
import algosdk from "algosdk";
import { Localnet } from "@algosdk/localnet";
import { ARC56AppClient } from "@algosdk/app-client";
import { loadContract } from "../../../fixtures/arc56-test";
import { TransactionComposer } from "../src/composer";
import { populateAppCallResources } from "../src/resource_population";

const arc56 = loadContract("ResourcePopulation");
const enc = (s: string) => new TextEncoder().encode(s);

describe("App call resource population", () => {
  const localnet = new Localnet();
  let sender: algosdk.AddressWithTransactionSigner;
  let appId: bigint;
  let otherAppId: bigint;
  let assetId: bigint;
  const otherAccount = algosdk.generateAccount().addr;

  async function createApp() {
    const { appId } = await ARC56AppClient.bareCreate({
      arc56,
      algod: localnet.algod,
      sender,
    });
    return appId;
  }

  beforeAll(async () => {
    sender = await localnet.dispenser();
    appId = await createApp();
    otherAppId = await createApp();

    const created = await localnet
      .composer()
      .addAssetCreate({ sender, total: 1n, decimals: 0 })
      .execute(localnet.algod);
    const info = await localnet.algod
      .pendingTransactionInformation(created.txIDs[0] ?? "")
      .do();
    if (info.assetIndex === undefined) throw Error("Asset not created");
    assetId = info.assetIndex;

    // Box MBR
    await localnet.fundAccount(
      algosdk.getApplicationAddress(appId),
      1_000_000n,
    );
  });

  const cases: Array<[string, string, () => unknown[]]> = [
    ["account", "account", () => [otherAccount.toString()]],
    ["app", "app", () => [otherAppId]],
    ["asset", "asset", () => [assetId]],
    ["box", "box", () => [enc("someBox")]],
    ["asset holding", "holding", () => [otherAccount.toString(), assetId]],
    ["app local", "local", () => [otherAccount.toString(), otherAppId]],
  ];

  for (const [name, method, methodArgs] of cases) {
    it(`populates an unreferenced ${name}`, async () => {
      const result = await localnet
        .composer()
        .addMethodCall({
          arc56,
          sender,
          appID: appId,
          method,
          methodArgs: methodArgs(),
        })
        .execute(localnet.algod);
      expect(result.txIDs.length).toBe(1);
    });

    it(`fails on an unreferenced ${name} when population is disabled`, async () => {
      const composer = new TransactionComposer({
        getSuggestedParams: () => localnet.algod.getTransactionParams().do(),
        populateAppCallResources: false,
      });
      composer.addMethodCall({
        arc56,
        sender,
        appID: appId,
        method,
        methodArgs: methodArgs(),
      });
      const error = await composer.execute(localnet.algod).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /unavailable|invalid Box reference/,
      );
    });
  }

  it("places resources across the group's app calls", async () => {
    const txns = await localnet
      .composer()
      .addMethodCall({
        arc56,
        sender,
        appID: appId,
        method: "box",
        methodArgs: [enc("a")],
      })
      .addMethodCall({
        arc56,
        sender,
        appID: appId,
        method: "holding",
        methodArgs: [otherAccount.toString(), assetId],
      })
      .buildGroup(localnet.algod);

    const refs = txns.map((t) => t.txn.applicationCall);
    const boxes = refs.flatMap((r) => r?.boxes ?? []);
    expect(boxes.map((b) => new TextDecoder().decode(b.name))).toEqual(["a"]);
    const accounts = refs.flatMap((r) => r?.accounts ?? []);
    expect(accounts.map((a) => a.toString())).toEqual([
      otherAccount.toString(),
    ]);
    const assets = refs.flatMap((r) => r?.foreignAssets ?? []);
    expect(assets).toEqual([assetId]);
    // The holding's account and asset must share a transaction
    const holdingTxn = refs.find((r) => r?.foreignAssets.includes(assetId));
    expect(holdingTxn?.accounts.map((a) => a.toString())).toEqual([
      otherAccount.toString(),
    ]);
  });

  it("returns populated resources via simulate", async () => {
    const { simulateResponse } = await localnet
      .composer()
      .addMethodCall({
        arc56,
        sender,
        appID: appId,
        method: "app",
        methodArgs: [otherAppId],
      })
      .simulate(localnet.algod);
    const group = simulateResponse.txnGroups[0];
    expect(group?.failureMessage).toBeUndefined();
    expect(group?.unnamedResourcesAccessed).toBeUndefined();
  });
});

describe("populateAppCallResources", () => {
  const sender = algosdk.generateAccount().addr;
  const suggestedParams: algosdk.SuggestedParams = {
    fee: 0n,
    minFee: 1_000n,
    firstValid: 1n,
    lastValid: 1_000n,
    genesisHash: new Uint8Array(32),
    flatFee: true,
  };
  const appCall = (opts?: Partial<{ accounts: algosdk.Address[] }>) =>
    algosdk.makeApplicationNoOpTxnFromObject({
      sender,
      appIndex: 1n,
      suggestedParams,
      accounts: opts?.accounts,
    });
  const groupResult = (
    unnamedResourcesAccessed: algosdk.modelsv2.SimulateUnnamedResourcesAccessed,
    txnCount: number,
  ) =>
    new algosdk.modelsv2.SimulateTransactionGroupResult({
      txnResults: Array.from(
        { length: txnCount },
        () =>
          new algosdk.modelsv2.SimulateTransactionResult({
            txnResult: new algosdk.modelsv2.PendingTransactionResponse({
              txn: new algosdk.SignedTransaction({ txn: appCall() }),
              poolError: "",
            }),
          }),
      ),
      unnamedResourcesAccessed,
    });

  it("spills into the next app call once one is full", () => {
    const accounts = Array.from(
      { length: 9 },
      () => algosdk.generateAccount().addr,
    );
    const txns = [appCall(), appCall()];
    populateAppCallResources(
      txns,
      groupResult(
        new algosdk.modelsv2.SimulateUnnamedResourcesAccessed({ accounts }),
        2,
      ),
    );
    expect(txns[0]?.applicationCall?.accounts.length).toBe(8);
    expect(txns[1]?.applicationCall?.accounts.length).toBe(1);
  });

  it("throws when the group has no room left", () => {
    const accounts = Array.from(
      { length: 9 },
      () => algosdk.generateAccount().addr,
    );
    expect(() =>
      populateAppCallResources(
        [appCall()],
        groupResult(
          new algosdk.modelsv2.SimulateUnnamedResourcesAccessed({ accounts }),
          1,
        ),
      ),
    ).toThrow("No more transactions below reference limit");
  });

  it("adds an app local's app to a transaction that already has the account", () => {
    const account = algosdk.generateAccount().addr;
    const txns = [appCall(), appCall({ accounts: [account] })];
    populateAppCallResources(
      txns,
      groupResult(
        new algosdk.modelsv2.SimulateUnnamedResourcesAccessed({
          appLocals: [
            new algosdk.modelsv2.ApplicationLocalReference({
              account,
              app: 5n,
            }),
          ],
          accounts: [account],
          apps: [5n],
        }),
        2,
      ),
    );
    expect(txns[0]?.applicationCall?.foreignApps).toEqual([]);
    expect(txns[1]?.applicationCall?.foreignApps).toEqual([5n]);
    // The account was already referenced, so it is not added again
    expect(txns[1]?.applicationCall?.accounts.length).toBe(1);
  });

  it("adds extra box refs as empty references to the called app", () => {
    const txns = [appCall()];
    populateAppCallResources(
      txns,
      groupResult(
        new algosdk.modelsv2.SimulateUnnamedResourcesAccessed({
          extraBoxRefs: 2,
        }),
        1,
      ),
    );
    expect(txns[0]?.applicationCall?.boxes).toEqual([
      { appIndex: 0n, name: new Uint8Array(0) },
      { appIndex: 0n, name: new Uint8Array(0) },
    ]);
    expect(txns[0]?.applicationCall?.foreignApps).toEqual([]);
  });
});
