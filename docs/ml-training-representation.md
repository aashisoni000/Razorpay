# ML Training Representation: Payment → Obligation Matching

## STEP 1 — Common Normalized Schema

### Design Principle
Only fields genuinely available when a payment arrives. No post-reconciliation fields.

### Payment (normalized)
| Field | Type | Source | Notes |
|---|---|---|---|
| `payment_event_id` | string | both | Unique payment identifier |
| `amount_paise` | integer | both | Amount in paise (integer) |
| `currency` | string | both | ISO currency code |
| `customer_id` | string? | both | May be None if not available at payment time |
| `customer_name` | string? | llmeval only | May be None |
| `reference_text` | string? | llmeval only | Memo line / payment reference |
| `payment_method` | string? | MessyOps only | Wire/ACH/Credit Card/Check |
| `payment_timestamp` | string | both | ISO date of payment |
| `source` | string | both | Dataset identifier |

### Obligation (normalized)
| Field | Type | Source | Notes |
|---|---|---|---|
| `obligation_id` | string | both | Unique obligation identifier |
| `original_amount_paise` | integer | both | Original invoice amount |
| `currency` | string | both | ISO currency code |
| `customer_id` | string? | both | Customer identifier |
| `customer_name` | string? | llmeval only | Company name |
| `reference_fields` | dict | both | Source-specific reference fields |
| `created_at` | string | both | Invoice/document date |
| `due_at` | string? | both | Due date |
| `source` | string | both | Dataset identifier |

### Candidate Pair (normalized)
| Field | Type | Description |
|---|---|---|
| `payment_event_id` | string | The payment being matched |
| `obligation_id` | string | Candidate obligation |
| `label` | int | 1=positive, 0=negative |
| `source` | string | Dataset identifier |
| `negative_reason` | string? | Reason for negative (if applicable) |

### Missing Fields (not in either dataset)
| Settle Field | Status | Impact |
|---|---|---|
| `outstanding_amount_paise` | **MISSING** | Cannot compute `outstandingRatio` or `paymentIsPartial/Exact/Excess` without reconstruction |
| `source_provider` | **MISSING** | No provider information in either dataset |
| `subscription_id` | **MISSING** | No subscription concept |
| `order_id` | Partial (MessyOps has `sales_order_id`) | Only MessyOps has order linkage |

---

## STEP 2 — Positive Pairs

### llmeval-trl24
**Construction:** Expand `matches.csv` JSON arrays. Each `(payment_id, invoice_id)` pair in `payment_ids × invoice_ids` becomes one positive pair.

**Relationship semantics preserved:**
- `one_pay_one_inv`: 1 payment → 1 invoice = 1 positive pair
- `multi_pay_one_inv`: N payments → 1 invoice = N positive pairs (each payment matched to the same invoice)
- `one_pay_multi_inv`: 1 payment → M invoices = M positive pairs (one payment matched to each invoice)

**Can one payment legitimately have multiple positive obligations?** Yes. In `one_pay_multi_inv`, a single payment covers multiple invoices. This is a payment advice / remittance scenario. Each invoice is a valid positive match for that payment.

| Category | Matches | Positive Pairs |
|---|---|---|
| one_pay_one_inv | 6,031 | 6,031 |
| one_pay_multi_inv | 2,017 | ~8,000 (avg 4 invoices per match) |
| multi_pay_one_inv | 1,952 | ~3,842 (avg 2 payments per match) |
| **Total** | **10,000** | **17,873** |

### MessyOps
**Construction:** Each `payment.invoice_id` is a direct ground-truth link. One positive pair per payment.

| Metric | Count |
|---|---|
| Payments with valid invoice link | 70,577 |
| Payments with orphan invoice reference | 634 |
| **Total positive pairs** | **76,343** |

### Combined Positives
| Source | Positive Pairs |
|---|---|
| llmeval-trl24 | 17,873 |
| MessyOps | 76,343 |
| **Total** | **94,216** |

