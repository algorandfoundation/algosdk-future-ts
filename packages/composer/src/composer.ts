import algosdk, {
  Algodv2,
  AtomicTransactionComposer,
  AtomicTransactionComposerStatus,
  OnApplicationComplete,
  SignedTransaction,
  type AddressWithTransactionSigner,
  type SuggestedParams,
  type TransactionSigner,
} from "algosdk";
import type { ARC56Contract } from "./types/arc56.ts";
import {
  decodeMethodReturnValue,
  encodeMethodArgs,
  getAbiMethod,
} from "./arc56_utils.ts";
import { populateAppCallResources } from "./resource_population.ts";

const USAGE_SCALE = 1_000_000n;
export const BASE_USAGE = 1_000_000n;

// Equivalent to protocol FeeForUsage(usage, minFee, 0): the fee that a given
// amount of usage (groupUsage units) is charged.
const feeForUsage = (usage: bigint, minFee: bigint): bigint =>
  (usage * minFee + USAGE_SCALE - 1n) / USAGE_SCALE;

export type ComposerSender = AddressWithTransactionSigner & {
  emptyTxnSigner?: TransactionSigner;
};

export type ComposerSimulateOptions = Omit<
  ConstructorParameters<typeof algosdk.modelsv2.SimulateRequest>[0],
  "txnGroups"
> & {
  skipSignatures?: boolean;
  /**
   * Throw when the group fails rather than returning the simulate response.
   * Defaults to true.
   */
  throwOnFailure?: boolean;
};

type TxnInfo = {
  feePercent?: number;
  /** Most group usage the transaction may pay for once its fee is adjusted. */
  maxUsage?: bigint;
  /** Transaction covers a fixed amount of group usage (via staticUsage). */
  staticUsage?: bigint;
  /** Transaction has a fixed fee (via staticFee or staticUsage) that is never adjusted. */
  isStatic: boolean;
  sender: ComposerSender;
};

type ParamOverrides = {
  suggestedParams?: SuggestedParams;
  sender: ComposerSender;
  /**
   * Pay exactly this many microAlgos of fee, ignoring the suggested fee.
   * Primarily useful for transactions that should always pay 0 fees.
   * In most other scenarios `feePercent` should be used instead.
   */
  staticFee?: bigint;
  /**
   * Cover this much group usage regardless of the current fee per usage. The
   * fee is derived from the current min fee. Mutually exclusive with staticFee
   * and feePercent.
   */
  staticUsage?: bigint;
  /**
   * The percentage of the total group fee this transaction should cover.
   * In most cases you have one transaction with `feePercent: 1` to cover
   * fees for the whole group. This can be limited with `maxUsage`.
   */
  feePercent?: number;
  /**
   * The most group usage this transaction may pay for once its fee is set by
   * simulate. The cap is derived from the current min fee. If the transaction's
   * share of the group fee is higher, building the group fails. Only takes
   * effect when simulating and cannot be combined with staticFee or
   * staticUsage.
   */
  maxUsage?: bigint;
};

type OverriddenParams = Pick<
  Parameters<typeof algosdk.makePaymentTxnWithSuggestedParamsFromObject>[0],
  "suggestedParams" | "sender"
>;

type Params<SDKMethod extends (...args: never[]) => unknown> = Omit<
  Parameters<SDKMethod>[0],
  "suggestedParams" | "sender" | "signer"
> &
  ParamOverrides;

export type BaseMethodParams = Omit<
  Parameters<typeof AtomicTransactionComposer.prototype.addMethodCall>[0],
  "suggestedParams" | "sender" | "signer" | "method" | "methodArgs"
> &
  ParamOverrides;

export type ARC56MethodParams = BaseMethodParams & {
  arc56: ARC56Contract;
  method: algosdk.ABIMethod | string;
  methodArgs?: unknown[];
};

export type StandardMethodParams = BaseMethodParams & {
  arc56?: undefined;
  method: algosdk.ABIMethod;
  methodArgs?: (algosdk.ABIArgument | TransactionArgs[keyof TransactionArgs])[];
};

declare const methodReturnType: unique symbol;

export type MethodParams<TReturn = unknown> = (
  ARC56MethodParams | StandardMethodParams
) & {
  readonly [methodReturnType]?: TReturn;
};

export type PaymentParams = Params<
  typeof algosdk.makePaymentTxnWithSuggestedParamsFromObject
>;

export type KeyRegParams = Params<
  typeof algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject
>;

export type AssetCreateParams = Params<
  typeof algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject
>;

export type AssetConfigParams = Params<
  typeof algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject
>;

export type AssetDestroyParams = Params<
  typeof algosdk.makeAssetDestroyTxnWithSuggestedParamsFromObject
