import { PrismaClient } from '../generated/prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function pgPoolConnectionString(value: string | undefined): string | undefined {
  if (!value) return value
  const url = new URL(value)
  url.searchParams.delete('sslmode')
  return url.toString()
}

const connectionString = pgPoolConnectionString(process.env.DATABASE_URL)
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
const adapter = new PrismaPg(pool)

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
