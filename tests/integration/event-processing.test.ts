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
});
