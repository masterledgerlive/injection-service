import express from "express";
import dotenv from "dotenv";
import BlockchainAdapter from "./blockchain/adapter";
import PricingEngine from "./pricing/engine";
import { PluginManager } from "./plugins/interface";
import CalldataInjectionPlugin from "./plugins/calldata-injection";
import TokenManager from "./access-control/token-manager";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Initialize services
const blockchainAdapter = new BlockchainAdapter();
const pricingEngine = new PricingEngine({
  baseFeeUSD: parseFloat(process.env.BASE_FEE_USD || "0.50"),
  dataRatePerKB: parseFloat(process.env.DATA_RATE_PER_KB || "0.10"),
  chainMultipliers: {
    ethereum: parseFloat(process.env.ETHEREUM_MULTIPLIER || "2.0"),
    polygon: parseFloat(process.env.POLYGON_MULTIPLIER || "0.1"),
    arbitrum: parseFloat(process.env.ARBITRUM_MULTIPLIER || "0.2"),
    optimism: parseFloat(process.env.OPTIMISM_MULTIPLIER || "0.2"),
    base: parseFloat(process.env.BASE_MULTIPLIER || "0.2"),
  },
});
const pluginManager = new PluginManager();
const tokenManager = new TokenManager();

/**
 * Initialize plugins
 */
async function initializePlugins(): Promise<void> {
  try {
    const calldataPlugin = new CalldataInjectionPlugin();
    await pluginManager.registerPlugin(calldataPlugin);
    console.log("[Service] Calldata Injection Plugin registered");
  } catch (error) {
    console.error("[Service] Failed to register plugins:", error);
  }
}

/**
 * Health check endpoint
 */
app.get("/health", async (req, res) => {
  try {
    const pluginHealth = await pluginManager.checkAllHealth();
    const supportedChains = blockchainAdapter.getSupportedChains();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      plugins: pluginHealth,
      chains: supportedChains,
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get supported chains
 */
app.get("/api/chains", (req, res) => {
  const chains = blockchainAdapter.getSupportedChains();
  res.json({ chains });
});

/**
 * Calculate injection cost
 */
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
 * Submit injection request
 */
app.post("/api/inject", async (req, res) => {
  try {
    const {
      strandId,
      chain,
      pricingModel,
      accessControl,
      paymentMethod,
      recipientAddress,
    } = req.body;

    if (!strandId || !chain || !recipientAddress) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get plugin for chain
    const plugins = pluginManager.getPluginsForChain(chain);
    if (plugins.length === 0) {
      return res
        .status(400)
        .json({ error: `No plugins available for chain: ${chain}` });
    }

    const plugin = plugins[0]; // Use first available plugin

    // Mock memory strand for demonstration
    const mockStrand = {
      strandId,
      currentHash: `0x${Math.random().toString(16).slice(2)}`,
      previousHash: undefined,
      compressedData: "mock-compressed-data",
      encryptionKeyHash: `0x${Math.random().toString(16).slice(2)}`,
      geometricAddress: "(0.123, 0.456, 0.789, 0.012)",
      resonanceStrength: 850,
    };

    // Calculate cost
    const costResult = await plugin.calculateCost(mockStrand, chain);

    // Generate access token
    const decryptionKey = tokenManager.generateDecryptionKey(
      strandId,
      process.env.INJECTOR_PRIVATE_KEY || "default"
    );
    const accessToken = tokenManager.generateAccessToken(strandId, decryptionKey);

    // Return injection request details
    res.json({
      injectionId: `inj_${Math.random().toString(36).slice(2)}`,
      strandId,
      chain,
      cost: costResult.amount,
      currency: costResult.currency,
      pricingModel,
      accessControl,
      paymentMethod,
      accessToken: accessToken.token,
      decryptionKey,
      status: "awaiting_payment",
      estimatedTime: "2-5 minutes",
      paymentUrl: `https://payment.example.com/pay/${strandId}`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Injection failed",
    });
  }
});

/**
 * Get injection status
 */
app.get("/api/injection/:injectionId", (req, res) => {
  const { injectionId } = req.params;

  // Mock response for demonstration
  res.json({
    injectionId,
    strandId: "abc123",
    status: "injected",
    txHash: `0x${Math.random().toString(16).slice(2)}`,
    chain: "ethereum",
    blockNumber: 12345678,
    decryptionKey: `0x${Math.random().toString(16).slice(2)}`,
    accessToken: "eyJ...",
    proofOfInjection: {
      verified: true,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Retrieve injected memory
 */
app.get("/api/retrieve/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;
    const { chain, decryptionKey } = req.query;

    if (!chain || !decryptionKey) {
      return res
        .status(400)
        .json({ error: "Missing chain or decryptionKey" });
    }

    // Get plugin for chain
    const plugins = pluginManager.getPluginsForChain(chain as string);
    if (plugins.length === 0) {
      return res
        .status(400)
        .json({ error: `No plugins available for chain: ${chain}` });
    }

    const plugin = plugins[0];

    // Mock retrieval for demonstration
    const strand = await plugin.retrieve(
      txHash,
      decryptionKey as string,
      { chain }
    );

    res.json({
      strandId: strand.strandId,
      geometricAddress: strand.geometricAddress,
      resonanceStrength: strand.resonanceStrength,
      currentHash: strand.currentHash,
      compressedData: strand.compressedData,
      injectedAt: new Date().toISOString(),
      chain,
      blockNumber: 12345678,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Retrieval failed",
    });
  }
});

/**
 * Get plugin information
 */
app.get("/api/plugins", (req, res) => {
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

/**
 * Get plugin details
 */
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

/**
 * Error handling middleware
 */
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("[Error]", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
);

/**
 * Start server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize plugins
    await initializePlugins();

    // Start listening
    app.listen(port, () => {
      console.log(
        `[Service] Injection Service running on http://localhost:${port}`
      );
      console.log(
        `[Service] Health check: http://localhost:${port}/health`
      );
      console.log(
        `[Service] API docs: http://localhost:${port}/api/chains`
      );
    });
  } catch (error) {
    console.error("[Service] Failed to start:", error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
