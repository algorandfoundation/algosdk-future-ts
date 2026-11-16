## Breaking Changes

- Remove `getTypeScriptValue`; use `decodeValue` instead.
- Throw a `TypeError` when encoding a struct with a missing field, or an `AVMUint64`/bytes value of an unsupported type, instead of silently encoding `undefined`, `0` or empty bytes.

## Features

- Add `encodeValue` and `decodeValue` to encode and decode any ARC56 type, including structs, by name.
- Support named structs and arrays of structs when encoding and decoding.
