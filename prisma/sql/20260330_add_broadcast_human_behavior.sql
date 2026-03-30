CREATE TABLE IF NOT EXISTS broadcast_interactions (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  log_id INTEGER NOT NULL UNIQUE REFERENCES broadcast_logs(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  client_name VARCHAR(255),
  greeting_message TEXT,
  main_message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'greeting_sent',
  last_message_sent_at TIMESTAMP,
  greeting_sent_at TIMESTAMP,
  reply_received_at TIMESTAMP,
  main_message_sent_at TIMESTAMP,
  expires_at TIMESTAMP,
  expired_at TIMESTAMP,
  completed_at TIMESTAMP,
  reply_message TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_interactions_campaign_id
  ON broadcast_interactions(campaign_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_interactions_status_expires_at
  ON broadcast_interactions(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_interactions_phone_status
  ON broadcast_interactions(phone_number, status);
