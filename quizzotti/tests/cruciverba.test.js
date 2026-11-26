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

test('ogni blocco di dieci schede (1-10, 11-20, 21-30...) ripassa i temi senza doppioni', () => {
    for (let i = 0; i < cruciverbaSchede.length; i += 10) {
        const block = cruciverbaSchede.slice(i, i + 10).map((p) => p.tema);
        assert.equal(new Set(block).size, block.length, `un tema compare due volte tra le schede ${i + 1}-${i + block.length}`);
    }
    const titles = cruciverbaSchede.map((p) => p.title);
    assert.equal(new Set(titles).size, titles.length, 'titoli ripetuti');
});

test('le parole delle schede sono tutte nel database', () => {
    const db = new Set(cruciverba.map((x) => x.answer));
    cruciverbaSchede.forEach((p) => p.words.forEach((w) => assert.ok(db.has(w.answer), `N° ${p.n}: ${w.answer} manca dal database`)));
});

test('il registro dice il vero: schede fisse da risolvere, non una griglia nuova a ogni partita', () => {
    const qz = fs.readFileSync(path.join(ROOT, 'assets', 'qz.js'), 'utf8');
    const line = qz.split('\n').find((l) => /id: 'cruciverba'/.test(l));
    assert.ok(line, 'manca il Cruciverba nel registro');
    assert.ok(!/griglia nuova/i.test(line), 'il registro promette una griglia nuova a ogni partita, ma le schede sono fisse');
    assert.match(line, /schede/i);
});

test('sul telefono la parola corrente sta in una striscia sopra la tastiera, con caselle tappabili', () => {
    const html = fs.readFileSync(path.join(ROOT, 'Cruciverba.html'), 'utf8');
    for (const id of ['xw-dock', 'xw-dcells', 'xw-dprev', 'xw-dnext', 'xw-dclue']) assert.ok(html.includes(`id="${id}"`), `manca #${id}`);
    // la striscia e' un doppione visivo: il lettore di schermo usa il campo nascosto
    assert.match(html, /class="xw-dock" id="xw-dock" aria-hidden="true"/);
    assert.match(html, /@media \(max-width: 979px\)[\s\S]*body\.xw-play \.xw-dock/);
    // si appoggia sulla tastiera (visualViewport) e la casella attiva resta in vista
    assert.match(GAME, /visualViewport/);
    assert.match(GAME, /function keepVisible\(\)/);
    assert.match(GAME, /document\.body\.appendChild\(dockEl\)/, 'la striscia va fuori dalla schermata animata, o "fixed" non tiene');
});
