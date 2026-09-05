# Settle Synthetic ML Experiment — Design

**Status:** Design complete, pilot pending
**Date:** 2026-09-05
**Scope:** Primary ML experiment replacing public-dataset POC

---

## 1. World Model

### 1.1 Entity Definitions

```
Customer
  id: string              # "CUST-001"
  name: string            # "Acme Corp"
  email_domain: string    # "acme.com"
  phone_last4: string     # "5678"
  is_shared_contact: bool # false (shared contacts simulated separately)

Obligation
  id: string              # "OBL-001"
  customer_id: string     # FK → Customer
  original_amount_paise: bigint
  outstanding_amount_paise: bigint  # evolves as payments arrive
  source_type: "order" | "invoice" | "subscription"
  source_reference: string          # "ORD-1001" or "INV-2001" or "SUB-3001"
  status: "OPEN" | "PARTIALLY_RECOVERED" | "RECOVERED" | "STOPPED"
  created_at: Date
  recovery_window_hours: int        # 24–168 (1–7 days)

PaymentEvent
  id: string              # "PAY-001"
  amount_paise: bigint
  currency: "INR"
  occurred_at: Date
  type: "CAPTURED" | "FAILED" | "PARTIAL" | "REFUND" | "DUPLICATE"

  # Observable references (may be null, may be wrong)
  declared_order_id: string | null
  declared_invoice_id: string | null
  declared_subscription_id: string | null

  # Observable customer identity (may be null, may be wrong)
  declared_customer_id: string | null
  declared_customer_email: string | null
  declared_customer_phone: string | null

  # Observable payment metadata
  payment_method: "upi" | "neft" | "rtgs" | "card" | "netbanking"
  razorpay_payment_id: string | null

PaymentAllocation
  payment_id: string
  obligation_id: string
  allocated_amount_paise: bigint
```

### 1.2 Observable vs Hidden Fields

| Field | Observable to Settle | Hidden (ground truth only) |
|-------|---------------------|---------------------------|
| Payment amount | ✓ | |
| Payment timestamp | ✓ | |
| Payment references (order_id, invoice_id, subscription_id) | ✓ | |
| Declared customer identity | ✓ | |
| Payment method | ✓ | |
| Obligation ID | ✓ (from candidate set) | |
| Obligation amount | ✓ | |
| Obligation outstanding | ✓ | |
| Obligation status | ✓ | |
| Obligation source_reference | ✓ | |
| Obligation customer_id | ✓ | |
| Obligation created_at | ✓ | |
| **Payment→Obligation allocation** | | ✓ |
| **Which customer the payment "really" belongs to** | | ✓ |
| **Whether declared_customer_id is correct** | | ✓ |
| **Whether declared references are correct** | | ✓ |
| **Scenario type** | | ✓ |

### 1.3 Recovery State Evolution

Obligations evolve as payments arrive:

```
On payment captured:
  obligation.outstanding -= payment.amount
  if obligation.outstanding <= 0:
    obligation.status = "RECOVERED"
  else:
    obligation.status = "PARTIALLY_RECOVERED"

On refund:
  obligation.outstanding += refund.amount
  obligation.status = "OPEN"
```

This evolution is simulated in the world but NOT exposed to the ML model at prediction time. The ML sees only the current state.

---

## 2. Scenario Taxonomy

### 2.1 Scenario Definitions

