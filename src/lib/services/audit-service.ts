import { Prisma } from "@prisma/client";
import { TransactionClient } from "./types";

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
  tx: TransactionClient,
  input: AuditEntryInput
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      obligationId: input.obligationId,
      eventType: input.eventType,
      stateBefore: (input.stateBefore as Prisma.InputJsonValue) ?? undefined,
      stateAfter: (input.stateAfter as Prisma.InputJsonValue) ?? undefined,
      decision: input.decision ?? undefined,
      reasonCode: input.reasonCode ?? undefined,
      actor: input.actor ?? "system",
    },
  });
}

export async function getAuditEntries(
  tx: TransactionClient,
  obligationId: string
) {
  return tx.auditEntry.findMany({
    where: { obligationId },
    orderBy: { timestamp: "asc" },
  });
}
