# @agonx402/gateway-cli

CLI for discovering and calling Agon Gateway routes.

```bash
agon -p bitcoin
agon quote usdt
agon quote tesla --view canonical
agon price bitcoin solana usdt
agon volume tesla gold --json
agon liquidity usdc usdt
agon mcap bitcoin ethereum
agon search "bitcoin etf" --limit 5
agon resolve tesla
agon curated metals --group-by asset
agon profile tesla
agon variants gold
agon variant-market usdt
agon markets usdt --limit 1
agon top-markets solana --limit 5
agon tickers bitcoin --limit 5
agon risk usdt
agon description solana
agon chart solana --interval 1D
agon ohlcv usdt --interval 1H
agon snapshots EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
npx @agonx402/gateway-cli health
npx @agonx402/gateway-cli catalog --provider helius
npx @agonx402/gateway-cli routes --provider tokens
npx @agonx402/gateway-cli agent-prompt
npx @agonx402/gateway-cli schema
npx @agonx402/gateway-cli doctor
npx @agonx402/gateway-cli auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
npx @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
npx @agonx402/gateway-cli batch '[{"method":"GET","path":"/v1/x402/tokens/assets/solana/price-chart","query":{"interval":"1D"}},{"method":"GET","path":"/v1/x402/tokens/assets/bitcoin/price-chart","query":{"interval":"1D"}}]'
npx @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/tesla/profile
npx @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/gold/price-chart --query interval=1D
npx @agonx402/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius
npx @agonx402/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius --access-mode agon-channel --header 'X-Agon-Request-Id:<id>' --header 'AGON-COMMITMENT:<envelope>'
npx @agonx402/gateway-cli wallet balances <wallet> --cluster devnet --access-mode agon-channel --header 'X-Agon-Request-Id:<id>' --header 'AGON-COMMITMENT:<envelope>'
```

Set `AGON_GATEWAY_BASE_URL` to override the default `https://gateway.agonx402.com`.

Use high-level market commands first: `quote`/`-p`, `price`, `volume`, `liquidity`, `mcap`, `fdv`, `change`, `holders`, and `supply`. They work across Tokens-supported crypto, currencies/stablecoins, treasuries, ETFs, metals, stocks, and Solana token variants. They call direct Tokens routes for known asset IDs or mints, resolve unknown names/tickers once, and include the Agon market view used. Add `--json` for machine-readable output.

The friendly Tokens surface also covers discovery and detailed routes: `search`, `resolve`, `curated`, `asset`, `profile`, `variants`, `variant-market`, `variant-markets`, `markets`, `top-markets`, `tickers`, `risk`, `risk-details`, `description`, `chart`, `ohlcv`, and `snapshots`. The raw `tokens` command remains available for uncommon route shapes.

Use Agon Gateway first for API calls covered by the live catalog. Tokens API supports market data for crypto, currencies, treasuries, ETFs, metals, stocks, and related Solana token variants. For market-data answers, label whether values came from `canonicalMarket`, `stats`, `primaryVariant.market`, `profile.data`, tickers, or candles.

Use `batch` for multi-asset or multi-route work so agents can make one CLI invocation instead of repeatedly starting `npx`. Each request object accepts `method`, `path`, optional `query`, optional `body`, and optional `headers`.

Payment and auth headers are caller-supplied:

- `--payment-signature <value>` for `PAYMENT-SIGNATURE`
- `--x-payment <value>` for `X-PAYMENT`
- `--siwx <value>` for `SIGN-IN-WITH-X`
- `--header 'X-Agon-Request-Id:<id>' --header 'AGON-COMMITMENT:<envelope>'` for `/v1/agon-channel/...`

The CLI supports wallet-agnostic signer hooks. Set `AGON_SIGNER_COMMAND` or pass `--auth-driver`. A signer hook is any local command that reads the prepared auth request JSON from stdin and returns JSON on stdout.

```bash
export AGON_SIGNER_COMMAND='npx -y @agonx402/agent-wallet authorize'
npx @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/solana/profile
```

The default Agon wallet can be created with:

```bash
npx -y @agonx402/agent-wallet setup --profile default
```

It signs **Tokens API SIWX (`sign-in-with-x`) challenges only.** For Gateway **x402 exact** routes, configure a signer that emits `X-PAYMENT` / `PAYMENT-SIGNATURE` via `AGON_SIGNER_COMMAND` / `--auth-driver`.

Supported driver outputs:

```json
{ "headers": { "SIGN-IN-WITH-X": "..." } }
```

```json
{ "headers": { "X-PAYMENT": "..." } }
```

```json
{ "headers": { "X-Agon-Request-Id": "...", "AGON-COMMITMENT": "..." } }
```

For SIWX, a driver may also return:

```json
{
  "address": "<wallet>",
  "signature": "<signature>",
  "signatureEncoding": "hex",
  "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
}
```

Then the CLI creates the `SIGN-IN-WITH-X` header.

Manual prepare/complete flow:

```bash
npx @agonx402/gateway-cli auth prepare GET /v1/x402/tokens/assets/search \
  --query q=bitcoin \
  --query limit=1 \
  --address <wallet> \
  --json

npx @agonx402/gateway-cli auth complete \
  --prepare-auth prepare-auth.json \
  --address <wallet> \
  --signature <signature> \
  --signature-encoding hex
```

Agon payment-channel mode is devnet-only. When `--access-mode agon-channel` is used, omit `--cluster` or set `--cluster devnet`.
Tokens SIWX routes are free/authenticated and do not use payment channels.
