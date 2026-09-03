import express from "express";
import { ethers } from "ethers";
import { nanoid } from "nanoid";
import BlockchainAdapter, { DEFAULT_CHAIN } from "./blockchain/adapter";
import type { InjectionRecord, MemoryStrand } from "./blockchain/types";
import PricingEngine, { loadPricingConfig } from "./pricing/engine";
import { PluginManager } from "./plugins/interface";
import CalldataInjectionPlugin from "./plugins/calldata-injection";
import TokenManager from "./access-control/token-manager";
import { parseInjectionPayload, parsePayAmountWei } from "./payload";

export type InjectionStore = Map<string, InjectionRecord>;

export interface CreateAppOptions {
  blockchainAdapter?: BlockchainAdapter;
  pluginManager?: PluginManager;
  tokenManager?: TokenManager;
  pricingEngine?: PricingEngine;
  injectionStore?: InjectionStore;
}

export interface CreatedApp {
  app: express.Express;
  injectionStore: InjectionStore;
  blockchainAdapter: BlockchainAdapter;
  tokenManager: TokenManager;
  pluginManager: PluginManager;
}

function serializeRecord(record: InjectionRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
  };
}

function buildStrandFromPayload(
  payload: Buffer,
  strandId: string,
  extra?: Partial<MemoryStrand>
): MemoryStrand {
  return {
    strandId,
    currentHash: ethers.keccak256(payload),
    previousHash: extra?.previousHash,
    compressedData: payload.toString("base64"),
    encryptionKeyHash: extra?.encryptionKeyHash || ethers.keccak256(ethers.toUtf8Bytes(strandId)),
    geometricAddress: extra?.geometricAddress || "",
    resonanceStrength: extra?.resonanceStrength ?? 0,
  };
}

