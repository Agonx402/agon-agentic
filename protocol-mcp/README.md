# @ryvonetwork/protocol-mcp

Read-only and prepare-only MCP server for Ryvo Protocol.

```json
{
  "mcpServers": {
    "ryvo-protocol": {
      "command": "npx",
      "args": ["-y", "@ryvonetwork/protocol-mcp"],
      "env": {
        "SOLANA_DEVNET_RPC_URL": "https://api.devnet.solana.com"
      }
    }
  }
}
```

The server exposes `ryvo://protocol/llm.txt` and never signs or broadcasts transactions.

The default devnet program ID is `HuyQoYfBEvVACTKcq8RTiDFm5k5ZBnX5we1UjWBTBeqT`. Override with the `programId` tool argument or `RYVO_PROTOCOL_PROGRAM_ID`.

Core tools:

- `ryvo_protocol_config`
- `ryvo_protocol_token`
- `ryvo_protocol_participant`
- `ryvo_protocol_channel`
- `ryvo_protocol_headroom`
- `ryvo_protocol_clearing_preview`
- `ryvo_protocol_prepare_action`
- `ryvo_protocol_prepare_gateway_commitment`
- `ryvo_protocol_verify_gateway_commitment`

`ryvo_protocol_prepare_action` returns concrete instruction/account/message plans for protocol flows including participant init, deposits, channels, unlocks, withdrawals, individual settlement, bundle settlement, clearing rounds, signer rotation, and authority handoffs.
