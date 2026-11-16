/* Avanti un Altro: il database deve reggere il gioco al contrario (due
   risposte diverse, una sola giusta, niente doppioni, risposte giuste
   bilanciate tra A e B) e la logica pura del gioco (cronometro, rimescolo,
   XP e pagella) deve dare numeri sensati. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { fullDatabase } = require(path.join('..', 'assets', 'db-avantiunaltro.js'));
const G = require(path.join('..', 'assets', 'games', 'avantiunaltro.js'));

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

test('ogni domanda ha testo, due risposte diverse e correct A/B', () => {
    assert.ok(fullDatabase.length >= 230);
    for (const d of fullDatabase) {
        assert.ok(d.q && d.q.trim().endsWith('?'), `domanda senza punto interrogativo: "${d.q}"`);
        assert.ok(d.a && d.b, `risposte mancanti: "${d.q}"`);
        assert.notEqual(norm(d.a), norm(d.b), `risposte uguali: "${d.q}"`);
        assert.ok(['A', 'B'].includes(d.correct), `correct non valido: "${d.q}"`);
        assert.ok(d.q.length <= 150, `domanda troppo lunga per il telefono: "${d.q}"`);
        assert.ok(d.a.length <= 40 && d.b.length <= 40, `risposta troppo lunga: "${d.q}"`);
        assert.ok(!/\s{2,}|\s[,.?]/.test(d.q), `spazi fuori posto: "${d.q}"`);
    }
});

test('nessuna domanda duplicata, nemmeno normalizzata', () => {
    const seen = new Set();
    for (const d of fullDatabase) {
        const k = norm(d.q);
        assert.ok(!seen.has(k), `domanda duplicata: "${d.q}"`);
        seen.add(k);
    }
});

test('le risposte giuste sono bilanciate tra A e B', () => {
    const a = fullDatabase.filter((d) => d.correct === 'A').length;
    const share = a / fullDatabase.length;
    assert.ok(share > 0.4 && share < 0.6, `A giusta nel ${Math.round(share * 100)}% dei casi`);
});

test('fmtTime: minuti, secondi e decimo troncato', () => {
    assert.equal(G.fmtTime(0), '0:00,0');
    assert.equal(G.fmtTime(9.99), '0:09,9');
    assert.equal(G.fmtTime(61.25), '1:01,2');
    assert.equal(G.fmtTime(83.47), '1:23,4');
    assert.equal(G.fmtTime(600), '10:00,0');
    assert.equal(G.fmtTime(-1), '0:00,0');
});

test('prepare: la risposta giusta resta giusta dopo il rimescolo', () => {
    for (const d of fullDatabase) {
        const truth = d.correct === 'A' ? d.a : d.b;
        for (const r of [0.1, 0.9]) {
            const q = G.prepare(d, () => r);
            assert.equal(q.options[q.correct], truth);
            assert.equal(q.options.length, 2);
            assert.equal(q.text, d.q);
        }
    }
});

test('xpFor: la cima e il ritmo veloce valgono di piu', () => {
    const base = { best: 8, answered: 20, win: false, target: 20, pace: 0 };
    const win = Object.assign({}, base, { best: 20, win: true });
    assert.ok(G.xpFor(win) > G.xpFor(base));
    assert.ok(G.xpFor(Object.assign({}, win, { pace: 5 })) > G.xpFor(Object.assign({}, win, { pace: 8 })));
    assert.equal(G.xpFor({ best: 0, answered: 0, win: false, target: 10, pace: 8 }), 0);
});

test('ratioFor: 10 in pagella solo in cima al primo colpo e col tempo', () => {
    assert.equal(G.ratioFor({ win: true, tries: 1, pace: 8, best: 20, target: 20 }), 1);
    assert.ok(G.ratioFor({ win: true, tries: 1, pace: 0, best: 20, target: 20 }) < 1);
    assert.equal(G.ratioFor({ win: true, tries: 40, pace: 5, best: 20, target: 20 }), 0.55);
    assert.ok(G.ratioFor({ win: false, tries: 3, pace: 8, best: 19, target: 20 }) < 0.85);
    assert.equal(G.ratioFor({ win: false, tries: 1, pace: 8, best: 0, target: 10 }), 0);
});
