/**
 * Auto-extract tasks from Geralt's messages to agents
 * Scans session JSONL for task-like assignments
 */

import fs from "fs";
import path from "path";

const OPENCLAW_HOME =
  process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const GERALT_ID = "8341693096";

interface ExtractedTask {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: string;
  sessionKey: string;
}

// Map agent IDs to display names
function getAgentName(agentId: string): string {
  const map: Record<string, string> = {
    main: "Ciri",
    coder: "Shani",
    creative: "Triss",
    thinktank: "Yennefer",
    guardian: "Vesemir",
    soulmate: "Keira Metz",
  };

  // Also try IDENTITY.md
  const candidates = [
    path.join(OPENCLAW_HOME, `agents/${agentId}/agent/IDENTITY.md`),
    path.join(OPENCLAW_HOME, `workspace-${agentId}/IDENTITY.md`),
  ];
  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, "utf-8");
      const m = content.match(/\*\*Name:\*\*\s*(.+)/);
      if (m) return m[1].trim();
    } catch {}
  }

  return map[agentId] || agentId;
}

// Detect if a message looks like a task assignment
function isTaskLike(text: string): boolean {
  if (!text || text.length < 5 || text.length > 200) return false;

  // Skip questions, greetings, short replies
  if (/^(hi|hello|hey|ok|好的|收到|谢|嗯|哈|对|是的|不|没|哦)/i.test(text)) return false;
  if (/^\?|？$/.test(text.trim())) return false;
  if (text.startsWith("/")) return false; // commands
  // Skip system/metadata messages
  if (text.includes("Conversation info") || text.includes("untrusted metadata")) return false;
  if (text.includes("message_id") || text.includes("sender_id")) return false;
  if (text.includes("[System Message]") || text.includes("[media attached")) return false;
  if (text.startsWith("```")) return false; // code blocks
  if (/^\[?\{/.test(text.trim())) return false; // JSON

  // Task-like patterns (Chinese)
  const cnPatterns = [
    /去[做搞弄整写建改加删查看]/,
    /帮[我忙]?[做搞弄整写建改加删查看]/,
    /你来[做搞负责]/,
    /[做搞弄整写建改加删]一[个下些]/,
    /把.{2,20}[做搞改成加上删掉]/,
    /需要.{2,20}/,
    /[记注]得.{2,20}/,
    /接手/,
    /负责/,
    /任务[是：:]/,
    /搞[定一]下/,
    /处理一下/,
    /安排/,
    /实现/,
    /部署/,
    /配置/,
    /调研/,
    /分析/,
    /优化/,
    /修复/,
    /测试/,
  ];

  // Task-like patterns (English)
  const enPatterns = [
    /^(please |pls )?(do|make|create|build|fix|add|remove|delete|update|deploy|setup|configure|implement|write|review|check|test|debug|optimize)/i,
    /^(can you|could you|would you).{5,}/i,
    /^(I need you to|I want you to)/i,
    /^(go ahead and|start|begin|proceed)/i,
  ];

  const allPatterns = [...cnPatterns, ...enPatterns];
  return allPatterns.some((p) => p.test(text));
}

// Clean task text - extract the core action
function cleanTaskText(text: string): string {
  // Take first meaningful line only
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 3);
  let clean = lines[0] || text;

  // Remove mention prefixes
  clean = clean
    .replace(/^@\w+[\s,，]+/g, "")
    .replace(/^(shani|ciri|triss|yennefer|vesemir|keira)[,，\s]+/gi, "")
    .trim();

  // Truncate if too long
  if (clean.length > 100) {
    clean = clean.slice(0, 97) + "...";
  }

  return clean;
}

export function extractRecentTasks(
  sinceDays: number = 1
): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const cutoff = Date.now() - sinceDays * 86400000;
  const agentsDir = path.join(OPENCLAW_HOME, "agents");

  let agentIds: string[];
  try {
    agentIds = fs
      .readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return tasks;
  }

  for (const agentId of agentIds) {
    // Skip private/personal agents
    if (agentId === "soulmate") continue;

    const sessionsDir = path.join(agentsDir, agentId, "sessions");
    const agentName = getAgentName(agentId);

    let files: string[];
    try {
      files = fs
        .readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted."));
    } catch {
      continue;
    }

    // Only check recently modified files
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) continue;
      } catch {
        continue;
      }

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const lines = content.trim().split("\n");
      for (const line of lines) {
        let entry: any;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        if (entry.type !== "message" || !entry.message || !entry.timestamp) continue;

        const ts = new Date(entry.timestamp).getTime();
        if (ts < cutoff) continue;

        const msg = entry.message;
        // Only Geralt's messages (user role from Geralt)
        if (msg.role !== "user") continue;

        const text = typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ")
            : "";

        if (isTaskLike(text)) {
          tasks.push({
            agentId,
            agentName,
            text: cleanTaskText(text),
            timestamp: entry.timestamp,
            sessionKey: file.replace(".jsonl", ""),
          });
        }
      }
    }
  }

  // Sort by timestamp desc
  tasks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return tasks;
}
