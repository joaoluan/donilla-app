ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS estoque_disponivel INTEGER;
