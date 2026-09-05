import { getRecoveryPolicy } from "@/lib/services/dashboard-service";

export default async function SettingsPage() {
  const policy = await getRecoveryPolicy();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Recovery policy and system configuration.
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
            Decision Engine
          </h2>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-surface-muted">
              <p className="text-sm font-medium text-text-primary mb-1">
                Hybrid Matching
              </p>
              <p className="text-xs text-text-secondary">
                Clear payments are matched deterministically. Ambiguous payments
                are ranked by the ML matching model. Ledger and recovery
                decisions remain deterministic.
              </p>
              <p className="text-xs text-text-muted mt-1">
                ML role: obligation matching only
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-muted">
              <p className="text-sm font-medium text-text-primary mb-1">
                Evidence Tiers
              </p>
              <p className="text-xs text-text-secondary">
                STRONG_EVIDENCE → MODERATE_EVIDENCE → INSUFFICIENT_EVIDENCE.
                The system automates certainty and surfaces ambiguity.
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
              <span className="text-sm text-text-secondary">
                API Client
              </span>
              <span className="text-xs text-[var(--status-recovered)] font-medium">
                Connected
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
                conflicts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
