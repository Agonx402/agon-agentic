# @agonx402/gateway-cli

CLI for discovering and calling Agon Gateway routes.

```bash
npx @agonx402/gateway-cli health
npx @agonx402/gateway-cli catalog --provider helius
npx @agonx402/gateway-cli routes --provider tokens
npx @agonx402/gateway-cli rpc getBalance '["11111111111111111111111111111111"]' --provider helius
```

Set `AGON_GATEWAY_BASE_URL` to override the default `https://gateway.agonx402.com`.

Payment and auth headers are caller-supplied:

- `--payment-signature <value>` for `PAYMENT-SIGNATURE`
- `--x-payment <value>` for `X-PAYMENT`
- `--siwx <value>` for `SIGN-IN-WITH-X`
