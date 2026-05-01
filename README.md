# Agon Agentic Tools

Agent-facing tools for discovering, authenticating, and calling Agon Gateway routes.

## One-Step Setup

`setup --target all` is the one command that installs everything Agon agents need:

- Bundled skills into `~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`.
- Default SIWX signer wallet at `~/.agon/wallets/default.json`.
- Global CLI bins on PATH: `agon`, `agon-gateway`, `agon-wallet`, `agon-protocol` (via `npm install -g @agonx402/gateway-cli @agonx402/agent-wallet @agonx402/protocol-cli`).
- Local agent reference at `~/.agon/llm.txt`.
- Agon MCP server registration for Codex, Claude Desktop, Claude Code, Cursor, Windsurf, and a generic config (existing entries preserved, backups written).

```bash
npx -y @agonx402/agentic@latest setup --target all
```

After it finishes, restart your agent client and the agent can call Agon directly via:

- The Agon MCP tools (`agon_token_quote`, `agon_token_resolve`, `agon_token_chart`, `agon_token_search`, `agon_token_batch_quote`, `agon_gateway_call`, `agon_gateway_auth_call`, ...).
- The bare CLIs: `agon -p bitcoin`, `agon quote bitcoin solana usdt`, `agon-gateway auth call GET ...`, etc.

Opt-out flags:

- `--skip-global-cli` — do not run `npm install -g`. Bare CLI bins will not be on PATH; use `npx -y @agonx402/gateway-cli ...` instead.
- `--skip-wallet-setup` — only valid for `install-skills` when another signer wallet is already configured.

Supported setup targets:

```bash
npx -y @agonx402/agentic setup --target codex            # ~/.codex/config.toml
npx -y @agonx402/agentic setup --target claude-desktop   # standalone Claude Desktop GUI app config
npx -y @agonx402/agentic setup --target claude-code      # ~/.claude.json (Claude Code CLI agent)
npx -y @agonx402/agentic setup --target cursor           # ~/.cursor/mcp.json
npx -y @agonx402/agentic setup --target windsurf
npx -y @agonx402/agentic setup --target generic          # ~/.agon/mcp.json
npx -y @agonx402/agentic setup --target all --dry-run
```

`--target all` writes to every adapter listed above. **Claude Desktop** (the standalone macOS/Windows GUI app) and **Claude Code** (the terminal CLI agent) read MCP servers from different files; `--target all` registers in both. After setup, restart your agent client so it re-reads the MCP server list.

Setup creates `~/.agon/wallets/default.json`. `@agonx402/agent-wallet` **only signs Tokens API SIWX challenges** (`sign-in-with-x`). For Gateway routes that require **x402 exact payment** or other auth, set `AGON_SIGNER_COMMAND` to a signer that returns `PAYMENT-SIGNATURE` / `X-PAYMENT`.

### When `AGON_SIGNER_COMMAND` runs

- **Gateway MCP:** only when calling **`agon_gateway_auth_call`** and the gateway responds with **HTTP 402**. The MCP spawns `AGON_SIGNER_COMMAND` **once**, piping the normalized auth-request JSON to **stdin** (same shape as `agon_gateway_prepare_auth`). The process must exit 0 and print JSON to stdout: auth **headers**, or SIWX fallback (`address`, `signature`, optional `signatureEncoding`).
- **`gateway-cli`:** **`agon-gateway auth call`** and **`batch`** reuse the same `requestGateway` path: **after any 402** from the Gateway, **`AGON_SIGNER_COMMAND`** (or **`--auth-driver`**) runs if set. **`auth prepare`** / **`doctor`** never spawn the signer.

On Windows, when the signer command begins with **`npx`/`npm`/`pnpm`/`yarn`**, Node may run it **via cmd shell**. Treat **`AGON_SIGNER_COMMAND`** as equivalent to trusting a shell snippet if an attacker controls it.

## Skills And Wallet

Install all Agon skills into every supported agent skill directory (`~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`), and create the default convenience wallet used for SIWX/auth calls:

```bash
npx -y @agonx402/agentic install-skills
```

Other install targets:

```bash
npx -y @agonx402/agentic install-skills --target agents
npx -y @agonx402/agentic install-skills --target codex
npx -y @agonx402/agentic install-skills --target claude
npx -y @agonx402/agentic install-skills --target all
npx -y @agonx402/agentic list
npx -y @agonx402/agentic doctor
```

Use `--skip-wallet-setup` only when another signer wallet is already configured. The installer copies only the Agon skill folders, creates the target directory if needed, and overwrites only these Agon-owned skill names:

- `agon-gateway`
- `agon-protocol`
- `agon-gateway-payment-channels`

`install-skills` installs skills and creates `~/.agon/wallets/default.json`. `setup` performs skills, wallet, and MCP registration.

After `setup --target all`, the CLI bins are on PATH. Use them directly:

```bash
agon -p bitcoin
agon quote usdt --json
agon price bitcoin solana usdt
agon volume tesla gold --json
agon liquidity usdc usdt
agon search "bitcoin etf" --limit 5
agon profile tesla
agon variants gold
agon risk usdt
agon chart solana --interval 1D
agon-gateway catalog
agon-gateway agent-prompt
agon-gateway auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
agon-gateway auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
agon-gateway batch '[{"method":"GET","path":"/v1/x402/tokens/assets/solana/price-chart","query":{"interval":"1D"}},{"method":"GET","path":"/v1/x402/tokens/assets/bitcoin/price-chart","query":{"interval":"1D"}}]'
agon-gateway auth call GET /v1/x402/tokens/assets/tesla/profile
agon-gateway auth call GET /v1/x402/tokens/assets/gold/price-chart --query interval=1D
agon-wallet authorize --stdin
agon-protocol config
agon-protocol token show
```

If a bare bin is not on PATH (you ran `setup --skip-global-cli`, the global install hit a permission error, or you have not run `setup` yet), the same calls work via `npx -y @agonx402/gateway-cli ...`, `npx -y @agonx402/agent-wallet ...`, and `npx -y @agonx402/protocol-cli ...`. The MCP server entries also use `npx -y`, so you do not need a global install for MCP tools to work.

Agon Gateway should be the first source for API calls covered by the live catalog at `https://gateway.agonx402.com/v1/catalog`. Tokens API supports market data for crypto, currencies, treasuries, ETFs, metals, stocks, and their Solana token variants. Agents should use high-level Gateway CLI commands for common Tokens pulls (`quote`, `price`, `volume`, `liquidity`, `mcap`, `search`, `resolve`, `curated`, `profile`, `variants`, `markets`, `tickers`, `risk`, `chart`, `ohlcv`, `snapshots`) before raw route strings, and label whether values came from `canonicalMarket`, `stats`, `primaryVariant.market`, `profile.data`, tickers, or candles.

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
        "AGON_WALLET_PROFILE": "default"
      }
    },
    "agon-protocol": {
      "command": "npx",
      "args": ["-y", "@agonx402/protocol-mcp"]
    }
  }
}
```

`AGON_PAYMENT_MAX_AMOUNT_USD` and `AGON_PAYMENT_DAILY_LIMIT_USD` are optional: some x402 auth-prep responses include them for human review; **`agon-wallet` does not enforce them**.

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
- `agent-wallet/` publishes `@agonx402/agent-wallet`, a default **SIWX-only** Tokens API signer hook (replace with `AGON_SIGNER_COMMAND` for x402 exact-payment routes).
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
