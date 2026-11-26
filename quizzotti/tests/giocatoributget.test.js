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

/* ---------- Novembre 2026 (2): mercato salvato 12 ore, doppioni, database da 3.649 ---------- */
const fs = require('node:fs');
const JS = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'giocatoributget.js'), 'utf8');

test('mercato in corso: in localStorage, valido 12 ore', () => {
    const now = Date.UTC(2026, 10, 26, 21);
    const d = (ago) => ({ v: 1, ts: now - ago, players: [{ name: 'A', picks: [] }] });
    assert.equal(G.LIVE_TTL, 12 * 3600e3);
    assert.ok(G.liveFresh(d(0), now));
    assert.ok(G.liveFresh(d(11.9 * 3600e3), now));
    assert.ok(!G.liveFresh(d(12.1 * 3600e3), now), 'scaduto');
    assert.ok(!G.liveFresh(d(-60e3), now), 'dal futuro (orologio cambiato)');
    assert.ok(!G.liveFresh({ v: 2, ts: now, players: [{}] }, now));
    assert.ok(!G.liveFresh({ v: 1, ts: now, players: [] }, now));
    assert.ok(!G.liveFresh(null, now));
    assert.match(JS, /function session\(\) \{ try \{ return window\.localStorage;/);
    assert.match(JS, /oldSession\(\)/, 'il mercato salvato dalla versione di prima (sessionStorage) si recupera');
});

test('doppioni ammessi: chi gioca dopo non vede (ne\' si vede bloccare) le scelte degli altri', () => {
    assert.doesNotMatch(JS, /takenBy/);
    assert.doesNotMatch(JS, /Preso da/);
    assert.doesNotMatch(JS, /già presi/);
});

test('database: chiavi uniche (la partita salvata si ritrova), valori validi, ricerca veloce', () => {
    assert.ok(playersDatabase.length >= 3600, `calciatori: ${playersDatabase.length}`);
    const keys = new Set(playersDatabase.map(G.keyOf));
    assert.equal(keys.size, playersDatabase.length, 'due calciatori con stesso nome e squadra');
    playersDatabase.forEach((p) => {
        assert.ok(['POR', 'DIF', 'CEN', 'ATT'].includes(p.role), `ruolo ${p.role} di ${p.name}`);
        assert.ok(Number(p.value) > 0 && Number(p.value) <= 300, `valore ${p.value} di ${p.name}`);
    });
    // come filtered(): un tasto premuto non deve costare piu' di qualche millisecondo
    const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const idx = playersDatabase.map((p) => norm(p.name + ' ' + p.team + ' ' + p.role));
    const t0 = process.hrtime.bigint();
    let found = 0;
    for (const q of ['l', 'la', 'lau', 'laut', 'lautaro', 'inter', 'real madrid', 'mbappe']) {
        const terms = q.split(' ');
        found = idx.filter((k) => terms.every((t) => k.includes(t))).length;
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 8;
    assert.ok(ms < 20, `ricerca lenta: ${ms.toFixed(2)} ms a tasto`);
    assert.ok(found >= 1, 'Mbappe non si trova');
    // nei valori c'e' varieta': non tutti uguali, ventaglio ampio
    const vals = new Set(playersDatabase.map((p) => p.value));
    assert.ok(vals.size >= 40, `valori diversi: ${vals.size}`);
});
