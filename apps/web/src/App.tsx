import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Fullscreen,
  LayoutDashboard,
  Lock,
  MessageCircleMore,
  MoreHorizontal,
  Play,
  Plus,
  Presentation,
  QrCode,
  Radio,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  api,
  connectToSession,
  type PresentationSummary,
  type SessionSnapshot,
} from "./api";
import EditorView from "./EditorView";
import PreviewView from "./PreviewView";
import ResultsView from "./ResultsView";
import { PdfPageCanvas } from "./PdfPage";

type Route = "dashboard" | "editor" | "results" | "preview" | "present" | "join";

function currentRoute(): Route {
  if (/^\/app\/presentations\/[^/]+\/edit/.test(window.location.pathname)) return "editor";
  if (window.location.pathname.startsWith("/app/results")) return "results";
  if (window.location.pathname.startsWith("/preview/")) return "preview";
  if (window.location.pathname.startsWith("/present/")) return "present";
  if (window.location.pathname.startsWith("/join/")) return "join";
  return "dashboard";
}

function pathId() {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? "");
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Brand() {
  return (
    <div className="brand" aria-label="MitRede">
      <span className="brand-mark" aria-hidden="true"><MessageCircleMore size={22} strokeWidth={2.4} /></span>
      <span>MitRede</span>
    </div>
  );
}

function UploadDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createPresentation(title.trim(), file);
      await onCreated();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div><p className="eyebrow">NEUE PRÄSENTATION</p><h2 id="upload-title">PDF hochladen</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen"><X size={20} /></button>
        </div>
        <label className="field-label">Titel<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Methodenwerkstatt" autoFocus required /></label>
        <label className={file ? "file-drop selected" : "file-drop"}>
          <Upload size={28} />
          <strong>{file ? file.name : "PDF auswählen"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Bis zu 100 MB"}</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        </label>
        <p className="dialog-note">Die PDF-Seiten werden angelegt und eine erste Single-Choice-Frage wird automatisch ergänzt.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !file || !title.trim()}>{busy ? "Wird verarbeitet…" : "Präsentation anlegen"}</button></div>
      </form>
    </div>
  );
}

