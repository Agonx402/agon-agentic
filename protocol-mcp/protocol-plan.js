"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DEFAULT_CLUSTER = "devnet";
const DEFAULT_PROGRAM_ID = process.env.RYVO_PROTOCOL_PROGRAM_ID || "HuyQoYfBEvVACTKcq8RTiDFm5k5ZBnX5we1UjWBTBeqT";
const UNSUPPORTED_CURRENT_SDK_IDL = new Set([
  "cooperative_unlock_channel_funds",
  "register_participant_bls_key",
]);

const ACTION_ALIASES = new Map([
  ["bls-clearing", "settle_clearing_round"],
  ["cancel-withdrawal", "cancel_withdrawal"],
  ["cooperative-unlock", "cooperative_unlock_channel_funds"],
  ["cooperative-unlock-channel-funds", "cooperative_unlock_channel_funds"],
  ["create-channel", "create_channel"],
  ["deposit-for", "deposit_for"],
  ["execute-unlock", "execute_unlock_channel_funds"],
  ["execute-unlock-channel-funds", "execute_unlock_channel_funds"],
  ["execute-update-channel-authorized-signer", "execute_update_channel_authorized_signer"],
  ["execute-withdrawal", "execute_withdrawal_timelocked"],
  ["execute-withdrawal-timelocked", "execute_withdrawal_timelocked"],
  ["initialize-participant", "initialize_participant"],
  ["initialize-protocol", "initialize"],
  ["initialize-token-registry", "initialize_token_registry"],
  ["lock", "lock_channel_funds"],
  ["lock-channel-funds", "lock_channel_funds"],
  ["register-participant-bls-key", "register_participant_bls_key"],
  ["register-token", "register_token"],
  ["request-unlock", "request_unlock_channel_funds"],
  ["request-unlock-channel-funds", "request_unlock_channel_funds"],
  ["request-update-channel-authorized-signer", "request_update_channel_authorized_signer"],
  ["request-withdrawal", "request_withdrawal"],
  ["settle-bundle", "settle_commitment_bundle"],
  ["settle-clearing-round", "settle_clearing_round"],
  ["settle-individual", "settle_individual"],
  ["update-config", "update_config"],
  ["update-inbound-channel-policy", "update_inbound_channel_policy"],
  ["update-registry-authority", "update_registry_authority"],
]);

