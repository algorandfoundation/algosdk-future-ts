## Features

- Type every transaction argument of a generated client as `TransactionArg<type>`, so it accepts flat params with a `type` discriminator for the composer to build as well as a pre-built `TransactionWithSigner`.

## Breaking Changes

- Payment arguments supplied as params now require `type: "pay"`.
