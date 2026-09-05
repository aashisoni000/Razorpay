export interface EvaluationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  total: number;
}

export interface RankingMetrics {
  top1Accuracy: number;
  top2Accuracy: number;
  abstentionRate: number;
  confidentCorrect: number;
  uncertainCount: number;
  total: number;
}

export function computeClassificationMetrics(
  predictions: number[],
  actuals: number[]
): EvaluationMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === 1 && actuals[i] === 1) tp++;
    else if (predictions[i] === 1 && actuals[i] === 0) fp++;
    else if (predictions[i] === 0 && actuals[i] === 0) tn++;
    else fn++;
  }

  const total = tp + fp + tn + fn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy,
    precision,
    recall,
    f1,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    total,
  };
}

export function computeRankingMetrics(
  scoresByGroup: { candidateId: string; score: number; label: number }[][],
  threshold: number = 0.1
): RankingMetrics {
  let top1Correct = 0;
  let top2Correct = 0;
  let abstentions = 0;
  let confidentCorrect = 0;
  let uncertain = 0;
  const total = scoresByGroup.length;

  for (const group of scoresByGroup) {
    if (group.length === 0) continue;

    const sorted = [...group].sort((a, b) => b.score - a.score);
    const top1 = sorted[0];
    const top2 = sorted[1];

    if (top1.label === 1) {
      top1Correct++;
      confidentCorrect++;
    }

    if (top2 && top1.score - top2.score < threshold) {
      abstentions++;
      uncertain++;
    } else if (top1.label === 1) {
      // already counted
    }

    const top2Ids = sorted.slice(0, 2).map((s) => s.candidateId);
    const hasCorrectInTop2 = group.some(
      (g) => g.label === 1 && top2Ids.includes(g.candidateId)
    );
    if (hasCorrectInTop2) {
      top2Correct++;
    }
  }

  return {
    top1Accuracy: total > 0 ? top1Correct / total : 0,
    top2Accuracy: total > 0 ? top2Correct / total : 0,
    abstentionRate: total > 0 ? abstentions / total : 0,
    confidentCorrect,
    uncertainCount: uncertain,
    total,
  };
}

export function confusionMatrixString(metrics: EvaluationMetrics): string {
  return (
    `Confusion Matrix:\n` +
    `                 Predicted +    Predicted -\n` +
    `  Actual +       ${String(metrics.truePositives).padStart(5)}        ${String(metrics.falseNegatives).padStart(5)}\n` +
    `  Actual -       ${String(metrics.falsePositives).padStart(5)}        ${String(metrics.trueNegatives).padStart(5)}\n` +
    `\n` +
    `  Accuracy:  ${(metrics.accuracy * 100).toFixed(1)}%\n` +
    `  Precision: ${(metrics.precision * 100).toFixed(1)}%\n` +
    `  Recall:    ${(metrics.recall * 100).toFixed(1)}%\n` +
    `  F1:        ${(metrics.f1 * 100).toFixed(1)}%`
  );
}
