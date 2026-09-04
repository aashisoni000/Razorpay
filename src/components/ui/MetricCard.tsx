"use client";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}

export function MetricCard({ label, value, subtitle, accent }: MetricCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent
          ? "bg-accent-muted border-accent/30"
          : "bg-surface border-border-subtle"
      }`}
    >
      <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1 text-text-primary">{value}</p>
      {subtitle && (
        <p className="text-xs text-text-muted mt-1">{subtitle}</p>
      )}
    </div>
  );
}
