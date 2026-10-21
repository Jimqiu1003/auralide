/** Canonical source patch only. The preview DOM is never serialized into the saved document. */
export function patchSourceHtml(input: {
  html: string;
  nodeId: string;
  change: {
    text?: string;
    styles?: Record<string, string | number>;
    assetId?: string;
    fontAssetId?: string;
  };
  baseTranslate?: string;
}): string {
  const document = new DOMParser().parseFromString(input.html, 'text/html');
  const node = [...document.querySelectorAll<HTMLElement>('[data-auralide-node]')].find(
    (el) => el.getAttribute('data-auralide-node') === input.nodeId,
  );
  if (!node) throw new Error('源码节点已失效，请重新选择。');
  // The parser guest denies inline styles; explicitly hydrate CSSOM before patching an attribute.
  if (input.change.styles || input.change.fontAssetId)
    node.style.cssText = node.getAttribute('style') ?? '';
  if (input.change.text !== undefined) {
    if (
      node.children.length ||
      node.closest(
        'svg,canvas,video,audio,script,style,input,textarea,select,img,br,hr,source,track,wbr',
      )
    )
      throw new Error('该节点包含结构或动态内容，请选择普通文字叶节点。');
    node.textContent = input.change.text;
  }
  if (input.change.assetId) {
    if (node.tagName !== 'IMG') throw new Error('请选择普通图片节点。');
    node.setAttribute('src', 'auralide-asset:' + input.change.assetId);
    node.removeAttribute('srcset');
  }
  if (input.change.fontAssetId) {
    const id = input.change.fontAssetId;
    const font = document.createElement('style');
    font.textContent = `@font-face{font-family:asset-${id};src:url("auralide-asset:${id}")}`;
    document.head.append(font);
    node.style.fontFamily = 'asset-' + id;
  }
  const styles = input.change.styles;
  if (styles) {
    for (const [key, value] of Object.entries(styles)) {
      if (['offsetX', 'offsetY'].includes(key)) continue;
      const property = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      const css = typeof value === 'number' && key !== 'opacity' ? `${value}px` : String(value);
      node.style.setProperty(property, css);
      if (!node.style.getPropertyValue(property)) throw new Error(`无法应用样式：${property}`);
    }
    if (styles.offsetX !== undefined || styles.offsetY !== undefined) {
      const previous =
        node.getAttribute('data-auralide-base-translate') ?? input.baseTranslate ?? 'none';
      const parts = previous === 'none' ? ['0px', '0px'] : previous.trim().split(/\s+/);
      if (parts.length > 3 || !parts.every((part) => /^-?[0-9.]+(?:px|%)?$/.test(part)))
        throw new Error('原平移包含复杂计算，请使用源码修改。');
      const x = Number(styles.offsetX ?? node.getAttribute('data-auralide-offset-x') ?? 0),
        y = Number(styles.offsetY ?? node.getAttribute('data-auralide-offset-y') ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('平移值无效。');
      node.setAttribute('data-auralide-base-translate', previous);
      node.setAttribute('data-auralide-offset-x', String(x));
      node.setAttribute('data-auralide-offset-y', String(y));
      node.style.translate = `calc(${parts[0] ?? '0px'} + ${x}px) calc(${parts[1] ?? '0px'} + ${y}px) ${parts[2] ?? '0px'}`;
    }
  }
  return '<!doctype html>' + document.documentElement.outerHTML;
}

/** Runs only as fixed main-owned inspection code in the inert source view. */
export function inspectSourceNode(nodeId: string): unknown {
  const node = [...document.querySelectorAll<HTMLElement>('[data-auralide-node]')].find(
    (el) => el.getAttribute('data-auralide-node') === nodeId,
  );
  if (!node || !node.isConnected) throw new Error('源码节点已失效。');
  const css = getComputedStyle(node),
    rect = node.getBoundingClientRect();
  const color = (value: string): string => {
    const numbers = value.match(/[\d.]+/g)?.map(Number);
    if (!numbers || numbers.length < 3) return 'transparent';
    return (
      '#' +
      numbers
        .slice(0, 3)
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('') +
      (numbers[3] !== undefined && numbers[3] < 1
        ? Math.round(numbers[3] * 255)
            .toString(16)
            .padStart(2, '0')
        : '')
    );
  };
  document.querySelector('[data-auralide-selected]')?.removeAttribute('data-auralide-selected');
  node.setAttribute('data-auralide-selected', '');
  return {
    nodeId,
    tag: node.tagName.toLowerCase(),
    text: (node.textContent ?? '').slice(0, 50000),
    editableText:
      !node.children.length &&
      (node.textContent?.length ?? 0) <= 50000 &&
      !node.closest(
        'svg,canvas,video,audio,script,style,input,textarea,select,img,br,hr,source,track,wbr',
      ),
    styles: {
      fontFamily: css.fontFamily
        .split(',')[0]!
        .trim()
        .replace(/^["']|["']$/g, ''),
      fontSize: parseFloat(css.fontSize) || 16,
      color: color(css.color),
      backgroundColor: color(css.backgroundColor),
      borderColor: color(css.borderColor),
      borderWidth: parseFloat(css.borderWidth) || 0,
      borderStyle: css.borderStyle,
      opacity: Number(css.opacity),
      textAlign: ['left', 'center', 'right'].includes(css.textAlign) ? css.textAlign : 'left',
      width: rect.width,
      height: rect.height,
      offsetX: Number(node.getAttribute('data-auralide-offset-x') ?? 0),
      offsetY: Number(node.getAttribute('data-auralide-offset-y') ?? 0),
    },
    baseTranslate:
      node.getAttribute('data-auralide-base-translate') ??
      node.getAttribute('data-auralide-preview-base-translate') ??
      css.translate,
  };
}

export function installSourceSelection(): void {
  const style = document.createElement('style');
  style.textContent =
    '[data-auralide-selected]{outline:3px solid #3568d4!important;outline-offset:3px}*,*::before,*::after{animation:none!important;transition:none!important}';
  document.head.append(style);
  let drag: { node: HTMLElement; x: number; y: number; before: string; origin: string[] } | null =
    null;
  const send = (value: unknown): void => console.log('auralide-source:' + JSON.stringify(value));
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      const node =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-auralide-node]')
          : null;
      if (!node) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const translate = getComputedStyle(node).translate;
      node.setAttribute('data-auralide-preview-base-translate', translate);
      drag = {
        node,
        x: event.clientX,
        y: event.clientY,
        before: node.style.translate,
        origin: translate === 'none' ? ['0px', '0px'] : translate.split(/\s+/),
      };
      node.setPointerCapture(event.pointerId);
      send({ type: 'select', nodeId: node.getAttribute('data-auralide-node') });
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (event) => {
      if (drag) {
        event.preventDefault();
        if (drag.origin.every((value) => /^-?[0-9.]+(?:px|%)?$/.test(value)))
          drag.node.style.translate = `calc(${drag.origin[0] ?? '0px'} + ${event.clientX - drag.x}px) calc(${drag.origin[1] ?? '0px'} + ${event.clientY - drag.y}px) ${drag.origin[2] ?? '0px'}`;
      }
    },
    true,
  );
  document.addEventListener(
    'pointerup',
    (event) => {
      if (!drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const { node, x, y, before } = drag;
      drag = null;
      node.style.translate = before;
      const dx = Math.round(event.clientX - x),
        dy = Math.round(event.clientY - y);
      if (Math.abs(dx) + Math.abs(dy) > 2)
        send({
          type: 'move',
          nodeId: node.getAttribute('data-auralide-node'),
          offsetX: Number(node.getAttribute('data-auralide-offset-x') ?? 0) + dx,
          offsetY: Number(node.getAttribute('data-auralide-offset-y') ?? 0) + dy,
        });
    },
    true,
  );
  document.addEventListener(
    'pointercancel',
    () => {
      if (drag) {
        drag.node.style.translate = drag.before;
        drag = null;
      }
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}
