import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createRecoveryLink } from "@/lib/services/recovery-service";

vi.mock("@/lib/razorpay/client", () => ({
  getConfig: vi.fn(() => ({
    keyId: "rzp_test_key",
    keySecret: "test_secret",
    webhookSecret: "test_webhook_secret",
  })),
  createPaymentLink: vi.fn(() =>
    Promise.resolve({
      id: "plink_mock_001",
      entity: "payment_link",
      amount: 500000,
      currency: "INR",
      status: "created",
      reference_id: "ORD-MOCK",
      short_url: "https://rzp.io/i/mock",
      created_at: Math.floor(Date.now() / 1000),
    })
  ),
}));

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = new PrismaClient();
  await prisma.auditEntry.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.recoveryAction.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.obligation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.recoveryPolicy.deleteMany();
});

describe("recovery service", () => {
  it("creates payment link using server-derived outstanding amount", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-001",
        outstandingAmountPaise: 500000n,
        recoveredAmountPaise: 500000n,
        status: "PARTIALLY_RECOVERED",
      },
    });

    await prisma.paymentEvent.create({
      data: {
        externalEventId: "evt-existing-001",
        type: "CAPTURED",
        amountPaise: 500000n,
        source: "razorpay",
        obligationId: obligation.id,
        occurredAt: new Date(),
        referenceIds: { orderId: "ORD-001" },
      },
    });

    const { createPaymentLink } = await import("@/lib/razorpay/client");
    const mockCreate = vi.mocked(createPaymentLink);

    const result = await createRecoveryLink(prisma, {
      obligationId: obligation.id,
    });

    expect(result.amountPaise).toBe(500000n);
    expect(result.paymentLinkUrl).toBe("https://rzp.io/i/mock");

    const callArgs = mockCreate.mock.calls[0][1];
    expect(callArgs.amountPaise).toBe(500000);
    expect(callArgs.currency).toBe("INR");
    expect(callArgs.referenceId).toBe("ORD-001");
  });

  it("rejects creation when decision is STOP (outstanding zero)", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-002",
        outstandingAmountPaise: 0n,
        recoveredAmountPaise: 1000000n,
        status: "RECOVERED",
      },
    });

    await expect(
      createRecoveryLink(prisma, { obligationId: obligation.id })
    ).rejects.toThrow("RECOVERED");
  });

  it("cannot create payment link for client-supplied amount", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-003",
        outstandingAmountPaise: 300000n,
        recoveredAmountPaise: 700000n,
        status: "PARTIALLY_RECOVERED",
      },
    });

    await prisma.paymentEvent.create({
      data: {
        externalEventId: "evt-existing-003",
        type: "CAPTURED",
        amountPaise: 700000n,
        source: "razorpay",
        obligationId: obligation.id,
        occurredAt: new Date(),
        referenceIds: { orderId: "ORD-003" },
      },
    });

    const result = await createRecoveryLink(prisma, {
      obligationId: obligation.id,
    });

    expect(result.amountPaise).toBe(300000n);
  });

  it("does not duplicate active recovery actions", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-004",
        outstandingAmountPaise: 500000n,
        recoveredAmountPaise: 500000n,
        status: "PARTIALLY_RECOVERED",
      },
    });

    await prisma.paymentEvent.create({
      data: {
        externalEventId: "evt-existing-004",
        type: "CAPTURED",
        amountPaise: 500000n,
        source: "razorpay",
        obligationId: obligation.id,
        occurredAt: new Date(),
        referenceIds: { orderId: "ORD-004" },
      },
    });

    const result1 = await createRecoveryLink(prisma, {
      obligationId: obligation.id,
    });
    const result2 = await createRecoveryLink(prisma, {
      obligationId: obligation.id,
    });

    expect(result1.actionId).toBe(result2.actionId);

    const actions = await prisma.recoveryAction.findMany({
      where: { obligationId: obligation.id },
    });
    expect(actions.length).toBe(1);
  });

  it("creates audit entry for recovery action", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-005",
        outstandingAmountPaise: 500000n,
        status: "OPEN",
      },
    });

    await createRecoveryLink(prisma, { obligationId: obligation.id });

    const auditEntries = await prisma.auditEntry.findMany({
      where: { obligationId: obligation.id },
    });
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].eventType).toBe("RECOVERY_ACTION_CREATED");
  });

  it("fails clearly when Razorpay API call fails", async () => {
    const { createPaymentLink } = await import("@/lib/razorpay/client");
    vi.mocked(createPaymentLink).mockRejectedValueOnce(
      new Error("Razorpay API error: 400 Bad Request")
    );

    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-006",
        outstandingAmountPaise: 500000n,
        recoveredAmountPaise: 500000n,
        status: "PARTIALLY_RECOVERED",
      },
    });

    await prisma.paymentEvent.create({
      data: {
        externalEventId: "evt-existing-006",
        type: "CAPTURED",
        amountPaise: 500000n,
        source: "razorpay",
        obligationId: obligation.id,
        occurredAt: new Date(),
        referenceIds: { orderId: "ORD-006" },
      },
    });

    await expect(
      createRecoveryLink(prisma, { obligationId: obligation.id })
    ).rejects.toThrow("Razorpay API error");

    const actions = await prisma.recoveryAction.findMany({
      where: { obligationId: obligation.id },
    });
    expect(actions.length).toBe(0);
  });

  it("returns existing action when decision is WAIT (active action exists)", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test User" },
    });
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        originalAmountPaise: 1000000n,
        sourceType: "order",
        sourceReference: "ORD-007",
        outstandingAmountPaise: 500000n,
        recoveredAmountPaise: 500000n,
        status: "PARTIALLY_RECOVERED",
      },
    });

    await prisma.paymentEvent.create({
      data: {
        externalEventId: "evt-existing-007",
        type: "CAPTURED",
        amountPaise: 500000n,
        source: "razorpay",
        obligationId: obligation.id,
        occurredAt: new Date(),
        referenceIds: { orderId: "ORD-007" },
      },
    });

    await prisma.recoveryAction.create({
      data: {
        obligationId: obligation.id,
        type: "payment_link",
        status: "ACTIVE",
        amountPaise: 500000n,
        razorpayPaymentLinkId: "plink_existing",
      },
    });

    const result = await createRecoveryLink(prisma, {
      obligationId: obligation.id,
    });

    expect(result.actionId).toBeDefined();
    expect(result.paymentLinkUrl).toBe("");
  });
});
