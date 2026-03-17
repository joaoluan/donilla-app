# API Contract - Donilla Backend

Base URL: `http://localhost:3000`
Auth header: `Authorization: Bearer <accessToken>`
Formato padrão:
- sucesso: `{ "success": true, "data": ..., "meta": ...? }`
- erro: `{ "success": false, "error": { "message": "...", "details": ...? } }`

## 1) Public (site de clientes)

### GET `/public/store`
Retorna configuração pública da loja e a tabela ativa de taxas por local.

Observação: os campos privados de integração do bot WhatsApp não são expostos aqui.

Resposta:
```json
{
  "success": true,
  "data": {
    "id": 3,
    "loja_aberta": true,
    "tempo_entrega_minutos": 40,
    "tempo_entrega_max_minutos": 60,
    "taxa_entrega_padrao": "0",
    "mensagem_aviso": null,
    "taxas_entrega_locais": [
      {
        "id": 1,
        "bairro": "Centro",
        "cidade": null,
        "valor_entrega": "8.00",
        "ativo": true
      },
      {
        "id": 2,
        "bairro": null,
        "cidade": "Sapiranga",
        "valor_entrega": "40.00",
        "ativo": true
      }
    ]
  }
}
```

### GET `/public/menu`
Retorna categorias com produtos ativos.

