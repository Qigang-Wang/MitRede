import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
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

export function PdfPageCanvas({
  objectKey,
  pageNumber,
  compact = false,
}: {
  objectKey: string;
  pageNumber: number;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = pdfAssetUrl(objectKey);
    void loadDocument(url)
      .then((document) => document.getPage(pageNumber))
      .then(async (page) => {
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const cssWidth = compact ? 148 : Math.min(900, window.innerWidth * 0.58);
        const scale = cssWidth / base.width;
        const viewport = page.getViewport({ scale: scale * Math.min(window.devicePixelRatio, 2) });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [compact, objectKey, pageNumber]);

  if (failed) return <div className={compact ? "pdf-fallback compact" : "pdf-fallback"}>PDF-Vorschau nicht verfügbar</div>;
  return <canvas className={compact ? "pdf-canvas compact" : "pdf-canvas"} ref={canvasRef} aria-label={`PDF-Seite ${pageNumber}`} />;
}
