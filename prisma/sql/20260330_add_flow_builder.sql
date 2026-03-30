CREATE TABLE IF NOT EXISTS bot_flows (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  trigger_keyword VARCHAR(100) NOT NULL,
  flow_json JSONB NOT NULL,
  canvas_json JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'draft',
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_flow_sessions (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  flow_id INTEGER REFERENCES bot_flows(id) ON DELETE CASCADE,
  current_node_id VARCHAR(100),
  waiting_for VARCHAR(50),
  context_data JSONB DEFAULT '{}'::jsonb,
  last_activity TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS bot_tags JSONB DEFAULT '[]'::jsonb;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS bot_handoff_active BOOLEAN DEFAULT FALSE;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS bot_handoff_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_flow_sessions_phone
  ON client_flow_sessions(phone);

CREATE INDEX IF NOT EXISTS idx_flows_status
  ON bot_flows(status);

CREATE INDEX IF NOT EXISTS idx_flows_trigger
  ON bot_flows(trigger_keyword);

CREATE INDEX IF NOT EXISTS idx_clientes_bot_handoff_active
  ON clientes(bot_handoff_active);
