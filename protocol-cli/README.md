# @agonx402/protocol-cli

Read-only and prepare-only CLI for Agon Protocol agents.

```bash
npx @agonx402/protocol-cli config
npx @agonx402/protocol-cli token show
npx @agonx402/protocol-cli participant show --owner <owner>
npx @agonx402/protocol-cli channel headroom --payer-id 1 --payee-id 2 --latest-accepted 1000
npx @agonx402/protocol-cli clearing preview --participants 20 --channels 84
npx @agonx402/protocol-cli prepare deposit --owner <owner> --owner-token-account <ata> --amount 1000000 --token-id <id>
npx @agonx402/protocol-cli prepare create-channel --owner <payer-owner> --payee-owner <payee-owner> --payer-id 1 --payee-id 2 --token-id <id>
npx @agonx402/protocol-cli prepare lock --owner <payer-owner> --payee-owner <payee-owner> --payer-id 1 --payee-id 2 --amount 1000000 --token-id <id>
npx @agonx402/protocol-cli prepare settle-bundle --payee-account <participant> --submitter <wallet> --payee-id 2 --token-id <id> --entries '[{"payerId":1,"settledCumulative":"0","committedAmount":"1000"}]'
npx @agonx402/protocol-cli prepare gateway-commitment --payer-id 1 --payee-id 2 --token-id <id> --committed-amount 1000 --signer <authorized-signer>
```

The CLI never stores private keys, signs transactions, or broadcasts. On devnet it defaults to official USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.

The default devnet program ID is `3UyUFeNsUYPpM6hMRf7H8wg3MKEXQ82rqnsXhZrUwgSD`. Override with `--program-id` or `AGON_PROTOCOL_PROGRAM_ID`.

`prepare <flow>` returns a stable JSON instruction/account/message plan for protocol flows including participant init, deposit, deposit-for, create-channel, lock, request/execute unlock, withdrawal, individual settlement, bundle settlement, clearing rounds, signer rotation, registry/config authority handoff, and gateway commitment payloads.
