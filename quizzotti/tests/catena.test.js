/* La Catena: integrita' del database (assets/db-catena.js).
   Ogni catena ha 8 parole e 7 spiegazioni dei legami; parole distinte nella
   catena, nessuna catena doppia, solo lettere maiuscole, spazi e apostrofi. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { chains } = require(path.join('..', 'assets', 'db-catena.js'));
const norm = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');

test('db-catena.js: almeno 80 catene', () => {
    assert.ok(Array.isArray(chains));
    assert.ok(chains.length >= 80, `catene: ${chains.length}`);
});

test('db-catena.js: 8 parole e 7 spiegazioni non vuote per catena', () => {
    chains.forEach((c, i) => {
        assert.ok(Array.isArray(c.words) && c.words.length === 8, `catena ${i}: servono 8 parole`);
        assert.ok(Array.isArray(c.links) && c.links.length === 7, `catena ${i} (${c.words[0]}): servono 7 spiegazioni`);
        c.links.forEach((l, k) => assert.ok(typeof l === 'string' && l.trim().length >= 4, `catena ${c.words[0]}: spiegazione ${k} vuota`));
        assert.equal(new Set(c.links).size, 7, `catena ${c.words[0]}: spiegazioni ripetute`);
    });
});

test('db-catena.js: parole in maiuscolo, solo lettere/spazi/apostrofi, al massimo due parole', () => {
    chains.forEach((c) => c.words.forEach((w) => {
        assert.match(w, /^[A-ZÀÈÉÌÒÙ]+(?:['’ ][A-ZÀÈÉÌÒÙ]+)?$/, `parola non valida: "${w}"`);
        assert.ok(norm(w).length >= 2, `parola troppo corta: "${w}"`);
    }));
});

test('db-catena.js: nessuna parola ripetuta nella stessa catena', () => {
    chains.forEach((c) => {
        const n = c.words.map(norm);
        assert.equal(new Set(n).size, 8, `catena ${c.words[0]}: parole ripetute`);
    });
});

test('db-catena.js: nessuna catena duplicata', () => {
    const keys = chains.map((c) => c.words.map(norm).join('-'));
    assert.equal(new Set(keys).size, keys.length, 'catene duplicate');
    const ends = chains.map((c) => norm(c.words[0]) + '>' + norm(c.words[7]));
    assert.equal(new Set(ends).size, ends.length, 'due catene con la stessa prima e ultima parola');
});
