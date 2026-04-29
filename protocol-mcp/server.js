#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PROTOCOL_VERSION = "2024-11-05";
const LLM_RESOURCE_URI = "agon://protocol/llm.txt";
const DEFAULT_RPC_URL = process.env.ANCHOR_PROVIDER_URL || process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";

const tools = [
  {
    name: "agon_protocol_config",
    description: "Fetch Agon Protocol global config and token registry.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rpcUrl: { type: "string" },
        programId: { type: "string" },
      },
    },
  },
  {
    name: "agon_protocol_token",
    description: "Resolve the canonical devnet USDC token metadata from env, registry, or deployment config.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        mint: { type: "string" },
        tokenId: { type: "integer" },
      },
    },
  },
  {
    name: "agon_protocol_participant",
    description: "Fetch a participant account by owner public key.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["owner"],
      properties: {
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        owner: { type: "string" },
      },
    },
  },
  {
    name: "agon_protocol_channel",
    description: "Fetch a channel by payer/payee participant IDs.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["payerId", "payeeId"],
      properties: {
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        tokenId: { type: "integer" },
        payerId: { type: "integer" },
        payeeId: { type: "integer" },
      },
    },
  },
  {
    name: "agon_protocol_headroom",
    description: "Compute gateway spendable headroom for a channel.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["payerId", "payeeId", "latestAcceptedCommitted"],
      properties: {
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        tokenId: { type: "integer" },
        payerId: { type: "integer" },
        payeeId: { type: "integer" },
        latestAcceptedCommitted: { type: "string" },
      },
    },
  },
  {
    name: "agon_protocol_prepare_gateway_commitment",
    description: "Prepare a gateway cumulative commitment payload and message bytes. Does not sign.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["programId", "payerId", "payeeId", "tokenId", "committedAmount", "signer"],
      properties: {
        programId: { type: "string" },
        payerId: { type: "integer" },
        payeeId: { type: "integer" },
        tokenId: { type: "integer" },
        committedAmount: { type: "string" },
        signer: { type: "string" },
        signature: { type: "string" },
      },
    },
  },
  {
    name: "agon_protocol_verify_gateway_commitment",
    description: "Verify a signed gateway cumulative commitment envelope.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["envelope"],
      properties: {
        envelope: { type: "string" },
      },
    },
  },
  {
    name: "agon_protocol_prepare_action",
    description: "Return a stable prepare-only plan for a protocol action such as deposit, create-channel, lock, unlock, withdrawal, settle-individual, or settle-bundle.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      required: ["action"],
      properties: {
        action: { type: "string" },
      },
    },
  },
];

let inputBuffer = Buffer.alloc(0);

function content(text) {
  return [{ type: "text", text }];
}

function jsonContent(value) {
  return content(JSON.stringify(bigintJson(value), null, 2));
}

