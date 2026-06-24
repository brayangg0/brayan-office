import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export async function ensureDatabaseCompatibility(): Promise<void> {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AIAutoResponse"
    ADD COLUMN IF NOT EXISTS "qaRules" TEXT NOT NULL DEFAULT '[]'
  `);
}
