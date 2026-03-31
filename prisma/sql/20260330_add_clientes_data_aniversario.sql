ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS data_aniversario DATE;

CREATE INDEX IF NOT EXISTS idx_clientes_data_aniversario
  ON public.clientes (data_aniversario);
