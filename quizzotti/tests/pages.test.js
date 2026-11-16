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
const games = [...engine.matchAll(/\{ id: '([a-z]+)', file: '([A-Za-z]+\.html)'/g)].map((m) => ({ id: m[1], file: m[2] }));

test('il registro QZ.GAMES elenca 18 giochi con id e file unici', () => {
    assert.equal(games.length, 18);
    assert.equal(new Set(games.map((g) => g.id)).size, 18);
    assert.equal(new Set(games.map((g) => g.file)).size, 18);
});

for (const g of games) {
    test(`${g.file}: pagina coerente con il registro`, () => {
        assert.ok(fs.existsSync(path.join(ROOT, g.file)), `manca ${g.file}`);
        const html = read(g.file);
        assert.match(html, new RegExp(`<body[^>]*data-game="${g.id}"`), 'data-game mancante o diverso dal registro');
        assert.match(html, /src="assets\/qz\.js(\?v=[a-f0-9]+)?"/, 'non carica assets/qz.js');
        assert.match(html, /href="assets\/qz\.css(\?v=[a-f0-9]+)?"/, 'non carica assets/qz.css');
        assert.match(html, new RegExp(`src="assets/games/${g.id}\\.js(\\?v=[a-f0-9]+)?"`), 'non carica il proprio script di gioco');
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
        const file = `assets/games/${g.id}.js`;
        assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), `${file} non compila`);
    }
});
