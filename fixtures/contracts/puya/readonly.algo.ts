import {
  Application,
  Contract,
  arc4,
  assert,
  type uint64,
} from "@algorandfoundation/algorand-typescript";

type Point = { x: uint64; y: uint64 };

export class Readonly extends Contract {
  @arc4.abimethod({ readonly: true })
  getPoint(x: uint64): Point {
    return { x, y: x * 2 };
  }

  @arc4.abimethod({ readonly: true })
  mustBePositive(n: uint64): uint64 {
    assert(n > 0, "n must be positive");
    return n;
  }

  @arc4.abimethod({ readonly: true })
  callOther(appId: uint64): uint64 {
    const { returnValue } = arc4.abiCall<typeof Readonly.prototype.getPoint>({
      appId: Application(appId),
      args: [7],
      fee: 0,
    });
    return returnValue.y;
  }

  write(): void {}

  @arc4.abimethod({ readonly: true })
  getSeven(): uint64 {
    return 7;
  }
}
