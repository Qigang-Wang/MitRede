import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  GripVertical,
  MessageCircleMore,
  Play,
  Plus,
  Save,
  ScanEye,
  Trash2,
  Vote,
} from "lucide-react";
import { api, type PresentationDetails, type PresentationNode } from "./api";
import { PdfPageCanvas } from "./PdfPage";

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
  return <div className="poll-thumb"><Vote size={24} /><strong>{node.config.question || "Neue Frage"}</strong><span>{node.config.options?.length ?? 0} Optionen</span></div>;
}

export default function EditorView() {
  const presentationId = editorPresentationId();
  const [presentation, setPresentation] = useState<PresentationDetails | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
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

  useEffect(() => {
    if (!selected || selected.type === "PDF_PAGE") return;
    setQuestion(selected.config.question ?? "");
    setOptions(selected.config.options ?? []);
    setDirty(false);
    setSaveState("saved");
  }, [selected?.id]);

  useEffect(() => {
    if (!dirty || !selected || selected.type === "PDF_PAGE") return;
    if (question.trim().length < 3 || options.filter((option) => option.trim()).length < 2) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
        const updated = await api.updatePoll(presentationId, selected.id, question.trim(), cleanOptions);
        setPresentation((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === updated.id ? updated : node) } : current);
        setDirty(false);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, options, presentationId, question, selected]);

  async function insertAfter(index: number) {
    if (!presentation) return;
    try {
      const created = await api.addPoll(presentationId);
      const ids = presentation.nodes.map((node) => node.id);
      ids.splice(index + 1, 0, created.id);
      const reordered = await api.reorderNodes(presentationId, ids);
      setPresentation(reordered);
      setSelectedId(created.id);
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

  async function dropBefore(targetId: string) {
    if (!presentation || !draggedId || draggedId === targetId) return;
    const nodes = [...presentation.nodes];
    const sourceIndex = nodes.findIndex((node) => node.id === draggedId);
    const targetIndex = nodes.findIndex((node) => node.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = nodes.splice(sourceIndex, 1);
    if (!moved) return;
    nodes.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, moved);
    setDraggedId(null);
    setPresentation(await api.reorderNodes(presentationId, nodes.map((node) => node.id)));
  }

  async function start() {
    const session = await api.startSession(presentationId);
    go(`/present/${session.sessionId}`);
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
        <button className="insert-node" onClick={() => void insertAfter(-1)} title="Interaktion am Anfang einfügen"><Plus size={14} /> Interaktion</button>
        <div className="node-list">
          {presentation.nodes.map((node, index) => (
            <div className="node-stack" key={node.id}>
              <button
                className={node.id === selectedId ? "node-card selected" : "node-card"}
                onClick={() => setSelectedId(node.id)}
                draggable={node.type !== "PDF_PAGE"}
                onDragStart={() => node.type !== "PDF_PAGE" && setDraggedId(node.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void dropBefore(node.id)}
              >
                <span className="node-index">{index + 1}</span>
                {node.type !== "PDF_PAGE" && <GripVertical className="drag-handle" size={15} />}
                <NodeThumb node={node} />
                <span className={node.type === "PDF_PAGE" ? "node-kind pdf" : "node-kind poll"}>{node.type === "PDF_PAGE" ? `PDF ${node.sourcePageNumber}` : "UMFRAGE"}</span>
              </button>
              <button className="insert-between" onClick={() => void insertAfter(index)} aria-label={`Interaktion nach Seite ${index + 1} einfügen`}><Plus size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      <main className="editor-canvas-area">
        {selected?.type === "PDF_PAGE" && selected.config.objectKey && selected.config.pageNumber ? (
          <div className="pdf-stage"><PdfPageCanvas objectKey={selected.config.objectKey} pageNumber={selected.config.pageNumber} /></div>
        ) : selected ? (
          <div className="poll-canvas"><p className="stage-kicker">LIVE-UMFRAGE</p><h1>{question || "Neue Frage"}</h1><p>Eine Antwort auswählen</p><div className="canvas-options">{options.map((option, index) => <div key={`${index}-${option}`}><span>{String.fromCharCode(65 + index)}</span>{option || `Option ${index + 1}`}</div>)}</div></div>
        ) : <div className="empty-canvas"><FileText size={34} /><p>Wählen Sie eine Seite aus.</p></div>}
      </main>

      <aside className="properties-panel">
        <div className="panel-heading"><span>EIGENSCHAFTEN</span><strong>{selected?.type === "PDF_PAGE" ? "PDF-Seite" : "Single Choice"}</strong></div>
        {selected?.type === "PDF_PAGE" ? <div className="pdf-properties"><FileText size={28} /><h3>Seite {selected.sourcePageNumber}</h3><p>{selected.config.originalName}</p><dl><div><dt>Typ</dt><dd>PDF</dd></div><div><dt>Position</dt><dd>{selected.position + 1}</dd></div></dl><p className="property-hint">PDF-Seiten bleiben in ihrer ursprünglichen Reihenfolge. Interaktionen können dazwischen verschoben werden.</p></div> : selected ? <div className="poll-properties"><label>Frage<textarea value={question} onChange={(event) => { setQuestion(event.target.value); setDirty(true); }} rows={4} /></label><div className="option-heading"><span>Antwortoptionen</span><small>{options.length} / 8</small></div>{options.map((option, index) => <div className="option-input" key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} onChange={(event) => { setOptions((current) => current.map((value, optionIndex) => optionIndex === index ? event.target.value : value)); setDirty(true); }} /><button disabled={options.length <= 2} onClick={() => { setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index)); setDirty(true); }} aria-label="Option entfernen"><Trash2 size={15} /></button></div>)}<button className="add-option" disabled={options.length >= 8} onClick={() => { setOptions((current) => [...current, `Option ${current.length + 1}`]); setDirty(true); }}><Plus size={15} /> Option hinzufügen</button><div className="property-actions"><button onClick={() => void duplicate()}><Copy size={16} /> Duplizieren</button><button className="danger" onClick={() => void remove()}><Trash2 size={16} /> Löschen</button></div></div> : null}
        {error && <p className="form-error">{error}</p>}
      </aside>
    </div>
  );
}
