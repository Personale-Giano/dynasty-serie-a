/* Chi Vuol Essere Milionario: integrita' delle domande (assets/db-cvem.js +
   assets/questions-data.js) e costruzione del mazzo per livello in
   assets/games/cvem.js, eseguito in una sandbox con un QZ finto. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { questions } = require(path.join('..', 'assets', 'db-cvem.js'));
const QUIZ_DB = require(path.join('..', 'assets', 'questions-data.js'));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

test('db-cvem.js: almeno 18 domande per ognuno dei 15 livelli', () => {
    for (let lv = 1; lv <= 15; lv++) {
        const n = questions.filter((q) => q.level === lv).length;
        assert.ok(n >= 18, `livello ${lv}: solo ${n} domande`);
    }
});

test('db-cvem.js: quattro opzioni piene e tutte diverse, testo della domanda pieno', () => {
    for (const q of questions) {
        assert.ok(typeof q.question === 'string' && q.question.trim().length > 10, `domanda vuota: ${JSON.stringify(q)}`);
        const opts = ['A', 'B', 'C', 'D'].map((l) => q.options[l]);
        opts.forEach((o) => assert.ok(typeof o === 'string' && o.trim().length > 0, `opzione vuota in "${q.question}"`));
        assert.equal(new Set(opts.map(norm)).size, 4, `opzioni ripetute in "${q.question}"`);
    }
});

test('questions-data.js: le opzioni di ogni domanda sono tutte diverse', () => {
    for (const q of QUIZ_DB) {
        assert.equal(new Set(q.opzioni.map(norm)).size, q.opzioni.length, `${q.id}: opzioni ripetute`);
    }
});

test('nessuna domanda ripetuta tra db-cvem.js e questions-data.js', () => {
    const all = questions.map((q) => q.question).concat(QUIZ_DB.map((q) => q.domanda));
    const seen = new Map();
    const dup = [];
    all.forEach((t) => { const k = norm(t); if (seen.has(k)) dup.push(t); seen.set(k, true); });
    assert.deepEqual(dup, []);
});

test('le domande che dipendono dal tempo sono ancorate a un anno', () => {
    // "chi ha vinto piu'..." / "il miglior marcatore..." cambiano: senza un anno diventano false
    const risky = /\b(piu volte|di piu|piu .* vinti|miglior marcatore|capocannoniere di sempre|quanti .* ha vinto)\b/;
    const texts = questions.map((q) => q.question).concat(QUIZ_DB.map((q) => q.domanda));
    const loose = texts.filter((t) => risky.test(norm(t)) && !/\b(19|20)\d\d\b/.test(t) && !/storia|di sempre/.test(t));
    // restano solo fatti chiusi (Pelé, il Genoa, la fondazione della Roma): li si controlla a mano
    assert.ok(loose.length <= 4, `troppe domande senza anno: ${loose.join(' | ')}`);
});

/* ---------- Il gioco in sandbox ---------- */
function fakeEl() {
    const el = {
        innerHTML: '', textContent: '', className: '', disabled: false, dataset: {}, style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
        querySelector() { return fakeEl(); }, getBoundingClientRect() { return { left: 0 }; }
    };
    return el;
}
function loadGame() {
    let deckPool = null;
    const store = {};
    const QZ = {
        $: () => fakeEl(),
        $$: (sel) => (sel === '#answers .answer' ? [0, 1, 2, 3].map((i) => Object.assign(fakeEl(), { dataset: { i: String(i) } })) : []),
        icon: () => '', esc: (s) => String(s), fmt: (n) => String(n),
        ringHTML: () => '', ring: () => fakeEl(),
        Deck: function (key, items) { deckPool = items; this.draw = () => items[0]; },
        store: { get: (k, f) => (k in store ? store[k] : f), set: (k, v) => { store[k] = v; } },
        profile: { best: () => undefined }
    };
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'cvem.js'), 'utf8');
    const ctx = { QZ, questions, QUIZ_DB, document: { addEventListener() {}, querySelector() { return null; } }, window: {}, performance: { now: () => 0 } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: 'cvem.js' });
    return deckPool;
}

test('cvem.js: il mazzo copre tutti i livelli e lascia l\'1 e il 15 a db-cvem', () => {
    const pool = loadGame();
    assert.ok(Array.isArray(pool), 'il gioco non ha creato il mazzo');
    const four = QUIZ_DB.filter((q) => q.opzioni.length === 4).length;
    assert.equal(pool.length, questions.length + four, 'tutte le domande a 4 opzioni devono finire nel mazzo');
    for (let lv = 1; lv <= 15; lv++) {
        const n = pool.filter((q) => q.level === lv).length;
        assert.ok(n >= 18, `livello ${lv}: solo ${n} domande nel mazzo`);
    }
    pool.filter((q) => q.cat).forEach((q) => assert.ok(q.level >= 2 && q.level <= 14, `"${q.text}" finisce al livello ${q.level}`));
    pool.forEach((q) => {
        assert.equal(q.options.length, 4);
        assert.ok(q.correct >= 0 && q.correct < 4, `risposta fuori range in "${q.text}"`);
    });
});