| # | Scenario | Generation | Observable | Hidden | Deterministic Behavior | ML Eligible | Auto-match? |
|---|----------|-----------|------------|--------|----------------------|-------------|-------------|
| 1 | **exact_reference + full_payment** | declared_order_id matches obligation.source_reference, amount = outstanding | orderId match, amount exact | allocation = this obligation | STRONG_EVIDENCE → deterministic | No | N/A |
| 2 | **exact_reference + partial_payment** | declared_order_id matches, amount < outstanding | orderId match, amount partial | allocation = this obligation (partial) | STRONG_EVIDENCE → deterministic | No | N/A |
| 3 | **missing_reference** | all declared refs null, correct customer | no refs, correct customer | allocation = target obligation | MODERATE or INSUFFICIENT | Yes | No — ambiguous |
| 4 | **corrupted_reference** | declared_order_id = target.ref with typo (1-2 char edits) | ref exists but doesn't match exactly | allocation = target obligation | INSUFFICIENT (ref not found) | Yes | No — ambiguous |
| 5 | **similar_amount_obligations** | customer has 2+ obligations with amount within 20% of each other | multiple same-customer obligations with similar amounts | allocation = one specific obligation | INSUFFICIENT (multiple candidates) | Yes | No — ambiguous |
| 6 | **multiple_open_obligations** | customer has 3+ open obligations | multiple OPEN obligations | allocation = one specific obligation | INSUFFICIENT (multiple candidates) | Yes | No — ambiguous |
| 7 | **multiple_partial_payments** | 2+ payments arrive for same obligation over time | sequential payments, outstanding decreases | allocation = cumulative | MODERATE (single remaining obligation) | Depends | Depends on remaining candidates |
| 8 | **one_payment_multi_obligation** | single payment covers 2+ obligations exactly | payment amount = sum of obligations | allocation = multiple obligations | INSUFFICIENT (multiple candidates) | Yes | No — must split |
| 9 | **delayed_payment** | payment arrives > recovery_window_hours after obligation created | timestamp difference > window | allocation = target obligation | INSUFFICIENT (outside window) | Yes | No — escalate |
| 10 | **duplicate_payment** | two payments with same amount, timestamp within 1s, same refs | duplicate detection needed | allocation = first payment only | DUPLICATE type → idempotent | Yes | No — deduplicate |
| 11 | **overpayment** | payment amount > obligation outstanding by 5-20% | amount excess visible | allocation = target obligation (excess tracked) | MODERATE or INSUFFICIENT | Yes | No — ambiguous |
| 12 | **failed_then_successful** | FAILED payment followed by CAPTURED payment for same obligation | two events, second is successful | allocation = CAPTURED event | FAILED ignored, CAPTURED matched | Depends | Depends on refs |
| 13 | **genuinely_unmatched** | payment has no matching obligation | no candidate matches | allocation = empty set | NO_MATCH → exception | No | N/A |
| 14 | **genuinely_ambiguous** | 2+ obligations equally plausible, no distinguishing signal | all features similar for multiple candidates | allocation = one specific obligation | INSUFFICIENT → ML must rank | Yes | No — ML ranks, may abstain |
| 15 | **shared_contact** | payment declared_customer matches 2+ customers (shared email domain) | customer identity non-unique | allocation = specific customer's obligation | INSUFFICIENT (multiple customers) | Yes | No — ambiguous |
| 16 | **noisy_contact** | declared_customer has typos (edit distance 1-2) | customer identity doesn't exact-match | allocation = target obligation | INSUFFICIENT (no customer match) | Yes | No — ambiguous |

### 2.2 Scenario Probability Distribution (Pilot)

| Scenario | Probability | Rationale |
|----------|-------------|-----------|
| exact_reference + full | 15% | Common in production |
| exact_reference + partial | 10% | Partial payments with correct ref |
| missing_reference | 15% | Most common hard case |
| corrupted_reference | 8% | Simulates noisy data |
| similar_amount_obligations | 12% | Core ML challenge |
| multiple_open_obligations | 10% | Common for active customers |
| multiple_partial_payments | 5% | Less common but important |
| one_payment_multi_obligation | 3% | Rare but critical |
| delayed_payment | 5% | Edge case |
| duplicate_payment | 4% | Deduplication needed |
| overpayment | 3% | Edge case |
| failed_then_successful | 3% | Event sequence |
| genuinely_unmatched | 3% | Must not false-match |
| genuinely_ambiguous | 2% | True ambiguity |
| shared_contact | 1% | Edge case |
| noisy_contact | 1% | Edge case |

---

## 3. Candidate Generation (Causal)

### 3.1 Rule: No Ground Truth in Candidate Retrieval

Candidate generation accepts ONLY:
- `ObservablePaymentEvent` (payment fields)
- `Obligation[]` (all obligations in the system)

Candidate generation MUST NOT access:
- `PaymentAllocation` (ground truth)
- `scenario_type` (metadata)
- `declared_customer_id_correctness` (hidden)

### 3.2 Candidate Retrieval Algorithm

