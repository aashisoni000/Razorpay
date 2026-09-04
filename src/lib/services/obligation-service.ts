import { Obligation, ObligationStatus } from "@prisma/client";
import { TransactionClient } from "./types";
import { calculateLedger } from "../domain/ledger";
import { decide } from "../domain/decision";
import { DEFAULT_POLICY } from "../domain/policies";
import {
  DecisionInput,
  DecisionResult,
  LedgerResult,
  PaymentEventInput,
  RecoveryPolicy as DomainPolicy,
} from "../domain/types";

function toDomainPolicy(
  policy: {
    maxAttempts: number;
    recoveryWindowHours: number;
    cooldownBetweenAttemptsHours: number;
  } | null
): DomainPolicy {
  if (!policy) return DEFAULT_POLICY;
  return {
    maxAttempts: policy.maxAttempts,
    recoveryWindowHours: policy.recoveryWindowHours,
    cooldownBetweenAttemptsHours: policy.cooldownBetweenAttemptsHours,
  };
}

function toLedgerEvents(
  events: { id: string; type: string; amountPaise: bigint }[]
): PaymentEventInput[] {
  return events.map((e) => ({
    id: e.id,
    type: e.type as PaymentEventInput["type"],
    amountPaise: e.amountPaise,
  }));
}

export async function recomputeObligationLedger(
  tx: TransactionClient,
  obligationId: string
): Promise<{ ledger: LedgerResult; obligation: Obligation }> {
  const obligation = await tx.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: { paymentEvents: true },
  });

  const ledger = calculateLedger({
    originalAmountPaise: obligation.originalAmountPaise,
    paymentEvents: toLedgerEvents(obligation.paymentEvents),
  });

  return { ledger, obligation };
}

export async function evaluateDecisionForObligation(
  tx: TransactionClient,
  obligationId: string,
  opts: { hasUnresolvedAssociation: boolean; now: Date }
): Promise<DecisionResult> {
  const obligation = await tx.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: {
      recoveryPolicy: true,
      recoveryActions: {
        where: { status: { in: ["CREATED", "ACTIVE"] } },
        orderBy: { createdAt: "desc" },
      },
      paymentEvents: true,
    },
  });

  const recentActions = await tx.recoveryAction.findMany({
    where: { obligationId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { createdAt: true },
  });

  const policy = toDomainPolicy(obligation.recoveryPolicy);

  const input: DecisionInput = {
    obligation: {
      id: obligation.id,
      outstandingAmountPaise: obligation.outstandingAmountPaise,
      status: obligation.status as ObligationStatus,
    },
    policy,
    activeActions: obligation.recoveryActions.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
    })),
    recentActionTimestamps: recentActions.map((a) => a.createdAt),
    hasUnresolvedAssociation: opts.hasUnresolvedAssociation,
    now: opts.now,
    paymentCount: obligation.paymentEvents.length,
  };

  return decide(input);
}

export async function updateObligationFromLedger(
  tx: TransactionClient,
  obligationId: string,
  ledger: LedgerResult,
  expectedVersion: number
): Promise<Obligation> {
  const updated = await tx.obligation.updateMany({
    where: {
      id: obligationId,
      version: expectedVersion,
    },
    data: {
      recoveredAmountPaise: ledger.recoveredAmountPaise,
      refundedAmountPaise: ledger.refundedAmountPaise,
      outstandingAmountPaise: ledger.outstandingAmountPaise,
      excessAmountPaise: ledger.excessAmountPaise,
      status: ledger.status as ObligationStatus,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new Error(
      `Optimistic lock conflict on obligation ${obligationId}: expected version ${expectedVersion}`
    );
  }

  return tx.obligation.findUniqueOrThrow({ where: { id: obligationId } });
}
