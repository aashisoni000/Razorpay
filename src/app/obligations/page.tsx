import Link from "next/link";
import { Suspense } from "react";
import { getObligations } from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ObligationFilters } from "@/components/obligations/ObligationFilters";

async function ObligationsTable({
  status,
  search,
}: {
  status?: string;
  search?: string;
}) {
  const obligations = await getObligations({
    status,
    search,
  });

  return (
    <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
      {obligations.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-text-muted">
            No obligations match your filters.
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
              <th className="text-right text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                Original
              </th>
              <th className="text-right text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                Recovered
              </th>
              <th className="text-right text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                Outstanding
              </th>
              <th className="text-center text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                Status
              </th>
              <th className="text-right text-xs font-medium text-text-secondary px-6 py-3 uppercase tracking-wide">
                Events
              </th>
            </tr>
          </thead>
          <tbody>
            {obligations.map((ob) => (
              <tr
                key={ob.id}
                className="border-b border-border-subtle last:border-0 hover:bg-surface-muted transition-colors"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/obligations/${ob.id}`}
                    className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
                  >
                    {ob.customer.name}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-mono text-text-secondary">
                    {ob.sourceReference}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono text-text-primary">
                    {formatPaise(ob.originalAmountPaise)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono text-text-primary">
                    {formatPaise(ob.recoveredAmountPaise)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`text-sm font-mono font-medium ${
                      ob.outstandingAmountPaise > 0n
                        ? "text-text-primary"
                        : "text-text-muted"
                    }`}
                  >
                    {formatPaise(ob.outstandingAmountPaise)}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <StatusBadge status={ob.status} />
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm text-text-muted">
                    {ob.paymentEvents.length}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "ALL";
  const search = params.search ?? "";

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Obligations</h1>
        <p className="text-sm text-text-secondary mt-1">
          Track what is owed across all obligations.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="py-16 text-center text-sm text-text-muted">
            Loading obligations...
          </div>
        }
      >
        <ObligationFilters />
      </Suspense>
      <Suspense
        fallback={
          <div className="py-16 text-center text-sm text-text-muted">
            Loading obligations...
          </div>
        }
      >
        <ObligationsTable status={status} search={search} />
      </Suspense>
    </div>
  );
}
