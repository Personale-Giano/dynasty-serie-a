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
        assert.ok(b.minR >= 1.25);
    }
    assert.ok(G.level(0).minR >= 2.4);
    // anche dopo cento risposte giuste non si scende sotto 1,25
    assert.equal(G.level(100).minR, 1.25);
    assert.equal(G.level(500).minR, G.MIN_RATIO);
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

/* ---------- A turni: stesso seme, stesse coppie ---------- */
/** La serie di chi indovina sempre: le coppie viste, in ordine. */
function perfectRun(pool, seed, scale, steps) {
    const s = G.newSeries(pool, seed, scale);
    const seen = [[s.left.name, s.right.name]];
    for (let i = 0; i < steps; i++) {
        s.streak++;
        G.advance(s);
        seen.push([s.left.name, s.right.name]);
    }
    return seen;
}

test('a turni tutti affrontano le stesse coppie (stesso seme)', () => {
    const known = G.knownTest([]);
    const pools = [
        [G.buildPool(playersDatabase, { known }), 1],
        [G.buildPool(playersDatabase, { league: 'ITA', role: 'DIF', known }), 1],
        [G.buildPool(sosGoalsDatabase, {}), G.DECKS.gol.scale]
    ];
    for (const [pool, scale] of pools) {
        for (const seed of [1, 42, 123456789, 4294967295]) {
            const a = perfectRun(pool, seed, scale, 40);
            const b = perfectRun(pool, seed, scale, 40);
            assert.deepEqual(a, b, `seme ${seed}: sequenze diverse`);
            // chi sbaglia prima ha visto un pezzo della stessa sequenza
            assert.deepEqual(perfectRun(pool, seed, scale, 7), a.slice(0, 8));
        }
        // semi diversi, partite diverse
        assert.notDeepEqual(perfectRun(pool, 1, scale, 10), perfectRun(pool, 2, scale, 10));
    }
});

test('il generatore col seme e\' ripetibile e sta tra 0 e 1', () => {
    const a = G.makeRng(99), b = G.makeRng(99);
    for (let i = 0; i < 1000; i++) {
        const x = a();
        assert.equal(x, b());
        assert.ok(x >= 0 && x < 1);
    }
});

/* ---------- Valori di mercato: prima i nomi noti ---------- */
const { dailyCalendar } = require(path.join('..', 'assets', 'db-giocatoredelgiorno.js'));

test('mercato: i noti stanno davanti nel mazzo', () => {
    const known = G.knownTest(dailyCalendar);
    const pool = G.buildPool(playersDatabase, { known });
    assert.ok(pool.known >= 800 && pool.known < pool.length, `noti: ${pool.known}`);
    for (let i = 0; i < pool.length; i++) assert.equal(known(pool[i]), i < pool.known, `${pool[i].name} fuori posto`);
    // stesso mazzo di prima, solo in un altro ordine
    assert.equal(pool.length, G.buildPool(playersDatabase, {}).length);
    assert.ok(known({ name: 'Luka Modrić', value: 4 }), 'Modric e\' noto anche se vale poco');
    assert.ok(known({ name: 'Uno qualsiasi', value: 15 }));
    assert.ok(!known({ name: 'Uno qualsiasi', value: 14 }));
});

test('mercato: nelle prime serie solo nomi noti, poi arrivano anche gli altri', () => {
    const known = G.knownTest(dailyCalendar);
    const pool = G.buildPool(playersDatabase, { known });
    let unknownEarly = 0, unknownLate = 0, late = 0;
    for (let run = 0; run < 40; run++) {
        const s = G.newSeries(pool, 7000 + run, 1);
        assert.ok(known(s.left) && known(s.right), 'prima coppia con uno sconosciuto');
        for (let n = 1; n < 60; n++) {
            s.streak = n;
            G.advance(s);
            if (n < G.KNOWN_ONLY && !known(s.right)) unknownEarly++;
            if (n >= 45) { late++; if (!known(s.right)) unknownLate++; }
        }
    }
    assert.equal(unknownEarly, 0, 'sconosciuti nelle prime serie');
    assert.ok(unknownLate / late > 0.2, `in fondo troppo pochi sconosciuti: ${unknownLate}/${late}`);
    // la parte del mazzo in gioco cresce con la serie
    for (let n = 1; n < 60; n++) assert.ok(G.reach(pool, n) >= G.reach(pool, n - 1));
    assert.equal(G.reach(pool, 0), pool.known);
    assert.equal(G.reach(pool, 60), pool.length);
});

