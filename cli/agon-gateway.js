#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("./package.json");

const DEFAULT_BASE_URL = process.env.AGON_GATEWAY_BASE_URL || "https://gateway.agonx402.com";
const DEFAULT_MAX_AMOUNT_USD = "0.01";
const DEFAULT_DAILY_LIMIT_USD = "1.00";
const JSON_HEADERS = new Set([
  "content-type",
  "payment-required",
  "www-authenticate",
  "x-payment-response",
  "payment-response",
]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function usage(exitCode = 0) {
  const text = `
Agon Gateway CLI

Usage:
  agon-gateway health [--base-url URL]
  agon-gateway catalog [--provider alchemy|helius|tokens] [--json]
  agon-gateway routes [--provider NAME] [--surface NAME] [--access-mode exact|siwx|agon-channel] [--json]
  agon-gateway show <path-or-method> [--provider NAME] [--surface NAME] [--json]
  agon-gateway call <METHOD> <PATH> [--query k=v] [--body JSON|@file] [--payment-signature VALUE] [--x-payment VALUE] [--siwx VALUE] [--auth-driver COMMAND]
  agon-gateway auth prepare <METHOD> <PATH> [--query k=v] [--body JSON|@file] [--address ADDRESS] [--json]
  agon-gateway auth complete --challenge FILE|- --address ADDRESS --signature SIGNATURE [--signature-encoding hex|base58|base64|base64url] [--chain-id CHAIN]
  agon-gateway auth call <METHOD> <PATH> [--auth-driver COMMAND] [--auth-arg VALUE] [--query k=v] [--body JSON|@file]
  agon-gateway agent-prompt
  agon-gateway schema
  agon-gateway doctor [--auth-driver COMMAND]
  agon-gateway rpc <method> <params-json> [--provider helius|alchemy] [--cluster mainnet|devnet] [--auth-driver COMMAND]
  agon-gateway das <method> <params-json> [--provider helius|alchemy] [--cluster mainnet|devnet] [--auth-driver COMMAND]
  agon-gateway wallet <identity|balances|history|transfers|funded-by> <wallet> [--cluster mainnet|devnet] [--access-mode exact|agon-channel] [--query k=v] [--auth-driver COMMAND]
  agon-gateway wallet batch-identity <json-array-or-comma-list> [--cluster mainnet|devnet] [--access-mode exact|agon-channel] [--auth-driver COMMAND]
  agon-gateway tokens [METHOD] <tokens-path> [--query k=v] [--body JSON|@file] [--siwx VALUE] [--auth-driver COMMAND]

Examples:
  agon-gateway catalog --provider helius
  agon-gateway auth prepare GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --json
  AGON_SIGNER_COMMAND="npx -y @agonx402/agent-wallet authorize" agon-gateway auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1
  agon-gateway auth call GET /v1/x402/tokens/assets/search --query q=bitcoin --query limit=1 --auth-driver my-wallet-auth-driver
  agon-gateway rpc getBalance '["11111111111111111111111111111111"]' --provider helius
  agon-gateway das getAsset '{"id":"<asset-id>"}'
  agon-gateway wallet balances GQUtvPx89ZNCwmvQqFmH59bJcU8fW8siETpaxod7Aydz --query limit=25
  agon-gateway tokens assets/search --query q=solana --query limit=5

Environment:
  AGON_SIGNER_COMMAND              Default signer command for auth call and authenticated calls.
  AGON_WALLET_PROFILE              Optional wallet profile passed through auth requests.
  AGON_PAYMENT_MAX_AMOUNT_USD      Default x402 max per request.
  AGON_PAYMENT_DAILY_LIMIT_USD     Default x402 daily authorized spend limit.
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

function singleFlag(flags, name) {
  const value = flags[name];
  if (Array.isArray(value)) {
    throw new Error(`--${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)} may be provided only once.`);
  }
  return value;
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

function readJsonDocument(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  const text = value === "-"
    ? fs.readFileSync(0, "utf8")
    : String(value).trimStart().startsWith("{")
      ? String(value)
      : fs.readFileSync(String(value).replace(/^@/, ""), "utf8");

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error.message}`);
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

