import type { AuraTab } from '@auralide/agent';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Icon } from './icons.js';

export function AuraWorkspace({
  enabled,
  suspended,
  slideId,
  revision,
  onReturn,
}: {
  enabled: boolean;
  suspended: boolean;
  slideId: string;
  revision: number;
  onReturn: () => void;
}): JSX.Element {
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef<AuraTab | null>(null);
  const [tab, setTab] = useState<AuraTab | null>(null);
  const [mode, setMode] = useState<'slide-preview' | 'html-lab'>('slide-preview');
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('正在准备预览…');

  useEffect(() => {
    const bridge = window.auralide;
    if (!bridge || !enabled || !slideId) return;
    let cancelled = false;
    setMessage('正在准备预览…');
    void bridge
      .auraInvoke(
        mode === 'slide-preview'
          ? { tool: 'preview.render', input: { slideId, expectedRevision: revision } }
          : { tool: 'browser.open', input: { fixture: 'layout-basics' } },
      )
      .then(
        (result) => {
          if (cancelled) return;
          if (
            result.ok &&
            result.value &&
            typeof result.value === 'object' &&
            'id' in result.value &&
            'mode' in result.value
          ) {
            active.current = result.value;
            setTab(result.value);
            setMessage('预览已就绪');
          } else {
            setMessage('预览未能加载，文档可能已更新。请刷新预览重试。');
          }
        },
        () => {
          if (!cancelled) setMessage('预览暂时不可用，请重试。');
        },
      );
    return () => {
      cancelled = true;
    };
  }, [enabled, mode, revision, slideId, attempt]);

  useLayoutEffect(() => {
    const element = surface.current;
    const bridge = window.auralide;
    if (!element || !bridge) return;
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const visible =
          enabled &&
          !suspended &&
          tab !== null &&
          !document.hidden &&
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;
        void bridge
          .auraSetBounds({
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
            visible,
          })
          .catch(() => setMessage('预览布局暂不可用，请切回编辑器重试。'));
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', update);
      void bridge
        .auraSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false })
        .catch(() => undefined);
    };
  }, [enabled, suspended, tab]);

  useEffect(
    () => () => {
      if (active.current)
        void window.auralide?.auraInvoke({
          tool: 'browser.close',
          input: { tabId: active.current.id },
        });
    },
    [],
  );

  return (
    <section
      id="aura-heading"
      tabIndex={0}
      className="aura-workspace"
      aria-label="Aura 预览工作区"
      hidden={!enabled}
    >
      <nav className="aura-tabs" aria-label="预览内容">
        <button aria-pressed={mode === 'slide-preview'} onClick={() => setMode('slide-preview')}>
          <Icon name="slide" />
          当前幻灯片
        </button>
        <button aria-pressed={mode === 'html-lab'} onClick={() => setMode('html-lab')}>
          HTML Lab 示例
        </button>
        <button disabled title="尚未实现联网研究">
          Web Research · 未启用
        </button>
      </nav>
      <div className="aura-address">
        <Icon name="shield" />
        <span>{mode === 'slide-preview' ? '当前文档 / 隔离预览' : 'HTML Lab / 受控示例'}</span>
        <button onClick={() => setAttempt((value) => value + 1)}>刷新预览</button>
        <span className="safe-label">无脚本 · 无网络</span>
      </div>
      <div
        ref={surface}
        className="aura-native"
        data-testid="aura-workspace-surface"
        aria-label="原生隔离预览内容"
      >
        <p role="status">{message}</p>
      </div>
      <footer className="aura-footer">
        <span>{message} · 点击预览可选择内容，Escape 返回编辑器焦点</span>
        <button onClick={onReturn}>返回编辑器 ↗</button>
      </footer>
    </section>
  );
}
