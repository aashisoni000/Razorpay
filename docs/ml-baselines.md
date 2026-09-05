# Baselines

## Purpose

Baselines establish the minimum performance that any model must exceed. If ML cannot beat simple rules, it should not be deployed.

## Baseline 1: Amount-Only Matching

### Rule

For each payment, select the candidate whose outstanding amount is closest to the payment amount.

```
score(candidate) = 1 / (1 + |payment.amount - candidate.outstanding| / candidate.outstanding)
select candidate with highest score
```

### What It Measures

How much of the matching problem is solved by amount alone. If this baseline achieves 90% accuracy, there is very little room for ML to improve.

### Expected Performance

- High on exact-amount scenarios
- Low on ambiguous scenarios (same customer, similar amounts)
- Cannot handle missing amount or zero outstanding

## Baseline 2: Deterministic Rule-Based Matching

### Rule

Replicate the current deterministic matching logic from `matching.ts`:

1. If payment has a reference that matches a candidate's sourceReference → STRONG match
2. If payment has a reference that doesn't match any candidate → NO match
3. If payment matches exactly one candidate on customer + amount within outstanding → MODERATE match
4. If payment matches multiple candidates on customer + amount → NO match (ambiguous)
5. If no candidates match → NO match

### What It Measures

How well the current deterministic system performs. ML should only be deployed if it improves over this baseline on the ambiguous cases (where deterministic matching returns INSUFFICIENT_EVIDENCE).

### Expected Performance

- Perfect on strong reference matches (by definition)
- Good on single moderate matches
- Zero on ambiguous cases (that's where ML is needed)

## Baseline 3: Logistic Regression (Current Model)

### Model

The current from-scratch logistic regression with 14 features.

### What It Measures

Whether the ML approach can learn meaningful patterns from the features. This is the model we are evaluating against baselines 1 and 2.

### Expected Performance

- Should match or exceed baseline 1 (amount-only)
- Should exceed baseline 2 on ambiguous cases
- Should have well-calibrated confidence scores for abstention

## Experiment Design

### Primary Question

"Does ML improve ambiguous payment-to-obligation matching over deterministic approaches?"

### Evaluation Protocol

1. Train all three models on the same training set
2. Evaluate on the same test set
3. Report metrics for each baseline
4. Focus analysis on the **ambiguous subset** (cases where deterministic matching returns INSUFFICIENT_EVIDENCE)

### Metrics to Report

| Metric | Baseline 1 | Baseline 2 | Baseline 3 |
|--------|-----------|-----------|-----------|
| Overall accuracy | ? | ? | ? |
| Accuracy on ambiguous cases | ? | N/A | ? |
| Top-1 accuracy (ranking) | ? | N/A | ? |
| Top-2 accuracy (ranking) | ? | N/A | ? |
| Abstention rate | 0% | 100% on ambiguous | ? |
| Precision (non-abstained) | ? | ? | ? |
| F1 | ? | ? | ? |

### Decision Criteria

ML should be deployed if:

1. It exceeds baseline 2 on ambiguous cases by ≥ 5% F1
2. Its abstention rate is ≤ 30% (it can resolve most ambiguous cases)
3. Its precision on non-abstained predictions is ≥ 90%
4. It does not degrade performance on non-ambiguous cases