async function loadSdk() {
  try {
    return await import("@ryvonetwork/sdk");
  } catch {
    const localSdk = path.resolve(__dirname, "..", "..", "ryvo-sdk", "packages", "sdk", "dist", "index.js");
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

async function loadWeb3() {
  return loadPackage("@solana/web3.js", path.resolve(__dirname, "..", "..", "ryvo-sdk", "node_modules", "@solana", "web3.js", "lib", "index.cjs.js"));
}

function normalizeAction(action) {
  const raw = String(action || "").trim();
  if (!raw) throw new Error("Action is required.");
  const normalized = raw.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
  return ACTION_ALIASES.get(normalized) || normalized.replace(/-/g, "_");
}

function flag(args, name, fallback) {
  return args[name] === undefined || args[name] === true ? fallback : args[name];
}

function requireField(args, name) {
  const value = flag(args, name);
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing required ${name}.`);
  }
  return String(value);
}

function optionalInteger(args, name) {
  const value = flag(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

function requireInteger(args, name) {
  const parsed = optionalInteger(args, name);
  if (parsed === undefined) throw new Error(`Missing required ${name}.`);
  return parsed;
}

function optionalAmount(args, name) {
  const value = flag(args, name);
  if (value === undefined) return undefined;
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer token amount in base units.`);
  return text;
}

function requireAmount(args, name) {
  const value = optionalAmount(args, name);
  if (value === undefined) throw new Error(`Missing required ${name}.`);
  return value;
}

function parseJson(value, label, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function parseStringList(value, label) {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    const parsed = parseJson(text, label, []);
    if (!Array.isArray(parsed)) throw new Error(`${label} must be an array.`);
    return parsed.map(String);
  }
  return text.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function asPubkey(value, web3, label) {
  try {
    return new web3.PublicKey(String(value));
  } catch {
    throw new Error(`${label} must be a valid Solana public key.`);
  }
}

function asBase58(value) {
  return value && typeof value.toBase58 === "function" ? value.toBase58() : String(value);
}

function idlMethodName(instructionName) {
  return instructionName.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function basePlan(ctx, action, instructionName, args, accounts, extra = {}) {
  return {
    kind: "protocol-action-plan",
    action,
    readOnly: true,
    signs: false,
    broadcasts: false,
    cluster: ctx.cluster,
    programId: ctx.programId,
    officialDevnetUsdcMint: ctx.sdk.OFFICIAL_DEVNET_USDC_MINT,
    token: extra.token,
    instruction: {
      name: instructionName,
      anchorMethod: idlMethodName(instructionName),
      args,
      accounts,
      ...(extra.remainingAccounts ? { remainingAccounts: extra.remainingAccounts } : {}),
      ...(UNSUPPORTED_CURRENT_SDK_IDL.has(instructionName)
        ? { status: "not-present-in-current-sdk-generated-idl" }
        : {}),
    },
    requiredSigners: extra.requiredSigners || [],
    preInstructions: extra.preInstructions || [],
    postInstructions: extra.postInstructions || [],
    messages: extra.messages || [],
    notes: [
      "This is a prepare-only plan. It does not sign or broadcast.",
      "Wallet/application code should build the Anchor instruction with @ryvonetwork/sdk and these exact args/accounts.",
      ...(extra.notes || []),
    ],
  };
}

async function context(args) {
  const [sdk, web3] = await Promise.all([loadSdk(), loadWeb3()]);
  const programId = asPubkey(flag(args, "programId", DEFAULT_PROGRAM_ID), web3, "programId");
  return {
    sdk,
    web3,
    cluster: String(flag(args, "cluster", DEFAULT_CLUSTER)),
    programId,
    programIdString: asBase58(programId),
  };
}

async function resolveToken(ctx, args, required = true) {
  if (flag(args, "tokenId") !== undefined) {
    return {
      tokenId: requireInteger(args, "tokenId"),
      mint: String(flag(args, "mint", ctx.sdk.OFFICIAL_DEVNET_USDC_MINT)),
      symbol: "USDC",
      decimals: 6,
      source: "tokenId",
    };
  }

  try {
    const token = ctx.sdk.resolveCanonicalDevnetUsdcToken({ env: process.env });
    return { ...token, source: "env-or-deployment-config" };
  } catch (error) {
    if (required) {
      throw new Error(`${error.message} Pass --token-id or set RYVO_PROTOCOL_DEVNET_USDC_TOKEN_ID.`);
    }
    return {
      tokenId: null,
      mint: ctx.sdk.OFFICIAL_DEVNET_USDC_MINT,
      symbol: "USDC",
      decimals: 6,
      source: "unresolved-default",
    };
  }
}

function commonAccounts(ctx) {
  return {
    tokenRegistry: asBase58(ctx.sdk.findTokenRegistryPda(ctx.programId)),
    globalConfig: asBase58(ctx.sdk.findGlobalConfigPda(ctx.programId)),
  };
}

function vaultTokenAccount(ctx, tokenId) {
  const tokenIdBytes = Buffer.alloc(2);
  tokenIdBytes.writeUInt16LE(tokenId, 0);
  return asBase58(ctx.web3.PublicKey.findProgramAddressSync([
    Buffer.from(ctx.sdk.VAULT_TOKEN_ACCOUNT_SEED),
    tokenIdBytes,
  ], ctx.programId)[0]);
}

function participantAccount(ctx, args, ownerField = "owner", accountField = "participantAccount") {
  const explicit = flag(args, accountField);
  if (explicit) return asBase58(asPubkey(explicit, ctx.web3, accountField));
  const owner = requireField(args, ownerField);
  return asBase58(ctx.sdk.findParticipantPda(ctx.programId, asPubkey(owner, ctx.web3, ownerField)));
}

function optionalParticipantAccount(ctx, args, ownerField, accountField) {
  const explicit = flag(args, accountField);
  if (explicit) return asBase58(asPubkey(explicit, ctx.web3, accountField));
  const owner = flag(args, ownerField);
  if (!owner) return null;
  return asBase58(ctx.sdk.findParticipantPda(ctx.programId, asPubkey(owner, ctx.web3, ownerField)));
}

function channelAccounts(ctx, args, token) {
  const payerAccount = optionalParticipantAccount(ctx, args, "payerOwner", "payerAccount")
    || optionalParticipantAccount(ctx, args, "owner", "payerAccount");
  const payeeAccount = optionalParticipantAccount(ctx, args, "payeeOwner", "payeeAccount");
  const channelState = flag(args, "channelState")
    ? asBase58(asPubkey(flag(args, "channelState"), ctx.web3, "channelState"))
    : deriveChannelAddress(ctx, args, token);
  return { payerAccount, payeeAccount, channelState };
}

function deriveChannelAddress(ctx, args, token) {
  const payerId = optionalInteger(args, "payerId");
  const payeeId = optionalInteger(args, "payeeId");
  if (payerId === undefined || payeeId === undefined || token.tokenId === null) return null;
  return asBase58(ctx.sdk.findChannelPda(ctx.programId, payerId, payeeId, token.tokenId));
}

function requireChannelAccounts(accounts) {
  if (!accounts.payerAccount) throw new Error("Channel action requires owner/payerOwner or payerAccount.");
  if (!accounts.payeeAccount) throw new Error("Channel action requires payeeOwner or payeeAccount.");
  if (!accounts.channelState) throw new Error("Channel action requires channelState or payerId/payeeId/tokenId.");
}

function ed25519Message(ctx, args, token) {
  if (
    flag(args, "payerId") === undefined
    || flag(args, "payeeId") === undefined
    || flag(args, "committedAmount") === undefined
  ) {
    return null;
  }
  const messageDomain = flag(args, "messageDomain")
    ? Buffer.from(String(flag(args, "messageDomain")), "base64")
    : ctx.sdk.deriveMessageDomain(ctx.programId, ctx.sdk.RYVO_CHAIN_IDS[ctx.cluster] || ctx.sdk.RYVO_CHAIN_IDS.devnet);
  const authorizedSettler = flag(args, "authorizedSettler")
    ? asPubkey(flag(args, "authorizedSettler"), ctx.web3, "authorizedSettler")
    : null;
  const message = ctx.sdk.createCommitmentMessage({
    messageDomain,
    payerId: requireInteger(args, "payerId"),
    payeeId: requireInteger(args, "payeeId"),
    tokenId: token.tokenId,
    committedAmount: requireAmount(args, "committedAmount"),
    authorizedSettler,
  });
  return {
    kind: "ryvo-cmt-v5",
    messageBase64: message.toString("base64"),
    signer: flag(args, "signer"),
    signature: flag(args, "signature"),
  };
}

function clearingRoundMessage(ctx, args, token) {
  const blocks = parseJson(flag(args, "blocks"), "blocks", null);
  if (!blocks) return null;
  const messageDomain = flag(args, "messageDomain")
    ? Buffer.from(String(flag(args, "messageDomain")), "base64")
    : ctx.sdk.deriveMessageDomain(ctx.programId, ctx.sdk.RYVO_CHAIN_IDS[ctx.cluster] || ctx.sdk.RYVO_CHAIN_IDS.devnet);
  const message = ctx.sdk.createClearingRoundMessage({
    messageDomain,
    tokenId: token.tokenId,
    blocks,
  });
  return {
    kind: "ryvo-clearing-v4",
    messageBase64: message.toString("base64"),
  };
}

function settlementBundlePlan(ctx, args, token) {
  const entries = parseJson(flag(args, "entries"), "entries", null);
  if (!entries) return null;
  if (!Array.isArray(entries)) throw new Error("entries must be a JSON array.");
  return ctx.sdk.prepareCommitmentBundleSettlementPlan({
    payeeId: requireInteger(args, "payeeId"),
    tokenId: token.tokenId,
    entries,
  });
}

async function buildProtocolActionPlan(rawAction, args = {}) {
  const action = normalizeAction(rawAction);
  const ctx = await context(args);
  const common = commonAccounts(ctx);

  switch (action) {
    case "initialize": {
      const feeRecipient = requireField(args, "feeRecipient");
      const upgradeAuthority = requireField(args, "upgradeAuthority");
      return basePlan(ctx, action, "initialize", {
        chainId: requireInteger(args, "chainId"),
        feeBps: requireInteger(args, "feeBps"),
        registrationFeeLamports: requireAmount(args, "registrationFeeLamports"),
        initialAuthority: flag(args, "initialAuthority", null),
      }, {
        globalConfig: common.globalConfig,
        feeRecipient,
        upgradeAuthority,
        program: ctx.programIdString,
        programData: asBase58(ctx.sdk.findProgramDataPda(ctx.programId)),
        systemProgram: ctx.web3.SystemProgram.programId.toBase58(),
      }, { requiredSigners: [upgradeAuthority] });
    }

    case "initialize_token_registry": {
      const authority = requireField(args, "authority");
      return basePlan(ctx, action, "initialize_token_registry", {}, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        authority,
        systemProgram: ctx.web3.SystemProgram.programId.toBase58(),
      }, { requiredSigners: [authority] });
    }

    case "initialize_participant": {
      const owner = requireField(args, "owner");
      const feeRecipient = requireField(args, "feeRecipient");
      return basePlan(ctx, action, "initialize_participant", {}, {
        globalConfig: common.globalConfig,
        participantAccount: participantAccount(ctx, args),
        feeRecipient,
        owner,
        systemProgram: ctx.web3.SystemProgram.programId.toBase58(),
      }, { requiredSigners: [owner] });
    }

    case "register_token": {
      const tokenId = requireInteger(args, "tokenId");
      const authority = requireField(args, "authority");
      return basePlan(ctx, action, "register_token", {
        tokenId,
        symbol: String(flag(args, "symbol", "USDC")),
      }, {
        tokenRegistry: common.tokenRegistry,
        vaultTokenAccount: vaultTokenAccount(ctx, tokenId),
        mint: requireField(args, "mint"),
        globalConfig: common.globalConfig,
        authority,
        tokenProgram: ctx.sdk.SPL_TOKEN_PROGRAM_ID.toBase58(),
        systemProgram: ctx.web3.SystemProgram.programId.toBase58(),
        rent: ctx.web3.SYSVAR_RENT_PUBKEY.toBase58(),
      }, { requiredSigners: [authority] });
    }

    case "deposit": {
      const token = await resolveToken(ctx, args);
      const owner = requireField(args, "owner");
      return basePlan(ctx, action, "deposit", {
        tokenId: token.tokenId,
        amount: requireAmount(args, "amount"),
      }, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        participantAccount: participantAccount(ctx, args),
        ownerTokenAccount: requireField(args, "ownerTokenAccount"),
        vaultTokenAccount: vaultTokenAccount(ctx, token.tokenId),
        owner,
        tokenProgram: ctx.sdk.SPL_TOKEN_PROGRAM_ID.toBase58(),
      }, { token, requiredSigners: [owner] });
    }

    case "deposit_for": {
      const token = await resolveToken(ctx, args);
      const funder = requireField(args, "funder");
      const amounts = parseStringList(requireField(args, "amounts"), "amounts");
      const participantAccounts = parseStringList(flag(args, "participantAccounts"), "participantAccounts");
      return basePlan(ctx, action, "deposit_for", {
        tokenId: token.tokenId,
        amounts,
      }, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        funderTokenAccount: requireField(args, "funderTokenAccount"),
        vaultTokenAccount: vaultTokenAccount(ctx, token.tokenId),
        funder,
        tokenProgram: ctx.sdk.SPL_TOKEN_PROGRAM_ID.toBase58(),
      }, {
        token,
        requiredSigners: [funder],
        remainingAccounts: participantAccounts.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })),
        notes: ["Pass participant accounts as remaining accounts in the same order as amounts."],
      });
    }

    case "create_channel":
    case "lock_channel_funds":
    case "request_unlock_channel_funds":
    case "execute_unlock_channel_funds":
    case "request_update_channel_authorized_signer":
    case "execute_update_channel_authorized_signer":
    case "cooperative_unlock_channel_funds": {
      const token = await resolveToken(ctx, args);
      const owner = requireField(args, "owner");
      const accounts = channelAccounts(ctx, args, token);
      requireChannelAccounts(accounts);
      const amountArg = ["lock_channel_funds", "request_unlock_channel_funds", "cooperative_unlock_channel_funds"].includes(action)
        ? { amount: requireAmount(args, "amount") }
        : {};
      const signerArg = action === "request_update_channel_authorized_signer"
        ? { newSigner: requireField(args, "newSigner") }
        : {};
      const authorizedSignerArg = action === "create_channel"
        ? { authorizedSigner: flag(args, "authorizedSigner", null) }
        : {};
      return basePlan(ctx, action, action, {
        tokenId: token.tokenId,
        ...amountArg,
        ...signerArg,
        ...authorizedSignerArg,
      }, {
        ...(action === "create_channel" || action === "lock_channel_funds" ? { tokenRegistry: common.tokenRegistry } : {}),
        ...(action !== "create_channel" ? { globalConfig: common.globalConfig } : {}),
        payerAccount: accounts.payerAccount,
        payeeAccount: accounts.payeeAccount,
        channelState: accounts.channelState,
        owner,
        ...(action === "create_channel" ? { payeeOwner: flag(args, "payeeOwner", null), systemProgram: ctx.web3.SystemProgram.programId.toBase58() } : {}),
        ...(action === "lock_channel_funds" ? { systemProgram: ctx.web3.SystemProgram.programId.toBase58() } : {}),
      }, {
        token,
        requiredSigners: action === "cooperative_unlock_channel_funds" && flag(args, "payeeOwner")
          ? [owner, String(flag(args, "payeeOwner"))]
          : [owner],
        notes: [
          action === "cooperative_unlock_channel_funds"
            ? "Cooperative unlock is documented as immediate payer/payee consent, but this instruction is not present in the current generated SDK IDL. Regenerate/publish the SDK IDL before building this transaction."
            : null,
        ].filter(Boolean),
      });
    }

    case "request_withdrawal": {
      const token = await resolveToken(ctx, args);
      const owner = requireField(args, "owner");
      const withdrawalDestination = requireField(args, "withdrawalDestination");
      return basePlan(ctx, action, "request_withdrawal", {
        tokenId: token.tokenId,
        amount: requireAmount(args, "amount"),
        destination: withdrawalDestination,
      }, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        participantAccount: participantAccount(ctx, args),
        withdrawalDestination,
        owner,
      }, { token, requiredSigners: [owner], notes: ["Live devnet participant withdrawals are instant."] });
    }

    case "cancel_withdrawal": {
      const token = await resolveToken(ctx, args);
      const owner = requireField(args, "owner");
      return basePlan(ctx, action, "cancel_withdrawal", { tokenId: token.tokenId }, {
        participantAccount: participantAccount(ctx, args),
        owner,
      }, { token, requiredSigners: [owner] });
    }

    case "execute_withdrawal_timelocked": {
      const token = await resolveToken(ctx, args);
      return basePlan(ctx, action, "execute_withdrawal_timelocked", { tokenId: token.tokenId }, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        participantAccount: flag(args, "participantAccount") || participantAccount(ctx, args),
        vaultTokenAccount: vaultTokenAccount(ctx, token.tokenId),
        withdrawalDestination: requireField(args, "withdrawalDestination"),
        feeRecipientTokenAccount: requireField(args, "feeRecipientTokenAccount"),
        tokenProgram: ctx.sdk.SPL_TOKEN_PROGRAM_ID.toBase58(),
      }, { token, notes: ["This instruction transfers a previously requested withdrawal. The transaction fee payer signs, but the protocol account set does not require participant owner signing."] });
    }

    case "update_inbound_channel_policy": {
      const owner = requireField(args, "owner");
      return basePlan(ctx, action, "update_inbound_channel_policy", {
        inboundChannelPolicy: requireInteger(args, "inboundChannelPolicy"),
      }, {
        participantAccount: participantAccount(ctx, args),
        owner,
      }, { requiredSigners: [owner] });
    }

    case "settle_individual": {
      const token = await resolveToken(ctx, args);
      const submitter = requireField(args, "submitter");
      const message = ed25519Message(ctx, args, token);
      return basePlan(ctx, action, "settle_individual", {}, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        payerAccount: requireField(args, "payerAccount"),
        payeeAccount: requireField(args, "payeeAccount"),
        channelState: requireField(args, "channelState"),
        submitter,
        instructionsSysvar: ctx.web3.SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(),
      }, {
        token,
        requiredSigners: [submitter],
        messages: message ? [message] : [],
        preInstructions: ["ed25519 signature verification for ryvo-cmt-v5 commitment"],
      });
    }

    case "settle_commitment_bundle": {
      const token = await resolveToken(ctx, args);
      const submitter = requireField(args, "submitter");
      const bundle = settlementBundlePlan(ctx, args, token);
      const count = bundle ? bundle.count : requireInteger(args, "count");
      return basePlan(ctx, action, "settle_commitment_bundle", { count }, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        payeeAccount: requireField(args, "payeeAccount"),
        submitter,
        instructionsSysvar: ctx.web3.SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(),
      }, {
        token,
        requiredSigners: [submitter],
        messages: bundle ? [{ kind: "commitment-bundle-plan", ...bundle }] : [],
        preInstructions: ["multi-message ed25519 verification for each cumulative commitment"],
        notes: ["Gateway settlement v1 should use this bundle instruction, not BLS clearing."],
      });
    }

    case "settle_clearing_round": {
      const token = await resolveToken(ctx, args);
      const submitter = requireField(args, "submitter");
      const message = clearingRoundMessage(ctx, args, token);
      return basePlan(ctx, action, "settle_clearing_round", {}, {
        tokenRegistry: common.tokenRegistry,
        globalConfig: common.globalConfig,
        submitter,
        instructionsSysvar: ctx.web3.SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(),
      }, {
        token,
        requiredSigners: [submitter],
        messages: message ? [message] : [],
        preInstructions: ["Ryvo-specific BLS aggregate signature verification inputs"],
        notes: ["Ryvo BLS v1 is not a generic IETF BLS ciphersuite."],
      });
    }

    case "register_participant_bls_key": {
      const owner = requireField(args, "owner");
      return basePlan(ctx, action, "register_participant_bls_key", {
        blsPublicKey: requireField(args, "blsPublicKey"),
      }, {
        participantAccount: participantAccount(ctx, args),
        owner,
      }, {
        requiredSigners: [owner],
        notes: ["BLS key rotation does not exist yet. This instruction is not present in the current generated SDK IDL; regenerate/publish SDK IDL before building this transaction."],
      });
    }

    case "update_config": {
      const authority = requireField(args, "authority");
      return basePlan(ctx, action, "update_config", {
        newAuthority: flag(args, "newAuthority", null),
        newFeeRecipient: flag(args, "newFeeRecipient", null),
        newFeeBps: optionalInteger(args, "newFeeBps") ?? null,
        newRegistrationFeeLamports: optionalAmount(args, "newRegistrationFeeLamports") ?? null,
      }, {
        globalConfig: common.globalConfig,
        authority,
      }, { requiredSigners: [authority] });
    }

    case "accept_config_authority": {
      const pendingAuthority = requireField(args, "pendingAuthority");
      return basePlan(ctx, action, "accept_config_authority", {}, {
        globalConfig: common.globalConfig,
        pendingAuthority,
      }, { requiredSigners: [pendingAuthority] });
    }

    case "update_registry_authority": {
      const currentAuthority = requireField(args, "currentAuthority");
      return basePlan(ctx, action, "update_registry_authority", {
        newAuthority: requireField(args, "newAuthority"),
      }, {
        tokenRegistry: common.tokenRegistry,
        currentAuthority,
      }, { requiredSigners: [currentAuthority] });
    }

    case "accept_registry_authority": {
      const pendingAuthority = requireField(args, "pendingAuthority");
      return basePlan(ctx, action, "accept_registry_authority", {}, {
        tokenRegistry: common.tokenRegistry,
        pendingAuthority,
      }, { requiredSigners: [pendingAuthority] });
    }

    default:
      throw new Error(`Unsupported prepare action: ${rawAction}`);
  }
}

