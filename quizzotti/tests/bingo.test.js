/* Bingo della Partita: integrita' del database degli eventi e generatore
   delle cartelle con seme (assets/games/bingo.js esporta il nucleo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { bingoEvents } = require(path.join('..', 'assets', 'db-bingo.js'));
const Core = require(path.join('..', 'assets', 'games', 'bingo.js'));

const CATS = ['Campo', 'Arbitro e VAR', 'Panchina', 'Telecronaca e TV', 'Tifosi'];

test('db-bingo.js: almeno 140 eventi con testo breve, rarita\' 1-3 e categoria valida', () => {
    assert.ok(bingoEvents.length >= 140, `eventi: ${bingoEvents.length}`);
    for (const e of bingoEvents) {
        assert.equal(typeof e.text, 'string');
        assert.ok(e.text.trim().length > 0, 'testo vuoto');
        assert.equal(e.text, e.text.trim(), `spazi attorno a "${e.text}"`);
        assert.ok(e.text.length <= 40, `testo troppo lungo (${e.text.length}): "${e.text}"`);
        // ogni parola deve stare su una riga della casella
        for (const w of e.text.split(/\s+/)) assert.ok(w.length <= 12, `parola troppo lunga per la casella: "${w}"`);
        assert.ok([1, 2, 3].includes(e.rarity), `rarita' non valida per "${e.text}"`);
        assert.ok(CATS.includes(e.cat), `categoria non valida per "${e.text}": ${e.cat}`);
        if (e.g !== undefined) assert.ok(typeof e.g === 'string' && e.g.length > 0, `argomento non valido per "${e.text}"`);
    }
});

test('db-bingo.js: niente eventi duplicati (anche a meno di maiuscole e spazi)', () => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const seen = new Map();
    for (const e of bingoEvents) {
        const k = norm(e.text);
        assert.ok(!seen.has(k), `duplicato: "${e.text}" / "${seen.get(k)}"`);
        seen.set(k, e.text);
    }
});

test('db-bingo.js: abbastanza eventi per rarita\' e ogni categoria rappresentata', () => {
    for (const r of [1, 2, 3]) {
        const pool = bingoEvents.filter((e) => e.rarity === r);
        // almeno il doppio di quelli che servono per una cartella, per avere varieta'
        assert.ok(pool.length >= Core.MIX[r] * 2, `rarita' ${r}: ${pool.length} eventi, ne servono almeno ${Core.MIX[r] * 2}`);
        // anche togliendo i doppioni di argomento resta di che riempire la cartella
        const free = pool.filter((e) => !e.g).length + new Set(pool.filter((e) => e.g).map((e) => e.g)).size;
        assert.ok(free >= Core.MIX[r], `rarita' ${r}: troppi eventi legati allo stesso argomento`);
    }
    for (const c of CATS) assert.ok(bingoEvents.filter((e) => e.cat === c).length >= 10, `categoria ${c} con meno di 10 eventi`);
});

test('schema della cartella: 8 comuni, 4 medi, 4 rari e righe tutte uguali', () => {
    const count = { 1: 0, 2: 0, 3: 0 };
    Core.PATTERN.forEach((r) => { count[r]++; });
    assert.deepEqual(count, { 1: Core.MIX[1], 2: Core.MIX[2], 3: Core.MIX[3] });
    assert.equal(Core.LINES.length, 10);
    // righe e colonne: 2 comuni, 1 medio, 1 raro; diagonali: 4 comuni
    for (const line of Core.LINES.slice(0, 8)) {
        assert.deepEqual(line.map((i) => Core.PATTERN[i]).sort(), [1, 1, 2, 3]);
    }
    for (const line of Core.LINES.slice(8)) assert.deepEqual(line.map((i) => Core.PATTERN[i]), [1, 1, 1, 1]);
});

test('codici: 4 caratteri dell\'alfabeto senza 0, O, 1, I', () => {
    assert.ok(Core.validCode('K7QX'));
    assert.ok(Core.validCode(' k7-qx '));
    assert.ok(!Core.validCode('K7Q'));
    assert.ok(!Core.validCode('K7Q0'));
    assert.ok(!Core.validCode('OIOI'));
    const rnd = Core.rng(42);
    for (let i = 0; i < 200; i++) assert.ok(Core.validCode(Core.randomCode(rnd)));
});

test('generazione con seme: stesso codice = stessa cartella, anche scritto minuscolo', () => {
    const a = Core.makeCard('K7QX', bingoEvents).map((e) => e.text);
    const b = Core.makeCard('K7QX', bingoEvents).map((e) => e.text);
    const c = Core.makeCard('k7qx', bingoEvents).map((e) => e.text);
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
    const d = Core.makeCard('K7QY', bingoEvents).map((e) => e.text);
    assert.notDeepEqual(a, d);
});

test('generazione con seme: cartelle bilanciate, senza eventi ripetuti ne\' argomenti doppi', () => {
    const rnd = Core.rng(2026);
    const distinct = new Set();
    for (let n = 0; n < 2000; n++) {
        const code = Core.randomCode(rnd);
        const card = Core.makeCard(code, bingoEvents);
        assert.equal(card.length, 16);
        const texts = card.map((e) => e.text);
        assert.equal(new Set(texts).size, 16, `evento ripetuto nella cartella ${code}`);
        const groups = card.filter((e) => e.g).map((e) => e.g);
        assert.equal(new Set(groups).size, groups.length, `due eventi dello stesso argomento nella cartella ${code}`);
        // ogni casella ha la rarita' dello schema (eventualmente specchiato)
        const rar = card.map((e) => e.rarity);
        const mirrored = Core.PATTERN.map((_, i) => Core.PATTERN[Math.floor(i / 4) * 4 + (3 - (i % 4))]);
        assert.ok(rar.join() === Core.PATTERN.join() || rar.join() === mirrored.join(), `schema sbagliato nella cartella ${code}`);
        distinct.add(texts.join('|'));
    }
    assert.ok(distinct.size > 1990, 'troppe cartelle uguali tra codici diversi');
});

test('righe e premi: riga, doppia e bingo vanno al primo che li raggiunge', () => {
    const A = Core.makeCard('AAAA', bingoEvents).map((e) => e.text);
    const B = Core.makeCard('BBBB', bingoEvents).map((e) => e.text);
    // A chiude la prima riga, poi la prima colonna
    const order = [A[0], A[1], A[2], A[3]];
    let pz = Core.prizes([A, B], order);
    assert.ok(pz.riga && pz.riga.winners.includes(0));
    assert.equal(pz.riga.step, 3);
    assert.equal(pz.doppia, null);
    const more = order.concat([A[4], A[8], A[12]].filter((t) => !order.includes(t)));
    pz = Core.prizes([A, B], more);
    assert.ok(pz.doppia && pz.doppia.winners.includes(0));
    assert.equal(pz.bingo, null);
    const all = A.concat(B.filter((t) => !A.includes(t)));
    pz = Core.prizes([A, B], all);
    assert.deepEqual(pz.bingo.winners, [0]);
    const ev = Core.evaluate(A, (t) => all.includes(t));
    assert.equal(ev.full, true);
    assert.equal(ev.lines, 10);
});

test('cartelle stabili: le partite salvate prima delle aggiunte (pool 113) escono identiche', () => {
    assert.equal(Core.LEGACY_POOL, 113);
    // cartella generata dal codice K7QX con il database di 113 eventi (prima di novembre 2026)
    const legacy = ["Gol nel secondo tempo", "Giocatore con la testa fasciata", "Tifoso inquadrato con un cartello", "Inquadrano le riserve che si scaldano", "L'arbitro va a rivedere al monitor", "La squadra va a salutare la curva", "Giocatore a terra, entrano i medici", "Ola sugli spalti", "Il telecronista dice «zona Cesarini»", "Spray per segnare la barriera", "Esultanza sotto la curva", "Rimessa laterale lunga in area", "Replay del gol da un'altra camera", "Rigore assegnato", "Ammonito un portiere", "Una squadra fa tutti e 5 i cambi"];
    assert.deepEqual(Core.makeCard('K7QX', bingoEvents, Core.LEGACY_POOL).map((e) => e.text), legacy);
    // con un pool fissato, aggiungere eventi in fondo non cambia niente
    const n = bingoEvents.length;
    const more = bingoEvents.concat([{ text: 'Evento di prova', rarity: 1, cat: 'Campo' }, { text: 'Altro evento', rarity: 3, cat: 'Tifosi' }]);
    for (const code of ['AAAA', 'K7QX', 'ZZ99', 'M3NP']) {
        assert.deepEqual(Core.makeCard(code, more, n).map((e) => e.text), Core.makeCard(code, bingoEvents).map((e) => e.text));
    }
    // le prime 113 voci non vanno toccate: solo aggiunte in fondo
    assert.ok(bingoEvents.length >= Core.LEGACY_POOL);
});

test('caselle calde e "manca 1": evaluate e oneAway', () => {
    const A = Core.makeCard('AAAA', bingoEvents).map((e) => e.text);
    const marked = new Set([A[0], A[1], A[2]]);
    let ev = Core.evaluate(A, (t) => marked.has(t));
    assert.equal(ev.lines, 0);
    assert.ok(ev.hot[3], 'la quarta casella della prima riga chiude la riga');
    assert.equal(ev.hotCount, 1);
    assert.equal(Core.oneAway(ev), 'riga');
    marked.add(A[3]); marked.add(A[4]); marked.add(A[8]);
    ev = Core.evaluate(A, (t) => marked.has(t));
    assert.equal(ev.lines, 1);
    assert.ok(ev.hot[12]);
    assert.equal(Core.oneAway(ev), 'doppia');
    const almost = new Set(A.slice(0, 15));
    ev = Core.evaluate(A, (t) => almost.has(t));
    assert.equal(Core.oneAway(ev), 'bingo');
    ev = Core.evaluate(A, () => true);
    assert.equal(Core.oneAway(ev), null);
    assert.equal(Core.oneAway(Core.evaluate(A, () => false)), null);
});
