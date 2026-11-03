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

test('il registro QZ.GAMES elenca 10 giochi con id e file unici', () => {
    assert.equal(games.length, 10);
    assert.equal(new Set(games.map((g) => g.id)).size, 10);
    assert.equal(new Set(games.map((g) => g.file)).size, 10);
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

test('gli script di gioco sono JavaScript valido', () => {
    const vm = require('node:vm');
    for (const g of games) {
        const file = `assets/games/${g.id}.js`;
        assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), `${file} non compila`);
    }
});
