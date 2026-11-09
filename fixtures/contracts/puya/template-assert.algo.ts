import {
  Contract,
  TemplateVar,
  assert,
  type bytes,
  type uint64,
} from "@algorandfoundation/algorand-typescript";

export class TemplateAssert extends Contract {
  check(value: uint64, other: uint64): bytes {
    assert(value === 42, "value must be 42");
    assert(other !== 0, "other must not be 0");
    return TemplateVar<bytes>("PAYLOAD");
  }
}
