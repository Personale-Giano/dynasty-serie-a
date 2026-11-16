/* ==========================================================================
   QUIZZOTTI v2 — Caduta Libera (domande a raffica sulle botole)
   Dati: assets/db-cadutalibera.js (`cadutaDomande`, {q, ok, ko:[2], cat, diff}).
   Il concorrente sta su una fila di 10 botole sotto il faro. Domande a
   raffica con tre risposte (giusta mescolata a ogni domanda), tempo corto.
   Giusta: montepremi + moltiplicatore della serie. Sbagliata o tempo scaduto:
   si apre una botola, dai bordi verso i piedi. Il "Passo" salta la domanda
   senza aprire botole ma azzera la serie, e si usa due volte a partita.
   Si arriva in fondo alle 15/25/40 domande oppure si cade: chi cade si
   porta a casa solo meta' del montepremi. Difficolta' che sale (1 -> 3),
   QZ.Deck per non rivedere subito le stesse domande, record per lunghezza.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'cadutalibera';
    var KEYS = ['1', '2', '3'];
    var TILES = 10;
    // le botole si aprono dai bordi verso il centro: le ultime due sono sotto i piedi
    var ORDER = [0, 9, 1, 8, 2, 7, 3, 6, 5, 4];
    var PASSES = 2;
    var PACE_XP = { 10: 1, 7: 1.2, 5: 1.5 };

    var deck = new QZ.Deck(GAME, cadutaDomande, function (d) { return d.q; });
    var set = Object.assign({ len: 25, pace: 7, floor: 10 }, QZ.store.get('qz.caduta.settings', {}) || {});
    var S = {};
    var timer = null;
    var starting = false;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('zap');
    $('#rules').innerHTML = [
        ['Tre risposte, pochi secondi.', 'Una sola è quella giusta, e le domande si fanno più cattive man mano.'],
        ['Sbagli o vai lungo col tempo?', 'Si apre una botola. Prima ai bordi, poi sempre più vicino ai tuoi piedi.'],
        ['Il Passo ti salva la botola,', 'ma azzera la serie. E ne hai solo due.'],
        ['Di fila vale di più:', 'con 3, 6 e 10 risposte giuste il montepremi va per 2, per 3 e per 5. Se cadi, ne salvi la metà.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Mi fermo qui';

    function saveSet() { QZ.store.set('qz.caduta.settings', set); paintRecord(); }
    QZ.segmented($('#set-len'), [{ label: '15', value: 15 }, { label: '25', value: 25 }, { label: '40', value: 40 }], set.len, function (v) { set.len = v; saveSet(); });
    QZ.segmented($('#set-pace'), [{ label: 'Calmo · 10 s', value: 10 }, { label: 'Svelto · 7 s', value: 7 }, { label: 'Lampo · 5 s', value: 5 }], set.pace, function (v) { set.pace = v; saveSet(); });
    QZ.segmented($('#set-floor'), [{ label: '10 botole', value: 10 }, { label: '6 botole', value: 6 }, { label: '3 botole', value: 3 }], set.floor, function (v) { set.floor = v; saveSet(); });

    $('#g-answers').innerHTML = KEYS.map(function (k, i) {
        return '<button type="button" class="answer" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key">' + k + '</span><span class="answer__text"></span></button>';
    }).join('');
    var answerEls = QZ.$$('#g-answers .answer');
    answerEls.forEach(function (el) {
        el.addEventListener('click', function () { pick(Number(el.dataset.i)); });
    });

    var floorHTML = '';
    for (var t = 0; t < TILES; t++) floorHTML += '<span class="cl-tile"><i class="cl-door cl-door--l"></i><i class="cl-door cl-door--r"></i></span>';
    $('#g-floor').innerHTML = floorHTML;
    var tileEls = QZ.$$('#g-floor .cl-tile');

    $('#start-btn').addEventListener('click', start);
    $('#g-pass').addEventListener('click', pass);
    $('#g-quit').addEventListener('click', quit);

    document.addEventListener('keydown', function (e) {
        if (!S.active || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.qz-modal')) return;
        var k = e.key.toUpperCase();
        var idx = k === '1' || k === 'A' ? 0 : k === '2' || k === 'B' ? 1 : k === '3' || k === 'C' ? 2 : -1;
        if (idx >= 0) { e.preventDefault(); pick(idx); }
        else if (k === 'P') { e.preventDefault(); pass(); }
    });

    paintRecord();

    /* ---------- Helper ---------- */
    function money(n) { return '€ ' + QZ.fmt(n); }
    function two(n) { return String(n).padStart(2, '0'); }
    function bests() { return QZ.store.get('qz.caduta.best', {}) || {}; }
    function paintRecord() {
        var b = bests()[set.len];
        $('#start-record').textContent = b ? 'Record su ' + set.len + ' domande: ' + money(b) + ' portati a casa' : '';
    }
    function multFor(streak) { return streak >= 10 ? 5 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1; }

    /** Difficolta' cercata alla domanda i: primo terzo facile, poi media, poi difficile. */
    function targetDiff(i, len) { return i < len / 3 ? 1 : i < (2 * len) / 3 ? 2 : 3; }

    function draw(i) {
        var want = targetDiff(i, S.len);
        var fresh = function (d) { return !S.used[d.q]; };
        var raw = deck.draw(function (d) { return d.diff === want && fresh(d); }) ||
            deck.draw(function (d) { return Math.abs(d.diff - want) === 1 && fresh(d); }) ||
            deck.draw(fresh);
        S.used[raw.q] = true;
        var opts = QZ.shuffle([raw.ok, raw.ko[0], raw.ko[1]]);
        return { raw: raw, text: raw.q, options: opts, correct: opts.indexOf(raw.ok) };
    }

    /* ---------- Suoni delle botole ---------- */
    function sfxTrap() {
        QZ.sound.tone(420, 0.09, 'square', 0.1);
        QZ.sound.tone(260, 0.3, 'sawtooth', 0.12, 0.06, 90);
        QZ.sound.noise(0.35, 0.22, 700, 0.05);
    }
    function sfxFall() {
        QZ.sound.tone(900, 1.1, 'sine', 0.16, 0, 70);
        QZ.sound.noise(0.9, 0.18, 1500, 0.1, 'bandpass');
        QZ.sound.tone(60, 0.5, 'sine', 0.3, 1.0, 30);
    }

    /* ---------- Il palco ---------- */
    function paintFloor() {
        var open = TILES - S.left;
        tileEls.forEach(function (el, i) {
            var pos = ORDER.indexOf(i);
            el.classList.toggle('is-open', pos < open);
            el.classList.toggle('is-next', pos === open && S.left > 0);
            el.classList.toggle('is-feet', (i === 4 || i === 5) && pos >= open);
        });
        var lb = $('#g-left');
        lb.textContent = S.left;
        lb.classList.toggle('is-low', S.left <= 2);
        $('#g-player').classList.toggle('is-wobble', S.left === 1 && !S.done);
    }

    function openTrap() {
        var i = ORDER[TILES - S.left];
        S.left--;
        sfxTrap();
        QZ.vibrate([60, 30, 90]);
        var stage = $('#g-stage');
        QZ.fx.replay(stage, 'is-red');
        paintFloor();
        if (tileEls[i]) tileEls[i].classList.remove('is-gone');
        var pl = $('#g-player');
        if (S.left > 0) QZ.fx.replay(pl, 'is-scare');
    }

    function paintTop(bump) {
        var shown = Math.min(S.i + 1, S.len);
        $('#g-n').innerHTML = two(shown) + '<small>/' + S.len + '</small>';
        var m = multFor(S.streak);
        $('#g-mult').innerHTML = 'serie ' + S.streak + ' · <b>x' + m + '</b>';
        if (bump) QZ.fx.pop($('#g-mult'));
        $('#g-pass').innerHTML = QZ.icon('skip') + 'Passo <b>' + S.passes + '</b>';
        $('#g-pass').disabled = !S.passes || !S.active;
        $('#g-pass').setAttribute('aria-label', 'Passo: ne restano ' + S.passes);
    }

    function paintBank(from) {
        var el = $('#g-bank');
        if (from == null || from === S.bank) { el.textContent = money(S.bank); return; }
        QZ.fx.count(el, from, S.bank, 600, { prefix: '€ ' });
        QZ.fx.pop(el);
    }

    /* ---------- Flusso ---------- */
    function start() {
        if (starting) return;
        starting = true;
        S = {
            len: set.len, pace: set.pace, floor: set.floor,
            i: 0, left: set.floor, passes: PASSES, streak: 0, bestStreak: 0,
            bank: 0, right: 0, log: [], used: {}, q: null, active: false, running: false, done: false
        };
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.pace, bar: $('#g-bar'), label: $('#g-clock'), warnAt: 0.5, dangerAt: 0.3,
            onSecond: function (s) {
                $('#g-board').classList.toggle('is-danger', s <= 3 && s > 0);
                if (s <= 3 && s > 0) QZ.sound.tick();
            },
            onExpire: function () { if (S.active) wrong(-1); }
        });
        // le botole gia' aperte del pavimento "crepato" o "sgretolato" sono buchi fin dall'inizio
        tileEls.forEach(function (el, i) { el.classList.toggle('is-gone', ORDER.indexOf(i) < TILES - S.left); });
        var pl = $('#g-player');
        pl.className = 'cl-player';
        paintFloor();
        paintTop();
        paintBank();
        $('#g-qn').innerHTML = QZ.icon('ball') + 'Pronti';
        $('#g-cat').textContent = S.len + ' domande';
        $('#g-question').textContent = 'Stai fermo sulla botola. Arriva la prima.';
        $('#g-qcard').classList.remove('is-bad');
        $('#g-board').classList.remove('is-danger');
        answerEls.forEach(function (el) { el.className = 'answer'; el.disabled = true; el.querySelector('.answer__text').textContent = '…'; });
        QZ.show('s-game');
        QZ.sound.start();
        setTimeout(function () {
            QZ.countdown(3, 'Via!').then(function () {
                starting = false;
                S.running = true;
                load();
            });
        }, 350);
    }

    function load() {
        if (S.done) return;
        if (S.paused) { S.pendingLoad = true; return; }
        S.q = draw(S.i);
        var lv = S.q.raw.diff;
        $('#g-qn').innerHTML = QZ.icon('zap') + 'Domanda ' + (S.i + 1) + ' · ' + (lv === 1 ? 'facile' : lv === 2 ? 'media' : 'tosta');
        $('#g-cat').textContent = S.q.raw.cat;
        var qe = $('#g-question');
        qe.textContent = S.q.text;
        QZ.fx.replay(qe);
        $('#g-qcard').classList.remove('is-bad');
        $('#g-board').classList.remove('is-danger');
        answerEls.forEach(function (el, i) {
            el.className = 'answer';
            el.disabled = false;
            QZ.$$('.qz-mark, .qz-stamp', el).forEach(function (m) { m.remove(); });
            el.querySelector('.answer__text').textContent = S.q.options[i];
            QZ.fx.replay(el);
        });
        S.active = true;
        paintTop();
        QZ.say('Domanda ' + (S.i + 1) + ' di ' + S.len + '. ' + S.q.text);
        var a = document.activeElement;
        if (!document.querySelector('.qz-modal') && (!a || a === document.body || a.disabled || a.offsetParent === null)) answerEls[0].focus({ preventScroll: true });
        timer.reset(S.pace);
        timer.start();
    }

    function lock() {
        S.active = false;
        if (timer) timer.pause();
        answerEls.forEach(function (el) { el.disabled = true; });
        $('#g-pass').disabled = true;
    }

    function next(delay) {
        S.i++;
        setTimeout(function () {
            if (S.done) return;
            if (S.i >= S.len) { finish('safe'); return; }
            load();
        }, QZ.reducedMotion() ? Math.min(delay, 500) : delay);
    }

    function pick(i) {
        if (!S.active) return;
        if (i !== S.q.correct) { wrong(i); return; }
        var rem = timer.remaining;
        lock();
        S.right++;
        S.streak++;
        if (S.streak > S.bestStreak) S.bestStreak = S.streak;
        var m = multFor(S.streak);
        var gain = (S.q.raw.diff * 1000 + Math.ceil(rem) * 100) * m;
        var from = S.bank;
        S.bank += gain;
        var el = answerEls[i];
        el.classList.add('is-correct');
        answerEls.forEach(function (x, j) { if (j !== i) x.classList.add('is-dim'); });
        QZ.sound.correct();
        QZ.vibrate(25);
        QZ.fx.floatText(el, '+' + money(gain));
        QZ.fx.replay($('#g-player'), 'is-hop');
        paintBank(from);
        paintTop(m > multFor(S.streak - 1));
        if (m > multFor(S.streak - 1)) {
            QZ.sound.levelUp();
            QZ.toast(S.streak + ' di fila: il montepremi ora va per ' + m, { icon: 'flame', type: 'ok', ms: 1500 });
        }
        QZ.say('Giusta. Più ' + QZ.fmt(gain) + ' euro.');
        next(650);
    }

    function wrong(i) {
        lock();
        var timeout = i < 0;
        S.log.push({ q: S.q.text, ok: S.q.raw.ok, given: timeout ? null : S.q.options[i], kind: timeout ? 'time' : 'wrong' });
        S.streak = 0;
        if (!timeout) answerEls[i].classList.add('is-wrong');
        answerEls[S.q.correct].classList.add('is-correct');
        answerEls.forEach(function (x, j) { if (j !== i && j !== S.q.correct) x.classList.add('is-dim'); });
        QZ.sound.buzzer();
        QZ.fx.shake($('#g-qcard'));
        $('#g-qcard').classList.add('is-bad');
        var text = timeout ? 'Tempo!' : 'Botola!';
        QZ.fx.stamp($('#g-qcard'), text, 'bad', {
            quiet: true, ms: 900, size: 44,
            say: (timeout ? 'Tempo scaduto' : 'Sbagliata') + '. Era ' + S.q.raw.ok + '. Si apre una botola.'
        });
        setTimeout(function () {
            if (S.done) return;
            openTrap();
            paintTop();
            if (S.left === 0) { fall(); return; }
            if (S.left === 1) QZ.toast('Sei su un piede solo', { icon: 'flame', type: 'bad', ms: 1600 });
            next(900);
        }, QZ.reducedMotion() ? 150 : 450);
    }

    function pass() {
        if (!S.active || !S.passes) return;
        lock();
        S.passes--;
        S.streak = 0;
        S.log.push({ q: S.q.text, ok: S.q.raw.ok, given: null, kind: 'pass' });
        answerEls[S.q.correct].classList.add('is-correct');
        answerEls.forEach(function (x, j) { if (j !== S.q.correct) x.classList.add('is-dim'); });
        QZ.sound.whoosh();
        paintTop(true);
        QZ.say('Passo. Era ' + S.q.raw.ok + '. Ne restano ' + S.passes + '.');
        next(700);
    }

    function fall() {
        S.done = true;
        S.active = false;
        var pl = $('#g-player');
        pl.classList.remove('is-wobble');
        QZ.fx.replay(pl, 'is-fall');
        sfxFall();
        QZ.vibrate([120, 60, 200]);
        QZ.say('Si è aperta l\'ultima botola. Sei caduto.', true);
        setTimeout(function () { finish('fall'); }, QZ.reducedMotion() ? 400 : 1300);
    }

    function quit() {
        if (!S.running || S.done) return;
        var wasActive = S.active;
        S.active = false;
        S.paused = true;
        if (timer) timer.pause();
        QZ.confirm('Scendi dalla botola e ti porti a casa ' + money(S.bank) + '. Le domande che restano non le saprai mai.', { title: 'Ti fermi qui?', okLabel: 'Mi fermo', cancelLabel: 'Resto su', danger: true }).then(function (ok) {
            S.paused = false;
            if (ok) { finish('quit'); return; }
            if (S.pendingLoad) { S.pendingLoad = false; load(); }
            else if (wasActive) { S.active = true; paintTop(); timer.start(); }
        });
    }

    /* ---------- Fine partita ---------- */
    function reviewHTML() {
        if (!S.log.length) return '<p class="muted mt-3" style="text-align:center">Nessuna risposta sbagliata e nessun passo. Niente da ripassare.</p>';
        var tag = { wrong: 'Sbagliata', time: 'Tempo', pass: 'Passo' };
        return '<details class="cl-review"' + (S.log.length <= 4 ? ' open' : '') + '><summary>Da ripassare · ' + S.log.length + '</summary>' + S.log.map(function (l) {
            return '<div class="cl-review__row"><span class="cl-review__tag' + (l.kind === 'pass' ? ' is-pass' : '') + '">' + tag[l.kind] + '</span><div>' +
                '<div class="cl-review__q">' + QZ.esc(l.q) + '</div>' +
                '<div class="cl-review__a">Era <b>' + QZ.esc(l.ok) + '</b>' + (l.given ? ' · tu: <s>' + QZ.esc(l.given) + '</s>' : '') + '</div></div></div>';
        }).join('') + '</details>';
    }

    function finish(how) {
        if (S.finished) return;
        S.finished = true;
        S.done = true;
        S.active = false;
        S.running = false;
        if (timer) timer.pause();
        var fell = how === 'fall';
        var won = Math.floor((fell ? S.bank / 2 : S.bank) / 100) * 100;
        var answered = S.i;
        var all = QZ.store.get('qz.caduta.best', {}) || {};
        var prev = all[S.len] || 0;
        var lenRecord = won > prev;
        if (lenRecord) { all[S.len] = won; QZ.store.set('qz.caduta.best', all); }

        var floorXP = { 10: 1, 6: 1.2, 3: 1.4 }[S.floor] || 1;
        var xp = Math.round((S.right * 4 + S.bestStreak * 2 + (how === 'safe' ? 20 + S.len : 0)) * (PACE_XP[S.pace] || 1) * floorXP);
        var r = QZ.profile.record(GAME, {
            xp: xp,
            label: (how === 'safe' ? 'In piedi dopo ' + S.len + ' domande' : fell ? 'Caduto alla ' + Math.min(S.i + 1, S.len) + 'ª' : 'Sceso alla ' + (S.i + 1) + 'ª') + ' · ' + money(won),
            score: won
        });
        var ratio = QZ.clamp(S.right / S.len, 0, 1) * (fell ? 0.85 : 1);
        var title = how === 'safe' ? (S.left === S.floor ? 'Pavimento intatto' : 'Ancora in piedi') : fell ? 'Caduta libera' : 'Sceso dalla botola';
        var sub = how === 'safe'
            ? S.len + ' domande e sei ancora lì, con ' + S.left + (S.left === 1 ? ' botola chiusa' : ' botole chiuse') + ' sotto i piedi.'
            : fell ? 'L\'ultima botola si è aperta alla domanda ' + Math.min(S.i + 1, S.len) + (S.bank ? '. Del montepremi di ' + money(S.bank) + ' si salva la metà.' : ', col montepremi ancora a zero. Giù, e senza paracadute.')
                : 'Ti sei fermato dopo ' + answered + ' domande, con ' + money(S.bank) + ' in tasca.';

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: !fell,
            icon: fell ? 'flag' : 'zap',
            title: title,
            subtitle: sub,
            big: won,
            bigPrefix: '€ ',
            record: { newRecord: r.newRecord || (lenRecord && prev > 0), xp: r.xp },
            ratio: ratio,
            stats: [
                { label: 'Risposte giuste', value: S.right + '/' + S.len },
                { label: 'Serie migliore', value: S.bestStreak },
                { label: 'Botole chiuse', value: S.left + '/' + S.floor },
                { label: 'Passi usati', value: (PASSES - S.passes) + '/' + PASSES }
            ],
            extraHTML: reviewHTML(),
            share: fell
                ? 'A Caduta Libera su Quizzotti sono caduto alla domanda ' + Math.min(S.i + 1, S.len) + ' con ' + S.right + ' risposte giuste. Tu dove cadi?'
                : 'A Caduta Libera su Quizzotti ho retto ' + S.len + ' domande e portato a casa ' + money(won) + '. Fai di meglio?',
            onRetry: start,
            secondary: { label: 'Cambia regole', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
        paintRecord();
    }
})();
