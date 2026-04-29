#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const DEFAULT_BASE_URL = process.env.AGON_GATEWAY_BASE_URL || "https://gateway.agonx402.com";
const JSON_HEADERS = new Set(["content-type", "payment-required", "www-authenticate", "x-payment-response", "payment-response"]);

function usage(exitCode = 0) {
  const text = `
Agon Gateway CLI

Usage:
  agon-gateway health [--base-url URL]
  agon-gateway catalog [--provider alchemy|helius|tokens] [--json]
  agon-gateway routes [--provider NAME] [--surface NAME] [--access-mode exact|siwx|agon-channel] [--json]
  agon-gateway show <path-or-method> [--provider NAME] [--surface NAME] [--json]
  agon-gateway call <METHOD> <PATH> [--query k=v] [--body JSON|@file] [--payment-signature VALUE] [--x-payment VALUE] [--siwx VALUE]
  agon-gateway rpc <method> <params-json> [--provider helius|alchemy] [--cluster mainnet|devnet]
  agon-gateway das <method> <params-json> [--provider helius|alchemy] [--cluster mainnet|devnet]
  agon-gateway wallet <identity|balances|history|transfers|funded-by> <wallet> [--cluster mainnet|devnet] [--query k=v]
  agon-gateway wallet batch-identity <json-array-or-comma-list> [--cluster mainnet|devnet]
  agon-gateway tokens [METHOD] <tokens-path> [--query k=v] [--body JSON|@file] [--siwx VALUE]

Examples:
  agon-gateway catalog --provider helius
  agon-gateway rpc getBalance '["11111111111111111111111111111111"]' --provider helius
  agon-gateway das getAsset '{"id":"<asset-id>"}'
  agon-gateway wallet balances GQUtvPx89ZNCwmvQqFmH59bJcU8fW8siETpaxod7Aydz --query limit=25
  agon-gateway tokens assets/search --query q=solana --query limit=5
`;
  process.stderr.write(text.trimStart());
  process.exit(exitCode);
}

function parseArgv(argv) {
  const args = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      usage(0);
    }

    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }

    const eqIndex = token.indexOf("=");
    const rawName = eqIndex === -1 ? token.slice(2) : token.slice(2, eqIndex);
    const name = rawName.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const inlineValue = eqIndex === -1 ? undefined : token.slice(eqIndex + 1);
    let value = inlineValue;

    if (value === undefined) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        index += 1;
      } else {
        value = true;
      }
    }

    if (flags[name] === undefined) {
      flags[name] = value;
    } else if (Array.isArray(flags[name])) {
      flags[name].push(value);
    } else {
      flags[name] = [flags[name], value];
    }
  }

  return { args, flags };
}

function ensureArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseJsonInput(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const text = String(value).startsWith("@")
    ? fs.readFileSync(String(value).slice(1), "utf8")
    : String(value);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

function parseKeyValueList(values) {
  const entries = [];
  for (const item of ensureArray(values)) {
    const text = String(item);
    const separator = text.indexOf("=");
    if (separator === -1) {
      throw new Error(`Expected key=value, received: ${text}`);
    }
    entries.push([text.slice(0, separator), text.slice(separator + 1)]);
  }
  return entries;
}

function parseHeaderList(values) {
  const headers = {};
  for (const item of ensureArray(values)) {
    const text = String(item);
    const separator = text.indexOf(":");
    if (separator === -1) {
      throw new Error(`Expected Header:Value, received: ${text}`);
    }
    headers[text.slice(0, separator).trim()] = text.slice(separator + 1).trim();
  }
  return headers;
}

function normalizeBaseUrl(flags) {
  return String(flags.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function makeUrl(baseUrl, path, queryValues) {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of parseKeyValueList(queryValues)) {
    url.searchParams.append(key, value);
  }
  return url;
}

function importantHeaders(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    if (JSON_HEADERS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

async function requestGateway(flags, method, path, options = {}) {
  const baseUrl = normalizeBaseUrl(flags);
  const url = makeUrl(baseUrl, path, options.query || flags.query);
  const headers = {
    accept: "application/json",
    ...parseHeaderList(flags.header),
    ...(options.headers || {}),
  };

  if (flags.paymentSignature) {
    headers["PAYMENT-SIGNATURE"] = String(flags.paymentSignature);
  }
  if (flags.xPayment) {
    headers["X-PAYMENT"] = String(flags.xPayment);
  }
  if (flags.siwx) {
    headers["SIGN-IN-WITH-X"] = String(flags.siwx);
  }

  let body = options.body;
  if (body === undefined && flags.body !== undefined) {
    body = parseJsonInput(flags.body);
  }

  const init = {
    method: method.toUpperCase(),
    headers,
  };

  if (body !== undefined && init.method !== "GET" && init.method !== "HEAD") {
    headers["content-type"] = headers["content-type"] || "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const rawText = await response.text();
  let parsedBody = rawText;
  if (rawText.length > 0) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  } else {
    parsedBody = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    url: url.toString(),
    method: init.method,
    headers: importantHeaders(response.headers),
    body: parsedBody,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printRoutes(routes) {
  const rows = routes.map((route) => ({
    method: route.httpMethod,
    provider: route.provider,
    surface: route.surface,
    access: route.accessMode,
    price: route.priceUsd || route.priceTokenAmount || "",
    path: route.path,
    description: route.description,
  }));

  const widths = {
    method: Math.max(6, ...rows.map((row) => row.method.length)),
    provider: Math.max(8, ...rows.map((row) => row.provider.length)),
    surface: Math.max(7, ...rows.map((row) => row.surface.length)),
    access: Math.max(6, ...rows.map((row) => row.access.length)),
    price: Math.max(5, ...rows.map((row) => row.price.length)),
  };

  for (const row of rows) {
    const line = [
      row.method.padEnd(widths.method),
      row.provider.padEnd(widths.provider),
      row.surface.padEnd(widths.surface),
      row.access.padEnd(widths.access),
      row.price.padEnd(widths.price),
      row.path,
      `- ${row.description}`,
    ].join("  ");
    process.stdout.write(`${line}\n`);
  }
}

async function getCatalog(flags, provider) {
  const query = provider ? [`provider=${provider}`] : undefined;
  const response = await requestGateway(flags, "GET", "/v1/catalog", { query });
  if (!response.ok) {
    throw new Error(`Catalog request failed with HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

function catalogRoutes(catalog) {
  return Array.isArray(catalog.routes) ? catalog.routes : [];
}

function filterRoutes(routes, flags) {
  return routes.filter((route) => {
    if (flags.provider && route.provider !== flags.provider) return false;
    if (flags.surface && route.surface !== flags.surface) return false;
    if (flags.accessMode && route.accessMode !== flags.accessMode) return false;
    return true;
  });
}

function tokensPath(path) {
  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("v1/x402/tokens")) {
    return `/${trimmed}`;
  }
  return `/v1/x402/tokens/${trimmed}`;
}

function walletPath(cluster, action, wallet) {
  const normalizedAction = action === "funded-by" ? "funded-by" : action;
  const prefix = cluster === "devnet"
    ? "/v1/x402/helius/devnet/wallet"
    : "/v1/x402/helius/wallet";
  return `${prefix}/${normalizedAction}/${encodeURIComponent(wallet)}`;
}

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const command = args.shift();
  if (!command) usage(1);

  switch (command) {
    case "health":
      printJson(await requestGateway(flags, "GET", "/healthz"));
      return;

    case "catalog":
      printJson(await getCatalog(flags, flags.provider));
      return;

    case "routes": {
      const catalog = await getCatalog(flags, flags.provider);
      const routes = filterRoutes(catalogRoutes(catalog), flags);
      if (flags.json) printJson(routes);
      else printRoutes(routes);
      return;
    }

    case "show": {
      const needle = args.shift();
      if (!needle) throw new Error("show requires a path or method.");
      const catalog = await getCatalog(flags, flags.provider);
      const routes = filterRoutes(catalogRoutes(catalog), flags).filter((route) => (
        route.path === needle
        || route.method === needle
        || route.path.includes(needle)
      ));
      printJson(routes);
      return;
    }

    case "call": {
      const method = args.shift();
      const path = args.shift();
      if (!method || !path) throw new Error("call requires METHOD and PATH.");
      printJson(await requestGateway(flags, method, path));
      return;
    }

    case "rpc": {
      const method = args.shift();
      if (!method) throw new Error("rpc requires a method.");
      const params = parseJsonInput(flags.params || args.shift(), []);
      if (!Array.isArray(params)) throw new Error("rpc params must be a JSON array.");
      const cluster = flags.cluster || "mainnet";
      const provider = flags.provider || "helius";
      const path = `/v1/x402/solana/${cluster}/${provider}/rpc/${method}`;
      const channelPath = `/v1/agon-channel/solana/devnet/${provider}/rpc/${method}`;
      const requestPath = flags.accessMode === "agon-channel" ? channelPath : path;
      printJson(await requestGateway(flags, "POST", requestPath, { body: { params } }));
      return;
    }

    case "das": {
      const method = args.shift();
      if (!method) throw new Error("das requires a method.");
      const params = parseJsonInput(flags.params || args.shift(), {});
      if (params === null || typeof params !== "object" || Array.isArray(params)) {
        throw new Error("das params must be a JSON object.");
      }
      const cluster = flags.cluster || "mainnet";
      const provider = flags.provider || "helius";
      const path = `/v1/x402/solana/${cluster}/${provider}/das/${method}`;
      const channelPath = `/v1/agon-channel/solana/devnet/${provider}/das/${method}`;
      const requestPath = flags.accessMode === "agon-channel" ? channelPath : path;
      printJson(await requestGateway(flags, "POST", requestPath, { body: { params } }));
      return;
    }

    case "wallet": {
      const action = args.shift();
      if (!action) throw new Error("wallet requires an action.");
      const cluster = flags.cluster || "mainnet";
      if (action === "batch-identity") {
        const input = args.shift();
        if (!input) throw new Error("batch-identity requires a JSON array or comma-separated wallet list.");
        const wallets = input.trim().startsWith("[")
          ? parseJsonInput(input)
          : input.split(",").map((value) => value.trim()).filter(Boolean);
        const prefix = cluster === "devnet"
          ? "/v1/x402/helius/devnet/wallet"
          : "/v1/x402/helius/wallet";
        printJson(await requestGateway(flags, "POST", `${prefix}/batch-identity`, { body: { wallets } }));
        return;
      }

      const wallet = args.shift();
      if (!wallet) throw new Error(`wallet ${action} requires a wallet.`);
      printJson(await requestGateway(flags, "GET", walletPath(cluster, action, wallet)));
      return;
    }

    case "tokens": {
      let method = "GET";
      if (args[0] && /^[A-Z]+$/.test(args[0])) {
        method = args.shift();
      }
      const path = args.shift();
      if (!path) throw new Error("tokens requires a tokens path.");
      printJson(await requestGateway(flags, method, tokensPath(path)));
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
