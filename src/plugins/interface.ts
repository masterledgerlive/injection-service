import type { MemoryStrand, InjectionResult, VerificationResult } from "../blockchain/types";

/**
 * Plugin Interface
 * Defines the contract for custom injection strategies
 */

export interface InjectionPlugin {
  /**
   * Plugin metadata
   */
  name: string;
  version: string;
  description: string;
  author: string;

  /**
   * Supported chains for this plugin
   */
  chains: string[];

  /**
   * Plugin initialization
   */
  initialize(): Promise<void>;

  /**
   * Plugin shutdown
   */
  shutdown(): Promise<void>;

  /**
   * Calculate cost for injection
   */
  calculateCost(
    strand: MemoryStrand,
    chain: string,
    options?: Record<string, any>
  ): Promise<{ amount: number; currency: string }>;

  /**
   * Execute injection
   */
  inject(
    strand: MemoryStrand,
    chain: string,
    recipientAddress: string,
    options?: Record<string, any>
  ): Promise<InjectionResult>;

  /**
   * Retrieve injected memory
   */
  retrieve(
    txHash: string,
    decryptionKey: string,
    options?: Record<string, any>
  ): Promise<MemoryStrand>;

  /**
   * Verify injection integrity
   */
  verify(
    txHash: string,
    chain: string,
    options?: Record<string, any>
  ): Promise<VerificationResult>;

  /**
   * Check if plugin is healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get plugin configuration schema
   */
  getConfigSchema(): Record<string, any>;

  /**
   * Validate configuration
   */
  validateConfig(config: Record<string, any>): Promise<boolean>;
}

/**
 * Base plugin class for easier implementation
 */
export abstract class BaseInjectionPlugin implements InjectionPlugin {
  abstract name: string;
  abstract version: string;
  abstract description: string;
  abstract author: string;
  abstract chains: string[];

  async initialize(): Promise<void> {
    // Override if needed
  }

  async shutdown(): Promise<void> {
    // Override if needed
  }

  abstract calculateCost(
    strand: MemoryStrand,
    chain: string,
    options?: Record<string, any>
  ): Promise<{ amount: number; currency: string }>;

  abstract inject(
    strand: MemoryStrand,
    chain: string,
    recipientAddress: string,
    options?: Record<string, any>
  ): Promise<InjectionResult>;

  abstract retrieve(
    txHash: string,
    decryptionKey: string,
    options?: Record<string, any>
  ): Promise<MemoryStrand>;

  abstract verify(
    txHash: string,
    chain: string,
    options?: Record<string, any>
  ): Promise<VerificationResult>;

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getConfigSchema(): Record<string, any> {
    return {};
  }

  async validateConfig(config: Record<string, any>): Promise<boolean> {
    return true;
  }
}

/**
 * Plugin Manager
 * Manages registration and execution of plugins
 */
export class PluginManager {
  private plugins: Map<string, InjectionPlugin> = new Map();
  private chainPluginMap: Map<string, string[]> = new Map();

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: InjectionPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }

    await plugin.initialize();
    this.plugins.set(plugin.name, plugin);

    // Map chains to plugins
    for (const chain of plugin.chains) {
      if (!this.chainPluginMap.has(chain)) {
        this.chainPluginMap.set(chain, []);
      }
      this.chainPluginMap.get(chain)!.push(plugin.name);
    }
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    await plugin.shutdown();
    this.plugins.delete(pluginName);

    // Remove from chain map
    for (const chain of plugin.chains) {
      const plugins = this.chainPluginMap.get(chain);
      if (plugins) {
        const index = plugins.indexOf(pluginName);
        if (index > -1) {
          plugins.splice(index, 1);
        }
      }
    }
  }

  /**
   * Get plugin by name
   */
  getPlugin(pluginName: string): InjectionPlugin {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    return plugin;
  }

  /**
   * Get plugins for a chain
   */
  getPluginsForChain(chain: string): InjectionPlugin[] {
    const pluginNames = this.chainPluginMap.get(chain) || [];
    return pluginNames
      .map((name) => this.plugins.get(name))
      .filter((p) => p !== undefined) as InjectionPlugin[];
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): InjectionPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Check plugin health
   */
  async checkPluginHealth(pluginName: string): Promise<boolean> {
    const plugin = this.getPlugin(pluginName);
    return plugin.healthCheck();
  }

  /**
   * Check all plugins health
   */
  async checkAllHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [name, plugin] of this.plugins) {
      health[name] = await plugin.healthCheck();
    }

    return health;
  }

  /**
   * Get plugin configuration schema
   */
  getPluginConfigSchema(pluginName: string): Record<string, any> {
    const plugin = this.getPlugin(pluginName);
    return plugin.getConfigSchema();
  }

  /**
   * Validate plugin configuration
   */
  async validatePluginConfig(
    pluginName: string,
    config: Record<string, any>
  ): Promise<boolean> {
    const plugin = this.getPlugin(pluginName);
    return plugin.validateConfig(config);
  }
}

export default PluginManager;
