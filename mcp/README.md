# @agonx402/gateway-mcp

MCP server for Agon Gateway discovery and route calls.

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
        "AGON_WALLET_PROFILE": "default",
        "AGON_PAYMENT_MAX_AMOUNT_USD": "0.01",
        "AGON_PAYMENT_DAILY_LIMIT_USD": "1.00"
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
- `agon_gateway_complete_siwx` turns a prepared SIWX challenge plus caller-provided address/signature into a `SIGN-IN-WITH-X` header.
- `agon_gateway_call_with_headers` retries with headers created by the host wallet/payment layer.
- `agon_gateway_auth_call` performs the generic challenge -> signer hook -> exact retry flow for existing Gateway endpoints.

`agon_gateway_auth_call` executes only the configured signer command. The default signer is `@agonx402/agent-wallet`, but hosts can swap in any wallet or policy system via `AGON_SIGNER_COMMAND` or the tool's `signerCommand` argument. Low-level tools remain available when a host wants to sign externally and pass headers back itself.
