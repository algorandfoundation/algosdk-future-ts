# 0.6.0 - October 15th, 2026

## Breaking Changes

- Rename the package from `@joe-p/algokit-lite-app-client` to `@joe-p/algosdk-app-client` as part of the rebrand from algoKIT lite to algosdk-future.

# 0.5.0 - October 12th, 2026

## Breaking Changes

- Replace the `ARC56AppClient.compileProgram` method with a top-level `compileProgram(arc56, algod, program, templateVars?)` function, so programs can be compiled from an app spec without creating a client.

# 0.4.1 - October 11th, 2026

## Fixes

- Register at most one error transformer per app id. A new `ARC56AppClient` replaces the transformer of any previous client for the same app, and `unregisterErrorTransformer` does nothing once a client's transformer has been replaced.

# 0.4.0 - October 11th, 2026

## Features

- Every `ARC56AppClient` with an app id registers an error transformer, so logic errors from its app are mapped to their ARC56 error messages in any `Composer`, not only in the client's own calls.
- Add `ARC56AppClient.unregisterErrorTransformer` to stop mapping the app's errors in other composers, so a client that is no longer used can be garbage collected.

# 0.3.0 - October 10th, 2026

## Breaking Changes

- Require `algosdk` `^3.8.0`.

## Features

- Add `getState.box()` to get all of an app's box state, decoded with the ARC56 box keys and maps. Only boxes matching an ARC56 key or map prefix are fetched, using algod's box prefix filter and pagination.

# 0.2.0 - October 10th, 2026

## Features

- Add `getState.global()` and `getState.local(address)` to get all of an app's global or local state, decoded with the ARC56 state keys and maps.

# 0.1.0 - October 9th, 2026

## Features

- Initial release, split out of `@joe-p/algokit-lite` 0.7.0. Exports `ARC56AppClient`.
