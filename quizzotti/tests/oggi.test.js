/* Il Giornale di oggi (Oggi.html, assets/games/oggi.js): legge i salvataggi
   dei quattro giochi del giorno senza scriverli, spunta le caselle, conta la
   serie dei giorni in campo (almeno 3 giochi su 4) e prepara il riepilogo da
   condividere; N° e date coincidono con quelli dei giochi. Non e' nel registro. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const O = require(path.join(root, 'assets', 'games', 'oggi.js'));
const GDG = require(path.join(root, 'assets', 'games', 'giocatoredelgiorno.js'));
const QQ = require(path.join(root, 'assets', 'games', 'quattro.js'));
const SF = require(path.join(root, 'assets', 'sfida.js'));

/** Un localStorage finto: { chiave: valore gia' decodificato }. */
const store = (x) => (k) => (k in x ? x[k] : null);

/** Salvataggi di un giorno: quali giochi sono chiusi. */
function dayData(x, ymd, which) {
    const n = O.gameNumber('giocatoredelgiorno', ymd);
    x['qz.gdg.history'] = x['qz.gdg.history'] || {};
    x['qz.quattro.daily.v1'] = x['qz.quattro.daily.v1'] || { play: {}, done: {} };
    x['qz.intruso.daily.v1'] = x['qz.intruso.daily.v1'] || {};
    x['qz.sopraosotto.daily.v1'] = x['qz.sopraosotto.daily.v1'] || {};
    if (which.includes('g')) x['qz.gdg.history'][n] = { w: 1, t: 3, h: 0 };
    if (which.includes('q')) x['qz.quattro.daily.v1'].done[ymd] = { win: true, mistakes: 1, solved: [0, 1, 2, 3], rows: [[1, 1, 1, 1], [2, 3, 2, 2], [2, 2, 2, 2], [3, 3, 3, 3], [4, 4, 4, 4]] };
    if (which.includes('i')) x['qz.intruso.daily.v1'][ymd] = { n: O.number(ymd), log: ['ok', 'ok', 'bad', 'ok', 'time'], score: 600, done: true };
    if (which.includes('s')) x['qz.sopraosotto.daily.v1'][ymd] = { n: O.number(ymd), streak: 7, done: true };
    return x;
}

test('N° del Giornale e dei giochi: gli stessi dei giochi del giorno', () => {
    assert.equal(O.START, QQ.START);
    assert.equal(O.GDG_START, GDG.START);
    for (const ymd of ['2026-11-27', '2026-12-25', '2027-03-28', '2027-03-29', '2027-10-31']) {
        assert.equal(O.gameNumber('giocatoredelgiorno', ymd), GDG.daily([], ymd).n, ymd);
        assert.equal(O.gameNumber('quattro', ymd), QQ.dailyNumber(ymd), ymd);
        assert.equal(O.number(ymd), SF.dayNumber(ymd), ymd);
    }
    assert.equal(O.number('2026-11-26'), 0);
    assert.equal(O.gameNumber('giocatoredelgiorno', '2026-11-26'), 11, 'il Calciatore c\'e\' gia\'');
    for (const d of ['2026-11-26T23:30:00Z', '2027-03-28T01:30:00Z']) assert.equal(O.romeDate(new Date(d)), GDG.romeDate(new Date(d)));
});

test('caselle: da giocare, in corso, fatto', () => {
    const ymd = '2026-11-28';
    const empty = store({});
    for (const g of O.GAMES) assert.equal(O.status(g.id, empty, ymd).state, 'todo', g.id);
    const playing = store({
        'qz.gdg.today': { n: 13, guesses: ['A', 'B'], done: false },
        'qz.quattro.daily.v1': { play: { [ymd]: { solved: [0], mistakes: 1 } }, done: {} },
        'qz.intruso.daily.v1': { [ymd]: { n: 2, log: ['ok'], done: false } },
        'qz.sopraosotto.daily.v1': { [ymd]: { n: 2, streak: 3, done: false } }
    });
    for (const g of O.GAMES) assert.equal(O.status(g.id, playing, ymd).state, 'play', g.id);
    assert.equal(O.status('giocatoredelgiorno', playing, ymd).text, 'In corso: 2 tentativi');

    const x = store(dayData({}, ymd, 'gqis'));
    const g = O.status('giocatoredelgiorno', x, ymd);
    assert.deepEqual([g.state, g.n, g.line], ['done', 13, '⬛⬛🟩 3/6']);
    const q = O.status('quattro', x, ymd);
    assert.deepEqual([q.state, q.n, q.line], ['done', 2, '🟩⬛🟨🟦🟥 1 errore'], 'un quadratino a tentativo: nero l\'errore');
    const i = O.status('intruso', x, ymd);
    assert.deepEqual([i.state, i.line, i.win], ['done', '🟩🟩🟥🟩⬛ 3/5', false]);
    assert.equal(O.status('sopraosotto', x, ymd).line, '🔥 7 di fila');
    assert.equal(O.count(x, ymd), 4);
});

