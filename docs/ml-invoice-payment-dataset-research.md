# ML Dataset Research: Public Invoice-Payment Matching Datasets

## Why ReconRiver Is Insufficient Alone

ReconRiver (already acquired in `data/raw/reconriver/`) is a payment **reconciliation** dataset — matching internal records against processor and bank statements. It is NOT an invoice-payment matching dataset. Key limitations:

- Processor records have **NO customer_id field** — only `merchant_order_id` links records
- Cannot compute `same_customer` feature directly
- Only **860 genuinely multi-candidate pairs** useful for ML training
- Total pairs: ~21,230 positive, 310 same-order negatives, 1,900 cross-order hard negatives

**Conclusion:** We need a supplementary dataset that represents the actual obligation matching problem — matching incoming payments to open invoices/obligations.

---

## Dataset Inventory

### Tier A: Best Candidates (strong recommendation)

#### 1. DataManagementLab/llmeval-trl24 — Payment-to-Invoice Matching Dataset ⭐ BEST

| Attribute | Details |
|---|---|
| **Source** | [GitHub](https://github.com/DataManagementLab/llmeval-trl24) |
| **Paper** | Bodensohn et al., "Automating Enterprise Data Engineering with LLMs", NeurIPS 2024 TRL Workshop |
| **License** | MIT (Copyright 2024 Systems Group, TU Munich) |
| **Focus** | Payment-to-invoice entity matching |

**Why this is the strongest candidate:**
- **EXACTLY the task Settle solves:** matching incoming payments to open invoices
- **Ground truth included:** `matches.csv` with explicit payment-to-invoice linkages
- **Match categories:** 1:1, 1:N, N:1 — maps directly to Settle's partial payments and split payments
- **Perturbation modes:** `small_deduction`, etc. — simulates real-world discrepancies (bank fees, FX rounding)
- **Schema modes:** `descriptive` (human-readable), `opaque` (ERP-style like SAP), `multi-table` (split invoices)
- **Enterprise-realistic:** Generated from real enterprise schemas, not toy data

**Files:**
- `invoices.csv` — Invoice records (client IDs, billing numbers, amounts, dates)
- `payments.csv` — Payment records
- `matches.csv` — Ground truth linking payments to invoices, with match category and perturbation category

**Location in repo:** `data/entity_matching/pay_to_inv/download/<perturbation_mode>/<schema_mode>/`

**Map to Settle's domain:**
| llmeval-trl24 | Settle Equivalent |
|---|---|
| Invoice | Obligation |
| Payment | Payment Event |
| Match (1:1) | Perfect match |
| Match (1:N) | Split payment across obligations |
| Match (N:1) | Partial payment (multiple payments to one obligation) |
| Perturbation: small_deduction | Bank fees, FX rounding |

**Limitations:**
- Generated data (not real transactions)
- No temporal component (no payment timing)
- No customer demographics
- Must be downloaded via shell script or generated

---

#### 2. MessyOps Datasets — Payment Dataset ⭐ STRONG

| Attribute | Details |
|---|---|
| **Source** | [Kaggle](https://www.kaggle.com/datasets/fares279/messyops) |
| **Author** | fares279 |
| **Focus** | End-to-end B2B distributor data with data quality issues |
| **License** | Verify on Kaggle before publication |

**Why this is strong:**
- **72,800 invoices + 76,343 payments** — large scale
- **Ground truth included:** Every payment is tied to its invoice(s) via invoice ID
- **Partial payments supported:** Full payments, partial payments, and late payments
- **17 interconnected tables:** customers, suppliers, products, warehouses, sales orders, invoices, payments, shipments, returns, purchase orders, inventory, support tickets
- **8,079 injected data quality issues** with ground truth — simulates real-world messiness
- **2 years of data (2024-2025):** Temporal component available

**Key tables for Settle:**
| Table | Rows | Relevance |
|---|---|---|
| `invoices.csv` | 72,800 | Customer invoices with amounts, balances, status, late-payment flags |
| `payments.csv` | 76,343 | Customer payments against invoices, including partial payments |
| `customers.csv` | 4,080 | Customer master data |
| `sales_orders.csv` | 75,081 | Order headers (links to invoices) |
| `data_quality_log.csv` | 8,079 | Ground truth for every injected issue |

**Data quality issues (useful for hard negatives):**
- Missing values (3,161)
- Malformed dates (2,256)
- Inconsistent ID formats (1,123)
- Orphan foreign keys (661)
- Duplicate transactions (323)
- Impossible values (301)

**Map to Settle's domain:**
| MessyOps | Settle Equivalent |
|---|---|
| Invoice | Obligation |
| Payment | Payment Event |
| Customer | Customer |
| Sales Order | Obligation Origin |
| Late payment flags | Overdue status |
| Data quality issues | Edge cases (partial amounts, wrong refs, etc.) |

**Limitations:**
- 1:1 only (no split invoicing in v1) — less diverse match types than llmeval-trl24
- License not explicitly stated — must verify
- Must download manually from Kaggle

---

### Tier B: Useful Supporting Data

#### 3. Global B2B Invoice & Payments Dataset (Kaggle)

| Attribute | Details |
|---|---|
| **Source** | [Kaggle](https://www.kaggle.com/datasets/tharishreddy/global-b2b-invoice-and-payments-dataset) |
| **Size** | 4.5M+ synthetic records |
| **Fields** | Invoice_id, Invoice_date, Customer_id, Invoice_amount, Due_date, Payment_status, Payment_date |

**Use:** Feature distribution validation (amounts, timing, payment terms). No ground truth matching. Grade B.

---

#### 4. FreeFinancialTransactions50M (Already acquired)

| Attribute | Details |
|---|---|
| **Source** | HuggingFace |
| **Acquired** | 40,004-row stratified sample in `data/raw/financial_transactions_sample/` |
| **Fields** | Amount, type (debit/credit), status, currency |

**Use:** Feature distribution validation only. No invoice/payment linking. Grade C.

---

### Tier C: Research-Only References

#### 5. BenchRec (Kaggle)
- Cash reconciliation dataset
- Requires application (not downloadable CSV)
- Grade C

#### 6. FinRCA-AI-Bench (HuggingFace)
- Payment allocations in `payment_allocations.csv`
- Tightly coupled to specific benchmark format
- Grade C

#### 7. mercor/apex-accounting (HuggingFace)
- AR reconciliation tasks
- Task-oriented, not a structured dataset
- Grade C

---

## Recommended Data Strategy

### Combined Approach

| Source | Role | Records |
|---|---|---|
| ReconRiver (acquired) | Reconciliation training (internal↔processor↔bank) | 24,259 ground truth rows |
| llmeval-trl24 | **Invoice-payment matching training** | Configurable |
| MessyOps | **Large-scale invoice-payment validation** | 72,800 invoices + 76,343 payments |
| FreeFinancialTransactions50M | Feature distribution reference | 40,004 rows |

### Acquisition Priority

1. **Download llmeval-trl24** (MIT license, GitHub, can be generated via shell script)
2. **Download MessyOps from Kaggle** (manual download, verify license)
3. **Cross-reference** with ReconRiver for full training set
4. **Reserve** FreeFinancialTransactions50M for feature validation

---

## Dataset Suitability Ranking

| Rank | Dataset | Ground Truth | Match Types | Scale | License | Settle Fit |
|---|---|---|---|---|---|---|
| 1 | llmeval-trl24 | Yes (matches.csv) | 1:1, 1:N, N:1 | Configurable | MIT | ★★★★★ |
| 2 | MessyOps | Yes (invoice↔payment) | 1:1 only | 149K records | Verify | ★★★★☆ |
| 3 | ReconRiver (acquired) | Yes (reconciliation) | Internal↔Processor↔Bank | 24K rows | CC-BY-4.0 | ★★★☆☆ |
| 4 | Global B2B | No | N/A | 4.5M rows | Unknown | ★★☆☆☆ |
| 5 | FreeFinancial50M (acquired) | No | N/A | 40K rows | CC-BY-NC-4.0 | ★☆☆☆☆ |

---

## Key Takeaway

**llmeval-trl24 is the clear winner** — it represents EXACTLY the Settle problem (matching payments to obligations with ground truth, multiple match types, and realistic perturbations). Combined with MessyOps for scale and ReconRiver for reconciliation, we can build a robust training set that covers the full obligation lifecycle.

The 100k+ target from `docs/ml-dataset-schema.md` is achievable by combining all three sources:
- llmeval-trl24: Configurable (can generate 50k+ pairs)
- MessyOps: 72,800 invoices + 76,343 payments
- ReconRiver: 24,259 ground truth rows
- **Total: 150k+ labeled pairs** (before augmentation)

---

*Created: 2026-09-05*
*Status: Research complete — ready for acquisition and pair construction*
