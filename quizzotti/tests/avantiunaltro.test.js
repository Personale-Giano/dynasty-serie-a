/* Avanti un Altro: il database deve reggere il gioco al contrario (due
   risposte diverse, una sola giusta, niente doppioni, risposte giuste
   bilanciate tra A e B) e la logica pura del gioco (cronometro, rimescolo,
   XP e pagella, serie per scala, finale) deve dare numeri sensati. */
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

test('almeno 400 domande dopo la revisione del 26 novembre 2026', () => {
    assert.ok(fullDatabase.length >= 400, `trovate solo ${fullDatabase.length} domande`);
});

// Delle prime 233 domande, 17 compaiono identiche anche in CVEM, questions-data o Jeopardy (da sistemare
// in quei file). Le domande aggiunte il 26 novembre 2026 (dalla 234ª) non ne ripetono nessuna.
test('le domande del 26 novembre 2026 non sono copiate dagli altri quiz (questions-data, CVEM, Caduta Libera, Jeopardy)', () => {
    const load = (f) => require(path.join('..', 'assets', f));
    const others = new Set();
    load('questions-data.js').forEach((q) => others.add(norm(q.domanda)));
    load('db-cvem.js').questions.forEach((q) => others.add(norm(q.question)));
    load('db-cadutalibera.js').cadutaDomande.forEach((q) => others.add(norm(q.q)));
    load('db-jeopardy.js').jeopardyData.forEach((c) => c.questions.forEach((q) => others.add(norm(q.question))));
    assert.ok(others.size > 1500, 'gli altri database non si sono caricati');
    const clash = fullDatabase.slice(233).filter((d) => others.has(norm(d.q))).map((d) => d.q);
    assert.deepEqual(clash, [], `domande gia presenti altrove: ${clash.join(' | ')}`);
});

test('il Pallone d\'Oro non si mangia il quiz: al massimo 25 domande', () => {
    const n = fullDatabase.filter((d) => /pallone d.oro/i.test(d.q)).length;
    assert.ok(n <= 25, `${n} domande sul Pallone d'Oro`);
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

test('seriesMap: record separati per scala, il vecchio record unico si converte una volta', () => {
    assert.deepEqual(G.seriesMap(null, 0, 20), {});
    // il vecchio record va sulla scala impostata, se ci sta
    assert.deepEqual(G.seriesMap(null, 7, 10), { 10: 7 });
    assert.deepEqual(G.seriesMap(null, 12, 15), { 15: 12 });
    // una serie di 18 non puo' venire da una scala da 10: va sulla piu' corta possibile
    assert.deepEqual(G.seriesMap(null, 18, 10), { 20: 18 });
    assert.deepEqual(G.seriesMap({}, 12, 10), { 15: 12 });
    // gia' convertito: il vecchio record non conta piu'
    assert.deepEqual(G.seriesMap({ 10: 4 }, 18, 20), { 10: 4 });
    // valori rovinati si scartano, mai oltre la lunghezza della scala
    assert.deepEqual(G.seriesMap({ 10: 99, 15: 'x', 20: -1, 7: 3 }, 0, 20), { 10: 10 });
    assert.deepEqual(G.seriesMap('rotto', 5, 99), { 10: 5 });
});

test('finale: tempo per scala, montepremi che cala a ogni errore e pagella', () => {
    assert.equal(G.finaleSeconds(10), 70);
    assert.equal(G.finaleSeconds(20), 140);
    assert.equal(G.finalePot(0), G.FINALE.pot);
    assert.equal(G.finalePot(3), G.FINALE.pot - 3 * G.FINALE.cut);
    assert.equal(G.finalePot(G.FINALE.pot / G.FINALE.cut), 0);
    assert.equal(G.finalePot(99), 0);
    for (let e = 0; e < 10; e++) assert.ok(G.finalePot(e + 1) < G.finalePot(e), 'ogni errore deve costare');
    assert.equal(G.finaleRatio({ win: true, pot: G.FINALE.pot, best: 20, target: 20 }), 1);
    assert.ok(G.finaleRatio({ win: true, pot: 10000, best: 20, target: 20 }) > G.finaleRatio({ win: false, pot: 0, best: 19, target: 20 }));
    assert.equal(G.finaleRatio({ win: false, pot: 0, best: 0, target: 10 }), 0);
});

test('con «Le stesse» la lista tiene le domande grezze: A e B si rimescolano a ogni giro', () => {
    const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'assets', 'games', 'avantiunaltro.js'), 'utf8');
    assert.match(src, /out\.push\(deck\.draw\(\)\)/, 'buildList deve salvare le domande senza rimescolarle');
    // (il secondo argomento e' il generatore a seme della partita: la sfida rivede A e B negli stessi posti)
    assert.match(src, /S\.q = prepare\(S\.same \? S\.list\[S\.chain\] : deck\.draw\(\), rnd\)/, 'load deve rimescolare anche le domande ripetute');
    const d = fullDatabase[0];
    const seen = new Set([0.1, 0.9].map((r) => G.prepare(d, () => r).options[0]));
    assert.equal(seen.size, 2, 'la stessa domanda deve poter uscire nei due ordini');
});
