#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_URL = process.env.AGON_GATEWAY_BASE_URL || "https://gateway.agonx402.com";
const PROTOCOL_VERSION = "2024-11-05";
const LLM_RESOURCE_URI = "agon://gateway/llm.txt";

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
      const cluster = args.cluster || "mainnet";
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
          instructions: [
            accessMode === "agon-channel"
              ? "Send this exact method, path, and body with X-Agon-Request-Id and AGON-COMMITMENT."
              : "Send this exact method, path, and body without payment headers to receive a 402 challenge.",
            accessMode === "agon-channel"
              ? "AGON-COMMITMENT must be a signed Agon cumulative commitment envelope."
              : "Retry with the same method, path, and body plus PAYMENT-SIGNATURE or X-PAYMENT.",
          ],
        }),
      };
    }

    case "agon_gateway_call":
      return { content: jsonContent(await fetchGateway(args, args.method, args.path)) };

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
            version: "0.1.0",
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
