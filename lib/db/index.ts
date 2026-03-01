import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(
  process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw"),
  "kaer-morhen-labs.db"
);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  _db.pragma("synchronous = NORMAL");

  // Run schema
  const schemaPath = path.join(__dirname, "schema.sql");
  // Fallback: read from same directory as this file
  const schemaFile = fs.existsSync(schemaPath)
    ? schemaPath
    : path.join(process.cwd(), "lib/db/schema.sql");
  const schema = fs.readFileSync(schemaFile, "utf-8");
  _db.exec(schema);

  return _db;
}

export function upsertAgentSnapshot(
  agentId: string,
  data: {
    name?: string;
    model?: string;
    status?: string;
    totalTokens?: number;
    sessionCount?: number;
    messageCount?: number;
    avgResponseMs?: number;
  }
) {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  db.prepare(
    `INSERT INTO agent_snapshots (agent_id, name, model, status, total_tokens, session_count, message_count, avg_response_ms, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_id, captured_at) DO UPDATE SET
       name=excluded.name, model=excluded.model, status=excluded.status,
       total_tokens=excluded.total_tokens, session_count=excluded.session_count,
       message_count=excluded.message_count, avg_response_ms=excluded.avg_response_ms`
  ).run(
    agentId,
    data.name || null,
    data.model || null,
    data.status || "unknown",
    data.totalTokens || 0,
    data.sessionCount || 0,
    data.messageCount || 0,
    data.avgResponseMs || 0,
    now
  );
}

export function upsertTokenUsage(
  agentId: string,
  date: string,
  inputTokens: number,
  outputTokens: number
) {
  const db = getDb();
  db.prepare(
    `INSERT INTO token_usage (agent_id, date, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(agent_id, date) DO UPDATE SET
       input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens`
  ).run(agentId, date, inputTokens, outputTokens);
}

export function insertGatewayHealth(status: string, channelsJson: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO gateway_health (status, channels_json) VALUES (?, ?)`
  ).run(status, channelsJson);
  // Keep only last 1000 records
  db.prepare(
    `DELETE FROM gateway_health WHERE id NOT IN (SELECT id FROM gateway_health ORDER BY id DESC LIMIT 1000)`
  ).run();
}

export function getAgentHistory(agentId: string, days: number = 7) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM agent_snapshots
       WHERE agent_id = ? AND captured_at >= datetime('now', ?)
       ORDER BY captured_at ASC`
    )
    .all(agentId, `-${days} days`);
}

export function getTokenHistory(agentId: string, days: number = 30) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM token_usage
       WHERE agent_id = ? AND date >= date('now', ?)
       ORDER BY date ASC`
    )
    .all(agentId, `-${days} days`);
}

export function getRecentHealth(limit: number = 50) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM gateway_health ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
}
