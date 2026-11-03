/* ==========================================================================
   QUIZZOTTI v2 — Mr. White
   Dati: assets/db-mrwhite.js (`wordsList`: calciatori segreti). Le immagini di
   `playerImages` sono segnaposto finti: al loro posto una maglia generata.
   Novita' rispetto alla v1: carta 3D con passaggio di mano tra i giocatori,
   ordine di parola (Mr. White non parla mai per primo), votazione con
   eliminazione, ultima chance per Mr. White con risposta tollerante,
   piu' round con classifica, calciatori che non si ripetono tra le partite.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('mrwhite', wordsList.map(function (w) { return String(w).trim(); }));
    var CFG = Object.assign({ timer: 120, rounds: 5, hint: false, mw: 1 }, QZ.store.get('qz.mrwhite.cfg', {}) || {});
    var PTS = { civWin: 100, guess: 300, mwMate: 100, survive: 200, wrongGuess: -50 };

    var G = null;      // partita
    var R = null;      // round in corso
    var talk = null;   // timer della discussione
    var busy = false;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Distribuisci i ruoli';
    $('#medal').innerHTML = QZ.icon('spy');
    $('#rules').innerHTML = [
        ['Passatevi il telefono:', 'ognuno gira la sua carta di nascosto e scopre il calciatore segreto.'],
        ['Mr. White', 'riceve una carta bianca: non sa chi è il calciatore e deve bluffare.'],
        ['Una parola a testa', 'per descrivere il calciatore, poi si vota chi eliminare.'],
        ['Smascherato?', 'Mr. White ha un\'ultima chance: se indovina il calciatore vince lui.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var played = QZ.profile.get().gamesPlayed.mrwhite;
    $('#start-record').textContent = played ? 'Partite giocate su questo dispositivo: ' + played : '';

    var players = QZ.playerList($('#players-host'), { key: 'mrwhite', min: 3, max: 12, initial: 4, label: 'Giocatore', title: 'Giocatori (3-12)' });

    $('#mw-minus').innerHTML = QZ.icon('minus');
    $('#mw-plus').innerHTML = QZ.icon('plus');
    function maxMW() { return Math.max(1, Math.floor((players.count() - 1) / 2)); }
    function syncMW() {
        CFG.mw = QZ.clamp(CFG.mw, 1, maxMW());
        $('#mw-count').textContent = CFG.mw;
        $('#mw-minus').disabled = CFG.mw <= 1;
        $('#mw-plus').disabled = CFG.mw >= maxMW();
    }
    $('#mw-minus').addEventListener('click', function () { CFG.mw--; syncMW(); saveCfg(); QZ.sound.click(); });
    $('#mw-plus').addEventListener('click', function () { CFG.mw++; syncMW(); saveCfg(); QZ.sound.pop(); });
    // il numero di giocatori cambia dal componente lista: ricalcola il massimo di Mr. White
    $('#players-host').addEventListener('click', function () { setTimeout(syncMW, 0); });
    syncMW();

    QZ.segmented($('#opt-timer'), [
        { label: 'Libero', value: 0 }, { label: '1 min', value: 60 }, { label: '2 min', value: 120 }, { label: '3 min', value: 180 }
    ], CFG.timer, function (v) { CFG.timer = v; saveCfg(); });
    QZ.segmented($('#opt-rounds'), [
        { label: '3', value: 3 }, { label: '5', value: 5 }, { label: '8', value: 8 }, { label: 'Libera', value: 0 }
    ], CFG.rounds, function (v) { CFG.rounds = v; saveCfg(); });
    $('#opt-hint').checked = !!CFG.hint;
    $('#opt-hint').addEventListener('change', function () { CFG.hint = $('#opt-hint').checked; saveCfg(); });
    function saveCfg() { QZ.store.set('qz.mrwhite.cfg', CFG); }

    $('#start-btn').addEventListener('click', startGame);

    /* ---------- Helper ---------- */
    function av(p, cls) {
        return '<span class="mw-av ' + (cls || '') + '" style="--c:' + p.color + '" aria-hidden="true">' + QZ.esc(initials(p.name)) + '</span>';
    }
    function initials(name) {
        var t = String(name).trim().split(/\s+/);
        return ((t[0] || '?').charAt(0) + (t.length > 1 ? t[t.length - 1].charAt(0) : '')).toUpperCase();
    }
    function hue(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
        return h;
    }
    function shirt(word) {
        return '<div class="mw-shirt" style="--c:hsl(' + hue(word) + ' 72% 62%)" aria-hidden="true">' + QZ.icon('shirt') + '<span>' + QZ.esc(initials(word)) + '</span></div>';
    }
    function surnameInitial(word) {
        var t = word.split(/\s+/);
        return t[t.length - 1].charAt(0).toUpperCase();
    }
    function alive(filterMW) {
        var out = [];
        G.players.forEach(function (p, i) {
            if (R.alive[i] && (filterMW == null || R.mw[i] === filterMW)) out.push(i);
        });
        return out;
    }
    function roundLabel() { return 'Round ' + G.round + (CFG.rounds ? '/' + CFG.rounds : ''); }

    /** Risposta tollerante: nome completo o solo cognome, con piccoli refusi. */
    function isRight(guess, word) {
        var g = QZ.norm(guess);
        if (g.length < 2) return false;
        var t = QZ.norm(word).split(' ');
        var cands = [t.join(' ')];
        if (t.length > 1) { cands.push(t.slice(1).join(' ')); cands.push(t[t.length - 1]); }
        return cands.some(function (c) {
            if (c.length < 3) return false;
            var tol = c.length <= 4 ? 0 : c.length <= 8 ? 1 : 2;
            return QZ.distance(g.replace(/ /g, ''), c.replace(/ /g, '')) <= tol;
        });
    }

    /* ---------- Partita ---------- */
    function startGame() {
        // nomi doppi resi unici (nella v1 i punteggi si sovrascrivevano)
        var seen = {};
        var names = players.get().map(function (n) {
            var k = n.toLowerCase();
            seen[k] = (seen[k] || 0) + 1;
            return seen[k] > 1 ? n + ' ' + seen[k] : n;
        });
        syncMW();
        G = {
            players: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0 }; }),
            round: 0, done: 0,
            stats: { caught: 0, guessed: 0, civOut: 0 }
        };
        QZ.wake.on();
        QZ.sound.start();
        newRound();
    }

    function newRound() {
        G.round++;
        var n = G.players.length;
        var mwIdx = QZ.shuffle(G.players.map(function (_, i) { return i; })).slice(0, CFG.mw);
        var start = (G.round - 1) % n;
        R = {
            word: deck.draw(),
            mw: G.players.map(function (_, i) { return mwIdx.indexOf(i) >= 0; }),
            alive: G.players.map(function () { return true; }),
            order: G.players.map(function (_, i) { return (start + i) % n; }),
            pos: 0, flipped: false, turn: 0,
            delta: G.players.map(function () { return 0; })
        };
        $('#rv-round').innerHTML = QZ.icon('flag') + roundLabel();
        $('#rv-dots').innerHTML = R.order.map(function () { return '<i></i>'; }).join('');
        renderFront();
        QZ.show('s-reveal');
    }

    /* ---------- Distribuzione ruoli: carta 3D ---------- */
    function renderFront() {
        var p = G.players[R.order[R.pos]];
        $('#rv-front').innerHTML =
            '<div class="mw-face__in">' +
            '<span class="eyebrow">Passa il telefono a</span>' + av(p, 'mw-av--xl') +
            '<div class="mw-name">' + QZ.esc(p.name) + '</div>' +
            '<span class="mw-face__tap">' + QZ.icon('eye') + 'Tocca la carta per scoprire il ruolo</span></div>';
        $('#rv-front').setAttribute('aria-label', 'Carta di ' + p.name + ': tocca per girarla');
        $('#rv-step').textContent = 'Carta ' + (R.pos + 1) + ' di ' + R.order.length;
        $('#rv-hint').textContent = 'Solo ' + p.name + ' deve guardare lo schermo.';
        $('#rv-btn').innerHTML = QZ.icon('eye') + '<span></span>';
        $('#rv-btn span').textContent = 'Sono ' + p.name + ': gira la carta';
        QZ.$$('#rv-dots i').forEach(function (d, i) {
            d.className = i < R.pos ? 'is-done' : i === R.pos ? 'is-now' : '';
        });
        QZ.fx.pop($('#rv-front .mw-face__in'));
    }

    function flipCard() {
        if (busy || R.flipped) return;
        var i = R.order[R.pos];
        var back = $('#rv-back');
        var html;
        if (R.mw[i]) {
            back.className = 'flip__face flip__face--back mw-face mw-face--spy';
            html = '<div class="mw-spy">' + QZ.icon('spy') + '</div>' +
                '<div class="mw-name">Sei Mr. White</div>' +
                '<p class="muted">Non conosci il calciatore. Ascolta gli altri, bluffa e non farti scoprire.</p>' +
                (CFG.hint ? '<span class="chip chip--accent">' + QZ.icon('bulb') + 'Il cognome inizia per «' + QZ.esc(surnameInitial(R.word)) + '»</span>' : '') +
                (CFG.mw > 1 ? '<span class="small faint">In gioco ci sono ' + CFG.mw + ' Mr. White.</span>' : '');
        } else {
            back.className = 'flip__face flip__face--back mw-face mw-face--civ';
            html = '<span class="eyebrow" style="color:var(--ok)">Il calciatore segreto è</span>' + shirt(R.word) +
                '<div class="mw-name">' + QZ.esc(R.word) + '</div>' +
                '<p class="muted small">Descrivilo con una parola, senza aiutare troppo Mr. White.</p>';
        }
        back.innerHTML = '<div class="mw-face__in">' + html + '</div>';
        back.setAttribute('aria-hidden', 'false');
        $('#rv-front').setAttribute('aria-hidden', 'true');
        $('#rv-card').classList.add('is-flipped');
        R.flipped = true;
        // stesso suono e vibrazione per tutti i ruoli: chi ascolta non capisce nulla
        QZ.sound.whoosh();
        QZ.vibrate(30);
        var last = R.pos >= R.order.length - 1;
        $('#rv-btn').innerHTML = QZ.icon('eyeoff') + (last ? 'Nascondi e iniziate' : 'Nascondi e passa');
        $('#rv-hint').textContent = 'Memorizza il ruolo, poi nascondi la carta.';
        $('#rv-btn').focus({ preventScroll: true });
    }

    function hideCard() {
        if (busy || !R.flipped) return;
        busy = true;
        $('#rv-card').classList.remove('is-flipped');
        $('#rv-front').removeAttribute('aria-hidden');
        $('#rv-back').setAttribute('aria-hidden', 'true');
        QZ.sound.click();
        // il retro si svuota solo quando e' girato del tutto: il prossimo non vede nulla
        setTimeout(function () {
            $('#rv-back').innerHTML = '';
            $('#rv-back').className = 'flip__face flip__face--back mw-face';
            R.flipped = false;
            R.pos++;
            busy = false;
            if (R.pos < R.order.length) renderFront();
            else startTalk();
        }, QZ.reducedMotion() ? 30 : 650);
    }

    $('#rv-btn').addEventListener('click', function () { if (R.flipped) hideCard(); else flipCard(); });
    $('#rv-front').addEventListener('click', flipCard);
    $('#rv-front').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); }
    });
    $('#rv-back').addEventListener('click', hideCard);

    /* ---------- Discussione ---------- */
    $('#tk-quit').innerHTML = QZ.icon('x');
    $('#tk-reset').innerHTML = QZ.icon('refresh') + 'Azzera';
    $('#tk-vote').innerHTML = QZ.icon('target') + 'Si vota!';
    $('#vt-back').innerHTML = QZ.icon('back') + 'Torna alla discussione';

    function startTalk() {
        R.turn++;
        $('#tk-round').innerHTML = QZ.icon('flag') + '<b>' + roundLabel() + '</b>';
        $('#tk-alive').innerHTML = QZ.icon('users') + 'In gioco <b>' + alive().length + '</b>';
        $('#tk-eyebrow').innerHTML = QZ.icon('message') + 'Discussione · giro ' + R.turn;
        // il primo a parlare e' sempre un civile scelto a caso, poi si segue il giro
        var seat = alive();
        var first = seat.indexOf(QZ.pick(alive(false)));
        var order = seat.slice(first).concat(seat.slice(0, first));
        $('#tk-order').innerHTML = order.map(function (i, k) {
            var p = G.players[i];
            return '<li style="--i:' + k + '">' + av(p) + '<span class="grow">' + QZ.esc(p.name) + '</span>' + (k === 0 ? '<span class="chip chip--accent">Inizia</span>' : '') + '</li>';
        }).join('');

        if (talk) talk.destroy();
        var host = $('#tk-timer');
        if (CFG.timer) {
            host.innerHTML = QZ.ringHTML('timer-ring--xl');
            talk = new QZ.Timer({
                seconds: CFG.timer, ring: QZ.ring(host.firstChild),
                onSecond: function (s) { if (s <= 5 && s > 0) QZ.sound.tick(); },
                onExpire: function () {
                    QZ.sound.buzzer();
                    QZ.vibrate([120, 60, 120]);
                    QZ.toast('Tempo scaduto: si vota!', { icon: 'clock', type: 'bad' });
                    QZ.fx.pop($('#tk-vote'));
                    paintToggle();
                }
            });
        } else {
            host.innerHTML = '<div class="mw-clock" role="timer" aria-label="Cronometro">00:00</div>';
            talk = new Stopwatch(host.firstChild);
        }
        paintToggle();
        QZ.show('s-talk');
        setTimeout(function () {
            if ($('#s-talk').classList.contains('is-active') && talk) { talk.start(); paintToggle(); }
        }, 700);
    }

    /** Cronometro in avanti (come nella v1) quando non si sceglie un tempo. */
    function Stopwatch(el) { this.el = el; this.acc = 0; this.t0 = 0; this.running = false; this.iv = 0; }
    Stopwatch.prototype.ms = function () { return this.acc + (this.running ? performance.now() - this.t0 : 0); };
    Stopwatch.prototype.render = function () {
        var s = Math.floor(this.ms() / 1000);
        this.el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    };
    Stopwatch.prototype.start = function () {
        if (this.running) return;
        this.running = true; this.t0 = performance.now();
        this.iv = setInterval(this.render.bind(this), 250);
    };
    Stopwatch.prototype.pause = function () {
        if (!this.running) return;
        this.acc = this.ms(); this.running = false; clearInterval(this.iv); this.render();
    };
    Stopwatch.prototype.reset = function () { this.pause(); this.acc = 0; this.render(); };
    Stopwatch.prototype.destroy = function () { this.pause(); };

    function paintToggle() {
        var on = talk && talk.running;
        $('#tk-toggle').innerHTML = QZ.icon(on ? 'pause' : 'play') + (on ? 'Pausa' : 'Avvia');
    }
    function toggleTalk() {
        if (!talk) return;
        if (talk.running) talk.pause();
        else { if (talk.remaining === 0) talk.reset(); talk.start(); }
        paintToggle();
    }
    $('#tk-toggle').addEventListener('click', toggleTalk);
    $('#tk-reset').addEventListener('click', function () { if (talk) { talk.reset(); paintToggle(); } });
    $('#tk-vote').addEventListener('click', openVote);
    $('#tk-quit').addEventListener('click', function () {
        if (talk) talk.pause();
        paintToggle();
        QZ.confirm('Il round in corso non verrà conteggiato.', { title: 'Terminare la partita?', okLabel: 'Termina', danger: true }).then(function (ok) {
            if (ok) finishGame();
        });
    });

    /* ---------- Votazione ---------- */
    function openVote() {
        if (talk) { talk.pause(); paintToggle(); }
        $('#vt-eyebrow').innerHTML = QZ.icon('target') + roundLabel() + ' · giro ' + R.turn;
        $('#vt-list').innerHTML = alive().map(function (i, k) {
            var p = G.players[i];
            return '<button type="button" data-i="' + i + '" style="--i:' + k + '">' + av(p) + '<span>' + QZ.esc(p.name) + '</span></button>';
        }).join('');
        QZ.$$('#vt-list button').forEach(function (b) {
            b.addEventListener('click', function () { vote(Number(b.dataset.i)); });
        });
        QZ.sound.whoosh();
        QZ.show('s-vote');
    }
    $('#vt-back').addEventListener('click', function () { QZ.show('s-talk'); });

    function vote(i) {
        var p = G.players[i];
        QZ.confirm('Il gruppo ha scelto ' + p.name + '. Si gira la sua carta?', { title: 'Eliminare ' + p.name + '?', okLabel: 'Elimina', cancelLabel: 'Annulla' }).then(function (ok) {
            if (ok) eliminate(i);
        });
    }

    /* ---------- Verdetto con suspense ---------- */
    function eliminate(i) {
        var p = G.players[i];
        var isMW = R.mw[i];
        R.alive[i] = false;
        $('#vd-card').classList.remove('is-flipped');
        $('#vd-front').innerHTML = '<div class="mw-face__in">' + av(p, 'mw-av--xl') + '<div class="mw-name">' + QZ.esc(p.name) + '</div><span class="eyebrow">era…</span></div>';
        var back = $('#vd-back');
        back.className = 'flip__face flip__face--back mw-face ' + (isMW ? 'mw-face--spy' : 'mw-face--civ');
        back.innerHTML = '<div class="mw-face__in">' + (isMW
            ? '<div class="mw-spy">' + QZ.icon('spy') + '</div><div class="mw-name">Mr. White!</div><p class="muted">Smascherato. Ma non è ancora finita…</p>'
            : '<div class="mw-av mw-av--xl" style="--c:var(--bad);color:#fff">' + QZ.icon('x') + '</div><div class="mw-name">Un civile</div><p class="muted">Avete eliminato un innocente.</p>') + '</div>';
        $('#vd-panel').innerHTML = '';
        QZ.show('s-verdict');
        // rullo di tamburi che accelera, poi la carta si gira
        var beats = QZ.reducedMotion() ? 0 : 7;
        for (var b = 0; b < beats; b++) setTimeout(QZ.sound.tock, 300 + 900 * (1 - Math.pow(1 - b / beats, 1.6)));
        setTimeout(function () {
            $('#vd-card').classList.add('is-flipped');
            if (isMW) {
                G.stats.caught++;
                QZ.sound.reveal();
                QZ.fx.flash('rgba(255,255,255,.75)');
                QZ.vibrate([60, 40, 160]);
                setTimeout(function () { QZ.fx.sparks($('#vd-card'), '#fff', 26); }, 400);
                setTimeout(function () { guessPanel(i); }, 700);
            } else {
                G.stats.civOut++;
                QZ.sound.wrong();
                QZ.vibrate([60, 40, 60]);
                setTimeout(function () { QZ.fx.shake($('#vd-card')); }, 450);
                setTimeout(afterCivilian, 700);
            }
        }, beats ? 1350 : 200);
    }

    function afterCivilian() {
        var mwLeft = alive(true).length, civLeft = alive(false).length;
        if (mwLeft >= civLeft) {
            panel('<p class="center">I Mr. White sono rimasti in maggioranza.</p>', 'Vince Mr. White', function () { endRound('mw', 'survive'); });
        } else {
            panel('<p class="center">' + (mwLeft > 1 ? 'Ci sono ancora ' + mwLeft + ' Mr. White' : 'Mr. White è ancora') + ' tra voi. Nuovo giro di parole!</p>', 'Continua la discussione', startTalk);
        }
    }

    function panel(html, label, fn) {
        var host = $('#vd-panel');
        host.innerHTML = html + '<button type="button" class="btn btn--primary btn--lg btn--block" data-next>' + QZ.icon('arrow') + '<span></span></button>';
        host.querySelector('[data-next] span').textContent = label;
        var btn = host.querySelector('[data-next]');
        btn.addEventListener('click', fn, { once: true });
        QZ.fx.replay(host.firstElementChild);
        setTimeout(function () { btn.focus({ preventScroll: true }); }, 60);
    }

    function guessPanel(i) {
        var p = G.players[i];
        var host = $('#vd-panel');
        host.innerHTML =
            '<form class="card mw-guess" id="vd-form" autocomplete="off">' +
            '<label class="label" for="vd-input">Ultima chance per ' + QZ.esc(p.name) + ': chi è il calciatore?</label>' +
            '<div class="mw-guess__row"><input class="input" id="vd-input" maxlength="40" placeholder="Nome o cognome" autocapitalize="words" spellcheck="false">' +
            '<button class="btn btn--primary" type="submit">' + QZ.icon('check') + 'Prova</button></div>' +
            '<button class="btn btn--ghost btn--sm" type="button" id="vd-giveup">Non lo so, mi arrendo</button></form>';
        var form = $('#vd-form'), input = $('#vd-input');
        setTimeout(function () { input.focus({ preventScroll: true }); }, 80);
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!input.value.trim()) { QZ.fx.shake(input); return; }
            judge(i, isRight(input.value, R.word), input.value.trim());
        });
        $('#vd-giveup').addEventListener('click', function () { judge(i, false, ''); });
    }

    function judge(i, ok, said) {
        var p = G.players[i];
        if (ok) {
            G.stats.guessed++;
            R.delta[i] += PTS.guess;
            QZ.sound.correct();
            QZ.fx.confetti({ count: 120, colors: ['#ffffff', '#dbe4f0', '#9cc0ff'] });
            panel('<div class="card center stack" style="--gap:10px;align-items:center">' + shirt(R.word) +
                '<p><b>' + QZ.esc(p.name) + '</b> ha indovinato: era <b>' + QZ.esc(R.word) + '</b>!</p></div>',
                'Vince Mr. White', function () { endRound('mw', 'guess', i); });
            return;
        }
        R.delta[i] += PTS.wrongGuess;
        QZ.sound.buzzer();
        QZ.fx.shake($('#vd-panel'));
        var mwLeft = alive(true).length;
        // se restano altri Mr. White il calciatore non si svela ancora
        var msg = said ? '«' + QZ.esc(said) + '» è sbagliato.' : QZ.esc(p.name) + ' si arrende.';
        var override = said ? '<button type="button" class="btn btn--ghost btn--sm" id="vd-override">' + QZ.icon('check') + 'Era giusta (decide il gruppo)</button>' : '';
        var next = mwLeft === 0
            ? function () { endRound('civ', 'caught'); }
            : function () { afterWrongWithMates(); };
        panel('<div class="card center stack" style="--gap:10px;align-items:center"><span class="chip chip--bad">' + QZ.icon('x') + QZ.fmt(PTS.wrongGuess) + ' punti</span><p>' + msg + '</p>' + override + '</div>',
            mwLeft === 0 ? 'Vincono i civili' : 'Continua', next);
        var ov = $('#vd-override');
        if (ov) ov.addEventListener('click', function () {
            R.delta[i] -= PTS.wrongGuess;  // annulla la penalita' appena data
            judge(i, true, said);
        });
    }

    function afterWrongWithMates() {
        if (alive(true).length >= alive(false).length) endRound('mw', 'survive');
        else startTalk();
    }

    /* ---------- Fine round ---------- */
    function endRound(winner, how, guesser) {
        if (talk) talk.pause();
        G.players.forEach(function (_, i) {
            if (winner === 'civ' && !R.mw[i]) R.delta[i] += PTS.civWin;
            if (winner === 'mw' && R.mw[i]) {
                if (how === 'survive' && R.alive[i]) R.delta[i] += PTS.survive;
                if (how === 'guess' && i !== guesser) R.delta[i] += PTS.mwMate;
            }
        });
        G.players.forEach(function (p, i) { p.score += R.delta[i]; });
        G.done++;
        var mwNames = G.players.filter(function (_, i) { return R.mw[i]; }).map(function (p) { return p.name; });
        var hows = {
            caught: 'Tutti i Mr. White sono stati smascherati e nessuno ha indovinato.',
            guess: 'Smascherato, ma ha indovinato il calciatore all\'ultimo respiro.',
            survive: 'Mr. White è sopravvissuto fino alla fine senza farsi scoprire.'
        };
        var more = !CFG.rounds || G.round < CFG.rounds;
        var sorted = G.players.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return b.p.score - a.p.score; });
        $('#rd-host').innerHTML =
            '<div class="result" data-stagger>' +
            '<div class="result__badge">' + QZ.icon(winner === 'civ' ? 'users' : 'spy') + '</div>' +
            '<span class="eyebrow">Fine ' + roundLabel() + '</span>' +
            '<h2 class="result__title">' + (winner === 'civ' ? 'Vincono i civili!' : 'Vince Mr. White!') + '</h2>' +
            '<p class="muted">' + hows[how] + '</p></div>' +
            '<div class="card card--tight row row--nowrap" style="--gap:14px">' + shirt(R.word) +
            '<div class="grow"><div class="small muted">Il calciatore era</div><div class="mw-name" style="font-size:22px">' + QZ.esc(R.word) + '</div>' +
            '<div class="small muted mt-1">' + (mwNames.length > 1 ? 'Mr. White erano: ' : 'Mr. White era: ') + '<b style="color:var(--text)">' + QZ.esc(mwNames.join(', ')) + '</b></div></div></div>' +
            '<div class="mw-standings">' + sorted.map(function (x, k) {
                var d = R.delta[x.i];
                return '<div class="team" style="--c:' + x.p.color + ';animation:qz-rise .45s var(--ease-out) both;animation-delay:' + (k * 60 + 200) + 'ms">' +
                    '<span class="team__dot"></span><span class="team__name">' + QZ.esc(x.p.name) + (R.mw[x.i] ? '<small>Mr. White</small>' : '') + '</span>' +
                    (d ? '<span class="mw-delta ' + (d > 0 ? 'mw-delta--up' : 'mw-delta--down') + '">' + (d > 0 ? '+' : '') + d + '</span>' : '') +
                    '<span class="team__score" data-score>' + QZ.fmt(x.p.score) + '</span></div>';
            }).join('') + '</div>' +
            '<div class="row row--center">' +
            (more ? '<button type="button" class="btn btn--primary btn--lg" id="rd-next">' + QZ.icon('play', 'ico-fill') + 'Prossimo round</button>' +
                '<button type="button" class="btn btn--ghost btn--lg" id="rd-end">' + QZ.icon('flag') + 'Termina qui</button>'
                : '<button type="button" class="btn btn--primary btn--lg" id="rd-end">' + QZ.icon('trophy') + 'Classifica finale</button>') +
            '</div>';
        QZ.show('s-round');
        if (winner === 'civ') { QZ.sound.win(); setTimeout(function () { QZ.fx.confetti({ count: 110 }); }, 300); }
        else { QZ.sound.reveal(); QZ.fx.flash('rgba(255,255,255,.6)'); }
        if ($('#rd-next')) $('#rd-next').addEventListener('click', newRound);
        $('#rd-end').addEventListener('click', finishGame);
        setTimeout(function () { var b = $('#rd-next') || $('#rd-end'); if (b) b.focus({ preventScroll: true }); }, 250);
    }

    /* ---------- Fine partita ---------- */
    function finishGame() {
        if (talk) { talk.destroy(); talk = null; }
        QZ.wake.off();
        if (!G || !G.done) { QZ.show('s-start'); return; }
        var sorted = G.players.slice().sort(function (a, b) { return b.score - a.score; });
        var top = sorted.filter(function (p) { return p.score === sorted[0].score; });
        var champ = top.map(function (p) { return p.name; }).join(' e ');
        var r = QZ.profile.record('mrwhite', { xp: 20 + G.done * 15 + G.stats.caught * 5, label: G.done + ' round · vince ' + champ });
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: top.length > 1 ? 'Pari in vetta!' : 'Vince ' + champ + '!',
            subtitle: top.length > 1 ? champ + ' chiudono a pari punti dopo ' + G.done + ' round.' : 'Il miglior detective (o il miglior bugiardo) dopo ' + G.done + ' round.',
            big: sorted[0].score, bigSuffix: ' pt',
            record: r,
            stats: [
                { label: 'Round giocati', value: G.done },
                { label: 'Mr. White smascherati', value: G.stats.caught },
                { label: 'Indovinati da Mr. White', value: G.stats.guessed },
                { label: 'Civili eliminati', value: G.stats.civOut }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(sorted.map(function (p) { return { name: p.name, score: p.score, color: p.color }; }), function (s) { return QZ.fmt(s) + ' pt'; }) + '</div>' +
                '<div class="row row--center mt-2"><button type="button" class="btn btn--ghost" id="end-setup">' + QZ.icon('users') + 'Cambia giocatori</button></div>',
            share: 'Partita a Mr. White su Quizzotti: ' + champ + ' ' + (top.length > 1 ? 'chiudono' : 'chiude') + ' in testa con ' + sorted[0].score + ' punti. Chi di voi sa bluffare meglio?',
            onRetry: startGame
        });
        $('#end-setup').addEventListener('click', function () { QZ.show('s-start'); });
    }

    /* ---------- Tastiera ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('button, a, [role="button"]'))) return;
        var scr = document.querySelector('.screen.is-active');
        if (!scr) return;
        var k = e.key;
        if (scr.id === 's-reveal' && (k === ' ' || k === 'Enter')) { e.preventDefault(); $('#rv-btn').click(); }
        else if (scr.id === 's-talk' && k === ' ') { e.preventDefault(); toggleTalk(); }
        else if (scr.id === 's-talk' && (k === 'v' || k === 'V')) { e.preventDefault(); openVote(); }
        else if (scr.id === 's-vote' && /^[1-9]$/.test(k)) {
            var b = QZ.$$('#vt-list button')[Number(k) - 1];
            if (b) { e.preventDefault(); b.click(); }
        }
    });
})();
