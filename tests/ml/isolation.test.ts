import { describe, it, expect } from "vitest";
import { rankCandidates, trainAndEvaluate } from "@/lib/ml/ranker";
import { extractFeatures, FEATURE_NAMES } from "@/lib/ml/features";
import { calculateLedger } from "@/lib/domain/ledger";
import { decide } from "@/lib/domain/decision";
import { CandidateObligation, MatchingResult } from "@/lib/domain/types";

describe("ML isolation — ML cannot move money", () => {
  const baseCandidate: CandidateObligation = {
    id: "ob-1",
    sourceReference: "ORD-1001",
    customerId: "cust-1",
    outstandingAmountPaise: 1000000n,
    originalAmountPaise: 1000000n,
    status: "OPEN",
  };

  const payment = {
    id: "pay-1",
    amountPaise: 500000n,
    orderId: "ORD-1001",
    customerId: "cust-1",
    occurredAt: new Date(),
  };

  const ambiguousResult: MatchingResult = {
    obligationId: null,
    evidenceTier: "INSUFFICIENT_EVIDENCE",
    evidence: ["Multiple candidates"],
    reasonCode: "multiple_candidates",
    candidates: ["ob-1", "ob-2"],
  };

  it("rankCandidates returns scores, not amounts", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    expect(result.scores).toBeDefined();
    expect(Array.isArray(result.scores)).toBe(true);
    for (const score of result.scores) {
      expect(typeof score.score).toBe("number");
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }
  });

  it("rankCandidates never returns a monetary amount", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    expect(result).not.toHaveProperty("amountPaise");
    expect(result).not.toHaveProperty("recoveryAmount");
    expect(result).not.toHaveProperty("refundAmount");
    expect(result).not.toHaveProperty("paymentLinkAmount");
  });

  it("rankCandidates never makes financial decisions", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    expect(result).not.toHaveProperty("decision");
    expect(result).not.toHaveProperty("action");
    expect(result).not.toHaveProperty("shouldRecover");
    expect(result).not.toHaveProperty("shouldRefund");
  });

  it("rankCandidates confidence is CONFIDENT, UNCERTAIN, or NO_MATCH only", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    expect(["CONFIDENT", "UNCERTAIN", "NO_MATCH"]).toContain(result.confidence);
  });

  it("ML feature extraction does not include recovery amounts", () => {
    const fv = extractFeatures(payment, baseCandidate, 1);

    expect(fv).not.toHaveProperty("recoveryAmount");
    expect(fv).not.toHaveProperty("refundAmount");
    expect(fv).not.toHaveProperty("paymentLinkAmount");
    expect(fv).not.toHaveProperty("decision");
  });

  it("ML features are only about candidate-payment similarity", () => {
    const featureNames = FEATURE_NAMES;

    for (const name of featureNames) {
      expect([
        "sameCustomer",
        "amountRatio",
        "amountDifferencePaise",
        "hasOrderId",
        "hasInvoiceId",
        "hasSubscriptionId",
        "referenceMatch",
        "outstandingRatio",
        "paymentIsPartial",
        "paymentIsExact",
        "paymentIsExcess",
        "candidateIsOpen",
        "candidateIsPartiallyRecovered",
        "numCandidates",
      ]).toContain(name);
    }
  });

  it("ML model only outputs a probability score", () => {
    const { testMetrics } = trainAndEvaluate();

    expect(typeof testMetrics.precision).toBe("number");
    expect(typeof testMetrics.recall).toBe("number");
    expect(typeof testMetrics.accuracy).toBe("number");
    expect(typeof testMetrics.f1).toBe("number");

    expect(testMetrics).not.toHaveProperty("recoveryAmount");
    expect(testMetrics).not.toHaveProperty("decision");
  });

  it("ML abstention works — UNCERTAIN confidence prevents matching", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    if (result.confidence === "UNCERTAIN") {
      expect(result.recommendedCandidateId).toBeNull();
    }
  });
});

describe("A: Recovery amount is deterministic — ML cannot influence it", () => {
  it("recovery amount = original - recovered, regardless of ML score", () => {
    const obligation = {
      originalAmountPaise: 1000000n,
      paymentEvents: [
        { id: "pay-1", type: "CAPTURED" as const, amountPaise: 600000n },
      ],
    };

    const ledger = calculateLedger(obligation);

    const recoveryAmount =
      obligation.originalAmountPaise - ledger.recoveredAmountPaise;

    expect(recoveryAmount).toBe(400000n);
    expect(ledger.outstandingAmountPaise).toBe(400000n);
  });

  it("ledger calculates outstanding without ML input", () => {
    const obligation = {
      originalAmountPaise: 1000000n,
      paymentEvents: [
        { id: "pay-1", type: "CAPTURED" as const, amountPaise: 600000n },
      ],
    };

    const ledger = calculateLedger(obligation);

    expect(ledger.outstandingAmountPaise).toBe(400000n);
    expect(ledger.recoveredAmountPaise).toBe(600000n);
    expect(ledger.excessAmountPaise).toBe(0n);
  });
});

