import { PrismaClient } from "@prisma/client";

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
  ]);

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

  await prisma.obligation.create({
    data: {
      customerId: customers[0].id,
      originalAmountPaise: 800000n,
      sourceType: "order",
      sourceReference: "ORD-AMBIG-A",
      outstandingAmountPaise: 800000n,
      recoveryPolicyId: policy.id,
    },
  });

  await prisma.obligation.create({
    data: {
      customerId: customers[0].id,
      originalAmountPaise: 1200000n,
      sourceType: "order",
      sourceReference: "ORD-AMBIG-B",
      outstandingAmountPaise: 1200000n,
      recoveryPolicyId: policy.id,
    },
  });

  console.log("Seed complete.");
  console.log(`  Customers: ${customers.length}`);
  console.log("  Obligations: 4 (flagship, partial, 2x ambiguous)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
