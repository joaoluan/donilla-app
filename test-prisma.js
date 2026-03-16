require('dotenv').config()

async function main() {
  let prisma
  const databaseUrl = process.env.DATABASE_URL || ''
  const isPrismaProtocol =
    databaseUrl.startsWith('prisma://') ||
    databaseUrl.startsWith('prisma+postgres://')

  console.log('Iniciando teste de conexao Prisma...')
  console.log(`- DATABASE_URL definida: ${databaseUrl ? 'sim' : 'nao'}`)
  console.log(`- Tipo de URL: ${isPrismaProtocol ? 'prisma/accelerate' : 'postgresql direta'}`)

  prisma = require('./src/config/prisma')

  try {
    const result = await prisma.$queryRawUnsafe('SELECT 1 as ok')
    const categorias = await prisma.categorias.findMany({
      take: 3,
      select: { id: true, nome: true },
      orderBy: { id: 'asc' },
    })
    const produtos = await prisma.produtos.findMany({
      take: 3,
      select: { id: true, nome_doce: true, estoque_disponivel: true },
      orderBy: { id: 'asc' },
    })

    console.log('Conexao com banco OK.')
    console.log('Resultado do teste:', result)
    console.log('Categorias (ate 3):', categorias)
    console.log('Produtos (ate 3):', produtos)
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error('Falha no teste de conexao Prisma.')
    console.error('Motivo:', error.message || error)
  })
