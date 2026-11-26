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

/* ---------- regole (logica pura di assets/games/intesavincente.js) ---------- */
const G = require(path.join(ROOT, 'assets', 'games', 'intesavincente.js'));

test('impostazioni: 5 secondi per rispondere di base; le scelte vecchie esplicite restano', () => {
    assert.equal(G.DEFAULTS.answer, 5);
    assert.equal(G.sanitizeOpts(null).answer, 5);
    // prima della v2 "libero" era il default: non si sa se e' stato scelto, quindi 5 secondi
    assert.equal(G.sanitizeOpts({ time: 90, skips: 3, answer: 0 }).answer, 5);
    assert.equal(G.sanitizeOpts({ time: 90, skips: 3, answer: 0 }).time, 90);
    assert.equal(G.sanitizeOpts({ answer: 10 }).answer, 10);
    // dalla v2 "libero" e' una scelta
    assert.equal(G.sanitizeOpts({ v: 2, answer: 0 }).answer, 0);
    assert.equal(G.sanitizeOpts({ v: 2, time: 75, rounds: 'x', skips: 9 }).time, 60);
    assert.equal(G.sanitizeOpts({ deck: 'gergo' }).deck, 'gergo');
});

test('punti: la sbagliata costa un punto, il passo niente', () => {
    assert.equal(G.points('ok'), 1);
    assert.equal(G.points('bad'), -1);
    assert.equal(G.points('skip'), 0);
});

test('omonimi: il cognome con le particelle, e i 14 gruppi del mazzo campioni', () => {
    assert.equal(G.surnameKey('Kevin De Bruyne'), 'de bruyne');
    assert.equal(G.surnameKey('Virgil van Dijk'), 'van dijk');
    assert.equal(G.surnameKey('Lautaro Martínez'), 'martinez');
    assert.equal(G.surnameKey('Pelé'), 'pele');
    const h = G.homonyms(wordDecks.campioni);
    assert.deepEqual(h['Simone Inzaghi'], ['Filippo Inzaghi']);
    assert.deepEqual(h['Marcus Thuram'].slice().sort(), ['Khéphren Thuram', 'Lilian Thuram']);
    assert.deepEqual(h['Pelé'], ['Abedi Pelé']);
    // De Rossi non e' un omonimo di Paolo Rossi
    assert.equal(h['Daniele De Rossi'], undefined);
    assert.deepEqual(h['Paolo Rossi'], ['Giuseppe Rossi']);
    const groups = new Set(Object.keys(h).map(G.surnameKey));
    assert.equal(groups.size, 14, [...groups].join(', '));
});

test('turno salvato a meta\': si riprende solo se integro', () => {
    const m = { time: 60 };
    const mid = { log: [{ word: 'Lionel Messi', res: 'ok' }, { word: 'Rimonta', res: 'bad' }], turnPts: 0, skipsLeft: 2, left: 37, cur: 'Tornante' };
    assert.ok(G.validMid(mid, m));
    assert.ok(G.validMid(JSON.parse(JSON.stringify(mid)), m), 'deve sopravvivere a JSON');
    assert.ok(G.validMid({ ...mid, cur: null }, m));
    assert.ok(G.validMid({ sum: true, log: mid.log, turnPts: 0 }, m), 'fine turno: al resoconto');
    assert.ok(!G.validMid({ ...mid, left: 0 }, m), 'tempo finito');
    assert.ok(!G.validMid({ ...mid, left: 75 }, m), 'piu\' tempo del turno');
    assert.ok(!G.validMid({ ...mid, log: [{ word: 'x', res: 'boh' }] }, m));
    assert.ok(!G.validMid({ ...mid, turnPts: 'tre' }, m));
    assert.ok(!G.validMid({ ...mid, skipsLeft: -1 }, m));
    assert.ok(!G.validMid(null, m));
});

test('intesavincente.js: doppio tocco su Passo, sbagliata che costa, nuova partita che chiede', () => {
    const js = fs.readFileSync(path.join(ROOT, 'assets', 'games', 'intesavincente.js'), 'utf8');
    assert.match(js, /performance\.now\(\) - \(S\.dealtAt \|\| 0\) < SKIP_GUARD/, 'Passo appena dopo la parola nuova va ignorato');
    assert.match(js, /S\.turnPts--;\s+t\.score--;/, 'la sbagliata toglie un punto');
    assert.match(js, /if \(loadMatch\(\)\) \{\s+QZ\.confirm/, 'nuova partita con una a meta\': prima si chiede');
});
