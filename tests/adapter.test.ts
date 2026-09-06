import { describe, expect, it, vi } from "vitest";
import BlockchainAdapter, {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_RPC_DEFAULT,
  DEFAULT_CHAIN,
} from "../src/blockchain/adapter";
import CalldataInjectionPlugin from "../src/plugins/calldata-injection";
import { parseInjectionPayload } from "../src/payload";

const PROVIDER = "0x1111111111111111111111111111111111111111";
const RECEIPT_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("base-sepolia chain config", () => {
  it("defaults to base-sepolia chainId 84532 and public sepolia RPC, not mainnet 8453", () => {
    const adapter = new BlockchainAdapter();
    const sepolia = adapter.getChain(DEFAULT_CHAIN);
    expect(sepolia.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(sepolia.chainId).toBe(84532);
    expect(sepolia.rpcUrl).toBe(BASE_SEPOLIA_RPC_DEFAULT);
    expect(sepolia.rpcUrl).toBe("https://sepolia.base.org");

    const baseMainnet = adapter.getChain("base");
    expect(baseMainnet.chainId).toBe(8453);
    expect(baseMainnet.rpcUrl).toBe("");
  });

  it("lists base-sepolia on CalldataInjectionPlugin.chains", () => {
    const plugin = new CalldataInjectionPlugin();
    expect(plugin.chains).toContain("base-sepolia");
  });
});

describe("calldata payment tx", () => {
  it("sets tx.value = payAmountWei, to = provider, and uses the receipt hash", async () => {
    const adapter = new BlockchainAdapter();
    const sent: Array<{ to?: string; value?: bigint; data?: string }> = [];

    vi.spyOn(adapter, "getSigner").mockReturnValue({
      estimateGas: async () => 21000n,
      sendTransaction: async (tx: { to?: string; value?: bigint; data?: string }) => {
        sent.push(tx);
        return {
          hash: TX_HASH,
          value: tx.value,
          wait: async () => ({
            hash: RECEIPT_HASH,
            blockNumber: 424242,
            gasUsed: 21000n,
          }),
        };
      },
    } as never);

    const result = await adapter.injectMemoryToCalldata(
      "base-sepolia",
      "0x68656c6c6f",
      PROVIDER,
      77n
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(PROVIDER);
    expect(sent[0].value).toBe(77n);
    expect(sent[0].data).toBe("0x68656c6c6f");
    expect(result.txHash).toBe(RECEIPT_HASH);
    expect(result.txHash).not.toBe(TX_HASH);
    expect(result.blockNumber).toBe(424242);
    expect(result.paidWei).toBe("77");
    expect(result.provider).toBe(PROVIDER);
    expect(result.chain).toBe("base-sepolia");
  });

  it("refuses mainnet chainIds including Base 8453", async () => {
    const adapter = new BlockchainAdapter();
    await expect(
      adapter.injectMemoryToCalldata("base", "0x00", PROVIDER, 1n)
    ).rejects.toThrow(/mainnet chainId 8453/);
    await expect(
      adapter.injectMemoryToCalldata("ethereum", "0x00", PROVIDER, 1n)
    ).rejects.toThrow(/mainnet chainId 1/);
  });
});

describe("payload parse", () => {
  it("accepts hex bytes or base64", () => {
    expect(parseInjectionPayload({ bytes: "0x68656c6c6f" }).toString()).toBe(
      "hello"
    );
    expect(
      parseInjectionPayload({
        base64: Buffer.from("hello").toString("base64"),
      }).toString()
    ).toBe("hello");
    expect(parseInjectionPayload({ bytes: [0x01, 0x02] })).toEqual(
      Buffer.from([0x01, 0x02])
    );
  });
});
