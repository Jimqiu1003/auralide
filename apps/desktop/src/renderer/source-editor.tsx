import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Element, Presentation, Slide } from '@auralide/core';
import type {
  SourceChange,
  SourceRequest,
  SourceSelection,
  SourceSnapshot,
  SourceStyles,
} from '../shared/source-editing.js';
import type { FileResult } from '../shared/document-files.js';

export function SourceEditor({
  open,
  document,
  slide,
  element,
  onClose,
  onChanged,
  onDraftsChange,
}: {
  open: boolean;
  document: Presentation;
  slide: Slide;
  element: Extract<Element, { kind: 'source' }>;
  onClose: () => void;
  onChanged: (document: Presentation) => Promise<void>;
  onDraftsChange: (pending: boolean) => void;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null),
    surface = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLSelectElement>(null);
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null),
    [selection, setSelection] = useState<SourceSelection | null>(null);
  const [tab, setTab] = useState<'visual' | 'source'>('visual'),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState('正在准备内部编辑…'),
    [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(''),
    [text, setText] = useState(''),
    [code, setCode] = useState('');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const lock = useRef(false),
    mounted = useRef(false),
    lastMove = useRef(-1),
    selectedId = useRef('');
  const textDrafts = useRef(new Map<string, string>()),
    codeDrafts = useRef(new Map<string, string>());
  const textBases = useRef(new Map<string, string>()),
    codeBases = useRef(new Map<string, string>()),
    loadSequence = useRef(0);
  const [textConflict, setTextConflict] = useState(false),
    [codeConflict, setCodeConflict] = useState(false);
  const key = (id: string): string => element.id + '/' + id;
  const sourceRequest = (value: SourceSnapshot): SourceRequest => ({
    expectedRevision: value.document.revision,
    expectedSourceRevision: value.sourceRevision,
    slideId: slide.id,
    elementId: element.id,
  });
  const select = (value: SourceSelection): void => {
    setSelection(value);
    if (selectedId.current !== value.nodeId) {
      selectedId.current = value.nodeId;
      setText(textDrafts.current.get(key(value.nodeId)) ?? value.text);
      setTextConflict(
        textDrafts.current.has(key(value.nodeId)) &&
          textBases.current.get(key(value.nodeId)) !== value.text,
      );
    }
  };
  const load = async (value: Presentation): Promise<void> => {
    if (!mounted.current) return;
    const sequence = ++loadSequence.current;
    const source = value.slides
      .find((s) => s.id === slide.id)
      ?.elements.find((e) => e.id === element.id);
    if (source?.kind !== 'source') {
      setMessage('源码组件已删除。');
      return;
    }
    const result = await window.auralide!.openSourceEditor({
      expectedRevision: value.revision,
      expectedSourceRevision: source.sourceRevision,
      slideId: slide.id,
      elementId: element.id,
    });
    if (!mounted.current || sequence !== loadSequence.current) return;
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setSnapshot(result.value);
    setCode(codeDrafts.current.get(element.id) ?? result.value.html);
    const conflict =
      codeDrafts.current.has(element.id) &&
      codeBases.current.get(element.id) !== result.value.assetId;
    setCodeConflict(conflict);
    setHistory(await window.auralide!.getDocumentStatus());
    if (selectedId.current && result.value.nodes.some((n) => n.id === selectedId.current)) {
      const chosen = await window.auralide!.selectSourceNode({
        ...sourceRequest(result.value),
        nodeId: selectedId.current,
      });
      if (chosen.ok && sequence === loadSequence.current) {
        setSelection(chosen.value);
        setText(textDrafts.current.get(key(chosen.value.nodeId)) ?? chosen.value.text);
        setTextConflict(
          textDrafts.current.has(key(chosen.value.nodeId)) &&
            textBases.current.get(key(chosen.value.nodeId)) !== chosen.value.text,
        );
      }
    } else {
      selectedId.current = '';
      setSelection(null);
    }
    setMessage(
      conflict
        ? '源码已有其他修改，旧输入已保留。请复制需要保留的内容，撤回输入后基于最新源码重新编辑。'
        : '点击预览或使用节点列表选择；拖动调整偏移，Tab 返回属性区。',
    );
  };
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    mounted.current = true;
    if (!dialog.current?.open) dialog.current?.showModal();
    setPending(true);
    void load(document)
      .catch((error) => {
        if (!cancelled) setMessage(String(error));
      })
      .finally(() => {
        if (!cancelled && mounted.current) setPending(false);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      loadSequence.current++;
      void window.auralide?.closeSourceEditor();
    };
    // Revisions are adopted only by successful edits or an explicit refresh, preserving drafts.
  }, [open, element.id, attempt]);
  useEffect(() => onDraftsChange(!!(textDrafts.current.size || codeDrafts.current.size)));
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent): void => {
      if (textDrafts.current.size || codeDrafts.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  useLayoutEffect(() => {
    const element = surface.current,
      bridge = window.auralide;
    if (!element || !bridge || !open) return;
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        void bridge
          .sourceSetBounds({
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
            visible: !!snapshot && !pending && tab === 'visual' && !globalThis.document.hidden,
          })
          .catch(() => setMessage('预览布局无法更新。'));
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    globalThis.document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      globalThis.document.removeEventListener('visibilitychange', update);
      void bridge.sourceSetBounds({ x: 0, y: 0, width: 0, height: 0, visible: false });
    };
  }, [open, snapshot, pending, tab]);
  const transact = async (action: () => Promise<FileResult>, clear?: () => void): Promise<void> => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error.message + ' 当前输入已保留。');
        return;
      }
      clear?.();
      await onChanged(result.value.document);
      await load(result.value.document);
    } catch (error) {
      setMessage(String(error) + ' 当前输入已保留。');
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const change = (value: SourceChange, clear?: () => void): Promise<void> => {
    if (!snapshot || !window.auralide) return Promise.resolve();
    if (value.type !== 'source' && codeDrafts.current.has(element.id)) {
      setMessage('请先应用或撤回源码输入，再修改可视对象。');
      return Promise.resolve();
    }
    return transact(
      () => window.auralide!.editSource({ ...sourceRequest(snapshot), change: value }),
      clear,
    );
  };
  const styles = (value: SourceStyles): Promise<void> =>
    selection
      ? change({ type: 'style', nodeId: selection.nodeId, styles: value })
      : Promise.resolve();
  useEffect(() => {
    if (!open || !snapshot) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async (): Promise<void> => {
      if (cancelled) return;
      try {
        if (!lock.current && !pending) {
          const result = await window.auralide!.getSourceSelection(sourceRequest(snapshot));
          if (result.ok && !cancelled) {
            if (result.value.escape) {
              dialog.current?.close();
              return;
            }
            if (result.value.focus) picker.current?.focus();
            if (result.value.selection) select(result.value.selection);
            const move = result.value.move;
            if (move && move.sequence !== lastMove.current) {
              lastMove.current = move.sequence;
              await change({
                type: 'style',
                nodeId: move.nodeId,
                styles: { offsetX: move.offsetX, offsetY: move.offsetY },
              });
            }
          } else if (!result.ok && !cancelled) setMessage(result.error.message);
        }
      } catch {
        if (!cancelled) setMessage('无法读取预览选择，请刷新。');
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 250);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Polling is scoped to the exact source snapshot; edited drafts are held in refs.
  }, [open, snapshot, pending]);
  const choose = async (nodeId: string): Promise<void> => {
    if (!snapshot) return;
    const result = await window.auralide!.selectSourceNode({ ...sourceRequest(snapshot), nodeId });
    if (result.ok) select(result.value);
    else setMessage(result.error.message);
  };
  const historyAction = async (direction: 'undo' | 'redo'): Promise<void> => {
    if (!snapshot || lock.current) return;
    if (textDrafts.current.size || codeDrafts.current.size) {
      setMessage('请先应用或撤回未应用输入，再撤销或重做。');
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      const result = await window.auralide!.editHistory({
        direction,
        expectedRevision: snapshot.document.revision,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      await onChanged(result.value);
      await load(result.value);
    } catch (error) {
      setMessage(String(error));
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const replace = async (kind: 'image' | 'font'): Promise<void> => {
    if (!snapshot || !selection) return;
    if (codeDrafts.current.has(element.id)) {
      setMessage('请先应用或撤回源码输入，再替换素材。');
      return;
    }
    await transact(() =>
      window.auralide!.replaceSourceAsset({
        ...sourceRequest(snapshot),
        nodeId: selection.nodeId,
        kind,
      }),
    );
  };
  const numeric = (
    name: keyof SourceStyles,
    label: string,
    min: number,
    max: number,
  ): JSX.Element | null =>
    selection ? (
      <label>
        {label}
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step="any"
          key={selection.nodeId + '-' + snapshot?.sourceRevision + '-' + name}
          defaultValue={selection.styles[name]}
          onBlur={(event) => {
            const number = event.currentTarget.valueAsNumber;
            if (!event.currentTarget.validity.valid || !Number.isFinite(number)) {
              event.currentTarget.value = String(selection.styles[name]);
              setMessage(label + '无效，已保留原值。');
              return;
            }
            if (number !== selection.styles[name]) void styles({ [name]: number });
          }}
        />
      </label>
    ) : null;
  const options =
    snapshot?.nodes
      .filter((node) =>
        (node.tag + ' ' + node.text + ' ' + node.id).toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, 200) ?? [];
  if (selection && !options.some((node) => node.id === selection.nodeId)) {
    const item = snapshot?.nodes.find((node) => node.id === selection.nodeId);
    if (item) options.unshift(item);
  }
  return (
    <dialog
      className="source-editor-dialog"
      ref={dialog}
      data-testid="source-editor-dialog"
      aria-labelledby="source-editor-title"
      onKeyDown={(event) => event.stopPropagation()}
      onClose={() => {
        void window.auralide?.closeSourceEditor();
        onClose();
      }}
    >
      <header className="source-editor-heading">
        <h2 id="source-editor-title">HTML 内部编辑</h2>
        <button onClick={() => dialog.current?.close()}>关闭内部编辑</button>
      </header>
      <nav aria-label="源码编辑模式">
        <button aria-pressed={tab === 'visual'} onClick={() => setTab('visual')}>
          可视编辑
        </button>
        <button aria-pressed={tab === 'source'} onClick={() => setTab('source')}>
          源码
        </button>
        <button disabled={pending || !history.canUndo} onClick={() => void historyAction('undo')}>
          撤销源码修改
        </button>
        <button disabled={pending || !history.canRedo} onClick={() => void historyAction('redo')}>
          重做源码修改
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setPending(true);
            void window
              .auralide!.getDocument()
              .then(async (value) => {
                await onChanged(value);
                if (mounted.current) setAttempt((n) => n + 1);
              })
              .catch((error) => {
                setMessage(String(error));
                setPending(false);
              });
          }}
        >
          读取最新源码
        </button>
      </nav>
      <p className="property-note">
        内部预览禁用源脚本；动态图表与 Canvas/WebGL 通过源码修改，在离线播放器中检查效果。
      </p>
      <div className="source-editor-body" hidden={tab !== 'visual'}>
        <div className="source-editor-preview">
          <div
            className="source-editor-surface"
            ref={surface}
            style={{ aspectRatio: `${snapshot?.width ?? 1280}/${snapshot?.height ?? 720}` }}
            aria-label="隔离的 HTML 内部编辑预览"
          />
        </div>
        <fieldset className="source-editor-properties" disabled={pending || !snapshot}>
          <legend>内部元素属性</legend>
          <label>
            查找节点
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>
            源码节点
            <select
              ref={picker}
              aria-label="源码节点"
              value={selection?.nodeId ?? ''}
              onChange={(event) => void choose(event.target.value)}
            >
              <option value="">选择内部元素</option>
              {options.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.tag} · {node.text.replace(/\s+/g, ' ').slice(0, 40) || node.id}
                </option>
              ))}
            </select>
          </label>
          {selection && (
            <>
              {selection.editableText && (
                <>
                  <label>
                    节点文字
                    <textarea
                      aria-label="节点文字"
                      rows={3}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        const id = key(selection.nodeId);
                        if (event.target.value === selection.text) {
                          textDrafts.current.delete(id);
                          textBases.current.delete(id);
                          setTextConflict(false);
                        } else {
                          if (!textDrafts.current.has(id))
                            textBases.current.set(id, selection.text);
                          textDrafts.current.set(id, event.target.value);
                        }
                      }}
                    />
                  </label>
                  <button
                    disabled={textConflict}
                    onClick={() =>
                      void change({ type: 'text', nodeId: selection.nodeId, text }, () => {
                        textDrafts.current.delete(key(selection.nodeId));
                        textBases.current.delete(key(selection.nodeId));
                      })
                    }
                  >
                    应用节点文字
                  </button>
                  <button
                    onClick={() => {
                      textDrafts.current.delete(key(selection.nodeId));
                      textBases.current.delete(key(selection.nodeId));
                      setTextConflict(false);
                      setText(selection.text);
                    }}
                  >
                    撤回节点文字输入
                  </button>
                  {textConflict && (
                    <p role="alert">
                      节点文字已改变，旧输入已保留。请复制后撤回，基于最新文字重新编辑。
                    </p>
                  )}
                </>
              )}
              {selection.tag === 'img' && (
                <button onClick={() => void replace('image')}>替换内部图片</button>
              )}
              <button onClick={() => void replace('font')}>为节点嵌入字体</button>
              <label>
                字体
                <input
                  aria-label="节点字体"
                  key={selection.nodeId + '-' + snapshot?.sourceRevision + '-family'}
                  defaultValue={selection.styles.fontFamily}
                  onBlur={(event) => {
                    if (event.target.value !== selection.styles.fontFamily)
                      void styles({ fontFamily: event.target.value });
                  }}
                />
              </label>
              <div className="source-property-grid">
                {numeric('fontSize', '节点字号（px）', 1, 100000)}
                {numeric('opacity', '节点透明度', 0, 1)}
                {numeric('width', '节点宽度（px）', 1, 100000)}
                {numeric('height', '节点高度（px）', 1, 100000)}
                {numeric('offsetX', '相对水平偏移（px）', -1000000, 1000000)}
                {numeric('offsetY', '相对垂直偏移（px）', -1000000, 1000000)}
              </div>
              {(['color', 'backgroundColor', 'borderColor'] as const).map((name, index) => (
                <label key={name}>
                  {['节点文字颜色', '节点背景颜色', '节点边框颜色'][index]}
                  <input
                    aria-label={['节点文字颜色', '节点背景颜色', '节点边框颜色'][index]}
                    key={selection.nodeId + '-' + snapshot?.sourceRevision + name}
                    defaultValue={selection.styles[name]}
                    onBlur={(event) => {
                      if (event.target.value !== selection.styles[name])
                        void styles({ [name]: event.target.value });
                    }}
                  />
                </label>
              ))}
              {numeric('borderWidth', '节点边框宽度（px）', 0, 100)}
              <label>
                节点边框样式
                <select
                  aria-label="节点边框样式"
                  value={selection.styles.borderStyle}
                  onChange={(event) =>
                    void styles({ borderStyle: event.target.value as SourceStyles['borderStyle'] })
                  }
                >
                  {['none', 'solid', 'dashed', 'dotted', 'double'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                节点文字对齐
                <select
                  aria-label="节点文字对齐"
                  value={selection.styles.textAlign}
                  onChange={(event) =>
                    void styles({ textAlign: event.target.value as SourceStyles['textAlign'] })
                  }
                >
                  <option value="left">左</option>
                  <option value="center">居中</option>
                  <option value="right">右</option>
                </select>
              </label>
            </>
          )}
        </fieldset>
      </div>
      <div className="source-code-panel" hidden={tab !== 'source'}>
        <label>
          HTML 源码
          <textarea
            aria-label="HTML 源码"
            spellCheck={false}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (event.target.value === snapshot?.html) {
                codeDrafts.current.delete(element.id);
                codeBases.current.delete(element.id);
                setCodeConflict(false);
              } else {
                if (!codeDrafts.current.has(element.id) && snapshot)
                  codeBases.current.set(element.id, snapshot.assetId);
                codeDrafts.current.set(element.id, event.target.value);
              }
            }}
          />
        </label>
        <button
          disabled={pending || !snapshot || codeConflict}
          onClick={() => {
            if (textDrafts.current.size) {
              setMessage('请先应用或撤回节点文字输入。');
              return;
            }
            void change({ type: 'source', html: code }, () => {
              codeDrafts.current.delete(element.id);
              codeBases.current.delete(element.id);
            });
          }}
        >
          应用源码并检查资源
        </button>
        <button
          disabled={pending || !snapshot}
          onClick={() => {
            codeDrafts.current.delete(element.id);
            codeBases.current.delete(element.id);
            setCodeConflict(false);
            setCode(snapshot?.html ?? '');
          }}
        >
          撤回源码输入
        </button>
        <p className="property-note">
          源码替换会生成新版本并检查依赖；未应用输入在本次会话保留。新相对路径需要授权素材目录。
        </p>
      </div>
      <output
        className="source-editor-status"
        aria-live="polite"
        data-testid="source-editor-status"
      >
        {pending ? '正在验证与更新源码…' : message}
      </output>
    </dialog>
  );
}
