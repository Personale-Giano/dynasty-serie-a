/* ==========================================================================
   QUIZZOTTI v2 — Jeopardy
   Dati: assets/db-jeopardy.js (`jeopardyData`: 9 categorie x 90 domande,
   18 per ciascun valore da 100 a 500).
   Tabellone unico che si adatta allo schermo, categorie a scelta, domande
   che non si ripetono tra le partite, secondo tempo a punti doppi, casella
   "doppia posta", rubata, tempo per rispondere opzionale, gran finale a
   puntata libera, correzione punteggi, partita salvata (si riprende dopo
   una ricarica o il tasto Indietro) e classifica finale.
   Stile "Riflettori": il tabellone e' una griglia di LED dello stadio, le
   caselle giocate si spengono e restano accese le iniziali di chi le ha
   prese; la domanda va sul maxischermo.
   ========================================================================== */
(function () {
    'use strict';

    var TIERS = [100, 200, 300, 400, 500];
    var MAX_CATS = 6, MIN_CATS = 2;
    var FINAL_MIN_BET = 500; // chi ha meno punti puo' comunque puntare fino a qui
    var $ = QZ.$;

    /* ---------- Pool domande ---------- */
    var CATS = jeopardyData.map(function (c) { return c.category; });
    var POOL = [];
    jeopardyData.forEach(function (c) {
        c.questions.forEach(function (q) { POOL.push({ cat: c.category, value: q.value, q: q.question, a: q.answer }); });
    });
    var deck = new QZ.Deck('jeopardy', POOL, function (x) { return x.q; });

    function plural(n, one, many) { return QZ.fmt(n) + ' ' + (Math.abs(n) === 1 ? one : many); }

    function pretty(cat) {
        return String(cat).toLowerCase().split(' ').map(function (w, i) {
            return i && /^(e|di|del|della|dei|la|il)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    }

    /** Sigla che resta accesa sulla casella: "Squadra 1" -> "S1", "Rossi" -> "ROS". */
    function initials(name) {
        var words = String(name).trim().split(/\s+/).filter(Boolean);
        if (words.length > 1) return words.slice(0, 3).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
        return String(name).trim().slice(0, 3).toUpperCase();
    }

    /* ---------- Impostazioni (ricordate tra le visite) ---------- */
    var OPT_KEY = 'qz.jeopardy.opts';
    var SAVE_KEY = 'qz.jeopardy.save';
    var opts = Object.assign({ rounds: 1, time: 0, penalty: true, steal: true, double: true, final: true, cats: null }, QZ.store.get(OPT_KEY, {}) || {});
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
        ['Tabellone pulito?', 'Nel secondo tempo le caselle valgono doppio.'],
        ['Gran finale:', 'ultima domanda e ognuno punta quanto vuole. Lì si ribalta tutto.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    function paintRecord() {
        var rec = QZ.profile.best('jeopardy');
        // un record a zero o sotto zero non e' un traguardo da mostrare
        $('#start-record').textContent = rec > 0 ? 'record da battere: ' + QZ.fmt(rec) + ' punti' : '';
    }
    paintRecord();

    var teamsList = QZ.playerList($('#teams-host'), { key: 'jeopardy', min: 1, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (1-6)' });

    $('#cats-random').innerHTML = QZ.icon('shuffle') + 'Pesca a caso';
    $('#cats').innerHTML = CATS.map(function (c, i) {
        return '<button type="button" class="jp-cat" data-i="' + i + '" aria-pressed="false"><span class="jp-cat__lamp" aria-hidden="true"></span>' + QZ.esc(pretty(c)) + '</button>';
    }).join('');
    // aggiorna le caselle senza ridisegnarle: la spia si accende solo su quella toccata
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
        QZ.sound.click();
        opts.cats = selected.slice(); saveOpts();
        paintCats('all');
    });

    QZ.segmented($('#opt-rounds'), [{ label: 'Un tempo', value: 1 }, { label: 'Due tempi', value: 2 }], opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-time'), [{ label: 'Libero', value: 0 }, { label: '15 s', value: 15 }, { label: '30 s', value: 30 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-penalty'), [{ label: 'Perde i punti', value: true }, { label: 'Non perde nulla', value: false }], opts.penalty, function (v) { opts.penalty = v; saveOpts(); });
    ['steal', 'double', 'final'].forEach(function (k) {
        var box = $('#opt-' + k);
        box.checked = !!opts[k];
        box.addEventListener('change', function () { opts[k] = this.checked; saveOpts(); });
    });

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
            QZ.fx.stamp($('#q-body'), 'Tempo!', 'bad', { size: 34, ms: 1400, say: false });
            S.timeUp = true;
            reveal();
        }
    });

    // il gran finale ha un suo anello: si scrive la risposta su un foglio, serve piu' tempo
    $('#f-timer').innerHTML = QZ.ringHTML();
    var fTimer = new QZ.Timer({
        seconds: 30, ring: QZ.ring($('#f-timer .timer-ring')),
        onSecond: function (s) {
            if (S.phase !== 'final-q') return;
            if (s <= 5 && s > 0) QZ.sound.tick();
            if (s === 10) QZ.say('Dieci secondi');
        },
        onExpire: function () {
            if (S.phase !== 'final-q') return;
            QZ.sound.buzzer();
            QZ.vibrate([80, 40, 80]);
            QZ.fx.stamp($('#f-body'), 'Penne giù!', 'bad', { size: 32, ms: 1400, say: 'Tempo scaduto: penne giù.' });
            finalReveal();
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
        if (S.phase !== 'board') return;
        QZ.confirm('Si chiude qui e si guarda la classifica. Le caselle rimaste restano sul tabellone.', { title: 'Fischio finale?', okLabel: 'Classifica', cancelLabel: 'Si gioca ancora' }).then(function (ok) {
            // nel frattempo la partita puo' essere andata avanti da sola (ultima casella, secondo tempo)
            if (ok && S.phase === 'board') finish();
        });
    });
    $('#f-bets').addEventListener('click', onFinalClick);
    $('#f-go').addEventListener('click', onFinalGo);

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t.closest && t.closest('input, textarea, select')) return;
        var k = e.key.toLowerCase();
        if (S.phase === 'board' && /^arrow/.test(k) && t.classList && t.classList.contains('jp-cell')) {
            if (moveFocus(t, k)) e.preventDefault();
            return;
        }
        var onButton = t.closest && t.closest('button, a');
        if ((k === ' ' || k === 'enter') && onButton) return; // lascia il click nativo
        if (S.phase === 'question' && (k === ' ' || k === 'enter')) { e.preventDefault(); reveal(); }
        else if (S.phase === 'final-q' && (k === ' ' || k === 'enter')) { e.preventDefault(); finalReveal(); }
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

    /**
     * Frecce sul tabellone: su desktop le categorie sono colonne, su telefono righe.
     * Le caselle spente si saltano; ai bordi il fuoco resta dov'e'.
     */
    function moveFocus(from, key) {
        var p = from.dataset.k.split('-'), ci = Number(p[0]), ti = TIERS.indexOf(Number(p[1]));
        var wide = window.matchMedia('(min-width: 760px)').matches;
        var dCat = 0, dTier = 0;
        if (key === 'arrowleft') { if (wide) dCat = -1; else dTier = -1; }
        else if (key === 'arrowright') { if (wide) dCat = 1; else dTier = 1; }
        else if (key === 'arrowup') { if (wide) dTier = -1; else dCat = -1; }
        else if (key === 'arrowdown') { if (wide) dTier = 1; else dCat = 1; }
        else return false;
        for (var step = 1; step < 8; step++) {
            var c = ci + dCat * step, ti2 = ti + dTier * step;
            if (c < 0 || c >= S.cats.length || ti2 < 0 || ti2 >= TIERS.length) break;
            var b = $('#board [data-k="' + c + '-' + TIERS[ti2] + '"]');
            if (b && !b.disabled) { b.focus(); return true; }
        }
        return true;
    }

    /** Il suggerimento della tastiera segue la fase: solo i tasti che servono adesso. */
    function hint(phase) {
        var h = $('#q-hint');
        if (!h) return;
        var k = function (x) { return '<span class="kbd">' + x + '</span>'; };
        h.innerHTML = phase === 'judge' ? 'Da tastiera: ' + k('G') + ' giusta · ' + k('S') + ' sbagliata'
            : phase === 'steal' ? 'Da tastiera: ' + k('1') + (S.teams.length > 2 ? '–' + k(String(S.teams.length - 1)) : '') + ' chi ruba · ' + k('N') + ' nessuno'
                : 'Da tastiera: ' + k('Spazio') + ' scopri la risposta';
    }

    /* ---------- Partita salvata ---------- */
    function snapshot(stage) {
        return {
            v: 1, at: Date.now(), stage: stage || 'board', o: S.o, round: S.round, rounds: S.rounds, cats: S.cats,
            teams: S.teams, active: S.active, asked: S.asked, cells: S.cells, doubleKey: S.doubleKey
        };
    }
    function save(stage) { if (S.teams) QZ.store.set(SAVE_KEY, snapshot(stage)); }
    function dropSave() { QZ.store.remove(SAVE_KEY); }

    /** Una partita salvata da una versione vecchia o rovinata non si riprende. */
    function loadSave() {
        var d = QZ.store.get(SAVE_KEY, null);
        if (!d || d.v !== 1 || !Array.isArray(d.cats) || !Array.isArray(d.teams) || !d.cells || typeof d.cells !== 'object') return null;
        if (d.cats.length < MIN_CATS || d.cats.some(function (c) { return CATS.indexOf(c) < 0; })) return null;
        if (!d.teams.length || d.teams.length > 6 || d.teams.some(function (t) { return !t || typeof t.name !== 'string' || typeof t.score !== 'number'; })) return null;
        var ok = d.cats.every(function (c, ci) {
            return TIERS.every(function (t) { var x = d.cells[ci + '-' + t]; return x && x.cat === c && x.tier === t; });
        });
        if (!ok || Date.now() - (d.at || 0) > 14 * 864e5) return null;
        return d;
    }

    function paintResume() {
        var d = loadSave(), box = $('#resume');
        box.hidden = !d;
        if (!d) return;
        var played = Object.keys(d.cells).filter(function (k) { return d.cells[k].used; }).length;
        var ranked = d.teams.slice().sort(function (a, b) { return b.score - a.score; });
        $('#resume-txt').textContent = (d.teams.length === 1 ? QZ.fmt(ranked[0].score) + ' punti' : ranked.map(function (t) { return t.name + ' ' + QZ.fmt(t.score); }).join(' · ')) +
            ' · ' + (d.stage === 'final' ? 'si era al gran finale' : plural(played, 'casella giocata', 'caselle giocate') + (d.rounds > 1 ? ', ' + (d.round === 1 ? 'primo' : 'secondo') + ' tempo' : ''));
    }
    $('#resume-go').innerHTML = QZ.icon('arrow') + 'Riprendi';
    $('#resume-drop').textContent = 'Lascia perdere';
    $('#resume-go').addEventListener('click', resume);
    $('#resume-drop').addEventListener('click', function () { dropSave(); paintResume(); QZ.sound.click(); $('#start-btn').focus(); });
    paintResume();

    function resume() {
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        var d = loadSave();
        if (!d) { paintResume(); return; }
        S = {
            phase: 'board', o: Object.assign({ penalty: true, steal: true, double: true, final: false, time: 0 }, d.o || {}),
            round: d.round === 2 ? 2 : 1, rounds: d.rounds === 2 ? 2 : 1, cats: d.cats, cells: d.cells, doubleKey: d.doubleKey || null,
            teams: d.teams.map(function (t, i) {
                return { name: t.name, short: t.short || initials(t.name), color: t.color || QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: t.score, right: t.right || 0, wrong: t.wrong || 0, steals: t.steals || 0 };
            }),
            active: Math.min(Math.max(0, d.active | 0), d.teams.length - 1), asked: d.asked | 0, q: null
        };
        enterGame();
        if (d.stage === 'final') { startFinal(); return; }
        QZ.show('s-board');
        renderBoard();
        QZ.say('Partita ripresa.');
        if (!remaining()) { S.phase = 'between'; setTimeout(endRound, 400); return; }
        setTimeout(function () { focusFreeCell(null); }, QZ.reducedMotion() ? 30 : 260);
    }

    /* ---------- Partita ---------- */
    function enterGame() {
        S.readyAt = Date.now() + 400;
        renderScores();
        $('#scorebar').hidden = false;
        QZ.wake.on();
        QZ.sound.whistle();
    }

    function start() {
        // doppio tocco su "Fischio d'inizio": la partita parte una volta sola
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        if (selected.length < MIN_CATS) { QZ.toast('Scegli almeno ' + MIN_CATS + ' categorie', { icon: 'info', type: 'bad' }); return; }
        var names = teamsList.get();
        S = {
            phase: 'board', round: 1, rounds: opts.rounds,
            // le regole si fissano al fischio d'inizio: cambiarle dopo non tocca la partita in corso
            o: { penalty: opts.penalty, steal: opts.steal, double: opts.double, final: opts.final, time: opts.time },
            cats: CATS.filter(function (c) { return selected.indexOf(c) >= 0; }),
            teams: names.map(function (n, i) { return { name: n, short: initials(n), color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, right: 0, wrong: 0, steals: 0 }; }),
            active: 0, asked: 0, q: null
        };
        setupRound();
        save();
        enterGame();
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
        S.doubleKey = S.o.double ? QZ.pick(good) : null;
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
        var solo = S.teams.length === 1;
        var who = $('#turn-who');
        $('#turn-cell').style.setProperty('--c', solo ? 'var(--accent)' : t.color);
        $('#turn-label').textContent = solo ? 'Da solo' : 'Tocca a';
        // la parte nascosta completa la frase per chi ascolta: "Sceglie la casella: Squadra 1"
        who.innerHTML = solo ? 'Scegli' : '<span class="sr-only">Sceglie la casella: </span>' + QZ.esc(t.name);
        who.title = solo ? '' : t.name;
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
        // caselle gia' giocate (ritorno dopo un cambio di schermata): spente subito, senza sfarfallio
        Object.keys(S.cells).forEach(function (k) { if (S.cells[k].used) darkCell(k, false); });
        paintRound();
        paintActive();
    }

    function paintRound() {
        $('#round-cell').hidden = S.rounds < 2;
        // niente aria-label sugli span: la cifra a LED e' per gli occhi, la frase nascosta per chi ascolta
        $('#round-led').innerHTML = '<span aria-hidden="true">' + S.round + 'T</span><span class="sr-only">' + (S.round === 1 ? 'primo' : 'secondo') + '</span>';
        $('#left-led').textContent = String(remaining()).padStart(2, '0');
    }

    /**
     * La casella giocata si spegne: restano accese le iniziali di chi l'ha presa,
     * nel suo colore, oppure un trattino fioco se non l'ha presa nessuno.
     */
    function darkCell(k, animate) {
        var b = $('#board [data-k="' + k + '"]');
        if (!b) return;
        var cell = S.cells[k], by = cell.by >= 0 ? S.teams[cell.by] : null;
        b.disabled = true;
        b.classList.add('is-played');
        b.classList.toggle('is-nobody', !by);
        if (by) b.style.setProperty('--c', by.color);
        b.setAttribute('aria-label', cellLabel(cell, cell.tier * mult()));
        b.innerHTML = '<span aria-hidden="true">' + (by ? QZ.esc(by.short) : '—') + '</span>';
        if (animate) QZ.fx.replay(b, 'is-switch');
    }

    function remaining() {
        return Object.keys(S.cells).filter(function (k) { return !S.cells[k].used; }).length;
    }

    function openCell(k) {
        // il secondo tocco di un doppio tap su "Fischio d'inizio" cadrebbe su una casella appena comparsa
        if (S.phase !== 'board' || Date.now() < (S.readyAt || 0)) return;
        var cell = S.cells[k];
        if (!cell || cell.used) return;
        var item = deck.draw(function (x) { return x.cat === cell.cat && x.value === cell.tier; });
        if (!item) { QZ.toast('Casella vuota: scegline un\'altra', { icon: 'info', type: 'bad' }); return; }
        cell.used = true;
        var isDouble = k === S.doubleKey;
        S.q = { key: k, cell: cell, item: item, points: cell.tier * mult() * (isDouble ? 2 : 1), double: isDouble };
        S.asked++;
        S.phase = 'question';
        S.timeUp = false;

        QZ.$$('#q-card .qz-stamp').forEach(function (x) { x.remove(); });
        $('#q-cat').innerHTML = QZ.icon('ball') + QZ.esc(pretty(cell.cat));
        var v = $('#q-value');
        // niente aria-label su uno span: il resto della frase e' testo nascosto
        v.innerHTML = QZ.fmt(S.q.points) + '<span class="sr-only"> punti</span>';
        v.classList.toggle('led--red', isDouble);
        $('#q-value-box').classList.toggle('is-double', isDouble);
        $('#q-value-label').textContent = isDouble ? 'Doppia posta' : 'In palio';
        // chi risponde: col telefono sul tavolo si vede subito di chi e' il turno
        var t = S.teams[S.active];
        var who = $('#q-who');
        who.hidden = S.teams.length < 2;
        who.style.setProperty('--c', t.color);
        who.querySelector('span:last-child').textContent = t.name;
        var qt = $('#q-text');
        qt.textContent = item.q;
        $('#q-ans').hidden = true;
        $('#q-ans-text').textContent = item.a;
        $('#act-reveal').hidden = false;
        $('#act-judge').hidden = true;
        $('#act-steal').hidden = true;
        $('#q-timer').hidden = !S.o.time;
        timer.reset(S.o.time || 30);
        hint('question');

        QZ.show('s-q');
        QZ.fx.replay(qt);
        QZ.fx.pop(v);
        var startDelay = 500;
        if (isDouble) {
            // la scritta si accende sul maxischermo appena e' in pagina, poi si spegne per leggere la domanda
            startDelay = 1900;
            setTimeout(function () {
                if (S.phase !== 'question') return;
                QZ.fx.stamp($('#q-body'), 'Doppia posta', 'bad', { size: window.innerWidth < 600 ? 34 : 54, ms: 1500, say: 'Doppia posta: questa casella vale doppio' });
                QZ.fx.flash('rgba(255, 75, 58, .22)');
                QZ.sound.levelUp();
                QZ.vibrate([40, 30, 40]);
            }, QZ.reducedMotion() ? 0 : 320);
        } else {
            QZ.sound.whoosh();
        }
        if (S.o.time) {
            var qref = S.q;
            setTimeout(function () { if (S.phase === 'question' && S.q === qref) timer.start(); }, startDelay);
        }
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
        $('#ko-btn').innerHTML = QZ.icon('x') + 'Sbagliata' + (S.o.penalty ? ' −' + p : '');
        $('#q-timer').hidden = true;
        hint('judge');
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
        if (S.o.penalty) addScore(i, -S.q.points);
        var canSteal = S.o.steal && S.teams.length > 1;
        QZ.fx.stamp(body, QZ.pick(['Fuorigioco', 'Palo', 'Fuori!']), 'bad', {
            size: 38,
            say: 'Sbagliata. ' + t.name + (S.o.penalty ? ' meno ' + QZ.fmt(S.q.points) + ', ora ' + plural(t.score, 'punto', 'punti') : ' non perde punti') + '.' + (canSteal ? ' Chi la ruba?' : '')
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
            hint('steal');
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
            QZ.fx.stamp($('#q-body'), 'Rubata da ' + t.short, 'ink', { size: 34, say: 'Rubata da ' + t.name + ': più ' + QZ.fmt(S.q.points) + ', ora ' + plural(t.score, 'punto', 'punti') + '.' });
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
            S.phase = 'switching';
            QZ.show('s-board');
            paintRound();
            paintActive();
            // si torna al tabellone e la casella appena giocata si spegne
            setTimeout(function () {
                if (S.phase !== 'switching') return;
                var b = $('#board [data-k="' + k + '"]');
                if (b) b.scrollIntoView({ block: 'nearest', behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
                darkCell(k, true);
                focusFreeCell(k);
                QZ.sound.tock();
                if (!remaining()) { S.phase = 'between'; setTimeout(endRound, 900); return; }
                S.phase = 'board';
                save();
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
        if (S.phase !== 'between') return;
        if (S.round < S.rounds) {
            S.round++;
            setupRound();
            save();
            QZ.sound.whistle();
            QZ.modal({
                title: 'Secondo tempo',
                text: 'Stesse categorie, domande nuove e ogni casella vale il doppio. Chi è sotto può ancora ribaltarla.',
                dismissable: false,
                actions: [{ label: 'Si riparte', primary: true, icon: 'arrow' }]
            }).then(function () {
                S.phase = 'board';
                S.readyAt = Date.now() + 400;
                renderBoard();
                focusFreeCell(null);
            });
            return;
        }
        if (S.o.final) startFinal();
        else finish();
    }

    /* ---------- Correzione punteggi ---------- */
    function openAdjust() {
        if (S.phase !== 'board') return;
        var node = QZ.el('<div class="jp-adjust">' + S.teams.map(function (t, i) {
            return '<div class="jp-adjust__row" style="--c:' + t.color + '"><span class="team__dot"></span><span class="grow jp-adjust__name">' + QZ.esc(t.name) + '</span>' +
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
            save();
        });
        QZ.modal({
            title: 'Correggi i punteggi',
            html: '<p class="muted" style="margin-bottom:14px">Il VAR del salotto: cento punti alla volta.</p>',
            onOpen: function (m) { m.querySelector('.qz-modal__body').appendChild(node); },
            actions: [{ label: 'Fatto', primary: true }]
        });
    }

    /* ---------- Gran finale: una domanda, ognuno punta quanto vuole ---------- */
    function maxBet(t) { return Math.max(t.score, FINAL_MIN_BET); }

    function startFinal() {
        var cat = QZ.pick(S.cats);
        var item = deck.draw(function (x) { return x.cat === cat && x.value === 500; }) || deck.draw(function (x) { return x.value === 500; });
        S.fin = { cat: item.cat, item: item, bets: S.teams.map(function () { return 0; }), res: S.teams.map(function () { return null; }) };
        S.phase = 'final-bet';
        save('final');
        QZ.$$('#f-card .qz-stamp').forEach(function (x) { x.remove(); });
        $('#f-cat').innerHTML = QZ.icon('ball') + QZ.esc(pretty(item.cat));
        $('#f-text').textContent = 'Categoria: ' + pretty(item.cat) + '. Quanto ci puntate?';
        $('#f-sub').textContent = S.teams.length === 1
            ? 'Punta da 0 a tutti i tuoi punti (sotto i ' + FINAL_MIN_BET + ' puoi arrivare a ' + FINAL_MIN_BET + '). Se sbagli, la puntata la perdi.'
            : 'Ogni squadra punta da 0 a tutti i suoi punti (chi ne ha meno di ' + FINAL_MIN_BET + ' può arrivare a ' + FINAL_MIN_BET + '). Chi sbaglia perde la puntata.';
        $('#f-sub').hidden = false;
        $('#f-ans').hidden = true;
        $('#f-timer').hidden = true;
        fTimer.reset(Math.max(30, S.o.time || 30));
        renderBets();
        setGo('Mostra la domanda', 'eye');
        QZ.show('s-final');
        QZ.sound.levelUp();
        QZ.fx.flash('rgba(255, 182, 39, .18)');
        setTimeout(function () {
            if (S.phase !== 'final-bet') return;
            QZ.fx.stamp($('#f-body'), 'Gran finale', 'ink', { size: window.innerWidth < 600 ? 34 : 50, ms: 1500, say: 'Gran finale. Categoria ' + pretty(item.cat) + ': fate le vostre puntate.' });
        }, QZ.reducedMotion() ? 0 : 280);
    }

    function setGo(label, icon) { $('#f-go').innerHTML = QZ.icon(icon) + QZ.esc(label); }

    function renderBets() {
        var judging = S.phase === 'final-judge';
        $('#f-bets').innerHTML = S.teams.map(function (t, i) {
            var name = QZ.esc(t.name), bet = S.fin.bets[i];
            var head = '<span class="team__dot"></span><span class="grow jp-adjust__name">' + name +
                '<small>' + (judging ? 'punta ' + QZ.fmt(bet) : plural(t.score, 'punto', 'punti')) + '</small></span>';
            if (judging) {
                var r = S.fin.res[i];
                return '<div class="jp-adjust__row" style="--c:' + t.color + '">' + head +
                    '<div class="jp-verdict" role="group" aria-label="Risposta di ' + name + '">' +
                    '<button type="button" class="btn btn--sm" data-res="' + i + '" data-v="0" aria-pressed="' + (r === false) + '">' + QZ.icon('x') + 'Sbagliata</button>' +
                    '<button type="button" class="btn btn--sm" data-res="' + i + '" data-v="1" aria-pressed="' + (r === true) + '">' + QZ.icon('check') + 'Giusta</button></div></div>';
            }
            var max = maxBet(t);
            return '<div class="jp-adjust__row" style="--c:' + t.color + '">' + head +
                '<button type="button" class="btn btn--sm btn--icon" data-bet="' + i + '" data-d="-100"' + (bet <= 0 ? ' disabled' : '') + ' aria-label="Punta 100 in meno, ' + name + '">' + QZ.icon('minus') + '</button>' +
                '<output data-out="' + i + '" aria-live="polite" aria-label="Puntata di ' + name + '">' + QZ.fmt(bet) + '</output>' +
                '<button type="button" class="btn btn--sm btn--icon" data-bet="' + i + '" data-d="100"' + (bet >= max ? ' disabled' : '') + ' aria-label="Punta 100 in più, ' + name + '">' + QZ.icon('plus') + '</button>' +
                '<button type="button" class="btn btn--sm jp-allin" data-bet="' + i + '" data-d="all"' + (bet >= max ? ' disabled' : '') + ' aria-label="Punta tutto, ' + name + '">Tutto</button></div>';
        }).join('');
        if (judging) $('#f-go').disabled = S.fin.res.some(function (r) { return r === null; });
        else $('#f-go').disabled = false;
    }

    function onFinalClick(e) {
        var b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (S.phase === 'final-bet' && b.dataset.bet != null) {
            var i = Number(b.dataset.bet), t = S.teams[i], max = maxBet(t);
            var next = b.dataset.d === 'all' ? max : S.fin.bets[i] + Number(b.dataset.d);
            S.fin.bets[i] = QZ.clamp(next, 0, max);
            QZ.sound.click();
            var keep = b.dataset.d;
            renderBets();
            // il fuoco resta sullo stesso comando (o sul vicino, se si e' spento)
            var again = $('#f-bets [data-bet="' + i + '"][data-d="' + keep + '"]');
            if (again && !again.disabled) again.focus();
            else { var any = QZ.$$('#f-bets [data-bet="' + i + '"]').filter(function (x) { return !x.disabled; })[0]; if (any) any.focus(); }
            if (b.dataset.d === 'all') QZ.say(t.name + ' punta tutto: ' + QZ.fmt(max) + '.');
        } else if (S.phase === 'final-judge' && b.dataset.res != null) {
            var j = Number(b.dataset.res);
            S.fin.res[j] = b.dataset.v === '1';
            QZ.sound.click();
            renderBets();
            var sameBtn = $('#f-bets [data-res="' + j + '"][data-v="' + b.dataset.v + '"]');
            if (sameBtn) sameBtn.focus();
        }
    }

    function onFinalGo() {
        if (S.phase === 'final-bet') finalQuestion();
        else if (S.phase === 'final-q') finalReveal();
        else if (S.phase === 'final-judge') finalSettle();
    }

    function finalQuestion() {
        S.phase = 'final-q';
        $('#f-text').textContent = S.fin.item.q;
        $('#f-sub').textContent = S.teams.length === 1 ? 'Pensaci bene, poi scopri la risposta.' : 'Ogni squadra scrive la risposta su un foglio, senza farla vedere.';
        QZ.fx.replay($('#f-text'));
        QZ.$$('#f-card .qz-stamp').forEach(function (x) { x.remove(); });
        $('#f-bets').hidden = true;
        setGo('Scopri la risposta', 'eye');
        QZ.sound.whoosh();
        QZ.say(S.fin.item.q);
        if (S.o.time) {
            $('#f-timer').hidden = false;
            setTimeout(function () { if (S.phase === 'final-q') fTimer.start(); }, 500);
        }
        $('#f-go').focus({ preventScroll: true });
    }

    function finalReveal() {
        if (S.phase !== 'final-q') return;
        S.phase = 'final-judge';
        fTimer.pause();
        $('#f-timer').hidden = true;
        $('#f-ans-text').textContent = S.fin.item.a;
        $('#f-ans').hidden = false;
        var ask = S.teams.length === 1 ? 'L\'avevi detta giusta?' : 'Segnate chi l\'ha presa e chi no.';
        $('#f-sub').textContent = ask;
        $('#f-bets').hidden = false;
        renderBets();
        setGo('Classifica finale', 'trophy');
        QZ.sound.reveal();
        QZ.say('La risposta: ' + S.fin.item.a + '. ' + ask);
        var first = $('#f-bets [data-res]');
        if (first) first.focus({ preventScroll: true });
    }

    function finalSettle() {
        if (S.phase !== 'final-judge' || S.fin.res.some(function (r) { return r === null; })) return;
        S.phase = 'final-done';
        $('#f-go').disabled = true;
        var anyRight = false, said = [];
        S.teams.forEach(function (t, i) {
            var bet = S.fin.bets[i], ok = S.fin.res[i];
            if (ok) { t.right++; anyRight = true; } else t.wrong++;
            if (bet) addScore(i, ok ? bet : -bet);
            said.push(t.name + (bet ? (ok ? ' più ' : ' meno ') + QZ.fmt(bet) : (ok ? ' giusta' : ' sbagliata') + ' ma senza puntata'));
        });
        S.asked++;
        if (anyRight) QZ.sound.correct(); else QZ.sound.wrong();
        QZ.fx.stamp($('#f-body'), anyRight ? 'Che finale' : 'Tutti fuori', anyRight ? 'ok' : 'bad', { size: 38, say: said.join(', ') + '.' });
        setTimeout(finish, 1700);
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        if (S.phase === 'done') return;
        S.phase = 'done';
        timer.pause();
        fTimer.pause();
        dropSave();
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
        var asked = plural(S.asked, 'domanda', 'domande');

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: solo ? top.score > 0 : true,
            icon: solo ? 'grid' : 'trophy',
            title: solo ? (top.score > 0 ? 'Tabellone chiuso' : 'Serata storta') : tie ? 'Pareggio' : 'Vince ' + top.name,
            subtitle: solo ? plural(right, 'risposta giusta', 'risposte giuste') + ' su ' + asked + '.' : tie ? 'Stessi punti in vetta. Qui ci vogliono i supplementari.' : 'Classifica finale dopo ' + asked + '.',
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
            share: solo
                ? 'Al Jeopardy del calcio su Quizzotti ho fatto ' + QZ.fmt(top.score) + ' punti: ' + plural(right, 'risposta giusta', 'risposte giuste') + ' su ' + asked + '. Tocca a te.'
                : 'Jeopardy del calcio su Quizzotti, classifica finale: ' + ranked.map(function (t, i) { return (i + 1) + '. ' + t.name + ' ' + QZ.fmt(t.score); }).join(' · ') + '.',
            onRetry: start,
            secondary: { label: 'Cambia squadre', icon: 'users', onClick: function () { QZ.show('s-start'); paintResume(); paintRecord(); } }
        });
    }
})();
