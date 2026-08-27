import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  Clock3,
  Cloud,
  Copy,
  FileText,
  EyeOff,
  Gauge,
  GripVertical,
  ImagePlus,
  Italic,
  ListChecks,
  List,
  ListOrdered,
  LayoutTemplate,
  MessageCircleMore,
  MessageSquareText,
  Play,
  Plus,
  QrCode,
  Save,
  ScanEye,
  Trash2,
  Trophy,
  Type,
  UsersRound,
  Vote,
  X,
} from "lucide-react";
import { api, createClientId, prepareProjectionWindow, showProjectionWindow, type FreeformElement, type PresentationDetails, type PresentationNode } from "./api";
import { FreeformPageEditor, FreeformPageRenderer } from "./FreeformPage";
import { PdfPageCanvas, usePdfPageAspectRatio } from "./PdfPage";
import { RatingScaleRail } from "./RatingScale";

function editorPresentationId() {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[2] ?? "");
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function EditorBrand() {
  return <div className="brand editor-brand"><span className="brand-mark"><MessageCircleMore size={21} /></span><span>MitRede</span></div>;
}

function NodeThumb({ node }: { node: PresentationNode }) {
  if (node.type === "PDF_PAGE" && node.config.objectKey && node.config.pageNumber) {
    return <PdfPageCanvas objectKey={node.config.objectKey} pageNumber={node.config.pageNumber} compact />;
  }
  if (node.type === "RATING") {
    const min = node.config.min ?? 1;
    const max = node.config.max ?? 5;
    const statements = node.config.statements ?? [];
    return <div className={statements.length > 1 ? "page-thumb-preview rating-thumb-preview multi" : "page-thumb-preview rating-thumb-preview"}><strong>{node.config.question || "Neue Skalenfrage"}</strong>{statements.length > 1 ? <div className="rating-thumb-statements">{statements.slice(0, 3).map((statement, index) => <span key={index}>{statement}<i /></span>)}</div> : <RatingScaleRail min={min} max={max} minLabel={node.config.minLabel} maxLabel={node.config.maxLabel} compact className="rating-thumb-rail" />}</div>;
  }
  if (node.type === "CONTENT_PAGE") {
    return <div className="page-thumb-preview content-thumb-preview"><strong>{node.config.title || "Neue Informationsseite"}</strong><p>{node.config.body || "Ergänzen Sie hier Ihre Inhalte."}</p></div>;
  }
  if (node.type === "FREEFORM_PAGE") {
    return <FreeformPageRenderer config={node.config} className="freeform-thumb-preview page-thumb-preview" />;
  }
  if (node.type === "GROUP_PAGE") {
    return <div className="page-thumb-preview group-thumb-preview"><strong>{node.config.question || "Finden Sie Ihre Gruppe"}</strong><div><span>Gruppe Grün</span><span>Gruppe Blau</span></div></div>;
  }
  if (node.type === "GROUP_DISCUSSION") {
    const durationMinutes = Math.max(0, node.config.durationMinutes ?? 0);
    return <div className="page-thumb-preview discussion-thumb-preview"><section><strong>{node.config.question || "Diskutieren Sie in Ihren Gruppen"}</strong>{durationMinutes > 0 && <b><Clock3 size={9} /> {String(durationMinutes).padStart(2, "0")}:00</b>}</section><footer><span>0 / 4 Gruppen fertig</span><i><em /><em /><em /><em /></i></footer></div>;
  }
  if (node.type === "GROUP_PRESENTATION") {
    return <div className="page-thumb-preview group-presentation-thumb"><strong>{node.config.question || "Ergebnisse aus den Gruppen"}</strong><section><b>Gruppe Grün</b><span>Ergebnis 1</span><span>Ergebnis 2</span></section><footer>1 / 4</footer></div>;
  }
  if (node.type === "PRIORITY_VOTE") {
    return <div className="page-thumb-preview priority-thumb-preview"><strong>{node.config.question || "Ergebnisse priorisieren"}</strong><div><span><Vote size={9} /> Gruppenantworten</span><span>Top {node.config.maxVisibleResults ?? 5} · Max. {node.config.maxVotes ?? 3} Stimmen</span></div></div>;
  }
  if (node.type === "JOIN_PAGE") {
    return <div className="join-thumb-preview page-thumb-preview"><div><strong>Jetzt teilnehmen</strong></div><span><QrCode size={27} /></span><div><small>RAUMCODE</small><b>123 456</b></div></div>;
  }
  const isQuiz = node.config.assessmentMode === "QUIZ";
  return <div className={isQuiz ? "page-thumb-preview poll-thumb-preview quiz" : "page-thumb-preview poll-thumb-preview"}><strong>{node.config.question || (isQuiz ? "Neue Quizfrage" : "Neue Frage")}</strong><div>{(node.config.options ?? []).slice(0, 4).map((option, index) => <span className={isQuiz && node.config.correctOptionIndex === index ? "correct" : ""} key={`${index}-${option}`}><b>{String.fromCharCode(65 + index)}</b>{option}</span>)}</div></div>;
}

function ResultDisplaySetting({ value, onChange }: { value: "MANUAL" | "LIVE"; onChange: (value: "MANUAL" | "LIVE") => void }) {
  return <div className="result-display-setting"><div><strong>Ergebnisanzeige</strong><small>Wann sollen Stimmen auf der Leinwand erscheinen?</small></div><div className="result-display-options"><button className={value === "MANUAL" ? "active" : ""} onClick={() => onChange("MANUAL")}><strong>Am Ende</strong><span>Manuell veröffentlichen</span></button><button className={value === "LIVE" ? "active" : ""} onClick={() => onChange("LIVE")}><strong>Live</strong><span>Nach jeder Antwort</span></button></div><p>Die Antworten werden in beiden Modi sofort gespeichert.</p></div>;
}

