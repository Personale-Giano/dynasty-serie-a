/* Sfida dei Budget: la classifica (parita', regola dura, chi resta sotto
   passa avanti), la precisione, il "centrato", il mercato solo italiano,
   le impostazioni salvate rovinate, il "A caso" e le statistiche della
   solitaria. Il database e' condiviso con Sopra o Sotto e col Calciatore del
   Giorno: qui si controlla solo che regga il gioco. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { playersDatabase } = require(path.join('..', 'assets', 'db-giocatoributget.js'));
const G = require(path.join('..', 'assets', 'games', 'giocatoributget.js'));

const teams = new Set(playersDatabase.map((p) => p.team));

test('ogni club italiano della lista esiste nel database (niente refusi)', () => {
    for (const t of G.ITALY) assert.ok(teams.has(t), `"${t}" non compare nel database`);
    assert.equal(new Set(G.ITALY).size, G.ITALY.length, 'club ripetuti');
});

test('i mercati bastano anche a 6 giocatori con 11 calciatori, per ogni ruolo', () => {
    for (const m of ['ALL', 'ITA']) {
        const ids = G.poolIds(playersDatabase, m);
        assert.ok(ids.length >= 6 * G.PICKS_MAX * 3, `${m}: solo ${ids.length} calciatori`);
        for (const r of ['POR', 'DIF', 'CEN', 'ATT']) {
            assert.ok(ids.filter((i) => playersDatabase[i].role === r).length >= 20, `${m}: pochi ${r}`);
        }
    }
    assert.equal(G.poolIds(playersDatabase, 'ALL').length, playersDatabase.length);
});

test('nome + squadra identificano un calciatore solo (serve a riprendere la partita)', () => {
    const keys = playersDatabase.map(G.keyOf);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    assert.deepEqual(dup, []);
});

test('classifica: vince il piu vicino, a pari distanza chi e rimasto sotto', () => {
    const rows = G.rank([205, 195, 230], 200, 'near');
    assert.deepEqual(rows.map((r) => r.i), [1, 0, 2]);
    assert.deepEqual(rows.map((r) => r.pos), [1, 2, 3]);
});

test('classifica: parita vera = stessa posizione', () => {
    const rows = G.rank([190, 190, 180], 200, 'near');
    assert.deepEqual(rows.map((r) => r.pos), [1, 1, 3]);
    assert.deepEqual(rows.map((r) => r.i), [0, 1, 2]);
});

test('regola dura: chi sfora va in fondo anche se e piu vicino', () => {
    const rows = G.rank([201, 150, 260], 200, 'bust');
    assert.deepEqual(rows.map((r) => r.i), [1, 0, 2]);
    assert.ok(rows[1].bust && rows[2].bust && !rows[0].bust);
});

test('somme coi decimali senza errori di arrotondamento', () => {
    const rows = G.rank([0.1 + 0.2 + 99.7], 100, 'near');
    assert.equal(rows[0].diff, 0);
    assert.equal(G.accuracy(0, 100), 100);
    assert.equal(G.accuracy(-10, 200), 95);
    assert.equal(G.accuracy(500, 100), 0);
});

test('centrato: entro il 3%, ma con la regola dura mai sopra il budget', () => {
    assert.ok(G.isNear(-6, 200, 'near'));
    assert.ok(G.isNear(6, 200, 'near'));
    assert.ok(!G.isNear(6, 200, 'bust'));
    assert.ok(G.isNear(-6, 200, 'bust'));
    assert.ok(!G.isNear(-6.5, 200, 'near'));
});

test('impostazioni salvate rovinate tornano valide', () => {
    assert.deepEqual(G.cleanSettings(null), { budget: 200, picks: 3, rule: 'near', market: 'ALL' });
    assert.deepEqual(G.cleanSettings({ budget: 99999, picks: -3, rule: 'boh', market: 'XYZ' }), { budget: 1000, picks: 1, rule: 'near', market: 'ALL' });
    assert.deepEqual(G.cleanSettings({ budget: '303', picks: 7, rule: 'bust', market: 'ITA' }), { budget: 305, picks: 7, rule: 'bust', market: 'ITA' });
});

test('"A caso": budget nei limiti, multiplo di 5 e sensato per il numero di calciatori', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 2000; k++) {
        const r = G.randomSetup(rand);
        assert.ok(r.picks >= 1 && r.picks <= 6);
        assert.ok(r.budget >= G.BUDGET_MIN && r.budget <= G.BUDGET_MAX && r.budget % 5 === 0);
        assert.ok(r.budget / r.picks <= 75, `${r.budget} per ${r.picks}`);
    }
});

test('commenti del cronista per ogni esito, senza doppioni', () => {
    assert.equal(G.lineKind(0, 200), 'exact');
    assert.equal(G.lineKind(-5, 200), 'near');
    assert.equal(G.lineKind(-30, 200), 'under');
    assert.equal(G.lineKind(-100, 200), 'cheap');
    assert.equal(G.lineKind(30, 200), 'over');
    assert.equal(G.lineKind(100, 200), 'broke');
    // regola dura: sforare di poco e' "sforato", non un complimento
    assert.equal(G.lineKind(5, 200, 'bust'), 'out');
    assert.equal(G.lineKind(30, 200, 'bust'), 'out');
    assert.equal(G.lineKind(100, 200, 'bust'), 'broke');
    assert.equal(G.lineKind(-5, 200, 'bust'), 'near');
    const all = Object.values(G.LINES).flat();
    assert.equal(new Set(all).size, all.length);
    for (const l of all) assert.ok(l.length > 10 && !/!!|Ops/.test(l), l);
});

test('statistiche della solitaria', () => {
    let st = G.addSoloStats(null, 90, false);
    st = G.addSoloStats(st, 98.5, true);
    assert.deepEqual(st, { games: 2, hits: 1, sum: 188.5 });
    assert.deepEqual(G.addSoloStats({ games: 'x' }, 50, false), { games: 1, hits: 0, sum: 50 });
});
