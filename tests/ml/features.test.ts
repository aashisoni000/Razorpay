import { describe, it, expect } from "vitest";
import {
  extractFeatures,
  featuresToVector,
  FEATURE_NAMES,
  FEATURE_COUNT,
} from "../../src/lib/ml/features";
import { CandidateObligation } from "../../src/lib/domain/types";

describe("ML feature extraction", () => {
  const baseCandidate: CandidateObligation = {
    id: "ob-1",
    sourceReference: "ORD-1001",
    customerId: "cust-1",
    outstandingAmountPaise: 1000000n,
    originalAmountPaise: 1000000n,
    status: "OPEN",
  };

  it("extracts same-customer feature correctly", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      orderId: "ORD-1001",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fv = extractFeatures(payment, baseCandidate, 1);
    expect(fv.sameCustomer).toBe(1);

    const fvDiff = extractFeatures(
      { ...payment, customerId: "cust-2" },
      baseCandidate,
      1
    );
    expect(fvDiff.sameCustomer).toBe(0);
  });

  it("extracts reference match correctly", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      orderId: "ORD-1001",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fv = extractFeatures(payment, baseCandidate, 1);
    expect(fv.referenceMatch).toBe(1);

    const fvNoMatch = extractFeatures(
      { ...payment, orderId: "WRONG-REF" },
      baseCandidate,
      1
    );
    expect(fvNoMatch.referenceMatch).toBe(0);
  });

  it("extracts amount features correctly", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fv = extractFeatures(payment, baseCandidate, 1);
    expect(fv.paymentIsPartial).toBe(1);
    expect(fv.paymentIsExact).toBe(0);
    expect(fv.paymentIsExcess).toBe(0);
    expect(fv.amountRatio).toBeCloseTo(0.5, 1);
  });

  it("extracts exact amount match", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 1000000n,
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fv = extractFeatures(payment, baseCandidate, 1);
    expect(fv.paymentIsExact).toBe(1);
    expect(fv.paymentIsPartial).toBe(0);
    expect(fv.paymentIsExcess).toBe(0);
  });

  it("extracts excess payment", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 1200000n,
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fv = extractFeatures(payment, baseCandidate, 1);
    expect(fv.paymentIsExcess).toBe(1);
    expect(fv.paymentIsPartial).toBe(0);
    expect(fv.paymentIsExact).toBe(0);
  });

  it("extracts candidate status features", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fvOpen = extractFeatures(payment, baseCandidate, 1);
    expect(fvOpen.candidateIsOpen).toBe(1);
    expect(fvOpen.candidateIsPartiallyRecovered).toBe(0);

    const partialCandidate: CandidateObligation = {
      ...baseCandidate,
      status: "PARTIALLY_RECOVERED",
    };
    const fvPartial = extractFeatures(payment, partialCandidate, 1);
    expect(fvPartial.candidateIsOpen).toBe(0);
    expect(fvPartial.candidateIsPartiallyRecovered).toBe(1);
  });

  it("returns correct number of features", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const fv = extractFeatures(payment, baseCandidate, 1);
    const vec = featuresToVector(fv);
    expect(vec.length).toBe(FEATURE_COUNT);
    expect(FEATURE_NAMES.length).toBe(FEATURE_COUNT);
  });
});
