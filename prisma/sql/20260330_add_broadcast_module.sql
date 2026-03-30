CREATE TABLE IF NOT EXISTS broadcast_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_list_members (
  id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
  client_phone VARCHAR(20) NOT NULL,
  client_name VARCHAR(255),
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(list_id, client_phone)
);

CREATE TABLE IF NOT EXISTS broadcast_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  list_id INTEGER NOT NULL REFERENCES broadcast_lists(id) ON DELETE RESTRICT,
  status VARCHAR(20) DEFAULT 'draft',
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_logs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  client_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_members_list_id
  ON broadcast_list_members(list_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status_scheduled_at
  ON broadcast_campaigns(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_campaign_id_status
  ON broadcast_logs(campaign_id, status);
