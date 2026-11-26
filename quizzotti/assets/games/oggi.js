/* ==========================================================================
   QUIZZOTTI v2 — Il Giornale di oggi (Oggi.html)
   Non e' un gioco del registro QZ.GAMES: raccoglie i giochi del giorno, uguali
   per tutti, e li legge dai loro salvataggi (solo lettura, niente chiavi nuove):
     - Il Calciatore del Giorno: qz.gdg.history (esito per N°, N° 1 il 16/11/2026)
       e qz.gdg.today (partita in corso);
     - la Scheda del giorno di Quattro per Quattro: qz.quattro.daily.v1
       ({ play: { data }, done: { data: { win, mistakes, solved, rows } } });
     - L'Intruso del giorno: qz.intruso.daily.v1 ({ data: { n, log, score, done } });
     - Sopra o Sotto del giorno: qz.sopraosotto.daily.v1 ({ data: { n, streak, done } }).
   Le caselle si spuntano da sole. La serie unica ("giorni in campo") si allunga
   ogni giorno in cui chiudi almeno 3 giochi del giorno su 4, dal 27 novembre
   2026 (il primo giorno con tutti e quattro); oggi conta appena arrivi a 3,
   finche' non ci arrivi la serie resta quella fino a ieri. Il giorno cambia a
   mezzanotte di Roma. In fondo il riepilogo da condividere con le emoji di tutti.

   La parte "Core" qui sotto non usa il DOM: i test la caricano con require().
   ========================================================================== */
