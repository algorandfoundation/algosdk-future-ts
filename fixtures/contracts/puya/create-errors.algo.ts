import {
  Contract,
  arc4,
  assert,
  type uint64,
} from "@algorandfoundation/algorand-typescript";

export class Assert42 extends Contract {
  @arc4.abimethod({ onCreate: "require" })
  create(x: uint64): void {
    assert(x === 42, "x must be 42");
  }
}

export class BareCreateError extends Contract {
  @arc4.baremethod({ onCreate: "require" })
  create(): void {
    assert(false, "bare create failed");
  }
}
