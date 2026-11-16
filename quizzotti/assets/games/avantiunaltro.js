/* ==========================================================================
   QUIZZOTTI v2 — Avanti un Altro (il quiz al contrario)
   Dati: assets/db-avantiunaltro.js (`fullDatabase`, {q, a, b, correct:'A'|'B'}).
   Per salire di un gradino si sceglie la risposta SBAGLIATA; chi prende
   quella giusta torna a zero. Posizione A/B rimescolata, tempo per risposta,
   scala da 10/15/20, domande nuove o stesse dopo l'errore, blocco dei doppi
   clic, cronometro al decimo, resa, record di tempo per scala, statistiche
   di carriera e, a fine partita, il ripasso delle domande dove si e' caduti.
   Riflettori: tempo, gradino e serie migliore sul tabellone a LED; la scala
   e' una fila di lampadine che si accendono salendo (la serie migliore resta
   accesa a meta'); l'errore e' la scritta rossa "Si riparte da zero" su
   tutto lo schermo, la sirena e le lampadine che si spengono una a una.
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- Logica pura (testata in tests/avantiunaltro.test.js) ---------- */
    var PACE_XP = { 0: 1, 8: 1.25, 5: 1.6 };

    /** 83.47 -> "1:23,4" (il decimo si tronca, come un cronometro vero). */
    function fmtTime(sec) {
        var tenths = Math.max(0, Math.floor(sec * 10 + 1e-6));
        var m = Math.floor(tenths / 600), s = (tenths - m * 600) / 10;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',');
    }

    /** Domanda pronta per il gioco, con le due risposte in ordine casuale. */
    function prepare(raw, rnd) {
        var flip = (rnd || Math.random)() < 0.5;
        var right = raw.correct === 'A' ? 0 : 1;
        return {
            text: raw.q,
            options: flip ? [raw.b, raw.a] : [raw.a, raw.b],
            correct: flip ? 1 - right : right
        };
    }

    /** XP della partita: serie migliore, risposte date, bonus per la cima e per il ritmo. */
    function xpFor(o) {
        return Math.round((o.best * 4 + o.answered + (o.win ? 30 + o.target * 2 : 0)) * (PACE_XP[o.pace] || 1));
    }

    /** Pagella: in cima al primo colpo e' un 10, ogni ripartenza costa qualcosa. */
    function ratioFor(o) {
        if (!o.win) return 0.85 * o.best / o.target;
        return Math.max(0.55, Math.min(1, 1 - (o.tries - 1) * 0.07 - (o.pace ? 0 : 0.1)));
    }

    var core = { fmtTime: fmtTime, prepare: prepare, xpFor: xpFor, ratioFor: ratioFor, PACE_XP: PACE_XP };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ---------- Gioco ---------- */
    var $ = QZ.$;
    var GAME = 'avantiunaltro';
    var LETTERS = ['A', 'B'];
    var MILESTONES = { 5: 'Cinque di fila. Non guardarti indietro', 10: 'Dieci di fila. Le gambe tremano?', 15: 'Quindici. Ormai è fatta, quasi' };

    var deck = new QZ.Deck(GAME, fullDatabase, function (q) { return q.q; });
    var set = Object.assign({ len: 20, pace: 8, after: 'new' }, QZ.store.get('qz.avanti.settings', {}) || {});
    if ([10, 15, 20].indexOf(set.len) < 0) set.len = 20;
    if ([0, 5, 8].indexOf(set.pace) < 0) set.pace = 8;
    if (set.after !== 'same') set.after = 'new';
    var S = {};
    var timer = null;
    var clockIv = 0;
    var starting = false; // blocca il doppio tap sul fischio d'inizio
    var reduced = QZ.reducedMotion();

    /** setTimeout legato alla partita in corso: se nel frattempo ne parte un'altra, non scatta. */
    function later(fn, ms) {
        var game = S;
        return setTimeout(function () { if (S === game && !game.done) fn(); }, ms);
    }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('fastforward');
    $('#rules').innerHTML = [
        ['Prendi la sbagliata.', 'Delle due risposte tocca quella che NON è vera: sali di un gradino.'],
        ['Prendi la giusta?', 'La serie si azzera e si riparte dal gradino uno. Anche se il tempo scade.'],
        ['Il cronometro corre.', 'Pochi secondi a risposta, e quello della partita non si ferma mai.'],
        ['Arriva in cima', 'nel minor tempo possibile. Se non ce la fai, chiedi il cambio.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#g-twist').innerHTML = QZ.icon('zap') + '<span>Tocca la <b>sbagliata</b></span>';
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Chiedo il cambio';

    function saveSet() { QZ.store.set('qz.avanti.settings', set); paintRecord(); }
    QZ.segmented($('#set-len'), [{ label: '10', value: 10 }, { label: '15', value: 15 }, { label: '20', value: 20 }], set.len, function (v) { set.len = v; saveSet(); });
    QZ.segmented($('#set-pace'), [{ label: 'Libero', value: 0 }, { label: '8 sec', value: 8 }, { label: '5 sec', value: 5 }], set.pace, function (v) { set.pace = v; saveSet(); });
    QZ.segmented($('#set-after'), [{ label: 'Domande nuove', value: 'new' }, { label: 'Le stesse', value: 'same' }], set.after, function (v) { set.after = v; saveSet(); });

    $('#g-answers').innerHTML = LETTERS.map(function (l, i) {
        return '<button type="button" class="answer" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key">' + l + '</span><span class="answer__text"></span></button>';
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
        if (document.hidden) clockPause();
        else if (!S.paused) clockResume(); // con il "Chiedi il cambio" aperto il tempo resta fermo
    });

    paintRecord();

    /* ---------- Record e statistiche ---------- */
    function timeKey() { return set.len + '-' + set.pace; }
    function bestTimes() { return QZ.store.get('qz.avanti.times', {}) || {}; }
    function stats() { return Object.assign({ played: 0, wins: 0, picks: 0 }, QZ.store.get('qz.avanti.stats', {}) || {}); }
    function paintRecord() {
        var rec = QZ.profile.best(GAME);
        var t = bestTimes()[timeKey()];
        var st = stats();
        var parts = [];
        if (rec) parts.push('Miglior serie: ' + rec + ' di fila');
        if (t) parts.push('record su questa scala: ' + fmtTime(t));
        if (st.played) parts.push(st.wins + (st.wins === 1 ? ' scala completata' : ' scale completate') + ' su ' + st.played + (st.played === 1 ? ' partita' : ' partite'));
        if (st.picks) parts.push(st.picks + ' risposte sbagliate apposta in carriera');
        $('#start-record').textContent = parts.join(' · ');
    }

    /* ---------- Cronometro totale (si ferma se l'app va in background) ---------- */
    function clockNow() { return S.clockAcc + (S.clockFrom ? performance.now() - S.clockFrom : 0); }
    function clockPause() { if (S.clockFrom) { S.clockAcc += performance.now() - S.clockFrom; S.clockFrom = 0; } }
    function clockResume() { if (!S.clockFrom && !document.hidden) S.clockFrom = performance.now(); }
    function paintClock() { $('#g-clock').textContent = fmtTime(clockNow() / 1000); }

    /* ---------- La scala ---------- */
    function buildSteps() {
        var host = $('#g-steps');
        var h = '';
        for (var i = 0; i < S.target; i++) h += '<span class="au-step">' + (i + 1) + '</span>';
        host.innerHTML = h;
        host.style.setProperty('--n', S.target);
        host.style.setProperty('--half', S.target <= 10 ? S.target : Math.ceil(S.target / 2));
        S.cells = QZ.$$('.au-step', host);
    }

    function paintSteps() {
        S.cells.forEach(function (b, i) {
            var ok = i < S.chain, bad = i === S.failAt;
            b.classList.toggle('is-ok', ok);
            b.classList.toggle('is-bad', bad);
            b.classList.toggle('is-now', i === S.chain && S.failAt < 0 && S.running);
            b.classList.toggle('is-old', !ok && !bad && i < S.best);
            b.classList.remove('is-off');
        });
    }

    /** Dopo l'errore le lampadine accese si spengono una a una, dall'ultima alla prima. */
    function switchOff(from, within) {
        var cells = S.cells;
        var off = function (i) {
            var b = cells[i];
            if (!b) return;
            b.classList.remove('is-ok');
            b.classList.add('is-old');
            QZ.fx.replay(b, 'is-off');
        };
        if (reduced) { for (var j = 0; j < from; j++) off(j); return; }
        var gap = from ? Math.min(70, within / from) : 0;
        for (var i = from - 1, k = 0; i >= 0; i--, k++) later(off.bind(null, i), k * gap);
    }

    /* ---------- Flusso ---------- */
    function start() {
        if (starting) return;
        starting = true;
        reduced = QZ.reducedMotion();
        S = {
            target: set.len, pace: set.pace, same: set.after === 'same',
            chain: 0, best: 0, tries: 1, answered: 0, rts: [], failAt: -1, log: [],
            list: null, q: null, active: false, running: false, paused: false, pendingLoad: false,
            done: false, clockAcc: 0, clockFrom: 0, cells: []
        };
        if (S.same) S.list = buildList();
        $('#g-bar').hidden = !S.pace;
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.pace || 1, bar: $('#g-bar'), warnAt: 0.5, dangerAt: 0.3,
            onSecond: function (s) { if (s <= 3 && s > 0) QZ.sound.tick(); },
            onExpire: function () { if (S.active) fail(-1); }
        });
        buildSteps();
        paintTop();
        paintSteps();
        $('#g-qn').innerHTML = QZ.icon('ball') + 'Pronti';
        $('#g-question').textContent = 'Due risposte. Prendi quella sbagliata.';
        $('#g-qcard').classList.remove('is-bad');
        answerEls.forEach(function (el) { el.className = 'answer'; el.disabled = true; el.querySelector('.answer__text').textContent = '…'; });
        $('#g-board').classList.remove('is-stopped');
        var recT = bestTimes()[timeKey()];
        $('#g-rec').textContent = recT ? fmtTime(recT) : '-:--,-';
        $('#g-clock').textContent = fmtTime(0);
        QZ.show('s-game');
        QZ.sound.start();
        QZ.wake.on();
        var game = S;
        setTimeout(function () {
            QZ.countdown(3, 'Via!').then(function () {
                starting = false;
                if (S !== game) return;
                S.running = true;
                clockResume();
                clearInterval(clockIv);
                clockIv = setInterval(paintClock, 100);
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
        var last = S.chain === S.target - 1;
        var label = last ? 'Ultimo gradino' : 'Gradino ' + (S.chain + 1) + ' di ' + S.target;
        $('#g-qn').innerHTML = QZ.icon(last ? 'flame' : 'ball') + label;
        var qe = $('#g-question');
        qe.textContent = S.q.text;
        QZ.fx.replay(qe);
        $('#g-qcard').classList.remove('is-bad');
        answerEls.forEach(function (el, i) {
            el.className = 'answer';
            el.disabled = false;
            el.removeAttribute('aria-label');
            QZ.$$('.qz-mark, .qz-stamp', el).forEach(function (m) { m.remove(); });
            el.querySelector('.answer__text').textContent = S.q.options[i];
            QZ.fx.replay(el);
        });
        paintSteps();
        // una frase sola per il lettore di schermo: gradino e domanda (le risposte si leggono col Tab)
        QZ.say(label + (last ? ', ' + S.target + ' di ' + S.target : '') + '. ' + S.q.text);
        // il fuoco non resta su un bottone spento o sulla copertina: torna sulla risposta A
        var a = document.activeElement;
        if (!document.querySelector('.qz-modal') && (!a || a === document.body || a.disabled || a.offsetParent === null)) answerEls[0].focus({ preventScroll: true });
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
        answerEls[1 - i].classList.add('is-dim');
        QZ.sound.correct();
        QZ.vibrate(25);
        if (rt < 1.6) QZ.fx.floatText(el, 'Lampo!');
        paintTop(true);
        paintSteps();
        QZ.fx.pop(S.cells[S.chain - 1]);
        if (S.chain >= S.target) { later(function () { finish(true); }, 650); return; }
        if (MILESTONES[S.chain]) {
            QZ.sound.levelUp();
            QZ.fx.sparks($('#g-chain'), null, 14);
            QZ.toast(MILESTONES[S.chain], { icon: 'flame', type: 'ok', ms: 1500 });
        }
        later(load, reduced ? 150 : 440);
    }

    function fail(i) {
        lock();
        var right = 1 - S.q.correct; // la risposta che andava presa (quella sbagliata)
        if (i >= 0) {
            S.answered++;
            S.rts.push((performance.now() - S.t0) / 1000);
            answerEls[i].classList.add('is-wrong');
        } else {
            answerEls[S.q.correct].classList.add('is-dim');
        }
        S.log.push({ q: S.q.text, truth: S.q.options[S.q.correct], take: S.q.options[right], step: S.chain + 1, time: i < 0 });
        // quella da prendere si cerchia di verde
        QZ.fx.mark(answerEls[right], 'circle', 'var(--led-green)');
        S.failAt = S.chain;
        QZ.sound.buzzer();
        QZ.vibrate([80, 40, 80]);
        QZ.fx.shake($('#g-qcard'));
        $('#g-qcard').classList.add('is-bad');
        paintSteps();

        var ov = QZ.el('<div class="au-reset" aria-hidden="true"></div>');
        document.body.appendChild(ov);
        var text = i < 0 ? 'Tempo scaduto' : S.chain === 0 ? 'Subito fuori' : S.chain === S.target - 1 ? 'A un passo dalla cima' : 'Si riparte da zero';
        QZ.fx.stamp(ov, text, 'bad', {
            size: Math.round(QZ.clamp(window.innerWidth * 0.1, 30, 72)), quiet: true,
            say: text + (i < 0 ? '' : ': hai preso la giusta') + '. Andava presa la ' + LETTERS[right] + ', ' + S.q.options[right] + '. Si riparte dal gradino uno.'
        });
        // l'overlay si toglie sempre, anche se la partita nel frattempo finisce
        setTimeout(function () { ov.remove(); }, reduced ? 600 : 800);
        // la scritta si toglie e si vede la scala che si spegne
        var lit = S.chain;
        later(function () { switchOff(lit, 380); }, reduced ? 0 : 820);
        later(function () {
            S.chain = 0;
            S.tries++;
            paintTop(true);
            load();
        }, reduced ? 650 : 1400);
    }

    function two(n) { return String(n).padStart(2, '0'); }

    function paintTop(bump) {
        var c = $('#g-chain');
        c.innerHTML = two(S.chain) + '<small>/' + S.target + '</small>';
        if (bump) QZ.fx.pop(c);
        $('#g-try').textContent = 'Tentativo ' + S.tries;
        var b = $('#g-best');
        if (b.textContent !== two(S.best)) { b.textContent = two(S.best); if (bump) QZ.fx.pop(b); }
        b.title = 'Miglior serie di questa partita';
    }

    function giveUp() {
        // a scala completata la festa e' gia' partita: niente cambio
        if (!S.running || S.paused || S.done || S.chain >= S.target) return;
        var game = S;
        var wasActive = S.active;
        S.active = false;
        S.paused = true;
        if (timer) timer.pause();
        clockPause();
        QZ.confirm('Esci dal campo e a referto resta la tua serie migliore: ' + S.best + ' di fila.', { title: 'Chiedi il cambio?', okLabel: 'Esco', cancelLabel: 'Resto in campo', danger: true }).then(function (ok) {
            if (S !== game || S.done) return;
            S.paused = false;
            if (ok) { finish(false); return; }
            clockResume();
            if (S.pendingLoad) { S.pendingLoad = false; load(); }
            else if (wasActive) { S.active = true; if (S.pace) timer.start(); }
        });
    }

    /* ---------- Fine partita ---------- */
    function reviewHTML() {
        if (!S.log.length) return '<p class="au-clean mt-3">Mai inciampato: nemmeno una risposta giusta presa per sbaglio.</p>';
        var rows = S.log.slice(-12).reverse().map(function (l) {
            return '<li class="au-review__row"><span class="au-review__tag">' + (l.time ? 'Tempo' : 'Gr. ' + l.step) + '</span><div>' +
                '<div class="au-review__q">' + QZ.esc(l.q) + '</div>' +
                '<div class="au-review__a">Vera: <b>' + QZ.esc(l.truth) + '</b> · da prendere: ' + QZ.esc(l.take) + '</div></div></li>';
        }).join('');
        var more = S.log.length > 12 ? '<p class="small muted mt-2">Le ultime 12 di ' + S.log.length + ' cadute.</p>' : '';
        return '<details class="au-review mt-3"' + (S.log.length <= 3 ? ' open' : '') + '><summary>Dove sei inciampato · ' + S.log.length + '</summary><ul>' + rows + '</ul>' + more + '</details>';
    }

    function finish(win) {
        if (S.done) return;
        S.done = true;
        S.active = false;
        S.running = false;
        clockPause();
        clearInterval(clockIv);
        paintClock();
        QZ.wake.off();
        $('#g-board').classList.add('is-stopped');
        if (timer) timer.pause();
        var total = Math.floor(clockNow() / 100) / 10;
        var avg = S.rts.length ? S.rts.reduce(function (a, b) { return a + b; }, 0) / S.rts.length : 0;

        var timeRecord = false;
        var prev = bestTimes()[timeKey()];
        if (win && (prev == null || total < prev)) {
            var times = bestTimes();
            timeRecord = prev != null;
            times[timeKey()] = total;
            QZ.store.set('qz.avanti.times', times);
        }
        var st = stats();
        st.played++;
        if (win) st.wins++;
        st.picks += S.answered - S.log.filter(function (l) { return !l.time; }).length;
        QZ.store.set('qz.avanti.stats', st);

        var r = QZ.profile.record(GAME, {
            xp: xpFor({ best: S.best, answered: S.answered, win: win, target: S.target, pace: S.pace }),
            label: win ? 'Scala da ' + S.target + ' in ' + fmtTime(total) : 'Serie di ' + S.best + '/' + S.target,
            score: S.best
        });
        var best = bestTimes()[timeKey()];
        var gap = win && prev != null && !timeRecord ? total - prev : null;

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: win,
            icon: win ? 'fastforward' : 'flag',
            title: win ? 'Avanti un altro!' : S.best >= S.target / 2 ? 'Esce tra gli applausi' : 'Cambio al primo tempo',
            subtitle: win
                ? 'Hai sbagliato apposta ' + S.target + ' volte di fila' + (S.tries > 1 ? ', al tentativo numero ' + S.tries + '.' : ', al primo colpo.') +
                  (timeRecord ? ' Record della scala abbassato.' : gap != null ? ' A ' + gap.toFixed(1).replace('.', ',') + ' s dal tuo record.' : '')
                : 'La serie migliore è stata di ' + S.best + ' su ' + S.target + '. La cima era là.',
            big: win ? total : S.best,
            bigDecimals: win ? 1 : 0,
            bigSuffix: win ? ' s' : '/' + S.target,
            record: { newRecord: r.newRecord || timeRecord, xp: r.xp },
            ratio: ratioFor({ win: win, tries: S.tries, pace: S.pace, best: S.best, target: S.target }),
            stats: [
                { label: 'Tentativi', value: S.tries },
                { label: 'Risposte date', value: S.answered },
                { label: 'Tempo medio', value: avg.toFixed(1).replace('.', ',') + ' s' },
                { label: win ? 'Record scala' : 'Miglior serie', value: win ? fmtTime(best) : S.best + '/' + S.target }
            ],
            extraHTML: reviewHTML(),
            share: win
                ? 'Ho completato Avanti un Altro su Quizzotti: ' + S.target + ' risposte sbagliate di fila in ' + fmtTime(total) +
                  (S.tries > 1 ? ', al tentativo ' + S.tries : ', al primo colpo') + '. Sei più veloce?'
                : 'Ad Avanti un Altro su Quizzotti sono arrivato a ' + S.best + ' risposte sbagliate di fila su ' + S.target + '. Fai di meglio?',
            onRetry: start,
            secondary: { label: 'Cambia scala', icon: 'list', onClick: function () { QZ.show('s-start'); paintRecord(); } }
        });
        paintRecord();
    }
})();
