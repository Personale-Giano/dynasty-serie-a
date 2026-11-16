/* Il cruciverba del pallone: controlli sul gioco (assets/games/cruciverba.js)
   e sulle schede. L'integrita' completa delle griglie e l'impronta delle
   schede pubblicate stanno in tests/db-integrity.test.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const GAME = fs.readFileSync(path.join(ROOT, 'assets', 'games', 'cruciverba.js'), 'utf8');
const { cruciverbaSchede, cruciverbaErrata } = require(path.join(ROOT, 'assets', 'cruciverba-schede.js'));
const { cruciverba } = require(path.join(ROOT, 'assets', 'db-cruciverba.js'));

test('cruciverba.js compila', () => {
    assert.doesNotThrow(() => new vm.Script(GAME, { filename: 'cruciverba.js' }));
});

test('la chiave dei progressi non cambia (i giocatori non perdono le schede fatte)', () => {
    assert.match(GAME, /STORE_KEY = 'qz\.cruciverba\.v3'/);
});

test('la pagina carica schede e gioco, nell\'ordine giusto', () => {
    const html = fs.readFileSync(path.join(ROOT, 'Cruciverba.html'), 'utf8');
    const i = html.indexOf('assets/cruciverba-schede.js'), j = html.indexOf('assets/games/cruciverba.js');
    assert.ok(i > 0 && j > i, 'cruciverba-schede.js va caricato prima del gioco');
    assert.ok(!html.includes('db-cruciverba.js'), 'il database completo non serve alla pagina: basta il file delle schede');
});

test('le correzioni (errata) riguardano parole delle schede e non contengono la risposta', () => {
    assert.equal(typeof cruciverbaErrata, 'object');
    const all = new Map(cruciverbaSchede.flatMap((p) => p.words.map((w) => [w.answer, w])));
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    for (const [a, clue] of Object.entries(cruciverbaErrata)) {
        assert.ok(all.has(a), `${a} non e' in nessuna scheda`);
        assert.notEqual(clue, all.get(a).clue, `${a}: la correzione e' uguale all'originale`);
        assert.ok(clue.length <= 80 && !norm(clue).includes(a), `${a}: definizione corretta non valida`);
    }
});

test('ogni scheda ha i due versi, misure da telefono e numerazione senza buchi', () => {
    for (const p of cruciverbaSchede) {
        const dirs = new Set(p.words.map((w) => w.dir));
        assert.deepEqual([...dirs].sort(), ['A', 'D'], `N° ${p.n}: servono orizzontali e verticali`);
        assert.ok(p.w <= 15 && p.h <= 15, `N° ${p.n}: griglia troppo grande per 375 px`);
        const nums = [...new Set(p.words.map((w) => w.num))].sort((a, b) => a - b);
        assert.deepEqual(nums, nums.map((_, i) => i + 1), `N° ${p.n}: numeri non consecutivi`);
        // stesso numero e stesso verso: mai due definizioni
        const keys = p.words.map((w) => w.num + w.dir);
        assert.equal(new Set(keys).size, keys.length, `N° ${p.n}: due definizioni con lo stesso numero e verso`);
    }
});

test('dal N° 11 ogni tema torna una seconda volta, senza doppioni tra le nuove', () => {
    const second = cruciverbaSchede.slice(10).map((p) => p.tema);
    assert.equal(new Set(second).size, second.length, 'un tema compare due volte tra le schede 11-20');
    const titles = cruciverbaSchede.map((p) => p.title);
    assert.equal(new Set(titles).size, titles.length, 'titoli ripetuti');
});

test('le parole delle schede sono tutte nel database', () => {
    const db = new Set(cruciverba.map((x) => x.answer));
    cruciverbaSchede.forEach((p) => p.words.forEach((w) => assert.ok(db.has(w.answer), `N° ${p.n}: ${w.answer} manca dal database`)));
});
