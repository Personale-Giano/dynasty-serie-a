/* ==========================================================================
   QUIZZOTTI v2 — Sopra o Sotto (chi vale di piu'?)
   Dati: assets/db-giocatoributget.js (`playersDatabase`, {name, role, team,
   value} con valore stimato in milioni, scala Transfermarkt, novembre 2026).
   A sinistra un calciatore col valore scoperto, a destra uno col valore
   coperto: vale di piu' o di meno? Se indovini il valore si scopre col
   contatore, il secondo passa a sinistra e ne arriva un altro. Al primo
   errore la serie finisce. Si parte da coppie lontane e nomi famosi, poi
   differenze sempre piu' strette e giocatori meno noti. Mai due valori
   uguali in coppia. Filtri: paese del club (mappa squadra -> paese qui
   sotto) e "stesso ruolo". A turni: 2-6 giocatori, vince la serie piu' lunga.
   Nei valori di mercato si parte dai nomi noti (valore da 15 milioni in su
   o presenti nel calendario del Calciatore del Giorno) e solo salendo con
   la serie arrivano i meno conosciuti.
   Mazzi storici (assets/db-sopraosotto.js): "Gol in Serie A", "Presenze in
   Serie A", "Gol in Nazionale" e "Campionati vinti". Stessa meccanica, con
   le differenze in scala (scale < 1 quando i numeri stanno vicini, come i gol
   dei bomber tra 100 e 274).
   A turni tutti giocano con lo stesso seme: finche' indovinano, ognuno vede
   la stessa sequenza di coppie. Conta la bravura, non la fortuna del sorteggio.
   Sopra o Sotto del giorno (dal 27 novembre 2026, data di Roma): valori di
   mercato, tutto il mondo, tutti i ruoli, seme dalla data (QZ.giorno.seed):
   le stesse coppie per tutti. Una sola partita valida al giorno: appena
   comincia e' salvata in qz.sopraosotto.daily.v1 ({ data: { n, streak, done } }),
   e chi chiude la pagina a meta' si tiene la serie raggiunta fin li'.
   Si apre anche da SopraOSotto.html?giorno (il Giornale di oggi). A fine
   partita va alle Leghe (QZ.leagues.submit('sopraosotto', N°, { streak })).
   Sfida un amico (assets/sfida.js): il link porta seme, mazzo, campionato e
   ruolo della partita da solo; l'amico vede le stesse coppie. Le partite del
   giorno e di sfida non toccano record e statistiche normali.
   Il nucleo (mappa, mazzo, scelta delle coppie) non tocca il DOM ed e'
   esportato per i test (tests/sopraosotto.test.js).
   ========================================================================== */
