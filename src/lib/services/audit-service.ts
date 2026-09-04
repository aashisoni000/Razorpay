import { PrismaClient } from "@prisma/client";

export interface AuditEntryInput {
  obligationId: string;
  eventType: string;
  stateBefore?: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
  decision?: string;
  reasonCode?: string;
  actor?: string;
}

export async function createAuditEntry(
  tx: PrismaClient,
  input: AuditEntryInput
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      obligationId: input.obligationId,
      eventType: input.eventType,
      stateBefore: input.stateBefore ?? undefined,
      stateAfter: input.stateAfter ?? undefined,
      decision: input.decision ?? undefined,
      reasonCode: input.reasonCode ?? undefined,
      actor: input.actor ?? "system",
    },
  });
}

export async function getAuditEntries(
  tx: PrismaClient,
  obligationId: string
) {
  return tx.auditEntry.findMany({
    where: { obligationId },
    orderBy: { timestamp: "asc" },
  });
}
