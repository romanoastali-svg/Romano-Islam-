(()=>{'use strict';window.riPatchKorkutHtml=(html,runtimeURL)=>{
 function once(text,before,after){if(text.split(before).length!==2)throw Error('Neprepoznata verzija čitača: '+before.slice(0,55));return text.replace(before,()=>after);}
 const defaults="settings.readerCompare=false;settings.readerEditions=['mlivo'];let readerSura=";
 html=once(html,defaults,"settings.readerCompare=false;settings.readerEditions=['mlivo'];if(location.hash==='#romane'){settings.romaneArabic=true;settings.romaneTranslation=false;settings.romaneBosnian=true;settings.romaneLatin=false;}let readerSura=");
 const mlivo='<input type="checkbox" class="toggle" id="romaneBosnian" checked></label>';
 html=once(html,mlivo,mlivo+'<label class="setting-row"><span>Besim Korkut</span><input type="checkbox" class="toggle" id="romaneKorkut"></label><p class="note" id="romaneKorkutStatus" role="status">Besim Korkut · Al Quran Cloud</p>');
 html=once(html,'id="romaneTranslation" checked','id="romaneTranslation"');
 html=once(html,'id="romaneLatin" checked','id="romaneLatin"');
 const section=html.match(/(<script\b[^>]*\bid=["']ri-fatiha-kuran-script["'][^>]*>)([\s\S]*?)(<\/script>)/i);if(!section)throw Error('Nedostaje Ajeti Ajeteja prikaz');
 let code=section[2];
 const choices="return {ar:!!$('romaneArabic')?.checked,rom:!!$('romaneTranslation')?.checked,bs:!!$('romaneBosnian')?.checked,latin:!!$('romaneLatin')?.checked};";
 code=once(code,choices,"return {ar:false,rom:!!$('romaneTranslation')?.checked,bs:!!$('romaneBosnian')?.checked,latin:false,korkut:!!$('romaneKorkut')?.checked};");
 code=once(code," const choices=languageChoices();\n for(const [id,enabled,text,cls,lang]of["," const choices=languageChoices();\n if(choices.korkut)window.riKorkutEnsure?.();\n for(const [id,enabled,text,cls,lang]of[");
 code=once(code,"  ['ar',choices.ar&&includeArabic,data.arabic[ref],'ri-fatiha-ar','ar'],\n",'');
 code=once(code,"  ['latin',choices.latin,data.markedPronunciations[ref]||data.pronunciations[ref],'ri-fatiha-latin','bs']","  ['korkut',choices.korkut,window.riKorkutText?.(ref)||'','ri-fatiha-korkut','bs']");
 code=once(code,"for(const id of ['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin']){","for(const id of ['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin','romaneKorkut']){");
 code=once(code,'section.dataset.passage=p.id;section.dataset.sourceUrl=', 'section.dataset.passage=p.id;section.dataset.source=String(p.source);section.dataset.sourceUrl=');
 html=html.replace(section[0],()=>section[1]+code+section[3]);
 const end=html.lastIndexOf('</body>');if(end<0)throw Error('Nedostaje dokument čitača');
 const url=runtimeURL.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
 return html.slice(0,end)+'<script src="'+url+'"><\/script>'+html.slice(end);
};})();

(()=>{'use strict';
if(window.riKorkutReader)return;
const $=id=>document.getElementById(id),control=$('romaneKorkut');if(!control)return;
const counts=JSON.parse($('appData').textContent).counts;
const endpoint='https://api.alquran.cloud/v1/quran/bs.korkut',backup='https://alquran.api.islamic.network/v1/quran/bs.korkut';
let values=null,pending=null,failed=false,scheduled=false;
const status=$('romaneKorkutStatus');
function validate(json){
 const data=json?.data;if(data?.edition?.identifier!=='bs.korkut'||!Array.isArray(data.surahs)||data.surahs.length!==114)throw Error('Neispravno izdanje prijevoda');
 const map={};for(let i=0;i<114;i++){const surah=data.surahs[i];if(surah.number!==i+1||!Array.isArray(surah.ayahs)||surah.ayahs.length!==counts[i])throw Error('Nepotpun prijevod sure');
  for(let a=0;a<surah.ayahs.length;a++){const verse=surah.ayahs[a];if(verse.numberInSurah!==a+1||typeof verse.text!=='string'||!verse.text.trim())throw Error('Nepotpun prijevod ajeta');map[(i+1)+':'+(a+1)]=verse.text;}
 }return map;
}
async function load(){
 let cache;try{cache=await caches.open('ri-korkut-bs-v1');const stored=await cache.match(endpoint);if(stored)return validate(await stored.json());}catch{}
 let last;for(const url of [endpoint,backup]){try{const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);const json=await response.json(),map=validate(json);if(cache)try{await cache.put(endpoint,new Response(JSON.stringify(json),{headers:{'Content-Type':'application/json'}}));}catch{}return map;}catch(error){last=error;}}
 throw last||Error('Prijevod nije učitan');
}
function notifyModal(){if(!$('ri-fatiha-modal')?.hidden)$('romaneBosnian')?.dispatchEvent(new Event('change',{bubbles:true}));}
function paint(){
 const enabled=control.checked;
 for(const article of document.querySelectorAll('#romaneVerses article.verse')){
  const match=article.id.match(/^romane-(\d+)-(\d+)$/);if(!match)continue;let p=article.querySelector('.ri-korkut-text');
  if(!p&&enabled&&values){p=document.createElement('p');p.className='ri-korkut-text';p.lang='bs';const label=document.createElement('span');label.className='pronunciation-label';label.textContent='Besim Korkut';const text=document.createElement('span');text.className='ri-korkut-value';p.append(label,text);article.querySelector('.verse-content').append(p);}
  if(p){p.hidden=!enabled;const text=values?.[match[1]+':'+match[2]]||'',value=p.querySelector('.ri-korkut-value');if(value&&value.textContent!==text)value.textContent=text;}
 }
 const noOtherTranslation=!$('romaneArabic').checked&&!$('romaneTranslation').checked&&!$('romaneBosnian').checked;
 if(enabled&&noOtherTranslation)$('romaneVerses').style.setProperty('display','block','important');else $('romaneVerses').style.removeProperty('display');
 if(enabled&&noOtherTranslation)$('romaneNotice').hidden=true;
}
function ensure(){
 if(values)return Promise.resolve(values);if(pending)return pending;if(failed)return Promise.resolve(null);
 status.textContent='Besim Korkut · učitavanje prijevoda…';
 pending=load().then(map=>{values=map;status.textContent='Besim Korkut · Al Quran Cloud · svih 114 sura';paint();notifyModal();return map;}).catch(error=>{failed=true;status.textContent='Korkutov prijevod nije učitan. Provjeri internet i ponovo uključi dugme.';console.warn('Besim Korkut:',error);return null;}).finally(()=>pending=null);
 return pending;
}
window.riKorkutText=ref=>values?.[ref]||'';window.riKorkutEnsure=ensure;window.riKorkutReader={edition:'bs.korkut',source:endpoint};
control.addEventListener('change',()=>{failed=false;paint();if(control.checked)ensure();else notifyModal();});
for(const id of ['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin'])$(id)?.addEventListener('change',paint);
new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;paint();});}).observe($('romaneVerses'),{childList:true,subtree:true});
const style=document.createElement('style');style.id='ri-korkut-style';style.textContent='#romane .ri-korkut-text,.ri-fatiha-korkut{font-size:var(--ri-reading-size,var(--bs,20px));line-height:1.7;color:var(--ink);margin:10px 0;white-space:pre-wrap}.ri-pc-reader #romane .verse-content>.ri-korkut-text{grid-column:2}.ri-pc-reader #romane.hide-romaneArabic .verse-content>.ri-korkut-text{grid-column:1}#romane .ri-korkut-text[hidden]{display:none!important}#romaneKorkutStatus{font-size:11px;line-height:1.4}';document.head.append(style);
function reset(){if(location.hash!=='#romane')return;for(const [id,checked]of[['romaneArabic',true],['romaneTranslation',false],['romaneBosnian',true],['romaneLatin',false]]){const input=$(id);input.checked=checked;input.dispatchEvent(new Event('change',{bubbles:true}));}control.checked=false;control.dispatchEvent(new Event('change',{bubbles:true}));}
reset();window.addEventListener('pageshow',event=>{if(event.persisted)reset();});
})();
