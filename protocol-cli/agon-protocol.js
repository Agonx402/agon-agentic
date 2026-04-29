#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { buildClearingPreview, buildProtocolActionPlan } = require("./protocol-plan.js");

const DEFAULT_RPC_URL = process.env.ANCHOR_PROVIDER_URL || process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_CLUSTER = "devnet";
const DEFAULT_PROGRAM_ID = process.env.AGON_PROTOCOL_PROGRAM_ID || "3UyUFeNsUYPpM6hMRf7H8wg3MKEXQ82rqnsXhZrUwgSD";

function usage(exitCode = 0) {
  const text = `
Agon Protocol CLI

Usage:
  agon-protocol config [--rpc-url URL] [--program-id PUBKEY]
  agon-protocol token show [--mint PUBKEY] [--token-id ID]
  agon-protocol participant show --owner PUBKEY [--rpc-url URL] [--program-id PUBKEY]
  agon-protocol channel show --payer-id ID --payee-id ID [--token-id ID] [--rpc-url URL] [--program-id PUBKEY]
  agon-protocol channel headroom --payer-id ID --payee-id ID --latest-accepted AMOUNT [--token-id ID]
  agon-protocol clearing preview --participants N --channels N [--token-id ID]
  agon-protocol prepare <flow> [--key value ...]
  agon-protocol prepare gateway-commitment --payer-id ID --payee-id ID --committed-amount AMOUNT --signer PUBKEY [--program-id PUBKEY] [--token-id ID] [--signature BASE64]
  agon-protocol verify gateway-commitment --envelope BASE64_JSON

Read commands may fetch chain state. Prepare commands do not sign or broadcast.
Default devnet token is official USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
`;
  process.stderr.write(text.trimStart());
  process.exit(exitCode);
}

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") usage(0);
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }
    const eqIndex = token.indexOf("=");
    const rawName = eqIndex === -1 ? token.slice(2) : token.slice(2, eqIndex);
    const name = rawName.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    let value = eqIndex === -1 ? undefined : token.slice(eqIndex + 1);
    if (value === undefined) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        index += 1;
      } else {
        value = true;
      }
    }
    flags[name] = value;
  }
  return { args, flags };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function requireFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true || String(value).trim() === "") {
    throw new Error(`Missing required --${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.`);
  }
  return String(value);
}

