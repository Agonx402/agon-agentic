#!/usr/bin/env node
// End-to-end smoke test: confirm that one SIWX sign covers many asset
// lookups via the agon-gateway CLI's disk cache and template-matching.
//
// 1. Wipe ~/.agon/siwx-cache.json.
// 2. Run `agon-gateway tokens GET /assets/bitcoin` -> cold call,
//    full 402 -> sign -> 200 dance, ~3-5s.
// 3. Run `agon-gateway tokens GET /assets/<id>` for several other ids;
//    each should hit the cached header and complete in <1s with NO sign.
// 4. Print per-call timing and verify warm calls are dramatically
//    faster than the cold one.

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliEntry = path.join(__dirname, "..", "cli", "agon-gateway.js");
const cachePath = path.join(os.homedir(), ".agon", "siwx-cache.json");
const signerCmd = process.env.AGON_SIGNER_COMMAND || "npx -y @agonx402/agent-wallet authorize";

function call(assetId) {
  const t0 = Date.now();
  const result = spawnSync(
    "node",
    [cliEntry, "tokens", "GET", `/assets/${assetId}`],
    {
      encoding: "utf8",
      env: { ...process.env, AGON_SIGNER_COMMAND: signerCmd },
    },
  );
  const elapsed = Date.now() - t0;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    throw new Error(`call ${assetId} exited ${result.status}`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { /* ignore */ }
  const ok = !!(parsed && parsed.ok);
  const id = parsed && parsed.result && parsed.result.asset && parsed.result.asset.assetId;
  return { elapsed, ok, id };
}

function wipeCache() {
  try { fs.unlinkSync(cachePath); } catch (e) { if (e.code !== "ENOENT") throw e; }
}

function main() {
  wipeCache();
  process.stdout.write("[smoke] cache wiped\n");

  const cold = call("bitcoin");
  process.stdout.write(`[smoke] COLD bitcoin: ${cold.elapsed}ms ok=${cold.ok} id=${cold.id}\n`);
  if (!cold.ok) process.exit(1);

  const warm = ["solana", "ethereum", "bitcoin", "ripple", "gold"];
  const results = [];
  for (const id of warm) {
    const r = call(id);
    process.stdout.write(`[smoke] WARM ${id.padEnd(14)}: ${r.elapsed}ms ok=${r.ok} id=${r.id}\n`);
    results.push(r);
  }

  const allOk = results.every((r) => r.ok);
  const avg = Math.round(results.reduce((s, r) => s + r.elapsed, 0) / results.length);
  const speedup = Math.round((cold.elapsed / avg) * 10) / 10;

  process.stdout.write(`\n[smoke] cold=${cold.elapsed}ms  warm-avg=${avg}ms  speedup=${speedup}x\n`);

  if (!allOk) {
    process.stdout.write("[smoke] FAIL — some warm calls did not return ok\n");
    process.exit(1);
  }
  if (avg > cold.elapsed * 0.7) {
    process.stdout.write("[smoke] FAIL — warm calls did not benefit from cache\n");
    process.exit(1);
  }
  process.stdout.write("[smoke] PASS — cache effective, server reuses SIWX\n");
}

main();
