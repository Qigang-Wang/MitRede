export type ScaleAnswerValue = {
  optionIndex?: number;
  scaleValues?: number[];
};

export function scaleSelectionIndexes(value: ScaleAnswerValue, statementCount: number): number[] {
  if (Array.isArray(value.scaleValues)) return value.scaleValues.slice(0, statementCount);
  return statementCount === 1 && Number.isInteger(value.optionIndex) ? [value.optionIndex as number] : [];
}

export function aggregateScaleResults(
  values: ScaleAnswerValue[],
  statementCount: number,
  optionValues: number[],
) {
  const counts = Array.from({ length: statementCount }, () => Array.from({ length: optionValues.length }, () => 0));
  const totals = Array.from({ length: statementCount }, () => 0);
  const sums = Array.from({ length: statementCount }, () => 0);

  for (const value of values) {
    const selected = scaleSelectionIndexes(value, statementCount);
    selected.forEach((optionIndex, statementIndex) => {
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= optionValues.length) return;
      counts[statementIndex]![optionIndex] = (counts[statementIndex]![optionIndex] ?? 0) + 1;
      totals[statementIndex] = (totals[statementIndex] ?? 0) + 1;
      sums[statementIndex] = (sums[statementIndex] ?? 0) + (optionValues[optionIndex] ?? 0);
    });
  }

  return counts.map((statementCounts, statementIndex) => ({
    counts: statementCounts,
    total: totals[statementIndex] ?? 0,
    average: totals[statementIndex] ? (sums[statementIndex] ?? 0) / (totals[statementIndex] ?? 1) : null,
  }));
}
