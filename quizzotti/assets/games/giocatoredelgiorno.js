/* ==========================================================================
   QUIZZOTTI v2 — Il Calciatore del Giorno
   Dati: assets/db-giocatoredelgiorno.js (`dailyCalendar`, un nome per partita:
   [0] = N° 1) e assets/db-giocatoributget.js (`playersDatabase`, da cui si
   prendono i dati {name, role, team, value, nation, continent, league, born}
   del segreto e di ogni tentativo).
   Ogni giorno (data di Roma) un calciatore segreto uguale per tutti, quello del
   calendario esplicito: il N° 1 e' il 16 novembre 2026, il N° n e' il nome
   n-1 della lista; finita la lista si ricomincia dall'inizio. Sei tentativi;
   ogni tentativo accende sei caselle (nazionale, campionato, squadra, ruolo,
   eta', valore): verde uguale, ambra vicino, frecce per eta' e valore. Dopo il
   terzo errore c'e' un indizio facoltativo (l'iniziale del cognome), dopo il
   quarto un secondo (la nazionale, o la squadra se la nazionale e' gia' nota).
   Statistiche, serie e distribuzione in localStorage; condivisione con i quadratini.
   Modalita' Allenamento: giocatore a caso (i famosi del calendario, solo Serie A,
   solo i big o tutto il database), mai quello di oggi; non tocca le statistiche del giorno.
   Archivio: i N° dei giorni passati, rigiocabili senza toccare statistiche e serie.
   Chiavi: qz.gdg.today (partita di oggi: {n, guesses, hint, hint2, done, win}), qz.gdg.stats (statistiche),
   qz.gdg.history (esito di ogni N°), qz.gdg.trainpool (ultimo mazzo scelto).

   La parte "Core" qui sotto non usa il DOM: i test la caricano con require().
   ========================================================================== */
