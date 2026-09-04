import { describe, it, expect } from "vitest";
import { calculateLedger } from "@/lib/domain/ledger";
import { PaymentEventInput } from "@/lib/domain/types";

function cap(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "CAPTURED", amountPaise: amount };
}

function refund(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "REFUND", amountPaise: amount };
}

function failed(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "FAILED", amountPaise: amount };
}

function authorized(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "AUTHORIZED", amountPaise: amount };
}

function link(id: string, amount: bigint): PaymentEventInput {
  return { id, type: "PAYMENT_LINK_EVENT", amountPaise: amount };
}

describe("calculateLedger", () => {
  describe("no payments", () => {
    it("returns full outstanding for empty events", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [],
      });
      expect(result.recoveredAmountPaise).toBe(0n);
      expect(result.refundedAmountPaise).toBe(0n);
      expect(result.outstandingAmountPaise).toBe(1000000n);
      expect(result.excessAmountPaise).toBe(0n);
      expect(result.status).toBe("OPEN");
    });
  });

  describe("full payment", () => {
    it("zero outstanding when exact amount captured", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1000000n)],
      });
      expect(result.recoveredAmountPaise).toBe(1000000n);
      expect(result.outstandingAmountPaise).toBe(0n);
      expect(result.status).toBe("RECOVERED");
    });
  });

  describe("partial payment", () => {
    it("tracks partial recovery", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 650000n)],
      });
      expect(result.recoveredAmountPaise).toBe(650000n);
      expect(result.outstandingAmountPaise).toBe(350000n);
      expect(result.status).toBe("PARTIALLY_RECOVERED");
    });
  });

  describe("multiple payments", () => {
    it("sums multiple captured payments", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 600000n), cap("e2", 400000n)],
      });
      expect(result.recoveredAmountPaise).toBe(1000000n);
      expect(result.outstandingAmountPaise).toBe(0n);
      expect(result.status).toBe("RECOVERED");
    });

    it("handles multiple partial payments", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [
          cap("e1", 200000n),
          cap("e2", 300000n),
          cap("e3", 150000n),
        ],
      });
      expect(result.recoveredAmountPaise).toBe(650000n);
      expect(result.outstandingAmountPaise).toBe(350000n);
      expect(result.status).toBe("PARTIALLY_RECOVERED");
    });
  });

  describe("overpayment", () => {
    it("flags excess when recovered exceeds original", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1200000n)],
      });
      expect(result.recoveredAmountPaise).toBe(1200000n);
      expect(result.outstandingAmountPaise).toBe(0n);
      expect(result.excessAmountPaise).toBe(200000n);
      expect(result.status).toBe("OVERPAID");
    });
  });

  describe("refund after full payment", () => {
    it("reopens obligation when refund received", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1000000n), refund("e2", 200000n)],
      });
      expect(result.recoveredAmountPaise).toBe(1000000n);
      expect(result.refundedAmountPaise).toBe(200000n);
      expect(result.outstandingAmountPaise).toBe(200000n);
      expect(result.status).toBe("PARTIALLY_RECOVERED");
    });
  });

  describe("refund after partial payment", () => {
    it("increases outstanding after refund", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 600000n), refund("e2", 100000n)],
      });
      expect(result.recoveredAmountPaise).toBe(600000n);
      expect(result.refundedAmountPaise).toBe(100000n);
      expect(result.outstandingAmountPaise).toBe(500000n);
      expect(result.status).toBe("PARTIALLY_RECOVERED");
    });
  });

  describe("failed payments", () => {
    it("does not count failed payments as recovered", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [failed("e1", 1000000n)],
      });
      expect(result.recoveredAmountPaise).toBe(0n);
      expect(result.outstandingAmountPaise).toBe(1000000n);
      expect(result.status).toBe("OPEN");
    });

    it("mix of failed and successful payments", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [failed("e1", 1000000n), cap("e2", 600000n)],
      });
      expect(result.recoveredAmountPaise).toBe(600000n);
      expect(result.outstandingAmountPaise).toBe(400000n);
      expect(result.status).toBe("PARTIALLY_RECOVERED");
    });
  });

  describe("authorized but uncaptured", () => {
    it("does not count authorized-only payments", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [authorized("e1", 1000000n)],
      });
      expect(result.recoveredAmountPaise).toBe(0n);
      expect(result.outstandingAmountPaise).toBe(1000000n);
      expect(result.status).toBe("OPEN");
    });
  });

  describe("payment link events", () => {
    it("counts PAYMENT_LINK_EVENT as successful", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [link("e1", 1000000n)],
      });
      expect(result.recoveredAmountPaise).toBe(1000000n);
      expect(result.status).toBe("RECOVERED");
    });
  });

  describe("duplicate events", () => {
    it("does not deduplicate by itself — idempotency is enforced at the application layer", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 500000n), cap("e1", 500000n)],
      });
      expect(result.recoveredAmountPaise).toBe(1000000n);
      expect(result.outstandingAmountPaise).toBe(0n);
    });
  });

  describe("zero-value events", () => {
    it("handles zero-value captured payment", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 0n)],
      });
      expect(result.recoveredAmountPaise).toBe(0n);
      expect(result.outstandingAmountPaise).toBe(1000000n);
      expect(result.status).toBe("OPEN");
    });

    it("handles zero-value refund", () => {
      const result = calculateLedger({
        originalAmountPaise: 1000000n,
        paymentEvents: [cap("e1", 1000000n), refund("e2", 0n)],
      });
      expect(result.refundedAmountPaise).toBe(0n);
      expect(result.outstandingAmountPaise).toBe(0n);
      expect(result.status).toBe("RECOVERED");
    });
  });
});
