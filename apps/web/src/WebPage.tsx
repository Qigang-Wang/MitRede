import type { CSSProperties, MouseEvent } from "react";
import { ExternalLink, Globe2, LockKeyhole } from "lucide-react";
import { ScaledSlideFrame } from "./ScaledSlideFrame";

function webHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isValidWebPageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function WebPage({ title, url, interactive = true, className = "", style }: {
  title?: string;
  url?: string;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const safeUrl = url && isValidWebPageUrl(url) ? url : "https://example.com";
  const stopSlideNavigation = (event: MouseEvent) => event.stopPropagation();
  return (
    <ScaledSlideFrame className={`web-page ${className}`} surfaceClassName="web-page-surface" backgroundColor="#e8ebec" style={style}>
      <header className="web-page-toolbar">
        <div className="web-page-title"><Globe2 size={26} /><span><strong>{title || "Neue Webseite"}</strong><small>{webHost(safeUrl)}</small></span></div>
        <div className="web-page-address"><LockKeyhole size={16} /><span>{safeUrl}</span></div>
        <a href={safeUrl} target="_blank" rel="noreferrer" onMouseDown={stopSlideNavigation} onClick={stopSlideNavigation} aria-label="Webseite in neuem Tab öffnen"><ExternalLink size={21} /><span>Extern öffnen</span></a>
      </header>
      <div className="web-page-viewport">
        <iframe
          src={safeUrl}
          title={title || "Eingebettete Webseite"}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox={interactive ? undefined : "allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts"}
          allow={interactive ? "autoplay; camera; clipboard-read; clipboard-write; display-capture; encrypted-media; fullscreen; geolocation; microphone; payment; picture-in-picture; web-share" : undefined}
          allowFullScreen={interactive}
        />
        {!interactive && <div className="web-page-interaction-guard" aria-hidden="true" />}
      </div>
      <footer><span>Falls die Webseite das Einbetten blockiert, öffnen Sie sie über „Extern öffnen“.</span><strong>{interactive ? "Interaktiv" : "Nur Vorschau"}</strong></footer>
    </ScaledSlideFrame>
  );
}
