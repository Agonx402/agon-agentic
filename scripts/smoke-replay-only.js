#!/usr/bin/env node
// Replay-only smoke test: read whatever SIWX header is in
// ~/.agon/siwx-cache.json for gateway.agonx402.com and POUND it against
// /v1/x402/tokens/assets/bitcoin and /assets/solana to confirm the server
// accepts the same signed header for many requests until expirationTime.

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE_URL = process.env.AGON_GATEWAY_BASE_URL || "https://gateway.agonx402.com";
const cachePath = path.join(os.homedir(), ".agon", "siwx-cache.json");

const raw = fs.readFileSync(cachePath, "utf8").replace(/^\uFEFF/, "");
const entries = JSON.parse(raw);
const entry = entries.find((e) => e && e.baseUrl === BASE_URL && e.header);
if (!entry) {
  process.stderr.write("no cached SIWX header found\n");
  process.exit(2);
}

process.stdout.write(`[smoke] using header for pathname=${entry.pathname} expirationTime=${entry.expirationTime}\n`);

async function call(label, urlPath) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method: "GET",
    headers: { "SIGN-IN-WITH-X": entry.header, accept: "application/json" },
  });
  const elapsed = Date.now() - t0;
  const text = await res.text();
  let snippet = text.slice(0, 160);
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.data && parsed.data.id) {
      snippet = `id=${parsed.data.id} symbol=${parsed.data.symbol || "?"} name=${parsed.data.name || "?"}`;
    }
  } catch {
    /* ignore */
  }
  process.stdout.write(`[smoke] ${label}: ${urlPath} -> ${res.status} (${elapsed}ms) ${snippet}\n`);
  return res.status;
}

(async () => {
  const a = await call("call 1 /assets/bitcoin", "/v1/x402/tokens/assets/bitcoin");
  const b = await call("call 2 /assets/bitcoin", "/v1/x402/tokens/assets/bitcoin");
  const c = await call("call 3 /assets/solana ", "/v1/x402/tokens/assets/solana");
  const d = await call("call 4 /assets/ethereum", "/v1/x402/tokens/assets/ethereum");
  if ([a, b, c, d].every((s) => s >= 200 && s < 300)) {
    process.stdout.write("\n[smoke] PASS\n");
    process.exit(0);
  }
  process.stdout.write("\n[smoke] FAIL\n");
  process.exit(1);
})();
