/* Leghe tra amici: funzioni pure della pagina (assets/games/leghe.js), pagina con
   tutti gli id usati, QZ.leagues in assets/qz.js (un invio per gioco e N°, niente
   rete senza leghe, si riprova se manca la rete), il Calciatore del Giorno che
   manda solo la partita del giorno, e il server: regole (tests/leghe-core.test.php)
   e una lega vera su un PHP locale con le date simulate (se c'e' un PHP sul
   computer: variabile PHP_BIN o il PHP dell'Istituto). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, spawnSync } = require('child_process');
const { fetch } = globalThis;   // Node 18+

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const Core = require(path.join(root, 'assets', 'games', 'leghe.js'));

/* ---------- pagina ---------- */

test('leghe.js: codici, date, voti e invito', () => {
    assert.equal(Core.normCode(' abc-234 '), 'ABC234');
    assert.equal(Core.normCode('ab0c1o2i3l4'), 'ABC234', 'O, 0, I, 1, L non esistono nei codici');
    assert.ok(Core.validCode('ABC234') && !Core.validCode('ABC23') && !Core.validCode('ABC2340') && !Core.validCode('ABCO34'));
    assert.equal(Core.fmtDay('2026-11-26'), '26 novembre');
    assert.equal(Core.fmtRange('2026-11-23', '2026-11-29'), '23-29 novembre');
    assert.equal(Core.fmtRange('2026-11-30', '2026-12-06'), '30 novembre - 6 dicembre');
    assert.equal(Core.fmtRange('2026-11-23', '2026-11-23'), '23 novembre');
    assert.equal(Core.votoLabel(7.5), '7½');
    assert.equal(Core.votoLabel(6), '6');
    assert.equal(Core.votoLabel(null), 's.v.');
    assert.equal(Core.inviteUrl('https://x.it/quizzotti/Leghe.html?c=OLD234#top', 'ABC234'), 'https://x.it/quizzotti/Leghe.html?c=ABC234');
    assert.match(Core.inviteText('Calcetto', 'https://x.it/q?c=ABC234'), /«Calcetto».*\n.*c=ABC234$/);
});

test('leghe.js: classifica e pagellino con i soprannomi protetti', () => {
    const rows = [
        { id: 'm1', nick: '<b>Fede</b>', color: '#d9342b', p: 38, g: 7, w: 6, avg: 5.4, pos: 1 },
        { id: 'm2', nick: 'Gio', color: '#2f6fe0', p: 0, g: 0, w: 0, avg: 0, pos: 2 }
    ];
    const t = Core.tableHTML(rows, 'm2');
    assert.doesNotMatch(t, /<b>Fede/);
    assert.match(t, /&lt;b&gt;Fede/);
    assert.match(t, /class="is-me is-zero"/);
    assert.match(t, /5,4/);
    const P = {
        from: '2026-11-23', to: '2026-11-29', games: 9, players: 2, avg: 4.2,
        winners: [{ id: 'm1', nick: 'Fede', p: 38 }], streak: { id: 'm1', nick: 'Fede', days: 3 },
        rows: [Object.assign({ voto: 7.5, streak: 3 }, rows[0], { nick: 'Fede' }), { id: 'm2', nick: 'Gio', p: 18, g: 2, w: 2, avg: 9, voto: null, pos: 2 }]
    };
    const h = Core.pagellinoHTML(P, 'm2', true);
    assert.match(h, /È lunedì/);
    assert.match(h, /Vince Fede/);
    assert.match(h, /4,2/);
    assert.match(h, /3 giorni di fila/);
    assert.match(h, /7½/);
    assert.match(h, /s\.v\./);
    assert.match(Core.pagellinoHTML(Object.assign({}, P, { winners: [{ nick: 'A', p: 5 }, { nick: 'B', p: 5 }] }), '', false), /Pari merito in vetta: A e B/);
});

