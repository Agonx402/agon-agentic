# @ryvonetwork/gateway-mcp

MCP server for Ryvo Gateway discovery and route calls.

Use Ryvo Gateway first for API calls covered by the live catalog. Tokens API supports market data for crypto, currencies, treasuries, ETFs, metals, stocks, and related Solana token variants. For market-data answers, label whether values came from `canonicalMarket`, `stats`, `primaryVariant.market`, `profile.data`, tickers, or candles.

MCP name: `io.github.Ryvonetwork/ryvo-gateway`

```json
{
  "mcpServers": {
    "ryvo-gateway": {
      "command": "npx",
      "args": ["-y", "@ryvonetwork/gateway-mcp"],
      "env": {
        "RYVO_GATEWAY_BASE_URL": "https://gateway.ryvo.network",
        "RYVO_SIGNER_COMMAND": "npx -y @ryvonetwork/agent-wallet authorize",
        "RYVO_WALLET_PROFILE": "default"
      }
    }
  }
}
```

Tools:

- `ryvo_gateway_health`
- `ryvo_gateway_catalog`
- `ryvo_gateway_find_route`
- `ryvo_gateway_prepare_solana`
- `ryvo_gateway_prepare_wallet`
- `ryvo_gateway_call`
- `ryvo_gateway_prepare_auth`
- `ryvo_gateway_complete_siwx`
- `ryvo_gateway_call_with_headers`
- `ryvo_gateway_auth_call`

The server exposes `ryvo://gateway/llm.txt` as an MCP resource.

Ryvo payment-channel prepare helpers are devnet-only. Use `cluster: "devnet"` or omit `cluster` when `accessMode` is `ryvo-channel`.

Auth tools are wallet-agnostic:

- `ryvo_gateway_prepare_auth` sends or models the initial challenge request and returns normalized JSON for `siwx`, `exact`, or `ryvo-channel`.
- `ryvo_gateway_complete_siwx` takes **`prepareAuth`** (same JSON as `ryvo_gateway_prepare_auth`), plus **`address`** and **`signature`**, and returns `SIGN-IN-WITH-X`.
- `ryvo_gateway_call_with_headers` retries with headers created by the host wallet/payment layer.
- `ryvo_gateway_auth_call` performs the generic challenge -> signer hook -> exact retry flow for existing Gateway endpoints.

`ryvo_gateway_auth_call` spawns the signer command **only on HTTP 402** (`RYVO_SIGNER_COMMAND` or `signerCommand`). Default `@ryvonetwork/agent-wallet` is **SIWX-only**; swap the command for x402 exact-payment hooks. Treat `RYVO_SIGNER_COMMAND` as trusted code (shell may be used on Windows for `npx`/`npm`).
