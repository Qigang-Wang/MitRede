import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  FileText,
  EyeOff,
  Gauge,
  GripVertical,
  ListChecks,
  MessageCircleMore,
  MessageSquareText,
  Play,
  Plus,
  QrCode,
  Save,
  ScanEye,
  Trash2,
  Trophy,
  Vote,
  X,
} from "lucide-react";
import { api, prepareProjectionWindow, showProjectionWindow, type PresentationDetails, type PresentationNode } from "./api";
import { PdfPageCanvas, usePdfPageAspectRatio } from "./PdfPage";

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
    return <div className="poll-thumb rating-thumb"><Gauge size={24} /><strong>{node.config.question || "Neue Skalenfrage"}</strong><span>{node.config.min ?? 1}–{node.config.max ?? 5} Skala</span></div>;
  }
  if (node.type === "JOIN_PAGE") {
    return <div className="poll-thumb join-thumb"><QrCode size={24} /><strong>Jetzt teilnehmen</strong><span>QR-Code &amp; Raumcode</span></div>;
  }
  if (node.config.assessmentMode === "QUIZ") {
    return <div className="poll-thumb quiz-thumb"><Trophy size={24} /><strong>{node.config.question || "Neue Quizfrage"}</strong><span>{node.config.options?.length ?? 0} Antworten</span></div>;
  }
  return <div className="poll-thumb"><Vote size={24} /><strong>{node.config.question || "Neue Frage"}</strong><span>{node.config.options?.length ?? 0} Optionen</span></div>;
}

function ResultDisplaySetting({ value, onChange }: { value: "MANUAL" | "LIVE"; onChange: (value: "MANUAL" | "LIVE") => void }) {
  return <div className="result-display-setting"><div><strong>Ergebnisanzeige</strong><small>Wann sollen Stimmen auf der Leinwand erscheinen?</small></div><div className="result-display-options"><button className={value === "MANUAL" ? "active" : ""} onClick={() => onChange("MANUAL")}><strong>Am Ende</strong><span>Manuell veröffentlichen</span></button><button className={value === "LIVE" ? "active" : ""} onClick={() => onChange("LIVE")}><strong>Live</strong><span>Nach jeder Antwort</span></button></div><p>Die Antworten werden in beiden Modi sofort gespeichert.</p></div>;
}

