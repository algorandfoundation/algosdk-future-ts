## Breaking Changes

- Remove legacy `{ fieldName: type }` struct definitions and the `StructFields` type. Define all ARC-56 structs, including nested structs, as ordered `{ name, type }[]` field arrays.

## Features

- Accept inline struct definitions in `getABIType` and `getABIValue`, while preserving native AVM value handling and `void` method returns when struct names collide.
