import type { CSSProperties } from "react";

type RatingScaleRailProps = {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  value?: number | null;
  valuePrefix?: string;
  counts?: number[];
  compact?: boolean;
  className?: string;
};

function formatScaleNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function scalePosition(value: number, min: number, max: number) {
  if (max === min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function scaleMarkers(min: number, max: number) {
  const middle = Math.round((min + max) / 2);
  return [...new Set([min, middle, max])].sort((a, b) => a - b);
}

function distributionPaths(counts: number[]) {
  if (!counts.some((count) => count > 0)) return null;
  const lastBin = Math.max(1, counts.length - 1);
  const sampleCount = Math.max(64, Math.min(320, counts.length * 4));
  const bandwidth = Math.max(0.85, lastBin * 0.035);
  const density = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const location = sampleIndex / (sampleCount - 1) * lastBin;
    return counts.reduce((sum, count, binIndex) => {
      if (count <= 0) return sum;
      const distance = (location - binIndex) / bandwidth;
      return sum + count * Math.exp(-0.5 * distance * distance);
    }, 0);
  });
  const maximum = Math.max(...density, Number.EPSILON);
  const baseline = 80;
  const peakHeight = 66 * (1 - Math.exp(-maximum / 5));
  const points = density.map((value, index) => ({
    x: index / (density.length - 1) * 1000,
    y: baseline - value / maximum * peakHeight,
  }));
  let line = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? baseline}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const afterNext = points[Math.min(points.length - 1, index + 2)]!;
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = Math.max(3, Math.min(baseline, current.y + (next.y - previous.y) / 6));
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = Math.max(3, Math.min(baseline, next.y - (afterNext.y - current.y) / 6));
    line += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`;
  }
  return { line, area: `${line} L 1000 ${baseline} L 0 ${baseline} Z` };
}

export function RatingDistribution({ counts }: { counts: number[] }) {
  const paths = distributionPaths(counts);
  if (!paths) return null;
  return <svg className="rating-scale-distribution" viewBox="0 0 1000 82" preserveAspectRatio="none" aria-hidden="true"><path className="area" d={paths.area} /><path className="line" d={paths.line} /></svg>;
}

export function RatingScaleRail({ min, max, minLabel = "Niedrig", maxLabel = "Hoch", value = null, valuePrefix = "", counts, compact = false, className = "" }: RatingScaleRailProps) {
  const hasValue = value !== null && Number.isFinite(value);
  return (
    <div className={["rating-scale-rail", compact ? "compact" : "", hasValue ? "has-value" : "", className].filter(Boolean).join(" ")} role="img" aria-label={`Skala von ${min} bis ${max}`}>
      <div className="rating-scale-axis">
        {counts && <RatingDistribution counts={counts} />}
        <i />
        {scaleMarkers(min, max).map((marker) => <span key={marker} style={{ left: `${scalePosition(marker, min, max)}%` }}><b /><em>{marker}</em></span>)}
        {hasValue && <strong style={{ left: `${scalePosition(value, min, max)}%` }}>{valuePrefix}{formatScaleNumber(value)}</strong>}
      </div>
      <footer><span>{minLabel}</span><span>{maxLabel}</span></footer>
    </div>
  );
}

export function RatingScaleInput({ options, selectedIndex, minLabel = "Niedrig", maxLabel = "Hoch", disabled = false, compact = false, ariaLabel = "Bewertung", onChange }: {
  options: string[];
  selectedIndex: number | null | undefined;
  minLabel?: string;
  maxLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  onChange: (index: number) => void;
}) {
  const lastIndex = Math.max(0, options.length - 1);
  const hasSelection = selectedIndex !== null && selectedIndex !== undefined && selectedIndex >= 0 && selectedIndex <= lastIndex;
  const controlValue = hasSelection ? selectedIndex : Math.round(lastIndex / 2);
  const progress = lastIndex > 0 ? controlValue / lastIndex * 100 : 0;
  return (
    <div className={["rating-scale-input", hasSelection ? "selected" : "unselected", compact ? "compact" : ""].filter(Boolean).join(" ")}>
      <header><span>Ihre Bewertung</span><output>{hasSelection ? options[controlValue] : "–"}</output></header>
      <input
        aria-label={ariaLabel}
        aria-valuetext={hasSelection ? options[controlValue] : "Noch keine Bewertung gewählt"}
        disabled={disabled || options.length < 2}
        min={0}
        max={lastIndex}
        step={1}
        type="range"
        value={controlValue}
        style={{ "--rating-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="rating-scale-input-values"><strong>{options[0] ?? "–"}</strong><strong>{options[lastIndex] ?? "–"}</strong></div>
      <footer><span>{minLabel}</span><span>{maxLabel}</span></footer>
    </div>
  );
}

export function calculateRatingAverage(options: string[], counts: number[], total: number) {
  if (!total) return null;
  return options.reduce((sum, option, index) => sum + Number(option) * (counts[index] ?? 0), 0) / total;
}
