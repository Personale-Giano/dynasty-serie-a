/* Il Calciatore del Giorno: il calendario esplicito (db-giocatoredelgiorno.js)
   e' congelato nei giorni gia' giocati, non ha doppioni, dal N° 13 pesca solo
   calciatori famosi con i campionati bilanciati, e ogni nome esiste nel
   database grande (db-giocatoributget.js) con tutti i campi; daily(), nth() e
   dateOf() seguono il calendario e ricominciano dall'inizio quando finisce. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { dailyCalendar } = require(path.join('..', 'assets', 'db-giocatoredelgiorno.js'));
const { playersDatabase } = require(path.join('..', 'assets', 'db-giocatoributget.js'));
const Core = require(path.join('..', 'assets', 'games', 'giocatoredelgiorno.js'));

const BY = {};
playersDatabase.forEach((p) => { BY[p.name] = p; });
const CAL = dailyCalendar.map((n) => BY[n]);
const find = (n) => BY[n];

const ROLES = ['POR', 'DIF', 'CEN', 'ATT'];
const CONTINENTS = ['Europa', 'Sudamerica', 'Nordamerica', 'Africa', 'Asia', 'Oceania'];
const LEAGUES = ['Serie A', 'Premier League', 'Liga', 'Bundesliga', 'Ligue 1', 'Liga Portugal', 'Süper Lig',
    'Eredivisie', 'Scottish Premiership', 'Saudi Pro League', 'MLS', 'Brasileirão', 'Pro League', 'Qatar Stars League',
    'Liga Profesional', 'Serie B', 'Championship', 'Altro'];

// i giorni gia' usciti col vecchio sistema (lista mescolata a seme fisso): non cambiano mai
const FROZEN = ['João Félix', 'Myles Lewis-Skelly', 'Alejandro Garnacho', 'Wataru Endō', 'Jesper Karlström',
    'Miloš Kerkez', 'Estêvão', 'Achraf Hakimi', 'Predrag Rajković', 'Lewis Dunk', 'Diego Gómez', 'Maxim De Cuyper'];

// famosissimi con valore basso, ammessi nel calendario sotto i 18 milioni (scelti a mano)
const FAMOUS_LOW = ['Luka Modrić', 'Cristiano Ronaldo', 'Lionel Messi', 'Neymar', 'Robert Lewandowski', 'Kevin De Bruyne',
    'Mohamed Salah', 'Karim Benzema', 'Antoine Griezmann', "N'Golo Kanté", 'Luis Suárez', 'Son Heung-min',
    'Thomas Müller', 'Ángel Di María', 'Edinson Cavani', 'Jamie Vardy', 'Pierre-Emerick Aubameyang',
    'Roberto Firmino', 'Thiago Silva', 'Álvaro Morata', 'Edin Džeko', 'Hugo Lloris', 'Marco Reus', 'Jorginho',
    'Kalidou Koulibaly', 'Sadio Mané', 'Olivier Giroud', 'Manuel Neuer', 'Thibaut Courtois', 'Alisson Becker',
    'Virgil van Dijk', 'Jan Oblak', 'Marc-André ter Stegen', 'Antonio Rüdiger', 'Dani Carvajal', 'Casemiro',
    'İlkay Gündoğan', 'Leroy Sané', 'Marco Asensio', 'Isco', 'Koke', 'Iago Aspas', 'João Cancelo',
    'Mateo Kovačić', 'Harry Maguire', 'Jordan Henderson', 'Granit Xhaka', 'Ivan Perišić', 'Romelu Lukaku',
    'Milan Škriniar', 'David de Gea', 'Kyle Walker', 'Kieran Trippier', 'Memphis Depay', 'Philippe Coutinho',
    'Hakim Ziyech', 'Alexis Sánchez', 'Mario Götze', 'Wojciech Szczęsny', 'Emiliano Martínez',
    'Andrew Robertson', 'Richarlison', 'James Maddison', 'Jordan Pickford', 'Leon Goretzka',
    'Sergej Milinković-Savić', 'Gabriel Jesus', 'Rodrigo De Paul', 'Fabinho', 'Hirving Lozano',
    'Yann Sommer', 'Felipe Anderson', 'Luis Alberto', 'Alessio Romagnoli', 'Stefan de Vrij', 'Andrea Belotti',
    'Leandro Paredes', 'Ángel Correa', 'Marko Arnautović', 'Alex Sandro', 'Danilo', 'Federico Chiesa',
    'Paulo Dybala', 'Hakan Çalhanoğlu', 'Henrikh Mkhitaryan', 'Piotr Zieliński', 'Benjamin Pavard',
    'Manuel Akanji', 'John Stones', 'Giovanni Di Lorenzo', 'Stanislav Lobotka', 'André-Frank Zambo Anguissa',
    'Matteo Politano', 'Leonardo Spinazzola', 'Alex Meret', 'Lorenzo Pellegrini', 'Bryan Cristante',
    'Gianluca Mancini', 'Mattia Zaccagni', 'Domenico Berardi', 'Duván Zapata', 'Stephan El Shaarawy',
    'David Alaba', 'Nicolò Zaniolo', 'Teun Koopmeiners', 'Franck Kessié', 'Riccardo Orsolini',
    'Federico Bernardeschi', 'Guglielmo Vicario', 'Andrea Cambiaso', 'Fikayo Tomori', 'Ruben Loftus-Cheek',
    'Matteo Darmian', 'Albert Gudmundsson', 'Giovanni Simeone', 'Artem Dovbyk', 'Arkadiusz Milik',
    'Nemanja Matić', 'Daniel Maldini', 'Yerry Mina', 'Nicolò Fagioli', 'Federico Gatti', 'Ivan Provedel',
    'Pervis Estupiñán', 'Mario Pašalić', 'Willy Gnonto'];

test('calendario: almeno 742 giorni (12 gia\' usciti + due anni), senza doppioni', () => {
    assert.ok(dailyCalendar.length >= 12 + 730, `solo ${dailyCalendar.length} giorni`);
    const dup = dailyCalendar.filter((n, i) => dailyCalendar.indexOf(n) !== i);
    assert.deepEqual(dup, [], 'nomi ripetuti: ' + dup.join(', '));
    const norm = dailyCalendar.map(Core.norm);
    assert.equal(new Set(norm).size, norm.length, 'nomi uguali una volta tolti gli accenti');
});

test('ogni nome del calendario esiste una volta sola nel database grande, con tutti i campi validi', () => {
    for (const n of dailyCalendar) {
        const b = playersDatabase.filter((x) => x.name === n);
        assert.equal(b.length, 1, `${n}: ${b.length} voci nel database`);
        const p = b[0];
        assert.deepEqual(Object.keys(p).sort(), ['born', 'continent', 'league', 'name', 'nation', 'role', 'team', 'value'], n);
        assert.ok(ROLES.includes(p.role), `${n}: ruolo ${p.role}`);
        assert.ok(CONTINENTS.includes(p.continent), `${n}: continente ${p.continent}`);
        assert.ok(LEAGUES.includes(p.league), `${n}: campionato ${p.league}`);
        assert.ok(typeof p.nation === 'string' && p.nation.length >= 3, `${n}: nazionale`);
        assert.ok(typeof p.team === 'string' && p.team.length >= 2, `${n}: squadra`);
        assert.ok(Number.isInteger(p.born) && p.born >= 1983 && p.born <= 2009, `${n}: anno ${p.born}`);
        assert.ok(typeof p.value === 'number' && p.value > 0, `${n}: valore`);
    }
});

test('stessa squadra = stesso campionato, stessa nazionale = stesso continente', () => {
    const team = {}, nat = {};
    for (const p of playersDatabase) {
        if (team[p.team]) assert.equal(team[p.team], p.league, `${p.team} in due campionati`);
        team[p.team] = p.league;
        if (nat[p.nation]) assert.equal(nat[p.nation], p.continent, `${p.nation} in due continenti`);
        nat[p.nation] = p.continent;
    }
});

test('i N° 1-12 restano quelli gia\' usciti (calendario congelato)', () => {
    // se cambia, il gioco (gia' online) cambierebbe per tutti i giorni passati e per l'archivio
    assert.deepEqual(dailyCalendar.slice(0, 12), FROZEN);
    assert.equal(Core.daily(CAL, '2026-11-16').player.name, 'João Félix');
    assert.equal(Core.daily(CAL, '2026-11-17').player.name, 'Myles Lewis-Skelly');
    assert.equal(Core.daily(CAL, '2026-11-18').player.name, 'Alejandro Garnacho');
    assert.equal(Core.daily(CAL, '2026-11-27').player.name, 'Maxim De Cuyper');
    assert.equal(Core.daily(CAL, '2026-11-27').n, 12);
});

test('dal N° 13 solo calciatori famosi (18 milioni in su, o nell\'elenco dei famosissimi)', () => {
    const low = new Set(FAMOUS_LOW);
    const rest = CAL.slice(12);
    // i valori del database si aggiornano: un famoso puo' scendere un po' sotto i 18 milioni
    const notFamous = rest.filter((p) => p.value < 12 && !low.has(p.name)).map((p) => `${p.name} (${p.value})`);
    assert.deepEqual(notFamous, [], 'poco famosi nel calendario');
    const big = rest.filter((p) => p.value >= 18 || low.has(p.name)).length;
    assert.ok(big / rest.length >= 0.9, `solo ${big} su ${rest.length} da 18 milioni o famosissimi`);
    for (const n of ['Cristiano Ronaldo', 'Lionel Messi', 'Luka Modrić', 'Kevin De Bruyne', 'Paulo Dybala']) {
        assert.ok(dailyCalendar.includes(n), `${n} manca dal calendario`);
    }
});

test('campionati bilanciati: Serie A ben rappresentata, non troppa Premier, sparsi nel tempo', () => {
    const share = (list, lg) => list.filter((p) => p.league === lg).length / list.length;
    const rest = CAL.slice(12);
    assert.ok(share(rest, 'Serie A') >= 0.18, `Serie A al ${Math.round(share(rest, 'Serie A') * 100)}%`);
    assert.ok(share(rest, 'Premier League') <= 0.28, `Premier al ${Math.round(share(rest, 'Premier League') * 100)}%`);
    // anche a blocchi di due mesi: niente periodi tutti Premier
    for (let i = 12; i + 60 <= CAL.length; i += 60) {
        const b = CAL.slice(i, i + 60);
        assert.ok(share(b, 'Serie A') >= 0.12, `poca Serie A nei N° ${i + 1}-${i + 60}`);
        assert.ok(share(b, 'Premier League') <= 0.35, `troppa Premier nei N° ${i + 1}-${i + 60}`);
    }
    // mai la stessa squadra due giorni di fila
    for (let i = 13; i < CAL.length; i++) {
        assert.notEqual(CAL[i].team, CAL[i - 1].team, `N° ${i} e ${i + 1}: stessa squadra (${CAL[i].team})`);
    }
});

test('la funzione del giorno: N° 1 il 16 novembre 2026, deterministica, segue il calendario', () => {
    assert.equal(Core.dayIndex('2026-11-16'), 0);
    assert.equal(Core.daily(CAL, '2026-11-16').n, 1);
    assert.equal(Core.daily(CAL, '2026-11-17').n, 2);
    assert.equal(Core.daily(CAL, '2026-11-10').n, 1, 'prima del via vale il N° 1');
    assert.equal(Core.daily(CAL, '2027-11-16').n, 366);
    assert.equal(Core.daily(CAL, '2027-11-16').player.name, dailyCalendar[365]);
    // la data di Roma: alle 23:30 UTC del 17 novembre a Roma e' gia' il 18
    assert.equal(Core.romeDate(new Date('2026-11-17T23:30:00Z')), '2026-11-18');
    assert.equal(Core.romeDate(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
    assert.equal(Core.romeDate(new Date('2026-07-01T22:01:00Z')), '2026-07-02');
});

test('nessuna ripetizione per tutto il calendario; finito, si ricomincia dall\'inizio', () => {
    const seen = new Set();
    for (let n = 1; n <= CAL.length; n++) {
        const t = Core.daily(CAL, Core.dateOf(n));
        assert.equal(t.n, n);
        assert.ok(!seen.has(t.player.name), `${t.player.name} ripetuto al N° ${n}`);
        seen.add(t.player.name);
    }
    assert.equal(Core.nth(CAL, CAL.length + 1).name, 'João Félix');
    assert.equal(Core.nth(CAL, CAL.length + 2).name, 'Myles Lewis-Skelly');
    assert.equal(Core.daily(CAL, Core.dateOf(CAL.length + 3)).player.name, 'Alejandro Garnacho');
});

test('un nome sparito dal database non sposta gli altri giorni', () => {
    const a = { name: 'A' }, c = { name: 'C' };
    assert.equal(Core.nth([a, null, c], 1), a);
    assert.equal(Core.nth([a, null, c], 2), c);
    assert.equal(Core.nth([a, null, c], 3), c);
    assert.equal(Core.nth([null, null, c], 4), c);
});

test('archivio: nth() e dateOf() coincidono con il calciatore di quel giorno', () => {
    assert.equal(Core.dateOf(1), '2026-11-16');
    assert.equal(Core.dateOf(46), '2026-12-31');
    assert.equal(Core.dateOf(47), '2027-01-01');
    for (const n of [1, 2, 12, 13, 30, 365, CAL.length, CAL.length + 3]) {
        assert.equal(Core.nth(CAL, n).name, Core.daily(CAL, Core.dateOf(n)).player.name, `N° ${n}`);
    }
});

test('confronto delle caselle', () => {
    const s = find('Nicolò Barella');
    const same = Core.compare(s, s, 2026);
    assert.ok(same.every((c) => c.state === 'hit' && c.arrow === null));
    const g = find('Lautaro Martínez'); // Inter, Argentina, ATT
    assert.equal(g.team, s.team, 'il test presuppone Lautaro e Barella nella stessa squadra');
    const c = Object.fromEntries(Core.compare(g, s, 2026).map((x) => [x.key, x]));
    assert.equal(c.team.state, 'hit');
    assert.equal(c.league.state, 'hit');
    assert.equal(c.nation.state, 'miss');
    assert.equal(c.role.state, 'miss');
    assert.equal(c.age.state, 'hit'); // entrambi del 1997
    assert.equal(c.value.arrow, g.value > s.value ? 'down' : 'up');
    const fr = find('Kylian Mbappé');
    const it = find('Moise Kean');
    assert.equal(Core.compare(fr, it, 2026)[0].state, 'near'); // Francia/Italia: stesso continente
});

test('ricerca per cognome e senza accenti, testo da condividere', () => {
    assert.equal(Core.search(playersDatabase, 'mbappe')[0].name, 'Kylian Mbappé');
    assert.equal(Core.search(playersDatabase, 'odegaard')[0].name, 'Martin Ødegaard');
    assert.ok(Core.search(playersDatabase, 'de bruyne').some((p) => p.name === 'Kevin De Bruyne'));
    assert.equal(Core.hint({ name: 'Kevin De Bruyne' }).letter, 'D');
    assert.equal(Core.hint({ name: 'Pedri' }).mono, true);
    const txt = Core.shareText(4, [['miss', 'near', 'miss', 'hit', 'miss', 'miss'], ['hit', 'hit', 'hit', 'hit', 'hit', 'hit']], true, false);
    assert.match(txt, /^Calciatore del Giorno N° 4 — 2\/6\n\n⬛🟨⬛🟩⬛⬛\n🟩🟩🟩🟩🟩🟩$/);
});

test('testo da condividere: archivio, bandiera bianca, serie, indizi', () => {
    const r = [['miss', 'near', 'miss', 'hit', 'miss', 'miss']];
    assert.equal(Core.shareText(9, r, false, false, { gaveUp: true }), 'Calciatore del Giorno N° 9 — X/6\n\n⬛🟨⬛🟩⬛⬛\n🏳️ bandiera bianca');
    assert.equal(Core.shareText(9, [], false, false, { gaveUp: true }), 'Calciatore del Giorno N° 9 — X/6\n\n🏳️ bandiera bianca');
    assert.match(Core.shareText(3, r, true, true, { archive: true }), /^Calciatore del Giorno N° 3 \(archivio\) — 1\/6 \(con indizio\)\n/);
    assert.match(Core.shareText(3, r, true, 1), /— 1\/6 \(con indizio\)\n/);
    assert.match(Core.shareText(3, r, false, 2), /— X\/6 \(con 2 indizi\)\n/);
    assert.doesNotMatch(Core.shareText(3, r, true, 0), /indizi/);
    assert.match(Core.shareText(3, r, true, false, { streak: 4 }), /\n🔥 serie di 4$/);
    assert.doesNotMatch(Core.shareText(3, r, true, false, { streak: 1 }), /serie/);
    assert.doesNotMatch(Core.shareText(3, r, false, false, { streak: 4 }), /serie/);
});

test('testo da condividere: in fondo il link col nome «Wordle del calcio», senza toccare le righe sopra', () => {
    const r = [['hit', 'hit', 'hit', 'hit', 'hit', 'hit']];
    const url = 'https://quizotti.altervista.org/quizzotti/GiocatoreDelGiorno.html';
    const base = Core.shareText(7, r, true, false, { streak: 3 });
    const withLink = Core.shareText(7, r, true, false, { streak: 3, link: url });
    assert.equal(withLink, base + '\n\nIl Wordle del calcio: ' + url);
    assert.doesNotMatch(base, /Wordle/, 'senza link il testo resta quello di prima');
});

test('indizio: cognome, nome unico, conosciuti per nome', () => {
    assert.deepEqual(Core.hint({ name: 'Nicolò Barella' }), { mono: false, letter: 'B' });
    assert.deepEqual(Core.hint({ name: 'Kim Min-jae' }), { mono: false, letter: 'K' });
    assert.deepEqual(Core.hint({ name: 'Marc-André ter Stegen' }), { mono: false, letter: 'T' });
    assert.deepEqual(Core.hint({ name: 'Vinícius Jr.' }), { mono: true, letter: 'V' });
    assert.deepEqual(Core.hint({ name: 'João Pedro' }), { mono: true, letter: 'J' });
    assert.deepEqual(Core.hint({ name: 'Alisson Becker' }), { mono: true, letter: 'A' });
    // ogni nome del calendario ha un indizio con una lettera vera
    for (const p of CAL) assert.match(Core.hint(p).letter, /^\p{Lu}$/u, p.name);
});

test('secondo indizio: la nazionale, o la squadra se la nazionale e\' gia\' nota, poi il valore', () => {
    const s = find('Lautaro Martínez');
    assert.equal(Core.hint2Kind(s, []), 'nation');
    assert.equal(Core.hint2Kind(s, [find('Kylian Mbappé')]), 'nation');
    const sameNation = playersDatabase.find((p) => p.nation === s.nation && p.team !== s.team);
    assert.equal(Core.hint2Kind(s, [find('Kylian Mbappé'), sameNation]), 'team');
    const sameTeam = playersDatabase.find((p) => p.team === s.team && p.name !== s.name && p.nation !== s.nation);
    assert.equal(Core.hint2Kind(s, [sameNation, sameTeam]), 'value');
    assert.deepEqual(Core.hint2(s, 'nation'), { label: 'Nazionale', text: 'Argentina' });
    assert.deepEqual(Core.hint2(s, 'team'), { label: 'Squadra', text: s.team });
    assert.deepEqual(Core.hint2(s, 'value'), { label: 'Valore', text: Core.fmtValue(s.value) });
});

test('eta\' sulla scheda: solo l\'anno di nascita, quindi "classe" e "circa"', () => {
    assert.equal(Core.ageText({ born: 1997 }, 2026), 'Classe 1997, circa 29 anni');
});

test('ricerca: esclusi i nomi gia\' provati, limite, niente risultati per query vuote', () => {
    assert.deepEqual(Core.search(playersDatabase, ''), []);
    assert.deepEqual(Core.search(playersDatabase, '  '), []);
    const all = Core.search(playersDatabase, 'mar', null, 50);
    assert.ok(all.length > 8);
    assert.equal(Core.search(playersDatabase, 'mar').length, 8);
    const ex = { 'Kylian Mbappé': true };
    assert.ok(!Core.search(playersDatabase, 'mbappe', ex).some((p) => p.name === 'Kylian Mbappé'));
    assert.equal(Core.search(playersDatabase, 'ODEGAARD')[0].name, 'Martin Ødegaard');
    assert.equal(Core.search(playersDatabase, 'calhanoglu')[0].name, 'Hakan Çalhanoğlu');
});

test('conto alla rovescia: giorni da 23 e 25 ore', () => {
    // 28 marzo 2027, 00:00 a Roma = 27 marzo 23:00 UTC; il giorno dura 23 ore
    assert.equal(Core.msToNext(new Date('2027-03-27T23:00:00Z')), 23 * 3600000);
    // 31 ottobre 2027 dura 25 ore (00:00 Roma = 30 ottobre 22:00 UTC)
    assert.equal(Core.msToNext(new Date('2027-10-30T22:00:00Z')), 25 * 3600000);
    assert.equal(Core.msToNext(new Date('2026-11-16T22:59:59Z')), 1000);
});
