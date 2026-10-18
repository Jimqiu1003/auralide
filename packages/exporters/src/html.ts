import { presentationSchema } from '@auralide/core';
import type { Presentation } from '@auralide/core';
import { renderSlideMarkup } from '@auralide/renderer';

/** Derived offline output. Embedded schema data makes Auralide HTML round trips lossless. */
export const exportPresentationHtml = (input: Presentation): string => {
  const document = presentationSchema.parse(input);
  const metadata = JSON.stringify({ format: 'auralide-html-v1', document }).replace(
    /</g,
    '\\u003c',
  );
  const pages = document.slides
    .map(
      (slide, index) =>
        `<section class="auralide-page" aria-label="${index + 1}">${renderSlideMarkup(document, slide.id)}</section>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Auralide Presentation</title><style>
html,body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#202228;color:#edf0f5}*{box-sizing:border-box}.auralide-page{position:relative;height:calc(100dvh - 48px);overflow:hidden}.auralide-page>main{position:absolute!important;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--scale,1));transform-origin:center}.viewer .auralide-page:not(.active){display:none}nav{height:48px;display:flex;justify-content:center;align-items:center;gap:20px}button{font:inherit;color:inherit;background:#343842;border:1px solid #7d8797;border-radius:5px;padding:6px 14px}button:disabled{opacity:.45}button:focus-visible{outline:2px solid #b8ceff;outline-offset:3px}@media print{nav{display:none}.viewer .auralide-page{display:block!important;height:${document.slideSize.height}px;page-break-after:always}.auralide-page>main{left:0;top:0;transform:none}@page{size:${document.slideSize.width}px ${document.slideSize.height}px;margin:0}}
</style></head><body>${pages}<nav aria-label="幻灯片导航"><button id="previous" aria-label="上一页">← 上一页</button><output id="counter" aria-live="polite"></output><button id="next" aria-label="下一页">下一页 →</button></nav><script type="application/json" id="auralide-document">${metadata}</script><script>
(()=>{'use strict';const pages=[...document.querySelectorAll('.auralide-page')],previous=document.getElementById('previous'),next=document.getElementById('next'),counter=document.getElementById('counter');let index=0;document.documentElement.classList.add('viewer');const show=()=>{pages.forEach((page,i)=>{page.classList.toggle('active',i===index);page.setAttribute('aria-hidden',String(i!==index));});previous.disabled=index===0;next.disabled=index>=pages.length-1;counter.textContent=(pages.length?index+1:0)+' / '+pages.length;};const fit=()=>document.documentElement.style.setProperty('--scale',String(Math.min(innerWidth/${document.slideSize.width},Math.max(1,innerHeight-48)/${document.slideSize.height})));previous.onclick=()=>{index=Math.max(0,index-1);show();};next.onclick=()=>{index=Math.min(pages.length-1,index+1);show();};document.addEventListener('keydown',event=>{if(['ArrowRight','PageDown',' '].includes(event.key)){event.preventDefault();next.click();}if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();previous.click();}});addEventListener('resize',fit);show();fit();})();
</script></body></html>`;
};
