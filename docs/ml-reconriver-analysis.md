# ReconRiver Deep Analysis

## 1. What ReconRiver Actually Contains

ReconRiver is a **payment reconciliation** dataset, not an obligation-matching dataset. It models the question: "Did the internal ledger, payment processor, and bank settlement all agree on this transaction?"

### Files Per Scenario Pack

| File | Purpose | Example Columns |
|------|---------|----------------|
| `internal_transactions.csv` | Merchant-side payment records | internal_payment_id, merchant_order_id, gross_amount, currency, payment_status, payment_method, synthetic_customer_reference |
| `processor_transactions.csv` | Payment processor records | processor_transaction_id, merchant_order_id, processor_event_type, gross_amount, fee_amount, net_amount, currency, settlement_batch_id, processor_status |
| `bank_settlements.csv` | Bank deposit records | bank_entry_id, settlement_batch_id, booked_at, credited_amount, currency, bank_reference |
| `expected_reconciliation.csv` | **Ground truth** linking all three | scenario_id, result_scope, work_key, internal_payment_id, processor_transaction_id, bank_entry_id, expected_outcome, expected_reason_code, expected_difference, explanation |
| `scenario_manifest.json` | Generation parameters | generator_version, currencies, checksums |

### Row Counts

| Scenario | Internal | Processor | Bank | Ground Truth | Exception Rate |
|----------|----------|-----------|------|--------------|----------------|
| clean-settlement | 100 | 100 | 7 | 107 | 0% |
| mixed-exceptions | 1,010 | 1,075 | 219 | 1,244 | ~20% |
| month-end-close | 10,000 | 10,200 | 1,499 | 11,539 | ~4% |
| failure-recovery | 10,100 | 10,200 | 1,319 | 11,369 | ~5% |
| **Total** | **21,210** | **21,575** | **3,044** | **24,259** | |

### Identifiers

| Identifier | Scope | Links To |
|-----------|-------|----------|
| `internal_payment_id` | Per payment | internal ↔ processor ↔ ground_truth |
| `merchant_order_id` | Per order | internal ↔ processor |
| `processor_transaction_id` | Per processor event | processor ↔ ground_truth |
| `settlement_batch_id` | Per settlement batch | processor ↔ bank |
| `bank_entry_id` | Per bank deposit | bank ↔ ground_truth |
| `synthetic_customer_reference` | Per customer | internal only (processor has NO customer field) |
| `work_key` | Logical identity in ground truth | Usually merchant_order_id for ORDER scope |

### Ground Truth Outcomes

| Outcome | Count | % | Meaning |
|---------|-------|---|---------|
| MATCHED | 23,046 | 95.0% | Internal ↔ processor ↔ bank all agree |
| AMOUNT_MISMATCH | 183 | 0.8% | Bank credit differs from processor net sum |
| PARTIAL_REFUND | 120 | 0.5% | Refund reverses part of gross amount |
| DUPLICATE_PROCESSOR | 120 | 0.5% | Multiple processor rows for same ID |
| REFUND_MATCHED | 120 | 0.5% | Full refund linked to original payment |
| MISSING_PROCESSOR | 115 | 0.5% | Internal has no matching processor |
| DUPLICATE_INTERNAL | 110 | 0.5% | Multiple internal rows for same ID |
| INVALID_SOURCE_ROW | 105 | 0.4% | Processor row has invalid data |
| AMBIGUOUS_MATCH | 70 | 0.3% | Multiple candidates, unclear which matches |
| DUPLICATE_BANK_ENTRY | 60 | 0.2% | Multiple bank entries for same batch |
| LATE_SETTLEMENT | 60 | 0.2% | Bank booked outside settlement window |
| FEE_MISMATCH | 40 | 0.2% | Processor fee differs from policy |
| CURRENCY_MISMATCH | 40 | 0.2% | Internal and processor currencies differ |
| MISSING_INTERNAL | 40 | 0.2% | Processor has no matching internal |
| MISSING_BANK_SETTLEMENT | 30 | 0.1% | No bank deposit for processor batch |

## 2. Ground Truth Trace

