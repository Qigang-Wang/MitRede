import { useEffect, useState } from "react";
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
  Users,
  Vote,
  X,
} from "lucide-react";

type DemoRoute = "dashboard" | "present" | "join";

const presentations = [
  {
    title: "KI in der Forschung",
    meta: "18 Folien · 3 Interaktionen",
    edited: "Vor 12 Minuten",
    tone: "teal",
    icon: Sparkles,
  },
  {
    title: "Institutsversammlung",
    meta: "32 Folien · 5 Interaktionen",
    edited: "Gestern",
    tone: "coral",
    icon: Users,
  },
  {
    title: "Onboarding 2026",
    meta: "24 Folien · 4 Interaktionen",
    edited: "18. August",
    tone: "blue",
    icon: Presentation,
  },
];

function routeFromPath(): DemoRoute {
  if (window.location.pathname.startsWith("/present")) return "present";
  if (window.location.pathname.startsWith("/join")) return "join";
  return "dashboard";
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="MitRede">
      <span className="brand-mark" aria-hidden="true">
        <MessageCircleMore size={compact ? 19 : 22} strokeWidth={2.4} />
      </span>
      {!compact && <span>MitRede</span>}
    </div>
  );
}

function Dashboard() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="main-nav" aria-label="Hauptnavigation">
          <a className="nav-item active" href="/app" onClick={(event) => event.preventDefault()}>
            <LayoutDashboard size={18} /> Übersicht
          </a>
          <a className="nav-item" href="#presentations">
            <Presentation size={18} /> Präsentationen
          </a>
          <a className="nav-item" href="#sessions">
            <Radio size={18} /> Live-Sitzungen
          </a>
          <a className="nav-item" href="#results">
            <BarChart3 size={18} /> Ergebnisse
          </a>
        </nav>
        <div className="sidebar-foot">
          <a className="nav-item" href="#help"><CircleHelp size={18} /> Hilfe</a>
          <a className="nav-item" href="#settings"><Settings size={18} /> Einstellungen</a>
          <div className="profile">
            <span className="avatar">SW</span>
            <span><strong>Sabine Wolf</strong><small>Moderatorin</small></span>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <label className="search-box">
            <Search size={18} />
            <input aria-label="Präsentationen durchsuchen" placeholder="Präsentationen durchsuchen…" />
            <kbd>⌘ K</kbd>
          </label>
          <button className="btn btn-primary"><Plus size={18} /> Neue Präsentation</button>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">DIENSTAG, 25. AUGUST</p>
            <h1>Guten Morgen, Sabine.</h1>
            <p>Was möchten Sie heute gemeinsam herausfinden?</p>
          </div>
          <div className="quick-room">
            <span className="live-dot" />
            <div><strong>Schnell beitreten</strong><small>Raumcode eingeben</small></div>
            <button onClick={() => navigate("/join/483921")}>483 921 <ChevronRight size={17} /></button>
          </div>
        </section>

        <section className="section-block" id="presentations">
          <div className="section-heading">
            <div><p className="eyebrow">WEITERARBEITEN</p><h2>Zuletzt bearbeitet</h2></div>
            <button className="text-button">Alle anzeigen <ArrowRight size={16} /></button>
          </div>
          <div className="presentation-grid">
            {presentations.map(({ title, meta, edited, tone, icon: Icon }, index) => (
              <article className="presentation-card" key={title}>
                <div className={`card-preview ${tone}`}>
                  <span className="preview-kicker">MITREDE · INTERN</span>
                  <Icon size={42} strokeWidth={1.4} />
                  <strong>{title}</strong>
                  <span className="slide-number">{index + 1} / {18 + index * 7}</span>
                </div>
                <div className="card-body">
                  <div><h3>{title}</h3><p>{meta}</p></div>
                  <button className="icon-button" aria-label={`${title} Optionen`}><MoreHorizontal size={20} /></button>
                </div>
                <div className="card-foot">
                  <span><Clock3 size={14} /> {edited}</span>
                  {index === 0 && (
                    <button className="start-button" onClick={() => navigate("/present/demo")}>
                      <Play size={14} fill="currentColor" /> Starten
                    </button>
                  )}
                </div>
              </article>
            ))}
            <button className="new-card">
              <span><Plus size={24} /></span>
              <strong>PDF hochladen</strong>
              <small>Neue Präsentation anlegen</small>
            </button>
          </div>
        </section>

        <section className="next-session" id="sessions">
          <div className="session-date"><strong>27</strong><span>AUG</span></div>
          <div className="session-info">
            <span className="status-pill">GEPLANT</span>
            <h3>Methodenwerkstatt: Forschungsdaten</h3>
            <p>Donnerstag, 10:00 Uhr · Großer Seminarraum</p>
          </div>
          <div className="session-people"><span>MK</span><span>JL</span><span>+16</span></div>
          <button className="btn btn-secondary">Vorbereiten <ChevronRight size={17} /></button>
        </section>
      </main>
    </div>
  );
}

