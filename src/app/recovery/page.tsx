import {
  getRecoveryActions,
  getRecoveryActionSummary,
  getRecoveryActionAmounts,
} from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart } from "@/components/ui/DonutChart";
import { HorizontalBarChart } from "@/components/ui/HorizontalBarChart";

const ACTION_COLORS_HEX: Record<string, string> = {
  CREATED: "#c4c4c4",
  ACTIVE: "#a3b853",
  SUCCEEDED: "#c8d96c",
  CANCELLED: "#7a8c3f",
  EXPIRED: "#d9d9d9",
  FAILED: "#4a4a4a",
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

type RecoveryActionWithObligation = Awaited<ReturnType<typeof getRecoveryActions>>[number];

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

function ActionTable({
  items,
  emptyMessage,
}: {
  items: RecoveryActionWithObligation[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-text-muted py-6 text-center">{emptyMessage}</p>
    );
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border-subtle">
          <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
            Customer
          </th>
          <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
            Reference
          </th>
          <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
            Action
          </th>
          <th className="text-right text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
            Amount
          </th>
          <th className="text-center text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
            Status
          </th>
          <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
            Created
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((action) => (
          <tr
            key={action.id}
            className="border-b border-border-subtle last:border-0 hover:bg-surface-muted transition-colors"
          >
            <td className="px-6 py-4">
              <span className="text-sm font-medium text-text-primary">
                {action.obligation.customer.name}
              </span>
            </td>
            <td className="px-6 py-4">
              <span className="text-sm font-mono text-text-secondary">
                {action.obligation.sourceReference}
              </span>
            </td>
            <td className="px-6 py-4">
              <span className="text-sm text-text-primary">
                {formatActionType(action.type)}
              </span>
              {action.razorpayPaymentLinkId ? (
                <p className="text-xs text-text-muted font-mono mt-0.5">
                  {action.razorpayPaymentLinkId}
                </p>
              ) : (
                <p className="text-xs text-text-muted mt-0.5">
                  No provider link
                </p>
              )}
            </td>
            <td className="px-6 py-4 text-right">
              <span className="text-sm font-mono text-text-primary">
                {formatPaise(action.amountPaise)}
              </span>
            </td>
            <td className="px-6 py-4 text-center">
              <StatusBadge status={action.status} />
            </td>
            <td className="px-6 py-4">
              <span className="text-xs text-text-muted">
                {action.createdAt.toLocaleString()}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function RecoveryPage() {
  const [actions, actionSummary, actionAmounts] = await Promise.all([
    getRecoveryActions(),
    getRecoveryActionSummary(),
    getRecoveryActionAmounts(),
  ]);

  const active = actions.filter((a) =>
    ["CREATED", "ACTIVE"].includes(a.status)
  );
  const completed = actions.filter((a) => a.status === "SUCCEEDED");
  const cancelled = actions.filter((a) =>
    ["CANCELLED", "EXPIRED", "FAILED"].includes(a.status)
  );

  const statusSlices = ACTION_STATUS_ORDER
    .map((s) => ({
      label: ACTION_LABELS[s] ?? s,
      value: actionSummary.byStatus[s] ?? 0,
      color: ACTION_COLORS_HEX[s],
    }))
    .filter((s) => s.value > 0);

  const amountEntries = actionAmounts.map((a) => ({
    label: `${a.customer} (${a.reference})`,
    value: Number(a.amount),
    display: formatPaise(a.amount),
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">
          Recovery Actions
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Payment links, retries, and escalations for outstanding obligations.
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border-subtle">
          <EmptyState
            title="No recovery actions yet"
            description="Recovery actions are created when the decision engine determines an obligation needs action."
          />
        </div>
      ) : (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-surface rounded-xl border border-border-subtle p-6">
              <h2 className="text-sm font-semibold text-text-primary mb-1">
                Recovery Action Status
              </h2>
              <p className="text-xs text-text-muted mb-4">
                Current actions by outcome.
              </p>
              <DonutChart
                slices={statusSlices}
                size={130}
                thickness={18}
                centerLabel="actions"
                centerValue={actionSummary.total}
              />
            </div>

            <div className="bg-surface rounded-xl border border-border-subtle p-6">
              <h2 className="text-sm font-semibold text-text-primary mb-1">
                Recovery Amount by Action
              </h2>
              <p className="text-xs text-text-muted mb-4">
                Amounts requested per action.
              </p>
              <HorizontalBarChart
                entries={amountEntries}
                barColor="var(--accent)"
              />
            </div>
          </div>

          {/* Action Sections */}
          <div className="space-y-6">
            {active.length > 0 && (
              <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
                <div className="px-6 py-3 border-b border-border-subtle bg-accent-muted/30">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Active
                  </h2>
                  <p className="text-xs text-text-muted">
                    {active.length} action{active.length !== 1 ? "s" : ""} in
                    progress
                  </p>
                </div>
                <ActionTable items={active} emptyMessage="No active actions." />
              </div>
            )}

            {completed.length > 0 && (
              <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
                <div className="px-6 py-3 border-b border-border-subtle">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Completed
                  </h2>
                  <p className="text-xs text-text-muted">
                    {completed.length} successfully recovered
                  </p>
                </div>
                <ActionTable
                  items={completed}
                  emptyMessage="No completed actions."
                />
              </div>
            )}

            {cancelled.length > 0 && (
              <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
                <div className="px-6 py-3 border-b border-border-subtle">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Cancelled / Expired / Failed
                  </h2>
                  <p className="text-xs text-text-muted">
                    {cancelled.length} action{cancelled.length !== 1 ? "s" : ""}{" "}
                    not completed
                  </p>
                </div>
                <ActionTable
                  items={cancelled}
                  emptyMessage="No cancelled actions."
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
