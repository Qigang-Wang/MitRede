import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronRight,
  CircleCheckBig,
  CircleHelp,
  Clock3,
  FileText,
  Fullscreen,
  Globe2,
  Eye,
  EyeOff,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageCircleMore,
  MonitorCog,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Presentation,
  QrCode,
  Radio,
  RotateCcw,
  Search,
  Save,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Users,
  UsersRound,
  UserPlus,
  Vote,
  X,
} from "lucide-react";
import {
  api,
  connectToSession,
  createClientId,
  prepareProjectionWindow,
  showProjectionWindow,
  type PresentationSummary,
  type SessionSnapshot,
  type AuthUser,
} from "./api";
import EditorView from "./EditorView";
import PreviewView from "./PreviewView";
import ResultsView from "./ResultsView";
import EndSessionDialog from "./EndSessionDialog";
import { PdfPageCanvas, usePdfPageAspectRatio } from "./PdfPage";
import { FreeformPageRenderer } from "./FreeformPage";
import { QRCodeSVG } from "qrcode.react";
import { calculateRatingAverage, RatingDistribution, RatingScaleInput, RatingScaleRail } from "./RatingScale";

type Route = "home" | "dashboard" | "settings" | "editor" | "results" | "preview" | "present" | "join";

function currentRoute(): Route {
  if (/^\/app\/presentations\/[^/]+\/edit/.test(window.location.pathname)) return "editor";
  if (window.location.pathname.startsWith("/app/results")) return "results";
  if (window.location.pathname.startsWith("/app/settings")) return "settings";
  if (window.location.pathname.startsWith("/preview/")) return "preview";
  if (window.location.pathname.startsWith("/present/")) return "present";
  if (window.location.pathname.startsWith("/join/")) return "join";
  if (window.location.pathname.startsWith("/app")) return "dashboard";
  return "home";
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

function GuestHome() {
  const [loginOpen, setLoginOpen] = useState(() => window.location.hash === "#login");
  const [roomCode, setRoomCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const formattedRoomCode = roomCode.length > 3 ? `${roomCode.slice(0, 3)} ${roomCode.slice(3)}` : roomCode;

  useEffect(() => {
    void api.me().then(() => navigate("/app")).catch(() => undefined);
  }, []);

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (roomCode.length !== 6 || checking) return;
    setChecking(true);
    setError("");
    try {
      await api.roomSnapshot(roomCode);
      navigate(`/join/${roomCode}`);
    } catch {
      setError("Dieser Raum wurde nicht gefunden. Bitte prüfen Sie den Code.");
      setChecking(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      await api.login({ email: email.trim(), password });
      navigate("/app");
    } catch (caught) {
      setLoginError(caught instanceof Error ? caught.message : "Anmeldung fehlgeschlagen");
      setLoginBusy(false);
    }
  }

  return (
    <main className="guest-home">
      <div className="guest-brand"><Brand /></div>
      <button className="guest-login" type="button" onClick={() => { setLoginOpen((open) => !open); setError(""); setLoginError(""); }}>
        {loginOpen ? "Raum beitreten" : "Anmelden"}
      </button>
      {loginOpen ? (
        <form className="guest-join-card guest-login-card" onSubmit={login}>
          <h1>Anmelden</h1>
          <p>Melden Sie sich bei MitRede an.</p>
          <div className="guest-login-fields">
            <label>E-Mail<input autoFocus autoComplete="email" type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setLoginError(""); }} /></label>
            <label>Passwort<input autoComplete="current-password" type="password" required minLength={8} value={password} onChange={(event) => { setPassword(event.target.value); setLoginError(""); }} /></label>
            {loginError && <p className="guest-login-error" role="alert">{loginError}</p>}
            <button type="submit" disabled={loginBusy || !email.trim() || password.length < 8}>{loginBusy ? "Wird angemeldet…" : "Anmelden"}</button>
          </div>
        </form>
      ) : (
        <form className="guest-join-card" onSubmit={joinRoom} noValidate>
          <h1>Raum beitreten</h1>
          <p>Geben Sie den Raumcode ein.</p>
          <div className="guest-room-form">
            <input
              autoFocus
              autoComplete="one-time-code"
              aria-label="Raumcode"
              aria-describedby={error ? "guest-room-error" : undefined}
              aria-invalid={Boolean(error)}
              inputMode="numeric"
              maxLength={7}
              placeholder="123 456"
              value={formattedRoomCode}
              onChange={(event) => {
                setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
            />
            <button type="submit" disabled={roomCode.length !== 6 || checking}>
              {checking ? "Wird geöffnet…" : "Beitreten"}
            </button>
          </div>
          {error && <p className="guest-room-error" id="guest-room-error" role="alert">{error}</p>}
        </form>
      )}
    </main>
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
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createPresentation(title.trim(), file ?? undefined);
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
          <h2 id="upload-title">Präsentation anlegen</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen"><X size={20} /></button>
        </div>
        <label className="field-label">Titel<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Methodenwerkstatt" autoFocus required /></label>
        <label className={file ? "file-drop selected" : "file-drop"}>
          <Upload size={28} />
          <strong>{file ? file.name : "PDF auswählen (optional)"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Bis zu 100 MB"}</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? "Wird verarbeitet…" : "Präsentation anlegen"}</button></div>
      </form>
    </div>
  );
}

function Dashboard({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  const [presentations, setPresentations] = useState<PresentationSummary[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [quickCode, setQuickCode] = useState("");
  const [presentationContext, setPresentationContext] = useState<{ presentation: PresentationSummary; x: number; y: number } | null>(null);
  const [deletePresentationTarget, setDeletePresentationTarget] = useState<PresentationSummary | null>(null);
  const [deletingPresentation, setDeletingPresentation] = useState(false);
  const [deletePresentationError, setDeletePresentationError] = useState("");

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

  function openPresentationContext(event: MouseEvent, presentation: PresentationSummary) {
    event.preventDefault();
    setPresentationContext({ presentation, x: Math.min(event.clientX, window.innerWidth - 224), y: Math.min(event.clientY, window.innerHeight - 78) });
  }

  function openPresentationOptions(event: MouseEvent<HTMLButtonElement>, presentation: PresentationSummary) {
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    setPresentationContext({ presentation, x: Math.min(bounds.right - 214, window.innerWidth - 224), y: Math.min(bounds.bottom + 6, window.innerHeight - 78) });
  }

  async function removePresentation() {
    if (!deletePresentationTarget) return;
    setDeletingPresentation(true);
    setDeletePresentationError("");
    try {
      await api.deletePresentation(deletePresentationTarget.id);
      setPresentations((items) => items.filter((item) => item.id !== deletePresentationTarget.id));
      setDeletePresentationTarget(null);
    } catch (caught) {
      setDeletePresentationError(caught instanceof Error ? caught.message : "Präsentation konnte nicht gelöscht werden");
    } finally {
      setDeletingPresentation(false);
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
          <a className="nav-item" href="/app/settings"><Settings size={18} /> Einstellungen</a>
          <div className="profile"><span className="avatar">{authUser.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{authUser.displayName}</strong><small>{authUser.role === "ADMIN" ? "Administratorin" : "Moderatorin"}</small></span><button className="profile-logout" onClick={onLogout} title="Abmelden" aria-label="Abmelden"><LogOut size={17} /></button></div>
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
                <article className="presentation-card" key={presentationItem.id} onContextMenu={(event) => openPresentationContext(event, presentationItem)}>
                  <div className={`card-preview ${tone}`}><span className="preview-kicker">MITREDE · INTERN</span><Icon size={42} strokeWidth={1.4} /><strong>{presentationItem.title}</strong><span className="slide-number">{presentationItem.nodeCount} Knoten</span></div>
                  <div className="card-body"><div><h3>{presentationItem.title}</h3><p>{presentationItem.pageCount} PDF-Seiten · {presentationItem.interactionCount} Interaktionen</p></div><button className="icon-button" aria-label={`${presentationItem.title} Optionen`} aria-haspopup="menu" onClick={(event) => openPresentationOptions(event, presentationItem)}><MoreHorizontal size={20} /></button></div>
                  <div className="card-foot"><span><Clock3 size={14} /> {new Date(presentationItem.updatedAt).toLocaleDateString("de-DE")}</span><div className="card-actions"><button className="edit-button" onClick={() => navigate(`/app/presentations/${presentationItem.id}/edit`)}>Bearbeiten</button><button className="start-button" disabled={startingId === presentationItem.id} onClick={() => void start(presentationItem.id)}><Play size={14} fill="currentColor" /> {startingId === presentationItem.id ? "Startet…" : "Starten"}</button></div></div>
                </article>
              );
            })}
            <button className="new-card" onClick={() => setUploadOpen(true)}><span><Plus size={24} /></span><strong>Neue Präsentation</strong><small>Optional mit PDF starten</small></button>
          </div>
        </section>

        <section className="next-session" id="sessions"><div className="session-date"><strong>LIVE</strong><span>BEREIT</span></div><div className="session-info"><span className="status-pill">ECHTZEIT</span><h3>Eine Präsentation starten</h3><p>Mit Raumcode, anonymer Teilnahme und Live-Ergebnissen</p></div><div className="session-people"><span>QR</span><span>WS</span><span>+?</span></div><button className="btn btn-secondary" onClick={() => setUploadOpen(true)}>Vorbereiten <ChevronRight size={17} /></button></section>
      </main>
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onCreated={load} />}
      {presentationContext && <div className="session-context-layer" role="presentation" onMouseDown={() => setPresentationContext(null)} onContextMenu={(event) => { event.preventDefault(); setPresentationContext(null); }}><div className="session-context-menu presentation-context-menu" role="menu" style={{ left: presentationContext.x, top: presentationContext.y }} onMouseDown={(event) => event.stopPropagation()}><header>{presentationContext.presentation.title}</header><button className="danger" role="menuitem" onClick={() => { setDeletePresentationError(""); setDeletePresentationTarget(presentationContext.presentation); setPresentationContext(null); }}><Trash2 size={15} /><span>Präsentation löschen</span></button></div></div>}
      {deletePresentationTarget && <EndSessionDialog action="delete" subject="presentation" title={deletePresentationTarget.title} roomCode="" busy={deletingPresentation} error={deletePresentationError} onCancel={() => { setDeletePresentationTarget(null); setDeletePresentationError(""); }} onConfirm={() => void removePresentation()} />}
    </div>
  );
}

function SettingsView() {
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.settings().then((settings) => setPublicBaseUrl(settings.publicBaseUrl)).catch((caught) => setError(caught instanceof Error ? caught.message : "Einstellungen konnten nicht geladen werden")).finally(() => setLoading(false));
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const settings = await api.updateSettings({ publicBaseUrl });
      setPublicBaseUrl(settings.publicBaseUrl);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Einstellungen konnten nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  const effectiveUrl = publicBaseUrl.trim() || window.location.origin;
  return <div className="app-shell"><aside className="sidebar"><Brand /><nav className="main-nav" aria-label="Hauptnavigation"><a className="nav-item" href="/app"><LayoutDashboard size={18} /> Übersicht</a><a className="nav-item" href="/app#presentations"><Presentation size={18} /> Präsentationen</a><a className="nav-item" href="/app/results?filter=live"><Radio size={18} /> Live-Sitzungen</a><a className="nav-item" href="/app/results"><BarChart3 size={18} /> Ergebnisse</a></nav><div className="sidebar-foot"><a className="nav-item" href="#help"><CircleHelp size={18} /> Hilfe</a><a className="nav-item active" href="/app/settings"><Settings size={18} /> Einstellungen</a><div className="profile"><span className="avatar">SW</span><span><strong>Sabine Wolf</strong><small>Moderatorin</small></span></div></div></aside><main className="settings-page"><header><p className="eyebrow">EINSTELLUNGEN</p><h1>Allgemein</h1></header><form className="settings-card" onSubmit={saveSettings}><div className="settings-card-heading"><span><Globe2 size={21} /></span><div><h2>Öffentliche Domain</h2><p>Diese Adresse wird für Teilnahme-Links und QR-Codes verwendet.</p></div></div><label>Domain<input disabled={loading} value={publicBaseUrl} onChange={(event) => { setPublicBaseUrl(event.target.value); setSaved(false); }} placeholder="https://mitrede.example.de" /></label><div className="settings-url-preview"><small>Teilnahmelink</small><strong>{effectiveUrl}/join/123456</strong></div>{error && <p className="form-error">{error}</p>}<div className="settings-actions">{saved && <span><Check size={15} /> Gespeichert</span>}<button className="btn btn-primary" disabled={loading || saving}><Save size={16} /> {saving ? "Wird gespeichert…" : "Speichern"}</button></div></form></main></div>;
}

function LoadingScreen({ message }: { message: string }) {
  return <div className="status-screen"><Brand /><div className="status-spinner" /><p>{message}</p><button className="text-button" onClick={() => navigate("/app")}>Zur Übersicht</button></div>;
}

function SessionResultDisplay({ options, counts, total, rating, correctOptionIndex }: { options: string[]; counts: number[]; total: number; rating: boolean; correctOptionIndex?: number }) {
  const average = total ? options.reduce((sum, option, index) => sum + Number(option) * (counts[index] ?? 0), 0) / total : 0;
  return <>{rating && <div className="live-rating-average"><strong>{average.toFixed(1)}</strong><span>Durchschnitt</span></div>}<div className={rating ? "result-list rating" : "result-list"}>{options.map((label, index) => { const count = counts[index] ?? 0; const percentage = total ? Math.round(count / total * 100) : 0; return <div className={correctOptionIndex === index ? "result-row correct" : "result-row"} key={label}><span className="result-letter">{rating ? label : String.fromCharCode(65 + index)}</span><div><div className="result-label"><strong>{rating ? `${label} Punkte` : label}{correctOptionIndex === index && <Check size={17} />}</strong><span>{count} Stimmen · {percentage}%</span></div><div className="result-track"><span style={{ width: `${percentage}%` }} /></div></div></div>; })}</div></>;
}

function MultiScaleProjection({ snapshot, width, height }: { snapshot: SessionSnapshot; width: number; height: number }) {
  const scale = snapshot.scaleVote;
  const options = (scale?.options ?? []).map(Number);
  const min = options[0] ?? Number(snapshot.currentNode?.config.min ?? 1);
  const max = options.at(-1) ?? Number(snapshot.currentNode?.config.max ?? 5);
  return <div className="stage projection-multi-scale" style={{ width, height }}><h1>{snapshot.currentNode?.config.question || "Bewerten Sie die folgenden Aussagen"}</h1><div className="projection-scale-list">{scale?.statements.map((statement, index) => { const position = statement.average === null || max === min ? null : Math.max(0, Math.min(100, (statement.average - min) / (max - min) * 100)); return <article key={index}><div><strong>{statement.text}</strong>{snapshot.resultsVisible && <span>{statement.total} Bewertungen</span>}</div><div className="projection-scale-track">{snapshot.resultsVisible && <RatingDistribution counts={statement.counts} />}<i />{snapshot.resultsVisible && position !== null && <b style={{ left: `${position}%` }}>{statement.average?.toFixed(1)}</b>}</div></article>; })}</div><footer><span>{snapshot.currentNode?.config.minLabel || "Niedrig"}</span><b>{min}–{max} Punkte</b><span>{snapshot.currentNode?.config.maxLabel || "Hoch"}</span></footer><p className="answer-count"><Check size={16} /> {snapshot.results.total} Personen haben bewertet</p></div>;
}

function SingleScaleProjection({ snapshot, width, height }: { snapshot: SessionSnapshot; width: number; height: number }) {
  const options = snapshot.currentNode?.config.options ?? [];
  const min = Number(options[0] ?? snapshot.currentNode?.config.min ?? 1);
  const max = Number(options.at(-1) ?? snapshot.currentNode?.config.max ?? 5);
  const average = snapshot.resultsVisible ? calculateRatingAverage(options, snapshot.results.counts, snapshot.results.total) : null;
  return <div className="stage projection-single-scale" style={{ width, height }}><div><h1>{snapshot.currentNode?.config.question || "Wie bewerten Sie diese Aussage?"}</h1><p>{snapshot.resultsVisible ? "Durchschnittliche Bewertung" : "Wählen Sie eine Bewertung"}</p><RatingScaleRail min={min} max={max} minLabel={snapshot.currentNode?.config.minLabel} maxLabel={snapshot.currentNode?.config.maxLabel} value={average} valuePrefix={average === null ? "" : "Ø "} counts={snapshot.resultsVisible ? snapshot.results.counts : undefined} /></div><p className="answer-count"><Check size={16} /> {snapshot.results.total} {snapshot.results.total === 1 ? "Bewertung" : "Bewertungen"} eingegangen</p></div>;
}

function GroupProjection({ snapshot, width, height }: { snapshot: SessionSnapshot; width: number; height: number }) {
  const groups = snapshot.groups ?? [];
  return <div className="stage projection-groups" style={{ width, height }}><h1>{snapshot.currentNode?.config.question || "Finden Sie Ihre Gruppe"}</h1><p className="stage-subtitle">{snapshot.currentNode?.config.prompt}</p><div className="projection-group-grid">{groups.length ? groups.map((group) => <article key={group.id}><div><UsersRound size={24} /><strong>{group.name}</strong><span>{group.memberCount} {group.memberCount === 1 ? "Mitglied" : "Mitglieder"}</span></div><ul className="projection-group-members">{group.memberNames.map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}</ul></article>) : <div className="projection-group-empty"><UserPlus size={36} /><strong>Noch keine Gruppen</strong><span>Teilnehmende können jetzt eine Gruppe erstellen oder beitreten.</span></div>}</div><p className="projection-group-count"><Users size={16} /> {snapshot.results.total} Teilnehmende in {groups.length} Gruppen</p></div>;
}

function GroupDiscussionProjection({ snapshot, width, height }: { snapshot: SessionSnapshot; width: number; height: number }) {
  const groups = snapshot.groups ?? [];
  const completedGroups = groups.filter((group) => group.completed).length;
  const remainingSeconds = useDiscussionSeconds(snapshot.discussionTimer);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return <div className="stage projection-discussion" style={{ width, height }}><div className="discussion-stage-center"><h1>{snapshot.currentNode?.config.question || "Diskutieren Sie in Ihren Gruppen"}</h1>{snapshot.discussionTimer && <div className={remainingSeconds === 0 ? "discussion-stage-timer expired" : "discussion-stage-timer"}><Clock3 size={34} /><strong>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong><span>{snapshot.discussionTimer.running ? "Verbleibende Zeit" : remainingSeconds === 0 ? "Zeit ist abgelaufen" : "Timer pausiert"}</span></div>}</div><footer className="discussion-stage-status"><div><UsersRound size={20} /><span><strong>{completedGroups} / {groups.length}</strong> Gruppen fertig</span></div><div className="discussion-progress-dots">{groups.map((group) => <i className={group.completed ? "done" : ""} key={group.id} title={`${group.name}: ${group.completed ? "fertig" : "in Arbeit"}`} />)}</div></footer></div>;
}

function GroupPresentationProjection({ snapshot, width, height }: { snapshot: SessionSnapshot; width: number; height: number }) {
  const presentation = snapshot.groupPresentation;
  const group = presentation?.activeGroup;
  return <div className="stage group-presentation-canvas projection-group-presentation" style={{ width, height }}>{group ? <><header><span>GRUPPE {(presentation?.activeIndex ?? 0) + 1} VON {presentation?.total ?? 0}</span><h1>{snapshot.currentNode?.config.question || "Ergebnisse aus den Gruppen"}</h1></header><section><div className="group-presentation-team"><UsersRound size={30} /><div><strong>{group.name}</strong><span>{group.memberNames.join(" · ")}</span></div></div><div className="group-presentation-answer-list">{group.answers.length ? group.answers.map((answer, index) => <article key={index}><b>{index + 1}</b><p>{answer}</p></article>) : <div className="group-presentation-no-answer">Diese Gruppe hat noch keine Antwort gespeichert.</div>}</div></section><footer><span>Diese Gruppe präsentiert jetzt.</span><div>{Array.from({ length: presentation?.total ?? 0 }, (_, index) => <i className={index === presentation?.activeIndex ? "active" : ""} key={index} />)}</div></footer></> : <div className="group-presentation-empty"><UsersRound size={46} /><strong>Noch keine Gruppenergebnisse</strong><span>Für die verknüpfte Diskussion wurden noch keine Gruppen oder Antworten gespeichert.</span></div>}</div>;
}

function useDiscussionSeconds(timer: SessionSnapshot["discussionTimer"]) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!timer?.running || !timer.endsAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer?.endsAt, timer?.running]);
  if (!timer) return 0;
  return timer.running && timer.endsAt
    ? Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000))
    : timer.remainingSeconds;
}