```python
def generate_candidates(payment: ObservablePaymentEvent, obligations: List[Obligation]) -> List[Obligation]:
    """
    Causal candidate generation using only observable information.
    """
    candidates = []

    # Step 1: Reference-based retrieval (if references exist)
    if payment.declared_order_id:
        ref_matches = [o for o in obligations if o.source_reference == payment.declared_order_id]
        candidates.extend(ref_matches)

    if payment.declared_invoice_id:
        inv_matches = [o for o in obligations if o.source_reference == payment.declared_invoice_id]
        candidates.extend(inv_matches)

    # Step 2: Customer-based retrieval (if customer identity available)
    customer_id = resolve_customer_id(payment)
    if customer_id:
        cust_obligations = [o for o in obligations if o.customer_id == customer_id
                           and o.status in ("OPEN", "PARTIALLY_RECOVERED")]
        candidates.extend(cust_obligations)

    # Step 3: If no candidates from steps 1-2, fallback to amount-based
    if not candidates:
        # Broad fallback: obligations with outstanding within 50% of payment amount
        low = payment.amount_paise * 0.5
        high = payment.amount_paise * 2
        candidates = [o for o in obligations
                     if o.status in ("OPEN", "PARTIALLY_RECOVERED")
                     and low <= o.outstanding_amount_paise <= high]

    # Step 4: If still no candidates, return all open obligations (last resort)
    if not candidates:
        candidates = [o for o in obligations if o.status in ("OPEN", "PARTIALLY_RECOVERED")]

    # Deduplicate
    seen = set()
    unique = []
    for c in candidates:
        if c.id not in seen:
            seen.add(c.id)
            unique.append(c)

    return unique
```

### 3.3 Customer Identity Resolution

```python
def resolve_customer_id(payment: ObservablePaymentEvent) -> Optional[str]:
    """
    Attempt to resolve customer identity from payment metadata.
    Returns customer_id or None.
    """
    # Direct match: declared_customer_id exact matches a customer
    if payment.declared_customer_id:
        if payment.declared_customer_id in known_customer_ids:
            return payment.declared_customer_id
        # Typo tolerance: edit distance 1
        for cid in known_customer_ids:
            if edit_distance(payment.declared_customer_id, cid) <= 1:
                return cid  # noisy contact

    # Email domain match: extract domain from declared_customer_email
    if payment.declared_customer_email:
        domain = extract_domain(payment.declared_customer_email)
        matches = [c for c in customers if c.email_domain == domain]
        if len(matches) == 1:
            return matches[0].id  # unique domain → customer
        # Multiple matches → shared contact → return None (ambiguous)

    # Phone match: last 4 digits
    if payment.declared_customer_phone:
        matches = [c for c in customers if c.phone_last4 == payment.declared_customer_phone[-4:]]
        if len(matches) == 1:
            return matches[0].id

    return None  # unknown contact
```

### 3.4 What Makes This Causal

1. **Customer identity resolution uses only payment-declared fields** — not ground truth
2. **Reference retrieval uses payment-declared references** — not ground truth
3. **Shared contacts produce ambiguity** — multiple customers match, candidate set is broader
4. **Noisy contacts may fail to match** — candidate set may be empty or wrong
5. **Fallback strategies are realistic** — amount-based when identity is unknown
6. **Ground truth allocation is NEVER consulted** during candidate generation

---

## 4. Difficulty Design

### 4.1 Preventing Trivial ML

For the correct candidate and its hard negatives, deliberately overlap:

| Signal | Overlap Strategy |
|--------|-----------------|
| Amount ratio | Generate obligations with amounts within 5-15% of each other for the same customer |
| Amount difference | Use similar outstanding amounts (e.g., ₹9,500 vs ₹10,000 vs ₹10,500) |
| Temporal distance | Create obligations within 1-3 days of each other |
| Candidate count | Ensure ML-eligible cases have 3-8 candidates (not 1-2) |
| Payment method | Same method across all customers (UPI dominant in India) |
| Reference similarity | Corrupted references that are close to multiple obligations |

### 4.2 Anti-Triviality Rules

