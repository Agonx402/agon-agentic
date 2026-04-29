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
        "AGON_GATEWAY_BASE_URL": "https://gateway.agonx402.com"
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

The server exposes `agon://gateway/llm.txt` as an MCP resource.

Agon payment-channel prepare helpers are devnet-only. Use `cluster: "devnet"` or omit `cluster` when `accessMode` is `agon-channel`.

Auth tools are wallet-agnostic:

- `agon_gateway_prepare_auth` sends or models the initial challenge request and returns normalized JSON for `siwx`, `exact`, or `agon-channel`.
- `agon_gateway_complete_siwx` turns a prepared SIWX challenge plus caller-provided address/signature into a `SIGN-IN-WITH-X` header.
- `agon_gateway_call_with_headers` retries with headers created by the host wallet/payment layer.

The MCP server does not execute local signer commands, store private keys, submit x402 payments, or build Agon channel commitments. MCP hosts should call their own wallet/payment layer and pass the resulting headers back to the server.
