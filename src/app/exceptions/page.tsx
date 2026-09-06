import { getExceptions, getExceptionSummary } from "@/lib/services/dashboard-service";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart } from "@/components/ui/DonutChart";

const TYPE_COLORS_HEX: Record<string, string> = {
  AMBIGUOUS_ASSOCIATION: "#d6e58e",
  UNRESOLVED_ASSOCIATION: "#4a4a4a",
  MISSING_REFERENCE: "#a3b853",
  CONFLICTING_EVENTS: "#7a8c3f",
  OVERPAYMENT: "#c8d96c",
  MANUAL_REVIEW_REQUIRED: "#c4c4c4",
};

const STATUS_COLORS_HEX: Record<string, string> = {
  OPEN: "#4a4a4a",
  RESOLVED: "#c8d96c",
  DISMISSED: "#c4c4c4",
};

function formatExceptionType(type: string): string {
  const map: Record<string, string> = {
    UNRESOLVED_ASSOCIATION: "Unresolved association",
    AMBIGUOUS_ASSOCIATION: "Ambiguous association",
    MISSING_REFERENCE: "Missing reference",
    CONFLICTING_EVENTS: "Conflicting events",
    OVERPAYMENT: "Overpayment",
    MANUAL_REVIEW_REQUIRED: "Manual review required",
  };
  return map[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function EvidenceTierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const styles: Record<string, string> = {
    STRONG_EVIDENCE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    MODERATE_EVIDENCE: "bg-amber-50 text-amber-700 border-amber-200",
    INSUFFICIENT_EVIDENCE: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<string, string> = {
    STRONG_EVIDENCE: "Strong",
    MODERATE_EVIDENCE: "Moderate",
    INSUFFICIENT_EVIDENCE: "Insufficient",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[tier] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {labels[tier] ?? tier}
    </span>
  );
}

export default async function ExceptionsPage() {
  const [exceptions, exceptionSummary] = await Promise.all([
    getExceptions(),
    getExceptionSummary(),
  ]);

  const typeSlices = Object.entries(exceptionSummary.byType)
    .map(([type, count]) => ({
      label: formatExceptionType(type),
      value: count,
      color: TYPE_COLORS_HEX[type] ?? "#94a3b8",
    }))
    .filter((s) => s.value > 0);

  const statusSlices = Object.entries(exceptionSummary.byStatus)
    .map(([status, count]) => ({
      label: status,
      value: count,
      color: STATUS_COLORS_HEX[status] ?? "#94a3b8",
    }))
    .filter((s) => s.value > 0);

  const totalExceptions = Object.values(exceptionSummary.byType).reduce(
    (s, n) => s + n,
    0
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Exceptions</h1>
        <p className="text-sm text-text-secondary mt-1">
          Ambiguous matches and decision failures that need human review.
        </p>
      </div>

      {/* Analytics Row */}
      {exceptions.length > 0 && (
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Exceptions by Type
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {totalExceptions} total exception{totalExceptions !== 1 ? "s" : ""}
            </p>
            <DonutChart
              slices={typeSlices}
              size={120}
              thickness={16}
              centerLabel="total"
              centerValue={totalExceptions}
            />
          </div>

          <div className="bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Exception Status
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Resolution progress.
            </p>
            <DonutChart
              slices={statusSlices}
              size={120}
              thickness={16}
              centerLabel="exceptions"
              centerValue={totalExceptions}
            />
          </div>

          <div className="bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Operational Focus
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Key insight.
            </p>
            <div className="p-4 rounded-lg bg-accent-muted/30 border border-accent/20">
              <p className="text-sm font-medium text-text-primary">
                Automatic action blocked
              </p>
              <p className="text-xs text-text-secondary mt-1">
                When Settle cannot confidently match a payment to a single
                obligation, it escalates instead of guessing. This is
                intentional.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Exception Cards */}
      <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
        {exceptions.length === 0 ? (
          <EmptyState
            title="No exceptions"
            description="The system is healthy. All payments have been matched deterministically."
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {exceptions.map((ex) => {
              const payload = ex.payload as Record<string, unknown> | null;
              const candidates = payload?.candidateObligationIds as
                | string[]
                | undefined;
              const evidenceTier = payload?.evidenceTier as string | undefined;

              return (
                <div key={ex.id} className="px-6 py-5 hover:bg-surface-muted transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-text-primary">
                          {formatExceptionType(ex.type)}
                        </span>
                        <EvidenceTierBadge tier={evidenceTier} />
                        <StatusBadge status={ex.status} />
                      </div>
                      <p className="text-sm text-text-secondary mt-1">
                        {ex.description}
                      </p>
                      {candidates && candidates.length > 0 && (
                        <p className="text-xs text-text-muted mt-2">
                          Candidate obligations: {candidates.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-text-muted">
                        {ex.createdAt.toLocaleString()}
                      </p>
                      {ex.obligation && (
                        <p className="text-xs text-text-muted mt-1 font-mono">
                          {ex.obligation.sourceReference}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
