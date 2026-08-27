import { io, type Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents, SessionEvent } from "@mitrede/contracts";

const defaultHost = window.location.hostname || "localhost";
export const API_URL = import.meta.env.VITE_API_URL ?? `http://${defaultHost}:3300/api`;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? `http://${defaultHost}:3300`;

export function createClientId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    // randomUUID is unavailable on non-secure HTTP origins; use random bytes below.
  }
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type PresentationSummary = {
  id: string;
  title: string;
  status: string;
  nodeCount: number;
  pageCount: number;
  interactionCount: number;
  updatedAt: string;
};

export type PollConfig = {
  title?: string;
  eyebrow?: string;
  body?: string;
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
  assessmentMode?: "FEEDBACK" | "QUIZ";
  correctOptionIndex?: number;
  backgroundColor?: string;
  elements?: FreeformElement[];
  prompt?: string;
  resultPrompt?: string;
  maxGroups?: number;
  sourceGroupNodeId?: string | null;
  maxVotes?: number;
  maxVisibleResults?: number;
  durationMinutes?: number;
  maxAnswers?: number;
  statements?: string[];
};

export type FreeformTextElement = {
  id: string;
  type: "TEXT";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  color: string;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  listStyle?: "none" | "bullet" | "number";
};

export type FreeformImageElement = {
  id: string;
  type: "IMAGE";
  x: number;
  y: number;
  width: number;
  height: number;
  objectKey: string;
  objectFit: "contain" | "cover";
};

export type FreeformElement = FreeformTextElement | FreeformImageElement;

export type PresentationNode = {
  id: string;
  presentationId?: string;
  position: number;
  type: "PDF_PAGE" | "JOIN_PAGE" | "CONTENT_PAGE" | "FREEFORM_PAGE" | "GROUP_PAGE" | "GROUP_DISCUSSION" | "GROUP_PRESENTATION" | "PRIORITY_VOTE" | "MULTIPLE_CHOICE" | "RATING" | "WORD_CLOUD" | "OPEN_QUESTION" | "AI_SUMMARY";
  config: PollConfig;
  sourcePageNumber: number | null;
};

export type PresentationDetails = {
  id: string;
  title: string;
  revision: number;
  nodes: PresentationNode[];
};

