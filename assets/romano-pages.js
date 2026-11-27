(() => {
  'use strict';
  const element = document.currentScript;
  const root = new URL('../', element.src);
  const slots = /@@RI:([a-z0-9-]+\/[a-z0-9-]+):([tjqm]):([a-z0-9-]+)@@/g;
  const htmlEscapes = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
  const escapeText = value => value.replace(/[&<>"']/g, character => htmlEscapes[character]);
  const escapeJSON = value => JSON.stringify(value).replace(/[<\u2028\u2029]/g, character =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));

  function template(doc) {
    const node = doc.getElementById('ri-page-template');
    return node ? JSON.parse(node.textContent) : null;
  }

  const menuPath = 'zajednicko/navigacija.json';
  const menuContainers = /(<div class="(?:design-menu ri-menu-items|portal-drawer-links)">)[\s\S]*?(<\/div>)/g;
  const menuHref = /^(?:#[a-z0-9-]+|(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.html(?:#[a-z0-9-]+)?)$/;

  async function renderMenu(html, snapshot) {
    if (!html.includes('ri-menu-items') && !html.includes('portal-drawer-links')) return html;
    const entry = snapshot.data.books.find(book => book.path === menuPath && book.kind === 'page-content');
    if (!entry) return html;

    try {
      const {datasets: {stavke}} = await RomanoData.book(entry, snapshot.source);
      if (!Array.isArray(stavke) || !stavke.length || !stavke.every(item =>
        item && typeof item.label === 'string' && item.label.trim() &&
        typeof item.icon === 'string' &&
        typeof item.appHref === 'string' && menuHref.test(item.appHref) &&
        typeof item.webHref === 'string' && menuHref.test(item.webHref) && !item.webHref.startsWith('#'))) {
        throw new Error('Neispravna centralna navigacija.');
      }

      return html.replace(menuContainers, (_, open, close) => {
        const portal = open.includes('portal-drawer-links');
        const links = stavke.map(({label, icon, appHref, webHref}) => {
          const href = portal ? webHref : appHref;
          const hrefValue = href.startsWith('#') ? href : new URL(href, root).href;
          const route = !portal && href.startsWith('#') ? href.slice(1) : '';
          const routeAttr = route ? ' data-ri-menu-route="' + escapeText(route) + '"' : '';
          const flightId = route === 'ri-flight' ? ' id="ri-flight-menu-link"' : '';
          const linkClass = portal ? 'portal-drawer-link' : 'ri-menu-link';
          const iconClass = portal ? 'menu-ico' : 'ri-menu-icon';
          const arrow = portal ? '<span class="menu-next" aria-hidden="true">›</span>' : '<b aria-hidden="true">›</b>';
          return '<a class="' + linkClass + '" href="' + escapeText(hrefValue) + '"' + routeAttr + flightId +
            '><span class="' + iconClass + '" aria-hidden="true">' + escapeText(icon) +
            '</span><span>' + escapeText(label) + '</span>' + arrow + '</a>';
        });
        return open + links.join('') + close;
      });
    } catch (error) {
      console.warn('Centralna navigacija nije dostupna.', error);
      return html;
    }
  }

function riInstallFontControls(){
'use strict';
if(window.riGlobalFontControls)return;
let config={};try{config=JSON.parse(document.getElementById('ri-module-config')?.textContent||'{}')}catch(e){}
if(config.route==='listen'||/\/readers\/sun_curani\.html$/i.test(location.pathname))return;
window.riGlobalFontControls=true;
let percent=100,queued=false;
try{const saved=Number(localStorage.getItem('ri-font-test')||100);if(Number.isFinite(saved))percent=Math.max(70,Math.min(200,saved))}catch(e){}
const documents=new Map(),originals=new WeakMap(),touched=new Set(),frames=new WeakSet();
const css='.ri-reader-font-controls{flex:none;position:sticky;top:0;z-index:3;display:flex;justify-content:center;gap:8px;align-items:center;padding:10px;background:#112f22;border-bottom:1px solid #b9954d}.ri-reader-font-controls button{min-width:48px;min-height:44px;background:#24452e;border:1px solid #b9954d;border-radius:8px;color:#ead097;font-size:20px}.ri-reader-font-controls output{min-width:55px;text-align:center;font-size:16px}';
function roots(doc){
 const all=[...doc.querySelectorAll('.page')].filter(el=>el.id!=='listen');
 if(all.length)return all.concat([...doc.querySelectorAll('.ri-fatiha-modal,#ri-flight-box,dialog')]);
 const main=doc.querySelector('main')||doc.getElementById('content')||doc.body;
 return main?[main]:[];
}
function controlsRoot(el){return el.closest?.('.ri-reader-font-controls')}
function excluded(el){return controlsRoot(el)||el.closest?.('#listen,.drawer,.design-menu,.portal-drawer,.topbar,.ri-reader-font-controls,script,style,noscript')||['SCRIPT','STYLE','SVG','PATH','IMG','AUDIO','SOURCE','IFRAME','HEAD','LINK','META','TITLE'].includes(el.tagName)}
function allTargets(){
 const seen=new Set();
 for(const doc of documents.keys())for(const root of roots(doc))for(const el of [root,...root.querySelectorAll('*')])if(!excluded(el))seen.add(el);
 return [...seen];
}
function refresh(){
 queued=false;setup();
 for(const el of touched){const saved=originals.get(el);if(saved){if(saved.value)el.style.setProperty('font-size',saved.value,saved.priority);else el.style.removeProperty('font-size')}}
 if(percent===100)return;
 const nodes=allTargets();
 const sizes=nodes.map(el=>parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize));
 nodes.forEach((el,i)=>{if(!Number.isFinite(sizes[i]))return;if(!originals.has(el))originals.set(el,{value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')});touched.add(el);el.style.setProperty('font-size',(sizes[i]*percent/100)+'px','important')});
}
function queue(){if(!queued){queued=true;requestAnimationFrame(refresh)}}
function set(value){percent=Math.max(70,Math.min(200,value));try{localStorage.setItem('ri-font-test',percent)}catch(e){}updateOutputs();refresh()}
function updateOutputs(){for(const doc of documents.keys())for(const output of doc.querySelectorAll('.ri-reader-font-controls output'))if(output.textContent!==percent+'%')output.textContent=percent+'%'}
function makeBar(doc,root){
 if(root.id==='listen'||root.classList.contains('ri-fatiha-modal')||root.querySelector(':scope > .ri-reader-font-controls'))return;
 const bar=doc.createElement('div');bar.className='ri-reader-font-controls';bar.setAttribute('role','group');bar.setAttribute('aria-label','Veličina slova');
 for(const [label,title,action]of [['A−','Smanji slova',()=>set(percent-10)],['A','Vrati veličinu slova',()=>set(100)],['A+','Povećaj slova',()=>set(percent+10)]]){const button=doc.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',title);button.onclick=action;bar.append(button)}
 const output=doc.createElement('output');output.setAttribute('aria-live','polite');output.textContent=percent+'%';bar.append(output);
 const strip=root.querySelector(':scope > .reader-strip');if(strip)strip.after(bar);else root.prepend(bar);
}
function watchFrame(frame){
 if(frames.has(frame)||frame.closest('#listen'))return;frames.add(frame);
 const load=()=>{try{const doc=frame.contentDocument;if(doc?.body&&doc.defaultView&&doc.location.href!=='about:blank'){register(doc,false);queue()}}catch(e){}};
 frame.addEventListener('load',load);load();
}
function register(doc,bars){
 if(documents.has(doc))return;documents.set(doc,{bars});
 const style=doc.createElement('style');style.dataset.riGlobalFonts='true';style.textContent=css;(doc.head||doc.documentElement).append(style);
 const Observer=doc.defaultView.MutationObserver;
 new Observer(records=>{if(records.some(r=>!controlsRoot(r.target)&&[...r.addedNodes].some(n=>n.nodeType===1||n.nodeType===3)))queue()}).observe(doc.body,{childList:true,subtree:true});
 doc.addEventListener('click',event=>{if(!controlsRoot(event.target))queue()});
}
function setup(){for(const [doc,options]of documents){if(options.bars)for(const root of roots(doc))makeBar(doc,root);for(const frame of doc.querySelectorAll('iframe'))watchFrame(frame)}}
register(document,true);set(percent);
window.addEventListener('hashchange',queue);window.addEventListener('resize',queue);
window.riFontControls={set,getPercent:()=>percent};
}


  function withFontControls(markup) {
    // One shared font toolbar per page; supersedes the old Quran-only initializer.
    markup = markup.replace(/<script\b[^>]*id=["']ri-reader-font-controls-script["'][^>]*>[\s\S]*?<\/script>/gi, '');
    if (markup.includes('id="ri-global-font-controls"')) return markup;
    const setup = '<script id="ri-global-font-controls">(' + riInstallFontControls.toString() + ')();<\/script>';
    const closingBody = markup.toLowerCase().lastIndexOf('</body>');
    return closingBody >= 0 ? markup.slice(0, closingBody) + setup + markup.slice(closingBody) : markup + setup;
  }

  async function render(page) {
    const snapshot = await RomanoData.catalog();
    const available = new Map(snapshot.data.books.filter(entry => entry.kind === 'page-content')
      .map(entry => [entry.path.slice(0, -5), entry]));
    const paths = [...new Set([...page.html.matchAll(slots)].map(match => match[1]))];
    const values = new Map(await Promise.all(paths.map(async path => {
      const entry = available.get(path);
      if (!entry) throw new Error('Nedostaje centralni izvor: ' + path);
      return [path, await RomanoData.book(entry, snapshot.source)];
    })));
    const html = page.html.replace(slots, (_, path, type, id) => {
      const map = values.get(path)[type === 't' ? 'texts' : 'datasets'];
      if (!Object.hasOwn(map, id)) throw new Error('Nedostaje sadržaj: ' + id);
      const value = map[id];
      if (type === 't') return escapeText(value);
      return escapeJSON(type === 'q' ? JSON.stringify(value) : type === 'm' ? {...map.osnova, ...value} : value);
    });
    return withFontControls(await renderMenu(html, snapshot));
  }

  async function expand(source) {
    const page = template(new DOMParser().parseFromString(source, 'text/html'));
    return page ? render(page) : source;
  }

  async function addBooks(section) {
    if (section === 'historia' || section === 'tabari' || section === 'hadisja') return;
    const snapshot = await RomanoData.catalog();
    const books = snapshot.data.books.filter(entry => entry.kind === 'book' && (entry.section === section || (section === 'angluni' && !RomanoData.portal && entry.section === 'donacia')));
    if (!books.length) return;
    const activePage = [...document.querySelectorAll('.page[id]')].find(node => !node.hidden);
    const area = activePage || document.querySelector('main') || document.body;
    if (!area) return;
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Knjige u rubrici');
    const list = document.createElement('ul');
    for (const book of books) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      const readerRoot = RomanoData.portal ? new URL('https://app.romano-islam.de/') : root;
      const target = new URL('taberi/historija.html', readerRoot);
      target.searchParams.set('section', book.section);
      target.searchParams.set('book', book.id);
      target.hash = 'historija';
      link.href = target.href;
      link.textContent = book.title;
      item.append(link);
      list.append(item);
    }
    nav.append(list);
    area.append(nav);
  }

  window.RomanoPage = Object.freeze({expand, addBooks});
  const page = template(document);
  if (!page) return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('offline-sw.js', root), {scope: root.pathname}).catch(() => {});
  }

  render(page).then(markup => {
    if (page.extra) {
      const setup = '<script>RomanoPage.addBooks(' + JSON.stringify(page.section) +
        ').catch(() => {});<\/script>';
      const closingBody = markup.toLowerCase().lastIndexOf('</body>');
      if (closingBody >= 0) markup = markup.slice(0, closingBody) + setup + markup.slice(closingBody);
    }
    document.open();
    document.write(markup);
    document.close();
  }).catch(error => {
    console.error(error);
    document.getElementById('ri-page-loading').textContent =
      'Sadržaj nije dostupan. Poveži se s internetom i osvježi stranicu.';
  });
})();
