/* ==========================================================================
   QUIZZOTTI v2 — Tutti contro la TV
   Il quiz da salotto: la TV fa le domande, i telefoni sono pulsantiere.
   Stanza condivisa: api/tuttitv.php (PHP sul sito, un file per stanza); le
   domande le sceglie il server da api/tuttitv-domande.json, e la risposta
   giusta arriva solo quando la domanda e' chiusa.
   Una pagina, tre modi:
     TuttiTV.html            copertina: crea la stanza o entra con il codice
     TuttiTV.html?tv=ABCD    la TV: QR, regole, domande, soluzioni, podio
     TuttiTV.html?s=ABCD     il telefono: nome, quattro bottoni, esito
   La TV e il primo giocatore entrato (il capitano) comandano la partita.
   Lo stato arriva per polling con versione: se non cambia, il server risponde
   {"u":1}. La velocita' si misura sull'orario del server, quindi il ritardo
   del polling non pesa sui punti.
   ========================================================================== */
/* global qrcode */
(function () {
    'use strict';

    var $ = QZ.$;
    var API = 'api/tuttitv.php';
    var PAGE = 'TuttiTV.html';
    var LETTERS = ['A', 'B', 'C', 'D'];

    /** Gli imprevisti: gli id sono quelli di TV_TWISTS in api/tuttitv-core.php. */
    var TWISTS = {
        doppi: { name: 'Punti doppi', icon: 'star', text: 'La prossima domanda vale il doppio: fino a 2.000 punti.', short: 'vale doppio' },
        tuttoniente: { name: 'Tutto o niente', icon: 'bomb', text: 'Giusta vale doppio. Sbagliata costa 500 punti. Chi non risponde non perde niente.', short: 'chi sbaglia perde 500' },
        rubapunti: { name: 'Rubapunti', icon: 'coins', text: 'Il più veloce a rispondere giusto ruba 200 punti al primo in classifica.', short: 'il più veloce ruba 200' },
        lampo: { name: 'Domanda lampo', icon: 'zap', text: 'Solo 5 secondi. Chi risponde giusto prende 1.000 punti tondi.', short: '5 secondi, 1.000 punti' },
        rimonta: { name: 'La rimonta', icon: 'flame', text: 'Chi sta nella seconda metà della classifica prende il triplo dei punti.', short: 'triplo a chi insegue' }
    };

    var params = new window.URLSearchParams(location.search);
    var mode = params.get('s') ? 'phone' : params.get('tv') ? 'tv' : 'start';
    var code = String(params.get('s') || params.get('tv') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

    /* ---------- Gettoni: uno per telefono, uno per TV e stanza ---------- */
    function newTok() {
        var a = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(a);
        return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    var tok = '';
    if (mode === 'phone') {
        tok = QZ.store.get('qz.tt.tok', '');
        if (!/^[a-f0-9]{32}$/.test(tok)) { tok = newTok(); QZ.store.set('qz.tt.tok', tok); }
    } else if (mode === 'tv') {
        tok = QZ.store.get('qz.tt.host.' + code, '');
    }

    /* ---------- Stato ---------- */
    var S = null;          // ultimo stato dal server
    var ver = -1;
    var offset = 0;        // secondi da aggiungere all'orologio locale per avere quello del server
    var pollT = 0, failures = 0, stopped = false, polling = false;
    var lastKey = '';      // fase + domanda: cambia quando c'e' da cambiare schermata
    var screenNow = '';

    function now() { return Date.now() / 1000 + offset; }
    function me() { return S && S.me ? byId(S.players, S.me) : null; }
    function isBoss() { return mode === 'tv' || (S && S.me && S.me === S.captain); }
    function plural(n, one, many) { return QZ.fmt(n) + ' ' + (n === 1 ? one : many); }
    function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
    function pts(n) { return QZ.fmt(n); }
    function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + QZ.fmt(Math.abs(n)); }
    function show(id, o) { if (screenNow === id) return; screenNow = id; QZ.show(id, o); }
    function themeName(id) { var t = S && byId(S.themes || [], id); return t ? t.name : ''; }
    function secs(ms) { return QZ.fmt(ms / 1000, 1) + ' s'; }

    /* ---------- Rete ---------- */
    function api(body) {
        body.code = code;
        body.tok = tok;
        return window.fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
            .then(function (r) { return r.json().catch(function () { return { err: 'Risposta del server non valida' }; }); })
            .then(function (d) {
                if (d.err) { QZ.toast(d.err, { icon: 'info', type: 'bad' }); return d; }
                if (d.state) apply(d.state);
                return d;
            })
            .catch(function () { QZ.toast('Connessione assente: riprovo', { icon: 'wifi', type: 'bad' }); return { err: 'rete' }; });
    }

    function poll() {
        clearTimeout(pollT);
        if (stopped || mode === 'start' || code.length !== 4 || polling) return;
        polling = true;
        window.fetch(API + '?code=' + code + '&tok=' + encodeURIComponent(tok) + '&v=' + ver, { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                failures = 0;
                if (d.gone) { stopped = true; gone(d.err); return; }
                if (d.now) offset = d.now - Date.now() / 1000;
                if (!d.u && d.v) apply(d);
            })
            .catch(function () { failures++; })
            .then(function () {
                polling = false;
                if (stopped) return;
                var fast = S && S.phase !== 'lobby' && S.phase !== 'end';
                var ms = document.hidden ? 4000 : fast ? 800 : 1500;
                pollT = setTimeout(poll, failures > 3 ? 4000 : ms);
            });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

    function gone(msg) {
        QZ.modal({ title: 'Stanza non trovata', text: (msg || 'La stanza non esiste più') + '. Ne creiamo una nuova?', actions: [{ label: 'Torna all\'inizio', primary: true, icon: 'arrow', onClick: function () { location.href = PAGE; } }] });
    }

    function apply(st) {
        if (st.now) offset = st.now - Date.now() / 1000;
        S = st;
        ver = st.v;
        var key = st.phase + '|' + st.pos + '|' + st.games;
        var changed = key !== lastKey;
        lastKey = key;
        if (mode === 'tv') renderTV(changed);
        else renderPhone(changed);
    }

    /* ---------- Testi fissi ---------- */
    $('#medal').innerHTML = QZ.icon('tv');
    $('#rules').innerHTML = [
        ['La TV crea la stanza,', 'gli altri entrano dal telefono col QR code.'],
        ['La domanda è sulla TV,', 'sul telefono ci sono i quattro bottoni colorati: uno solo, e niente ripensamenti.'],
        ['Velocità:', 'una risposta giusta vale da 500 a 1.000 punti. Più rispondi presto, più prendi.'],
        ['Round da 5 domande,', 'e tra un round e l\'altro l\'imprevisto: punti doppi, tutto o niente, rubapunti…'],
        ['Alla fine', 'il podio, il più veloce e la domanda che ha fregato tutti.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#create-btn').innerHTML = 'Crea la stanza' + QZ.icon('arrow');
    $('#code-go').innerHTML = QZ.icon('phone') + 'Entra';
    $('#t-close').innerHTML = QZ.icon('flag') + 'Chiudi la domanda adesso';
    $('#f-again').innerHTML = QZ.icon('refresh') + 'Rivincita, stessi giocatori';
    $('#f-new').innerHTML = QZ.icon('plus') + 'Stanza nuova';
    $('#f-exit').innerHTML = QZ.icon('grid') + 'Cambia gioco';
    $('#p-join-btn').innerHTML = 'Entra in campo' + QZ.icon('arrow');
    $('#p-again').innerHTML = QZ.icon('refresh') + 'Rivincita';
    $('#t-timer').innerHTML = QZ.ringHTML();
    $('#p-timer').innerHTML = QZ.ringHTML();
    QZ.ring($('#t-timer .timer-ring'));
    QZ.ring($('#p-timer .timer-ring'));
    $('#t-twists').innerHTML = Object.keys(TWISTS).map(function (k) {
        return '<span class="chip" title="' + QZ.esc(TWISTS[k].text) + '">' + QZ.icon(TWISTS[k].icon) + QZ.esc(TWISTS[k].name) + ' · ' + QZ.esc(TWISTS[k].short) + '</span>';
    }).join('');

    /* ---------- Copertina ---------- */
    var creating = false;
    $('#create-btn').addEventListener('click', function () {
        if (creating) return;
        creating = true;
        QZ.sound.unlock();
        window.fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'create', opts: QZ.store.get('qz.tt.opts', {}) }) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.err) { QZ.toast(d.err, { type: 'bad' }); creating = false; return; }
                QZ.store.set('qz.tt.host.' + d.code, d.tok);
                location.href = PAGE + '?tv=' + d.code;
            })
            .catch(function () { creating = false; QZ.toast('Non riesco a creare la stanza: controlla la connessione', { type: 'bad', icon: 'wifi' }); });
    });
    function goCode() {
        var c = $('#code-in').value.toUpperCase().replace(/[^A-Z]/g, '');
        if (c.length !== 4) { QZ.toast('Il codice ha 4 lettere', { type: 'bad' }); QZ.fx.shake($('#code-in')); return; }
        location.href = PAGE + '?s=' + c;
    }
    $('#code-go').addEventListener('click', goCode);
    $('#code-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') goCode(); });

    /* ---------- Pezzi comuni a TV e telefono ---------- */
    function ranked() {
        return S.players.slice().sort(function (a, b) { return b.score - a.score || S.players.indexOf(a) - S.players.indexOf(b); });
    }
    function lastRes(pid) { return S.last && S.last.res ? S.last.res[pid] : null; }
    function stepLabel(q) {
        if (!q) return '';
        if (q.k === 0) return 'Imprevisto dopo il round ' + q.round;
        return 'Round ' + q.round + ' di ' + S.rounds + ' · domanda ' + q.k + ' di 5';
    }
    function modeLabel(q) {
        if (!q || q.mode === 'normale') return themeName(q && q.tema);
        return TWISTS[q.mode] ? TWISTS[q.mode].name + ': ' + TWISTS[q.mode].short : '';
    }
    function optStyle(i) { return '--o:var(--o' + LETTERS[i] + ');--o-on:var(--o' + LETTERS[i] + '-on);--i:' + i; }

    /** Cosa e' successo di speciale nell'ultima domanda (furto, penalita'). */
    function newsText(h, pid) {
        if (!h) return '';
        var out = [];
        if (h.steal && h.steal.n > 0) {
            var by = byId(S.players, h.steal.by), from = byId(S.players, h.steal.from);
            if (by && from) out.push(pid ? (pid === by.id ? 'Hai rubato ' + h.steal.n + ' punti a ' + from.name + '!' : pid === from.id ? by.name + ' ti ha rubato ' + h.steal.n + ' punti' : '') :
                by.name + ' è il più veloce e ruba ' + h.steal.n + ' punti a ' + from.name);
        }
        if (!pid && h.mode === 'tuttoniente') {
            var lost = Object.keys(h.res).filter(function (k) { return h.res[k].pts < 0; }).length;
            if (lost) out.push('Tutto o niente: ' + plural(lost, 'giocatore perde', 'giocatori perdono') + ' punti');
        }
        if (!pid && h.mode === 'rimonta') {
            var tri = Object.keys(h.res).filter(function (k) { return h.res[k].ok && h.res[k].pts > h.res[k].base; }).length;
            if (tri) out.push('La rimonta: ' + plural(tri, 'giocatore prende', 'giocatori prendono') + ' il triplo');
        }
        if (!pid && h.fastest && h.mode !== 'rubapunti') {
            var f = byId(S.players, h.fastest);
            if (f) out.push('Il più veloce: ' + f.name + ' in ' + secs(h.res[h.fastest].ms));
        }
        return out.filter(Boolean).join(' · ');
    }

    /** Classifica con i punti presi nell'ultima domanda. */
    function boardHTML(withPts) {
        return ranked().map(function (p, i) {
            var x = withPts ? lastRes(p.id) : null;
            var d = x ? x.pts : 0;
            var sub = !x ? '' : x.c < 0 ? 'nessuna risposta' : x.ok ? 'giusta in ' + secs(x.ms) : 'sbagliata';
            return '<div class="tt-row" style="--c:' + p.color + ';--i:' + i + '"><span class="tt-row__pos">' + (i + 1) + '</span>' +
                '<span class="tt-row__name">' + QZ.esc(p.name) + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
                '<span class="tt-row__pts' + (d < 0 ? ' is-neg' : d === 0 ? ' is-zero' : '') + '">' + (x ? signed(d) : '') + '</span>' +
                '<span class="tt-row__tot">' + pts(p.score) + '</span></div>';
        }).join('') || '<span class="tt-empty">Nessun giocatore</span>';
    }

    function autoBar(sel, txtSel) {
        var bar = $(sel + ' .tt-auto__bar span');
        var txt = $(txtSel);
        if (!bar || !S) return;
        if (S.hold) { bar.style.width = '0'; txt.textContent = 'In pausa'; return; }
        var total = S.phase === 'twist' ? 12 : 10;
        var left = Math.max(0, S.nextAt - now());
        bar.style.width = Math.round(Math.min(1, 1 - left / total) * 100) + '%';
        txt.textContent = S.phase === 'twist' ? 'Si parte tra ' + Math.ceil(left) : (S.pos + 1 >= S.total ? 'Il podio tra ' : 'Avanti tra ') + Math.ceil(left);
    }
    function holdLabel() { return S && S.hold ? QZ.icon('play') + 'Riparti' : QZ.icon('pause') + 'Pausa'; }
    function nextLabel() {
        if (S.phase === 'twist') return 'Via con la domanda' + QZ.icon('arrow');
        var n = S.pos + 1;
        if (n >= S.total) return QZ.icon('trophy') + 'Il podio';
        return 'Avanti' + QZ.icon('arrow');
    }

    /* ==================================================================
       TV
       ================================================================== */
    var qrDone = false;
    function joinUrl() { return location.origin + location.pathname + '?s=' + code; }

    function drawQR() {
        if (qrDone) return;
        var url = joinUrl();
        $('#room-code').textContent = code;
        $('#room-url').textContent = url.replace(/^https?:\/\//, '');
        if (typeof qrcode === 'function') {
            var q = qrcode(0, 'M');
            q.addData(url);
            q.make();
            $('#qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
            qrDone = true;
        } else {
            $('#qr').innerHTML = '<p style="color:#000;padding:20px;text-align:center">Apri sul telefono l\'indirizzo qui sotto e scrivi il codice</p>';
            setTimeout(function () { if (typeof qrcode === 'function') { qrDone = false; drawQR(); } }, 1500);
        }
    }

    function playersHTML() {
        if (!S.players.length) return '<span class="tt-empty">Ancora nessuno: inquadrate il QR code.</span>';
        return S.players.map(function (p) {
            return '<span class="tt-player' + (p.online ? '' : ' is-off') + '" role="listitem" style="--c:' + p.color + '"><span class="team__dot" aria-hidden="true"></span>' +
                QZ.esc(p.name) + (p.id === S.captain ? ' <small>capitano</small>' : '') +
                '<button type="button" data-kick="' + p.id + '" aria-label="Togli ' + QZ.esc(p.name) + '">' + QZ.icon('x') + '</button></span>';
        }).join('');
    }

    function activeThemes() { return S.opts.themes && S.opts.themes.length ? S.opts.themes : S.themes.map(function (t) { return t.id; }); }

    function themesHTML() {
        var on = activeThemes();
        return S.themes.map(function (t) {
            return '<button type="button" class="tt-theme" data-theme="' + t.id + '" aria-pressed="' + (on.indexOf(t.id) >= 0) + '"><span class="tt-theme__lamp" aria-hidden="true"></span>' + QZ.esc(t.name) + '<small>' + t.n + '</small></button>';
        }).join('');
    }

    var optsKey = '';
    function renderOpts() {
        var k = JSON.stringify(S.opts);
        if (k === optsKey) return;
        optsKey = k;
        QZ.store.set('qz.tt.opts', S.opts);
        QZ.segmented($('#opt-rounds'), [2, 3, 4, 5, 6].map(function (n) { return { label: String(n), value: n }; }), S.opts.rounds, function (v) { api({ a: 'opts', opts: { rounds: v } }); });
        QZ.segmented($('#opt-time'), [10, 15, 20].map(function (n) { return { label: n + ' s', value: n }; }), S.opts.time, function (v) { api({ a: 'opts', opts: { time: v } }); });
        QZ.segmented($('#opt-diff'), [{ label: 'Facile', value: 'facile' }, { label: 'Mista', value: 'mista' }, { label: 'Difficile', value: 'difficile' }], S.opts.diff, function (v) { api({ a: 'opts', opts: { diff: v } }); });
        $('#t-themes').innerHTML = themesHTML();
        var on = activeThemes();
        var n = S.themes.filter(function (t) { return on.indexOf(t.id) >= 0; }).reduce(function (s, t) { return s + t.n; }, 0);
        $('#themes-count').textContent = on.length === S.themes.length ? 'Tutti · ' + plural(n, 'domanda', 'domande') : on.length + ' su ' + S.themes.length + ' · ' + plural(n, 'domanda', 'domande');
    }

    function setupTV() {
        if (!tok) {
            QZ.modal({ title: 'Questa non è la TV della stanza', text: 'La stanza ' + code + ' è stata creata su un altro schermo. Vuoi entrare come giocatore?', actions: [
                { label: 'Entra come giocatore', primary: true, icon: 'phone', onClick: function () { location.href = PAGE + '?s=' + code; } },
                { label: 'Crea una stanza nuova', icon: 'plus', onClick: function () { location.href = PAGE; } }] });
            return false;
        }
        $('#t-players').addEventListener('click', function (e) {
            var b = e.target.closest('[data-kick]');
            if (!b) return;
            var p = byId(S.players, b.dataset.kick);
            QZ.confirm('Togliere ' + (p ? p.name : 'il giocatore') + ' dalla stanza?', { title: 'Fuori dal campo', okLabel: 'Togli' }).then(function (ok) { if (ok) api({ a: 'kick', pid: b.dataset.kick }); });
        });
        $('#t-themes').addEventListener('click', function (e) {
            var b = e.target.closest('[data-theme]');
            if (!b || !S) return;
            var on = activeThemes().slice();
            var i = on.indexOf(b.dataset.theme);
            if (i >= 0) {
                if (on.length <= 1) { QZ.toast('Tieni almeno un tema', { icon: 'info' }); return; }
                on.splice(i, 1);
            } else on.push(b.dataset.theme);
            QZ.sound.click();
            api({ a: 'opts', opts: { themes: on } });
        });
        $('#t-start').addEventListener('click', function () { QZ.sound.unlock(); api({ a: 'start' }); });
        $('#t-close').addEventListener('click', function () {
            QZ.confirm('La domanda finisce adesso per tutti: valgono le risposte già date.', { title: 'Chiudere la domanda?', okLabel: 'Chiudi' }).then(function (ok) { if (ok) api({ a: 'close' }); });
        });
        ['#t-rev-next', '#t-tw-next'].forEach(function (s) { $(s).addEventListener('click', function () { QZ.sound.click(); api({ a: 'next' }); }); });
        ['#t-rev-hold', '#t-tw-hold'].forEach(function (s) { $(s).addEventListener('click', function () { api({ a: 'hold', on: !S.hold }); }); });
        $('#f-again').addEventListener('click', function () { api({ a: 'rematch' }); });
        $('#f-new').addEventListener('click', function () { location.href = PAGE; });
        QZ.wake.on();
        return true;
    }

    function renderTV(changed) {
        var ph = S.phase;
        if (ph === 'lobby') {
            drawQR();
            $('#t-players').innerHTML = playersHTML();
            renderOpts();
            var b = $('#t-start');
            b.innerHTML = (S.players.length ? 'Fischio d\'inizio' : 'Aspettiamo i giocatori') + QZ.icon('arrow');
            b.disabled = !S.players.length;
            show('t-lobby');
        } else if (ph === 'ask') {
            if (changed) buildAsk();
            renderWho();
            show('t-ask');
        } else if (ph === 'reveal') {
            if (changed) { buildReveal(); QZ.sound.reveal(); }
            $('#t-rev-board').innerHTML = boardHTML(true);
            if (!changed) QZ.$$('#t-rev-board .tt-row').forEach(function (el) { el.style.animation = 'none'; });
            $('#t-rev-hold').innerHTML = holdLabel();
            $('#t-rev-next').innerHTML = nextLabel();
            show('t-reveal');
        } else if (ph === 'twist') {
            if (changed) buildTwist();
            $('#t-tw-hold').innerHTML = holdLabel();
            $('#t-tw-next').innerHTML = nextLabel();
            show('t-twist');
        } else if (ph === 'end') {
            if (changed) { renderFinal(); show('t-final'); }
        }
    }

    var readyDone = false, lastTick = -1;
    function buildAsk() {
        var q = S.q;
        readyDone = false;
        lastTick = -1;
        $('#t-ask-step').textContent = stepLabel(q);
        $('#t-ask-mode').textContent = modeLabel(q);
        $('#t-ask-q').textContent = q.testo;
        var qh = $('#t-ask-q');
        qh.style.animation = 'none'; qh.getBoundingClientRect(); qh.style.animation = '';
        var box = $('#t-ask-opts');
        box.classList.add('is-wait');
        box.innerHTML = q.opzioni.map(function (o, i) {
            return '<div class="tt-opt" style="' + optStyle(i) + '"><span class="tt-opt__l">' + LETTERS[i] + '</span><span class="tt-opt__t">' + QZ.esc(o) + '</span></div>';
        }).join('');
        QZ.sound.whoosh();
        QZ.say(q.testo);
    }
    function renderWho() {
        var done = S.players.filter(function (p) { return p.done; }).length;
        $('#t-who').innerHTML = '<span>' + done + ' su ' + S.players.length + ' hanno risposto</span>' + S.players.map(function (p) {
            return '<span class="tt-who__dot' + (p.done ? ' is-done' : '') + '" style="--c:' + p.color + '"><span class="team__dot" aria-hidden="true"></span>' + QZ.esc(p.name) + '</span>';
        }).join('');
    }

    function buildReveal() {
        var q = S.q, h = S.last;
        $('#t-rev-step').textContent = stepLabel(q) + (q.mode !== 'normale' && TWISTS[q.mode] ? ' · ' + TWISTS[q.mode].name : '');
        $('#t-rev-q').textContent = q.testo;
        var tot = Math.max(1, h.counts.reduce(function (s, n) { return s + n; }, 0));
        $('#t-rev-opts').innerHTML = q.opzioni.map(function (o, i) {
            return '<div class="tt-opt' + (i === q.giusta ? ' is-right' : '') + '" style="' + optStyle(i) + '"><span class="tt-opt__l">' + (i === q.giusta ? QZ.icon('check') : LETTERS[i]) + '</span><span class="tt-opt__t">' + QZ.esc(o) + '</span>' +
                '<span class="tt-opt__n" aria-label="' + plural(h.counts[i], 'risposta', 'risposte') + '">' + h.counts[i] + '</span><span class="tt-opt__bar" data-w="' + Math.round(h.counts[i] / tot * 100) + '"></span></div>';
        }).join('');
        setTimeout(function () { QZ.$$('#t-rev-opts .tt-opt__bar').forEach(function (b) { b.style.width = b.dataset.w + '%'; }); }, 60);
        $('#t-rev-news').textContent = newsText(h, '');
        $('#t-rev-rank-title').textContent = 'Classifica dopo ' + plural(q.n, 'domanda', 'domande');
        var right = h.counts[q.giusta];
        QZ.say('Risposta giusta: ' + LETTERS[q.giusta] + ', ' + q.opzioni[q.giusta] + '. ' + (right ? plural(right, 'giocatore ha', 'giocatori hanno') + ' indovinato' : 'Nessuno ha indovinato'));
        if (right) QZ.sound.correct(); else QZ.sound.wrong();
    }

    function buildTwist() {
        var t = TWISTS[S.twist] || { name: 'Imprevisto', icon: 'sparkles', text: '' };
        $('#t-tw-icon').innerHTML = QZ.icon(t.icon);
        $('#t-tw-name').textContent = t.name;
        $('#t-tw-text').textContent = t.text;
        $('#t-tw-sub').textContent = 'Finito il round ' + S.twistRound + ' di ' + S.rounds + ': ecco la classifica';
        $('#t-tw-board').innerHTML = boardHTML(false);
        QZ.sound.whistle();
        QZ.fx.flash('rgba(var(--accent-rgb), .4)');
        QZ.say('Imprevisto: ' + t.name + '. ' + t.text);
    }

    /* il cronometro gira da solo tra un poll e l'altro */
    var kicked = '';
    setInterval(function () {
        if (!S) return;
        var t = now();
        if (S.phase === 'ask') {
            var total = S.deadline - S.startAt;
            var left = Math.max(0, S.deadline - t);
            var ready = t >= S.startAt;
            ['#t-timer', '#p-timer'].forEach(function (sel) {
                var ring = $(sel + ' .timer-ring');
                if (!ring) return;
                var c = ring.querySelector('.t-fill');
                ring.querySelector('.timer-ring__label').textContent = ready ? Math.ceil(left) : Math.ceil(total);
                c.style.strokeDashoffset = String(c.__len * (1 - Math.min(1, (ready ? left : total) / Math.max(1, total))));
                ring.classList.toggle('is-warn', ready && left <= 5 && left > 3);
                ring.classList.toggle('is-danger', ready && left <= 3);
            });
            if (mode === 'tv') {
                var rb = $('#t-ready span');
                $('#t-ready').hidden = ready;
                if (!ready) rb.style.width = Math.round((1 - (S.startAt - t) / 3) * 100) + '%';
                if (ready && !readyDone) { readyDone = true; $('#t-ask-opts').classList.remove('is-wait'); QZ.sound.go(); }
                var sec = Math.ceil(left);
                if (ready && sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; QZ.sound.tick(); }
            } else phoneClock(t);
            // allo scadere si chiede subito al server, che chiude la domanda
            if (t >= S.deadline + 0.05 && kicked !== 'd' + S.pos) { kicked = 'd' + S.pos; poll(); }
        } else if (S.phase === 'reveal' || S.phase === 'twist') {
            if (mode === 'tv') {
                if (S.phase === 'reveal') autoBar('#t-rev-auto', '#t-rev-auto-txt');
                else autoBar('#t-tw-auto', '#t-tw-auto-txt');
            }
            if (!S.hold && t >= S.nextAt + 0.05 && kicked !== 'n' + S.phase + S.pos) { kicked = 'n' + S.phase + S.pos; poll(); }
        }
    }, 100);

    /* ---------- Resoconto finale ---------- */
    function stats() {
        var st = {};
        S.players.forEach(function (p) { st[p.id] = { right: 0, ms: 0, best: null, streak: 0, run: 0 }; });
        var trap = null;
        (S.history || []).forEach(function (h) {
            var answered = 0, wrong = 0;
            Object.keys(h.res).forEach(function (pid) {
                var x = h.res[pid];
                if (x.c >= 0) answered++;
                if (x.c >= 0 && !x.ok) wrong++;
                if (!st[pid]) return;
                if (x.ok) {
                    st[pid].right++;
                    st[pid].ms += x.ms;
                    st[pid].run++;
                    st[pid].streak = Math.max(st[pid].streak, st[pid].run);
                    if (st[pid].best === null || x.ms < st[pid].best.ms) st[pid].best = { ms: x.ms, q: h };
                } else st[pid].run = 0;
            });
            // la domanda che ha fregato tutti: la percentuale di giuste piu' bassa (a pari, piu' sbagliate)
            var ratio = answered ? (answered - wrong) / answered : 1;
            if (answered && (!trap || ratio < trap.ratio || (ratio === trap.ratio && wrong > trap.wrong))) trap = { h: h, ratio: ratio, wrong: wrong, answered: answered };
        });
        return { st: st, trap: trap };
    }

    function award(title, name, sub) {
        return '<div class="tt-award"><span>' + title + '</span><b>' + QZ.esc(name) + '</b><small>' + QZ.esc(sub) + '</small></div>';
    }

    function renderFinal() {
        var r = ranked();
        var top = r[0];
        var tie = r[1] && top && r[1].score === top.score;
        var hs = S.history || [];
        $('#f-badge').innerHTML = QZ.icon('trophy');
        $('#f-title').textContent = !top ? 'Partita finita' : tie ? 'Pareggio in vetta!' : 'Vince ' + top.name + '!';
        $('#f-sub').textContent = plural(hs.length, 'domanda giocata', 'domande giocate') + (top ? ' · ' + pts(top.score) + ' punti in testa' : '');
        $('#f-podium').innerHTML = QZ.podiumHTML(r.map(function (p) { return { name: p.name, score: p.score, color: p.color }; }), function (s) { return pts(s) + ' pt'; });
        var x = stats();
        var list = S.players.map(function (p) { return { p: p, s: x.st[p.id] }; });
        var html = '';
        var fast = list.filter(function (e) { return e.s.right; }).sort(function (a, b) { return a.s.ms / a.s.right - b.s.ms / b.s.right; })[0];
        if (fast) html += award('Il più veloce', fast.p.name, 'in media ' + secs(fast.s.ms / fast.s.right) + ' per una risposta giusta');
        var most = list.slice().sort(function (a, b) { return b.s.right - a.s.right; })[0];
        if (most && most.s.right) html += award('Più risposte giuste', most.p.name, most.s.right + ' su ' + hs.length);
        var lamp = list.filter(function (e) { return e.s.best; }).sort(function (a, b) { return a.s.best.ms - b.s.best.ms; })[0];
        if (lamp) html += award('La risposta lampo', lamp.p.name, secs(lamp.s.best.ms) + ' per «' + lamp.s.best.q.opzioni[lamp.s.best.q.giusta] + '»');
        var run = list.slice().sort(function (a, b) { return b.s.streak - a.s.streak; })[0];
        if (run && run.s.streak >= 3) html += award('La serie più lunga', run.p.name, run.s.streak + ' giuste di fila');
        if (x.trap) {
            var t = x.trap;
            html += '<div class="tt-award tt-award--wide"><span>La domanda che ha fregato tutti</span><b>' + QZ.esc(t.h.testo) + '</b><small>Era «' + QZ.esc(t.h.opzioni[t.h.giusta]) + '» · ' +
                (t.wrong === t.answered ? 'hanno sbagliato tutti' : t.wrong + ' su ' + t.answered + ' hanno sbagliato') + '</small></div>';
        }
        $('#f-awards').innerHTML = html;
        $('#f-table').innerHTML = '<thead><tr><th scope="col">#</th><th scope="col">Domanda</th><th scope="col">Risposta</th><th scope="col">Giuste</th></tr></thead><tbody>' +
            hs.map(function (h) {
                var ok = Object.keys(h.res).filter(function (k) { return h.res[k].ok; }).length;
                return '<tr><td class="num">' + h.n + '</td><td>' + QZ.esc(h.testo) + (h.mode !== 'normale' && TWISTS[h.mode] ? ' <span class="chip">' + QZ.esc(TWISTS[h.mode].name) + '</span>' : '') + '</td><td>' + QZ.esc(h.opzioni[h.giusta]) + '</td><td class="num">' + ok + '/' + Object.keys(h.res).length + '</td></tr>';
            }).join('') + '</tbody>';
        QZ.sound.win();
        setTimeout(function () { QZ.fx.confetti(); }, 300);
        setTimeout(function () { QZ.fx.confetti(); }, 1600);
        if (top) QZ.say(tie ? 'Pareggio in vetta' : 'Vince ' + top.name + ' con ' + top.score + ' punti');
    }

    /* ==================================================================
       TELEFONO
       ================================================================== */
    var recorded = -1, chosen = {}, sending = false;

    function setupPhone() {
        $('#p-join-code').textContent = code;
        $('#p-name').value = QZ.store.get('qz.tt.name', '');
        var join = function () {
            var n = $('#p-name').value.trim();
            if (!n) { QZ.fx.shake($('#p-name')); QZ.toast('Scrivi il tuo nome', { type: 'bad' }); return; }
            QZ.store.set('qz.tt.name', n);
            QZ.sound.unlock();
            api({ a: 'join', name: n });
        };
        $('#p-join-btn').addEventListener('click', join);
        $('#p-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
        $('#p-start').addEventListener('click', function () { api({ a: 'start' }); });
        $('#p-next').addEventListener('click', function () { api({ a: 'next' }); });
        $('#p-hold').addEventListener('click', function () { api({ a: 'hold', on: !S.hold }); });
        $('#p-again').addEventListener('click', function () { api({ a: 'rematch' }); });
        $('#p-pad').addEventListener('click', function (e) {
            var b = e.target.closest('[data-c]');
            if (!b || b.disabled || !S || S.phase !== 'ask') return;
            answer(Number(b.dataset.c));
        });
        QZ.wake.on();
    }

    function answer(c) {
        var n = S.q.n;
        if (chosen[n] !== undefined || sending) return;
        if (now() < S.startAt) { QZ.toast('Aspetta che le risposte si aprano', { icon: 'clock' }); return; }
        chosen[n] = c;
        sending = true;
        QZ.vibrate(30);
        QZ.sound.click();
        renderPad();
        $('#p-sent').textContent = 'Invio…';
        api({ a: 'answer', n: n, c: c }).then(function (d) {
            sending = false;
            // rifiutata perche' troppo presto: si puo' riprovare; altrimenti la scelta resta
            if (d.err && /attimo|rete/.test(d.err)) delete chosen[n];
            if (S && S.phase === 'ask') renderPad();
        });
    }

    function myChoice() {
        if (!S || !S.q) return -1;
        if (S.mine >= 0) return S.mine;
        return chosen[S.q.n] !== undefined ? chosen[S.q.n] : -1;
    }

    var padKey = '';
    function renderPad() {
        var q = S.q;
        var key = q.n + '|' + S.games;
        if (key !== padKey) {
            padKey = key;
            $('#p-pad').innerHTML = q.opzioni.map(function (o, i) {
                return '<button type="button" data-c="' + i + '" style="' + optStyle(i) + '" aria-label="' + LETTERS[i] + ': ' + QZ.esc(o) + '"><span>' + LETTERS[i] + '</span>' + QZ.esc(o) + '</button>';
            }).join('');
        }
        var mine = myChoice();
        var t = now();
        var open = t >= S.startAt && t < S.deadline;
        $('#p-pad').classList.toggle('is-wait', t < S.startAt);
        $('#p-pad').classList.toggle('is-sent', mine >= 0);
        QZ.$$('#p-pad button').forEach(function (b, i) {
            b.disabled = mine >= 0 || !open;
            b.classList.toggle('is-mine', i === mine);
        });
        $('#p-sent').textContent = mine >= 0 ? (sending ? 'Invio…' : 'Risposta ' + LETTERS[mine] + ' inviata. Guarda la TV') : !open && t >= S.deadline ? 'Tempo scaduto' : '';
    }

    function phoneClock(t) {
        if (!S || !S.q) return;
        var ready = t >= S.startAt;
        var mine = myChoice();
        $('#p-hud-txt').innerHTML = !ready ? '<b>Leggi la domanda sulla TV</b>' + QZ.esc(stepLabel(S.q)) :
            mine >= 0 ? '<b>Risposta data</b>' + QZ.esc(stepLabel(S.q)) :
                '<b>Rispondi!</b>' + QZ.esc(modeLabel(S.q) || stepLabel(S.q));
        var k = (ready ? 1 : 0) + '|' + (t < S.deadline ? 1 : 0);
        if ($('#p-pad').dataset.k !== k) {
            $('#p-pad').dataset.k = k;
            renderPad();
            if (ready && t < S.deadline && mine < 0) QZ.vibrate(60);
        }
    }

    function meCard(sel) {
        var p = me();
        if (!p) return;
        var pos = ranked().map(function (x) { return x.id; }).indexOf(p.id) + 1;
        $(sel).style.setProperty('--c', p.color);
        $(sel).innerHTML = '<span class="team__dot" style="background:' + p.color + '" aria-hidden="true"></span><b>' + QZ.esc(p.name) + (p.id === S.captain ? ' · capitano' : '') + '</b><span class="small muted">' + (S.pos >= 0 && S.phase !== 'lobby' ? pos + 'º di ' + S.players.length : '') + '</span><span class="led">' + pts(p.score) + '</span>';
    }

    function renderPhone(changed) {
        var p = me();
        if (!p) { show('p-join'); return; }
        var ph = S.phase;
        var boss = isBoss();
        if (ph === 'lobby') {
            meCard('#p-me');
            $('#p-wait-title').textContent = 'Sei in campo!';
            $('#p-wait-sub').textContent = boss ? 'Quando ci siete tutti, fai partire la partita da qui o dalla TV.' : 'Aspetta il fischio d\'inizio: guarda la TV.';
            $('#p-boss').hidden = !boss;
            $('#p-start').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
            show('p-wait');
        } else if (ph === 'ask') {
            if (changed) { $('#p-pad').dataset.k = ''; padKey = ''; }
            renderPad();
            phoneClock(now());
            show('p-ask', { scroll: true });
        } else if (ph === 'reveal' || ph === 'twist') {
            var box = $('#p-res');
            box.classList.remove('is-ok', 'is-bad');
            if (ph === 'reveal') {
                var x = lastRes(p.id), h = S.last;
                var right = h ? h.opzioni[h.giusta] : '';
                var extra = newsText(h, p.id);
                if (x && x.ok) {
                    box.classList.add('is-ok');
                    $('#p-res-title').textContent = 'Giusto! ' + signed(x.pts);
                    $('#p-res-sub').textContent = 'In ' + secs(x.ms) + (extra ? ' · ' + extra : '');
                } else {
                    box.classList.add('is-bad');
                    $('#p-res-title').textContent = x && x.c >= 0 ? 'Sbagliato' + (x.pts < 0 ? ' ' + signed(x.pts) : '') : 'Tempo scaduto';
                    $('#p-res-sub').textContent = 'Era ' + LETTERS[h.giusta] + ': ' + right + (extra ? ' · ' + extra : '');
                }
                if (changed) {
                    if (x && x.ok) { QZ.vibrate(80); QZ.sound.correct(); } else { QZ.vibrate([100, 60, 100]); QZ.sound.wrong(); }
                }
            } else {
                var t = TWISTS[S.twist] || { name: 'Imprevisto', text: '' };
                $('#p-res-title').textContent = t.name;
                $('#p-res-sub').textContent = 'Imprevisto! ' + t.text;
                if (changed) { QZ.vibrate([60, 40, 60, 40, 60]); QZ.sound.whistle(); }
            }
            meCard('#p-me2');
            $('#p-boss2').hidden = !boss;
            $('#p-hold').innerHTML = holdLabel();
            $('#p-next').innerHTML = nextLabel();
            show('p-reveal');
        } else if (ph === 'end') {
            var r = ranked();
            var pos = r.map(function (y) { return y.id; }).indexOf(p.id) + 1;
            $('#p-final-title').textContent = pos === 1 ? 'Hai vinto!' : pos + 'º posto';
            $('#p-final-sub').textContent = pts(p.score) + ' punti · la classifica completa è sulla TV';
            $('#p-final-rank').innerHTML = QZ.podiumHTML(r.map(function (y) { return { name: y.name, score: y.score, color: y.color }; }), function (s) { return pts(s) + ' pt'; });
            $('#p-boss3').hidden = !boss;
            show('p-final');
            if (changed) {
                if (pos === 1) { QZ.sound.win(); QZ.fx.confetti(); }
                if (recorded !== S.games) {
                    recorded = S.games;
                    QZ.profile.record('tuttitv', { xp: Math.min(120, Math.round(p.score / 150)) + (pos === 1 ? 20 : 0), label: pts(p.score) + ' punti · ' + pos + 'º su ' + r.length, score: p.score });
                }
            }
        }
    }

    /* ---------- Avvio ---------- */
    if (mode === 'start') {
        QZ.show('s-start', { scroll: false });
        return;
    }
    if (code.length !== 4) { location.href = PAGE; return; }
    if (mode === 'tv') { if (!setupTV()) return; }
    else setupPhone();
    poll();
})();
