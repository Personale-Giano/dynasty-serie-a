/* Chi l'ha detto: integrita' del database (assets/db-citazioni.js) e
   confronto tollerante dei nomi scritti (assets/games/citazioni.js, caricato
   in una sandbox con un QZ finto: qui conta solo la logica di giudizio). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { quotes } = require(path.join('..', 'assets', 'db-citazioni.js'));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const CATS = ['panchina', 'campo', 'tribuna'];

test('db-citazioni.js: almeno 180 frasi', () => {
    assert.ok(quotes.length >= 180, `frasi: ${quotes.length}`);
});

test('db-citazioni.js: 4 opzioni distinte con la risposta giusta, categoria valida', () => {
    quotes.forEach((q) => {
        assert.ok(typeof q.quote === 'string' && q.quote.trim().length >= 6, `frase vuota: ${JSON.stringify(q)}`);
        assert.ok(CATS.includes(q.cat), `categoria non valida (${q.cat}) per "${q.quote}"`);
        assert.equal(q.options.length, 4, `servono 4 opzioni per "${q.quote}"`);
        assert.equal(new Set(q.options.map(norm)).size, 4, `opzioni ripetute per "${q.quote}"`);
        assert.ok(q.options.includes(q.correct), `"${q.correct}" non e' tra le opzioni di "${q.quote}"`);
        assert.equal(q.quote, q.quote.trim(), `spazi ai bordi in "${q.quote}"`);
    });
});

test('db-citazioni.js: nessuna frase doppia (anche con punteggiatura diversa)', () => {
    const seen = new Map();
    quotes.forEach((q) => {
        const k = norm(q.quote);
        assert.ok(!seen.has(k), `frase doppia: "${q.quote}"`);
        seen.set(k, 1);
    });
});

test('db-citazioni.js: ogni categoria basta per una partita da 20 frasi', () => {
    CATS.forEach((c) => {
        const n = quotes.filter((q) => q.cat === c).length;
        assert.ok(n >= 25, `categoria ${c}: solo ${n} frasi`);
    });
});

test('db-citazioni.js: stesso nome scritto sempre allo stesso modo', () => {
    // due grafie dello stesso nome (accenti a parte) spezzerebbero il confronto
    const byNorm = new Map();
    quotes.forEach((q) => q.options.forEach((o) => {
        const k = norm(o);
        if (!byNorm.has(k)) byNorm.set(k, new Set());
        byNorm.get(k).add(o);
    }));
    byNorm.forEach((set, k) => assert.equal(set.size, 1, `grafie diverse per ${k}: ${[...set].join(' / ')}`));
});

/* ---------- logica di giudizio, in sandbox ---------- */
function loadGame() {
    const el = () => new Proxy(function () {}, {
        get(t, p) {
            if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
            if (p === 'dataset' || p === 'style') return {};
            if (p === 'querySelector') return () => el();
            if (p === 'hidden' || p === 'disabled') return false;
            if (p === Symbol.toPrimitive) return () => '';
            return () => el();
        },
        set() { return true; },
        apply() { return el(); }
    });
    const distance = (a, b) => {
        a = norm(a); b = norm(b);
        if (a === b) return 0;
        let prev = [...Array(b.length + 1).keys()];
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[b.length];
    };
    const store = {};
    const QZ = {
        $: () => el(), $$: () => [], norm, distance, icon: () => '', esc: (s) => String(s),
        store: { get: (k, f) => (k in store ? store[k] : f), set: (k, v) => { store[k] = v; } },
        Deck: function () { this.draw = () => quotes[0]; },
        segmented() {}, ringHTML: () => '', ring: () => el(), profile: { best: () => null },
        shuffle: (a) => a, pick: (a) => a[0]
    };
    const win = { __QZ_TEST__: {}, matchMedia: () => ({ matches: false }) };
    const ctx = { QZ, quotes, window: win, document: { addEventListener() {} }, console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'citazioni.js'), 'utf8'), ctx);
    return win.__QZ_TEST__.citazioni;
}
const G = loadGame();
const Q = (correct, options) => ({ quote: 'x', correct, options: [correct].concat(options) });

test('citazioni.js: basta il cognome, accenti e refusi piccoli non contano', () => {
    const q = Q('Zlatan Ibrahimović', ['Mario Balotelli', 'Cristiano Ronaldo', 'Neymar']);
    assert.equal(G.judge('Ibrahimovic', q), 1);
    assert.equal(G.judge('ibrahimovich', q), 1);
    assert.equal(G.judge('Zlatan', q), 1);
    assert.equal(G.judge('Ibra', q), 1, 'soprannome');
    assert.equal(G.judge('Balotelli', q), 0, 'un\'altra opzione e\' sbagliata');
    assert.equal(G.judge('x', q), 0);
});

test('citazioni.js: grafie alternative e particelle', () => {
    assert.equal(G.judge('Cruyff', Q('Johan Cruijff', ['Pep Guardiola', 'Xavi', 'Andrés Iniesta'])), 1);
    assert.equal(G.judge('Del Piero', Q('Alessandro Del Piero', ['Gianluigi Buffon', 'Pavel Nedvěd', 'David Trezeguet'])), 1);
    assert.equal(G.judge('Boskov', Q('Vujadin Boškov', ['Nils Liedholm', 'Giovanni Trapattoni', 'Sven-Göran Eriksson'])), 1);
    assert.equal(G.judge('Pele', Q('Pelé', ['Diego Maradona', 'Johan Cruijff', 'Michel Platini'])), 1);
});

test('citazioni.js: "ci sei quasi" e cognome in comune con un\'altra opzione', () => {
    const q = Q('José Mourinho', ['Antonio Conte', 'Massimiliano Allegri', 'Alex Ferguson']);
    assert.equal(G.judge('Morigno', q), 2);
    const ag = Q('Gianni Agnelli', ['Umberto Agnelli', 'Giampiero Boniperti', 'Luciano Moggi']);
    assert.equal(G.judge('Agnelli', ag), 3, 'serve anche il nome');
    assert.equal(G.judge('Gianni Agnelli', ag), 1);
    assert.equal(G.judge('Umberto Agnelli', ag), 0);
});

test('citazioni.js: ogni risposta giusta del database si indovina scrivendola per intero o col cognome', () => {
    quotes.forEach((q) => {
        assert.equal(G.judge(q.correct, q), 1, `nome intero non accettato: ${q.correct}`);
        const sur = q.correct.split(' ').slice(-1)[0];
        const clash = q.options.some((o) => o !== q.correct && norm(o).split(' ').includes(norm(sur)));
        if (!clash && norm(sur).length >= 4) assert.equal(G.judge(sur, q), 1, `cognome non accettato: ${q.correct}`);
    });
});