function keyValueEntriesToObject(entries) {
  const result = {};
  for (const [key, value] of entries) {
    if (result[key] === undefined) {
      result[key] = value;
    } else if (Array.isArray(result[key])) {
      result[key].push(value);
    } else {
      result[key] = [result[key], value];
    }
  }
  return result;
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

function makeUrl(baseUrl, requestPath, queryValues) {
  const url = new URL(requestPath, `${baseUrl}/`);
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

function headerValue(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === expected) return value;
  }
  return undefined;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requestBodyText(method, body) {
  const upperMethod = method.toUpperCase();
  if (body === undefined || upperMethod === "GET" || upperMethod === "HEAD") {
    return "";
  }
  return JSON.stringify(body);
}

function buildGatewayRequest(flags, method, requestPath, options = {}) {
  const baseUrl = normalizeBaseUrl(flags);
  const queryValues = options.query || flags.query;
  const url = makeUrl(baseUrl, requestPath, queryValues);
  const headers = {
    accept: "application/json",
    ...parseHeaderList(flags.header),
    ...(options.headers || {}),
  };

  if (options.includeAuthFlags !== false) {
    if (flags.paymentSignature) {
      headers["PAYMENT-SIGNATURE"] = String(flags.paymentSignature);
    }
    if (flags.xPayment) {
      headers["X-PAYMENT"] = String(flags.xPayment);
    }
    if (flags.siwx) {
      headers["SIGN-IN-WITH-X"] = String(flags.siwx);
    }
  }

  let body = options.body;
  if (body === undefined && flags.body !== undefined) {
    body = parseJsonInput(flags.body);
  }

  const upperMethod = method.toUpperCase();
  const bodyText = requestBodyText(upperMethod, body);
  if (bodyText.length > 0) {
    headers["content-type"] = headers["content-type"] || "application/json";
  }

  return {
    baseUrl,
    url,
    method: upperMethod,
    path: url.pathname,
    query: keyValueEntriesToObject(Array.from(url.searchParams.entries())),
    headers,
    body,
    bodyText,
  };
}

async function sendBuiltRequest(request) {
  const init = {
    method: request.method,
    headers: request.headers,
  };

  if (request.bodyText.length > 0) {
    init.body = request.bodyText;
  }

  const response = await fetch(request.url, init);
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
    url: request.url.toString(),
    method: request.method,
    headers: importantHeaders(response.headers),
    body: parsedBody,
  };
}

async function requestGatewayRaw(flags, method, requestPath, options = {}) {
  return sendBuiltRequest(buildGatewayRequest(flags, method, requestPath, options));
}

async function requestGateway(flags, method, requestPath, options = {}) {
  const request = buildGatewayRequest(flags, method, requestPath, options);
  const firstResponse = await sendBuiltRequest(request);
  if (firstResponse.status !== 402) {
    return firstResponse;
  }

  const signerCommand = authDriverCommand(flags);
  if (!signerCommand) {
    if (options.requireSignerOn402) {
      throw new Error("Gateway returned 402 Payment Required; provide --auth-driver or set AGON_SIGNER_COMMAND.");
    }
    return firstResponse;
  }

  const authRequest = await prepareAuthRequest(flags, method, requestPath, {
    ...options,
    body: request.body,
    challengeResponse: firstResponse,
  });
  const driverHeaders = runAuthDriver(flags, authRequest, signerCommand);
  Object.assign(request.headers, driverHeaders);
  return sendBuiltRequest(request);
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
  const response = await requestGatewayRaw(flags, "GET", "/v1/catalog", { query, includeAuthFlags: false });
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePathRegex(template) {
  const pattern = template
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) return "[^/]+";
      if (/^\{[^}]+\}$/.test(segment)) return "[^/]+";
      return escapeRegExp(segment);
    })
    .join("/");
  return new RegExp(`^${pattern}$`);
}

function findRouteForRequest(routes, method, pathname) {
  const upperMethod = method.toUpperCase();
  return routes.find((route) => {
    if (route.httpMethod && route.httpMethod.toUpperCase() !== upperMethod) return false;
    if (!route.path) return false;
    return route.path === pathname || routePathRegex(route.path).test(pathname);
  });
}

function inferRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (pathname.startsWith("/v1/x402/tokens")) {
    return { provider: "tokens", surface: "tokens", accessMode: "siwx", cluster: undefined };
  }
  if (pathname.startsWith("/v1/agon-channel")) {
    if (parts[2] === "solana") {
      return { provider: parts[4] || "helius", surface: parts[5], cluster: "devnet", accessMode: "agon-channel" };
    }
    return { provider: parts[2] || "helius", surface: "wallet", cluster: "devnet", accessMode: "agon-channel" };
  }
  if (pathname.startsWith("/v1/x402/solana")) {
    return { provider: parts[4], surface: parts[5], cluster: parts[3], accessMode: "exact" };
  }
  if (pathname.startsWith("/v1/x402/helius/devnet/wallet")) {
    return { provider: "helius", surface: "wallet", cluster: "devnet", accessMode: "exact" };
  }
  if (pathname.startsWith("/v1/x402/helius/wallet")) {
    return { provider: "helius", surface: "wallet", cluster: "mainnet", accessMode: "exact" };
  }
  return { provider: undefined, surface: undefined, cluster: undefined, accessMode: "exact" };
}

function routeSummary(route, fallback) {
  if (!route) return fallback;
  return {
    provider: route.provider,
    surface: route.surface,
    cluster: route.cluster || fallback.cluster,
    accessMode: route.accessMode || fallback.accessMode,
    method: route.method,
    httpMethod: route.httpMethod,
    path: route.path,
    priceUsd: route.priceUsd,
    priceTokenAmount: route.priceTokenAmount,
    paymentNetwork: route.paymentNetwork,
    tokenSymbol: route.tokenSymbol,
    tokenDecimals: route.tokenDecimals,
    tokenMint: route.tokenMint,
    tokenId: route.tokenId,
    programId: route.programId,
    merchantOwner: route.merchantOwner,
    merchantParticipantId: route.merchantParticipantId,
    messageVersion: route.messageVersion,
    messageDomain: route.messageDomain,
  };
}

