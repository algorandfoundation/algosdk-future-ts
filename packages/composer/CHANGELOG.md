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
