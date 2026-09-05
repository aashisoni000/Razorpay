import Link from "next/link";
import { getAuditTrail } from "@/lib/services/dashboard-service";

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    PAYMENT_EVENT_RECEIVED: "Payment received",
    OBLIGATION_MATCHED: "Payment matched",
    BALANCE_UPDATED: "Balance updated",
    DECISION_MADE: "Decision made",
    RECOVERY_ACTION_CREATED: "Recovery action created",
    OBLIGATION_OPENED: "Obligation created",
    OBLIGATION_RECOVERED: "Obligation recovered",
    OBLIGATION_ESCALATED: "Obligation escalated",
    OBLIGATION_STOPPED: "Obligation stopped",
  };
  return map[type] ?? type.replace(/_/g, " ").toLowerCase();
}

export default async function AuditPage() {
  const entries = await getAuditTrail();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Audit Trail</h1>
        <p className="text-sm text-text-secondary mt-1">
          Complete history of every decision and action.
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
        {entries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-text-muted">
              No audit entries yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {entries.map((entry) => {
              const stateAfter = entry.stateAfter as Record<string, unknown> | null;
              return (
                <div key={entry.id} className="px-6 py-4 hover:bg-surface-muted transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">
                            {formatEventType(entry.eventType)}
                          </span>
                          {stateAfter?.outstandingAmountPaise !== undefined && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary border border-border-subtle">
                              {String(stateAfter.outstandingAmountPaise)} paise outstanding
                            </span>
                          )}
                        </div>
                        {entry.decision && (
                          <p className="text-xs text-text-muted mt-0.5">
                            Decision: {entry.decision}
                            {entry.reasonCode && ` (${entry.reasonCode})`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                      <Link
                        href={`/obligations/${entry.obligationId}`}
                        className="text-xs font-mono text-text-muted hover:text-accent transition-colors"
                      >
                        {entry.obligation.sourceReference}
                      </Link>
                      <span className="text-xs text-text-muted">
                        {entry.timestamp.toLocaleString()}
                      </span>
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
