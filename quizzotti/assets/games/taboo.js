/* ==========================================================================
   QUIZZOTTI v2 — Taboo
   Dati: assets/db-taboo.js (`tabooWords`: {word, categoria, taboo[]}).
   Da 2 a 6 squadre, tempo e numero di giri a scelta, penalita' per la parola
   vietata e passi configurabili (di base 3 passi e -1 per la vietata),
   argomenti e livello delle carte selezionabili, carte che non si ripetono tra
   le partite, telefono in mano all'arbitro avversario (o a chi spiega),
   schermata "passa il telefono", time-out da solo se il telefono si blocca,
   resoconto del turno correggibile, spareggio a pari punti, classifica
   finale. La partita si salva a ogni cambio di squadra: se la pagina si
   ricarica si riprende dal turno in corso.
   Stile "Riflettori": la carta va sul maxischermo con le vietate a LED rossi;
   ogni verdetto e' una scritta che si accende ("GOL!", "VIETATA"), il
   resoconto del turno si accende riga per riga.
   La logica pura (argomenti, punti, classifica, salvataggio) sta in `core` ed
   e' esportata per i test con Node.
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- Argomenti: le categorie del DB raggruppate in 7 macro-temi ---------- */
    var GROUPS = [
        { id: 'giocatori', label: 'Calciatori e leggende' },
        { id: 'allenatori', label: 'Allenatori e dirigenti' },
        { id: 'squadre', label: 'Squadre e nazionali' },
        { id: 'coppe', label: 'Coppe e tornei' },
        { id: 'stadi', label: 'Stadi e tifo' },
        { id: 'regole', label: 'Regole e tattica' },
        { id: 'cultura', label: 'Storie e curiosità' }
    ];
    // il primo che corrisponde vince: l'ordine conta
    var RULES = [
        ['regole', /arbitr|regol|tattic|ruoli|moduli|gesti|statistic|preparazion|medicina|settore|categorie giovanili|termini/i],
        ['allenatori', /allenat|president|dirigent|commissari/i],
        ['giocatori', /calciat|giocator|leggend|stell|portier|bandier|eroi|talent|generazion|campioni|italiani all/i],
        ['stadi', /stadi|arene|impianti/i],
        ['squadre', /squadr|club|derby|formazioni/i],
        ['coppe', /coppe|trofe|competizion|mondiali|europei|tornei|format storico/i],
        ['squadre', /nazional/i]
    ];
    var groupCache = {};
    function groupOf(cat) {
        if (!groupCache[cat]) {
            var g = 'cultura';
            for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(cat)) { g = RULES[i][0]; break; }
            groupCache[cat] = g;
        }
        return groupCache[cat];
    }

    /* ---------- Impostazioni: valori ammessi (un valore vecchio o rotto torna al default) ---------- */
    var CHOICES = {
        time: [45, 60, 90, 120],
        rounds: [1, 2, 3, 5],
        pen: [1, 0],
        skips: [3, 1, 0, -1],
        level: [1, 2, 3],          // 1 solo carte facili, 2 facili e normali, 3 tutto il mazzo
        hold: ['arbitro', 'spiega'] // chi tiene il telefono: un avversario che arbitra, o chi spiega
    };
    var DEFAULTS = { v: 2, time: 60, rounds: 3, pen: 1, skips: 3, level: 2, hold: 'arbitro', groups: null };
    /**
     * Le impostazioni salvate prima della v2 si salvavano tutte insieme a ogni ritocco:
     * "passi: quanti vuoi" era il vecchio default e non si distingue da una scelta.
     * Si tiene quindi solo cio' che era diverso dal vecchio default (3, 1 o zero passi;
     * penalita' zero): e' stato scelto di sicuro.
     */
    function sanitizeOpts(raw) {
        var o = Object.assign({}, DEFAULTS);
        if (raw && typeof raw === 'object') {
            var old = raw.v !== 2;
            Object.keys(CHOICES).forEach(function (k) {
                if (CHOICES[k].indexOf(raw[k]) < 0) return;
                if (old && k === 'skips' && raw[k] === -1) return;
                o[k] = raw[k];
            });
            if (Array.isArray(raw.groups)) o.groups = raw.groups.filter(function (g) { return GROUPS.some(function (x) { return x.id === g; }); });
        }
        return o;
    }

    function points(res, pen) { return res === 'ok' ? 1 : res === 'bad' && pen ? -pen : 0; }

    /** Livello della carta (1-3): le carte senza "diff" contano come normali. */
    function diffOf(w) { return w && (w.diff === 1 || w.diff === 2 || w.diff === 3) ? w.diff : 2; }
    function fitsLevel(w, level) { return diffOf(w) <= (level || 3); }

    /**
     * Somma il turno nelle statistiche della squadra. La carta rimasta in mano sul
     * fischio finale non e' un passo: se nel resoconto resta "passata" non conta.
     */
    function tallyLog(t, log) {
        var ok = 0;
        log.forEach(function (l) {
            if (l.last && l.res === 'skip') return;
            t[l.res]++;
            if (l.res === 'ok') ok++;
        });
        if (ok > t.best) t.best = ok;
        return t;
    }

    /** Lo spareggio: un turno breve a testa per le squadre in parita' in vetta. */
    var TIEBREAK_TIME = 30;
    function tiedTop(teams) {
        var top = Math.max.apply(null, teams.map(function (t) { return t.score; }));
        return teams.map(function (t, i) { return t.score === top ? i : -1; }).filter(function (i) { return i >= 0; });
    }

    /** Classifica: punti, poi carte indovinate, poi meno vietate. */
    function rank(teams) {
        return teams.slice().sort(function (a, b) { return b.score - a.score || b.ok - a.ok || a.bad - b.bad; });
    }
    function isTie(ranked) { return !!(ranked[1] && ranked[1].score === ranked[0].score); }

    /** Taglia del carattere della parola sulla carta: dipende dal pezzo piu' lungo e dalla lunghezza totale. */
    function wordFit(word) {
        var longest = word.split(/\s+/).reduce(function (m, t) { return Math.max(m, t.length); }, 0);
        if (longest > 15 || word.length > 34) return 'xlong';
        if (longest > 11 || word.length > 22) return 'long';
        return '';
    }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    /** Testo da condividere: chi ha vinto e la classifica intera, una riga per squadra. */
    function shareText(ranked) {
        var top = ranked[0];
        var head = isTie(ranked)
            ? 'Taboo su Quizzotti: pareggio in vetta a ' + plural(top.score, 'punto', 'punti') + '.'
            : 'Taboo su Quizzotti: vince ' + top.name + ' con ' + plural(top.score, 'punto', 'punti') + '.';
        var rows = ranked.map(function (t, i) { return (i + 1) + '. ' + t.name + ' ' + t.score; });
        return head + '\n' + rows.join('\n') + '\nRiuscite a spiegare il calcio senza dire le parole vietate?';
    }

    /* ---------- Salvataggio della partita in corso (ripresa dopo un ricaricamento) ---------- */
    var SAVE_MAX_AGE = 12 * 3600 * 1000;
    // order (chi gioca e in che ordine: allo spareggio solo le squadre in parita'), tiebreak,
    // giri, level, hold e xpDone sono arrivati dopo: un salvataggio che non li ha resta valido
    function snapshot(S, now) {
        return {
            v: 1, at: now, round: S.round, turn: S.turn, rounds: S.rounds, time: S.time, pen: S.pen, skips: S.skips,
            level: S.level, hold: S.hold, order: (S.order || S.teams.map(function (t, i) { return i; })).slice(), tiebreak: S.tiebreak || 0, giri: S.giri || S.rounds, xpDone: !!S.xpDone,
            groups: S.groups.slice(),
            teams: S.teams.map(function (t) { return { name: t.name, color: t.color, score: t.score, ok: t.ok, bad: t.bad, skip: t.skip, best: t.best }; })
        };
    }
    function validOrder(order, n) {
        if (!Array.isArray(order) || !order.length || order.length > n) return false;
        return order.every(function (i, k) { return i === (i | 0) && i >= 0 && i < n && order.indexOf(i) === k; });
    }
    function validSave(s, now) {
        if (!s || s.v !== 1 || typeof s.at !== 'number' || now - s.at > SAVE_MAX_AGE || now < s.at - 60000) return false;
        if (!Array.isArray(s.teams) || s.teams.length < 2 || s.teams.length > 6) return false;
        if (CHOICES.rounds.indexOf(s.rounds) < 0 || CHOICES.time.indexOf(s.time) < 0 || CHOICES.pen.indexOf(s.pen) < 0 || CHOICES.skips.indexOf(s.skips) < 0) return false;
        if (s.level != null && CHOICES.level.indexOf(s.level) < 0) return false;
        if (s.hold != null && CHOICES.hold.indexOf(s.hold) < 0) return false;
        if (s.order != null && !validOrder(s.order, s.teams.length)) return false;
        if (s.tiebreak != null && !(s.tiebreak === (s.tiebreak | 0) && s.tiebreak >= 0)) return false;
        var players = s.order ? s.order.length : s.teams.length;
        if (!(s.round >= 1 && s.round <= s.rounds && s.turn >= 0 && s.turn < players)) return false;
        if (!Array.isArray(s.groups) || !s.groups.length) return false;
        return s.teams.every(function (t) {
            // il colore finisce in uno style: solo esadecimali, niente testo libero
            return t && typeof t.name === 'string' && t.name && typeof t.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(t.color) && ['score', 'ok', 'bad', 'skip', 'best'].every(function (k) { return typeof t[k] === 'number' && isFinite(t[k]); });
        });
    }

    var core = {
        GROUPS: GROUPS, groupOf: groupOf, wordFit: wordFit, CHOICES: CHOICES, DEFAULTS: DEFAULTS, sanitizeOpts: sanitizeOpts, points: points,
        diffOf: diffOf, fitsLevel: fitsLevel, tallyLog: tallyLog, tiedTop: tiedTop, TIEBREAK_TIME: TIEBREAK_TIME,
        rank: rank, isTie: isTie, shareText: shareText, snapshot: snapshot, validSave: validSave
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Da qui in giu': la pagina
       ====================================================================== */
    var $ = QZ.$;

    // COUNT: carte per argomento (tutto il mazzo); LEVEL_COUNT[l]: quelle che entrano al livello l
    var COUNT = {}, LEVEL_COUNT = { 1: {}, 2: {}, 3: {} };
    tabooWords.forEach(function (w) {
        var g = groupOf(w.categoria);
        COUNT[g] = (COUNT[g] || 0) + 1;
        CHOICES.level.forEach(function (l) { if (fitsLevel(w, l)) LEVEL_COUNT[l][g] = (LEVEL_COUNT[l][g] || 0) + 1; });
    });
    var deck = new QZ.Deck('taboo', tabooWords, function (w) { return w.word; });

    var OPT_KEY = 'qz.taboo.opts';
    var SAVE_KEY = 'qz.taboo.saved';
    var opts = sanitizeOpts(QZ.store.get(OPT_KEY, {}));
    function saveOpts() { QZ.store.set(OPT_KEY, opts); }
    var groups = (opts.groups || []).filter(function (g) { return COUNT[g]; });
    if (!groups.length) groups = GROUPS.map(function (g) { return g.id; });

    function rulesHTML(list) {
        return list.map(function (r, i) {
            return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
        }).join('');
    }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('ban');
    $('#lead-count').textContent = QZ.fmt(Math.floor(tabooWords.length / 100) * 100);
    $('#rules').innerHTML = rulesHTML([
        ['Uno spiega,', 'i compagni indovinano prima che scada il tempo.'],
        ['Vietato dire', 'la parola, i suoi pezzi, quelle accese in rosso e i loro parenti stretti. Niente gesti, niente «fa rima con».'],
        ['Un avversario fa l\'arbitro:', 'guarda la carta insieme a chi spiega e fischia le vietate. Meglio se il telefono lo tiene lui.'],
        ['Carta indovinata, un punto.', 'Alla fine dei giri vince chi ne ha di più.']
    ]);
    function paintRecord() {
        var rec = QZ.profile.best('taboo');
        var played = QZ.profile.get().gamesPlayed.taboo || 0;
        var bits = [];
        if (rec != null) bits.push('record: ' + plural(rec, 'carta', 'carte') + ' in un turno');
        if (played) bits.push(plural(played, 'partita giocata', 'partite giocate'));
        $('#start-record').textContent = bits.join(' · ');
    }
    paintRecord();

    var teamsList = QZ.playerList($('#teams-host'), { key: 'taboo', min: 2, max: 6, initial: 2, label: 'Squadra', title: 'Squadre (2-6)' });

    QZ.segmented($('#opt-time'), CHOICES.time.map(function (n) { return { label: n + ' s', value: n }; }), opts.time, function (v) { opts.time = v; saveOpts(); });
    QZ.segmented($('#opt-rounds'), CHOICES.rounds.map(function (n) { return { label: String(n), value: n }; }), opts.rounds, function (v) { opts.rounds = v; saveOpts(); });
    QZ.segmented($('#opt-hold'), [{ label: 'Un avversario', value: 'arbitro' }, { label: 'Chi spiega', value: 'spiega' }], opts.hold, function (v) { opts.hold = v; saveOpts(); paintHoldHint(); });
    function paintHoldHint() {
        $('#hold-hint').textContent = opts.hold === 'arbitro'
            ? 'L\'arbitro avversario tiene il telefono tra sé e chi spiega: guardano la carta in due e tocca lui i tasti.'
            : 'Chi spiega tiene il telefono e segna da solo: l\'avversario guarda da sopra la spalla e grida le vietate.';
    }
    paintHoldHint();
    QZ.segmented($('#opt-pen'), [{ label: 'Costa un punto', value: 1 }, { label: 'Solo carta buttata', value: 0 }], opts.pen, function (v) { opts.pen = v; saveOpts(); });
    QZ.segmented($('#opt-skip'), [{ label: '3', value: 3 }, { label: '1', value: 1 }, { label: 'Zero', value: 0 }, { label: 'Quanti vuoi', value: -1 }], opts.skips, function (v) { opts.skips = v; saveOpts(); });
    QZ.segmented($('#opt-level'), [{ label: 'Facile', value: 1 }, { label: 'Normale', value: 2 }, { label: 'Difficile', value: 3 }], opts.level, function (v) { opts.level = v; saveOpts(); paintGroups(); });

    $('#groups-all').innerHTML = QZ.icon('check') + 'Tutti';
    $('#groups').innerHTML = GROUPS.map(function (g) {
        return '<button type="button" class="tb-group" data-g="' + g.id + '" aria-pressed="false"><span class="tb-group__lamp" aria-hidden="true"></span>' + QZ.esc(g.label) + ' <small></small></button>';
    }).join('');
    var LEVEL_HINT = { 1: 'solo le carte che conoscono tutti', 2: 'carte facili e da tifoso', 3: 'tutto il mazzo, anche le chicche da intenditori' };
    // aggiorna le caselle senza ridisegnarle: la spia si accende solo dove si tocca
    function paintGroups(drawn) {
        var counts = LEVEL_COUNT[opts.level] || COUNT;
        QZ.$$('#groups .tb-group').forEach(function (b) {
            var on = groups.indexOf(b.dataset.g) >= 0;
            b.setAttribute('aria-pressed', String(on));
            b.classList.toggle('is-drawn', on && (drawn === 'all' || drawn === b));
            b.querySelector('small').textContent = QZ.fmt(counts[b.dataset.g] || 0);
        });
        var n = groups.reduce(function (s, g) { return s + (counts[g] || 0); }, 0);
        $('#groups-hint').textContent = QZ.fmt(n) + ' carte nel mazzo: ' + LEVEL_HINT[opts.level] + '.';
        $('#groups-all').disabled = groups.length === GROUPS.length;
    }
    paintGroups();
    $('#groups').addEventListener('click', function (e) {
        var b = e.target.closest('.tb-group');
        if (!b) return;
        var at = groups.indexOf(b.dataset.g);
        if (at >= 0) {
            if (groups.length === 1) { QZ.toast('Almeno un argomento, sennò non si gioca', { icon: 'info' }); QZ.fx.shake(b); return; }
            groups.splice(at, 1);
        } else groups.push(b.dataset.g);
        QZ.sound.click();
        opts.groups = groups.slice(); saveOpts();
        paintGroups(b);
    });
    $('#groups-all').addEventListener('click', function () {
        groups = GROUPS.map(function (g) { return g.id; });
        opts.groups = groups.slice(); saveOpts();
        QZ.sound.click();
        paintGroups('all');
    });

    $('#go-btn').innerHTML = 'Via col tempo' + QZ.icon('arrow');
    $('#pause-btn').innerHTML = QZ.icon('pause');
    $('#forbid-head').innerHTML = QZ.icon('ban') + 'Vietate';
    // chi tiene il telefono cambia il cambio di squadra e la disposizione dei tasti in campo
    var HOLD = {
        arbitro: {
            sub: 'Il telefono lo tiene un avversario: fa l\'arbitro.',
            rules: [
                ['L\'arbitro avversario', 'tiene il telefono tra sé e chi spiega, girato in modo che i compagni non lo vedano.'],
                ['Chi spiega', 'legge la carta insieme a lui e dice «passo» a voce: i tasti li tocca l\'arbitro.']
            ],
            note: 'Telefono all\'arbitro: tocca lui i tasti'
        },
        spiega: {
            sub: 'Passa il telefono a chi spiega.',
            rules: [
                ['Chi spiega', 'prende il telefono e lo tiene lontano dagli occhi dei compagni.'],
                ['Un avversario', 'guarda da sopra la spalla e grida «vietata»: chi spiega deve toccarla subito.']
            ],
            note: 'Chi spiega segna da solo: occhio dell\'avversario sulla spalla'
        }
    };

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));
    var timer = new QZ.Timer({
        seconds: 60, ring: ring,
        onSecond: function (s) {
            if (S.phase !== 'play' && S.phase !== 'anim') return;
            if (s <= 10 && s > 0) QZ.sound.tick();
            // un solo avviso a voce, non un secondo alla volta
            if (s === 10) QZ.say('Dieci secondi');
        },
        onExpire: function () { if (S.phase === 'play' || S.phase === 'anim') timeUp(); }
    });

    /* ---------- Stato ---------- */
    var S = { phase: 'idle' };
    // ogni resoconto ha il suo numero: le righe che si accendono in ritardo non toccano quello dopo
    var sumSeq = 0;

    $('#start-btn').addEventListener('click', start);
    $('#resume-btn').addEventListener('click', resume);
    $('#go-btn').addEventListener('click', beginTurn);
    $('#ok-btn').addEventListener('click', function () { mark('ok'); });
    $('#bad-btn').addEventListener('click', function () { mark('bad'); });
    $('#skip-btn').addEventListener('click', function () { mark('skip'); });
    $('#pause-btn').addEventListener('click', pause);
    $('#sum-next').addEventListener('click', nextTurn);
    $('#sum-list').addEventListener('click', function (e) {
        var b = e.target.closest('[data-idx]');
        if (b) cycle(Number(b.dataset.idx));
    });

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t.closest && t.closest('input, textarea, select')) return;
        var k = e.key;
        if (S.phase === 'play' || S.phase === 'anim') {
            if (k === 'ArrowRight' || k === 'g' || k === 'G') { e.preventDefault(); mark('ok'); }
            else if (k === 'ArrowLeft' || k === 'v' || k === 'V') { e.preventDefault(); mark('bad'); }
            else if (k === 'ArrowDown' || k === 'p' || k === 'P') { e.preventDefault(); mark('skip'); }
            else if (k === 'Escape') { e.preventDefault(); pause(); }
        } else if (S.phase === 'hand' && k === ' ' && !(t.closest && t.closest('button, a'))) {
            e.preventDefault(); beginTurn();
        }
    });

    // telefono bloccato, chiamata, cambio app: time-out da solo, e al ritorno si riparte a mano
    // (come in Intesa Vincente). Durante il 3-2-1 il time-out scatta appena parte il cronometro.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) return;
        if (S.phase === 'play' || S.phase === 'anim') pause();
        else if (S.phase === 'count') S.pauseOnStart = true;
    });

    /* ---------- Partita salvata ---------- */
    function saveGame() { QZ.store.set(SAVE_KEY, snapshot(S, Date.now())); }
    function clearGame() { QZ.store.set(SAVE_KEY, null); }
    function savedGame() {
        var s = QZ.store.get(SAVE_KEY, null);
        return validSave(s, Date.now()) ? s : null;
    }
    function paintResume() {
        var s = savedGame();
        var b = $('#resume-btn');
        b.hidden = !s;
        if (!s) return;
        var who = s.teams[s.order ? s.order[s.turn] : s.turn].name;
        b.innerHTML = QZ.icon('play') + '<span>Riprendi la partita<small>' +
            QZ.esc((s.tiebreak ? 'spareggio · ' : s.rounds > 1 ? 'giro ' + s.round + '/' + s.rounds + ' · ' : '') + 'tocca a ' + who) + '</small></span>';
    }
    paintResume();

    /* ---------- Partita ---------- */
    function newState(o) {
        return {
            phase: 'hand', round: o.round || 1, turn: o.turn || 0, rounds: o.rounds, time: o.time, pen: o.pen, skips: o.skips,
            level: CHOICES.level.indexOf(o.level) >= 0 ? o.level : 3,
            hold: CHOICES.hold.indexOf(o.hold) >= 0 ? o.hold : 'spiega',
            order: o.order ? o.order.slice() : o.teams.map(function (t, i) { return i; }),
            tiebreak: o.tiebreak || 0, giri: o.giri || o.rounds, xpDone: !!o.xpDone,
            groups: o.groups.filter(function (g) { return COUNT[g]; }),
            teams: o.teams, log: [], cur: null
        };
    }

    function start() {
        // doppio tocco su "Fischio d'inizio": la partita parte una volta sola
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        var names = teamsList.get();
        S = newState({
            rounds: opts.rounds, time: opts.time, pen: opts.pen, skips: opts.skips, level: opts.level, hold: opts.hold, groups: groups.slice(),
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, ok: 0, bad: 0, skip: 0, best: 0 }; })
        });
        if (!S.groups.length) S.groups = GROUPS.map(function (g) { return g.id; });
        QZ.wake.on();
        QZ.sound.whistle();
        showHand();
    }

    function resume() {
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        var s = savedGame();
        if (!s) { paintResume(); return; }
        S = newState(s);
        if (!S.groups.length) S.groups = GROUPS.map(function (g) { return g.id; });
        QZ.wake.on();
        QZ.sound.whistle();
        showHand();
    }

    function team() { return S.teams[S.order[S.turn]]; }
    function turnTime() { return S.tiebreak ? TIEBREAK_TIME : S.time; }

    function scoresHTML(active) {
        return S.teams.map(function (t, i) {
            var out = S.order.indexOf(i) < 0; // allo spareggio giocano solo le squadre in parita'
            return '<div class="team' + (i === active ? ' is-active' : '') + (out ? ' is-out' : '') + '" style="--c:' + t.color + '"><span class="team__dot"></span>' +
                '<span class="team__name">' + QZ.esc(t.name) + '</span><span class="team__score">' + t.score + '</span></div>';
        }).join('');
    }

    function showHand() {
        S.phase = 'hand';
        saveGame();
        var t = team(), h = HOLD[S.hold];
        $('#s-turn').style.setProperty('--c', t.color);
        $('#hand-round').textContent = S.tiebreak ? 'Spareggio · ' + TIEBREAK_TIME + ' s' : S.rounds > 1 ? 'Giro ' + S.round + '/' + S.rounds : 'Giro unico';
        $('#hand-name').textContent = t.name;
        $('#hand-sub').textContent = h.sub;
        $('#hand-rules').innerHTML = rulesHTML(h.rules);
        $('#hand-scores').innerHTML = scoresHTML(S.order[S.turn]);
        QZ.show('s-turn');
        QZ.say((S.tiebreak ? 'Spareggio, ' + TIEBREAK_TIME + ' secondi. ' : S.rounds > 1 ? 'Giro ' + S.round + ' di ' + S.rounds + '. ' : '') + 'Tocca a ' + t.name + '. ' + h.sub);
        QZ.sound.whoosh();
    }

    function beginTurn() {
        if (S.phase !== 'hand') return;
        S.phase = 'count';
        S.pauseOnStart = false;
        var t = team();
        S.log = [];
        S.turnPts = 0;
        S.skipsLeft = S.skips;
        $('#s-game').style.setProperty('--c', t.color);
        $('#s-game').classList.toggle('is-referee', S.hold === 'arbitro');
        $('#hold-note').innerHTML = QZ.icon('whistle') + QZ.esc(HOLD[S.hold].note);
        $('#hud-team').textContent = t.name;
        $('#hud-pts').textContent = '0';
        $('#word').textContent = 'Pronti?';
        $('#taboo').innerHTML = '';
        $('#word-cat').textContent = '';
        paintButtons();
        timer.reset(turnTime());
        timer.warnAt = 0.34;
        timer.dangerAt = 10 / turnTime();
        timer.render();
        QZ.show('s-game');
        QZ.countdown(3, 'Via!').then(function () {
            if (S.phase !== 'count') return;
            S.phase = 'play';
            deal(null);
            timer.start();
            // il "Via col tempo" e' sparito con il cambio: il fuoco va su "Indovinata"
            $('#ok-btn').focus({ preventScroll: true });
            // telefono bloccato durante il 3-2-1: si parte gia' in time-out
            if (S.pauseOnStart || document.hidden) { S.pauseOnStart = false; pause(); }
        });
    }

    function paintButtons() {
        var lim = S.skipsLeft;
        $('#ok-btn').innerHTML = QZ.icon('check') + 'Indovinata<small>+1</small>';
        $('#bad-btn').innerHTML = QZ.icon('whistle') + 'Vietata<small>' + (S.pen ? '−' + S.pen : 'carta buttata') + '</small>';
        var b = $('#skip-btn');
        b.innerHTML = QZ.icon('skip') + 'Passo<small>' + (lim < 0 ? 'quanti vuoi' : lim === 0 ? 'finiti' : lim + (lim === 1 ? ' rimasto' : ' rimasti')) + '</small>';
        // se il fuoco era su "Passo" appena finito, non va perso
        if (lim === 0 && document.activeElement === b) $('#ok-btn').focus({ preventScroll: true });
        b.disabled = lim === 0;
    }

    function draw() {
        var g = S.groups, level = S.level;
        var inGroups = function (w) { return g.indexOf(groupOf(w.categoria)) >= 0; };
        // con pochi argomenti al livello facile il mazzo potrebbe restare vuoto: allora si pesca da tutto
        return deck.draw(function (w) { return inGroups(w) && fitsLevel(w, level); }) || deck.draw(inGroups) || deck.draw();
    }

    var VERDICT = {
        ok: { cls: 'is-go-ok', kind: 'ok', words: ['Gol!', 'Gol!', 'Esatto', 'Dentro!'] },
        bad: { cls: 'is-go-bad', kind: 'bad', words: ['Vietata', 'Fischio!', 'Fallo!'] },
        skip: { cls: 'is-go-skip', kind: 'ink', words: ['Passo'] }
    };

    var SAID = { ok: 'Indovinata, più uno.', bad: 'Vietata!', skip: 'Passo.' };

    function showCard() {
        var card = $('#card');
        var w = draw();
        S.cur = w;
        card.classList.remove('is-go-ok', 'is-go-bad', 'is-go-skip', 'is-foul');
        QZ.$$('.qz-stamp', card).forEach(function (x) { x.remove(); });
        $('#word').textContent = w.word;
        // le parole lunghe ("Ernst-Happel-Stadion") rimpiccioliscono invece di spezzarsi a meta'
        var fit = wordFit(w.word);
        $('#word').classList.toggle('is-long', fit === 'long');
        $('#word').classList.toggle('is-xlong', fit === 'xlong');
        $('#taboo').innerHTML = w.taboo.map(function (x) { return '<li>' + QZ.esc(x) + '</li>'; }).join('');
        $('#word-cat').textContent = w.categoria;
        QZ.fx.replay(card);
        if (S.phase === 'anim') S.phase = 'play';
        return w;
    }

    // res: verdetto sulla carta precedente (null alla prima carta del turno)
    function deal(res) {
        var card = $('#card');
        // verdetto e carta nuova in un solo annuncio: due annunci a 260 ms si coprirebbero
        var said = res ? SAID[res] + (res === 'bad' && S.pen ? ' Meno ' + S.pen + '.' : '') + ' Turno a ' + S.turnPts + '. ' : '';
        var show = function () {
            var w = showCard();
            QZ.say(said + 'Carta: ' + w.word + '. Vietate: ' + w.taboo.join(', ') + '.');
        };
        if (!res) { show(); return; }
        var v = VERDICT[res];
        S.phase = 'anim';
        // la scritta si accende sul maxischermo, poi la carta esce e arriva la prossima
        QZ.fx.stamp(card, QZ.pick(v.words), v.kind, { size: 44, say: false });
        if (res === 'bad') { card.classList.add('is-foul'); QZ.fx.flash('rgba(255, 75, 58, .22)'); }
        if (QZ.reducedMotion()) { setTimeout(function () { if (S.phase === 'anim') show(); }, 260); return; }
        setTimeout(function () {
            if (S.phase !== 'anim') return;
            card.classList.remove('is-in');
            card.classList.add(v.cls);
            setTimeout(function () { if (S.phase === 'anim') show(); }, 190);
        }, 260);
    }

    function mark(res) {
        if (S.phase !== 'play' || !S.cur) return;
        if (res === 'skip' && S.skipsLeft === 0) { QZ.fx.shake($('#skip-btn')); QZ.sound.buzzer(); return; }
        var t = team();
        S.log.push({ word: S.cur.word, res: res });
        S.cur = null;
        var d = points(res, S.pen);
        S.turnPts += d;
        t.score += d;
        var pts = $('#hud-pts');
        pts.textContent = S.turnPts;
        if (res === 'ok') {
            QZ.sound.correct();
            QZ.vibrate(30);
            QZ.fx.floatText(pts, '+1');
            QZ.fx.pop(pts);
        } else if (res === 'bad') {
            QZ.sound.buzzer();
            QZ.vibrate([60, 40, 60]);
            if (d) { QZ.fx.floatText(pts, '−' + S.pen, true); QZ.fx.pop(pts); }
        } else {
            QZ.sound.whoosh();
            if (S.skipsLeft > 0) S.skipsLeft--;
            paintButtons();
        }
        deal(res);
    }

    function pause() {
        // anche a meta' del cambio carta: alla ripresa la carta nuova arriva comunque
        if (S.phase !== 'play' && S.phase !== 'anim') return;
        S.phase = 'pause';
        timer.pause();
        $('#card').classList.add('is-covered');
        var go = function () {
            $('#card').classList.remove('is-covered');
            S.phase = 'play';
            if (!S.cur) showCard();
            timer.start();
            QZ.say('Si riparte. Carta: ' + S.cur.word + '.');
        };
        QZ.modal({
            title: 'Time-out',
            text: 'Cronometro fermo e maxischermo spento. Si riparte quando siete pronti.',
            actions: [{ label: 'Riprendi', primary: true, icon: 'play', value: 'go' }, { label: 'Chiudi qui', ghost: true, icon: 'whistle', value: 'end' }]
        }).then(function (v) {
            if (v === 'end') {
                QZ.confirm('Si va dritti alla classifica. Le carte di questo turno valgono.', { title: 'Fischio finale?', okLabel: 'Classifica', cancelLabel: 'Riprendi' }).then(function (ok) {
                    if (ok) { $('#card').classList.remove('is-covered'); finish(); } else go();
                });
            } else go();
        });
    }

    function timeUp() {
        S.phase = 'sum';
        QZ.sound.whistle();
        QZ.vibrate([120, 60, 120]);
        // la carta rimasta in mano finisce nel resoconto: se l'hanno detta sul fischio si convalida
        if (S.cur) S.log.push({ word: S.cur.word, res: 'skip', last: true });
        S.cur = null;
        QZ.fx.stamp($('#card'), 'Tempo!', 'ink', { size: 48, say: 'Tempo! Fine del turno.' });
        setTimeout(showSummary, 900);
    }

    /* ---------- Il resoconto del turno ---------- */
    var RES = {
        ok: { label: 'indovinata', glyph: QZ.icon('check'), tone: 520 },
        bad: { label: 'vietata', glyph: QZ.icon('x'), tone: 260 },
        skip: { label: 'passata', glyph: 'PASSO', tone: 400 }
    };

    function showSummary() {
        var seq = ++sumSeq;
        var t = team();
        $('#s-sum').style.setProperty('--c', t.color);
        $('#sum-eyebrow').textContent = 'Fine del turno';
        $('#sum-title').textContent = t.name;
        paintSumHead();
        var list = $('#sum-list');
        list.innerHTML = S.log.length ? S.log.map(function (l, i) {
            return '<button type="button" class="report__row" data-idx="' + i + '" data-res="' + l.res + '">' +
                '<span class="report__n" aria-hidden="true">' + (i + 1) + '</span>' +
                '<span class="report__word"><span>' + QZ.esc(l.word) + '</span>' + (l.last ? '<small>sul fischio finale: se resta passata non conta</small>' : '') + '</span>' +
                '<span class="report__res" aria-hidden="true"></span></button>';
        }).join('') : '<p class="report__empty">Tabellone vuoto: nessuna carta in questo turno.</p>';
        S.log.forEach(function (l, i) { labelRow(i); });
        var last = S.turn === S.order.length - 1 && S.round === S.rounds;
        $('#sum-eyebrow').textContent = S.tiebreak ? 'Spareggio' : 'Fine del turno';
        $('#sum-next').innerHTML = last ? QZ.icon('trophy') + 'Classifica finale' : 'Tocca a ' + QZ.esc(S.teams[S.order[(S.turn + 1) % S.order.length]].name) + QZ.icon('arrow');
        QZ.show('s-sum');
        // il resoconto si accende riga per riga (con tante carte il passo si accorcia)
        var rows = QZ.$$('#sum-list .report__row');
        var step = QZ.reducedMotion() ? 0 : Math.min(110, Math.round(1400 / Math.max(1, rows.length)));
        rows.forEach(function (row, i) {
            setTimeout(function () { if (seq === sumSeq && S.phase === 'sum') lightRow(i, step > 0); }, 300 + i * step);
        });
    }

    function paintSumHead() {
        var t = team();
        $('#sum-pts').textContent = (S.turnPts > 0 ? '+' : '') + S.turnPts;
        var ok = S.log.filter(function (l) { return l.res === 'ok'; }).length;
        $('#sum-total').textContent = plural(ok, 'carta indovinata', 'carte indovinate') + ' · in classifica ' + plural(t.score, 'punto', 'punti');
    }

    function labelRow(i) {
        var row = $('#sum-list [data-idx="' + i + '"]');
        if (!row || !S.log[i]) return;
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
        var d = points(next, S.pen) - points(l.res, S.pen);
        l.res = next;
        S.turnPts += d;
        team().score += d;
        QZ.sound.click();
        labelRow(i);
        lightRow(i, false);
        paintSumHead();
        QZ.say(l.word + ': ' + RES[next].label + '. Turno a ' + S.turnPts + '.');
        QZ.fx.pop($('#sum-pts'));
    }

    function tally(t) {
        tallyLog(t, S.log);
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
    /** Spareggio: un turno breve a testa per le squadre in parita'; i punti si sommano. */
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
        // turno interrotto dal time-out: conta quello che e' stato segnato finora
        if (S.phase === 'pause') tally(team());
        S.phase = 'done';
        timer.pause();
        QZ.wake.off();
        clearGame();
        var ranked = rank(S.teams);
        var top = ranked[0];
        var tie = isTie(ranked);
        var tiedIdx = tiedTop(S.teams);
        var tot = S.teams.reduce(function (s, t) { return s + t.ok; }, 0);
        var bad = S.teams.reduce(function (s, t) { return s + t.bad; }, 0);
        var best = S.teams.reduce(function (s, t) { return Math.max(s, t.best); }, 0);
        // lo spareggio non e' una partita nuova: XP e partite giocate si contano una volta sola
        var r = { xp: 0, newRecord: false };
        if (!S.xpDone) {
            r = QZ.profile.record('taboo', {
                xp: Math.min(150, 15 + tot * 3),
                label: (tie ? 'Pareggio a ' : 'Vince ' + top.name + ' con ') + top.score + ' punti',
                score: best
            });
            S.xpDone = true;
        }
        paintRecord();
        paintResume();
        // pagella della squadra vincente: carte indovinate su carte viste (i passi pesano la meta')
        var seen = top.ok + top.bad + top.skip * 0.5;
        var leaders = tiedIdx.map(function (i) { return QZ.esc(S.teams[i].name); });
        var andList = leaders.length < 2 ? leaders.join('') : leaders.slice(0, -1).join(', ') + ' e ' + leaders[leaders.length - 1];
        var played = S.tiebreak ? S.giri + ' + spareggio' : Math.min(S.round, S.rounds) + '/' + S.rounds;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio' : 'Vince ' + top.name,
            subtitle: tie ? (S.tiebreak ? 'Ancora pari dopo lo spareggio.' : 'Pari punti in vetta.') + ' Si va allo spareggio?' : QZ.pick(['Nessuno l\'ha detto, tutti l\'hanno capito.', 'Spiegato tutto senza dire niente. Applausi.', 'Lingua lunga e parole giuste: coppa meritata.']),
            big: top.score, bigSuffix: ' pt',
            ratio: seen ? top.ok / seen : 0,
            record: r,
            stats: [
                { label: 'Indovinate', value: tot },
                { label: 'Vietate', value: bad },
                { label: 'Miglior turno', value: plural(best, 'carta', 'carte') },
                { label: 'Giri', value: played }
            ],
            extraHTML: (tie ? '<div class="tb-tie mt-3"><p>Spareggio: un turno da ' + TIEBREAK_TIME + ' secondi a testa per ' + andList +
                '. I punti si sommano a quelli della partita.</p><button type="button" class="btn btn--primary btn--lg btn--block" data-tiebreak>' +
                QZ.icon('whistle') + 'Spareggio</button></div>' : '') +
                '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                    return { name: t.name, score: t.score, color: t.color, sub: plural(t.ok, 'indovinata', 'indovinate') + ' · ' + plural(t.bad, 'vietata', 'vietate') + ' · ' + plural(t.skip, 'passata', 'passate') };
                }), function (s) { return s + ' pt'; }) + '</div>',
            share: shareText(ranked),
            onRetry: start,
            secondary: { label: 'Cambia impostazioni', icon: 'users', onClick: function () { QZ.show('s-start'); } }
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
