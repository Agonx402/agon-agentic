# @agonx402/gateway-cli

CLI for discovering and calling Agon Gateway routes.

```bash
npx @agonx402/gateway-cli health
npx @agonx402/gateway-cli catalog --provider helius
npx @agonx402/gateway-cli routes --provider tokens
npx @agonx402/gateway-cli agent-prompt
npx @agonx402/gateway-cli schema
npx @agonx402/gateway-cli doctor
npx @agonx402/gateway-cli auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
npx @agonx402/gateway-cli auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --auth-driver my-wallet-auth-driver
npx @agonx402/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius
npx @agonx402/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius --access-mode agon-channel --header 'X-Agon-Request-Id:<id>' --header 'AGON-COMMITMENT:<envelope>'
npx @agonx402/gateway-cli wallet balances <wallet> --cluster devnet --access-mode agon-channel --header 'X-Agon-Request-Id:<id>' --header 'AGON-COMMITMENT:<envelope>'
```

Set `AGON_GATEWAY_BASE_URL` to override the default `https://gateway.agonx402.com`.

Payment and auth headers are caller-supplied:

- `--payment-signature <value>` for `PAYMENT-SIGNATURE`
- `--x-payment <value>` for `X-PAYMENT`
- `--siwx <value>` for `SIGN-IN-WITH-X`
- `--header 'X-Agon-Request-Id:<id>' --header 'AGON-COMMITMENT:<envelope>'` for `/v1/agon-channel/...`

The CLI also supports wallet-agnostic auth drivers. An auth driver is any local command that reads the prepared auth request JSON from stdin and returns JSON on stdout. The CLI does not store keys, sign messages, submit payments, or edit wallet config.

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
  --challenge challenge.json \
  --address <wallet> \
  --signature <signature> \
  --signature-encoding hex
```

Agon payment-channel mode is devnet-only. When `--access-mode agon-channel` is used, omit `--cluster` or set `--cluster devnet`.
Tokens SIWX routes are free/authenticated and do not use payment channels.
