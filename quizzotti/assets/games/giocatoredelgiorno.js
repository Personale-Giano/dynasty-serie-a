/* ==========================================================================
   QUIZZOTTI v2 — Il Calciatore del Giorno
   Dati: assets/db-giocatoredelgiorno.js (`dailyPlayers`,
   {name, role, team, value, nation, continent, league, born}).
   Ogni giorno (data di Roma) un calciatore segreto uguale per tutti, preso da
   un ordine mescolato a seme fisso: niente ripetizioni finche' la lista non
   finisce. Il N° 1 e' il 16 novembre 2026. Sei tentativi; ogni tentativo
   accende sei caselle (nazionale, campionato, squadra, ruolo, eta', valore):
   verde uguale, ambra vicino, frecce per eta' e valore. Dopo il terzo errore
   c'e' un indizio facoltativo (l'iniziale del cognome). Statistiche, serie e
   distribuzione in localStorage; condivisione con i quadratini.
   Modalita' Allenamento: giocatore a caso, non tocca le statistiche del giorno.

   La parte "Core" qui sotto non usa il DOM: i test la caricano con require().
   ========================================================================== */
(function () {
    'use strict';

    /* =====================================================================
       CORE (puro, testabile in Node)
       ===================================================================== */
    var Core = (function () {
        var START = '2026-11-16';     // giorno del N° 1
        var SEED = 0x13C0DE26;        // seme fisso dell'ordine dei giorni
        var MAX_TRIES = 6;
        var DAY = 86400000;

        /** Data di oggi a Roma come 'AAAA-MM-GG' (Europe/Rome, ora legale compresa). */
        function romeDate(d) {
            d = d || new Date();
            var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
            var o = {};
            parts.forEach(function (p) { o[p.type] = p.value; });
            return o.year + '-' + o.month + '-' + o.day;
        }
        function utcOf(ymd) {
            var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
            return Date.UTC(+m[1], +m[2] - 1, +m[3]);
        }
        /** Giorni passati dal N° 1 (0 = 16 novembre 2026). Accetta Date o 'AAAA-MM-GG'. */
        function dayIndex(d) {
            var ymd = typeof d === 'string' ? d : romeDate(d);
            return Math.round((utcOf(ymd) - utcOf(START)) / DAY);
        }

        /** Generatore pseudo-casuale a seme (mulberry32): stesso seme, stessa sequenza ovunque. */
        function rng(seed) {
            var a = seed >>> 0;
            return function () {
                a = (a + 0x6D2B79F5) >>> 0;
                var t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        var cache = null;
        /** L'ordine dei giorni: la lista ordinata per nome e poi mescolata col seme fisso. */
        function order(list) {
            if (cache && cache.list === list) return cache.order;
            var sorted = list.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
            var r = rng(SEED);
            for (var i = sorted.length - 1; i > 0; i--) {
                var j = Math.floor(r() * (i + 1));
                var t = sorted[i]; sorted[i] = sorted[j]; sorted[j] = t;
            }
            cache = { list: list, order: sorted };
            return sorted;
        }

        /** Il calciatore del giorno: { n (numero della partita, da 1), player, date }. */
        function daily(list, d) {
            var ymd = typeof d === 'string' ? d : romeDate(d);
            var idx = Math.max(0, dayIndex(ymd)); // prima del via vale il N° 1
            var ord = order(list);
            return { n: idx + 1, player: ord[idx % ord.length], date: ymd };
        }

        /** Millisecondi alla prossima mezzanotte di Roma (gestisce i giorni da 23 e 25 ore). */
        function msToNext(now) {
            now = now || new Date();
            var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
            var o = {};
            parts.forEach(function (p) { o[p.type] = +p.value; });
            var ms = (86400 - (o.hour * 3600 + o.minute * 60 + o.second)) * 1000 - now.getMilliseconds();
            var today = romeDate(now);
            var t = now.getTime();
            if (romeDate(new Date(t + ms)) === today) ms += 3600000;               // giorno da 25 ore
            else if (romeDate(new Date(t + ms - 3600000)) !== today) ms -= 3600000; // giorno da 23 ore
            return Math.max(0, ms);
        }

        var ROLE = { POR: 'Portiere', DIF: 'Difensore', CEN: 'Centrocampista', ATT: 'Attaccante' };
        function age(p, year) { return year - p.born; }
        function fmtValue(v) {
            var s = String(Math.round(v * 10) / 10).replace('.', ',');
            return '€ ' + s + ' mln';
        }

        /**
         * Confronto tra un tentativo e il segreto: sei caselle
         * { key, label, text, state: 'hit'|'near'|'miss', arrow: 'up'|'down'|null }.
         * La freccia dice dove sta il segreto: 'up' = piu' vecchio / vale di piu'.
         */
        function compare(g, s, year) {
            var ga = age(g, year), sa = age(s, year);
            var cells = [];
            cells.push({ key: 'nation', label: 'Nazionale', text: g.nation,
                state: g.nation === s.nation ? 'hit' : g.continent === s.continent ? 'near' : 'miss', arrow: null });
            cells.push({ key: 'league', label: 'Campionato', text: g.league, state: g.league === s.league ? 'hit' : 'miss', arrow: null });
            cells.push({ key: 'team', label: 'Squadra', text: g.team, state: g.team === s.team ? 'hit' : 'miss', arrow: null });
            cells.push({ key: 'role', label: 'Ruolo', text: ROLE[g.role] || g.role, state: g.role === s.role ? 'hit' : 'miss', arrow: null });
            cells.push({ key: 'age', label: 'Età', text: ga + ' anni',
                state: ga === sa ? 'hit' : Math.abs(ga - sa) <= 2 ? 'near' : 'miss',
                arrow: ga === sa ? null : sa > ga ? 'up' : 'down' });
            cells.push({ key: 'value', label: 'Valore', text: fmtValue(g.value),
                state: g.value === s.value ? 'hit' : Math.abs(g.value - s.value) <= s.value * 0.25 ? 'near' : 'miss',
                arrow: g.value === s.value ? null : s.value > g.value ? 'up' : 'down' });
            return cells;
        }

        // nomi in cui il cognome non e' "tutto tranne il primo nome"
        var SURNAME = {
            'Kim Min-jae': 'Kim', 'Lee Kang-in': 'Lee', 'Hwang In-beom': 'Hwang',
            'Francesco Pio Esposito': 'Esposito', 'Hákon Arnar Haraldsson': 'Haraldsson',
            'Pape Matar Sarr': 'Sarr', 'Jan Paul van Hecke': 'van Hecke', 'El Bilal Touré': 'Touré',
            'André-Frank Zambo Anguissa': 'Zambo Anguissa', 'Vinícius Jr.': 'Vinícius'
        };
        /** Cognome per l'indizio; null se si fa chiamare con un nome solo (Pedri, Rodri, Gavi…). */
        function surname(name) {
            if (SURNAME[name]) return SURNAME[name];
            var w = name.split(' ');
            return w.length > 1 ? w.slice(1).join(' ') : null;
        }
        function hint(p) {
            var sur = surname(p.name);
            var src = sur || p.name;
            return { mono: !sur || p.name === 'Vinícius Jr.', letter: src.charAt(0).toUpperCase() };
        }

        function norm(s) {
            return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ı/g, 'i').replace(/đ/g, 'd').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
                .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        }
        /** Ricerca per l'autocompletamento: inizio del nome, di una parola (cognome) o dentro il nome. */
        function search(list, query, exclude, limit) {
            var q = norm(query);
            if (!q) return [];
            var out = [];
            list.forEach(function (p) {
                if (exclude && exclude[p.name]) return;
                var n = norm(p.name);
                var sur = surname(p.name);
                // inizio del nome e inizio del cognome valgono uguale: poi decide la fama (il valore)
                var score = (n.indexOf(q) === 0 || (sur && norm(sur).indexOf(q) === 0)) ? 0
                    : n.split(' ').some(function (w) { return w.indexOf(q) === 0; }) ? 1
                        : n.replace(/ /g, '').indexOf(q.replace(/ /g, '')) >= 0 ? 2 : -1;
                if (score >= 0) out.push({ p: p, s: score });
            });
            out.sort(function (a, b) { return a.s - b.s || b.p.value - a.p.value || (a.p.name < b.p.name ? -1 : 1); });
            return out.slice(0, limit || 8).map(function (x) { return x.p; });
        }

        function emoji(state) { return state === 'hit' ? '🟩' : state === 'near' ? '🟨' : '⬛'; }

        /** Testo da condividere: intestazione, quadratini, niente nomi (niente spoiler). */
        function shareText(n, rows, win, usedHint) {
            var head = 'Calciatore del Giorno N° ' + n + ' — ' + (win ? rows.length : 'X') + '/' + MAX_TRIES + (usedHint ? ' (con indizio)' : '');
            return head + '\n\n' + rows.map(function (r) { return r.map(emoji).join(''); }).join('\n');
        }

        return {
            START: START, SEED: SEED, MAX_TRIES: MAX_TRIES, ROLE: ROLE,
            romeDate: romeDate, dayIndex: dayIndex, order: order, daily: daily, msToNext: msToNext,
            age: age, fmtValue: fmtValue, compare: compare, surname: surname, hint: hint,
            norm: norm, search: search, shareText: shareText, emoji: emoji
        };
    })();

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    if (typeof document === 'undefined' || typeof QZ === 'undefined' || typeof dailyPlayers === 'undefined') return;

    /* =====================================================================
       INTERFACCIA
       ===================================================================== */
    var $ = QZ.$;
    var GAME = 'giocatoredelgiorno';
    var PLAYERS = dailyPlayers;
    var BY_NAME = {};
    PLAYERS.forEach(function (p) { BY_NAME[p.name] = p; });
    var KEY_DAY = 'qz.gdg.today';
    var KEY_STATS = 'qz.gdg.stats';
    var trainDeck = new QZ.Deck(GAME + '.allenamento', PLAYERS, function (p) { return p.name; });

    var S = { active: false };
    var sugg = [];      // suggerimenti mostrati
    var active = -1;    // suggerimento evidenziato
    var finishing = false;

    function year() { return Number(Core.romeDate().slice(0, 4)); }
    function today() { return Core.daily(PLAYERS); }
    function fmtClock(ms) {
        var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        s = s % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function emptyStats() { return { played: 0, wins: 0, cur: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], lastN: 0, lastWinN: 0 }; }
    function getStats() {
        var st = Object.assign(emptyStats(), QZ.store.get(KEY_STATS, {}) || {});
        if (!Array.isArray(st.dist) || st.dist.length !== 6) st.dist = [0, 0, 0, 0, 0, 0];
        // serie interrotta se si e' saltato un giorno (o perso l'ultimo giocato)
        var t = today();
        if (st.cur && st.lastWinN < t.n - 1) { st.cur = 0; QZ.store.set(KEY_STATS, st); }
        return st;
    }
    function getDay() {
        var d = QZ.store.get(KEY_DAY, null);
        var t = today();
        if (!d || d.n !== t.n || !Array.isArray(d.guesses)) return { n: t.n, guesses: [], hint: false, done: false, win: false };
        // i nomi spariti dal database (aggiornamenti) non devono rompere la partita
        d.guesses = d.guesses.filter(function (g) { return BY_NAME[g]; });
        return d;
    }
    function saveDay() {
        if (S.mode !== 'daily') return;
        QZ.store.set(KEY_DAY, { n: S.n, guesses: S.guesses.map(function (p) { return p.name; }), hint: S.hint, done: S.done, win: S.win });
    }

    /* ---------- Markup statico ---------- */
    $('#medal').innerHTML = QZ.icon('calendar');
    $('#train-btn').innerHTML = QZ.icon('refresh') + 'Allenamento';
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Mi arrendo';
    $('#rules').innerHTML = [
        ['Scrivi un nome.', 'Anche solo il cognome, senza accenti: i suggerimenti fanno il resto.'],
        ['Guarda le caselle.', 'Verde è uguale. Ambra è vicino: stesso continente, età a due anni, valore entro il 25%.'],
        ['Segui le frecce.', 'Su età e valore ti dicono se il segreto sta sopra o sotto.'],
        ['Sei tentativi.', 'Dopo il terzo errore puoi chiedere l\'iniziale del cognome. Domani se ne gioca un altro.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    $('#start-btn').addEventListener('click', function () {
        var d = getDay();
        if (d.done) showDailyEnd(d, false);
        else startDaily();
    });
    $('#train-btn').addEventListener('click', startTraining);
    $('#g-quit').addEventListener('click', giveUp);

    /* ---------- Copertina ---------- */
    function paintStart() {
        var d = getDay();
        var t = today();
        $('#start-btn').innerHTML = d.done ? 'Com\'è andata oggi' + QZ.icon('chart')
            : d.guesses.length ? 'Riprendi la partita' + QZ.icon('arrow') : 'Fischio d\'inizio' + QZ.icon('arrow');
        $('#start-info').textContent = 'Oggi si gioca il N° ' + t.n + (d.done ? '. Il tuo l\'hai già giocato: torna domani.' : d.guesses.length ? ' · ' + d.guesses.length + ' tentativi già spesi.' : '.');

        var box = $('#today');
        if (d.done) {
            var secret = t.player;
            var rows = d.guesses.map(function (g) { return Core.compare(BY_NAME[g], secret, year()).map(function (c) { return c.state; }); });
            box.innerHTML =
                '<div class="gd-today__head"><h2 class="gd-today__title display">N° ' + t.n + ' · ' + (d.win ? 'preso in ' + d.guesses.length + '/6' : 'non preso') + (d.hint ? ' · con indizio' : '') + '</h2>' +
                '<span class="small muted">Il prossimo tra <b class="led" data-countdown>--:--:--</b></span></div>' +
                '<div class="gd-today__body">' + miniHTML(rows) + cardHTML(secret, d.win ? 'Era lui' : 'Ti è sfuggito') + '</div>';
            box.hidden = false;
        } else {
            box.hidden = true;
            box.innerHTML = '';
        }
        var st = getStats();
        var sb = $('#start-stats');
        if (st.played) { sb.innerHTML = statsHTML(st, d.done && d.win ? d.guesses.length : 0); sb.hidden = false; }
        else sb.hidden = true;
        tick();
    }

    function miniHTML(rows) {
        return '<div class="gd-mini" aria-hidden="true">' + rows.map(function (r) {
            return '<div class="gd-mini__row">' + r.map(function (s) { return '<i class="' + (s === 'miss' ? '' : 'is-' + s) + '"></i>'; }).join('') + '</div>';
        }).join('') + '</div>';
    }

    function cardHTML(p, kicker) {
        return '<div class="gd-card"><span class="eyebrow">' + QZ.esc(kicker) + '</span>' +
            '<div class="gd-card__name">' + QZ.esc(p.name) + '</div>' +
            '<div class="gd-card__chips">' +
            [p.team + ' · ' + p.league, p.nation, Core.ROLE[p.role], Core.age(p, year()) + ' anni', Core.fmtValue(p.value)].map(function (x) {
                return '<span class="chip">' + QZ.esc(x) + '</span>';
            }).join('') + '</div></div>';
    }

    function statsHTML(st, now) {
        var pct = st.played ? Math.round(st.wins / st.played * 100) : 0;
        var max = Math.max.apply(null, st.dist.concat([1]));
        return '<div class="gd-stats"><h2 class="label" style="margin:0">Le tue statistiche</h2>' +
            '<div class="stats">' +
            [['Partite', st.played], ['Vinte', pct + '%'], ['Serie', st.cur], ['Serie top', st.best]].map(function (s) {
                return '<div class="stat"><div class="stat__label">' + s[0] + '</div><div class="stat__value">' + s[1] + '</div></div>';
            }).join('') + '</div>' +
            '<div class="gd-dist" role="list" aria-label="Distribuzione dei tentativi">' +
            st.dist.map(function (c, i) {
                return '<div class="gd-dist__row' + (now === i + 1 ? ' is-now' : '') + '" role="listitem" aria-label="' + (i + 1) + ' tentativi: ' + c + (c === 1 ? ' volta' : ' volte') + '">' +
                    '<span class="gd-dist__n">' + (i + 1) + '</span><span class="gd-dist__bar" style="--w:' + Math.round(c / max * 100) + '%">' + c + '</span></div>';
            }).join('') + '</div></div>';
    }

    /* ---------- Conto alla rovescia (ogni secondo) ---------- */
    var shownN = today().n;
    function tick() {
        var txt = fmtClock(Core.msToNext());
        QZ.$$('[data-countdown]').forEach(function (el) { el.textContent = txt; });
        var n = today().n;
        if (n !== shownN) {
            shownN = n;
            // e' arrivato il nuovo calciatore: la copertina si aggiorna (la partita in corso no)
            if (!S.active) paintStart();
        }
    }
    setInterval(tick, 1000);

    /* ---------- Partita ---------- */
    function startDaily() {
        var t = today();
        var d = getDay();
        S = { active: true, mode: 'daily', n: t.n, secret: t.player, guesses: [], hint: !!d.hint, done: false, win: false };
        d.guesses.forEach(function (name) { S.guesses.push(BY_NAME[name]); });
        enterGame();
    }

    function startTraining() {
        var secret = trainDeck.draw();
        S = { active: true, mode: 'train', n: 0, secret: secret, guesses: [], hint: false, done: false, win: false };
        enterGame();
    }

    function enterGame() {
        finishing = false;
        var daily = S.mode === 'daily';
        $('#g-nlabel').textContent = daily ? 'Partita' : 'Modalità';
        $('#g-n').textContent = daily ? 'N° ' + S.n : 'ALLEN.';
        $('#g-clock-label').textContent = daily ? 'Il prossimo tra' : 'Il giorno tra';
        $('#g-mode').textContent = daily ? 'Il calciatore di oggi è lo stesso per tutti. Niente suggerimenti in chat.' : 'Allenamento: calciatore a caso, le statistiche del giorno non si toccano.';
        $('#g-input').value = '';
        closeList();
        $('#g-input').disabled = false;
        $('#g-quit').disabled = false;
        renderRows(false);
        paintBoard();
        paintHint();
        QZ.show('s-game');
        QZ.sound.start();
        setTimeout(function () { if (fine()) $('#g-input').focus({ preventScroll: true }); }, 260);
    }

    function fine() { return window.matchMedia && window.matchMedia('(pointer: fine)').matches; }

    function paintBoard() {
        var n = Math.min(S.guesses.length + 1, Core.MAX_TRIES);
        $('#g-try').innerHTML = n + '<small>/' + Core.MAX_TRIES + '</small>';
        var left = Core.MAX_TRIES - S.guesses.length;
        $('#g-left').textContent = S.done ? '' : left === Core.MAX_TRIES ? 'Sei tentativi a disposizione.' : left === 1 ? 'Ultimo tentativo. Pensaci bene.' : 'Ti restano ' + left + ' tentativi.';
    }

    function rowHTML(p, i, animate) {
        var cells = Core.compare(p, S.secret, year());
        var say = cells.map(function (c) {
            return c.label + ' ' + c.text + ': ' + (c.state === 'hit' ? 'giusto' : c.state === 'near' ? 'vicino' : 'no') +
                (c.arrow ? (c.key === 'age' ? (c.arrow === 'up' ? ', il segreto è più vecchio' : ', il segreto è più giovane') : (c.arrow === 'up' ? ', il segreto vale di più' : ', il segreto vale di meno')) : '');
        }).join('; ');
        return '<div class="gd-row" role="group" aria-label="Tentativo ' + (i + 1) + ', ' + QZ.esc(p.name) + '. ' + QZ.esc(say) + '">' +
            '<div class="gd-row__head" aria-hidden="true"><span class="gd-row__n">' + (i + 1) + '</span><span class="gd-row__name">' + QZ.esc(p.name) + '</span></div>' +
            '<div class="gd-tiles" aria-hidden="true">' + cells.map(function (c, k) {
                return '<div class="gd-tile' + (c.state === 'miss' ? '' : ' is-' + c.state) + (animate ? ' is-in' : '') + '" style="--i:' + k + '">' +
                    '<span class="gd-tile__k">' + c.label + '</span><span class="gd-tile__v">' + QZ.esc(c.text) + '</span>' +
                    (c.arrow ? '<span class="gd-tile__a">' + (c.arrow === 'up' ? '↑' : '↓') + '</span>' : '') + '</div>';
            }).join('') + '</div></div>';
    }

    /** Righe dei tentativi, l'ultimo in alto (vicino al campo di ricerca). */
    function renderRows(animateLast) {
        var html = '';
        for (var i = S.guesses.length - 1; i >= 0; i--) html += rowHTML(S.guesses[i], i, animateLast && i === S.guesses.length - 1);
        $('#g-rows').innerHTML = html;
    }

    function wrongCount() { return S.guesses.filter(function (p) { return p.name !== S.secret.name; }).length; }

    function paintHint() {
        var box = $('#g-hint');
        if (S.done || wrongCount() < 3) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false;
        if (S.hint) {
            var h = Core.hint(S.secret);
            box.innerHTML = QZ.icon('bulb') + '<span class="gd-hint__text">' +
                (h.mono ? 'Si fa chiamare con un nome solo, che comincia per <b>' + QZ.esc(h.letter) + '</b>.' : 'Il cognome comincia per <b>' + QZ.esc(h.letter) + '</b>.') + '</span>';
        } else {
            box.innerHTML = '<button class="btn btn--sm" type="button" id="g-hint-btn">' + QZ.icon('bulb') + 'Indizio: l\'iniziale del cognome</button>' +
                '<span class="small muted">Nel risultato si vedrà.</span>';
            $('#g-hint-btn').addEventListener('click', function () {
                S.hint = true;
                saveDay();
                QZ.sound.lifeline();
                paintHint();
                var h = Core.hint(S.secret);
                QZ.say((h.mono ? 'Nome unico, comincia per ' : 'Il cognome comincia per ') + h.letter);
                if (fine()) $('#g-input').focus({ preventScroll: true });
            });
        }
    }

    function guess(p) {
        if (!S.active || S.done || finishing || !p) return;
        if (S.guesses.some(function (g) { return g.name === p.name; })) { QZ.toast('Questo l\'hai già provato', { icon: 'info' }); return; }
        S.guesses.push(p);
        var win = p.name === S.secret.name;
        renderRows(true);
        paintBoard();
        if (win) return finish(true);
        if (S.guesses.length >= Core.MAX_TRIES) return finish(false);
        saveDay();
        QZ.sound.thud();
        var before = wrongCount();
        paintHint();
        if (before === 3 && !S.hint) QZ.say('Puoi chiedere un indizio');
    }

    function giveUp() {
        if (!S.active || S.done) return;
        QZ.confirm(S.mode === 'daily' ? 'Ti arrendi? La partita di oggi conta come persa e la serie si azzera.' : 'Ti arrendi? Vediamo chi era.', { okLabel: 'Mi arrendo', danger: true, title: 'Alzi bandiera bianca?' })
            .then(function (ok) { if (ok && S.active && !S.done) finish(false); });
    }

    function finish(win) {
        finishing = true;
        S.done = true;
        S.win = win;
        S.active = false;
        closeList();
        $('#g-input').disabled = true;
        $('#g-quit').disabled = true;
        $('#g-hint').hidden = true;
        $('#g-left').textContent = '';
        var tries = S.guesses.length;

        var stats = null;
        if (S.mode === 'daily') {
            saveDay();
            stats = getStats();
            if (stats.lastN !== S.n) {
                stats.played++;
                if (win) {
                    stats.wins++;
                    stats.dist[tries - 1]++;
                    stats.cur = stats.lastWinN === S.n - 1 ? stats.cur + 1 : 1;
                    stats.best = Math.max(stats.best, stats.cur);
                    stats.lastWinN = S.n;
                } else {
                    stats.cur = 0;
                }
                stats.lastN = S.n;
                QZ.store.set(KEY_STATS, stats);
            }
        }
        var xp = win ? 20 + (Core.MAX_TRIES + 1 - tries) * 15 - (S.hint ? 10 : 0) : 8;
        if (S.mode === 'train') xp = Math.round(xp / 2);
        var rec = QZ.profile.record(GAME, { xp: xp, label: (S.mode === 'daily' ? 'N° ' + S.n : 'Allenamento') + ' · ' + (win ? tries : 'X') + '/6' });
        S.xp = rec.xp;

        QZ.fx.stamp($('#g-rows'), win ? 'Gol!' : 'Fuori', win ? 'ok' : 'bad', {
            rot: -6, quiet: true,
            say: win ? 'Gol! Era ' + S.secret.name : 'Niente da fare, era ' + S.secret.name
        });
        if (win) QZ.sound.correct(); else QZ.sound.buzzer();
        setTimeout(function () {
            if (S.mode === 'daily') showDailyEnd(null, true);
            else showTrainEnd();
        }, QZ.reducedMotion() ? 400 : 1300);
    }

    /* ---------- Fine ---------- */
    function rowsOf(guesses, secret) {
        return guesses.map(function (p) { return Core.compare(p, secret, year()).map(function (c) { return c.state; }); });
    }

    var TITLES_WIN = ['Colpo da biliardo', 'Al primo colpo. Ma chi sei?', 'Gol di testa', 'Gol, ma che fatica', 'Al fotofinish', 'Allo scadere'];

    /** Fine della partita del giorno: subito dopo l'ultimo tentativo, o rivista dalla copertina. */
    function showDailyEnd(saved, fresh) {
        var t = today();
        var d = saved || getDay();
        var secret = fresh ? S.secret : t.player;
        var n = fresh ? S.n : t.n;
        var guesses = fresh ? S.guesses : d.guesses.map(function (g) { return BY_NAME[g]; });
        var win = fresh ? S.win : d.win;
        var usedHint = fresh ? S.hint : d.hint;
        var rows = rowsOf(guesses, secret);
        var st = getStats();
        var share = Core.shareText(n, rows, win, usedHint);
        var tries = guesses.length;

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: win,
            icon: win ? 'trophy' : 'flag',
            title: win ? (tries === 1 ? TITLES_WIN[1] : TITLES_WIN[Math.min(tries, 6) - 1]) : 'Stavolta te l\'ha fatta',
            subtitle: win
                ? 'N° ' + n + ': preso in ' + tries + ' su 6' + (usedHint ? ', con l\'aiutino dell\'iniziale.' : '.') + ' Adesso fallo sapere al gruppo.'
                : 'N° ' + n + ': sei tentativi e niente. Domani c\'è la rivincita, con un altro.',
            record: fresh ? { xp: S.xp } : null,
            extraHTML: '<div class="gd-end-extra">' + cardHTML(secret, win ? 'Il calciatore di oggi' : 'Era lui') + miniHTML(rows) +
                '<div class="card">' + statsHTML(st, win ? tries : 0) + '</div>' +
                '<div class="gd-next"><span class="label">Il prossimo tra</span><span class="led" data-countdown>' + fmtClock(Core.msToNext()) + '</span></div></div>',
            share: share,
            retryLabel: 'Allenamento',
            onRetry: startTraining,
            secondary: { label: 'Torna in panchina', icon: 'back', onClick: function () { paintStart(); QZ.show('s-start'); } }
        });
        tick();
    }

    function showTrainEnd() {
        var rows = rowsOf(S.guesses, S.secret);
        var tries = S.guesses.length;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: S.win,
            icon: S.win ? 'target' : 'flag',
            title: S.win ? 'In allenamento entra sempre' : 'Allenamento da ripetere',
            subtitle: S.win ? 'Preso in ' + tries + ' su 6. La partita vera però è quella del giorno.' : 'Era ' + S.secret.name + '. Succede anche ai migliori, il martedì.',
            record: { xp: S.xp },
            extraHTML: '<div class="gd-end-extra">' + cardHTML(S.secret, S.win ? 'Preso' : 'Era lui') + miniHTML(rows) + '</div>',
            share: 'Allenamento al Calciatore del Giorno su Quizzotti — ' + (S.win ? tries : 'X') + '/6\n\n' + rows.map(function (r) { return r.map(Core.emoji).join(''); }).join('\n'),
            retryLabel: 'Un altro',
            onRetry: startTraining,
            secondary: { label: 'Torna in panchina', icon: 'back', onClick: function () { paintStart(); QZ.show('s-start'); } }
        });
    }

    /* ---------- Autocompletamento (combobox accessibile) ---------- */
    var input = $('#g-input');
    var list = $('#g-list');

    function excluded() {
        var ex = {};
        (S.guesses || []).forEach(function (p) { ex[p.name] = true; });
        return ex;
    }
    function highlight(name, q) {
        var n = Core.norm(name);
        var qn = Core.norm(q);
        // l'evidenziazione vale solo se la normalizzazione non cambia la lunghezza (caso normale)
        var i = n.length === name.length ? n.indexOf(qn) : -1;
        if (i < 0 || !qn) return QZ.esc(name);
        return QZ.esc(name.slice(0, i)) + '<mark>' + QZ.esc(name.slice(i, i + qn.length)) + '</mark>' + QZ.esc(name.slice(i + qn.length));
    }
    function openList(q) {
        sugg = Core.search(PLAYERS, q, excluded(), 8);
        active = sugg.length ? 0 : -1;
        if (!sugg.length) {
            list.innerHTML = '<li class="gd-empty" role="presentation">Nessuno con questo nome nel nostro elenco.</li>';
        } else {
            list.innerHTML = sugg.map(function (p, i) {
                return '<li class="gd-opt" role="option" id="gd-opt-' + i + '" data-i="' + i + '" aria-selected="' + (i === active) + '">' +
                    '<span class="gd-opt__name">' + highlight(p.name, q) + '</span><span class="gd-opt__team">' + QZ.esc(p.team) + '</span></li>';
            }).join('');
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        syncActive();
    }
    function closeList() {
        list.hidden = true;
        list.innerHTML = '';
        sugg = [];
        active = -1;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }
    function syncActive() {
        QZ.$$('.gd-opt', list).forEach(function (li, i) { li.setAttribute('aria-selected', String(i === active)); });
        if (active >= 0) {
            input.setAttribute('aria-activedescendant', 'gd-opt-' + active);
            var el = document.getElementById('gd-opt-' + active);
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        } else input.removeAttribute('aria-activedescendant');
    }
    function choose(i) {
        var p = sugg[i];
        if (!p) return;
        input.value = '';
        closeList();
        guess(p);
        if (!S.done && !fine()) input.blur();
    }

    input.addEventListener('input', function () {
        if (Core.norm(input.value).length < 2) { closeList(); return; }
        openList(input.value);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); active = (active + 1) % sugg.length; syncActive(); }
        else if (e.key === 'ArrowUp' && sugg.length) { e.preventDefault(); active = (active - 1 + sugg.length) % sugg.length; syncActive(); }
        else if (e.key === 'Escape') { closeList(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0) choose(active);
            else if (input.value.trim()) { QZ.fx.shake(input); QZ.sound.wrong(); }
        }
    });
    input.addEventListener('blur', function () { setTimeout(closeList, 150); });
    // pointerdown: la scelta avviene prima che il campo perda il fuoco
    list.addEventListener('pointerdown', function (e) {
        var li = e.target.closest('.gd-opt');
        if (!li) return;
        e.preventDefault();
        choose(Number(li.dataset.i));
    });

    paintStart();
})();
