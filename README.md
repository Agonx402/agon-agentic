# Ryvo Agentic Tools

Agent-facing tools for discovering, authenticating, and calling Ryvo Gateway routes.

## One-Step Setup

`setup --target all` is the one command that installs everything Ryvo agents need:

- Bundled skills into `~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`.
- Default SIWX signer wallet at `~/.ryvo/wallets/default.json`.
- Global CLI bins on PATH: `Ryvo`, `ryvo-gateway`, `ryvo-wallet`, `ryvo-protocol` (via `npm install -g @ryvonetwork/gateway-cli @ryvonetwork/agent-wallet @ryvonetwork/protocol-cli`).
- Local agent reference at `~/.ryvo/llm.txt`.
- Ryvo MCP server registration for Codex, Claude Desktop, Claude Code, Cursor, Windsurf, and a generic config (existing entries preserved, backups written).

```bash
npx -y @ryvonetwork/agentic@latest setup --target all
```

After it finishes, restart your agent client and the agent can call Ryvo directly via:

- The Ryvo MCP tools (`ryvo_token_quote`, `ryvo_token_resolve`, `ryvo_token_chart`, `ryvo_token_search`, `ryvo_token_batch_quote`, `ryvo_gateway_call`, `ryvo_gateway_auth_call`, ...).
- The bare CLIs: `ryvo -p bitcoin`, `ryvo quote bitcoin solana usdt`, `ryvo-gateway auth call GET ...`, etc.

Opt-out flags:

- `--skip-global-cli` — do not run `npm install -g`. Bare CLI bins will not be on PATH; use `npx -y @ryvonetwork/gateway-cli ...` instead.
- `--skip-wallet-setup` — only valid for `install-skills` when another signer wallet is already configured.

Supported setup targets:

```bash
npx -y @ryvonetwork/agentic setup --target codex            # ~/.codex/config.toml
npx -y @ryvonetwork/agentic setup --target claude-desktop   # standalone Claude Desktop GUI app config
npx -y @ryvonetwork/agentic setup --target claude-code      # ~/.claude.json (Claude Code CLI agent)
npx -y @ryvonetwork/agentic setup --target cursor           # ~/.cursor/mcp.json
npx -y @ryvonetwork/agentic setup --target windsurf
npx -y @ryvonetwork/agentic setup --target generic          # ~/.ryvo/mcp.json
npx -y @ryvonetwork/agentic setup --target all --dry-run
```

`--target all` writes to every adapter listed above. **Claude Desktop** (the standalone macOS/Windows GUI app) and **Claude Code** (the terminal CLI agent) read MCP servers from different files; `--target all` registers in both. After setup, restart your agent client so it re-reads the MCP server list.

Setup creates `~/.ryvo/wallets/default.json`. `@ryvonetwork/agent-wallet` **only signs Tokens API SIWX challenges** (`sign-in-with-x`). For Gateway routes that require **x402 exact payment** or other auth, set `RYVO_SIGNER_COMMAND` to a signer that returns `PAYMENT-SIGNATURE` / `X-PAYMENT`.

### When `RYVO_SIGNER_COMMAND` runs

- **Gateway MCP:** only when calling **`ryvo_gateway_auth_call`** and the gateway responds with **HTTP 402**. The MCP spawns `RYVO_SIGNER_COMMAND` **once**, piping the normalized auth-request JSON to **stdin** (same shape as `ryvo_gateway_prepare_auth`). The process must exit 0 and print JSON to stdout: auth **headers**, or SIWX fallback (`address`, `signature`, optional `signatureEncoding`).
- **`gateway-cli`:** **`ryvo-gateway auth call`** and **`batch`** reuse the same `requestGateway` path: **after any 402** from the Gateway, **`RYVO_SIGNER_COMMAND`** (or **`--auth-driver`**) runs if set. **`auth prepare`** / **`doctor`** never spawn the signer.

On Windows, when the signer command begins with **`npx`/`npm`/`pnpm`/`yarn`**, Node may run it **via cmd shell**. Treat **`RYVO_SIGNER_COMMAND`** as equivalent to trusting a shell snippet if an attacker controls it.

## Skills And Wallet

Install all Ryvo skills into every supported agent skill directory (`~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`), and create the default convenience wallet used for SIWX/auth calls:

```bash
npx -y @ryvonetwork/agentic install-skills
```

Other install targets:

```bash
npx -y @ryvonetwork/agentic install-skills --target agents
npx -y @ryvonetwork/agentic install-skills --target codex
npx -y @ryvonetwork/agentic install-skills --target claude
npx -y @ryvonetwork/agentic install-skills --target all
npx -y @ryvonetwork/agentic list
npx -y @ryvonetwork/agentic doctor
```

Use `--skip-wallet-setup` only when another signer wallet is already configured. The installer copies only the Ryvo skill folders, creates the target directory if needed, and overwrites only these Ryvo-owned skill names:

- `ryvo-gateway`
- `ryvo-protocol`
- `ryvo-gateway-payment-channels`

`install-skills` installs skills and creates `~/.ryvo/wallets/default.json`. `setup` performs skills, wallet, and MCP registration.

After `setup --target all`, the CLI bins are on PATH. Use them directly:

