import Link from "next/link";
import { Suspense } from "react";
import {
  getObligations,
  getDashboardMetrics,
  getOutstandingByCustomer,
} from "@/lib/services/dashboard-service";
import { formatPaise } from "@/lib/utils/money";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ObligationFilters } from "@/components/obligations/ObligationFilters";
import { DonutChart } from "@/components/ui/DonutChart";
import { HorizontalBarChart } from "@/components/ui/HorizontalBarChart";

const STATUS_COLORS_HEX: Record<string, string> = {
  OPEN: "#a3b853",
  PARTIALLY_RECOVERED: "#d6e58e",
  RECOVERED: "#c8d96c",
  OVERPAID: "#7a8c3f",
  STOPPED: "#c4c4c4",
  ESCALATED: "#4a4a4a",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PARTIALLY_RECOVERED: "Partial",
  RECOVERED: "Recovered",
  OVERPAID: "Overpaid",
  STOPPED: "Stopped",
  ESCALATED: "Escalated",
};

const STATUS_ORDER = [
  "OPEN",
  "PARTIALLY_RECOVERED",
  "RECOVERED",
  "OVERPAID",
  "STOPPED",
  "ESCALATED",
] as const;

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
            {search || (status && status !== "ALL")
              ? "No obligations match your filters."
              : "No obligations yet. Seed the database to see data."}
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
                Source
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
                className="border-b border-border-subtle last:border-0 hover:bg-surface-muted transition-colors cursor-pointer"
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

  const [metrics, outstandingByCustomer] = await Promise.all([
    getDashboardMetrics(),
    getOutstandingByCustomer(),
  ]);

  const statusSlices = STATUS_ORDER
    .map((s) => ({
      label: STATUS_LABELS[s] ?? s,
      value: metrics.statusBreakdown[s] ?? 0,
      color: STATUS_COLORS_HEX[s],
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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Obligations</h1>
        <p className="text-sm text-text-secondary mt-1">
          Track what is owed across all obligations.
        </p>
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Outstanding by Customer
          </h2>
          <p className="text-xs text-text-muted mb-4">
            Where recovery attention is concentrated.
          </p>
          <HorizontalBarChart
            entries={outstandingEntries}
            barColor="var(--accent)"
          />
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Obligation Status
          </h2>
          <p className="text-xs text-text-muted mb-4">
            Distribution across all obligations.
          </p>
          <DonutChart
            slices={statusSlices}
            size={130}
            thickness={18}
            centerLabel="total"
            centerValue={metrics.totalObligations}
          />
        </div>

        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">
            Summary
          </h2>
          <p className="text-xs text-text-muted mb-4">
            Key obligation metrics.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted">
              <span className="text-xs text-text-secondary">Total Outstanding</span>
              <span className="text-sm font-mono font-medium text-text-primary">
                {formatPaise(metrics.totals.outstanding)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted">
              <span className="text-xs text-text-secondary">Total Recovered</span>
              <span className="text-sm font-mono font-medium text-text-primary">
                {formatPaise(metrics.totals.recovered)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted">
              <span className="text-xs text-text-secondary">Need Action</span>
              <span className="text-sm font-mono font-medium text-text-primary">
                {metrics.recoverableCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
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
