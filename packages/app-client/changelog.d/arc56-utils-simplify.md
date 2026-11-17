## Breaking Changes

- Remove support for legacy `{ fieldName: type }` struct definitions in ARC-56 app clients. Define all structs, including nested structs, as ordered `{ name, type }[]` field arrays.
