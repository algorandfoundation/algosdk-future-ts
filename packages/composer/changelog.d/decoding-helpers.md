## Breaking Changes

- Remove `getTypeScriptValue`; use `decodeValue` instead.

## Features

- Add `encodeValue` and `decodeValue` to encode and decode any ARC56 type, including structs, by name.
- Support named structs and arrays of structs when encoding and decoding.
