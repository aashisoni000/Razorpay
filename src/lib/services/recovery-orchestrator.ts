import { DecisionResult } from "../domain/types";
import { calculateLedger } from "../domain/ledger";
import { createAuditEntry } from "./audit-service";
import { TransactionClient } from "./types";

function isRazorpayConfigured(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return (
    keyId.startsWith("rzp_test_") &&
    keyId.length > 12 &&
    keySecret.length > 0 &&
    !keyId.includes("placeholder")
  );
}

export interface OrchestrateRecoveryInput {
  obligationId: string;
  decision: DecisionResult;
}

export interface OrchestrateRecoveryResult {
  actionCreated: boolean;
  actionId: string | null;
  actionResolved: boolean;
  resolvedCount: number;
}

export async function orchestrateRecovery(
  tx: TransactionClient,
  input: OrchestrateRecoveryInput
): Promise<OrchestrateRecoveryResult> {
  const { obligationId, decision } = input;

  if (decision.decision === "ACT") {
    return orchestrateAct(tx, obligationId);
  }

  if (decision.decision === "STOP") {
    return orchestrateStop(tx, obligationId, decision);
  }

  return {
    actionCreated: false,
    actionId: null,
    actionResolved: false,
    resolvedCount: 0,
  };
}

async function orchestrateAct(
  tx: TransactionClient,
  obligationId: string
): Promise<OrchestrateRecoveryResult> {
  const obligation = await tx.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: {
      customer: true,
      recoveryActions: {
        where: { status: { in: ["CREATED", "ACTIVE"] } },
        take: 1,
      },
      paymentEvents: true,
    },
  });

  const existingAction = obligation.recoveryActions[0];
  if (existingAction) {
    return {
      actionCreated: false,
      actionId: existingAction.id,
      actionResolved: false,
      resolvedCount: 0,
    };
  }

  const allEvents = await tx.paymentEvent.findMany({
    where: { obligationId },
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
    return {
      actionCreated: false,
      actionId: null,
      actionResolved: false,
      resolvedCount: 0,
    };
  }

  const amountPaise = ledger.outstandingAmountPaise;
  let razorpayPaymentLinkId: string | null = null;
  let actionStatus: "CREATED" | "ACTIVE" = "CREATED";

  if (isRazorpayConfigured()) {
    try {
      const { getConfig, createPaymentLink } = await import(
        "../razorpay/client"
      );
      const config = getConfig();
      const razorpayLink = await createPaymentLink(config, {
        amountPaise: Number(amountPaise),
        currency: "INR",
        referenceId: obligation.sourceReference ?? obligation.id,
        description: `Recovery payment for ${obligation.sourceReference ?? obligation.id}`,
        customer: { name: obligation.customer?.name },
        notify: { email: true, sms: true },
      });
      razorpayPaymentLinkId = razorpayLink.id;
      actionStatus = "ACTIVE";
    } catch {
      actionStatus = "CREATED";
    }
  }

  const action = await tx.recoveryAction.create({
    data: {
      obligationId,
      type: "payment_link",
      status: actionStatus,
      amountPaise,
      razorpayPaymentLinkId,
    },
  });

  await createAuditEntry(tx, {
    obligationId,
    eventType: "RECOVERY_ACTION_CREATED",
    stateBefore: {
      status: obligation.status,
      outstandingAmountPaise: obligation.outstandingAmountPaise.toString(),
    },
    stateAfter: {
      actionId: action.id,
      type: "payment_link",
      amountPaise: amountPaise.toString(),
      status: actionStatus,
      razorpayPaymentLinkId,
    },
    reasonCode: "act_decision",
    actor: "recovery_orchestrator",
  });

  return {
    actionCreated: true,
    actionId: action.id,
    actionResolved: false,
    resolvedCount: 0,
  };
}

async function orchestrateStop(
  tx: TransactionClient,
  obligationId: string,
  decision: DecisionResult
): Promise<OrchestrateRecoveryResult> {
  const activeActions = await tx.recoveryAction.findMany({
    where: {
      obligationId,
      status: { in: ["CREATED", "ACTIVE"] },
    },
  });

  if (activeActions.length === 0) {
    return {
      actionCreated: false,
      actionId: null,
      actionResolved: false,
      resolvedCount: 0,
    };
  }

  const now = new Date();
  await tx.recoveryAction.updateMany({
    where: {
      obligationId,
      status: { in: ["CREATED", "ACTIVE"] },
    },
    data: {
      status: "SUCCEEDED",
      resolvedAt: now,
    },
  });

  await createAuditEntry(tx, {
    obligationId,
    eventType: "RECOVERY_ACTION_RESOLVED",
    stateBefore: {
      activeActionIds: activeActions.map((a) => a.id),
      count: activeActions.length,
    },
    stateAfter: {
      resolvedCount: activeActions.length,
      reasonCode: decision.reasonCode,
      resolvedAt: now.toISOString(),
    },
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    actor: "recovery_orchestrator",
  });

  return {
    actionCreated: false,
    actionId: null,
    actionResolved: true,
    resolvedCount: activeActions.length,
  };
}