```
RULE 1: The correct candidate must NOT always be the closest amount.
  → 30% of cases: correct obligation has amount within 1% of payment
  → 40% of cases: correct obligation has amount within 5% but NOT closest
  → 30% of cases: correct obligation amount differs by >5% (partial/overpayment)

RULE 2: The correct candidate must NOT always have the earliest creation date.
  → Randomize obligation creation order relative to payment

RULE 3: The correct candidate must NOT always be the only OPEN obligation.
  → Generate 2-5 OPEN obligations per customer for ML-eligible cases

RULE 4: The correct candidate must NOT always have an exact reference.
  → 60% of ML-eligible cases have corrupted/missing references

RULE 5: The correct candidate must NOT always be the first in the candidate list.
  → Shuffle candidate order before feature extraction

RULE 6: Hard negatives must overlap with the correct candidate on key features.
  → For each positive, generate 1-3 negatives with:
    - Same customer (100%)
    - Amount within 20% (70%)
    - Same status (OPEN) (80%)
    - Similar creation date (within 7 days) (60%)
```

---

## 5. Feature Design

### 5.1 Feature List

| # | Feature | Observable Source | Available at Payment Arrival? | Why Useful? | Possible Leakage? | Production Equivalent |
|---|---------|------------------|------------------------------|-------------|-------------------|----------------------|
| 1 | `sameCustomer` | payment.declared_customer_id == obligation.customer_id | ✓ | Strongest signal — same customer = likely match | No — uses declared, not ground truth | `payment.customerId == obligation.customerId` |
| 2 | `amountRatio` | payment.amount_paise / obligation.outstanding_amount_paise | ✓ | Closer to 1.0 = more likely match | No | Same |
| 3 | `amountDifferencePaise` | abs(payment.amount_paise - obligation.outstanding_amount_paise) | ✓ | Lower = more likely match | No | Same |
| 4 | `hasReference` | payment.declared_order_id is not null OR payment.declared_invoice_id is not null | ✓ | Having any reference is better than none | No | `payment.orderId != null \|\| payment.invoiceId != null` |
| 5 | `referenceMatch` | payment.declared_order_id == obligation.source_reference OR payment.declared_invoice_id == obligation.source_reference | ✓ | Exact reference = strongest match signal | No — this is the STRONG_EVIDENCE feature; ML sees it when deterministic matching fails (corrupted refs) | `candidate.sourceReference == payment.orderId` |
| 6 | `referenceSimilarity` | fuzzy_match(payment.declared_order_id, obligation.source_reference) | ✓ | Corrupted refs still carry signal | No | Levenshtein/token overlap |
| 7 | `paymentMethodIsCommon` | payment.payment_method in ("upi", "neft") | ✓ | Common methods may correlate with certain obligation types | No | `payment.paymentMethod` |
| 8 | `outstandingRatio` | obligation.outstanding_amount_paise / obligation.original_amount_paise | ✓ | Higher = more outstanding = more likely target | No | Same |
| 9 | `paymentIsPartial` | payment.amount_paise < obligation.outstanding_amount_paise | ✓ | Partial payments have different matching dynamics | No | Same |
| 10 | `paymentIsExact` | payment.amount_paise == obligation.outstanding_amount_paise | ✓ | Exact match is strong signal | No | Same |
| 11 | `paymentIsExcess` | payment.amount_paise > obligation.outstanding_amount_paise | ✓ | Overpayment may indicate wrong obligation or intentional | No | Same |
| 12 | `candidateIsOpen` | obligation.status == "OPEN" | ✓ | OPEN obligations are more likely targets | No | Same |
| 13 | `candidateIsPartiallyRecovered` | obligation.status == "PARTIALLY_RECOVERED" | ✓ | Partially recovered = some payment already made | No | Same |
| 14 | `numCandidates` | len(candidates) | ✓ | More candidates = harder problem | No | Same |
| 15 | `obligationAgeHours` | (payment.occurred_at - obligation.created_at).hours | ✓ | Newer obligations may be more likely targets | No | `payment.occurredAt - obligation.createdAt` |
| 16 | `withinRecoveryWindow` | (payment.occurred_at - obligation.created_at).hours <= obligation.recovery_window_hours | ✓ | Outside window = should escalate, not match | No | `recoveryWindowExpiry` check |
| 17 | `daysSinceCreation` | (payment.occurred_at - obligation.created_at).days | ✓ | Temporal proximity signal | No | Same |

### 5.2 Features Intentionally Excluded

