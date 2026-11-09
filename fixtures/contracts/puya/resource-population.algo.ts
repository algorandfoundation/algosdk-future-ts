import {
  Application,
  Asset,
  Contract,
  Bytes,
  arc4,
  log,
  op,
  type bytes,
  type uint64,
} from "@algorandfoundation/algorand-typescript";

// Value arguments (not ABI references) leave resources for simulation to discover.
export class ResourcePopulation extends Contract {
  account(address: arc4.Address): void {
    log(op.balance(address.native));
  }

  app(appId: uint64): void {
    const [value, exists] = op.AppGlobal.getExUint64(
      Application(appId),
      Bytes("x"),
    );
    log(value, exists);
  }

  asset(assetId: uint64): void {
    log(Asset(assetId).total);
  }

  box(name: bytes): void {
    op.Box.put(name, Bytes("v"));
  }

  holding(address: arc4.Address, assetId: uint64): void {
    const [balance, exists] = op.AssetHolding.assetBalance(
      address.native,
      Asset(assetId),
    );
    log(balance, exists);
  }

  local(address: arc4.Address, appId: uint64): void {
    log(address.native.isOptedIn(Application(appId)));
  }
}
