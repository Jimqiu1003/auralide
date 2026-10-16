import { StrictMode, useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';

import type { RuntimeInfo } from '../shared/api.js';
import { DocumentPreview } from './document-preview.js';
import { AuraPoc } from './aura-poc.js';

import './styles.css';

/**
 * P1 renderer: runtime diagnostics and a small Core-driven text workbench.
 *
 * It proves the boundary end to end — the page can be told what the runtime is, and it can be
 * *refused* — and it exposes stable `data-testid` hooks so the smoke run asserts real behaviour
 * rather than the existence of files. `window.auralide` may legitimately be missing (a broken
 * preload path, or the page opened in a plain browser); that must degrade visibly, not crash.
 */

const PRODUCT_NAME = 'Auralide';

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The allow-listed path: a payload the main process accepts. */
const PING_ALLOWED_REQUEST = { message: 'hello from the renderer' } as const;
/** The refusal path: type-legal for the bridge, but it violates the main-process schema. */
const PING_REJECTED_REQUEST = { message: '' } as const;

function Diagnostics(): JSX.Element {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [status, setStatus] = useState('starting');
  const [pingResult, setPingResult] = useState('');
  const [invalidResult, setInvalidResult] = useState('');

  useEffect(() => {
    const bridge = window.auralide;
    if (bridge === undefined) {
      setStatus('error: window.auralide is unavailable (the preload bridge did not load)');
      return;
    }

    let cancelled = false;
    bridge.getRuntimeInfo().then(
      (info) => {
        if (!cancelled) {
          setRuntime(info);
          setStatus('ready');
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setStatus(`error: ${describe(error)}`);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const ping = useCallback(async (request: { message: string }, set: (text: string) => void) => {
    const bridge = window.auralide;
    if (bridge === undefined) {
      set('error: window.auralide is unavailable');
      return;
    }
    try {
      const response = await bridge.ping(request);
      set(response.ok ? `ok: ${response.echo}` : `refused: ${response.code}`);
    } catch (error: unknown) {
      set(`error: ${describe(error)}`);
    }
  }, []);

  return (
    <main className="shell" data-testid="app-root">
      <h1 data-testid="app-name">{PRODUCT_NAME}</h1>
      <p className="subtitle">A structured presentation, edited through one command path.</p>

      <DocumentPreview />
      <AuraPoc />

      <dl className="facts">
        <dt>status</dt>
        <dd data-testid="runtime-status">{status}</dd>
        <dt>version</dt>
        <dd data-testid="app-version">{runtime?.appVersion ?? 'unknown'}</dd>
        <dt>load path</dt>
        <dd data-testid="load-path">{runtime?.loadPath ?? 'unknown'}</dd>
        <dt>runtime</dt>
        <dd data-testid="runtime-versions">
          {runtime === null
            ? 'unknown'
            : `electron ${runtime.electronVersion} · chrome ${runtime.chromeVersion} · node ${runtime.nodeVersion}`}
        </dd>
        <dt>bridge</dt>
        <dd data-testid="bridge-version">{window.auralide?.bridgeVersion ?? 'unavailable'}</dd>
        <dt>platform</dt>
        <dd data-testid="platform">{runtime?.platform ?? 'unknown'}</dd>
      </dl>

      <section className="probes">
        <button
          type="button"
          data-testid="ipc-ping-button"
          onClick={() => void ping(PING_ALLOWED_REQUEST, setPingResult)}
        >
          run allow-listed ping
        </button>
        <output data-testid="ipc-ping-result">{pingResult}</output>

        <button
          type="button"
          data-testid="ipc-invalid-button"
          onClick={() => void ping(PING_REJECTED_REQUEST, setInvalidResult)}
        >
          run invalid ping
        </button>
        <output data-testid="ipc-invalid-result">{invalidResult}</output>
      </section>
    </main>
  );
}

const container = document.getElementById('root');

if (container === null) {
  throw new Error('renderer root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <Diagnostics />
  </StrictMode>,
);
