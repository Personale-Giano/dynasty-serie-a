/* ==========================================================================
   QUIZZOTTI v2 — Intesa Vincente
   Dati: assets/db-intesavincente.js (`words`: elenco di parole).
   Da 2 a 6 squadre, tempo, giri e passi a scelta, parole che non si
   ripetono (anche tra le partite), passi che si azzerano a ogni turno,
   tempo per rispondere dopo la prenotazione opzionale, time-out, resoconto
   del turno correggibile, classifica.
   Stile "Riflettori": la parola va sul maxischermo con lo stato a LED in alto,
   la prenotazione e' una scritta che si accende ("PRENOTATO"), i passi sono
   spie a LED e il tempo per rispondere una barra di LED che si spegne.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('intesavincente', words);

    /* ---------- Impostazioni ---------- */
    var OPT_KEY = 'qz.intesavincente.opts';
    var opts = Object.assign({ time: 60, rounds: 3, skips: 2, answer: 0 }, QZ.store.get(OPT_KEY, {}) || {});
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function rulesHTML(list) {
        return list.map(function (r, i) {
            return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
        }).join('');
    }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('users');
    $('#rules').innerHTML = rulesHTML([
        ['Tre per squadra:', 'chi indovina si gira, gli altri due vedono la parola.'],
        ['Una parola a testa:', 'i suggeritori si alternano. Niente gesti, niente frasi.'],
        ['Prenota', 'quando il compagno ce l\'ha: il cronometro si ferma e lui risponde.'],
        ['Parola tosta?', 'Si passa. Alla fine dei giri vince chi ne ha prese di più.']
    ]);
    var rec = QZ.profile.best('intesavincente');
    $('#start-record').textContent = rec != null ? 'record: ' + plural(rec, 'parola', 'parole') + ' in un turno' : '';

    var teamsList = QZ.playerList($('#teams-host'), { key: 'intesavincente', min: 2, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (2-6)' });

    QZ.segmented($('#opt-time'), [{ label: '45 s', value: 45 }, { label: '60 s', value: 60 }, { label: '90 s', value: 90 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-rounds'), [1, 2, 3, 5].map(function (n) { return { label: String(n), value: n }; }), opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-skips'), [0, 2, 3, 5].map(function (n) { return { label: n ? String(n) : 'Zero', value: n }; }), opts.skips, function (v) { opts.skips = v; saveOpts(); });
    QZ.segmented($('#opt-answer'), [{ label: 'Libero', value: 0 }, { label: '5 s', value: 5 }, { label: '10 s', value: 10 }], opts.answer, function (v) { opts.answer = v; saveOpts(); });

    $('#go-btn').innerHTML = 'Via col tempo' + QZ.icon('arrow');
    $('#pause-btn').innerHTML = QZ.icon('pause');
    $('#buzz-btn').innerHTML = QZ.icon('zap') + 'Prenota';
    $('#ok-btn').innerHTML = QZ.icon('check') + 'Giusta';
    $('#ko-btn').innerHTML = QZ.icon('x') + 'Sbagliata';
    $('#hand-rules').innerHTML = rulesHTML([
        ['Chi indovina', 'si gira di spalle: lo schermo non lo deve vedere.'],
        ['I due suggeritori', 'tengono il telefono e premono Prenota quando il compagno vuole rispondere.']
    ]);

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));
    var timer = new QZ.Timer({
        seconds: 60, ring: ring,
        onSecond: function (s) {
            if (s <= 10 && s > 0 && S.phase === 'play') QZ.sound.tick();
            // un solo avviso a voce, non un secondo alla volta
            if (s === 10 && S.time > 10) QZ.say('Ultimi 10 secondi.');
        },
        onExpire: function () { if (S.phase === 'play' || S.phase === 'anim') timeUp(); }
    });
    var answerTimer = new QZ.Timer({
        seconds: 5, bar: $('#answer-bar'), label: $('#answer-sec'),
        onSecond: function (s) { if (s > 0 && S.phase === 'buzz') QZ.sound.tock(); },
        onExpire: function () { if (S.phase === 'buzz') judge(false, 'Tempo!'); }
    });

    /* ---------- Stato ---------- */
    var S = { phase: 'idle' };

    /** Riporta il fuoco su un bottone di gioco (quello premuto si e' disattivato o nascosto). */
    function refocus(el) {
        var a = document.activeElement;
        if (!el || el.disabled || el.offsetParent === null) return;
        if (!a || a === document.body || a.disabled || a.offsetParent === null) el.focus({ preventScroll: true });
    }

    $('#start-btn').addEventListener('click', start);
    $('#go-btn').addEventListener('click', beginTurn);
    $('#buzz-btn').addEventListener('click', buzz);
    $('#skip-btn').addEventListener('click', skip);
    $('#ok-btn').addEventListener('click', function () { judge(true); });
    $('#ko-btn').addEventListener('click', function () { judge(false); });
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
        var onButton = t.closest && t.closest('button, a');
        if (S.phase === 'play') {
            if (k === ' ' || k === 'Enter') { if (onButton) return; e.preventDefault(); buzz(); }
            else if (k === 'ArrowDown' || k === 'p' || k === 'P') { e.preventDefault(); skip(); }
            else if (k === 'Escape') { e.preventDefault(); pause(); }
        } else if (S.phase === 'buzz') {
            if (k === 'ArrowRight' || k === 'g' || k === 'G') { e.preventDefault(); judge(true); }
            else if (k === 'ArrowLeft' || k === 's' || k === 'S') { e.preventDefault(); judge(false); }
        } else if (S.phase === 'hand' && k === ' ' && !onButton) {
            e.preventDefault(); beginTurn();
        }
    });

    /* ---------- Partita ---------- */
    function start() {
        var names = teamsList.get();
        S = {
            phase: 'hand', round: 1, turn: 0, rounds: opts.rounds, time: opts.time, skips: opts.skips, answer: opts.answer,
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, ok: 0, bad: 0, skip: 0, best: 0 }; }),
            log: [], cur: null
        };
        QZ.wake.on();
        QZ.sound.whistle();
        showHand();
    }

    function team() { return S.teams[S.turn]; }

    function showHand() {
        S.phase = 'hand';
        var t = team();
        $('#s-turn').style.setProperty('--c', t.color);
        $('#hand-round').textContent = S.rounds > 1 ? 'Giro ' + S.round + '/' + S.rounds : 'Giro unico';
        $('#hand-name').textContent = t.name;
        $('#hand-scores').innerHTML = S.teams.map(function (x, i) {
            return '<div class="team' + (i === S.turn ? ' is-active' : '') + '" style="--c:' + x.color + '"><span class="team__dot"></span>' +
                '<span class="team__name">' + QZ.esc(x.name) + '</span><span class="team__score">' + x.score + '</span></div>';
        }).join('');
        QZ.show('s-turn');
        QZ.say((S.rounds > 1 ? 'Giro ' + S.round + ' di ' + S.rounds + '. ' : '') + 'Tocca a ' + t.name + ': il telefono ai due suggeritori.');
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
        setState('Si parte tra poco', 'clock');
        QZ.$$('#card .qz-stamp').forEach(function (x) { x.remove(); });
        setButtons('play');
        $('#buzz-btn').disabled = true;
        paintSkip();
        timer.reset(S.time);
        timer.warnAt = 0.34;
        timer.dangerAt = 10 / S.time;
        timer.render();
        QZ.show('s-game');
        QZ.countdown(3, 'Via!').then(function () {
            S.phase = 'play';
            $('#buzz-btn').disabled = false;
            deal(false);
            timer.start();
            $('#buzz-btn').focus({ preventScroll: true });
        });
    }

    function setState(text, icon) {
        $('#state').innerHTML = QZ.icon(icon) + QZ.esc(text);
    }

    function setButtons(mode) {
        $('#act-play').hidden = mode !== 'play';
        $('#act-judge').hidden = mode !== 'buzz';
        $('#ok-btn').disabled = $('#ko-btn').disabled = false;
        $('#card').classList.toggle('is-buzz', mode === 'buzz');
        $('#answer-bar').hidden = $('#answer-sec').hidden = !(mode === 'buzz' && S.answer);
    }

    /**
     * I passi come spie a LED: accese quelle che restano, spente quelle usate.
     * fresh: indice della spia che si e' appena spenta (sfarfalla prima di spegnersi).
     */
    function pipsHTML(total, left, fresh) {
        var h = '';
        for (var i = 0; i < total; i++) h += '<i class="' + (i < left ? 'is-on' : '') + (i === fresh ? ' is-off-now' : '') + '"></i>';
        return '<span class="iv-pips" aria-hidden="true">' + h + '</span>';
    }

    function paintSkip(fresh) {
        var b = $('#skip-btn'), n = S.skipsLeft, total = S.skips;
        if (!total) {
            b.innerHTML = QZ.icon('skip') + 'Passo<small>niente passi</small>';
        } else {
            b.innerHTML = 'Passo' + pipsHTML(total, n, fresh) + '<small>' + (n ? n + (n === 1 ? ' rimasto' : ' rimasti') : 'finiti') + '</small>';
        }
        b.setAttribute('aria-label', 'Passo, ' + (n > 0 ? plural(n, 'rimasto', 'rimasti') : 'finiti'));
        b.disabled = n <= 0;
    }

    // resume: riparte il cronometro appena la nuova parola e' a schermo
    function deal(anim, resume) {
        var card = $('#card');
        var show = function () {
            S.cur = deck.draw();
            card.classList.remove('is-go');
            QZ.$$('.qz-stamp', card).forEach(function (x) { x.remove(); });
            $('#word').textContent = S.cur;
            // come in Taboo: la parola si legge a chi tiene il telefono (i suggeritori), chi indovina e' di spalle
            QZ.say('Parola: ' + S.cur + '.');
            setState('Una parola a testa', 'message');
            QZ.fx.replay(card);
            QZ.fx.replay($('#word'));
            if (S.phase === 'anim') S.phase = 'play';
            if (resume && S.phase === 'play') timer.start();
        };
        if (anim && !QZ.reducedMotion()) {
            S.phase = 'anim';
            card.classList.remove('is-in');
            card.classList.add('is-go');
            setTimeout(function () { if (S.phase === 'anim') show(); }, 170);
        } else show();
    }

    function buzz() {
        if (S.phase !== 'play' || !S.cur) return;
        S.phase = 'buzz';
        timer.pause();
        QZ.sound.buzzer();
        QZ.vibrate(80);
        setButtons('buzz');
        setState('La risposta?', 'zap');
        // la scritta si accende sotto la parola: i suggeritori la devono ancora leggere per giudicare
        var st = QZ.fx.stamp($('#card'), 'Prenotato', 'ink', { size: 40, say: 'Prenotato: la risposta?' + (S.answer ? ' ' + S.answer + ' secondi.' : '') });
        if (st) st.classList.add('is-low');
        if (S.answer) { answerTimer.reset(S.answer); answerTimer.start(); }
        $('#ok-btn').focus({ preventScroll: true });
    }

    function skip() {
        if (S.phase !== 'play' || !S.cur) return;
        if (S.skipsLeft <= 0) { QZ.fx.shake($('#skip-btn')); return; }
        S.skipsLeft--;
        S.log.push({ word: S.cur, res: 'skip' });
        S.cur = null;
        paintSkip(S.skipsLeft);
        QZ.sound.whoosh();
        QZ.say('Passo. ' + (S.skipsLeft ? plural(S.skipsLeft, 'passo rimasto', 'passi rimasti') : 'Passi finiti') + '.');
        deal(true);
        refocus($('#buzz-btn'));
    }

    // reason: la scritta quando la risposta non arriva in tempo
    function judge(ok, reason) {
        if (S.phase !== 'buzz') return;
        answerTimer.pause();
        S.phase = 'verdict';
        var t = team(), pts = $('#hud-pts'), card = $('#card');
        S.log.push({ word: S.cur, res: ok ? 'ok' : 'bad' });
        S.cur = null;
        // i tasti restano al loro posto (niente salti di layout) ma non si possono ripremere
        $('#ok-btn').disabled = $('#ko-btn').disabled = true;
        if (ok) {
            S.turnPts++;
            t.score++;
            pts.textContent = S.turnPts;
            QZ.fx.stamp(card, QZ.pick(['Gol!', 'Esatto', 'Che intesa']), 'ok', { size: 46, say: 'Giusta! ' + plural(S.turnPts, 'parola presa', 'parole prese') + ' in questo turno.' });
            QZ.sound.correct();
            QZ.vibrate(40);
            QZ.fx.floatText(pts, '+1');
            QZ.fx.pop(pts);
        } else {
            QZ.fx.stamp(card, reason || QZ.pick(['Palo', 'Fuori', 'Niente']), 'bad', { size: 46, say: reason ? 'Tempo scaduto per rispondere.' : 'Sbagliata.' });
            QZ.sound.wrong();
            QZ.vibrate([60, 40, 60]);
            QZ.fx.shake(card);
        }
        // la scritta resta accesa un attimo, poi parola nuova e cronometro che riparte
        setTimeout(function () {
            if (S.phase !== 'verdict') return;
            S.phase = 'play';
            setButtons('play');
            deal(true, true);
            refocus($('#buzz-btn'));
        }, QZ.reducedMotion() ? 250 : 520);
    }

    function pause() {
        if (S.phase !== 'play') return;
        S.phase = 'pause';
        timer.pause();
        $('#card').classList.add('is-covered');
        QZ.modal({
            title: 'Time-out',
            text: 'Cronometro fermo e maxischermo spento. Si riparte quando siete pronti.',
            actions: [{ label: 'Riprendi', primary: true, icon: 'play', value: 'go' }, { label: 'Chiudi qui', ghost: true, icon: 'whistle', value: 'end' }]
        }).then(function (v) {
            $('#card').classList.remove('is-covered');
            if (v === 'end') {
                QZ.confirm('Si va dritti alla classifica. Le parole di questo turno valgono.', { title: 'Fischio finale?', okLabel: 'Classifica', cancelLabel: 'Riprendi' }).then(function (ok) {
                    if (ok) finish();
                    else { S.phase = 'play'; timer.start(); }
                });
            } else { S.phase = 'play'; timer.start(); }
        });
    }

    function timeUp() {
        S.phase = 'sum';
        QZ.sound.whistle();
        QZ.vibrate([120, 60, 120]);
        if (S.cur) S.log.push({ word: S.cur, res: 'skip', last: true });
        S.cur = null;
        QZ.fx.stamp($('#card'), 'Tempo!', 'ink', { size: 48, say: 'Tempo! Fine del turno di ' + team().name + '.' });
        setTimeout(showSummary, 900);
    }

    /* ---------- Il resoconto del turno ---------- */
    var RES = {
        ok: { label: 'giusta', glyph: QZ.icon('check'), tone: 520 },
        bad: { label: 'sbagliata', glyph: QZ.icon('x'), tone: 260 },
        skip: { label: 'passata', glyph: 'PASSO', tone: 400 }
    };

    function showSummary() {
        var t = team();
        $('#s-sum').style.setProperty('--c', t.color);
        $('#sum-eyebrow').textContent = 'Fine del turno';
        $('#sum-title').textContent = t.name;
        paintSumHead();
        $('#sum-list').innerHTML = S.log.length ? S.log.map(function (l, i) {
            return '<button type="button" class="report__row" data-idx="' + i + '" data-res="' + l.res + '">' +
                '<span class="report__n" aria-hidden="true">' + (i + 1) + '</span>' +
                '<span class="report__word"><span>' + QZ.esc(l.word) + '</span>' + (l.last ? '<small>sul fischio finale</small>' : '') + '</span>' +
                '<span class="report__res" aria-hidden="true"></span></button>';
        }).join('') : '<p class="report__empty">Tabellone vuoto: nessuna parola in questo turno.</p>';
        S.log.forEach(function (l, i) { labelRow(i); });
        var last = S.turn === S.teams.length - 1 && S.round === S.rounds;
        $('#sum-next').innerHTML = last ? QZ.icon('trophy') + 'Classifica finale' : 'Tocca a ' + QZ.esc(S.teams[(S.turn + 1) % S.teams.length].name) + QZ.icon('arrow');
        QZ.show('s-sum');
        QZ.say(t.name + ': ' + plural(S.turnPts, 'parola presa', 'parole prese') + ' in questo turno, ' + plural(t.score, 'punto', 'punti') + ' in classifica.');
        // il resoconto si accende riga per riga
        var step = QZ.reducedMotion() ? 0 : 110;
        S.log.forEach(function (l, i) {
            setTimeout(function () { lightRow(i, step > 0); }, 300 + i * step);
        });
    }

    function paintSumHead() {
        $('#sum-pts').textContent = (S.turnPts > 0 ? '+' : '') + S.turnPts;
        $('#sum-total').textContent = plural(S.turnPts, 'parola presa', 'parole prese') + ' · in classifica ' + plural(team().score, 'punto', 'punti');
    }

    function labelRow(i) {
        var row = $('#sum-list [data-idx="' + i + '"]');
        if (!row) return;
        var l = S.log[i];
        row.dataset.res = l.res;
        row.setAttribute('aria-label', l.word + ': ' + RES[l.res].label + '. Tocca per cambiare');
    }

    /** Accende l'esito della riga sul suo pezzetto di tabellone: spunta verde, croce rossa, PASSO ambra. */
    function lightRow(i, sound) {
        var row = $('#sum-list [data-idx="' + i + '"]');
        if (!row) return;
        var res = S.log[i].res, r = RES[res];
        var box = row.querySelector('.report__res');
        box.dataset.res = res;
        box.innerHTML = r.glyph;
        QZ.fx.replay(box, 'is-on');
        if (sound) QZ.sound.tone(r.tone, 0.06, 'square', 0.04);
    }

    function cycle(i) {
        if (S.phase !== 'sum') return;
        var l = S.log[i];
        var order = ['ok', 'bad', 'skip'];
        var next = order[(order.indexOf(l.res) + 1) % 3];
        var d = (next === 'ok' ? 1 : 0) - (l.res === 'ok' ? 1 : 0);
        l.res = next;
        S.turnPts += d;
        team().score += d;
        QZ.sound.click();
        labelRow(i);
        lightRow(i, false);
        paintSumHead();
        QZ.say(l.word + ': ' + RES[l.res].label + '. ' + plural(S.turnPts, 'parola presa', 'parole prese') + ' nel turno.');
        QZ.fx.pop($('#sum-pts'));
    }

    function tally(t) {
        S.log.forEach(function (l) { t[l.res]++; });
        var ok = S.log.filter(function (l) { return l.res === 'ok'; }).length;
        if (ok > t.best) t.best = ok;
    }

    function nextTurn() {
        if (S.phase !== 'sum') return;
        tally(team());
        S.turn++;
        if (S.turn >= S.teams.length) { S.turn = 0; S.round++; }
        if (S.round > S.rounds) { finish(); return; }
        showHand();
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        if (S.phase === 'pause') tally(team()); // turno interrotto: conta quanto segnato
        S.phase = 'done';
        timer.pause();
        answerTimer.pause();
        QZ.wake.off();
        var ranked = S.teams.slice().sort(function (a, b) { return b.score - a.score; });
        var top = ranked[0];
        var tie = ranked[1] && ranked[1].score === top.score;
        var tot = S.teams.reduce(function (s, t) { return s + t.ok; }, 0);
        var best = S.teams.reduce(function (s, t) { return Math.max(s, t.best); }, 0);
        var r = QZ.profile.record('intesavincente', {
            xp: Math.min(150, 15 + tot * 3),
            label: (tie ? 'Pareggio a ' : 'Vince ' + top.name + ' con ') + top.score + ' punti',
            score: best
        });
        // pagella della squadra vincente: parole prese su parole viste (i passi pesano la meta')
        var seen = top.ok + top.bad + top.skip * 0.5;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio' : 'Vince ' + top.name,
            subtitle: tie ? 'Intesa perfetta in vetta. Serve lo spareggio.' : 'Questa sì che è intesa.',
            big: top.score, bigSuffix: ' pt',
            ratio: seen ? top.ok / seen : 0,
            record: r,
            stats: [
                { label: 'Parole prese', value: tot },
                { label: 'Sbagliate', value: S.teams.reduce(function (s, t) { return s + t.bad; }, 0) },
                { label: 'Miglior turno', value: plural(best, 'parola', 'parole') },
                { label: 'Giri', value: Math.min(S.round, S.rounds) + '/' + S.rounds }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                return { name: t.name, score: t.score, color: t.color, sub: plural(t.ok, 'giusta', 'giuste') + ' · ' + plural(t.bad, 'sbagliata', 'sbagliate') + ' · ' + plural(t.skip, 'passata', 'passate') };
            }), function (s) { return s + ' pt'; }) + '</div>',
            share: (tie ? 'Pareggio' : top.name + ' vince') + ' a Intesa Vincente su Quizzotti con ' + plural(top.score, 'parola presa', 'parole prese') + '. Quanta intesa avete voi?',
            onRetry: start,
            secondary: { label: 'Cambia impostazioni', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }
})();
