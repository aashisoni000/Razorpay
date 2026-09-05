# ML Final Audit

**Date:** 2026-09-05
**Seed:** 20260905
**Audit script:** `scripts/ml-final-audit.py`

## Executive Summary

This audit verifies the first Settle-specific synthetic ML experiment. The experiment is **internally consistent** — no ground-truth leakage, correct multi-positive handling, fair baseline, validation-only threshold selection, deterministic cases excluded, split validated.

However, the model is **extremely conservative**: it accepts 1 candidate pair out of 1,124 test pairs (pair coverage 0.09%), and only 1 out of 163 test payments (payment coverage 0.61%). The baseline (amount-ratio closeness) actually outperforms LR on payment-level coverage (4.91% vs 0.61%) while maintaining perfect precision.

The deterministic filter resolves 78.3% of all payments before ML. ML only operates on the remaining 21.7%, and of those, it accepts almost nothing. The ML layer adds negligible value in its current form.

---

## 1. Candidate Recall

| Metric | Value |
|--------|-------|
| Payments with ground truth | 4,602 |
| ALL GT obligations present | 4,149 (90.2%) |
| Any GT obligation present | 4,160 (90.4%) |
| Candidate recall | 90.4% |
| Missing GT obligations | 442 |

### Multi-Allocation Payments

| Metric | Value |
|--------|-------|
| Multi-obligation payments | 243 |
| All GT present | 198 (81.5%) |
| Any GT present | 209 (86.0%) |

**Root cause of recall gap (9.4%):** Contact errors (20% wrong customer ID) cause the candidate generator to look up the wrong customer's obligations. The amount fallback (within 50%) partially compensates but cannot always find the correct obligation. This is a realistic simulation of Settle's observable information.

---

## 2. Pair-Level ML Metrics

| Metric | Baseline | Logistic Regression |
|--------|----------|---------------------|
| Candidate pairs (test) | 1,124 | 1,124 |
| Accepted pairs | 8 | 1 |
| Precision | 1.0000 | 1.0000 |
| Recall | 0.0920 | 0.0115 |
| FPR | 0.0000 | 0.0000 |
| Pair coverage | 0.0071 | 0.0009 |
| TP | 8 | 1 |
| FP | 0 | 0 |
| FN | 79 | 86 |
| TN | 1037 | 1037 |

Both models achieve perfect precision but accept almost nothing. The baseline accepts 8 pairs (amount ratio exactly 1.0), while LR accepts only 1 pair.

---

## 3. Payment-Level ML Metrics

| Metric | Baseline | Logistic Regression |
|--------|----------|---------------------|
| Test payments | 163 | 163 |
| Payments accepted | 8 | 1 |
| Payments correct | 8 | 1 |
| Payment precision | 1.0000 | 1.0000 |
| Payment coverage | 0.0491 | 0.0061 |
| Abstained | 155 | 162 |

**Critical finding:** The baseline outperforms LR on payment coverage (4.91% vs 0.61%) while maintaining the same precision. LR is unnecessarily conservative.

---

## 4. End-to-End System Metrics

| Metric | Count | Percentage |
|--------|-------|------------|
| Total payments | 5,000 | 100.0% |
| Deterministic STRONG | 2,868 | 57.4% |
| Deterministic MODERATE | 1,049 | 21.0% |
| **Deterministic resolved** | **3,917** | **78.3%** |
| ML-eligible | 1,083 | 21.7% |
| ML-accepted | 8 | 0.2% |
| ML-abstained | 1,075 | 21.5% |
| Unresolved | 1,075 | 21.5% |
| Total resolved | 3,925 | 78.5% |

**End-to-end coverage: 3,925/5,000 = 78.50%**

The deterministic filter does almost all the work. ML adds 8 payments (0.2%) to the resolved count.

---

## 5. Ranking Metrics (Test Set)

| Metric | Value |
|--------|-------|
| Top-1 hit rate | 11.04% (18/163) |
| Top-3 hit rate | 26.99% (44/163) |
| MRR | 0.1907 |

The model ranks the correct candidate in the top-1 position only 11% of the time, and in the top-3 only 27% of the time. MRR of 0.19 means the average rank of the first correct candidate is ~5.3.

---

## 6. Safety Metrics

| Metric | Value |
|--------|-------|
| Threshold selected on | VALIDATION ONLY |
| Test threshold | 0.517780 |
| Test precision | 1.0000 |
| Test recall | 0.0115 |
| Test FPR | 0.0000 |
| Test TP | 1 |
| Test FP | 0 |
| Payment-level acceptance | 1/163 = 0.61% |

Threshold was selected exclusively on validation data. Test data was untouched until final evaluation.

---

## 7. Feature Audit

### Constant Features (Remove)

