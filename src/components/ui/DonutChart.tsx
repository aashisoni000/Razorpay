"use client";

import { useState } from "react";

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export function DonutChart({
  slices,
  size = 160,
  thickness = 24,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-text-muted"
        style={{ width: size, height: size }}
      >
        No data yet.
      </div>
    );
  }

  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const visibleSlices = slices.filter((s) => s.value > 0);
  const offsets: number[] = [];
  let running = 0;
  for (const s of visibleSlices) {
    offsets.push(running);
    running += s.value;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          {visibleSlices.map((slice, i) => {
            const pct = slice.value / total;
            const dashLen = pct * circumference;
            const dashOffset = -(offsets[i] / total) * circumference;
            const isHovered = hoveredIdx === i;

            return (
              <circle
                key={slice.label}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={thickness}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                opacity={hoveredIdx !== null && !isHovered ? 0.4 : 1}
                className="transition-opacity duration-150"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>
                  {slice.label}: {slice.value} ({(pct * 100).toFixed(0)}%)
                </title>
              </circle>
            );
          })}
        </svg>
        {(centerLabel || centerValue !== undefined) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-text-primary font-mono leading-tight">
              {centerValue ?? ""}
            </span>
            {centerLabel && (
              <span className="text-[9px] text-text-muted uppercase tracking-wide leading-tight">
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5 min-w-0">
        {visibleSlices.map((slice, i) => {
          const pct = ((slice.value / total) * 100).toFixed(0);
          return (
            <div
              key={slice.label}
              className="flex items-center gap-2 text-xs cursor-default"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-text-secondary truncate">{slice.label}</span>
              <span className="text-text-primary font-mono ml-auto">
                {slice.value}
              </span>
              <span className="text-text-muted font-mono w-8 text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
