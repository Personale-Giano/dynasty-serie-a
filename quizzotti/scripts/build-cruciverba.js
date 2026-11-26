#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Costruttore delle schede del Cruciverba
   Legge assets/db-cruciverba.js e costruisce le griglie fisse numerate
   (N° 1, N° 2, ...) in assets/cruciverba-schede.js. Ogni scheda ha un tema
   (campo `temi` delle voci): almeno MIN_THEMED parole sono del tema, le
   altre sono generali.
   Le schede gia' pubblicate sono CONGELATE: lo script rilegge
   assets/cruciverba-schede.js, ricopia tali e quali le schede che ci sono
   gia' (i giocatori possono avere partite in corso) e genera soltanto i
   numeri nuovi del PLAN, con risposte mai usate nelle schede precedenti.
   Un test (tests/db-integrity.test.js) controlla l'impronta delle schede
   pubblicate. Il seme e' fisso: le schede nuove sono riproducibili.

   Motore (dal N° 21; le schede 1-20 vengono dal motore precedente, vedi la
   storia git): griglia a schema libero con le regole del gioco, cercata in
   due tempi.
   1) costruzione golosa: a ogni passo entra la parola che incrocia di piu'
      senza allargare la griglia;
   2) ricerca locale: si tolgono 1-3 parole (di preferenza quelle con un solo
      incrocio), si riempie di nuovo e si tiene la griglia se migliora
      (ricottura simulata).
   Si premiano gli incroci per parola (obiettivo: almeno 1,5 caselle
   d'incrocio per parola), la densita' (poche caselle nere) e le parole a tema.

   Uso: node scripts/build-cruciverba.js [--attempts 24] [--iters 700] [--upto N]
   Poi: node scripts/cache-bust.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { cruciverba: DB } = require(path.join(ROOT, 'assets', 'db-cruciverba.js'));

function argNum(name, def) {
    const i = process.argv.indexOf('--' + name);
    return i > 0 ? Number(process.argv[i + 1]) : def;
}
const ATTEMPTS = argNum('attempts', 24);   // costruzioni indipendenti per scheda
const ITERS = argNum('iters', 700);        // passi di ricerca locale per costruzione
const UPTO = argNum('upto', Infinity);     // prova: si ferma a questo numero e non scrive nulla
const SEED = 20261103;

/* Le schede: tema, titolo, sottotitolo e quanto sono cattive.
   diff2 = quota di definizioni medie tra facili e medie; diff3 = [minimo, massimo] di difficili.
   Dal N° 21 ogni blocco di dieci numeri ripassa tutti i temi, con difficolta' alternata. */
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
    { n: 10, tema: 'estero', title: 'Il pallone nel mondo', sottotitolo: 'Premier, Liga, Bundesliga e Sudamerica: club, stadi e rivalità', diff2: 0.45, diff3: [2, 4] },
    { n: 11, tema: 'mondiali', title: 'Coppa del Mondo', sottotitolo: 'Finali, bomber e stadi da Uruguay 1930 in poi', diff2: 0.50, diff3: [2, 4] },
    { n: 12, tema: 'estero', title: 'Oltre confine', sottotitolo: "Bundesliga, Ligue 1, Eredivisie e campioni lontani dall'Italia", diff2: 0.50, diff3: [2, 4] },
    { n: 13, tema: 'stadi', title: 'Cattedrali del pallone', sottotitolo: 'Stadi storici, curve e campi di provincia', diff2: 0.50, diff3: [2, 4] },
    { n: 14, tema: 'mister', title: 'Lavagna tattica', sottotitolo: 'Allenatori, moduli e panchine celebri', diff2: 0.50, diff3: [2, 4] },
    { n: 15, tema: 'anni90', title: 'Album di figurine', sottotitolo: "Campioni e meteore della Serie A tra anni '80 e '90", diff2: 0.50, diff3: [2, 4] },
    { n: 16, tema: 'nazionale', title: 'Cuore azzurro', sottotitolo: 'Dal 1934 a Wembley 2021: gol, rigori e CT della Nazionale', diff2: 0.50, diff3: [2, 4] },
    { n: 17, tema: 'champions', title: 'Notti europee', sottotitolo: 'Coppa dei Campioni e Champions: finali, eroi e beffe', diff2: 0.50, diff3: [2, 4] },
    { n: 18, tema: 'bandiere', title: 'Fedeli alla maglia', sottotitolo: 'Capitani e campioni di una sola squadra, qui e altrove', diff2: 0.50, diff3: [2, 4] },
    { n: 19, tema: 'mercato', title: 'Mercato aperto', sottotitolo: 'Colpi record, procuratori e trattative infinite', diff2: 0.50, diff3: [2, 4] },
    { n: 20, tema: 'bar', title: 'Al bar del lunedì', sottotitolo: 'Campetto, schedina, figurine e moviola', diff2: 0.50, diff3: [2, 4] },
    // dal N° 21: motore denso
    { n: 21, tema: 'nazionale', title: 'Mano sul cuore', sottotitolo: "Inni, CT e notti azzurre da Messico '70 a Berlino", diff2: 0.30, diff3: [1, 2] },
    { n: 22, tema: 'stadi', title: 'Sciarpe al cielo', sottotitolo: "Curve, tribune e stadi d'Italia e d'Europa", diff2: 0.45, diff3: [2, 3] },
    { n: 23, tema: 'mondiali', title: 'Mascotte e palloni', sottotitolo: 'Finali, bomber e curiosità della Coppa del Mondo', diff2: 0.60, diff3: [3, 5] },
    { n: 24, tema: 'bar', title: 'Al bancone', sottotitolo: 'Schedine, fantacalcio e discussioni da bar sport', diff2: 0.30, diff3: [1, 2] },
    { n: 25, tema: 'mercato', title: 'Ombrelloni e trattative', sottotitolo: "Il mercato d'estate tra clausole, prestiti e telenovele", diff2: 0.45, diff3: [2, 3] },
    { n: 26, tema: 'champions', title: 'La coppa dalle grandi orecchie', sottotitolo: 'Finali, città e protagonisti della Champions', diff2: 0.60, diff3: [3, 5] },
    { n: 27, tema: 'bandiere', title: 'Capitani coraggiosi', sottotitolo: 'Fasce al braccio e maglie di una vita', diff2: 0.30, diff3: [1, 2] },
    { n: 28, tema: 'anni90', title: 'Novantesimo minuto', sottotitolo: "Gol, maglie e campioni della Serie A anni '90", diff2: 0.45, diff3: [2, 3] },
    { n: 29, tema: 'mister', title: 'Dalla panchina', sottotitolo: 'Tecnici, moduli e conferenze stampa', diff2: 0.60, diff3: [3, 5] },
    { n: 30, tema: 'estero', title: 'Giro del mondo', sottotitolo: 'Club, stadi e derby lontano dalla Serie A', diff2: 0.30, diff3: [1, 2] },
    { n: 31, tema: 'mondiali', title: 'Ogni quattro anni', sottotitolo: 'Città, stadi e campioni dei Mondiali', diff2: 0.30, diff3: [1, 2] },
    { n: 32, tema: 'nazionale', title: 'Azzurri per sempre', sottotitolo: 'Europei, Mondiali e maglie della Nazionale', diff2: 0.45, diff3: [2, 3] },
    { n: 33, tema: 'estero', title: 'Passaporto per il gol', sottotitolo: 'Premier, Liga, Sudamerica e dintorni', diff2: 0.60, diff3: [3, 5] },
    { n: 34, tema: 'stadi', title: 'La domenica allo stadio', sottotitolo: 'Botteghini, gradinate, cori e derby', diff2: 0.30, diff3: [1, 2] },
    { n: 35, tema: 'bandiere', title: 'Maglie ritirate', sottotitolo: "Simboli di una sola squadra, in Italia e all'estero", diff2: 0.45, diff3: [2, 3] },
    { n: 36, tema: 'mercato', title: 'Ultimo giorno di mercato', sottotitolo: 'Procuratori, visite mediche e firme sul gong', diff2: 0.60, diff3: [3, 5] },
    { n: 37, tema: 'anni90', title: 'Il campionato più bello del mondo', sottotitolo: 'Le stelle della Serie A di fine secolo', diff2: 0.30, diff3: [1, 2] },
    { n: 38, tema: 'bar', title: 'Calcio parlato', sottotitolo: 'Gergo, figurine e partitelle del giovedì', diff2: 0.45, diff3: [2, 3] },
    { n: 39, tema: 'champions', title: 'Mercoledì di coppa', sottotitolo: 'Coppa dei Campioni e Champions: finali ed eroi', diff2: 0.60, diff3: [3, 5] },
    { n: 40, tema: 'mister', title: 'Il mister ha sempre ragione', sottotitolo: 'Allenatori, CT e frasi da conferenza stampa', diff2: 0.30, diff3: [1, 2] },
    { n: 41, tema: 'champions', title: 'Notti di stelle', sottotitolo: 'Le grandi sfide europee del mercoledì', diff2: 0.30, diff3: [1, 2] },
    { n: 42, tema: 'mister', title: 'Tuta e cravatta', sottotitolo: "Panchine celebri, qui e all'estero", diff2: 0.45, diff3: [2, 3] },
    { n: 43, tema: 'nazionale', title: 'Il cammino degli azzurri', sottotitolo: 'CT, gol e grandi partite della Nazionale', diff2: 0.60, diff3: [3, 5] },
    { n: 44, tema: 'estero', title: 'Oltre le Alpi', sottotitolo: 'Campionati, coppe e club del calcio straniero', diff2: 0.30, diff3: [1, 2] },
    { n: 45, tema: 'mondiali', title: 'Il giro della Coppa', sottotitolo: 'Dalla prima finale di Montevideo ai Mondiali a 48', diff2: 0.45, diff3: [2, 3] },
    { n: 46, tema: 'stadi', title: 'Cattedrali e catini', sottotitolo: 'Stadi grandi e piccoli, dagli spalti al prato', diff2: 0.60, diff3: [3, 5] },
    { n: 47, tema: 'mercato', title: 'Si chiude il mercato', sottotitolo: 'Colpi, scambi, cartellini e contropartite', diff2: 0.30, diff3: [1, 2] },
    { n: 48, tema: 'bandiere', title: 'Cuore e fascia', sottotitolo: 'Capitani storici e bandiere di club', diff2: 0.45, diff3: [2, 3] },
    { n: 49, tema: 'bar', title: 'Tutti allenatori', sottotitolo: 'Il calcio visto dal bancone del bar', diff2: 0.60, diff3: [3, 5] },
    { n: 50, tema: 'anni90', title: 'Figurine di fine secolo', sottotitolo: "Campioni, coppe e stadi della Serie A anni '90", diff2: 0.45, diff3: [2, 3] },
    { n: 51, tema: 'estero', title: 'Calcio senza frontiere', sottotitolo: 'Club e campioni di mezzo mondo', diff2: 0.45, diff3: [2, 3] },
    { n: 52, tema: 'bar', title: 'Lunedì mattina', sottotitolo: 'La giornata commentata davanti al caffè', diff2: 0.30, diff3: [1, 2] },
    { n: 53, tema: 'stadi', title: 'Spalti e tornelli', sottotitolo: 'Il tifo dagli spalti, in Italia e altrove', diff2: 0.45, diff3: [2, 3] },
    { n: 54, tema: 'mondiali', title: 'Il mondo in un pallone', sottotitolo: 'Nazionali, finali e campioni mondiali', diff2: 0.60, diff3: [3, 5] },
    { n: 55, tema: 'nazionale', title: 'Forza azzurri', sottotitolo: 'Partite, gol e personaggi della Nazionale', diff2: 0.30, diff3: [1, 2] },
    { n: 56, tema: 'mister', title: 'Panchine roventi', sottotitolo: 'Tecnici, esoneri, moduli e lavagne', diff2: 0.45, diff3: [2, 3] },
    { n: 57, tema: 'anni90', title: 'Notti di fine millennio', sottotitolo: 'Coppe, scudetti e campioni degli anni Novanta', diff2: 0.60, diff3: [3, 5] },
    { n: 58, tema: 'champions', title: 'Inno e stelle', sottotitolo: 'Città delle finali, rimonte e protagonisti europei', diff2: 0.45, diff3: [2, 3] },
    { n: 59, tema: 'mercato', title: 'Il gong del mercato', sottotitolo: 'Trattative, rilanci, clausole e procuratori', diff2: 0.45, diff3: [2, 3] },
    { n: 60, tema: 'bandiere', title: 'Una bandiera, una città', sottotitolo: 'Campioni fedeli a una sola maglia', diff2: 0.30, diff3: [1, 2] }
];
const MIN_THEMED = 9;
const WORDS = { min: 19, max: 26 };
const MAX_SIDE = 14;      // il gioco regge fino a 15 di lato su un telefono da 375 px
const TARGET_SIDE = 13;
const GOAL_RATIO = 1.5;   // caselle d'incrocio per parola

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
    'MKHITARYAN', 'SOMMER', 'DUMFRIES', 'KOKE', 'SIMEONE', 'CHOLO', 'EMERY', 'BELOTTI', 'FRATTESI', 'RETEGUI', 'COMO', 'RODRI', 'ARTETA', 'MORATA', 'INFANTINO',
    // proprietari e presidenti in carica (novembre 2026)
    'NASSER', 'MANSOUR', 'SAPUTO', 'KRAUSE', 'ALNASSR'
]);
/* Tetti per categoria tra le parole generali di una scheda (quelle a tema ne sono esenti). */
const CAPS = {
    cat: { Calciatori: 7, Soprannomi: 3 }, catDefault: 5,
    catThemed: 8,                 // niente schede di soli stadi
    len: { 3: 3, 4: 5 },          // poche parole cortissime
    token: 4                      // la stessa parola "pesante" in al massimo 4 definizioni
};
const STOP = new Set(['della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'negli', 'sulla', 'sulle', 'dalla', 'dalle', 'quello', 'quella', 'prima', 'dopo', 'tutti', 'tutto', 'sempre', 'anche', 'contro', 'come']);

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
const N = 48;             // tavola di lavoro N x N, si parte dal centro
const AREA = N * N;
const DR = [0, 1], DC = [1, 0];   // 0 = orizzontale, 1 = verticale
const K = { cross: 20, two: 40, three: 25, fill: 6, growth: 0.6, over: 8, square: 1, themed: 14, noise: 8 };

function newState() {
    return {
        ch: new Uint8Array(AREA), own: [new Int16Array(AREA).fill(-1), new Int16Array(AREA).fill(-1)],
        byLetter: Array.from({ length: 26 }, () => []), placed: [], used: new Set(), cats: {}, lens: {}, toks: {},
        d3: 0, r0: N, c0: N, r1: -1, c1: -1, letters: 0
    };
}
function rebuild(list) {
    const s = newState();
    for (const p of list) place(s, p.w, p.r, p.c, p.d);
    return s;
}

function allowed(s, w, plan) {
    if (s.used.has(w.answer)) return false;
    const cap = w.themed ? CAPS.catThemed : (CAPS.cat[w.cat] || CAPS.catDefault);
    if ((s.cats[w.cat] || 0) >= cap) return false;
    for (const t of w.heavy) if ((s.toks[t] || 0) >= CAPS.token) return false;
    const lc = CAPS.len[w.len];
    if (lc != null && (s.lens[w.len] || 0) >= lc) return false;
    if (w.diff === 3 && s.d3 >= plan.diff3[1]) return false;
    for (const p of s.placed) if (w.clash.has(p.w.answer)) return false;
    return true;
}

function place(s, w, r, c, d) {
    const idx = s.placed.length;
    for (let i = 0; i < w.len; i++) {
        const k = (r + DR[d] * i) * N + (c + DC[d] * i);
        if (!s.ch[k]) { s.ch[k] = w.codes[i]; s.byLetter[w.codes[i] - 65].push(k); s.letters++; }
        s.own[d][k] = idx;
    }
    const er = r + DR[d] * (w.len - 1), ec = c + DC[d] * (w.len - 1);
    s.r0 = Math.min(s.r0, r); s.c0 = Math.min(s.c0, c); s.r1 = Math.max(s.r1, er); s.c1 = Math.max(s.c1, ec);
    s.placed.push({ w, r, c, d });
    s.used.add(w.answer);
    s.cats[w.cat] = (s.cats[w.cat] || 0) + 1;
    for (const t of w.heavy) s.toks[t] = (s.toks[t] || 0) + 1;
    s.lens[w.len] = (s.lens[w.len] || 0) + 1;
    if (w.diff === 3) s.d3++;
}

const fit = { growth: 0, hh: 0, ww: 0 };
/** 0 se la parola non entra li', altrimenti il numero di incroci (misure in `fit`). */
function check(s, w, r, c, d) {
    const len = w.len, dr = DR[d], dc = DC[d], ch = s.ch, own = s.own[d];
    const er = r + dr * (len - 1), ec = c + dc * (len - 1);
    if (r < 1 || c < 1 || er > N - 2 || ec > N - 2) return 0;
    const hh = Math.max(s.r1, er) - Math.min(s.r0, r) + 1, ww = Math.max(s.c1, ec) - Math.min(s.c0, c) + 1;
    if (hh > MAX_SIDE || ww > MAX_SIDE) return 0;
    // la parola e' chiusa: niente lettere subito prima e subito dopo
    if (ch[(r - dr) * N + (c - dc)] || ch[(er + dr) * N + (ec + dc)]) return 0;
    let cross = 0;
    const side = dc * N + dr; // passo perpendicolare
    for (let i = 0; i < len; i++) {
        const k = (r + dr * i) * N + (c + dc * i);
        if (ch[k]) {
            if (ch[k] !== w.codes[i] || own[k] !== -1) return 0;
            cross++;
        } else if (ch[k + side] || ch[k - side]) return 0;   // nessuna lettera accostata senza incrocio
    }
    if (!cross || cross === len) return 0;
    fit.growth = hh * ww - (s.r1 - s.r0 + 1) * (s.c1 - s.c0 + 1);
    fit.hh = hh; fit.ww = ww;
    return cross;
}

function bestFor(s, w) {
    let best = null;
    for (let i = 0; i < w.len; i++) {
        const list = s.byLetter[w.codes[i] - 65];
        for (let j = 0; j < list.length; j++) {
            const k = list[j];
            const d = s.own[0][k] === -1 ? 0 : s.own[1][k] === -1 ? 1 : -1;
            if (d < 0) continue;
            const r = ((k / N) | 0) - DR[d] * i, c = (k % N) - DC[d] * i;
            const cross = check(s, w, r, c, d);
            if (!cross) continue;
            const over = Math.max(0, fit.hh - TARGET_SIDE) + Math.max(0, fit.ww - TARGET_SIDE);
            const sc = cross * K.cross + (cross >= 2 ? K.two : 0) + (cross >= 3 ? K.three : 0)
                + (w.len - cross) * K.fill - fit.growth * K.growth - over * K.over
                - Math.abs(fit.hh - fit.ww) * K.square + (w.themed ? K.themed : 0) + rnd() * K.noise;
            if (!best || sc > best.score) best = { w, r, c, d, score: sc, cross };
        }
    }
    return best;
}

/** Riempie golosamente fino a WORDS.max parole, con almeno `minCross` incroci per parola nuova. */
function grow(s, pool, plan, minCross) {
    while (s.placed.length < WORDS.max) {
        let pick = null;
        for (const w of pool) {
            if (!allowed(s, w, plan)) continue;
            const p = bestFor(s, w);
            if (p && p.cross >= minCross && (!pick || p.score > pick.score)) pick = p;
        }
        if (!pick) break;
        place(s, pick.w, pick.r, pick.c, pick.d);
    }
    return s;
}

/** Incroci di ogni parola e grafo degli incroci. */
function crossInfo(s) {
    const per = s.placed.map(() => 0), adj = s.placed.map(() => []);
    for (let k = 0; k < AREA; k++) {
        const a = s.own[0][k], b = s.own[1][k];
        if (a >= 0 && b >= 0) { per[a]++; per[b]++; adj[a].push(b); adj[b].push(a); }
    }
    return { per, adj };
}
function connected(adj) {
    if (!adj.length) return true;
    const seen = new Uint8Array(adj.length), st = [0];
    seen[0] = 1; let cnt = 1;
    while (st.length) { const x = st.pop(); for (const y of adj[x]) if (!seen[y]) { seen[y] = 1; cnt++; st.push(y); } }
    return cnt === adj.length;
}

function measure(s, plan) {
    const { per } = crossInfo(s);
    const n = s.placed.length;
    const X = per.reduce((a, b) => a + b, 0) / 2;
    const H = s.r1 - s.r0 + 1, W = s.c1 - s.c0 + 1;
    const m = { n, X, ratio: X / n, dens: s.letters / (H * W), H, W, d3: s.d3,
        themed: s.placed.filter((p) => p.w.themed).length, leaves: per.filter((x) => x === 1).length };
    let sc = m.ratio * 1500 + n * 10 + m.dens * 600 - m.leaves * 15 + Math.min(m.themed, 12) * 20;
    if (m.ratio < GOAL_RATIO) sc -= (GOAL_RATIO - m.ratio) * 1500;
    if (m.themed < MIN_THEMED) sc -= 3000 + (MIN_THEMED - m.themed) * 300;
    if (n < WORDS.min) sc -= (WORDS.min - n) * 200;
    if (m.d3 < plan.diff3[0]) sc -= 600 * (plan.diff3[0] - m.d3);
    sc -= Math.abs(H - W) * 8;
    // la rampa di difficolta': la quota di definizioni medie (diff 2) segue la scheda
    const easyMid = s.placed.filter((p) => p.w.diff < 3);
    const share2 = easyMid.filter((p) => p.w.diff === 2).length / Math.max(1, easyMid.length);
    sc -= Math.abs(share2 - plan.diff2) * 600;
    m.score = sc;
    return m;
}

/** Una costruzione: golosa e poi ricerca locale. */
function solve(pool, plan) {
    const heads = pool.filter((w) => w.themed && w.len >= 7 && w.len <= 11 && w.diff < 3);
    if (!heads.length) return null;
    const first = heads[Math.floor(rnd() * Math.min(6, heads.length))];
    let cur = newState();
    place(cur, first, N >> 1, (N >> 1) - (first.len >> 1), rnd() < 0.5 ? 0 : 1);
    grow(cur, pool, plan, 1);
    let curM = measure(cur, plan);
    let best = cur, bestM = curM;
    let T = 5;
    for (let it = 0; it < ITERS; it++, T *= 0.995) {
        const { per, adj } = crossInfo(cur);
        const n = cur.placed.length;
        // da 1 a 3 parole da togliere, di preferenza quelle con un solo incrocio
        const kdel = 1 + Math.floor(rnd() * 3), del = new Set();
        for (let t = 0; t < kdel * 4 && del.size < kdel; t++) {
            const i = Math.floor(rnd() * n);
            if (per[i] <= 1 || rnd() < 0.35) del.add(i);
        }
        if (!del.size || del.size >= n - 2) continue;
        // quello che resta deve stare in piedi da solo (grafo connesso)
        const map = new Map();
        cur.placed.forEach((_, i) => { if (!del.has(i)) map.set(i, map.size); });
        const adj2 = [...map.keys()].map((i) => adj[i].filter((j) => map.has(j)).map((j) => map.get(j)));
        if (!connected(adj2)) continue;
        const next = rebuild(cur.placed.filter((_, i) => !del.has(i)));
        grow(next, pool, plan, 2);   // prima solo parole con due o piu' incroci
        grow(next, pool, plan, 1);
        const m = measure(next, plan);
        if (m.score >= curM.score || rnd() < Math.exp((m.score - curM.score) / T)) {
            cur = next; curM = m;
            if (m.score > bestM.score) { best = next; bestM = m; }
        }
    }
    return { s: best, m: bestM };
}

/** Ritaglia, mette in verticale se serve, numera. */
function finalize(s) {
    const H = s.r1 - s.r0 + 1, W = s.c1 - s.c0 + 1;
    const flip = W > H;
    const w = flip ? H : W, h = flip ? W : H;
    const words = s.placed.map((p) => {
        let r = p.r - s.r0, c = p.c - s.c0, dir = p.d === 0 ? 'A' : 'D';
        if (flip) { [r, c] = [c, r]; dir = dir === 'A' ? 'D' : 'A'; }
        return { src: p.w, answer: p.w.answer, clue: p.w.clue, row: r, col: c, dir };
    });
    const starts = [...new Set(words.map((x) => x.row * w + x.col))].sort((a, b) => a - b);
    words.forEach((x) => { x.num = starts.indexOf(x.row * w + x.col) + 1; });
    // ordine: orizzontali poi verticali, per numero
    words.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'A' ? -1 : 1));
    return { w, h, words };
}

