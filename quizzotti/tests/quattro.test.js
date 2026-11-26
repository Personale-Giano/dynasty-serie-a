/* Quattro per Quattro (assets/db-quattro.js): struttura delle schede e
   impronta di quelle gia' pubblicate. Il database e' a sola aggiunta: i
   progressi dei giocatori sono salvati per numero di scheda, quindi le
   schede 1..N non devono cambiare. Quando si aggiungono schede nuove in
   fondo, si aggiunge qui una riga a PUBBLICATE con il nuovo totale e la
   sua impronta (le righe vecchie restano). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const { quattroSchede } = require(path.join('..', 'assets', 'db-quattro.js'));

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TEMI = ['serie-a', 'azzurri', 'estero', 'storia', 'curiosita'];

test('almeno 100 schede, numerate da 1 senza buchi', () => {
    assert.ok(Array.isArray(quattroSchede));
    assert.ok(quattroSchede.length >= 100, `solo ${quattroSchede.length} schede`);
    quattroSchede.forEach((p, i) => assert.equal(p.n, i + 1, `scheda in posizione ${i + 1} ha numero ${p.n}`));
});

test('ogni scheda: titolo, tema, 4 gruppi da 4 nomi con etichetta', () => {
    for (const p of quattroSchede) {
        const at = `N° ${p.n}`;
        assert.ok(typeof p.titolo === 'string' && p.titolo.trim(), `${at}: titolo vuoto`);
        assert.ok(TEMI.includes(p.tema), `${at}: tema sconosciuto ${p.tema}`);
        assert.equal(p.gruppi.length, 4, `${at}: servono 4 gruppi`);
        for (const g of p.gruppi) {
            assert.ok(typeof g.nome === 'string' && g.nome.trim().length >= 3, `${at}: etichetta vuota`);
            assert.equal(g.voci.length, 4, `${at} «${g.nome}»: servono 4 nomi`);
            g.voci.forEach((v) => assert.ok(typeof v === 'string' && v.trim() && v === v.trim(), `${at} «${g.nome}»: nome vuoto o con spazi`));
        }
    }
});

test('difficoltà 1, 2, 3 e 4 tutte presenti, una per gruppo', () => {
    for (const p of quattroSchede) {
        assert.deepEqual(p.gruppi.map((g) => g.d).sort(), [1, 2, 3, 4], `N° ${p.n}: difficoltà non valide`);
    }
});

test('16 nomi distinti per scheda (anche senza accenti e maiuscole) ed etichette diverse', () => {
    for (const p of quattroSchede) {
        const voci = p.gruppi.flatMap((g) => g.voci).map(norm);
        const dup = voci.filter((v, i) => voci.indexOf(v) !== i);
        assert.deepEqual(dup, [], `N° ${p.n}: nomi ripetuti -> ${dup.join(', ')}`);
        const nomi = p.gruppi.map((g) => norm(g.nome));
        assert.equal(new Set(nomi).size, 4, `N° ${p.n}: due gruppi con la stessa etichetta`);
    }
});

test('nessun titolo di scheda ripetuto', () => {
    const t = quattroSchede.map((p) => norm(p.titolo));
    assert.equal(new Set(t).size, t.length);
});

test('le schede pubblicate non sono cambiate (impronta sha256)', () => {
    const PUBBLICATE = [
        { fino: 42, sha256: '38c50cf59d8bda38279c1d411d61701939a453f7ff02c6da49c29a0cbc296799' },
        { fino: 52, sha256: '0c96ae9554c58740932b454db6595fd080d3ebccab542164c30516ad7197dcf0' },
        { fino: 100, sha256: '5839d9dbf3cc10f5ffab904cf3636bbad24a9eed410c1995f95bbfbf4a556c48' }
    ];
    for (const { fino, sha256 } of PUBBLICATE) {
        assert.ok(quattroSchede.length >= fino, `mancano schede: erano ${fino}`);
        const got = crypto.createHash('sha256').update(JSON.stringify(quattroSchede.slice(0, fino))).digest('hex');
        assert.equal(got, sha256, `le schede N° 1-${fino} sono cambiate rispetto a quelle pubblicate`);
    }
});

test('ogni tema ha almeno cinque schede', () => {
    for (const t of TEMI) {
        const n = quattroSchede.filter((p) => p.tema === t).length;
        assert.ok(n >= 5, `tema ${t}: solo ${n} schede`);
    }
});

test('nessuna parola di una casella oltre i 14 caratteri (sul telefono non entrerebbe)', () => {
    for (const p of quattroSchede.slice(42)) {
        for (const v of p.gruppi.flatMap((g) => g.voci)) {
            for (const w of v.split(/\s+/)) assert.ok(w.length <= 14, `N° ${p.n}: «${w}» troppo lunga`);
        }
    }
});

/* ---------- Le schede nuove (dal N° 53): fatti verificati, trappole, varieta' ---------- */
const { verifica } = require(path.join('..', 'scripts', 'verifica-quattro.js'));
const { quattroErrata } = require(path.join('..', 'assets', 'db-quattro.js'));

