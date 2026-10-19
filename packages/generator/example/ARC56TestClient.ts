/* eslint-disable */
import algosdk from "algosdk";
import {
  ARC56AppClient,
  type AppClientMethodParams,
  type CreateMethodParams,
  type MethodExecutionResult,
} from "@algosdk/app-client";
import {
  type MethodParams,
  type PaymentParams,
  type ARC56Contract,
} from "@algosdk/transaction-composer";

type TypedMethodParams<TArgs = undefined> = Omit<
  AppClientMethodParams,
  "method" | "methodArgs"
> &
  (TArgs extends undefined ? { args?: undefined } : { args: TArgs });
type TypedCreateMethodParams<TArgs = undefined> = Omit<
  CreateMethodParams,
  "method" | "methodArgs"
> &
  (TArgs extends undefined ? { args?: undefined } : { args: TArgs });

export const ARC56_JSON =
  '{"name":"ARC56Test","structs":{"MapValue":[{"name":"foo","type":"uint16"},{"name":"bar","type":"uint16"}],"Inputs":[{"name":"add","type":"Pair"},{"name":"subtract","type":"Pair"}],"Outputs":[{"name":"sum","type":"uint64"},{"name":"difference","type":"uint64"}],"Pair":[{"name":"a","type":"uint64"},{"name":"b","type":"uint64"}]},"methods":[{"name":"foo","args":[{"type":"((uint64,uint64),(uint64,uint64))","struct":"Inputs","name":"inputs"}],"returns":{"type":"(uint64,uint64)","struct":"Outputs"},"actions":{"create":[],"call":["NoOp"]},"readonly":false,"events":[],"recommendations":{}},{"name":"optInToApplication","args":[],"returns":{"type":"void"},"actions":{"create":[],"call":["OptIn"]},"readonly":false,"events":[],"recommendations":{}},{"name":"createApplication","args":[],"returns":{"type":"void"},"actions":{"create":["NoOp"],"call":[]},"readonly":false,"events":[],"recommendations":{}}],"arcs":[22,28],"networks":{},"state":{"schema":{"global":{"ints":1,"bytes":37},"local":{"ints":1,"bytes":13}},"keys":{"global":{"globalKey":{"keyType":"AVMString","valueType":"AVMUint64","key":"Z2xvYmFsS2V5"}},"local":{"localKey":{"keyType":"AVMString","valueType":"AVMUint64","key":"bG9jYWxLZXk="}},"box":{"boxKey":{"keyType":"AVMString","valueType":"string","key":"Ym94S2V5"}}},"maps":{"global":{"globalMap":{"keyType":"string","valueType":"MapValue","prefix":"cA=="}},"local":{"localMap":{"keyType":"AVMBytes","valueType":"string","prefix":"cA=="}},"box":{"boxMap":{"keyType":"Inputs","valueType":"Outputs","prefix":"cA=="}}}},"bareActions":{"create":[],"call":[]},"sourceInfo":{"approval":{"sourceInfo":[{"pc":[71],"errorMessage":"invalid number of bytes for fixtures/contracts/puya/arc56-test.algo.ts::Inputs"},{"pc":[84],"errorMessage":"subtract.a must be greater than subtract.b"}],"pcOffsetMethod":"cblocks"},"clear":{"sourceInfo":[],"pcOffsetMethod":"none"}},"source":{"approval":"I3ByYWdtYSB2ZXJzaW9uIDExCiNwcmFnbWEgdHlwZXRyYWNrIGZhbHNlCgovLyBAYWxnb3JhbmRmb3VuZGF0aW9uL2FsZ29yYW5kLXR5cGVzY3JpcHQvYXJjNC9pbmRleC5kLnRzOjpDb250cmFjdC5hcHByb3ZhbFByb2dyYW0oKSAtPiB1aW50NjQ6Cm1haW46CiAgICBpbnRjYmxvY2sgMSAwIDggVE1QTF9TT01FX05VTUJFUgogICAgYnl0ZWNibG9jayAiYm94S2V5IgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjI0LTMyCiAgICAvLyBAY29udHJhY3QoewogICAgLy8gICBzdGF0ZVRvdGFsczogewogICAgLy8gICAgIGdsb2JhbFVpbnRzOiAxLAogICAgLy8gICAgIGdsb2JhbEJ5dGVzOiAzNywKICAgIC8vICAgICBsb2NhbFVpbnRzOiAxLAogICAgLy8gICAgIGxvY2FsQnl0ZXM6IDEzLAogICAgLy8gICB9LAogICAgLy8gfSkKICAgIC8vIGV4cG9ydCBjbGFzcyBBUkM1NlRlc3QgZXh0ZW5kcyBDb250cmFjdCB7CiAgICBwdXNoYnl0ZXMgMHgwMWEzYTNmZiAvLyBtZXRob2QgIm9wdEluVG9BcHBsaWNhdGlvbigpdm9pZCIKICAgIHR4bmEgQXBwbGljYXRpb25BcmdzIDAKICAgIG1hdGNoIG1haW5fb3B0SW5Ub0FwcGxpY2F0aW9uX3JvdXRlQDIKCm1haW5fc3dpdGNoX2Nhc2VfbmV4dEAzOgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjI0LTMyCiAgICAvLyBAY29udHJhY3QoewogICAgLy8gICBzdGF0ZVRvdGFsczogewogICAgLy8gICAgIGdsb2JhbFVpbnRzOiAxLAogICAgLy8gICAgIGdsb2JhbEJ5dGVzOiAzNywKICAgIC8vICAgICBsb2NhbFVpbnRzOiAxLAogICAgLy8gICAgIGxvY2FsQnl0ZXM6IDEzLAogICAgLy8gICB9LAogICAgLy8gfSkKICAgIC8vIGV4cG9ydCBjbGFzcyBBUkM1NlRlc3QgZXh0ZW5kcyBDb250cmFjdCB7CiAgICB0eG4gT25Db21wbGV0aW9uCiAgICAhCiAgICBhc3NlcnQKICAgIHR4biBBcHBsaWNhdGlvbklECiAgICBieiBtYWluX2NyZWF0ZV9Ob09wQDcKICAgIHB1c2hieXRlcyAweDM5NmQ1NTBlIC8vIG1ldGhvZCAiZm9vKCgodWludDY0LHVpbnQ2NCksKHVpbnQ2NCx1aW50NjQpKSkodWludDY0LHVpbnQ2NCkiCiAgICB0eG5hIEFwcGxpY2F0aW9uQXJncyAwCiAgICBtYXRjaCBmb28KICAgIGVycgoKbWFpbl9jcmVhdGVfTm9PcEA3OgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjI0LTMyCiAgICAvLyBAY29udHJhY3QoewogICAgLy8gICBzdGF0ZVRvdGFsczogewogICAgLy8gICAgIGdsb2JhbFVpbnRzOiAxLAogICAgLy8gICAgIGdsb2JhbEJ5dGVzOiAzNywKICAgIC8vICAgICBsb2NhbFVpbnRzOiAxLAogICAgLy8gICAgIGxvY2FsQnl0ZXM6IDEzLAogICAgLy8gICB9LAogICAgLy8gfSkKICAgIC8vIGV4cG9ydCBjbGFzcyBBUkM1NlRlc3QgZXh0ZW5kcyBDb250cmFjdCB7CiAgICBwdXNoYnl0ZXMgMHhiODQ0N2IzNiAvLyBtZXRob2QgImNyZWF0ZUFwcGxpY2F0aW9uKCl2b2lkIgogICAgdHhuYSBBcHBsaWNhdGlvbkFyZ3MgMAogICAgbWF0Y2ggbWFpbl9jcmVhdGVBcHBsaWNhdGlvbl9yb3V0ZUA4CiAgICBlcnIKCm1haW5fY3JlYXRlQXBwbGljYXRpb25fcm91dGVAODoKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo2NgogICAgLy8gY3JlYXRlQXBwbGljYXRpb24oKTogdm9pZCB7fQogICAgaW50Y18wIC8vIDEKICAgIHJldHVybgoKbWFpbl9vcHRJblRvQXBwbGljYXRpb25fcm91dGVAMjoKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo1NgogICAgLy8gb3B0SW5Ub0FwcGxpY2F0aW9uKCk6IHZvaWQgewogICAgdHhuIE9uQ29tcGxldGlvbgogICAgaW50Y18wIC8vIE9wdEluCiAgICA9PQogICAgdHhuIEFwcGxpY2F0aW9uSUQKICAgICYmCiAgICBhc3NlcnQKICAgIGIgb3B0SW5Ub0FwcGxpY2F0aW9uCgoKLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjpBUkM1NlRlc3QuZm9vW3JvdXRpbmddKCkgLT4gdm9pZDoKZm9vOgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjQwCiAgICAvLyBmb28oaW5wdXRzOiBJbnB1dHMpOiBPdXRwdXRzIHsKICAgIHR4bmEgQXBwbGljYXRpb25BcmdzIDEKICAgIGR1cAogICAgbGVuCiAgICBwdXNoaW50IDMyCiAgICA9PQogICAgYXNzZXJ0IC8vIGludmFsaWQgbnVtYmVyIG9mIGJ5dGVzIGZvciBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6OklucHV0cwogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjQyCiAgICAvLyBpbnB1dHMuc3VidHJhY3QuYSA+PSBpbnB1dHMuc3VidHJhY3QuYiwKICAgIGR1cAogICAgZXh0cmFjdCAxNiAxNgogICAgZHVwCiAgICBpbnRjXzEgLy8gMAogICAgZXh0cmFjdF91aW50NjQKICAgIHN3YXAKICAgIGludGNfMiAvLyA4CiAgICBleHRyYWN0X3VpbnQ2NAogICAgZHVwMgogICAgPj0KICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo0MS00NAogICAgLy8gYXNzZXJ0KAogICAgLy8gICBpbnB1dHMuc3VidHJhY3QuYSA+PSBpbnB1dHMuc3VidHJhY3QuYiwKICAgIC8vICAgInN1YnRyYWN0LmEgbXVzdCBiZSBncmVhdGVyIHRoYW4gc3VidHJhY3QuYiIsCiAgICAvLyApOwogICAgYXNzZXJ0IC8vIHN1YnRyYWN0LmEgbXVzdCBiZSBncmVhdGVyIHRoYW4gc3VidHJhY3QuYgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjMzCiAgICAvLyBnbG9iYWxLZXkgPSBHbG9iYWxTdGF0ZTx1aW50NjQ+KCk7CiAgICBwdXNoYnl0ZXMgImdsb2JhbEtleSIKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo0NQogICAgLy8gdGhpcy5nbG9iYWxLZXkudmFsdWUgPSBUZW1wbGF0ZVZhcjx1aW50NjQ+KCJTT01FX05VTUJFUiIpOwogICAgaW50Y18zIC8vIFRNUExfU09NRV9OVU1CRVIKICAgIGFwcF9nbG9iYWxfcHV0CiAgICAvLyBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6MzQKICAgIC8vIGdsb2JhbE1hcCA9IEdsb2JhbE1hcDxhcmM0LlN0ciwgTWFwVmFsdWU+KHsga2V5UHJlZml4OiAicCIgfSk7CiAgICBwdXNoYnl0ZXNzIDB4NzAwMDAzNjY2ZjZmIDB4MDAwZDAwMjUKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo0Ni00OQogICAgLy8gdGhpcy5nbG9iYWxNYXAobmV3IGFyYzQuU3RyKCJmb28iKSkudmFsdWUgPSBuZXcgTWFwVmFsdWUoewogICAgLy8gICBmb286IG5ldyBhcmM0LlVpbnQxNigxMyksCiAgICAvLyAgIGJhcjogbmV3IGFyYzQuVWludDE2KDM3KSwKICAgIC8vIH0pOwogICAgYXBwX2dsb2JhbF9wdXQKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo1MQogICAgLy8gc3VtOiBpbnB1dHMuYWRkLmEgKyBpbnB1dHMuYWRkLmIsCiAgICB1bmNvdmVyIDIKICAgIGV4dHJhY3QgMCAxNgogICAgZHVwCiAgICBpbnRjXzEgLy8gMAogICAgZXh0cmFjdF91aW50NjQKICAgIHN3YXAKICAgIGludGNfMiAvLyA4CiAgICBleHRyYWN0X3VpbnQ2NAogICAgKwogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjUyCiAgICAvLyBkaWZmZXJlbmNlOiBpbnB1dHMuc3VidHJhY3QuYSAtIGlucHV0cy5zdWJ0cmFjdC5iLAogICAgY292ZXIgMgogICAgLQogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjUwLTUzCiAgICAvLyByZXR1cm4gewogICAgLy8gICBzdW06IGlucHV0cy5hZGQuYSArIGlucHV0cy5hZGQuYiwKICAgIC8vICAgZGlmZmVyZW5jZTogaW5wdXRzLnN1YnRyYWN0LmEgLSBpbnB1dHMuc3VidHJhY3QuYiwKICAgIC8vIH07CiAgICBzd2FwCiAgICBpdG9iCiAgICBzd2FwCiAgICBpdG9iCiAgICBjb25jYXQKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo0MAogICAgLy8gZm9vKGlucHV0czogSW5wdXRzKTogT3V0cHV0cyB7CiAgICBwdXNoYnl0ZXMgMHgxNTFmN2M3NQogICAgc3dhcAogICAgY29uY2F0CiAgICBsb2cKICAgIGludGNfMCAvLyAxCiAgICByZXR1cm4KCgovLyBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6OkFSQzU2VGVzdC5vcHRJblRvQXBwbGljYXRpb25bcm91dGluZ10oKSAtPiB2b2lkOgpvcHRJblRvQXBwbGljYXRpb246CiAgICAvLyBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6NTcKICAgIC8vIHRoaXMubG9jYWxLZXkoVHhuLnNlbmRlcikudmFsdWUgPSBUZW1wbGF0ZVZhcjx1aW50NjQ+KCJTT01FX05VTUJFUiIpOwogICAgdHhuIFNlbmRlcgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjM1CiAgICAvLyBsb2NhbEtleSA9IExvY2FsU3RhdGU8dWludDY0PigpOwogICAgcHVzaGJ5dGVzICJsb2NhbEtleSIKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo1NwogICAgLy8gdGhpcy5sb2NhbEtleShUeG4uc2VuZGVyKS52YWx1ZSA9IFRlbXBsYXRlVmFyPHVpbnQ2ND4oIlNPTUVfTlVNQkVSIik7CiAgICBpbnRjXzMgLy8gVE1QTF9TT01FX05VTUJFUgogICAgYXBwX2xvY2FsX3B1dAogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjU4CiAgICAvLyB0aGlzLmxvY2FsTWFwKEJ5dGVzKCJmb28iKSwgVHhuLnNlbmRlcikudmFsdWUgPSBuZXcgYXJjNC5TdHIoImJhciIpOwogICAgdHhuIFNlbmRlcgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjM2CiAgICAvLyBsb2NhbE1hcCA9IExvY2FsTWFwPGJ5dGVzLCBhcmM0LlN0cj4oeyBrZXlQcmVmaXg6ICJwIiB9KTsKICAgIHB1c2hieXRlc3MgInBmb28iIDB4MDAwMzYyNjE3MgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjU4CiAgICAvLyB0aGlzLmxvY2FsTWFwKEJ5dGVzKCJmb28iKSwgVHhuLnNlbmRlcikudmFsdWUgPSBuZXcgYXJjNC5TdHIoImJhciIpOwogICAgYXBwX2xvY2FsX3B1dAogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjM3CiAgICAvLyBib3hLZXkgPSBCb3g8YXJjNC5TdHI+KHsga2V5OiAiYm94S2V5IiB9KTsKICAgIGJ5dGVjXzAgLy8gImJveEtleSIKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo1OQogICAgLy8gdGhpcy5ib3hLZXkudmFsdWUgPSBuZXcgYXJjNC5TdHIoImJheiIpOwogICAgYm94X2RlbAogICAgcG9wCiAgICAvLyBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6MzcKICAgIC8vIGJveEtleSA9IEJveDxhcmM0LlN0cj4oeyBrZXk6ICJib3hLZXkiIH0pOwogICAgYnl0ZWNfMCAvLyAiYm94S2V5IgogICAgLy8gZml4dHVyZXMvY29udHJhY3RzL3B1eWEvYXJjNTYtdGVzdC5hbGdvLnRzOjU5CiAgICAvLyB0aGlzLmJveEtleS52YWx1ZSA9IG5ldyBhcmM0LlN0cigiYmF6Iik7CiAgICBwdXNoYnl0ZXMgMHgwMDAzNjI2MTdhCiAgICBib3hfcHV0CiAgICAvLyBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6MzgKICAgIC8vIGJveE1hcCA9IEJveE1hcDxJbnB1dHMsIE91dHB1dHM+KHsga2V5UHJlZml4OiAicCIgfSk7CiAgICBwdXNoYnl0ZXNzIDB4NzAwMDAwMDAwMDAwMDAwMDAxMDAwMDAwMDAwMDAwMDAwMjAwMDAwMDAwMDAwMDAwMDQwMDAwMDAwMDAwMDAwMDAzIDB4MDAwMDAwMDAwMDAwMDAwMzAwMDAwMDAwMDAwMDAwMDEKICAgIC8vIGZpeHR1cmVzL2NvbnRyYWN0cy9wdXlhL2FyYzU2LXRlc3QuYWxnby50czo2MC02MwogICAgLy8gdGhpcy5ib3hNYXAoeyBhZGQ6IHsgYTogMSwgYjogMiB9LCBzdWJ0cmFjdDogeyBhOiA0LCBiOiAzIH0gfSkudmFsdWUgPSB7CiAgICAvLyAgIHN1bTogMywKICAgIC8vICAgZGlmZmVyZW5jZTogMSwKICAgIC8vIH07CiAgICBib3hfcHV0CiAgICAvLyBmaXh0dXJlcy9jb250cmFjdHMvcHV5YS9hcmM1Ni10ZXN0LmFsZ28udHM6NTYKICAgIC8vIG9wdEluVG9BcHBsaWNhdGlvbigpOiB2b2lkIHsKICAgIGludGNfMCAvLyAxCiAgICByZXR1cm4K","clear":"I3ByYWdtYSB2ZXJzaW9uIDExCiNwcmFnbWEgdHlwZXRyYWNrIGZhbHNlCgovLyBAYWxnb3JhbmRmb3VuZGF0aW9uL2FsZ29yYW5kLXR5cGVzY3JpcHQvYmFzZS1jb250cmFjdC5kLnRzOjpCYXNlQ29udHJhY3QuY2xlYXJTdGF0ZVByb2dyYW0oKSAtPiB1aW50NjQ6Cm1haW46CiAgICBwdXNoaW50IDEKICAgIHJldHVybgo="},"byteCode":{"approval":"CyAEAQAIACYBBmJveEtleYAEAaOj/zYaAI4BACcxGRREMRhBAA6ABDltVQ42GgCOAQAcAIAEuER7NjYaAI4BAAEAIkMxGSISMRgQREIAUTYaAUkVgSASRElXEBBJI1tMJFtKD0SACWdsb2JhbEtleSVnggIGcAADZm9vBAANACVnTwJXABBJI1tMJFsITgIJTBZMFlCABBUffHVMULAiQzEAgAhsb2NhbEtleSVmMQCCAgRwZm9vBQADYmFyZii8SCiABQADYmF6v4ICIXAAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAQAAAAAAAAAAxAAAAAAAAAAAwAAAAAAAAABvyJD","clear":"C4EBQw=="},"compilerInfo":{"compiler":"puya","compilerVersion":{"major":5,"minor":10,"patch":1}},"events":[],"templateVariables":{"SOME_NUMBER":{"type":"AVMUint64"}}}';

