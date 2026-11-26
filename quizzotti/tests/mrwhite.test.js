/* Mr. White: il database deve essere giocabile (niente doppioni nemmeno con
   accenti diversi, coppie dell'Infiltrato fatte di nomi veri della lista,
   alias che puntano a calciatori esistenti) e la logica pura deve reggere
   i casi limite: ultimo tiro tollerante ma non troppo, cognomi condivisi,
   esiti con l'Infiltrato, punti, impostazioni vecchie, salvataggi rotti. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { wordsList, mrwhiteData } = require(path.join('..', 'assets', 'db-mrwhite.js'));
const G = require(path.join('..', 'assets', 'games', 'mrwhite.js'));

const key = (s) => G.norm(s).replace(/ /g, '');
const IDX = G.buildIndex(wordsList, mrwhiteData.alias);
const guess = (g, w) => G.checkGuess(g, w, mrwhiteData.alias, IDX);

test('almeno 650 calciatori, nessun doppione nemmeno con accenti o trattini diversi', () => {
    assert.ok(wordsList.length >= 650, `solo ${wordsList.length}`);
    const seen = new Map();
    for (const w of wordsList) {
        assert.equal(w, w.trim(), `spazi in "${w}"`);
        const k = key(w);
        assert.ok(k.length >= 3, `"${w}" troppo corto`);
        assert.ok(!seen.has(k), `"${w}" doppione di "${seen.get(k)}"`);
        seen.set(k, w);
    }
});

test('italiani e stranieri non si sovrappongono e insieme fanno la lista intera', () => {
    const ita = new Set(mrwhiteData.italiani);
    assert.ok(mrwhiteData.italiani.length >= 150 && mrwhiteData.stranieri.length >= 450);
    for (const w of mrwhiteData.stranieri) assert.ok(!ita.has(w), `"${w}" in tutte e due`);
    assert.equal(mrwhiteData.italiani.length + mrwhiteData.stranieri.length, wordsList.length);
    for (const w of ['Fabio Quagliarella', 'Thiago Motta', 'Jorginho']) assert.ok(ita.has(w), w);
});

test('coppie dell\'Infiltrato: due nomi diversi della lista, ognuno in una coppia sola', () => {
    const all = new Set(wordsList);
    const used = new Map();
    assert.ok(mrwhiteData.coppie.length >= 80);
    mrwhiteData.coppie.forEach((p, i) => {
        assert.equal(p.length, 2);
        assert.notEqual(p[0], p[1]);
        for (const w of p) {
            assert.ok(all.has(w), `coppia ${i}: "${w}" non e' nella lista`);
            assert.ok(!used.has(w), `"${w}" in due coppie (${used.get(w)} e ${i})`);
            used.set(w, i);
        }
    });
    const ita = new Set(mrwhiteData.italiani);
    assert.ok(mrwhiteData.coppie.filter((p) => p.every((w) => ita.has(w))).length >= 20, 'poche coppie tutte italiane');
});

test('alias e nomi di maglia puntano a calciatori della lista', () => {
    for (const w of Object.keys(mrwhiteData.alias)) assert.ok(wordsList.includes(w), `alias per "${w}" che non c'e'`);
    for (const w of Object.keys(mrwhiteData.maglia)) assert.ok(wordsList.includes(w), `maglia per "${w}" che non c'e'`);
});

test('ultimo tiro: nome intero, cognome, refusi piccoli e accenti valgono', () => {
    assert.equal(guess('Alessandro Del Piero', 'Alessandro Del Piero'), 'yes');
    assert.equal(guess('del piero', 'Alessandro Del Piero'), 'yes');
    assert.equal(guess('Totti', 'Francesco Totti'), 'yes');
    assert.equal(guess('Ibrahimovic', 'Zlatan Ibrahimović'), 'yes');
    assert.equal(guess('Ibrahimovich', 'Zlatan Ibrahimović'), 'yes');
    assert.equal(guess('ter stegen', 'Marc-André ter Stegen'), 'yes');
    assert.equal(guess('Odegaard', 'Martin Ødegaard'), 'yes');
    assert.equal(guess('Yildiz', 'Kenan Yıldız'), 'yes');
    assert.equal(guess('Hassler', 'Thomas Hässler'), 'yes');
    assert.equal(guess('Kaka', 'Kaká'), 'yes');
});

test('ultimo tiro: alias e soprannomi valgono', () => {
    assert.equal(guess('Ronaldo il Fenomeno', 'Ronaldo Nazário'), 'yes');
    assert.equal(guess('il fenomeno', 'Ronaldo Nazário'), 'yes');
    assert.equal(guess('Cruyff', 'Johan Cruyff'), 'yes');
    assert.equal(guess('Cruijff', 'Johan Cruyff'), 'yes');
    assert.equal(guess('Vinicius', 'Vinícius Júnior'), 'yes');
    assert.equal(guess('Kvara', 'Khvicha Kvaratskhelia'), 'yes');
    assert.equal(guess('Chicharito', 'Javier Hernández'), 'yes');
});

test('ultimo tiro: un cognome condiviso non basta, serve il nome', () => {
    assert.equal(guess('Inzaghi', 'Filippo Inzaghi'), 'ambiguous');
    assert.equal(guess('Pippo Inzaghi', 'Filippo Inzaghi'), 'yes');
    assert.equal(guess('Simone Inzaghi', 'Filippo Inzaghi'), 'no');
    assert.equal(guess('Thuram', 'Marcus Thuram'), 'ambiguous');
    assert.equal(guess('Ronaldo', 'Cristiano Ronaldo'), 'ambiguous');
    assert.equal(guess('Ronaldo', 'Ronaldo Nazário'), 'ambiguous');
    assert.equal(guess('Rossi', 'Daniele De Rossi'), 'ambiguous');
    assert.equal(guess('De Rossi', 'Daniele De Rossi'), 'yes');
});

test('ultimo tiro: risposte sbagliate o troppo corte non passano', () => {
    assert.equal(guess('', 'Francesco Totti'), 'no');
    assert.equal(guess('T', 'Francesco Totti'), 'no');
    assert.equal(guess('Francesco', 'Francesco Totti'), 'no');
    assert.equal(guess('Baggio', 'Francesco Totti'), 'no');
    assert.equal(guess('Pedri', 'Gavi'), 'no');
    assert.equal(guess('Rodri', 'Pedri'), 'no');      // nomi corti: nessun refuso concesso
    assert.equal(guess('Ronaldinho', 'Ronaldo Nazário'), 'no');
    assert.equal(guess('Pepe', 'Pepe Reina'), 'no');
});

test('ogni calciatore si puo\' indovinare scrivendo il nome cosi\' come appare', () => {
    for (const w of wordsList) assert.equal(guess(w, w), 'yes', w);
});

test('aiutino: l\'iniziale del nome sulla maglia, particelle comprese', () => {
    assert.equal(G.hintLetter('Kevin De Bruyne', mrwhiteData.maglia), 'D');
    assert.equal(G.hintLetter('Edwin van der Sar', mrwhiteData.maglia), 'V');
    assert.equal(G.hintLetter('Juan Sebastián Verón', mrwhiteData.maglia), 'V');
    assert.equal(G.hintLetter('Ronaldo Nazário', mrwhiteData.maglia), 'R');
    assert.equal(G.hintLetter('Kim Min-jae', mrwhiteData.maglia), 'K');
    assert.equal(G.hintLetter('Pelé', mrwhiteData.maglia), 'P');
    // nome e cognome insieme sulla schiena (o solo il nome): l'iniziale e' quella del nome
    assert.equal(G.hintLetter('Luis Alberto', mrwhiteData.maglia), 'L');
    assert.equal(G.hintLetter('Roberto Carlos', mrwhiteData.maglia), 'R');
    assert.equal(G.hintLetter('Bernardo Silva', mrwhiteData.maglia), 'B');
    assert.equal(guess('Bernardo', 'Bernardo Silva'), 'yes');
    for (const w of wordsList) assert.match(G.hintLetter(w, mrwhiteData.maglia), /^\p{Lu}$/u, w);
});

test('impostori: sempre meno della meta\', Infiltrato da 5 giocatori', () => {
    assert.equal(G.maxBad(3), 1);
    assert.equal(G.maxBad(4), 1);
    assert.equal(G.maxBad(5), 2);
    assert.equal(G.maxBad(12), 5);
    assert.equal(G.canInf(4), false);
    assert.equal(G.canInf(5), true);
    assert.equal(G.maxMW(5, true), 1);
    assert.equal(G.maxMW(4, true), 1);  // a 4 l'Infiltrato non c'e': resta un Mr. White
    assert.equal(G.maxMW(9, true), 3);
});

test('esito: civili, impostori o si continua (con e senza Infiltrato)', () => {
    assert.equal(G.outcome(['civ', 'civ', 'mw'], [true, true, false]), 'civ');
    assert.equal(G.outcome(['civ', 'civ', 'mw'], [true, false, true]), 'bad');
    assert.equal(G.outcome(['civ', 'civ', 'civ', 'mw'], [true, true, false, true]), null);
    assert.equal(G.outcome(['civ', 'civ', 'civ', 'mw', 'inf'], [true, true, true, false, true]), null);
    assert.equal(G.outcome(['civ', 'civ', 'civ', 'mw', 'inf'], [true, true, false, true, true]), 'bad');
    assert.equal(G.outcome(['civ', 'civ', 'civ', 'mw', 'inf'], [true, true, true, false, false]), 'civ');
});

test('punti di fine round', () => {
    const roles = ['civ', 'civ', 'civ', 'mw', 'inf'];
    assert.deepEqual(G.settle(roles, [true, true, false, false, false], 'civ', 'caught'), [100, 100, 100, 0, 0]);
    assert.deepEqual(G.settle(roles, [true, true, false, true, true], 'bad', 'survive'), [0, 0, 0, 200, 200]);
    assert.deepEqual(G.settle(roles, [true, true, false, true, false], 'bad', 'survive'), [0, 0, 0, 200, 0]);
    assert.deepEqual(G.settle(roles, [true, true, true, false, true], 'bad', 'guess', 3), [0, 0, 0, 0, 100]);
});

test('ordine di parola: Mr. White non comincia mai, poi si segue il giro', () => {
    const roles = ['mw', 'civ', 'civ', 'inf'];
    for (let k = 0; k < 50; k++) {
        const o = G.speakOrder([0, 1, 2, 3], roles, (a) => a[Math.floor(Math.random() * a.length)]);
        assert.notEqual(roles[o[0]], 'mw');
        assert.deepEqual([...o].sort(), [0, 1, 2, 3]);
        const s = o[0];
        assert.deepEqual(o, [0, 1, 2, 3].slice(s).concat([0, 1, 2, 3].slice(0, s)));
    }
});

test('nomi doppi resi unici', () => {
    assert.deepEqual(G.uniqueNames(['Luca', 'luca', 'Marco', 'Luca']), ['Luca', 'luca 2', 'Marco', 'Luca 3']);
});

test('impostazioni vecchie o rotte tornano ai valori ammessi', () => {
    assert.deepEqual(G.sanitizeCfg(null), G.DEFAULTS);
    assert.deepEqual(G.sanitizeCfg({ timer: 45, rounds: 'x', mw: 99, hint: 1, pool: 'serie b' }), G.DEFAULTS);
    const old = G.sanitizeCfg({ timer: 0, rounds: 0, hint: true, mw: 2 }); // impostazioni della versione prima
    assert.equal(old.timer, 0); assert.equal(old.rounds, 0); assert.equal(old.hint, true); assert.equal(old.mw, 2);
    assert.equal(old.inf, false); assert.equal(old.pool, 'tutti');
});

test('salvataggio: valido a meta\' partita, scartato se rotto, scaduto o finito', () => {
    const now = 1e12;
    const game = {
        cfg: G.sanitizeCfg({ rounds: 5 }), round: 2, done: 2,
        stats: { caught: 1, guessed: 0, civOut: 1, infOut: 0 },
        players: ['A', 'B', 'C', 'D'].map((n) => ({ name: n, color: '#000', score: 100, mwTimes: 1, mwWins: 0 }))
    };
    const s = G.snapshot(game, now);
    assert.ok(G.validSave(s, now + 1000));
    assert.ok(!G.validSave(s, now + 13 * 3600 * 1000), 'scaduto');
    assert.ok(!G.validSave(Object.assign({}, s, { done: 5, round: 5 }), now), 'partita finita');
    assert.ok(!G.validSave(Object.assign({}, s, { players: s.players.slice(0, 2) }), now), 'due giocatori');
    assert.ok(!G.validSave(Object.assign({}, s, { cfg: Object.assign({}, s.cfg, { timer: 7 }) }), now), 'tempo non ammesso');
    assert.ok(!G.validSave(Object.assign({}, s, { round: 3 }), now), 'round a meta\'');
    assert.ok(!G.validSave(null, now));
    assert.ok(!G.validSave(JSON.parse(JSON.stringify(Object.assign({}, s, { players: [{ name: '' }] }))), now));
    const endless = G.snapshot(Object.assign({}, game, { cfg: G.sanitizeCfg({ rounds: 0 }), round: 9, done: 9 }), now);
    assert.ok(G.validSave(endless, now), 'senza fine si riprende sempre');
});

test('classifica e testo da condividere', () => {
    const ps = [{ name: 'Ada', score: 100 }, { name: 'Bea', score: 300 }, { name: 'Cris', score: 300 }];
    const r = G.rank(ps);
    assert.deepEqual(r.map((p) => p.name), ['Bea', 'Cris', 'Ada']);
    const t = G.shareText(r, 3);
    assert.match(t, /pari in vetta tra Bea e Cris con 300 punti/);
    assert.match(t, /\n3\. Ada 100\n/);
    assert.match(G.shareText([{ name: 'Ada', score: 1 }], 1), /1 round: vince Ada con 1 punto\./);
});

test('Mr. White gira: nessuno lo rifa\' prima che l\'abbiano fatto tutti', () => {
    for (const [n, k] of [[3, 1], [4, 1], [5, 2], [7, 1], [9, 3]]) {
        const times = new Array(n).fill(0);
        for (let round = 1; round <= n * 3; round++) {
            const bad = G.pickBad(times, k, Math.random);
            assert.equal(new Set(bad).size, k);
            bad.forEach((i) => times[i]++);
            // in ogni momento le volte di ciascuno differiscono al massimo di uno
            assert.ok(Math.max(...times) - Math.min(...times) <= 1, `${n} giocatori, round ${round}: ${times}`);
        }
    }
    // l'Infiltrato si sceglie fuori dai Mr. White, sempre tra chi lo e' stato meno
    assert.deepEqual(G.pickBad([0, 1, 0, 0], 1, () => 0.5, [0, 2]), [3]);
    // salvataggi vecchi senza conteggio: valgono zero
    assert.equal(G.pickBad([undefined, 2, 1], 1, Math.random)[0], 0);
});

test('con «Tutti» italiani e stranieri escono a testa o croce', () => {
    const ita = new Set(mrwhiteData.italiani);
    let nIta = 0;
    const N = 4000;
    for (let k = 0; k < N; k++) {
        const f = G.poolFilter('tutti', ita, Math.random);
        const pool = wordsList.filter(f.word);
        assert.ok(pool.length > 100);
        const w = pool[Math.floor(Math.random() * pool.length)];
        if (ita.has(w)) nIta++;
    }
    assert.ok(nIta / N > 0.45 && nIta / N < 0.55, `italiani ${nIta} su ${N}`);
    const it = G.poolFilter('italiani', ita, () => 0.9);
    assert.ok(wordsList.filter(it.word).every((w) => ita.has(w)));
    const st = G.poolFilter('stranieri', ita, () => 0.1);
    assert.ok(wordsList.filter(st.word).every((w) => !ita.has(w)));
    // coppie dell'Infiltrato: ce ne sono da tutti e due i lati
    assert.ok(mrwhiteData.coppie.filter(G.poolFilter('tutti', ita, () => 0.1).pair).length >= 20);
    assert.ok(mrwhiteData.coppie.filter(G.poolFilter('tutti', ita, () => 0.9).pair).length >= 20);
});

test('salvataggio a meta\' round: schermi, discussione ed esito si riprendono', () => {
    const now = 1e12;
    const game = {
        cfg: G.sanitizeCfg({ rounds: 5, inf: true }), round: 3, done: 2,
        stats: { caught: 1, guessed: 0, civOut: 1, infOut: 0 },
        players: ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: n, color: '#000', score: 100, mwTimes: 1, mwWins: 0, infTimes: 0 }))
    };
    const R = {
        word: 'Francesco Totti', infWord: 'Alessandro Del Piero', role: ['civ', 'mw', 'civ', 'inf', 'civ'],
        alive: [true, true, true, true, true], order: [2, 3, 4, 0, 1], pos: 2, turn: 0, delta: [0, 0, 0, 0, 0], stage: 'reveal', end: null
    };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const s = clone(G.snapshot(game, now, R));
    assert.ok(G.validSave(s, now), 'giro degli schermi');
    assert.equal(s.cur.word, 'Francesco Totti');
    assert.deepEqual(s.cur.role, R.role);
    const talk = clone(G.snapshot(game, now, Object.assign({}, R, { pos: 5, turn: 2, stage: 'talk', delta: [0, -50, 0, 0, 0] })));
    assert.ok(G.validSave(talk, now), 'discussione');
    const end = clone(G.snapshot(game, now, Object.assign({}, R, { pos: 5, turn: 1, stage: 'end', alive: [true, false, true, true, true], end: { winner: 'bad', how: 'guess', guesser: 1 } })));
    assert.ok(G.validSave(end, now), 'esito deciso');
    // primo round a meta': nessun round finito ancora
    assert.ok(G.validSave(clone(G.snapshot(Object.assign({}, game, { round: 1, done: 0 }), now, R)), now));
    const bad = (patch, why) => assert.ok(!G.validSave(Object.assign(clone(s), { cur: Object.assign(clone(s.cur), patch) }), now), why);
    bad({ stage: 'boh' }, 'fase sconosciuta');
    bad({ role: ['civ', 'civ', 'civ', 'civ', 'civ'] }, 'nessun Mr. White');
    bad({ order: [0, 0, 1, 2, 3] }, 'ordine rotto');
    bad({ pos: 5 }, 'giro degli schermi gia\' finito');
    bad({ alive: [1, 1, 1, 1, 1] }, 'vivi non booleani');
    bad({ infWord: null }, 'infiltrato senza calciatore');
    bad({ stage: 'talk', pos: 5, turn: 1, alive: [true, false, true, false, true] }, 'discussione con il round gia\' chiuso');
    bad({ stage: 'end', pos: 5, end: { winner: 'bad', how: 'guess' } }, 'ultimo tiro senza chi ha tirato');
    assert.ok(!G.validSave(Object.assign(clone(s), { round: 2 }), now), 'round non coerente con quelli finiti');
    // i salvataggi vecchi (senza round in corso e senza Infiltrato contato) restano buoni
    const old = clone(G.snapshot(Object.assign({}, game, { round: 2 }), now));
    old.players.forEach((p) => delete p.infTimes);
    assert.ok(G.validSave(old, now));
});
