ALTER TABLE public.configuracoes_loja
  ADD COLUMN IF NOT EXISTS whatsapp_ativo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_secret VARCHAR(255),
  ADD COLUMN IF NOT EXISTS whatsapp_mensagem_novo_pedido VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS whatsapp_mensagem_status VARCHAR(1000);
