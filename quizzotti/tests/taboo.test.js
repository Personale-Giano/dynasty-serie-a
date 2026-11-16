/* Taboo: le carte devono essere giocabili (vietate sensate, niente doppioni,
   ogni categoria finisce in un argomento selezionabile) e la logica pura del
   gioco (punti, classifica, impostazioni, partita salvata) deve reggere i casi
   limite: valori vecchi in memoria, pareggi, salvataggi rotti o scaduti. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { tabooWords } = require(path.join('..', 'assets', 'db-taboo.js'));
const G = require(path.join('..', 'assets', 'games', 'taboo.js'));

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

test('ogni carta ha esattamente 5 vietate, tutte diverse e diverse dalla parola', () => {
    for (const w of tabooWords) {
        assert.equal(w.taboo.length, 5, `"${w.word}" ha ${w.taboo.length} vietate`);
        const t = w.taboo.map(norm);
        assert.equal(new Set(t).size, 5, `"${w.word}" ha vietate ripetute`);
        assert.ok(!t.includes(norm(w.word)), `"${w.word}" vieta se stessa`);
        for (const x of w.taboo) assert.ok(x.trim() === x && x.length > 0, `"${w.word}": vietata vuota o con spazi`);
    }
});

test('nessuna parola compare due volte, nemmeno con accenti o maiuscole diverse', () => {
    const seen = new Map();
    for (const w of tabooWords) {
        const k = norm(w.word);
        assert.ok(!seen.has(k), `"${w.word}" doppione di "${seen.get(k)}"`);
        seen.set(k, w.word);
    }
});

test('ogni argomento del menu ha abbastanza carte per un turno intero', () => {
    const count = {};
    for (const w of tabooWords) count[G.groupOf(w.categoria)] = (count[G.groupOf(w.categoria)] || 0) + 1;
    for (const g of G.GROUPS) assert.ok(count[g.id] >= 100, `${g.label}: solo ${count[g.id] || 0} carte`);
});

test('le categorie legate a una squadra o a un campionato non tornano (invecchiano col mercato)', () => {
    for (const w of tabooWords) {
        assert.ok(!/^Calciatori (Fiorentina|Genoa|Lecce|Monza|Parma|Torino|Udinese|Venezia|Verona|Bologna|della )/.test(w.categoria), `${w.word}: ${w.categoria}`);
        assert.notEqual(w.categoria, 'Squadre di Serie A', w.word);
    }
});

test('il record dei gol ai Mondiali e\' aggiornato al 2026 (Mbappe\' a 22)', () => {
    const r = tabooWords.find((w) => w.word === 'Record gol Mondiali');
    assert.ok(r && r.taboo[0] === 'Kylian Mbappé' && r.taboo.includes('22 gol'));
});

test('punti: +1 indovinata, -penalita\' vietata, 0 passo', () => {
    assert.equal(G.points('ok', 1), 1);
    assert.equal(G.points('bad', 1), -1);
    assert.equal(G.points('bad', 0), 0);
    assert.equal(G.points('skip', 1), 0);
});

test('classifica: punti, poi indovinate, poi meno vietate; il pareggio si riconosce', () => {
    const teams = [
        { name: 'A', score: 5, ok: 6, bad: 1 },
        { name: 'B', score: 5, ok: 6, bad: 0 },
        { name: 'C', score: 7, ok: 7, bad: 0 },
        { name: 'D', score: 5, ok: 7, bad: 2 }
    ];
    assert.deepEqual(G.rank(teams).map((t) => t.name), ['C', 'D', 'B', 'A']);
    assert.equal(G.isTie(G.rank(teams)), false);
    assert.equal(G.isTie(G.rank(teams.slice(0, 2))), true);
    assert.equal(teams[0].name, 'A', 'rank non deve riordinare l\'array originale');
});

test('testo da condividere: vincitore e classifica riga per riga', () => {
    const txt = G.shareText(G.rank([{ name: 'Rossi', score: 1, ok: 1, bad: 0 }, { name: 'Blu', score: 9, ok: 9, bad: 0 }]));
    assert.match(txt, /vince Blu con 9 punti/);
    assert.match(txt, /1\. Blu 9\n2\. Rossi 1/);
    const tie = G.shareText(G.rank([{ name: 'X', score: 1, ok: 1, bad: 0 }, { name: 'Y', score: 1, ok: 1, bad: 0 }]));
    assert.match(tie, /pareggio in vetta a 1 punto\./);
});

test('impostazioni salvate: i valori fuori lista tornano ai default, gli argomenti sconosciuti spariscono', () => {
    assert.deepEqual(G.sanitizeOpts(null), { time: 60, rounds: 3, pen: 1, skips: -1, groups: null });
    const o = G.sanitizeOpts({ time: 75, rounds: 5, pen: '1', skips: 0, groups: ['coppe', 'boh', 'stadi'] });
    assert.equal(o.time, 60);
    assert.equal(o.rounds, 5);
    assert.equal(o.pen, 1);
    assert.equal(o.skips, 0);
    assert.deepEqual(o.groups, ['coppe', 'stadi']);
    assert.equal(G.sanitizeOpts({ time: 120 }).time, 120);
});

test('parole lunghe: la carta rimpicciolisce il carattere', () => {
    assert.equal(G.wordFit('Gol'), '');
    assert.equal(G.wordFit('Verticalizzazione'), 'xlong');
    assert.equal(G.wordFit('Trent Alexander-Arnold'), 'xlong');
    assert.equal(G.wordFit('Calcio di punizione'), '');
    assert.equal(G.wordFit('Il presidente del Borgorosso Football Club'), 'xlong');
    assert.equal(G.wordFit('Champions League femminile'), 'long');
});

test('partita salvata: si riprende solo se integra e recente', () => {
    const now = 1_800_000_000_000;
    const S = {
        round: 2, turn: 1, rounds: 3, time: 60, pen: 1, skips: -1, groups: ['giocatori'],
        teams: [
            { name: 'Rossi', color: '#d9342b', score: 4, ok: 5, bad: 1, skip: 2, best: 5, extra: 'no' },
            { name: 'Blu', color: '#2f6fe0', score: 3, ok: 3, bad: 0, skip: 1, best: 3 }
        ]
    };
    const snap = G.snapshot(S, now);
    assert.equal(snap.teams[0].extra, undefined, 'nel salvataggio solo i campi che servono');
    assert.ok(G.validSave(snap, now + 1000));
    assert.ok(G.validSave(JSON.parse(JSON.stringify(snap)), now), 'deve sopravvivere a JSON');
    assert.ok(!G.validSave(snap, now + 13 * 3600 * 1000), 'scaduto dopo 12 ore');
    assert.ok(!G.validSave(null, now));
    assert.ok(!G.validSave({ ...snap, v: 2 }, now));
    assert.ok(!G.validSave({ ...snap, turn: 2 }, now), 'turno fuori squadre');
    assert.ok(!G.validSave({ ...snap, round: 4 }, now), 'giro oltre il totale');
    assert.ok(!G.validSave({ ...snap, time: 75 }, now));
    assert.ok(!G.validSave({ ...snap, groups: [] }, now));
    assert.ok(!G.validSave({ ...snap, teams: [snap.teams[0]] }, now), 'una squadra sola');
    assert.ok(!G.validSave({ ...snap, teams: [snap.teams[0], { ...snap.teams[1], score: 'x' }] }, now));
});
