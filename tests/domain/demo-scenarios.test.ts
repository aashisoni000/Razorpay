import { describe, it, expect } from "vitest";
import { calculateLedger } from "@/lib/domain/ledger";
import { matchPaymentToObligation } from "@/lib/domain/matching";
import { decide } from "@/lib/domain/decision";
import { DEFAULT_POLICY } from "@/lib/domain/policies";
import {
  PaymentEventInput,
  PaymentEventMatchInput,
  CandidateObligation,
} from "@/lib/domain/types";

function cap(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "CAPTURED", amountPaise: amount };
}

function failed(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "FAILED", amountPaise: amount };
}

function refund(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "REFUND", amountPaise: amount };
}

describe("demo scenarios", () => {
  describe("FLAGSHIP - obligation fully recovered via multiple payments", () => {
    it("₹10,000 failed then ₹6,000 + ₹4,000 succeeds → STOP", () => {
      const events: PaymentEventInput[] = [
        failed("e1", 1000000n),
        cap("e2", 600000n),
        cap("e3", 400000n),
      ];

      const ledger = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: events,
      });

      expect(ledger.recoveredAmountPaise).toBe(1000000n);
      expect(ledger.outstandingAmountPaise).toBe(0n);
      expect(ledger.status).toBe("RECOVERED");

      const decision = decide({
        obligation: {
          id: "ob-flagship",
          outstandingAmountPaise: ledger.outstandingAmountPaise,
          status: ledger.status,
        },
        policy: DEFAULT_POLICY,
        activeActions: [],
        recentActionTimestamps: [],
        hasUnresolvedAssociation: false,
        now: new Date(),
        paymentCount: 2,
      });

      expect(decision.decision).toBe("STOP");
      expect(decision.reasonCode).toBe("outstanding_zero");
    });
  });

  describe("PARTIAL - partial recovery then full settlement", () => {
    it("₹10,000 obligation, ₹6,500 paid → ACT", () => {
      const ledger = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 650000n)],
      });

      expect(ledger.outstandingAmountPaise).toBe(350000n);
      expect(ledger.status).toBe("PARTIALLY_RECOVERED");

      const decision = decide({
        obligation: {
          id: "ob-partial",
          outstandingAmountPaise: ledger.outstandingAmountPaise,
          status: ledger.status,
        },
        policy: DEFAULT_POLICY,
        activeActions: [],
        recentActionTimestamps: [],
        hasUnresolvedAssociation: false,
        now: new Date(),
        paymentCount: 1,
      });

      expect(decision.decision).toBe("ACT");
      expect(decision.reasonCode).toBe("outstanding_and_policy_allows");
    });
  });

  describe("OVERPAYMENT - recovered exceeds original", () => {
    it("₹10,000 obligation, ₹12,000 paid → STOP, OVERPAID", () => {
      const ledger = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1200000n)],
      });

      expect(ledger.outstandingAmountPaise).toBe(0n);
      expect(ledger.excessAmountPaise).toBe(200000n);
      expect(ledger.status).toBe("OVERPAID");

      const decision = decide({
        obligation: {
          id: "ob-overpay",
          outstandingAmountPaise: ledger.outstandingAmountPaise,
          status: ledger.status,
        },
        policy: DEFAULT_POLICY,
        activeActions: [],
        recentActionTimestamps: [],
        hasUnresolvedAssociation: false,
        now: new Date(),
        paymentCount: 1,
      });

      expect(decision.decision).toBe("STOP");
      expect(decision.reasonCode).toBe("outstanding_zero");
    });
  });

  describe("AMBIGUOUS - no reliable reference", () => {
    it("two candidates, no reference → INSUFFICIENT_EVIDENCE", () => {
      const event: PaymentEventMatchInput = {
        id: "evt-amb",
        amountPaise: 500000n,
        customerId: "cust-priya",
        occurredAt: new Date("2025-01-15T10:00:00Z"),
      };

      const candidates: CandidateObligation[] = [
        {
          id: "ob-003",
          customerId: "cust-priya",
          outstandingAmountPaise: 800000n,
          status: "OPEN",
        },
        {
          id: "ob-004",
          customerId: "cust-priya",
          outstandingAmountPaise: 1200000n,
          status: "OPEN",
        },
      ];

      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.reasonCode).toBe("multiple_candidates");
      expect(result.candidates).toHaveLength(2);
    });
  });

  describe("PAYMENT DURING RECOVERY - settle cancels action", () => {
    it("₹10,000 obligation with active recovery, customer pays elsewhere → STOP", () => {
      const ledger = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1000000n)],
      });

      expect(ledger.outstandingAmountPaise).toBe(0n);

      const decision = decide({
        obligation: {
          id: "ob-recovery",
          outstandingAmountPaise: ledger.outstandingAmountPaise,
          status: ledger.status,
        },
        policy: DEFAULT_POLICY,
        activeActions: [{ id: "act-1", createdAt: new Date() }],
        recentActionTimestamps: [],
        hasUnresolvedAssociation: false,
        now: new Date(),
        paymentCount: 1,
      });

      expect(decision.decision).toBe("STOP");
      expect(decision.reasonCode).toBe("outstanding_zero");
      expect(decision.evidence.some((e) => e.includes("cancel"))).toBe(true);
    });
  });

  describe("REFUND AFTER RECOVERY - obligation reopens", () => {
    it("fully recovered then refunded → outstanding increases", () => {
      const ledger = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1000000n), refund("e2", 200000n)],
      });

      expect(ledger.outstandingAmountPaise).toBe(200000n);
      expect(ledger.status).toBe("PARTIALLY_RECOVERED");

      const decision = decide({
        obligation: {
          id: "ob-refund",
          outstandingAmountPaise: ledger.outstandingAmountPaise,
          status: ledger.status,
        },
        policy: DEFAULT_POLICY,
        activeActions: [],
        recentActionTimestamps: [],
        hasUnresolvedAssociation: false,
        now: new Date(),
        paymentCount: 2,
      });

      expect(decision.decision).toBe("ACT");
    });
  });
});
