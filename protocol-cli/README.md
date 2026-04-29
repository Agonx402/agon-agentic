# @agonx402/protocol-cli

Read-only and prepare-only CLI for Agon Protocol agents.

```bash
npx @agonx402/protocol-cli config
npx @agonx402/protocol-cli token show
npx @agonx402/protocol-cli participant show --owner <owner>
npx @agonx402/protocol-cli channel headroom --payer-id 1 --payee-id 2 --latest-accepted 1000
npx @agonx402/protocol-cli prepare gateway-commitment --program-id <program> --payer-id 1 --payee-id 2 --token-id <id> --committed-amount 1000 --signer <authorized-signer>
```

The CLI never stores private keys, signs transactions, or broadcasts. On devnet it defaults to official USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