function PresenterView() {
  const [accepting, setAccepting] = useState(true);
  const [resultsVisible, setResultsVisible] = useState(true);

  return (
    <div className="presenter-shell">
      <header className="presenter-topbar">
        <button className="icon-button dark" onClick={() => navigate("/app")} aria-label="Zurück">
          <X size={21} />
        </button>
        <div><strong>KI in der Forschung</strong><span className="live-badge"><i /> LIVE</span></div>
        <div className="presenter-meta"><Users size={18} /> 24 online <button className="room-code"><QrCode size={18} /> 483 921</button></div>
      </header>

      <main className="stage-wrap">
        <div className="stage">
          <p className="stage-kicker">LIVE-UMFRAGE</p>
          <h1>Wo sehen Sie das größte Potenzial von KI in Ihrer Arbeit?</h1>
          <p className="stage-subtitle">Eine Antwort auswählen</p>
          {resultsVisible ? (
            <div className="result-list">
              {[
                ["Datenanalyse", 41, 10],
                ["Literaturrecherche", 29, 7],
                ["Texterstellung", 21, 5],
                ["Projektorganisation", 9, 2],
              ].map(([label, percentage, count], index) => (
                <div className="result-row" key={String(label)}>
                  <span className="result-letter">{String.fromCharCode(65 + index)}</span>
                  <div><div className="result-label"><strong>{label}</strong><span>{count} Stimmen · {percentage}%</span></div>
                    <div className="result-track"><span style={{ width: `${percentage}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="results-hidden"><BarChart3 size={34} /><strong>Ergebnisse verborgen</strong><span>Die Stimmen werden weiterhin gesammelt.</span></div>
          )}
          <p className="answer-count"><Check size={16} /> 24 von 24 Personen haben abgestimmt</p>
        </div>
      </main>

      <footer className="presenter-controls">
        <div className="page-controls"><button><ArrowLeft size={19} /></button><span>7 / 21</span><button><ArrowRight size={19} /></button></div>
        <div className="moderation-controls">
          <button className={accepting ? "control active" : "control"} onClick={() => setAccepting(!accepting)}>
            {accepting ? <Radio size={18} /> : <Lock size={18} />}{accepting ? "Antworten offen" : "Antworten gesperrt"}
          </button>
          <button className={resultsVisible ? "control active" : "control"} onClick={() => setResultsVisible(!resultsVisible)}>
            <BarChart3 size={18} /> {resultsVisible ? "Ergebnisse sichtbar" : "Ergebnisse verborgen"}
          </button>
        </div>
        <button className="control"><Fullscreen size={18} /></button>
      </footer>
    </div>
  );
}

function JoinView() {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const options = ["Datenanalyse", "Literaturrecherche", "Texterstellung", "Projektorganisation"];

  return (
    <div className="join-shell">
      <header className="join-topbar"><Brand /><span><i /> Verbunden</span></header>
      <main className="join-card">
        <p className="eyebrow">LIVE-UMFRAGE · FRAGE 1 VON 3</p>
        <h1>Wo sehen Sie das größte Potenzial von KI in Ihrer Arbeit?</h1>
        <p>Wählen Sie eine Antwort.</p>
        <div className="join-options">
          {options.map((option, index) => (
            <button
              className={selected === index ? "join-option selected" : "join-option"}
              key={option}
              onClick={() => { setSelected(index); setSubmitted(false); }}
            >
              <span>{String.fromCharCode(65 + index)}</span>{option}
              {selected === index && <Check size={20} />}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary submit-answer"
          disabled={selected === null}
          onClick={() => setSubmitted(true)}
        >
          {submitted ? <><Check size={19} /> Antwort gespeichert</> : "Antwort senden"}
        </button>
        <p className="privacy-note">Ihre Teilnahme ist anonym. Sie können Ihre Antwort ändern, solange die Umfrage geöffnet ist.</p>
      </main>
      <footer className="join-footer">Raum <strong>483 921</strong><span>·</span> KI in der Forschung</footer>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<DemoRoute>(routeFromPath);

  useEffect(() => {
    const onRouteChange = () => setRoute(routeFromPath());
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);

  if (route === "present") return <PresenterView />;
  if (route === "join") return <JoinView />;
  return <Dashboard />;
}
