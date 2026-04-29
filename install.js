#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PACKAGE_NAME = "@agonx402/agentic";
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
  agonx402-agentic install-skills [--target agents|codex|all] [--target-dir PATH] [--dry-run]
  agonx402-agentic list
  agonx402-agentic doctor
  agonx402-agentic setup
  agonx402-agentic help

Examples:
  npx -y ${PACKAGE_NAME} install-skills
  npx -y ${PACKAGE_NAME} install-skills --target codex
  npx -y ${PACKAGE_NAME} install-skills --target all
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
  };
}

function resolveInstallTargets(flags) {
  if (flags.targetDir) {
    return [path.resolve(String(flags.targetDir))];
  }

  const target = String(flags.target || "agents").toLowerCase();
  const roots = defaultTargetRoots();

  if (target === "agents") return [roots.agents];
  if (target === "codex") return [roots.codex];
  if (target === "all") return [roots.agents, roots.codex];

  throw new Error("Invalid --target. Use agents, codex, or all.");
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
  const targets = resolveInstallTargets(flags);

  for (const targetRoot of targets) {
    if (dryRun) {
      process.stdout.write(`[dry-run] target ${targetRoot}\n`);
    } else {
      fs.mkdirSync(targetRoot, { recursive: true });
      process.stdout.write(`Installing Agon skills into ${targetRoot}\n`);
    }

    for (const skill of SKILLS) {
      const source = path.join(skillsRoot(), skill.name);
      const destination = assertSafeDestination(targetRoot, skill.name);
      copySkill(source, destination, dryRun);
      if (!dryRun) {
        process.stdout.write(`  installed ${skill.name}\n`);
      }
    }
  }

  process.stdout.write("\n");
  printSetup();
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
  process.stdout.write(`Default target: ${roots.agents}\n`);
  process.stdout.write(`Codex target: ${roots.codex}\n`);
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

function printSetup() {
  process.stdout.write(`Next steps:

Gateway CLI:
  npx -y @agonx402/gateway-cli catalog

Protocol CLI:
  npx -y @agonx402/protocol-cli config
  npx -y @agonx402/protocol-cli token show

MCP server commands:
  npx -y @agonx402/gateway-mcp
  npx -y @agonx402/protocol-mcp

Example MCP config:
{
  "mcpServers": {
    "agon-gateway": {
      "command": "npx",
      "args": ["-y", "@agonx402/gateway-mcp"]
    },
    "agon-protocol": {
      "command": "npx",
      "args": ["-y", "@agonx402/protocol-mcp"]
    }
  }
}

Notes:
- Payment-channel routes are devnet-only in v1.
- Tokens SIWX routes do not use payment channels.
- This installer does not store keys, sign, broadcast, or edit MCP config files.
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
      printSetup();
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
