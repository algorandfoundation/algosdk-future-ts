## Breaking Changes

- Remove `getTypeScriptValue`; use `decodeValue` instead.
- Throw a `TypeError` when encoding a struct with a missing field, a non-array value for an array of structs, a struct value that is neither an object nor a tuple, or an `AVMUint64`/bytes value of an unsupported type, instead of silently encoding `undefined`, `0`, empty bytes or the value as-is.
- Throw a `TypeError` when encoding an `AVMUint64` that isn't an integer (e.g. `1.5` or `"abc"`), and a `RangeError` when it's outside the uint64 range.

## Features

- Add `encodeValue` and `decodeValue` to encode and decode any ARC56 type, including structs, by name.
- Support named structs and arrays of structs when encoding and decoding.
