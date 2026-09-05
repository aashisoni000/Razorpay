# Future Dataset Schema

## Overview

The 100k+ dataset consists of labeled (payment, candidate obligation) pairs. Each row represents one candidate for one payment. A single payment with 5 candidates produces 5 rows (1 positive, 4 negatives).

## Schema

### Identifiers

| Column | Type | Description |
|--------|------|-------------|
| `pair_id` | string | Unique identifier for this (payment, candidate) pair |
| `payment_id` | string | Unique identifier for the payment |
| `obligation_id` | string | Unique identifier for the candidate obligation |
| `customer_id` | string | Customer who made the payment (may be null) |

### Payment Features

| Column | Type | Description | Available at Inference |
|--------|------|-------------|----------------------|
| `payment_amount_paise` | bigint | Payment amount in paise | Yes |
| `payment_order_id` | string? | Order reference from payment | Yes |
| `payment_invoice_id` | string? | Invoice reference from payment | Yes |
| `payment_subscription_id` | string? | Subscription reference from payment | Yes |
| `payment_method` | string? | UPI, card, netbanking, etc. | Yes (if Razorpay provides) |
| `payment_currency` | string | Currency code (e.g., INR) | Yes |
| `payment_timestamp` | datetime | When the payment occurred | Yes |

### Candidate Obligation Features

| Column | Type | Description | Available at Inference |
|--------|------|-------------|----------------------|
| `obligation_original_amount_paise` | bigint | Original obligation amount | Yes |
| `obligation_outstanding_amount_paise` | bigint | Current outstanding amount | Yes |
| `obligation_source_reference` | string? | Order/invoice reference on obligation | Yes |
| `obligation_status` | string | OPEN, PARTIALLY_RECOVERED, etc. | Yes |
| `obligation_created_at` | datetime | When the obligation was created | Yes |

### Derived Features (Computed at Pair Level)

| Column | Type | Description | Available at Inference |
|--------|------|-------------|----------------------|
| `customer_match` | binary | payment.customer_id == obligation.customer_id | Yes |
| `reference_match` | binary | Exact match between payment ref and obligation source_reference | Yes |
| `reference_similarity` | float | Fuzzy string similarity [0, 1] | Yes |
| `amount_difference_paise` | bigint | \|payment_amount - obligation_outstanding\| | Yes |
| `amount_ratio` | float | payment_amount / obligation_outstanding | Yes |
| `time_difference_hours` | float | Hours between payment and obligation creation | Yes |
| `within_recovery_window` | binary | Is payment within policy recovery window | Yes |
| `candidate_count` | int | Total candidates for this payment | Yes |
| `obligation_age_hours` | float | Hours since obligation was created | Yes |
| `is_partial_payment` | binary | payment_amount < obligation_outstanding | Yes |
| `is_exact_payment` | binary | payment_amount == obligation_outstanding | Yes |
| `is_excess_payment` | binary | payment_amount > obligation_outstanding | Yes |
| `outstanding_ratio` | float | obligation_outstanding / obligation_original | Yes |

### Label

| Column | Type | Description |
|--------|------|-------------|
| `label` | binary | 1 = correct match, 0 = incorrect candidate |

### Metadata

| Column | Type | Description |
|--------|------|-------------|
| `generation_method` | string | How this pair was created (synthetic, real, hard_negative, etc.) |
| `scenario_type` | string | Category of scenario (exact_ref, partial_payment, ambiguous, etc.) |
| `split` | string | train, validation, or test |

## Key Design Decisions

1. **No recovered_amount or refunded_amount in the schema**: These are derived from payment events that happen AFTER the payment arrives. They are not available at inference time and would cause label leakage.

2. **outstanding_amount_paise is the obligation's state at the time the candidate is evaluated**: This is the value at payment arrival time, not after the payment is applied.

3. **reference_similarity**: Uses fuzzy string matching (e.g., Levenshtein distance, Jaccard similarity on tokens) to capture near-matches like "ORD-1001" vs "ORD-100A".

4. **time_difference_hours**: Captures how recently the obligation was created relative to the payment. Recent obligations are more likely targets.

5. **candidate_count**: Context feature. Higher count = more ambiguity = harder matching problem.