/** The ARC56 contract this client was generated from */
export const APP_SPEC = JSON.parse(ARC56_JSON) as ARC56Contract;

// Aliases for non-encoded ABI values
type AVMUint64 = bigint;
type uint64 = bigint;
type AVMString = string;
type AVMBytes = Uint8Array | string;
type uint16 = bigint;

// Type definitions for ARC56 structs
export type MapValue = {
  foo: uint16;
  bar: uint16;
};
export type Inputs = {
  add: Pair;
  subtract: Pair;
};
export type Outputs = {
  sum: uint64;
  difference: uint64;
};
export type Pair = {
  a: uint64;
  b: uint64;
};

export type ARC56TestReturnTypes = {
  foo: Outputs;
  optInToApplication: void;
  createApplication: void;
};

/** Compile-time variables */
export type TemplateVariables = {
  SOME_NUMBER: AVMUint64;
};

/** All the decoded global state. Keys that are not set are omitted. */
export type ARC56TestGlobalState = {
  keys: {
    globalKey?: AVMUint64;
  };
  maps: {
    globalMap: Array<{ key: string; value: MapValue }>;
  };
};

/** All the decoded local state. Keys that are not set are omitted. */
export type ARC56TestLocalState = {
  keys: {
    localKey?: AVMUint64;
  };
  maps: {
    localMap: Array<{ key: AVMBytes; value: string }>;
  };
};

