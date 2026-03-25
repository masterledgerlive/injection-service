# Injection Service: Blockchain-Agnostic Memory Deployment

Deploy memory strands from the Unified Indexer to any blockchain. Pluggable pricing models, multi-chain support, and tokenized access control.

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure blockchain RPC endpoints
cp .env.example .env
# Edit .env with your RPC URLs and payment processor keys

# Start the service
pnpm dev

# API available at http://localhost:3001
```

## Core Features

- **Multi-Chain Support**: Ethereum, Polygon, Arbitrum, Optimism, Base, Solana, Bitcoin
- **Pluggable Pricing**: Pay-per-injection, subscriptions, freemium, IaaS models
- **Tokenized Access**: JWT tokens, decryption keys, revocable access
- **Payment Processing**: Stripe (fiat), Web3 wallets (crypto)
- **Plugin System**: Extensible injection strategies
- **Batch Optimization**: Reduce costs through transaction bundling

## Architecture

```
Memory Strand (from Indexer)
         ↓
    Pricing Engine (calculate cost)
         ↓
   Payment Processor (collect payment)
         ↓
   Access Control (generate keys/tokens)
         ↓
   Blockchain Adapter (select chain)
         ↓
   Injection Plugin (execute strategy)
         ↓
   Proof Generator (create verification)
         ↓
   Indexer Notification (update status)
```

## API Endpoints

### POST /api/inject
Submit a memory strand for blockchain injection.

```json
{
  "strandId": "abc123",
  "chain": "ethereum",
  "pricingModel": "pay-per-injection",
  "accessControl": "public",
  "paymentMethod": "crypto",
  "recipientAddress": "0x..."
}
```

Response:
```json
{
  "injectionId": "inj_123",
  "cost": "1.75",
  "currency": "USD",
  "paymentUrl": "https://...",
  "estimatedTime": "2-5 minutes",
  "status": "awaiting_payment"
}
```

### GET /api/injection/:injectionId
Get injection status and proof.

```json
{
  "injectionId": "inj_123",
  "strandId": "abc123",
  "status": "injected",
  "txHash": "0x...",
  "chain": "ethereum",
  "blockNumber": 12345678,
  "decryptionKey": "0x...",
  "accessToken": "eyJ...",
  "proofOfInjection": {...}
}
```

### GET /api/retrieve/:txHash
Retrieve injected memory strand.

```json
{
  "strandId": "abc123",
  "content": "...",
  "geometricAddress": "(0.123, 0.456, 0.789, 0.012)",
  "injectedAt": "2026-03-25T20:51:00Z",
  "chain": "ethereum",
  "blockNumber": 12345678
}
```

## Pricing Models

### Model 1: Pay-Per-Injection
```
Cost = (base_fee + data_size * rate) * chain_multiplier
Example: 1KB on Ethereum = $0.50 + (1 * $0.10) * 2.0 = $1.70
```

### Model 2: Subscription Queue
```
Monthly fee = $99
Unlimited injections, batched weekly
```

### Model 3: Freemium
```
Free: Public data, no access control
Paid: Private data, access tokens sold
```

### Model 4: IaaS (Injection-as-a-Service)
```
Operator charges users for injections
Manus takes 30%, operator keeps 70%
```

## Plugin System

Create custom injection strategies:

```typescript
// plugins/my-plugin.ts
export class MyInjectionPlugin implements InjectionPlugin {
  name = "my-plugin";
  chains = ["ethereum", "polygon"];
  
  async calculateCost(strand: MemoryStrand, chain: string): Promise<Cost> {
    // Custom cost calculation
    return { amount: 1.5, currency: "USD" };
  }
  
  async inject(strand: MemoryStrand, payment: Payment): Promise<InjectionResult> {
    // Custom injection logic
    return { txHash: "0x...", blockNumber: 12345 };
  }
  
  async retrieve(txHash: string, key: string): Promise<MemoryStrand> {
    // Custom retrieval logic
    return strand;
  }
  
