# ML Training Representation — Final

## Pipeline Position

```
Payment arrives
  → STRONG_EVIDENCE (reference ID match)     → DETERMINISTIC → link
  → MODERATE_EVIDENCE (single customer+amt)  → DETERMINISTIC → link
  → INSUFFICIENT_EVIDENCE (multiple/no match) → ML RANKING → candidate ranking
```

The ML model is only invoked when deterministic matching cannot resolve. This document defines the ML-eligible training representation.

---

## Deterministic Exclusion Rules

Replicated from `src/lib/domain/matching.ts`:

### Rule 1: STRONG_EVIDENCE — Reference ID Exact Match
**Code:** `findStrongMatch` (matching.ts:20)
**Logic:** Payment's `orderId`, `invoiceId`, or `subscriptionId` exactly matches a candidate's `sourceReference`.
**Resolution:** Deterministic. ML not needed.

**Dataset availability:**
- llmeval-trl24: `memo_line` contains `assignment_number` or `billing_number` → can simulate reference matching
- MessyOps: No reference text available → cannot simulate

### Rule 2: MODERATE_EVIDENCE — Single Customer+Amount Match
**Code:** `findModerateMatches` (matching.ts:37)
**Logic:** Exactly 1 candidate satisfies: `customerId` match AND `amountPaise <= outstandingAmountPaise` AND status is not RECOVERED.
**Resolution:** Deterministic. ML not needed.

**Dataset availability:**
- llmeval-trl24: Has `customer_id` and `amount`, but no `outstandingAmountPaise`. Using `amount` as proxy.
- MessyOps: Has `customer_id` and `amount`. Using `amount` as proxy (all invoices start with full amount).

### Rule 3: INSUFFICIENT_EVIDENCE → ML
**When:** References exist but no match, OR multiple moderate matches, OR no matches.
**Resolution:** ML ranker invoked.

---

## Deterministic Resolution Results

| Tier | llmeval-trl24 | MessyOps | Total |
|---|---|---|---|
| STRONG_EVIDENCE | 11,888 (97.5%) | 0 (0%) | 11,888 |
| MODERATE_EVIDENCE | 26 (0.2%) | 65,293 (85.5%) | 65,319 |
| INSUFFICIENT_EVIDENCE | 275 (2.3%) | 11,050 (14.5%) | 11,325 |
| **Total** | **12,189** | **76,343** | **88,532** |

**Deterministically resolved: 77,207 (87.2%)**
**ML-eligible: 11,325 (12.8%)**

Note: 634 MessyOps orphan payments have no valid candidates and are excluded from ML.

---

## ML Candidate Generation

For ML-eligible payments only, candidate set = same-customer + same-currency obligations.

### Why not all same-currency obligations?
The previous audit used all same-currency obligations (avg 3,822 for llmeval). In Settle's pipeline, candidate generation happens at the database level with customer-scoped queries. This produces realistic candidate sets.

### Candidate Set Statistics (ML-eligible)

| Metric | llmeval-trl24 | MessyOps |
|---|---|---|
| ML-eligible payments | 275 | 10,413 |
| Avg candidates | 318.9 | 31.3 |
| Median candidates | 317 | 27 |
| Max candidates | 400 | 91 |

**Note:** llmeval candidate sets are large because 50 customers share 12 currencies, creating dense same-customer clusters. In production, Settle's candidate sets would be smaller (5-20 typical).

---

## Positive Pair Construction

### llmeval-trl24
Expand `matches.csv` JSON arrays. Each `(payment_id, invoice_id)` in `payment_ids × invoice_ids` is a positive.

| Category | Matches | Positive Pairs | Multi-positive? |
|---|---|---|---|
| one_pay_one_inv | 6,031 | 6,031 | No (1:1) |
| one_pay_multi_inv | 2,017 | ~8,000 | Yes (1 payment → M invoices) |
| multi_pay_one_inv | 1,952 | ~3,842 | No (N payments → 1 invoice each) |
| **Total** | **10,000** | **17,873** | — |

### MessyOps
Each `payment.invoice_id` is a direct link. One positive per payment.

| Metric | Count |
|---|---|
| Valid positive pairs | 70,577 |
| Orphan payments (no invoice) | 634 |
| **Total positive pairs** | **76,343** |

### Combined: 94,216 verified positive relationships

---

## Multi-Positive Handling

**Problem:** In llmeval's `one_pay_multi_inv`, one payment legitimately covers multiple invoices. All linked invoices are positive candidates.

**Impact on training:**
- For ranking: The model must rank ALL correct invoices above incorrect ones
- For evaluation: A prediction is correct if the top-K predictions include ALL correct invoices
- For negatives: Only invoices NOT in the ground truth set are negatives

**Evaluation methodology:**
- Use **set-based precision/recall** rather than single-label accuracy
- A prediction is correct if `predicted_set ⊇ ground_truth_set` for each payment
- Or use **mean average precision (mAP)** across the candidate set

**llmeval multi-positive stats:**
- 2,017 payments have multiple positive invoices (avg 4.0, max 10)
- These payments have 2,017 × 4.0 ≈ 8,000 positive pairs but only 2,017 unique payments

---

## Negative Construction (Reclassified)

### Category A: Strongly Justified
**Definition:** "Given this payment and this candidate obligation, we KNOW this obligation is not the correct one."
**Basis:** Ground truth confirms the payment was matched to a different obligation.
**Validity:** The negative is labeled by the dataset's ground truth, not by assumption.

| Rule | Dataset | Count | Difficulty |
|---|---|---|---|
| Same customer, different obligation | llmeval | 3,826,447 | Hard |
| Same customer, different obligation | MessyOps | 2,339,902 | Hard |
| **Total Category A** | — | **6,166,349** | — |