test('caselle: casi particolari dei salvataggi', () => {
    const ymd = '2026-11-28';
    // archivio del Calciatore: non vale come partita del giorno
    assert.equal(O.status('giocatoredelgiorno', store({ 'qz.gdg.history': { 13: { w: 1, t: 2, h: 0, a: 1 } } }), ymd).state, 'todo');
    // persa a 6 tentativi, e la bandiera bianca dopo 2
    assert.equal(O.status('giocatoredelgiorno', store({ 'qz.gdg.history': { 13: { w: 0, t: 6, h: 1 } } }), ymd).line, '⬛⬛⬛⬛⬛⬛ X/6 💡');
    assert.equal(O.status('giocatoredelgiorno', store({ 'qz.gdg.history': { 13: { w: 0, t: 2, h: 0 } } }), ymd).text, 'Bandiera bianca');
    // la partita in corso di ieri non e' "in corso" oggi
    assert.equal(O.status('giocatoredelgiorno', store({ 'qz.gdg.today': { n: 12, guesses: ['A'], done: false } }), ymd).state, 'todo');
    // scheda chiusa prima che esistessero i colori dei tentativi
    assert.equal(O.status('quattro', store({ 'qz.quattro.daily.v1': { done: { [ymd]: { win: false, mistakes: 4, solved: [0, 2] } } } }), ymd).line, '🟩🟩⬛⬛⬛⬛ persa');
    // salvataggi rovinati non rompono la pagina
    const bad = store({ 'qz.gdg.history': [1, 2], 'qz.quattro.daily.v1': 'x', 'qz.intruso.daily.v1': 5, 'qz.sopraosotto.daily.v1': null });
    for (const g of O.GAMES) assert.equal(O.status(g.id, bad, ymd).state, 'todo', g.id);
    // prima del via: solo il Calciatore
    assert.equal(O.status('quattro', store({}), '2026-11-26').state, 'soon');
    assert.equal(O.status('giocatoredelgiorno', store({}), '2026-11-26').state, 'todo');
});

test('giorni in campo: almeno 3 su 4, di fila, e oggi non rompe la serie finche\' non e\' finito', () => {
    const x = {};
    dayData(x, '2026-11-27', 'gqi');      // 3: buono
    dayData(x, '2026-11-28', 'gqis');     // 4: buono
    dayData(x, '2026-11-29', 'gq');       // 2: niente
    dayData(x, '2026-11-30', 'qis');      // 3: buono
    dayData(x, '2026-12-01', 'gqis');     // 4: buono
    dayData(x, '2026-12-02', 'g');        // oggi, ancora 1
    const get = store(x);
    assert.equal(O.good(get, '2026-11-29'), false);
    assert.equal(O.streak(get, '2026-11-28'), 2);
    assert.equal(O.streak(get, '2026-11-29'), 2, 'il 29 non e\' finito: la serie resta quella fino a ieri');
    assert.equal(O.streak(get, '2026-11-30'), 1, 'il 29 saltato: si riparte');
    assert.equal(O.streak(get, '2026-12-02'), 2, 'oggi a 1 su 4: conta fino a ieri');
    dayData(x, '2026-12-02', 'gqi');
    assert.equal(O.streak(get, '2026-12-02'), 3, 'oggi a 3: la serie si allunga subito');
    assert.equal(O.streak(get, '2026-12-04'), 0, 'saltato il 3: serie finita');
    assert.equal(O.best(get, '2026-12-04'), 3);
    assert.equal(O.best(get, '2026-11-26'), 0);
    // prima del 27 novembre la serie non esiste, anche col Calciatore giocato
    const pre = dayData({}, '2026-11-26', 'g');
    assert.equal(O.streak(store(pre), '2026-11-26'), 0);
});

