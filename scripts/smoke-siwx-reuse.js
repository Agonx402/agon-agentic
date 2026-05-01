#!/usr/bin/env node
// Smoke test: confirm Agon Gateway accepts the same SIWX header for many
// requests until expirationTime (i.e. server-side nonce tracking is off).
//
// Strategy:
//   1. Wipe ~/.agon/siwx-cache.json so we know we're getting a fresh sign.
//   2. Run `agon-gateway tokens GET /assets/<id>` once via the CLI. This
//      performs the full 402 -> sign -> 200 dance and writes the header
//      into ~/.agon/siwx-cache.json keyed by baseUrl + pathname.
//   3. Read the cached Authorization header back out.
//   4. Replay it twice with plain fetch() against the same path.
//   5. Print status + elapsed for every call.
//
// Pass criteria: warm + replay #1 + replay #2 all return 2xx, all using
// the same header. Failure mode that means the deploy didn't take: 402
// on replay #1 with body containing "nonce".

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSET_ID = process.argv[2] || "bitcoin";
const BASE_URL = process.env.AGON_GATEWAY_BASE_URL || "https://gateway.agonx402.com";
const REQUEST_PATH = `/v1/x402/tokens/assets/${ASSET_ID}`;

const cachePath = path.join(os.homedir(), ".agon", "siwx-cache.json");

function wipeCache() {
  try {
    fs.unlinkSync(cachePath);
    process.stdout.write(`[smoke] wiped ${cachePath}\n`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    process.stdout.write(`[smoke] no existing cache at ${cachePath}\n`);
  }
}

function runWarmCall() {
  const cliEntry = path.join(__dirname, "..", "cli", "agon-gateway.js");
  const signerCmd = process.env.AGON_SIGNER_COMMAND || "npx -y @agonx402/agent-wallet authorize";
  const env = {
    ...process.env,
    AGON_SIGNER_COMMAND: signerCmd,
  };
  const t0 = Date.now();
  const result = spawnSync(
    "node",
    [cliEntry, "tokens", "GET", `/assets/${ASSET_ID}`],
    { encoding: "utf8", env },
  );
  const elapsed = Date.now() - t0;
  if (result.stderr) {
    process.stderr.write(`[smoke] CLI stderr:\n${result.stderr}\n`);
  }
  if (result.status !== 0) {
    throw new Error(`warm call exited with status ${result.status}`);
  }
  let body = result.stdout || "";
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* not JSON */
  }
  if (parsed && parsed.ok === false) {
    process.stdout.write(`[smoke] warm CLI call returned ok=false in ${elapsed}ms; body: ${body.slice(0, 200)}\n`);
    throw new Error("warm call did not authenticate (got error body)");
  }
  process.stdout.write(`[smoke] warm CLI call ok in ${elapsed}ms\n`);
}

function readCachedHeader() {
  const raw = fs.readFileSync(cachePath, "utf8").replace(/^\uFEFF/, "");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error("cache file is not an array");
  for (const entry of entries) {
    if (!entry || entry.baseUrl !== BASE_URL) continue;
    if (entry.pathname && entry.pathname !== REQUEST_PATH) continue;
    if (!entry.header) continue;
    return entry;
  }
  throw new Error(
    `no cached SIWX header for ${BASE_URL}${REQUEST_PATH} in ${cachePath}`,
  );
}

async function replay(label, header) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}${REQUEST_PATH}`, {
    method: "GET",
    headers: { "X-PAYMENT": header, accept: "application/json" },
  });
  const elapsed = Date.now() - t0;
  const text = await res.text();
  let snippet = text.slice(0, 220);
  try {
    const parsed = JSON.parse(text);
    snippet = JSON.stringify(parsed).slice(0, 220);
  } catch {
    /* not JSON, leave raw */
  }
  process.stdout.write(`[smoke] ${label}: status=${res.status} elapsed=${elapsed}ms body=${snippet}\n`);
  return { ok: res.ok, status: res.status, body: text };
}

(async () => {
  process.stdout.write(`[smoke] target ${BASE_URL}${REQUEST_PATH}\n`);
  wipeCache();
  runWarmCall();
  const entry = readCachedHeader();
  process.stdout.write(
    `[smoke] cached header for pathname=${entry.pathname} expirationTime=${entry.expirationTime || "(none)"}\n`,
  );
  const r1 = await replay("replay #1", entry.header);
  const r2 = await replay("replay #2", entry.header);
  if (r1.ok && r2.ok) {
    process.stdout.write("\n[smoke] PASS — same SIWX header accepted on consecutive requests.\n");
    process.exit(0);
  }
  process.stdout.write("\n[smoke] FAIL — header not reusable. nonce tracking may still be live.\n");
  process.exit(1);
})().catch((err) => {
  process.stderr.write(`[smoke] error: ${err.message}\n`);
  process.exit(2);
});
