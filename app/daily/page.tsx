"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

interface AgentUpdate {
  agentId: string;
  name: string;
  emoji: string;
  date: string;
  messageCount: number;
  tokenUsage: number;
  activeSessionCount: number;
  highlights: string[];
  firstActive: string | null;
  lastActive: string | null;
}

interface DailyData {
  date: string;
  updates: AgentUpdate[];
  totalMessages: number;
  totalTokens: number;
  activeAgents: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function DailyPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const fetchData = useCallback(
    (date: string) => {
      setLoading(true);
      fetch(`/api/daily-updates?date=${date}`)
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    fetchData(selectedDate);
    // Auto refresh every 30s for today
    const today = new Date().toISOString().slice(0, 10);
    if (selectedDate === today) {
      const timer = setInterval(() => fetchData(selectedDate), 30000);
      return () => clearInterval(timer);
    }
  }, [selectedDate, fetchData]);

  const changeDate = (offset: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            📅 {t("daily.title")}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {t("daily.subtitle")}
          </p>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeDate(-1)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm"
          >
            ←
          </button>
          <div className="px-4 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm font-mono text-[var(--text)]">
            {selectedDate}
            {isToday && (
              <span className="ml-2 text-xs text-green-500">● LIVE</span>
            )}
          </div>
          <button
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-[var(--text-muted)]">Loading...</div>
        </div>
      ) : !data || data.updates.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">😴</div>
          <div className="text-[var(--text-muted)]">{t("daily.noActivity")}</div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              icon="🤖"
              label={t("daily.activeAgents")}
              value={`${data.activeAgents}`}
            />
            <SummaryCard
              icon="💬"
              label={t("daily.totalMessages")}
              value={formatTokens(data.totalMessages)}
            />
            <SummaryCard
              icon="🧮"
              label={t("daily.totalTokens")}
              value={formatTokens(data.totalTokens)}
            />
          </div>

          {/* Agent updates */}
          <div className="space-y-4">
            {data.updates.map((update) => (
              <div
                key={update.agentId}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
              >
                <div className="px-5 py-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{update.emoji}</span>
                    <div>
                      <div className="font-semibold text-[var(--text)]">
                        {update.name}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5 space-x-3">
                        <span>💬 {update.messageCount} messages</span>
                        <span>🧮 {formatTokens(update.tokenUsage)} tokens</span>
                        <span>🧵 {update.activeSessionCount} sessions</span>
                        <span>
                          🕐 {formatTime(update.firstActive)} — {formatTime(update.lastActive)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Activity bar */}
                  <div className="flex items-center gap-1">
                    {[...Array(Math.min(10, Math.ceil(update.messageCount / 5)))].map(
                      (_, i) => (
                        <div
                          key={i}
                          className="w-1.5 rounded-full bg-[var(--accent)]"
                          style={{
                            height: `${12 + Math.random() * 12}px`,
                            opacity: 0.4 + Math.random() * 0.6,
                          }}
                        />
                      )
                    )}
                  </div>
                </div>

                {/* Highlights */}
                {update.highlights.length > 0 && (
                  <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg)]/50">
                    <div className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                      {t("daily.highlights")}
                    </div>
                    <ul className="space-y-1">
                      {update.highlights.map((h, i) => (
                        <li
                          key={i}
                          className="text-sm text-[var(--text)] flex items-start gap-2"
                        >
                          <span className="text-[var(--accent)] mt-0.5">▸</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
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