test('il riepilogo da condividere: le emoji di tutti, la serie, nessun nome', () => {
    const x = {};
    dayData(x, '2026-11-27', 'gqis');
    dayData(x, '2026-11-28', 'gqi');
    const txt = O.shareText(store(x), '2026-11-28', 'https://quizotti.altervista.org/quizzotti/Oggi.html');
    const lines = txt.split('\n');
    assert.equal(lines[0], 'Il Giornale di Quizzotti N° 2 · 28/11/2026');
    assert.equal(lines[1], '👤 Calciatore del Giorno N° 13: ⬛⬛🟩 3/6');
    assert.equal(lines[2], '🧩 Quattro per Quattro N° 2: 🟩⬛🟨🟦🟥 1 errore');
    assert.equal(lines[3], '👁️ L\'Intruso N° 2: 🟩🟩🟥🟩⬛ 3/5');
    assert.equal(lines[4], '↕️ Sopra o Sotto N° 2: da giocare');
    assert.equal(lines[5], '✅ 3 su 4 · 📅 2 giorni in campo');
    assert.equal(lines[6], 'https://quizotti.altervista.org/quizzotti/Oggi.html');
    const before = O.shareText(store({}), '2026-11-26', '');
    assert.match(before, /^Il Giornale di Quizzotti · 26\/11\/2026\n/);
    assert.match(before, /Quattro per Quattro: dal 27\/11\/2026/);
});

test('Oggi.html: pagina coerente, fuori dal registro dei giochi, nella sitemap', () => {
    const html = read('Oggi.html');
    assert.match(html, /<body data-page="oggi">/);
    assert.doesNotMatch(html, /data-game=/, 'non e\' un gioco');
    const iQz = html.search(/src="assets\/qz\.js/), iSf = html.search(/src="assets\/sfida\.js/), iO = html.search(/src="assets\/games\/oggi\.js/);
    assert.ok(iQz >= 0 && iSf > iQz && iO > iSf, 'script: qz.js, sfida.js, oggi.js');
    for (const id of ['o-date', 'o-n', 'o-done', 'o-streak', 'o-next', 'o-goal', 'o-best', 'o-list', 'o-share', 'o-rules']) {
        assert.match(html, new RegExp(`id="${id}"`), 'manca #' + id);
    }
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'un solo h1');
    assert.match(html, /<title>[^<]+ · Quizzotti<\/title>/);
    assert.doesNotMatch(read('assets/qz.js'), /Oggi\.html/, 'il Giornale non va nel registro QZ.GAMES');
    assert.match(read('../sitemap.xml'), /<loc>https:\/\/quizotti\.altervista\.org\/quizzotti\/Oggi\.html<\/loc>/);
    // ogni gioco del Giornale porta a una pagina che esiste, e i nuovi aprono subito la partita del giorno
    for (const g of O.GAMES) assert.ok(fs.existsSync(path.join(root, g.file.split('?')[0])), g.file);
    assert.deepEqual(O.GAMES.map((g) => g.file), ['GiocatoreDelGiorno.html', 'QuattroPerQuattro.html?giorno', 'Intruso.html?giorno', 'SopraOSotto.html?giorno']);
});

test('i giochi del giorno aprono la partita del giorno da ?giorno e la mandano alle Leghe', () => {
    const qq = read('assets/games/quattro.js');
    assert.match(qq, /\[\?&\]giorno/);
    assert.match(qq, /if \(first && S\.daily && QZ\.leagues\) QZ\.leagues\.submit\('quattro', S\.num, \{ win: !!won, mistakes: err, found: found \}\);/);
    assert.match(qq, /st\.done\[key\]\.rows = /, 'la scheda del giorno tiene i colori dei tentativi');
    const ix = read('assets/games/intruso.js');
    assert.match(ix, /GG\.asked\(\) && !CH\) setTimeout\(playDaily/);
    assert.match(ix, /function finishDaily\(\) \{[\s\S]*?QZ\.leagues\.submit\(GAME, S\.n, \{ found: p\.passed \}\)/);
    const so = read('assets/games/sopraosotto.js');
    assert.match(so, /GG\.asked\(\) && !CH\) setTimeout\(playDaily/);
    assert.match(so, /if \(M\.kind === 'giorno'\) \{[\s\S]*?QZ\.leagues\.submit\(GAME, M\.n, \{ streak: S\.streak \}\)/);
    // il Calciatore del Giorno resta com'era: un solo invio, dalla partita del giorno
    assert.equal([...read('assets/games/giocatoredelgiorno.js').matchAll(/QZ\.leagues\.submit\(/g)].length, 1);
});