/** Il mazzo per una costruzione: tutte le parole del tema + parole generali secondo la scheda. */
function samplePool(avail, plan) {
    const themed = avail.filter((x) => x.temi.includes(plan.tema)).map((x) => Object.assign({}, x, { themed: true }));
    // le parole di altri temi restano a disposizione delle loro schede
    const by = { 1: [], 2: [], 3: [] };
    avail.filter((x) => !x.temi.length).forEach((x) => by[x.diff].push(x));
    Object.values(by).forEach(shuffle);
    const size = 220, n3 = 14, n2 = Math.round((size - n3) * plan.diff2), n1 = size - n3 - n2;
    return shuffle(themed.concat(by[1].slice(0, n1), by[2].slice(0, n2), by[3].slice(0, n3)));
}

/* ---------- costruzione ---------- */
const clean = DB.map((x) => ({ answer: x.answer, clue: x.clue, cat: x.cat || '', diff: x.diff, temi: x.temi || [] }))
    .filter((x) => /^[A-Z]{3,13}$/.test(x.answer) && !SKIP.has(x.answer) && x.clue && !/\b(o|oppure)\b.*\bper gli amici\b/i.test(x.clue))
    .map((x) => Object.assign(x, {
        len: x.answer.length, codes: [...x.answer].map((ch) => ch.charCodeAt(0)),
        tok: new Set(norm(x.clue).split(' ')), flat: norm(x.clue).replace(/ /g, ''),
        heavy: [...new Set(norm(x.clue).split(' ').filter((t) => t.length >= 5 && !STOP.has(t)))]
    }));
