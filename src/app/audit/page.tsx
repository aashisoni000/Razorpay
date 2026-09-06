import Link from "next/link";
import {
  getAuditTrail,
  getAuditDecisionSummary,
  getAuditTrend,
} from "@/lib/services/dashboard-service";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart } from "@/components/ui/DonutChart";
import { BarChart } from "@/components/ui/BarChart";

const DECISION_COLORS_HEX: Record<string, string> = {
  ACT: "#c8d96c",
  WAIT: "#d6e58e",
  STOP: "#c4c4c4",
  ESCALATE: "#4a4a4a",
};

const DECISION_LABELS: Record<string, string> = {
  ACT: "Act",
  WAIT: "Wait",
  STOP: "Stop",
  ESCALATE: "Escalate",
};

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    PAYMENT_EVENT_RECEIVED: "Payment received",
    OBLIGATION_MATCHED: "Payment matched",
    BALANCE_UPDATED: "Balance updated",
    DECISION_MADE: "Decision made",
    RECOVERY_ACTION_CREATED: "Recovery action created",
    RECOVERY_ACTION_RESOLVED: "Recovery action resolved",
    OBLIGATION_OPENED: "Obligation created",
    OBLIGATION_RECOVERED: "Obligation recovered",
    OBLIGATION_ESCALATED: "Obligation escalated",
    OBLIGATION_STOPPED: "Obligation stopped",
  };
  return map[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function eventTypeColor(type: string): string {
  const map: Record<string, string> = {
    PAYMENT_EVENT_RECEIVED: "bg-blue-500",
    OBLIGATION_MATCHED: "bg-emerald-500",
    BALANCE_UPDATED: "bg-amber-500",
    DECISION_MADE: "bg-violet-500",
    RECOVERY_ACTION_CREATED: "bg-accent",
    RECOVERY_ACTION_RESOLVED: "bg-gray-400",
    OBLIGATION_OPENED: "bg-blue-400",
    OBLIGATION_RECOVERED: "bg-emerald-500",
    OBLIGATION_ESCALATED: "bg-red-500",
    OBLIGATION_STOPPED: "bg-gray-400",
  };
  return map[type] ?? "bg-gray-400";
}

function DecisionBadge({ decision }: { decision: string }) {
  const styles: Record<string, string> = {
    ACT: "bg-emerald-50 text-emerald-700 border-emerald-200",
    WAIT: "bg-amber-50 text-amber-700 border-amber-200",
    STOP: "bg-gray-100 text-gray-600 border-gray-200",
    ESCALATE: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[decision] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {decision}
    </span>
  );
}

export default async function AuditPage() {
  const [entries, decisionSummary, auditTrend] = await Promise.all([
    getAuditTrail(),
    getAuditDecisionSummary(),
    getAuditTrend(),
  ]);

  const decisionSlices = Object.entries(decisionSummary)
    .map(([decision, count]) => ({
      label: DECISION_LABELS[decision] ?? decision,
      value: count,
      color: DECISION_COLORS_HEX[decision] ?? "#94a3b8",
    }))
    .filter((s) => s.value > 0);

  const totalDecisions = Object.values(decisionSummary).reduce(
    (s, n) => s + n,
    0
  );

  const trendData = auditTrend.map((t) => ({
    label: t.date,
    value: t.count,
    display: `${t.count} event${t.count !== 1 ? "s" : ""}`,
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Audit Trail</h1>
        <p className="text-sm text-text-secondary mt-1">
          Every financial decision is explainable. This is the complete history.
        </p>
      </div>

      {/* Analytics Row */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Decision Distribution
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {totalDecisions} decision{totalDecisions !== 1 ? "s" : ""} recorded
            </p>
            <DonutChart
              slices={decisionSlices}
              size={120}
              thickness={16}
              centerLabel="decisions"
              centerValue={totalDecisions}
            />
          </div>

          <div className="col-span-2 bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Events Over Time
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Audit events per day.
            </p>
            <BarChart data={trendData} height={120} />
          </div>
        </div>
      )}

      {/* Audit Timeline */}
      <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            title="No audit entries yet"
            description="Events will appear here as payments are processed."
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {entries.map((entry) => {
              const stateAfter = entry.stateAfter as Record<
                string,
                unknown
              > | null;
              const stateBefore = entry.stateBefore as Record<
                string,
                unknown
              > | null;

              return (
                <div
                  key={entry.id}
                  className="px-6 py-4 hover:bg-surface-muted transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center pt-1">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${eventTypeColor(entry.eventType)}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {formatEventType(entry.eventType)}
                        </span>
                        {entry.decision && (
                          <DecisionBadge decision={entry.decision} />
                        )}
                      </div>

                      {entry.reasonCode && (
                        <p className="text-xs text-text-muted mt-0.5">
                          Reason: {entry.reasonCode.replace(/_/g, " ")}
                        </p>
                      )}

                      {stateAfter && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {typeof stateAfter.decision === "string" && (
                            <span className="text-xs text-text-secondary">
                              Decision:{" "}
                              <span className="font-medium">
                                {stateAfter.decision}
                              </span>
                            </span>
                          )}
                          {typeof stateAfter.outstandingAmountPaise === "string" && (
                            <span className="text-xs text-text-secondary">
                              Outstanding:{" "}
                              <span className="font-mono">
                                {stateAfter.outstandingAmountPaise}p
                              </span>
                            </span>
                          )}
                          {typeof stateAfter.evidenceTier === "string" && (
                            <span className="text-xs text-text-secondary">
                              Evidence:{" "}
                              <span className="font-medium">
                                {(stateAfter.evidenceTier as string).replace(
                                  /_/g,
                                  " "
                                )}
                              </span>
                            </span>
                          )}
                          {typeof stateAfter.status === "string" && (
                            <StatusBadge
                              status={stateAfter.status}
                            />
                          )}
                        </div>
                      )}

                      {stateBefore && stateAfter && (
                        <div className="mt-2 text-xs text-text-muted">
                          {typeof stateBefore.status === "string" &&
                            typeof stateAfter.status === "string" &&
                            stateBefore.status !== stateAfter.status && (
                              <span>
                                Status: {stateBefore.status} →{" "}
                                {stateAfter.status}
                              </span>
                            )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
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
