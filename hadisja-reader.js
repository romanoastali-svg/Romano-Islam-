/* HADISJA: full-collection indexed reader. No changes to Quran, Tabari or APP design. */
(()=>{'use strict';
const ROOT=document.getElementById('hadisja-reader');if(!ROOT)return;
const BASE='https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/';
const BOOKS=[['bukhari','Sahih Buhari'],['muslim','Sahih Muslim'],['abudawud','Sunen Ebu Davud'],['tirmidhi','Džami’ Tirmizi'],['ibnmajah','Sunen Ibn Madže'],['nawawi','40 Nevevijevih hadisa']];
const LANGS=[['ara','Arapski izvornik'],['eng','English'],['tur','Türkçe'],['bos','Bosanski — naš prijevod']];
// Only temporary display limits while an Arabic edition index is loading; not asserted as source totals.
const APPROX={bukhari:7589,muslim:7563,abudawud:5274,tirmidhi:3998,ibnmajah:4343,nawawi:42};
const $=id=>ROOT.querySelector('#'+id), state={book:'bukhari',number:1,lang:'ara'};
const cache=new Map(), indices=new Map(), chapterTitles=new Map(), chapterLoads=new Map(), sel=$('hj-book'),langs=$('hj-langs'),status=$('hj-status'),content=$('hj-text'),credit=$('hj-credit');
let num=$('hj-number');
BOOKS.forEach(([key,name])=>{const o=document.createElement('option');o.value=key;o.textContent=name;sel.appendChild(o)});
LANGS.forEach(([key,label])=>{const b=document.createElement('button');b.type='button';b.className='hj-lang';b.dataset.lang=key;b.textContent=label;b.addEventListener('click',()=>{state.lang=key;render();loadChapters(key,state.book)});langs.appendChild(b)});
const friendly=()=>BOOKS.find(x=>x[0]===state.book)[1];
const index=()=>indices.get(state.book);
const max=()=>index()?.max||APPROX[state.book];
function msg(v){status.textContent=v}
function initInput(){const old=$('hj-number');if(old.tagName.toLowerCase()==='select'){
 const input=document.createElement('input');input.id='hj-number';input.type='number';input.inputMode='numeric';input.min='1';input.step='1';input.value='1';input.setAttribute('aria-label','Unesi broj hadisa');old.replaceWith(input);num=input;
 }else{num.type='number';num.min='1';num.step='1';num.inputMode='numeric'}
 num.addEventListener('change',()=>jump(num.value));num.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump(num.value)}});
}
function selectedChapter(){const chapter=$('hj-chapter');return chapter?.value||''}
// Verified-language presentation. Never leak English as a fallback in other language modes.
const CHAPTER_GLOSSARY={
 'revelation':['كتاب بدء الوحي','Vahyin Başlangıcı','Početak objave'],
 'beginning of revelation':['كتاب بدء الوحي','Vahyin Başlangıcı','Početak objave'],
 'belief':['كتاب الإيمان','İman','Vjerovanje'],
 'faith':['كتاب الإيمان','İman','Vjerovanje'],
 'knowledge':['كتاب العلم','İlim','Znanje'],
 'ablutions':['كتاب الوضوء','Abdest','Abdest'],
 'ablution':['كتاب الوضوء','Abdest','Abdest'],
 'wudu':['كتاب الوضوء','Abdest','Abdest'],
 'bathing':['كتاب الغسل','Gusül','Gusul'],
 'ghusl':['كتاب الغسل','Gusül','Gusul'],
 'menstrual periods':['كتاب الحيض','Hayız','Menstruacija'],
 'menstruation':['كتاب الحيض','Hayız','Menstruacija'],
 'tayammum':['كتاب التيمم','Teyemmüm','Tejemum'],
 'prayer':['كتاب الصلاة','Namaz','Namaz'],
 'prayers':['كتاب الصلاة','Namaz','Namaz'],
 'times of the prayers':['كتاب مواقيت الصلاة','Namaz Vakitleri','Namaska vremena'],
 'times of prayer':['كتاب مواقيت الصلاة','Namaz Vakitleri','Namaska vremena'],
 'call to prayers':['كتاب الأذان','Ezan','Ezan'],
 'call to prayer':['كتاب الأذان','Ezan','Ezan'],
 'adhan':['كتاب الأذان','Ezan','Ezan'],
 'friday prayer':['كتاب الجمعة','Cuma Namazı','Džuma-namaz'],
 'friday':['كتاب الجمعة','Cuma','Petak'],
 'fear prayer':['كتاب صلاة الخوف','Korku Namazı','Namaz u strahu'],
 'two festivals':['كتاب العيدين','Bayramlar','Dva bajrama'],
 'eid':['كتاب العيدين','Bayramlar','Bajrami'],
 'witr prayer':['كتاب الوتر','Vitir Namazı','Vitir-namaz'],
 'witr':['كتاب الوتر','Vitir Namazı','Vitir-namaz'],
 'funerals':['كتاب الجنائز','Cenazeler','Dženaze'],
 'funeral':['كتاب الجنائز','Cenazeler','Dženaze'],
 'zakat':['كتاب الزكاة','Zekât','Zekat'],
 'charity':['كتاب الصدقة','Sadaka','Sadaka'],
 'fasting':['كتاب الصوم','Oruç','Post'],
 'fast':['كتاب الصوم','Oruç','Post'],
 'taraweeh':['كتاب صلاة التراويح','Teravih Namazı','Teravih-namaz'],
 'night prayer':['كتاب قيام الليل','Gece Namazı','Noćni namaz'],
 'pilgrimage':['كتاب الحج','Hac','Hadž'],
 'hajj':['كتاب الحج','Hac','Hadž'],
 'umrah':['كتاب العمرة','Umre','Umra'],
 'fighting for the cause of allah':['كتاب الجهاد والسير','Cihad ve Siyer','Džihad i vojni pohodi'],
 'jihad':['كتاب الجهاد','Cihad','Džihad'],
 'marriage':['كتاب النكاح','Nikâh','Brak'],
 'divorce':['كتاب الطلاق','Talak','Razvod'],
 'food':['كتاب الأطعمة','Yiyecekler','Hrana'],
 'foods':['كتاب الأطعمة','Yiyecekler','Hrana'],
 'drinks':['كتاب الأشربة','İçecekler','Pića'],
 'dress':['كتاب اللباس','Giyim','Odjeća'],
 'clothing':['كتاب اللباس','Giyim','Odjeća'],
 'medicine':['كتاب الطب','Tıp','Medicina'],
 'patients':['كتاب المرضى','Hastalar','Bolesnici'],
 'good manners':['كتاب الأدب','Edep','Lijepo ponašanje'],
 'manners':['كتاب الأدب','Edep','Ponašanje'],
 'etiquette':['كتاب الأدب','Edep','Lijepo ponašanje'],
 'invocations':['كتاب الدعوات','Dualar','Dove'],
 'supplications':['كتاب الدعاء','Dualar','Dove'],
 'supplication':['كتاب الدعاء','Dualar','Dova'],
 'destiny':['كتاب القدر','Kader','Određenje'],
 'divine decree':['كتاب القدر','Kader','Allahovo određenje'],
 'oaths':['كتاب الأيمان والنذور','Yeminler','Zakletve'],
 'vows':['كتاب النذور','Adaklar','Zavjeti'],
 'dreams':['كتاب التعبير','Rüyalar','Snovi'],
 'interpretation of dreams':['كتاب التعبير','Rüya Tabiri','Tumačenje snova'],
 'prophets':['كتاب أحاديث الأنبياء','Peygamberler','Vjerovjesnici'],
 'stories of the prophets':['كتاب أحاديث الأنبياء','Peygamberlerin Kıssaları','Kazivanja o vjerovjesnicima'],
 'virtues':['كتاب الفضائل','Faziletler','Vrline'],
 'virtues of the quran':['كتاب فضائل القرآن','Kur’an’ın Faziletleri','Vrijednosti Kur’ana'],
 'interpretation of the quran':['كتاب التفسير','Kur’an Tefsiri','Tefsir Kur’ana'],
 'commentary':['كتاب التفسير','Tefsir','Tefsir'],
 'transactions':['كتاب البيوع','Alışveriş','Kupoprodaja'],
 'sales':['كتاب البيوع','Satışlar','Prodaja'],
 'buying and selling':['كتاب البيوع','Alışveriş','Kupoprodaja'],
 'hiring':['كتاب الإجارة','İcâre','Najam'],
 'agriculture':['كتاب المزارعة','Ziraat','Poljoprivreda'],
 'loans':['كتاب القرض','Borçlar','Pozajmice'],
 'gifts':['كتاب الهبة','Hibeler','Pokloni'],
 'inheritance':['كتاب الفرائض','Miras','Nasljedstvo'],
 'wills':['كتاب الوصايا','Vasiyetler','Oporuke'],
 'testaments':['كتاب الوصايا','Vasiyetler','Oporuke'],
 'witnesses':['كتاب الشهادات','Şahitlik','Svjedoci'],
 'testimony':['كتاب الشهادات','Şahitlik','Svjedočenje'],
 'judgments':['كتاب الأحكام','Hükümler','Presude'],
 'judgement':['كتاب الأحكام','Hükümler','Presude'],
 'judgments ahkaam':['كتاب الأحكام','Hükümler','Presude'],
 'punishments':['كتاب الحدود','Had Cezaları','Kazne'],
 'penalties':['كتاب الحدود','Cezalar','Kazne'],
 'blood money':['كتاب الديات','Diyet','Krvarina'],
 'hudud':['كتاب الحدود','Had Cezaları','Propisane kazne'],
 'slaves':['كتاب العتق','Köle Azadı','Robovi'],
 'manumission':['كتاب العتق','Köle Azadı','Oslobađanje robova'],
 'peace treaty':['كتاب الصلح','Sulh','Pomirenje'],
 'reconciliation':['كتاب الصلح','Sulh','Pomirenje'],
 'oppression':['كتاب المظالم','Zulüm','Nepravda'],
 'injustice':['كتاب المظالم','Zulüm','Nepravda'],
 'good deeds':['كتاب الرقاق','İyi Ameller','Dobra djela'],
 'heart softening':['كتاب الرقاق','Kalbi Yumuşatan Sözler','Omekšavanje srca'],
 'ar-riqaq':['كتاب الرقاق','Rikak','Omekšavanje srca'],
 'trials':['كتاب الفتن','Fitneler','Iskušenja'],
 'afflictions':['كتاب الفتن','Fitneler','Iskušenja'],
 'tribulations':['كتاب الفتن','Fitneler','Iskušenja'],
 'faith and its branches':['كتاب الإيمان','İman','Vjerovanje'],
 'purification':['كتاب الطهارة','Taharet','Čistoća'],
 'mosques':['كتاب المساجد','Mescitler','Džamije'],
 'mosques and places of prayer':['كتاب المساجد ومواضع الصلاة','Mescitler ve Namaz Yerleri','Džamije i mjesta za namaz'],
 'travel':['كتاب السفر','Sefer','Putovanje'],
 'travellers':['كتاب صلاة المسافرين','Yolcular','Putnici'],
 'virtue of the companions':['كتاب فضائل الصحابة','Sahabenin Faziletleri','Vrline ashaba'],
 'companions':['كتاب الصحابة','Sahabe','Ashabi'],
 'signs of the day of judgment':['كتاب الفتن وأشراط الساعة','Kıyamet Alametleri','Predznaci Sudnjeg dana'],
 'day of judgment':['كتاب القيامة','Kıyamet','Sudnji dan'],
 'repentance':['كتاب التوبة','Tövbe','Pokajanje'],
 'remembrance':['كتاب الذكر','Zikir','Zikr'],
 'paradise':['كتاب الجنة','Cennet','Džennet'],
 'hell':['كتاب النار','Cehennem','Džehennem'],
 'hypocrites':['كتاب صفات المنافقين','Münafıklar','Licemjeri'],
 'hypocrisy':['كتاب النفاق','Münafıklık','Licemjerstvo'],
 'knowledge and seeking permission':['كتاب الاستئذان','İzin İsteme','Traženje dopuštenja'],
 'seeking permission':['كتاب الاستئذان','İzin İsteme','Traženje dopuštenja'],
 'greetings':['كتاب السلام','Selam','Pozdravi'],
 'salutations':['كتاب السلام','Selam','Pozdravi'],
 'horses':['كتاب الخيل','Atlar','Konji'],
 'hunting':['كتاب الصيد','Avcılık','Lov'],
 'sacrifices':['كتاب الأضاحي','Kurbanlar','Kurbani'],
 'sacrifice':['كتاب الأضاحي','Kurbanlar','Kurbani'],
 'aqiqah':['كتاب العقيقة','Akika','Akika'],
 'aqiqa':['كتاب العقيقة','Akika','Akika'],
 'provisions':['كتاب النفقات','Nafaka','Izdržavanje'],
 'maintenance':['كتاب النفقات','Nafaka','Izdržavanje'],
 'partnership':['كتاب الشركة','Ortaklık','Partnerstvo'],
 'guarantees':['كتاب الكفالة','Kefalet','Jemstvo'],
 'debt transfer':['كتاب الحوالات','Havale','Prijenos duga'],
 'mortgaging':['كتاب الرهن','Rehin','Zalog'],
 'mortgage':['كتاب الرهن','Rehin','Zalog'],
 'lost things':['كتاب اللقطة','Buluntu Eşya','Izgubljene stvari'],
 'findings':['كتاب اللقطة','Buluntu Eşya','Nađene stvari'],
 'one fifth of booty':['كتاب فرض الخمس','Humus','Petina ratnog plijena'],
 'booty':['كتاب المغازي','Ganimet','Ratni plijen'],
 'expeditions':['كتاب المغازي','Gazveler','Vojni pohodi'],
 'military expeditions':['كتاب المغازي','Gazveler','Vojni pohodi'],
 'obligatory charity tax':['كتاب الزكاة','Zekât','Zekat'],
 'obligatory charity':['كتاب الزكاة','Zekât','Zekat']
};
// Arapski nazivi prema redoslijedu poglavlja: https://sunnah.com/muslim
const MUSLIM_ARABIC_CHAPTERS=["المقدمة", "كتاب الإيمان", "كتاب الطهارة", "كتاب الحيض", "كتاب الصلاة", "كتاب الْمَسَاجِدِ وَمَوَاضِعِ الصَّلاَةِ", "كتاب صلاة المسافرين وقصرها", "كتاب الجمعة", "كتاب صلاة العيدين", "كتاب صلاة الاستسقاء‏", "كتاب الكسوف", "كتاب الجنائز", "كتاب الزكاة", "كتاب الصيام", "كتاب الاعتكاف", "كتاب الحج", "كتاب النكاح", "كتاب الرضاع", "كتاب الطلاق", "كتاب اللعان", "كتاب العتق", "كتاب البيوع", "كتاب المساقاة", "كتاب الفرائض", "كتاب الهبات", "كتاب الوصية", "كتاب النذر", "كتاب الأيمان", "كتاب القسامة والمحاربين والقصاص والديات", "كتاب الحدود", "كتاب الأقضية", "كتاب اللقطة", "كتاب الجهاد والسير", "كتاب الإمارة", "كتاب الصيد والذبائح وما يؤكل من الحيوان", "كتاب الأضاحى", "كتاب الأشربة", "كتاب اللباس والزينة", "كتاب الآداب", "كتاب السلام", "كتاب الألفاظ من الأدب وغيرها", "كتاب الشعر", "كتاب الرؤيا", "كتاب الفضائل", "كتاب فضائل الصحابة رضى الله تعالى عنهم", "كتاب البر والصلة والآداب", "كتاب القدر", "كتاب العلم", "كتاب الذكر والدعاء والتوبة والاستغفار", "كتاب الرقاق", "كتاب التوبة", "كتاب صفات المنافقين وأحكامهم", "كتاب صفة القيامة والجنة والنار", "كتاب الجنة وصفة نعيمها وأهلها", "كتاب الفتن وأشراط الساعة", "كتاب الزهد والرقائق", "كتاب التفسير"];
function englishKey(s){return String(s||'').normalize('NFKD').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[’‘'"`]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function translationFor(en,lang){
 const key=englishKey(en);let row=CHAPTER_GLOSSARY[key];
 
 return row?row[{ara:0,tur:1,bos:2}[lang]]:null;
}
function properLocalized(value, lang, english){
 const s=String(value||'').trim();if(!s)return '';
 if(lang==='ara')return /[\u0600-\u06ff]/.test(s)?s:'';
 if(lang==='tur')return englishKey(s)===englishKey(english)?'':s;
 return lang==='eng'?s:'';
}
function updateChapters(){
 const select=$('hj-chapter');if(!select)return;
 const preserve=select.value, idx=index(),language=state.lang;
 select.replaceChildren();const first=document.createElement('option');first.value='';
 first.textContent={ara:'جميع الأبواب',tur:'Tüm bölümler',eng:'All chapters',bos:'Sva poglavlja'}[language]||'Sva poglavlja';select.appendChild(first);
 if(!idx)return;
 if(state.book==='nawawi'){
  for(let n=1;n<=42;n++){
   const opt=document.createElement('option');opt.value=String(n);
   opt.textContent=({ara:'الحديث',tur:'Hadis',eng:'Hadith',bos:'Hadis'}[language])+' '+n+(n>10?' 🔒':'');
   select.appendChild(opt);
  }
  select.dir=language==='ara'?'rtl':'ltr';select.lang={ara:'ar',tur:'tr',eng:'en',bos:'bs'}[language];
  if(Array.from(select.options).some(o=>o.value===preserve))select.value=preserve;
  return;
 }
 const localized=chapterTitles.get(language+'-'+state.book)||[];
 const ar=chapterTitles.get('ara-'+state.book)||[];
 const en=chapterTitles.get('eng-'+state.book)||[];
 const bs=window.HADISJA_BOSANSKI_POGLAVLJA?.[state.book]||{};
  const araCustom=window.HADISJA_ARAPSKI_POGLAVLJA?.[state.book]||{};

 let optMissingCount=0;
 for(let i=0;i<idx.chapters.length;i++){
  const row=idx.chapters[i];
  const match=rows=>rows.find(x=>String(x.key)===String(row.key))||rows.find(x=>Number(x.start)===Number(row.start))||rows[i];
  const picked=match(localized),a=match(ar),e=match(en);
  const enTitle=e?.name||row.name;
  const bsName=language==='bos'?bs[String(row.key)]||bs[String(i+1)]||bs[String(row.start)]:'';
  let title='';
  if(language==='eng')title=properLocalized(picked?.name,'eng',enTitle)||enTitle;
  else if(language==='ara')title=araCustom[String(row.key)]||(state.book==='muslim'?MUSLIM_ARABIC_CHAPTERS[Number(row.key)]:'')||properLocalized(picked?.name,'ara',enTitle)||properLocalized(a?.name,'ara',enTitle)||translationFor(enTitle,'ara');
  else if(language==='tur')title=properLocalized(picked?.name,'tur',enTitle)||translationFor(enTitle,'tur');
  else title=bsName||translationFor(enTitle,'bos');
  // An unknown title is explicitly identified by its chapter number rather than mislabeled in English.
  if(!title){
   // Nije pronađen provjeren prijevod: zadržavamo stvarni izvorni arapski naslov,
   // nikada izmišljeni naziv, broj ili engleski naslov u drugom jeziku.
   title=properLocalized(a?.name,'ara',enTitle)||properLocalized(row.name,'ara',enTitle)||'';
  }
  if(!title){
    // Ne izmišljamo poglavlja niti neprovjerene prijevode.
    optMissingCount++;
    continue;
  }
  const opt=document.createElement('option');opt.value=String(row.start);opt.textContent=title+' ('+row.start+')';
  if(language==='ara')opt.dir='rtl';select.appendChild(opt);
 }
 select.dir=language==='ara'?'rtl':'ltr';select.lang={ara:'ar',tur:'tr',eng:'en',bos:'bs'}[language];
 if(Array.from(select.options).some(o=>o.value===preserve))select.value=preserve;
 if(optMissingCount)msg('Neki stvarni naslovi poglavlja još nisu dostupni u izvoru.');
}

function sync(){num.max=String(max());num.value=String(state.number);const finder=$('hj-find-number');if(finder){finder.max=String(max());finder.value=String(state.number)}
 const badge=$('hj-total');if(badge)badge.textContent=index()?('Ukupno u arapskom izdanju: '+index().count+' · najviši broj: '+index().max):('Učitavanje numeracije zbirke…');
 $('hj-back').disabled=state.number<=1;$('hj-next').disabled=state.number>=max();
 updateChapters();
}
function jump(value){const n=Number(value);if(!Number.isInteger(n)||n<1||n>max()){msg('Unesi broj hadisa od 1 do '+max()+'.');sync();return}
 state.number=n;sync();render()}
function move(delta){jump(Math.max(1,Math.min(max(),state.number+delta)))}
async function fetchJson(url){let last;for(const u of [url+'.min.json',url+'.json']){try{const r=await fetch(u);if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}catch(e){last=e}}throw last}
function sectionItems(raw){
 const metadata=raw?.metadata||{};const names=metadata.sections||{};
 const details=metadata.section_details||metadata.sectionDetails||{};
 const items=Array.isArray(names)?names.map((val,i)=>[String(i+1),val]):Object.entries(names);
 const list=[];
 const referenceStart=new Map();
 // The hadith-api editions provide book numbers in reference.book. Use the actual records to find boundaries.
 for(const h of (Array.isArray(raw?.hadiths)?raw.hadiths:[])){
  const r=h.reference||{};const key=r.book??r.bookNumber??h.book??h.section;
  const n=Number(h.hadithnumber);
  if(key!=null && Number.isInteger(n) && n>0){const k=String(key);if(!referenceStart.has(k)||n<referenceStart.get(k))referenceStart.set(k,n)}
 }
 for(const [key,value] of items){
  const detail=details[key]||{};
  let name=typeof value==='string'?value:(value?.name||value?.title||value?.section||'');
  let start=Number(detail.hadithnumber_first??detail.firsthadith??detail.start??detail.hadithnumber??value?.firsthadith??value?.start??referenceStart.get(String(key)));
  if(!Number.isInteger(start)||start<1)start=referenceStart.get(String(key));
  if(name&&Number.isInteger(start)&&start>0)list.push({key:String(key),name:String(name),start});
 }
 // Support editions that declare chapters as an array of objects, but have no `sections` mapping.
 if(!list.length&&Array.isArray(names)){
  for(let i=0;i<names.length;i++){const x=names[i];const key=String(x?.number??x?.id??i+1);const n=Number(x?.firsthadith??x?.start??referenceStart.get(key));const name=x?.name||x?.title;
   if(name&&Number.isInteger(n)&&n>0)list.push({key,name:String(name),start:n});}
 }
 return list.sort((a,b)=>a.start-b.start);
}
async function loadChapters(language,book){
 if(language==='bos'){if(!chapterTitles.has('eng-'+book))await loadChapters('eng',book);updateChapters();return}
 const id=language+'-'+book;
 if(chapterTitles.has(id)){if(state.book===book&&state.lang===language)updateChapters();return}
 if(chapterLoads.has(id))return chapterLoads.get(id);
 const task=(async()=>{try{
  const raw=await fetchJson(BASE+id);const chapters=sectionItems(raw);chapterTitles.set(id,chapters);
  if(state.book===book&&state.lang===language)updateChapters();
 }catch(e){if(state.book===book&&state.lang===language)msg('Naslovi poglavlja za odabrani jezik nisu dostupni; prikazan je izvorni naziv.');}
 finally{chapterLoads.delete(id)}})();chapterLoads.set(id,task);return task;
}
async function loadIndex(book){if(indices.has(book))return;
 try{
  // This edition index is used only for navigation; text of locked hadiths is never rendered.
  const raw=await fetchJson(BASE+'ara-'+book);
  const items=Array.isArray(raw.hadiths)?raw.hadiths:[];
  const numbers=items.map(x=>Number(x.hadithnumber)).filter(n=>Number.isInteger(n)&&n>0);
  if(!numbers.length)throw Error('Nema brojeva');
  const maxNo=Math.max(...numbers);const chapterRows=sectionItems(raw);chapterTitles.set('ara-'+book,chapterRows);
  // Preserve actual metadata count and maximum; never substitute the user's approximate counts.
  indices.set(book,{max:maxNo,count:new Set(numbers).size,chapters:chapterRows});
  if(state.book===book){sync();msg('Učitana numeracija: '+indices.get(book).count+' hadisa.');loadChapters(state.lang,book);}
 }catch(e){if(state.book===book)msg('Numeracija nije učitana; privremeni opseg. Provjeri internet.');}
}
async function load(lang,book,number){const key=lang+'-'+book+'/'+number;if(cache.has(key))return cache.get(key);
 const raw=await fetchJson(BASE+lang+'-'+book+'/'+number);
 const item=Array.isArray(raw.hadiths)?raw.hadiths.find(x=>Number(x.hadithnumber)===number):raw.hadith||raw;
 if(lang==='tur'&&book==='tirmidhi'&&item&&typeof item.text==='string'&&!item.text.trim()){
  return {text:'Turski prijevod za hadis '+number+' nije dostupan u izvornom izdanju.',number};
 }
 if(!item||typeof item.text!=='string'||!item.text.trim())throw Error('Nema teksta');
 const data={text:item.text,number:item.hadithnumber??number};cache.set(key,data);if(cache.size>80)cache.delete(cache.keys().next().value);return data;
}
function setText(value,lang){content.textContent=String(value??'');content.dir=lang==='ara'?'rtl':'ltr';content.lang={ara:'ar',eng:'en',tur:'tr',bos:'bs'}[lang]}
async function render(){sync();const {book,number,lang}=state;const token=[book,number,lang].join('|');
 langs.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.lang===lang));
 credit.textContent='Autor: Huseini Halil Ibn Ramadan — Romano Islam';
 if(number>10){$('hj-lock').hidden=false;content.hidden=true;msg('Hadis '+number+' od '+max()+' je zaključan u probnoj verziji.');return}
 $('hj-lock').hidden=true;content.hidden=false;
 if(lang==='bos'){const translation=window.HADISJA_BOSANSKI?.[book+':'+number];setText(translation||'Bosanski prijevod za ovaj hadis još nije unesen.',lang);msg(translation?'Autorski bosanski prijevod':'Bosanski prijevod u pripremi');return}
 setText('Učitavanje…','eng');msg('Učitavanje hadisa '+number+'…');
 try{const result=await load(lang,book,number);if(token!==[state.book,state.number,state.lang].join('|'))return;
 setText(result.text,lang);msg(friendly()+' · Hadis '+result.number+' / '+max())}
 catch(e){if(token!==[state.book,state.number,state.lang].join('|'))return;setText('Tekst trenutno nije dostupan. Pokušajte ponovo.', 'eng');msg('Greška učitavanja; provjeri vezu ili dostupnost prijevoda.')}
}
sel.addEventListener('change',()=>{state.book=sel.value;state.number=1;sync();render();loadIndex(state.book);loadChapters(state.lang,state.book)});
$('hj-back').addEventListener('click',()=>move(-1));$('hj-next').addEventListener('click',()=>move(1));
const finder=$('hj-find-number');function findNumber(){jump(finder.value)}
$('hj-find-button')?.addEventListener('click',findNumber);finder?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findNumber()}});
$('hj-unlock')?.addEventListener('click',()=>msg('Kupovina još nije povezana. VIP je samo demonstracijski prikaz.'));
$('hj-code-button')?.addEventListener('click',()=>msg('Aktivacijski kodovi još nisu dostupni bez sigurne serverske provjere.'));
initInput();

