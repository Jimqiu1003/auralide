import { presentationSchema } from '@auralide/core';
import type { Presentation, Element } from '@auralide/core';
import { assetUrl } from './assets.js';
import type { Assets } from './assets.js';

export const PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
// Only literal colors enter CSS; Core color strings are not a CSS security boundary.
const color = (value: string | undefined, fallback: string): string =>
  value !== undefined && /^(#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value) ? value : fallback;
const elementHtml = (element: Element, assets?: Assets): string => {
  const g = element.geometry;
  let css = `position:absolute;left:${g.x}px;top:${g.y}px;width:${g.width}px;height:${g.height}px;transform:rotate(${element.rotation ?? 0}deg);opacity:${element.opacity ?? 1};overflow:hidden;box-sizing:border-box;`;
  let content: string;
  if (element.kind === 'text') {
    css += `white-space:pre-wrap;font-size:${element.style?.fontSize ?? 32}px;font-weight:${element.style?.fontWeight ?? 400};color:${color(element.style?.color, '#172033')};text-align:${element.style?.align ?? 'left'};`;
    content = escapeHtml(element.text);
    if (element.style?.fontFamily)
      css += `font-family:'${escapeHtml(element.style.fontFamily)}',sans-serif;`;
  } else if (element.kind === 'shape') {
    const fill = color(element.fill, 'transparent');
    const stroke = color(element.stroke, 'black');
    content = `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${element.shape === 'ellipse' ? `<ellipse cx="50" cy="50" rx="49" ry="49" fill="${fill}" stroke="${stroke}"/>` : element.shape === 'line' ? `<line x1="0" y1="50" x2="100" y2="50" stroke="${stroke}"/>` : `<rect x="1" y="1" width="98" height="98" fill="${fill}" stroke="${stroke}"/>`}</svg>`;
  } else if (element.kind === 'source') {
    content = `<div data-source-asset="${escapeHtml(element.assetId)}" style="width:100%;height:100%">HTML 源码组件 · 动态脚本默认禁用</div>`;
  } else {
    const src = assets?.[element.assetId] ? ` src="${assetUrl(element.assetId, assets)}"` : '';
    const attr = `data-asset-id="${escapeHtml(element.assetId)}"${src} style="width:100%;height:100%;object-fit:contain"`;
    content =
      element.kind === 'image'
        ? `<img ${attr} alt="${escapeHtml(element.alt ?? '')}">`
        : `<${element.kind} ${attr} controls preload="metadata" aria-label="${escapeHtml(element.alt ?? element.kind)}"></${element.kind}>`;
  }
  const entrance = element.entrance;
  return `<div data-element-id="${escapeHtml(element.id)}"${entrance ? ` data-effect="${entrance.effect}" data-trigger="${entrance.trigger}" data-duration="${entrance.duration}"` : ''}${element.kind === 'text' && element.style?.fontAssetId ? ` data-font-asset="${element.style.fontAssetId}"` : ''} style="${css}">${content}</div>`;
};
const page = (title: string, body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><title>${escapeHtml(title)}</title><style>html,body{margin:0;background:#e8e8ea;font-family:Arial,sans-serif}*{box-sizing:border-box}</style></head><body>${body}</body></html>`;
export const renderSlideMarkup = (
  input: Presentation,
  slideId: string,
  assets?: Assets,
): string => {
  const document = presentationSchema.parse(input);
  const slide = document.slides.find((candidate) => candidate.id === slideId);
  if (slide === undefined) throw new Error('Slide not found.');
  const { width, height } = document.slideSize;
  return `<main data-slide-id="${escapeHtml(slide.id)}" style="position:relative;width:${width}px;height:${height}px;background:${color(slide.backgroundColor, 'white')}">${slide.elements.map((element) => elementHtml(element, assets)).join('')}</main>`;
};
export const renderSlideHtml = (input: Presentation, slideId: string): string =>
  page(input.title, renderSlideMarkup(input, slideId));
