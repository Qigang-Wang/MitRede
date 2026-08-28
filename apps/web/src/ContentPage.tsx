import type { CSSProperties } from "react";
import { ScaledSlideFrame } from "./ScaledSlideFrame";

export function ContentPage({ title, body, className = "", style }: {
  title?: string;
  body?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <ScaledSlideFrame className={`content-page ${className}`} surfaceClassName="content-page-surface" backgroundColor="#fffaf1" style={style}>
      <h1>{title || "Neue Informationsseite"}</h1>
      <p>{body || "Ergänzen Sie hier Ihre Inhalte."}</p>
    </ScaledSlideFrame>
  );
}
