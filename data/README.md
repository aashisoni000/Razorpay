# Raw Data Sources

## ReconRiver Synthetic Reconciliation Dataset

- **Source URL**: https://huggingface.co/datasets/heybadrinath/reconriver-synthetic-reconciliation
- **Dataset Name**: ReconRiver synthetic reconciliation dataset
- **License**: CC-BY-4.0 (Creative Commons Attribution 4.0 International)
- **Download Date**: 2026-09-05
- **Original Row Counts**:
  - clean-settlement: 100 internal, 100 processor, 7 bank, 107 ground truth
  - mixed-exceptions: 1,010 internal, 1,075 processor, 219 bank, 1,244 ground truth
  - month-end-close: 10,000 internal, 10,200 processor, 1,499 bank, 11,539 ground truth
  - failure-recovery: 10,100 internal, 10,200 processor, 1,319 bank, 11,369 ground truth
  - **Total**: 21,210 internal, 21,575 processor, 3,044 bank, 24,259 ground truth
- **Files Downloaded**: 34 files (CSV, JSON, ZIP, README, SHA256SUMS)
- **Location**: `data/raw/reconriver/`
- **SHA256 Checksums**: See `data/raw/reconriver/SHA256SUMS`

### Scenario Packs

| Scenario | Internal | Processor | Bank | Ground Truth | Purpose |
|----------|----------|-----------|------|--------------|---------|
| clean-settlement | 100 | 100 | 7 | 107 | Exact matches, correct fees |
| mixed-exceptions | 1,010 | 1,075 | 219 | 1,244 | Missing, duplicate, mismatched, late, refund |
| month-end-close | 10,000 | 10,200 | 1,499 | 11,539 | Multi-day close with exception rates |
| failure-recovery | 10,100 | 10,200 | 1,319 | 11,369 | Invalid/duplicate rows + restart contract |

### Ground Truth Outcomes (24,259 total)

| Outcome | Count | % |
|---------|-------|---|
| MATCHED | 23,046 | 95.0% |
| AMOUNT_MISMATCH | 183 | 0.8% |
| PARTIAL_REFUND | 120 | 0.5% |
| DUPLICATE_PROCESSOR | 120 | 0.5% |
| REFUND_MATCHED | 120 | 0.5% |
| MISSING_PROCESSOR | 115 | 0.5% |
| DUPLICATE_INTERNAL | 110 | 0.5% |
| INVALID_SOURCE_ROW | 105 | 0.4% |
| AMBIGUOUS_MATCH | 70 | 0.3% |
| DUPLICATE_BANK_ENTRY | 60 | 0.2% |
| LATE_SETTLEMENT | 60 | 0.2% |
| FEE_MISMATCH | 40 | 0.2% |
| CURRENCY_MISMATCH | 40 | 0.2% |
| MISSING_INTERNAL | 40 | 0.2% |
| MISSING_BANK_SETTLEMENT | 30 | 0.1% |

### Identifiers

- `internal_payment_id` → links internal_transactions ↔ processor_transactions ↔ ground_truth
- `merchant_order_id` → links internal_transactions ↔ processor_transactions
- `settlement_batch_id` → links processor_transactions ↔ bank_settlements
- `processor_transaction_id` → links processor_transactions ↔ ground_truth
- `bank_entry_id` → links bank_settlements ↔ ground_truth
- `work_key` → logical identity in ground truth (merchant_order_id for ORDER scope)

---

## FreeFinancialTransactions50M (Sampled)

- **Source URL**: https://huggingface.co/datasets/ziadatalabs/FreeFinancialTransactions50M
- **Dataset Name**: FreeFinancialTransactions50M
- **License**: CC-BY-NC-4.0 (Creative Commons Attribution-NonCommercial 4.0 International)
- **Original Size**: 50,000,000 rows (1.5GB parquet)
- **Local Subset**: 40,004 rows (3.5MB CSV)
- **Download Date**: 2026-09-05
- **Sampling Method**: Stratified random sample from row group 0 (1M rows)
- **Stratification Axes**: transaction_type, status, currency
- **Random Seed**: 42
- **Location**: `data/raw/financial_transactions_sample/`

### Columns

| Column | Type | Description |
|--------|------|-------------|
| transaction_id | string | Unique transaction identifier |
| account_id | string | Account identifier |
| transaction_type | string | debit, credit, transfer, withdrawal, fee, deposit, refund, interest |
| amount | float | Transaction amount |
| currency | string | USD, EUR, GBP, CAD, AUD, JPY |
| merchant_category | string | 14 categories (groceries, retail, etc.) |
| balance_after | float | Account balance after transaction |
| transaction_timestamp | datetime | Transaction timestamp |
| status | string | completed, pending, failed, reversed |

### Distribution (preserved in sample)

- **transaction_type**: debit (40%), credit (20%), transfer (14%), withdrawal (8%), fee (6%), deposit (5%), refund (4%), interest (3%)
- **status**: completed (92%), pending (4.5%), failed (2.5%), reversed (1%)
- **currency**: USD (55%), EUR (18%), GBP (10%), CAD (7%), AUD (5%), JPY (5%)
- **amount**: median 30.14, mean 55.19, range [0.29, 3454.79]
- **date range**: 2024-01-01 to 2026-07-31

### Ground Truth

**None.** This dataset does NOT contain:
- invoice_id
- order_id
- obligation_id
- payment-to-invoice matching ground truth

This is standalone transaction data. It cannot be used for reconciliation training without external ground truth.