>;

export type AssetFreezeParams = Params<
  typeof algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject
>;

export type AssetTransferParams = Params<
  typeof algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject
>;

export type AppCreateParams = Omit<
  Params<typeof algosdk.makeApplicationCreateTxnFromObject>,
  "onComplete"
> & {
  /** What application should do once the program has been run. Defaults to NoOp. */
  onComplete?: algosdk.OnApplicationComplete;
};

/**
 * Application ID for app-call transactions. Mirrors the AtomicTransactionComposer's
 * `appID` naming (the makeApplication*TxnFromObject factories call this `appIndex`,
 * but the composer normalizes it for the user).
 */
export type AppCallParams = Omit<
  Params<typeof algosdk.makeApplicationCallTxnFromObject>,
  "appIndex" | "onComplete"
> & {
  /** ID of the application to call */
  appID: number | bigint;
  /** What application should do once the program has been run */
  onComplete?: algosdk.OnApplicationComplete;
};

export type TransactionParams =
  | ({ type: "method" } & MethodParams)
  | ({ type: "pay" } & PaymentParams)
  | ({ type: "appCreate" } & AppCreateParams)
  | ({ type: "appCall" } & AppCallParams)
  | ({ type: "keyReg" } & KeyRegParams)
  | ({ type: "assetCreate" } & AssetCreateParams)
  | ({ type: "assetConfig" } & AssetConfigParams)
  | ({ type: "assetDestroy" } & AssetDestroyParams)
  | ({ type: "assetFreeze" } & AssetFreezeParams)
  | ({ type: "assetTransfer" } & AssetTransferParams)
  | ({ type: "txn" } & algosdk.TransactionWithSigner);

/** Params for a single transaction the composer builds, other than a method call */
export type TransactionArgParams = Exclude<
  TransactionParams,
  { type: "method" | "txn" }
>;

/**
 * What an ABI method accepts for each transaction argument type, other than a
 * pre-built TransactionWithSigner. Params use a `type` discriminator naming
 * the builder operation (e.g. `{ type: "assetCreate", ...params }`).
 */
export type TransactionArgs = {
  pay: Extract<TransactionArgParams, { type: "pay" }>;
  axfer: Extract<TransactionArgParams, { type: "assetTransfer" }>;
  afrz: Extract<TransactionArgParams, { type: "assetFreeze" }>;
  keyreg: Extract<TransactionArgParams, { type: "keyReg" }>;
  acfg: Extract<
    TransactionArgParams,
    { type: "assetCreate" | "assetConfig" | "assetDestroy" }
  >;
  appl: Extract<TransactionArgParams, { type: "appCreate" | "appCall" }>;
  txn: TransactionArgParams;
};

/** A transaction argument of the given ABI type, built or as params */
export type TransactionArg<T extends keyof TransactionArgs> =
  TransactionArgs[T] | algosdk.TransactionWithSigner;

/** The ABI transaction type of the transaction each kind of params builds */
const transactionArgTypes = {
  pay: "pay",
  appCreate: "appl",
  appCall: "appl",
  keyReg: "keyreg",
  assetCreate: "acfg",
  assetConfig: "acfg",
  assetDestroy: "acfg",
  assetFreeze: "afrz",
  assetTransfer: "axfer",
} as const;

/** staticFee, staticUsage and feePercent are mutually exclusive */
function assertMutuallyExclusiveFeeParams(p: ParamOverrides) {
  const defined =
    (p.staticFee !== undefined ? 1 : 0) +
    (p.staticUsage !== undefined ? 1 : 0) +
    (p.feePercent !== undefined ? 1 : 0);
  if (defined > 1) {
    throw Error("staticFee, staticUsage and feePercent are mutually exclusive");
  }
  if (
    p.maxUsage !== undefined &&
    (p.staticFee !== undefined || p.staticUsage !== undefined)
  ) {
    throw Error("maxUsage cannot be combined with staticFee or staticUsage");
  }
}

/** Fee handling info for a transaction the composer builds from params */
function txnInfoOf(p: ParamOverrides): TxnInfo {
  return {
    feePercent: p.feePercent,
    maxUsage: p.maxUsage,
    staticUsage: p.staticUsage,
    isStatic: p.staticFee !== undefined || p.staticUsage !== undefined,
    sender: p.sender,
  };
}

export interface MethodResult<TReturn = unknown> extends Omit<
  algosdk.ABIResult,
  "returnValue"
> {
  returnValue?: TReturn;
}

export type MethodResults<TReturns extends unknown[]> = TReturns extends []
  ? MethodResult[]
  : { [K in keyof TReturns]: MethodResult<TReturns[K]> };

