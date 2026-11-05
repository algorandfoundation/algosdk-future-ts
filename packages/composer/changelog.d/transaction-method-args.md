## Features

- Accept params for every transaction type as a method call argument, for both ARC-56 methods and `ABIMethod`s. Use bare params for `pay`, `axfer`, `afrz` and `keyreg`, and params keyed by kind (e.g. `{ assetCreate: { ... } }`) for any type. Export `TransactionArg` and `TransactionArgs` for the accepted types.

## Fixes

- Keep the fee of a pre-built transaction passed as a method call argument, as `addTransaction` already does, instead of giving it a share of the group fee.
