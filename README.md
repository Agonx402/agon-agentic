# Agon Gateway Agentic Tools

Agent-facing tools for discovering and calling Agon Gateway routes.

## Packages

- `cli/` publishes `@agonx402/gateway-cli`, a zero-dependency CLI.
- `mcp/` publishes `@agonx402/gateway-mcp`, a stdio MCP server.
- `skills/agon-gateway/` is a Codex-style skill for agent workflows.
- `llm.txt` and `llms.txt` are LLM-readable gateway docs for websites.

## Quick Checks

```bash
node cli/agon-gateway.js health
node cli/agon-gateway.js catalog --provider helius
node mcp/server.js
```

The CLI and MCP server do not store wallet private keys. They can issue x402/SIWX challenges and retry with payment/auth headers produced by the caller's wallet layer.
