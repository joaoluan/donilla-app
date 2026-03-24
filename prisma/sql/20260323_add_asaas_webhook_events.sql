CREATE TABLE IF NOT EXISTS asaas_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_name VARCHAR(120) NOT NULL,
  checkout_id VARCHAR(255),
  payload JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'recebido',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro VARCHAR(1000),
  recebido_em TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMP(6)
);