---

## STEP 3 — Negative Pairs

### Construction Rules

#### Rule 1: Same Customer, Wrong Obligation
**Rationale:** A payment arrives from customer X. Customer X has multiple open obligations. The payment is matched to one of them. The others are legitimate negatives — the model must learn which obligation the payment targets.

**Validity:** This is the most realistic negative scenario in production. When a customer has multiple open invoices, the model must disambiguate.

**Count:**
- llmeval-trl24: 3,826,447
- MessyOps: 2,339,902
- **Total: 6,166,349**

**Difficulty:** Hard. Same customer means `sameCustomer=1`. The model must use amount, reference, and timing to disambiguate.

#### Rule 2: Similar Amount, Wrong Obligation (Different Customer)
**Rationale:** A payment arrives for ₹10,000. There exists another obligation for ₹10,100 from a different customer. This is a plausible matching error — the model must distinguish based on customer identity and reference fields.

**Validity:** Amount-only matching would incorrectly match these. This tests whether the model uses customer identity and reference fields.

**Count:**
- llmeval-trl24: 2,765,267
- MessyOps: 0 (not constructed — would be too many cross-customer pairs)
- **Total: 2,765,267**

**Difficulty:** Medium. Different customer means `sameCustomer=0`, but similar amount means `amountRatio ≈ 1`.

#### Rule 3: Orphan Payments (MessyOps only)
**Rationale:** 634 payments reference invoices NOT in the invoice table. These represent data quality issues — payments that cannot be matched to any valid obligation.

**Validity:** In production, Settle encounters payments with invalid/unmatchable references. These are legitimate "no match" cases.

**Count:** 634

**Difficulty:** Easy for negative construction, but important for calibration (the model should learn to abstain).

### Negative Subsampling
The raw negative count (8.9M) is too large for practical training. In practice, negatives should be subsampled per payment:
- For each payment, sample up to K hard negatives (same customer)
- Plus 1-2 easy negatives (different customer, different amount)
- Recommended K = 5-10 per payment

**Subsampled estimate (K=5 hard + 2 easy per payment):**
- llmeval-trl24: 12,189 payments × 7 = ~85,323
- MessyOps: 76,343 payments × 7 = ~534,401
- **Total subsampled: ~619,724**

### Total Valid Negatives (raw)
| Source | Count |
|---|---|
| llmeval-trl24 | 6,591,714 |
| MessyOps | 2,339,902 |
| **Total** | **8,931,616** |

---

## STEP 4 — Candidate Sets

### Construction
For each payment, the candidate set = all obligations that could plausibly be considered:
- **llmeval-trl24:** All same-currency obligations (currency is a hard constraint in payment matching)
- **MessyOps:** All obligations from the same customer (customer is known at payment time)

### Statistics

| Metric | llmeval-trl24 | MessyOps |
|---|---|---|
| Total payments | 12,189 | 76,343 |
| Avg candidates | 3,822 | 31.6 |
| Median candidates | 3,406 | 27 |
| Max candidates | 6,655 | 91 |
| Exactly 1 candidate | 0 | 31 |
| Exactly 2 candidates | 0 | 157 |
| 3+ candidates | 12,189 | 75,521 |

### Candidate Set Size Concern
**llmeval-trl24 candidate sets are very large (avg 3,822).** This is because the candidate filter is "same currency" and there are only 50 customers with 12 currencies. In production, Settle would filter by customer + currency, reducing candidates to ~300 per payment.

**Recommendation:** For llmeval-trl24, use customer-scoped candidates (same customer + same currency) rather than currency-only candidates. This would reduce avg candidates from 3,822 to ~31 (matching MessyOps scale).

### Ambiguity Definition
A candidate set is **ambiguous** if:
1. The payment has 2+ candidates, AND
2. At least one candidate is a "hard negative" (same customer + similar amount, or corrupted reference)

