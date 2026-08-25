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
  question: string;
  options: string[];
  maxSelections?: number;
};

export type SessionSnapshot = {
  sessionId: string;
  roomCode: string;
  status: string;
  interactionStatus: "NOT_OPEN" | "ACCEPTING" | "LOCKED";
  resultsVisible: boolean;
  stateVersion: number;
  presentation: { id: string; title: string };
  currentNode: { id: string; type: string; config: PollConfig } | null;
  results: { total: number; counts: number[] };
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
  createPresentation: (title: string, file: File) => {
    const form = new FormData();
    form.append("title", title);
    form.append("file", file);
    return request<PresentationSummary>("/presentations", { method: "POST", body: form });
  },
  startSession: (presentationId: string) =>
    request<SessionSnapshot>(`/presentations/${presentationId}/sessions`, { method: "POST" }),
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
    body: { interactionStatus?: SessionSnapshot["interactionStatus"]; resultsVisible?: boolean },
  ) =>
    request<SessionSnapshot>(`/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

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

