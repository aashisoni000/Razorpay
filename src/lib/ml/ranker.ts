import {
  extractFeatures,
  featuresToVector,
  PaymentFeatures,
  FEATURE_NAMES,
} from "./features";
import {
  trainLogisticRegression,
  predictProbability,
  ModelWeights,
} from "./model";
import { generateDataset, splitDataset, DatasetRow } from "./dataset";
import {
  computeClassificationMetrics,
  computeRankingMetrics,
  confusionMatrixString,
} from "./evaluate";
import { CandidateObligation, MatchingResult } from "../domain/types";

export type MatchConfidence = "CONFIDENT" | "UNCERTAIN" | "NO_MATCH";

export interface MLRankingResult {
  confidence: MatchConfidence;
  recommendedCandidateId: string | null;
  scores: { candidateId: string; score: number }[];
  evidence: string[];
  topScore: number;
  secondScore: number;
  gap: number;
}

let cachedModel: ModelWeights | null = null;

function getModel(): ModelWeights {
  if (cachedModel) return cachedModel;

  const { train } = splitDataset(generateDataset(42), 0.8, 42);
  const trainX = train.map((r) => r.features);
  const trainY = train.map((r) => r.label);

  cachedModel = trainLogisticRegression(trainX, trainY, FEATURE_NAMES, {
    learningRate: 0.2,
    iterations: 1000,
    l2Lambda: 0.001,
  });

  return cachedModel;
}

const SCORE_GAP_THRESHOLD = 0.15;
const MIN_CONFIDENCE_THRESHOLD = 0.6;

