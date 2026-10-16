# 0.4.0 - October 16th, 2026

## Breaking Changes

- Publish as `@algosdk/localnet` (previously `@joe-p/algosdk-localnet`). `composer()` now returns a `TransactionComposer`.

# 0.3.0 - October 15th, 2026

## Breaking Changes

- Rename the package from `@joe-p/algokit-lite-localnet` to `@joe-p/algosdk-localnet` as part of the rebrand from algoKIT lite to algosdk-future.

# 0.2.1 - October 11th, 2026

## Fixes

- Select the genesis `Wallet1` account as the LocalNet dispenser by default and throw when it is not found, matching AlgoKit Utils. Pass `{ account: "highestBalance" }` to explicitly select the most-funded local account instead.

# 0.2.0 - October 10th, 2026

## Breaking Changes

- Require `algosdk` `^3.8.0`.

# 0.1.0 - October 9th, 2026

## Features

- Initial release, split out of `@joe-p/algokit-lite` 0.7.0. Exports `Localnet`.
