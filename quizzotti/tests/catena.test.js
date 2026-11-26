/* La Catena: integrità del database (assets/db-catena.js) e logica pura del
   gioco (assets/games/catena.js): confronto delle risposte scritte, valore
   delle parole, lettere regalate, frontiera della catena, partita salvata e
   bilancio tra le due squadre. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { chains } = require(path.join('..', 'assets', 'db-catena.js'));
const C = require(path.join('..', 'assets', 'games', 'catena.js'));
const norm = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');

/* ---------------- Database ---------------- */

test('db-catena.js: almeno 100 catene', () => {
    assert.ok(Array.isArray(chains));
    assert.ok(chains.length >= 100, `catene: ${chains.length}`);
});

test('db-catena.js: 8 parole e 7 spiegazioni non vuote per catena', () => {
    chains.forEach((c, i) => {
        assert.ok(Array.isArray(c.words) && c.words.length === 8, `catena ${i}: servono 8 parole`);
        assert.ok(Array.isArray(c.links) && c.links.length === 7, `catena ${i} (${c.words[0]}): servono 7 spiegazioni`);
        c.links.forEach((l, k) => assert.ok(typeof l === 'string' && l.trim().length >= 4, `catena ${c.words[0]}: spiegazione ${k} vuota`));
        assert.equal(new Set(c.links).size, 7, `catena ${c.words[0]}: spiegazioni ripetute`);
    });
});

