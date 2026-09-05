# ML Experiment Plan

## Objective

Evaluate whether ML improves ambiguous payment-to-obligation matching over deterministic approaches.

## Pipeline

```
1. Dataset Generation (100k+ labeled pairs)
    |
    v
2. Feature Extraction (14+ features per pair)
    |
    v
3. Train / Validation / Test Split (temporal or entity-based)
    |
    v
4. Baseline Training
    |   - Baseline 1: Amount-only matching
    |   - Baseline 2: Deterministic rules
    |   - Baseline 3: Logistic regression
    |
    v
5. Evaluation
    |   - Classification metrics (accuracy, precision, recall, F1)
    |   - Ranking metrics (top-1, top-2, MRR)
    |   - Abstention metrics (rate, quality, coverage)
    |
    v
6. Hard-Negative Analysis
    |   - Performance on same-candidate, similar-amount cases
    |   - Performance on missing-reference cases
    |   - Performance on ambiguous cases
    |
    v
7. Production Integration
    |   - Model serialization
    |   - Feature extraction at inference time
    |   - Confidence thresholds
    |   - Abstention/escalation behavior
```

## Dataset

- **Size**: 100,000+ labeled (payment, candidate) pairs
- **Source**: Synthetic transaction generator with known ground truth
- **Schema**: See `docs/ml-dataset-schema.md`
- **Hard negatives**: See `docs/ml-hard-negatives.md`
- **Generation strategy**: See `docs/ml-data-generation.md`

## Features

14 features extracted per (payment, candidate) pair. See `docs/ml-features.md` for full audit.

Key features:
- `sameCustomer`: binary match
- `amountRatio`: payment/outstanding
- `referenceMatch`: exact reference match
- `outstandingRatio`: outstanding/original
- `paymentIsPartial/Exact/Excess`: amount relationship
- `candidateIsOpen/PartiallyRecovered`: status
- `numCandidates`: context

## Model

Logistic regression trained from scratch (no external ML libraries).

See `docs/ml-model-review.md` for implementation review.

Parameters:
- Learning rate: 0.2
- Iterations: 1000
- L2 regularization: 0.001
- Feature scaling: TBD (add for 100k dataset)

## Evaluation

See `docs/ml-evaluation.md` for full metrics definition.

Primary metrics:
- **Top-1 accuracy** on ambiguous cases
- **Precision** among non-abstained predictions
- **Abstention quality** (does the model abstain when it would be wrong?)

## Baselines

See `docs/ml-baselines.md` for baseline definitions.

| Baseline | What It Measures |
|----------|-----------------|
| Amount-only | How much is solved by amount alone |
| Deterministic rules | Current system performance |
| Logistic regression | ML improvement over baselines |

## Decision Criteria

Deploy ML if:
1. F1 on ambiguous cases exceeds deterministic baseline by ≥ 5%
2. Abstention rate ≤ 30%
3. Precision on non-abstained predictions ≥ 90%
4. No degradation on non-ambiguous cases

## Files

| File | Purpose |
|------|---------|
| `src/lib/ml/features.ts` | Feature extraction |
| `src/lib/ml/model.ts` | Logistic regression |
| `src/lib/ml/dataset.ts` | Synthetic dataset generation |
| `src/lib/ml/evaluate.ts` | Metrics computation |
| `src/lib/ml/ranker.ts` | Candidate ranking + abstention |
| `docs/ml-problem.md` | Problem definition |
| `docs/ml-features.md` | Feature audit |
| `docs/ml-dataset-schema.md` | Future dataset schema |
| `docs/ml-hard-negatives.md` | Hard negative strategy |
| `docs/ml-data-generation.md` | Data generation plan |
| `docs/ml-baselines.md` | Baseline definitions |
| `docs/ml-evaluation.md` | Evaluation metrics |
| `docs/ml-model-review.md` | Model implementation review |
| `docs/ml-ranking-review.md` | Ranking/abstention review |
| `docs/ml-leakage-audit.md` | Data leakage audit |
| `docs/ml-experiment.md` | This file |
