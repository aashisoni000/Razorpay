"use client";

interface HBarEntry {
  label: string;
  value: number;
  display: string;
  href?: string;
}

interface HorizontalBarChartProps {
  entries: HBarEntry[];
  height?: number;
  barColor?: string;
}

export function HorizontalBarChart({
  entries,
  height,
  barColor = "var(--accent)",
}: HorizontalBarChartProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-text-muted py-8">
        No data yet.
      </div>
    );
  }

  const max = Math.max(...entries.map((e) => e.value), 1);
  const rowH = 28;
  const labelW = 100;
  const chartH = height ?? entries.length * rowH;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 500 ${chartH}`} className="w-full">
        {entries.map((entry, i) => {
          const y = i * rowH;
          const barW = Math.max((entry.value / max) * 340, 2);
          const content = (
            <>
              <text
                x={labelW - 8}
                y={y + rowH / 2 + 4}
                textAnchor="end"
                className="fill-text-secondary"
                fontSize="11"
              >
                {entry.label.length > 14
                  ? entry.label.slice(0, 14) + "…"
                  : entry.label}
              </text>
              <rect
                x={labelW}
                y={y + 4}
                width={barW}
                height={rowH - 8}
                fill={barColor}
                rx={4}
                opacity={0.85}
              >
                <title>{`${entry.label}: ${entry.display}`}</title>
              </rect>
              <text
                x={labelW + barW + 8}
                y={y + rowH / 2 + 4}
                className="fill-text-primary"
                fontSize="11"
                fontWeight="500"
              >
                {entry.display}
              </text>
            </>
          );

          if (entry.href) {
            return (
              <a key={entry.label} href={entry.href}>
                {content}
              </a>
            );
          }
          return <g key={entry.label}>{content}</g>;
        })}
      </svg>
    </div>
  );
}
