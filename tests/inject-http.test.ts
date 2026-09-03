import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { PluginManager, type InjectionPlugin } from "../src/plugins/interface";
import type { InjectionResult, MemoryStrand } from "../src/blockchain/types";

const PROVIDER = "0x1111111111111111111111111111111111111111";
const RECEIPT_HASH =
  "0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface";
const RECEIPT_BLOCK = 22223333;

const RECEIPT: InjectionResult = {
  txHash: RECEIPT_HASH,
  blockNumber: RECEIPT_BLOCK,
  gasUsed: "21000",
  chain: "base-sepolia",
  method: "calldata-injection",
  timestamp: 1_700_000_000_000,
  paidWei: "12345",
  provider: PROVIDER,
};

function mockPlugin(
  injectImpl?: InjectionPlugin["inject"]
): InjectionPlugin & { inject: Mock } {
  const inject = vi.fn(injectImpl ?? (async () => RECEIPT));

  return {
    name: "calldata-injection",
    version: "1.0.0",
    description: "test plugin",
    author: "test",
    chains: ["base-sepolia"],
    initialize: async () => undefined,
    shutdown: async () => undefined,
    calculateCost: async () => ({ amount: 0.5, currency: "USD" }),
    inject,
    retrieve: async () =>
      ({
        strandId: "s1",
        currentHash: "0xabc",
        compressedData: "aGVsbG8=",
        encryptionKeyHash: "0x00",
        geometricAddress: "",
        resonanceStrength: 0,
      }) satisfies MemoryStrand,
    verify: async () => ({ verified: true, txHash: RECEIPT_HASH, blockNumber: RECEIPT_BLOCK }),
    healthCheck: async () => true,
    getConfigSchema: () => ({}),
    validateConfig: async () => true,
  };
}

async function listen(app: Express): Promise<{
  server: Server;
  base: string;
}> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        )
    )
  );
});

describe("v0 HTTP inject uses receipt hashes only", () => {
  it("POST /api/inject calls plugin.inject with real payload bytes and returns the receipt hash", async () => {
    const plugin = mockPlugin();
    const pluginManager = new PluginManager();
    await pluginManager.registerPlugin(plugin);

    const { app } = await createApp({ pluginManager });
    const { server, base } = await listen(app);
    servers.push(server);

    const res = await fetch(`${base}/api/inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bytes: "0x68656c6c6f",
        provider: PROVIDER,
        payAmountWei: "12345",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(plugin.inject).toHaveBeenCalledTimes(1);
    const [strand, chain, to, options] = plugin.inject.mock.calls[0];
    expect(chain).toBe("base-sepolia");
    expect(to).toBe(PROVIDER);
    expect(options?.payAmountWei).toBe("12345");
    expect(strand.compressedData).toBe(Buffer.from("hello").toString("base64"));

    expect(body.txHash).toBe(RECEIPT_HASH);
    expect(body.blockNumber).toBe(RECEIPT_BLOCK);
    expect(body.paidWei).toBe("12345");
    expect(body.provider).toBe(PROVIDER);
    expect(body.claimReceipt.txHash).toBe(RECEIPT_HASH);
    expect(body.txHash).not.toMatch(/^0x[0-9a-f]{1,12}$/);

    const decoded = jwt.decode(body.accessToken) as {
      metadata: {
        txHash: string;
        blockNumber: number;
        chain: string;
        paidWei: string;
        provider: string;
      };
    };
    expect(decoded.metadata).toEqual({
      txHash: RECEIPT_HASH,
      blockNumber: RECEIPT_BLOCK,
      chain: "base-sepolia",
      paidWei: "12345",
      provider: PROVIDER,
    });
  });

  it("fails if a handler would return a hash that was not from a receipt", async () => {
    const plugin = mockPlugin(async () => ({
      ...RECEIPT,
      txHash: "",
    }));
    const pluginManager = new PluginManager();
    await pluginManager.registerPlugin(plugin);
    const { app } = await createApp({ pluginManager });
    const { server, base } = await listen(app);
    servers.push(server);

    const res = await fetch(`${base}/api/inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: Buffer.from("payload").toString("base64"),
        provider: PROVIDER,
      }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.txHash).toBeUndefined();
    expect(body.error).toMatch(/receipt hash/i);
  });

  it("GET /api/injection/:id reads the in-memory Map and 404s unknown ids without inventing a hash", async () => {
    const plugin = mockPlugin();
    const pluginManager = new PluginManager();
    await pluginManager.registerPlugin(plugin);
    const { app } = await createApp({ pluginManager });
    const { server, base } = await listen(app);
    servers.push(server);

    const created = await fetch(`${base}/api/inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bytes: [0x01, 0x02, 0x03],
        provider: PROVIDER,
      }),
    });
    const injected = await created.json();

    const first = await fetch(`${base}/api/injection/${injected.injectionId}`);
    const second = await fetch(`${base}/api/injection/${injected.injectionId}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = await first.json();
    const b = await second.json();
    expect(a.txHash).toBe(RECEIPT_HASH);
    expect(b.txHash).toBe(a.txHash);

    const missing = await fetch(`${base}/api/injection/inj_does_not_exist`);
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    expect(missingBody.txHash).toBeUndefined();
    expect(missingBody.error).toBe("Injection not found");
  });

  it("GET /api/retrieve uses the chain block number, not a hardcoded 12345678", async () => {
    const plugin = mockPlugin();
    const pluginManager = new PluginManager();
    await pluginManager.registerPlugin(plugin);

    const blockchainAdapter = {
      getSupportedChains: () => ["base-sepolia"],
      getTransactionDetails: async () => ({
        hash: RECEIPT_HASH,
        blockNumber: 88887777,
        data: "0x00",
      }),
    };

    const { app } = await createApp({
      pluginManager,
      blockchainAdapter: blockchainAdapter as never,
    });
    const { server, base } = await listen(app);
    servers.push(server);

    const res = await fetch(
      `${base}/api/retrieve/${RECEIPT_HASH}?chain=base-sepolia&decryptionKey=0xkey`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blockNumber).toBe(88887777);
    expect(body.blockNumber).not.toBe(12345678);
    expect(body.txHash).toBe(RECEIPT_HASH);
  });

  it("rejects inject without bytes or base64", async () => {
    const plugin = mockPlugin();
    const pluginManager = new PluginManager();
    await pluginManager.registerPlugin(plugin);
    const { app } = await createApp({ pluginManager });
    const { server, base } = await listen(app);
    servers.push(server);

    const res = await fetch(`${base}/api/inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: PROVIDER }),
    });
    expect(res.status).toBe(400);
    expect(plugin.inject).not.toHaveBeenCalled();
  });
});

describe("source lock: handlers must not invent hashes", () => {
  it("app.ts does not use Math.random or hardcoded block 12345678", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const appSrc = readFileSync(join(root, "src/app.ts"), "utf8");
    expect(appSrc).not.toMatch(/Math\.random/);
    expect(appSrc).not.toMatch(/12345678/);
    expect(appSrc).not.toMatch(/mockStrand/);
  });
});
