#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Costruttore delle schede del Cruciverba
   Legge assets/db-cruciverba.js e costruisce le griglie fisse numerate
   (N° 1, N° 2, ...) in assets/cruciverba-schede.js. Ogni scheda ha un tema
   (campo `temi` delle voci): almeno MIN_THEMED parole sono del tema, le
   altre sono generali. Ogni scheda e' il risultato di migliaia di tentativi
   con le regole del cruciverba a schema libero: si tiene la griglia migliore
   per parole a tema, incroci, densita' e compattezza.
   Le schede gia' pubblicate sono CONGELATE: lo script rilegge
   assets/cruciverba-schede.js, ricopia tali e quali le schede che ci sono
   gia' (i giocatori possono avere partite in corso) e genera soltanto i
   numeri nuovi del PLAN, con risposte mai usate nelle schede precedenti.
   Un test (tests/db-integrity.test.js) controlla l'impronta delle schede
   pubblicate. Il seme e' fisso: le schede nuove sono riproducibili.

   Uso: node scripts/build-cruciverba.js [--attempts 6000]
   Poi: node scripts/cache-bust.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { cruciverba: DB } = require(path.join(ROOT, 'assets', 'db-cruciverba.js'));

const ARG_ATTEMPTS = process.argv.indexOf('--attempts');
const ATTEMPTS = ARG_ATTEMPTS > 0 ? Number(process.argv[ARG_ATTEMPTS + 1]) : 6000;
const SEED = 20261103;

/* Le schede: tema, titolo, sottotitolo e quanto sono cattive (sale piano). */
const PLAN = [
    { n: 1, tema: 'nazionale', title: 'Notti magiche', sottotitolo: 'Gli azzurri, da Italia \'90 a Wembley', diff2: 0.30, diff3: [1, 3] },
    { n: 2, tema: 'champions', title: 'Le notti di Champions', sottotitolo: 'Finali, rimonte e la coppa dalle grandi orecchie', diff2: 0.35, diff3: [1, 3] },
    { n: 3, tema: 'mondiali', title: 'Il Maracanazo e dintorni', sottotitolo: 'Un secolo di Mondiali, azzurri esclusi', diff2: 0.40, diff3: [2, 3] },
    { n: 4, tema: 'bandiere', title: 'Una vita, una maglia', sottotitolo: 'Capitani, fasce e bandiere di una sola squadra', diff2: 0.40, diff3: [2, 4] },
    { n: 5, tema: 'mercato', title: 'Fumata bianca', sottotitolo: 'Trattative, procuratori e colpi di mercato', diff2: 0.45, diff3: [2, 4] },
    { n: 6, tema: 'bar', title: 'Chiacchiere da bar', sottotitolo: 'Gergo, tattica e modi di dire del calcio parlato', diff2: 0.45, diff3: [2, 4] },
    { n: 7, tema: 'stadi', title: 'Tutti in curva', sottotitolo: 'Stadi, cori, derby e tifo dagli spalti', diff2: 0.50, diff3: [2, 4] },
    { n: 8, tema: 'anni90', title: 'Le sette sorelle', sottotitolo: 'La Serie A degli anni Novanta, tra scudetti e 90° minuto', diff2: 0.45, diff3: [2, 4] },
    { n: 9, tema: 'mister', title: 'Parola al mister', sottotitolo: 'Panchine, esoneri e frasi celebri degli allenatori', diff2: 0.45, diff3: [2, 4] },
    { n: 10, tema: 'estero', title: 'Il pallone nel mondo', sottotitolo: 'Premier, Liga, Bundesliga e Sudamerica: club, stadi e rivalità', diff2: 0.45, diff3: [2, 4] }
];
const MIN_THEMED = 9;
const WORDS = { min: 16, max: 18 };
const MAX_SIDE = 15;
const TARGET_SIDE = 13;

/* Parole escluse: soprannomi ambigui e definizioni al presente che possono invecchiare
   (giocatori, tecnici e presidenti in carica). Il database ha alternative in abbondanza. */
