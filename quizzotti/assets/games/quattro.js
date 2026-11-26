/* ==========================================================================
   QUIZZOTTI v2 — Quattro per Quattro
   Dati: assets/db-quattro.js (`quattroSchede`), schede fisse e numerate.
   Sedici nomi, quattro gruppi nascosti da quattro, difficolta' da 1 a 4
   (verde, ambra, blu, rosso). Si scelgono quattro caselle e si conferma:
   gruppo giusto = striscia colorata; tre su quattro = "Ne manca uno!";
   quattro errori e la scheda e' persa. Ogni scheda si gioca una volta:
   il risultato resta salvato per numero (qz.quattro.v1) e si rivede.
   Scheda del giorno: dal 27 novembre 2026 ogni giorno (data di Roma) una
   delle schede, uguale per tutti e con le caselle nello stesso ordine,
   scelta da un giro mescolato a seme fisso: nessuna ripetizione finche' il
   giro non finisce. Si gioca a parte (qz.quattro.daily.v1, per data): le
   schede giocate normalmente non cambiano. Risultato a quadratini. La scheda
   del giorno si apre anche da QuattroPerQuattro.html?giorno (il Giornale di
   oggi), tiene i colori dei tentativi (rows, per i quadratini del Giornale) e
   a fine partita va alle Leghe: QZ.leagues.submit('quattro', N°, { win, mistakes, found }).
   Errata (quattroErrata in db-quattro.js): nelle schede pubblicate con un
   nome valido per due gruppi, la quaterna "alternativa" non e' un errore.

   La parte "Core" qui sotto non usa il DOM: i test la caricano con require().
   ========================================================================== */
