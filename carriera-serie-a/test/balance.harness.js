'use strict';
/* ============================================================
   Presidente · Serie A — test/balance.harness.js
   Banco di prova del bilanciamento: gioca in automatico molte carriere
   intere (senza interfaccia) con alcune "politiche" di gioco semplici e
   stampa i numeri che servono per tarare il motore con dei dati, non a
   occhio: stagioni per arrivare in Serie A, fallimenti, curva dei soldi,
   rapporto stipendi/ricavi, promozioni/retrocessioni, gol a partita,
   fattore campo, evoluzione dei rivali negli anni.

   Stesso trucco di test/engine.test.js: data.js + rosters.js + sim.js
   vengono concatenati al corpo qui sotto ed eseguiti come un unico script
   in una sandbox Node (vm), perché le funzioni del motore sono `const` di
   script e non proprietà del globale. Le funzioni di ui.js che il motore
   chiama a fine azione (toast, renderBoard, ...) sono sostituite da stub
   vuoti: qui interessa solo la logica.

   Le politiche replicano le STESSE regole economiche dei bottoni di ui.js
   (cessione immediata al 30% del valore, rimborso 40% dello spin rifiutato,
   buonuscita 30%, svincolati gratis...): se cambiano lì, vanno aggiornate qui.

   Uso:
     node test/balance.harness.js                 → griglia standard
     node test/balance.harness.js --n 60          → 60 carriere per cella
     node test/balance.harness.js --policy sensible --diff medio --div 0
     node test/balance.harness.js --seed 7 --match  → solo statistiche partita
   Non è un test (non esce mai con codice 1): è uno strumento di misura.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --src <cartella>: prende data.js/rosters.js/sim.js da un'altra cartella (es. una copia
// "prima delle modifiche") per confrontare i numeri prima/dopo con le stesse politiche.
const ROOT = (() => { const i = process.argv.indexOf('--src'); return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(__dirname, '..'); })();
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const flag = (name) => argv.indexOf('--' + name) >= 0;

const CONFIG = {
  n: +arg('n', 30),
  seed: +arg('seed', 12345),
  policies: arg('policy', 'passive,sensible,greedy,trader').split(','),
  diffs: arg('diff', 'facile,medio,difficile,estremo').split(','),
  divs: arg('div', '0,4').split(',').map(Number),
  seasons: +arg('seasons', 15),
  matchOnly: flag('match'),
  json: flag('json'),
};

const HARNESS_BODY = `
  /* ---------- generatore casuale con seme: stesse carriere a ogni esecuzione ---------- */
  (function () {
    var a = __CONFIG.seed >>> 0;
    Math.random = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })();

  var __POOLS0 = JSON.parse(JSON.stringify(POOLS));
  function __resetPools() { POOLS.forEach(function (arr, i) { arr.length = 0; __POOLS0[i].forEach(function (c) { arr.push({ n: c.n, s: c.s }); }); }); }

  function __median(a) { if (!a.length) return NaN; var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function __mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : NaN; }

  /* ---------- azioni di Dirigenza, con le stesse regole economiche di ui.js ---------- */
  function __counts() { var c = { POR: 0, DIF: 0, CEN: 0, ATT: 0 }; S.squad.forEach(function (p) { if (c[p.pos] != null) c[p.pos]++; }); return c; }
  function __neededRole() {
    var c = __counts(), min = { POR: 2, DIF: 5, CEN: 5, ATT: 4 }, best = null, gap = 0;
    Object.keys(min).forEach(function (r) { var g = min[r] - c[r]; if (g > gap && c[r] < POS_CAP[r]) { gap = g; best = r; } });
    if (best) return best;
    var open = Object.keys(min).filter(function (r) { return c[r] < POS_CAP[r]; });
    return open.length ? open[rnd(open.length)] : null;
  }
  function __quickSell(p) {
    var i = S.squad.indexOf(p); if (i < 0) return 0;
    var fee = Math.round(playerValue(p) * 0.3);
    pushAlumnus(p); S.squad.splice(i, 1); S.offers = (S.offers || []).filter(function (o) { return o.pid !== p.pid; }); S.budget += fee;
    return fee;
  }
  function __fillFreeAgents() {
    var guard = 0;
    while (S.squad.length < MIN_SQUAD && guard++ < 40) { var role = __neededRole(); if (!role) break; S.squad.push(freeAgent(role)); }
  }
  function __topN(n) { return S.squad.slice().sort(function (a, b) { return b.ovr - a.ovr; }).slice(0, n); }
  function __nthOvr(n) { var t = __topN(n); return t.length >= n ? t[n - 1].ovr : 0; }
  function __investorBonus() {
    if (S.investorUsed) return;
    S.investorUsed = true; S.budget += Math.round(divOf().investor * diffOf().sponsorMult / 1e4) * 1e4;
  }
  function __sponsors(best) {
    var choose = function (opts) { return best ? opts.slice().sort(function (a, b) { return b.perYear - a.perYear; })[0] : opts[0]; };
    if (!S.sponsor) S.sponsor = choose(sponsorOffers());
    if (!S.stadiumSponsor) S.stadiumSponsor = choose(stadiumSponsorOffers());
    if (!S.techSponsor) S.techSponsor = choose(techSponsorOffers());
  }
  function __renew(p) { p.wage = renewWage(p); p.yrs = renewYears(p); }
  function __spin(premium, role, st) {
    var cost = spinCostNow(premium);
    if (S.budget < cost) return null;
    S.budget -= cost; S.spinsBought = (S.spinsBought || 0) + 1;
    st.spins++; st.spinSpend += cost;
    var p = spinPlayer(premium, role);
    return { p: p, cost: cost };
  }
  function __sign(p) { S.squad.push(p); if (p.ovr >= divOf().avg + 7) S.sent = clamp(S.sent + 2, 0, 100); }
  function __pass(cost) { S.budget += S.hardcore ? 0 : Math.round(cost * 0.4); }
  function __retire() {
    S.squad.filter(function (p) { return p.age >= 36; }).forEach(function (p) { pushAlumnus(p, S, true); });
    S.squad = S.squad.filter(function (p) { return p.age < 36; });
  }
  function __makeAffordable() {
    // Come farebbe chiunque davanti al messaggio "ti mancano X per il monte ingaggi": cede il
    // più caro (cessione immediata, 30% del valore) e lo rimpiazza con uno svincolato gratis.
    var guard = 0;
    while (S.budget < kickoffBill() && guard++ < 40) {
      var sorted = S.squad.slice().sort(function (a, b) { return b.wage - a.wage; });
      if (!sorted.length) break;
      __quickSell(sorted[0]);
      __fillFreeAgents();
    }
    return S.budget >= kickoffBill() && S.squad.length >= MIN_SQUAD;
  }

  var __POLICIES = {
    // Il minimo indispensabile: rinnova chi scade, prende il primo sponsor della lista, non
    // compra, non investe, non incassa nemmeno il bonus investitore. È il "giocatore distratto".
    passive: function (st) {
      __sponsors(false);
      S.offers = [];
      S.squad.filter(finalYear).forEach(function (p) { if (p.age < 35) __renew(p); });
      __fillFreeAgents();
    },
    // Gestione prudente: migliori sponsor, rinnova i titolari, compra se migliora l'undici e
    // resta un cuscinetto di cassa, amplia lo stadio quando è pieno.
    sensible: function (st) { __active(st, { reserve: 0.35, maxSpins: 3, sellOffers: 'bench', stadium: true, deal: false }); },
    // Tutto sulla rosa: spende ogni euro in spin, firma il patto col fondo, biglietti premium.
    greedy: function (st) { __active(st, { reserve: 0, maxSpins: 6, sellOffers: 'none', stadium: false, deal: true, ticket: 3 }); },
    // Come "sensible", ma vende SEMPRE a chi offre (dopo un rilancio) e ricompra con gli spin.
    trader: function (st) { __active(st, { reserve: 0.35, maxSpins: 4, sellOffers: 'all', stadium: true, deal: false }); },
  };

  function __active(st, o) {
    var d = divOf();
    __investorBonus();
    __sponsors(true);
    if (o.ticket != null) S.ticket = o.ticket;
    if (o.deal && !S.investorDeal) { var deals = investorDealOffers(); if (deals.length) { var dl = deals[deals.length - 1]; S.investorDeal = dl; S.budget += dl.injection; st.deals++; } }
    // offerte in arrivo
    (S.offers || []).slice().forEach(function (of) {
      var p = S.squad.find(function (x) { return x.pid === of.pid; }); if (!p) return;
      var top11 = __topN(11).indexOf(p) >= 0;
      var sell = o.sellOffers === 'all' || (o.sellOffers === 'bench' && (!top11 || p.age >= 30));
      if (!sell) return;
      var fee = of.fee;
      if (o.sellOffers === 'all' && !S.hardcore) { if (Math.random() < 0.65) fee = Math.round(fee * (1.15 + Math.random() * 0.15) / 1e4) * 1e4; else return; }
      pushAlumnus(p); S.budget += fee; S.squad.splice(S.squad.indexOf(p), 1);
      if (p.ovr >= d.avg + 6) S.sent = clamp(S.sent - 3, 0, 100);
      st.sales++; st.saleMoney += fee;
    });
    S.offers = [];
    // rinnovi: i primi 16 per overall restano, gli altri in scadenza vengono ceduti subito
    var keep = __topN(16);
    S.squad.filter(finalYear).forEach(function (p) {
      if (keep.indexOf(p) >= 0 && p.age < 34) __renew(p);
      else if (S.squad.length > MIN_SQUAD) __quickSell(p);
    });
    // vivaio: gratis, si prende se non è troppo sotto il livello
    (S.scoutProspects || []).slice(0, 1).forEach(function (p) { if (p.ovr >= d.avg - 4 && S.squad.length < 24) { p.homegrown = true; S.squad.push(p); } });
    S.scoutProspects = [];
    (S.youthSquad || []).slice().forEach(function (p) { if (p.age >= 19 && p.ovr >= d.avg - 5 && S.squad.length < 24) promoteYouthPlayer(p.pid); });
    __fillFreeAgents();
    // allenatore: si cambia solo per un salto netto
    var mgrs = [genManager(0), genManager(3), genManager(6)].sort(function (a, b) { return b.rating - a.rating; });
    var sev = Math.round(S.manager.salary * (S.hardcore ? 0.5 : 0.3));
    if (mgrs[0].rating >= S.manager.rating + 4 && S.budget - kickoffBill() > (sev + mgrs[0].salary - S.manager.salary) * (o.reserve ? 3 : 1.2)) { S.budget -= sev; S.manager = mgrs[0]; st.mgrChanges++; }
    // spin
    var spins = 0, roleUsed = false, guard = 0;
    while (spins < o.maxSpins && guard++ < 12) {
      var bill = kickoffBill();
      var est = Math.max(0, estSeasonRevenue());
      var cushion = o.reserve * Math.max(bill, est * 0.5);
      var freeNow = S.budget - bill - cushion;
      var premium = freeNow > spinCostNow(true) * (o.reserve ? 2.5 : 1.05);
      var cost = spinCostNow(premium);
      if (freeNow < cost * (o.reserve ? 1.6 : 1.05)) break;
      var role = null;
      if (!roleUsed) { role = __neededRole(); roleUsed = true; }
      var r = __spin(premium, role, st); if (!r) break;
      spins++;
      var p = r.p;
      var c = __counts();
      var eleventh = __nthOvr(11), fourteenth = __nthOvr(14);
      var improves = p.ovr > (o.reserve ? eleventh : fourteenth) || S.squad.length < 18;
      var affordable = S.budget - kickoffBill() - p.wage * 52 > (o.reserve ? cushion * 0.5 : 0);
      if (improves && affordable && c[p.pos] < POS_CAP[p.pos]) {
        __sign(p); st.signed++;
        if (S.squad.length > 22) { var worst = S.squad.slice().sort(function (a, b) { return a.ovr - b.ovr; })[0]; __quickSell(worst); }
      } else __pass(r.cost);
    }
    // stadio: si amplia quando è (quasi) pieno e resta un margine
    if (o.stadium) {
      var nx = STADIUM[S.stadiumTier + 1];
      if (nx && estAttendanceFor(1).pct >= 0.97) {
        var sc = stadiumUpgradeCost(nx);
        if (S.budget - kickoffBill() > sc * 1.6) { S.budget -= sc; S.stadiumTier++; S.stadiumSpent += sc; S.sent = clamp(S.sent + 3, 0, 100); st.stadiumUps++; }
      }
      var lvl = (S.scoutLevel || 0) + 1;
      if (lvl <= 3) { var uc = scoutUpgradeCost(lvl); if (S.budget - kickoffBill() > uc * 5) { S.budget -= uc; S.scoutLevel = lvl; } }
    }
  }

  /* ---------- una carriera intera ---------- */
  function __playCareer(policyKey, diff, div, seasons, agg) {
    __resetPools();
    var t = genTakeovers(div)[rnd(4)];
    // Nome non presente in nessun girone: il club del banco non "sostituisce" un rivale esistente.
    startDynasty('Bot', t, 'Banco Prova FC', div, diff, seasons, false, null);
    S.turboMode = true; S.maxSeasons = seasons;
    var st = { spins: 0, spinSpend: 0, signed: 0, sales: 0, saleMoney: 0, mgrChanges: 0, stadiumUps: 0, deals: 0 };
    var out = { fate: null, stuck: false, seasons: 0, reachedA: null, finalDiv: div, promos: 0, relegs: 0, titles: 0, rows: [] };
    for (var s = 1; s <= seasons; s++) {
      normSquad(); maybeScoutProspect(); advanceYouthSquad();
      __POLICIES[policyKey](st);
      if (!__makeAffordable()) { out.stuck = true; break; }
      var bill = kickoffBill();
      var budgetBefore = S.budget;
      var str = squadStr(), divAtStart = S.div;
      startSeason();
      if (!S.seasonActive) { out.stuck = true; break; }
      simToEnd();
      var guard = 0;
      while (S.seasonActive && guard++ < 200) { S._pause = false; S.winterDone = true; simToEnd(); if (S.seasonActive && S.played >= gp()) endSeason(); }
      var e = S._end; if (!e) { out.stuck = true; break; }
      out.seasons = s;
      var gross = e.net + (e.statement.find(function (r) { return r[0] === 'Costi di gestione'; }) || [0, 0])[1] * -1;
      out.rows.push({ season: s, div: divAtStart, pos: e.pos, exp: e.exp, bill: bill, gross: gross, net: e.net, budgetStart: budgetBefore, budgetEnd: S.budget, str: str, strGap: str - DIVS[divAtStart].avg, promoted: e.promoted, relegated: e.relegated, title: e.title, sent: S.sent, rating: S.ownerRating, worth: e.worth, natWon: e.natWon, euroWon: e.euroWon, fanbase: S.fanbase, stadium: S.stadiumTier });
      agg.matches.push.apply(agg.matches, S.results.map(function (r) { return { d: divAtStart, h: r.home, gf: r.gf, ga: r.ga }; }));
      if (e.promoted) out.promos++; if (e.relegated) out.relegs++; if (e.title) out.titles++;
      if (e.fate) { out.fate = e.fate; break; }
      if (s >= seasons) break;
      advance();
      __retire();
      if (S.div === 5 && out.reachedA == null) out.reachedA = s;
    }
    out.finalDiv = S.div; out.st = st; out.trophies = S.trophies.total; out.budget = S.budget;
    out.poolStats = POOLS.map(function (pool) { var v = pool.map(function (c) { return c.s; }); var m = __mean(v); return { mean: m, sd: Math.sqrt(__mean(v.map(function (x) { return (x - m) * (x - m); }))), min: Math.min.apply(null, v), max: Math.max.apply(null, v) }; });
    return out;
  }

  /* ---------- statistiche del modello partita, a parità di condizioni ---------- */
  function __matchModel() {
    var res = [];
    S = { div: 4, difficulty: 'medio', formation: '433', tacticStyle: { press: 'medio', width: 'bilanciata', tempo: 'normale' }, played: 0, table: [] };
    [-12, -8, -4, 0, 4, 8, 12].forEach(function (d) {
      var w = 0, dr = 0, l = 0, g = 0, N = 20000;
      for (var i = 0; i < N; i++) { var r = rollMatchScore(d, S, { atk: 0, def: 0 }); g += r.gf + r.ga; if (r.gf > r.ga) w++; else if (r.gf === r.ga) dr++; else l++; }
      res.push({ d: d, win: w / N, draw: dr / N, loss: l / N, goals: g / N });
    });
    var rr = [];
    [0, 4, 5].forEach(function (div) {
      var hw = 0, dw = 0, aw = 0, g = 0, n = 0, ptsSpread = [];
      for (var k = 0; k < 60; k++) {
        var opps = POOLS[div].map(function (o) { return { effS: clamp(o.s + gaussInt(0, 8), 30, 99), rrPts: 0, rrGF: 0, rrGA: 0 }; });
        for (var i = 0; i < opps.length; i++) for (var j = 0; j < opps.length; j++) { if (i === j) continue; var m = simRivalMatch(opps[i].effS, opps[j].effS, RIVAL_DRAW_BOOST[div]); g += m.gf + m.ga; n++; if (m.gf > m.ga) { hw++; opps[i].rrPts += 3; } else if (m.gf === m.ga) { dw++; opps[i].rrPts++; opps[j].rrPts++; } else { aw++; opps[j].rrPts += 3; } }
        var pts = opps.map(function (o) { return o.rrPts; }).sort(function (a, b) { return b - a; });
        ptsSpread.push({ first: pts[0], last: pts[pts.length - 1] });
      }
      rr.push({ div: DIVS[div].name, home: hw / n, draw: dw / n, away: aw / n, goals: g / n, champPts: __mean(ptsSpread.map(function (x) { return x.first; })), lastPts: __mean(ptsSpread.map(function (x) { return x.last; })) });
    });
    S = null;
    return { byGap: res, rivals: rr };
  }

  function __summarize(list, agg) {
    var n = list.length, rows = [];
    list.forEach(function (c) { rows.push.apply(rows, c.rows); });
    var bySeason = function (s, f) { return list.map(function (c) { return c.rows[s - 1]; }).filter(Boolean).map(f); };
    var reached = list.filter(function (c) { return c.reachedA != null; });
    var matches = agg.matches;
    var hm = matches.filter(function (m) { return m.h; }), am = matches.filter(function (m) { return !m.h; });
    var wr = function (ms) { return ms.length ? ms.filter(function (m) { return m.gf > m.ga; }).length / ms.length : NaN; };
    var perDiv = DIVS.map(function (dv, i) {
      var r = rows.filter(function (x) { return x.div === i; });
      if (!r.length) return null;
      return { div: dv.name, seasons: r.length, promo: __mean(r.map(function (x) { return x.promoted ? 1 : 0; })), releg: __mean(r.map(function (x) { return x.relegated ? 1 : 0; })), title: __mean(r.map(function (x) { return x.title ? 1 : 0; })), medPos: __median(r.map(function (x) { return x.pos; })), strGap: __mean(r.map(function (x) { return x.strGap; })), wageToGross: __median(r.map(function (x) { return x.bill / Math.max(1, x.gross); })), medNet: __median(r.map(function (x) { return x.net - x.bill; })), medGross: __median(r.map(function (x) { return x.gross; })), medBill: __median(r.map(function (x) { return x.bill; })) };
    }).filter(Boolean);
    return {
      n: n,
      reachedA: reached.length / n,
      medSeasonsToA: __median(reached.map(function (c) { return c.reachedA; })),
      forced: list.filter(function (c) { return c.fate === 'forced'; }).length / n,
      admin: list.filter(function (c) { return c.fate === 'admin'; }).length / n,
      stuck: list.filter(function (c) { return c.stuck; }).length / n,
      medSeasons: __median(list.map(function (c) { return c.seasons; })),
      finalDiv: __mean(list.map(function (c) { return c.finalDiv; })),
      trophies: __mean(list.map(function (c) { return c.trophies; })),
      promosPerCareer: __mean(list.map(function (c) { return c.promos; })),
      relegsPerCareer: __mean(list.map(function (c) { return c.relegs; })),
      budgetS: [1, 3, 5, 8, 11, 15].map(function (s) { return { s: s, med: __median(bySeason(s, function (r) { return r.budgetEnd; })), div: __mean(bySeason(s, function (r) { return r.div; })), strGap: __mean(bySeason(s, function (r) { return r.strGap; })), pos: __median(bySeason(s, function (r) { return r.pos; })), alive: bySeason(s, function () { return 1; }).length }; }),
      perDiv: perDiv,
      goalsPerGame: __mean(matches.map(function (m) { return m.gf + m.ga; })),
      homeWin: wr(hm), awayWin: wr(am),
      draw: matches.filter(function (m) { return m.gf === m.ga; }).length / Math.max(1, matches.length),
      spinsPerCareer: __mean(list.map(function (c) { return c.st.spins; })),
      salesPerCareer: __mean(list.map(function (c) { return c.st.sales; })),
      saleMoney: __median(list.map(function (c) { return c.st.saleMoney; })),
      pools: POOLS.map(function (_, i) { return { mean: __mean(list.map(function (c) { return c.poolStats[i].mean; })), sd: __mean(list.map(function (c) { return c.poolStats[i].sd; })), min: __mean(list.map(function (c) { return c.poolStats[i].min; })), max: __mean(list.map(function (c) { return c.poolStats[i].max; })) }; }),
    };
  }

  window.__HARNESS__ = (function () {
    var out = { match: __matchModel(), cells: [] };
    if (__CONFIG.matchOnly) return out;
    __CONFIG.policies.forEach(function (pk) {
      __CONFIG.diffs.forEach(function (df) {
        __CONFIG.divs.forEach(function (dv) {
          var agg = { matches: [] }, list = [], t0 = Date.now();
          for (var i = 0; i < __CONFIG.n; i++) list.push(__playCareer(pk, df, dv, __CONFIG.seasons, agg));
          var sum = __summarize(list, agg);
          sum.policy = pk; sum.diff = df; sum.startDiv = dv; sum.ms = Date.now() - t0;
          out.cells.push(sum);
        });
      });
    });
    return out;
  })();
