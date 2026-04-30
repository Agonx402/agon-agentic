# @agonx402/agent-wallet

Generic local agent wallet and signer hook for Agon Gateway.

The wallet is a convenience agent wallet. It is intended for SIWX, small x402
payments, and development workflows, not high-value custody.

```bash
npx -y @agonx402/agent-wallet setup --profile default
npx -y @agonx402/agent-wallet show --profile default
npx -y @agonx402/agent-wallet authorize --stdin
```

`authorize` reads a normalized Agon auth request from stdin and returns headers
or signer output:

```json
{
  "headers": {
    "SIGN-IN-WITH-X": "..."
  },
  "address": "...",
  "chainId": "solana:..."
}
```

External wallets can replace this package by implementing the same stdin/stdout
contract and setting `AGON_SIGNER_COMMAND`.
