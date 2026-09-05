import { PrismaClient } from "@prisma/client";
import { processPaymentEvent } from "../src/lib/services/payment-event-service";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Settle database...");

  await prisma.auditEntry.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.recoveryAction.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.obligation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.recoveryPolicy.deleteMany();

  const policy = await prisma.recoveryPolicy.create({
    data: {
      maxAttempts: 3,
      recoveryWindowHours: 72,
      cooldownBetweenAttemptsHours: 24,
    },
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: { name: "Priya Sharma", externalReference: "cust-priya" },
    }),
    prisma.customer.create({
      data: { name: "Rahul Patel", externalReference: "cust-rahul" },
    }),
    prisma.customer.create({
      data: { name: "Ananya Gupta", externalReference: "cust-ananya" },
    }),
    prisma.customer.create({
      data: { name: "Vikram Singh", externalReference: "cust-vikram" },
    }),
    prisma.customer.create({
      data: { name: "Neha Kapoor", externalReference: "cust-neha" },
    }),
  ]);

  // SCENARIO 1: Failed card → alternate payments → settled → STOP
  await prisma.obligation.create({
    data: {
      customerId: customers[0].id,
      originalAmountPaise: 1000000n,
      sourceType: "order",
      sourceReference: "ORD-FLAGSHIP",
      outstandingAmountPaise: 1000000n,
      recoveryPolicyId: policy.id,
    },
  });

  // SCENARIO 2: Partial payment → recovery decision ACT
  await prisma.obligation.create({
    data: {
      customerId: customers[1].id,
      originalAmountPaise: 1000000n,
      sourceType: "order",
      sourceReference: "ORD-PARTIAL",
      outstandingAmountPaise: 1000000n,
      recoveryPolicyId: policy.id,
    },
  });

  // SCENARIO 3: Two obligations → ambiguous payment → ESCALATE
  await prisma.obligation.create({
    data: {
      customerId: customers[2].id,
      originalAmountPaise: 800000n,
      sourceType: "order",
      sourceReference: "ORD-AMB-A",
      outstandingAmountPaise: 800000n,
      recoveryPolicyId: policy.id,
    },
  });

  await prisma.obligation.create({
    data: {
      customerId: customers[2].id,
      originalAmountPaise: 1200000n,
      sourceType: "order",
      sourceReference: "ORD-AMB-B",
      outstandingAmountPaise: 1200000n,
      recoveryPolicyId: policy.id,
    },
  });

  // SCENARIO 4: Overpayment → OVERPAID → no refund
  await prisma.obligation.create({
    data: {
      customerId: customers[3].id,
      originalAmountPaise: 1000000n,
      sourceType: "order",
      sourceReference: "ORD-OVERPAY",
      outstandingAmountPaise: 1000000n,
      recoveryPolicyId: policy.id,
    },
  });

  // SCENARIO 5: Refund after recovery → outstanding increases
  await prisma.obligation.create({
    data: {
      customerId: customers[4].id,
      originalAmountPaise: 1000000n,
      sourceType: "order",
      sourceReference: "ORD-REFUND",
      outstandingAmountPaise: 1000000n,
      recoveryPolicyId: policy.id,
    },
  });

  // Process events through the real pipeline

  // SCENARIO 1: Flagship - failed card, then two UPI payments
  console.log("Processing Scenario 1: Flagship alternate payments...");
  await processPaymentEvent(prisma, {
    externalEventId: "seed-flag-1",
    type: "FAILED",
    amountPaise: 1000000n,
    source: "razorpay",
    orderId: "ORD-FLAGSHIP",
    customerId: customers[0].id,
    occurredAt: new Date("2025-01-15T10:00:00Z"),
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-flag-2",
    type: "CAPTURED",
    amountPaise: 600000n,
    source: "razorpay",
    orderId: "ORD-FLAGSHIP",
    customerId: customers[0].id,
    occurredAt: new Date("2025-01-15T10:30:00Z"),
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-flag-3",
    type: "CAPTURED",
    amountPaise: 400000n,
    source: "razorpay",
    orderId: "ORD-FLAGSHIP",
    customerId: customers[0].id,
    occurredAt: new Date("2025-01-15T11:00:00Z"),
  });

  // SCENARIO 2: Partial payment
  console.log("Processing Scenario 2: Partial payment...");
  await processPaymentEvent(prisma, {
    externalEventId: "seed-partial-1",
    type: "CAPTURED",
    amountPaise: 650000n,
    source: "razorpay",
    orderId: "ORD-PARTIAL",
    customerId: customers[1].id,
    occurredAt: new Date("2025-01-15T10:00:00Z"),
  });

  // SCENARIO 3: Ambiguous payment (no reference, multiple candidates)
  console.log("Processing Scenario 3: Ambiguous payment...");
  await processPaymentEvent(prisma, {
    externalEventId: "seed-ambig-1",
    type: "CAPTURED",
    amountPaise: 500000n,
    source: "razorpay",
    customerId: customers[2].id,
    occurredAt: new Date("2025-01-15T10:00:00Z"),
  });

  // SCENARIO 4: Overpayment
  console.log("Processing Scenario 4: Overpayment...");
  await processPaymentEvent(prisma, {
    externalEventId: "seed-over-1",
    type: "CAPTURED",
    amountPaise: 1200000n,
    source: "razorpay",
    orderId: "ORD-OVERPAY",
    customerId: customers[3].id,
    occurredAt: new Date("2025-01-15T10:00:00Z"),
  });

  // SCENARIO 5: Refund after recovery
  console.log("Processing Scenario 5: Refund after recovery...");
  await processPaymentEvent(prisma, {
    externalEventId: "seed-refund-1",
    type: "CAPTURED",
    amountPaise: 1000000n,
    source: "razorpay",
    orderId: "ORD-REFUND",
    customerId: customers[4].id,
    occurredAt: new Date("2025-01-15T10:00:00Z"),
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-refund-2",
    type: "REFUND",
    amountPaise: 200000n,
    source: "razorpay",
    orderId: "ORD-REFUND",
    customerId: customers[4].id,
    occurredAt: new Date("2025-01-15T11:00:00Z"),
  });

  console.log("Seed complete.");
  console.log(`  Customers: ${customers.length}`);
  console.log("  Obligations: 6 (flagship, partial, 2x ambiguous, overpay, refund)");
  console.log("  Scenarios demonstrated: 5 of 6");
  console.log("  (Scenario 6: Active recovery → customer pays requires Razorpay Test Mode)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
