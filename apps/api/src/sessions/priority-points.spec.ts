import { buildPriorityPoints } from "./priority-points";

describe("buildPriorityPoints", () => {
  it("uses the latest collective answer of each group and creates one point per line", () => {
    const points = buildPriorityPoints("discussion-1", [
      {
        value: { groupId: "green", groupName: "Gruppe Grün", result: "Alte Antwort" },
        updatedAt: new Date("2026-08-27T10:00:00.000Z"),
      },
      {
        value: { groupId: "blue", groupName: "Gruppe Blau", result: "1. Rollen verteilen\n• Nächste Schritte" },
        updatedAt: new Date("2026-08-27T10:01:00.000Z"),
      },
      {
        value: { groupId: "green", groupName: "Gruppe Grün", result: "- Gemeinsame Lösung\n2) Ergebnis prüfen" },
        updatedAt: new Date("2026-08-27T10:02:00.000Z"),
      },
    ]);

    expect(points.map(({ text, groupName }) => ({ text, groupName }))).toEqual([
      { text: "Rollen verteilen", groupName: "Gruppe Blau" },
      { text: "Nächste Schritte", groupName: "Gruppe Blau" },
      { text: "Gemeinsame Lösung", groupName: "Gruppe Grün" },
      { text: "Ergebnis prüfen", groupName: "Gruppe Grün" },
    ]);
    expect(new Set(points.map((point) => point.id)).size).toBe(points.length);
  });

  it("ignores malformed answers and answers from another discussion", () => {
    const points = buildPriorityPoints("discussion-1", [
      {
        nodeId: "discussion-2",
        value: { groupId: "green", groupName: "Gruppe Grün", result: "Falsche Diskussion" },
        updatedAt: new Date("2026-08-27T10:00:00.000Z"),
      },
      {
        nodeId: "discussion-1",
        value: { groupId: "green", groupName: "Gruppe Grün", answers: ["Ohne result"] },
        updatedAt: new Date("2026-08-27T10:01:00.000Z"),
      },
      {
        nodeId: "discussion-1",
        value: { groupId: "blue", groupName: "Gruppe Blau", result: "   " },
        updatedAt: new Date("2026-08-27T10:02:00.000Z"),
      },
    ]);

    expect(points).toEqual([]);
  });

  it("keeps stable, distinct ids for duplicate lines", () => {
    const answer = {
      value: { groupId: "green", groupName: "Gruppe Grün", result: "Gleicher Punkt\nGleicher Punkt" },
      updatedAt: new Date("2026-08-27T10:00:00.000Z"),
    };

    const first = buildPriorityPoints("discussion-1", [answer]);
    const second = buildPriorityPoints("discussion-1", [answer]);

    expect(first).toEqual(second);
    expect(first[0]?.id).not.toBe(first[1]?.id);
  });
});