// Tekstualna pretraga samo unutar izabrane zbirke i jezika.
const searchPanel=document.createElement('section');
searchPanel.id='hj-word-panel';searchPanel.className='hj-word-panel';
const searchLabel=document.createElement('label');searchLabel.htmlFor='hj-word-input';searchLabel.textContent='Rode o lafja — riječ ili rečenica';
const searchForm=document.createElement('form');searchForm.id='hj-word-form';searchForm.className='hj-word-form';
const searchInput=document.createElement('input');searchInput.id='hj-word-input';searchInput.type='search';searchInput.required=true;searchInput.autocomplete='off';searchInput.placeholder='Traži u tekstu hadisa';
const searchButton=document.createElement('button');searchButton.type='submit';searchButton.textContent='Rode o lafja';
searchForm.append(searchInput,searchButton);
const searchStatus=document.createElement('p');searchStatus.id='hj-word-status';searchStatus.setAttribute('role','status');searchStatus.setAttribute('aria-live','polite');
const searchResults=document.createElement('div');searchResults.id='hj-word-results';searchResults.className='hj-word-results';
searchPanel.append(searchLabel,searchForm,searchStatus,searchResults);
const nav=$('hj-back')?.closest('.hj-nav');
if(nav)nav.parentNode.insertBefore(searchPanel,nav);
else ROOT.appendChild(searchPanel);
const editionsCache=new Map();
let requestId=0, matches=[], displayCount=30;
const normalizeWords=(s)=>String(s??'').normalize('NFKC')
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'').toLocaleLowerCase()
  .replace(/\s+/g,' ').trim();