This means the model faces a genuine matching decision where multiple candidates are plausible under Settle's deterministic rules.

### Ambiguous Sets

| Source | Ambiguous | Percentage |
|---|---|---|
| llmeval-trl24 | 12,189 | 100% (all have hard negatives due to 50 customers) |
| MessyOps | 75,678 | 99.1% |
| **Total** | **87,867** | **93.3%** |

---

## STEP 5 — Leakage Audit

### Excluded Features (UNSAFE)

| Feature | Source | Why Unsafe |
|---|---|---|
| `amount_paid` | MessyOps | Post-reconciliation — computed AFTER matching |
| `balance_due` | MessyOps | Post-reconciliation — computed AFTER matching |
| `invoice_status` | MessyOps | Post-reconciliation — computed AFTER matching |
| `days_to_full_payment` | MessyOps | Post-reconciliation — computed AFTER matching |
| `late_payment` | MessyOps | Determined AFTER payment — post-hoc |
| `match_id` | llmeval | Directly identifies correct match |
| `match_category` | llmeval | Reveals relationship type |
| `invoice_ids` | llmeval | Directly links payment to correct invoice |
| `payment_ids` | llmeval | Directly links invoice to correct payment |
| `perturbation_categories` | llmeval | Reveals what perturbations were applied |

### Safe Features (AVAILABLE at payment time)

| Feature | llmeval | MessyOps | Settle Equivalent |
|---|---|---|---|
| `same_customer` | ✓ (Customer ID ↔ Business Partner) | ✓ (customer_id) | `sameCustomer` |
| `amount_ratio` | ✓ (Amount / payment Amount) | ✓ (invoice_amount / payment_amount) | `amountRatio` |
| `amount_difference` | ✓ | ✓ | `amountDifferencePaise` |
| `currency_match` | ✓ | ✓ (always USD) | Derived from currency |
| `reference_match` | ✓ (fuzzy: memo_line ↔ assignment_number) | ✗ (no reference text) | `referenceMatch` |
| `days_until_due` | ✓ (due_date - posting_date) | ✓ (due_date - payment_date) | Derived from dates |
| `obligation_amount` | ✓ (inv Amount) | ✓ (invoice_amount) | `originalAmountPaise` |
| `payment_amount` | ✓ (pay Amount) | ✓ (payment_amount) | `amountPaise` |

### Feature Mapping to Settle's 14 Features

| Settle Feature | Source | Availability |
|---|---|---|
| `sameCustomer` | customer_id match | ✓ Both datasets |
| `amountRatio` | payment_amount / outstanding | ⚠️ Partial — no outstanding field, use original_amount |
| `amountDifferencePaise` | payment - outstanding | ⚠️ Partial — same issue |
| `hasOrderId` | payment.orderId exists | ✗ Neither dataset |
| `hasInvoiceId` | payment.invoiceId exists | ✗ Neither dataset |
| `hasSubscriptionId` | payment.subscriptionId exists | ✗ Neither dataset |
| `referenceMatch` | fuzzy reference match | ⚠️ llmeval only (memo_line ↔ assignment/billing) |
| `outstandingRatio` | outstanding / original | ✗ No outstanding field |
| `paymentIsPartial` | payment < outstanding | ⚠️ Partial — use original_amount proxy |
| `paymentIsExact` | payment == outstanding | ⚠️ Partial — use original_amount proxy |
| `paymentIsExcess` | payment > outstanding | ⚠️ Partial — use original_amount proxy |
| `candidateIsOpen` | obligation.status == OPEN | ✗ MessyOps has status but it's leakage |
| `candidateIsPartiallyRecovered` | obligation.status == PARTIALLY_RECOVERED | ✗ Not available |
| `numCandidates` | len(candidates) | ✓ Both datasets |

