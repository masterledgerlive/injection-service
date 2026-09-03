import { BaseInjectionPlugin } from "./interface";
import type { MemoryStrand, InjectionResult, VerificationResult } from "../blockchain/types";
import BlockchainAdapter from "../blockchain/adapter";
import PricingEngine, { loadPricingConfig } from "../pricing/engine";

/**
 * Calldata Injection Plugin
 * Injects memory strands into transaction calldata
 * This is the default, most efficient injection method
 */

export class CalldataInjectionPlugin extends BaseInjectionPlugin {
  name = "calldata-injection";
  version = "1.0.0";
  description =
    "Injects memory strands into transaction calldata for parasitic storage";
  author = "Manus AI";
  chains = [
    "base-sepolia",
    "ethereum",
    "polygon",
    "arbitrum",
    "optimism",
    "base",
  ];

  private blockchainAdapter: BlockchainAdapter;
  private pricingEngine: PricingEngine;

  constructor(
    blockchainAdapter?: BlockchainAdapter,
    pricingEngine?: PricingEngine
  ) {
    super();
    this.blockchainAdapter = blockchainAdapter ?? new BlockchainAdapter();
    this.pricingEngine = pricingEngine ?? new PricingEngine(loadPricingConfig());
  }

  async initialize(): Promise<void> {
    // Verify blockchain connections
    for (const chain of this.chains) {
      try {
        const provider = this.blockchainAdapter.getProvider(chain);
        const network = await provider.getNetwork();
        console.log(
          `[CalldataInjectionPlugin] Connected to ${chain} (chainId: ${network.chainId})`
        );
      } catch (error) {
        console.warn(
          `[CalldataInjectionPlugin] Warning: Could not connect to ${chain}`
        );
      }
    }
  }

  async calculateCost(
    strand: MemoryStrand,
    chain: string,
    options?: Record<string, any>
  ): Promise<{ amount: number; currency: string }> {
    // Estimate data size including overhead
    const dataSize = strand.compressedData.length + 256; // Add 256 bytes overhead

    const pricing = this.pricingEngine.calculatePayPerInjection(dataSize, chain);

    // Apply batch discount if applicable
    if (options?.batchSize && options.batchSize > 1) {
      const discount = this.pricingEngine.calculateBatchDiscount(
        pricing.totalCost,
        options.batchSize
      );
      return {
        amount: discount.discountedCost,
        currency: pricing.currency,
      };
    }

    return {
      amount: pricing.totalCost,
      currency: pricing.currency,
    };
  }

  async inject(
    strand: MemoryStrand,
    chain: string,
    recipientAddress: string,
    options?: Record<string, any>
  ): Promise<InjectionResult> {
    // Encode memory strand into calldata
    const calldata = this.encodeMemoryToCalldata(strand);

    const payAmountWei = parsePayAmountWei(options?.payAmountWei);

    const result = await this.blockchainAdapter.injectMemoryToCalldata(
      chain,
      calldata,
      recipientAddress,
      payAmountWei
    );

    return result;
  }

  async retrieve(
    txHash: string,
    decryptionKey: string,
    options?: Record<string, any>
  ): Promise<MemoryStrand> {
    const chain = options?.chain || "base-sepolia";

    // Get transaction details
    const txDetails = await this.blockchainAdapter.getTransactionDetails(
      chain,
      txHash
    );

    if (!txDetails.data) {
      throw new Error("No calldata found in transaction");
    }

    // Decode memory strand from calldata
    const strand = this.decodeMemoryFromCalldata(txDetails.data, decryptionKey);

    return strand;
  }

  async verify(
    txHash: string,
    chain: string,
    options?: Record<string, any>
  ): Promise<VerificationResult> {
    const result = await this.blockchainAdapter.verifyInjection(chain, txHash);

    if (result.verified && result.data) {
      // Additional verification: check if data contains valid memory strand
      try {
        const strand = this.decodeMemoryFromCalldata(
          result.data,
          options?.decryptionKey || ""
        );
        return {
          ...result,
          verified: !!strand,
        };
      } catch {
        return {
          ...result,
          verified: false,
          reason: "Invalid memory strand format in calldata",
        };
      }
    }

    return result;
  }

  async healthCheck(): Promise<boolean> {
    try {
      let checked = false;
      for (const chain of this.chains) {
        try {
          const provider = this.blockchainAdapter.getProvider(chain);
          const blockNumber = await provider.getBlockNumber();
          checked = true;
          if (blockNumber <= 0) {
            return false;
          }
        } catch {
          // Skip chains without a configured provider (v0 defaults to base-sepolia).
        }
      }
      return checked;
    } catch {
      return false;
    }
  }

  getConfigSchema(): Record<string, any> {
    return {
      type: "object",
      properties: {
        maxCalldataSize: {
          type: "number",
          description: "Maximum calldata size in bytes",
          default: 128000,
        },
        compressionLevel: {
          type: "number",
          description: "Compression level (1-9)",
          default: 6,
        },
        encryptionAlgorithm: {
          type: "string",
          description: "Encryption algorithm",
          enum: ["AES-256-GCM", "ChaCha20-Poly1305"],
          default: "AES-256-GCM",
        },
      },
    };
  }

  async validateConfig(config: Record<string, any>): Promise<boolean> {
    if (config.maxCalldataSize && config.maxCalldataSize < 1000) {
      return false;
    }
    if (config.compressionLevel && (config.compressionLevel < 1 || config.compressionLevel > 9)) {
      return false;
    }
    return true;
  }

  /**
   * Encode memory strand into calldata format
   */
  private encodeMemoryToCalldata(strand: MemoryStrand): string {
    // Create a structured format for calldata
    const payload = {
      version: 1,
      type: "memory-strand",
      strandId: strand.strandId,
      currentHash: strand.currentHash,
      previousHash: strand.previousHash,
      geometricAddress: strand.geometricAddress,
      resonanceStrength: strand.resonanceStrength,
      compressedData: strand.compressedData,
      encryptionKeyHash: strand.encryptionKeyHash,
      timestamp: Date.now(),
    };

    // Encode as hex
    const jsonString = JSON.stringify(payload);
    const hexString = "0x" + Buffer.from(jsonString).toString("hex");

    return hexString;
  }

  /**
   * Decode memory strand from calldata
   */
  private decodeMemoryFromCalldata(
    calldata: string,
    decryptionKey: string
  ): MemoryStrand {
    try {
      // Remove 0x prefix if present
      const hexString = calldata.startsWith("0x") ? calldata.slice(2) : calldata;

      // Decode from hex
      const jsonString = Buffer.from(hexString, "hex").toString("utf-8");
      const payload = JSON.parse(jsonString);

      if (payload.type !== "memory-strand") {
        throw new Error("Invalid memory strand format");
      }

      return {
        strandId: payload.strandId,
        currentHash: payload.currentHash,
        previousHash: payload.previousHash,
        compressedData: payload.compressedData,
        encryptionKeyHash: payload.encryptionKeyHash,
        geometricAddress: payload.geometricAddress,
        resonanceStrength: payload.resonanceStrength,
      };
    } catch (error) {
      throw new Error(
        `Failed to decode memory strand: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

function parsePayAmountWei(value: unknown): bigint {
  if (value === undefined || value === null || value === "") {
    return 0n;
  }
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error("payAmountWei must be non-negative");
    }
    return value;
  }
  const asString = String(value);
  if (!/^[0-9]+$/.test(asString)) {
    throw new Error("payAmountWei must be a non-negative integer");
  }
  return BigInt(asString);
}

export default CalldataInjectionPlugin;
