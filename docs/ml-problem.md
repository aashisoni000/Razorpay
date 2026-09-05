# ML Problem Definition

## Problem Statement

Given a payment **P** and a candidate obligation **O**, predict whether **O** is the correct obligation for **P**.

This is a **pairwise binary classification** problem: for each (payment, candidate) pair, the model outputs P(correct association).

## Why Pairwise Classification/Ranking

When a payment arrives without a strong reference match, multiple obligations may be plausible candidates. The system must:

1. Score each (payment, candidate) pair independently
2. Rank candidates by score
3. Either select the top candidate (if confident) or abstain (if uncertain)

This is naturally a ranking problem because the output for a single payment is a sorted list of candidates, not a single prediction.

## Input

A feature vector derived from:

- **Payment P**: amount, references (orderId, invoiceId, subscriptionId), customerId, timestamp
- **Candidate obligation O**: sourceReference, customerId, outstandingAmountPaise, originalAmountPaise, status
- **Context**: number of candidates, relationship between payment and candidate

## Output

A single probability: P(O is the correct obligation for P).

## Label Definition

| Label | Meaning |
|-------|---------|
| **1** | Correct payment-to-obligation association. The payment was intended for this obligation. |
| **0** | Incorrect candidate. The payment was NOT intended for this obligation. |

Label = 1 means: if this payment were linked to this obligation, the ledger would correctly reflect reality.

Label = 0 means: linking this payment to this obligation would be incorrect.

## What ML Does NOT Determine

The ML model is **assistive only**. It does NOT determine:

- Recovery amount (derived from ledger)
- Ledger balance (computed by `calculateLedger`)
- ACT/WAIT/STOP decision (computed by `decide`)
- Refunds (domain logic)
- Recovery actions (orchestration layer)
- Whether to refund, retry, or escalate

The ML model's sole responsibility: **when deterministic evidence is insufficient, rank candidate obligations by likelihood of being the correct match.**

## Architecture Position

```
Payment Event
    |
    v
Deterministic Matching (reference, customer, amount)
    |
    +-- STRONG_EVIDENCE --> matched (no ML needed)
    +-- MODERATE_EVIDENCE (single candidate) --> matched (no ML needed)
    +-- INSUFFICIENT_EVIDENCE (multiple candidates or no match)
            |
            v
        ML Candidate Ranking
            |
            +-- CONFIDENT --> propose match (audit trail records ML confidence)
            +-- UNCERTAIN --> abstain, create exception, escalate to human
            +-- NO_MATCH --> no candidates available
```

ML is invoked **only** when deterministic matching returns INSUFFICIENT_EVIDENCE and candidates exist. The model never overrides a deterministic match.

## Evaluation Criteria

The model should be evaluated on:

1. **Ranking quality**: Does the correct candidate score highest?
2. **Confidence calibration**: When the model is confident, is it usually right?
3. **Abstention quality**: When the model abstains, would it have been wrong?
4. **Performance on hard negatives**: Does it handle same-customer, similar-amount cases correctly?
