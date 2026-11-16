/* Jeopardy (assets/db-jeopardy.js + assets/games/jeopardy.js): ogni casella
   del tabellone ha abbastanza domande per due tempi e un gran finale, niente
   domande ripetute, testi puliti, e ogni elemento che lo script cerca nella
   pagina esiste davvero in Jeopardy.html. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const { jeopardyData } = require(path.join(root, 'assets', 'db-jeopardy.js'));
const TIERS = [100, 200, 300, 400, 500];

test('db-jeopardy.js: almeno 15 domande per ogni casella (categoria + valore)', () => {
    for (const cat of jeopardyData) {
        for (const t of TIERS) {
            const n = cat.questions.filter((q) => q.value === t).length;
            assert.ok(n >= 15, `"${cat.category}" ${t}: solo ${n} domande`);
        }
    }
});

test('db-jeopardy.js: nessuna domanda ripetuta, in tutto il database', () => {
    const seen = new Map();
    for (const cat of jeopardyData) {
        for (const q of cat.questions) {
            const key = q.question.trim().toLowerCase().replace(/\s+/g, ' ');
            assert.ok(!seen.has(key), `domanda ripetuta in "${cat.category}" e "${seen.get(key)}": ${q.question}`);
            seen.set(key, cat.category);
        }
    }
});

test('db-jeopardy.js: testi puliti (punto di domanda, niente spazi doppi, nomi categoria unici)', () => {
    assert.equal(new Set(jeopardyData.map((c) => c.category)).size, jeopardyData.length);
    for (const cat of jeopardyData) {
        for (const q of cat.questions) {
            assert.ok(/\?$/.test(q.question.trim()), `manca il punto di domanda: ${q.question}`);
            assert.ok(!/ {2}/.test(q.question) && !/ {2}/.test(q.answer), `spazi doppi: ${q.question}`);
            assert.ok(q.answer.trim().length > 0 && q.answer === q.answer.trim(), `risposta vuota o con spazi: ${q.question}`);
            assert.ok(q.question.length <= 170, `domanda troppo lunga per il maxischermo (${q.question.length}): ${q.question}`);
        }
    }
});

test('games/jeopardy.js: compila e trova nella pagina tutti gli id che usa', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'games', 'jeopardy.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'jeopardy.js' }));
    const html = fs.readFileSync(path.join(root, 'Jeopardy.html'), 'utf8');
    const ids = new Set();
    for (const m of js.matchAll(/\$\('#([a-z][\w-]*\w)['\s]/g)) ids.add(m[1]);
    ['steal', 'double', 'final'].forEach((k) => ids.add('opt-' + k)); // costruiti con 'opt-' + k
    assert.ok(ids.size > 20, 'troppi pochi id trovati: la regex non funziona piu');
    const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
    assert.deepEqual(missing, [], `id usati dallo script ma assenti nella pagina: ${missing.join(', ')}`);
});
