import type { AuraRequest, AuraResult, AuraTab } from '@auralide/agent';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

/** A runtime test surface; the editor information architecture is still awaiting owner selection. */
export function AuraPoc(): JSX.Element {
  const surface = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [tabs, setTabs] = useState<readonly AuraTab[]>([]);
  const [active, setActive] = useState<AuraTab | null>(null);
  const [elementId, setElementId] = useState('el_title');
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [width, setWidth] = useState(100);
  const [output, setOutput] = useState('Open a Core preview or the reviewed HTML Lab fixture.');
  const [screenshot, setScreenshot] = useState('');

  useEffect(() => {
    const element = surface.current;
    const bridge = window.auralide;
    if (element === null || bridge === undefined) return;
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        // A partly clipped native view would cover adjacent shell controls; hide it until in view.
        const fullyVisible = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        void bridge.auraSetBounds({
          x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)),
          width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)),
          visible: active !== null && !overlay && !document.hidden && fullyVisible,
        }).catch((error: unknown) => setOutput(String(error)));
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('visibilitychange', update);
      void bridge.auraSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false }).catch(() => undefined);
    };
  }, [active, overlay, width]);

  const invoke = async (request: AuraRequest): Promise<void> => {
    const bridge = window.auralide;
    if (bridge === undefined) { setOutput('Desktop bridge unavailable.'); return; }
    setBusy(true);
    try {
      const result: AuraResult = await bridge.auraInvoke(request);
      if (result.ok && result.value !== null && typeof result.value === 'object') {
        const value = result.value;
        if ('id' in value && 'mode' in value && 'slideId' in value) {
          setActive(value);
          setTabs((previous) => [...previous.filter((tab) => tab.mode !== value.mode), value]);
        }
        if ('base64' in value) {
          setScreenshot(`data:${value.mimeType};base64,${value.base64}`);
          setOutput(`Screenshot captured for ${value.tabId} at revision ${value.revision}.`);
          return;
        }
      }
      if (result.ok && request.tool === 'browser.close') {
        setTabs((previous) => previous.filter((tab) => tab.id !== request.input.tabId));
        setActive(null);
      }
      setOutput(JSON.stringify(result));
    } catch (error: unknown) { setOutput(String(error)); }
    finally { setBusy(false); }
  };

  const renderPreview = async (): Promise<void> => {
    try {
      const document = await window.auralide?.getDocument();
      const slide = document?.slides[0];
      if (document === undefined || slide === undefined) { setOutput('No slide available.'); return; }
      setElementId(slide.elements[0]?.id ?? 'el_title');
      await invoke({ tool: 'preview.render', input: { slideId: slide.id, expectedRevision: document.revision } });
    } catch (error: unknown) { setOutput(String(error)); }
  };

  const showOverlay = async (): Promise<void> => {
    try {
      await window.auralide?.auraSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false });
      setOverlay(true);
      dialog.current?.showModal();
    } catch (error: unknown) { setOutput(String(error)); }
  };

  return (
    <section className="aura-poc" aria-labelledby="aura-heading" aria-busy={busy}>
      <h2 id="aura-heading">Aura Browser · isolated runtime POC</h2>
      <p>Preview and HTML Lab run without scripts, network access or an editor bridge.</p>
      <div className="aura-controls">
        <button type="button" data-testid="aura-render" disabled={busy} onClick={() => void renderPreview()}>Preview Core slide</button>
        <button type="button" data-testid="aura-lab" disabled={busy} onClick={() => { setElementId('el_lab-heading'); void invoke({ tool: 'browser.open', input: { fixture: 'layout-basics' } }); }}>HTML Lab fixture</button>
        <button type="button" data-testid="aura-overlay" onClick={() => void showOverlay()}>Test shell overlay</button>
        {active !== null ? <button type="button" data-testid="aura-close" disabled={busy} onClick={() => void invoke({ tool: 'browser.close', input: { tabId: active.id } })}>Close tab</button> : null}
      </div>
      <nav aria-label="Aura Browser tabs" className="aura-controls">
        {tabs.map((tab) => <button type="button" key={tab.id} aria-pressed={active?.id === tab.id} onClick={() => void invoke({ tool: 'browser.activate', input: { tabId: tab.id } })}>{tab.mode}</button>)}
      </nav>
      <label>Preview pane width <input aria-label="Preview pane width" data-testid="aura-width" type="range" min="50" max="100" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
      <div ref={surface} className="aura-surface" style={{ width: `${width}%` }} data-testid="aura-surface" aria-label="Native Aura preview surface">
        {active === null ? 'Open a preview to attach an isolated native view.' : 'Native preview appears here when this whole pane is visible.'}
      </div>
      <div className="aura-controls">
        <button type="button" data-testid="aura-inspect" disabled={active === null || busy} onClick={() => { if (active) void invoke({ tool: 'preview.inspectElement', input: { tabId: active.id, elementId, expectedRevision: active.revision } }); }}>Inspect stable element</button>
        <button type="button" data-testid="aura-diagnostics" disabled={active === null || busy} onClick={() => { if (active) void invoke({ tool: 'preview.getDiagnostics', input: { tabId: active.id, expectedRevision: active.revision } }); }}>Diagnostics</button>
        <button type="button" data-testid="aura-screenshot" disabled={active === null || busy} onClick={() => { if (active) void invoke({ tool: 'preview.screenshot', input: { tabId: active.id, expectedRevision: active.revision } }); }}>Capture preview</button>
      </div>
      <output className="aura-output" role="status" data-testid="aura-result">{output}</output>
      {screenshot !== '' ? <img className="aura-capture" src={screenshot} alt="Captured Aura preview" /> : null}
      <dialog ref={dialog} aria-labelledby="aura-dialog-title" onClose={() => setOverlay(false)}>
        <h3 id="aura-dialog-title">Trusted shell overlay</h3><p>The native guest is hidden while this dialog is open.</p>
        <button type="button" onClick={() => dialog.current?.close()}>Close overlay</button>
      </dialog>
    </section>
  );
}