export interface ComposerExecuteResult<TReturns extends unknown[] = unknown[]> {
  confirmedRound: bigint;
  txIDs: string[];
  methodResults: MethodResults<TReturns>;
}

export type ErrorTransformer = (error: Error) => Promise<Error>;

class InvalidErrorTransformerValue extends Error {
  constructor(originalError: Error, value: unknown) {
    super(
      `An error transformer returned a non-error value: ${String(value)}. The original error before any transformation: ${originalError.message}`,
      { cause: originalError },
    );
  }
}

class ErrorTransformerError extends Error {
  constructor(originalError: Error, cause: unknown) {
    super(
      `An error transformer threw an error: ${String(cause)}. The original error before any transformation: ${originalError.message}`,
      { cause },
    );
  }
}

export class TransactionComposer<TReturns extends unknown[] = []> {
  private static globalErrorTransformers: Set<ErrorTransformer> = new Set();

  /**
   * Error transformers used by every composer that is not given its own. They
   * are called in the order they were registered, each with the error
   * returned by the previous one.
   */
  static get errorTransformers(): ReadonlySet<ErrorTransformer> {
    return TransactionComposer.globalErrorTransformers;
  }

  static registerErrorTransformer(transformer: ErrorTransformer) {
    TransactionComposer.globalErrorTransformers.add(transformer);
  }

  /** Stop a transformer from being used by composers without their own */
  static unregisterErrorTransformer(transformer: ErrorTransformer) {
    TransactionComposer.globalErrorTransformers.delete(transformer);
  }

  private atc: AtomicTransactionComposer = new AtomicTransactionComposer();
  private pendingParams: TransactionParams[] = [];
  private txnInfo: TxnInfo[] = [];
  private errorTransformers: ReadonlySet<ErrorTransformer>;

  /**
   * Called once per transaction that does not carry its own suggestedParams.
   * Caching is up to this function.
   */
  getSuggestedParams?: () => Promise<SuggestedParams>;

  /**
   * When simulating to determine fees, also add the accounts, apps, assets
   * and boxes that app calls access without referencing to their reference
   * arrays. Defaults to true.
   */
  populateAppCallResources: boolean;

  constructor(opts: {
    getSuggestedParams?: () => Promise<SuggestedParams>;
    populateAppCallResources?: boolean;
    /** Replaces the transformers registered with registerErrorTransformer */
    errorTransformers?: ReadonlySet<ErrorTransformer>;
  }) {
    this.getSuggestedParams = opts.getSuggestedParams;
    this.populateAppCallResources = opts.populateAppCallResources ?? true;
    this.errorTransformers =
      opts.errorTransformers ?? TransactionComposer.errorTransformers;
  }

  private async transformError(originalError: unknown): Promise<unknown> {
    // Transformers only work with Error instances, so immediately return anything else
    if (!(originalError instanceof Error)) {
      return originalError;
    }

    let transformedError = originalError;

    for (const transformer of this.errorTransformers) {
      try {
        transformedError = await transformer(transformedError);
        if (!(transformedError instanceof Error)) {
          return new InvalidErrorTransformerValue(
            originalError,
            transformedError,
          );
        }
      } catch (errorFromTransformer) {
        return new ErrorTransformerError(originalError, errorFromTransformer);
      }
    }

    return transformedError;
  }