function InteractionPicker({ onClose, onChoose }: { onClose: () => void; onChoose: (type: "JOIN_PAGE" | "CONTENT_PAGE" | "FREEFORM_PAGE" | "FREEFORM_TEMPLATE" | "GROUP_PAGE" | "GROUP_DISCUSSION" | "GROUP_PRESENTATION" | "PRIORITY_VOTE" | "MULTIPLE_CHOICE" | "RATING" | "QUIZ") => void }) {
  return (
    <div className="interaction-picker-backdrop" onMouseDown={onClose}>
      <section className="interaction-picker" role="dialog" aria-modal="true" aria-labelledby="interaction-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="interaction-picker-title">Seite auswählen</h2><button onClick={onClose} aria-label="Schließen"><X size={19} /></button></header>
        <div className="interaction-category participation"><div className="interaction-category-heading"><span>INHALT</span></div><div className="interaction-type-grid participation">
          <button onClick={() => onChoose("JOIN_PAGE")}><span><QrCode size={24} /></span><strong>Teilnahmeseite</strong></button>
          <button onClick={() => onChoose("CONTENT_PAGE")}><span><FileText size={24} /></span><strong>Informationsseite</strong></button>
          <button onClick={() => onChoose("FREEFORM_PAGE")}><span><Type size={24} /></span><strong>Freie Seite</strong></button>
          <button onClick={() => onChoose("FREEFORM_TEMPLATE")}><span><LayoutTemplate size={24} /></span><strong>Titel &amp; Inhalt</strong></button>
        </div></div>
        <div className="interaction-category"><div className="interaction-category-heading"><span>ZUSAMMENARBEIT</span></div><div className="interaction-type-grid collaboration">
          <button onClick={() => onChoose("GROUP_PAGE")}><span><UsersRound size={24} /></span><strong>Gruppen erstellen</strong></button>
          <button onClick={() => onChoose("GROUP_DISCUSSION")}><span><MessageSquareText size={24} /></span><strong>Gruppendiskussion</strong></button>
          <button onClick={() => onChoose("GROUP_PRESENTATION")}><span><ScanEye size={24} /></span><strong>Gruppenergebnisse</strong></button>
          <button onClick={() => onChoose("PRIORITY_VOTE")}><span><Vote size={24} /></span><strong>Ergebnisse priorisieren</strong></button>
        </div></div>
        <div className="interaction-category"><div className="interaction-category-heading"><span>MEINUNGEN &amp; FEEDBACK</span></div><div className="interaction-type-grid feedback">
          <button onClick={() => onChoose("MULTIPLE_CHOICE")}><span><ListChecks size={24} /></span><strong>Single Choice</strong></button>
          <button onClick={() => onChoose("RATING")}><span><Gauge size={24} /></span><strong>Bewertungsskalen</strong></button>
          <button disabled><span><Cloud size={24} /></span><strong>Wortwolke</strong><i>DEMNÄCHST</i></button>
          <button disabled><span><MessageSquareText size={24} /></span><strong>Offene Frage</strong><i>DEMNÄCHST</i></button>
        </div></div>
        <div className="interaction-category quiz"><div className="interaction-category-heading"><span>QUIZ &amp; WISSEN</span></div><div className="interaction-type-grid quiz">
          <button onClick={() => onChoose("QUIZ")}><span><Trophy size={24} /></span><strong>Single Choice Quiz</strong></button>
          <button disabled><span><ListChecks size={24} /></span><strong>Multiple Choice Quiz</strong><i>DEMNÄCHST</i></button>
          <button disabled><span><Check size={24} /></span><strong>Richtig / Falsch</strong><i>DEMNÄCHST</i></button>
        </div></div>
      </section>
    </div>
  );
}

