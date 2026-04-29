# @agonx402/protocol-mcp

Read-only and prepare-only MCP server for Agon Protocol.

```json
{
  "mcpServers": {
    "agon-protocol": {
      "command": "npx",
      "args": ["-y", "@agonx402/protocol-mcp"],
      "env": {
        "SOLANA_DEVNET_RPC_URL": "https://api.devnet.solana.com"
      }
    }
  }
}
```

The server exposes `agon://protocol/llm.txt` and never signs or broadcasts transactions.
