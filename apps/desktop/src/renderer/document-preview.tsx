import { createIdGenerator } from '@auralide/core';
import type { Element, Presentation, Slide } from '@auralide/core';
import { useEffect, useRef, useState } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

const ids = createIdGenerator();

type DragState = {
  elementId: string;
  slideId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

const description = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const firstText = (slide: Slide | undefined): string =>
  slide?.elements.find((item) => item.kind === 'text')?.id ?? '';

const elementLabel = (element: Element): string =>
  element.name ??
  (element.kind === 'text'
    ? element.text.slice(0, 32) || 'Empty text'
    : element.kind === 'shape'
      ? element.shape
      : 'Image (asset preview pending)');

/**
 * V0.1 editor shell. The renderer only owns selection and draft UI state.
 * Every persistent edit goes to main's existing Core Dispatcher.
 */
export function DocumentPreview(): JSX.Element {
  const [document, setDocument] = useState<Presentation | null>(null);
  const [slideId, setSlideId] = useState('');
  const [elementId, setElementId] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('Loading document…');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<DragState | null>(null);

  const slide = document?.slides.find((item) => item.id === slideId) ?? document?.slides[0];
  const selected = slide?.elements.find((item) => item.id === elementId);
  const textElement = selected?.kind === 'text' ? selected : undefined;

  const adopt = (value: Presentation, nextSlide?: string, nextElement?: string): void => {
    setDocument(value);
    const currentSlide =
      value.slides.find((item) => item.id === (nextSlide ?? slideId)) ?? value.slides[0];
    const currentElement =
      currentSlide?.elements.find((item) => item.id === (nextElement ?? elementId)) ??
      currentSlide?.elements.find((item) => item.kind === 'text') ??
      currentSlide?.elements[0];
    setSlideId(currentSlide?.id ?? '');
    setElementId(currentElement?.id ?? '');
    setText(currentElement?.kind === 'text' ? currentElement.text : '');
  };

  useEffect(() => {
    let cancelled = false;
    const bridge = window.auralide;
    if (bridge === undefined) {
      setMessage('The desktop bridge is unavailable.');
      return;
    }
    setBusy(true);
    void bridge.getDocument().then(
      (value) => {
        if (cancelled) return;
        const initialSlide = value.slides[0];
        const initialElement =
          initialSlide?.elements.find((item) => item.kind === 'text') ?? initialSlide?.elements[0];
        setDocument(value);
        setSlideId(initialSlide?.id ?? '');
        setElementId(initialElement?.id ?? '');
        setText(initialElement?.kind === 'text' ? initialElement.text : '');
        setMessage('Ready · Core-backed editing · local snapshot storage');
        setBusy(false);
      },
      (error: unknown) => {
        if (!cancelled) {
          setMessage(description(error));
          setBusy(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const selectSlide = (item: Slide): void => {
    setSlideId(item.id);
    const nextId = firstText(item) || item.elements[0]?.id || '';
    setElementId(nextId);
    const next = item.elements.find((element) => element.id === nextId);
    setText(next?.kind === 'text' ? next.text : '');
  };

  const selectElement = (item: Element): void => {
    setElementId(item.id);
    setText(item.kind === 'text' ? item.text : '');
  };

  const apply = async (
    operation: string,
    target: Record<string, string>,
    payload: unknown,
    nextSlide?: string,
    nextElement?: string,
  ): Promise<boolean> => {
    if (document === null || busy || window.auralide === undefined) return false;
    setBusy(true);
    try {
      const result = await window.auralide.applyCommand({
        operation,
        target,
        payload,
        expectedRevision: document.revision,
        origin: { kind: 'human' },
      });
      if (!result.ok) {
        setMessage('Edit refused: ' + result.error.code + '. Reload the document before retrying.');
        return false;
      }
      adopt(result.value, nextSlide, nextElement);
      setMessage(
        operation === 'element.updateText'
          ? 'Text updated through Core.'
          : 'Applied ' + operation + ' · revision ' + result.value.revision,
      );
      return true;
    } catch (error: unknown) {
      setMessage('Edit failed: ' + description(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateText = async (): Promise<void> => {
    if (slide === undefined || textElement === undefined) return;
    await apply(
      'element.updateText',
      { kind: 'element', slideId: slide.id, elementId: textElement.id },
      { text },
    );
  };

  const addSlide = async (): Promise<void> => {
    if (document === null) return;
    const id = ids.slideId();
    await apply(
      'slide.create',
      { kind: 'presentation' },
      {
        id,
        name: 'Slide ' + (document.slides.length + 1),
        backgroundColor: '#ffffff',
      },
      id,
      '',
    );
  };

  const deleteSlide = async (): Promise<void> => {
    if (slide === undefined || document === null || document.slides.length <= 1) return;
    if (!window.confirm('Delete this slide? This change cannot be undone in this demo UI.')) return;
    const next = document.slides.find((item) => item.id !== slide.id);
    await apply('slide.remove', { kind: 'slide', slideId: slide.id }, {}, next?.id, '');
  };

  const addElement = async (kind: 'text' | 'rectangle' | 'ellipse'): Promise<void> => {
    if (slide === undefined || document === null) return;
    const id = ids.elementId();
    const count = slide.elements.length;
    const geometry = {
      x: 100 + (count % 5) * 35,
      y: 130 + (count % 4) * 35,
      width: kind === 'text' ? 650 : 240,
      height: kind === 'text' ? 100 : 150,
    };
    const element =
      kind === 'text'
        ? {
            id,
            kind: 'text',
            name: 'Text',
            text: 'Double-click the text field to edit',
            geometry,
            style: { fontSize: 40, color: '#172033', fontWeight: 500 },
          }
        : {
            id,
            kind: 'shape',
            name: kind === 'ellipse' ? 'Ellipse' : 'Rectangle',
            shape: kind,
            geometry,
            fill: '#4677e8',
          };
    await apply('element.add', { kind: 'slide', slideId: slide.id }, { element }, slide.id, id);
  };

  const removeElement = async (): Promise<void> => {
    if (selected === undefined || slide === undefined) return;
    await apply(
      'element.remove',
      {
        kind: 'element',
        slideId: slide.id,
        elementId: selected.id,
      },
      {},
      slide.id,
      '',
    );
  };

  const move = async (
    x: number,
    y: number,
    id: string | undefined = selected?.id,
    onSlide: string | undefined = slide?.id,
  ): Promise<void> => {
    if (id === undefined || onSlide === undefined) return;
    await apply(
      'element.move',
      {
        kind: 'element',
        slideId: onSlide,
        elementId: id,
      },
      { x, y },
      onSlide,
      id,
    );
  };

  const fileAction = async (operation: 'saveDocument' | 'openDocument'): Promise<void> => {
    if (document === null || busy || window.auralide === undefined) return;
    setBusy(true);
    try {
      const result = await window.auralide[operation]({ expectedRevision: document.revision });
      if (result.ok) {
        adopt(
          result.value.document,
          operation === 'openDocument' ? '' : undefined,
          operation === 'openDocument' ? '' : undefined,
        );
        setMessage(
          (operation === 'saveDocument' ? 'Saved · ' : 'Opened · ') +
            result.value.fileName +
            (result.value.backupCreated ? ' · recovery backup retained' : '') +
            (result.value.historyReset ? ' · session undo history reset' : ''),
        );
      } else {
        setMessage('File operation refused: ' + result.error.code + '. ' + result.error.message);
      }
    } catch (error: unknown) {
      setMessage(description(error));
    } finally {
      setBusy(false);
    }
  };

  const canvasCoordinate = (
    event: ReactPointerEvent<SVGSVGElement>,
  ): { x: number; y: number } | null => {
    if (document === null) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scale = Math.min(
      rect.width / document.slideSize.width,
      rect.height / document.slideSize.height,
    );
    const xOffset = (rect.width - document.slideSize.width * scale) / 2;
    const yOffset = (rect.height - document.slideSize.height * scale) / 2;
    return {
      x: (event.clientX - rect.left - xOffset) / scale,
      y: (event.clientY - rect.top - yOffset) / scale,
    };
  };

  const pointerDown = (event: ReactPointerEvent<SVGGElement>, item: Element): void => {
    if (busy || slide === undefined) return;
    selectElement(item);
    const svg = event.currentTarget.ownerSVGElement;
    const point =
      svg === null
        ? null
        : canvasCoordinate({
            currentTarget: svg,
            clientX: event.clientX,
            clientY: event.clientY,
          } as ReactPointerEvent<SVGSVGElement>);
    if (point === null) return;
    drag.current = {
      elementId: item.id,
      slideId: slide.id,
      startX: point.x,
      startY: point.y,
      x: item.geometry.x,
      y: item.geometry.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (drag.current === null) return;
    const point = canvasCoordinate(event);
    if (point === null) return;
    const initial = drag.current;
    setDragPreview({
      id: initial.elementId,
      x: Math.round(initial.x + point.x - initial.startX),
      y: Math.round(initial.y + point.y - initial.startY),
    });
  };

  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (drag.current === null) return;
    const initial = drag.current;
    const point = canvasCoordinate(event);
    drag.current = null;
    setDragPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (point === null) return;
    const x = Math.round(initial.x + point.x - initial.startX);
    const y = Math.round(initial.y + point.y - initial.startY);
    if (x !== initial.x || y !== initial.y) {
      void move(x, y, initial.elementId, initial.slideId);
    }
  };

  return (
    <section
      className="document"
      aria-labelledby="document-heading"
      aria-busy={busy}
      data-testid="demo-workspace"
    >
      <header className="editor-topbar">
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">
            A
          </span>
          <div>
            <p className="brand-name">
              Auralide <span>Demo 0.1</span>
            </p>
            <h2 id="document-heading">{document?.title ?? 'New presentation'}</h2>
          </div>
        </div>
        <div className="editor-top-actions">
          <span className="revision-pill">
            Revision <output data-testid="document-revision">{document?.revision ?? '—'}</output>
          </span>
          <button
            type="button"
            data-testid="document-reload"
            disabled={busy}
            onClick={() => setReload((value) => value + 1)}
          >
            Refresh
          </button>
          <button
            type="button"
            data-testid="document-open"
            disabled={document === null || busy}
            onClick={() => void fileAction('openDocument')}
          >
            Open
          </button>
          <button
            type="button"
            className="button-primary"
            data-testid="document-save"
            disabled={document === null || busy}
            onClick={() => void fileAction('saveDocument')}
          >
            Save
          </button>
        </div>
      </header>

      <div className="editor-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">Insert</span>
          <button
            type="button"
            data-testid="demo-add-slide"
            disabled={busy || document === null}
            onClick={() => void addSlide()}
          >
            + Slide
          </button>
          <button
            type="button"
            data-testid="demo-add-text"
            disabled={busy || slide === undefined}
            onClick={() => void addElement('text')}
          >
            T Text
          </button>
          <button
            type="button"
            data-testid="demo-add-rectangle"
            disabled={busy || slide === undefined}
            onClick={() => void addElement('rectangle')}
          >
            ▭ Rectangle
          </button>
          <button
            type="button"
            data-testid="demo-add-ellipse"
            disabled={busy || slide === undefined}
            onClick={() => void addElement('ellipse')}
          >
            ◯ Ellipse
          </button>
        </div>
        <span className="toolbar-note">
          Click to select · Drag to move · All edits validated by Core
        </span>
      </div>

      <div className="editor-columns">
        <aside className="slide-rail" aria-label="Slides">
          <div className="panel-title">
            Slides <span>{document?.slides.length ?? 0}</span>
          </div>
          <div className="slide-list">
            {document?.slides.map((item, index) => (
              <button
                className={'slide-card' + (slide?.id === item.id ? ' selected' : '')}
                type="button"
                key={item.id}
                aria-pressed={slide?.id === item.id}
                data-testid="demo-slide-item"
                onClick={() => selectSlide(item)}
              >
                <span className="slide-index">{index + 1}</span>
                <span
                  className="slide-thumb"
                  style={{ background: item.backgroundColor ?? '#fff' }}
                >
                  <span style={{ color: item.backgroundColor === '#171b2b' ? '#fff' : '#344054' }}>
                    {(() => {
                      const preview = item.elements.find((element) => element.kind === 'text');
                      return preview?.kind === 'text'
                        ? preview.text.slice(0, 25)
                        : (item.name ?? 'New slide');
                    })()}
                  </span>
                </span>
                <span className="slide-caption">{item.name ?? 'Slide ' + (index + 1)}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rail-add"
            disabled={busy || document === null}
            onClick={() => void addSlide()}
          >
            + Add slide
          </button>
        </aside>

        <section className="canvas-region" aria-label="Canvas">
          <div className="canvas-meta">
            <span>{slide?.name ?? 'Canvas'}</span>
            <span>
              16:9 · {document?.slideSize.width ?? 1280} × {document?.slideSize.height ?? 720}
            </span>
          </div>
          <div className="canvas-stage">
            {document !== null && slide !== undefined ? (
              <svg
                className="slide-preview"
                style={{ width: zoom + '%' }}
                viewBox={'0 0 ' + document.slideSize.width + ' ' + document.slideSize.height}
                role="img"
                aria-label={slide.name ?? 'Slide preview'}
                data-testid="slide-preview"
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragPreview(null);
                }}
              >
                <rect width="100%" height="100%" fill={slide.backgroundColor ?? '#ffffff'} />
                {slide.elements.map((item) => {
                  const x = dragPreview?.id === item.id ? dragPreview.x : item.geometry.x;
                  const y = dragPreview?.id === item.id ? dragPreview.y : item.geometry.y;
                  const active = selected?.id === item.id;
                  return (
                    <g
                      key={item.id}
                      data-element-id={item.id}
                      onPointerDown={(event) => pointerDown(event, item)}
                      style={{ cursor: busy ? 'default' : 'move' }}
                    >
                      {item.kind === 'text' ? (
                        <foreignObject
                          x={x}
                          y={y}
                          width={item.geometry.width}
                          height={item.geometry.height}
                        >
                          <div
                            className="slide-text"
                            data-testid="slide-text"
                            style={{
                              fontSize: item.style?.fontSize ?? 32,
                              fontWeight: item.style?.fontWeight ?? 400,
                              color: item.style?.color ?? '#172033',
                              textAlign: item.style?.align ?? 'left',
                            }}
                          >
                            {item.text}
                          </div>
                        </foreignObject>
                      ) : item.kind === 'shape' ? (
                        item.shape === 'ellipse' ? (
                          <ellipse
                            cx={x + item.geometry.width / 2}
                            cy={y + item.geometry.height / 2}
                            rx={item.geometry.width / 2}
                            ry={item.geometry.height / 2}
                            fill={item.fill ?? '#4677e8'}
                            stroke={item.stroke ?? 'none'}
                          />
                        ) : item.shape === 'line' ? (
                          <line
                            x1={x}
                            y1={y}
                            x2={x + item.geometry.width}
                            y2={y + item.geometry.height}
                            stroke={item.stroke ?? item.fill ?? '#4677e8'}
                            strokeWidth="4"
                          />
                        ) : (
                          <rect
                            x={x}
                            y={y}
                            width={item.geometry.width}
                            height={item.geometry.height}
                            fill={item.fill ?? '#4677e8'}
                            stroke={item.stroke ?? 'none'}
                          />
                        )
                      ) : (
                        <rect
                          x={x}
                          y={y}
                          width={item.geometry.width}
                          height={item.geometry.height}
                          fill="#e6e9ee"
                          stroke="#9aa5b5"
                          strokeDasharray="12 8"
                        />
                      )}
                      {active ? (
                        <rect
                          x={x}
                          y={y}
                          width={item.geometry.width}
                          height={item.geometry.height}
                          fill="none"
                          stroke="#4b8cff"
                          strokeWidth="3"
                          pointerEvents="none"
                        />
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            ) : (
              <p>No slide available.</p>
            )}
          </div>
          <div className="canvas-footer">
            <span>Local-first · No cloud upload</span>
            <div className="zoom-group" aria-label="Zoom">
              <button type="button" onClick={() => setZoom((v) => Math.max(50, v - 10))}>
                −
              </button>
              <span>{zoom}%</span>
              <button type="button" onClick={() => setZoom((v) => Math.min(150, v + 10))}>
                +
              </button>
            </div>
          </div>
        </section>

        <aside className="inspector" aria-label="Layers and properties">
          <div className="panel-title">
            Layers <span>{slide?.elements.length ?? 0}</span>
          </div>
          <div className="layer-list">
            {slide?.elements.map((item) => (
              <button
                type="button"
                key={item.id}
                data-testid="demo-layer-item"
                className={'layer-item' + (selected?.id === item.id ? ' active' : '')}
                aria-pressed={selected?.id === item.id}
                onClick={() => selectElement(item)}
              >
                <span className="layer-icon">
                  {item.kind === 'text' ? 'T' : item.kind === 'shape' ? '▢' : '▧'}
                </span>
                <span>{elementLabel(item)}</span>
              </button>
            ))}
          </div>
          <div className="inspector-divider" />
          <div className="panel-title">Properties</div>
          {selected === undefined ? (
            <p className="inspector-help">Select a layer to edit its properties.</p>
          ) : (
            <>
              <label className="field-label" htmlFor="selected-id">
                Element ID
              </label>
              <input id="selected-id" readOnly value={selected.id} className="readonly-field" />
              {textElement !== undefined ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void updateText();
                  }}
                >
                  <label className="field-label" htmlFor="slide-title">
                    Text content
                  </label>
                  <textarea
                    id="slide-title"
                    data-testid="document-text-input"
                    rows={4}
                    value={text}
                    disabled={busy}
                    onChange={(event) => setText(event.target.value)}
                  />
                  <button
                    className="button-primary inspector-apply"
                    type="submit"
                    data-testid="document-apply"
                    disabled={busy}
                  >
                    {busy ? 'Applying…' : 'Apply text'}
                  </button>
                </form>
              ) : (
                <p className="inspector-help">
                  Shape color and resizing are planned for a later demo.
                </p>
              )}
              <div className="geometry-title">
                Position <span>px</span>
              </div>
              <div className="geometry-grid">
                <span>
                  X <b>{Math.round(selected.geometry.x)}</b>
                </span>
                <span>
                  Y <b>{Math.round(selected.geometry.y)}</b>
                </span>
                <span>
                  W <b>{Math.round(selected.geometry.width)}</b>
                </span>
                <span>
                  H <b>{Math.round(selected.geometry.height)}</b>
                </span>
              </div>
              <div className="move-pad" aria-label="Nudge selected element">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void move(selected.geometry.x - 10, selected.geometry.y)}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void move(selected.geometry.x, selected.geometry.y - 10)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void move(selected.geometry.x, selected.geometry.y + 10)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void move(selected.geometry.x + 10, selected.geometry.y)}
                >
                  →
                </button>
              </div>
              <button
                className="destructive"
                type="button"
                data-testid="demo-delete-element"
                disabled={busy}
                onClick={() => void removeElement()}
              >
                Delete layer
              </button>
            </>
          )}
          <div className="inspector-divider" />
          <button
            type="button"
            className="destructive"
            data-testid="demo-delete-slide"
            disabled={busy || (document?.slides.length ?? 0) <= 1}
            onClick={() => void deleteSlide()}
          >
            Delete slide
          </button>
        </aside>
      </div>
      <div className="editor-status" role="status" data-testid="document-status">
        <span className="status-dot" aria-hidden="true" /> {message}
      </div>
    </section>
  );
}
