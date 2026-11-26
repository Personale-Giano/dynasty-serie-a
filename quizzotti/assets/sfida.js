/* ==========================================================================
   QUIZZOTTI v2 — Sfida un amico + giorni del Giornale
   Si carica dopo assets/qz.js, prima dello script del gioco. Due cose:

   1) «Sfida un amico» (Milionario, Caduta Libera, Sopra o Sotto, L'Intruso,
      Avanti un Altro). A fine partita un link fa giocare all'amico le stesse
      identiche domande, nello stesso ordine, con le risposte negli stessi posti:
        Gioco.html?sfida=SEME.REGOLE.ESTRATTE.PUNTEGGIO.NOME.FIRMA
      - SEME: base 36, guida tutto il caso della partita (ordine delle risposte,
        difficolta', coppie di Sopra o Sotto);
      - REGOLE: le impostazioni del gioco ([a-z0-9-], es. «25-7-10»);
      - ESTRATTE: le carte uscite al primo giocatore, come posizioni nel mazzo
        (due cifre base 36 l'una): la partita normale continua a pescare da
        QZ.Deck (niente ripetizioni tra una partita e l'altra), e l'amico
        rivede proprio quelle. Finite quelle, si pesca col seme;
      - PUNTEGGIO: intero, piu' alto e' meglio (ogni gioco sa come contarlo);
      - NOME: quello scelto dal giocatore, facoltativo, al massimo 16 caratteri;
      - FIRMA: impronta FNV-1a di tutto il resto, per non farsi cambiare il
        punteggio a mano (non e' sicurezza, e' buona educazione).
      La partita di sfida non tocca QZ.Deck, ne' record ne' statistiche del gioco.

   2) QZ.giorno: data di Roma, numero del giorno e mezzanotte di Roma per i
      giochi del giorno nuovi (Intruso e Sopra o Sotto del giorno, il Giornale
      di oggi), con il N° 1 il 27 novembre 2026 come la Scheda del giorno di
      Quattro per Quattro.

   La parte pura (Core) non usa il DOM: i test la caricano con require().
   ========================================================================== */
