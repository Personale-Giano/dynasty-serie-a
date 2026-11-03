/* ==========================================================================
   QUIZZOTTI v2 — Avanti un Altro (il quiz al contrario)
   Dati: assets/db-avantiunaltro.js (`fullDatabase`, {q, a, b, correct:'A'|'B'}).
   Per salire di un gradino si sceglie la risposta SBAGLIATA; chi prende
   quella giusta torna a zero. Novita' rispetto alla v1: posizione A/B
   rimescolata (nel database la giusta era la A 3 volte su 4), tempo per
   risposta, scala da 10/15/20, domande nuove o stesse dopo l'errore,
   blocco dei doppi clic, cronometro preciso, resa e record di tempo.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'avantiunaltro';
    var LETTERS = ['A', 'B'];
    var MILESTONES = { 5: 'Cinque di fila!', 10: 'Dieci! Sei in fiamme', 15: 'Quindici, quasi fatta!' };
    var PACE_XP = { 0: 1, 8: 1.25, 5: 1.6 };

    var deck = new QZ.Deck(GAME, fullDatabase, function (q) { return q.q; });
    var set = Object.assign({ len: 20, pace: 8, after: 'new' }, QZ.store.get('qz.avanti.settings', {}) || {});
    var S = {};
    var timer = null;
    var clockIv = 0;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Gioca';
    $('#medal').innerHTML = QZ.icon('fastforward');
    $('#rules').innerHTML = [
        ['Scegli la sbagliata.', 'Delle due risposte tocca quella che NON è corretta: sali di un gradino.'],
        ['Prendi la giusta?', 'La serie si azzera e ricominci dal primo gradino.'],
        ['Contro il tempo.', 'Pochi secondi per risposta e il cronometro totale non si ferma mai.'],
        ['Completa la scala', 'nel minor tempo possibile, oppure arrenditi e tieni il record.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#g-twist').innerHTML = QZ.icon('zap') + '<span>Tocca la risposta sbagliata</span>';
    $('#g-clockwrap').insertAdjacentHTML('afterbegin', QZ.icon('clock'));
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Mi arrendo';

    function saveSet() { QZ.store.set('qz.avanti.settings', set); paintRecord(); }
    QZ.segmented($('#set-len'), [{ label: '10', value: 10 }, { label: '15', value: 15 }, { label: '20', value: 20 }], set.len, function (v) { set.len = v; saveSet(); });
    QZ.segmented($('#set-pace'), [{ label: 'Libero', value: 0 }, { label: '8 secondi', value: 8 }, { label: '5 secondi', value: 5 }], set.pace, function (v) { set.pace = v; saveSet(); });
    QZ.segmented($('#set-after'), [{ label: 'Domande nuove', value: 'new' }, { label: 'Stesse domande', value: 'same' }], set.after, function (v) { set.after = v; saveSet(); });

    $('#g-answers').innerHTML = LETTERS.map(function (l, i) {
        return '<button type="button" class="answer" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key">' + l + '</span><span class="answer__text"></span><span class="answer__tag"></span></button>';
    }).join('');
    var answerEls = QZ.$$('#g-answers .answer');
    answerEls.forEach(function (el) {
        el.addEventListener('click', function () { pick(Number(el.dataset.i)); });
    });

    $('#start-btn').addEventListener('click', start);
    $('#g-quit').addEventListener('click', giveUp);

    document.addEventListener('keydown', function (e) {
        if (!S.active || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.qz-modal')) return;
        var k = e.key.toUpperCase();
        var idx = k === 'A' || k === '1' || k === 'ARROWLEFT' ? 0 : k === 'B' || k === '2' || k === 'ARROWRIGHT' ? 1 : -1;
        if (idx >= 0) { e.preventDefault(); pick(idx); }
    });

    document.addEventListener('visibilitychange', function () {
        if (!S.running) return;
        if (document.hidden) clockPause(); else clockResume();
    });

    paintRecord();

    /* ---------- Helper ---------- */
    function timeKey() { return set.len + '-' + set.pace; }
    function bestTimes() { return QZ.store.get('qz.avanti.times', {}) || {}; }
    function fmtTime(sec) {
        var m = Math.floor(sec / 60), s = sec - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',');
    }
    function paintRecord() {
        var rec = QZ.profile.best(GAME);
        var t = bestTimes()[timeKey()];
        var parts = [];
        if (rec) parts.push('Miglior serie: ' + rec + ' di fila');
        if (t) parts.push('record su questa scala: ' + fmtTime(t));
        $('#start-record').textContent = parts.join(' · ');
    }

    /** Domanda pronta per il gioco, con le due risposte in ordine casuale. */
    function prepare(raw) {
        var flip = Math.random() < 0.5;
        var right = raw.correct === 'A' ? 0 : 1;
        return {
            text: raw.q,
            options: flip ? [raw.b, raw.a] : [raw.a, raw.b],
            correct: flip ? 1 - right : right
        };
    }

    /* ---------- Cronometro totale (si ferma se l'app va in background) ---------- */
    function clockNow() { return S.clockAcc + (S.clockFrom ? performance.now() - S.clockFrom : 0); }
    function clockPause() { if (S.clockFrom) { S.clockAcc += performance.now() - S.clockFrom; S.clockFrom = 0; } }
    function clockResume() { if (!S.clockFrom) S.clockFrom = performance.now(); }
    function paintClock() {
        var sec = Math.floor(clockNow() / 1000);
        $('#g-clock').textContent = Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
    }

    /* ---------- Flusso ---------- */
    function start() {
        S = {
            target: set.len, pace: set.pace, same: set.after === 'same',
            chain: 0, best: 0, tries: 1, answered: 0, rts: [], failAt: -1,
            list: null, q: null, active: false, running: false, clockAcc: 0, clockFrom: 0
        };
        if (S.same) S.list = buildList();
        $('#g-bar').hidden = !S.pace;
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.pace || 1, bar: $('#g-bar'), warnAt: 0.5, dangerAt: 0.3,
            onSecond: function (s) { if (s <= 3 && s > 0) QZ.sound.tick(); },
            onExpire: function () { if (S.active) fail(-1); }
        });
        paintTop();
        paintTrack();
        $('#g-question').textContent = '';
        answerEls.forEach(function (el) { el.className = 'answer'; el.disabled = true; el.querySelector('.answer__text').textContent = ''; });
        $('#g-clock').textContent = '0:00';
        QZ.show('s-game');
        QZ.sound.start();
        setTimeout(function () {
            QZ.countdown(3).then(function () {
                S.running = true;
                clockResume();
                clearInterval(clockIv);
                clockIv = setInterval(paintClock, 250);
                load();
            });
        }, 350);
    }

    function buildList() {
        var out = [];
        for (var i = 0; i < set.len; i++) out.push(prepare(deck.draw()));
        return out;
    }

    function load() {
        if (S.done) return;
        if (S.paused) { S.pendingLoad = true; return; }
        S.q = S.same ? S.list[S.chain] : prepare(deck.draw());
        S.failAt = -1;
        $('#g-qn').innerHTML = QZ.icon('ball') + 'Gradino ' + (S.chain + 1) + ' di ' + S.target;
        var qe = $('#g-question');
        qe.textContent = S.q.text;
        QZ.fx.replay(qe);
        $('#g-qcard').classList.remove('is-flash-bad');
        answerEls.forEach(function (el, i) {
            el.className = 'answer';
            el.disabled = false;
            el.querySelector('.answer__text').textContent = S.q.options[i];
            el.querySelector('.answer__tag').textContent = '';
            QZ.fx.replay(el);
        });
        paintTrack();
        S.t0 = performance.now();
        S.active = true;
        if (S.pace) { timer.reset(S.pace); timer.start(); }
    }

    function lock() {
        S.active = false;
        if (timer) timer.pause();
        answerEls.forEach(function (el) { el.disabled = true; });
    }

    function pick(i) {
        if (!S.active) return;
        if (i === S.q.correct) { fail(i); return; }
        lock();
        var rt = (performance.now() - S.t0) / 1000;
        S.rts.push(rt);
        S.answered++;
        S.chain++;
        if (S.chain > S.best) S.best = S.chain;
        var el = answerEls[i];
        el.classList.add('is-correct');
        el.querySelector('.answer__tag').textContent = 'Sbagliata!';
        answerEls[1 - i].classList.add('is-dim');
        QZ.sound.correct();
        QZ.vibrate(25);
        QZ.fx.sparks(el, null, 12);
        QZ.fx.floatText(el, rt < 1.6 ? 'Lampo!' : '+1');
        paintTop(true);
        paintTrack();
        if (S.chain >= S.target) { setTimeout(function () { finish(true); }, 600); return; }
        if (MILESTONES[S.chain]) {
            QZ.sound.levelUp();
            QZ.toast(MILESTONES[S.chain], { icon: 'flame', type: 'ok', ms: 1400 });
        }
        setTimeout(load, QZ.reducedMotion() ? 150 : 420);
    }

    function fail(i) {
        lock();
        if (i >= 0) {
            S.answered++;
            S.rts.push((performance.now() - S.t0) / 1000);
            answerEls[i].classList.add('is-wrong');
            answerEls[i].querySelector('.answer__tag').textContent = 'Era giusta!';
            answerEls[1 - i].classList.add('is-correct');
            answerEls[1 - i].querySelector('.answer__tag').textContent = 'Sbagliata';
        } else {
            answerEls[S.q.correct].classList.add('is-wrong');
            answerEls[S.q.correct].querySelector('.answer__tag').textContent = 'Era giusta';
        }
        S.failAt = S.chain;
        QZ.sound.buzzer();
        QZ.vibrate([80, 40, 80]);
        QZ.fx.shake($('#g-qcard'));
        $('#g-qcard').classList.add('is-flash-bad');
        QZ.fx.flash('rgba(255, 77, 109, .45)');
        paintTrack();
        var ov = QZ.el('<div class="au-reset" aria-hidden="true"><span>' + (i < 0 ? 'Tempo scaduto!' : 'Si riparte da zero!') + '</span></div>');
        document.body.appendChild(ov);
        setTimeout(function () { ov.remove(); }, 1150);
        setTimeout(function () {
            if (S.done) return;
            S.chain = 0;
            S.tries++;
            paintTop(true);
            load();
        }, QZ.reducedMotion() ? 500 : 1250);
    }

    function paintTop(bump) {
        var c = $('#g-chain');
        c.innerHTML = S.chain + '<small>/' + S.target + '</small>';
        if (bump) QZ.fx.pop(c);
        $('#g-try').textContent = 'Tentativo ' + S.tries;
        var s = $('#g-streak');
        s.innerHTML = QZ.icon('flame') + '<span>' + S.best + '</span>';
        s.title = 'Miglior serie di questa partita';
        s.classList.toggle('is-hot', S.chain >= 5);
    }

    function paintTrack() {
        var h = '';
        for (var i = 0; i < S.target; i++) {
            var cls = i < S.chain ? 'is-ok' : i === S.failAt ? 'is-bad' : i === S.chain && S.failAt < 0 ? 'is-now' : i < S.best ? 'is-old' : '';
            h += '<i class="' + cls + '"></i>';
        }
        $('#g-track').innerHTML = h;
    }

    function giveUp() {
        if (!S.running) return;
        var wasActive = S.active;
        S.active = false;
        S.paused = true;
        if (timer) timer.pause();
        clockPause();
        QZ.confirm('La partita finisce qui e conservi la miglior serie (' + S.best + ' di fila).', { title: 'Ti arrendi?', okLabel: 'Mi arrendo', cancelLabel: 'Continuo', danger: true }).then(function (ok) {
            S.paused = false;
            if (ok) { finish(false); return; }
            clockResume();
            if (S.pendingLoad) { S.pendingLoad = false; load(); }
            else if (wasActive) { S.active = true; if (S.pace) timer.start(); }
        });
    }

    /* ---------- Fine partita ---------- */
    function finish(win) {
        if (S.done) return;
        S.done = true;
        S.active = false;
        S.running = false;
        clockPause();
        clearInterval(clockIv);
        if (timer) timer.pause();
        var total = Math.round(clockNow() / 100) / 10;
        var avg = S.rts.length ? S.rts.reduce(function (a, b) { return a + b; }, 0) / S.rts.length : 0;

        var timeRecord = false;
        if (win) {
            var times = bestTimes();
            var prev = times[timeKey()];
            if (prev == null || total < prev) {
                timeRecord = prev != null;
                times[timeKey()] = total;
                QZ.store.set('qz.avanti.times', times);
            }
        }
        var xp = Math.round((S.best * 4 + S.answered + (win ? 30 + S.target * 2 : 0)) * (PACE_XP[S.pace] || 1));
        var r = QZ.profile.record(GAME, {
            xp: xp,
            label: win ? 'Scala da ' + S.target + ' in ' + fmtTime(total) : 'Serie di ' + S.best + '/' + S.target,
            score: S.best
        });
        var best = bestTimes()[timeKey()];

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: win,
            icon: win ? 'fastforward' : 'flag',
            title: win ? 'Avanti un altro!' : 'Ti sei arreso',
            subtitle: win
                ? 'Hai sbagliato apposta ' + S.target + ' volte di fila' + (S.tries > 1 ? ', al tentativo numero ' + S.tries + '.' : ' al primo colpo!')
                : 'La tua serie migliore è stata di ' + S.best + ' risposte sbagliate di fila su ' + S.target + '.',
            big: win ? total : S.best,
            bigDecimals: win ? 1 : 0,
            bigSuffix: win ? ' s' : '/' + S.target,
            record: { newRecord: r.newRecord || timeRecord, xp: r.xp },
            stats: [
                { label: 'Tentativi', value: S.tries },
                { label: 'Risposte date', value: S.answered },
                { label: 'Tempo medio', value: avg.toFixed(1).replace('.', ',') + ' s' },
                { label: win ? 'Record scala' : 'Miglior serie', value: win ? fmtTime(best) : S.best + '/' + S.target }
            ],
            share: win
                ? 'Ho completato Avanti un Altro su Quizzotti: ' + S.target + ' risposte sbagliate di fila in ' + fmtTime(total) + '. Sei più veloce?'
                : 'Ad Avanti un Altro su Quizzotti sono arrivato a ' + S.best + ' risposte sbagliate di fila. Fai di meglio?',
            onRetry: start
        });
        paintRecord();
    }
})();
