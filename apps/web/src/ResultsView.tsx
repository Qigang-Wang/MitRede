import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  LayoutDashboard,
  MessageCircleMore,
  Presentation,
  Radio,
  Settings,
  Users,
} from "lucide-react";
import { api, type SessionHistoryItem, type SessionResults } from "./api";

type Filter = "all" | "live" | "ended";

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function routeSessionId() {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[2] ?? "");
}

function formatDate(value: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return "–";
  const duration = Math.max(0, new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime());
  const minutes = Math.max(1, Math.round(duration / 60000));
  return minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

function averageRating(options: string[], counts: number[], total: number) {
  if (!total) return 0;
  return options.reduce((sum, option, index) => sum + Number(option) * (counts[index] ?? 0), 0) / total;
}

function ResultsBrand() {
  return <div className="brand"><span className="brand-mark"><MessageCircleMore size={22} /></span><span>MitRede</span></div>;
}

function exportCsv(results: SessionResults) {
  const rows: Array<Array<string | number>> = [["Präsentation", "Raum", "Frage", "Antwort", "Stimmen", "Prozent"]];
  for (const question of results.questions) {
    question.options.forEach((option, index) => {
      const count = question.counts[index] ?? 0;
      const percentage = question.total ? Math.round((count / question.total) * 100) : 0;
      rows.push([results.presentation.title, results.roomCode, question.question, option, count, `${percentage}%`]);
    });
  }
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `mitrede-${results.roomCode}-ergebnisse.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ResultsView() {
  const initialFilter = new URLSearchParams(window.location.search).get("filter") === "live" ? "live" : "all";
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState(routeSessionId());
  const [results, setResults] = useState<SessionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.sessionHistory().then((items) => {
      setHistory(items);
      if (!selectedId && items[0]) {
        setSelectedId(items[0].id);
        window.history.replaceState({}, "", `/app/results/${items[0].id}`);
      }
      setError("");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Sitzungen konnten nicht geladen werden")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setResults(null); return; }
    setResults(null);
    void api.sessionResults(selectedId).then((next) => { setResults(next); setError(""); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Auswertung konnte nicht geladen werden"));
  }, [selectedId]);

  const visibleHistory = useMemo(() => history.filter((item) => {
    if (filter === "live") return item.status === "LIVE";
    if (filter === "ended") return item.status === "ENDED";
    return true;
  }), [filter, history]);

  const totals = useMemo(() => ({
    sessions: history.length,
    participants: history.reduce((sum, item) => sum + item.participantCount, 0),
    answers: history.reduce((sum, item) => sum + item.answerCount, 0),
  }), [history]);

  function selectSession(id: string) {
    setSelectedId(id);
    window.history.pushState({}, "", `/app/results/${id}`);
  }

  return (
    <div className="results-shell">
      <aside className="sidebar results-sidebar">
        <ResultsBrand />
        <nav className="main-nav" aria-label="Hauptnavigation">
          <button className="nav-item" onClick={() => go("/app")}><LayoutDashboard size={18} /> Übersicht</button>
          <button className="nav-item" onClick={() => go("/app#presentations")}><Presentation size={18} /> Präsentationen</button>
          <button className={filter === "live" ? "nav-item active" : "nav-item"} onClick={() => setFilter("live")}><Radio size={18} /> Live-Sitzungen</button>
          <button className={filter !== "live" ? "nav-item active" : "nav-item"} onClick={() => setFilter("all")}><BarChart3 size={18} /> Ergebnisse</button>
        </nav>
        <div className="sidebar-foot"><span className="nav-item"><Settings size={18} /> Einstellungen</span><div className="profile"><span className="avatar">SW</span><span><strong>Sabine Wolf</strong><small>Moderatorin</small></span></div></div>
      </aside>

      <main className="results-main">
        <header className="results-header">
          <div><button onClick={() => go("/app")}><ArrowLeft size={16} /> Übersicht</button><p className="eyebrow">MITREDE · AUSWERTUNG</p><h1>Ergebnisse & Sitzungen</h1><p>Vergleichen Sie Beteiligung und Antworten aus Ihren Präsentationen.</p></div>
          <div className="results-summary">
            <article><CalendarDays size={19} /><span><strong>{totals.sessions}</strong><small>Sitzungen</small></span></article>
            <article><Users size={19} /><span><strong>{totals.participants}</strong><small>Teilnehmende</small></span></article>
            <article><CheckCircle2 size={19} /><span><strong>{totals.answers}</strong><small>Antworten</small></span></article>
          </div>
        </header>

        {error && <div className="inline-error results-error">{error}</div>}

        <div className="results-content">
          <section className="session-history">
            <div className="results-section-heading"><div><p className="eyebrow">VERLAUF</p><h2>Sitzungen</h2></div><span>{visibleHistory.length}</span></div>
            <div className="result-filters" role="group" aria-label="Sitzungen filtern">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Alle</button>
              <button className={filter === "ended" ? "active" : ""} onClick={() => setFilter("ended")}>Beendet</button>
              <button className={filter === "live" ? "active" : ""} onClick={() => setFilter("live")}>Laufend</button>
            </div>
            <div className="session-history-list">
              {loading && <div className="results-empty">Sitzungen werden geladen…</div>}
              {!loading && visibleHistory.length === 0 && <div className="results-empty"><BarChart3 size={25} /><strong>Noch keine Sitzungen</strong><span>Starten Sie eine Präsentation, um Ergebnisse zu sammeln.</span></div>}
              {visibleHistory.map((item) => (
                <button className={selectedId === item.id ? "session-history-card selected" : "session-history-card"} key={item.id} onClick={() => selectSession(item.id)}>
                  <div><span className={item.status === "LIVE" ? "session-state live" : "session-state"}>{item.status === "LIVE" ? "LIVE" : "BEENDET"}</span><small>{formatDate(item.startedAt)}</small></div>
                  <strong>{item.presentation.title}</strong>
                  <p>Raum {item.roomCode.slice(0, 3)} {item.roomCode.slice(3)}</p>
                  <footer><span><Users size={13} /> {item.participantCount}</span><span><CheckCircle2 size={13} /> {item.answerCount}</span><span><Clock3 size={13} /> {formatDuration(item.startedAt, item.endedAt)}</span><ChevronRight size={15} /></footer>
                </button>
              ))}
            </div>
          </section>

          <section className="results-detail">
            {!selectedId ? <div className="results-detail-empty"><BarChart3 size={35} /><h2>Wählen Sie eine Sitzung aus.</h2></div> : !results ? <div className="results-detail-empty"><div className="status-spinner" /><p>Auswertung wird geladen…</p></div> : (
              <>
                <header className="results-detail-header">
                  <div><p className="eyebrow">SITZUNG · {results.roomCode}</p><h2>{results.presentation.title}</h2><p>{formatDate(results.startedAt)} · {formatDuration(results.startedAt, results.endedAt)}</p></div>
                  <div className="results-detail-actions">
                    {results.status === "LIVE" && <button onClick={() => go(`/present/${results.sessionId}`)}><Radio size={16} /> Live öffnen</button>}
                    <button onClick={() => exportCsv(results)}><Download size={16} /> CSV exportieren</button>
                  </div>
                </header>
                <div className="session-kpis">
                  <article><span>Teilnehmende</span><strong>{results.participantCount}</strong></article>
                  <article><span>Antworten</span><strong>{results.answerCount}</strong></article>
                  <article><span>Interaktionen</span><strong>{results.questions.length}</strong></article>
                  <article><span>Status</span><strong className={results.status === "LIVE" ? "live-text" : ""}>{results.status === "LIVE" ? "Laufend" : "Beendet"}</strong></article>
                </div>
                <div className="question-results">
                  {results.questions.length === 0 && <div className="results-empty"><strong>Keine Interaktionen</strong><span>Diese Präsentation enthält noch keine auswertbaren Fragen.</span></div>}
                  {results.questions.map((question, questionIndex) => {
                    const isRating = question.type === "RATING";
                    const average = averageRating(question.options, question.counts, question.total);
                    return <article className="question-result-card" key={question.nodeId}>
                      <div className="question-result-heading"><span>{questionIndex + 1}</span><div><small>{isRating ? "SKALA" : "SINGLE CHOICE"}</small><h3>{question.question}</h3></div><strong>{isRating ? `Ø ${average.toFixed(1)}` : `${question.total} Antworten`}</strong></div>
                      {isRating && <div className="result-rating-summary"><strong>{average.toFixed(1)}</strong><span>Durchschnitt aus {question.total} Bewertungen</span><small>{question.minLabel} · {question.min}–{question.max} · {question.maxLabel}</small></div>}
                      <div className="question-result-bars">
                        {question.options.map((option, index) => {
                          const count = question.counts[index] ?? 0;
                          const percentage = question.total ? Math.round((count / question.total) * 100) : 0;
                          return <div key={`${index}-${option}`}><span>{isRating ? option : String.fromCharCode(65 + index)}</span><section><div><strong>{isRating ? `${option} Punkte` : option}</strong><small>{count} · {percentage}%</small></div><i><b style={{ width: `${percentage}%` }} /></i></section></div>;
                        })}
                      </div>
                    </article>;
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
