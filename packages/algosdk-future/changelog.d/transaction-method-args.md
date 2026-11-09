## Breaking Changes

- Replace keyed `TransactionParams` in `composer.add()` with flat params using a `type` discriminator. Accept the same discriminated params for every transaction method argument, including in generated typed clients; bare payment arguments now require `type: "pay"`. Convenience methods such as `addPayment()` are unchanged.

## Fixes

- Keep the fee of a pre-built transaction passed as a method call argument instead of giving it a share of the group fee.
