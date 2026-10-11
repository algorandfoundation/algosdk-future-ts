## Fixes

- Select the genesis `Wallet1` account as the LocalNet dispenser by default and throw when it is not found, matching AlgoKit Utils. Pass `{ account: "highestBalance" }` to explicitly select the most-funded local account instead.