  async verify(txHash: string): Promise<VerificationResult> {
    // Custom verification logic
    return { verified: true };
  }
}
```

Register plugin:
```typescript
injectionService.registerPlugin(new MyInjectionPlugin());
```

## Deployment Scenarios

### Scenario A: Solo Operator
- Run both Unified Indexer and Injection Service
- Index your own content
- Inject at your own cost
- Monetize through access tokens

### Scenario B: Federated Network
- Multiple operators run independent services
- Operators compete on price and speed
- Users choose preferred operator
- Network effect increases value

### Scenario C: Manus-Hosted
- Deploy on Manus platform
- Pay-as-you-go pricing
- Manus handles blockchain integration
- Focus on content and monetization

### Scenario D: Enterprise
- Deploy internally
- Custom plugins for corporate blockchain
- Private access control
- Compliance-ready audit trail

## Configuration

### .env
```
# Blockchain RPC Endpoints
ETHEREUM_RPC=https://eth-mainnet.alchemyapi.io/v2/...
POLYGON_RPC=https://polygon-mainnet.g.alchemy.com/v2/...
ARBITRUM_RPC=https://arb-mainnet.g.alchemy.com/v2/...
OPTIMISM_RPC=https://opt-mainnet.g.alchemy.com/v2/...
BASE_RPC=https://base-mainnet.g.alchemy.com/v2/...

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Web3 Wallet
INJECTOR_PRIVATE_KEY=0x...
INJECTOR_ADDRESS=0x...

# Unified Indexer Connection
INDEXER_API_URL=http://localhost:3000/api
INDEXER_API_KEY=...

# Pricing
BASE_FEE_USD=0.50
DATA_RATE_PER_KB=0.10
ETHEREUM_MULTIPLIER=2.0
POLYGON_MULTIPLIER=0.1
ARBITRUM_MULTIPLIER=0.2
OPTIMISM_MULTIPLIER=0.2
BASE_MULTIPLIER=0.2

# Access Control
JWT_SECRET=...
TOKEN_EXPIRY_HOURS=24
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Start dev server with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## File Structure

```
injection-service/
├── src/
│   ├── api/
│   │   ├── inject.ts
│   │   ├── retrieve.ts
│   │   └── status.ts
│   ├── blockchain/
│   │   ├── adapter.ts
│   │   ├── chains/
│   │   │   ├── ethereum.ts
│   │   │   ├── polygon.ts
│   │   │   └── ...
│   │   └── rpc-manager.ts
│   ├── pricing/
│   │   ├── engine.ts
│   │   ├── models/
│   │   │   ├── pay-per-injection.ts
│   │   │   ├── subscription.ts
│   │   │   ├── freemium.ts
│   │   │   └── iaas.ts
│   │   └── calculator.ts
│   ├── payment/
│   │   ├── processor.ts
│   │   ├── stripe-handler.ts
│   │   └── web3-handler.ts
│   ├── access-control/
│   │   ├── token-generator.ts
│   │   ├── key-manager.ts
│   │   └── revocation.ts
│   ├── plugins/
│   │   ├── interface.ts
│   │   ├── calldata-injection.ts
│   │   ├── nft-metadata.ts
│   │   ├── smart-contract.ts
│   │   ├── rollup-batching.ts
│   │   └── zero-knowledge.ts
│   ├── queue/
│   │   ├── manager.ts
│   │   └── optimizer.ts
│   └── index.ts
├── tests/
│   ├── pricing.test.ts
│   ├── blockchain.test.ts
│   ├── payment.test.ts
│   └── plugins.test.ts
├── .env.example
├── package.json
└── README.md
```

## Security Considerations

- **Private Keys**: Never commit `.env` with real keys. Use environment variables.
- **Rate Limiting**: Implement rate limits on API endpoints.
- **Payment Verification**: Always verify payments before executing injection.
- **Key Rotation**: Rotate injector keys regularly.
- **Audit Logging**: Log all injections for compliance.
- **Access Control**: Implement JWT verification on all endpoints.

## Monitoring & Observability

- **Prometheus Metrics**: Track injection success rate, costs, latency
- **Structured Logging**: JSON logs for easy parsing
- **Error Tracking**: Sentry integration for error monitoring
- **Health Checks**: `/health` endpoint for uptime monitoring

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## License

Apache 2.0 - See LICENSE file

## Support

- Documentation: [Two-Stack Architecture Guide](../TWO_STACK_ARCHITECTURE.md)
- Issues: GitHub Issues
- Community: Discord (link in docs)

## Roadmap

- [ ] Solana integration
- [ ] Bitcoin integration
- [ ] Zero-knowledge proof plugin
- [ ] Rollup batching optimization
- [ ] Multi-signature support
- [ ] DAO governance for pricing
- [ ] Automated cost optimization
- [ ] Cross-chain atomic injections

---

**Built with ❤️ by Manus AI**

This is the deployment layer for eternal AGI memory. Inject once, remember forever.
