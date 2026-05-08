---
name: ryvo-protocol
description: Use when a task involves Ryvo Protocol accounts, deposits, withdrawals, payment channels, channel locks/unlocks, cumulative commitments, bundle settlement, BLS clearing, protocol CLI/MCP tools, SDK usage, or building agents that interact with the Ryvo Solana program.
---

# Ryvo Protocol

Use this skill when an agent needs to read Ryvo Protocol state, prepare protocol actions, reason about channel collateral, build signed commitment payloads, or choose a settlement path.

## Hard Rules

- Use `@ryvonetwork/sdk` as the source of truth for PDAs, IDL, message bytes, and protocol helpers.
- The protocol CLI and MCP are read + prepare only. They never store private keys, sign messages, or broadcast transactions.
- Wallet layers sign and submit transactions. Do not ask protocol CLI/MCP tools to custody keys.
- On devnet, gateway-channel v1 uses official devnet USDC only: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Resolve the official devnet USDC `token_id` from `TokenRegistry`, deployment config, or `RYVO_PROTOCOL_DEVNET_USDC_TOKEN_ID`. Do not hardcode demo token IDs.
- Do not use synthetic stablecoin names in docs, skills, CLI/MCP output, gateway channel catalog copy, or examples.
- Participant withdrawals are instant on the live devnet deployment.
- Unilateral channel unlocks take 72 hours.
- Cooperative channel unlocks are immediate when both channel counterparties consent.
- Gateway request settlement v1 uses `settleCommitmentBundle`, not BLS.

## Live Devnet Defaults

```text
cluster: devnet
chainId: 1
programId: 3UyUFeNsUYPpM6hMRf7H8wg3MKEXQ82rqnsXhZrUwgSD
messageDomain: a58a109a38f14cc27ef174135176cab3
officialDevnetUsdcMint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
participantWithdrawalDelay: 0 seconds
unilateralChannelUnlockDelay: 259200 seconds
```

## Tooling

Prefer published packages in agent/runtime contexts:

```bash
npx @ryvonetwork/protocol-cli config
npx @ryvonetwork/protocol-cli token show
npx @ryvonetwork/protocol-cli participant show --owner <owner>
npx @ryvonetwork/protocol-cli channel show --payer-id <payer-id> --payee-id <payee-id> --token-id <token-id>
npx @ryvonetwork/protocol-cli channel headroom --payer-id <payer-id> --payee-id <payee-id> --token-id <token-id> --latest-accepted <amount>
npx @ryvonetwork/protocol-cli clearing preview --participants <n> --channels <n>
npx @ryvonetwork/protocol-cli prepare deposit --owner <owner> --owner-token-account <ata> --amount <base-units> --token-id <token-id>
npx @ryvonetwork/protocol-cli prepare create-channel --owner <payer-owner> --payee-owner <payee-owner> --payer-id <payer-id> --payee-id <payee-id> --token-id <token-id>
npx @ryvonetwork/protocol-cli prepare settle-bundle --payee-account <participant> --submitter <wallet> --payee-id <payee-id> --token-id <token-id> --entries '<json-array>'
npx @ryvonetwork/protocol-cli prepare gateway-commitment --payer-id <payer-id> --payee-id <payee-id> --token-id <token-id> --committed-amount <amount> --signer <authorized-signer>
npx @ryvonetwork/protocol-cli verify gateway-commitment --envelope <base64-json-envelope>
```

Local repo equivalents:

```bash
node C:/Ryvo/Ryvo/agentic/protocol-cli/ryvo-protocol.js config
node C:/Ryvo/Ryvo/agentic/protocol-cli/ryvo-protocol.js token show
```

MCP:

```json
{
  "mcpServers": {
    "ryvo-protocol": {
      "command": "npx",
      "args": ["-y", "@ryvonetwork/protocol-mcp"],
      "env": {
        "SOLANA_DEVNET_RPC_URL": "https://api.devnet.solana.com"
      }
    }
  }
}
```

MCP resource:

```text
Ryvo://protocol/llm.txt
```

MCP tools include config, token, participant, channel, headroom, clearing preview, prepare gateway commitment, verify gateway commitment, and concrete prepare action plans for the protocol instruction set.

## SDK Imports

