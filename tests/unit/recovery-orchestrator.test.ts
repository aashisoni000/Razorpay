import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { orchestrateRecovery } from "@/lib/services/recovery-orchestrator";

vi.mock("@/lib/razorpay/client", () => ({
  getConfig: vi.fn(() => ({
    keyId: "rzp_test_mockkey12345",
    keySecret: "mock_secret",
    webhookSecret: "mock_webhook",
  })),
  createPaymentLink: vi.fn(() =>
    Promise.resolve({
      id: "plink_mock_001",
      entity: "payment_link",
      amount: 350000,
      currency: "INR",
      status: "created",
      reference_id: "ORD-PARTIAL",
      short_url: "https://rzp.io/i/mock",
      created_at: Math.floor(Date.now() / 1000),
    })
  ),
}));

let prisma: PrismaClient;
const originalEnv = { ...process.env };

beforeEach(async () => {
  prisma = new PrismaClient();
  await prisma.auditEntry.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.recoveryAction.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.obligation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.recoveryPolicy.deleteMany();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

async function createTestSetup(opts: {
  originalAmount: bigint;
  recoveredAmount: bigint;
  outstandingAmount: bigint;
  status: string;
  sourceReference: string;
  paymentEvents?: Array<{ externalId: string; type: string; amount: bigint }>;
}) {
  const customer = await prisma.customer.create({
    data: { name: "Test Customer" },
  });
  const obligation = await prisma.obligation.create({
    data: {
      customerId: customer.id,
      originalAmountPaise: opts.originalAmount,
      sourceType: "order",
      sourceReference: opts.sourceReference,
      outstandingAmountPaise: opts.outstandingAmount,
      recoveredAmountPaise: opts.recoveredAmount,
      status: opts.status as never,
    },
  });

  if (opts.paymentEvents) {
    for (const evt of opts.paymentEvents) {
      await prisma.paymentEvent.create({
        data: {
          externalEventId: evt.externalId,
          type: evt.type as never,
          amountPaise: evt.amount,
          source: "razorpay",
          obligationId: obligation.id,
          occurredAt: new Date(),
          referenceIds: { orderId: opts.sourceReference },
        },
      });
    }
  }

  return { customer, obligation };
}

describe("recovery orchestrator", () => {
  describe("ACT creates RecoveryAction", () => {
    it("creates a payment_link action with correct amount", async () => {
      process.env.RAZORPAY_KEY_ID = "rzp_test_realkey12345";
      process.env.RAZORPAY_KEY_SECRET = "real_secret_value";

      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 650000n,
        outstandingAmount: 350000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-PARTIAL",
        paymentEvents: [
          { externalId: "evt-p1", type: "CAPTURED", amount: 650000n },
        ],
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "ACT",
          reasonCode: "outstanding_and_policy_allows",
          evidence: ["₹3,500 remains outstanding"],
        },
      });

      expect(result.actionCreated).toBe(true);
      expect(result.actionId).toBeDefined();

      const action = await prisma.recoveryAction.findUnique({
        where: { id: result.actionId! },
      });
      expect(action).not.toBeNull();
      expect(action!.amountPaise).toBe(350000n);
      expect(action!.type).toBe("payment_link");
      expect(action!.status).toBe("ACTIVE");
      expect(action!.razorpayPaymentLinkId).toBe("plink_mock_001");
    });

    it("uses current outstanding amount from ledger, not obligation field", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 200000n,
        outstandingAmount: 800000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-LEDGER-CHECK",
        paymentEvents: [
          { externalId: "evt-lc1", type: "CAPTURED", amount: 200000n },
        ],
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "ACT",
          reasonCode: "outstanding_and_policy_allows",
          evidence: [],
        },
      });

      const action = await prisma.recoveryAction.findUnique({
        where: { id: result.actionId! },
      });
      expect(action!.amountPaise).toBe(800000n);
    });
  });

  describe("idempotency", () => {
    it("does not duplicate action when ACT repeats", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 500000n,
        outstandingAmount: 500000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-IDEMPOTENT",
        paymentEvents: [
          { externalId: "evt-id1", type: "CAPTURED", amount: 500000n },
        ],
      });

      const decision = {
        decision: "ACT" as const,
        reasonCode: "outstanding_and_policy_allows",
        evidence: [],
      };

      const result1 = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision,
      });
      const result2 = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision,
      });

      expect(result1.actionCreated).toBe(true);
      expect(result2.actionCreated).toBe(false);
      expect(result1.actionId).toBe(result2.actionId);

      const actions = await prisma.recoveryAction.findMany({
        where: { obligationId: obligation.id },
      });
      expect(actions.length).toBe(1);
    });
  });

  describe("STOP resolves actions", () => {
    it("resolves active action to SUCCEEDED", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 1000000n,
        outstandingAmount: 0n,
        status: "RECOVERED",
        sourceReference: "ORD-STOP",
        paymentEvents: [
          { externalId: "evt-s1", type: "CAPTURED", amount: 1000000n },
        ],
      });

      await prisma.recoveryAction.create({
        data: {
          obligationId: obligation.id,
          type: "payment_link",
          status: "ACTIVE",
          amountPaise: 500000n,
          razorpayPaymentLinkId: "plink_old",
        },
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "STOP",
          reasonCode: "outstanding_zero",
          evidence: ["Outstanding balance is ₹0"],
        },
      });

      expect(result.actionResolved).toBe(true);
      expect(result.resolvedCount).toBe(1);

      const action = await prisma.recoveryAction.findFirst({
        where: { obligationId: obligation.id },
      });
      expect(action!.status).toBe("SUCCEEDED");
      expect(action!.resolvedAt).not.toBeNull();
    });

    it("does not create recovery action for STOP", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 1000000n,
        outstandingAmount: 0n,
        status: "RECOVERED",
        sourceReference: "ORD-STOP-NOCREATE",
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "STOP",
          reasonCode: "outstanding_zero",
          evidence: [],
        },
      });

      expect(result.actionCreated).toBe(false);
      expect(result.actionId).toBeNull();

      const actions = await prisma.recoveryAction.findMany({
        where: { obligationId: obligation.id },
      });
      expect(actions.length).toBe(0);
    });

    it("handles STOP with no active actions gracefully", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 1000000n,
        outstandingAmount: 0n,
        status: "RECOVERED",
        sourceReference: "ORD-STOP-EMPTY",
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "STOP",
          reasonCode: "outstanding_zero",
          evidence: [],
        },
      });

      expect(result.actionCreated).toBe(false);
      expect(result.actionResolved).toBe(false);
      expect(result.resolvedCount).toBe(0);
    });
  });

  describe("non-ACT decisions", () => {
    it("does nothing for WAIT", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 500000n,
        outstandingAmount: 500000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-WAIT",
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "WAIT",
          reasonCode: "action_in_flight",
          evidence: [],
        },
      });

      expect(result.actionCreated).toBe(false);
      expect(result.actionResolved).toBe(false);
    });

    it("does nothing for ESCALATE", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 0n,
        outstandingAmount: 1000000n,
        status: "OPEN",
        sourceReference: "ORD-ESCALATE",
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "ESCALATE",
          reasonCode: "unresolved_association",
          evidence: [],
        },
      });

      expect(result.actionCreated).toBe(false);
      expect(result.actionResolved).toBe(false);
    });
  });

  describe("OVERPAID does not create action", () => {
    it("skips when outstanding is zero due to overpayment", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 1200000n,
        outstandingAmount: 0n,
        status: "OVERPAID",
        sourceReference: "ORD-OVERPAY",
        paymentEvents: [
          { externalId: "evt-op1", type: "CAPTURED", amount: 1200000n },
        ],
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "STOP",
          reasonCode: "outstanding_zero",
          evidence: [],
        },
      });

      expect(result.actionCreated).toBe(false);

      const actions = await prisma.recoveryAction.findMany({
        where: { obligationId: obligation.id },
      });
      expect(actions.length).toBe(0);
    });
  });

  describe("audit trail", () => {
    it("creates RECOVERY_ACTION_CREATED audit entry", async () => {
      process.env.RAZORPAY_KEY_ID = "rzp_test_realkey12345";
      process.env.RAZORPAY_KEY_SECRET = "real_secret_value";

      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 650000n,
        outstandingAmount: 350000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-AUDIT",
        paymentEvents: [
          { externalId: "evt-a1", type: "CAPTURED", amount: 650000n },
        ],
      });

      await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "ACT",
          reasonCode: "outstanding_and_policy_allows",
          evidence: [],
        },
      });

      const auditEntries = await prisma.auditEntry.findMany({
        where: {
          obligationId: obligation.id,
          eventType: "RECOVERY_ACTION_CREATED",
        },
      });
      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0].actor).toBe("recovery_orchestrator");

      const stateAfter = auditEntries[0].stateAfter as Record<string, unknown>;
      expect(stateAfter.amountPaise).toBe("350000");
      expect(stateAfter.status).toBe("ACTIVE");
    });

    it("creates RECOVERY_ACTION_RESOLVED audit entry on STOP", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 1000000n,
        outstandingAmount: 0n,
        status: "RECOVERED",
        sourceReference: "ORD-AUDIT-STOP",
      });

      await prisma.recoveryAction.create({
        data: {
          obligationId: obligation.id,
          type: "payment_link",
          status: "ACTIVE",
          amountPaise: 500000n,
        },
      });

      await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "STOP",
          reasonCode: "outstanding_zero",
          evidence: [],
        },
      });

      const auditEntries = await prisma.auditEntry.findMany({
        where: {
          obligationId: obligation.id,
          eventType: "RECOVERY_ACTION_RESOLVED",
        },
      });
      expect(auditEntries.length).toBe(1);

      const stateAfter = auditEntries[0].stateAfter as Record<string, unknown>;
      expect(stateAfter.resolvedCount).toBe(1);
    });
  });

  describe("provider-less development mode", () => {
    it("creates CREATED action when Razorpay credentials are placeholders", async () => {
      process.env.RAZORPAY_KEY_ID = "rzp_test_placeholder";
      process.env.RAZORPAY_KEY_SECRET = "placeholder_secret";

      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 650000n,
        outstandingAmount: 350000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-NO-PROVIDER",
        paymentEvents: [
          { externalId: "evt-np1", type: "CAPTURED", amount: 650000n },
        ],
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "ACT",
          reasonCode: "outstanding_and_policy_allows",
          evidence: [],
        },
      });

      expect(result.actionCreated).toBe(true);

      const action = await prisma.recoveryAction.findUnique({
        where: { id: result.actionId! },
      });
      expect(action!.status).toBe("CREATED");
      expect(action!.razorpayPaymentLinkId).toBeNull();
      expect(action!.amountPaise).toBe(350000n);
    });
  });

  describe("ML isolation", () => {
    it("orchestrator never consults ML for recovery amount", async () => {
      const { obligation } = await createTestSetup({
        originalAmount: 1000000n,
        recoveredAmount: 400000n,
        outstandingAmount: 600000n,
        status: "PARTIALLY_RECOVERED",
        sourceReference: "ORD-ML-ISOLATION",
        paymentEvents: [
          { externalId: "evt-ml1", type: "CAPTURED", amount: 400000n },
        ],
      });

      const result = await orchestrateRecovery(prisma, {
        obligationId: obligation.id,
        decision: {
          decision: "ACT",
          reasonCode: "outstanding_and_policy_allows",
          evidence: [],
        },
      });

      const action = await prisma.recoveryAction.findUnique({
        where: { id: result.actionId! },
      });

      expect(action!.amountPaise).toBe(600000n);

      const mlRelatedAudit = await prisma.auditEntry.findMany({
        where: {
          obligationId: obligation.id,
          eventType: { contains: "ml" },
        },
      });
      expect(mlRelatedAudit.length).toBe(0);
    });
  });
});
