import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: Request) {
  try {
    const { sessionKey, agentId } = await req.json();
    if (!sessionKey || !agentId) {
      return NextResponse.json({ error: "Missing sessionKey or agentId" }, { status: 400 });
    }

    const startTime = Date.now();

    try {
      // Use openclaw agent CLI to send a ping and check response
      const result = execSync(
        `openclaw agent --agent ${agentId} --session-id "${sessionKey}" --message "Health check: reply with OK" --timeout 30 --json`,
        { timeout: 40000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );

      const elapsed = Date.now() - startTime;

      // Parse JSON from output — skip plugin/config noise lines, find first '{'
      const lines = result.split("\n");
      const jsonStartIdx = lines.findIndex(l => l.trimStart().startsWith("{"));
      if (jsonStartIdx === -1) {
        return NextResponse.json({
          status: "error",
          sessionKey,
          elapsed,
          error: "No JSON in CLI output",
        });
      }
      const jsonStr = lines.slice(jsonStartIdx).join("\n");
      const data = JSON.parse(jsonStr);
      const payloads = data?.result?.payloads || [];
      const reply = payloads[0]?.text || "";
      const durationMs = data?.result?.meta?.durationMs || elapsed;
      const ok = data.status === "ok";

      return NextResponse.json({
        status: ok ? "ok" : "error",
        sessionKey,
        elapsed: durationMs,
        reply: reply ? reply.slice(0, 200) : (ok ? "(no reply)" : ""),
        error: ok ? undefined : "Agent returned error status",
      });
    } catch (execErr: any) {
      const elapsed = Date.now() - startTime;
      const isTimeout = execErr.killed || execErr.signal === "SIGTERM";
      return NextResponse.json({
        status: "error",
        sessionKey,
        elapsed,
        error: isTimeout ? "Timeout: session not responding (30s)" : (execErr.stderr || execErr.message || "Unknown error").slice(0, 300),
      });
    }
  } catch (err: any) {
    return NextResponse.json({ status: "error", error: err.message }, { status: 500 });
  }
}
