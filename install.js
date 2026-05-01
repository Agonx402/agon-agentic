#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const PACKAGE_NAME = "@agonx402/agentic";
const GATEWAY_MCP_PACKAGE = "@agonx402/gateway-mcp";
const PROTOCOL_MCP_PACKAGE = "@agonx402/protocol-mcp";
const AGENT_WALLET_PACKAGE = "@agonx402/agent-wallet";
const GATEWAY_CLI_PACKAGE = "@agonx402/gateway-cli";
const PROTOCOL_CLI_PACKAGE = "@agonx402/protocol-cli";
const GLOBAL_CLI_PACKAGES = [GATEWAY_CLI_PACKAGE, AGENT_WALLET_PACKAGE, PROTOCOL_CLI_PACKAGE];
const DEFAULT_GATEWAY_BASE_URL = "https://gateway.agonx402.com";
const DEFAULT_WALLET_PROFILE = "default";
const SKILLS = [
  {
    name: "agon-gateway",
    summary: "Agon Gateway x402, SIWX, Solana RPC/DAS, Helius Wallet, and Tokens API workflows.",
  },
  {
    name: "agon-protocol",
    summary: "Agon Protocol participants, deposits, channels, settlement, withdrawals, and BLS caveats.",
  },
  {
    name: "agon-gateway-payment-channels",
    summary: "Gateway devnet payment-channel authorization with official devnet USDC commitments.",
  },
];

