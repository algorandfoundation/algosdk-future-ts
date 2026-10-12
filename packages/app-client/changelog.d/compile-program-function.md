## Breaking Changes

- Replace the `ARC56AppClient.compileProgram` method with a top-level `compileProgram(arc56, algod, program, templateVars?)` function, so programs can be compiled from an app spec without creating a client.
