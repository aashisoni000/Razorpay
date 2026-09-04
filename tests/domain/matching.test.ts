import { describe, it, expect } from "vitest";
import { matchPaymentToObligation } from "@/lib/domain/matching";
import {
  PaymentEventMatchInput,
  CandidateObligation,
} from "@/lib/domain/types";

function makeEvent(
  overrides: Partial<PaymentEventMatchInput> = {}
): PaymentEventMatchInput {
  return {
    id: "evt-1",
    amountPaise: 500000n,
    customerId: "cust-1",
    occurredAt: new Date("2025-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeObligation(
  overrides: Partial<CandidateObligation> = {}
): CandidateObligation {
  return {
    id: "ob-1",
    customerId: "cust-1",
    outstandingAmountPaise: 1000000n,
    status: "OPEN",
    ...overrides,
  };
}

describe("matchPaymentToObligation", () => {
  describe("strong evidence", () => {
    it("matches by order_id", () => {
      const event = makeEvent({ orderId: "ORD-1847" });
      const candidates = [
        makeObligation({ id: "ob-1", sourceReference: "ORD-1847" }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-1");
      expect(result.evidenceTier).toBe("STRONG_EVIDENCE");
      expect(result.evidence[0]).toContain("order_id");
      expect(result.evidence[0]).toContain("ORD-1847");
    });

    it("matches by invoice_id", () => {
      const event = makeEvent({ invoiceId: "INV-200" });
      const candidates = [
        makeObligation({ id: "ob-2", sourceReference: "INV-200" }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-2");
      expect(result.evidenceTier).toBe("STRONG_EVIDENCE");
    });

    it("matches by subscription_id", () => {
      const event = makeEvent({ subscriptionId: "SUB-500" });
      const candidates = [
        makeObligation({ id: "ob-3", sourceReference: "SUB-500" }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-3");
      expect(result.evidenceTier).toBe("STRONG_EVIDENCE");
    });

    it("prefers strong over moderate", () => {
      const event = makeEvent({
        orderId: "ORD-100",
        amountPaise: 500000n,
      });
      const candidates = [
        makeObligation({ id: "ob-a", sourceReference: "ORD-100" }),
        makeObligation({ id: "ob-b", sourceReference: "ORD-999" }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-a");
      expect(result.evidenceTier).toBe("STRONG_EVIDENCE");
    });
  });

  describe("strong evidence - reference not found", () => {
    it("returns INSUFFICIENT when order_id exists but no match", () => {
      const event = makeEvent({ orderId: "ORD-NONE" });
      const candidates = [
        makeObligation({ id: "ob-1", sourceReference: "ORD-OTHER" }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.reasonCode).toBe("reference_not_found");
    });
  });

  describe("moderate evidence", () => {
    it("matches single candidate with same customer and amount within outstanding", () => {
      const event = makeEvent({ amountPaise: 500000n });
      const candidates = [
        makeObligation({ outstandingAmountPaise: 1000000n }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-1");
      expect(result.evidenceTier).toBe("MODERATE_EVIDENCE");
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Customer matches")
      );
    });

    it("matches when payment equals outstanding", () => {
      const event = makeEvent({ amountPaise: 1000000n });
      const candidates = [
        makeObligation({ outstandingAmountPaise: 1000000n }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-1");
      expect(result.evidenceTier).toBe("MODERATE_EVIDENCE");
    });

    it("filters by customer_id", () => {
      const event = makeEvent({ customerId: "cust-1", amountPaise: 500000n });
      const candidates = [
        makeObligation({
          id: "ob-1",
          customerId: "cust-1",
          outstandingAmountPaise: 1000000n,
        }),
        makeObligation({
          id: "ob-2",
          customerId: "cust-2",
          outstandingAmountPaise: 1000000n,
        }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBe("ob-1");
      expect(result.candidates).toEqual(["ob-1"]);
    });

    it("rejects candidates with zero outstanding", () => {
      const event = makeEvent({ amountPaise: 500000n });
      const candidates = [
        makeObligation({ id: "ob-1", outstandingAmountPaise: 0n }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
    });
  });

  describe("insufficient evidence", () => {
    it("returns INSUFFICIENT when multiple candidates match", () => {
      const event = makeEvent({ amountPaise: 500000n });
      const candidates = [
        makeObligation({
          id: "ob-a",
          outstandingAmountPaise: 800000n,
        }),
        makeObligation({
          id: "ob-b",
          outstandingAmountPaise: 1200000n,
        }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.reasonCode).toBe("multiple_candidates");
      expect(result.candidates).toContain("ob-a");
      expect(result.candidates).toContain("ob-b");
    });

    it("returns INSUFFICIENT when no candidates", () => {
      const event = makeEvent();
      const result = matchPaymentToObligation(event, []);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.reasonCode).toBe("no_candidates");
    });

    it("returns INSUFFICIENT when payment exceeds all outstanding", () => {
      const event = makeEvent({ amountPaise: 5000000n });
      const candidates = [
        makeObligation({ outstandingAmountPaise: 1000000n }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.reasonCode).toBe("no_match");
    });

    it("returns INSUFFICIENT when customer does not match", () => {
      const event = makeEvent({ customerId: "cust-99" });
      const candidates = [
        makeObligation({ customerId: "cust-1", outstandingAmountPaise: 1000000n }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
    });
  });

  describe("recovery window", () => {
    it("rejects events outside recovery window", () => {
      const event = makeEvent({
        occurredAt: new Date("2025-01-20T10:00:00Z"),
      });
      const candidates = [
        makeObligation({ outstandingAmountPaise: 1000000n }),
      ];
      const windowExpiry = new Date("2025-01-18T10:00:00Z");
      const result = matchPaymentToObligation(event, candidates, windowExpiry);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.reasonCode).toBe("outside_recovery_window");
    });

    it("accepts events within recovery window", () => {
      const event = makeEvent({
        occurredAt: new Date("2025-01-16T10:00:00Z"),
      });
      const candidates = [
        makeObligation({ outstandingAmountPaise: 1000000n }),
      ];
      const windowExpiry = new Date("2025-01-18T10:00:00Z");
      const result = matchPaymentToObligation(event, candidates, windowExpiry);
      expect(result.obligationId).toBe("ob-1");
      expect(result.evidenceTier).toBe("MODERATE_EVIDENCE");
    });
  });

  describe("edge cases", () => {
    it("excludes STOPPED obligations", () => {
      const event = makeEvent({ amountPaise: 500000n });
      const candidates = [
        makeObligation({ id: "ob-1", status: "STOPPED" }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
    });

    it("excludes RECOVERED obligations", () => {
      const event = makeEvent({ amountPaise: 500000n });
      const candidates = [
        makeObligation({ id: "ob-1", status: "RECOVERED", outstandingAmountPaise: 0n }),
      ];
      const result = matchPaymentToObligation(event, candidates);
      expect(result.obligationId).toBeNull();
      expect(result.evidenceTier).toBe("INSUFFICIENT_EVIDENCE");
    });
  });
});
