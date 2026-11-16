/* Caduta Libera: integrita' del database (assets/db-cadutalibera.js).
   Ogni domanda ha tre risposte distinte (una giusta e due sbagliate),
   categoria e difficolta' 1-3; nessun doppione interno, nemmeno a meno di
   maiuscole/accenti/punteggiatura, e nessuna domanda uguale a quelle degli
   altri database del sito. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const load = (f) => require(path.join('..', 'assets', f));
const { cadutaDomande } = load('db-cadutalibera.js');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

test('almeno 320 domande, ciascuna con testo, categoria e difficolta valide', () => {
    assert.ok(Array.isArray(cadutaDomande));
    assert.ok(cadutaDomande.length >= 320, `servono almeno 320 domande, trovate ${cadutaDomande.length}`);
    cadutaDomande.forEach((d, i) => {
        assert.equal(typeof d.q, 'string', `domanda ${i} senza testo`);
        assert.ok(d.q.trim().length >= 10, `domanda ${i} troppo corta`);
        assert.ok(d.q.length <= 95, `domanda troppo lunga per leggerla in 3 secondi: "${d.q}"`);
        assert.equal(typeof d.cat, 'string', `categoria mancante per "${d.q}"`);
        assert.ok(d.cat.length > 0);
        assert.ok([1, 2, 3].includes(d.diff), `diff non valida per "${d.q}": ${d.diff}`);
    });
});

test('tre risposte distinte: la giusta piu due sbagliate', () => {
    cadutaDomande.forEach((d) => {
        assert.equal(typeof d.ok, 'string', `risposta giusta mancante per "${d.q}"`);
        assert.ok(Array.isArray(d.ko) && d.ko.length === 2, `servono due risposte sbagliate per "${d.q}"`);
        const opts = [d.ok, ...d.ko];
        opts.forEach((o) => assert.ok(typeof o === 'string' && o.trim().length > 0, `opzione vuota in "${d.q}"`));
        assert.equal(new Set(opts.map(norm)).size, 3, `opzioni non distinte in "${d.q}"`);
        // la giusta e' una delle tre opzioni che il gioco mescola
        assert.ok(opts.includes(d.ok));
        assert.ok(!d.ko.map(norm).includes(norm(d.ok)), `la giusta compare tra le sbagliate in "${d.q}"`);
    });
});

test('la risposta giusta non e quasi sempre la piu lunga', () => {
    const longest = cadutaDomande.filter((d) => d.ok.length > Math.max(...d.ko.map((k) => k.length))).length;
    assert.ok(longest / cadutaDomande.length < 0.45, `giusta strettamente piu lunga in ${longest}/${cadutaDomande.length} domande`);
});

test('ogni livello di difficolta ha abbastanza domande per una partita da 40', () => {
    [1, 2, 3].forEach((lv) => {
        const n = cadutaDomande.filter((d) => d.diff === lv).length;
        assert.ok(n >= 60, `diff ${lv}: solo ${n} domande`);
    });
    assert.ok(new Set(cadutaDomande.map((d) => d.cat)).size >= 8, 'servono almeno 8 categorie');
});

test('nessuna domanda duplicata, nemmeno normalizzata', () => {
    const seen = new Map();
    cadutaDomande.forEach((d) => {
        const k = norm(d.q);
        assert.ok(!seen.has(k), `domanda duplicata: "${d.q}"`);
        seen.set(k, true);
    });
});

test('nessuna domanda uguale a quelle degli altri database', () => {
    const others = new Set();
    load('questions-data.js').forEach((q) => others.add(norm(q.domanda)));
    load('db-cvem.js').questions.forEach((q) => others.add(norm(q.question)));
    load('db-avantiunaltro.js').fullDatabase.forEach((q) => others.add(norm(q.q)));
    load('db-jeopardy.js').jeopardyData.forEach((c) => c.questions.forEach((q) => others.add(norm(q.question))));
    load('db-citazioni.js').quotes.forEach((q) => others.add(norm(q.quote)));
    assert.ok(others.size > 1000, 'gli altri database non si sono caricati');
    const clash = cadutaDomande.filter((d) => others.has(norm(d.q))).map((d) => d.q);
    assert.deepEqual(clash, [], `domande gia presenti altrove: ${clash.join(' | ')}`);
});