export type AppSettings = {
  publicBaseUrl: string;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
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
  groups: Array<{ id: string; name: string; memberCount: number; memberNames: string[]; result: string; answers: string[]; completed: boolean }>;
  participantGroupId: string | null;
  groupPresentation: {
    activeIndex: number;
    total: number;
    activeGroup: { id: string; name: string; memberCount: number; memberNames: string[]; result: string; answers: string[]; completed: boolean } | null;
  } | null;
  discussionTimer: { running: boolean; remainingSeconds: number; endsAt: string | null } | null;
  priorityVote: {
    maxVotes: number;
    points: Array<{ id: string; text: string; groupName: string; count: number }>;
    selectedPointIds: string[];
  } | null;
  scaleVote: {
    options: string[];
    selectedOptionIndexes: number[];
    statements: Array<{ text: string; counts: number[]; total: number; average: number | null }>;
  } | null;
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
  assessmentMode?: "FEEDBACK" | "QUIZ";
  correctOptionIndex?: number;
  correctCount?: number;
  optionGroups?: string[];
  maxSelections?: number;
  scaleStatements?: Array<{ text: string; counts: number[]; total: number; average: number | null }>;
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
  groupDiscussions: Array<{
    nodeId: string;
    position: number;
    question: string;
    groups: Array<{ id: string; name: string; memberCount: number; result: string; answers: string[]; completed: boolean }>;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unbekannter Fehler" }));
    const message = Array.isArray(error.message) ? error.message.join(" ") : error.message;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (body: { email: string; password: string }) => request<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  me: () => request<{ user: AuthUser }>("/auth/me"),
  logout: () => request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),
  settings: () => request<AppSettings>("/settings"),
  updateSettings: (body: AppSettings) => request<AppSettings>("/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  listPresentations: () => request<PresentationSummary[]>("/presentations"),
  presentation: (id: string) => request<PresentationDetails>(`/presentations/${id}`),
  createPresentation: (title: string, file?: File) => {
    const form = new FormData();
    form.append("title", title);
    if (file) form.append("file", file);
    return request<PresentationSummary>("/presentations", { method: "POST", body: form });
  },
  deletePresentation: (presentationId: string) => request<{ removed: boolean; sessionIds: string[] }>(`/presentations/${presentationId}`, { method: "DELETE" }),
  startSession: (presentationId: string) =>
    request<SessionSnapshot>(`/presentations/${presentationId}/sessions`, { method: "POST" }),
  startPreviewSession: (presentationId: string) =>
    request<SessionSnapshot>(`/presentations/${presentationId}/preview-session`, { method: "POST" }),
  removePreviewSession: (sessionId: string) =>
    request<{ removed: boolean }>(`/sessions/${sessionId}/preview`, { method: "DELETE", keepalive: true }),
  sessionHistory: () => request<SessionHistoryItem[]>("/sessions"),
  sessionResults: (sessionId: string) => request<SessionResults>(`/sessions/${sessionId}/results`),
  endSession: (sessionId: string) => request<SessionResults>(`/sessions/${sessionId}/end`, { method: "POST" }),
  deleteSession: (sessionId: string) => request<{ removed: boolean }>(`/sessions/${sessionId}`, { method: "DELETE" }),
  sessionSnapshot: (sessionId: string) =>
    request<SessionSnapshot>(`/sessions/${sessionId}/snapshot`),
  roomSnapshot: (roomCode: string, participantToken?: string) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/snapshot${participantToken ? `?participantToken=${encodeURIComponent(participantToken)}` : ""}`),
  registerParticipant: (roomCode: string, body: { participantToken: string; displayName: string }) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  submitAnswer: (
    roomCode: string,
    body: { participantToken: string; nodeId: string; requestId: string; optionIndex?: number; scaleValues?: number[] },
  ) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  createGroup: (roomCode: string, body: { participantToken: string; nodeId: string; requestId: string; name: string }) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  joinGroup: (roomCode: string, groupId: string, body: { participantToken: string; nodeId: string; requestId: string }) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/groups/${encodeURIComponent(groupId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  leaveGroup: (roomCode: string, body: { participantToken: string; nodeId: string; requestId: string }) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/groups/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  submitGroupResult: (roomCode: string, groupId: string, body: { participantToken: string; nodeId: string; requestId: string; answers: string[]; completed: boolean }) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/groups/${encodeURIComponent(groupId)}/result`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  submitPriorityVote: (roomCode: string, body: { participantToken: string; nodeId: string; requestId: string; pointIds: string[] }) =>
    request<SessionSnapshot>(`/rooms/${roomCode}/priority-votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateSession: (
    sessionId: string,
    body: { interactionStatus?: SessionSnapshot["interactionStatus"]; resultsVisible?: boolean; currentNodeId?: string; timerAction?: "START" | "PAUSE" | "RESET" | "ADD_MINUTE"; activeGroupIndex?: number },
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
  addQuiz: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/polls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Welche Antwort ist richtig?", options: ["Antwort 1", "Antwort 2", "Antwort 3"], assessmentMode: "QUIZ", correctOptionIndex: 0, resultDisplayMode: "MANUAL" }),
    }),
  addRating: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Wie bewerten Sie die folgenden Aussagen?",
        statements: ["Aussage 1", "Aussage 2", "Aussage 3"],
        min: 1,
        max: 5,
        minLabel: "Sehr niedrig",
        maxLabel: "Sehr hoch",
        resultDisplayMode: "MANUAL",
      }),
    }),
  addJoinPage: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/join-pages`, { method: "POST" }),
  addContentPage: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/content-pages`, { method: "POST" }),
  addFreeformPage: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/freeform-pages`, { method: "POST" }),
  addFreeformTemplate: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/freeform-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "TITLE_BODY" }),
    }),
  addGroupPage: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/group-pages`, { method: "POST" }),
  addGroupDiscussion: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/group-discussions`, { method: "POST" }),
  addGroupPresentation: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/group-presentations`, { method: "POST" }),
  addPriorityVote: (presentationId: string) =>
    request<PresentationNode>(`/presentations/${presentationId}/priority-votes`, { method: "POST" }),
  uploadImage: (presentationId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ objectKey: string; originalName: string }>(`/presentations/${presentationId}/images`, { method: "POST", body: form });
  },
  updatePoll: (presentationId: string, nodeId: string, question: string, options: string[], resultDisplayMode: "MANUAL" | "LIVE", assessmentMode: "FEEDBACK" | "QUIZ" = "FEEDBACK", correctOptionIndex = 0) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, options, resultDisplayMode, assessmentMode, ...(assessmentMode === "QUIZ" ? { correctOptionIndex } : {}) }),
    }),
  updateRating: (
    presentationId: string,
    nodeId: string,
    body: { question: string; statements: string[]; min: number; max: number; minLabel: string; maxLabel: string; resultDisplayMode: "MANUAL" | "LIVE" },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/rating`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateContentPage: (
    presentationId: string,
    nodeId: string,
    body: { eyebrow?: string; title: string; body: string },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateFreeformPage: (
    presentationId: string,
    nodeId: string,
    body: { backgroundColor: string; elements: FreeformElement[] },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/freeform`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateGroupPage: (
    presentationId: string,
    nodeId: string,
    body: { question: string; prompt: string; resultPrompt: string; maxGroups: number },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/group`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateGroupPresentation: (
    presentationId: string,
    nodeId: string,
    body: { question: string; sourceGroupNodeId: string | null },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/group-presentation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateGroupDiscussion: (
    presentationId: string,
    nodeId: string,
    body: { question: string; prompt: string; resultPrompt: string; sourceGroupNodeId: string | null; durationMinutes: number; maxAnswers: number },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/group-discussion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updatePriorityVote: (
    presentationId: string,
    nodeId: string,
    body: { question: string; sourceGroupNodeId: string | null; maxVotes: number; maxVisibleResults: number; resultDisplayMode: "MANUAL" | "LIVE" },
  ) =>
    request<PresentationNode>(`/presentations/${presentationId}/nodes/${nodeId}/priority-vote`, {
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

export function imageAssetUrl(objectKey: string) {
  return `${API_URL}/assets/images/${encodeURIComponent(objectKey)}`;
}

export function connectToSession(
  sessionId: string,
  onChange: (event: SessionEvent) => void,
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

export function prepareProjectionWindow() {
  return window.open("/present/starting", "mitrede-projection", "popup=yes,width=1440,height=900");
}

export function showProjectionWindow(projectionWindow: Window | null, sessionId: string) {
  const path = `/present/${encodeURIComponent(sessionId)}`;
  if (projectionWindow && !projectionWindow.closed) {
    projectionWindow.location.replace(path);
    projectionWindow.focus();
    return;
  }
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