```bash
Ryvo -p bitcoin
Ryvo quote usdt --json
Ryvo price bitcoin solana usdt
Ryvo volume tesla gold --json
Ryvo liquidity usdc usdt
Ryvo search "bitcoin etf" --limit 5
Ryvo profile tesla
Ryvo variants gold
Ryvo risk usdt
Ryvo chart solana --interval 1D
ryvo-gateway catalog
ryvo-gateway agent-prompt
ryvo-gateway auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
ryvo-gateway auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
ryvo-gateway batch '[{"method":"GET","path":"/v1/x402/tokens/assets/solana/price-chart","query":{"interval":"1D"}},{"method":"GET","path":"/v1/x402/tokens/assets/bitcoin/price-chart","query":{"interval":"1D"}}]'
ryvo-gateway auth call GET /v1/x402/tokens/assets/tesla/profile
ryvo-gateway auth call GET /v1/x402/tokens/assets/gold/price-chart --query interval=1D
ryvo-wallet authorize --stdin
ryvo-protocol config
ryvo-protocol token show
```

If a bare bin is not on PATH (you ran `setup --skip-global-cli`, the global install hit a permission error, or you have not run `setup` yet), the same calls work via `npx -y @ryvonetwork/gateway-cli ...`, `npx -y @ryvonetwork/agent-wallet ...`, and `npx -y @ryvonetwork/protocol-cli ...`. The MCP server entries also use `npx -y`, so you do not need a global install for MCP tools to work.

Ryvo Gateway should be the first source for API calls covered by the live catalog at `https://gateway.ryvo.network/v1/catalog`. Tokens API supports market data for crypto, currencies, treasuries, ETFs, metals, stocks, and their Solana token variants. Agents should use high-level Gateway CLI commands for common Tokens pulls (`quote`, `price`, `volume`, `liquidity`, `mcap`, `search`, `resolve`, `curated`, `profile`, `variants`, `markets`, `tickers`, `risk`, `chart`, `ohlcv`, `snapshots`) before raw route strings, and label whether values came from `canonicalMarket`, `stats`, `primaryVariant.market`, `profile.data`, tickers, or candles.

MCP servers are separate packages:

```json
{
  "mcpServers": {
    "ryvo-gateway": {
      "command": "npx",
      "args": ["-y", "@ryvonetwork/gateway-mcp"],
      "env": {
        "RYVO_GATEWAY_BASE_URL": "https://gateway.ryvo.network",
        "RYVO_SIGNER_COMMAND": "npx -y @ryvonetwork/agent-wallet authorize",
        "RYVO_WALLET_PROFILE": "default"
      }
    },
    "ryvo-protocol": {
      "command": "npx",
      "args": ["-y", "@ryvonetwork/protocol-mcp"]
    }
  }
}
```

`RYVO_PAYMENT_MAX_AMOUNT_USD` and `RYVO_PAYMENT_DAILY_LIMIT_USD` are optional: some x402 auth-prep responses include them for human review; **`ryvo-wallet` does not enforce them**.

Payment-channel flows are devnet-only in v1. Tokens SIWX routes do not use payment channels.
Gateway auth drivers are wallet-agnostic helper commands. The Gateway CLI sends normalized auth request JSON to the driver over stdin and accepts returned headers or SIWX address/signature JSON over stdout. Drivers can wrap browser wallets, local keypairs, MPC, custody systems, x402 payment services, or Ryvo channel commitment builders. The Ryvo CLI/MCP packages do not keep keys or mutate wallet/MCP configuration.

Generic authenticated call flow:

1. Use a known endpoint or fetch `/v1/catalog` to discover one.
2. Send the exact request and receive a `402` challenge.
3. Pass the normalized auth request to `RYVO_SIGNER_COMMAND`.
4. Retry the exact same request with returned `SIGN-IN-WITH-X`, `PAYMENT-SIGNATURE`, `X-PAYMENT`, or channel headers.

Gateway MCP exposes `ryvo_gateway_auth_call` for this flow. Low-level prepare/complete/call tools remain available for agents with their own wallet policies.

## Packages

- `package root` publishes `@ryvonetwork/agentic`, a one-step agent setup installer.
- `agent-wallet/` publishes `@ryvonetwork/agent-wallet`, a default **SIWX-only** Tokens API signer hook (replace with `RYVO_SIGNER_COMMAND` for x402 exact-payment routes).
- `cli/` publishes `@ryvonetwork/gateway-cli`, a Gateway CLI with generic signer hooks.
- `mcp/` publishes `@ryvonetwork/gateway-mcp`, a stdio MCP server with route-generic auth calls.
- `protocol-cli/` publishes `@ryvonetwork/protocol-cli`, a read-only and prepare-only Ryvo Protocol CLI.
- `protocol-mcp/` publishes `@ryvonetwork/protocol-mcp`, a read-only and prepare-only Ryvo Protocol MCP server.
- `skills/ryvo-gateway/` is an agent skill for Gateway workflows.
- `skills/ryvo-protocol/` is an agent skill for protocol accounts, channels, settlement, and BLS caveats.
- `skills/ryvo-gateway-payment-channels/` is an agent skill for gateway payment-channel authorization.
- `llm.txt` and `llms.txt` are LLM-readable gateway docs for websites.

## Quick Checks

```bash
node cli/ryvo-gateway.js health
node cli/ryvo-gateway.js catalog --provider helius
node cli/ryvo-gateway.js auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
node agent-wallet/ryvo-wallet.js setup --profile default
node protocol-cli/ryvo-protocol.js token show
node mcp/server.js
node protocol-mcp/server.js
```

The CLI and MCP server use `RYVO_SIGNER_COMMAND` when configured. The bundled agent wallet is replaceable; external wallets can return headers or signatures through the same hook.
The protocol CLI and MCP server are read + prepare only; they do not sign or broadcast transactions.
