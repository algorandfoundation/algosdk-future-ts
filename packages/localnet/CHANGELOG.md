# 0.2.1 - October 11th, 2026

## Fixes

- Select the genesis `Wallet1` account as the LocalNet dispenser by default and throw when it is not found, matching AlgoKit Utils. Pass `{ account: "highestBalance" }` to explicitly select the most-funded local account instead.

# 0.2.0 - October 10th, 2026

## Breaking Changes

- Require `algosdk` `^3.8.0`.

# 0.1.0 - October 9th, 2026

## Features

- Initial release, split out of `@joe-p/algokit-lite` 0.7.0. Exports `Localnet`.
