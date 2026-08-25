import type { InteractionStatus, SessionStatus } from "@mitrede/contracts";

const sessionTransitions: Record<SessionStatus, readonly SessionStatus[]> = {
  DRAFT: ["LOBBY"],
  LOBBY: ["LIVE", "ENDED"],
  LIVE: ["PAUSED", "ENDED"],
  PAUSED: ["LIVE", "ENDED"],
  ENDED: [],
};

const interactionTransitions: Record<
  InteractionStatus,
  readonly InteractionStatus[]
> = {
  NOT_OPEN: ["ACCEPTING"],
  ACCEPTING: ["LOCKED"],
  LOCKED: ["ACCEPTING"],
};

export function canTransitionSession(
  from: SessionStatus,
  to: SessionStatus,
): boolean {
  return sessionTransitions[from]?.includes(to) ?? false;
}

export function canTransitionInteraction(
  from: InteractionStatus,
  to: InteractionStatus,
): boolean {
  return interactionTransitions[from]?.includes(to) ?? false;
}