async function getSearchEdition(book,lang) {
 const id=lang+'-'+book;
 if(lang==='bos'){
   return Object.entries(window.HADISJA_BOSANSKI||{})
     .filter(([key,value])=>key.startsWith(book+':')&&typeof value==='string')
     .map(([key,text])=>({hadithnumber:Number(key.slice(book.length+1)),text}));
 }
 if(editionsCache.has(id))return editionsCache.get(id);
 const raw=await fetchJson(BASE+id);
 if(!Array.isArray(raw.hadiths))throw new Error('Nema tekstova u izdanju');
 // Bounded cache: one large edition at a time.
 editionsCache.clear();
 editionsCache.set(id,raw.hadiths);
 return raw.hadiths;
}
function showSearchResults(){
 searchResults.replaceChildren();
 for(const row of matches.slice(0,displayCount)){
  const button=document.createElement('button');button.type='button';button.className='hj-word-result';
  const head=document.createElement('strong');
  head.textContent='Hadis '+row.hadithnumber+(row.hadithnumber>10?' 🔒':'');
  button.appendChild(head);
  // Do not expose text of locked hadiths in the freemium interface.
  if(row.hadithnumber<=10){
    const excerpt=document.createElement('small');
    excerpt.textContent=row.text.replace(/\s+/g,' ').slice(0,155)+(row.text.length>155?'…':'');
    button.appendChild(excerpt);
  }
  button.addEventListener('click',()=>{
    jump(row.hadithnumber);
    const target=$(row.hadithnumber>10?'hj-lock':'hj-text');
    target?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  searchResults.appendChild(button);
 }
 if(matches.length>displayCount){
  const more=document.createElement('button');more.type='button';more.className='hj-word-more';
  more.textContent='Prikaži još rezultata';
  more.addEventListener('click',()=>{displayCount+=30;showSearchResults()});
  searchResults.appendChild(more);
 }
}
searchForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const query=normalizeWords(searchInput.value);
 if(!query){searchStatus.textContent='Upiši riječ ili rečenicu.';return}
 const id=++requestId,book=state.book,lang=state.lang;
 searchButton.disabled=true;
 searchStatus.textContent='Pretražujem tekstove u odabranoj zbirci i jeziku…';
 searchResults.replaceChildren();
 try{
   const rows=await getSearchEdition(book,lang);
   if(id!==requestId)return;
   matches=rows.filter(row=>Number.isInteger(Number(row.hadithnumber)) &&
     typeof row.text==='string'&&normalizeWords(row.text).includes(query))
     .map(row=>({hadithnumber:Number(row.hadithnumber),text:row.text}));
   displayCount=30;
   searchStatus.textContent=matches.length
     ?'Pronađeno: '+matches.length+' · Odaberi hadis iz rezultata.'
     :'Nije pronađen hadis za taj izraz u izabranoj zbirci i jeziku.';
   showSearchResults();
 }catch(error){
   if(id===requestId)searchStatus.textContent='Pretraga trenutno nije dostupna. Provjeri internet ili podatke za taj jezik.';
 }finally{if(id===requestId)searchButton.disabled=false}
});
function invalidateSearch(){requestId++;matches=[];searchResults.replaceChildren();searchStatus.textContent='';searchButton.disabled=false}
sel.addEventListener('change',invalidateSearch);
langs.addEventListener('click',e=>{if(e.target.closest('[data-lang]'))invalidateSearch()});
window.HADISJA_OTVORI_PRETRAGU=()=>{
 searchPanel.scrollIntoView({behavior:'smooth',block:'start'});
 searchInput.focus({preventScroll:true});
};

const control=num.closest('div');if(control&&!$('hj-total')){const total=document.createElement('div');total.id='hj-total';total.className='hj-total';total.setAttribute('aria-live','polite');control.appendChild(total)}
// Chapters are optional and appear after the original book/index metadata is loaded.
const bookWrap=sel.closest('div');if(bookWrap&&!$('hj-chapter')){const wrapper=document.createElement('div');wrapper.className='hj-chapter-wrap';const label=document.createElement('label');label.htmlFor='hj-chapter';label.textContent='Poglavlja (ako su navedena u izvoru)';const select=document.createElement('select');select.id='hj-chapter';const opt=document.createElement('option');opt.value='';opt.textContent='Sva poglavlja';select.appendChild(opt);select.addEventListener('change',()=>{if(select.value)jump(select.value)});wrapper.append(label,select);bookWrap.appendChild(wrapper)}
sync();render();loadIndex(state.book);loadChapters(state.lang,state.book);
})();