(function () {
    'use strict';

    var Core = (function () {
        var START = '2026-11-27';       // N° 1 del Giornale (e della Scheda, dell'Intruso e di Sopra o Sotto del giorno)
        var GDG_START = '2026-11-16';   // N° 1 del Calciatore del Giorno
        var NEED = 3;                   // giochi chiusi per tenere viva la serie
        var DAY = 86400000;
        var QQ = { 1: '🟩', 2: '🟨', 3: '🟦', 4: '🟥' };

        var GAMES = [
            { id: 'giocatoredelgiorno', name: 'Il Calciatore del Giorno', short: 'Calciatore del Giorno', emoji: '👤', icon: 'calendar', file: 'GiocatoreDelGiorno.html', color: '#ffd23f',
                desc: 'Un calciatore segreto, sei tentativi.' },
            { id: 'quattro', name: 'La Scheda del giorno', short: 'Quattro per Quattro', emoji: '🧩', icon: 'layers', file: 'QuattroPerQuattro.html?giorno', color: '#7c9cff',
                desc: 'Sedici nomi, quattro gruppi, quattro errori.' },
            { id: 'intruso', name: 'L\'Intruso del giorno', short: 'L\'Intruso', emoji: '👁️', icon: 'eye', file: 'Intruso.html?giorno', color: '#ff5fa2',
                desc: 'Cinque round, sei nomi, un intruso a round.' },
            { id: 'sopraosotto', name: 'Sopra o Sotto del giorno', short: 'Sopra o Sotto', emoji: '↕️', icon: 'updown', file: 'SopraOSotto.html?giorno', color: '#5ee0a0',
                desc: 'Chi vale di più? Una serie sola, coppie uguali per tutti.' }
        ];

        var fmtDate = null;
        function romeDate(d) {
            d = d || new Date();
            if (!fmtDate) fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
            var o = {};
            fmtDate.formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
            return o.year + '-' + o.month + '-' + o.day;
        }
        function utcOf(ymd) {
            var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
            return Date.UTC(+m[1], +m[2] - 1, +m[3]);
        }
        function between(a, b) { return Math.round((utcOf(b) - utcOf(a)) / DAY); }
        function addDays(ymd, k) { return new Date(utcOf(ymd) + k * DAY).toISOString().slice(0, 10); }
        function itDate(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4); }
        /** N° del Giornale (e dei giochi del giorno nuovi): 1 il 27/11/2026, 0 prima. */
        function number(ymd) { var k = between(START, ymd); return k < 0 ? 0 : k + 1; }
        /** N° di un gioco in quel giorno (0 se quel giorno il gioco non c'era ancora). */
        function gameNumber(id, ymd) {
            if (id === 'giocatoredelgiorno') { var k = between(GDG_START, ymd); return k < 0 ? 0 : k + 1; }
            return number(ymd);
        }

        function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
        function rep(s, n) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }
        function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

        /**
         * Lo stato di un gioco del giorno: { state: 'soon'|'todo'|'play'|'done', n, win, line, text }.
         * get(chiave) legge un salvataggio (gia' decodificato) o null.
         */
        function status(id, get, ymd) {
            var n = gameNumber(id, ymd);
            if (!n) return { state: 'soon', n: 0, line: '', text: 'Dal ' + itDate(START) };
            var d, k;
            if (id === 'giocatoredelgiorno') {
                d = obj(get('qz.gdg.history'))[n];
                if (d && !d.a) {
                    var t = Math.max(0, Math.min(6, d.t | 0)), win = !!d.w, h = d.h | 0;
                    return {
                        state: 'done', n: n, win: win,
                        line: (win ? rep('⬛', t - 1) + '🟩' : rep('⬛', t)) + ' ' + (win ? t : 'X') + '/6' + (h ? ' 💡' : ''),
                        text: win ? 'Preso in ' + t + ' su 6' + (h >= 2 ? ', con due indizi' : h ? ', con un indizio' : '') : t < 6 ? 'Bandiera bianca' : 'Sei tentativi e niente'
                    };
                }
                var today = obj(get('qz.gdg.today'));
                if (today.n === n && Array.isArray(today.guesses) && today.guesses.length && !today.done) {
                    return { state: 'play', n: n, line: '', text: 'In corso: ' + plural(today.guesses.length, 'tentativo', 'tentativi') };
                }
                return { state: 'todo', n: n, line: '', text: '' };
            }
            if (id === 'quattro') {
                var q = obj(get('qz.quattro.daily.v1'));
                d = obj(q.done)[ymd];
                if (q.done && q.done[ymd]) {
                    var rows = Array.isArray(d.rows) ? d.rows : null;
                    var solved = Array.isArray(d.solved) ? d.solved.length : 0, err = d.mistakes | 0;
                    // un quadratino per tentativo: il colore del gruppo trovato, nero per l'errore
                    var line = rows
                        ? rows.map(function (r) { return r.every(function (x) { return x === r[0]; }) ? QQ[r[0]] || '⬛' : '⬛'; }).join('')
                        : rep('🟩', solved) + rep('⬛', err);
                    return {
                        state: 'done', n: n, win: !!d.win,
                        line: line + ' ' + (d.win ? (err ? plural(err, 'errore', 'errori') : 'zero errori') : 'persa'),
                        text: d.win ? 'Chiusa ' + (err ? 'con ' + plural(err, 'errore', 'errori') : 'senza errori') : 'Persa, ' + solved + ' gruppi su 4'
                    };
                }
                var pl = obj(q.play)[ymd];
                if (pl && Array.isArray(pl.solved)) return { state: 'play', n: n, line: '', text: 'In corso: ' + pl.solved.length + ' gruppi su 4' };
                return { state: 'todo', n: n, line: '', text: '' };
            }
            if (id === 'intruso') {
                d = obj(get('qz.intruso.daily.v1'))[ymd];
                if (!d) return { state: 'todo', n: n, line: '', text: '' };
                var log = Array.isArray(d.log) ? d.log : [];
                k = log.filter(function (x) { return x === 'ok'; }).length;
                var grid = '';
                for (var i = 0; i < 5; i++) grid += log[i] === 'ok' ? '🟩' : log[i] === 'bad' ? '🟥' : '⬛';
                if (!d.done) return { state: 'play', n: n, line: '', text: 'In corso: round ' + log.length + ' di 5' };
                return { state: 'done', n: n, win: k >= 4, line: grid + ' ' + k + '/5', text: plural(k, 'intruso scovato', 'intrusi scovati') + ' su 5' };
            }
            if (id === 'sopraosotto') {
                d = obj(get('qz.sopraosotto.daily.v1'))[ymd];
                if (!d) return { state: 'todo', n: n, line: '', text: '' };
                k = Math.max(0, d.streak | 0);
                if (!d.done) return { state: 'play', n: n, line: '', text: 'In corso: ' + k + ' di fila' };
                return { state: 'done', n: n, win: k >= 10, line: '🔥 ' + k + ' di fila', text: 'Serie di ' + k };
            }
            return { state: 'todo', n: n, line: '', text: '' };
        }

        /** Quanti giochi del giorno sono chiusi in quel giorno. */
        function count(get, ymd) {
            return GAMES.filter(function (g) { return status(g.id, get, ymd).state === 'done'; }).length;
        }
        /** Giorno buono per la serie: almeno NEED giochi chiusi, dal primo giorno del Giornale. */
        function good(get, ymd) { return number(ymd) > 0 && count(get, ymd) >= NEED; }
        /**
         * La serie di giorni in campo fino a ymd: se oggi non e' ancora buono, conta fino a ieri
         * (la serie non si rompe finche' la giornata non e' finita).
         */
        function streak(get, ymd) {
            var d = good(get, ymd) ? ymd : addDays(ymd, -1), s = 0;
            while (number(d) > 0 && good(get, d)) { s++; d = addDays(d, -1); }
            return s;
        }
        /** La serie piu' lunga di sempre, dal 27/11/2026 a ymd. */
        function best(get, ymd) {
            var b = 0, cur = 0;
            for (var d = START; number(ymd) > 0 && d <= ymd; d = addDays(d, 1)) {
                cur = good(get, d) ? cur + 1 : 0;
                if (cur > b) b = cur;
            }
            return b;
        }

        /** Il riepilogo da condividere: una riga per gioco, la serie e il link. */
        function shareText(get, ymd, link) {
            var n = number(ymd);
            var lines = GAMES.map(function (g) {
                var st = status(g.id, get, ymd);
                var head = g.emoji + ' ' + g.short + (st.n ? ' N° ' + st.n : '');
                return head + ': ' + (st.state === 'done' ? st.line : st.state === 'soon' ? 'dal ' + itDate(START) : 'da giocare');
            });
            var c = count(get, ymd), s = streak(get, ymd);
            return 'Il Giornale di Quizzotti' + (n ? ' N° ' + n : '') + ' · ' + itDate(ymd) + '\n' + lines.join('\n') + '\n' +
                '✅ ' + c + ' su ' + GAMES.length + (s ? ' · 📅 ' + plural(s, 'giorno', 'giorni') + ' in campo' : '') +
                (link ? '\n' + link : '');
        }

        return {
            START: START, GDG_START: GDG_START, NEED: NEED, GAMES: GAMES,
            romeDate: romeDate, addDays: addDays, itDate: itDate, number: number, gameNumber: gameNumber,
            status: status, count: count, good: good, streak: streak, best: best, shareText: shareText
        };
    })();

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    if (typeof document === 'undefined' || typeof QZ === 'undefined') return;

    /* =====================================================================
       Pagina
       ===================================================================== */
    var $ = QZ.$;
    var GG = QZ.giorno;
    function get(k) { return QZ.store.get(k, null); }
    var day = null;

    function fmtClock(ms) {
        var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        s = s % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function two(n) { return String(n).padStart(2, '0'); }

    function paint() {
        var ymd = Core.romeDate();
        day = ymd;
        var n = Core.number(ymd);
        var c = Core.count(get, ymd);
        var s = Core.streak(get, ymd);
        var b = Core.best(get, ymd);
        var lg = GG.long(ymd);
        $('#o-date').textContent = lg.charAt(0).toUpperCase() + lg.slice(1);
        $('#o-n').textContent = n ? two(n) : '--';
        $('#o-done').innerHTML = c + '<small>/' + Core.GAMES.length + '</small>';
        $('#o-streak').textContent = two(s);
        $('#o-streak').classList.toggle('led--green', Core.good(get, ymd));
        var need = Math.max(0, Core.NEED - c);
        $('#o-goal').textContent = !n
            ? 'Il Giornale esce dal ' + Core.itDate(Core.START) + ': da quel giorno ogni giornata con almeno ' + Core.NEED + ' giochi chiusi allunga la serie. Intanto c\'è il Calciatore del Giorno.'
            : need ? (need === Core.NEED ? 'Chiudi ' + Core.NEED + ' giochi su ' + Core.GAMES.length : 'Ancora ' + need + (need === 1 ? ' gioco' : ' giochi')) + ' e oggi è un giorno in campo' + (s ? ': la serie passa a ' + (s + 1) + '.' : '.')
                : c === Core.GAMES.length ? 'Giornale finito: tutti e quattro chiusi. Domani si ricomincia, alla stessa ora.'
                    : 'Oggi sei in campo: la serie è al sicuro. Il quarto, se vuoi, vale per la gloria.';
        $('#o-best').textContent = b > s ? 'Record: ' + b + (b === 1 ? ' giorno' : ' giorni') + ' di fila.' : '';
        $('#o-list').innerHTML = Core.GAMES.map(function (g) {
            var st = Core.status(g.id, get, ymd);
            var done = st.state === 'done';
            var label = st.state === 'soon' ? 'In arrivo' : done ? 'Rivedi' : st.state === 'play' ? 'Riprendi' : 'Gioca';
            return '<li class="og-item' + (done ? ' is-done' : '') + (st.state === 'soon' ? ' is-soon' : '') + '" style="--c:' + g.color + '">' +
                '<span class="og-check" aria-hidden="true">' + (done ? QZ.icon('check') : '') + '</span>' +
                '<div class="og-body">' +
                '<span class="og-name">' + QZ.icon(g.icon) + QZ.esc(g.name) + (st.n ? ' <span class="og-num">N° ' + st.n + '</span>' : '') + '</span>' +
                '<span class="og-desc">' + QZ.esc(done ? st.text : st.text || g.desc) + '</span>' +
                (done ? '<span class="og-line" aria-hidden="true">' + QZ.esc(st.line) + '</span>' : '') +
                '<span class="sr-only">' + (done ? 'Fatto.' : st.state === 'play' ? 'In corso.' : st.state === 'soon' ? 'Non ancora disponibile.' : 'Da giocare.') + '</span>' +
                '</div>' +
                (st.state === 'soon' ? '<span class="og-soon">' + QZ.esc(st.text) + '</span>'
                    : '<a class="btn ' + (done ? '' : 'btn--primary') + ' og-go" href="' + g.file + '">' + label + QZ.icon('arrow') + '</a>') +
                '</li>';
        }).join('');
        $('#o-share').disabled = !c;
        tick();
    }

    function tick() {
        if (Core.romeDate() !== day) { paint(); return; }
        $('#o-next').textContent = fmtClock(GG.msToNext());
    }

    $('#o-share').innerHTML = QZ.icon('share') + 'Condividi il Giornale';
    $('#o-share').addEventListener('click', function () {
        var url = window.location.origin + window.location.pathname;
        QZ.share(Core.shareText(get, Core.romeDate(), url), 'Quizzotti · Il Giornale di oggi');
    });
    $('#o-rules').innerHTML = [
        ['Quattro giochi al giorno,', 'uguali per tutti: stesso calciatore, stessa scheda, stessi round, stesse coppie.'],
        ['Si gioca una volta sola.', 'Le caselle si spuntano da sole quando chiudi una partita del giorno.'],
        ['Tre su quattro', 'e la giornata vale: la serie dei giorni in campo si allunga di uno. Salti un giorno e si riparte da zero.'],
        ['A mezzanotte', 'di Roma esce il Giornale nuovo. Il riepilogo con le emoji lo mandi al gruppo.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    paint();
    setInterval(tick, 1000);
    // un gioco chiuso in un'altra scheda, o il ritorno sulla pagina: si rilegge tutto
    window.addEventListener('storage', function () { paint(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) paint(); });
    window.addEventListener('pageshow', function () { paint(); });
})();
