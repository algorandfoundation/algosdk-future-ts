# 0.5.0 - October 16th, 2026

## Breaking Changes

- Publish as `@algosdk/transaction-composer` (previously `@joe-p/algosdk-composer`).
- Rename the `Composer` class to `TransactionComposer`.

# 0.4.0 - October 15th, 2026

## Breaking Changes

- Rename the package from `@joe-p/algokit-lite-composer` to `@joe-p/algosdk-composer` as part of the rebrand from algoKIT lite to algosdk-future.

# 0.3.0 - October 11th, 2026

## Features

- Add error transformers, which map errors thrown by `buildGroup`, `execute` and `simulate`. Register one for every composer with `Composer.registerErrorTransformer`, or give a composer its own with the `errorTransformers` constructor option.
- Add `Composer.unregisterErrorTransformer` to remove a transformer added with `Composer.registerErrorTransformer`.

# 0.2.0 - October 10th, 2026

## Breaking Changes

- Require `algosdk` `^3.8.0`.

# 0.1.0 - October 9th, 2026

## Features

- Initial release, split out of `@joe-p/algokit-lite` 0.7.0. Exports `Composer`, the ARC-56 types and the ARC-56 utilities.