Use the SDK instead of manually deriving PDAs or encoding messages:

```ts
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  RyvoClient,
  RYVO_CHAIN_IDS,
  RYVO_PROTOCOL_PROGRAM_ID,
  INBOUND_CHANNEL_POLICY,
  OFFICIAL_DEVNET_USDC_MINT,
  buildGatewayCommitmentPayload,
  calculateChannelHeadroom,
  createCommitmentMessage,
  createEd25519Instruction,
  createGatewayCommitmentMessage,
  createMultiMessageEd25519Instruction,
  deriveMessageDomain,
  encodeGatewayCommitmentEnvelope,
  getTokenBalance,
  nextCommitmentAmount,
  prepareCommitmentBundleSettlementPlan,
  resolveCanonicalDevnetUsdcToken,
  verifyGatewayCommitmentEnvelope,
} from "@ryvonetwork/sdk";
```

Construct a client:

```ts
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const client = new RyvoClient({
  provider,
  programId: RYVO_PROTOCOL_PROGRAM_ID,
});
```

Read state:

```ts
const config = await client.fetchGlobalConfig();
const registry = await client.fetchTokenRegistry();
const participant = await client.fetchParticipant(owner);
const channel = await client.fetchChannel({ channelState });
```

Resolve official devnet USDC:

```ts
const usdc = resolveCanonicalDevnetUsdcToken({
  registry,
  env: process.env,
});

const tokenId = usdc.tokenId;
```

## Account Model

- `GlobalConfig`: authority, fee settings, chain ID, message domain, timing policy.
- `TokenRegistry`: allowlisted token mints keyed by `token_id`.
- `ParticipantAccount`: stable `participant_id`, owner, per-token balances, withdrawal state, inbound channel policy, optional BLS key.
- `ChannelState`: directed payer-to-payee channel for one token, settled cumulative amount, locked collateral, pending unlock, authorized signer.
- `vault-token-account`: PDA-owned SPL token account for a registered token.

Use SDK PDA helpers or `RyvoClient` address methods:

```ts
client.globalConfigAddress();
client.tokenRegistryAddress();
client.participantAddress(owner);
client.vaultTokenAccountAddress(tokenId);
client.channelAddress(payerId, payeeId, tokenId);
client.programDataAddress();
```

## Instruction Map

Every on-chain instruction and when to use it:

| Instruction | Who uses it | Purpose |
| --- | --- | --- |
| `initialize` | upgrade/config authority | Create `GlobalConfig`, set chain ID, fee policy, registration fee, authorities, and message domain. |
| `update_config` | config authority | Update mutable config values such as fees, fee recipient, registration fee, or pending config authority. Chain ID and message domain are immutable. |
| `accept_config_authority` | pending config authority | Accept config authority handoff. |
| `initialize_token_registry` | registry authority/deployer | Create token registry once after deployment. |
| `register_token` | registry authority | Add an allowlisted settlement token and vault token account. |
| `update_registry_authority` | registry authority | Nominate a pending token registry authority. |
| `accept_registry_authority` | pending registry authority | Accept registry authority handoff. |
| `initialize_participant` | wallet owner | Create a participant identity and pay registration fee. |
| `register_participant_bls_key` | participant owner | Register one BLS key for cooperative clearing rounds. No rotation path exists yet. |
| `update_inbound_channel_policy` | participant owner | Set inbound channel policy: permissionless, consent-required, or disabled. |
| `deposit` | participant owner | Move registered SPL tokens from owner token account into protocol vault and credit participant balance. |
| `deposit_for` | funding party/operator | Deposit a registered token for multiple participants in one transaction. |
| `request_withdrawal` | participant owner | Move available participant balance into pending withdrawal state for a token. Current devnet withdrawals are instant. |
| `cancel_withdrawal` | participant owner | Cancel a pending withdrawal and return it to available balance. |
| `execute_withdrawal_timelocked` | anyone after delay | Transfer pending withdrawal from vault to destination token account, less protocol fee. |
| `create_channel` | payer, and sometimes payee | Create permanent directed channel for payer, payee, token. Payee signs if inbound policy requires consent. |
| `lock_channel_funds` | payer | Ring-fence available participant balance as collateral for one channel. |
| `request_unlock_channel_funds` | payer | Start unilateral channel collateral unlock. Payee has 72 hours on devnet to settle accepted commitments. |
| `execute_unlock_channel_funds` | payer after delay | Return pending unlocked channel collateral to payer available balance. |
| `cooperative_unlock_channel_funds` | payer and payee | Immediately release locked channel collateral with both parties' signatures. |
| `request_update_channel_authorized_signer` | payer | Start timelocked rotation of the key allowed to sign channel commitments. |
| `execute_update_channel_authorized_signer` | payer after delay | Finalize authorized signer rotation. |
| `settle_individual` | payee or authorized settler | Settle one signed cumulative `ryvo-cmt-v5` commitment for one channel. |
| `settle_commitment_bundle` | payee or authorized settler | Settle many signed cumulative commitments for one payee in one transaction. |
| `settle_clearing_round` | submitter | Settle an Ryvo-specific BLS cooperative clearing round across many participants. |

