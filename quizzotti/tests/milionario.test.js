/* Milionario normale (assets/db-milionario.js + il motore condiviso
   assets/games/cvem.js): 9 categorie x 30 domande, 18 per livello, opzioni
   pulite, nessun doppione con gli altri database, il motore pesca solo da qui. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const { milionarioData } = require(path.join(root, 'assets', 'db-milionario.js'));
const Q = milionarioData.questions;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

test('db-milionario.js: 9 categorie da 30 domande, 18 per ognuno dei 15 livelli', () => {
    const cats = Object.keys(milionarioData.icons);
    assert.equal(cats.length, 9);
    for (const c of cats) assert.equal(Q.filter((q) => q.cat === c).length, 30, c);
    for (let lv = 1; lv <= 15; lv++) assert.equal(Q.filter((q) => q.level === lv).length, 18, `livello ${lv}`);
});

test('db-milionario.js: quattro opzioni piene e diverse, risposta valida e ben distribuita', () => {
    const count = { A: 0, B: 0, C: 0, D: 0 };
    for (const q of Q) {
        assert.ok(q.question.trim().endsWith('?'), `manca il punto di domanda: ${q.question}`);
        assert.ok(!/ {2}/.test(q.question), `spazi doppi: ${q.question}`);
        const opts = ['A', 'B', 'C', 'D'].map((l) => q.options[l]);
        opts.forEach((o) => assert.ok(typeof o === 'string' && o.trim(), `opzione vuota: ${q.question}`));
        assert.equal(new Set(opts.map(norm)).size, 4, `opzioni ripetute: ${q.question}`);
        assert.ok(count[q.correctAnswer] !== undefined, `risposta non valida: ${q.question}`);
        count[q.correctAnswer]++;
    }
    Object.values(count).forEach((n) => assert.ok(n >= Q.length * 0.18, `lettere sbilanciate: ${JSON.stringify(count)}`));
});

test('db-milionario.js: nessuna domanda ripetuta, nemmeno con Milionario Calcio e Jeopardy', () => {
    const seen = new Set();
    const ctx = {};
    vm.createContext(ctx);
    ['db-cvem.js', 'questions-data.js', 'db-jeopardynormale.js', 'db-jeopardy.js'].forEach((f) => {
        vm.runInContext(fs.readFileSync(path.join(root, 'assets', f), 'utf8').replace(/^const /gm, 'var '), ctx);
    });
    ctx.questions.forEach((q) => seen.add(norm(q.question)));
    ctx.QUIZ_DB.forEach((q) => seen.add(norm(q.domanda)));
    ctx.jeopardyNormaleData.concat(ctx.jeopardyData).forEach((c) => c.questions.forEach((q) => seen.add(norm(q.question))));
    for (const q of Q) {
        const k = norm(q.question);
        assert.ok(!seen.has(k), `domanda ripetuta: ${q.question}`);
        seen.add(k);
    }
});

test('db-milionario.js: ogni categoria ha un\'icona che esiste in qz.js', () => {
    const qz = fs.readFileSync(path.join(root, 'assets', 'qz.js'), 'utf8');
    for (const icon of Object.values(milionarioData.icons)) assert.ok(new RegExp(`\\n\\s+${icon}: '`).test(qz), `icona inesistente: ${icon}`);
});

test('cvem.js con data-game="milionario": il mazzo è solo cultura generale, con la categoria', () => {
    let pool = null;
    const el = () => ({ innerHTML: '', textContent: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {}, querySelector() { return el(); }, getBoundingClientRect() { return { left: 0 }; } });
    const QZ = {
        $: () => el(), $$: () => [], icon: () => '', esc: String, fmt: String, ringHTML: () => '', ring: () => el(),
        Deck: function (key, items) { pool = items; this.key = key; this.draw = () => items[0]; },
        store: { get: (k, f) => f, set() {} }, profile: { best: () => undefined }
    };
    const ctx = { QZ, milionarioData, document: { body: { getAttribute: (a) => (a === 'data-game' ? 'milionario' : null) }, addEventListener() {}, querySelector() { return null; } }, window: {}, performance: { now: () => 0 } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'games', 'cvem.js'), 'utf8'), ctx);
    assert.equal(pool.length, Q.length);
    pool.forEach((q) => { assert.ok(q.cat, `senza categoria: ${q.text}`); assert.ok(q.correct >= 0 && q.correct < 4); });
});

test('MilionarioNormale.html: carica il motore condiviso e solo il suo database', () => {
    const html = fs.readFileSync(path.join(root, 'MilionarioNormale.html'), 'utf8');
    assert.match(html, /<body data-game="milionario">/);
    assert.match(html, /assets\/db-milionario\.js/);
    assert.match(html, /assets\/games\/cvem\.js/);
    assert.doesNotMatch(html, /db-cvem\.js|questions-data\.js/);
});