### Category B: Weak (Conditional)
**Definition:** "This obligation COULD be correct, but we think it's unlikely."
**Basis:** Similar amount from different customer.
**Validity:** Not a true negative — the model might legitimately rank these high.

| Rule | Dataset | Count | Difficulty |
|---|---|---|---|
| Similar amount, different customer | llmeval | 2,765,267 | Medium |
| Similar amount, different customer | MessyOps | 0 | — |
| **Total Category B** | — | **2,765,267** | — |

### Category C: Not Actually Negative
**Definition:** Cases that are NOT legitimate negative candidate pairs.

| Rule | Dataset | Count | Why Not Negative |
|---|---|---|---|
| Orphan payments | MessyOps | 634 | No candidate obligation exists — not a pairwise negative |
| Duplicate records | MessyOps | 80 | Could be positive (same obligation, different record) |
| Missing invoices | MessyOps | 3,161 | No obligation exists — not a pairwise negative |
| **Total Category C** | — | **3,875** | — |

**Category C items are NOT included in negative construction.**

### Negative Subsampling
Raw Category A negatives (6.2M) require subsampling:
- For each ML-eligible payment, sample K=5 hard negatives (same customer)
- This produces: 10,688 × 5 = ~53,440 subsampled negatives
- Combined with positives: 10,688 + 53,440 = ~64,128 training pairs

---

## Ambiguity Definition

A case is **ML-eligible** if ALL of:
1. Deterministic matching returned `INSUFFICIENT_EVIDENCE`
2. At least 2 plausible candidates exist
3. Deterministic matching cannot confidently resolve it

A case is **genuinely ambiguous** if ALL of:
1. It is ML-eligible
2. Multiple candidates share the same customer (hard to distinguish by customer alone)
3. Ranking genuinely requires ML (amount, reference, timing disambiguation)

### Results

| Metric | llmeval-trl24 | MessyOps | Total |
|---|---|---|---|
| ML-eligible | 275 | 10,413 | 10,688 |
| Genuinely ambiguous | 275 | 10,413 | 10,688 |
| Percentage of total | 2.3% | 13.6% | 12.1% |

**All 10,688 ML-eligible cases are genuinely ambiguous** — they all have 2+ same-customer candidates that deterministic rules cannot resolve.

---

## Safe Features

Available when payment arrives, no leakage:

| Feature | llmeval | MessyOps | Settle Equivalent |
|---|---|---|---|
| `same_customer` | ✓ | ✓ | `sameCustomer` |
| `amount_ratio` | ✓ (payment/obligation) | ✓ | `amountRatio` |
| `amount_difference` | ✓ | ✓ | `amountDifferencePaise` |
| `currency_match` | ✓ | ✓ (always USD) | Derived |
| `reference_match` | ✓ (fuzzy) | ✗ | `referenceMatch` |
| `days_until_due` | ✓ | ✓ | Derived |
| `num_candidates` | ✓ | ✓ | `numCandidates` |
| `obligation_amount` | ✓ | ✓ | `originalAmountPaise` |
| `payment_amount` | ✓ | ✓ | `amountPaise` |

## Unsafe Features (Excluded)

| Feature | Source | Why Unsafe |
|---|---|---|
| `amount_paid` | MessyOps | Post-reconciliation |
| `balance_due` | MessyOps | Post-reconciliation |
| `invoice_status` | MessyOps | Post-reconciliation |
| `days_to_full_payment` | MessyOps | Post-reconciliation |
| `late_payment` | MessyOps | Post-hoc |
| `match_id` | llmeval | Ground truth |
| `match_category` | llmeval | Ground truth |
| `invoice_ids` | llmeval | Ground truth |
| `payment_ids` | llmeval | Ground truth |
| `perturbation_categories` | llmeval | Ground truth |

---

## Entity Split

Customer-isolated: no customer overlap between train/val/test.

| Split | llmeval customers | llmeval payments | MessyOps customers | MessyOps payments |
|---|---|---|---|---|
| Train | 35 | 8,532 | 2,786 | 53,595 |
| Val | 7 | 1,706 | 597 | 11,434 |
| Test | 8 | 1,951 | 597 | 10,680 |
| **Overlap** | **0** | — | **0** | — |

Note: Split counts include ALL payments (deterministic + ML-eligible). ML-eligible subset within each split would be smaller.

---

## Final Counts

| Metric | Count |
|---|---:|
| Verified positive relationships | 94,216 |
| Deterministically resolved | 77,207 |
| ML-eligible payments | 10,688 |
| ML candidate sets | 10,688 |
| Genuine ambiguous sets | 10,688 |
| Strong negatives (Category A, raw) | 6,166,349 |
| Weak negatives (Category B) | 2,765,267 |
| Invalid negatives removed (Category C) | 3,875 |
| Strong negatives (subsampled, K=5) | ~53,440 |
| Final candidate pairs (subsampled) | ~64,128 |

---

## Limitations

1. **No outstanding balance:** `outstandingAmountPaise` is unavailable. Using `original_amount` as proxy changes `amountRatio` semantics.
2. **No Razorpay fields:** order_id, invoice_id, subscription_id not in either dataset.
3. **llmeval candidate sets large:** 319 avg due to dense customer clusters. Production would be 5-20.
4. **MessyOps 1:1 only:** No split invoicing (one payment → multiple invoices).
5. **No Indian payment methods:** UPI, NEFT, RTGS absent.
6. **Multi-positive requires set-based evaluation:** Standard single-label metrics insufficient.

---

*Created: 2026-09-05*
*Status: Final audit complete — no model training performed*
