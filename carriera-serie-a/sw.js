'use strict';
/* Service worker di "Presidente · Serie A": installabilità (PWA) e gioco offline.

   COSA VA ALZATO A OGNI RELEASE: solo RELEASE qui sotto (lo stesso numero del "?v=" di ui.js
   in index.html va benissimo). Serve a una cosa sola: far sapere alle pagine GIÀ APERTE che
   c'è una versione nuova (il browser si accorge che sw.js è cambiato, vedi "Aggiornamento").
   Se ci si dimentica non si rompe nulla: chi apre o ricarica il gioco riceve comunque la
   versione nuova, perché l'elenco dei file da tenere in cache non è più scritto a mano qui
   dentro ma letto da index.html.

   STRATEGIA
   - index.html: prima la rete (un deploy nuovo si vede subito), la copia in cache solo se la
     rete manca o non risponde entro qualche secondo. Una sola copia in cache, qualunque sia
     l'indirizzo con cui è stata chiesta ("./", "index.html", "index.html?fresh=...").
   - File versionati (css/js/immagini con "?v=N"): prima la cache, per sempre — quell'URL non
     cambia mai contenuto. Quando arriva "ui.js?v=74" la copia di "ui.js?v=73" viene tolta.
   - File senza versione (manifest.json, un'icona senza "?v="): prima la rete, cache di riserva.
   - Tutto il resto NON passa di qui: le chiamate a room.php/leaderboard.php/errors.php (mai
     in cache: prima una GET a room.php poteva restare salvata e restituire per sempre lo
     stesso stato della stanza), le POST, le richieste verso altri siti.

   PRIMA INSTALLAZIONE: si scarica index.html, si leggono da lì gli indirizzi ESATTI dei file
   (con il loro "?v="), e si mettono in cache quelli. Prima l'elenco era fisso e senza "?v=":
   la pagina chiedeva "ui.js?v=73", in cache c'era "ui.js", le due cose non coincidevano e
   offline il gioco non partiva.

   AGGIORNAMENTO: il worker nuovo scarica tutto mentre quello vecchio continua a servire la
   pagina aperta. Poi chiede alle pagine aperte se può subentrare (messaggio SW_UPDATE_READY):
   - una pagina che risponde SW_UPDATE_DEFER si prende la responsabilità di scegliere il
     momento (fine partita, ritorno al menu...) e manda SKIP_WAITING quando è pronta;
   - se nessuna risponde (index.html attuale) subentra subito, come ha sempre fatto: la pagina
     vede "controllerchange" e si ricarica da sola. */

const RELEASE = '77';

const CACHE_PREFIX = 'presidente-serie-a-';
const CACHE = CACHE_PREFIX + 'static';          // un'unica cache stabile: i "?v=" vecchi si tolgono file per file
const SCOPE = new URL('./', self.location.href);
const INDEX_URL = new URL('index.html', SCOPE).href;   // la chiave unica di index.html in cache
const STATIC_EXT = /\.(?:js|css|webp|png|jpe?g|gif|svg|ico|woff2?|json)$/i;
const NETWORK_TIMEOUT_MS = 4000;                // oltre, se c'è una copia in cache si usa quella
const DEFER_WAIT_MS = 1200;                     // quanto si aspetta una risposta SW_UPDATE_DEFER

/* ---------------- utilità ---------------- */

function isCacheable(res) {
  // Solo risposte complete del nostro sito: mai un errore, una risposta parziale o opaca.
  return !!res && res.status === 200 && res.type === 'basic';
}

// È un file statico del gioco che ha senso tenere in cache? (mai sw.js, mai un .php)
function staticAssetUrl(input) {
  let url;
  try { url = new URL(input, SCOPE); } catch (e) { return null; }
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return null;
  if (!STATIC_EXT.test(url.pathname) || url.pathname.endsWith('/sw.js')) return null;
  return url;
}

function isVersioned(url) { return url.searchParams.has('v'); }

// Gli indirizzi dei file che index.html carica (src/href), così come sono scritti lì.
function assetsFromHtml(html) {
  const out = new Set();
  const re = /\b(?:src|href)\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = staticAssetUrl(m[1]);
    if (url) out.add(url.href);
  }
  return Array.from(out);
}

// Salvata la versione nuova di un file, le altre versioni dello stesso file non servono più.
async function pruneOtherVersions(cache, url) {
  const keys = await cache.keys();
  await Promise.all(keys.map((req) => {
    const u = new URL(req.url);
    return (u.pathname === url.pathname && u.href !== url.href) ? cache.delete(req) : null;
  }));
}

async function fetchIntoCache(cache, url) {
  // 'no-cache': si rivalida con il server invece di fidarsi della cache HTTP del browser.
  const res = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
  if (!isCacheable(res)) throw new Error('risposta non salvabile: ' + url.href);
  await cache.put(url.href, res);
}

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(INDEX_URL, { cache: 'no-store', credentials: 'same-origin' });
  if (!isCacheable(res)) throw new Error('index.html non disponibile');
  const html = await res.clone().text();
  const urls = assetsFromHtml(html).map((h) => new URL(h));
  // Un file che non si riesce a scaricare ora non blocca l'installazione: verrà messo in
  // cache alla prima richiesta della pagina.
  const done = await Promise.all(urls.map((u) => cache.match(u.href)
    .then((hit) => (hit && isVersioned(u)) ? true : fetchIntoCache(cache, u).then(() => true))
    .catch(() => false)));
  // index.html per ULTIMO, e solo se i suoi file ci sono tutti: se l'installazione si
  // interrompe o un file non si scarica, in cache resta la pagina vecchia con i suoi file,
  // non una pagina nuova a cui mancano dei pezzi. (Se una pagina in cache non c'è ancora,
  // meglio quella nuova incompleta che niente.)
  if (done.every(Boolean) || !(await cache.match(INDEX_URL))) await cache.put(INDEX_URL, res);
  await Promise.all(urls.filter((u, i) => done[i] && isVersioned(u)).map((u) => pruneOtherVersions(cache, u)));
}

