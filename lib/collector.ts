/**
 * Data Collector — periodically fetches from Gateway API and persists to SQLite
 */

import { invokeGatewayTool, getGatewayHealth } from "./gateway-client";
import {
  upsertAgentSnapshot,
  upsertTokenUsage,
  insertGatewayHealth,
} from "./db";

export interface CollectorEvent {
  type: "agent:status" | "agent:activity" | "gateway:health";
  data: any;
  ts: number;
}

type Listener = (event: CollectorEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: CollectorEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {}
  }
}

async function collectAgentData() {
  try {
    // Use the existing /api/config which reads from files
    // In future, migrate to Gateway API when endpoints are available
    const configRes = await fetch("http://127.0.0.1:3000/api/config");
    if (!configRes.ok) return;

    const config = await configRes.json();
    const agents = config.agents || [];
    const today = new Date().toISOString().slice(0, 10);

    for (const agent of agents) {
      const session = agent.session || {};
      const status =
        session.lastActive && Date.now() - session.lastActive < 300000
          ? "active"
          : "idle";

      upsertAgentSnapshot(agent.id, {
        name: agent.name,
        model: agent.model,
        status,
        totalTokens: session.totalTokens || 0,
        sessionCount: session.sessionCount || 0,
        messageCount: session.messageCount || 0,
        avgResponseMs: session.todayAvgResponseMs || 0,
      });

      // Token usage for today (approximate from weekly data)
      const weeklyTokens = session.weeklyTokens || [];
      if (weeklyTokens.length > 0) {
        const todayTokens = weeklyTokens[weeklyTokens.length - 1] || 0;
        upsertTokenUsage(agent.id, today, todayTokens, 0);
      }

      emit({
        type: "agent:status",
        data: { agentId: agent.id, name: agent.name, status },
        ts: Date.now(),
      });
    }
  } catch (err) {
    console.error("[collector] agent data error:", err);
  }
}

async function collectHealthData() {
  try {
    const health = await getGatewayHealth();
    const status = health.reachable ? "ok" : "unreachable";
    insertGatewayHealth(status, JSON.stringify(health));

    emit({
      type: "gateway:health",
      data: { status, ...health },
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[collector] health error:", err);
  }
}

let _interval: NodeJS.Timeout | null = null;

export function startCollector(intervalMs: number = 30000) {
  if (_interval) return;

  // Initial collection
  collectAgentData();
  collectHealthData();

  // Periodic
  _interval = setInterval(() => {
    collectAgentData();
    collectHealthData();
  }, intervalMs);

  console.log(`[collector] started, interval=${intervalMs}ms`);
}

export function stopCollector() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