test('dal N° 53 nessun nome sta in due gruppi (fatti in scripts/verifica-quattro.js) e le trappole sono sensate', () => {
    const r = verifica(quattroSchede);
    assert.deepEqual(r.errori, []);
});

test('tra le schede verificate solo la 8 e la 29 hanno un nome in due gruppi, e l\'errata copre proprio quei nomi', () => {
    const r = verifica(quattroSchede);
    const doppi = {};
    for (const p of quattroSchede) if (r.doppi[p.titolo]) doppi[p.n] = r.doppi[p.titolo].slice().sort();
    assert.deepEqual(Object.keys(doppi).map(Number), [8, 29]);
    for (const n of Object.keys(doppi)) {
        const anche = quattroErrata[n].reduce((a, e) => a.concat(e.anche), []).sort();
        assert.deepEqual(anche, doppi[n], `N° ${n}: errata diversa dai nomi doppi`);
    }
});

test('errata: struttura valida, nomi presi da altri gruppi della stessa scheda', () => {
    for (const [n, list] of Object.entries(quattroErrata)) {
        const p = quattroSchede[Number(n) - 1];
        assert.ok(p && Number(n) <= 52, `errata per una scheda non pubblicata: ${n}`);
        for (const e of list) {
            assert.ok(p.gruppi[e.gruppo], `N° ${n}: gruppo ${e.gruppo} inesistente`);
            assert.ok(typeof e.nota === 'string' && e.nota.length > 20, `N° ${n}: nota mancante`);
            for (const v of e.anche) {
                const gi = p.gruppi.findIndex((g) => g.voci.includes(v));
                assert.ok(gi >= 0 && gi !== e.gruppo, `N° ${n}: «${v}» deve stare in un altro gruppo della scheda`);
            }
        }
    }
});

test('nelle schede nuove nessun nome compare più di due volte', () => {
    const c = {};
    for (const p of quattroSchede.slice(52)) for (const v of p.gruppi.flatMap((g) => g.voci)) c[norm(v)] = (c[norm(v)] || 0) + 1;
    const troppi = Object.entries(c).filter(([, k]) => k > 2).map(([v, k]) => `${v} (${k})`);
    assert.deepEqual(troppi, []);
});

test('i nomi già usati quattro o più volte nelle schede 1-52 nelle nuove compaiono al massimo una volta', () => {
    const vecchi = {}, nuovi = {};
    for (const p of quattroSchede.slice(0, 52)) for (const v of p.gruppi.flatMap((g) => g.voci)) vecchi[norm(v)] = (vecchi[norm(v)] || 0) + 1;
    for (const p of quattroSchede.slice(52)) for (const v of p.gruppi.flatMap((g) => g.voci)) nuovi[norm(v)] = (nuovi[norm(v)] || 0) + 1;
    const troppi = Object.keys(nuovi).filter((v) => (vecchi[v] || 0) >= 4 && nuovi[v] > 1);
    assert.deepEqual(troppi, []);
});

/* ---------- Motore: errata e scheda del giorno ---------- */
const Core = require(path.join('..', 'assets', 'games', 'quattro.js'));

test('errata: la quaterna alternativa della 8 e della 29 non è un errore, le altre sì', () => {
    const p8 = quattroSchede[7], p29 = quattroSchede[28];
    const alt8 = Core.errataMatch(quattroErrata, p8, ['Immobile', 'Toni', 'Di Natale', 'Ibrahimović']);
    assert.ok(alt8);
    assert.deepEqual(alt8.anche, ['Ibrahimović']);
    assert.ok(Core.errataMatch(quattroErrata, p8, ['Immobile', 'Vieri', 'Ibrahimović', 'Signori']));
    assert.equal(Core.errataMatch(quattroErrata, p8, ['Immobile', 'Toni', 'Di Natale', 'Signori']), null, 'il gruppo giusto lo gestisce il gioco');
    assert.equal(Core.errataMatch(quattroErrata, p8, ['Immobile', 'Toni', 'Di Natale', 'Pirlo']), null);
    assert.ok(Core.errataMatch(quattroErrata, p29, ['Albertosi', 'Zenga', 'Pagliuca', 'Zoff']));
    assert.equal(Core.errataMatch(quattroErrata, p29, ['Albertosi', 'Zenga', 'Pagliuca', 'Facchetti']), null);
    assert.equal(Core.errataMatch(quattroErrata, quattroSchede[0], quattroSchede[0].gruppi[0].voci.slice(0, 3).concat('Pirlo')), null);
});