/* global quattroSchede, quattroErrata */
(function () {
    'use strict';

    /* =====================================================================
       CORE (puro, testabile in Node)
       ===================================================================== */
    var Core = (function () {
        var START = '2026-11-27';      // giorno della prima scheda del giorno
        var SEED = 0x4C4C4E26;         // seme fisso dei giri
        var DAY = 86400000;
        var EMOJI = { 1: '🟩', 2: '🟨', 3: '🟦', 4: '🟥' };   // verde, giallo, blu, rosso
        /* Le schede che entrano nella rotazione, giro per giro (un giro = tutte
           le schede del mazzo, una al giorno, in ordine mescolato). Si possono
           aggiungere righe { dalGiro: G, schede: N } SOLO per giri non ancora
           cominciati, cosi' i giorni gia' passati non cambiano. */
        var ROTAZIONI = [{ dalGiro: 0, schede: 100 }];

        var fmtDate = null, fmtTime = null;
        /** Data a Roma come 'AAAA-MM-GG' (Europe/Rome, ora legale compresa). */
        function romeDate(d) {
            d = d || new Date();
            if (!fmtDate) fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
            var o = {};
            fmtDate.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
            return o.year + '-' + o.month + '-' + o.day;
        }
        function utcOf(ymd) {
            var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
            return Date.UTC(+m[1], +m[2] - 1, +m[3]);
        }
        function ymdOf(d) { return typeof d === 'string' ? d : romeDate(d); }
        /** Giorni passati dal 27 novembre 2026 (0 = quel giorno; negativo prima). Date o 'AAAA-MM-GG'. */
        function dayIndex(d) { return Math.round((utcOf(ymdOf(d)) - utcOf(START)) / DAY); }
        /** Numero della scheda del giorno come la vede il giocatore (N° 1 il 27/11/2026; prima del via vale 1). */
        function dailyNumber(d) { return Math.max(0, dayIndex(d)) + 1; }
        /** Data della scheda del giorno N° num, 'AAAA-MM-GG'. */
        function dateOf(num) { return new Date(utcOf(START) + (Math.max(1, num) - 1) * DAY).toISOString().slice(0, 10); }
        /** 'AAAA-MM-GG' -> 'GG/MM/AAAA'. */
        function itDate(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4); }

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
        function shuffleWith(arr, r) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(r() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }
        function hash(s) {
            var h = 2166136261;
            for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
            return h >>> 0;
        }

        function poolFor(g) {
            var n = ROTAZIONI[0].schede;
            ROTAZIONI.forEach(function (r) { if (g >= r.dalGiro) n = r.schede; });
            return n;
        }
        var giri = {};
        /** Il giro numero g: i numeri di scheda 1..N mescolati. Tra un giro e l'altro la stessa scheda non capita due giorni di fila. */
        function giro(g) {
            if (giri[g]) return giri[g];
            var a = [];
            for (var i = 1; i <= poolFor(g); i++) a.push(i);
            shuffleWith(a, rng((SEED + Math.imul(g + 1, 0x9E3779B1)) >>> 0));
            if (g > 0 && a.length > 1) {
                var prev = giro(g - 1);
                if (a[0] === prev[prev.length - 1]) { var t = a[0]; a[0] = a[1]; a[1] = t; }
            }
            giri[g] = a;
            return a;
        }
        /** Il numero (n) della scheda del giorno per una data (Date o 'AAAA-MM-GG'); prima del via, quella del primo giorno. */
        function dailyIndex(d) {
            var k = Math.max(0, dayIndex(d)), g = 0;
            while (k >= poolFor(g)) { k -= poolFor(g); g++; }
            return giro(g)[k];
        }

        /** Millisecondi alla prossima mezzanotte di Roma (giorni da 23 e 25 ore compresi). */
        function msToNext(now) {
            now = now || new Date();
            if (!fmtTime) fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
            var o = {};
            fmtTime.formatToParts(now).forEach(function (p) { o[p.type] = +p.value; });
            var ms = (86400 - (o.hour * 3600 + o.minute * 60 + o.second)) * 1000 - now.getMilliseconds();
            var today = romeDate(now), t = now.getTime();
            if (romeDate(new Date(t + ms)) === today) ms += 3600000;
            else if (romeDate(new Date(t + ms - 3600000)) !== today) ms -= 3600000;
            return Math.max(0, ms);
        }

        /** Le caselle della scheda del giorno: stesso ordine per tutti, diverso ogni giorno. */
        function dailyOrder(voci, ymd) { return shuffleWith(voci.slice(), rng(hash('qq|' + ymd))); }

        /** Serie di schede del giorno chiuse di fila fino a ymd (se oggi non e' ancora giocata, conta fino a ieri). */
        function dailyStreak(done, ymd) {
            var k = dayIndex(ymd), s = 0;
            if (!done[dateOf(k + 1)]) k--;
            for (; k >= 0; k--) {
                var d = done[dateOf(k + 1)];
                if (!d || !d.win) break;
                s++;
            }
            return s;
        }

        /**
         * Errata: la quaterna sel non e' il gruppo previsto ma ne soddisfa comunque l'etichetta?
         * Restituisce { gruppo, anche (i nomi "fuori posto" scelti), nota } oppure null.
         */
        function errataMatch(errata, p, sel) {
            var list = (errata && p && errata[p.n]) || [];
            for (var i = 0; i < list.length; i++) {
                var e = list[i], voci = p.gruppi[e.gruppo].voci;
                var ok = sel.length === 4 && sel.every(function (v) { return voci.indexOf(v) >= 0 || e.anche.indexOf(v) >= 0; });
                var extra = sel.filter(function (v) { return voci.indexOf(v) < 0; });
                if (ok && extra.length) return { gruppo: e.gruppo, anche: extra, nota: e.nota };
            }
            return null;
        }

        function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
        /**
         * Testo da condividere: niente nomi, solo i quadratini dei tentativi.
         * tries: array di array di difficolta' (1-4); opt.daily: { num, ymd } per la scheda del giorno.
         */
        function shareText(p, tries, found, mistakes, opt) {
            opt = opt || {};
            var rows = tries.map(function (t) { return t.map(function (d) { return EMOJI[d]; }).join(''); });
            var won = found === 4;
            var head = opt.daily
                ? 'Quattro per Quattro · Scheda del giorno N° ' + opt.daily.num + ' (' + itDate(opt.daily.ymd) + ')'
                : 'Quattro per Quattro N° ' + p.n + ' · ' + p.titolo;
            return head + '\n' + rows.join('\n') + '\n' +
                (won ? (mistakes ? 'Chiusa con ' + plural(mistakes, 'errore', 'errori') + '.' : 'Zero errori.') : 'Persa con ' + found + ' gruppi su 4.') +
                (opt.streak >= 2 ? ' Serie di ' + opt.streak + ' giorni.' : '') + ' Tu?';
        }

        return {
            START: START, SEED: SEED, ROTAZIONI: ROTAZIONI, EMOJI: EMOJI,
            romeDate: romeDate, dayIndex: dayIndex, dailyNumber: dailyNumber, dateOf: dateOf, itDate: itDate,
            giro: giro, poolFor: poolFor, dailyIndex: dailyIndex, msToNext: msToNext, dailyOrder: dailyOrder,
            dailyStreak: dailyStreak, errataMatch: errataMatch, shareText: shareText
        };
    })();

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    if (typeof document === 'undefined' || typeof QZ === 'undefined') return;

    var STORE_KEY = 'qz.quattro.v1';
    var DAILY_KEY = 'qz.quattro.daily.v1';      // scheda del giorno: { play: { data: partita }, done: { data: esito } }
    var ERRATA = typeof quattroErrata !== 'undefined' && quattroErrata ? quattroErrata : {};
    var FILTER_KEY = 'qz.quattro.filter';      // solo comodita': filtro e tema scelti nella lista
    var MAX_ERR = 4;
    var LIVELLO = { 1: 'facile', 2: 'medio', 3: 'difficile', 4: 'difficilissimo' };
    var TEMI = { 'serie-a': 'Serie A', azzurri: 'Azzurri', estero: 'Estero', storia: 'Storia', curiosita: 'Curiosità' };

    var SCHEDE = (typeof quattroSchede !== 'undefined' && Array.isArray(quattroSchede) ? quattroSchede : []).filter(function (p) {
        return p && Array.isArray(p.gruppi) && p.gruppi.length === 4;
    });
    var BY_N = {};
    SCHEDE.forEach(function (p) { BY_N[p.n] = p; });
    function scheda(n) { return BY_N[n] || null; }

    /** Progressi: { play: { n: partita in corso }, done: { n: esito } } */
    function getStore() {
        var x = QZ.store.get(STORE_KEY, null) || {};
        return { play: x.play || {}, done: x.done || {} };
    }
    function putStore(x) { QZ.store.set(STORE_KEY, x); }
    /** Scheda del giorno: stesso formato, ma per data ('AAAA-MM-GG'). Delle partite in corso si tiene solo quella di oggi. */
    function getDaily() {
        var x = QZ.store.get(DAILY_KEY, null) || {};
        return { play: x.play || {}, done: x.done || {} };
    }
    function putDaily(x) {
        var today = Core.romeDate();
        Object.keys(x.play).forEach(function (k) { if (k < Core.dateOf(Core.dailyNumber(today) - 1) && k !== (S && S.daily)) delete x.play[k]; });
        QZ.store.set(DAILY_KEY, x);
    }
    /** L'archivio giusto per la partita aperta: le schede o la scheda del giorno. */
    function storeOf(s) { return s && s.daily ? getDaily() : getStore(); }
    function putOf(s, x) { if (s && s.daily) putDaily(x); else putStore(x); }
    function keyOf(s) { return s.daily || s.n; }
    function today() {
        var ymd = Core.romeDate();
        // prima del via (27/11/2026) niente partita: solo l'annuncio
        if (Core.dayIndex(ymd) < 0) return { ymd: ymd, pre: true, p: null };
        return { ymd: ymd, num: Core.dailyNumber(ymd), p: scheda(Core.dailyIndex(ymd)) };
    }
    function nextOpen(after, st) {
        st = st || getStore();
        var list = SCHEDE.filter(function (p) { return !st.done[p.n]; });
        return list.filter(function (p) { return p.n > (after || 0); })[0] || list[0] || null;
    }
    function allVoci(p) { var a = []; p.gruppi.forEach(function (g) { a = a.concat(g.voci); }); return a; }
    function validPlay(p, x) {
        if (!x || !Array.isArray(x.order) || !Array.isArray(x.solved) || !Array.isArray(x.tries)) return false;
        var all = allVoci(p);
        return x.order.every(function (v) { return all.indexOf(v) >= 0; }) && x.order.length + x.solved.length * 4 === 16;
    }
    /** Partita salvata gia' finita (chiusa la pagina durante il finale, versioni vecchie): va registrata. */
    function endedPlay(x) { return (x.mistakes || 0) >= MAX_ERR || x.solved.length === 4; }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    /* =====================================================================
       STATO E MARKUP
       ===================================================================== */
    var $ = QZ.$;
    var S = null;
    var saved = QZ.store.get(FILTER_KEY, null) || {};
    var filter = ['all', 'todo', 'done'].indexOf(saved.f) >= 0 ? saved.f : 'all';
    var tema = TEMI[saved.t] ? saved.t : 'all';

    var gridEl = $('#qq-grid');
    var areaEl = $('#qq-area');
    var solvedEl = $('#qq-solved');

    $('#medal').innerHTML = QZ.icon('layers');
    $('#rules').innerHTML = [
        ['Sedici nomi, quattro gruppi.', 'Ogni nome sta in un gruppo solo, anche quando sembra stare bene in due: le trappole sono volute.'],
        ['Scegli quattro caselle', 'e premi «Conferma». Se il gruppo è giusto si chiude in una striscia con il legame scritto sopra.'],
        ['Tre su quattro?', 'Il tabellone ti avvisa: «Ne manca uno!». Ma vale comunque come errore. La stessa quaterna non te la conta due volte.'],
        ['Quattro errori', 'e la scheda è persa: i gruppi mancanti si scoprono da soli.'],
        ['Quattro colori:', 'verde il gruppo più facile, poi ambra, blu e rosso, il più cattivo. Ogni scheda si gioca una volta, uguale per tutti: puoi lasciarla a metà e riprenderla quando vuoi.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    $('#qq-shuffle').innerHTML = QZ.icon('shuffle') + 'Mescola';
    $('#qq-clear').innerHTML = QZ.icon('x') + 'Deseleziona';
    $('#qq-submit').innerHTML = QZ.icon('check') + 'Conferma';
    $('#qq-back').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#qq-back-2').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#qq-share-2').innerHTML = QZ.icon('share') + 'Condividi';
    $('#qq-shuffle').addEventListener('click', shuffle);
    $('#qq-clear').addEventListener('click', clearSel);
    $('#qq-submit').addEventListener('click', submit);
    $('#qq-back').addEventListener('click', backToList);
    $('#qq-back-2').addEventListener('click', backToList);
    $('#qq-share-2').addEventListener('click', function () {
        if (S && S.done) QZ.share(shareText(), 'Quizzotti · Quattro per Quattro');
    });
    $('#start-btn').addEventListener('click', function () {
        var nx = nextOpen(0);
        if (nx) open(nx.n);
    });
    $('#qq-cards').addEventListener('click', function (e) {
        var b = e.target.closest('[data-n]');
        if (b) open(Number(b.dataset.n));
    });
    function saveFilter() { QZ.store.set(FILTER_KEY, { f: filter, t: tema }); }
    QZ.segmented($('#qq-filter'), [
        { value: 'all', label: 'Tutte' }, { value: 'todo', label: 'Da giocare' }, { value: 'done', label: 'Giocate' }
    ], filter, function (v) { filter = v; saveFilter(); paintIntro(); });
    QZ.segmented($('#qq-temi'), [{ value: 'all', label: 'Ogni tema' }].concat(Object.keys(TEMI).map(function (k) {
        return { value: k, label: TEMI[k] };
    })), tema, function (v) { tema = v; saveFilter(); paintIntro(); });
    $('#qq-filter').setAttribute('aria-label', 'Mostra le schede');
    $('#qq-temi').setAttribute('aria-label', 'Filtra per tema');

    /* ---------- La scheda del giorno (riquadro sopra le schede) ---------- */
    var dailyEl = document.createElement('section');
    dailyEl.className = 'card card--glow mt-4 qq-daily';
    dailyEl.setAttribute('aria-labelledby', 'qq-daily-t');
    dailyEl.style.cssText = 'display:grid;gap:10px;padding:18px 20px;border-top:3px solid var(--led)';
    dailyEl.innerHTML =
        '<p class="eyebrow" id="qq-daily-eyebrow"></p>' +
        '<h2 id="qq-daily-t" style="font-size:24px;margin:0"></h2>' +
        '<p class="muted" id="qq-daily-txt" style="margin:0"></p>' +
        '<div class="row" style="--gap:8px"><button type="button" class="btn btn--primary" id="qq-daily-btn"></button>' +
        '<button type="button" class="btn" id="qq-daily-share" hidden></button></div>' +
        '<p class="small muted" id="qq-daily-next" style="margin:0"></p>';
    var sheetsEl = $('.qq-sheets');
    if (sheetsEl && sheetsEl.parentNode) sheetsEl.parentNode.insertBefore(dailyEl, sheetsEl);
    $('#qq-daily-share').innerHTML = QZ.icon('share') + 'Condividi';
    $('#qq-daily-btn').addEventListener('click', function () { openDaily(); });
    $('#qq-daily-share').addEventListener('click', function () {
        var t = today(), d = getDaily().done[t.ymd];
        if (d && t.p) QZ.share(dailyShare(t, d), 'Quizzotti · Quattro per Quattro');
    });
    function dailyShare(t, d) {
        return Core.shareText(t.p, (d.tries || []).map(function (x) { return x.map(function (gi) { return t.p.gruppi[gi].d; }); }),
            d.solved.length, d.mistakes, { daily: { num: t.num, ymd: t.ymd }, streak: Core.dailyStreak(getDaily().done, t.ymd) });
    }
    function openDaily() {
        var t = today();
        if (t.p) open(t.p.n, t.ymd);
    }
    var dailyDay = null;
    function paintDaily() {
        var t = today();
        dailyDay = t.ymd;
        dailyEl.hidden = !t.p && !t.pre;
        $('#qq-daily-btn').hidden = !t.p;
        if (t.pre) {
            $('#qq-daily-eyebrow').innerHTML = QZ.icon('calendar') + 'Scheda del giorno';
            $('#qq-daily-t').textContent = 'Dal ' + Core.itDate(Core.START) + ', una al giorno';
            $('#qq-daily-txt').textContent = 'Ogni giorno una scheda uguale per tutti, con le caselle nello stesso ordine: la giochi e confronti i quadratini con gli amici.';
            $('#qq-daily-share').hidden = true;
            paintCountdown();
            return;
        }
        if (!t.p) return;
        var dd = getDaily(), d = dd.done[t.ymd], play = !d && validPlay(t.p, dd.play[t.ymd]) ? dd.play[t.ymd] : null;
        var streak = Core.dailyStreak(dd.done, t.ymd);
        var already = getStore().done[t.p.n];
        $('#qq-daily-eyebrow').innerHTML = QZ.icon('calendar') + 'Scheda del giorno · ' + Core.itDate(t.ymd);
        $('#qq-daily-t').textContent = 'N° ' + t.num + ' del giorno · ' + t.p.titolo;
        var txt;
        if (d) txt = d.win ? 'Oggi l\'hai chiusa ' + (d.mistakes ? 'con ' + plural(d.mistakes, 'errore', 'errori') : 'senza errori') + '.' : 'Oggi ti è sfuggita: ' + plural(d.solved.length, 'gruppo trovato', 'gruppi trovati') + ' su quattro.';
        else if (play) txt = 'In corso: ' + play.solved.length + ' gruppi su 4, ' + plural(play.mistakes || 0, 'errore', 'errori') + '.';
        else txt = 'Tema ' + (TEMI[t.p.tema] || '') + ', è il N° ' + t.p.n + ' dell\'elenco. Uguale per tutti, caselle nello stesso ordine: poi confronti i quadratini.' +
            (already ? ' L\'hai già giocata dall\'elenco: vale lo stesso, ma stavolta parti avvantaggiato.' : '');
        if (streak) txt += ' Serie del giorno: ' + streak + '.';
        $('#qq-daily-txt').textContent = txt;
        $('#qq-daily-btn').innerHTML = (d ? 'Rivedi la scheda del giorno' : play ? 'Riprendi la scheda del giorno' : 'Gioca la scheda del giorno') + QZ.icon('arrow');
        $('#qq-daily-share').hidden = !d || !(d.tries || []).length;
        paintCountdown();
    }
    function paintCountdown() {
        var ms = Core.msToNext(), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
        var k = Core.dayIndex(Core.romeDate());
        $('#qq-daily-next').textContent = k < -1 ? '' : (k < 0 ? 'Si comincia tra ' : 'La prossima tra ') + (h ? h + ' h ' : '') + m + ' min.';
    }
    setInterval(function () {
        if (S) return;
        if (Core.romeDate() !== dailyDay) paintIntro(); else paintCountdown();
    }, 30000);

    paintIntro();
    // dal Giornale di oggi (QuattroPerQuattro.html?giorno): si apre subito la scheda del giorno
    if (/[?&]giorno(=|&|$)/.test(window.location.search)) setTimeout(function () { if (!S) openDaily(); }, 200);

    // schede giocate in un'altra scheda del browser: la lista si aggiorna
    window.addEventListener('storage', function (e) {
        if (e.key !== STORE_KEY && e.key !== DAILY_KEY && e.key !== null) return;
        if (!S) paintIntro();
    });

    /* ---------- Statistiche dalla cronologia ---------- */
    function stats(st) {
        var done = SCHEDE.map(function (p) { return st.done[p.n]; }).filter(Boolean);
        var won = done.filter(function (d) { return d.win; });
        var perfect = won.filter(function (d) { return !d.mistakes; }).length;
        // serie: schede chiuse di fila, nell'ordine in cui sono state giocate
        var byDate = done.slice().sort(function (a, b) { return (a.date || 0) - (b.date || 0); });
        var cur = 0, best = 0;
        byDate.forEach(function (d) { cur = d.win ? cur + 1 : 0; if (cur > best) best = cur; });
        return { played: done.length, won: won.length, perfect: perfect, streak: cur, best: best };
    }

    /* ---------- La copertina: le schede ---------- */
    function paintIntro() {
        paintDaily();
        var st = getStore();
        var s = stats(st);
        $('#qq-count').textContent = s.played + '/' + SCHEDE.length;
        $('#qq-count-sr').textContent = s.played + ' schede giocate su ' + SCHEDE.length + ', ' + s.won + ' chiuse';
        var nx = nextOpen(0, st);
        var btn = $('#start-btn');
        btn.hidden = !nx;
        if (nx) btn.innerHTML = (validPlay(nx, st.play[nx.n]) ? 'Riprendi il N° ' : 'Gioca il N° ') + nx.n + QZ.icon('arrow');
        $('#start-record').textContent = !SCHEDE.length ? 'Le schede sono ancora in tipografia: riprova tra poco.'
            : !nx ? 'Tutte le schede giocate: ' + s.won + ' chiuse su ' + SCHEDE.length + '. Nuove schede in arrivo.'
                : s.played ? 'Fin qui: ' + s.won + ' chiuse e ' + (s.played - s.won) + ' perse su ' + plural(s.played, 'scheda giocata', 'schede giocate') + '.' : '';

        var statsEl = $('#qq-stats');
        statsEl.hidden = !s.played;
        if (s.played) {
            statsEl.innerHTML = [
                ['Chiuse', Math.round(s.won / s.played * 100) + '%'],
                ['Perfette', s.perfect],
                ['Serie', s.streak],
                ['Serie record', s.best]
            ].map(function (x) {
                return '<div class="stat"><div class="stat__label">' + x[0] + '</div><div class="stat__value">' + x[1] + '</div></div>';
            }).join('');
            statsEl.setAttribute('aria-label', 'Chiuse il ' + Math.round(s.won / s.played * 100) + ' per cento delle schede giocate, ' +
                plural(s.perfect, 'perfetta', 'perfette') + ', serie aperta ' + s.streak + ', serie record ' + s.best + '.');
        }

        var list = SCHEDE.filter(function (p) {
            return (filter === 'all' || (filter === 'done' ? !!st.done[p.n] : !st.done[p.n])) && (tema === 'all' || p.tema === tema);
        });
        if (!list.length) {
            $('#qq-cards').innerHTML = '<li class="muted qq-empty">' + (filter === 'done' ? 'Ancora nessuna scheda giocata qui. Il fischio d\'inizio aspetta te.'
                : filter === 'todo' ? 'Le hai giocate tutte. Chapeau.' : 'Nessuna scheda con questo tema.') + '</li>';
            return;
        }
        $('#qq-cards').innerHTML = list.map(function (p, i) {
            var d = st.done[p.n], play = !d && validPlay(p, st.play[p.n]) ? st.play[p.n] : null;
            var cls, status, dots = '';
            if (d) {
                cls = d.win ? 'is-win' : 'is-lost';
                status = d.win ? (d.mistakes ? 'Chiusa' : 'Perfetta') : 'Persa';
                dots = p.gruppi.map(function (g, gi) {
                    return '<i class="' + (d.solved.indexOf(gi) >= 0 ? 'd' + g.d : '') + '"></i>';
                }).join('');
            } else if (play) {
                cls = 'is-play';
                status = 'In corso';
                dots = p.gruppi.map(function (g, gi) { return '<i class="' + (play.solved.indexOf(gi) >= 0 ? 'd' + g.d : '') + '"></i>'; }).join('');
            } else {
                cls = 'is-new';
                status = 'Nuova';
            }
            var label = 'Scheda numero ' + p.n + ', ' + (TEMI[p.tema] || '') + ': ' + p.titolo + '. ' + status +
                (d ? (d.win ? ', ' + plural(d.mistakes, 'errore', 'errori') : ', ' + d.solved.length + ' gruppi su 4') + '. Rivedi la soluzione'
                    : play ? ', ' + play.solved.length + ' gruppi su 4, ' + plural(play.mistakes || 0, 'errore', 'errori') + '. Riprendi' : '. Gioca');
            return '<li style="--i:' + i + '"><button type="button" class="qq-card ' + cls + '" data-n="' + p.n + '" aria-label="' + QZ.esc(label) + '">' +
                '<span class="qq-card__top"><span class="qq-card__n">N° ' + p.n + '</span><span class="qq-card__status">' + status + '</span></span>' +
                '<span class="qq-card__tema">' + QZ.esc(TEMI[p.tema] || '') + '</span>' +
                '<span class="qq-card__title">' + QZ.esc(p.titolo) + '</span>' +
                (dots ? '<span class="qq-card__dots" aria-hidden="true">' + dots + '</span>' : '') +
                '</button></li>';
        }).join('');
    }

    function backToList() {
        if (S && !S.done) save();
        var n = S ? S.n : null, wasDaily = !!(S && S.daily);
        S = null;
        paintIntro();
        QZ.show('s-start');
        if (n != null) {
            setTimeout(function () {
                if (S) return;
                var b = wasDaily ? $('#qq-daily-btn') : $('.qq-card[data-n="' + n + '"]');
                if (b) { b.scrollIntoView({ block: 'center' }); b.focus({ preventScroll: true }); }
            }, QZ.reducedMotion() ? 60 : 280);
        }
    }

    /* =====================================================================
       FLUSSO
       ===================================================================== */
    /** Apre la scheda n; con daily ('AAAA-MM-GG') la apre come scheda del giorno, salvata a parte. */
    function open(n, daily) {
        if (S && S.busy) return;
        var p = scheda(n);
        if (!p) return;
        var group = {};
        p.gruppi.forEach(function (g, gi) { g.voci.forEach(function (v) { group[v] = gi; }); });
        S = { n: n, p: p, group: group, sel: [], done: false, busy: false, review: null, daily: daily || null };
        if (daily) S.num = Core.dailyNumber(daily);
        var key = keyOf(S);
        var st = storeOf(S);
        if (!st.done[key] && validPlay(p, st.play[key]) && endedPlay(st.play[key])) {
            // la partita era finita ma il risultato non era stato scritto: lo si registra ora
            var y = st.play[key];
            S.order = y.order.slice(); S.solved = y.solved.slice(); S.mistakes = y.mistakes || 0; S.tries = y.tries.slice(); S.guessed = (y.guessed || []).slice();
            commit(S.solved.length === 4);
            st = storeOf(S);
        }
        if (st.done[key]) {
            var d = st.done[key];
            S.done = true;
            S.review = d;
            S.solved = d.solved.slice();
            S.mistakes = d.mistakes;
            S.tries = d.tries || [];
            S.order = [];
        } else if (validPlay(p, st.play[key])) {
            var x = st.play[key];
            S.order = x.order.slice();
            S.solved = x.solved.slice();
            S.mistakes = x.mistakes || 0;
            S.tries = x.tries.slice();
            S.guessed = (x.guessed || []).slice();
        } else {
            S.order = daily ? Core.dailyOrder(allVoci(p), daily) : QZ.shuffle(allVoci(p));
            S.solved = [];
            S.mistakes = 0;
            S.tries = [];
            S.guessed = [];
        }
        $('#qq-title').textContent = (daily ? 'Scheda del giorno N° ' + S.num + ' · ' + Core.itDate(daily) + ' · ' : 'N° ' + p.n + ' · ') + (TEMI[p.tema] || '') + ' · ' + p.titolo;
        $('#qq-n').textContent = 'N° ' + p.n;
        $('#qq-actions').hidden = S.done;
        $('#qq-back').hidden = S.done;
        $('#qq-kbd').hidden = S.done;
        $('#qq-review').hidden = !S.done;
        solvedEl.innerHTML = '';
        QZ.$$('.qz-stamp', areaEl).forEach(function (x) { x.remove(); });
        if (S.done) {
            S.solved.forEach(function (gi) { addStrip(gi, false, true); });
            p.gruppi.forEach(function (g, gi) { if (S.solved.indexOf(gi) < 0) addStrip(gi, true, true); });
            var d2 = S.review;
            var chi = daily ? 'La scheda del giorno' : 'Il N° ' + p.n;
            $('#qq-review-txt').innerHTML = QZ.esc(d2.win
                ? chi + ' l\'hai chius' + (daily ? 'a ' : 'o ') + (d2.mistakes ? 'con ' + plural(d2.mistakes, 'errore', 'errori') : 'senza nemmeno un errore') + '. ' + (daily ? 'Domani ne arriva un\'altra' : 'Ogni scheda si gioca una volta sola') + ': qui resta la soluzione, con i tuoi tentativi.'
                : chi + ' ti è sfuggit' + (daily ? 'a' : 'o') + ': ' + plural(d2.solved.length, 'gruppo trovato', 'gruppi trovati') + ' su quattro. Le strisce tratteggiate sono quelle scoperte dal tabellone.') +
                triesHTML(S.tries, p);
            $('#qq-share-2').hidden = !S.tries.length;
            $('#qq-hint').textContent = '';
        } else {
            S.solved.forEach(function (gi) { addStrip(gi, false, true); });
            $('#qq-hint').textContent = S.solved.length || S.mistakes ? 'Si riparte da dove avevi lasciato.' : 'Scegli quattro caselle che hanno qualcosa in comune.';
            QZ.sound.start();
        }
        renderGrid();
        paintBoard();
        QZ.show('s-game');
        if (!S.done) save();
        requestAnimationFrame(fitTiles);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTiles);
        var cur = S;
        setTimeout(function () {
            if (S !== cur) return;
            fitTiles();
            if (S.done) $('#qq-back-2').focus({ preventScroll: true });
            else if (matchMedia('(pointer: fine)').matches) { var t = $('.qq-tile', gridEl); if (t) t.focus({ preventScroll: true }); }
        }, QZ.reducedMotion() ? 60 : 300);
    }

    /* ---------- Caselle ---------- */
    /** Ogni nome sta nella sua casella senza spezzare le parole: si stringe il carattere finche' non entra. */
    function fitTiles() {
        if (!gridEl.clientWidth) return;          // schermata ancora nascosta: si misura dopo
        var tiles = QZ.$$('.qq-tile', gridEl);
        // prima si azzera tutto e poi si misura: una sola ricostruzione della pagina per partire
        tiles.forEach(function (b) { b.style.fontSize = ''; b.classList.remove('is-tight'); });
        tiles.forEach(function (b) {
            var t = b.firstChild;
            var size = parseFloat(getComputedStyle(b).fontSize);
            var room = b.clientWidth - 4, roomH = b.clientHeight - 6;
            while (size > 11 && (t.scrollWidth > room || t.offsetHeight > roomH)) {
                size -= 0.5;
                b.style.fontSize = size + 'px';
            }
            // ultima spiaggia (telefoni stretti): meglio andare a capo dentro la parola che tagliarla
            if (t.scrollWidth > room) b.classList.add('is-tight');
        });
    }
    window.addEventListener('resize', function () { clearTimeout(fitTiles.t); fitTiles.t = setTimeout(fitTiles, 80); });
    function renderGrid() {
        gridEl.hidden = !S.order.length;
        gridEl.innerHTML = S.order.map(function (v, i) {
            var on = S.sel.indexOf(v) >= 0;
            return '<button type="button" class="qq-tile" data-i="' + i + '" aria-pressed="' + on + '"><span class="qq-tile__t" lang="it">' + QZ.esc(v) + '</span></button>';
        }).join('');
        fitTiles();
        paintActions();
    }
    function paintSel() {
        QZ.$$('.qq-tile', gridEl).forEach(function (b) {
            b.setAttribute('aria-pressed', String(S.sel.indexOf(S.order[Number(b.dataset.i)]) >= 0));
        });
        paintActions();
    }
    function paintActions() {
        if (!S || S.done) return;
        $('#qq-submit').disabled = S.sel.length !== 4 || S.busy;
        $('#qq-clear').disabled = !S.sel.length || S.busy;
        $('#qq-shuffle').disabled = S.busy;
        $('#qq-submit').setAttribute('aria-label', 'Conferma il gruppo (' + S.sel.length + ' su 4 scelte)');
    }

    gridEl.addEventListener('click', function (e) {
        var b = e.target.closest('.qq-tile');
        if (b) toggle(Number(b.dataset.i));
    });
    gridEl.addEventListener('keydown', function (e) {
        var b = e.target.closest('.qq-tile');
        if (!b || !S || S.done) return;
        var i = Number(b.dataset.i), n = S.order.length, to = -1;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (S.sel.length === 4 && S.sel.indexOf(S.order[i]) >= 0) submit();
            else toggle(i);
            return;
        }
        if (e.key === 'ArrowRight') to = Math.min(n - 1, i + 1);
        else if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
        else if (e.key === 'ArrowDown') to = i + 4 < n ? i + 4 : i;
        else if (e.key === 'ArrowUp') to = i - 4 >= 0 ? i - 4 : i;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = n - 1;
        if (to >= 0) {
            e.preventDefault();
            var t = $('.qq-tile[data-i="' + to + '"]', gridEl);
            if (t) t.focus();
        }
    });
    document.addEventListener('keydown', function (e) {
        if (!S || S.done || !$('#s-game').classList.contains('is-active') || document.querySelector('.qz-modal')) return;
        if (e.key === 'Escape' && S.sel.length) { e.preventDefault(); clearSel(); }
    });

    function toggle(i) {
        if (!S || S.done || S.busy) return;
        var v = S.order[i];
        if (v == null) return;
        var k = S.sel.indexOf(v);
        if (k >= 0) S.sel.splice(k, 1);
        else if (S.sel.length >= 4) {
            $('#qq-hint').textContent = 'Quattro alla volta: togline una prima di sceglierne un\'altra.';
            QZ.say('Hai già scelto quattro caselle.');
            QZ.fx.pop($('#qq-submit'));
            return;
        } else S.sel.push(v);
        QZ.sound.click();
        paintSel();
        var left = 4 - S.sel.length;
        $('#qq-hint').textContent = left ? (S.sel.length ? 'Ancora ' + (left === 1 ? 'una' : left) + '.' : 'Scegli quattro caselle che hanno qualcosa in comune.') : 'Quattro scelte: premi «Conferma».';
        if (!left) QZ.fx.pop($('#qq-submit'));
    }

    function clearSel() {
        if (!S || S.done || S.busy || !S.sel.length) return;
        S.sel = [];
        paintSel();
        $('#qq-hint').textContent = 'Selezione azzerata.';
        QZ.say('Selezione azzerata.');
    }

    function shuffle() {
        if (!S || S.done || S.busy) return;
        // le caselle gia' scelte restano scelte: si rimescola solo la posizione
        S.order = QZ.shuffle(S.order.slice());
        renderGrid();
        QZ.$$('.qq-tile', gridEl).forEach(function (b) { QZ.fx.replay(b, 'is-bump'); });
        QZ.sound.click();
        QZ.say('Caselle mescolate.');
        save();
    }

    /* ---------- Conferma ---------- */
    function submit() {
        if (!S || S.done || S.busy || S.sel.length !== 4) return;
        var key = S.sel.slice().sort().join('|');
        if (S.guessed.indexOf(key) >= 0) {
            QZ.toast('Questa quaterna l\'hai già provata. Niente errore, cambia qualcosa.', { icon: 'info', ms: 3000 });
            QZ.say('Combinazione già provata, non conta come errore.');
            return;
        }
        S.guessed.push(key);
        var gis = S.sel.map(function (v) { return S.group[v]; });
        S.tries.push(gis.slice());
        var count = {};
        gis.forEach(function (g) { count[g] = (count[g] || 0) + 1; });
        var best = -1, max = 0;
        Object.keys(count).forEach(function (g) { if (count[g] > max) { max = count[g]; best = Number(g); } });

        if (max === 4) {
            solve(best);
            return;
        }
        // errata: quaterna giusta per l'etichetta, ma la scheda pubblicata metteva un nome altrove
        var alt = Core.errataMatch(ERRATA, S.p, S.sel);
        if (alt) {
            S.tries.pop();
            var who = alt.anche.join(' e ');
            QZ.toast('Giusto anche così! ' + alt.nota + ' Ma in questa scheda ' + who + (alt.anche.length > 1 ? ' stanno' : ' sta') +
                ' in un altro gruppo: niente errore, cerca la quaterna prevista.', { icon: 'info', ms: 7000 });
            QZ.say('Combinazione valida anche questa, non conta come errore. ' + who + ' va in un altro gruppo.');
            $('#qq-hint').textContent = 'Niente errore: ' + who + (alt.anche.length > 1 ? ' vanno' : ' va') + ' in un altro gruppo.';
            save();
            return;
        }
        S.mistakes++;
        QZ.sound.wrong();
        QZ.vibrate(80);
        QZ.fx.shake(gridEl);
        paintBoard();
        var left = MAX_ERR - S.mistakes;
        var leftTxt = left ? (left === 1 ? ' Ultimo errore a disposizione.' : ' Ne restano ' + left + '.') : '';
        if (max === 3) {
            QZ.fx.stamp(areaEl, 'Ne manca uno!', 'ink', { size: 26, x: 50, y: 50, ms: 1300, quiet: true, say: 'Ne manca uno! Tre su quattro sono giuste.' + leftTxt });
            $('#qq-hint').textContent = 'Tre su quattro: una delle scelte è di troppo.' + leftTxt;
        } else {
            QZ.fx.stamp(areaEl, 'Fuori', 'bad', { size: 30, x: 50, y: 50, ms: 1100, quiet: true, say: 'Fuori: non è un gruppo.' + leftTxt });
            $('#qq-hint').textContent = 'Non è un gruppo.' + leftTxt;
        }
        if (S.mistakes >= MAX_ERR) { lose(); return; }
        save();
        // un attimo di pausa: il doppio tocco su «Conferma» non fa partire il toast "gia' provata"
        S.busy = true;
        paintActions();
        var cur = S;
        setTimeout(function () { if (S !== cur || cur.done) return; cur.busy = false; paintActions(); }, QZ.reducedMotion() ? 150 : 450);
    }

    function solve(gi) {
        var cur = S;
        S.busy = true;
        S.solved.push(gi);
        var g = S.p.gruppi[gi];
        var picked = S.sel.slice();
        // lo stato si aggiorna subito (e si salva): l'animazione e' solo di contorno
        S.order = S.order.filter(function (v) { return g.voci.indexOf(v) < 0; });
        S.sel = [];
        save();
        paintActions();
        QZ.sound.correct();
        QZ.$$('.qq-tile', gridEl).forEach(function (b) {
            if (picked.indexOf(b.textContent) >= 0) b.classList.add('is-out');
        });
        QZ.say('Gruppo giusto, livello ' + LIVELLO[g.d] + ': ' + g.nome + '. ' + g.voci.join(', ') + '.');
        var leftG = 4 - S.solved.length;
        $('#qq-hint').textContent = leftG ? 'Gol! ' + (leftG === 1 ? 'Ne resta uno.' : 'Ne restano ' + leftG + '.') : 'Tutti e quattro.';
        if (!leftG) win();
        setTimeout(function () {
            if (S !== cur) return;
            addStrip(gi, false);
            renderGrid();
            paintBoard();
            if (cur.done) return;
            cur.busy = false;
            paintActions();
            var t = $('.qq-tile', gridEl);
            if (t && matchMedia('(pointer: fine)').matches) t.focus({ preventScroll: true });
        }, QZ.reducedMotion() ? 0 : 320);
    }

    function addStrip(gi, given, quiet) {
        var g = S.p.gruppi[gi];
        var el = document.createElement('div');
        el.className = 'qq-strip d' + g.d + (given ? ' is-given' : '');
        if (quiet) el.style.animation = 'none';
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Gruppo ' + LIVELLO[g.d] + (given ? ', scoperto dal tabellone' : '') + ': ' + g.nome + '. ' + g.voci.join(', '));
        el.innerHTML = '<span class="qq-strip__name">' + QZ.esc(g.nome) + '</span><span class="qq-strip__voci">' + QZ.esc(g.voci.join(' · ')) + '</span>';
        solvedEl.appendChild(el);
    }

    function paintBoard() {
        $('#qq-groups').textContent = S.solved.length + '/4';
        var lives = '';
        for (var i = 0; i < MAX_ERR; i++) lives += '<i class="' + (i < S.mistakes ? 'is-off' : '') + '"></i>';
        var el = $('#qq-lives');
        el.innerHTML = lives;
        el.classList.toggle('is-last', !S.done && MAX_ERR - S.mistakes === 1);
        el.setAttribute('aria-label', plural(S.mistakes, 'errore', 'errori') + ' su ' + MAX_ERR);
    }

    function save() {
        if (!S || S.done) return;
        var st = storeOf(S), key = keyOf(S);
        if (st.done[key]) return;                 // chiusa nel frattempo in un'altra scheda
        st.play[key] = { order: S.order, solved: S.solved, mistakes: S.mistakes, tries: S.tries, guessed: S.guessed };
        if (S.daily) st.play[key].n = S.n;
        putOf(S, st);
    }

    /* =====================================================================
       FINE PARTITA
       ===================================================================== */
    /** Scrive l'esito (e gli XP) appena la partita finisce, prima delle animazioni:
        chi chiude la pagina o torna alle schede durante il finale non perde niente. */
    function commit(won) {
        if (S.committed) return;
        S.committed = true;
        S.done = true;
        var p = S.p, n = S.n, found = S.solved.length, err = S.mistakes;
        var ratio = won ? QZ.clamp(1 - err * 0.14, 0, 1) : found * 0.12;
        S.ratio = ratio;
        var st = storeOf(S), key = keyOf(S);
        var first = !st.done[key];
        delete st.play[key];
        if (first) {
            st.done[key] = { win: won, mistakes: err, solved: S.solved.slice(), tries: S.tries, ratio: Math.round(ratio * 1000) / 1000, date: Date.now() };
            if (S.daily) {
                st.done[key].n = n;
                // i colori dei tentativi: il Giornale di oggi fa i quadratini senza caricare le schede
                st.done[key].rows = S.tries.map(function (t) { return t.map(function (gi) { return p.gruppi[gi].d; }); });
            }
        }
        putOf(S, st);
        // Leghe tra amici: la scheda del giorno entra da sola in classifica (vale il primo risultato)
        if (first && S.daily && QZ.leagues) QZ.leagues.submit('quattro', S.num, { win: !!won, mistakes: err, found: found });
        S.rec = first ? QZ.profile.record('quattro', {
            xp: found * 8 + (won ? 30 : 0) + (won && !err ? 20 : 0),
            label: (S.daily ? 'Scheda del giorno N° ' + S.num + ' (' + Core.itDate(S.daily) + ')' : 'N° ' + n + ' ' + p.titolo) + ' · ' +
                (won ? 'chiusa con ' + plural(err, 'errore', 'errori') : 'persa, ' + found + '/4 gruppi'),
            score: Math.round(ratio * 100)
        }) : null;
    }

    function win() {
        var cur = S;
        commit(true);
        S.busy = true;
        $('#qq-actions').hidden = true;
        $('#qq-kbd').hidden = true;
        QZ.fx.stamp(areaEl, S.mistakes ? 'Gol!' : 'Perfetta!', 'ok', { size: 34, x: 50, y: 40, ms: 1400, say: 'Scheda chiusa.' });
        setTimeout(function () { if (S === cur) finish(true); }, QZ.reducedMotion() ? 300 : 1300);
    }

    function lose() {
        var cur = S;
        commit(false);
        S.busy = true;
        S.sel = [];
        paintSel();
        $('#qq-actions').hidden = true;
        $('#qq-kbd').hidden = true;
        $('#qq-hint').textContent = 'Quattro errori: il tabellone scopre i gruppi mancanti.';
        QZ.say('Quattro errori, scheda persa. Ecco i gruppi mancanti.');
        var rest = S.p.gruppi.map(function (g, gi) { return gi; }).filter(function (gi) { return S.solved.indexOf(gi) < 0; })
            .sort(function (a, b) { return S.p.gruppi[a].d - S.p.gruppi[b].d; });
        var step = QZ.reducedMotion() ? 0 : 650;
        rest.forEach(function (gi, k) {
            setTimeout(function () {
                if (S !== cur) return;
                var g = S.p.gruppi[gi];
                S.order = S.order.filter(function (v) { return g.voci.indexOf(v) < 0; });
                addStrip(gi, true);
                renderGrid();
            }, 500 + k * step);
        });
        setTimeout(function () { if (S === cur) finish(false); }, 900 + rest.length * step + (QZ.reducedMotion() ? 0 : 900));
    }

    function shareText() {
        var p = S.p;
        var tries = S.tries.map(function (t) { return t.map(function (gi) { return p.gruppi[gi].d; }); });
        return Core.shareText(p, tries, S.solved.length, S.mistakes, S.daily
            ? { daily: { num: S.num, ymd: S.daily }, streak: Core.dailyStreak(getDaily().done, S.daily) } : null);
    }

    function triesHTML(tries, p) {
        if (!tries || !tries.length) return '';
        return '<div class="qq-tries mt-2" aria-hidden="true">' + tries.map(function (t) {
            return '<div class="qq-tries__row">' + t.map(function (gi) { return '<i class="d' + p.gruppi[gi].d + '"></i>'; }).join('') + '</div>';
        }).join('') + '</div>';
    }

    function finish(won) {
        if (S.finished) return;
        S.finished = true;
        S.busy = false;
        var p = S.p, n = S.n, found = S.solved.length, err = S.mistakes;
        var st = getStore();
        var played = SCHEDE.filter(function (x) { return st.done[x.n]; }).length;
        var s = stats(st);
        var nx = S.daily ? null : nextOpen(n, st);
        var dstreak = S.daily ? Core.dailyStreak(getDaily().done, S.daily) : 0;

        var title, sub;
        if (won && !err) { title = 'Partita perfetta'; sub = 'Quattro gruppi, zero errori. Le trappole le hai viste arrivare da centrocampo.'; }
        else if (won && err < 3) { title = 'Gol!'; sub = 'Scheda chiusa con ' + plural(err, 'errore', 'errori') + '. Qualche brivido, ma il risultato è in cassaforte.'; }
        else if (won) { title = 'Al novantesimo'; sub = 'Chiusa con tre errori sul groppone: vittoria sporca, ma i tre punti contano uguale.'; }
        else if (found >= 2) { title = 'Fuori ai rigori'; sub = 'Ne hai trovati ' + found + ' su quattro. Gli altri sono qui sotto: occhio alle trappole, la prossima volta.'; }
        else if (found === 1) { title = 'Partita in salita'; sub = 'Un gruppo solo prima del quarto errore. La soluzione è qui sotto: studiala e torna in campo.'; }
        else { title = 'Notte fonda'; sub = 'Nessun gruppo trovato. Capita anche ai migliori: la soluzione è qui sotto.'; }
        if (S.daily) { if (won && dstreak >= 2) sub += ' Serie del giorno: ' + dstreak + ' di fila.'; }
        else if (won && s.streak >= 3) sub += ' E sono ' + s.streak + ' schede chiuse di fila' + (s.streak === s.best ? ': record personale.' : '.');

        var solHTML = '<div class="card qq-sol mt-3"><h2>Come è andata</h2>' +
            '<ul class="qq-legend" aria-hidden="true">' + [1, 2, 3, 4].map(function (d) { return '<li><i class="d' + d + '"></i>' + LIVELLO[d] + '</li>'; }).join('') + '</ul>' +
            triesHTML(S.tries, p) +
            '<p class="sr-only">' + QZ.esc(plural(S.tries.length, 'tentativo', 'tentativi') + ', ' + plural(err, 'errore', 'errori') + '.') + '</p>' +
            '<div class="stack" style="--gap:8px">' + p.gruppi.map(function (g, gi) {
                var mine = S.solved.indexOf(gi) >= 0;
                return '<div class="qq-strip d' + g.d + (mine ? '' : ' is-given') + '" style="animation:none"><span class="qq-strip__name">' + QZ.esc(g.nome) + '</span>' +
                    '<span class="qq-strip__voci">' + QZ.esc(g.voci.join(' · ')) + (mine ? '' : ' (scoperto)') + '</span></div>';
            }).join('') + '</div></div>';

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: won,
            icon: won ? 'trophy' : 'flag',
            title: title, subtitle: sub,
            record: S.rec, ratio: S.ratio,
            stats: [
                { label: 'Gruppi', value: found + '/4' },
                { label: 'Errori', value: err + '/' + MAX_ERR },
                { label: 'Tentativi', value: S.tries.length },
                S.daily ? { label: 'Serie', value: dstreak } : { label: 'Giocate', value: played + '/' + SCHEDE.length }
            ],
            extraHTML: solHTML,
            share: shareText(),
            retryLabel: 'Torna alle schede',
            onRetry: backToList,
            secondary: nx ? { label: 'Prossima: N° ' + nx.n, icon: 'arrow', onClick: function () { open(nx.n); } } : null
        });
        QZ.say((won ? 'Scheda chiusa' : 'Scheda persa') + ': ' + found + ' gruppi su 4, ' + plural(err, 'errore', 'errori') + '. ' +
            (S.daily ? 'Serie del giorno: ' + dstreak + '.' : 'Schede giocate: ' + played + ' su ' + SCHEDE.length + '.'));
    }
})();