test('leghe.js: oggi in lega, prima chi ha giocato', () => {
    const items = Core.todayItems({
        games: { giocatoredelgiorno: { name: 'Calciatore del Giorno', n: 11 } },
        members: [{ id: 'm1', nick: 'Ale' }, { id: 'm2', nick: 'Gio' }, { id: 'm3', nick: 'Fede' }],
        recent: [{ m: 'm2', g: 'giocatoredelgiorno', n: 11, l: '2/6', p: 8, at: 5 }, { m: 'm3', g: 'giocatoredelgiorno', n: 10, l: '1/6', p: 10, at: 9 }]
    });
    assert.deepEqual(items.map((x) => [x.nick, x.played]), [['Gio', true], ['Ale', false], ['Fede', false]], 'il N° di ieri non conta come oggi');
});

test('Leghe.html: tutti gli id usati dallo script, un h1 per schermata, niente registro giochi', () => {
    const js = read('assets/games/leghe.js');
    const html = read('Leghe.html');
    const ids = new Set();
    for (const m of js.matchAll(/\$\('#([a-z][\w-]*\w)['\s]/g)) ids.add(m[1]);
    for (const m of js.matchAll(/QZ\.show\('([a-z][\w-]*)'/g)) ids.add(m[1]);
    assert.ok(ids.size > 30, 'troppi pochi id trovati: ' + ids.size);
    const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html) && !/^rn-/.test(id));
    assert.deepEqual(missing, []);
    for (const sec of html.split('<section').slice(1)) assert.ok((sec.match(/<h1[\s>]/g) || []).length <= 1, 'piu di un h1 in una schermata');
    assert.match(html, /<body data-page="leghe">/);
    assert.match(html, /src="assets\/games\/leghe\.js/);
    assert.doesNotMatch(read('assets/qz.js'), /file: 'Leghe\.html'/, 'le leghe non sono un gioco del registro');
    assert.match(read('../sitemap.xml'), /quizzotti\/Leghe\.html/);
});

/* ---------- QZ.leagues (assets/qz.js) ---------- */

function loadQZ(initial, fetchImpl) {
    const data = Object.assign({}, initial || {});
    const localStorage = {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; }
    };
    const doc = {
        readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
        querySelectorAll() { return []; }, dispatchEvent() {}, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
        documentElement: { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } },
        body: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }
    };
    const win = {
        document: doc, localStorage, setTimeout, clearTimeout, Math, JSON, Date, Promise, Uint8Array,
        addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {},
        crypto: require('crypto').webcrypto, fetch: fetchImpl
    };
    win.window = win;
    vm.createContext(win);
    win.CustomEvent = function () {};
    vm.runInContext(read('assets/qz.js'), win, { filename: 'assets/qz.js' });
    win.QZ.toast = () => {};
    return { QZ: win.QZ, data };
}

function fakeServer() {
    const calls = [];
    let down = false;
    const fetchImpl = (url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push(body);
        if (down) return Promise.reject(new Error('rete giu'));
        const res = {};
        body.codes.forEach((c) => { res[c] = c === 'GHNE22' ? { err: 'Lega non trovata', gone: 1 } : { ok: 1, p: 8 }; });
        return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: 1, res }) });
    };
    return { calls, fetchImpl, setDown(v) { down = v; } };
}

test('QZ.leagues: senza leghe nessuna richiesta, ma il risultato resta per chi entra dopo', async () => {
    const srv = fakeServer();
    const { QZ, data } = loadQZ({}, srv.fetchImpl);
    const r = await QZ.leagues.submit('giocatoredelgiorno', 11, { win: true, tries: 2, hints: 0 });
    assert.equal(r.sent, 0);
    assert.equal(srv.calls.length, 0, 'niente rete senza leghe');
    assert.equal(JSON.parse(data['qz.leghe.sent']).length, 1);
    // entra in una lega: il risultato di oggi arriva anche li'
    QZ.leagues.add({ code: 'ABC234', name: 'Calcetto', mid: 'm2', nick: 'Gio' });
    assert.equal(QZ.leagues.pending().length, 1);
    const f = await QZ.leagues.flush();
    assert.deepEqual([f.sent, f.names], [1, ['Calcetto']]);
    assert.equal(srv.calls.length, 1);
    assert.deepEqual(srv.calls[0].codes, ['ABC234']);
    assert.match(srv.calls[0].tok, /^[a-f0-9]{32}$/, 'gettone segreto mandato a ogni invio');
    assert.equal(srv.calls[0].tok, JSON.parse(data['qz.leghe.tok']), 'lo stesso gettone salvato nel telefono');
    assert.equal(QZ.leagues.pending().length, 0);
});

