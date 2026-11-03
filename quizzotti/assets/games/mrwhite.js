/* ==========================================================================
   QUIZZOTTI v2 — Mr. White
   Dati: assets/db-mrwhite.js (`wordsList`: calciatori segreti). Le immagini di
   `playerImages` sono segnaposto finti: al loro posto una maglia disegnata.
   Il ruolo si accende sul maxischermo dello stadio: i civili vedono il
   calciatore con la sua maglia, Mr. White uno schermo senza segnale.
   Si vota su un tabellone a LED: chi e' fuori si spegne.
   Ordine di parola (Mr. White non parla mai per primo), eliminazione, ultimo
   tiro per Mr. White con risposta tollerante, piu' round con classifica,
   calciatori che non si ripetono tra le partite.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('mrwhite', wordsList.map(function (w) { return String(w).trim(); }));
    var CFG = Object.assign({ timer: 120, rounds: 5, hint: false, mw: 1 }, QZ.store.get('qz.mrwhite.cfg', {}) || {});
    var PTS = { civWin: 100, guess: 300, mwMate: 100, survive: 200, wrongGuess: -50 };
    var NUM = 'N° ' + String(QZ.GAMES.indexOf(QZ.game('mrwhite')) + 1).padStart(2, '0');

    var G = null;      // partita
    var R = null;      // round in corso
    var talk = null;   // timer della discussione
    var busy = false;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Accendi lo schermo' + QZ.icon('arrow');
    $('#medal').innerHTML = '<span class="mw-q" aria-hidden="true">?</span>';
    $('#rules').innerHTML = [
        ['Passatevi il telefono:', 'ognuno accende il maxischermo di nascosto e vede il calciatore segreto.'],
        ['Mr. White', 'trova lo schermo senza segnale: non sa chi è il calciatore e deve fare finta di saperlo.'],
        ['Una parola a testa', 'sul calciatore, poi si vota chi buttare fuori.'],
        ['Beccato?', 'Mr. White ha un ultimo tiro: se indovina il calciatore, la vince lui.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var played = QZ.profile.get().gamesPlayed.mrwhite;
    $('#start-record').textContent = played ? 'Su questo telefono: ' + played + (played === 1 ? ' partita giocata' : ' partite giocate') + '.' : '';

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
        { label: '3', value: 3 }, { label: '5', value: 5 }, { label: '8', value: 8 }, { label: 'Senza fine', value: 0 }
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
    function hash(s) {
        var h = 7;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    }

    /* La maglia del calciatore, un'icona piatta come sul maxischermo: colori e motivo
       (tinta unita, strisce, cerchi, due meta') dipendono dal nome, cosi' restano sempre
       gli stessi. Sul nero dello schermo la sagoma ha un filo di luce che la stacca. */
    var SHIRT = 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z';
    var KIT = ['#d9342b', '#2f5fc4', '#1f9d55', '#14181c', '#7d4fd0', '#f0b323', '#1d8fd1', '#9e2049', '#f2f4f5'];
    var shirtSeq = 0;
    function shirt(word) {
        var h = hash(word);
        var c1 = KIT[h % KIT.length];
        var c2 = KIT[(h >>> 4) % KIT.length];
        if (c2 === c1) c2 = c1 === '#f2f4f5' ? '#14181c' : '#f2f4f5';
        var kind = ['plain', 'stripes', 'hoops', 'half', 'stripes'][(h >>> 8) % 5];
        var id = 'mw-kit-' + (++shirtSeq);
        var deco = '';
        var k;
        if (kind === 'stripes') for (k = 3.2; k < 22; k += 4) deco += '<rect x="' + k + '" y="0" width="2" height="24"/>';
        if (kind === 'hoops') for (k = 6; k < 22; k += 4.4) deco += '<rect x="0" y="' + k + '" width="24" height="2.2"/>';
        if (kind === 'half') deco = '<rect x="12" y="0" width="12" height="24"/>';
        // il numero sulla schiena: le iniziali, nel colore che si legge meglio sulla tinta di fondo
        var ink = QZ.onColor(c1) === '#fbf6ec' ? '#fff' : '#0b0e11';
        return '<svg class="mw-shirt" viewBox="1 0.5 22 22.5" aria-hidden="true">' +
            '<defs><clipPath id="' + id + '"><path d="' + SHIRT + '"/></clipPath></defs>' +
            '<path d="' + SHIRT + '" fill="' + c1 + '"/>' +
            (deco ? '<g clip-path="url(#' + id + ')" fill="' + c2 + '">' + deco + '</g>' : '') +
            // ombra piatta sul fianco destro e colletto: volume senza contorni
            '<g clip-path="url(#' + id + ')"><rect x="15.5" y="0" width="9" height="24" fill="#000" opacity=".16"/></g>' +
            '<path d="M8 2a4 4 0 0 0 8 0" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".9"/>' +
            '<path d="' + SHIRT + '" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".35" stroke-linejoin="round"/>' +
            (kind === 'plain' || kind === 'hoops'
                ? '<text x="12" y="15.4" text-anchor="middle" fill="' + ink + '">' + QZ.esc(initials(word)) + '</text>'
                : '<rect x="6.9" y="10.3" width="10.2" height="6.4" rx=".7" fill="#0b0e11" opacity=".88"/><text x="12" y="15.4" text-anchor="middle" fill="#fff">' + QZ.esc(initials(word)) + '</text>') +
            '</svg>';
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
    /** La schermata e' quella in primo piano (non sta scorrendo via): niente doppi tocchi a cambio foglio. */
    function onScreen(id) {
        var el = document.getElementById(id);
        return el.classList.contains('is-active') && !el.classList.contains('is-leaving');
    }
    /** Testo semplice da un pezzo di HTML, per gli annunci. */
    function plain(html) {
        var d = document.createElement('div');
        d.innerHTML = String(html).replace(/></g, '> <');
        // fuori bottoni e disegni: si annuncia solo il messaggio
        QZ.$$('button, svg, [aria-hidden="true"]', d).forEach(function (x) { x.remove(); });
        return d.textContent.replace(/\s+/g, ' ').trim();
    }

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
        $('#rv-round').textContent = CFG.rounds ? pad(G.round) + '/' + pad(CFG.rounds) : pad(G.round);
        $('#rv-dots').innerHTML = R.order.map(function () { return '<i></i>'; }).join('');
        renderFront();
        QZ.show('s-reveal');
    }
    function pad(n) { return String(n).padStart(2, '0'); }

    /* ---------- Il maxischermo: carta 3D ---------- */
    // schermo spento: chi deve guardare, e la scritta per accenderlo
    function offHTML(kicker, p, foot, cls) {
        return '<div class="mw-screen mw-screen--off ' + (cls || '') + '">' +
            '<div class="mw-screen__bar"><span>MAXISCHERMO</span><b>' + NUM + '</b></div>' +
            '<div class="mw-screen__body"><span class="mw-screen__k">' + kicker + '</span>' + av(p, 'mw-av--xl') +
            '<div class="mw-name">' + QZ.esc(p.name) + '</div></div>' +
            '<div class="mw-screen__foot">' + foot + '</div></div>';
    }
    // nessun segnale: il retro di Mr. White (nel gioco e nel verdetto)
    function noSignalHTML(role, txt, foot) {
        return '<div class="mw-screen mw-screen--nosignal">' +
            '<div class="mw-screen__bar"><span>MAXISCHERMO</span><b style="color:var(--led-red)">NO SIGNAL</b></div>' +
            '<div class="mw-screen__body"><span class="mw-screen__nosig">NESSUN SEGNALE</span><span class="mw-screen__q">???</span>' +
            '<span class="mw-screen__role">' + role + '</span>' + txt + '</div>' +
            '<div class="mw-screen__foot">' + (foot || QZ.icon('eyeoff') + 'Il calciatore non lo vedi') + '</div></div>';
    }

    function renderFront() {
        var p = G.players[R.order[R.pos]];
        $('#rv-front').innerHTML = offHTML('Passa il telefono a', p, QZ.icon('eye') + 'Tocca per accendere lo schermo');
        $('#rv-front').setAttribute('aria-label', 'Schermo di ' + p.name + ': tocca per accenderlo');
        $('#rv-step').textContent = pad(R.pos + 1) + '/' + pad(R.order.length);
        $('#rv-hint').textContent = 'Guarda solo tu, ' + p.name + '.';
        $('#rv-btn').innerHTML = QZ.icon('eye') + 'Sono io: accendi';
        $('#rv-btn').setAttribute('aria-label', 'Sono ' + p.name + ': accendi lo schermo');
        QZ.$$('#rv-dots i').forEach(function (d, i) {
            d.className = i < R.pos ? 'is-done' : i === R.pos ? 'is-now' : '';
        });
        QZ.fx.replay($('#rv-front .mw-screen__body'), 'is-pop');
    }

    function secretHTML(p) {
        if (R.mw[p]) {
            return noSignalHTML('Sei Mr. White', CFG.hint
                ? '<span class="note">il cognome inizia per ' + QZ.esc(surnameInitial(R.word)) + '</span>'
                : '<p class="mw-screen__txt">Non sai chi è. Ascolta, bluffa, non farti beccare.' + (CFG.mw > 1 ? ' In campo siete in ' + CFG.mw + '.' : '') + '</p>');
        }
        return '<div class="mw-screen">' +
            '<div class="mw-screen__bar"><span>MAXISCHERMO</span><b>IN ONDA</b></div>' +
            '<div class="mw-screen__body"><span class="mw-screen__k">Il calciatore segreto</span>' + shirt(R.word) +
            '<div class="mw-screen__name">' + QZ.esc(R.word) + '</div></div>' +
            '<div class="mw-screen__foot" style="font-weight:600;font-size:15px">Descrivilo con una parola, senza regalarlo a Mr. White.</div>' +
            '</div>';
    }

    function flipCard() {
        if (busy || R.flipped) return;
        var i = R.order[R.pos];
        var back = $('#rv-back');
        back.className = 'flip__face flip__face--back mw-face ' + (R.mw[i] ? 'mw-face--spy' : 'mw-face--civ');
        back.innerHTML = secretHTML(i);
        back.setAttribute('aria-hidden', 'false');
        // lo schermo acceso esce dall'ordine del Tab: si spegne dal bottone sotto
        $('#rv-front').setAttribute('aria-hidden', 'true');
        $('#rv-front').setAttribute('tabindex', '-1');
        $('#rv-card').classList.add('is-flipped');
        R.flipped = true;
        // stesso suono e vibrazione per tutti i ruoli: chi ascolta non capisce nulla
        QZ.sound.whoosh();
        QZ.vibrate(30);
        var last = R.pos >= R.order.length - 1;
        $('#rv-btn').innerHTML = QZ.icon('eyeoff') + (last ? 'Spegni e si parte' : 'Spegni e passa');
        $('#rv-btn').removeAttribute('aria-label');
        // solo che lo schermo e' acceso: il contenuto non si legge ad alta voce a tutto il tavolo
        $('#rv-hint').textContent = 'Schermo acceso. Memorizza, poi spegnilo.';
        $('#rv-btn').focus({ preventScroll: true });
    }

    function hideCard() {
        if (busy || !R.flipped) return;
        busy = true;
        $('#rv-card').classList.remove('is-flipped');
        $('#rv-front').removeAttribute('aria-hidden');
        $('#rv-front').setAttribute('tabindex', '0');
        $('#rv-back').setAttribute('aria-hidden', 'true');
        QZ.sound.click();
        // il retro si svuota solo quando e' girato del tutto: il prossimo non vede nulla
        setTimeout(function () {
            $('#rv-back').innerHTML = '';
            $('#rv-back').className = 'flip__face flip__face--back mw-face';
            R.flipped = false;
            R.pos++;
            busy = false;
            if (R.pos < R.order.length) { renderFront(); QZ.say('Schermo spento. Passa il telefono a ' + G.players[R.order[R.pos]].name + '.'); }
            else startTalk();
        }, QZ.reducedMotion() ? 30 : 650);
    }

    // un doppio tocco accenderebbe e spegnerebbe lo schermo in un colpo (e passerebbe al prossimo
    // senza che nessuno l'abbia vista): tra un'azione e l'altra serve un attimo
    var lastTap = 0;
    function tapOk() {
        var now = performance.now();
        if (now - lastTap < 450) return false;
        lastTap = now;
        return true;
    }
    $('#rv-btn').addEventListener('click', function () {
        if (!onScreen('s-reveal') || !tapOk()) return;
        if (R.flipped) hideCard(); else flipCard();
    });
    $('#rv-front').addEventListener('click', function () { if (tapOk()) flipCard(); });
    $('#rv-front').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (tapOk()) flipCard(); }
    });
    $('#rv-back').addEventListener('click', function () { if (tapOk()) hideCard(); });

    /* ---------- Si parla ---------- */
    $('#tk-quit').innerHTML = QZ.icon('x');
    $('#tk-reset').innerHTML = QZ.icon('refresh') + 'Azzera';
    $('#tk-vote').innerHTML = QZ.icon('target') + 'Si vota';
    $('#vt-back').innerHTML = QZ.icon('back') + 'Torna a parlare';

    function startTalk() {
        R.turn++;
        $('#tk-round').textContent = $('#rv-round').textContent;
        $('#tk-turn').textContent = pad(R.turn);
        $('#tk-alive').textContent = pad(alive().length) + '/' + pad(G.players.length);
        $('#tk-eyebrow').innerHTML = QZ.icon('message') + 'Si parla';
        // il primo a parlare e' sempre un civile scelto a caso, poi si segue il giro
        var seat = alive();
        var first = seat.indexOf(QZ.pick(alive(false)));
        var order = seat.slice(first).concat(seat.slice(0, first));
        $('#tk-order').innerHTML = order.map(function (i, k) {
            var p = G.players[i];
            return '<li style="--i:' + k + '">' + av(p) + '<span class="grow">' + QZ.esc(p.name) + '</span>' + (k === 0 ? '<span class="note">comincia tu</span>' : '') + '</li>';
        }).join('');

        if (talk) talk.destroy();
        var host = $('#tk-timer');
        if (CFG.timer) {
            host.innerHTML = QZ.ringHTML('timer-ring--xl');
            talk = new QZ.Timer({
                seconds: CFG.timer, ring: QZ.ring(host.firstChild),
                onSecond: function (s) {
                    if (s <= 5 && s > 0) QZ.sound.tick();
                    if (s === 10) QZ.say('Ultimi 10 secondi.');
                },
                onExpire: function () {
                    QZ.sound.whistle();
                    QZ.vibrate([120, 60, 120]);
                    QZ.toast('Tempo. Si vota.', { icon: 'whistle' });
                    QZ.fx.pop($('#tk-vote'));
                    paintToggle();
                }
            });
        } else {
            host.innerHTML = '<div class="mw-clock" role="timer" aria-label="Cronometro">00:00</div>';
            talk = new Stopwatch(host.firstChild);
        }
        paintToggle();
        QZ.say(roundLabel() + ', giro ' + R.turn + '. Comincia a parlare ' + G.players[order[0]].name + '.');
        QZ.show('s-talk');
        setTimeout(function () {
            if (onScreen('s-talk') && talk && !document.hidden) { talk.start(); paintToggle(); }
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
    Stopwatch.prototype.destroy = function () { this.pause(); this.autoPaused = false; };
    // come QZ.Timer: telefono in tasca o app cambiata, il cronometro si ferma e riparte al ritorno
    document.addEventListener('visibilitychange', function () {
        if (!(talk instanceof Stopwatch)) return;
        if (document.hidden && talk.running) { talk.pause(); talk.autoPaused = true; }
        else if (!document.hidden && talk.autoPaused) { talk.autoPaused = false; talk.start(); }
    });

    function paintToggle() {
        var on = talk && talk.running;
        $('#tk-toggle').innerHTML = QZ.icon(on ? 'pause' : 'play') + (on ? 'Pausa' : 'Via');
    }
    function toggleTalk() {
        if (!talk) return;
        if (talk.running) talk.pause();
        else { if (talk.remaining === 0) talk.reset(); talk.start(); }
        paintToggle();
    }
    $('#tk-toggle').addEventListener('click', toggleTalk);
    $('#tk-reset').addEventListener('click', function () { if (talk) { talk.reset(); paintToggle(); } });
    $('#tk-vote').addEventListener('click', function () { if (onScreen('s-talk')) openVote(); });
    $('#tk-quit').addEventListener('click', function () {
        if (!onScreen('s-talk')) return;
        if (talk) talk.pause();
        paintToggle();
        QZ.confirm('Il round in corso non conta. Si va dritti alla classifica.', { title: 'Chiudere qui?', okLabel: 'Chiudi', cancelLabel: 'Si continua', danger: true }).then(function (ok) {
            if (ok) finishGame();
        });
    });

    /* ---------- Votazione: il tabellone dei nomi ---------- */
    function openVote() {
        if (talk) { talk.pause(); paintToggle(); }
        $('#vt-eyebrow').innerHTML = QZ.icon('target') + roundLabel();
        var n = 0;
        $('#vt-list').innerHTML =
            '<div class="mw-ballot__head"><span>Chi va fuori</span><span>Giro <b>' + pad(R.turn) + '</b></span></div>' +
            G.players.map(function (p, i) {
                var out = !R.alive[i];
                if (!out) n++;
                return '<button type="button" class="mw-ballot__row" data-i="' + i + '"' + (out ? ' disabled' : ' data-n="' + n + '"') + '>' +
                    '<span class="mw-ballot__n">' + (out ? '' : n) + '</span>' + av(p) +
                    '<span class="mw-ballot__name">' + QZ.esc(p.name) + '</span>' +
                    (out ? '<span class="mw-ballot__out">FUORI</span>' : '') +
                    '<span class="mw-ballot__box" aria-hidden="true"></span></button>';
            }).join('');
        QZ.$$('#vt-list .mw-ballot__row:not(:disabled)').forEach(function (b) {
            b.setAttribute('aria-label', 'Vota ' + G.players[Number(b.dataset.i)].name);
            b.addEventListener('click', function () { vote(Number(b.dataset.i), b); });
        });
        QZ.sound.whoosh();
        QZ.show('s-vote');
    }
    $('#vt-back').addEventListener('click', function () { if (onScreen('s-vote')) QZ.show('s-talk'); });

    function vote(i, row) {
        if (busy || !onScreen('s-vote') || !R.alive[i]) return;
        busy = true;
        var p = G.players[i];
        var box = row.querySelector('.mw-ballot__box');
        row.classList.add('is-picked');
        QZ.fx.mark(box, 'cross', 'var(--led-red)');
        QZ.sound.pop();
        setTimeout(function () {
            QZ.confirm('Il suo schermo si accende davanti a tutti. Niente ripensamenti.', { title: 'Fuori ' + p.name + '?', okLabel: 'Fuori', cancelLabel: 'Aspetta' }).then(function (ok) {
                busy = false;
                if (ok) eliminate(i);
                else { row.classList.remove('is-picked'); QZ.$$('.qz-mark', box).forEach(function (m) { m.remove(); }); }
            });
        }, QZ.reducedMotion() ? 0 : 750);
    }

    /* ---------- Verdetto con suspense ---------- */
    function eliminate(i) {
        var p = G.players[i];
        var isMW = R.mw[i];
        R.alive[i] = false;
        $('#vd-card').classList.remove('is-flipped');
        $('#vd-front').innerHTML = offHTML('Sul maxischermo', p, '<span>era…</span>', 'mw-screen--verdict');
        var back = $('#vd-back');
        back.className = 'flip__face flip__face--back mw-face ' + (isMW ? 'mw-face--spy' : 'mw-face--out');
        // il retro (l'esito) resta muto finche' la carta non si gira
        back.setAttribute('aria-hidden', 'true');
        $('#vd-front').removeAttribute('aria-hidden');
        back.innerHTML = isMW
            ? noSignalHTML('Mr. White', '<p class="mw-screen__txt">' + QZ.esc(p.name) + ' non sapeva niente. Ma ha ancora un tiro.</p>', QZ.icon('target') + 'Ultimo tiro in arrivo')
            : '<div class="mw-screen"><div class="mw-screen__bar"><span>MAXISCHERMO</span><b>IN ONDA</b></div>' +
                '<div class="mw-screen__body"><span class="mw-screen__k">Uno dei vostri</span>' + av(p, 'mw-av--xl') +
                '<div class="mw-screen__name">' + QZ.esc(p.name) + '</div><p class="mw-screen__txt">Avete buttato fuori un innocente.</p></div>' +
                '<div class="mw-screen__foot">' + QZ.icon('users') + 'Sapeva chi era il calciatore</div></div>';
        $('#vd-panel').innerHTML = '';
        QZ.say('Fuori ' + p.name + '. Si accende il suo schermo…');
        QZ.show('s-verdict');
        // rullo di tamburi che accelera, poi lo schermo si accende e si illumina la scritta
        var beats = QZ.reducedMotion() ? 0 : 7;
        for (var b = 0; b < beats; b++) setTimeout(QZ.sound.tock, 300 + 900 * (1 - Math.pow(1 - b / beats, 1.6)));
        setTimeout(function () {
            $('#vd-card').classList.add('is-flipped');
            back.setAttribute('aria-hidden', 'false');
            $('#vd-front').setAttribute('aria-hidden', 'true');
            if (isMW) {
                G.stats.caught++;
                QZ.sound.reveal();
                QZ.vibrate([60, 40, 160]);
                setTimeout(function () { QZ.fx.stamp(back.querySelector('.mw-screen__body'), 'Smascherato', 'ok', { size: 34, y: 46, say: false }); }, 550);
                setTimeout(function () { guessPanel(i); }, 900);
            } else {
                G.stats.civOut++;
                QZ.sound.wrong();
                QZ.vibrate([60, 40, 60]);
                setTimeout(function () { QZ.fx.stamp(back.querySelector('.mw-screen__body'), 'Innocente', 'bad', { size: 34, y: 46, say: false }); }, 550);
                setTimeout(function () { afterCivilian(p.name); }, 900);
            }
        }, beats ? 1350 : 200);
    }

    function afterCivilian(name) {
        var mwLeft = alive(true).length, civLeft = alive(false).length;
        var lead = name + ' era innocente. ';
        if (mwLeft >= civLeft) {
            panel('<p class="mw-msg center">Ora i Mr. White sono quanti voi. Partita chiusa: l\'hanno fatta franca.</p>', 'Vedi il round', function () { endRound('mw', 'survive'); }, lead);
        } else {
            panel('<p class="mw-msg center">' + (mwLeft > 1 ? 'Ci sono ancora ' + mwLeft + ' Mr. White' : 'Mr. White è ancora') + ' in campo. Altro giro di parole.</p>', 'Altro giro', startTalk, lead);
        }
    }

    // lead: l'esito da annunciare prima del messaggio (la scritta LED e' solo per gli occhi)
    function panel(html, label, fn, lead) {
        var host = $('#vd-panel');
        host.innerHTML = html + '<button type="button" class="btn btn--primary btn--lg btn--block" data-next>' + QZ.icon('arrow') + '<span></span></button>';
        host.querySelector('[data-next] span').textContent = label;
        var btn = host.querySelector('[data-next]');
        btn.addEventListener('click', fn, { once: true });
        QZ.say((lead || '') + plain(html));
        QZ.fx.replay(host.firstElementChild);
        setTimeout(function () { btn.focus({ preventScroll: true }); }, 60);
    }

    function guessPanel(i) {
        var p = G.players[i];
        var host = $('#vd-panel');
        host.innerHTML =
            '<form class="card mw-guess" id="vd-form" autocomplete="off">' +
            '<label class="label" for="vd-input">Ultimo tiro per ' + QZ.esc(p.name) + ': chi è il calciatore?</label>' +
            '<div class="mw-guess__row"><input class="input" id="vd-input" maxlength="40" placeholder="Nome o cognome" autocapitalize="words" spellcheck="false" enterkeyhint="go">' +
            '<button class="btn btn--primary" type="submit">' + QZ.icon('ball') + 'Tira</button></div>' +
            '<button class="btn btn--ghost btn--sm" type="button" id="vd-giveup">Non lo so, bandiera bianca</button></form>';
        var form = $('#vd-form'), input = $('#vd-input');
        QZ.say(p.name + ' era Mr. White: smascherato. Ultimo tiro: deve indovinare il calciatore.');
        setTimeout(function () { input.focus({ preventScroll: true }); }, 80);
        var shot = false;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (shot) return;
            if (!input.value.trim()) { QZ.fx.shake(input); return; }
            shot = true;
            judge(i, isRight(input.value, R.word), input.value.trim());
        });
        $('#vd-giveup').addEventListener('click', function () { if (shot) return; shot = true; judge(i, false, ''); });
    }

    function judge(i, ok, said) {
        var p = G.players[i];
        if (ok) {
            G.stats.guessed++;
            R.delta[i] += PTS.guess;
            QZ.sound.correct();
            panel('<div class="card mw-solution">' + shirt(R.word) +
                '<p class="mw-msg grow"><b>' + QZ.esc(p.name) + '</b> ci ha preso: era <b>' + QZ.esc(R.word) + '</b>. Che faccia tosta.</p></div>',
                'Vedi il round', function () { endRound('mw', 'guess', i); }, 'Gol! ');
            QZ.fx.stamp($('#vd-panel .mw-solution'), 'Gol!', 'bad', { size: 26, x: 80, y: 0, say: false });
            return;
        }
        R.delta[i] += PTS.wrongGuess;
        QZ.sound.buzzer();
        QZ.fx.shake($('#vd-panel'));
        var mwLeft = alive(true).length;
        // se restano altri Mr. White il calciatore non si svela ancora
        var msg = said ? '«' + QZ.esc(said) + '»: fuori dallo specchio.' : QZ.esc(p.name) + ' alza bandiera bianca.';
        var override = said ? '<button type="button" class="btn btn--ghost btn--sm" id="vd-override">' + QZ.icon('check') + 'Era giusta, decide il gruppo</button>' : '';
        var next = mwLeft === 0
            ? function () { endRound('civ', 'caught'); }
            : function () { afterWrongWithMates(); };
        panel('<div class="card center stack" style="--gap:10px;align-items:center"><span class="note" style="color:var(--led-red)">' + QZ.fmt(PTS.wrongGuess) + ' punti</span><p class="mw-msg">' + msg + '</p>' + override + '</div>',
            mwLeft === 0 ? 'Vedi il round' : 'Avanti', next);
        var ov = $('#vd-override');
        if (ov) ov.addEventListener('click', function () {
            if (ov.disabled) return;
            ov.disabled = true;
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
            caught: ['Smascherato', 'Beccati tutti, e nessuno ha indovinato il calciatore.'],
            guess: ['Colpo di scena', 'Beccato, ma all\'ultimo tiro ha indovinato il calciatore.'],
            survive: ['L\'ha fatta franca', 'Nessuno se n\'è accorto in tempo. Bluff da manuale.']
        };
        var more = !CFG.rounds || G.round < CFG.rounds;
        var sorted = G.players.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return b.p.score - a.p.score; });
        $('#rd-host').innerHTML =
            '<div class="result" data-stagger>' +
            '<span class="eyebrow">Fine ' + roundLabel() + '</span>' +
            '<h2 class="result__title">' + (winner === 'civ' ? 'Vincono i civili' : 'Vince Mr. White') + '</h2>' +
            '<p class="muted result__sub">' + hows[how][1] + '</p></div>' +
            '<div class="card card--tight mw-solution" id="rd-sol">' + shirt(R.word) +
            '<div class="grow"><div class="mw-solution__k">Il calciatore era</div><div class="mw-name">' + QZ.esc(R.word) + '</div>' +
            '<div class="mt-1">' + (mwNames.length > 1 ? 'I Mr. White: ' : 'Mr. White: ') + '<b>' + QZ.esc(mwNames.join(', ')) + '</b></div></div></div>' +
            '<div class="mw-standings" style="margin-top:6px">' + sorted.map(function (x, k) {
                var d = R.delta[x.i];
                return '<div class="team" style="--c:' + x.p.color + ';animation:qz-rise .35s var(--ease-out) both;animation-delay:' + (k * 60 + 200) + 'ms">' +
                    '<span class="team__dot"></span><span class="team__name">' + QZ.esc(x.p.name) + (R.mw[x.i] ? '<small>era Mr. White</small>' : '') + '</span>' +
                    (d ? '<span class="mw-delta ' + (d > 0 ? 'mw-delta--up' : 'mw-delta--down') + '">' + (d > 0 ? '+' : '') + d + '</span>' : '') +
                    '<span class="team__score">' + QZ.fmt(x.p.score) + '</span></div>';
            }).join('') + '</div>' +
            '<div class="result__actions" style="margin-top:4px">' +
            (more ? '<button type="button" class="btn btn--primary btn--lg" id="rd-next">' + QZ.icon('play', 'ico-fill') + 'Prossimo round</button>' +
                '<button type="button" class="btn btn--ghost btn--lg" id="rd-end">' + QZ.icon('flag') + 'Chiudi qui</button>'
                : '<button type="button" class="btn btn--primary btn--lg" id="rd-end">' + QZ.icon('trophy') + 'Classifica finale</button>') +
            '</div>';
        QZ.show('s-round');
        setTimeout(function () {
            // la scritta LED sul bordo basso del riquadro, senza coprire il nome
            QZ.fx.stamp($('#rd-sol'), hows[how][0], winner === 'civ' ? 'ok' : 'bad', { size: 22, x: 58, y: 100, say: false });
        }, QZ.reducedMotion() ? 0 : 650);
        if (winner === 'civ') { QZ.sound.win(); setTimeout(function () { QZ.fx.confetti({ count: 100 }); }, 300); }
        else QZ.sound.reveal();
        QZ.say((winner === 'civ' ? 'Vincono i civili. ' : 'Vince Mr. White. ') + hows[how][1] + ' Il calciatore era ' + R.word + '.');
        // un tocco solo: il doppio tap non deve saltare un round o registrare due volte la partita
        var leaving = false;
        var once = function (fn) { return function () { if (leaving) return; leaving = true; fn(); }; };
        if ($('#rd-next')) $('#rd-next').addEventListener('click', once(newRound));
        $('#rd-end').addEventListener('click', once(finishGame));
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
            title: top.length > 1 ? 'Pari in vetta' : 'Vince ' + champ,
            subtitle: top.length > 1 ? champ + ' chiudono a pari punti dopo ' + G.done + ' round.' : 'Il miglior segugio, o il miglior bugiardo. Dopo ' + G.done + ' round non si discute.',
            big: sorted[0].score, bigSuffix: ' pt',
            record: r,
            // il voto in pagella al vincitore: 150 punti a round sono una media da campione
            ratio: QZ.clamp(sorted[0].score / (G.done * 150), 0, 1),
            stats: [
                { label: 'Round giocati', value: G.done },
                { label: 'Mr. White beccati', value: G.stats.caught },
                { label: 'Indovinati all\'ultimo', value: G.stats.guessed },
                { label: 'Innocenti fuori', value: G.stats.civOut }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(sorted.map(function (p) { return { name: p.name, score: p.score, color: p.color }; }), function (s) { return QZ.fmt(s) + ' pt'; }) + '</div>',
            share: 'Partita a Mr. White su Quizzotti: ' + champ + ' ' + (top.length > 1 ? 'chiudono' : 'chiude') + ' in testa con ' + sorted[0].score + ' punti. Chi di voi bluffa meglio?',
            onRetry: startGame,
            secondary: { label: 'Cambia giocatori', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }

    /* ---------- Tastiera ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        var scr = document.querySelector('.screen.is-active');
        if (!scr) return;
        var k = e.key;
        // Spazio e Invio su un bottone fanno il loro mestiere; le lettere e i numeri valgono ovunque
        if ((k === ' ' || k === 'Enter') && t && t.closest && t.closest('button, a, [role="button"]')) return;
        if (scr.id === 's-reveal' && (k === ' ' || k === 'Enter')) { e.preventDefault(); $('#rv-btn').click(); }
        else if (scr.id === 's-talk' && k === ' ') { e.preventDefault(); toggleTalk(); }
        else if (scr.id === 's-talk' && (k === 'v' || k === 'V')) { e.preventDefault(); openVote(); }
        else if (scr.id === 's-vote' && /^[1-9]$/.test(k)) {
            var b = $('#vt-list [data-n="' + k + '"]');
            if (b) { e.preventDefault(); b.click(); }
        }
    });
})();
