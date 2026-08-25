import { io, type Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@mitrede/contracts";

const defaultHost = window.location.hostname || "localhost";
export const API_URL = import.meta.env.VITE_API_URL ?? `http://${defaultHost}:3300/api`;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? `http://${defaultHost}:3300`;

export type PresentationSummary = {
  id: string;
  title: string;
  status: string;
  pageCount: number;
  interactionCount: number;
  updatedAt: string;
};

export type PollConfig = {
  question?: string;
  options?: string[];
  maxSelections?: number;
  objectKey?: string;
  originalName?: string;
  pageNumber?: number;
  resultDisplayMode?: "MANUAL" | "LIVE";
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
};

export type PresentationNode = {
  id: string;
  presentationId?: string;
  position: number;
  type: "PDF_PAGE" | "MULTIPLE_CHOICE" | "RATING" | "WORD_CLOUD" | "OPEN_QUESTION" | "AI_SUMMARY";
  config: PollConfig;
  sourcePageNumber: number | null;
};

export type PresentationDetails = {
  id: string;
  title: string;
  revision: number;
  nodes: PresentationNode[];
};

export type SessionSnapshot = {
  sessionId: string;
  roomCode: string;
  status: string;
  interactionStatus: "NOT_OPEN" | "ACCEPTING" | "LOCKED";
  resultsVisible: boolean;
  stateVersion: number;
  presentation: { id: string; title: string };
  currentNode: PresentationNode | null;
  timeline?: PresentationNode[];
  results: { total: number; counts: number[] };
};

export type SessionHistoryItem = {
  id: string;
  roomCode: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  presentation: { id: string; title: string };
  participantCount: number;
  answerCount: number;
  interactionCount: number;
};

export type SessionQuestionResult = {
  nodeId: string;
  position: number;
  type: PresentationNode["type"];
  question: string;
  options: string[];
  total: number;
  counts: number[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
};

export type SessionResults = {
  sessionId: string;
  roomCode: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  presentation: { id: string; title: string };
  participantCount: number;
  answerCount: number;
  questions: SessionQuestionResult[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unbekannter Fehler" }));
    const message = Array.isArray(error.message) ? error.message.join(" ") : error.message;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listPresentations: () => request<PresentationSummary[]>("/presentations"),
  presentation: (id: string) => request<PresentationDetails>(`/presentations/${id}`),
  createPresentation: (title: string, file: File) => {
    const form = new FormData();
    form.append("title", title);
    form.append("file", file);
    return request<PresentationSummary>("/presentations", { method: "POST", body: form });
  },
  startSession: (presentationId: string) =>
    request<SessionSnapshot>(`/presentations/${presentationId}/sessions`, { method: "POST" }),
  sessionHistory: () => request<SessionHistoryItem[]>("/sessions"),
  sessionResults: (sessionId: string) => request<SessionResults>(`/sessions/${sessionId}/results`),
  endSession: (sessionId: string) => request<SessionResults>(`/sessions/${sessionId}/end`, { method: "POST" }),
  sessionSnapshot: (sessionId: string) =>
    request<SessionSnapshot>(`/sessions/${sessionId}/snapshot`),
  roomSnapshot: (roomCode: string) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/snapshot`),
  submitAnswer: (
    roomCode: string,
    body: { participantToken: string; nodeId: string; requestId: string; optionIndex: number },
  ) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateSession: (
    sessionId: string,
    body: { interactionStatus?: SessionSnapshot["interactionStatus"]; resultsVisible?: boolean; currentNodeId?: string },
  ) =>
    request<SessionSnapshot>(`/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  addPoll: (presentationId: string, question = "Neue Frage", options = ["Option 1", "Option 2"]) =>
    request<PresentationNode>(`/presentations/${presentationId}/polls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, options }),
    }),
  addRating: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Wie bewerten Sie diesen Aspekt?",
        min: 1,
        max: 5,
        minLabel: "Sehr niedrig",
        maxLabel: "Sehr hoch",
        resultDisplayMode: "MANUAL",
      }),
    }),
  updatePoll: (presentationId: string, nodeId: string, question: string, options: string[], resultDisplayMode: "MANUAL" | "LIVE") =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, options, resultDisplayMode }),
    }),
  updateRating: (
    presentationId: string,
    nodeId: string,
    body: { question: string; min: number; max: number; minLabel: string; maxLabel: string; resultDisplayMode: "MANUAL" | "LIVE" },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/rating`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  duplicateNode: (presentationId: string, nodeId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/duplicate`, { method: "POST" }),
  deleteNode: (presentationId: string, nodeId: string) =>
    request<{ deleted: boolean }>(`/presentations/${presentationId}/nodes/${nodeId}`, { method: "DELETE" }),
  reorderNodes: (presentationId: string, nodeIds: string[]) =>
    request<PresentationDetails>(`/presentations/${presentationId}/nodes/order`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeIds }),
    }),
};

export function pdfAssetUrl(objectKey: string) {
  return `${API_URL}/assets/pdfs/${encodeURIComponent(objectKey)}`;
}

export function connectToSession(
  sessionId: string,
  onChange: () => void,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
    `${SOCKET_URL}/sessions`,
    { transports: ["websocket", "polling"] },
  );
  socket.on("connect", () => {
    socket.emit("session:join", { sessionId }, () => undefined);
  });
  socket.on("session:event", onChange);
  return socket;
}
