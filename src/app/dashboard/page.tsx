import Link from "next/link";
import {
  getDashboardMetrics,
  getRecoveryQueue,
  getRecentEvents,
  getRecoveryTrend,
  getRecoveryActionSummary,
  getOutstandingByCustomer,
} from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DonutChart } from "@/components/ui/DonutChart";
import { LineChart } from "@/components/ui/LineChart";
import { HorizontalBarChart } from "@/components/ui/HorizontalBarChart";

const STATUS_COLORS_HEX: Record<string, string> = {
  OPEN: "#a3b853",
  PARTIALLY_RECOVERED: "#d6e58e",
  RECOVERED: "#c8d96c",
  OVERPAID: "#7a8c3f",
  STOPPED: "#c4c4c4",
  ESCALATED: "#4a4a4a",
};

const ACTION_COLORS_HEX: Record<string, string> = {
  CREATED: "#c4c4c4",
  ACTIVE: "#a3b853",
  SUCCEEDED: "#c8d96c",
  CANCELLED: "#7a8c3f",
  EXPIRED: "#d9d9d9",
  FAILED: "#4a4a4a",
};

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
    RECOVERY_ACTION_RESOLVED: "Recovery action resolved",
    OBLIGATION_OPENED: "Obligation created",
    OBLIGATION_RECOVERED: "Obligation recovered",
    OBLIGATION_ESCALATED: "Obligation escalated",
    OBLIGATION_STOPPED: "Obligation stopped",
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

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PARTIALLY_RECOVERED: "Partial",
  RECOVERED: "Recovered",
  OVERPAID: "Overpaid",
  STOPPED: "Stopped",
  ESCALATED: "Escalated",
};

const ACTION_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  CREATED: "Pending",
  SUCCEEDED: "Succeeded",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
};

const ACTION_STATUS_ORDER = [
  "ACTIVE",
  "CREATED",
  "SUCCEEDED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
] as const;

const STATUS_ORDER = [
  "OPEN",
  "PARTIALLY_RECOVERED",
  "RECOVERED",
  "OVERPAID",
  "STOPPED",
  "ESCALATED",
] as const;

export default async function DashboardPage() {
  const [metrics, queue, recentEvents, trend, actionSummary, outstandingByCustomer] =
    await Promise.all([
      getDashboardMetrics(),
      getRecoveryQueue(),
      getRecentEvents(10),
      getRecoveryTrend(),
      getRecoveryActionSummary(),
      getOutstandingByCustomer(),
    ]);

  const recoveryRate =
    metrics.totals.original > 0n
      ? Number((metrics.totals.recovered * 10000n) / metrics.totals.original) / 100
      : 0;

  const trendPoints = trend.map((t) => ({
    label: t.date,
    value: Number(t.amount) / 100,
    display: formatPaise(t.amount),
  }));

  const statusSlices = STATUS_ORDER
    .map((s) => ({
      label: STATUS_LABELS[s] ?? s,
      value: metrics.statusBreakdown[s] ?? 0,
      color: STATUS_COLORS_HEX[s],
    }))
    .filter((s) => s.value > 0);

  const actionSlices = ACTION_STATUS_ORDER
    .map((s) => ({
      label: ACTION_LABELS[s] ?? s,
      value: actionSummary.byStatus[s] ?? 0,
      color: ACTION_COLORS_HEX[s],
    }))
    .filter((s) => s.value > 0);

  const outstandingEntries = outstandingByCustomer.map((r) => ({
    label: r.name,
    value: Number(r.outstanding),
    display: formatPaise(r.outstanding),
    href: `/obligations?customerId=${r.customerId}`,
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settle</h1>
        <p className="text-sm text-text-secondary mt-1">
          Know what&apos;s owed. Settle what remains.
        </p>
      </div>

      {/* ROW 1: KPI Cards */}
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
          label="Recovery Rate"
          value={`${recoveryRate.toFixed(1)}%`}
          subtitle="across all obligations"
        />
        <MetricCard
          label="Settled"
          value={String(
            (metrics.statusBreakdown["RECOVERED"] ?? 0) +
              (metrics.statusBreakdown["OVERPAID"] ?? 0)
          )}
          subtitle="no recovery needed"
        />
        <MetricCard
          label="Needs Attention"
          value={String(metrics.attentionCount)}
          subtitle="exceptions + escalated"
        />
      </div>

      {/* ROW 2: Recovery Trend (primary focal point) + Status Donut */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Recovery Over Time
          </h2>
          <p className="text-xs text-text-muted mb-4">
            Daily recovered amount from payment events.
          </p>
          <LineChart
            points={trendPoints}
            height={180}
            lineColor="var(--accent)"
          />
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Obligation Status
          </h2>
          <p className="text-xs text-text-muted mb-4">
            {metrics.totalObligations} total obligation{metrics.totalObligations !== 1 ? "s" : ""}
          </p>
          <DonutChart
            slices={statusSlices}
            size={140}
            thickness={20}
            centerLabel="obligations"
            centerValue={metrics.totalObligations}
          />
        </div>
      </div>

      {/* ROW 3: Recovery Outcomes + Recovery Queue */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Recovery Outcomes
          </h2>
          <p className="text-xs text-text-muted mb-4">
            Current recovery actions by outcome.
          </p>
          {actionSummary.total === 0 ? (
            <p className="text-xs text-text-muted py-8 text-center">
              No recovery actions yet.
            </p>
          ) : (
            <DonutChart
              slices={actionSlices}
              size={120}
              thickness={18}
              centerLabel="actions"
              centerValue={actionSummary.total}
            />
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Outstanding by Customer
          </h2>
          <p className="text-xs text-text-muted mb-4">
            Where recovery attention is concentrated.
          </p>
          <HorizontalBarChart
            entries={outstandingEntries.slice(0, 5)}
            barColor="var(--accent)"
          />
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
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
            <div className="space-y-2">
              {queue.slice(0, 5).map((ob) => (
                <Link
                  key={ob.id}
                  href={`/obligations/${ob.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary truncate">
                        {ob.customer.name}
                      </span>
                      <StatusBadge status={ob.status} />
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {ob.sourceReference}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs font-mono font-medium text-text-primary">
                      {formatPaise(ob.outstandingAmountPaise)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: Recent Events */}
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
