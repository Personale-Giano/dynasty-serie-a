/* ==========================================================================
   QUIZZOTTI v2 — L'Intruso
   Dati: assets/db-intruso.js (`intrusoRounds`, {cat, diff, items[6], odd,
   rule, why}). Sei caselle, cinque hanno un legame e una no: si tocca
   l'intruso prima che scada il tempo. Tre vite (errore o tempo scaduto =
   una vita), punti piu' alti se si risponde in fretta e con la serie,
   difficolta' che sale round dopo round, QZ.Deck per non ripetere i round
   tra una partita e l'altra. Dopo ogni round il legame e il perche'.
   Modalita' "Sfida a due" sullo stesso telefono: blocchi da cinque round a
   testa (quattro passaggi di mano a partita, non venti), tre vite a testa,
   dieci round a testa al massimo, passaggio di mano senza sbirciare
   (saltato quando l'altro e' gia' fuori). Tutti e due giocano la stessa
   sequenza di difficolta', con round diversi ma di pari livello: nessuno
   e' piu' fortunato dell'altro e nessuno puo' copiare.
   L'Intruso del giorno (dal 27 novembre 2026, data di Roma): cinque round
   uguali per tutti (due facili, due medi, uno difficile) scelti dalla data,
   con i nomi nello stesso ordine; ritmo Normale, si giocano tutti e cinque
   (niente vite). Una partita sola al giorno: salvata appena comincia in
   qz.intruso.daily.v1 ({ data: { n, log, score, done } }); chi chiude la
   pagina a meta' si tiene i round giocati. Si apre da Intruso.html?giorno.
   A fine partita va alle Leghe (QZ.leagues.submit('intruso', N°, { found })).
   Sfida un amico (assets/sfida.js): da solo, il link porta il ritmo, il seme
   (difficolta' e ordine dei nomi) e i round usciti; l'amico gioca gli stessi.
   Giorno e sfida non toccano record, carriera e mazzo normali.
   La logica pura (difficolta', turni, round del giorno) sta in `core` ed e' esportata per i test.
   Memoria locale: qz.intruso.settings, qz.intruso.best (record per ritmo),
   qz.intruso.stats (carriera da solo: partite, round, scovati, serie record).
   ========================================================================== */