function bigintJson(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(bigintJson);
  if (value && typeof value === "object") {
    if (value.constructor?.name === "BN" && typeof value.toString === "function") {
      return value.toString();
    }
    const result = {};
    for (const [key, child] of Object.entries(value)) result[key] = bigintJson(child);
    return result;
  }
  return value;
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function parseMessages() {
  const messages = [];
  while (inputBuffer.length > 0) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headerText = inputBuffer.slice(0, headerEnd).toString("utf8");
    const match = /content-length:\s*(\d+)/i.exec(headerText);
    if (!match) throw new Error("Missing Content-Length header.");
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

async function loadSdk() {
  try {
    return await import("@agonx402/sdk");
  } catch {
    const localSdk = path.resolve(__dirname, "..", "..", "agon-sdk", "packages", "sdk", "dist", "index.js");
    return import(pathToFileURL(localSdk).href);
  }
}

async function loadPackage(name, localFallback) {
  try {
    return await import(name);
  } catch {
    return import(pathToFileURL(localFallback).href);
  }
}

async function loadClient(args) {
  const [{ AgonClient, AGON_PROTOCOL_PROGRAM_ID }, anchor, web3] = await Promise.all([
    loadSdk(),
    loadPackage("@coral-xyz/anchor", path.resolve(__dirname, "..", "..", "agon-sdk", "node_modules", "@coral-xyz", "anchor", "dist", "cjs", "index.js")),
    loadPackage("@solana/web3.js", path.resolve(__dirname, "..", "..", "agon-sdk", "node_modules", "@solana", "web3.js", "lib", "index.esm.js")),
  ]);
  const programId = args.programId ? new web3.PublicKey(args.programId) : AGON_PROTOCOL_PROGRAM_ID;
  const connection = new web3.Connection(args.rpcUrl || DEFAULT_RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, {
    publicKey: web3.PublicKey.default,
    signTransaction: async () => {
      throw new Error("Agon Protocol MCP is read + prepare only and never signs.");
    },
    signAllTransactions: async () => {
      throw new Error("Agon Protocol MCP is read + prepare only and never signs.");
    },
  }, { commitment: "confirmed", preflightCommitment: "confirmed" });
  return { client: new AgonClient({ provider, programId }), programId, web3 };
}

async function resolveToken(args, client) {
  const sdk = await loadSdk();
  const registry = client ? await client.fetchTokenRegistry() : null;
  if (args.tokenId !== undefined) {
    const tokens = registry?.tokens || [];
    const found = tokens.find((token) => Number(token.id ?? token.tokenId) === Number(args.tokenId));
    return found
      ? sdk.resolveTokenByMint(tokens, found.mint)
      : { tokenId: Number(args.tokenId), mint: args.mint || sdk.OFFICIAL_DEVNET_USDC_MINT, symbol: "USDC", decimals: 6 };
  }
  if (args.mint && registry) {
    const found = sdk.resolveTokenByMint(registry.tokens || [], args.mint);
    if (found) return found;
  }
  return sdk.resolveCanonicalDevnetUsdcToken({ registry });
}

async function callTool(name, args) {
  const sdk = await loadSdk();
  switch (name) {
    case "agon_protocol_config": {
      const { client, programId } = await loadClient(args);
      const [globalConfig, tokenRegistry] = await Promise.all([client.fetchGlobalConfig(), client.fetchTokenRegistry()]);
      return { content: jsonContent({ programId: programId.toBase58(), globalConfig, tokenRegistry }) };
    }
    case "agon_protocol_token": {
      let client = null;
      try {
        client = (await loadClient(args)).client;
      } catch {
        client = null;
      }
      return { content: jsonContent(await resolveToken(args, client)) };
    }
    case "agon_protocol_participant": {
      const { client, web3 } = await loadClient(args);
      const owner = new web3.PublicKey(args.owner);
      return { content: jsonContent({ participantAddress: client.participantAddress(owner).toBase58(), participant: await client.fetchParticipant(owner) }) };
    }
    case "agon_protocol_channel":
    case "agon_protocol_headroom": {
      const { client } = await loadClient(args);
      const token = await resolveToken(args, client);
      const address = client.channelAddress(Number(args.payerId), Number(args.payeeId), token.tokenId);
      const channel = await client.fetchChannel({ channelState: address });
      const result = { channelAddress: address.toBase58(), token, channel };
      if (name === "agon_protocol_headroom") {
        result.headroom = sdk.calculateChannelHeadroom(channel, args.latestAcceptedCommitted);
      }
      return { content: jsonContent(result) };
    }
    case "agon_protocol_prepare_gateway_commitment": {
      const payload = sdk.buildGatewayCommitmentPayload({
        cluster: "devnet",
        programId: args.programId,
        payerId: Number(args.payerId),
        payeeId: Number(args.payeeId),
        tokenId: Number(args.tokenId),
        committedAmount: args.committedAmount,
        signer: args.signer,
        tokenMint: sdk.OFFICIAL_DEVNET_USDC_MINT,
        tokenSymbol: "USDC",
        tokenDecimals: 6,
        signature: args.signature,
      });
      const message = sdk.createGatewayCommitmentMessage(payload);
      return { content: jsonContent({ payload, messageBase64: message.toString("base64"), envelope: sdk.encodeGatewayCommitmentEnvelope(payload) }) };
    }
    case "agon_protocol_verify_gateway_commitment":
      return { content: jsonContent(sdk.verifyGatewayCommitmentEnvelope(args.envelope)) };
    case "agon_protocol_prepare_action":
      return {
        content: jsonContent({
          kind: "prepare",
          action: args.action,
          signs: false,
          broadcasts: false,
          params: args,
          tokenDefault: {
            cluster: "devnet",
            symbol: "USDC",
            mint: sdk.OFFICIAL_DEVNET_USDC_MINT,
          },
        }),
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function llmText() {
  const candidates = [
    path.resolve(__dirname, "llm.txt"),
    path.resolve(__dirname, "..", "protocol-mcp", "llm.txt"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8");
  }
  return "Agon Protocol MCP server. Use read and prepare tools only; no signing or broadcast.";
}

async function handleRequest(message) {
  const id = message.id;
  const params = message.params || {};
  try {
    switch (message.method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: { name: "agon-protocol-mcp", version: "0.1.0" },
        });
        return;
      case "tools/list":
        sendResult(id, { tools });
        return;
      case "tools/call":
        sendResult(id, await callTool(params.name, params.arguments || {}));
        return;
      case "resources/list":
        sendResult(id, { resources: [{ uri: LLM_RESOURCE_URI, name: "Agon Protocol llm.txt", mimeType: "text/plain", description: "LLM-readable instructions for Agon Protocol." }] });
        return;
      case "resources/read":
        if (params.uri !== LLM_RESOURCE_URI) {
          sendError(id, -32602, `Unknown resource: ${params.uri}`);
          return;
        }
        sendResult(id, { contents: [{ uri: LLM_RESOURCE_URI, mimeType: "text/plain", text: llmText() }] });
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
    if (id !== undefined) sendError(id, -32000, error.message || "Internal error");
  }
}

process.stdin.on("data", async (chunk) => {
  try {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    for (const message of parseMessages()) await handleRequest(message);
  } catch (error) {
    sendError(null, -32700, error.message || "Parse error");
  }
});

process.stdin.resume();
