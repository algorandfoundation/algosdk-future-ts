## Breaking Changes

- Remove support for legacy `{ fieldName: type }` struct definitions in typed client generation. Define all ARC-56 structs, including nested structs, as ordered `{ name, type }[]` field arrays.
