#!/usr/bin/env node
/**
 * Remove AgentCash MCP registrations and skill copies from common locations.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const home = os.homedir();
const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

function stripBom(text) {
  return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function stripTomlSection(text, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\n?\\[${escaped}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`, "g");
  return text.replace(pattern, "").trimEnd();
}

function cleanJsonMcp(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = stripBom(fs.readFileSync(filePath, "utf8"));
  if (!raw.trim()) return;
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    process.stdout.write(`[skip] parse error: ${filePath}\n`);
    return;
  }
  if (!j.mcpServers) return;
  const keys = Object.keys(j.mcpServers).filter((k) => /agentcash/i.test(k));
  if (keys.length === 0) return;
  for (const k of keys) delete j.mcpServers[k];
  if (Object.keys(j.mcpServers).length === 0) delete j.mcpServers;
  fs.writeFileSync(filePath, `${JSON.stringify(j, null, 2)}\n`);
  process.stdout.write(`removed AgentCash MCP keys [${keys.join(", ")}] from ${filePath}\n`);
}

function cleanCodexToml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let text = fs.readFileSync(filePath, "utf8");
  const before = text;
  const re = /\n?\[mcp_servers\.([^\]]+)\]/gi;
  const toStrip = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    if (/agentcash/i.test(m[1])) {
      toStrip.add(`mcp_servers.${m[1]}`);
    }
  }
  for (const section of toStrip) {
    text = stripTomlSection(text, section);
  }
  if (text !== before) {
    fs.writeFileSync(filePath, `${text.trimEnd()}\n`);
    process.stdout.write(`removed AgentCash TOML sections from ${filePath}\n`);
  }
}

function removeSkillDirs() {
  const roots = [
    path.join(home, ".agents", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".claude", "skills"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (/agentcash/i.test(ent.name)) {
        const p = path.join(root, ent.name);
        fs.rmSync(p, { recursive: true, force: true });
        process.stdout.write(`removed skill dir ${p}\n`);
      }
    }
  }
}

process.stdout.write("=== AgentCash MCP (JSON) ===\n");
cleanJsonMcp(path.join(home, ".cursor", "mcp.json"));
cleanJsonMcp(path.join(home, ".claude.json"));
cleanJsonMcp(path.join(appData, "Claude", "claude_desktop_config.json"));
cleanJsonMcp(path.join(appData, "Windsurf", "mcp_config.json"));
cleanJsonMcp(path.join(home, ".codeium", "windsurf", "mcp_config.json"));
const agonMcp = path.join(home, ".agon", "mcp.json");
if (fs.existsSync(agonMcp)) cleanJsonMcp(agonMcp);

process.stdout.write("\n=== AgentCash MCP (Codex TOML) ===\n");
cleanCodexToml(path.join(home, ".codex", "config.toml"));

process.stdout.write("\n=== AgentCash skills ===\n");
removeSkillDirs();

process.stdout.write("\n=== Cursor MCP descriptor cache (user-agentcash) ===\n");
const cursorProjects = path.join(home, ".cursor", "projects");
if (fs.existsSync(cursorProjects)) {
  for (const ent of fs.readdirSync(cursorProjects, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const cash = path.join(cursorProjects, ent.name, "mcps", "user-agentcash");
    if (fs.existsSync(cash)) {
      fs.rmSync(cash, { recursive: true, force: true });
      process.stdout.write(`removed ${cash}\n`);
    }
  }
} else {
  process.stdout.write("(no ~/.cursor/projects)\n");
}

process.stdout.write("\nDone.\n");
