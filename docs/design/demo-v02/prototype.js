// Standalone design simulation. This file never calls the production bridge, Core or filesystem.
/* global document, structuredClone, getComputedStyle, matchMedia, FormData, setTimeout, ResizeObserver */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const paths = {
    cursor: 'm5 3 13 9-6 1-3 6z',
    text: 'M4 5h16M12 5v15M8 20h8',
    shape: 'M5 4h14v15H5z',
    slide: 'M3 5h18v13H3zM8 21h8M12 18v3',
    folder: 'M3 7V5h6l2 2h10v12H3z',
    save: 'M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8',
    undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
    redo: 'm15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12',
    plus: 'M12 5v14M5 12h14',
    trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    compass: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-3-2 5-4 1 2-5z',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6',
    fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M7 7h10v10H7z',
    align: 'M4 5h16M4 10h10M4 15h16M4 20h10',
    layers: 'm12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5',
    sliders: 'M5 3v5M5 12v9M12 3v10M12 17v4M19 3v3M19 10v11M2 8h6M9 13h6M16 6h6',
  };
  const icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.shape}"/></svg>`;
  const text = (id, name, value, x, y, w, h, size, color = '#273345', weight = 400) => ({
    id,
    name,
    kind: 'text',
    text: value,
    x,
    y,
    w,
    h,
    size,
    color,
    weight,
    align: 'left',
  });
  const shape = (id, name, x, y, w, h, color, radius = 0) => ({
    id,
    name,
    kind: 'shape',
    x,
    y,
    w,
    h,
    color,
    radius,
  });
  const fixture = () => [
    {
      id: 'cover',
      name: '封面',
      background: '#f6f3ec',
      elements: [
        text('edition', '刊头', 'AURALIDE  /  CREATIVE NOTES', 68, 56, 700, 30, 16, '#5b625f', 500),
        text(
          'title',
          '主标题',
          '把想法，变成\n下一次出发。',
          68,
          178,
          770,
          190,
          70,
          '#253447',
          600,
        ),
        text(
          'subtitle',
          '副标题',
          '从一个灵感，到一场值得分享的演示。\n自由表达，也让每一次修改清晰可见。',
          72,
          431,
          700,
          90,
          24,
          '#5b625f',
        ),
        shape('orange', '暖橙色块', 916, 100, 250, 332, '#cf6a42', 4),
        shape('navy', '深蓝色块', 850, 388, 250, 170, '#2d4355', 4),
        shape('circle', '圆形', 1000, 150, 116, 116, '#f1c6a7', 58),
        text('caption', '图形注释', 'IDEAS\nIN MOTION.', 945, 302, 210, 80, 24, '#111827', 500),
        text('footer', '页脚', '本地创作  ·  开放表达', 72, 643, 600, 28, 16, '#5b625f'),
        text('page', '页码', '01 — 03', 1085, 642, 130, 28, 16, '#5b625f'),
      ],
    },
    {
      id: 'principles',
      name: '三个创作原则',
      background: '#f6f3ec',
      elements: [
        text('section', '章节', '01 / THE WAY WE CREATE', 68, 54, 700, 30, 16, '#5b625f', 500),
        text('title', '主标题', '让创作回到内容本身。', 68, 125, 1140, 100, 58, '#253447', 600),
        shape('rule', '分隔线', 72, 256, 1136, 2, '#adb4ad'),
        text('n1', '原则一编号', '01', 72, 315, 100, 70, 42, '#b14c27', 500),
        text('h1', '原则一标题', '自由表达', 72, 412, 310, 60, 34, '#253447', 600),
        text(
          'p1',
          '原则一内容',
          '文字、图形与布局，\n为你的想法留出空间。',
          72,
          490,
          310,
          90,
          23,
          '#5b625f',
        ),
        text('n2', '原则二编号', '02', 470, 315, 100, 70, 42, '#b14c27', 500),
        text('h2', '原则二标题', '始终在本地', 470, 412, 320, 60, 34, '#253447', 600),
        text(
          'p2',
          '原则二内容',
          '文件属于你。\n灵感不必等待网络连接。',
          470,
          490,
          320,
          90,
          23,
          '#5b625f',
        ),
        text('n3', '原则三编号', '03', 867, 315, 100, 70, 42, '#b14c27', 500),
        text('h3', '原则三标题', '清晰的每一步', 867, 412, 340, 60, 34, '#253447', 600),
        text(
          'p3',
          '原则三内容',
          '人和 Agent 共同创作，\n所有改变都应该可理解。',
          867,
          490,
          340,
          90,
          23,
          '#5b625f',
        ),
      ],
    },
    {
      id: 'next',
      name: '下一步，一起出发',
      background: '#2d4355',
      elements: [
        text('section', '章节', '02 / WHAT COMES NEXT', 68, 56, 700, 30, 16, '#d0dbdf', 500),
        text(
          'title',
          '主标题',
          '好的工具，\n让想法走得更远。',
          68,
          180,
          1100,
          200,
          66,
          '#fff6e9',
          600,
        ),
        shape('accent', '强调线', 72, 442, 140, 6, '#e6a27e'),
        text('subtitle', '副标题', '从这一页开始。', 72, 492, 800, 70, 28, '#d0dbdf'),
        text(
          'footer',
          '页脚',
          'AURALIDE  /  YOUR NEXT PRESENTATION',
          72,
          644,
          1000,
          30,
          16,
          '#d0dbdf',
          500,
        ),
      ],
    },
  ];
  let deck = fixture();
  let slideIndex = 0;
  let selected = [];
  let revision = 0;
  let saved = null;
  let workspace = 'editor';
  let inspectorTab = 'design';
  let zoom = 1;
  let auraMode = 'preview';
  let themeChoice = 'light';
  let undoStack = [];
  let redoStack = [];
  let dialogInvoker = null;
  let busy = false;
  const drafts = new Map();
  const draftKey = () => `${slide().id}/${selected[0]}`;
  const clone = (value) => structuredClone(value);
  const slide = () => deck[slideIndex];
  const objects = () => slide().elements.filter((item) => selected.includes(item.id));
  const dirty = () => saved === null || JSON.stringify(deck) !== JSON.stringify(saved);
  const status = (message) => {
    $('#status').textContent = message;
  };
  function dispatchSimulation(change, message) {
    undoStack.push(clone(deck));
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
    change();
    revision++;
    render();
    status(`原型模拟 · ${message}`);
  }
  function renderIcons() {
    $$('[data-icon]').forEach((el) => {
      el.innerHTML = icon(el.dataset.icon);
    });
  }
  function svgContent(item) {
    if (item.kind === 'shape')
      return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="${item.radius ?? 0}" fill="${item.color}"/>`;
    const lineHeight = item.size * 1.3;
    const x = item.x + (item.align === 'center' ? item.w / 2 : item.align === 'right' ? item.w : 0);
    const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start';
    return `<text font-family="'Segoe UI','Microsoft YaHei',sans-serif" font-size="${item.size}" font-weight="${item.weight}" fill="${item.color}" text-anchor="${anchor}">${item.text
      .split('\n')
      .map(
        (line, index) =>
          `<tspan x="${x}" y="${item.y + item.size + index * lineHeight}">${escape(line)}</tspan>`,
      )
      .join('')}</text>`;
  }
  function slideSvg(current, interactive = false) {
    return `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg" ${interactive ? 'aria-label="当前幻灯片对象"' : 'aria-hidden="true"'}><rect width="1280" height="720" fill="${current.background}"/>${current.elements
      .map((item) => {
        if (!interactive) return svgContent(item);
        const active = selected.includes(item.id);
        const corners = [
          [item.x, item.y],
          [item.x + item.w, item.y],
          [item.x, item.y + item.h],
          [item.x + item.w, item.y + item.h],
        ];
        return `<g class="slide-object" data-select="${item.id}" tabindex="0" role="button" aria-label="${escape(item.name)}，${item.kind === 'text' ? '文本' : '形状'}" aria-pressed="${active}"><rect class="object-focus-halo" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="transparent" stroke="transparent"/><rect class="object-focus" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="transparent" stroke="transparent"/>${svgContent(item)}${active ? `<rect class="selection-halo" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"/><rect class="selection-outline" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"/>${corners.map(([x, y]) => `<rect class="selection-handle" x="${x - 4}" y="${y - 4}" width="8" height="8"/>`).join('')}` : ''}</g>`;
      })
      .join('')}</svg>`;
  }
  function fitCanvas() {
    const stage = $('#stage');
    const frame = $('.slide-frame');
    if (!frame || stage.hidden) return;
    const style = getComputedStyle(stage);
    const width =
      stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height =
      stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    frame.style.width = `${Math.max(1, Math.min(width, (height * 16) / 9)) * zoom}px`;
    $$('[data-zoom]').forEach((el) => {
      el.textContent = zoom === 1 ? '适应' : Math.round(zoom * 100) + '%';
    });
  }
  function renderNavigation() {
    $('#slide-list').innerHTML = deck
      .map(
        (item, index) =>
          `<button class="slide-card" data-slide="${index}" aria-label="幻灯片 ${index + 1}：${escape(item.name)}" aria-pressed="${index === slideIndex}"><span class="slide-number">${index + 1}</span><span class="thumb">${slideSvg(item)}</span><span class="slide-caption">${escape(item.name)}</span></button>`,
      )
      .join('');
    $('#layer-list').innerHTML = [...slide().elements]
      .reverse()
      .map(
        (item) =>
          `<button class="layer-item" data-select="${item.id}" aria-pressed="${selected.includes(item.id)}" aria-label="图层：${escape(item.name)}">${icon(item.kind === 'text' ? 'text' : 'shape')}<span class="layer-name">${escape(item.name)}</span>${document.body.classList.contains('a3') ? `<span class="layer-kind">${item.kind === 'text' ? 'T' : '◇'}</span>` : ''}</button>`,
      )
      .join('');
    $$('[data-slide-name]').forEach((el) => {
      el.textContent = `${String(slideIndex + 1).padStart(2, '0')} / ${slide().name}`;
    });
    $$('[data-page-label]').forEach((el) => {
      el.textContent = `幻灯片 ${slideIndex + 1} / ${deck.length}`;
    });
    $$('.count').forEach((el) => {
      el.textContent = deck.length;
    });
  }
  const numberField = (key, label, value, min, max) =>
    `<label class="input-unit"><span>${label}</span><input name="${key}" type="number" value="${value}" min="${min}" max="${max}" step="1" aria-label="${label}（px）" required/></label>`;
  function renderInspector() {
    const picked = objects();
    const root = $('#inspector');
    $$('[data-selection-label]').forEach((el) => {
      el.textContent = picked.length
        ? picked.length === 1
          ? `${picked[0].kind === 'text' ? '文本' : '形状'} · ${picked[0].name}`
          : `已选择 ${picked.length} 个对象`
        : '选择对象，开始创作';
    });
    const sizeLabel = $('[data-context-size]');
    if (sizeLabel)
      sizeLabel.textContent =
        picked.length === 1 && picked[0].kind === 'text' ? picked[0].size : '—';
    if (workspace === 'aura') {
      root.innerHTML = `<div class="selection-heading"><span class="type-symbol">${icon('shield')}</span><div><strong>Aura 工作区</strong><small>隔离预览 · 原型模拟</small></div></div><h2 class="empty-title">看见演示的另一面。</h2><p class="empty-description">预览当前幻灯片的内容。切回编辑器时，页面和对象选择都会保留。</p><section class="property-section"><h3 class="property-heading">预览边界</h3><div class="slide-details"><span>页面脚本</span><strong>禁用</strong></div><div class="slide-details"><span>网络连接</span><strong>禁用</strong></div><div class="slide-details"><span>文件与 Agent 权限</span><strong>未授予</strong></div><p class="property-note">这里是 sandbox iframe 设计模拟。正式应用继续使用 main 所有的 WebContentsView，不以该原型证明原生安全行为。</p></section><section class="property-section"><h3 class="property-heading">未来能力</h3><p class="property-note">Web Research 与外部 Agent 提案需要独立授权。本轮未启用。</p></section>`;
      return;
    }
    if (!picked.length) {
      root.innerHTML = `<div class="selection-heading"><span class="type-symbol">${icon('slide')}</span><div><strong>幻灯片</strong><small>${escape(slide().name)}</small></div></div><h2 class="empty-title">留出空间，给好想法。</h2><p class="empty-description">点击画布上的文字或形状，查看它的设计属性。也可以从图层中选择。</p><section class="property-section"><h3 class="property-heading">画布</h3><div class="slide-details"><span>尺寸</span><strong>1280 × 720 px</strong></div><div class="slide-details"><span>比例</span><strong>16:9</strong></div><div class="color-well"><span style="width:24px;height:24px;background:${slide().background};border:1px solid var(--control-line);border-radius:3px"></span><span class="color-value">${slide().background}</span><span class="tiny">背景</span></div></section><section class="property-section"><h3 class="property-heading">试一试</h3><p class="property-note">双击文字 → 在此编辑<br/>Shift 点击 → 多选对象<br/>方向键 → 微调 1 px<br/>Escape → 清除选择</p></section><p class="property-note">属性编辑、撤销及文件反馈均为内存模拟。</p>`;
      return;
    }
    if (picked.length > 1) {
      root.innerHTML = `<div class="selection-heading"><span class="type-symbol">${icon('layers')}</span><div><strong>${picked.length} 个对象</strong><small>多选 · 混合属性</small></div></div><h3 class="property-heading">共同操作</h3><p class="empty-description">使用方向键一起移动；Shift + 方向键移动 10 px。不同属性显示为混合，避免覆盖各自的设计。</p><div class="property-section"><button class="full" data-action="delete">${icon('trash')}删除选中对象（模拟）</button></div>`;
      return;
    }
    const item = { ...picked[0], ...drafts.get(draftKey()) };
    const geometry = `<section class="property-section"><h3 class="property-heading">位置与尺寸 <span class="tiny muted">px</span></h3><div class="field-row">${numberField('x', 'X', item.x, 0, 1280)}${numberField('y', 'Y', item.y, 0, 720)}</div><div class="field-row">${numberField('w', '宽', item.w, 16, 1280)}${numberField('h', '高', item.h, 16, 720)}</div></section>`;
    root.innerHTML = `<div class="selection-heading"><span class="type-symbol">${icon(item.kind === 'text' ? 'text' : 'shape')}</span><div><strong>${escape(item.name)}</strong><small>${item.kind === 'text' ? '文本' : '形状'} · 内存模拟</small></div></div><form id="property-form">${inspectorTab === 'design' ? (item.kind === 'text' ? `<section class="property-section"><h3 class="property-heading">文字</h3><label class="field-label" for="content">内容</label><textarea id="content" name="text" spellcheck="false" maxlength="1000" aria-describedby="text-help">${escape(item.text)}</textarea><p id="text-help" class="property-note">最多 1000 字；换行保留。</p><div class="field-row"><select name="weight" aria-label="字重"><option value="400" ${Number(item.weight) === 400 ? 'selected' : ''}>常规</option><option value="500" ${Number(item.weight) === 500 ? 'selected' : ''}>中等</option><option value="600" ${item.weight >= 600 ? 'selected' : ''}>半粗体</option></select>${numberField('size', '字号', item.size, 10, 120)}</div><div class="field-row"><select name="align" aria-label="文字对齐"><option value="left" ${item.align === 'left' ? 'selected' : ''}>左对齐</option><option value="center" ${item.align === 'center' ? 'selected' : ''}>居中</option><option value="right" ${item.align === 'right' ? 'selected' : ''}>右对齐</option></select></div></section>` : `<section class="property-section"><h3 class="property-heading">形状</h3><p class="property-note">圆角矩形 · 拖动对象或通过排列属性调整。</p>${numberField('radius', '圆角', item.radius ?? 0, 0, 200)}</section>`) + `<section class="property-section"><h3 class="property-heading">${item.kind === 'text' ? '文字颜色' : '填充'}</h3><label class="color-well"><input type="color" name="color" value="${item.color}" aria-label="${item.kind === 'text' ? '文字颜色' : '填充颜色'}"/><span class="color-value">${item.color}</span><span class="tiny">100%</span></label></section>` : geometry}<button class="apply-properties" type="submit">应用${inspectorTab === 'design' ? '设计' : '排列'}修改 <span class="tiny muted">模拟</span></button><p class="property-note">Enter 应用 · Escape 撤回未应用的输入<br/>尺寸手柄为视觉示意，请在「排列」修改尺寸。</p></form>`;
  }
  function renderAura() {
    const focusMode = document.activeElement?.dataset?.auraMode;
    const panel = $('#aura-panel');
    if (workspace !== 'aura') {
      panel.replaceChildren();
      return;
    }
    panel.innerHTML = `<div class="aura-tabs"><button data-aura-mode="preview" aria-pressed="${auraMode === 'preview'}">${icon('slide')}当前幻灯片</button><button data-aura-mode="lab" aria-pressed="${auraMode === 'lab'}">HTML Lab 示例</button><button disabled title="Web Research 尚未实现">Web Research · 未启用</button></div><div class="aura-address">${icon('shield')}<span class="origin">${auraMode === 'preview' ? `auralide-preview / ${escape(slide().name)}` : 'auralide-lab / 受控示例'}</span><span class="safe-label">隔离预览</span></div><iframe title="Aura 隔离预览原型" sandbox="" referrerpolicy="no-referrer"></iframe><div class="aura-foot">${icon('shield')}无脚本 · 无网络 · 原型模拟<button data-workspace="editor">返回编辑器 ↗</button></div>`;
    const content =
      auraMode === 'preview'
        ? slideSvg(slide())
        : `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#f6f3ec"/><text x="80" y="180" font-family="sans-serif" font-size="54" fill="#253447">HTML Lab / 受控示例</text><rect x="80" y="260" width="340" height="280" rx="8" fill="#cf6a42"/><rect x="470" y="260" width="730" height="130" rx="8" fill="#2d4355"/><rect x="470" y="420" width="730" height="120" rx="8" fill="#dfd8ca"/></svg>`;
    panel.querySelector('iframe').srcdoc =
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{height:100%;margin:0;background:#e7e7e9}body{display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}svg{width:100%;max-height:100%;display:block}</style></head><body>${content}<section style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"><h1>${escape(slide().name)}</h1>${
        auraMode === 'preview'
          ? slide()
              .elements.filter((item) => item.kind === 'text')
              .map((item) => `<p>${escape(item.text)}</p>`)
              .join('')
          : '<p>受控布局示例：一个橙色方块和两个深浅矩形组成网格。</p>'
      }</section></body></html>`;
    if (focusMode) panel.querySelector(`[data-aura-mode="${focusMode}"]`)?.focus();
  }
  function renderChrome() {
    const picked = objects();
    for (const name of ['focus-font', 'bold', 'align', 'focus-color']) {
      const control = $(`[data-action="${name}"]`);
      if (!control) continue;
      control.disabled =
        picked.length !== 1 || (name !== 'focus-color' && picked[0].kind !== 'text');
      control.title = control.disabled ? '先选择适用的对象' : '编辑当前对象';
    }
    $$('[data-save-state]').forEach((el) => {
      el.textContent = drafts.size
        ? '有未应用输入'
        : saved === null
          ? '未保存的演示'
          : dirty()
            ? '有未保存修改'
            : '已保存到内存';
      el.classList.toggle('is-dirty', dirty());
    });
    $$('[data-action="undo"]').forEach((el) => {
      el.disabled = !undoStack.length;
    });
    $$('[data-action="redo"]').forEach((el) => {
      el.disabled = !redoStack.length;
    });
    $$('[data-workspace]').forEach((el) => {
      if (el.closest('nav')) el.setAttribute('aria-pressed', el.dataset.workspace === workspace);
    });
    $$('[data-inspector-tab]').forEach((el) => {
      el.setAttribute('aria-pressed', el.dataset.inspectorTab === inspectorTab);
    });
  }
  function render() {
    const focused = document.activeElement;
    const restoreId = focused?.dataset?.select;
    const restoreLayer = focused?.classList.contains('layer-item');
    renderNavigation();
    $('.skip-link').href = workspace === 'editor' ? '#stage' : '#aura-panel';
    $('.skip-link').textContent = workspace === 'editor' ? '跳到画布' : '跳到 Aura 预览';
    $('#aura-panel').tabIndex = 0;
    $('#stage').hidden = workspace !== 'editor';
    $('#aura-panel').hidden = workspace !== 'aura';
    $('#stage').innerHTML = `<div class="slide-frame">${slideSvg(slide(), true)}</div>`;
    renderInspector();
    renderAura();
    renderChrome();
    fitCanvas();
    if (restoreId) {
      const target = restoreLayer
        ? $(`#layer-list [data-select="${restoreId}"]`)
        : $(`#stage [data-select="${restoreId}"]`);
      (target || $('#stage')).focus({ preventScroll: true });
    }
  }
  function selectObject(id, additive) {
    selected = additive
      ? selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id]
      : [id];
    render();
    status(
      `原型模拟 · ${
        selected.length
          ? '已选择 ' +
            objects()
              .map((item) => item.name)
              .join('、')
          : '已清除选择'
      }`,
    );
  }
  function updateTheme() {
    const isDark =
      themeChoice === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
        : themeChoice === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }
  function closeDialog() {
    if (busy) return;
    $('#dialog').close();
  }
  function dialog(content, preserveInvoker = false) {
    const element = $('#dialog');
    if (!element.open && !preserveInvoker) dialogInvoker = document.activeElement;
    element.innerHTML = content;
    if (!element.open) element.showModal();
    element.querySelector('[autofocus],button,select')?.focus();
  }
  const dialogHead = (title) =>
    `<div class="dialog-eyebrow">AURALIDE / 原型模拟</div><h2 id="dialog-title">${title}</h2>`;
  function fileDialog(operation) {
    const isSave = operation === 'save';
    dialog(
      `${dialogHead(isSave ? '保存这次创作' : '打开演示文稿')}<p>${isSave ? '快照仅保留在本页内存中。关闭或刷新原型后会丢失，不会写入真实文件。' + (drafts.size ? ' 尚有未应用的属性输入，保存仅包含已应用内容。' : '') : '打开内存中的上次保存快照；尚未保存时打开初始示例。不会读取你的磁盘。'}</p><div class="file-card">${icon('slide')}<div><strong>下一次出发.auralide.json</strong><small>${isSave ? deck.length + ' 页 · 当前内存内容' : saved ? '上次模拟保存的快照' : '三页初始示例'}</small></div></div>${isSave ? '<label class="scenario-field">模拟结果<select id="save-scenario"><option value="success">正常保存</option><option value="failure">模拟写入失败</option><option value="conflict">模拟版本冲突</option></select></label>' : dirty() || drafts.size ? '<p>当前有未保存的模拟修改，打开会替换它们；取消可保留。</p>' : ''}<div class="dialog-actions"><button data-action="cancel">取消</button><button class="primary" data-action="${isSave ? 'confirm-save' : 'confirm-open'}">${isSave ? '保存到内存' : dirty() || drafts.size ? '放弃模拟修改并打开' : '打开内存快照'}</button></div>`,
    );
  }
  async function saveSimulation() {
    if (busy) return;
    const scenario = $('#save-scenario').value;
    const atRevision = revision;
    busy = true;
    $('#dialog').setAttribute('aria-busy', 'true');
    $$('#dialog button, #dialog select').forEach((el) => {
      el.disabled = true;
    });
    $('#dialog-title').textContent = '正在模拟保存…';
    status('原型模拟 · 正在保存到内存…');
    await new Promise((resolve) => setTimeout(resolve, 450));
    busy = false;
    $('#dialog').removeAttribute('aria-busy');
    if (scenario !== 'success' || revision !== atRevision) {
      const conflict = scenario === 'conflict' || revision !== atRevision;
      dialog(
        `${dialogHead(conflict ? '模拟版本冲突' : '模拟保存失败')}<p>${conflict ? '模拟检测到较新的版本。当前画布和未应用的属性输入已保留，不会自动覆盖或重试。' : '模拟写入被拒绝。你的编辑仍在本页，旧的内存快照保持不变。'}</p><div class="dialog-actions"><button data-action="cancel">返回编辑，保留草稿</button>${conflict ? '<button data-action="refresh-snapshot">重新读取模拟快照</button>' : '<button class="primary" data-action="save">重试模拟保存</button>'}</div>`,
        true,
      );
      status(`原型模拟 · ${conflict ? '版本冲突' : '保存失败'}；草稿已保留`);
      return;
    }
    saved = clone(deck);
    closeDialog();
    renderChrome();
    status('原型模拟 · 已保存到本页内存；未写入磁盘');
  }
  function openSnapshot() {
    deck = saved ? clone(saved) : fixture();
    slideIndex = 0;
    selected = [];
    drafts.clear();
    undoStack = [];
    redoStack = [];
    revision++;
    closeDialog();
    render();
    status('原型模拟 · 已打开内存快照；会话撤销历史已清空');
  }
  function applyProperties(form) {
    if (!form.reportValidity()) return;
    if (form.contains(document.activeElement)) document.activeElement.blur();
    const data = new FormData(form);
    const current = objects()[0];
    if (!current) return;
    const patch = { ...drafts.get(draftKey()) };
    for (const key of ['x', 'y', 'w', 'h', 'size', 'radius', 'weight'])
      if (data.has(key)) patch[key] = Number(data.get(key));
    for (const key of ['text', 'color', 'align'])
      if (data.has(key)) patch[key] = String(data.get(key));
    for (const key of ['x', 'y', 'w', 'h', 'size', 'radius', 'weight']) {
      if (!(key in patch)) continue;
      if (String(patch[key]).trim() === '') {
        status('原型模拟 · 属性尚未填写完整，请检查设计和排列字段');
        return;
      }
      patch[key] = Number(patch[key]);
    }
    if ('text' in patch && patch.text.length > 1000) {
      $('#content')?.setAttribute('aria-invalid', 'true');
      const help = $('#text-help');
      if (help) help.textContent = '文本超过 1000 字，请缩短后重试。';
      $('#content')?.focus();
      status('原型模拟 · 文本超过长度限制');
      return;
    }
    if ('color' in patch && !/^#[0-9a-f]{6}$/i.test(patch.color)) return;
    const limits = {
      x: [0, 1280],
      y: [0, 720],
      w: [16, 1280],
      h: [16, 720],
      size: [10, 120],
      radius: [0, 200],
      weight: [400, 600],
    };
    for (const [key, [min, max]] of Object.entries(limits))
      if (key in patch && (!Number.isFinite(patch[key]) || patch[key] < min || patch[key] > max)) {
        status('原型模拟 · 属性输入超出有效范围，请检查设计和排列字段');
        return;
      }
    drafts.delete(draftKey());
    dispatchSimulation(() => Object.assign(current, patch), '已应用属性；尚未保存');
    $('.apply-properties')?.focus();
  }
  function historyAction(direction) {
    const source = direction === 'undo' ? undoStack : redoStack;
    const target = direction === 'undo' ? redoStack : undoStack;
    if (!source.length) return;
    target.push(clone(deck));
    deck = source.pop();
    revision++;
    slideIndex = Math.min(slideIndex, deck.length - 1);
    selected = selected.filter((id) => slide().elements.some((item) => item.id === id));
    render();
    status(`原型模拟 · 已${direction === 'undo' ? '撤销' : '重做'}；仅本页会话有效`);
  }
  function action(name) {
    if (name === 'cancel') return closeDialog();
    if (name === 'save' || name === 'open') return fileDialog(name);
    if (name === 'confirm-save') return void saveSimulation();
    if (name === 'confirm-open') return openSnapshot();
    if (name === 'refresh-snapshot')
      return dialog(
        `${dialogHead('替换当前模拟草稿？')}<p>重新读取上次保存的内存快照会丢弃当前模拟修改和属性输入。取消会完整保留草稿。</p><div class="dialog-actions"><button data-action="cancel">保留草稿</button><button class="primary" data-action="confirm-open">确认重新读取</button></div>`,
        true,
      );
    if (name === 'menu')
      return dialog(
        `${dialogHead('下一次出发')}<p>三页演示 · 当前内容仅用于视觉与交互评审</p><div class="menu-list"><button data-action="save">${icon('save')}模拟保存<kbd>Ctrl / Cmd + S</kbd></button><button data-action="open">${icon('folder')}模拟打开<kbd>Ctrl / Cmd + O</kbd></button><button data-action="shortcuts">${icon('cursor')}键盘操作</button><button data-action="agent">${icon('spark')}Agent 能力说明</button></div><div class="dialog-actions"><button data-action="cancel">关闭</button></div>`,
      );
    if (name === 'agent')
      return dialog(
        `${dialogHead('Agent 工作流，保留真实边界')}<p>正式产品将由 Agent 提交结构化提案，经授权与差异审查后，通过唯一 Dispatcher 应用。</p><p>本原型没有连接 Agent 服务，也没有实现身份、授权或 Apply。这里仅验证入口与说明，不模拟成功提案。</p><div class="dialog-actions"><button data-action="cancel">知道了</button></div>`,
      );
    if (name === 'shortcuts')
      return dialog(
        `${dialogHead('更少切换，更多专注')}<p>Ctrl / Cmd + S：模拟保存<br/>Ctrl / Cmd + O：模拟打开<br/>Ctrl / Cmd + Z：撤销模拟编辑<br/>Ctrl + Y / Cmd + Shift + Z：重做<br/>方向键：移动 1 px；Shift：10 px<br/>Shift 点击 / Shift + Enter：多选<br/>Enter：选择对象；Escape：取消或清除</p><p>输入框保留原生编辑按键。Aura 内的按键不会执行文档操作。</p><div class="dialog-actions"><button data-action="cancel">关闭</button></div>`,
      );
    if (name === 'undo' || name === 'redo') return historyAction(name);
    if (name.startsWith('zoom-')) {
      zoom =
        name === 'zoom-fit'
          ? 1
          : Math.max(0.5, Math.min(1.5, zoom + (name === 'zoom-in' ? 0.1 : -0.1)));
      fitCanvas();
      return;
    }
    if (name === 'select-tool') {
      $('#stage').focus();
      return;
    }
    if (name === 'select-all') {
      selected = slide().elements.map((item) => item.id);
      render();
      status(`原型模拟 · 已选择 ${selected.length} 个对象`);
      return;
    }
    if (name === 'focus-font' || name === 'focus-color') {
      inspectorTab = 'design';
      render();
      $(name === 'focus-font' ? '[name="size"]' : '[name="color"]')?.focus();
      return;
    }
    if (name === 'delete') {
      if (!selected.length) return;
      return dispatchSimulation(() => {
        slide().elements = slide().elements.filter((item) => !selected.includes(item.id));
        selected = [];
      }, '已删除选中对象');
    }
    if (name === 'bold' || name === 'align') {
      const item = objects()[0];
      if (!item || item.kind !== 'text') return;
      return dispatchSimulation(() => {
        if (name === 'bold') item.weight = item.weight >= 600 ? 400 : 600;
        else item.align = item.align === 'left' ? 'center' : 'left';
      }, '已调整文字格式');
    }
    if (name === 'insert-text' || name === 'insert-shape') {
      const id = 'mock-' + (revision + 1);
      return dispatchSimulation(() => {
        slide().elements.push(
          name === 'insert-text'
            ? text(id, '新文本', '写下新的想法', 160, 220, 650, 80, 42)
            : shape(id, '新形状', 320, 280, 240, 160, '#cf6a42', 8),
        );
        selected = [id];
      }, '已插入对象');
    }
    if (name === 'add-slide')
      return dispatchSimulation(() => {
        const next = clone(fixture()[1]);
        next.id = 'mock-slide-' + (revision + 1);
        next.name = '新的创作';
        deck.push(next);
        slideIndex = deck.length - 1;
        selected = [];
      }, '已新增幻灯片');
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest(
      '[data-action],[data-workspace],[data-slide],[data-select],[data-left-tab],[data-inspector-tab],[data-aura-mode]',
    );
    if (!target || target.disabled) {
      if (
        event.target === $('#stage') ||
        (event.target.closest('.slide-frame') && !event.target.closest('[data-select]'))
      ) {
        selected = [];
        render();
        status('原型模拟 · 已清除选择');
      }
      return;
    }
    if (target.dataset.action) return void action(target.dataset.action);
    if (target.dataset.workspace) {
      workspace = target.dataset.workspace;
      const fromAura = !!target.closest('#aura-panel');
      render();
      if (fromAura) $('#stage').focus();
      status(`原型模拟 · 已切换${workspace === 'editor' ? '编辑器' : 'Aura 预览'}`);
      return;
    }
    if (target.dataset.slide !== undefined) {
      slideIndex = Number(target.dataset.slide);
      selected = [];
      render();
      $(`[data-slide="${slideIndex}"]`).focus();
      return;
    }
    if (target.dataset.select) return selectObject(target.dataset.select, event.shiftKey);
    if (target.dataset.leftTab) {
      const layers = target.dataset.leftTab === 'layers';
      $('#layer-list').hidden = !layers;
      $('#slide-list').hidden = layers;
      $$('[data-left-tab]').forEach((el) => el.setAttribute('aria-pressed', el === target));
      return;
    }
    if (target.dataset.inspectorTab) {
      inspectorTab = target.dataset.inspectorTab;
      renderInspector();
      renderChrome();
      return;
    }
    if (target.dataset.auraMode) {
      auraMode = target.dataset.auraMode;
      renderAura();
    }
  });
  document.addEventListener('dblclick', (event) => {
    if (event.target.closest('#stage [data-select]') && objects()[0]?.kind === 'text') {
      inspectorTab = 'design';
      renderInspector();
      renderChrome();
      $('#content')?.focus();
    }
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'property-form') {
      event.preventDefault();
      applyProperties(event.target);
    }
  });
  function captureDraft(event) {
    if (
      !event.target.isConnected ||
      !event.target.closest('#property-form') ||
      selected.length !== 1
    )
      return;
    const key = event.target.name;
    if (!key) return;
    const value = event.target.value;
    drafts.set(draftKey(), { ...drafts.get(draftKey()), [key]: value });
    if (key === 'color') event.target.nextElementSibling.textContent = value;
    if (key === 'text') event.target.removeAttribute('aria-invalid');
    renderChrome();
  }
  document.addEventListener('input', captureDraft);
  document.addEventListener('change', captureDraft);
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-theme-picker]')) {
      themeChoice = event.target.value;
      updateTheme();
    }
  });
  $('#dialog').addEventListener('close', () => {
    if (dialogInvoker?.isConnected) dialogInvoker.focus();
    else $('[data-action="save"]').focus();
  });
  $('#dialog').addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  document.addEventListener('keydown', (event) => {
    if ($('#dialog').open) return;
    const editing = event.target.closest('input,textarea,select,[contenteditable]');
    if (editing) {
      if (event.key === 'Escape' && event.target.closest('#property-form')) {
        event.preventDefault();
        drafts.delete(draftKey());
        renderInspector();
        renderChrome();
        $('#stage').focus();
        status('原型模拟 · 已撤回当前对象未应用的输入');
      }
      return;
    }
    const primary = event.ctrlKey || event.metaKey;
    if (primary && ['s', 'o', 'z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const key = event.key.toLowerCase();
      action(
        key === 's'
          ? 'save'
          : key === 'o'
            ? 'open'
            : key === 'y' || event.shiftKey
              ? 'redo'
              : 'undo',
      );
      return;
    }
    if (event.target.closest('#stage [data-select]') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      selectObject(event.target.closest('[data-select]').dataset.select, event.shiftKey);
      return;
    }
    if (event.key === 'Escape') {
      selected = [];
      render();
      $('#stage').focus();
      status('原型模拟 · 已清除选择');
      return;
    }
    if (workspace !== 'editor' || !selected.length) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      action('delete');
      return;
    }
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
      event.target.closest('#stage,#layer-list')
    ) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      dispatchSimulation(
        () =>
          objects().forEach((item) => {
            if (event.key.includes('Left')) item.x = Math.max(0, item.x - step);
            if (event.key.includes('Right')) item.x = Math.min(1280 - item.w, item.x + step);
            if (event.key.includes('Up')) item.y = Math.max(0, item.y - step);
            if (event.key.includes('Down')) item.y = Math.min(720 - item.h, item.y + step);
          }),
        '已微调位置',
      );
    }
  });
  let drag = null;
  $('#stage').addEventListener('pointerdown', (event) => {
    const target = event.target.closest('[data-select]');
    if (!target || event.shiftKey || event.button !== 0) return;
    const item = slide().elements.find((value) => value.id === target.dataset.select);
    drag = {
      id: item.id,
      x: event.clientX,
      y: event.clientY,
      initialX: item.x,
      initialY: item.y,
      scale: $('.slide-frame').getBoundingClientRect().width / 1280,
    };
  });
  document.addEventListener('pointerup', (event) => {
    if (!drag) return;
    const current = drag;
    drag = null;
    const dx = Math.round((event.clientX - current.x) / current.scale),
      dy = Math.round((event.clientY - current.y) / current.scale);
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    selected = [current.id];
    dispatchSimulation(() => {
      const item = objects()[0];
      item.x = Math.max(0, Math.min(1280 - item.w, current.initialX + dx));
      item.y = Math.max(0, Math.min(720 - item.h, current.initialY + dy));
    }, '已拖动对象');
  });
  document.addEventListener('pointercancel', () => {
    drag = null;
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
  new ResizeObserver(fitCanvas).observe($('#stage'));
  renderIcons();
  render();
})();
