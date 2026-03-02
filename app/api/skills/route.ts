import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");

// Find OpenClaw package directory
function findOpenClawPkg(): string {
  // Check common locations
  const candidates = [
    "/opt/homebrew/lib/node_modules/openclaw",
    path.join(process.env.HOME || "", ".nvm/versions/node", process.version, "lib/node_modules/openclaw"),
    "/usr/local/lib/node_modules/openclaw",
    "/usr/lib/node_modules/openclaw",
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "package.json"))) return c;
  }
  // Fallback: try to find via which
  return candidates[0];
}

const OPENCLAW_PKG = findOpenClawPkg();

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  emoji: string;
  source: string; // "builtin" | "extension" | "custom"
  location: string;
  usedBy: string[]; // agent ids
}

function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content.startsWith("---")) return result;
  const parts = content.split("---", 3);
  if (parts.length < 3) return result;
  const fm = parts[1];

  const nameMatch = fm.match(/^name:\s*(.+)/m);
  if (nameMatch) result.name = nameMatch[1].trim().replace(/^["']|["']$/g, "");

  const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) result.description = descMatch[1].trim().replace(/^["']|["']$/g, "");

  const emojiMatch = fm.match(/"emoji":\s*"([^"]+)"/);
  if (emojiMatch) result.emoji = emojiMatch[1];

  return result;
}

function scanSkillsDir(dir: string, source: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (!fs.existsSync(dir)) return skills;
  for (const name of fs.readdirSync(dir).sort()) {
    const skillMd = path.join(dir, name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    const content = fs.readFileSync(skillMd, "utf-8");
    const fm = parseFrontmatter(content);
    skills.push({
      id: name,
      name: fm.name || name,
      description: fm.description || "",
      emoji: fm.emoji || "🔧",
      source,
      location: skillMd,
      usedBy: [],
    });
  }
  return skills;
}

function getAgentSkillsFromSessions(): Record<string, Set<string>> {
  // Parse skillsSnapshot from session JSONL files
  const agentsDir = path.join(OPENCLAW_HOME, "agents");
  const result: Record<string, Set<string>> = {};
  if (!fs.existsSync(agentsDir)) return result;

  for (const agentId of fs.readdirSync(agentsDir)) {
    const sessionsDir = path.join(agentsDir, agentId, "sessions");
    if (!fs.existsSync(sessionsDir)) continue;

    const jsonlFiles = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith(".jsonl"))
      .sort();
    const skillNames = new Set<string>();

    // Check the most recent session files for skillsSnapshot
    for (const file of jsonlFiles.slice(-3)) {
      const content = fs.readFileSync(path.join(sessionsDir, file), "utf-8");
      const idx = content.indexOf("skillsSnapshot");
      if (idx < 0) continue;
      const chunk = content.slice(idx, idx + 5000);
      // Match skill names in escaped JSON: \"name\":\"xxx\" or "name":"xxx"
      const matches = chunk.matchAll(/\\?"name\\?":\s*\\?"([^"\\]+)\\?"/g);
      for (const m of matches) {
        const name = m[1];
        // Filter out tool names and other non-skill entries
        if (!["exec","read","edit","write","process","message","web_search","web_fetch",
              "browser","tts","gateway","memory_search","memory_get","cron","nodes",
              "canvas","session_status","sessions_list","sessions_history","sessions_send",
              "sessions_spawn","agents_list"].includes(name) && name.length > 1) {
          skillNames.add(name);
        }
      }
    }
    if (skillNames.size > 0) {
      result[agentId] = skillNames;
    }
  }
  return result;
}