| Feature | Why Excluded |
|---------|-------------|
| `obligation.originalAmountPaise` | Redundant with outstandingAmountPaise when outstandingRatio is used |
| `payment.currency` | Always INR in Settle — constant feature |
| `scenario_type` | Ground truth metadata — leakage |
| `allocation_amount` | Ground truth — leakage |
| `customer_correct` | Hidden — whether declared_customer_id is correct |
| `reference_correct` | Hidden — whether declared references are correct |

### 5.3 Feature Availability Verification

All 17 features use ONLY:
- `payment.declared_*` fields (observable at arrival)
- `obligation.*` fields (observable from database)
- Derived values (ratios, differences, counts)

No feature accesses:
- `PaymentAllocation` (ground truth)
- `scenario_type` (metadata)
- `customer_correct` (hidden)
- `reference_correct` (hidden)

---

## 6. Ground-Truth Rules

### 6.1 Allocation Generation

Ground truth is generated FIRST, then kept separate from all observable code.

```python
def generate_ground_truth(payment, obligations, scenario_type) -> List[PaymentAllocation]:
    """
    Determine how payment amount is allocated to obligations.
    This function is ONLY called by the Evaluator, never by candidate generation or feature extraction.
    """
    allocations = []

    if scenario_type in ("exact_reference_full", "exact_reference_partial",
                          "missing_reference", "corrupted_reference",
                          "similar_amount", "multiple_open", "delayed",
                          "overpayment", "shared_contact", "noisy_contact",
                          "genuinely_ambiguous"):
        # 1 payment → 1 obligation
        target = find_target_obligation(payment, obligations, scenario_type)
        if target:
            alloc_amount = min(payment.amount_paise, target.outstanding_amount_paise)
            allocations.append(PaymentAllocation(
                payment_id=payment.id,
                obligation_id=target.id,
                allocated_amount_paise=alloc_amount
            ))

    elif scenario_type == "one_payment_multi_obligation":
        # 1 payment → N obligations (split)
        targets = find_multi_targets(payment, obligations)
        remaining = payment.amount_paise
        for t in targets:
            alloc = min(remaining, t.outstanding_amount_paise)
            allocations.append(PaymentAllocation(payment.id, t.id, alloc))
            remaining -= alloc
            if remaining <= 0:
                break

    elif scenario_type == "multiple_partial_payments":
        # N payments → 1 obligation (sequential)
        target = find_target_obligation(payment, obligations, scenario_type)
        if target:
            alloc_amount = min(payment.amount_paise, target.outstanding_amount_paise)
            allocations.append(PaymentAllocation(payment.id, target.id, alloc_amount))

    elif scenario_type == "duplicate_payment":
        # Only first payment allocates; second is idempotent
        if is_first_payment(payment):
            target = find_target_obligation(payment, obligations, scenario_type)
            if target:
                allocations.append(PaymentAllocation(payment.id, target.id, payment.amount_paise))

    elif scenario_type == "failed_then_successful":
        if payment.type == "CAPTURED":
            target = find_target_obligation(payment, obligations, scenario_type)
            if target:
                allocations.append(PaymentAllocation(payment.id, target.id,
                    min(payment.amount_paise, target.outstanding_amount_paise)))

    elif scenario_type == "genuinely_unmatched":
        allocations = []  # empty allocation set

    return allocations
```

### 6.2 Overpayment Handling

```
If payment.amount > obligation.outstanding:
  allocation.amount = obligation.outstanding  (NOT payment.amount)
  excess = payment.amount - obligation.outstanding
  excess tracked separately in ExcessRecord
  obligation.status = "OVERPAID"
```

The excess is NOT silently allocated to the obligation.

### 6.3 Multiple Obligations

```
If payment covers multiple obligations:
  For each obligation in sorted order (by created_at):
    alloc = min(remaining_payment, obligation.outstanding)
    allocations.append(...)
    remaining_payment -= alloc
  If remaining_payment > 0 after all obligations:
    excess tracked separately
```

---

## 7. Leakage Controls

### 7.1 Explicit Checklist