function usage(exitCode = 0) {
  const text = `
Agon Agentic Installer

Usage:
  agonx402-agentic install-skills [--target agents|codex|claude|all] [--target-dir PATH] [--wallet-profile NAME] [--skip-wallet-setup] [--dry-run]
  agonx402-agentic setup [--target codex|claude-desktop|claude-code|cursor|windsurf|generic|all] [--dry-run]
                         [--wallet-profile NAME] [--skip-global-cli] [--skip-presign]
  agonx402-agentic list
  agonx402-agentic doctor
  agonx402-agentic help

Default install-skills target is "all" -- installs into ~/.agents/skills, ~/.codex/skills,
and ~/.claude/skills so Cursor, Claude Code, and Codex all see the bundled skills.

Examples:
  npx -y ${PACKAGE_NAME} install-skills
  npx -y ${PACKAGE_NAME} install-skills --target codex
  npx -y ${PACKAGE_NAME} install-skills --target claude
  npx -y ${PACKAGE_NAME} install-skills --target all
  npx -y ${PACKAGE_NAME} setup --target all
`;
  process.stdout.write(text.trimStart());
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

function packageRoot() {
  return __dirname;
}

function skillsRoot() {
  return path.join(packageRoot(), "skills");
}

function defaultTargetRoots() {
  const home = os.homedir();
  return {
    agents: path.join(home, ".agents", "skills"),
    codex: path.join(home, ".codex", "skills"),
    claude: path.join(home, ".claude", "skills"),
  };
}

function resolveInstallTargets(flags) {
  if (flags.targetDir) {
    return [path.resolve(String(flags.targetDir))];
  }

  const target = String(flags.target || "all").toLowerCase();
  const roots = defaultTargetRoots();

  if (target === "agents") return [roots.agents];
  if (target === "codex") return [roots.codex];
  if (target === "claude") return [roots.claude];
  if (target === "all") return [roots.agents, roots.codex, roots.claude];

  throw new Error("Invalid --target. Use agents, codex, claude, or all.");
}

function assertBundledSkills() {
  const missing = [];
  for (const skill of SKILLS) {
    const skillPath = path.join(skillsRoot(), skill.name);
    const skillFile = path.join(skillPath, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      missing.push(skill.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Package is missing bundled skills: ${missing.join(", ")}`);
  }
}

function assertSafeDestination(root, skillName) {
  if (!SKILLS.some((skill) => skill.name === skillName)) {
    throw new Error(`Refusing to install unknown skill: ${skillName}`);
  }

  const resolvedRoot = path.resolve(root);
  const destination = path.resolve(resolvedRoot, skillName);
  const relative = path.relative(resolvedRoot, destination);

  if (relative.startsWith("..") || path.isAbsolute(relative) || path.basename(destination) !== skillName) {
    throw new Error(`Unsafe install destination for ${skillName}: ${destination}`);
  }

  return destination;
}

function copySkill(source, destination, dryRun) {
  if (dryRun) {
    process.stdout.write(`[dry-run] install ${source} -> ${destination}\n`);
    return;
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function installSkills(flags) {
  assertBundledSkills();

  const dryRun = Boolean(flags.dryRun);
  const quiet = Boolean(flags.quiet);
  const skipWalletSetup = Boolean(flags.skipWalletSetup);
  const targets = resolveInstallTargets(flags);

  for (const targetRoot of targets) {
    if (dryRun) {
      process.stdout.write(`[dry-run] target ${targetRoot}\n`);
    } else if (!quiet) {
      fs.mkdirSync(targetRoot, { recursive: true });
      process.stdout.write(`Installing Agon skills into ${targetRoot}\n`);
    } else {
      fs.mkdirSync(targetRoot, { recursive: true });
    }

    for (const skill of SKILLS) {
      const source = path.join(skillsRoot(), skill.name);
      const destination = assertSafeDestination(targetRoot, skill.name);
      copySkill(source, destination, dryRun);
      if (!dryRun && !quiet) {
        process.stdout.write(`  installed ${skill.name}\n`);
      }
    }
  }

  if (!skipWalletSetup) {
    if (!quiet) {
      process.stdout.write(`${dryRun ? "[dry-run] " : ""}Setting up default Agon agent wallet for SIWX/auth calls\n`);
    }
    setupWallet(flags);
  }

  if (!quiet) {
    process.stdout.write("\n");
    printSetup();
  }
}

function parseSkillMetadata(skillName) {
  const skillFile = path.join(skillsRoot(), skillName, "SKILL.md");
  const text = fs.readFileSync(skillFile, "utf8");
  const nameMatch = /^name:\s*(.+)$/m.exec(text);
  const descriptionMatch = /^description:\s*(.+)$/m.exec(text);
  return {
    name: nameMatch ? nameMatch[1].trim() : skillName,
    description: descriptionMatch ? descriptionMatch[1].trim() : SKILLS.find((skill) => skill.name === skillName)?.summary,
  };
}

function listSkills() {
  assertBundledSkills();
  process.stdout.write("Bundled Agon skills:\n");
  for (const skill of SKILLS) {
    const metadata = parseSkillMetadata(skill.name);
    process.stdout.write(`- ${metadata.name}: ${metadata.description}\n`);
  }
}

function doctor() {
  const roots = defaultTargetRoots();
  process.stdout.write(`Package: ${PACKAGE_NAME}\n`);
  process.stdout.write(`Node: ${process.version}\n`);
  process.stdout.write(`Package root: ${packageRoot()}\n`);
  process.stdout.write(`Bundled skills root: ${skillsRoot()}\n`);
  process.stdout.write(`Agents target: ${roots.agents}\n`);
  process.stdout.write(`Codex target: ${roots.codex}\n`);
  process.stdout.write(`Claude target: ${roots.claude}\n`);
  process.stdout.write("\nSkill bundle check:\n");

  for (const skill of SKILLS) {
    const skillFile = path.join(skillsRoot(), skill.name, "SKILL.md");
    process.stdout.write(`- ${skill.name}: ${fs.existsSync(skillFile) ? "ok" : "missing"}\n`);
  }

  process.stdout.write("\nTarget directories:\n");
  for (const [name, target] of Object.entries(roots)) {
    process.stdout.write(`- ${name}: ${fs.existsSync(target) ? "exists" : "not created yet"} (${target})\n`);
  }

  process.stdout.write("\n");
  printSetup();
}

function agonHome() {
  return path.resolve(process.env.AGON_HOME || path.join(os.homedir(), ".agon"));
}

function setupWallet(flags) {
  const profile = String(flags.walletProfile || DEFAULT_WALLET_PROFILE);
  const args = ["-y", AGENT_WALLET_PACKAGE, "setup", "--profile", profile];
  if (flags.dryRun) {
    process.stdout.write(`[dry-run] npx ${args.join(" ")}\n`);
    return;
  }
  const result = childProcess.spawnSync("npx", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!flags.quiet && result.stdout) process.stdout.write(result.stdout);
  if (!flags.quiet && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`Failed to run ${AGENT_WALLET_PACKAGE}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${AGENT_WALLET_PACKAGE} setup exited with status ${result.status}.`);
}

function installGlobalCli(flags) {
  if (flags.skipGlobalCli) {
    if (!flags.quiet) {
      process.stdout.write("Skipping global CLI install (--skip-global-cli). Use `npx -y @agonx402/gateway-cli ...` for invocation.\n");
    }
    return { ok: false, skipped: true };
  }
  const packages = GLOBAL_CLI_PACKAGES.map((name) => `${name}@latest`);
  const args = ["install", "--global", "--no-fund", "--no-audit", ...packages];
  if (flags.dryRun) {
    process.stdout.write(`[dry-run] npm ${args.join(" ")}\n`);
    return { ok: true, dryRun: true };
  }
  if (!flags.quiet) {
    process.stdout.write(`Installing CLI packages globally: ${GLOBAL_CLI_PACKAGES.join(", ")}\n`);
  }
  const result = childProcess.spawnSync("npm", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.error || result.status !== 0) {
    const combined = `${stdout}\n${stderr}`;
    const isPermission = /EACCES|EPERM|permission denied|requires the writable/i.test(combined);
    if (!flags.quiet) {
      process.stderr.write(`\nGlobal CLI install did not complete${isPermission ? " (permission error)" : ""}.\n`);
      if (combined.trim()) process.stderr.write(combined.trim() + "\n");
      process.stderr.write("\nAgon is still usable -- skills, wallet, and MCP registration are in place.\n");
      if (isPermission) {
        if (process.platform === "win32") {
          process.stderr.write("Try a non-admin npm prefix or run from an elevated terminal:\n");
          process.stderr.write("  npm install -g " + GLOBAL_CLI_PACKAGES.join(" ") + "\n");
        } else {
          process.stderr.write("Re-run with elevated permissions or fix your npm prefix:\n");
          process.stderr.write("  sudo npm install -g " + GLOBAL_CLI_PACKAGES.join(" ") + "\n");
          process.stderr.write("Or use a Node version manager (nvm, fnm, volta) to avoid sudo.\n");
        }
      } else {
        process.stderr.write("Re-run manually:\n");
        process.stderr.write("  npm install -g " + GLOBAL_CLI_PACKAGES.join(" ") + "\n");
      }
      process.stderr.write("Falling back to npx invocation in the meantime: `npx -y @agonx402/gateway-cli ...`.\n\n");
    }
    return { ok: false, permission: isPermission };
  }
  if (!flags.quiet && stdout) process.stdout.write(stdout);
  if (!flags.quiet) {
    process.stdout.write(`Installed CLI packages globally. Bare commands now on PATH: agon, agon-gateway, agon-wallet, agon-protocol.\n`);
  }
  return { ok: true };
}

function bundledLlmTxtPaths() {
  const root = packageRoot();
  return [
    path.join(root, "llm.txt"),
    path.join(root, "llms.txt"),
  ];
}

function copyLlmTxtToAgonHome(flags) {
  const candidates = bundledLlmTxtPaths();
  const source = candidates.find((file) => fs.existsSync(file));
  if (!source) {
    if (!flags.quiet) {
      process.stdout.write("No bundled llm.txt found; skipping local copy.\n");
    }
    return;
  }
  const targetDir = agonHome();
  const target = path.join(targetDir, "llm.txt");
  const sourceContent = fs.readFileSync(source, "utf8");
  if (flags.dryRun) {
    process.stdout.write(`[dry-run] copy ${source} -> ${target}\n`);
    return;
  }
  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === sourceContent) {
    if (!flags.quiet) process.stdout.write(`Local llm.txt already up to date ${target}\n`);
    return;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(target, sourceContent);
  if (!flags.quiet) process.stdout.write(`Wrote local llm.txt ${target}\n`);
}

function mcpEnv(flags) {
  return {
    AGON_GATEWAY_BASE_URL: String(flags.gatewayBaseUrl || DEFAULT_GATEWAY_BASE_URL),
    AGON_SIGNER_COMMAND: String(flags.signerCommand || `npx -y ${AGENT_WALLET_PACKAGE} authorize`),
    AGON_WALLET_PROFILE: String(flags.walletProfile || DEFAULT_WALLET_PROFILE),
  };
}

function gatewayServerConfig(env) {
  return {
    command: "npx",
    args: ["-y", GATEWAY_MCP_PACKAGE],
    env,
  };
}

function protocolServerConfig() {
  return {
    command: "npx",
    args: ["-y", PROTOCOL_MCP_PACKAGE],
  };
}

function mcpJsonConfig(env) {
  return {
    mcpServers: {
      "agon-gateway": gatewayServerConfig(env),
      "agon-protocol": protocolServerConfig(),
    },
  };
}

function readJsonFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Unable to read JSON config ${filePath}: ${error.message}`);
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  const backupPath = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function writeJsonMcpConfig(filePath, env, flags) {
  const next = readJsonFile(filePath);
  next.mcpServers = {
    ...(next.mcpServers || {}),
    ...mcpJsonConfig(env).mcpServers,
  };
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const existing = readTextFile(filePath);
  if (flags.dryRun) {
    process.stdout.write(existing === serialized
      ? `[dry-run] MCP JSON already up to date ${filePath}\n`
      : `[dry-run] write MCP JSON ${filePath}\n`);
    return;
  }
  if (existing === serialized) {
    process.stdout.write(`MCP config already up to date ${filePath}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const backupPath = backupFile(filePath);
  fs.writeFileSync(filePath, serialized);
  process.stdout.write(`Registered Agon MCP in ${filePath}${backupPath ? ` (backup ${backupPath})` : ""}\n`);
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlArray(values) {
  return `[ ${values.map(tomlString).join(", ")} ]`;
}

function tomlInlineTable(object) {
  return `{ ${Object.entries(object).map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`).join(", ")} }`;
}

function stripTomlSection(text, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\n?\\[${escaped}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`, "g");
  return text.replace(pattern, "").trimEnd();
}

function writeCodexConfig(filePath, env, flags) {
  const existing = readTextFile(filePath) || "";
  let next = stripTomlSection(existing, "mcp_servers.agon_gateway");
  next = stripTomlSection(next, "mcp_servers.agon_protocol");
  const block = `

[mcp_servers.agon_gateway]
command = "npx"
args = ${tomlArray(["-y", GATEWAY_MCP_PACKAGE])}
env = ${tomlInlineTable(env)}

[mcp_servers.agon_protocol]
command = "npx"
args = ${tomlArray(["-y", PROTOCOL_MCP_PACKAGE])}
`;
  next = `${next.trimEnd()}${block}`.trimStart();
  if (flags.dryRun) {
    process.stdout.write(existing === next
      ? `[dry-run] Codex MCP config already up to date ${filePath}\n`
      : `[dry-run] write Codex MCP config ${filePath}\n`);
    return;
  }
  if (existing === next) {
    process.stdout.write(`Codex MCP config already up to date ${filePath}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const backupPath = backupFile(filePath);
  fs.writeFileSync(filePath, next);
  process.stdout.write(`Registered Agon MCP in ${filePath}${backupPath ? ` (backup ${backupPath})` : ""}\n`);
}

function appDataDir() {
  return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
}

function clientAdapters() {
  const home = os.homedir();
  return {
    codex: {
      label: "Codex",
      path: path.join(home, ".codex", "config.toml"),
      requiredDir: path.join(home, ".codex"),
      write: writeCodexConfig,
    },
    "claude-desktop": {
      label: "Claude Desktop",
      path: process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
        : process.platform === "win32"
          ? path.join(appDataDir(), "Claude", "claude_desktop_config.json")
          : path.join(home, ".config", "Claude", "claude_desktop_config.json"),
      requiredDir: process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "Claude")
        : process.platform === "win32"
          ? path.join(appDataDir(), "Claude")
          : path.join(home, ".config", "Claude"),
      write: writeJsonMcpConfig,
    },
    "claude-code": {
      label: "Claude Code",
      path: path.join(home, ".claude.json"),
      requiredDir: home,
      write: writeJsonMcpConfig,
    },
    cursor: {
      label: "Cursor",
      path: path.join(home, ".cursor", "mcp.json"),
      requiredDir: path.join(home, ".cursor"),
      write: writeJsonMcpConfig,
    },
    windsurf: {
      label: "Windsurf",
      path: process.platform === "win32"
        ? path.join(appDataDir(), "Windsurf", "mcp_config.json")
        : path.join(home, ".codeium", "windsurf", "mcp_config.json"),
      requiredDir: process.platform === "win32"
        ? path.join(appDataDir(), "Windsurf")
        : path.join(home, ".codeium", "windsurf"),
      write: writeJsonMcpConfig,
    },
    generic: {
      label: "Generic MCP JSON",
      path: path.join(agonHome(), "mcp.json"),
      requiredDir: null,
      write: writeJsonMcpConfig,
    },
  };
}

function setupTargets(flags) {
  const target = String(flags.target || "all").toLowerCase();
  const adapters = clientAdapters();
  if (target === "all") return Object.keys(adapters);
  if (!adapters[target]) {
    throw new Error("Invalid setup --target. Use codex, claude-desktop, claude-code, cursor, windsurf, generic, or all.");
  }
  return [target];
}

function registerMcpClients(flags) {
  const adapters = clientAdapters();
  const targets = setupTargets(flags);
  const env = mcpEnv(flags);
  const all = String(flags.target || "all").toLowerCase() === "all";
  for (const target of targets) {
    const adapter = adapters[target];
    try {
      if (all && adapter.requiredDir && !fs.existsSync(adapter.requiredDir)) {
        process.stdout.write(`Skipping ${adapter.label}: ${adapter.requiredDir} not found.\n`);
        continue;
      }
      adapter.write(adapter.path, env, flags);
    } catch (error) {
      process.stdout.write(`Warning: failed to register ${adapter.label} (${error.message}). Continuing.\n`);
    }
  }
}

function runPresign(flags) {
  if (flags.dryRun) {
    process.stdout.write("[dry-run] would run agon presign\n");
    return;
  }
  if (flags.skipPresign) {
    process.stdout.write("Skipping SIWX presign (--skip-presign). First quote will sign on demand.\n");
    return;
  }
  const candidates = process.platform === "win32"
    ? ["agon.cmd", "agon.exe", "agon"]
    : ["agon"];
  let resolved;
  for (const candidate of candidates) {
    const result = childProcess.spawnSync(process.platform === "win32" ? "where" : "which", [candidate], {
      encoding: "utf8",
      shell: false,
    });
    if (result.status === 0 && result.stdout && result.stdout.trim()) {
      resolved = candidate;
      break;
    }
  }
  let command;
  let args;
  if (resolved) {
    command = resolved;
    args = ["presign"];
  } else {
    command = "npx";
    args = ["-y", GATEWAY_CLI_PACKAGE, "presign"];
  }
  const result = childProcess.spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    const detail = ((result.stderr || "") + (result.stdout || "")).trim();
    process.stdout.write(`Presign skipped: ${result.error?.message || `exit ${result.status}`}.${detail ? " " + detail.split("\n")[0] : ""}\n`);
    return;
  }
  const out = (result.stdout || "").trim();
  if (out) process.stdout.write(`${out}\n`);
}

function setup(flags) {
  const dryRun = Boolean(flags.dryRun);
  process.stdout.write(`${dryRun ? "[dry-run] " : ""}Setting up Agon agentic tools\n`);
  installSkills({ target: "all", dryRun, quiet: true, skipWalletSetup: true });
  if (!dryRun) process.stdout.write("Installed Agon skills into agents, codex, and claude skill directories.\n");
  setupWallet(flags);
  installGlobalCli(flags);
  copyLlmTxtToAgonHome(flags);
  registerMcpClients(flags);
  runPresign(flags);
}

function printSetup() {
  process.stdout.write(`Next steps:

Gateway CLI (bare bins on PATH after \`setup --target all\`):
  agon -p bitcoin
  agon quote usdt --json
  agon price bitcoin solana usdt
  agon volume tesla gold --json
  agon liquidity usdc usdt
  agon search "bitcoin etf" --limit 5
  agon risk usdt
  agon chart solana --interval 1D
  agon-gateway catalog
  agon-gateway auth call GET /v1/x402/tokens/assets/search --query q=solana --query limit=1
  agon-gateway auth call GET /v1/x402/tokens/assets/tesla/profile

Protocol CLI:
  agon-protocol config
  agon-protocol token show

Agent wallet:
  agon-wallet show --profile default

If a bare bin is not on PATH (e.g. you ran \`setup\` with \`--skip-global-cli\`, or the global install hit a permission error), the \`npx -y @agonx402/<package> ...\` form works on any machine without prior setup.

MCP server commands (auto-spawned by client; you should not need to run these manually):
  npx -y @agonx402/gateway-mcp
  npx -y @agonx402/protocol-mcp

Notes:
- \`setup --target all\` is the one-shot installer: skills, default SIWX wallet, global CLI bins, MCP server registration in every supported client, and a local copy of llm.txt at \`~/.agon/llm.txt\`.
- It registers Agon MCP servers in Codex (\`~/.codex/config.toml\`), Claude Desktop (\`claude_desktop_config.json\`), Claude Code (\`~/.claude.json\`), Cursor (\`~/.cursor/mcp.json\`), Windsurf, and a generic \`~/.agon/mcp.json\`. Existing MCP entries are preserved and a backup is written before any change.
- Use \`--skip-global-cli\` to skip the \`npm install -g\` step (you can fall back to \`npx -y\`).
- Use \`--skip-presign\` to skip the post-install SIWX warmup. Without it, the first cold token quote does the full 402 + sign + retry; with it, the SIWX bearer is cached at \`~/.agon/siwx-cache.json\` and reused for ~5 minutes per the gateway's expirationTime.
- Use \`--skip-wallet-setup\` only when another signer wallet is already configured.
- Restart your agent client after \`setup\` so it re-reads the MCP server list.
- Payment-channel routes are devnet-only in v1.
- Tokens SIWX routes do not use payment channels and cover market data for crypto, currencies, treasuries, ETFs, metals, and stocks.
- The default \`agon-wallet\` signer is SIWX-only (Tokens API). For x402 exact-payment routes set \`AGON_SIGNER_COMMAND\` to a payment-capable hook.
`);
}

function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const command = args.shift() || "help";

  switch (command) {
    case "install-skills":
      installSkills(flags);
      return;
    case "list":
      listSkills();
      return;
    case "doctor":
      doctor();
      return;
    case "setup":
      setup(flags);
      return;
    case "help":
      usage(0);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
}
