import { EmptyState } from "@/components/ui/EmptyState";

export default function ObligationsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Obligations</h1>
        <p className="text-sm text-text-secondary mt-1">
          Track what is owed across all obligations.
        </p>
      </div>
      <div className="bg-surface rounded-xl border border-border-subtle">
        <EmptyState
          title="No obligations yet"
          description="Seed demo data to see obligations in action."
        />
      </div>
    </div>
  );
}