| # | Leakage Type | Control | Status |
|---|-------------|---------|--------|
| 1 | Target-derived features | No feature uses PaymentAllocation, scenario_type, or hidden flags | ✓ |
| 2 | Target-derived candidate generation | CandidateGenerator accepts only ObservablePaymentEvent + Obligation[] | ✓ |
| 3 | ID leakage | PaymentAllocation.payment_id is never used in feature extraction | ✓ |
| 4 | Timestamp leakage | obligation.created_at is used for age features (observable), but NOT for candidate ordering | ✓ |
| 5 | Amount leakage | payment.amount_paise and obligation.outstanding_amount_paise are observable; allocation_amount is hidden | ✓ |
| 6 | Scenario metadata leakage | scenario_type is never passed to CandidateGenerator, FeatureExtractor, or Model | ✓ |
| 7 | Candidate position leakage | Candidate list is shuffled before feature extraction; position is not a feature | ✓ |
| 8 | Template leakage | Each scenario is generated independently; no template IDs leak across scenarios | ✓ |
| 9 | Entity leakage | Customer-isolated split: no customer appears in both train and test | ✓ |
| 10 | Duplicate rows | Each (payment, candidate) pair is unique; no duplicate training examples | ✓ |
| 11 | Train/test contamination | Split is assigned BEFORE feature extraction; test scenarios are held out | ✓ |
| 12 | Generator artifacts | Generator uses random seed; no deterministic artifacts that encode ground truth | ✓ |

### 7.2 Automated Leakage Tests

```python
def test_no_ground_truth_in_candidates():
    """Verify candidate generation never accesses ground truth."""
    for payment in payments:
        candidates = candidate_generator.generate(payment, obligations)
        # Check that candidates are derived ONLY from payment + obligation fields
        for c in candidates:
            assert c.id in observable_obligation_ids
        # Check that ground truth allocation is not consulted
        assert not candidate_generator.accesses_allocation(payment)

def test_no_ground_truth_in_features():
    """Verify feature extraction never accesses ground truth."""
    for payment in payments:
        for candidate in candidates[payment.id]:
            features = feature_extractor.extract(payment, candidate, len(candidates[payment.id]))
            # Check no feature contains allocation information
            for feat_name in features:
                assert "allocation" not in feat_name
                assert "scenario" not in feat_name

def test_no_scenariotype_in_model():
    """Verify scenario type never reaches the model."""
    for payment in payments:
        features = feature_extractor.extract(payment, ...)
        # scenario_type must not be in feature vector
        assert "scenario_type" not in features

def test_entity_isolation():
    """Verify no customer appears in both train and test."""
    train_customers = set()
    test_customers = set()
    for payment in train_payments:
        train_customers.add(payment.declared_customer_id)
    for payment in test_payments:
        test_customers.add(payment.declared_customer_id)
    assert train_customers.isdisjoint(test_customers)

def test_candidate_order_shuffled():
    """Verify candidate order is random, not by obligation ID."""
    orders = []
    for _ in range(10):
        candidates = candidate_generator.generate(payment, obligations)
        orders.append([c.id for c in candidates])
    # Not all identical
    assert len(set(tuple(o) for o in orders)) > 1
```

---

## 8. Synthetic Realism Checks

### 8.1 Pre-Training Diagnostics

Run these BEFORE any model training:

| Check | Method | Fail Condition |
|-------|--------|---------------|
| **Single-feature separability** | For each feature, compute AUC on train set | AUC > 0.95 → feature is trivially predictive → investigate |
| **Feature distributions by label** | Plot feature distributions for positive vs negative pairs | If distributions are perfectly separated → leakage |
| **Candidate-set size distribution** | Histogram of candidate counts | All sets size 1 → trivial; all sets size > 100 → unrealistic |
| **Scenario distribution** | Count of each scenario type | No scenario type < 1% (insufficient signal) |
| **Amount-ratio overlap** | Histogram of amountRatio for positive vs negative | No overlap → trivial; full overlap → too hard |
| **Temporal overlap** | Distribution of daysSinceCreation for positive vs negative | If positives always have smallest age → trivial |
| **Reference corruption rate** | % of ML-eligible cases with corrupted refs | < 20% → too easy; > 80% → reference feature useless |
| **Contact error rate** | % of cases with noisy/missing contact | < 10% → sameCustomer always correct; > 50% → contact feature useless |

### 8.2 Expected Ranges