export function rankCandidates(
  payment: PaymentFeatures,
  candidates: CandidateObligation[],
  deterministicResult: MatchingResult
): MLRankingResult {
  if (candidates.length === 0) {
    return {
      confidence: "NO_MATCH",
      recommendedCandidateId: null,
      scores: [],
      evidence: ["No candidates available"],
      topScore: 0,
      secondScore: 0,
      gap: 0,
    };
  }

  if (deterministicResult.evidenceTier === "STRONG_EVIDENCE") {
    return {
      confidence: "CONFIDENT",
      recommendedCandidateId: deterministicResult.obligationId,
      scores: candidates.map((c) => ({
        candidateId: c.id,
        score: c.id === deterministicResult.obligationId ? 1 : 0,
      })),
      evidence: [
        "Deterministic strong match already found",
        ...deterministicResult.evidence,
      ],
      topScore: 1,
      secondScore: 0,
      gap: 1,
    };
  }

  if (deterministicResult.evidenceTier === "MODERATE_EVIDENCE" &&
      deterministicResult.candidates.length === 1) {
    return {
      confidence: "CONFIDENT",
      recommendedCandidateId: deterministicResult.obligationId,
      scores: candidates.map((c) => ({
        candidateId: c.id,
        score: c.id === deterministicResult.obligationId ? 1 : 0,
      })),
      evidence: [
        "Single moderate match found deterministically",
        ...deterministicResult.evidence,
      ],
      topScore: 1,
      secondScore: 0,
      gap: 1,
    };
  }

  const model = getModel();
  const scored = candidates.map((c) => {
    const fv = extractFeatures(payment, c, candidates.length);
    const vec = featuresToVector(fv);
    const score = predictProbability(model, vec);
    return { candidateId: c.id, score, candidate: c };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1] ?? { score: 0 };
  const gap = top.score - second.score;

  const evidence: string[] = [];
  if (top.candidate.sourceReference === payment.orderId) {
    evidence.push(`Reference ${payment.orderId} matches obligation source`);
  }
  if (top.candidate.customerId === payment.customerId) {
    evidence.push("Customer matches");
  }
  const amtDiff = Number(payment.amountPaise) - Number(top.candidate.outstandingAmountPaise);
  if (Math.abs(amtDiff) < 100) {
    evidence.push("Amount closely matches outstanding");
  } else if (amtDiff < 0) {
    evidence.push(`Payment covers ${Math.round((Number(payment.amountPaise) / Number(top.candidate.outstandingAmountPaise)) * 100)}% of outstanding`);
  }
  if (gap < SCORE_GAP_THRESHOLD) {
    evidence.push(`Score gap (${gap.toFixed(3)}) below threshold (${SCORE_GAP_THRESHOLD})`);
  }

  if (top.score >= MIN_CONFIDENCE_THRESHOLD && gap >= SCORE_GAP_THRESHOLD) {
    return {
      confidence: "CONFIDENT",
      recommendedCandidateId: top.candidateId,
      scores: scored.map((s) => ({ candidateId: s.candidateId, score: s.score })),
      evidence,
      topScore: top.score,
      secondScore: second.score,
      gap,
    };
  }

  return {
    confidence: "UNCERTAIN",
    recommendedCandidateId: null,
    scores: scored.map((s) => ({ candidateId: s.candidateId, score: s.score })),
    evidence: [
      ...evidence,
      `Model scores too close or below confidence threshold`,
      `Top score: ${top.score.toFixed(3)}, gap: ${gap.toFixed(3)}`,
    ],
    topScore: top.score,
    secondScore: second.score,
    gap,
  };
}

export interface TrainingReport {
  trainMetrics: ReturnType<typeof computeClassificationMetrics>;
  testMetrics: ReturnType<typeof computeClassificationMetrics>;
  rankingMetrics: ReturnType<typeof computeRankingMetrics>;
  modelInfo: { samples: number; features: number; trainedAt: string };
  confusionMatrix: string;
}

export function trainAndEvaluate(): TrainingReport {
  const { train, test } = splitDataset(generateDataset(42), 0.8, 42);

  const trainX = train.map((r) => r.features);
  const trainY = train.map((r) => r.label);
  const testX = test.map((r) => r.features);
  const testY = test.map((r) => r.label);

  const model = trainLogisticRegression(trainX, trainY, FEATURE_NAMES, {
    learningRate: 0.2,
    iterations: 1000,
    l2Lambda: 0.001,
  });

  const trainPreds = trainX.map((x) => (predictProbability(model, x) >= 0.5 ? 1 : 0));
  const testPreds = testX.map((x) => (predictProbability(model, x) >= 0.5 ? 1 : 0));

  const trainMetrics = computeClassificationMetrics(trainPreds, trainY);
  const testMetrics = computeClassificationMetrics(testPreds, testY);

  const candidateGroups = new Map<string, { candidateId: string; score: number; label: number }[]>();
  for (let i = 0; i < test.length; i++) {
    const key = test[i].paymentId;
    if (!candidateGroups.has(key)) {
      candidateGroups.set(key, []);
    }
    candidateGroups.get(key)!.push({
      candidateId: test[i].candidateId,
      score: predictProbability(model, test[i].features),
      label: test[i].label,
    });
  }

  const rankingMetrics = computeRankingMetrics(
    Array.from(candidateGroups.values()),
    SCORE_GAP_THRESHOLD
  );

  return {
    trainMetrics,
    testMetrics,
    rankingMetrics,
    modelInfo: {
      samples: train.length,
      features: FEATURE_NAMES.length,
      trainedAt: model.trainedAt,
    },
    confusionMatrix: confusionMatrixString(testMetrics),
  };
}

export function getBaselineMetrics(): { naive: { wouldAct: number; settleStops: number; total: number } } {
  const { test } = splitDataset(generateDataset(42), 0.8, 42);

  const candidateGroups = new Map<string, DatasetRow[]>();
  for (const row of test) {
    if (!candidateGroups.has(row.paymentId)) {
      candidateGroups.set(row.paymentId, []);
    }
    candidateGroups.get(row.paymentId)!.push(row);
  }

  let naiveActions = 0;
  let settleStops = 0;

  for (const [, rows] of candidateGroups) {
    const hasPositive = rows.some((r) => r.label === 1);
    const hasNegative = rows.some((r) => r.label === 0);

    if (hasPositive || hasNegative) {
      naiveActions++;
    }

    if (hasPositive && hasNegative) {
      const positiveCandidates = rows.filter((r) => r.label === 1);
      const allOwedSame = positiveCandidates.every((r) => {
        const amountFeatureIdx = FEATURE_NAMES.indexOf("amountRatio");
        return r.features[amountFeatureIdx] >= 0.9;
      });
      if (allOwedSame) {
        settleStops++;
      }
    }
  }

  return {
    naive: {
      wouldAct: naiveActions,
      settleStops,
      total: candidateGroups.size,
    },
  };
}