### MATCHED Example (clean-settlement)

```
Internal: SYNTH-INT-000001
  merchant_order_id: SYNTH-ORDER-000001
  gross_amount: 1278.74, currency: GBP
  payment_status: CAPTURED
  customer: SYNTH-CUSTOMER-000001

Processor: SYNTH-PROC-000001
  merchant_order_id: SYNTH-ORDER-000001  ← SAME ORDER ID
  gross_amount: 1278.74, fee: 37.38, net: 1241.36
  currency: GBP, status: SETTLED

Ground Truth:
  result_scope: ORDER
  work_key: SYNTH-ORDER-000001
  expected_outcome: MATCHED
  expected_reason_code: L1_EXACT_ORDER_MATCH
  explanation: "Merchant order ID, currency, gross amount and configured processor fee all match."
```

**Link**: `merchant_order_id` is the join key. Internal and processor share the same order ID → MATCHED.

### AMBIGUOUS_MATCH Example (month-end-close)

```
Internal: SYNTH-INT-001044
  merchant_order_id: SYNTH-ORDER-001044
  gross_amount: 2450.63, currency: USD

Processor: SYNTH-PROC-001044
  merchant_order_id: SYNTH-ORDER-001044  ← SAME ORDER ID
  gross_amount: 2450.63, fee: 71.37, net: 2379.26

Ground Truth:
  expected_outcome: AMBIGUOUS_MATCH
  expected_reason_code: L1_AMBIGUOUS_CARDINALITY
  explanation: "The merchant order ID maps to multiple distinct candidate records"
```

**Why ambiguous**: The ground truth says this order maps to multiple processor records. The `L1_AMBIGUOUS_CARDINALITY` reason means the system found more than one possible match.

### MULTI-CANDIDATE Example (mixed-exceptions)

```
Internal: SYNTH-INT-000023
  merchant_order_id: SYNTH-ORDER-000023
  gross_amount: 1437.16, currency: GBP

Processor candidates:
  1. SYNTH-PROC-000023
     gross_amount: 1437.16, fee: 41.98, net: 1395.18
     processor_event_type: CAPTURE
     gt_internal: NONE (not the match)

  2. SYNTH-PROC-000023-REFUND
     gross_amount: -718.58, fee: 0.00, net: -718.58
     processor_event_type: REFUND
     gt_internal: SYNTH-INT-000023  ← THIS IS THE MATCH

Ground Truth:
  expected_outcome: PARTIAL_REFUND
  explanation: "The refund is linked to its original payment and reverses part of the gross amount."
```

**Key insight**: The CAPTURE record (1437.16) is NOT the ground truth match. The REFUND record (-718.58) IS the match. This is a partial refund scenario where the processor refunded part of the payment.

## 3. Reconciliation vs Obligation Matching

### ReconRiver Reconciliation

**Question**: "Did the internal ledger, processor, and bank all agree on this transaction?"

**Entities**:
- Internal record (merchant saw payment arrive)
- Processor record (payment gateway processed it)
- Bank record (bank settled it)

**Linking key**: `merchant_order_id`

**Ground truth**: Which processor record corresponds to which internal record? Which bank settlement corresponds to which processor batch?

**Scope**: ORDER (internal ↔ processor) and SETTLEMENT (processor ↔ bank)

### Settle Obligation Matching

**Question**: "When a payment arrives, which obligation does it pay?"

**Entities**:
- Payment (money arrived)
- Obligation (customer owes money for something)

**Linking key**: customer_id + amount + reference

**Ground truth**: Which obligation is this payment for?

**Scope**: payment → obligation (single direction)

### What Transfers Directly

| Concept | ReconRiver | Settle | Transfers? |
|---------|-----------|--------|-----------|
| Payment record | internal_transactions | payment_events | YES — same structure |
| Amount | gross_amount | amountPaise | YES — same meaning |
| Currency | currency | currency | YES |
| Reference | merchant_order_id | orderId | YES |
| Status | payment_status | status | YES (different values) |
| Timestamp | occurred_at | createdAt | YES |
| Customer | synthetic_customer_reference | customerId | YES (but see below) |