| Metric | Expected Range | Action if Outside |
|--------|---------------|-------------------|
| Single-feature AUC | 0.55–0.85 | > 0.95: remove feature or add noise; < 0.50: feature is random noise |
| Positive/negative amountRatio overlap | 30–70% | < 20%: too easy; > 80%: too hard |
| Candidate set size (ML-eligible) | 3–8 | < 2: trivial; > 15: unrealistic for production |
| Reference corruption (ML-eligible) | 40–70% | < 30%: referenceMatch trivially solves; > 80%: reference feature useless |

---

## 9. Splitting Strategy

### 9.1 Entity-Isolated Split

```
Customer-level isolation:
  - 70% of customers → train
  - 15% of customers → validation
  - 15% of customers → test

All payments for a customer go to the same split.
No customer appears in multiple splits.
```

### 9.2 Obligation-Isolated Split (Secondary)

```
Obligation-level isolation:
  - 70% of obligations → train
  - 15% of obligations → validation
  - 15% of obligations → test

All payments targeting an obligation go to the same split.
Prevents memorizing obligation-specific patterns.
```

### 9.3 Held-Out Scenario Test Set

```
Scenario archetype isolation:
  - Hold out 1-2 scenario types entirely for test
  - E.g., "shared_contact" and "noisy_contact" only in test
  - Tests generalization to unseen scenario types
```

### 9.4 Split Assignment Order

1. Generate all world state (customers, obligations, payments)
2. Assign scenario types to payments
3. Generate ground-truth allocations
4. **Assign splits BEFORE feature extraction**
5. Extract features (only using observable fields)
6. Generate candidate sets (only using observable fields)
7. Apply leakage diagnostics
8. Train/evaluate

---

## 10. Evaluation

### 10.1 Primary Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Top-1 Accuracy** | Fraction of sets where top-scored candidate is correct | > 0.50 |
| **Top-3 Accuracy** | Fraction of sets where correct candidate is in top 3 | > 0.75 |
| **MRR** | Mean reciprocal rank of correct candidate | > 0.60 |
| **Precision (confident)** | Of accepted predictions, fraction correct | ≥ 0.95 (safety floor) |
| **Coverage** | Fraction of sets where model accepts | > 0.30 |
| **Abstention** | 1 - coverage | < 0.70 |
| **False-positive rate** | Of accepted predictions, fraction incorrect | < 0.05 |

### 10.2 Scenario-Category Metrics

Report all metrics separately for:
- Missing reference cases
- Corrupted reference cases
- Similar-amount cases
- Multiple-obligation cases
- Overpayment cases
- Delayed payment cases
- Unmatched payment cases
- Shared-contact cases
- Noisy-contact cases

### 10.3 Abstention Quality

```
abstention_quality = (abstentions where model would have been wrong) / total_abstentions
```

Target: > 0.80 (model abstains when it would make errors)

---

## 11. Safety Objective

### 11.1 Optimization Target

```
MAXIMIZE: coverage
SUBJECT TO: precision ≥ SAFETY_FLOOR (e.g., 0.95)
```

**NOT:** "maximize F1" — F1 balances precision and recall, but in financial systems, a false positive (wrong match) is far worse than a false negative (abstention).

### 11.2 Threshold Selection

```
For each candidate threshold T and margin M:
  accepted = payments where top_score ≥ T AND (top_score - second_score) ≥ M
  correct = accepted payments where top candidate is correct
  precision = correct / len(accepted)
  coverage = len(accepted) / total_payments

Select (T, M) such that:
  precision ≥ SAFETY_FLOOR
  coverage is maximized
  among ties, select (T, M) with highest coverage
```

### 11.3 Safety Floor Selection

The safety floor will be chosen based on:
1. **Regulatory requirement**: If any, use that as the floor
2. **Operational cost**: Cost of a wrong match (manual reversal) vs cost of abstention (human review)
3. **Pilot results**: Start with 0.95, adjust based on observed precision

### 11.4 Precision-Coverage Curve

Plot precision vs coverage for all (T, M) combinations. The operating point is the knee of the curve where precision first drops below the safety floor.

---

## 12. Model Plan

### 12.1 Baselines

