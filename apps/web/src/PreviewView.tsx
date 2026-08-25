import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Eye,
  EyeOff,
  FileText,
  Fullscreen,
  Lock,
  MessageCircleMore,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  RotateCcw,
  Smartphone,
  X,
} from "lucide-react";
import { api, type PresentationDetails, type PresentationNode } from "./api";
import { PdfPageCanvas } from "./PdfPage";

type InteractionStatus = "NOT_OPEN" | "ACCEPTING" | "LOCKED";

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

function ResultBars({ options, counts, compact = false, rating = false }: { options: string[]; counts: number[]; compact?: boolean; rating?: boolean }) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return (
    <div className={compact ? "preview-results compact" : "preview-results"}>
      {options.map((option, index) => {
        const count = counts[index] ?? 0;
        const percentage = total ? Math.round((count / total) * 100) : 0;
        return (
          <div className="preview-result-row" key={`${index}-${option}`}>
            {!compact && <span className="preview-result-letter">{rating ? option : String.fromCharCode(65 + index)}</span>}
            <div className="preview-result-data">
              <div><strong>{option}</strong><span>{compact ? `${percentage}%` : `${count} Stimmen · ${percentage}%`}</span></div>
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
}) {
  const isPdf = node?.type === "PDF_PAGE";
  const isRating = node?.type === "RATING";
  const options = node?.config.options ?? [];

  return (
    <div className="preview-phone-device">
      <div className="phone-speaker" />
      <div className="preview-phone-screen">
        <header className="preview-phone-header">
          <span><MessageCircleMore size={16} /> MitRede</span>
          <small><i /> VORSCHAU</small>
        </header>
        <main className="preview-phone-content">
          {isPdf ? (
            <div className="preview-phone-wait">
              <FileText size={34} />
              <span>PRÄSENTATION LÄUFT</span>
              <h2>Folgen Sie der Präsentation auf der Leinwand.</h2>
              <p>Die nächste Interaktion erscheint automatisch hier.</p>
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
              {resultsVisible && <ResultBars options={options} counts={counts} compact rating={isRating} />}
            </div>
          ) : submittedOption !== null ? (
            <div className="preview-phone-response">
              <div className="preview-answer-check"><Check size={24} /></div>
              <span>ANTWORT GESENDET</span>
              <h2>Vielen Dank!</h2>
              <p>Ihre Auswahl: <strong>{options[submittedOption]}</strong></p>
              {status === "ACCEPTING" && <button className="preview-phone-link" onClick={onReset}><RotateCcw size={14} /> Antwort ändern</button>}
              {resultsVisible && <ResultBars options={options} counts={counts} compact rating={isRating} />}
            </div>
          ) : (
            <div className="preview-phone-poll">
              <span>{isRating ? "LIVE-SKALA" : "LIVE-UMFRAGE"}</span>
              <h2>{node?.config.question ?? "Neue Frage"}</h2>
              <p>{isRating ? "Wählen Sie eine Bewertung" : "Eine Antwort auswählen"}</p>
              <div className={isRating ? "preview-phone-options rating" : "preview-phone-options"}>
                {options.map((option, index) => (
                  <button className={selectedOption === index ? "selected" : ""} key={`${index}-${option}`} onClick={() => onSelect(index)}>
                    <span>{isRating ? option : String.fromCharCode(65 + index)}</span>{!isRating && <strong>{option}</strong>}{selectedOption === index && <Check size={16} />}
                  </button>
                ))}
              </div>
              {isRating && <div className="preview-phone-rating-labels"><span>{node?.config.minLabel}</span><span>{node?.config.maxLabel}</span></div>}
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
  const [error, setError] = useState("");
  const projectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.presentation(presentationId).then((next) => {
      setPresentation(next);
      const requestedIndex = requestedNodeId ? next.nodes.findIndex((node) => node.id === requestedNodeId) : -1;
      setCurrentIndex(requestedIndex >= 0 ? requestedIndex : 0);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Vorschau konnte nicht geladen werden"));
  }, [presentationId, requestedNodeId]);

  const currentNode = presentation?.nodes[currentIndex] ?? null;
  const options = currentNode?.config.options ?? [];
  const isPdf = currentNode?.type === "PDF_PAGE";
  const isRating = currentNode?.type === "RATING";
  const total = counts.reduce((sum, count) => sum + count, 0);
  const ratingAverage = total ? options.reduce((sum, option, index) => sum + Number(option) * (counts[index] ?? 0), 0) / total : 0;

  useEffect(() => {
    setStatus("NOT_OPEN");
    setResultsVisible(currentNode?.config.resultDisplayMode === "LIVE");
    setSelectedOption(null);
    setSubmittedOption(null);
    setCounts(seedCounts(options.length));
    if (currentNode) {
      window.history.replaceState({}, "", `/preview/${presentationId}?node=${encodeURIComponent(currentNode.id)}`);
    }
  }, [currentNode?.id, options.length, presentationId]);

  const move = useCallback((offset: number) => {
    if (!presentation) return;
    setCurrentIndex((index) => Math.max(0, Math.min(presentation.nodes.length - 1, index + offset)));
  }, [presentation]);

  const exitPreview = useCallback(() => {
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
          <div className="preview-column-heading"><span>PROJEKTIONSANSICHT</span><small>{isPdf ? `PDF · Seite ${currentNode?.sourcePageNumber}` : status === "ACCEPTING" ? "Antworten offen" : status === "LOCKED" ? "Antworten gesperrt" : "Noch nicht geöffnet"}</small></div>
          <div className="preview-projector" ref={projectorRef}>
            {isPdf && currentNode?.config.objectKey && currentNode.config.pageNumber ? (
              <div className="preview-projector-pdf"><PdfPageCanvas objectKey={currentNode.config.objectKey} pageNumber={currentNode.config.pageNumber} /></div>
            ) : (
              <div className="preview-projector-poll">
                <p className="stage-kicker">{isRating ? "LIVE-SKALA" : "LIVE-UMFRAGE"}</p>
                <h1>{currentNode?.config.question ?? "Neue Frage"}</h1>
                <p>{isRating ? "Wählen Sie eine Bewertung" : "Eine Antwort auswählen"}</p>
                {resultsVisible && isRating && <div className="preview-rating-average"><strong>{ratingAverage.toFixed(1)}</strong><span>Durchschnitt</span></div>}
                {resultsVisible ? <ResultBars options={options} counts={counts} rating={isRating} /> : (
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
              {isPdf ? <span className="preview-pdf-label"><FileText size={17} /> Präsentationsseite</span> : (
                <>
                  <button className={status === "ACCEPTING" ? "active" : ""} onClick={() => setStatus(status === "ACCEPTING" ? "LOCKED" : "ACCEPTING")}>{status === "ACCEPTING" ? <Radio size={17} /> : <Lock size={17} />}{status === "ACCEPTING" ? "Antworten offen" : status === "LOCKED" ? "Erneut öffnen" : "Abstimmung öffnen"}</button>
                  <button className={resultsVisible ? "active" : ""} onClick={() => setResultsVisible((visible) => !visible)}>{resultsVisible ? <Eye size={17} /> : <EyeOff size={17} />}{resultsVisible ? "Ergebnisse sichtbar" : "Ergebnisse zeigen"}</button>
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
            <PhonePreview node={currentNode} status={status} resultsVisible={resultsVisible} counts={counts} selectedOption={selectedOption} submittedOption={submittedOption} onSelect={setSelectedOption} onSubmit={submitAnswer} onReset={resetAnswer} />
          </aside>
        )}
      </main>
    </div>
  );
}
