---
name: ryvo-gateway-payment-channels
description: |
  Sub-skill for `accessMode: "ryvo-channel"` Gateway routes only -- devnet Solana RPC/DAS/Helius
  Wallet calls authorized by signed cumulative Ryvo commitments and locked official devnet USDC.
  Use only when implementing or debugging channel-backed authorization (X-Ryvo-Request-Id +
  RYVO-COMMITMENT headers, channel locking, settlement bundles, BLS clearing). Does NOT cover
  market data, asset prices, Tokens API SIWX, or mainnet RPC/DAS/Wallet -- those route to the
  `ryvo-gateway` skill instead.
---

# Ryvo Gateway Payment Channels

## Overview

Use this skill for gateway devnet routes with `accessMode: "ryvo-channel"`. These routes authorize API calls against locked Ryvo Channel collateral and merchant-tracked unsettled cumulative commitments.

Tokens SIWX routes stay free/authenticated and do not use payment channels. Mainnet RPC/DAS/Wallet routes also do not use Ryvo payment channels in v1.

## Token Policy

Gateway-channel v1 uses official devnet USDC only:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Never use synthetic stablecoin names for gateway-channel examples.

## Buyer Agent Flow

1. Fetch `/v1/catalog` and select an `accessMode: "ryvo-channel"` route.
2. Read route metadata: `priceTokenAmount`, `programId`, `tokenId`, `merchantOwner`, `merchantParticipantId`, `messageDomain`, `tokenMint`.
3. Initialize participant if needed.
4. Deposit official devnet USDC.
5. Create a directed channel to the gateway merchant.
6. Lock USDC in that channel.
7. For each paid request, sign the next cumulative commitment amount.
8. Send:

```text
X-Ryvo-Request-Id: <stable idempotency id>
RYVO-COMMITMENT: <base64 JSON commitment envelope>
```

The gateway CLI can prepare the route metadata for a channel request:

```bash
node agentic/cli/ryvo-gateway.js auth prepare GET /v1/ryvo-channel/helius/devnet/wallet/balances/<wallet> --query limit=25 --json
```

For one-command calls, provide a wallet-agnostic auth driver that returns `X-Ryvo-Request-Id` and `RYVO-COMMITMENT`. The driver can use any wallet or custody layer; it does not need to be tied to a specific wallet standard.

## Gateway Authorization

The gateway verifies:

- commitment signature matches the channel authorized signer
- payee is the gateway merchant
- token is official devnet USDC
- program, cluster, token ID, and message domain match catalog metadata
- `newCommitmentAmount == latestAcceptedCommitted + priceTokenAmount`
- `newCommitmentAmount <= settledCumulative + max(0, lockedBalance - pendingUnlockAmount)`

The gateway reserves the request atomically in Redis before calling upstream. On upstream success it promotes the commitment. On upstream failure it releases the reservation.

## Settlement

Gateway v1 settles with `settleCommitmentBundle`, not BLS. Trigger settlement when:

- unsettled delta is at least `0.250000 USDC`
- oldest unsettled accepted commitment is at least `300s`
- remaining headroom is below `10%`

## Unlocks

Participant withdrawals are instant. Channel collateral is spendable by the gateway only while locked. Cooperative unlock is immediate, but the gateway should cooperate only after accepted unsettled commitments are settled or reconciled. Unilateral unlock remains the 72-hour fallback.

## References

Read `references/gateway-channel-flow.md` for the request contract and failure handling.
