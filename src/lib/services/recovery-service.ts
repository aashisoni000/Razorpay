import { PrismaClient } from "@prisma/client";
import { calculateLedger } from "../domain/ledger";
import { decide } from "../domain/decision";
import { DEFAULT_POLICY } from "../domain/policies";
import { createAuditEntry } from "./audit-service";
import {
  getConfig,
  createPaymentLink as createRazorpayPaymentLink,
} from "../razorpay/client";

export interface CreateRecoveryLinkInput {
  obligationId: string;
}

export interface CreateRecoveryLinkResult {
  actionId: string;
  paymentLinkUrl: string;
  amountPaise: bigint;
}

export async function createRecoveryLink(
  prisma: PrismaClient,
  input: CreateRecoveryLinkInput
): Promise<CreateRecoveryLinkResult> {
  return prisma.$transaction(async (tx) => {
    const obligation = await tx.obligation.findUniqueOrThrow({
      where: { id: input.obligationId },
      include: {
        recoveryPolicy: true,
        recoveryActions: {
          where: { status: { in: ["CREATED", "ACTIVE"] } },
          orderBy: { createdAt: "desc" },
        },
        paymentEvents: true,
        customer: true,
      },
    });

    if (obligation.status === "STOPPED" || obligation.status === "RECOVERED") {
      throw new Error(
        `Obligation ${input.obligationId} is ${obligation.status}. Cannot create recovery action.`
      );
    }

    const existingActive = obligation.recoveryActions.find(
      (a) => a.status === "ACTIVE" || a.status === "CREATED"
    );
    if (existingActive) {
      return {
        actionId: existingActive.id,
        paymentLinkUrl: "",
        amountPaise: existingActive.amountPaise,
      };
    }

    const allEvents = await tx.paymentEvent.findMany({
      where: { obligationId: input.obligationId },
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

    if (ledger.outstandingAmountPaise <= 0n) {
      throw new Error(
        `Obligation ${input.obligationId} has no outstanding balance. Cannot create payment link.`
      );
    }

    const recentActions = await tx.recoveryAction.findMany({
      where: { obligationId: input.obligationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true },
    });

    const policy = obligation.recoveryPolicy
      ? {
          maxAttempts: obligation.recoveryPolicy.maxAttempts,
          recoveryWindowHours: obligation.recoveryPolicy.recoveryWindowHours,
          cooldownBetweenAttemptsHours:
            obligation.recoveryPolicy.cooldownBetweenAttemptsHours,
        }
      : DEFAULT_POLICY;

    const decision = decide({
      obligation: {
        id: obligation.id,
        outstandingAmountPaise: ledger.outstandingAmountPaise,
        status: ledger.status,
      },
      policy,
      activeActions: [],
      recentActionTimestamps: recentActions.map((a) => a.createdAt),
      hasUnresolvedAssociation: false,
      now: new Date(),
      paymentCount: allEvents.length,
    });

    if (decision.decision !== "ACT") {
      throw new Error(
        `Recovery decision for obligation ${input.obligationId} is ${decision.decision} (${decision.reasonCode}). Cannot create payment link.`
      );
    }

    const config = getConfig();
    const amountPaise = ledger.outstandingAmountPaise;

    const razorpayLink = await createRazorpayPaymentLink(config, {
      amountPaise: Number(amountPaise),
      currency: "INR",
      referenceId: obligation.sourceReference ?? obligation.id,
      description: `Recovery payment for ${obligation.sourceReference ?? obligation.id}`,
      customer: {
        name: obligation.customer.name,
      },
      notify: { email: true, sms: true },
    });

    const action = await tx.recoveryAction.create({
      data: {
        obligationId: input.obligationId,
        type: "payment_link",
        status: "ACTIVE",
        amountPaise: amountPaise,
        razorpayPaymentLinkId: razorpayLink.id,
      },
    });

    await createAuditEntry(tx, {
      obligationId: input.obligationId,
      eventType: "RECOVERY_ACTION_CREATED",
      stateBefore: {
        status: obligation.status,
        outstandingAmountPaise: obligation.outstandingAmountPaise.toString(),
      },
      stateAfter: {
        actionId: action.id,
        type: "payment_link",
        amountPaise: amountPaise.toString(),
        razorpayPaymentLinkId: razorpayLink.id,
        razorpayShortUrl: razorpayLink.short_url,
      },
      reasonCode: decision.reasonCode,
      actor: "recovery_service",
    });

    return {
      actionId: action.id,
      paymentLinkUrl: razorpayLink.short_url,
      amountPaise: amountPaise,
    };
  });
}
