# Agon Gateway Agentic Tools

Agent-facing tools for discovering and calling Agon Gateway routes.

## One-Step Skill Install

Install all Agon skills into the default agent skill directory, `~/.agents/skills`:

```bash
npx -y @agonx402/agentic install-skills
```

Other install targets:

```bash
npx -y @agonx402/agentic install-skills --target codex
npx -y @agonx402/agentic install-skills --target all
npx -y @agonx402/agentic list
npx -y @agonx402/agentic doctor
npx -y @agonx402/agentic setup
```

The installer copies only the Agon skill folders, creates the target directory if needed, and overwrites only these Agon-owned skill names:

- `agon-gateway`
- `agon-protocol`
- `agon-gateway-payment-channels`

It does not store private keys, sign transactions, broadcast transactions, or edit MCP/client config files.

Run the CLIs directly with `npx`:

```bash
npx -y @agonx402/gateway-cli catalog
npx -y @agonx402/gateway-cli agent-prompt
npx -y @agonx402/gateway-cli auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
npx -y @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --auth-driver my-wallet-auth-driver
npx -y @agonx402/protocol-cli config
npx -y @agonx402/protocol-cli token show
```

MCP servers are separate packages:

```json
{
  "mcpServers": {
    "agon-gateway": {
      "command": "npx",
      "args": ["-y", "@agonx402/gateway-mcp"]
    },
    "agon-protocol": {
      "command": "npx",
      "args": ["-y", "@agonx402/protocol-mcp"]
    }
  }
}
```

Payment-channel flows are devnet-only in v1. Tokens SIWX routes do not use payment channels.
Gateway auth drivers are wallet-agnostic helper commands. The Gateway CLI sends normalized auth request JSON to the driver over stdin and accepts returned headers or SIWX address/signature JSON over stdout. Drivers can wrap browser wallets, local keypairs, MPC, custody systems, x402 payment services, or Agon channel commitment builders. The Agon CLI/MCP packages do not keep keys or mutate wallet/MCP configuration.

## Packages

- `package root` publishes `@agonx402/agentic`, a one-step skill installer.
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
node cli/agon-gateway.js auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
node protocol-cli/agon-protocol.js token show
node mcp/server.js
node protocol-mcp/server.js
```

The CLI and MCP server do not store wallet private keys. They can issue x402/SIWX challenges and retry with payment/auth headers produced by the caller's wallet layer.
The protocol CLI and MCP server are read + prepare only; they do not sign or broadcast transactions.
