/* Sopra o Sotto: la mappa squadra -> campionato deve usare i nomi esatti del
   database dei valori (un refuso manderebbe il club in "Resto del mondo"),
   e la scelta delle coppie deve rispettare le regole del gioco: mai due
   valori uguali, mai lo stesso giocatore, partenza tra i piu' famosi e
   differenze che si stringono con la serie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { playersDatabase } = require(path.join('..', 'assets', 'db-giocatoributget.js'));
const G = require(path.join('..', 'assets', 'games', 'sopraosotto.js'));

const dbTeams = new Set(playersDatabase.map((p) => p.team));

/** Generatore pseudo-casuale ripetibile (mulberry32). */
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test('il database ha giocatori con ruolo, squadra e valore positivo', () => {
    assert.ok(playersDatabase.length >= 1500);
    for (const p of playersDatabase) {
        assert.ok(p.name && p.team, 'nome o squadra mancante');
        assert.ok(['POR', 'DIF', 'CEN', 'ATT'].includes(p.role), `ruolo non valido: ${p.name} ${p.role}`);
        assert.ok(typeof p.value === 'number' && p.value > 0, `valore non valido: ${p.name}`);
    }
});

test('ogni squadra della mappa campionati esiste nel database (niente refusi)', () => {
    for (const [league, teams] of Object.entries(G.LEAGUES)) {
        for (const t of teams) assert.ok(dbTeams.has(t), `${league}: "${t}" non compare nel database`);
    }
});

test('nessuna squadra sta in due campionati', () => {
    const all = Object.values(G.LEAGUES).flat();
    const dup = all.filter((t, i) => all.indexOf(t) !== i);
    assert.deepEqual(dup, []);
});

test('ogni campionato ha abbastanza giocatori, anche per ruolo', () => {
    for (const k of Object.keys(G.LEAGUE_NAMES)) {
        const pool = G.buildPool(playersDatabase, { league: k });
        assert.ok(G.playable(pool) && pool.length >= 80, `${k}: solo ${pool.length} giocatori`);
        assert.ok(G.playableRoles(playersDatabase, k).length === 4, `${k}: qualche ruolo non e' giocabile`);
    }
});

test('il mazzo non ha doppioni (stesso nome e squadra) ed e\' ordinato per valore', () => {
    const pool = G.buildPool(playersDatabase, {});
    const keys = pool.map((p) => p.name + '|' + p.team);
    assert.equal(new Set(keys).size, keys.length);
    for (let i = 1; i < pool.length; i++) assert.ok(pool[i - 1].value >= pool[i].value);
});

test('i filtri tengono solo il campionato e il ruolo scelti', () => {
    const pool = G.buildPool(playersDatabase, { league: 'ITA', role: 'POR' });
    assert.ok(pool.length > 0);
    for (const p of pool) {
        assert.equal(G.leagueOf(p.team), 'ITA');
        assert.equal(p.role, 'POR');
    }
    assert.equal(G.leagueOf('Squadra inventata'), 'ROW');
});

test('la difficolta\' cresce: mazzo piu\' largo e valori piu\' vicini', () => {
    for (let n = 1; n < 30; n++) {
        const a = G.level(n - 1), b = G.level(n);
        assert.ok(b.top >= a.top);
        assert.ok(b.minR <= a.minR);
        assert.ok(b.minR >= 1.1);
    }
    assert.ok(G.level(0).minR >= 2.4);
});

test('serie simulate: mai valori uguali, mai lo stesso giocatore, risposta coerente', () => {
    const configs = [{}, { league: 'ITA' }, { league: 'FRA', role: 'POR' }, { league: 'ROW', role: 'ATT' }, { league: 'GER', role: 'DIF' }];
    configs.forEach((cfg, ci) => {
        const pool = G.buildPool(playersDatabase, cfg);
        for (let run = 0; run < 20; run++) {
            const r = rng(ci * 1000 + run);
            const used = {};
            let left = G.firstPlayer(pool, r);
            used[left.name + '|' + left.team] = true;
            for (let n = 0; n < 60; n++) {
                const right = G.nextPlayer(pool, left, n, used, r);
                assert.ok(right, 'nessun avversario trovato');
                assert.notEqual(right.value, left.value, 'coppia con valori uguali');
                assert.notEqual(right, left);
                assert.equal(G.answer(left, right), right.value > left.value ? 'up' : 'down');
                used[right.name + '|' + right.team] = true;
                left = right;
            }
        }
    });
});

test('le prime coppie sono tra giocatori famosi e con differenze ampie', () => {
    const pool = G.buildPool(playersDatabase, {});
    const cut = pool[Math.ceil(pool.length * 0.1) - 1].value;
    const r = rng(7);
    for (let run = 0; run < 50; run++) {
        const left = G.firstPlayer(pool, r);
        assert.ok(left.value >= cut, `${left.name} non e' tra i piu' cari`);
        const right = G.nextPlayer(pool, left, 0, {}, r);
        assert.ok(Math.max(left.value, right.value) / Math.min(left.value, right.value) >= 2, `${left.name} contro ${right.name}: troppo vicini`);
    }
});

test('il valore si scrive come sul tabellone', () => {
    assert.equal(G.fmtValue(45), '45 mln');
    assert.equal(G.fmtValue(2.5), '2,5 mln');
    assert.equal(G.fmtValue(0.8), '800 mila');
    assert.equal(G.fmtValue(0.15), '150 mila');
});
