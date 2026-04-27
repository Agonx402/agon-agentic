# @agonx402/gateway-mcp

MCP server for Agon Gateway discovery and route calls.

MCP name: `io.github.agonx402/agon-gateway`

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
- `agon_gateway_call`

The server exposes `agon://gateway/llm.txt` as an MCP resource.