export default function EditorView() {
  const presentationId = editorPresentationId();
  const [presentation, setPresentation] = useState<PresentationDetails | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [insertMenuIndex, setInsertMenuIndex] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [resultDisplayMode, setResultDisplayMode] = useState<"MANUAL" | "LIVE">("MANUAL");
  const [assessmentMode, setAssessmentMode] = useState<"FEEDBACK" | "QUIZ">("FEEDBACK");
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [ratingMin, setRatingMin] = useState(1);
  const [ratingMax, setRatingMax] = useState(5);
  const [ratingMinLabel, setRatingMinLabel] = useState("Sehr niedrig");
  const [ratingMaxLabel, setRatingMaxLabel] = useState("Sehr hoch");
  const [ratingStatements, setRatingStatements] = useState<string[]>(["Aussage 1"]);
  const [contentTitle, setContentTitle] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [freeformBackground, setFreeformBackground] = useState("#fffaf1");
  const [freeformElements, setFreeformElements] = useState<FreeformElement[]>([]);
  const [selectedFreeformElementId, setSelectedFreeformElementId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [groupQuestion, setGroupQuestion] = useState("");
  const [groupPrompt, setGroupPrompt] = useState("");
  const [groupResultPrompt, setGroupResultPrompt] = useState("");
  const [groupMaxGroups, setGroupMaxGroups] = useState(8);
  const [groupSourceNodeId, setGroupSourceNodeId] = useState<string | null>(null);
  const [groupDurationMinutes, setGroupDurationMinutes] = useState(0);
  const [groupMaxAnswers, setGroupMaxAnswers] = useState(0);
  const [groupPresentationSourceNodeId, setGroupPresentationSourceNodeId] = useState<string | null>(null);
  const [prioritySourceGroupNodeId, setPrioritySourceGroupNodeId] = useState<string | null>(null);
  const [priorityMaxVotes, setPriorityMaxVotes] = useState(3);
  const [priorityMaxVisibleResults, setPriorityMaxVisibleResults] = useState(5);
  const [pageContextMenu, setPageContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [publicHost, setPublicHost] = useState(window.location.host);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initialNodeId = useMemo(() => new URLSearchParams(window.location.search).get("node") ?? undefined, []);

  const load = useCallback(async (preferredId?: string) => {
    try {
      const next = await api.presentation(presentationId);
      setPresentation(next);
      setSelectedId((current) => preferredId ?? current ?? initialNodeId ?? next.nodes[0]?.id ?? null);
      setError("");
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Präsentation konnte nicht geladen werden");
      return null;
    }
  }, [initialNodeId, presentationId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void api.settings().then((settings) => { try { setPublicHost(new URL(settings.publicBaseUrl || window.location.origin).host); } catch { setPublicHost(window.location.host); } }).catch(() => undefined); }, []);

  useEffect(() => {
    if (!pageContextMenu) return;
    const close = () => setPageContextMenu(null);
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", closeOnKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", closeOnKey);
    };
  }, [pageContextMenu]);

  useEffect(() => {
    if (!selectedId || !presentation) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("node") === selectedId) return;
    url.searchParams.set("node", selectedId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [presentation, selectedId]);

  const selected = useMemo(
    () => presentation?.nodes.find((node) => node.id === selectedId) ?? null,
    [presentation, selectedId],
  );
  const selectedFreeformElement = useMemo(
    () => freeformElements.find((element) => element.id === selectedFreeformElementId) ?? null,
    [freeformElements, selectedFreeformElementId],
  );
  const prioritySourceNode = presentation?.nodes.find((node) => node.id === prioritySourceGroupNodeId) ?? null;
  const referencePdf = presentation?.nodes.find((node) => node.type === "PDF_PAGE" && node.config.objectKey && node.config.pageNumber);
  const slideAspectRatio = usePdfPageAspectRatio(referencePdf?.config.objectKey, referencePdf?.config.pageNumber);
  const slideWidth = Math.min(canvasSize.width, canvasSize.height * slideAspectRatio);
  const slideHeight = slideWidth / slideAspectRatio;
  const slideStyle = slideWidth > 0 && slideHeight > 0 ? { width: slideWidth, height: slideHeight } : undefined;

  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    let animationFrame = 0;
    const updateSize = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const style = window.getComputedStyle(area);
        const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
        const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
        const next = {
          width: Math.max(0, area.clientWidth - horizontalPadding),
          height: Math.max(0, area.clientHeight - verticalPadding),
        };
        setCanvasSize((current) => current.width === next.width && current.height === next.height ? current : next);
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(area);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [presentation !== null]);

  useEffect(() => {
    if (!selected || selected.type === "PDF_PAGE" || selected.type === "JOIN_PAGE") return;
    if (selected.type === "GROUP_PAGE") {
      setGroupQuestion(selected.config.question ?? "Finden Sie Ihre Gruppe");
      setGroupPrompt(selected.config.prompt ?? "Erstellen Sie eine Gruppe oder treten Sie einer bestehenden Gruppe bei.");
      setGroupResultPrompt("");
      setGroupMaxGroups(selected.config.maxGroups ?? 8);
      setDirty(false);
      setSaveState("saved");
      return;
    }
    if (selected.type === "GROUP_DISCUSSION") {
      setGroupQuestion(selected.config.question ?? "Diskutieren Sie in Ihren Gruppen");
      setGroupPrompt("");
      setGroupResultPrompt("");
      setGroupSourceNodeId(selected.config.sourceGroupNodeId ?? null);
      setGroupDurationMinutes(selected.config.durationMinutes ?? 0);
      setGroupMaxAnswers(selected.config.maxAnswers ?? 0);
      setDirty(false);
      setSaveState("saved");
      return;
    }
    if (selected.type === "GROUP_PRESENTATION") {
      setQuestion(selected.config.question ?? "Ergebnisse aus den Gruppen");
      setGroupPresentationSourceNodeId(selected.config.sourceGroupNodeId ?? null);
      setDirty(false);
      setSaveState("saved");
      return;
    }
    if (selected.type === "PRIORITY_VOTE") {
      setQuestion(selected.config.question ?? "Welche Ergebnisse sind am wichtigsten?");
      setPrioritySourceGroupNodeId(selected.config.sourceGroupNodeId ?? null);
      setPriorityMaxVotes(selected.config.maxVotes ?? 3);
      setPriorityMaxVisibleResults(selected.config.maxVisibleResults ?? 5);
      setResultDisplayMode(selected.config.resultDisplayMode ?? "LIVE");
      setDirty(false);
      setSaveState("saved");
      return;
    }
    if (selected.type === "FREEFORM_PAGE") {
      setFreeformBackground(selected.config.backgroundColor ?? "#fffaf1");
      setFreeformElements(selected.config.elements ?? []);
      setSelectedFreeformElementId(null);
      setDirty(false);
      setSaveState("saved");
      return;
    }
    if (selected.type === "CONTENT_PAGE") {
      setContentTitle(selected.config.title ?? "");
      setContentBody(selected.config.body ?? "");
      setDirty(false);
      setSaveState("saved");
      return;
    }
    setQuestion(selected.config.question ?? "");
    setOptions(selected.config.options ?? []);
    setResultDisplayMode(selected.config.resultDisplayMode ?? "MANUAL");
    setAssessmentMode(selected.config.assessmentMode ?? "FEEDBACK");
    setCorrectOptionIndex(selected.config.correctOptionIndex ?? 0);
    if (selected.type === "RATING") {
      setRatingMin(selected.config.min ?? 1);
      setRatingMax(selected.config.max ?? 5);
      setRatingMinLabel(selected.config.minLabel ?? "Sehr niedrig");
      setRatingMaxLabel(selected.config.maxLabel ?? "Sehr hoch");
      setRatingStatements(selected.config.statements?.length ? selected.config.statements : [selected.config.question ?? "Aussage 1"]);
    }
    setDirty(false);
    setSaveState("saved");
  }, [selected?.id]);

  useEffect(() => {
    if (!dirty || !selected || selected.type === "PDF_PAGE" || selected.type === "JOIN_PAGE") return;
    if ((selected.type === "GROUP_PAGE" || selected.type === "GROUP_DISCUSSION") && groupQuestion.trim().length < 3) return;
    if (selected.type === "CONTENT_PAGE" && contentTitle.trim().length < 1) return;
    if (selected.type !== "CONTENT_PAGE" && selected.type !== "FREEFORM_PAGE" && selected.type !== "GROUP_PAGE" && selected.type !== "GROUP_DISCUSSION" && question.trim().length < 3) return;
    if (selected.type === "MULTIPLE_CHOICE" && options.filter((option) => option.trim()).length < 2) return;
    if (selected.type === "RATING" && (ratingMax <= ratingMin || ratingMax - ratingMin > 100)) return;
    if (selected.type === "RATING" && ratingStatements.some((statement) => !statement.trim())) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const updated = selected.type === "GROUP_PAGE"
          ? await api.updateGroupPage(presentationId, selected.id, { question: groupQuestion.trim(), prompt: groupPrompt.trim(), resultPrompt: groupResultPrompt.trim(), maxGroups: groupMaxGroups })
          : selected.type === "GROUP_DISCUSSION"
          ? await api.updateGroupDiscussion(presentationId, selected.id, { question: groupQuestion.trim(), prompt: "", resultPrompt: "", sourceGroupNodeId: groupSourceNodeId, durationMinutes: groupDurationMinutes, maxAnswers: groupMaxAnswers })
          : selected.type === "GROUP_PRESENTATION"
          ? await api.updateGroupPresentation(presentationId, selected.id, { question: question.trim(), sourceGroupNodeId: groupPresentationSourceNodeId })
          : selected.type === "PRIORITY_VOTE"
          ? await api.updatePriorityVote(presentationId, selected.id, { question: question.trim(), sourceGroupNodeId: prioritySourceGroupNodeId, maxVotes: priorityMaxVotes, maxVisibleResults: priorityMaxVisibleResults, resultDisplayMode })
          : selected.type === "FREEFORM_PAGE"
          ? await api.updateFreeformPage(presentationId, selected.id, { backgroundColor: freeformBackground, elements: freeformElements })
          : selected.type === "CONTENT_PAGE"
          ? await api.updateContentPage(presentationId, selected.id, { eyebrow: "", title: contentTitle.trim(), body: contentBody.trim() })
          : selected.type === "RATING"
          ? await api.updateRating(presentationId, selected.id, { question: question.trim(), statements: ratingStatements.map((statement) => statement.trim()), min: ratingMin, max: ratingMax, minLabel: ratingMinLabel.trim(), maxLabel: ratingMaxLabel.trim(), resultDisplayMode })
          : await api.updatePoll(presentationId, selected.id, question.trim(), options.map((option) => option.trim()).filter(Boolean), resultDisplayMode, assessmentMode, correctOptionIndex);
        setPresentation((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === updated.id ? updated : node) } : current);
        setDirty(false);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [assessmentMode, contentBody, contentTitle, correctOptionIndex, dirty, freeformBackground, freeformElements, groupDurationMinutes, groupMaxAnswers, groupMaxGroups, groupPresentationSourceNodeId, groupPrompt, groupQuestion, groupResultPrompt, groupSourceNodeId, options, presentationId, priorityMaxVisibleResults, priorityMaxVotes, prioritySourceGroupNodeId, question, ratingMax, ratingMaxLabel, ratingMin, ratingMinLabel, ratingStatements, resultDisplayMode, selected]);

  async function insertAfter(index: number, type: "JOIN_PAGE" | "CONTENT_PAGE" | "FREEFORM_PAGE" | "FREEFORM_TEMPLATE" | "GROUP_PAGE" | "GROUP_DISCUSSION" | "GROUP_PRESENTATION" | "PRIORITY_VOTE" | "MULTIPLE_CHOICE" | "RATING" | "QUIZ") {
    if (!presentation) return;
    try {
      const created = type === "JOIN_PAGE" ? await api.addJoinPage(presentationId) : type === "CONTENT_PAGE" ? await api.addContentPage(presentationId) : type === "FREEFORM_PAGE" ? await api.addFreeformPage(presentationId) : type === "FREEFORM_TEMPLATE" ? await api.addFreeformTemplate(presentationId) : type === "GROUP_PAGE" ? await api.addGroupPage(presentationId) : type === "GROUP_DISCUSSION" ? await api.addGroupDiscussion(presentationId) : type === "GROUP_PRESENTATION" ? await api.addGroupPresentation(presentationId) : type === "PRIORITY_VOTE" ? await api.addPriorityVote(presentationId) : type === "RATING" ? await api.addRating(presentationId) : type === "QUIZ" ? await api.addQuiz(presentationId) : await api.addPoll(presentationId);
      const ids = presentation.nodes.map((node) => node.id);
      ids.splice(index + 1, 0, created.id);
      const reordered = await api.reorderNodes(presentationId, ids);
      if (type === "GROUP_DISCUSSION") {
        const source = presentation.nodes.slice(0, index + 1).reverse().find((node) => node.type === "GROUP_PAGE");
        const configured = await api.updateGroupDiscussion(presentationId, created.id, { question: created.config.question ?? "Diskutieren Sie in Ihren Gruppen", prompt: "", resultPrompt: "", sourceGroupNodeId: source?.id ?? created.config.sourceGroupNodeId ?? null, durationMinutes: created.config.durationMinutes ?? 0, maxAnswers: created.config.maxAnswers ?? 0 });
        setPresentation({ ...reordered, nodes: reordered.nodes.map((node) => node.id === configured.id ? configured : node) });
      } else if (type === "GROUP_PRESENTATION") {
        const source = presentation.nodes.slice(0, index + 1).reverse().find((node) => node.type === "GROUP_DISCUSSION");
        const configured = await api.updateGroupPresentation(presentationId, created.id, { question: created.config.question ?? "Ergebnisse aus den Gruppen", sourceGroupNodeId: source?.id ?? created.config.sourceGroupNodeId ?? null });
        setPresentation({ ...reordered, nodes: reordered.nodes.map((node) => node.id === configured.id ? configured : node) });
      } else if (type === "PRIORITY_VOTE") {
        const source = presentation.nodes.slice(0, index + 1).reverse().find((node) => node.type === "GROUP_DISCUSSION");
        const configured = await api.updatePriorityVote(presentationId, created.id, { question: created.config.question ?? "Welche Ergebnisse sind am wichtigsten?", sourceGroupNodeId: source?.id ?? created.config.sourceGroupNodeId ?? null, maxVotes: created.config.maxVotes ?? 3, maxVisibleResults: created.config.maxVisibleResults ?? 5, resultDisplayMode: created.config.resultDisplayMode ?? "LIVE" });
        setPresentation({ ...reordered, nodes: reordered.nodes.map((node) => node.id === configured.id ? configured : node) });
      } else {
        setPresentation(reordered);
      }
      setSelectedId(created.id);
      setInsertMenuIndex(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Frage konnte nicht eingefügt werden"); }
  }

  function changeFreeformElements(next: FreeformElement[]) {
    setFreeformElements(next);
    setDirty(true);
  }

  function addFreeformText() {
    const element: FreeformElement = {
      id: createClientId(),
      type: "TEXT",
      x: 180,
      y: 160,
      width: 620,
      height: 130,
      text: "Text eingeben",
      fontSize: 48,
      color: "#19332e",
      fontWeight: 400,
      fontStyle: "normal",
      textAlign: "left",
      listStyle: "none",
    };
    changeFreeformElements([...freeformElements, element]);
    setSelectedFreeformElementId(element.id);
  }

  function updateSelectedFreeformElement(patch: Partial<FreeformElement>) {
    if (!selectedFreeformElementId) return;
    changeFreeformElements(freeformElements.map((element) => element.id === selectedFreeformElementId ? { ...element, ...patch } as FreeformElement : element));
  }

  function removeSelectedFreeformElement() {
    if (!selectedFreeformElementId) return;
    changeFreeformElements(freeformElements.filter((element) => element.id !== selectedFreeformElementId));
    setSelectedFreeformElementId(null);
  }

  async function uploadFreeformImage(file?: File) {
    if (!file) return;
    setUploadingImage(true);
    try {
      const uploaded = await api.uploadImage(presentationId, file);
      const element: FreeformElement = {
        id: createClientId(),
        type: "IMAGE",
        x: 420,
        y: 180,
        width: 760,
        height: 460,
        objectKey: uploaded.objectKey,
        objectFit: "contain",
      };
      changeFreeformElements([...freeformElements, element]);
      setSelectedFreeformElementId(element.id);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bild konnte nicht hochgeladen werden");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function duplicate() {
    if (!selected || selected.type === "PDF_PAGE") return;
    const created = await api.duplicateNode(presentationId, selected.id);
    await load(created.id);
  }

  async function removeNode(node: PresentationNode) {
    if (!window.confirm("Diese Seite wirklich löschen?")) return;
    const currentIndex = presentation?.nodes.findIndex((entry) => entry.id === node.id) ?? -1;
    const adjacentId = presentation?.nodes[currentIndex + 1]?.id ?? presentation?.nodes[currentIndex - 1]?.id;
    const nextId = node.id === selectedId ? adjacentId : selectedId ?? adjacentId;
    try {
      await api.deleteNode(presentationId, node.id);
      setPageContextMenu(null);
      await load(nextId);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Seite konnte nicht gelöscht werden");
    }
  }

  async function remove() {
    if (!selected) return;
    await removeNode(selected);
  }

  async function dropAt(targetId: string, position: "before" | "after") {
    if (!presentation || !draggedId || draggedId === targetId) return;
    const nodes = [...presentation.nodes];
    const sourceIndex = nodes.findIndex((node) => node.id === draggedId);
    if (sourceIndex < 0) return;
    const [moved] = nodes.splice(sourceIndex, 1);
    if (!moved) return;
    const targetIndex = nodes.findIndex((node) => node.id === targetId);
    if (targetIndex < 0) return;
    nodes.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
    setDraggedId(null);
    setDropTarget(null);
    try {
      setPresentation(await api.reorderNodes(presentationId, nodes.map((node) => node.id)));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reihenfolge konnte nicht gespeichert werden");
      await load();
    }
  }

  async function start() {
    const projectionWindow = prepareProjectionWindow();
    try {
      const session = await api.startSession(presentationId);
      showProjectionWindow(projectionWindow, session.sessionId);
    } catch (caught) {
      projectionWindow?.close();
      setError(caught instanceof Error ? caught.message : "Präsentation konnte nicht gestartet werden");
    }
  }

  if (!presentation) return <div className="editor-loading"><EditorBrand /><p>{error || "Editor wird geladen…"}</p></div>;

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <button className="editor-back" onClick={() => go("/app")}><ArrowLeft size={18} /> Übersicht</button>
        <EditorBrand />
        <div className="editor-title"><strong>{presentation.title}</strong><span className={`save-state ${saveState}`}>{saveState === "saving" ? <><Save size={13} /> Wird gespeichert…</> : saveState === "error" ? "Speichern fehlgeschlagen" : <><Check size={13} /> Gespeichert</>}</span></div>
        <div className="editor-topbar-actions">
          <button className="btn editor-preview-button" onClick={() => go(`/preview/${presentationId}${selectedId ? `?node=${encodeURIComponent(selectedId)}` : ""}`)}><ScanEye size={17} /> Vorschau</button>
          <button className="btn btn-primary" onClick={() => void start()}><Play size={16} fill="currentColor" /> Präsentieren</button>
        </div>
      </header>

      <aside className="timeline-panel">
        <div className="panel-heading"><span>ABLAUF</span><strong>{presentation.nodes.length} Seiten</strong></div>
        <button className="insert-node" onClick={() => setInsertMenuIndex(-1)} title="Seite am Anfang einfügen"><Plus size={14} /> Seite</button>
        <div className="node-list">
          {presentation.nodes.map((node, index) => (
            <div className="node-stack" key={node.id}>
              <button
                className={["node-card", node.id === selectedId ? "selected" : "", node.id === draggedId ? "dragging" : "", dropTarget?.id === node.id ? `drop-${dropTarget.position}` : ""].filter(Boolean).join(" ")}
                onClick={() => setSelectedId(node.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPageContextMenu({ nodeId: node.id, x: Math.min(event.clientX, window.innerWidth - 174), y: Math.min(event.clientY, window.innerHeight - 58) });
                }}
                draggable
                onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); setDraggedId(node.id); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: node.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" }); }}
                onDrop={(event) => { event.preventDefault(); if (dropTarget?.id === node.id) void dropAt(node.id, dropTarget.position); }}
                onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
              >
                <span className="node-index">{index + 1}</span>
                <GripVertical className="drag-handle" size={15} />
                <NodeThumb node={node} />
                <span className={node.type === "PDF_PAGE" ? "node-kind pdf" : node.type === "JOIN_PAGE" ? "node-kind join" : node.type === "CONTENT_PAGE" ? "node-kind content" : node.type === "FREEFORM_PAGE" ? "node-kind freeform" : node.type === "GROUP_PAGE" ? "node-kind group" : node.type === "GROUP_DISCUSSION" ? "node-kind discussion" : node.type === "GROUP_PRESENTATION" ? "node-kind group-presentation" : node.type === "PRIORITY_VOTE" ? "node-kind priority" : node.type === "RATING" ? "node-kind rating" : node.config.assessmentMode === "QUIZ" ? "node-kind quiz" : "node-kind poll"}>{node.type === "PDF_PAGE" ? `PDF ${node.sourcePageNumber}` : node.type === "JOIN_PAGE" ? "TEILNAHME" : node.type === "CONTENT_PAGE" ? "INHALT" : node.type === "FREEFORM_PAGE" ? "FREI" : node.type === "GROUP_PAGE" ? "GRUPPEN" : node.type === "GROUP_DISCUSSION" ? "DISKUSSION" : node.type === "GROUP_PRESENTATION" ? "ERGEBNISSE" : node.type === "PRIORITY_VOTE" ? "PRIORITÄT" : node.type === "RATING" ? (node.config.statements?.length ?? 0) > 1 ? "SKALEN" : "SKALA" : node.config.assessmentMode === "QUIZ" ? "QUIZ" : "UMFRAGE"}</span>
              </button>
              <button className="insert-between" onClick={() => setInsertMenuIndex(index)} aria-label={`Seite nach Seite ${index + 1} einfügen`}><Plus size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      <main className="editor-canvas-area" ref={canvasAreaRef}>
        {selected?.type === "PDF_PAGE" && selected.config.objectKey && selected.config.pageNumber ? (
          <div className="pdf-stage editor-slide-frame" style={slideStyle}><PdfPageCanvas objectKey={selected.config.objectKey} pageNumber={selected.config.pageNumber} fitContainer /></div>
        ) : selected?.type === "JOIN_PAGE" ? (
          <div className="join-page-canvas editor-slide-frame" style={slideStyle}><div className="join-page-copy"><h1>Jetzt teilnehmen</h1><p>QR-Code scannen oder Webadresse im Browser öffnen.</p><strong className="join-page-domain">{publicHost}</strong></div><div className="join-page-access-card"><span className="join-page-qr"><QrCode size={224} /></span><div className="join-page-code"><small>RAUMCODE</small><strong>123 456</strong></div></div></div>
        ) : selected?.type === "CONTENT_PAGE" ? (
          <div className="content-page-canvas editor-slide-frame" style={slideStyle}><h1>{contentTitle || "Neue Informationsseite"}</h1><p className="content-page-body">{contentBody || "Ergänzen Sie hier Ihre Inhalte."}</p></div>
        ) : selected?.type === "FREEFORM_PAGE" ? (
          <FreeformPageEditor backgroundColor={freeformBackground} elements={freeformElements} selectedId={selectedFreeformElementId} onSelect={setSelectedFreeformElementId} onChange={changeFreeformElements} onAddText={addFreeformText} onDelete={removeSelectedFreeformElement} style={slideStyle} />
        ) : selected?.type === "GROUP_PAGE" ? (
          <div className="group-page-canvas editor-slide-frame" style={slideStyle}><h1>{groupQuestion || "Finden Sie Ihre Gruppe"}</h1><p>{groupPrompt}</p><div className="group-page-example-grid"><article><UsersRound size={20} /><strong>Gruppe Grün</strong><span>4 Mitglieder</span></article><article><UsersRound size={20} /><strong>Gruppe Blau</strong><span>3 Mitglieder</span></article><article className="create"><Plus size={20} /><strong>Gruppe erstellen</strong><span>Oder einer Gruppe beitreten</span></article></div></div>
        ) : selected?.type === "GROUP_DISCUSSION" ? (
          <div className="group-page-canvas discussion-page-canvas editor-slide-frame" style={slideStyle}><div className="discussion-editor-center"><h1>{groupQuestion || "Diskutieren Sie in Ihren Gruppen"}</h1>{groupDurationMinutes > 0 && <div className="discussion-editor-timer"><Clock3 size={24} /><strong>{String(groupDurationMinutes).padStart(2, "0")}:00</strong><span>Zeit für die Gruppenarbeit</span></div>}</div><div className="discussion-editor-footer"><strong>0 / 4 Gruppen fertig</strong></div></div>
        ) : selected?.type === "GROUP_PRESENTATION" ? (
          <div className="group-presentation-canvas editor-slide-frame" style={slideStyle}><header><span>GRUPPE 1 VON 4</span><h1>{question || "Ergebnisse aus den Gruppen"}</h1></header><section><div className="group-presentation-team"><UsersRound size={28} /><div><strong>Gruppe Grün</strong><span>Alex · Anna · Ben · Clara</span></div></div><div className="group-presentation-answer-list"><article><b>1</b><p>Eine gemeinsame Lösung entwickeln</p></article><article><b>2</b><p>Nächste Schritte und Zuständigkeiten festhalten</p></article></div></section><footer><span>Diese Gruppe präsentiert jetzt.</span><div><i className="active" /><i /><i /><i /></div></footer></div>
        ) : selected?.type === "PRIORITY_VOTE" ? (
          <div className="priority-page-canvas editor-slide-frame" style={slideStyle}><h1>{question || "Welche Ergebnisse sind am wichtigsten?"}</h1><div className="priority-editor-source"><Vote size={32} /><strong>Gruppenantworten werden hier priorisiert</strong><span>{prioritySourceNode ? `Aus Seite ${prioritySourceNode.position + 1}: ${prioritySourceNode.config.question || "Gruppendiskussion"}` : "Wählen Sie rechts eine Gruppendiskussion als Quelle."}</span><small>Während der Sitzung erscheint jede gespeicherte Gruppenantwort als eigener Punkt.</small></div><p className="priority-preview-note">Bis zu {priorityMaxVotes} {priorityMaxVotes === 1 ? "Stimme" : "Stimmen"} pro Person · Top {priorityMaxVisibleResults} auf der Leinwand · {resultDisplayMode === "LIVE" ? "Ergebnisse live" : "Ergebnisse nach Freigabe"}</p></div>
        ) : selected?.type === "RATING" ? (
          ratingStatements.length > 1 ? <div className="multi-scale-canvas editor-slide-frame" style={slideStyle}><h1>{question || "Bewerten Sie die folgenden Aussagen"}</h1><div className="multi-scale-editor-list">{ratingStatements.map((statement, index) => <article key={index}><strong>{statement || `Aussage ${index + 1}`}</strong><div><i /><span style={{ left: `${((index + 1) / (ratingStatements.length + 1)) * 100}%` }}>{ratingMin + index % (ratingMax - ratingMin + 1)}</span></div></article>)}</div><footer><span>{ratingMinLabel}</span><b>{ratingMin}–{ratingMax} Punkte</b><span>{ratingMaxLabel}</span></footer></div> : <div className="poll-canvas rating-canvas editor-slide-frame" style={slideStyle}><div className="rating-canvas-center"><h1>{question || "Neue Skalenfrage"}</h1><p>Wählen Sie eine Bewertung</p><RatingScaleRail min={ratingMin} max={ratingMax} minLabel={ratingMinLabel} maxLabel={ratingMaxLabel} /></div></div>
        ) : selected ? (
          <div className={`${assessmentMode === "QUIZ" ? "poll-canvas quiz-canvas" : "poll-canvas"} editor-slide-frame`} style={slideStyle}><h1>{question || "Neue Frage"}</h1><p>Eine Antwort auswählen</p><div className="canvas-options">{options.map((option, index) => <div className={assessmentMode === "QUIZ" && correctOptionIndex === index ? "correct" : ""} key={`${index}-${option}`}><span>{String.fromCharCode(65 + index)}</span>{option || `Option ${index + 1}`}{assessmentMode === "QUIZ" && correctOptionIndex === index && <Check size={16} />}</div>)}</div></div>
        ) : <div className="empty-canvas"><FileText size={34} /><p>Wählen Sie eine Seite aus.</p></div>}
      </main>

      <aside className="properties-panel">
        <div className="panel-heading"><span>EIGENSCHAFTEN</span><strong>{selected?.type === "PDF_PAGE" ? "PDF-Seite" : selected?.type === "JOIN_PAGE" ? "Teilnahmeseite" : selected?.type === "CONTENT_PAGE" ? "Informationsseite" : selected?.type === "FREEFORM_PAGE" ? "Freie Seite" : selected?.type === "GROUP_PAGE" ? "Gruppen erstellen" : selected?.type === "GROUP_DISCUSSION" ? "Gruppendiskussion" : selected?.type === "GROUP_PRESENTATION" ? "Gruppenergebnisse" : selected?.type === "PRIORITY_VOTE" ? "Priorisierung" : selected?.type === "RATING" ? ratingStatements.length > 1 ? "Bewertungsskalen" : "Skala" : assessmentMode === "QUIZ" ? "Single Choice Quiz" : "Single Choice"}</strong></div>
        {selected?.type === "PDF_PAGE" ? (
          <div className="pdf-properties"><FileText size={28} /><h3>Seite {selected.sourcePageNumber}</h3><p>{selected.config.originalName}</p><dl><div><dt>Typ</dt><dd>PDF</dd></div><div><dt>Position</dt><dd>{selected.position + 1}</dd></div></dl><p className="property-hint">Ziehen Sie diese Seite im Ablauf nach oben oder unten, um ihre Position zu ändern.</p></div>
        ) : selected?.type === "JOIN_PAGE" ? (
          <div className="pdf-properties join-properties"><QrCode size={28} /><h3>Teilnahmeseite</h3><p>Zeigt beim Präsentieren den aktuellen QR-Code und Raumcode.</p><dl><div><dt>Typ</dt><dd>Teilnahme</dd></div><div><dt>Position</dt><dd>{selected.position + 1}</dd></div></dl><p className="property-hint">Ziehen Sie die Seite an die Stelle, an der das Publikum beitreten soll.</p><div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div></div>
        ) : selected?.type === "CONTENT_PAGE" ? (
          <div className="content-properties">
            <label>Titel<textarea maxLength={180} value={contentTitle} onChange={(event) => { setContentTitle(event.target.value); setDirty(true); }} rows={3} /></label>
            <label>Text<textarea maxLength={5000} value={contentBody} onChange={(event) => { setContentBody(event.target.value); setDirty(true); }} rows={10} /></label>
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : selected?.type === "FREEFORM_PAGE" ? (
          <div className="freeform-properties">
            <div className="freeform-add-actions">
              <button onClick={addFreeformText}><Type size={17} /> Text</button>
              <button disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}><ImagePlus size={17} /> {uploadingImage ? "Lädt…" : "Bild"}</button>
              <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void uploadFreeformImage(event.target.files?.[0])} />
            </div>
            <label className="freeform-color-label">Hintergrund<span><input type="color" value={freeformBackground} onChange={(event) => { setFreeformBackground(event.target.value); setDirty(true); }} />{freeformBackground}</span></label>
            {selectedFreeformElement?.type === "TEXT" ? (
              <div className="freeform-element-properties">
                <div className="option-heading"><span>Text bearbeiten</span><small>Ausgewählt</small></div>
                <label>Inhalt<textarea rows={7} maxLength={5000} value={selectedFreeformElement.text} onChange={(event) => updateSelectedFreeformElement({ text: event.target.value })} /></label>
                <div className="freeform-inline-fields">
                  <label>Größe<input type="number" min={8} max={200} value={selectedFreeformElement.fontSize} onChange={(event) => updateSelectedFreeformElement({ fontSize: Math.max(8, Math.min(200, Number(event.target.value))) })} /></label>
                  <label>Farbe<span><input type="color" value={selectedFreeformElement.color} onChange={(event) => updateSelectedFreeformElement({ color: event.target.value })} />{selectedFreeformElement.color}</span></label>
                </div>
                <div className="freeform-format-actions">
                  <button className={selectedFreeformElement.fontWeight === 700 ? "active" : ""} onClick={() => updateSelectedFreeformElement({ fontWeight: selectedFreeformElement.fontWeight === 700 ? 400 : 700 })} aria-label="Fett"><Bold size={16} /></button>
                  <button className={selectedFreeformElement.fontStyle === "italic" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ fontStyle: selectedFreeformElement.fontStyle === "italic" ? "normal" : "italic" })} aria-label="Kursiv"><Italic size={16} /></button>
                  <button className={selectedFreeformElement.textAlign === "left" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ textAlign: "left" })} aria-label="Linksbündig"><AlignLeft size={16} /></button>
                  <button className={selectedFreeformElement.textAlign === "center" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ textAlign: "center" })} aria-label="Zentriert"><AlignCenter size={16} /></button>
                  <button className={selectedFreeformElement.textAlign === "right" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ textAlign: "right" })} aria-label="Rechtsbündig"><AlignRight size={16} /></button>
                  <button className={selectedFreeformElement.listStyle === "bullet" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ listStyle: selectedFreeformElement.listStyle === "bullet" ? "none" : "bullet" })} aria-label="Ungeordnete Liste" title="Ungeordnete Liste"><List size={16} /></button>
                  <button className={selectedFreeformElement.listStyle === "number" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ listStyle: selectedFreeformElement.listStyle === "number" ? "none" : "number" })} aria-label="Nummerierte Liste" title="Nummerierte Liste"><ListOrdered size={16} /></button>
                </div>
                <button className="freeform-delete-element" onClick={removeSelectedFreeformElement}><Trash2 size={15} /> Element löschen</button>
              </div>
            ) : selectedFreeformElement?.type === "IMAGE" ? (
              <div className="freeform-element-properties">
                <div className="option-heading"><span>Bild bearbeiten</span><small>Ausgewählt</small></div>
                <div className="freeform-fit-actions"><button className={selectedFreeformElement.objectFit === "contain" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ objectFit: "contain" })}>Einpassen</button><button className={selectedFreeformElement.objectFit === "cover" ? "active" : ""} onClick={() => updateSelectedFreeformElement({ objectFit: "cover" })}>Ausfüllen</button></div>
                <button className="freeform-delete-element" onClick={removeSelectedFreeformElement}><Trash2 size={15} /> Element löschen</button>
              </div>
            ) : null}
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Seite löschen</button></div>
          </div>
        ) : selected?.type === "GROUP_PAGE" ? (
          <div className="content-properties group-properties">
            <label>Titel<textarea rows={3} maxLength={300} value={groupQuestion} onChange={(event) => { setGroupQuestion(event.target.value); setDirty(true); }} /></label>
            <label>Hinweis<textarea rows={5} maxLength={1000} value={groupPrompt} onChange={(event) => { setGroupPrompt(event.target.value); setDirty(true); }} /></label>
            <label>Maximale Gruppen<input type="number" min={2} max={20} value={groupMaxGroups} onChange={(event) => { setGroupMaxGroups(Math.max(2, Math.min(20, Number(event.target.value)))); setDirty(true); }} /></label>
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : selected?.type === "GROUP_DISCUSSION" ? (
          <div className="content-properties group-properties">
            <label>Titel<textarea rows={3} maxLength={300} value={groupQuestion} onChange={(event) => { setGroupQuestion(event.target.value); setDirty(true); }} /></label>
            <div className="property-inline-fields"><label>Dauer (Min.)<input type="number" min={0} max={180} value={groupDurationMinutes} onChange={(event) => { setGroupDurationMinutes(Math.max(0, Math.min(180, Number(event.target.value)))); setDirty(true); }} /></label><label>Antworten pro Gruppe<input type="number" min={0} max={12} value={groupMaxAnswers} onChange={(event) => { setGroupMaxAnswers(Math.max(0, Math.min(12, Number(event.target.value)))); setDirty(true); }} /></label></div>
            <label>Gruppen aus<select value={groupSourceNodeId ?? ""} onChange={(event) => { setGroupSourceNodeId(event.target.value || null); setDirty(true); }}><option value="">Keine Gruppenseite gewählt</option>{presentation.nodes.filter((node) => node.type === "GROUP_PAGE").map((node) => <option key={node.id} value={node.id}>Seite {node.position + 1}: {node.config.question || "Gruppen erstellen"}</option>)}</select></label>
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : selected?.type === "GROUP_PRESENTATION" ? (
          <div className="content-properties group-properties">
            <label>Titel<textarea rows={3} maxLength={300} value={question} onChange={(event) => { setQuestion(event.target.value); setDirty(true); }} /></label>
            <label>Ergebnisse aus<select value={groupPresentationSourceNodeId ?? ""} onChange={(event) => { setGroupPresentationSourceNodeId(event.target.value || null); setDirty(true); }}><option value="">Keine Diskussion gewählt</option>{presentation.nodes.filter((node) => node.type === "GROUP_DISCUSSION").map((node) => <option key={node.id} value={node.id}>Seite {node.position + 1}: {node.config.question || "Gruppendiskussion"}</option>)}</select></label>
            <p className="property-hint">Während der Präsentation wird jeweils eine Gruppe mit ihren Mitgliedern und Antworten gezeigt. Die Moderation wechselt zur nächsten Gruppe.</p>
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : selected?.type === "PRIORITY_VOTE" ? (
          <div className="poll-properties priority-properties">
            <label>Frage<textarea rows={4} maxLength={300} value={question} onChange={(event) => { setQuestion(event.target.value); setDirty(true); }} /></label>
            <label>Ergebnisse aus<select value={prioritySourceGroupNodeId ?? ""} onChange={(event) => { setPrioritySourceGroupNodeId(event.target.value || null); setDirty(true); }}><option value="">Keine Diskussion gewählt</option>{presentation.nodes.filter((node) => node.type === "GROUP_DISCUSSION").map((node) => <option key={node.id} value={node.id}>Seite {node.position + 1}: {node.config.question || "Gruppendiskussion"}</option>)}</select></label>
            <div className="property-inline-fields"><label>Stimmen pro Person<input type="number" min={1} max={10} value={priorityMaxVotes} onChange={(event) => { setPriorityMaxVotes(Math.max(1, Math.min(10, Number(event.target.value)))); setDirty(true); }} /></label><label>Ergebnisse auf Leinwand<input type="number" min={1} max={10} value={priorityMaxVisibleResults} onChange={(event) => { setPriorityMaxVisibleResults(Math.max(1, Math.min(10, Number(event.target.value)))); setDirty(true); }} /></label></div>
            <p className="property-hint">Jede Zeile eines Gruppenergebnisses wird zu einem eigenen Punkt. Eine Person kann jeden Punkt höchstens einmal wählen.</p>
            <ResultDisplaySetting value={resultDisplayMode} onChange={(value) => { setResultDisplayMode(value); setDirty(true); }} />
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : selected?.type === "RATING" ? (
          <div className="poll-properties rating-properties">
            <label>Titel<textarea value={question} onChange={(event) => { setQuestion(event.target.value); setDirty(true); }} rows={3} /></label>
            <div className="option-heading"><span>Aussagen</span><small>{ratingStatements.length} / 6</small></div>
            {ratingStatements.map((statement, index) => <div className="scale-statement-input" key={index}><span>{index + 1}</span><textarea rows={2} maxLength={240} value={statement} onChange={(event) => { setRatingStatements((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value)); setDirty(true); }} /><button disabled={ratingStatements.length <= 1} onClick={() => { setRatingStatements((current) => current.filter((_, itemIndex) => itemIndex !== index)); setDirty(true); }} aria-label="Aussage entfernen"><Trash2 size={15} /></button></div>)}
            <button className="add-option" disabled={ratingStatements.length >= 6} onClick={() => { setRatingStatements((current) => [...current, `Aussage ${current.length + 1}`]); setDirty(true); }}><Plus size={15} /> Aussage hinzufügen</button>
            <div className="option-heading"><span>Skalenbereich</span><small>{ratingMin}–{ratingMax}</small></div>
            <div className="rating-range-inputs"><label>Von<input type="number" min={0} max={Math.min(99, ratingMax - 1)} value={ratingMin} onChange={(event) => { setRatingMin(Number(event.target.value)); setDirty(true); }} /></label><label>Bis<input type="number" min={ratingMin + 1} max={100} value={ratingMax} onChange={(event) => { setRatingMax(Number(event.target.value)); setDirty(true); }} /></label></div>
            <div className="rating-label-inputs"><label>Linke Beschriftung<input value={ratingMinLabel} onChange={(event) => { setRatingMinLabel(event.target.value); setDirty(true); }} /></label><label>Rechte Beschriftung<input value={ratingMaxLabel} onChange={(event) => { setRatingMaxLabel(event.target.value); setDirty(true); }} /></label></div>
            <ResultDisplaySetting value={resultDisplayMode} onChange={(value) => { setResultDisplayMode(value); setDirty(true); }} />
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : selected ? (
          <div className="poll-properties">
            <label>Frage<textarea value={question} onChange={(event) => { setQuestion(event.target.value); setDirty(true); }} rows={4} /></label>
            <div className="option-heading"><span>{assessmentMode === "QUIZ" ? "Antworten · richtige markieren" : "Antwortoptionen"}</span><small>{options.length} / 8</small></div>
            {assessmentMode === "QUIZ" && <p className="quiz-property-hint"><Trophy size={15} /> Wählen Sie genau eine richtige Antwort. Sie wird Teilnehmenden erst mit den Ergebnissen gezeigt.</p>}
            {options.map((option, index) => <div className={assessmentMode === "QUIZ" ? "option-input quiz" : "option-input"} key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} onChange={(event) => { setOptions((current) => current.map((value, optionIndex) => optionIndex === index ? event.target.value : value)); setDirty(true); }} />{assessmentMode === "QUIZ" && <button className={correctOptionIndex === index ? "correct-answer active" : "correct-answer"} onClick={() => { setCorrectOptionIndex(index); setDirty(true); }} aria-label={`${option || `Antwort ${index + 1}`} als richtig markieren`} title="Als richtige Antwort markieren"><Check size={15} /></button>}<button disabled={options.length <= 2} onClick={() => { setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index)); setCorrectOptionIndex((current) => current === index ? 0 : current > index ? current - 1 : current); setDirty(true); }} aria-label="Option entfernen"><Trash2 size={15} /></button></div>)}
            <button className="add-option" disabled={options.length >= 8} onClick={() => { setOptions((current) => [...current, `Option ${current.length + 1}`]); setDirty(true); }}><Plus size={15} /> Option hinzufügen</button>
            {assessmentMode === "QUIZ" ? <div className="quiz-result-note"><EyeOff size={16} /><div><strong>Auflösung am Ende</strong><span>Die richtige Antwort bleibt verborgen, bis Sie die Ergebnisse freigeben.</span></div></div> : <ResultDisplaySetting value={resultDisplayMode} onChange={(value) => { setResultDisplayMode(value); setDirty(true); }} />}
            <div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div>
          </div>
        ) : null}
        {error && <p className="form-error">{error}</p>}
      </aside>
      {pageContextMenu && <div className="page-context-menu" role="menu" style={{ left: pageContextMenu.x, top: pageContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><button role="menuitem" onClick={() => { const node = presentation.nodes.find((entry) => entry.id === pageContextMenu.nodeId); if (node) void removeNode(node); }}><Trash2 size={16} /> Löschen</button></div>}
      {insertMenuIndex !== null && <InteractionPicker onClose={() => setInsertMenuIndex(null)} onChoose={(type) => void insertAfter(insertMenuIndex, type)} />}
    </div>
  );
}