/* global intrusoRounds */
(function () {
    'use strict';

    var LIVES = 3;
    var DUO_ROUNDS = 10;
    var BLOCK = 5;

    /* ---------- Logica pura ---------- */
    /** Difficolta' desiderata per il round n (0 = primo) di un giocatore; rnd in [0, 1). */
    function wantDiff(n, rnd) {
        var r = rnd();
        if (n < 3) return 1;
        if (n < 8) return r < 0.25 ? 1 : 2;
        if (n < 14) return r < 0.5 ? 2 : 3;
        return r < 0.25 ? 2 : 3;
    }
    /** La sfida a due: una sola sequenza di difficolta', uguale per tutti e due. */
    function diffPlan(rounds, rnd) {
        var out = [];
        for (var n = 0; n < rounds; n++) out.push(wantDiff(n, rnd));
        return out;
    }
    function aliveDuo(p) { return p.lives > 0 && p.played < DUO_ROUNDS; }
    /**
     * Chi gioca il prossimo round della sfida a due: si resta col telefono per un
     * blocco di cinque round, poi passa all'altro (se e' ancora in gara).
     * -1 se sono fuori tutti e due.
     */
    function nextTurn(players, turn) {
        var p = players[turn], o = 1 - turn;
        var blockOver = !aliveDuo(p) || p.played % BLOCK === 0;
        if (blockOver && aliveDuo(players[o])) return o;
        if (aliveDuo(p)) return turn;
        return -1;
    }
    /** Ultimo round del blocco che comincia adesso (1 = primo round). */
    function blockEnd(played, otherAlive) {
        if (!otherAlive) return DUO_ROUNDS;
        return Math.min(DUO_ROUNDS, Math.ceil((played + 1) / BLOCK) * BLOCK);
    }

    /** Un round si riconosce dai suoi sei nomi, in qualunque ordine. */
    function roundKey(r) { return r.items.slice().sort().join('|'); }
    function fnv(s) {
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return h >>> 0;
    }
    /* L'Intruso del giorno: le difficolta' dei cinque round. */
    var DAILY_PLAN = [1, 1, 2, 2, 3];
    var DAILY_PACE = 10;
    /**
     * I cinque round del giorno ymd ('AAAA-MM-GG'), uguali per tutti: per ogni
     * casella del piano vince il round di quella difficolta' con l'impronta piu'
     * bassa (data + casella + nomi). Aggiungere round al database cambia un giorno
     * solo se il round nuovo vince proprio quel giorno.
     */
    function dailyRounds(rounds, ymd) {
        var used = {};
        return DAILY_PLAN.map(function (d, k) {
            var best = null, bh = 0;
            rounds.forEach(function (r) {
                var key = roundKey(r);
                if (used[key] || r.diff !== d) return;
                var h = fnv('ix|' + ymd + '|' + k + '|' + key);
                if (best === null || h < bh) { best = r; bh = h; }
            });
            if (best) used[roundKey(best)] = 1;
            return best;
        }).filter(Boolean);
    }
    /** Quadratini: verde preso, rosso sbagliato, nero tempo scaduto (o round non giocato). */
    function dailyGrid(log, rounds) {
        var out = '';
        for (var i = 0; i < (rounds || DAILY_PLAN.length); i++) out += log[i] === 'ok' ? '🟩' : log[i] === 'bad' ? '🟥' : '⬛';
        return out;
    }

    var core = {
        LIVES: LIVES, DUO_ROUNDS: DUO_ROUNDS, BLOCK: BLOCK, wantDiff: wantDiff, diffPlan: diffPlan, nextTurn: nextTurn, blockEnd: blockEnd,
        roundKey: roundKey, DAILY_PLAN: DAILY_PLAN, DAILY_PACE: DAILY_PACE, dailyRounds: dailyRounds, dailyGrid: dailyGrid
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Pagina
       ====================================================================== */
    var $ = QZ.$;
    var GAME = 'intruso';
    var AUTO_MS = 5500;
    var BASE = { 1: 100, 2: 150, 3: 200 };
    var PACE_XP = { 15: 1, 10: 1.2, 6: 1.5 };
    var DIFF_LABEL = { 1: 'Facile', 2: 'Media', 3: 'Difficile' };
    var VERDICT_OK = ['Gol!', 'Esatto', 'Che occhio', 'Preso'];
    var VERDICT_BAD = ['Fuori!', 'Palo', 'Niente da fare', 'Fuorigioco'];

    var deck = new QZ.Deck(GAME, intrusoRounds, roundKey);
    var SF = QZ.sfida || null, GG = QZ.giorno || null;
    var CH = SF ? SF.read(GAME, intrusoRounds.length) : null;   // la sfida arrivata col link
    var DAILY_KEY = 'qz.intruso.daily.v1';
    var set = Object.assign({ pace: 10, after: 'tap', mode: 'solo' }, QZ.store.get('qz.intruso.settings', {}) || {});
    set.pace = Number(set.pace);
    if (!PACE_XP[set.pace]) set.pace = 10;
    if (set.after !== 'auto') set.after = 'tap';
    if (set.mode !== 'duo') set.mode = 'solo';
    var STATS_KEY = 'qz.intruso.stats';

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
        if (S.active && n >= 1 && n <= 6) { e.preventDefault(); pick(n - 1); return; }
        // Invio fa andare avanti anche se il fuoco e' finito altrove (sul bottone ci pensa il browser)
        if (e.key !== 'Enter') return;
        var t = e.target;
        if (t && t.closest && t.closest('button, a, input, textarea, select')) return;
        if (S.revealing) { e.preventDefault(); next(); }
        else if (S.passing) { e.preventDefault(); $('#p-go').click(); }
    });

    paintRecord();

    /* ---------- Helper ---------- */
    function bestScores() { return QZ.store.get('qz.intruso.best', {}) || {}; }
    function paceName(p) { return p === 15 ? 'Calmo' : p === 6 ? 'Fulmine' : 'Normale'; }
    function two(n) { return String(n).padStart(2, '0'); }
    function paintRecord() {
        var b = bestScores()[set.pace];
        $('#start-record').textContent = b ? 'Record a ritmo ' + paceName(set.pace) + ': ' + QZ.fmt(b.score) + ' punti, ' + b.rounds + ' round superati' : 'Nessun record a ritmo ' + paceName(set.pace) + ': il primo lo metti tu.';
        var st = careerStats();
        var box = $('#start-career');
        if (!st.games) { box.hidden = true; return; }
        box.hidden = false;
        $('#c-games').textContent = QZ.fmt(st.games);
        $('#c-found').textContent = QZ.fmt(st.found);
        $('#c-pct').textContent = st.rounds ? Math.round(st.found / st.rounds * 100) + '%' : '-';
        $('#c-streak').textContent = QZ.fmt(st.streak);
    }
    /** Statistiche di carriera (solo partite da solo): partite, round, intrusi scovati, serie record. */
    function careerStats() {
        var st = QZ.store.get(STATS_KEY, null);
        st = st && typeof st === 'object' ? st : {};
        ['games', 'rounds', 'found', 'streak'].forEach(function (k) { st[k] = Math.max(0, Number(st[k]) || 0); });
        return st;
    }
    function saveCareer(p) {
        var st = careerStats();
        // "la piu' lunga di sempre" ha senso solo se prima c'era gia' una carriera da battere
        var newStreak = st.games > 0 && p.best > st.streak && p.best >= 3;
        st.games++;
        st.rounds += p.played;
        st.found += p.passed;
        st.streak = Math.max(st.streak, p.best);
        QZ.store.set(STATS_KEY, st);
        return { st: st, newStreak: newStreak };
    }
    /** La partita in quadratini, per la condivisione: verde preso, rosso sbagliato, nero tempo scaduto. */
    function shareGrid(p) {
        var marks = p.log.map(function (x) { return x === 'ok' ? '🟩' : x === 'bad' ? '🟥' : '⬛'; });
        var rows = [];
        for (var i = 0; i < marks.length; i += 10) rows.push(marks.slice(i, i + 10).join(''));
        return rows.join('\n');
    }
    function cur() { return S.players[S.turn]; }
    function alive(p) { return S.duo ? aliveDuo(p) : S.daily ? p.played < S.dayList.length : p.lives > 0; }
    /** Il caso della partita: col seme (da solo, giorno, sfida) e' ripetibile. */
    function rnd() { return S.rng ? S.rng() : Math.random(); }

    function drawOne(d) {
        var fresh = function (x) { return !S.used.has(roundKey(x)); };
        var src = S.src || deck;
        var r = src.draw(function (x) { return x.diff === d && fresh(x); }) ||
            src.draw(function (x) { return Math.abs(x.diff - d) === 1 && fresh(x); }) ||
            src.draw(fresh) || src.draw();
        S.used.add(roundKey(r));
        return r;
    }
    /**
     * Da solo: la difficolta' si tira round per round. In due: il round n di
     * tutti e due ha la stessa difficolta' (dal piano) ma un round diverso,
     * pescato insieme a quello dell'altro e assegnato a caso.
     */
    function drawRound(n) {
        if (S.daily) return S.dayList[n];
        if (!S.duo) return drawOne(wantDiff(n, rnd));
        if (!S.pairs[n]) {
            var a = drawOne(S.plan[n]);
            var b = drawOne(a.diff);
            S.pairs[n] = Math.random() < 0.5 ? [a, b] : [b, a];
        }
        return S.pairs[n][S.turn];
    }

    function paintLives(lost) {
        var p = cur();
        var box0 = $('#g-lives');
        // nel giorno non ci sono vite: si contano gli intrusi presi sui cinque round
        if (box0.previousElementSibling) box0.previousElementSibling.textContent = S.daily ? 'Presi' : 'Vite';
        if (S.daily) {
            box0.innerHTML = '<span class="led">' + p.passed + '/' + S.dayList.length + '</span>';
            box0.setAttribute('aria-label', p.passed + ' intrusi presi su ' + S.dayList.length);
            return;
        }
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
    /**
     * kind: niente = partita normale; 'sfida' = il link di un amico (CH);
     * 'giorno' = l'Intruso del giorno (opts: { ymd, n }).
     */
    function start(kind, opts) {
        if (starting) return;
        if (typeof kind !== 'string') kind = null;
        opts = opts || {};
        starting = true;
        clearTimeout(autoT);
        var duo = !kind && set.mode === 'duo';
        var list = duo ? names.get() : ['Tu'];
        var pace = kind === 'giorno' ? DAILY_PACE : kind === 'sfida' ? (PACE_XP[Number(CH.opt)] ? Number(CH.opt) : 10) : set.pace;
        var seed = kind === 'giorno' ? GG.seed(GAME, opts.ymd) : kind === 'sfida' ? CH.seed : SF ? SF.newSeed() : 0;
        var rng = !duo && SF ? SF.rng(seed) : null;
        S = {
            kind: kind, daily: kind === 'giorno', ch: kind === 'sfida' ? CH : null, seed: seed, rng: rng,
            ymd: opts.ymd || null, n: opts.n || 0, dayList: kind === 'giorno' ? core.dailyRounds(intrusoRounds, opts.ymd) : null,
            src: rng ? SF.source(deck, intrusoRounds, kind === 'sfida' ? CH : null, rng) : null,
            duo: duo, pace: pace, auto: set.after === 'auto',
            players: list.map(function (n) { return { name: n, score: 0, lives: LIVES, played: 0, passed: 0, streak: 0, best: 0, rts: [], wrong: [], log: [] }; }),
            turn: 0, used: new Set(), round: null, order: null,
            plan: duo ? diffPlan(DUO_ROUNDS, Math.random) : null, pairs: [],
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
        if (S.ch) SF.kickoff(S.ch, QZ.fmt(S.ch.score) + ' punti');
        if (S.daily) saveDaily(S.ymd, { n: S.n, log: [], score: 0, done: false, at: Date.now() });
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
        var to = blockEnd(p.played, alive(S.players[1 - S.turn]));
        var from = p.played + 1;
        $('#p-info').textContent = (to > from ? 'Round ' + from + '-' + to : 'Round ' + from) + ' di ' + DUO_ROUNDS + ' · ' + p.lives + (p.lives === 1 ? ' vita' : ' vite') + ' · ' + QZ.fmt(p.score) + ' punti';
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
        S.order = S.rng ? SF.shuffle(r.items, S.rng) : QZ.shuffle(r.items.slice());
        $('#g-pass').hidden = true;
        $('#g-reveal').hidden = true;
        $('#g-play').hidden = false;
        $('#g-cat').innerHTML = QZ.icon('eye') + (S.daily ? 'Del giorno · ' + (p.played + 1) + ' di ' + S.dayList.length + ' · ' : '') + QZ.esc(r.cat) + ' · ' + DIFF_LABEL[r.diff];
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
        // tempo di gioco vero: il timer si ferma con la scheda nascosta e con la conferma aperta
        var rt = timer.duration - timer.remaining;
        p.played++;
        p.log.push(ok ? 'ok' : timeout ? 'time' : 'bad');
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
        // il giorno si salva a ogni round: chi chiude la pagina tiene quelli giocati
        if (S.daily) saveDaily(S.ymd, { log: p.log.slice(), score: p.score });
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
        else if (S.daily) info = p.played < S.dayList.length ? 'Round ' + p.played + ' di ' + S.dayList.length : 'Cinque round su cinque';
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
        $('#r-auto').hidden = !S.auto;
        S.revealing = true;
        if (S.auto) runAuto(ok ? AUTO_MS : AUTO_MS + 1500); else clearTimeout(autoT);
    }

    /** "Dopo ogni round: automatico": barra che si svuota e poi si va avanti da soli. */
    function runAuto(ms) {
        var bar = $('#r-auto');
        clearTimeout(autoT);
        bar.classList.remove('is-run');
        bar.style.setProperty('--auto', ms + 'ms');
        void bar.offsetWidth;
        bar.classList.add('is-run');
        autoT = setTimeout(function () {
            // con una finestra aperta (conferma, profilo) si aspetta che si chiuda
            if (document.querySelector('.qz-modal')) { runAuto(2500); return; }
            next();
        }, ms);
    }

    function anyoneLeft() { return S.players.some(alive); }
    function nextTurnIndex() {
        if (!S.duo) return 0;
        var n = nextTurn(S.players, S.turn);
        return n < 0 ? S.turn : n;
    }

    function next() {
        if (!S.revealing || S.done) return;
        S.revealing = false;
        clearTimeout(autoT);
        if (!anyoneLeft()) { finish(false); return; }
        if (S.duo) {
            var n = nextTurnIndex();
            // il telefono passa solo a fine blocco (o quando chi gioca e' fuori)
            if (n !== S.turn) { S.turn = n; turnStart(); return; }
        }
        load();
    }

    function giveUp() {
        if (!S.running || S.done) return;
        var wasActive = S.active;
        S.active = false;
        timer.pause();
        clearTimeout(autoT);
        $('#r-auto').classList.remove('is-run');
        QZ.confirm(S.duo ? 'La sfida finisce qui e si contano i punti fatti finora.' : S.daily ? 'L\'Intruso del giorno si gioca una volta sola: i round che restano valgono come mancati.' : 'Esci dal campo: a referto restano ' + QZ.fmt(cur().score) + ' punti.', { title: 'Chiedi il cambio?', okLabel: 'Esco', cancelLabel: 'Resto in campo', danger: true }).then(function (ok) {
            if (ok) { finish(true); return; }
            if (wasActive) { S.active = true; cells.forEach(function (el) { el.disabled = false; }); timer.start(); }
            else if (S.revealing && S.auto) runAuto(2500);
        });
    }

    /* ---------- Fine partita ---------- */
    function reviewHTML() {
        var all = [];
        S.players.forEach(function (p) { p.wrong.forEach(function (w) { all.push({ p: p, w: w }); }); });
        if (!all.length) return '<div class="ix-review"><h2>Il ripasso</h2><p class="muted">Nessun round sbagliato. Da ripassare non c\'è niente: solo da incorniciare.</p></div>';
        return '<div class="ix-review"><h2>Il ripasso</h2><p class="small muted">I round sbagliati, con l\'intruso in verde' + (all.some(function (x) { return x.w.picked; }) ? (S.duo ? ' e la scelta sbagliata in rosso' : ' e la tua scelta in rosso') : '') + '.</p>' +
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
        if (S.duo) finishDuo(quit);
        else if (S.daily) finishDaily();
        else if (S.ch) finishChallenge();
        else finishSolo(quit);
        paintRecord();
        paintDaily();
    }

    function finishSolo() {
        var p = S.players[0];
        var bests = bestScores();
        var prev = bests[S.pace];
        var paceRecord = !prev || p.score > prev.score;
        if (paceRecord && p.score > 0) { bests[S.pace] = { score: p.score, rounds: p.passed }; QZ.store.set('qz.intruso.best', bests); }
        var xp = Math.round((p.score / 25 + p.passed * 2) * (PACE_XP[S.pace] || 1));
        var r = QZ.profile.record(GAME, { xp: xp, label: p.passed + (p.passed === 1 ? ' intruso scovato · ' : ' intrusi scovati · ') + QZ.fmt(p.score) + ' punti', score: p.score });
        var rec = bestScores()[S.pace];
        var car = p.played ? saveCareer(p) : { st: careerStats(), newStreak: false };
        QZ.results($('#end-host'), {
            win: p.passed >= 10,
            icon: p.passed >= 10 ? 'eye' : 'flag',
            title: p.passed >= 20 ? 'Occhio di falco' : p.passed >= 10 ? 'Non ti sfugge niente' : p.passed >= 5 ? 'Qualcuno ti è scappato' : 'Gli intrusi ringraziano',
            subtitle: !p.played ? 'Cambio chiesto prima del primo round: la partita non fa testo.' : 'Hai scovato ' + p.passed + (p.passed === 1 ? ' intruso' : ' intrusi') + ' su ' + p.played + ' round, a ritmo ' + paceName(S.pace) + '.' + (p.best >= 3 ? ' Serie migliore: ' + p.best + ' di fila' + (car.newStreak ? ', la più lunga di sempre.' : '.') : ''),
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
            share: 'L\'Intruso, ritmo ' + paceName(S.pace) + ': ' + p.passed + (p.passed === 1 ? ' intruso scovato' : ' intrusi scovati') + ' su ' + p.played + ', ' + QZ.fmt(p.score) + ' punti.' + (p.log.length ? '\n' + shareGrid(p) : '') + '\nTu quanti ne trovi?',
            onRetry: start,
            secondary: { label: 'Cambia ritmo', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
        offerChallenge(p, false);
    }

    /* ---------- Sfida un amico ---------- */
    function offerChallenge(p, again) {
        if (!SF || !S.src || !p.played) return;
        var pace = S.pace;
        SF.offer($('#end-host'), {
            game: GAME, title: 'L\'Intruso', seed: S.seed, opt: String(pace), src: S.src, score: p.score,
            text: function (name, url) {
                return (again ? 'Rilancio la sfida' : 'Ti sfido') + ' a L\'Intruso, ritmo ' + paceName(pace) + ': ' + QZ.fmt(p.score) + ' punti, ' + p.passed +
                    (p.passed === 1 ? ' intruso scovato' : ' intrusi scovati') + '. Stessi round per te, stessi nomi: riesci a battermi?\n' + url;
            }
        });
    }
    function playChallenge() { if (CH) start('sfida'); }
    if (CH && SF) {
        var chPace = PACE_XP[Number(CH.opt)] ? Number(CH.opt) : 10;
        SF.intro({
            ch: CH, target: QZ.fmt(CH.score) + ' punti',
            rules: 'L\'Intruso, ritmo ' + paceName(chPace) + ', tre vite: gli stessi round, con i nomi negli stessi posti. Niente record in palio, solo l\'onore.',
            onPlay: playChallenge
        });
    }
    function finishChallenge() {
        var p = S.players[0];
        var c = SF.cmp(p.score, S.ch.score);
        var r = QZ.profile.record(GAME, { xp: Math.round(p.score / 40 + p.passed * 2), label: 'Sfida: ' + QZ.fmt(p.score) + ' punti contro ' + QZ.fmt(S.ch.score) });
        QZ.results($('#end-host'), {
            win: c > 0,
            icon: c > 0 ? 'trophy' : 'eye',
            title: c > 0 ? 'Sfida vinta' : c === 0 ? 'Sfida pari' : 'Sfida persa',
            subtitle: 'Hai scovato ' + p.passed + (p.passed === 1 ? ' intruso' : ' intrusi') + ' su ' + p.played + ' round, a ritmo ' + paceName(S.pace) + '.',
            big: p.score,
            bigSuffix: ' pt',
            record: { xp: r.xp },
            extraHTML: SF.verdictHTML(S.ch, p.score, function (v) { return QZ.fmt(v) + ' punti'; }) + reviewHTML(),
            retryLabel: 'Rigioca la sfida',
            onRetry: playChallenge,
            secondary: { label: 'Partita normale', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
        offerChallenge(p, true);
    }

    /* ---------- L'Intruso del giorno ---------- */
    function getDaily() {
        var x = QZ.store.get(DAILY_KEY, null);
        return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
    }
    function saveDaily(ymd, patch) {
        var x = getDaily();
        x[ymd] = Object.assign({}, x[ymd] || {}, patch);
        var keys = Object.keys(x).sort();
        while (keys.length > 400) delete x[keys.shift()];
        QZ.store.set(DAILY_KEY, x);
    }
    function found(d) { return (d.log || []).filter(function (x) { return x === 'ok'; }).length; }
    function dailyToday() { var ymd = GG.romeDate(); return { ymd: ymd, n: GG.dayNumber(ymd) }; }
    function dailyShare(ymd, d) {
        return 'L\'Intruso del giorno N° ' + d.n + ' (' + GG.itDate(ymd) + '): ' + found(d) + '/' + core.DAILY_PLAN.length + '\n' + core.dailyGrid(d.log || []) +
            '\nStessi cinque round per tutti: ' + window.location.origin + window.location.pathname + '?giorno';
    }
    function fmtLeft(ms) {
        var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
        return (h ? h + ' h ' : '') + m + ' min';
    }
    function playDaily() {
        if (!GG || starting || S.running) return;
        var t = dailyToday();
        if (!t.n) return;
        var d = getDaily()[t.ymd];
        if (d) {
            if (!d.done) closeOpen();
            showDailyEnd(t.ymd, getDaily()[t.ymd], false);
            return;
        }
        start('giorno', { ymd: t.ymd, n: t.n });
    }
    /** Giorni lasciati a meta' (pagina chiusa): valgono i round giocati, gli altri sono mancati. */
    function closeOpen() {
        if (!GG || (S.daily && S.running)) return;
        var x = getDaily(), changed = false;
        Object.keys(x).forEach(function (k) {
            var d = x[k];
            if (!d || d.done) return;
            d.done = true;
            changed = true;
            if (QZ.leagues && d.n >= 1) QZ.leagues.submit(GAME, d.n, { found: found(d) }, { quiet: true });
        });
        if (changed) QZ.store.set(DAILY_KEY, x);
    }
    function finishDaily() {
        var p = S.players[0];
        saveDaily(S.ymd, { log: p.log.slice(), score: p.score, done: true });
        // Leghe tra amici: il risultato del giorno entra da solo in classifica
        if (QZ.leagues) QZ.leagues.submit(GAME, S.n, { found: p.passed });
        S.xp = QZ.profile.record(GAME, { xp: Math.round(p.score / 25 + p.passed * 4), label: 'Del giorno N° ' + S.n + ' · ' + p.passed + '/' + S.dayList.length }).xp;
        showDailyEnd(S.ymd, getDaily()[S.ymd], true);
    }
    function showDailyEnd(ymd, d, fresh) {
        var k = found(d), tot = core.DAILY_PLAN.length;
        var today = GG.romeDate() === ymd;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: k >= 4,
            icon: k >= 4 ? 'eye' : 'calendar',
            title: k === tot ? 'Cinque su cinque' : k >= 4 ? 'Ne è scappato uno' : k >= 2 ? 'Qualcuno ti è sfuggito' : 'Gli intrusi ringraziano',
            subtitle: 'L\'Intruso del giorno N° ' + d.n + ': ' + k + (k === 1 ? ' intruso scovato' : ' intrusi scovati') + ' su ' + tot + ', ' + QZ.fmt(d.score || 0) + ' punti.' +
                (today ? ' Domani cinque round nuovi, uguali per tutti.' : ''),
            big: k,
            bigSuffix: '/' + tot,
            record: fresh && S.xp ? { xp: S.xp } : null,
            extraHTML: '<p class="mt-3" style="text-align:center;font-size:28px;letter-spacing:4px" aria-hidden="true">' + core.dailyGrid(d.log || []) + '</p>' +
                (fresh ? reviewHTML() : '') +
                (today ? '<p class="small muted mt-3" style="text-align:center">Il prossimo Intruso del giorno tra ' + fmtLeft(GG.msToNext()) + '.</p>' : ''),
            share: dailyShare(ymd, d),
            retryLabel: 'Partita normale',
            onRetry: function () { QZ.show('s-start'); paintDaily(); },
            secondary: { label: 'Il Giornale di oggi', icon: 'calendar', onClick: function () { window.location.href = 'Oggi.html'; } }
        });
    }

    var dailyEl = null;
    function paintDaily() {
        if (!GG) return;
        if (!dailyEl) {
            dailyEl = document.createElement('section');
            dailyEl.className = 'card card--glow ix-daily';
            dailyEl.setAttribute('aria-labelledby', 'ix-daily-t');
            dailyEl.style.cssText = 'display:grid;gap:10px;margin-bottom:18px;padding:18px 20px;border-top:3px solid var(--led)';
            dailyEl.innerHTML = '<p class="eyebrow" id="ix-daily-eyebrow" style="margin:0"></p>' +
                '<h2 id="ix-daily-t" style="font-size:24px;margin:0"></h2>' +
                '<p class="muted" id="ix-daily-txt" style="margin:0"></p>' +
                '<div class="row" style="--gap:8px"><button type="button" class="btn btn--primary" id="ix-daily-btn"></button>' +
                '<button type="button" class="btn" id="ix-daily-share" hidden></button></div>';
            var host = $('#s-start');
            host.insertBefore(dailyEl, host.querySelector('.intro'));
            $('#ix-daily-btn').addEventListener('click', playDaily);
            $('#ix-daily-share').innerHTML = QZ.icon('share') + 'Condividi';
            $('#ix-daily-share').addEventListener('click', function () {
                var t = dailyToday(), d = getDaily()[t.ymd];
                if (d && d.done) QZ.share(dailyShare(t.ymd, d), 'Quizzotti · L\'Intruso del giorno');
            });
        }
        var t = dailyToday();
        var d = getDaily()[t.ymd];
        var left = fmtLeft(GG.msToNext());
        $('#ix-daily-eyebrow').innerHTML = QZ.icon('calendar') + 'L\'Intruso del giorno' + (t.n ? ' · ' + GG.itDate(t.ymd) : '');
        $('#ix-daily-btn').hidden = !t.n;
        if (!t.n) {
            $('#ix-daily-t').textContent = 'Dal ' + GG.itDate(GG.START) + ', cinque round al giorno';
            $('#ix-daily-txt').textContent = 'Cinque round uguali per tutti, con i nomi negli stessi posti: poi confronti i quadratini con gli amici. Si comincia tra ' + left + '.';
            $('#ix-daily-share').hidden = true;
            return;
        }
        $('#ix-daily-t').textContent = 'N° ' + t.n + ' · cinque round uguali per tutti';
        $('#ix-daily-txt').textContent = d && d.done
            ? 'Oggi: ' + found(d) + ' su ' + core.DAILY_PLAN.length + ' ' + core.dailyGrid(d.log || []) + '. Il prossimo tra ' + left + '.'
            : 'Due facili, due medi e uno cattivo, a ritmo Normale. Niente vite: si giocano tutti e cinque, ma una volta sola.';
        $('#ix-daily-btn').innerHTML = (d ? 'Rivedi l\'Intruso del giorno' : 'Gioca l\'Intruso del giorno') + QZ.icon('arrow');
        $('#ix-daily-share').hidden = !(d && d.done);
    }
    if (GG) {
        closeOpen();
        paintDaily();
        setInterval(function () { if (!S.running) paintDaily(); }, 30000);
        window.addEventListener('storage', function (ev) { if ((ev.key === DAILY_KEY || ev.key === null) && !S.running) paintDaily(); });
        if (GG.asked() && !CH) setTimeout(playDaily, 250);
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
            share: (tie ? 'Sfida a due a L\'Intruso: pareggio perfetto.' : ps[0].name + ' vince la sfida a L\'Intruso, ' + QZ.fmt(ps[0].score) + ' a ' + QZ.fmt(ps[1].score) + '.') +
                S.players.map(function (p) { return '\n' + p.name + ' ' + (p.log.length ? shareGrid(p).replace(/\n/g, '') : '-'); }).join('') + '\nChi ci batte?',
            retryLabel: 'Rivincita',
            onRetry: start,
            secondary: { label: 'Cambia giocatori', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }
})();
