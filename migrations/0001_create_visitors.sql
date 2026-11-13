CREATE TABLE IF NOT EXISTS visitors (
  visitor_id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 1 CHECK (visits >= 1),
  ip_address TEXT,
  user_agent TEXT,
  page TEXT,
  referrer TEXT,
  language TEXT,
  timezone TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  notice_shown INTEGER NOT NULL DEFAULT 0 CHECK (notice_shown IN (0, 1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  retention_expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen
  ON visitors(last_seen DESC, visitor_id DESC);

CREATE INDEX IF NOT EXISTS idx_visitors_retention
  ON visitors(retention_expires_at);
