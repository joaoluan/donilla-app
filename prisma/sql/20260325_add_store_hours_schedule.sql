ALTER TABLE public.configuracoes_loja
  ADD COLUMN IF NOT EXISTS horario_automatico_ativo boolean DEFAULT false;

ALTER TABLE public.configuracoes_loja
  ADD COLUMN IF NOT EXISTS horario_funcionamento jsonb;

UPDATE public.configuracoes_loja
SET horario_automatico_ativo = COALESCE(horario_automatico_ativo, false)
WHERE horario_automatico_ativo IS NULL;
