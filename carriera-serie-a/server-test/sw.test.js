'use strict';
/* ============================================================
   Presidente · Serie A — server-test/sw.test.js
   Test del service worker (sw.js) in una sandbox Node: `self`, `caches`,
   `clients` e `fetch` sono finti (una rete simulata che si può "staccare"),
   il codice di sw.js è quello vero, caricato dal file. Verifica quello che in
   un browser si vede solo a mano: cosa finisce in cache all'installazione,
   che le chiamate PHP non passano mai dalla cache, il comportamento offline,
   il passaggio da una versione all'altra e l'accordo con la pagina su quando
   aggiornarsi.

   Uso: node server-test/sw.test.js — esce con codice 1 se un'asserzione fallisce.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_DIR = path.join(__dirname, '..');
const ORIGIN = 'https://gioco.example';
const BASE = ORIGIN + '/carriera-serie-a/';
const INDEX_HTML = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) { if (cond) passed++; else { failed++; failures.push(msg); console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')'); }
function section(name) { console.log('\n— ' + name); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gli indirizzi (con "?v=") che index.html carica davvero: il test non li conosce a priori.
const pageAssets = Array.from(INDEX_HTML.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)).map((m) => m[1])
  .filter((u) => !/^[a-z]+:/i.test(u) && /\.(js|css|webp|png|jpe?g|svg|ico|json)(\?|$)/i.test(u) && !/sw\.js/.test(u))
  .map((u) => new URL(u, BASE).href);

function makeWorld(opts) {
  opts = opts || {};
  const world = { online: true, slow: 0, html: INDEX_HTML, status: {}, fetched: [], skipWaitingCalls: 0, listeners: {}, clientsList: opts.clients || [], stores: opts.stores || new Map() };

  function basicResponse(body, status, type) {
    const res = new Response(body, { status: status || 200, headers: { 'Content-Type': type || 'text/plain' } });
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  }
  const urlOf = (input) => (typeof input === 'string' ? input : input.url);

  class MockCache {
    constructor() { this.map = new Map(); }
    async match(input, o) {
      const url = new URL(urlOf(input), BASE);
      for (const [k, v] of this.map) {
        const ku = new URL(k);
        if (k === url.href || (o && o.ignoreSearch && ku.origin + ku.pathname === url.origin + url.pathname)) return v.clone();
      }
      return undefined;
    }
    async put(input, res) { this.map.set(new URL(urlOf(input), BASE).href, res); }
    async delete(input) { return this.map.delete(new URL(urlOf(input), BASE).href); }
    async keys() { return Array.from(this.map.keys()).map((url) => ({ url })); }
  }
  const caches = {
    async open(name) { if (!world.stores.has(name)) world.stores.set(name, new MockCache()); return world.stores.get(name); },
    async keys() { return Array.from(world.stores.keys()); },
    async delete(name) { return world.stores.delete(name); },
    async match(input) { for (const c of world.stores.values()) { const hit = await c.match(input); if (hit) return hit; } return undefined; },
  };

  async function fetchMock(input) {
    const url = new URL(urlOf(input), BASE).href;
    world.fetched.push(url);
    if (world.slow) await sleep(world.slow);
    if (!world.online) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const forced = world.status[u.pathname];
    if (forced) return basicResponse('errore', forced);
    if (u.pathname.endsWith('/') || u.pathname.endsWith('/index.html')) return basicResponse(world.html, 200, 'text/html');
    return basicResponse('contenuto di ' + u.pathname + u.search, 200);
  }

  const self = {
    location: { href: BASE + 'sw.js' },
    registration: { active: opts.active || null },
    clients: { matchAll: async () => world.clientsList },
    skipWaiting: async () => { world.skipWaitingCalls++; },
    addEventListener(type, fn) { (world.listeners[type] = world.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { world.listeners[type] = (world.listeners[type] || []).filter((f) => f !== fn); },
  };
  const context = vm.createContext({ self, caches, fetch: fetchMock, URL, Response, Request, Headers, Promise, setTimeout, clearTimeout, console, Set, Map, Array, Error, TypeError });
  vm.runInContext(fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8'), context, { filename: 'sw.js' });

  // Evento "estendibile": raccoglie le promesse di waitUntil e l'eventuale respondWith.
  world.dispatch = async (type, props) => {
    const waits = [];
    const ev = Object.assign({ waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})), responded: null, respondWith(p) { ev.responded = Promise.resolve(p); } }, props || {});
    (world.listeners[type] || []).slice().forEach((fn) => fn(ev));
    let res = null, error = null;
    if (ev.responded) { try { res = await ev.responded; } catch (e) { error = e; } }
    for (let i = 0; i < waits.length; i++) await waits[i];   // waitUntil aggiunti strada facendo compresi
    return { handled: !!ev.responded, res, error };
  };
  world.request = (url, o) => Object.assign({ url: new URL(url, BASE).href, method: 'GET', mode: 'cors', headers: new Headers() }, o || {});
  world.get = (url, o) => world.dispatch('fetch', { request: world.request(url, o) });
  world.navigate = (url) => world.get(url, { mode: 'navigate' });
  world.cacheKeys = async () => { const c = world.stores.get('presidente-serie-a-static'); return c ? (await c.keys()).map((k) => k.url).sort() : []; };
  return world;
}

(async () => {
  section('Prima installazione');
  const w = makeWorld();
  await w.dispatch('install');
  const keys = await w.cacheKeys();
  ok(pageAssets.length >= 8, 'index.html dichiara i suoi file (' + pageAssets.length + ' trovati)');
  eq(pageAssets.filter((u) => !keys.includes(u)), [], 'in cache ci sono gli indirizzi ESATTI che la pagina chiede, "?v=" compreso');
  ok(keys.includes(BASE + 'index.html'), 'index.html è in cache');
  ok(pageAssets.some((u) => /ui\.js\?v=\d+/.test(u)) && !keys.includes(BASE + 'ui.js'), 'nessuna copia senza versione di un file versionato');
  ok(!keys.some((k) => /sw\.js|\.php/.test(k)), 'mai sw.js né un .php in cache');
  eq(w.skipWaitingCalls, 0, 'prima installazione: nessun subentro forzato');
  eq(w.listeners.activate.length, 1, 'gestore activate registrato');

  section('Cosa NON passa dal service worker');
  for (const [what, url, o] of [
    ['GET room.php (poll dello stato)', 'room.php?action=state&code=ABCD'],
    ['GET leaderboard.php', 'leaderboard.php'],
    ['POST room.php', 'room.php', { method: 'POST' }],
    ['POST errors.php', 'errors.php', { method: 'POST' }],
    ['sw.js', 'sw.js'],
    ['un file di un altro sito', 'https://altro.example/lib.js?v=1'],
    ['un file fuori dalla cartella del gioco', ORIGIN + '/altro-gioco/app.js?v=1'],
    ['una richiesta parziale (Range)', 'icon.webp?v=1', { headers: new Headers({ range: 'bytes=0-10' }) }],
    ['una navigazione verso un\'altra pagina', 'room.php?action=state&code=ABCD', { mode: 'navigate' }],
  ]) {
    const r = await w.get(url, o);
    eq(r.handled, false, what + ': lasciato al browser');
  }
  const afterKeys = await w.cacheKeys();
  eq(afterKeys, keys, 'nessuna di quelle richieste ha lasciato qualcosa in cache');

  section('Offline');
  w.online = false;
  const versioned = pageAssets.find((u) => /ui\.js\?v=/.test(u));
  let r = await w.get(versioned);
  eq([r.handled, r.res && r.res.status, r.res && await r.res.text()], [true, 200, 'contenuto di /carriera-serie-a/ui.js' + new URL(versioned).search], 'file versionato: servito dalla cache senza rete');
  for (const nav of ['./', 'index.html', 'index.html?fresh=123456']) {
    r = await w.navigate(nav);
    eq([r.handled, r.res && r.res.status, r.res && (await r.res.text()) === INDEX_HTML], [true, 200, true], 'navigazione offline verso "' + nav + '": pagina dalla cache');
  }
  r = await w.get('ui.js?v=99999');
  eq([r.handled, r.res && r.res.status], [true, 200], 'versione non in cache, offline: si ripiega su un\'altra versione dello stesso file');
  r = await w.get('mai-visto.js?v=1');
  ok(r.handled && r.error, 'file mai visto, offline: errore di rete (nessuna risposta inventata)');
  r = await w.get('manifest.json');
  eq([r.handled, r.res && r.res.status], [true, 200], 'file senza versione (manifest.json) offline: dalla cache');
  eq((await w.cacheKeys()).filter((k) => /index\.html|\/$/.test(k)), [BASE + 'index.html'], 'una sola copia di index.html in cache, comunque sia stata chiesta');
  const empty = makeWorld(); empty.online = false;
  r = await empty.navigate('./');
  eq([r.res && r.res.status, r.res && /Sei offline/.test(await r.res.text())], [503, true], 'offline senza nulla in cache: pagina "Sei offline", non un errore del browser');

  section('Online: la pagina viene sempre dalla rete');
  w.online = true;
  w.html = INDEX_HTML.replace(/ui\.js\?v=\d+/, 'ui.js?v=424242');
  r = await w.navigate('./');
  ok(r.res && (await r.res.text()).includes('ui.js?v=424242'), 'navigazione online: arriva la pagina nuova, non quella in cache');
  w.online = false;
  r = await w.navigate('index.html');
  ok(r.res && (await r.res.text()).includes('ui.js?v=424242'), '…e la copia in cache è stata aggiornata');
  w.online = true;
  w.fetched.length = 0;
  r = await w.get('ui.js?v=424242');
  eq([r.res && r.res.status, w.fetched.length], [200, 1], 'versione nuova di ui.js: scaricata dalla rete');
  let now = await w.cacheKeys();
  eq(now.filter((k) => /\/ui\.js/.test(k)), [BASE + 'ui.js?v=424242'], 'la versione vecchia di ui.js è stata tolta dalla cache');
  w.fetched.length = 0;
  r = await w.get('ui.js?v=424242');
  eq([r.res && r.res.status, w.fetched.length], [200, 0], 'seconda richiesta della stessa versione: dalla cache, nessuna richiesta di rete');
  w.status['/carriera-serie-a/index.html'] = 503; w.status['/carriera-serie-a/'] = 503;
  r = await w.navigate('./');
  eq([r.res && r.res.status, r.res && (await r.res.text()).includes('ui.js?v=424242')], [200, true], 'server in errore (503): si serve la pagina in cache');
  w.status['/carriera-serie-a/styles.css'] = 404;
  r = await w.get('styles.css?v=777');
  eq([r.res && r.res.status, (await w.cacheKeys()).includes(BASE + 'styles.css?v=777')], [404, false], 'una risposta d\'errore non finisce mai in cache');
  w.status = {};
  w.slow = 4600;
  const t0 = Date.now();
  r = await w.navigate('./');
  ok(r.res && r.res.status === 200 && Date.now() - t0 < 4500 + 3000, 'rete lentissima: dopo qualche secondo si usa la copia in cache');
  w.slow = 0;

  section('Aggiornamento del service worker');
  const stores = w.stores;
  stores.set('presidente-serie-a-v12', { legacy: true });
  stores.set('cache-di-un-altro-gioco', { other: true });
  await w.dispatch('activate');
  eq(Array.from(stores.keys()).sort(), ['cache-di-un-altro-gioco', 'presidente-serie-a-static'], 'activate: via le cache delle versioni precedenti, intatte quelle degli altri');

  // pagina attuale (non risponde alla domanda): il worker nuovo subentra subito, come sempre
  const silent = makeWorld({ active: {}, clients: [{ postMessage() {} }] });
  await silent.dispatch('install');
  eq(silent.skipWaitingCalls, 1, 'pagina che non risponde a SW_UPDATE_READY: subentro immediato (comportamento di sempre)');
  // nessuna pagina aperta: subentra
  const alone = makeWorld({ active: {} });
  await alone.dispatch('install');
  eq(alone.skipWaitingCalls, 1, 'nessuna pagina aperta: subentro immediato');
  // pagina che chiede di aspettare
  let polite; const received = [];
  polite = makeWorld({ active: {}, clients: [{ postMessage(msg) { received.push(msg); setTimeout(() => polite.dispatch('message', { data: { type: 'SW_UPDATE_DEFER' } }), 20); } }] });
  await polite.dispatch('install');
  eq([received.length, received[0] && received[0].type, typeof (received[0] && received[0].release), polite.skipWaitingCalls], [1, 'SW_UPDATE_READY', 'string', 0], 'pagina che risponde SW_UPDATE_DEFER: il worker nuovo aspetta');
  await polite.dispatch('message', { data: { type: 'SKIP_WAITING' } });
  eq(polite.skipWaitingCalls, 1, '…e subentra quando la pagina manda SKIP_WAITING');
  // installazione offline: non fallisce
  const off = makeWorld(); off.online = false;
  let threw = false;
  try { await off.dispatch('install'); } catch (e) { threw = true; }
  eq([threw, (await off.cacheKeys()).length], [false, 0], 'installazione senza rete: nessun errore, cache vuota (si riempirà strada facendo)');
  // installazione interrotta a metà: resta la pagina vecchia, non una nuova senza i suoi file
  const half = makeWorld();
  await half.dispatch('install');
  half.html = INDEX_HTML.replace(/ui\.js\?v=\d+/, 'ui.js?v=5555');
  const realFetched = half.fetched.length;
  half.status = { '/carriera-serie-a/ui.js': 500 };
  await half.dispatch('install');
  const hk = await half.cacheKeys();
  ok(half.fetched.length > realFetched && hk.some((k) => /ui\.js\?v=\d+/.test(k) && !/5555/.test(k)), 'se un file nuovo non si scarica, la versione vecchia resta in cache finché quella nuova non arriva');
  half.online = false;
  const hp = await half.navigate('./');
  ok(hp.res && !(await hp.res.text()).includes('ui.js?v=5555'), '…e la pagina in cache resta quella vecchia, coerente con i file che ha');

  console.log('\n' + passed + ' asserzioni superate, ' + failed + ' fallite.');
  if (failed) { console.log('\nFallite:\n- ' + failures.join('\n- ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