| Feature | Value | Weight |
|---------|-------|--------|
| outstandingRatio | 1.0 (constant) | 0.0000 |
| candidateIsOpen | 1.0 (constant) | 0.0000 |
| candidateIsPartiallyRecovered | 0.0 (constant) | 0.0000 |

**Features after removal: 12** (from 15)

### Remaining Features

| Feature | Weight | Variance |
|---------|--------|----------|
| numCandidates | -0.3771 | 6.0202 |
| paymentIsPartial | -0.3234 | 0.2500 |
| amountDifferencePaise | +0.2114 | 31,568,402,014 |
| withinRecoveryWindow | +0.1994 | 0.2340 |
| amountRatio | +0.1621 | 1.2795 |
| daysSinceCreation | +0.1485 | 138.9543 |
| obligationAgeHours | +0.1483 | 80,119.6826 |
| hasReference | -0.1089 | 0.1470 |
| sameCustomer | +0.0848 | 0.2488 |
| paymentIsExcess | +0.0612 | 0.2500 |
| referenceSimilarity | -0.0066 | 0.0444 |
| paymentMethodCommon | +0.0019 | 0.2316 |

### Redundancy: daysSinceCreation vs obligationAgeHours

| Metric | Value |
|--------|-------|
| Correlation | 1.0000 |
| Relationship | `daysSinceCreation = obligationAgeHours / 24.0` (capped at 30) |

These are the same signal at different scales. Redundant but not harmful. Recommend keeping only one (obligationAgeHours has more variance).

---

## 8. paymentIsPartial Investigation

### Confusion Table by Scenario

| Scenario | Total | Pos | Neg | PartPos | PartNeg | PartRate |
|----------|-------|-----|-----|---------|---------|----------|
| ambiguous | 475 | 8 | 467 | 3 | 216 | 46.1% |
| corrupted_ref | 917 | 9 | 908 | 3 | 370 | 40.7% |
| failed_then | 201 | 2 | 199 | 0 | 102 | 50.8% |
| missing_ref | 1,887 | 23 | 1,864 | 10 | 828 | 44.4% |
| multi_obligation | 772 | 293 | 479 | 0 | 4 | 0.5% |
| noisy_contact | 898 | 56 | 842 | 5 | 405 | 45.7% |
| overpayment | 732 | 91 | 641 | 0 | 281 | 38.4% |
| shared_contact | 651 | 0 | 651 | 0 | 307 | 47.2% |
| unmatched | 1,466 | 0 | 1,466 | 0 | 1,466 | 100.0% |

### Summary

| Group | Count | Positive Rate |
|-------|-------|---------------|
| Positive + partial | 21 | — |
| Positive + non-partial | 461 | — |
| Negative + partial | 3,979 | — |
| Negative + non-partial | 3,538 | — |
| **P(label=1 \| partial)** | — | **0.53%** |
| **P(label=1 \| non-partial)** | — | **11.53%** |

### Analysis

The negative weight (-0.3234) is caused by the **synthetic data distribution**:

- In the `unmatched` scenario (1,466 pairs), ALL candidates have `paymentIsPartial=1` (amount < outstanding). These are 100% negative.
- In `shared_contact` (651 pairs), 47% are partial, all negative.
- The only positive partial payments are in `missing_ref` (10 positive partials out of 838 partial pairs = 1.2% positive rate).

The model correctly learns that partial payments are unlikely to match in this dataset. This is **not a modeling issue** — the generator genuinely produces valid partial payments (in `exact_partial` scenario), but those are resolved by the deterministic filter (MODERATE tier: same customer + amount match). The remaining partial payments in the ML population are mostly unmatched or ambiguous.

**Verdict:** The negative weight is caused by the data distribution, not a bug. In production, partial payments would need different handling (e.g., partial allocation support).

---

## 9. hasReference Investigation

| Condition | Correct | Total | P(correct) |
|-----------|---------|-------|------------|
| hasReference=1 | 28 | 1,327 | 2.11% |
| hasReference=0 | 454 | 6,672 | 6.80% |
| referenceMatch=1 | 0 | 0 | N/A (deterministic) |

### By referenceSimilarity Bucket

| Bucket | Correct | Total | P(correct) |
|--------|---------|-------|------------|
| 0.0-0.2 | 458 | 6,890 | 6.65% |
| 0.2-0.5 | 0 | 379 | 0.00% |
| 0.5-0.8 | 0 | 580 | 0.00% |
| 0.8-1.0 | 24 | 150 | 16.00% |

### Analysis

P(correct | hasReference) = 2.11% is **lower** than P(correct | noReference) = 6.80%. This is counterintuitive.

