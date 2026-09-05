# ML Settle Experiment Results

**Date:** 2026-09-05
**Model:** Logistic regression (15 features, z-score normalization)
**Objective:** Maximize coverage subject to precision ≥ 0.95

## Results

### Model Performance (Test Set)

| Metric | Value |
|--------|-------|
| Threshold | 0.3578 |
| Precision | 0.957 |
| Recall | 0.655 |
| Coverage (pairs) | 9.5% (464/4,906) |
| Coverage (payments) | ~30% (estimated) |

### Comparison to Baseline (Amount-Only)

| Model | Precision | Coverage |
|-------|-----------|----------|
| LR (T=0.3578) | 0.957 | 9.5% |
| Baseline (T=0.50) | 0.141 | 87.1% |
| Baseline (T=0.90) | 0.454 | 21.4% |

The baseline cannot achieve precision ≥ 0.95 at any threshold. The LR model meets the safety objective while providing meaningful coverage.

### Feature Importance

| Feature | Weight | Interpretation |
|---------|--------|----------------|
| paymentIsPartial | -1.0047 | Strong negative: partial payments rarely match |
| paymentIsExcess | -0.8912 | Strong negative: overpayments rarely match |
| withinRecoveryWindow | +0.6126 | Strong positive: payments in window more likely |
| numCandidates | -0.4279 | Negative: more candidates = less confidence |
| referenceSimilarity | +0.3942 | Positive: similar references help |
| daysSinceCreation | +0.2296 | Positive: newer obligations more likely |
| obligationAgeHours | +0.2279 | Positive: similar signal to above |
| amountDifferencePaise | -0.2128 | Negative: larger difference = less likely |
| hasReference | -0.1533 | Slightly negative (surprising) |
| amountRatio | +0.0786 | Weak positive |
| sameCustomer | +0.0727 | Weak positive (most signal already captured by deterministic filter) |
| outstandingRatio | 0.0000 | Constant (1.0) — useless |
| candidateIsOpen | 0.0000 | Constant (1.0) — useless |
| candidateIsPartiallyRecovered | 0.0000 | Constant (0.0) — useless |

### Pipeline Context

- **Total payments:** 5,000
- **Deterministic resolution:** 57.4% STRONG + 7.0% MODERATE = 64.4%
- **ML-eligible:** 35.6% (1,782 payments)
- **ML acceptance:** ~9.5% of ML-eligible pairs
- **Total system coverage:** ~64.4% deterministic + ~3.4% ML-assisted = ~67.8%

## Conclusion

The logistic regression model successfully learns to rank candidates in the Settle synthetic benchmark. Key findings:

1. **Safety objective met:** Precision ≥ 0.95 at the optimal threshold
2. **Meaningful discrimination:** paymentIsPartial, paymentIsExcess, withinRecoveryWindow are the strongest signals
3. **Conservative behavior:** The model abstains on 90.5% of pairs, which is appropriate for financial applications
4. **Deterministic filter dominates:** 64.4% of payments are resolved before ML. ML assists with the remaining 35.6%.

## Next Steps

1. Add more diverse scenarios (partially-recovered obligations, multi-allocation)
2. Tune precision floor (currently 0.95, could explore 0.90-0.99 range)
3. Try GBT model for potentially higher coverage at same precision
4. Calibrate model scores to true probabilities
5. Test on production data (requires Settle-specific data collection)
