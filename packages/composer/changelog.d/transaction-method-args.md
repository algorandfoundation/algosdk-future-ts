## Breaking Changes

- Replace keyed `TransactionParams` in `composer.add()` with flat params using a `type` discriminator (e.g. `{ type: "pay", sender, receiver, amount }`). Convenience methods such as `addPayment()` are unchanged.
- Accept params for every transaction type as a method call argument, for both ARC-56 methods and `ABIMethod`s, using the same `type` discriminator. Bare payment params now require `type: "pay"`. Export `TransactionArg` and `TransactionArgs` for the accepted types.

## Fixes

- Keep the fee of a pre-built transaction passed as a method call argument, as `addTransaction` already does, instead of giving it a share of the group fee.
