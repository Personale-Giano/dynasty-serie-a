/* Intesa Vincente: integrita' del database (assets/db-intesavincente.js)
   e coerenza tra la pagina e lo script del gioco. Le parole sono divise in
   tre mazzi (campioni, squadre, gergo); `words` e' l'unione, ed e' anche la
   chiave della memoria del mazzo: nessuna parola ripetuta, nemmeno con
   maiuscole o accenti diversi. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { words, wordDecks } = require(path.join(ROOT, 'assets', 'db-intesavincente.js'));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

test('db-intesavincente.js: tre mazzi pieni, words e\' la loro unione', () => {
    assert.deepEqual(Object.keys(wordDecks).sort(), ['campioni', 'gergo', 'squadre']);
    Object.keys(wordDecks).forEach((k) => assert.ok(wordDecks[k].length >= 250, `mazzo ${k}: solo ${wordDecks[k].length} parole`));
    assert.equal(words.length, wordDecks.campioni.length + wordDecks.squadre.length + wordDecks.gergo.length);
    assert.ok(words.length >= 1400, `parole: ${words.length}`);
});

test('db-intesavincente.js: nessun doppione, nemmeno con accenti o maiuscole diverse', () => {
    const seen = new Map();
    words.forEach((w) => {
        const k = norm(w);
        assert.ok(!seen.has(k), `doppione: "${w}" e "${seen.get(k)}"`);
        seen.set(k, w);
    });
});

test('db-intesavincente.js: parole pulite e leggibili sul maxischermo', () => {
    words.forEach((w) => {
        assert.equal(typeof w, 'string');
        assert.equal(w, w.trim(), `spazi ai bordi: "${w}"`);
        assert.ok(!/\s{2}/.test(w), `doppio spazio: "${w}"`);
        assert.ok(w.length >= 2 && w.length <= 34, `lunghezza strana: "${w}"`);
        assert.ok(!/[<>"]/.test(w), `carattere non ammesso: "${w}"`);
    });
});

test('IntesaVincente.html: ha i contenitori che lo script riempie', () => {
    const html = fs.readFileSync(path.join(ROOT, 'IntesaVincente.html'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'assets', 'games', 'intesavincente.js'), 'utf8');
    const ids = new Set([...js.matchAll(/\$\('#([\w-]+)/g)].map((m) => m[1]));
    ids.forEach((id) => assert.ok(html.includes(`id="${id}"`), `manca #${id} nella pagina`));
    assert.ok(html.indexOf('db-intesavincente.js') < html.indexOf('games/intesavincente.js'), 'il database va caricato prima dello script');
});

test('intesavincente.js: le chiavi salvate restano quelle di sempre', () => {
    const js = fs.readFileSync(path.join(ROOT, 'assets', 'games', 'intesavincente.js'), 'utf8');
    assert.match(js, /new QZ\.Deck\('intesavincente', words\)/);
    assert.match(js, /'qz\.intesavincente\.opts'/);
    assert.match(js, /key: 'intesavincente'/);
});
