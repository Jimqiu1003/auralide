export const PLAYER_STYLE = String.raw`
html,body{margin:0;font-family:system-ui,sans-serif;background:#202228;color:#edf0f5}*{box-sizing:border-box}
.auralide-page{position:relative;height:calc(100dvh - 56px);overflow:hidden}.auralide-page>main{position:absolute!important;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--scale,1));transform-origin:center}
.viewer .auralide-page:not(.active){display:none}[data-pending]{visibility:hidden}iframe{border:0;width:100%;height:100%}
nav{min-height:56px;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:12px}button{font:inherit;color:inherit;background:#343842;border:1px solid #7d8797;border-radius:5px;padding:8px 14px}button:disabled{opacity:.45}button:focus-visible,a:focus-visible{outline:3px solid #b8ceff;outline-offset:3px}[hidden]{display:none!important}.skip{position:absolute;left:8px;top:-100px;z-index:100;background:#fff;color:#172033;padding:12px}.skip:focus{top:8px}#player-error{position:fixed;top:0;background:#7b2020;color:white}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media print{nav,.skip{display:none}.viewer .auralide-page{display:block!important;height:100vh;break-after:page}.auralide-page>main{left:0;top:0;transform:none}[data-pending]{visibility:visible}}
`;
export const PLAYER_SCRIPT = String.raw`
(() => {
  'use strict';
  const bundle = JSON.parse(document.getElementById('auralide-document').textContent);
  const pages = [...document.querySelectorAll('.auralide-page')];
  const previous = document.getElementById('previous'), next = document.getElementById('next');
  const counter = document.getElementById('counter'), enable = document.getElementById('source-scripts');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  let index = 0, scripts = false;
  const urls = new Map();
  const url = id => { if (!urls.has(id)) urls.set(id, assetUrl(id,bundle.assets)); return urls.get(id); };
  const fail = error => { document.getElementById('player-error').textContent = '播放失败：' + error.message; };
  const animate = (node,effect,duration) => {
    if (reduced.matches || effect === 'none' || !effect) return;
    node.animate(effect === 'slide' ? [{opacity:0,translate:'32px 0'},{opacity:1,translate:'0 0'}] : [{opacity:0},{opacity:1}], {duration,easing:'ease-out'});
  };
  const sourceFrames = () => {
    for (const holder of pages[index]?.querySelectorAll('[data-source-asset]') ?? []) {
      const frame = document.createElement('iframe');
      frame.title = '导入的 HTML 演示内容';
      frame.setAttribute('sandbox', scripts ? 'allow-scripts' : '');
      frame.referrerPolicy = 'no-referrer';
      frame.src = url(holder.dataset.sourceAsset);
      holder.replaceChildren(frame);
    }
  };
  const show = () => {
    pages.forEach((page,i) => {
      for (const media of page.querySelectorAll('audio,video')) media.pause();
      if (i !== index) for (const holder of page.querySelectorAll('[data-source-asset]')) holder.replaceChildren();
      page.classList.toggle('active',i===index);page.inert=i!==index;
      page.setAttribute('aria-hidden',String(i!==index));
    });
    previous.disabled=index===0;counter.textContent=(pages.length?index+1:0)+' / '+pages.length;
    const page=pages[index];
    for (const node of page?.querySelectorAll('[data-effect]')??[]) {
      node.toggleAttribute('data-pending',node.dataset.trigger==='click'&&node.dataset.effect!=='none');
      if(!node.hasAttribute('data-pending')) animate(node,node.dataset.effect,Number(node.dataset.duration));
    }
    next.disabled=index>=pages.length-1&&!page?.querySelector('[data-pending]');
    next.setAttribute('aria-label',page?.querySelector('[data-pending]')?'下一步':'下一页');
    if(page) animate(page.querySelector('main'),page.dataset.transition,300);
    sourceFrames();
  };
  const fit=()=>document.documentElement.style.setProperty('--scale',String(Math.min(innerWidth/bundle.document.slideSize.width,Math.max(1,innerHeight-document.querySelector('nav').offsetHeight)/bundle.document.slideSize.height)));
  previous.onclick=()=>{index=Math.max(0,index-1);show();};
  next.onclick=()=>{
    const pending=pages[index]?.querySelector('[data-pending]');
    if(pending){pending.removeAttribute('data-pending');animate(pending,pending.dataset.effect,Number(pending.dataset.duration));next.disabled=index>=pages.length-1&&!pages[index].querySelector('[data-pending]');next.setAttribute('aria-label',pages[index].querySelector('[data-pending]')?'下一步':'下一页');}
    else if(index<pages.length-1){index++;show();}
  };
  document.getElementById('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(error){fail(error);}};
  enable.hidden=!document.querySelector('[data-source-asset]');
  enable.onclick=()=>{scripts=!scripts;enable.setAttribute('aria-pressed',String(scripts));enable.textContent=scripts?'禁用源 HTML 动态脚本':'启用源 HTML 动态脚本';sourceFrames();};
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,button,a,audio,video,[contenteditable]'))return;
    if(['ArrowRight','PageDown',' '].includes(event.key)){event.preventDefault();next.click();}
    if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();previous.click();}
  });
  try{
    document.documentElement.classList.add('viewer');
    for(const node of document.querySelectorAll('[data-asset-id]'))node.src=url(node.dataset.assetId);
    for(const node of document.querySelectorAll('[data-font-asset]')){
      const family='asset-'+node.dataset.fontAsset;const font=new FontFace(family,'url("'+url(node.dataset.fontAsset)+'")');
      document.fonts.add(font);font.load().catch(fail);node.style.fontFamily=family;
    }
    addEventListener('resize',fit);show();fit();
  }catch(error){fail(error);}
})();
`;