(function () {
    'use strict';

    var Core = (function () {
        var START = '2026-11-27';    // N° 1 dei giochi del giorno nuovi e del Giornale
        var DAY = 86400000;
        var NAME_MAX = 16;
        var LIST_MAX = 160;          // carte ricordate nel link (oltre si pesca col seme)

        /** FNV-1a a 32 bit. */
        function hash(s) {
            var h = 0x811c9dc5;
            s = String(s);
            for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
            return h >>> 0;
        }
        /** Generatore pseudo-casuale a seme (mulberry32): stesso seme, stessi numeri ovunque. */
        function rng(seed) {
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
        /** Copia mescolata con il generatore r (Fisher-Yates). */
        function shuffle(arr, r) {
            var a = arr.slice();
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(r() * (i + 1));
                var t = a[i]; a[i] = a[j]; a[j] = t;
            }
            return a;
        }

        /* ---------- Il link ---------- */
        function cleanName(s) {
            s = String(s == null ? '' : s).replace(/[^\p{L}\p{N} '-]/gu, '').replace(/\s+/g, ' ').trim();
            return s.slice(0, NAME_MAX).trim();
        }
        function cleanOpt(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40); }
        /** Larghezza fissa di una posizione nel mazzo, in cifre base 36. */
        function width(n) { return n > 1296 ? 3 : 2; }
        function packList(list, n) {
            var w = width(n);
            return (list || []).slice(0, LIST_MAX).map(function (i) { return ('00' + Math.max(0, i | 0).toString(36)).slice(-w); }).join('');
        }
        function unpackList(s, n) {
            var w = width(n), out = [];
            if (!s || s.length % w) return [];
            for (var i = 0; i < s.length; i += w) {
                var v = parseInt(s.slice(i, i + w), 36);
                if (!(v >= 0) || (n && v >= n)) return [];   // mazzo diverso: si gioca col seme e basta
                out.push(v);
            }
            return out;
        }
        function sign(game, body) { return hash('qzs|' + game + '|' + body).toString(36); }
        /**
         * d: { seed, opt, list (posizioni nel mazzo), n (carte nel mazzo), score, name }.
         * Restituisce il valore del parametro sfida (gia' pronto per l'indirizzo).
         */
        function encode(game, d) {
            var body = [(d.seed >>> 0).toString(36), cleanOpt(d.opt), packList(d.list, d.n || 0),
                String(Math.max(0, Math.round(Number(d.score) || 0))), encodeURIComponent(cleanName(d.name))].join('.');
            return body + '.' + sign(game, body);
        }
        /** Il contrario di encode; null se il link e' rovinato o ritoccato. n = carte nel mazzo (per la lista). */
        function decode(game, s, n) {
            if (typeof s !== 'string' || s.length > 900) return null;
            var p = s.split('.');
            if (p.length !== 6) return null;
            var body = p.slice(0, 5).join('.');
            if (sign(game, body) !== p[5]) return null;
            if (!/^[0-9a-z]{1,7}$/.test(p[0]) || !/^[a-z0-9-]*$/.test(p[1]) || !/^[0-9a-z]*$/.test(p[2]) || !/^\d{1,9}$/.test(p[3])) return null;
            var name = '';
            try { name = cleanName(decodeURIComponent(p[4])); } catch { name = ''; }
            return { seed: parseInt(p[0], 36) >>> 0, opt: p[1], list: unpackList(p[2], n), score: Number(p[3]), name: name };
        }
        /** Il parametro sfida grezzo da una query string (?a=1&sfida=...). */
        function param(search) {
            var m = /[?&]sfida=([^&#]*)/.exec(String(search || ''));
            return m ? m[1] : null;
        }
        /** 1 se a batte b, 0 pari, -1 se perde. */
        function cmp(a, b) { return a > b ? 1 : a < b ? -1 : 0; }

        /**
         * Una sorgente di carte con la stessa faccia di QZ.Deck (draw(filtro)):
         * - partita normale (ch null): pesca dal deck vero e si annota le posizioni;
         * - partita di sfida: prima le carte della lista, nell'ordine, poi col seme
         *   (rng), mai la stessa due volte, senza toccare il deck vero.
         */
        function source(deck, items, ch, r) {
            var pos = typeof Map === 'function' ? new Map() : null;
            if (pos) items.forEach(function (x, i) { pos.set(x, i); });
            var used = {};
            var src = { drawn: [], n: items.length };
            function note(x) {
                var i = pos ? pos.get(x) : items.indexOf(x);
                if (i != null && i >= 0) { src.drawn.push(i); used[i] = 1; }
                return x;
            }
            src.draw = function (filterFn) {
                if (!ch) {
                    var x = deck.draw(filterFn);
                    return x == null ? x : note(x);
                }
                var k = src.drawn.length;
                if (k < ch.list.length && items[ch.list[k]] && !used[ch.list[k]]) return note(items[ch.list[k]]);
                var cand = [];
                items.forEach(function (it, i) { if (!used[i] && (!filterFn || filterFn(it))) cand.push(it); });
                if (!cand.length) return null;
                return note(cand[Math.floor(r() * cand.length)]);
            };
            src.remaining = function (filterFn) {
                return items.filter(function (it, i) { return !used[i] && (!filterFn || filterFn(it)); }).length;
            };
            return src;
        }

        /* ---------- Giorni (ora di Roma) ---------- */
        var fmtDate = null, fmtTime = null;
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
        function ymdOf(d) { return typeof d === 'string' ? d : romeDate(d); }
        /** Giorni dal 27 novembre 2026 (0 quel giorno, negativo prima). */
        function dayIndex(d) { return Math.round((utcOf(ymdOf(d)) - utcOf(START)) / DAY); }
        /** N° del giorno (1 il 27/11/2026); 0 prima del via. */
        function dayNumber(d) { var k = dayIndex(d); return k < 0 ? 0 : k + 1; }
        function dateOf(n) { return new Date(utcOf(START) + (Math.max(1, n) - 1) * DAY).toISOString().slice(0, 10); }
        function addDays(ymd, k) { return new Date(utcOf(ymd) + k * DAY).toISOString().slice(0, 10); }
        function itDate(ymd) { return ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4); }
        /** Millisecondi alla prossima mezzanotte di Roma (giorni da 23 e 25 ore compresi). */
        function msToNext(now) {
            now = now || new Date();
            if (!fmtTime) fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
            var o = {};
            fmtTime.formatToParts(now).forEach(function (x) { o[x.type] = +x.value; });
            var ms = (86400 - (o.hour * 3600 + o.minute * 60 + o.second)) * 1000 - now.getMilliseconds();
            var today = romeDate(now), t = now.getTime();
            if (romeDate(new Date(t + ms)) === today) ms += 3600000;
            else if (romeDate(new Date(t + ms - 3600000)) !== today) ms -= 3600000;
            return Math.max(0, ms);
        }
        /** Seme del giorno per un gioco: uguale per tutti, diverso ogni giorno. */
        function daySeed(game, ymd) { return hash('qz-giorno|' + game + '|' + ymd); }

        return {
            START: START, NAME_MAX: NAME_MAX, LIST_MAX: LIST_MAX,
            hash: hash, rng: rng, newSeed: newSeed, shuffle: shuffle,
            cleanName: cleanName, cleanOpt: cleanOpt, packList: packList, unpackList: unpackList,
            encode: encode, decode: decode, param: param, cmp: cmp, source: source,
            romeDate: romeDate, dayIndex: dayIndex, dayNumber: dayNumber, dateOf: dateOf, addDays: addDays,
            itDate: itDate, msToNext: msToNext, daySeed: daySeed
        };
    })();

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    if (typeof document === 'undefined' || typeof QZ === 'undefined') return;

    /* =====================================================================
       Interfaccia
       ===================================================================== */
    var NAME_KEY = 'qz.sfida.nome';

    QZ.giorno = {
        START: Core.START, romeDate: Core.romeDate, dayIndex: Core.dayIndex, dayNumber: Core.dayNumber,
        dateOf: Core.dateOf, addDays: Core.addDays, itDate: Core.itDate, msToNext: Core.msToNext, seed: Core.daySeed,
        /** 'giovedì 27 novembre' */
        long: function (ymd) {
            return new Date(ymd + 'T12:00:00Z').toLocaleDateString('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
        },
        /** L'indirizzo ha ?giorno (arrivo dal Giornale di oggi)? */
        asked: function () { return /[?&]giorno(=|&|$)/.test(window.location.search); }
    };

    /** Toglie ?sfida e ?giorno dall'indirizzo: la condivisione non ripete link vecchi, ricaricando non si rigioca. */
    function cleanUrl() {
        try {
            if (window.history && window.history.replaceState && /[?&](sfida|giorno)(=|&|$)/.test(window.location.search)) {
                window.history.replaceState(null, '', window.location.pathname + window.location.hash);
            }
        } catch { /* niente: l'indirizzo resta com'e' */ }
    }

    /** La sfida arrivata col link, se c'e' ed e' buona; n = carte nel mazzo del gioco. */
    function read(game, n) {
        var raw = Core.param(window.location.search);
        if (raw == null) return null;
        var ch = Core.decode(game, raw, n);
        if (!ch) setTimeout(function () { QZ.toast('Link della sfida rovinato: si gioca una partita normale', { icon: 'x', type: 'bad' }); }, 600);
        return ch;
    }

    function link(game, d) {
        var l = window.location;
        return l.origin + l.pathname + '?sfida=' + Core.encode(game, d);
    }

    function who(ch) { return ch.name || 'Il tuo amico'; }

    /**
     * Il riquadro della sfida in copertina.
     * o: { ch, target (testo del punteggio da battere), rules (le regole della sfida), onPlay }
     */
    function intro(o) {
        var host = QZ.$('#s-start');
        if (!host) return null;
        var box = document.createElement('section');
        box.className = 'card card--glow qz-sfida';
        box.setAttribute('aria-labelledby', 'qz-sfida-t');
        box.style.cssText = 'display:grid;gap:10px;margin-bottom:18px;padding:18px 20px;border-top:3px solid var(--led)';
        box.innerHTML =
            '<p class="eyebrow" style="margin:0">' + QZ.icon('users') + '<span data-who></span></p>' +
            '<h2 id="qz-sfida-t" style="margin:0;font-size:clamp(22px,4vw,30px);line-height:1.1">Devi battere <span class="led" data-target style="font-size:1.1em"></span></h2>' +
            '<p class="muted" data-rules style="margin:0"></p>' +
            '<div class="row" style="--gap:8px"><button type="button" class="btn btn--primary btn--lg" data-play>Accetta la sfida' + QZ.icon('arrow') + '</button>' +
            '<button type="button" class="btn btn--ghost" data-no>Gioco per conto mio</button></div>';
        box.querySelector('[data-who]').textContent = (o.ch && o.ch.name ? 'La sfida di ' + o.ch.name : 'Ti hanno sfidato');
        box.querySelector('[data-target]').textContent = o.target;
        box.querySelector('[data-rules]').textContent = o.rules || '';
        box.querySelector('[data-play]').addEventListener('click', function () { if (o.onPlay) o.onPlay(); });
        box.querySelector('[data-no]').addEventListener('click', function () {
            box.remove();
            cleanUrl();
            if (o.onDecline) o.onDecline();
            var b = QZ.$('#start-btn');
            if (b) b.focus({ preventScroll: true });
        });
        host.insertBefore(box, host.firstChild);
        setTimeout(function () { var b = box.querySelector('[data-play]'); if (b && !QZ.$('.qz-modal')) b.focus({ preventScroll: true }); }, 80);
        return box;
    }

    /** Avviso a inizio partita. */
    function kickoff(ch, target) {
        QZ.toast(who(ch) + ' ha fatto ' + target + ': devi batterlo', { icon: 'users', ms: 2600 });
        QZ.say('Sfida: devi battere ' + target + '.');
    }

    /** Il verdetto della sfida, da mettere in cima a extraHTML del resoconto. */
    function verdictHTML(ch, mine, fmt) {
        var c = Core.cmp(mine, ch.score);
        var name = QZ.esc(who(ch));
        var title = c > 0 ? 'Hai battuto ' + name + '!' : c === 0 ? 'Pari con ' + name : name + ' resta davanti';
        var sub = c > 0 ? 'Tu ' + QZ.esc(fmt(mine)) + ', ' + name + ' ' + QZ.esc(fmt(ch.score)) + '. Adesso rimandagli la sfida.'
            : c === 0 ? 'Stesso punteggio: ' + QZ.esc(fmt(mine)) + '. Serve la bella.'
                : 'Tu ' + QZ.esc(fmt(mine)) + ', ' + name + ' ' + QZ.esc(fmt(ch.score)) + '. Stesse domande: niente scuse.';
        return '<div class="card mt-3 qz-sfida-end" role="status" style="display:grid;gap:6px;padding:16px 18px;text-align:center;border-color:' +
            (c > 0 ? 'var(--led-green)' : c === 0 ? 'var(--led)' : 'var(--led-red)') + '">' +
            '<span class="label">La sfida</span><b style="font-family:var(--font-led);font-size:clamp(24px,5vw,34px);color:' +
            (c > 0 ? 'var(--led-green)' : c === 0 ? 'var(--led)' : 'var(--led-red)') + '">' + title + '</b>' +
            '<span class="muted">' + sub + '</span></div>';
    }

    /**
     * Il bottone «Sfida un amico» nel resoconto (dopo QZ.results).
     * o: { game, title (nome del gioco), seed, opt, src (sorgente delle carte, facoltativa),
     *      score (intero), text(nome, link) -> testo da condividere }
     */
    function offer(host, o) {
        var acts = host && host.querySelector('.result__actions');
        if (!acts) return null;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--lg';
        b.innerHTML = QZ.icon('users') + 'Sfida un amico';
        var share = acts.querySelector('[data-share]');
        acts.insertBefore(b, share ? share.nextSibling : acts.lastChild);
        b.addEventListener('click', function () { ask(o); });
        return b;
    }

    function ask(o) {
        var node = QZ.el('<div class="stack" style="--gap:12px">' +
            '<p class="muted" style="margin:0">Gli mandi un link: giocherà le stesse identiche domande, nello stesso ordine, e saprà subito quanto deve fare per batterti.</p>' +
            '<div class="field"><label class="label" for="qz-sfida-nome">Il tuo nome (facoltativo)</label>' +
            '<input class="input" id="qz-sfida-nome" maxlength="' + Core.NAME_MAX + '" autocomplete="nickname" placeholder="Il Bomber"></div></div>');
        var input = node.querySelector('input');
        var saved = QZ.store.get(NAME_KEY, '');
        input.value = typeof saved === 'string' ? Core.cleanName(saved) : '';
        QZ.modal({
            title: 'Sfida un amico',
            node: node,
            actions: [
                { label: 'Annulla', ghost: true },
                {
                    label: 'Manda la sfida', primary: true, icon: 'share',
                    onClick: function () {
                        var name = Core.cleanName(input.value);
                        QZ.store.set(NAME_KEY, name);
                        var url = link(o.game, { seed: o.seed, opt: o.opt, list: o.src ? o.src.drawn : [], n: o.src ? o.src.n : 0, score: o.score, name: name });
                        cleanUrl();
                        // dentro il clic: il telefono apre la condivisione solo se la chiede un tocco
                        QZ.share(o.text(name, url), 'Quizzotti · ' + (o.title || 'Sfida'));
                    }
                }
            ],
            onOpen: function () { setTimeout(function () { input.focus(); }, 60); }
        });
        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            var btn = QZ.$$('.qz-modal__actions .btn--primary').pop();
            if (btn) btn.click();
        });
    }

    QZ.sfida = {
        Core: Core, rng: Core.rng, newSeed: Core.newSeed, shuffle: Core.shuffle, cmp: Core.cmp, source: Core.source,
        read: read, link: link, intro: intro, kickoff: kickoff, verdictHTML: verdictHTML, offer: offer, cleanUrl: cleanUrl
    };
})();