test('scheda del giorno: parte il 27/11/2026 ed è una funzione pura della data di Roma', () => {
    assert.equal(Core.START, '2026-11-27');
    assert.equal(Core.dayIndex('2026-11-27'), 0);
    assert.equal(Core.dailyNumber('2026-11-27'), 1);
    assert.equal(Core.dailyNumber('2026-12-27'), 31);
    assert.equal(Core.dateOf(31), '2026-12-27');
    const first = Core.dailyIndex('2026-11-27');
    assert.equal(Core.dailyIndex('2026-11-27'), first, 'sempre uguale');
    assert.equal(Core.dailyIndex('2026-11-01'), first, 'prima del via vale il primo giorno');
    // a Roma il 27 inizia alle 23:00 UTC del 26 (ora solare) e il 28 marzo 2027 alle 23:00 UTC del 27 (ora legale dal 28)
    assert.equal(Core.dailyIndex(new Date('2026-11-26T23:30:00Z')), first);
    assert.equal(Core.romeDate(new Date('2026-11-26T22:59:00Z')), '2026-11-26');
    assert.equal(Core.romeDate(new Date('2027-07-01T22:30:00Z')), '2027-07-02');
});

test('scheda del giorno: niente ripetizioni finché il giro non finisce, tutte schede esistenti', () => {
    assert.ok(Core.poolFor(0) <= quattroSchede.length, 'la rotazione non può chiedere schede che non ci sono');
    for (const r of Core.ROTAZIONI) assert.ok(r.schede <= quattroSchede.length);
    let day = 1;
    for (let g = 0; g < 3; g++) {
        const size = Core.poolFor(g), seen = new Set();
        for (let i = 0; i < size; i++, day++) {
            const n = Core.dailyIndex(Core.dateOf(day));
            assert.ok(Number.isInteger(n) && n >= 1 && n <= size, `giorno ${day}: scheda ${n}`);
            assert.ok(!seen.has(n), `giorno ${day}: la scheda ${n} si ripete nel giro ${g}`);
            seen.add(n);
        }
        assert.equal(seen.size, size);
        if (g > 0) assert.notEqual(Core.giro(g)[0], Core.giro(g - 1)[Core.giro(g - 1).length - 1], 'stessa scheda due giorni di fila');
    }
});

test('scheda del giorno: caselle nello stesso ordine per tutti, serie e quadratini senza nomi', () => {
    const p = quattroSchede[Core.dailyIndex('2026-11-27') - 1];
    const voci = p.gruppi.flatMap((g) => g.voci);
    const a = Core.dailyOrder(voci, '2026-11-27');
    assert.deepEqual(a, Core.dailyOrder(voci, '2026-11-27'));
    assert.deepEqual(a.slice().sort(), voci.slice().sort());
    assert.notDeepEqual(a, voci);
    const done = { '2026-11-27': { win: true }, '2026-11-28': { win: true }, '2026-11-29': { win: false }, '2026-11-30': { win: true } };
    assert.equal(Core.dailyStreak(done, '2026-11-28'), 2);
    assert.equal(Core.dailyStreak(done, '2026-11-30'), 1);
    assert.equal(Core.dailyStreak(done, '2026-12-01'), 1, 'oggi non ancora giocata: conta fino a ieri');
    assert.equal(Core.dailyStreak(done, '2026-12-02'), 0);
    const txt = Core.shareText(p, [[1, 1, 1, 1], [2, 3, 2, 2], [2, 2, 2, 2], [3, 3, 3, 3], [4, 4, 4, 4]], 4, 1, { daily: { num: 1, ymd: '2026-11-27' }, streak: 2 });
    assert.match(txt, /^Quattro per Quattro · Scheda del giorno N° 1 \(27\/11\/2026\)\n🟩🟩🟩🟩\n🟨🟦🟨🟨\n/);
    assert.match(txt, /Chiusa con 1 errore\. Serie di 2 giorni\. Tu\?$/);
    for (const v of voci) assert.ok(!txt.includes(v), `il testo da condividere svela «${v}»`);
    assert.match(Core.shareText(p, [[1, 2, 3, 4]], 0, 4, null), /^Quattro per Quattro N° \d+ · .+\n🟩🟨🟦🟥\nPersa con 0 gruppi su 4\. Tu\?$/);
});

test('lo script del gioco compila', () => {
    const fs = require('node:fs');
    const vm = require('node:vm');
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'quattro.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(src, { filename: 'quattro.js' }));
});
