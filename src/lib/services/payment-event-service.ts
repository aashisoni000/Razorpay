import { PrismaClient, Prisma } from "@prisma/client";
import { matchPaymentToObligation } from "../domain/matching";
import { calculateLedger } from "../domain/ledger";
import {
  evaluateDecisionForObligation,
  updateObligationFromLedger,
} from "./obligation-service";
import { createAuditEntry } from "./audit-service";
import { createException } from "./exception-service";
import { orchestrateRecovery } from "./recovery-orchestrator";
import { ProcessEventInputSchema } from "../domain/validation";
import { rankCandidates } from "../ml/ranker";
import { PaymentFeatures } from "../ml/features";

export interface ProcessEventResult {
  eventId: string;
  obligationId: string | null;
  linked: boolean;
  exceptionCreated: boolean;
}

export async function processPaymentEvent(
  prisma: PrismaClient,
  input: unknown
): Promise<ProcessEventResult> {
  const parsed = ProcessEventInputSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const existingEvent = await tx.paymentEvent.findUnique({
      where: { externalEventId: parsed.externalEventId },
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
        externalEventId: parsed.externalEventId,
        type: parsed.type,
        amountPaise: parsed.amountPaise,
        source: parsed.source,
        referenceIds: {
          orderId: parsed.orderId,
          invoiceId: parsed.invoiceId,
          subscriptionId: parsed.subscriptionId,
        } as Prisma.InputJsonValue,
        occurredAt: parsed.occurredAt,
        rawPayload: (parsed.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    const candidateObligations = await tx.obligation.findMany({
      where: {
        status: {
          notIn: parsed.type === "REFUND"
            ? ["STOPPED"]
            : ["STOPPED", "RECOVERED"],
        },
        ...(parsed.customerId ? { customerId: parsed.customerId } : {}),
      },
      select: {
        id: true,
        sourceReference: true,
        customerId: true,
        outstandingAmountPaise: true,
        originalAmountPaise: true,
        status: true,
      },
    });

    const candidatesWithRefs = candidateObligations.map((c) => ({
      ...c,
      sourceReference: c.sourceReference ?? undefined,
    }));

    const matchInput = {
      id: event.id,
      amountPaise: parsed.amountPaise,
      orderId: parsed.orderId,
      invoiceId: parsed.invoiceId,
      subscriptionId: parsed.subscriptionId,
      customerId: parsed.customerId,
      occurredAt: parsed.occurredAt,
    };

    const matchResult = matchPaymentToObligation(
      matchInput,
      candidatesWithRefs
    );

    if (matchResult.evidenceTier === "INSUFFICIENT_EVIDENCE") {
      let mlResult = null;
      if (matchResult.candidates.length > 0) {
        const paymentFeatures: PaymentFeatures = {
          id: event.id,
          amountPaise: parsed.amountPaise,
          orderId: parsed.orderId,
          invoiceId: parsed.invoiceId,
          subscriptionId: parsed.subscriptionId,
          customerId: parsed.customerId,
          occurredAt: parsed.occurredAt,
        };

        try {
          mlResult = rankCandidates(paymentFeatures, candidatesWithRefs, matchResult);
        } catch {
          mlResult = null;
        }

        await createAuditEntry(tx, {
          obligationId: matchResult.candidates[0],
          eventType: "PAYMENT_EVENT_RECEIVED",
          stateAfter: {
            eventId: event.id,
            amountPaise: parsed.amountPaise.toString(),
            linked: false,
            evidenceTier: matchResult.evidenceTier,
            reasonCode: matchResult.reasonCode,
            mlRanking: mlResult
              ? {
                  confidence: mlResult.confidence,
                  recommendedCandidateId: mlResult.recommendedCandidateId,
                  scores: mlResult.scores,
                  evidence: mlResult.evidence,
                  topScore: mlResult.topScore,
                  secondScore: mlResult.secondScore,
                  gap: mlResult.gap,
                }
              : null,
          },
          reasonCode: matchResult.reasonCode,
        });
      }

      await createException(tx, {
        type: "UNRESOLVED_ASSOCIATION",
        description: matchResult.evidence.join("; "),
        payload: {
          eventId: event.id,
          amountPaise: parsed.amountPaise.toString(),
          candidateObligationIds: matchResult.candidates,
          evidenceTier: matchResult.evidenceTier,
          reasonCode: matchResult.reasonCode,
          mlRanking: mlResult
            ? {
                confidence: mlResult.confidence,
                recommendedCandidateId: mlResult.recommendedCandidateId,
                evidence: mlResult.evidence,
              }
            : null,
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

    const allEvents = await tx.paymentEvent.findMany({
      where: { obligationId: matchResult.obligationId! },
    });

    const ledger = calculateLedger({
      originalAmountPaise: obligation.originalAmountPaise,
      paymentEvents: allEvents.map((e) => ({
        id: e.id,
        type: e.type as
          | "CAPTURED"
          | "PAYMENT_LINK_EVENT"
          | "REFUND"
          | "FAILED"
          | "AUTHORIZED",
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

    await orchestrateRecovery(tx, {
      obligationId: matchResult.obligationId!,
      decision,
    });

    return {
      eventId: event.id,
      obligationId: matchResult.obligationId,
      linked: true,
      exceptionCreated: false,
    };
  });
}