### Features Requiring Adaptation
- `amountRatio`, `amountDifferencePaise`, `paymentIsPartial/Exact/Excess`: Use `original_amount_paise` instead of `outstanding_amount_paise`. This changes the semantics but is the only option without outstanding balance data.
- `referenceMatch`: Only available for llmeval-trl24. For MessyOps, this feature would be 0 for all pairs.
- `candidateIsOpen`, `candidateIsPartiallyRecovered`: Not available in either dataset. Would need to be 0 for all pairs.

---

## STEP 6 — Split Design

### Method: Customer-Isolated Split
No customer appears in both train and test. This prevents the model from memorizing customer-specific patterns.

### llmeval-trl24 Split
| Split | Customers | Payments | Percentage |
|---|---|---|---|
| Train | 35 | 8,532 | 70.0% |
| Val | 7 | 1,706 | 14.0% |
| Test | 8 | 1,951 | 16.0% |
| **Overlap** | **0** | — | — |

### MessyOps Split
| Split | Customers | Payments | Percentage |
|---|---|---|---|
| Train | 2,786 | 53,595 | 70.2% |
| Val | 597 | 11,434 | 15.0% |
| Test | 597 | 10,680 | 14.0% |
| **Overlap** | **0** | — | — |

### Split Integrity
- ✓ No customer overlap between any splits
- ✓ No payment overlap between splits
- ✓ No obligation/invoice overlap between splits (since obligations are scoped to customers)
- ✓ Temporal split not feasible (llmeval dates are synthetic, MessyOps has 2 years but customer isolation is stronger)

---

## STEP 7 — Training Example Counts

### Raw Numbers

| Metric | llmeval-trl24 | MessyOps | Combined |
|---|---|---|---|
| Positive pairs | 17,873 | 76,343 | 94,216 |
| Valid negatives (raw) | 6,591,714 | 2,339,902 | 8,931,616 |
| Candidate sets | 12,189 | 76,343 | 88,532 |
| Ambiguous sets | 12,189 | 75,678 | 87,867 |

### After Subsampling (K=5 hard + 2 easy negatives per payment)

| Metric | llmeval-trl24 | MessyOps | Combined |
|---|---|---|---|
| Positive pairs | 17,873 | 76,343 | 94,216 |
| Subsampled negatives | ~85,323 | ~534,401 | ~619,724 |
| **Total usable pairs** | ~103,196 | ~610,744 | **~713,940** |

### After Split

| Split | Payments | Candidate Pairs (est.) |
|---|---|---|
| Train | 62,127 | ~500,000 |
| Val | 13,140 | ~105,000 |
| Test | 12,631 | ~101,000 |
| **Total** | **87,898** | **~706,000** |

### ⚠️ Important Caveat
These numbers represent **candidate pairs** (payment × candidate obligation), NOT independent training examples. Each payment produces multiple candidate pairs. The model sees each candidate pair independently but must learn to rank within each candidate set.

---

## STEP 8 — Settle Relevance Assessment

### 1. Does this representation resemble Settle's problem?

