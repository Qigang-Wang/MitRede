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
  "WEB_PAGE",
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

export const presentationExportNodeSchema = z.object({
  sourceId: z.string().min(1).max(100),
  position: z.number().int().nonnegative(),
  type: nodeTypeSchema,
  sourcePageNumber: z.number().int().positive().nullable(),
  config: z.record(z.string(), z.unknown()),
});

export const presentationExportAssetSchema = z.object({
  objectKey: z.string().min(1).max(100),
  kind: z.enum(["PDF", "IMAGE"]),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(1),
});

export const presentationExportSchema = z.object({
  format: z.literal("mitrede.presentation"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  presentation: z.object({
    title: z.string().trim().min(1).max(200),
    nodes: z.array(presentationExportNodeSchema).max(2000),
  }),
  assets: z.array(presentationExportAssetSchema).max(2000),
});

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
export type PresentationExport = z.infer<typeof presentationExportSchema>;
export type SessionEvent = z.infer<typeof sessionEventSchema>;

export interface SessionSnapshot {
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  interactionStatus: InteractionStatus;
  resultsVisible: boolean;
  stateVersion: number;
  currentNodeId: string | null;
  participantCount: number;
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
