ALTER TABLE itens_pedido
  ADD COLUMN IF NOT EXISTS nome_snapshot VARCHAR(150);

UPDATE itens_pedido AS ip
SET nome_snapshot = p.nome_doce
FROM produtos AS p
WHERE ip.produto_id = p.id
  AND ip.nome_snapshot IS NULL;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS asaas_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pago_em TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMP(6);

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_id_transacao_gateway_unique_idx
  ON pedidos (id_transacao_gateway)
  WHERE id_transacao_gateway IS NOT NULL;

ALTER TABLE asaas_webhook_events
  ADD COLUMN IF NOT EXISTS pedido_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asaas_webhook_events_pedido_id_fkey'
  ) THEN
    ALTER TABLE asaas_webhook_events
      ADD CONSTRAINT asaas_webhook_events_pedido_id_fkey
      FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE asaas_webhook_events AS awe
SET pedido_id = p.id
FROM pedidos AS p
WHERE awe.checkout_id = p.id_transacao_gateway
  AND awe.pedido_id IS NULL;
