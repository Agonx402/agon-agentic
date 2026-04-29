# Agon Gateway API Reference

Derived from `agon-gateway` README and `src-v2` route builders on 2026-04-27. Prefer the live `/v1/catalog` response whenever exact route metadata matters.

## Base URLs

- Production default: `https://gateway.agonx402.com`
- Local dev: `http://localhost:3000` or the port used by `next dev`

## Public Discovery

- `GET /healthz`
- `GET /v1/catalog`
- `GET /v1/catalog?provider=alchemy`
- `GET /v1/catalog?provider=helius`
- `GET /v1/catalog?provider=tokens`

Catalog route entries include `path`, `httpMethod`, `provider`, `surface`, `method`, `description`, `accessMode`, `paymentRequired`, optional `priceUsd`, optional `priceTokenAmount`, schemas, examples, and payment/channel metadata.

## Exact-Payment Route Flow

Use for Solana RPC, Solana DAS, and Helius Wallet routes.

1. Send the final request without a payment header.
2. Receive `402 Payment Required`.
3. Sign or pay through the agent's x402-compatible wallet layer.
4. Retry the exact same request with `PAYMENT-SIGNATURE` or `X-PAYMENT`.
5. Read JSON response: `{ ok, provider, cluster, surface, method, priceUsd?, paymentNetwork?, result }`.

Important: exact-payment POST routes must be challenged with the same JSON body that will be paid. Empty-body probes are only valid for free/auth-only routes or routes whose schema requires no input.

## SIWX Route Flow

Use for Tokens API routes.

1. Send the desired Tokens route request without auth.
2. Receive `402 Payment Required` containing a sign-in-with-x challenge.
3. Have the wallet sign the SIWX challenge.
4. Retry the same request with `SIGN-IN-WITH-X`.

Tokens routes are wallet-authenticated and `paymentRequired: false`.

## Agon Channel Route Flow

Use for `/v1/agon-channel/...` routes discovered from `GET /v1/catalog`.

1. Select a catalog route with `accessMode: "agon-channel"`.
2. Read `priceTokenAmount`, `tokenMint`, `tokenId`, `programId`, `merchantOwner`, `merchantParticipantId`, and `messageDomain` from route metadata.
3. Use `@agonx402/sdk` to build the next cumulative Agon commitment.
4. Sign the exact Agon message bytes with the channel authorized signer.
5. Send the final API request with `X-Agon-Request-Id` and `AGON-COMMITMENT`.

Do not use x402 payment headers for channel routes. Tokens SIWX routes remain free/authenticated and do not use payment channels.

## Solana RPC Routes

Pattern:

```text
POST /v1/x402/solana/{cluster}/{provider}/rpc/{method}
```

Clusters: `mainnet`, `devnet`

Providers: `alchemy`, `helius`

Body:

```json
{ "params": [] }
```

Supported methods:

- `getBalance`
- `getAccountInfo`
- `getTransaction`
- `getSignaturesForAddress`
- `getTokenAccountsByOwner`
- `getProgramAccounts`
- `getTransactionsForAddress` (Helius only)

Examples:

```bash
node agentic/cli/agon-gateway.js rpc getBalance '["11111111111111111111111111111111"]' --provider helius --cluster mainnet
node agentic/cli/agon-gateway.js rpc getSignaturesForAddress '["Vote111111111111111111111111111111111111111",{"limit":5}]' --provider alchemy
```

Guardrails:

- `getProgramAccounts` requires exactly two params: program id and config object.
- `getProgramAccounts` config must include at least one filter.
- `getProgramAccounts` config must include `dataSlice` with `length <= 256`.
- Paginated list methods cap `limit` values; use catalog schemas for current maximums.

## Solana DAS Routes

Pattern:

```text
POST /v1/x402/solana/{cluster}/{provider}/das/{method}
```

Providers: `alchemy`, `helius`

Body:

```json
{ "params": { } }
```

Supported methods:

- `getAsset`
- `getAssetsByOwner`
- `searchAssets`

Alchemy devnet DAS is not supported.

Examples:

```bash
node agentic/cli/agon-gateway.js das getAsset '{"id":"<asset-id>"}' --provider helius
node agentic/cli/agon-gateway.js das getAssetsByOwner '{"ownerAddress":"<wallet>","limit":10}' --provider helius
```

## Helius Wallet Routes

Mainnet path family:

```text
GET  /v1/x402/helius/wallet/identity/:wallet
POST /v1/x402/helius/wallet/batch-identity
GET  /v1/x402/helius/wallet/balances/:wallet
GET  /v1/x402/helius/wallet/history/:wallet
GET  /v1/x402/helius/wallet/transfers/:wallet
GET  /v1/x402/helius/wallet/funded-by/:wallet
```

Devnet path family:

```text
GET  /v1/x402/helius/devnet/wallet/identity/:wallet
POST /v1/x402/helius/devnet/wallet/batch-identity
GET  /v1/x402/helius/devnet/wallet/balances/:wallet
GET  /v1/x402/helius/devnet/wallet/history/:wallet
GET  /v1/x402/helius/devnet/wallet/transfers/:wallet
GET  /v1/x402/helius/devnet/wallet/funded-by/:wallet
```

The `:wallet` value accepts a base58 Solana address, SNS `.sol`, or supported ANS-style domain. Domain resolution is mainnet-only.

Examples:

```bash
node agentic/cli/agon-gateway.js wallet balances GQUtvPx89ZNCwmvQqFmH59bJcU8fW8siETpaxod7Aydz --query limit=25 --query showNative=true
node agentic/cli/agon-gateway.js wallet batch-identity '["GQUtvPx89ZNCwmvQqFmH59bJcU8fW8siETpaxod7Aydz","toly.sol"]'
```

## Tokens API Routes

Tokens routes use `accessMode: "siwx"`. They require `SIGN-IN-WITH-X` after challenge, not payment settlement.

Routes:

- `GET /v1/x402/tokens/health`
- `GET /v1/x402/tokens/assets/search`
- `GET /v1/x402/tokens/assets/resolve`
- `GET /v1/x402/tokens/assets/curated`
- `POST /v1/x402/tokens/assets/market-snapshots`
- `GET /v1/x402/tokens/assets/variant-markets`
- `GET /v1/x402/tokens/assets/risk-summary`
- `GET /v1/x402/tokens/assets/:assetId`
- `GET /v1/x402/tokens/assets/:assetId/variants`
- `GET /v1/x402/tokens/assets/:assetId/variant-top-markets`
- `GET /v1/x402/tokens/assets/:assetId/variant-market`
- `GET /v1/x402/tokens/assets/:assetId/markets`
- `GET /v1/x402/tokens/assets/:assetId/ohlcv`
- `GET /v1/x402/tokens/assets/:assetId/price-chart`
- `GET /v1/x402/tokens/assets/:assetId/profile`
- `GET /v1/x402/tokens/assets/:assetId/tickers`
- `GET /v1/x402/tokens/assets/:assetId/risk-summary`
- `GET /v1/x402/tokens/assets/:assetId/risk-details`
- `GET /v1/x402/tokens/assets/:assetId/description`

Examples:

```bash
node agentic/cli/agon-gateway.js tokens assets/search --query q=solana --query limit=5
node agentic/cli/agon-gateway.js tokens POST assets/market-snapshots --body '{"mints":["So11111111111111111111111111111111111111112"]}'
```

Batch limits:

- `market-snapshots`: max 250 `mints` plus `addresses`
- `variant-markets`: max 50 comma-separated `mints` plus `addresses`

## Internal Routes

Internal server-to-server facilitator endpoints are intentionally omitted from this public skill reference. Do not infer, expose, or call private gateway routes from public clients; use `GET /v1/catalog` and documented `/v1/...` routes only.

## Agentic CLI

Use `agentic/cli/agon-gateway.js` from the repository root.

Useful commands:

```bash
node agentic/cli/agon-gateway.js health
node agentic/cli/agon-gateway.js catalog --provider tokens
node agentic/cli/agon-gateway.js routes --provider helius --surface wallet
node agentic/cli/agon-gateway.js show getBalance --provider helius
node agentic/cli/agon-gateway.js call GET /v1/x402/tokens/health --siwx "$SIGN_IN_WITH_X"
```

Header flags:

- `--payment-signature <value>` adds `PAYMENT-SIGNATURE`
- `--x-payment <value>` adds `X-PAYMENT`
- `--siwx <value>` adds `SIGN-IN-WITH-X`
- `--header Name:Value` adds custom headers

## Agentic MCP Server

Run:

```bash
node agentic/mcp/server.js
```

Tools:

- `agon_gateway_health`
- `agon_gateway_catalog`
- `agon_gateway_find_route`
- `agon_gateway_prepare_solana`
- `agon_gateway_call`

The MCP server exposes `agon://gateway/llm.txt` as a resource.
