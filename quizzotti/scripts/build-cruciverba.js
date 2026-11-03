#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Costruttore delle schede del Cruciverba
   Legge assets/db-cruciverba.js e costruisce le griglie fisse numerate
   (N° 1, N° 2, ...) in assets/cruciverba-schede.js. Ogni scheda e' il
   risultato di migliaia di tentativi con le regole del cruciverba a schema
   libero: si tiene la griglia migliore per incroci, densita' e compattezza.
   Il seme e' fisso: rilanciando lo script si ottengono le stesse griglie
   (finche' il database non cambia).

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

/* Le schede: titolo e quanto sono cattive (sale piano dalla 1 alla 5). */
const PLAN = [
    { n: 1, title: 'Calcio d\'inizio', diff2: 0.25, diff3: [2, 2] },
    { n: 2, title: 'Palla al centro', diff2: 0.35, diff3: [2, 3] },
    { n: 3, title: 'Secondo tempo', diff2: 0.45, diff3: [3, 3] },
    { n: 4, title: 'Zona Cesarini', diff2: 0.55, diff3: [3, 4] },
    { n: 5, title: 'Si va ai rigori', diff2: 0.65, diff3: [4, 4] }
];
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
    'MKHITARYAN', 'SOMMER', 'DUMFRIES', 'KOKE', 'SIMEONE', 'CHOLO', 'EMERY', 'BELOTTI', 'FRATTESI', 'RETEGUI', 'COMO', 'RODRI', 'ARTETA', 'MORATA'
]);
/* Tetti per categoria in una scheda: niente griglie fatte solo di cognomi. */
const CAT_CAP = { Calciatori: 5, Soprannomi: 3 };
const CAT_CAP_DEFAULT = 4;
const LEN_CAP = { 3: 2, 4: 4 };

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
    const cats = {}, lens = {};
    let d3 = 0, bb = null;
    const get = (r, c) => cells.get(key(r, c));

    function allowed(w) {
        if (used.has(w.answer)) return false;
        if ((cats[w.cat] || 0) >= (CAT_CAP[w.cat] || CAT_CAP_DEFAULT)) return false;
        if (LEN_CAP[w.answer.length] != null && (lens[w.answer.length] || 0) >= LEN_CAP[w.answer.length]) return false;
        if (w.diff === 3 && d3 >= plan.diff3[1]) return false;
        for (const p of placed) {
            const o = p.w;
            if (mentions(w, o.answer) || mentions(o, w.answer)) return false;
            if (o.answer.length >= 4 && w.answer.length >= 4 && (o.answer.includes(w.answer) || w.answer.includes(o.answer))) return false;
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
                if (sc != null && (!best || sc > best.score)) best = { w, r, c, dir, score: sc };
            }
        }
        return best;
    }

    const rest = shuffle(pool.slice());
    const head = rest.slice(0, 16).filter((w) => w.answer.length >= 7 && w.answer.length <= 12 && w.diff < 3);
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
    return { w, h, words, cross, letters: g.letters, d3: g.d3 };
}

function score(f, plan) {
    const n = f.words.length;
    const avg = f.cross.reduce((a, b) => a + b, 0) / n;
    const two = f.cross.filter((x) => x >= 2).length / n;
    const dens = f.letters / (f.w * f.h);
    const cats = new Set(f.words.map((x) => x.src.cat)).size;
    let s = n * 40 + two * 500 + avg * 90 + dens * 350 + cats * 12;
    s -= (Math.abs(f.w - TARGET_SIDE) + Math.abs(f.h - TARGET_SIDE)) * 9 + Math.abs(f.w - f.h) * 12;
    if (n < WORDS.min) s -= 2000;
    if (f.d3 < plan.diff3[0]) s -= 600 * (plan.diff3[0] - f.d3);
    // la rampa di difficolta': la quota di definizioni medie (diff 2) segue la scheda
    const easyMid = f.words.filter((x) => x.src.diff < 3);
    const share2 = easyMid.filter((x) => x.src.diff === 2).length / Math.max(1, easyMid.length);
    s -= Math.abs(share2 - plan.diff2) * 900;
    return s;
}

/** Il mazzo per un tentativo: proporzioni di difficolta' secondo la scheda. */
function samplePool(avail, plan) {
    const by = { 1: [], 2: [], 3: [] };
    avail.forEach((x) => by[x.diff].push(x));
    Object.values(by).forEach(shuffle);
    const size = 170;
    const n3 = 14, n2 = Math.round((size - n3) * plan.diff2), n1 = size - n3 - n2;
    return by[1].slice(0, n1).concat(by[2].slice(0, n2), by[3].slice(0, n3));
}

/* ---------- costruzione ---------- */
const clean = DB.map((x) => ({ answer: x.answer, clue: x.clue, cat: x.cat || '', diff: x.diff }))
    .filter((x) => /^[A-Z]{3,13}$/.test(x.answer) && !SKIP.has(x.answer) && x.clue && !/\b(o|oppure)\b.*\bper gli amici\b/i.test(x.clue))
    .map((x) => Object.assign(x, { tok: new Set(norm(x.clue).split(' ')), flat: norm(x.clue).replace(/ /g, '') }));
const taken = new Set();
const out = [];
const t00 = Date.now();

for (const plan of PLAN) {
    rnd = mulberry32(SEED + plan.n * 7919);
    const avail = clean.filter((x) => !taken.has(x.answer));
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
    console.log(`N° ${plan.n} "${plan.title}": ${best.w}x${best.h}, ${n} parole, incroci medi ${(cr.reduce((a, b) => a + b, 0) / n).toFixed(2)}, ` +
        `${cr.filter((x) => x >= 2).length}/${n} con 2+ incroci, densita' ${Math.round(best.letters / (best.w * best.h) * 100)}%, ` +
        `diff 1/2/3 = ${diffs.join('/')}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log('   categorie: ' + Object.entries(cats).map(([k, v]) => k + ' ' + v).join(', '));
    out.push({
        n: plan.n, title: plan.title, w: best.w, h: best.h,
        words: best.words.map((x) => ({ answer: x.answer, clue: x.clue, row: x.row, col: x.col, dir: x.dir === 'a' ? 'A' : 'D', num: x.num }))
    });
}

const body = out.map((p) => '  {\n    n: ' + p.n + ', title: ' + JSON.stringify(p.title) + ', w: ' + p.w + ', h: ' + p.h + ',\n    words: [\n' +
    p.words.map((x) => '      { answer: ' + JSON.stringify(x.answer) + ', clue: ' + JSON.stringify(x.clue) + ', row: ' + x.row + ', col: ' + x.col + ', dir: "' + x.dir + '", num: ' + x.num + ' }').join(',\n') +
    '\n    ]\n  }').join(',\n');
const file = `/* ==========================================================================
   QUIZZOTTI — Cruciverba: le schede fisse (N° 1 ... N° ${out.length})
   FILE GENERATO da scripts/build-cruciverba.js a partire da
   assets/db-cruciverba.js: non modificarlo a mano, rilancia lo script.
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
