/* Bomba: i temi devono essere giocabili (niente doppioni, nemmeno con accenti o
   maiuscole diverse, ogni categoria con abbastanza temi) e la logica pura del
   gioco (impostazioni, classifica, partita salvata, record del telefono, ritmo
   del ticchettio) deve reggere i casi limite. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { topics } = require(path.join('..', 'assets', 'db-bomba.js'));
const B = require(path.join('..', 'assets', 'games', 'bomba.js'));

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CATS = [...new Set(topics.map((t) => t.categoria))];

test('almeno 600 temi, nessun doppione nemmeno con accenti o maiuscole diverse', () => {
    assert.ok(topics.length >= 600, `solo ${topics.length} temi`);
    const seen = new Map();
    for (const t of topics) {
        const k = norm(t.topic);
        assert.ok(!seen.has(k), `"${t.topic}" doppione di "${seen.get(k)}"`);
        seen.set(k, t.topic);
        assert.equal(t.topic.trim(), t.topic, `spazi in "${t.topic}"`);
        assert.ok(!/\s{2}/.test(t.topic), `doppio spazio in "${t.topic}"`);
    }
});

test('ogni categoria ha abbastanza temi per non ripetersi in una partita', () => {
    for (const c of CATS) {
        const n = topics.filter((t) => t.categoria === c).length;
        assert.ok(n >= 8, `${c}: solo ${n} temi`);
    }
});

test('niente elenchi chiusi troppo corti (vincitori di Europei e Copa America sono 10 o meno)', () => {
    const banned = ['Nazionali che hanno vinto gli Europei', 'Nazionali che hanno vinto la Copa América', "Squadre che hanno vinto l'Europa League"];
    for (const b of banned) assert.ok(!topics.some((t) => t.topic === b), b);
});

test('impostazioni: valori vecchi o rovinati tornano ai predefiniti', () => {
    assert.deepEqual(B.normCfg(null, CATS), { mode: 'points', rounds: 10, fuse: 'mid', cats: null });
    assert.deepEqual(B.normCfg({ mode: 'elim', rounds: 15, fuse: 'long' }, CATS), { mode: 'elim', rounds: 15, fuse: 'long', cats: null });
    const c = B.normCfg({ mode: 'boh', rounds: 7, fuse: 'toString', cats: ['Stadi', 'Stadi', 'Inesistente'] }, CATS);
    assert.equal(c.mode, 'points');
    assert.equal(c.rounds, 10);
    assert.equal(c.fuse, 'mid');
    assert.deepEqual(c.cats, ['Stadi']);
    // tutte le categorie, o nessuna valida: vuol dire "tutte"
    assert.equal(B.normCfg({ cats: CATS }, CATS).cats, null);
    assert.equal(B.normCfg({ cats: ['x'] }, CATS).cats, null);
    assert.equal(B.normCfg({ rounds: '5' }, CATS).rounds, 5);
});

test('nomi uguali diventano distinguibili', () => {
    assert.deepEqual(B.dedupeNames(['Luca', 'luca', 'Marco', 'LUCA']), ['Luca', 'luca 2', 'Marco', 'LUCA 3']);
    // un "Luca 2" vero non viene doppiato
    assert.deepEqual(B.dedupeNames(['Luca', 'Luca 2', 'Luca']), ['Luca', 'Luca 2', 'Luca 3']);
});

test('il ticchettio accelera con la tensione e resta nei limiti', () => {
    assert.ok(B.interval(0, 0.5) > B.interval(0.5, 0.5));
    assert.ok(B.interval(0.5, 0.5) > B.interval(1, 0.5));
    assert.ok(B.interval(1, 0) >= 110 * 0.9 - 1e-9);
    assert.ok(B.interval(-1, 1) <= 900 * 1.1 + 1e-9);
    assert.equal(B.heat(0, 90000, 30000), 0);
    assert.equal(B.heat(30000, 90000, 30000), 0.5 * (1 / 3) + 0.5);
    assert.equal(B.heat(999999, 90000, 30000), 1);
});

const P = (name, score, extra) => Object.assign({ name, color: '#000', score, booms: 0, out: false, outRound: 0 }, extra);

test('classifica a punti: punti, poi meno scoppi; il pareggio vero si riconosce', () => {
    const rows = B.ranking([P('A', 3, { booms: 2 }), P('B', 3, { booms: 1 }), P('C', 5, { booms: 0 })], 'points');
    assert.deepEqual(rows.map((r) => r.name), ['C', 'B', 'A']);
    assert.equal(rows.filter((r) => r.v === rows[0].v).length, 1);
    const tie = B.ranking([P('A', 3, { booms: 1 }), P('B', 3, { booms: 1 })], 'points');
    assert.equal(tie.filter((r) => r.v === tie[0].v).length, 2);
});

test('classifica a eliminazione: chi e\' in piedi, poi chi e\' saltato piu\' tardi', () => {
    const rows = B.ranking([P('A', 0, { out: true, outRound: 1 }), P('B', 0), P('C', 0, { out: true, outRound: 2 })], 'elim');
    assert.deepEqual(rows.map((r) => r.name), ['B', 'C', 'A']);
    assert.equal(rows[0].sub, 'ultimo in piedi');
    assert.equal(rows[2].sub, 'saltato al 1° round');
    // chiusa a meta': due ancora in piedi sono pari in vetta
    const mid = B.ranking([P('A', 0), P('B', 0), P('C', 0, { out: true, outRound: 1 })], 'elim');
    assert.equal(mid.filter((r) => r.v === mid[0].v).length, 2);
});

test('partita salvata: si riprende solo se recente e coerente', () => {
    const now = 1e12;
    const G = { players: [P('A', 1), P('B', 0)], round: 2, done: 1, holder: 0, passes: 4, lens: [30000] };
    const ok = { v: 1, t: now - 1000, cfg: { mode: 'points', rounds: 5, fuse: 'short' }, G };
    assert.ok(B.validSave(ok, now, CATS));
    assert.equal(B.validSave(ok, now, CATS).cfg.fuse, 'short');
    assert.equal(B.validSave(null, now, CATS), null);
    assert.equal(B.validSave('rotto', now, CATS), null);
    assert.equal(B.validSave(Object.assign({}, ok, { v: 2 }), now, CATS), null);
    assert.equal(B.validSave(Object.assign({}, ok, { t: now - B.SAVE_TTL - 1 }), now, CATS), null, 'scaduta');
    assert.equal(B.validSave(Object.assign({}, ok, { t: 'ieri' }), now, CATS), null);
    assert.equal(B.validSave(Object.assign({}, ok, { G: Object.assign({}, G, { holder: 5 }) }), now, CATS), null);
    assert.equal(B.validSave(Object.assign({}, ok, { G: Object.assign({}, G, { round: 6 }) }), now, CATS), null, 'oltre i round');
    assert.equal(B.validSave(Object.assign({}, ok, { G: Object.assign({}, G, { players: [P('A', 0)] }) }), now, CATS), null);
    const elimOver = { v: 1, t: now, cfg: { mode: 'elim' }, G: { players: [P('A', 0), P('B', 0, { out: true, outRound: 1 })], round: 2, holder: 0 } };
    assert.equal(B.validSave(elimOver, now, CATS), null, 'a eliminazione con un solo superstite e\' gia\' finita');
    const holderOut = { v: 1, t: now, cfg: { mode: 'elim' }, G: { players: [P('A', 0, { out: true, outRound: 1 }), P('B', 0), P('C', 0)], round: 2, holder: 0 } };
    assert.equal(B.validSave(holderOut, now, CATS), null);
});

test('record del telefono: il primo round non fa notizia, poi si annunciano i nuovi', () => {
    let r = B.updateStats(null, 40000, 6);
    assert.deepEqual(r.fresh, []);
    assert.deepEqual(r.stats, { fastest: 40000, longest: 40000, bestRun: 6, rounds: 1 });
    r = B.updateStats(r.stats, 20000, 3);
    assert.deepEqual(r.fresh, ['fastest']);
    r = B.updateStats(r.stats, 60000, 9);
    assert.deepEqual(r.fresh.sort(), ['bestRun', 'longest']);
    r = B.updateStats({ fastest: 'x', longest: -3 }, 10000, 0);
    assert.equal(r.stats.fastest, 10000);
    assert.equal(r.stats.longest, 10000);
    // pochi millesimi in piu' non sono un record da annunciare (a schermo si vede lo stesso tempo)
    r = B.updateStats({ fastest: 15000, longest: 15000, bestRun: 1, rounds: 1 }, 15012, 1);
    assert.deepEqual(r.fresh, []);
    assert.equal(r.stats.longest, 15012);
});

test('secondi all\'italiana con la virgola', () => {
    assert.equal(B.secs(12345), '12,3 s');
});
