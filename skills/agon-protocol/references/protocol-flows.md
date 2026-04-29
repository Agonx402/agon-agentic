# Agon Protocol Flows

## Headroom Math

Gateway spendable channel headroom:

```text
effectiveLocked = max(0, lockedBalance - pendingUnlockAmount)
maxAuthorized = settledCumulative + effectiveLocked
remainingHeadroom = max(0, maxAuthorized - latestAcceptedCommitted)
```

`latestAcceptedCommitted` includes the merchant's accepted but not yet settled off-chain commitments. Never authorize a new cumulative commitment above `maxAuthorized`.

## Prepare-Only Rule

Agent tooling should return transaction/account/message plans. The user's wallet layer signs and broadcasts.

## Settlement Choices

Use bundle settlement for gateway merchant flows. Use BLS clearing for multilateral rounds where the participants all use Agon BLS keys and shared Agon message/test-vector code.
