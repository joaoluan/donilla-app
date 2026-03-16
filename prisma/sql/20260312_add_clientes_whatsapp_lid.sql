ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS whatsapp_lid VARCHAR(40);

CREATE UNIQUE INDEX IF NOT EXISTS clientes_whatsapp_lid_key
ON public.clientes (whatsapp_lid);
