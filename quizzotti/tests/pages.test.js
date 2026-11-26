/* Verifica di coerenza delle pagine v2: ogni gioco del registro QZ.GAMES
   (assets/qz.js) ha la sua pagina, la pagina dichiara il gioco giusto con
   data-game, carica il motore condiviso e il proprio script, e ogni asset
   locale referenziato esiste davvero (niente link rotti dopo un rename). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const engine = read('assets/qz.js');
const games = [...engine.matchAll(/\{ id: '([a-z]+)', file: '([A-Za-z]+\.html)'(?:, engine: '([a-z]+)')?/g)].map((m) => ({ id: m[1], file: m[2], engine: m[3] }));

test('il registro QZ.GAMES elenca 22 giochi con id e file unici', () => {
    assert.equal(games.length, 22);
    assert.equal(new Set(games.map((g) => g.id)).size, 22);
    assert.equal(new Set(games.map((g) => g.file)).size, 22);
});

for (const g of games) {
    test(`${g.file}: pagina coerente con il registro`, () => {
        assert.ok(fs.existsSync(path.join(ROOT, g.file)), `manca ${g.file}`);
        const html = read(g.file);
        assert.match(html, new RegExp(`<body[^>]*data-game="${g.id}"`), 'data-game mancante o diverso dal registro');
        assert.match(html, /src="assets\/qz\.js(\?v=[a-f0-9]+)?"/, 'non carica assets/qz.js');
        assert.match(html, /href="assets\/qz\.css(\?v=[a-f0-9]+)?"/, 'non carica assets/qz.css');
        assert.match(html, new RegExp(`src="assets/games/${g.engine || g.id}\\.js(\\?v=[a-f0-9]+)?"`), 'non carica il proprio script di gioco');
        assert.doesNotMatch(html, /font-awesome|theme\.css|sfx\.js|profile\.js/, 'riferimento ad asset della v1');
    });
}

test('ogni asset locale referenziato dalle pagine esiste', () => {
    const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
    for (const p of pages) {
        const html = read(p);
        for (const m of html.matchAll(/(?:src|href|srcset)="((?:assets\/|logo)[^"?#]+)/g)) {
            assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${p}: asset inesistente ${m[1]}`);
        }
    }
});

test('la home: dati strutturati validi e allineati al registro', () => {
    const html = read('index.html');
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, 'manca il JSON-LD nella home');
    const data = JSON.parse(m[1]);
    const list = data['@graph'].find((x) => x['@type'] === 'ItemList');
    assert.ok(list, 'manca la ItemList dei giochi');
    assert.equal(list.numberOfItems, games.length);
    assert.deepEqual(list.itemListElement.map((x) => x.url.replace(/^.*\/quizzotti\//, '')), games.map((g) => g.file),
        'la lista dei giochi nel JSON-LD non segue il registro QZ.GAMES');
    assert.match(html, /src="assets\/qz\.js(\?v=[a-f0-9]+)?"/);
    assert.match(html, /src="assets\/home\.js(\?v=[a-f0-9]+)?"/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'la home deve avere un solo h1');
});

test('gli asset usati dal motore esistono e qz.js compila', () => {
    const vm = require('node:vm');
    assert.doesNotThrow(() => new vm.Script(engine, { filename: 'assets/qz.js' }));
    assert.doesNotThrow(() => new vm.Script(read('assets/home.js'), { filename: 'assets/home.js' }));
    for (const m of engine.matchAll(/src="((?:assets\/|logo)[^"?#]+)"/g)) {
        assert.ok(fs.existsSync(path.join(ROOT, m[1])), `qz.js: asset inesistente ${m[1]}`);
    }
});

test('ogni gioco del registro ha il suo colore in qz.css', () => {
    const css = read('assets/qz.css');
    for (const g of games) {
        assert.match(css, new RegExp(`\\[data-game="${g.id}"\\]\\s*\\{[^}]*--accent:`), `manca [data-game="${g.id}"] in qz.css`);
    }
});

test('gli script di gioco sono JavaScript valido', () => {
    const vm = require('node:vm');
    for (const g of games) {
        const file = `assets/games/${g.engine || g.id}.js`; // engine: pagine che condividono il motore
        assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), `${file} non compila`);
    }
});

/* ---------- Google, installazione, condivisione ---------- */
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const g of games) {
    test(`${g.file}: testi per Google, dati strutturati e anteprima`, () => {
        const html = read(g.file);
        const title = html.match(/<title>([^<]+)<\/title>/)[1];
        assert.match(title, / · Quizzotti$/, 'il title finisce con « · Quizzotti»');
        assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, 'ancora Google Fonts');
        assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
        assert.match(html, /<link rel="preload" href="assets\/fonts\/archivo-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
        assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
        const og = html.match(/<meta property="og:image" content="https:\/\/quizotti\.altervista\.org\/quizzotti\/([^"]+)">/);
        assert.ok(og, 'manca og:image');
        assert.equal(og[1], `assets/og/${g.id}.jpg`);
        assert.ok(fs.existsSync(path.join(ROOT, og[1])), 'manca l\'immagine ' + og[1]);

        const graph = ldBlocks(html).flatMap((d) => d['@graph'] || [d]);
        const app = graph.find((x) => x['@type'] === 'WebApplication');
        assert.ok(app, 'manca WebApplication');
        assert.equal(app.applicationCategory, 'GameApplication');
        assert.equal(app.isAccessibleForFree, true);
        assert.equal(app.inLanguage, 'it');
        assert.equal(app.url, 'https://quizotti.altervista.org/quizzotti/' + g.file);
        const crumbs = graph.find((x) => x['@type'] === 'BreadcrumbList');
        assert.ok(crumbs && crumbs.itemListElement.length === 2, 'manca BreadcrumbList');
        const faq = graph.find((x) => x['@type'] === 'FAQPage');
        assert.ok(faq && faq.mainEntity.length === 3, 'servono 3 domande nel FAQPage');

        // il blocco statico in fondo: le stesse domande del FAQPage, 4-6 righe, 4 link veri
        const block = html.match(/<section class="qz-about"[\s\S]*?<\/section>/);
        assert.ok(block, 'manca il blocco statico «Come si gioca»');
        const qs = [...block[0].matchAll(/<summary>([^<]+)<\/summary><p>([^<]+)<\/p>/g)].map((m) => [decode(m[1]), decode(m[2])]);
        assert.deepEqual(qs, faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), 'FAQPage e domande visibili non coincidono');
        const steps = (block[0].match(/<ol class="qz-about__steps">([\s\S]*?)<\/ol>/)[1].match(/<li>/g) || []).length;
        assert.ok(steps >= 4 && steps <= 6, 'Come si gioca: 4-6 righe');
        const links = [...block[0].matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(links.length, 4, 'Altri giochi: 4 link');
        for (const l of links) {
            assert.notEqual(l, g.file, 'link alla pagina stessa');
            assert.ok(games.some((x) => x.file === l), 'link a una pagina che non è un gioco: ' + l);
        }
    });
}

