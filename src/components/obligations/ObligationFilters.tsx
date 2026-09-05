"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const STATUSES = [
  "ALL",
  "OPEN",
  "PARTIALLY_RECOVERED",
  "RECOVERED",
  "OVERPAID",
  "STOPPED",
  "ESCALATED",
] as const;

export function ObligationFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const currentStatus = searchParams.get("status") ?? "ALL";
  const currentSearch = searchParams.get("search") ?? "";

  function setStatus(status: string) {
    const params = new URLSearchParams(searchParams);
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    startTransition(() => {
      router.push(`/obligations?${params.toString()}`);
    });
  }

  function setSearch(value: string) {
    const params = new URLSearchParams(searchParams);
    if (!value) {
      params.delete("search");
    } else {
      params.set("search", value);
    }
    startTransition(() => {
      router.push(`/obligations?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex items-center gap-1 bg-surface-muted rounded-lg p-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentStatus === s
                ? "bg-accent text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Search by reference or customer..."
        defaultValue={currentSearch}
        onChange={(e) => setSearch(e.target.value)}
        className="ml-auto bg-surface-muted border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 w-64"
      />
      {isPending && (
        <span className="text-xs text-text-muted animate-pulse">Loading...</span>
      )}
    </div>
  );
}