function Dashboard() {
  const [presentations, setPresentations] = useState<PresentationSummary[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [quickCode, setQuickCode] = useState("");

  const load = useCallback(async () => {
    try {
      setPresentations(await api.listPresentations());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => void load(), 3000);
    return () => window.clearTimeout(timer);
  }, [error, load]);

  async function start(presentationId: string) {
    setStartingId(presentationId);
    try {
      const session = await api.startSession(presentationId);
      navigate(`/present/${session.sessionId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sitzung konnte nicht gestartet werden");
      setStartingId(null);
    }
  }

  const icons = [Sparkles, Users, Presentation];
  const tones = ["teal", "coral", "blue"];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="main-nav" aria-label="Hauptnavigation">
          <a className="nav-item active" href="/app"><LayoutDashboard size={18} /> Übersicht</a>
          <a className="nav-item" href="#presentations"><Presentation size={18} /> Präsentationen</a>
          <a className="nav-item" href="/app/results?filter=live"><Radio size={18} /> Live-Sitzungen</a>
          <a className="nav-item" href="/app/results"><BarChart3 size={18} /> Ergebnisse</a>
        </nav>
        <div className="sidebar-foot">
          <a className="nav-item" href="#help"><CircleHelp size={18} /> Hilfe</a>
          <a className="nav-item" href="#settings"><Settings size={18} /> Einstellungen</a>
          <div className="profile"><span className="avatar">SW</span><span><strong>Sabine Wolf</strong><small>Moderatorin</small></span><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <label className="search-box"><Search size={18} /><input aria-label="Präsentationen durchsuchen" placeholder="Präsentationen durchsuchen…" /><kbd>⌘ K</kbd></label>
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}><Plus size={18} /> Neue Präsentation</button>
        </header>

        <section className="welcome">
          <div><p className="eyebrow">MITREDE · INTERN</p><h1>Guten Morgen, Sabine.</h1><p>Was möchten Sie heute gemeinsam herausfinden?</p></div>
          <div className="quick-room"><span className="live-dot" /><div><strong>Schnell beitreten</strong><small>Sechsstelligen Raumcode eingeben</small></div><input aria-label="Raumcode" inputMode="numeric" maxLength={6} placeholder="000000" value={quickCode} onChange={(event) => setQuickCode(event.target.value.replace(/\D/g, ""))} /><button disabled={quickCode.length !== 6} onClick={() => navigate(`/join/${quickCode}`)} aria-label="Raum beitreten"><ChevronRight size={17} /></button></div>
        </section>

        <section className="section-block" id="presentations">
          <div className="section-heading"><div><p className="eyebrow">WEITERARBEITEN</p><h2>Zuletzt bearbeitet</h2></div><span className="text-button">{presentations.length} Präsentationen</span></div>
          {error && <div className="inline-error">{error} <button onClick={() => void load()}>Erneut versuchen</button></div>}
          <div className="presentation-grid">
            {loading && <div className="loading-card">Präsentationen werden geladen…</div>}
            {presentations.map((presentationItem, index) => {
              const Icon = icons[index % icons.length] ?? Presentation;
              const tone = tones[index % tones.length] ?? "teal";
              return (
                <article className="presentation-card" key={presentationItem.id}>
                  <div className={`card-preview ${tone}`}><span className="preview-kicker">MITREDE · INTERN</span><Icon size={42} strokeWidth={1.4} /><strong>{presentationItem.title}</strong><span className="slide-number">{presentationItem.pageCount + presentationItem.interactionCount} Knoten</span></div>
                  <div className="card-body"><div><h3>{presentationItem.title}</h3><p>{presentationItem.pageCount} PDF-Seiten · {presentationItem.interactionCount} Interaktionen</p></div><button className="icon-button" aria-label={`${presentationItem.title} Optionen`}><MoreHorizontal size={20} /></button></div>
                  <div className="card-foot"><span><Clock3 size={14} /> {new Date(presentationItem.updatedAt).toLocaleDateString("de-DE")}</span><div className="card-actions"><button className="edit-button" onClick={() => navigate(`/app/presentations/${presentationItem.id}/edit`)}>Bearbeiten</button><button className="start-button" disabled={startingId === presentationItem.id} onClick={() => void start(presentationItem.id)}><Play size={14} fill="currentColor" /> {startingId === presentationItem.id ? "Startet…" : "Starten"}</button></div></div>
                </article>
              );
            })}
            <button className="new-card" onClick={() => setUploadOpen(true)}><span><Plus size={24} /></span><strong>PDF hochladen</strong><small>Neue Präsentation anlegen</small></button>
          </div>
        </section>

        <section className="next-session" id="sessions"><div className="session-date"><strong>LIVE</strong><span>BEREIT</span></div><div className="session-info"><span className="status-pill">ECHTZEIT</span><h3>Eine Präsentation starten</h3><p>Mit Raumcode, anonymer Teilnahme und Live-Ergebnissen</p></div><div className="session-people"><span>QR</span><span>WS</span><span>+?</span></div><button className="btn btn-secondary" onClick={() => setUploadOpen(true)}>Vorbereiten <ChevronRight size={17} /></button></section>
      </main>
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onCreated={load} />}
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return <div className="status-screen"><Brand /><div className="status-spinner" /><p>{message}</p><button className="text-button" onClick={() => navigate("/app")}>Zur Übersicht</button></div>;
}

function SessionResultDisplay({ options, counts, total, rating }: { options: string[]; counts: number[]; total: number; rating: boolean }) {
  const average = total ? options.reduce((sum, option, index) => sum + Number(option) * (counts[index] ?? 0), 0) / total : 0;
  return <>{rating && <div className="live-rating-average"><strong>{average.toFixed(1)}</strong><span>Durchschnitt</span></div>}<div className={rating ? "result-list rating" : "result-list"}>{options.map((label, index) => { const count = counts[index] ?? 0; const percentage = total ? Math.round(count / total * 100) : 0; return <div className="result-row" key={label}><span className="result-letter">{rating ? label : String.fromCharCode(65 + index)}</span><div><div className="result-label"><strong>{rating ? `${label} Punkte` : label}</strong><span>{count} Stimmen · {percentage}%</span></div><div className="result-track"><span style={{ width: `${percentage}%` }} /></div></div></div>; })}</div></>;
}

function PresenterView() {
  const sessionId = pathId();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setSnapshot(await api.sessionSnapshot(sessionId)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Sitzung nicht erreichbar"); }
  }, [sessionId]);

  useEffect(() => {
    void load();
    const socket = connectToSession(sessionId, () => void load());
    return () => { socket.disconnect(); };
  }, [load, sessionId]);

  async function update(body: { interactionStatus?: SessionSnapshot["interactionStatus"]; resultsVisible?: boolean; currentNodeId?: string }) {
    try { setSnapshot(await api.updateSession(sessionId, body)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Status konnte nicht geändert werden"); }
  }

  async function endSession() {
    if (!window.confirm("Präsentation beenden und Ergebnisse speichern?")) return;
    try {
      await api.endSession(sessionId);
      navigate(`/app/results/${sessionId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sitzung konnte nicht beendet werden");
    }
  }

  if (!snapshot) return <LoadingScreen message={error || "Live-Sitzung wird geladen…"} />;
  const poll = snapshot.currentNode?.config;
  const total = snapshot.results.total;
  const timeline = snapshot.timeline ?? [];
  const currentIndex = timeline.findIndex((node) => node.id === snapshot.currentNode?.id);
  const isPdf = snapshot.currentNode?.type === "PDF_PAGE";
  const isRating = snapshot.currentNode?.type === "RATING";

  function move(offset: number) {
    const next = timeline[currentIndex + offset];
    if (next) void update({ currentNodeId: next.id });
  }

  return (
    <div className="presenter-shell">
      <header className="presenter-topbar"><button className="icon-button dark" onClick={() => void endSession()} aria-label="Präsentation beenden" title="Präsentation beenden"><X size={21} /></button><div><strong>{snapshot.presentation.title}</strong><span className="live-badge"><i /> LIVE</span></div><div className="presenter-meta"><Users size={18} /> {total} Antworten <button className="room-code" onClick={() => navigate(`/join/${snapshot.roomCode}`)} title="Teilnahmeansicht öffnen"><QrCode size={18} /> {snapshot.roomCode.slice(0, 3)} {snapshot.roomCode.slice(3)}</button></div></header>
      <main className="stage-wrap">{isPdf && poll?.objectKey && poll.pageNumber ? <div className="presented-pdf"><PdfPageCanvas objectKey={poll.objectKey} pageNumber={poll.pageNumber} /></div> : <div className="stage"><p className="stage-kicker">{isRating ? "LIVE-SKALA" : "LIVE-UMFRAGE"}</p><h1>{poll?.question ?? "Keine aktuelle Frage"}</h1><p className="stage-subtitle">{isRating ? "Wählen Sie eine Bewertung" : "Eine Antwort auswählen"}</p>{snapshot.resultsVisible ? <SessionResultDisplay options={poll?.options ?? []} counts={snapshot.results.counts} total={total} rating={isRating} /> : <div className="results-hidden"><BarChart3 size={34} /><strong>Ergebnisse verborgen</strong><span>Die Stimmen werden weiterhin gesammelt.</span></div>}<p className="answer-count"><Check size={16} /> {total} Antworten eingegangen</p></div>}</main>
      <footer className="presenter-controls"><div className="page-controls"><button disabled={currentIndex <= 0} onClick={() => move(-1)}><ArrowLeft size={19} /></button><span>{currentIndex + 1} / {timeline.length}</span><button disabled={currentIndex < 0 || currentIndex >= timeline.length - 1} onClick={() => move(1)}><ArrowRight size={19} /></button></div><div className="moderation-controls">{isPdf ? <span className="pdf-live-label"><FileText size={17} /> PDF-Seite {snapshot.currentNode?.sourcePageNumber}</span> : <><button className={snapshot.interactionStatus === "ACCEPTING" ? "control active" : "control"} onClick={() => void update({ interactionStatus: snapshot.interactionStatus === "ACCEPTING" ? "LOCKED" : "ACCEPTING" })}>{snapshot.interactionStatus === "ACCEPTING" ? <Radio size={18} /> : <Lock size={18} />}{snapshot.interactionStatus === "ACCEPTING" ? "Antworten offen" : "Antworten gesperrt"}</button><button className={snapshot.resultsVisible ? "control active" : "control"} onClick={() => void update({ resultsVisible: !snapshot.resultsVisible })}><BarChart3 size={18} /> {snapshot.resultsVisible ? "Ergebnisse sichtbar" : "Ergebnisse verborgen"}</button></>}</div><button className="control" onClick={() => document.documentElement.requestFullscreen?.()}><Fullscreen size={18} /></button></footer>
    </div>
  );
}

function participantToken() {
  const key = "mitrede-participant-token";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  localStorage.setItem(key, created);
  return created;
}

function JoinView() {
  const roomCode = pathId().replace(/\s/g, "");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setSnapshot(await api.roomSnapshot(roomCode)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Raum nicht erreichbar"); }
  }, [roomCode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!snapshot?.sessionId) return;
    const socket = connectToSession(snapshot.sessionId, () => void load());
    return () => { socket.disconnect(); };
  }, [load, snapshot?.sessionId]);
  useEffect(() => { setSelected(null); setSubmitted(false); }, [snapshot?.currentNode?.id]);

  async function submit() {
    if (selected === null || !snapshot?.currentNode) return;
    setSending(true);
    try {
      setSnapshot(await api.submitAnswer(roomCode, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: crypto.randomUUID(), optionIndex: selected }));
      setSubmitted(true);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Antwort konnte nicht gespeichert werden"); }
    finally { setSending(false); }
  }

  if (!snapshot) return <LoadingScreen message={error || "Raum wird geöffnet…"} />;
  const options = snapshot.currentNode?.config.options ?? [];
  const accepting = snapshot.interactionStatus === "ACCEPTING";
  const waitingForPresentation = snapshot.currentNode?.type === "PDF_PAGE";
  const isRating = snapshot.currentNode?.type === "RATING";

  return (
    <div className="join-shell">
      <header className="join-topbar"><Brand /><span><i /> Verbunden</span></header>
      <main className={waitingForPresentation ? "join-card join-wait" : "join-card"}>
        {waitingForPresentation ? <><FileText size={42} /><p className="eyebrow">PRÄSENTATION LÄUFT</p><h1>Bitte schauen Sie auf die Leinwand.</h1><p>Die nächste Interaktion erscheint automatisch auf diesem Gerät.</p></> : <>
          <p className="eyebrow">{isRating ? "LIVE-SKALA" : "LIVE-UMFRAGE"} · RAUM {snapshot.roomCode}</p>
          <h1>{snapshot.currentNode?.config.question ?? "Warten auf die nächste Frage"}</h1>
          <p>{accepting ? isRating ? "Wählen Sie eine Bewertung." : "Wählen Sie eine Antwort." : "Diese Frage ist derzeit gesperrt."}</p>
          <div className={isRating ? "join-options join-rating" : "join-options"}>{options.map((option, index) => <button className={selected === index ? "join-option selected" : "join-option"} key={option} disabled={!accepting} onClick={() => { setSelected(index); setSubmitted(false); }}><span>{isRating ? option : String.fromCharCode(65 + index)}</span>{!isRating && option}{selected === index && <Check size={20} />}</button>)}</div>
          {isRating && <div className="join-rating-labels"><span>{snapshot.currentNode?.config.minLabel}</span><span>{snapshot.currentNode?.config.maxLabel}</span></div>}
          <button className="btn btn-primary submit-answer" disabled={!accepting || selected === null || sending} onClick={() => void submit()}>{submitted ? <><Check size={19} /> Bewertung gespeichert</> : sending ? "Wird gespeichert…" : isRating ? "Bewertung senden" : "Antwort senden"}</button>
          {snapshot.resultsVisible && <div className="mobile-results"><strong>{isRating ? "Live-Verteilung" : "Live-Ergebnis"}</strong>{options.map((option, index) => { const count = snapshot.results.counts[index] ?? 0; const percentage = snapshot.results.total ? Math.round(count / snapshot.results.total * 100) : 0; return <div key={option}><span>{isRating ? `${option} Punkte` : option}</span><i><b style={{ width: `${percentage}%` }} /></i><small>{percentage}%</small></div>; })}</div>}
          {error && <p className="form-error">{error}</p>}<p className="privacy-note">Ihre Teilnahme ist anonym. Sie können Ihre Antwort ändern, solange die Interaktion geöffnet ist.</p>
        </>}
      </main>
      <footer className="join-footer">Raum <strong>{snapshot.roomCode.slice(0, 3)} {snapshot.roomCode.slice(3)}</strong><span>·</span> {snapshot.presentation.title}</footer>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => { const updateRoute = () => setRoute(currentRoute()); window.addEventListener("popstate", updateRoute); return () => window.removeEventListener("popstate", updateRoute); }, []);
  if (route === "editor") return <EditorView />;
  if (route === "results") return <ResultsView />;
  if (route === "preview") return <PreviewView />;
  if (route === "present") return <PresenterView />;
  if (route === "join") return <JoinView />;
  return <Dashboard />;
}
