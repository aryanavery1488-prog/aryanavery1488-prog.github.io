CREATE TABLE IF NOT EXISTS visitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  page TEXT,
  occurred_at TEXT NOT NULL,
  duration_ms INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(visitor_id) REFERENCES visitors(visitor_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_time
ON visitor_events(visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_time
ON visitor_events(occurred_at DESC);
