import type { Presentation } from '@auralide/core';
import { assetUrl, escapeHtml, renderSlideMarkup } from '@auralide/renderer';
import type { Assets } from '@auralide/renderer';
import { assertBundleSize, serializeBundle } from './bundle.js';
import { PLAYER_SCRIPT, PLAYER_STYLE } from './player.js';

export const exportPresentationHtml = (input: Presentation, assets: Assets = {}): string => {
  const metadata = serializeBundle(input, assets).replace(/</g, '\\u003c');
  for (const slide of input.slides)
    for (const element of slide.elements)
      if (element.kind === 'source') assetUrl(element.assetId, assets);
  const pages = input.slides
    .map(
      (slide, index) =>
        `<section class="auralide-page" aria-label="${index + 1}" data-transition="${slide.transition ?? 'none'}">${renderSlideMarkup(input, slide.id)}</section>`,
    )
    .join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data:; media-src data:; font-src data:; connect-src 'none'; frame-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(input.title)} — Auralide</title><style>${PLAYER_STYLE}</style></head><body><a href="#deck" class="skip">跳到演示内容</a><div id="deck" tabindex="-1">${pages}</div><nav aria-label="幻灯片导航"><button id="previous">← 上一页</button><output id="counter" aria-live="polite"></output><button id="next">下一步 →</button><button id="fullscreen">全屏</button><button id="source-scripts" hidden aria-pressed="false">启用源 HTML 动态脚本</button></nav><output id="player-error" role="alert"></output><script type="application/json" id="auralide-document">${metadata}</script><script>${assetUrl.toString()}\n${PLAYER_SCRIPT}</script></body></html>`;
  assertBundleSize(Buffer.byteLength(html, 'utf8'));
  return html;
};
