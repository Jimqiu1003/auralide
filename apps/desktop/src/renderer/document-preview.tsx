import type { Presentation } from '@auralide/core';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';

export function DocumentPreview(): JSX.Element {
  const [document, setDocument] = useState<Presentation | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('Loading document…');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const slide = document?.slides[0];
  const title = slide?.elements.find((element) => element.kind === 'text');

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
        setDocument(value);
        const firstText = value.slides[0]?.elements.find((element) => element.kind === 'text');
        setText(firstText?.kind === 'text' ? firstText.text : '');
        setMessage(
          'Ready. Save document to keep changes on disk. Undo history remains session-only.',
        );
        setBusy(false);
      },
      (error: unknown) => {
        if (!cancelled) {
          setMessage(String(error));
          setBusy(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const updateText = async (): Promise<void> => {
    if (document === null || slide === undefined || title === undefined || busy) return;
    const bridge = window.auralide;
    if (bridge === undefined) return;
    setBusy(true);
    try {
      const result = await bridge.applyCommand({
        operation: 'element.updateText',
        target: { kind: 'element', slideId: slide.id, elementId: title.id },
        payload: { text },
        expectedRevision: document.revision,
        origin: { kind: 'human' },
      });
      if (result.ok) {
        setDocument(result.value);
        setMessage('Text updated through Core.');
      } else {
        setMessage(`Edit refused: ${result.error.code}. Reload the document before retrying.`);
      }
    } catch (error: unknown) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const fileAction = async (operation: 'saveDocument' | 'openDocument'): Promise<void> => {
    if (document === null || busy || window.auralide === undefined) return;
    setBusy(true);
    try {
      const result = await window.auralide[operation]({ expectedRevision: document.revision });
      if (result.ok) {
        setDocument(result.value.document);
        const element = result.value.document.slides[0]?.elements.find(
          (candidate) => candidate.kind === 'text',
        );
        setText(element?.kind === 'text' ? element.text : '');
        setMessage(
          `${operation === 'saveDocument' ? 'Saved' : 'Opened'} ${result.value.fileName}.${result.value.backupCreated ? ' Previous file retained as a recovery backup.' : ''}${result.value.historyReset ? ' Session undo history reset. Render Aura again for this revision.' : ''}`,
        );
      } else {
        setMessage(`File operation refused: ${result.error.code}. ${result.error.message}`);
      }
    } catch (error: unknown) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="document" aria-labelledby="document-heading" aria-busy={busy}>
      <header className="document-heading">
        <div>
          <p className="eyebrow">P2A · Document workbench</p>
          <h2 id="document-heading">{document?.title ?? 'Welcome to Auralide'}</h2>
        </div>
        <span>
          Revision <output data-testid="document-revision">{document?.revision ?? '—'}</output>
        </span>
      </header>
      {document !== null && slide !== undefined ? (
        <svg
          className="slide-preview"
          viewBox={`0 0 ${document.slideSize.width} ${document.slideSize.height}`}
          role="img"
          aria-label={slide.name ?? 'Slide preview'}
          data-testid="slide-preview"
        >
          <rect width="100%" height="100%" fill={slide.backgroundColor ?? '#171b2b'} />
          {slide.elements.map((element) =>
            element.kind === 'text' ? (
              <foreignObject
                key={element.id}
                x={element.geometry.x}
                y={element.geometry.y}
                width={element.geometry.width}
                height={element.geometry.height}
              >
                <div
                  className="slide-text"
                  data-testid="slide-text"
                  style={{
                    fontSize: element.style?.fontSize ?? 32,
                    fontWeight: element.style?.fontWeight ?? 400,
                    color: element.style?.color ?? '#fff',
                    textAlign: element.style?.align ?? 'left',
                  }}
                >
                  {element.text}
                </div>
              </foreignObject>
            ) : null,
          )}
        </svg>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void updateText();
        }}
      >
        <label htmlFor="slide-title">Slide text</label>
        <div className="text-edit">
          <input
            id="slide-title"
            data-testid="document-text-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={title === undefined || busy}
          />
          <button type="submit" data-testid="document-apply" disabled={title === undefined || busy}>
            {busy ? 'Applying…' : 'Apply text'}
          </button>
          <button
            type="button"
            data-testid="document-reload"
            disabled={busy}
            onClick={() => setReload((value) => value + 1)}
          >
            Reload document
          </button>
        </div>
      </form>
      <p role="status" data-testid="document-status">
        {message}
      </p>
      <div className="text-edit">
        <button
          type="button"
          data-testid="document-save"
          disabled={document === null || busy}
          onClick={() => void fileAction('saveDocument')}
        >
          Save document
        </button>
        <button
          type="button"
          data-testid="document-open"
          disabled={document === null || busy}
          onClick={() => void fileAction('openDocument')}
        >
          Open document
        </button>
      </div>
    </section>
  );
}
