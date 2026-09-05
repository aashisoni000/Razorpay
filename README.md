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
src/
  lib/
    domain/          # Pure business logic (no DB, no framework)
      ledger.ts      # Obligation balance calculation
      matching.ts    # Payment → obligation matching (3-tier evidence)
      decision.ts    # Recovery decision engine (4 outcomes)
      policies.ts    # Recovery policy configuration
      types.ts       # All domain interfaces
      validation.ts  # Zod schemas for input validation

    services/        # Application layer (DB + domain)
      payment-event-service.ts   # Core event processing pipeline
      obligation-service.ts      # Ledger recompute + decision eval
      audit-service.ts           # Audit trail creation
      exception-service.ts       # Exception creation
      recovery-service.ts        # Razorpay payment link orchestration
      dashboard-service.ts       # Aggregation queries for UI

    ml/              # ML candidate-ranking layer
      features.ts    # Feature extraction (14 features)
      dataset.ts     # Synthetic dataset generation
      model.ts       # Logistic regression (from scratch, zero deps)
      evaluate.ts    # Classification + ranking metrics
      ranker.ts      # Candidate ranking service

    razorpay/        # Razorpay integration
      client.ts      # REST API client (built-in fetch)
      webhook-verification.ts  # HMAC-SHA256 signature verification
      normalize.ts   # Webhook → internal format mapping
      types.ts       # Razorpay-specific types

    demo/            # Deterministic replay system
      scenarios.ts   # 11 scenario definitions
      replay.ts      # Scenario replay engine

  app/               # Next.js App Router pages
    page.tsx         # Dashboard overview
    obligations/     # Obligation list + detail
    recovery/        # Recovery actions
    exceptions/      # Exception queue
    audit/           # Audit trail
    settings/        # System configuration

prisma/
  schema.prisma      # 7 models, 4 enums
  seed.ts            # Demo data with 6 scenarios
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
- **Abstention**: If top-2 scores within threshold → abstain → human review

### Safety Rules

- ML never overrides strong deterministic evidence
- ML never changes ledger calculations
- ML never decides recovery amounts
- Model failure → deterministic fallback (exception/escalation)
- Ambiguous → exception, not automatic match

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
| 2 | ₹10k obligation → ₹6.5k payment | PARTIALLY_RECOVERED → ACT |
| 3 | Two obligations → ambiguous ₹7k payment | ESCALATE |
| 4 | ₹10k obligation → ₹12k payment | OVERPAID → STOP |
| 5 | ₹10k recovered → ₹2k refund | PARTIALLY_RECOVERED → ACT |
| 6 | Active recovery → customer pays via alternate | RECOVERED → STOP |

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

### Running Tests

```bash
# Unit + domain tests (131 tests)
npm test

# Integration tests (13 tests, requires PostgreSQL)
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
- "94% accuracy" → Evaluation is on synthetic data. Label it as such.
- "Authentication included" → There is none.
- "Real Razorpay production integration" → Test Mode only.

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