describe("B: Refund amount is deterministic — ML cannot influence it", () => {
  it("refund reduces recovered amount deterministically", () => {
    const obligation = {
      originalAmountPaise: 1000000n,
      paymentEvents: [
        { id: "pay-1", type: "CAPTURED" as const, amountPaise: 600000n },
        { id: "pay-2", type: "REFUND" as const, amountPaise: 200000n },
      ],
    };

    const ledger = calculateLedger(obligation);

    expect(ledger.recoveredAmountPaise).toBe(600000n);
    expect(ledger.refundedAmountPaise).toBe(200000n);
    expect(ledger.outstandingAmountPaise).toBe(600000n);
  });
});

describe("C: Decision engine is deterministic — ML cannot choose ACT/WAIT/STOP/ESCALATE", () => {
  const policy = {
    maxAttempts: 3,
    recoveryWindowHours: 72,
    cooldownBetweenAttemptsHours: 24,
  };

  it("STOP when outstanding is zero, regardless of ML", () => {
    const decision = decide({
      obligation: {
        id: "ob-1",
        outstandingAmountPaise: 0n,
        status: "RECOVERED",
      },
      policy,
      activeActions: [],
      recentActionTimestamps: [],
      hasUnresolvedAssociation: false,
      now: new Date(),
      paymentCount: 2,
    });

    expect(decision.decision).toBe("STOP");
    expect(decision.reasonCode).toBe("outstanding_zero");
  });

  it("ESCALATE when unresolved association, regardless of ML", () => {
    const decision = decide({
      obligation: {
        id: "ob-1",
        outstandingAmountPaise: 500000n,
        status: "OPEN",
      },
      policy,
      activeActions: [],
      recentActionTimestamps: [],
      hasUnresolvedAssociation: true,
      now: new Date(),
      paymentCount: 0,
    });

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.reasonCode).toBe("unresolved_association");
  });

  it("WAIT when active action exists, regardless of ML", () => {
    const decision = decide({
      obligation: {
        id: "ob-1",
        outstandingAmountPaise: 500000n,
        status: "OPEN",
      },
      policy,
      activeActions: [{ id: "action-1", createdAt: new Date() }],
      recentActionTimestamps: [],
      hasUnresolvedAssociation: false,
      now: new Date(),
      paymentCount: 0,
    });

    expect(decision.decision).toBe("WAIT");
    expect(decision.reasonCode).toBe("action_in_flight");
  });

  it("STOP when max attempts reached, regardless of ML", () => {
    const decision = decide({
      obligation: {
        id: "ob-1",
        outstandingAmountPaise: 500000n,
        status: "OPEN",
      },
      policy,
      activeActions: [],
      recentActionTimestamps: [],
      hasUnresolvedAssociation: false,
      now: new Date(),
      paymentCount: 3,
    });

    expect(decision.decision).toBe("STOP");
    expect(decision.reasonCode).toBe("max_attempts_reached");
  });

  it("ACT when all conditions met, regardless of ML", () => {
    const decision = decide({
      obligation: {
        id: "ob-1",
        outstandingAmountPaise: 500000n,
        status: "OPEN",
      },
      policy,
      activeActions: [],
      recentActionTimestamps: [],
      hasUnresolvedAssociation: false,
      now: new Date(),
      paymentCount: 0,
    });

    expect(decision.decision).toBe("ACT");
    expect(decision.reasonCode).toBe("outstanding_and_policy_allows");
  });
});

describe("D: ML cannot create RecoveryAction directly", () => {
  const payment = {
    id: "pay-1",
    amountPaise: 500000n,
    orderId: "ORD-1001",
    customerId: "cust-1",
    occurredAt: new Date(),
  };

  const baseCandidate: CandidateObligation = {
    id: "ob-1",
    sourceReference: "ORD-1001",
    customerId: "cust-1",
    outstandingAmountPaise: 1000000n,
    originalAmountPaise: 1000000n,
    status: "OPEN",
  };

  const ambiguousResult: MatchingResult = {
    obligationId: null,
    evidenceTier: "INSUFFICIENT_EVIDENCE",
    evidence: ["Multiple candidates"],
    reasonCode: "multiple_candidates",
    candidates: ["ob-1", "ob-2"],
  };

  it("rankCandidates does not return action type or status", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    expect(result).not.toHaveProperty("actionType");
    expect(result).not.toHaveProperty("actionStatus");
    expect(result).not.toHaveProperty("createAction");
  });

  it("rankCandidates does not return payment link details", () => {
    const result = rankCandidates(payment, [baseCandidate], ambiguousResult);

    expect(result).not.toHaveProperty("paymentLinkId");
    expect(result).not.toHaveProperty("paymentLinkUrl");
    expect(result).not.toHaveProperty("paymentLinkAmount");
  });
});

