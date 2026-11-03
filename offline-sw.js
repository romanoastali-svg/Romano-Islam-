/* ROMANO ISLAM APP ONLY: offline shell and saved Yasser Al-Dosari recordings. */
const CACHE='romano-islam-flight-shell-v4';
const APP=new URL('./index.html',self.registration.scope).href;
const DB='romano-islam-flight-audio-v1';
function lookup(id){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('recordings'))r.result.createObjectStore('recordings',{keyPath:'id'});};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('recordings','readonly');const q=tx.objectStore('recordings').get(id);q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>{reject(q.error);db.close();};};});}
function respondAudio(blob,req){const size=blob.size;const base={'Content-Type':blob.type||'audio/mpeg','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'};const match=/bytes=(\d+)-(\d*)/.exec(req.headers.get('range')||'');if(match){const start=Number(match[1]),end=match[2]?Math.min(size-1,Number(match[2])):size-1;if(start>=size||end<start)return new Response(null,{status:416,headers:{...base,'Content-Range':'bytes */'+size}});const chunk=blob.slice(start,end+1,blob.type||'audio/mpeg');return new Response(chunk,{status:206,headers:{...base,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(chunk.size)}});}return new Response(blob,{status:200,headers:{...base,'Content-Length':String(size)}});}
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.add(new Request(APP,{cache:'reload'}));await self.skipWaiting();})());});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const all=await caches.keys();await Promise.all(all.filter(k=>k.startsWith('romano-islam-flight-shell-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
 const audioMatch=url.hostname==='audio-cdn.tarteel.ai'&&/^\/quran\/surah\/yasserAlDosari\/murattal\/mp3\/(\d{3})\.mp3$/.exec(url.pathname);
 if(audioMatch){e.respondWith((async()=>{try{const item=await lookup('dosari:'+Number(audioMatch[1]));if(item?.blob instanceof Blob)return respondAudio(item.blob,req);}catch{}return fetch(req);})());return;}
 const scope=new URL(self.registration.scope);if(url.origin!==self.location.origin||!url.pathname.startsWith(scope.pathname))return;
 if(req.mode!=='navigate'&&url.href!==APP)return;
 e.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(req);if(r.ok)await c.put(APP,r.clone()).catch(()=>{});return r;}catch(err){const saved=await c.match(APP);if(saved)return saved;throw err;}})());
});