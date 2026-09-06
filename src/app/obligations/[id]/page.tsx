import Link from "next/link";
import { notFound } from "next/navigation";
import { getObligationDetail } from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";

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

function formatActionType(type: string): string {
  const map: Record<string, string> = {
    payment_link: "Payment link",
    PAYMENT_LINK: "Payment link",
    retry: "Retry",
    RETRY: "Retry",
    refund: "Refund",
    REFUND: "Refund",
    escalate: "Escalate",
    ESCALATE: "Escalate",
  };
  return map[type] ?? type;
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
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[decision] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {decision}
    </span>
  );
}

function TimelineEvent({
  entry,
}: {
  entry: {
    id: string;
    eventType: string;
    stateAfter: unknown;
    decision: string | null;
    reasonCode: string | null;
    timestamp: Date;
  };
}) {
  const stateAfter = entry.stateAfter as Record<string, unknown> | null;
  const outstanding = stateAfter?.outstandingAmountPaise;
  const evidence = (stateAfter?.evidence as string[] | undefined) ?? [];

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-accent flex-shrink-0 mt-1" />
        <div className="w-px flex-1 bg-border-subtle" />
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            {formatEventType(entry.eventType)}
          </span>
          {outstanding !== undefined && outstanding !== null && (
            <span className="text-xs font-mono text-text-secondary">
              {typeof outstanding === "string"
                ? `${outstanding} paise`
                : typeof outstanding === "number"
                  ? formatPaise(BigInt(Math.round(outstanding)))
                  : ""}{" "}
              outstanding
            </span>
          )}
        </div>
        {entry.decision && (
          <div className="flex items-center gap-2 mt-1">
            <DecisionBadge decision={entry.decision} />
            {entry.reasonCode && (
              <span className="text-xs text-text-muted">
                {entry.reasonCode.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}
        {evidence && evidence.length > 0 && (
          <div className="mt-2 space-y-1">
            {evidence.map((e, i) => (
              <p key={i} className="text-xs text-text-muted">
                {e}
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-text-muted mt-2">
          {entry.timestamp.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default async function ObligationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const obligation = await getObligationDetail(id);

  if (!obligation) {
    notFound();
  }

  const recoveryPct =
    obligation.originalAmountPaise > 0n
      ? Number(
          (obligation.recoveredAmountPaise * 100n) /
            obligation.originalAmountPaise
        )
      : 0;

  const lastDecision = obligation.auditEntries
    .filter((e) => e.decision)
    .pop();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          href="/obligations"
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          ← Back to obligations
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-xl font-bold text-text-primary">
            {obligation.customer.name}
          </h1>
          <StatusBadge status={obligation.status} />
        </div>
        <p className="text-sm text-text-secondary mt-1 font-mono">
          {obligation.sourceReference}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-xl border border-border-subtle p-5">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">
            Original
          </p>
          <p className="text-xl font-bold mt-1 text-text-primary font-mono">
            {formatPaise(obligation.originalAmountPaise)}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-5">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">
            Recovered
          </p>
          <p className="text-xl font-bold mt-1 text-text-primary font-mono">
            {formatPaise(obligation.recoveredAmountPaise)}
          </p>
          <div className="mt-2 w-full bg-border-subtle rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-accent"
              style={{ width: `${Math.min(recoveryPct, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-5">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">
            Refunded
          </p>
          <p className="text-xl font-bold mt-1 text-text-primary font-mono">
            {formatPaise(obligation.refundedAmountPaise)}
          </p>
        </div>
        <div
          className={`rounded-xl border p-5 ${
            obligation.outstandingAmountPaise > 0n
              ? "bg-accent-muted border-accent/30"
              : "bg-surface border-border-subtle"
          }`}
        >
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">
            Outstanding
          </p>
          <p className="text-xl font-bold mt-1 text-text-primary font-mono">
            {formatPaise(obligation.outstandingAmountPaise)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-surface rounded-xl border border-border-subtle p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium mb-1">
            Status
          </p>
          <StatusBadge status={obligation.status} />
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium mb-1">
            Last Decision
          </p>
          {lastDecision ? (
            <DecisionBadge decision={lastDecision.decision!} />
          ) : (
            <span className="text-xs text-text-muted">—</span>
          )}
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-4">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium mb-1">
            Reason
          </p>
          <p className="text-sm text-text-primary">
            {lastDecision?.reasonCode?.replace(/_/g, " ") ?? "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Event Timeline
          </h2>
          {obligation.auditEntries.length === 0 ? (
            <p className="text-xs text-text-muted py-8 text-center">
              No events recorded yet.
            </p>
          ) : (
            <div>
              {obligation.auditEntries.map((entry) => (
                <TimelineEvent key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <AssistantPanel obligationId={obligation.id} />

          <div className="bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">
              Payment Events
            </h2>
            {obligation.paymentEvents.length === 0 ? (
              <p className="text-xs text-text-muted py-4 text-center">
                No payment events.
              </p>
            ) : (
              <div className="space-y-2">
                {obligation.paymentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-muted"
                  >
                    <div>
                      <p className="text-xs font-medium text-text-primary">
                        {event.type}
                      </p>
                      <p className="text-xs text-text-muted">
                        {event.occurredAt.toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm font-mono text-text-primary">
                      {formatPaise(event.amountPaise)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border-subtle p-6">
            <h2 className="text-sm font-semibold text-text-primary mb-4">
              Recovery Actions
            </h2>
            {obligation.recoveryActions.length === 0 ? (
              <p className="text-xs text-text-muted py-4 text-center">
                No recovery actions yet.
              </p>
            ) : (
              <div className="space-y-2">
                {obligation.recoveryActions.map((action) => (
                  <div
                    key={action.id}
                    className="p-3 rounded-lg bg-surface-muted"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text-primary">
                        {formatActionType(action.type)}
                      </span>
                      <StatusBadge status={action.status} />
                    </div>
                    <p className="text-xs font-mono text-text-secondary mt-1">
                      {formatPaise(action.amountPaise)}
                    </p>
                    {action.razorpayPaymentLinkId && (
                      <p className="text-xs text-text-muted mt-1 font-mono">
                        {action.razorpayPaymentLinkId}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {obligation.exceptions.length > 0 && (
            <div className="bg-surface rounded-xl border border-border-subtle p-6">
              <h2 className="text-sm font-semibold text-text-primary mb-4">
                Exceptions
              </h2>
              <div className="space-y-2">
                {obligation.exceptions.map((ex) => (
                  <div
                    key={ex.id}
                    className="p-3 rounded-lg bg-surface-muted border border-border-subtle"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text-primary">
                        {ex.type.replace(/_/g, " ")}
                      </span>
                      <StatusBadge status={ex.status} />
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {ex.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