/* ---------- I mazzi storici nuovi ---------- */
const fs = require('node:fs');
const DBS = require(path.join('..', 'assets', 'db-sopraosotto.js'));
const dbSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'db-sopraosotto.js'), 'utf8');
const HIST = [
    { key: 'gol', list: DBS.sosGoalsDatabase, min: 50 },
    { key: 'presenze', list: DBS.sosAppsDatabase, min: 80 },
    { key: 'nazionale', list: DBS.sosNationalGoalsDatabase, min: 80 },
    { key: 'titoli', list: DBS.sosTitlesDatabase, min: 60 }
];

test('mazzi storici: voci complete, numeri interi positivi, nomi unici, ordinati', () => {
    for (const { key, list, min } of HIST) {
        assert.ok(list.length >= min, `${key}: solo ${list.length} voci`);
        const names = list.map((p) => p.name);
        assert.equal(new Set(names).size, names.length, `${key}: nome ripetuto`);
        for (const p of list) {
            assert.ok(p.name && p.team, `${key}: nome o riga sotto mancante`);
            assert.ok(p.tag || p.role, `${key}: etichetta mancante per ${p.name}`);
            assert.ok(Number.isInteger(p.value) && p.value > 0, `${key}: numero strano per ${p.name}: ${p.value}`);
        }
        for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].value >= list[i].value, `${key}: ordine a ${list[i].name}`);
        assert.ok(G.DECKS[key] && G.DECKS[key].label && G.DECKS[key].scale > 0);
        assert.ok(G.playable(G.buildPool(list, {})), `${key}: non giocabile`);
    }
});

test('mazzi storici: ognuno ha fonte e data scritte nel file', () => {
    for (const name of ['sosAppsDatabase', 'sosNationalGoalsDatabase', 'sosTitlesDatabase']) {
        const at = dbSource.indexOf('const ' + name);
        const head = dbSource.slice(dbSource.lastIndexOf('/* ===', at), at);
        assert.match(head, /Fonte: [^\n]*wikipedia\.org/, `${name}: fonte mancante`);
        assert.match(head, /2026/, `${name}: data mancante`);
    }
});

test('presenze: numeri noti, nessuno ancora in Serie A', () => {
    const P = DBS.sosAppsDatabase;
    const v = (n) => P.find((p) => p.name === n).value;
    assert.equal(v('Gianluigi Buffon'), 657);
    assert.equal(v('Paolo Maldini'), 647);
    assert.equal(v('Francesco Totti'), 619);
    assert.equal(Math.max(...P.map((p) => p.value)), 657);
    const inSerieA = new Set(playersDatabase.filter((p) => p.league === 'Serie A').map((p) => p.name));
    for (const p of P) {
        assert.ok(!inSerieA.has(p.name), `${p.name} gioca ancora in Serie A`);
        assert.match(p.tag, /^\d{4}-\d{4}$/, `${p.name}: anni strani`);
        assert.ok(p.value >= 380 && p.value <= 657, `${p.name}: ${p.value}`);
    }
});

test('gol in nazionale: dai 50 in su, i record giusti, chi gioca ancora e\' segnato', () => {
    const N = DBS.sosNationalGoalsDatabase;
    const v = (n) => N.find((p) => p.name === n).value;
    assert.equal(N[0].name, 'Cristiano Ronaldo');
    assert.equal(v('Ali Daei'), 108);
    assert.equal(v('Pelé'), 77);
    assert.equal(v('Ferenc Puskás'), 84);
    for (const p of N) {
        assert.ok(p.value >= 50, `${p.name}: meno di 50`);
        assert.equal(!!p.active, /in attività/.test(p.team), `${p.name}: in attivita' o no?`);
    }
    assert.ok(N.filter((p) => p.active).length < N.length / 3, 'troppi ancora in attivita\'');
});

