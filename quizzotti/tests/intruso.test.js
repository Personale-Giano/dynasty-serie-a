/* L'Intruso (assets/db-intruso.js): almeno 200 round, sei nomi distinti,
   l'intruso e' uno dei sei, campi pieni, difficolta' 1-3 e nessun round
   ripetuto (stesso insieme di nomi, in qualunque ordine). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { intrusoRounds } = require(path.join('..', 'assets', 'db-intruso.js'));
const label = (r) => `"${r.rule}" [${r.items.join(', ')}]`;

test('db-intruso.js: almeno 200 round', () => {
    assert.ok(Array.isArray(intrusoRounds));
    assert.ok(intrusoRounds.length >= 200, `trovati solo ${intrusoRounds.length} round`);
});

test('db-intruso.js: 6 nomi distinti e non vuoti, intruso tra i sei', () => {
    for (const r of intrusoRounds) {
        assert.ok(Array.isArray(r.items) && r.items.length === 6, `servono 6 nomi: ${label(r)}`);
        r.items.forEach((it) => assert.ok(typeof it === 'string' && it.trim().length > 0, `nome vuoto: ${label(r)}`));
        assert.equal(new Set(r.items.map((s) => s.trim().toLowerCase())).size, 6, `nomi ripetuti: ${label(r)}`);
        assert.ok(r.items.includes(r.odd), `intruso "${r.odd}" non tra i nomi: ${label(r)}`);
    }
});

test('db-intruso.js: campi rule/why/cat pieni e diff 1-3', () => {
    for (const r of intrusoRounds) {
        for (const k of ['rule', 'why', 'cat', 'odd']) {
            assert.ok(typeof r[k] === 'string' && r[k].trim().length > 0, `campo ${k} vuoto: ${label(r)}`);
        }
        assert.ok([1, 2, 3].includes(r.diff), `diff non valida (${r.diff}): ${label(r)}`);
    }
});

test('db-intruso.js: nessun round duplicato (stesso insieme di nomi)', () => {
    const seen = new Map();
    for (const r of intrusoRounds) {
        const key = r.items.map((s) => s.trim().toLowerCase()).sort().join('|');
        assert.ok(!seen.has(key), `round duplicato: ${label(r)} e "${seen.get(key)}"`);
        seen.set(key, r.rule);
    }
});

test('db-intruso.js: tutte e tre le difficolta\' ben rappresentate', () => {
    for (const d of [1, 2, 3]) {
        const n = intrusoRounds.filter((r) => r.diff === d).length;
        assert.ok(n >= 30, `troppo pochi round di difficolta' ${d}: ${n}`);
    }
});

test('db-intruso.js: almeno 280 round dopo la revisione di novembre 2026', () => {
    assert.ok(intrusoRounds.length >= 280, `trovati solo ${intrusoRounds.length} round`);
});

test('db-intruso.js: nomi abbastanza corti da stare in una casella del telefono', () => {
    for (const r of intrusoRounds) {
        r.items.forEach((it) => assert.ok(it.length <= 26, `nome troppo lungo (${it.length}): "${it}" in ${label(r)}`));
        assert.equal(r.items.filter((it) => it === r.odd).length, 1, `intruso presente piu' volte: ${label(r)}`);
    }
});

test('db-intruso.js: il legame non svela l\'intruso e nessun nome ha spazi ai bordi', () => {
    for (const r of intrusoRounds) {
        assert.ok(!r.rule.toLowerCase().includes(r.odd.toLowerCase()), `la regola contiene l'intruso: ${label(r)}`);
        r.items.forEach((it) => assert.equal(it, it.trim(), `spazi ai bordi: "${it}"`));
        assert.ok(!/\s{2,}/.test(r.why + r.rule), `spazi doppi: ${label(r)}`);
    }
});

test('db-intruso.js: nomi gia\' superati non tornano (stadio dell\'Atalanta rinominato nel 2025)', () => {
    for (const r of intrusoRounds) {
        assert.ok(!r.items.includes('Gewiss Stadium'), `Gewiss Stadium ora si chiama New Balance Arena: ${label(r)}`);
    }
});

test('db-intruso.js: dopo il 26 novembre 2026 almeno 400 round, 140 difficili e 180 medi', () => {
    assert.ok(intrusoRounds.length >= 400, `trovati solo ${intrusoRounds.length} round`);
    assert.ok(intrusoRounds.filter((r) => r.diff === 3).length >= 140, 'troppo pochi round difficili');
    assert.ok(intrusoRounds.filter((r) => r.diff === 2).length >= 180, 'troppo pochi round medi');
});

test('db-intruso.js: intrusi variati, i soliti nomi non tornano ancora', () => {
    const count = {};
    intrusoRounds.forEach((r) => { count[r.odd] = (count[r.odd] || 0) + 1; });
    // tetto ai nomi gia' abusati come intruso prima della revisione di novembre 2026
    const tetto = { 'Del Piero': 10, Batistuta: 6, 'Ibrahimović': 6, Totti: 5 };
    for (const [nome, max] of Object.entries(tetto)) {
        assert.ok((count[nome] || 0) <= max, `${nome} e' l'intruso ${count[nome]} volte`);
    }
    const top = Object.entries(count).filter(([, n]) => n > 10);
    assert.deepEqual(top, [], `intrusi troppo ripetuti: ${top.map((e) => e.join(':')).join(', ')}`);
});

test('games/intruso.js: lo script del gioco compila', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'intruso.js'), 'utf8');
    assert.doesNotThrow(() => new Function(src));
});

/* ---------- Sfida a due: stessa difficolta' per tutti e due, telefono a blocchi ---------- */
const G = require(path.join('..', 'assets', 'games', 'intruso.js'));