function DiscussionTimer({ timer }: { timer: SessionSnapshot["discussionTimer"] }) {
  const remainingSeconds = useDiscussionSeconds(timer);
  if (!timer) return null;
  return <div className={remainingSeconds === 0 ? "join-discussion-timer expired" : "join-discussion-timer"}><Clock3 size={18} /><strong>{String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}</strong><small>{timer?.running ? "verbleibend" : remainingSeconds ? "pausiert" : "abgelaufen"}</small></div>;
}

function PriorityProjection({ snapshot, width, height }: { snapshot: SessionSnapshot; width: number; height: number }) {
  const vote = snapshot.priorityVote;
  const points = vote?.points ?? [];
  const visiblePoints = points.slice(0, Math.min(10, Math.max(1, Number(snapshot.currentNode?.config.maxVisibleResults ?? 5))));
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  return <div className="stage projection-priority" style={{ width, height }}><h1>{snapshot.currentNode?.config.question || "Welche Ergebnisse sind am wichtigsten?"}</h1>{!points.length ? <div className="priority-empty"><Vote size={38} /><strong>Noch keine Diskussionspunkte</strong><span>Tragen Sie auf der verknüpften Gruppenseite pro Punkt eine eigene Zeile ein.</span></div> : snapshot.resultsVisible ? <div className="projection-priority-list">{visiblePoints.map((point, index) => <article key={point.id}><span className="priority-rank">{index + 1}</span><div><strong>{point.text}</strong><small>{point.groupName}</small><i><b style={{ width: `${Math.max(4, point.count / maxCount * 100)}%` }} /></i></div><span className="priority-count"><b>{point.count}</b> {point.count === 1 ? "Stimme" : "Stimmen"}</span></article>)}</div> : <div className="results-hidden"><BarChart3 size={34} /><strong>Stimmen werden gesammelt</strong><span>Die Rangfolge erscheint nach der Freigabe.</span></div>}<p className="answer-count"><Check size={16} /> {snapshot.results.total} Personen haben abgestimmt{points.length > visiblePoints.length ? ` · Top ${visiblePoints.length} von ${points.length}` : ""}</p></div>;
}