| # | Model | Description | Purpose |
|---|-------|-------------|---------|
| 1 | **Amount-only** | Rank by |payment_amount - obligation_outstanding| | Simplest baseline |
| 2 | **Heuristic** | Same customer + amount ratio + reference match (hand-tuned weights) | Existing Settle heuristic |
| 3 | **Logistic regression** | 17 features, z-score standardized, L2 regularized | Primary ML model |

### 12.2 Optional Future Models

| # | Model | When to Add |
|---|-------|------------|
| 4 | **Gradient-boosted trees** | If LR plateau is insufficient |
| 5 | **Random forest** | If interpretability is needed |

### 12.3 Models NOT Allowed

- Neural networks (too complex for hackathon, too hard to explain)
- Ensemble methods beyond boosting (diminishing returns)

---

## 13. Pilot Dataset Specification

### 13.1 Size

| Entity | Count |
|--------|-------|
| Customers | 200 |
| Obligations | 1,000 (avg 5 per customer) |
| Payments | 5,000 |
| ML-eligible payments | ~1,500-2,000 (30-40% of total) |

### 13.2 Reproducibility

```python
SEED = 20260905
random.seed(SEED)
np.random.seed(SEED)
```

### 13.3 Generator Configuration

```python
CONFIG = {
    "n_customers": 200,
    "n_obligations_per_customer": (2, 8),  # uniform
    "obligation_amount_paise": (500_00, 50_00_00),  # ₹500–₹50,000
    "recovery_window_hours": (24, 168),
    "payment_amount_noise": 0.05,  # ±5% noise on exact amounts
    "reference_corruption_rate": 0.40,
    "contact_error_rate": 0.20,
    "shared_contact_rate": 0.05,
    "scenario_probabilities": { ... },  # from Section 2.2
    "seed": 20260905,
}
```

---

## 14. Architecture Boundary

### 14.1 Component Boundaries

```
┌─────────────────────────────────────────────────────┐
│                    WorldGenerator                     │
│  Creates: customers, obligations, payments, gt       │
│  Access: full world state                            │
└───────────────────────┬─────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
    ┌───────▼───────┐      ┌───────▼───────┐
    │ Observable    │      │ Hidden         │
    │ PaymentEvent  │      │ Allocation     │
    │ Obligation[]  │      │ ScenarioType   │
    └───────┬───────┘      │ CustomerCorrect│
            │              │ ReferenceCorrect│
            │              └───────┬────────┘
            │                      │
    ┌───────▼───────┐      ┌───────▼───────┐
    │CandidateGen   │      │ Evaluator     │
    │(only observe) │      │(only hidden)  │
    └───────┬───────┘      └───────┬───────┘
            │                      │
    ┌───────▼───────┐              │
    │FeatureExtract │              │
    │(only observe) │              │
    └───────┬───────┘              │
            │                      │
    ┌───────▼───────┐              │
    │ Model         │              │
    │(scores only)  │              │
    └───────┬───────┘              │
            │                      │
    ┌───────▼──────────────────────▼───────┐
    │            Metrics & Diagnostics       │
    │  (compares model output vs hidden gt) │
    └───────────────────────────────────────┘
```

### 14.2 Data Flow Rules

1. `WorldGenerator` → `ObservablePaymentEvent` + `Obligation[]` → `CandidateGenerator`
2. `CandidateGenerator` → `List[Obligation]` → `FeatureExtractor`
3. `FeatureExtractor` → `FeatureVector[]` → `Model`
4. `Model` → `Score[]` → `Evaluator`
5. `Evaluator` ← `HiddenAllocation` ← `WorldGenerator`
6. **NEVER**: `HiddenAllocation` → `CandidateGenerator`
7. **NEVER**: `HiddenAllocation` → `FeatureExtractor`
8. **NEVER**: `ScenarioType` → `Model`

---

## 15. Implementation Plan

### Phase 1: Design + Pilot Generator (this document)
- [x] Design document
- [ ] Pilot generator (5,000 payments)
- [ ] Leakage diagnostics
- [ ] Realism checks

### Phase 2: Experiment
- [ ] Baseline evaluation
- [ ] LR training + evaluation
- [ ] Threshold optimization
- [ ] Scenario-category analysis

### Phase 3: Analysis
- [ ] Results documentation
- [ ] Comparison with public-dataset POC
- [ ] Production readiness assessment

---

*Created: 2026-09-05*
*Status: Design complete*
