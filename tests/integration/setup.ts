import { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

let prisma: PrismaClient | null = null;

export async function getTestPrisma(): Promise<PrismaClient | null> {
  if (prisma) return prisma;

  if (!TEST_DATABASE_URL) return null;

  try {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$executeRaw`SELECT 1`;
    return prisma;
  } catch {
    return null;
  }
}

export async function cleanupTestDb(tx: PrismaClient): Promise<void> {
  await tx.$executeRaw`DELETE FROM audit_entries`;
  await tx.$executeRaw`DELETE FROM exceptions`;
  await tx.$executeRaw`DELETE FROM recovery_actions`;
  await tx.$executeRaw`DELETE FROM payment_events`;
  await tx.$executeRaw`DELETE FROM obligations`;
  await tx.$executeRaw`DELETE FROM customers`;
  await tx.$executeRaw`DELETE FROM recovery_policies`;
}

export async function closeTestPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