/** All the decoded box state. Keys that are not set are omitted. */
export type ARC56TestBoxState = {
  keys: {
    boxKey?: string;
  };
  maps: {
    boxMap: Array<{ key: Inputs; value: Outputs }>;
  };
};

export class ARC56TestClient extends ARC56AppClient {
  constructor(p: {
    appId: bigint | number;
    algod: algosdk.Algodv2;
    getSuggestedParams?: () => Promise<algosdk.SuggestedParams>;
    arc56?: ARC56Contract;
  }) {
    super({ arc56: APP_SPEC, ...p });
  }

  params = {
    foo: (
      methodParams: TypedMethodParams<{ inputs: Inputs }>,
    ): MethodParams<ARC56TestReturnTypes["foo"]> => {
      return this.getParams<ARC56TestReturnTypes["foo"]>({
        method: "foo",
        ...methodParams,
        methodArgs: [methodParams.args.inputs],
      });
    },
    optInToApplication: (
      methodParams: TypedMethodParams = {},
    ): MethodParams<ARC56TestReturnTypes["optInToApplication"]> => {
      return this.getParams<ARC56TestReturnTypes["optInToApplication"]>({
        method: "optInToApplication",
        ...methodParams,
        methodArgs: [],
      });
    },
    createApplication: (
      methodParams: TypedMethodParams = {},
    ): MethodParams<ARC56TestReturnTypes["createApplication"]> => {
      return this.getParams<ARC56TestReturnTypes["createApplication"]>({
        method: "createApplication",
        ...methodParams,
        methodArgs: [],
      });
    },
  };

