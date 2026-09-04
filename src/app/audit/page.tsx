import { EmptyState } from "@/components/ui/EmptyState";

export default function AuditPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Audit</h1>
        <p className="text-sm text-text-secondary mt-1">
          Chronological audit trail of all system decisions.
        </p>
      </div>
      <div className="bg-surface rounded-xl border border-border-subtle">
        <EmptyState
          title="No audit entries"
          description="System activity will be logged here as events are processed."
        />
      </div>
    </div>
  );
}