/* global sosGoalsDatabase, sosAppsDatabase, sosNationalGoalsDatabase, sosTitlesDatabase, dailyCalendar */
(function () {
    'use strict';

    /* ---------- Nucleo: niente DOM ---------- */

    /** Paese del campionato in cui gioca il club (serie minori comprese). */
    var LEAGUES = {
        ITA: ['Juventus', 'Inter', 'Milan', 'Napoli', 'Lazio', 'Como', 'Atalanta', 'Sassuolo', 'Fiorentina', 'Torino', 'Roma', 'Bologna',
            'Udinese', 'Cagliari', 'Lecce', 'Parma', 'Genoa', 'Verona', 'Cremonese', 'Monza', 'Venezia', 'Pisa', 'Palermo', 'Frosinone',
            'Sampdoria', 'Modena', 'Padova', 'Avellino'],
        ENG: ['Tottenham', 'Liverpool', 'Chelsea', 'Manchester United', 'Leeds', 'Aston Villa', 'Arsenal', 'Manchester City', 'Bournemouth',
            'Newcastle', 'Brentford', 'Nottingham Forest', 'Crystal Palace', 'Fulham', 'Brighton', 'Sunderland', 'Everton', 'West Ham',
            'Wolverhampton', 'Ipswich', 'Burnley', 'Leicester', 'Hull City', 'Coventry', 'Watford', 'Southampton', 'Sheffield United',
            'Stoke City', 'QPR', 'Wrexham', 'Charlton', 'Derby County'],
        ESP: ['Real Madrid', 'Barcellona', 'Athletic Bilbao', 'Betis', 'Real Sociedad', 'Atlético Madrid', 'Villarreal', 'Siviglia',
            'Celta Vigo', 'Valencia', 'Osasuna', 'Getafe', 'Rayo Vallecano', 'Espanyol', 'Alavés', 'Levante', 'Elche',
            'Deportivo La Coruña', 'Racing Santander', 'Maiorca', 'Leganés', 'Málaga'],
        GER: ['Bayern Monaco', 'Bayer Leverkusen', 'RB Lipsia', 'Borussia Dortmund', 'Stoccarda', 'Colonia', 'Mainz', 'Eintracht Francoforte',
            'Friburgo', 'Hoffenheim', 'Amburgo', 'Borussia Mönchengladbach', 'Werder Brema', 'Union Berlino', 'Augsburg', 'Wolfsburg',
            'Schalke 04', 'Heidenheim', 'Norimberga', 'Paderborn', 'St. Pauli'],
        FRA: ['Paris Saint-Germain', 'Rennes', 'Monaco', 'Lilla', 'Nizza', 'Olympique Lione', 'Olympique Marsiglia', 'Lens', 'Paris FC',
            'Strasburgo', 'Tolosa', 'Brest', 'Nantes', 'Le Havre', 'Angers', 'Lorient']
    };
    var LEAGUE_NAMES = { ALL: 'Tutto il mondo', ITA: 'Italia', ENG: 'Inghilterra', ESP: 'Spagna', GER: 'Germania', FRA: 'Francia', ROW: 'Resto del mondo' };
    var TEAM_LEAGUE = {};
    Object.keys(LEAGUES).forEach(function (k) { LEAGUES[k].forEach(function (t) { TEAM_LEAGUE[t] = k; }); });

    function leagueOf(team) { return TEAM_LEAGUE[team] || 'ROW'; }
    // il campionato vero, quando il database lo dice (db-giocatoributget.js ha il campo league)
    var BY_LEAGUE_NAME = { 'Serie A': 'ITA', 'Premier League': 'ENG', 'Liga': 'ESP', 'Bundesliga': 'GER', 'Ligue 1': 'FRA' };
    function leagueOfPlayer(p) { return p.league ? (BY_LEAGUE_NAME[p.league] || 'ROW') : leagueOf(p.team); }
    function keyOf(p) { return p.name + '|' + p.team; }

    /**
     * I giocatori in gioco con i filtri scelti, senza doppioni, dal piu' caro al meno caro.
     * opts.known (funzione giocatore -> vero/falso): se c'e', prima vengono i noti
     * (sempre dal piu' caro) e poi gli altri; pool.known dice quanti sono i noti.
     */
    function buildPool(db, opts) {
        opts = opts || {};
        var seen = {}, out = [];
        db.forEach(function (p) {
            var k = keyOf(p);
            if (seen[k] || !(p.value > 0)) return;
            if (opts.league && opts.league !== 'ALL' && leagueOfPlayer(p) !== opts.league) return;
            if (opts.role && p.role !== opts.role) return;
            seen[k] = 1;
            out.push(p);
        });
        if (typeof opts.known !== 'function') return out.sort(function (a, b) { return b.value - a.value; });
        var isKnown = opts.known;
        var known = out.filter(function (p) { return isKnown(p); });
        var rest = out.filter(function (p) { return !isKnown(p); });
        var byValue = function (a, b) { return b.value - a.value; };
        var pool = known.sort(byValue).concat(rest.sort(byValue));
        pool.known = known.length;
        return pool;
    }

    /** Il calciatore e' noto: vale almeno 15 milioni o e' nel calendario del Calciatore del Giorno. */
    var KNOWN_VALUE = 15;
    function knownTest(names) {
        var set = {};
        (names || []).forEach(function (n) { set[n] = 1; });
        return function (p) { return p.value >= KNOWN_VALUE || set[p.name] === 1; };
    }

    /** Con "stesso ruolo" i ruoli che hanno abbastanza giocatori (e valori diversi) per una partita. */
    function playableRoles(db, league) {
        return ['POR', 'DIF', 'CEN', 'ATT'].filter(function (r) { return playable(buildPool(db, { league: league, role: r })); });
    }
    function playable(pool) {
        var vals = {};
        pool.forEach(function (p) { vals[p.value] = 1; });
        return pool.length >= 8 && Object.keys(vals).length >= 4;
    }

    /**
     * Difficolta' alla serie n: quanta parte del mazzo (i piu' famosi = i piu' cari)
     * e' in gioco e quanto devono essere lontani i due valori (rapporto tra il
     * maggiore e il minore).
     */
    // sotto 1,25 (25% di differenza) i confronti diventano lotterie: ci si ferma li'
    var MIN_RATIO = 1.25;
    function level(n, scale) {
        var minR = Math.max(MIN_RATIO, 2.5 * Math.pow(0.93, n));
        var maxR = n < 2 ? Infinity : Math.max(1.5, minR * 2.2);
        // mazzi coi numeri vicini (i gol dei bomber): stessa curva, schiacciata verso 1
        var k = scale > 0 && scale < 1 ? scale : 1;
        return {
            top: Math.min(1, 0.3 + 0.05 * n),
            minR: 1 + (minR - 1) * k,
            maxR: maxR === Infinity ? Infinity : 1 + (maxR - 1) * k
        };
    }

    function ratio(a, b) { return Math.max(a, b) / Math.min(a, b); }

    /**
     * Fin dove si pesca nel mazzo alla serie n (i primi topN giocatori).
     * Mazzi piccoli (i mazzi storici, fino a 150 voci): sono tutti famosi, tutto il mazzo.
     * Mazzo coi noti davanti (pool.known): fino alla serie 9 solo i noti, poi entrano
     * piano piano gli altri (dal piu' caro), tutti dalla serie 40.
     * Altrimenti: la parte piu' cara del mazzo, sempre piu' larga.
     */
    var KNOWN_ONLY = 10, KNOWN_ALL = 40;
    function reach(pool, n, L) {
        var len = pool.length;
        if (len <= 150) return len;
        var floor = Math.min(len, 30);
        if (pool.known != null) {
            var k = pool.known;
            var t = Math.min(1, Math.max(0, (n - KNOWN_ONLY + 1) / (KNOWN_ALL - KNOWN_ONLY + 1)));
            return Math.max(floor, Math.min(len, k + Math.ceil((len - k) * t)));
        }
        return Math.max(floor, Math.ceil(len * (L || level(n)).top));
    }

    /**
     * Il prossimo giocatore da mettere a destra contro `left`. Mai lo stesso
     * valore. Se la fascia ideale e' vuota si allarga un passo alla volta.
     * used: oggetto {chiave: true} dei gia' visti in questa serie.
     * scale: vedi level() (1 o assente per i valori di mercato).
     * avoid: il valore del giocatore di due turni fa. Con tanti prezzi tondi
     * la serie rischiava il ping-pong (25, 15, 25, 15...): se si puo', no.
     */
    function nextPlayer(pool, left, n, used, rng, scale, avoid) {
        rng = rng || Math.random;
        used = used || {};
        var L = level(n, scale);
        var topN = reach(pool, n, L);
        var tries = [
            { top: topN, minR: L.minR, maxR: L.maxR, fresh: true },
            { top: topN, minR: Math.max(1 + (L.minR - 1) * 0.5, 1.01), maxR: Infinity, fresh: true },
            { top: pool.length, minR: Math.min(L.minR, 1.3), maxR: L.maxR === Infinity ? Infinity : 1 + (L.maxR - 1) * 1.5, fresh: true },
            { top: pool.length, minR: 1, maxR: Infinity, fresh: true },
            { top: pool.length, minR: 1, maxR: Infinity, fresh: false }
        ];
        for (var t = 0; t < tries.length; t++) {
            var c = tries[t], cand = [];
            for (var i = 0; i < c.top; i++) {
                var p = pool[i];
                if (p === left || p.value === left.value) continue;
                if (c.fresh && used[keyOf(p)]) continue;
                var r = ratio(p.value, left.value);
                if (r >= c.minR && r <= c.maxR) cand.push(p);
            }
            if (avoid != null && cand.length) {
                var varied = cand.filter(function (x) { return x.value !== avoid; });
                if (varied.length) cand = varied;
            }
            if (cand.length) return cand[Math.floor(rng() * cand.length)];
        }
        return null;
    }

    /** Il primo giocatore della serie: uno famoso, nel primo 10% piu' caro del mazzo. */
    function firstPlayer(pool, rng) {
        rng = rng || Math.random;
        var topN = Math.max(Math.min(pool.length, 12), Math.ceil(pool.length * 0.1));
        return pool[Math.floor(rng() * topN)];
    }

    /** Generatore pseudo-casuale ripetibile (mulberry32): stesso seme, stessi numeri. */
    function makeRng(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6d2b79f5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function newSeed() { return Math.floor(Math.random() * 4294967296) >>> 0; }

    /**
     * Una serie nuova: la prima coppia, pescata col seme. A turni il seme e' lo
     * stesso per tutti, e siccome la coppia dopo dipende solo dalle coppie
     * prima (e dal seme), chi indovina vede la stessa sequenza degli altri.
     */
    function newSeries(pool, seed, scale) {
        var s = { pool: pool, rng: makeRng(seed), scale: scale, streak: 0, used: {}, left: null, right: null };
        s.left = firstPlayer(pool, s.rng);
        s.used[keyOf(s.left)] = true;
        s.right = nextPlayer(pool, s.left, 0, s.used, s.rng, scale);
        s.used[keyOf(s.right)] = true;
        return s;
    }

    /** Dopo una risposta giusta (streak gia' aumentata): il secondo passa a sinistra, ne arriva un altro. */
    function advance(s) {
        var before = s.left.value;
        s.left = s.right;
        s.right = nextPlayer(s.pool, s.left, s.streak, s.used, s.rng, s.scale, before);
        s.used[keyOf(s.right)] = true;
        return s;
    }

    /** 'up' se il secondo vale di piu', 'down' se vale di meno (i valori non sono mai uguali). */
    function answer(left, right) { return right.value > left.value ? 'up' : 'down'; }

    /** Valore in parole da tabellone: 45 mln, 2,5 mln, 800 mila. */
    function fmtValue(v) {
        if (v < 1) return Math.round(v * 1000) + ' mila';
        var d = Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0;
        var s = v.toFixed(d).replace('.', ',');
        return s + ' mln';
    }

    /** I gol, per il mazzo dei bomber: "1 gol", "274 gol". */
    function fmtGoals(v) { return v + ' gol'; }

    /** Quanto sono lontani i due valori, detto come al bar: "35 mln in più", "12 gol in meno". */
    function diffText(left, right, fmt) {
        var d = Math.round(Math.abs(right.value - left.value) * 1000) / 1000;
        return (fmt || fmtValue)(d) + (right.value > left.value ? ' in più' : ' in meno');
    }

    /** Le presenze: "1 presenza", "657 presenze". */
    function fmtApps(v) { return v + (v === 1 ? ' presenza' : ' presenze'); }
    /** I campionati vinti: "1 titolo", "36 titoli". */
    function fmtTitles(v) { return v + (v === 1 ? ' titolo' : ' titoli'); }

    /**
     * I mazzi: i valori di mercato (con filtri) e i mazzi storici.
     * scale: vedi level(). tag: l'etichetta sopra il nome (se manca, quella della voce).
     * verb/where: per le frasi ("ha segnato 274 gol in Serie A").
     */
    var DECKS = {
        mercato: { label: 'Valori di mercato', valueLabel: 'Valore stimato', scale: 1, fmt: fmtValue, filters: true,
            question: 'Vale di più o di meno?', up: 'Vale di più', down: 'Vale di meno', verb: 'vale', where: '' },
        gol: { label: 'Gol in Serie A', valueLabel: 'Gol in Serie A', scale: 0.35, fmt: fmtGoals, filters: false, tag: 'Bomber',
            question: 'Ne ha segnati di più o di meno?', up: 'Più gol', down: 'Meno gol', verb: 'ha segnato', where: ' in Serie A',
            share: 'sui gol in Serie A dei grandi bomber. Chi ne ha fatti di più?' },
        presenze: { label: 'Presenze in Serie A', valueLabel: 'Presenze in Serie A', scale: 0.25, fmt: fmtApps, filters: false,
            question: 'Ne ha giocate di più o di meno?', up: 'Più presenze', down: 'Meno presenze', verb: 'ha collezionato', where: ' in Serie A',
            share: 'sulle presenze in Serie A delle grandi bandiere. Chi ne ha giocate di più?' },
        nazionale: { label: 'Gol in Nazionale', valueLabel: 'Gol in Nazionale', scale: 0.35, fmt: fmtGoals, filters: false,
            question: 'Ne ha segnati di più o di meno?', up: 'Più gol', down: 'Meno gol', verb: 'ha segnato', where: ' in nazionale',
            share: 'sui gol in nazionale dei bomber di tutto il mondo. Chi ne ha fatti di più?' },
        titoli: { label: 'Campionati vinti', valueLabel: 'Campionati vinti', scale: 1, fmt: fmtTitles, filters: false, clubs: true,
            question: 'Ne ha vinti di più o di meno?', up: 'Più titoli', down: 'Meno titoli', verb: 'ha vinto', where: '',
            share: 'sui campionati vinti dai grandi club d\'Europa. Chi ne ha vinti di più?' }
    };

    /** Il cognome da tabellone: "De Winter", "van Dijk", "Mac Allister"; nomi coreani e "Vinícius Jr." interi. */
    function surname(name) {
        var w = name.split(' ');
        if (w.length < 2 || /^(Jr\.?|J[uú]nior)$/i.test(w[w.length - 1]) || /^[A-Z][a-z]+ [A-Z][a-z]+-[a-z]+$/.test(name)) return name;
        for (var i = 1; i < w.length - 1; i++) {
            if (/^(de|di|da|do|du|del|della|dos|das|van|von|der|den|le|la|el|al|ben|ter|ten|mac)$/i.test(w[i])) return w.slice(i).join(' ');
        }
        return w[w.length - 1];
    }

    /** Le regole di una partita nel link della sfida: 'mercato-all-any', 'mercato-ita-por', 'gol'. */
    function optOf(m) {
        return m.deck !== 'mercato' ? m.deck : ['mercato', String(m.league || 'ALL').toLowerCase(), m.role ? m.role.toLowerCase() : 'any'].join('-');
    }
    /** Il contrario di optOf: { deck, league, role } (valori sconosciuti: quelli di base). */
    function parseOpt(opt) {
        var p = String(opt || '').split('-');
        var deck = DECKS[p[0]] ? p[0] : 'mercato';
        if (deck !== 'mercato') return { deck: deck, league: 'ALL', role: null };
        var lg = String(p[1] || '').toUpperCase(), rl = String(p[2] || '').toUpperCase();
        return { deck: 'mercato', league: LEAGUE_NAMES[lg] ? lg : 'ALL', role: ['POR', 'DIF', 'CEN', 'ATT'].indexOf(rl) >= 0 ? rl : null };
    }
    /** Quadratini della serie del giorno: una casella verde per confronto azzeccato (al massimo 20), rossa per l'errore. */
    function dailyGrid(streak, missed) {
        var n = Math.max(0, streak | 0);
        var g = '';
        for (var i = 0; i < Math.min(n, 20); i++) g += '🟩';
        if (n > 20) g += ' +' + (n - 20);
        return g + (missed ? '🟥' : '');
    }

    var core = {
        optOf: optOf, parseOpt: parseOpt, dailyGrid: dailyGrid,
        LEAGUES: LEAGUES, LEAGUE_NAMES: LEAGUE_NAMES, DECKS: DECKS, leagueOf: leagueOf, leagueOfPlayer: leagueOfPlayer, buildPool: buildPool, playable: playable,
        playableRoles: playableRoles, level: level, nextPlayer: nextPlayer, firstPlayer: firstPlayer, answer: answer,
        fmtValue: fmtValue, fmtGoals: fmtGoals, fmtApps: fmtApps, fmtTitles: fmtTitles, diffText: diffText, ratio: ratio, surname: surname,
        MIN_RATIO: MIN_RATIO, KNOWN_VALUE: KNOWN_VALUE, KNOWN_ONLY: KNOWN_ONLY, knownTest: knownTest, reach: reach,
        makeRng: makeRng, newSeries: newSeries, advance: advance
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ---------- Interfaccia ---------- */

    var $ = QZ.$;
    var GAME = 'sopraosotto';
    var ROLE_NAMES = { POR: 'Portiere', DIF: 'Difensore', CEN: 'Centrocampista', ATT: 'Attaccante' };
    var ROLE_PLURAL = { POR: 'portieri', DIF: 'difensori', CEN: 'centrocampisti', ATT: 'attaccanti' };
    var MILESTONES = {
        5: 'Cinque di fila. Hai l\'occhio del ds',
        10: 'Dieci. Ti chiamano dal calciomercato',
        15: 'Quindici di fila. Lavori per Transfermarkt?',
        25: 'Venticinque. Questo è un procuratore travestito',
        40: 'Quaranta. Al bar ti hanno già chiesto chi sei',
        50: 'Cinquanta di fila. Si chiude per eccesso di competenza'
    };
    var MILESTONES_GOL = {
        5: 'Cinque di fila. Gli almanacchi li hai letti',
        10: 'Dieci. Sai i gol a memoria come le formazioni',
        15: 'Quindici di fila. Ti chiamano per le statistiche in tv',
        25: 'Venticinque. Sei tu l\'archivio della Gazzetta',
        40: 'Quaranta. Piola ti stringe la mano'
    };
    var MILESTONES_STORIA = {
        5: 'Cinque di fila. Gli almanacchi li hai letti',
        10: 'Dieci. Sai i numeri a memoria come le formazioni',
        15: 'Quindici di fila. Ti chiamano per le statistiche in tv',
        25: 'Venticinque. Sei tu l\'archivio della Gazzetta',
        40: 'Quaranta. Roba da museo del calcio'
    };
    var DATA = {
        mercato: typeof playersDatabase !== 'undefined' ? playersDatabase : [],
        gol: typeof sosGoalsDatabase !== 'undefined' ? sosGoalsDatabase : [],
        presenze: typeof sosAppsDatabase !== 'undefined' ? sosAppsDatabase : [],
        nazionale: typeof sosNationalGoalsDatabase !== 'undefined' ? sosNationalGoalsDatabase : [],
        titoli: typeof sosTitlesDatabase !== 'undefined' ? sosTitlesDatabase : []
    };
    // i calciatori noti del mercato: valore alto o nel calendario del Calciatore del Giorno
    var KNOWN = knownTest(typeof dailyCalendar !== 'undefined' ? dailyCalendar : []);
    var SET_KEY = 'qz.sopraosotto.settings', BEST_KEY = 'qz.sopraosotto.best', STATS_KEY = 'qz.sopraosotto.stats';
    var DAILY_KEY = 'qz.sopraosotto.daily.v1';   // serie del giorno: { 'AAAA-MM-GG': { n, streak, done, missed, seen, miss, tight } }
    var SF = QZ.sfida || null, GG = QZ.giorno || null;
    var CH = SF ? SF.read(GAME, 0) : null;        // la sfida arrivata col link

    var set = Object.assign({ league: 'ALL', role: 'any', mode: 'solo', deck: 'mercato' }, QZ.store.get(SET_KEY, {}) || {});
    if (!LEAGUE_NAMES[set.league]) set.league = 'ALL';
    if (!DECKS[set.deck] || !DATA[set.deck].length) set.deck = 'mercato';
    if (set.role !== 'same') set.role = 'any';
    if (set.mode !== 'turns') set.mode = 'solo';
    var S = {};      // la serie in corso
    var M = null;    // la partita (uno o piu' giocatori)
    var starting = false;

    function deck() { return DECKS[(M && M.deck) || set.deck]; }
    function fmt(v) { return deck().fmt(v); }
    function isGol() { return !!M && M.deck === 'gol'; }
    /** Uno dei mazzi storici (numeri interi, frasi coi verbi del mazzo). */
    function isHist() { return !!M && M.deck !== 'mercato'; }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('updown');
    $('#rules').innerHTML = [
        ['Due nomi.', 'Del primo vedi il numero, del secondo no: il valore di mercato, oppure gol, presenze o campionati vinti se giochi coi mazzi storici.'],
        ['Di più o di meno?', 'Tocca il pulsante, o usa le frecce su e giù della tastiera. Niente cronometro: pensaci quanto vuoi.'],
        ['Indovini?', 'Il secondo passa a sinistra e ne arriva un altro. La serie cresce.'],
        ['Sbagli?', 'Fine della corsa. All\'inizio è facile, poi i numeri si avvicinano e i nomi si fanno oscuri.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var ARROW = function (d) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>'; };
    $('#g-up').innerHTML = ARROW('M12 19V5M5 12l7-7 7 7') + '<span>Di più</span>';
    $('#g-down').innerHTML = ARROW('M12 5v14M19 12l-7 7-7-7') + '<span>Di meno</span>';
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Chiedo il cambio';
    $('#turn-go').innerHTML = 'Sono pronto' + QZ.icon('arrow');

    function saveSet() { QZ.store.set(SET_KEY, set); paintRecord(); }

    QZ.segmented($('#set-deck'), Object.keys(DECKS).filter(function (k) { return DATA[k].length; }).map(function (k) {
        return { label: DECKS[k].label, value: k };
    }), set.deck, function (v) { set.deck = v; saveSet(); paintMode(); });
    QZ.segmented($('#set-league'), ['ALL', 'ITA', 'ENG', 'ESP', 'GER', 'FRA', 'ROW'].map(function (k) {
        return { label: LEAGUE_NAMES[k], value: k };
    }), set.league, function (v) { set.league = v; saveSet(); });
    QZ.segmented($('#set-role'), [{ label: 'Tutti i ruoli', value: 'any' }, { label: 'Stesso ruolo', value: 'same' }], set.role, function (v) { set.role = v; saveSet(); });
    QZ.segmented($('#set-mode'), [{ label: 'Da solo', value: 'solo' }, { label: 'A turni', value: 'turns' }], set.mode, function (v) { set.mode = v; saveSet(); paintMode(); });
    var plist = QZ.playerList($('#set-players'), { key: GAME, min: 2, max: 6, initial: 2, label: 'Giocatore', title: 'Chi gioca (2-6)' });

    var DECK_HINTS = {
        mercato: function () { return 'Valori di mercato stimati, sulla scala di Transfermarkt, aggiornati a novembre 2026. Si parte dai nomi noti, poi arrivano anche gli sconosciuti. Il mercato cambia: se un prezzo vi sembra strano, prendetevela col procuratore.'; },
        gol: function () { return 'I gol in Serie A di ' + DATA.gol.length + ' bomber della storia, da Piola a Hamšík. Solo gente che in campionato ha chiuso: il conto non cambia più.'; },
        presenze: function () { return 'Le presenze in Serie A di ' + DATA.presenze.length + ' bandiere del campionato, da Buffon (657) in giù. Solo gente che in Serie A ha chiuso: il conto non cambia più.'; },
        nazionale: function () { return 'I gol con la nazionale maggiore di tutti i ' + DATA.nazionale.length + ' calciatori arrivati almeno a 50, da Cristiano Ronaldo in giù. Per chi gioca ancora il conto è fermo alla sosta di novembre 2026.'; },
        titoli: function () { return 'I campionati vinti da ' + DATA.titoli.length + ' club di Italia, Inghilterra, Spagna, Germania, Francia, Portogallo, Paesi Bassi e Scozia, aggiornati alla stagione 2025-26.'; }
    };

    function paintMode() {
        $('#players-box').hidden = set.mode !== 'turns';
        var filters = DECKS[set.deck].filters;
        $('#f-league').hidden = !filters;
        $('#f-role').hidden = !filters;
        $('#deck-hint').textContent = DECK_HINTS[set.deck]();
    }
    paintMode();
    paintRecord();

    $('#start-btn').addEventListener('click', startMatch);
    $('#g-up').addEventListener('click', function () { guess('up'); });
    $('#g-down').addEventListener('click', function () { guess('down'); });
    $('#g-quit').addEventListener('click', giveUp);
    $('#turn-go').addEventListener('click', function () { startRun(); });

    document.addEventListener('keydown', function (e) {
        if (!S.active || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.qz-modal')) return;
        var k = e.key;
        var dir = k === 'ArrowUp' || k === '+' ? 'up' : k === 'ArrowDown' || k === '-' ? 'down' : null;
        if (dir) { e.preventDefault(); guess(dir); }
    });

    /* ---------- Record (per mazzo, campionato e ruoli) ---------- */
    // le chiavi dei valori di mercato restano quelle di sempre ("ALL-any"...): i record vecchi non si perdono
    function recKey() { return set.deck === 'mercato' ? set.league + '-' + set.role : set.deck; }
    function records() { var r = QZ.store.get(BEST_KEY, {}); return r && typeof r === 'object' ? r : {}; }
    function stats() {
        var s = QZ.store.get(STATS_KEY, null);
        return s && typeof s === 'object' && s.games > 0 && s.sum >= 0 ? s : { games: 0, sum: 0 };
    }
    function paintRecord() {
        var r = records()[recKey()];
        var parts = [];
        if (r) parts.push('Record con queste regole: ' + r + ' di fila');
        var all = QZ.profile.best(GAME);
        if (all) parts.push('miglior serie in assoluto: ' + all);
        var st = stats();
        if (st.games >= 3) parts.push(st.games + ' serie giocate, media ' + String(Math.round(st.sum / st.games * 10) / 10).replace('.', ','));
        $('#start-record').textContent = parts.join(' · ');
    }
    function filterLabel(m) {
        if (m.deck !== 'mercato') return DECKS[m.deck].label;
        return LEAGUE_NAMES[m.league] + (m.sameRole ? ', stesso ruolo' : '');
    }

    /* ---------- Partita ---------- */
    function poolFor(m, role) {
        return m.deck !== 'mercato' ? buildPool(DATA[m.deck], {}) : buildPool(DATA.mercato, { league: m.league, role: role, known: KNOWN });
    }

    function startMatch() {
        if (starting) return;
        var names = set.mode === 'turns' ? plist.get() : ['Tu'];
        var hist = set.deck !== 'mercato';
        var same = !hist && set.role === 'same';
        var roles = same ? playableRoles(DATA.mercato, set.league) : [];
        if (same ? !roles.length : !playable(hist ? buildPool(DATA[set.deck], {}) : buildPool(DATA.mercato, { league: set.league }))) {
            QZ.toast('Con questi filtri restano troppo pochi giocatori', { icon: 'x', type: 'bad' });
            return;
        }
        M = {
            turns: set.mode === 'turns',
            players: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], streak: null, seen: 0, miss: null }; }),
            idx: 0,
            deck: set.deck,
            league: set.league,
            sameRole: same,
            recKey: recKey(),
            // un seme per partita: a turni tutti affrontano la stessa sequenza di coppie
            seed: newSeed(),
            // con "stesso ruolo" il ruolo si sorteggia una volta per partita: a turni e' uguale per tutti
            role: same ? QZ.pick(roles) : null,
            kind: null
        };
        if (M.turns) showTurn(); else startRun();
    }

    /**
     * Partita da solo con regole fisse, che non tocca record e statistiche normali:
     * kind 'sfida' (il link di un amico) o 'giorno' (la serie del giorno).
     * rules: { deck, league, role }; extra finisce in M (ch, ymd, n).
     */
    function startSpecial(kind, rules, seed, extra) {
        if (starting) return false;
        var pool = rules.deck !== 'mercato' ? buildPool(DATA[rules.deck], {}) : buildPool(DATA.mercato, { league: rules.league, role: rules.role });
        if (!playable(pool)) { QZ.toast('Con queste regole restano troppo pochi giocatori', { icon: 'x', type: 'bad' }); return false; }
        M = Object.assign({
            turns: false,
            players: [{ name: 'Tu', color: QZ.TEAM_COLORS[0], streak: null, seen: 0, miss: null }],
            idx: 0, deck: rules.deck, league: rules.league, sameRole: !!rules.role, recKey: null,
            seed: seed >>> 0, role: rules.role || null, kind: kind
        }, extra || {});
        startRun();
        return true;
    }

    function showTurn() {
        var p = M.players[M.idx];
        $('#hand-name').textContent = p.name;
        $('#hand-round').textContent = 'Turno ' + (M.idx + 1) + ' di ' + M.players.length;
        $('#hand-band').style.background = p.color;
        var done = M.players.filter(function (x) { return x.streak != null; });
        $('#hand-score').innerHTML = done.length
            ? 'Da battere: <b>' + bestSoFar() + ' di fila</b>'
            : 'Si apre la serata: la prima serie fa da bersaglio.';
        QZ.show('s-turn');
        setTimeout(function () { $('#turn-go').focus({ preventScroll: true }); }, 260);
    }

    function startRun() {
        if (starting || !M) return;
        starting = true;
        var role = M.role;
        var pool = poolFor(M, role);
        var dk = deck();
        S = Object.assign(newSeries(pool, M.seed, dk.scale), { role: role, active: false, done: false, ended: false, player: M.players[M.idx], tight: null, lastBtn: null });
        var rec = M.kind ? 0 : records()[M.recKey];
        $('#g-rec').textContent = M.turns ? two(bestSoFar()) : M.kind === 'sfida' ? two(M.ch.score) : M.kind === 'giorno' ? two(M.n) : two(rec || 0);
        $('#g-rec-label').textContent = M.turns || M.kind === 'sfida' ? 'Da battere' : M.kind === 'giorno' ? 'Del giorno N°' : 'Record';
        $('#g-who').textContent = M.turns ? S.player.name : M.kind === 'giorno' ? 'Serie del giorno' : filterLabel(M);
        $('#g-who-label').textContent = M.turns ? 'In campo' : 'Si gioca';
        $('#g-filter').textContent = M.turns ? (role ? LEAGUE_NAMES[M.league] + ', solo ' + ROLE_PLURAL[role] : filterLabel(M)) : role ? 'Solo ' + ROLE_PLURAL[role] : '';
        $('#g-filter').hidden = !$('#g-filter').textContent;
        QZ.$$('.sos-value__label').forEach(function (x) { x.textContent = dk.valueLabel; });
        $('#g-question').textContent = dk.question;
        $('#g-up').setAttribute('aria-label', dk.up);
        $('#g-down').setAttribute('aria-label', dk.down);
        $('#g-kbd').textContent = dk.up.toLowerCase();
        $('#g-kbd2').textContent = dk.down.toLowerCase();
        paintStreak(false);
        paintCard($('#c-left'), S.left, true);
        paintCard($('#c-right'), S.right, false);
        $('#g-arena').classList.remove('is-bad', 'is-ok');
        setButtons(false);
        QZ.show('s-game');
        QZ.sound.start();
        QZ.wake.on();
        if (M.kind === 'sfida' && SF) SF.kickoff(M.ch, M.ch.score + ' di fila');
        setTimeout(function () {
            starting = false;
            ready();
        }, 380);
    }

    function bestSoFar() {
        var done = M.players.filter(function (x) { return x.streak != null; });
        return done.length ? Math.max.apply(null, done.map(function (x) { return x.streak; })) : 0;
    }

    function two(n) { return String(n).padStart(2, '0'); }

    function paintStreak(bump) {
        var el = $('#g-streak');
        el.textContent = two(S.streak);
        if (bump) QZ.fx.pop(el);
    }

    function paintCard(card, p, open) {
        card.querySelector('[data-role]').textContent = deck().tag || p.tag || ROLE_NAMES[p.role] || p.role || '';
        card.querySelector('[data-name]').textContent = p.name;
        card.querySelector('[data-team]').textContent = p.team;
        var v = card.querySelector('[data-value]');
        v.textContent = open ? fmt(p.value) : '?';
        v.classList.toggle('is-hidden', !open);
        var d = card.querySelector('[data-diff]');
        if (d) { d.textContent = ''; d.hidden = true; }
        card.classList.remove('is-ok', 'is-bad');
        QZ.$$('.qz-stamp', card).forEach(function (x) { x.remove(); });
    }

    function setButtons(on) {
        $('#g-up').disabled = !on;
        $('#g-down').disabled = !on;
    }

    function ready() {
        if (S.done) return;
        if (S.paused) { S.pendingReady = true; return; }
        S.active = true;
        setButtons(true);
        var dk = deck();
        QZ.say(S.left.name + ', ' + S.left.team + ', ' + dk.verb + ' ' + fmt(S.left.value) + '. ' +
            S.right.name + ', ' + S.right.team + ': ' + dk.question.charAt(0).toLowerCase() + dk.question.slice(1));
        // il fuoco torna sul pulsante usato (era disabilitato durante la rivelazione)
        var a = document.activeElement;
        if (!document.querySelector('.qz-modal') && (!a || a === document.body || a.disabled || a.offsetParent === null)) (S.lastBtn || $('#g-up')).focus({ preventScroll: true });
    }

    /** Il contatore del valore che scorre fino al numero vero. */
    function countValue(el, to, ms) {
        el.classList.remove('is-hidden');
        if (!ms || QZ.reducedMotion()) { el.textContent = fmt(to); return; }
        var t0 = performance.now(), gol = isHist(), f = deck().fmt;
        (function frame(ts) {
            var k = Math.min(1, Math.max(0, (ts - t0) / ms)), e = 1 - Math.pow(1 - k, 3);
            var x = to * e;
            // si ferma sui gradini veri: numeri interi nei mazzi storici, decimi sotto i 10 milioni, migliaia sotto il milione
            x = gol ? Math.round(x) : to < 1 ? Math.round(x * 100) / 100 : to < 10 ? Math.round(x * 10) / 10 : Math.round(x);
            el.textContent = k < 1 ? f(gol ? x : Math.max(x, to < 1 ? 0.01 : 0.1)) : f(to);
            if (k < 1) requestAnimationFrame(frame);
        })(t0);
    }

    function guess(dir) {
        if (!S.active) return;
        S.active = false;
        setButtons(false);
        var ok = dir === answer(S.left, S.right);
        var right = $('#c-right');
        var btn = dir === 'up' ? $('#g-up') : $('#g-down');
        S.lastBtn = btn;
        btn.classList.add('is-picked');
        var ms = QZ.reducedMotion() ? 0 : 750;
        countValue(right.querySelector('[data-value]'), S.right.value, ms);
        QZ.sound.tick();
        var run = S;   // i timer guardano solo la serie che li ha lanciati (a turni ne parte subito un'altra)
        setTimeout(function () {
            btn.classList.remove('is-picked');
            if (S !== run || S.done) return;
            var d = right.querySelector('[data-diff]');
            d.textContent = diffText(S.left, S.right, deck().fmt) + ' di ' + S.left.name;
            d.hidden = false;
            if (ok) win(right); else lose(right, dir);
        }, ms + 60);
    }

    function win(card) {
        S.streak++;
        // la serie del giorno si salva a ogni passo: chi chiude la pagina a meta' tiene quella
        if (M.kind === 'giorno') saveDaily(M.ymd, { streak: S.streak, seen: Object.keys(S.used).length });
        var r = ratio(S.left.value, S.right.value);
        if (!S.tight || r < S.tight.r) S.tight = { r: r, a: S.left, b: S.right };
        card.classList.add('is-ok');
        QZ.sound.correct();
        QZ.vibrate(25);
        QZ.fx.stamp(card, 'Esatto', 'ok', {
            size: 34, rot: -8, quiet: true,
            say: 'Esatto: ' + S.right.name + ' ' + deck().verb + ' ' + fmt(S.right.value) + '. Serie di ' + S.streak + '.'
        });
        paintStreak(true);
        var msg = (isGol() ? MILESTONES_GOL : isHist() ? MILESTONES_STORIA : MILESTONES)[S.streak];
        if (msg) {
            QZ.sound.levelUp();
            QZ.fx.sparks($('#g-streak'), null, 14);
            QZ.toast(msg, { icon: 'flame', type: 'ok', ms: 1600 });
        }
        var run = S;
        setTimeout(function () {
            if (S !== run || S.done) return;
            // il secondo passa a sinistra, ne arriva uno nuovo (pescato col seme della partita)
            advance(S);
            paintCard($('#c-left'), S.left, true);
            paintCard($('#c-right'), S.right, false);
            QZ.fx.replay($('#c-left'), 'is-slide');
            QZ.fx.replay($('#c-right'), 'is-in');
            ready();
        }, QZ.reducedMotion() ? 700 : 1150);
    }

    function lose(card, dir) {
        S.done = true;
        card.classList.add('is-bad');
        $('#g-arena').classList.add('is-bad');
        QZ.sound.buzzer();
        QZ.vibrate([80, 40, 80]);
        QZ.fx.shake(card);
        S.miss = { left: S.left, right: S.right, dir: dir };
        QZ.fx.stamp(card, 'Fuori', 'bad', { size: 38, rot: -8, quiet: true, say: 'Fuori. ' + missText(S.miss) + ' Serie di ' + S.streak + '.' });
        var run = S;
        setTimeout(function () {
            if (S !== run) return;
            // se nel frattempo e' aperta la conferma del cambio, prima si chiude quella
            if (S.paused) { S.pendingEnd = true; return; }
            endRun();
        }, QZ.reducedMotion() ? 1400 : 2200);
    }

    function giveUp() {
        if (!M || S.done || S.ended || starting || S.paused) return;
        var wasActive = S.active;
        S.active = false;
        S.paused = true;
        var text = M.turns
            ? 'La serie di ' + S.player.name + ' si chiude qui: ' + S.streak + ' di fila.'
            : 'Esci dal campo e a referto resta la serie: ' + S.streak + ' di fila.';
        QZ.confirm(text, { title: 'Chiedi il cambio?', okLabel: 'Esco', cancelLabel: 'Resto in campo', danger: true }).then(function (ok) {
            S.paused = false;
            if (S.ended) return;
            // l'errore e' arrivato mentre la conferma era aperta: la serie e' gia' finita
            if (S.pendingEnd) { S.pendingEnd = false; endRun(); return; }
            if (ok) { S.done = true; S.miss = null; endRun(); return; }
            if (S.pendingReady) { S.pendingReady = false; ready(); }
            else if (wasActive) { S.active = true; setButtons(true); }
        });
    }

    function endRun() {
        if (S.ended) return;
        S.ended = true;
        S.active = false;
        var p = M.players[M.idx];
        p.streak = S.streak;
        p.seen = Object.keys(S.used).length;
        p.miss = S.miss;
        p.role = S.role;
        p.tight = S.tight;
        if (!M.kind) {
            var st = stats();
            QZ.store.set(STATS_KEY, { games: st.games + 1, sum: st.sum + S.streak });
        }
        if (M.kind === 'giorno') {
            saveDaily(M.ymd, { streak: S.streak, done: true, missed: !!S.miss, seen: p.seen, miss: S.miss ? missText(S.miss) : '', tight: tightText(S.tight) || '' });
            // Leghe tra amici: la serie del giorno entra da sola in classifica
            if (QZ.leagues) QZ.leagues.submit(GAME, M.n, { streak: S.streak });
        }
        if (M.turns && M.idx < M.players.length - 1) {
            QZ.toast(p.name + ': serie di ' + S.streak, { icon: 'flag', ms: 1600 });
            M.idx++;
            showTurn();
            return;
        }
        finish();
    }

    function missText(miss) {
        if (!miss) return '';
        var more = miss.dir === 'up' ? 'meno' : 'più';
        var dk = deck();
        return miss.right.name + ' ' + dk.verb + ' ' + fmt(miss.right.value) + dk.where + ', ' + more + ' di ' + miss.left.name + ' (' + fmt(miss.left.value) + ').';
    }

    /** Il confronto indovinato con i due numeri piu' vicini: "Signori / Batistuta (188 gol / 183 gol)". */
    function tightText(t) {
        if (!t) return null;
        // i club si chiamano per intero ("Real Madrid", non "Madrid")
        var nm = deck().clubs ? function (x) { return x; } : surname;
        return nm(t.a.name) + ' / ' + nm(t.b.name) + ' (' + fmt(t.a.value) + ' / ' + fmt(t.b.value) + ')';
    }


    /* ---------- Fine partita ---------- */
    function finish() {
        QZ.wake.off();
        QZ.show('s-end');
        if (M.turns) finishTurns();
        else if (M.kind === 'giorno') finishDaily();
        else if (M.kind === 'sfida') finishChallenge();
        else finishSolo();
        paintRecord();
        paintDaily();
    }

    function soloTitle(n, gol) {
        if (n === 0) return 'Fuori al primo pallone';
        if (n < 4) return 'Panchina, per stavolta';
        if (n < 8) return gol ? 'Buona memoria' : 'Occhio da osservatore';
        if (n < 15) return gol ? 'Almanacco ambulante' : 'Da direttore sportivo';
        if (n < 25) return gol ? 'Storico del pallone' : 'Uomo mercato';
        return gol ? (M && M.deck === 'gol' ? 'L\'enciclopedia dei bomber' : 'L\'enciclopedia del calcio') : 'Il re del calciomercato';
    }

    function finishSolo() {
        var p = M.players[0];
        var n = p.streak;
        var gol = isHist();
        var recs = records();
        var prev = recs[M.recKey] || 0;
        var newRec = n > prev;
        if (newRec) { recs[M.recKey] = n; QZ.store.set(BEST_KEY, recs); }
        var r = QZ.profile.record(GAME, { xp: n * 5 + (n >= 10 ? 20 : 0), label: 'Serie di ' + n + ' (' + filterLabel(M) + ')', score: n });
        QZ.results($('#end-host'), {
            win: newRec && n > 0 || n >= 10,
            icon: n >= 10 ? 'trophy' : 'updown',
            title: soloTitle(n, gol),
            subtitle: p.miss ? 'Ti sei fermato qui: ' + missText(p.miss) : 'Uscito sulle tue gambe con una serie di ' + n + '.',
            big: n,
            bigSuffix: ' di fila',
            record: { newRecord: newRec && prev > 0, xp: r.xp },
            ratio: QZ.clamp(n / 20, 0, 1),
            stats: [
                { label: 'Serie', value: n },
                { label: 'Record', value: Math.max(prev, n) },
                { label: 'Giocatori visti', value: p.seen },
                { label: 'Si giocava', value: filterLabel(M) + (p.role ? ' (' + ROLE_PLURAL[p.role] + ')' : '') },
                { label: 'Il confronto più stretto', value: tightText(p.tight) }
            ],
            share: gol
                ? 'A Sopra o Sotto su Quizzotti ho azzeccato ' + n + ' confronti di fila ' + deck().share + ' Prova tu.'
                : 'A Sopra o Sotto su Quizzotti ho indovinato ' + n + ' valori di mercato di fila (' + filterLabel(M) + '). Chi vale di più? Prova tu.',
            onRetry: startMatch,
            secondary: { label: 'Cambia regole', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
        offerChallenge(n, false);
    }

    /* ---------- Sfida un amico ---------- */
    function rulesLabel(r) {
        return filterLabel({ deck: r.deck, league: r.league, sameRole: !!r.role }) + (r.role ? ' (' + ROLE_PLURAL[r.role] + ')' : '');
    }
    function offerChallenge(n, again) {
        if (!SF) return;
        var what = rulesLabel({ deck: M.deck, league: M.league, role: M.role });
        SF.offer($('#end-host'), {
            game: GAME, title: 'Sopra o Sotto', seed: M.seed, opt: optOf(M), score: n,
            text: function (name, url) {
                return (again ? 'Rilancio la sfida' : 'Ti sfido') + ' a Sopra o Sotto: ' + n + ' di fila (' + what + '). Stesse coppie per te, nello stesso ordine: riesci a battermi?\n' + url;
            }
        });
    }
    function playChallenge() {
        if (!CH) return;
        startSpecial('sfida', parseOpt(CH.opt), CH.seed, { ch: CH });
    }
    if (CH && SF) {
        SF.intro({
            ch: CH, target: CH.score + ' di fila',
            rules: 'Sopra o Sotto, ' + rulesLabel(parseOpt(CH.opt)) + ': le stesse coppie, nello stesso ordine. Niente record in palio, solo l\'onore.',
            onPlay: playChallenge
        });
    }

    function finishChallenge() {
        var p = M.players[0];
        var n = p.streak;
        var c = n > M.ch.score ? 1 : n === M.ch.score ? 0 : -1;
        var r = QZ.profile.record(GAME, { xp: n * 3 + (c > 0 ? 15 : 0), label: 'Sfida: serie di ' + n + ' contro ' + M.ch.score });
        QZ.results($('#end-host'), {
            win: c > 0,
            icon: c > 0 ? 'trophy' : 'updown',
            title: c > 0 ? 'Sfida vinta' : c === 0 ? 'Sfida pari' : 'Sfida persa',
            subtitle: p.miss ? 'Ti sei fermato qui: ' + missText(p.miss) : 'Uscito sulle tue gambe con una serie di ' + n + '.',
            big: n,
            bigSuffix: ' di fila',
            record: { xp: r.xp },
            extraHTML: SF ? SF.verdictHTML(M.ch, n, function (v) { return v + ' di fila'; }) : '',
            retryLabel: 'Rigioca la sfida',
            onRetry: playChallenge,
            secondary: { label: 'Partita normale', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
        offerChallenge(n, true);
    }

    /* ---------- Sopra o Sotto del giorno ---------- */
    function getDaily() {
        var x = QZ.store.get(DAILY_KEY, null);
        return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
    }
    function saveDaily(ymd, patch) {
        var x = getDaily();
        x[ymd] = Object.assign({}, x[ymd] || {}, patch);
        var keys = Object.keys(x).sort();
        while (keys.length > 400) delete x[keys.shift()];
        QZ.store.set(DAILY_KEY, x);
    }
    function dailyToday() {
        var ymd = GG.romeDate();
        return { ymd: ymd, n: GG.dayNumber(ymd) };
    }
    function dailyLink() { return window.location.origin + window.location.pathname + '?giorno'; }
    function dailyShare(ymd, d) {
        return 'Sopra o Sotto del giorno N° ' + d.n + ' (' + GG.itDate(ymd) + '): ' + (d.streak || 0) + ' di fila\n' +
            (dailyGrid(d.streak, d.missed) || '⬛') + '\nChi vale di più? Stesse coppie per tutti: ' + dailyLink();
    }
    function fmtLeft(ms) {
        var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
        return (h ? h + ' h ' : '') + m + ' min';
    }
    /** Si gioca una volta sola: se oggi c'e' gia' una partita, si rivede quella. */
    function playDaily() {
        if (!GG || starting) return;
        var t = dailyToday();
        if (!t.n) return;
        var d = getDaily()[t.ymd];
        if (d) {
            if (!d.done) closeOpen();
            showDailyEnd(t.ymd, getDaily()[t.ymd], false);
            return;
        }
        saveDaily(t.ymd, { n: t.n, streak: 0, done: false, at: Date.now() });
        startSpecial('giorno', { deck: 'mercato', league: 'ALL', role: null }, GG.seed(GAME, t.ymd), { ymd: t.ymd, n: t.n });
    }
    /** Partite del giorno lasciate a meta' (pagina chiusa, altra scheda): valgono con la serie raggiunta. */
    function closeOpen() {
        if (!GG || (M && M.kind === 'giorno' && !S.ended)) return;
        var x = getDaily(), changed = false;
        Object.keys(x).forEach(function (k) {
            var d = x[k];
            if (!d || d.done) return;
            d.done = true;
            d.missed = false;
            changed = true;
            if (QZ.leagues && d.n >= 1) QZ.leagues.submit(GAME, d.n, { streak: d.streak || 0 }, { quiet: true });
        });
        if (changed) QZ.store.set(DAILY_KEY, x);
    }
    function finishDaily() {
        var p = M.players[0];
        S.xp = QZ.profile.record(GAME, { xp: p.streak * 4 + (p.streak >= 10 ? 15 : 0), label: 'Del giorno N° ' + M.n + ' · serie di ' + p.streak }).xp;
        showDailyEnd(M.ymd, getDaily()[M.ymd] || { n: M.n, streak: p.streak, done: true }, true);
    }
    function showDailyEnd(ymd, d, fresh) {
        var n = d.streak || 0;
        var today = GG.romeDate() === ymd;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: n >= 10,
            icon: n >= 10 ? 'trophy' : 'calendar',
            title: soloTitle(n, false),
            subtitle: 'Sopra o Sotto del giorno N° ' + d.n + ': ' + (d.miss ? 'ti sei fermato qui. ' + d.miss : 'serie di ' + n + ', chiusa prima dell\'errore.') +
                (today ? ' Domani coppie nuove, uguali per tutti.' : ''),
            big: n,
            bigSuffix: ' di fila',
            record: fresh && S.xp ? { xp: S.xp } : null,
            stats: [
                { label: 'Serie del giorno', value: n },
                { label: 'Giocatori visti', value: d.seen },
                { label: 'Il confronto più stretto', value: d.tight || null }
            ],
            extraHTML: today ? '<p class="small muted mt-3" style="text-align:center">La prossima serie del giorno tra ' + fmtLeft(GG.msToNext()) + '.</p>' : '',
            share: dailyShare(ymd, d),
            retryLabel: 'Partita normale',
            onRetry: function () { QZ.show('s-start'); paintDaily(); },
            secondary: { label: 'Il Giornale di oggi', icon: 'calendar', onClick: function () { window.location.href = 'Oggi.html'; } }
        });
    }

    var dailyEl = null;
    function paintDaily() {
        if (!GG) return;
        if (!dailyEl) {
            dailyEl = document.createElement('section');
            dailyEl.className = 'card card--glow sos-daily';
            dailyEl.setAttribute('aria-labelledby', 'sos-daily-t');
            dailyEl.style.cssText = 'display:grid;gap:10px;margin-bottom:18px;padding:18px 20px;border-top:3px solid var(--led)';
            dailyEl.innerHTML = '<p class="eyebrow" id="sos-daily-eyebrow" style="margin:0"></p>' +
                '<h2 id="sos-daily-t" style="font-size:24px;margin:0"></h2>' +
                '<p class="muted" id="sos-daily-txt" style="margin:0"></p>' +
                '<div class="row" style="--gap:8px"><button type="button" class="btn btn--primary" id="sos-daily-btn"></button>' +
                '<button type="button" class="btn" id="sos-daily-share" hidden></button></div>';
            var host = $('#s-start');
            host.insertBefore(dailyEl, host.querySelector('.intro'));
            $('#sos-daily-btn').addEventListener('click', playDaily);
            $('#sos-daily-share').innerHTML = QZ.icon('share') + 'Condividi';
            $('#sos-daily-share').addEventListener('click', function () {
                var t = dailyToday(), d = getDaily()[t.ymd];
                if (d && d.done) QZ.share(dailyShare(t.ymd, d), 'Quizzotti · Sopra o Sotto del giorno');
            });
        }
        var t = dailyToday();
        var d = getDaily()[t.ymd];
        var left = fmtLeft(GG.msToNext());
        $('#sos-daily-eyebrow').innerHTML = QZ.icon('calendar') + 'Sopra o Sotto del giorno' + (t.n ? ' · ' + GG.itDate(t.ymd) : '');
        $('#sos-daily-btn').hidden = !t.n;
        if (!t.n) {
            $('#sos-daily-t').textContent = 'Dal ' + GG.itDate(GG.START) + ', una serie al giorno';
            $('#sos-daily-txt').textContent = 'Valori di mercato, le stesse coppie per tutti e una partita sola: poi confronti la serie con gli amici. Si comincia tra ' + left + '.';
            $('#sos-daily-share').hidden = true;
            return;
        }
        $('#sos-daily-t').textContent = 'N° ' + t.n + ' · stesse coppie per tutti';
        $('#sos-daily-txt').textContent = d && d.done
            ? 'Oggi: serie di ' + (d.streak || 0) + '. La prossima tra ' + left + '.'
            : 'Valori di mercato, tutto il mondo. Una partita sola, e vale quella: la serie raggiunta è il tuo risultato del giorno.';
        $('#sos-daily-btn').innerHTML = (d ? 'Rivedi la serie del giorno' : 'Gioca la serie del giorno') + QZ.icon('arrow');
        $('#sos-daily-share').hidden = !(d && d.done);
    }
    if (GG) {
        closeOpen();
        paintDaily();
        // conto alla rovescia e cambio di giorno a mezzanotte di Roma
        setInterval(paintDaily, 30000);
        window.addEventListener('storage', function (ev) { if (ev.key === DAILY_KEY || ev.key === null) paintDaily(); });
        if (GG.asked() && !CH) setTimeout(playDaily, 250);
    }

    function finishTurns() {
        var rows = M.players.slice().sort(function (a, b) { return b.streak - a.streak; });
        var top = rows[0].streak;
        var winners = rows.filter(function (p) { return p.streak === top; });
        var tie = winners.length > 1;
        var r = QZ.profile.record(GAME, { xp: top * 4 + M.players.length * 3, label: 'A turni: serie di ' + top });
        var podium = QZ.podiumHTML(rows.map(function (p) {
            return { name: p.name, score: p.streak, color: p.color, sub: p.miss ? 'Fuori su ' + p.miss.right.name : 'Uscito da solo' };
        }), function (s) { return s + ' di fila'; });
        QZ.results($('#end-host'), {
            win: top > 0,
            icon: 'trophy',
            title: top === 0 ? 'Tutti fuori al primo pallone' : tie ? 'Pareggio in vetta' : 'Vince ' + winners[0].name,
            subtitle: top === 0 ? 'Nessuno ne ha azzeccato nemmeno uno. Serata da dimenticare.'
                : tie ? winners.map(function (p) { return p.name; }).join(' e ') + ' chiudono a pari merito con ' + top + ' di fila.'
                    : 'La serie più lunga della serata: ' + top + ' di fila.',
            big: top,
            bigSuffix: ' di fila',
            record: { xp: r.xp },
            extraHTML: '<div class="mt-3">' + podium + '</div>',
            share: tie || top === 0
                ? 'Serata a Sopra o Sotto su Quizzotti: serie migliore ' + top + ' di fila (' + filterLabel(M) + '). Prova tu.'
                : winners[0].name + ' vince a Sopra o Sotto su Quizzotti con ' + top + ' confronti indovinati di fila (' + filterLabel(M) + ').',
            onRetry: startMatch,
            retryLabel: 'Rivincita',
            secondary: { label: 'Cambia regole', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
    }
})();
