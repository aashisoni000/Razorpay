# Evaluation Metrics

## Classification Metrics

These metrics evaluate the model's binary predictions (at threshold 0.5):

### Accuracy

```
accuracy = (TP + TN) / (TP + TN + FP + FN)
```

Overall fraction of correct predictions. Misleading if classes are imbalanced.

### Precision

```
precision = TP / (TP + FP)
```

Of the pairs the model predicts as positive, what fraction are actually correct? High precision = few false positives = few wrong matches proposed.

### Recall

```
recall = TP / (TP + FN)
```

Of the actual positive pairs, what fraction does the model identify? High recall = few missed matches.

### F1 Score

```
F1 = 2 * precision * recall / (precision + recall)
```

Harmonic mean of precision and recall. Balances both concerns.

### Confusion Matrix

```
                 Predicted +    Predicted -
  Actual +          TP             FN
  Actual -          FP             TN
```

Provides full picture of error types.

## Ranking Metrics

These metrics evaluate the model's ability to rank candidates correctly for each payment:

### Top-1 Accuracy

For each payment, is the highest-scoring candidate the correct one?

```
top1_accuracy = (payments where top-1 is correct) / total_payments
```

### Top-2 Accuracy

For each payment, is the correct candidate in the top 2?

```
top2_accuracy = (payments where correct candidate is in top-2) / total_payments
```

### MRR (Mean Reciprocal Rank)

Average of 1/rank of the correct candidate across all payments.

```
MRR = (1/N) * sum(1/rank_i)
```

Range: [0, 1]. 1.0 = correct candidate is always ranked first.

### Abstention Rate

When the model abstains (UNCERTAIN), what fraction of payments does this affect?

```
abstention_rate = (payments with UNCERTAIN confidence) / total_payments
```

### Precision Among Non-Abstained

Of the predictions the model actually makes (CONFIDENT only), what fraction are correct?

```
precision_confident = TP_confident / (TP_confident + FP_confident)
```

This is the most important metric for production: when the model proposes a match, how often is it right?

### Coverage

What fraction of payments does the model provide a recommendation for?

```
coverage = (payments with CONFIDENT confidence) / total_payments
```

High coverage = the model can handle most cases. Low coverage = it abstains too often.

## Subset Metrics

### Ambiguous Case Performance

The most important subset: cases where deterministic matching returns INSUFFICIENT_EVIDENCE.

Report all metrics above filtered to only these cases.

### Hard Negative Performance

Report precision and recall on pairs where the negative candidate is a hard negative (same customer, similar amount).

### By Scenario Type

Report metrics separately for each scenario type:

- Exact reference match
- Exact amount match
- Partial payment
- Missing reference
- Overpayment
- Duplicate event
- Late payment

## Production Metrics

### Abstention Quality

When the model abstains, would it have been wrong?

```
abstention_quality = (abstentions where model would have been wrong) / total_abstentions
```

High quality = the model abstains when it would make errors.

### False Positive Severity

When the model makes a wrong match (FP), how severe is the error?

- Severity 1: Wrong obligation, same customer (recoverable)
- Severity 2: Wrong obligation, different customer (requires manual fix)
- Severity 3: Matches a recovered/overpaid obligation (noisy)

## Evaluation Report Format

```
=== Classification Metrics ===
Accuracy:  XX.X%
Precision: XX.X%
Recall:    XX.X%
F1:        XX.X%

Confusion Matrix:
                 Predicted +    Predicted -
  Actual +          XXX            XXX
  Actual -          XXX            XXX

=== Ranking Metrics ===
Top-1 Accuracy:  XX.X%
Top-2 Accuracy:  XX.X%
MRR:             X.XXX
Abstention Rate: XX.X%
Precision (confident): XX.X%
Coverage:        XX.X%

=== Ambiguous Subset ===
(same metrics, filtered to INSUFFICIENT_EVIDENCE cases)

=== Hard Negative Subset ===
(same metrics, filtered to hard negative pairs)

=== Abstention Quality ===
Abstention Quality: XX.X%
```
