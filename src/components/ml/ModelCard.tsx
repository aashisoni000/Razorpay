export function ModelCard() {
  return (
    <div className="bg-surface rounded-xl border border-border-subtle p-6">
      <h2 className="text-sm font-semibold text-text-primary mb-1">
        Model Card
      </h2>
      <p className="text-xs text-text-muted mb-4">
        Honest documentation of the matching model.
      </p>

      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-surface-muted">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Purpose
          </p>
          <p className="text-xs text-text-secondary">
            Payment → obligation candidate ranking. When deterministic matching
            cannot safely resolve a payment, the model ranks plausible
            obligation candidates by likelihood.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-surface-muted">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Model
          </p>
          <p className="text-xs text-text-secondary">
            Logistic regression implemented from scratch. No external ML
            dependencies. Sigmoid activation, gradient descent with L2
            regularization.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-surface-muted">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Inputs (14 features)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              "sameCustomer",
              "amountRatio",
              "amountDifferencePaise",
              "hasOrderId",
              "hasInvoiceId",
              "hasSubscriptionId",
              "referenceMatch",
              "outstandingRatio",
              "paymentIsPartial",
              "paymentIsExact",
              "paymentIsExcess",
              "candidateIsOpen",
              "candidateIsPartiallyRecovered",
              "numCandidates",
            ].map((f) => (
              <p key={f} className="text-xs font-mono text-text-muted">
                {f}
              </p>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-surface-muted">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Training Data
          </p>
          <p className="text-xs text-text-secondary">
            Synthetic pilot dataset: 200 customers, 1,183 obligations, 5,000
            payments. Scenarios include ambiguous matching, corrupted references,
            failed-then-retry, missing references, multi-obligation payments,
            noisy contacts, overpayments, and shared contacts.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-surface-muted">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Evaluation (Test Set)
          </p>
          <div className="mt-2 space-y-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-1 text-text-secondary font-medium">
                    Metric
                  </th>
                  <th className="text-right py-1 text-text-secondary font-medium">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border-subtle">
                  <td className="py-1 text-text-secondary">
                    Pair Precision
                  </td>
                  <td className="py-1 text-right text-text-primary">1.000</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-1 text-text-secondary">
                    Pair Coverage
                  </td>
                  <td className="py-1 text-right text-text-primary">0.09%</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-1 text-text-secondary">
                    Payment Precision
                  </td>
                  <td className="py-1 text-right text-text-primary">1.000</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-1 text-text-secondary">
                    Payment Coverage
                  </td>
                  <td className="py-1 text-right text-text-primary">0.61%</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-1 text-text-secondary">
                    Top-1 Hit Rate
                  </td>
                  <td className="py-1 text-right text-text-primary">11.0%</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-1 text-text-secondary">
                    Top-3 Hit Rate
                  </td>
                  <td className="py-1 text-right text-text-primary">27.0%</td>
                </tr>
                <tr>
                  <td className="py-1 text-text-secondary">MRR</td>
                  <td className="py-1 text-right text-text-primary">0.191</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-text-muted">
              Deterministic filter resolves 78.3% of payments. ML operates on
              the remaining 21.7%.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-surface-muted">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            End-to-End Pipeline
          </p>
          <div className="mt-2 font-mono text-xs text-text-secondary space-y-1">
            <div className="flex justify-between">
              <span>Total payments</span>
              <span className="text-text-primary">5,000</span>
            </div>
            <div className="flex justify-between">
              <span>Deterministic resolved</span>
              <span className="text-text-primary">3,917 (78.3%)</span>
            </div>
            <div className="flex justify-between">
              <span>ML eligible</span>
              <span className="text-text-primary">1,083 (21.7%)</span>
            </div>
            <div className="flex justify-between">
              <span>ML accepted</span>
              <span className="text-text-primary">8 (0.2%)</span>
            </div>
            <div className="flex justify-between">
              <span>Total resolved</span>
              <span className="text-text-primary font-medium">
                3,925 (78.5%)
              </span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--status-escalated)]/5 border border-[var(--status-escalated)]/20">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Limitations
          </p>
          <ul className="text-xs text-text-secondary space-y-1 mt-2 list-disc list-inside">
            <li>
              Synthetic data only — no production Razorpay data used for
              training.
            </li>
            <li>
              Model is extremely conservative: accepts &lt;1% of ML-eligible
              payments.
            </li>
            <li>
              Amount-ratio baseline outperforms LR on payment coverage (4.91%
              vs 0.61%).
            </li>
            <li>
              Low ranking quality: Top-1 hit rate 11%, MRR 0.19.
            </li>
            <li>
              Scores are not calibrated probabilities — they are relative
              rankings.
            </li>
            <li>
              Class imbalance: only 6% positive ratio in ML-eligible population.
            </li>
            <li>
              3 of 14 features are constants in practice (outstandingRatio,
              candidateIsOpen, candidateIsPartiallyRecovered).
            </li>
          </ul>
        </div>

        <div className="p-3 rounded-lg bg-accent-muted/30 border border-accent/20">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-1">
            Verdict
          </p>
          <p className="text-xs text-text-secondary">
            ML_EXPERIMENT_VALID = true. The experiment is internally consistent
            with no ground-truth leakage. READY_FOR_INTEGRATION = false. The
            model adds negligible value over the deterministic filter and should
            not be integrated into production without calibration, production
            data, and improved coverage.
          </p>
        </div>
      </div>
    </div>
  );
}
