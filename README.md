# Settle

**Obligation-aware revenue recovery control plane.**

> Recover obligations, not transactions.

Settle reconstructs what customers actually owe by tracking economic obligations, not raw payment transactions. It identifies which obligation a payment belongs to, acts only when recovery is justified, and stops when the obligation is settled.

## The Problem

Traditional payment recovery systems think in transactions:

- "Payment X failed → retry payment X"

This creates problems:

- A customer pays via alternate method, but the system retries the original
- Multiple obligations exist, but the system doesn't know which one a payment belongs to
- The obligation is already settled, but the system acts on stale state

## The Thesis

Settle reconstructs the **obligation** — what the customer actually owes — and makes decisions based on that reconstructed state:

- Failed card? Track the obligation, not the card
- Customer pays via UPI? Update the obligation ledger
- Ambiguous payment? Escalate, don't guess
- Obligation settled? Stop, don't retry

## Architecture

```
Payment Events (webhook / manual)
      ↓
Deterministic Matching (3-tier evidence)
      ↓
    Clear? ──→ Match → Ledger → Decision → Recovery
      ↓
    Ambiguous?
      ↓
  ML Candidate Ranking
      ↓
  Confidence?
    ↓      ↓
  Match   Abstain
    ↓       ↓
  Ledger  Exception (human review)
    ↓
  Deterministic Decision (ACT/WAIT/STOP/ESCALATE)
    ↓
  Recovery Orchestrator
    ↓
  Razorpay Payment Link (if configured)
    ↓
  Webhook
    ↓
  Payment Event → cycle repeats
```

## Ledger Model

All money is stored as **integer paise** (BigInt). No floating-point arithmetic.

```
Original Amount:    ₹10,000  (1,000,000 paise)
Recovered:          ₹6,000   (600,000 paise)
Refunded:           ₹0
Outstanding:        ₹4,000   (400,000 paise)
Excess:             ₹0
Status:             PARTIALLY_RECOVERED
```

Status transitions:

- `OPEN` → `PARTIALLY_RECOVERED` → `RECOVERED`
- `OVERPAID` (recovered > original)
- `STOPPED` (policy limits reached)
- `ESCALATED` (ambiguous association)

## Matching Strategy

Three-tier evidence system:

1. **STRONG_EVIDENCE**: Exact reference match (order_id, invoice_id, subscription_id)
   - Auto-matches immediately
   - No ambiguity

2. **MODERATE_EVIDENCE**: Same customer + payment ≤ outstanding
   - Single candidate → match
   - Multiple candidates → escalate

3. **INSUFFICIENT_EVIDENCE**: No reliable match
   - ML candidate ranking (if available)
   - If uncertain → exception + human review

## Decision Engine

Priority-based rule engine (no LLM in money-moving path):

```
1. Outstanding = 0?          → STOP
2. Unresolved association?   → ESCALATE
3. Active recovery action?   → WAIT
4. Max attempts reached?     → STOP
5. Cooldown active?          → WAIT
6. Otherwise                 → ACT (create payment link)
```

## Razorpay Integration

- **Payment Links**: Created via Razorpay REST API (built-in fetch, zero npm deps)
- **Webhook Verification**: HMAC-SHA256 with timing-safe comparison
- **Event Normalization**: Maps Razorpay webhook payloads to internal format
- **Idempotency**: Duplicate webhooks produce one financial effect

## Settle Assistant

A read-only AI assistant that explains obligation state in plain English.

- **Provider**: OpenAI (gpt-4o-mini) or Anthropic (claude-sonnet-4-20250514)
- **Read-only**: No tools, no mutations, no financial recommendations
- **Graceful**: Disabled when no provider key is configured
- **Server-side**: API calls go through the server, never exposed to client

The assistant uses structured facts from the database to generate explanations. It never invents customer behavior, payment intent, or future outcomes.

## ML Candidate-Ranking Layer

**What it does**: Ranks candidate obligations for ambiguous payments.

**What it doesn't do**: Make financial decisions, change ledger calculations, decide recovery amounts.

### Architecture

```
Payment Event
  ↓
Deterministic Matching
  ↓ (INSUFFICIENT_EVIDENCE with candidates)
ML Candidate Ranking
  ↓
CONFIDENT → provide recommendation
UNCERTAIN → ESCALATE (exception)
```

### Model

- **Algorithm**: Logistic regression (from scratch, zero npm dependencies)
- **Features**: 14 numerical features (same customer, amount ratio, reference match, etc.)
- **Training**: Synthetic dataset generated from 11 deterministic scenarios + variations
- **Abstention**: If confidence is insufficient → abstain → human review

### Safety Rules

- ML never overrides strong deterministic evidence
- ML never changes ledger calculations
- ML never decides recovery amounts
- Model failure → deterministic fallback (exception/escalation)
- Ambiguous → exception, not automatic match

### Evaluation (Honest Metrics)

| Metric | Value |
|--------|-------|
| Pair Precision | 1.000 |
| Pair Coverage | 0.09% |
| Payment Precision | 1.000 |
| Payment Coverage | 0.61% |
| Top-1 Hit Rate | 11.0% |
| Top-3 Hit Rate | 27.0% |
| MRR | 0.191 |
| Deterministic Resolved | 78.3% |
| ML Accepted | 8 / 5,000 (0.2%) |

