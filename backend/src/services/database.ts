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
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AIAutoResponse"
    ADD COLUMN IF NOT EXISTS "closingEnabled" BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AIAutoResponse"
    ADD COLUMN IF NOT EXISTS "closingMessage" TEXT NOT NULL DEFAULT '😊 Ficamos felizes em ajudar!\nSe precisar de alguma coisa novamente, é só mandar uma mensagem.\nAté mais!'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "requiresAttention" BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "attentionResolvedAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Message_requiresAttention_attentionResolvedAt_idx"
    ON "Message"("requiresAttention", "attentionResolvedAt")
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SequenceMessage"
    ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AutomationBlockedPhone" (
      "id" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "name" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AutomationBlockedPhone_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AutomationBlockedPhone_phone_key"
    ON "AutomationBlockedPhone"("phone")
  `);
}