test('db-catena.js: parole in maiuscolo, solo lettere/spazi/apostrofi, al massimo due parole', () => {
    chains.forEach((c) => c.words.forEach((w) => {
        assert.match(w, /^[A-ZÀÈÉÌÒÙ]+(?:['’ ][A-ZÀÈÉÌÒÙ]+)?$/, `parola non valida: "${w}"`);
        assert.ok(norm(w).length >= 2, `parola troppo corta: "${w}"`);
        assert.ok(w.length <= 14, `parola troppo lunga per le celle del telefono: "${w}"`);
    }));
});

test('db-catena.js: nessuna parola ripetuta nella stessa catena', () => {
    chains.forEach((c) => {
        const n = c.words.map(norm);
        assert.equal(new Set(n).size, 8, `catena ${c.words[0]}: parole ripetute`);
    });
});

test('db-catena.js: nessuna catena duplicata', () => {
    const keys = chains.map((c) => c.words.map(norm).join('-'));
    assert.equal(new Set(keys).size, keys.length, 'catene duplicate');
    const ends = chains.map((c) => norm(c.words[0]) + '>' + norm(c.words[7]));
    assert.equal(new Set(ends).size, ends.length, 'due catene con la stessa prima e ultima parola');
});

test('db-catena.js: lo stesso legame (coppia di parole vicine) non torna in due catene', () => {
    const seen = new Map();
    chains.forEach((c) => c.words.slice(0, 7).forEach((w, k) => {
        const p = [norm(w), norm(c.words[k + 1])].sort().join('~');
        assert.ok(!seen.has(p), `legame ${w}-${c.words[k + 1]} già in ${seen.get(p)}`);
        seen.set(p, c.words[0]);
    }));
});

test('db-catena.js: la spiegazione del legame cita almeno una delle due parole', () => {
    // il presentatore deve capire subito il legame: la spiegazione nomina una delle due parole
    // (basta la radice: "nuziale" per "nozze", "scuola" per "scuola guida")
    const root = (w) => C.norm(w).replace(/ /g, '').slice(0, 4);
    chains.forEach((c) => c.links.forEach((l, k) => {
        const t = C.norm(l).replace(/ /g, '');
        const a = root(c.words[k]), b = root(c.words[k + 1]);
        assert.ok(t.includes(a) || t.includes(b), `catena ${c.words[0]}, legame ${c.words[k]}-${c.words[k + 1]}: "${l}"`);
    }));
});

/* ---------------- Logica ---------------- */

test('risposte scritte: accenti, apostrofi, articoli e refusi piccoli', () => {
    assert.ok(C.matches('pallone', 'PALLONE'));
    assert.ok(C.matches('il pallone', 'PALLONE'));
    assert.ok(C.matches("l'oro", 'ORO'));
    assert.ok(C.matches('la  Pecora', 'PECORA'));
    assert.ok(C.matches('palone', 'PALLONE'));          // un refuso su 7 lettere
    assert.ok(C.matches('qualita', 'QUALITÀ'));
    assert.ok(C.matches('mezzasta', "MEZZ'ASTA"));
    assert.ok(C.matches('gamba tesa', 'GAMBA TESA'));
    assert.ok(C.matches('gambatesa', 'GAMBA TESA'));
    assert.ok(C.matches('cenerentla', 'CENERENTOLA'));  // parola lunga: due refusi ammessi
    assert.ok(!C.matches('ora', 'ORO'));                 // parole corte: nessun refuso
    assert.ok(!C.matches('', 'ORO'));
    assert.ok(!C.matches('la', 'LANA'));
    assert.ok(!C.matches('pallonetto', 'PALLONE'));
});

test('lettere iniziali: prima e ultima parola intere, le altre solo con l\'iniziale (spazi e apostrofi visibili)', () => {
    const words = ['CODINO', 'GAMBA TESA', "MEZZ'ASTA", 'ORO', 'NERO', 'PECORA', 'LANA', 'CAPRINA'];
    const s = C.initialShown(words);
    assert.ok(s[0].every(Boolean) && s[7].every(Boolean));
    assert.deepEqual(s[1], [true, false, false, false, false, true, false, false, false, false]);
    assert.deepEqual(s[2], [true, false, false, false, true, false, false, false, false]);
    assert.equal(C.valueOf(words[1], s[1]), 10);
});

test('valore della parola: 10, poi 2 in meno per ogni lettera regalata, mai sotto 2', () => {
    const w = 'PALLONE';
    const sh = C.initialShown(['X', w, 'Y'])[1];
    assert.equal(C.valueOf(w, sh), 10);
    const vals = [];
    while (C.revealNext(sh) >= 0) vals.push(C.valueOf(w, sh));
    assert.deepEqual(vals, [8, 6, 4, 2, 2]);
    // l'ultima lettera non si regala mai
    assert.equal(sh.filter((x) => !x).length, 1);
});

test('frontiera: prima nascosta dall\'alto, ultima dal basso, -1 a catena chiusa', () => {
    assert.deepEqual(C.frontier([true, false, false, false, false, false, false, true]), { top: 1, bottom: 6 });
    assert.deepEqual(C.frontier([true, true, true, false, false, true, true, true]), { top: 3, bottom: 4 });
    assert.deepEqual(C.frontier([true, true, true, true, false, true, true, true]), { top: 4, bottom: 4 });
    assert.deepEqual(C.frontier(new Array(8).fill(true)), { top: -1, bottom: -1 });
});

function goodSave(over) {
    const c = chains[0];
    return Object.assign({
        v: 1, ts: 1000, chain: C.chainKey(c), n: 5, idx: 2, state: 'play', turn: 1, starter: 0, dir: 'top',
        teams: [{ name: 'Casa', pts: 12 }, { name: 'Ospiti', pts: 8 }],
        solved: [true, true, false, false, false, false, false, true], gave: new Array(8).fill(false),
        shown: C.initialShown(c.words)
    }, over);
}

test('partita salvata: si riprende solo se recente, coerente e con la catena ancora in archivio', () => {
    const now = 1000 + 60 * 1000;
    assert.equal(C.checkSave(goodSave(), chains, now), chains[0]);
    assert.equal(C.checkSave(null, chains, now), null);
    assert.equal(C.checkSave('rotto', chains, now), null);
    assert.equal(C.checkSave(goodSave({ v: 2 }), chains, now), null);
    assert.equal(C.checkSave(goodSave(), chains, 1000 + C.SAVE_TTL + 1), null);          // troppo vecchia
    assert.equal(C.checkSave(goodSave({ chain: 'NON>ESISTE' }), chains, now), null);      // catena tolta dal database
    assert.equal(C.checkSave(goodSave({ n: 7 }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ idx: 5 }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ solved: [true] }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ shown: goodSave().shown.map(() => [true]) }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ teams: [{ name: 'Casa', pts: 1 }] }), chains, now), null);
    // "in gioco" ma con la catena già tutta scoperta: non è riprendibile
    assert.equal(C.checkSave(goodSave({ solved: new Array(8).fill(true) }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ state: 'done', solved: new Array(8).fill(true) }), chains, now), chains[0]);
});