`;

const noop = () => {};
const dummyEl = () => ({ innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, addEventListener: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [] });
const store = {};
const sandbox = {
  console,
  __CONFIG: CONFIG,
  document: { getElementById: dummyEl, querySelector: () => null, querySelectorAll: () => [], createElement: dummyEl, addEventListener: noop },
  // Nessuna "eredità" da carriere precedenti: ogni carriera del banco parte pulita.
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: noop, removeItem: noop },
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
  .concat([HARNESS_BODY])
  .join('\n;\n');
vm.runInContext(combined, sandbox, { filename: 'balance.harness.combined.js' });

const H = sandbox.__HARNESS__;
if (CONFIG.json) { console.log(JSON.stringify(H)); process.exit(0); }

const pct = (x) => (isNaN(x) ? '  -' : (x * 100).toFixed(0).padStart(3) + '%');
const M = (x) => (isNaN(x) ? '-' : (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : Math.round(x / 1e3) + 'k'));
const f1 = (x) => (isNaN(x) ? '-' : x.toFixed(1));
const f2 = (x) => (isNaN(x) ? '-' : x.toFixed(2));

console.log('== Modello partita (Serie B, medio, 4-3-3, tattica neutra) ==');
console.log('scarto forza | vittoria pareggio sconfitta | gol/partita');
H.match.byGap.forEach((r) => console.log(String(r.d).padStart(11) + '  | ' + pct(r.win) + '     ' + pct(r.draw) + '     ' + pct(r.loss) + '    | ' + f2(r.goals)));
console.log('\n== Rivali contro rivali ==');
H.match.rivals.forEach((r) => console.log(r.div.padEnd(11) + ' casa ' + pct(r.home) + ' pari ' + pct(r.draw) + ' trasf ' + pct(r.away) + ' | gol ' + f2(r.goals) + ' | punti 1° ' + f1(r.champPts) + ' ultimo ' + f1(r.lastPts)));

H.cells.forEach((c) => {
  console.log('\n== ' + c.policy + ' · ' + c.diff + ' · parte da ' + ['Promozione', 'Eccellenza', 'Serie D', 'Serie C', 'Serie B', 'Serie A'][c.startDiv] + ' · ' + c.n + ' carriere (' + c.ms + ' ms) ==');
  console.log('in Serie A: ' + pct(c.reachedA) + ' (mediana stagione ' + f1(c.medSeasonsToA) + ') | cacciato: ' + pct(c.forced) + ' | amministrazione: ' + pct(c.admin) + ' | bloccato: ' + pct(c.stuck) + ' | stagioni giocate (med): ' + f1(c.medSeasons));
  console.log('categoria finale media: ' + f2(c.finalDiv) + ' | promozioni/carriera: ' + f2(c.promosPerCareer) + ' | retrocessioni: ' + f2(c.relegsPerCareer) + ' | trofei: ' + f2(c.trophies));
  console.log('gol/partita: ' + f2(c.goalsPerGame) + ' | vittorie casa ' + pct(c.homeWin) + ' trasferta ' + pct(c.awayWin) + ' pareggi ' + pct(c.draw) + ' | spin/carriera ' + f1(c.spinsPerCareer) + ' | cessioni ' + f1(c.salesPerCareer) + ' (' + M(c.saleMoney) + ')');
  console.log('stagione: ' + c.budgetS.map((b) => 'S' + b.s + ' cassa ' + M(b.med) + ' cat ' + f1(b.div) + ' Δforza ' + f1(b.strGap) + ' pos ' + f1(b.pos) + ' (' + b.alive + ')').join(' | '));
  c.perDiv.forEach((d) => console.log('  ' + d.div.padEnd(11) + ' stag ' + String(d.seasons).padStart(4) + ' | promo ' + pct(d.promo) + ' retro ' + pct(d.releg) + ' titolo ' + pct(d.title) + ' | pos med ' + f1(d.medPos) + ' Δforza ' + f1(d.strGap) + ' | stipendi/ricavi ' + f2(d.wageToGross) + ' | ricavi ' + M(d.medGross) + ' stipendi ' + M(d.medBill) + ' utile ' + M(d.medNet)));
  console.log('  rivali a fine carriera (media±sd, min-max): ' + c.pools.map((p, i) => ['Pro', 'Ecc', 'D', 'C', 'B', 'A'][i] + ' ' + f1(p.mean) + '±' + f1(p.sd) + ' ' + f1(p.min) + '-' + f1(p.max)).join(' | '));
});
