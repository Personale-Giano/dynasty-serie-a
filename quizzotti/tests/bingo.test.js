/* Bingo della Partita: integrita' del database degli eventi, generatore
   delle cartelle con seme (v1 congelata, v2 nuova) e simulazione delle
   partite (assets/games/bingo.js esporta il nucleo).

   SIMULAZIONE (26 novembre 2026), 20.000 partite per riga, stesso modello per
   v1 e v2: ogni evento succede con la sua probabilita' stimata `p`, una volta
   sola e in modo indipendente dagli altri, al primo arrivo di un processo di
   Poisson dentro la sua finestra `t` (un evento quasi certo arriva presto, uno
   da finale dopo il 75'). "Riga" = minuto in cui qualcuno fa riga; "pari" =
   premio diviso tra piu' giocatori allo stesso evento.

                    giocatori  riga (min)  riga pari  1a riga solo   bingo
                                                      da diagonali
   v1 (prima)           1        67'         -          84%         0 su 20.000
                        3        52'        4,6%        84%         1 su 20.000
                        4        48'        5,6%        83%         0 su 20.000
                        6        42'        6,9%        83%         2 su 20.000
   v2 (dopo)            1        79'         -           4%         1 su 22
                        3        71'        3,2%         2%         1 su 7,5
                        4        68'        4,2%         1%         1 su 5,6
                        6        65'        6,3%         1%         1 su 4,0
   v1: riga il 99% delle volte con 3+ giocatori, quasi sempre su una diagonale
   (8 eventi quasi certi), bingo mai: 4 rari per cartella. v2: la riga arriva
   verso il 70' (ogni linea ha una casella da finale), la doppia verso
   l'80', il bingo una partita su 6-8 con 3-4 giocatori; senza lo spareggio
   sulle caselle segnate i pari della riga sarebbero 11-16%.
   Il test "simulazione" qui sotto rifa' lo stesso conto con meno partite. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const { bingoEvents } = require(path.join('..', 'assets', 'db-bingo.js'));
const Core = require(path.join('..', 'assets', 'games', 'bingo.js'));

const CATS = ['Campo', 'Arbitro e VAR', 'Panchina', 'Telecronaca e TV', 'Tifosi'];
const V1 = Core.VERSIONS[1], V2 = Core.VERSIONS[2];
const texts = (card) => card.map((e) => e.text);
const mirrorOf = (pat) => pat.map((_, i) => pat[Math.floor(i / 4) * 4 + (3 - (i % 4))]);

test('db-bingo.js: testi brevi, categoria valida, campi della v1 e della v2 coerenti', () => {
    assert.ok(bingoEvents.length >= V2.pool, `eventi: ${bingoEvents.length}`);
    for (const e of bingoEvents) {
        assert.equal(typeof e.text, 'string');
        assert.ok(e.text.trim().length > 0, 'testo vuoto');
        assert.equal(e.text, e.text.trim(), `spazi attorno a "${e.text}"`);
        assert.ok(e.text.length <= 40, `testo troppo lungo (${e.text.length}): "${e.text}"`);
        // ogni parola deve stare su una riga della casella
        for (const w of e.text.split(/\s+/)) assert.ok(w.length <= 12, `parola troppo lunga per la casella: "${w}"`);
        assert.ok([1, 2, 3].includes(e.rarity), `rarita' non valida per "${e.text}"`);
        assert.ok(CATS.includes(e.cat), `categoria non valida per "${e.text}": ${e.cat}`);
        if (e.g !== undefined) assert.ok(typeof e.g === 'string' && e.g.length > 0, `argomento non valido per "${e.text}"`);
        assert.ok(Number.isInteger(e.p) && e.p >= 1 && e.p <= 99, `probabilita' non valida per "${e.text}"`);
        if (e.t !== undefined) {
            assert.ok(Array.isArray(e.t) && e.t.length === 2 && e.t[0] >= 0 && e.t[0] < e.t[1] && e.t[1] <= 97, `finestra non valida per "${e.text}"`);
        }
        if (e.ritirato !== undefined) {
            assert.equal(e.ritirato, 2, `"${e.text}": ritirato vale la versione da cui e' fuori`);
            assert.ok(e.r2 === undefined && e.f2 === undefined, `"${e.text}" e' ritirato ma ha ancora r2/f2`);
            continue;
        }
        // r2 dalla probabilita': >= 90 comune, >= 70 medio, >= 45 raro, sotto fuori dalle v2
        const want = e.p >= 90 ? 1 : e.p >= 70 ? 2 : e.p >= 45 ? 3 : undefined;
        assert.equal(e.r2, want, `"${e.text}" (p ${e.p}): r2 dovrebbe essere ${want}`);
        if (e.f2 !== undefined) {
            assert.equal(e.f2, true);
            assert.ok(e.p >= 70 && e.t && e.t[0] >= 50, `"${e.text}": una casella da finale e' quasi certa e arriva tardi`);
        }
    }
});

test('db-bingo.js: niente eventi duplicati (anche a meno di maiuscole e spazi)', () => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const seen = new Map();
    for (const e of bingoEvents) {
        const k = norm(e.text);
        assert.ok(!seen.has(k), `duplicato: "${e.text}" / "${seen.get(k)}"`);
        seen.set(k, e.text);
    }
});

test('db-bingo.js: le prime 148 voci (quelle delle cartelle v1) non sono cambiate', () => {
    const v1 = bingoEvents.slice(0, V1.pool).map((e) => [e.text, e.rarity, e.cat, e.g || null]);
    const sha = crypto.createHash('sha256').update(JSON.stringify(v1)).digest('hex');
    assert.equal(sha, '64285091b538e2726969d2b6d013f4614ff2cd3cea51abbc406206087e0e10f1',
        'testo, rarity, categoria o argomento di una voce v1 cambiati: le cartelle dei codici di 4 caratteri non sarebbero piu\' le stesse');
    // gli eventi ritirati per «sostituirli» restano al loro posto
    for (const t of ["Il telecronista dice «zona Cesarini»", 'Mappa di calore di un giocatore', 'Invasione di campo', 'Due rigori nella stessa partita', 'Il portiere va a saltare in area']) {
        const e = bingoEvents.find((x) => x.text === t);
        assert.ok(e && e.ritirato === 2, `"${t}" deve restare nel database, ritirato dalla v2`);
    }
});

test('db-bingo.js: abbastanza eventi per ogni classe di ogni versione', () => {
    for (const v of [1, 2]) {
        const V = Core.VERSIONS[v];
        const evs = bingoEvents.slice(0, V.pool);
        for (const k of Object.keys(V.mix).map(Number)) {
            const pool = evs.filter((e) => Core.classOf(e, v) === k);
            // almeno il doppio di quelli che servono per una cartella, per avere varieta'
            assert.ok(pool.length >= V.mix[k] * 2, `v${v}, classe ${k}: ${pool.length} eventi, ne servono almeno ${V.mix[k] * 2}`);
            const free = pool.filter((e) => !e.g).length + new Set(pool.filter((e) => e.g).map((e) => e.g)).size;
            assert.ok(free >= V.mix[k], `v${v}, classe ${k}: troppi eventi legati allo stesso argomento`);
        }
    }
    for (const c of CATS) assert.ok(bingoEvents.filter((e) => e.cat === c && !e.ritirato).length >= 10, `categoria ${c} con meno di 10 eventi attivi`);
});

test('schema v1 (congelato): 8 comuni, 4 medi, 4 rari, diagonali tutte comuni', () => {
    assert.equal(Core.PATTERN, V1.pattern);
    assert.deepEqual(V1.mix, { 1: 8, 2: 4, 3: 4 });
    assert.deepEqual(V1.pattern, [1, 3, 2, 1, 2, 1, 1, 3, 3, 1, 1, 2, 1, 2, 3, 1]);
    assert.equal(V1.pool, 148);
    assert.equal(V1.tier, 'rarity');
    assert.equal(Core.LINES.length, 10);
});

test('schema v2: ogni linea ha una casella da finale, 2 rari al massimo e mai nella stessa linea', () => {
    const count = {};
    V2.pattern.forEach((k) => { count[k] = (count[k] || 0) + 1; });
    assert.deepEqual(count, V2.mix);
    assert.equal(V2.mix[3], 2);
    for (const line of Core.LINES) {
        const cls = line.map((i) => V2.pattern[i]);
        assert.equal(cls.filter((k) => k === 4).length >= 1, true, `linea ${line} senza casella da finale`);
        assert.ok(cls.filter((k) => k === 3).length <= 1, `linea ${line} con due rari`);
        assert.ok(cls.filter((k) => k === 1).length <= 2, `linea ${line} troppo facile`);
    }
    // diagonali miste: 2 da finale, 1 comune, 1 medio
    for (const line of Core.LINES.slice(8)) assert.deepEqual(line.map((i) => V2.pattern[i]).sort(), [1, 2, 4, 4]);
});

test('codici: v1 di 4 caratteri, v2 di 5 che iniziano con 2, alfabeto senza 0, O, 1, I', () => {
    assert.equal(Core.codeVersion('K7QX'), 1);
    assert.equal(Core.codeVersion(' k7-qx '), 1);
    assert.equal(Core.codeVersion('2K7QX'), 2);
    assert.equal(Core.codeVersion('2-k7qx'), 2);
    assert.equal(Core.codeVersion('3K7QX'), 0, 'non c\'e\' ancora una v3');
    assert.equal(Core.codeVersion('1K7QX'), 0);
    assert.equal(Core.codeVersion('AK7QX'), 0);
    assert.ok(!Core.validCode('K7Q'));
    assert.ok(!Core.validCode('K7Q0'));
    assert.ok(!Core.validCode('2K7Q0'));
    assert.ok(!Core.validCode('OIOI'));
    assert.ok(!Core.validCode('2K7QXY'));
    assert.equal(Core.CURRENT, 2);
    const rnd = Core.rng(42);
    for (let i = 0; i < 200; i++) {
        const c = Core.randomCode(rnd);
        assert.equal(c.length, 5);
        assert.equal(Core.codeVersion(c), 2);
        assert.equal(Core.codeVersion(Core.randomCode(rnd, 1)), 1);
    }
    assert.throws(() => Core.makeCard('K7Q0', bingoEvents));
});

test('generazione con seme: stesso codice = stessa cartella, anche scritto minuscolo', () => {
    for (const code of ['K7QX', '2K7QX']) {
        const a = texts(Core.makeCard(code, bingoEvents));
        assert.deepEqual(a, texts(Core.makeCard(code, bingoEvents)));
        assert.deepEqual(a, texts(Core.makeCard(code.toLowerCase(), bingoEvents)));
        assert.notDeepEqual(a, texts(Core.makeCard(code.slice(0, -1) + 'Y', bingoEvents)));
    }
    // il 2 davanti cambia versione, quindi cartella
    assert.notDeepEqual(texts(Core.makeCard('K7QX', bingoEvents)), texts(Core.makeCard('2K7QX', bingoEvents)));
});

test('cartelle v1 congelate: i codici gia\' dati escono identici', () => {
    assert.equal(Core.LEGACY_POOL, 113);
    // codice K7QX con il database di 113 eventi (partite salvate prima di novembre 2026)
    const legacy = ["Gol nel secondo tempo", "Giocatore con la testa fasciata", "Tifoso inquadrato con un cartello", "Inquadrano le riserve che si scaldano", "L'arbitro va a rivedere al monitor", "La squadra va a salutare la curva", "Giocatore a terra, entrano i medici", "Ola sugli spalti", "Il telecronista dice «zona Cesarini»", "Spray per segnare la barriera", "Esultanza sotto la curva", "Rimessa laterale lunga in area", "Replay del gol da un'altra camera", "Rigore assegnato", "Ammonito un portiere", "Una squadra fa tutti e 5 i cambi"];
    assert.deepEqual(texts(Core.makeCard('K7QX', bingoEvents, Core.LEGACY_POOL)), legacy);
    // codice M3NP con i 148 eventi di prima della v2: le voci aggiunte dopo non entrano nelle v1
    const full = ["Almeno due gol in partita", "Segnano tutte e due le squadre", "Gol del pareggio dopo l'80'", "Un cambio dopo l'85'", "«Gol dell'ex» in telecronaca", "Striscione inquadrato in TV", "Tifoso con le mani nei capelli", "Mostrano le linee del fuorigioco", "Gol da fuori area", "Mostrano la classifica", "La squadra va a salutare la curva", "Due legni nella stessa partita", "L'arbitro fa giocare il vantaggio", "Giallo per simulazione", "Il commento tecnico critica l'arbitro", "Inquadrano il settore ospiti"];
    assert.deepEqual(texts(Core.makeCard('M3NP', bingoEvents)), full);
    assert.deepEqual(texts(Core.makeCard('M3NP', bingoEvents, 148)), full);
    assert.deepEqual(texts(Core.makeCard('M3NP', bingoEvents, 999)), full);
    // le v1 usano anche gli eventi ritirati: la cartella e' quella di allora
    const rnd = Core.rng(3);
    let retired = 0;
    for (let i = 0; i < 300; i++) retired += Core.makeCard(Core.randomCode(rnd, 1), bingoEvents).filter((e) => e.ritirato).length;
    assert.ok(retired > 0);
});

test('cartelle v2 congelate: aggiungere eventi in fondo non le cambia', () => {
    const snap = ["Annunciano il migliore in campo", "Spray per segnare la barriera", "Segnano tutte e due le squadre", "Fuorigioco fischiato", "Grafica del possesso palla", "Inquadrano un bambino sugli spalti", "Un cambio dopo l'85'", "Replay del gol da un'altra camera", "Grafica con le formazioni", "Recupero di 3+ minuti nel 2° tempo", "Tiro alto sopra la traversa", "Esce il capitano: fascia a un altro", "Rigore reclamato, si gioca", "Inquadratura dalla spidercam", "Striscione inquadrato in TV", "Parata del portiere dopo l'80'"];
    assert.deepEqual(texts(Core.makeCard('2K7QX', bingoEvents)), snap);
    const more = bingoEvents.concat([{ text: 'Evento di prova', rarity: 1, cat: 'Campo', p: 99, r2: 1 }, { text: 'Altro evento', rarity: 3, cat: 'Tifosi', p: 95, f2: true, t: [80, 97], r2: 1 }]);
    for (const code of ['2AAAA', '2K7QX', '2ZZ99', '2M3NP', 'AAAA', 'M3NP']) {
        assert.deepEqual(texts(Core.makeCard(code, more)), texts(Core.makeCard(code, bingoEvents)));
        assert.deepEqual(texts(Core.makeCard(code, more, more.length)), texts(Core.makeCard(code, bingoEvents)));
    }
});

test('generazione v2: cartelle bilanciate, senza ripetuti, argomenti doppi ne\' eventi ritirati', () => {
    const rnd = Core.rng(2026);
    const distinct = new Set();
    const mirrored = mirrorOf(V2.pattern);
    for (let n = 0; n < 2000; n++) {
        const code = Core.randomCode(rnd);
        const card = Core.makeCard(code, bingoEvents);
        assert.equal(card.length, 16);
        const t = texts(card);
        assert.equal(new Set(t).size, 16, `evento ripetuto nella cartella ${code}`);
        const groups = card.filter((e) => e.g).map((e) => e.g);
        assert.equal(new Set(groups).size, groups.length, `due eventi dello stesso argomento nella cartella ${code}`);
        assert.ok(card.every((e) => !e.ritirato && e.r2), `evento ritirato o senza r2 nella cartella ${code}`);
        const cls = card.map((e) => Core.classOf(e, 2)).join();
        assert.ok(cls === V2.pattern.join() || cls === mirrored.join(), `schema sbagliato nella cartella ${code}`);
        // rari mostrati in cartella: al massimo 2
        assert.ok(card.filter((e) => Core.rarityOf(e, 2) === 3).length <= 2, `troppi rari nella cartella ${code}`);
        distinct.add(t.join('|'));
    }
    assert.ok(distinct.size > 1990, 'troppe cartelle uguali tra codici diversi');
});

test('generazione v1: lo schema di sempre (eventualmente specchiato)', () => {
    const rnd = Core.rng(7);
    const mirrored = mirrorOf(V1.pattern);
    for (let n = 0; n < 500; n++) {
        const rar = Core.makeCard(Core.randomCode(rnd, 1), bingoEvents).map((e) => e.rarity).join();
        assert.ok(rar === V1.pattern.join() || rar === mirrored.join());
    }
});

test('righe e premi: riga, doppia e bingo vanno al primo che li raggiunge', () => {
    const A = texts(Core.makeCard('AAAA', bingoEvents));
    const B = texts(Core.makeCard('BBBB', bingoEvents));
    // A chiude la prima riga, poi la prima colonna
    const order = [A[0], A[1], A[2], A[3]];
    let pz = Core.prizes([A, B], order);
    assert.ok(pz.riga && pz.riga.winners.includes(0));
    assert.equal(pz.riga.step, 3);
    assert.equal(pz.doppia, null);
    const more = order.concat([A[4], A[8], A[12]].filter((t) => !order.includes(t)));
    pz = Core.prizes([A, B], more);
    assert.ok(pz.doppia && pz.doppia.winners.includes(0));
    assert.equal(pz.bingo, null);
    const all = A.concat(B.filter((t) => !A.includes(t)));
    pz = Core.prizes([A, B], all);
    assert.deepEqual(pz.bingo.winners, [0]);
    const ev = Core.evaluate(A, (t) => all.includes(t));
    assert.equal(ev.full, true);
    assert.equal(ev.lines, 10);
});

test('spareggio (v2): a pari evento vince chi ha piu\' caselle segnate', () => {
    // due cartelle finte: la riga si chiude per tutte e due con l'evento X
    const A = ['a1', 'a2', 'a3', 'X', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'z9', 'z10', 'z11', 'z12'];
    const B = ['b1', 'b2', 'b3', 'X', 'b4', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8', 'y9', 'y10', 'y11', 'y12'];
    const order = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'b4', 'X'];
    assert.deepEqual(Core.prizes([A, B], order).riga.winners, [0, 1], 'senza spareggio il premio e\' di tutti e due');
    assert.deepEqual(Core.prizes([A, B], order, true).riga.winners, [1], 'B ha 5 caselle segnate, A 4');
    // caselle pari: resta diviso
    const even = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'X'];
    assert.deepEqual(Core.prizes([A, B], even, true).riga.winners, [0, 1]);
});

test('caselle calde e "manca 1": evaluate e oneAway', () => {
    const A = texts(Core.makeCard('2AAAA', bingoEvents));
    const marked = new Set([A[0], A[1], A[2]]);
    let ev = Core.evaluate(A, (t) => marked.has(t));
    assert.equal(ev.lines, 0);
    assert.ok(ev.hot[3], 'la quarta casella della prima riga chiude la riga');
    assert.equal(ev.hotCount, 1);
    assert.equal(Core.oneAway(ev), 'riga');
    marked.add(A[3]); marked.add(A[4]); marked.add(A[8]);
    ev = Core.evaluate(A, (t) => marked.has(t));
    assert.equal(ev.lines, 1);
    assert.ok(ev.hot[12]);
    assert.equal(Core.oneAway(ev), 'doppia');
    const almost = new Set(A.slice(0, 15));
    ev = Core.evaluate(A, (t) => almost.has(t));
    assert.equal(Core.oneAway(ev), 'bingo');
    ev = Core.evaluate(A, () => true);
    assert.equal(Core.oneAway(ev), null);
    assert.equal(Core.oneAway(Core.evaluate(A, () => false)), null);
});

/* ---------- Simulazione ----------
   Ogni evento succede con probabilita' p, una volta, al primo arrivo di un
   processo di Poisson (tasso -ln(1-p)) dentro la sua finestra t. */