  call = {
    foo: async (
      methodParams: TypedMethodParams<{ inputs: Inputs }>,
    ): Promise<{
      result: MethodExecutionResult;
      returnValue: ARC56TestReturnTypes["foo"];
    }> => {
      return this.methodCall({
        method: "foo",
        ...methodParams,
        methodArgs: [methodParams.args.inputs],
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
      });
    },
  };
  optIn = {
    optInToApplication: async (
      methodParams: TypedMethodParams = {},
    ): Promise<{
      result: MethodExecutionResult;
      returnValue: ARC56TestReturnTypes["optInToApplication"];
    }> => {
      return this.methodCall({
        method: "optInToApplication",
        ...methodParams,
        methodArgs: [],
        onComplete: algosdk.OnApplicationComplete.OptInOC,
      });
    },
  };

  static create = {
    createApplication: async (
      params: {
        algod: algosdk.Algodv2;
        getSuggestedParams?: () => Promise<algosdk.SuggestedParams>;
      } & TypedCreateMethodParams & { templateVariables: TemplateVariables } & {
          onComplete?: algosdk.OnApplicationComplete;
        },
    ): Promise<{
      appClient: ARC56TestClient;
      result: MethodExecutionResult;
      returnValue: ARC56TestReturnTypes["createApplication"];
      appId: bigint;
      appAddress: algosdk.Address;
    }> => {
      const { appId, appAddress, result, returnValue } =
        await ARC56AppClient.createMethodCall({
          arc56: APP_SPEC,
          method: "createApplication",
          ...params,
          methodArgs: [],
        });
      return {
        appClient: new ARC56TestClient({
          appId,
          algod: params.algod,
          getSuggestedParams: params.getSuggestedParams,
        }),
        appId,
        appAddress,
        result,
        returnValue: returnValue as ARC56TestReturnTypes["createApplication"],
      };
    },
  };

