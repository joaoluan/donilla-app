# donilla

## Ambiente

Neste projeto, o ambiente de producao nao deve depender de `.env` fixo em disco.

- producao: segredos vindos do Bitwarden via `secrets-vault/bitwarden`
- desenvolvimento local: copie `.env.example` para `.env` e ajuste os valores locais

Fluxo operacional atual de producao:

```bash
cd /home/donilla/secrets-vault/bitwarden
./deploy-service-from-bws.sh donilla-app
```

Para rebuildar apenas o container do backend do `donilla-app`:

```bash
cd /home/donilla/secrets-vault/bitwarden
./deploy-service-from-bws.sh donilla-app --build
```

Referencia de variaveis:

- `.env.example` documenta os nomes esperados pelo app
- o Bitwarden e a fonte real dos valores de producao
- `docker-compose.yml` exige `ASAAS_ENVIRONMENT` explicitamente; nao existe mais fallback implicito para `sandbox`

## Rotas web

- `/`: loja principal para clientes
- `/loja`: alias da loja principal
- `/admin`: painel administrativo
- `/catalogo`: fluxo legado de catálogo/carrinho
- `/site` e `/cliente`: aliases legados com redirecionamento para `/`

## Rotas de API

- `/api/*`: contrato canônico de checkout, pedidos e webhooks de pagamento
- `/public/*`: catálogo, loja, autenticação do cliente e pedidos
- `/auth/*`: autenticação administrativa
- `/admin/*`: dashboard, pedidos e configuração da operação
- `/webhooks/asaas`: retorno server-to-server do Asaas Checkout
- `/categorias`, `/produtos`, `/usuarios`: gestão interna

## Asaas Checkout

O checkout online agora pode ser iniciado pelo backend da Donilla usando o Asaas.

Fluxo implementado:

- `POST /api/checkout/create` com `metodo_pagamento: "asaas_checkout"`
- backend cria o pedido local
- backend cria o checkout no Asaas
- resposta devolve `checkout_url` e `id_transacao_gateway`
- frontend redireciona o cliente para o checkout hospedado
- `POST /api/webhooks/asaas` valida `asaas-access-token`, registra `event.id`, responde `200` rapido e processa em segundo plano
- `GET /api/orders/:id` devolve o detalhe do pedido do cliente
- `GET /api/orders/:id/status` devolve o status resumido do pedido do cliente
- `POST /api/checkout/:orderId/retry` recria checkout pendente do pedido
- `GET /admin/orders/:id/audit` devolve a trilha interna de auditoria do pedido para o painel admin

Compatibilidade:

- `POST /public/orders` continua ativo como alias legado
- `POST /webhooks/asaas` continua ativo como alias legado

Variáveis de ambiente do Asaas:

- `ASAAS_ACCESS_TOKEN` preferencial, com fallback legado para `ASAAS_API_KEY`
- `ASAAS_ENVIRONMENT=sandbox` ou `production`
- `ASAAS_WEBHOOK_TOKEN` preferencial, com fallback legado para `ASAAS_WEBHOOK_AUTH_TOKEN`
- `ASAAS_API_BASE_URL` opcional; por padrao o backend infere `https://api-sandbox.asaas.com/v3` ou `https://api.asaas.com/v3` conforme o ambiente
- `APP_URL` como URL publica canônica; `ASAAS_APP_BASE_URL` continua como override especifico do checkout
- `ASAAS_USER_AGENT` opcional para rastreabilidade da integracao; se ausente, o backend gera um valor padrao da Donilla
- `ASAAS_CHECKOUT_MINUTES_TO_EXPIRE` opcional
- `ASAAS_CHECKOUT_SUCCESS_URL`, `ASAAS_CHECKOUT_CANCEL_URL`, `ASAAS_CHECKOUT_EXPIRED_URL` opcionais

Regras de segredo e ambiente:

- `ASAAS_ACCESS_TOKEN` fica apenas no backend e nunca deve ir para `public/*`
- nao commitar `.env` nem guardar a chave em codigo-fonte
- em producao, nao recriar `.env` manualmente na pasta do servico
- nao logar a chave inteira; o backend agora sanitiza o detalhe bruto de erro do Asaas
- manter sandbox e producao separados
- se o prefixo da chave (`$aact_hmlg_` ou `$aact_prod_`) nao bater com `ASAAS_ENVIRONMENT`, o checkout e bloqueado
- as chamadas ao Asaas saem com `User-Agent` customizado para rastreabilidade
- pedidos agora registram auditoria de criacao, checkout, webhook e mudanca manual de status em `pedidos_auditoria`

Configuração do webhook no painel/API do Asaas:

- URL: `https://seu-dominio.com/api/webhooks/asaas`
- `authToken`: o mesmo valor salvo em `ASAAS_WEBHOOK_TOKEN` ou `ASAAS_WEBHOOK_AUTH_TOKEN`
- eventos mínimos: `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`

## Bot WhatsApp

O projeto agora tem um bot nativo de WhatsApp integrado ao WPPConnect Server.

Fluxos automáticos:

- pedido criado: o backend notifica o cliente
- status atualizado no painel: o backend notifica o cliente
- mensagens recebidas no WhatsApp: o bot responde `status 123`, `pedido 123` e `ultimo pedido`
- teste manual: o botão `Testar integracao` chama `POST /admin/whatsapp/test`

Configuração obrigatória no ambiente:

- `WPP_SERVER_URL`
- `WPP_SESSION_NAME`
- `WPP_SECRET_KEY`
- `APP_BASE_URL` ou `WPP_PUBLIC_WEBHOOK_URL`
- `WPP_WEBHOOK_TOKEN` opcional

Webhook usado pelo WPPConnect:

- `GET /whatsapp/webhook`
- `POST /whatsapp/webhook`

No painel admin existe suporte para:

- iniciar a sessão no WPPConnect
- consultar o status da sessão
- buscar o QR Code para parear o número
- testar o envio de mensagem

Payload interno que o backend usa para montar notificações:

```json
{
  "event": "order.created",
  "sent_at": "2026-03-11T12:00:00.000Z",
  "recipient": {
    "nome": "Cliente",
    "telefone_whatsapp": "5511999999999"
  },
  "message": "Oi Cliente! Recebemos seu pedido #15...",
  "variables": {
    "cliente_nome": "Cliente",
    "pedido_id": 15,
    "status_entrega_label": "Pendente",
    "valor_total": "R$ 49,90"
  },
  "order": {
    "id": 15
  }
}
```

Se você quiser manter um bot externo separado, o backend ainda aceita `whatsapp_webhook_url` e `whatsapp_webhook_secret` como fallback.

Antes de subir a API, aplique também:

- `prisma/sql/20260311_add_whatsapp_bot_settings.sql`
- `prisma/sql/20260312_add_clientes_whatsapp_lid.sql`
- `prisma/sql/20260323_add_asaas_webhook_events.sql`
- `prisma/sql/20260323_add_pedidos_auditoria.sql`
- `prisma/sql/20260325_add_store_hours_schedule.sql`