const SKIP = new Set([
    // ambigui
    'GIGI', 'RAFA', 'PRINCIPE', 'TORO', 'LEO', 'NINO', 'ZIO', 'SANTO', 'GENIO', 'MAGO', 'MAX', 'SIR',
    // al presente: possono cambiare squadra o ruolo
    'HAALAND', 'SALAH', 'YAMAL', 'BELLINGHAM', 'VINICIUS', 'LAUTARO', 'BARELLA', 'DIMARCO', 'BASTONI',
    'SCAMACCA', 'RICE', 'GAVI', 'DIAS', 'PERCASSI', 'LOTITO', 'LAPORTA', 'CAIRO', 'DELAURENTIIS', 'GASP',
    'KHEPHREN', 'KVARA', 'GIGIO', 'SAKA', 'SON', 'GRIEZMANN', 'COURTOIS', 'PEDRI', 'KIMMICH', 'MUSIALA', 'VANDIJK',
    'ODEGAARD', 'FODEN', 'PALMER', 'PELLEGRINI', 'LOCATELLI', 'CALAFIORI', 'DIGREGORIO', 'CAMBIASO', 'POLITANO',
    'MKHITARYAN', 'SOMMER', 'DUMFRIES', 'KOKE', 'SIMEONE', 'CHOLO', 'EMERY', 'BELOTTI', 'FRATTESI', 'RETEGUI', 'COMO', 'RODRI', 'ARTETA', 'MORATA', 'INFANTINO'
]);
/* Tetti per categoria tra le parole generali di una scheda (quelle a tema ne sono esenti). */
const CAT_CAP = { Calciatori: 5, Soprannomi: 3 };
const CAT_CAP_DEFAULT = 4;
const LEN_CAP = { 3: 2, 4: 4 };
/* Le parole a tema hanno un tetto piu' largo per categoria (niente schede di soli stadi). */
const CAT_CAP_THEMED = 6;
/* Varieta' delle definizioni: la stessa parola "pesante" (Triplete, stadio, finale...) in al massimo 4 definizioni. */
const CLUE_TOKEN_CAP = 4;
const STOP = new Set(['della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'negli', 'sulla', 'sulle', 'dalla', 'dalle', 'quello', 'quella', 'prima', 'dopo', 'tutti', 'tutto', 'sempre', 'anche', 'contro', 'come', 'nella']);

/* ---------- caso riproducibile ---------- */
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
let rnd = Math.random;
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* ---------- la definizione non deve contenere un'altra risposta della griglia ---------- */
function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
/** w.tok (parole della definizione) e w.flat (definizione senza spazi) sono calcolati una volta sola. */
function mentions(w, answer) {
    const a = answer.toLowerCase();
    return w.tok.has(a) || (a.length >= 5 && w.flat.includes(a));
}

/* ---------- il motore: le stesse regole del gioco ---------- */
const OFF = 64, SPAN = 256;
const key = (r, c) => (r + OFF) * SPAN + (c + OFF);
const STEP = { a: [0, 1], d: [1, 0] };
const OTHER = { a: 'd', d: 'a' };

function attempt(pool, plan) {
    const cells = new Map(), byLetter = {}, placed = [], used = new Set();
    const cats = {}, lens = {}, toks = {};
    let d3 = 0, bb = null;
    const get = (r, c) => cells.get(key(r, c));

    function allowed(w) {
        if (used.has(w.answer)) return false;
        if ((cats[w.cat] || 0) >= (w.themed ? CAT_CAP_THEMED : (CAT_CAP[w.cat] || CAT_CAP_DEFAULT))) return false;
        for (const t of w.heavy) if ((toks[t] || 0) >= CLUE_TOKEN_CAP) return false;
        if (LEN_CAP[w.answer.length] != null && (lens[w.answer.length] || 0) >= LEN_CAP[w.answer.length]) return false;
        if (w.diff === 3 && d3 >= plan.diff3[1]) return false;
        for (const p of placed) {
            const o = p.w;
            if (mentions(w, o.answer) || mentions(o, w.answer)) return false;
            if ((o.answer.includes(w.answer) || w.answer.includes(o.answer))) return false;
        }
        return true;
    }

    function place(w, r, c, dir) {
        const s = STEP[dir], idx = placed.length;
        for (let i = 0; i < w.answer.length; i++) {
            const rr = r + s[0] * i, cc = c + s[1] * i, k = key(rr, cc);
            let cell = cells.get(k);
            if (cell) cell[dir] = idx;
            else {
                cell = { ch: w.answer[i], a: -1, d: -1, r: rr, c: cc };
                cell[dir] = idx;
                cells.set(k, cell);
                (byLetter[cell.ch] = byLetter[cell.ch] || []).push(k);
            }
        }
        const r1 = r + s[0] * (w.answer.length - 1), c1 = c + s[1] * (w.answer.length - 1);
        bb = bb ? { r0: Math.min(bb.r0, r), c0: Math.min(bb.c0, c), r1: Math.max(bb.r1, r1), c1: Math.max(bb.c1, c1) } : { r0: r, c0: c, r1, c1 };
        placed.push({ w, r, c, dir });
        used.add(w.answer);
        cats[w.cat] = (cats[w.cat] || 0) + 1;
        for (const t of w.heavy) toks[t] = (toks[t] || 0) + 1;
        lens[w.answer.length] = (lens[w.answer.length] || 0) + 1;
        if (w.diff === 3) d3++;
    }

    function check(ans, r, c, dir) {
        const s = STEP[dir], len = ans.length;
        if (get(r - s[0], c - s[1]) || get(r + s[0] * len, c + s[1] * len)) return null;
        const r1 = r + s[0] * (len - 1), c1 = c + s[1] * (len - 1);
        const nb = { r0: Math.min(bb.r0, r), c0: Math.min(bb.c0, c), r1: Math.max(bb.r1, r1), c1: Math.max(bb.c1, c1) };
        const hh = nb.r1 - nb.r0 + 1, ww = nb.c1 - nb.c0 + 1;
        if (hh > MAX_SIDE || ww > MAX_SIDE) return null;
        let cross = 0;
        for (let i = 0; i < len; i++) {
            const rr = r + s[0] * i, cc = c + s[1] * i;
            const cell = get(rr, cc);
            if (cell) {
                if (cell.ch !== ans[i] || cell[dir] !== -1) return null;
                cross++;
            } else if (get(rr + s[1], cc + s[0]) || get(rr - s[1], cc - s[0])) return null;
        }
        if (!cross || cross === len) return null;
        const growth = hh * ww - (bb.r1 - bb.r0 + 1) * (bb.c1 - bb.c0 + 1);
        const over = Math.max(0, hh - TARGET_SIDE) + Math.max(0, ww - TARGET_SIDE);
        return cross * 14 + (cross >= 2 ? 22 : 0) - growth * 0.3 - over * 6 - Math.abs(hh - ww) * 1.5 + rnd() * 6;
    }

    function bestFor(w) {
        let best = null;
        const bonus = w.themed ? 16 : 0;
        const ans = w.answer;
        for (let i = 0; i < ans.length; i++) {
            const list = byLetter[ans[i]];
            if (!list) continue;
            for (const k of list) {
                const cell = cells.get(k);
                const dir = cell.a === -1 ? 'a' : cell.d === -1 ? 'd' : null;
                if (!dir) continue;
                const s = STEP[dir], r = cell.r - s[0] * i, c = cell.c - s[1] * i;
                const sc = check(ans, r, c, dir);
                if (sc != null && (!best || sc + bonus > best.score)) best = { w, r, c, dir, score: sc + bonus };
            }
        }
        return best;
    }

    const rest = shuffle(pool.slice());
    const head = rest.filter((w) => w.themed && w.answer.length >= 7 && w.answer.length <= 12 && w.diff < 3).slice(0, 6);
    if (!head.length) return null;
    const first = head[Math.floor(rnd() * Math.min(4, head.length))];
    rest.splice(rest.indexOf(first), 1);
    place(first, 0, 0, rnd() < 0.5 ? 'a' : 'd');

    const target = WORDS.min + Math.floor(rnd() * (WORDS.max - WORDS.min + 1));
    while (placed.length < target && rest.length) {
        let pick = null;
        const look = rest.slice(0, 80);
        for (const w of look) {
            if (!allowed(w)) continue;
            const p = bestFor(w);
            if (p && (!pick || p.score > pick.score)) pick = p;
        }
        if (!pick) break;
        place(pick.w, pick.r, pick.c, pick.dir);
        rest.splice(rest.indexOf(pick.w), 1);
        // le parole provate e non entrate passano in fondo alla fila
        for (const w of look) { const at = rest.indexOf(w); if (at >= 0) { rest.splice(at, 1); rest.push(w); } }
    }
    return { placed, bb, letters: cells.size, d3 };
}

/** Ritaglia, mette in verticale se serve, numera e misura. */
function finalize(g) {
    const H = g.bb.r1 - g.bb.r0 + 1, W = g.bb.c1 - g.bb.c0 + 1;
    const flip = W > H;
    const w = flip ? H : W, h = flip ? W : H;
    const words = g.placed.map((p) => {
        let r = p.r - g.bb.r0, c = p.c - g.bb.c0, dir = p.dir;
        if (flip) { [r, c] = [c, r]; dir = OTHER[dir]; }
        return { src: p.w, answer: p.w.answer, clue: p.w.clue, row: r, col: c, dir };
    });
    // incroci per parola
    const owner = new Map();
    words.forEach((x, i) => {
        const s = STEP[x.dir];
        for (let k = 0; k < x.answer.length; k++) {
            const id = (x.row + s[0] * k) * w + (x.col + s[1] * k);
            (owner.get(id) || owner.set(id, []).get(id)).push(i);
        }
    });
    const cross = words.map(() => 0);
    owner.forEach((list) => { if (list.length > 1) list.forEach((i) => cross[i]++); });
    const starts = new Set(words.map((x) => x.row * w + x.col));
    const num = {};
    let n = 0;
    for (let i = 0; i < w * h; i++) if (starts.has(i)) num[i] = ++n;
    words.forEach((x) => { x.num = num[x.row * w + x.col]; });
    return { w, h, words, cross, letters: g.letters, d3: g.d3, themed: words.filter((x) => x.src.themed).length };
}

function score(f, plan) {
    const n = f.words.length;
    const avg = f.cross.reduce((a, b) => a + b, 0) / n;
    const two = f.cross.filter((x) => x >= 2).length / n;
    const dens = f.letters / (f.w * f.h);
    const cats = new Set(f.words.map((x) => x.src.cat)).size;
    let s = n * 40 + two * 500 + avg * 90 + dens * 350 + cats * 6 + f.themed * 28;
    if (f.themed < MIN_THEMED) s -= 3000 + (MIN_THEMED - f.themed) * 300;
    s -= (Math.abs(f.w - TARGET_SIDE) + Math.abs(f.h - TARGET_SIDE)) * 9 + Math.abs(f.w - f.h) * 12;
    if (n < WORDS.min) s -= 2000;
    if (f.d3 < plan.diff3[0]) s -= 600 * (plan.diff3[0] - f.d3);
    // la rampa di difficolta': la quota di definizioni medie (diff 2) segue la scheda
    const easyMid = f.words.filter((x) => x.src.diff < 3);
    const share2 = easyMid.filter((x) => x.src.diff === 2).length / Math.max(1, easyMid.length);
    s -= Math.abs(share2 - plan.diff2) * 900;
    return s;
}

/** Il mazzo per un tentativo: tutte le parole del tema + parole generali secondo la scheda. */
function samplePool(avail, plan) {
    const themed = avail.filter((x) => x.temi.includes(plan.tema)).map((x) => Object.assign({}, x, { themed: true }));
    // le parole di altri temi restano a disposizione delle loro schede
    const general = avail.filter((x) => !x.temi.length);
    const by = { 1: [], 2: [], 3: [] };
    general.forEach((x) => by[x.diff].push(x));
    Object.values(by).forEach(shuffle);
    const size = 120;
    const n3 = 10, n2 = Math.round((size - n3) * plan.diff2), n1 = size - n3 - n2;
    return themed.concat(by[1].slice(0, n1), by[2].slice(0, n2), by[3].slice(0, n3));
}

/* ---------- costruzione ---------- */
const clean = DB.map((x) => ({ answer: x.answer, clue: x.clue, cat: x.cat || '', diff: x.diff, temi: x.temi || [] }))
    .filter((x) => /^[A-Z]{3,13}$/.test(x.answer) && !SKIP.has(x.answer) && x.clue && !/\b(o|oppure)\b.*\bper gli amici\b/i.test(x.clue))
    .map((x) => Object.assign(x, {
        tok: new Set(norm(x.clue).split(' ')), flat: norm(x.clue).replace(/ /g, ''),
        heavy: [...new Set(norm(x.clue).split(' ').filter((t) => t.length >= 5 && !STOP.has(t)))]
    }));
// le schede gia' pubblicate non si toccano: si ricopiano e le loro risposte restano prese
const SCHEDE_FILE = path.join(ROOT, 'assets', 'cruciverba-schede.js');
const frozen = fs.existsSync(SCHEDE_FILE) ? require(SCHEDE_FILE).cruciverbaSchede : [];
const taken = new Set(frozen.flatMap((p) => p.words.map((w) => w.answer)));
const out = [];
const t00 = Date.now();
const extra = frozen.filter((p) => !PLAN.some((x) => x.n === p.n));
if (extra.length) throw new Error('Schede pubblicate assenti dal PLAN: ' + extra.map((p) => p.n).join(', '));

for (const plan of PLAN) {
    const old = frozen.find((p) => p.n === plan.n);
    if (old) {
        out.push(old);
        console.log(`N° ${plan.n} [${old.tema}] "${old.title}": congelata (${old.w}x${old.h}, ${old.words.length} parole)`);
        continue;
    }
    rnd = mulberry32(SEED + plan.n * 7919);
    const avail = clean.filter((x) => !taken.has(x.answer));
    console.log(`   (tema ${plan.tema}: ${avail.filter((x) => x.temi.includes(plan.tema)).length} parole candidate)`);
    const t0 = Date.now();
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < ATTEMPTS; i++) {
        const g = attempt(samplePool(avail, plan), plan);
        if (!g) continue;
        const f = finalize(g);
        const s = score(f, plan);
        if (s > bestScore) { best = f; bestScore = s; }
    }
    best.words.forEach((x, i) => { taken.add(x.answer); x.cross = best.cross[i]; });
    // ordine: orizzontali poi verticali, per numero
    best.words.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'a' ? -1 : 1));
    const n = best.words.length;
    const cr = best.words.map((x) => x.cross);
    const diffs = [1, 2, 3].map((d) => best.words.filter((x) => x.src.diff === d).length);
    const cats = {};
    best.words.forEach((x) => { cats[x.src.cat] = (cats[x.src.cat] || 0) + 1; });
    console.log(`N° ${plan.n} [${plan.tema}] "${plan.title}": ${best.w}x${best.h}, ${n} parole, a tema ${best.themed}/${n}, incroci medi ${(cr.reduce((a, b) => a + b, 0) / n).toFixed(2)}, ` +
        `${cr.filter((x) => x >= 2).length}/${n} con 2+ incroci, densita' ${Math.round(best.letters / (best.w * best.h) * 100)}%, ` +
        `diff 1/2/3 = ${diffs.join('/')}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log('   categorie: ' + Object.entries(cats).map(([k, v]) => k + ' ' + v).join(', '));
    out.push({
        n: plan.n, tema: plan.tema, title: plan.title, sottotitolo: plan.sottotitolo, w: best.w, h: best.h,
        words: best.words.map((x) => ({ answer: x.answer, clue: x.clue, row: x.row, col: x.col, dir: x.dir === 'a' ? 'A' : 'D', num: x.num }))
    });
}

const body = out.map((p) => '  {\n    n: ' + p.n + ', tema: ' + JSON.stringify(p.tema) + ', title: ' + JSON.stringify(p.title) + ',\n    sottotitolo: ' + JSON.stringify(p.sottotitolo) + ', w: ' + p.w + ', h: ' + p.h + ',\n    words: [\n' +
    p.words.map((x) => '      { answer: ' + JSON.stringify(x.answer) + ', clue: ' + JSON.stringify(x.clue) + ', row: ' + x.row + ', col: ' + x.col + ', dir: "' + x.dir + '", num: ' + x.num + ' }').join(',\n') +
    '\n    ]\n  }').join(',\n');
const file = `/* ==========================================================================
   QUIZZOTTI — Cruciverba: le schede fisse (N° 1 ... N° ${out.length})
   FILE GENERATO da scripts/build-cruciverba.js a partire da
   assets/db-cruciverba.js: non modificarlo a mano, rilancia lo script.
   tema: nazionale | champions | mondiali | bandiere | mercato | bar | stadi.
   row/col partono da 0; dir "A" = orizzontale, "D" = verticale.
   ========================================================================== */
/* exported cruciverbaSchede */
const cruciverbaSchede = [
${body}
];

if (typeof module !== "undefined" && module.exports) { module.exports = { cruciverbaSchede }; }
`;
fs.writeFileSync(path.join(ROOT, 'assets', 'cruciverba-schede.js'), file);
console.log(`Scritto assets/cruciverba-schede.js (${out.length} schede) in ${((Date.now() - t00) / 1000).toFixed(1)} s`);
