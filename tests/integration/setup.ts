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
  await tx.auditEntry.deleteMany();
  await tx.exception.deleteMany();
  await tx.recoveryAction.deleteMany();
  await tx.paymentEvent.deleteMany();
  await tx.obligation.deleteMany();
  await tx.customer.deleteMany();
  await tx.recoveryPolicy.deleteMany();
}

export async function closeTestPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