The SDK wraps common user-flow instructions through `RyvoClient`. Admin and less-common generated IDL methods are still available through `client.program.methods.<instructionName>(...)`.

## Participant Setup Flow

1. Fetch `GlobalConfig` and `TokenRegistry`.
2. Resolve `tokenId` for official devnet USDC.
3. Initialize payer and payee participants if missing.
4. Deposit USDC into payer participant balance.
5. Create a channel from payer to payee.
6. Lock collateral into that channel if the payee requires guaranteed capacity.

SDK shape:

```ts
const feeRecipient = (await client.fetchGlobalConfig()).feeRecipient;

await client
  .initializeParticipant({ owner: payer.publicKey, feeRecipient })
  .signers([payer])
  .rpc();

await client
  .deposit({
    owner: payer.publicKey,
    ownerTokenAccount: payerUsdcAta,
    tokenId,
    amount: 10_000_000n,
  })
  .signers([payer])
  .rpc();

await client
  .createChannel({
    owner: payer.publicKey,
    payeeOwner: payee.publicKey,
    tokenId,
    authorizedSigner: null,
  })
  .signers([payer])
  .rpc();

await client
  .lockChannelFunds({
    owner: payer.publicKey,
    payeeOwner: payee.publicKey,
    tokenId,
    amount: 1_000_000n,
  })
  .signers([payer])
  .rpc();
```

## Commitment Flow

Ryvo commitments are cumulative. A commitment for `committedAmount = 10_000` means "this channel is authorized up to total 10_000", not "pay 10_000 again".

1. Fetch channel.
2. Compute next cumulative amount from `settledCumulative`.
3. Build exact message bytes with `createCommitmentMessage`.
4. Authorized signer signs those bytes.
5. Payee submits `settleIndividual` with Ed25519 verification pre-instruction.

```ts
const messageDomain = deriveMessageDomain(client.programId, RYVO_CHAIN_IDS.devnet);
const channel = await client.fetchChannel({ channelState });
const committedAmount = nextCommitmentAmount(channel, 250_000n);

const message = createCommitmentMessage({
  messageDomain,
  payerId,
  payeeId,
  tokenId,
  committedAmount,
  authorizedSettler: null,
});

const ed25519Ix = createEd25519Instruction(authorizedSignerKeypair, message);

await client
  .settleIndividual({
    payerAccount,
    payeeAccount,
    channelState,
    submitter: payee.publicKey,
  })
  .preInstructions([ed25519Ix])
  .signers([payee])
  .rpc();
```

## Bundle Settlement Flow

Use bundle settlement when one payee has accepted commitments from many payer channels in the same token.

```ts
const plan = prepareCommitmentBundleSettlementPlan({
  payeeId,
  tokenId,
  entries: acceptedCommitments.map((entry) => ({
    payerId: entry.payerId,
    settledCumulative: entry.settledCumulative,
    committedAmount: entry.committedAmount,
    channelState: entry.channelState,
    signer: entry.signer,
    signature: entry.signature,
  })),
});

const ed25519Ix = createMultiMessageEd25519Instruction(
  acceptedCommitments.map((entry) => ({
    signer: entry.signerKeypair,
    message: entry.message,
  })),
);

await client
  .settleCommitmentBundle({
    count: plan.count,
    payeeAccount,
    submitter: payee.publicKey,
  })
  .preInstructions([ed25519Ix])
  .signers([payee])
  .rpc();
```

