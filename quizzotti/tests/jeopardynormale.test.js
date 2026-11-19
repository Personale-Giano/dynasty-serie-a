/* Jeopardy normale (assets/db-jeopardynormale.js + il motore condiviso
   assets/games/jeopardy.js): 9 categorie x 50 domande, 10 per valore, foto
   presenti sul disco, icone esistenti, id della pagina tutti al loro posto. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { jeopardyNormaleData } = require(path.join(root, 'assets', 'db-jeopardynormale.js'));
const { jeopardyData } = require(path.join(root, 'assets', 'db-jeopardy.js'));

test('db-jeopardynormale.js: 9 categorie, 10 domande per ogni valore da 100 a 500', () => {
    assert.equal(jeopardyNormaleData.length, 9);
    assert.equal(new Set(jeopardyNormaleData.map((c) => c.category)).size, 9);
    for (const cat of jeopardyNormaleData) {
        for (const v of [100, 200, 300, 400, 500]) {
            assert.equal(cat.questions.filter((q) => q.value === v).length, 10, `${cat.category} ${v}`);
        }
        assert.equal(cat.questions.length, 50, cat.category);
    }
});

test('db-jeopardynormale.js: testi puliti e nessuna domanda ripetuta (nemmeno col Jeopardy Calcio)', () => {
    const seen = new Set();
    jeopardyData.forEach((c) => c.questions.forEach((q) => seen.add(q.question.trim().toLowerCase())));
    for (const cat of jeopardyNormaleData) {
        for (const q of cat.questions) {
            assert.ok(q.question.includes('?'), `manca il punto di domanda: ${q.question}`);
            assert.ok(!/ {2}/.test(q.question) && !/ {2}/.test(q.answer), `spazi doppi: ${q.question}`);
            assert.ok(q.answer.trim().length > 0, `risposta vuota: ${q.question}`);
            const k = q.question.trim().toLowerCase();
            assert.ok(!seen.has(k), `domanda ripetuta: ${q.question}`);
            seen.add(k);
        }
    }
});

test('db-jeopardynormale.js: ogni foto esiste ed ha il link alla fonte', () => {
    let n = 0;
    for (const cat of jeopardyNormaleData) {
        for (const q of cat.questions) {
            if (!q.img) continue;
            n++;
            assert.match(q.img, /^assets\/img\/jn\/[a-z0-9-]+\.webp$/);
            assert.ok(fs.existsSync(path.join(root, q.img)), `foto mancante: ${q.img}`);
            assert.match(q.src, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, `fonte mancante: ${q.img}`);
        }
    }
    assert.ok(n >= 40, `troppe poche foto: ${n}`);
});

test('db-jeopardynormale.js: ogni categoria ha un\'icona che esiste in qz.js', () => {
    const qz = fs.readFileSync(path.join(root, 'assets', 'qz.js'), 'utf8');
    for (const cat of jeopardyNormaleData) {
        assert.ok(new RegExp(`\\n\\s+${cat.icon}: '`).test(qz), `icona inesistente: ${cat.icon}`);
    }
});

test('JeopardyNormale.html: usa il motore condiviso, il suo database e ha tutti gli id', () => {
    const html = fs.readFileSync(path.join(root, 'JeopardyNormale.html'), 'utf8');
    assert.match(html, /<body data-game="jeopardynormale">/);
    assert.match(html, /assets\/db-jeopardynormale\.js/);
    assert.match(html, /assets\/games\/jeopardy\.js/);
    assert.doesNotMatch(html, /assets\/db-jeopardy\.js/);
    const js = fs.readFileSync(path.join(root, 'assets', 'games', 'jeopardy.js'), 'utf8');
    const ids = new Set();
    for (const m of js.matchAll(/\$\('#([a-z][\w-]*\w)['\s]/g)) ids.add(m[1]);
    const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
    assert.deepEqual(missing, []);
});
