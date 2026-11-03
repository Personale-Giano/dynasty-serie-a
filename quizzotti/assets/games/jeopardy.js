/* ==========================================================================
   QUIZZOTTI v2 — Jeopardy
   Dati: assets/db-jeopardy.js (`jeopardyData`: 9 categorie x 50 domande,
   10 per ciascun valore da 100 a 500).
   Tabellone unico che si adatta allo schermo, categorie a scelta, domande
   che non si ripetono tra le partite, secondo tempo a punti doppi, casella
   "doppia posta", rubata, tempo per rispondere opzionale, correzione
   punteggi e classifica finale.
   Stile "Almanacco": il tabellone e' una griglia stampata, le caselle
   giocate si cancellano a penna con le iniziali di chi le ha prese.
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

    /** Sigla da scarabocchiare sulla casella: "Squadra 1" -> "S1", "Rossi" -> "ROS". */
    function initials(name) {
        var words = String(name).trim().split(/\s+/).filter(Boolean);
        if (words.length > 1) return words.slice(0, 3).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
        return String(name).trim().slice(0, 3).toUpperCase();
    }

    /* ---------- Impostazioni (ricordate tra le visite) ---------- */
    var OPT_KEY = 'qz.jeopardy.opts';
    var opts = Object.assign({ rounds: 1, time: 0, penalty: true, steal: true, double: true, cats: null }, QZ.store.get(OPT_KEY, {}) || {});
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }

    var selected = (Array.isArray(opts.cats) ? opts.cats : []).filter(function (c) { return CATS.indexOf(c) >= 0; });
    if (selected.length < MIN_CATS) selected = QZ.shuffle(CATS).slice(0, 5);

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('grid');
    $('#rules').innerHTML = [
        ['A turno', 'ogni squadra sceglie una casella: categoria e valore.'],
        ['Rispondete a voce,', 'poi scoprite la risposta e segnate se è giusta.'],
        ['Chi sbaglia paga', 'i punti della casella. Gli altri possono rubarli.'],
        ['Tabellone pulito?', 'Vince chi ha più punti. Nel secondo tempo valgono doppio.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var rec = QZ.profile.best('jeopardy');
    $('#start-record').textContent = rec != null ? 'record da battere: ' + QZ.fmt(rec) + ' punti' : '';

    var teamsList = QZ.playerList($('#teams-host'), { key: 'jeopardy', min: 1, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (1-6)' });

    var XPATH = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 8 L25 25 M24 7 L8 25"/></svg>';
    $('#cats-random').innerHTML = QZ.icon('shuffle') + 'Pesca a caso';
    $('#cats').innerHTML = CATS.map(function (c, i) {
        return '<button type="button" class="jp-cat" data-i="' + i + '" aria-pressed="false"><span class="jp-cat__box">' + XPATH + '</span>' + QZ.esc(pretty(c)) + '</button>';
    }).join('');
    // aggiorna le caselle senza ridisegnarle: la X a penna si traccia solo su quella toccata
    function paintCats(drawn) {
        QZ.$$('#cats .jp-cat').forEach(function (b) {
            var on = selected.indexOf(CATS[Number(b.dataset.i)]) >= 0;
            b.setAttribute('aria-pressed', String(on));
            b.classList.toggle('is-drawn', on && (drawn === 'all' || drawn === b));
        });
        $('#cats-hint').textContent = plural(selected.length, 'categoria', 'categorie') + ' su ' + MAX_CATS + ' · ' + plural(selected.length * TIERS.length, 'casella', 'caselle') + ' per tempo';
    }
    paintCats();
    $('#cats').addEventListener('click', function (e) {
        var b = e.target.closest('.jp-cat');
        if (!b) return;
        var c = CATS[Number(b.dataset.i)], at = selected.indexOf(c);
        if (at >= 0) {
            if (selected.length <= MIN_CATS) { QZ.toast('Con meno di ' + MIN_CATS + ' categorie non è una partita', { icon: 'info' }); QZ.fx.shake(b); return; }
            selected.splice(at, 1);
        } else {
            if (selected.length >= MAX_CATS) { QZ.toast('Sei categorie bastano e avanzano', { icon: 'info' }); QZ.fx.shake(b); return; }
            selected.push(c);
        }
        QZ.sound.click();
        opts.cats = selected.slice(); saveOpts();
        paintCats(b);
    });
    $('#cats-random').addEventListener('click', function () {
        selected = QZ.shuffle(CATS).slice(0, 5);
        opts.cats = selected.slice(); saveOpts();
        paintCats('all');
    });

    QZ.segmented($('#opt-rounds'), [{ label: 'Un tempo', value: 1 }, { label: 'Due tempi', value: 2 }], opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-time'), [{ label: 'Libero', value: 0 }, { label: '15 s', value: 15 }, { label: '30 s', value: 30 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-penalty'), [{ label: 'Perde i punti', value: true }, { label: 'Non perde nulla', value: false }], opts.penalty, function (v) { opts.penalty = v; saveOpts(); });
    $('#opt-steal').checked = opts.steal;
    $('#opt-double').checked = opts.double;
    $('#opt-steal').addEventListener('change', function () { opts.steal = this.checked; saveOpts(); });
    $('#opt-double').addEventListener('change', function () { opts.double = this.checked; saveOpts(); });

    $('#reveal-btn').innerHTML = QZ.icon('eye') + 'Scopri la risposta';
    $('#adjust-btn').innerHTML = QZ.icon('plus') + '<span>Correggi</span>';
    $('#adjust-btn').setAttribute('aria-label', 'Correggi i punteggi');
    $('#end-btn').innerHTML = QZ.icon('whistle') + '<span>Fischia la fine</span>';
    $('#end-btn').setAttribute('aria-label', 'Fischia la fine della partita');

    $('#q-timer').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#q-timer .timer-ring'));
    var timer = new QZ.Timer({
        seconds: 30, ring: ring,
        onSecond: function (s) {
            if (S.phase !== 'question') return;
            if (s <= 5 && s > 0) QZ.sound.tick();
            // un solo avviso a voce, non un secondo alla volta
            if (s === 10 && timer.duration > 10) QZ.say('Dieci secondi');
        },
        onExpire: function () {
            if (S.phase !== 'question') return;
            QZ.sound.buzzer();
            QZ.vibrate([80, 40, 80]);
            QZ.fx.stamp($('#q-body'), 'Tempo!', 'ink', { size: 34, ms: 1400, say: false });
            S.timeUp = true;
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
        QZ.confirm('Si chiude qui e si guarda la classifica. Le caselle rimaste restano sul tabellone.', { title: 'Fischio finale?', okLabel: 'Classifica', cancelLabel: 'Si gioca ancora' }).then(function (ok) { if (ok) finish(); });
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
        // doppio tocco su "Fischio d'inizio": la partita parte una volta sola
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        if (selected.length < MIN_CATS) { QZ.toast('Scegli almeno ' + MIN_CATS + ' categorie', { icon: 'info', type: 'bad' }); return; }
        var names = teamsList.get();
        S = {
            phase: 'board', round: 1, rounds: opts.rounds, cats: CATS.filter(function (c) { return selected.indexOf(c) >= 0; }),
            teams: names.map(function (n, i) { return { name: n, short: initials(n), color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, right: 0, wrong: 0, steals: 0 }; }),
            active: 0, asked: 0, q: null
        };
        setupRound();
        renderScores();
        $('#scorebar').hidden = false;
        QZ.wake.on();
        QZ.sound.whistle();
        QZ.show('s-board');
        renderBoard();
        setTimeout(function () { focusFreeCell(null); }, QZ.reducedMotion() ? 30 : 260);
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
            return '<div class="team' + (i === S.active && S.teams.length > 1 ? ' is-active' : '') + '" style="--c:' + t.color + '" data-team="' + i + '">' +
                '<span class="team__dot"></span><span class="team__name">' + QZ.esc(t.name) + '</span>' +
                '<span class="team__score" data-score>' + QZ.fmt(t.score) + '</span></div>';
        }).join('');
    }

    function paintActive() {
        if (S.teams.length > 1) QZ.$$('#scores .team').forEach(function (el, i) { el.classList.toggle('is-active', i === S.active); });
        var t = S.teams[S.active];
        var who = $('#turn-who');
        who.style.setProperty('--c', t.color);
        who.innerHTML = S.teams.length > 1 ? '<small>sceglie la casella</small><b>' + QZ.esc(t.name) + '</b>' : '<small>tocca a te</small><b>Scegli una casella</b>';
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

    function cellLabel(cell, pts) {
        var by = cell.by >= 0 ? S.teams[cell.by] : null;
        return pretty(cell.cat) + ', ' + QZ.fmt(pts) + ' punti' + (cell.used ? (by ? ', presa da ' + by.name : ', nessuno l\'ha presa') : '');
    }

    function renderBoard() {
        var board = $('#board');
        board.style.setProperty('--cols', S.cats.length);
        board.innerHTML = S.cats.map(function (c, ci) {
            return '<div class="jp-col" style="--i:' + ci + '"><div class="jp-col__head">' + QZ.esc(pretty(c)) + '</div>' +
                TIERS.map(function (t) {
                    var k = ci + '-' + t, cell = S.cells[k], pts = t * mult();
                    return '<button type="button" class="jp-cell" data-k="' + k + '"' + (cell.used ? ' disabled' : '') +
                        ' aria-label="' + QZ.esc(cellLabel(cell, pts)) + '">' + QZ.fmt(pts) + '</button>';
                }).join('') + '</div>';
        }).join('');
        // caselle gia' giocate (ritorno dopo un cambio di schermata): segno fermo, senza animazione
        Object.keys(S.cells).forEach(function (k) { if (S.cells[k].used) inkCell(k, false); });
        paintRound();
        paintActive();
    }

    function paintRound() {
        $('#round-chip').textContent = (S.rounds > 1 ? (S.round === 1 ? '1° tempo' : '2° tempo') + ' · ' : '') + plural(remaining(), 'casella', 'caselle');
    }

    /** Cancella la casella a penna: X nel colore di chi l'ha presa (inchiostro se nessuno) e sigla. */
    function inkCell(k, animate) {
        var b = $('#board [data-k="' + k + '"]');
        if (!b) return;
        var cell = S.cells[k], by = cell.by >= 0 ? S.teams[cell.by] : null;
        b.disabled = true;
        b.classList.toggle('is-static', !animate);
        b.setAttribute('aria-label', cellLabel(cell, cell.tier * mult()));
        QZ.fx.mark(b, 'cross', by ? by.color : 'var(--ink-2)');
        QZ.$$('.jp-cell__by', b).forEach(function (x) { x.remove(); });
        if (by) b.insertAdjacentHTML('beforeend', '<span class="jp-cell__by" style="--c:' + by.color + '" aria-hidden="true">' + QZ.esc(by.short) + '</span>');
    }

    function remaining() {
        return Object.keys(S.cells).filter(function (k) { return !S.cells[k].used; }).length;
    }

    function openCell(k) {
        if (S.phase !== 'board') return;
        var cell = S.cells[k];
        if (!cell || cell.used) return;
        var item = deck.draw(function (x) { return x.cat === cell.cat && x.value === cell.tier; });
        if (!item) { QZ.toast('Casella vuota: scegline un\'altra', { icon: 'info', type: 'bad' }); return; }
        cell.used = true;
        var isDouble = k === S.doubleKey;
        S.q = { key: k, cell: cell, item: item, points: cell.tier * mult() * (isDouble ? 2 : 1), double: isDouble, answered: S.active };
        S.asked++;
        S.phase = 'question';
        S.timeUp = false;

        QZ.$$('#q-card .qz-stamp').forEach(function (x) { x.remove(); });
        $('#q-cat').innerHTML = QZ.icon('ball') + QZ.esc(pretty(cell.cat));
        var v = $('#q-value');
        // niente aria-label su uno span: il resto della frase e' testo nascosto
        v.innerHTML = QZ.fmt(S.q.points) + '<span class="sr-only"> punti' + (isDouble ? ', doppia posta' : '') + '</span>';
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
        var startDelay = 500;
        if (isDouble) {
            // il timbro picchia sul cartoncino appena e' in pagina, poi si toglie per leggere la domanda
            startDelay = 1900;
            setTimeout(function () {
                if (S.phase !== 'question') return;
                QZ.fx.stamp($('#q-body'), 'Doppia posta', 'bad', { size: window.innerWidth < 600 ? 40 : 58, rot: -9, ms: 1500, say: 'Doppia posta: questa casella vale doppio' });
                QZ.vibrate([40, 30, 40]);
            }, QZ.reducedMotion() ? 0 : 320);
        } else {
            QZ.sound.whoosh();
        }
        if (opts.time) setTimeout(function () { if (S.phase === 'question') timer.start(); }, startDelay);
    }

    function reveal() {
        if (S.phase !== 'question') return;
        S.phase = 'judge';
        timer.pause();
        $('#q-ans').hidden = false;
        QZ.sound.reveal();
        $('#act-reveal').hidden = true;
        $('#act-judge').hidden = false;
        var p = QZ.fmt(S.q.points);
        $('#ok-btn').innerHTML = QZ.icon('check') + 'Giusta +' + p;
        $('#ko-btn').innerHTML = QZ.icon('x') + 'Sbagliata' + (opts.penalty ? ' −' + p : '');
        $('#q-timer').hidden = true;
        QZ.say((S.timeUp ? 'Tempo scaduto. ' : '') + 'La risposta: ' + S.q.item.a + '. Giusta o sbagliata?');
        $('#ok-btn').focus({ preventScroll: true });
        $('#act-judge').scrollIntoView({ block: 'nearest', behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
    }

    function judge(ok) {
        if (S.phase !== 'judge') return;
        var i = S.active, t = S.teams[i];
        var body = $('#q-body');
        if (ok) {
            S.phase = 'resolved';
            t.right++;
            S.q.cell.by = i;
            addScore(i, S.q.points);
            QZ.fx.stamp(body, S.q.double ? 'Che giocata' : QZ.pick(['Gol!', 'Esatto', 'Che giocata']), 'ok', { size: 38, say: 'Giusta! ' + t.name + ' più ' + QZ.fmt(S.q.points) + ', ora ' + plural(t.score, 'punto', 'punti') + '.' });
            QZ.sound.correct();
            QZ.vibrate(40);
            if (S.q.double) QZ.fx.confetti({ count: 80 });
            $('#act-judge').hidden = true;
            done(1100);
            return;
        }
        t.wrong++;
        if (opts.penalty) addScore(i, -S.q.points);
        var canSteal = opts.steal && S.teams.length > 1;
        QZ.fx.stamp(body, QZ.pick(['Fuorigioco', 'Palo', 'Fuori!']), 'bad', {
            size: 38,
            say: 'Sbagliata. ' + t.name + (opts.penalty ? ' meno ' + QZ.fmt(S.q.points) + ', ora ' + plural(t.score, 'punto', 'punti') : ' non perde punti') + '.' + (canSteal ? ' Chi la ruba?' : '')
        });
        QZ.sound.wrong();
        QZ.vibrate([60, 40, 60]);
        QZ.fx.shake($('#q-card'));
        $('#act-judge').hidden = true;
        if (canSteal) {
            S.phase = 'steal';
            var n = 0;
            $('#steal-sub').textContent = 'Chi la sapeva si prende ' + QZ.fmt(S.q.points) + ' punti.';
            $('#steal-list').innerHTML = S.teams.map(function (x, j) {
                if (j === i) return '';
                n++;
                return '<button type="button" class="btn" style="--c:' + x.color + '" data-steal="' + j + '" data-key="' + n + '"><span class="team__dot"></span>' + QZ.esc(x.name) + '</button>';
            }).join('') + '<button type="button" class="btn btn--ghost" data-steal="-1">Nessuno</button>';
            $('#act-steal').hidden = false;
            QZ.fx.replay($('#act-steal'), 'is-pop');
            // il bottone appena premuto e' sparito: il fuoco passa alla prima squadra che puo' rubare
            var first = $('#steal-list [data-steal]');
            if (first) first.focus({ preventScroll: true });
        } else {
            S.phase = 'resolved';
            done(1300);
        }
    }

    function steal(j) {
        if (S.phase !== 'steal') return;
        S.phase = 'resolved';
        $('#act-steal').hidden = true;
        if (j >= 0) {
            var t = S.teams[j];
            t.steals++;
            t.right++;
            S.q.cell.by = j;
            addScore(j, S.q.points);
            QZ.sound.coin();
            QZ.fx.stamp($('#q-body'), 'Rubata da ' + t.short, 'ink', { size: 34, rot: 6, say: 'Rubata da ' + t.name + ': più ' + QZ.fmt(S.q.points) + ', ora ' + plural(t.score, 'punto', 'punti') + '.' });
        } else {
            QZ.say('Nessuno la ruba.');
        }
        done(j >= 0 ? 1100 : 300);
    }

    function done(delay) {
        setTimeout(function () {
            if (S.phase !== 'resolved') return;
            var k = S.q.key;
            S.active = (S.active + 1) % S.teams.length;
            S.phase = 'inking';
            QZ.show('s-board');
            paintRound();
            paintActive();
            // si torna al tabellone e la penna cancella la casella appena giocata
            setTimeout(function () {
                var b = $('#board [data-k="' + k + '"]');
                if (b) b.scrollIntoView({ block: 'nearest', behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
                inkCell(k, true);
                focusFreeCell(k);
                QZ.sound.tone(300 + Math.random() * 80, 0.12, 'triangle', 0.05);
                // a tratto finito il segno diventa fisso (regge anche se lo schermo cambia misura)
                setTimeout(function () { if (b) b.classList.add('is-static'); }, 700);
                if (!remaining()) { S.phase = 'between'; setTimeout(endRound, 900); return; }
                S.phase = 'board';
            }, QZ.reducedMotion() ? 30 : 320);
        }, delay);
    }

    /** Il fuoco non resta su una casella spenta: va alla prossima libera (dopo `k`, poi dall'inizio). */
    function focusFreeCell(k) {
        var cells = QZ.$$('#board .jp-cell');
        var at = k ? cells.indexOf($('#board [data-k="' + k + '"]')) : -1;
        var free = cells.slice(at + 1).concat(cells.slice(0, at + 1)).filter(function (b) { return !b.disabled; });
        if (free.length) free[0].focus({ preventScroll: true });
        else $('#end-btn').focus({ preventScroll: true });
    }

    function endRound() {
        if (S.round < S.rounds) {
            S.round++;
            setupRound();
            S.phase = 'between';
            QZ.sound.whistle();
            QZ.modal({
                title: 'Secondo tempo',
                text: 'Stesse categorie, domande nuove e ogni casella vale il doppio. Chi è sotto può ancora ribaltarla.',
                dismissable: false,
                actions: [{ label: 'Si riparte', primary: true, icon: 'arrow' }]
            }).then(function () {
                S.phase = 'board';
                renderBoard();
                focusFreeCell(null);
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
        QZ.modal({
            title: 'Correggi i punteggi',
            html: '<p class="muted" style="margin-bottom:14px">Il VAR del salotto: cento punti alla volta.</p>',
            onOpen: function (m) { m.querySelector('.qz-modal__body').appendChild(node); },
            actions: [{ label: 'Fatto', primary: true }]
        });
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
        // la pagella va a chi ha vinto: quante ne ha prese tra quelle a cui ha risposto
        var tries = top.right + top.wrong;
        var ratio = tries ? top.right / tries : 0;
        if (top.score <= 0) ratio = Math.min(ratio, 0.25);

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: solo ? top.score > 0 : true,
            icon: solo ? 'grid' : 'trophy',
            title: solo ? (top.score > 0 ? 'Tabellone chiuso' : 'Serata storta') : tie ? 'Pareggio' : 'Vince ' + top.name,
            subtitle: solo ? plural(right, 'risposta giusta', 'risposte giuste') + ' su ' + plural(S.asked, 'domanda', 'domande') + '.' : tie ? 'Stessi punti in vetta. Qui ci vogliono i supplementari.' : 'Classifica finale dopo ' + plural(S.asked, 'domanda', 'domande') + '.',
            big: top.score, bigSuffix: ' pt',
            ratio: ratio,
            record: r,
            stats: [
                { label: 'Domande', value: S.asked },
                { label: 'Giuste', value: right },
                solo ? null : { label: 'Rubate', value: steals },
                S.rounds > 1 ? { label: 'Tempi', value: S.round + '/' + S.rounds } : null
            ].filter(Boolean),
            extraHTML: solo ? '' : '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                return { name: t.name, score: t.score, color: t.color, sub: plural(t.right, 'giusta', 'giuste') + ' · ' + plural(t.wrong, 'sbagliata', 'sbagliate') + (t.steals ? ' · ' + plural(t.steals, 'rubata', 'rubate') : '') };
            }), function (s) { return QZ.fmt(s) + ' pt'; }) + '</div>',
            share: solo ? 'Ho fatto ' + QZ.fmt(top.score) + ' punti al Jeopardy del calcio su Quizzotti.' :
                (tie ? 'Pareggio' : top.name + ' vince') + ' al Jeopardy del calcio su Quizzotti con ' + QZ.fmt(top.score) + ' punti.',
            onRetry: start,
            secondary: { label: 'Cambia squadre', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }
})();