test('QZ.leagues: un invio per gioco e N°, a tutte le leghe insieme; senza rete si riprova', async () => {
    const srv = fakeServer();
    const { QZ } = loadQZ({}, srv.fetchImpl);
    QZ.leagues.add({ code: 'ABC234', name: 'Uno', mid: 'm1' });
    QZ.leagues.add({ code: 'XYZ789', name: 'Due', mid: 'm4' });
    QZ.leagues.add({ code: 'GHNE22', name: 'Chiusa', mid: 'm1' });
    srv.setDown(true);
    const r = await QZ.leagues.submit('giocatoredelgiorno', 11, { win: false, tries: 6, hints: 1 });
    assert.equal(r.sent, 0);
    assert.equal(QZ.leagues.pending().length, 1, 'resta in sospeso');
    srv.setDown(false);
    const again = await QZ.leagues.submit('giocatoredelgiorno', 11, { win: true, tries: 1, hints: 0 });
    assert.equal(again.sent, 2);
    const last = srv.calls[srv.calls.length - 1];
    assert.deepEqual(last.codes.sort(), ['ABC234', 'GHNE22', 'XYZ789']);
    assert.deepEqual(last.result, { win: false, tries: 6, hints: 1 }, 'vale il primo risultato, non quello rigiocato');
    assert.equal(QZ.leagues.pending().length, 0, 'anche la lega chiusa non si riprova');
    const n = srv.calls.length;
    await QZ.leagues.submit('giocatoredelgiorno', 11, { win: true, tries: 1, hints: 0 });
    assert.equal(srv.calls.length, n, 'stesso N°: niente nuova richiesta');
    await QZ.leagues.submit('giocatoredelgiorno', 0, {});
    await QZ.leagues.submit('Boh!', 3, {});
    assert.equal(srv.calls.length, n, 'N° e gioco non validi: niente richiesta');
});

test('Calciatore del Giorno: manda alle leghe solo la partita del giorno', () => {
    const js = read('assets/games/giocatoredelgiorno.js');
    const calls = [...js.matchAll(/QZ\.leagues\.submit\(/g)];
    assert.equal(calls.length, 1);
    const fin = js.slice(js.indexOf('function finish('));
    const daily = fin.slice(fin.indexOf("if (S.mode === 'daily') {"), fin.indexOf("} else if (S.mode === 'archive')"));
    assert.match(daily, /QZ\.leagues\.submit\(GAME, S\.n, \{ win: !!win, tries: tries, hints: hintCount\(S\) \}\)/);
});

/* ---------- server ---------- */

function findPhp() {
    const cands = [process.env.PHP_BIN, path.join(root, '..', '..', 'istituto-amaretti', 'tools', 'php', 'php.exe'), 'php'].filter(Boolean);
    for (const c of cands) {
        const r = spawnSync(c, ['-v'], { encoding: 'utf8' });
        if (r.status === 0) return c;
    }
    return null;
}

test('api/leghe.php: cartella protetta e PHP compatibile con la 8.0', () => {
    const api = read('api/leghe.php');
    assert.match(api, /Require all denied/);
    assert.match(api, /flock\(\$fh, LOCK_EX\)/);
    const both = api + read('api/leghe-core.php');
    assert.doesNotMatch(both, /\benum\s+\w+|\breadonly\b|\):\s*never\b|array_is_list|\w+\(\.\.\.\)/);
});

