CREATE TABLE IF NOT EXISTS pedidos_auditoria (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  origem VARCHAR(50) NOT NULL DEFAULT 'system',
  ator VARCHAR(120),
  acao VARCHAR(80) NOT NULL,
  status_pagamento_anterior VARCHAR(50),
  status_pagamento_atual VARCHAR(50),
  status_entrega_anterior VARCHAR(50),
  status_entrega_atual VARCHAR(50),
  detalhes JSONB,
  criado_em TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pedidos_auditoria_pedido_id_criado_em_idx
  ON pedidos_auditoria (pedido_id, criado_em);
