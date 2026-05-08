#!/usr/bin/env node
/**
 * Remove Ryvo from this machine: global npm packages, ~/.ryvo, copied skills,
 * and MCP registrations in common client configs (Windows + generic paths).
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

const home = os.homedir();
const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

const RYVO_KEYS = ["ryvo-gateway", "ryvo-protocol"];
const NPM_PKGS = [
  "@ryvonetwork/agentic",
  "@ryvonetwork/gateway-cli",
  "@ryvonetwork/gateway-mcp",
  "@ryvonetwork/protocol-cli",
  "@ryvonetwork/protocol-mcp",
  "@ryvonetwork/agent-wallet",
];

function stripBom(text) {
  return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function stripTomlSection(text, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\n?\\[${escaped}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`, "g");
  return text.replace(pattern, "").trimEnd();
}

function npmLsGlobal() {
  try {
    return execSync("npm ls -g --depth=0", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return error.stdout || "";
  }
}

function uninstallGlobals() {
  process.stdout.write("=== npm uninstall @ryvonetwork globals ===\n");
  const ls = npmLsGlobal();
  const toRemove = NPM_PKGS.filter((p) => ls.includes(p));
  if (toRemove.length === 0) {
    process.stdout.write("(no @ryvonetwork globals)\n\n");
    return;
  }
  execSync(`npm uninstall -g ${toRemove.map((s) => JSON.stringify(s)).join(" ")}`, { stdio: "inherit" });
  process.stdout.write("\n");
}

function rmDir(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    process.stdout.write(`removed ${p}\n`);
  }
}

function removeRyvoHome() {
  process.stdout.write("=== remove ~/.ryvo ===\n");
  rmDir(path.join(home, ".ryvo"));
  process.stdout.write("\n");
}

function removeSkills() {
  process.stdout.write("=== Remove Ryvo-* skills ===\n");
  const roots = [
    path.join(home, ".agents", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".claude", "skills"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      if (name.name.startsWith("ryvo-")) {
        rmDir(path.join(root, name.name));
      }
    }
  }
  process.stdout.write("\n");
}

function cleanJsonMcp(filePath) {
  if (!fs.existsSync(filePath)) {
    process.stdout.write(`[mcp json] skip missing ${filePath}\n`);
    return;
  }
  const raw = stripBom(fs.readFileSync(filePath, "utf8"));
  if (!raw.trim()) {
    process.stdout.write(`[mcp json] empty ${filePath}\n`);
    return;
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch (error) {
    process.stdout.write(`[mcp json] SKIP parse error ${filePath}: ${error.message}\n`);
    return;
  }
  if (!j.mcpServers) {
    process.stdout.write(`[mcp json] no mcpServers ${filePath}\n`);
    return;
  }
  let removed = 0;
  for (const k of RYVO_KEYS) {
    if (j.mcpServers[k]) {
      delete j.mcpServers[k];
      removed += 1;
    }
  }
  if (removed === 0) {
    process.stdout.write(`[mcp json] no ryvo keys ${filePath}\n`);
    return;
  }
  if (Object.keys(j.mcpServers).length === 0) {
    delete j.mcpServers;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(j, null, 2)}\n`);
  process.stdout.write(`[mcp json] cleaned ${filePath} (${removed} keys)\n`);
}

function cleanCodexToml() {
  process.stdout.write("=== strip Ryvo MCP from Codex config.toml ===\n");
  const filePath = path.join(home, ".codex", "config.toml");
  if (!fs.existsSync(filePath)) {
    process.stdout.write("(codex config.toml missing)\n\n");
    return;
  }
  let text = fs.readFileSync(filePath, "utf8");
  const before = text;
  text = stripTomlSection(text, "mcp_servers.ryvo_gateway");
  text = stripTomlSection(text, "mcp_servers.ryvo_protocol");
  if (text !== before) {
    fs.writeFileSync(filePath, `${text.trimEnd()}\n`);
    process.stdout.write(`cleaned ${filePath}\n\n`);
  } else {
    process.stdout.write("(no Ryvo MCP blocks in codex config)\n\n");
  }
}

function cleanAllMcpJson() {
  process.stdout.write("=== strip Ryvo MCP from JSON configs ===\n");
  const paths = [
    path.join(home, ".cursor", "mcp.json"),
    path.join(home, ".claude.json"),
    path.join(appData, "Claude", "claude_desktop_config.json"),
    path.join(appData, "Windsurf", "mcp_config.json"),
    path.join(home, ".codeium", "windsurf", "mcp_config.json"),
  ];
  for (const p of paths) {
    cleanJsonMcp(p);
  }
  process.stdout.write("\n");
}

function verify() {
  process.stdout.write("=== verify ===\n");
  const ls = npmLsGlobal();
  const left = NPM_PKGS.filter((p) => ls.includes(p));
  process.stdout.write(`@ryvonetwork globals left: ${left.length ? left.join(", ") : "none"}\n`);
  process.stdout.write(`~/.ryvo exists: ${fs.existsSync(path.join(home, ".ryvo"))}\n`);
}

uninstallGlobals();
removeRyvoHome();
removeSkills();
cleanAllMcpJson();
cleanCodexToml();
verify();
