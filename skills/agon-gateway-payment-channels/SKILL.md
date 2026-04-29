---
name: agon-gateway-payment-channels
description: Use when integrating Agon Gateway with Agon Protocol payment channels, authorizing gateway API calls with signed cumulative commitments, locking official devnet USDC into merchant channels, or implementing channel-backed access for Solana RPC, DAS, or Helius Wallet routes.
---

# Agon Gateway Payment Channels

## Overview

Use this skill for gateway devnet routes with `accessMode: "agon-channel"`. These routes authorize API calls against locked Agon channel collateral and merchant-tracked unsettled cumulative commitments.

Tokens SIWX routes stay free/authenticated and do not use payment channels. Mainnet RPC/DAS/Wallet routes also do not use Agon payment channels in v1.

## Token Policy

Gateway-channel v1 uses official devnet USDC only:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Never use synthetic stablecoin names for gateway-channel examples.

## Buyer Agent Flow

1. Fetch `/v1/catalog` and select an `accessMode: "agon-channel"` route.
2. Read route metadata: `priceTokenAmount`, `programId`, `tokenId`, `merchantOwner`, `merchantParticipantId`, `messageDomain`, `tokenMint`.
3. Initialize participant if needed.
4. Deposit official devnet USDC.
5. Create a directed channel to the gateway merchant.
6. Lock USDC in that channel.
7. For each paid request, sign the next cumulative commitment amount.
8. Send:

```text
X-Agon-Request-Id: <stable idempotency id>
AGON-COMMITMENT: <base64 JSON commitment envelope>
```

The gateway CLI can prepare the route metadata for a channel request:

```bash
node agentic/cli/agon-gateway.js auth prepare GET /v1/agon-channel/helius/devnet/wallet/balances/<wallet> --query limit=25 --json
```

For one-command calls, provide a wallet-agnostic auth driver that returns `X-Agon-Request-Id` and `AGON-COMMITMENT`. The driver can use any wallet or custody layer; it does not need to be tied to a specific wallet standard.

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
