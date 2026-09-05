import { getExceptions } from "@/lib/services/dashboard-service";
import { StatusBadge } from "@/components/ui/StatusBadge";

function formatExceptionType(type: string): string {
  return type.replace(/_/g, " ").toLowerCase();
}

export default async function ExceptionsPage() {
  const exceptions = await getExceptions();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Exceptions</h1>
        <p className="text-sm text-text-secondary mt-1">
          Ambiguous matches and decision failures that need human review.
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
        {exceptions.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-text-muted">
              No exceptions yet. The system is healthy.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                  Type
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                  Obligation
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                  Customer
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                  Message
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
              {exceptions.map((ex) => (
                <tr
                  key={ex.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-muted transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-text-primary">
                      {formatExceptionType(ex.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono text-text-secondary">
                      {ex.obligation?.sourceReference ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-text-primary">
                      {ex.obligation?.customer.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-text-secondary max-w-md truncate">
                      {ex.description}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={ex.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-text-muted">
                      {ex.createdAt.toLocaleString()}
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
