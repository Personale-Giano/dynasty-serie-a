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
        assert.equal(G.leagueOfPlayer(p), 'ITA');
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

/* ---------- Mazzo "Gol in Serie A" ---------- */
const { sosGoalsDatabase } = require(path.join('..', 'assets', 'db-sopraosotto.js'));

test('mazzo dei bomber: voci complete, niente doppioni, gol plausibili', () => {
    assert.ok(sosGoalsDatabase.length >= 50);
    const names = sosGoalsDatabase.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, 'bomber ripetuto');
    for (const p of sosGoalsDatabase) {
        assert.ok(p.name && p.team, 'nome o squadre mancanti');
        assert.ok(['POR', 'DIF', 'CEN', 'ATT'].includes(p.role), `ruolo non valido: ${p.name}`);
        assert.ok(Number.isInteger(p.value) && p.value >= 100 && p.value <= 274, `gol strani: ${p.name} ${p.value}`);
    }
    // Piola resta il re: 274
    assert.equal(sosGoalsDatabase.find((p) => p.name === 'Silvio Piola').value, 274);
    assert.equal(Math.max(...sosGoalsDatabase.map((p) => p.value)), 274);
    // ordinati come la classifica
    for (let i = 1; i < sosGoalsDatabase.length; i++) assert.ok(sosGoalsDatabase[i - 1].value >= sosGoalsDatabase[i].value, `ordine: ${sosGoalsDatabase[i].name}`);
});

test('mazzo dei bomber: solo gente che in Serie A ha chiuso', () => {
    const active = ['Lautaro Martínez', 'Domenico Berardi', 'Paulo Dybala', 'Ciro Immobile', 'Mauro Icardi', 'Andrea Belotti', 'Edin Džeko', 'Duván Zapata', 'Luis Muriel'];
    for (const n of active) assert.ok(!sosGoalsDatabase.some((p) => p.name === n), `${n} e' ancora in attivita'`);
});

test('mazzo dei bomber: serie lunghe giocabili, mai pari, differenze che si stringono', () => {
    const pool = G.buildPool(sosGoalsDatabase, {});
    const scale = G.DECKS.gol.scale;
    assert.ok(G.playable(pool));
    let firstWide = 0;
    for (let run = 0; run < 40; run++) {
        const r = rng(500 + run);
        const used = {};
        let left = G.firstPlayer(pool, r);
        used[left.name + '|' + left.team] = true;
        for (let n = 0; n < 80; n++) {
            const right = G.nextPlayer(pool, left, n, used, r, scale);
            assert.ok(right, 'nessun avversario');
            assert.notEqual(right.value, left.value);
            if (n === 0 && Math.max(left.value, right.value) / Math.min(left.value, right.value) >= 1.3) firstWide++;
            used[right.name + '|' + right.team] = true;
            left = right;
        }
    }
    assert.ok(firstWide >= 36, `prime coppie troppo strette: ${firstWide}/40`);
    assert.ok(G.level(0, scale).minR < G.level(0).minR && G.level(30, scale).minR > 1);
});

test('la differenza si racconta in parole', () => {
    assert.equal(G.diffText({ value: 10 }, { value: 45 }), '35 mln in più');
    assert.equal(G.diffText({ value: 1.5 }, { value: 0.7 }), '800 mila in meno');
    assert.equal(G.diffText({ value: 274 }, { value: 250 }, G.fmtGoals), '24 gol in meno');
});

test('niente ping-pong di prezzi: si evita il valore di due turni prima', () => {
    const pool = G.buildPool(playersDatabase, {});
    let pingpong = 0, total = 0;
    for (let run = 0; run < 30; run++) {
        const r = rng(900 + run);
        const used = {};
        let prev = null;
        let left = G.firstPlayer(pool, r);
        for (let n = 0; n < 40; n++) {
            const right = G.nextPlayer(pool, left, n, used, r, 1, prev ? prev.value : null);
            if (prev && right.value === prev.value) pingpong++;
            total++;
            used[right.name + '|' + right.team] = true;
            prev = left;
            left = right;
        }
    }
    assert.ok(pingpong / total < 0.05, `ping-pong ${pingpong}/${total}`);
});

test('il confronto più stretto usa i cognomi giusti', () => {
    assert.equal(G.surname('Gigi Riva'), 'Riva');
    assert.equal(G.surname('Pietro Paolo Virdis'), 'Virdis');
    assert.equal(G.surname('Koni De Winter'), 'De Winter');
    assert.equal(G.surname('Micky van de Ven'), 'van de Ven');
    assert.equal(G.surname('Vinícius Jr.'), 'Vinícius Jr.');
    assert.equal(G.surname('Kim Min-jae'), 'Kim Min-jae');
    assert.equal(G.surname('Rodri'), 'Rodri');
});
