'use strict';
/* ============================================================
   Presidente · Serie A — test/engine.test.js
   Test sul motore (sim.js + data.js): le formule economiche, la stagione
   intera giocata senza interfaccia, promozioni/retrocessioni e piramide
   viva, playoff e coppe, salvataggio/caricamento (comprese le migrazioni
   da salvataggi vecchi o rovinati), regioni, primati. Non testano
   l'interfaccia (ui.js) né il rendering, solo la logica pura del motore.

   data.js/rosters.js/sim.js dichiarano le loro funzioni con `const nome = ...`
   in cima al file (non `function nome(...)`), quindi vivono nello scope
   lessicale dello script, non come proprietà dell'oggetto globale: per
   poterle chiamare, il codice di test qui sotto viene concatenato agli
   stessi tre file ed eseguito come UN UNICO script in una sandbox Node
   (vm), invece di caricarli e poi provare ad accedervi dall'esterno (non
   funzionerebbe per le `const`). I risultati escono da quello script
   tramite `window.__RESULTS__`, l'unico modo pulito di "esportare" qualcosa
   da uno script classico non a moduli.

   Le funzioni di ui.js che il motore chiama a fine azione (toast,
   renderBoard, ...) sono stub vuoti definiti nella sandbox; localStorage è
   una mappa in memoria, così salvataggio e caricamento girano davvero.
   Math.random è sostituito da un generatore con seme fisso: gli stessi
   test danno sempre lo stesso esito (niente fallimenti "a caso").

   Uso: node test/engine.test.js — esce con codice 1 se un'asserzione fallisce.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const TEST_BODY = `
  var __R = { passed: 0, failed: 0, failures: [] };
  function __assert(cond, msg) { if (cond) __R.passed++; else { __R.failed++; __R.failures.push(msg); } }
  function __section(name, fn) { try { fn(); } catch (e) { __R.failed++; __R.failures.push('[' + name + '] eccezione: ' + (e && e.stack ? e.stack.split('\\n').slice(0, 3).join(' | ') : e)); } }

  /* ---------- generatore con seme: test ripetibili ---------- */
  function __seed(n) {
    var a = n >>> 0;
    Math.random = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  __seed(20261110);

  /* ---------- attrezzi comuni ---------- */
  function __finite(x) { return typeof x === 'number' && isFinite(x); }
  function __poolNames() { var all = []; POOLS.forEach(function (p) { p.forEach(function (c) { all.push(c.n); }); }); return all; }
  function __hasDup(list) { return new Set(list).size !== list.length; }
  function __poolSd(i) { var v = POOLS[i].map(function (c) { return c.s; }); var m = v.reduce(function (a, b) { return a + b; }, 0) / v.length; return Math.sqrt(v.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / v.length); }
  function __poolMean(i) { return POOLS[i].reduce(function (a, c) { return a + c.s; }, 0) / POOLS[i].length; }
  // Una carriera nuova di zecca, in modalità veloce (niente popup: gennaio, playoff ed eventi si risolvono da soli).
  function __newCareer(div, diff, club, region) {
    __clearStore();
    var t = genTakeovers(div)[2];
    startDynasty('Test', t, club == null ? 'Club Di Prova' : club, div, diff || 'medio', 15, false, region || null);
    S.turboMode = true;
    return S;
  }
  // Quello che fa la Dirigenza prima del calcio d'inizio, ridotto all'osso: rosa al minimo, cassa sufficiente.
  function __prepare() {
    normSquad();
    var guard = 0;
    while (S.squad.length < MIN_SQUAD && guard++ < 40) S.squad.push(freeAgent(randPos()));
    S.squad.forEach(function (p) { if (finalYear(p)) { p.yrs = 3; } });
    if (S.budget < kickoffBill() * 1.2) S.budget = Math.round(kickoffBill() * 1.2);
    normSquad();
  }
  // Gioca la stagione fino in fondo (endSeason compreso). Restituisce ctx._end.
  function __playSeason() {
    startSeason();
    var guard = 0;
    while (S.seasonActive && guard++ < 400) { S._pause = false; simToEnd(); }
    return S._end;
  }

  /* ---------------- wageFor: monotona crescente, sempre positiva ---------------- */
  __section('wageFor', function () {
    S = { div: 2, difficulty: 'medio' };
    var samples = [45, 55, 65, 75, 85, 95];
    var prevCeil = -1;
    samples.forEach(function (ovr) {
      var max = 0;
      for (var i = 0; i < 40; i++) max = Math.max(max, wageFor(ovr));
      __assert(max > prevCeil, 'wageFor(' + ovr + ') dovrebbe superare il campione precedente (max=' + max + ', prevCeil=' + prevCeil + ')');
      __assert(max > 0, 'wageFor(' + ovr + ') deve essere positivo');
      prevCeil = max * 0.85;
    });
    // la difficoltà sposta gli stipendi nella direzione dichiarata
    var avg = function (diff, div) { S = { div: div, difficulty: diff }; var t = 0; for (var i = 0; i < 400; i++) t += wageFor(70); return t / 400; };
    __assert(avg('estremo', 2) > avg('medio', 2) && avg('medio', 2) > avg('facile', 2), 'wageFor: stipendi crescenti con la difficoltà');
    __assert(avg('medio', 5) < avg('medio', 4), 'wageFor: in Serie A lo stesso overall chiede meno che in Serie B (sconto di categoria)');
    __assert(roundWage(123) === 250 && roundWage(7777) === 8000 && roundWage(123456) === 123000, 'roundWage: arrotondamenti per fascia');
    S = null;
  });

  /* ---------------- computeWorth: formula esatta su un ctx sintetico ---------------- */
  __section('computeWorth', function () {
    var ctx = {
      div: 2,
      squad: [
        { wage: 1000, ovr: 70, age: 25 },
        { wage: 2000, ovr: 90, age: 20 },
      ],
      stadiumSpent: 1e6, prestige: 5e6, fanbase: 1.5, budget: 2e6,
    };
    var squadVal = 1000 * 52 * 5 * 1 + 2000 * 52 * 9 * 1.4;
    var brand = Math.round((1.5 - 1) * WORTH_BASE[2] * 0.6);
    var expected = Math.round(WORTH_BASE[2] + squadVal + 1e6 * 1.25 + 5e6 + brand + 2e6 * 0.8);
    var got = computeWorth(ctx);
    __assert(got === expected, 'computeWorth: atteso ' + expected + ', ottenuto ' + got);

    // Il debito non deve MAI sottrarre valore oltre a semplicemente non aggiungerne (Math.max(0, budget)
    // nella formula): il valore con budget negativo deve essere esattamente quello SENZA il
    // contributo cassa (got meno il termine budget*0.8 originale), non un numero più basso ancora.
    var ctxNegBudget = Object.assign({}, ctx, { budget: -5e6 });
    var gotNeg = computeWorth(ctxNegBudget);
    var expectedNeg = got - Math.round(ctx.budget * 0.8);
    __assert(gotNeg === expectedNeg, 'computeWorth con budget negativo: atteso ' + expectedNeg + ' (nessun contributo cassa), ottenuto ' + gotNeg);
    __assert(gotNeg < got, 'computeWorth con budget negativo deve comunque valere meno della versione con cassa positiva');
  });

  /* ---------------- valore di mercato, offerte, costi ---------------- */
  __section('economia', function () {
    // sotto la soglia la formula è quella di sempre
    __assert(playerValue({ wage: 1000, ovr: 70, age: 25 }) === 1000 * 52 * 5, 'playerValue: fascia 68-77, età piena');
    __assert(playerValue({ wage: 1000, ovr: 60, age: 22 }) === 1000 * 52 * 3.5 * 1.4, 'playerValue: giovane sotto il 68');
    __assert(playerValue({ wage: 1000, ovr: 86, age: 32 }) === 1000 * 52 * 9 * 0.6, 'playerValue: veterano sopra l\\'85');
    // oltre la soglia cresce ancora, ma molto più piano, e resta monotona
    var raw = function (w) { return w * 52 * 9 * 1.4; };
    var big = playerValue({ wage: 2e6, ovr: 100, age: 21 });
    __assert(raw(2e6) > 1e9 && big < 500e6 && big > VALUE_SOFT_CAP, 'playerValue: un cartellino da oltre un miliardo viene frenato (ottenuto ' + big + ')');
    var prev = 0, mono = true;
    for (var w = 1000; w < 3e6; w *= 1.3) { var v = playerValue({ wage: w, ovr: 90, age: 25 }); if (v <= prev) mono = false; prev = v; }
    __assert(mono, 'playerValue: sempre crescente con lo stipendio, anche oltre la soglia');
    __assert(loanBuybackFee({ wage: 1000, ovr: 70, age: 25 }) === Math.round(260000 * 0.75), 'loanBuybackFee = 75% del valore');
    __assert(janTransferFee({ wage: 1000, ovr: 70, age: 25 }) === Math.round(260000 * 0.6), 'janTransferFee = 60% del valore');

    __newCareer(2, 'medio');
    var bill = kickoffBill();
    __assert(bill === wageBill() + S.manager.salary, 'kickoffBill = monte ingaggi + allenatore (senza altro staff)');
    S.sportingDirector = { n: 'DS', rating: 60, salary: 12345 }; S.fitnessCoach = { n: 'PA', rating: 60, salary: 1000 };
    __assert(kickoffBill() === bill + 12345 + 1000, 'kickoffBill somma direttore sportivo e preparatore');
    S.sportingDirector = null; S.fitnessCoach = null;
    // spin: ogni acquisto della stessa estate costa il 30% in più
    var c0 = spinCostNow(false); S.spinsBought = 1; var c1 = spinCostNow(false); S.spinsBought = 0;
    __assert(c1 > c0 * 1.25 && c1 < c0 * 1.35, 'spinCostNow: +30% a ogni spin della stessa stagione (' + c0 + ' -> ' + c1 + ')');
    __assert(spinCostNow(true) > spinCostNow(false), 'lo spin di lusso costa più di quello base');
    // spinPlayer rispetta la fascia e il tetto di categoria
    var okBand = true;
    for (var i = 0; i < 300; i++) {
      var p = spinPlayer(i % 2 === 0, null);
      var cap = SPIN_CAPS[S.div][i % 2 === 0 ? 'premium' : 'base'];
      if (!(p.ovr <= cap && p.ovr >= DIVS[S.div].avg && __finite(p.wage) && p.wage > 0 && POS_LABEL[p.pos])) okBand = false;
    }
    __assert(okBand, 'spinPlayer: overall fra la media di categoria e il tetto, stipendio positivo, ruolo valido');
    // offerte: mai per chi è in prestito da noi, sempre con cifra e club validi
    S.squad.forEach(function (p, i) { p.ovr = DIVS[2].avg + 8; p.pid = p.pid || (1000 + i); p.loan = true; });
    __assert(genOffers().length === 0, 'genOffers: nessuna offerta per giocatori presi in prestito');
    S.squad.forEach(function (p) { p.loan = false; });
    var offers = genOffers();
    __assert(offers.length >= 1 && offers.length <= 3, 'genOffers: da 1 a 3 offerte per una rosa di spicco (ottenute ' + offers.length + ')');
    __assert(offers.every(function (o) { return __finite(o.fee) && o.fee > 0 && typeof o.club === 'string' && o.club && o.club !== S.club; }), 'genOffers: cifra positiva e club acquirente valido');
    __assert(typeof buyerClub(5e9) === 'string', 'buyerClub: anche una cifra fuori scala trova un acquirente');
    // prestito in uscita: non conta più nella forza della squadra
    var before = squadStr();
    var best = S.squad.slice().sort(function (a, b) { return b.ovr - a.ovr; })[0];
    best.ovr += 20; var boosted = squadStr(); best.loanedOut = true;
    __assert(boosted > before && squadStr() < boosted, 'squadStr: chi è in prestito altrove non conta');
    best.loanedOut = false; best.ovr -= 20;
    // eventi: una percentuale di cassa ha lo stesso segno anche con la cassa in rosso
    __assert(narrativeBudgetDelta(1e6, 0.01) === 10000 && narrativeBudgetDelta(-1e6, 0.01) === 10000 && narrativeBudgetDelta(-1e6, -0.01) === -10000, 'narrativeBudgetDelta: il segno segue la percentuale, non la cassa');
    __assert(narrativeBudgetDelta(NaN, 0.01) === 0 && narrativeBudgetDelta(0, 0.5) === 0, 'narrativeBudgetDelta: mai NaN');
    __assert(fmtMoney(NaN) === '€0' && fmtMoney(-1500000) === '-€1.5M' && fmtMoney(2.5e9) === '€2.5Mld', 'fmtMoney: casi limite');
  });

  /* ---------------- dati: gironi e regioni ---------------- */
  __section('gironi e regioni', function () {
    resetPools(null);
    __assert(!__hasDup(__poolNames()), 'POOLS: nessun club compare due volte nella piramide');
    POOLS.forEach(function (p, i) { __assert(p.length === DIVS[i].teams, 'POOLS[' + i + '] ha ' + DIVS[i].teams + ' squadre (trovate ' + p.length + ')'); });
    var fan = function (list) { return list.map(function (c) { return c.s; }).sort(function (a, b) { return b - a; }).join(','); };
    var upper = []; for (var i = 2; i < POOLS.length; i++) POOLS[i].forEach(function (c) { upper.push(c.n); });
    REGIONS.forEach(function (r) {
      __assert(r.promozione.length === DIVS[0].teams && r.eccellenza.length === DIVS[1].teams, 'regione ' + r.key + ': 24 + 24 squadre');
      __assert(fan(r.promozione) === fan(REGIONS[0].promozione) && fan(r.eccellenza) === fan(REGIONS[0].eccellenza), 'regione ' + r.key + ': stesso ventaglio di forza del Lazio');
      var names = r.promozione.concat(r.eccellenza).map(function (c) { return c.n; });
      __assert(!__hasDup(names.concat(upper)), 'regione ' + r.key + ': nessun nome doppio, nemmeno con le categorie nazionali');
    });
    DERBIES.forEach(function (pair) { __assert(pair.length === 2 && pair[0] !== pair[1], 'derby ben formato: ' + pair.join(' - ')); });

    // la regione scelta finisce in POOLS, per copia
    var template = JSON.stringify(REGIONS);
    __newCareer(0, 'medio', null, 'lombardia');
    var lomb = REGIONS.find(function (r) { return r.key === 'lombardia'; });
    __assert(POOLS[0].map(function (c) { return c.n; }).join('|') === lomb.promozione.map(function (c) { return c.n; }).join('|'), 'startDynasty: Promozione della regione scelta');
    __assert(POOLS[1].map(function (c) { return c.n; }).join('|') === lomb.eccellenza.map(function (c) { return c.n; }).join('|'), 'startDynasty: Eccellenza della regione scelta');
    __assert(S.region === 'lombardia', 'la regione resta scritta nel salvataggio');
    POOLS[0][0].s = 99; POOLS[0][0].n = 'Manomesso';
    __assert(JSON.stringify(REGIONS) === template, 'i modelli REGIONS non vengono mai toccati dalla piramide viva');
    // una carriera nuova NON eredita i gironi di quella precedente
    POOLS[3][0].n = 'Residuo Di Un\\'Altra Carriera'; POOLS[4].pop();
    __newCareer(3, 'medio', null, null);
    __assert(POOLS[3].every(function (c) { return c.n.indexOf('Residuo') < 0; }) && POOLS[4].length === DIVS[4].teams, 'startDynasty riparte dalla piramide di partenza');
    __assert(POOLS[0][0].n === REGIONS[0].promozione[0].n, 'senza regione valgono i gironi del Lazio');
    __assert(!__hasDup(__poolNames()), 'dopo un cambio di regione nessun nome doppio');
  });

  /* ---------------- rivals(): sempre teams-1 avversari ---------------- */
  __section('rivals', function () {
    __newCareer(4, 'medio', 'Club Di Prova');
    var r = rivals();
    __assert(r.length === DIVS[4].teams - 1, 'rivals: 19 avversari in Serie B con un nome nuovo');
    var weakest = POOLS[4].slice().sort(function (a, b) { return a.s - b.s; })[0];
    __assert(r.indexOf(weakest) < 0 || POOLS[4].filter(function (c) { return c.s === weakest.s; }).length > 1, 'rivals: resta fuori il club più debole del girone');
    // dopo un giro di promozioni l'ultimo dell'array non è più il più debole: non deve sparire lui
    var moved = POOLS[4].shift(); POOLS[4].push(moved);
    __assert(rivals().indexOf(moved) >= 0, 'rivals: non sparisce l\\'ultimo arrivato in fondo all\\'elenco');
    // omonimo nel girone: è il suo posto che prendiamo
    S.club = POOLS[4][3].n;
    r = rivals();
    __assert(r.length === DIVS[4].teams - 1 && r.every(function (c) { return c.n !== S.club; }), 'rivals: l\\'omonimo del nostro club non è un avversario');
    // doppione nel girone (salvataggi vecchi): mai due volte lo stesso nome, e sempre 19
    S.club = 'Club Di Prova';
    POOLS[4][5] = { n: POOLS[4][6].n, s: 70 };
    r = rivals();
    __assert(r.length === DIVS[4].teams - 1 && !__hasDup(r.map(function (c) { return c.n; })), 'rivals: un nome ripetuto nel girone non produce né doppioni né buchi');
    // girone decimato: si completa
    POOLS[4].length = 10;
    r = rivals();
    __assert(r.length === DIVS[4].teams - 1 && !__hasDup(r.map(function (c) { return c.n; })) && r.every(function (c) { return __finite(c.s); }), 'rivals: un girone a corto di squadre viene completato');
    resetPools(null);
  });

  /* ---------------- playoff: bracket valido e risoluzione fino in fondo ---------------- */
  __section('playoff', function () {
    function mkPlayer(ovr, pos) { return { pid: Math.random(), n: 'P' + Math.round(Math.random() * 1e6), pos: pos, ovr: ovr, age: 25, formSeason: 1, seasonGoals: 0, seasonAssists: 0, seasonCleanSheets: 0, seasonApps: 0, outWeeks: 0, suspMatches: 0 }; }
    [0, 2, 3, 4].forEach(function (div) {
      var squad = [];
      for (var i = 0; i < 4; i++) squad.push(mkPlayer(60, 'DIF'));
      for (var j = 0; j < 4; j++) squad.push(mkPlayer(60, 'CEN'));
      for (var k = 0; k < 3; k++) squad.push(mkPlayer(60, 'ATT'));
      squad.push(mkPlayer(60, 'POR'));
      var d = DIVS[div];
      var lo = d.promoted + 1, hi = d.promoted + d.playoff;
      for (var pos = lo; pos <= hi; pos++) {
        var ctx = {
          div: div, season: 1, club: '__TestClub__', squad: squad, formation: '433', manager: { rating: 60, spec: 'tactician' },
          sent: 55, form: 0, promoStreak: 0, difficulty: 'medio', cups: {}, chem: {}, _congestion: 0,
          table: [], results: [], played: 1, pts: 1, gf: 1, ga: 0, _mgrByClub: {},
        };
        // Stessa identica costruzione di ctx.opps usata da startSeason: club veri del girone,
        // ciascuno con forza effettiva/formazione/personalità/allenatore — buildPlayoffPlan ne ha
        // bisogno per stimare gli avversari ipotetici del tabellone.
        var usedMgrNames = new Set([ctx.manager.n]);
        var mgrRegistry = ctx._mgrByClub;
        ctx.opps = rivals(ctx).map(function (o) {
          return { name: o.n, s: o.s, effS: clamp(o.s + gaussInt(0, 8), 30, 99), rrPts: 0, rrGF: 0, rrGA: 0, vsPts: 0, vsGF: 0, vsGA: 0, mgr: managerForClub(o.n, 0, ctx, usedMgrNames, mgrRegistry), fmt: randomFmt(), personality: personalityFor(o) };
        });
        // Posiziona la nostra riga in ogni posto della zona playoff, a turno: computeTable la
        // ricostruirebbe da sola a fine stagione vera, qui basta una classifica plausibile.
        ctx.played = gp(ctx); ctx.pts = 40; ctx.gf = 40; ctx.ga = 30;
        computeTable(ctx);
        var myRow = ctx.table.find(function (r) { return r.me; });
        ctx.table = ctx.table.filter(function (r) { return !r.me; });
        ctx.table.splice(pos - 1, 0, myRow);
        var plan = buildPlayoffPlan(ctx, pos, d, lo, hi);
        var queue = flattenPlayoffQueue(plan);
        __assert(Array.isArray(queue) && queue.length > 0, 'flattenPlayoffQueue deve produrre almeno una gara (' + d.name + ', ' + pos + '°)');
        __assert(plan.every(function (st) { return st.oppPos >= lo && st.oppPos <= hi && st.oppPos !== pos; }), 'playoff ' + d.name + ' ' + pos + '°: ogni avversario è un\\'altra squadra della zona playoff');
        if (d.playoff >= 6) __assert(plan.length === (pos <= lo + 1 ? 2 : 3), 'playoff a 6: le prime due teste di serie saltano i quarti (' + pos + '°)');
        else __assert(plan.length === 2, 'playoff a 4: semifinale + finale');

        var pf = { pos: pos, rounds: [], queue: queue.slice(), done: false, won: false, legAcc: null };
        ctx._playoffState = pf;
        var guard = 0;
        while (!pf.done && guard < 100) { playNextPlayoffStep(ctx); guard++; }
        __assert(pf.done === true && guard < 100, 'il playoff deve risolversi senza loop (' + d.name + ', ' + pos + '°)');
        __assert(typeof pf.won === 'boolean', 'pf.won deve essere un booleano dopo la risoluzione');
        __assert(pf.rounds.length > 0, 'il playoff deve produrre almeno un turno giocato');
        __assert(pf.rounds.every(function (r) { return __finite(r.gf) && __finite(r.ga) && r.gf >= 0 && r.ga >= 0; }), 'playoff: punteggi validi');
        __assert(playNextPlayoffStep(ctx) === null, 'playoff concluso: un passo in più non fa nulla');
      }
    });
  });

  /* ---------------- una carriera intera, senza interfaccia ---------------- */
  __section('carriera', function () {
    [[0, 'medio'], [3, 'difficile'], [4, 'facile'], [5, 'medio']].forEach(function (cfg) {
      __seed(1000 + cfg[0]);
      __newCareer(cfg[0], cfg[1]);
      var tag = DIVS[cfg[0]].name + '/' + cfg[1];
      var okAll = true, why = '';
      var fail = function (m) { if (okAll) why = m; okAll = false; };
      for (var s = 1; s <= 8 && okAll; s++) {
        __prepare();
        var div0 = S.div, budget0 = S.budget, bill = kickoffBill();
        startSeason();
        if (!S.seasonActive) { fail('stagione ' + s + ' non partita'); break; }
        if (S.budget !== budget0 - bill) fail('al calcio d\\'inizio si paga esattamente il monte ingaggi');
        if (S.opps.length !== DIVS[div0].teams - 1 || S.fixtures.length !== gp()) fail('calendario incompleto: ' + S.opps.length + ' rivali, ' + S.fixtures.length + ' giornate');
        if (__hasDup(S.opps.map(function (o) { return o.name; }).concat([S.club]))) fail('due club con lo stesso nome nel campionato');
        var eachTwice = S.opps.every(function (o, i) { return S.fixtures.filter(function (f) { return f.opp === i && f.home; }).length === 1 && S.fixtures.filter(function (f) { return f.opp === i && !f.home; }).length === 1; });
        if (!eachTwice) fail('ogni rivale va affrontato una volta in casa e una fuori');
        var guard = 0, budgetKick = S.budget;
        while (S.seasonActive && guard++ < 400) { S._pause = false; simToEnd(); }
        var e = S._end;
        if (!e) { fail('stagione ' + s + ' non conclusa'); break; }
        if (S.played !== gp()) fail('giornate giocate ' + S.played + ' su ' + gp());
        if (S.results.length !== gp()) fail('risultati registrati ' + S.results.length);
        var w = S.results.filter(function (r) { return r.res === 'W'; }).length, dr = S.results.filter(function (r) { return r.res === 'D'; }).length;
        if (S.pts !== w * 3 + dr || S.wins !== w) fail('punti/vittorie non coerenti con i risultati');
        if (S.gf !== S.results.reduce(function (a, r) { return a + r.gf; }, 0)) fail('gol fatti non coerenti');
        if (S.table.length !== DIVS[div0].teams || e.pos < 1 || e.pos > DIVS[div0].teams) fail('classifica o posizione fuori scala');
        if (!S.table.every(function (r) { return __finite(r.pts) && __finite(r.gd); })) fail('classifica con valori non numerici');
        if (e.promoted && e.relegated) fail('promosso e retrocesso insieme');
        if (e.relegated && !(DIVS[div0].releg > 0 && e.pos > DIVS[div0].teams - DIVS[div0].releg)) fail('retrocessione fuori dalla zona retrocessione');
        if (e.promoted && !(e.pos <= DIVS[div0].promoted + DIVS[div0].playoff)) fail('promozione da fuori zona promozione/playoff');
        if (div0 === 5 && e.promoted) fail('promozione dalla Serie A');
        if (div0 === 0 && e.relegated) fail('retrocessione dalla Promozione');
        // bilancio: la cassa si muove esattamente del saldo dichiarato (più l\\'eventuale esito del fondo)
        var extra = (e.investorCompleted ? e.investorCompleted.completionBonus : 0) - (e.investorFailedPenalty || 0);
        if (S.budget !== budgetKick + e.net + extra) fail('cassa di fine stagione diversa da cassa + saldo (' + S.budget + ' vs ' + (budgetKick + e.net + extra) + ')');
        var sum = e.statement.reduce(function (a, r) { return a + r[1]; }, 0);
        if (sum !== e.net + extra) fail('le voci del rendiconto non sommano al saldo');
        if (!__finite(S.budget) || !__finite(S.sent) || !__finite(S.fanbase) || !__finite(S.ownerRating) || !__finite(S.prestige) || !__finite(e.worth)) fail('valore non numerico nello stato');
        if (S.sent < 0 || S.sent > 100 || S.ownerRating < 0 || S.ownerRating > 100 || S.fanbase < 0.7 || S.fanbase > 3) fail('umore/gradimento/tifoseria fuori dai limiti');
        if (!S.squad.every(function (p) { return __finite(p.ovr) && __finite(p.age) && __finite(p.wage) && p.wage > 0 && p.ovr >= 40 && p.ovr <= 110; })) fail('giocatore con numeri non validi');
        if (S.history.length !== s || S.history[s - 1].pos !== e.pos) fail('storico non aggiornato');
        if (!Array.isArray(e.newRecords)) fail('newRecords mancante nel riepilogo');
        if (e.fate) break;
        var wagesBefore = S.squad.reduce(function (a, p) { return a + p.wage; }, 0), seasonBefore = S.season;
        advance();
        if (S.season !== seasonBefore + 1) fail('la stagione non avanza');
        if (S.div !== clamp(div0 + (e.promoted ? 1 : 0) - (e.relegated ? 1 : 0), 0, 5)) fail('categoria non coerente con promozione/retrocessione');
        if (S.promoStreak !== (e.promoted ? 1 : 0) && !(e.promoted && S.promoStreak > 1)) fail('promoStreak');
        POOLS.forEach(function (p, i) { if (p.length !== DIVS[i].teams) fail('girone ' + i + ' con ' + p.length + ' squadre dopo la stagione ' + s); });
        if (__hasDup(__poolNames())) fail('nome doppio nella piramide dopo la stagione ' + s);
        if (!POOLS.every(function (p) { return p.every(function (c) { return __finite(c.s) && c.s >= 30 && c.s <= 99; }); })) fail('forza di un rivale fuori scala');
        if (S._end !== null || S.spinsBought !== 0) fail('stato di fine stagione non ripulito');
        S.squad = S.squad.filter(function (p) { return !p._retiring; });
      }
      __assert(okAll, 'carriera ' + tag + ': ' + (why || 'ok'));
    });
  });

  /* ---------------- promozione / retrocessione ai bordi della piramide ---------------- */
  __section('bordi', function () {
    var run = function (div, end) {
      __newCareer(div, 'medio'); __prepare();
      var w0 = S.squad[0].wage;
      S.table = []; S._end = Object.assign({ promoted: false, relegated: false, title: false }, end);
      advance();
      return { div: S.div, ratio: S.squad.length ? S.squad[0].wage / w0 : 1, streak: S.promoStreak, dom: S.dominance, ach: S.achievements.slice() };
    };
    var up = run(2, { promoted: true });
    __assert(up.div === 3 && up.streak === 1, 'promozione: una categoria su, promoStreak a 1');
    __assert(up.ratio > 1.2 && up.ratio < 1.3, 'promozione: stipendi +25% (rapporto ' + up.ratio.toFixed(3) + ')');
    __assert(up.ach.indexOf('first_promo') >= 0, 'prima promozione: traguardo sbloccato');
    var down = run(2, { relegated: true });
    __assert(down.div === 1 && down.streak === 0 && down.ratio < 0.9, 'retrocessione: una categoria giù, stipendi tagliati');
    __assert(run(0, { relegated: true }).div === 0, 'non si scende sotto la Promozione');
    __assert(run(5, { promoted: true }).div === 5, 'non si sale sopra la Serie A');
    var a = run(4, { promoted: true });
    __assert(a.div === 5 && a.ach.indexOf('serie_a') >= 0, 'arrivo in Serie A: traguardo sbloccato');
    var stay = run(5, {});
    __assert(stay.ratio > 1.05 && stay.ratio < 1.11, 'Serie A senza promozione: inflazione stipendi +8%');
    // titoli di fila senza salire: alimentano la rincorsa delle rivali, e si azzerano cambiando categoria
    __assert(run(5, { title: true }).dom === 1 && run(5, {}).dom === 0 && run(3, { title: true, promoted: true }).dom === 0, 'dominance: +1 col titolo in Serie A, 0 con una promozione');
    __newCareer(5, 'medio'); __prepare();
    __assert(rivalChase(S).size === 0, 'rincorsa: nessun rinforzo senza titoli di fila');
    S.dominance = 3; S.squad.forEach(function (p) { p.ovr = 104; });
    var ch = rivalChase(S), sorted = rivals().slice().sort(function (x, y) { return y.s - x.s; });
    __assert(ch.get(sorted[0]) > 0 && ch.get(sorted[0]) <= CHASE_CAP && ch.get(sorted[0]) > ch.get(sorted[10]) && ch.get(sorted[10]) > 0, 'rincorsa: le prime sei si rinforzano più delle altre, entro il tetto');
    S.dominance = 1; var one = rivalChase(S).get(sorted[0]); S.dominance = 4;
    __assert(rivalChase(S).get(sorted[0]) > one, 'rincorsa: cresce con i titoli consecutivi');
    var base = POOLS[5].map(function (c) { return c.s; }).join(',');
    startSeason();
    __assert(S.opps.some(function (o) { return o.s > 99; }) && POOLS[5].map(function (c) { return c.s; }).join(',') === base, 'rincorsa: rinforza i rivali della stagione, non la forza di base in POOLS');
  });

  /* ---------------- piramide viva: niente appiattimento, niente derive ---------------- */
  __section('piramide', function () {
    __seed(77);
    __newCareer(2, 'medio');
    var sd0 = POOLS.map(function (_, i) { return __poolSd(i); }), mean0 = POOLS.map(function (_, i) { return __poolMean(i); });
    var topA = POOLS[5].slice().sort(function (a, b) { return b.s - a.s; })[0].n;
    var moved = false, okSizes = true, okDup = true;
    var b0 = POOLS[4].map(function (c) { return c.n; }).sort().join('|');
    for (var y = 0; y < 30; y++) {
      S.season = y + 1; S.table = [];
      simulatePyramidMovement(S, evolveOtherDivisions(S));
      rebalancePools();
      POOLS.forEach(function (p, i) { if (p.length !== DIVS[i].teams) okSizes = false; });
      if (__hasDup(__poolNames())) okDup = false;
    }
    if (POOLS[4].map(function (c) { return c.n; }).sort().join('|') !== b0) moved = true;
    __assert(okSizes, 'piramide: ogni girone conserva il suo numero di squadre per 30 stagioni');
    __assert(okDup, 'piramide: mai un nome doppio in 30 stagioni');
    __assert(moved, 'piramide: i gironi cambiano composizione negli anni');
    POOLS.forEach(function (_, i) {
      var sd = __poolSd(i), m = __poolMean(i);
      __assert(sd > sd0[i] * 0.7 && sd < sd0[i] * 1.4, 'piramide: lo scarto di forza di ' + DIVS[i].name + ' resta vivo dopo 30 stagioni (' + sd0[i].toFixed(1) + ' -> ' + sd.toFixed(1) + ')');
      __assert(Math.abs(m - mean0[i]) < 2, 'piramide: la forza media di ' + DIVS[i].name + ' non deriva (' + mean0[i].toFixed(1) + ' -> ' + m.toFixed(1) + ')');
    });
    // chi sale arriva nella parte bassa, chi scende fra le favorite
    resetPools(null);
    var bTop = Math.max.apply(null, POOLS[4].map(function (c) { return c.s; })), aLow = Math.min.apply(null, POOLS[5].map(function (c) { return c.s; }));
    __assert(promotedStrength(bTop, 4) < __poolMean(5), 'la prima della Serie B entra in Serie A sotto la media (' + promotedStrength(bTop, 4) + ')');
    __assert(promotedStrength(bTop, 4) > aLow, 'ma non da ultima della classe');
    __assert(relegatedStrength(aLow, 5) > __poolMean(4) - 2.5 && relegatedStrength(__poolMean(5) - 6, 5) > __poolMean(4), 'una retrocessa dalla Serie A riparte fra le prime della Serie B');
    __assert(promotedStrength(60, 2) > promotedStrength(50, 2) && relegatedStrength(80, 5) > relegatedStrength(70, 5), 'cambio di categoria: chi era più forte resta più forte');
    // il piazzamento vero del presidente decide chi sale e chi scende nel SUO girone
    __newCareer(3, 'medio'); S.season = 4;
    var field = rivals();
    field.forEach(function (c, i) { c._seasonAt = 4; c._seasonPos = i + 2; });   // noi primi, loro dal 2° in giù nell'ordine dell'elenco
    var last4 = field.slice(-4).map(function (c) { return c.n; }), second = field[0].n;
    simulatePyramidMovement(S, null);
    __assert(last4.every(function (n) { return POOLS[2].some(function (c) { return c.n === n; }); }), 'Serie C: retrocedono le ultime quattro della classifica vera');
    __assert(POOLS[4].some(function (c) { return c.n === second; }), 'Serie C: la seconda in classifica sale in Serie B');
    __assert(POOLS[3].length === 24 && POOLS[4].length === 20 && POOLS[2].length === 24, 'movimento: numero di squadre invariato');
    resetPools(null);
  });

  /* ---------------- aspettative e obiettivo di stagione ---------------- */
  __section('aspettative', function () {
    __seed(5);
    __newCareer(2, 'medio'); __prepare(); startSeason();
    var avg = DIVS[2].avg;
    var expAt = function (ovr, diff) { S.squad.forEach(function (p) { p.ovr = ovr; }); S.difficulty = diff || 'medio'; return expectedPos(); };
    var weak = expAt(avg - 10), mid = expAt(avg), strong = expAt(avg + 6), top = expAt(avg + 20);
    __assert(weak > mid && mid > strong && strong >= top, 'expectedPos: migliora con la forza della rosa (' + [weak, mid, strong, top].join(' > ') + ')');
    __assert(top === 1 && weak >= 15 && weak <= 24, 'expectedPos: 1° per una rosa fuori categoria, in fondo per una molto debole (' + top + ', ' + weak + ')');
    __assert(mid >= 6 && mid <= 13, 'expectedPos: una rosa nella media punta alla parte sinistra della classifica, non al titolo (' + mid + '°)');
    __assert(strong > 1, 'expectedPos: una rosa buona ma non dominante non è data per vincente (' + strong + '°)');
    __assert(expAt(avg + 4, 'estremo') > expAt(avg + 4, 'medio') && expAt(avg + 4, 'medio') >= expAt(avg + 4, 'facile'), 'expectedPos: la difficoltà (handicap in campo) abbassa le attese invece di ignorarle');
    S.difficulty = 'medio';
    // l\\'esito dell\\'obiettivo corrisponde all\\'etichetta
    var endWith = function (div, target, myPts, aheadCount) {
      __newCareer(div, 'medio'); __prepare(); startSeason();
      while (S.played < gp() - 1) simMatch(S, { gf: 1, ga: 1 });
      S.seasonTargetInfo = target;
      S.cups.nat.out = true;
      S.opps.forEach(function (o, i) { o.rrPts = i < aheadCount ? 500 : 0; o.vsPts = 0; });
      S.pts = myPts;
      simMatch(S, { gf: 1, ga: 0 });
      return S._end;
    };
    var met = function (e) { return e.sentItems.some(function (r) { return r[0].indexOf('centrato') >= 0; }); };
    var e1 = endWith(5, { key: 'vertice', label: 'lottare per un posto in Europa', exp: 3 }, 100, 2);
    __assert(e1.pos === 3 && e1.euroQual === 'ucl' && met(e1), 'obiettivo "posto in Europa": centrato col 3° posto, non serve lo scudetto');
    var e2 = endWith(5, { key: 'vertice', label: 'vincere lo scudetto', exp: 1 }, 100, 1);
    __assert(e2.pos === 2 && !met(e2), 'obiettivo "vincere lo scudetto": il 2° posto non basta');
    var e3 = endWith(1, { key: 'vertice', label: 'lottare per la vittoria del campionato', exp: 1 }, 100, 1);
    __assert(e3.pos === 2 && e3.promoted && met(e3), 'obiettivo "lottare per la vittoria": la promozione diretta da secondi lo centra');
    var e4 = endWith(3, { key: 'playoff', label: 'giocarsi la promozione nei playoff', exp: 5 }, 100, 3);
    __assert(e4.pos === 4 && !!e4.playoff && met(e4), 'obiettivo "giocarsi i playoff": centrato arrivando ai playoff, anche senza promozione');
    var e5 = endWith(3, { key: 'playoff', label: 'giocarsi la promozione nei playoff', exp: 5 }, 100, 10);
    __assert(e5.pos === 11 && !met(e5), 'obiettivo "giocarsi i playoff": mancato da metà classifica');
  });

  /* ---------------- coppe ---------------- */
  __section('coppe', function () {
    __seed(9);
    __newCareer(5, 'medio'); __prepare(); startSeason();
    // gara secca: chi "perde il sorteggio" non passa più grazie a un pareggio
    var wins = 0, expected = 0, N = 3000, coherent = true;
    for (var i = 0; i < N; i++) {
      S.cups.nat = { name: 'Coppa Italia', rounds: ['Ottavi', 'Quarti', 'Semifinale', 'Finale'], at: 0, legAt: 0, legIndex: 0, out: false, won: false };
      S.squad.forEach(function (p) { p.outWeeks = 0; p.suspMatches = 0; p.fatigue = 0; });
      resolveNatRound(S);
      var step = S.cups.nat.path[0];
      expected += 1 / (1 + Math.exp(-(teamEff(S) - S.cups.nat.roundOppStr) / 6.5));
      if (step.won) wins++;
      if (step.won !== (step.gf >= step.ga) || step.won === S.cups.nat.out) coherent = false;
    }
    __assert(coherent, 'coppa a gara secca: punteggio ed esito sempre coerenti');
    __assert(Math.abs(wins / N - expected / N) < 0.035, 'coppa a gara secca: si passa il turno con la probabilità prevista (' + (wins / N).toFixed(3) + ' contro ' + (expected / N).toFixed(3) + ')');
    // semifinale raggiunta = "bel percorso", in ogni categoria
    var sfBump = function (div, at) {
      __newCareer(div, 'medio'); __prepare(); startSeason();
      while (S.played < gp() - 1) simMatch(S, { gf: 1, ga: 1 });
      S.cups.nat.at = at; S.cups.nat.out = true; S.cups.nat.won = false; S.cups.nat.legIndex = 99;
      simMatch(S, { gf: 1, ga: 1 });
      return S._end.sentItems.some(function (r) { return r[0] === 'Un bel percorso in coppa'; });
    };
    __assert(sfBump(5, 2) && !sfBump(5, 1), 'Coppa Italia in Serie A: il "bel percorso" scatta dalla semifinale (prima mai)');
    __assert(sfBump(0, 7) && !sfBump(0, 5), 'Coppa Italia in Promozione: semifinale = settimo turno superato, non il quinto');
    // percorso europeo: una stagione di Champions arriva in fondo senza intoppi
    __newCareer(5, 'facile'); __prepare();
    S.euro = true; S.euroComp = 'ucl'; S.squad.forEach(function (p) { p.ovr = 96; });
    var e = __playSeason();
    __assert(!!e && S.cups.euro && (S.cups.euro.out || S.cups.euro.won) && S.cups.euro.leagueAt === 8, 'Champions League: fase campionato completa e percorso concluso');
    __assert(e.statement.some(function (r) { return r[0].indexOf('Champions League') === 0 && r[1] >= EURO_COMPS.ucl.entry; }), 'Champions League: il montepremi entra nel rendiconto');
    __assert(S.cups.euro.won === e.euroWon, 'Champions League: esito coerente fra coppa e riepilogo');
  });

  /* ---------------- patto col fondo ---------------- */
  __section('fondo', function () {
    __seed(11);
    var play = function (win) {
      __newCareer(3, 'medio'); __prepare();
      S.investorDeal = { name: 'Fondo Test', targetDiv: 4, deadlineSeason: S.season, injection: 1e6, yearly: 1e5, completionBonus: 5e5 };
      startSeason();
      S.cups.nat.out = true;
      while (S.seasonActive && S.played < gp()) simMatch(S, win ? { gf: 3, ga: 0 } : { gf: 0, ga: 3 });
      return S._end;
    };
    var ok = play(true);
    __assert(ok.promoted && ok.investorCompleted && !ok.investorFailedPenalty && S.investorDeal === null, 'fondo: la promozione nell\\'anno della scadenza centra l\\'obiettivo (niente penale)');
    __assert(S.achievements.indexOf('investor_trust') >= 0, 'fondo: traguardo "Fiducia ripagata"');
    var ko = play(false);
    __assert(!ko.promoted && !ko.investorCompleted && ko.investorFailedPenalty === 1.4e6 && S.investorDeal === null, 'fondo: obiettivo mancato alla scadenza = penale del 140% dell\\'iniezione');
    __newCareer(5, 'medio');
    __assert(investorDealOffers().length === 0, 'fondo: nessun patto proposto in Serie A');
    __newCareer(2, 'medio');
    var deals = investorDealOffers();
    __assert(deals.length === 2 && deals.every(function (d) { return d.targetDiv > S.div && d.targetDiv <= 5 && d.deadlineSeason > S.season && d.injection > 0; }), 'fondo: due patti con obiettivo sopra la categoria attuale');
  });

  /* ---------------- avvio stagione: i paletti ---------------- */
  __section('avvio stagione', function () {
    __newCareer(1, 'medio'); __prepare();
    S.budget = kickoffBill() - 1;
    startSeason();
    __assert(!S.seasonActive, 'startSeason: non parte se la cassa non copre il monte ingaggi');
    __prepare(); S.squad.length = MIN_SQUAD - 1;
    startSeason();
    __assert(!S.seasonActive, 'startSeason: non parte con meno di ' + MIN_SQUAD + ' giocatori');
    __newCareer(1, 'medio'); __prepare();
    S.squad.push(Object.assign(freeAgent('ATT'), { loan: true }));
    var n = S.squad.length;
    startSeason();
    __assert(S.seasonActive && S.squad.length === n - 1 && !S.squad.some(function (p) { return p.loan; }), 'startSeason: chi era in prestito e non è stato riscattato torna al suo club');
    __assert(S.seasonTargetInfo && typeof S.seasonTargetInfo.label === 'string' && S.cups.nat.rounds.length === CUP_ROUNDS_BY_DIV[1].length, 'startSeason: obiettivo e tabellone di coppa pronti');
    // una rosa vuota o di soli infortunati non manda in crash la partita
    __newCareer(1, 'medio'); __prepare(); startSeason();
    S.squad.forEach(function (p) { p.outWeeks = 9; });
    simMatch();
    __assert(S.played === 1 && __finite(S.gf), 'simMatch: si gioca anche con tutta la rosa indisponibile');
    S.squad = [];
    simMatch();
    __assert(S.played === 2 && __finite(teamEff()), 'simMatch: nemmeno una rosa vuota manda in crash il motore');
  });

  /* ---------------- salvataggio / caricamento / migrazione ---------------- */
  __section('salvataggio', function () {
    __seed(21);
    __newCareer(0, 'medio', null, 'campania'); __prepare();
    __playSeason(); advance(); __prepare(); startSeason();
    for (var i = 0; i < 7; i++) simMatch();
    saveGame();
    var id = S._saveId;
    __assert(typeof id === 'string' && S._v === SAVE_FORMAT_VERSION, 'saveGame: slot e versione del formato scritti');
    __assert(readSavesIndex().length === 1 && readSavesIndex()[0].club === S.club && hasSave(), 'indice dei salvataggi aggiornato');
    var snapshot = JSON.stringify(S), pools = JSON.stringify(POOLS);
    // un\\'altra carriera nel frattempo sporca la piramide in memoria
    resetPools(null); POOLS[0][0].n = 'Di Un\\'Altra Partita';
    var loaded = loadSaveSlot(id);
    __assert(!!loaded && loaded.club === JSON.parse(snapshot).club && loaded.season === 2 && loaded.played === 7 && loaded.seasonActive === true, 'loadSaveSlot: la stagione in corso torna com\\'era');
    __assert(JSON.stringify(loaded.squad) === JSON.stringify(JSON.parse(snapshot).squad) && loaded.budget === JSON.parse(snapshot).budget, 'round-trip: rosa e cassa identiche');
    __assert(JSON.stringify(loaded.records) === JSON.stringify(JSON.parse(snapshot).records), 'round-trip: primati identici');
    S = loaded; loadPoolsForSlot(id); normSquad();
    __assert(JSON.stringify(POOLS) === pools, 'loadPoolsForSlot: la piramide della carriera torna identica');
    var guard = 0; while (S.seasonActive && guard++ < 400) { S._pause = false; simToEnd(); }
    __assert(!!S._end && S.played === gp(), 'dopo il caricamento la stagione si porta a termine');
    // gironi salvati mancanti: si riparte dalla piramide di partenza della REGIONE della carriera
    __store['dsa_save_' + id + '_pools'] = undefined; delete __store['dsa_save_' + id + '_pools'];
    resetPools(null); POOLS[3][0].n = 'Di Un\\'Altra Partita';
    loadPoolsForSlot(id);
    var camp = REGIONS.find(function (r) { return r.key === 'campania'; });
    __assert(POOLS[3].every(function (c) { return c.n.indexOf('Altra Partita') < 0; }) && POOLS[0][0].n === camp.promozione[0].n, 'gironi mancanti: piramide di partenza della regione giusta, non quella rimasta in memoria');
    // gironi salvati illeggibili o della forma sbagliata
    __store['dsa_save_' + id + '_pools'] = '{non json';
    loadPoolsForSlot(id);
    __assert(POOLS.every(function (p, i) { return p.length === DIVS[i].teams; }), 'gironi illeggibili: piramide comunque completa');
    __store['dsa_save_' + id + '_pools'] = JSON.stringify([[{ n: 'Solo', s: 50 }], 'x', null, [], [], []]);
    loadPoolsForSlot(id);
    __assert(POOLS.every(function (p, i) { return p.length === DIVS[i].teams; }) && !__hasDup(__poolNames()), 'gironi rovinati: completati senza doppioni');

    // salvataggio vecchio (prima della versione): i doppioni Serie C/Serie B e i gironi appiattiti
    var old = JSON.parse(JSON.stringify(POOLS_PRISTINE));
    old[3][0].n = 'Padova'; old[3][1].n = 'Vicenza'; old[3][7].n = 'Avellino'; old[3][9].n = 'Benevento';
    old[1].forEach(function (c) { c.s = 55; }); old[2].forEach(function (c, i) { c.s = 62 + (i % 2) * 0.1; });
    __store['dsa_save_' + id + '_pools'] = JSON.stringify(old);
    S.region = null;
    loadPoolsForSlot(id);
    __assert(!__hasDup(__poolNames()), 'migrazione gironi: i doppioni Serie C/Serie B spariscono');
    __assert(['Salernitana', 'Cittadella', 'Cosenza', 'Cavese'].every(function (n) { return POOLS[3].some(function (c) { return c.n === n; }); }) && POOLS[4].some(function (c) { return c.n === 'Padova'; }), 'migrazione gironi: in Serie C entrano i nomi nuovi, in Serie B restano gli originali');
    __assert(__poolSd(1) > 3 && __poolSd(2) > 3, 'migrazione gironi: un girone appiattito ritrova il suo ventaglio di forza');
    __assert(POOLS[2].slice().sort(function (a, b) { return b.s - a.s; })[0].s === Math.max.apply(null, POOLS_PRISTINE[2].map(function (c) { return c.s; })), 'migrazione gironi: il ventaglio è quello di partenza');

    // stato di una versione precedente: campi mancanti riempiti, niente crash
    var legacy = { owner: 'Vecchio', club: 'Vecchia Gloria', div: 2, season: 3, budget: 3e6, fanbase: 1.1, stadiumTier: 1, stadiumSpent: 1e6, ticket: 1, sent: 60, ownerRating: 55, prestige: 0,
      squad: [], manager: { n: 'Mister X', rating: 60, salary: 50000 }, trophies: { titles: [0, 0, 0, 0, 0, 0], nat: 0, total: 0 }, history: [], over: false };
    for (var k = 0; k < 16; k++) legacy.squad.push({ n: 'Giocatore ' + k, ovr: 60 + (k % 5), age: 20 + k, wage: 4000 });
    __store['dsa_save_vecchio'] = JSON.stringify(legacy);
    S = loadSaveSlot('vecchio');
    __assert(!!S && S._vFrom === 0, 'salvataggio senza versione: caricato e riconosciuto come precedente');
    loadPoolsForSlot('vecchio'); normSquad();
    __assert(S.squad.every(function (p) { return p.pid != null && POS_LABEL[p.pos] && __finite(p.yrs) && p.nat; }) && !__hasDup(S.squad.map(function (p) { return p.pid; })), 'salvataggio vecchio: pid, ruolo, contratto e nazionalità assegnati');
    __assert(S.difficulty === 'medio' && S.formation === '433' && S.records && S.dominance === 0 && S.trophies.ucl === 0 && Array.isArray(S.alumni) && S.maxSeasons === MAX_SEASONS, 'salvataggio vecchio: campi nuovi ai valori di default');
    S.turboMode = true; __prepare();
    var eOld = __playSeason();
    __assert(!!eOld && __finite(S.budget), 'salvataggio vecchio: si gioca una stagione intera');

    // stato rovinato: numeri non numerici, voci nulle, pid doppi, riferimenti a vuoto
    var bad = JSON.parse(snapshot);
    bad.budget = null; bad.sent = 'tanto'; bad.fanbase = 99; bad.div = 17; bad.stadiumTier = -3; bad.ticket = 9; bad.ownerRating = undefined;
    bad.squad.push(null); bad.squad.push('giocatore'); bad.squad[0].pid = bad.squad[1].pid; bad.squad[2].ovr = 'forte'; bad.squad[3].wage = -5; bad.squad[4].pos = 'LIB';
    bad.manager = { n: 'Senza numeri' }; bad.sponsor = { name: 'Rotto' }; bad.trophies = null; bad.history = 'nessuna'; bad.offers = [{ pid: 987654, fee: 1 }, null];
    bad.captainPid = 987654; bad.euro = true; bad.euroComp = 'coppa del nonno'; bad._pause = true; bad.fixtures = bad.fixtures.slice(0, 5);
    __store['dsa_save_rotto'] = JSON.stringify(bad);
    S = loadSaveSlot('rotto');
    __assert(!!S, 'salvataggio rovinato: resta caricabile');
    __assert(S.budget !== null && __finite(S.budget) && S.sent === 55 && S.fanbase === 3 && S.div === 5 && S.stadiumTier === 0 && S.ticket === TICKETS.length - 1 && S.ownerRating === 62, 'salvataggio rovinato: numeri riportati nei limiti');
    __assert(S.squad.every(function (p) { return p && typeof p === 'object' && __finite(p.ovr) && p.wage > 0; }), 'salvataggio rovinato: rosa ripulita');
    __assert(__finite(S.manager.rating) && __finite(S.manager.salary) && S.sponsor === null && S.trophies.total === 0 && Array.isArray(S.history) && S.offers.length === 0 && S.captainPid === null && S.euro === false, 'salvataggio rovinato: allenatore, sponsor, bacheca, storico, offerte e capitano sistemati');
    __assert(S._pause === false, 'salvataggio rovinato: la pausa di un popup rimasto aperto non blocca più la stagione');
    __assert(S.seasonActive === false, 'salvataggio rovinato: una stagione col calendario troncato torna in Dirigenza invece di andare in crash');
    loadPoolsForSlot('rotto'); normSquad();
    __assert(!__hasDup(S.squad.map(function (p) { return p.pid; })) && S.squad.every(function (p) { return POS_LABEL[p.pos]; }), 'salvataggio rovinato: pid unici e ruoli validi dopo normSquad');
    S.turboMode = true; __prepare();
    __assert(!!__playSeason() && __finite(S.budget), 'salvataggio rovinato: dopo la pulizia si gioca');

    // JSON illeggibile, slot mancante, carriera finita
    __store['dsa_save_x'] = '{{{'; __store['dsa_save_y'] = JSON.stringify({ squad: [], over: true }); __store['dsa_save_z'] = JSON.stringify({ squad: 'no' });
    __assert(loadSaveSlot('x') === null && loadSaveSlot('y') === null && loadSaveSlot('z') === null && loadSaveSlot('mai-esistito') === null, 'loadSaveSlot: null per JSON rotto, carriera conclusa, forma sbagliata, slot inesistente');
    __store['dsa_saves_index'] = 'non json';
    __assert(Array.isArray(readSavesIndex()) && readSavesIndex().length === 0 && !hasSave(), 'indice illeggibile: elenco vuoto, niente eccezioni');
    __assert(readHotseat() === null, 'hotseat assente: null');
    deleteSaveSlot('rotto');
    __assert(loadSaveSlot('rotto') === null, 'deleteSaveSlot: lo slot sparisce');
    __clearStore();
  });

  /* ---------------- primati del club ---------------- */
  __section('primati', function () {
    __seed(31);
    __newCareer(2, 'medio');
    __assert(clubRecordsList().length === 0, 'primati: elenco vuoto a inizio carriera');
    __prepare();
    var e = __playSeason();
    var r = S.records;
    __assert(e.newRecords.length === 0, 'primati: nella prima stagione si registrano senza annunciarli');
    __assert(r.points.v === S.pts && r.goalsFor.v === S.gf && r.points.season === 1 && r.points.div === 2, 'primati: punti e gol della stagione');
    __assert(r.bestFinish.pos === e.pos && r.bestFinish.div === 2, 'primati: miglior piazzamento');
    var margins = S.results.map(function (x) { return x.gf - x.ga; });
    __assert(!r.bestWin || r.bestWin.gf - r.bestWin.ga === Math.max.apply(null, margins), 'primati: vittoria più larga');
    __assert(!r.worstLoss || r.worstLoss.gf - r.worstLoss.ga === Math.min.apply(null, margins), 'primati: sconfitta più pesante');
    var streak = 0, best = 0; S.results.forEach(function (x) { streak = x.res === 'W' ? streak + 1 : 0; best = Math.max(best, streak); });
    __assert(r.winStreak.best === best, 'primati: serie di vittorie (' + r.winStreak.best + ' contro ' + best + ')');
    var topGoals = Math.max.apply(null, S.squad.map(function (p) { return p.seasonGoals || 0; }));
    __assert(topGoals === 0 || r.topScorer.v === topGoals, 'primati: capocannoniere di stagione');
    __assert(r.attendance.v === e.att && r.income.v === e.net, 'primati: presenze e incasso');
    var rows = clubRecordsList();
    __assert(rows.length >= 6 && rows.every(function (x) { return x.icon && x.label && typeof x.value === 'string' && x.value && typeof x.detail === 'string'; }), 'clubRecordsList: righe pronte da mostrare');
    __assert(noteSaleRecord({ n: 'Mario Rossi' }, 2e6, 'Inter') === true && noteSaleRecord({ n: 'Altro' }, 1e6, 'Milan') === false && S.records.sale.n === 'Mario Rossi', 'noteSaleRecord: resta la cessione più ricca');
    __assert(noteSaleRecord(null, 5e6) === false && noteSaleRecord({ n: 'X' }, NaN) === false, 'noteSaleRecord: ignora dati non validi');
    // seconda stagione fuori scala: i primati battuti vengono annunciati
    advance(); __prepare();
    S.squad.forEach(function (p) { p.ovr = 99; });
    var e2 = __playSeason();
    __assert(e2.newRecords.some(function (x) { return x.label === 'Record di punti in campionato'; }) && S.records.points.season === 2 && S.records.points.v === S.pts, 'primati: il record di punti battuto finisce nel riepilogo');
    __assert(e2.newRecords.every(function (x) { return x.icon && x.label && x.value; }), 'newRecords: voci complete');
    var legends = clubLegends(S, 'goals', 5), apps = clubLegends(S, 'apps', 3);
    __assert(legends.length > 0 && legends.length <= 5 && legends.every(function (x, i) { return i === 0 || legends[i - 1].v >= x.v; }) && apps.length === 3, 'clubLegends: classifica dei migliori di sempre, ordinata');
    // stagioni iniziate prima dei primati
    S.records = undefined; S.stadiumRecordAtt = 4321; S.stadiumRecordSeason = 1;
    __assert(ensureRecords(S).attendance.v === 4321 && ensureRecords(S).winStreak.best === 0, 'ensureRecords: parte dal record di presenze già noto');
    S.records = 'rotto';
    __assert(typeof ensureRecords(S) === 'object' && S.records.bestWin === null, 'ensureRecords: ripara una forma sbagliata');
  });

  /* ---------------- eventi narrativi ---------------- */
  __section('eventi', function () {
    __seed(41);
    __newCareer(2, 'medio'); __prepare(); startSeason();
    for (var i = 0; i < 12; i++) simMatch();
    var ok = true, why = '';
    NARRATIVE_EVENTS.forEach(function (ev) {
      try {
        if (!ev.icon || !ev.title || !(typeof ev.text === 'string' || typeof ev.text === 'function')) { ok = false; why = 'evento incompleto: ' + ev.title; }
        var can = !ev.requires || !!ev.requires(S);
        var built = can && typeof ev.build === 'function' ? ev.build(S) : null;
        var text = typeof ev.text === 'function' ? (can ? ev.text(S, built) : 'non pescabile ora') : ev.text;
        if (typeof text !== 'string' || !text || text.indexOf('undefined') >= 0 || text.indexOf('NaN') >= 0) { ok = false; why = 'testo non valido: ' + ev.title; }
        (ev.choices || []).forEach(function (c) {
          if (!c.label) { ok = false; why = 'scelta senza etichetta: ' + ev.title; }
          ['sent', 'budgetPct', 'ownerRating', 'fanbaseDelta', 'prestige'].forEach(function (k) { if (c[k] != null && !__finite(c[k])) { ok = false; why = 'effetto non numerico: ' + ev.title; } });
        });
      } catch (e) { ok = false; why = ev.title + ': ' + e; }
    });
    __assert(ok, 'NARRATIVE_EVENTS ben formati (' + (why || 'ok') + ')');
    __assert(new Set(NARRATIVE_EVENTS.map(function (e) { return e.title; })).size === NARRATIVE_EVENTS.length, 'NARRATIVE_EVENTS: titoli unici');
    // ogni evento, applicato a uno stato vero (anche con la cassa in rosso), lascia lo stato giocabile
    var sane = true;
    [1e6, -2e6].forEach(function (budget) {
      NARRATIVE_EVENTS.forEach(function (ev) {
        S.budget = budget; S.sent = 50;
        if (ev.requires && !ev.requires(S)) return;
        var built = typeof ev.build === 'function' ? ev.build(S) : null;
        var effs = ev.choices && ev.choices.length ? ev.choices : [ev];
        effs.forEach(function (eff) { applyNarrativeEffect(eff, built); });
        autoResolveNarrativeEvent(ev, S);
        if (!__finite(S.budget) || !__finite(S.sent) || !__finite(S.fanbase) || !__finite(S.ownerRating) || !__finite(S.prestige) || S.sent < 0 || S.sent > 100) sane = false;
      });
    });
    __assert(sane, 'ogni evento lascia cassa, umore, tifoseria e gradimento validi');
    S._mpEvents = [];
  });

  /* ---------------- eventi di momento: compaiono solo quando la stagione li giustifica ---------------- */
  __section('eventi di momento', function () {
    __seed(43);
    __newCareer(2, 'medio'); __prepare(); startSeason();
    var ev = function (title) { return NARRATIVE_EVENTS.find(function (e) { return e.title === title; }); };
    var can = function (title) { var e = ev(title); return !!e && !!e.requires(S); };
    __assert(!can('Cinque vittorie di fila') && !can('Crisi di risultati') && !can('Creditori alla porta') && !can('Febbre da alta classifica') && !can('Aria di retrocessione'), 'a inizio stagione nessun evento di momento è pescabile');
    for (var i = 0; i < 12; i++) simMatch(S, { gf: 2, ga: 0 });
    __assert(can('Cinque vittorie di fila') && can('Febbre da alta classifica') && !can('Crisi di risultati') && !can('Aria di retrocessione'), 'dopo 12 vittorie: striscia e alta classifica sì, crisi no');
    for (var j = 0; j < 5; j++) simMatch(S, { gf: 0, ga: 3 });
    __assert(can('Crisi di risultati') && !can('Cinque vittorie di fila'), 'dopo 5 sconfitte: crisi di risultati');
    S.budget = -1e6;
    __assert(can('Creditori alla porta'), 'cassa in rosso: creditori alla porta');
    var before = S.budget; applyNarrativeEffect(ev('Creditori alla porta').choices[0], null);
    __assert(S.budget > before, 'la colletta riduce il debito (non lo aumenta)');
    S.budget = 1e6;
    S.squad.slice(0, 3).forEach(function (p) { p.outWeeks = 3; });
    __assert(can('Infermeria piena'), 'tre infortunati: infermeria piena');
    applyNarrativeEffect(ev('Infermeria piena').choices[0], null);
    __assert(S.squad.slice(0, 3).every(function (p) { return p.outWeeks === 2; }) && S.budget === 990000, 'consulente esterno: una partita in meno per ogni infortunato, 1% di cassa');
    S.squad[5].suspMatches = 1;
    __assert(can('Ricorso contro la squalifica') && ev('Ricorso contro la squalifica').build(S).player === S.squad[5], 'squalifica: il ricorso riguarda il giocatore fermato');
    S.squad[5].suspMatches = 0; S.squad.forEach(function (p) { p.outWeeks = 0; });
  });

  /* ---------------- richieste dell\\'interfaccia: classifica, motivi, registro gare, spin in sospeso ---------------- */
  __section('dati per l\\'interfaccia', function () {
    __seed(61);
    __newCareer(4, 'medio'); __prepare();
    S.budget = kickoffBill() - 1;
    __assert(startSeason() === 'budget', 'startSeason restituisce "budget" se la cassa non basta');
    __prepare(); var keep = S.squad.slice(); S.squad.length = MIN_SQUAD - 1;
    __assert(startSeason() === 'squad', 'startSeason restituisce "squad" se la rosa è sotto il minimo');
    S.squad = keep; __prepare();
    __assert(startSeason() === null && S.seasonActive, 'startSeason restituisce null quando la stagione parte');
    var checkTable = function (label) {
      computeTable();
      var ok = S.table.every(function (r) {
        return __finite(r.played) && __finite(r.w) && __finite(r.d) && __finite(r.l) && __finite(r.gf) && __finite(r.ga)
          && r.w >= 0 && r.d >= 0 && r.l >= 0 && r.w + r.d + r.l === r.played && r.w * 3 + r.d === r.pts && r.gf - r.ga === r.gd && r.gf >= 0 && r.ga >= 0;
      });
      __assert(ok, 'classifica ' + label + ': G/V/N/P e gol coerenti con punti e differenza reti su ogni riga');
    };
    checkTable('a inizio stagione');
    for (var i = 0; i < 9; i++) simMatch();
    checkTable('dopo 9 giornate');
    __assert(S.table.find(function (r) { return r.me; }).played === 9 && S.table.every(function (r) { return r.played >= 7 && r.played <= 11; }), 'classifica: partite giocate allineate alla giornata (entro due)');
    while (S.seasonActive && S.played < gp()) simMatch();
    checkTable('a fine campionato');
    __assert(S.table.every(function (r) { return r.played === gp(); }), 'classifica finale: tutti hanno giocato ' + gp() + ' partite');
    __assert(S.results.every(function (r) { return r.comp === 'league'; }), 'S.results: ogni riga ha comp = "league"');
    __assert(Array.isArray(S.cupResults) && S.cupResults.length >= 1 && S.cupResults.every(function (r) { return ['nat', 'ucl', 'uel', 'conf', 'playoff'].indexOf(r.comp) >= 0 && r.opp && __finite(r.gf) && __finite(r.ga) && ['W', 'D', 'L'].indexOf(r.res) >= 0 && r.afterMw >= 1 && r.afterMw <= gp(); }), 'S.cupResults: gare di coppa/playoff con comp, avversario, punteggio ed esito');
    var all = allResults();
    __assert(all.length === S.results.length + S.cupResults.length && all.every(function (r, k) { return k === 0 || all[k - 1].order <= r.order; }) && all[0].comp === 'league', 'allResults: campionato e coppe in un\\'unica sequenza cronologica');
    // classifica di una stagione iniziata prima di G/V/N/P: nessun crash, campi a null per i rivali
    S.opps.forEach(function (o) { delete o.rrP; delete o.rrW; delete o.rrD; });
    S._finalTable = null; computeTable();
    __assert(S.table.every(function (r) { return __finite(r.pts) && (r.me ? __finite(r.w) : r.w === null); }), 'classifica di una stagione vecchia: punti validi, G/V/N/P assenti per i rivali');
    // spin in sospeso alla chiusura della pagina: rimborso al caricamento
    __newCareer(2, 'medio'); __prepare();
    var b0 = S.budget, cost = spinCostNow(true);
    S.budget -= cost; S.spinsBought = 1; S._spin = spinPlayer(true, null); S._spinCost = cost;
    saveGame();
    var back = loadSaveSlot(S._saveId);
    __assert(back.budget === b0 && back._spin === null && back.spinsBought === 0 && back._spinRefunded === cost, 'spin in sospeso: al caricamento torna l\\'intero costo annotato');
    S.budget = b0; S.spinsBought = 2; S._spin = spinPlayer(false, null); S._spinCost = null;
    S.spinsBought = 1; var std2 = spinCostNow(false); S.spinsBought = 2; S.budget = b0 - std2;
    saveGame(); back = loadSaveSlot(S._saveId);
    __assert(back.budget === b0 && back.spinsBought === 1, 'spin in sospeso senza costo annotato: rimborso stimato al prezzo dello spin base di quel momento');
    __assert(resolvePendingSpin({ budget: 5, div: 0 }) === 0, 'nessuno spin in sospeso: nessun rimborso');
    // fattore campo: uno stadio adeguato alla categoria non è un handicap
    __newCareer(0, 'medio'); S.stadiumTier = 0; S.sent = 50;
    __assert(Math.abs(homeAdvantage() - 1) < 0.05, 'fattore campo: club appena nato in Promozione vicino a 0% (' + Math.round((homeAdvantage() - 1) * 100) + '%)');
    __newCareer(5, 'medio'); S.sent = 50;
    S.stadiumTier = 0; var small = homeAdvantage(); S.stadiumTier = 5; var bigA = homeAdvantage();
    __assert(small === 0.65 && bigA === 1.35, 'fattore campo in Serie A: invariato (minimo con lo stadio piccolo, massimo da 42.000 posti)');
    S.sent = 100; __assert(homeAdvantage() > bigA, 'fattore campo: cresce con l\\'umore dei tifosi');
  });

  /* ---------------- multiplayer: una stagione dell\\'host ---------------- */
  __section('multiplayer', function () {
    __seed(51);
    var mk = function (name) { __newCareer(2, 'medio', name); __prepare(); var c = S; return c; };
    var a = mk('Umani Uno'), b = mk('Umani Due');
    S = null;
    var ctxs = runHostSeason([a, b], 2, 'medio');
    __assert(ctxs.length === 2 && ctxs.every(function (c) { return c._end && c.played === gp(c) && c.results.length === gp(c); }), 'runHostSeason: entrambi i club chiudono la stagione');
    var ra = a.results.filter(function (r) { return r.vsHuman; }), rb = b.results.filter(function (r) { return r.vsHuman; });
    __assert(ra.length === 2 && rb.length === 2 && ra.every(function (r) { var m = rb.find(function (x) { return x.mw === r.mw; }); return m && m.gf === r.ga && m.ga === r.gf && m.home !== r.home; }), 'scontri diretti: stesso risultato visto dalle due parti, andata e ritorno');
    __assert(a.table.length === DIVS[2].teams && a.table.map(function (r) { return r.name; }).sort().join('|') === b.table.map(function (r) { return r.name; }).sort().join('|'), 'multiplayer: la stessa classifica per tutti');
    __assert(a._end.pos !== b._end.pos, 'multiplayer: due club, due posizioni diverse');
  });

  window.__RESULTS__ = __R;
`;

const noop = () => {};
const dummyEl = () => ({ innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, addEventListener: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [] });
const store = {};
const sandbox = {
  console,
  document: {
    getElementById: dummyEl,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: dummyEl,
    addEventListener: noop,
  },
  // localStorage in memoria: salvataggio e caricamento girano davvero. `__store` è la mappa
  // sottostante, esposta ai test per poter scrivere a mano salvataggi vecchi o rovinati.
  __store: store,
  __clearStore: () => { Object.keys(store).forEach((k) => delete store[k]); },
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  navigator: { onLine: true },
  DynSound: null,
  // Stato del selettore stemma di ui.js, letto da startDynasty.
  crestShape: 'shield', crestColors: ['#f0c869', '#7a4f16'],
};
// Le funzioni di ui.js che il motore chiama a fine azione: qui non fanno nulla.
['toast', 'show', 'renderBoard', 'renderHud', 'renderCups', 'renderSeasonTarget', 'renderScouting', 'renderSeasonEnd', 'renderEnd',
  'logMatch', 'logCup', 'logCupLeg', 'logEuroGroup', 'logPlayoffEntry', 'openWinter', 'openRetirementOverlay', 'openSeasonRecapOverlay',
  'openBulkDigestOverlay', 'openNarrativeEventOverlay', 'openMatchRecapOverlay', 'openRivalryPromptOverlay', 'overlay', 'closeOverlay'].forEach((k) => { sandbox[k] = noop; });
sandbox.window = sandbox;
vm.createContext(sandbox);

const combined = ['data.js', 'rosters.js', 'sim.js']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .concat([TEST_BODY])
  .join('\n;\n');

vm.runInContext(combined, sandbox, { filename: 'engine.test.combined.js' });

const R = sandbox.__RESULTS__;
if (!R) { console.error('✗ Il modulo di test non ha prodotto risultati (window.__RESULTS__ mancante).'); process.exit(1); }
R.failures.forEach((msg) => console.error('✗ FAIL: ' + msg));
console.log(`\n${R.passed} superati, ${R.failed} falliti.`);
process.exit(R.failed ? 1 : 0);
