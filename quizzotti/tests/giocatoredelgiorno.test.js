/* Il Calciatore del Giorno: database coerente con quello della Sfida dei
   Budget (stessa squadra, ruolo e valore), campi completi e validi, niente
   duplicati, almeno 350 voci; il calciatore del giorno e' deterministico e non
   si ripete nei primi 350 giorni. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { dailyPlayers } = require(path.join('..', 'assets', 'db-giocatoredelgiorno.js'));
const { playersDatabase } = require(path.join('..', 'assets', 'db-giocatoributget.js'));
const Core = require(path.join('..', 'assets', 'games', 'giocatoredelgiorno.js'));

const ROLES = ['POR', 'DIF', 'CEN', 'ATT'];
const CONTINENTS = ['Europa', 'Sudamerica', 'Nordamerica', 'Africa', 'Asia', 'Oceania'];
const LEAGUES = ['Serie A', 'Premier League', 'Liga', 'Bundesliga', 'Ligue 1', 'Liga Portugal', 'Süper Lig',
    'Eredivisie', 'Scottish Premiership', 'Saudi Pro League', 'MLS', 'Brasileirão'];

test('almeno 350 calciatori, senza duplicati', () => {
    assert.ok(dailyPlayers.length >= 350, `solo ${dailyPlayers.length} calciatori`);
    const names = dailyPlayers.map((p) => p.name);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dup, [], 'nomi duplicati: ' + dup.join(', '));
    const norm = names.map(Core.norm);
    assert.equal(new Set(norm).size, norm.length, 'nomi uguali una volta tolti gli accenti');
});

test('ogni calciatore esiste nel db del budget con la stessa squadra, ruolo e valore', () => {
    for (const p of dailyPlayers) {
        const b = playersDatabase.filter((x) => x.name === p.name);
        assert.equal(b.length, 1, `${p.name}: ${b.length} voci nel db del budget`);
        assert.equal(p.team, b[0].team, `${p.name}: squadra diversa`);
        assert.equal(p.role, b[0].role, `${p.name}: ruolo diverso`);
        assert.equal(p.value, b[0].value, `${p.name}: valore diverso`);
    }
});

test('campi completi e validi', () => {
    for (const p of dailyPlayers) {
        assert.deepEqual(Object.keys(p).sort(), ['born', 'continent', 'league', 'name', 'nation', 'role', 'team', 'value'], p.name);
        assert.ok(ROLES.includes(p.role), `${p.name}: ruolo ${p.role}`);
        assert.ok(CONTINENTS.includes(p.continent), `${p.name}: continente ${p.continent}`);
        assert.ok(LEAGUES.includes(p.league), `${p.name}: campionato ${p.league}`);
        assert.ok(typeof p.nation === 'string' && p.nation.length >= 3, `${p.name}: nazionale`);
        assert.ok(Number.isInteger(p.born) && p.born >= 1983 && p.born <= 2009, `${p.name}: anno ${p.born}`);
        assert.ok(typeof p.value === 'number' && p.value > 0, `${p.name}: valore`);
    }
});

test('stessa squadra = stesso campionato, stessa nazionale = stesso continente', () => {
    const team = {}, nat = {};
    for (const p of dailyPlayers) {
        if (team[p.team]) assert.equal(team[p.team], p.league, `${p.team} in due campionati`);
        team[p.team] = p.league;
        if (nat[p.nation]) assert.equal(nat[p.nation], p.continent, `${p.nation} in due continenti`);
        nat[p.nation] = p.continent;
    }
});

test('la funzione del giorno: N° 1 il 16 novembre 2026, deterministica', () => {
    assert.equal(Core.dayIndex('2026-11-16'), 0);
    assert.equal(Core.daily(dailyPlayers, '2026-11-16').n, 1);
    assert.equal(Core.daily(dailyPlayers, '2026-11-17').n, 2);
    assert.equal(Core.daily(dailyPlayers, '2027-11-16').n, 366);
    const a = Core.daily(dailyPlayers, '2026-12-25').player;
    const b = Core.daily(dailyPlayers.slice().reverse(), '2026-12-25').player;
    assert.equal(a.name, b.name, 'l\'ordine non deve dipendere dall\'ordine del file');
    assert.equal(Core.daily(dailyPlayers, '2026-12-25').player.name, a.name);
    // la data di Roma: alle 23:30 UTC del 17 novembre a Roma e' gia' il 18
    assert.equal(Core.romeDate(new Date('2026-11-17T23:30:00Z')), '2026-11-18');
    assert.equal(Core.romeDate(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
    assert.equal(Core.romeDate(new Date('2026-07-01T22:01:00Z')), '2026-07-02');
});

test('nessuna ripetizione nei primi 350 giorni (anzi, per tutta la lista)', () => {
    const seen = new Set();
    const start = Date.UTC(2026, 10, 16);
    for (let i = 0; i < dailyPlayers.length; i++) {
        const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
        const t = Core.daily(dailyPlayers, d);
        assert.equal(t.n, i + 1);
        assert.ok(!seen.has(t.player.name), `${t.player.name} ripetuto al giorno ${i + 1}`);
        seen.add(t.player.name);
    }
    assert.ok(seen.size >= 350);
});

test('confronto delle caselle', () => {
    const find = (n) => dailyPlayers.find((p) => p.name === n);
    const s = find('Nicolò Barella');
    const same = Core.compare(s, s, 2026);
    assert.ok(same.every((c) => c.state === 'hit' && c.arrow === null));
    const g = find('Lautaro Martínez'); // Inter, Argentina, ATT
    const c = Object.fromEntries(Core.compare(g, s, 2026).map((x) => [x.key, x]));
    assert.equal(c.team.state, 'hit');
    assert.equal(c.league.state, 'hit');
    assert.equal(c.nation.state, 'miss');
    assert.equal(c.role.state, 'miss');
    assert.equal(c.age.state, 'hit'); // entrambi del 1997
    // valore: Lautaro 70, Barella 50 -> fuori dal 25%, il segreto vale meno
    assert.equal(c.value.state, 'miss');
    assert.equal(c.value.arrow, 'down');
    const fr = find('Kylian Mbappé');
    const it = find('Moise Kean');
    assert.equal(Core.compare(fr, it, 2026)[0].state, 'near'); // Francia/Italia: stesso continente
});

test('ricerca per cognome e senza accenti, testo da condividere', () => {
    assert.equal(Core.search(dailyPlayers, 'mbappe')[0].name, 'Kylian Mbappé');
    assert.equal(Core.search(dailyPlayers, 'odegaard')[0].name, 'Martin Ødegaard');
    assert.ok(Core.search(dailyPlayers, 'de bruyne').some((p) => p.name === 'Kevin De Bruyne'));
    assert.equal(Core.hint({ name: 'Kevin De Bruyne' }).letter, 'D');
    assert.equal(Core.hint({ name: 'Pedri' }).mono, true);
    const txt = Core.shareText(4, [['miss', 'near', 'miss', 'hit', 'miss', 'miss'], ['hit', 'hit', 'hit', 'hit', 'hit', 'hit']], true, false);
    assert.match(txt, /^Calciatore del Giorno N° 4 — 2\/6\n\n⬛🟨⬛🟩⬛⬛\n🟩🟩🟩🟩🟩🟩$/);
});

test('archivio: nth() e dateOf() coincidono con il calciatore di quel giorno', () => {
    assert.equal(Core.dateOf(1), '2026-11-16');
    assert.equal(Core.dateOf(46), '2026-12-31');
    assert.equal(Core.dateOf(47), '2027-01-01');
    for (const n of [1, 2, 30, 365, dailyPlayers.length + 3]) {
        assert.equal(Core.nth(dailyPlayers, n).name, Core.daily(dailyPlayers, Core.dateOf(n)).player.name, `N° ${n}`);
    }
});

test('il calciatore del N° 1 resta quello pubblicato (ordine dei giorni congelato)', () => {
    // se cambia, e' cambiato l'elenco o l'algoritmo: il gioco e' gia' online e cambierebbe per tutti
    assert.equal(Core.daily(dailyPlayers, '2026-11-16').player.name, 'João Félix');
    assert.equal(Core.daily(dailyPlayers, '2026-11-17').player.name, 'Myles Lewis-Skelly');
    assert.equal(Core.daily(dailyPlayers, '2026-11-18').player.name, 'Alejandro Garnacho');
});

test('testo da condividere: archivio, bandiera bianca, serie', () => {
    const r = [['miss', 'near', 'miss', 'hit', 'miss', 'miss']];
    assert.equal(Core.shareText(9, r, false, false, { gaveUp: true }), 'Calciatore del Giorno N° 9 — X/6\n\n⬛🟨⬛🟩⬛⬛\n🏳️ bandiera bianca');
    assert.equal(Core.shareText(9, [], false, false, { gaveUp: true }), 'Calciatore del Giorno N° 9 — X/6\n\n🏳️ bandiera bianca');
    assert.match(Core.shareText(3, r, true, true, { archive: true }), /^Calciatore del Giorno N° 3 \(archivio\) — 1\/6 \(con indizio\)\n/);
    assert.match(Core.shareText(3, r, true, false, { streak: 4 }), /\n🔥 serie di 4$/);
    assert.doesNotMatch(Core.shareText(3, r, true, false, { streak: 1 }), /serie/);
    assert.doesNotMatch(Core.shareText(3, r, false, false, { streak: 4 }), /serie/);
});

test('indizio: cognome, nome unico, conosciuti per nome', () => {
    assert.deepEqual(Core.hint({ name: 'Nicolò Barella' }), { mono: false, letter: 'B' });
    assert.deepEqual(Core.hint({ name: 'Kim Min-jae' }), { mono: false, letter: 'K' });
    assert.deepEqual(Core.hint({ name: 'Marc-André ter Stegen' }), { mono: false, letter: 'T' });
    assert.deepEqual(Core.hint({ name: 'Vinícius Jr.' }), { mono: true, letter: 'V' });
    assert.deepEqual(Core.hint({ name: 'João Pedro' }), { mono: true, letter: 'J' });
    assert.deepEqual(Core.hint({ name: 'Alisson Becker' }), { mono: true, letter: 'A' });
    // ogni nome dell'elenco ha un indizio con una lettera vera
    for (const p of dailyPlayers) assert.match(Core.hint(p).letter, /^\p{Lu}$/u, p.name);
});

test('ricerca: esclusi i nomi gia\' provati, limite, niente risultati per query vuote', () => {
    assert.deepEqual(Core.search(dailyPlayers, ''), []);
    assert.deepEqual(Core.search(dailyPlayers, '  '), []);
    const all = Core.search(dailyPlayers, 'mar', null, 50);
    assert.ok(all.length > 8);
    assert.equal(Core.search(dailyPlayers, 'mar').length, 8);
    const ex = { 'Kylian Mbappé': true };
    assert.ok(!Core.search(dailyPlayers, 'mbappe', ex).some((p) => p.name === 'Kylian Mbappé'));
    assert.equal(Core.search(dailyPlayers, 'ODEGAARD')[0].name, 'Martin Ødegaard');
    assert.equal(Core.search(dailyPlayers, 'calhanoglu')[0].name, 'Hakan Çalhanoğlu');
});

test('conto alla rovescia: giorni da 23 e 25 ore', () => {
    // 28 marzo 2027, 00:00 a Roma = 27 marzo 23:00 UTC; il giorno dura 23 ore
    assert.equal(Core.msToNext(new Date('2027-03-27T23:00:00Z')), 23 * 3600000);
    // 31 ottobre 2027 dura 25 ore (00:00 Roma = 30 ottobre 22:00 UTC)
    assert.equal(Core.msToNext(new Date('2027-10-30T22:00:00Z')), 25 * 3600000);
    assert.equal(Core.msToNext(new Date('2026-11-16T22:59:59Z')), 1000);
});
