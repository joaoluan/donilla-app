ALTER TABLE public.configuracoes_loja
  ADD COLUMN IF NOT EXISTS whatsapp_bot_pausado BOOLEAN DEFAULT FALSE;
