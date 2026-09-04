import { MetricCard } from "@/components/ui/MetricCard";

export default function OverviewPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settle</h1>
        <p className="text-sm text-text-secondary mt-1">
          Know what&apos;s owed. Settle what remains.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-8">
        <MetricCard label="Outstanding" value="₹0" accent />
        <MetricCard label="Recovered" value="₹0" />
        <MetricCard label="Recoverable" value="₹0" />
        <MetricCard label="Actions Prevented" value="0" />
        <MetricCard label="Needs Attention" value="0" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Recovery Queue
          </h2>
          <p className="text-xs text-text-muted">No items in queue</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Obligation Status
          </h2>
          <p className="text-xs text-text-muted">No obligations yet</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Recent Events
          </h2>
          <p className="text-xs text-text-muted">No events recorded</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-subtle p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Needs Attention
          </h2>
          <p className="text-xs text-text-muted">All clear</p>
        </div>
      </div>
    </div>
  );
}