test('bilancio tra due squadre: ordine e maiuscole dei nomi non contano, pareggi a parte', () => {
    assert.equal(C.pairKey('Bar Sport', 'i Ragazzi'), C.pairKey('I RAGAZZI', 'bar sport'));
    let r = C.alboAdd(null, 'Bar Sport', 'Ragazzi', 30, 20);
    r = C.alboAdd(r.albo, 'Ragazzi', 'Bar Sport', 34, 12);
    r = C.alboAdd(r.albo, 'bar sport', 'RAGAZZI', 10, 10);
    r = C.alboAdd(r.albo, 'Bar Sport', 'Ragazzi', 22, 18);
    assert.deepEqual(r.rec, { w: { 'bar sport': 2, ragazzi: 1 }, d: 1, n: 4 });
    // dati rovinati in memoria: si riparte puliti
    assert.equal(C.alboAdd('x', 'A', 'B', 1, 0).rec.n, 1);
    assert.equal(C.alboAdd({ 'a | b': 'rotto' }, 'A', 'B', 1, 0).rec.n, 1);
});

test('bilancio: si tengono al massimo 30 coppie, la piu\' recente resta', () => {
    let albo = {};
    for (let i = 0; i < 40; i++) albo = C.alboAdd(albo, 'A' + i, 'B' + i, 1, 0).albo;
    const keys = Object.keys(albo);
    assert.equal(keys.length, 30);
    assert.ok(keys.includes(C.pairKey('A39', 'B39')));
    assert.ok(!keys.includes(C.pairKey('A0', 'B0')));
});

/* ---------------- Equita', spareggio, cronometro ---------------- */

test('catene pari: ognuna delle due squadre apre lo stesso numero di catene', () => {
    for (const n of [4, 6, 8]) {
        for (const starter of [0, 1]) {
            const opened = [0, 0];
            for (let idx = 0; idx < n; idx++) opened[C.opener(idx, n, starter, [{}, {}], Math.random)]++;
            assert.deepEqual(opened, [n / 2, n / 2], `${n} catene, parte ${starter}`);
        }
    }
});

test('spareggio: lo apre chi ha trovato meno parole, a parita\' la sorte', () => {
    const t = (a, b) => [{ found: a, pts: 30 }, { found: b, pts: 30 }];
    assert.equal(C.opener(6, 6, 0, t(5, 3), () => 0.1), 1);
    assert.equal(C.opener(6, 6, 1, t(2, 3), () => 0.9), 0);
    assert.equal(C.opener(6, 6, 0, t(4, 4), () => 0.1), 0);
    assert.equal(C.opener(6, 6, 0, t(4, 4), () => 0.9), 1);
    assert.ok(C.needTiebreak(t(1, 2), 0));
    assert.ok(C.needTiebreak(t(1, 2), C.MAX_TB - 1));
    assert.ok(!C.needTiebreak(t(1, 2), C.MAX_TB), 'dopo tre spareggi e\' pareggio');
    assert.ok(!C.needTiebreak([{ pts: 30 }, { pts: 28 }], 0));
});

test('impostazioni: 3 e 5 catene diventano 4 e 6, cronometro solo 0/30/60', () => {
    assert.deepEqual(C.sanitizeCfg(null), { n: 6, timer: 0 });
    assert.deepEqual(C.sanitizeCfg({ n: 3 }), { n: 4, timer: 0 });
    assert.deepEqual(C.sanitizeCfg({ n: 5, timer: 30 }), { n: 6, timer: 30 });
    assert.deepEqual(C.sanitizeCfg({ n: 8, timer: 60 }), { n: 8, timer: 60 });
    assert.deepEqual(C.sanitizeCfg({ n: 7, timer: 45 }), { n: 6, timer: 0 });
});

test('partita salvata: vecchie partite a 3 o 5 catene e spareggi si riprendono', () => {
    const now = 1000 + 60 * 1000;
    assert.equal(C.checkSave(goodSave({ n: 3, idx: 2 }), chains, now), chains[0]);
    assert.equal(C.checkSave(goodSave({ n: 6, idx: 5, tsec: 30, pass: true }), chains, now), chains[0]);
    // la settima catena di una partita a 6 e' lo spareggio: serve tb
    assert.equal(C.checkSave(goodSave({ n: 6, idx: 6 }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ n: 6, idx: 6, tb: 1 }), chains, now), chains[0]);
    assert.equal(C.checkSave(goodSave({ n: 6, idx: 6, tb: 9 }), chains, now), null);
    assert.equal(C.checkSave(goodSave({ tsec: 45 }), chains, now), null);
});
