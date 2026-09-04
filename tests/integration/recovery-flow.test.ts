import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getTestPrisma, cleanupTestDb, closeTestPrisma } from "./setup";
import { processPaymentEvent } from "@/lib/services/payment-event-service";
import { normalizeWebhookEvent } from "@/lib/razorpay/normalize";
import { RazorpayWebhookEvent } from "@/lib/razorpay/types";

let tx: PrismaClient | null = null;

async function createCustomer(name: string) {
  return tx!.customer.create({ data: { name } });
}

async function createObligation(data: {
  customerId: string;
  originalAmountPaise: bigint;
  sourceReference?: string;
  sourceType?: string;
  outstandingAmountPaise?: bigint;
  status?: string;
}) {
  return tx!.obligation.create({
    data: {
      customerId: data.customerId,
      originalAmountPaise: data.originalAmountPaise,
      sourceType: data.sourceType ?? "order",
      sourceReference: data.sourceReference,
      outstandingAmountPaise: data.outstandingAmountPaise ?? data.originalAmountPaise,
      status: (data.status ?? "OPEN") as never,
    },
  });
}

function makeRazorpayWebhook(opts: {
  eventId: string;
  paymentLinkId: string;
  paymentId: string;
  amount: number;
  status: string;
  orderId?: string;
  customerId?: string;
  paymentLinkStatus?: string;
}): RazorpayWebhookEvent {
  return {
    entity: "event",
    id: opts.eventId,
    account_id: "acc_test",
    event:
      opts.paymentLinkStatus === "paid"
        ? "payment_link.paid"
        : "payment_link.created",
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment_link: {
        entity: {
          id: opts.paymentLinkId,
          entity: "payment_link",
          amount: opts.amount,
          currency: "INR",
          status: (opts.paymentLinkStatus ?? "paid") as never,
          reference_id: "ORD-TEST",
          short_url: "https://rzp.io/i/test",
          created_at: Math.floor(Date.now() / 1000),
        },
      },
      payment: {
        entity: {
          id: opts.paymentId,
          entity: "payment",
          amount: opts.amount,
          currency: "INR",
          status: opts.status as never,
          order_id: opts.orderId,
          customer_id: opts.customerId,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

beforeAll(async () => {
  tx = await getTestPrisma();
});

afterAll(async () => {
  await closeTestPrisma();
});

beforeEach(async () => {
  if (tx) await cleanupTestDb(tx);
});

describe("recovery flow integration", () => {
  it("webhook event processes through normal flow and updates obligation", async () => {
    if (!tx) return;

    const customer = await createCustomer("Flow Test User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-FLOW-001",
    });

    await tx.paymentEvent.create({
      data: {
        externalEventId: "evt-existing-flow-001",
        type: "CAPTURED",
        amountPaise: 400000n,
        source: "razorpay",
        obligationId: obligation.id,
        occurredAt: new Date("2025-01-15T09:00:00Z"),
        referenceIds: { orderId: "ORD-FLOW-001" },
      },
    });

    const webhook = makeRazorpayWebhook({
      eventId: "evt_flow_001",
      paymentLinkId: "plink_flow_001",
      paymentId: "pay_flow_001",
      amount: 600000,
      status: "captured",
      orderId: "ORD-FLOW-001",
      customerId: customer.id,
    });

    const normalized = normalizeWebhookEvent(webhook);
    expect(normalized).not.toBeNull();

    const result = await processPaymentEvent(tx, {
      externalEventId: normalized!.externalEventId,
      type: normalized!.type,
      amountPaise: BigInt(normalized!.amountPaise),
      source: normalized!.source,
      orderId: normalized!.orderId,
      customerId: normalized!.customerId,
      occurredAt: normalized!.occurredAt,
    });

    expect(result.linked).toBe(true);
    expect(result.obligationId).toBe(obligation.id);

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.outstandingAmountPaise).toBe(0n);
    expect(updated!.recoveredAmountPaise).toBe(1000000n);
    expect(updated!.status).toBe("RECOVERED");
  });

  it("duplicate webhook does not duplicate financial effect", async () => {
    if (!tx) return;

    const customer = await createCustomer("Dup Test User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 500000n,
      sourceReference: "ORD-DUP-001",
    });

    const webhook = makeRazorpayWebhook({
      eventId: "evt_dup_001",
      paymentLinkId: "plink_dup_001",
      paymentId: "pay_dup_001",
      amount: 500000,
      status: "captured",
      orderId: "ORD-DUP-001",
      customerId: customer.id,
    });

    const normalized = normalizeWebhookEvent(webhook)!;

    const input = {
      externalEventId: normalized.externalEventId,
      type: normalized.type,
      amountPaise: BigInt(normalized.amountPaise),
      source: normalized.source,
      orderId: normalized.orderId,
      customerId: normalized.customerId,
      occurredAt: normalized.occurredAt,
    };

    const result1 = await processPaymentEvent(tx, input);
    const result2 = await processPaymentEvent(tx, input);

    expect(result1.eventId).toBe(result2.eventId);

    const eventCount = await tx.paymentEvent.count({
      where: { externalEventId: "evt_dup_001" },
    });
    expect(eventCount).toBe(1);

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.outstandingAmountPaise).toBe(0n);
    expect(updated!.recoveredAmountPaise).toBe(500000n);
    expect(updated!.status).toBe("RECOVERED");
  });

  it("ambiguous webhook payment does not mutate wrong obligation", async () => {
    if (!tx) return;

    const customer = await createCustomer("Ambig Test User");
    const obA = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 800000n,
      sourceReference: "ORD-AMB-A",
    });
    const obB = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1200000n,
      sourceReference: "ORD-AMB-B",
    });

    const webhook = makeRazorpayWebhook({
      eventId: "evt_amb_001",
      paymentLinkId: "plink_amb_001",
      paymentId: "pay_amb_001",
      amount: 500000,
      status: "captured",
      customerId: customer.id,
    });

    const normalized = normalizeWebhookEvent(webhook)!;

    const result = await processPaymentEvent(tx, {
      externalEventId: normalized.externalEventId,
      type: normalized.type,
      amountPaise: BigInt(normalized.amountPaise),
      source: normalized.source,
      customerId: normalized.customerId,
      occurredAt: normalized.occurredAt,
    });

    expect(result.linked).toBe(false);
    expect(result.exceptionCreated).toBe(true);

    const updatedA = await tx.obligation.findUnique({ where: { id: obA.id } });
    const updatedB = await tx.obligation.findUnique({ where: { id: obB.id } });
    expect(updatedA!.recoveredAmountPaise).toBe(0n);
    expect(updatedB!.recoveredAmountPaise).toBe(0n);
  });

  it("payment settling obligation causes decision STOP", async () => {
    if (!tx) return;

    const customer = await createCustomer("Settle Test User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-SETTLE-001",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt_settle_001",
      type: "CAPTURED",
      amountPaise: 1000000n,
      source: "razorpay",
      orderId: "ORD-SETTLE-001",
      customerId: customer.id,
      occurredAt: new Date(),
    });

    const auditEntries = await tx.auditEntry.findMany({
      where: { obligationId: obligation.id, eventType: "DECISION_MADE" },
    });
    expect(auditEntries.length).toBe(1);

    const decisionEntry = auditEntries[0];
    const stateAfter = decisionEntry.stateAfter as Record<string, unknown>;
    expect(stateAfter.decision).toBe("STOP");
    expect(stateAfter.reasonCode).toBe("outstanding_zero");
  });

  it("failed payment does not increase recovered amount", async () => {
    if (!tx) return;

    const customer = await createCustomer("Fail Test User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-FAIL-001",
    });

    const result = await processPaymentEvent(tx, {
      externalEventId: "evt_fail_001",
      type: "FAILED",
      amountPaise: 1000000n,
      source: "razorpay",
      orderId: "ORD-FAIL-001",
      customerId: customer.id,
      occurredAt: new Date(),
    });

    expect(result.linked).toBe(true);

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.recoveredAmountPaise).toBe(0n);
    expect(updated!.outstandingAmountPaise).toBe(1000000n);
    expect(updated!.status).toBe("OPEN");
  });
});