function PresenterView() {
  const sessionId = pathId();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [laserEnabled, setLaserEnabled] = useState(false);
  const [laserPoint, setLaserPoint] = useState<{ x: number; y: number } | null>(null);
  const [joinScreenVisible, setJoinScreenVisible] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [viewportSize, setViewportSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [endError, setEndError] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState(window.location.origin);
  const fullscreenAttempted = useRef(false);
  const cursorTimer = useRef<number | null>(null);
  const joinNodeActive = snapshot?.currentNode?.type === "JOIN_PAGE";

  const load = useCallback(async () => {
    if (sessionId === "starting") return;
    try { setSnapshot(await api.sessionSnapshot(sessionId)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Sitzung nicht erreichbar"); }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId === "starting") return;
    void load();
    void api.settings().then((settings) => setPublicBaseUrl(settings.publicBaseUrl || window.location.origin)).catch(() => undefined);
    const socket = connectToSession(sessionId, (event) => {
      if (event.type === "session.deleted") { setSnapshot(null); setError("Diese Sitzung wurde gelöscht."); return; }
      void load();
    });
    return () => { socket.disconnect(); };
  }, [load, sessionId]);

  useEffect(() => {
    if (!snapshot || fullscreenAttempted.current) return;
    fullscreenAttempted.current = true;
    if (document.fullscreenElement) return;
    void document.documentElement.requestFullscreen?.().then(() => setFullscreenRequired(false)).catch(() => setFullscreenRequired(true));
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || snapshot.status === "ENDED") return;
    const confirmClosingLivePresentation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmClosingLivePresentation);
    return () => window.removeEventListener("beforeunload", confirmClosingLivePresentation);
  }, [snapshot?.status]);

  async function update(body: { interactionStatus?: SessionSnapshot["interactionStatus"]; resultsVisible?: boolean; currentNodeId?: string; timerAction?: "START" | "PAUSE" | "RESET" | "ADD_MINUTE"; activeGroupIndex?: number }) {
    try { setSnapshot(await api.updateSession(sessionId, body)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Status konnte nicht geändert werden"); }
  }

  async function endSession() {
    setEndingSession(true);
    setEndError("");
    try {
      await api.endSession(sessionId);
      navigate(`/app/results/${sessionId}`);
    } catch (caught) {
      setEndError(caught instanceof Error ? caught.message : "Sitzung konnte nicht beendet werden");
    } finally {
      setEndingSession(false);
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
    if (snapshot.currentNode?.type === "GROUP_PRESENTATION" && snapshot.groupPresentation?.total) {
      const nextGroupIndex = snapshot.groupPresentation.activeIndex + offset;
      if (nextGroupIndex >= 0 && nextGroupIndex < snapshot.groupPresentation.total) {
        void api.updateSession(sessionId, { activeGroupIndex: nextGroupIndex }).then(setSnapshot).catch((caught) => setError(caught instanceof Error ? caught.message : "Gruppe konnte nicht gewechselt werden"));
        return;
      }
    }
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
      if (["arrowright", "pagedown", " "].includes(key)) { event.preventDefault(); if (joinScreenVisible && !joinNodeActive) setJoinScreenVisible(false); else move(1); }
      if (["arrowleft", "pageup"].includes(key)) { event.preventDefault(); if (joinScreenVisible && !joinNodeActive) setJoinScreenVisible(false); else move(-1); }
      if (key === "b") setBlackout((value) => !value);
      if (key === "l") setLaserEnabled((value) => !value);
      if (key === "r") setJoinScreenVisible((value) => !value);
      if (key === "c") setConsoleOpen((value) => !value);
      if (key === "f") enterFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterFullscreen, joinNodeActive, joinScreenVisible, move]);

  useEffect(() => { setJoinScreenVisible(false); }, [snapshot?.currentNode?.id]);

  if (sessionId === "starting") return <div className="projection-starting"><MessageCircleMore size={34} /><strong>MitRede</strong><span>Präsentation wird vorbereitet…</span></div>;
  if (!snapshot) return <LoadingScreen message={error || "Live-Sitzung wird geladen…"} />;
  const poll = snapshot.currentNode?.config;
  const total = snapshot.results.total;
  const isPdf = snapshot.currentNode?.type === "PDF_PAGE";
  const isJoinPage = snapshot.currentNode?.type === "JOIN_PAGE";
  const isContentPage = snapshot.currentNode?.type === "CONTENT_PAGE";
  const isFreeformPage = snapshot.currentNode?.type === "FREEFORM_PAGE";
  const isGroupPage = snapshot.currentNode?.type === "GROUP_PAGE";
  const isGroupDiscussion = snapshot.currentNode?.type === "GROUP_DISCUSSION";
  const isGroupPresentation = snapshot.currentNode?.type === "GROUP_PRESENTATION";
  const isPriorityPage = snapshot.currentNode?.type === "PRIORITY_VOTE";
  const isRating = snapshot.currentNode?.type === "RATING";
  const isMultiScale = isRating && (poll?.statements?.length ?? 0) > 1;
  const isSingleScale = isRating && !isMultiScale;
  const isQuiz = poll?.assessmentMode === "QUIZ";
  const isInteractive = snapshot.currentNode?.type === "MULTIPLE_CHOICE" || isRating || isGroupPage || isGroupDiscussion || isPriorityPage;
  const joinUrl = `${publicBaseUrl}/join/${snapshot.roomCode}`;
  const publicHost = (() => { try { return new URL(publicBaseUrl).host; } catch { return window.location.host; } })();
  const roomCode = `${snapshot.roomCode.slice(0, 3)} ${snapshot.roomCode.slice(3)}`;

  return (
    <div className={["projection-shell", controlsVisible || consoleOpen ? "controls-visible" : "controls-hidden", cursorVisible ? "" : "cursor-hidden", laserEnabled ? "laser-active" : ""].filter(Boolean).join(" ")} onMouseMove={(event) => { registerPointerActivity(); if (laserEnabled) setLaserPoint({ x: event.clientX, y: event.clientY }); }}>
      <main className="projection-stage" onClick={() => { if (!laserEnabled && !blackout && !consoleOpen) move(1); }}>
        {!isJoinPage && (isPdf && poll?.objectKey && poll.pageNumber ? <div className="presented-pdf projection-pdf"><PdfPageCanvas objectKey={poll.objectKey} pageNumber={poll.pageNumber} fitContainer /></div> : isContentPage ? <div className="stage projection-content" style={{ width: slideWidth, height: slideHeight }}><h1>{poll?.title || "Neue Informationsseite"}</h1><p className="projection-content-body">{poll?.body || "Ergänzen Sie hier Ihre Inhalte."}</p></div> : isFreeformPage ? <FreeformPageRenderer config={poll ?? {}} className="projection-freeform" style={{ width: slideWidth, height: slideHeight }} /> : isGroupPage ? <GroupProjection snapshot={snapshot} width={slideWidth} height={slideHeight} /> : isGroupDiscussion ? <GroupDiscussionProjection snapshot={snapshot} width={slideWidth} height={slideHeight} /> : isGroupPresentation ? <GroupPresentationProjection snapshot={snapshot} width={slideWidth} height={slideHeight} /> : isPriorityPage ? <PriorityProjection snapshot={snapshot} width={slideWidth} height={slideHeight} /> : isMultiScale ? <MultiScaleProjection snapshot={snapshot} width={slideWidth} height={slideHeight} /> : isSingleScale ? <SingleScaleProjection snapshot={snapshot} width={slideWidth} height={slideHeight} /> : <div className="stage projection-poll" style={{ width: slideWidth, height: slideHeight }}><h1>{poll?.question ?? "Keine aktuelle Frage"}</h1><p className="stage-subtitle">Eine Antwort auswählen</p>{snapshot.resultsVisible ? <SessionResultDisplay options={poll?.options ?? []} counts={snapshot.results.counts} total={total} rating={false} correctOptionIndex={isQuiz ? poll?.correctOptionIndex : undefined} /> : <div className="results-hidden"><BarChart3 size={34} /><strong>Antworten werden gesammelt</strong><span>Die Ergebnisse erscheinen nach der Freigabe.</span></div>}<p className="answer-count"><Check size={16} /> {total} Antworten eingegangen</p></div>)}
      </main>
      {!blackout && <aside className="projection-room"><QrCode size={23} /><span>TEILNEHMEN</span><strong>{roomCode}</strong><small>{joinUrl}</small></aside>}
      {(isJoinPage || joinScreenVisible) && !blackout && <section className="projection-join-screen" aria-label="Teilnahmeseite" onClick={() => { if (isJoinPage) move(1); else setJoinScreenVisible(false); }}>
        <div className="projection-join-card" onClick={(event) => event.stopPropagation()}>
          <div className="projection-join-intro"><h1>Jetzt teilnehmen</h1><p>QR-Code scannen oder Webadresse im Browser öffnen.</p><strong className="projection-join-domain">{publicHost}</strong></div>
          <div className="projection-join-access-card"><div className="projection-join-qr"><QRCodeSVG value={joinUrl} size={440} level="M" marginSize={1} title="QR-Code zur Teilnahme" /></div><div className="projection-join-code"><span>RAUMCODE</span><strong>{roomCode}</strong></div></div>
        </div>
        <button className="projection-join-start" onClick={() => { if (isJoinPage) move(1); else setJoinScreenVisible(false); }}>Klicken oder → zum Fortfahren</button>
      </section>}
      {blackout && <div className="projection-blackout" aria-label="Schwarzer Bildschirm" />}
      {laserEnabled && laserPoint && !blackout && <span className="projection-laser" style={{ left: laserPoint.x, top: laserPoint.y }} />}
      {fullscreenRequired && !document.fullscreenElement && <button className="projection-fullscreen-prompt" onClick={enterFullscreen}><Fullscreen size={22} /><span><strong>Vollbild starten</strong><small>Einmal klicken, um die Präsentation bildschirmfüllend zu zeigen.</small></span></button>}
      <div className="projection-dock-zone" onMouseEnter={() => setControlsVisible(true)} onMouseLeave={() => { if (!consoleOpen) setControlsVisible(false); }}>
        {consoleOpen && <section className="projection-console" onClick={(event) => event.stopPropagation()}>
          <header><div><span className="live-badge"><i /> LIVE</span><strong>{snapshot.presentation.title}</strong></div><button onClick={() => setConsoleOpen(false)} aria-label="Konsole schließen"><X size={18} /></button></header>
          <div className="projection-console-status"><span>Seite {currentIndex + 1} von {timeline.length}</span><span><Users size={15} /> {total} Antworten</span></div>
          <div className="projection-console-pages"><button disabled={currentIndex <= 0} onClick={() => { setJoinScreenVisible(false); move(-1); }}><ArrowLeft size={18} /> Zurück</button><button disabled={currentIndex >= timeline.length - 1} onClick={() => { setJoinScreenVisible(false); move(1); }}>Weiter <ArrowRight size={18} /></button></div>
          {isInteractive && <div className="projection-console-interaction"><button className={snapshot.interactionStatus === "ACCEPTING" ? "active" : ""} onClick={() => void update({ interactionStatus: snapshot.interactionStatus === "ACCEPTING" ? "LOCKED" : "ACCEPTING" })}>{snapshot.interactionStatus === "ACCEPTING" ? <Radio size={17} /> : <Lock size={17} />}{snapshot.interactionStatus === "ACCEPTING" ? "Antworten offen" : "Antworten gesperrt"}</button>{isGroupDiscussion ? snapshot.discussionTimer ? <><button className={snapshot.discussionTimer.running ? "active" : ""} onClick={() => void update({ timerAction: snapshot.discussionTimer?.running ? "PAUSE" : "START" })}>{snapshot.discussionTimer.running ? <Pause size={17} /> : <Play size={17} />}{snapshot.discussionTimer.running ? "Timer pausieren" : "Timer starten"}</button><button onClick={() => void update({ timerAction: "ADD_MINUTE" })}><Plus size={17} /> 1 Minute</button><button onClick={() => void update({ timerAction: "RESET" })}><RotateCcw size={17} /> Zurücksetzen</button></> : null : <button className={snapshot.resultsVisible ? "active" : ""} onClick={() => void update({ resultsVisible: !snapshot.resultsVisible })}>{snapshot.resultsVisible ? <Eye size={17} /> : <EyeOff size={17} />}{snapshot.resultsVisible ? "Ergebnisse sichtbar" : "Ergebnisse zeigen"}</button>}</div>}
          {isGroupPresentation && <div className="projection-console-group-navigation"><button disabled={!snapshot.groupPresentation?.activeIndex} onClick={() => void update({ activeGroupIndex: Math.max(0, (snapshot.groupPresentation?.activeIndex ?? 0) - 1) })}><ArrowLeft size={17} /> Vorherige Gruppe</button><span>{snapshot.groupPresentation?.total ? `${snapshot.groupPresentation.activeIndex + 1} / ${snapshot.groupPresentation.total}` : "0 / 0"}</span><button disabled={!snapshot.groupPresentation?.total || (snapshot.groupPresentation.activeIndex ?? 0) >= snapshot.groupPresentation.total - 1} onClick={() => void update({ activeGroupIndex: (snapshot.groupPresentation?.activeIndex ?? 0) + 1 })}>Nächste Gruppe <ArrowRight size={17} /></button></div>}
          <div className="projection-console-shortcuts"><span>← → Seiten</span><span>L Laser</span><span>B Schwarz</span><span>R Teilnahme</span></div>
          {error && <p>{error}</p>}
          <button className="projection-end" onClick={() => { setEndError(""); setEndDialogOpen(true); }}><X size={16} /> Präsentation beenden</button>
        </section>}
        <nav className="projection-dock" aria-label="Präsentationswerkzeuge" onClick={(event) => event.stopPropagation()}>
          <button className={consoleOpen ? "active" : ""} onClick={() => setConsoleOpen((value) => !value)} title="Konsole (C)"><MonitorCog size={19} /><span>Konsole</span></button>
          <button className={laserEnabled ? "active laser" : ""} onClick={() => setLaserEnabled((value) => !value)} title="Laser (L)"><MousePointer2 size={19} /><span>Laser</span></button>
          <button className={isJoinPage || joinScreenVisible ? "active" : ""} onClick={() => { if (!isJoinPage) setJoinScreenVisible((value) => !value); }} title="Teilnahmeseite (R)"><QrCode size={19} /><span>Raum</span></button>
          <button className={blackout ? "active" : ""} onClick={() => setBlackout((value) => !value)} title="Schwarzer Bildschirm (B)"><EyeOff size={19} /><span>Schwarz</span></button>
          <button onClick={enterFullscreen} title="Vollbild (F)"><Fullscreen size={19} /><span>Vollbild</span></button>
        </nav>
      </div>
      {endDialogOpen && snapshot && <EndSessionDialog title={snapshot.presentation.title} roomCode={snapshot.roomCode} busy={endingSession} error={endError} onCancel={() => { setEndDialogOpen(false); setEndError(""); }} onConfirm={() => void endSession()} />}
    </div>
  );
}

function participantToken() {
  const key = "mitrede-participant-token";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `${createClientId()}-${createClientId()}`;
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
  const [groupName, setGroupName] = useState("");
  const [groupAnswers, setGroupAnswers] = useState<string[]>([""]);
  const [groupCompleted, setGroupCompleted] = useState(false);
  const [groupResultDirty, setGroupResultDirty] = useState(false);
  const [groupResultSaved, setGroupResultSaved] = useState(false);
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [scaleSelections, setScaleSelections] = useState<number[]>([]);
  const [participantName, setParticipantName] = useState(() => localStorage.getItem("mitrede-participant-name") ?? "");
  const [participantReady, setParticipantReady] = useState(() => Boolean(localStorage.getItem("mitrede-participant-name")));
  const registeredParticipantRef = useRef("");

  const load = useCallback(async () => {
    try { setSnapshot(await api.roomSnapshot(roomCode, participantToken())); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Raum nicht erreichbar"); }
  }, [roomCode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!snapshot?.sessionId || !participantReady || !participantName.trim()) return;
    const registrationKey = `${snapshot.sessionId}:${participantName.trim()}`;
    if (registeredParticipantRef.current === registrationKey) return;
    registeredParticipantRef.current = registrationKey;
    void api.registerParticipant(roomCode, { participantToken: participantToken(), displayName: participantName.trim() }).then(setSnapshot).catch((caught) => { registeredParticipantRef.current = ""; setError(caught instanceof Error ? caught.message : "Name konnte nicht registriert werden"); });
  }, [participantName, participantReady, roomCode, snapshot?.sessionId]);
  useEffect(() => {
    if (!snapshot?.sessionId) return;
    const socket = connectToSession(snapshot.sessionId, (event) => {
      if (event.type === "session.deleted") { setSnapshot(null); setError("Diese Sitzung wurde gelöscht."); return; }
      void load();
    });
    return () => { socket.disconnect(); };
  }, [load, snapshot?.sessionId]);
  useEffect(() => { setSelected(null); setSubmitted(false); setGroupName(""); setGroupAnswers([""]); setGroupCompleted(false); setGroupResultDirty(false); setGroupResultSaved(false); setSelectedPointIds(snapshot?.priorityVote?.selectedPointIds ?? []); setScaleSelections(snapshot?.scaleVote?.selectedOptionIndexes ?? []); }, [snapshot?.currentNode?.id]);
  const ownDiscussionGroup = snapshot?.currentNode?.type === "GROUP_DISCUSSION"
    ? snapshot.groups.find((group) => group.id === snapshot.participantGroupId) ?? null
    : null;
  useEffect(() => {
    if (snapshot?.currentNode?.type !== "GROUP_DISCUSSION" || groupResultDirty) return;
    const nextAnswers = ownDiscussionGroup?.answers.length ? ownDiscussionGroup.answers : [""];
    setGroupAnswers(nextAnswers);
    setGroupCompleted(ownDiscussionGroup?.completed ?? false);
    setGroupResultSaved(Boolean(ownDiscussionGroup?.answers.length));
  }, [groupResultDirty, ownDiscussionGroup?.answers.join("\u0000"), ownDiscussionGroup?.completed, snapshot?.currentNode?.id]);

  async function submit() {
    if (selected === null || !snapshot?.currentNode) return;
    setSending(true);
    try {
      setSnapshot(await api.submitAnswer(roomCode, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId(), optionIndex: selected }));
      setSubmitted(true);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Antwort konnte nicht gespeichert werden"); }
    finally { setSending(false); }
  }

  async function submitScale() {
    if (!snapshot?.currentNode || !snapshot.scaleVote || !snapshot.scaleVote.statements.every((_, index) => Number.isInteger(scaleSelections[index]))) return;
    setSending(true);
    try {
      const next = await api.submitAnswer(roomCode, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId(), scaleValues: scaleSelections });
      setSnapshot(next);
      setScaleSelections(next.scaleVote?.selectedOptionIndexes ?? scaleSelections);
      setSubmitted(true);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Bewertungen konnten nicht gespeichert werden"); }
    finally { setSending(false); }
  }

  async function confirmParticipantName(event: FormEvent) {
    event.preventDefault();
    const name = participantName.trim();
    if (!name || !snapshot) return;
    setSending(true);
    try {
      registeredParticipantRef.current = `${snapshot.sessionId}:${name}`;
      setSnapshot(await api.registerParticipant(roomCode, { participantToken: participantToken(), displayName: name }));
      localStorage.setItem("mitrede-participant-name", name);
      setParticipantReady(true);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Name konnte nicht registriert werden");
    } finally {
      setSending(false);
    }
  }

  async function createGroup() {
    if (!snapshot?.currentNode || !groupName.trim()) return;
    setSending(true);
    try {
      setSnapshot(await api.createGroup(roomCode, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId(), name: groupName.trim() }));
      setGroupName("");
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gruppe konnte nicht erstellt werden"); }
    finally { setSending(false); }
  }

  async function joinGroup(groupId: string) {
    if (!snapshot?.currentNode) return;
    setSending(true);
    try {
      setSnapshot(await api.joinGroup(roomCode, groupId, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId() }));
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gruppe konnte nicht betreten werden"); }
    finally { setSending(false); }
  }

  async function leaveGroup() {
    if (!snapshot?.currentNode) return;
    setSending(true);
    try {
      setSnapshot(await api.leaveGroup(roomCode, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId() }));
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gruppe konnte nicht verlassen werden"); }
    finally { setSending(false); }
  }

  async function saveGroupResult(completed = groupCompleted) {
    if (!snapshot?.currentNode || !snapshot.participantGroupId) return;
    setSending(true);
    try {
      const answers = groupAnswers.map((answer) => answer.trim()).filter(Boolean);
      setSnapshot(await api.submitGroupResult(roomCode, snapshot.participantGroupId, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId(), answers, completed }));
      setGroupCompleted(completed);
      setGroupResultDirty(false);
      setGroupResultSaved(true);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ergebnis konnte nicht gespeichert werden"); }
    finally { setSending(false); }
  }

  async function submitPriorityVote() {
    if (!snapshot?.currentNode) return;
    setSending(true);
    try {
      const next = await api.submitPriorityVote(roomCode, { participantToken: participantToken(), nodeId: snapshot.currentNode.id, requestId: createClientId(), pointIds: selectedPointIds });
      setSnapshot(next);
      setSelectedPointIds(next.priorityVote?.selectedPointIds ?? selectedPointIds);
      setSubmitted(true);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Stimmen konnten nicht gespeichert werden"); }
    finally { setSending(false); }
  }

  if (!snapshot) return <LoadingScreen message={error || "Raum wird geöffnet…"} />;
  if (snapshot.status === "ENDED") return <div className="join-shell"><header className="join-topbar"><Brand /><span className="join-ended-status"><i /> Beendet</span></header><main className="join-card join-wait join-ended"><CircleCheckBig size={46} /><p className="eyebrow">PRÄSENTATION BEENDET</p><h1>Vielen Dank für Ihre Teilnahme.</h1><p>Diese Präsentation wurde von der Moderation beendet.</p></main><footer className="join-footer">Raum <strong>{snapshot.roomCode.slice(0, 3)} {snapshot.roomCode.slice(3)}</strong><span>·</span> {snapshot.presentation.title}</footer></div>;
  if (!participantReady) return <div className="join-shell"><header className="join-topbar"><Brand /><span><i /> Raum gefunden</span></header><form className="join-name-card" onSubmit={confirmParticipantName}><UsersRound size={38} /><p className="eyebrow">RAUM {snapshot.roomCode.slice(0, 3)} {snapshot.roomCode.slice(3)}</p><h1>Wie heißen Sie?</h1><label>Name<input autoFocus maxLength={40} value={participantName} onChange={(event) => setParticipantName(event.target.value)} placeholder="Vorname oder Anzeigename" /></label>{error && <p className="form-error">{error}</p>}<button className="btn btn-primary" disabled={sending || !participantName.trim()}>{sending ? "Wird verbunden…" : "Raum beitreten"}</button></form></div>;
  const options = snapshot.currentNode?.config.options ?? [];
  const accepting = snapshot.interactionStatus === "ACCEPTING";
  const waitingForPresentation = snapshot.currentNode?.type === "PDF_PAGE" || snapshot.currentNode?.type === "JOIN_PAGE" || snapshot.currentNode?.type === "CONTENT_PAGE" || snapshot.currentNode?.type === "FREEFORM_PAGE";
  const isGroupPage = snapshot.currentNode?.type === "GROUP_PAGE";
  const isGroupDiscussion = snapshot.currentNode?.type === "GROUP_DISCUSSION";
  const isGroupPresentation = snapshot.currentNode?.type === "GROUP_PRESENTATION";
  const isPriorityPage = snapshot.currentNode?.type === "PRIORITY_VOTE";
  const isRating = snapshot.currentNode?.type === "RATING";
  const isMultiScale = isRating && (snapshot.currentNode?.config.statements?.length ?? 0) > 1;
  const isQuiz = snapshot.currentNode?.config.assessmentMode === "QUIZ";
  const correctOptionIndex = snapshot.currentNode?.config.correctOptionIndex;
  const discussionGroup = snapshot.groups.find((group) => group.id === snapshot.participantGroupId) ?? null;
  const discussionMaxAnswers = Math.max(0, Number(snapshot.currentNode?.config.maxAnswers ?? 0));
  const scaleComplete = Boolean(snapshot.scaleVote?.statements.length) && (snapshot.scaleVote?.statements.every((_, index) => Number.isInteger(scaleSelections[index])) ?? false);
  const ratingAverage = isRating ? calculateRatingAverage(options, snapshot.results.counts, snapshot.results.total) : null;

  return (
    <div className="join-shell">
      <header className="join-topbar"><Brand /><span><i /> Verbunden</span></header>
      <main className={waitingForPresentation ? "join-card join-wait" : isGroupPage ? "join-card join-group-card" : isGroupDiscussion ? "join-card join-discussion-card" : isGroupPresentation ? "join-card join-group-presentation-card" : isPriorityPage ? "join-card join-priority-card" : "join-card"}>
        {waitingForPresentation ? <><FileText size={42} /><p className="eyebrow">PRÄSENTATION LÄUFT</p><h1>Bitte schauen Sie auf die Leinwand.</h1><p>Die nächste Interaktion erscheint automatisch auf diesem Gerät.</p></> : isGroupPage ? <>
          <h1>{snapshot.currentNode?.config.question}</h1>
          <p>{snapshot.currentNode?.config.prompt}</p>
          <section className="join-group-list"><header><strong>Gruppen</strong><span>{snapshot.groups.length} / {snapshot.currentNode?.config.maxGroups ?? 8}</span></header>{snapshot.groups.length ? snapshot.groups.map((group) => <article className={snapshot.participantGroupId === group.id ? "current" : ""} key={group.id}><div><UsersRound size={18} /><span><strong>{group.name}</strong><small>{group.memberCount} {group.memberCount === 1 ? "Mitglied" : "Mitglieder"} · {group.memberNames.join(", ")}</small></span></div><button className={snapshot.participantGroupId === group.id ? "leave" : ""} disabled={!accepting || sending} onClick={() => snapshot.participantGroupId === group.id ? void leaveGroup() : void joinGroup(group.id)}>{snapshot.participantGroupId === group.id ? <><LogOut size={15} /> Verlassen</> : "Beitreten"}</button></article>) : <div className="join-group-empty"><UsersRound size={30} /><span>Noch keine Gruppe vorhanden.</span></div>}</section>
          {accepting && snapshot.groups.length < (snapshot.currentNode?.config.maxGroups ?? 8) && <div className="join-group-create"><label>Neue Gruppe erstellen<input maxLength={60} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="z. B. Team Grün" /></label><button className="btn" disabled={sending || !groupName.trim()} onClick={() => void createGroup()}><UserPlus size={17} /> Erstellen &amp; beitreten</button></div>}
          {!accepting && <p className="group-phase-closed"><Lock size={16} /> Die Gruppenphase ist geschlossen.</p>}
          {error && <p className="form-error">{error}</p>}
        </> : isGroupDiscussion ? <>
          <div className="join-discussion-heading"><div><h1>{snapshot.currentNode?.config.question}</h1></div><DiscussionTimer timer={snapshot.discussionTimer} /></div>
          <p>{snapshot.currentNode?.config.prompt}</p>
          {discussionGroup ? <section className="join-discussion-workspace"><header><UsersRound size={20} /><div><strong>{discussionGroup.name}</strong><span>{discussionGroup.memberNames.join(" · ")}</span></div><span className={groupCompleted ? "discussion-ready done" : "discussion-ready"}>{groupCompleted ? <><Check size={14} /> Fertig</> : "In Arbeit"}</span></header><div className="discussion-answer-heading"><div><strong>Antworten Ihrer Gruppe</strong><span>{discussionMaxAnswers > 0 ? `Bis zu ${discussionMaxAnswers} Antworten.` : "Antworten gemeinsam festhalten."}</span></div><small>{groupAnswers.filter((answer) => answer.trim()).length}{discussionMaxAnswers > 0 ? ` / ${discussionMaxAnswers}` : " Antworten"}</small></div><div className="discussion-answer-list">{groupAnswers.map((answer, index) => <div className="discussion-answer-row" key={index}><span>{index + 1}</span><textarea rows={2} maxLength={500} disabled={!accepting} value={answer} onChange={(event) => { setGroupAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item)); setGroupResultDirty(true); setGroupResultSaved(false); if (groupCompleted) setGroupCompleted(false); }} placeholder={`Antwort ${index + 1}`} /><div><button disabled={!accepting || index === 0} onClick={() => { setGroupAnswers((current) => current.map((item, itemIndex) => itemIndex === index - 1 ? current[index]! : itemIndex === index ? current[index - 1]! : item)); setGroupResultDirty(true); }} aria-label="Antwort nach oben"><ArrowUp size={15} /></button><button disabled={!accepting || index === groupAnswers.length - 1} onClick={() => { setGroupAnswers((current) => current.map((item, itemIndex) => itemIndex === index + 1 ? current[index]! : itemIndex === index ? current[index + 1]! : item)); setGroupResultDirty(true); }} aria-label="Antwort nach unten"><ArrowDown size={15} /></button><button disabled={!accepting || groupAnswers.length === 1} onClick={() => { setGroupAnswers((current) => current.filter((_, itemIndex) => itemIndex !== index)); setGroupResultDirty(true); setGroupResultSaved(false); }} aria-label="Antwort löschen"><Trash2 size={15} /></button></div></div>)}</div>{accepting && (discussionMaxAnswers === 0 || groupAnswers.length < discussionMaxAnswers) && <button className="discussion-add-answer" onClick={() => { setGroupAnswers((current) => [...current, ""]); setGroupResultDirty(true); }}><Plus size={16} /> Weitere Antwort hinzufügen</button>}<div className="discussion-workspace-actions"><button className="btn" disabled={!accepting || sending || !groupAnswers.some((answer) => answer.trim())} onClick={() => void saveGroupResult(false)}><Save size={17} /> {sending ? "Wird gespeichert…" : groupResultSaved && !groupResultDirty ? "Gespeichert" : "Zwischenspeichern"}</button><button className={groupCompleted ? "btn discussion-complete done" : "btn btn-primary discussion-complete"} disabled={!accepting || sending || !groupAnswers.some((answer) => answer.trim())} onClick={() => void saveGroupResult(!groupCompleted)}>{groupCompleted ? <><RotateCcw size={17} /> Weiterbearbeiten</> : <><Check size={17} /> Als fertig markieren</>}</button></div><p className="discussion-sync-note">Änderungen sind nach dem Speichern für alle Mitglieder dieser Gruppe sichtbar.</p></section> : <section className="join-discussion-missing"><UsersRound size={30} /><strong>Sie gehören noch keiner Gruppe an.</strong><span>Gehen Sie zur Seite „Gruppen erstellen“ oder wenden Sie sich an die Moderation.</span></section>}
          {!accepting && <p className="group-phase-closed"><Lock size={16} /> Die Diskussion ist geschlossen.</p>}
          {error && <p className="form-error">{error}</p>}
        </> : isGroupPresentation ? <>
          {snapshot.groupPresentation?.activeGroup ? <div className="join-group-presentation"><span>GRUPPE {snapshot.groupPresentation.activeIndex + 1} VON {snapshot.groupPresentation.total}</span><h1>{snapshot.groupPresentation.activeGroup.name} präsentiert</h1><p className="join-group-presenters"><UsersRound size={18} /> {snapshot.groupPresentation.activeGroup.memberNames.join(" · ")}</p><section>{snapshot.groupPresentation.activeGroup.answers.length ? snapshot.groupPresentation.activeGroup.answers.map((answer, index) => <article key={index}><b>{index + 1}</b><p>{answer}</p></article>) : <div className="join-group-presentation-empty">Noch keine Antwort gespeichert.</div>}</section><small>Bitte folgen Sie der Erklärung der Gruppenmitglieder.</small></div> : <div className="join-group-presentation-empty"><UsersRound size={34} /><h1>Noch keine Gruppenergebnisse</h1><p>Warten Sie auf die Auswahl durch die Moderation.</p></div>}
        </> : isPriorityPage ? <>
          <h1>{snapshot.currentNode?.config.question}</h1>
          <p>{accepting ? `Wählen Sie bis zu ${snapshot.priorityVote?.maxVotes ?? 3} unterschiedliche Punkte.` : "Die Abstimmung ist geschlossen."}</p>
          <div className="priority-vote-budget"><Vote size={19} /><strong>{Math.max(0, (snapshot.priorityVote?.maxVotes ?? 3) - selectedPointIds.length)}</strong><span>Stimmen übrig</span></div>
          <section className="join-priority-list">{snapshot.priorityVote?.points.length ? snapshot.priorityVote.points.map((point, index) => { const isSelected = selectedPointIds.includes(point.id); const limitReached = selectedPointIds.length >= (snapshot.priorityVote?.maxVotes ?? 3); return <button className={isSelected ? "selected" : ""} key={point.id} disabled={!accepting || (!isSelected && limitReached)} onClick={() => { setSelectedPointIds((current) => current.includes(point.id) ? current.filter((id) => id !== point.id) : [...current, point.id]); setSubmitted(false); }}><span className="priority-choice">{isSelected ? <Check size={18} /> : index + 1}</span><span><strong>{point.text}</strong><small>{point.groupName}</small></span>{snapshot.resultsVisible && <b>{point.count}</b>}</button>; }) : <div className="join-priority-empty"><Vote size={30} /><strong>Noch keine Punkte vorhanden</strong><span>Die Moderation kann zuerst Gruppenergebnisse sammeln.</span></div>}</section>
          <button className="btn btn-primary submit-answer" disabled={!accepting || sending || !snapshot.priorityVote?.points.length} onClick={() => void submitPriorityVote()}>{submitted ? <><Check size={19} /> Stimmen gespeichert</> : sending ? "Wird gespeichert…" : `${selectedPointIds.length} ${selectedPointIds.length === 1 ? "Stimme" : "Stimmen"} abgeben`}</button>
          {error && <p className="form-error">{error}</p>}<p className="privacy-note">Sie können Ihre Auswahl ändern, solange die Priorisierung geöffnet ist.</p>
        </> : isMultiScale ? <>
          <div className="join-multi-scale-heading"><h1>{snapshot.currentNode?.config.question}</h1><p>{accepting ? "Bewerten Sie jede Aussage." : "Die Bewertung ist geschlossen."}</p></div>
          <section className="join-multi-scale">{snapshot.scaleVote?.statements.map((statement, statementIndex) => <article key={statementIndex}><div><strong>{statement.text}</strong>{snapshot.resultsVisible && statement.average !== null && <b>Ø {statement.average.toFixed(1)}</b>}</div><RatingScaleInput options={snapshot.scaleVote?.options ?? []} selectedIndex={scaleSelections[statementIndex]} minLabel={snapshot.currentNode?.config.minLabel} maxLabel={snapshot.currentNode?.config.maxLabel} disabled={!accepting} compact ariaLabel={statement.text} onChange={(optionIndex) => { setScaleSelections((current) => { const next = [...current]; next[statementIndex] = optionIndex; return next; }); setSubmitted(false); }} /></article>)}</section>
          <button className="btn btn-primary submit-answer" disabled={!accepting || sending || !scaleComplete} onClick={() => void submitScale()}>{submitted ? <><Check size={19} /> Bewertungen gespeichert</> : sending ? "Wird gespeichert…" : "Bewertungen senden"}</button>
          {error && <p className="form-error">{error}</p>}<p className="privacy-note">Sie können Ihre Bewertungen ändern, solange die Interaktion geöffnet ist.</p>
        </> : <>
          <h1>{snapshot.currentNode?.config.question ?? "Warten auf die nächste Frage"}</h1>
          <p>{accepting ? isRating ? "Wählen Sie eine Bewertung." : "Wählen Sie eine Antwort." : "Diese Frage ist derzeit gesperrt."}</p>
          {isRating ? <RatingScaleInput options={options} selectedIndex={selected} minLabel={snapshot.currentNode?.config.minLabel} maxLabel={snapshot.currentNode?.config.maxLabel} disabled={!accepting} onChange={(index) => { setSelected(index); setSubmitted(false); }} /> : <div className="join-options">{options.map((option, index) => <button className={selected === index ? "join-option selected" : "join-option"} key={option} disabled={!accepting} onClick={() => { setSelected(index); setSubmitted(false); }}><span>{String.fromCharCode(65 + index)}</span>{option}{selected === index && <Check size={20} />}</button>)}</div>}
          <button className="btn btn-primary submit-answer" disabled={!accepting || selected === null || sending} onClick={() => void submit()}>{submitted ? <><Check size={19} /> {isRating ? "Bewertung gespeichert" : "Antwort gespeichert"}</> : sending ? "Wird gespeichert…" : isRating ? "Bewertung senden" : "Antwort senden"}</button>
          {submitted && isQuiz && snapshot.resultsVisible && correctOptionIndex !== undefined && selected !== null && <div className={selected === correctOptionIndex ? "quiz-feedback correct" : "quiz-feedback incorrect"}><strong>{selected === correctOptionIndex ? "Richtig!" : "Nicht ganz."}</strong>{selected !== correctOptionIndex && <span>Richtig ist: {options[correctOptionIndex]}</span>}</div>}
          {snapshot.resultsVisible && (isRating ? <div className="mobile-rating-result"><strong>Durchschnittliche Bewertung</strong><RatingScaleRail min={Number(options[0] ?? 1)} max={Number(options.at(-1) ?? 5)} minLabel={snapshot.currentNode?.config.minLabel} maxLabel={snapshot.currentNode?.config.maxLabel} value={ratingAverage} valuePrefix="Ø " counts={snapshot.results.counts} compact /></div> : <div className="mobile-results"><strong>Live-Ergebnis</strong>{options.map((option, index) => { const count = snapshot.results.counts[index] ?? 0; const percentage = snapshot.results.total ? Math.round(count / snapshot.results.total * 100) : 0; return <div className={isQuiz && correctOptionIndex === index ? "correct" : ""} key={option}><span>{option}{isQuiz && correctOptionIndex === index && <Check size={13} />}</span><i><b style={{ width: `${percentage}%` }} /></i><small>{percentage}%</small></div>; })}</div>)}
          {error && <p className="form-error">{error}</p>}<p className="privacy-note">Ihre Teilnahme ist anonym. Sie können Ihre Antwort ändern, solange die Interaktion geöffnet ist.</p>
        </>}
      </main>
      <footer className="join-footer">Raum <strong>{snapshot.roomCode.slice(0, 3)} {snapshot.roomCode.slice(3)}</strong><span>·</span> {snapshot.presentation.title}</footer>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(false);
  useEffect(() => { const updateRoute = () => setRoute(currentRoute()); window.addEventListener("popstate", updateRoute); return () => window.removeEventListener("popstate", updateRoute); }, []);
  const protectedRoute = route !== "home" && route !== "join";
  useEffect(() => {
    if (!protectedRoute) return;
    let active = true;
    setAuthChecking(true);
    void api.me().then(({ user }) => {
      if (active) setAuthUser(user);
    }).catch(() => {
      if (!active) return;
      setAuthUser(null);
      window.history.replaceState({}, "", "/#login");
      setRoute("home");
    }).finally(() => {
      if (active) setAuthChecking(false);
    });
    return () => { active = false; };
  }, [protectedRoute, route]);

  async function logout() {
    await api.logout().catch(() => undefined);
    setAuthUser(null);
    window.history.replaceState({}, "", "/#login");
    setRoute("home");
  }

  if (protectedRoute && (authChecking || !authUser)) return <LoadingScreen message="Anmeldung wird geprüft…" />;
  if (route === "editor") return <EditorView />;
  if (route === "settings") return <SettingsView />;
  if (route === "results") return <ResultsView />;
  if (route === "preview") return <PreviewView />;
  if (route === "present") return <PresenterView />;
  if (route === "join") return <JoinView />;
  if (route === "home") return <GuestHome />;
  return <Dashboard authUser={authUser!} onLogout={() => void logout()} />;
}
