import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME =
  process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");

interface AgentUpdate {
  agentId: string;
  name: string;
  emoji: string;
  date: string;
  messageCount: number;
  tokenUsage: number;
  activeSessionCount: number;
  highlights: string[]; // key topics/actions extracted from messages
  firstActive: string | null;
  lastActive: string | null;
}

function getAgentIdentity(agentId: string): { name: string; emoji: string } {
  const candidates = [
    path.join(OPENCLAW_HOME, `agents/${agentId}/agent/IDENTITY.md`),
    path.join(OPENCLAW_HOME, `workspace-${agentId}/IDENTITY.md`),
    agentId === "main"
      ? path.join(OPENCLAW_HOME, "workspace/IDENTITY.md")
      : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, "utf-8");
      const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/);
      const emojiMatch = content.match(/\*\*Emoji:\*\*\s*(.+)/);
      return {
        name: nameMatch?.[1]?.trim() || agentId,
        emoji: emojiMatch?.[1]?.trim() || "🤖",
      };
    } catch {}
  }
  return { name: agentId, emoji: "🤖" };
}

function extractHighlights(messages: any[]): string[] {
  const highlights: string[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.content) continue;
    const text = typeof msg.content === "string" ? msg.content : "";
    if (!text || text.length < 20) continue;

    // Extract first meaningful sentence (skip greetings)
    const lines = text.split("\n").filter((l: string) => l.trim().length > 10);
    for (const line of lines.slice(0, 3)) {
      const clean = line.replace(/^[\s*#>-]+/, "").trim();
      if (clean.length < 15 || clean.length > 120) continue;
      // Skip generic greetings
      if (/^(hi|hello|hey|ok|sure|thanks|好的|收到|没问题)/i.test(clean)) continue;

      const key = clean.slice(0, 40);
      if (!seen.has(key)) {
        seen.add(key);
        highlights.push(clean);
        if (highlights.length >= 5) break;
      }
    }
    if (highlights.length >= 5) break;
  }

  return highlights;
}

function getAgentDailyUpdate(agentId: string, targetDate: string): AgentUpdate | null {
  const identity = getAgentIdentity(agentId);
  const sessionsDir = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions`);

  let totalMessages = 0;
  let totalTokens = 0;
  let activeSessions = 0;
  let firstActive: string | null = null;
  let lastActive: string | null = null;
  const allMessages: any[] = [];

  try {
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const filePath = path.join(sessionsDir, file);

      // Quick check: only read files modified today or after target date
      try {
        const stat = fs.statSync(filePath);
        const fileDate = stat.mtime.toISOString().slice(0, 10);
        if (fileDate < targetDate) continue;
      } catch {
        continue;
      }

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      let sessionHadActivity = false;
      const lines = content.trim().split("\n");

      for (const line of lines) {
        let entry: any;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        if (entry.type !== "message" || !entry.message || !entry.timestamp) continue;

        const msgDate = entry.timestamp.slice(0, 10);
        if (msgDate !== targetDate) continue;

        sessionHadActivity = true;
        totalMessages++;

        const msg = entry.message;
        if (msg.role === "assistant" && msg.usage) {
          totalTokens += (msg.usage.input || 0) + (msg.usage.output || 0);
        }

        const ts = entry.timestamp;
        if (!firstActive || ts < firstActive) firstActive = ts;
        if (!lastActive || ts > lastActive) lastActive = ts;

        if (msg.role === "assistant") {
          allMessages.push(msg);
        }
      }

      if (sessionHadActivity) activeSessions++;
    }
  } catch {
    return null;
  }

  if (totalMessages === 0) return null;

  return {
    agentId,
    name: identity.name,
    emoji: identity.emoji,
    date: targetDate,
    messageCount: totalMessages,
    tokenUsage: totalTokens,
    activeSessionCount: activeSessions,
    highlights: extractHighlights(allMessages),
    firstActive,
    lastActive,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date =
    searchParams.get("date") || new Date().toISOString().slice(0, 10);

  try {
    // Discover all agents
    const agentsDir = path.join(OPENCLAW_HOME, "agents");
    const agentIds = fs
      .readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);

    const updates: AgentUpdate[] = [];
    for (const agentId of agentIds) {
      const update = getAgentDailyUpdate(agentId, date);
      if (update) updates.push(update);
    }

    // Sort by message count desc
    updates.sort((a, b) => b.messageCount - a.messageCount);

    return NextResponse.json({
      date,
      updates,
      totalMessages: updates.reduce((s, u) => s + u.messageCount, 0),
      totalTokens: updates.reduce((s, u) => s + u.tokenUsage, 0),
      activeAgents: updates.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