// coppie incompatibili nella stessa scheda: una definizione nomina l'altra risposta, o una risposta contiene l'altra
clean.forEach((x) => { x.clash = new Set(); });
for (let i = 0; i < clean.length; i++) {
    for (let j = i + 1; j < clean.length; j++) {
        const a = clean[i], b = clean[j];
        if (mentions(a, b.answer) || mentions(b, a.answer) || a.answer.includes(b.answer) || b.answer.includes(a.answer)) {
            a.clash.add(b.answer); b.clash.add(a.answer);
        }
    }
}

// le schede gia' pubblicate non si toccano: si ricopiano e le loro risposte restano prese
const SCHEDE_FILE = path.join(ROOT, 'assets', 'cruciverba-schede.js');
const frozen = fs.existsSync(SCHEDE_FILE) ? require(SCHEDE_FILE).cruciverbaSchede : [];
const taken = new Set(frozen.flatMap((p) => p.words.map((w) => w.answer)));
const out = [];
const t00 = Date.now();
const extra = frozen.filter((p) => !PLAN.some((x) => x.n === p.n));
if (extra.length) throw new Error('Schede pubblicate assenti dal PLAN: ' + extra.map((p) => p.n).join(', '));

for (const plan of PLAN.filter((p) => p.n <= UPTO)) {
    const old = frozen.find((p) => p.n === plan.n);
    if (old) {
        out.push(old);
        console.log(`N° ${plan.n} [${old.tema}] "${old.title}": congelata (${old.w}x${old.h}, ${old.words.length} parole)`);
        continue;
    }
    rnd = mulberry32(SEED + plan.n * 7919);
    const avail = clean.filter((x) => !taken.has(x.answer));
    const t0 = Date.now();
    let best = null;
    // almeno ATTEMPTS costruzioni; se la migliore resta sotto l'obiettivo di incroci, si insiste (fino al quintuplo)
    for (let i = 0; i < ATTEMPTS * 5 && (i < ATTEMPTS || best.m.ratio < GOAL_RATIO || best.m.d3 < plan.diff3[0]); i++) {
        const r = solve(samplePool(avail, plan), plan);
        if (r && (!best || r.m.score > best.m.score)) best = r;
    }
    const m = best.m, f = finalize(best.s);
    f.words.forEach((x) => taken.add(x.answer));
    const diffs = [1, 2, 3].map((d) => f.words.filter((x) => x.src.diff === d).length);
    const cats = {};
    f.words.forEach((x) => { cats[x.src.cat] = (cats[x.src.cat] || 0) + 1; });
    console.log(`N° ${plan.n} [${plan.tema}] "${plan.title}": ${f.w}x${f.h}, ${m.n} parole, a tema ${m.themed}, ` +
        `incroci ${m.X} (${m.ratio.toFixed(2)} per parola), ${m.leaves} con un solo incrocio, densita' ${Math.round(m.dens * 100)}%, ` +
        `diff 1/2/3 = ${diffs.join('/')}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log('   categorie: ' + Object.entries(cats).map(([k, v]) => k + ' ' + v).join(', '));
    out.push({
        n: plan.n, tema: plan.tema, title: plan.title, sottotitolo: plan.sottotitolo, w: f.w, h: f.h,
        words: f.words.map((x) => ({ answer: x.answer, clue: x.clue, row: x.row, col: x.col, dir: x.dir, num: x.num }))
    });
}

/* Errata: le schede pubblicate restano identiche (impronta nei test), ma se una
   definizione del database e' stata corretta dopo la pubblicazione (un fatto
   invecchiato, un trasferimento) il gioco mostra quella nuova. */
if (UPTO !== Infinity) { console.log('Prova (--upto): niente scritto.'); process.exit(0); }
const dbClue = new Map(DB.map((x) => [x.answer, x.clue]));
const errata = {};
for (const p of frozen) {
    for (const w of p.words) {
        if (!dbClue.has(w.answer)) throw new Error(`N° ${p.n}: ${w.answer} non e' piu' nel database`);
        if (dbClue.get(w.answer) !== w.clue) errata[w.answer] = dbClue.get(w.answer);
    }
}
if (Object.keys(errata).length) console.log('Errata per le schede pubblicate: ' + Object.keys(errata).join(', '));
const errataBody = Object.keys(errata).sort().map((k) => '  ' + k + ': ' + JSON.stringify(errata[k])).join(',\n');

const body = out.map((p) => '  {\n    n: ' + p.n + ', tema: ' + JSON.stringify(p.tema) + ', title: ' + JSON.stringify(p.title) + ',\n    sottotitolo: ' + JSON.stringify(p.sottotitolo) + ', w: ' + p.w + ', h: ' + p.h + ',\n    words: [\n' +
    p.words.map((x) => '      { answer: ' + JSON.stringify(x.answer) + ', clue: ' + JSON.stringify(x.clue) + ', row: ' + x.row + ', col: ' + x.col + ', dir: "' + x.dir + '", num: ' + x.num + ' }').join(',\n') +
    '\n    ]\n  }').join(',\n');
const file = `/* ==========================================================================
   QUIZZOTTI — Cruciverba: le schede fisse (N° 1 ... N° ${out.length})
   FILE GENERATO da scripts/build-cruciverba.js a partire da
   assets/db-cruciverba.js: non modificarlo a mano, rilancia lo script.
   tema: nazionale | champions | mondiali | bandiere | mercato | bar | stadi |
   anni90 | mister | estero.
   row/col partono da 0; dir "A" = orizzontale, "D" = verticale.
   cruciverbaErrata: definizioni corrette dopo la pubblicazione (risposta ->
   definizione nuova); il gioco le mostra al posto di quelle della scheda.
   ========================================================================== */
/* exported cruciverbaSchede, cruciverbaErrata */
const cruciverbaSchede = [
${body}
];

const cruciverbaErrata = {
${errataBody}
};

if (typeof module !== "undefined" && module.exports) { module.exports = { cruciverbaSchede, cruciverbaErrata }; }
`;
fs.writeFileSync(SCHEDE_FILE, file.replace(/\r?\n/g, '\r\n'));
console.log(`Scritto assets/cruciverba-schede.js (${out.length} schede) in ${((Date.now() - t00) / 1000).toFixed(1)} s`);
