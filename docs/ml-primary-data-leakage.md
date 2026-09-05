# ML Primary Data Leakage Audit

## Purpose

Audit both primary datasets for fields that directly reveal the answer (ground truth leakage). These fields can be used to construct labels but MUST NOT become model features.

---

## llmeval-trl24 Leakage Analysis

### Ground Truth Fields (MUST NOT be features)

| Field | File | Risk | Reason |
|---|---|---|---|
| `match_id` | matches.csv | **HIGH** | Directly identifies the correct match |
| `match_category` | matches.csv | **HIGH** | Reveals relationship type (one_pay_one_inv, etc.) |
| `perturbation_categories` | matches.csv | **HIGH** | Reveals what perturbations were applied |
| `invoice_ids` | matches.csv | **HIGH** | Directly links payment to correct invoice(s) |
| `payment_ids` | matches.csv | **HIGH** | Directly links invoice to correct payment(s) |

### Safe Features (CAN be used)

| Field | File | Why Safe |
|---|---|---|
| `Client` | invoices.csv | Always "001" — not informative |
| `Company Code` | invoices.csv | Available at payment time |
| `Fiscal Year` | invoices.csv | Available at payment time |
| `Document Number` | invoices.csv | Available at payment time |
| `Line Item Number` | invoices.csv | Available at payment time |
| `Assignment Number` | invoices.csv | Available at payment time (but may be perturbed) |
| `Billing Number` | invoices.csv | Available at payment time (but may be perturbed) |
| `Customer ID` | invoices.csv | Available at payment time |
| `Customer Name` | invoices.csv | Available at payment time (but may be perturbed) |
| `Currency Code` | invoices.csv | Available at payment time |
| `Amount` | invoices.csv | Available at payment time |
| `Document Date` | invoices.csv | Available at payment time |
| `Due Date` | invoices.csv | Available at payment time |
| `Business Partner` | payments.csv | Available at payment time (but may be perturbed) |
| `Account Number` | payments.csv | Available at payment time |
| `Memo Line` | payments.csv | Available at payment time (but may be perturbed) |
| `Amount` | payments.csv | Available at payment time |
| `Currency` | payments.csv | Available at payment time |
| `Posting Date` | payments.csv | Available at payment time |

### Leakage Risk: Customer ID + Name

**Risk:** The `Customer ID` and `Customer Name` fields on invoices can be matched to `Business Partner` on payments. This is a legitimate feature (same customer = higher match probability), NOT leakage.

**Mitigation:** These fields are available at payment time in real systems. Using them as features is correct behavior, not data leakage.

### Leakage Risk: Assignment Number + Billing Number

**Risk:** These fields appear on both invoices and payments (in the memo line). If the payment's memo line contains the invoice's assignment/billing number, this is a direct identifier.

**Mitigation:** The perturbation categories (`perturbed_assignment_number`, `perturbed_billing_number`) intentionally corrupt these fields. The model should learn to handle noisy references, not rely on exact matches.

**Recommendation:** Use fuzzy matching features (edit distance, token overlap) rather than exact match flags.

---

## MessyOps Leakage Analysis

### Ground Truth Fields (MUST NOT be features)

| Field | File | Risk | Reason |
|---|---|---|---|
| `invoice_id` | payments.csv | **HIGH** | Directly links payment to correct invoice |
| `sales_order_id` | invoices.csv | **MEDIUM** | Links invoice to order — could reveal grouping |
| `amount_paid` | invoices.csv | **HIGH** | Post-reconciliation field — not available at payment time |
| `balance_due` | invoices.csv | **HIGH** | Post-reconciliation field — not available at payment time |
| `invoice_status` | invoices.csv | **HIGH** | Post-reconciliation field — not available at payment time |
| `days_to_full_payment` | invoices.csv | **HIGH** | Post-reconciliation field — not available at payment time |
| `late_payment` | invoices.csv | **MEDIUM** | Determined after payment — may not be available at matching time |

### Safe Features (CAN be used)

| Field | File | Why Safe |
|---|---|---|
| `customer_id` | invoices.csv | Available at payment time |
| `invoice_date` | invoices.csv | Available at payment time |
| `due_date` | invoices.csv | Available at payment time |
| `payment_term_days` | invoices.csv | Available at payment time |
| `invoice_amount` | invoices.csv | Available at payment time |
| `payment_date` | payments.csv | Available at payment time |
| `payment_amount` | payments.csv | Available at payment time |
| `payment_method` | payments.csv | Available at payment time |
| `is_partial_payment` | payments.csv | Available at payment time |

### Critical Leakage: amount_paid, balance_due, invoice_status

**Risk:** `amount_paid`, `balance_due`, and `invoice_status` are POST-RECONCILIATION fields. They are computed AFTER payments are matched to invoices. Using them as features would be catastrophic data leakage.

**Example:**
- Invoice INV-0000001 has `invoice_amount=54.79`, `amount_paid=54.79`, `balance_due=0.0`, `invoice_status=Paid`
- If we use `balance_due=0.0` as a feature, the model learns "balance_due=0 means matched" — which is trivially true but useless for real matching

**Recommendation:** These fields MUST be excluded from the feature set. They can only be used for label construction (e.g., `balance_due=0` means the invoice is fully paid).

### Orphan Records as Hard Negatives

**Finding:** 634 payments reference invoices NOT in the invoice table. These are `orphan_foreign_key` issues from the data quality log.

**Use:** These can serve as natural hard negatives — payments that look like they should match but have no corresponding invoice.

---

## Combined Leakage Summary

| Field Type | llmeval-trl24 | MessyOps | Action |
|---|---|---|---|
| Match IDs | match_id, invoice_ids, payment_ids | invoice_id (on payments) | **EXCLUDE** from features |
| Match metadata | match_category, perturbation_categories | — | **EXCLUDE** from features |
| Post-reconciliation | — | amount_paid, balance_due, invoice_status, days_to_full_payment | **EXCLUDE** from features |
| Late payment flag | — | late_payment | **EXCLUDE** (post-hoc) |
| Reference text | Assignment Number, Billing Number, Memo Line | — | **USE with caution** (fuzzy features only) |
| Customer identifiers | Customer ID, Customer Name | customer_id | **SAFE** (available at payment time) |
| Amounts | Amount (invoice), Amount (payment) | invoice_amount, payment_amount | **SAFE** (available at payment time) |
| Dates | Document Date, Due Date, Posting Date | invoice_date, due_date, payment_date | **SAFE** (available at payment time) |

---

## Feature Construction Rules

1. **Never use fields from matches.csv as features** — only for label construction
2. **Never use post-reconciliation fields** — amount_paid, balance_due, invoice_status, days_to_full_payment, late_payment
3. **Use fuzzy matching for reference text** — edit distance, token overlap, not exact match
4. **Customer ID/Name are safe** — they're available at payment time and represent legitimate matching signals
5. **Amount and date differences are safe** — they're computed from fields available at payment time
6. **Currency matching is safe** — same currency = higher match probability

---

*Created: 2026-09-05*
*Status: Audit complete*
