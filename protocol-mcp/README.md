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

The default devnet program ID is `3UyUFeNsUYPpM6hMRf7H8wg3MKEXQ82rqnsXhZrUwgSD`. Override with the `programId` tool argument or `AGON_PROTOCOL_PROGRAM_ID`.

Core tools:

- `agon_protocol_config`
- `agon_protocol_token`
- `agon_protocol_participant`
- `agon_protocol_channel`
- `agon_protocol_headroom`
- `agon_protocol_clearing_preview`
- `agon_protocol_prepare_action`
- `agon_protocol_prepare_gateway_commitment`
- `agon_protocol_verify_gateway_commitment`

`agon_protocol_prepare_action` returns concrete instruction/account/message plans for protocol flows including participant init, deposits, channels, unlocks, withdrawals, individual settlement, bundle settlement, clearing rounds, signer rotation, and authority handoffs.