// Chiede alle pagine aperte se vogliono decidere loro quando aggiornarsi.
function askClientsToDefer() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    if (!clients.length) return false;
    return new Promise((resolve) => {
      const onMessage = (ev) => {
        if (ev.data && ev.data.type === 'SW_UPDATE_DEFER') { self.removeEventListener('message', onMessage); resolve(true); }
      };
      self.addEventListener('message', onMessage);
      setTimeout(() => { self.removeEventListener('message', onMessage); resolve(false); }, DEFER_WAIT_MS);
      clients.forEach((c) => { try { c.postMessage({ type: 'SW_UPDATE_READY', release: RELEASE }); } catch (e) {} });
    });
  }).catch(() => false);
}

/* ---------------- ciclo di vita ---------------- */

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    try { await precache(); } catch (e) { /* offline durante l'installazione: la cache si riempie strada facendo */ }
    // Nessun worker attivo = prima installazione: non c'è nessuno a cui subentrare.
    if (!self.registration.active) return;
    const deferred = await askClientsToDefer();
    if (!deferred) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  // Via le cache delle versioni precedenti di questo file (si chiamavano presidente-serie-a-vN).
  // Niente clients.claim(): alla prima visita la pagina resta com'è (prima veniva ricaricata
  // subito dopo il primo caricamento); dal caricamento successivo è servita da qui.
  ev.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))
  )));
});

self.addEventListener('message', (ev) => {
  const data = ev.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_RELEASE' && ev.source) { try { ev.source.postMessage({ type: 'SW_RELEASE', release: RELEASE }); } catch (e) {} }
});

/* ---------------- richieste ---------------- */

function offlinePage() {
  return new Response('<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presidente · Serie A</title><body style="font-family:system-ui,sans-serif;background:#0b0906;color:#eee;text-align:center;padding:48px 20px"><h1 style="font-size:20px">Sei offline</h1><p>Il gioco non è ancora stato salvato su questo dispositivo. Riprova quando torna la connessione.</p><p><a href="./" style="color:#f5c542">Riprova</a></p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// index.html: rete, con la cache come paracadute (rete assente, lenta o server in errore).
async function handleIndex(ev) {
  const cache = await caches.open(CACHE);
  // cache:'no-store' bypassa del tutto la cache HTTP del browser: se l'hosting non manda un
  // Cache-Control corretto, fetch() potrebbe restituire una copia vecchia pur "andando in rete".
  const network = fetch(ev.request, { cache: 'no-store' }).then((res) => {
    if (isCacheable(res) && !res.redirected) {
      // clone() SUBITO, prima che il corpo venga consumato da chi riceve la risposta: farlo
      // dopo (dentro un .then successivo) fallisce a caso con "body already used".
      const copy = res.clone();
      ev.waitUntil(cache.put(INDEX_URL, copy).catch(() => {}));
    }
    return res;
  });
  const cached = await cache.match(INDEX_URL);
  if (!cached) return network.catch(() => offlinePage());
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS); });
  try {
    const res = await Promise.race([network, timeout]);
    if (res && res.status < 500) return res;
    ev.waitUntil(network.catch(() => {}));   // la rete lenta finisce comunque di aggiornare la cache
    return cached;
  } catch (e) {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

// File con "?v=": cache e basta; se manca lo si scarica e lo si tiene.
async function handleVersioned(ev, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url.href);
  if (hit) return hit;
  try {
    const res = await fetch(ev.request);
    if (isCacheable(res)) {
      const copy = res.clone();
      ev.waitUntil(cache.put(url.href, copy).then(() => pruneOtherVersions(cache, url)).catch(() => {}));
    }
    return res;
  } catch (e) {
    // Offline e questa versione non c'è: meglio una versione precedente dello stesso file che niente.
    const any = await cache.match(url.href, { ignoreSearch: true });
    if (any) return any;
    throw e;
  }
}

// File senza versione: rete (sempre rivalidata), cache di riserva.
async function handleUnversioned(ev, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(ev.request, { cache: 'no-cache' });
    if (isCacheable(res)) {
      const copy = res.clone();
      ev.waitUntil(cache.put(url.href, copy).catch(() => {}));
    }
    return res;
  } catch (e) {
    const hit = await cache.match(url.href);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (req.mode === 'navigate') {
    // Solo la pagina del gioco ("./" o "index.html", con qualunque query). Qualunque altra
    // navigazione dentro la cartella non è affar nostro.
    const rel = url.pathname.slice(SCOPE.pathname.length);
    if (rel === '' || rel === 'index.html') ev.respondWith(handleIndex(ev));
    return;
  }

  const asset = staticAssetUrl(req.url);
  if (!asset) return;   // .php e tutto ciò che non è un file statico: dritto alla rete, mai in cache
  ev.respondWith(isVersioned(asset) ? handleVersioned(ev, asset) : handleUnversioned(ev, asset));
});
