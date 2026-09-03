import type { PricingCalculation } from "../blockchain/types";

/**
 * Pricing Engine
 * Calculates injection costs based on multiple pricing models
 */

export interface PricingConfig {
  baseFeeUSD: number;
  dataRatePerKB: number;
  chainMultipliers: Record<string, number>;
}

export function loadPricingConfig(): PricingConfig {
  const baseMultiplier = parseFloat(process.env.BASE_MULTIPLIER || "0.2");
  return {
    baseFeeUSD: parseFloat(process.env.BASE_FEE_USD || "0.50"),
    dataRatePerKB: parseFloat(process.env.DATA_RATE_PER_KB || "0.10"),
    chainMultipliers: {
      ethereum: parseFloat(process.env.ETHEREUM_MULTIPLIER || "2.0"),
      polygon: parseFloat(process.env.POLYGON_MULTIPLIER || "0.1"),
      arbitrum: parseFloat(process.env.ARBITRUM_MULTIPLIER || "0.2"),
      optimism: parseFloat(process.env.OPTIMISM_MULTIPLIER || "0.2"),
      base: baseMultiplier,
      "base-sepolia": parseFloat(
        process.env.BASE_SEPOLIA_MULTIPLIER || String(baseMultiplier)
      ),
    },
  };
}

export class PricingEngine {
  private config: PricingConfig;

  constructor(config: PricingConfig) {
    this.config = config;
  }

  /**
   * Calculate cost for pay-per-injection model
   * Cost = (base_fee + data_size * rate) * chain_multiplier
   */
  calculatePayPerInjection(
    dataSizeBytes: number,
    chain: string
  ): PricingCalculation {
    const dataSizeKB = dataSizeBytes / 1024;
    const chainMultiplier = this.config.chainMultipliers[chain] || 1.0;

    const dataFee = dataSizeKB * this.config.dataRatePerKB;
    const totalCost = (this.config.baseFeeUSD + dataFee) * chainMultiplier;

    return {
      baseFee: this.config.baseFeeUSD,
      dataSize: dataSizeBytes,
      dataRate: this.config.dataRatePerKB,
      chainMultiplier,
      totalCost: Math.round(totalCost * 100) / 100, // Round to 2 decimals
      currency: "USD",
    };
  }

  /**
   * Calculate cost for subscription model
   * Fixed monthly fee, unlimited injections
   */
  calculateSubscriptionCost(
    subscriptionTierUSD: number = 99
  ): PricingCalculation {
    return {
      baseFee: subscriptionTierUSD,
      dataSize: 0,
      dataRate: 0,
      chainMultiplier: 1.0,
      totalCost: subscriptionTierUSD,
      currency: "USD",
    };
  }

  /**
   * Calculate cost for freemium model
   * Free for public, paid for private
   */
  calculateFreemiumCost(
    dataSizeBytes: number,
    chain: string,
    isPrivate: boolean
  ): PricingCalculation {
    if (!isPrivate) {
      // Public data is free
      return {
        baseFee: 0,
        dataSize: dataSizeBytes,
        dataRate: 0,
        chainMultiplier: 1.0,
        totalCost: 0,
        currency: "USD",
      };
    }

    // Private data uses standard pricing
    return this.calculatePayPerInjection(dataSizeBytes, chain);
  }

  /**
   * Calculate cost for IaaS model
   * Operator charges users, Manus takes 30%
   */
  calculateIaaSCost(
    dataSizeBytes: number,
    chain: string,
    operatorMarkupPercent: number = 50
  ): {
    userCost: number;
    operatorRevenue: number;
    manusRevenue: number;
  } {
    const baseCost = this.calculatePayPerInjection(dataSizeBytes, chain);
    const userCost = baseCost.totalCost * (1 + operatorMarkupPercent / 100);
    const operatorRevenue = userCost * 0.7;
    const manusRevenue = userCost * 0.3;

    return {
      userCost: Math.round(userCost * 100) / 100,
      operatorRevenue: Math.round(operatorRevenue * 100) / 100,
      manusRevenue: Math.round(manusRevenue * 100) / 100,
    };
  }

  /**
   * Calculate batch discount
   * Multiple injections in one batch get discount
   */
  calculateBatchDiscount(
    baseCost: number,
    batchSize: number
  ): { discountedCost: number; discountPercent: number } {
    let discountPercent = 0;

    if (batchSize >= 100) discountPercent = 30;
    else if (batchSize >= 50) discountPercent = 20;
    else if (batchSize >= 10) discountPercent = 10;
    else if (batchSize >= 5) discountPercent = 5;

    const discountedCost =
      baseCost * (1 - discountPercent / 100);

    return {
      discountedCost: Math.round(discountedCost * 100) / 100,
      discountPercent,
    };
  }

  /**
   * Calculate gas cost in USD
   * Requires current gas price and ETH/USD rate
   */
  calculateGasCostUSD(
    gasUsed: bigint,
    gasPrice: bigint,
    ethUSDRate: number
  ): number {
    const gasCostWei = gasUsed * gasPrice;
    const gasCostETH = Number(gasCostWei) / 1e18;
    const gasCostUSD = gasCostETH * ethUSDRate;

    return Math.round(gasCostUSD * 100) / 100;
  }

  /**
   * Get all supported chains and their multipliers
   */
  getSupportedChains(): Record<string, number> {
    return this.config.chainMultipliers;
  }

  /**
   * Update pricing configuration
   */
  updateConfig(newConfig: Partial<PricingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): PricingConfig {
    return { ...this.config };
  }

  /**
   * Calculate ROI for operator
   */
  calculateOperatorROI(
    injectionCount: number,
    avgDataSizeBytes: number,
    avgChain: string,
    operatorMarkupPercent: number = 50
  ): {
    totalUserCost: number;
    operatorRevenue: number;
    manusRevenue: number;
    avgCostPerInjection: number;
  } {
    const avgCost = this.calculatePayPerInjection(avgDataSizeBytes, avgChain);
    const iaas = this.calculateIaaSCost(
      avgDataSizeBytes,
      avgChain,
      operatorMarkupPercent
    );

    return {
      totalUserCost: iaas.userCost * injectionCount,
      operatorRevenue: iaas.operatorRevenue * injectionCount,
      manusRevenue: iaas.manusRevenue * injectionCount,
      avgCostPerInjection: avgCost.totalCost,
    };
  }
}

export default PricingEngine;
