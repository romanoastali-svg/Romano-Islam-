(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const frame = $('ri-history-frame');
  const heading = document.querySelector('.ri-history-heading h2');
  const toc = $('ri-history-page');
  const search = $('ri-history-results');
  const bookSelect = $('ri-history-book');
  const languageSelect = $('ri-history-language');
  const paper = document.createElement('article');
  frame.append(paper);
  const params = new URLSearchParams(location.search);
  const requestedSection = params.get('section');
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch {} },
  };
  let active, pages = [], current = 0, load = 0, catalogSource;
  let language = storage.get('ri-app-history-language') === 'ar' ? 'ar' : 'bs';
  let size = Math.min(32, Math.max(16, Number(storage.get('ri-app-history-font')) || 20));
  languageSelect.value = language;

  function setFont(delta) {
    size = Math.min(32, Math.max(16, size + delta));
    paper.style.setProperty('--ri-book-font', size + 'px');
    storage.set('ri-app-history-font', size);
  }
  $('ri-history-smaller').onclick = () => setFont(-1);
  $('ri-history-larger').onclick = () => setFont(1);
  setFont(0);

  function message(text) {
    paper.replaceChildren(document.createTextNode(text));
  }

  function folded(text) {
    return text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '');
  }

  function match(text, query) {
    const starts = [], ends = [];
    let plain = '', index = 0;
    for (const letter of text) {
      const end = index + letter.length;
      const normalized = folded(letter);
      for (let i = 0; i < normalized.length; i++) {
        plain += normalized[i];
        starts.push(index);
        ends.push(end);
      }
      index = end;
    }
    const start = plain.indexOf(query);
    return start < 0 ? null : [starts[start], ends[start + query.length - 1]];
  }

  function storageKey(entry) {
    return entry.section === 'tabari' && entry.id === 'tom-1'
      ? 'ri-app-history-page' : 'ri-book-page-' + entry.section + '-' + entry.id;
  }

  function view(position, query = '') {
    if (position < 0 || position >= pages.length) return;
    current = position;
    const page = pages[position];
    const last = pages.at(-1).number;
    $('ri-history-position').textContent = page.number + ' / ' + last;
    $('ri-history-prev').disabled = position === 0;
    $('ri-history-next').disabled = position === pages.length - 1;
    storage.set(storageKey(active), page.number);
    toc.querySelectorAll('button').forEach(button => {
      if (Number(button.dataset.page) === page.number) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    paper.replaceChildren();
    paper.lang = language;
    paper.dir = language === 'ar' ? 'rtl' : 'ltr';
    if (page.title && language === 'bs') {
      const title = document.createElement('h3');
      title.textContent = page.title;
      paper.append(title);
    }
    const content = page.content[language];
    if (!content?.length) {
      const unavailable = document.createElement('p');
      unavailable.textContent = language === 'ar' ? 'Arapski izvornik nije dostupan.' : 'Bosanski prijevod nije dostupan.';
      paper.append(unavailable);
    }
    let firstMark;
    for (const block of content || []) {
      const node = document.createElement(block.type === 'heading' ? 'h3' : 'p');
      if (block.type === 'note') node.className = 'ri-book-note';
      const location = query ? match(block.text, query) : null;
      if (location) {
        const mark = document.createElement('mark');
        mark.textContent = block.text.slice(...location);
        node.append(block.text.slice(0, location[0]), mark, block.text.slice(location[1]));
        firstMark ||= mark;
      } else node.textContent = block.text;
      paper.append(node);
    }
    frame.scrollTop = 0;
    firstMark?.scrollIntoView({block: 'center'});
  }

  function button(label, action) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.onclick = action;
    return item;
  }

  async function open(entry, useRequestedPage = false) {
    const ticket = ++load;
    active = entry;
    pages = [];
    toc.replaceChildren();
    search.hidden = true;
    $('ri-history-prev').disabled = $('ri-history-next').disabled = true;
    $('ri-history-position').textContent = '–';
    heading.textContent = entry.id === 'tom-1' && entry.section === 'tabari' ? 'Historia Tabaria' : entry.title;
    message('Učitavanje knjige…');
    try {
      const data = await RomanoData.book(entry, catalogSource);
      if (ticket !== load) return;
      pages = data.pages;
      const last = pages.at(-1).number;
      $('ri-history-contents').querySelector('summary').textContent = 'Sadržaj · ' + pages[0].number + '–' + last;
      pages.forEach((page, i) => {
        if (page.title || i === 0) {
          const item = button(page.title || 'Stranica ' + page.number, () => {
            $('ri-history-contents').open = false;
            view(i);
          });
          item.dataset.page = page.number;
          toc.append(item);
        }
      });
      const wanted = (useRequestedPage && params.get('page')) || storage.get(storageKey(entry));
      const position = pages.findIndex(page => page.number === Number(wanted));
      if (!pages[Math.max(0, position)].content[language] && pages[Math.max(0, position)].content.bs) {
        language = languageSelect.value = 'bs';
      }
      if (!pages[Math.max(0, position)].content[language] && pages[Math.max(0, position)].content.ar) {
        language = languageSelect.value = 'ar';
      }
      view(Math.max(0, position));
    } catch {
      if (ticket === load) message('Knjiga nije dostupna. Poveži se s internetom i osvježi stranicu.');
    }
  }

  $('ri-history-prev').onclick = () => view(current - 1);
  $('ri-history-next').onclick = () => view(current + 1);
  languageSelect.onchange = () => {
    language = languageSelect.value;
    storage.set('ri-app-history-language', language);
    view(current);
  };
  $('ri-history-search').onsubmit = event => {
    event.preventDefault();
    search.replaceChildren();
    const query = folded($('ri-history-query').value.trim());
    search.hidden = !query;
    if (!query) return;
    pages.forEach((page, index) => {
      const languages = language === 'bs' ? ['bs', 'ar'] : ['ar', 'bs'];
      for (const candidate of languages) {
        const block = page.content[candidate]?.find(item => match(item.text, query));
        if (!block && !(candidate === 'bs' && page.title && match(page.title, query))) continue;
        const result = button(page.number + ' · ' + (page.title || 'Stranica ' + page.number), () => {
          language = languageSelect.value = candidate;
          search.hidden = true;
          view(index, query);
        });
        if (block) {
          const [start, end] = match(block.text, query);
          const snippet = document.createElement('span');
          snippet.textContent = block.text.slice(Math.max(0, start - 30), end + 65);
          snippet.lang = candidate;
          if (candidate === 'ar') snippet.dir = 'rtl';
          result.append(snippet);
        }
        search.append(result);
        break;
      }
    });
    if (!search.childElementCount) search.textContent = 'Nema rezultata.';
  };

  message('Učitavanje kataloga…');
  RomanoData.catalog().then(snapshot => {
    catalogSource = snapshot.source;
    const entries = snapshot.data.books.filter(entry => entry.kind === 'book' &&
      (requestedSection ? entry.section === requestedSection : entry.section === 'historia' || entry.section === 'tabari'));
    if (!entries.length) {
      message('U ovoj rubrici trenutno nema knjiga.');
      return;
    }
    if (params.has('book') && !entries.some(entry => entry.id === params.get('book') &&
        (!params.has('section') || entry.section === params.get('section')))) {
      message('Ova knjiga više nije u katalogu. Odaberi dostupnu knjigu.');
    }
    const wanted = entries.find(entry => entry.id === params.get('book') &&
      (!params.has('section') || entry.section === params.get('section')));
    const selected = wanted || entries.find(entry => entry.section === 'tabari' && entry.id === 'tom-1') || entries[0];
    entries.forEach((entry, i) => bookSelect.add(new Option(entry.title, String(i))));
    bookSelect.hidden = entries.length < 2;
    bookSelect.value = String(entries.indexOf(selected));
    bookSelect.onchange = () => open(entries[Number(bookSelect.value)]);
    return open(selected, true);
  }).catch(() => message('Katalog nije dostupan. Poveži se s internetom i osvježi stranicu.'));
})();
