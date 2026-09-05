# ML Primary Datasets: Comparison

## Overview

Two primary datasets for Settle ML training:

1. **DataManagementLab/llmeval-trl24** — Payment-to-invoice matching (exactly Settle's problem)
2. **MessyOps (Kaggle)** — B2B distributor with invoice-payment linking + data quality issues

Secondary: ReconRiver (reconciliation), FreeFinancialTransactions50M (feature distribution only)

---

## Side-by-Side Comparison

| Dimension | llmeval-trl24 | MessyOps |
|---|---|---|
| **Source** | GitHub (DataManagementLab) | Kaggle (fares279) |
| **Focus** | Payment-to-invoice entity matching | End-to-end B2B distributor data |
| **License** | MIT | Community (verify before publication) |
| **Invoices** | 15,684 (single) / 15,692 (multi) | 72,800 |
| **Payments** | 12,189 (single) / 12,284 (multi) | 76,343 |
| **Customers** | 50 | 4,080 |
| **Ground truth** | `matches.csv` (explicit) | `payments.invoice_id` (direct link) |
| **Relationship types** | 1:1, 1:N, N:1 | 1:1 only (no split invoicing) |
| **Partial payments** | Yes (multi_pay_one_inv) | Yes (5,535 partial payments) |
| **Many-to-one** | Yes (multi_pay_one_inv: 19.5%) | No |
| **One-to-many** | Yes (one_pay_multi_inv: 20.2%) | No |
| **Perturbations** | 4 types (amount, partner, billing, assignment) | 10 DQ issue types (8,079 issues) |
| **Data quality issues** | None (clean synthetic) | 8,079 with ground truth |
| **Schema modes** | Descriptive + Opaque | Single realistic schema |
| **Currency support** | 12 currencies | None (assumed USD) |
| **Temporal component** | Document date + due date + posting date | Invoice date + due date + payment date |
| **Amount range** | $1,680 - $721M (multi-currency) | $13 - $144K (USD only) |
| **Unique identifiers** | invoice_id, payment_id, match_id | invoice_id, payment_id, customer_id |
| **Orphan records** | None | 634 payments reference missing invoices |
| **Settle fit** | ★★★★★ (exact problem match) | ★★★★ (strong supporting data) |

---

## Detailed Field Mapping

### llmeval-trl24 Invoice Fields
| Field | Description | Settle Equivalent |
|---|---|---|
| `invoice_id` | Internal ID | obligation_id |
| `Client` | Always "001" | — |
| `Company Code` | Company identifier | — |
| `Fiscal Year` | Year (2000-2024) | — |
| `Document Number` | 10-digit SAP-style | — |
| `Line Item Number` | Line item (001-009) | — |
| `Assignment Number` | Unique INV+15digits | reference_id |
| `Billing Number` | Unique 10-digit | invoice_number |
| `Customer ID` | 3 alpha + 7 digits (50 customers) | customer_id |
| `Customer Name` | Company name (150+ names) | customer_name |
| `Currency Code` | 12 currencies | currency |
| `Amount` | Invoice amount (multi-currency) | amount_paise |
| `Document Date` | YYYYMMDD | created_at |
| `Due Date` | YYYYMMDD | due_date |

### llmeval-trl24 Payment Fields
| Field | Description | Settle Equivalent |
|---|---|---|
| `payment_id` | Internal ID | payment_event_id |
| `Business Partner` | Company name (may be perturbed) | payer_name |
| `Account Number` | IBAN-style | payer_account |
| `Memo Line` | Reference text (may be perturbed) | reference_text |
| `Amount` | Payment amount | amount_paise |
| `Currency` | Same as invoice | currency |
| `Posting Date` | YYYYMMDD | created_at |

### llmeval-trl24 Match Fields
| Field | Description |
|---|---|
| `match_id` | Unique match identifier |
| `match_category` | one_pay_one_inv / multi_pay_one_inv / one_pay_multi_inv |
| `perturbation_categories` | JSON array of perturbation types |
| `invoice_ids` | JSON array of matched invoice IDs |
| `payment_ids` | JSON array of matched payment IDs |

### MessyOps Invoice Fields
| Field | Description | Settle Equivalent |
|---|---|---|
| `invoice_id` | INV-XXXXXXX | obligation_id |
| `sales_order_id` | SO-XXXXXXX | origin_id |
| `customer_id` | CUST-XXXXXX | customer_id |
| `invoice_date` | YYYY-MM-DD | created_at |
| `due_date` | YYYY-MM-DD | due_date |
| `payment_term_days` | 30/45/60 | — |
| `invoice_amount` | Total amount | amount_paise |
| `amount_paid` | Amount paid so far | — |
| `balance_due` | Remaining balance | — |
| `invoice_status` | Paid/Overdue/Unpaid/Partially Paid | status |
| `days_to_full_payment` | Days until fully paid | — |
| `late_payment` | True/False | overdue |

### MessyOps Payment Fields
| Field | Description | Settle Equivalent |
|---|---|---|
| `payment_id` | PAY-XXXXXXX | payment_event_id |
| `invoice_id` | INV-XXXXXXX (direct link) | obligation_id |
| `payment_date` | YYYY-MM-DD | created_at |
| `payment_amount` | Amount paid | amount_paise |
| `payment_method` | Wire/ACH/Credit Card/Check | payment_method |
| `is_partial_payment` | True/False | — |

---

## Match Category Distribution (llmeval-trl24 single)

| Category | Count | Percentage | Description |
|---|---|---|---|
| one_pay_one_inv | 6,031 | 60.3% | Perfect 1:1 match |
| one_pay_multi_inv | 2,017 | 20.2% | Payment covers multiple invoices |
| multi_pay_one_inv | 1,952 | 19.5% | Multiple payments to one invoice |

## Perturbation Distribution (llmeval-trl24 single)

| Perturbation | Count | Percentage | Description |
|---|---|---|---|
| perturbed_business_partner | 1,899 | 19.0% | Company name altered on payment |
| perturbed_assignment_number | 1,895 | 18.9% | Assignment reference corrupted |
| perturbed_billing_number | 1,870 | 18.7% | Billing number corrupted |
| small_deduction | 1,816 | 18.2% | Amount slightly less (bank fees) |
| No perturbation | 2,520 | 25.2% | Clean match |

## Perturbation Count (llmeval-trl24 multi)

| Perturbations | Count | Percentage |
|---|---|---|
| 0 | 2,492 | 24.9% |
| 1 | 1,851 | 18.5% |
| 2 | 1,897 | 19.0% |
| 3 | 1,864 | 18.6% |
| 4 | 1,896 | 19.0% |

---

## Invoice Status Distribution (MessyOps)

| Status | Count | Percentage |
|---|---|---|
| Paid | 70,526 | 96.9% |
| Overdue | 1,384 | 1.9% |
| Unpaid | 496 | 0.7% |
| Partially Paid | 394 | 0.5% |

## Data Quality Issues (MessyOps)

| Issue Type | Count | Relevance to Settle |
|---|---|---|
| missing_value_injected | 3,161 | Missing customer/amount data |
| malformed_date_format | 2,256 | Date parsing challenges |
| inconsistent_id_format | 1,123 | ID matching challenges |
| orphan_foreign_key | 661 | Payments to non-existent invoices |
| duplicate_transaction | 323 | Deduplication challenges |
| impossible_value | 301 | Amount/date anomalies |
| whitespace_casing_issue | 118 | String matching challenges |
| duplicate_record | 80 | Near-duplicate customers |
| inconsistent_category_label | 36 | Category normalization |
| unit_magnitude_error | 20 | Amount scaling errors |

---

## Suitability Assessment

### llmeval-trl24 Strengths
- **Exact problem match:** Payment-to-invoice matching is Settle's core task
- **Explicit ground truth:** `matches.csv` with relationship types
- **Multiple match types:** 1:1, 1:N, N:1 — covers all Settle scenarios
- **Realistic perturbations:** Amount deductions, name/reference corruption
- **Multi-currency:** 12 currencies with conversion rates
- **Enterprise schema:** SAP-style opaque names for realism
- **MIT license:** Can be freely used

### llmeval-trl24 Limitations
- **Synthetic data:** Generated, not real transactions
- **50 customers only:** Limited customer diversity
- **No temporal realism:** Dates are generated, not real sequences
- **No payment methods:** Only amounts and dates
- **No balance tracking:** No concept of partial payment over time

### MessyOps Strengths
- **Realistic B2B data:** Full distributor data model
- **4,080 customers:** Much larger customer base
- **Partial payments:** 5,535 explicit partial payment records
- **Data quality issues:** 8,079 issues with ground truth — perfect for hard negatives
- **Temporal realism:** 2 years of data (2024-2025)
- **Multiple related tables:** Orders, shipments, returns, support tickets
- **Direct linkage:** Payments.linked to invoices via `invoice_id`

### MessyOps Limitations
- **1:1 only:** No split invoicing (one payment per invoice)
- **License unclear:** Must verify before publication
- **No multi-currency:** Assumed USD only
- **No reference text:** No memo line or payment references
- **No perturbation types:** Only data quality issues, not payment-specific perturbations

---

## Recommended Primary/Secondary Roles

| Dataset | Role | Why |
|---|---|---|
| **llmeval-trl24** | **Primary** | Exact problem match, explicit ground truth, multiple relationship types, MIT license |
| **MessyOps** | **Secondary** | Large scale, data quality issues for hard negatives, realistic B2B data |
| ReconRiver | Tertiary | Reconciliation (different problem), limited multi-candidate pairs |
| FreeFinancial50M | Reference | Feature distribution validation only |

---

*Created: 2026-09-05*
*Status: Analysis complete*
