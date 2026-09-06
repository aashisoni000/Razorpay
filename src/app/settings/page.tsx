import { getRecoveryPolicy } from "@/lib/services/dashboard-service";
import { ModelCard } from "@/components/ml/ModelCard";

export default async function SettingsPage() {
  const policy = await getRecoveryPolicy();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Recovery policy, matching architecture, and system configuration.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Recovery Policy
          </h2>
          {policy ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted">
                <span className="text-sm text-text-secondary">
                  Max Recovery Attempts
                </span>
                <span className="text-sm font-mono font-medium text-text-primary">
                  {policy.maxAttempts}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted">
                <span className="text-sm text-text-secondary">
                  Recovery Window
                </span>
                <span className="text-sm font-mono font-medium text-text-primary">
                  {policy.recoveryWindowHours} hours
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted">
                <span className="text-sm text-text-secondary">
                  Cooldown Between Attempts
                </span>
                <span className="text-sm font-mono font-medium text-text-primary">
                  {policy.cooldownBetweenAttemptsHours} hours
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No recovery policy configured.
            </p>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Money Safety
          </h2>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-surface-muted">
              <p className="text-sm font-medium text-text-primary mb-1">
                Integer-Only Arithmetic
              </p>
              <p className="text-xs text-text-secondary">
                All monetary values stored as paise (BigInt). No floating-point
                arithmetic anywhere in the domain layer.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-muted">
              <p className="text-sm font-medium text-text-primary mb-1">
                Optimistic Locking
              </p>
              <p className="text-xs text-text-secondary">
                Obligations use version fields to prevent concurrent modification
                conflicts. Transactions roll back on conflict.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Razorpay Integration
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted">
              <span className="text-sm text-text-secondary">API Client</span>
              <span className="text-xs text-[var(--status-recovered)] font-medium">
                REST API (built-in)
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted">
              <span className="text-sm text-text-secondary">
                Webhook Verification
              </span>
              <span className="text-xs text-[var(--status-recovered)] font-medium">
                HMAC-SHA256
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-muted">
              <span className="text-sm text-text-secondary">
                Payment Links
              </span>
              <span className="text-xs text-text-muted">Supported</span>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Settle Assistant
          </h2>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-surface-muted">
              <p className="text-sm font-medium text-text-primary mb-1">
                Read-Only Explanation
              </p>
              <p className="text-xs text-text-secondary">
                The assistant explains an obligation&apos;s financial state in
                plain English using recorded facts. It cannot modify data, create
                recovery actions, or make financial decisions.
              </p>
              <p className="text-xs text-text-muted mt-2 font-medium">
                Requires an AI provider key (OPENAI_API_KEY or ANTHROPIC_API_KEY)
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-surface rounded-xl border border-border-subtle p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">
          Hybrid Matching Architecture
        </h2>
        <p className="text-xs text-text-secondary mb-6">
          Clear payments are matched deterministically. When a payment is
          ambiguous, the matching model can rank plausible obligations. Ledger
          calculations, recovery amounts, and recovery decisions remain
          deterministic.
        </p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">
              Matching Pipeline
            </h3>
            <div className="font-mono text-xs text-text-secondary space-y-1 bg-surface-muted rounded-lg p-4">
              <p>Payment Event</p>
              <p className="text-text-muted">↓</p>
              <p>Deterministic Matching</p>
              <p className="text-text-muted">↓</p>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-[var(--status-recovered)]">Strong/Moderate</p>
                  <p className="text-text-muted">↓</p>
                  <p>Match → Ledger</p>
                  <p className="text-text-muted">↓</p>
                  <p>Decision</p>
                  <p className="text-text-muted">↓</p>
                  <p>Recovery</p>
                </div>
                <div className="flex-1">
                  <p className="text-[var(--status-escalated)]">Insufficient</p>
                  <p className="text-text-muted">↓</p>
                  <p>ML Candidate Ranking</p>
                  <p className="text-text-muted">↓</p>
                  <p>Confident? → Match</p>
                  <p className="text-text-muted">↓</p>
                  <p>Uncertain? → Abstain</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-3">
              ML Role
            </h3>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-accent-muted/30 border border-accent/20">
                <p className="text-xs font-medium text-text-primary">
                  Obligation matching only
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  ML suggests candidate obligations when deterministic matching
                  cannot safely resolve a payment.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-surface-muted border border-border-subtle">
                <p className="text-xs font-medium text-text-primary">
                  Safety boundary
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  ML can suggest a candidate. ML cannot move money. Ledger,
                  recovery amounts, and recovery decisions are deterministic.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-surface-muted border border-border-subtle">
                <p className="text-xs font-medium text-text-primary">
                  Abstention
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  When confidence is insufficient, the system abstains and
                  creates an exception for human review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ModelCard />
      </div>
    </div>
  );
}
