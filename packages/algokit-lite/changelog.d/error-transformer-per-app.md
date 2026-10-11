## Fixes

- Register at most one error transformer per app id. A new `ARC56AppClient` replaces the transformer of any previous client for the same app, and `unregisterErrorTransformer` does nothing once a client's transformer has been replaced.
