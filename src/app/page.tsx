import Link from "next/link";
import { getDashboardMetrics, getRecoveryQueue, getRecentEvents } from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";

function MetricCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent
          ? "bg-accent-muted border-accent/30"
          : "bg-surface border-border-subtle"
      }`}
    >
      <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1 text-text-primary">{value}</p>
      {subtitle && (
        <p className="text-xs text-text-muted mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    PAYMENT_EVENT_RECEIVED: "Payment received",
    OBLIGATION_MATCHED: "Payment matched",
    BALANCE_UPDATED: "Balance updated",
    DECISION_MADE: "Decision made",
    RECOVERY_ACTION_CREATED: "Recovery action created",
  };
  return map[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export default async function OverviewPage() {
  const [metrics, queue, recentEvents] = await Promise.all([
    getDashboardMetrics(),
    getRecoveryQueue(),
    getRecentEvents(10),
  ]);

  const statusColors: Record<string, string> = {
    OPEN: "text-[var(--status-open)]",
    PARTIALLY_RECOVERED: "text-[var(--status-partial)]",
    RECOVERED: "text-[var(--status-recovered)]",
    OVERPAID: "text-[var(--status-overpaid)]",
    STOPPED: "text-[var(--status-stopped)]",
    ESCALATED: "text-[var(--status-escalated)]",
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settle</h1>
        <p className="text-sm text-text-secondary mt-1">
          Know what&apos;s owed. Settle what remains.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-8">
        <MetricCard
          label="Outstanding"
          value={formatPaise(metrics.totals.outstanding)}
          accent
        />
        <MetricCard
          label="Recovered"
          value={formatPaise(metrics.totals.recovered)}
        />
        <MetricCard
          label="Recoverable"
          value={String(metrics.recoverableCount)}
          subtitle="obligations needing action"
        />
        <MetricCard
          label="Actions Prevented"
          value={String(metrics.statusBreakdown["STOPPED"] ?? 0)}
          subtitle="system stopped unnecessary retries"
        />
        <MetricCard
          label="Needs Attention"
          value={String(metrics.attentionCount)}
          subtitle="exceptions + escalated"
        />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 bg-surface rounded-xl border border-border-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Recovery Queue
            </h2>
            <Link
              href="/obligations"
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              View all
            </Link>
          </div>
          {queue.length === 0 ? (
            <p className="text-xs text-text-muted py-8 text-center">
              No obligations need attention.
            </p>
          ) : (
            <div className="space-y-3">
              {queue.map((ob) => (
                <Link
                  key={ob.id}
                  href={`/obligations/${ob.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {ob.customer.name}
                      </span>
                      <StatusBadge status={ob.status} />
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {ob.sourceReference}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-mono font-medium text-text-primary">
                      {formatPaise(ob.outstandingAmountPaise)}
                    </p>
                    <p className="text-xs text-text-muted">outstanding</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Obligation Status
          </h2>
          {metrics.totalObligations === 0 ? (
            <p className="text-xs text-text-muted py-8 text-center">
              No obligations yet.
            </p>
          ) : (
            <div className="space-y-3">
              {(["OPEN", "PARTIALLY_RECOVERED", "RECOVERED", "OVERPAID", "ESCALATED", "STOPPED"] as const).map(
                (status) => {
                  const count = metrics.statusBreakdown[status] ?? 0;
                  if (count === 0) return null;
                  const pct = Math.round(
                    (count / metrics.totalObligations) * 100
                  );
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-text-secondary">
                          {status.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs font-mono text-text-muted">
                          {count}
                        </span>
                      </div>
                      <div className="w-full bg-border-subtle rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${statusColors[status] ? statusColors[status].replace("text-", "bg-") : "bg-gray-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border-subtle p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Recent Events
          </h2>
          <Link
            href="/audit"
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            View all
          </Link>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-text-muted py-8 text-center">
            No events recorded yet.
          </p>
        ) : (
          <div className="space-y-0">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {formatEventType(event.eventType)}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {event.obligation.customer.name} ·{" "}
                      {event.obligation.sourceReference}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-text-muted flex-shrink-0 ml-4">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
