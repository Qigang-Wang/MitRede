import { useEffect, useMemo, useState, type MouseEvent } from "react";
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
  Trash2,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { api, type SessionHistoryItem, type SessionResults } from "./api";
import EndSessionDialog from "./EndSessionDialog";
import { RatingDistribution, RatingScaleRail } from "./RatingScale";

type Filter = "all" | "live" | "ended";
type EndTarget = { sessionId: string; roomCode: string; title: string };
type SessionContextMenu = { x: number; y: number; targetIds: string[] };

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
  const rows: Array<Array<string | number>> = [["Präsentation", "Raum", "Frage", "Antwort", "Gruppe", "Stimmen", "Anteil"]];
  for (const question of results.questions) {
    if (question.scaleStatements?.length) {
      for (const statement of question.scaleStatements) {
        question.options.forEach((option, index) => {
          const count = statement.counts[index] ?? 0;
          const percentage = statement.total ? Math.round((count / statement.total) * 100) : 0;
          rows.push([results.presentation.title, results.roomCode, `${question.question} – ${statement.text}`, option, "", count, `${percentage}%`]);
        });
      }
      continue;
    }
    question.options.forEach((option, index) => {
      const count = question.counts[index] ?? 0;
      const percentage = question.total ? Math.round((count / question.total) * 100) : 0;
      rows.push([results.presentation.title, results.roomCode, question.question, option, question.optionGroups?.[index] ?? "", count, `${percentage}%`]);
    });
  }
  for (const discussion of results.groupDiscussions ?? []) {
    for (const group of discussion.groups) rows.push([results.presentation.title, results.roomCode, discussion.question, group.result, group.name, group.memberCount, ""]);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => { const id = routeSessionId(); return new Set(id ? [id] : []); });
  const [selectionAnchor, setSelectionAnchor] = useState(routeSessionId());
  const [results, setResults] = useState<SessionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [endingIds, setEndingIds] = useState<Set<string>>(new Set());
  const [endTargets, setEndTargets] = useState<EndTarget[]>([]);
  const [endError, setEndError] = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<EndTarget[]>([]);
  const [deleteError, setDeleteError] = useState("");
  const [contextMenu, setContextMenu] = useState<SessionContextMenu | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.sessionHistory().then((items) => {
      setHistory(items);
      if (!selectedId && items[0]) {
        setSelectedId(items[0].id);
        setSelectedIds(new Set([items[0].id]));
        setSelectionAnchor(items[0].id);
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

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [contextMenu]);

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

  const selectedVisibleItems = useMemo(() => visibleHistory.filter((item) => selectedIds.has(item.id)), [selectedIds, visibleHistory]);
  const selectedLiveItems = useMemo(() => selectedVisibleItems.filter((item) => item.status === "LIVE"), [selectedVisibleItems]);
  const contextItems = useMemo(() => contextMenu ? history.filter((item) => contextMenu.targetIds.includes(item.id)) : [], [contextMenu, history]);
  const contextLiveItems = useMemo(() => contextItems.filter((item) => item.status === "LIVE"), [contextItems]);

  function focusSession(id: string) {
    setSelectedId(id);
    window.history.pushState({}, "", id ? `/app/results/${id}` : "/app/results");
  }

  function selectSession(id: string, options: { shiftKey?: boolean; additive?: boolean } = {}) {
    if (options.shiftKey && selectionAnchor) {
      const anchorIndex = visibleHistory.findIndex((item) => item.id === selectionAnchor);
      const targetIndex = visibleHistory.findIndex((item) => item.id === id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const range = visibleHistory.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1);
        setSelectedIds((current) => {
          const next = options.additive ? new Set(current) : new Set<string>();
          range.forEach((item) => next.add(item.id));
          return next;
        });
        focusSession(id);
        return;
      }
    }

    if (options.additive) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIds(next);
      setSelectionAnchor(id);
      if (next.has(id)) focusSession(id);
      else if (selectedId === id) focusSession(Array.from(next).at(-1) ?? "");
      return;
    }

    setSelectedIds(new Set([id]));
    setSelectionAnchor(id);
    focusSession(id);
  }

  function requestEndLiveSession(sessionId: string, roomCode: string, title: string) {
    setEndError("");
    setEndTargets([{ sessionId, roomCode, title }]);
  }

  function requestEndSelectedSessions() {
    setEndError("");
    setEndTargets(selectedLiveItems.map((item) => ({ sessionId: item.id, roomCode: item.roomCode, title: item.presentation.title })));
  }

  function openSessionContextMenu(event: MouseEvent, item: SessionHistoryItem) {
    event.preventDefault();
    const targetIds = selectedIds.has(item.id) ? selectedVisibleItems.map((selected) => selected.id) : [item.id];
    if (!selectedIds.has(item.id)) selectSession(item.id);
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 224), y: Math.min(event.clientY, window.innerHeight - 126), targetIds });
  }

  function requestEndContextSessions() {
    setEndError("");
    setEndTargets(contextLiveItems.map((item) => ({ sessionId: item.id, roomCode: item.roomCode, title: item.presentation.title })));
    setContextMenu(null);
  }

  function requestDeleteSessions(items: SessionHistoryItem[]) {
    setDeleteError("");
    setDeleteTargets(items.map((item) => ({ sessionId: item.id, roomCode: item.roomCode, title: item.presentation.title })));
    setContextMenu(null);
  }

  async function endLiveSessions() {
    if (!endTargets.length) return;
    setEndingIds(new Set(endTargets.map((target) => target.sessionId)));
    setEndError("");
    setError("");
    try {
      const outcomes = await Promise.allSettled(endTargets.map(async (target) => ({ target, ended: await api.endSession(target.sessionId) })));
      const completed = new Map(outcomes.filter((outcome): outcome is PromiseFulfilledResult<{ target: EndTarget; ended: SessionResults }> => outcome.status === "fulfilled").map((outcome) => [outcome.value.target.sessionId, outcome.value.ended]));
      setHistory((items) => items.map((item) => { const ended = completed.get(item.id); return ended ? { ...item, status: "ENDED", endedAt: ended.endedAt } : item; }));
      const selectedResult = completed.get(selectedId);
      if (selectedResult) setResults(selectedResult);
      const failed = endTargets.filter((target) => !completed.has(target.sessionId));
      if (failed.length) {
        setEndTargets(failed);
        setEndError(`${failed.length} ${failed.length === 1 ? "Sitzung konnte" : "Sitzungen konnten"} nicht beendet werden.`);
      } else {
        setEndTargets([]);
      }
    } finally {
      setEndingIds(new Set());
    }
  }

  async function deleteSessions() {
    if (!deleteTargets.length) return;
    setDeletingIds(new Set(deleteTargets.map((target) => target.sessionId)));
    setDeleteError("");
    setError("");
    try {
      const outcomes = await Promise.allSettled(deleteTargets.map(async (target) => ({ target, removed: await api.deleteSession(target.sessionId) })));
      const completedIds = new Set(outcomes.filter((outcome): outcome is PromiseFulfilledResult<{ target: EndTarget; removed: { removed: boolean } }> => outcome.status === "fulfilled").map((outcome) => outcome.value.target.sessionId));
      const remaining = history.filter((item) => !completedIds.has(item.id));
      setHistory(remaining);
      setSelectedIds((current) => { const next = new Set(current); completedIds.forEach((id) => next.delete(id)); return next; });
      if (completedIds.has(selectedId)) {
        const next = remaining.find((item) => filter === "all" || (filter === "live" ? item.status === "LIVE" : item.status === "ENDED")) ?? remaining[0];
        setSelectedId(next?.id ?? "");
        setResults(null);
        if (next) {
          setSelectedIds((current) => current.size ? current : new Set([next.id]));
          setSelectionAnchor(next.id);
        }
        window.history.replaceState({}, "", next ? `/app/results/${next.id}` : "/app/results");
      }
      const failed = deleteTargets.filter((target) => !completedIds.has(target.sessionId));
      if (failed.length) {
        setDeleteTargets(failed);
        setDeleteError(`${failed.length} ${failed.length === 1 ? "Sitzung konnte" : "Sitzungen konnten"} nicht gelöscht werden.`);
      } else {
        setDeleteTargets([]);
      }
    } finally {
      setDeletingIds(new Set());
    }
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
        <div className="sidebar-foot"><a className="nav-item" href="/app/settings"><Settings size={18} /> Einstellungen</a><div className="profile"><span className="avatar">SW</span><span><strong>Sabine Wolf</strong><small>Moderatorin</small></span></div></div>
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
            {selectedVisibleItems.length > 1 && <div className="session-multi-toolbar"><strong>{selectedVisibleItems.length} ausgewählt</strong><div>{selectedLiveItems.length > 0 && <button className="session-bulk-end" onClick={requestEndSelectedSessions}><X size={13} /> {selectedLiveItems.length} beenden</button>}<button className="session-bulk-delete" onClick={() => requestDeleteSessions(selectedVisibleItems)}><Trash2 size={13} /> {selectedVisibleItems.length} löschen</button><button className="session-clear-selection" onClick={() => setSelectedIds(new Set(selectedId ? [selectedId] : []))}>Auswahl aufheben</button></div></div>}
            <div className="session-history-list">
              {loading && <div className="results-empty">Sitzungen werden geladen…</div>}
              {!loading && visibleHistory.length === 0 && <div className="results-empty"><BarChart3 size={25} /><strong>Noch keine Sitzungen</strong><span>Starten Sie eine Präsentation, um Ergebnisse zu sammeln.</span></div>}
              {visibleHistory.map((item) => (
                <article className={["session-history-card", selectedIds.has(item.id) ? "selected" : "", item.status === "LIVE" ? "has-live-action" : ""].filter(Boolean).join(" ")} key={item.id} aria-selected={selectedIds.has(item.id)} onContextMenu={(event) => openSessionContextMenu(event, item)}>
                  <div className="session-history-card-select" role="button" tabIndex={0} onClick={(event) => selectSession(item.id, { shiftKey: event.shiftKey, additive: event.ctrlKey || event.metaKey })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectSession(item.id); } }}>
                    <div><span className={item.status === "LIVE" ? "session-state live" : "session-state"}>{item.status === "LIVE" ? "LIVE" : "BEENDET"}</span><small>{formatDate(item.startedAt)}</small></div>
                    <strong>{item.presentation.title}</strong>
                    <p>Raum {item.roomCode.slice(0, 3)} {item.roomCode.slice(3)}</p>
                    <footer><span><Users size={14} /> {item.participantCount}</span><span><CheckCircle2 size={14} /> {item.answerCount}</span><span><Clock3 size={14} /> {formatDuration(item.startedAt, item.endedAt)}</span>{item.status !== "LIVE" && <ChevronRight size={16} />}</footer>
                  </div>
                  {item.status === "LIVE" && <button className="session-history-end" disabled={endingIds.has(item.id)} onClick={() => requestEndLiveSession(item.id, item.roomCode, item.presentation.title)}><X size={12} /> {endingIds.has(item.id) ? "Wird beendet…" : "Beenden"}</button>}
                </article>
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
                    {results.status === "LIVE" && <button className="results-end-live" disabled={endingIds.has(results.sessionId)} onClick={() => requestEndLiveSession(results.sessionId, results.roomCode, results.presentation.title)}><X size={16} /> {endingIds.has(results.sessionId) ? "Wird beendet…" : "Beenden"}</button>}
                    <button onClick={() => exportCsv(results)}><Download size={16} /> CSV exportieren</button>
                  </div>
                </header>
                <div className="session-kpis">
                  <article><span>Teilnehmende</span><strong>{results.participantCount}</strong></article>
                  <article><span>Antworten</span><strong>{results.answerCount}</strong></article>
                  <article><span>Interaktionen</span><strong>{results.questions.length + (results.groupDiscussions?.length ?? 0)}</strong></article>
                  <article><span>Status</span><strong className={results.status === "LIVE" ? "live-text" : ""}>{results.status === "LIVE" ? "Laufend" : "Beendet"}</strong></article>
                </div>
                <div className="question-results">
                  {results.questions.length === 0 && (results.groupDiscussions?.length ?? 0) === 0 && <div className="results-empty"><strong>Keine Interaktionen</strong><span>Diese Präsentation enthält noch keine auswertbaren Fragen.</span></div>}
                  {(results.groupDiscussions ?? []).map((discussion, discussionIndex) => <article className="question-result-card group-discussion-result" key={discussion.nodeId}><div className="question-result-heading"><span>{discussionIndex + 1}</span><div><small>GRUPPENDISKUSSION</small><h3>{discussion.question}</h3></div><strong>{discussion.groups.length} Gruppen</strong></div><div className="group-discussion-result-list">{discussion.groups.map((group) => <section key={group.id}><div><UsersRound size={18} /><strong>{group.name}</strong><span>{group.memberCount} Mitglieder</span></div><p>{group.result || "Kein Ergebnis eingereicht."}</p></section>)}</div></article>)}
                  {results.questions.map((question, questionIndex) => {
                    const isRating = question.type === "RATING";
                    const isMultiScale = isRating && Boolean(question.scaleStatements?.length);
                    const isPriority = question.type === "PRIORITY_VOTE";
                    const isQuiz = question.assessmentMode === "QUIZ";
                    const average = averageRating(question.options, question.counts, question.total);
                    const correctRate = question.total ? Math.round(((question.correctCount ?? 0) / question.total) * 100) : 0;
                    return <article className="question-result-card" key={question.nodeId}>
                      <div className="question-result-heading"><span>{questionIndex + 1}</span><div><small>{isPriority ? "PRIORISIERUNG" : isMultiScale ? "BEWERTUNGSSKALEN" : isRating ? "SKALA" : isQuiz ? "SINGLE CHOICE QUIZ" : "SINGLE CHOICE"}</small><h3>{question.question}</h3></div><strong>{isMultiScale ? `${question.total} Teilnehmende` : isRating ? `Ø ${average.toFixed(1)}` : isQuiz ? `${correctRate}% richtig` : isPriority ? `${question.total} Abstimmende` : `${question.total} Antworten`}</strong></div>
                      {isRating && !isMultiScale && <div className="result-single-scale"><div className="result-rating-summary"><strong>{average.toFixed(1)}</strong><span>Durchschnitt aus {question.total} Bewertungen</span><small>{question.minLabel} · {question.min}–{question.max} · {question.maxLabel}</small></div><RatingScaleRail min={Number(question.options[0] ?? question.min ?? 1)} max={Number(question.options.at(-1) ?? question.max ?? 5)} minLabel={question.minLabel} maxLabel={question.maxLabel} value={question.total ? average : null} valuePrefix="Ø " counts={question.counts} compact /></div>}
                      {isMultiScale && <div className="result-multi-scale-list">{question.scaleStatements?.map((statement, index) => { const min = Number(question.options[0] ?? question.min ?? 1); const max = Number(question.options.at(-1) ?? question.max ?? 5); const position = statement.average === null || max === min ? null : (statement.average - min) / (max - min) * 100; return <section key={index}><div><strong>{statement.text}</strong><span>{statement.total} Bewertungen</span></div><div><RatingDistribution counts={statement.counts} /><i />{position !== null && <b style={{ left: `${position}%` }}>{statement.average?.toFixed(1)}</b>}</div><footer><span>{question.minLabel}</span><span>{question.maxLabel}</span></footer></section>; })}</div>}
                      {isQuiz && <div className="result-quiz-summary"><CheckCircle2 size={22} /><div><strong>{question.correctCount ?? 0} von {question.total} richtig</strong><span>Richtige Antwort: {question.options[question.correctOptionIndex ?? 0]}</span></div><b>{correctRate}%</b></div>}
                      {!isMultiScale && !isRating && <div className="question-result-bars">
                        {question.options.map((option, index) => {
                          const count = question.counts[index] ?? 0;
                          const percentage = question.total ? Math.round((count / question.total) * 100) : 0;
                          return <div className={isQuiz && question.correctOptionIndex === index ? "correct" : ""} key={`${index}-${option}`}><span>{isRating ? option : isPriority ? index + 1 : String.fromCharCode(65 + index)}</span><section><div><strong>{isRating ? `${option} Punkte` : option}{isQuiz && question.correctOptionIndex === index && <CheckCircle2 size={14} />}</strong>{isPriority && question.optionGroups?.[index] && <em>{question.optionGroups[index]}</em>}<small>{count} · {percentage}%{isPriority ? " Auswahlrate" : ""}</small></div><i><b style={{ width: `${percentage}%` }} /></i></section></div>;
                        })}
                      </div>}
                    </article>;
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      {contextMenu && <div className="session-context-layer" role="presentation" onMouseDown={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}><div className="session-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>{contextItems.length > 1 && <header>{contextItems.length} Sitzungen ausgewählt</header>}{contextLiveItems.length > 0 && <button role="menuitem" onClick={requestEndContextSessions}><Radio size={15} /><span>{contextLiveItems.length > 1 ? `${contextLiveItems.length} Präsentationen beenden` : "Präsentation beenden"}</span></button>}<button className="danger" role="menuitem" onClick={() => requestDeleteSessions(contextItems)}><Trash2 size={15} /><span>{contextItems.length > 1 ? `${contextItems.length} Sitzungen löschen` : "Sitzung löschen"}</span></button></div></div>}
      {endTargets.length > 0 && <EndSessionDialog title={endTargets[0]?.title ?? ""} roomCode={endTargets[0]?.roomCode ?? ""} sessionCount={endTargets.length} busy={endingIds.size > 0} error={endError} onCancel={() => { setEndTargets([]); setEndError(""); }} onConfirm={() => void endLiveSessions()} />}
      {deleteTargets.length > 0 && <EndSessionDialog action="delete" title={deleteTargets[0]?.title ?? ""} roomCode={deleteTargets[0]?.roomCode ?? ""} sessionCount={deleteTargets.length} busy={deletingIds.size > 0} error={deleteError} onCancel={() => { setDeleteTargets([]); setDeleteError(""); }} onConfirm={() => void deleteSessions()} />}
    </div>
  );
}