## Gateway Channel Authorization Flow

Gateway v1 authorizes against locked channel collateral plus merchant-tracked unsettled commitments.

Headroom math:

```text
effectiveLocked = max(0, lockedBalance - pendingUnlockAmount)
maxAuthorized = settledCumulative + effectiveLocked
remainingHeadroom = max(0, maxAuthorized - latestAcceptedCommitted)
```

Rules:

- Load fresh channel state or a cache no older than the gateway policy.
- Load the merchant off-chain ledger for that channel.
- Require `newCommitmentAmount === latestAcceptedCommitted + routePriceTokenAmount`.
- Require `newCommitmentAmount <= settledCumulative + effectiveLocked`.
- Reserve request ID and cumulative amount atomically before upstream execution.
- Promote reservation on upstream success.
- Release reservation on upstream failure.

SDK helpers:

```ts
const headroom = calculateChannelHeadroom(channel, latestAcceptedCommitted);

const payload = buildGatewayCommitmentPayload({
  cluster: "devnet",
  programId: client.programId,
  payerId,
  payeeId: gatewayMerchantParticipantId,
  tokenId,
  tokenMint: OFFICIAL_DEVNET_USDC_MINT,
  committedAmount: newCommitmentAmount,
  authorizedSettler: gatewayAuthorizedSettler ?? null,
  signer: authorizedSignerPublicKey,
});

const message = createGatewayCommitmentMessage(payload);
const envelope = encodeGatewayCommitmentEnvelope({
  ...payload,
  signature: signatureBase64,
});

const verified = verifyGatewayCommitmentEnvelope(envelope);
```

Request headers for gateway channel routes:

```text
X-Ryvo-Request-Id: <stable-idempotency-key>
RYVO-COMMITMENT: <base64-json-envelope>
```

## Unlock And Withdrawal Logic

- Participant withdrawal uses participant available balance. It is instant on the live devnet deployment and is not a substitute for settling accepted channel commitments.
- Channel locked collateral is not withdrawable until unlocked.
- Cooperative unlock is the fast path when payer and payee agree.
- The payee should only cooperate after all accepted commitments for that channel are settled or reconciled.
- Unilateral unlock is the fallback when the payee is offline. It waits 72 hours so the payee can settle accepted commitments.
- If collateral is unlocked, old unsigned intent does not matter. A previously signed cumulative commitment can still be settled later if the channel has enough available/locked capacity at settlement time and the commitment is above `settledCumulative`.

## BLS Clearing

Use `settle_clearing_round` only when participants are doing cooperative multilateral clearing and all required parties use Ryvo BLS keys.

Caveats:

- Ryvo BLS v1 is Ryvo-specific. It hashes messages to a scalar times the G1 generator and is not a generic IETF hash-to-curve BLS ciphersuite.
- Generic BLS libraries will not work unless they implement the Ryvo message/hash scheme exactly.
- Use shared Ryvo implementation and test vectors.
- BLS key rotation does not exist yet. If a BLS key is lost or compromised, migrate to a new participant identity for future BLS clearing.

## When To Use Raw IDL Methods

`RyvoClient` wraps the common integration path. For lower-level instructions not wrapped by a convenience method, use the generated Anchor program directly:

```ts
await client.program.methods
  .cooperativeUnlockChannelFunds(tokenId, new anchor.BN(amount))
  .accounts({ /* exact accounts from IDL/docs */ } as any)
  .signers([payer, payee])
  .rpc();
```

Use raw IDL methods for:

- `depositFor`
- `cooperativeUnlockChannelFunds`
- `requestUpdateChannelAuthorizedSigner`
- `executeUpdateChannelAuthorizedSigner`
- `registerParticipantBlsKey`
- `updateConfig`
- `acceptConfigAuthority`
- `initializeTokenRegistry`
- `updateRegistryAuthority`
- `acceptRegistryAuthority`

Always prefer the generated IDL account names over handwritten account layouts.

## References

Read `references/protocol-flows.md` for deeper operational playbooks, action-specific account notes, gateway authorization details, and settlement choices.
