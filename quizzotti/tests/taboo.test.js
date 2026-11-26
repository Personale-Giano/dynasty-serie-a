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
    assert.ok(r && r.taboo[0] === 'Kylian Mbappé' && r.taboo.includes('22 reti'));
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
    assert.deepEqual(G.sanitizeOpts(null), { v: 2, time: 60, rounds: 3, pen: 1, skips: 3, level: 2, hold: 'arbitro', groups: null });
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

/* ---------- contenuti ---------- */
const STOP = new Set(['di', 'del', 'della', 'dei', 'de', 'la', 'il', 'lo', 'le', 'gli', 'e', 'a', 'da', 'in', 'per', 'con', 'fc', 'cf', 'ac', 'sc', 'al', 'von', 'van', 'der', 'el', 'do', 'dos', 'las', 'los', 'san', 'the', 'of', 'y', 'du', 'des', 'st']);
const toks = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !STOP.has(x));
// parenti con la stessa radice ma che sono un'altra cosa (la citta' della squadra, un nome diverso)
const RELATIVES_OK = new Set(['Franck Ribéry|Francia', 'Arsène Wenger|Arsenal', 'Reggiana Calcio|Reggio Emilia', 'Triestina|Trieste',
    'Pressione sul portatore|pressing', 'Coppa Italia 2025|Italiano', 'Centrocampo|centrale',
    'Fantallenatore|fantacalcio', 'Fantamilioni|fantacalcio']);

test('nessuna vietata ripete un pezzo della parola (sarebbe una vietata sprecata)', () => {
    for (const w of tabooWords) {
        const wt = toks(w.word);
        for (const x of w.taboo) {
            const xt = toks(x);
            const same = wt.filter((a) => xt.includes(a));
            assert.deepEqual(same, [], `"${w.word}": la vietata "${x}" contiene ${same.join(', ')}`);
            if (RELATIVES_OK.has(w.word + '|' + x)) continue;
            // stessa radice (fischietto/fischio, sintetica/sintetico): la vieta gia' la regola dei "parenti stretti"
            const kin = wt.filter((a) => a.length >= 5 && xt.some((b) => b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)));
            assert.deepEqual(kin, [], `"${w.word}": la vietata "${x}" e' un parente stretto della parola`);
        }
    }
});

test('Italia e Juventus non sono vietate di comodo su ogni carta', () => {
    const count = (v) => tabooWords.filter((w) => w.taboo.includes(v)).length;
    assert.ok(count('Italia') <= 60, `Italia vietata su ${count('Italia')} carte`);
    assert.ok(count('Juventus') <= 160, `Juventus vietata su ${count('Juventus')} carte`);
    // dove l'Italia e' il cuore della carta resta
    for (const w of ['Azzurri', 'Mondiale Spagna 1982', 'Europeo 2020']) assert.ok(tabooWords.find((x) => x.word === w).taboo.includes('Italia'), w);
});

test('nessuna categoria piccola (2-4 voci): sono accorpate in categorie piu\' grandi', () => {
    const count = {};
    for (const w of tabooWords) count[w.categoria] = (count[w.categoria] || 0) + 1;
    for (const [c, n] of Object.entries(count)) assert.ok(n >= 5, `${c}: solo ${n} carte`);
});

test('categorie giuste: i "Migliori della Storia" sono davvero grandi, Gattuso non e\' piu\' il ct', () => {
    const cat = (w) => tabooWords.find((x) => x.word === w).categoria;
    assert.notEqual(cat('Obafemi Martins'), 'Migliori Giocatori della Storia');
    assert.notEqual(cat('Shunsuke Nakamura'), 'Migliori Giocatori della Storia');
    assert.equal(cat('Garrincha'), 'Migliori Giocatori della Storia');
    assert.ok(!tabooWords.find((x) => x.word === 'Gennaro Gattuso').taboo.some((t) => /ct dell/i.test(t)));
});

test('ogni carta ha un livello 1-3 e ogni argomento ha carte facili', () => {
    const easy = {};
    for (const w of tabooWords) {
        assert.ok([1, 2, 3].includes(w.diff), `"${w.word}": diff ${w.diff}`);
        if (w.diff === 1) easy[G.groupOf(w.categoria)] = (easy[G.groupOf(w.categoria)] || 0) + 1;
    }
    for (const g of G.GROUPS) assert.ok(easy[g.id] >= 15, `${g.label}: ${easy[g.id] || 0} carte facili`);
    const lv = [1, 2, 3].map((l) => tabooWords.filter((w) => G.fitsLevel(w, l)).length);
    assert.ok(lv[0] < lv[1] && lv[1] < lv[2] && lv[2] === tabooWords.length, lv.join(' < '));
    assert.equal(G.diffOf({}), 2, 'senza livello conta come normale');
});

