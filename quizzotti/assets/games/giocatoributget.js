/* ==========================================================================
   QUIZZOTTI v2 — Sfida dei Budget
   Dati: assets/db-giocatoributget.js (`playersDatabase`, {name, role, team,
   value} con valore in milioni di euro). Lo stesso db lo leggono Sopra o
   Sotto e il Calciatore del Giorno: qui non si tocca, si legge soltanto.
   A turno ogni giocatore sceglie N calciatori dai valori nascosti cercando
   di avvicinarsi il piu' possibile al budget. Ricerca istantanea (nome,
   squadra, ruolo, senza accenti) con lista paginata, filtro per ruolo,
   mercato mondiale o solo italiano, passaggio del telefono tra i turni,
   regola "chi sfora perde", partita in solitaria con le sue statistiche,
   rivelazione dei valori uno alla volta, parita' gestite, rivincita con chi
   apre il mercato a rotazione, partita che sopravvive a un ricaricamento e
   anche alla chiusura della scheda (localStorage, scade dopo 12 ore).
   Doppioni ammessi: lo stesso calciatore puo' finire in piu' liste. I prezzi
   sono coperti, quindi nessuno ruba niente a nessuno; e chi gioca dopo non
   vede le scelte degli altri (prima le vedeva, barrate, e ne approfittava).
   Riflettori: il calciomercato come un tabellone dello stadio. I calciatori
   sono righe scure col ruolo a colori (POR, DIF, CEN, ATT), budget e posti
   da riempire stanno a LED, la rosa e' una distinta; alla resa dei conti i
   prezzi si accendono uno a uno, il totale corre e la barra della spesa
   sfida la linea del budget ("Centrato" / "Sforato"); il vincitore si
   illumina.
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- Nucleo: niente DOM (lo provano i test) ---------- */

    var BUDGET_MIN = 50, BUDGET_MAX = 1000, PICKS_MAX = 11;
    /** Quanto si puo' sbagliare restando "centrato": il 3% del budget. */
    var NEAR = 0.03;

    /** Club italiani del database (serie minori comprese), con i nomi esatti del db. */
    var ITALY = ['Juventus', 'Inter', 'Milan', 'Napoli', 'Lazio', 'Como', 'Atalanta', 'Sassuolo', 'Fiorentina', 'Torino', 'Roma', 'Bologna',
        'Udinese', 'Cagliari', 'Lecce', 'Parma', 'Genoa', 'Verona', 'Cremonese', 'Monza', 'Venezia', 'Pisa', 'Palermo', 'Frosinone',
        'Sampdoria', 'Modena', 'Padova', 'Avellino'];
    var MARKETS = { ALL: 'Tutto il mondo', ITA: 'Solo Italia' };
    var MARKET_SHORT = { ALL: 'mercato mondiale', ITA: 'mercato italiano' };
    var RULES = { near: 'Conta la distanza', bust: 'Chi sfora perde' };

    function r1(x) { return Math.round(x * 10) / 10; }
    function keyOf(p) { return p.name + '|' + p.team; }
    function isItalian(team) { return ITALY.indexOf(team) >= 0; }

    /** Indici dei calciatori in vendita nel mercato scelto. */
    function poolIds(db, market) {
        var out = [];
        for (var i = 0; i < db.length; i++) if (market !== 'ITA' || isItalian(db[i].team)) out.push(i);
        return out;
    }

    /** Impostazioni salvate ripulite: un valore rovinato non deve rompere la pagina. */
    function cleanSettings(s) {
        s = s && typeof s === 'object' ? s : {};
        var b = Number(s.budget), k = Number(s.picks);
        return {
            budget: isFinite(b) ? Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(b / 5) * 5)) : 200,
            picks: isFinite(k) ? Math.min(PICKS_MAX, Math.max(1, Math.round(k))) : 3,
            rule: RULES[s.rule] ? s.rule : 'near',
            market: MARKETS[s.market] ? s.market : 'ALL'
        };
    }

    /** "A caso": il budget segue il numero di calciatori, niente 50 milioni per undici titolari. */
    function randomSetup(rand) {
        rand = rand || Math.random;
        var picks = 1 + Math.floor(rand() * 6);
        var each = 12 + Math.floor(rand() * 59);           // da 12 a 70 milioni a testa
        var budget = Math.round((picks * each) / 5) * 5;
        return { picks: picks, budget: Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, budget)) };
    }

    /** Centrato: entro il 3% del budget; con la regola dura solo se non si e' sforato. */
    function isNear(diff, budget, rule) {
        return Math.abs(diff) <= budget * NEAR + 1e-9 && (rule !== 'bust' || diff <= 0);
    }

    /** Precisione in percentuale: 100 = budget centrato al milione. */
    function accuracy(diff, budget) { return Math.max(0, r1(100 - (Math.abs(diff) / budget) * 100)); }

    /**
     * Classifica. spent: la spesa di ogni giocatore nell'ordine di gioco.
     * A pari distanza vince chi e' rimasto sotto il budget; se anche cosi' sono
     * pari, sono pari davvero (stessa posizione, pos).
     */
    function rank(spentList, budget, rule) {
        var rows = spentList.map(function (s, i) {
            var d = r1(s - budget);
            return { i: i, spent: r1(s), diff: d, abs: Math.abs(d), bust: d > 0 };
        });
        function cmp(a, b) {
            if (rule === 'bust' && a.bust !== b.bust) return a.bust ? 1 : -1;
            return a.abs - b.abs || (a.diff > 0) - (b.diff > 0);
        }
        rows.sort(function (a, b) { return cmp(a, b) || a.i - b.i; });
        rows.forEach(function (r, k) { r.pos = k && !cmp(rows[k - 1], r) ? rows[k - 1].pos : k + 1; });
        return rows;
    }

    /** Il commento del cronista sul conto di una squadra. */
    var LINES = {
        exact: ['Al milione. Il presidente ti vuole anche come commercialista.', 'Cifra tonda tonda: il listino ce l\'hai in testa.', 'Conti perfetti. A Transfermarkt prendono appunti.'],
        near: ['Un soffio. I direttori sportivi veri li assumono così.', 'Due spiccioli di differenza: roba da mancia al magazziniere.', 'Il presidente firma senza neanche leggere.'],
        under: ['Avanza qualcosa per le bandierine del calcio d\'angolo.', 'Mercato prudente: il commercialista ringrazia.', 'Qualche milione in cassa, per l\'emergenza di gennaio.'],
        cheap: ['Spesa al discount: in cassa avanza un patrimonio.', 'Tirchio come un presidente di provincia a gennaio.', 'Con quello che avanza ci compravi mezza squadra.'],
        over: ['Sforato di poco: si sistema con una cessione a gennaio.', 'Il presidente sbuffa, ma il bonifico lo fa.', 'Un pelo sopra. Si taglia sul pullman della trasferta.'],
        out: ['Regola dura: un milione sopra vale come cento. Lista nel cestino.', 'Il presidente non tratta: sopra il budget non si firma.', 'Bastava togliere un nome. Domattina il ds è convocato in sede.'],
        broke: ['Il bilancio piange e la Covisoc bussa alla porta.', 'Hai comprato come ai videogiochi, coi crediti infiniti.', 'Il presidente ha cambiato numero di telefono.']
    };
    /** Con la regola dura chi sfora, anche di poco, non si prende i complimenti (ne' il "bonifico lo fa"). */
    function lineKind(diff, budget, rule) {
        if (diff === 0) return 'exact';
        if (isNear(diff, budget, rule)) return 'near';
        if (diff < 0) return -diff <= budget * 0.2 ? 'under' : 'cheap';
        return diff <= budget * 0.2 ? (rule === 'bust' ? 'out' : 'over') : 'broke';
    }

    /** Partita in corso salvata: vale 12 ore, poi si butta (era un mercato di ieri sera). */
    var LIVE_TTL = 12 * 3600e3;
    function liveFresh(d, now) {
        return !!d && d.v === 1 && Array.isArray(d.players) && d.players.length > 0 && typeof d.ts === 'number' && now - d.ts >= 0 && now - d.ts <= LIVE_TTL;
    }

    /** Statistiche della solitaria, aggiornate a fine partita. */
    function addSoloStats(st, acc, hit) {
        st = st && typeof st === 'object' ? st : {};
        var games = (Number(st.games) || 0) + 1;
        return { games: games, hits: (Number(st.hits) || 0) + (hit ? 1 : 0), sum: r1((Number(st.sum) || 0) + acc) };
    }

    var core = {
        BUDGET_MIN: BUDGET_MIN, BUDGET_MAX: BUDGET_MAX, PICKS_MAX: PICKS_MAX, ITALY: ITALY, LINES: LINES,
        poolIds: poolIds, cleanSettings: cleanSettings, randomSetup: randomSetup, isNear: isNear, accuracy: accuracy,
        rank: rank, lineKind: lineKind, addSoloStats: addSoloStats, keyOf: keyOf, liveFresh: liveFresh, LIVE_TTL: LIVE_TTL
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ---------- Interfaccia ---------- */

    var $ = QZ.$;
    var GAME = 'giocatoributget';
    var PAGE = 40;
    var LIVE_KEY = 'qz.budget.live';          // partita in corso (localStorage, 12 ore; prima in sessionStorage)
    var STATS_KEY = 'qz.budget.stats';        // statistiche della solitaria
    // un colore per ruolo, acceso come sul tabellone, con la scritta scura sopra
    var ROLES = {
        POR: { label: 'Portiere', c: '#ffb627', t: '#07090b' },
        DIF: { label: 'Difensore', c: '#4d8dff', t: '#07090b' },
        CEN: { label: 'Centrocampista', c: '#3ddc84', t: '#07090b' },
        ATT: { label: 'Attaccante', c: '#ff5a4a', t: '#07090b' }
    };
    var ROLE_PLURAL = { POR: 'portieri', DIF: 'difensori', CEN: 'centrocampisti', ATT: 'attaccanti' };
    var NO_ROLE = { label: '', c: '#84909a', t: '#07090b' };

    // indice di ricerca calcolato una volta sola
    var DB = playersDatabase.map(function (p, i) {
        var r = ROLES[p.role] || NO_ROLE;
        return { id: i, name: p.name, team: p.team, role: p.role, value: Number(p.value) || 0, key: QZ.norm(p.name + ' ' + p.team + ' ' + r.label + ' ' + p.role) };
    });
    var BY_KEY = {};
    DB.forEach(function (p) { BY_KEY[keyOf(p)] = p; });

    var set = cleanSettings(QZ.store.get('qz.budget.settings', {}));
    var G = null;
    var round = 0;                             // rivincite di fila: chi apre il mercato gira

    /* ---------- Helper ---------- */
    function money(v) { v = r1(v); return QZ.fmt(v, v % 1 ? 1 : 0) + ' M€'; }
    function signed(v) { v = r1(v); return (v > 0 ? '+' : v < 0 ? '−' : '±') + money(Math.abs(v)); }
    function pct(v) { return QZ.fmt(v, v % 1 ? 1 : 0) + '%'; }
    function roleVars(role) { var r = ROLES[role] || NO_ROLE; return '--rc:' + r.c + ';--rt:' + r.t; }
    function roleBadge(p) { var r = ROLES[p.role] || NO_ROLE; return '<span class="bg-role" style="' + roleVars(p.role) + '" title="' + QZ.esc(r.label || p.role) + '">' + QZ.esc(p.role) + '</span>'; }
    function cur() { return G.players[G.turn]; }
    function saveSet() { QZ.store.set('qz.budget.settings', set); }
    function nCalc(n) { return n === 1 ? '1 calciatore' : n + ' calciatori'; }
    function solo() { return G.players.length === 1; }

    /* ---------- Partita in corso: sopravvive a un ricaricamento o al tasto Indietro ---------- */
    // in localStorage: se il telefono chiude la scheda (o il browser la scarica) il mercato resta
    function session() { try { return window.localStorage; } catch { return null; } }
    function oldSession() { try { return window.sessionStorage; } catch { return null; } }
    function saveLive() {
        var s = session();
        if (!s || !G) return;
        try {
            s.setItem(LIVE_KEY, JSON.stringify({
                v: 1, ts: Date.now(), budget: G.budget, perUser: G.perUser, rule: G.rule, market: G.market, turn: G.turn, round: round,
                players: G.players.map(function (p) { return { name: p.name, color: p.color, picks: p.picks.map(keyOf) }; })
            }));
        } catch { /* memoria piena o bloccata: pazienza */ }
    }
    function clearLive() {
        [session(), oldSession()].forEach(function (s) { if (s) try { s.removeItem(LIVE_KEY); } catch { /* niente */ } });
    }
    function loadLive() {
        var s = session(), d = null;
        try { d = s && JSON.parse(s.getItem(LIVE_KEY)); } catch { d = null; }
        // mercato lasciato a meta' con la versione di prima (sessionStorage): si recupera da li'
        if (!d) {
            var o = oldSession();
            try { d = o && JSON.parse(o.getItem(LIVE_KEY)); } catch { d = null; }
        }
        if (!liveFresh(d, Date.now())) {
            if (d) clearLive();   // scaduto o rovinato: non resta a occupare spazio
            return null;
        }
        var ok = true;
        var players = d.players.map(function (p, i) {
            var picks = (p.picks || []).map(function (k) { var x = BY_KEY[k]; if (!x) ok = false; return x; });
            // il colore finisce in un attributo style: dalla memoria si accetta solo un esadecimale
            var color = /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length];
            return { name: String(p.name || 'Giocatore'), color: color, picks: picks };
        });
        var c = cleanSettings({ budget: d.budget, picks: d.perUser, rule: d.rule, market: d.market });
        var turn = Math.max(0, Math.min(players.length, Number(d.turn) || 0));
        if (!ok || players.some(function (p, i) { return p.picks.length > c.picks || (i < turn && p.picks.length !== c.picks); })) return null;
        return { players: players, budget: c.budget, perUser: c.picks, rule: c.rule, market: c.market, turn: turn, round: Number(d.round) || 0 };
    }

    /* ---------- Markup statico + setup ---------- */
    $('#start-btn').innerHTML = 'Apri il mercato' + QZ.icon('arrow');
    $('#start-btn-2').innerHTML = 'Si parte' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('coins');
    $('#randomize').innerHTML = QZ.icon('dice') + 'A caso';
    $('#rules').innerHTML = [
        ['Cartellini coperti.', 'Scegli i calciatori senza vedere quanto costano. Vale l\'occhio, non il listino.'],
        ['Un turno a testa.', 'Fai la tua lista e passa il telefono. Le liste degli altri restano coperte, e lo stesso calciatore lo possono prendere in tanti.'],
        ['Vince chi ci va più vicino', 'al budget, sopra o sotto. A pari distanza passa chi è rimasto sotto; con la regola dura chi sfora finisce in fondo.'],
        ['La resa dei conti:', 'i prezzi si accendono uno a uno sul tabellone, poi si tirano le somme.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('.bg-search').insertAdjacentHTML('afterbegin', QZ.icon('search'));
    $('#p-clear').innerHTML = QZ.icon('x');
    $('#p-exit').innerHTML = QZ.icon('x');
    $('#r-skip').innerHTML = QZ.icon('skip') + 'Vai al sodo';
    $('#r-next').innerHTML = QZ.icon('trophy') + 'La classifica';
    ['budget', 'picks'].forEach(function (k) {
        $('#' + k + '-minus').innerHTML = QZ.icon('minus');
        $('#' + k + '-plus').innerHTML = QZ.icon('plus');
    });

    // initial: 2 solo alla prima visita; altrimenti playerList riempirebbe fino a 2
    // anche chi aveva salvato una partita in solitaria
    var savedNames = QZ.store.get('qz.names.budget', null);
    var plist = QZ.playerList($('#set-players'), { key: 'budget', min: 1, max: 6, initial: Array.isArray(savedNames) && savedNames.length ? 1 : 2, label: 'Giocatore', title: 'Chi gioca (1-6)' });

    var PRESETS = [100, 200, 300, 500, 1000];
    $('#budget-presets').innerHTML = PRESETS.map(function (v) { return '<button type="button" data-v="' + v + '">' + QZ.fmt(v) + ' M€</button>'; }).join('');
    $('#budget-presets').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        setBudget(Number(b.dataset.v));
        QZ.sound.click();
    });
    $('#budget-minus').addEventListener('click', function () { setBudget(set.budget - (set.budget > 300 ? 50 : 10)); QZ.sound.click(); });
    $('#budget-plus').addEventListener('click', function () { setBudget(set.budget + (set.budget >= 300 ? 50 : 10)); QZ.sound.click(); });
    $('#picks-minus').addEventListener('click', function () { setPicks(set.picks - 1); QZ.sound.click(); });
    $('#picks-plus').addEventListener('click', function () { setPicks(set.picks + 1); QZ.sound.click(); });

    function setBudget(v) {
        set.budget = QZ.clamp(Math.round(v / 5) * 5, BUDGET_MIN, BUDGET_MAX);
        $('#budget-out').innerHTML = QZ.fmt(set.budget) + '<small> M€</small>';
        $('#budget-minus').disabled = set.budget <= BUDGET_MIN;
        $('#budget-plus').disabled = set.budget >= BUDGET_MAX;
        QZ.$$('#budget-presets button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.v) === set.budget)); });
        paintAvg();
        saveSet();
    }
    function setPicks(v) {
        set.picks = QZ.clamp(v, 1, PICKS_MAX);
        $('#picks-out').textContent = set.picks;
        $('#picks-minus').disabled = set.picks <= 1;
        $('#picks-plus').disabled = set.picks >= PICKS_MAX;
        paintAvg();
        saveSet();
    }
    /** Il conto della serva: quanto si puo' spendere in media a calciatore. */
    function paintAvg() {
        $('#avg-help').textContent = 'In media ' + money(set.budget / set.picks) + ' a calciatore.';
    }
    var RULE_HELP = {
        near: 'Conta solo la distanza dal budget, sopra o sotto. A pari distanza vince chi è rimasto sotto.',
        bust: 'Chi supera il budget finisce in fondo alla classifica. Come al mercato vero.'
    };
    QZ.segmented($('#set-rule'), [{ label: RULES.near, value: 'near' }, { label: RULES.bust, value: 'bust' }], set.rule, function (v) {
        set.rule = v;
        $('#rule-help').textContent = RULE_HELP[v];
        saveSet();
    });
    $('#rule-help').textContent = RULE_HELP[set.rule];

    var POOL_N = { ALL: poolIds(DB, 'ALL').length, ITA: poolIds(DB, 'ITA').length };
    var MARKET_HELP = {
        ALL: QZ.fmt(POOL_N.ALL) + ' calciatori da tutti i campionati: dai fenomeni del Real ai vecchi leoni in Arabia.',
        ITA: QZ.fmt(POOL_N.ITA) + ' calciatori dei club italiani, Serie B compresa. Qui i prezzi li devi sapere.'
    };
    QZ.segmented($('#set-market'), [{ label: MARKETS.ALL, value: 'ALL' }, { label: MARKETS.ITA, value: 'ITA' }], set.market, function (v) {
        set.market = v;
        $('#market-help').textContent = MARKET_HELP[v];
        saveSet();
    });
    $('#market-help').textContent = MARKET_HELP[set.market];
    setBudget(set.budget);
    setPicks(set.picks);

    $('#randomize').addEventListener('click', function () {
        var r = randomSetup();
        setBudget(r.budget);
        setPicks(r.picks);
        QZ.fx.pop($('#budget-out'));
        QZ.fx.pop($('#picks-out'));
        QZ.sound.pop();
        QZ.say('Budget ' + money(set.budget) + ', ' + nCalc(set.picks) + ' a testa.');
    });

    function paintStartRecord() {
        var rec = QZ.profile.best(GAME);
        var st = QZ.store.get(STATS_KEY, null);
        var bits = [];
        if (typeof rec === 'number' && isFinite(rec)) bits.push('Miglior precisione: ' + pct(r1(rec)));
        if (st && st.games) {
            bits.push(st.games + (st.games === 1 ? ' mercato' : ' mercati') + ' in solitaria, media ' + pct(r1(st.sum / st.games)));
            if (st.hits) bits.push(st.hits === 1 ? '1 centrato' : st.hits + ' centrati');
        }
        $('#start-record').textContent = bits.join(' · ');
    }
    paintStartRecord();

    $('#start-btn').addEventListener('click', function () { round = 0; start(); });
    $('#start-btn-2').addEventListener('click', function () { round = 0; start(); });

    /* ---------- Riprendi il mercato lasciato a meta' ---------- */
    function paintResume() {
        var box = $('#resume');
        var d = loadLive();
        if (!d) { box.hidden = true; return; }
        var n = d.players.length;
        var where = d.turn >= n ? 'manca solo la resa dei conti' : n > 1 ? 'tocca a ' + d.players[d.turn].name + ' (turno ' + (d.turn + 1) + ' di ' + n + ')' : 'la tua lista è a ' + d.players[0].picks.length + ' su ' + d.perUser;
        $('#resume-txt').textContent = 'Budget ' + money(d.budget) + ', ' + nCalc(d.perUser) + ' a testa: ' + where + '.';
        box.hidden = false;
        // dopo una ricarica il browser rimetteva lo scroll di prima (o lo spostava per far
        // posto al riquadro) e "C'e' un mercato aperto" finiva fuori dallo schermo
        try { window.history.scrollRestoration = 'manual'; } catch { /* niente */ }
        var top = function () { if (!box.hidden) window.scrollTo(0, 0); };
        top();
        requestAnimationFrame(top);
        window.addEventListener('load', top, { once: true });
    }
    $('#resume-go').innerHTML = 'Riprendi' + QZ.icon('arrow');
    $('#resume-go').addEventListener('click', function () {
        var d = loadLive();
        $('#resume').hidden = true;
        if (!d) return;
        round = d.round;
        G = newGame(d.players, d);
        G.turn = d.turn;
        QZ.wake.on();
        QZ.sound.start();
        if (G.turn >= G.players.length) reveal();
        else if (!solo()) handoff();
        else beginTurn();
    });
    $('#resume-drop').addEventListener('click', function () {
        clearLive();
        $('#resume').hidden = true;
        QZ.sound.click();
        $('#start-btn').focus();
    });
    paintResume();

    /* ---------- Partita ---------- */
    function newGame(players, o) {
        return {
            players: players, budget: o.budget, perUser: o.perUser, rule: o.rule, market: o.market,
            turn: 0, order: QZ.shuffle(poolIds(DB, o.market)).map(function (i) { return DB[i]; }),
            q: '', role: 'ALL', shown: PAGE, token: 0, stage: 'start'
        };
    }

    function start() {
        var names = plist.get();
        // due "Marco" nella stessa partita: il secondo diventa "Marco 2"
        var seen = {};
        names.forEach(function (n) { seen[n.toLowerCase()] = 0; });
        names = names.map(function (n) {
            var k = n.toLowerCase();
            if (!seen[k]) { seen[k] = 1; return n; }
            var j = seen[k], out;
            do { out = n + ' ' + (++j); } while (seen[out.toLowerCase()] != null);
            seen[k] = j;
            seen[out.toLowerCase()] = 1;
            return out;
        });
        var players = names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], picks: [] }; });
        // alla rivincita apre il mercato il secondo, poi il terzo...: si passa il telefono in un ordine nuovo
        var shift = players.length > 1 ? round % players.length : 0;
        players = players.slice(shift).concat(players.slice(0, shift));
        G = newGame(players, { budget: set.budget, perUser: set.picks, rule: set.rule, market: set.market });
        $('#resume').hidden = true;
        saveLive();
        QZ.wake.on();
        QZ.sound.start();
        if (!solo()) handoff();
        else beginTurn();
    }

    function handoff() {
        G.stage = 'hand';
        var p = cur();
        var initial = (p.name.trim().charAt(0) || '?').toUpperCase();
        var hand = $('#hand');
        hand.style.setProperty('--c', p.color);
        var left = G.players.length - G.turn - 1;
        hand.innerHTML =
            '<span class="eyebrow">Turno ' + (G.turn + 1) + ' di ' + G.players.length + '</span>' +
            '<div class="bg-shirt" aria-hidden="true"><span class="bg-shirt__n">' + (G.turn ? 'Tocca a' : 'Apre il mercato') + '</span>' +
            '<span class="bg-shirt__dot" style="color:' + QZ.onColor(p.color) + '">' + QZ.esc(initial) + '</span><span class="bg-shirt__name">' + QZ.esc(p.name) + '</span></div>' +
            '<h2>Passa il telefono a <em>' + QZ.esc(p.name) + '</em></h2>' +
            '<p>Gli altri guardano altrove. Scegli ' + nCalc(G.perUser) + ' con <b>' + money(G.budget) + '</b> in cassa.' +
            (G.turn > 0 ? ' Le liste degli altri non le vedi: puoi prendere anche i loro stessi calciatori.' : '') +
            (left ? '' : ' Sei l\'ultimo: poi si scoprono i cartellini.') + '</p>' +
            '<button class="btn btn--primary btn--xl" type="button" data-autofocus id="hand-go">Tocca a me' + QZ.icon('arrow') + '</button>' +
            '<button class="btn btn--ghost btn--sm" type="button" id="hand-exit">' + QZ.icon('x') + 'Abbandona il mercato</button>';
        $('#hand-go').addEventListener('click', beginTurn);
        $('#hand-exit').addEventListener('click', askExit);
        QZ.show('s-hand');
        QZ.say('Turno ' + (G.turn + 1) + ' di ' + G.players.length + ': passa il telefono a ' + p.name + '.');
        QZ.sound.whoosh();
    }

    var ROLE_OPTS = [{ label: 'Tutti', value: 'ALL' }, { label: 'POR', value: 'POR' }, { label: 'DIF', value: 'DIF' }, { label: 'CEN', value: 'CEN' }, { label: 'ATT', value: 'ATT' }];

    function beginTurn() {
        // doppio tocco su "Tocca a me": il secondo non riparte da capo
        // (non si guarda la schermata attiva: durante la transizione e' ancora quella vecchia)
        if (!G || G.stage === 'pick') return;
        G.stage = 'pick';
        G.closing = false;
        G.q = '';
        G.role = 'ALL';
        G.shown = PAGE;
        $('#p-search').value = '';
        $('#p-clear').hidden = true;
        QZ.segmented($('#p-roles'), ROLE_OPTS, 'ALL', function (v) {
            G.role = v;
            G.shown = PAGE;
            renderList();
        });
        // il filtro acceso prende il colore del ruolo
        QZ.$$('#p-roles button').forEach(function (b, i) { if (i) b.setAttribute('style', roleVars(ROLE_OPTS[i].value)); });
        var p = cur();
        var dot = $('#p-dot');
        dot.style.background = p.color;
        dot.style.color = QZ.onColor(p.color);
        dot.textContent = G.turn + 1;
        $('#p-name').textContent = p.name;
        $('#p-label').textContent = G.players.length > 1 ? 'Turno ' + (G.turn + 1) + ' di ' + G.players.length : 'Sta comprando';
        $('#p-budget').textContent = money(G.budget);
        $('#p-avg').textContent = 'In media ' + money(G.budget / G.perUser) + ' a calciatore · ' + MARKET_SHORT[G.market] + ' · ' + RULES[G.rule].toLowerCase();
        renderSquad();
        renderList();
        QZ.show('s-pick');
        // "Tocca a me" sparisce con la schermata: il fuoco va alla ricerca (tastiera)
        // o al nome di chi compra (touch, senza aprire la tastiera del telefono)
        var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        setTimeout(function () { if (G && G.stage === 'pick') $(fine ? '#p-search' : '#p-name').focus({ preventScroll: true }); }, 260);
    }

    /** Calciatori filtrati per ruolo e ricerca (le scelte degli altri non contano: doppioni ammessi). */
    function filtered() {
        var terms = QZ.norm(G.q).split(' ').filter(Boolean);
        var role = G.role;
        var list = [];
        for (var i = 0; i < G.order.length; i++) {
            var p = G.order[i];
            if (role !== 'ALL' && p.role !== role) continue;
            var ok = true;
            for (var t = 0; t < terms.length; t++) if (p.key.indexOf(terms[t]) < 0) { ok = false; break; }
            if (ok) list.push(p);
        }
        return { list: list };
    }

    var renderQueued = false;
    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(function () { renderQueued = false; if (G && G.stage === 'pick') renderList(); });
    }

    function renderList() {
        var me = cur();
        var full = me.picks.length >= G.perUser;
        var f = filtered();
        var list = f.list.slice(0, G.shown);
        $('#p-list').innerHTML = list.length ? list.map(function (p) {
            var mine = me.picks.indexOf(p) >= 0;
            var disabled = full && !mine;
            return '<button type="button" class="bg-player" data-id="' + p.id + '" aria-pressed="' + mine + '"' + (disabled ? ' disabled' : '') + '>' +
                roleBadge(p) +
                '<span class="bg-player__info"><span class="bg-player__name">' + QZ.esc(p.name) + '</span>' +
                '<span class="bg-player__team">' + QZ.esc(p.team) + '</span></span>' +
                '<span class="bg-player__state"><span>' + QZ.icon(mine ? 'check' : 'plus') + '</span></span></button>';
        }).join('') : '<p class="bg-empty">' + (G.q ? 'Nessuno con questo nome' + (G.role !== 'ALL' ? ' tra i ' + ROLE_PLURAL[G.role] : '') + '. Prova col cognome o con la squadra.' : 'Nessun calciatore qui.') + '</p>';
        var n = f.list.length;
        var countTxt = (G.q || G.role !== 'ALL' ? QZ.fmt(n) + (n === 1 ? ' trovato' : ' trovati') : QZ.fmt(n) + ' calciatori');
        // e' una regione live: si riscrive solo quando il conteggio cambia davvero
        if ($('#p-count').textContent !== countTxt) $('#p-count').textContent = countTxt;
        var more = $('#p-more');
        more.hidden = n <= G.shown;
        more.textContent = 'Altri ' + Math.min(PAGE, n - G.shown) + ' (ne restano ' + QZ.fmt(n - G.shown) + ')';
    }

    function renderSquad(added) {
        var me = cur();
        var slots = '';
        for (var i = 0; i < G.perUser; i++) {
            var p = me.picks[i];
            slots += p
                ? '<li class="bg-slot is-full' + (p === added ? ' is-new' : '') + '"><span class="bg-slot__n">' + (i + 1) + '</span>' + roleBadge(p) +
                  '<span class="bg-slot__name">' + QZ.esc(p.name) + '<small>' + QZ.esc(p.team) + '</small></span><span class="bg-slot__price" aria-hidden="true">? M€</span>' +
                  '<button class="qz-iconbtn" type="button" data-remove="' + p.id + '" aria-label="Togli ' + QZ.esc(p.name) + '">' + QZ.icon('x') + '</button></li>'
                : '<li class="bg-slot is-empty"><span class="bg-slot__n">' + (i + 1) + '</span><span class="bg-slot__name">da scegliere</span></li>';
        }
        $('#p-slots').innerHTML = slots;
        var left = G.perUser - me.picks.length;
        var lf = $('#p-left');
        lf.innerHTML = left + '<small>/' + G.perUser + '</small>';
        lf.classList.toggle('is-full', left === 0);
        var btn = $('#p-confirm');
        btn.disabled = left > 0;
        btn.innerHTML = left > 0
            ? (left === 1 ? 'Ne manca 1' : 'Ne mancano ' + left)
            : QZ.icon('check') + (G.turn < G.players.length - 1 ? 'Chiudo la lista e passo' : 'Chiudo il mercato');
    }

    function toggle(id) {
        if (!G || G.stage !== 'pick' || G.closing) return;
        var me = cur();
        var p = DB[id];
        var i = me.picks.indexOf(p);
        var added = null;
        // la lista e la rosa si ridisegnano: ci si segna dov'era il fuoco per rimettercelo
        var act = document.activeElement;
        var fromList = act && act.closest && act.closest('#p-list');
        var fromSlots = act && act.closest && act.closest('#p-slots');
        if (i >= 0) {
            me.picks.splice(i, 1);
            QZ.sound.click();
        } else {
            if (me.picks.length >= G.perUser) { QZ.toast('Rosa piena. Per cambiare, prima ne togli uno.', { icon: 'info' }); return; }
            me.picks.push(p);
            added = p;
            QZ.sound.pop();
            QZ.vibrate(15);
            if (me.picks.length === G.perUser) {
                QZ.sound.coin();
                QZ.fx.pop($('#p-confirm'));
            }
        }
        saveLive();
        renderSquad(added);
        renderList();
        var left = G.perUser - me.picks.length;
        QZ.say((added ? 'Preso ' : 'Tolto ') + p.name + '. ' + (left ? (left === 1 ? 'Ne manca 1.' : 'Ne mancano ' + left + '.') : 'Rosa completa.'));
        if (fromList) {
            var again = $('#p-list [data-id="' + id + '"]');
            (again && !again.disabled ? again : $('#p-search')).focus({ preventScroll: true });
        } else if (fromSlots) {
            ($('#p-slots [data-remove]') || $('#p-search')).focus({ preventScroll: true });
        }
    }

    function setQuery(v) {
        G.q = v;
        G.shown = PAGE;
        $('#p-clear').hidden = !v;
        queueRender();
    }

    $('#p-list').addEventListener('click', function (e) {
        var b = e.target.closest('.bg-player');
        if (b && !b.disabled) toggle(Number(b.dataset.id));
    });
    $('#p-slots').addEventListener('click', function (e) {
        var b = e.target.closest('[data-remove]');
        if (b) toggle(Number(b.dataset.remove));
    });
    $('#p-search').addEventListener('input', function (e) { if (G) setQuery(e.target.value); });
    $('#p-clear').addEventListener('click', function () {
        $('#p-search').value = '';
        setQuery('');
        $('#p-search').focus();
    });
    $('#p-search').addEventListener('keydown', function (e) {
        if (!G) return;
        if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.target.value = ''; setQuery(''); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        // la lista potrebbe essere ancora quella di prima della battitura: si ridisegna adesso
        if (renderQueued) { renderQueued = false; renderList(); }
        var first = QZ.$$('#p-list .bg-player').filter(function (b) { return !b.disabled && b.getAttribute('aria-pressed') === 'false'; })[0];
        if (first) {
            toggle(Number(first.dataset.id));
            e.target.select();
        }
    });
    $('#p-more').addEventListener('click', function () {
        var from = G.shown;
        G.shown += PAGE;
        renderList();
        // il fuoco va sul primo dei nuovi, non resta su un bottone che puo' sparire
        var first = QZ.$$('#p-list .bg-player')[from];
        if (first) first.focus({ preventScroll: true });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== '/' || !G || G.stage !== 'pick' || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        $('#p-search').focus();
    });

    $('#p-confirm').addEventListener('click', function () {
        if (!G || G.closing || G.stage !== 'pick') return;   // doppio tocco: non si salta il turno di nessuno
        var me = cur();
        if (me.picks.length !== G.perUser) return;
        G.closing = true;
        QZ.sound.whistle();
        G.turn++;
        saveLive();
        if (G.turn < G.players.length) handoff();
        else reveal();
    });

    function askExit() {
        var stage = G && G.stage;
        QZ.confirm('Le liste fatte finora finiscono nel cestino.', { title: 'Abbandoni il mercato?', okLabel: 'Esco', cancelLabel: 'Resto', danger: true }).then(function (ok) {
            if (!ok || !G || G.stage !== stage) return;
            QZ.wake.off();
            clearLive();
            G = null;
            QZ.show('s-start');
        });
    }
    $('#p-exit').addEventListener('click', askExit);

    /* ---------- Classifica ---------- */
    function spent(p) { return r1(p.picks.reduce(function (s, x) { return s + x.value; }, 0)); }

    function ranking() {
        return rank(G.players.map(spent), G.budget, G.rule).map(function (r) { r.p = G.players[r.i]; return r; });
    }
    function winners(rows) { return rows.filter(function (r) { return r.pos === 1; }); }
    function namesList(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]; }

    function verdict(d) {
        if (d === 0) return 'Budget centrato al milione';
        if (d < 0) return 'Avanzano ' + money(-d);
        // sopra di un soffio con la regola classica: timbro "Centrato", non si dice "sforato"
        if (isNear(d, G.budget, G.rule)) return 'Sopra di ' + money(d) + ', ma ci sta';
        return 'Sforato di ' + money(d) + (G.rule === 'bust' ? ' · fuori dai giochi' : '');
    }

    /* ---------- La resa dei conti: i prezzi si accendono uno alla volta ---------- */
    function reveal() {
        G.stage = 'reveal';
        G.lines = [];
        var maxSpent = Math.max.apply(null, G.players.map(spent));
        G.scale = Math.max(G.budget * 1.3, maxSpent * 1.05);
        var mark = (G.budget / G.scale) * 100;
        $('#r-sub').textContent = 'Budget ' + money(G.budget) + ' · ' + MARKET_SHORT[G.market] + ' · ' + RULES[G.rule].toLowerCase();
        $('#r-cards').innerHTML = G.players.map(function (p, pi) {
            return '<div class="card bg-rcard" data-p="' + pi + '" style="--c:' + p.color + '">' +
                '<div class="bg-rhead"><span class="team__dot" style="--c:' + p.color + '"></span><span class="bg-rhead__name">' + QZ.esc(G.players.length > 1 ? p.name : 'La tua squadra') + '</span>' +
                '<span class="bg-rhead__win led led--green" hidden>VINCE</span></div>' +
                '<ul class="bg-rlist">' + p.picks.map(function (x, xi) {
                    return '<li>' + roleBadge(x) + '<span class="grow"><b>' + QZ.esc(x.name) + '</b> <span class="small muted">· ' + QZ.esc(x.team) + '</span></span>' +
                        '<span class="bg-rval" data-v="' + xi + '">? M€</span></li>';
                }).join('') + '</ul>' +
                '<div class="bg-rtot"><span>Totale</span><b data-total>0 M€</b></div>' +
                '<div class="bg-meter" aria-hidden="true"><div class="bg-meter__fill"></div><div class="bg-meter__mark" style="left:' + mark + '%"></div></div>' +
                '<div class="bg-rfoot"><div><div class="bg-verdict"></div><p class="bg-line"></p></div>' +
                '<span class="bg-rcard__stamp" aria-hidden="true"></span></div></div>';
        }).join('');
        $('#r-skip').hidden = false;
        $('#r-next').hidden = true;
        QZ.show('s-reveal');
        QZ.sound.reveal();
        var token = ++G.token;
        setTimeout(function () { runReveal(token); }, 700);
    }

    function card(pi) { return $('#r-cards [data-p="' + pi + '"]'); }

    function paintMeter(c, value) {
        var fill = c.querySelector('.bg-meter__fill');
        fill.style.width = Math.min(100, (value / G.scale) * 100) + '%';
        fill.classList.toggle('is-over', value > G.budget);
    }

    function stampPrice(v, x, quiet) {
        v.textContent = money(x.value);
        v.classList.add('is-shown');
        v.classList.toggle('is-big', x.value >= 50);
        v.classList.toggle('is-quiet', !!quiet);
    }

    /** Chiude il conto di un giocatore; quiet = senza animazioni ne' timbri sonori. */
    function paintDone(pi, quiet) {
        var p = G.players[pi], c = card(pi), s = spent(p), d = r1(s - G.budget);
        c.classList.remove('is-on');
        c.classList.add('is-done');
        p.picks.forEach(function (x, xi) {
            var v = c.querySelector('[data-v="' + xi + '"]');
            if (!v.classList.contains('is-shown')) stampPrice(v, x, quiet);
        });
        // un conteggio nuovo ferma quello in corsa (col "vai al sodo" restava a meta' somma)
        QZ.fx.count(c.querySelector('[data-total]'), s, s, 1, { decimals: s % 1 ? 1 : 0, suffix: ' M€' });
        paintMeter(c, s);
        var near = isNear(d, G.budget, G.rule);
        c.classList.toggle('is-over', d > 0);
        c.classList.toggle('is-ok', near);
        var vd = c.querySelector('.bg-verdict');
        vd.textContent = verdict(d);
        // "sopra, ma ci sta" (regola classica, entro il 3%) e' verde come il timbro "Centrato"
        vd.className = 'bg-verdict ' + (d > 0 && !near ? 'bad' : 'ok');
        var line = c.querySelector('.bg-line');
        if (!line.textContent) {
            // due conti simili non si prendono la stessa battuta
            var bank = LINES[lineKind(d, G.budget, G.rule)];
            var fresh = bank.filter(function (t) { return G.lines.indexOf(t) < 0; });
            line.textContent = QZ.pick(fresh.length ? fresh : bank);
            G.lines.push(line.textContent);
        }
        var holder = c.querySelector('.bg-rcard__stamp');
        if (!holder.firstChild && (near || d > 0)) {
            if (quiet) {
                holder.innerHTML = '<span class="qz-stamp qz-stamp--' + (near ? 'ok' : 'bad') + '" style="--stamp-size:18px;animation:none">' + (near ? 'Centrato' : 'Sforato') + '</span>';
            } else {
                QZ.fx.stamp(holder, near ? 'Centrato' : 'Sforato', near ? 'ok' : 'bad', { size: 18, say: false });
            }
        }
        // il conto di ognuno si annuncia per intero (chi, quanto, com'e' andata); col "vai al sodo" basta la classifica
        // (a movimento ridotto i conti si chiudono troppo in fretta: li riassume revealDone)
        if (!quiet && !QZ.reducedMotion()) QZ.say(account(pi));
        return { d: d, near: near };
    }
    function account(pi) {
        var p = G.players[pi], s = spent(p);
        return (G.players.length > 1 ? p.name + ': ' : 'Hai ') + 'speso ' + money(s) + '. ' + verdict(r1(s - G.budget)) + '.';
    }

    async function runReveal(token) {
        var alive = function () { return G && G.token === token; };
        var fast = QZ.reducedMotion();
        for (var pi = 0; pi < G.players.length; pi++) {
            if (!alive()) return;              // "vai al sodo" premuto mentre si apriva il primo conto
            var p = G.players[pi], c = card(pi);
            c.classList.add('is-on');
            c.scrollIntoView({ behavior: fast ? 'auto' : 'smooth', block: 'center' });
            await QZ.sleep(fast ? 50 : 600);
            if (!alive()) return;
            var step = QZ.clamp(Math.round(4200 / p.picks.length), 420, 900);
            var run = 0;
            var totalEl = c.querySelector('[data-total]');
            for (var xi = 0; xi < p.picks.length; xi++) {
                var x = p.picks[xi];
                stampPrice(c.querySelector('[data-v="' + xi + '"]'), x, fast);
                QZ.sound.thud();
                if (x.value >= 50) QZ.sound.coin();
                var from = run;
                run = r1(run + x.value);
                QZ.fx.count(totalEl, from, run, step * 0.6, { decimals: run % 1 ? 1 : 0, suffix: ' M€' });
                paintMeter(c, run);
                await QZ.sleep(fast ? 30 : step);
                if (!alive()) return;
            }
            var res = paintDone(pi);
            if (res.near) QZ.sound.correct();
            else if (res.d > 0) { QZ.sound.wrong(); QZ.fx.shake(c); }
            await QZ.sleep(fast ? 50 : 1000);
            if (!alive()) return;
        }
        revealDone(QZ.reducedMotion());
    }

    function revealDone(full) {
        if (G.stage !== 'reveal') return;
        G.stage = 'revealed';
        $('#r-skip').hidden = true;
        $('#r-next').hidden = false;
        var rows = ranking(), top = winners(rows);
        // il vincitore si illumina (a pari merito tutti e due)
        if (G.players.length > 1) {
            top.forEach(function (r) {
                var wc = card(r.i);
                wc.classList.add('is-winner');
                var b = wc.querySelector('.bg-rhead__win');
                b.textContent = top.length > 1 ? 'PARI' : 'VINCE';
                b.hidden = false;
            });
            if (!full) QZ.sound.levelUp();
        }
        // full: i conti non sono stati annunciati uno a uno (salto o movimento ridotto)
        var all = full ? G.players.map(function (p, pi) { return account(pi); }).join(' ') + ' ' : '';
        var who = top.length > 1 ? 'Pari merito tra ' + namesList(top.map(function (r) { return r.p.name; })) + '.' : 'Il più vicino al budget è ' + top[0].p.name + '.';
        QZ.say('Cartellini scoperti. ' + all + (G.players.length > 1 ? who : ''));
        $('#r-next').focus({ preventScroll: true });
        QZ.fx.pop($('#r-next'));
    }

    $('#r-skip').addEventListener('click', function () {
        if (!G || G.stage !== 'reveal') return;
        G.token++;
        G.players.forEach(function (p, pi) { paintDone(pi, true); });
        revealDone(true);
    });
    $('#r-next').addEventListener('click', finish);

    /* ---------- Fine partita ---------- */
    function finish() {
        if (!G || G.stage !== 'revealed') return;   // doppio tocco su "La classifica": un referto solo
        G.stage = 'end';
        QZ.wake.off();
        clearLive();
        var rows = ranking();
        var top = winners(rows);
        var w = rows[0];
        var wAcc = accuracy(w.diff, G.budget);
        var isSolo = solo();
        var allPicks = [].concat.apply([], G.players.map(function (p) { return p.picks.map(function (x) { return { x: x, who: p.name }; }); }));
        var dear = allPicks.reduce(function (a, b) { return b.x.value > a.x.value ? b : a; }, allPicks[0]);
        var busted = w.bust && G.rule === 'bust';
        var hit = isNear(w.diff, G.budget, G.rule);

        var title, sub;
        if (isSolo) {
            title = w.diff === 0 ? 'Colpo da maestro' : busted ? 'Il presidente non firma' : wAcc >= 97 ? 'Occhio da direttore sportivo' : wAcc >= 90 ? 'Ci sei quasi' : wAcc >= 80 ? 'Buon fiuto' : wAcc >= 60 ? 'Mercato da rivedere' : 'Esonerato a gennaio';
            sub = 'Hai speso ' + money(w.spent) + ' su ' + money(G.budget) + '. ' + verdict(w.diff) + '.';
        } else if (top.length > 1) {
            title = 'Pari e patta';
            sub = namesList(top.map(function (r) { return r.p.name; })) + ' chiudono a ' + money(w.spent) + (w.diff === 0 ? ': tutti al milione.' : ', a ' + money(w.abs) + ' dalla cifra.') + (busted ? ' E avete sforato tutti.' : '') + ' Serve la rivincita.';
        } else {
            title = 'Vince ' + w.p.name;
            sub = w.p.name + ' ha speso ' + money(w.spent) + ' su ' + money(G.budget) + (w.diff === 0 ? ': centrato al milione.' : ', a ' + money(w.abs) + ' dalla cifra.');
            var second = rows[1];
            if (second.abs === w.abs && !busted) sub += ' ' + second.p.name + ' era alla stessa distanza, ma sopra il budget.';
            if (busted) sub += ' Avete sforato tutti: vince chi ha esagerato di meno.';
        }

        var podium = isSolo ? '' : '<div class="mt-3">' + QZ.podiumHTML(rows.map(function (r) {
            return { name: r.p.name, score: signed(r.diff), color: r.p.color, sub: 'Speso ' + money(r.spent) + (r.bust && G.rule === 'bust' ? ' · sforato' : '') + (r.pos === 1 && top.length > 1 ? ' · pari merito' : '') };
        })) + '</div>';
        var detail = '<div class="bg-detail">' + rows.map(function (r, i) {
            return '<details' + (i === 0 ? ' open' : '') + '><summary>' + QZ.esc(isSolo ? 'La tua squadra' : r.p.name) + ' · ' + money(r.spent) + '</summary><ul class="bg-rlist">' +
                r.p.picks.slice().sort(function (a, b) { return b.value - a.value; }).map(function (x) {
                    return '<li>' + roleBadge(x) + '<span class="grow"><b>' + QZ.esc(x.name) + '</b> <span class="small muted">· ' + QZ.esc(x.team) + '</span></span><span class="bg-rval">' + money(x.value) + '</span></li>';
                }).join('') + '</ul></details>';
        }).join('') + '</div>';

        // solitaria: il record di precisione vale solo se il presidente ha firmato
        var st = null;
        if (isSolo) {
            st = addSoloStats(QZ.store.get(STATS_KEY, null), busted ? 0 : wAcc, hit);
            QZ.store.set(STATS_KEY, st);
        }
        var statsLine = st ? '<p class="small muted center mt-2">In solitaria: ' + st.games + (st.games === 1 ? ' mercato' : ' mercati') + ', precisione media ' + pct(r1(st.sum / st.games)) + (st.hits ? ', ' + (st.hits === 1 ? '1 centrato' : st.hits + ' centrati') : '') + '.</p>' : '';

        var picksTot = G.players.length * G.perUser;
        var xp = 10 + picksTot + Math.round((busted ? 0 : wAcc) / 4) + (w.diff === 0 ? 25 : 0) + (isSolo ? 0 : G.players.length * 3);
        var recInfo = { xp: xp, label: isSolo ? (busted ? 'Sforato di ' + money(w.diff) : 'Precisione ' + pct(wAcc)) : (top.length > 1 ? 'Pari merito' : 'Vince ' + w.p.name) + ' · ' + pct(wAcc) + ' di precisione' };
        // col decimale, come la media (i record vecchi, interi, restano validi)
        if (isSolo && !busted) recInfo.score = wAcc;
        var r = QZ.profile.record(GAME, recInfo);

        var shortNames = function (p) { return p.picks.map(function (x) { return x.name; }); };
        var shareSquad = isSolo ? shortNames(G.players[0]) : [];
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: !(isSolo && (busted || wAcc < 80)),
            icon: w.diff === 0 ? 'target' : isSolo ? 'coins' : 'trophy',
            title: title,
            subtitle: sub,
            big: w.spent, bigSuffix: ' M€', bigDecimals: w.spent % 1 ? 1 : 0,
            record: r,
            // pagella: sotto il 60% di precisione e' un 4, al centesimo un 10
            ratio: busted ? 0.1 : QZ.clamp((wAcc - 60) / 40, 0, 1),
            stats: [
                { label: 'Budget', value: money(G.budget) },
                { label: isSolo ? 'Distanza' : 'Distanza vincitore', value: signed(w.diff) },
                { label: 'Precisione', value: pct(wAcc) },
                { label: dear ? 'Il più caro · ' + dear.x.name : 'Il più caro', value: dear ? money(dear.x.value) : '—' }
            ],
            extraHTML: statsLine + podium + detail,
            share: isSolo
                ? 'Sfida dei Budget su Quizzotti: con ' + money(G.budget) + ' ho preso ' + (shareSquad.length > 5 ? shareSquad.slice(0, 5).join(', ') + (shareSquad.length === 6 ? ' e un altro' : ' e altri ' + (shareSquad.length - 5)) : namesList(shareSquad)) + ' e ho speso ' + money(w.spent) + ' (' + (busted ? 'sforato' : 'precisione ' + pct(wAcc)) + '). Ci vai più vicino?'
                : (top.length > 1 ? 'Pari e patta alla Sfida dei Budget su Quizzotti tra ' + namesList(top.map(function (x) { return x.p.name; })) : w.p.name + ' ha vinto la Sfida dei Budget su Quizzotti') + ': ' + money(w.spent) + ' spesi su ' + money(G.budget) + '. Rivincita?',
            retryLabel: isSolo ? 'Rigioca' : 'Rivincita',
            onRetry: function () { round++; start(); },
            secondary: { label: 'Cambia regole', icon: 'list', onClick: function () { QZ.show('s-start'); setTimeout(function () { $('#setup').scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }, 450); } }
        });
        paintStartRecord();
    }
})();