### What Requires Derived Representation

| Concept | ReconRiver | Settle | Derivation needed? |
|---------|-----------|--------|-------------------|
| Obligation | NOT PRESENT | obligations table | YES — must derive from processor records |
| Payment-to-obligation link | merchant_order_id (shared) | obligationId on payment | YES — must construct |
| Candidate alternatives | processor records with same order_id | obligations with same customer | YES — must construct |
| Customer identity on processor | NOT PRESENT | customerId | YES — must infer from order_id |

### Critical Finding

**ReconRiver does NOT contain an obligation concept.** There are no invoices, no "customer owes X for Y service." Instead:

- Internal records = "merchant received payment for order X"
- Processor records = "payment gateway processed order X"
- The link is `merchant_order_id`, not an obligation ID

**For Settle's ML problem, we must DERIVE obligations from processor records.** Specifically:

- A CAPTURE processor record with `processor_event_type: CAPTURE` represents a successful payment
- A REFUND processor record represents a refund
- The "obligation" is implicit: "the order that this payment was for"

**We cannot claim "ReconRiver directly contains Settle's exact payment-to-obligation labels."** The data supports a DERIVED representation where:
- Payment = internal_transaction
- Candidate obligation = processor_transaction (with same merchant_order_id)
- Correct association = ground truth links internal_payment_id to processor_transaction_id

## 4. Feature Mapping

### Available Features (all available at payment-arrival time, no leakage)

| Settle Feature | ReconRiver Source | Transformation | Leakage Risk |
|---------------|-------------------|----------------|-------------|
| payment.amount | internal.gross_amount | direct | none |
| payment.currency | internal.currency | direct | none |
| payment.reference | internal.merchant_order_id | direct | none |
| payment.status | internal.payment_status | direct | none |
| payment.method | internal.payment_method | direct | none |
| payment.timestamp | internal.occurred_at | parse ISO-8601 | none |
| payment.customer_ref | internal.synthetic_customer_reference | direct | none |
| candidate.amount | processor.gross_amount | direct | none |
| candidate.fee | processor.fee_amount | direct | none |
| candidate.net | processor.net_amount | direct | none |
| candidate.currency | processor.currency | direct | none |
| candidate.status | processor.processor_status | direct | none |
| candidate.event_type | processor.processor_event_type | direct | none |
| candidate.timestamp | processor.processor_event_time | parse ISO-8601 | none |
| candidate.settlement_batch | processor.settlement_batch_id | direct | none |
| same_currency? | internal.currency == processor.currency | compare | none |
| amount_ratio | internal.gross_amount / processor.gross_amount | compute | none |
| amount_diff | internal.gross_amount - processor.gross_amount | compute | none |
| fee_ratio | processor.fee_amount / processor.gross_amount | compute | none |
| time_diff | processor_time - internal_time (minutes) | compute | none |

### CRITICAL LIMITATION: No Customer Field on Processor

Processor transactions have **NO customer field**. The only link is `merchant_order_id`.

This means:
- `same_customer?` feature: **NOT available** via direct field comparison
- Must infer customer from `merchant_order_id` (which encodes it: `SYNTH-ORDER-000001` → `SYNTH-CUSTOMER-000001`)
- OR must use amount/currency/timing as proxy for customer identity

In Settle's real-world scenario, both payments and obligations share a `customer_id`. ReconRiver does not have this.

## 5. Candidate Pair Counts

### Per-Scenario Counts

| Scenario | Positive Pairs | Negative Pairs (same order) | Hard Negatives (diff order, same amount) | Total |
|----------|---------------|---------------------------|----------------------------------------|-------|
| clean-settlement | 100 | 0 | 0 | 100 |
| mixed-exceptions | 1,010 | 50 | 2 | 1,060 |
| month-end-close | 9,970 | 210 | 935 | 10,180 |
| failure-recovery | 10,150 | 50 | 963 | 10,200 |
| **Total** | **21,230** | **310** | **1,900** | **21,540** |

### Multi-Candidate Pairs Only (Where ML Is Useful)

