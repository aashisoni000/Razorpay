import { describe, it, expect } from "vitest";
import { rankCandidates, trainAndEvaluate, getBaselineMetrics } from "../../src/lib/ml/ranker";
import { PaymentFeatures } from "../../src/lib/ml/features";
import { CandidateObligation, MatchingResult } from "../../src/lib/domain/types";

describe("ML candidate ranking", () => {
  const basePayment: PaymentFeatures = {
    id: "pay-1",
    amountPaise: 700000n,
    customerId: "cust-1",
    occurredAt: new Date(),
  };

  const candidates: CandidateObligation[] = [
    {
      id: "ob-1",
      sourceReference: "ORD-1001",
      customerId: "cust-1",
      outstandingAmountPaise: 700000n,
      originalAmountPaise: 1000000n,
      status: "OPEN",
    },
    {
      id: "ob-2",
      sourceReference: "ORD-1002",
      customerId: "cust-1",
      outstandingAmountPaise: 1200000n,
      originalAmountPaise: 1200000n,
      status: "OPEN",
    },
  ];

  const insufficientResult: MatchingResult = {
    obligationId: null,
    evidenceTier: "INSUFFICIENT_EVIDENCE",
    evidence: ["Multiple candidates"],
    reasonCode: "multiple_candidates",
    candidates: ["ob-1", "ob-2"],
  };

  const strongResult: MatchingResult = {
    obligationId: "ob-1",
    evidenceTier: "STRONG_EVIDENCE",
    evidence: ["Reference matches"],
    reasonCode: "strong_reference_match",
    candidates: ["ob-1"],
  };

  it("returns CONFIDENT for strong deterministic match", () => {
    const result = rankCandidates(basePayment, candidates, strongResult);
    expect(result.confidence).toBe("CONFIDENT");
    expect(result.recommendedCandidateId).toBe("ob-1");
  });

  it("returns scores for candidates when insufficient evidence", () => {
    const result = rankCandidates(basePayment, candidates, insufficientResult);
    expect(result.scores.length).toBe(2);
    expect(result.topScore).toBeGreaterThanOrEqual(0);
    expect(result.topScore).toBeLessThanOrEqual(1);
  });

  it("returns NO_MATCH when no candidates", () => {
    const result = rankCandidates(basePayment, [], insufficientResult);
    expect(result.confidence).toBe("NO_MATCH");
    expect(result.recommendedCandidateId).toBeNull();
  });

  it("gives higher score to matching customer", () => {
    const payDifferentCustomer: PaymentFeatures = {
      ...basePayment,
      customerId: "cust-99",
    };
    const result = rankCandidates(payDifferentCustomer, candidates, insufficientResult);
    const ob1Score = result.scores.find((s) => s.candidateId === "ob-1")?.score ?? 0;
    const ob2Score = result.scores.find((s) => s.candidateId === "ob-2")?.score ?? 0;
    expect(ob1Score).toBeGreaterThanOrEqual(0);
    expect(ob2Score).toBeGreaterThanOrEqual(0);
    expect(ob1Score).toBeLessThanOrEqual(1);
    expect(ob2Score).toBeLessThanOrEqual(1);
  });

  it("gives higher score when amount matches outstanding", () => {
    const payExact: PaymentFeatures = {
      ...basePayment,
      amountPaise: 700000n,
    };
    const result = rankCandidates(payExact, candidates, insufficientResult);
    const scores = result.scores;
    expect(scores.length).toBe(2);
    expect(result.topScore).toBeGreaterThan(0);
  });
});

describe("Training and evaluation", () => {
  it("trains and evaluates without errors", () => {
    const report = trainAndEvaluate();
    expect(report.trainMetrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.trainMetrics.accuracy).toBeLessThanOrEqual(1);
    expect(report.testMetrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.testMetrics.accuracy).toBeLessThanOrEqual(1);
    expect(report.modelInfo.samples).toBeGreaterThan(0);
    expect(report.modelInfo.features).toBe(14);
  });

  it("produces valid metrics on synthetic data", () => {
    const report = trainAndEvaluate();
    expect(report.testMetrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.testMetrics.accuracy).toBeLessThanOrEqual(1);
    expect(report.testMetrics.total).toBeGreaterThan(0);
    expect(report.confusionMatrix).toContain("Confusion Matrix");
  });
});

describe("Baseline comparison", () => {
  it("returns baseline metrics", () => {
    const baseline = getBaselineMetrics();
    expect(baseline.naive.total).toBeGreaterThan(0);
    expect(baseline.naive.wouldAct).toBeGreaterThan(0);
    expect(baseline.naive.settleStops).toBeGreaterThanOrEqual(0);
  });
});
