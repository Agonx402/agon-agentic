# Gateway Channel Flow

## Request Contract

Every channel-backed request includes:

```text
X-Ryvo-Request-Id: <idempotency key>
RYVO-COMMITMENT: <base64 JSON envelope>
```

The envelope contains the Ryvo cumulative commitment payload and signature. The signed bytes are the existing Ryvo commitment message produced by `@ryvonetwork/sdk`.

Agents can ask the Gateway CLI or MCP to prepare the channel route metadata, then have any wallet/payment layer build the commitment:

```bash
node agentic/cli/ryvo-gateway.js auth prepare GET /v1/ryvo-channel/helius/devnet/wallet/balances/<wallet> --query limit=25 --json
node agentic/cli/ryvo-gateway.js auth call GET /v1/ryvo-channel/helius/devnet/wallet/balances/<wallet> --query limit=25 --auth-driver my-ryvo-channel-driver
```

The auth driver reads the prepared auth request JSON from stdin and returns:

```json
{ "headers": { "X-Ryvo-Request-Id": "<id>", "RYVO-COMMITMENT": "<base64 JSON envelope>" } }
```

The driver can wrap any wallet or custody system. The public Ryvo CLI/MCP never stores channel signing keys.

## Failure Handling

- Missing or invalid commitment: reject before upstream.
- Wrong payee, token, program, cluster, or domain: reject before upstream.
- Commitment gap or replay: reject.
- Redis unavailable: fail closed.
- On-chain state unavailable beyond the short cache TTL: fail closed.
- Upstream failure: release reservation so the same cumulative amount can be retried.

## Tokens SIWX

Tokens SIWX routes remain outside payment channels. They are authenticated/free routes and must not require `RYVO-COMMITMENT`.
