(()=>{'use strict';window.riPatchKorkutHtml=(html,runtimeURL)=>{
 function once(text,before,after){if(text.split(before).length!==2)throw Error('Neprepoznata verzija čitača: '+before.slice(0,55));return text.replace(before,()=>after);}
 const defaults="settings.readerCompare=false;settings.readerEditions=['mlivo'];let readerSura=";
 html=once(html,defaults,"settings.readerCompare=false;settings.readerEditions=['mlivo'];{const riLanguageDefaults={romaneArabic:true,romaneTranslation:false,romaneBosnian:true,romaneLatin:false,romaneKorkut:false};let riLanguages=null;try{const raw=JSON.parse(localStorage.getItem('ri-reader-languages-v1')||'null');if(raw&&Object.keys(riLanguageDefaults).every(k=>typeof raw[k]==='boolean'))riLanguages=raw;if(!riLanguages){const old=JSON.parse(localStorage.getItem('romano-settings-v2')||'null');if(old&&['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin'].every(k=>typeof old[k]==='boolean'))riLanguages={...riLanguageDefaults,...Object.fromEntries(Object.keys(riLanguageDefaults).filter(k=>typeof old[k]==='boolean').map(k=>[k,old[k]]))};}riLanguages=riLanguages||riLanguageDefaults;localStorage.setItem('ri-reader-languages-v1',JSON.stringify(riLanguages));}catch{riLanguages=riLanguageDefaults;}for(const k of ['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin'])settings[k]=riLanguages[k];window.riInitialReaderLanguages=riLanguages;}let readerSura=");
 const mlivo='<input type="checkbox" class="toggle" id="romaneBosnian" checked></label>';
 html=once(html,mlivo,mlivo+'<label class="setting-row"><span>Besim Korkut</span><input type="checkbox" class="toggle" id="romaneKorkut"></label><p class="note" id="romaneKorkutStatus" role="status" hidden></p>');
 html=once(html,'id="romaneTranslation" checked','id="romaneTranslation"');
 html=once(html,'id="romaneLatin" checked','id="romaneLatin"');
 html=once(html,'function riFollowAllowed(force)',"const riBeforeBosnianTranslation=syncBosanski;syncBosanski=function(...args){const result=riBeforeBosnianTranslation(...args);window.riBosnianTranslationPaint?.();return result;};\nconst riBeforeBosnianEdition=syncEdition;syncEdition=function(...args){const result=riBeforeBosnianEdition(...args);window.riBosnianTranslationPaint?.();return result;};\nfunction riFollowAllowed(force)");
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
const data=JSON.parse($('appData').textContent),counts=data.counts;
const endpoint='https://api.alquran.cloud/v1/quran/bs.korkut',backup='https://alquran.api.islamic.network/v1/quran/bs.korkut';
let values=null,pending=null,failed=false,scheduled=false;
const status=$('romaneKorkutStatus'),bosSelect=$('audioTranslation');
let bosChoice='mlivo';try{if(localStorage.getItem('ri-bosnian-translation-v1')==='korkut')bosChoice='korkut';}catch{}
let bosStatus=null;
if(bosSelect){
 const option=document.createElement('option');option.value='korkut';option.textContent='Besim Korkut';bosSelect.append(option);
 bosStatus=document.createElement('p');bosStatus.className='note';bosStatus.hidden=true;bosStatus.setAttribute('role','status');bosSelect.closest('label').after(bosStatus);
 bosSelect.addEventListener('change',event=>{if(location.hash!=='#bosanski')return;event.stopImmediatePropagation();bosChoice=bosSelect.value==='korkut'?'korkut':'mlivo';try{localStorage.setItem('ri-bosnian-translation-v1',bosChoice);}catch{}failed=false;paintBosnian();if(bosChoice==='korkut')ensure();},true);
}
let loadMessage='';
function updateStatus(){for(const [node,on]of [[status,control.checked&&location.hash==='#romane'],[bosStatus,bosChoice==='korkut'&&location.hash==='#bosanski']]){if(node){node.textContent=on?loadMessage:'';node.hidden=!on||!loadMessage;}}}
function paintBosnian(){
 if(location.hash!=='#bosanski'||!bosSelect)return;
 const state=window.romanoApp?.getAudioState();if(!state)return;
 const ref=state.sura+':'+state.ayah,text=$('bosanskiText'),label=$('bosanskiTranslator');
 bosSelect.value=bosChoice;
 const value=bosChoice==='korkut'?(values?.[ref]||''):(data.mlivo[ref]||'');
 if(text&&text.textContent!==value)text.textContent=value;
 if(label)label.textContent=bosChoice==='korkut'?'Besim Korkut':'Mustafa Mlivo';
 const rolling=$('bosanskiRollingText'),identity=state.sura+':'+bosChoice+':'+!!values;
 if(rolling?.firstElementChild?.dataset.riTranslation!==identity){for(const article of rolling?.querySelectorAll('article.rolling-verse')||[]){const ayah=article.id.match(/^rolling-(\d+)$/)?.[1],p=article.querySelector('p[lang="bs"]');if(!ayah||!p)continue;const key=state.sura+':'+ayah;p.textContent=bosChoice==='korkut'?(values?.[key]||''):(data.mlivo[key]||'');article.dataset.riTranslation=identity;}}
 updateStatus();
}
window.riBosnianTranslationPaint=paintBosnian;
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
 loadMessage='Besim Korkut · učitavanje prijevoda…';updateStatus();
 pending=load().then(map=>{values=map;loadMessage='';updateStatus();paint();paintBosnian();notifyModal();return map;}).catch(error=>{failed=true;loadMessage='Korkutov prijevod nije učitan. Provjeri internet i ponovo uključi dugme.';updateStatus();console.warn('Besim Korkut:',error);return null;}).finally(()=>pending=null);
 return pending;
}
window.riKorkutText=ref=>values?.[ref]||'';window.riKorkutEnsure=ensure;window.riKorkutReader={edition:'bs.korkut',source:endpoint};
control.addEventListener('change',()=>{failed=false;paint();updateStatus();if(control.checked&&location.hash==='#romane')ensure();else notifyModal();});
for(const id of ['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin'])$(id)?.addEventListener('change',paint);
new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;paint();});}).observe($('romaneVerses'),{childList:true,subtree:true});
const style=document.createElement('style');style.id='ri-korkut-style';style.textContent='#romane .ri-korkut-text,.ri-fatiha-korkut{font-size:var(--ri-reading-size,var(--bs,20px));line-height:1.7;color:var(--ink);margin:10px 0;white-space:pre-wrap}.ri-pc-reader #romane .verse-content>.ri-korkut-text{grid-column:2}.ri-pc-reader #romane.hide-romaneArabic .verse-content>.ri-korkut-text{grid-column:1}#romane .ri-korkut-text[hidden]{display:none!important}#romaneKorkutStatus{font-size:11px;line-height:1.4}';document.head.append(style);
const languageIds=['romaneArabic','romaneTranslation','romaneBosnian','romaneLatin','romaneKorkut'];let restoring=false;
function saveLanguages(){if(restoring)return;const choice=Object.fromEntries(languageIds.map(id=>[id,!!$(id)?.checked]));window.riInitialReaderLanguages=choice;try{localStorage.setItem('ri-reader-languages-v1',JSON.stringify(choice));}catch{}}
function restoreLanguages(){
 let choice=window.riInitialReaderLanguages;try{const saved=JSON.parse(localStorage.getItem('ri-reader-languages-v1')||'null');if(saved&&languageIds.every(id=>typeof saved[id]==='boolean'))choice=saved;}catch{}
 if(!choice)return;restoring=true;
 try{for(const id of languageIds){const input=$(id);if(input){input.checked=choice[id];input.dispatchEvent(new Event('change',{bubbles:true}));}}}finally{restoring=false;}
 paint();updateStatus();
}
for(const id of languageIds)$(id)?.addEventListener('change',saveLanguages);
window.riRestoreReaderLanguages=restoreLanguages;
restoreLanguages();paintBosnian();if(location.hash==='#bosanski'&&bosChoice==='korkut')ensure();
window.addEventListener('hashchange',()=>{paintBosnian();if(location.hash==='#bosanski'&&bosChoice==='korkut')ensure();});
window.addEventListener('pageshow',event=>{if(event.persisted){restoreLanguages();paintBosnian();}});

})();