describe("E: ML failure is safe", () => {
  const baseCandidate: CandidateObligation = {
    id: "ob-1",
    sourceReference: "ORD-1001",
    customerId: "cust-1",
    outstandingAmountPaise: 1000000n,
    originalAmountPaise: 1000000n,
    status: "OPEN",
  };

  const ambiguousResult: MatchingResult = {
    obligationId: null,
    evidenceTier: "INSUFFICIENT_EVIDENCE",
    evidence: ["Multiple candidates"],
    reasonCode: "multiple_candidates",
    candidates: ["ob-1", "ob-2"],
  };

  it("empty candidates list returns NO_MATCH without error", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      orderId: "ORD-1001",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const result = rankCandidates(payment, [], ambiguousResult);

    expect(result.confidence).toBe("NO_MATCH");
    expect(result.recommendedCandidateId).toBeNull();
    expect(result.scores).toEqual([]);
  });

  it("ML ranker handles edge case amounts without error", () => {
    const zeroPayment = {
      id: "pay-zero",
      amountPaise: 0n,
      orderId: "ORD-0",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const result = rankCandidates(zeroPayment, [baseCandidate], ambiguousResult);

    expect(["CONFIDENT", "UNCERTAIN", "NO_MATCH"]).toContain(result.confidence);
  });

  it("ML ranker handles very large amounts without error", () => {
    const largePayment = {
      id: "pay-large",
      amountPaise: 999999999999n,
      orderId: "ORD-LARGE",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const result = rankCandidates(largePayment, [baseCandidate], ambiguousResult);

    expect(["CONFIDENT", "UNCERTAIN", "NO_MATCH"]).toContain(result.confidence);
  });
});

describe("F: ML abstention is safe — no silent assignment", () => {
  const ambiguousResult: MatchingResult = {
    obligationId: null,
    evidenceTier: "INSUFFICIENT_EVIDENCE",
    evidence: ["Multiple candidates"],
    reasonCode: "multiple_candidates",
    candidates: ["ob-1", "ob-2"],
  };

  it("UNCERTAIN confidence results in no recommended candidate", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      orderId: "ORD-1001",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const manyCandidates: CandidateObligation[] = Array.from(
      { length: 10 },
      (_, i) => ({
        id: `ob-${i}`,
        sourceReference: `ORD-${i}`,
        customerId: `cust-${i % 3}`,
        outstandingAmountPaise: 1000000n,
        originalAmountPaise: 1000000n,
        status: "OPEN" as const,
      })
    );

    const result = rankCandidates(payment, manyCandidates, ambiguousResult);

    if (result.confidence === "UNCERTAIN") {
      expect(result.recommendedCandidateId).toBeNull();
    }
  });

  it("NO_MATCH confidence results in no recommended candidate", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      orderId: "ORD-1001",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const result = rankCandidates(payment, [], ambiguousResult);

    expect(result.confidence).toBe("NO_MATCH");
    expect(result.recommendedCandidateId).toBeNull();
  });
});

describe("ML safety — deterministic results bypass ML", () => {
  it("STRONG_EVIDENCE bypasses ML ranking", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 1000000n,
      orderId: "ORD-1001",
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const candidate: CandidateObligation = {
      id: "ob-1",
      sourceReference: "ORD-1001",
      customerId: "cust-1",
      outstandingAmountPaise: 1000000n,
      originalAmountPaise: 1000000n,
      status: "OPEN",
    };

    const strongResult: MatchingResult = {
      obligationId: "ob-1",
      evidenceTier: "STRONG_EVIDENCE",
      evidence: ["order_id ORD-1001 exactly matches"],
      reasonCode: "strong_reference_match",
      candidates: ["ob-1"],
    };

    const mlResult = rankCandidates(payment, [candidate], strongResult);

    expect(mlResult.confidence).toBe("CONFIDENT");
    expect(mlResult.recommendedCandidateId).toBe("ob-1");
    expect(mlResult.evidence[0]).toContain("Deterministic");
  });

  it("MODERATE_EVIDENCE with single candidate bypasses ML ranking", () => {
    const payment = {
      id: "pay-1",
      amountPaise: 500000n,
      customerId: "cust-1",
      occurredAt: new Date(),
    };

    const candidate: CandidateObligation = {
      id: "ob-1",
      sourceReference: "ORD-1001",
      customerId: "cust-1",
      outstandingAmountPaise: 1000000n,
      originalAmountPaise: 1000000n,
      status: "OPEN",
    };

    const moderateResult: MatchingResult = {
      obligationId: "ob-1",
      evidenceTier: "MODERATE_EVIDENCE",
      evidence: ["Customer matches", "Single candidate"],
      reasonCode: "single_moderate_match",
      candidates: ["ob-1"],
    };

    const mlResult = rankCandidates(payment, [candidate], moderateResult);

    expect(mlResult.confidence).toBe("CONFIDENT");
    expect(mlResult.recommendedCandidateId).toBe("ob-1");
  });
});