function optionalNumber(flags, name) {
  if (flags[name] === undefined) return undefined;
  const value = Number(flags[name]);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer.`);
  }
  return value;
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
    if (localFallback.endsWith(".cjs.js")) {
      return require(localFallback);
    }
    return import(pathToFileURL(localFallback).href);
  }
}

async function loadClient(flags) {
  const [{ AgonClient }, anchor, web3] = await Promise.all([
    loadSdk(),
    loadPackage("@coral-xyz/anchor", path.resolve(__dirname, "..", "..", "agon-sdk", "node_modules", "@coral-xyz", "anchor", "dist", "cjs", "index.js")),
    loadPackage("@solana/web3.js", path.resolve(__dirname, "..", "..", "agon-sdk", "node_modules", "@solana", "web3.js", "lib", "index.cjs.js")),
  ]);
  const programId = flags.programId
    ? new web3.PublicKey(String(flags.programId))
    : new web3.PublicKey(DEFAULT_PROGRAM_ID);
  const connection = new web3.Connection(String(flags.rpcUrl || DEFAULT_RPC_URL), "confirmed");
  const readOnlyWallet = {
    publicKey: web3.PublicKey.default,
    signTransaction: async () => {
      throw new Error("agon-protocol CLI is read + prepare only and never signs.");
    },
    signAllTransactions: async () => {
      throw new Error("agon-protocol CLI is read + prepare only and never signs.");
    },
  };
  const provider = new anchor.AnchorProvider(connection, readOnlyWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return {
    client: new AgonClient({ provider, programId }),
    programId,
    connection,
    web3,
  };
}

async function resolveToken(flags, registry) {
  const sdk = await loadSdk();
  if (flags.tokenId !== undefined) {
    const tokenId = optionalNumber(flags, "tokenId");
    return {
      tokenId,
      mint: String(flags.mint || sdk.OFFICIAL_DEVNET_USDC_MINT),
      symbol: "USDC",
      decimals: 6,
      source: "tokenId",
    };
  }
  if (flags.mint && registry) {
    const found = sdk.resolveTokenByMint(registry.tokens || [], String(flags.mint));
    if (found) return found;
  }
  return sdk.resolveCanonicalDevnetUsdcToken({ registry });
}

function bigintJson(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(bigintJson);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = bigintJson(child);
    }
    return result;
  }
  if (value && typeof value.toString === "function" && value.constructor?.name === "BN") {
    return value.toString();
  }
  return value;
}

async function commandConfig(flags) {
  const { client, programId, connection } = await loadClient(flags);
  const [globalConfig, tokenRegistry] = await Promise.all([
    client.fetchGlobalConfig(),
    client.fetchTokenRegistry(),
  ]);
  printJson(bigintJson({
    cluster: flags.cluster || DEFAULT_CLUSTER,
    rpcUrl: connection.rpcEndpoint,
    programId: programId.toBase58(),
    globalConfig,
    tokenRegistry,
  }));
}

async function commandTokenShow(flags) {
  let registry = null;
  try {
    const { client } = await loadClient(flags);
    registry = await client.fetchTokenRegistry();
  } catch {
    registry = null;
  }
  printJson(await resolveToken(flags, registry));
}

async function commandParticipantShow(flags) {
  const { client, web3 } = await loadClient(flags);
  const owner = new web3.PublicKey(requireFlag(flags, "owner"));
  const participant = await client.fetchParticipant(owner);
  printJson(bigintJson({
    owner: owner.toBase58(),
    participantAddress: client.participantAddress(owner).toBase58(),
    participant,
  }));
}

async function commandChannelShow(flags, headroomOnly = false) {
  const sdk = await loadSdk();
  const { client } = await loadClient(flags);
  const registry = await client.fetchTokenRegistry();
  const token = await resolveToken(flags, registry);
  const payerId = Number(requireFlag(flags, "payerId"));
  const payeeId = Number(requireFlag(flags, "payeeId"));
  const address = client.channelAddress(payerId, payeeId, token.tokenId);
  const channel = await client.fetchChannel({ channelState: address });
  const latestAccepted = flags.latestAccepted ?? channel.settledCumulative;
  const headroom = sdk.calculateChannelHeadroom(channel, latestAccepted);
  printJson(bigintJson({
    channelAddress: address.toBase58(),
    token,
    channel,
    ...(headroomOnly ? { headroom } : {}),
  }));
}

async function commandPrepare(args, flags) {
  const flow = args.shift();
  if (!flow) throw new Error("prepare requires a flow name.");
  const sdk = await loadSdk();

  if (flow === "gateway-commitment") {
    const registry = await loadClient(flags)
      .then(({ client }) => client.fetchTokenRegistry())
      .catch(() => null);
    const token = await resolveToken(flags, registry);
      const payload = sdk.buildGatewayCommitmentPayload({
      cluster: flags.cluster || DEFAULT_CLUSTER,
      programId: flags.programId || DEFAULT_PROGRAM_ID,
      payerId: Number(requireFlag(flags, "payerId")),
      payeeId: Number(requireFlag(flags, "payeeId")),
      tokenId: token.tokenId,
      committedAmount: requireFlag(flags, "committedAmount"),
      signer: requireFlag(flags, "signer"),
      tokenMint: token.mint,
      tokenSymbol: token.symbol || "USDC",
      tokenDecimals: token.decimals ?? 6,
      signature: flags.signature === undefined ? undefined : String(flags.signature),
      authorizedSettler: flags.authorizedSettler
        ? new (await loadPackage("@solana/web3.js", path.resolve(__dirname, "..", "..", "agon-sdk", "node_modules", "@solana", "web3.js", "lib", "index.cjs.js"))).PublicKey(String(flags.authorizedSettler))
        : null,
    });
    const message = sdk.createGatewayCommitmentMessage(payload);
    printJson({
      kind: "gateway-commitment",
      payload,
      messageBase64: message.toString("base64"),
      envelope: sdk.encodeGatewayCommitmentEnvelope(payload),
      signing: "Sign messageBase64 with the channel authorized signer, then add signature to the payload.",
    });
    return;
  }

  printJson(await buildProtocolActionPlan(flow, flags));
}

async function commandVerify(args, flags) {
  const kind = args.shift();
  if (kind !== "gateway-commitment") {
    throw new Error("verify currently supports gateway-commitment only.");
  }
  const sdk = await loadSdk();
  printJson(sdk.verifyGatewayCommitmentEnvelope(requireFlag(flags, "envelope")));
}

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const command = args.shift();
  if (!command) usage(1);

  if (command === "config") return commandConfig(flags);
  if (command === "token" && args.shift() === "show") return commandTokenShow(flags);
  if (command === "participant" && args.shift() === "show") return commandParticipantShow(flags);
  if (command === "channel") {
    const action = args.shift();
    if (action === "show") return commandChannelShow(flags, false);
    if (action === "headroom") return commandChannelShow(flags, true);
  }
  if (command === "clearing" && args.shift() === "preview") return printJson(await buildClearingPreview(flags));
  if (command === "prepare") return commandPrepare(args, flags);
  if (command === "verify") return commandVerify(args, flags);
  throw new Error(`Unknown command.`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
