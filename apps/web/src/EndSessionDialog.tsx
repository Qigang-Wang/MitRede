import { useEffect } from "react";
import { Radio, Trash2, X } from "lucide-react";

type EndSessionDialogProps = {
  title: string;
  roomCode: string;
  sessionCount?: number;
  action?: "end" | "delete";
  subject?: "session" | "presentation";
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function EndSessionDialog({ title, roomCode, sessionCount = 1, action = "end", subject = "session", busy = false, error = "", onCancel, onConfirm }: EndSessionDialogProps) {
  const deleting = action === "delete";
  const deletingPresentation = deleting && subject === "presentation";
  const eyebrow = deletingPresentation ? "PRÄSENTATION LÖSCHEN" : deleting ? sessionCount > 1 ? "SITZUNGEN LÖSCHEN" : "SITZUNG LÖSCHEN" : sessionCount > 1 ? "LIVE-SITZUNGEN" : "LIVE-SITZUNG";
  const heading = deletingPresentation ? "Präsentation löschen?" : deleting ? sessionCount > 1 ? `${sessionCount} Sitzungen löschen?` : "Sitzung löschen?" : sessionCount > 1 ? `${sessionCount} Präsentationen beenden?` : "Präsentation beenden?";
  const copy = deletingPresentation ? "Die Präsentation, alle Seiten, zugehörigen Sitzungen und sämtliche Ergebnisse werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden." : deleting ? "Die Sitzungen, Teilnehmenden und sämtliche Ergebnisse werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden." : "Teilnehmende können danach keine weiteren Antworten senden. Alle bisherigen Ergebnisse bleiben gespeichert.";
  const confirmLabel = deletingPresentation ? "Präsentation löschen" : deleting ? sessionCount > 1 ? `${sessionCount} Sitzungen löschen` : "Sitzung löschen" : sessionCount > 1 ? `${sessionCount} Sitzungen beenden` : "Präsentation beenden";
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop end-session-backdrop" role="presentation" onMouseDown={() => { if (!busy) onCancel(); }}>
      <section className={["end-session-dialog", deleting ? "is-delete" : ""].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby="end-session-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="end-session-close" aria-label="Dialog schließen" disabled={busy} onClick={onCancel}><X size={18} /></button>
        <span className="end-session-icon">{deleting ? <Trash2 size={24} /> : <Radio size={24} />}</span>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="end-session-title">{heading}</h2>
        <p className="end-session-copy">{copy}</p>
        {deletingPresentation ? <div className="end-session-summary"><span><small>PRÄSENTATION</small><strong>{title}</strong></span></div> : sessionCount > 1 ? <div className="end-session-summary"><span><small>AUSWAHL</small><strong>{sessionCount} laufende Sitzungen</strong></span></div> : <div className="end-session-summary"><span><small>PRÄSENTATION</small><strong>{title}</strong></span><span><small>RAUM</small><strong>{roomCode.slice(0, 3)} {roomCode.slice(3)}</strong></span></div>}
        {error && <p className="end-session-error">{error}</p>}
        <div className="end-session-actions">
          <button autoFocus className="end-session-cancel" disabled={busy} onClick={onCancel}>Abbrechen</button>
          <button className="end-session-confirm" disabled={busy} onClick={onConfirm}>{busy ? deleting ? "Wird gelöscht…" : "Wird beendet…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
