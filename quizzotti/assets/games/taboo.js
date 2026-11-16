/* ==========================================================================
   QUIZZOTTI v2 — Taboo
   Dati: assets/db-taboo.js (`tabooWords`: {word, categoria, taboo[]}).
   Da 2 a 6 squadre, tempo e numero di giri a scelta, penalita' per la parola
   vietata e passi configurabili, argomenti selezionabili, carte che non si
   ripetono tra le partite, schermata "passa il telefono", resoconto del turno
   correggibile, classifica finale. La partita si salva a ogni cambio di
   squadra: se la pagina si ricarica si riprende dal turno in corso.
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
        skips: [-1, 3, 1, 0]
    };
    var DEFAULTS = { time: 60, rounds: 3, pen: 1, skips: -1, groups: null };
    function sanitizeOpts(raw) {
        var o = Object.assign({}, DEFAULTS);
        if (raw && typeof raw === 'object') {
            Object.keys(CHOICES).forEach(function (k) { if (CHOICES[k].indexOf(raw[k]) >= 0) o[k] = raw[k]; });
            if (Array.isArray(raw.groups)) o.groups = raw.groups.filter(function (g) { return GROUPS.some(function (x) { return x.id === g; }); });
        }
        return o;
    }

    function points(res, pen) { return res === 'ok' ? 1 : res === 'bad' && pen ? -pen : 0; }

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
    function snapshot(S, now) {
        return {
            v: 1, at: now, round: S.round, turn: S.turn, rounds: S.rounds, time: S.time, pen: S.pen, skips: S.skips,
            groups: S.groups.slice(),
            teams: S.teams.map(function (t) { return { name: t.name, color: t.color, score: t.score, ok: t.ok, bad: t.bad, skip: t.skip, best: t.best }; })
        };
    }
    function validSave(s, now) {
        if (!s || s.v !== 1 || typeof s.at !== 'number' || now - s.at > SAVE_MAX_AGE || now < s.at - 60000) return false;
        if (!Array.isArray(s.teams) || s.teams.length < 2 || s.teams.length > 6) return false;
        if (CHOICES.rounds.indexOf(s.rounds) < 0 || CHOICES.time.indexOf(s.time) < 0 || CHOICES.pen.indexOf(s.pen) < 0 || CHOICES.skips.indexOf(s.skips) < 0) return false;
        if (!(s.round >= 1 && s.round <= s.rounds && s.turn >= 0 && s.turn < s.teams.length)) return false;
        if (!Array.isArray(s.groups) || !s.groups.length) return false;
        return s.teams.every(function (t) {
            // il colore finisce in uno style: solo esadecimali, niente testo libero
            return t && typeof t.name === 'string' && t.name && typeof t.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(t.color) && ['score', 'ok', 'bad', 'skip', 'best'].every(function (k) { return typeof t[k] === 'number' && isFinite(t[k]); });
        });
    }

    var core = { GROUPS: GROUPS, groupOf: groupOf, wordFit: wordFit, CHOICES: CHOICES, sanitizeOpts: sanitizeOpts, points: points, rank: rank, isTie: isTie, shareText: shareText, snapshot: snapshot, validSave: validSave };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Da qui in giu': la pagina
       ====================================================================== */
    var $ = QZ.$;

    var COUNT = {};
    tabooWords.forEach(function (w) { var g = groupOf(w.categoria); COUNT[g] = (COUNT[g] || 0) + 1; });
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
        ['Un avversario fa l\'arbitro:', 'sente una vietata e fischia.'],
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
    QZ.segmented($('#opt-pen'), [{ label: 'Costa un punto', value: 1 }, { label: 'Solo carta buttata', value: 0 }], opts.pen, function (v) { opts.pen = v; saveOpts(); });
    QZ.segmented($('#opt-skip'), [{ label: 'Quanti vuoi', value: -1 }, { label: '3', value: 3 }, { label: '1', value: 1 }, { label: 'Zero', value: 0 }], opts.skips, function (v) { opts.skips = v; saveOpts(); });

    $('#groups-all').innerHTML = QZ.icon('check') + 'Tutti';
    $('#groups').innerHTML = GROUPS.map(function (g) {
        return '<button type="button" class="tb-group" data-g="' + g.id + '" aria-pressed="false"><span class="tb-group__lamp" aria-hidden="true"></span>' + QZ.esc(g.label) + ' <small>' + QZ.fmt(COUNT[g.id] || 0) + '</small></button>';
    }).join('');
    // aggiorna le caselle senza ridisegnarle: la spia si accende solo dove si tocca
    function paintGroups(drawn) {
        QZ.$$('#groups .tb-group').forEach(function (b) {
            var on = groups.indexOf(b.dataset.g) >= 0;
            b.setAttribute('aria-pressed', String(on));
            b.classList.toggle('is-drawn', on && (drawn === 'all' || drawn === b));
        });
        var n = groups.reduce(function (s, g) { return s + (COUNT[g] || 0); }, 0);
        $('#groups-hint').textContent = QZ.fmt(n) + ' carte nel mazzo';
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
    $('#hand-rules').innerHTML = rulesHTML([
        ['Chi spiega', 'prende il telefono e lo tiene lontano dagli occhi dei compagni.'],
        ['Un avversario', 'guarda da sopra la spalla e fischia le vietate.']
    ]);

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
        b.innerHTML = QZ.icon('play') + '<span>Riprendi la partita<small>' +
            QZ.esc((s.rounds > 1 ? 'giro ' + s.round + '/' + s.rounds + ' · ' : '') + 'tocca a ' + s.teams[s.turn].name) + '</small></span>';
    }
    paintResume();

    /* ---------- Partita ---------- */
    function newState(o) {
        return {
            phase: 'hand', round: o.round || 1, turn: o.turn || 0, rounds: o.rounds, time: o.time, pen: o.pen, skips: o.skips,
            groups: o.groups.filter(function (g) { return COUNT[g]; }),
            teams: o.teams, log: [], cur: null
        };
    }

    function start() {
        // doppio tocco su "Fischio d'inizio": la partita parte una volta sola
        if (S.phase !== 'idle' && S.phase !== 'done') return;
        var names = teamsList.get();
        S = newState({
            rounds: opts.rounds, time: opts.time, pen: opts.pen, skips: opts.skips, groups: groups.slice(),
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

    function team() { return S.teams[S.turn]; }

    function scoresHTML(active) {
        return S.teams.map(function (t, i) {
            return '<div class="team' + (i === active ? ' is-active' : '') + '" style="--c:' + t.color + '"><span class="team__dot"></span>' +
                '<span class="team__name">' + QZ.esc(t.name) + '</span><span class="team__score">' + t.score + '</span></div>';
        }).join('');
    }

    function showHand() {
        S.phase = 'hand';
        saveGame();
        var t = team();
        $('#s-turn').style.setProperty('--c', t.color);
        $('#hand-round').textContent = S.rounds > 1 ? 'Giro ' + S.round + '/' + S.rounds : 'Giro unico';
        $('#hand-name').textContent = t.name;
        $('#hand-scores').innerHTML = scoresHTML(S.turn);
        QZ.show('s-turn');
        QZ.say((S.rounds > 1 ? 'Giro ' + S.round + ' di ' + S.rounds + '. ' : '') + 'Tocca a ' + t.name + ': passa il telefono a chi spiega.');
        QZ.sound.whoosh();
    }

    function beginTurn() {
        if (S.phase !== 'hand') return;
        S.phase = 'count';
        var t = team();
        S.log = [];
        S.turnPts = 0;
        S.skipsLeft = S.skips;
        $('#s-game').style.setProperty('--c', t.color);
        $('#hud-team').textContent = t.name;
        $('#hud-pts').textContent = '0';
        $('#word').textContent = 'Pronti?';
        $('#taboo').innerHTML = '';
        $('#word-cat').textContent = '';
        paintButtons();
        timer.reset(S.time);
        timer.warnAt = 0.34;
        timer.dangerAt = 10 / S.time;
        timer.render();
        QZ.show('s-game');
        QZ.countdown(3, 'Via!').then(function () {
            if (S.phase !== 'count') return;
            S.phase = 'play';
            deal(null);
            timer.start();
            // il "Via col tempo" e' sparito con il cambio: il fuoco va su "Indovinata"
            $('#ok-btn').focus({ preventScroll: true });
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
        var g = S.groups;
        return deck.draw(function (w) { return g.indexOf(groupOf(w.categoria)) >= 0; });
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
                '<span class="report__word"><span>' + QZ.esc(l.word) + '</span>' + (l.last ? '<small>sul fischio finale</small>' : '') + '</span>' +
                '<span class="report__res" aria-hidden="true"></span></button>';
        }).join('') : '<p class="report__empty">Tabellone vuoto: nessuna carta in questo turno.</p>';
        S.log.forEach(function (l, i) { labelRow(i); });
        var last = S.turn === S.teams.length - 1 && S.round === S.rounds;
        $('#sum-next').innerHTML = last ? QZ.icon('trophy') + 'Classifica finale' : 'Tocca a ' + QZ.esc(S.teams[(S.turn + 1) % S.teams.length].name) + QZ.icon('arrow');
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
        S.log.forEach(function (l) { t[l.res]++; });
        var ok = S.log.filter(function (l) { return l.res === 'ok'; }).length;
        if (ok > t.best) t.best = ok;
        S.log = [];
    }

    function nextTurn() {
        if (S.phase !== 'sum') return;
        tally(team());
        S.turn++;
        if (S.turn >= S.teams.length) { S.turn = 0; S.round++; }
        if (S.round > S.rounds) { finish(); return; }
        showHand();
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        // turno interrotto dal time-out: conta quello che e' stato segnato finora
        if (S.phase === 'pause') tally(team());
        S.phase = 'done';
        timer.pause();
        QZ.wake.off();
        clearGame();
        var ranked = rank(S.teams);
        var top = ranked[0];
        var tie = isTie(ranked);
        var tot = S.teams.reduce(function (s, t) { return s + t.ok; }, 0);
        var bad = S.teams.reduce(function (s, t) { return s + t.bad; }, 0);
        var best = S.teams.reduce(function (s, t) { return Math.max(s, t.best); }, 0);
        var r = QZ.profile.record('taboo', {
            xp: Math.min(150, 15 + tot * 3),
            label: (tie ? 'Pareggio a ' : 'Vince ' + top.name + ' con ') + top.score + ' punti',
            score: best
        });
        paintRecord();
        paintResume();
        // pagella della squadra vincente: carte indovinate su carte viste (i passi pesano la meta')
        var seen = top.ok + top.bad + top.skip * 0.5;
        var leaders = ranked.filter(function (t) { return t.score === top.score; }).map(function (t) { return t.name; });
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: tie ? 'Pareggio' : 'Vince ' + top.name,
            subtitle: tie ? leaders.join(' e ') + ' a pari punti in vetta. Ci vuole lo spareggio.' : QZ.pick(['Nessuno l\'ha detto, tutti l\'hanno capito.', 'Spiegato tutto senza dire niente. Applausi.', 'Lingua lunga e parole giuste: coppa meritata.']),
            big: top.score, bigSuffix: ' pt',
            ratio: seen ? top.ok / seen : 0,
            record: r,
            stats: [
                { label: 'Indovinate', value: tot },
                { label: 'Vietate', value: bad },
                { label: 'Miglior turno', value: plural(best, 'carta', 'carte') },
                { label: 'Giri', value: Math.min(S.round, S.rounds) + '/' + S.rounds }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(ranked.map(function (t) {
                return { name: t.name, score: t.score, color: t.color, sub: plural(t.ok, 'indovinata', 'indovinate') + ' · ' + plural(t.bad, 'vietata', 'vietate') + ' · ' + plural(t.skip, 'passata', 'passate') };
            }), function (s) { return s + ' pt'; }) + '</div>',
            share: shareText(ranked),
            onRetry: start,
            secondary: { label: 'Cambia impostazioni', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }
})();