function InteractionPicker({ onClose, onChoose }: { onClose: () => void; onChoose: (type: "JOIN_PAGE" | "MULTIPLE_CHOICE" | "RATING" | "QUIZ") => void }) {
  return (
    <div className="interaction-picker-backdrop" onMouseDown={onClose}>
      <section className="interaction-picker" role="dialog" aria-modal="true" aria-labelledby="interaction-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="interaction-picker-title">Interaktion auswählen</h2><button onClick={onClose} aria-label="Schließen"><X size={19} /></button></header>
        <div className="interaction-category participation"><div className="interaction-category-heading"><span>TEILNAHME</span></div><div className="interaction-type-grid participation">
          <button onClick={() => onChoose("JOIN_PAGE")}><span><QrCode size={24} /></span><strong>Teilnahmeseite</strong></button>
        </div></div>
        <div className="interaction-category"><div className="interaction-category-heading"><span>MEINUNGEN &amp; FEEDBACK</span></div><div className="interaction-type-grid feedback">
          <button onClick={() => onChoose("MULTIPLE_CHOICE")}><span><ListChecks size={24} /></span><strong>Single Choice</strong></button>
          <button onClick={() => onChoose("RATING")}><span><Gauge size={24} /></span><strong>Skala</strong></button>
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
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasAreaRef = useRef<HTMLElement>(null);
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

  const selected = useMemo(
    () => presentation?.nodes.find((node) => node.id === selectedId) ?? null,
    [presentation, selectedId],
  );
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
    }
    setDirty(false);
    setSaveState("saved");
  }, [selected?.id]);

  useEffect(() => {
    if (!dirty || !selected || selected.type === "PDF_PAGE" || selected.type === "JOIN_PAGE") return;
    if (question.trim().length < 3) return;
    if (selected.type === "MULTIPLE_CHOICE" && options.filter((option) => option.trim()).length < 2) return;
    if (selected.type === "RATING" && (ratingMax <= ratingMin || ratingMax - ratingMin > 10)) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const updated = selected.type === "RATING"
          ? await api.updateRating(presentationId, selected.id, { question: question.trim(), min: ratingMin, max: ratingMax, minLabel: ratingMinLabel.trim(), maxLabel: ratingMaxLabel.trim(), resultDisplayMode })
          : await api.updatePoll(presentationId, selected.id, question.trim(), options.map((option) => option.trim()).filter(Boolean), resultDisplayMode, assessmentMode, correctOptionIndex);
        setPresentation((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === updated.id ? updated : node) } : current);
        setDirty(false);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [assessmentMode, correctOptionIndex, dirty, options, presentationId, question, ratingMax, ratingMaxLabel, ratingMin, ratingMinLabel, resultDisplayMode, selected]);

  async function insertAfter(index: number, type: "JOIN_PAGE" | "MULTIPLE_CHOICE" | "RATING" | "QUIZ") {
    if (!presentation) return;
    try {
      const created = type === "JOIN_PAGE" ? await api.addJoinPage(presentationId) : type === "RATING" ? await api.addRating(presentationId) : type === "QUIZ" ? await api.addQuiz(presentationId) : await api.addPoll(presentationId);
      const ids = presentation.nodes.map((node) => node.id);
      ids.splice(index + 1, 0, created.id);
      const reordered = await api.reorderNodes(presentationId, ids);
      setPresentation(reordered);
      setSelectedId(created.id);
      setInsertMenuIndex(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Frage konnte nicht eingefügt werden"); }
  }

  async function duplicate() {
    if (!selected || selected.type === "PDF_PAGE") return;
    const created = await api.duplicateNode(presentationId, selected.id);
    await load(created.id);
  }

  async function remove() {
    if (!selected || selected.type === "PDF_PAGE") return;
    if (!window.confirm("Diese Interaktionsseite wirklich löschen?")) return;
    const currentIndex = presentation?.nodes.findIndex((node) => node.id === selected.id) ?? -1;
    const nextId = presentation?.nodes[currentIndex + 1]?.id ?? presentation?.nodes[currentIndex - 1]?.id;
    await api.deleteNode(presentationId, selected.id);
    await load(nextId);
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
        <button className="insert-node" onClick={() => setInsertMenuIndex(-1)} title="Interaktion am Anfang einfügen"><Plus size={14} /> Interaktion</button>
        <div className="node-list">
          {presentation.nodes.map((node, index) => (
            <div className="node-stack" key={node.id}>
              <button
                className={["node-card", node.id === selectedId ? "selected" : "", node.id === draggedId ? "dragging" : "", dropTarget?.id === node.id ? `drop-${dropTarget.position}` : ""].filter(Boolean).join(" ")}
                onClick={() => setSelectedId(node.id)}
                draggable
                onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); setDraggedId(node.id); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: node.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" }); }}
                onDrop={(event) => { event.preventDefault(); if (dropTarget?.id === node.id) void dropAt(node.id, dropTarget.position); }}
                onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
              >
                <span className="node-index">{index + 1}</span>
                <GripVertical className="drag-handle" size={15} />
                <NodeThumb node={node} />
                <span className={node.type === "PDF_PAGE" ? "node-kind pdf" : node.type === "JOIN_PAGE" ? "node-kind join" : node.type === "RATING" ? "node-kind rating" : node.config.assessmentMode === "QUIZ" ? "node-kind quiz" : "node-kind poll"}>{node.type === "PDF_PAGE" ? `PDF ${node.sourcePageNumber}` : node.type === "JOIN_PAGE" ? "TEILNAHME" : node.type === "RATING" ? "SKALA" : node.config.assessmentMode === "QUIZ" ? "QUIZ" : "UMFRAGE"}</span>
              </button>
              <button className="insert-between" onClick={() => setInsertMenuIndex(index)} aria-label={`Interaktion nach Seite ${index + 1} einfügen`}><Plus size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      <main className="editor-canvas-area" ref={canvasAreaRef}>
        {selected?.type === "PDF_PAGE" && selected.config.objectKey && selected.config.pageNumber ? (
          <div className="pdf-stage editor-slide-frame" style={slideStyle}><PdfPageCanvas objectKey={selected.config.objectKey} pageNumber={selected.config.pageNumber} fitContainer /></div>
        ) : selected?.type === "JOIN_PAGE" ? (
          <div className="join-page-canvas editor-slide-frame" style={slideStyle}><div><p className="stage-kicker">MITREDE</p><h1>Jetzt teilnehmen</h1><p>QR-Code scannen oder manuell beitreten.</p></div><span className="join-page-qr"><QrCode size={112} /></span><div><small>RAUMCODE</small><strong>123 456</strong><p>Wird beim Start der Präsentation erstellt.</p></div></div>
        ) : selected?.type === "RATING" ? (
          <div className="poll-canvas rating-canvas editor-slide-frame" style={slideStyle}><p className="stage-kicker">LIVE-SKALA</p><h1>{question || "Neue Skalenfrage"}</h1><p>Wählen Sie eine Bewertung</p><div className="canvas-rating-scale">{Array.from({ length: ratingMax - ratingMin + 1 }, (_, index) => <span key={index}>{ratingMin + index}</span>)}</div><div className="canvas-rating-labels"><span>{ratingMinLabel}</span><span>{ratingMaxLabel}</span></div></div>
        ) : selected ? (
          <div className={`${assessmentMode === "QUIZ" ? "poll-canvas quiz-canvas" : "poll-canvas"} editor-slide-frame`} style={slideStyle}><p className="stage-kicker">{assessmentMode === "QUIZ" ? "WISSENSFRAGE" : "LIVE-UMFRAGE"}</p><h1>{question || "Neue Frage"}</h1><p>Eine Antwort auswählen</p><div className="canvas-options">{options.map((option, index) => <div className={assessmentMode === "QUIZ" && correctOptionIndex === index ? "correct" : ""} key={`${index}-${option}`}><span>{String.fromCharCode(65 + index)}</span>{option || `Option ${index + 1}`}{assessmentMode === "QUIZ" && correctOptionIndex === index && <Check size={16} />}</div>)}</div></div>
        ) : <div className="empty-canvas"><FileText size={34} /><p>Wählen Sie eine Seite aus.</p></div>}
      </main>

      <aside className="properties-panel">
        <div className="panel-heading"><span>EIGENSCHAFTEN</span><strong>{selected?.type === "PDF_PAGE" ? "PDF-Seite" : selected?.type === "JOIN_PAGE" ? "Teilnahmeseite" : selected?.type === "RATING" ? "Skala" : assessmentMode === "QUIZ" ? "Single Choice Quiz" : "Single Choice"}</strong></div>
        {selected?.type === "PDF_PAGE" ? (
          <div className="pdf-properties"><FileText size={28} /><h3>Seite {selected.sourcePageNumber}</h3><p>{selected.config.originalName}</p><dl><div><dt>Typ</dt><dd>PDF</dd></div><div><dt>Position</dt><dd>{selected.position + 1}</dd></div></dl><p className="property-hint">Ziehen Sie diese Seite im Ablauf nach oben oder unten, um ihre Position zu ändern.</p></div>
        ) : selected?.type === "JOIN_PAGE" ? (
          <div className="pdf-properties join-properties"><QrCode size={28} /><h3>Teilnahmeseite</h3><p>Zeigt beim Präsentieren den aktuellen QR-Code und Raumcode.</p><dl><div><dt>Typ</dt><dd>Teilnahme</dd></div><div><dt>Position</dt><dd>{selected.position + 1}</dd></div></dl><p className="property-hint">Ziehen Sie die Seite an die Stelle, an der das Publikum beitreten soll.</p><div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div></div>
        ) : selected?.type === "RATING" ? (
          <div className="poll-properties rating-properties">
            <label>Frage<textarea value={question} onChange={(event) => { setQuestion(event.target.value); setDirty(true); }} rows={4} /></label>
            <div className="option-heading"><span>Skalenbereich</span><small>{ratingMin}–{ratingMax}</small></div>
            <div className="rating-range-inputs"><label>Von<input type="number" min={0} max={ratingMax - 1} value={ratingMin} onChange={(event) => { setRatingMin(Number(event.target.value)); setDirty(true); }} /></label><label>Bis<input type="number" min={ratingMin + 1} max={10} value={ratingMax} onChange={(event) => { setRatingMax(Number(event.target.value)); setDirty(true); }} /></label></div>
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
      {insertMenuIndex !== null && <InteractionPicker onClose={() => setInsertMenuIndex(null)} onChoose={(type) => void insertAfter(insertMenuIndex, type)} />}
    </div>
  );
}
