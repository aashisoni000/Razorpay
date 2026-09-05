# Pair Construction from ReconRiver

## Overview

This document describes how to construct supervised training pairs from ReconRiver's published reconciliation relationships.

## The Mapping

ReconRiver's ground truth says: "Internal payment `I` corresponds to processor transaction `P`."

For Settle's ML problem, we map:
- **Payment** = internal_transaction
- **Candidate obligation** = processor_transaction (from the same or different merchant_order_id)
- **Correct association** = ground truth links `internal_payment_id` to `processor_transaction_id`

## Pair Types

### Type 1: Positive Pair (same order, correct processor)

```
Payment: internal_transaction with order_id O
Candidate: processor_transaction with order_id O (the one in ground truth)
Label: 1 (correct match)
```

**Source**: ground truth `expected_reconciliation.csv` where `result_scope = ORDER` and both `internal_payment_id` and `processor_transaction_id` are non-empty.

### Type 2: Negative Pair (same order, wrong processor)

```
Payment: internal_transaction with order_id O
Candidate: processor_transaction with order_id O (NOT the one in ground truth)
Label: 0 (incorrect match)
```

**When this exists**: When a merchant_order_id has multiple processor records (e.g., CAPTURE + REFUND). The CAPTURE is the positive match; the REFUND is the negative.

### Type 3: Hard Negative Pair (different order, similar characteristics)

```
Payment: internal_transaction with order_id O1
Candidate: processor_transaction with order_id O2 (O2 ≠ O1)
Label: 0 (incorrect match)
```

**When this exists**: When two different orders have similar amounts, currencies, or timestamps. These are the hardest cases for the model.

## Construction Algorithm

```
for each scenario in [clean-settlement, mixed-exceptions, month-end-close, failure-recovery]:
    load internal_transactions.csv
    load processor_transactions.csv
    load expected_reconciliation.csv

    # Build ground truth map
    gt = {}
    for row in expected_reconciliation:
        if row.result_scope == "ORDER":
            gt[row.internal_payment_id] = row.processor_transaction_id

    # Build processor lookup by order_id
    proc_by_order = defaultdict(list)
    for row in processor_transactions:
        proc_by_order[row.merchant_order_id].append(row)

    # Construct pairs
    for int_row in internal_transactions:
        ipid = int_row.internal_payment_id
        order = int_row.merchant_order_id

        if ipid not in gt:
            continue  # No ground truth

        correct_proc_id = gt[ipid]
        candidates = proc_by_order[order]

        for proc_row in candidates:
            label = 1 if proc_row.processor_transaction_id == correct_proc_id else 0
            pair = {
                "payment": extract_payment_features(int_row),
                "candidate": extract_candidate_features(proc_row),
                "label": label,
                "scenario": scenario,
                "internal_payment_id": ipid,
                "processor_transaction_id": proc_row.processor_transaction_id,
            }
            yield pair
```

## Pair Counts (Actual)

### From Published Data

| Scenario | Positive | Negative (same order) | Total |
|----------|----------|-----------------------|-------|
| clean-settlement | 100 | 0 | 100 |
| mixed-exceptions | 1,010 | 50 | 1,060 |
| month-end-close | 9,970 | 210 | 10,180 |
| failure-recovery | 10,150 | 50 | 10,200 |
| **Total** | **21,230** | **310** | **21,540** |

### Multi-Candidate Only (Where ML Is Useful)

| Metric | Count |
|--------|-------|
| Positive | 550 |
| Negative | 310 |
| Total | 860 |

### With Hard Negatives (different order, same amount)

| Scenario | Hard Negatives |
|----------|---------------|
| clean-settlement | 0 |
| mixed-exceptions | 2 |
| month-end-close | 935 |
| failure-recovery | 963 |
| **Total** | **1,900** |

**Grand Total**: 21,540 pairs (21,230 positive + 310 negative + 1,900 hard negative from same-order and cross-order)

But note: hard negatives from different orders are NOT valid for the Settle problem unless we define "candidate obligations" as all obligations from the same customer. Since processor records have no customer field, cross-order hard negatives require inference.

## What 100k+ Would Require

### Current Limitation

ReconRiver has ~21k valid pairs. The multi-candidate subset (where ML adds value) is ~860 pairs.

### Paths to 100k+

1. **Additional public datasets**: No other public reconciliation datasets with ground truth were identified.

2. **Synthetic augmentation**: Generate additional processor records per order (e.g., multiple CAPTURE events, different fee amounts). This is synthetic but grounded in ReconRiver's patterns. **The user said not to do this yet.**

3. **50M dataset integration**: Use the 50M dataset's transaction patterns to generate candidate obligations. But the 50M dataset has no ground truth, so labels would be fabricated. **Not allowed.**

4. **Production data**: Real Razorpay transaction logs with labeled ground truth. **Not available for hackathon.**

### Honest Assessment

**With published ReconRiver data only: ~21k pairs, ~860 multi-candidate.**

This is sufficient for:
- Validating the ML pipeline
- Training a small logistic regression
- Demonstrating the concept

This is NOT sufficient for:
- 100k+ pairs
- Production-grade model training
- Statistically significant evaluation across all exception types

## Feature Extraction

For each pair (payment, candidate), extract:

```typescript
{
  // Payment features
  paymentAmount: number,          // internal.gross_amount
  paymentCurrency: string,        // internal.currency
  paymentReference: string,       // internal.merchant_order_id
  paymentStatus: string,          // internal.payment_status
  paymentMethod: string,          // internal.payment_method
  paymentTimestamp: Date,         // internal.occurred_at
  paymentCustomerRef: string,     // internal.synthetic_customer_reference

  // Candidate features
  candidateAmount: number,        // processor.gross_amount
  candidateFee: number,           // processor.fee_amount
  candidateNet: number,           // processor.net_amount
  candidateCurrency: string,      // processor.currency
  candidateStatus: string,        // processor.processor_status
  candidateEventType: string,     // processor.processor_event_type
  candidateTimestamp: Date,       // processor.processor_event_time
  candidateSettlementBatch: string, // processor.settlement_batch_id

  // Derived features
  sameCurrency: boolean,          // payment.currency == candidate.currency
  amountRatio: number,            // payment.amount / candidate.amount
  amountDifference: number,       // payment.amount - candidate.amount
  feeRatio: number,               // candidate.fee / candidate.amount
  timeDifferenceMinutes: number,  // candidate.timestamp - payment.timestamp

  // Label
  label: 0 | 1,
}
```

## Split Strategy

| Split | Scenarios | Rationale |
|-------|-----------|-----------|
| Train | clean-settlement + mixed-exceptions | Small, diverse exceptions |
| Validation | month-end-close | Larger, different exception mix |
| Test | failure-recovery | Different failure modes |

**Why scenario-aware**: Entity IDs (customers, orders) overlap across scenarios. Random splitting would leak entities between train and test.

## Limitations to Document

1. **No customer field on processor records** — cannot compute `same_customer` feature directly
2. **95% of ground truth is MATCHED** — heavy class imbalance
3. **Only 860 multi-candidate pairs** — small ML training set
4. **Synthetic data** — patterns may not generalize to real payments
5. **Same seed across scenarios** — all scenarios start at 2026-01-01, no temporal variation
6. **One order = one customer** — no multi-order customers within a scenario (0 customers have multiple orders)
