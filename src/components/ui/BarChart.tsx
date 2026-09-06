interface BarChartProps {
  data: { label: string; value: number; display?: string }[];
  height?: number;
  barColor?: string;
}

export function BarChart({
  data,
  height = 160,
  barColor = "var(--accent)",
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-text-muted"
        style={{ height }}
      >
        No data yet.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(Math.floor(800 / data.length) - 4, 12);
  const chartWidth = data.length * (barWidth + 4);
  const labelEvery =
    data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 7);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${Math.max(chartWidth, 200)} ${height + 28}`}
        className="w-full"
        style={{ minWidth: Math.max(chartWidth, 200) }}
      >
        {data.map((d, i) => {
          const barH = Math.max((d.value / max) * (height - 8), 2);
          const x = i * (barWidth + 4);
          const y = height - barH;
          const showLabel = i % labelEvery === 0;
          const shortLabel = d.label.slice(5);

          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={barColor}
                rx={3}
                opacity={0.85}
              >
                <title>{d.display ?? `${d.value}`}</title>
              </rect>
              {showLabel && (
                <text
                  x={x + barWidth / 2}
                  y={height + 14}
                  textAnchor="middle"
                  className="fill-text-muted"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {shortLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
