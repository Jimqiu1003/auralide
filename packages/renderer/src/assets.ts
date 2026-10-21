export interface Asset {
  readonly mime: string;
  readonly base64: string;
}
export type Assets = Readonly<Record<string, Asset>>;

/** Same resolver in desktop previews and standalone playback; only content-addressed bytes enter. */
export function assetUrl(rootId: string, assets: Assets): string {
  const cache = new Map<string, string>();
  const limit = 100 * 1024 * 1024;
  const resolve = (id: string, chain: readonly string[]): string => {
    if (chain.includes(id) || chain.length > 32) throw new Error('资源依赖循环或深度超过 32 层。');
    if (cache.has(id)) return cache.get(id)!;
    const asset = assets[id];
    if (!asset) throw new Error(`缺少资源：${id}`);
    if (asset.base64.length > limit) throw new Error('展开资源超过 100 MiB。');
    if (!/^(text\/|application\/(javascript|json))/.test(asset.mime))
      return `data:${asset.mime};base64,${asset.base64}`;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(asset.base64), (char) => char.charCodeAt(0)),
    );
    let length = text.length;
    const resolved = text.replace(
      /auralide-(asset|style|event):([a-f0-9]{64})/g,
      (_match, kind: string, ref: string) => {
        const url = resolve(ref, [...chain, id]);
        length += url.length - _match.length;
        if (length > limit) throw new Error('展开资源超过 100 MiB。');
        if (kind === 'asset') return url;
        const decoded = new TextDecoder().decode(
          Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)),
        );
        return decoded.replace(
          /[&"<>]/g,
          (char) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]!,
        );
      },
    );
    const bytes = new TextEncoder().encode(resolved);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const result = `data:${asset.mime};base64,${btoa(binary)}`;
    if (result.length > limit) throw new Error('展开资源超过 100 MiB。');
    cache.set(id, result);
    return result;
  };
  return resolve(rootId, []);
}

export const SOURCE_CSP =
  "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data:; media-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