**Root cause:** In the ML-eligible population, payments WITH references that don't match are likely mismatched (wrong obligation). Payments WITHOUT references are in scenarios like `unmatched` (all negative) or `ambiguous` (some positives). The `hasReference` feature is confounded by scenario distribution.

The `referenceSimilarity` bucket shows the expected pattern: high similarity (0.8-1.0) has 16% positive rate, while low similarity has 6.65%. The中间 buckets (0.2-0.8) have 0% positive rate because corrupted references that are partially similar are still wrong.

**Note:** `referenceMatch` is a deterministic duplicate (0 pairs in ML population — correctly filtered).

---

## 10. Deterministic Separation

| Check | Status |
|-------|--------|
| referenceMatch=1 in ML population | 0 (PASS) |
| ML-only scenarios | ambiguous, corrupted_ref, failed_then, missing_ref, multi_obligation, noisy_contact, overpayment, shared_contact, unmatched |
| Deterministic scenarios excluded | exact_full, exact_partial, similar_amounts, delayed, duplicate |
| ML-eligible payments | 1,083 (21.7%) |

The ML model only operates on genuinely unresolved/ambiguous candidate sets.

---

## 11. Baseline Fairness

| Check | Status |
|-------|--------|
| Same candidate sets | PASS (both use identical `gen_candidates`) |
| Same train/val/test split | PASS (same payment IDs, same split) |
| No hidden GT information | PASS (baseline uses only `amountRatio`) |
| Threshold selected on validation | PASS |

---

## 12. Split Validation

| Check | Status |
|-------|--------|
| Customer-level isolation | N/A (payment-level split, not customer-level) |
| Obligation-level isolation | N/A |
| No payment leakage across splits | PASS (asserted: train∩val=0, train∩test=0, val∩test=0) |
| Hidden scenario metadata never a feature | PASS (scenario not in FEATURE_NAMES) |
| GT allocation never used in candidate generation | PASS (code verified) |
| Candidate generation never receives gt_oid or gt_customer | PASS (code verified) |

---

## 13. Final Result Table

| Metric | Baseline | Logistic Regression |
|--------|----------|---------------------|
| Candidate recall | N/A | 90.4% |
| Top-1 hit rate | N/A | 11.04% |
| Top-3 hit rate | N/A | 26.99% |
| MRR | N/A | 0.1907 |
| Pair precision | 1.0000 | 1.0000 |
| Pair FPR | 0.0000 | 0.0000 |
| Pair coverage | 0.0071 | 0.0009 |
| Payment precision | 1.0000 | 1.0000 |
| Payment coverage | 0.0491 | 0.0061 |

### End-to-End Settle

| Metric | Value |
|--------|-------|
| Total payments | 5,000 |
| Deterministic resolved | 3,917 (78.3%) |
| ML eligible | 1,083 (21.7%) |
| ML accepted | 8 (0.2%) |
| ML abstained | 1,075 |
| Unresolved | 1,075 (21.5%) |
| Total resolved | 3,925 |
| **End-to-end coverage** | **3,925/5,000 = 78.50%** |

---

## 14. Verdict

### ML_EXPERIMENT_VALID=true

All checks pass:
- No ground-truth leakage (referenceMatch=0 in ML population)
- Correct multi-positive handling (set-based evaluation)
- Fair baseline (same candidate sets, same split)
- Validation-only threshold selection
- Exact payment-level accounting (numerator/denominator computed)
- Deterministic cases excluded (STRONG/MODERATE filtered)
- Candidate recall measured (90.4%)
- No split leakage (asserted)

### READY_FOR_INTEGRATION=false

Reasons:
1. **Model is too conservative:** Accepts 1/163 test payments (0.61%). Adds negligible value over deterministic filter.
2. **Baseline outperforms LR:** Amount-ratio baseline achieves 4.91% payment coverage vs LR's 0.61%.
3. **Low ranking quality:** Top-1 hit rate 11%, MRR 0.19. Model doesn't rank correct candidates highly.
4. **No calibration:** Model outputs are scores, not calibrated probabilities. Cannot be called "confidence."
5. **No production-data validation:** Experiment uses synthetic data only.
6. **Class imbalance:** Only 6% positive ratio in ML population. Model has insufficient positive signal.
7. **paymentIsPartial behavior:** Negative weight is explained by data distribution but would need different handling in production.

---

## 15. Recommendations

1. **Do not integrate this model into production Settle.** It adds negligible value.
2. **Investigate calibration** before any future ML integration.
3. **Consider simpler approaches:** The amount-ratio baseline is competitive and needs no training.
4. **Improve candidate generation** to increase positive signal in ML-eligible population.
5. **Add partial allocation support** to handle the 0.53% positive partial payments.
6. **Collect production data** before any ML deployment.

---

ML_EXPERIMENT_VALID=true
READY_FOR_INTEGRATION=false
