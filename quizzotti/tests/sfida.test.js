/* Sfida un amico e giorni del Giornale (assets/sfida.js): il link si legge
   come si scrive e non si lascia ritoccare, la sorgente delle carte rifa'
   all'amico le stesse estrazioni senza toccare il mazzo vero, le date di Roma
   coincidono con quelle dei giochi del giorno, e i cinque giochi della sfida
   caricano lo script e lo usano. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SF = require(path.join(root, 'assets', 'sfida.js'));
const GDG = require(path.join(root, 'assets', 'games', 'giocatoredelgiorno.js'));
const QQ = require(path.join(root, 'assets', 'games', 'quattro.js'));

test('il link della sfida: si legge come si scrive', () => {
    const d = { seed: 3141592653, opt: '25-7-10', list: [0, 5, 35, 36, 660], n: 661, score: 48500, name: 'Il Bomber' };
    const s = SF.encode('cadutalibera', d);
    assert.match(s, /^[0-9a-z]+\.25-7-10\.[0-9a-z]+\.48500\.Il%20Bomber\.[0-9a-z]+$/);
    const back = SF.decode('cadutalibera', s, 661);
    assert.deepEqual(back, { seed: 3141592653, opt: '25-7-10', list: [0, 5, 35, 36, 660], score: 48500, name: 'Il Bomber' });
    // senza nome e senza carte (Sopra o Sotto)
    const s2 = SF.encode('sopraosotto', { seed: 7, opt: 'mercato-all-any', score: 12 });
    assert.deepEqual(SF.decode('sopraosotto', s2, 0), { seed: 7, opt: 'mercato-all-any', list: [], score: 12, name: '' });
});

test('il link della sfida: punteggio, gioco o seme ritoccati non passano', () => {
    const s = SF.encode('intruso', { seed: 99, opt: '10', list: [1, 2, 3], n: 427, score: 900, name: 'Gio' });
    assert.ok(SF.decode('intruso', s, 427));
    assert.equal(SF.decode('intruso', s.replace('.900.', '.9900.'), 427), null, 'punteggio gonfiato');
    assert.equal(SF.decode('cvem', s, 427), null, 'la sfida di un gioco non vale in un altro');
    assert.equal(SF.decode('intruso', 'x' + s, 427), null);
    assert.equal(SF.decode('intruso', 'a.b.c', 427), null);
    assert.equal(SF.decode('intruso', null, 427), null);
    // mazzo cambiato: le posizioni fuori misura si lasciano perdere, resta il seme
    assert.deepEqual(SF.decode('intruso', s, 2).list, []);
});

test('il nome nel link: solo quello scelto, pulito e corto', () => {
    assert.equal(SF.cleanName('  <b>Fede.</b>  '), 'bFedeb');
    assert.equal(SF.cleanName('Lo Zio Franco dal 1978 in curva'), 'Lo Zio Franco da');
    assert.equal(SF.cleanName("D'Alessandro-Jr"), "D'Alessandro-Jr");
    assert.equal(SF.cleanName('Çağlar Söyüncü'), 'Çağlar Söyüncü');
    assert.equal(SF.cleanName(null), '');
    const s = SF.encode('cvem', { seed: 1, opt: '', list: [], score: 1000, name: 'a.b?c&d=e#f' });
    assert.equal(SF.decode('cvem', s, 0).name, 'abcdef');
    assert.equal(SF.param('?x=1&sfida=' + s + '#top'), s);
    assert.equal(SF.param('?giorno'), null);
});

test('la sorgente delle carte: la partita normale pesca dal mazzo e annota', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i, diff: 1 + (i % 3) }));
    let calls = 0;
    const out = [];
    // il mazzo finto da' la carta piu' alta non ancora uscita che passa il filtro
    const deck = { draw: (f) => { calls++; const x = items.filter((y) => (!f || f(y)) && !out.includes(y)).reverse()[0] || null; if (x) out.push(x); return x; } };
    const src = SF.source(deck, items, null, SF.rng(1));
    assert.equal(src.draw((x) => x.diff === 2).id, 49);
    assert.equal(src.draw((x) => x.diff === 9), null, 'niente carte: niente annotazione');
    assert.equal(src.draw().id, 48);
    assert.deepEqual(src.drawn, [49, 48]);
    assert.equal(calls, 3);
});

test('la sorgente delle carte: l\'amico rivede le stesse, poi pesca col seme, senza toccare il mazzo', () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ id: i, lv: i % 15 }));
    const deck = { draw() { throw new Error('la sfida non deve toccare il mazzo vero'); } };
    const ch = { seed: 42, list: [7, 3, 99] };
    const a = SF.source(deck, items, ch, SF.rng(ch.seed));
    const b = SF.source(deck, items, ch, SF.rng(ch.seed));
    const seqA = [], seqB = [];
    for (let k = 0; k < 20; k++) { seqA.push(a.draw((x) => x.lv === k % 15).id); seqB.push(b.draw((x) => x.lv === k % 15).id); }
    assert.deepEqual(seqA.slice(0, 3), [7, 3, 99], 'prima le carte del link, nell\'ordine');
    assert.deepEqual(seqA, seqB, 'stesso seme, stesse estrazioni');
    assert.equal(new Set(seqA).size, seqA.length, 'mai la stessa due volte');
    seqA.slice(3).forEach((id, k) => assert.equal(items[id].lv, (k + 3) % 15, 'dopo il link si rispetta il filtro'));
    assert.deepEqual(a.drawn, seqA, 'anche l\'amico si annota tutto, per rilanciare la sfida');
});

test('partita normale e partita dell\'amico: stesse domande e risposte negli stessi posti', () => {
    // il primo pesca da un mazzo "vero" a caso; il seme mescola le risposte
    const items = Array.from({ length: 300 }, (_, i) => ({ q: 'D' + i, lv: 1 + (i % 15), opts: ['a' + i, 'b' + i, 'c' + i, 'd' + i] }));
    const seed = SF.newSeed();
    const real = { draw: (f) => { const p = items.filter((x) => !f || f(x)); return p[Math.floor(Math.random() * p.length)]; } };
    const play = (src, rng) => {
        const out = [];
        for (let lv = 1; lv <= 15; lv++) {
            const q = src.draw((x) => x.lv === lv);
            out.push(q.q + ':' + SF.shuffle(q.opts, rng).join(','));
        }
        return out;
    };
    const r1 = SF.rng(seed), s1 = SF.source(real, items, null, r1);
    const mine = play(s1, r1);
    const link = SF.encode('cvem', { seed, opt: '', list: s1.drawn, n: items.length, score: 32000, name: 'Gio' });
    const ch = SF.decode('cvem', link, items.length);
    const r2 = SF.rng(ch.seed);
    assert.deepEqual(play(SF.source(null, items, ch, r2), r2), mine);
});

test('i giorni: data di Roma, N° e mezzanotte come nei giochi del giorno', () => {
    assert.equal(SF.START, QQ.START, 'stesso N° 1 della Scheda del giorno');
    for (const iso of ['2026-11-26T22:59:59Z', '2026-11-26T23:00:00Z', '2027-03-28T00:30:00Z', '2027-07-01T21:59:00Z', '2027-10-30T22:30:00Z']) {
        const d = new Date(iso);
        assert.equal(SF.romeDate(d), GDG.romeDate(d), iso);
        assert.equal(SF.msToNext(d), GDG.msToNext(d), iso);
    }
    assert.equal(SF.dayNumber('2026-11-26'), 0, 'prima del via');
    assert.equal(SF.dayNumber('2026-11-27'), 1);
    for (const ymd of ['2026-11-27', '2026-12-31', '2027-03-29', '2027-11-26']) {
        assert.equal(SF.dayNumber(ymd), QQ.dailyNumber(ymd), ymd);
        assert.equal(SF.dateOf(SF.dayNumber(ymd)), ymd);
    }
    assert.equal(SF.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(SF.itDate('2026-11-27'), '27/11/2026');
    assert.notEqual(SF.daySeed('intruso', '2026-11-27'), SF.daySeed('intruso', '2026-11-28'));
    assert.notEqual(SF.daySeed('intruso', '2026-11-27'), SF.daySeed('sopraosotto', '2026-11-27'));
    assert.equal(SF.daySeed('intruso', '2026-11-27'), SF.daySeed('intruso', '2026-11-27'));
});

const CHALLENGE = [
    ['cvem', 'CVEM.html', 'cvem'], ['cvem', 'MilionarioNormale.html', 'milionario'], ['cadutalibera', 'CadutaLibera.html', 'cadutalibera'],
    ['sopraosotto', 'SopraOSotto.html', 'sopraosotto'], ['intruso', 'Intruso.html', 'intruso'], ['avantiunaltro', 'AvantiUnAltro.html', 'avantiunaltro']
];
for (const [js, page] of CHALLENGE) {
    test(`${page}: carica sfida.js tra il motore e il gioco, e il gioco offre la sfida`, () => {
        const html = read(page);
        const iQz = html.search(/src="assets\/qz\.js/), iSf = html.search(/src="assets\/sfida\.js/), iG = html.search(new RegExp(`src="assets/games/${js}\\.js`));
        assert.ok(iQz >= 0 && iSf > iQz && iG > iSf, 'ordine degli script: qz.js, sfida.js, il gioco');
        const src = read(`assets/games/${js}.js`);
        assert.match(src, /SF\.read\(/, 'legge la sfida dal link');
        assert.match(src, /SF\.offer\(/, 'offre «Sfida un amico» a fine partita');
        assert.match(src, /SF\.intro\(/, 'mostra «devi battere» in copertina');
        assert.match(src, /verdictHTML\(/, 'dice a fine partita se hai battuto l\'amico');
        if (js !== 'sopraosotto') assert.match(src, /SF\.source\(/, 'pesca le carte attraverso la sorgente della sfida');
    });
}

test('la partita di sfida non scrive record e statistiche normali', () => {
    const cv = read('assets/games/cvem.js');
    assert.match(cv, /if \(!ch\) \{\s+c\.games\+\+/, 'Milionario: carriera solo fuori dalla sfida');
    assert.match(cv, /ch \? QZ\.profile\.record\(GID, \{ xp: [^}]*\}\)\s+: QZ\.profile\.record\(GID, \{ xp: xp, label: [^}]*score: reached \}\)/, 'Milionario: in sfida niente score');
    const cl = read('assets/games/cadutalibera.js');
    assert.match(cl, /if \(!ch\) \{\s+st\.games\+\+/);
    const au = read('assets/games/avantiunaltro.js');
    assert.match(au, /var seriesRecord = ch \? false : saveSeries\(\);/);
    assert.match(au, /if \(!ch && win && \(prev == null \|\| total < prev\)\)/);
    assert.match(au, /if \(!ch && \(prev == null \|\| won > prev\)\)/);
    const ix = read('assets/games/intruso.js');
    assert.match(ix, /else if \(S\.ch\) finishChallenge\(\);\s+else finishSolo\(quit\);/, 'Intruso: la sfida non passa da finishSolo (record e carriera)');
    const so = read('assets/games/sopraosotto.js');
    assert.match(so, /if \(!M\.kind\) \{\s+var st = stats\(\);/);
    assert.match(so, /else if \(M\.kind === 'sfida'\) finishChallenge\(\);\s+else finishSolo\(\);/);
});
