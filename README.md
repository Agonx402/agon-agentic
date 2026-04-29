# Agon Gateway Agentic Tools

Agent-facing tools for discovering and calling Agon Gateway routes.

## Packages

- `cli/` publishes `@agonx402/gateway-cli`, a zero-dependency CLI.
- `mcp/` publishes `@agonx402/gateway-mcp`, a stdio MCP server.
- `protocol-cli/` publishes `@agonx402/protocol-cli`, a read-only and prepare-only Agon Protocol CLI.
- `protocol-mcp/` publishes `@agonx402/protocol-mcp`, a read-only and prepare-only Agon Protocol MCP server.
- `skills/agon-gateway/` is a Codex-style skill for agent workflows.
- `skills/agon-protocol/` is a Codex-style skill for protocol accounts, channels, settlement, and BLS caveats.
- `skills/agon-gateway-payment-channels/` is a Codex-style skill for gateway payment-channel authorization.
- `llm.txt` and `llms.txt` are LLM-readable gateway docs for websites.

## Quick Checks

```bash
node cli/agon-gateway.js health
node cli/agon-gateway.js catalog --provider helius
node protocol-cli/agon-protocol.js token show
node mcp/server.js
node protocol-mcp/server.js
```

The CLI and MCP server do not store wallet private keys. They can issue x402/SIWX challenges and retry with payment/auth headers produced by the caller's wallet layer.
The protocol CLI and MCP server are read + prepare only; they do not sign or broadcast transactions.
