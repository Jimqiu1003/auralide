import type { Presentation } from '@auralide/core';

export interface HtmlImportReport {
  readonly mode: 'native' | 'converted';
  readonly sourceHash: string;
  readonly slideCount: number;
  readonly elementCount: number;
  readonly warnings: readonly string[];
  readonly mappings: readonly { sourceNode: string; elementId: string }[];
}
export interface HtmlSnapshot {
  readonly document: Presentation;
  readonly mode: 'native' | 'converted';
  readonly warnings: string[];
  readonly mappings: { sourceNode: string; elementId: string }[];
}

/** Fixed, main-owned DOM inspection. Never interpolate imported HTML or caller code here. */
export const HTML_IMPORT_SCRIPT = String.raw`(async () => {
  const metadata = document.querySelector('script#auralide-document[type="application/json"]');
  if (metadata) {
    const payload = JSON.parse(metadata.textContent);
    if (payload.format !== 'auralide-html-v1') throw new Error('Unsupported embedded format');
    return {document:payload.document,mode:'native',warnings:[],mappings:[]};
  }
  const warnings = new Set(['文字排版、字体、行距、圆角、透明度与堆叠顺序可能与源 HTML 不同，请检查导入后的各页。']);
  if (document.querySelector('script')) warnings.add('脚本不会执行；动画、导航及动态生成内容不转换。');
  if (document.querySelector('link[rel="stylesheet"],img,video,audio,iframe,object,embed')) warnings.add('外部样式、字体、图片及媒体不加载；图片仅保留占位。');
  if (document.querySelector('svg path,canvas')) warnings.add('SVG 路径与 Canvas 绘制暂不转换。');
  if (document.querySelectorAll('*').length > 50000) throw new Error('HTML node budget exceeded');
  const candidates = [...document.querySelectorAll('[data-slide-id],[data-slide],.slide,.slides>section,body>section')];
  let pages = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
  if (!pages.length) pages = [document.body];
  if (pages.length > 100) throw new Error('HTML slide budget exceeded');
  const number = value => Number.parseFloat(value) || 0;
  const hex = value => {
    if (!value || value === 'none' || value === 'transparent') return undefined;
    const parts = value.match(/[\d.]+/g);
    if (!parts || parts.length < 3 || (parts.length > 3 && Number(parts[3]) === 0)) return undefined;
    return '#' + parts.slice(0,3).map(part => Math.round(Number(part)).toString(16).padStart(2,'0')).join('');
  };
  // The inspection window is hidden, and a hidden window throttles requestAnimationFrame to roughly
  // one frame per second: waiting for two frames per slide cost about two seconds per slide, which
  // pushed decks larger than a few slides past the import timeout and surfaced as an empty editor.
  // Reading a layout property forces style and layout to be up to date synchronously, which is all
  // this wait ever achieved; the frame wait is kept only as an opportunistic yield, capped by a
  // timer so it can never stall the import.
  const settlePage = () => {
    void document.body.offsetHeight;
    return new Promise(resolve => {
      let settled = false, timer;
      const finish = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
      timer = setTimeout(finish, 50);
      requestAnimationFrame(() => requestAnimationFrame(finish));
    });
  };
  const slides = [], mappings = [];
  let size;
  for (const [index, page] of pages.entries()) {
    // Presentation frameworks hide inactive pages or translate whole slide groups.
    for (let parent = page; parent; parent = parent.parentElement) {
      parent.style.setProperty('display','block','important');
      parent.style.setProperty('visibility','visible','important');
      parent.style.setProperty('opacity','1','important');
      parent.style.setProperty('transform','none','important');
    }
    page.style.setProperty('position','relative','important');
    page.style.setProperty('left','0','important');page.style.setProperty('top','0','important');
    await settlePage();
    const rect = page.getBoundingClientRect(), pageStyle = getComputedStyle(page);
    if (!size) size = {width:Math.max(1,Math.round(rect.width || 1280)),height:Math.max(1,Math.round(rect.height || 720))};
    if (Math.abs(rect.width-size.width)>2 || Math.abs(rect.height-size.height)>2) warnings.add('各页尺寸不一致，已按第一页画布尺寸换算。');
    const scaleX = size.width / (rect.width || size.width), scaleY = size.height / (rect.height || size.height);
    const elements = [], textParents = new Set();
    const nodes = [...page.querySelectorAll('*')];
    const add = (node, value) => {
      const id = 'el_html_' + (index+1) + '_' + (elements.length+1);
      elements.push({id,...value});mappings.push({sourceNode:'page['+(index+1)+']/node['+(nodes.indexOf(node)+1)+']:'+node.tagName.toLowerCase(),elementId:id});
      if (mappings.length > 10000) throw new Error('HTML element budget exceeded');
    };
    for (const node of nodes) {
      if (['SCRIPT','STYLE','LINK','META','HEAD','IFRAME','OBJECT','EMBED','VIDEO','AUDIO'].includes(node.tagName)) continue;
      const box = node.getBoundingClientRect(), css = getComputedStyle(node);
      if (!box.width || !box.height || css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) continue;
      const geometry = {x:Math.round((box.x-rect.x)*scaleX),y:Math.round((box.y-rect.y)*scaleY),width:Math.max(1,Math.round(box.width*scaleX)),height:Math.max(1,Math.round(box.height*scaleY))};
      if (css.backgroundImage !== 'none') warnings.add('背景图片与渐变暂不转换。');
      if (css.transform !== 'none') warnings.add('复杂变换已近似为测量后的矩形边界。');
      const background = hex(css.backgroundColor);
      if (background) add(node,{kind:'shape',name:'背景色块',shape:number(css.borderRadius)>=Math.min(box.width,box.height)/2?'ellipse':'rectangle',fill:background,stroke:'none',geometry});
      if (node.tagName === 'IMG') {
        add(node,{kind:'image',name:'图片占位',alt:(node.alt || '未加载的 HTML 图片').slice(0,500),assetId:'html-unavailable-'+(index+1)+'-'+elements.length,geometry});
        continue;
      }
      if (['rect','circle','ellipse','line'].includes(node.tagName)) {
        add(node,{kind:'shape',name:'SVG 基础图形',shape:['circle','ellipse'].includes(node.tagName)?'ellipse':node.tagName==='line'?'line':'rectangle',fill:hex(css.fill)||'none',stroke:hex(css.stroke)||'none',geometry});
        continue;
      }
      if ([...textParents].some(parent => parent.contains(node))) continue;
      const directText = [...node.childNodes].some(child => child.nodeType===3 && child.textContent.trim());
      if (!directText) continue;
      const inline = [...node.children].every(child => ['SPAN','STRONG','EM','B','I','U','A','SMALL','BR','CODE'].includes(child.tagName));
      const text = (inline ? node.innerText || node.textContent : [...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).join('')).trim();
      if (!text) continue;
      if (inline) textParents.add(node);
      add(node,{kind:'text',name:text.slice(0,80),text,geometry,style:{fontSize:Math.max(1,number(css.fontSize)*scaleY),fontWeight:Math.max(1,Math.min(1000,number(css.fontWeight)||400)),color:hex(css.color)||'#172033',align:['center','right'].includes(css.textAlign)?css.textAlign:'left'}});
    }
    if (page === document.body && !elements.length && page.innerText.trim()) {
      add(page,{kind:'text',name:'正文',text:page.innerText.trim(),geometry:{x:32,y:32,width:Math.max(1,size.width-64),height:Math.max(1,size.height-64)}});
    }
    slides.push({id:'slide_html_'+(index+1),name:page.getAttribute('data-title')?.slice(0,200)||'幻灯片 '+(index+1),backgroundColor:hex(pageStyle.backgroundColor)||hex(getComputedStyle(document.body).backgroundColor)||'#ffffff',elements});
  }
  if (!slides.some(slide => slide.elements.length)) throw new Error('No supported HTML content');
  return {document:{schemaVersion:'1.0',id:'pres_html',title:(document.title||'导入的演示文稿').slice(0,500),revision:0,slideSize:size,slides},mode:'converted',warnings:[...warnings],mappings};
})()`;
