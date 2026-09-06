"use client";

import { useState } from "react";

interface LineChartPoint {
  label: string;
  value: number;
  display: string;
}

interface LineChartProps {
  points: LineChartPoint[];
  height?: number;
  lineColor?: string;
  showDots?: boolean;
  yLabel?: string;
}

export function LineChart({
  points,
  height = 160,
  lineColor = "var(--accent)",
  showDots = true,
}: LineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-text-muted"
        style={{ height }}
      >
        No data yet.
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="w-full" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-sm font-mono font-medium text-text-primary">
              {points[0].display}
            </div>
            <div className="text-xs text-text-muted mt-1">{points[0].label}</div>
          </div>
        </div>
      </div>
    );
  }

  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const w = 600;
  const h = height;
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;

  const max = Math.max(...points.map((p) => p.value), 1);

  const coords = points.map((p, i) => ({
    x: padding.left + (i / (points.length - 1)) * innerW,
    y: padding.top + innerH - (p.value / max) * innerH,
  }));

  const pathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
    .join(" ");

  const areaD =
    pathD +
    ` L ${coords[coords.length - 1].x} ${padding.top + innerH} L ${coords[0].x} ${padding.top + innerH} Z`;

  const tickCount = Math.min(points.length, 7);
  const tickStep = Math.max(Math.floor(points.length / tickCount), 1);

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((max / yTicks) * i)
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 400 }}>
        {yTickValues.map((val) => {
          const y = padding.top + innerH - (val / max) * innerH;
          return (
            <g key={val}>
              <line
                x1={padding.left}
                y1={y}
                x2={w - padding.right}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-text-muted"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                ₹{(val / 100).toLocaleString("en-IN")}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill={lineColor} opacity={0.08} />

        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {showDots &&
          coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={hoveredIdx === i ? 5 : 3}
              fill={lineColor}
              stroke="var(--surface)"
              strokeWidth="2"
              className="transition-all duration-150"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <title>{`${points[i].label}\n${points[i].display}`}</title>
            </circle>
          ))}

        {points.map((p, i) => {
          if (i % tickStep !== 0 && i !== points.length - 1) return null;
          const c = coords[i];
          return (
            <text
              key={i}
              x={c.x}
              y={h - 6}
              textAnchor="middle"
              className="fill-text-muted"
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {p.label.length > 5 ? p.label.slice(5) : p.label}
            </text>
          );
        })}

        {hoveredIdx !== null && (
          <g>
            <line
              x1={coords[hoveredIdx].x}
              y1={padding.top}
              x2={coords[hoveredIdx].x}
              y2={padding.top + innerH}
              stroke="var(--text-muted)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <rect
              x={coords[hoveredIdx].x - 50}
              y={coords[hoveredIdx].y - 30}
              width={100}
              height={24}
              rx={4}
              fill="var(--surface)"
              stroke="var(--border-subtle)"
              strokeWidth="1"
            />
            <text
              x={coords[hoveredIdx].x}
              y={coords[hoveredIdx].y - 14}
              textAnchor="middle"
              className="fill-text-primary"
              fontSize="10"
              fontWeight="500"
            >
              {points[hoveredIdx].display}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
