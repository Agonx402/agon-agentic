#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const childProcess = require("node:child_process");
const pkg = require("./package.json");

const DEFAULT_BASE_URL = process.env.AGON_GATEWAY_BASE_URL || "https://gateway.agonx402.com";
const DEFAULT_MAX_AMOUNT_USD = "0.01";
const DEFAULT_DAILY_LIMIT_USD = "1.00";
const PROTOCOL_VERSION = "2024-11-05";
const LLM_RESOURCE_URI = "agon://gateway/llm.txt";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const tools = [
  {
    name: "agon_gateway_health",
    description: "Check Agon Gateway health.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        baseUrl: { type: "string", description: "Gateway base URL. Defaults to AGON_GATEWAY_BASE_URL or production." },
      },
    },
  },
  {
    name: "agon_gateway_catalog",
    description: "Fetch the live Agon Gateway route catalog, optionally scoped to a provider.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        baseUrl: { type: "string" },
        provider: { type: "string", enum: ["alchemy", "helius", "tokens", "tokensapi", "tokens-api"] },
      },
    },
  },
  {
    name: "agon_gateway_find_route",
    description: "Find routes in the live catalog by provider, surface, method, path substring, or access mode.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        baseUrl: { type: "string" },
        provider: { type: "string", enum: ["alchemy", "helius", "tokens"] },
        surface: { type: "string", enum: ["rpc", "das", "wallet", "tokens"] },
        method: { type: "string" },
        path: { type: "string" },
        accessMode: { type: "string", enum: ["exact", "siwx", "agon-channel"] },
      },
    },
  },
  {
    name: "agon_gateway_prepare_solana",
    description: "Prepare a Solana RPC or DAS Agon Gateway request object without sending it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["surface", "method", "params"],
      properties: {
        baseUrl: { type: "string" },
        cluster: { type: "string", enum: ["mainnet", "devnet"], default: "mainnet" },
        provider: { type: "string", enum: ["alchemy", "helius"], default: "helius" },
        surface: { type: "string", enum: ["rpc", "das"] },
        accessMode: { type: "string", enum: ["exact", "agon-channel"], default: "exact" },
        method: { type: "string" },
        params: { description: "RPC params array or DAS params object." },
      },
    },
  },
  {
    name: "agon_gateway_prepare_wallet",
    description: "Prepare a Helius Wallet Agon Gateway request object without sending it, including x402 or agon-channel paths.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        baseUrl: { type: "string" },
        cluster: { type: "string", enum: ["mainnet", "devnet"], default: "mainnet" },
        accessMode: { type: "string", enum: ["exact", "agon-channel"], default: "exact" },
        action: { type: "string", enum: ["identity", "balances", "history", "transfers", "funded-by", "batch-identity"] },
        wallet: { type: "string", description: "Wallet address for non-batch wallet actions." },
        wallets: { type: "array", items: { type: "string" }, description: "Wallet list for batch-identity." },
        query: {
          oneOf: [
            { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
            { type: "array", items: { type: "array", minItems: 2, maxItems: 2 } },
          ],
        },
      },
    },
  },
  {
    name: "agon_gateway_call",
    description: "Call an Agon Gateway route. Use without payment/SIWX headers to issue a challenge, then retry with PAYMENT-SIGNATURE, X-PAYMENT, or SIGN-IN-WITH-X.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["method", "path"],
      properties: {
        baseUrl: { type: "string" },
        method: { type: "string", description: "HTTP method, for example GET or POST." },
        path: { type: "string", description: "Gateway path, for example /v1/catalog." },
        query: {
          oneOf: [
            { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
            { type: "array", items: { type: "array", minItems: 2, maxItems: 2 } },
          ],
        },
        body: { description: "JSON body. Omit for GET/HEAD." },
        paymentSignature: { type: "string", description: "Value for PAYMENT-SIGNATURE." },
        xPayment: { type: "string", description: "Value for X-PAYMENT." },
        siwx: { type: "string", description: "Value for SIGN-IN-WITH-X." },
        headers: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
  {
    name: "agon_gateway_prepare_auth",
    description: "Prepare wallet/payment authorization JSON for a Gateway route without signing, paying, or running local commands.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["method", "path"],
      properties: {
        baseUrl: { type: "string" },
        method: { type: "string" },
        path: { type: "string" },
        accessMode: { type: "string", enum: ["exact", "siwx", "agon-channel"] },
        address: { type: "string", description: "Optional wallet address used to render a concrete SIWX signing message." },
        chainId: { type: "string", description: "Optional SIWX chain ID to select from the challenge." },
        query: {
          oneOf: [
            { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
            { type: "array", items: { type: "array", minItems: 2, maxItems: 2 } },
          ],
        },
        body: { description: "JSON body. Omit for GET/HEAD." },
        headers: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
  {
    name: "agon_gateway_complete_siwx",
    description: "Build a SIGN-IN-WITH-X header from a prepared SIWX challenge plus a wallet address and signature.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["challenge", "address", "signature"],
      properties: {
        challenge: { type: "object", description: "The JSON returned by agon_gateway_prepare_auth." },
        address: { type: "string" },
        signature: { type: "string" },
        signatureEncoding: { type: "string", enum: ["hex", "base58", "base64", "base64url"], default: "base58" },
        chainId: { type: "string" },
      },
    },
  },
  {
    name: "agon_gateway_call_with_headers",
    description: "Call a Gateway route with caller-supplied auth/payment headers. MCP does not sign, pay, or execute wallet commands.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["method", "path", "headers"],
      properties: {
        baseUrl: { type: "string" },
        method: { type: "string" },
        path: { type: "string" },
        query: {
          oneOf: [
            { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
            { type: "array", items: { type: "array", minItems: 2, maxItems: 2 } },
          ],
        },
        body: { description: "JSON body. Omit for GET/HEAD." },
        headers: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
  {
    name: "agon_gateway_auth_call",
    description: "Call any Agon Gateway route, use a configured signer hook for SIWX/x402 challenges, and retry the exact same request.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["method", "path"],
      properties: {
        baseUrl: { type: "string" },
        method: { type: "string" },
        path: { type: "string" },
        query: {
          oneOf: [
            { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
            { type: "array", items: { type: "array", minItems: 2, maxItems: 2 } },
          ],
        },
        body: { description: "JSON body. Omit for GET/HEAD." },
        headers: { type: "object", additionalProperties: { type: "string" } },
        signerCommand: { type: "string", description: "Signer hook command. Defaults to AGON_SIGNER_COMMAND." },
        walletProfile: { type: "string", description: "Optional wallet profile hint passed to the signer hook." },
        maxAmountUsd: { type: "string", description: "Optional x402 max per request." },
        dailyLimitUsd: { type: "string", description: "Optional x402 daily authorized spend limit." },
      },
    },
  },
];

let inputBuffer = Buffer.alloc(0);

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function content(text) {
  return [{ type: "text", text }];
}

function jsonContent(value) {
  return content(JSON.stringify(value, null, 2));
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

function parseMessages() {
  const messages = [];
  while (inputBuffer.length > 0) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const headerText = inputBuffer.slice(0, headerEnd).toString("utf8");
    const match = /content-length:\s*(\d+)/i.exec(headerText);
    if (!match) {
      throw new Error("Missing Content-Length header.");
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (inputBuffer.length < bodyEnd) break;

    const body = inputBuffer.slice(bodyStart, bodyEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(bodyEnd);
    messages.push(JSON.parse(body));
  }
  return messages;
}

function importantHeaders(headers) {
  const wanted = new Set([
    "content-type",
    "payment-required",
    "www-authenticate",
    "x-payment-response",
    "payment-response",
  ]);
  const result = {};
  for (const [key, value] of headers.entries()) {
    if (wanted.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

function appendQuery(url, query) {
  if (!query) return;
  if (Array.isArray(query)) {
    for (const pair of query) {
      if (Array.isArray(pair) && pair.length === 2) {
        url.searchParams.append(String(pair[0]), String(pair[1]));
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }
}

function walletPrefix(cluster, accessMode) {
  if (accessMode === "agon-channel") {
    if (cluster && cluster !== "devnet") {
      throw new Error("Agon payment-channel routes are devnet-only. Use cluster=devnet or omit cluster.");
    }
    return "/v1/agon-channel/helius/devnet/wallet";
  }
  return cluster === "devnet"
    ? "/v1/x402/helius/devnet/wallet"
    : "/v1/x402/helius/wallet";
}

function channelInstructions(accessMode) {
  return accessMode === "agon-channel"
    ? [
      "Send this exact method and path with X-Agon-Request-Id and AGON-COMMITMENT.",
      "AGON-COMMITMENT must be a signed Agon cumulative commitment envelope denominated in official devnet USDC.",
    ]
    : [
      "Send this exact method, path, and body without payment headers to receive a 402 challenge.",
      "Retry with the same method, path, and body plus PAYMENT-SIGNATURE or X-PAYMENT.",
    ];
}

function routeCluster(args) {
  if ((args.accessMode || "exact") === "agon-channel") {
    if (args.cluster && args.cluster !== "devnet") {
      throw new Error("Agon payment-channel routes are devnet-only. Use cluster=devnet or omit cluster.");
    }
    return "devnet";
  }
  return args.cluster || "mainnet";
}

async function fetchGateway(args, method, routePath, options = {}) {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const url = new URL(routePath, `${baseUrl}/`);
  appendQuery(url, options.query || args.query);

  const headers = {
    accept: "application/json",
    ...(args.headers || {}),
  };
  if (args.paymentSignature) headers["PAYMENT-SIGNATURE"] = args.paymentSignature;
  if (args.xPayment) headers["X-PAYMENT"] = args.xPayment;
  if (args.siwx) headers["SIGN-IN-WITH-X"] = args.siwx;

  const upperMethod = method.toUpperCase();
  const init = { method: upperMethod, headers };
  const body = options.body !== undefined ? options.body : args.body;
  if (body !== undefined && upperMethod !== "GET" && upperMethod !== "HEAD") {
    headers["content-type"] = headers["content-type"] || "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const raw = await response.text();
  let parsed = raw;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  } else {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    method: upperMethod,
    url: url.toString(),
    headers: importantHeaders(response.headers),
    body: parsed,
  };
}

async function getCatalog(args) {
  const query = args.provider ? { provider: args.provider } : undefined;
  const response = await fetchGateway(args, "GET", "/v1/catalog", { query });
  if (!response.ok) {
    throw new Error(`Catalog request failed with HTTP ${response.status}`);
  }
  return response.body;
}

function catalogRoutes(catalog) {
  return Array.isArray(catalog.routes) ? catalog.routes : [];
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

function queryObjectFromUrl(url) {
  const result = {};
  for (const [key, value] of url.searchParams.entries()) {
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
    for (const resource of info.resources) lines.push(`- ${resource}`);
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

function siwxChallenge(paymentRequired, args) {
  const extension = paymentRequired?.extensions?.["sign-in-with-x"];
  if (!extension) return undefined;
  const chain = selectedSiwxChain(extension, args.chainId);
  const info = chain ? { ...extension.info, chainId: chain.chainId, type: chain.type } : { ...extension.info };
  const signingMessage = args.address && info.chainId?.startsWith("solana:")
    ? formatSIWSMessage(info, args.address)
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

function policyFromArgs(args) {
  return {
    maxAmountUsdPerRequest: String(
      args.maxAmountUsd
      || process.env.AGON_PAYMENT_MAX_AMOUNT_USD
      || DEFAULT_MAX_AMOUNT_USD,
    ),
    dailyLimitUsd: String(
      args.dailyLimitUsd
      || process.env.AGON_PAYMENT_DAILY_LIMIT_USD
      || DEFAULT_DAILY_LIMIT_USD,
    ),
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

async function prepareAuth(args, existingChallengeResponse) {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const method = args.method.toUpperCase();
  const url = new URL(args.path, `${baseUrl}/`);
  appendQuery(url, args.query);
  const bodyText = requestBodyText(method, args.body);

  let catalogRoute;
  try {
    const catalog = await getCatalog({ baseUrl });
    catalogRoute = findRouteForRequest(catalogRoutes(catalog), method, url.pathname);
  } catch {
    catalogRoute = undefined;
  }

  const fallbackRoute = inferRoute(url.pathname);
  let route = routeSummary(catalogRoute, fallbackRoute);
  let accessMode = args.accessMode || route.accessMode || fallbackRoute.accessMode;
  let challengeResponse = existingChallengeResponse;
  let paymentRequired;

  if (accessMode !== "agon-channel") {
    if (!challengeResponse) {
      challengeResponse = await fetchGateway({
        baseUrl,
        query: args.query,
        body: args.body,
        headers: args.headers,
      }, method, args.path);
    }
    paymentRequired = decodeBase64Json(headerValue(challengeResponse.headers, "payment-required"));
    if (paymentRequired?.extensions?.["sign-in-with-x"]) accessMode = "siwx";
    else if (paymentRequired?.accepts?.length > 0) accessMode = "exact";
    route = { ...route, accessMode };
  }

  return {
    version: 1,
    kind: authKind(accessMode),
    accessMode,
    method,
    url: url.toString(),
    path: url.pathname,
    query: queryObjectFromUrl(url),
    body: args.body === undefined ? null : args.body,
    bodyHashSha256: sha256Hex(bodyText),
    request: {
      method,
      url: url.toString(),
      bodyHashSha256: sha256Hex(bodyText),
    },
    walletProfile: args.walletProfile || process.env.AGON_WALLET_PROFILE,
    policy: policyFromArgs(args),
    route,
    challenge: {
      responseStatus: challengeResponse?.status,
      headers: challengeResponse?.headers || {},
      body: challengeResponse?.body,
      paymentRequired,
      siwx: siwxChallenge(paymentRequired, args),
    },
    instructions: authInstructions(accessMode),
  };
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
  if (encoding === "base64") return Buffer.from(text, "base64");
  if (encoding === "base64url") return Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return undefined;
}

function normalizeSignature(signature, encoding, chainId) {
  if (!chainId?.startsWith("solana:")) return String(signature);
  if (encoding === "base58") return String(signature);
  const bytes = signatureBytes(signature, encoding);
  return bytes ? encodeBase58(bytes) : String(signature);
}

function completeSiwx(authRequest, input) {
  const challenge = authRequest.challenge?.siwx;
  if (!challenge) throw new Error("Challenge does not contain a sign-in-with-x extension.");
  const chain = selectedSiwxChain({ supportedChains: challenge.supportedChains }, input.chainId || challenge.selectedChain?.chainId);
  if (!chain?.chainId) throw new Error("No SIWX chain is available.");
  const info = {
    ...challenge.info,
    chainId: chain.chainId,
    type: chain.type || (chain.chainId.startsWith("solana:") ? "ed25519" : "eip191"),
  };
  const payload = {
    domain: info.domain,
    address: input.address,
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
    signature: normalizeSignature(input.signature, input.signatureEncoding, info.chainId),
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return {
    headers: {
      "SIGN-IN-WITH-X": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    },
    payload,
    signingMessage: info.chainId.startsWith("solana:") ? formatSIWSMessage(info, input.address) : undefined,
  };
}

function splitCommandLine(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("A signer command is required. Pass signerCommand or set AGON_SIGNER_COMMAND.");
  const parts = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
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
  if (quote) throw new Error("Unclosed quote in signer command.");
  if (current) parts.push(current);
  return parts;
}

function authHeadersFromSignerOutput(output, authRequest) {
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
  throw new Error("Signer command must return headers, or address/signature for SIWX.");
}

function runSignerCommand(commandValue, authRequest) {
  const parts = splitCommandLine(commandValue);
  const command = parts.shift();
  const result = childProcess.spawnSync(command, parts, {
    input: JSON.stringify(authRequest),
    encoding: "utf8",
    shell: process.platform === "win32" && /^(npx|npm|pnpm|yarn)$/i.test(command),
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Signer command failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Signer command exited with status ${result.status}: ${(result.stderr || "").trim()}`);
  }
  let output;
  try {
    output = JSON.parse(result.stdout || "{}");
  } catch (error) {
    throw new Error(`Signer command returned invalid JSON: ${error.message}`);
  }
  return authHeadersFromSignerOutput(output, authRequest);
}

async function authCall(args) {
  const firstResponse = await fetchGateway(args, args.method, args.path);
  if (firstResponse.status !== 402) {
    return firstResponse;
  }
  const signerCommand = args.signerCommand || process.env.AGON_SIGNER_COMMAND;
  if (!signerCommand) {
    throw new Error("Gateway returned 402 Payment Required; agon_gateway_auth_call requires signerCommand or AGON_SIGNER_COMMAND.");
  }
  const authRequest = await prepareAuth(args, firstResponse);
  const signerHeaders = runSignerCommand(signerCommand, authRequest);
  return fetchGateway({
    ...args,
    headers: {
      ...(args.headers || {}),
      ...signerHeaders,
    },
  }, args.method, args.path);
}

async function callTool(name, args) {
  switch (name) {
    case "agon_gateway_health":
      return { content: jsonContent(await fetchGateway(args, "GET", "/healthz")) };

    case "agon_gateway_catalog":
      return { content: jsonContent(await getCatalog(args)) };

    case "agon_gateway_find_route": {
      const catalog = await getCatalog(args);
      const routes = catalogRoutes(catalog).filter((route) => {
        if (args.provider && route.provider !== args.provider) return false;
        if (args.surface && route.surface !== args.surface) return false;
        if (args.accessMode && route.accessMode !== args.accessMode) return false;
        if (args.method && route.method !== args.method) return false;
        if (args.path && !route.path.includes(args.path)) return false;
        return true;
      });
      return { content: jsonContent(routes) };
    }

    case "agon_gateway_prepare_solana": {
      const cluster = routeCluster(args);
      const provider = args.provider || "helius";
      const accessMode = args.accessMode || "exact";
      const prefix = accessMode === "agon-channel" ? "/v1/agon-channel" : "/v1/x402";
      const pathValue = accessMode === "agon-channel"
        ? `${prefix}/solana/devnet/${provider}/${args.surface}/${args.method}`
        : `${prefix}/solana/${cluster}/${provider}/${args.surface}/${args.method}`;
      const body = { params: args.params };
      return {
        content: jsonContent({
          baseUrl: normalizeBaseUrl(args.baseUrl),
          method: "POST",
          path: pathValue,
          body,
          accessMode,
          instructions: channelInstructions(accessMode),
        }),
      };
    }

    case "agon_gateway_prepare_wallet": {
      const cluster = routeCluster(args);
      const accessMode = args.accessMode || "exact";
      const prefix = walletPrefix(cluster, accessMode);
      const action = args.action === "funded-by" ? "funded-by" : args.action;
      if (action === "batch-identity") {
        if (!Array.isArray(args.wallets) || args.wallets.length === 0) {
          throw new Error("batch-identity requires wallets.");
        }
        return {
          content: jsonContent({
            baseUrl: normalizeBaseUrl(args.baseUrl),
            method: "POST",
            path: `${prefix}/batch-identity`,
            body: { wallets: args.wallets },
            accessMode,
            query: args.query,
            instructions: channelInstructions(accessMode),
          }),
        };
      }
      if (!args.wallet) throw new Error(`${action} requires wallet.`);
      return {
        content: jsonContent({
          baseUrl: normalizeBaseUrl(args.baseUrl),
          method: "GET",
          path: `${prefix}/${action}/${encodeURIComponent(args.wallet)}`,
          accessMode,
          query: args.query,
          instructions: channelInstructions(accessMode),
        }),
      };
    }

    case "agon_gateway_call":
      return { content: jsonContent(await fetchGateway(args, args.method, args.path)) };

    case "agon_gateway_prepare_auth":
      return { content: jsonContent(await prepareAuth(args)) };

    case "agon_gateway_complete_siwx":
      return { content: jsonContent(completeSiwx(args.challenge, args)) };

    case "agon_gateway_call_with_headers":
      return { content: jsonContent(await fetchGateway(args, args.method, args.path)) };

    case "agon_gateway_auth_call":
      return { content: jsonContent(await authCall(args)) };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function llmText() {
  const candidates = [
    path.resolve(__dirname, "llm.txt"),
    path.resolve(__dirname, "..", "llm.txt"),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    }
  }

  return "Agon Gateway MCP server. Fetch the live route catalog with agon_gateway_catalog.";
}

async function handleRequest(message) {
  const id = message.id;
  const params = message.params || {};

  try {
    switch (message.method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: {
            name: "agon-gateway-mcp",
            version: pkg.version,
          },
        });
        return;

      case "tools/list":
        sendResult(id, { tools });
        return;

      case "tools/call": {
        const result = await callTool(params.name, params.arguments || {});
        sendResult(id, result);
        return;
      }

      case "resources/list":
        sendResult(id, {
          resources: [
            {
              uri: LLM_RESOURCE_URI,
              name: "Agon Gateway llm.txt",
              mimeType: "text/plain",
              description: "LLM-readable instructions for using Agon Gateway.",
            },
          ],
        });
        return;

      case "resources/read":
        if (params.uri !== LLM_RESOURCE_URI) {
          sendError(id, -32602, `Unknown resource: ${params.uri}`);
          return;
        }
        sendResult(id, {
          contents: [
            {
              uri: LLM_RESOURCE_URI,
              mimeType: "text/plain",
              text: llmText(),
            },
          ],
        });
        return;

      case "ping":
        sendResult(id, {});
        return;

      case "notifications/initialized":
      case "notifications/cancelled":
        return;

      default:
        if (id !== undefined) sendError(id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    if (id !== undefined) {
      sendError(id, -32000, error.message || "Internal error");
    }
  }
}

process.stdin.on("data", async (chunk) => {
  try {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    const messages = parseMessages();
    for (const message of messages) {
      await handleRequest(message);
    }
  } catch (error) {
    sendError(null, -32700, error.message || "Parse error");
  }
});

process.stdin.resume();
