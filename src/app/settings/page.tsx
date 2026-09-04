import { EmptyState } from "@/components/ui/EmptyState";

export default function SettingsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Configure Settle for your environment.
        </p>
      </div>
      <div className="bg-surface rounded-xl border border-border-subtle">
        <EmptyState
          title="Settings coming soon"
          description="Razorpay configuration and recovery policies will be configurable here."
        />
      </div>
    </div>
  );
}
