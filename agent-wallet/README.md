# @ryvonetwork/agent-wallet

Default **SIWX-only** signer for Ryvo Gateway **Tokens API** routes (`sign-in-with-x`). It keeps first-time agent setup low-friction: create a wallet, point `RYVO_SIGNER_COMMAND` at `authorize`.

**Not supported here:** x402 exact-payment signing. For paid RPC/DAS/Helius-style exact routes, use a different `RYVO_SIGNER_COMMAND` that returns `PAYMENT-SIGNATURE` / `X-PAYMENT`.

```bash
npx -y @ryvonetwork/agent-wallet setup --profile default
npx -y @ryvonetwork/agent-wallet show --profile default
npx -y @ryvonetwork/agent-wallet authorize --stdin
```

`authorize` reads a normalized **`kind: "siwx"`** auth request from stdin and returns signer output:

```json
{
  "headers": {
    "SIGN-IN-WITH-X": "..."
  },
  "address": "...",
  "chainId": "solana:..."
}
```

External wallets replace this hook with the **same stdin JSON / stdout JSON** contract via `RYVO_SIGNER_COMMAND`.
