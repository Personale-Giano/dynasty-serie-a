/* Motore condiviso (assets/qz.js): «Esporta / Importa profilo». Il codice
   porta profilo e salvataggi qz.* da un telefono all'altro senza server,
   lascia fuori i mazzi (qz.deck.*) e rifiuta i codici rovinati. */
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
        removeItem: (k) => { delete data[k]; },
        key: (i) => Object.keys(data)[i] ?? null,
        get length() { return Object.keys(data).length; }
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
    const win = {
        document: doc, localStorage, setTimeout, clearTimeout, Math, JSON, Date,
        btoa: globalThis.btoa, atob: globalThis.atob, escape, unescape,
        addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {}
    };
    win.window = win;
    vm.createContext(win);
    win.CustomEvent = function () {};
    vm.runInContext(SRC, win, { filename: 'assets/qz.js' });
    return { QZ: win.QZ, data };
}

test('esporta e importa: profilo e salvataggi passano da un telefono all\'altro', () => {
    const a = load({
        quizzottiProfile: JSON.stringify({ totalXP: 1500, gamesPlayed: { cvem: 3 }, bestScores: {}, lastPlayed: {}, records: { cvem: 9 } }),
        'qz.gdg.stats': JSON.stringify({ streak: 4, nome: 'Totò è già qui' }),
        'qz.deck.taboo': JSON.stringify(['tante', 'carte']),
        altro: 'non mio'
    });
    const code = a.QZ.profile.exportCode();
    assert.match(code, /^QZ1\./);

    const b = load({ 'qz.vecchio': '1', 'qz.deck.cvem': '[]' });
    const info = b.QZ.profile.importCode(code, false);
    assert.equal(info.level, a.QZ.profile.level());
    assert.equal(b.data['qz.vecchio'], '1', 'senza conferma non si scrive niente');
    assert.ok(b.QZ.profile.importCode(code, true));
    assert.equal(b.QZ.profile.get().totalXP, 1500);
    assert.equal(JSON.parse(b.data['qz.gdg.stats']).nome, 'Totò è già qui', 'accenti intatti');
    assert.equal(b.data['qz.vecchio'], undefined, 'i salvataggi che il codice non ha vanno via');
    assert.equal(b.data['qz.deck.taboo'], undefined, 'i mazzi non viaggiano');
    assert.equal(b.data['qz.deck.cvem'], '[]', 'i mazzi di questo telefono restano');
    assert.equal(b.data.altro, undefined);
});

test('importa: i codici rovinati o di altri non passano', () => {
    const { QZ } = load();
    assert.equal(QZ.profile.importCode('', true), null);
    assert.equal(QZ.profile.importCode('ciao', true), null);
    assert.equal(QZ.profile.importCode('QZ1.@@@', true), null);
    const noProfile = 'QZ1.' + globalThis.btoa(JSON.stringify({ v: 1, d: { 'qz.x': '1' } }));
    assert.equal(QZ.profile.importCode(noProfile, true), null);
    // spazi e a capo incollati per sbaglio non contano
    const ok = QZ.profile.exportCode();
    assert.ok(QZ.profile.importCode(ok.slice(0, 10) + '\n ' + ok.slice(10), false));
});