**Partially.** The core task (payment → obligation matching) is correct. But:
- Neither dataset has `outstanding_amount_paise` (Settle's key field)
- Neither dataset has order_id / invoice_id / subscription_id from Razorpay webhooks
- Neither dataset has payment method from Razorpay
- Neither dataset has provider information (Razorpay, bank, etc.)

### 2. Which Settle features are directly supported?

| Feature | Supported? | Notes |
|---|---|---|
| `sameCustomer` | ✓ | Customer ID matching works in both |
| `amountRatio` | ⚠️ | Requires original_amount proxy (not outstanding) |
| `amountDifferencePaise` | ⚠️ | Same caveat |
| `referenceMatch` | ⚠️ | llmeval only, MessyOps has no reference text |
| `numCandidates` | ✓ | Computed from candidate sets |
| `paymentIsPartial/Exact/Excess` | ⚠️ | Requires original_amount proxy |

### 3. Which Settle features are unavailable?

| Feature | Why Unavailable |
|---|---|
| `hasOrderId` | Neither dataset has Razorpay order_id |
| `hasInvoiceId` | Neither dataset has Razorpay invoice_id |
| `hasSubscriptionId` | Neither dataset has subscription concept |
| `outstandingRatio` | No outstanding balance field |
| `candidateIsOpen` | No obligation status (or it's leakage) |
| `candidateIsPartiallyRecovered` | No recovery status |

### 4. Which dataset is strongest for matching?

**llmeval-trl24** — it represents the exact payment-to-invoice matching problem with 1:1, 1:N, and N:1 relationships, realistic perturbations, and explicit ground truth.

### 5. Which dataset is strongest for hard negatives?

**MessyOps** — 8,079 data quality issues provide natural hard negatives (orphan FKs, duplicates, missing values) that are more realistic than synthetic perturbations.

### 6. How much would the final model rely on each dataset?

- **llmeval-trl24:** 20-30% of training signal (matching patterns, perturbation handling)
- **MessyOps:** 70-80% of training signal (scale, customer diversity, data quality edge cases)

### 7. What parts of Settle would still require application-generated evaluation?

| Settle Aspect | Coverage | Gap |
|---|---|---|
| Razorpay webhook parsing | 0% | Need Razorpay-specific evaluation |
| Order/Invoice/Subscription ID matching | 0% | Need Razorpay data |
| Outstanding balance tracking | 0% | Need balance-over-time evaluation |
| Provider-specific behavior | 0% | Need multi-provider evaluation |
| Indian payment methods (UPI, NEFT, RTGS) | 0% | Neither dataset has Indian payment methods |
| Partial payment over time | 10% | MessyOps has partial payments but no temporal tracking |

---

## STEP 9 — Limitations

### Dataset Limitations
1. **No outstanding balance:** Neither dataset tracks how much has been paid on an obligation over time. Settle's `outstandingAmountPaise` is its most critical field.
2. **No Razorpay-specific fields:** order_id, invoice_id, subscription_id, payment_method (Razorpay-specific) are absent.
3. **Synthetic data (llmeval):** Generated, not real transactions. May not capture real-world noise.
4. **Limited customer diversity (llmeval):** Only 50 customers.
5. **No Indian payment methods:** Neither dataset has UPI, NEFT, RTGS, or IMPS.
6. **No temporal payment sequences:** Both datasets are point-in-time snapshots, not payment streams.

### Construction Limitations
1. **Candidate set size:** llmeval candidate sets are too large (3,822 avg) without customer-scoping.
2. **Negative subsampling:** Raw negatives (8.9M) require subsampling; the choice of K affects training.
3. **Original vs. outstanding amount:** Using original_amount instead of outstanding changes the semantics of `amountRatio` and `paymentIsPartial/Exact/Excess`.
4. **No cross-dataset validation:** Datasets are independent; cannot validate across them.

### What This Training Representation CAN Teach the Model
- Same-customer matching signal
- Amount similarity signal
- Reference text matching (llmeval only)
- Currency matching
- Candidate ranking within a set
- Handling perturbed/noisy references

### What This Training Representation CANNOT Teach the Model
- Outstanding balance tracking
- Payment method matching
- Order/Invoice/Subscription ID matching
- Provider-specific behavior
- Indian payment method handling
- Temporal payment sequences
- Multi-provider reconciliation

---

## Machine-Readable Summary

```
PRIMARY_POSITIVES=94216
VALID_NEGATIVES=8931616
USABLE_CANDIDATE_PAIRS=88532
AMBIGUOUS_SETS=87867
TRAIN_PAIRS=62127
VAL_PAIRS=13140
TEST_PAIRS=12631
DATASETS_USED=llmeval-trl24,messyops
UNSAFE_FEATURES_REMOVED=amount_paid,balance_due,invoice_status,days_to_full_payment,late_payment,match_id,match_category,invoice_ids,payment_ids,perturbation_categories
```

---

*Created: 2026-09-05*
*Status: Audit complete — no model training performed*
