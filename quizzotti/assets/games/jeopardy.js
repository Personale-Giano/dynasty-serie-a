/* ==========================================================================
   QUIZZOTTI v2 — Jeopardy
   Dati: assets/db-jeopardy.js (`jeopardyData`: 9 categorie x 50 domande,
   10 per ciascun valore da 100 a 500).
   Rispetto alla v1: tabellone unico che si adatta allo schermo (niente reset
   ruotando il telefono), categorie a scelta, domande che non si ripetono tra
   le partite, secondo round a punti doppi, casella "doppia posta", rubata,
   tempo per rispondere opzionale, correzione punteggi e classifica finale.
   ========================================================================== */
(function () {
    'use strict';

    var TIERS = [100, 200, 300, 400, 500];
    var MAX_CATS = 6, MIN_CATS = 2;
    var $ = QZ.$;

    /* ---------- Pool domande ---------- */
    var CATS = jeopardyData.map(function (c) { return c.category; });
    var POOL = [];
    jeopardyData.forEach(function (c) {
        c.questions.forEach(function (q) { POOL.push({ cat: c.category, value: q.value, q: q.question, a: q.answer }); });
    });
    var deck = new QZ.Deck('jeopardy', POOL, function (x) { return x.q; });

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    function pretty(cat) {
        return String(cat).toLowerCase().split(' ').map(function (w, i) {
            return i && /^(e|di|del|della|dei|la|il)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    }

    /* ---------- Impostazioni (ricordate tra le visite) ---------- */
    var OPT_KEY = 'qz.jeopardy.opts';
    var opts = Object.assign({ rounds: 1, time: 0, penalty: true, steal: true, double: true, cats: null }, QZ.store.get(OPT_KEY, {}) || {});
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }

    var selected = (Array.isArray(opts.cats) ? opts.cats : []).filter(function (c) { return CATS.indexOf(c) >= 0; });
    if (selected.length < MIN_CATS) selected = QZ.shuffle(CATS).slice(0, 5);

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Apri il tabellone';
    $('#medal').innerHTML = QZ.icon('grid');
    $('#rules').innerHTML = [
        ['A turno', 'ogni squadra sceglie una casella: categoria e valore.'],
        ['Rispondete a voce,', 'poi mostrate la soluzione e segnate giusta o sbagliata.'],
        ['Chi sbaglia perde i punti', 'e le altre squadre possono rubarli.'],
        ['Tabellone finito?', 'Vince chi ha più punti. Nel secondo round valgono doppio.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var rec = QZ.profile.best('jeopardy');
    $('#start-record').textContent = rec != null ? 'Punteggio record della squadra vincente: ' + QZ.fmt(rec) : '';

    var teamsList = QZ.playerList($('#teams-host'), { key: 'jeopardy', min: 1, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (1-6)' });

    $('#cats-random').innerHTML = QZ.icon('shuffle') + 'Casuali';
    function paintCats() {
        $('#cats').innerHTML = CATS.map(function (c, i) {
            return '<button type="button" class="jp-cat" data-i="' + i + '" aria-pressed="' + (selected.indexOf(c) >= 0) + '">' + QZ.esc(pretty(c)) + '</button>';
        }).join('');
        $('#cats-hint').textContent = selected.length + ' selezionate · da ' + MIN_CATS + ' a ' + MAX_CATS;
    }
    paintCats();
    $('#cats').addEventListener('click', function (e) {
        var b = e.target.closest('.jp-cat');
        if (!b) return;
        var c = CATS[Number(b.dataset.i)], at = selected.indexOf(c);
        if (at >= 0) {
            if (selected.length <= MIN_CATS) { QZ.toast('Servono almeno ' + MIN_CATS + ' categorie', { icon: 'info' }); return; }
            selected.splice(at, 1);
        } else {
            if (selected.length >= MAX_CATS) { QZ.toast('Massimo ' + MAX_CATS + ' categorie', { icon: 'info' }); return; }
            selected.push(c);
        }
        QZ.sound.click();
        opts.cats = selected.slice(); saveOpts();
        paintCats();
    });
    $('#cats-random').addEventListener('click', function () {
        selected = QZ.shuffle(CATS).slice(0, 5);
        opts.cats = selected.slice(); saveOpts();
        paintCats();
        QZ.$$('#cats [aria-pressed="true"]').forEach(function (b) { QZ.fx.pop(b); });
    });

    QZ.segmented($('#opt-rounds'), [{ label: '1 round', value: 1 }, { label: '2 round (il 2° vale doppio)', value: 2 }], opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-time'), [{ label: 'Libero', value: 0 }, { label: '15 s', value: 15 }, { label: '30 s', value: 30 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-penalty'), [{ label: 'Toglie i punti', value: true }, { label: 'Non toglie nulla', value: false }], opts.penalty, function (v) { opts.penalty = v; saveOpts(); });
    $('#opt-steal').checked = opts.steal;
    $('#opt-double').checked = opts.double;
    $('#opt-steal').addEventListener('change', function () { opts.steal = this.checked; saveOpts(); });
    $('#opt-double').addEventListener('change', function () { opts.double = this.checked; saveOpts(); });

    $('#reveal-btn').innerHTML = QZ.icon('eye') + 'Mostra la risposta';
    $('#adjust-btn').innerHTML = QZ.icon('plus') + '<span>Correggi</span>';
    $('#adjust-btn').setAttribute('aria-label', 'Correggi i punteggi');
    $('#end-btn').innerHTML = QZ.icon('flag') + '<span>Termina</span>';
    $('#end-btn').setAttribute('aria-label', 'Termina la partita');

    $('#q-timer').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#q-timer .timer-ring'));
    var timer = new QZ.Timer({
        seconds: 30, ring: ring,
        onSecond: function (s) { if (s <= 5 && s > 0 && S.phase === 'question') QZ.sound.tick(); },
        onExpire: function () {
            if (S.phase !== 'question') return;
            QZ.sound.buzzer();
            QZ.vibrate([80, 40, 80]);
            QZ.toast('Tempo scaduto!', { icon: 'clock', type: 'bad' });
            reveal();
        }
    });

    /* ---------- Stato ---------- */
    var S = { phase: 'idle' };

    $('#start-btn').addEventListener('click', start);
    $('#reveal-btn').addEventListener('click', reveal);
    $('#ok-btn').addEventListener('click', function () { judge(true); });
    $('#ko-btn').addEventListener('click', function () { judge(false); });
    $('#board').addEventListener('click', function (e) {
        var b = e.target.closest('.jp-cell');
        if (b && !b.disabled) openCell(b.dataset.k);
    });
    $('#steal-list').addEventListener('click', function (e) {
        var b = e.target.closest('[data-steal]');
        if (b) steal(Number(b.dataset.steal));
    });
    $('#adjust-btn').addEventListener('click', openAdjust);
    $('#end-btn').addEventListener('click', function () {
        QZ.confirm('Chiudere qui la partita e vedere la classifica?', { title: 'Terminare?', okLabel: 'Classifica', cancelLabel: 'Continua' }).then(function (ok) { if (ok) finish(); });
    });

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t.closest && t.closest('input, textarea, select')) return;
        var k = e.key.toLowerCase();
        var onButton = t.closest && t.closest('button, a');
        if ((k === ' ' || k === 'enter') && onButton) return; // lascia il click nativo
        if (S.phase === 'question' && (k === ' ' || k === 'enter')) { e.preventDefault(); reveal(); }
        else if (S.phase === 'judge' && k === 'g') { e.preventDefault(); judge(true); }
        else if (S.phase === 'judge' && k === 's') { e.preventDefault(); judge(false); }
        else if (S.phase === 'steal') {
            if (k === 'n' || k === '0') { e.preventDefault(); steal(-1); }
            else if (/^[1-6]$/.test(k)) {
                var b = $('#steal-list [data-key="' + k + '"]');
                if (b) { e.preventDefault(); steal(Number(b.dataset.steal)); }
            }
        }
    });

    /* ---------- Partita ---------- */
    function start() {
        if (selected.length < MIN_CATS) { QZ.toast('Scegli almeno ' + MIN_CATS + ' categorie', { icon: 'info', type: 'bad' }); return; }
        var names = teamsList.get();
        S = {
            phase: 'board', round: 1, rounds: opts.rounds, cats: CATS.filter(function (c) { return selected.indexOf(c) >= 0; }),
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, right: 0, wrong: 0, steals: 0 }; }),
            active: 0, asked: 0, q: null
        };
        setupRound();
        renderScores();
        $('#scorebar').hidden = false;
        QZ.wake.on();
        QZ.sound.start();
        QZ.show('s-board');
        renderBoard();
    }

    function setupRound() {
        S.cells = {};
        S.cats.forEach(function (c, ci) {
            TIERS.forEach(function (t) { S.cells[ci + '-' + t] = { cat: c, tier: t, used: false, by: -1 }; });
        });
        var keys = Object.keys(S.cells);
        // la doppia posta non cade mai sulla riga piu' bassa: sarebbe sprecata
        var good = keys.filter(function (k) { return S.cells[k].tier >= 200; });
        S.doubleKey = opts.double ? QZ.pick(good) : null;
    }

    function mult() { return S.round === 2 ? 2 : 1; }

    function renderScores() {
        $('#scores').innerHTML = S.teams.map(function (t, i) {
            return '<div class="team' + (i === S.active ? ' is-active' : '') + '" style="--c:' + t.color + '" data-team="' + i + '">' +
                '<span class="team__dot"></span><span class="team__name">' + QZ.esc(t.name) + '</span>' +
                '<span class="team__score" data-score>' + QZ.fmt(t.score) + '</span></div>';
        }).join('');
    }

    function paintActive() {
        QZ.$$('#scores .team').forEach(function (el, i) { el.classList.toggle('is-active', i === S.active); });
        var t = S.teams[S.active];
        var who = $('#turn-who');
        who.style.setProperty('--c', t.color);
        who.innerHTML = S.teams.length > 1 ? 'Sceglie <b>' + QZ.esc(t.name) + '</b>' : 'Scegli una casella';
        QZ.fx.replay(who, 'is-pop');
    }

    function addScore(i, delta) {
        var t = S.teams[i];
        t.score += delta;
        var el = $('#scores [data-team="' + i + '"]');
        if (!el) return;
        var sc = el.querySelector('[data-score]');
        sc.textContent = QZ.fmt(t.score);
        QZ.fx.pop(sc);
        if (delta) QZ.fx.floatText(el, (delta > 0 ? '+' : '−') + QZ.fmt(Math.abs(delta)), delta < 0);
    }

    function renderBoard() {
        var board = $('#board');
        board.style.setProperty('--cols', S.cats.length);
        board.innerHTML = S.cats.map(function (c, ci) {
            return '<div class="jp-col" style="--i:' + ci + '"><div class="jp-col__head">' + QZ.esc(pretty(c)) + '</div>' +
                TIERS.map(function (t) {
                    var k = ci + '-' + t, cell = S.cells[k], pts = t * mult();
                    var by = cell.by >= 0 ? S.teams[cell.by] : null;
                    return '<button type="button" class="jp-cell' + (cell.used && !by ? ' is-miss' : '') + '" data-k="' + k + '"' +
                        (by ? ' style="--c:' + by.color + '"' : '') + (cell.used ? ' disabled' : '') +
                        ' aria-label="' + QZ.esc(pretty(c)) + ', ' + pts + ' punti' + (cell.used ? (by ? ', presa da ' + QZ.esc(by.name) : ', già giocata') : '') + '">' + QZ.fmt(pts) + '</button>';
                }).join('') + '</div>';
        }).join('');
        $('#round-chip').innerHTML = QZ.icon('grid') + (S.rounds > 1 ? 'Round ' + S.round + '/' + S.rounds : remaining() + ' caselle');
        if (S.rounds > 1) $('#round-chip').innerHTML += ' · ' + remaining() + ' caselle';
        paintActive();
    }

    function remaining() {
        return Object.keys(S.cells).filter(function (k) { return !S.cells[k].used; }).length;
    }

    function openCell(k) {
        if (S.phase !== 'board') return;
        var cell = S.cells[k];
        if (!cell || cell.used) return;
        var item = deck.draw(function (x) { return x.cat === cell.cat && x.value === cell.tier; });
        if (!item) { QZ.toast('Nessuna domanda disponibile per questa casella', { icon: 'info', type: 'bad' }); return; }
        cell.used = true;
        var isDouble = k === S.doubleKey;
        S.q = { key: k, cell: cell, item: item, points: cell.tier * mult() * (isDouble ? 2 : 1), double: isDouble, answered: S.active };
        S.asked++;
        S.phase = 'question';

        $('#q-cat').innerHTML = QZ.icon(isDouble ? 'sparkles' : 'ball') + QZ.esc(isDouble ? 'Doppia posta · ' + pretty(cell.cat) : pretty(cell.cat));
        var v = $('#q-value');
        v.textContent = QZ.fmt(S.q.points) + ' punti';
        v.classList.toggle('is-double', isDouble);
        var qt = $('#q-text');
        qt.textContent = item.q;
        $('#q-ans').hidden = true;
        $('#q-ans-text').textContent = item.a;
        $('#act-reveal').hidden = false;
        $('#act-judge').hidden = true;
        $('#act-steal').hidden = true;
        $('#q-timer').hidden = !opts.time;
        timer.reset(opts.time || 30);

        QZ.show('s-q');
        QZ.fx.replay(qt);
        QZ.fx.pop(v);
        if (isDouble) {
            QZ.sound.lifeline();
            QZ.fx.flash('rgba(245,197,66,.45)');
            QZ.toast('Doppia posta! Questa casella vale ' + QZ.fmt(S.q.points) + ' punti', { icon: 'sparkles', type: 'ok', ms: 3000 });
        } else {
            QZ.sound.whoosh();
        }
        if (opts.time) setTimeout(function () { if (S.phase === 'question') timer.start(); }, 500);
    }

    function reveal() {
        if (S.phase !== 'question') return;
        S.phase = 'judge';
        timer.pause();
        $('#q-ans').hidden = false;
        QZ.fx.replay($('#q-ans'), 'is-pop');
        QZ.sound.reveal();
        $('#act-reveal').hidden = true;
        $('#act-judge').hidden = false;
        var p = QZ.fmt(S.q.points);
        $('#ok-btn').innerHTML = QZ.icon('check') + 'Giusta +' + p;
        $('#ko-btn').innerHTML = QZ.icon('x') + 'Sbagliata' + (opts.penalty ? ' −' + p : '');
        $('#q-timer').hidden = true;
        $('#ok-btn').focus({ preventScroll: true });
        $('#act-judge').scrollIntoView({ block: 'nearest', behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
    }

    function judge(ok) {
        if (S.phase !== 'judge') return;
        var i = S.active, t = S.teams[i];
        if (ok) {
            S.phase = 'resolved';
            t.right++;
            S.q.cell.by = i;
            addScore(i, S.q.points);
            QZ.sound.correct();
            QZ.vibrate(40);
            QZ.fx.sparks($('#ok-btn'), t.color);
            if (S.q.double) QZ.fx.confetti({ count: 80 });
            done(900);
            return;
        }
        t.wrong++;
        if (opts.penalty) addScore(i, -S.q.points);
        QZ.sound.wrong();
        QZ.vibrate([60, 40, 60]);
        QZ.fx.shake($('.jp-q'));
        if (opts.steal && S.teams.length > 1) {
            S.phase = 'steal';
            $('#act-judge').hidden = true;
            var n = 0;
            $('#steal-list').innerHTML = S.teams.map(function (x, j) {
                if (j === i) return '';
                n++;
                return '<button type="button" class="btn" style="--c:' + x.color + '" data-steal="' + j + '" data-key="' + n + '"><span class="team__dot"></span>' + QZ.esc(x.name) + '</button>';
            }).join('') + '<button type="button" class="btn btn--ghost" data-steal="-1">Nessuno</button>';
            $('#act-steal').hidden = false;
            QZ.fx.replay($('#act-steal'), 'is-pop');
        } else {
            S.phase = 'resolved';
            done(1100);
        }
    }

    function steal(j) {
        if (S.phase !== 'steal') return;
        S.phase = 'resolved';
        if (j >= 0) {
            var t = S.teams[j];
            t.steals++;
            t.right++;
            S.q.cell.by = j;
            addScore(j, S.q.points);
            QZ.sound.coin();
            QZ.fx.sparks($('#steal-list [data-steal="' + j + '"]'), t.color);
            QZ.toast(t.name + ' ruba ' + QZ.fmt(S.q.points) + ' punti!', { icon: 'zap', type: 'ok' });
        }
        done(j >= 0 ? 900 : 300);
    }

    function done(delay) {
        setTimeout(function () {
            if (S.phase !== 'resolved') return;
            S.active = (S.active + 1) % S.teams.length;
            if (!remaining()) { endRound(); return; }
            S.phase = 'board';
            QZ.show('s-board');
            renderBoard();
        }, delay);
    }

    function endRound() {
        if (S.round < S.rounds) {
            S.round++;
            setupRound();
            S.phase = 'between';
            QZ.sound.levelUp();
            QZ.modal({
                title: 'Round ' + S.round + ': punti doppi!',
                text: 'Stesse categorie, domande nuove: ogni casella ora vale il doppio. Le squadre in svantaggio possono ancora rimontare.',
                dismissable: false,
                actions: [{ label: 'Avanti', primary: true, icon: 'arrow' }]
            }).then(function () {
                S.phase = 'board';
                QZ.show('s-board');
                renderBoard();
            });
            return;
        }
        finish();
    }

    /* ---------- Correzione punteggi ---------- */
    function openAdjust() {
        if (S.phase !== 'board') return;
        var node = QZ.el('<div class="jp-adjust">' + S.teams.map(function (t, i) {
            return '<div class="jp-adjust__row" style="--c:' + t.color + '"><span class="team__dot"></span><span class="grow" style="font-weight:800">' + QZ.esc(t.name) + '</span>' +
                '<button type="button" class="btn btn--sm btn--icon" data-adj="' + i + '" data-d="-100" aria-label="Togli 100 punti a ' + QZ.esc(t.name) + '">' + QZ.icon('minus') + '</button>' +
                '<output data-out="' + i + '" aria-live="polite">' + QZ.fmt(t.score) + '</output>' +
                '<button type="button" class="btn btn--sm btn--icon" data-adj="' + i + '" data-d="100" aria-label="Aggiungi 100 punti a ' + QZ.esc(t.name) + '">' + QZ.icon('plus') + '</button></div>';
        }).join('') + '</div>');
        node.addEventListener('click', function (e) {
            var b = e.target.closest('[data-adj]');
            if (!b) return;
            var i = Number(b.dataset.adj);
            addScore(i, Number(b.dataset.d));
            node.querySelector('[data-out="' + i + '"]').textContent = QZ.fmt(S.teams[i].score);
        });
        QZ.modal({ title: 'Correggi i punteggi', node: node, actions: [{ label: 'Fatto', primary: true }] });
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        S.phase = 'done';
        timer.pause();
        QZ.wake.off();
        $('#scorebar').hidden = true;
        var ranked = S.teams.slice().sort(function (a, b) { return b.score - a.score; });
        var top = ranked[0];
        var tie = ranked.length > 1 && ranked[1].score === top.score;
        var right = S.teams.reduce(function (s, t) { return s + t.right; }, 0);
        var steals = S.teams.reduce(function (s, t) { return s + t.steals; }, 0);
        var solo = S.teams.length === 1;
        var xp = Math.min(150, 15 + S.asked * 3 + right * 2);
        var r = QZ.profile.record('jeopardy', {
            xp: xp,
            label: solo ? QZ.fmt(top.score) + ' punti' : (tie ? 'Pareggio a ' : 'Vince ' + top.name + ' con ') + QZ.fmt(top.score) + ' punti',
            score: top.score
        });

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: solo ? top.score > 0 : true,
            icon: 'trophy',
            title: solo ? 'Tabellone chiuso' : tie ? 'Pareggio!' : 'Vince ' + top.name + '!',
            subtitle: solo ? plural(right, 'risposta giusta', 'risposte giuste') + ' su ' + plural(S.asked, 'domanda', 'domande') + '.' : tie ? 'Stesso punteggio in vetta: serve una rivincita.' : 'Classifica finale dopo ' + S.asked + ' domande.',
            big: top.score, bigSuffix: ' pt',
            record: r,
            stats: [
                { label: 'Domande', value: S.asked },
                { label: 'Risposte giuste', value: right },
                { label: 'Rubate', value: steals },
                { label: 'Round', value: S.round + '/' + S.rounds }
            ],
            extraHTML: solo ? '' : '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                return { name: t.name, score: t.score, color: t.color, sub: plural(t.right, 'giusta', 'giuste') + ' · ' + plural(t.wrong, 'sbagliata', 'sbagliate') + (t.steals ? ' · ' + plural(t.steals, 'rubata', 'rubate') : '') };
            }), function (s) { return QZ.fmt(s) + ' pt'; }) + '</div>',
            share: solo ? 'Ho fatto ' + QZ.fmt(top.score) + ' punti al Jeopardy del calcio su Quizzotti!' :
                (tie ? 'Pareggio' : top.name + ' vince') + ' al Jeopardy del calcio su Quizzotti con ' + QZ.fmt(top.score) + ' punti!',
            onRetry: start
        });
        var row = $('#end-host .row.mt-3:last-child');
        if (row) {
            var b = QZ.el('<button type="button" class="btn btn--ghost btn--lg">' + QZ.icon('users') + 'Cambia squadre</button>');
            b.addEventListener('click', function () { QZ.show('s-start'); });
            row.insertBefore(b, row.lastElementChild);
        }
    }
})();
