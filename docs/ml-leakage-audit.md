# Data Leakage Audit

## Current Split Strategy

The current `splitDataset` function uses **random shuffling** with a fixed seed:

```typescript
export function splitDataset(rows, trainRatio = 0.8, seed = 42) {
  const rand = seededRandom(seed);
  const shuffled = [...rows].sort(() => rand() - 0.5);
  const splitIdx = Math.floor(shuffled.length * trainRatio);
  return { train: shuffled.slice(0, splitIdx), test: shuffled.slice(splitIdx) };
}
```

## Leakage Risks in Current Implementation

### Risk 1: Same Payment in Train and Test (HIGH)

The current synthetic dataset generates multiple rows per payment (one per candidate). For example, payment `sc-cust1-0` generates 3 rows: (sc-cust1-0, ob-1), (sc-cust1-0, ob-2), (sc-cust1-0, ob-6).

Random splitting can place (sc-cust1-0, ob-1) in train and (sc-cust1-0, ob-2) in test. This means the model sees the same payment's features in training and encounters the same payment again in testing. The model could learn payment-specific patterns rather than general matching patterns.

**Severity**: Moderate. The features are computed per (payment, candidate) pair, so the model doesn't directly see "the same row." However, the payment's intrinsic properties (amount, customerId, references) are shared across rows for the same payment, creating implicit information leakage.

### Risk 2: Jittered Examples in Both Splits (MODERATE)

The dataset includes jittered variations of the same base example. A jittered positive example and its base positive example could end up in different splits. Since jittered examples are nearly identical to their base, the model could memorize the base pattern and appear to generalize well on test.

**Severity**: Low-Moderate. Jitter adds noise, but the core pattern is the same.

### Risk 3: Same Customer in Both Splits (LOW)

Examples for the same customer (e.g., cust-1) appear in both train and test. The model could learn customer-specific patterns (e.g., cust-1 always has 3 candidates) rather than general matching logic.

**Severity**: Low. The features are normalized and customer-agnostic in theory.

### Risk 4: Scenario-Based Examples (MODERATE)

The dataset generates scenarios (e.g., cust-1 has ob-1, ob-2, ob-6) and creates multiple payment-candidate pairs within each scenario. All examples from the same scenario share the same candidate pool. Random splitting could place some scenario examples in train and others in test, leaking scenario-specific information.

**Severity**: Moderate.

## Verdict on Current Split

The current random split is **not safe** for rigorous evaluation. It provides a reasonable approximation for a hackathon demo, but would not survive peer review or production deployment decisions.

## Recommended Split Strategy for 100k+ Dataset

### Primary: Temporal Split

If the data supports it, split by time:

```
Historical payments (earlier timestamps) --> Train
Recent payments (later timestamps) --> Validation
Most recent payments --> Test
```

This simulates the real deployment scenario: the model is trained on past data and evaluated on future data it has never seen.

Split ratios: 70% train / 15% validation / 15% test.

### Fallback: Entity-Based Split

If temporal splitting is not possible (e.g., all data is from the same time window), use entity-based splitting:

1. **Payment-level split**: Each payment (and all its candidate pairs) goes entirely into one split. No payment appears in both train and test.
2. **Customer-level split**: Each customer's payments go entirely into one split. This tests generalization to unseen customers.
3. **Obligation-level split**: Each obligation (and all its payment pairs) goes entirely into one split.

Payment-level splitting is the minimum requirement. Customer-level splitting is the gold standard for testing generalization.

### Anti-Leakage Rules

1. No payment ID appears in both train and test
2. No jittered variant of a training payment appears in test
3. No scenario's payment appears in both train and test
4. Candidate obligations from the same payment are always in the same split
