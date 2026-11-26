/* Motore condiviso (assets/qz.js): il mazzo QZ.Deck ricorda tutto il mazzo
   anche oltre 1.500 carte in forma compatta, legge il vecchio formato, e
   QZ.profile.record tiene record separati per modalita' (chiave id:mode). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'qz.js'), 'utf8');

function load(initial) {
    const data = Object.assign({}, initial || {});
    const localStorage = {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; }
    };
    const doc = {
        readyState: 'loading',
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        dispatchEvent() {},
        createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
        documentElement: { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } },
        body: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }
    };
    const win = { document: doc, localStorage, setTimeout, clearTimeout, Math, JSON, Date, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {} };
    win.window = win;
    vm.createContext(win);
    win.CustomEvent = function () {};
    vm.runInContext(SRC, win, { filename: 'assets/qz.js' });
    return { QZ: win.QZ, data };
}

test('QZ.Deck: un mazzo da 2.898 carte esce tutto prima di ripetersi', () => {
    const { QZ, data } = load();
    const items = Array.from({ length: 2898 }, (_, i) => ({ word: 'Parola numero ' + i }));
    const seen = new Set();
    let deck = new QZ.Deck('taboo', items, (w) => w.word);
    for (let i = 0; i < 2898; i++) {
        if (i % 700 === 0) deck = new QZ.Deck('taboo', items, (w) => w.word); // ricarica pagina
        const c = deck.draw();
        assert.ok(!seen.has(c.word), 'carta ripetuta prima della fine del mazzo: ' + c.word + ' (estrazione ' + i + ')');
        seen.add(c.word);
    }
    assert.equal(deck.remaining(), 0);
    // salvato compatto: impronte brevi, non le chiavi intere
    const saved = JSON.parse(data['qz.deck.taboo']);
    assert.equal(saved.v, 2);
    assert.equal(saved.h.split(',').length, 2898);
    assert.ok(data['qz.deck.taboo'].length < 2898 * 9, 'troppo grande: ' + data['qz.deck.taboo'].length);
    // finito il mazzo si rimescola e l'ultima uscita non torna subito
    const last = deck._last;
    const next = deck.draw();
    assert.notEqual(deck.id(next), last);
});

test('QZ.Deck: legge il vecchio formato (array di chiavi intere)', () => {
    const items = ['a', 'b', 'c', 'd'];
    const { QZ, data } = load({ 'qz.deck.prova': JSON.stringify(['a', 'b', 'c']) });
    const deck = new QZ.Deck('prova', items);
    assert.equal(deck.remaining(), 1);
    assert.equal(deck.draw(), 'd');
    assert.equal(JSON.parse(data['qz.deck.prova']).v, 2);
    // dati rovinati: si riparte da zero senza errori
    const r = load({ 'qz.deck.prova': '{"v":2,"h":5}' });
    assert.equal(new r.QZ.Deck('prova', items).remaining(), 4);
});

test('QZ.Deck: filtro e impronte stabili', () => {
    const { QZ } = load();
    assert.equal(QZ.Deck.hash('Catenaccio'), QZ.Deck.hash('Catenaccio'));
    assert.notEqual(QZ.Deck.hash('Catenaccio'), QZ.Deck.hash('catenaccio'));
    const deck = new QZ.Deck('f', [1, 2, 3, 4, 5, 6], (n) => String(n));
    const pari = (n) => n % 2 === 0;
    const got = [deck.draw(pari), deck.draw(pari), deck.draw(pari)].sort();
    assert.deepEqual(got, [2, 4, 6]);
    assert.equal(deck.remaining(pari), 0);
    assert.equal(deck.remaining(), 3);
});

test('QZ.profile.record: record per modalita\' con chiave id:mode, compatibile col vecchio', () => {
    const old = { totalXP: 100, gamesPlayed: { cadutalibera: 3 }, bestScores: {}, lastPlayed: {}, records: { cadutalibera: 9000 } };
    const { QZ } = load({ quizzottiProfile: JSON.stringify(old) });
    assert.equal(QZ.profile.best('cadutalibera'), 9000);
    assert.equal(QZ.profile.best('cadutalibera', 'lampo'), undefined);
    let r = QZ.profile.record('cadutalibera', { xp: 10, score: 500, mode: 'lampo' });
    assert.equal(r.newRecord, false); // prima partita in quella modalita'
    assert.equal(QZ.profile.best('cadutalibera', 'lampo'), 500);
    assert.equal(QZ.profile.best('cadutalibera'), 9000); // il vecchio record non si tocca
    r = QZ.profile.record('cadutalibera', { xp: 10, score: 400, mode: 'calmo' });
    assert.equal(r.newRecord, false);
    r = QZ.profile.record('cadutalibera', { xp: 10, score: 700, mode: 'lampo' });
    assert.equal(r.newRecord, true);
    assert.equal(QZ.profile.best('cadutalibera', 'calmo'), 400);
    assert.equal(QZ.profile.get().gamesPlayed.cadutalibera, 6);
    // senza mode tutto come prima
    r = QZ.profile.record('cadutalibera', { xp: 10, score: 9500 });
    assert.equal(r.newRecord, true);
    assert.equal(QZ.profile.best('cadutalibera'), 9500);
});
