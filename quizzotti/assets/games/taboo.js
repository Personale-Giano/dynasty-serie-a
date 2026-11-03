/* ==========================================================================
   QUIZZOTTI v2 — Taboo
   Dati: assets/db-taboo.js (`tabooWords`: {word, categoria, taboo[]}).
   Rispetto alla v1: da 2 a 6 squadre, tempo e numero di giri a scelta,
   penalita' per la parola vietata e passi configurabili, argomenti
   selezionabili, carte che non si ripetono tra le partite, schermata
   "passa il telefono", riepilogo correggibile a fine turno, classifica finale.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;

    /* ---------- Argomenti: le 139 categorie del DB raggruppate in 7 macro-temi ---------- */
    var GROUPS = [
        { id: 'giocatori', label: 'Calciatori e leggende' },
        { id: 'allenatori', label: 'Allenatori e dirigenti' },
        { id: 'squadre', label: 'Squadre e nazionali' },
        { id: 'coppe', label: 'Coppe e tornei' },
        { id: 'stadi', label: 'Stadi e tifo' },
        { id: 'regole', label: 'Regole e tattica' },
        { id: 'cultura', label: 'Storie e curiosità' }
    ];
    // il primo che corrisponde vince: l'ordine conta
    var RULES = [
        ['regole', /arbitr|regol|tattic|ruoli|moduli|gesti|statistic|preparazion|medicina|settore|categorie giovanili|termini/i],
        ['allenatori', /allenat|president|dirigent|commissari/i],
        ['giocatori', /calciat|giocator|leggend|stell|portier|bandier|eroi|talent|generazion|campioni|italiani all/i],
        ['stadi', /stadi|arene|impianti/i],
        ['squadre', /squadr|club|derby|formazioni/i],
        ['coppe', /coppe|trofe|competizion|mondiali|europei|tornei|format storico/i],
        ['squadre', /nazional/i]
    ];
    var groupCache = {};
    function groupOf(cat) {
        if (!groupCache[cat]) {
            var g = 'cultura';
            for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(cat)) { g = RULES[i][0]; break; }
            groupCache[cat] = g;
        }
        return groupCache[cat];
    }
    var COUNT = {};
    tabooWords.forEach(function (w) { var g = groupOf(w.categoria); COUNT[g] = (COUNT[g] || 0) + 1; });
    var deck = new QZ.Deck('taboo', tabooWords, function (w) { return w.word; });

    /* ---------- Impostazioni ---------- */
    var OPT_KEY = 'qz.taboo.opts';
    var opts = Object.assign({ time: 60, rounds: 3, pen: 1, skips: -1, groups: null }, QZ.store.get(OPT_KEY, {}) || {});
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }
    var groups = (Array.isArray(opts.groups) ? opts.groups : []).filter(function (g) { return COUNT[g]; });
    if (!groups.length) groups = GROUPS.map(function (g) { return g.id; });

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Inizia la partita';
    $('#medal').innerHTML = QZ.icon('ban');
    $('#rules').innerHTML = [
        ['Uno spiega,', 'i compagni di squadra indovinano prima che scada il tempo.'],
        ['Vietato dire', 'la parola, quelle in rosso e parole della stessa famiglia.'],
        ['Gli avversari controllano', 'la carta e fanno scattare la penalità.'],
        ['Carta indovinata', 'un punto. Dopo tutti i giri vince chi ne ha di più.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var rec = QZ.profile.best('taboo');
    $('#start-record').textContent = rec != null ? 'Record di carte indovinate in un turno: ' + rec : '';

    var teamsList = QZ.playerList($('#teams-host'), { key: 'taboo', min: 2, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (2-6)' });

    QZ.segmented($('#opt-time'), [{ label: '45 s', value: 45 }, { label: '60 s', value: 60 }, { label: '90 s', value: 90 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-rounds'), [1, 2, 3, 5].map(function (n) { return { label: String(n), value: n }; }), opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-pen'), [{ label: '−1 punto', value: 1 }, { label: 'Nessuna penalità', value: 0 }], opts.pen, function (v) { opts.pen = v; saveOpts(); });
    QZ.segmented($('#opt-skip'), [{ label: 'Illimitati', value: -1 }, { label: '3', value: 3 }, { label: '1', value: 1 }, { label: 'Nessuno', value: 0 }], opts.skips, function (v) { opts.skips = v; saveOpts(); });

    function paintGroups() {
        $('#groups').innerHTML = GROUPS.map(function (g) {
            return '<button type="button" class="tb-group" data-g="' + g.id + '" aria-pressed="' + (groups.indexOf(g.id) >= 0) + '">' + QZ.esc(g.label) + ' <small>' + (COUNT[g.id] || 0) + '</small></button>';
        }).join('');
        var n = tabooWords.filter(function (w) { return groups.indexOf(groupOf(w.categoria)) >= 0; }).length;
        $('#groups-hint').textContent = QZ.fmt(n) + ' carte in gioco';
    }
    paintGroups();
    $('#groups').addEventListener('click', function (e) {
        var b = e.target.closest('.tb-group');
        if (!b) return;
        var at = groups.indexOf(b.dataset.g);
        if (at >= 0) {
            if (groups.length === 1) { QZ.toast('Lascia almeno un argomento', { icon: 'info' }); return; }
            groups.splice(at, 1);
        } else groups.push(b.dataset.g);
        QZ.sound.click();
        opts.groups = groups.slice(); saveOpts();
        paintGroups();
    });
    $('#groups-all').addEventListener('click', function () {
        groups = GROUPS.map(function (g) { return g.id; });
        opts.groups = groups.slice(); saveOpts();
        paintGroups();
    });

    $('#go-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Pronti, via!';
    $('#pause-btn').innerHTML = QZ.icon('pause');
    $('#ok-btn').innerHTML = QZ.icon('check') + 'Indovinata';
    $('#bad-btn').innerHTML = QZ.icon('ban') + 'Vietata';
    $('#hand-rules').innerHTML = [
        ['Uno di voi spiega:', 'prenda il telefono e lo tenga nascosto ai compagni.'],
        ['Un avversario', 'si mette accanto e controlla le parole vietate.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));
    var timer = new QZ.Timer({
        seconds: 60, ring: ring,
        onSecond: function (s) { if (s <= 10 && s > 0 && S.phase === 'play') QZ.sound.tick(); },
        onExpire: function () { if (S.phase === 'play' || S.phase === 'anim') timeUp(); }
    });

    /* ---------- Stato ---------- */
    var S = { phase: 'idle' };

    $('#start-btn').addEventListener('click', start);
    $('#go-btn').addEventListener('click', beginTurn);
    $('#ok-btn').addEventListener('click', function () { mark('ok'); });
    $('#bad-btn').addEventListener('click', function () { mark('bad'); });
    $('#skip-btn').addEventListener('click', function () { mark('skip'); });
    $('#pause-btn').addEventListener('click', pause);
    $('#sum-next').addEventListener('click', nextTurn);
    $('#sum-list').addEventListener('click', function (e) {
        var b = e.target.closest('[data-idx]');
        if (b) cycle(Number(b.dataset.idx));
    });

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t.closest && t.closest('input, textarea, select')) return;
        var k = e.key;
        if (S.phase === 'play') {
            if (k === 'ArrowRight' || k === 'g' || k === 'G') { e.preventDefault(); mark('ok'); }
            else if (k === 'ArrowLeft' || k === 'v' || k === 'V') { e.preventDefault(); mark('bad'); }
            else if (k === 'ArrowDown' || k === 'p' || k === 'P') { e.preventDefault(); mark('skip'); }
            else if (k === 'Escape') { e.preventDefault(); pause(); }
        } else if (S.phase === 'hand' && k === ' ' && !(t.closest && t.closest('button, a'))) {
            e.preventDefault(); beginTurn();
        }
    });

    /* ---------- Partita ---------- */
    function start() {
        var names = teamsList.get();
        S = {
            phase: 'hand', round: 1, turn: 0, rounds: opts.rounds, time: opts.time, pen: opts.pen, skips: opts.skips,
            groups: groups.slice(),
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, ok: 0, bad: 0, skip: 0, best: 0 }; }),
            log: [], cur: null
        };
        QZ.wake.on();
        QZ.sound.start();
        showHand();
    }

    function team() { return S.teams[S.turn]; }

    function scoresHTML(active) {
        return S.teams.map(function (t, i) {
            return '<div class="team' + (i === active ? ' is-active' : '') + '" style="--c:' + t.color + '"><span class="team__dot"></span>' +
                '<span class="team__name">' + QZ.esc(t.name) + '</span><span class="team__score">' + t.score + '</span></div>';
        }).join('');
    }

    function showHand() {
        S.phase = 'hand';
        var t = team();
        var host = $('#s-turn');
        host.style.setProperty('--c', t.color);
        $('#hand-badge').innerHTML = QZ.icon('smartphone');
        $('#hand-round').textContent = 'Giro ' + S.round + ' di ' + S.rounds + ' · passa il telefono a';
        $('#hand-name').textContent = t.name;
        $('#hand-scores').innerHTML = scoresHTML(S.turn);
        QZ.show('s-turn');
        QZ.sound.whoosh();
    }

    function beginTurn() {
        if (S.phase !== 'hand') return;
        S.phase = 'count';
        var t = team();
        S.log = [];
        S.turnPts = 0;
        S.skipsLeft = S.skips;
        $('#s-game').style.setProperty('--c', t.color);
        $('#hud-team').textContent = t.name;
        $('#hud-pts').textContent = '0';
        $('#word').textContent = 'Pronti?';
        $('#taboo').innerHTML = '';
        $('#word-cat').textContent = '';
        paintSkip();
        timer.reset(S.time);
        timer.warnAt = 0.34;
        timer.dangerAt = 10 / S.time;
        timer.render();
        QZ.show('s-game');
        QZ.countdown(3).then(function () {
            S.phase = 'play';
            deal(null);
            timer.start();
        });
    }

    function paintSkip() {
        var b = $('#skip-btn');
        var lim = S.skipsLeft;
        b.innerHTML = QZ.icon('skip') + 'Passo' + (lim >= 0 ? '<small>' + lim + ' rimast' + (lim === 1 ? 'o' : 'i') + '</small>' : '');
        b.disabled = lim === 0;
    }

    function draw() {
        var g = S.groups;
        return deck.draw(function (w) { return g.indexOf(groupOf(w.categoria)) >= 0; });
    }

    // anim: classe d'uscita della carta precedente (o null al primo giro)
    function deal(anim) {
        var card = $('#card');
        var show = function () {
            var w = draw();
            S.cur = w;
            card.classList.remove('is-go-ok', 'is-go-bad', 'is-go-skip');
            $('#word').textContent = w.word;
            $('#taboo').innerHTML = w.taboo.map(function (x, i) {
                return '<li style="--i:' + i + '">' + QZ.icon('ban') + '<span>' + QZ.esc(x) + '</span></li>';
            }).join('');
            $('#word-cat').textContent = w.categoria;
            QZ.fx.replay(card);
            if (S.phase === 'anim') S.phase = 'play';
        };
        if (anim && !QZ.reducedMotion()) {
            S.phase = 'anim';
            card.classList.remove('is-in');
            card.classList.add(anim);
            setTimeout(function () { if (S.phase === 'anim') show(); }, 200);
        } else show();
    }

    function points(res) { return res === 'ok' ? 1 : res === 'bad' ? -S.pen : 0; }

    function mark(res) {
        if (S.phase !== 'play' || !S.cur) return;
        if (res === 'skip' && S.skipsLeft === 0) { QZ.fx.shake($('#skip-btn')); return; }
        var t = team();
        S.log.push({ word: S.cur.word, res: res });
        S.cur = null;
        var d = points(res);
        S.turnPts += d;
        t.score += d;
        var pts = $('#hud-pts');
        pts.textContent = S.turnPts;
        if (res === 'ok') {
            QZ.sound.correct();
            QZ.vibrate(30);
            QZ.fx.sparks($('#word'), t.color, 14);
            QZ.fx.floatText(pts, '+1');
            QZ.fx.pop(pts);
        } else if (res === 'bad') {
            QZ.sound.wrong();
            QZ.vibrate([60, 40, 60]);
            QZ.fx.flash('rgba(var(--bad-rgb),.35)');
            if (d) { QZ.fx.floatText(pts, '−' + S.pen, true); QZ.fx.pop(pts); }
        } else {
            QZ.sound.whoosh();
            if (S.skipsLeft > 0) S.skipsLeft--;
            paintSkip();
        }
        deal(res === 'ok' ? 'is-go-ok' : res === 'bad' ? 'is-go-bad' : 'is-go-skip');
    }

    function pause() {
        if (S.phase !== 'play') return;
        S.phase = 'pause';
        timer.pause();
        QZ.modal({
            title: 'Pausa',
            text: 'Il tempo è fermo. Nascondete la carta finché non riprendete.',
            actions: [{ label: 'Termina partita', danger: true, value: 'end' }, { label: 'Riprendi', primary: true, icon: 'play', value: 'go' }]
        }).then(function (v) {
            if (v === 'end') {
                QZ.confirm('Chiudere la partita e vedere la classifica? Il turno in corso conta già.', { title: 'Terminare?', okLabel: 'Classifica', cancelLabel: 'Riprendi' }).then(function (ok) {
                    if (ok) finish();
                    else { S.phase = 'play'; timer.start(); }
                });
            } else { S.phase = 'play'; timer.start(); }
        });
    }

    function timeUp() {
        S.phase = 'sum';
        QZ.sound.buzzer();
        QZ.vibrate([120, 60, 120]);
        // la carta rimasta in mano compare nel riepilogo: se l'hanno detta sul gong si puo' convalidare
        if (S.cur) S.log.push({ word: S.cur.word, res: 'skip', last: true });
        S.cur = null;
        setTimeout(showSummary, 500);
    }

    var RES = {
        ok: { label: 'Indovinata', cls: 'chip--ok', icon: 'check' },
        bad: { label: 'Vietata', cls: 'chip--bad', icon: 'ban' },
        skip: { label: 'Passata', cls: '', icon: 'skip' }
    };

    function showSummary() {
        var t = team();
        $('#s-sum').style.setProperty('--c', t.color);
        $('#sum-eyebrow').textContent = 'Tempo scaduto';
        $('#sum-title').textContent = t.name;
        paintSummary();
        var last = S.turn === S.teams.length - 1 && S.round === S.rounds;
        $('#sum-next').innerHTML = last ? QZ.icon('trophy') + 'Classifica finale' : QZ.icon('arrow') + 'Prossima squadra';
        QZ.show('s-sum');
    }

    function paintSummary() {
        var t = team();
        $('#sum-pts').textContent = (S.turnPts > 0 ? '+' : '') + S.turnPts;
        $('#sum-total').textContent = 'Punti nel turno · totale squadra: ' + t.score;
        $('#sum-list').innerHTML = S.log.length ? S.log.map(function (l, i) {
            var r = RES[l.res];
            return '<button type="button" class="tb-sum__row" data-idx="' + i + '" data-res="' + l.res + '" style="--i:' + i + '" aria-label="' + QZ.esc(l.word) + ': ' + r.label + '. Tocca per cambiare">' +
                '<span>' + QZ.esc(l.word) + (l.last ? '<small>allo scadere del tempo</small>' : '') + '</span>' +
                '<span class="chip ' + r.cls + '">' + QZ.icon(r.icon) + r.label + '</span></button>';
        }).join('') : '<p class="muted center">Nessuna carta giocata in questo turno.</p>';
    }

    function cycle(i) {
        var l = S.log[i];
        var order = ['ok', 'bad', 'skip'];
        var next = order[(order.indexOf(l.res) + 1) % 3];
        var d = points(next) - points(l.res);
        l.res = next;
        S.turnPts += d;
        team().score += d;
        QZ.sound.click();
        paintSummary();
        QZ.fx.pop($('#sum-list [data-idx="' + i + '"]'));
    }

    function nextTurn() {
        if (S.phase !== 'sum') return;
        var t = team();
        S.log.forEach(function (l) { t[l.res]++; });
        var ok = S.log.filter(function (l) { return l.res === 'ok'; }).length;
        if (ok > t.best) t.best = ok;
        S.turn++;
        if (S.turn >= S.teams.length) { S.turn = 0; S.round++; }
        if (S.round > S.rounds) { finish(); return; }
        showHand();
    }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    /* ---------- Fine partita ---------- */
    function finish() {
        // turno interrotto dalla pausa: conta quello che e' stato segnato finora
        if (S.phase === 'pause') { var t = team(); S.log.forEach(function (l) { t[l.res]++; }); }
        S.phase = 'done';
        timer.pause();
        QZ.wake.off();
        var ranked = S.teams.slice().sort(function (a, b) { return b.score - a.score || b.ok - a.ok; });
        var top = ranked[0];
        var tie = ranked[1] && ranked[1].score === top.score;
        var tot = S.teams.reduce(function (s, t) { return s + t.ok; }, 0);
        var bad = S.teams.reduce(function (s, t) { return s + t.bad; }, 0);
        var best = S.teams.reduce(function (s, t) { return Math.max(s, t.best); }, 0);
        var r = QZ.profile.record('taboo', {
            xp: Math.min(150, 15 + tot * 3),
            label: (tie ? 'Pareggio a ' : 'Vince ' + top.name + ' con ') + top.score + ' punti',
            score: best
        });
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio!' : 'Vince ' + top.name + '!',
            subtitle: tie ? 'Stessi punti in vetta: ci vuole lo spareggio.' : 'Nessuno l\'ha detto, tutti l\'hanno capito.',
            big: top.score, bigSuffix: ' pt',
            record: r,
            stats: [
                { label: 'Carte indovinate', value: tot },
                { label: 'Parole vietate', value: bad },
                { label: 'Miglior turno', value: plural(best, 'carta', 'carte') },
                { label: 'Giri', value: Math.min(S.round, S.rounds) + '/' + S.rounds }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                return { name: t.name, score: t.score, color: t.color, sub: plural(t.ok, 'indovinata', 'indovinate') + ' · ' + plural(t.bad, 'vietata', 'vietate') + ' · ' + plural(t.skip, 'passata', 'passate') };
            }), function (s) { return s + ' pt'; }) + '</div>',
            share: (tie ? 'Pareggio' : top.name + ' vince') + ' a Taboo su Quizzotti con ' + top.score + ' punti! Riuscite a spiegare il calcio senza dire le parole vietate?',
            onRetry: start
        });
        var row = $('#end-host .row.mt-3:last-child');
        if (row) {
            var b = QZ.el('<button type="button" class="btn btn--ghost btn--lg">' + QZ.icon('users') + 'Cambia impostazioni</button>');
            b.addEventListener('click', function () { QZ.show('s-start'); });
            row.insertBefore(b, row.lastElementChild);
        }
    }
})();
