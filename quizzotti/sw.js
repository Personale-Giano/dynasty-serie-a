/* ==========================================================================
   QUIZZOTTI — Service worker
   - Pagine HTML: prima la rete, poi la cache (si vede sempre la versione
     nuova, e senza rete l'ultima vista).
   - Asset con ?v=hash (vedi scripts/cache-bust.js) e caratteri: prima la
     cache, perche' a ogni cambio il nome cambia. Le versioni vecchie dello
     stesso file si buttano quando arriva quella nuova.
   - Tutto il resto dello stesso sito: prima la rete, poi la cache.
   - api/ (giochi TV + telefoni) non passa MAI dalla cache: va sempre in rete.
   ========================================================================== */
/* global self, caches, fetch, URL, Request, Response */
'use strict';

var CACHE = 'qz-v1';
var SCOPE = new URL('./', self.location.href).pathname; // /quizzotti/

function isApi(url) { return url.pathname.indexOf(SCOPE + 'api/') === 0; }
function isVersioned(url) { return /(^|&)v=[a-f0-9]+/.test(url.search.slice(1)) || url.pathname.indexOf(SCOPE + 'assets/fonts/') === 0; }
function cacheable(url) { return url.origin === self.location.origin && url.pathname.indexOf(SCOPE) === 0 && !isApi(url); }

self.addEventListener('install', function (e) {
    // la prima pagina e il motore, per avere almeno la home anche senza rete
    e.waitUntil(caches.open(CACHE).then(function (c) {
        return c.addAll(['./', 'manifest.webmanifest', 'logo1-96.webp', 'assets/icons/icon-192.png']).catch(function () { /* niente: si riempie strada facendo */ });
    }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('qz-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

/** Salva la risposta e butta le versioni vecchie dello stesso asset (stesso percorso, ?v= diverso). */
function put(req, res) {
    if (!res || !res.ok || res.type === 'opaque') return Promise.resolve();
    var url = new URL(req.url);
    return caches.open(CACHE).then(function (c) {
        return c.put(req, res).then(function () {
            if (!url.search) return null;
            return c.keys().then(function (keys) {
                return Promise.all(keys.filter(function (k) {
                    var u = new URL(k.url);
                    return u.pathname === url.pathname && u.search !== url.search && /(^|&)v=/.test(u.search.slice(1));
                }).map(function (k) { return c.delete(k); }));
            });
        });
    });
}

function networkFirst(req, isPage) {
    return fetch(req).then(function (res) {
        put(req, res.clone());
        return res;
    }).catch(function () {
        return caches.match(req, isPage ? { ignoreSearch: true } : undefined).then(function (hit) {
            if (hit) return hit;
            if (!isPage) return Response.error();
            // pagina mai vista senza rete: la prima pagina, se c'e'
            return caches.match('./').then(function (home) {
                return home || new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Senza rete · Quizzotti</title>' +
                    '<body style="background:#07090b;color:#eef1f2;font:18px system-ui,sans-serif;padding:40px 20px;text-align:center"><h1>Senza rete</h1><p>Questa pagina non è ancora sul telefono. Riprova quando torna il segnale.</p></body>',
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            });
        });
    });
}

function cacheFirst(req) {
    return caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { put(req, res.clone()); return res; });
    });
}

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (!cacheable(url)) return; // api/, altri siti: il browser fa da solo
    var isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
    if (isPage) e.respondWith(networkFirst(req, true));
    else if (isVersioned(url)) e.respondWith(cacheFirst(req));
    else e.respondWith(networkFirst(req, false));
});

// la pagina appena aperta passa le sue risorse (arrivate prima del service worker)
self.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type !== 'qz-cache' || !Array.isArray(d.urls)) return;
    var list = d.urls.slice(0, 80).filter(function (u) {
        try { return cacheable(new URL(u, self.location.href)); } catch { return false; }
    });
    e.waitUntil(caches.open(CACHE).then(function (c) {
        return Promise.all(list.map(function (u) {
            return c.match(u).then(function (hit) {
                if (hit) return null;
                return fetch(u).then(function (res) { return put(new Request(u), res); }).catch(function () { /* niente */ });
            });
        }));
    }));
});
