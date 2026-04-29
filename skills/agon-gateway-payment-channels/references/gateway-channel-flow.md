# Gateway Channel Flow

## Request Contract

Every channel-backed request includes:

```text
X-Agon-Request-Id: <idempotency key>
AGON-COMMITMENT: <base64 JSON envelope>
```

The envelope contains the Agon cumulative commitment payload and signature. The signed bytes are the existing Agon commitment message produced by `@agonx402/sdk`.

## Failure Handling

- Missing or invalid commitment: reject before upstream.
- Wrong payee, token, program, cluster, or domain: reject before upstream.
- Commitment gap or replay: reject.
- Redis unavailable: fail closed.
- On-chain state unavailable beyond the short cache TTL: fail closed.
- Upstream failure: release reservation so the same cumulative amount can be retried.

## Tokens SIWX

Tokens SIWX routes remain outside payment channels. They are authenticated/free routes and must not require `AGON-COMMITMENT`.