function decodeBase64Json(value) {
  if (!value) return undefined;
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function extractSolanaChainReference(chainId) {
  return String(chainId).split(":")[1] || "";
}

function formatSIWSMessage(info, address) {
  const lines = [
    `${info.domain} wants you to sign in with your Solana account:`,
    address,
    "",
  ];
  if (info.statement) {
    lines.push(info.statement, "");
  }
  lines.push(
    `URI: ${info.uri}`,
    `Version: ${info.version}`,
    `Chain ID: ${extractSolanaChainReference(info.chainId)}`,
    `Nonce: ${info.nonce}`,
    `Issued At: ${info.issuedAt}`,
  );
  if (info.expirationTime) lines.push(`Expiration Time: ${info.expirationTime}`);
  if (info.notBefore) lines.push(`Not Before: ${info.notBefore}`);
  if (info.requestId) lines.push(`Request ID: ${info.requestId}`);
  if (info.resources && info.resources.length > 0) {
    lines.push("Resources:");
    for (const resource of info.resources) {
      lines.push(`- ${resource}`);
    }
  }
  return lines.join("\n");
}

function selectedSiwxChain(extension, requestedChainId) {
  const supported = Array.isArray(extension?.supportedChains) ? extension.supportedChains : [];
  if (requestedChainId) {
    return supported.find((chain) => chain.chainId === requestedChainId) || {
      chainId: requestedChainId,
      type: requestedChainId.startsWith("solana:") ? "ed25519" : "eip191",
    };
  }
  return supported[0];
}

function siwxChallenge(paymentRequired, flags) {
  const extension = paymentRequired?.extensions?.["sign-in-with-x"];
  if (!extension) return undefined;
  const chain = selectedSiwxChain(extension, flags.chainId);
  const info = chain ? { ...extension.info, chainId: chain.chainId, type: chain.type } : { ...extension.info };
  const address = flags.address || flags.authAddress;
  const signingMessage = address && info.chainId?.startsWith("solana:")
    ? formatSIWSMessage(info, address)
    : undefined;
  return {
    info: extension.info,
    supportedChains: extension.supportedChains || [],
    selectedChain: chain,
    signingMessage,
    signingMessageRequiresAddress: !signingMessage,
    messageFormat: "CAIP-122 Sign-In-With-X. For Solana, sign the SIWS message formed from info + selectedChain + address.",
  };
}

function authKind(accessMode) {
  if (accessMode === "siwx") return "siwx";
  if (accessMode === "exact") return "x402-exact";
  return accessMode;
}

function policyFromFlags(flags) {
  return {
    maxAmountUsdPerRequest: String(
      flags.maxAmountUsd
      || process.env.AGON_PAYMENT_MAX_AMOUNT_USD
      || DEFAULT_MAX_AMOUNT_USD,
    ),
    dailyLimitUsd: String(
      flags.dailyLimitUsd
      || process.env.AGON_PAYMENT_DAILY_LIMIT_USD
      || DEFAULT_DAILY_LIMIT_USD,
    ),
  };
}

async function prepareAuthRequest(flags, method, requestPath, options = {}) {
  const request = buildGatewayRequest(flags, method, requestPath, {
    ...options,
    includeAuthFlags: false,
  });

  let catalogRoute;
  try {
    const catalog = await getCatalog(flags);
    catalogRoute = findRouteForRequest(catalogRoutes(catalog), request.method, request.path);
  } catch {
    catalogRoute = undefined;
  }

  const fallbackRoute = inferRoute(request.path);
  let route = routeSummary(catalogRoute, fallbackRoute);
  let accessMode = flags.accessMode || route.accessMode || fallbackRoute.accessMode;
  let challengeResponse = options.challengeResponse;
  let decodedPaymentRequired;

  if (accessMode !== "agon-channel") {
    if (!challengeResponse) {
      challengeResponse = await requestGatewayRaw(flags, method, requestPath, {
        ...options,
        body: request.body,
        includeAuthFlags: false,
      });
    }
    decodedPaymentRequired = decodeBase64Json(headerValue(challengeResponse.headers, "payment-required"));
    if (decodedPaymentRequired?.extensions?.["sign-in-with-x"]) {
      accessMode = "siwx";
    }
    if (decodedPaymentRequired?.accepts?.length > 0 && accessMode !== "siwx") {
      accessMode = "exact";
    }
    route = { ...route, accessMode };
  }

  return {
    version: 1,
    kind: authKind(accessMode),
    accessMode,
    method: request.method,
    url: request.url.toString(),
    path: request.path,
    query: request.query,
    body: request.body === undefined ? null : request.body,
    bodyHashSha256: sha256Hex(request.bodyText),
    request: {
      method: request.method,
      url: request.url.toString(),
      bodyHashSha256: sha256Hex(request.bodyText),
    },
    walletProfile: flags.walletProfile || process.env.AGON_WALLET_PROFILE,
    policy: policyFromFlags(flags),
    route,
    challenge: {
      responseStatus: challengeResponse?.status,
      headers: challengeResponse?.headers || {},
      body: challengeResponse?.body,
      paymentRequired: decodedPaymentRequired,
      siwx: siwxChallenge(decodedPaymentRequired, flags),
    },
    instructions: authInstructions(accessMode),
  };
}

function authInstructions(accessMode) {
  if (accessMode === "siwx") {
    return [
      "Sign the SIWX challenge with any compatible wallet/payment layer.",
      "Retry the exact same request with SIGN-IN-WITH-X.",
    ];
  }
  if (accessMode === "agon-channel") {
    return [
      "Build the next cumulative Agon commitment for this route price and metadata.",
      "Retry the exact same request with X-Agon-Request-Id and AGON-COMMITMENT.",
    ];
  }
  return [
    "Create an x402 exact payment for the decoded payment requirements.",
    "Retry the exact same request with PAYMENT-SIGNATURE or X-PAYMENT.",
  ];
}

function encodeBase58(bytes) {
  if (!bytes || bytes.length === 0) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes) {
    if (byte === 0) digits.push(0);
    else break;
  }
  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

function signatureBytes(signature, encoding) {
  const text = String(signature);
  if (encoding === "hex" || (encoding === undefined && /^0x?[0-9a-fA-F]+$/.test(text))) {
    return Buffer.from(text.replace(/^0x/, ""), "hex");
  }
  if (encoding === "base64") {
    return Buffer.from(text, "base64");
  }
  if (encoding === "base64url") {
    return Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }
  return undefined;
}

function normalizeSignature(signature, encoding, chainId) {
  if (!chainId?.startsWith("solana:")) {
    return String(signature);
  }
  if (encoding === "base58") {
    return String(signature);
  }
  const bytes = signatureBytes(signature, encoding);
  return bytes ? encodeBase58(bytes) : String(signature);
}

function completeSiwx(authRequest, input) {
  const challenge = authRequest.challenge?.siwx;
  if (!challenge) {
    throw new Error("Challenge does not contain a sign-in-with-x extension.");
  }
  const chain = selectedSiwxChain(
    { supportedChains: challenge.supportedChains },
    input.chainId || challenge.selectedChain?.chainId,
  );
  if (!chain?.chainId) {
    throw new Error("No SIWX chain is available. Pass --chain-id.");
  }
  const info = {
    ...challenge.info,
    chainId: chain.chainId,
    type: chain.type || (chain.chainId.startsWith("solana:") ? "ed25519" : "eip191"),
  };
  const address = input.address;
  const signature = normalizeSignature(input.signature, input.signatureEncoding, info.chainId);
  const payload = {
    domain: info.domain,
    address,
    statement: info.statement,
    uri: info.uri,
    version: info.version,
    chainId: info.chainId,
    type: info.type,
    nonce: info.nonce,
    issuedAt: info.issuedAt,
    expirationTime: info.expirationTime,
    notBefore: info.notBefore,
    requestId: info.requestId,
    resources: info.resources,
    signature,
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const header = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const signingMessage = info.chainId.startsWith("solana:") ? formatSIWSMessage(info, address) : undefined;
  return {
    headers: {
      "SIGN-IN-WITH-X": header,
    },
    payload,
    signingMessage,
  };
}

function splitCommandLine(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("A signer command is required. Pass --auth-driver or set AGON_SIGNER_COMMAND.");
  const parts = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (quote) throw new Error("Unclosed quote in --auth-driver.");
  if (current) parts.push(current);
  return parts;
}

function authDriverCommand(flags) {
  return singleFlag(flags, "authDriver") || process.env.AGON_SIGNER_COMMAND;
}

function runAuthDriver(flags, authRequest, commandValue = authDriverCommand(flags)) {
  const driverParts = splitCommandLine(commandValue);
  const command = driverParts.shift();
  const args = [...driverParts, ...ensureArray(flags.authArg).map(String)];
  const timeout = Number(flags.authTimeoutMs || 30000);
  const result = childProcess.spawnSync(command, args, {
    input: JSON.stringify(authRequest),
    encoding: "utf8",
    shell: process.platform === "win32" && /^(npx|npm|pnpm|yarn)$/i.test(command),
    timeout,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Auth driver failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Auth driver exited with status ${result.status}: ${(result.stderr || "").trim()}`);
  }
  let output;
  try {
    output = JSON.parse(result.stdout || "{}");
  } catch (error) {
    throw new Error(`Auth driver returned invalid JSON: ${error.message}`);
  }
  return authHeadersFromDriverOutput(output, authRequest);
}

function authHeadersFromDriverOutput(output, authRequest) {
  if (output?.headers && typeof output.headers === "object" && !Array.isArray(output.headers)) {
    return Object.fromEntries(Object.entries(output.headers).map(([key, value]) => [key, String(value)]));
  }
  if (authRequest.accessMode === "siwx" && output?.address && output?.signature) {
    return completeSiwx(authRequest, {
      address: String(output.address),
      signature: String(output.signature),
      signatureEncoding: output.signatureEncoding,
      chainId: output.chainId,
    }).headers;
  }
  throw new Error("Auth driver must return headers, or address/signature for SIWX.");
}

function tokensPath(requestPath) {
  const trimmed = requestPath.replace(/^\/+/, "");
  if (trimmed.startsWith("v1/x402/tokens")) {
    return `/${trimmed}`;
  }
  return `/v1/x402/tokens/${trimmed}`;
}

function walletPrefix(cluster, accessMode) {
  if (accessMode === "agon-channel") {
    if (cluster && cluster !== "devnet") {
      throw new Error("Agon payment-channel routes are devnet-only. Use --cluster devnet or omit --cluster.");
    }
    return "/v1/agon-channel/helius/devnet/wallet";
  }
  return cluster === "devnet"
    ? "/v1/x402/helius/devnet/wallet"
    : "/v1/x402/helius/wallet";
}

function walletPath(cluster, action, wallet, accessMode) {
  const normalizedAction = action === "funded-by" ? "funded-by" : action;
  const prefix = walletPrefix(cluster, accessMode);
  return `${prefix}/${normalizedAction}/${encodeURIComponent(wallet)}`;
}

function routeCluster(flags) {
  if (flags.accessMode === "agon-channel") {
    if (flags.cluster && flags.cluster !== "devnet") {
      throw new Error("Agon payment-channel routes are devnet-only. Use --cluster devnet or omit --cluster.");
    }
    return "devnet";
  }
  return flags.cluster || "mainnet";
}

function agentPromptText() {
  return `Agon Gateway agent prompt

Use https://gateway.agonx402.com unless the user provides AGON_GATEWAY_BASE_URL.
Start with GET /v1/catalog and choose routes by accessMode.
For exact routes, send the final request once to get a 402 x402 challenge, then retry the exact same method, URL, query, and body with PAYMENT-SIGNATURE or X-PAYMENT from the user's payment layer.
For siwx routes, sign the sign-in-with-x challenge with the user's wallet and retry with SIGN-IN-WITH-X. Tokens API routes are SIWX-authenticated and free; do not use payment channels for Tokens.
For agon-channel routes, use devnet only and send X-Agon-Request-Id plus AGON-COMMITMENT built from official devnet USDC channel metadata.
The Gateway CLI/MCP do not custody keys themselves. Use AGON_SIGNER_COMMAND or --auth-driver to delegate SIWX/x402 signing to the default Agon agent wallet or any external wallet/policy system.`;
}

function authSchema() {
  return {
    authRequestVersion: 1,
    commands: {
      prepare: "agon-gateway auth prepare <METHOD> <PATH> [--query k=v] [--body JSON|@file] [--address ADDRESS]",
      complete: "agon-gateway auth complete --challenge FILE|- --address ADDRESS --signature SIGNATURE",
      call: "agon-gateway auth call <METHOD> <PATH> [--auth-driver COMMAND] or AGON_SIGNER_COMMAND",
    },
    authRequest: {
      version: 1,
      kind: "siwx | x402-exact | agon-channel",
      accessMode: "siwx | exact | agon-channel",
      method: "GET | POST",
      url: "absolute gateway URL",
      path: "/v1/...",
      query: "object; duplicate keys are arrays",
      body: "JSON body or null",
      bodyHashSha256: "sha256 of the exact JSON request body string, or empty body",
      request: "{ method, url, bodyHashSha256 }",
      walletProfile: "optional wallet profile hint",
      policy: "{ maxAmountUsdPerRequest, dailyLimitUsd }",
      route: "catalog metadata when available",
      challenge: "decoded 402 Payment-Required challenge when available",
    },
    driverInput: "The authRequest JSON is passed on stdin.",
    driverOutput: [
      { headers: { "SIGN-IN-WITH-X": "<base64-json>" } },
      { headers: { "X-PAYMENT": "<x402-payment>" } },
      { headers: { "PAYMENT-SIGNATURE": "<signature>" } },
      { headers: { "X-Agon-Request-Id": "<id>", "AGON-COMMITMENT": "<base64-json>" } },
      { address: "<wallet>", signature: "<signature>", signatureEncoding: "hex | base58 | base64 | base64url", chainId: "solana:..." },
    ],
  };
}

function commandExists(commandValue) {
  if (!commandValue) return undefined;
  const [command] = splitCommandLine(commandValue);
  if (command.includes("/") || command.includes("\\") || path.isAbsolute(command)) {
    return fs.existsSync(command);
  }
  const pathEnv = process.env.PATH || "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, process.platform === "win32" && path.extname(command) ? command : `${command}${ext}`);
      if (fs.existsSync(candidate)) return true;
    }
  }
  return false;
}

async function doctor(flags) {
  const baseUrl = normalizeBaseUrl(flags);
  const health = await requestGatewayRaw(flags, "GET", "/healthz").catch((error) => ({ ok: false, error: error.message }));
  const catalog = await getCatalog(flags).then((body) => ({
    ok: true,
    routeCount: catalogRoutes(body).length,
    providers: [...new Set(catalogRoutes(body).map((route) => route.provider).filter(Boolean))],
  })).catch((error) => ({ ok: false, error: error.message }));
  const signerCommand = authDriverCommand(flags);
  const authDriver = signerCommand ? {
    configured: true,
    source: flags.authDriver ? "--auth-driver" : "AGON_SIGNER_COMMAND",
    command: signerCommand,
    found: commandExists(signerCommand),
  } : { configured: false };

  return {
    ok: Boolean(health.ok && catalog.ok && (authDriver.configured === false || authDriver.found !== false)),
    cli: {
      name: pkg.name,
      version: pkg.version,
      node: process.version,
    },
    baseUrl,
    health,
    catalog,
    authDriver,
  };
}

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const command = args.shift();
  if (!command) usage(1);

  switch (command) {
    case "health":
      printJson(await requestGatewayRaw(flags, "GET", "/healthz"));
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

    case "agent-prompt":
      process.stdout.write(`${agentPromptText()}\n`);
      return;

    case "schema":
      printJson(authSchema());
      return;

    case "doctor":
      printJson(await doctor(flags));
      return;

    case "auth": {
      const subcommand = args.shift();
      if (!subcommand) throw new Error("auth requires prepare, complete, or call.");
      if (subcommand === "prepare") {
        const method = args.shift();
        const requestPath = args.shift();
        if (!method || !requestPath) throw new Error("auth prepare requires METHOD and PATH.");
        printJson(await prepareAuthRequest(flags, method, requestPath));
        return;
      }
      if (subcommand === "complete") {
        const challenge = readJsonDocument(singleFlag(flags, "challenge"), "--challenge");
        const address = singleFlag(flags, "address");
        const signature = singleFlag(flags, "signature");
        if (!address || !signature) throw new Error("auth complete requires --address and --signature.");
        printJson(completeSiwx(challenge, {
          address: String(address),
          signature: String(signature),
          signatureEncoding: flags.signatureEncoding,
          chainId: flags.chainId,
        }));
        return;
      }
      if (subcommand === "call") {
        const method = args.shift();
        const requestPath = args.shift();
        if (!method || !requestPath) throw new Error("auth call requires METHOD and PATH.");
        printJson(await requestGateway(flags, method, requestPath, { requireSignerOn402: true }));
        return;
      }
      throw new Error(`Unknown auth subcommand: ${subcommand}`);
    }

    case "call": {
      const method = args.shift();
      const requestPath = args.shift();
      if (!method || !requestPath) throw new Error("call requires METHOD and PATH.");
      printJson(await requestGateway(flags, method, requestPath));
      return;
    }

    case "rpc": {
      const method = args.shift();
      if (!method) throw new Error("rpc requires a method.");
      const params = parseJsonInput(flags.params || args.shift(), []);
      if (!Array.isArray(params)) throw new Error("rpc params must be a JSON array.");
      const cluster = routeCluster(flags);
      const provider = flags.provider || "helius";
      const exactPath = `/v1/x402/solana/${cluster}/${provider}/rpc/${method}`;
      const channelPath = `/v1/agon-channel/solana/devnet/${provider}/rpc/${method}`;
      const requestPath = flags.accessMode === "agon-channel" ? channelPath : exactPath;
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
      const cluster = routeCluster(flags);
      const provider = flags.provider || "helius";
      const exactPath = `/v1/x402/solana/${cluster}/${provider}/das/${method}`;
      const channelPath = `/v1/agon-channel/solana/devnet/${provider}/das/${method}`;
      const requestPath = flags.accessMode === "agon-channel" ? channelPath : exactPath;
      printJson(await requestGateway(flags, "POST", requestPath, { body: { params } }));
      return;
    }

    case "wallet": {
      const action = args.shift();
      if (!action) throw new Error("wallet requires an action.");
      const cluster = routeCluster(flags);
      if (action === "batch-identity") {
        const input = args.shift();
        if (!input) throw new Error("batch-identity requires a JSON array or comma-separated wallet list.");
        const wallets = input.trim().startsWith("[")
          ? parseJsonInput(input)
          : input.split(",").map((value) => value.trim()).filter(Boolean);
        const prefix = walletPrefix(cluster, flags.accessMode);
        printJson(await requestGateway(flags, "POST", `${prefix}/batch-identity`, { body: { wallets } }));
        return;
      }

      const wallet = args.shift();
      if (!wallet) throw new Error(`wallet ${action} requires a wallet.`);
      printJson(await requestGateway(flags, "GET", walletPath(cluster, action, wallet, flags.accessMode)));
      return;
    }

    case "tokens": {
      let method = "GET";
      if (args[0] && /^[A-Z]+$/.test(args[0])) {
        method = args.shift();
      }
      const requestPath = args.shift();
      if (!requestPath) throw new Error("tokens requires a tokens path.");
      printJson(await requestGateway(flags, method, tokensPath(requestPath)));
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
