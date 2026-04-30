# Agon Agentic Tools

Agent-facing tools for discovering, authenticating, and calling Agon Gateway routes.

## One-Step Setup

Install skills, create a default convenience wallet, write payment policy, and register MCP servers for supported agent clients:

```bash
npx -y @agonx402/agentic setup --target all
```

Supported setup targets:

```bash
npx -y @agonx402/agentic setup --target codex
npx -y @agonx402/agentic setup --target claude-desktop
npx -y @agonx402/agentic setup --target cursor
npx -y @agonx402/agentic setup --target windsurf
npx -y @agonx402/agentic setup --target generic
npx -y @agonx402/agentic setup --target all --dry-run
```

Setup creates `~/.agon/wallets/default.json` and `~/.agon/policy.json`. The default wallet is a convenience agent wallet for SIWX and small x402 payments; swap it for any wallet or custody layer by setting `AGON_SIGNER_COMMAND`.

## Skill Install Only

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
```

The installer copies only the Agon skill folders, creates the target directory if needed, and overwrites only these Agon-owned skill names:

- `agon-gateway`
- `agon-protocol`
- `agon-gateway-payment-channels`

`install-skills` only copies skills. `setup` performs the full wallet, policy, and MCP registration flow.

Run the CLIs directly with `npx`:

```bash
npx -y @agonx402/gateway-cli catalog
npx -y @agonx402/gateway-cli agent-prompt
npx -y @agonx402/gateway-cli auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
npx -y @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
npx -y @agonx402/agent-wallet authorize --stdin
npx -y @agonx402/protocol-cli config
npx -y @agonx402/protocol-cli token show
```

MCP servers are separate packages:

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

Generic authenticated call flow:

1. Use a known endpoint or fetch `/v1/catalog` to discover one.
2. Send the exact request and receive a `402` challenge.
3. Pass the normalized auth request to `AGON_SIGNER_COMMAND`.
4. Retry the exact same request with returned `SIGN-IN-WITH-X`, `PAYMENT-SIGNATURE`, `X-PAYMENT`, or channel headers.

Gateway MCP exposes `agon_gateway_auth_call` for this flow. Low-level prepare/complete/call tools remain available for agents with their own wallet policies.

## Packages

- `package root` publishes `@agonx402/agentic`, a one-step agent setup installer.
- `agent-wallet/` publishes `@agonx402/agent-wallet`, a swappable default signer hook.
- `cli/` publishes `@agonx402/gateway-cli`, a Gateway CLI with generic signer hooks.
- `mcp/` publishes `@agonx402/gateway-mcp`, a stdio MCP server with route-generic auth calls.
- `protocol-cli/` publishes `@agonx402/protocol-cli`, a read-only and prepare-only Agon Protocol CLI.
- `protocol-mcp/` publishes `@agonx402/protocol-mcp`, a read-only and prepare-only Agon Protocol MCP server.
- `skills/agon-gateway/` is an agent skill for Gateway workflows.
- `skills/agon-protocol/` is an agent skill for protocol accounts, channels, settlement, and BLS caveats.
- `skills/agon-gateway-payment-channels/` is an agent skill for gateway payment-channel authorization.
- `llm.txt` and `llms.txt` are LLM-readable gateway docs for websites.

## Quick Checks

```bash
node cli/agon-gateway.js health
node cli/agon-gateway.js catalog --provider helius
node cli/agon-gateway.js auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
node agent-wallet/agon-wallet.js setup --profile default
node protocol-cli/agon-protocol.js token show
node mcp/server.js
node protocol-mcp/server.js
```

The CLI and MCP server use `AGON_SIGNER_COMMAND` when configured. The bundled agent wallet is replaceable; external wallets can return headers or signatures through the same hook.
The protocol CLI and MCP server are read + prepare only; they do not sign or broadcast transactions.
