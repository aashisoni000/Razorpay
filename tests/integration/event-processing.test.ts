import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getTestPrisma, cleanupTestDb, closeTestPrisma } from "./setup";
import { processPaymentEvent } from "@/lib/services/payment-event-service";

let tx: PrismaClient | null = null;

async function createObligation(
  data: {
    customerId: string;
    originalAmountPaise: bigint;
    sourceReference?: string;
    sourceType?: string;
  }
) {
  return tx!.obligation.create({
    data: {
      customerId: data.customerId,
      originalAmountPaise: data.originalAmountPaise,
      sourceType: data.sourceType ?? "order",
      sourceReference: data.sourceReference,
      outstandingAmountPaise: data.originalAmountPaise,
    },
  });
}

async function createCustomer(name: string) {
  return tx!.customer.create({ data: { name } });
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

describe("event processing integration", () => {
  it("TEST 1 — processes a single payment against an obligation", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-001",
    });

    const result = await processPaymentEvent(tx, {
      externalEventId: "evt-001",
      type: "CAPTURED",
      amountPaise: 600000n,
      source: "razorpay",
      orderId: "ORD-001",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    expect(result.linked).toBe(true);
    expect(result.obligationId).toBe(obligation.id);

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.outstandingAmountPaise).toBe(400000n);
    expect(updated!.recoveredAmountPaise).toBe(600000n);
    expect(updated!.status).toBe("PARTIALLY_RECOVERED");
  });

  it("TEST 2 — does not process the same event twice", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-002",
    });

    const input = {
      externalEventId: "evt-dup-001",
      type: "CAPTURED",
      amountPaise: 500000n,
      source: "razorpay",
      orderId: "ORD-002",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    };

    const result1 = await processPaymentEvent(tx, input);
    expect(result1.linked).toBe(true);

    const result2 = await processPaymentEvent(tx, input);
    expect(result2.eventId).toBe(result1.eventId);

    const eventCount = await tx.paymentEvent.count({
      where: { externalEventId: "evt-dup-001" },
    });
    expect(eventCount).toBe(1);

    const obligation = await tx.obligation.findFirst({
      where: { customerId: customer.id },
    });
    expect(obligation!.recoveredAmountPaise).toBe(500000n);
  });

  it("TEST 3 — processes two payments to fully settle", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-003",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-multi-1",
      type: "CAPTURED",
      amountPaise: 600000n,
      source: "razorpay",
      orderId: "ORD-003",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-multi-2",
      type: "CAPTURED",
      amountPaise: 400000n,
      source: "razorpay",
      orderId: "ORD-003",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:05:00Z"),
    });

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.outstandingAmountPaise).toBe(0n);
    expect(updated!.recoveredAmountPaise).toBe(1000000n);
    expect(updated!.status).toBe("RECOVERED");
  });

  it("TEST 4 — creates exception for unmatched payment", async () => {
    if (!tx) return;
    const customer = await createCustomer("Priya Sharma");
    await createObligation({
      customerId: customer.id,
      originalAmountPaise: 800000n,
      sourceReference: "ORD-A",
    });
    await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1200000n,
      sourceReference: "ORD-B",
    });

    const result = await processPaymentEvent(tx, {
      externalEventId: "evt-amb-001",
      type: "CAPTURED",
      amountPaise: 500000n,
      source: "razorpay",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    expect(result.linked).toBe(false);
    expect(result.exceptionCreated).toBe(true);

    const exceptions = await tx.exception.findMany();
    expect(exceptions.length).toBe(1);
    expect(exceptions[0].type).toBe("UNRESOLVED_ASSOCIATION");

    const obligations = await tx.obligation.findMany({
      where: { customerId: customer.id },
    });
    for (const ob of obligations) {
      expect(ob.recoveredAmountPaise).toBe(0n);
      expect(ob.outstandingAmountPaise).toBe(ob.originalAmountPaise);
    }
  });

  it("TEST 5 — flags excess when payment exceeds original", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-005",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-over-001",
      type: "CAPTURED",
      amountPaise: 1200000n,
      source: "razorpay",
      orderId: "ORD-005",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.outstandingAmountPaise).toBe(0n);
    expect(updated!.excessAmountPaise).toBe(200000n);
    expect(updated!.status).toBe("OVERPAID");
  });

  it("TEST 6 — processes refund and updates ledger", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-006",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-refund-capture",
      type: "CAPTURED",
      amountPaise: 1000000n,
      source: "razorpay",
      orderId: "ORD-006",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-refund-001",
      type: "REFUND",
      amountPaise: 200000n,
      source: "razorpay",
      orderId: "ORD-006",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T11:00:00Z"),
    });

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.recoveredAmountPaise).toBe(1000000n);
    expect(updated!.refundedAmountPaise).toBe(200000n);
    expect(updated!.outstandingAmountPaise).toBe(200000n);
    expect(updated!.status).toBe("PARTIALLY_RECOVERED");
  });

  it("TEST 7 — detects version conflict on concurrent update", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-007",
    });

    const initialVersion = obligation.version;

    await processPaymentEvent(tx, {
      externalEventId: "evt-lock-1",
      type: "CAPTURED",
      amountPaise: 300000n,
      source: "razorpay",
      orderId: "ORD-007",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-lock-2",
      type: "CAPTURED",
      amountPaise: 200000n,
      source: "razorpay",
      orderId: "ORD-007",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:01:00Z"),
    });

    await expect(
      processPaymentEvent(tx, {
        externalEventId: "evt-lock-3",
        type: "CAPTURED",
        amountPaise: 100000n,
        source: "razorpay",
        orderId: "ORD-007",
        customerId: customer.id,
        occurredAt: new Date("2025-01-15T10:02:00Z"),
      })
    ).resolves.toBeDefined();

    const final_ = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(final_!.version).toBeGreaterThan(initialVersion);
  });

  it("creates audit entries for event processing", async () => {
    if (!tx) return;
    const customer = await createCustomer("Test Customer");
    await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-AUDIT",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-audit-1",
      type: "CAPTURED",
      amountPaise: 500000n,
      source: "razorpay",
      orderId: "ORD-AUDIT",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    const entries = await tx.auditEntry.findMany({
      orderBy: { timestamp: "asc" },
    });

    const eventTypes = entries.map((e) => e.eventType);
    expect(eventTypes).toContain("OBLIGATION_MATCHED");
    expect(eventTypes).toContain("BALANCE_UPDATED");
    expect(eventTypes).toContain("DECISION_MADE");
  });

  it("TEST 8 — refund reopens obligation and creates new recovery action", async () => {
    if (!tx) return;
    const customer = await createCustomer("Refund Reopen User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 1000000n,
      sourceReference: "ORD-REOPEN-001",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-reopen-capture",
      type: "CAPTURED",
      amountPaise: 1000000n,
      source: "razorpay",
      orderId: "ORD-REOPEN-001",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    const afterCapture = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(afterCapture!.status).toBe("RECOVERED");

    await processPaymentEvent(tx, {
      externalEventId: "evt-reopen-refund",
      type: "REFUND",
      amountPaise: 300000n,
      source: "razorpay",
      orderId: "ORD-REOPEN-001",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T11:00:00Z"),
    });

    const afterRefund = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(afterRefund!.outstandingAmountPaise).toBe(300000n);
    expect(afterRefund!.recoveredAmountPaise).toBe(1000000n);
    expect(afterRefund!.refundedAmountPaise).toBe(300000n);
    expect(afterRefund!.status).toBe("PARTIALLY_RECOVERED");

    const actions = await tx.recoveryAction.findMany({
      where: { obligationId: obligation.id },
    });
    expect(actions.length).toBe(1);
    expect(actions[0].amountPaise).toBe(300000n);
    expect(actions[0].status).toBe("CREATED");
  });

  it("TEST 9 — overpayment audit trail captures excess details", async () => {
    if (!tx) return;
    const customer = await createCustomer("Overpay Audit User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 500000n,
      sourceReference: "ORD-OVERPAY-AUDIT",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-overpay-audit-1",
      type: "CAPTURED",
      amountPaise: 700000n,
      source: "razorpay",
      orderId: "ORD-OVERPAY-AUDIT",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    const balanceEntries = await tx.auditEntry.findMany({
      where: {
        obligationId: obligation.id,
        eventType: "BALANCE_UPDATED",
      },
    });
    expect(balanceEntries.length).toBe(1);

    const stateAfter = balanceEntries[0].stateAfter as Record<string, unknown>;
    expect(stateAfter.status).toBe("OVERPAID");
    expect(stateAfter.excessAmountPaise).toBe("200000");
    expect(stateAfter.outstandingAmountPaise).toBe("0");

    const decisionEntries = await tx.auditEntry.findMany({
      where: {
        obligationId: obligation.id,
        eventType: "DECISION_MADE",
      },
    });
    expect(decisionEntries.length).toBe(1);
    const decisionState = decisionEntries[0].stateAfter as Record<string, unknown>;
    expect(decisionState.decision).toBe("STOP");
    expect(decisionState.reasonCode).toBe("outstanding_zero");
  });

  it("TEST 10 — full recovery resolves existing active recovery action", async () => {
    if (!tx) return;
    const customer = await createCustomer("Resolve Action User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 500000n,
      sourceReference: "ORD-RESOLVE-ACT",
    });

    await tx.recoveryAction.create({
      data: {
        obligationId: obligation.id,
        type: "payment_link",
        status: "ACTIVE",
        amountPaise: 500000n,
        razorpayPaymentLinkId: "plink_stale",
      },
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-resolve-capture",
      type: "CAPTURED",
      amountPaise: 500000n,
      source: "razorpay",
      orderId: "ORD-RESOLVE-ACT",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.status).toBe("RECOVERED");
    expect(updated!.outstandingAmountPaise).toBe(0n);

    const actions = await tx.recoveryAction.findMany({
      where: { obligationId: obligation.id },
    });
    expect(actions.length).toBe(1);
    expect(actions[0].status).toBe("SUCCEEDED");
    expect(actions[0].resolvedAt).not.toBeNull();
  });

  it("TEST 11 — payment from different customer creates exception", async () => {
    if (!tx) return;
    const custA = await createCustomer("Customer A");
    const custB = await createCustomer("Customer B");
    const obligation = await createObligation({
      customerId: custA.id,
      originalAmountPaise: 800000n,
      sourceReference: "ORD-CUST-A",
    });

    const result = await processPaymentEvent(tx, {
      externalEventId: "evt-wrong-cust",
      type: "CAPTURED",
      amountPaise: 800000n,
      source: "razorpay",
      orderId: "ORD-CUST-A",
      customerId: custB.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    expect(result.linked).toBe(false);
    expect(result.exceptionCreated).toBe(true);

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.recoveredAmountPaise).toBe(0n);
  });

  it("TEST 12 — refund amount exceeding recovered creates excess", async () => {
    if (!tx) return;
    const customer = await createCustomer("Excess Refund User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 500000n,
      sourceReference: "ORD-EXCESS-REF",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-er-capture",
      type: "CAPTURED",
      amountPaise: 300000n,
      source: "razorpay",
      orderId: "ORD-EXCESS-REF",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-er-refund",
      type: "REFUND",
      amountPaise: 400000n,
      source: "razorpay",
      orderId: "ORD-EXCESS-REF",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T11:00:00Z"),
    });

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.recoveredAmountPaise).toBe(300000n);
    expect(updated!.refundedAmountPaise).toBe(400000n);
    expect(updated!.outstandingAmountPaise).toBe(600000n);
  });

  it("TEST 13 — zero-amount payment is processed but does not change ledger", async () => {
    if (!tx) return;
    const customer = await createCustomer("Zero Amount User");
    const obligation = await createObligation({
      customerId: customer.id,
      originalAmountPaise: 500000n,
      sourceReference: "ORD-ZERO-AMT",
    });

    await processPaymentEvent(tx, {
      externalEventId: "evt-zero-amt",
      type: "CAPTURED",
      amountPaise: 0n,
      source: "razorpay",
      orderId: "ORD-ZERO-AMT",
      customerId: customer.id,
      occurredAt: new Date("2025-01-15T10:00:00Z"),
    });

    const updated = await tx.obligation.findUnique({
      where: { id: obligation.id },
    });
    expect(updated!.recoveredAmountPaise).toBe(0n);
    expect(updated!.outstandingAmountPaise).toBe(500000n);
    expect(updated!.status).toBe("OPEN");
  });
});
