# Data Generation Strategy

## Goal

Generate 100,000+ labeled (payment, candidate obligation) pairs with realistic distributions and known ground truth.

## Architecture

```
Synthetic Transaction Generator
    |
    v
Obligations (with known ground truth)
    |
    v
Payments (linked to obligations via ground truth)
    |
    v
Candidate Generation (for each payment, find plausible candidates)
    |
    v
Label Assignment (positive = ground truth obligation, negative = others)
    |
    v
Feature Extraction (compute features for each pair)
    |
    v
Split Assignment (temporal or entity-based)
    |
    v
Dataset Export
```

## Step 1: Generate Obligations

Create ~5,000 obligations with realistic distributions:

| Property | Distribution |
|----------|-------------|
| originalAmountPaise | Log-normal, mean ₹10,000, range ₹500 - ₹100,000 |
| status | 60% OPEN, 25% PARTIALLY_RECOVERED, 10% RECOVERED, 5% OVERPAID |
| sourceType | 80% order, 15% invoice, 5% subscription |
| sourceReference | Format: ORD-{sequential}, INV-{sequential}, SUB-{sequential} |
| customerId | ~500 unique customers, 2-5 obligations per customer on average |
| recoveryWindowHours | 24-168 hours (1-7 days) |
| createdAt | Spread over 90-day window |

## Step 2: Generate Payments

Create ~20,000 payments with known ground truth:

For each payment:
1. Select a target obligation (the ground truth)
2. Generate payment properties that are consistent with the target
3. Record the ground truth: (payment_id, target_obligation_id)

### Payment Amount Distribution

| Scenario | Amount Rule | Frequency |
|----------|------------|-----------|
| Exact match | amount = obligation.outstanding | 25% |
| Partial payment | amount = random(0.2, 0.9) * outstanding | 30% |
| Overpayment | amount = random(1.05, 1.3) * outstanding | 10% |
| Reference match, different amount | amount = random unrelated | 15% |
| Ambiguous amount | amount fits multiple obligations | 20% |

### Payment Reference Distribution

| Scenario | Reference | Frequency |
|----------|-----------|-----------|
| Has orderId | orderId = obligation.sourceReference | 40% |
| Has orderId, wrong ref | orderId = random wrong reference | 15% |
| Has invoiceId | invoiceId = obligation.sourceReference | 10% |
| No reference | orderId = null, invoiceId = null | 35% |

### Payment Customer Distribution

| Scenario | Customer | Frequency |
|----------|----------|-----------|
| Matches obligation | payment.customerId = obligation.customerId | 75% |
| No customer ID | payment.customerId = null | 15% |
| Wrong customer | payment.customerId = random other customer | 10% |

## Step 3: Generate Candidates

For each payment, generate 1-10 candidate obligations:

### Candidate Selection Strategy

1. **Always include the ground truth obligation** (positive example)
2. **Add same-customer obligations** (hard negatives)
3. **Add similar-amount obligations from other customers** (medium negatives)
4. **Add random obligations** (easy negatives)

### Candidate Count Distribution

| Number of Candidates | Frequency |
|---------------------|-----------|
| 1 | 20% (easy: single candidate) |
| 2-3 | 35% (moderate ambiguity) |
| 4-5 | 25% (high ambiguity) |
| 6-10 | 20% (very high ambiguity) |

## Step 4: Label Assignment

For each (payment, candidate) pair:

```
if candidate.id == ground_truth_obligation_id:
    label = 1
else:
    label = 0
```

## Step 5: Scenario Distributions

The dataset should include these scenario types:

| Scenario | Description | Min Pairs |
|----------|-------------|-----------|
| exact_reference | Payment has orderId matching obligation | 15,000 |
| exact_amount | Payment amount = outstanding, no reference | 10,000 |
| partial_payment | Payment < outstanding | 15,000 |
| ambiguous_payment | Payment fits multiple obligations | 20,000 |
| missing_reference | No orderId/invoiceId | 15,000 |
| overpayment | Payment > outstanding | 5,000 |
| refund | REFUND event type | 3,000 |
| duplicate_event | Same event processed twice | 2,000 |
| late_payment | Outside recovery window | 5,000 |
| recovered_obligation | Candidate is already RECOVERED | 5,000 |
| cross_customer | Payment for wrong customer | 5,000 |

## Step 6: Feature Extraction

For each pair, extract features using the same 14-feature schema from `features.ts`, plus any new features defined in the dataset schema.

## Step 7: Split Assignment

### Temporal Split (Primary)

Sort payments by timestamp:
- First 70% → train
- Next 15% → validation
- Last 15% → test

All candidate pairs for a given payment go into the same split.

### Entity Split (Fallback)

If temporal splitting is not possible:
- 70% of customers → train
- 15% of customers → validation
- 15% of customers → test

All payments for a given customer go into the same split.

## Expected Output

| Split | Payments | Pairs (approx) |
|-------|----------|----------------|
| Train | 14,000 | 70,000 |
| Validation | 3,000 | 15,000 |
| Test | 3,000 | 15,000 |
| **Total** | **20,000** | **100,000** |

## Quality Checks

After generation, verify:

1. No payment ID appears in both train and test
2. No customer ID appears in both train and test (for entity split)
3. Positive label ratio is ~20-40% (depends on candidate count)
4. Hard negative ratio is ~30-40% of all negatives
5. Feature distributions are realistic (no extreme outliers from generation bugs)
6. All labels are consistent with ground truth