test('api/leghe-core.php: regole della lega (con PHP)', (t) => {
    const php = findPhp();
    if (!php) { t.skip('PHP non trovato'); return; }
    const r = spawnSync(php, [path.join(__dirname, 'leghe-core.test.php')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^ok/m);
    for (const f of ['leghe.php', 'leghe-core.php']) {
        const l = spawnSync(php, ['-l', path.join(root, 'api', f)], { encoding: 'utf8' });
        assert.equal(l.status, 0, l.stdout + l.stderr);
    }
});

test('api/leghe.php: una lega vera su un PHP locale, con le date simulate', async (t) => {
    const php = findPhp();
    if (!php) { t.skip('PHP non trovato'); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-leghe-'));
    const port = 8200 + Math.floor(Math.random() * 90);
    const srv = spawn(php, ['-S', '127.0.0.1:' + port, '-t', root], { env: Object.assign({}, process.env, { QZ_LEGHE_DIR: dir, QZ_LEGHE_TEST: '1' }), stdio: 'ignore' });
    t.after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
    const URL = 'http://127.0.0.1:' + port + '/api/leghe.php';
    const rome = (s) => Math.floor(new Date(s + '+01:00').getTime() / 1000);   // novembre: UTC+1
    let now = rome('2026-11-23T10:00:00');
    const call = async (body, get) => {
        const r = await fetch(get ? URL + get : URL, get ? { headers: { 'X-Test-Now': String(now) } } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Now': String(now) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
        return Object.assign(await r.json(), { status: r.status });
    };
    for (let i = 0; i < 50; i++) {
        try { await fetch(URL); break; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
    }
    const tok = (k) => String(k).repeat(32).slice(0, 32);
    const G = 'giocatoredelgiorno';

    const c = await call({ a: 'create', name: 'Calcetto del giovedì', nick: 'Fede', tok: tok('a') });
    assert.equal(c.ok, 1, JSON.stringify(c));
    assert.match(c.code, /^[A-Z2-9]{6}$/);
    const code = c.code;
    assert.equal((await call({ a: 'create', name: 'X', nick: 'Fede', tok: tok('a') })).status, 400, 'nome troppo corto');
    assert.equal((await call({ a: 'join', code, nick: 'Gio', tok: 'corto' })).status, 400, 'gettone non valido');
    assert.equal((await call({ a: 'join', code, nick: 'Gio', tok: tok('b') })).ok, 1);
    assert.equal((await call({ a: 'join', code, nick: 'Ale', tok: tok('c') })).ok, 1);
    assert.equal((await call({ a: 'join', code, nick: 'gio', tok: tok('d') })).status, 400, 'soprannome doppio');
    assert.equal((await call({ a: 'join', code: 'ZZZZ22', nick: 'Gio', tok: tok('b') })).status, 404, 'lega inesistente');

    // un invio a piu' leghe: Gio e' anche in una seconda lega
    const c2 = await call({ a: 'create', name: 'Ufficio', nick: 'Giovanni', tok: tok('b') });
    let s = await call({ a: 'submit', codes: [code, c2.code], tok: tok('b'), game: G, n: 8, result: { win: true, tries: 1, hints: 0 } });
    assert.deepEqual([s.res[code].p, s.res[c2.code].p], [10, 10]);
    s = await call({ a: 'submit', codes: [code], tok: tok('b'), game: G, n: 8, result: { win: true, tries: 6, hints: 0 } });
    assert.equal(s.res[code].dup, 1, 'il secondo invio non conta');
    s = await call({ a: 'submit', codes: [code], tok: tok('a'), game: G, n: 6, result: { win: true, tries: 1, hints: 0 } });
    assert.ok(s.res[code].err, 'N° troppo vecchio');
    s = await call({ a: 'submit', codes: [c2.code], tok: tok('a'), game: G, n: 8, result: { win: true, tries: 1, hints: 0 } });
    assert.equal(s.res[c2.code].gone, 1, 'non membro');
    s = await call({ a: 'submit', codes: [code], tok: tok('a'), game: G, n: 8, result: { win: true, tries: 9, hints: 0 } });
    assert.ok(s.res[code].err, 'risultato impossibile');

    // la settimana 23-29 novembre
    const plays = [['2026-11-23', 'a', 2, 0], ['2026-11-24', 'a', 3, 1], ['2026-11-24', 'c', 0, 0], ['2026-11-25', 'a', 4, 0], ['2026-11-25', 'b', 2, 0], ['2026-11-26', 'c', 5, 0], ['2026-11-27', 'a', 1, 0]];
    for (const [day, who, tries, hints] of plays) {
        now = rome(day + 'T21:30:00');
        const n = Math.round((Date.parse(day) - Date.parse('2026-11-16')) / 86400000) + 1;
        s = await call({ a: 'submit', codes: [code], tok: tok(who), game: G, n, result: { win: tries > 0, tries: tries || 6, hints } });
        assert.equal(s.res[code].ok, 1, day + ' ' + who + ' ' + JSON.stringify(s));
    }
    now = rome('2026-11-27T22:00:00');
    let st = await call(null, '?code=' + code + '&tok=' + tok('a'));
    assert.equal(st.member, 1);
    assert.equal(st.monday, 0);
    assert.deepEqual(st.week.rows.map((r) => [r.nick, r.p]), [['Fede', 8 + 5 + 5 + 10], ['Gio', 18], ['Ale', 4]]);
    assert.equal(st.pagellino, null, 'la settimana prima nessuno giocava');
    const outsider = await call(null, '?code=' + code + '&tok=' + tok('z'));
    assert.deepEqual([outsider.member, outsider.count, outsider.members], [0, 3, undefined], 'chi non e membro vede solo nome e posti');

    // lunedi' 30: il pagellino
    now = rome('2026-11-30T08:00:00');
    st = await call(null, '?code=' + code + '&tok=' + tok('b'));
    assert.equal(st.monday, 1);
    assert.equal(st.pagellino.from, '2026-11-23');
    assert.equal(st.pagellino.winners[0].nick, 'Fede');
    assert.equal(st.pagellino.streak.nick, 'Fede');
    assert.equal(st.pagellino.streak.days, 3);
    assert.equal(st.week.rows[0].g, 0, 'la settimana nuova riparte da zero');
    assert.equal(st.month.rows[0].p, 28);

    // niente gettoni in chiaro nei file, cartella con .htaccess
    const files = fs.readdirSync(dir);
    assert.ok(files.includes('.htaccess'));
    const raw = fs.readFileSync(path.join(dir, 'L-' + code + '.json'), 'utf8');
    assert.ok(!raw.includes(tok('a')) && !raw.includes(tok('b')));

    // limiti: corpo troppo grande, 30 membri
    assert.equal((await call(JSON.stringify({ a: 'join', code, nick: 'x'.repeat(5000), tok: tok('e') }))).status, 413);
    for (let i = 0; i < 27; i++) {
        const j = await call({ a: 'join', code, nick: 'Riserva ' + i, tok: (i + 100).toString(16).padStart(32, 'f') });
        assert.equal(j.ok, 1, JSON.stringify(j));
    }
    assert.match((await call({ a: 'join', code, nick: 'Uno di troppo', tok: tok('e') })).err, /completo/);

    // uscita e capitano
    const k = await call({ a: 'kick', code, tok: tok('b'), mid: 'm1' });
    assert.match(k.err, /Solo chi ha creato/);
    const lv = await call({ a: 'leave', code, tok: tok('a') });
    assert.equal(lv.left, 1);
    st = await call(null, '?code=' + code + '&tok=' + tok('b'));
    assert.equal(st.owner, 'm2', 'presidente passato a Gio');
    assert.equal(st.members.length, 29);
});