  state = {
    /** Get all the global state */
    global: async (): Promise<ARC56TestGlobalState> => {
      return (await this.getState.global()) as ARC56TestGlobalState;
    },
    /** Get all of an account's local state */
    local: async (
      address: string | algosdk.Address | algosdk.AddressWithTransactionSigner,
    ): Promise<ARC56TestLocalState> => {
      return (await this.getState.local(address)) as ARC56TestLocalState;
    },
    /** Get all the box state */
    box: async (): Promise<ARC56TestBoxState> => {
      return (await this.getState.box()) as ARC56TestBoxState;
    },
    keys: {
      globalKey: async (): Promise<AVMUint64> => {
        return this.getState.key("globalKey");
      },
      localKey: async (
        address:
          string | algosdk.Address | algosdk.AddressWithTransactionSigner,
      ): Promise<AVMUint64> => {
        return this.getState.key("localKey", address);
      },
      boxKey: async (): Promise<string> => {
        return this.getState.key("boxKey");
      },
    },
    maps: {
      globalMap: {
        value: async (key: string): Promise<MapValue> => {
          return this.getState.map.value("globalMap", key);
        },
      },
      localMap: {
        value: async (
          address:
            string | algosdk.Address | algosdk.AddressWithTransactionSigner,
          key: AVMBytes,
        ): Promise<string> => {
          return this.getState.map.value("localMap", key, address);
        },
      },
      boxMap: {
        value: async (key: Inputs): Promise<Outputs> => {
          return this.getState.map.value("boxMap", key);
        },
      },
    },
  };

  decodeReturnValue = {
    foo: (rawValue: Uint8Array): ARC56TestReturnTypes["foo"] => {
      return this.decodeMethodReturnValue("foo", rawValue);
    },
  };
}

export default ARC56TestClient;
