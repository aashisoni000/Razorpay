import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function getDashboardMetrics() {
  const [statusCounts, totals] = await Promise.all([
    prisma.obligation.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.obligation.aggregate({
      _sum: {
        originalAmountPaise: true,
        recoveredAmountPaise: true,
        refundedAmountPaise: true,
        outstandingAmountPaise: true,
        excessAmountPaise: true,
      },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row._count.id;
  }

  return {
    totalObligations: statusCounts.reduce((sum, r) => sum + r._count.id, 0),
    statusBreakdown: statusMap,
    totals: {
      original: totals._sum.originalAmountPaise ?? 0n,
      recovered: totals._sum.recoveredAmountPaise ?? 0n,
      refunded: totals._sum.refundedAmountPaise ?? 0n,
      outstanding: totals._sum.outstandingAmountPaise ?? 0n,
      excess: totals._sum.excessAmountPaise ?? 0n,
    },
    recoverableCount:
      (statusMap["OPEN"] ?? 0) + (statusMap["PARTIALLY_RECOVERED"] ?? 0),
    attentionCount:
      (statusMap["ESCALATED"] ?? 0) +
      (await prisma.exception.count({ where: { status: "OPEN" } })),
  };
}

export async function getRecoveryQueue() {
  return prisma.obligation.findMany({
    where: {
      status: { in: ["OPEN", "PARTIALLY_RECOVERED", "ESCALATED"] },
    },
    include: {
      customer: true,
      recoveryActions: {
        where: { status: { in: ["CREATED", "ACTIVE"] } },
        take: 1,
      },
    },
    orderBy: [{ outstandingAmountPaise: "desc" }, { createdAt: "asc" }],
    take: 10,
  });
}

export async function getRecentEvents(take = 20) {
  return prisma.auditEntry.findMany({
    include: { obligation: { include: { customer: true } } },
    orderBy: { timestamp: "desc" },
    take,
  });
}

export async function getObligations(filters?: {
  status?: string;
  customerId?: string;
  search?: string;
}) {
  const where: Prisma.ObligationWhereInput = {};

  if (filters?.status && filters.status !== "ALL") {
    where.status = filters.status as never;
  }
  if (filters?.customerId) {
    where.customerId = filters.customerId;
  }
  if (filters?.search) {
    where.OR = [
      { sourceReference: { contains: filters.search, mode: "insensitive" } },
      { customer: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  return prisma.obligation.findMany({
    where,
    include: {
      customer: true,
      paymentEvents: { orderBy: { occurredAt: "desc" }, take: 1 },
      recoveryActions: {
        where: { status: { in: ["CREATED", "ACTIVE"] } },
        take: 1,
      },
    },
    orderBy: [{ outstandingAmountPaise: "desc" }, { createdAt: "asc" }],
  });
}

export async function getObligationDetail(id: string) {
  return prisma.obligation.findUnique({
    where: { id },
    include: {
      customer: true,
      recoveryPolicy: true,
      paymentEvents: { orderBy: { occurredAt: "asc" } },
      recoveryActions: { orderBy: { createdAt: "asc" } },
      auditEntries: { orderBy: { timestamp: "asc" } },
      exceptions: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getRecoveryActions() {
  return prisma.recoveryAction.findMany({
    include: {
      obligation: { include: { customer: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExceptions() {
  return prisma.exception.findMany({
    include: {
      obligation: {
        include: { customer: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAuditTrail() {
  return prisma.auditEntry.findMany({
    include: {
      obligation: { include: { customer: true } },
    },
    orderBy: { timestamp: "desc" },
  });
}

export async function getRecoveryPolicy() {
  return prisma.recoveryPolicy.findFirst({
    orderBy: { id: "asc" },
  });
}

export async function getCustomers() {
  return prisma.customer.findMany({
    orderBy: { name: "asc" },
  });
}
