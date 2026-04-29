---
name: agon-protocol
description: Use when a task involves Agon Protocol accounts, deposits, withdrawals, payment channels, channel locks/unlocks, cumulative commitments, bundle settlement, BLS clearing, protocol CLI/MCP tools, or building agents that interact with Agon on Solana.
---

# Agon Protocol

## Use This Skill For

- Reading protocol config, token registry, participant, and channel state.
- Preparing deposits, channel creation, locks, unlocks, withdrawals, and settlement.
- Explaining channel collateral, cumulative commitments, BLS clearing, or merchant gateway payment flows.

## Tools

Prefer the protocol CLI or MCP when available:

```bash
node C:/agon/agon/agentic/protocol-cli/agon-protocol.js config
node C:/agon/agon/agentic/protocol-cli/agon-protocol.js token show
node C:/agon/agon/agentic/protocol-cli/agon-protocol.js channel headroom --payer-id <id> --payee-id <id> --latest-accepted <amount>
```

MCP resource:

```text
agon://protocol/llm.txt
```

The CLI and MCP are read + prepare only. They do not sign, store private keys, or broadcast transactions.

## Token Policy

Gateway-channel v1 uses official devnet USDC only:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Do not use synthetic stablecoin names in gateway-channel docs, examples, skills, CLI/MCP output, or catalog copy. Resolve token ID from the deployed Agon token registry or `AGON_PROTOCOL_DEVNET_USDC_TOKEN_ID`.

## Main Flows

Participant setup:

1. Initialize the participant.
2. Deposit official devnet USDC.
3. Create a directed channel to the payee.
4. Lock USDC in the channel.

Channel spending:

1. Read channel state.
2. Compute the next cumulative amount.
3. Build the Agon commitment message with `@agonx402/sdk`.
4. Have the authorized signer sign those exact message bytes.
5. Payee settles latest commitments individually or as a bundle.

Unlocks and withdrawals:

- Participant withdrawals are instant.
- Cooperative channel unlock is immediate with both parties' agreement.
- Unilateral channel unlock is the 72-hour fallback.
- A payee should settle or reconcile accepted commitments before helping unlock collateral.

Clearing:

- Individual settlement handles one directed channel.
- Bundle settlement lets a payee settle many directed channels.
- BLS clearing is for multilateral rounds, not gateway request settlement v1.

## BLS Caveats

Agon BLS v1 is Agon-specific. It hashes messages to a scalar times the G1 generator and is not a generic IETF hash-to-curve BLS ciphersuite. Use shared Agon implementation and test vectors.

There is no BLS key rotation path yet. If a BLS key is lost or compromised, the participant should migrate to a new participant identity for BLS clearing.

## References

Read `references/protocol-flows.md` when you need more detail on account state, headroom math, or settlement choices.
