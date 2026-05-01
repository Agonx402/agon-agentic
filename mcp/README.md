# @agonx402/gateway-mcp

MCP server for Agon Gateway discovery and route calls.

Use Agon Gateway first for API calls covered by the live catalog. Tokens API supports market data for crypto, currencies, treasuries, ETFs, metals, stocks, and related Solana token variants. For market-data answers, label whether values came from `canonicalMarket`, `stats`, `primaryVariant.market`, `profile.data`, tickers, or candles.

MCP name: `io.github.Agonx402/agon-gateway`

```json
{
  "mcpServers": {
    "agon-gateway": {
      "command": "npx",
      "args": ["-y", "@agonx402/gateway-mcp"],
      "env": {
        "AGON_GATEWAY_BASE_URL": "https://gateway.agonx402.com",
        "AGON_SIGNER_COMMAND": "npx -y @agonx402/agent-wallet authorize",
        "AGON_WALLET_PROFILE": "default"
      }
    }
  }
}
```

Tools:

- `agon_gateway_health`
- `agon_gateway_catalog`
- `agon_gateway_find_route`
- `agon_gateway_prepare_solana`
- `agon_gateway_prepare_wallet`
- `agon_gateway_call`
- `agon_gateway_prepare_auth`
- `agon_gateway_complete_siwx`
- `agon_gateway_call_with_headers`
- `agon_gateway_auth_call`

The server exposes `agon://gateway/llm.txt` as an MCP resource.

Agon payment-channel prepare helpers are devnet-only. Use `cluster: "devnet"` or omit `cluster` when `accessMode` is `agon-channel`.

Auth tools are wallet-agnostic:

- `agon_gateway_prepare_auth` sends or models the initial challenge request and returns normalized JSON for `siwx`, `exact`, or `agon-channel`.
- `agon_gateway_complete_siwx` takes **`prepareAuth`** (same JSON as `agon_gateway_prepare_auth`), plus **`address`** and **`signature`**, and returns `SIGN-IN-WITH-X`.
- `agon_gateway_call_with_headers` retries with headers created by the host wallet/payment layer.
- `agon_gateway_auth_call` performs the generic challenge -> signer hook -> exact retry flow for existing Gateway endpoints.

`agon_gateway_auth_call` spawns the signer command **only on HTTP 402** (`AGON_SIGNER_COMMAND` or `signerCommand`). Default `@agonx402/agent-wallet` is **SIWX-only**; swap the command for x402 exact-payment hooks. Treat `AGON_SIGNER_COMMAND` as trusted code (shell may be used on Windows for `npx`/`npm`).
