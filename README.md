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

## Smoke test do catalogo

Com a aplicacao rodando localmente, voce pode validar o fluxo basico de `/catalogo` com Playwright:

```bash
cd /home/donilla/donilla-app
npm run smoke:catalog
```

O comando usa o container oficial do Playwright, entao nao depende das bibliotecas do browser instaladas na VPS.

Opcoes uteis:

- `SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:catalog`
- `SMOKE_PATH=/catalogo npm run smoke:catalog`
- `PLAYWRIGHT_VERSION=1.58.2 npm run smoke:catalog`

## Validacao predeploy

Para validar o app inteiro antes de deploy com um comando so:

```bash
cd /home/donilla/donilla-app
npm run validate:predeploy
```

Esse runner:

- sobe uma instancia temporaria do backend em `http://127.0.0.1:3100` usando o codigo atual
- reaproveita as credenciais do container `donilla-backend` quando ele estiver disponivel
- roda `npm test`
- roda os smokes de `catalogo`, `disparos` e `Flow Builder`

Opcoes uteis:

- `PREDEPLOY_BASE_URL=http://127.0.0.1:3000 npm run validate:predeploy`
- `PREDEPLOY_ADMIN_USERNAME=admin PREDEPLOY_ADMIN_PASSWORD=senha npm run validate:predeploy`
- `PREDEPLOY_TEMP_APP_PORT=3200 npm run validate:predeploy`

Referencia de variaveis:

- `.env.example` documenta os nomes esperados pelo app
- o Bitwarden e a fonte real dos valores de producao
- `docker-compose.yml` exige `ASAAS_ENVIRONMENT` explicitamente; nao existe mais fallback implicito para `sandbox`

Para novas configuracoes de ambiente, o fluxo continua o mesmo:

- adicionar o nome da variavel em `docker-compose.yml`
- registrar o nome em `.env.example` como referencia
- salvar o valor real no Bitwarden usado por `secrets-vault/bitwarden`

## CORS em producao

O backend agora suporta CORS por allowlist para quando frontend e API ficam em origins diferentes.

Exemplos:

- frontend em `https://app.seudominio.com`
- admin em `https://admin.seudominio.com`
- backend em `https://api.seudominio.com`

Nesses casos, salve no Bitwarden as variaveis abaixo, porque o `docker-compose.yml` ja encaminha todas elas para o container:

- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOW_CREDENTIALS`
- `CORS_ALLOWED_METHODS`
- `CORS_ALLOWED_HEADERS`
- `CORS_EXPOSE_HEADERS`
- `CORS_MAX_AGE_SECONDS`

Configuracao minima recomendada:

- `CORS_ALLOWED_ORIGINS=https://app.seudominio.com,https://admin.seudominio.com`
- `CORS_ALLOW_CREDENTIALS` vazio quando o frontend usa token Bearer no header `Authorization`

Use `CORS_ALLOW_CREDENTIALS=1` apenas se o navegador precisar enviar cookies cross-origin com `credentials: include`.

Se frontend e backend estiverem no mesmo origin publico, pode deixar CORS vazio.

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

## Tempo real no admin

O painel admin usa SSE para refletir novo pedido em tempo real nas telas de resumo e pedidos.

Fluxo atual:

- o backend publica `order.created` quando um pedido e criado com sucesso
- clientes admin autenticados escutam o stream em `GET /admin/events`
- ao receber o evento, o frontend recarrega resumo, fila operacional e pedidos

Observacao importante:

- esta primeira versao usa broker em memoria dentro do processo Node
- em uma unica instancia do app isso funciona bem
- se o projeto passar a rodar com multiplos containers, replicas ou processos, o proximo passo e trocar a publicacao por um barramento compartilhado, como Redis Pub/Sub, NATS ou Kafka, para que o SSE continue consistente entre instancias

## Asaas Checkout

O checkout online agora pode ser iniciado pelo backend da Donilla usando o Asaas.

Fluxo implementado:

- `POST /api/checkout/create` com `metodo_pagamento: "asaas_checkout"`
- backend cria o pedido local
- backend cria o checkout no Asaas
- resposta devolve `checkout_url`, `id_transacao_gateway` e `tracking_path`
- frontend redireciona o cliente para o checkout hospedado
- `POST /api/webhooks/asaas` valida `asaas-access-token`, registra `event.id`, responde `200` rapido e processa em segundo plano
- `GET /api/orders/:id` devolve o detalhe do pedido do cliente
- `GET /api/orders/:id/status` devolve o status resumido do pedido do cliente
- `GET /public/orders/:id/tracking?token=...` devolve o status publico do pedido para a pagina `/pedido/:id`
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

- pedido criado: o backend notifica o cliente e pode incluir o link de acompanhamento
- status atualizado no painel: o backend notifica o cliente
- mensagens recebidas no WhatsApp: o bot responde `status 123`, `pedido 123` e `ultimo pedido`
- campanhas de disparo: o sistema envia uma saudacao randômica, espera a resposta do cliente por ate 24h e so entao libera a mensagem principal
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
    "valor_total": "R$ 49,90",
    "pedido_tracking_url": "https://seu-dominio.com/pedido/15?token=abc123",
    "pedido_tracking_callout": "Acompanhe seu pedido: https://seu-dominio.com/pedido/15?token=abc123"
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
- `prisma/sql/20260330_add_order_tracking_token.sql`
- `prisma/sql/20260330_add_broadcast_module.sql`
- `prisma/sql/20260330_add_broadcast_human_behavior.sql`
- `prisma/sql/20260410_add_soft_delete_produtos_categorias.sql`
