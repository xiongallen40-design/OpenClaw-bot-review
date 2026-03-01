"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useSSE } from "@/lib/use-sse";

interface AgentSession {
  lastActive: number | null;
  totalTokens: number;
  sessionCount: number;
  messageCount: number;
  todayAvgResponseMs: number;
  weeklyTokens: number[];
  weeklyResponseMs: number[];
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  session?: AgentSession;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatMs(ms: number): string {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "min";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms + "ms";
}

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
  return Math.floor(diff / 86400000) + "天前";
}

/** Mini sparkline SVG from weekly data */
function Sparkline({ data, color = "var(--accent)" }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w = 120;
  const h = 32;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TeamPage() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.agents) setAgents(data.agents);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // SSE for live status
  useSSE("/api/events", (event) => {
    if (event.type === "agent:status") {
      const { agentId, status } = event.data;
      setStatuses((prev) => ({ ...prev, [agentId]: status }));
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  // Sort: active first, then by message count
  const sorted = [...agents].sort((a, b) => {
    const aActive = statuses[a.id] === "active" ? 1 : 0;
    const bActive = statuses[b.id] === "active" ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    return (b.session?.messageCount || 0) - (a.session?.messageCount || 0);
  });

  const totalTokens = agents.reduce((sum, a) => sum + (a.session?.totalTokens || 0), 0);
  const totalMessages = agents.reduce((sum, a) => sum + (a.session?.messageCount || 0), 0);
  const activeCount = Object.values(statuses).filter((s) => s === "active").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          👥 {t("team.title")}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Kaer Morhen Labs — Real-time Team Dashboard
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label={t("team.active")}
          value={`${activeCount}/${agents.length}`}
          icon="🟢"
        />
        <SummaryCard
          label={t("team.tokens")}
          value={formatTokens(totalTokens)}
          icon="🧮"
        />
        <SummaryCard
          label={t("team.messages")}
          value={formatTokens(totalMessages)}
          icon="💬"
        />
        <SummaryCard
          label={t("team.sessions")}
          value={String(agents.reduce((s, a) => s + (a.session?.sessionCount || 0), 0))}
          icon="🧵"
        />
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((agent) => {
          const status = statuses[agent.id] || "idle";
          const session = agent.session;

          return (
            <div
              key={agent.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3 transition-shadow hover:shadow-lg"
            >
              {/* Agent header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{agent.emoji}</span>
                  <div>
                    <div className="font-semibold text-[var(--text)]">
                      {agent.name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {agent.model.split("/").pop()}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    status === "active"
                      ? "bg-green-500/15 text-green-500"
                      : "bg-gray-500/15 text-gray-400"
                  }`}
                >
                  {status === "active" ? t("team.active") : t("team.idle")}
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[var(--text-muted)] text-xs">
                    {t("team.tokens")}
                  </div>
                  <div className="font-mono text-[var(--text)]">
                    {formatTokens(session?.totalTokens || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">
                    {t("team.messages")}
                  </div>
                  <div className="font-mono text-[var(--text)]">
                    {session?.messageCount || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">
                    {t("team.responseTime")}
                  </div>
                  <div className="font-mono text-[var(--text)]">
                    {session?.todayAvgResponseMs
                      ? formatMs(session.todayAvgResponseMs)
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">
                    {t("team.lastActive")}
                  </div>
                  <div className="font-mono text-[var(--text)]">
                    {timeAgo(session?.lastActive || null)}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">
                  {t("team.trend")} — Tokens
                </div>
                <Sparkline data={session?.weeklyTokens || []} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold text-[var(--text)] mt-1">{value}</div>
    </div>
  );
}
