ALTER TABLE public.configuracoes_loja
ADD COLUMN IF NOT EXISTS tempo_entrega_max_minutos INTEGER;

ALTER TABLE public.configuracoes_loja
ALTER COLUMN tempo_entrega_max_minutos SET DEFAULT 60;

UPDATE public.configuracoes_loja
SET tempo_entrega_max_minutos = 60
WHERE tempo_entrega_max_minutos IS NULL;
