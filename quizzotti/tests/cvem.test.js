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
