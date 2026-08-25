import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  Eye,
  EyeOff,
  LayoutDashboard,
  Lock,
  MessageCircleMore,
  MonitorCog,
  MoreHorizontal,
  MousePointer2,
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
  prepareProjectionWindow,
  showProjectionWindow,
  type PresentationSummary,
  type SessionSnapshot,
} from "./api";
import EditorView from "./EditorView";
import PreviewView from "./PreviewView";
import ResultsView from "./ResultsView";
import { PdfPageCanvas, usePdfPageAspectRatio } from "./PdfPage";
import { QRCodeSVG } from "qrcode.react";

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
    const projectionWindow = prepareProjectionWindow();
    setStartingId(presentationId);
    try {
      const session = await api.startSession(presentationId);
      showProjectionWindow(projectionWindow, session.sessionId);
      setStartingId(null);
    } catch (caught) {
      projectionWindow?.close();
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

function SessionResultDisplay({ options, counts, total, rating, correctOptionIndex }: { options: string[]; counts: number[]; total: number; rating: boolean; correctOptionIndex?: number }) {
  const average = total ? options.reduce((sum, option, index) => sum + Number(option) * (counts[index] ?? 0), 0) / total : 0;
  return <>{rating && <div className="live-rating-average"><strong>{average.toFixed(1)}</strong><span>Durchschnitt</span></div>}<div className={rating ? "result-list rating" : "result-list"}>{options.map((label, index) => { const count = counts[index] ?? 0; const percentage = total ? Math.round(count / total * 100) : 0; return <div className={correctOptionIndex === index ? "result-row correct" : "result-row"} key={label}><span className="result-letter">{rating ? label : String.fromCharCode(65 + index)}</span><div><div className="result-label"><strong>{rating ? `${label} Punkte` : label}{correctOptionIndex === index && <Check size={17} />}</strong><span>{count} Stimmen · {percentage}%</span></div><div className="result-track"><span style={{ width: `${percentage}%` }} /></div></div></div>; })}</div></>;
}

function PresenterView() {
  const sessionId = pathId();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [laserEnabled, setLaserEnabled] = useState(false);
  const [laserPoint, setLaserPoint] = useState<{ x: number; y: number } | null>(null);
  const [joinScreenVisible, setJoinScreenVisible] = useState(true);
  const [blackout, setBlackout] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [viewportSize, setViewportSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const fullscreenAttempted = useRef(false);
  const cursorTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (sessionId === "starting") return;
    try { setSnapshot(await api.sessionSnapshot(sessionId)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Sitzung nicht erreichbar"); }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId === "starting") return;
    void load();
    const socket = connectToSession(sessionId, () => void load());
    return () => { socket.disconnect(); };
  }, [load, sessionId]);

  useEffect(() => {
    if (!snapshot || fullscreenAttempted.current) return;
    fullscreenAttempted.current = true;
    if (document.fullscreenElement) return;
    void document.documentElement.requestFullscreen?.().then(() => setFullscreenRequired(false)).catch(() => setFullscreenRequired(true));
  }, [snapshot]);

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

  const timeline = snapshot?.timeline ?? [];
  const currentIndex = timeline.findIndex((node) => node.id === snapshot?.currentNode?.id);
  const referencePdf = timeline.find((node) => node.type === "PDF_PAGE" && node.config.objectKey && node.config.pageNumber);
  const slideAspectRatio = usePdfPageAspectRatio(referencePdf?.config.objectKey, referencePdf?.config.pageNumber);
  const slideWidth = Math.min(viewportSize.width, viewportSize.height * slideAspectRatio);
  const slideHeight = slideWidth / slideAspectRatio;

  const move = useCallback((offset: number) => {
    if (!snapshot) return;
    const next = (snapshot.timeline ?? [])[currentIndex + offset];
    if (next) void api.updateSession(sessionId, { currentNodeId: next.id }).then(setSnapshot).catch((caught) => setError(caught instanceof Error ? caught.message : "Seite konnte nicht gewechselt werden"));
  }, [currentIndex, sessionId, snapshot]);

  const enterFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void document.documentElement.requestFullscreen?.().then(() => setFullscreenRequired(false)).catch(() => setFullscreenRequired(true));
  }, []);

  const registerPointerActivity = useCallback(() => {
    setCursorVisible(true);
    if (cursorTimer.current !== null) window.clearTimeout(cursorTimer.current);
    cursorTimer.current = window.setTimeout(() => setCursorVisible(false), 3000);
  }, []);

  useEffect(() => {
    registerPointerActivity();
    return () => {
      if (cursorTimer.current !== null) window.clearTimeout(cursorTimer.current);
    };
  }, [registerPointerActivity]);

  useEffect(() => {
    const updateViewportSize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewportSize);
    document.addEventListener("fullscreenchange", updateViewportSize);
    return () => {
      window.removeEventListener("resize", updateViewportSize);
      document.removeEventListener("fullscreenchange", updateViewportSize);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, a")) return;
      const key = event.key.toLowerCase();
      if (["arrowright", "pagedown", " "].includes(key)) { event.preventDefault(); if (joinScreenVisible) setJoinScreenVisible(false); else move(1); }
      if (["arrowleft", "pageup"].includes(key)) { event.preventDefault(); if (joinScreenVisible) setJoinScreenVisible(false); else move(-1); }
      if (key === "b") setBlackout((value) => !value);
      if (key === "l") setLaserEnabled((value) => !value);
      if (key === "r") setJoinScreenVisible((value) => !value);
      if (key === "c") setConsoleOpen((value) => !value);
      if (key === "f") enterFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterFullscreen, joinScreenVisible, move]);

  if (sessionId === "starting") return <div className="projection-starting"><MessageCircleMore size={34} /><strong>MitRede</strong><span>Präsentation wird vorbereitet…</span></div>;
  if (!snapshot) return <LoadingScreen message={error || "Live-Sitzung wird geladen…"} />;
  const poll = snapshot.currentNode?.config;
  const total = snapshot.results.total;
  const isPdf = snapshot.currentNode?.type === "PDF_PAGE";
  const isRating = snapshot.currentNode?.type === "RATING";
  const isQuiz = poll?.assessmentMode === "QUIZ";
  const joinUrl = `${window.location.origin}/join/${snapshot.roomCode}`;
  const roomCode = `${snapshot.roomCode.slice(0, 3)} ${snapshot.roomCode.slice(3)}`;

  return (
    <div className={["projection-shell", controlsVisible || consoleOpen ? "controls-visible" : "controls-hidden", cursorVisible ? "" : "cursor-hidden", laserEnabled ? "laser-active" : ""].filter(Boolean).join(" ")} onMouseMove={(event) => { registerPointerActivity(); if (laserEnabled) setLaserPoint({ x: event.clientX, y: event.clientY }); }}>
      <main className="projection-stage" onClick={() => { if (!laserEnabled && !blackout && !consoleOpen) move(1); }}>
        {isPdf && poll?.objectKey && poll.pageNumber ? <div className="presented-pdf projection-pdf"><PdfPageCanvas objectKey={poll.objectKey} pageNumber={poll.pageNumber} fitContainer /></div> : <div className="stage projection-poll" style={{ width: slideWidth, height: slideHeight }}><p className="stage-kicker">{isRating ? "LIVE-SKALA" : isQuiz ? "WISSENSFRAGE" : "LIVE-UMFRAGE"}</p><h1>{poll?.question ?? "Keine aktuelle Frage"}</h1><p className="stage-subtitle">{isRating ? "Wählen Sie eine Bewertung" : "Eine Antwort auswählen"}</p>{snapshot.resultsVisible ? <SessionResultDisplay options={poll?.options ?? []} counts={snapshot.results.counts} total={total} rating={isRating} correctOptionIndex={isQuiz ? poll?.correctOptionIndex : undefined} /> : <div className="results-hidden"><BarChart3 size={34} /><strong>Antworten werden gesammelt</strong><span>Die Ergebnisse erscheinen nach der Freigabe.</span></div>}<p className="answer-count"><Check size={16} /> {total} Antworten eingegangen</p></div>}
      </main>
      {!blackout && <aside className="projection-room"><QrCode size={23} /><span>TEILNEHMEN</span><strong>{roomCode}</strong><small>{joinUrl}</small></aside>}
      {joinScreenVisible && !blackout && <section className="projection-join-screen" aria-label="Teilnahmeseite" onClick={() => setJoinScreenVisible(false)}>
        <div className="projection-join-card" onClick={(event) => event.stopPropagation()}>
          <div className="projection-join-intro"><span>MITREDE</span><h1>Jetzt teilnehmen</h1><p>QR-Code scannen oder manuell beitreten.</p></div>
          <div className="projection-join-qr"><QRCodeSVG value={joinUrl} size={280} level="M" marginSize={1} title="QR-Code zur Teilnahme" /></div>
          <div className="projection-join-code"><span>RAUMCODE</span><strong>{roomCode}</strong></div>
          <div className="projection-join-manual"><span>MANUELL</span><ol><li><b>1</b><p><small>Webseite öffnen</small><strong>{window.location.host}</strong></p></li><li><b>2</b><p><small>Raumcode eingeben</small><strong>{roomCode}</strong></p></li><li><b>3</b><p><small>Auswählen</small><strong>Beitreten</strong></p></li></ol></div>
        </div>
        <button className="projection-join-start" onClick={() => setJoinScreenVisible(false)}>Klicken oder → zum Starten</button>
      </section>}
      {blackout && <div className="projection-blackout" aria-label="Schwarzer Bildschirm" />}
      {laserEnabled && laserPoint && !blackout && <span className="projection-laser" style={{ left: laserPoint.x, top: laserPoint.y }} />}
      {fullscreenRequired && !document.fullscreenElement && <button className="projection-fullscreen-prompt" onClick={enterFullscreen}><Fullscreen size={22} /><span><strong>Vollbild starten</strong><small>Einmal klicken, um die Präsentation bildschirmfüllend zu zeigen.</small></span></button>}
      <div className="projection-dock-zone" onMouseEnter={() => setControlsVisible(true)} onMouseLeave={() => { if (!consoleOpen) setControlsVisible(false); }}>
        {consoleOpen && <section className="projection-console" onClick={(event) => event.stopPropagation()}>
          <header><div><span className="live-badge"><i /> LIVE</span><strong>{snapshot.presentation.title}</strong></div><button onClick={() => setConsoleOpen(false)} aria-label="Konsole schließen"><X size={18} /></button></header>
          <div className="projection-console-status"><span>Seite {currentIndex + 1} von {timeline.length}</span><span><Users size={15} /> {total} Antworten</span></div>
          <div className="projection-console-pages"><button disabled={currentIndex <= 0} onClick={() => { setJoinScreenVisible(false); move(-1); }}><ArrowLeft size={18} /> Zurück</button><button disabled={currentIndex >= timeline.length - 1} onClick={() => { setJoinScreenVisible(false); move(1); }}>Weiter <ArrowRight size={18} /></button></div>
          {!isPdf && <div className="projection-console-interaction"><button className={snapshot.interactionStatus === "ACCEPTING" ? "active" : ""} onClick={() => void update({ interactionStatus: snapshot.interactionStatus === "ACCEPTING" ? "LOCKED" : "ACCEPTING" })}>{snapshot.interactionStatus === "ACCEPTING" ? <Radio size={17} /> : <Lock size={17} />}{snapshot.interactionStatus === "ACCEPTING" ? "Antworten offen" : "Antworten gesperrt"}</button><button className={snapshot.resultsVisible ? "active" : ""} onClick={() => void update({ resultsVisible: !snapshot.resultsVisible })}>{snapshot.resultsVisible ? <Eye size={17} /> : <EyeOff size={17} />}{snapshot.resultsVisible ? "Ergebnisse sichtbar" : "Ergebnisse zeigen"}</button></div>}
          <div className="projection-console-shortcuts"><span>← → Seiten</span><span>L Laser</span><span>B Schwarz</span><span>R Teilnahme</span></div>
          {error && <p>{error}</p>}
          <button className="projection-end" onClick={() => void endSession()}><X size={16} /> Präsentation beenden</button>
        </section>}
        <nav className="projection-dock" aria-label="Präsentationswerkzeuge" onClick={(event) => event.stopPropagation()}>
          <button className={consoleOpen ? "active" : ""} onClick={() => setConsoleOpen((value) => !value)} title="Konsole (C)"><MonitorCog size={19} /><span>Konsole</span></button>
          <button className={laserEnabled ? "active laser" : ""} onClick={() => setLaserEnabled((value) => !value)} title="Laser (L)"><MousePointer2 size={19} /><span>Laser</span></button>
          <button className={joinScreenVisible ? "active" : ""} onClick={() => setJoinScreenVisible((value) => !value)} title="Teilnahmeseite (R)"><QrCode size={19} /><span>Raum</span></button>
          <button className={blackout ? "active" : ""} onClick={() => setBlackout((value) => !value)} title="Schwarzer Bildschirm (B)"><EyeOff size={19} /><span>Schwarz</span></button>
          <button onClick={enterFullscreen} title="Vollbild (F)"><Fullscreen size={19} /><span>Vollbild</span></button>
        </nav>
      </div>
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
  const isQuiz = snapshot.currentNode?.config.assessmentMode === "QUIZ";
  const correctOptionIndex = snapshot.currentNode?.config.correctOptionIndex;

  return (
    <div className="join-shell">
      <header className="join-topbar"><Brand /><span><i /> Verbunden</span></header>
      <main className={waitingForPresentation ? "join-card join-wait" : "join-card"}>
        {waitingForPresentation ? <><FileText size={42} /><p className="eyebrow">PRÄSENTATION LÄUFT</p><h1>Bitte schauen Sie auf die Leinwand.</h1><p>Die nächste Interaktion erscheint automatisch auf diesem Gerät.</p></> : <>
          <p className="eyebrow">{isRating ? "LIVE-SKALA" : isQuiz ? "WISSENSFRAGE" : "LIVE-UMFRAGE"} · RAUM {snapshot.roomCode}</p>
          <h1>{snapshot.currentNode?.config.question ?? "Warten auf die nächste Frage"}</h1>
          <p>{accepting ? isRating ? "Wählen Sie eine Bewertung." : "Wählen Sie eine Antwort." : "Diese Frage ist derzeit gesperrt."}</p>
          <div className={isRating ? "join-options join-rating" : "join-options"}>{options.map((option, index) => <button className={selected === index ? "join-option selected" : "join-option"} key={option} disabled={!accepting} onClick={() => { setSelected(index); setSubmitted(false); }}><span>{isRating ? option : String.fromCharCode(65 + index)}</span>{!isRating && option}{selected === index && <Check size={20} />}</button>)}</div>
          {isRating && <div className="join-rating-labels"><span>{snapshot.currentNode?.config.minLabel}</span><span>{snapshot.currentNode?.config.maxLabel}</span></div>}
          <button className="btn btn-primary submit-answer" disabled={!accepting || selected === null || sending} onClick={() => void submit()}>{submitted ? <><Check size={19} /> {isRating ? "Bewertung gespeichert" : "Antwort gespeichert"}</> : sending ? "Wird gespeichert…" : isRating ? "Bewertung senden" : "Antwort senden"}</button>
          {submitted && isQuiz && snapshot.resultsVisible && correctOptionIndex !== undefined && selected !== null && <div className={selected === correctOptionIndex ? "quiz-feedback correct" : "quiz-feedback incorrect"}><strong>{selected === correctOptionIndex ? "Richtig!" : "Nicht ganz."}</strong>{selected !== correctOptionIndex && <span>Richtig ist: {options[correctOptionIndex]}</span>}</div>}
          {snapshot.resultsVisible && <div className="mobile-results"><strong>{isRating ? "Live-Verteilung" : "Live-Ergebnis"}</strong>{options.map((option, index) => { const count = snapshot.results.counts[index] ?? 0; const percentage = snapshot.results.total ? Math.round(count / snapshot.results.total * 100) : 0; return <div className={isQuiz && correctOptionIndex === index ? "correct" : ""} key={option}><span>{isRating ? `${option} Punkte` : option}{isQuiz && correctOptionIndex === index && <Check size={13} />}</span><i><b style={{ width: `${percentage}%` }} /></i><small>{percentage}%</small></div>; })}</div>}
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
