import { useState } from 'react';
import type { Element, Presentation, Slide } from '@auralide/core';
import type { JSX } from 'react';

export function BundleControls({
  document,
  slide,
  selected,
  busy,
  onChange,
  onMessage,
  updateProperties,
  updateSlide,
  onEditSource,
  onPlay,
}: {
  document: Presentation;
  slide: Slide;
  selected: Element | undefined;
  busy: boolean;
  onChange: (document: Presentation) => Promise<void>;
  onMessage: (message: string) => void;
  updateProperties: (payload: unknown) => Promise<void>;
  updateSlide: (transition: 'none' | 'fade' | 'slide') => Promise<void>;
  onEditSource: () => void;
  onPlay: () => Promise<void>;
}): JSX.Element {
  const [kind, setKind] = useState<'image' | 'audio' | 'video' | 'font'>('image');
  const [pending, setPending] = useState(false);
  const insert = async (replace = false): Promise<void> => {
    const bridge = window.auralide;
    if (!bridge || pending) return;
    setPending(true);
    try {
      const result = await bridge.insertAsset({
        expectedRevision: document.revision,
        slideId: slide.id,
        kind,
        ...((replace || kind === 'font') && selected ? { elementId: selected.id } : {}),
      });
      if (result.ok) {
        await onChange(result.value.document);
        onMessage('素材已加入文档，可随 HTML 一起离线封装。');
      } else onMessage(result.error.message);
    } catch {
      onMessage('素材操作失败，当前文档已保留。');
    } finally {
      setPending(false);
    }
  };
  const entrance = selected?.entrance ?? {
    effect: 'none' as const,
    trigger: 'page' as const,
    duration: 300,
  };
  return (
    <fieldset className="property-section bundle-controls" disabled={busy || pending}>
      <legend>素材与动态演示</legend>
      {selected?.kind === 'source' && (
        <button type="button" data-testid="edit-source-elements" onClick={onEditSource}>
          编辑 HTML 内部元素
        </button>
      )}
      <label>
        素材类型
        <select
          aria-label="素材类型"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="image">图片</option>
          <option value="audio">音频</option>
          <option value="video">视频</option>
          <option value="font">字体（选中文字）</option>
        </select>
      </label>
      <div className="move-pad">
        <button type="button" onClick={() => void insert()}>
          选择素材文件
        </button>
        {selected && selected.kind === kind && (
          <button type="button" onClick={() => void insert(true)}>
            替换素材
          </button>
        )}
      </div>
      <label>
        页面转场
        <select
          aria-label="页面转场"
          value={slide.transition ?? 'none'}
          onChange={(e) => void updateSlide(e.target.value as 'none' | 'fade' | 'slide')}
        >
          <option value="none">无</option>
          <option value="fade">淡入</option>
          <option value="slide">滑入</option>
        </select>
      </label>
      {selected && (
        <>
          <label>
            对象入场
            <select
              aria-label="对象入场"
              value={entrance.effect}
              onChange={(e) =>
                void updateProperties({ entrance: { ...entrance, effect: e.target.value } })
              }
            >
              <option value="none">无</option>
              <option value="fade">淡入</option>
              <option value="slide">滑入</option>
            </select>
          </label>
          <label>
            入场触发
            <select
              aria-label="入场触发"
              value={entrance.trigger}
              onChange={(e) =>
                void updateProperties({ entrance: { ...entrance, trigger: e.target.value } })
              }
            >
              <option value="page">进入页面</option>
              <option value="click">点击下一步</option>
            </select>
          </label>
          <label>
            入场时长（毫秒）
            <input
              aria-label="入场时长（毫秒）"
              type="number"
              min="0"
              max="10000"
              defaultValue={entrance.duration}
              key={selected.id + entrance.duration}
              onBlur={(e) => {
                const duration = Number(e.target.value);
                if (
                  e.target.value !== '' &&
                  Number.isFinite(duration) &&
                  duration >= 0 &&
                  duration <= 10000 &&
                  duration !== entrance.duration
                )
                  void updateProperties({ entrance: { ...entrance, duration } });
              }}
            />
          </label>
        </>
      )}
      <button type="button" onClick={() => void onPlay()}>
        打开离线封装播放器
      </button>
      <p className="property-note">单文件 HTML 上限 100 MiB；源 HTML 脚本在播放器中由你启用。</p>
    </fieldset>
  );
}
