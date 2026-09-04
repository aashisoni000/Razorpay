import { PrismaClient } from "@prisma/client";
import { matchPaymentToObligation } from "../domain/matching";
import { calculateLedger } from "../domain/ledger";
import { recomputeObligationLedger, evaluateDecisionForObligation, updateObligationFromLedger } from "./obligation-service";
import { createAuditEntry } from "./audit-service";
import { createException } from "./exception-service";

export interface ProcessEventInput {
  externalEventId: string;
  type: string;
  amountPaise: bigint;
  source: string;
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  customerId?: string;
  occurredAt: Date;
  rawPayload?: Record<string, unknown>;
}

export interface ProcessEventResult {
  eventId: string;
  obligationId: string | null;
  linked: boolean;
  exceptionCreated: boolean;
}

export async function processPaymentEvent(
  tx: PrismaClient,
  input: ProcessEventInput
): Promise<ProcessEventResult> {
  const existingEvent = await tx.paymentEvent.findUnique({
    where: { externalEventId: input.externalEventId },
  });

  if (existingEvent) {
    return {
      eventId: existingEvent.id,
      obligationId: existingEvent.obligationId,
      linked: existingEvent.obligationId !== null,
      exceptionCreated: false,
    };
  }

  const event = await tx.paymentEvent.create({
    data: {
      externalEventId: input.externalEventId,
      type: input.type as never,
      amountPaise: input.amountPaise,
      source: input.source,
      referenceIds: {
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        subscriptionId: input.subscriptionId,
      },
      occurredAt: input.occurredAt,
      rawPayload: input.rawPayload ?? undefined,
    },
  });

  const candidateObligations = await tx.obligation.findMany({
    where: {
      status: { notIn: ["STOPPED", "RECOVERED"] },
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
    select: {
      id: true,
      sourceReference: true,
      customerId: true,
      outstandingAmountPaise: true,
      status: true,
    },
  });

  const matchInput = {
    id: event.id,
    amountPaise: input.amountPaise,
    orderId: input.orderId,
    invoiceId: input.invoiceId,
    subscriptionId: input.subscriptionId,
    customerId: input.customerId,
    occurredAt: input.occurredAt,
  };

  const matchResult = matchPaymentToObligation(matchInput, candidateObligations);

  if (matchResult.evidenceTier === "INSUFFICIENT_EVIDENCE") {
    await createAuditEntry(tx, {
      obligationId: candidateObligations[0]?.id ?? "unresolved",
      eventType: "PAYMENT_EVENT_RECEIVED",
      stateAfter: {
        eventId: event.id,
        amountPaise: input.amountPaise.toString(),
        linked: false,
        evidenceTier: matchResult.evidenceTier,
        reasonCode: matchResult.reasonCode,
      },
      reasonCode: matchResult.reasonCode,
    });

    await createException(tx, {
      obligationId: undefined,
      type: "UNRESOLVED_ASSOCIATION",
      description: matchResult.evidence.join("; "),
      payload: {
        eventId: event.id,
        amountPaise: input.amountPaise.toString(),
        candidateObligationIds: matchResult.candidates,
        evidenceTier: matchResult.evidenceTier,
        reasonCode: matchResult.reasonCode,
      },
    });

    return {
      eventId: event.id,
      obligationId: null,
      linked: false,
      exceptionCreated: true,
    };
  }

  await tx.paymentEvent.update({
    where: { id: event.id },
    data: { obligationId: matchResult.obligationId },
  });

  await createAuditEntry(tx, {
    obligationId: matchResult.obligationId!,
    eventType: "OBLIGATION_MATCHED",
    stateAfter: {
      eventId: event.id,
      obligationId: matchResult.obligationId,
      evidenceTier: matchResult.evidenceTier,
      evidence: matchResult.evidence,
    },
    reasonCode: matchResult.reasonCode,
  });

  const obligation = await tx.obligation.findUniqueOrThrow({
    where: { id: matchResult.obligationId! },
  });

  const ledger = calculateLedger({
    originalAmountPaise: obligation.originalAmountPaise,
    paymentEvents: (
      await tx.paymentEvent.findMany({
        where: { obligationId: matchResult.obligationId! },
      })
    ).map((e) => ({
      id: e.id,
      type: e.type as "CAPTURED",
      amountPaise: e.amountPaise,
    })),
  });

  const stateBefore = {
    recoveredAmountPaise: obligation.recoveredAmountPaise.toString(),
    outstandingAmountPaise: obligation.outstandingAmountPaise.toString(),
    status: obligation.status,
  };

  await updateObligationFromLedger(
    tx,
    matchResult.obligationId!,
    ledger,
    obligation.version
  );

  await createAuditEntry(tx, {
    obligationId: matchResult.obligationId!,
    eventType: "BALANCE_UPDATED",
    stateBefore,
    stateAfter: {
      recoveredAmountPaise: ledger.recoveredAmountPaise.toString(),
      outstandingAmountPaise: ledger.outstandingAmountPaise.toString(),
      excessAmountPaise: ledger.excessAmountPaise.toString(),
      status: ledger.status,
    },
  });

  const decision = await evaluateDecisionForObligation(
    tx,
    matchResult.obligationId!,
    { hasUnresolvedAssociation: false, now: new Date() }
  );

  await createAuditEntry(tx, {
    obligationId: matchResult.obligationId!,
    eventType: "DECISION_MADE",
    stateAfter: {
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      evidence: decision.evidence,
    },
    decision: decision.decision,
    reasonCode: decision.reasonCode,
  });

  return {
    eventId: event.id,
    obligationId: matchResult.obligationId,
    linked: true,
    exceptionCreated: false,
  };
}
