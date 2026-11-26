/* ==========================================================================
   QUIZZOTTI v2 — Leghe tra amici
   Leghe.html            le tue leghe, crea una lega, entra col codice
   Leghe.html?c=ABC234   la lega: classifica (settimana, mese, da sempre),
                         oggi in lega, pagellino della settimana prima, invito
                         col QR; se non ci sei ancora, l'ingresso col soprannome
   Rete, gettone del telefono ed elenco delle leghe stanno in QZ.leagues
   (assets/qz.js); il server e' api/leghe.php (punti e classifiche li fa lui).
   ========================================================================== */
/* global qrcode */
(function () {
    'use strict';

    /* ---------- Funzioni pure (provate in tests/leghe.test.js) ---------- */
    var Core = (function () {
        var MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
        var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; });
        }
        /** Codice scritto a mano: maiuscole, via spazi e trattini; O e I lette come 0 e 1 non esistono, quindi restano errori. */
        function normCode(s) {
            return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('').filter(function (c) { return CODE_CHARS.indexOf(c) >= 0; }).join('').slice(0, 6);
        }
        function validCode(s) { return new RegExp('^[' + CODE_CHARS + ']{6}$').test(s); }
        function parts(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
        /** '2026-11-26' -> '26 novembre' */
        function fmtDay(ymd) { var p = parts(ymd); return p ? p.d + ' ' + MONTHS[p.m - 1] : ''; }
        /** Settimana o periodo: '23-29 novembre', '30 novembre - 6 dicembre'. */
        function fmtRange(from, to) {
            var a = parts(from), b = parts(to);
            if (!a || !b) return '';
            if (from === to) return fmtDay(from);
            if (a.m === b.m && a.y === b.y) return a.d + '-' + b.d + ' ' + MONTHS[b.m - 1];
            return fmtDay(from) + ' - ' + fmtDay(to);
        }
        function monthName(ymd) { var p = parts(ymd); return p ? MONTHS[p.m - 1] : ''; }
        /** Numero con un decimale alla italiana: 6 -> '6,0', 4.66 -> '4,7'. */
        function num(n) { return (Number(n) || 0).toFixed(1).replace('.', ','); }
        function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
        function votoLabel(v) { return v == null ? 's.v.' : (v % 1 ? Math.floor(v) + '½' : String(v)); }
        function inviteUrl(base, code) { return String(base).split('?')[0].split('#')[0] + '?c=' + code; }
        function inviteText(name, url) {
            return 'Entra nella mia lega «' + name + '» su Quizzotti: il Calciatore del Giorno, una classifica sola e le pagelle del lunedì.\n' + url;
        }

        /** Tabella della classifica: righe dal server (pos, nick, color, p, g, w, avg). */
        function tableHTML(rows, me) {
            return '<thead><tr><th scope="col"><span class="sr-only">Posizione</span></th><th scope="col">Nome</th><th scope="col">Punti</th>' +
                '<th scope="col" class="lg-opt">Partite</th><th scope="col" class="lg-opt">Vinte</th><th scope="col">Media</th></tr></thead><tbody>' +
                rows.map(function (r) {
                    return '<tr class="' + (r.id === me ? 'is-me' : '') + (r.g ? '' : ' is-zero') + '">' +
                        '<td class="lg-pos">' + (r.g ? r.pos : '-') + '</td>' +
                        '<td><span class="lg-dot" style="--c:' + esc(r.color) + '" aria-hidden="true"></span>' + esc(r.nick) + '</td>' +
                        '<td class="lg-pts">' + r.p + '</td>' +
                        '<td class="lg-opt">' + r.g + '</td><td class="lg-opt">' + r.w + '</td>' +
                        '<td>' + (r.g ? num(r.avg) : '-') + '</td></tr>';
                }).join('') + '</tbody>';
        }

        /** Il pagellino della settimana prima. P dal server (lg_pagellino), monday: oggi e' lunedi'. */
        function pagellinoHTML(P, me, monday) {
            var w = P.winners;
            var who = w.map(function (x) { return esc(x.nick); }).join(' e ');
            var head = monday ? 'È lunedì: escono le pagelle' : 'Il pagellino della settimana scorsa';
            return '<span class="eyebrow">' + esc(head) + '</span>' +
                '<h2 class="lg-pag__title">' + (w.length > 1 ? 'Pari merito in vetta: ' : 'Vince ') + who + '</h2>' +
                '<p class="muted" style="margin:0">' + esc(fmtRange(P.from, P.to)) + ' · ' + plural(P.games, 'partita', 'partite') + ', ' + plural(P.players, 'giocatore', 'giocatori') + ' in campo</p>' +
                '<div class="stats">' +
                '<div class="stat"><div class="stat__label">Vincitore</div><div class="stat__value">' + who + '</div><small>' + plural(w[0].p, 'punto', 'punti') + '</small></div>' +
                '<div class="stat"><div class="stat__label">Media della lega</div><div class="stat__value">' + num(P.avg) + '</div><small>punti a partita</small></div>' +
                '<div class="stat"><div class="stat__label">Serie più lunga</div><div class="stat__value">' + (P.streak ? esc(P.streak.nick) : '-') + '</div><small>' +
                (P.streak ? plural(P.streak.days, 'giorno', 'giorni') + ' di fila a segno' : 'nessuna vittoria') + '</small></div>' +
                '</div>' +
                '<ul class="lg-votes">' + P.rows.map(function (r) {
                    return '<li' + (r.id === me ? ' class="is-me"' : '') + '><span class="lg-voto' + (r.voto == null ? ' is-sv' : '') + '" aria-label="Voto ' + (r.voto == null ? 'senza voto' : votoLabel(r.voto)) + '">' + votoLabel(r.voto) + '</span>' +
                        '<span><b>' + esc(r.nick) + (r.id === me ? ' <small>· tu</small>' : '') + '</b><small>' + plural(r.p, 'punto', 'punti') + ' in ' + plural(r.g, 'partita', 'partite') +
                        (r.voto == null ? ': troppo poche per il voto' : ' · media ' + num(r.avg)) + '</small></span></li>';
                }).join('') + '</ul>';
        }

        /** Chi ha gia' giocato oggi, gioco per gioco (state.games, state.members, state.recent). */
        function todayItems(state) {
            var out = [];
            Object.keys(state.games || {}).forEach(function (g) {
                var n = state.games[g].n;
                state.members.forEach(function (m) {
                    var r = (state.recent || []).filter(function (x) { return x.m === m.id && x.g === g && x.n === n; })[0];
                    out.push({ g: g, game: state.games[g].name, n: n, id: m.id, nick: m.nick, color: m.color, played: !!r, l: r ? r.l : '', p: r ? r.p : 0, at: r ? r.at : 0 });
                });
            });
            // prima chi ha giocato (dal piu' recente), poi chi deve ancora giocare
            out.sort(function (a, b) { return (b.played - a.played) || (b.at - a.at) || (a.nick < b.nick ? -1 : 1); });
            return out;
        }

        return {
            esc: esc, normCode: normCode, validCode: validCode, fmtDay: fmtDay, fmtRange: fmtRange, monthName: monthName,
            num: num, plural: plural, votoLabel: votoLabel, inviteUrl: inviteUrl, inviteText: inviteText,
            tableHTML: tableHTML, pagellinoHTML: pagellinoHTML, todayItems: todayItems
        };
    })();

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    if (typeof document === 'undefined' || typeof QZ === 'undefined') return;

    /* =====================================================================
       INTERFACCIA
       ===================================================================== */
    var $ = QZ.$;
    var LG = QZ.leagues;
    var API = LG.API;
    var KEY_NICK = 'qz.leghe.nick';      // ultimo soprannome usato: si propone nei moduli
    var KEY_PERIOD = 'qz.leghe.period';  // solo comodita': ultima classifica guardata

    var params = new window.URLSearchParams(location.search);
    var code = Core.normCode(params.get('c') || '');
    var S = null;              // stato della lega aperta
    var period = QZ.store.get(KEY_PERIOD, 'week');
    if (['week', 'month', 'all'].indexOf(period) < 0) period = 'week';

    function get(c) {
        return window.fetch(API + '?code=' + encodeURIComponent(c) + '&tok=' + LG.tok(), { cache: 'no-store' })
            .then(function (r) { return r.json().then(function (d) { d.status = r.status; return d; }); })
            .catch(function () { return { err: 'Niente rete: riprova tra poco', net: 1 }; });
    }
    function post(body) {
        return LG.post(body).catch(function () { return { err: 'Niente rete: riprova tra poco', net: 1 }; });
    }
    function lastNick() { var n = QZ.store.get(KEY_NICK, ''); return typeof n === 'string' ? n : ''; }
    function remember(c, state) {
        var mine = state.members.filter(function (m) { return m.id === state.me; })[0];
        LG.add({ code: c, name: state.name, mid: state.me, nick: mine ? mine.nick : '' });
        if (mine) QZ.store.set(KEY_NICK, mine.nick);
    }
    function setUrl(c) {
        try { window.history.replaceState(null, '', c ? '?c=' + c : location.pathname); } catch { /* file:// o browser vecchi */ }
    }

    /* ---------- Copertina ---------- */
    $('#rules').innerHTML = [
        ['Crea la lega', 'e manda il codice (o il QR) al gruppo. Fino a 30 membri, ognuno col suo soprannome.'],
        ['Gioca il Calciatore del Giorno', 'quando vuoi: a fine partita il risultato entra da solo in classifica.'],
        ['Punti:', 'preso in 1 = 10, in 2 = 8, in 3 = 6, in 4 = 5, in 5 = 4, in 6 = 3. Perso 0, ogni indizio -1.'],
        ['Il lunedì', 'il pagellino della settimana: chi vince, la media, la serie più lunga e i voti.']
    ].map(function (r, i) { return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>'; }).join('');
    $('#c-nick').value = $('#j-nick').value = lastNick();

    function paintMine() {
        var list = LG.list();
        $('#mine-card').hidden = !list.length;
        if (!list.length) return;
        $('#mine').innerHTML = list.map(function (l) {
            return '<li><a href="?c=' + l.code + '" data-code="' + l.code + '"><span><b>' + QZ.esc(l.name) + '</b><small>' + QZ.esc(l.nick ? 'Giochi come ' + l.nick : 'Codice ' + l.code) + '</small></span>' +
                '<span class="led" data-pos>·<small>settimana</small></span></a></li>';
        }).join('');
        // posizione di questa settimana, lega per lega
        list.forEach(function (l) {
            get(l.code).then(function (d) {
                var a = $('#mine a[data-code="' + l.code + '"]');
                if (!a) return;
                if (d.gone || d.status === 404) { a.querySelector('small').textContent = 'Lega chiusa o non trovata'; a.querySelector('[data-pos]').innerHTML = '-'; return; }
                if (!d.member) return;
                var row = d.week.rows.filter(function (r) { return r.id === d.me; })[0];
                a.querySelector('[data-pos]').innerHTML = (row && row.g ? row.pos + '°' : '-') + '<small>su ' + d.members.length + '</small>';
                if (d.name !== l.name) remember(l.code, d);
            });
        });
    }
    $('#mine').addEventListener('click', function (e) {
        var a = e.target.closest('a[data-code]');
        if (!a) return;
        e.preventDefault();
        openLeague(a.dataset.code);
    });

    function busyBtn(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); }

    $('#f-create').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = $('#c-go');
        if (btn.disabled) return;
        $('#c-err').textContent = '';
        var name = $('#c-name').value.trim(), nick = $('#c-nick').value.trim();
        if (name.length < 3) { $('#c-err').textContent = 'Dai un nome alla lega (almeno 3 lettere).'; $('#c-name').focus(); return; }
        if (nick.length < 2) { $('#c-err').textContent = 'Scegli un soprannome di almeno 2 lettere.'; $('#c-nick').focus(); return; }
        if (LG.list().length >= 10) { $('#c-err').textContent = 'Sei già in 10 leghe: esci da una prima di crearne un\'altra.'; return; }
        busyBtn(btn, true);
        post({ a: 'create', name: name, nick: nick }).then(function (d) {
            busyBtn(btn, false);
            if (d.err) { $('#c-err').textContent = d.err; return; }
            remember(d.code, d.state);
            LG.flush();   // il risultato di oggi, se c'e', entra subito
            show(d.code, d.state, true);
            QZ.toast('Lega creata: ora manda l\'invito', { icon: 'check' });
        });
    });

    function join(c, nick, errEl, btn) {
        errEl.textContent = '';
        if (!Core.validCode(c)) { errEl.textContent = 'Il codice è di 6 caratteri, lettere e numeri.'; return; }
        if (nick.trim().length < 2) { errEl.textContent = 'Scegli un soprannome di almeno 2 lettere.'; return; }
        if (LG.list().length >= 10 && !LG.list().some(function (l) { return l.code === c; })) { errEl.textContent = 'Sei già in 10 leghe: esci da una prima di entrare in un\'altra.'; return; }
        busyBtn(btn, true);
        post({ a: 'join', code: c, nick: nick.trim() }).then(function (d) {
            busyBtn(btn, false);
            if (d.err) { errEl.textContent = d.err; return; }
            remember(c, d.state);
            // i risultati di oggi e ieri giocati prima di entrare arrivano anche qui
            LG.flush().then(function (r) { if (r.sent) refresh(); });
            show(c, d.state, true);
            QZ.toast('Sei in lega: buona settimana', { icon: 'check' });
        });
    }
    $('#j-code').addEventListener('input', function () { var v = Core.normCode(this.value); if (v !== this.value) this.value = v; });
    $('#f-join').addEventListener('submit', function (e) { e.preventDefault(); join(Core.normCode($('#j-code').value), $('#j-nick').value, $('#j-err'), $('#j-go')); });
    $('#f-invite').addEventListener('submit', function (e) { e.preventDefault(); join(code, $('#i-nick').value, $('#i-err'), $('#i-go')); });

    /* ---------- Apertura di una lega ---------- */
    function openLeague(c) {
        code = c;
        setUrl(c);
        get(c).then(function (d) {
            if (d.net) { QZ.toast(d.err, { type: 'bad' }); if (!S) home(); return; }
            if (d.gone || d.status === 404 || d.status === 400) {
                if (LG.list().some(function (l) { return l.code === c; })) $('#g-sub').textContent = 'Questa lega non c\'è più: forse sono usciti tutti. La togliamo dalle tue.';
                LG.remove(c);
                $('#g-badge').innerHTML = QZ.icon('x');
                QZ.show('s-gone');
                return;
            }
            if (!d.member) {
                // eri in lega ma ti hanno tolto (o hai cambiato telefono): si rientra
                LG.remove(c);
                $('#i-title').textContent = d.name;
                $('#i-sub').textContent = d.count >= d.max ? 'La lega è al completo: ' + d.max + ' membri.' : Core.plural(d.count, 'membro', 'membri') + ' in rosa. Scegli il soprannome con cui comparirai in classifica.';
                $('#i-go').disabled = d.count >= d.max;
                $('#i-nick').value = lastNick();
                QZ.show('s-join');
                return;
            }
            remember(c, d);
            show(c, d, true);
        });
    }
    function refresh() { if (code && S) get(code).then(function (d) { if (d.member) { S = d; paint(); } }); }

    function home() { code = ''; S = null; setUrl(''); paintMine(); QZ.show('s-start'); }

    /* ---------- La lega ---------- */
    var qrFor = '';
    function show(c, state, fresh) {
        code = c;
        S = state;
        setUrl(c);
        paint();
        if (fresh) QZ.show('s-league');
    }

    QZ.segmented($('#l-period'), [{ label: 'Settimana', value: 'week' }, { label: 'Mese', value: 'month' }, { label: 'Da sempre', value: 'all' }], period, function (v) {
        period = v;
        QZ.store.set(KEY_PERIOD, v);
        paintTable();
    });

    function paintTable() {
        var P = S[period];
        var anyone = P.rows.some(function (r) { return r.g > 0; });
        $('#l-range').textContent = period === 'week' ? Core.fmtRange(P.from, P.to) : period === 'month' ? Core.monthName(P.to) : 'dalla fondazione';
        $('#l-table').innerHTML = Core.tableHTML(P.rows, S.me);
        $('#l-empty').hidden = anyone;
        $('#l-empty').textContent = period === 'week' ? 'Nessuna partita ancora questa settimana: la classifica riparte ogni lunedì.' : 'Nessuna partita ancora.';
    }

    function drawQR(url) {
        if (qrFor === url) return;
        if (typeof qrcode === 'function') {
            var q = qrcode(0, 'M');
            q.addData(url);
            q.make();
            $('#l-qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
            qrFor = url;
        } else {
            $('#l-qr').innerHTML = '<p style="color:#000;padding:16px;text-align:center">Manda il link qui sotto</p>';
            setTimeout(function () { if (typeof qrcode === 'function') drawQR(url); }, 1500);
        }
    }

    function paint() {
        var url = Core.inviteUrl(location.href, code);
        $('#l-name').textContent = S.name;
        var owner = S.members.filter(function (m) { return m.id === S.owner; })[0];
        $('#l-sub').textContent = Core.plural(S.members.length, 'membro', 'membri') + (owner ? ' · presidente: ' + owner.nick : '') + ' · ' + Core.fmtDay(S.today);
        document.title = S.name + ' · Leghe · Quizzotti';

        // pagellino: in alto, e il lunedi' con la festa
        var pag = $('#l-pag');
        pag.hidden = !S.pagellino;
        if (S.pagellino) {
            pag.innerHTML = Core.pagellinoHTML(S.pagellino, S.me, !!S.monday);
            pag.classList.toggle('card--glow', !!S.monday);
            pag.classList.toggle('is-monday', !!S.monday);
            var seen = 'qz.leghe.pag.' + code;
            if (S.monday && QZ.store.get(seen, '') !== S.pagellino.to) {
                QZ.store.set(seen, S.pagellino.to);
                setTimeout(function () { QZ.fx.confetti(); QZ.sound.win(); }, 400);
            }
        }

        paintTable();
        $('#l-points').textContent = Object.keys(S.games || {}).map(function (g) { return S.games[g].rules; }).filter(Boolean).join(' ') + ' Valgono la partita di oggi e quella di ieri.';

        // oggi in lega
        var items = Core.todayItems(S);
        var mePlayed = items.some(function (x) { return x.id === S.me && x.played; });
        var gameIds = Object.keys(S.games);
        $('#l-today').innerHTML = '<ul class="lg-today">' + items.map(function (x) {
            return '<li class="' + (x.played ? '' : 'is-wait') + '"><span><span class="lg-dot" style="--c:' + QZ.esc(x.color) + '" aria-hidden="true"></span>' + QZ.esc(x.nick) +
                (gameIds.length > 1 ? ' <em>· ' + QZ.esc(x.game) + '</em>' : '') + '</span>' +
                (x.played ? '<em>' + QZ.esc(x.l) + '</em><b>' + x.p + '</b>' : '<em>deve ancora giocare</em>') + '</li>';
        }).join('') + '</ul>' +
            (mePlayed ? '' : gameIds.map(function (g) {
                var gg = QZ.game(g);
                return gg ? '<a class="btn btn--primary mt-2" href="' + gg.file + (g === 'giocatoredelgiorno' ? '' : '?giorno') + '">' + QZ.icon(gg.icon) + QZ.esc(gg.name) + ' N° ' + S.games[g].n + ': tocca a te</a>' : '';
            }).join(''));

        // invito
        $('#l-code').textContent = code;
        $('#l-url').textContent = url.replace(/^https?:\/\//, '');
        drawQR(url);

        // rosa
        var amOwner = S.owner === S.me;
        $('#l-count').textContent = S.members.length + ' su 30';
        $('#l-people').innerHTML = S.members.map(function (m) {
            return '<li><span class="lg-dot" style="--c:' + QZ.esc(m.color) + '" aria-hidden="true"></span><span>' + QZ.esc(m.nick) +
                (m.id === S.me ? ' <small>· tu</small>' : '') + (m.id === S.owner ? ' <small>· presidente</small>' : '') + '</span>' +
                (amOwner && m.id !== S.me ? '<button class="btn btn--sm btn--ghost" type="button" data-kick="' + m.id + '" aria-label="Togli ' + QZ.esc(m.nick) + ' dalla lega">Togli</button>' : '') + '</li>';
        }).join('');
    }

    $('#l-share').addEventListener('click', function () { QZ.share(Core.inviteText(S.name, Core.inviteUrl(location.href, code)), 'Lega ' + S.name); });
    $('#l-copy').addEventListener('click', function () {
        var done = function () { QZ.toast('Codice copiato: ' + code, { icon: 'check' }); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { QZ.toast('Il codice è ' + code); });
        else QZ.toast('Il codice è ' + code);
    });

    $('#l-people').addEventListener('click', function (e) {
        var b = e.target.closest('[data-kick]');
        if (!b) return;
        var m = S.members.filter(function (x) { return x.id === b.dataset.kick; })[0];
        if (!m) return;
        QZ.confirm(m.nick + ' esce dalla lega e i suoi risultati spariscono dalla classifica. Potrà rientrare col codice.', { title: 'Togli ' + m.nick + '?', okLabel: 'Togli', danger: true }).then(function (ok) {
            if (!ok) return;
            post({ a: 'kick', code: code, mid: m.id }).then(function (d) {
                if (d.err) { QZ.toast(d.err, { type: 'bad' }); return; }
                S = d.state; paint();
            });
        });
    });

    $('#l-rename').addEventListener('click', function () {
        var mine = S.members.filter(function (m) { return m.id === S.me; })[0];
        var val = null;
        QZ.modal({
            title: 'Cambia soprannome',
            html: '<label class="label" for="rn-in">Il nuovo soprannome</label><input class="input mt-1" id="rn-in" maxlength="20" autocomplete="nickname"><p class="lg-err mt-1" id="rn-err" role="alert"></p>',
            actions: [{ label: 'Annulla', ghost: true, value: false }, {
                label: 'Salva', primary: true, value: true,
                onClick: function () { val = $('#rn-in').value.trim(); if (val.length < 2) { $('#rn-err').textContent = 'Almeno 2 lettere.'; return false; } }
            }],
            onOpen: function (m, close) {
                var inp = $('#rn-in', m);
                inp.value = mine ? mine.nick : '';
                setTimeout(function () { inp.focus(); inp.select(); }, 80);
                inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { val = inp.value.trim(); if (val.length >= 2) close(true); } });
            }
        }).then(function (ok) {
            if (!ok || !val) return;
            post({ a: 'rename', code: code, nick: val }).then(function (d) {
                if (d.err) { QZ.toast(d.err, { type: 'bad' }); return; }
                S = d.state; remember(code, S); paint();
            });
        });
    });

    $('#l-leave').addEventListener('click', function () {
        QZ.confirm('I tuoi risultati spariscono dalla classifica di «' + S.name + '». Per rientrare servirà di nuovo il codice.', { title: 'Esci dalla lega?', okLabel: 'Esci', danger: true }).then(function (ok) {
            if (!ok) return;
            post({ a: 'leave', code: code }).then(function (d) {
                if (d.err && !d.gone) { QZ.toast(d.err, { type: 'bad' }); return; }
                LG.remove(code);
                QZ.toast('Sei uscito dalla lega', { icon: 'check' });
                home();
            });
        });
    });

    // tornando sulla pagina (dopo aver giocato in un'altra scheda) la classifica si aggiorna
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

    /* ---------- Avvio ---------- */
    paintMine();
    if (code) openLeague(code);
    else if (params.get('c')) { $('#g-badge').innerHTML = QZ.icon('x'); QZ.show('s-gone'); }
})();
