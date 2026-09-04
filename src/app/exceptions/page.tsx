import { EmptyState } from "@/components/ui/EmptyState";

export default function ExceptionsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Exceptions</h1>
        <p className="text-sm text-text-secondary mt-1">
          Payments requiring manual review or resolution.
        </p>
      </div>
      <div className="bg-surface rounded-xl border border-border-subtle">
        <EmptyState
          title="No exceptions"
          description="Ambiguous or unresolvable payments will appear here."
        />
      </div>
    </div>
  );
}