function compactU64Length(value) {
  let remaining = BigInt(value);
  let length = 0;
  do {
    length += 1;
    remaining >>= 7n;
  } while (remaining > 0n);
  return length;
}

async function buildClearingPreview(args = {}) {
  const ctx = await context(args);
  const token = await resolveToken(ctx, args, false);
  const participants = requireInteger(args, "participants");
  const channels = requireInteger(args, "channels");
  const bytesLimit = optionalInteger(args, "bytesLimit") ?? 1232;
  const avgParticipantIdBytes = compactU64Length(participants + 1);
  const avgAmountBytes = compactU64Length(flag(args, "targetCumulative", "1000000"));
  const estimatedMessageBytes = 2 + 32 + 2 + participants * (avgParticipantIdBytes + 1) + channels * (1 + avgAmountBytes);
  const estimatedTxBytes = estimatedMessageBytes + 220;
  return {
    kind: "clearing-round-capacity-preview",
    readOnly: true,
    signs: false,
    broadcasts: false,
    cluster: ctx.cluster,
    programId: ctx.programIdString,
    token,
    participants,
    channels,
    bytesLimit,
    estimatedMessageBytes,
    estimatedTxBytes,
    fitsLegacyPacketEstimate: estimatedTxBytes <= bytesLimit,
    settlementEventCompressionRatio: channels <= 0 ? "0:1" : `${channels}:1`,
    notes: [
      "Preview is an estimate. Final fit depends on account metas, ALT usage, signatures, and exact clearing blocks.",
      "Ryvo BLS compresses many channel settlements into one clearing-round settlement instruction, but compute and account limits still apply.",
    ],
  };
}

module.exports = {
  buildClearingPreview,
  buildProtocolActionPlan,
};
