/* ==========================================================================
   QUIZZOTTI v2 — Derby delle Parole
   Dati: assets/db-sfidaeredita.js (`database`: { word, def }).
   Meccanica della v1: due squadre con cronometro a scacchi, lettere svelate
   a caso fino all'ultima esclusa, tentativi illimitati, gol = palla agli
   avversari, chi esaurisce il tempo perde. Novita': si gioca anche senza
   microfono (risposta scritta o arbitro), risposte tolleranti, parole con
   spazi e accenti gestite, passo con penalita', pausa, nomi delle squadre.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('sfidaeredita', database, function (d) { return d.word; });
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var CFG = Object.assign({ clock: 60, speed: 1500, mic: true }, QZ.store.get('qz.sfidaeredita.cfg', {}) || {});
    var PASS_COST = 5;

    var G = null;
    var timers = [];
    var letterIv = 0;
    var goalTo = 0;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('whistle') + 'Fischio d\'inizio';
    $('#medal').innerHTML = QZ.icon('ball');
    $('#rules').innerHTML = [
        ['Leggi la definizione:', 'la parola misteriosa si svela una lettera alla volta, ma l\'ultima resta sempre nascosta.'],
        ['Rispondi', 'a voce, scrivendo o lasciando decidere all\'arbitro. Errore? Palo, si riprova.'],
        ['Gol!', 'Parola indovinata: palla agli avversari, con una parola nuova.'],
        ['Cronometro a testa:', 'scorre solo nel tuo turno. Chi resta senza tempo perde il derby.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var played = QZ.profile.get().gamesPlayed.sfidaeredita;
    $('#start-record').textContent = played ? 'Derby giocati su questo dispositivo: ' + played : '';

    var teams = QZ.playerList($('#teams-host'), { key: 'sfidaeredita', min: 2, max: 2, initial: 2, label: 'Squadra', title: 'Squadre' });
    QZ.segmented($('#opt-clock'), [{ label: '45 s', value: 45 }, { label: '60 s', value: 60 }, { label: '90 s', value: 90 }], CFG.clock, function (v) { CFG.clock = v; saveCfg(); });
    QZ.segmented($('#opt-speed'), [{ label: 'Lenta', value: 2200 }, { label: 'Normale', value: 1500 }, { label: 'Veloce', value: 1000 }], CFG.speed, function (v) { CFG.speed = v; saveCfg(); });
    if (SR) {
        $('#opt-mic').checked = !!CFG.mic;
        $('#opt-mic').addEventListener('change', function () { CFG.mic = $('#opt-mic').checked; saveCfg(); });
        $('#mic-note').textContent = 'Il browser chiederà il permesso. Si può sempre anche scrivere o usare i tasti dell\'arbitro.';
    } else {
        $('#opt-mic').checked = false;
        $('#opt-mic').disabled = true;
        $('#mic-note').textContent = 'Questo browser non supporta il riconoscimento vocale: si gioca scrivendo la risposta o con i tasti dell\'arbitro.';
    }
    function saveCfg() { QZ.store.set('qz.sfidaeredita.cfg', CFG); }

    $('#start-btn').addEventListener('click', startGame);
    $('#k-go').innerHTML = QZ.icon('whistle') + 'Calcio d\'inizio';
    $('#k-go').addEventListener('click', startPlay);
    $('#k-quit').innerHTML = QZ.icon('flag') + 'Termina il derby';
    $('#k-quit').addEventListener('click', askQuit);
    $('#p-quit').innerHTML = QZ.icon('flag') + 'Termina';
    $('#p-quit').addEventListener('click', askQuit);
    $('#p-pause').addEventListener('click', togglePause);
    $('#shoot').innerHTML = QZ.icon('ball') + 'Tira';
    $('#ref-goal').innerHTML = QZ.icon('check') + 'Gol';
    $('#ref-post').innerHTML = QZ.icon('x') + 'Palo';
    $('#ref-pass').innerHTML = QZ.icon('skip') + 'Passo';
    $('#ref-pass').title = 'Nuova parola, costa ' + PASS_COST + ' secondi';
    $('#ref-goal').addEventListener('click', function () { if (playing()) goal(); });
    $('#ref-post').addEventListener('click', function () { if (playing()) post(''); });
    $('#ref-pass').addEventListener('click', passWord);
    $('#pause-chip').innerHTML = QZ.icon('pause') + 'Partita in pausa';
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
    function feed(text, kind, ico) {
        $('#feed').classList.remove('is-ok', 'is-bad');
        if (kind) $('#feed').classList.add('is-' + kind);
        $('#feed-ico').innerHTML = QZ.icon(ico || 'message');
        $('#feed-txt').textContent = text;
    }

    /** Confronto tollerante: accenti, punteggiatura e piccoli refusi non contano;
        a voce cerca la parola anche dentro una frase ("e' il rigore"). */
    function matches(said, answer) {
        var a = QZ.norm(answer).replace(/ /g, '');
        var words = QZ.norm(said).split(' ').filter(Boolean);
        if (!a || !words.length) return false;
        var tol = a.length <= 4 ? 0 : a.length <= 8 ? 1 : 2;
        var m = QZ.norm(answer).split(' ').length;
        for (var size = Math.max(1, m - 1); size <= m + 1; size++) {
            for (var i = 0; i + size <= words.length; i++) {
                var chunk = words.slice(i, i + size).join('');
                if (Math.abs(chunk.length - a.length) <= tol && QZ.distance(chunk, a) <= tol) return true;
            }
        }
        return false;
    }

    /* ---------- Partita ---------- */
    function startGame() {
        var names = teams.get();
        if (names[0].toLowerCase() === names[1].toLowerCase()) names[1] += ' 2';
        timers.forEach(function (t) { t.destroy(); });
        G = {
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i], goals: 0, posts: 0, passes: 0 }; }),
            turn: QZ.rand(0, 1), state: 'kick', paused: false, words: 0, word: null
        };
        timers = G.teams.map(function (t, i) {
            var el = $('#t' + i);
            el.style.setProperty('--c', t.color);
            el.querySelector('[data-name]').textContent = t.name;
            $('#g' + i).textContent = '0';
            return new QZ.Timer({
                seconds: CFG.clock, label: el.querySelector('[data-clock]'), bar: el.querySelector('[data-bar]'),
                warnAt: 20 / CFG.clock, dangerAt: 10 / CFG.clock,
                onSecond: function (s) {
                    el.classList.toggle('is-danger', s <= 10 && s > 0);
                    if (s <= 10 && s > 0 && G.turn === i) QZ.sound.tick();
                },
                onExpire: function () { timeOut(i); }
            });
        });
        micWanted = !!(SR && CFG.mic);
        paintMic();
        QZ.wake.on();
        QZ.show('s-game');
        kickoff(true);
    }

    function paintTurn() {
        [0, 1].forEach(function (i) { $('#t' + i).classList.toggle('is-active', i === G.turn && G.state !== 'over'); });
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
        $('#k-title').innerHTML = 'Palla a <span style="color:' + t.color + '">' + QZ.esc(t.name) + '</span>';
        $('#k-sub').textContent = (first ? 'Il sorteggio ha scelto chi parte. ' : '') + 'Tempo rimasto: ' + Math.ceil(timers[G.turn].remaining) + ' secondi. Passate il telefono e via!';
        QZ.fx.replay($('#kick .result'), 'is-pop');
        setTimeout(function () { if (G.state === 'kick') $('#k-go').focus({ preventScroll: true }); }, 120);
    }

    function startPlay() {
        if (G.state !== 'kick') return;
        QZ.sound.whistle();
        QZ.vibrate(40);
        $('#kick').hidden = true;
        $('#play').hidden = false;
        newWord();
        feed(micActive() ? 'Parlate pure: vi ascolto…' : 'Scrivete la risposta o usate i tasti dell\'arbitro.', null, micActive() ? 'mic' : 'message');
        G.state = 'play';
        paintPause();
        timers[G.turn].start();
        micStart();
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) $('#guess').focus({ preventScroll: true });
    }

    function newWord() {
        G.word = deck.draw();
        var w = G.word.word;
        G.shown = [];
        for (var i = 0; i < w.length; i++) G.shown.push(!isLetter(w[i]));
        $('#p-eyebrow').innerHTML = QZ.icon('bulb') + 'Definizione · ' + w.replace(/\s+/g, ' ').split(' ').length + (w.indexOf(' ') >= 0 ? ' parole' : ' parola');
        $('#p-def').textContent = G.word.def;
        QZ.fx.replay($('#p-def'));
        renderWord();
        startLetters();
    }

    function renderWord() {
        var w = G.word.word, html = '<div class="db-w">', k = 0;
        for (var i = 0; i < w.length; i++) {
            var ch = w[i];
            if (ch === ' ') { html += '</div><div class="db-w">'; continue; }
            var letter = isLetter(ch);
            html += '<span class="db-t' + (letter ? '' : ' db-p') + (G.shown[i] && letter ? ' is-on' : '') + '" data-i="' + i + '" style="--i:' + (k++) + '">' + (G.shown[i] ? QZ.esc(ch) : '') + '</span>';
        }
        $('#word').innerHTML = html + '</div>';
        fitWord();
        paintWordLabel();
    }

    // dimensione delle caselle: la parola piu' lunga deve stare su una riga
    function fitWord() {
        if (!G || !G.word) return;
        var longest = Math.max.apply(null, G.word.word.split(' ').map(function (x) { return x.length; }));
        var W = $('#word').clientWidth || 340;
        var gap = longest > 10 ? 2 : 4;
        var tw = Math.floor((W - (longest - 1) * gap) / longest);
        $('#word').style.setProperty('--tg', gap + 'px');
        $('#word').style.setProperty('--tw', QZ.clamp(tw, 16, 44) + 'px');
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

    /* ---------- Risposte ---------- */
    function judge(cands) {
        if (!playing()) return;
        var ok = cands.some(function (c) { return matches(c, G.word.word); });
        if (ok) goal();
        else post(cands[0]);
    }

    function post(said) {
        team().posts++;
        feed(said ? 'Palo! «' + said.toUpperCase() + '» non è la parola giusta.' : 'Palo! Riprovate.', 'bad', 'x');
        QZ.sound.wrong();
        QZ.vibrate([50, 30, 50]);
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
        revealAll('is-solved');
        $('#word').insertAdjacentHTML('beforeend', '<div class="db-goal"><span>GOOOL!</span></div>');
        var g = $('#g' + G.turn);
        g.textContent = t.goals;
        QZ.fx.pop(g);
        QZ.fx.floatText(g, '+1');
        feed('Gol di ' + t.name + '! La parola era ' + G.word.word + '.', 'ok', 'check');
        QZ.sound.correct();
        setTimeout(QZ.sound.whistle, 350);
        QZ.vibrate([30, 40, 120]);
        QZ.fx.confetti({ count: 90, colors: [t.color, '#ffffff', '#2ee59d'], origin: { x: 0.5, y: 0.45 } });
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

    function passWord() {
        if (!playing()) return;
        var tm = timers[G.turn];
        team().passes++;
        tm.remaining = Math.max(0, tm.remaining - PASS_COST);
        tm.render();
        QZ.fx.floatText($('#t' + G.turn), '-' + PASS_COST + ' s', true);
        QZ.sound.whoosh();
        if (tm.remaining <= 0) { tm.pause(); timeOut(G.turn); return; }
        feed('Passo: parola nuova, ' + PASS_COST + ' secondi in meno.', null, 'skip');
        newWord();
    }

    function timeOut(i) {
        if (!G || G.state === 'over') return;
        G.state = 'over';
        clearInterval(letterIv);
        clearTimeout(goalTo);
        micStop();
        timers.forEach(function (t) { t.pause(); });
        paintTurn();
        if (G.word && !$('#play').hidden) revealAll('is-fail');
        feed('Tempo scaduto per ' + G.teams[i].name + '! La parola era ' + G.word.word + '.', 'bad', 'clock');
        QZ.sound.buzzer();
        QZ.vibrate([200, 80, 200, 80, 400]);
        // triplice fischio
        [0, 450, 900].forEach(function (d) { setTimeout(QZ.sound.whistle, 500 + d); });
        setTimeout(function () { finish(1 - i, 'time'); }, 2400);
    }

    /* ---------- Pausa ---------- */
    function togglePause() {
        if (!G || G.state !== 'play') return;
        G.paused = !G.paused;
        if (G.paused) { timers[G.turn].pause(); micStop(); }
        else { timers[G.turn].start(); micStart(); }
        $('#game').classList.toggle('db-paused', G.paused);
        paintPause();
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
        if (!G) return;
        var wasPlaying = G.state === 'play' && !G.paused;
        if (wasPlaying) togglePause();
        QZ.confirm('Il derby finisce qui e vince chi ha segnato di più.', { title: 'Terminare il derby?', okLabel: 'Termina', danger: true }).then(function (ok) {
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

    /* ---------- Microfono (Web Speech API, it-IT) ---------- */
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
                    feed('«' + text.toUpperCase() + '»', null, 'mic');
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
                QZ.toast('Microfono non disponibile: si gioca scrivendo o con l\'arbitro', { icon: 'micoff', type: 'bad', ms: 3500 });
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
        CFG.mic = micWanted;
        saveCfg();
        if (micWanted) { micStart(); feed('Parlate pure: vi ascolto…', null, 'mic'); }
        else micStop();
    }
    function paintMic() {
        var b = $('#mic');
        b.hidden = !SR;
        b.innerHTML = QZ.icon(micWanted ? 'mic' : 'micoff');
        b.setAttribute('aria-pressed', String(micWanted));
        b.setAttribute('aria-label', micWanted ? 'Spegni il microfono' : 'Accendi il microfono');
        $('#feed').classList.toggle('is-listening', micOn);
    }
    micWanted = !!(SR && CFG.mic);
    paintMic();

    /* ---------- Fine partita ---------- */
    function finish(winner, reason) {
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
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: W ? 'trophy' : 'whistle',
            title: W ? 'Vince ' + W.name + '!' : 'Pareggio!',
            subtitle: reason === 'time'
                ? 'Triplice fischio: ' + L.name + ' ha esaurito il tempo.'
                : W ? 'Derby chiuso in anticipo: decide il numero di gol.' : 'Stessi gol per entrambe: derby in equilibrio.',
            big: total, bigSuffix: total === 1 ? ' gol' : ' gol totali',
            record: r,
            stats: [
                { label: 'Risultato', value: A.goals + ' - ' + B.goals },
                { label: 'Parole indovinate', value: G.words },
                { label: 'Pali', value: A.posts + B.posts },
                { label: 'Passi', value: A.passes + B.passes }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(order.map(function (t) {
                return { name: t.name, color: t.color, score: t.goals + ' gol', sub: left(t) + ' s rimasti · ' + t.posts + ' pali' };
            })) + '</div>' +
                '<div class="row row--center mt-2"><button type="button" class="btn btn--ghost" id="end-setup">' + QZ.icon('users') + 'Cambia squadre</button></div>',
            share: 'Derby delle Parole su Quizzotti: ' + score + '. Chi conosce meglio il vocabolario del calcio?',
            onRetry: startGame
        });
        $('#end-setup').addEventListener('click', function () { QZ.show('s-start'); });
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
