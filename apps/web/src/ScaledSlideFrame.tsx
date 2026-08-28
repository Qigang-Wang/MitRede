import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode, type RefObject } from "react";

export const SLIDE_WIDTH = 1600;
export const SLIDE_HEIGHT = 900;

export function ScaledSlideFrame({ children, className = "", surfaceClassName = "", backgroundColor, style, surfaceRef, onMouseDown, onScaleChange }: {
  children: ReactNode;
  className?: string;
  surfaceClassName?: string;
  backgroundColor: string;
  style?: CSSProperties;
  surfaceRef?: RefObject<HTMLDivElement | null>;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  onScaleChange?: (scale: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const fallbackSurfaceRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ scale: 0, left: 0, top: 0 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const updateScale = () => {
      const nextScale = Math.min(frame.clientWidth / SLIDE_WIDTH, frame.clientHeight / SLIDE_HEIGHT);
      const safeScale = Number.isFinite(nextScale) ? nextScale : 0;
      setGeometry({
        scale: safeScale,
        left: (frame.clientWidth - SLIDE_WIDTH * safeScale) / 2,
        top: (frame.clientHeight - SLIDE_HEIGHT * safeScale) / 2,
      });
      onScaleChange?.(safeScale);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [onScaleChange]);

  return (
    <div ref={frameRef} className={`scaled-slide-frame ${className}`} style={{ ...style, backgroundColor }} onMouseDown={onMouseDown}>
      <div
        ref={surfaceRef ?? fallbackSurfaceRef}
        className={`scaled-slide-surface ${surfaceClassName}`}
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          left: geometry.left,
          top: geometry.top,
          backgroundColor,
          transform: `scale(${geometry.scale})`,
          visibility: geometry.scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
