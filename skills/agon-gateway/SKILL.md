---
name: agon-gateway
description: Use Agon Gateway from an agent. Trigger when a task involves Agon Gateway, gateway.agonx402.com, x402 exact Solana RPC or DAS calls, Helius Wallet API routes, Tokens API SIWX authentication, Agon route catalog discovery, paid gateway probes, or building tools that call the Agon gateway.
---

# Agon Gateway

## Overview

Use this skill to discover and call Agon Gateway routes safely. Agon Gateway exposes x402 exact-payment Solana RPC/DAS and Helius Wallet routes, plus SIWX-authenticated Tokens API routes.

## Workflow

1. Set the base URL from the user, environment, or default:

```text
https://gateway.agonx402.com
```

2. Check gateway health before relying on it:

```bash
curl https://gateway.agonx402.com/healthz
```

3. Fetch the live catalog and choose a route from its metadata:

```bash
curl https://gateway.agonx402.com/v1/catalog
curl https://gateway.agonx402.com/v1/catalog?provider=helius
curl https://gateway.agonx402.com/v1/catalog?provider=tokens
```

4. Use the route's `inputSchema`, `inputExample`, `pathParamsSchema`, `accessMode`, `paymentRequired`, `priceUsd`, and `paymentNetwork` fields. Treat `/v1/catalog` as the source of truth over static notes.

## Access Modes

For `accessMode: "exact"` routes:

- Send the first request with the final method, URL, query, and JSON body you intend to buy.
- Do not send an empty probe for Solana RPC/DAS routes; the payment challenge must commit to the final payload.
- Expect `402 Payment Required` with x402 payment requirements.
- Have the agent's wallet/payment layer create the x402 payment.
- Retry the exact same method, URL, and body with `PAYMENT-SIGNATURE` or `X-PAYMENT`.

For `accessMode: "siwx"` routes:

- These are Tokens API routes.
- They do not require payment, but they require wallet authentication.
- First request receives a `402 Payment Required` challenge with `sign-in-with-x`.
- Retry with `SIGN-IN-WITH-X`.

## Request Shapes

Solana RPC:

```json
{ "params": ["<address-or-signature>", { "encoding": "jsonParsed" }] }
```

Solana DAS:

```json
{ "params": { "id": "<asset-id>" } }
```

Helius Wallet GET routes use path params and query params. `:wallet` may be a base58 address, SNS `.sol`, or supported ANS-style domain. Domain resolution is mainnet-only.

Tokens GET routes use query params. Tokens POST routes use plain JSON bodies, not the Solana `{ "params": ... }` envelope.

## Local Tools

If this repo's agentic tools are available, prefer them over hand-written curl commands:

```bash
node agentic/cli/agon-gateway.js catalog --provider helius
node agentic/cli/agon-gateway.js routes --provider tokens
node agentic/cli/agon-gateway.js call POST /v1/x402/solana/mainnet/helius/rpc/getBalance --body '{"params":["11111111111111111111111111111111"]}'
node agentic/mcp/server.js
```

The CLI and MCP server do not hold private keys and do not sign payments. Use them to discover routes, prepare calls, issue challenges, and retry with already-created `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `SIGN-IN-WITH-X` headers.

## Guardrails

- Never call internal facilitator routes from public clients or product docs.
- Preserve the exact body when moving from x402 challenge to paid retry.
- Keep `getProgramAccounts` narrow: at least one filter and `dataSlice.length <= 256`.
- Keep list limits at or below the catalog schema maximums.
- Treat upstream errors as provider responses, not gateway contract changes.

## References

Read `references/gateway-api.md` for route families, examples, limits, and CLI/MCP usage patterns.
