"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Session {
  key: string;
  type: string;
  target: string;
  sessionId: string | null;
  updatedAt: number;
  totalTokens: number;
  contextTokens: number;
  systemSent: boolean;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  main: { label: "主会话", emoji: "🏠", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  "feishu-dm": { label: "飞书私聊", emoji: "📱", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "feishu-group": { label: "飞书群聊", emoji: "👥", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "discord-dm": { label: "Discord 私聊", emoji: "🎮", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  "discord-channel": { label: "Discord 频道", emoji: "📢", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  cron: { label: "定时任务", emoji: "⏰", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  unknown: { label: "未知", emoji: "❓", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
};

function formatTimeAgo(ts: number): string {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatTime(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN");
}

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agent") || "";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/sessions/${agentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setSessions(d.sessions || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (!agentId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">缺少 agent 参数</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">加载失败: {error}</p>
      </div>
    );
  }

  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📋 {agentId} 的会话列表</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            共 {sessions.length} 个会话 · 总 Token: {(totalTokens / 1000).toFixed(1)}k
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition"
        >
          ← 返回首页
        </Link>
      </div>

      <div className="space-y-3">
        {sessions.map((s) => {
          const typeInfo = TYPE_LABELS[s.type] || TYPE_LABELS.unknown;
          return (
            <div
              key={s.key}
              className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] transition"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${typeInfo.color}`}
                  >
                    {typeInfo.emoji} {typeInfo.label}
                  </span>
                  {s.target && (
                    <code className="text-xs text-[var(--text-muted)] bg-[var(--bg)] px-2 py-0.5 rounded">
                      {s.target}
                    </code>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(s.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="font-mono text-[10px] opacity-60">{s.key}</span>
                <div className="flex gap-4">
                  <span>Token: {(s.totalTokens / 1000).toFixed(1)}k</span>
                  <span>{formatTime(s.updatedAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
