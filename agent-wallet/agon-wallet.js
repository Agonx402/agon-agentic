#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Keypair } = require("@solana/web3.js");

const DEFAULT_PROFILE = process.env.AGON_WALLET_PROFILE || "default";
const DEFAULT_MAINNET_CHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function usage(exitCode = 0) {
  const text = `
Agon Agent Wallet

Convenience signer for Agon Gateway Tokens API (SIWX / sign-in-with-x) only.
For x402 exact-payment routes, configure a different signer via AGON_SIGNER_COMMAND.

Usage:
  agon-wallet setup [--profile NAME] [--force]
  agon-wallet authorize --stdin [--profile NAME] [--wallet-path PATH]
  agon-wallet show [--profile NAME]
  agon-wallet help

Environment:
  AGON_HOME               Defaults to ~/.agon
  AGON_WALLET_PROFILE     Defaults to "default"
`;
  process.stdout.write(text.trimStart());
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

function agonHome() {
  return path.resolve(process.env.AGON_HOME || path.join(os.homedir(), ".agon"));
}

function walletPath(profile = DEFAULT_PROFILE) {
  return path.join(agonHome(), "wallets", `${profile}.json`);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJson(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Some filesystems ignore chmod; best effort is enough for a convenience wallet.
  }
}

function setupWallet(flags) {
  const profile = String(flags.profile || DEFAULT_PROFILE);
  const target = flags.walletPath ? path.resolve(String(flags.walletPath)) : walletPath(profile);
  if (fs.existsSync(target) && !flags.force) {
    const wallet = readJson(target, {});
    process.stdout.write(`${JSON.stringify({
      ok: true,
      created: false,
      profile,
      walletPath: target,
      address: wallet?.chains?.solana?.address,
    }, null, 2)}\n`);
    return;
  }

  const keypair = Keypair.generate();
  const wallet = {
    version: 1,
    profile,
    createdAt: new Date().toISOString(),
    warning: "Convenience agent wallet. Do not use for large balances or high-value custody.",
    chains: {
      solana: {
        address: keypair.publicKey.toBase58(),
        defaultChainId: DEFAULT_MAINNET_CHAIN_ID,
        secretKey: Array.from(keypair.secretKey),
      },
    },
  };
  writeJson(target, wallet);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    created: true,
    profile,
    walletPath: target,
    address: wallet.chains.solana.address,
  }, null, 2)}\n`);
}

function loadWallet(flags = {}) {
  const profile = String(flags.profile || DEFAULT_PROFILE);
  const target = flags.walletPath ? path.resolve(String(flags.walletPath)) : walletPath(profile);
  const wallet = readJson(target, null);
  if (!wallet) {
    throw new Error(`Wallet profile "${profile}" not found at ${target}. Run agon-wallet setup --profile ${profile}.`);
  }
  const solana = wallet?.chains?.solana;
  if (!solana?.secretKey || !Array.isArray(solana.secretKey)) {
    throw new Error(`Wallet ${target} does not contain a Solana secretKey array.`);
  }
  return { profile, walletPath: target, wallet, solana };
}

async function loadSolanaSigner(flags = {}) {
  const { solana, ...walletInfo } = loadWallet(flags);
  const { createKeyPairSignerFromBytes } = await import("@solana/kit");
  const signer = await createKeyPairSignerFromBytes(new Uint8Array(solana.secretKey), true);
  return { signer, solana, ...walletInfo };
}

function selectedSiwxChain(challenge, requestedChainId) {
  const supported = challenge?.supportedChains || [];
  if (requestedChainId) {
    return supported.find((chain) => chain.chainId === requestedChainId) || {
      chainId: requestedChainId,
      type: requestedChainId.startsWith("solana:") ? "ed25519" : "eip191",
    };
  }
  return supported.find((chain) => chain.chainId?.startsWith("solana:")) || supported[0] || {
    chainId: DEFAULT_MAINNET_CHAIN_ID,
    type: "ed25519",
  };
}

function siwxChallengeFromInput(input) {
  return input?.challenge?.siwx || input?.challenge?.["sign-in-with-x"] || input?.challenge;
}

function headerValue(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === expected) return value;
  }
  return undefined;
}

async function authorizeSiwx(input, flags) {
  const challenge = siwxChallengeFromInput(input);
  const paymentRequired = input?.challenge?.paymentRequired || input?.paymentRequired || input?.challenge;
  if (!challenge?.info || !paymentRequired) {
    throw new Error("SIWX auth request is missing challenge info or paymentRequired.");
  }
  const { signer } = await loadSolanaSigner(flags);
  const { x402Client, x402HTTPClient } = await import("@x402/core/client");
  const { createSIWxClientHook } = await import("@x402/extensions");

  const chain = selectedSiwxChain(challenge, input.chainId || input?.request?.chainId);
  if (!chain.chainId?.startsWith("solana:")) {
    throw new Error(`Default Agon wallet can only sign Solana SIWX challenges, got ${chain.chainId}.`);
  }

  const httpClient = new x402HTTPClient(new x402Client()).onPaymentRequired(
    createSIWxClientHook(signer),
  );
  const headers = await httpClient.handlePaymentRequired(paymentRequired);
  const siwxHeader = headerValue(headers, "SIGN-IN-WITH-X");
  if (!siwxHeader) {
    throw new Error("SIWX hook did not return a SIGN-IN-WITH-X header.");
  }
  const payload = JSON.parse(Buffer.from(siwxHeader, "base64").toString("utf8"));
  return {
    headers,
    address: payload.address || String(signer.address),
    chainId: payload.chainId || chain.chainId,
    signature: payload.signature,
    signatureEncoding: "base58",
    payload,
  };
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("No JSON received on stdin.");
  return JSON.parse(text);
}

async function authorize(flags) {
  const input = flags.stdin || !process.stdin.isTTY
    ? await readStdinJson()
    : readJson(path.resolve(String(flags.input)), null);
  if (!input) throw new Error("authorize requires --stdin or --input FILE.");

  const kind = input.kind
    || (input.accessMode === "siwx" ? "siwx" : undefined)
    || (input.accessMode === "exact" ? "x402-exact" : undefined);

  let output;
  if (kind === "siwx") {
    output = await authorizeSiwx(input, flags);
  } else if (kind === "x402-exact" || kind === "exact") {
    throw new Error("This wallet only signs SIWX (Tokens API). For x402 exact routes, set AGON_SIGNER_COMMAND to a payment-capable signer.");
  } else {
    throw new Error(`Unsupported auth request kind/accessMode: ${kind || input.accessMode || "unknown"}.`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function show(flags) {
  const { profile, walletPath: target, solana } = loadWallet(flags);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    profile,
    walletPath: target,
    chains: {
      solana: {
        address: solana.address,
        defaultChainId: solana.defaultChainId,
      },
    },
  }, null, 2)}\n`);
}

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const command = args.shift() || "help";
  switch (command) {
    case "setup":
      setupWallet(flags);
      return;
    case "authorize":
      await authorize(flags);
      return;
    case "show":
      show(flags);
      return;
    case "help":
      usage(0);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
