import { describe, it, expect, vi } from "vitest";
import algosdk from "algosdk";
import nacl from "tweetnacl";
import { Localnet, type DispenserOpts } from "../src/localnet";

describe("Localnet client configuration", () => {
  it.each([
    {
      name: "default",
      opts: undefined,
      url: "http://localhost:8980/v2/accounts",
    },
    {
      name: "custom",
      opts: {
        indexer: {
          token: "custom-token",
          host: "http://127.0.0.1",
          port: "9999",
        },
      },
      url: "http://127.0.0.1:9999/v2/accounts",
    },
  ])("should use the $name indexer port", async ({ opts, url }) => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ accounts: [], "current-round": 0 }));
    try {
      await new Localnet(opts).indexer.searchAccounts().do();

      expect(fetchSpy).toHaveBeenCalledWith(url, expect.any(Object));
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("Localnet dispenser", () => {
  it.each([
    { name: "present", wallet1Index: 1, hasAlloc: true },
    { name: "missing from genesis", wallet1Index: undefined, hasAlloc: true },
    {
      name: "missing alloc in genesis",
      wallet1Index: undefined,
      hasAlloc: false,
    },
    { name: "missing from KMD", wallet1Index: 2, hasAlloc: true },
  ])(
    "uses strict Wallet1 selection when Wallet1 is $name",
    async ({ wallet1Index, hasAlloc }) => {
      const localnet = new Localnet();
      const accounts = Array.from({ length: 3 }, () => {
        const account = algosdk.generateAccount();
        return algosdk.addressWithSignersFromRawEd25519Signer({
          ed25519PublicKey: account.addr.publicKey,
          ed25519Signer: (bytes) =>
            Promise.resolve(nacl.sign.detached(bytes, account.sk)),
        });
      });
      // getLocalAccounts returns accounts in descending balance order.
      vi.spyOn(localnet, "getLocalAccounts").mockResolvedValue(
        accounts.slice(0, 2),
      );
      const genesisSpy = vi.spyOn(localnet.algod, "genesis").mockReturnValue({
        do: () =>
          Promise.resolve(
            JSON.stringify(
              hasAlloc
                ? {
                    alloc:
                      wallet1Index === undefined
                        ? []
                        : [
                            {
                              addr: accounts[wallet1Index]?.address.toString(),
                              comment: "Wallet1",
                            },
                          ],
                  }
                : {},
            ),
          ),
      } as ReturnType<typeof localnet.algod.genesis>);

      const optsToTest: Array<DispenserOpts | undefined> = [
        undefined,
        {},
        { account: "Wallet1" },
      ];
      for (const opts of optsToTest) {
        if (wallet1Index === 1) {
          expect(await localnet.dispenser(opts)).toBe(accounts[1]);
        } else {
          await expect(localnet.dispenser(opts)).rejects.toThrow(
            "Error retrieving LocalNet dispenser account; couldn't find the default account in KMD",
          );
        }
      }

      genesisSpy.mockClear();
      expect(await localnet.dispenser({ account: "highestBalance" })).toBe(
        accounts[0],
      );
      expect(genesisSpy).not.toHaveBeenCalled();
    },
  );

  it("throws when highestBalance has no local accounts", async () => {
    const localnet = new Localnet();
    vi.spyOn(localnet, "getLocalAccounts").mockResolvedValue([]);

    await expect(
      localnet.dispenser({ account: "highestBalance" }),
    ).rejects.toThrow("Unable to get dispenser!");
  });
});

describe("Localnet", () => {
  const localnet = new Localnet();
  it("should generate a funded account", async () => {
    const account = await localnet.generateAccount({ fund: 1_000_000n });

    const balance = (
      await localnet.algod.accountInformation(account.address).do()
    ).amount;

    expect(balance).toBe(1_000_000n);
  });
});
