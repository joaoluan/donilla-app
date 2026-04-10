ALTER TABLE public.categorias
ADD COLUMN IF NOT EXISTS removido_em TIMESTAMP(6);

ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS removido_em TIMESTAMP(6);

CREATE INDEX IF NOT EXISTS categorias_removido_em_idx
ON public.categorias (removido_em);

CREATE INDEX IF NOT EXISTS produtos_removido_em_idx
ON public.produtos (removido_em);

CREATE INDEX IF NOT EXISTS produtos_categoria_id_removido_em_idx
ON public.produtos (categoria_id, removido_em);
