import { getRecoveryActions } from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";

function formatActionType(type: string): string {
  const map: Record<string, string> = {
    PAYMENT_LINK: "Payment link",
    RETRY: "Retry",
    REFUND: "Refund",
    ESCALATE: "Escalate",
  };
  return map[type] ?? type;
}

export default async function RecoveryPage() {
  const actions = await getRecoveryActions();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Recovery Actions</h1>
        <p className="text-sm text-text-secondary mt-1">
          Payment links, retries, and escalations for outstanding obligations.
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
        {actions.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-text-muted">
              No recovery actions yet.
            </p>
          </div>
        ) : (
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
              {actions.map((action) => (
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
                    {action.razorpayPaymentLinkId && (
                      <p className="text-xs text-text-muted font-mono mt-0.5">
                        {action.razorpayPaymentLinkId}
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
        )}
      </div>
    </div>
  );
}