test('il Calciatore del Giorno si presenta come il Wordle del calcio', () => {
    const html = read('GiocatoreDelGiorno.html');
    assert.match(html, /<title>Wordle del calcio: indovina il Calciatore del Giorno · Quizzotti<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]*Wordle del calcio/);
    assert.match(html, /class="intro__lead">[^<]*Wordle del calcio/);
});

test('la home: niente Google Fonts, numero dei giochi dal registro, elenco statico dei giochi', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
    assert.doesNotMatch(html, /Diciotto|Ventidue/, 'il numero dei giochi scritto in lettere va tenuto a mano: meglio <span data-n="all">');
    assert.match(html, /<span data-n="all">/);
    assert.match(html, /<h2 id="seo-title">Giochi di calcio online gratis<\/h2>/);
    const list = html.match(/<!-- qz:elenco[^>]*-->([\s\S]*?)<!-- \/qz:elenco -->/);
    assert.ok(list, 'manca l\'elenco statico dei giochi');
    assert.deepEqual([...list[1].matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), games.map((g) => g.file),
        'l\'elenco statico non segue il registro: node scripts/seo-pagine.js');
    const words = html.match(/<section class="home-seo"[\s\S]*?<p>([\s\S]*?)<\/p>/)[1].split(/\s+/).length;
    assert.ok(words >= 80 && words <= 120, 'il paragrafo per Google deve stare tra 80 e 120 parole (ora ' + words + ')');
    assert.match(html, /id="games-q"/, 'manca la ricerca');
    assert.match(html, /data-t="cultura"/, 'manca il filtro Cultura generale');
});

test('installazione: manifest valido con le icone, service worker che non tocca api/', () => {
    const man = JSON.parse(read('manifest.webmanifest'));
    assert.equal(man.display, 'standalone');
    assert.ok(man.name && man.short_name && man.start_url);
    const sizes = man.icons.map((i) => i.sizes + ':' + (i.purpose || 'any'));
    assert.ok(sizes.includes('192x192:any') && sizes.includes('512x512:any') && sizes.includes('512x512:maskable'));
    for (const i of man.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), 'manca ' + i.src);
    for (const f of ['favicon.ico', 'assets/icons/apple-touch-icon.png']) assert.ok(fs.existsSync(path.join(ROOT, f)), 'manca ' + f);
    const vm = require('node:vm');
    const sw = read('sw.js');
    assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw.js' }));
    assert.match(sw, /function isApi/);
    assert.match(sw, /if \(!cacheable\(url\)\) return;/, 'le richieste ad api/ devono andare in rete senza passare dalla cache');
    assert.match(engine, /serviceWorker/, 'qz.js non registra il service worker');
});

test('.htaccess: https, 404, file riservati bloccati ma api/ libera', () => {
    const ht = read('.htaccess');
    assert.match(ht, /ErrorDocument 404 \/quizzotti\/404\.html/);
    assert.ok(fs.existsSync(path.join(ROOT, '404.html')));
    assert.match(ht, /RewriteRule \^api\/ - \[L\]/);
    assert.doesNotMatch(ht, /\(scripts\|tests[^)]*api/, 'api/ non va bloccata');
    assert.match(ht, /package\(-lock\)\?\\\.json/);
    assert.match(ht, /\\\.md/);
    assert.match(read('api/stanze/.htaccess'), /Require all denied/, 'le stanze restano protette');
});

test('privacy: la pagina esiste ed è nel piede di pagina', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'privacy.html')));
    assert.match(engine, /href="privacy\.html"/);
});
