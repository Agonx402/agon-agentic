# Agon Protocol Flows

This reference is for agents that need a fuller operational playbook than `SKILL.md`. Keep actions read + prepare unless the user explicitly asks a wallet or deployment script to sign and broadcast.

## Canonical Read Order

Before preparing a state-changing action, read:

1. `GlobalConfig`
2. `TokenRegistry`
3. payer and payee `ParticipantAccount`
4. target `ChannelState`, if the action is channel-specific
5. latest off-chain merchant ledger state, if the action is for gateway-channel authorization

Use SDK readers:

```ts
const config = await client.fetchGlobalConfig();
const registry = await client.fetchTokenRegistry();
const payer = await client.fetchParticipant(payerOwner);
const payee = await client.fetchParticipant(payeeOwner);
const channel = await client.fetchChannel({ payerOwner, payeeOwner, tokenId });
```

## Token Resolution

Gateway-channel v1 uses official devnet USDC:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Resolve `token_id` in this order:

1. explicit `tokenId` supplied by the caller
2. `AGON_PROTOCOL_DEVNET_USDC_TOKEN_ID`
3. live `TokenRegistry` entry matching the official mint
4. deployment config entry matching the official mint

Never assume a demo token ID.

## Instruction Playbooks

### initialize

Deployment-only. Creates `GlobalConfig`, fixes chain ID and message domain, and records mutable authorities and fee values. Do not call during normal agent payment flows.

### update_config and accept_config_authority

Authority-only. Prepare only when an operator is changing mutable protocol config. Never claim this can change chain ID, message domain, or existing token mappings.

### initialize_token_registry, register_token, update_registry_authority, accept_registry_authority

Registry authority flows. Use to set up token allowlisting. For gateway-channel v1, official devnet USDC must be allowlisted before agents can deposit, lock, or settle that token.

### initialize_participant

Creates durable participant identity for an owner wallet. Use before deposits, channels, or withdrawals. The participant ID is stable for the deployment.

### register_participant_bls_key

Registers the participant BLS key used by `settle_clearing_round`. There is no rotation path yet. Do not use this for unilateral gateway request commitments.

### update_inbound_channel_policy

Controls whether other participants can open channels to this participant:

- `Permissionless`: anyone may open a channel to this participant.
- `ConsentRequired`: payee signature is required on channel creation.
- `Disabled`: no new inbound channels.

### deposit and deposit_for

`deposit` credits the signer participant. `deposit_for` is for batch funding multiple participants. Tokens must be registered in `TokenRegistry`.

### request_withdrawal, cancel_withdrawal, execute_withdrawal_timelocked

Withdrawals use participant available balance, not locked channel collateral. Live devnet participant withdrawals are instant, but agents should still treat the flow as request/cancel/execute because the program exposes those instructions.

### create_channel

Creates a permanent directed channel for `(payer_id, payee_id, token_id)`. The channel should exist before any commitments are signed or settled. If the payee's inbound policy requires consent, the payee must sign.

### lock_channel_funds

Moves payer available balance into channel locked collateral. This is the backing capacity gateway-channel v1 uses for authorization.

### request_unlock_channel_funds and execute_unlock_channel_funds

Unilateral unlock. The payer requests a pending unlock; after 72 hours on live devnet, the pending amount can return to payer available balance. Merchants should settle accepted commitments before the delay expires.

### cooperative_unlock_channel_funds

Immediate unlock with payer and payee consent. Merchants should only cooperate after settling or reconciling accepted commitments.

### request_update_channel_authorized_signer and execute_update_channel_authorized_signer

Timelocked signer rotation for a channel. Use when the key authorized to sign cumulative commitments needs to change. Pending commitments signed by the old key may still matter until settled/reconciled according to channel state and program validation.

### settle_individual

Settles one `agon-cmt-v5` cumulative commitment. Submitter must be the payee or an authorized settler included in the message. Requires an Ed25519 verification instruction in the same transaction.

### settle_commitment_bundle

Settles multiple unilateral commitments for one payee. This is the right settlement path for gateway request commitments. Requires multi-message Ed25519 pre-instruction matching the commitments being settled.

### settle_clearing_round

Settles cooperative multilateral clearing with Agon-specific BLS. Use only for coordinated clearing rounds, not gateway request settlement v1.

## Commitment Validation Checklist

Before accepting or settling a unilateral commitment:

- message version is `agon-cmt-v5`
- message domain equals live deployment domain
- payer ID, payee ID, token ID, and channel PDA match
- token ID resolves to the expected mint
- committed amount is greater than current `settledCumulative`
- signer equals channel `authorizedSigner`
- optional `authorizedSettler` is either absent or matches the submitter policy
- Ed25519 pre-instruction verifies the exact message bytes

## Gateway Headroom Math

Gateway spendable channel headroom:

```text
effectiveLocked = max(0, lockedBalance - pendingUnlockAmount)
maxAuthorized = settledCumulative + effectiveLocked
remainingHeadroom = max(0, maxAuthorized - latestAcceptedCommitted)
```

`latestAcceptedCommitted` includes the merchant's accepted but not yet settled off-chain commitments. Never authorize a new cumulative commitment above `maxAuthorized`.

Per request:

```text
newCommitmentAmount = latestAcceptedCommitted + routePriceTokenAmount
```

Reject if the amount skips, repeats, decreases, targets the wrong merchant, targets the wrong program/cluster/domain/token, or exceeds `maxAuthorized`.

## Settlement Choices

Use this decision tree:

- One payee settling one payer channel: `settleIndividual`.
- One payee settling many payer channels: `settleCommitmentBundle`.
- Gateway request settlement: `settleCommitmentBundle`.
- Multiple participants co-signing a netted round: `settleClearingRound`.
- Channel collateral release with both sides online: `cooperativeUnlockChannelFunds`.
- Channel collateral release with payee offline: `requestUnlockChannelFunds`, then `executeUnlockChannelFunds` after 72 hours.

## SDK Transaction Pattern

Every `AgonClient` state-changing method returns an Anchor methods builder:

```ts
await client
  .lockChannelFunds({ owner, payeeOwner, tokenId, amount })
  .then((builder) => builder.signers([payer]).rpc());
```

For async helpers like `createChannel`, `lockChannelFunds`, and unlock methods, await the builder first:

```ts
const builder = await client.createChannel({
  owner: payer.publicKey,
  payeeOwner: payee.publicKey,
  tokenId,
  authorizedSigner: null,
});

await builder.signers([payer]).rpc();
```

For read + prepare tooling, return the instruction, transaction, message bytes, PDA list, and expected signers. Do not sign or broadcast.
