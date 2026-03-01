CREATE TABLE IF NOT EXISTS agent_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  name TEXT,
  model TEXT,
  status TEXT DEFAULT 'unknown',
  total_tokens INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  captured_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agent_id, captured_at)
);

CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  date TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  UNIQUE(agent_id, date)
);

CREATE TABLE IF NOT EXISTS gateway_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  channels_json TEXT,
  checked_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON agent_snapshots(agent_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_tokens_date ON token_usage(agent_id, date);
