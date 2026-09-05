# Hard Negative Strategy

## Why Hard Negatives Matter

Easy negatives (e.g., different customer, vastly different amount) are trivially rejected by even simple rules. The model learns nothing useful from them. Hard negatives force the model to learn discriminative features that separate true matches from plausible-but-wrong candidates.

In production, the hardest cases are exactly the ones where ML must be correct: same customer, similar amount, missing reference.

## Hard Negative Categories

### 1. Same Customer, Different Obligation

**Scenario**: Customer has two open obligations. Payment arrives for one, but the other is a candidate.

**Example**:
- Obligation A: ₹10,000 (ORD-A), OPEN
- Obligation B: ₹8,000 (ORD-B), OPEN
- Payment: ₹8,000 from cust-1, no reference

**Hard negative**: Obligation A (same customer, amount is within outstanding)
**True positive**: Obligation B (exact amount match)

**Why hard**: Customer match is the same for both. Amount ratio is similar. Only reference or precise amount distinguishes them.

### 2. Similar Amount, Different Obligation

**Scenario**: Two obligations with similar outstanding amounts. Payment amount is close to both.

**Example**:
- Obligation A: ₹5,000 outstanding
- Obligation B: ₹5,500 outstanding
- Payment: ₹5,200

**Hard negative**: Obligation B (amount is close, within outstanding)
**True positive**: Obligation A (amount is closer)

**Why hard**: amountRatio is similar for both. paymentIsPartial is true for both.

### 3. Similar Reference, Not Exact

**Scenario**: Payment has a reference that is similar but not identical to an obligation's source_reference.

**Example**:
- Obligation: sourceReference = "ORD-1001"
- Payment: orderId = "ORD-100A" (typo/noise)

**Hard negative**: The obligation with "ORD-1001" (reference is close but not exact)
**True positive**: None (this is an escalation case)

**Why hard**: referenceMatch=0, but reference_similarity would be high.

### 4. Missing Reference, Multiple Candidates

**Scenario**: Payment has no reference. Multiple obligations for the same customer have similar amounts.

**Example**:
- Obligation A: ₹10,000, OPEN
- Obligation B: ₹9,500, OPEN
- Payment: ₹9,000, no orderId

**Hard negative**: Both obligations (same customer, amount within outstanding for both)
**True positive**: Depends on ground truth

**Why hard**: No reference signal. Model must rely on amount ratios and status.

### 5. Partial Payment Matching Multiple Obligations

**Scenario**: A partial payment is within the outstanding of multiple obligations.

**Example**:
- Obligation A: ₹20,000 outstanding
- Obligation B: ₹15,000 outstanding
- Payment: ₹5,000

**Hard negative**: Obligation A (payment is partial, within outstanding)
**True positive**: Obligation B (payment is also partial, but perhaps more proportionally aligned)

**Why hard**: paymentIsPartial=1 for both. amountRatio is similar.

### 6. Overpayment Candidate

**Scenario**: Payment exceeds the obligation's outstanding, but is the closest match.

**Example**:
- Obligation A: ₹9,500 outstanding
- Obligation B: ₹10,000 outstanding
- Payment: ₹10,000

**Hard negative**: Obligation B (exact amount match to original, but not outstanding)
**True positive**: Obligation A (overpayment, but closer to outstanding)

**Why hard**: paymentIsExcess=1 for A, paymentIsExact=1 for B. Model must understand that exact original amount doesn't mean exact outstanding.

### 7. Recovered Obligation as Candidate

**Scenario**: An obligation is already RECOVERED but appears as a candidate.

**Example**:
- Obligation A: RECOVERED, ₹0 outstanding
- Obligation B: OPEN, ₹10,000 outstanding
- Payment: ₹10,000

**Hard negative**: Obligation A (same customer, but recovered)
**True positive**: Obligation B

**Why hard**: candidateIsOpen=0 for A, candidateIsOpen=1 for B. But if the model doesn't learn status properly, it could match A.

### 8. Noisy Customer Identity

**Scenario**: Payment has no customerId, but obligation has one.

**Example**:
- Obligation A: cust-1, ₹10,000
- Payment: ₹10,000, customerId=null

**Hard negative**: Obligation A (amount matches, but customer is unknown)
**True positive**: Depends on ground truth

**Why hard**: sameCustomer=0 (because payment has no customerId), but amount matches.

### 9. Late Payment After Window

**Scenario**: Payment arrives after the recovery window has expired.

**Example**:
- Obligation: created 30 days ago, recovery window is 72 hours
- Payment: arrives today

**Hard negative**: The obligation (amount matches, but outside window)
**True positive**: None (escalation case)

**Why hard**: All amount features match, but temporal features don't.

### 10. Duplicate Payment

**Scenario**: Same payment amount, same customer, same timestamp, but different event ID.

**Example**:
- Event 1: ₹10,000, cust-1, ORD-1001
- Event 2: ₹10,000, cust-1, ORD-1001 (duplicate)

**Hard negative**: The same obligation (but this is a duplicate, not a new payment)
**True positive**: The obligation (but only once)

**Why hard**: All features are identical. The model must learn idempotency.

## Distribution Recommendations

For the 100k+ dataset, hard negatives should comprise at least 30-40% of all negative examples. The remaining 60-70% can be easy negatives (different customer, vastly different amount) to ensure the model also learns to reject obviously wrong candidates.

Suggested distribution:
- 30% easy negatives (different customer, amount > 2x outstanding)
- 20% medium negatives (same customer, amount outside outstanding)
- 30% hard negatives (same customer, amount within outstanding, no reference)
- 20% adversarial negatives (similar reference, recovered obligation, overpayment edge cases)