function occur(e, rnd) {
    const p = Math.min(e.p, 99) / 100;
    if (rnd() >= p) return null;
    const [a, b] = e.t || [0, 97];
    const lam = -Math.log(1 - p);
    return a + (b - a) * (-Math.log(1 - rnd() * (1 - Math.exp(-lam))) / lam);
}
function simulate(version, players, games, seed) {
    const rnd = Core.rng(seed);
    const out = { riga: [], ties: 0, diag: 0, bingo: 0 };
    for (let g = 0; g < games; g++) {
        const codes = new Set();
        while (codes.size < players) codes.add(Core.randomCode(rnd, version));
        const cards = [...codes].map((c) => texts(Core.makeCard(c, bingoEvents)));
        const at = {};
        bingoEvents.forEach((e) => { const t = occur(e, rnd); if (t != null) at[e.text] = t; });
        const order = Object.keys(at).filter((t) => cards.some((c) => c.includes(t))).sort((x, y) => at[x] - at[y]);
        const pz = Core.prizes(cards, order, version > 1);
        if (pz.riga) {
            out.riga.push(at[order[pz.riga.step]]);
            if (pz.riga.winners.length > 1) out.ties++;
            const set = new Set(order.slice(0, pz.riga.step + 1));
            const w = cards[pz.riga.winners[0]];
            const closed = Core.LINES.map((l, k) => (l.every((i) => set.has(w[i])) ? k : -1)).filter((k) => k >= 0);
            if (closed.every((k) => k >= 8)) out.diag++;
        }
        if (pz.bingo) out.bingo++;
    }
    const n = out.riga.length;
    return { rigaMin: out.riga.reduce((s, x) => s + x, 0) / n, rigaRate: n / games, ties: out.ties / n, diag: out.diag / n, bingo: out.bingo / games };
}

test('simulazione: la v1 si decide sulle diagonali, la v2 fa riga nel finale e il bingo esce', () => {
    const v1 = simulate(1, 3, 400, 11);
    assert.ok(v1.diag > 0.7, `v1: prima riga solo da diagonali nel ${(v1.diag * 100).toFixed(0)}% dei casi`);
    assert.ok(v1.bingo < 0.01, 'v1: il bingo non esce quasi mai');
    const v2 = simulate(2, 3, 800, 12);
    assert.ok(v2.rigaRate > 0.97, 'v2: la riga arriva quasi sempre');
    assert.ok(v2.rigaMin >= 62 && v2.rigaMin <= 78, `v2: riga in media al ${v2.rigaMin.toFixed(1)}'`);
    assert.ok(v2.diag < 0.1, `v2: diagonali scorciatoia nel ${(v2.diag * 100).toFixed(0)}% dei casi`);
    assert.ok(v2.bingo >= 0.08 && v2.bingo <= 0.22, `v2: bingo in ${(v2.bingo * 100).toFixed(1)}% delle partite a 3`);
    assert.ok(v2.ties <= 0.08, `v2: riga divisa nel ${(v2.ties * 100).toFixed(1)}% dei casi`);
});
