import { aggregateScaleResults, scaleSelectionIndexes } from "./scale-results";

describe("scale result aggregation", () => {
  it("aggregates every statement independently", () => {
    const results = aggregateScaleResults([
      { scaleValues: [0, 2, 4] },
      { scaleValues: [1, 2, 3] },
    ], 3, [1, 2, 3, 4, 5]);

    expect(results[0]).toEqual({ counts: [1, 1, 0, 0, 0], total: 2, average: 1.5 });
    expect(results[1]).toEqual({ counts: [0, 0, 2, 0, 0], total: 2, average: 3 });
    expect(results[2]).toEqual({ counts: [0, 0, 0, 1, 1], total: 2, average: 4.5 });
  });

  it("keeps old single-rating answers compatible", () => {
    expect(scaleSelectionIndexes({ optionIndex: 2 }, 1)).toEqual([2]);
    expect(scaleSelectionIndexes({ optionIndex: 2 }, 3)).toEqual([]);
  });

  it("ignores invalid option indexes", () => {
    const results = aggregateScaleResults([{ scaleValues: [-1, 8] }], 2, [1, 2, 3]);
    expect(results).toEqual([
      { counts: [0, 0, 0], total: 0, average: null },
      { counts: [0, 0, 0], total: 0, average: null },
    ]);
  });
});
