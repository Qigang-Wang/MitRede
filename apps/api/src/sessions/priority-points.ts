import { createHash } from "node:crypto";

type GroupAnswerValue = {
  groupId?: string;
  groupName?: string;
  result?: string;
};

export type PriorityPoint = {
  id: string;
  text: string;
  groupName: string;
};

export type PrioritySourceAnswer = {
  nodeId?: string;
  value: unknown;
  updatedAt: Date;
};

export function buildPriorityPoints(
  sourceNodeId: string | null | undefined,
  answers: PrioritySourceAnswer[],
): PriorityPoint[] {
  if (!sourceNodeId) return [];

  const latestByGroup = new Map<string, { name: string; result: string; updatedAt: number }>();
  for (const answer of answers) {
    if (answer.nodeId !== undefined && answer.nodeId !== sourceNodeId) continue;
    const value = answer.value as GroupAnswerValue;
    if (
      typeof value.groupId !== "string" ||
      typeof value.groupName !== "string" ||
      typeof value.result !== "string" ||
      !value.result.trim()
    ) continue;

    const previous = latestByGroup.get(value.groupId);
    if (!previous || answer.updatedAt.getTime() >= previous.updatedAt) {
      latestByGroup.set(value.groupId, {
        name: value.groupName,
        result: value.result.trim(),
        updatedAt: answer.updatedAt.getTime(),
      });
    }
  }

  return [...latestByGroup.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, "de"))
    .flatMap(([groupId, group]) => {
      const occurrences = new Map<string, number>();
      return group.result
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean)
        .map((text) => {
          const occurrence = occurrences.get(text) ?? 0;
          occurrences.set(text, occurrence + 1);
          return {
            id: createHash("sha256")
              .update(`${sourceNodeId}:${groupId}:${text}:${occurrence}`)
              .digest("hex")
              .slice(0, 24),
            text,
            groupName: group.name,
          };
        });
    });
}