function getAgentWorkspaceSkillIds(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
  let agentList: any[] = [];
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    agentList = config.agents?.list || [];
  } catch { return result; }

  for (const agent of agentList) {
    const agentId = agent.id;
    const ws = agent.workspace || path.join(OPENCLAW_HOME, agentId === "main" ? "workspace" : `workspace-${agentId}`);
    const skillsDir = path.join(ws, "skills");
    const skillIds: string[] = [];

    if (fs.existsSync(skillsDir)) {
      for (const name of fs.readdirSync(skillsDir).sort()) {
        const skillMd = path.join(skillsDir, name, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          skillIds.push(name);
        }
      }
    }

    // Also add builtin skills (all agents get them)
    const builtinDir = path.join(OPENCLAW_PKG, "skills");
    if (fs.existsSync(builtinDir)) {
      for (const name of fs.readdirSync(builtinDir).sort()) {
        const skillMd = path.join(builtinDir, name, "SKILL.md");
        if (fs.existsSync(skillMd) && !skillIds.includes(name)) {
          skillIds.push(name);
        }
      }
    }

    // Also custom skills (~/.openclaw/skills)
    const customDir = path.join(OPENCLAW_HOME, "skills");
    if (fs.existsSync(customDir)) {
      for (const name of fs.readdirSync(customDir).sort()) {
        const skillMd = path.join(customDir, name, "SKILL.md");
        if (fs.existsSync(skillMd) && !skillIds.includes(name)) {
          skillIds.push(name);
        }
      }
    }

    result[agentId] = skillIds;
  }
  return result;
}

export async function GET() {
  try {
    // 1. Scan builtin skills
    const builtinDir = path.join(OPENCLAW_PKG, "skills");
    const builtinSkills = scanSkillsDir(builtinDir, "builtin");

    // 2. Scan extension skills
    const extDir = path.join(OPENCLAW_PKG, "extensions");
    const extSkills: SkillInfo[] = [];
    if (fs.existsSync(extDir)) {
      for (const ext of fs.readdirSync(extDir)) {
        const skillsDir = path.join(extDir, ext, "skills");
        if (fs.existsSync(skillsDir)) {
          const skills = scanSkillsDir(skillsDir, `extension:${ext}`);
          extSkills.push(...skills);
        }
      }
    }

    // 3. Scan custom skills (~/.openclaw/skills)
    const customDir = path.join(OPENCLAW_HOME, "skills");
    const customSkills = scanSkillsDir(customDir, "custom");

    // 4. Scan per-agent workspace skills
    const agentWorkspaceSkills: SkillInfo[] = [];
    const agentsDir = path.join(OPENCLAW_HOME, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const agentId of fs.readdirSync(agentsDir)) {
        // Check workspace-{agentId}/skills/
        const wsSkillsDir = path.join(OPENCLAW_HOME, `workspace-${agentId}`, "skills");
        if (fs.existsSync(wsSkillsDir)) {
          const skills = scanSkillsDir(wsSkillsDir, `agent:${agentId}`);
          // Avoid duplicates
          for (const s of skills) {
            if (!agentWorkspaceSkills.some(e => e.id === s.id) && !customSkills.some(e => e.id === s.id)) {
              agentWorkspaceSkills.push(s);
            }
          }
        }
        // Also check agent dir skills
        const agentSkillsDir = path.join(agentsDir, agentId, "agent", "skills");
        if (fs.existsSync(agentSkillsDir)) {
          const skills = scanSkillsDir(agentSkillsDir, `agent:${agentId}`);
          for (const s of skills) {
            if (!agentWorkspaceSkills.some(e => e.id === s.id) && !customSkills.some(e => e.id === s.id)) {
              agentWorkspaceSkills.push(s);
            }
          }
        }
      }
    }

    const allSkills = [...builtinSkills, ...extSkills, ...customSkills, ...agentWorkspaceSkills];

    // 4. Map agent usage from session data
    const agentSkills = getAgentSkillsFromSessions();
    for (const skill of allSkills) {
      for (const [agentId, skills] of Object.entries(agentSkills)) {
        if (skills.has(skill.id) || skills.has(skill.name)) {
          skill.usedBy.push(agentId);
        }
      }
    }

    // 5. Get agent info for display
    const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const agentList = config.agents?.list || [];
    const agentMap: Record<string, { name: string; emoji: string }> = {};
    for (const a of agentList) {
      const name = a.identity?.name || a.name || a.id;
      const emoji = a.identity?.emoji || "🤖";
      agentMap[a.id] = { name, emoji };
    }

    // 6. Build per-agent skill mapping from workspace dirs
    const agentSkillMap = getAgentWorkspaceSkillIds();

    // Update usedBy based on workspace mapping
    for (const skill of allSkills) {
      for (const [agentId, skillIds] of Object.entries(agentSkillMap)) {
        if (skillIds.includes(skill.id) && !skill.usedBy.includes(agentId)) {
          skill.usedBy.push(agentId);
        }
      }
    }

    return NextResponse.json({
      skills: allSkills,
      agents: agentMap,
      agentSkillMap,
      total: allSkills.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