**Verdict**: ML_EXPERIMENT_VALID = true. READY_FOR_INTEGRATION = false.

The model is internally consistent with no ground-truth leakage. However, it adds negligible value over the deterministic filter and should not be integrated into production without calibration, production data, and improved coverage.

## Audit Trail

Every event, decision, and state change is recorded:

```
PAYMENT_EVENT_RECEIVED → OBLIGATION_MATCHED → BALANCE_UPDATED → DECISION_MADE
```

Each entry includes:

- Event type and timestamp
- State before and after
- Decision and reason code
- Evidence (what the system knew)

## Demo Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Failed ₹10k card → ₹6k UPI + ₹4k UPI | RECOVERED → STOP |
| 2 | ₹3.5k obligation → ₹2k payment | PARTIALLY_RECOVERED → ACT |
| 3 | Two obligations → ambiguous ₹5k payment | ESCALATE |
| 4 | ₹10k obligation → ₹12k payment | OVERPAID → STOP |
| 5 | ₹10k recovered → ₹2k refund | PARTIALLY_RECOVERED → ACT |

## Demo Walkthrough (3–5 minutes)

### 1. Problem (20–30 seconds)

"Payment systems track transactions. Businesses need to track obligations."

₹10,000 was owed. A ₹10,000 payment failed. Then ₹6,000 succeeded. Then ₹4,000 succeeded.

A transaction-level retry would incorrectly attempt another ₹10,000.

Settle reconstructs the obligation.

### 2. Full Recovery — Priya (60 seconds)

Open Priya (ORD-FLAGSHIP).

- Original ₹10,000
- Recovered ₹10,000
- Outstanding ₹0
- Status: RECOVERED
- Decision: STOP

"Settle knows nothing more needs to be recovered, so it stops the unnecessary recovery."

### 3. Partial Recovery — Rahul (60 seconds)

Open Rahul (ORD-PARTIAL).

- Original ₹3,500
- Recovered ₹2,000
- Outstanding ₹1,500
- Decision: ACT

Show RecoveryAction created.

If Razorpay Test Mode is configured: show the Payment Link flow. If not: explain the provider-less mode honestly.

### 4. Ambiguity — Ananya (45 seconds)

Open Exceptions.

Show ambiguous payment with two candidate obligations.

Show evidence tier: INSUFFICIENT_EVIDENCE.

Show: AUTOMATIC ACTION BLOCKED.

Then: ESCALATE.

"When Settle isn't confident, it does not guess."

### 5. ML + Settings (30–45 seconds)

Open Settings / Model Card.

"ML is only used in the ambiguous matching layer."

"78.3% of payments are handled deterministically."

"The model has perfect precision but extremely low coverage — we intentionally do not pretend this is production-ready."

"Even when ML is involved, it cannot move money."

### 6. Audit Trail (20–30 seconds)

Open Audit.

Show: Payment → Match → Ledger → Decision → Recovery.

"Every financial decision has an explainable trail."

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL running on localhost:5432

### Setup

```bash
# Install dependencies
npm install

# Set up database
npx prisma db push
npx prisma generate

# Seed demo data
npm run db:seed

# Start dev server
npm run dev
```

### Razorpay Test Mode (Optional)

Create `.env`:

```
DATABASE_URL="postgresql://username:password@localhost:5432/settle"
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."
```

### Settle Assistant (Optional)

The read-only Settle Assistant explains obligation state in plain English.

```
OPENAI_API_KEY="sk-..."
# or
ANTHROPIC_API_KEY="sk-ant-..."
```

Without an LLM key, the assistant is disabled. The application works fully without it.

### Running Tests

```bash
# Unit + domain + ML tests (194 tests)
npm test

# Integration tests (20 tests, requires PostgreSQL)
npm run test:integration

# Build
npm run build

# Lint
npm run lint
```

## Limitations

- **No authentication**: This is a demo/hackathon project. There is no user auth.
- **No real Razorpay integration**: Payment links are created in Razorpay Test Mode only.
- **Synthetic ML evaluation**: The model is trained on synthetic data. Do not claim production accuracy.
- **No production deployment**: No CI/CD, no monitoring, no alerting.
- **Single-tenant**: One Settle instance, no multi-tenancy.
- **No real-time updates**: Pages refresh on navigation, no WebSocket/SSE.

## What Should NOT Be Claimed

- "AI makes financial decisions" → The financial engine is deterministic. ML is assistive only.
- "Production-ready" → This is a hackathon demo.
- "ML is production-ready" → READY_FOR_INTEGRATION = false. Synthetic data only.
- "94% accuracy" → Evaluation is on synthetic data. Label it as such.
- "Authentication included" → There is none.
- "Real Razorpay production integration" → Test Mode only.
- "Assistant works without configuration" → Requires OPENAI_API_KEY or ANTHROPIC_API_KEY.

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- PostgreSQL
- Prisma 6
- Zod
- Vitest
- Tailwind CSS 4
- Logistic regression (from scratch, zero deps)

## License

MIT
