export interface SourceReference {
  readonly token: string;
  readonly kind: 'css' | 'js' | 'binary';
  readonly url?: string;
  readonly text?: string;
  readonly attribute?: boolean;
}
export interface SourceScan {
  readonly html: string;
  readonly references: readonly SourceReference[];
  readonly nodes: readonly { id: string; tag: string; text: string }[];
}
/** Fixed parser in an inert helper guest. Parsing never executes source code. */
export function scanSourceHtml(source: string): SourceScan {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  if (doc.querySelectorAll('*').length > 50000) throw new Error('HTML 超过 50000 个节点。');
  if (doc.querySelector('iframe,frame,object,embed,base,link[rel="import"]'))
    throw new Error('不支持嵌套网页、插件、base 或 HTML Import。请提供独立 HTML。');
  const references: SourceReference[] = [];
  const nodes: { id: string; tag: string; text: string }[] = [];
  const existingIds = [...doc.querySelectorAll('[data-auralide-node]')].map((node) =>
    node.getAttribute('data-auralide-node')!,
  );
  let nextId =
    existingIds.reduce((max, id) => Math.max(max, Number(id.replace('node-', '')) || 0), -1) + 1;
  for (const node of doc.querySelectorAll('head style[data-auralide-player-policy]')) node.remove();
  const reference = (
    kind: SourceReference['kind'],
    url?: string,
    text?: string,
    attribute = false,
  ): string => {
    const token = `__AURALIDE_REFERENCE_${references.length}__`;
    references.push({
      token,
      kind,
      ...(url === undefined ? {} : { url }),
      ...(text === undefined ? {} : { text }),
      attribute,
    });
    return token;
  };
  for (const meta of doc.querySelectorAll('meta[http-equiv]')) {
    if (
      ['refresh', 'content-security-policy'].includes(
        meta.getAttribute('http-equiv')!.toLowerCase(),
      )
    )
      meta.remove();
  }
  for (const node of doc.querySelectorAll('*')) {
    if (
      node.closest('body') &&
      !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(node.tagName)
    ) {
      const id = node.getAttribute('data-auralide-node') ?? `node-${nextId++}`;
      if (id.length > 64 || !/^node-[0-9]+$/.test(id) || nodes.some((n) => n.id === id))
        throw new Error('源码节点标识无效或重复。');
      node.setAttribute('data-auralide-node', id);
      nodes.push({
        id,
        tag: node.tagName.toLowerCase(),
        text: (node.textContent ?? '').slice(0, 200),
      });
    }
    if (node.hasAttribute('srcset')) throw new Error('暂不支持 srcset；请改用单一图片 src。');
    if (node.hasAttribute('style'))
      node.setAttribute('style', reference('css', undefined, node.getAttribute('style')!, true));
    for (const attribute of [...node.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on'))
        node.setAttribute(attribute.name, reference('js', undefined, attribute.value, true));
      if (
        ['src', 'poster'].includes(attribute.name) ||
        (node.tagName.toLowerCase() === 'image' && ['href', 'xlink:href'].includes(attribute.name))
      ) {
        if (!attribute.value.startsWith('auralide-asset:'))
          node.setAttribute(
            attribute.name,
            reference(node.tagName === 'SCRIPT' ? 'js' : 'binary', attribute.value),
          );
      }
    }
    if (node.tagName === 'LINK') {
      const rel = node.getAttribute('rel')?.toLowerCase();
      if (rel !== 'stylesheet') throw new Error(`不支持的 link 依赖：${rel ?? '未声明类型'}`);
      const href = node.getAttribute('href');
      if (href && !href.startsWith('auralide-asset:'))
        node.setAttribute('href', reference('css', href));
    }
    if (node.tagName === 'STYLE') {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = reference('css', undefined, node.textContent ?? '');
      if (node.hasAttribute('media')) link.media = node.getAttribute('media')!;
      node.replaceWith(link);
    }
    if (node.tagName === 'SCRIPT' && !node.hasAttribute('src')) {
      const type = node.getAttribute('type');
      if (!type || ['module', 'text/javascript', 'application/javascript'].includes(type)) {
        node.setAttribute('src', reference('js', undefined, node.textContent ?? ''));
        node.textContent = '';
      } else if (type !== 'application/json') throw new Error(`不支持的脚本类型：${type}`);
    }
  }
  return { html: '<!doctype html>' + doc.documentElement.outerHTML, references, nodes };
}