Resposta:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nome": "Bolos de Pote",
      "ordem_exibicao": 1,
      "produtos": [
        {
          "id": 1,
          "categoria_id": 1,
          "nome_doce": "Bolo de Pote Ninho com Nutella",
          "descricao": "...",
          "preco": "18.9",
          "imagem_url": null,
          "ativo": true
        }
      ]
    }
  ]
}
```

### POST `/public/orders`
Cria pedido no site.

Request:
```json
{
  "cliente_session_token": "<token>" ,
  "endereco": {
    "rua": "Rua A",
    "numero": "10",
    "bairro": "Centro",
    "cidade": "Novo Hamburgo",
    "complemento": "Apto 1",
    "referencia": "Portão azul"
  },
  "observacoes": "Tirar granulado",
  "metodo_pagamento": "pix",
  "itens": [
    { "produto_id": 1, "quantidade": 2 },
    { "produto_id": 2, "quantidade": 1 }
  ]
}
```

O token é retornado no fluxo:
- POST `/public/customer/login`
- POST `/public/customer/register`

### POST `/public/customer/register`
Cria conta de cliente e devolve a sessão autenticada.

Request:
```json
{
  "nome": "Cliente Site",
  "telefone_whatsapp": "5511999990001",
  "senha": "1234",
  "endereco": {
    "rua": "Rua A",
    "numero": "10",
    "bairro": "Centro",
    "cidade": "Novo Hamburgo"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "cliente_session_token": "...",
    "has_endereco": true,
    "endereco": {
      "rua": "Rua A",
      "numero": "10",
      "bairro": "Centro",
      "cidade": "Novo Hamburgo",
      "complemento": "Apto 1",
      "referencia": "Portão azul"
    },
    "cliente": {
      "nome": "Cliente Site",
      "telefone_whatsapp": "5511999990001"
    }
  }
}
```

### POST `/public/customer/login`
Autentica um cliente já cadastrado.

Request:
```json
{
  "telefone_whatsapp": "5511999990001",
  "senha": "1234"
}
```

### PUT `/public/customer/profile`
Atualiza nome e/ou endereço do cliente autenticado por sessão.

### GET `/public/customer/orders`
Lista pedidos do cliente autenticado por sessão.

Authorization: `Bearer <cliente_session_token>`

### GET `/public/customer/orders/:id`
Busca um pedido específico do cliente autenticado por sessão.

Resposta:
```json
{
  "success": true,
  "data": {
    "id": 4,
    "status_entrega": "pendente",
    "status_pagamento": "pendente",
    "valor_total": "53.3",
    "criado_em": "2026-02-26T03:50:24.176Z"
  }
}
```

### GET `/public/orders/:id`
Consulta status do pedido.

## 2) Auth

### POST `/auth/login`
Request:
```json
{ "username": "admin", "password": "admin123" }
```

Resposta:
```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "accessTokenType": "Bearer",
    "accessExpiresIn": 3600,
    "refreshToken": "<opaque-token>",
    "refreshExpiresIn": 604800,
    "user": { "id": 1, "username": "admin", "role": "admin" }
  }
}
```

### POST `/auth/refresh`
Request:
```json
{ "refreshToken": "<opaque-token>" }
```

### POST `/auth/logout`
Request:
```json
{ "refreshToken": "<opaque-token>" }
```

### GET `/auth/me` (Bearer)
Resposta:
```json
{
  "success": true,
  "data": {
    "user": { "id": "1", "username": "admin", "role": "admin" }
  }
}
```

## 3) Admin (painel da loja) - requer `role=admin`

### GET `/admin/dashboard`
KPIs de pedidos/faturamento.

### GET `/admin/orders`
Lista pedidos com cliente, endereço, itens e `observacoes`.

### PUT `/admin/orders/:id/status`
Request:
```json
{
  "status_entrega": "preparando",
  "status_pagamento": "pago"
}
```
Campos opcionais:
- `status_entrega`: `pendente`, `preparando`, `saiu_para_entrega`, `entregue`, `cancelado`
- `status_pagamento`: `pendente`, `pago`, `falhou`, `cancelado`, `estornado`

Quando a integração WhatsApp estiver ativa, a rota dispara um evento `order.status_updated` para o bot apenas se o `status_entrega` mudar.

### GET `/admin/store-settings`
Retorna configurações operacionais e a configuração atual do bot WhatsApp.

Campos extras:
- `whatsapp_ativo`
- `whatsapp_webhook_url`
- `whatsapp_webhook_secret`
- `whatsapp_mensagem_novo_pedido`
- `whatsapp_mensagem_status`

### PUT `/admin/store-settings`
Atualiza configuração operacional e/ou a integração do bot.

Exemplo:
```json
{
  "loja_aberta": true,
  "tempo_entrega_minutos": 40,
  "tempo_entrega_max_minutos": 60,
  "whatsapp_ativo": true,
  "whatsapp_webhook_url": "https://bot.seudominio.com/webhooks/donilla",
  "whatsapp_webhook_secret": "segredo-opcional",
  "whatsapp_mensagem_novo_pedido": "Oi {cliente_nome}! Recebemos seu pedido #{pedido_id}.",
  "whatsapp_mensagem_status": "Oi {cliente_nome}! Seu pedido #{pedido_id} agora esta como {status_entrega_label}."
}
```

### POST `/admin/whatsapp/test`
Dispara uma mensagem de teste para validar a integração do bot sem precisar criar um pedido real.

Request:
```json
{
  "telefone_whatsapp": "5511999990001",
  "nome": "Cliente Teste"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "ok": true,
    "delivered": true,
    "telefone_whatsapp": "5511999990001"
  }
}
```

### POST `/admin/whatsapp/session/start`
Pede ao WPPConnect para iniciar a sessão configurada.

### GET `/admin/whatsapp/session/status`
Consulta o status atual da sessão no WPPConnect.

### GET `/admin/whatsapp/session/qrcode`
Busca o QR Code atual da sessão para parear o WhatsApp.

## 4) Webhook WhatsApp

### GET `/whatsapp/webhook`
Endpoint simples de verificação do webhook do WPPConnect.

Query esperada:
- `token=<WPP_WEBHOOK_TOKEN>` opcional, se configurado

Resposta:
- texto puro com `ok`

### POST `/whatsapp/webhook`
Recebe eventos do WPPConnect.

Comportamentos atuais:
- responde clientes que enviarem `status 123`
- responde clientes que enviarem `pedido 123`
- responde clientes que enviarem `ultimo pedido`

### GET `/admin/store-settings`
Configuração da loja.

### PUT `/admin/store-settings`
Request (campos opcionais):
```json
{
  "loja_aberta": true,
  "tempo_entrega_minutos": 40,
  "tempo_entrega_max_minutos": 60,
  "taxa_entrega_padrao": 5.0,
  "mensagem_aviso": "Sem entregas em dias de chuva forte."
}
```

### GET `/admin/delivery-fees`
Lista taxas de entrega cadastradas.

### POST `/admin/delivery-fees`
Cria uma taxa de entrega.

Request:
```json
{
  "bairro": "Centro",
  "cidade": "Novo Hamburgo",
  "valor_entrega": 8.0,
  "ativo": true
}
```

Para cidade inteira, envie `"bairro": null`.

### PUT `/admin/delivery-fees/:id`
Atualiza bairro, cidade, valor e/ou status da taxa.

### DELETE `/admin/delivery-fees/:id`
Remove uma taxa cadastrada.

## 4) Gestão de usuários - requer `role=admin`

### GET `/usuarios`
Query params:
- `page`, `pageSize`
- `search`
- `role` (`admin`|`user`)
- `ativo` (`true`|`false`)
- `sort` (`id`|`username`|`criado_em`)
- `order` (`asc`|`desc`)

### POST `/usuarios`
Request:
```json
{
  "username": "operador",
  "password": "senha123",
  "role": "user",
  "ativo": true
}
```

### PUT `/usuarios/:id`
Request (campos opcionais):
```json
{
  "username": "operador2",
  "role": "admin",
  "ativo": true
}
```

### DELETE `/usuarios/:id`
Remoção lógica (`ativo=false`) + revogação de sessões.

### POST `/usuarios/:id/reset-password`
Request:
```json
{ "password": "novaSenha123" }
```

## 5) Catálogo (mantido) - leitura pública, escrita admin

### GET `/categorias`
Query params:
- `page`, `pageSize`, `search`, `sort`, `order`

### POST `/categorias` (admin)
```json
{ "nome": "Tortas", "ordem_exibicao": 2 }
```

### PUT `/categorias/:id` (admin)
### DELETE `/categorias/:id` (admin)

### GET `/produtos`
Query params:
- `page`, `pageSize`, `search`, `sort`, `order`, `categoria_id`, `ativo`

### POST `/produtos` (admin)
```json
{
  "categoria_id": 1,
  "nome_doce": "Bolo de Pote",
  "preco": 18.9,
  "descricao": "..."
}
```

### PUT `/produtos/:id` (admin)
### DELETE `/produtos/:id` (admin)

## 6) Códigos comuns
- `400` dados inválidos
- `401` token ausente/inválido
- `403` sem permissão
- `404` recurso não encontrado
- `409` conflito (ex.: username duplicado)
