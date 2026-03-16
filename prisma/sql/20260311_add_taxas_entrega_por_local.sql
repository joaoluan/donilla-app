ALTER TABLE public.enderecos
ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);

CREATE TABLE IF NOT EXISTS public.taxas_entrega_locais (
  id SERIAL PRIMARY KEY,
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  valor_entrega NUMERIC(10, 2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.taxas_entrega_locais (bairro, cidade, valor_entrega)
SELECT data.bairro, data.cidade, data.valor_entrega
FROM (
  VALUES
    ('Kunz', NULL, 8.00),
    ('Hamburgo Velho', NULL, 8.00),
    ('Vila Nova', NULL, 8.00),
    ('Guarani', NULL, 8.00),
    ('Centro', NULL, 8.00),
    ('Mauá', NULL, 8.00),
    ('São José', NULL, 8.00),
    ('São Jorge', NULL, 8.00),
    ('Vila Rosa', NULL, 9.00),
    ('Operário', NULL, 9.00),
    ('Feevale', NULL, 9.00),
    ('Outlet', NULL, 10.00),
    ('Rio Branco', NULL, 10.00),
    ('Canudos 1', NULL, 10.00),
    ('Vila Diehl', NULL, 12.00),
    ('Redentora', NULL, 12.00),
    ('Rincão', NULL, 12.00),
    ('Primavera', NULL, 14.00),
    ('Rondônia', NULL, 14.00),
    ('Ouro Branco', NULL, 14.00),
    ('Ideal', NULL, 14.00),
    ('Industrial', NULL, 14.00),
    ('Canudos 2', NULL, 14.00),
    ('Petrópolis', NULL, 14.00),
    ('Imigrante Sul', 'Campo Bom', 14.00),
    ('Imigrante Norte', 'Campo Bom', 14.00),
    ('Industrial', 'Estância Velha', 15.00),
    ('Alpes do Vale', NULL, 15.00),
    ('Rincão dos Ilhéus', 'Estância Velha', 15.00),
    ('Roselândia', NULL, 17.00),
    ('Liberdade', NULL, 17.00),
    ('Boa Saúde', NULL, 17.00),
    ('Sol Nascente', 'Estância Velha', 17.00),
    ('Santo Afonso', NULL, 20.00),
    ('União', 'Estância Velha', 20.00),
    ('Integração Lomba Grande', NULL, 25.00),
    (NULL, 'Estância Velha', 25.00),
    (NULL, 'Campo Bom', 25.00),
    ('Travessão', 'Dois Irmãos', 25.00),
    ('Santos Dumont', 'São Leopoldo', 25.00),
    ('Scharlau', 'São Leopoldo', 25.00),
    (NULL, 'São Leopoldo', 35.00),
    ('Lomba Grande', NULL, 35.00),
    (NULL, 'Dois Irmãos', 35.00),
    (NULL, 'Ivoti', 35.00),
    (NULL, 'Sapiranga', 40.00),
    (NULL, 'Sapucaia do Sul', 45.00),
    (NULL, 'Portão', 45.00)
) AS data(bairro, cidade, valor_entrega)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.taxas_entrega_locais existing
  WHERE COALESCE(existing.bairro, '') = COALESCE(data.bairro, '')
    AND COALESCE(existing.cidade, '') = COALESCE(data.cidade, '')
    AND existing.valor_entrega = data.valor_entrega
);
