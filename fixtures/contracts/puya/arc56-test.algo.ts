import {
  Box,
  BoxMap,
  Contract,
  GlobalMap,
  GlobalState,
  LocalMap,
  LocalState,
  TemplateVar,
  Txn,
  Bytes,
  arc4,
  assert,
  contract,
  type bytes,
  type uint64,
} from "@algorandfoundation/algorand-typescript";

type Pair = { a: uint64; b: uint64 };
type Inputs = { add: Pair; subtract: Pair };
type Outputs = { sum: uint64; difference: uint64 };
class MapValue extends arc4.Struct<{ foo: arc4.Uint16; bar: arc4.Uint16 }> {}

@contract({
  stateTotals: {
    globalUints: 1,
    globalBytes: 37,
    localUints: 1,
    localBytes: 13,
  },
})
export class ARC56Test extends Contract {
  globalKey = GlobalState<uint64>();
  globalMap = GlobalMap<arc4.Str, MapValue>({ keyPrefix: "p" });
  localKey = LocalState<uint64>();
  localMap = LocalMap<bytes, arc4.Str>({ keyPrefix: "p" });
  boxKey = Box<arc4.Str>({ key: "boxKey" });
  boxMap = BoxMap<Inputs, Outputs>({ keyPrefix: "p" });

  foo(inputs: Inputs): Outputs {
    assert(
      inputs.subtract.a >= inputs.subtract.b,
      "subtract.a must be greater than subtract.b",
    );
    this.globalKey.value = TemplateVar<uint64>("SOME_NUMBER");
    this.globalMap(new arc4.Str("foo")).value = new MapValue({
      foo: new arc4.Uint16(13),
      bar: new arc4.Uint16(37),
    });
    return {
      sum: inputs.add.a + inputs.add.b,
      difference: inputs.subtract.a - inputs.subtract.b,
    };
  }

  optInToApplication(): void {
    this.localKey(Txn.sender).value = TemplateVar<uint64>("SOME_NUMBER");
    this.localMap(Bytes("foo"), Txn.sender).value = new arc4.Str("bar");
    this.boxKey.value = new arc4.Str("baz");
    this.boxMap({ add: { a: 1, b: 2 }, subtract: { a: 4, b: 3 } }).value = {
      sum: 3,
      difference: 1,
    };
  }

  createApplication(): void {}
}
