require('dotenv').config()

const prisma = require('./src/config/prisma')
const { createApp } = require('./src/server')
const { hashPassword } = require('./src/utils/password')

async function checkDatabaseConnection() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    console.log('Banco conectado com sucesso.')
    return true
  } catch (error) {
    console.error('Falha ao conectar no banco.')
    console.error('Motivo:', error.message || error)
    return false
  }
}

async function checkDatabaseSchema() {
  try {
    await prisma.$transaction([
      prisma.produtos.findMany({ take: 1 }),
      prisma.enderecos.findMany({ take: 1, select: { cidade: true } }),
      prisma.configuracoes_loja.findMany({
        take: 1,
        select: {
          tempo_entrega_max_minutos: true,
          whatsapp_ativo: true,
        },
      }),
      prisma.taxas_entrega_locais.findMany({ take: 1 }),
      prisma.pedidos.findMany({ take: 1, select: { observacoes: true } }),
      prisma.clientes.findMany({ take: 1, select: { whatsapp_lid: true } }),
      prisma.asaas_webhook_events.findMany({ take: 1, select: { event_id: true } }),
      prisma.pedidos_auditoria.findMany({ take: 1, select: { id: true } }),
    ])
    console.log('Schema do banco validado com sucesso.')
    return true
  } catch (error) {
    if (error?.code === 'P2022') {
      console.error('Falha ao validar o schema do banco.')
      console.error(
        'Motivo: tabela/coluna ausente. Aplique as atualizacoes SQL em prisma/sql/20260311_add_produtos_estoque_disponivel.sql, prisma/sql/20260311_add_taxas_entrega_por_local.sql, prisma/sql/20260311_add_tempo_entrega_max_minutos.sql, prisma/sql/20260311_add_pedidos_observacoes.sql, prisma/sql/20260311_add_whatsapp_bot_settings.sql, prisma/sql/20260312_add_clientes_whatsapp_lid.sql, prisma/sql/20260323_add_asaas_webhook_events.sql e prisma/sql/20260323_add_pedidos_auditoria.sql',
      )
      return false
    }

    console.error('Falha ao validar o schema do banco.')
    console.error('Motivo:', error.message || error)
    return false
  }
}

async function ensureDefaultUsers() {
  const adminUser = process.env.AUTH_ADMIN_USER || process.env.AUTH_USER
  const adminPass = process.env.AUTH_ADMIN_PASSWORD || process.env.AUTH_PASSWORD
  const appUser = process.env.AUTH_APP_USER
  const appPass = process.env.AUTH_APP_PASSWORD

  if (!adminUser || !adminPass) {
    throw new Error(
      'Credenciais de admin nao configuradas. Defina AUTH_ADMIN_USER e AUTH_ADMIN_PASSWORD (ou AUTH_USER e AUTH_PASSWORD).',
    )
  }

  if ((appUser && !appPass) || (!appUser && appPass)) {
    throw new Error('Para criar usuario app padrao, configure AUTH_APP_USER e AUTH_APP_PASSWORD juntos.')
  }

  const defaults = [{ username: adminUser, password: adminPass, role: 'admin' }]

  if (appUser && appPass) {
    defaults.push({ username: appUser, password: appPass, role: 'user' })
  }

  for (const user of defaults) {
    const exists = await prisma.usuarios.findUnique({ where: { username: user.username } })
    if (!exists) {
      await prisma.usuarios.create({
        data: {
          username: user.username,
          password_hash: hashPassword(user.password),
          role: user.role,
          ativo: true,
        },
      })
      console.log(`Usuario padrao criado: ${user.username} (${user.role})`)
    }
  }
}

async function bootstrap() {
  const isConnected = await checkDatabaseConnection()

  if (!isConnected) {
    process.exitCode = 1
    return
  }

  const isSchemaValid = await checkDatabaseSchema()
  if (!isSchemaValid) {
    process.exitCode = 1
    return
  }

  await ensureDefaultUsers()

  const port = Number(process.env.PORT || 3000)
  const host = process.env.HOST || '0.0.0.0'
  const server = createApp(prisma)

  server.listen(port, host, () => {
    const hostLabel = host === '0.0.0.0' ? 'localhost' : host
    console.log(`API rodando em http://${hostLabel}:${port}`)
    console.log('Rotas: /public/*, /auth/*, /admin/*, /categorias, /produtos, /usuarios')
  })

  const shutdown = async () => {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (require.main === module) {
  bootstrap()
    .catch((error) => {
      console.error('Erro inesperado no bootstrap.')
      console.error('Motivo:', error.message || error)
      process.exitCode = 1
    })
}

module.exports = { checkDatabaseConnection }
