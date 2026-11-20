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
    return page.html.replace(slots, (_, path, type, id) => {
      const map = values.get(path)[type === 't' ? 'texts' : 'datasets'];
      if (!Object.hasOwn(map, id)) throw new Error('Nedostaje sadržaj: ' + id);
      const value = map[id];
      if (type === 't') return escapeText(value);
      return escapeJSON(type === 'q' ? JSON.stringify(value) : type === 'm' ? {...map.osnova, ...value} : value);
    });
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