/* ---------- regole ---------- */
test('impostazioni: di base 3 passi e -1 per la vietata; le scelte vecchie esplicite restano', () => {
    assert.equal(G.DEFAULTS.skips, 3);
    assert.equal(G.DEFAULTS.pen, 1);
    // prima della v2 "quanti vuoi" era il default: non si sa se e' stato scelto, quindi torna a 3
    assert.equal(G.sanitizeOpts({ time: 90, skips: -1, pen: 1 }).skips, 3);
    assert.equal(G.sanitizeOpts({ time: 90, skips: -1 }).time, 90);
    // diverso dal vecchio default: e' stato scelto di sicuro
    assert.equal(G.sanitizeOpts({ skips: 1 }).skips, 1);
    assert.equal(G.sanitizeOpts({ skips: 0 }).skips, 0);
    assert.equal(G.sanitizeOpts({ pen: 0 }).pen, 0);
    // dalla v2 anche "quanti vuoi" e' una scelta
    assert.equal(G.sanitizeOpts({ v: 2, skips: -1 }).skips, -1);
    assert.equal(G.sanitizeOpts({ v: 2, level: 7, hold: 'boh' }).level, 2);
    assert.equal(G.sanitizeOpts({ v: 2, hold: 'spiega' }).hold, 'spiega');
});

test('la carta in mano sul fischio finale non e\' una passata', () => {
    const t = { ok: 0, bad: 0, skip: 0, best: 0 };
    G.tallyLog(t, [{ res: 'ok' }, { res: 'skip' }, { res: 'bad' }, { res: 'ok' }, { res: 'skip', last: true }]);
    assert.deepEqual(t, { ok: 2, bad: 1, skip: 1, best: 2 });
    // se nel resoconto l'hanno convalidata, conta
    G.tallyLog(t, [{ res: 'ok', last: true }]);
    assert.deepEqual(t, { ok: 3, bad: 1, skip: 1, best: 2 });
});

test('spareggio: giocano solo le squadre in parita\' in vetta', () => {
    assert.deepEqual(G.tiedTop([{ score: 3 }, { score: 5 }, { score: 5 }, { score: 1 }]), [1, 2]);
    assert.deepEqual(G.tiedTop([{ score: 3 }, { score: 5 }]), [1]);
    assert.ok(G.TIEBREAK_TIME > 0 && G.TIEBREAK_TIME < 45, 'turno breve');
});

test('partita salvata: spareggio e impostazioni nuove sopravvivono, i salvataggi vecchi restano validi', () => {
    const now = 1_800_000_000_000;
    const teams = [
        { name: 'Rossi', color: '#d9342b', score: 4, ok: 5, bad: 1, skip: 2, best: 5 },
        { name: 'Blu', color: '#2f6fe0', score: 4, ok: 4, bad: 0, skip: 1, best: 3 },
        { name: 'Verdi', color: '#1f9d55', score: 2, ok: 2, bad: 0, skip: 1, best: 2 }
    ];
    const S = { round: 1, turn: 1, rounds: 1, giri: 3, time: 60, pen: 1, skips: 3, level: 1, hold: 'arbitro', order: [0, 1], tiebreak: 1, xpDone: true, groups: ['giocatori'], teams };
    const snap = G.snapshot(S, now);
    assert.ok(G.validSave(snap, now));
    assert.deepEqual([snap.order, snap.tiebreak, snap.giri, snap.level, snap.hold, snap.xpDone], [[0, 1], 1, 3, 1, 'arbitro', true]);
    assert.ok(!G.validSave({ ...snap, turn: 2 }, now), 'allo spareggio il turno sta dentro l\'ordine');
    assert.ok(!G.validSave({ ...snap, order: [0, 0] }, now), 'squadra ripetuta');
    assert.ok(!G.validSave({ ...snap, order: [0, 5] }, now), 'squadra che non c\'e\'');
    assert.ok(!G.validSave({ ...snap, level: 9 }, now));
    // il formato di prima (senza order, level, hold...) si riprende ancora
    const old = { v: 1, at: now, round: 2, turn: 2, rounds: 3, time: 60, pen: 1, skips: -1, groups: ['coppe'], teams };
    assert.ok(G.validSave(old, now));
});