/* global dailyCalendar, playersDatabase */
(function () {
    'use strict';

    /* =====================================================================
       CORE (puro, testabile in Node)
       ===================================================================== */
    var Core = (function () {
        var START = '2026-11-16';     // giorno del N° 1
        var MAX_TRIES = 6;
        var DAY = 86400000;

        // i formattatori costano: se ne crea uno solo per tipo (il conto alla rovescia gira ogni secondo)
        var fmtDate = null, fmtTime = null;

        /** Data di oggi a Roma come 'AAAA-MM-GG' (Europe/Rome, ora legale compresa). */
        function romeDate(d) {
            d = d || new Date();
            if (!fmtDate) fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
            var parts = fmtDate.formatToParts(d);
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

        /**
         * Il calciatore della partita N° n nel calendario `cal` (un elemento per giorno, [0] = N° 1).
         * Finito il calendario si ricomincia dall'inizio. Un buco (nome sparito dal database) non
         * sposta gli altri giorni: quel giorno vale il primo calciatore valido che segue.
         */
        function nth(cal, n) {
            var len = cal.length;
            var i = (Math.max(1, n) - 1) % len;
            for (var k = 0; k < len; k++) {
                var p = cal[(i + k) % len];
                if (p) return p;
            }
            return null;
        }

        /** Il calciatore del giorno: { n (numero della partita, da 1), player, date }. */
        function daily(cal, d) {
            var ymd = typeof d === 'string' ? d : romeDate(d);
            var n = Math.max(0, dayIndex(ymd)) + 1; // prima del via vale il N° 1
            return { n: n, player: nth(cal, n), date: ymd };
        }

        /** Data della partita N° n come 'AAAA-MM-GG'. */
        function dateOf(n) {
            return new Date(utcOf(START) + (n - 1) * DAY).toISOString().slice(0, 10);
        }

        /** Millisecondi alla prossima mezzanotte di Roma (gestisce i giorni da 23 e 25 ore). */
        function msToNext(now) {
            now = now || new Date();
            if (!fmtTime) fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
            var parts = fmtTime.formatToParts(now);
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
            'Pape Matar Sarr': 'Sarr', 'Barış Alper Yılmaz': 'Yılmaz','Jan Paul van Hecke': 'van Hecke', 'El Bilal Touré': 'Touré',
            'André-Frank Zambo Anguissa': 'Zambo Anguissa', 'Vinícius Jr.': 'Vinícius'
        };
        /** Cognome per l'indizio; null se si fa chiamare con un nome solo (Pedri, Rodri, Gavi…). */
        function surname(name) {
            if (SURNAME[name]) return SURNAME[name];
            var w = name.split(' ');
            return w.length > 1 ? w.slice(1).join(' ') : null;
        }
        // conosciuti col nome di battesimo anche se in elenco c'e' il cognome: l'indizio parla del nome
        var BY_FIRST = { 'Vinícius Jr.': 1, 'João Pedro': 1, 'Carlos Augusto': 1, 'Alisson Becker': 1, 'Ederson Moraes': 1, 'Djené Dakonam': 1 };
        /** Indizio: { mono: true se lo chiamano per nome, letter: iniziale del cognome (o del nome) }. */
        function hint(p) {
            var sur = surname(p.name);
            var mono = !sur || !!BY_FIRST[p.name];
            return { mono: mono, letter: (mono ? p.name : sur).charAt(0).toUpperCase() };
        }

        /**
         * Secondo indizio (dopo il quarto errore): la nazionale; se un tentativo l'ha gia' indovinata,
         * la squadra; se anche quella e' nota, il valore. Torna il tipo: 'nation' | 'team' | 'value'.
         */
        function hint2Kind(secret, guesses) {
            var known = function (k) { return (guesses || []).some(function (g) { return g && g[k] === secret[k]; }); };
            return !known('nation') ? 'nation' : !known('team') ? 'team' : 'value';
        }
        /** Testo del secondo indizio: { label, text } (es. 'Nazionale', 'Argentina'). */
        function hint2(secret, kind) {
            if (kind === 'team') return { label: 'Squadra', text: secret.team };
            if (kind === 'value') return { label: 'Valore', text: fmtValue(secret.value) };
            return { label: 'Nazionale', text: secret.nation };
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

        /** Eta' indicativa per la scheda: si conosce solo l'anno di nascita. */
        function ageText(p, year) { return 'Classe ' + p.born + ', circa ' + age(p, year) + ' anni'; }

        /**
         * Testo da condividere: intestazione, quadratini, niente nomi (niente spoiler).
         * hints: indizi usati (0, 1 o 2; true vale 1).
         * opt: { archive: true (partita dell'archivio), gaveUp: true (bandiera bianca), streak: serie in corso }
         */
        function shareText(n, rows, win, hints, opt) {
            opt = opt || {};
            hints = Number(hints) || 0;
            var head = 'Calciatore del Giorno N° ' + n + (opt.archive ? ' (archivio)' : '') + ' — ' +
                (win ? rows.length : 'X') + '/' + MAX_TRIES + (hints >= 2 ? ' (con 2 indizi)' : hints ? ' (con indizio)' : '');
            var lines = rows.map(function (r) { return r.map(emoji).join(''); });
            if (opt.gaveUp) lines.push('🏳️ bandiera bianca');
            var txt = head + '\n\n' + lines.join('\n');
            if (win && opt.streak >= 2) txt += '\n🔥 serie di ' + opt.streak;
            // in fondo il link, col nome con cui lo cercano: il Wordle del calcio
            if (opt.link) txt += '\n\nIl Wordle del calcio: ' + opt.link;
            return txt;
        }

        return {
            START: START, MAX_TRIES: MAX_TRIES, ROLE: ROLE,
            romeDate: romeDate, dayIndex: dayIndex, daily: daily, nth: nth, dateOf: dateOf, msToNext: msToNext,
            age: age, ageText: ageText, fmtValue: fmtValue, compare: compare, surname: surname, hint: hint,
            hint2Kind: hint2Kind, hint2: hint2,
            norm: norm, search: search, shareText: shareText, emoji: emoji
        };
    })();

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    if (typeof document === 'undefined' || typeof QZ === 'undefined' || typeof dailyCalendar === 'undefined' || typeof playersDatabase === 'undefined') return;

    /* =====================================================================
       INTERFACCIA
       ===================================================================== */
    var $ = QZ.$;
    var GAME = 'giocatoredelgiorno';
    // chi si puo' scrivere come tentativo: tutto il database dei calciatori (db-giocatoributget.js)
    var BY_NAME = {};
    var GUESS = [];
    playersDatabase.forEach(function (p) {
        if (BY_NAME[p.name] || !p.nation || !p.league || !p.born) return;
        BY_NAME[p.name] = p;
        GUESS.push(p);
    });
    // il calendario dei giorni (db-giocatoredelgiorno.js): nomi -> calciatori del database
    var CAL = dailyCalendar.map(function (n) { return BY_NAME[n] || null; });
    var IS_DAILY = {};
    dailyCalendar.forEach(function (n) { IS_DAILY[n] = 1; });
    // il link nel testo condiviso: lo stesso che QZ.share aggiungerebbe in coda (cosi' non si ripete)
    function shareLink() { return window.location.href.split('#')[0]; }
    var KEY_DAY = 'qz.gdg.today';       // la partita di oggi (anche a meta')
    var KEY_STATS = 'qz.gdg.stats';     // statistiche e serie
    var KEY_HIST = 'qz.gdg.history';    // esito di ogni N° giocato: { "5": {w, t, h, a} }
    var KEY_POOL = 'qz.gdg.trainpool';  // ultimo mazzo scelto per l'allenamento
    var trainDeck = new QZ.Deck(GAME + '.allenamento', GUESS, function (p) { return p.name; });

    // mazzi dell'allenamento
    function count(fn) { return GUESS.filter(fn).length; }
    var POOLS = {
        all: { label: 'I famosi', short: 'i famosi', test: function (p) { return !!IS_DAILY[p.name]; } },
        seriea: { label: 'Solo Serie A', short: 'solo Serie A', test: function (p) { return p.league === 'Serie A' && (IS_DAILY[p.name] || p.value >= 4); } },
        big: { label: 'Solo i big', short: 'solo i big', test: function (p) { return p.value >= 30; } },
        tutto: { label: 'Tutto il database', short: 'tutto il database', test: function () { return true; } }
    };
    POOLS.all.desc = count(POOLS.all.test) + ' calciatori famosi, quelli del gioco del giorno';
    POOLS.seriea.desc = count(POOLS.seriea.test) + ' calciatori del nostro campionato';
    POOLS.big.desc = count(POOLS.big.test) + ' nomi da copertina, valore da 30 milioni in su';
    POOLS.tutto.desc = count(POOLS.tutto.test) + ' calciatori, anche i meno noti: per veri esperti';

    var S = { active: false };
    var sugg = [];      // suggerimenti mostrati
    var active = -1;    // suggerimento evidenziato
    var finishing = false;
    var staleWarned = false;

    function tryWord(n) { return n === 1 ? 'tentativo' : 'tentativi'; }
    function year() { return Number(Core.romeDate().slice(0, 4)); }
    function today() { return Core.daily(CAL); }
    function hintCount(o) { return (o.hint ? 1 : 0) + (o.hint2 ? 1 : 0); }
    var HINT2_KINDS = { nation: 1, team: 1, value: 1 };
    function fmtClock(ms) {
        var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        s = s % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function fmtDay(n) {
        var d = new Date(Core.dateOf(n) + 'T12:00:00Z');
        return d.toLocaleDateString('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
    }

    /* ---------- Memoria ---------- */
    function emptyStats() { return { played: 0, wins: 0, cur: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], lastN: 0, lastWinN: 0 }; }
    /** Statistiche; la serie si azzera se dopo l'ultima vittoria si e' saltato un giorno (rispetto a refN). */
    function getStats(refN) {
        var st = Object.assign(emptyStats(), QZ.store.get(KEY_STATS, {}) || {});
        if (!Array.isArray(st.dist) || st.dist.length !== 6) st.dist = [0, 0, 0, 0, 0, 0];
        var ref = refN || today().n;
        if (st.cur && st.lastWinN < ref - 1) { st.cur = 0; QZ.store.set(KEY_STATS, st); }
        return st;
    }
    function getHist() {
        var h = QZ.store.get(KEY_HIST, {});
        return h && typeof h === 'object' && !Array.isArray(h) ? h : {};
    }
    function setHist(n, rec) {
        var h = getHist();
        h[n] = rec;
        var keys = Object.keys(h).map(Number).sort(function (a, b) { return a - b; });
        while (keys.length > 400) delete h[keys.shift()];
        QZ.store.set(KEY_HIST, h);
    }
    function getDay() {
        var d = QZ.store.get(KEY_DAY, null);
        var t = today();
        if (!d || d.n !== t.n || !Array.isArray(d.guesses)) return { n: t.n, guesses: [], hint: false, hint2: null, done: false, win: false };
        // i nomi spariti dal database (aggiornamenti) non devono rompere la partita
        d.guesses = d.guesses.filter(function (g) { return BY_NAME[g]; });
        // salvataggi di prima del secondo indizio: hint2 non c'e'
        d.hint2 = HINT2_KINDS[d.hint2] ? d.hint2 : null;
        return d;
    }
    function saveDay() {
        if (S.mode !== 'daily') return;
        // una partita di ieri finita dopo mezzanotte non cancella quella di oggi gia' iniziata
        var old = QZ.store.get(KEY_DAY, null);
        if (old && old.n > S.n) return;
        QZ.store.set(KEY_DAY, { n: S.n, guesses: S.guesses.map(function (p) { return p.name; }), hint: S.hint, hint2: S.hint2 || null, done: S.done, win: S.win });
    }
    // chi ha finito la partita di oggi prima che esistesse lo storico: la si riporta li'
    (function migrate() {
        var d = getDay();
        if (d.done && !getHist()[d.n]) setHist(d.n, { w: d.win ? 1 : 0, t: d.guesses.length, h: hintCount(d) });
    })();

    /* ---------- Markup statico ---------- */
    $('#medal').innerHTML = QZ.icon('calendar');
    $('#train-btn').innerHTML = QZ.icon('refresh') + 'Allenamento';
    $('#arch-btn').innerHTML = QZ.icon('calendar') + 'Archivio';
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Mi arrendo';
    $('#rules').innerHTML = [
        ['Scrivi un nome.', 'Basta il cognome, anche senza accenti: i suggerimenti fanno il resto.'],
        ['Guarda le caselle.', 'Mostrano i dati del nome che hai provato. Verde: uguale al segreto. Ambra: vicino (stesso continente, al massimo due anni di differenza, valore entro il 25%).'],
        ['Segui le frecce.', 'Su età e valore dicono da che parte sta il segreto: ↑ più vecchio o più caro, ↓ più giovane o meno caro.'],
        ['Sei tentativi.', 'Dopo il terzo errore puoi chiedere l\'iniziale del cognome, dopo il quarto la nazionale (o la squadra, se la nazionale l\'hai già trovata). Nel risultato si vede. Domani se ne gioca un altro.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    $('#start-btn').addEventListener('click', function () {
        if (getDay().done) showDailyEnd(false);
        else startDaily();
    });
    $('#train-btn').addEventListener('click', chooseTraining);
    $('#arch-btn').addEventListener('click', openArchive);
    $('#g-quit').addEventListener('click', giveUp);

    /* ---------- Copertina ---------- */
    function paintStart() {
        var d = getDay();
        var t = today();
        var k = d.guesses.length;
        $('#start-btn').innerHTML = d.done ? 'Com\'è andata oggi' + QZ.icon('chart')
            : k ? 'Riprendi la partita' + QZ.icon('arrow') : 'Fischio d\'inizio' + QZ.icon('arrow');
        $('#start-info').textContent = 'Oggi si gioca il N° ' + t.n +
            (d.done ? '. Il tuo l\'hai già giocato: torna domani.' : k ? ' · ' + k + ' ' + tryWord(k) + ' già ' + (k === 1 ? 'speso.' : 'spesi.') : '.');
        $('#arch-btn').hidden = t.n < 2;

        var box = $('#today');
        if (d.done) {
            var secret = t.player;
            var rows = rowsOf(d.guesses.map(function (g) { return BY_NAME[g]; }), secret);
            box.innerHTML =
                '<div class="gd-today__head"><h2 class="gd-today__title display">N° ' + t.n + ' · ' + (d.win ? 'preso in ' + k + '/6' : 'non preso') + (hintCount(d) >= 2 ? ' · con 2 indizi' : hintCount(d) ? ' · con indizio' : '') + '</h2>' +
                '<span class="small muted">Il prossimo tra <b class="led" data-countdown>--:--:--</b></span></div>' +
                '<div class="gd-today__body">' + (rows.length ? miniHTML(rows) : '') + cardHTML(secret, d.win ? 'Era lui' : 'Ti è sfuggito') + '</div>';
            box.hidden = false;
        } else {
            box.hidden = true;
            box.innerHTML = '';
        }
        var st = getStats();
        var sb = $('#start-stats');
        if (st.played) { sb.innerHTML = statsHTML(st, d.done && d.win ? k : 0); sb.hidden = false; }
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
            [p.team + ' · ' + p.league, p.nation, Core.ROLE[p.role], Core.ageText(p, year()), Core.fmtValue(p.value)].map(function (x) {
                return '<span class="chip">' + QZ.esc(x) + '</span>';
            }).join('') + '</div></div>';
    }

    function statsHTML(st, now) {
        var pct = st.played ? Math.round(st.wins / st.played * 100) : 0;
        var max = Math.max.apply(null, st.dist.concat([1]));
        var tot = st.dist.reduce(function (a, c, i) { return a + c * (i + 1); }, 0);
        var avg = st.wins ? String(Math.round(tot / st.wins * 10) / 10).replace('.', ',') : '';
        return '<div class="gd-stats"><h2 class="label" style="margin:0">Le tue statistiche</h2>' +
            '<div class="stats">' +
            [['Partite', st.played], ['Vinte', pct + '%'], ['Serie', st.cur], ['Record', st.best]].map(function (s) {
                return '<div class="stat"><div class="stat__label">' + s[0] + '</div><div class="stat__value">' + s[1] + '</div></div>';
            }).join('') + '</div>' +
            '<div class="gd-dist" role="list" aria-label="Distribuzione dei tentativi">' +
            st.dist.map(function (c, i) {
                return '<div class="gd-dist__row' + (now === i + 1 ? ' is-now' : '') + '" role="listitem" aria-label="Preso in ' + (i + 1) + ': ' + c + (c === 1 ? ' volta' : ' volte') + '">' +
                    '<span class="gd-dist__n" aria-hidden="true">' + (i + 1) + '</span><span class="gd-dist__bar" aria-hidden="true" style="--w:' + Math.round(c / max * 100) + '%">' + c + '</span></div>';
            }).join('') + '</div>' +
            (avg ? '<p class="small muted" style="margin:0">Quando lo prendi, ci metti in media <b class="gd-avg">' + avg + '</b> tentativi.</p>' : '') + '</div>';
    }

    /* ---------- Conto alla rovescia (ogni secondo) ---------- */
    var shownN = today().n;
    function tick() {
        var txt = fmtClock(Core.msToNext());
        var n = today().n;
        // partita del giorno iniziata ieri e ancora aperta: il nuovo calciatore e' gia' uscito
        var stale = S.active && S.mode === 'daily' && S.n !== n;
        QZ.$$('[data-countdown]').forEach(function (el) { el.textContent = stale && el.id === 'g-clock' ? 'USCITO' : txt; });
        if (stale) {
            $('#g-clock-label').textContent = 'Il nuovo è già';
            if (!staleWarned) {
                staleWarned = true;
                QZ.toast('È passata mezzanotte: il calciatore nuovo è già uscito. Finisci pure questo, conta per ieri.', { icon: 'info' });
            }
        }
        if (n !== shownN) {
            shownN = n;
            // e' arrivato il nuovo calciatore: la copertina si aggiorna (la partita in corso no)
            if (!S.active) paintStart();
        }
    }
    setInterval(tick, 1000);
    // telefono in tasca tutta la notte: al ritorno la copertina si aggiorna subito
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

    /* ---------- Partita ---------- */
    function startDaily() {
        var t = today();
        var d = getDay();
        S = { active: true, mode: 'daily', n: t.n, secret: t.player, guesses: [], hint: !!d.hint, hint2: d.hint2, done: false, win: false };
        d.guesses.forEach(function (name) { S.guesses.push(BY_NAME[name]); });
        enterGame();
    }

    function lastPool() {
        var k = QZ.store.get(KEY_POOL, 'all');
        return POOLS[k] ? k : 'all';
    }

    function chooseTraining() {
        var last = lastPool();
        QZ.modal({
            title: 'Allenamento',
            html: '<p class="muted">Un calciatore a caso, mai quello di oggi. Le statistiche del giorno non si toccano. Con chi ti alleni?</p>' +
                '<div class="gd-pools">' + Object.keys(POOLS).map(function (k) {
                    return '<button type="button" class="gd-pool' + (k === last ? ' is-last' : '') + '" data-pool="' + k + '"><b>' + POOLS[k].label + '</b><span>' + QZ.esc(POOLS[k].desc) + '</span></button>';
                }).join('') + '</div>',
            actions: [],
            onOpen: function (m, close) {
                QZ.$$('.gd-pool', m).forEach(function (b) {
                    b.addEventListener('click', function () { close(b.dataset.pool); });
                });
                var f = m.querySelector('.gd-pool.is-last') || m.querySelector('.gd-pool');
                setTimeout(function () { if (f.isConnected) f.focus({ preventScroll: true }); }, 80);
            }
        }).then(function (k) {
            if (!k || !POOLS[k]) return;
            QZ.store.set(KEY_POOL, k);
            startTraining(k);
        });
    }

    function startTraining(poolKey) {
        var key = POOLS[poolKey] ? poolKey : lastPool();
        var todayName = today().player.name;
        // mai il calciatore di oggi: in allenamento sarebbe uno spoiler
        var secret = trainDeck.draw(function (p) { return p.name !== todayName && POOLS[key].test(p); });
        S = { active: true, mode: 'train', pool: key, n: 0, secret: secret, guesses: [], hint: false, hint2: null, done: false, win: false };
        enterGame();
    }

    function startArchive(n) {
        S = { active: true, mode: 'archive', n: n, secret: Core.nth(CAL, n), guesses: [], hint: false, hint2: null, done: false, win: false };
        enterGame();
    }

    function openArchive() {
        var t = today();
        var hist = getHist();
        var items = [];
        for (var n = t.n - 1; n >= Math.max(1, t.n - 60); n--) {
            var r = hist[n];
            var state = !r ? 'da giocare' : r.w ? 'preso in ' + r.t + '/6' : 'non preso';
            items.push('<li><button type="button" class="gd-arch' + (r ? (r.w ? ' is-win' : ' is-lost') : '') + '" data-n="' + n + '">' +
                '<span class="gd-arch__n">N° ' + n + '</span><span class="gd-arch__d">' + QZ.esc(fmtDay(n)) + '</span>' +
                '<span class="gd-arch__s">' + state + (r && r.a ? ' (archivio)' : '') + '</span></button></li>');
        }
        QZ.modal({
            title: 'Archivio',
            html: '<p class="muted">I calciatori dei giorni passati. Li giochi quando vuoi, ma statistiche e serie restano come sono.</p>' +
                '<ul class="gd-arch-list">' + items.join('') + '</ul>',
            actions: [],
            onOpen: function (m, close) {
                QZ.$$('.gd-arch', m).forEach(function (b) {
                    b.addEventListener('click', function () { close(Number(b.dataset.n)); });
                });
            }
        }).then(function (n) { if (n) startArchive(n); });
    }

    var MODE_TXT = {
        daily: 'Il calciatore di oggi è lo stesso per tutti. Niente spoiler in chat.',
        train: 'Allenamento: calciatore a caso, le statistiche del giorno non si toccano.',
        archive: 'Archivio: si gioca per la gloria, statistiche e serie restano come sono.'
    };

    function enterGame() {
        finishing = false;
        staleWarned = false;
        var mode = S.mode;
        $('#g-nlabel').textContent = mode === 'train' ? 'Modalità' : mode === 'archive' ? 'Archivio' : 'Partita';
        $('#g-n').textContent = mode === 'train' ? 'ALLEN.' : 'N° ' + S.n;
        $('#g-clock-label').textContent = mode === 'daily' ? 'Il prossimo tra' : 'Quello vero tra';
        $('#g-mode').textContent = MODE_TXT[mode] + (mode === 'train' ? ' Mazzo: ' + POOLS[S.pool].short + '.' : '');
        input.value = '';
        closeList();
        input.disabled = false;
        $('#g-quit').disabled = false;
        renderRows(false);
        paintBoard();
        paintHint();
        QZ.show('s-game');
        QZ.sound.start();
        tick();
        setTimeout(function () { if (fine() && S.active) input.focus({ preventScroll: true }); }, 260);
    }

    function fine() { return window.matchMedia && window.matchMedia('(pointer: fine)').matches; }

    function paintBoard() {
        var n = Math.min(S.guesses.length + 1, Core.MAX_TRIES);
        $('#g-try').innerHTML = n + '<small>/' + Core.MAX_TRIES + '</small>';
        var left = Core.MAX_TRIES - S.guesses.length;
        $('#g-left').textContent = S.done ? '' : left === Core.MAX_TRIES ? 'Sei tentativi a disposizione.' : left === 1 ? 'Ultimo tentativo. Pensaci bene.' : 'Ti restano ' + left + ' tentativi.';
    }

    /** Le caselle dette a parole (per chi usa il lettore di schermo). */
    function sayCells(cells) {
        return cells.map(function (c) {
            return c.label + ' ' + c.text + ': ' + (c.state === 'hit' ? 'giusto' : c.state === 'near' ? 'vicino' : 'no') +
                (c.arrow ? (c.key === 'age' ? (c.arrow === 'up' ? ', il segreto è più vecchio' : ', il segreto è più giovane') : (c.arrow === 'up' ? ', il segreto vale di più' : ', il segreto vale di meno')) : '');
        }).join('; ');
    }

    function rowHTML(p, i, animate) {
        var cells = Core.compare(p, S.secret, year());
        return '<div class="gd-row" role="group" aria-label="Tentativo ' + (i + 1) + ', ' + QZ.esc(p.name) + '. ' + QZ.esc(sayCells(cells)) + '">' +
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

    function hintText(h) {
        return h.mono ? 'Lo chiamano per nome, e comincia per <b>' + QZ.esc(h.letter) + '</b>.' : 'Il cognome comincia per <b>' + QZ.esc(h.letter) + '</b>.';
    }

    function hint2Text(h) { return QZ.esc(h.label) + ': <b>' + QZ.esc(h.text) + '</b>'; }
    var HINT2_BTN = { nation: 'la nazionale', team: 'la squadra', value: 'il valore' };

    /** Gli indizi: il primo (iniziale) dopo il terzo errore, il secondo (nazionale o squadra) dopo il quarto. */
    function paintHint() {
        var box = $('#g-hint');
        var wrong = wrongCount();
        if (S.done || wrong < 3) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false;
        var note = '<span class="small muted">' + (S.mode === 'daily' ? 'Nel risultato si vedrà.' : 'Costa qualche punto esperienza.') + '</span>';
        var html = S.hint
            ? '<p class="gd-hint__item">' + QZ.icon('bulb') + '<span class="gd-hint__text">' + hintText(Core.hint(S.secret)) + '</span></p>'
            : '<p class="gd-hint__item"><button class="btn btn--sm" type="button" id="g-hint-btn">' + QZ.icon('bulb') + 'Indizio: l\'iniziale</button>' + note + '</p>';
        if (wrong >= 4) {
            html += S.hint2
                ? '<p class="gd-hint__item">' + QZ.icon('bulb') + '<span class="gd-hint__text">' + hint2Text(Core.hint2(S.secret, S.hint2)) + '</span></p>'
                : '<p class="gd-hint__item"><button class="btn btn--sm" type="button" id="g-hint2-btn">' + QZ.icon('bulb') + 'Secondo indizio: ' +
                    HINT2_BTN[Core.hint2Kind(S.secret, S.guesses)] + '</button>' + (S.hint ? note : '') + '</p>';
        }
        box.innerHTML = html;
        var b1 = $('#g-hint-btn');
        if (b1) b1.addEventListener('click', function () {
            if (S.hint || S.done) return;
            S.hint = true;
            useHint();
            var h = Core.hint(S.secret);
            QZ.say((h.mono ? 'Lo chiamano per nome, comincia per ' : 'Il cognome comincia per ') + h.letter);
        });
        var b2 = $('#g-hint2-btn');
        if (b2) b2.addEventListener('click', function () {
            if (S.hint2 || S.done) return;
            // il tipo si fissa adesso: i tentativi dopo non lo cambiano
            S.hint2 = Core.hint2Kind(S.secret, S.guesses);
            useHint();
            var h = Core.hint2(S.secret, S.hint2);
            QZ.say(h.label + ': ' + h.text);
        });
    }
    function useHint() {
        saveDay();
        QZ.sound.lifeline();
        paintHint();
        if (fine()) input.focus({ preventScroll: true });
    }

    function guess(p) {
        if (!S.active || S.done || finishing || !p) return;
        if (S.guesses.some(function (g) { return g.name === p.name; })) { QZ.toast('Questo l\'hai già provato', { icon: 'info' }); return; }
        S.guesses.push(p);
        var win = p.name === S.secret.name;
        renderRows(true);
        paintBoard();
        if (win) return finish(true);
        var cells = Core.compare(p, S.secret, year());
        if (S.guesses.length >= Core.MAX_TRIES) { QZ.say(p.name + '. ' + sayCells(cells)); return finish(false); }
        saveDay();
        // quasi preso (quattro caselle verdi o piu'): un suono diverso dal tonfo
        var hits = cells.filter(function (c) { return c.state === 'hit'; }).length;
        if (hits >= 4) QZ.sound.pop(); else QZ.sound.thud();
        paintHint();
        var left = Core.MAX_TRIES - S.guesses.length;
        // si annuncia solo l'ultimo tentativo (la lista non e' piu' una regione live che rilegge tutto)
        QZ.say(p.name + '. ' + sayCells(cells) + '. ' + (left === 1 ? 'Ultimo tentativo.' : 'Restano ' + left + ' tentativi.') +
            (wrongCount() === 3 && !S.hint ? ' Puoi chiedere un indizio.' : wrongCount() === 4 && !S.hint2 ? ' Puoi chiedere un secondo indizio.' : ''));
    }

    function giveUp() {
        if (!S.active || S.done) return;
        QZ.confirm(S.mode === 'daily' ? 'La partita di oggi conta come persa e la serie si azzera.' : 'Niente di male: vediamo chi era.',
            { okLabel: 'Mi arrendo', cancelLabel: 'Gioco ancora', danger: true, title: 'Alzi bandiera bianca?' })
            .then(function (ok) { if (ok && S.active && !S.done && !finishing) { S.gaveUp = true; finish(false); } });
    }

    function finish(win) {
        finishing = true;
        S.done = true;
        S.win = win;
        S.active = false;
        closeList();
        input.value = '';
        input.disabled = true;
        $('#g-quit').disabled = true;
        $('#g-hint').hidden = true;
        $('#g-left').textContent = '';
        var tries = S.guesses.length;
        var rec = { w: win ? 1 : 0, t: tries, h: hintCount(S) };

        if (S.mode === 'daily') {
            saveDay();
            var hist = getHist();
            var stats = getStats(S.n);
            // una partita conta una volta sola (anche con due schede aperte)
            if (stats.lastN !== S.n && !(hist[S.n] && !hist[S.n].a)) {
                stats.played++;
                if (win) { stats.wins++; stats.dist[tries - 1]++; }
                // la serie va avanti solo in ordine: la partita di ieri chiusa dopo quella di oggi non la tocca
                if (S.n >= stats.lastN) {
                    if (win) {
                        stats.cur = stats.lastWinN === S.n - 1 ? stats.cur + 1 : 1;
                        stats.best = Math.max(stats.best, stats.cur);
                        stats.lastWinN = S.n;
                    } else stats.cur = 0;
                    stats.lastN = S.n;
                }
                QZ.store.set(KEY_STATS, stats);
            }
            setHist(S.n, rec);
            // Leghe tra amici: il risultato del giorno entra da solo nelle classifiche (Leghe.html)
            if (QZ.leagues) QZ.leagues.submit(GAME, S.n, { win: !!win, tries: tries, hints: hintCount(S) });
        } else if (S.mode === 'archive') {
            var old = getHist()[S.n];
            // dall'archivio non si sovrascrive l'esito vero di quel giorno
            if (!old || old.a) { rec.a = 1; setHist(S.n, rec); }
        }
        var xp = win ? 20 + (Core.MAX_TRIES + 1 - tries) * 15 - hintCount(S) * 10 : 8;
        if (S.mode !== 'daily') xp = Math.round(xp / 2);
        var label = (S.mode === 'daily' ? 'N° ' + S.n : S.mode === 'archive' ? 'Archivio N° ' + S.n : 'Allenamento') + ' · ' + (win ? tries : 'X') + '/6';
        S.xp = QZ.profile.record(GAME, { xp: xp, label: label }).xp;

        QZ.fx.stamp($('#g-rows'), win ? 'Gol!' : 'Fuori', win ? 'ok' : 'bad', {
            rot: -6, quiet: true,
            say: win ? 'Gol! Era ' + S.secret.name : 'Niente da fare, era ' + S.secret.name
        });
        if (win) QZ.sound.correct(); else QZ.sound.buzzer();
        setTimeout(function () {
            if (S.mode === 'daily') showDailyEnd(true);
            else showOtherEnd();
        }, QZ.reducedMotion() ? 400 : 1300);
    }

    /* ---------- Fine ---------- */
    function rowsOf(guesses, secret) {
        return guesses.map(function (p) { return Core.compare(p, secret, year()).map(function (c) { return c.state; }); });
    }

    // titolo della vittoria secondo i tentativi usati (indice = tentativi - 1)
    var TITLES_WIN = ['Al primo colpo. Ma chi sei?', 'Colpo da biliardo', 'Gol di testa', 'Gol, ma che fatica', 'Al fotofinish', 'Allo scadere'];
    var TITLES_LOST = ['Stavolta te l\'ha fatta', 'Palo pieno', 'Fuori di un soffio'];
    function winTitle(tries) { return TITLES_WIN[Math.max(1, Math.min(tries, 6)) - 1]; }

    function back() { paintStart(); QZ.show('s-start'); }

    /** Fine della partita del giorno: subito dopo l'ultimo tentativo (fresh), o rivista dalla copertina. */
    function showDailyEnd(fresh) {
        var t = today();
        var d = getDay();
        var secret = fresh ? S.secret : t.player;
        var n = fresh ? S.n : t.n;
        var guesses = fresh ? S.guesses : d.guesses.map(function (g) { return BY_NAME[g]; });
        var win = fresh ? S.win : d.win;
        var hints = hintCount(fresh ? S : d);
        var tries = guesses.length;
        var gaveUp = !win && tries < Core.MAX_TRIES;
        var rows = rowsOf(guesses, secret);
        var st = getStats();
        var streak = st.lastWinN === n ? st.cur : 0;
        // partita di ieri chiusa dopo mezzanotte: non e' piu' "di oggi"
        var whose = n === t.n ? 'di oggi' : 'del N° ' + n;
        var rematch = n === t.n ? ' Domani c\'è la rivincita, con un altro.' : ' La rivincita è già pronta: il N° ' + t.n + '.';

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: win,
            icon: win ? 'trophy' : 'flag',
            title: win ? winTitle(tries) : gaveUp ? 'Bandiera bianca' : TITLES_LOST[n % TITLES_LOST.length],
            subtitle: win
                ? 'N° ' + n + ': preso in ' + tries + ' su 6' + (hints >= 2 ? ', con due indizi.' : hints ? ', con un indizio.' : '.') +
                  (streak >= 2 ? ' Sono ' + streak + ' giorni di fila.' : '') + ' Adesso fallo sapere al gruppo.'
                : gaveUp ? 'N° ' + n + (tries ? ': ti sei arreso dopo ' + tries + ' ' + tryWord(tries) + '.' : ': ti sei arreso senza nemmeno provarci.') + rematch
                    : 'N° ' + n + ': sei tentativi e niente.' + rematch,
            record: fresh ? { xp: S.xp } : null,
            extraHTML: '<div class="gd-end-extra">' + cardHTML(secret, win ? 'Il calciatore ' + whose : 'Era lui') + (rows.length ? miniHTML(rows) : '') +
                '<div class="card">' + statsHTML(st, win ? tries : 0) + '</div>' +
                (n === t.n
                    ? '<div class="gd-next"><span class="label">Il prossimo tra</span><span class="led" data-countdown>' + fmtClock(Core.msToNext()) + '</span></div>'
                    : '<div class="gd-next"><span class="label">Il N° ' + t.n + ' è già uscito</span><span class="small muted">Lo trovi in panchina.</span></div>') + '</div>',
            share: Core.shareText(n, rows, win, hints, { gaveUp: gaveUp, streak: streak, link: shareLink() }),
            retryLabel: 'Allenamento',
            onRetry: chooseTraining,
            secondary: { label: 'Torna in panchina', icon: 'back', onClick: back }
        });
        tick();
    }

    /** Fine di allenamento e archivio. */
    function showOtherEnd() {
        var rows = rowsOf(S.guesses, S.secret);
        var tries = S.guesses.length;
        var arch = S.mode === 'archive';
        var share = arch
            ? Core.shareText(S.n, rows, S.win, hintCount(S), { archive: true, gaveUp: !!S.gaveUp, link: shareLink() })
            : 'Allenamento al Calciatore del Giorno — ' + (S.win ? tries : 'X') + '/6\n\n' + rows.map(function (r) { return r.map(Core.emoji).join(''); }).join('\n');
        var pool = S.pool;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: S.win,
            icon: S.win ? 'target' : 'flag',
            title: S.win ? (arch ? winTitle(tries) : 'In allenamento entra sempre') : (arch ? 'Questo ti è sfuggito' : 'Allenamento da ripetere'),
            subtitle: S.win
                ? 'Preso in ' + tries + ' su 6' + (arch ? ', N° ' + S.n + ' dall\'archivio.' : '. La partita vera però è quella del giorno.')
                : 'Era ' + S.secret.name + '. Succede anche ai migliori, il martedì.',
            record: { xp: S.xp },
            extraHTML: '<div class="gd-end-extra">' + cardHTML(S.secret, S.win ? 'Preso' : 'Era lui') + (rows.length ? miniHTML(rows) : '') + '</div>',
            share: share,
            retryLabel: arch ? 'Un altro dall\'archivio' : 'Un altro',
            onRetry: arch ? function () { back(); openArchive(); } : function () { startTraining(pool); },
            secondary: { label: 'Torna in panchina', icon: 'back', onClick: back }
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
        if (!qn || n.length !== name.length) return QZ.esc(name);
        // prima l'inizio di una parola (di solito il cognome), poi dovunque
        var i = (' ' + n).indexOf(' ' + qn);
        if (i < 0) i = n.indexOf(qn);
        if (i < 0) return QZ.esc(name);
        return QZ.esc(name.slice(0, i)) + '<mark>' + QZ.esc(name.slice(i, i + qn.length)) + '</mark>' + QZ.esc(name.slice(i + qn.length));
    }
    function openList(q) {
        sugg = Core.search(GUESS, q, excluded(), 8);
        active = sugg.length ? 0 : -1;
        if (!sugg.length) {
            list.innerHTML = '<li class="gd-empty" role="presentation">Nessuno così nel nostro elenco. Controlla come l\'hai scritto, o prova un altro nome.</li>';
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
    function syncActive(noScroll) {
        QZ.$$('.gd-opt', list).forEach(function (li, i) { li.setAttribute('aria-selected', String(i === active)); });
        if (active >= 0) {
            input.setAttribute('aria-activedescendant', 'gd-opt-' + active);
            var el = document.getElementById('gd-opt-' + active);
            if (!noScroll && el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
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
    input.addEventListener('focus', function () {
        if (!input.disabled && Core.norm(input.value).length >= 2) openList(input.value);
    });
    input.addEventListener('keydown', function (e) {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); active = (active + 1) % sugg.length; syncActive(); }
        else if (e.key === 'ArrowUp' && sugg.length) { e.preventDefault(); active = (active - 1 + sugg.length) % sugg.length; syncActive(); }
        else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); closeList(); } }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.repeat) return; // Invio tenuto premuto: un tentativo solo
            if (active >= 0) choose(active);
            else if (input.value.trim()) { QZ.fx.shake(input); QZ.sound.wrong(); }
        }
    });
    input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) closeList(); }, 150); });
    // mousedown annullato: il campo non perde il fuoco; la scelta arriva col click
    // (con pointerdown, sul telefono, provare a scorrere la lista sceglieva il nome toccato)
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
        var li = e.target.closest('.gd-opt');
        if (li) choose(Number(li.dataset.i));
    });
    list.addEventListener('pointermove', function (e) {
        var li = e.target.closest('.gd-opt');
        if (!li || e.pointerType === 'touch' || Number(li.dataset.i) === active) return;
        active = Number(li.dataset.i);
        syncActive(true);
    });

    paintStart();
})();
