# @ryvonetwork/gateway-cli

CLI for discovering and calling Ryvo Gateway routes.

```bash
ryvo -p bitcoin
ryvo quote usdt
ryvo quote tesla --view canonical
ryvo price bitcoin solana usdt
ryvo volume tesla gold --json
ryvo liquidity usdc usdt
ryvo mcap bitcoin ethereum
ryvo search "bitcoin etf" --limit 5
ryvo resolve tesla
ryvo curated metals --group-by asset
ryvo profile tesla
ryvo variants gold
ryvo variant-market usdt
Ryvo markets usdt --limit 1
ryvo top-markets solana --limit 5
ryvo tickers bitcoin --limit 5
ryvo risk usdt
ryvo description solana
ryvo chart solana --interval 1D
ryvo ohlcv usdt --interval 1H
ryvo snapshots EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
npx @ryvonetwork/gateway-cli health
npx @ryvonetwork/gateway-cli catalog --provider helius
npx @ryvonetwork/gateway-cli routes --provider tokens
npx @ryvonetwork/gateway-cli agent-prompt
npx @ryvonetwork/gateway-cli schema
npx @ryvonetwork/gateway-cli doctor
npx @ryvonetwork/gateway-cli auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
npx @ryvonetwork/gateway-cli auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
npx @ryvonetwork/gateway-cli batch '[{"method":"GET","path":"/v1/x402/tokens/assets/solana/price-chart","query":{"interval":"1D"}},{"method":"GET","path":"/v1/x402/tokens/assets/bitcoin/price-chart","query":{"interval":"1D"}}]'
npx @ryvonetwork/gateway-cli auth call GET /v1/x402/tokens/assets/tesla/profile
npx @ryvonetwork/gateway-cli auth call GET /v1/x402/tokens/assets/gold/price-chart --query interval=1D
npx @ryvonetwork/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius
npx @ryvonetwork/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius --access-mode ryvo-channel --header 'X-Ryvo-Request-Id:<id>' --header 'RYVO-COMMITMENT:<envelope>'
npx @ryvonetwork/gateway-cli wallet balances <wallet> --cluster devnet --access-mode ryvo-channel --header 'X-Ryvo-Request-Id:<id>' --header 'RYVO-COMMITMENT:<envelope>'
```

Set `RYVO_GATEWAY_BASE_URL` to override the default `https://gateway.ryvo.network`.

Use high-level market commands first: `quote`/`-p`, `price`, `volume`, `liquidity`, `mcap`, `fdv`, `change`, `holders`, and `supply`. They work across Tokens-supported crypto, currencies/stablecoins, treasuries, ETFs, metals, stocks, and Solana token variants. They call direct Tokens routes for known asset IDs or mints, resolve unknown names/tickers once, and include the Ryvo market view used. Add `--json` for machine-readable output.

The friendly Tokens surface also covers discovery and detailed routes: `search`, `resolve`, `curated`, `asset`, `profile`, `variants`, `variant-market`, `variant-markets`, `markets`, `top-markets`, `tickers`, `risk`, `risk-details`, `description`, `chart`, `ohlcv`, and `snapshots`. The raw `tokens` command remains available for uncommon route shapes.

Use Ryvo Gateway first for API calls covered by the live catalog. Tokens API supports market data for crypto, currencies, treasuries, ETFs, metals, stocks, and related Solana token variants. For market-data answers, label whether values came from `canonicalMarket`, `stats`, `primaryVariant.market`, `profile.data`, tickers, or candles.

Use `batch` for multi-asset or multi-route work so agents can make one CLI invocation instead of repeatedly starting `npx`. Each request object accepts `method`, `path`, optional `query`, optional `body`, and optional `headers`.

Payment and auth headers are caller-supplied:

- `--payment-signature <value>` for `PAYMENT-SIGNATURE`
- `--x-payment <value>` for `X-PAYMENT`
- `--siwx <value>` for `SIGN-IN-WITH-X`
- `--header 'X-Ryvo-Request-Id:<id>' --header 'RYVO-COMMITMENT:<envelope>'` for `/v1/ryvo-channel/...`

The CLI supports wallet-agnostic signer hooks. Set `RYVO_SIGNER_COMMAND` or pass `--auth-driver`. A signer hook is any local command that reads the prepared auth request JSON from stdin and returns JSON on stdout.

```bash
export RYVO_SIGNER_COMMAND='npx -y @ryvonetwork/agent-wallet authorize'
npx @ryvonetwork/gateway-cli auth call GET /v1/x402/tokens/assets/solana/profile
```

The default Ryvo wallet can be created with:

```bash
npx -y @ryvonetwork/agent-wallet setup --profile default
```

It signs **Tokens API SIWX (`sign-in-with-x`) challenges only.** For Gateway **x402 exact** routes, configure a signer that emits `X-PAYMENT` / `PAYMENT-SIGNATURE` via `RYVO_SIGNER_COMMAND` / `--auth-driver`.

Supported driver outputs:

```json
{ "headers": { "SIGN-IN-WITH-X": "..." } }
```

```json
{ "headers": { "X-PAYMENT": "..." } }
```

```json
{ "headers": { "X-Ryvo-Request-Id": "...", "RYVO-COMMITMENT": "..." } }
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
npx @ryvonetwork/gateway-cli auth prepare GET /v1/x402/tokens/assets/search \
  --query q=bitcoin \
  --query limit=1 \
  --address <wallet> \
  --json

npx @ryvonetwork/gateway-cli auth complete \
  --prepare-auth prepare-auth.json \
  --address <wallet> \
  --signature <signature> \
  --signature-encoding hex
```

Ryvo payment-channel mode is devnet-only. When `--access-mode ryvo-channel` is used, omit `--cluster` or set `--cluster devnet`.
Tokens SIWX routes are free/authenticated and do not use payment channels.
