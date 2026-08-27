import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  Fullscreen,
  Lock,
  LogOut,
  MessageCircleMore,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Radio,
  QrCode,
  RotateCcw,
  Save,
  Plus,
  Trash2,
  Smartphone,
  UsersRound,
  UserPlus,
  Vote,
  X,
} from "lucide-react";
import { api, connectToSession, type PresentationDetails, type PresentationNode, type SessionSnapshot } from "./api";
import { FreeformPageRenderer } from "./FreeformPage";
import { PdfPageCanvas, usePdfPageAspectRatio } from "./PdfPage";
import { QRCodeSVG } from "qrcode.react";
import { calculateRatingAverage, RatingDistribution, RatingScaleInput, RatingScaleRail } from "./RatingScale";

type InteractionStatus = "NOT_OPEN" | "ACCEPTING" | "LOCKED";
type PreviewMember = { id: string; name: string };
type PreviewGroup = { id: string; name: string; members: PreviewMember[]; answers: string[]; completed: boolean };
type PreviewPriorityPoint = { id: string; text: string; groupName: string; count: number };
type PreviewGroupSimulation = {
  groups: PreviewGroup[];
  currentGroupId: string | null;
  participantName: string;
  formOpen: boolean;
  groupName: string;
  error: string;
  maxGroups: number;
  onParticipantNameChange: (name: string) => void;
  onGroupNameChange: (name: string) => void;
  onToggleForm: () => void;
  onCreate: () => void;
  onJoin: (groupId: string) => void;
  onLeave: () => void;
  onAnswersChange: (answers: string[]) => void;
  onCompletedChange: (completed: boolean) => void;
};

function initialPreviewGroups(): PreviewGroup[] {
  return [
    { id: "preview-green", name: "Gruppe Grün", members: [{ id: "preview-you", name: "Alex" }, { id: "preview-anna", name: "Anna" }, { id: "preview-ben", name: "Ben" }, { id: "preview-clara", name: "Clara" }], answers: ["Eine gemeinsame Lösung entwickeln", "Nächste Schritte dokumentieren"], completed: true },
    { id: "preview-blue", name: "Gruppe Blau", members: [{ id: "preview-daria", name: "Daria" }, { id: "preview-emil", name: "Emil" }, { id: "preview-fatma", name: "Fatma" }], answers: ["Zuständigkeiten klar verteilen"], completed: false },
  ];
}

function priorityPointsFromPreviewGroups(groups: PreviewGroup[], submittedPointIds: string[]): PreviewPriorityPoint[] {
  const submitted = new Set(submittedPointIds);
  return groups.flatMap((group) => group.answers
    .map((answer, index) => ({ answer: answer.trim(), index }))
    .filter(({ answer }) => answer.length > 0)
    .map(({ answer, index }) => {
      const id = `${group.id}:${index}:${answer}`;
      return { id, text: answer, groupName: group.name, count: submitted.has(id) ? 1 : 0 };
    }));
}

function usePreviewDiscussionSeconds(timer: SessionSnapshot["discussionTimer"]) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!timer?.running || !timer.endsAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer?.endsAt, timer?.running]);
  if (!timer) return 0;
  return timer.running && timer.endsAt ? Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000)) : timer.remainingSeconds;
}

function previewPresentationId() {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[1] ?? "");
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function seedCounts(optionCount: number) {
  const samples = [8, 5, 3, 2, 1, 1, 0, 0];
  return Array.from({ length: optionCount }, (_, index) => samples[index] ?? 0);
}