| Metric | Count |
|--------|-------|
| Positive pairs | 550 |
| Negative pairs | 310 |
| Total | 860 |
| Positive % | 64.0% |
| Negative % | 36.0% |
| Imbalance ratio | 1:0.6 |

### 100k+ Feasibility

**With the published ReconRiver data alone: NO.**

- Total valid pairs: 21,540
- Multi-candidate pairs (where ML is useful): 860
- Even with hard negatives: 2,760

**To reach 100k+ pairs, we would need to:**
1. Use the 50M dataset to generate additional candidate obligations (but it has no ground truth)
2. Generate synthetic obligations with known labels (but the user said not to)
3. Find additional public reconciliation datasets (none identified)

**Honest assessment**: ReconRiver provides ~21k valid pairs with ~860 multi-candidate pairs. This is sufficient for:
- Validating feature extraction
- Training a small logistic regression
- Demonstrating the ML pipeline works

It is NOT sufficient for:
- Training a production-grade model
- Achieving statistically significant evaluation
- Reaching 100k+ pairs without synthetic augmentation

## 6. Class Imbalance

### All Pairs

| Label | Count | % |
|-------|-------|---|
| Positive | 21,230 | 98.5% |
| Negative | 310 | 1.4% |
| Hard Negative | 1,900 | — |

**Heavily imbalanced**: 98.5% positive. This is because most ReconRiver transactions are MATCHED (95% of ground truth).

### Multi-Candidate Pairs Only

| Label | Count | % |
|-------|-------|---|
| Positive | 550 | 64.0% |
| Negative | 310 | 36.0% |

**More balanced**: When we focus on cases with multiple candidates (where ML is useful), the ratio is 1.8:1.

## 7. Data Leakage

### Entity Overlap

**All 4 scenarios share the same entity IDs.** The ID ranges overlap completely:

- `SYNTH-INT-000001` appears in all 4 scenarios
- `SYNTH-ORDER-000001` appears in all 4 scenarios
- `SYNTH-CUSTOMER-000001` appears in all 4 scenarios

**10,000 customers appear in multiple scenarios.** Entity-level splitting is impossible.

### Recommended Split

**Scenario-aware splitting** (no entity overlap between splits):

| Split | Scenarios | Internals | Processors | Purpose |
|-------|-----------|-----------|------------|---------|
| Train | clean-settlement + mixed-exceptions | 1,110 | 1,175 | Training |
| Validation | month-end-close | 10,000 | 10,200 | Hyperparameter tuning |
| Test | failure-recovery | 10,100 | 10,200 | Final evaluation |

**Why this works**:
1. No customer overlap between splits (each scenario has unique customer ranges within the split)
2. Different exception types in each split
3. Clean separation

**Why random splitting fails**:
- Same customer `SYNTH-CUSTOMER-000001` appears in all scenarios
- Random split would put the same customer in train and test
- Model could memorize customer-level patterns

## 8. 50M Dataset Role

The 40,004-row sample from FreeFinancialTransactions50M is **supporting data only**:

| Use | Appropriate? | Why |
|-----|-------------|-----|
| Feature distribution validation | YES | Realistic amount/currency distributions |
| Amount/currency normalization reference | YES | Wide range of values |
| Transaction-type diversity testing | YES | 8 types, 4 statuses, 6 currencies |
| Robustness testing | YES | Different distributions than ReconRiver |
| Supervised training labels | NO | No ground truth |
| Candidate pair generation | NO | No order/invoice linking |
| Evaluation | NO | No labels to evaluate against |

## 9. Recommended Next Step

1. **Construct candidate pairs** from ReconRiver's published relationships
2. **Extract features** using the feature mapping above
3. **Split by scenario** (train: clean+mixed, val: month-end, test: failure-recovery)
4. **Train logistic regression** on the ~860 multi-candidate pairs
5. **Evaluate** on the held-out scenario
6. **Report honestly** that 21k pairs / 860 multi-candidate pairs is the limit of the published data

Do NOT claim 100k+ pairs. Do NOT fabricate obligations. Do NOT merge the 50M dataset into training.
