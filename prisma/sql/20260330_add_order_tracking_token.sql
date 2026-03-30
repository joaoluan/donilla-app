ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS tracking_token VARCHAR(64);

UPDATE public.pedidos
SET tracking_token = md5(id::text || '-' || coalesce(id_transacao_gateway, '') || '-' || clock_timestamp()::text)
WHERE tracking_token IS NULL;

ALTER TABLE public.pedidos
ALTER COLUMN tracking_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_tracking_token_unique_idx
ON public.pedidos (tracking_token);
