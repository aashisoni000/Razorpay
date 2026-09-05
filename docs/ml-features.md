# ML Feature Audit

## Current 14 Features

### 1. `sameCustomer`

- **Meaning**: Whether the payment's customerId matches the candidate's customerId
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Yes (same customer is a strong signal)
- **Leakage risk**: None. Customer ID is known at payment arrival time.
- **Available at inference**: Yes

### 2. `amountRatio`

- **Meaning**: payment.amountPaise / candidate.outstandingAmountPaise
- **Data type**: Float
- **Range**: [0, 5] (clipped at 5)
- **Higher is better**: Closer to 1.0 is better (exact amount match)
- **Leakage risk**: None. Both values are known at payment arrival time.
- **Available at inference**: Yes
- **Note**: When candidate outstanding is 0, returns 0.

### 3. `amountDifferencePaise`

- **Meaning**: |payment.amountPaise - candidate.outstandingAmountPaise|
- **Data type**: Float (bigint converted to number)
- **Range**: [0, 10,000,000] (clipped)
- **Higher is better**: No (lower difference = better match)
- **Leakage risk**: None. Both values known at payment arrival.
- **Available at inference**: Yes

### 4. `hasOrderId`

- **Meaning**: Whether the payment has an orderId
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Ambiguous (having a reference is good, but doesn't confirm match)
- **Leakage risk**: None. Known at payment arrival.
- **Available at inference**: Yes

### 5. `hasInvoiceId`

- **Meaning**: Whether the payment has an invoiceId
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Ambiguous
- **Leakage risk**: None. Known at payment arrival.
- **Available at inference**: Yes

### 6. `hasSubscriptionId`

- **Meaning**: Whether the payment has a subscriptionId
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Ambiguous
- **Leakage risk**: None. Known at payment arrival.
- **Available at inference**: Yes

### 7. `referenceMatch`

- **Meaning**: Whether the payment's orderId or invoiceId exactly matches the candidate's sourceReference
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Yes (exact reference match is the strongest signal)
- **Leakage risk**: None. Known at payment arrival.
- **Available at inference**: Yes
- **Note**: This feature overlaps with deterministic matching. If referenceMatch=1, deterministic matching would have already returned STRONG_EVIDENCE and ML would not be invoked. However, this is still useful for training because the model learns from examples where deterministic matching fails (referenceMatch=0) but other signals indicate a match.

### 8. `outstandingRatio`

- **Meaning**: candidate.outstandingAmountPaise / candidate.originalAmountPaise
- **Data type**: Float
- **Range**: [0, 5] (clipped at 5)
- **Higher is better**: Higher = more outstanding (more likely to need recovery)
- **Leakage risk**: None. Both values are properties of the obligation, known at payment arrival.
- **Available at inference**: Yes

### 9. `paymentIsPartial`

- **Meaning**: Whether payment.amountPaise < candidate.outstandingAmountPaise
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Ambiguous (partial payment could match multiple obligations)
- **Leakage risk**: None. Both values known at payment arrival.
- **Available at inference**: Yes

### 10. `paymentIsExact`

- **Meaning**: Whether payment.amountPaise === candidate.outstandingAmountPaise
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Yes (exact amount match is a strong signal)
- **Leakage risk**: None. Both values known at payment arrival.
- **Available at inference**: Yes

### 11. `paymentIsExcess`

- **Meaning**: Whether payment.amountPaise > candidate.outstandingAmountPaise
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Ambiguous (overpayment could be intentional or accidental)
- **Leakage risk**: None. Both values known at payment arrival.
- **Available at inference**: Yes

### 12. `candidateIsOpen`

- **Meaning**: Whether candidate.status === "OPEN"
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Yes (OPEN obligations are more likely targets)
- **Leakage risk**: None. Status is known at payment arrival.
- **Available at inference**: Yes

### 13. `candidateIsPartiallyRecovered`

- **Meaning**: Whether candidate.status === "PARTIALLY_RECOVERED"
- **Data type**: Binary (0 or 1)
- **Range**: [0, 1]
- **Higher is better**: Ambiguous (partially recovered means some payment already made)
- **Leakage risk**: None. Status is known at payment arrival.
- **Available at inference**: Yes

### 14. `numCandidates`

- **Meaning**: Total number of candidate obligations for this payment
- **Data type**: Float (integer, capped at 10)
- **Range**: [1, 10]
- **Higher is better**: No (more candidates = more ambiguity)
- **Leakage risk**: None. Known at payment arrival.
- **Available at inference**: Yes
- **Note**: This is a context feature that tells the model how ambiguous the situation is.

## Leakage Assessment

### No Leakage Found

All 14 features use only information available at payment arrival time:

- Payment properties: amount, orderId, invoiceId, subscriptionId, customerId
- Candidate properties: sourceReference, customerId, outstandingAmountPaise, originalAmountPaise, status
- Context: numCandidates

### Features NOT Present (Potential Future Additions)

The following features could be valuable but are not currently extracted:

- **Time difference**: hours between payment.occurredAt and obligation creation time
- **Payment method**: UPI, card, netbanking (if available from Razorpay)
- **Currency**: INR vs other
- **Within recovery window**: whether the payment is within the policy's recovery window
- **Reference similarity**: fuzzy string matching between payment references and candidate references
- **Obligation age**: days since obligation was created
- **Payment history**: number of previous payments for this obligation
- **Customer payment frequency**: how often this customer makes payments
