/* ==========================================================================
   QUIZZOTTI v2 — Intesa Vincente
   Dati: assets/db-intesavincente.js (`wordDecks`: tre mazzi; `words`: tutti).
   Da 2 a 6 squadre, mazzo, tempo, giri e passi a scelta, parole che non si
   ripetono (anche tra le partite), passi che si azzerano a ogni turno,
   tempo per rispondere dopo la prenotazione opzionale, time-out (anche da
   solo, se il telefono va in tasca), resoconto del turno correggibile,
   spareggio in caso di parita', partita ripresa dopo un ricaricamento.
   Stile "Riflettori": la parola va sul maxischermo con lo stato a LED in alto,
   la prenotazione e' una scritta che si accende ("PRENOTATO"), i passi sono
   spie a LED e il tempo per rispondere una barra di LED che si spegne.
   Una risposta sbagliata costa un punto (e la parola si brucia); per i nomi
   basta il cognome, tranne quando nel mazzo c'e' un omonimo. La partita si
   salva anche a meta' turno: ricaricando si riparte da li', in time-out.
   La logica pura (impostazioni, punti, omonimi, turno salvato) sta in `core`
   ed e' esportata per i test con Node.
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- Impostazioni: valori ammessi ---------- */
    var CHOICES = { time: [45, 60, 90], rounds: [1, 2, 3, 5], skips: [0, 2, 3, 5], answer: [0, 5, 10] };
    var DEFAULTS = { v: 2, time: 60, rounds: 3, skips: 2, answer: 5, deck: 'tutto' };
    /**
     * Prima della v2 le impostazioni si salvavano tutte insieme a ogni ritocco e il tempo
     * per rispondere "libero" era il default: non si distingue da una scelta, quindi torna
     * ai 5 secondi. 10 secondi invece era stato scelto di sicuro e resta.
     */
    function sanitizeOpts(raw) {
        var o = Object.assign({}, DEFAULTS);
        if (raw && typeof raw === 'object') {
            var old = raw.v !== 2;
            Object.keys(CHOICES).forEach(function (k) {
                if (CHOICES[k].indexOf(raw[k]) < 0) return;
                if (old && k === 'answer' && raw[k] === 0) return;
                o[k] = raw[k];
            });
            if (typeof raw.deck === 'string') o.deck = raw.deck;
        }
        return o;
    }

    /** Punti: giusta +1, sbagliata (o risposta fuori tempo) -1, passo 0. */
    function points(res) { return res === 'ok' ? 1 : res === 'bad' ? -1 : 0; }

    /* ---------- Omonimi: per i nomi basta il cognome, se non ce n'e' un altro uguale ---------- */
    var PARTICLES = ['de', 'di', 'da', 'del', 'della', 'van', 'von', 'der', 'den', 'dos', 'das', 'do', 'le', 'la', 'el', 'ter', 'ten'];
    function fold(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    /** Il cognome con le sue particelle: "Kevin De Bruyne" -> "de bruyne", "Pelé" -> "pele". */
    function surnameKey(name) {
        var t = String(name).trim().split(/\s+/);
        var i = t.length - 1;
        while (i > 1 && PARTICLES.indexOf(fold(t[i - 1])) >= 0) i--;
        return fold(t.slice(i).join(' '));
    }
    /** Mappa nome -> gli altri nomi del mazzo con lo stesso cognome. */
    function homonyms(list) {
        var by = {}, out = {};
        list.forEach(function (n) { var k = surnameKey(n); (by[k] = by[k] || []).push(n); });
        Object.keys(by).forEach(function (k) {
            if (by[k].length < 2) return;
            by[k].forEach(function (n) { out[n] = by[k].filter(function (x) { return x !== n; }); });
        });
        return out;
    }

    /* ---------- Turno salvato a meta' ---------- */
    var RES_OK = ['ok', 'bad', 'skip'];
    function validMid(mid, m) {
        if (!mid || typeof mid !== 'object' || !Array.isArray(mid.log)) return false;
        if (!mid.log.every(function (l) { return l && typeof l.word === 'string' && RES_OK.indexOf(l.res) >= 0; })) return false;
        if (typeof mid.turnPts !== 'number' || !isFinite(mid.turnPts)) return false;
        if (mid.sum) return true;
        var time = (m && m.time) || 90;
        if (!(typeof mid.left === 'number' && mid.left > 0 && mid.left <= time)) return false;
        if (!(typeof mid.skipsLeft === 'number' && mid.skipsLeft >= 0 && mid.skipsLeft <= 5)) return false;
        return mid.cur == null || typeof mid.cur === 'string';
    }

    var core = { CHOICES: CHOICES, DEFAULTS: DEFAULTS, sanitizeOpts: sanitizeOpts, points: points, surnameKey: surnameKey, homonyms: homonyms, validMid: validMid };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Da qui in giu': la pagina
       ====================================================================== */
    var $ = QZ.$;
    var deck = new QZ.Deck('intesavincente', words);
    /* global wordDecks */
    var DECKS = typeof wordDecks === 'object' && wordDecks ? wordDecks : {};
    var DECK_SETS = {};
    Object.keys(DECKS).forEach(function (k) { DECK_SETS[k] = new Set(DECKS[k]); });
    var DECK_NAMES = { tutto: 'Tutto', campioni: 'Campioni', squadre: 'Squadre', gergo: 'Gergo' };

    /* ---------- Impostazioni ---------- */
    var OPT_KEY = 'qz.intesavincente.opts';
    var MATCH_KEY = 'qz.intesavincente.match'; // partita a meta' (si riprende dopo un ricaricamento)
    var BEST_KEY = 'qz.intesavincente.best';   // chi ha fatto il miglior turno su questo telefono
    var opts = sanitizeOpts(QZ.store.get(OPT_KEY, {}));
    if (!DECK_NAMES[opts.deck] || (opts.deck !== 'tutto' && !DECK_SETS[opts.deck])) opts.deck = 'tutto';
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }
    // gli omonimi si cercano tra i nomi di persona (mazzo campioni); "Pelé" e "Abedi Pelé" compresi
    var HOMONYMS = homonyms(DECKS.campioni || []);
    var PEOPLE = new Set(DECKS.campioni || []);

    function deckFilter(name) {
        var set = DECK_SETS[name];
        return set ? function (w) { return set.has(w); } : null;
    }

    /** "A", "A e B", "A, B e C" */
    function andList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]; }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function rulesHTML(list) {
        return list.map(function (r, i) {
            return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
        }).join('');
    }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('users');
    $('#rules').innerHTML = rulesHTML([
        ['Squadre da tre:', 'chi indovina si gira, gli altri due vedono la parola. In due si gioca lo stesso, con un suggeritore solo.'],
        ['Una parola a testa:', 'i suggeritori si alternano. Niente gesti, niente frasi, niente pezzi della parola.'],
        ['Prenota', 'quando il compagno ce l\'ha: il cronometro si ferma e lui risponde. Giusta +1, sbagliata −1 e la parola si brucia.'],
        ['Per i nomi', 'basta il cognome. Se sotto la parola compare «serve il nome», nel mazzo c\'è un omonimo: ci vuole anche il nome.'],
        ['Parola tosta?', 'Si passa. Alla fine dei giri vince chi ha più punti; a pari punti c\'è lo spareggio.']
    ]);

    function paintRecord() {
        var rec = QZ.profile.best('intesavincente');
        var mine = QZ.store.get(BEST_KEY, null);
        var txt = '';
        if (rec != null) {
            txt = 'record: ' + plural(rec, 'parola', 'parole') + ' in un turno';
            if (mine && mine.n === rec && mine.team) txt += ' (' + mine.team + ')';
        }
        $('#start-record').textContent = txt;
    }
    paintRecord();

    var teamsList = QZ.playerList($('#teams-host'), { key: 'intesavincente', min: 2, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (2-6)' });

    QZ.segmented($('#opt-deck'), ['tutto', 'campioni', 'squadre', 'gergo'].filter(function (k) { return k === 'tutto' || DECK_SETS[k]; }).map(function (k) {
        return { label: DECK_NAMES[k], value: k };
    }), opts.deck, function (v) { opts.deck = v; saveOpts(); paintDeckHint(); });
    function paintDeckHint() {
        var n = opts.deck === 'tutto' ? words.length : DECKS[opts.deck].length;
        var what = { tutto: 'Tutti i mazzi mescolati', campioni: 'Giocatori di ieri e di oggi, allenatori e soprannomi', squadre: 'Club, nazionali e stadi', gergo: 'Regole, tattica, mercato, tifo, coppe, storia e tv' }[opts.deck];
        $('#deck-hint').textContent = what + ': ' + n + ' parole.';
    }
    paintDeckHint();
    QZ.segmented($('#opt-time'), [{ label: '45 s', value: 45 }, { label: '60 s', value: 60 }, { label: '90 s', value: 90 }], opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-rounds'), [1, 2, 3, 5].map(function (n) { return { label: String(n), value: n }; }), opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-skips'), [0, 2, 3, 5].map(function (n) { return { label: n ? String(n) : 'Zero', value: n }; }), opts.skips, function (v) { opts.skips = v; saveOpts(); });
    QZ.segmented($('#opt-answer'), [{ label: 'Libero', value: 0 }, { label: '5 s', value: 5 }, { label: '10 s', value: 10 }], opts.answer, function (v) { opts.answer = v; saveOpts(); });

    $('#go-btn').innerHTML = 'Via col tempo' + QZ.icon('arrow');
    $('#pause-btn').innerHTML = QZ.icon('pause');
    $('#buzz-btn').innerHTML = QZ.icon('zap') + 'Prenota';
    $('#ok-btn').innerHTML = QZ.icon('check') + 'Giusta';
    $('#ko-btn').innerHTML = QZ.icon('x') + 'Sbagliata';
    $('#hand-rules').innerHTML = rulesHTML([
        ['Chi indovina', 'si gira di spalle: lo schermo non lo deve vedere.'],
        ['I suggeritori', 'tengono il telefono e premono Prenota quando il compagno vuole rispondere.']
    ]);

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));
    var timer = new QZ.Timer({
        seconds: 60, ring: ring,
        onSecond: function (s) {
            if (s <= 10 && s > 0 && S.phase === 'play') QZ.sound.tick();
            // un solo avviso a voce, non un secondo alla volta
            if (s === 10 && S.time > 10) QZ.say('Ultimi 10 secondi.');
            // il turno a meta' si salva col tempo che resta: ricaricando si riparte da qui
            if (s > 0 && S.phase === 'play') saveMatch();
        },
        onExpire: function () { if (S.phase === 'play' || S.phase === 'anim') timeUp(); }
    });
    var answerTimer = new QZ.Timer({
        seconds: 5, bar: $('#answer-bar'), label: $('#answer-sec'),
        onSecond: function (s) { if (s > 0 && S.phase === 'buzz') QZ.sound.tock(); },
        onExpire: function () { if (S.phase === 'buzz') judge(false, 'Tempo!'); }
    });

    /* ---------- Stato ---------- */
    var S = { phase: 'idle' };
    // tocchi su Giusta/Sbagliata arrivati subito dopo la prenotazione: e' il secondo tocco
    // di un doppio tap su Prenota (che sta proprio sotto Giusta), non un giudizio
    var JUDGE_GUARD = 380;
    // un "Passo" arrivato appena dopo che e' comparsa la parola nuova e' il secondo tocco
    // di un doppio tap lento: nessuno l'ha ancora letta, non si butta un altro passo
    var SKIP_GUARD = 650;

    /** Riporta il fuoco su un bottone di gioco (quello premuto si e' disattivato o nascosto). */
    function refocus(el) {
        var a = document.activeElement;
        if (!el || el.disabled || el.offsetParent === null) return;
        if (!a || a === document.body || a.disabled || a.offsetParent === null) el.focus({ preventScroll: true });
    }

    $('#start-btn').addEventListener('click', start);
    $('#go-btn').addEventListener('click', beginTurn);
    $('#buzz-btn').addEventListener('click', buzz);
    $('#skip-btn').addEventListener('click', skip);
    $('#ok-btn').addEventListener('click', function () { if (guardOk()) judge(true); });
    $('#ko-btn').addEventListener('click', function () { if (guardOk()) judge(false); });
    $('#pause-btn').addEventListener('click', pause);
    $('#sum-next').addEventListener('click', nextTurn);
    $('#sum-list').addEventListener('click', function (e) {
        var b = e.target.closest('[data-idx]');
        if (b) cycle(Number(b.dataset.idx));
    });
    function guardOk() { return S.phase === 'buzz' && performance.now() - (S.buzzAt || 0) >= JUDGE_GUARD; }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t.closest && t.closest('input, textarea, select')) return;
        var k = e.key;
        var onButton = t.closest && t.closest('button, a');
        if (S.phase === 'play') {
            if (k === ' ' || k === 'Enter') { if (onButton && onButton.id !== 'buzz-btn') return; e.preventDefault(); buzz(); }
            else if (k === 'ArrowDown' || k === 'p' || k === 'P') { e.preventDefault(); skip(); }
            else if (k === 'Escape') { e.preventDefault(); pause(); }
        } else if (S.phase === 'buzz') {
            if (k === 'ArrowRight' || k === 'g' || k === 'G') { e.preventDefault(); judge(true); }
            else if (k === 'ArrowLeft' || k === 's' || k === 'S') { e.preventDefault(); judge(false); }
            else if (k === 'Escape') { e.preventDefault(); pause(); }
            // Spazio/Invio su Giusta/Sbagliata lasciano fare al bottone; altrove non giudicano a caso
            else if ((k === ' ' || k === 'Enter') && !onButton) e.preventDefault();
        } else if (S.phase === 'hand' && k === ' ' && !onButton) {
            e.preventDefault(); beginTurn();
        }
    });

    // telefono in tasca, chiamata, cambio app: time-out da solo, cosi' al ritorno non si riparte alla cieca
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (S.phase !== 'idle' && S.phase !== 'done' && S.phase !== 'hand' && S.phase !== 'count') saveMatch();
            if (S.phase === 'play' || S.phase === 'buzz') pause();
            else if (S.phase === 'anim' || S.phase === 'verdict' || S.phase === 'count') S.pauseOnReturn = true;
        } else if (S.pauseOnReturn) {
            S.pauseOnReturn = false;
            setTimeout(function () { if (S.phase === 'play') pause(); }, 0);
        }
    });

    /* ---------- La partita a meta' ---------- */
    // mid: il turno in corso (resoconto fin qui, punti, passi, secondi che restano, parola a schermo);
    // a fine turno { sum: true } riporta al resoconto. Senza mid si riparte dal cambio di squadra.
    function midState() {
        var p = S.phase;
        if (p === 'sum') return { sum: true, log: S.log, turnPts: S.turnPts };
        if (p !== 'play' && p !== 'anim' && p !== 'buzz' && p !== 'verdict' && p !== 'pause') return null;
        return { log: S.log, turnPts: S.turnPts, skipsLeft: S.skipsLeft, left: Math.max(1, Math.ceil(timer.remaining)), cur: S.cur || null };
    }
    function saveMatch() {
        if (!S.teams || S.phase === 'done') return;
        QZ.store.set(MATCH_KEY, {
            v: 1, at: Date.now(), round: S.round, rounds: S.rounds, turn: S.turn, order: S.order,
            time: S.time, skips: S.skips, answer: S.answer, deck: S.deck, giri: S.giri, tiebreak: S.tiebreak,
            xpDone: S.xpDone, teams: S.teams, mid: midState()
        });
    }
    function clearMatch() { QZ.store.remove(MATCH_KEY); }
    function loadMatch() {
        var m = QZ.store.get(MATCH_KEY, null);
        if (!m || m.v !== 1 || !Array.isArray(m.teams) || m.teams.length < 2 || !Array.isArray(m.order) || !m.order.length) return null;
        if (!(Date.now() - m.at < 12 * 3600 * 1000)) return null;
        if (m.order.some(function (i) { return !m.teams[i]; }) || typeof m.order[m.turn] !== 'number') return null;
        if (m.mid && !validMid(m.mid, m)) m.mid = null; // turno rotto: si rigioca dal cambio di squadra
        return m;
    }

    function paintResume() {
        var m = loadMatch(), box = $('#resume');
        box.hidden = !m;
        if (!m) return;
        var who = m.teams[m.order[m.turn]].name;
        var lead = m.teams.slice().sort(function (a, b) { return b.score - a.score; });
        $('#resume-text').textContent = (m.tiebreak ? 'Spareggio' : m.rounds > 1 ? 'Giro ' + m.round + ' di ' + m.rounds : 'Giro unico') +
            (m.mid ? (m.mid.sum ? ', fine del turno di ' + who : ', a metà turno di ' + who + ' (' + m.mid.left + ' s)') : ', tocca a ' + who) + '. ' +
            lead.map(function (t) { return t.name + ' ' + t.score; }).join(' · ');
    }
    $('#resume-go').innerHTML = QZ.icon('play') + 'Riprendi';
    $('#resume-drop').textContent = 'Lascia stare';
    $('#resume-go').addEventListener('click', function () {
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        var m = loadMatch();
        if (!m) { paintResume(); return; }
        S = {
            phase: 'hand', round: m.round, rounds: m.rounds, turn: m.turn, order: m.order, time: m.time, skips: m.skips,
            answer: m.answer, deck: DECK_NAMES[m.deck] ? m.deck : 'tutto', giri: m.giri || m.rounds, tiebreak: m.tiebreak || 0, xpDone: m.xpDone || null,
            teams: m.teams.map(function (t) { return { name: String(t.name), color: t.color, score: +t.score || 0, ok: +t.ok || 0, bad: +t.bad || 0, skip: +t.skip || 0, best: +t.best || 0, lastSkip: +t.lastSkip || 0 }; }),
            log: [], cur: null
        };
        QZ.wake.on();
        QZ.sound.whistle();
        if (m.mid) resumeTurn(m.mid); else showHand();
    });
    $('#resume-drop').addEventListener('click', function () {
        clearMatch();
        paintResume();
        QZ.sound.click();
        $('#start-btn').focus({ preventScroll: true });
    });
    paintResume();

    /* ---------- Partita ---------- */
    function start() {
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        // una partita lasciata a meta' non si cancella senza chiedere
        if (loadMatch()) {
            QZ.confirm('C\'è una partita lasciata a metà: se ne cominci una nuova, quella si perde.', {
                title: 'Nuova partita?', okLabel: 'Nuova partita', cancelLabel: 'Annulla', danger: true
            }).then(function (ok) { if (ok) { clearMatch(); paintResume(); start(); } });
            return;
        }
        var names = teamsList.get();
        S = {
            phase: 'hand', round: 1, turn: 0, rounds: opts.rounds, giri: opts.rounds, time: opts.time, skips: opts.skips, answer: opts.answer, deck: opts.deck,
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, ok: 0, bad: 0, skip: 0, best: 0 }; }),
            order: names.map(function (n, i) { return i; }),
            tiebreak: 0, xpDone: null, log: [], cur: null
        };
        QZ.wake.on();
        QZ.sound.whistle();
        showHand();
    }

    function team() { return S.teams[S.order[S.turn]]; }

    function showHand() {
        S.phase = 'hand';
        saveMatch();
        var t = team();
        $('#s-turn').style.setProperty('--c', t.color);
        $('#hand-round').textContent = S.tiebreak ? 'Spareggio' : S.rounds > 1 ? 'Giro ' + S.round + '/' + S.rounds : 'Giro unico';
        $('#hand-name').textContent = t.name;
        $('#hand-deck').textContent = S.deck === 'tutto' ? '' : 'Mazzo ' + DECK_NAMES[S.deck];
        $('#hand-scores').innerHTML = S.teams.map(function (x, i) {
            var out = S.order.indexOf(i) < 0; // allo spareggio giocano solo le squadre in parita'
            return '<div class="team' + (x === t ? ' is-active' : '') + (out ? ' is-out' : '') + '" style="--c:' + x.color + '"><span class="team__dot"></span>' +
                '<span class="team__name">' + QZ.esc(x.name) + '</span><span class="team__score">' + x.score + '</span></div>';
        }).join('');
        QZ.show('s-turn');
        QZ.say((S.tiebreak ? 'Spareggio. ' : S.rounds > 1 ? 'Giro ' + S.round + ' di ' + S.rounds + '. ' : '') + 'Tocca a ' + t.name + ': il telefono ai suggeritori.');
        QZ.sound.whoosh();
    }

    /** Prepara il maxischermo del turno; left: secondi che restano (turno ripreso dopo un ricaricamento). */
    function setupGame(left) {
        var t = team();
        $('#s-game').style.setProperty('--c', t.color);
        $('#hud-team').textContent = t.name;
        $('#hud-pts').textContent = String(S.turnPts);
        $('#word').textContent = 'Pronti?';
        $('#word-note').hidden = true;
        $('#card').classList.remove('is-covered', 'is-go');
        setState('Si parte tra poco', 'clock');
        QZ.$$('#card .qz-stamp').forEach(function (x) { x.remove(); });
        setButtons('play');
        $('#buzz-btn').disabled = true;
        paintSkip();
        $('#skip-btn').disabled = true;
        timer.reset(S.time);
        if (left != null && left < S.time) timer.add(left - S.time);
        timer.warnAt = 0.34;
        timer.dangerAt = 10 / S.time;
        timer.render();
        QZ.show('s-game');
    }

    /** Turno ripreso dopo un ricaricamento: si torna in campo in time-out, si riparte a mano. */
    function resumeTurn(mid) {
        S.log = mid.log.map(function (l) { return { word: l.word, res: l.res, last: !!l.last }; });
        S.turnPts = mid.turnPts;
        if (mid.sum) { S.phase = 'sum'; showSummary(); return; }
        S.skipsLeft = Math.min(mid.skipsLeft, S.skips);
        S.cur = mid.cur || null;
        setupGame(mid.left);
        S.phase = 'play';
        $('#buzz-btn').disabled = false;
        paintSkip();
        if (S.cur) paintWord(); else deal(false);
        pause();
    }

    function beginTurn() {
        if (S.phase !== 'hand') return;
        S.phase = 'count';
        S.log = [];
        S.turnPts = 0;
        S.skipsLeft = S.skips;
        S.cur = null;
        setupGame();
        QZ.countdown(3, 'Via!').then(function () {
            if (S.phase !== 'count') return;
            S.phase = 'play';
            $('#buzz-btn').disabled = false;
            paintSkip();
            deal(false);
            timer.start();
            $('#buzz-btn').focus({ preventScroll: true });
        });
    }

    function setState(text, icon) {
        $('#state').innerHTML = QZ.icon(icon) + QZ.esc(text);
    }

    function setButtons(mode) {
        $('#act-play').hidden = mode !== 'play';
        $('#act-judge').hidden = mode !== 'buzz';
        $('#ok-btn').disabled = $('#ko-btn').disabled = false;
        $('#card').classList.toggle('is-buzz', mode === 'buzz');
        $('#answer-bar').hidden = $('#answer-sec').hidden = !(mode === 'buzz' && S.answer);
    }

    /**
     * I passi come spie a LED: accese quelle che restano, spente quelle usate.
     * fresh: indice della spia che si e' appena spenta (sfarfalla prima di spegnersi).
     */
    function pipsHTML(total, left, fresh) {
        var h = '';
        for (var i = 0; i < total; i++) h += '<i class="' + (i < left ? 'is-on' : '') + (i === fresh ? ' is-off-now' : '') + '"></i>';
        return '<span class="iv-pips" aria-hidden="true">' + h + '</span>';
    }

    function paintSkip(fresh) {
        var b = $('#skip-btn'), n = S.skipsLeft, total = S.skips;
        if (!total) {
            b.innerHTML = QZ.icon('skip') + 'Passo<small>niente passi</small>';
        } else {
            b.innerHTML = 'Passo' + pipsHTML(total, n, fresh) + '<small>' + (n ? n + (n === 1 ? ' rimasto' : ' rimasti') : 'finiti') + '</small>';
        }
        b.setAttribute('aria-label', 'Passo, ' + (!total ? 'niente passi in questa partita' : n > 0 ? plural(n, 'rimasto', 'rimasti') : 'finiti'));
        b.disabled = n <= 0;
    }

    /** La nota sotto la parola: per i nomi di persona basta il cognome, tranne con un omonimo. */
    function wordNote(word) {
        var others = HOMONYMS[word];
        if (others) return { warn: true, text: 'Serve il nome: c\'è anche ' + andList(others) };
        if (PEOPLE.has(word) && /\s/.test(word)) return { warn: false, text: 'Basta il cognome' };
        return null;
    }

    /** Mette a schermo la parola S.cur (senza pescarne una nuova). */
    function paintWord() {
        var card = $('#card');
        card.classList.remove('is-go');
        QZ.$$('.qz-stamp', card).forEach(function (x) { x.remove(); });
        var w = $('#word');
        w.textContent = S.cur;
        // le parole lunghe ("Tutto il calcio minuto per minuto") non devono uscire dal maxischermo
        var longest = S.cur.split(/[\s-]+/).reduce(function (m, x) { return Math.max(m, x.length); }, 0);
        w.classList.toggle('is-long', longest > 9 || S.cur.length > 16);
        w.classList.toggle('is-xlong', longest > 12 || S.cur.length > 26);
        var note = wordNote(S.cur), n = $('#word-note');
        n.hidden = !note;
        if (note) { n.textContent = note.text; n.classList.toggle('is-warn', note.warn); }
        setState(S.skips ? 'Una parola a testa' : 'Una parola a testa · niente passi', 'message');
        QZ.fx.replay(card);
        QZ.fx.replay(w);
        S.dealtAt = performance.now();
        // come in Taboo: la parola si legge a chi tiene il telefono (i suggeritori), chi indovina e' di spalle
        QZ.say('Parola: ' + S.cur + '.' + (note && note.warn ? ' ' + note.text + '.' : ''));
    }

    // resume: riparte il cronometro appena la nuova parola e' a schermo
    function deal(anim, resume) {
        var card = $('#card');
        var show = function () {
            S.cur = deck.draw(deckFilter(S.deck));
            paintWord();
            if (S.phase === 'anim') S.phase = 'play';
            if (resume && S.phase === 'play') timer.start();
            saveMatch();
        };
        if (anim && !QZ.reducedMotion()) {
            S.phase = 'anim';
            card.classList.remove('is-in');
            card.classList.add('is-go');
            setTimeout(function () { if (S.phase === 'anim') show(); }, 170);
        } else show();
    }

    function buzz() {
        if (S.phase !== 'play' || !S.cur) return;
        S.phase = 'buzz';
        S.buzzAt = performance.now();
        timer.pause();
        QZ.sound.buzzer();
        QZ.vibrate(80);
        setButtons('buzz');
        setState('La risposta?', 'zap');
        // la scritta si accende sotto la parola: i suggeritori la devono ancora leggere per giudicare
        var st = QZ.fx.stamp($('#card'), 'Prenotato', 'ink', { size: 40, say: 'Prenotato: la risposta?' + (S.answer ? ' ' + S.answer + ' secondi.' : '') });
        if (st) st.classList.add('is-low');
        if (S.answer) { answerTimer.reset(S.answer); answerTimer.start(); }
        $('#ok-btn').focus({ preventScroll: true });
    }

    function skip() {
        if (S.phase !== 'play' || !S.cur) return;
        if (performance.now() - (S.dealtAt || 0) < SKIP_GUARD) return;
        if (S.skipsLeft <= 0) {
            QZ.fx.shake($('#skip-btn'));
            QZ.say(S.skips ? 'Passi finiti: questa va indovinata.' : 'In questa partita niente passi.');
            return;
        }
        S.skipsLeft--;
        S.log.push({ word: S.cur, res: 'skip' });
        S.cur = null;
        paintSkip(S.skipsLeft);
        QZ.sound.whoosh();
        QZ.say('Passo. ' + (S.skipsLeft ? plural(S.skipsLeft, 'passo rimasto', 'passi rimasti') : 'Passi finiti') + '.');
        deal(true);
        refocus($('#buzz-btn'));
    }

    // reason: la scritta quando la risposta non arriva in tempo
    function judge(ok, reason) {
        if (S.phase !== 'buzz') return;
        answerTimer.pause();
        S.phase = 'verdict';
        var t = team(), pts = $('#hud-pts'), card = $('#card');
        S.log.push({ word: S.cur, res: ok ? 'ok' : 'bad' });
        S.cur = null;
        // i tasti restano al loro posto (niente salti di layout) ma non si possono ripremere
        $('#ok-btn').disabled = $('#ko-btn').disabled = true;
        if (ok) {
            S.turnPts++;
            t.score++;
            pts.textContent = S.turnPts;
            var streak = 0;
            for (var i = S.log.length - 1; i >= 0 && S.log[i].res === 'ok'; i--) streak++;
            var word = streak >= 5 ? 'Che intesa' : streak >= 3 ? 'Tris!' : QZ.pick(['Gol!', 'Esatto', 'Dentro']);
            QZ.fx.stamp(card, word, 'ok', { size: 46, say: 'Giusta! ' + plural(S.turnPts, 'punto', 'punti') + ' in questo turno.' });
            QZ.sound.correct();
            QZ.vibrate(40);
            QZ.fx.floatText(pts, '+1');
            QZ.fx.pop(pts);
        } else {
            // la sbagliata costa: meno un punto, e la parola se ne va
            S.turnPts--;
            t.score--;
            pts.textContent = S.turnPts;
            QZ.fx.stamp(card, reason || QZ.pick(['Palo', 'Fuori', 'Traversa']), 'bad', { size: 46, say: (reason ? 'Tempo scaduto per rispondere' : 'Sbagliata') + ', meno uno.' });
            QZ.sound.wrong();
            QZ.vibrate([60, 40, 60]);
            QZ.fx.shake(card);
            QZ.fx.floatText(pts, '−1', true);
            QZ.fx.pop(pts);
        }
        saveMatch();
        // la scritta resta accesa un attimo, poi parola nuova e cronometro che riparte
        setTimeout(function () {
            if (S.phase !== 'verdict') return;
            S.phase = 'play';
            setButtons('play');
            deal(true, true);
            refocus($('#buzz-btn'));
        }, QZ.reducedMotion() ? 250 : 520);
    }

    function pause() {
        if (S.phase !== 'play' && S.phase !== 'buzz') return;
        var from = S.phase;
        S.phase = 'pause';
        timer.pause();
        answerTimer.pause();
        $('#card').classList.add('is-covered');
        saveMatch();
        var resume = function () {
            $('#card').classList.remove('is-covered');
            S.phase = from;
            if (from === 'buzz') { S.buzzAt = performance.now(); if (S.answer) answerTimer.start(); } else timer.start();
        };
        QZ.modal({
            title: 'Time-out',
            text: 'Cronometro fermo e maxischermo spento. Si riparte quando siete pronti' + (from === 'buzz' ? ', dalla risposta prenotata.' : '.'),
            actions: [{ label: 'Riprendi', primary: true, icon: 'play', value: 'go' }, { label: 'Chiudi qui', ghost: true, icon: 'whistle', value: 'end' }]
        }).then(function (v) {
            if (v === 'end') {
                QZ.confirm('Si va dritti alla classifica. Le parole di questo turno valgono.', { title: 'Fischio finale?', okLabel: 'Classifica', cancelLabel: 'Riprendi' }).then(function (ok) {
                    if (ok) { $('#card').classList.remove('is-covered'); finish(); } else resume();
                });
            } else resume();
        });
    }

    function timeUp() {
        S.phase = 'sum';
        QZ.sound.whistle();
        QZ.vibrate([120, 60, 120]);
        if (S.cur) S.log.push({ word: S.cur, res: 'skip', last: true });
        S.cur = null;
        saveMatch();
        QZ.fx.stamp($('#card'), 'Tempo!', 'ink', { size: 48, say: 'Tempo! Fine del turno di ' + team().name + '.' });
        setTimeout(showSummary, 900);
    }

    /* ---------- Il resoconto del turno ---------- */
    var RES = {
        ok: { label: 'giusta', glyph: QZ.icon('check'), tone: 520 },
        bad: { label: 'sbagliata', glyph: QZ.icon('x'), tone: 260 },
        skip: { label: 'passata', glyph: 'PASSO', tone: 400 }
    };

    function isLastTurn() { return S.turn === S.order.length - 1 && S.round === S.rounds; }

    function showSummary() {
        var t = team();
        $('#s-sum').style.setProperty('--c', t.color);
        $('#sum-eyebrow').textContent = S.tiebreak ? 'Spareggio' : 'Fine del turno';
        $('#sum-title').textContent = t.name;
        paintSumHead();
        $('#sum-list').innerHTML = S.log.length ? S.log.map(function (l, i) {
            return '<button type="button" class="report__row" data-idx="' + i + '" data-res="' + l.res + '">' +
                '<span class="report__n" aria-hidden="true">' + (i + 1) + '</span>' +
                '<span class="report__word"><span>' + QZ.esc(l.word) + '</span>' + (l.last ? '<small>sul fischio finale</small>' : '') + '</span>' +
                '<span class="report__res" aria-hidden="true"></span></button>';
        }).join('') : '<p class="report__empty">Tabellone vuoto: nessuna parola in questo turno.</p>';
        S.log.forEach(function (l, i) { labelRow(i); });
        $('#sum-next').innerHTML = isLastTurn() ? QZ.icon('trophy') + 'Classifica finale' : 'Tocca a ' + QZ.esc(S.teams[S.order[(S.turn + 1) % S.order.length]].name) + QZ.icon('arrow');
        QZ.show('s-sum');
        QZ.say(t.name + ': ' + plural(S.turnPts, 'punto', 'punti') + ' in questo turno, ' + plural(t.score, 'punto', 'punti') + ' in classifica.');
        // il resoconto si accende riga per riga
        var step = QZ.reducedMotion() ? 0 : 110;
        S.log.forEach(function (l, i) {
            setTimeout(function () { lightRow(i, step > 0); }, 300 + i * step);
        });
    }

    function paintSumHead() {
        $('#sum-pts').textContent = (S.turnPts > 0 ? '+' : '') + S.turnPts;
        var n = function (res) { return S.log.filter(function (l) { return l.res === res; }).length; };
        $('#sum-total').textContent = plural(n('ok'), 'parola presa', 'parole prese') + (n('bad') ? ' · ' + plural(n('bad'), 'sbagliata', 'sbagliate') : '') +
            ' · in classifica ' + plural(team().score, 'punto', 'punti');
    }

    function labelRow(i) {
        var row = $('#sum-list [data-idx="' + i + '"]');
        if (!row) return;
        var l = S.log[i];
        row.dataset.res = l.res;
        row.setAttribute('aria-label', l.word + ': ' + RES[l.res].label + '. Tocca per cambiare');
    }

    /** Accende l'esito della riga sul suo pezzetto di tabellone: spunta verde, croce rossa, PASSO ambra. */
    function lightRow(i, sound) {
        var row = $('#sum-list [data-idx="' + i + '"]');
        if (!row || !S.log[i]) return;
        var res = S.log[i].res, r = RES[res];
        var box = row.querySelector('.report__res');
        box.dataset.res = res;
        box.innerHTML = r.glyph;
        QZ.fx.replay(box, 'is-on');
        if (sound) QZ.sound.tone(r.tone, 0.06, 'square', 0.04);
    }

    function cycle(i) {
        if (S.phase !== 'sum' || !S.log[i]) return;
        var l = S.log[i];
        var order = ['ok', 'bad', 'skip'];
        var next = order[(order.indexOf(l.res) + 1) % 3];
        var d = points(next) - points(l.res);
        l.res = next;
        S.turnPts += d;
        team().score += d;
        QZ.sound.click();
        labelRow(i);
        lightRow(i, false);
        paintSumHead();
        QZ.say(l.word + ': ' + RES[l.res].label + '. ' + plural(S.turnPts, 'punto', 'punti') + ' nel turno.');
        QZ.fx.pop($('#sum-pts'));
        saveMatch();
    }

    function tally(t) {
        // la parola rimasta a schermo sul fischio conta a parte, ma solo se nel resoconto e' rimasta "passata"
        S.log.forEach(function (l) { t[l.res]++; if (l.last && l.res === 'skip') t.lastSkip = (t.lastSkip || 0) + 1; });
        var ok = S.log.filter(function (l) { return l.res === 'ok'; }).length;
        if (ok > t.best) t.best = ok;
        S.log = [];
    }

    function nextTurn() {
        if (S.phase !== 'sum') return;
        tally(team());
        S.turn++;
        if (S.turn >= S.order.length) { S.turn = 0; S.round++; }
        if (S.round > S.rounds) { finish(); return; }
        showHand();
    }

    /* ---------- Fine partita ---------- */
    function tiebreak(tied) {
        S.order = tied;
        S.turn = 0;
        S.round = 1;
        S.rounds = 1;
        S.tiebreak++;
        QZ.wake.on();
        QZ.sound.whistle();
        showHand();
    }

    function finish() {
        if (S.phase === 'done') return;
        if (S.phase === 'pause') tally(team()); // turno interrotto: conta quanto segnato
        S.phase = 'done';
        timer.pause();
        answerTimer.pause();
        QZ.wake.off();
        clearMatch();
        var ranked = S.teams.slice().sort(function (a, b) { return b.score - a.score; });
        var top = ranked[0];
        var tiedIdx = S.teams.map(function (t, i) { return t.score === top.score ? i : -1; }).filter(function (i) { return i >= 0; });
        var tie = tiedIdx.length > 1;
        var sum = function (k) { return S.teams.reduce(function (s, t) { return s + t[k]; }, 0); };
        var tot = sum('ok');
        var best = S.teams.reduce(function (s, t) { return Math.max(s, t.best); }, 0);
        var label = (tie ? 'Pareggio a ' : 'Vince ' + top.name + ' con ') + top.score + ' punti';
        // lo spareggio non e' una partita nuova: XP e partite giocate si contano una volta sola
        var r;
        if (!S.xpDone) {
            // il nome va accanto al record solo quando il record del profilo cambia davvero,
            // cosi' le partite lasciate a meta' non lasciano in giro un primato che il profilo non ha
            var prev = QZ.profile.best('intesavincente');
            r = QZ.profile.record('intesavincente', { xp: Math.min(150, 15 + tot * 3), label: label, score: best });
            if (best > 0 && (prev == null || best > prev)) {
                var holder = S.teams.filter(function (t) { return t.best === best; })[0];
                QZ.store.set(BEST_KEY, { n: best, team: holder.name, at: Date.now() });
            }
            S.xpDone = { xp: r.xp };
        } else {
            r = { xp: 0, newRecord: false };
        }
        paintRecord();
        // pagella della squadra vincente: parole prese su parole viste
        // (i passi pesano la meta', la parola rimasta a schermo sul fischio finale non conta)
        var seen = top.ok + top.bad + (top.skip - (top.lastSkip || 0)) * 0.5;
        var played = S.tiebreak ? S.giri + ' + spareggio' : Math.min(S.round, S.rounds) + '/' + S.rounds;
        var subtitle = tie
            ? (tiedIdx.length === 2 ? 'Due squadre appaiate in vetta.' : tiedIdx.length + ' squadre appaiate in vetta.') + ' Si va allo spareggio?'
            : ranked[1] && top.score - ranked[1].score === 1 ? 'Vinta di corto muso: un punto solo di scarto.'
                : ranked[1] && top.score - ranked[1].score >= 5 ? 'Partita mai in discussione: gli altri a guardare.'
                    : 'Questa sì che è intesa.';
        var shareRank = ranked.map(function (t, i) { return (i + 1) + '. ' + t.name + ' ' + t.score; }).join('\n');
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio' : 'Vince ' + top.name,
            subtitle: subtitle,
            big: top.score, bigSuffix: ' pt',
            ratio: seen ? top.ok / seen : 0,
            record: r,
            stats: [
                { label: 'Parole prese', value: tot },
                { label: 'Sbagliate', value: sum('bad') },
                { label: 'Miglior turno', value: plural(best, 'parola', 'parole') },
                { label: 'Giri', value: played }
            ],
            extraHTML: (tie ? '<div class="iv-tie mt-3"><p>A pari punti decide lo spareggio: un turno a testa per ' +
                andList(tiedIdx.map(function (i) { return QZ.esc(S.teams[i].name); })) + ', i punti si sommano.</p>' +
                '<button type="button" class="btn btn--primary btn--lg btn--block" data-tiebreak>' + QZ.icon('whistle') + 'Spareggio</button></div>' : '') +
                '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                    return { name: t.name, score: t.score, color: t.color, sub: plural(t.ok, 'giusta', 'giuste') + ' · ' + plural(t.bad, 'sbagliata', 'sbagliate') + ' · ' + plural(t.skip, 'passata', 'passate') };
                }), function (s) { return s + ' pt'; }) + '</div>',
            share: 'Intesa Vincente su Quizzotti: ' + (tie ? 'pareggio a ' + plural(top.score, 'punto', 'punti') : 'vince ' + top.name + ' con ' + plural(top.score, 'punto', 'punti')) +
                '.\n' + shareRank + '\nMiglior turno: ' + plural(best, 'parola', 'parole') + '. Quanta intesa avete voi?',
            onRetry: start,
            secondary: { label: 'Cambia impostazioni', icon: 'users', onClick: function () { paintResume(); QZ.show('s-start'); } }
        });
        var tb = $('#end-host [data-tiebreak]');
        if (tb) {
            tb.addEventListener('click', function once() {
                tb.removeEventListener('click', once);
                if (S.phase === 'done') tiebreak(tiedIdx);
            });
        }
    }
})();
