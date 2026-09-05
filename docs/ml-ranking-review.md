# Ranking and Abstention Review

## Implementation Location

`src/lib/ml/ranker.ts`

## How Ranking Works

### Step 1: Score Each Candidate

For each candidate obligation, the ranker:
1. Extracts features using `extractFeatures(payment, candidate, totalCandidates)`
2. Converts to vector using `featuresToVector(fv)`
3. Computes probability using `predictProbability(model, vec)`

The score is P(correct association) ∈ [0, 1].

### Step 2: Sort by Score

Candidates are sorted in descending order by score.

### Step 3: Compute Gap

```
topScore = sorted[0].score
secondScore = sorted[1].score (or 0 if only one candidate)
gap = topScore - secondScore
```

### Step 4: Determine Confidence

```
if topScore >= 0.6 AND gap >= 0.15:
    confidence = "CONFIDENT"
    recommendedCandidateId = sorted[0].candidateId
else:
    confidence = "UNCERTAIN"
    recommendedCandidateId = null
```

## Abstention Logic

The model abstains (returns UNCERTAIN) when either:

1. **Top score is too low** (`topScore < 0.6`): The model is not confident that ANY candidate is correct.
2. **Gap is too small** (`gap < 0.15`): The model cannot clearly distinguish the top candidate from the runner-up.

Both conditions must be avoided for a CONFIDENT prediction.

### Why These Thresholds?

- `MIN_CONFIDENCE_THRESHOLD = 0.6`: A probability of 0.6 means the model is only 60% sure. This is too low to propose a match that could affect financial records.
- `SCORE_GAP_THRESHOLD = 0.15`: A gap of 0.15 means the top two candidates are within 15% of each other. The model is essentially guessing between them.

### Production Behavior

| Confidence | Action | Audit Trail |
|-----------|--------|-------------|
| CONFIDENT | Propose match (link payment to obligation) | Records ML scores, gap, evidence |
| UNCERTAIN | Create exception, escalate to human | Records ML scores, gap, evidence |
| NO_MATCH | No candidates available | Records "No candidates" |

**ML never forces a match.** When uncertain, the system escalates. This is the correct behavior for financial systems.

## Short-Circuit Cases

Before invoking the ML model, the ranker checks:

1. **No candidates**: Returns NO_MATCH immediately
2. **STRONG_EVIDENCE**: Returns CONFIDENT with the deterministic match (skips ML)
3. **MODERATE_EVIDENCE with single candidate**: Returns CONFIDENT with the deterministic match (skips ML)

ML is only invoked when `evidenceTier === "INSUFFICIENT_EVIDENCE"` and candidates exist.

## Error Handling

If the ML model throws an error (e.g., feature extraction fails, model is corrupted):

```typescript
try {
  mlResult = rankCandidates(paymentFeatures, candidatesWithRefs, matchResult);
} catch {
  mlResult = null;
}
```

The system falls back to creating an exception without ML context. The payment is not linked. This is safe — ML failure does not cause incorrect matches.

## Evidence Generation

The ranker generates human-readable evidence for the audit trail:

- "Reference {orderId} matches obligation source" (if top candidate's reference matches)
- "Customer matches" (if top candidate's customer matches)
- "Amount closely matches outstanding" (if difference < ₹1)
- "Payment covers X% of outstanding" (if partial)
- "Score gap (X) below threshold (Y)" (if gap is small)

This evidence is stored in the audit entry and exception payload for transparency.

## Issues Found

### Issue 1: Evidence References `top.candidate` Without Null Check

In `ranker.ts:122`:
```typescript
if (top.candidate.sourceReference === payment.orderId) {
```

If `candidates` is empty, `top` could be undefined. However, this code is only reached when `candidates.length > 0` (the empty case returns early at line 58-68). **No bug.**

### Issue 2: Static Cache

```typescript
let cachedModel: ModelWeights | null = null;

function getModel(): ModelWeights {
  if (cachedModel) return cachedModel;
  // ... train and cache
}
```

The model is trained once and cached forever. In production, this means:
- The model never updates with new data
- If the synthetic dataset changes, the cached model is stale

**Impact**: Acceptable for hackathon. In production, the model should be retrained periodically or loaded from a persisted file.

### Issue 3: Training Uses Only 80% of Data

```typescript
const { train } = splitDataset(generateDataset(42), 0.8, 42);
```

The model trains on 80% of the synthetic data. The remaining 20% is used for evaluation in `trainAndEvaluate()`. However, `getModel()` (used in production) also trains on only 80% — it never sees the full dataset.

**Impact**: Minor. The model could perform slightly better with more training data. For the 100k dataset, this should use the full training split.

## Verdict

The ranking and abstention logic is correct and well-designed for a financial system. The thresholds are conservative (appropriate for money-moving decisions). The short-circuit cases avoid unnecessary ML invocation. The error handling is safe.
