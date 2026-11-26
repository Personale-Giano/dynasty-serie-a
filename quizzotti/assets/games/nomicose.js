/* ==========================================================================
   QUIZZOTTI v2 — Nomi, Cose, Calcio
   Dati: assets/db-nomicose.js (`nomicoseData`: categorie di base, lettere).
   Stanza condivisa: api/nomicose.php (PHP sul sito, un file per stanza).
   Una pagina, tre modi:
     NomiCose.html            copertina: crea la stanza o entra con il codice
     NomiCose.html?tv=ABCD    la TV: QR, categorie, regole, tabellone, resoconto
     NomiCose.html?s=ABCD     il telefono: nome, foglio delle risposte, voti
   La TV e il primo giocatore entrato (il capitano) comandano la partita.
   Lo stato arriva per polling con versione: se non cambia, il server risponde
   {"u":1} e non si ridisegna niente.
   ========================================================================== */
/* global nomicoseData, qrcode */
(function () {
    'use strict';

    var $ = QZ.$;
    var D = nomicoseData;
    var API = 'api/nomicose.php';
    var PRESET = {};
    D.categories.forEach(function (c) { PRESET[c.id] = c; });

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
        tok = QZ.store.get('qz.nc.tok', '');
        if (!/^[a-f0-9]{32}$/.test(tok)) { tok = newTok(); QZ.store.set('qz.nc.tok', tok); }
    } else if (mode === 'tv') {
        tok = QZ.store.get('qz.nc.host.' + code, '');
    }

    /* ---------- Stato ---------- */
    var S = null;          // ultimo stato dal server
    var ver = -1;
    var offset = 0;        // secondi da aggiungere all'orologio locale per avere quello del server
    var pollT = 0, failures = 0, stopped = false;
    var lastPhase = '', lastRound = -1;

    function now() { return Date.now() / 1000 + offset; }
    function me() { return S && S.me ? S.players.filter(function (p) { return p.id === S.me; })[0] : null; }
    function isBoss() { return mode === 'tv' || (S && S.me && S.me === S.captain); }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

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
        if (stopped || mode === 'start' || code.length !== 4) return;
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
                if (stopped) return;
                var fast = S && (S.phase === 'letter' || S.phase === 'play' || S.phase === 'review');
                var ms = document.hidden ? 4000 : fast ? 900 : 1500;
                pollT = setTimeout(poll, failures > 3 ? 4000 : ms);
            });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

    function gone(msg) {
        QZ.modal({ title: 'Stanza non trovata', text: (msg || 'La stanza non esiste più') + '. Ne creiamo una nuova?', actions: [{ label: 'Torna all\'inizio', primary: true, icon: 'arrow', onClick: function () { location.href = 'NomiCose.html'; } }] });
    }

    function apply(st) {
        if (st.now) offset = st.now - Date.now() / 1000;
        S = st;
        ver = st.v;
        var phaseChanged = st.phase !== lastPhase || st.round !== lastRound;
        if (mode === 'tv') renderTV(phaseChanged);
        else renderPhone(phaseChanged);
        lastPhase = st.phase;
        lastRound = st.round;
    }

    /* ---------- Testi fissi ---------- */
    $('#medal').innerHTML = QZ.icon('list');
    $('#rules').innerHTML = [
        ['La TV crea la stanza,', 'gli altri entrano dal telefono col QR code.'],
        ['Esce una lettera:', 'per ogni categoria una risposta che inizia così. Calciatore con la M? Maldini.'],
        ['Stop!', 'Chi riempie tutto può fermare il round: agli altri restano 10 secondi.'],
        ['Controllo:', 'si vedono tutte le risposte e si bocciano quelle sbagliate.'],
        ['Punti:', '10 se la risposta è solo tua, 5 se è doppia, 20 se sei l\'unico ad averne una.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#create-btn').innerHTML = 'Crea la stanza' + QZ.icon('arrow');
    $('#code-go').innerHTML = QZ.icon('phone') + 'Entra';
    $('#t-cat-add').innerHTML = QZ.icon('plus') + 'Aggiungi';
    $('#t-cat-add2').innerHTML = QZ.icon('plus') + 'Aggiungi';
    $('#p-cat-add').innerHTML = QZ.icon('plus');
    $('#p-cat-add').setAttribute('aria-label', 'Proponi la categoria');
    $('#t-force').innerHTML = QZ.icon('flag') + 'Chiudi il round adesso';
    $('#t-end').innerHTML = QZ.icon('trophy') + 'Classifica finale';
    $('#p-end').innerHTML = QZ.icon('trophy') + 'Classifica finale';
    $('#f-again').innerHTML = QZ.icon('refresh') + 'Rivincita, stessi giocatori';
    $('#f-new').innerHTML = QZ.icon('plus') + 'Stanza nuova';
    $('#f-exit').innerHTML = QZ.icon('grid') + 'Cambia gioco';
    $('#p-join-btn').innerHTML = 'Entra in campo' + QZ.icon('arrow');
    $('#p-confirm').innerHTML = QZ.icon('check') + 'Conferma i punti';
    $('#p-again').innerHTML = QZ.icon('refresh') + 'Rivincita';
    $('#t-timer').innerHTML = QZ.ringHTML();
    $('#p-timer').innerHTML = QZ.ringHTML();
    QZ.ring($('#t-timer .timer-ring'));
    QZ.ring($('#p-timer .timer-ring'));

    /* ---------- Copertina ---------- */
    var creating = false;
    $('#create-btn').addEventListener('click', function () {
        if (creating) return;
        creating = true;
        QZ.sound.unlock();
        var cats = D.categories.filter(function (c) { return c.on; }).map(function (c) { return { id: c.id, name: c.name }; });
        window.fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'create', cats: cats, opts: QZ.store.get('qz.nc.opts', {}) }) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.err) { QZ.toast(d.err, { type: 'bad' }); creating = false; return; }
                QZ.store.set('qz.nc.host.' + d.code, d.tok);
                location.href = 'NomiCose.html?tv=' + d.code;
            })
            .catch(function () { creating = false; QZ.toast('Non riesco a creare la stanza: controlla la connessione', { type: 'bad', icon: 'wifi' }); });
    });
    function goCode() {
        var c = $('#code-in').value.toUpperCase().replace(/[^A-Z]/g, '');
        if (c.length !== 4) { QZ.toast('Il codice ha 4 lettere', { type: 'bad' }); QZ.fx.shake($('#code-in')); return; }
        location.href = 'NomiCose.html?s=' + c;
    }
    $('#code-go').addEventListener('click', goCode);
    $('#code-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') goCode(); });

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

    function playersHTML(kick) {
        if (!S.players.length) return '<span class="nc-empty">Ancora nessuno: inquadrate il QR code.</span>';
        return S.players.map(function (p) {
            return '<span class="nc-player' + (p.online ? '' : ' is-off') + '" role="listitem" style="--c:' + p.color + '"><span class="team__dot" aria-hidden="true"></span>' +
                QZ.esc(p.name) + (p.id === S.captain ? ' <small>capitano</small>' : '') +
                (kick ? '<button type="button" data-kick="' + p.id + '" aria-label="Togli ' + QZ.esc(p.name) + '">' + QZ.icon('x') + '</button>' : '') + '</span>';
        }).join('');
    }

    /** Interruttori delle categorie: quelle di base sempre in vista, le inventate in fondo. */
    function catsHTML() {
        var active = {};
        S.cats.forEach(function (c) { active[c.id] = 1; });
        var html = D.categories.map(function (c) {
            return '<button type="button" class="nc-cat" data-cat="' + c.id + '" aria-pressed="' + !!active[c.id] + '"><span class="nc-cat__lamp" aria-hidden="true"></span>' + QZ.esc(c.name) + '</button>';
        });
        S.cats.filter(function (c) { return !PRESET[c.id]; }).forEach(function (c) {
            html.push('<button type="button" class="nc-cat nc-cat--custom" data-rm="' + c.id + '" aria-pressed="true" title="Tocca per togliere"><span class="nc-cat__lamp" aria-hidden="true"></span>' + QZ.esc(c.name) + '</button>');
        });
        return html.join('');
    }

    function toggleCat(id) {
        var list = S.cats.slice();
        var i = list.map(function (c) { return c.id; }).indexOf(id);
        if (i >= 0) {
            if (list.length <= 3) { QZ.toast('Tieni almeno 3 categorie', { icon: 'info' }); return; }
            list.splice(i, 1);
        } else {
            if (list.length >= 12) { QZ.toast('Massimo 12 categorie', { icon: 'info' }); return; }
            list.push({ id: id, name: PRESET[id].name });
            // ordine: prima quelle di base nel loro ordine, poi le inventate
            list.sort(function (a, b) {
                var ia = PRESET[a.id] ? D.categories.indexOf(PRESET[a.id]) : 99;
                var ib = PRESET[b.id] ? D.categories.indexOf(PRESET[b.id]) : 99;
                return ia - ib;
            });
        }
        QZ.sound.click();
        api({ a: 'cats', cats: list });
    }

    function bindCats(host) {
        host.addEventListener('click', function (e) {
            var b = e.target.closest('[data-cat],[data-rm]');
            if (!b || !S) return;
            if (b.dataset.rm) {
                if (S.cats.length <= 3) { QZ.toast('Tieni almeno 3 categorie', { icon: 'info' }); return; }
                api({ a: 'removecat', id: b.dataset.rm });
            } else toggleCat(b.dataset.cat);
        });
    }
    function bindAdd(input, btn) {
        var go = function () {
            var v = input.value.trim();
            if (v.length < 2) { QZ.fx.shake(input); return; }
            api({ a: 'addcat', name: v }).then(function (d) { if (!d.err) { input.value = ''; QZ.toast('Categoria aggiunta', { type: 'ok', icon: 'plus' }); } });
        };
        btn.addEventListener('click', go);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    }

    var optsKey = '';
    function renderOpts() {
        var k = JSON.stringify(S.opts);
        if (k === optsKey) return;
        optsKey = k;
        QZ.store.set('qz.nc.opts', S.opts);
        QZ.segmented($('#opt-rounds'), [{ label: '3', value: 3 }, { label: '5', value: 5 }, { label: '8', value: 8 }, { label: '10', value: 10 }, { label: 'Senza fine', value: 0 }], S.opts.rounds, function (v) { api({ a: 'opts', opts: { rounds: v } }); });
        QZ.segmented($('#opt-time'), [{ label: '1 min', value: 60 }, { label: '1:30', value: 90 }, { label: '2 min', value: 120 }, { label: '3 min', value: 180 }], S.opts.time, function (v) { api({ a: 'opts', opts: { time: v } }); });
        $('#opt-stop').checked = !!S.opts.stop;
        $('#opt-foreign').checked = !!S.opts.foreign;
    }

    function startLabel() {
        if (!S.players.length) return 'Aspettiamo i giocatori';
        if (S.cats.length < 3) return 'Scegli almeno 3 categorie';
        return S.round ? 'Round ' + (S.round + 1) : 'Fischio d\'inizio';
    }
    function lastRoundDone() { return S.opts.rounds > 0 && S.round >= S.opts.rounds; }

    function setupTV() {
        if (!tok) {
            QZ.modal({ title: 'Questa non è la TV della stanza', text: 'La stanza ' + code + ' è stata creata su un altro schermo. Vuoi entrare come giocatore?', actions: [
                { label: 'Entra come giocatore', primary: true, icon: 'phone', onClick: function () { location.href = 'NomiCose.html?s=' + code; } },
                { label: 'Crea una stanza nuova', icon: 'plus', onClick: function () { location.href = 'NomiCose.html'; } }] });
            return false;
        }
        bindCats($('#t-cats'));
        bindCats($('#t-cats2'));
        bindAdd($('#t-cat-in'), $('#t-cat-add'));
        bindAdd($('#t-cat-in2'), $('#t-cat-add2'));
        $('#t-players').addEventListener('click', function (e) {
            var b = e.target.closest('[data-kick]');
            if (!b) return;
            var p = byId(S.players, b.dataset.kick);
            QZ.confirm('Togliere ' + (p ? p.name : 'il giocatore') + ' dalla stanza?', { title: 'Fuori dal campo', okLabel: 'Togli' }).then(function (ok) { if (ok) api({ a: 'kick', pid: b.dataset.kick }); });
        });
        $('#opt-stop').addEventListener('change', function () { api({ a: 'opts', opts: { stop: this.checked } }); });
        $('#opt-foreign').addEventListener('change', function () { api({ a: 'opts', opts: { foreign: this.checked } }); });
        $('#t-start').addEventListener('click', function () { QZ.sound.unlock(); api({ a: 'start' }); });
        $('#t-next').addEventListener('click', function () { api(lastRoundDone() ? { a: 'end' } : { a: 'start' }); });
        $('#t-end').addEventListener('click', function () {
            QZ.confirm('Si chiude la partita e si guarda il resoconto finale.', { title: 'Fischio finale?', okLabel: 'Resoconto' }).then(function (ok) { if (ok) api({ a: 'end' }); });
        });
        $('#t-force').addEventListener('click', function () {
            QZ.confirm('Il round finisce adesso per tutti: valgono le risposte già scritte.', { title: 'Chiudere il round?', okLabel: 'Chiudi' }).then(function (ok) { if (ok) api({ a: 'finish' }); });
        });
        $('#t-confirm').addEventListener('click', function () { api({ a: 'confirm' }); });
        $('#t-review-table').addEventListener('click', function (e) {
            var b = e.target.closest('[data-ov]');
            if (!b || !S || S.phase !== 'review') return;
            var key = b.dataset.ov;
            var cur = S.override ? S.override[key] : undefined;
            // giro: voto del tavolo -> forzata valida -> forzata non valida -> voto del tavolo
            var next = cur === undefined ? true : cur === true ? false : null;
            var parts = key.split('|');
            QZ.sound.click();
            api({ a: 'override', pid: parts[0], cat: parts[1], value: next });
        });
        $('#f-again').addEventListener('click', function () { api({ a: 'rematch' }); });
        $('#f-new').addEventListener('click', function () { location.href = 'NomiCose.html'; });
        QZ.wake.on();
        return true;
    }

    var letterAnim = 0;
    function renderTV(changed) {
        var ph = S.phase;
        if (ph === 'lobby') {
            drawQR();
            $('#t-players').innerHTML = playersHTML(true);
            $('#t-cats').innerHTML = catsHTML();
            $('#cats-count').textContent = S.cats.length + ' su 12';
            renderOpts();
            var b = $('#t-start');
            b.innerHTML = startLabel() + QZ.icon('arrow');
            b.disabled = !S.players.length || S.cats.length < 3;
            if (changed) QZ.show('t-lobby');
        } else if (ph === 'letter' || ph === 'play') {
            if (ph === 'letter' && now() < S.startAt) {
                if (changed || !$('#t-letter').classList.contains('is-active')) {
                    QZ.show('t-letter');
                    $('#t-letter-round').textContent = 'Round ' + S.round + (S.opts.rounds ? ' di ' + S.opts.rounds : '');
                    spinLetter();
                }
            } else {
                if (!$('#t-play').classList.contains('is-active')) { QZ.show('t-play'); QZ.sound.go(); }
                $('#t-play-letter').textContent = S.letter;
                $('#t-play-round').textContent = 'Round ' + S.round + (S.opts.rounds ? ' di ' + S.opts.rounds : '') + ' · lettera ' + S.letter;
                var n = S.roundCats.length;
                $('#t-progress').innerHTML = S.players.map(function (p) {
                    return '<div class="nc-prog" style="--c:' + p.color + '"><span>' + QZ.esc(p.name) + '</span><div class="nc-prog__bar"><div class="nc-prog__fill" style="width:' + Math.round(p.filled / n * 100) + '%"></div></div><span class="nc-prog__n">' + p.filled + '/' + n + '</span></div>';
                }).join('') || '<span class="nc-empty">Nessun giocatore</span>';
                $('#t-catlist').innerHTML = S.roundCats.map(function (c) { return '<span class="chip">' + QZ.esc(c.name) + '</span>'; }).join('');
                var st = $('#t-stop');
                var stopper = S.stopBy ? byId(S.players, S.stopBy) : null;
                if (stopper && st.hidden) { QZ.sound.whistle(); QZ.fx.flash('#e5484d'); }
                st.hidden = !stopper;
                if (stopper) st.textContent = 'Stop! ' + stopper.name + ' ha finito: 10 secondi';
            }
        } else if (ph === 'review') {
            if (changed) { QZ.show('t-review'); QZ.sound.whistle(); }
            renderReviewTable();
        } else if (ph === 'results') {
            renderResults();
            $('#t-cats2').innerHTML = catsHTML();
            $('#cats-count2').textContent = S.cats.length + ' su 12';
            var nx = $('#t-next');
            nx.innerHTML = lastRoundDone() ? QZ.icon('trophy') + 'Resoconto finale' : 'Round ' + (S.round + 1) + QZ.icon('arrow');
            nx.disabled = !lastRoundDone() && S.cats.length < 3;
            $('#t-end').hidden = lastRoundDone();
            if (changed) { QZ.show('t-results'); QZ.sound.coin(); }
        } else if (ph === 'end') {
            if (changed) { renderFinal(); QZ.show('t-final'); }
        }
    }

    function spinLetter() {
        clearInterval(letterAnim);
        var big = $('#t-letter-big');
        var pool = D.letters.concat(S.opts.foreign ? D.foreign : []);
        var until = S.startAt - 1.4;
        big.classList.add('is-spin');
        letterAnim = setInterval(function () {
            if (now() >= until) {
                clearInterval(letterAnim);
                big.classList.remove('is-spin');
                big.textContent = S.letter;
                QZ.sound.reveal();
                QZ.fx.pop(big);
                QZ.say('Lettera ' + S.letter);
                return;
            }
            big.textContent = QZ.pick(pool);
            QZ.sound.tick();
        }, 90);
    }

    /* il cronometro gira da solo tra un poll e l'altro */
    setInterval(function () {
        if (!S || (S.phase !== 'play' && S.phase !== 'letter')) return;
        var total = S.deadline - S.startAt;
        var left = Math.max(0, Math.ceil(S.deadline - now()));
        if (S.phase === 'letter' && now() < S.startAt) left = S.opts.time;
        ['#t-timer', '#p-timer'].forEach(function (sel) {
            var ring = $(sel + ' .timer-ring');
            if (!ring) return;
            var c = ring.querySelector('.t-fill');
            ring.querySelector('.timer-ring__label').textContent = left;
            c.style.strokeDashoffset = String(c.__len * (1 - Math.min(1, left / Math.max(1, total))));
            ring.classList.toggle('is-warn', left <= 20 && left > 10);
            ring.classList.toggle('is-danger', left <= 10);
        });
        if (mode === 'tv' && S.phase === 'letter' && now() >= S.startAt && !$('#t-play').classList.contains('is-active') && !letterAnimRunning()) renderTV(false);
        if (mode === 'phone') phoneClock(left);
    }, 250);
    function letterAnimRunning() { return $('#t-letter-big').classList.contains('is-spin'); }

    function cellHTML(ev, pid, cid, clickable) {
        var x = ev[cid] && ev[cid][pid];
        if (!x || !x.t) return '<span class="nc-ans is-empty">—</span>';
        var why = { lettera: 'lettera sbagliata', bocciata: 'bocciata (' + x.rej + ')', tv: 'tolta dalla TV', vuota: '' }[x.why] || '';
        var forced = S.override && S.override[pid + '|' + cid] !== undefined;
        var cls = 'nc-ans' + (x.ok ? (x.dup ? ' is-dup' : '') : ' is-bad') + (forced ? ' is-forced' : '');
        var inner = '<span class="nc-ans__t">' + QZ.esc(x.t) + (why ? '<small>' + why + '</small>' : x.ok && x.rej ? '<small>' + plural(x.rej, 'contestazione', 'contestazioni') + '</small>' : '') + '</span><span class="nc-ans__p">' + (x.ok ? '+' + x.pts : '0') + '</span>';
        return clickable ? '<button type="button" class="' + cls + '" data-ov="' + pid + '|' + cid + '" title="Tocca per correggere">' + inner + '</button>' : '<span class="' + cls + '">' + inner + '</span>';
    }

    function headHTML() {
        return '<thead><tr><th scope="col">Categoria</th>' + S.players.map(function (p) {
            return '<th scope="col" style="--c:' + p.color + '"><span class="team__dot" aria-hidden="true"></span>' + QZ.esc(p.name) + '</th>';
        }).join('') + '</tr></thead>';
    }

    function renderReviewTable() {
        $('#t-review-title').textContent = 'Controllo · lettera ' + S.letter;
        $('#t-legend').innerHTML = '<span>Verde: risposta solo sua (10, o 20 se è l\'unica)</span><span>Giallo: doppia (5)</span><span>Barrata: non vale</span><span>Tocca una risposta per correggerla a mano</span>';
        var ev = S.eval || {};
        $('#t-review-table').innerHTML = headHTML() + '<tbody>' + S.roundCats.map(function (c) {
            return '<tr><th scope="row">' + QZ.esc(c.name) + '</th>' + S.players.map(function (p) { return '<td>' + cellHTML(ev, p.id, c.id, true) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody>';
        $('#t-confirm').innerHTML = QZ.icon('check') + 'Conferma i punti';
    }

    function lastHistory() { return S.history && S.history.length ? S.history[S.history.length - 1] : null; }

    function ranked() {
        return S.players.slice().sort(function (a, b) { return b.score - a.score; });
    }

    function renderResults() {
        var h = lastHistory();
        if (!h) return;
        $('#t-results-title').textContent = 'Round ' + h.round + ' · lettera ' + h.letter;
        var saved = S;
        $('#t-results-table').innerHTML = headHTML() + '<tbody>' + h.cats.map(function (c) {
            return '<tr><th scope="row">' + QZ.esc(c.name) + '</th>' + saved.players.map(function (p) { return '<td>' + cellHTML(h.eval, p.id, c.id, false) + '</td>'; }).join('') + '</tr>';
        }).join('') + '<tr class="nc-total"><th scope="row">Punti del round</th>' + S.players.map(function (p) { return '<td>+' + (h.points[p.id] || 0) + '</td>'; }).join('') + '</tr></tbody>';
        $('#t-rank').innerHTML = '<div class="section-head"><h2>Classifica dopo ' + plural(S.round, 'round', 'round') + (S.opts.rounds ? ' su ' + S.opts.rounds : '') + '</h2></div>' +
            QZ.podiumHTML(ranked().map(function (p) { return { name: p.name, score: p.score, color: p.color }; }), function (s) { return s + ' pt'; });
    }

    /* ---------- Resoconto finale ---------- */
    function stats() {
        var st = {};
        S.players.forEach(function (p) { st[p.id] = { solo: 0, unique: 0, dup: 0, bad: 0, best: 0, bestRound: '' }; });
        var gems = [];
        (S.history || []).forEach(function (h) {
            Object.keys(h.eval).forEach(function (cid) {
                var cat = byId(h.cats, cid);
                Object.keys(h.eval[cid]).forEach(function (pid) {
                    var x = h.eval[cid][pid];
                    if (!st[pid]) return;
                    if (x.ok && x.pts === 20) { st[pid].solo++; gems.push({ t: x.t, pid: pid, cat: cat ? cat.name : '', l: h.letter }); }
                    if (x.ok && x.pts >= 10) st[pid].unique++;
                    if (x.ok && x.pts === 5) st[pid].dup++;
                    if (x.t && !x.ok) st[pid].bad++;
                });
            });
            Object.keys(h.points).forEach(function (pid) {
                if (st[pid] && h.points[pid] > st[pid].best) { st[pid].best = h.points[pid]; st[pid].bestRound = h.letter; }
            });
        });
        return { st: st, gems: gems };
    }

    function award(title, list, key, fmt) {
        var best = list.slice().sort(function (a, b) { return b.v - a.v; })[0];
        if (!best || !best.v) return '';
        return '<div class="nc-award"><span>' + title + '</span><b>' + QZ.esc(best.p.name) + '</b><small>' + fmt(best) + '</small></div>';
    }

    function renderFinal() {
        var r = ranked();
        var top = r[0];
        var tie = r[1] && top && r[1].score === top.score;
        $('#f-badge').innerHTML = QZ.icon('trophy');
        $('#f-title').textContent = !top ? 'Partita finita' : tie ? 'Pareggio in vetta!' : 'Vince ' + top.name + '!';
        $('#f-sub').textContent = plural((S.history || []).length, 'round giocato', 'round giocati') + ' · lettere ' + (S.history || []).map(function (h) { return h.letter; }).join(' ');
        $('#f-podium').innerHTML = QZ.podiumHTML(r.map(function (p) { return { name: p.name, score: p.score, color: p.color }; }), function (s) { return s + ' pt'; });
        var x = stats();
        var list = function (k) { return S.players.map(function (p) { return { p: p, v: x.st[p.id][k], s: x.st[p.id] }; }); };
        $('#f-awards').innerHTML =
            award('Il solista', list('solo'), 'solo', function (b) { return plural(b.v, 'risposta che aveva solo lui', 'risposte che aveva solo lui') + ' (20 punti)'; }) +
            award('Fantasia al potere', list('unique'), 'unique', function (b) { return plural(b.v, 'risposta originale', 'risposte originali'); }) +
            award('Il round perfetto', list('best'), 'best', function (b) { return b.v + ' punti con la ' + b.s.bestRound; }) +
            award('Il più contestato', list('bad'), 'bad', function (b) { return plural(b.v, 'risposta che non valeva', 'risposte che non valevano'); }) +
            (x.gems.length ? '<div class="nc-award" style="grid-column:1/-1"><span>Le risposte che aveva solo uno</span><div class="nc-gems">' + x.gems.slice(0, 12).map(function (g) {
                var p = byId(S.players, g.pid);
                return '<span class="chip" title="' + QZ.esc(g.cat) + '">' + QZ.esc(g.t) + ' · ' + QZ.esc(p ? p.name : '') + '</span>';
            }).join('') + '</div></div>' : '');
        var hs = S.history || [];
        $('#f-table').innerHTML = '<thead><tr><th scope="col">Giocatore</th>' + hs.map(function (h) { return '<th scope="col">' + h.letter + '</th>'; }).join('') + '<th scope="col">Totale</th></tr></thead><tbody>' +
            r.map(function (p) {
                return '<tr><th scope="row" style="color:' + p.color + '">' + QZ.esc(p.name) + '</th>' + hs.map(function (h) { return '<td>' + (h.points[p.id] || 0) + '</td>'; }).join('') + '<td><b>' + p.score + '</b></td></tr>';
            }).join('') + '</tbody>';
        QZ.sound.win();
        setTimeout(function () { QZ.fx.confetti(); }, 300);
    }

    /* ==================================================================
       TELEFONO
       ================================================================== */
    var sheetKey = '', saveT = 0, dirty = false, sending = false, finalSent = false, recorded = false;

    function letterOk(txt, L) {
        var s = String(txt).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
        s = s.replace(/^(l|un|dell|nell)['’]\s*/, '').replace(/^(il|lo|la|i|gli|le|un|uno|una|ac|as|ss|ssc|ssd|us|fc|cf|sc|afc|asd)\s+/, '');
        var m = s.match(/[a-z0-9]/);
        return !!m && m[0].toUpperCase() === L;
    }

    function setupPhone() {
        $('#p-join-code').textContent = code;
        $('#p-name').value = QZ.store.get('qz.nc.name', '');
        var join = function () {
            var n = $('#p-name').value.trim();
            if (!n) { QZ.fx.shake($('#p-name')); QZ.toast('Scrivi il tuo nome', { type: 'bad' }); return; }
            QZ.store.set('qz.nc.name', n);
            QZ.sound.unlock();
            api({ a: 'join', name: n });
        };
        $('#p-join-btn').addEventListener('click', join);
        $('#p-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
        bindAdd($('#p-cat-in'), $('#p-cat-add'));
        $('#p-start').addEventListener('click', function () { api(S.phase === 'results' && lastRoundDone() ? { a: 'end' } : { a: 'start' }); });
        $('#p-end').addEventListener('click', function () {
            QZ.confirm('Si chiude la partita e la TV mostra il resoconto finale.', { title: 'Fischio finale?', okLabel: 'Resoconto' }).then(function (ok) { if (ok) api({ a: 'end' }); });
        });
        $('#p-confirm').addEventListener('click', function () { api({ a: 'confirm' }); });
        $('#p-again').addEventListener('click', function () { api({ a: 'rematch' }); });
        $('#p-stop').addEventListener('click', function () {
            save(true).then(function () { api({ a: 'stop' }); });
        });
        $('#p-sheet').addEventListener('input', function (e) {
            if (!e.target.matches('input')) return;
            dirty = true;
            markField(e.target);
            clearTimeout(saveT);
            saveT = setTimeout(function () { save(false); }, 700);
            updateStopBtn();
        });
        $('#p-sheet').addEventListener('change', function () { save(false); });
        $('#p-vote').addEventListener('click', function (e) {
            var b = e.target.closest('[data-vote]');
            if (!b) return;
            var parts = b.dataset.vote.split('|');
            b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
            QZ.sound.click();
            api({ a: 'vote', pid: parts[0], cat: parts[1] });
        });
        QZ.wake.on();
    }

    function answersNow() {
        var out = {};
        QZ.$$('#p-sheet input').forEach(function (i) { out[i.dataset.cat] = i.value; });
        return out;
    }
    function save(force) {
        if ((!dirty && !force) || sending || !S || (S.phase !== 'play' && S.phase !== 'letter')) return Promise.resolve();
        sending = true;
        dirty = false;
        $('#p-saved').textContent = 'Salvo…';
        return window.fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'answer', code: code, tok: tok, answers: answersNow() }) })
            .then(function (r) { return r.json(); })
            .then(function (d) { $('#p-saved').textContent = d.err ? d.err : 'Risposte salvate ✓'; })
            .catch(function () { dirty = true; $('#p-saved').textContent = 'Connessione assente: riprovo'; })
            .then(function () { sending = false; if (dirty) { clearTimeout(saveT); saveT = setTimeout(function () { save(false); }, 800); } });
    }

    function markField(input) {
        var f = input.closest('.nc-field');
        var bad = input.value.trim() !== '' && !letterOk(input.value, S.letter);
        f.classList.toggle('is-bad', bad);
        f.querySelector('.nc-field__hint').textContent = bad ? 'Deve iniziare con la ' + S.letter : '';
    }

    function updateStopBtn() {
        var b = $('#p-stop');
        var all = QZ.$$('#p-sheet input').every(function (i) { return i.value.trim() !== ''; });
        b.hidden = !(S.opts.stop && S.phase === 'play' && !S.stopBy && all);
        b.innerHTML = QZ.icon('flag') + 'Stop! Ho finito';
    }

    function buildSheet() {
        var key = S.round + S.letter;
        if (key === sheetKey) return;
        sheetKey = key;
        finalSent = false;
        var mine = S.mine || {};
        $('#p-sheet').innerHTML = S.roundCats.map(function (c, i) {
            var id = 'ans-' + c.id;
            return '<div class="nc-field"><label for="' + id + '">' + QZ.esc(c.name) + '</label><input class="input" id="' + id + '" data-cat="' + c.id + '" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="' + (i === S.roundCats.length - 1 ? 'done' : 'next') + '" value="' + QZ.esc(mine[c.id] || '') + '" placeholder="' + S.letter + '…"><span class="nc-field__hint" aria-live="polite"></span></div>';
        }).join('');
        QZ.$$('#p-sheet input').forEach(function (inp, i, all) {
            markField(inp);
            inp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); if (all[i + 1]) all[i + 1].focus(); else inp.blur(); }
            });
        });
        $('#p-saved').textContent = '';
    }

    function phoneClock(left) {
        if (!S) return;
        var ready = now() >= S.startAt;
        QZ.$$('#p-sheet input').forEach(function (i) { i.disabled = !ready || left <= 0; });
        $('#p-letter').textContent = ready ? S.letter : '?';
        var stopper = S.stopBy ? byId(S.players, S.stopBy) : null;
        $('#p-hud-txt').innerHTML = !ready ? '<b>Sta uscendo la lettera…</b>Guarda la TV' :
            stopper ? '<b>Stop di ' + QZ.esc(stopper.name) + '!</b>Ultimi secondi' :
                '<b>Round ' + S.round + '</b>' + QZ.esc(plural(S.roundCats.length, 'categoria', 'categorie'));
        // allo scadere si mandano le ultime lettere battute
        if (left <= 1 && !finalSent && S.phase === 'play') { finalSent = true; save(true); }
    }

    function meCard() {
        var p = me();
        if (!p) return '';
        var pos = ranked().map(function (x) { return x.id; }).indexOf(p.id) + 1;
        $('#p-me').style.setProperty('--c', p.color);
        return '<span class="team__dot" style="background:' + p.color + '" aria-hidden="true"></span><b>' + QZ.esc(p.name) + (p.id === S.captain ? ' · capitano' : '') + '</b><span class="small muted">' + (S.round ? pos + 'º' : '') + '</span><span class="led">' + p.score + '</span>';
    }

    function renderPhone(changed) {
        var p = me();
        if (!p) {
            if (!$('#p-join').classList.contains('is-active')) QZ.show('p-join');
            return;
        }
        var ph = S.phase;
        var boss = isBoss();
        if (ph === 'lobby' || ph === 'results') {
            $('#p-me').innerHTML = meCard();
            var h = lastHistory();
            if (ph === 'lobby') {
                $('#p-wait-title').textContent = 'Sei in campo!';
                $('#p-wait-sub').textContent = boss ? 'Quando ci siete tutti, fai partire il round da qui o dalla TV.' : 'Aspetta il fischio d\'inizio: guarda la TV.';
                $('#p-round-pts').innerHTML = '';
            } else if (h) {
                var pts = h.points[p.id] || 0;
                $('#p-wait-title').textContent = '+' + pts + ' punti';
                $('#p-wait-sub').textContent = 'Round ' + h.round + ' con la ' + h.letter + (lastRoundDone() ? ' · era l\'ultimo' : '');
                $('#p-round-pts').innerHTML = '<div class="nc-vote__cat">' + h.cats.map(function (c) {
                    var x = h.eval[c.id] && h.eval[c.id][p.id];
                    return '<div class="nc-vote__row"><span class="nc-vote__who">' + QZ.esc(c.name) + '</span><span class="nc-vote__t' + (x && x.t && !x.ok ? ' is-bad' : '') + '">' + QZ.esc(x && x.t ? x.t : '—') + '</span><b>' + (x && x.ok ? '+' + x.pts : '0') + '</b></div>';
                }).join('') + '</div>';
            }
            $('#p-cats').innerHTML = S.cats.map(function (c) { return '<span class="chip">' + QZ.esc(c.name) + '</span>'; }).join('');
            $('#p-boss').hidden = !boss;
            var startTxt = ph === 'results' && lastRoundDone() ? 'Resoconto finale' : S.round ? 'Round ' + (S.round + 1) : 'Fischio d\'inizio';
            $('#p-start').innerHTML = startTxt + QZ.icon('arrow');
            $('#p-start').disabled = S.cats.length < 3;
            $('#p-end').hidden = ph !== 'results' || lastRoundDone();
            if (changed || !$('#p-wait').classList.contains('is-active')) QZ.show('p-wait');
        } else if (ph === 'letter' || ph === 'play') {
            buildSheet();
            updateStopBtn();
            if (changed || !$('#p-play').classList.contains('is-active')) { QZ.show('p-play', { scroll: true }); QZ.vibrate(80); }
            if (S.stopBy && S.stopBy !== p.id && !$('#p-play').dataset.stopped) { $('#p-play').dataset.stopped = '1'; QZ.vibrate([120, 60, 120]); QZ.sound.whistle(); }
            if (!S.stopBy) delete $('#p-play').dataset.stopped;
        } else if (ph === 'review') {
            // le ultime lettere non salvate non contano piu': il foglio si chiude
            renderVote();
            $('#p-boss2').hidden = !boss;
            if (changed) { QZ.show('p-review'); QZ.vibrate(60); }
        } else if (ph === 'end') {
            var r = ranked();
            var pos = r.map(function (x) { return x.id; }).indexOf(p.id) + 1;
            $('#p-final-title').textContent = pos === 1 ? 'Hai vinto!' : pos + 'º posto';
            $('#p-final-sub').textContent = p.score + ' punti · la classifica completa è sulla TV';
            $('#p-final-rank').innerHTML = QZ.podiumHTML(r.map(function (x) { return { name: x.name, score: x.score, color: x.color }; }), function (s) { return s + ' pt'; });
            $('#p-boss3').hidden = !boss;
            if (changed) {
                QZ.show('p-final');
                if (pos === 1) { QZ.sound.win(); QZ.fx.confetti(); }
                if (!recorded) {
                    recorded = true;
                    QZ.profile.record('nomicose', { xp: Math.min(120, Math.round(p.score / 4)) + (pos === 1 ? 20 : 0), label: p.score + ' punti · ' + pos + 'º su ' + r.length, score: p.score });
                }
            }
        }
    }

    function renderVote() {
        var ev = S.eval || {};
        var mine = {};
        (S.myVotes || []).forEach(function (k) { mine[k] = 1; });
        $('#p-vote').innerHTML = S.roundCats.map(function (c) {
            var rows = S.players.map(function (p) {
                var x = ev[c.id] && ev[c.id][p.id];
                if (!x || !x.t) return '';
                var k = p.id + '|' + c.id;
                var self = p.id === S.me;
                var note = x.why === 'lettera' ? ' (lettera)' : '';
                return '<div class="nc-vote__row"><span class="nc-vote__who">' + (self ? 'Tu' : QZ.esc(p.name)) + '</span><span class="nc-vote__t' + (x.ok ? '' : ' is-bad') + '">' + QZ.esc(x.t) + note + '</span>' +
                    (self || x.why === 'lettera' ? '<b>' + (x.ok ? '+' + x.pts : '0') + '</b>' :
                        '<button type="button" class="btn btn--sm" data-vote="' + k + '" aria-pressed="' + !!mine[k] + '" aria-label="Non vale: ' + QZ.esc(x.t) + ' di ' + QZ.esc(p.name) + '">' + QZ.icon('x') + 'Non vale</button>') + '</div>';
            }).join('');
            return '<div class="nc-vote__cat"><h3>' + QZ.esc(c.name) + '</h3>' + (rows || '<p class="small muted" style="margin:0">Nessuna risposta</p>') + '</div>';
        }).join('');
    }

    /* ---------- Avvio ---------- */
    if (mode === 'start') {
        QZ.show('s-start', { scroll: false });
        return;
    }
    if (code.length !== 4) { location.href = 'NomiCose.html'; return; }
    if (mode === 'tv') { if (!setupTV()) return; }
    else setupPhone();
    poll();
})();
