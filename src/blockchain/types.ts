/**
 * Blockchain Types and Interfaces
 */

export interface Chain {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  gasMultiplier: number;
  minGasPrice: bigint;
}

export interface InjectionResult {
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  chain: string;
  method: string;
  timestamp: number;
}

export interface VerificationResult {
  verified: boolean;
  reason?: string;
  txHash?: string;
  blockNumber?: number;
  blockHash?: string | null;
  from?: string;
  to?: string | null;
  gasUsed?: string;
  status?: string;
  timestamp?: number;
  data?: string;
}

export interface TransactionCost {
  gasPrice: bigint;
  gasEstimate: bigint;
  totalCost: bigint;
}

export interface MemoryStrand {
  strandId: string;
  currentHash: string;
  previousHash?: string;
  compressedData: string;
  encryptionKeyHash: string;
  geometricAddress: string;
  resonanceStrength: number;
}

export interface InjectionPayload {
  strandId: string;
  chain: string;
  pricingModel: "pay-per-injection" | "subscription" | "freemium" | "iaas";
  accessControl: "public" | "paid" | "private";
  paymentMethod: "crypto" | "card";
  recipientAddress: string;
}

export interface InjectionRecord {
  injectionId: string;
  strandId: string;
  chain: string;
  txHash?: string;
  blockNumber?: number;
  status: "pending" | "processing" | "injected" | "failed";
  cost: string;
  currency: string;
  decryptionKey?: string;
  accessToken?: string;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface PricingCalculation {
  baseFee: number;
  dataSize: number;
  dataRate: number;
  chainMultiplier: number;
  totalCost: number;
  currency: string;
}

export interface PaymentRecord {
  paymentId: string;
  injectionId: string;
  amount: number;
  currency: string;
  method: "stripe" | "web3";
  status: "pending" | "completed" | "failed";
  transactionId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface AccessToken {
  token: string;
  strandId: string;
  decryptionKey: string;
  expiresAt: Date;
  revoked: boolean;
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  chains: string[];
  options?: Record<string, any>;
}
