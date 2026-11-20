/* Published books are data only. Rendering code stays with the app. */
(() => {
  'use strict';
  if (window.RomanoData) return;
  const localRoot = new URL('../data/', document.currentScript.src);
  const native = location.hostname === 'appassets.androidplatform.net';
  const portal = ['www.romano-islam.de', 'romano-islam.de'].includes(location.hostname);
  const remoteRoot = native || portal ? new URL('https://app.romano-islam.de/data/') : localRoot;
  const cacheName = 'romano-islam-books-v1';
  const hex = /^[a-f0-9]{64}$/;
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  let catalogPromise;
  const books = new Map();

  async function storage() {
    try { return await caches.open(cacheName); }
    catch { return null; }
  }

  async function download(url, validate) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const object = JSON.parse(new TextDecoder().decode(bytes));
      await validate(object, bytes);
      return {object, bytes};
    } finally {
      clearTimeout(timer);
    }
  }

  async function remember(cache, key, download) {
    try { await cache?.put(key, new Response(download.bytes)); }
    catch { /* Reading still works when storage is full or disabled. */ }
  }

  async function recall(cache, key, validate) {
    const response = await cache?.match(key);
    if (!response) throw new Error('Nema knjige u lokalnom kešu.');
    const bytes = await response.arrayBuffer();
    const data = JSON.parse(new TextDecoder().decode(bytes));
    await validate(data, bytes);
    return data;
  }

  function checkCatalog(data) {
    if (data?.schemaVersion !== 1 || !hex.test(data.version) || !Array.isArray(data.books) ||
        !data.sections || typeof data.sections !== 'object' || Array.isArray(data.sections) ||
        !Object.entries(data.sections).every(([id, title]) => slug.test(id) && typeof title === 'string') ||
        data.books.some(book => !Object.hasOwn(data.sections, book.section) || !slug.test(book.id) ||
          book.path !== book.section + '/' + book.id + '.json' || !hex.test(book.version) ||
          typeof book.title !== 'string' || !['book', 'hadith-translations', 'page-content'].includes(book.kind))) {
      throw new Error('Katalog nije ispravan.');
    }
  }

  function checkBook(entry, data) {
    if (data?.schemaVersion !== 1 || data.id !== entry.id || data.section !== entry.section ||
        (data.kind || 'book') !== entry.kind) throw new Error('Sadržaj nije ispravan.');
    if (entry.kind === 'page-content') {
      if (!data.texts || !data.datasets || Array.isArray(data.texts) || Array.isArray(data.datasets) ||
          typeof data.texts !== 'object' || typeof data.datasets !== 'object' ||
          !Object.values(data.texts).every(value => typeof value === 'string')) {
        throw new Error('Tekst stranice nije ispravan.');
      }
      return;
    }
    if (!Array.isArray(data.pages) || (!data.pages.length && entry.kind === 'book')) {
      throw new Error('Knjiga nije ispravna.');
    }
    let last = 0;
    for (const page of data.pages) {
      if (!Number.isSafeInteger(page?.number) || page.number <= last || !page.content ||
          (page.title !== undefined && typeof page.title !== 'string') ||
          !Object.keys(page.content).length || !Object.entries(page.content).every(([lang, blocks]) =>
            ['ar', 'bs'].includes(lang) && Array.isArray(blocks) && blocks.length && blocks.every(block =>
              ['paragraph', 'heading', 'note'].includes(block?.type) && typeof block.text === 'string'))) {
        throw new Error('Stranica nije ispravna.');
      }
      last = page.number;
    }
  }

  async function checkVersion(entry, data, bytes) {
    checkBook(entry, data);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== entry.version) throw new Error('Verzija knjige još nije dostupna.');
  }

  async function loadCatalog() {
    const cache = await storage();
    const key = new URL('katalog.json', remoteRoot);
    const url = new URL(key);
    url.searchParams.set('refresh', String(Date.now()));
    try {
      const fresh = await download(url, checkCatalog);
      await remember(cache, key.href, fresh);
      return {data: fresh.object, source: 'network'};
    } catch {
      try { return {data: await recall(cache, key.href, checkCatalog), source: 'cache'}; }
      catch (error) {
        if (!native) throw error;
        const bundled = await download(new URL('katalog.json', localRoot), checkCatalog);
        return {data: bundled.object, source: 'bundled'};
      }
    }
  }

  function catalog() {
    if (!catalogPromise) catalogPromise = loadCatalog().catch(error => {
      catalogPromise = undefined;
      throw error;
    });
    return catalogPromise;
  }

  async function loadBook(entry, source) {
    const cache = await storage();
    const remote = new URL(entry.path, remoteRoot);
    const url = new URL(remote);
    url.searchParams.set('v', entry.version);
    const validate = (data, bytes) => checkVersion(entry, data, bytes);
    if (source !== 'bundled') {
      if (source === 'network') {
        try { return await recall(cache, remote.href, validate); }
        catch { /* Fetch the new revision if it differs from the saved copy. */ }
        try {
          const fresh = await download(url, validate);
          await remember(cache, remote.href, fresh);
          return fresh.object;
        } catch { /* Try the last validated copy. */ }
      }
      try { return await recall(cache, remote.href, data => checkBook(entry, data)); }
      catch (error) { if (!native) throw error; }
    }
    const file = await download(new URL(entry.path, localRoot), data => checkBook(entry, data));
    return file.object;
  }

  function book(entry, source) {
    const key = entry.path + '@' + entry.version;
    if (!books.has(key)) {
      books.set(key, loadBook(entry, source).catch(error => {
        books.delete(key);
        throw error;
      }));
    }
    return books.get(key);
  }

  async function externalJSON(href) {
    const url = new URL(href);
    const cache = await storage();
    const validate = value => {
      if (!value || typeof value !== 'object') throw new Error('Podaci izvora nisu ispravni.');
    };
    try {
      const fresh = await download(url, validate);
      await remember(cache, url.href, fresh);
      return fresh.object;
    } catch {
      return recall(cache, url.href, validate);
    }
  }

  window.RomanoData = Object.freeze({catalog, book, externalJSON, portal});
  if (/(?:\/|\/index\.html)$/.test(location.pathname)) catalog().catch(() => {});
})();
