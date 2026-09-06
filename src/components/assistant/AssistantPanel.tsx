"use client";

import { useState } from "react";

interface AssistantPanelProps {
  obligationId: string;
}

export function AssistantPanel({ obligationId }: AssistantPanelProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function fetchExplanation() {
    if (explanation) {
      setExpanded(!expanded);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/obligation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligationId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to get explanation");
        return;
      }

      setExplanation(data.data.explanation);
      setExpanded(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border-subtle p-6">
      <button
        onClick={fetchExplanation}
        disabled={loading}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Settle Assistant
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Explain this obligation in plain English
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs text-text-muted animate-pulse">
                Loading...
              </span>
            )}
            <svg
              className={`w-4 h-4 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          {error && (
            <div className="p-3 rounded-lg bg-[var(--status-escalated)]/5 border border-[var(--status-escalated)]/20">
              <p className="text-xs text-text-secondary">{error}</p>
            </div>
          )}

          {explanation && (
            <div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {explanation}
              </p>
              <p className="text-xs text-text-muted mt-3 italic">
                Read-only explanation based on Settle&apos;s recorded state.
              </p>
            </div>
          )}

          {!error && !explanation && !loading && (
            <p className="text-xs text-text-muted">
              Click to generate an explanation of this obligation&apos;s
              financial state.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
