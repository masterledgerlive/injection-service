import { ethers } from "ethers";
import type { Chain, InjectionResult, VerificationResult } from "./types";

/**
 * Blockchain Adapter
 * Provides unified interface to multiple blockchain networks
 * Handles RPC connections, transaction building, and verification
 */

export class BlockchainAdapter {
  private providers: Map<string, ethers.Provider> = new Map();
  private signers: Map<string, ethers.Signer> = new Map();
  private chains: Map<string, Chain> = new Map();

  constructor() {
    this.initializeChains();
  }

  /**
   * Initialize supported chains with their configurations
   */
  private initializeChains(): void {
    const chains: Chain[] = [
      {
        name: "ethereum",
        chainId: 1,
        rpcUrl: process.env.ETHEREUM_RPC || "",
        explorerUrl: "https://etherscan.io",
        gasMultiplier: 2.0,
        minGasPrice: 1n,
      },
      {
        name: "polygon",
        chainId: 137,
        rpcUrl: process.env.POLYGON_RPC || "",
        explorerUrl: "https://polygonscan.com",
        gasMultiplier: 0.1,
        minGasPrice: 1n,
      },
      {
        name: "arbitrum",
        chainId: 42161,
        rpcUrl: process.env.ARBITRUM_RPC || "",
        explorerUrl: "https://arbiscan.io",
        gasMultiplier: 0.2,
        minGasPrice: 1n,
      },
      {
        name: "optimism",
        chainId: 10,
        rpcUrl: process.env.OPTIMISM_RPC || "",
        explorerUrl: "https://optimistic.etherscan.io",
        gasMultiplier: 0.2,
        minGasPrice: 1n,
      },
      {
        name: "base",
        chainId: 8453,
        rpcUrl: process.env.BASE_RPC || "",
        explorerUrl: "https://basescan.org",
        gasMultiplier: 0.2,
        minGasPrice: 1n,
      },
    ];

    for (const chain of chains) {
      this.chains.set(chain.name, chain);
      if (chain.rpcUrl) {
        const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
        this.providers.set(chain.name, provider);

        // Initialize signer if private key is available
        if (process.env.INJECTOR_PRIVATE_KEY) {
          const signer = new ethers.Wallet(
            process.env.INJECTOR_PRIVATE_KEY,
            provider
          );
          this.signers.set(chain.name, signer);
        }
      }
    }
  }

  /**
   * Get provider for a specific chain
   */
  getProvider(chainName: string): ethers.Provider {
    const provider = this.providers.get(chainName);
    if (!provider) {
      throw new Error(`Provider not configured for chain: ${chainName}`);
    }
    return provider;
  }

  /**
   * Get signer for a specific chain
   */
  getSigner(chainName: string): ethers.Signer {
    const signer = this.signers.get(chainName);
    if (!signer) {
      throw new Error(`Signer not configured for chain: ${chainName}`);
    }
    return signer;
  }

  /**
   * Get chain configuration
   */
  getChain(chainName: string): Chain {
    const chain = this.chains.get(chainName);
    if (!chain) {
      throw new Error(`Chain not supported: ${chainName}`);
    }
    return chain;
  }

  /**
   * Get all supported chains
   */
  getSupportedChains(): string[] {
    return Array.from(this.chains.keys());
  }

  /**
   * Check if chain is supported
   */
  isChainSupported(chainName: string): boolean {
    return this.chains.has(chainName);
  }

  /**
   * Get current gas price for a chain
   */
  async getGasPrice(chainName: string): Promise<bigint> {
    const provider = this.getProvider(chainName);
    const feeData = await provider.getFeeData();

    if (!feeData.gasPrice) {
      throw new Error(`Could not fetch gas price for ${chainName}`);
    }

    return feeData.gasPrice;
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(
    chainName: string,
    to: string,
    data: string
  ): Promise<bigint> {
    const provider = this.getProvider(chainName);

    try {
      const gasEstimate = await provider.estimateGas({
        to,
        data,
        from: await this.getSigner(chainName).getAddress(),
      });

      return gasEstimate;
    } catch (error) {
      // Fallback estimate
      return BigInt(42000);
    }
  }

  /**
   * Calculate transaction cost
   */
  async calculateTransactionCost(
    chainName: string,
    data: string
  ): Promise<{ gasPrice: bigint; gasEstimate: bigint; totalCost: bigint }> {
    const gasPrice = await this.getGasPrice(chainName);
    const gasEstimate = await this.estimateGas(
      chainName,
      await this.getSigner(chainName).getAddress(),
      data
    );

    const totalCost = gasPrice * gasEstimate;

    return { gasPrice, gasEstimate, totalCost };
  }

  /**
   * Send transaction with memory data in calldata
   */
  async injectMemoryToCalldata(
    chainName: string,
    memoryData: string,
    recipientAddress: string
  ): Promise<InjectionResult> {
    const signer = this.getSigner(chainName);
    const chain = this.getChain(chainName);

    try {
      // Create transaction with memory data in calldata
      const tx = await signer.sendTransaction({
        to: recipientAddress,
        value: 0n,
        data: memoryData,
        gasLimit: BigInt(100000), // Adjust based on data size
      });

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction failed to be mined");
      }

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        chain: chainName,
        method: "calldata-injection",
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `Failed to inject memory to ${chainName}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Retrieve transaction and verify memory injection
   */
  async verifyInjection(
    chainName: string,
    txHash: string
  ): Promise<VerificationResult> {
    const provider = this.getProvider(chainName);

    try {
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!tx || !receipt) {
        return {
          verified: false,
          reason: "Transaction not found",
        };
      }

      return {
        verified: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? "success" : "failed",
        timestamp: (await provider.getBlock(receipt.blockNumber))?.timestamp || 0,
        data: tx.data,
      };
    } catch (error) {
      return {
        verified: false,
        reason: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  /**
   * Get transaction details
   */
  async getTransactionDetails(
    chainName: string,
    txHash: string
  ): Promise<any> {
    const provider = this.getProvider(chainName);

    try {
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);

      return {
        hash: tx?.hash,
        from: tx?.from,
        to: tx?.to,
        value: tx?.value.toString(),
        data: tx?.data,
        gasPrice: tx?.gasPrice.toString(),
        gasLimit: tx?.gasLimit.toString(),
        nonce: tx?.nonce,
        blockNumber: receipt?.blockNumber,
        blockHash: receipt?.blockHash,
        gasUsed: receipt?.gasUsed.toString(),
        status: receipt?.status === 1 ? "success" : "failed",
        confirmations: receipt ? (await provider.getBlockNumber()) - receipt.blockNumber : 0,
      };
    } catch (error) {
      throw new Error(
        `Failed to get transaction details: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get account balance
   */
  async getBalance(chainName: string, address: string): Promise<bigint> {
    const provider = this.getProvider(chainName);
    return provider.getBalance(address);
  }

  /**
   * Get network info
   */
  async getNetworkInfo(chainName: string): Promise<any> {
    const provider = this.getProvider(chainName);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await this.getGasPrice(chainName);

    return {
      name: network.name,
      chainId: network.chainId,
      blockNumber,
      gasPrice: gasPrice.toString(),
    };
  }
}

export default BlockchainAdapter;