export async function createApp(
  options: CreateAppOptions = {}
): Promise<CreatedApp> {
  const injectionStore: InjectionStore =
    options.injectionStore ?? new Map<string, InjectionRecord>();
  const blockchainAdapter =
    options.blockchainAdapter ?? new BlockchainAdapter();
  const pricingEngine =
    options.pricingEngine ?? new PricingEngine(loadPricingConfig());
  const tokenManager = options.tokenManager ?? new TokenManager();
  const pluginManager = options.pluginManager ?? new PluginManager();

  if (!options.pluginManager) {
    const calldataPlugin = new CalldataInjectionPlugin(
      blockchainAdapter,
      pricingEngine
    );
    await pluginManager.registerPlugin(calldataPlugin);
  }

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", async (_req, res) => {
    try {
      const pluginHealth = await pluginManager.checkAllHealth();
      const supportedChains = blockchainAdapter.getSupportedChains();

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        plugins: pluginHealth,
        chains: supportedChains,
        defaultChain: DEFAULT_CHAIN,
      });
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/chains", (_req, res) => {
    const chains = blockchainAdapter.getSupportedChains();
    res.json({ chains, defaultChain: DEFAULT_CHAIN });
  });

  app.post("/api/calculate-cost", (req, res) => {
    try {
      const { dataSizeBytes, chain, pricingModel } = req.body;

      if (!dataSizeBytes || !chain) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let pricing;

      switch (pricingModel) {
        case "subscription":
          pricing = pricingEngine.calculateSubscriptionCost();
          break;
        case "freemium":
          pricing = pricingEngine.calculateFreemiumCost(
            dataSizeBytes,
            chain,
            req.body.isPrivate
          );
          break;
        case "iaas":
          const iaas = pricingEngine.calculateIaaSCost(dataSizeBytes, chain);
          return res.json(iaas);
        default:
          pricing = pricingEngine.calculatePayPerInjection(dataSizeBytes, chain);
      }

      res.json(pricing);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Calculation failed",
      });
    }
  });

  /**
   * Submit injection: encode payload, send calldata tx (value = payAmountWei) to provider.
   * Claim receipt is JWT metadata from the mined receipt — never a generated hash.
   */
  app.post("/api/inject", async (req, res) => {
    try {
      const chain = (req.body.chain as string | undefined) || DEFAULT_CHAIN;
      const providerAddress =
        (req.body.provider as string | undefined) ||
        (req.body.recipientAddress as string | undefined);

      if (!providerAddress || !ethers.isAddress(providerAddress)) {
        return res
          .status(400)
          .json({ error: "Missing or invalid provider address" });
      }

      let payload: Buffer;
      let payAmountWei: string;
      try {
        payload = parseInjectionPayload(req.body);
        payAmountWei = parsePayAmountWei(req.body.payAmountWei);
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Invalid payload",
        });
      }

      const plugins = pluginManager.getPluginsForChain(chain);
      if (plugins.length === 0) {
        return res
          .status(400)
          .json({ error: `No plugins available for chain: ${chain}` });
      }

      const plugin = plugins[0];
      const strandId =
        (req.body.strandId as string | undefined) || `strand_${nanoid()}`;
      const strand = buildStrandFromPayload(payload, strandId, req.body.strand);

      const costResult = await plugin.calculateCost(strand, chain);
      const result = await plugin.inject(strand, chain, providerAddress, {
        payAmountWei,
      });

      if (!result?.txHash) {
        return res.status(502).json({
          error: "Injection did not return a receipt hash",
        });
      }

      const decryptionKey = tokenManager.generateDecryptionKey(
        strandId,
        process.env.INJECTOR_PRIVATE_KEY || "default"
      );
      const accessToken = tokenManager.generateAccessToken(
        strandId,
        decryptionKey,
        {
          metadata: {
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            chain: result.chain,
            paidWei: result.paidWei ?? payAmountWei,
            provider: result.provider ?? providerAddress,
          },
        }
      );

      const injectionId = `inj_${nanoid()}`;
      const record: InjectionRecord = {
        injectionId,
        strandId,
        chain: result.chain,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        status: "injected",
        cost: String(costResult.amount),
        currency: costResult.currency,
        decryptionKey,
        accessToken: accessToken.token,
        createdAt: new Date(),
        completedAt: new Date(),
        paidWei: result.paidWei ?? payAmountWei,
        provider: result.provider ?? providerAddress,
      };

      injectionStore.set(injectionId, record);

      res.json({
        injectionId,
        strandId,
        chain: record.chain,
        status: record.status,
        txHash: record.txHash,
        blockNumber: record.blockNumber,
        paidWei: record.paidWei,
        provider: record.provider,
        cost: record.cost,
        currency: record.currency,
        accessToken: record.accessToken,
        decryptionKey,
        claimReceipt: {
          txHash: record.txHash,
          blockNumber: record.blockNumber,
          chain: record.chain,
          paidWei: record.paidWei,
          provider: record.provider,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Injection failed",
      });
    }
  });

  app.get("/api/injection/:injectionId", (req, res) => {
    const record = injectionStore.get(req.params.injectionId);
    if (!record) {
      return res.status(404).json({ error: "Injection not found" });
    }
    res.json(serializeRecord(record));
  });

  app.get("/api/retrieve/:txHash", async (req, res) => {
    try {
      const { txHash } = req.params;
      const { chain, decryptionKey } = req.query;

      if (!chain || !decryptionKey) {
        return res
          .status(400)
          .json({ error: "Missing chain or decryptionKey" });
      }

      const plugins = pluginManager.getPluginsForChain(chain as string);
      if (plugins.length === 0) {
        return res
          .status(400)
          .json({ error: `No plugins available for chain: ${chain}` });
      }

      const plugin = plugins[0];
      const strand = await plugin.retrieve(txHash, decryptionKey as string, {
        chain,
      });

      const txDetails = await blockchainAdapter.getTransactionDetails(
        chain as string,
        txHash
      );

      res.json({
        strandId: strand.strandId,
        geometricAddress: strand.geometricAddress,
        resonanceStrength: strand.resonanceStrength,
        currentHash: strand.currentHash,
        compressedData: strand.compressedData,
        injectedAt: new Date().toISOString(),
        chain,
        blockNumber: txDetails.blockNumber,
        txHash: txDetails.hash || txHash,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Retrieval failed",
      });
    }
  });

  app.get("/api/plugins", (_req, res) => {
    const plugins = pluginManager.getAllPlugins();

    res.json({
      plugins: plugins.map((p) => ({
        name: p.name,
        version: p.version,
        description: p.description,
        author: p.author,
        chains: p.chains,
      })),
    });
  });

  app.get("/api/plugins/:pluginName", (req, res) => {
    try {
      const plugin = pluginManager.getPlugin(req.params.pluginName);

      res.json({
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        chains: plugin.chains,
        configSchema: plugin.getConfigSchema(),
      });
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : "Plugin not found",
      });
    }
  });

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("[Error]", err);
      res.status(500).json({
        error: "Internal server error",
        message: err.message,
      });
    }
  );

  return {
    app,
    injectionStore,
    blockchainAdapter,
    tokenManager,
    pluginManager,
  };
}

export default createApp;