function ResultBars({ options, counts, compact = false, rating = false, correctOptionIndex }: { options: string[]; counts: number[]; compact?: boolean; rating?: boolean; correctOptionIndex?: number }) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return (
    <div className={compact ? "preview-results compact" : "preview-results"}>
      {options.map((option, index) => {
        const count = counts[index] ?? 0;
        const percentage = total ? Math.round((count / total) * 100) : 0;
        return (
          <div className={correctOptionIndex === index ? "preview-result-row correct" : "preview-result-row"} key={`${index}-${option}`}>
            {!compact && <span className="preview-result-letter">{rating ? option : String.fromCharCode(65 + index)}</span>}
            <div className="preview-result-data">
              <div><strong>{option}{correctOptionIndex === index && <Check size={compact ? 11 : 15} />}</strong><span>{compact ? `${percentage}%` : `${count} Stimmen · ${percentage}%`}</span></div>
              <i><b style={{ width: `${percentage}%` }} /></i>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PhonePreview({
  node,
  status,
  resultsVisible,
  counts,
  selectedOption,
  submittedOption,
  onSelect,
  onSubmit,
  onReset,
  groupSimulation,
  discussionTimer,
  discussionSeconds,
  groupPresentation,
  priorityPoints,
  prioritySelectedIds,
  prioritySubmittedIds,
  onPriorityToggle,
  onPrioritySubmit,
  scaleSelections,
  scaleSubmittedValues,
  onScaleSelect,
  onScaleSubmit,
}: {
  node: PresentationNode | null;
  status: InteractionStatus;
  resultsVisible: boolean;
  counts: number[];
  selectedOption: number | null;
  submittedOption: number | null;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  onReset: () => void;
  groupSimulation: PreviewGroupSimulation;
  discussionTimer: SessionSnapshot["discussionTimer"];
  discussionSeconds: number;
  groupPresentation: SessionSnapshot["groupPresentation"];
  priorityPoints: PreviewPriorityPoint[];
  prioritySelectedIds: string[];
  prioritySubmittedIds: string[];
  onPriorityToggle: (pointId: string) => void;
  onPrioritySubmit: () => void;
  scaleSelections: number[];
  scaleSubmittedValues: number[];
  onScaleSelect: (statementIndex: number, optionIndex: number) => void;
  onScaleSubmit: () => void;
}) {
  const isPdf = node?.type === "PDF_PAGE";
  const isJoinPage = node?.type === "JOIN_PAGE";
  const isContentPage = node?.type === "CONTENT_PAGE";
  const isFreeformPage = node?.type === "FREEFORM_PAGE";
  const isGroupPage = node?.type === "GROUP_PAGE";
  const isGroupDiscussion = node?.type === "GROUP_DISCUSSION";
  const isGroupPresentation = node?.type === "GROUP_PRESENTATION";
  const isPriorityPage = node?.type === "PRIORITY_VOTE";
  const isRating = node?.type === "RATING";
  const isMultiScale = isRating && (node?.config.statements?.length ?? 0) > 1;
  const isQuiz = node?.config.assessmentMode === "QUIZ";
  const correctOptionIndex = resultsVisible ? node?.config.correctOptionIndex : undefined;
  const options = node?.config.options ?? [];
  const ratingAverage = isRating ? calculateRatingAverage(options, counts, counts.reduce((sum, count) => sum + count, 0)) : null;
  const discussionMaxAnswers = Math.max(0, Number(node?.config.maxAnswers ?? 0));
  const currentPreviewGroup = groupSimulation.groups.find((group) => group.id === groupSimulation.currentGroupId) ?? null;
  return (
    <div className="preview-phone-device">
      <div className="phone-speaker" />
      <div className="preview-phone-screen">
        <header className="preview-phone-header">
          <span><MessageCircleMore size={16} /> MitRede</span>
          <small><i /> VORSCHAU</small>
        </header>
        <main className="preview-phone-content">
          {isGroupPresentation ? (
            <div className="preview-phone-group-presentation">{groupPresentation?.activeGroup ? <><span>GRUPPE {groupPresentation.activeIndex + 1} VON {groupPresentation.total}</span><h2>{groupPresentation.activeGroup.name} präsentiert</h2><p>{groupPresentation.activeGroup.memberNames.join(" · ")}</p><div>{groupPresentation.activeGroup.answers.map((answer, index) => <article key={index}><b>{index + 1}</b><span>{answer}</span></article>)}</div></> : <><UsersRound size={28} /><h2>Noch keine Gruppenergebnisse</h2><p>Die Moderation wählt eine Gruppe aus.</p></>}</div>
          ) : isPriorityPage ? (
            <div className="preview-phone-priority"><h2>{node?.config.question}</h2><p>{status === "ACCEPTING" ? `Wählen Sie bis zu ${node?.config.maxVotes ?? 3} unterschiedliche Punkte.` : "Die Priorisierung ist geschlossen."}</p>{priorityPoints.length ? <div>{priorityPoints.map((point, index) => { const selected = prioritySelectedIds.includes(point.id); const limitReached = prioritySelectedIds.length >= (node?.config.maxVotes ?? 3); return <button className={selected ? "selected" : ""} key={point.id} disabled={status !== "ACCEPTING" || (!selected && limitReached)} onClick={() => onPriorityToggle(point.id)}>{selected ? <Check size={13} /> : <b>{index + 1}</b>}<span><strong>{point.text}</strong><small>{point.groupName}</small></span>{resultsVisible && <em>{point.count}</em>}</button>; })}</div> : <div className="preview-phone-priority-empty"><Vote size={22} /><strong>Noch keine Antworten</strong><small>Erfassen Sie zuerst Antworten in der Gruppendiskussion.</small></div>}<button className="btn btn-primary" disabled={status !== "ACCEPTING" || prioritySelectedIds.length === 0 || priorityPoints.length === 0} onClick={onPrioritySubmit}>{prioritySubmittedIds.length > 0 && prioritySubmittedIds.join("|") === prioritySelectedIds.join("|") ? <><Check size={13} /> Stimmen gespeichert</> : `${prioritySelectedIds.length} ${prioritySelectedIds.length === 1 ? "Stimme" : "Stimmen"} abgeben`}</button></div>
          ) : isMultiScale ? (
            <div className="preview-phone-multi-scale"><h2>{node?.config.question}</h2><p>{status === "ACCEPTING" ? "Bewerten Sie jede Aussage." : "Die Bewertung ist geschlossen."}</p><div>{node?.config.statements?.map((statement, statementIndex) => <article key={statementIndex}><header><strong>{statement}</strong>{resultsVisible && Number.isInteger(scaleSubmittedValues[statementIndex]) && <b>Ø {Number(options[scaleSubmittedValues[statementIndex] ?? -1]).toFixed(1)}</b>}</header><RatingScaleInput options={options} selectedIndex={scaleSelections[statementIndex]} minLabel={node?.config.minLabel} maxLabel={node?.config.maxLabel} disabled={status !== "ACCEPTING"} compact ariaLabel={statement} onChange={(optionIndex) => onScaleSelect(statementIndex, optionIndex)} /></article>)}</div><button className="btn btn-primary" disabled={status !== "ACCEPTING" || !(node?.config.statements?.every((_, index) => Number.isInteger(scaleSelections[index])) ?? false)} onClick={onScaleSubmit}>{scaleSubmittedValues.length ? <><Check size={13} /> Bewertungen gespeichert</> : "Bewertungen senden"}</button></div>
          ) : isGroupPage ? (
            <div className="preview-phone-group"><h2>{node?.config.question}</h2><p>{node?.config.prompt}</p><div>{groupSimulation.groups.map((group) => <article className={group.id === groupSimulation.currentGroupId ? "current" : ""} key={group.id}><UsersRound size={15} /><strong>{group.name}</strong><small title={group.members.map((member) => member.name).join(", ")}>{group.members.length} {group.members.length === 1 ? "Mitglied" : "Mitglieder"} · {group.members.map((member) => member.name).join(", ")}</small><button className={group.id === groupSimulation.currentGroupId ? "leave" : ""} disabled={status !== "ACCEPTING"} onClick={() => group.id === groupSimulation.currentGroupId ? groupSimulation.onLeave() : groupSimulation.onJoin(group.id)}>{group.id === groupSimulation.currentGroupId ? <><LogOut size={12} /> Verlassen</> : "Beitreten"}</button></article>)}</div>{groupSimulation.formOpen ? <form className="preview-group-create-form" onSubmit={(event) => { event.preventDefault(); groupSimulation.onCreate(); }}><label>Ihr Name<input maxLength={40} value={groupSimulation.participantName} onChange={(event) => groupSimulation.onParticipantNameChange(event.target.value)} /></label><label>Gruppenname<input autoFocus maxLength={60} value={groupSimulation.groupName} onChange={(event) => groupSimulation.onGroupNameChange(event.target.value)} placeholder="z. B. Team Gelb" /></label>{groupSimulation.error && <p>{groupSimulation.error}</p>}<div><button type="button" onClick={groupSimulation.onToggleForm}>Abbrechen</button><button type="submit" disabled={status !== "ACCEPTING" || !groupSimulation.groupName.trim()}>Erstellen</button></div></form> : <button className="preview-create-group" disabled={status !== "ACCEPTING" || groupSimulation.groups.length >= groupSimulation.maxGroups} onClick={groupSimulation.onToggleForm}><UserPlus size={14} /> Eigene Gruppe erstellen</button>}</div>
          ) : isGroupDiscussion ? (
            <div className="preview-phone-discussion"><h2>{node?.config.question}</h2>{discussionTimer && <div className={discussionSeconds === 0 ? "preview-phone-discussion-timer expired" : "preview-phone-discussion-timer"}><Clock3 size={14} /><strong>{String(Math.floor(discussionSeconds / 60)).padStart(2, "0")}:{String(discussionSeconds % 60).padStart(2, "0")}</strong><small>{discussionTimer.running ? "Verbleibende Zeit" : discussionSeconds === 0 ? "Zeit abgelaufen" : "Pausiert"}</small></div>}{currentPreviewGroup ? <><header><UsersRound size={15} /><div><strong>{currentPreviewGroup.name}</strong><small>{currentPreviewGroup.members.map((member) => member.name).join(" · ")}</small></div><b className={currentPreviewGroup.completed ? "done" : ""}>{currentPreviewGroup.completed ? "Fertig" : "In Arbeit"}</b></header><label>Antworten Ihrer Gruppe</label><div className="preview-discussion-answers">{currentPreviewGroup.answers.map((answer, index) => <div key={index}><span>{index + 1}</span><textarea rows={2} disabled={status !== "ACCEPTING"} value={answer} onChange={(event) => groupSimulation.onAnswersChange(currentPreviewGroup.answers.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><button disabled={currentPreviewGroup.answers.length === 1} onClick={() => groupSimulation.onAnswersChange(currentPreviewGroup.answers.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={11} /></button></div>)}</div>{(discussionMaxAnswers === 0 || currentPreviewGroup.answers.length < discussionMaxAnswers) && <button className="preview-discussion-add" onClick={() => groupSimulation.onAnswersChange([...currentPreviewGroup.answers, ""])}><Plus size={11} /> Antwort</button>}<div className="preview-discussion-actions"><button><Save size={12} /> Speichern</button><button className={currentPreviewGroup.completed ? "done" : ""} onClick={() => groupSimulation.onCompletedChange(!currentPreviewGroup.completed)}><Check size={12} /> {currentPreviewGroup.completed ? "Weiter" : "Fertig"}</button></div></> : <div className="preview-discussion-missing"><UsersRound size={24} /><strong>Keine Gruppe ausgewählt</strong></div>}</div>
          ) : isPdf || isJoinPage || isContentPage || isFreeformPage ? (
            <div className="preview-phone-wait">
              {isJoinPage ? <QrCode size={34} /> : <FileText size={34} />}
              <span>{isJoinPage ? "BEREIT ZUR TEILNAHME" : isContentPage || isFreeformPage ? "INHALT AUF DER LEINWAND" : "PRÄSENTATION LÄUFT"}</span>
              <h2>{isJoinPage ? "Scannen Sie den QR-Code auf der Leinwand." : "Folgen Sie der Präsentation auf der Leinwand."}</h2>
              <p>{isJoinPage ? "Danach erscheinen Fragen automatisch hier." : "Die nächste Interaktion erscheint automatisch hier."}</p>
            </div>
          ) : status === "NOT_OPEN" ? (
            <div className="preview-phone-wait">
              <Radio size={34} />
              <span>GLEICH GEHT ES LOS</span>
              <h2>Die Abstimmung ist noch nicht geöffnet.</h2>
              <p>Warten Sie auf die Freigabe durch die Moderation.</p>
            </div>
          ) : status === "LOCKED" && submittedOption === null ? (
            <div className="preview-phone-wait">
              <Lock size={34} />
              <span>ABSTIMMUNG BEENDET</span>
              <h2>Antworten sind nicht mehr möglich.</h2>
              <p>Die Moderation hat die Abstimmung geschlossen.</p>
              {resultsVisible && (isRating ? <RatingScaleRail min={Number(options[0] ?? 1)} max={Number(options.at(-1) ?? 5)} minLabel={node?.config.minLabel} maxLabel={node?.config.maxLabel} value={ratingAverage} valuePrefix="Ø " counts={counts} compact /> : <ResultBars options={options} counts={counts} compact correctOptionIndex={correctOptionIndex} />)}
            </div>
          ) : submittedOption !== null ? (
            <div className="preview-phone-response">
              <div className="preview-answer-check"><Check size={24} /></div>
              <span>ANTWORT GESENDET</span>
              <h2>Vielen Dank!</h2>
              <p>Ihre Auswahl: <strong>{options[submittedOption]}</strong></p>
              {isQuiz && correctOptionIndex !== undefined && <div className={submittedOption === correctOptionIndex ? "quiz-feedback correct" : "quiz-feedback incorrect"}><strong>{submittedOption === correctOptionIndex ? "Richtig!" : "Nicht ganz."}</strong>{submittedOption !== correctOptionIndex && <span>Richtig ist: {options[correctOptionIndex]}</span>}</div>}
              {status === "ACCEPTING" && <button className="preview-phone-link" onClick={onReset}><RotateCcw size={14} /> Antwort ändern</button>}
              {resultsVisible && (isRating ? <RatingScaleRail min={Number(options[0] ?? 1)} max={Number(options.at(-1) ?? 5)} minLabel={node?.config.minLabel} maxLabel={node?.config.maxLabel} value={ratingAverage} valuePrefix="Ø " counts={counts} compact /> : <ResultBars options={options} counts={counts} compact correctOptionIndex={correctOptionIndex} />)}
            </div>
          ) : (
            <div className="preview-phone-poll">
              <h2>{node?.config.question ?? "Neue Frage"}</h2>
              <p>{isRating ? "Wählen Sie eine Bewertung" : "Eine Antwort auswählen"}</p>
              {isRating ? <RatingScaleInput options={options} selectedIndex={selectedOption} minLabel={node?.config.minLabel} maxLabel={node?.config.maxLabel} ariaLabel={node?.config.question ?? "Bewertung"} onChange={onSelect} /> : <div className="preview-phone-options">{options.map((option, index) => <button className={selectedOption === index ? "selected" : ""} key={`${index}-${option}`} onClick={() => onSelect(index)}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{selectedOption === index && <Check size={16} />}</button>)}</div>}
              <button className="btn btn-primary preview-phone-submit" disabled={selectedOption === null} onClick={onSubmit}>Antwort senden</button>
            </div>
          )}
        </main>
        <footer>Simuliert · Wird nicht gespeichert</footer>
      </div>
    </div>
  );
}

export default function PreviewView() {
  const presentationId = previewPresentationId();
  const requestedNodeId = useMemo(() => new URLSearchParams(window.location.search).get("node"), []);
  const [presentation, setPresentation] = useState<PresentationDetails | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<InteractionStatus>("NOT_OPEN");
  const [resultsVisible, setResultsVisible] = useState(false);
  const [phoneVisible, setPhoneVisible] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedOption, setSubmittedOption] = useState<number | null>(null);
  const [counts, setCounts] = useState<number[]>([]);
  const [previewPrioritySelectedIds, setPreviewPrioritySelectedIds] = useState<string[]>([]);
  const [previewPrioritySubmittedIds, setPreviewPrioritySubmittedIds] = useState<string[]>([]);
  const [previewScaleSelections, setPreviewScaleSelections] = useState<number[]>([]);
  const [previewScaleSubmittedValues, setPreviewScaleSubmittedValues] = useState<number[]>([]);
  const [previewGroups, setPreviewGroups] = useState<PreviewGroup[]>(initialPreviewGroups);
  const [previewParticipantName, setPreviewParticipantName] = useState("Alex");
  const [previewParticipantGroupId, setPreviewParticipantGroupId] = useState<string | null>("preview-green");
  const [previewGroupFormOpen, setPreviewGroupFormOpen] = useState(false);
  const [previewGroupName, setPreviewGroupName] = useState("");
  const [previewGroupError, setPreviewGroupError] = useState("");
  const [previewSession, setPreviewSession] = useState<SessionSnapshot | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState(window.location.origin);
  const [error, setError] = useState("");
  const [projectorSize, setProjectorSize] = useState({ width: 0, height: 0 });
  const projectorRef = useRef<HTMLDivElement>(null);
  const previewSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    void api.presentation(presentationId).then((next) => {
      setPresentation(next);
      const requestedIndex = requestedNodeId ? next.nodes.findIndex((node) => node.id === requestedNodeId) : -1;
      setCurrentIndex(requestedIndex >= 0 ? requestedIndex : 0);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Vorschau konnte nicht geladen werden"));
  }, [presentationId, requestedNodeId]);

  useEffect(() => {
    let active = true;
    void api.settings().then((settings) => { if (active) setPublicBaseUrl(settings.publicBaseUrl || window.location.origin); }).catch(() => undefined);
    void api.startPreviewSession(presentationId).then(async (session) => {
      const selectedSession = requestedNodeId && session.timeline?.some((node) => node.id === requestedNodeId)
        ? await api.updateSession(session.sessionId, { currentNodeId: requestedNodeId })
        : session;
      if (!active) {
        await api.removePreviewSession(selectedSession.sessionId).catch(() => undefined);
        return;
      }
      previewSessionIdRef.current = selectedSession.sessionId;
      setPreviewSession(selectedSession);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Vorschau-Raum konnte nicht erstellt werden"); });
    return () => {
      active = false;
      const sessionId = previewSessionIdRef.current;
      previewSessionIdRef.current = null;
      if (sessionId) void api.removePreviewSession(sessionId).catch(() => undefined);
    };
  }, [presentationId, requestedNodeId]);

  useEffect(() => {
    if (!previewSession?.sessionId) return;
    const sessionId = previewSession.sessionId;
    const socket = connectToSession(sessionId, () => void api.sessionSnapshot(sessionId).then(setPreviewSession).catch(() => undefined));
    return () => { socket.disconnect(); };
  }, [previewSession?.sessionId]);

  const currentNode = presentation?.nodes[currentIndex] ?? null;
  const options = currentNode?.config.options ?? [];
  const isPdf = currentNode?.type === "PDF_PAGE";
  const isJoinPage = currentNode?.type === "JOIN_PAGE";
  const isContentPage = currentNode?.type === "CONTENT_PAGE";
  const isFreeformPage = currentNode?.type === "FREEFORM_PAGE";
  const isGroupPage = currentNode?.type === "GROUP_PAGE";
  const isGroupDiscussion = currentNode?.type === "GROUP_DISCUSSION";
  const isGroupPresentation = currentNode?.type === "GROUP_PRESENTATION";
  const isPriorityPage = currentNode?.type === "PRIORITY_VOTE";
  const isStaticPage = isPdf || isJoinPage || isContentPage || isFreeformPage;
  const isRating = currentNode?.type === "RATING";
  const isMultiScale = isRating && (currentNode?.config.statements?.length ?? 0) > 1;
  const isQuiz = currentNode?.config.assessmentMode === "QUIZ";
  const referencePdf = presentation?.nodes.find((node) => node.type === "PDF_PAGE" && node.config.objectKey && node.config.pageNumber);
  const slideAspectRatio = usePdfPageAspectRatio(referencePdf?.config.objectKey, referencePdf?.config.pageNumber);
  const pollWidth = Math.min(projectorSize.width, projectorSize.height * slideAspectRatio);
  const pollHeight = pollWidth / slideAspectRatio;
  const total = counts.reduce((sum, count) => sum + count, 0);
  const projectionPreviewGroups: PreviewGroup[] = (() => {
    if (!previewSession || previewSession.currentNode?.id !== currentNode?.id || !previewSession.groups.length) return previewGroups;
    return previewSession.groups.map((group) => ({ id: group.id, name: group.name, members: group.memberNames.map((name, index) => ({ id: `${group.id}-${index}`, name })), answers: group.answers, completed: group.completed }));
  })();
  const previewPriorityPoints = priorityPointsFromPreviewGroups(projectionPreviewGroups, previewPrioritySubmittedIds);
  const rankedPreviewPriorityPoints = [...previewPriorityPoints].sort((a, b) => b.count - a.count || a.groupName.localeCompare(b.groupName, "de") || a.text.localeCompare(b.text, "de"));
  const visiblePreviewPriorityPoints = rankedPreviewPriorityPoints.slice(0, Math.min(10, Math.max(1, Number(currentNode?.config.maxVisibleResults ?? 5))));
  const previewPriorityMaxCount = Math.max(1, ...rankedPreviewPriorityPoints.map((point) => point.count));
  const previewPriorityVoterCount = previewPrioritySubmittedIds.length > 0 ? 1 : 0;
  const previewGroupMemberTotal = projectionPreviewGroups.reduce((sum, group) => sum + group.members.length, 0);
  const previewMaxGroups = Math.min(20, Math.max(2, Number(currentNode?.config.maxGroups ?? 8)));
  const previewRoomCode = previewSession?.roomCode ?? "------";
  const formattedPreviewRoomCode = previewSession ? `${previewRoomCode.slice(0, 3)} ${previewRoomCode.slice(3)}` : "--- ---";
  const previewJoinUrl = `${publicBaseUrl}/join/${previewRoomCode}`;
  const previewPublicHost = (() => { try { return new URL(publicBaseUrl).host; } catch { return window.location.host; } })();
  const ratingAverage = calculateRatingAverage(options, counts, total);
  const previewDiscussionSeconds = usePreviewDiscussionSeconds(previewSession?.discussionTimer ?? null);

  useEffect(() => {
    const projector = projectorRef.current;
    if (!projector) return;
    let animationFrame = 0;
    const updateSize = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const next = { width: projector.clientWidth, height: projector.clientHeight };
        setProjectorSize((current) => current.width === next.width && current.height === next.height ? current : next);
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(projector);
    document.addEventListener("fullscreenchange", updateSize);
    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", updateSize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [presentation]);

  useEffect(() => {
    setStatus(currentNode?.type === "MULTIPLE_CHOICE" || currentNode?.type === "RATING" || currentNode?.type === "GROUP_PAGE" || currentNode?.type === "GROUP_DISCUSSION" || currentNode?.type === "PRIORITY_VOTE" ? "ACCEPTING" : "NOT_OPEN");
    setResultsVisible(currentNode?.config.resultDisplayMode === "LIVE");
    setSelectedOption(null);
    setSubmittedOption(null);
    setPreviewPrioritySelectedIds([]);
    setPreviewPrioritySubmittedIds([]);
    setPreviewScaleSelections([]);
    setPreviewScaleSubmittedValues([]);
    setCounts(seedCounts(options.length));
    if (currentNode) {
      window.history.replaceState({}, "", `/preview/${presentationId}?node=${encodeURIComponent(currentNode.id)}`);
      if (previewSession?.sessionId && previewSession.currentNode?.id !== currentNode.id) {
        void api.updateSession(previewSession.sessionId, { currentNodeId: currentNode.id }).then(setPreviewSession).catch(() => undefined);
      }
    }
  }, [currentNode?.id, options.length, presentationId, previewSession?.sessionId]);

  const move = useCallback((offset: number) => {
    if (!presentation) return;
    setCurrentIndex((index) => Math.max(0, Math.min(presentation.nodes.length - 1, index + offset)));
  }, [presentation]);

  const exitPreview = useCallback(() => {
    const previewSessionId = previewSessionIdRef.current;
    previewSessionIdRef.current = null;
    if (previewSessionId) void api.removePreviewSession(previewSessionId).catch(() => undefined);
    const nodeQuery = currentNode ? `?node=${encodeURIComponent(currentNode.id)}` : "";
    go(`/app/presentations/${presentationId}/edit${nodeQuery}`);
  }, [currentNode, presentationId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      if (event.key === "Escape" && !document.fullscreenElement) exitPreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitPreview, move]);

  function submitAnswer() {
    if (selectedOption === null || status !== "ACCEPTING") return;
    setCounts((current) => current.map((count, index) => count + (index === selectedOption ? 1 : 0)));
    setSubmittedOption(selectedOption);
  }

  function resetAnswer() {
    if (submittedOption !== null) {
      setCounts((current) => current.map((count, index) => Math.max(0, count - (index === submittedOption ? 1 : 0))));
    }
    setSubmittedOption(null);
    setSelectedOption(null);
  }

  function togglePreviewPriorityPoint(pointId: string) {
    if (status !== "ACCEPTING") return;
    const maxVotes = Math.min(10, Math.max(1, Number(currentNode?.config.maxVotes ?? 3)));
    setPreviewPrioritySelectedIds((current) => current.includes(pointId)
      ? current.filter((id) => id !== pointId)
      : current.length < maxVotes ? [...current, pointId] : current);
  }

  function submitPreviewPriorityVote() {
    if (status !== "ACCEPTING" || previewPrioritySelectedIds.length === 0) return;
    setPreviewPrioritySubmittedIds(previewPrioritySelectedIds);
  }

  function selectPreviewScale(statementIndex: number, optionIndex: number) {
    if (status !== "ACCEPTING") return;
    setPreviewScaleSelections((current) => { const next = [...current]; next[statementIndex] = optionIndex; return next; });
  }

  function submitPreviewScale() {
    const statements = currentNode?.config.statements ?? [];
    if (status !== "ACCEPTING" || !statements.every((_, index) => Number.isInteger(previewScaleSelections[index]))) return;
    setPreviewScaleSubmittedValues([...previewScaleSelections]);
  }

  function renamePreviewParticipant(name: string) {
    setPreviewParticipantName(name);
    setPreviewGroups((groups) => groups.map((group) => ({
      ...group,
      members: group.members.map((member) => member.id === "preview-you" ? { ...member, name: name.trim() || "Sie" } : member),
    })));
  }

  function joinPreviewGroup(groupId: string) {
    const member = { id: "preview-you", name: previewParticipantName.trim() || "Sie" };
    setPreviewGroups((groups) => groups.map((group) => ({
      ...group,
      members: group.id === groupId
        ? [...group.members.filter((item) => item.id !== member.id), member]
        : group.members.filter((item) => item.id !== member.id),
    })));
    setPreviewParticipantGroupId(groupId);
    setPreviewGroupError("");
  }

  function leavePreviewGroup() {
    setPreviewGroups((groups) => groups.map((group) => ({
      ...group,
      members: group.members.filter((member) => member.id !== "preview-you"),
    })).filter((group) => group.members.length > 0));
    setPreviewParticipantGroupId(null);
    setPreviewGroupError("");
  }

  function updatePreviewGroupAnswers(answers: string[]) {
    if (!previewParticipantGroupId) return;
    setPreviewGroups((groups) => groups.map((group) => group.id === previewParticipantGroupId ? { ...group, answers, completed: false } : group));
  }

  function updatePreviewGroupCompleted(completed: boolean) {
    if (!previewParticipantGroupId) return;
    setPreviewGroups((groups) => groups.map((group) => group.id === previewParticipantGroupId ? { ...group, completed } : group));
  }

  function createPreviewGroup() {
    const name = previewGroupName.trim();
    if (!name) return;
    if (previewGroups.length >= previewMaxGroups) {
      setPreviewGroupError("Die maximale Anzahl an Gruppen ist erreicht.");
      return;
    }
    if (previewGroups.some((group) => group.name.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
      setPreviewGroupError("Dieser Gruppenname ist bereits vergeben.");
      return;
    }
    const groupId = `preview-${Date.now()}`;
    const member = { id: "preview-you", name: previewParticipantName.trim() || "Sie" };
    setPreviewGroups((groups) => [
      ...groups.map((group) => ({ ...group, members: group.members.filter((item) => item.id !== member.id) })),
      { id: groupId, name, members: [member], answers: [""], completed: false },
    ]);
    setPreviewParticipantGroupId(groupId);
    setPreviewGroupName("");
    setPreviewGroupError("");
    setPreviewGroupFormOpen(false);
  }

  function togglePreviewStatus() {
    const next = status === "ACCEPTING" ? "LOCKED" : "ACCEPTING";
    setStatus(next);
    if (previewSession?.sessionId) void api.updateSession(previewSession.sessionId, { interactionStatus: next }).then(setPreviewSession).catch(() => undefined);
  }

  function togglePreviewResults() {
    const next = !resultsVisible;
    setResultsVisible(next);
    if (previewSession?.sessionId) void api.updateSession(previewSession.sessionId, { resultsVisible: next }).then(setPreviewSession).catch(() => undefined);
  }

  function updatePreviewTimer(timerAction: "START" | "PAUSE" | "RESET" | "ADD_MINUTE") {
    if (!previewSession?.sessionId) return;
    void api.updateSession(previewSession.sessionId, { timerAction }).then(setPreviewSession).catch(() => undefined);
  }

  function updatePreviewGroupIndex(activeGroupIndex: number) {
    if (!previewSession?.sessionId) return;
    void api.updateSession(previewSession.sessionId, { activeGroupIndex }).then(setPreviewSession).catch(() => undefined);
  }

  if (!presentation) {
    return <div className="preview-loading"><MessageCircleMore size={34} /><strong>MitRede Vorschau</strong><p>{error || "Vorschau wird vorbereitet…"}</p><button onClick={exitPreview}>Zurück zum Editor</button></div>;
  }

  return (
    <div className="preview-shell">
      <header className="preview-topbar">
        <button className="preview-close" onClick={exitPreview}><X size={19} /> Vorschau beenden</button>
        <div className="preview-title"><strong>{presentation.title}</strong><span>VORSCHAU</span><small>Keine Daten werden gespeichert</small></div>
        <button className="preview-toggle-phone" onClick={() => setPhoneVisible((visible) => !visible)}>
          {phoneVisible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}{phoneVisible ? "Mobilansicht ausblenden" : "Mobilansicht anzeigen"}
        </button>
      </header>

      <main className={phoneVisible ? "preview-workspace" : "preview-workspace phone-hidden"}>
        <section className="preview-projector-column">
          <div className="preview-column-heading"><span>PROJEKTIONSANSICHT</span><small>{isPdf ? `PDF · Seite ${currentNode?.sourcePageNumber}` : isJoinPage ? "Teilnahmeseite" : isContentPage ? "Informationsseite" : isFreeformPage ? "Freie Seite" : isGroupPage ? "Gruppen erstellen" : isGroupDiscussion ? "Gruppendiskussion" : isGroupPresentation ? "Gruppenergebnisse" : isPriorityPage ? "Priorisierung" : status === "ACCEPTING" ? "Antworten offen" : status === "LOCKED" ? "Antworten gesperrt" : "Noch nicht geöffnet"}</small></div>
          <div className={`preview-projector ${isPdf ? "is-pdf" : isJoinPage ? "is-join" : isContentPage ? "is-content" : isFreeformPage ? "is-freeform" : isGroupPage || isGroupDiscussion || isGroupPresentation ? "is-group" : isPriorityPage ? "is-priority" : "is-poll"}`} ref={projectorRef}>
            {isPdf && currentNode?.config.objectKey && currentNode.config.pageNumber ? (
              <div className="preview-projector-pdf"><PdfPageCanvas objectKey={currentNode.config.objectKey} pageNumber={currentNode.config.pageNumber} fitContainer /></div>
            ) : isJoinPage ? (
              <div className="preview-join-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><div className="preview-join-copy"><h1>Jetzt teilnehmen</h1><p>QR-Code scannen oder Webadresse im Browser öffnen.</p><strong className="preview-join-domain">{previewSession ? previewPublicHost : "Raum wird erstellt…"}</strong></div><div className="preview-join-access-card"><span>{previewSession ? <QRCodeSVG value={previewJoinUrl} size={280} level="M" marginSize={1} title="QR-Code zum Vorschau-Raum" /> : <QrCode size={280} />}</span><div><small>RAUMCODE</small><strong>{formattedPreviewRoomCode}</strong></div></div></div>
            ) : isContentPage ? (
              <div className="preview-content-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><h1>{currentNode?.config.title || "Neue Informationsseite"}</h1><p className="preview-content-body">{currentNode?.config.body || "Ergänzen Sie hier Ihre Inhalte."}</p></div>
            ) : isFreeformPage ? (
              <FreeformPageRenderer config={currentNode?.config ?? {}} className="preview-freeform-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }} />
            ) : isGroupPage ? (
              <div className="projection-groups preview-group-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><h1>{currentNode?.config.question}</h1><p className="stage-subtitle">{currentNode?.config.prompt}</p><div className="projection-group-grid">{projectionPreviewGroups.length ? projectionPreviewGroups.map((group) => <article key={group.id}><div><UsersRound size={24} /><strong>{group.name}</strong><span>{group.members.length} {group.members.length === 1 ? "Mitglied" : "Mitglieder"}</span></div><ul className="projection-group-members">{group.members.map((member) => <li key={member.id}>{member.name}</li>)}</ul></article>) : <div className="projection-group-empty"><UserPlus size={36} /><strong>Noch keine Gruppen</strong><span>Erstellen Sie rechts in der Mobilansicht eine Gruppe.</span></div>}</div><p className="projection-group-count"><UsersRound size={16} /> {previewGroupMemberTotal} {previewGroupMemberTotal === 1 ? "teilnehmende Person" : "Teilnehmende"} in {projectionPreviewGroups.length} {projectionPreviewGroups.length === 1 ? "Gruppe" : "Gruppen"}</p></div>
            ) : isGroupDiscussion ? (
              <div className="projection-discussion preview-discussion-stage" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><div className="discussion-stage-center"><h1>{currentNode?.config.question}</h1>{previewSession?.discussionTimer && <div className="discussion-stage-timer"><Clock3 size={28} /><strong>{String(Math.floor(previewDiscussionSeconds / 60)).padStart(2, "0")}:{String(previewDiscussionSeconds % 60).padStart(2, "0")}</strong><span>Verbleibende Zeit</span></div>}</div><footer className="discussion-stage-status"><div><UsersRound size={18} /><span><strong>{projectionPreviewGroups.filter((group) => group.completed).length} / {projectionPreviewGroups.length}</strong> Gruppen fertig</span></div><div className="discussion-progress-dots">{projectionPreviewGroups.map((group) => <i className={group.completed ? "done" : ""} key={group.id} />)}</div></footer></div>
            ) : isGroupPresentation ? (
              <div className="group-presentation-canvas preview-group-presentation-stage" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}>{previewSession?.groupPresentation?.activeGroup ? <><header><span>GRUPPE {previewSession.groupPresentation.activeIndex + 1} VON {previewSession.groupPresentation.total}</span><h1>{currentNode?.config.question}</h1></header><section><div className="group-presentation-team"><UsersRound size={28} /><div><strong>{previewSession.groupPresentation.activeGroup.name}</strong><span>{previewSession.groupPresentation.activeGroup.memberNames.join(" · ")}</span></div></div><div className="group-presentation-answer-list">{previewSession.groupPresentation.activeGroup.answers.map((answer, index) => <article key={index}><b>{index + 1}</b><p>{answer}</p></article>)}</div></section><footer><span>Diese Gruppe präsentiert jetzt.</span><div>{Array.from({ length: previewSession.groupPresentation.total }, (_, index) => <i className={index === previewSession.groupPresentation?.activeIndex ? "active" : ""} key={index} />)}</div></footer></> : <div className="group-presentation-empty"><UsersRound size={38} /><strong>Noch keine Gruppenergebnisse</strong><span>Wählen Sie eine Diskussion mit gespeicherten Antworten aus.</span></div>}</div>
            ) : isPriorityPage ? (
              <div className="projection-priority preview-priority-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><h1>{currentNode?.config.question}</h1>{!rankedPreviewPriorityPoints.length ? <div className="priority-empty"><Vote size={38} /><strong>Noch keine Diskussionspunkte</strong><span>Erfassen Sie in der verknüpften Gruppendiskussion mindestens eine Antwort.</span></div> : resultsVisible ? <div className="projection-priority-list">{visiblePreviewPriorityPoints.map((point, index) => <article key={point.id}><span className="priority-rank">{index + 1}</span><div><strong>{point.text}</strong><small>{point.groupName}</small><i><b style={{ width: `${point.count ? Math.max(8, point.count / previewPriorityMaxCount * 100) : 0}%` }} /></i></div><span className="priority-count"><b>{point.count}</b> {point.count === 1 ? "Stimme" : "Stimmen"}</span></article>)}</div> : <div className="preview-results-placeholder"><BarChart3 size={32} /><strong>Stimmen werden gesammelt</strong><span>Die Rangfolge erscheint nach der Freigabe.</span></div>}<p className="answer-count"><Check size={15} /> {previewPriorityVoterCount} {previewPriorityVoterCount === 1 ? "Person hat" : "Personen haben"} abgestimmt{rankedPreviewPriorityPoints.length > visiblePreviewPriorityPoints.length ? ` · Top ${visiblePreviewPriorityPoints.length} von ${rankedPreviewPriorityPoints.length}` : ""}</p></div>
            ) : isMultiScale ? (
              <div className="projection-multi-scale preview-multi-scale-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><h1>{currentNode?.config.question}</h1><div className="projection-scale-list">{currentNode?.config.statements?.map((statement, statementIndex) => { const selectedIndex = previewScaleSubmittedValues[statementIndex]; const average = Number.isInteger(selectedIndex) ? Number(options[selectedIndex ?? -1]) : null; const minimum = Number(options[0] ?? currentNode?.config.min ?? 1); const maximum = Number(options.at(-1) ?? currentNode?.config.max ?? 5); const position = average === null || maximum === minimum ? null : (average - minimum) / (maximum - minimum) * 100; const statementCounts = options.map((_, optionIndex) => optionIndex === selectedIndex ? 1 : 0); return <article key={statementIndex}><div><strong>{statement}</strong>{resultsVisible && average !== null && <span>1 Bewertung</span>}</div><div className="projection-scale-track">{resultsVisible && <RatingDistribution counts={statementCounts} />}<i />{resultsVisible && position !== null && <b style={{ left: `${position}%` }}>{average?.toFixed(1)}</b>}</div></article>; })}</div><footer><span>{currentNode?.config.minLabel}</span><b>{currentNode?.config.min}–{currentNode?.config.max} Punkte</b><span>{currentNode?.config.maxLabel}</span></footer><p className="answer-count"><Check size={15} /> {previewScaleSubmittedValues.length ? 1 : 0} Personen haben bewertet</p></div>
            ) : isRating ? (
              <div className="preview-single-scale-page" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}><div><h1>{currentNode?.config.question}</h1><p>{resultsVisible ? "Durchschnittliche Bewertung" : "Wählen Sie eine Bewertung"}</p><RatingScaleRail min={Number(options[0] ?? currentNode?.config.min ?? 1)} max={Number(options.at(-1) ?? currentNode?.config.max ?? 5)} minLabel={currentNode?.config.minLabel} maxLabel={currentNode?.config.maxLabel} value={resultsVisible ? ratingAverage : null} valuePrefix={resultsVisible ? "Ø " : ""} counts={resultsVisible ? counts : undefined} /></div><p className="answer-count"><Check size={15} /> {total} simulierte {total === 1 ? "Bewertung" : "Bewertungen"}</p></div>
            ) : (
              <div className="preview-projector-poll" style={pollWidth > 0 && pollHeight > 0 ? { width: pollWidth, height: pollHeight } : { aspectRatio: slideAspectRatio }}>
                <h1>{currentNode?.config.question ?? "Neue Frage"}</h1>
                <p>Eine Antwort auswählen</p>
                {resultsVisible ? <ResultBars options={options} counts={counts} correctOptionIndex={isQuiz ? currentNode?.config.correctOptionIndex : undefined} /> : (
                  <div className="preview-results-placeholder"><BarChart3 size={32} /><strong>Ergebnisse verborgen</strong><span>Öffnen Sie die Abstimmung oder blenden Sie die simulierten Ergebnisse ein.</span></div>
                )}
                <div className="preview-projector-count"><Check size={15} /> {total} simulierte Antworten</div>
              </div>
            )}
          </div>

          <div className="preview-controlbar">
            <div className="preview-page-controls">
              <button disabled={currentIndex <= 0} onClick={() => move(-1)} aria-label="Vorherige Seite"><ArrowLeft size={18} /></button>
              <span>{currentIndex + 1} / {presentation.nodes.length}</span>
              <button disabled={currentIndex >= presentation.nodes.length - 1} onClick={() => move(1)} aria-label="Nächste Seite"><ArrowRight size={18} /></button>
            </div>
            <div className="preview-moderation-controls">
              {isGroupPresentation ? <><button disabled={!previewSession?.groupPresentation?.activeIndex} onClick={() => updatePreviewGroupIndex(Math.max(0, (previewSession?.groupPresentation?.activeIndex ?? 0) - 1))}><ArrowLeft size={17} /> Vorherige Gruppe</button><span className="preview-group-position">{previewSession?.groupPresentation?.total ? `${(previewSession.groupPresentation.activeIndex ?? 0) + 1} / ${previewSession.groupPresentation.total}` : "0 / 0"}</span><button disabled={!previewSession?.groupPresentation?.total || (previewSession.groupPresentation.activeIndex ?? 0) >= previewSession.groupPresentation.total - 1} onClick={() => updatePreviewGroupIndex((previewSession?.groupPresentation?.activeIndex ?? 0) + 1)}>Nächste Gruppe <ArrowRight size={17} /></button></> : isStaticPage ? <span className="preview-pdf-label"><FileText size={17} /> {isJoinPage ? "Teilnahmeseite" : isContentPage ? "Informationsseite" : isFreeformPage ? "Freie Seite" : "Präsentationsseite"}</span> : (
                <>
                  <button className={status === "ACCEPTING" ? "active" : ""} onClick={togglePreviewStatus}>{status === "ACCEPTING" ? <Radio size={17} /> : <Lock size={17} />}{status === "ACCEPTING" ? "Antworten offen" : status === "LOCKED" ? "Erneut öffnen" : "Abstimmung öffnen"}</button>
                  {isGroupDiscussion ? previewSession?.discussionTimer ? <><button className={previewSession.discussionTimer.running ? "active" : ""} onClick={() => updatePreviewTimer(previewSession.discussionTimer?.running ? "PAUSE" : "START")}>{previewSession.discussionTimer.running ? <Pause size={17} /> : <Play size={17} />}{previewSession.discussionTimer.running ? "Timer pausieren" : "Timer starten"}</button><button onClick={() => updatePreviewTimer("ADD_MINUTE")}><Plus size={17} /> 1 Min.</button><button onClick={() => updatePreviewTimer("RESET")}><RotateCcw size={17} /></button></> : null : <button className={resultsVisible ? "active" : ""} onClick={togglePreviewResults}>{resultsVisible ? <Eye size={17} /> : <EyeOff size={17} />}{resultsVisible ? "Ergebnisse sichtbar" : "Ergebnisse zeigen"}</button>}
                </>
              )}
            </div>
            <button className="preview-fullscreen" onClick={() => projectorRef.current?.requestFullscreen?.()} aria-label="Projektionsansicht im Vollbild"><Fullscreen size={18} /></button>
          </div>
          <div className="preview-hint"><span><ArrowLeft size={13} /> <ArrowRight size={13} /> Seiten wechseln</span><span>Esc Vorschau beenden</span></div>
        </section>

        {phoneVisible && (
          <aside className="preview-phone-column">
            <div className="preview-column-heading"><span><Smartphone size={14} /> TEILNEHMENDENANSICHT</span><small>Interaktive Simulation</small></div>
            <PhonePreview node={currentNode} status={status} resultsVisible={resultsVisible} counts={counts} selectedOption={selectedOption} submittedOption={submittedOption} onSelect={setSelectedOption} onSubmit={submitAnswer} onReset={resetAnswer} discussionTimer={previewSession?.discussionTimer ?? null} discussionSeconds={previewDiscussionSeconds} groupPresentation={previewSession?.groupPresentation ?? null} priorityPoints={previewPriorityPoints} prioritySelectedIds={previewPrioritySelectedIds} prioritySubmittedIds={previewPrioritySubmittedIds} onPriorityToggle={togglePreviewPriorityPoint} onPrioritySubmit={submitPreviewPriorityVote} scaleSelections={previewScaleSelections} scaleSubmittedValues={previewScaleSubmittedValues} onScaleSelect={selectPreviewScale} onScaleSubmit={submitPreviewScale} groupSimulation={{ groups: previewGroups, currentGroupId: previewParticipantGroupId, participantName: previewParticipantName, formOpen: previewGroupFormOpen, groupName: previewGroupName, error: previewGroupError, maxGroups: previewMaxGroups, onParticipantNameChange: renamePreviewParticipant, onGroupNameChange: (name) => { setPreviewGroupName(name); setPreviewGroupError(""); }, onToggleForm: () => { setPreviewGroupFormOpen((open) => !open); setPreviewGroupError(""); }, onCreate: createPreviewGroup, onJoin: joinPreviewGroup, onLeave: leavePreviewGroup, onAnswersChange: updatePreviewGroupAnswers, onCompletedChange: updatePreviewGroupCompleted }} />
          </aside>
        )}
      </main>
    </div>
  );
}
