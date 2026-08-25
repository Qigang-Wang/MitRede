import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pdfAssetUrl } from "./api";

const documents = new Map<string, Promise<PDFDocumentProxy>>();

function loadDocument(url: string) {
  const existing = documents.get(url);
  if (existing) return existing;
  const loading = import("pdfjs-dist").then(({ GlobalWorkerOptions, getDocument }) => {
    GlobalWorkerOptions.workerSrc = workerUrl;
    return getDocument(url).promise;
  });
  documents.set(url, loading);
  return loading;
}

export function usePdfPageAspectRatio(objectKey?: string, pageNumber?: number) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  useEffect(() => {
    if (!objectKey || !pageNumber) return;
    let cancelled = false;
    void loadDocument(pdfAssetUrl(objectKey))
      .then((document) => document.getPage(pageNumber))
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        if (viewport.width > 0 && viewport.height > 0) setAspectRatio(viewport.width / viewport.height);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [objectKey, pageNumber]);

  return aspectRatio;
}

export function PdfPageCanvas({
  objectKey,
  pageNumber,
  compact = false,
  fitContainer = false,
}: {
  objectKey: string;
  pageNumber: number;
  compact?: boolean;
  fitContainer?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!fitContainer || !canvasRef.current?.parentElement) return;
    const container = canvasRef.current.parentElement;
    let animationFrame = 0;
    const updateSize = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const next = { width: container.clientWidth, height: container.clientHeight };
        setContainerSize((current) => current && current.width === next.width && current.height === next.height ? current : next);
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    document.addEventListener("fullscreenchange", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
      document.removeEventListener("fullscreenchange", updateSize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [fitContainer]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    setFailed(false);
    const url = pdfAssetUrl(objectKey);
    void loadDocument(url)
      .then((document) => document.getPage(pageNumber))
      .then(async (page) => {
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const scale = fitContainer && containerSize
          ? Math.min(containerSize.width / base.width, containerSize.height / base.height)
          : (compact ? 148 : Math.min(900, window.innerWidth * 0.58)) / base.width;
        if (!Number.isFinite(scale) || scale <= 0) return;
        const cssViewport = page.getViewport({ scale });
        const viewport = page.getViewport({ scale: scale * Math.min(window.devicePixelRatio, 2) });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        canvas.style.aspectRatio = `${cssViewport.width} / ${cssViewport.height}`;
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [compact, containerSize, fitContainer, objectKey, pageNumber]);

  if (failed) return <div className={compact ? "pdf-fallback compact" : "pdf-fallback"}>PDF-Vorschau nicht verfügbar</div>;
  return <canvas className={compact ? "pdf-canvas compact" : "pdf-canvas"} ref={canvasRef} aria-label={`PDF-Seite ${pageNumber}`} />;
}
