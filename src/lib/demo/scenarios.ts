import { PaymentEventType } from "../domain/types";

export interface ScenarioEvent {
  id: string;
  type: PaymentEventType;
  amountPaise: bigint;
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  customerId: string;
  occurredAt: Date;
}

export interface ScenarioObligation {
  id: string;
  customerId: string;
  originalAmountPaise: bigint;
  sourceReference: string;
  sourceType: string;
}

export interface ScenarioCustomer {
  id: string;
  name: string;
}

export interface ExpectedLedger {
  recoveredAmountPaise: bigint;
  refundedAmountPaise: bigint;
  outstandingAmountPaise: bigint;
  excessAmountPaise: bigint;
  status: string;
}

export interface ExpectedDecision {
  decision: string;
  reasonCode: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  customers: ScenarioCustomer[];
  obligations: ScenarioObligation[];
  events: ScenarioEvent[];
  expectedFinalObligationId: string;
  expectedLedger: ExpectedLedger;
  expectedDecision: ExpectedDecision;
  expectedException: boolean;
  expectedLinkedEvents: string[];
  maxAttempts?: number;
  recoveryWindowHours?: number;
}

const NOW = new Date("2025-01-15T12:00:00Z");

export const scenarios: Scenario[] = [
  {
    id: "simple_success",
    name: "Simple Success",
    description: "Single payment fully settles the obligation",
    customers: [{ id: "cust-1", name: "Customer A" }],
    obligations: [
      {
        id: "ob-simple",
        customerId: "cust-1",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-SIMPLE",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-simple-1",
        type: "CAPTURED",
        amountPaise: 1000000n,
        orderId: "ORD-SIMPLE",
        customerId: "cust-1",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-simple",
    expectedLedger: {
      recoveredAmountPaise: 1000000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 0n,
      excessAmountPaise: 0n,
      status: "RECOVERED",
    },
    expectedDecision: { decision: "STOP", reasonCode: "outstanding_zero" },
    expectedException: false,
    expectedLinkedEvents: ["evt-simple-1"],
  },
  {
    id: "flagship_alternate_payments",
    name: "Flagship — Alternate Payments",
    description:
      "₹10,000 card fails, then ₹6,000 UPI + ₹4,000 UPI succeed. Obligation fully settled.",
    customers: [{ id: "cust-flagship", name: "Priya Sharma" }],
    obligations: [
      {
        id: "ob-flagship",
        customerId: "cust-flagship",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-FLAGSHIP",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-flag-1",
        type: "FAILED",
        amountPaise: 1000000n,
        orderId: "ORD-FLAGSHIP",
        customerId: "cust-flagship",
        occurredAt: new Date("2025-01-15T10:00:00Z"),
      },
      {
        id: "evt-flag-2",
        type: "CAPTURED",
        amountPaise: 600000n,
        orderId: "ORD-FLAGSHIP",
        customerId: "cust-flagship",
        occurredAt: new Date("2025-01-15T10:30:00Z"),
      },
      {
        id: "evt-flag-3",
        type: "CAPTURED",
        amountPaise: 400000n,
        orderId: "ORD-FLAGSHIP",
        customerId: "cust-flagship",
        occurredAt: new Date("2025-01-15T11:00:00Z"),
      },
    ],
    expectedFinalObligationId: "ob-flagship",
    expectedLedger: {
      recoveredAmountPaise: 1000000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 0n,
      excessAmountPaise: 0n,
      status: "RECOVERED",
    },
    expectedDecision: { decision: "STOP", reasonCode: "outstanding_zero" },
    expectedException: false,
    expectedLinkedEvents: ["evt-flag-1", "evt-flag-2", "evt-flag-3"],
  },
  {
    id: "partial_recovery",
    name: "Partial Recovery",
    description: "₹6,500 paid on ₹10,000 obligation. ₹3,500 outstanding.",
    customers: [{ id: "cust-partial", name: "Customer B" }],
    obligations: [
      {
        id: "ob-partial",
        customerId: "cust-partial",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-PARTIAL",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-partial-1",
        type: "CAPTURED",
        amountPaise: 650000n,
        orderId: "ORD-PARTIAL",
        customerId: "cust-partial",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-partial",
    expectedLedger: {
      recoveredAmountPaise: 650000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 350000n,
      excessAmountPaise: 0n,
      status: "PARTIALLY_RECOVERED",
    },
    expectedDecision: {
      decision: "ACT",
      reasonCode: "outstanding_and_policy_allows",
    },
    expectedException: false,
    expectedLinkedEvents: ["evt-partial-1"],
  },
  {
    id: "overpayment",
    name: "Overpayment",
    description: "₹12,000 paid on ₹10,000 obligation. ₹2,000 excess.",
    customers: [{ id: "cust-over", name: "Customer C" }],
    obligations: [
      {
        id: "ob-over",
        customerId: "cust-over",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-OVER",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-over-1",
        type: "CAPTURED",
        amountPaise: 1200000n,
        orderId: "ORD-OVER",
        customerId: "cust-over",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-over",
    expectedLedger: {
      recoveredAmountPaise: 1200000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 0n,
      excessAmountPaise: 200000n,
      status: "OVERPAID",
    },
    expectedDecision: { decision: "STOP", reasonCode: "outstanding_zero" },
    expectedException: false,
    expectedLinkedEvents: ["evt-over-1"],
  },
  {
    id: "refund_after_recovery",
    name: "Refund After Recovery",
    description:
      "Fully recovered, then ₹2,000 refunded. The refund links via orderId and reopens the obligation.",
    customers: [{ id: "cust-refund", name: "Customer D" }],
    obligations: [
      {
        id: "ob-refund",
        customerId: "cust-refund",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-REFUND",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-refund-1",
        type: "CAPTURED",
        amountPaise: 1000000n,
        orderId: "ORD-REFUND",
        customerId: "cust-refund",
        occurredAt: new Date("2025-01-15T10:00:00Z"),
      },
      {
        id: "evt-refund-2",
        type: "REFUND",
        amountPaise: 200000n,
        orderId: "ORD-REFUND",
        customerId: "cust-refund",
        occurredAt: new Date("2025-01-15T11:00:00Z"),
      },
    ],
    expectedFinalObligationId: "ob-refund",
    expectedLedger: {
      recoveredAmountPaise: 1000000n,
      refundedAmountPaise: 200000n,
      outstandingAmountPaise: 200000n,
      excessAmountPaise: 0n,
      status: "PARTIALLY_RECOVERED",
    },
    expectedDecision: {
      decision: "ACT",
      reasonCode: "outstanding_and_policy_allows",
    },
    expectedException: false,
    expectedLinkedEvents: ["evt-refund-1", "evt-refund-2"],
  },
  {
    id: "ambiguous_payment",
    name: "Ambiguous Payment",
    description:
      "Two obligations, one payment without reference. No auto-link.",
    customers: [{ id: "cust-amb", name: "Priya Sharma" }],
    obligations: [
      {
        id: "ob-amb-a",
        customerId: "cust-amb",
        originalAmountPaise: 800000n,
        sourceReference: "ORD-AMB-A",
        sourceType: "order",
      },
      {
        id: "ob-amb-b",
        customerId: "cust-amb",
        originalAmountPaise: 1200000n,
        sourceReference: "ORD-AMB-B",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-amb-1",
        type: "CAPTURED",
        amountPaise: 500000n,
        customerId: "cust-amb",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-amb-a",
    expectedLedger: {
      recoveredAmountPaise: 0n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 800000n,
      excessAmountPaise: 0n,
      status: "OPEN",
    },
    expectedDecision: {
      decision: "ESCALATE",
      reasonCode: "unresolved_association",
    },
    expectedException: true,
    expectedLinkedEvents: [],
  },
  {
    id: "payment_during_recovery",
    name: "Payment During Recovery",
    description:
      "Active recovery link, customer pays via alternate method.",
    customers: [{ id: "cust-recov", name: "Customer E" }],
    obligations: [
      {
        id: "ob-recov",
        customerId: "cust-recov",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-RECOV",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-recov-1",
        type: "CAPTURED",
        amountPaise: 1000000n,
        orderId: "ORD-RECOV",
        customerId: "cust-recov",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-recov",
    expectedLedger: {
      recoveredAmountPaise: 1000000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 0n,
      excessAmountPaise: 0n,
      status: "RECOVERED",
    },
    expectedDecision: { decision: "STOP", reasonCode: "outstanding_zero" },
    expectedException: false,
    expectedLinkedEvents: ["evt-recov-1"],
  },
  {
    id: "duplicate_event",
    name: "Duplicate Event",
    description: "Same event processed twice. One financial effect.",
    customers: [{ id: "cust-dup", name: "Customer F" }],
    obligations: [
      {
        id: "ob-dup",
        customerId: "cust-dup",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-DUP",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-dup-1",
        type: "CAPTURED",
        amountPaise: 500000n,
        orderId: "ORD-DUP",
        customerId: "cust-dup",
        occurredAt: NOW,
      },
      {
        id: "evt-dup-1",
        type: "CAPTURED",
        amountPaise: 500000n,
        orderId: "ORD-DUP",
        customerId: "cust-dup",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-dup",
    expectedLedger: {
      recoveredAmountPaise: 500000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 500000n,
      excessAmountPaise: 0n,
      status: "PARTIALLY_RECOVERED",
    },
    expectedDecision: {
      decision: "ACT",
      reasonCode: "outstanding_and_policy_allows",
    },
    expectedException: false,
    expectedLinkedEvents: ["evt-dup-1"],
  },
  {
    id: "max_attempts",
    name: "Max Attempts Reached",
    description: "3 recovery attempts made. Policy stops further action.",
    customers: [{ id: "cust-max", name: "Customer G" }],
    obligations: [
      {
        id: "ob-max",
        customerId: "cust-max",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-MAX",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-max-1",
        type: "CAPTURED",
        amountPaise: 100000n,
        orderId: "ORD-MAX",
        customerId: "cust-max",
        occurredAt: new Date("2025-01-12T10:00:00Z"),
      },
      {
        id: "evt-max-2",
        type: "CAPTURED",
        amountPaise: 100000n,
        orderId: "ORD-MAX",
        customerId: "cust-max",
        occurredAt: new Date("2025-01-13T10:00:00Z"),
      },
      {
        id: "evt-max-3",
        type: "CAPTURED",
        amountPaise: 100000n,
        orderId: "ORD-MAX",
        customerId: "cust-max",
        occurredAt: new Date("2025-01-14T10:00:00Z"),
      },
    ],
    expectedFinalObligationId: "ob-max",
    expectedLedger: {
      recoveredAmountPaise: 300000n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 700000n,
      excessAmountPaise: 0n,
      status: "PARTIALLY_RECOVERED",
    },
    expectedDecision: { decision: "STOP", reasonCode: "max_attempts_reached" },
    expectedException: false,
    expectedLinkedEvents: ["evt-max-1", "evt-max-2", "evt-max-3"],
    maxAttempts: 3,
  },
  {
    id: "missing_reference",
    name: "Missing Reference",
    description:
      "Payment with no reference and no matching customer. Exception.",
    customers: [{ id: "cust-miss", name: "Customer H" }],
    obligations: [
      {
        id: "ob-miss",
        customerId: "cust-miss",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-MISS",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-miss-1",
        type: "CAPTURED",
        amountPaise: 500000n,
        customerId: "unknown-customer",
        occurredAt: NOW,
      },
    ],
    expectedFinalObligationId: "ob-miss",
    expectedLedger: {
      recoveredAmountPaise: 0n,
      refundedAmountPaise: 0n,
      outstandingAmountPaise: 1000000n,
      excessAmountPaise: 0n,
      status: "OPEN",
    },
    expectedDecision: {
      decision: "ESCALATE",
      reasonCode: "unresolved_association",
    },
    expectedException: true,
    expectedLinkedEvents: [],
  },
  {
    id: "out_of_order_events",
    name: "Out-of-Order Events",
    description:
      "Refund arrives before the payment. Ledger must handle gracefully.",
    customers: [{ id: "cust-ooo", name: "Customer I" }],
    obligations: [
      {
        id: "ob-ooo",
        customerId: "cust-ooo",
        originalAmountPaise: 1000000n,
        sourceReference: "ORD-OOO",
        sourceType: "order",
      },
    ],
    events: [
      {
        id: "evt-ooo-1",
        type: "REFUND",
        amountPaise: 200000n,
        orderId: "ORD-OOO",
        customerId: "cust-ooo",
        occurredAt: new Date("2025-01-15T09:00:00Z"),
      },
      {
        id: "evt-ooo-2",
        type: "CAPTURED",
        amountPaise: 1000000n,
        orderId: "ORD-OOO",
        customerId: "cust-ooo",
        occurredAt: new Date("2025-01-15T10:00:00Z"),
      },
    ],
    expectedFinalObligationId: "ob-ooo",
    expectedLedger: {
      recoveredAmountPaise: 1000000n,
      refundedAmountPaise: 200000n,
      outstandingAmountPaise: 200000n,
      excessAmountPaise: 0n,
      status: "PARTIALLY_RECOVERED",
    },
    expectedDecision: {
      decision: "ACT",
      reasonCode: "outstanding_and_policy_allows",
    },
    expectedException: false,
    expectedLinkedEvents: ["evt-ooo-1", "evt-ooo-2"],
  },
];
