/* ==========================================================================
   QUIZZOTTI v2 — Intesa Vincente
   Dati: assets/db-intesavincente.js (`words`: elenco di parole).
   Rispetto alla v1: da 2 a 6 squadre, tempo, giri e passi a scelta, parole
   che non si ripetono (anche tra le partite), passi che si azzerano davvero
   a ogni turno (prima il tasto restava disattivato), tempo per rispondere
   dopo la prenotazione opzionale, pausa, riepilogo correggibile, classifica.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('intesavincente', words);

    /* ---------- Impostazioni ---------- */
    var OPT_KEY = 'qz.intesavincente.opts';
    var opts = Object.assign({ time: 60, rounds: 3, skips: 2, answer: 0 }, QZ.store.get(OPT_KEY, {}) || {});
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Inizia la partita';
    $('#medal').innerHTML = QZ.icon('users');
    $('#rules').innerHTML = [
        ['Tre per squadra:', 'chi indovina si gira, gli altri due vedono la parola.'],
        ['Una parola a testa:', 'i suggeritori si alternano, niente gesti né frasi.'],
        ['Prenota', 'per fermare il tempo e rispondere: se è giusta, un punto.'],
        ['Parola difficile?', 'Usate un passo. Alla fine dei giri vince chi ha più punti.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var rec = QZ.profile.best('intesavincente');
    $('#start-record').textContent = rec != null ? 'Record di parole indovinate in un turno: ' + rec : '';

    var teamsList = QZ.playerList($('#teams-host'), { key: 'intesavincente', min: 2, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (2-6)' });

    QZ.segmented($('#opt-time'), [{ label: '45 s', value: 45 }, { label: '60 s', value: 60 }, { label: '90 s', value: 90 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-rounds'), [1, 2, 3, 5].map(function (n) { return { label: String(n), value: n }; }), opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-skips'), [0, 2, 3, 5].map(function (n) { return { label: n ? String(n) : 'Nessuno', value: n }; }), opts.skips, function (v) { opts.skips = v; saveOpts(); });
    QZ.segmented($('#opt-answer'), [{ label: 'Libero', value: 0 }, { label: '5 s', value: 5 }, { label: '10 s', value: 10 }], opts.answer, function (v) { opts.answer = v; saveOpts(); });

    $('#go-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Pronti, via!';
    $('#pause-btn').innerHTML = QZ.icon('pause');
    $('#buzz-btn').innerHTML = QZ.icon('zap') + 'Prenota';
    $('#ok-btn').innerHTML = QZ.icon('check') + 'Giusta';
    $('#ko-btn').innerHTML = QZ.icon('x') + 'Sbagliata';
    $('#hand-rules').innerHTML = [
        ['Chi indovina', 'si gira di spalle: non deve vedere lo schermo.'],
        ['I due suggeritori', 'tengono il telefono e premono Prenota quando il compagno vuole rispondere.']
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
    var answerTimer = new QZ.Timer({
        seconds: 5, bar: $('#answer-bar'),
        onSecond: function (s) { if (s > 0 && S.phase === 'buzz') QZ.sound.tock(); },
        onExpire: function () {
            if (S.phase !== 'buzz') return;
            QZ.toast('Tempo per rispondere scaduto', { icon: 'clock', type: 'bad' });
            judge(false);
        }
    });

    /* ---------- Stato ---------- */
    var S = { phase: 'idle' };

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
        QZ.sound.start();
        showHand();
    }

    function team() { return S.teams[S.turn]; }

    function showHand() {
        S.phase = 'hand';
        var t = team();
        $('#s-turn').style.setProperty('--c', t.color);
        $('#hand-badge').innerHTML = QZ.icon('users');
        $('#hand-round').textContent = 'Giro ' + S.round + ' di ' + S.rounds + ' · tocca a';
        $('#hand-name').textContent = t.name;
        $('#hand-scores').innerHTML = S.teams.map(function (x, i) {
            return '<div class="team' + (i === S.turn ? ' is-active' : '') + '" style="--c:' + x.color + '"><span class="team__dot"></span>' +
                '<span class="team__name">' + QZ.esc(x.name) + '</span><span class="team__score">' + x.score + '</span></div>';
        }).join('');
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
        $('#state').textContent = 'Si parte tra poco';
        setButtons('play');
        $('#buzz-btn').disabled = true;
        paintSkip();
        timer.reset(S.time);
        timer.warnAt = 0.34;
        timer.dangerAt = 10 / S.time;
        timer.render();
        QZ.show('s-game');
        QZ.countdown(3).then(function () {
            S.phase = 'play';
            $('#buzz-btn').disabled = false;
            deal(false);
            timer.start();
        });
    }

    function setButtons(mode) {
        $('#act-play').hidden = mode !== 'play';
        $('#act-judge').hidden = mode !== 'buzz';
        $('#card').classList.toggle('is-buzz', mode === 'buzz');
        $('#answer-bar').hidden = !(mode === 'buzz' && S.answer);
    }

    function paintSkip() {
        var b = $('#skip-btn'), n = S.skipsLeft;
        b.innerHTML = QZ.icon('skip') + 'Passo<small>' + (n ? n + ' rimast' + (n === 1 ? 'o' : 'i') : 'finiti') + '</small>';
        b.disabled = n <= 0;
    }

    // resume: riparte il cronometro appena la nuova parola e' a schermo
    function deal(anim, resume) {
        var card = $('#card');
        var show = function () {
            S.cur = deck.draw();
            card.classList.remove('is-go');
            $('#word').textContent = S.cur;
            $('#state').innerHTML = QZ.icon('message') + 'Una parola a testa';
            QZ.fx.replay(card);
            if (S.phase === 'anim') S.phase = 'play';
            if (resume && S.phase === 'play') timer.start();
        };
        if (anim && !QZ.reducedMotion()) {
            S.phase = 'anim';
            card.classList.remove('is-in');
            card.classList.add('is-go');
            setTimeout(function () { if (S.phase === 'anim') show(); }, 180);
        } else show();
    }

    function buzz() {
        if (S.phase !== 'play' || !S.cur) return;
        S.phase = 'buzz';
        timer.pause();
        QZ.sound.buzzer();
        QZ.vibrate(80);
        QZ.fx.flash();
        setButtons('buzz');
        $('#state').innerHTML = QZ.icon('zap') + 'Prenotato! La risposta?';
        QZ.fx.pop($('#card'));
        if (S.answer) { answerTimer.reset(S.answer); answerTimer.start(); }
        $('#ok-btn').focus({ preventScroll: true });
    }

    function skip() {
        if (S.phase !== 'play' || !S.cur) return;
        if (S.skipsLeft <= 0) { QZ.fx.shake($('#skip-btn')); return; }
        S.skipsLeft--;
        S.log.push({ word: S.cur, res: 'skip' });
        S.cur = null;
        paintSkip();
        QZ.sound.whoosh();
        deal(true);
    }

    function judge(ok) {
        if (S.phase !== 'buzz') return;
        answerTimer.pause();
        var t = team(), pts = $('#hud-pts');
        S.log.push({ word: S.cur, res: ok ? 'ok' : 'bad' });
        S.cur = null;
        if (ok) {
            S.turnPts++;
            t.score++;
            pts.textContent = S.turnPts;
            QZ.sound.correct();
            QZ.vibrate(40);
            QZ.fx.sparks($('#word'), t.color);
            QZ.fx.floatText(pts, '+1');
            QZ.fx.pop(pts);
        } else {
            QZ.sound.wrong();
            QZ.vibrate([60, 40, 60]);
            QZ.fx.shake($('#card'));
        }
        S.phase = 'play';
        setButtons('play');
        deal(true, true);
    }

    function pause() {
        if (S.phase !== 'play') return;
        S.phase = 'pause';
        timer.pause();
        QZ.modal({
            title: 'Pausa',
            text: 'Il tempo è fermo. Riprendete quando siete pronti.',
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
        if (S.cur) S.log.push({ word: S.cur, res: 'skip', last: true });
        S.cur = null;
        setTimeout(showSummary, 500);
    }

    var RES = {
        ok: { label: 'Giusta', cls: 'chip--ok', icon: 'check' },
        bad: { label: 'Sbagliata', cls: 'chip--bad', icon: 'x' },
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
        $('#sum-pts').textContent = (S.turnPts > 0 ? '+' : '') + S.turnPts;
        $('#sum-total').textContent = 'Punti nel turno · totale squadra: ' + team().score;
        $('#sum-list').innerHTML = S.log.length ? S.log.map(function (l, i) {
            var r = RES[l.res];
            return '<button type="button" class="iv-sum__row" data-idx="' + i + '" data-res="' + l.res + '" style="--i:' + i + '" aria-label="' + QZ.esc(l.word) + ': ' + r.label + '. Tocca per cambiare">' +
                '<span>' + QZ.esc(l.word) + (l.last ? '<small>allo scadere del tempo</small>' : '') + '</span>' +
                '<span class="chip ' + r.cls + '">' + QZ.icon(r.icon) + r.label + '</span></button>';
        }).join('') : '<p class="muted center">Nessuna parola giocata in questo turno.</p>';
    }

    function cycle(i) {
        var l = S.log[i];
        var order = ['ok', 'bad', 'skip'];
        var next = order[(order.indexOf(l.res) + 1) % 3];
        var d = (next === 'ok' ? 1 : 0) - (l.res === 'ok' ? 1 : 0);
        l.res = next;
        S.turnPts += d;
        team().score += d;
        QZ.sound.click();
        paintSummary();
        QZ.fx.pop($('#sum-list [data-idx="' + i + '"]'));
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

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

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
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio!' : 'Vince ' + top.name + '!',
            subtitle: tie ? 'Intesa perfetta in vetta: serve lo spareggio.' : 'Questa sì che è intesa vincente.',
            big: top.score, bigSuffix: ' pt',
            record: r,
            stats: [
                { label: 'Parole indovinate', value: tot },
                { label: 'Risposte sbagliate', value: S.teams.reduce(function (s, t) { return s + t.bad; }, 0) },
                { label: 'Miglior turno', value: plural(best, 'parola', 'parole') },
                { label: 'Giri', value: Math.min(S.round, S.rounds) + '/' + S.rounds }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                return { name: t.name, score: t.score, color: t.color, sub: plural(t.ok, 'giusta', 'giuste') + ' · ' + plural(t.bad, 'sbagliata', 'sbagliate') + ' · ' + plural(t.skip, 'passata', 'passate') };
            }), function (s) { return s + ' pt'; }) + '</div>',
            share: (tie ? 'Pareggio' : top.name + ' vince') + ' a Intesa Vincente su Quizzotti con ' + top.score + ' parole indovinate! Quanta intesa avete voi?',
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
