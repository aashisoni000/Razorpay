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

export async function getRecoveryTrend() {
  const events = await prisma.paymentEvent.findMany({
    where: { type: { in: ["CAPTURED", "PAYMENT_LINK_EVENT"] } },
    select: { amountPaise: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  const byDate = new Map<string, bigint>();
  for (const e of events) {
    const key = e.occurredAt.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0n) + e.amountPaise);
  }

  return Array.from(byDate.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRecoveryActionSummary() {
  const counts = await prisma.recoveryAction.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const statusMap: Record<string, number> = {};
  for (const row of counts) {
    statusMap[row.status] = row._count.id;
  }

  return {
    total: counts.reduce((sum, r) => sum + r._count.id, 0),
    byStatus: statusMap,
  };
}

export async function getOutstandingByCustomer() {
  const rows = await prisma.obligation.groupBy({
    by: ["customerId"],
    where: { outstandingAmountPaise: { gt: 0n } },
    _sum: { outstandingAmountPaise: true },
    _count: { id: true },
    orderBy: { _sum: { outstandingAmountPaise: "desc" } },
  });

  const customerIds = rows.map((r) => r.customerId);
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(customers.map((c) => [c.id, c.name]));

  return rows
    .map((r) => ({
      customerId: r.customerId,
      name: nameMap.get(r.customerId) ?? "Unknown",
      outstanding: r._sum.outstandingAmountPaise ?? 0n,
      obligationCount: r._count.id,
    }))
    .filter((r) => r.outstanding > 0n)
    .sort((a, b) => (b.outstanding > a.outstanding ? 1 : -1));
}

export async function getExceptionSummary() {
  const [byType, byStatus] = await Promise.all([
    prisma.exception.groupBy({
      by: ["type"],
      _count: { id: true },
    }),
    prisma.exception.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const typeMap: Record<string, number> = {};
  for (const row of byType) {
    typeMap[row.type] = row._count.id;
  }

  const statusMap: Record<string, number> = {};
  for (const row of byStatus) {
    statusMap[row.status] = row._count.id;
  }

  return { byType: typeMap, byStatus: statusMap };
}

export async function getAuditDecisionSummary() {
  const rows = await prisma.auditEntry.groupBy({
    by: ["decision"],
    where: { decision: { not: null } },
    _count: { id: true },
  });

  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.decision) map[row.decision] = row._count.id;
  }

  return map;
}

export async function getAuditTrend() {
  const events = await prisma.auditEntry.findMany({
    select: { timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  const byDate = new Map<string, number>();
  for (const e of events) {
    const key = e.timestamp.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  return Array.from(byDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRecoveryActionAmounts() {
  const actions = await prisma.recoveryAction.findMany({
    include: {
      obligation: { include: { customer: true } },
    },
    orderBy: { amountPaise: "desc" },
  });

  return actions.map((a) => ({
    id: a.id,
    customer: a.obligation?.customer?.name ?? "Unknown",
    reference: a.obligation?.sourceReference ?? a.obligationId.slice(0, 8),
    amount: a.amountPaise,
    status: a.status,
  }));
}
