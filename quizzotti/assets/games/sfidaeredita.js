/* ==========================================================================
   QUIZZOTTI v2 — Derby delle Parole
   Dati: assets/db-sfidaeredita.js (`database`: { word, def }).
   Meccanica della v1: due squadre con cronometro a scacchi, lettere svelate
   a caso fino all'ultima esclusa, tentativi illimitati, gol = palla agli
   avversari, chi esaurisce il tempo perde. Si gioca scrivendo o con i tasti
   dell'arbitro; la voce e' una scelta esplicita (tasto del microfono in
   partita), mai chiesta da sola al calcio d'inizio. Risposte tolleranti,
   parole con spazi e accenti gestite, passo con penalita', pausa.
   Novembre 2026: "fuori di poco" quando si dice solo un pezzo della risposta,
   celle che si adattano anche alle risposte di sei parole, tabellino delle
   parole a fine derby, gol piu' rapido, albo d'oro e bilancio tra le due
   squadre su questo telefono (chiave qz.sfidaeredita.albo).
   Grafica: il tabellone dello stadio vero (CASA - OSPITI, risultato e
   cronometri a LED) e la parola su celle a LED che si accendono una a una.
   ========================================================================== */
(function () {
    'use strict';

    /* ======================================================================
       Logica pura (senza pagina): confronto delle risposte, impostazioni,
       bilancio tra due squadre. La provano i test in tests/sfidaeredita.test.js.
       ====================================================================== */
    /** Come QZ.norm: minuscole, niente accenti ne' punteggiatura. */
    function norm(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    /** Distanza di Levenshtein su stringhe gia' normalizzate. */
    function distance(a, b) {
        if (a === b) return 0;
        var prev = [], cur, i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur = [i];
            for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[b.length];
    }
    /** Errori di battitura tollerati: nessuno fino a 4 lettere, uno fino a 8, poi due. */
    function tolerance(len) { return len <= 4 ? 0 : len <= 8 ? 1 : 2; }

    /** Confronto tollerante: accenti, punteggiatura e piccoli refusi non contano;
        a voce cerca la parola anche dentro una frase ("e' il rigore"). */
    function matches(said, answer) {
        var a = norm(answer).replace(/ /g, '');
        var words = norm(said).split(' ').filter(Boolean);
        if (!a || !words.length) return false;
        var tol = tolerance(a.length);
        var m = norm(answer).split(' ').length;
        for (var size = Math.max(1, m - 1); size <= m + 1; size++) {
            for (var i = 0; i + size <= words.length; i++) {
                var chunk = words.slice(i, i + size).join('');
                if (Math.abs(chunk.length - a.length) <= tol && distance(chunk, a) <= tol) return true;
            }
        }
        return false;
    }

    var STOP = ['della', 'delle', 'dello', 'degli', 'dalla', 'nella', 'sulla'];
    /** Fuori di poco: e' stato detto solo un pezzo di una risposta a piu' parole
        (il cognome di "KYLIAN MBAPPE'", "BANDIERA" per "GOL DELLA BANDIERA"). */
    function nearMiss(said, answer) {
        var parts = norm(answer).split(' ');
        if (parts.length < 2 || matches(said, answer)) return false;
        var s = norm(said).replace(/ /g, '');
        // ogni pezzo contiguo della risposta, tranne la risposta intera
        // ("MILINKOVIC-SAVIC" per "SERGEJ MILINKOVIC-SAVIC")
        for (var i = 0; i < parts.length; i++) {
            for (var j = i + 1; j <= parts.length; j++) {
                if (i === 0 && j === parts.length) continue;
                var p = parts.slice(i, j).join('');
                if (p.length < 4 || (j - i === 1 && STOP.indexOf(p) >= 0)) continue;
                var tol = tolerance(p.length);
                if (Math.abs(s.length - p.length) <= tol && distance(s, p) <= tol) return true;
            }
        }
        return false;
    }

    var CLOCKS = [45, 60, 90];
    var SPEEDS = [2200, 1500, 1000];
    /** Impostazioni salvate: un valore vecchio o rotto torna al default, senza buttare il resto. */
    function sanitizeCfg(c) {
        c = c && typeof c === 'object' ? c : {};
        return {
            clock: CLOCKS.indexOf(c.clock) >= 0 ? c.clock : 60,
            speed: SPEEDS.indexOf(c.speed) >= 0 ? c.speed : 1500
        };
    }

    /** Bilancio tra due squadre nei derby salvati (nomi senza maiuscole, campo invertito compreso).
        games: [{ a, b, w }] con w = 0 vince a, 1 vince b, -1 pareggio. */
    function headToHead(games, nameA, nameB) {
        var key = function (n) { return String(n).trim().toLowerCase(); };
        var r = { a: 0, b: 0, x: 0, n: 0 };
        (games || []).forEach(function (g) {
            var same = key(g.a) === key(nameA) && key(g.b) === key(nameB);
            var swap = key(g.a) === key(nameB) && key(g.b) === key(nameA);
            if (!same && !swap) return;
            r.n++;
            if (g.w < 0) r.x++;
            else if ((g.w === 0) === same) r.a++;
            else r.b++;
        });
        return r;
    }

    /** "Si va sullo 0-1", "sull'1-0", "sull'8-3", "sull'11-2", "sul 2-2": l'articolo giusto davanti al punteggio. */
    function scoreLine(a, b) {
        var art = a === 0 ? 'sullo ' : (a === 1 || a === 8 || a === 11 || (a >= 80 && a <= 89)) ? "sull'" : 'sul ';
        return 'Si va ' + art + a + '-' + b;
    }

    /** Lato delle celle della parola: la piu' grande (max 48px, min 12px) per cui ogni parola
        sta su una riga sola e il tutto, andando a capo tra una parola e l'altra, non supera maxH.
        lengths: lettere di ogni parola; W: larghezza utile in px. */
    function cellSize(lengths, W, maxH) {
        var tw, gap;
        for (tw = 48; tw > 12; tw--) {
            gap = tw < 22 ? 2 : 3;
            var rowW = 0, rows = 1, fits = true;
            for (var i = 0; i < lengths.length; i++) {
                var w = lengths[i] * (tw + gap) - gap;
                if (w > W) { fits = false; break; }
                if (rowW && rowW + 16 + w > W) { rows++; rowW = w; } else rowW += (rowW ? 16 : 0) + w;
            }
            if (fits && rows * tw * 1.12 + (rows - 1) * 10 <= maxH) break;
        }
        return { tw: tw, gap: tw < 22 ? 2 : 3 };
    }

    var core = { norm: norm, scoreLine: scoreLine, cellSize: cellSize, matches: matches, nearMiss: nearMiss, sanitizeCfg: sanitizeCfg, headToHead: headToHead, CLOCKS: CLOCKS, SPEEDS: SPEEDS };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Da qui in giu': la pagina
       ====================================================================== */
    var $ = QZ.$;
    var deck = new QZ.Deck('sfidaeredita', database, function (d) { return d.word; });
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // la v2 non ricorda piu' il microfono (si accende solo a mano): sanitizeCfg lo scarta
    var CFG = sanitizeCfg(QZ.store.get('qz.sfidaeredita.cfg', {}));
    var PASS_COST = 5;

    var G = null;
    var timers = [];
    var letterIv = 0;
    var goalTo = 0;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('ball');
    $('#rules').innerHTML = [
        ['Esce una definizione', 'e la parola si accende sul tabellone, una lettera alla volta. L\'ultima non la regala mai.'],
        ['Rispondete', 'scrivendo o lasciando decidere all\'arbitro. Sbagliato? Palo, si riprova quante volte volete.'],
        ['Gol:', 'parola indovinata, palla agli avversari con una parola nuova.'],
        ['Non la sapete?', 'Passo: parola nuova, ma il cronometro perde ' + PASS_COST + ' secondi.'],
        ['Ogni squadra ha il suo cronometro,', 'che corre solo nel suo turno. Chi lo finisce perde il derby, anche se ha segnato di più.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    /* ---------- L'albo d'oro di questo telefono ---------- */
    var ALBO_KEY = 'qz.sfidaeredita.albo';
    function albo() {
        var a = QZ.store.get(ALBO_KEY, null);
        if (!a || typeof a !== 'object') a = {};
        // memoria rotta o scritta a mano: si tiene solo quello che si sa leggere
        a.games = (Array.isArray(a.games) ? a.games : []).filter(function (g) {
            return g && typeof g.a === 'string' && typeof g.b === 'string' && typeof g.ga === 'number' && typeof g.gb === 'number';
        });
        var f = a.fastest;
        if (!f || typeof f.s !== 'number' || typeof f.word !== 'string' || typeof f.team !== 'string') delete a.fastest;
        return a;
    }
    function secs(s) { return QZ.fmt(s, 1) + ' s'; }
    function paintStartRecord() {
        var played = (QZ.profile.get().gamesPlayed || {}).sfidaeredita || 0;
        var a = albo(), bits = [];
        if (played) bits.push('Su questo telefono: ' + played + (played === 1 ? ' derby giocato.' : ' derby giocati.'));
        var last = a.games[a.games.length - 1];
        if (last) bits.push('L\'ultimo: ' + last.a + ' ' + last.ga + '-' + last.gb + ' ' + last.b + '.');
        if (a.fastest) bits.push('Gol più rapido di sempre: «' + a.fastest.word + '» in ' + secs(a.fastest.s) + ', firmato ' + a.fastest.team + '.');
        $('#start-record').textContent = bits.join(' ');
    }
    paintStartRecord();

    var teams = QZ.playerList($('#teams-host'), { key: 'sfidaeredita', min: 2, max: 2, initial: 2, label: 'Squadra', title: 'Le due squadre' });
    QZ.segmented($('#opt-clock'), [{ label: '45 s', value: 45 }, { label: '60 s', value: 60 }, { label: '90 s', value: 90 }], CFG.clock, function (v) { CFG.clock = v; saveCfg(); });
    QZ.segmented($('#opt-speed'), [{ label: 'Lente', value: 2200 }, { label: 'Normali', value: 1500 }, { label: 'Veloci', value: 1000 }], CFG.speed, function (v) { CFG.speed = v; saveCfg(); });
    $('#mic-note').innerHTML = QZ.icon(SR ? 'mic' : 'micoff') + '<span>' + (SR
        ? 'Si risponde scrivendo o con i tasti dell\'arbitro. Volete rispondere a voce? In partita c\'è il tasto <b>Voce</b>: il microfono si accende solo se lo toccate voi.'
        : 'Si risponde scrivendo o con i tasti dell\'arbitro. Questo browser non capisce la voce, ma non serve.') + '</span>';
    function saveCfg() { QZ.store.set('qz.sfidaeredita.cfg', CFG); }

    $('#start-btn').addEventListener('click', startGame);
    $('#k-go').innerHTML = QZ.icon('whistle') + 'Calcio d\'inizio';
    $('#k-go').addEventListener('click', startPlay);
    $('#k-quit').innerHTML = QZ.icon('flag') + 'Chiudi il derby';
    $('#k-quit').addEventListener('click', askQuit);
    $('#p-quit').innerHTML = QZ.icon('flag') + 'Chiudi';
    $('#p-quit').addEventListener('click', askQuit);
    $('#p-pause').addEventListener('click', togglePause);
    $('#shoot').innerHTML = QZ.icon('ball') + 'Tira';
    $('#ref-goal').innerHTML = QZ.icon('check') + 'Gol';
    $('#ref-post').innerHTML = QZ.icon('x') + 'Palo';
    $('#ref-pass').innerHTML = QZ.icon('skip') + 'Passo <small>−' + PASS_COST + ' s</small>';
    $('#ref-pass').setAttribute('aria-label', 'Passo: parola nuova, costa ' + PASS_COST + ' secondi');
    $('#ref-goal').addEventListener('click', function () { if (playing()) goal(); });
    $('#ref-post').addEventListener('click', function () { if (playing()) post(''); });
    $('#ref-pass').addEventListener('click', passWord);
    $('#form').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = $('#guess').value.trim();
        if (!playing()) return;
        if (!v) { QZ.fx.shake($('#guess')); return; }
        $('#guess').value = '';
        judge([v]);
    });
    $('#mic').addEventListener('click', toggleMic);
    window.addEventListener('resize', fitWord);

    /* ---------- Helper ---------- */
    function playing() { return G && G.state === 'play' && !G.paused; }
    function isLetter(ch) { return QZ.norm(ch) !== ''; }
    function team() { return G.teams[G.turn]; }
    function pad(n) { return String(n).padStart(2, '0'); }
    /** Il cronometro della squadra come sul tabellone: 1:00, 0:45, 0:09 */
    function paintClock(i) {
        var s = Math.max(0, Math.ceil(timers[i].remaining));
        $('#t' + i + ' [data-clock]').textContent = Math.floor(s / 60) + ':' + pad(s % 60);
    }
    /** quiet: si scrive ma non si annuncia (la voce trascritta mentre si parla) */
    function feed(text, kind, ico, quiet) {
        $('#feed').classList.remove('is-ok', 'is-bad');
        if (kind) $('#feed').classList.add('is-' + kind);
        $('#feed-ico').innerHTML = QZ.icon(ico || 'message') + '<span class="db-feed__lbl">Cronaca</span>';
        $('#feed-txt').setAttribute('aria-live', quiet ? 'off' : 'polite');
        $('#feed-txt').textContent = text;
    }

    /* ---------- Partita ---------- */
    function startGame() {
        var names = teams.get();
        if (names[0].toLowerCase() === names[1].toLowerCase()) names[1] += ' 2';
        timers.forEach(function (t) { t.destroy(); });
        G = {
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i], goals: 0, posts: 0, passes: 0 }; }),
            turn: QZ.rand(0, 1), state: 'kick', paused: false, words: 0, word: null,
            log: [], fastest: null
        };
        timers = G.teams.map(function (t, i) {
            var el = $('#t' + i);
            el.style.setProperty('--c', t.color);
            el.classList.remove('is-danger');
            el.querySelector('[data-name]').textContent = t.name;
            el.querySelector('[data-bar]').style.setProperty('--tick', (1000 / CFG.clock).toFixed(3) + '%');
            $('#g' + i).textContent = '0';
            return new QZ.Timer({
                seconds: CFG.clock, bar: el.querySelector('[data-bar]'),
                warnAt: 20 / CFG.clock, dangerAt: 10 / CFG.clock,
                onSecond: function (s) {
                    paintClock(i);
                    el.classList.toggle('is-danger', s <= 10 && s > 0);
                    if (s <= 10 && s > 0 && G.turn === i) QZ.sound.tick();
                },
                onExpire: function () { timeOut(i); }
            });
        });
        paintClock(0);
        paintClock(1);
        // la voce riparte spenta a ogni derby: si accende solo toccando il tasto
        micWanted = false;
        paintMic();
        QZ.wake.on();
        QZ.show('s-game');
        kickoff(true);
    }

    function paintTurn() {
        [0, 1].forEach(function (i) { $('#t' + i).classList.toggle('is-active', i === G.turn && G.state !== 'over'); });
        $('#sb-word').textContent = pad(G.words + 1);
    }

    function kickoff(first) {
        G.state = 'kick';
        G.paused = false;
        $('#game').classList.remove('db-paused');
        $('#play').hidden = true;
        $('#kick').hidden = false;
        paintTurn();
        var t = team();
        $('#k-eyebrow').innerHTML = QZ.icon('ball') + (first ? 'Sorteggio' : 'Parola ' + (G.words + 1));
        $('#k-title').innerHTML = '<span>' + QZ.esc(t.name) + '</span>';
        $('#k-title').style.setProperty('--c', t.color);
        var left = Math.ceil(timers[G.turn].remaining);
        $('#k-sub').textContent = (first ? 'Ha deciso la monetina. ' : '') + 'Passate il telefono: vi restano ' + left + ' secondi.';
        QZ.say('Palla a ' + t.name + '. ' + $('#k-sub').textContent);
        QZ.fx.replay($('#k-box'), 'is-pop');
        setTimeout(function () { if (G.state === 'kick') $('#k-go').focus({ preventScroll: true }); }, 120);
    }

    function startPlay() {
        if (G.state !== 'kick') return;
        QZ.sound.whistle();
        QZ.vibrate(40);
        $('#kick').hidden = true;
        $('#play').hidden = false;
        newWord();
        feed(micActive() ? 'Parlate pure, vi ascolto.' : 'Scrivete la risposta o chiamate l\'arbitro.', null, micActive() ? 'mic' : 'message');
        G.state = 'play';
        paintPause();
        timers[G.turn].start();
        micStart();
        // il bottone del calcio d'inizio sparisce: il fuoco va alla risposta (tastiera)
        // o alla definizione (touch, senza aprire la tastiera del telefono)
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) $('#guess').focus({ preventScroll: true });
        else $('#p-def').focus({ preventScroll: true });
    }

    function newWord() {
        G.word = deck.draw();
        G.logged = false;
        // il tempo della parola si misura sul cronometro della squadra: le pause non contano
        G.wStart = timers[G.turn].remaining;
        var w = G.word.word;
        G.shown = [];
        for (var i = 0; i < w.length; i++) G.shown.push(!isLetter(w[i]));
        var nWords = w.trim().split(/\s+/).length;
        var nLetters = w.split('').filter(isLetter).length;
        $('#p-eyebrow').innerHTML = QZ.icon('bulb') + (nWords > 1 ? nWords + ' parole · ' : '') + nLetters + ' lettere';
        $('#p-def').textContent = G.word.def;
        QZ.fx.replay($('#p-def'));
        QZ.$$('#word .qz-stamp').forEach(function (s) { s.remove(); });
        renderWord();
        startLetters();
    }

    function renderWord() {
        var w = G.word.word, html = '<div class="db-w">', k = 0, n = 1, fresh = true;
        for (var i = 0; i < w.length; i++) {
            var ch = w[i];
            if (ch === ' ') { html += '</div><div class="db-w">'; fresh = true; continue; }
            var letter = isLetter(ch);
            // con piu' parole, il numerino sulla prima cella di ognuna
            var num = letter && fresh && w.indexOf(' ') >= 0 ? ' data-n="' + (n++) + '"' : '';
            if (letter) fresh = false;
            html += '<span class="db-t' + (letter ? '' : ' db-p') + '" data-i="' + i + '"' + num + ' style="--i:' + (k++) + '">' + (G.shown[i] ? QZ.esc(ch) : '') + '</span>';
        }
        $('#word').innerHTML = html + '</div>';
        fitWord();
        paintWordLabel();
    }

    // dimensione delle celle: la parola piu' lunga deve stare su una riga
    function fitWord() {
        if (!G || !G.word) return;
        // larghezza utile del pannello meno il margine interno; in altezza al massimo un quarto
        // di schermo, cosi' risposta e arbitro restano sotto il pollice anche con sei parole
        var W = ($('#word').clientWidth || 340) - 24;
        var maxH = QZ.clamp(window.innerHeight * 0.26, 110, 200);
        var fit = cellSize(G.word.word.split(' ').map(function (x) { return x.length; }), W, maxH);
        $('#word').style.setProperty('--tw', fit.tw + 'px');
        $('#word').style.setProperty('--tg', fit.gap + 'px');
    }

    function paintWordLabel() {
        var w = G.word.word;
        var hidden = G.shown.filter(function (s) { return !s; }).length;
        var shown = w.split('').map(function (c, i) { return G.shown[i] ? c : '_'; }).join('');
        $('#word').setAttribute('aria-label', 'Parola misteriosa: ' + shown + ' (' + hidden + ' lettere nascoste)');
    }

    function startLetters() {
        clearInterval(letterIv);
        letterIv = setInterval(revealLetter, CFG.speed);
    }
    function revealLetter() {
        if (!playing()) return;
        var hidden = [];
        G.shown.forEach(function (s, i) { if (!s) hidden.push(i); });
        if (hidden.length <= 1) return;   // l'ultima lettera non si svela mai
        var i = QZ.pick(hidden);
        G.shown[i] = true;
        var tile = $('#word [data-i="' + i + '"]');
        if (tile) { tile.textContent = G.word.word[i]; tile.classList.add('is-on'); }
        paintWordLabel();
        QZ.sound.tone(1400 + Math.random() * 300, 0.04, 'triangle', 0.05);
    }

    /** Il tabellino delle parole: una riga per parola giocata (gol, passo, fischio finale). */
    function logWord(res) {
        if (!G.word || G.logged) return;
        G.logged = true;
        var hidden = G.shown.filter(function (s) { return !s; }).length;
        var row = { word: G.word.word, team: G.turn, res: res, s: Math.max(0, G.wStart - timers[G.turn].remaining), hidden: hidden };
        G.log.push(row);
        // sotto il secondo non si fa nemmeno in tempo a leggere: e' l'arbitro col dito veloce, non un record
        if (res === 'gol' && row.s >= 1 && (!G.fastest || row.s < G.fastest.s)) G.fastest = row;
    }

    /* ---------- Risposte ---------- */
    function judge(cands) {
        if (!playing()) return;
        var ok = cands.some(function (c) { return matches(c, G.word.word); });
        if (ok) goal();
        else post(cands[0], cands.some(function (c) { return nearMiss(c, G.word.word); }));
    }

    function post(said, near) {
        team().posts++;
        feed(!said ? 'Palo. Si riprova.'
            : near ? 'Fuori di poco: «' + said.toUpperCase() + '» c\'è, ma serve la risposta intera.'
                : 'Palo. «' + said.toUpperCase() + '» non è la parola giusta.', 'bad', 'x');
        QZ.sound.wrong();
        QZ.vibrate([50, 30, 50]);
        QZ.fx.stamp($('#word'), 'Palo', 'ink', { size: 40, ms: 1400, say: false });   // lo annuncia la cronaca
        QZ.fx.shake($('#word'));
    }

    function goal() {
        if (!playing()) return;
        G.state = 'goal';
        timers[G.turn].pause();
        clearInterval(letterIv);
        micStop();
        var t = team();
        t.goals++;
        G.words++;
        logWord('gol');
        revealAll('is-solved');
        QZ.fx.stamp($('#word'), 'Gol!', 'ok', { size: 54, say: false });
        var g = $('#g' + G.turn);
        g.textContent = t.goals;
        QZ.fx.pop(g);
        QZ.fx.floatText(g, '+1');
        feed('Gol di ' + t.name + '. Era «' + G.word.word.toUpperCase() + '». ' + scoreLine(G.teams[0].goals, G.teams[1].goals) + '.', 'ok', 'check');
        QZ.sound.correct();
        setTimeout(QZ.sound.whistle, 350);
        QZ.vibrate([30, 40, 120]);
        QZ.fx.confetti({ count: 70, colors: [t.color, '#eef1f2', '#3ddc84', '#ffb627'], origin: { x: 0.5, y: 0.45 } });
        clearTimeout(goalTo);
        goalTo = setTimeout(function () {
            if (G.state !== 'goal') return;
            G.turn = 1 - G.turn;
            kickoff(false);
        }, QZ.reducedMotion() ? 900 : 2600);
    }

    function revealAll(cls) {
        var w = G.word.word;
        QZ.$$('#word .db-t').forEach(function (tile) {
            var i = Number(tile.dataset.i);
            tile.textContent = w[i];
            if (isLetter(w[i])) { tile.classList.remove('is-on'); tile.classList.add(cls); }
        });
        G.shown = G.shown.map(function () { return true; });
        paintWordLabel();
    }

    var lastPass = 0;
    function passWord() {
        if (!playing()) return;
        // doppio tocco: un passo solo (ognuno costa secondi)
        if (Date.now() - lastPass < 400) return;
        lastPass = Date.now();
        var tm = timers[G.turn];
        team().passes++;
        logWord('passo');
        tm.remaining = Math.max(0, tm.remaining - PASS_COST);
        tm.render();
        paintClock(G.turn);
        QZ.fx.floatText($('#t' + G.turn), '−' + PASS_COST + ' s', true);
        QZ.sound.whoosh();
        if (tm.remaining <= 0) { tm.pause(); timeOut(G.turn); return; }
        feed('Passo. Parola nuova, ' + PASS_COST + ' secondi in meno.', null, 'skip');
        newWord();
    }

    function timeOut(i) {
        if (!G || G.state === 'over') return;
        G.state = 'over';
        clearInterval(letterIv);
        clearTimeout(goalTo);
        micStop();
        timers.forEach(function (t) { t.pause(); });
        if (G.turn === i) logWord('fine');
        paintTurn();
        if (G.word && !$('#play').hidden) {
            revealAll('is-fail');
            QZ.fx.stamp($('#word'), 'Fischio finale', 'bad', { size: 28, y: 0, say: false });
        }
        feed('Tempo finito per ' + G.teams[i].name + '. La parola era «' + (G.word ? G.word.word.toUpperCase() : '') + '».', 'bad', 'clock');
        QZ.sound.buzzer();
        QZ.vibrate([200, 80, 200, 80, 400]);
        // triplice fischio
        [0, 450, 900].forEach(function (d) { setTimeout(QZ.sound.whistle, 500 + d); });
        setTimeout(function () { finish(1 - i, 'time'); }, 2600);
    }

    /* ---------- Pausa ---------- */
    function togglePause() {
        if (!G || G.state !== 'play') return;
        G.paused = !G.paused;
        if (G.paused) { timers[G.turn].pause(); micStop(); }
        else { timers[G.turn].start(); micStart(); }
        $('#game').classList.toggle('db-paused', G.paused);
        paintPause();
        QZ.say(G.paused ? 'Partita ferma, cronometro fermo.' : 'Si riprende, il cronometro corre.');
        // sulla striscia senza annunciarlo una seconda volta (lo ha gia' detto QZ.say)
        feed(G.paused ? 'Partita ferma: cronometro fermo, parola coperta.' : 'Si riprende. Il cronometro corre.', null, G.paused ? 'pause' : 'play', true);
    }
    function paintPause() {
        var p = G && G.paused;
        $('#p-pause').innerHTML = QZ.icon(p ? 'play' : 'pause') + (p ? 'Riprendi' : 'Pausa');
        ['#guess', '#shoot', '#ref-goal', '#ref-post', '#ref-pass'].forEach(function (s) { $(s).disabled = !!p; });
    }
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && G && G.state === 'play' && !G.paused) togglePause();
    });

    function askQuit() {
        // a triplice fischio gia' partito il derby si chiude da solo
        if (!G || G.state === 'over') return;
        var wasPlaying = G.state === 'play' && !G.paused;
        if (wasPlaying) togglePause();
        QZ.confirm('Il derby finisce qui e vince chi ha segnato di più.', { title: 'Chiudere il derby?', okLabel: 'Chiudi', cancelLabel: 'Si continua', danger: true }).then(function (ok) {
            if (ok) {
                G.state = 'over';
                clearInterval(letterIv);
                clearTimeout(goalTo);
                micStop();
                timers.forEach(function (t) { t.pause(); });
                var a = G.teams[0].goals, b = G.teams[1].goals;
                finish(a === b ? -1 : a > b ? 0 : 1, 'quit');
            } else if (wasPlaying) togglePause();
        });
    }

    /* ---------- Voce (Web Speech API, it-IT): solo se la accendete voi ---------- */
    var rec = null, micOn = false, micWanted = false;
    function micActive() { return !!SR && micWanted; }
    function buildRec() {
        rec = new SR();
        rec.lang = 'it-IT';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 3;
        rec.onresult = function (e) {
            if (!playing()) return;
            for (var i = e.resultIndex; i < e.results.length; i++) {
                var res = e.results[i];
                var text = res[0].transcript.trim();
                if (!text) continue;
                if (res.isFinal) {
                    var alts = [];
                    for (var k = 0; k < res.length; k++) alts.push(res[k].transcript);
                    if (QZ.norm(text).length >= 2) judge(alts);
                } else {
                    feed('«' + text.toUpperCase() + '»', null, 'mic', true);
                }
            }
        };
        rec.onend = function () {
            micOn = false;
            paintMic();
            if (micWanted && playing()) setTimeout(micStart, 250);
        };
        rec.onerror = function (e) {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
                micWanted = false;
                paintMic();
                QZ.toast('Niente microfono: si gioca scrivendo o con l\'arbitro.', { icon: 'micoff', type: 'bad', ms: 3500 });
            }
        };
    }
    function micStart() {
        if (!micActive() || micOn || !playing()) { paintMic(); return; }
        try {
            if (!rec) buildRec();
            rec.start();
            micOn = true;
        } catch { micOn = false; }
        paintMic();
    }
    function micStop() {
        if (rec && micOn) { try { rec.abort(); } catch { /* gia' fermo */ } }
        micOn = false;
        paintMic();
    }
    function toggleMic() {
        micWanted = !micWanted;
        if (micWanted) { micStart(); if (playing()) feed('Parlate pure, vi ascolto.', null, 'mic'); }
        else { micStop(); if (playing()) feed('Voce spenta. Scrivete o chiamate l\'arbitro.', null, 'message'); }
    }
    function paintMic() {
        var b = $('#mic');
        b.hidden = !SR;
        b.innerHTML = QZ.icon(micWanted ? 'mic' : 'micoff') + (micWanted ? 'Voce accesa' : 'Voce');
        b.setAttribute('aria-pressed', String(micWanted));
        b.setAttribute('aria-label', micWanted ? 'Spegni la risposta a voce' : 'Rispondi a voce con il microfono');
        $('#feed').classList.toggle('is-listening', micOn);
    }
    paintMic();

    /* ---------- Fine partita ---------- */
    function finish(winner, reason) {
        if (G.finished) return;   // una partita, un referto
        G.finished = true;
        G.state = 'over';
        clearInterval(letterIv);
        micStop();
        timers.forEach(function (t) { t.pause(); });
        QZ.wake.off();
        var A = G.teams[0], B = G.teams[1];
        var total = A.goals + B.goals;
        var score = A.name + ' ' + A.goals + '-' + B.goals + ' ' + B.name;
        var r = QZ.profile.record('sfidaeredita', { xp: 20 + total * 8, label: score });
        var W = winner >= 0 ? G.teams[winner] : null, L = winner >= 0 ? G.teams[1 - winner] : null;
        var order = winner === 1 ? [B, A] : [A, B];
        var left = function (t) { return Math.ceil(timers[G.teams.indexOf(t)].remaining); };
        // pagella alla squadra vincente: gol segnati e quanto ha staccato gli avversari
        var ratio = W ? QZ.clamp(0.45 + W.goals * 0.07 + (W.goals - L.goals) * 0.05, 0, 1) : 0.5;

        // albo d'oro: ultimi derby, bilancio tra queste due squadre, gol piu' rapido di sempre
        var a = albo();
        var prevFast = a.fastest;
        a.games.push({ a: A.name, b: B.name, ga: A.goals, gb: B.goals, w: winner, t: Date.now() });
        if (a.games.length > 40) a.games = a.games.slice(-40);
        var fast = G.fastest;
        var fastRecord = !!(fast && (!prevFast || fast.s < prevFast.s));
        if (fastRecord) a.fastest = { s: Math.round(fast.s * 10) / 10, word: fast.word, team: G.teams[fast.team].name };
        QZ.store.set(ALBO_KEY, a);
        var h2h = headToHead(a.games, A.name, B.name), h2hN = h2h.n;

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: W ? 'trophy' : 'whistle',
            title: W ? 'Vince ' + W.name : 'Pareggio',
            subtitle: reason === 'time'
                ? 'Triplice fischio: tempo finito per ' + L.name + '.'
                : W ? 'Derby chiuso in anticipo: decidono i gol.' : 'Stessi gol per tutte e due. Pace fatta, per stasera.',
            big: total, bigSuffix: ' gol',
            record: r,
            ratio: ratio,
            stats: [
                { label: 'Risultato', value: A.goals + ' - ' + B.goals },
                { label: 'Parole indovinate', value: G.words },
                { label: 'Pali', value: A.posts + B.posts },
                { label: 'Passi', value: A.passes + B.passes },
                fast ? { label: fastRecord && prevFast ? 'Gol più rapido · record' : 'Gol più rapido', value: secs(fast.s) } : null
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(order.map(function (t) {
                return { name: t.name, color: t.color, score: t.goals + ' gol', sub: left(t) + ' s rimasti · ' + t.posts + (t.posts === 1 ? ' palo' : ' pali') };
            })) + '</div>' + logHTML() +
                (h2hN > 1 ? '<p class="db-h2h small mt-3">Bilancio su questo telefono, ' + h2hN + ' derby: ' + QZ.esc(A.name) + ' ' + wins(h2h.a) + ' · ' + QZ.esc(B.name) + ' ' + wins(h2h.b) + ' · ' + (h2h.x ? h2h.x + (h2h.x === 1 ? ' pareggio' : ' pareggi') : 'nessun pareggio') + '.</p>' : ''),
            share: 'Derby delle Parole su Quizzotti: ' + score + '.' +
                (fast ? ' Gol più rapido: «' + fast.word + '» in ' + secs(fast.s) + '.' : '') +
                ' Chi conosce meglio il vocabolario del calcio?',
            onRetry: startGame,
            secondary: { label: 'Cambia squadre', icon: 'users', onClick: function () { paintStartRecord(); QZ.show('s-start'); } }
        });
    }

    function wins(n) { return n === 0 ? 'nessuna vittoria' : n + (n === 1 ? ' vittoria' : ' vittorie'); }

    /** Il tabellino delle parole del derby, dalla prima all'ultima. */
    function logHTML() {
        if (!G.log.length) return '';
        var tag = { gol: 'GOL', passo: 'PASSO', fine: 'FINE' };
        return '<div class="db-log mt-3"><h2 class="label" id="db-log-h">Il tabellino delle parole</h2><ol tabindex="0" aria-labelledby="db-log-h">' + G.log.map(function (r) {
            var t = G.teams[r.team];
            var what = r.res === 'gol' ? secs(r.s) + (r.hidden > 1 ? ' · ' + r.hidden + ' lettere coperte' : '') : r.res === 'passo' ? 'passata' : 'tempo scaduto';
            return '<li class="db-log__row is-' + r.res + '"><i style="background:' + t.color + '" aria-hidden="true"></i>' +
                '<span class="db-log__w"><b>' + QZ.esc(r.word) + '</b><small>' + QZ.esc(t.name) + ' · ' + what + '</small></span>' +
                '<span class="db-log__res">' + tag[r.res] + '</span></li>';
        }).join('') + '</ol></div>';
    }

    /* ---------- Tastiera ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !G || document.querySelector('.qz-modal')) return;
        if (!$('#s-game').classList.contains('is-active')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
            if (e.key === 'Escape') t.blur();
            return;
        }
        var k = e.key.toLowerCase();
        if (G.state === 'kick' && (k === 'enter' || k === ' ') && !(t.closest && t.closest('button'))) { e.preventDefault(); startPlay(); return; }
        if (G.state !== 'play') return;
        if (k === 'p') { e.preventDefault(); togglePause(); }
        if (G.paused) return;
        if (k === 'g') { e.preventDefault(); goal(); }
        else if (k === 'x') { e.preventDefault(); post(''); }
        else if (k === 's') { e.preventDefault(); passWord(); }
        else if (k === 'm' && SR) { e.preventDefault(); toggleMic(); }
        else if (k === '/') { e.preventDefault(); $('#guess').focus(); }
    });
})();
