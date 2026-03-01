/**
 * Gateway API Client — wraps /tools/invoke endpoint
 * Fallback: direct file read (existing behavior)
 */

import fs from "fs";
import path from "path";

const OPENCLAW_HOME =
  process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");

interface GatewayConfig {
  host: string;
  port: number;
  token: string;
}

let _config: GatewayConfig | null = null;

function getGatewayConfig(): GatewayConfig {
  if (_config) return _config;

  // Read from openclaw.json
  try {
    const raw = fs.readFileSync(
      path.join(OPENCLAW_HOME, "openclaw.json"),
      "utf-8"
    );
    const config = JSON.parse(raw);
    _config = {
      host: "127.0.0.1",
      port: config.gateway?.port || 18789,
      token: config.gateway?.auth?.token || "",
    };
  } catch {
    _config = { host: "127.0.0.1", port: 18789, token: "" };
  }

  return _config;
}

export async function invokeGatewayTool(
  tool: string,
  args: Record<string, unknown> = {}
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const cfg = getGatewayConfig();
  const url = `http://${cfg.host}:${cfg.port}/tools/invoke`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.token && { Authorization: `Bearer ${cfg.token}` }),
      },
      body: JSON.stringify({ tool, args }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function getGatewayHealth(): Promise<any> {
  const cfg = getGatewayConfig();
  try {
    const res = await fetch(
      `http://${cfg.host}:${cfg.port}/tools/invoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.token && { Authorization: `Bearer ${cfg.token}` }),
        },
        body: JSON.stringify({
          tool: "session_status",
          args: {},
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return { ok: false, reachable: false };
    const data = await res.json();
    return { ok: true, reachable: true, ...data.result?.details };
  } catch {
    return { ok: false, reachable: false };
  }
}

export async function isGatewayReachable(): Promise<boolean> {
  const cfg = getGatewayConfig();
  try {
    const res = await fetch(`http://${cfg.host}:${cfg.port}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