test('cvem.js: il livello di una domanda di QUIZ_DB segue la sua difficolta', () => {
    const pool = loadGame();
    const byText = new Map(pool.map((q) => [q.text, q]));
    const band = { facile: [2, 5], medio: [6, 10], difficile: [11, 14] };
    QUIZ_DB.filter((q) => q.opzioni.length === 4).forEach((q) => {
        const lv = byText.get(q.domanda).level;
        const [a, b] = band[q.difficolta];
        assert.ok(lv >= a && lv <= b, `${q.id} (${q.difficolta}) al livello ${lv}`);
    });
});

/* ---------- Revisione del 26 novembre 2026 ---------- */
function loadHooks(gameAttr) {
    let hooks = null;
    const QZ = {
        $: () => fakeEl(), $$: () => [], icon: () => '', esc: (s) => String(s), fmt: (n) => String(n),
        ringHTML: () => '', ring: () => fakeEl(), pick: (a) => a[0],
        Deck: function () { this.draw = () => null; },
        store: { get: (k, f) => f, set() {} }, profile: { best: () => undefined }
    };
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'cvem.js'), 'utf8');
    const body = { getAttribute: (a) => (a === 'data-game' ? gameAttr : null) };
    const ctx = { QZ, questions, QUIZ_DB, milionarioData: { questions: [], icons: {} }, document: { body, addEventListener() {}, querySelector() { return null; } },
        window: { __cvemTest: (h) => { hooks = h; } }, performance: { now: () => 0 } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: 'cvem.js' });
    return hooks;
}

test('telefonata: il tono della frase non dipende da se l\'amico ci azzecca', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'cvem.js'), 'utf8');
    const conf = src.match(/var conf = ([^;]+);/);
    assert.ok(conf, 'manca la frase dell\'amico');
    assert.doesNotMatch(conf[1], /\bright\b|\bsay\b|correct/, 'il tono e\' legato all\'esito');
    const h = loadHooks('cvem');
    // a ogni livello escono sia frasi sicure sia frasi dubbie (QZ.pick finto prende la prima)
    for (const lv of [1, 5, 6, 10, 11, 15]) {
        const tones = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => h.phoneTone(lv, r)));
        assert.ok(tones.has('Ci metto la mano sul fuoco') && tones.has('Non ne sono certo, ma direi'), `livello ${lv}: ${[...tones]}`);
    }
});

test('dalla domanda 6 la risposta va confermata, e le regole lo dicono', () => {
    const h = loadHooks('cvem');
    assert.equal(h.FINAL_FROM, 6);
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'cvem.js'), 'utf8');
    assert.match(src, /risposta definitiva/);
    // le regole non promettono che il tempo si fermi con 50:50 e +15 s
    assert.doesNotMatch(src, /mentre li usi il tempo si ferma/);
});

test('db-cvem.js: la domanda da un milione si ragiona, non si tira a indovinare', () => {
    const numeric = (q) => ['A', 'B', 'C', 'D'].every((l) => /^\d+$/.test(q.options[l]));
    // quattro numeri che non sono anni (355/365/375/385): li si tira a indovinare
    const close = questions.filter((q) => q.level === 15 && numeric(q) && ['A', 'B', 'C', 'D'].some((l) => Number(q.options[l]) < 1800));
    assert.deepEqual(close.map((q) => q.question), []);
});

test('db-cvem.js: le domande facili stanno in basso, i fatti sui Mondiali arrivano al 2026', () => {
    const lv = (frag) => {
        const q = questions.find((x) => x.question.includes(frag));
        assert.ok(q, `manca: ${frag}`);
        return q.level;
    };
    ['rigore decisivo nella finale del Mondiale 1994', 'capocannoniere del Mondiale 1982', "celebre 'urlo'",
        'capocannoniere del Mondiale 1990', 'arbitro italiano diresse la finale dei Mondiali 2002'].forEach((f) => {
        const l = lv(f);
        assert.ok(l >= 3 && l <= 6, `"${f}" al livello ${l}`);
    });
    assert.deepEqual(questions.filter((q) => /fino al 2022|dopo l'edizione 2022/.test(q.question)).map((q) => q.question), []);
    const top = questions.find((q) => /miglior marcatore della storia dei Mondiali/.test(q.question));
    assert.equal(top.options[top.correctAnswer], 'Kylian Mbappé'); // 22 gol dopo il 2026, Messi 21
});

test('CVEM.html e MilionarioNormale.html: pagina compatta sui telefoni bassi', () => {
    for (const f of ['CVEM.html', 'MilionarioNormale.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
        assert.match(html, /@media \(max-width: 719px\) and \(max-height: 760px\)/, f);
        assert.match(html, /\.answer\.is-asking::after/, f);
    }
});
