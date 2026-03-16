# donilla

## Rotas web

- `/`: loja principal para clientes
- `/loja`: alias da loja principal
- `/admin`: painel administrativo
- `/catalogo`: fluxo legado de catálogo/carrinho
- `/site` e `/cliente`: aliases legados com redirecionamento para `/`

## Rotas de API

- `/public/*`: catálogo, loja, autenticação do cliente e pedidos
- `/auth/*`: autenticação administrativa
- `/admin/*`: dashboard, pedidos e configuração da operação
- `/categorias`, `/produtos`, `/usuarios`: gestão interna

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
