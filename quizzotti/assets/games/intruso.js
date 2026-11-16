/* ==========================================================================
   QUIZZOTTI v2 — L'Intruso
   Dati: assets/db-intruso.js (`intrusoRounds`, {cat, diff, items[6], odd,
   rule, why}). Sei caselle, cinque hanno un legame e una no: si tocca
   l'intruso prima che scada il tempo. Tre vite (errore o tempo scaduto =
   una vita), punti piu' alti se si risponde in fretta e con la serie,
   difficolta' che sale round dopo round, QZ.Deck per non ripetere i round
   tra una partita e l'altra. Dopo ogni round il legame e il perche'.
   Modalita' "Sfida a due" sullo stesso telefono: turni alterni, tre vite a
   testa, dieci round a testa al massimo, passaggio di mano senza sbirciare.
   ========================================================================== */
/* global intrusoRounds */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'intruso';
    var LIVES = 3;
    var DUO_ROUNDS = 10;
    var AUTO_MS = 5500;
    var BASE = { 1: 100, 2: 150, 3: 200 };
    var PACE_XP = { 15: 1, 10: 1.2, 6: 1.5 };
    var DIFF_LABEL = { 1: 'Facile', 2: 'Media', 3: 'Difficile' };
    var VERDICT_OK = ['Gol!', 'Esatto', 'Che occhio', 'Preso'];
    var VERDICT_BAD = ['Fuori!', 'Palo', 'Niente da fare', 'Fuorigioco'];

    function roundKey(r) { return r.items.slice().sort().join('|'); }
    var deck = new QZ.Deck(GAME, intrusoRounds, roundKey);
    var set = Object.assign({ pace: 10, after: 'tap', mode: 'solo' }, QZ.store.get('qz.intruso.settings', {}) || {});
    if (!PACE_XP[set.pace]) set.pace = 10;

    var S = {};
    var timer = null;
    var autoT = 0;
    var starting = false;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('eye');
    $('#rules').innerHTML = [
        ['Sei nomi, un intruso.', 'Cinque hanno qualcosa in comune: squadra, nazionalità, trofeo, stadio. Il sesto no.'],
        ['Toccalo in fretta.', 'Più tempo ti resta, più punti prendi. E la serie di risposte giuste vale il bonus.'],
        ['Tre vite.', 'Risposta sbagliata o tempo scaduto: una vita in meno. Alla terza si va negli spogliatoi.'],
        ['Si parte piano', 'e poi si sale: dopo qualche round arrivano gli intrusi cattivi.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Chiedo il cambio';
    $('#r-next').innerHTML = 'Avanti' + QZ.icon('arrow');
    $('#p-go').innerHTML = 'Ci sono' + QZ.icon('arrow');

    function saveSet() { QZ.store.set('qz.intruso.settings', set); paintRecord(); }
    QZ.segmented($('#set-pace'), [{ label: 'Calmo', value: 15 }, { label: 'Normale', value: 10 }, { label: 'Fulmine', value: 6 }], set.pace, function (v) { set.pace = v; saveSet(); });
    QZ.segmented($('#set-after'), [{ label: 'Avanti io', value: 'tap' }, { label: 'Automatico', value: 'auto' }], set.after, function (v) { set.after = v; saveSet(); });
    QZ.segmented($('#set-mode'), [{ label: 'Da solo', value: 'solo' }, { label: 'Sfida a due', value: 'duo' }], set.mode, function (v) { set.mode = v; saveSet(); paintMode(); });
    var names = QZ.playerList($('#set-names'), { min: 2, max: 2, key: 'intruso', label: 'Giocatore', title: 'Chi si sfida' });
    function paintMode() { $('#set-names').hidden = set.mode !== 'duo'; }
    paintMode();

    var grid = $('#g-grid');
    grid.innerHTML = [0, 1, 2, 3, 4, 5].map(function (i) {
        return '<button type="button" class="answer ix-item" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key" aria-hidden="true">' + (i + 1) + '</span><span class="answer__text"></span></button>';
    }).join('');
    var cells = QZ.$$('.ix-item', grid);
    cells.forEach(function (el) { el.addEventListener('click', function () { pick(Number(el.dataset.i)); }); });

    $('#start-btn').addEventListener('click', start);
    $('#g-quit').addEventListener('click', giveUp);
    $('#r-next').addEventListener('click', next);
    $('#p-go').addEventListener('click', function () { if (S.passing) { S.passing = false; load(); } });

    document.addEventListener('keydown', function (e) {
        if (!S.running || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.qz-modal')) return;
        var n = Number(e.key);
        if (S.active && n >= 1 && n <= 6) { e.preventDefault(); pick(n - 1); }
    });

    paintRecord();

    /* ---------- Helper ---------- */
    function bestScores() { return QZ.store.get('qz.intruso.best', {}) || {}; }
    function paceName(p) { return p === 15 ? 'Calmo' : p === 6 ? 'Fulmine' : 'Normale'; }
    function two(n) { return String(n).padStart(2, '0'); }
    function paintRecord() {
        var b = bestScores()[set.pace];
        $('#start-record').textContent = b ? 'Record a ritmo ' + paceName(set.pace) + ': ' + QZ.fmt(b.score) + ' punti, ' + b.rounds + ' round superati' : '';
    }
    function cur() { return S.players[S.turn]; }
    function alive(p) { return p.lives > 0 && (!S.duo || p.played < DUO_ROUNDS); }

    /** Difficolta' desiderata per il round n (0 = primo) di un giocatore. */
    function wantDiff(n) {
        var r = Math.random();
        if (n < 3) return 1;
        if (n < 8) return r < 0.25 ? 1 : 2;
        if (n < 14) return r < 0.5 ? 2 : 3;
        return r < 0.25 ? 2 : 3;
    }
    function drawRound(n) {
        var d = wantDiff(n);
        var fresh = function (x) { return !S.used.has(roundKey(x)); };
        var r = deck.draw(function (x) { return x.diff === d && fresh(x); }) ||
            deck.draw(function (x) { return Math.abs(x.diff - d) === 1 && fresh(x); }) ||
            deck.draw(fresh) || deck.draw();
        S.used.add(roundKey(r));
        return r;
    }

    function paintLives(lost) {
        var p = cur();
        var h = '';
        for (var i = 0; i < LIVES; i++) h += QZ.icon('heart', i < p.lives ? '' : 'is-off' + (lost && i === p.lives ? ' is-lost' : ''));
        var box = $('#g-lives');
        box.innerHTML = h;
        box.setAttribute('aria-label', p.lives + (p.lives === 1 ? ' vita' : ' vite'));
    }
    function paintTop(bump) {
        var p = cur();
        $('#g-round').textContent = two(p.played + (S.active || S.passing ? 1 : 0) || 1);
        var sc = $('#g-score');
        sc.textContent = QZ.fmt(p.score);
        if (bump) QZ.fx.pop(sc);
        var who = $('#g-who');
        who.hidden = !S.duo;
        who.textContent = S.duo ? p.name : '';
        paintLives(false);
    }

    /* ---------- Flusso ---------- */
    function start() {
        if (starting) return;
        starting = true;
        clearTimeout(autoT);
        var duo = set.mode === 'duo';
        var list = duo ? names.get() : ['Tu'];
        S = {
            duo: duo, pace: set.pace, auto: set.after === 'auto',
            players: list.map(function (n) { return { name: n, score: 0, lives: LIVES, played: 0, passed: 0, streak: 0, best: 0, rts: [], wrong: [] }; }),
            turn: 0, used: new Set(), round: null, order: null,
            active: false, running: false, passing: false, done: false
        };
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.pace, bar: $('#g-bar'), label: $('#g-clock'), warnAt: 0.5, dangerAt: 0.3,
            onSecond: function (s) { if (s <= 3 && s > 0) QZ.sound.tick(); },
            onExpire: function () { if (S.active) answer(-1); }
        });
        $('#g-reveal').hidden = true;
        $('#g-pass').hidden = true;
        $('#g-play').hidden = false;
        $('#g-cat').innerHTML = QZ.icon('eye') + 'Pronti';
        $('#g-question').textContent = 'Chi è l\'intruso?';
        cells.forEach(function (el) { el.className = 'answer ix-item'; el.disabled = true; el.querySelector('.answer__text').textContent = '…'; });
        $('#g-clock').textContent = S.pace;
        paintTop();
        QZ.show('s-game');
        QZ.sound.start();
        setTimeout(function () {
            if (S.duo) { starting = false; S.running = true; turnStart(); return; }
            QZ.countdown(3, 'Via!').then(function () {
                starting = false;
                S.running = true;
                load();
            });
        }, 350);
    }

    /** Sfida a due: prima di ogni turno il telefono passa di mano, le caselle restano coperte. */
    function turnStart() {
        var p = cur();
        S.passing = true;
        $('#g-play').hidden = true;
        $('#g-reveal').hidden = true;
        $('#g-pass').hidden = false;
        $('#p-name').textContent = p.name;
        $('#p-info').textContent = 'Round ' + (p.played + 1) + ' di ' + DUO_ROUNDS + ' · ' + p.lives + (p.lives === 1 ? ' vita' : ' vite') + ' · ' + QZ.fmt(p.score) + ' punti';
        timer.reset(S.pace);
        paintTop();
        QZ.say('Tocca a ' + p.name + '.');
        setTimeout(function () { if (S.passing) $('#p-go').focus({ preventScroll: true }); }, 60);
    }

    function load() {
        if (S.done) return;
        var p = cur();
        var r = drawRound(p.played);
        S.round = r;
        S.order = QZ.shuffle(r.items.slice());
        $('#g-pass').hidden = true;
        $('#g-reveal').hidden = true;
        $('#g-play').hidden = false;
        $('#g-cat').innerHTML = QZ.icon('eye') + QZ.esc(r.cat) + ' · ' + DIFF_LABEL[r.diff];
        var q = $('#g-question');
        q.textContent = 'Chi è l\'intruso?';
        QZ.fx.replay(q);
        cells.forEach(function (el, i) {
            el.className = 'answer ix-item';
            el.disabled = false;
            QZ.$$('.qz-mark, .qz-stamp', el).forEach(function (m) { m.remove(); });
            el.querySelector('.answer__text').textContent = S.order[i];
            el.setAttribute('aria-label', (i + 1) + ': ' + S.order[i]);
            QZ.fx.replay(el);
        });
        S.active = true;
        paintTop();
        QZ.say((S.duo ? p.name + ', round ' : 'Round ') + (p.played + 1) + '. ' + r.cat + '. Chi è l\'intruso?');
        var a = document.activeElement;
        if (!document.querySelector('.qz-modal') && (!a || a === document.body || a.disabled || a.offsetParent === null)) cells[0].focus({ preventScroll: true });
        S.t0 = performance.now();
        timer.reset(S.pace);
        timer.start();
    }

    function pick(i) {
        if (!S.active) return;
        answer(i);
    }

    /** i = casella toccata, -1 = tempo scaduto. */
    function answer(i) {
        S.active = false;
        timer.pause();
        cells.forEach(function (el) { el.disabled = true; });
        var p = cur(), r = S.round;
        var oddIdx = S.order.indexOf(r.odd);
        var ok = i === oddIdx;
        var timeout = i < 0;
        var rt = (performance.now() - S.t0) / 1000;
        p.played++;
        var pts = 0;
        if (ok) {
            p.passed++;
            p.streak++;
            if (p.streak > p.best) p.best = p.streak;
            p.rts.push(rt);
            var speed = QZ.clamp(timer.remaining / timer.duration, 0, 1);
            var bonus = p.streak >= 3 ? Math.min(100, (p.streak - 2) * 20) : 0;
            pts = Math.round(BASE[r.diff] * (0.5 + 0.5 * speed) / 10) * 10 + bonus;
            p.score += pts;
            cells[i].classList.add('is-correct');
            cells.forEach(function (el, k) { if (k !== i) el.classList.add('is-dim'); });
            QZ.sound.correct();
            QZ.vibrate(25);
            if (rt < 2.5) QZ.fx.floatText(cells[i], 'Lampo!');
            else QZ.fx.floatText(cells[i], '+' + pts);
        } else {
            p.streak = 0;
            p.lives--;
            p.wrong.push({ r: r, picked: timeout ? null : S.order[i] });
            if (!timeout) cells[i].classList.add('is-wrong');
            cells.forEach(function (el, k) { if (k !== i && k !== oddIdx) el.classList.add('is-dim'); });
            QZ.fx.mark(cells[oddIdx], 'circle', 'var(--led-green)');
            if (timeout) QZ.sound.buzzer(); else QZ.sound.wrong();
            QZ.vibrate([80, 40, 80]);
            QZ.fx.shake(grid);
        }
        paintTop(ok);
        if (!ok) paintLives(true);
        var verdict = timeout ? 'Tempo scaduto' : QZ.pick(ok ? VERDICT_OK : VERDICT_BAD);
        setTimeout(function () { reveal(ok, verdict, pts); }, QZ.reducedMotion() ? 200 : ok ? 650 : 900);
    }

    function reveal(ok, verdict, pts) {
        if (S.done) return;
        var p = cur(), r = S.round;
        var box = $('#g-reveal');
        box.classList.toggle('is-ok', ok);
        box.classList.toggle('is-bad', !ok);
        $('#r-verdict').textContent = verdict;
        $('#r-rule').textContent = r.rule + '. L\'intruso è ' + r.odd + '.';
        $('#r-why').textContent = r.why;
        var info;
        if (ok) info = '+' + pts + ' punti' + (p.streak >= 3 ? ' · serie di ' + p.streak : '');
        else info = p.lives > 1 ? 'Restano ' + p.lives + ' vite' : p.lives === 1 ? 'Resta una vita sola' : 'Vite finite';
        $('#r-pts').textContent = info;
        var last = !anyoneLeft();
        var nextLabel = last ? 'Il referto' : S.duo && nextTurnIndex() !== S.turn ? 'Passa il telefono' : 'Avanti';
        $('#r-next').innerHTML = QZ.esc(nextLabel) + QZ.icon('arrow');
        box.hidden = false;
        QZ.fx.replay(box);
        QZ.say(verdict + '. ' + r.rule + '. L\'intruso era ' + r.odd + '. ' + r.why + ' ' + info + '.');
        $('#r-next').focus({ preventScroll: true });
        // sul telefono il verdetto sta sotto le caselle: lo si porta in vista
        var rect = box.getBoundingClientRect();
        if (rect.bottom > window.innerHeight) box.scrollIntoView({ block: 'nearest', behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
        var bar = $('#r-auto');
        clearTimeout(autoT);
        bar.hidden = !S.auto;
        bar.classList.remove('is-run');
        if (S.auto) {
            var ms = ok ? AUTO_MS : AUTO_MS + 1500;
            bar.style.setProperty('--auto', ms + 'ms');
            void bar.offsetWidth;
            bar.classList.add('is-run');
            autoT = setTimeout(function () { if (!document.querySelector('.qz-modal')) next(); }, ms);
        }
        S.revealing = true;
    }

    function anyoneLeft() { return S.players.some(alive); }
    function nextTurnIndex() {
        if (!S.duo) return 0;
        var o = 1 - S.turn;
        return alive(S.players[o]) ? o : S.turn;
    }

    function next() {
        if (!S.revealing || S.done) return;
        S.revealing = false;
        clearTimeout(autoT);
        if (!anyoneLeft()) { finish(false); return; }
        if (S.duo) { S.turn = nextTurnIndex(); turnStart(); return; }
        load();
    }

    function giveUp() {
        if (!S.running || S.done) return;
        var wasActive = S.active;
        S.active = false;
        timer.pause();
        clearTimeout(autoT);
        $('#r-auto').classList.remove('is-run');
        QZ.confirm(S.duo ? 'La sfida finisce qui e si contano i punti fatti finora.' : 'Esci dal campo: a referto restano ' + QZ.fmt(cur().score) + ' punti.', { title: 'Chiedi il cambio?', okLabel: 'Esco', cancelLabel: 'Resto in campo', danger: true }).then(function (ok) {
            if (ok) { finish(true); return; }
            if (wasActive) { S.active = true; cells.forEach(function (el) { el.disabled = false; }); timer.start(); }
            else if (S.revealing && S.auto) { autoT = setTimeout(next, 2500); }
        });
    }

    /* ---------- Fine partita ---------- */
    function reviewHTML() {
        var all = [];
        S.players.forEach(function (p) { p.wrong.forEach(function (w) { all.push({ p: p, w: w }); }); });
        if (!all.length) return '<div class="ix-review"><h2>Il ripasso</h2><p class="muted">Nessun round sbagliato. Da ripassare non c\'è niente: solo da incorniciare.</p></div>';
        return '<div class="ix-review"><h2>Il ripasso</h2><p class="small muted">I round sbagliati, con l\'intruso in verde' + (all.some(function (x) { return x.w.picked; }) ? ' e la tua scelta in rosso' : '') + '.</p>' +
            all.map(function (x) {
                var r = x.w.r;
                var chips = r.items.map(function (it) {
                    var cls = it === r.odd ? 'chip chip--ok' : it === x.w.picked ? 'chip chip--bad' : 'chip';
                    return '<span class="' + cls + '">' + QZ.esc(it) + '</span>';
                }).join('');
                return '<div class="card ix-review__card">' +
                    (S.duo ? '<span class="eyebrow">' + QZ.esc(x.p.name) + '</span>' : '') +
                    '<div class="ix-review__items">' + chips + '</div>' +
                    '<div class="ix-review__rule">' + QZ.esc(r.rule) + (x.w.picked ? '' : ' <span class="small muted">(tempo scaduto)</span>') + '</div>' +
                    '<p class="ix-review__why">' + QZ.esc(r.why) + '</p></div>';
            }).join('') + '</div>';
    }

    function avg(list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : 0; }

    function finish(quit) {
        if (S.done) return;
        S.done = true;
        S.active = false;
        S.running = false;
        S.revealing = false;
        clearTimeout(autoT);
        if (timer) timer.pause();
        QZ.show('s-end');
        if (S.duo) finishDuo(quit); else finishSolo(quit);
        paintRecord();
    }

    function finishSolo() {
        var p = S.players[0];
        var bests = bestScores();
        var prev = bests[S.pace];
        var paceRecord = !prev || p.score > prev.score;
        if (paceRecord && p.score > 0) { bests[S.pace] = { score: p.score, rounds: p.passed }; QZ.store.set('qz.intruso.best', bests); }
        var xp = Math.round((p.score / 25 + p.passed * 2) * (PACE_XP[S.pace] || 1));
        var r = QZ.profile.record(GAME, { xp: xp, label: p.passed + ' intrusi scovati · ' + QZ.fmt(p.score) + ' punti', score: p.score });
        var rec = bestScores()[S.pace];
        QZ.results($('#end-host'), {
            win: p.passed >= 10,
            icon: p.passed >= 10 ? 'eye' : 'flag',
            title: p.passed >= 20 ? 'Occhio di falco' : p.passed >= 10 ? 'Non ti sfugge niente' : p.passed >= 5 ? 'Qualcuno ti è scappato' : 'Gli intrusi ringraziano',
            subtitle: 'Hai scovato ' + p.passed + (p.passed === 1 ? ' intruso' : ' intrusi') + ' su ' + p.played + ' round, a ritmo ' + paceName(S.pace) + '.' + (p.best >= 3 ? ' Serie migliore: ' + p.best + ' di fila.' : ''),
            big: p.score,
            bigSuffix: ' pt',
            record: { newRecord: r.newRecord || (paceRecord && !!prev && p.score > 0), xp: r.xp },
            ratio: QZ.clamp(p.passed / 22, 0, 1),
            stats: [
                { label: 'Round superati', value: p.passed },
                { label: 'Serie migliore', value: p.best },
                { label: 'Tempo medio', value: p.rts.length ? avg(p.rts).toFixed(1).replace('.', ',') + ' s' : '-' },
                { label: 'Record ' + paceName(S.pace), value: rec ? QZ.fmt(rec.score) : '-' }
            ],
            extraHTML: reviewHTML(),
            share: 'A L\'Intruso su Quizzotti ho scovato ' + p.passed + ' intrusi e fatto ' + QZ.fmt(p.score) + ' punti. Tu quanti ne trovi?',
            onRetry: start,
            secondary: { label: 'Cambia ritmo', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
    }

    function finishDuo() {
        var ps = S.players.slice().sort(function (a, b) { return b.score - a.score || b.passed - a.passed; });
        var tie = ps[0].score === ps[1].score && ps[0].passed === ps[1].passed;
        var total = S.players.reduce(function (s, p) { return s + p.passed; }, 0);
        var r = QZ.profile.record(GAME, { xp: Math.round(total * 3 + ps[0].score / 40), label: 'Sfida a due: ' + (tie ? 'pareggio' : 'vince ' + ps[0].name) });
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio, e nessuno ci crede' : 'Vince ' + ps[0].name,
            subtitle: tie ? 'Stessi punti, stessi round. Serve la bella.' : ps[0].name + ' chiude con ' + QZ.fmt(ps[0].score) + ' punti, ' + ps[1].name + ' si ferma a ' + QZ.fmt(ps[1].score) + '.',
            record: { xp: r.xp },
            stats: S.players.map(function (p) { return { label: p.name, value: p.passed + '/' + p.played + ' round' }; }),
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(ps.map(function (p) {
                return { name: p.name, score: p.score, color: QZ.TEAM_COLORS[S.players.indexOf(p)], sub: p.passed + (p.passed === 1 ? ' intruso' : ' intrusi') + ' · serie max ' + p.best };
            }), function (s) { return QZ.fmt(s) + ' pt'; }) + '</div>' + reviewHTML(),
            share: tie ? 'Sfida a due a L\'Intruso su Quizzotti: pareggio perfetto. Chi ci batte?' : ps[0].name + ' ha vinto la sfida a L\'Intruso su Quizzotti con ' + QZ.fmt(ps[0].score) + ' punti. Ci provi?',
            retryLabel: 'Rivincita',
            onRetry: start,
            secondary: { label: 'Cambia giocatori', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }
})();
