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

test('la risposta giusta non si legge gia nella domanda', () => {
    const strip = (s) => norm(s).replace(/^(il|lo|la|l|i|gli|le) /, '');
    const leaks = cadutaDomande.filter((d) => {
        const o = strip(d.ok);
        return o.length > 3 && (' ' + norm(d.q) + ' ').includes(' ' + o + ' ');
    }).map((d) => d.q);
    assert.deepEqual(leaks, [], `risposta scritta nella domanda: ${leaks.join(' | ')}`);
});

test('categorie fisse e abbastanza piene da non ripetersi', () => {
    const allowed = ['Stadi', 'Soprannomi', 'Calcio estero', 'Calcio italiano', 'Champions', 'Allenatori', 'Nazionale',
        'Mondiali ed Europei', 'Storia', 'Calciomercato', 'Regole e curiosità'];
    const count = {};
    cadutaDomande.forEach((d) => {
        assert.ok(allowed.includes(d.cat), `categoria sconosciuta "${d.cat}" in "${d.q}"`);
        count[d.cat] = (count[d.cat] || 0) + 1;
    });
    allowed.forEach((c) => assert.ok((count[c] || 0) >= 25, `categoria ${c}: solo ${count[c] || 0} domande`));
});

test('niente fatti che invecchiano: nessuna domanda al presente su record o squadre attuali', () => {
    const risky = /\b(attuale|attualmente|oggi allena|in questa stagione|quest'anno|ancora in attivit)/i;
    const bad = cadutaDomande.filter((d) => risky.test(d.q)).map((d) => d.q);
    assert.deepEqual(bad, [], `domande a rischio scadenza: ${bad.join(' | ')}`);
});

test('testi senza spazi doppi o ai bordi', () => {
    cadutaDomande.forEach((d) => {
        [d.q, d.ok, ...d.ko].forEach((t) => {
            assert.equal(t, t.trim(), `spazi ai bordi in "${t}"`);
            assert.ok(!/ {2}/.test(t), `spazio doppio in "${t}"`);
        });
    });
});

/* ---------- regole del montepremi (assets/games/cadutalibera.js in sandbox, DOM finto) ---------- */
function loadGame() {
    const fs = require('node:fs');
    const vm = require('node:vm');
    const el = () => new Proxy(function () {}, {
        get(t, p) {
            if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
            if (p === 'dataset' || p === 'style') return {};
            if (p === 'hidden' || p === 'disabled') return false;
            if (p === Symbol.toPrimitive) return () => '';
            return () => el();
        },
        set() { return true; },
        apply() { return el(); }
    });
    const QZ = {
        $: () => el(), $$: () => [], icon: () => '', esc: (s) => String(s), fmt: (n) => String(n),
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        store: { get: (k, f) => f, set() {} },
        Deck: function () { this.draw = () => cadutaDomande[0]; },
        segmented() {}, profile: { best: () => undefined }, shuffle: (a) => a
    };
    const win = { __QZ_TEST__: {} };
    const ctx = { QZ, cadutaDomande, window: win, document: { addEventListener() {} }, console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'cadutalibera.js'), 'utf8'), ctx);
    return win.__QZ_TEST__.cadutalibera;
}
const G = loadGame();

test('bonus velocita\': a parita\' di secondi impiegati, i ritmi veloci rendono di piu\'', () => {
    // risposta in 2 secondi: Calmo (10 s) avanza 8 s, Svelto 5 s, Lampo 3 s
    const calmo = G.speedBonus(8, 10), svelto = G.speedBonus(5, 7), lampo = G.speedBonus(3, 5);
    assert.ok(lampo > svelto && svelto > calmo, `Calmo ${calmo}, Svelto ${svelto}, Lampo ${lampo}`);
    for (let t = 0; t < 5; t += 0.25) {
        const l = G.speedBonus(5 - t, 5), s = G.speedBonus(7 - t, 7), c = G.speedBonus(10 - t, 10);
        assert.ok(l > s && s > c, `in ${t} s: Lampo ${l}, Svelto ${s}, Calmo ${c}`);
    }
    for (let t = 5; t < 7; t += 0.25) assert.ok(G.speedBonus(7 - t, 7) > G.speedBonus(10 - t, 10), `in ${t} s Svelto deve battere Calmo`);
    // proporzionale al tempo risparmiato: a tempo scaduto resta solo la quota del ritmo
    assert.equal(G.speedBonus(0, 10), 0);
    assert.ok(G.speedBonus(7, 7) > G.speedBonus(3.5, 7));
    assert.equal(G.speedBonus(99, 5), G.speedBonus(5, 5));
});

test('"Mi fermo qui": 50% prima di un terzo, 75% fino a due terzi, 100% dopo; arrivare in fondo paga di piu\'', () => {
    for (const len of [15, 25, 40]) {
        assert.equal(G.keepShare(0, len), 0.5);
        assert.equal(G.keepShare(Math.ceil(len / 3) - 1, len), 0.5);
        assert.equal(G.keepShare(Math.ceil(len / 3), len), 0.75);
        assert.equal(G.keepShare(Math.ceil((2 * len) / 3), len), 1);
        assert.equal(G.toNextStep(0, len), Math.ceil(len / 3));
        assert.equal(G.toNextStep(len - 1, len), 0);
        for (let i = 1; i <= len; i++) assert.ok(G.keepShare(i, len) >= G.keepShare(i - 1, len), 'la quota non scende mai');
    }
    assert.ok(G.FINISH_BONUS > 1, 'il premio arrivo deve battere il fermarsi');
    assert.equal(G.FALL_KEEP, 0.5);
});

test('record separati per lunghezza e ritmo', () => {
    assert.equal(G.recMode(25, 7), '25-7');
    assert.notEqual(G.recMode(25, 5), G.recMode(25, 10));
    const js = require('node:fs').readFileSync(path.join(__dirname, '..', 'assets', 'games', 'cadutalibera.js'), 'utf8');
    assert.match(js, /mode: recMode\(S\.len, S\.pace\)/);
    assert.match(js, /QZ\.profile\.best\(GAME, recMode\(set\.len, set\.pace\)\)/);
});
