const { PrismaClient } = require('@prisma/client')

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL não definida no ambiente.')
}

function createPrismaClient() {
  if (
    databaseUrl.startsWith('prisma://') ||
    databaseUrl.startsWith('prisma+postgres://')
  ) {
    return new PrismaClient({ accelerateUrl: databaseUrl })
  }

  try {
    const { PrismaPg } = require('@prisma/adapter-pg')
    const adapter = new PrismaPg({ connectionString: databaseUrl })
    return new PrismaClient({ adapter })
  } catch {
    throw new Error(
      'Prisma 7 com PostgreSQL direto exige @prisma/adapter-pg. ' +
        'Instale: npm install @prisma/adapter-pg pg',
    )
  }
}

const prisma = createPrismaClient()

module.exports = prisma