test('sfida a due: un solo piano di difficolta\' per la partita, che sale come da solo', () => {
    for (let k = 0; k < 50; k++) {
        const plan = G.diffPlan(G.DUO_ROUNDS, Math.random);
        assert.equal(plan.length, G.DUO_ROUNDS);
        assert.deepEqual(plan.slice(0, 3), [1, 1, 1]);
        plan.forEach((d, n) => assert.ok(n < 8 ? d <= 2 : d >= 2, `round ${n}: ${d}`));
    }
    // stesso generatore, stessa sequenza: il piano non dipende da chi gioca
    const seq = (seed) => { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; };
    assert.deepEqual(G.diffPlan(10, seq(7)), G.diffPlan(10, seq(7)));
});

function simulate(lose) {
    // lose[i] = round (1 = primo) in cui il giocatore i perde l'ultima vita, oppure 0
    const ps = [0, 1].map(() => ({ lives: G.LIVES, played: 0 }));
    let turn = 0, passes = 0;
    const seq = [];
    for (;;) {
        const p = ps[turn];
        p.played++;
        seq.push(turn);
        if (lose[turn] && p.played === lose[turn]) p.lives = 0;
        const n = G.nextTurn(ps, turn);
        if (n < 0) break;
        if (n !== turn) passes++;
        turn = n;
    }
    return { seq, passes, ps };
}

test('sfida a due: blocchi da cinque round, tre passaggi di mano invece di diciannove', () => {
    const r = simulate([0, 0]);
    assert.deepEqual(r.seq, [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    assert.equal(r.passes, 3);
    assert.deepEqual(r.ps.map((p) => p.played), [10, 10]);
});

test('sfida a due: chi resta senza vite passa subito il telefono, l\'altro finisce i suoi round', () => {
    const r = simulate([3, 0]);
    assert.deepEqual(r.seq, [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(r.passes, 1);
    const q = simulate([0, 7]);
    assert.deepEqual(q.seq, [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1]);
    assert.deepEqual(q.ps.map((p) => p.played), [10, 7]);
    assert.equal(G.blockEnd(0, true), 5);
    assert.equal(G.blockEnd(5, true), 10);
    assert.equal(G.blockEnd(3, false), 10);
});

/* ---------- L'Intruso del giorno ---------- */
test('Intruso del giorno: cinque round diversi, due facili, due medi e uno difficile, uguali per tutti', () => {
    const days = ['2026-11-27', '2026-11-28', '2026-12-25', '2027-06-01'];
    const sets = days.map((ymd) => {
        const a = G.dailyRounds(intrusoRounds, ymd);
        assert.deepEqual(a.map((r) => r.diff), [1, 1, 2, 2, 3], ymd);
        assert.equal(new Set(a.map(G.roundKey)).size, 5, `${ymd}: round ripetuti`);
        assert.deepEqual(G.dailyRounds(intrusoRounds, ymd), a, `${ymd}: stessa data, stessi round`);
        // l'ordine del database non conta: e' la data a decidere
        assert.deepEqual(G.dailyRounds(intrusoRounds.slice().reverse(), ymd).map(G.roundKey), a.map(G.roundKey), `${ymd}: dipende dall'ordine del database`);
        return a.map(G.roundKey).join('#');
    });
    assert.equal(new Set(sets).size, days.length, 'ogni giorno i suoi round');
});

test('Intruso del giorno: un round aggiunto al database cambia al massimo i giorni in cui vince', () => {
    const extra = { cat: 'Prova', diff: 2, items: ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'], odd: 'F6', rule: 'r', why: 'w' };
    let changed = 0;
    for (let k = 0; k < 60; k++) {
        const ymd = new Date(Date.UTC(2026, 10, 27 + k)).toISOString().slice(0, 10);
        const a = G.dailyRounds(intrusoRounds, ymd).map(G.roundKey);
        const b = G.dailyRounds(intrusoRounds.concat([extra]), ymd).map(G.roundKey);
        const diff = a.filter((x, i) => x !== b[i]);
        if (diff.length) { changed++; assert.ok(b.includes(G.roundKey(extra)), ymd); }
    }
    assert.ok(changed <= 6, `cambiati ${changed} giorni su 60`);
});

test('Intruso del giorno: quadratini e ritmo', () => {
    assert.equal(G.dailyGrid(['ok', 'bad', 'time', 'ok']), '🟩🟥⬛🟩⬛', 'i round non giocati sono neri');
    assert.equal(G.dailyGrid([]), '⬛⬛⬛⬛⬛');
    assert.equal(G.DAILY_PACE, 10);
    assert.equal(G.DAILY_PLAN.length, 5);
});
