import { NextRequest, NextResponse } from "next/server";
import { getAgentHistory, getTokenHistory, getRecentHealth } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "agents";
  const agentId = searchParams.get("agentId");
  const days = parseInt(searchParams.get("days") || "7", 10);

  try {
    switch (type) {
      case "agent":
        if (!agentId) {
          return NextResponse.json(
            { error: "agentId required" },
            { status: 400 }
          );
        }
        return NextResponse.json(getAgentHistory(agentId, days));

      case "tokens":
        if (!agentId) {
          return NextResponse.json(
            { error: "agentId required" },
            { status: 400 }
          );
        }
        return NextResponse.json(getTokenHistory(agentId, days));

      case "health":
        return NextResponse.json(getRecentHealth(50));

      default:
        return NextResponse.json(
          { error: "unknown type" },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