  /** Run fn, transforming any error it throws */
  private async transformErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw await this.transformError(e);
    }
  }

  private async getSdkParams(
    params: ParamOverrides & { signer?: TransactionSigner },
  ): Promise<OverriddenParams & { signer: TransactionSigner }> {
    const { sender } = params;

    let suggestedParams =
      params.suggestedParams ?? (await this.getSuggestedParams?.());
    if (suggestedParams === undefined) {
      throw Error(
        "Transaction missing suggestedParams and this.getSuggestedParams is undefined",
      );
    }

    suggestedParams = {
      ...suggestedParams,
      fee:
        params.staticFee ??
        (params.staticUsage !== undefined
          ? feeForUsage(params.staticUsage, BigInt(suggestedParams.minFee))
          : 0n),
      flatFee: true,
    };

    return {
      sender: sender.address,
      suggestedParams,
      signer: params.signer ?? sender.txnSigner,
    };
  }

  /**
   * Convert a method argument that an ABI method expects to be a transaction
   * into a TransactionWithSigner. The argument may already be built, or be
   * params for the composer to build, with a `type` discriminator identifying
   * the operation (e.g. `{ type: "assetCreate", ...params }`).
   */
  private async buildTxnArg(
    arg: unknown,
    argType: string,
  ): Promise<{
    arg: algosdk.TransactionWithSigner;
    txnInfo: TxnInfo;
  }> {
    if (algosdk.isTransactionWithSigner(arg)) {
      return {
        arg,
        // Already built, so its fee is fixed and cannot cover anything else
        txnInfo: {
          sender: { address: arg.txn.sender, txnSigner: arg.signer },
          isStatic: true,
        },
      };
    }

    let params: TransactionArgParams | undefined;
    if (typeof arg === "object" && arg !== null && "type" in arg) {
      const kind = arg.type;
      if (
        typeof kind === "string" &&
        Object.hasOwn(transactionArgTypes, kind)
      ) {
        const txnType =
          transactionArgTypes[kind as keyof typeof transactionArgTypes];
        if (argType !== "txn" && txnType !== argType) {
          throw new Error(
            `Params for ${kind} build a "${txnType}" transaction, but the method argument is "${argType}"`,
          );
        }
        params = arg as TransactionArgParams;
      }
    }

    if (params === undefined) {
      throw new Error(
        `Unsupported value for "${argType}" method argument. Expected a TransactionWithSigner or params with a type discriminator (e.g. { type: "assetTransfer", ...params }).`,
      );
    }

    assertMutuallyExclusiveFeeParams(params);
    return { arg: await this.buildTxn(params), txnInfo: txnInfoOf(params) };
  }

  /** Build a transaction that is not a method call from its params */
  private async buildTxn(
    p: TransactionArgParams,
  ): Promise<algosdk.TransactionWithSigner> {
    if (p.type === "pay") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        ...p,
        ...sdkParams,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "appCreate") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makeApplicationCreateTxnFromObject({
        ...p,
        ...sdkParams,
        onComplete: p.onComplete ?? OnApplicationComplete.NoOpOC,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "appCall") {
      const { onComplete, ...rest } = p;
      const sdkParams = await this.getSdkParams(rest);
      const txn = algosdk.makeApplicationCallTxnFromObject({
        ...rest,
        ...sdkParams,
        appIndex: p.appID,
        onComplete: onComplete ?? OnApplicationComplete.NoOpOC,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "keyReg") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
        ...p,
        ...sdkParams,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "assetCreate") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        ...p,
        ...sdkParams,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "assetConfig") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
        ...p,
        ...sdkParams,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "assetDestroy") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makeAssetDestroyTxnWithSuggestedParamsFromObject({
        ...p,
        ...sdkParams,
      });
      return { txn, signer: sdkParams.signer };
    }
    if (p.type === "assetFreeze") {
      const sdkParams = await this.getSdkParams(p);
      const txn = algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
        ...p,
        ...sdkParams,
      });
      return { txn, signer: sdkParams.signer };
    }
    const sdkParams = await this.getSdkParams(p);
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      ...p,
      ...sdkParams,
    });
    return { txn, signer: sdkParams.signer };
  }

  add(params: TransactionParams) {
    if (
      params.type !== "method" &&
      params.type !== "txn" &&
      !Object.hasOwn(transactionArgTypes, params.type)
    ) {
      throw Error(
        "Unsupported transaction type. Expected params with a type discriminator",
      );
    }
    if (params.type !== "txn") {
      assertMutuallyExclusiveFeeParams(params);
    }
    this.pendingParams.push(params);
    return this;
  }

  addPayment(params: PaymentParams) {
    return this.add({ ...params, type: "pay" });
  }

  /** Create an application with a bare (non-ABI) call */
  addAppCreate(params: AppCreateParams) {
    return this.add({ ...params, type: "appCreate" });
  }

  /** Register or deregister the account as part of the network's proof of stake */
  addKeyReg(params: KeyRegParams) {
    return this.add({ ...params, type: "keyReg" });
  }

  /** Create a new asset */
  addAssetCreate(params: AssetCreateParams) {
    return this.add({ ...params, type: "assetCreate" });
  }

  /** Change or remove the manager/reserve/freeze/clawback roles of an asset */
  addAssetConfig(params: AssetConfigParams) {
    return this.add({ ...params, type: "assetConfig" });
  }

  /** Destroy an asset, removing it from the ledger */
  addAssetDestroy(params: AssetDestroyParams) {
    return this.add({ ...params, type: "assetDestroy" });
  }

  /** Freeze or unfreeze an account's holdings of an asset */
  addAssetFreeze(params: AssetFreezeParams) {
    return this.add({ ...params, type: "assetFreeze" });
  }

  /** Transfer an asset (also used to opt an account into an asset) */
  addAssetTransfer(params: AssetTransferParams) {
    return this.add({ ...params, type: "assetTransfer" });
  }

  /** Add a bare application call (update, delete, etc.) with the given OnComplete */
  addAppCall(params: AppCallParams) {
    return this.add({ ...params, type: "appCall" });
  }

  /** Update an application's approval and clear programs */
  addAppUpdate(params: AppCallParams) {
    return this.add({
      ...params,
      type: "appCall",
      onComplete: algosdk.OnApplicationComplete.UpdateApplicationOC,
    });
  }

  /** Delete an application */
  addAppDelete(params: AppCallParams) {
    return this.add({
      ...params,
      type: "appCall",
      onComplete: algosdk.OnApplicationComplete.DeleteApplicationOC,
    });
  }

  /** Opt an account in to an application */
  addAppOptIn(params: AppCallParams) {
    return this.add({
      ...params,
      type: "appCall",
      onComplete: algosdk.OnApplicationComplete.OptInOC,
    });
  }

  /** Close out an account's state in an application */
  addAppCloseOut(params: AppCallParams) {
    return this.add({
      ...params,
      type: "appCall",
      onComplete: algosdk.OnApplicationComplete.CloseOutOC,
    });
  }

  /** Clear an account's state in an application */
  addAppClearState(params: AppCallParams) {
    return this.add({
      ...params,
      type: "appCall",
      onComplete: algosdk.OnApplicationComplete.ClearStateOC,
    });
  }

  /** Call an application with a no-op on completion */
  addAppNoOp(params: AppCallParams) {
    return this.add({
      ...params,
      type: "appCall",
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    });
  }

  /** Add a transaction that has already been built */
  addTransaction(txn: algosdk.TransactionWithSigner): this;
  addTransaction(txn: algosdk.Transaction, signer: TransactionSigner): this;
  addTransaction(
    txn: algosdk.Transaction | algosdk.TransactionWithSigner,
    signer?: TransactionSigner,
  ) {
    if (algosdk.isTransactionWithSigner(txn)) {
      return this.add({ ...txn, type: "txn" });
    }
    if (signer === undefined) {
      throw Error(
        "A TransactionSigner is required when adding a Transaction that has no signer attached",
      );
    }
    return this.add({ type: "txn", txn, signer });
  }

  addMethodCall<TReturn>(
    params: MethodParams<TReturn>,
  ): TransactionComposer<[...TReturns, TReturn]> {
    this.add({ ...params, type: "method" });
    return this as unknown as TransactionComposer<[...TReturns, TReturn]>;
  }

  /** (Re)compute the group ID of a group whose transactions were mutated after building */
  private static regroup(txns: algosdk.Transaction[]) {
    if (txns.length < 2) return;
    // The group ID is computed over transactions with an empty group field
    for (const txn of txns) txn.group = undefined;
    algosdk.assignGroupID(txns);
  }

  /**
   * Simulate the group to determine its fees and adjust them accordingly,
   * populating app call resources if enabled. Returns the simulate response,
   * with the group left unadjusted, if the group fails. Throws if a
   * transaction's adjusted fee would exceed its maxUsage or resources cannot
   * fit in the group's reference arrays.
   */
  private async simulateForInfo(
    algod: Algodv2,
    request?: algosdk.modelsv2.SimulateRequest,
  ): Promise<{ failedSimulation?: algosdk.modelsv2.SimulateResponse }> {
    const minFee = (await algod.getTransactionParams().do()).minFee;
    const clonedTxns = this.atc.clone().buildGroup();
    const simAtc = new AtomicTransactionComposer();
    const extraFees = 100_000n;

    if (this.txnInfo.find((t) => t.feePercent !== undefined) === undefined) {
      for (const info of this.txnInfo) {
        if (info.isStatic) continue;
        info.feePercent = 1 / this.txnInfo.filter((t) => !t.isStatic).length;
      }
    } else {
      const total = this.txnInfo.reduce(
        (sum, t) => sum + (t.feePercent ?? 0),
        0,
      );
      if (Math.abs(total - 1) > 1e-9) {
        throw new Error(
          `feePercent across the group must sum to 1, but sums to ${total}`,
        );
      }
    }

    // Put the extra simulation fee on a transaction whose fee is adjustable, so
    // it is not charged to a sender that is only meant to pay a static fee
    const extraFeeIdx = Math.max(
      0,
      this.txnInfo.findIndex((t) => !t.isStatic && (t.feePercent ?? 0) > 0),
    );
    for (const [idx, simTxn] of clonedTxns.entries()) {
      if (idx === extraFeeIdx) {
        simTxn.txn.fee += extraFees;
      }
      delete simTxn.txn.group;
      simAtc.addTransaction(simTxn);
    }

    const signedSimTxns = simAtc.buildGroup().map(async (txn, i) => {
      const emptySigner = this.txnInfo[i]?.sender.emptyTxnSigner;
      if (emptySigner) {
        return (await algosdk.signTransactionWithSigner(txn.txn, emptySigner))
          .stxn;
      } else {
        return new SignedTransaction({ txn: txn.txn });
      }
    });

    const simulateResponse = await algod
      .simulateTransactions(
        new algosdk.modelsv2.SimulateRequest({
          allowEmptySignatures: true,
          fixSigners: true,
          extraOpcodeBudget: request?.extraOpcodeBudget,
          allowMoreLogging: request?.allowMoreLogging,
          allowUnnamedResources:
            this.populateAppCallResources || request?.allowUnnamedResources,
          txnGroups: [
            new algosdk.modelsv2.SimulateRequestTransactionGroup({
              txns: await Promise.all(signedSimTxns),
            }),
          ],
        }),
      )
      .do();

    const groupResponse = simulateResponse.txnGroups[0];
    if (groupResponse === undefined) {
      throw Error("simulate did not include a group response");
    }

    if (groupResponse.failureMessage) {
      if (groupResponse.failureMessage.includes("fees is less")) {
        groupResponse.failureMessage +=
          ". Give a transaction whose sender can pay a non-zero feePercent, or increase staticUsage or staticFee on one or more transactions";
      }
      return { failedSimulation: simulateResponse };
    }

    const { groupUsage, groupFeesPaid } = groupResponse;

    const usage = BigInt(groupUsage ?? 0);
    const paid = BigInt(groupFeesPaid ?? 0) - extraFees;

    const requiredFees = feeForUsage(usage, minFee);

    const adjustedAtc = this.atc.clone();
    const txns = adjustedAtc.buildGroup().map((t) => t.txn);

    // Reference arrays do not affect usage, so the fees determined by this
    // simulation still hold once resources are added
    const resourcesPopulated =
      this.populateAppCallResources &&
      populateAppCallResources(txns, groupResponse);

    // Update staticUsage transactions to their fee at the current min fee. Any
    // fee they already contributed during simulation was based on the
    // suggested params, so account for the difference.
    let paidIncludesStaticUsage = 0n;
    let staticUsageFees = 0n;
    for (const [i, info] of this.txnInfo.entries()) {
      if (info.staticUsage === undefined) continue;
      const txn = txns[i];
      if (txn === undefined) continue;
      paidIncludesStaticUsage += txn.fee;
      const fee = feeForUsage(info.staticUsage, minFee);
      staticUsageFees += fee;
      txn.fee = fee;
    }

    const feeNeeded =
      requiredFees - paid + paidIncludesStaticUsage - staticUsageFees;
    if (feeNeeded <= 0n) {
      if (
        resourcesPopulated ||
        paidIncludesStaticUsage > 0n ||
        staticUsageFees > 0n
      ) {
        TransactionComposer.regroup(txns);
      }
      this.atc = adjustedAtc;
      return {};
    }

    const newFees = txns.map((txn, i) => {
      const info = this.txnInfo[i];
      if (info?.isStatic) return txn.fee;
      const percentage = info?.feePercent;
      if (percentage === undefined) return txn.fee;
      return txn.fee + BigInt(Math.ceil(percentage * Number(feeNeeded)));
    });

    // Check maxUsage before changing any fees so a throw leaves them untouched
    const maxUsageErrors: string[] = [];
    for (const [i, fee] of newFees.entries()) {
      const maxUsage = this.txnInfo[i]?.maxUsage;
      if (maxUsage === undefined) continue;
      const maxFee = feeForUsage(maxUsage, minFee);
      if (fee <= maxFee) continue;
      maxUsageErrors.push(
        `transaction ${i} requires a fee of ${fee} but its maxUsage of ${maxUsage} allows at most ${maxFee}`,
      );
    }
    if (maxUsageErrors.length > 0) {
      throw new Error(`maxUsage exceeded: ${maxUsageErrors.join("; ")}`);
    }

    for (const [i, txn] of txns.entries()) txn.fee = newFees[i] ?? txn.fee;

    // Fees (and possibly resources) changed after the group was built, so the
    // group ID must be recomputed
    TransactionComposer.regroup(txns);
    this.atc = adjustedAtc;
    return {};
  }

  /**
   * Build the group, using simulate to set fees when algod is given. If that
   * simulation fails, its response is returned as failedSimulation and the
   * unsuccessful build state is discarded so the next call can retry.
   * Throws if a transaction's adjusted fee would exceed its maxUsage.
   */
  private async _buildGroup(
    algod?: Algodv2,
    request?: algosdk.modelsv2.SimulateRequest,
  ): Promise<{
    group: algosdk.TransactionWithSigner[];
    failedSimulation?: algosdk.modelsv2.SimulateResponse;
  }> {
    if (this.atc.getStatus() >= AtomicTransactionComposerStatus.BUILT) {
      return { group: this.atc.buildGroup() };
    }

    let built = false;
    try {
      const result = await this.buildGroupAttempt(algod, request);
      built = result.failedSimulation === undefined;
      return result;
    } finally {
      if (!built) {
        this.atc = new AtomicTransactionComposer();
        this.txnInfo = [];
      }
    }
  }

  private async buildGroupAttempt(
    algod?: Algodv2,
    request?: algosdk.modelsv2.SimulateRequest,
  ): Promise<{
    group: algosdk.TransactionWithSigner[];
    failedSimulation?: algosdk.modelsv2.SimulateResponse;
  }> {
    const { atc } = this;
    for (const p of this.pendingParams) {
      if (p.type === "txn") {
        // Already built, so its fee is fixed and cannot cover anything else
        atc.addTransaction(p);
        this.txnInfo.push({
          sender: { address: p.txn.sender, txnSigner: p.signer },
          isStatic: true,
        });
        continue;
      }

      if (p.type !== "method") {
        atc.addTransaction(await this.buildTxn(p));
      } else {
        const { arc56, appID, ...rawMethodParams } = p;
        const sdkParams = await this.getSdkParams(p);

        if (arc56) {
          const { abiMethod, arc56Method } = getAbiMethod(arc56, p.method);
          const rawArgs = p.methodArgs ?? [];
          const encodedArgs = encodeMethodArgs(arc56, arc56Method, rawArgs);
          // Build discriminated transaction params using the composer's params.
          for (let i = 0; i < rawArgs.length; i++) {
            const argType = arc56Method.args[i]?.type;
            if (!algosdk.abiTypeIsTransaction(argType)) continue;
            const built = await this.buildTxnArg(rawArgs[i], argType);
            encodedArgs[i] = built.arg;
            this.txnInfo.push(built.txnInfo);
          }

          let boxes = p.boxes;
          if (boxes === undefined && arc56Method.recommendations?.boxes) {
            const recBoxes = Array.isArray(arc56Method.recommendations.boxes)
              ? arc56Method.recommendations.boxes
              : [arc56Method.recommendations.boxes];
            boxes = recBoxes.map((b) => ({
              appIndex: b.app ?? 0,
              name: algosdk.base64ToBytes(b.key),
            }));
          }

          const appAccounts =
            p.appAccounts ??
            (arc56Method.recommendations?.accounts
              ? arc56Method.recommendations.accounts
              : undefined);

          const appForeignApps =
            p.appForeignApps ??
            (arc56Method.recommendations?.apps
              ? arc56Method.recommendations.apps.map(BigInt)
              : undefined);

          const appForeignAssets =
            p.appForeignAssets ??
            (arc56Method.recommendations?.assets
              ? arc56Method.recommendations.assets.map(BigInt)
              : undefined);

          atc.addMethodCall({
            ...rawMethodParams,
            ...sdkParams,
            appID,
            method: abiMethod,
            methodArgs: encodedArgs,
            ...(boxes !== undefined ? { boxes } : {}),
            ...(appAccounts !== undefined ? { appAccounts } : {}),
            ...(appForeignApps !== undefined ? { appForeignApps } : {}),
            ...(appForeignAssets !== undefined ? { appForeignAssets } : {}),
          });
        } else {
          if (typeof p.method === "string") {
            throw new Error(
              "ARC56 definition is required when method is specified as a string",
            );
          }
          const { method } = p;
          const methodArgs = [...(p.methodArgs ?? [])];
          for (const [i, arg] of methodArgs.entries()) {
            const argType = method.args[i]?.type;
            if (!algosdk.abiTypeIsTransaction(argType)) continue;
            const built = await this.buildTxnArg(arg, argType);
            methodArgs[i] = built.arg;
            this.txnInfo.push(built.txnInfo);
          }
          atc.addMethodCall({
            ...rawMethodParams,
            ...sdkParams,
            appID,
            method,
            methodArgs: methodArgs as algosdk.ABIArgument[],
          });
        }
      }

      this.txnInfo.push(txnInfoOf(p));
    }

    const simulated = algod ? await this.simulateForInfo(algod, request) : {};
    if (simulated.failedSimulation) {
      return { group: [], ...simulated };
    }

    return { group: this.atc.buildGroup(), ...simulated };
  }

  /** Throw the failure of a simulation, with the response as its cause */
  private static throwSimulationFailure(
    simulateResponse: algosdk.modelsv2.SimulateResponse,
  ): never {
    throw new Error(simulateResponse.txnGroups[0]?.failureMessage, {
      cause: simulateResponse,
    });
  }

  private async buildGroupOrThrow(algod: Algodv2) {
    const { group, failedSimulation } = await this._buildGroup(algod);
    if (failedSimulation)
      TransactionComposer.throwSimulationFailure(failedSimulation);
    return group;
  }

  async buildGroup(algod: Algodv2) {
    return this.transformErrors(() => this.buildGroupOrThrow(algod));
  }

  async buildGroupOffline() {
    return (await this._buildGroup()).group;
  }

  private decodeResults(methodResults: algosdk.ABIResult[]): MethodResult[] {
    const methodCalls = this.pendingParams.filter((p) => p.type === "method");

    return methodResults.map((mr, idx) => {
      const callParams = methodCalls[idx];
      if (!callParams?.arc56) {
        return mr;
      }

      const arc56 = callParams.arc56;

      const { arc56Method: methodDef } = getAbiMethod(arc56, callParams.method);

      if (methodDef.returns.type === "void") {
        return {
          ...mr,
          returnValue: undefined,
        };
      }

      if (mr.rawReturnValue.length > 0) {
        try {
          const returnValue = decodeMethodReturnValue(
            arc56,
            callParams.method,
            mr.rawReturnValue,
          );
          return {
            ...mr,
            returnValue,
            decodeError: undefined,
          };
        } catch (e) {
          return {
            ...mr,
            decodeError: e as Error,
          };
        }
      }

      return mr;
    });
  }

  async execute(
    algod: Algodv2,
    roundsToWait: number = 3,
  ): Promise<ComposerExecuteResult<TReturns>> {
    return this.transformErrors(() => this._execute(algod, roundsToWait));
  }

  private async _execute(
    algod: Algodv2,
    roundsToWait: number,
  ): Promise<ComposerExecuteResult<TReturns>> {
    await this.buildGroupOrThrow(algod);
    // TODO: wait until latest last valid by default
    const result = await this.atc.execute(algod, roundsToWait);

    return {
      confirmedRound: result.confirmedRound,
      txIDs: result.txIDs,
      methodResults: this.decodeResults(
        result.methodResults,
      ) as MethodResults<TReturns>,
    };
  }

  async simulate(
    algod: Algodv2,
    simRequest?: ComposerSimulateOptions,
  ): Promise<{
    methodResults: MethodResults<TReturns>;
    simulateResponse: algosdk.modelsv2.SimulateResponse;
  }> {
    return this.transformErrors(() => this._simulate(algod, simRequest));
  }

  private async _simulate(
    algod: Algodv2,
    simRequest?: ComposerSimulateOptions,
  ): Promise<{
    methodResults: MethodResults<TReturns>;
    simulateResponse: algosdk.modelsv2.SimulateResponse;
  }> {
    if (
      simRequest?.skipSignatures &&
      (simRequest.allowEmptySignatures === false ||
        simRequest.fixSigners === false)
    ) {
      throw Error(
        "Cannot simulate with skipSignatures when allowEmptySignatures or fixSigners is set to false",
      );
    }

    const {
      skipSignatures,
      throwOnFailure = true,
      ...requestParams
    } = simRequest ?? {};
    const request = new algosdk.modelsv2.SimulateRequest({
      ...requestParams,
      txnGroups: [],
      // ?? so an explicit undefined doesn't turn these off under skipSignatures
      fixSigners: requestParams.fixSigners ?? skipSignatures,
      allowEmptySignatures:
        requestParams.allowEmptySignatures ?? skipSignatures,
    });

    const { failedSimulation } = await this._buildGroup(algod, request);
    // The group failed while determining fees. Simulating it again with
    // unadjusted fees would only fail on fees, so return the original failure.
    if (failedSimulation) {
      if (throwOnFailure)
        TransactionComposer.throwSimulationFailure(failedSimulation);
      return {
        simulateResponse: failedSimulation,
        methodResults: [] as unknown as MethodResults<TReturns>,
      };
    }
    let simAtc = this.atc;
    if (skipSignatures) {
      // Clone to keep the method calls for decoding results, then swap each
      // signer for the sender's empty signer
      simAtc = this.atc.clone();
      const simTxns = (
        simAtc as unknown as { transactions: algosdk.TransactionWithSigner[] }
      ).transactions;
      for (const [i, simTxn] of simTxns.entries()) {
        simTxn.signer =
          this.txnInfo[i]?.sender.emptyTxnSigner ??
          algosdk.makeEmptyTransactionSigner();
      }
    }

    const result = await simAtc.simulate(algod, request);
    if (
      throwOnFailure &&
      result.simulateResponse.txnGroups[0]?.failureMessage
    ) {
      TransactionComposer.throwSimulationFailure(result.simulateResponse);
    }

    return {
      simulateResponse: result.simulateResponse,
      methodResults: this.decodeResults(
        result.methodResults,
      ) as MethodResults<TReturns>,
    };
  }
}
