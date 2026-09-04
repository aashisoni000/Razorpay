import { EmptyState } from "@/components/ui/EmptyState";

export default function RecoveryPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Recovery</h1>
        <p className="text-sm text-text-secondary mt-1">
          Active and past recovery actions.
        </p>
      </div>
      <div className="bg-surface rounded-xl border border-border-subtle">
        <EmptyState
          title="No recovery actions"
          description="Recovery actions will appear here when obligations need attention."
        />
      </div>
    </div>
  );
}
