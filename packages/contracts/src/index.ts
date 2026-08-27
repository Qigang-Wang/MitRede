import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "DRAFT",
  "LOBBY",
  "LIVE",
  "PAUSED",
  "ENDED",
]);

export const interactionStatusSchema = z.enum([
  "NOT_OPEN",
  "ACCEPTING",
  "LOCKED",
]);

export const nodeTypeSchema = z.enum([
  "PDF_PAGE",
  "JOIN_PAGE",
  "CONTENT_PAGE",
  "FREEFORM_PAGE",
  "GROUP_PAGE",
  "GROUP_DISCUSSION",
  "GROUP_PRESENTATION",
  "PRIORITY_VOTE",
  "MULTIPLE_CHOICE",
  "RATING",
  "WORD_CLOUD",
  "OPEN_QUESTION",
  "AI_SUMMARY",
]);

export const roomCodeSchema = z.string().regex(/^\d{6}$/);

export const sessionEventSchema = z.object({
  eventId: z.string().uuid(),
  sessionId: z.string(),
  stateVersion: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type InteractionStatus = z.infer<typeof interactionStatusSchema>;
export type NodeType = z.infer<typeof nodeTypeSchema>;
export type SessionEvent = z.infer<typeof sessionEventSchema>;

export interface SessionSnapshot {
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  interactionStatus: InteractionStatus;
  resultsVisible: boolean;
  stateVersion: number;
  currentNodeId: string | null;
}

export interface ServerToClientEvents {
  "session:snapshot": (snapshot: SessionSnapshot) => void;
  "session:event": (event: SessionEvent) => void;
}

export interface ClientToServerEvents {
  "session:join": (
    data: { sessionId: string; knownVersion?: number },
    acknowledge: (response: { accepted: boolean }) => void,
  ) => void;
}
