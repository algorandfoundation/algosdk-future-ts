## Chores

- Simplify the internal ARC-56 helpers in `arc56_utils`. `getABIType` and `getABIValue` now also accept inline struct definitions. A struct whose name matches a native type (such as `AVMString` or `void`) is now treated as that struct.
