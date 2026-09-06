import { PrismaClient } from "@prisma/client";
import { processPaymentEvent } from "../src/lib/services/payment-event-service";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

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

  // SCENARIO A: Full Recovery — Priya
  // Original: ₹10,000
  // Events: Failed ₹10,000 → Successful ₹6,000 → Successful ₹4,000
  // Final: Recovered, Outstanding ₹0, Decision STOP
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

  await processPaymentEvent(prisma, {
    externalEventId: "seed-flag-1",
    type: "FAILED",
    amountPaise: 1000000n,
    source: "razorpay",
    orderId: "ORD-FLAGSHIP",
    customerId: customers[0].id,
    occurredAt: daysAgo(6),
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-flag-2",
    type: "CAPTURED",
    amountPaise: 600000n,
    source: "razorpay",
    orderId: "ORD-FLAGSHIP",
    customerId: customers[0].id,
    occurredAt: daysAgo(5),
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-flag-3",
    type: "CAPTURED",
    amountPaise: 400000n,
    source: "razorpay",
    orderId: "ORD-FLAGSHIP",
    customerId: customers[0].id,
    occurredAt: daysAgo(5),
  });

  // SCENARIO B: Partial Recovery — Rahul
  // Original: ₹3,500
  // Event: Successful ₹2,000
  // Final: Partially Recovered, Outstanding ₹1,500, Decision ACT
  await prisma.obligation.create({
    data: {
      customerId: customers[1].id,
      originalAmountPaise: 350000n,
      sourceType: "order",
      sourceReference: "ORD-PARTIAL",
      outstandingAmountPaise: 350000n,
      recoveryPolicyId: policy.id,
    },
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-partial-1",
    type: "CAPTURED",
    amountPaise: 200000n,
    source: "razorpay",
    orderId: "ORD-PARTIAL",
    customerId: customers[1].id,
    occurredAt: daysAgo(4),
  });

  // SCENARIO C: Ambiguous — Ananya
  // Two obligations, one ambiguous payment → ESCALATE, exception created
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

  await processPaymentEvent(prisma, {
    externalEventId: "seed-ambig-1",
    type: "CAPTURED",
    amountPaise: 500000n,
    source: "razorpay",
    customerId: customers[2].id,
    occurredAt: daysAgo(3),
  });

  // SCENARIO D: Overpayment — Vikram
  // Original: ₹10,000, Paid: ₹12,000 → OVERPAID
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

  await processPaymentEvent(prisma, {
    externalEventId: "seed-over-1",
    type: "CAPTURED",
    amountPaise: 1200000n,
    source: "razorpay",
    orderId: "ORD-OVERPAY",
    customerId: customers[3].id,
    occurredAt: daysAgo(2),
  });

  // SCENARIO E: Refund after Recovery — Neha
  // Original: ₹10,000, Paid: ₹10,000, Refunded: ₹2,000
  // Final: Partially Recovered, Outstanding ₹2,000
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

  await processPaymentEvent(prisma, {
    externalEventId: "seed-refund-1",
    type: "CAPTURED",
    amountPaise: 1000000n,
    source: "razorpay",
    orderId: "ORD-REFUND",
    customerId: customers[4].id,
    occurredAt: daysAgo(1),
  });

  await processPaymentEvent(prisma, {
    externalEventId: "seed-refund-2",
    type: "REFUND",
    amountPaise: 200000n,
    source: "razorpay",
    orderId: "ORD-REFUND",
    customerId: customers[4].id,
    occurredAt: hoursAgo(18),
  });

  console.log("Seed complete.");
  console.log(`  Customers: ${customers.length}`);
  console.log("  Obligations: 6 (flagship, partial, 2x ambiguous, overpay, refund)");
  console.log("  Scenarios: A=Full Recovery, B=Partial, C=Ambiguous, D=Overpay, E=Refund");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
