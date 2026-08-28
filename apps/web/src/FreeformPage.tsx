import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import Moveable from "react-moveable";
import { Image as ImageIcon, Type } from "lucide-react";
import { imageAssetUrl, type FreeformElement, type PollConfig } from "./api";
import { ScaledSlideFrame, SLIDE_HEIGHT, SLIDE_WIDTH } from "./ScaledSlideFrame";

export const FREEFORM_WIDTH = SLIDE_WIDTH;
export const FREEFORM_HEIGHT = SLIDE_HEIGHT;

function elementStyle(element: FreeformElement): CSSProperties {
  return {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
  };
}

function FreeformElementView({ element, editable, selected, editing, onSelect, onStartEdit, onTextCommit }: {
  element: FreeformElement;
  editable: boolean;
  selected?: boolean;
  editing?: boolean;
  onSelect?: (id: string) => void;
  onStartEdit?: (id: string) => void;
  onTextCommit?: (id: string, text: string) => void;
}) {
  const textLines = element.type === "TEXT" ? element.text.split("\n") : [];
  const textContent = element.type === "TEXT" && element.listStyle === "bullet"
    ? <ul>{textLines.map((line, index) => <li key={index}>{line || <br />}</li>)}</ul>
    : element.type === "TEXT" && element.listStyle === "number"
      ? <ol>{textLines.map((line, index) => <li key={index}>{line || <br />}</li>)}</ol>
      : element.type === "TEXT" ? element.text || "Text" : null;
  return (
    <div
      className={["freeform-element", element.type === "TEXT" ? "text" : "image", selected ? "selected" : ""].filter(Boolean).join(" ")}
      data-freeform-id={element.id}
      style={elementStyle(element)}
      onMouseDown={editable ? (event) => { event.stopPropagation(); onSelect?.(element.id); } : undefined}
      onDoubleClick={editable && element.type === "TEXT" ? (event) => { event.stopPropagation(); onStartEdit?.(element.id); } : undefined}
    >
      {element.type === "TEXT" ? (
        <div
          contentEditable={editable && editing}
          suppressContentEditableWarning
          onMouseDown={editing ? (event) => event.stopPropagation() : undefined}
          onBlur={(event) => onTextCommit?.(element.id, event.currentTarget.innerText)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          ref={(node) => {
            if (node && editing && document.activeElement !== node) {
              node.focus();
              const selection = window.getSelection();
              selection?.selectAllChildren(node);
              selection?.collapseToEnd();
            }
          }}
          style={{ fontSize: element.fontSize, color: element.color, fontWeight: element.fontWeight, fontStyle: element.fontStyle, textAlign: element.textAlign }}
        >
          {textContent}
        </div>
      ) : (
        <img src={imageAssetUrl(element.objectKey)} alt="" draggable={false} style={{ objectFit: element.objectFit }} />
      )}
    </div>
  );
}

export function FreeformPageRenderer({ config, className = "", style }: { config: PollConfig; className?: string; style?: CSSProperties }) {
  const elements = config.elements ?? [];
  const backgroundColor = config.backgroundColor ?? "#fffaf1";
  return (
    <ScaledSlideFrame className={`freeform-page ${className}`} surfaceClassName="freeform-page-surface" backgroundColor={backgroundColor} style={style}>
      {elements.map((element) => <FreeformElementView element={element} editable={false} key={element.id} />)}
    </ScaledSlideFrame>
  );
}

export function FreeformPageEditor({ backgroundColor, elements, selectedId, onSelect, onChange, onAddText, onDelete, style }: {
  backgroundColor: string;
  elements: FreeformElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (elements: FreeformElement[]) => void;
  onAddText: () => void;
  onDelete: () => void;
  style?: CSSProperties;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(0);

  useEffect(() => {
    setTarget(selectedId ? surfaceRef.current?.querySelector<HTMLElement>(`[data-freeform-id="${CSS.escape(selectedId)}"]`) ?? null : null);
  }, [elements, selectedId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => moveableRef.current?.updateRect());
    return () => window.cancelAnimationFrame(frame);
  }, [canvasScale, elements, target]);

  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (!selectedId || editingId || (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable='true']"))) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      onDelete();
    };
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [editingId, onDelete, selectedId]);

  function commitTarget(element: HTMLElement | SVGElement) {
    const page = surfaceRef.current;
    if (!page || !selectedId) return;
    const pageRect = page.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const width = Math.min(FREEFORM_WIDTH, Math.max(20, elementRect.width / pageRect.width * FREEFORM_WIDTH));
    const height = Math.min(FREEFORM_HEIGHT, Math.max(20, elementRect.height / pageRect.height * FREEFORM_HEIGHT));
    const x = Math.min(FREEFORM_WIDTH - width, Math.max(0, (elementRect.left - pageRect.left) / pageRect.width * FREEFORM_WIDTH));
    const y = Math.min(FREEFORM_HEIGHT - height, Math.max(0, (elementRect.top - pageRect.top) / pageRect.height * FREEFORM_HEIGHT));
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.transform = "";
    onChange(elements.map((item) => item.id === selectedId ? { ...item, x, y, width, height } : item));
  }

  function deselect(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement) || !event.target.closest(".freeform-element")) {
      setEditingId(null);
      onSelect(null);
    }
  }

  function commitText(id: string, text: string) {
    setEditingId(null);
    onChange(elements.map((element) => element.id === id && element.type === "TEXT" ? { ...element, text } : element));
  }

  return (
    <ScaledSlideFrame className="freeform-page freeform-editor" surfaceClassName="freeform-page-surface" backgroundColor={backgroundColor} style={style} surfaceRef={surfaceRef} onMouseDown={deselect} onScaleChange={setCanvasScale}>
      {elements.length === 0 && <div className="freeform-empty"><button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={onAddText}><Type size={26} /><strong>Textfeld hinzufügen</strong><span>Danach frei ziehen und skalieren</span></button><div><ImageIcon size={28} /><span>Oder über „Bild“ ein Bild hochladen</span></div></div>}
      {elements.map((element) => <FreeformElementView element={element} editable selected={element.id === selectedId} editing={element.id === editingId} onSelect={(id) => { setEditingId(null); onSelect(id); }} onStartEdit={setEditingId} onTextCommit={commitText} key={element.id} />)}
      {target && <Moveable
          ref={moveableRef}
          target={target}
          draggable={!editingId}
          resizable={!editingId}
          useAccuratePosition
          useResizeObserver
          useMutationObserver
          keepRatio={elements.find((element) => element.id === selectedId)?.type === "IMAGE"}
          edge={false}
          throttleDrag={0}
          throttleResize={0}
          onDrag={({ target: moved, transform }) => { moved.style.transform = transform; }}
          onDragEnd={({ target: moved }) => commitTarget(moved)}
          onResize={({ target: resized, width, height, drag }) => {
            resized.style.width = `${width}px`;
            resized.style.height = `${height}px`;
            resized.style.transform = drag.transform;
          }}
          onResizeEnd={({ target: resized }) => commitTarget(resized)}
      />}
    </ScaledSlideFrame>
  );
}