test('campionati vinti: i conti dei grandi club', () => {
    const T = DBS.sosTitlesDatabase;
    const v = (n) => T.find((p) => p.name === n).value;
    assert.equal(v('Juventus'), 36);
    assert.equal(v('Inter'), 21);
    assert.equal(v('Milan'), 19);
    assert.equal(v('Celtic'), 56);
    assert.equal(v('Rangers'), 55);
    assert.equal(v('Real Madrid'), 36);
    assert.equal(v('Bayern Monaco'), 35);
    for (const p of T) assert.match(p.team, /^ultimo titolo \d{4}(-\d{2}|-\d{4})?$/, `${p.name}: ${p.team}`);
    assert.equal(G.fmtTitles(1), '1 titolo');
    assert.equal(G.fmtTitles(36), '36 titoli');
    assert.equal(G.fmtApps(1), '1 presenza');
    assert.equal(G.diffText({ value: 657 }, { value: 647 }, G.fmtApps), '10 presenze in meno');
});

test('mazzi storici: serie lunghe, mai due numeri uguali in coppia', () => {
    for (const { key, list } of HIST) {
        const pool = G.buildPool(list, {});
        const scale = G.DECKS[key].scale;
        for (let run = 0; run < 25; run++) {
            const s = G.newSeries(pool, 300 + run, scale);
            assert.notEqual(s.left.value, s.right.value);
            for (let n = 1; n < 70; n++) {
                s.streak = n;
                G.advance(s);
                assert.ok(s.right, `${key}: nessun avversario`);
                assert.notEqual(s.right.value, s.left.value, `${key}: ${s.left.name} e ${s.right.name} pari`);
                assert.equal(G.answer(s.left, s.right), s.right.value > s.left.value ? 'up' : 'down');
            }
        }
    }
});

/* ---------- Sfida un amico e Sopra o Sotto del giorno ---------- */
test('le regole della sfida nel link: andata e ritorno', () => {
    const cases = [
        [{ deck: 'mercato', league: 'ALL', role: null }, 'mercato-all-any'],
        [{ deck: 'mercato', league: 'ITA', role: 'POR' }, 'mercato-ita-por'],
        [{ deck: 'gol', league: 'ALL', role: null }, 'gol']
    ];
    for (const [m, opt] of cases) {
        assert.equal(G.optOf(m), opt);
        assert.deepEqual(G.parseOpt(opt), m);
    }
    assert.deepEqual(G.parseOpt('boh-xyz-zzz'), { deck: 'mercato', league: 'ALL', role: null }, 'valori sconosciuti: quelli di base');
    assert.deepEqual(G.parseOpt('mercato-row-att'), { deck: 'mercato', league: 'ROW', role: 'ATT' });
});

test('sfida e giorno: lo stesso seme da\' le stesse coppie a chiunque indovini', () => {
    const SF = require(path.join('..', 'assets', 'sfida.js'));
    const pool = G.buildPool(playersDatabase, { league: 'ALL', role: null });
    const seed = SF.daySeed('sopraosotto', '2026-11-27');
    const run = () => {
        const s = G.newSeries(pool, seed, 1);
        const seq = [s.left.name + '/' + s.right.name];
        for (let i = 0; i < 30; i++) { s.streak++; G.advance(s); seq.push(s.right.name); }
        return seq;
    };
    assert.deepEqual(run(), run());
    const other = G.newSeries(pool, SF.daySeed('sopraosotto', '2026-11-28'), 1);
    assert.notEqual(other.left.name + '/' + other.right.name, run()[0], 'il giorno dopo si cambia');
});

test('quadratini della serie del giorno', () => {
    assert.equal(G.dailyGrid(3, true), '🟩🟩🟩🟥');
    assert.equal(G.dailyGrid(0, true), '🟥');
    assert.equal(G.dailyGrid(2, false), '🟩🟩', 'uscito da solo: niente rosso');
    assert.equal(G.dailyGrid(25, true), '🟩'.repeat(20) + ' +5🟥');
});
