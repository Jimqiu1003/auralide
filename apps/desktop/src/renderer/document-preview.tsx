import { createIdGenerator } from '@auralide/core';
import type { Element, Presentation, Slide } from '@auralide/core';
import { useEffect, useRef, useState } from 'react';
import type { DocumentStatus } from '../shared/api.js';
import { AuraWorkspace } from './aura-workspace.js';
import { SlideArtwork } from './slide-artwork.js';
import { Icon } from './icons.js';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

const ids = createIdGenerator();

type FileOperation =
  'saveDocument' | 'saveDocumentAs' | 'openDocument' | 'newDocument' | 'importHtml' | 'exportHtml';
const fileLabels: Record<FileOperation, string> = {
  newDocument: '新建',
  openDocument: '打开',
  saveDocument: '保存',
  saveDocumentAs: '另存为',
  importHtml: '导入 HTML',
  exportHtml: '导出 HTML',
};

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
 * A2 production shell. The renderer only owns selection and draft UI state.
 * Every persistent edit goes to main's existing Core Dispatcher.
 */
export function DocumentPreview({ diagnostics = false }: { diagnostics?: boolean }): JSX.Element {
  const [document, setDocument] = useState<Presentation | null>(null);
  const [slideId, setSlideId] = useState('');
  const [elementId, setElementId] = useState('');
  const [text, setText] = useState('');
  const drafts = useRef(new Map<string, string>());
  const [fileStatus, setFileStatus] = useState<DocumentStatus | null>(null);
  const [workspace, setWorkspace] = useState<'editor' | 'aura'>('editor');
  const [inspectorTab, setInspectorTab] = useState<'design' | 'arrange'>('design');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [modal, setModal] = useState<
    'menu' | 'save-drafts' | 'open-drafts' | 'delete-slide' | null
  >(null);
  const pendingFileOperation = useRef<FileOperation>('saveDocument');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const invoker = useRef<HTMLElement | null>(null);
  const locked = useRef(false);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState('正在读取文档…');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(720);

  const slide = document?.slides.find((item) => item.id === slideId) ?? document?.slides[0];
  const selected = slide?.elements.find((item) => item.id === elementId);
  const textElement = selected?.kind === 'text' ? selected : undefined;

  const adopt = (value: Presentation, nextSlide?: string, nextElement?: string): void => {
    for (const id of drafts.current.keys()) {
      if (!value.slides.some((page) => page.elements.some((item) => item.id === id)))
        drafts.current.delete(id);
    }
    setDocument(value);
    const currentSlide =
      value.slides.find((item) => item.id === (nextSlide ?? slideId)) ?? value.slides[0];
    const currentElement =
      currentSlide?.elements.find((item) => item.id === (nextElement ?? elementId)) ??
      currentSlide?.elements.find((item) => item.kind === 'text') ??
      currentSlide?.elements[0];
    setSlideId(currentSlide?.id ?? '');
    setElementId(currentElement?.id ?? '');
    setText(
      currentElement?.kind === 'text'
        ? (drafts.current.get(currentElement.id) ?? currentElement.text)
        : '',
    );
  };

  useEffect(() => {
    let cancelled = false;
    const bridge = window.auralide;
    if (bridge === undefined) {
      setMessage('The desktop bridge is unavailable.');
      return;
    }
    setBusy(true);
    void Promise.all([bridge.getDocument(), bridge.getDocumentStatus()]).then(
      ([value, status]) => {
        if (cancelled) return;
        setFileStatus(status);
        const initialSlide = value.slides[0];
        const initialElement =
          initialSlide?.elements.find((item) => item.kind === 'text') ?? initialSlide?.elements[0];
        setDocument(value);
        setSlideId(initialSlide?.id ?? '');
        setElementId(initialElement?.id ?? '');
        setText(
          initialElement?.kind === 'text'
            ? (drafts.current.get(initialElement.id) ?? initialElement.text)
            : '',
        );
        setMessage('就绪 · 文件保存在本地');
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
    setText(next?.kind === 'text' ? (drafts.current.get(next.id) ?? next.text) : '');
  };

  const selectElement = (item: Element): void => {
    setElementId(item.id);
    setText(item.kind === 'text' ? (drafts.current.get(item.id) ?? item.text) : '');
  };

  const apply = async (
    operation: string,
    target: Record<string, string>,
    payload: unknown,
    nextSlide?: string,
    nextElement?: string,
  ): Promise<boolean> => {
    if (document === null || locked.current || window.auralide === undefined) return false;
    pendingFocus.current = globalThis.document.activeElement as HTMLElement | null;
    locked.current = true;
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
        setMessage('修改已拒绝，当前输入已保留。请读取最新文档后重试。');
        return false;
      }
      if (operation === 'element.updateText') drafts.current.delete(target.elementId ?? '');
      adopt(result.value, nextSlide, nextElement);
      setFileStatus(await window.auralide.getDocumentStatus());
      setMessage(operation === 'element.updateText' ? '文本已更新' : '修改已应用，尚未保存');
      return true;
    } catch {
      setMessage('修改未完成，当前输入已保留。请重试。');
      return false;
    } finally {
      locked.current = false;
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
        name: '幻灯片 ' + (document.slides.length + 1),
        backgroundColor: '#ffffff',
      },
      id,
      '',
    );
  };

  const deleteSlide = async (): Promise<void> => {
    if (slide === undefined || document === null || document.slides.length <= 1) return;

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
            name: '文本',
            text: '在右侧输入你的想法',
            geometry,
            style: { fontSize: 40, color: '#172033', fontWeight: 500 },
          }
        : {
            id,
            kind: 'shape',
            name: kind === 'ellipse' ? '椭圆' : '矩形',
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

  const fileAction = async (operation: FileOperation, confirmed = false): Promise<void> => {
    const bridge = window.auralide;
    if (document === null || locked.current || bridge === undefined) return;
    const replacesDocument = ['openDocument', 'importHtml', 'newDocument'].includes(operation);
    pendingFileOperation.current = operation;
    if (drafts.current.size && !confirmed) {
      showModal(replacesDocument ? 'open-drafts' : 'save-drafts');
      return;
    }
    pendingFocus.current = modal
      ? invoker.current
      : (globalThis.document.activeElement as HTMLElement | null);
    closeModal();
    locked.current = true;
    setBusy(true);
    setMessage('正在' + fileLabels[operation] + '…');
    try {
      await bridge.auraSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false });
      let current = document;
      if (!replacesDocument) {
        for (const [id, value] of drafts.current) {
          const owner = current.slides.find((item) =>
            item.elements.some((element) => element.id === id),
          );
          if (!owner) continue;
          const applied = await bridge.applyCommand({
            operation: 'element.updateText',
            target: { kind: 'element', slideId: owner.id, elementId: id },
            payload: { text: value },
            expectedRevision: current.revision,
            origin: { kind: 'human' },
          });
          if (!applied.ok) {
            setMessage('文本应用被拒绝，草稿已保留。请读取最新文档。');
            return;
          }
          current = applied.value;
          drafts.current.delete(id);
          adopt(current);
        }
      }
      const result = await bridge[operation]({ expectedRevision: current.revision });
      if (result.ok) {
        if (replacesDocument) drafts.current.clear();
        adopt(
          result.value.document,
          replacesDocument ? '' : undefined,
          replacesDocument ? '' : undefined,
        );
        setMessage(
          '已' +
            fileLabels[operation] +
            ' · ' +
            result.value.fileName +
            (result.value.backupCreated ? ' · 已保留恢复备份' : '') +
            (result.value.historyReset ? ' · 会话历史已重置' : ''),
        );
      } else {
        const messages: Record<string, string> = {
          cancelled: '操作已取消，未保存内容已保留',
          'file-changed': '文件已在外部修改，保存已拒绝。未保存内容已保留',
          'stale-revision': '文档版本已更新，操作已拒绝。未保存输入已保留',
          'access-denied': '无法写入文件，未保存内容已保留',
          'invalid-input': result.error.message,
          'invalid-document': '无法安全读取此文档，当前内容已保留',
          'invalid-json': '文件格式无效，当前文档已保留',
        };
        setMessage(messages[result.error.code] ?? '文件操作失败，当前文档和输入已保留');
      }
    } catch {
      setMessage('文件操作未完成，当前文档和输入已保留');
    } finally {
      try {
        setFileStatus(await bridge.getDocumentStatus());
      } catch {
        /* The existing status stays visible if the transport fails. */
      }
      locked.current = false;
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

  function showModal(value: NonNullable<typeof modal>): void {
    if (modal === null) invoker.current = globalThis.document.activeElement as HTMLElement | null;
    setModal(value);
  }
  function closeModal(): void {
    dialogRef.current?.close();
    setModal(null);
  }
  async function changeWorkspace(value: 'editor' | 'aura'): Promise<void> {
    if (busy) return;
    if (value === 'editor')
      await window.auralide?.auraSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false });
    setWorkspace(value);
    if (value === 'editor')
      requestAnimationFrame(() =>
        globalThis.document.querySelector<HTMLElement>('[data-workspace="editor"]')?.focus(),
      );
  }
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = (): void => {
      globalThis.document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  useEffect(() => {
    if (modal === null) return;
    let cancelled = false;
    void window.auralide
      ?.auraSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false })
      .then(() => {
        if (cancelled) return;
        if (!dialogRef.current?.open) dialogRef.current?.showModal();
        if (modal !== 'menu')
          dialogRef.current?.querySelector<HTMLButtonElement>('.dialog-actions button')?.focus();
      });
    return () => {
      cancelled = true;
    };
  }, [modal]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (drafts.current.size) event.preventDefault();
    };
    const keys = (event: KeyboardEvent): void => {
      if (modal || busy || globalThis.document.activeElement?.tagName === 'IFRAME') return;
      if ((event.ctrlKey || event.metaKey) && ['s', 'o', 'n'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        void fileAction(
          event.key.toLowerCase() === 's'
            ? event.shiftKey
              ? 'saveDocumentAs'
              : 'saveDocument'
            : event.key.toLowerCase() === 'n'
              ? 'newDocument'
              : 'openDocument',
        );
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select')) {
        if (event.key === 'Escape' && target.closest('.inspector')) {
          drafts.current.delete(elementId);
          setText(textElement?.text ?? '');
          globalThis.document.querySelector<HTMLElement>('.canvas-stage')?.focus();
        }
        return;
      }
      if (workspace !== 'editor' || !selected || !target.closest('.slide-preview,.layer-item'))
        return;
      const step = event.shiftKey ? 10 : 1;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        void move(
          selected.geometry.x +
            (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
          selected.geometry.y +
            (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
        );
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        void removeElement();
        requestAnimationFrame(() =>
          globalThis.document.querySelector<HTMLElement>('.canvas-stage')?.focus(),
        );
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keys);
    };
  });

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = (): void => {
      const ratio = (document?.slideSize.width ?? 1280) / (document?.slideSize.height ?? 720);
      setFitWidth(
        Math.max(1, Math.min(element.clientWidth - 40, (element.clientHeight - 28) * ratio)),
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [document?.slideSize.width, document?.slideSize.height, workspace]);

  useEffect(() => {
    if (busy || modal || !pendingFocus.current) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target.isConnected && !target.matches(':disabled') && target.getClientRects().length)
      target.focus();
    else
      globalThis.document
        .querySelector<HTMLElement>(
          workspace === 'editor'
            ? '[data-testid="document-text-input"]:not(:disabled)'
            : '[data-workspace="aura"]',
        )
        ?.focus();
    if (globalThis.document.activeElement === globalThis.document.body)
      globalThis.document.querySelector<HTMLElement>('#editor-canvas')?.focus();
  });

  return (
    <section
      className={`document studio-app${diagnostics ? ' diagnostic-editor' : ''}`}
      aria-label="Auralide 桌面编辑器"
      aria-busy={busy}
      data-testid="demo-workspace"
    >
      <a className="skip-link" href={workspace === 'editor' ? '#editor-canvas' : '#aura-heading'}>
        跳到工作区
      </a>
      <header className="titlebar">
        <span className="brand">
          <span className="brand-mark">a</span>
          <strong>Auralide</strong>
        </span>
        <span className="divider" />
        <button
          className="document-title"
          onClick={() => showModal('menu')}
          aria-label={`${document?.title ?? '正在读取文档'} · 文档菜单`}
        >
          <span id="document-heading">{document?.title ?? '正在读取文档'}</span>
          <span className="muted">⌄</span>
        </button>
        <output
          className={`save-state${fileStatus?.dirty ? ' is-dirty' : ''}`}
          data-testid="save-state"
        >
          {busy
            ? '正在处理…'
            : drafts.current.size
              ? '有未应用输入'
              : fileStatus?.dirty
                ? '有未保存修改'
                : fileStatus?.fileName
                  ? '已保存'
                  : '尚未保存为文件'}
        </output>
        <div className="title-actions">
          <select
            aria-label="主题"
            value={theme}
            onChange={(event) => setTheme(event.target.value as typeof theme)}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
            <option value="system">跟随系统</option>
          </select>
          <button
            data-testid="document-open"
            disabled={document === null || busy}
            onClick={() => void fileAction('openDocument')}
          >
            <Icon name="folder" />
            打开
          </button>
          <button
            className="primary"
            data-testid="document-save"
            disabled={document === null || busy}
            onClick={() => void fileAction('saveDocument')}
          >
            <Icon name="save" />
            保存
          </button>
        </div>
      </header>
      <nav className="studio-nav" aria-label="工作区">
        <button className="file-menu" onClick={() => showModal('menu')}>
          文件
        </button>
        <button
          data-workspace="editor"
          aria-pressed={workspace === 'editor'}
          disabled={busy}
          onClick={() => void changeWorkspace('editor')}
        >
          编辑器
        </button>
        <button
          data-workspace="aura"
          aria-pressed={workspace === 'aura'}
          disabled={busy || document === null || slide === undefined || diagnostics}
          onClick={() => void changeWorkspace('aura')}
        >
          Aura 预览
        </button>
        <span className="nav-spacer" />
        <button disabled title="Agent 授权和提案服务尚未实现">
          <Icon name="spark" />
          Agent · 未启用
        </button>
      </nav>
      <div className="ribbon" aria-label="分组编辑工具">
        <div className="ribbon-section">
          <div className="tool-group">
            <button
              className="ribbon-tool"
              data-testid="demo-add-slide"
              disabled={busy || document === null || workspace !== 'editor'}
              onClick={() => void addSlide()}
            >
              <Icon name="slide" />
              新建页
            </button>
            <button
              className="ribbon-tool"
              data-testid="demo-add-text"
              disabled={busy || slide === undefined || workspace !== 'editor'}
              onClick={() => void addElement('text')}
            >
              <Icon name="text" />
              文本框
            </button>
            <button
              className="ribbon-tool"
              data-testid="demo-add-rectangle"
              disabled={busy || slide === undefined || workspace !== 'editor'}
              onClick={() => void addElement('rectangle')}
            >
              <Icon name="shape" />
              矩形
            </button>
            <button
              className="ribbon-tool"
              data-testid="demo-add-ellipse"
              disabled={busy || slide === undefined || workspace !== 'editor'}
              onClick={() => void addElement('ellipse')}
            >
              <span aria-hidden="true">◯</span>椭圆
            </button>
          </div>
          <span className="ribbon-caption">插入</span>
        </div>
        <div className="ribbon-section">
          <div className="tool-group">
            <button
              className="icon-button"
              disabled
              aria-label="撤销（尚未接入）"
              title="文档撤销控件尚未接入"
            >
              <Icon name="undo" />
            </button>
            <button
              className="icon-button"
              disabled
              aria-label="重做（尚未接入）"
              title="文档重做控件尚未接入"
            >
              <Icon name="redo" />
            </button>
            <button
              disabled={busy || !selected || workspace !== 'editor'}
              onClick={() => void removeElement()}
            >
              <Icon name="trash" />
              删除对象
            </button>
          </div>
          <span className="ribbon-caption">编辑</span>
        </div>
        <div className="ribbon-section context-ribbon">
          <div className="tool-group">
            <span className="context-font">系统字体</span>
            <button disabled title="字号编辑尚未接入">
              字号 {textElement?.style?.fontSize ?? '—'}
            </button>
            <button disabled title="字重编辑尚未接入" aria-label="粗体（尚未接入）">
              <b>B</b>
            </button>
            <button disabled title="样式命令尚未接入">
              颜色
            </button>
          </div>
          <span className="ribbon-caption">
            {workspace === 'aura'
              ? '隔离预览 · 文档保持不变'
              : selected
                ? `${selected.kind === 'text' ? '文本' : selected.kind === 'shape' ? '形状' : '图像'} · ${elementLabel(selected)}`
                : '选择对象以编辑'}
          </span>
        </div>
      </div>
      <div className="editor-columns">
        <aside className="slide-rail" aria-label="幻灯片与图层">
          <div className="panel-heading">
            幻灯片 <span className="count">{document?.slides.length ?? 0}</span>
          </div>
          <div className="slide-list">
            {document?.slides.map((item, index) => (
              <button
                className="slide-card"
                type="button"
                key={item.id}
                aria-label={`幻灯片 ${index + 1}：${item.name ?? ''}`}
                aria-pressed={slide?.id === item.id}
                data-testid="demo-slide-item"
                disabled={busy}
                onClick={() => selectSlide(item)}
              >
                <span className="slide-number">{index + 1}</span>
                <span className="slide-thumb">
                  <SlideArtwork slide={item} size={document.slideSize} />
                </span>
                <span className="slide-caption">{item.name ?? `幻灯片 ${index + 1}`}</span>
              </button>
            ))}
          </div>
          <details className="studio-layers" open>
            <summary>
              当前页图层 <span className="tiny muted">前 → 后</span>
            </summary>
            <div className="layer-list">
              {slide &&
                [...slide.elements].reverse().map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    data-testid="demo-layer-item"
                    className="layer-item"
                    aria-pressed={selected?.id === item.id}
                    disabled={busy}
                    onClick={() => selectElement(item)}
                  >
                    <Icon name={item.kind === 'text' ? 'text' : 'shape'} />
                    <span>{elementLabel(item)}</span>
                  </button>
                ))}
            </div>
          </details>
        </aside>
        <section className="canvas-column" aria-label="画布工作区">
          <div className="canvas-topline">
            <span>{slide?.name ?? '画布'}</span>
            <span>
              {document?.slideSize.width ?? 1280} × {document?.slideSize.height ?? 720} px
            </span>
          </div>
          <div
            ref={stageRef}
            id="editor-canvas"
            className="canvas-stage"
            tabIndex={0}
            hidden={workspace !== 'editor'}
            aria-label="编辑画布，Tab 选择对象，方向键移动"
          >
            <div
              className="slide-frame"
              style={{
                aspectRatio: `${document?.slideSize.width ?? 1280} / ${document?.slideSize.height ?? 720}`,
                width: `${(fitWidth * zoom) / 100}px`,
              }}
            >
              {document && slide ? (
                <SlideArtwork
                  slide={slide}
                  size={document.slideSize}
                  selectedId={elementId}
                  drag={dragPreview}
                  onSelect={selectElement}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDragPreview(null);
                  }}
                  onEdit={() =>
                    requestAnimationFrame(() =>
                      globalThis.document
                        .querySelector<HTMLTextAreaElement>('[data-testid="document-text-input"]')
                        ?.focus(),
                    )
                  }
                />
              ) : (
                <p>{message}</p>
              )}
            </div>
          </div>
          {!diagnostics && (
            <AuraWorkspace
              enabled={workspace === 'aura'}
              suspended={busy || modal !== null}
              slideId={slide?.id ?? ''}
              revision={document?.revision ?? 0}
              onReturn={() => void changeWorkspace('editor')}
            />
          )}
          <div className="canvas-bottom">
            <span>
              幻灯片{' '}
              {slide ? (document?.slides.findIndex((item) => item.id === slide.id) ?? 0) + 1 : 0} /{' '}
              {document?.slides.length ?? 0}
            </span>
            <span className="canvas-hint">
              {workspace === 'editor' ? '单击选择 · 拖动或方向键移动' : '原生隔离预览'}
            </span>
            <div className="zoom-tools">
              <button
                aria-label="缩小"
                disabled={workspace !== 'editor'}
                onClick={() => setZoom((value) => Math.max(50, value - 10))}
              >
                −
              </button>
              <output>{zoom === 100 ? '适应' : `${zoom}%`}</output>
              <button
                aria-label="放大"
                disabled={workspace !== 'editor'}
                onClick={() => setZoom((value) => Math.min(150, value + 10))}
              >
                +
              </button>
              <button aria-label="适应窗口" onClick={() => setZoom(100)}>
                <Icon name="fit" />
              </button>
            </div>
          </div>
        </section>
        <aside className="right-panel" aria-label="属性检查器">
          <div className="panel-heading">
            {workspace === 'aura' ? '预览信息' : '设置对象格式'}
            <Icon name="sliders" />
          </div>
          <nav className="inspector-tabs" aria-label="检查器">
            <button
              aria-pressed={inspectorTab === 'design'}
              onClick={() => setInspectorTab('design')}
            >
              格式
            </button>
            <button
              aria-pressed={inspectorTab === 'arrange'}
              onClick={() => setInspectorTab('arrange')}
            >
              排列
            </button>
          </nav>
          <div className="inspector">
            {workspace === 'aura' ? (
              <>
                <div className="selection-heading">
                  <Icon name="shield" />
                  <div>
                    <strong>Aura 工作区</strong>
                    <small>当前文档的原生隔离预览</small>
                  </div>
                </div>
                <h2>看见演示的另一面。</h2>
                <p className="inspector-help">
                  预览使用独立会话，不拥有文件、编辑器或 Agent 权限。脚本和网络均禁用。
                </p>
                <p className="inspector-help">
                  切回编辑器后，当前页、对象选择及未应用输入保持不变。
                </p>
              </>
            ) : (
              <>
                <div className="selection-heading">
                  <Icon name={selected?.kind === 'text' ? 'text' : selected ? 'shape' : 'slide'} />
                  <div>
                    <strong>{selected ? elementLabel(selected) : '幻灯片'}</strong>
                    <small>
                      {selected?.kind === 'text'
                        ? '文本'
                        : selected?.kind === 'shape'
                          ? '形状'
                          : '文档内容'}
                    </small>
                  </div>
                </div>
                {selected ? (
                  inspectorTab === 'design' ? (
                    textElement ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void updateText();
                        }}
                      >
                        <h3>文字</h3>
                        <label className="field-label" htmlFor="slide-title">
                          内容
                        </label>
                        <textarea
                          id="slide-title"
                          data-testid="document-text-input"
                          aria-describedby="text-draft-help"
                          rows={4}
                          value={text}
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === textElement.text) drafts.current.delete(textElement.id);
                            else drafts.current.set(textElement.id, value);
                            setText(value);
                          }}
                        />
                        <button
                          className="inspector-apply"
                          type="submit"
                          data-testid="document-apply"
                          disabled={busy || text === textElement.text}
                        >
                          应用文本修改
                        </button>
                        <p id="text-draft-help" className="property-note">
                          未应用输入会跨面板保留。Escape 撤回当前输入。
                        </p>
                        <section className="property-section">
                          <h3>文字样式</h3>
                          <div className="readonly-row">
                            <span>字号</span>
                            <span>{textElement.style?.fontSize ?? 32} px</span>
                          </div>
                          <div className="readonly-row">
                            <span>颜色</span>
                            <span className="color-value">
                              <i style={{ background: textElement.style?.color ?? '#172033' }} />
                              {textElement.style?.color ?? '#172033'}
                            </span>
                          </div>
                          <p className="property-note">样式仅显示；本轮尚未接入样式修改。</p>
                        </section>
                      </form>
                    ) : (
                      <>
                        <h3>形状</h3>
                        <div className="readonly-row">
                          <span>填充</span>
                          <span className="color-value">
                            <i
                              style={{
                                background:
                                  selected.kind === 'shape'
                                    ? (selected.fill ?? '#4677e8')
                                    : '#e6e9ee',
                              }}
                            />
                            {selected.kind === 'shape' ? (selected.fill ?? '#4677e8') : '图像占位'}
                          </span>
                        </div>
                        <p className="property-note">
                          颜色、旋转和尺寸编辑尚未接入。使用「排列」查看位置并移动对象。
                        </p>
                      </>
                    )
                  ) : (
                    <>
                      <h3>
                        位置与尺寸 <span className="tiny muted">px</span>
                      </h3>
                      <div className="geometry-grid">
                        {(['x', 'y', 'width', 'height'] as const).map((key) => (
                          <div key={key}>
                            <span>
                              {key === 'width' ? '宽' : key === 'height' ? '高' : key.toUpperCase()}
                            </span>
                            <output>{Math.round(selected.geometry[key])}</output>
                          </div>
                        ))}
                      </div>
                      <div className="move-pad" aria-label="移动选中对象">
                        <button
                          disabled={busy}
                          aria-label="向左移动10像素"
                          onClick={() => void move(selected.geometry.x - 10, selected.geometry.y)}
                        >
                          ←
                        </button>
                        <button
                          disabled={busy}
                          aria-label="向上移动10像素"
                          onClick={() => void move(selected.geometry.x, selected.geometry.y - 10)}
                        >
                          ↑
                        </button>
                        <button
                          disabled={busy}
                          aria-label="向下移动10像素"
                          onClick={() => void move(selected.geometry.x, selected.geometry.y + 10)}
                        >
                          ↓
                        </button>
                        <button
                          disabled={busy}
                          aria-label="向右移动10像素"
                          onClick={() => void move(selected.geometry.x + 10, selected.geometry.y)}
                        >
                          →
                        </button>
                      </div>
                      <p className="property-note">支持拖动与键盘微调；宽高只读，缩放尚未接入。</p>
                    </>
                  )
                ) : (
                  <>
                    <h2>留出空间，给好想法。</h2>
                    <p className="inspector-help">选择文字或形状，查看和编辑它的属性。</p>
                  </>
                )}
                <section className="property-section">
                  <button
                    data-testid="demo-delete-element"
                    className="destructive full"
                    disabled={busy || !selected}
                    onClick={() => void removeElement()}
                  >
                    <Icon name="trash" />
                    删除对象
                  </button>
                  <button
                    data-testid="demo-delete-slide"
                    className="subtle full"
                    disabled={busy || (document?.slides.length ?? 0) <= 1}
                    onClick={() => showModal('delete-slide')}
                  >
                    删除当前幻灯片
                  </button>
                </section>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <span>Demo 0.2A · 本地文档</span>
        <output role="status" aria-live="polite" data-testid="document-status">
          {message}
        </output>
        <span className="status-end">{fileStatus?.fileName ?? '尚未命名的文件'}</span>
        <button
          data-testid="document-reload"
          disabled={busy}
          onClick={() => setReload((value) => value + 1)}
        >
          读取最新
        </button>
        <output className="sr-only" data-testid="document-revision">
          {document?.revision ?? '—'}
        </output>
      </footer>
      <dialog
        ref={dialogRef}
        aria-labelledby="studio-dialog-title"
        onCancel={() => setModal(null)}
        onClose={() => {
          setModal(null);
          pendingFocus.current = invoker.current;
        }}
      >
        <h2 id="studio-dialog-title">
          {modal === 'menu'
            ? '文档与工作区'
            : modal === 'save-drafts'
              ? '还有未应用的文本输入'
              : modal === 'open-drafts'
                ? '保留当前输入，还是继续？'
                : '删除当前幻灯片？'}
        </h2>
        {modal === 'menu' ? (
          <div className="menu-list">
            {(
              [
                'newDocument',
                'openDocument',
                'saveDocument',
                'saveDocumentAs',
                'importHtml',
                'exportHtml',
              ] as const
            ).map((operation) => (
              <button key={operation} disabled={busy} onClick={() => void fileAction(operation)}>
                <Icon
                  name={
                    operation === 'openDocument' || operation === 'importHtml' ? 'folder' : 'save'
                  }
                />
                {fileLabels[operation]}
                <span>
                  {operation === 'newDocument'
                    ? 'Ctrl / Cmd + N'
                    : operation === 'openDocument'
                      ? 'Ctrl / Cmd + O'
                      : operation === 'saveDocument'
                        ? 'Ctrl / Cmd + S'
                        : operation === 'saveDocumentAs'
                          ? 'Ctrl / Cmd + Shift + S'
                          : '单文件多页演示文稿'}
                </span>
              </button>
            ))}
            <p className="property-note">
              方向键移动 1 px；Shift + 方向键移动 10 px。输入框保留原生编辑快捷键。
            </p>
          </div>
        ) : (
          <p>
            {modal === 'save-drafts'
              ? '应用所有待提交文本后继续。文件操作取消或失败时，已应用的修改仍保留在当前文档中。'
              : modal === 'open-drafts'
                ? '只有成功新建或打开文档后才清除当前输入。取消操作会完整保留草稿。'
                : '本轮暂不支持从界面撤销此操作。其他幻灯片会保留。'}
          </p>
        )}
        <div className="dialog-actions">
          <button onClick={closeModal}>取消</button>
          {modal === 'save-drafts' ? (
            <button
              className="primary"
              onClick={() => void fileAction(pendingFileOperation.current, true)}
            >
              应用文本并继续
            </button>
          ) : modal === 'open-drafts' ? (
            <button
              className="primary"
              onClick={() => void fileAction(pendingFileOperation.current, true)}
            >
              继续操作
            </button>
          ) : modal === 'delete-slide' ? (
            <button
              className="primary"
              onClick={() => {
                closeModal();
                void deleteSlide();
              }}
            >
              确认删除
            </button>
          ) : null}
        </div>
      </dialog>
    </section>
  );
}
