/* L'Intruso (assets/db-intruso.js): almeno 200 round, sei nomi distinti,
   l'intruso e' uno dei sei, campi pieni, difficolta' 1-3 e nessun round
   ripetuto (stesso insieme di nomi, in qualunque ordine). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { intrusoRounds } = require(path.join('..', 'assets', 'db-intruso.js'));
const label = (r) => `"${r.rule}" [${r.items.join(', ')}]`;

test('db-intruso.js: almeno 200 round', () => {
    assert.ok(Array.isArray(intrusoRounds));
    assert.ok(intrusoRounds.length >= 200, `trovati solo ${intrusoRounds.length} round`);
});

test('db-intruso.js: 6 nomi distinti e non vuoti, intruso tra i sei', () => {
    for (const r of intrusoRounds) {
        assert.ok(Array.isArray(r.items) && r.items.length === 6, `servono 6 nomi: ${label(r)}`);
        r.items.forEach((it) => assert.ok(typeof it === 'string' && it.trim().length > 0, `nome vuoto: ${label(r)}`));
        assert.equal(new Set(r.items.map((s) => s.trim().toLowerCase())).size, 6, `nomi ripetuti: ${label(r)}`);
        assert.ok(r.items.includes(r.odd), `intruso "${r.odd}" non tra i nomi: ${label(r)}`);
    }
});

test('db-intruso.js: campi rule/why/cat pieni e diff 1-3', () => {
    for (const r of intrusoRounds) {
        for (const k of ['rule', 'why', 'cat', 'odd']) {
            assert.ok(typeof r[k] === 'string' && r[k].trim().length > 0, `campo ${k} vuoto: ${label(r)}`);
        }
        assert.ok([1, 2, 3].includes(r.diff), `diff non valida (${r.diff}): ${label(r)}`);
    }
});

test('db-intruso.js: nessun round duplicato (stesso insieme di nomi)', () => {
    const seen = new Map();
    for (const r of intrusoRounds) {
        const key = r.items.map((s) => s.trim().toLowerCase()).sort().join('|');
        assert.ok(!seen.has(key), `round duplicato: ${label(r)} e "${seen.get(key)}"`);
        seen.set(key, r.rule);
    }
});

test('db-intruso.js: tutte e tre le difficolta\' ben rappresentate', () => {
    for (const d of [1, 2, 3]) {
        const n = intrusoRounds.filter((r) => r.diff === d).length;
        assert.ok(n >= 30, `troppo pochi round di difficolta' ${d}: ${n}`);
    }
});

test('db-intruso.js: almeno 280 round dopo la revisione di novembre 2026', () => {
    assert.ok(intrusoRounds.length >= 280, `trovati solo ${intrusoRounds.length} round`);
});

test('db-intruso.js: nomi abbastanza corti da stare in una casella del telefono', () => {
    for (const r of intrusoRounds) {
        r.items.forEach((it) => assert.ok(it.length <= 26, `nome troppo lungo (${it.length}): "${it}" in ${label(r)}`));
        assert.equal(r.items.filter((it) => it === r.odd).length, 1, `intruso presente piu' volte: ${label(r)}`);
    }
});

test('db-intruso.js: il legame non svela l\'intruso e nessun nome ha spazi ai bordi', () => {
    for (const r of intrusoRounds) {
        assert.ok(!r.rule.toLowerCase().includes(r.odd.toLowerCase()), `la regola contiene l'intruso: ${label(r)}`);
        r.items.forEach((it) => assert.equal(it, it.trim(), `spazi ai bordi: "${it}"`));
        assert.ok(!/\s{2,}/.test(r.why + r.rule), `spazi doppi: ${label(r)}`);
    }
});

test('db-intruso.js: nomi gia\' superati non tornano (stadio dell\'Atalanta rinominato nel 2025)', () => {
    for (const r of intrusoRounds) {
        assert.ok(!r.items.includes('Gewiss Stadium'), `Gewiss Stadium ora si chiama New Balance Arena: ${label(r)}`);
    }
});

test('games/intruso.js: lo script del gioco compila', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'intruso.js'), 'utf8');
    assert.doesNotThrow(() => new Function(src));
});
