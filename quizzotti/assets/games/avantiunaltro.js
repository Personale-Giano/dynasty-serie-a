/* ==========================================================================
   QUIZZOTTI v2 — Avanti un Altro (il quiz al contrario)
   Dati: assets/db-avantiunaltro.js (`fullDatabase`, {q, a, b, correct:'A'|'B'}).
   Per salire di un gradino si sceglie la risposta SBAGLIATA; chi prende
   quella giusta torna a zero. Posizione A/B rimescolata, tempo per risposta,
   scala da 10/15/20, domande nuove o stesse dopo l'errore, blocco dei doppi
   clic, cronometro al decimo, resa, record di tempo per scala, statistiche
   di carriera e, a fine partita, il ripasso delle domande dove si e' caduti.
   Serie migliore separata per scala (10/15/20). Modalita' «Finale», come in
   TV: un tempo solo per tutta la scala e un montepremi che cala a ogni errore.
   Riflettori: tempo, gradino e serie migliore sul tabellone a LED; la scala
   e' una fila di lampadine che si accendono salendo (la serie migliore resta
   accesa a meta'); l'errore e' la scritta rossa "Si riparte da zero" su
   tutto lo schermo, la sirena e le lampadine che si spengono una a una.
   Sfida un amico (assets/sfida.js): il link porta modalita', scala, tempo e
   «domande nuove/le stesse», il seme (posizione di A e B) e le domande uscite;
   l'amico gioca le stesse, nello stesso ordine. Il punteggio della sfida e'
   un numero solo (scoreOf): in cima batte sempre chi non c'e' arrivato.
   La partita di sfida non tocca mazzo, record e statistiche.
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

    var LENS = [10, 15, 20];

    /**
     * Serie migliori per lunghezza della scala ({10: n, 15: n, 20: n}).
     * Il vecchio record era uno solo per tutte le scale: si assegna una volta
     * alla scala impostata allora (se ci sta), altrimenti alla piu' corta in cui
     * puo' essere stato fatto (una serie di 18 viene per forza da una scala da 20).
     */
    function seriesMap(map, legacy, savedLen) {
        var out = {};
        var src = map && typeof map === 'object' ? map : {};
        LENS.forEach(function (l) { var v = Number(src[l]); if (v > 0) out[l] = Math.min(v, l); });
        legacy = Number(legacy) || 0;
        if (Object.keys(out).length || legacy <= 0) return out;
        var len = LENS.indexOf(savedLen) >= 0 && legacy <= savedLen ? savedLen : LENS.filter(function (l) { return l >= legacy; })[0] || 20;
        out[len] = Math.min(legacy, len);
        return out;
    }

    /* Il finale, come in TV: un tempo solo per tutta la scala e un montepremi che cala a ogni errore. */
    var FINALE = { pot: 100000, cut: 10000, secPerStep: 7 };
    function finaleSeconds(len) { return len * FINALE.secPerStep; }
    function finalePot(errors) { return Math.max(0, FINALE.pot - errors * FINALE.cut); }
    /** Pagella del finale: in cima col montepremi intero e' un 10, a mani vuote conta la serie. */
    function finaleRatio(o) {
        if (!o.win) return 0.55 * o.best / o.target;
        return 0.6 + 0.4 * o.pot / FINALE.pot;
    }

    /**
     * Il punteggio della sfida, piu' alto e' meglio: in cima = 1.000.000 meno i decimi
     * di secondo (classica) o piu' il montepremi (finale); altrimenti la serie migliore.
     */
    var TOP = 1000000;
    function scoreOf(o) {
        if (!o.win) return Math.max(0, o.best | 0);
        return o.finale ? TOP + Math.max(0, o.pot | 0) : Math.max(TOP / 2, TOP - Math.round(o.total * 10));
    }
    /** Il punteggio della sfida a parole: «in cima in 1:23,4», «in cima con 70.000 €», «serie di 12». */
    function scoreText(v, finale, fmt) {
        if (v < TOP / 2) return 'serie di ' + v;
        return finale ? 'in cima con ' + (fmt ? fmt(v - TOP) : v - TOP) + ' €' : 'in cima in ' + fmtTime((TOP - v) / 10);
    }
    /** Le regole della sfida: 'classic-20-8-new' (modalita', scala, secondi, dopo l'errore). */
    function optOf(o) { return [o.finale ? 'finale' : 'classic', o.len, o.pace, o.same ? 'same' : 'new'].join('-'); }
    function parseOpt(s) {
        var p = String(s || '').split('-');
        var len = Number(p[1]), pace = Number(p[2]);
        return { finale: p[0] === 'finale', len: LENS.indexOf(len) >= 0 ? len : 20, pace: [0, 5, 8].indexOf(pace) >= 0 ? pace : 8, same: p[3] === 'same' };
    }

    var core = {
        scoreOf: scoreOf, scoreText: scoreText, optOf: optOf, parseOpt: parseOpt, TOP: TOP,
        fmtTime: fmtTime, prepare: prepare, xpFor: xpFor, ratioFor: ratioFor, PACE_XP: PACE_XP,
        seriesMap: seriesMap, FINALE: FINALE, finaleSeconds: finaleSeconds, finalePot: finalePot, finaleRatio: finaleRatio
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ---------- Gioco ---------- */
    var $ = QZ.$;
    var GAME = 'avantiunaltro';
    var LETTERS = ['A', 'B'];
    var MILESTONES = { 5: 'Cinque di fila. Non guardarti indietro', 10: 'Dieci di fila. Le gambe tremano?', 15: 'Quindici. Ormai è fatta, quasi' };

    var mainDeck = new QZ.Deck(GAME, fullDatabase, function (q) { return q.q; });
    // da dove si pesca: il mazzo vero, attraverso la sorgente della sfida (assets/sfida.js) che annota le domande uscite
    var deck = mainDeck;
    var SF = QZ.sfida || null;
    var CH = SF ? SF.read(GAME, fullDatabase.length) : null;   // la sfida arrivata col link
    function rnd() { return S.rng ? S.rng() : Math.random(); }
    var set = Object.assign({ len: 20, pace: 8, after: 'new', mode: 'classic' }, QZ.store.get('qz.avanti.settings', {}) || {});
    if (LENS.indexOf(set.len) < 0) set.len = 20;
    if ([0, 5, 8].indexOf(set.pace) < 0) set.pace = 8;
    if (set.after !== 'same') set.after = 'new';
    if (set.mode !== 'finale') set.mode = 'classic';
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

    // le serie migliori per scala: la prima volta si converte il vecchio record unico
    (function () {
        var saved = QZ.store.get('qz.avanti.series', null);
        var m = seriesMap(saved, QZ.profile.best(GAME), set.len);
        if (!saved && Object.keys(m).length) QZ.store.set('qz.avanti.series', m);
    })();

    function saveSet() { QZ.store.set('qz.avanti.settings', set); paintMode(); paintRecord(); }
    QZ.segmented($('#set-mode'), [{ label: 'Classica', value: 'classic' }, { label: 'Finale', value: 'finale' }], set.mode, function (v) { set.mode = v; saveSet(); });
    QZ.segmented($('#set-len'), [{ label: '10', value: 10 }, { label: '15', value: 15 }, { label: '20', value: 20 }], set.len, function (v) { set.len = v; saveSet(); });
    QZ.segmented($('#set-pace'), [{ label: 'Libero', value: 0 }, { label: '8 sec', value: 8 }, { label: '5 sec', value: 5 }], set.pace, function (v) { set.pace = v; saveSet(); });
    QZ.segmented($('#set-after'), [{ label: 'Domande nuove', value: 'new' }, { label: 'Le stesse', value: 'same' }], set.after, function (v) { set.after = v; saveSet(); });

    /** Nel finale il tempo e' uno solo per tutta la scala: il tempo a risposta non c'e'. */
    function paintMode() {
        var fin = set.mode === 'finale';
        $('#set-pace').hidden = fin;
        $('#lbl-pace').textContent = fin ? 'Tempo del finale' : 'Tempo a risposta';
        var note = $('#set-pace-note');
        note.hidden = !fin;
        note.textContent = fin ? finaleSeconds(set.len) + ' secondi per tutta la scala da ' + set.len + '. Montepremi di ' + QZ.fmt(FINALE.pot) + ' €: ogni risposta giusta presa ne brucia ' + QZ.fmt(FINALE.cut) + '.' : '';
    }
    paintMode();

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
        else if (!S.paused || S.finale) clockResume(); // con il "Chiedi il cambio" aperto il tempo resta fermo (non nel finale)
    });

    paintRecord();

    /* ---------- Record e statistiche ---------- */
    function timeKey() { return set.len + '-' + set.pace; }
    function bestTimes() { return QZ.store.get('qz.avanti.times', {}) || {}; }
    function bestSeries() { return seriesMap(QZ.store.get('qz.avanti.series', null), 0, set.len); }
    function bestPots() { var p = QZ.store.get('qz.avanti.finale', {}); return p && typeof p === 'object' ? p : {}; }
    function stats() { return Object.assign({ played: 0, wins: 0, picks: 0 }, QZ.store.get('qz.avanti.stats', {}) || {}); }
    function paintRecord() {
        var rec = bestSeries()[set.len];
        var st = stats();
        var parts = [];
        if (rec) parts.push('Miglior serie sulla scala da ' + set.len + ': ' + rec + ' di fila');
        if (set.mode === 'finale') {
            var pot = bestPots()[set.len];
            if (pot != null) parts.push('miglior finale da ' + set.len + ': ' + (pot ? QZ.fmt(pot) + ' €' : 'a mani vuote'));
            setRecordText(parts);
            return;
        }
        var t = bestTimes()[timeKey()];
        if (t) parts.push('record di tempo: ' + fmtTime(t));
        if (st.played) parts.push(st.wins + (st.wins === 1 ? ' scala completata' : ' scale completate') + ' su ' + st.played + (st.played === 1 ? ' partita' : ' partite'));
        if (st.picks) parts.push(st.picks + ' risposte sbagliate apposta in carriera');
        setRecordText(parts);
    }
    function setRecordText(parts) {
        var t = parts.join(' · ');
        $('#start-record').textContent = t.charAt(0).toUpperCase() + t.slice(1);
    }

    /* ---------- Cronometro totale (si ferma se l'app va in background) ---------- */
    function clockNow() { return S.clockAcc + (S.clockFrom ? performance.now() - S.clockFrom : 0); }
    function clockPause() { if (S.clockFrom) { S.clockAcc += performance.now() - S.clockFrom; S.clockFrom = 0; } }
    function clockResume() { if (!S.clockFrom && !document.hidden) S.clockFrom = performance.now(); }
    function paintClock() {
        if (!S.finale) { $('#g-clock').textContent = fmtTime(clockNow() / 1000); return; }
        // nel finale il tabellone conta alla rovescia e la barra e' il tempo che resta per tutta la scala
        var left = Math.max(0, S.limit - clockNow() / 1000);
        $('#g-clock').textContent = fmtTime(left + 0.0999);
        var bar = $('#g-bar'), k = left / S.limit;
        bar.querySelector('.timer-bar__fill').style.transform = 'scaleX(' + k + ')';
        bar.classList.toggle('is-warn', k <= 0.5 && k > 0.25);
        bar.classList.toggle('is-danger', k <= 0.25);
        var sec = Math.ceil(left);
        if (S.running && sec !== S.lastSec) { S.lastSec = sec; if (sec <= 5 && sec > 0) QZ.sound.tick(); }
        // con il «Chiedi il cambio» aperto il finale non si chiude sotto la finestra: si chiude appena torna in campo
        if (left <= 0 && S.running && !S.paused && !S.done && S.chain < S.target) finish(false, 'time');
    }

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
    /** kind 'sfida': regole e domande del link (CH), senza toccare mazzo, record e statistiche. */
    function start(kind) {
        if (starting) return;
        starting = true;
        reduced = QZ.reducedMotion();
        var ch = kind === 'sfida' ? CH : null;
        var rules = ch ? parseOpt(ch.opt) : { finale: set.mode === 'finale', len: set.len, pace: set.pace, same: set.after === 'same' };
        var fin = rules.finale;
        S = {
            ch: ch, seed: ch ? ch.seed : SF ? SF.newSeed() : 0,
            target: rules.len, pace: fin ? 0 : rules.pace, same: rules.same,
            finale: fin, limit: finaleSeconds(rules.len), pot: FINALE.pot, errors: 0, lastSec: -1,
            chain: 0, best: 0, tries: 1, answered: 0, rts: [], failAt: -1, log: [],
            list: null, q: null, active: false, running: false, paused: false, pendingLoad: false,
            done: false, clockAcc: 0, clockFrom: 0, cells: []
        };
        // il seme decide dove stanno A e B; le domande si annotano per la sfida
        S.rng = SF ? SF.rng(S.seed) : null;
        S.src = SF ? SF.source(mainDeck, fullDatabase, ch, S.rng) : null;
        deck = S.src || mainDeck;
        if (ch) SF.kickoff(ch, scoreText(ch.score, fin, QZ.fmt));
        if (S.same) S.list = buildList();
        var bar = $('#g-bar');
        bar.hidden = !S.pace && !fin;
        bar.classList.remove('is-warn', 'is-danger');
        bar.querySelector('.timer-bar__fill').style.transform = '';
        $('#s-game').classList.toggle('is-finale', fin);
        $('#g-lbl-clock').textContent = fin ? 'Restano' : 'Tempo';
        $('#g-lbl-best').textContent = fin ? 'Montepremi €' : 'Serie max';
        $('#g-lbl-rec').textContent = fin ? 'Serie max' : 'Record';
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.pace || 1, bar: fin ? null : bar, warnAt: 0.5, dangerAt: 0.3,
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
        if (fin) {
            $('#g-rec').textContent = two(0);
            $('#g-rec').title = 'Miglior serie di questa partita';
            $('#g-clock').textContent = fmtTime(S.limit);
        } else {
            var recT = bestTimes()[timeKey()];
            $('#g-rec').textContent = recT ? fmtTime(recT) : '-:--,-';
            $('#g-rec').title = 'Il tuo tempo migliore su questa scala';
            $('#g-clock').textContent = fmtTime(0);
        }
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

    /** Con «Le stesse» si tengono le domande grezze: A e B si rimescolano a ogni giro, non si impara la posizione. */
    function buildList() {
        var out = [];
        for (var i = 0; i < S.target; i++) out.push(deck.draw());
        return out;
    }

    function load() {
        if (S.done) return;
        if (S.paused) { S.pendingLoad = true; return; }
        S.q = prepare(S.same ? S.list[S.chain] : deck.draw(), rnd);
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
        if (S.finale) {
            // nel finale ogni errore brucia una fetta del montepremi
            S.errors++;
            S.pot = finalePot(S.errors);
            paintTop(true);
            QZ.fx.floatText($('#g-best'), '-' + QZ.fmt(FINALE.cut));
        }
        QZ.sound.buzzer();
        QZ.vibrate([80, 40, 80]);
        QZ.fx.shake($('#g-qcard'));
        $('#g-qcard').classList.add('is-bad');
        paintSteps();

        var ov = QZ.el('<div class="au-reset" aria-hidden="true"></div>');
        document.body.appendChild(ov);
        var broke = S.finale && S.pot <= 0;
        var text = broke ? 'Montepremi azzerato' : i < 0 ? 'Tempo scaduto' : S.chain === 0 ? 'Subito fuori' : S.chain === S.target - 1 ? 'A un passo dalla cima' : 'Si riparte da zero';
        QZ.fx.stamp(ov, text, 'bad', {
            size: Math.round(QZ.clamp(window.innerWidth * 0.1, 30, 72)), quiet: true,
            say: text + (i < 0 ? '' : ': hai preso la giusta') + '. Andava presa la ' + LETTERS[right] + ', ' + S.q.options[right] + '.' +
                (S.finale ? ' Montepremi: ' + QZ.fmt(S.pot) + ' euro.' : '') + (broke ? '' : ' Si riparte dal gradino uno.')
        });
        // l'overlay si toglie sempre, anche se la partita nel frattempo finisce
        setTimeout(function () { ov.remove(); }, reduced ? 600 : 800);
        // la scritta si toglie e si vede la scala che si spegne
        var lit = S.chain;
        later(function () { switchOff(lit, 380); }, reduced ? 0 : 820);
        if (broke) { later(function () { finish(false, 'pot'); }, reduced ? 650 : 1400); return; }
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
        if (S.finale) {
            // nel finale la cella grande e' il montepremi, la serie migliore passa nell'ultima
            var pot = QZ.fmt(S.pot);
            if (b.textContent !== pot) { b.textContent = pot; if (bump) QZ.fx.pop(b); }
            b.title = 'Il montepremi che resta';
            b.classList.toggle('led--red', S.pot < FINALE.pot / 2);
            $('#g-rec').textContent = two(S.best);
            return;
        }
        b.classList.remove('led--red');
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
        // nel finale il cronometro non si ferma: la finestra non e' un time-out
        if (!S.finale) clockPause();
        var msg = S.finale ? 'Lasci il finale e il montepremi resta in studio: esci a mani vuote.' : 'Esci dal campo e a referto resta la tua serie migliore: ' + S.best + ' di fila.';
        QZ.confirm(msg, { title: 'Chiedi il cambio?', okLabel: 'Esco', cancelLabel: 'Resto in campo', danger: true }).then(function (ok) {
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

    /** La serie migliore di questa scala: vale per tutte e due le modalita'. Torna true se e' un record battuto. */
    function saveSeries() {
        var m = bestSeries(), prev = m[S.target];
        if (!S.best || (prev != null && S.best <= prev)) return false;
        m[S.target] = S.best;
        QZ.store.set('qz.avanti.series', m);
        return prev != null;
    }

    function finish(win, why) {
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
        var ch = S.ch;
        var seriesRecord = ch ? false : saveSeries();
        if (S.finale) { finishFinale(win, why, total, avg, seriesRecord); return; }

        var timeRecord = false;
        var prev = ch ? null : bestTimes()[timeKey()];
        if (!ch && win && (prev == null || total < prev)) {
            var times = bestTimes();
            timeRecord = prev != null;
            times[timeKey()] = total;
            QZ.store.set('qz.avanti.times', times);
        }
        if (!ch) {
            var st = stats();
            st.played++;
            if (win) st.wins++;
            st.picks += S.answered - S.log.filter(function (l) { return !l.time; }).length;
            QZ.store.set('qz.avanti.stats', st);
        }

        var gained = xpFor({ best: S.best, answered: S.answered, win: win, target: S.target, pace: S.pace });
        var r = ch ? QZ.profile.record(GAME, { xp: Math.round(gained / 2), label: 'Sfida: ' + scoreText(scoreOf({ win: win, best: S.best, total: total }), false) })
            : QZ.profile.record(GAME, {
                xp: gained,
                label: win ? 'Scala da ' + S.target + ' in ' + fmtTime(total) : 'Serie di ' + S.best + '/' + S.target,
                score: S.best
            });
        r.newRecord = seriesRecord;
        var best = ch ? total : bestTimes()[timeKey()];
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
                { label: win ? (ch ? 'Il tuo tempo' : 'Record scala') : 'Miglior serie', value: win ? fmtTime(best) : S.best + '/' + S.target }
            ],
            extraHTML: challengeHTML(win, total) + reviewHTML(),
            share: win
                ? 'Ho completato Avanti un Altro su Quizzotti: ' + S.target + ' risposte sbagliate di fila in ' + fmtTime(total) +
                  (S.tries > 1 ? ', al tentativo ' + S.tries : ', al primo colpo') + '. Sei più veloce?'
                : 'Ad Avanti un Altro su Quizzotti sono arrivato a ' + S.best + ' risposte sbagliate di fila su ' + S.target + '. Fai di meglio?',
            retryLabel: ch ? 'Rigioca la sfida' : undefined,
            onRetry: ch ? playChallenge : start,
            secondary: ch ? { label: 'Partita normale', icon: 'list', onClick: function () { QZ.show('s-start'); paintRecord(); } }
                : { label: 'Cambia scala', icon: 'list', onClick: function () { QZ.show('s-start'); paintRecord(); } }
        });
        offerChallenge(win, total);
        paintRecord();
    }

    /* ---------- Sfida un amico ---------- */
    function myScore(win, total) { return scoreOf({ win: win, best: S.best, total: total, pot: win ? S.pot : 0, finale: S.finale }); }
    function challengeHTML(win, total) {
        if (!S.ch || !SF) return '';
        var fin = S.finale;
        return SF.verdictHTML(S.ch, myScore(win, total), function (v) { return scoreText(v, fin, QZ.fmt); });
    }
    function offerChallenge(win, total) {
        if (!SF || !S.src || !S.answered) return;
        var score = myScore(win, total), fin = S.finale, again = !!S.ch;
        var what = (fin ? 'finale' : 'classica') + ', scala da ' + S.target;
        SF.offer($('#end-host'), {
            game: GAME, title: 'Avanti un Altro', seed: S.seed, src: S.src, score: score,
            opt: optOf({ finale: fin, len: S.target, pace: S.pace, same: S.same }),
            text: function (name, url) {
                return (again ? 'Rilancio la sfida' : 'Ti sfido') + ' ad Avanti un Altro (' + what + '): ' + scoreText(score, fin, QZ.fmt) + '. ' +
                    'Le stesse domande per te, nello stesso ordine: riesci a battermi?\n' + url;
            }
        });
    }
    function playChallenge() { if (CH) start('sfida'); }
    if (CH && SF) {
        var chR = parseOpt(CH.opt);
        SF.intro({
            ch: CH, target: scoreText(CH.score, chR.finale, QZ.fmt),
            rules: 'Avanti un Altro, ' + (chR.finale ? 'finale' : 'classica') + ', scala da ' + chR.len + (chR.finale ? '' : chR.pace ? ', ' + chR.pace + ' secondi a risposta' : ', tempo libero') +
                ': le stesse domande, nello stesso ordine e con A e B negli stessi posti. Niente record in palio, solo l\'onore.',
            onPlay: playChallenge
        });
    }

    /** Fine del finale: in cima si porta a casa quello che resta del montepremi, altrimenti niente. */
    function finishFinale(win, why, total, avg, seriesRecord) {
        var won = win ? S.pot : 0;
        var ch = S.ch;
        var pots = bestPots(), prev = ch ? null : pots[S.target];
        var potRecord = !ch && win && prev != null && won > prev;
        if (!ch && (prev == null || won > prev)) { pots[S.target] = won; QZ.store.set('qz.avanti.finale', pots); }
        var full = won === FINALE.pot;
        var gained = xpFor({ best: S.best, answered: S.answered, win: win, target: S.target, pace: 8 }) + Math.round(won / 2000);
        var r = ch ? QZ.profile.record(GAME, { xp: Math.round(gained / 2), label: 'Sfida: finale da ' + S.target + ', ' + scoreText(myScore(win, total), true, QZ.fmt) })
            : QZ.profile.record(GAME, {
                xp: gained,
                label: win ? 'Finale da ' + S.target + ': ' + QZ.fmt(won) + ' €' : 'Finale da ' + S.target + ', serie di ' + S.best,
                score: S.best
            });
        var left = Math.max(0, S.limit - total);
        var title = win ? (full ? 'Montepremi intatto!' : 'Montepremi vinto') : why === 'pot' ? 'Montepremi azzerato' : why === 'time' ? 'Tempo scaduto' : 'Finale abbandonato';
        var sub = win
            ? (full ? 'Su in cima senza mai prendere la giusta: ' + QZ.fmt(won) + ' € tutti tuoi, con ' + fmtTime(left) + ' sul cronometro.'
                : 'In cima con ' + fmtTime(left) + ' da parte. ' + S.errors + (S.errors === 1 ? ' errore ti è costato ' : ' errori ti sono costati ') + QZ.fmt(FINALE.pot - won) + ' €.')
            : (why === 'pot' ? 'Dieci volte la risposta giusta: il montepremi è finito prima della scala.'
                : why === 'time' ? 'Il cronometro arriva a zero al gradino ' + (S.chain + 1) + ' di ' + S.target + '. Il montepremi resta in studio.'
                    : 'Esci dal finale a mani vuote.') + ' Serie migliore: ' + S.best + ' su ' + S.target + '.';
        if (potRecord) sub += ' È il tuo miglior finale su questa scala.';
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: win,
            icon: win ? 'trophy' : 'flag',
            title: title,
            subtitle: sub,
            big: win ? won : S.best,
            bigSuffix: win ? ' €' : '/' + S.target,
            record: { newRecord: potRecord || (!win && seriesRecord), xp: r.xp },
            ratio: finaleRatio({ win: win, pot: won, best: S.best, target: S.target }),
            stats: [
                { label: 'Errori', value: S.errors },
                { label: win ? 'Tempo avanzato' : 'Gradino', value: win ? fmtTime(left) : (S.chain + 1) + '/' + S.target },
                { label: 'Tempo medio', value: avg.toFixed(1).replace('.', ',') + ' s' },
                { label: 'Miglior finale', value: pots[S.target] ? QZ.fmt(pots[S.target]) + ' €' : '0 €' }
            ],
            extraHTML: challengeHTML(win, total) + reviewHTML(),
            share: win
                ? 'Al finale di Avanti un Altro su Quizzotti ho scalato ' + S.target + ' gradini e portato a casa ' + QZ.fmt(won) + ' € su ' + QZ.fmt(FINALE.pot) + '. Fai meglio?'
                : 'Al finale di Avanti un Altro su Quizzotti sono arrivato a ' + S.best + ' gradini su ' + S.target + ', a mani vuote. Ci provi tu?',
            retryLabel: ch ? 'Rigioca la sfida' : undefined,
            onRetry: ch ? playChallenge : start,
            secondary: ch ? { label: 'Partita normale', icon: 'list', onClick: function () { QZ.show('s-start'); paintRecord(); } }
                : { label: 'Cambia modalità', icon: 'list', onClick: function () { QZ.show('s-start'); paintRecord(); } }
        });
        offerChallenge(win, total);
        paintRecord();
    }
})();
