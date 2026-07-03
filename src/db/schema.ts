export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'responder' CHECK (role IN ('admin', 'responder')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  slack_user_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS escalation_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  repeat_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS escalation_levels (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES escalation_policies(id) ON DELETE CASCADE,
  level_index INTEGER NOT NULL,
  timeout_minutes INTEGER NOT NULL DEFAULT 30,
  UNIQUE (policy_id, level_index)
);

CREATE TABLE IF NOT EXISTS escalation_targets (
  id TEXT PRIMARY KEY,
  level_id TEXT NOT NULL REFERENCES escalation_levels(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'schedule')),
  target_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_layers (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Layer 1',
  position INTEGER NOT NULL DEFAULT 1,
  rotation_type TEXT NOT NULL CHECK (rotation_type IN ('daily', 'weekly', 'custom')),
  shift_length_hours REAL,
  handoff_time TEXT NOT NULL DEFAULT '09:00',
  anchor_date TEXT NOT NULL,
  restriction_start TEXT,
  restriction_end TEXT
);

CREATE TABLE IF NOT EXISTS schedule_layer_users (
  layer_id TEXT NOT NULL REFERENCES schedule_layers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (layer_id, position)
);

CREATE TABLE IF NOT EXISTS schedule_overrides (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  escalation_policy_id TEXT REFERENCES escalation_policies(id) ON DELETE SET NULL,
  slack_channel_id TEXT,
  default_urgency TEXT NOT NULL DEFAULT 'high' CHECK (default_urgency IN ('high', 'low')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_integrations (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  routing_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  urgency TEXT NOT NULL DEFAULT 'high' CHECK (urgency IN ('high', 'low')),
  status TEXT NOT NULL DEFAULT 'triggered' CHECK (status IN ('triggered', 'acknowledged', 'resolved')),
  source TEXT,
  dedup_key TEXT,
  alert_count INTEGER NOT NULL DEFAULT 1,
  escalation_policy_id TEXT,
  escalation_level INTEGER NOT NULL DEFAULT 1,
  escalation_repeats_done INTEGER NOT NULL DEFAULT 0,
  next_escalation_at TEXT,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_open_dedup
  ON incidents (service_id, dedup_key)
  WHERE status != 'resolved' AND dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_next_escalation ON incidents (next_escalation_at)
  WHERE next_escalation_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS incident_assignments (
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (incident_id, user_id)
);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_user_id TEXT,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events (incident_id, created_at);

CREATE TABLE IF NOT EXISTS incident_messages (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'dm'))
);

CREATE INDEX IF NOT EXISTS idx_incident_messages_incident ON incident_messages (incident_id);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;
