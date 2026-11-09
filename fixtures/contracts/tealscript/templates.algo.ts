import { Contract } from "@algorandfoundation/tealscript";

export class TEALScriptTemplates extends Contract {
  PAYLOAD = TemplateVar<bytes>();

  check(value: uint64, other: uint64): bytes {
    assert(value === 42, "value must be 42");
    assert(other !== 0, "other must not be 0");
    return this.PAYLOAD;
  }
}
