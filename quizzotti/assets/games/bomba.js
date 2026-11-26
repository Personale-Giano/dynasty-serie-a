/* ==========================================================================
   QUIZZOTTI v2 — Bomba
   Dati: assets/db-bomba.js (`topics`: { categoria, topic }).
   Si vede chi ha la bomba e si passa con un tasto, miccia nascosta con
   ticchettio che accelera, pausa, scelta delle categorie, modalita' a punti
   o a eliminazione, temi senza ripetizioni. La bomba sta sotto i riflettori:
   sfera scura con il filo di luce del faro, miccia con la scintilla vera,
   battito a LED rossi che accelera. Lo scoppio e' un BOOM a LED a tutto schermo.
   La durata vera della miccia non si vede mai: quella disegnata brucia al
   ritmo della durata massima. Cambiare tema non ferma la miccia (altrimenti
   chi ce l'ha in mano quando scotta si salverebbe premendo «Tema»).
   La partita si salva all'inizio di ogni round: se la pagina si ricarica (o
   si preme Indietro) si riprende dal round in corso. I record del telefono
   (scoppio piu' rapido, miccia piu' lunga, giro piu' lungo) restano salvati.
   Ogni tema ha una difficolta' (diff 1-3 in db-bomba.js): nelle impostazioni
   si sceglie se pescare tra facili e medi (predefinito), tra tutti o solo tra
   i difficili. «Contestata» ripassa la bomba a chi l'ha appena passata, quando
   la sua risposta era gia' stata detta o era sbagliata.
   La logica pura sta in `core` ed e' esportata per i test con Node.
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- Logica pura (testata con Node) ---------- */
    var FUSES = { short: [15, 40], mid: [30, 90], long: [60, 120] };   // secondi (v1: 30-90)
    var ROUNDS = [5, 10, 15];
    // difficolta' dei temi ammesse per livello scelto
    var LEVELS = { easy: [1, 2], all: [1, 2, 3], hard: [3] };
    var SAVE_TTL = 12 * 3600 * 1000;   // una partita lasciata a meta' vale fino a 12 ore

    /** Impostazioni lette dalla memoria: valori vecchi o rovinati tornano ai predefiniti. */
    function normCfg(raw, cats) {
        raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        var c = {
            mode: raw.mode === 'elim' ? 'elim' : 'points',
            rounds: ROUNDS.indexOf(Number(raw.rounds)) >= 0 ? Number(raw.rounds) : 10,
            fuse: Object.prototype.hasOwnProperty.call(FUSES, raw.fuse) ? raw.fuse : 'mid',
            level: Object.prototype.hasOwnProperty.call(LEVELS, raw.level) ? raw.level : 'easy',
            cats: null
        };
        if (Array.isArray(raw.cats) && cats) {
            var ok = raw.cats.filter(function (x, i) { return cats.indexOf(x) >= 0 && raw.cats.indexOf(x) === i; });
            c.cats = ok.length && ok.length < cats.length ? ok : null;
        }
        return c;
    }

    /** Il tema va bene per il livello scelto? Un tema senza diff vale come medio. */
    function levelOk(t, level) {
        var d = t && [1, 2, 3].indexOf(t.diff) >= 0 ? t.diff : 2;
        return (LEVELS[level] || LEVELS.easy).indexOf(d) >= 0;
    }

    /** Contestata: la bomba torna a chi l'ha passata per ultimo (-1 se nessuno l'ha ancora passata). */
    function contestTo(hist) { return Array.isArray(hist) && hist.length ? hist[hist.length - 1] : -1; }

    /** Nomi uguali (anche con maiuscole diverse) diventano "Luca", "Luca 2"... senza scontrarsi con un "Luca 2" vero. */
    function dedupeNames(names) {
        var key = function (x) { return String(x).trim().toLowerCase(); };
        var taken = {}, count = {};
        names.forEach(function (n) { taken[key(n)] = true; });
        var used = {};
        return names.map(function (n) {
            var k = key(n);
            if (!used[k]) { used[k] = true; return n; }
            var i = count[k] || 1, out;
            do { i++; out = n + ' ' + i; } while (taken[key(out)] || used[key(out)]);
            count[k] = i;
            used[key(out)] = true;
            return out;
        });
    }

    /** Quanto scotta la bomba (0-1): meta' miccia disegnata, meta' miccia vera. */
    function heat(elapsed, max, fuse) {
        return Math.min(1, Math.max(0, 0.5 * (elapsed / max) + 0.5 * (elapsed / fuse)));
    }

    /** Millisecondi tra un tic e l'altro: da quasi un secondo a 110 ms quando scotta. */
    function interval(q, rnd) {
        var r = rnd == null ? Math.random() : rnd;
        return Math.max(110, 900 - 790 * Math.pow(Math.min(1, Math.max(0, q)), 1.25)) * (0.9 + r * 0.2);
    }

    /**
     * Classifica finale. A punti: piu' punti, a parita' meno scoppi in mano.
     * A eliminazione: chi e' ancora in piedi, poi chi e' saltato piu' tardi.
     * `v` e' il valore che decide il primo posto (chi ha lo stesso `v` del primo e' a pari merito).
     */
    function ranking(players, mode) {
        var rows = players.map(function (p, i) { return { p: p, i: i }; });
        if (mode === 'points') {
            rows.sort(function (a, b) { return (b.p.score - a.p.score) || ((a.p.booms || 0) - (b.p.booms || 0)) || (a.i - b.i); });
            return rows.map(function (x) {
                return { name: x.p.name, color: x.p.color, score: x.p.score + ' pt', v: x.p.score * 1000 - (x.p.booms || 0), booms: x.p.booms || 0 };
            });
        }
        var key = function (p) { return p.out ? p.outRound : 1e6; };
        rows.sort(function (a, b) { return (key(b.p) - key(a.p)) || (a.i - b.i); });
        return rows.map(function (x) {
            return { name: x.p.name, color: x.p.color, score: '', sub: x.p.out ? 'saltato al ' + x.p.outRound + '° round' : 'ultimo in piedi', v: key(x.p), booms: x.p.booms || 0 };
        });
    }

    /** Una partita salvata e' buona se e' recente e coerente; altrimenti null. */
    function validSave(s, now, cats) {
        if (!s || typeof s !== 'object' || s.v !== 1 || !s.G || !Array.isArray(s.G.players)) return null;
        if (!(now - Number(s.t) < SAVE_TTL) || Number(s.t) > now + 60000) return null;
        var G = s.G, n = G.players.length;
        if (n < 2 || n > 12) return null;
        var bad = G.players.some(function (p) { return !p || typeof p.name !== 'string' || !p.name || typeof p.score !== 'number'; });
        if (bad || !(G.round >= 1) || !(G.holder >= 0 && G.holder < n) || G.players[G.holder].out) return null;
        var cfg = normCfg(s.cfg, cats);
        var alive = G.players.filter(function (p) { return !p.out; }).length;
        if (cfg.mode === 'elim' ? alive < 2 : G.round > cfg.rounds) return null;
        return { cfg: cfg, G: G };
    }

    /** Record del telefono aggiornati con un round appena scoppiato. Torna anche quali sono nuovi. */
    function updateStats(st, elapsed, passes) {
        st = st && typeof st === 'object' ? st : {};
        var out = { fastest: Number(st.fastest) > 0 ? Number(st.fastest) : 0, longest: Number(st.longest) > 0 ? Number(st.longest) : 0, bestRun: Number(st.bestRun) > 0 ? Number(st.bestRun) : 0, rounds: Number(st.rounds) > 0 ? Number(st.rounds) : 0 };
        var fresh = [];
        // un "record" su un round solo non e' un record: si annuncia dal secondo round in poi
        var first = out.rounds === 0;
        out.rounds++;
        // i tempi si mostrano al decimo di secondo: un record "battuto" di pochi millesimi non si annuncia
        var tenth = function (ms) { return Math.round(ms / 100); };
        if (!out.fastest || elapsed < out.fastest) { if (!first && tenth(elapsed) < tenth(out.fastest)) fresh.push('fastest'); out.fastest = elapsed; }
        if (elapsed > out.longest) { if (!first && tenth(elapsed) > tenth(out.longest)) fresh.push('longest'); out.longest = elapsed; }
        if (passes > out.bestRun) { if (!first) fresh.push('bestRun'); out.bestRun = passes; }
        return { stats: out, fresh: fresh };
    }

    function secs(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    var core = { FUSES: FUSES, ROUNDS: ROUNDS, LEVELS: LEVELS, SAVE_TTL: SAVE_TTL, normCfg: normCfg, levelOk: levelOk, contestTo: contestTo, dedupeNames: dedupeNames, heat: heat, interval: interval, ranking: ranking, validSave: validSave, updateStats: updateStats, secs: secs };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Da qui in giu' solo browser
       ====================================================================== */
    var $ = QZ.$;
    var SAVE_KEY = 'qz.bomba.save', STATS_KEY = 'qz.bomba.stats', CFG_KEY = 'qz.bomba.cfg';
    var deck = new QZ.Deck('bomba', topics, function (t) { return t.topic; });
    var CATS = [];
    topics.forEach(function (t) { if (CATS.indexOf(t.categoria) < 0) CATS.push(t.categoria); });
    var CFG = normCfg(QZ.store.get(CFG_KEY, {}), CATS);

    var G = null;   // partita
    var S = {};     // round in corso
    var lastStart = 0;
    var fuseEl = $('#fuse'), fuseInk = $('#fuse-ink'), sparkEl = $('#spark'), stage = $('#stage'), game = $('#game'), sb = $('#sb');
    var fuseLen = fuseEl.getTotalLength();

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('bomb');
    $('#rules').innerHTML = [
        ['Esce un tema', 'di calcio: giocatori di una squadra, stadi, allenatori…'],
        ['Dici una cosa valida,', 'premi «Passa» e molla il telefono al vicino.'],
        ['Niente doppioni:', 'una risposta già detta o sbagliata non vale. Chi la sente preme «Contestata» e la bomba torna indietro, a chi l\'ha passata.'],
        ['La miccia è nascosta:', 'nessuno sa quando scoppia. Chi ce l\'ha in mano perde il round.'],
        ['Tema impossibile?', 'Si può cambiare, ma la miccia non si ferma: chi ce l\'ha resta in ballo.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    var players = QZ.playerList($('#players-host'), { key: 'bomba', min: 2, max: 12, initial: 3, label: 'Giocatore', title: 'Giocatori (2-12)' });

    var MODE_DESC = {
        points: 'Quando scoppia, tutti gli altri prendono un punto. Vince chi ne ha di più alla fine.',
        elim: 'Chi resta con la bomba in mano è fuori. L\'ultimo in piedi vince.'
    };
    var LEVEL_DESC = {
        easy: 'Temi facili e medi: tante risposte che vengono in mente a tutti.',
        all: 'Tutti i temi, anche quelli da esperti (stadi della Ligue 1, giocatori dell\'Athletic Bilbao...).',
        hard: 'Solo temi difficili: per chi il calcio lo mastica tutti i giorni.'
    };
    var FUSE_DESC = {
        short: 'Da 15 a 40 secondi: si parla poco e si passa tanto.',
        mid: 'Da 30 a 90 secondi: la miccia classica.',
        long: 'Da 1 a 2 minuti: temi difficili e nervi lunghi.'
    };
    // ricostruiti anche quando si riprende una partita salvata con altre impostazioni
    function paintOptions() {
        QZ.segmented($('#opt-mode'), [{ label: 'A punti', value: 'points' }, { label: 'Eliminazione', value: 'elim' }], CFG.mode, function (v) {
            CFG.mode = v; saveCfg(); paintMode();
        });
        QZ.segmented($('#opt-rounds'), ROUNDS.map(function (n) { return { label: String(n), value: n }; }), CFG.rounds, function (v) { CFG.rounds = v; saveCfg(); });
        QZ.segmented($('#opt-fuse'), [{ label: 'Corta', value: 'short' }, { label: 'Media', value: 'mid' }, { label: 'Lunga', value: 'long' }], CFG.fuse, function (v) { CFG.fuse = v; saveCfg(); paintFuse(); });
        QZ.segmented($('#opt-level'), [{ label: 'Facili e medi', value: 'easy' }, { label: 'Tutti', value: 'all' }, { label: 'Difficili', value: 'hard' }], CFG.level, function (v) {
            CFG.level = v; saveCfg(); paintLevel(); paintCats();
        });
        paintMode();
        paintFuse();
        paintLevel();
    }
    function paintLevel() { $('#level-desc').textContent = LEVEL_DESC[CFG.level]; }
    function paintMode() {
        $('#mode-desc').textContent = MODE_DESC[CFG.mode];
        $('#rounds-wrap').hidden = CFG.mode !== 'points';
    }
    function paintFuse() { $('#fuse-desc').textContent = FUSE_DESC[CFG.fuse]; }
    paintOptions();

    // categorie: tutte attive di default, almeno una sempre selezionata
    var sel = new Set(CFG.cats || CATS);
    $('#cats-ico').innerHTML = QZ.icon('right');
    $('#cats').innerHTML = '<button type="button" data-all>Tutti</button>' + CATS.map(function (c) {
        return '<button type="button" data-cat="' + QZ.esc(c) + '">' + QZ.esc(c) + ' <span></span></button>';
    }).join('');
    $('#cats').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-all')) {
            if (sel.size === CATS.length) { sel = new Set([CATS[0]]); } else CATS.forEach(function (c) { sel.add(c); });
        } else {
            var c = b.getAttribute('data-cat');
            if (sel.has(c)) {
                if (sel.size === 1) { QZ.toast('Almeno un tema ci vuole', { icon: 'info' }); return; }
                sel.delete(c);
            } else sel.add(c);
        }
        QZ.sound.click();
        CFG.cats = sel.size === CATS.length ? null : Array.from(sel);
        saveCfg();
        paintCats();
    });
    function poolSize() { return topics.filter(function (t) { return sel.has(t.categoria) && levelOk(t, CFG.level); }).length; }
    function paintCats() {
        // accanto a ogni categoria quanti temi ci sono al livello scelto
        QZ.$$('#cats [data-cat]').forEach(function (b) {
            var c = b.getAttribute('data-cat');
            b.querySelector('span').textContent = topics.filter(function (t) { return t.categoria === c && levelOk(t, CFG.level); }).length;
        });
        QZ.$$('#cats [data-cat]').forEach(function (b) { b.setAttribute('aria-pressed', String(sel.has(b.getAttribute('data-cat')))); });
        $('#cats [data-all]').setAttribute('aria-pressed', String(sel.size === CATS.length));
        $('#cats-label').textContent = (sel.size === CATS.length ? 'Temi: tutte le ' + CATS.length + ' categorie' : 'Temi: ' + sel.size + ' categori' + (sel.size === 1 ? 'a' : 'e') + ' su ' + CATS.length) + ' · ' + poolSize() + ' temi';
    }
    paintCats();
    function saveCfg() { QZ.store.set(CFG_KEY, CFG); }

    /* ---------- Record del telefono e partita in sospeso ---------- */
    function paintRecord() {
        var played = QZ.profile.get().gamesPlayed.bomba;
        var st = QZ.store.get(STATS_KEY, null) || {};
        var bits = [];
        if (played) bits.push(plural(played, 'partita giocata', 'partite giocate'));
        if (st.fastest > 0) bits.push('scoppio più rapido ' + secs(st.fastest));
        if (st.longest > 0 && st.rounds > 1) bits.push('miccia più lunga ' + secs(st.longest));
        if (st.bestRun > 0) bits.push('giro più lungo ' + plural(st.bestRun, 'passaggio', 'passaggi'));
        $('#start-record').textContent = bits.length ? 'Su questo telefono: ' + bits.join(' · ') + '.' : '';
    }
    paintRecord();

    function paintResume() {
        var host = $('#resume-host');
        var s = validSave(QZ.store.get(SAVE_KEY, null), Date.now(), CATS);
        if (!s) { QZ.store.remove(SAVE_KEY); host.hidden = true; host.innerHTML = ''; return; }
        var alive = s.G.players.filter(function (p) { return !p.out; }).length;
        host.hidden = false;
        host.innerHTML = '<div class="card card--glow bb-resume"><span class="eyebrow">' + QZ.icon('pause') + 'Partita in sospeso</span>' +
            '<p><b>Round ' + s.G.round + (s.cfg.mode === 'points' ? ' di ' + s.cfg.rounds : ' · in campo ' + alive) + '</b> con ' +
            QZ.esc(s.G.players.map(function (p) { return p.name; }).join(', ')) + '.</p>' +
            '<div class="row"><button type="button" class="btn btn--primary" id="resume-go">' + QZ.icon('play', 'ico-fill') + 'Riprendi da qui</button>' +
            '<button type="button" class="btn btn--ghost" id="resume-drop">Lascia stare</button></div></div>';
        $('#resume-go').addEventListener('click', function () { resumeGame(s); });
        $('#resume-drop').addEventListener('click', function () {
            QZ.store.remove(SAVE_KEY);
            paintResume();
            QZ.sound.click();
            $('#start-btn').focus({ preventScroll: true });
        });
    }
    paintResume();
    function saveGame() {
        QZ.store.set(SAVE_KEY, { v: 1, t: Date.now(), cfg: { mode: CFG.mode, rounds: CFG.rounds, fuse: CFG.fuse, level: CFG.level, cats: CFG.cats }, G: G });
    }

    /* ---------- Comandi ---------- */
    $('#start-btn').addEventListener('click', startGame);
    $('#rd-go').innerHTML = QZ.icon('flame') + 'Accendi la miccia';
    $('#rd-go').addEventListener('click', go);
    $('#g-pass').innerHTML = 'Passa la bomba' + QZ.icon('arrow');
    $('#g-pass').addEventListener('click', pass);
    $('#g-contest').innerHTML = QZ.icon('back') + 'Contestata';
    $('#g-contest').setAttribute('aria-label', 'Contestata: risposta già detta o sbagliata, la bomba torna a chi l\'ha passata');
    $('#g-contest').addEventListener('click', contest);
    $('#g-skip').innerHTML = QZ.icon('shuffle') + 'Tema';
    $('#g-skip').setAttribute('aria-label', 'Cambia tema (la miccia continua)');
    $('#g-skip').addEventListener('click', skip);
    $('#g-pause').addEventListener('click', togglePause);
    $('#g-quit').innerHTML = QZ.icon('flag') + 'Chiudi';
    $('#g-quit').addEventListener('click', quit);
    $('#pause-chip').textContent = 'PAUSA · MICCIA FERMA';
    paintPause();

    /* ---------- Helper ---------- */
    function aliveIdx() {
        var out = [];
        G.players.forEach(function (p, i) { if (!p.out) out.push(i); });
        return out;
    }
    function nextAlive(i) {
        var n = G.players.length;
        for (var k = 1; k <= n; k++) { var j = (i + k) % n; if (!G.players[j].out) return j; }
        return i;
    }
    function roundLabel() { return 'Round ' + G.round + (CFG.mode === 'points' ? '/' + CFG.rounds : ''); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function roundLED() { return pad(G.round) + (CFG.mode === 'points' ? '/' + pad(CFG.rounds) : ''); }
    function boardHTML(holder) {
        return G.players.map(function (p, i) {
            var pts = CFG.mode === 'points' ? ' <b>' + p.score + '</b>' : '';
            var st = i === holder ? ', ha la bomba' : p.out ? ', fuori' : '';
            return '<span class="chip' + (i === holder ? ' is-hold' : '') + (p.out ? ' is-out' : '') + '" style="--c:' + p.color + '"' +
                (st || pts ? ' aria-label="' + QZ.esc(p.name + (pts ? ', ' + p.score + ' punti' : '') + st) + '"' : '') + '><i aria-hidden="true"></i>' + QZ.esc(p.name) + pts + '</span>';
        }).join('');
    }
    function nameHTML(p) {
        // un nome corto sta su una riga sola; uno lungo va a capo, ma ogni parola resta intera
        var name = String(p.name);
        var n = name.length <= 14 ? name.length : Math.max.apply(null, name.split(/\s+/).map(function (x) { return x.length; }));
        return '<span style="--n:' + Math.max(6, n) + '">' + QZ.esc(p.name) + '</span>';
    }

    /** Il BOOM sul tabellone: LED rossi che si accendono a scatti (decorativo, lo scoppio si annuncia a parte). */
    function boomLED() { return '<span class="bb-ledboom" aria-hidden="true">BOOM!</span>'; }

    /* ---------- Partita ---------- */
    function startGame() {
        // doppio tocco sul fischio d'inizio: una partita sola
        if (Date.now() - lastStart < 1000) return;
        lastStart = Date.now();
        var names = dedupeNames(players.get());
        G = {
            players: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, booms: 0, out: false, outRound: 0 }; }),
            round: 0, done: 0, holder: QZ.rand(0, names.length - 1), passes: 0, lens: [], best: null, fresh: []
        };
        QZ.wake.on();
        QZ.sound.start();
        newRound();
    }

    function resumeGame(s) {
        if (Date.now() - lastStart < 1000) return;
        lastStart = Date.now();
        // la partita ripresa si gioca con le sue impostazioni, e restano quelle anche dopo
        CFG.mode = s.cfg.mode; CFG.rounds = s.cfg.rounds; CFG.fuse = s.cfg.fuse; CFG.level = s.cfg.level; CFG.cats = s.cfg.cats;
        sel = new Set(CFG.cats || CATS);
        saveCfg();
        paintOptions();
        paintCats();
        G = s.G;
        // «Cambia giocatori» a fine partita deve mostrare chi stava giocando davvero
        players.set(G.players.map(function (p) { return p.name; }));
        G.players.forEach(function (p) { p.booms = p.booms || 0; });
        G.lens = Array.isArray(G.lens) ? G.lens : [];
        G.fresh = Array.isArray(G.fresh) ? G.fresh : [];
        QZ.wake.on();
        QZ.sound.start();
        showReady();
    }

    function newRound() {
        G.round++;
        saveGame();
        showReady();
    }

    function showReady() {
        stopLoop();
        S = { running: false, passes: 0, committed: false, hist: [] };
        var h = G.players[G.holder];
        $('#rd-eyebrow').innerHTML = QZ.icon('flag') + roundLabel() + (CFG.mode === 'elim' ? ' · in campo ' + aliveIdx().length : '');
        $('#rd-title').innerHTML = nameHTML(h);
        $('#rd-title').style.setProperty('--c', h.color);
        $('#rd-sub').textContent = 'Il tema esce quando si accende la miccia. Prendi il telefono, ' + h.name + '.';
        $('#rd-board').innerHTML = boardHTML(G.holder);
        QZ.show('s-ready');
        QZ.say(roundLabel() + '. La bomba parte da ' + h.name + '.');
    }

    function go() {
        // doppio tocco su "Accendi la miccia": un conto alla rovescia solo
        if (S.going || !G) return;
        S.going = true;
        var round = S;
        stage.classList.remove('is-boom', 'is-hot');
        $('#boom').innerHTML = '';
        game.classList.remove('bb-paused');
        $('#g-round').textContent = roundLED();
        $('#g-passes').textContent = '00';
        drawTopic();
        resetFuse();
        renderHolder(false);
        paintPause();
        QZ.show('s-game');
        setTimeout(function () {
            if (S !== round) return;
            QZ.countdown(3, 'VIA!').then(function () {
                // chiusa la partita (o cambiato round) durante il conto alla rovescia: niente miccia
                if (S !== round || S.closed) return;
                S.armed = true;
                startLoop();
                $('#g-pass').focus({ preventScroll: true });
            });
        }, 450);
    }

    function drawTopic() {
        // prima i temi del livello scelto; se nelle categorie scelte non ce n'e', si allarga
        var t = deck.draw(function (x) { return sel.has(x.categoria) && levelOk(x, CFG.level); }) ||
            deck.draw(function (x) { return sel.has(x.categoria); }) || deck.draw();
        S.topic = t;
        $('#g-cat').innerHTML = QZ.icon('ball') + QZ.esc(t.categoria);
        $('#g-topic').textContent = t.topic;
        QZ.fx.replay($('#g-topic'));
    }

    /* ---------- Miccia nascosta ---------- */
    function resetFuse() {
        var r = FUSES[CFG.fuse];
        S.fuse = QZ.rand(r[0] * 1000, r[1] * 1000);
        // la miccia disegnata brucia al ritmo della durata massima: la bomba
        // puo' esplodere quando ne resta ancora tanta, nessuno puo' calcolarlo
        S.max = r[1] * 1000;
        S.elapsed = 0;
        drawFuse(0);
        game.style.setProperty('--heat', 0);
    }
    function drawFuse(b) {
        var vis = fuseLen * (1 - 0.88 * Math.min(1, b));
        fuseEl.style.strokeDasharray = vis + ' ' + fuseLen;
        fuseInk.style.strokeDasharray = vis + ' ' + fuseLen;
        var pt = fuseEl.getPointAtLength(vis);
        sparkEl.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    }
    function startLoop() {
        if (S.running) return;
        S.running = true;
        S.last = performance.now();
        S.nextTick = S.last;
        S.raf = requestAnimationFrame(loop);
        paintPause();
    }
    function stopLoop() {
        S.running = false;
        cancelAnimationFrame(S.raf);
    }
    function loop(ts) {
        if (!S.running) return;
        // niente salti se il frame arriva tardi, niente passi indietro se arriva "prima"
        S.elapsed += Math.min(250, Math.max(0, ts - S.last));
        S.last = Math.max(S.last, ts);
        var q = heat(S.elapsed, S.max, S.fuse);
        drawFuse(S.elapsed / S.max);
        game.style.setProperty('--heat', q.toFixed(3));
        stage.classList.toggle('is-hot', q > 0.72 && !QZ.reducedMotion());
        if (ts >= S.nextTick) {
            S.tock = !S.tock;
            if (S.tock) QZ.sound.tick(); else QZ.sound.tock();
            QZ.fx.replay(stage, 'is-tick');
            QZ.fx.replay(sb, 'is-tick');
            S.nextTick = ts + interval(q);
        }
        if (S.elapsed >= S.fuse) { explode(); return; }
        S.raf = requestAnimationFrame(loop);
    }

    function pause() {
        if (!S.running) return false;
        stopLoop();
        stage.classList.remove('is-hot');
        game.classList.add('bb-paused');
        paintPause();
        return true;
    }
    function resume() {
        if (S.running || S.exploded || S.closed || !game.classList.contains('bb-paused')) return;
        game.classList.remove('bb-paused');
        startLoop();
        S.nextTick = S.last + 300;
    }
    function togglePause() {
        if (S.exploded || !S.armed || S.closed) return;
        if (S.running) pause(); else resume();
        QZ.say(S.running ? 'Si riparte, la miccia brucia.' : 'Pausa: la miccia è ferma e il tema è coperto.');
        QZ.sound.click();
    }
    function paintPause() {
        var paused = !S.running && game.classList.contains('bb-paused');
        $('#g-pause').innerHTML = QZ.icon(paused ? 'play' : 'pause') + (paused ? 'Riprendi' : 'Pausa');
        $('#g-pause').setAttribute('aria-pressed', String(paused));
        $('#g-pass').disabled = paused || !!S.exploded || !S.running;
        $('#g-skip').disabled = !!S.exploded || !S.armed;
        $('#g-contest').disabled = paused || !!S.exploded || !S.running || contestTo(S.hist) < 0;
        $('#g-quit').disabled = !!S.going && !S.armed;
    }
    // cambio app o schermo spento: la bomba si ferma
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.running) pause(); });

    /* ---------- Passaggi ---------- */
    function renderHolder(anim) {
        var h = G.players[G.holder];
        var el = $('#g-holder');
        el.innerHTML = nameHTML(h);
        el.style.setProperty('--c', h.color);
        var nx = nextAlive(G.holder);
        $('#g-next').innerHTML = nx !== G.holder ? 'Poi tocca a <b>' + QZ.esc(G.players[nx].name) + '</b>' : '';
        $('#g-board').innerHTML = boardHTML(G.holder);
        if (anim) QZ.fx.replay(el);
    }
    function pass() {
        if (!S.running) return;
        var now = performance.now();
        if (now - (S.lastPass || 0) < 350) return;   // doppio tocco: non salta nessuno
        S.lastPass = now;
        S.passes++;
        G.passes++;
        $('#g-passes').textContent = pad(S.passes);
        S.hist.push(G.holder);
        G.holder = nextAlive(G.holder);
        renderHolder(true);
        paintPause();
        QZ.sound.whoosh();
        QZ.vibrate(15);
    }
    /** Contestata: la risposta era gia' stata detta o era sbagliata, la bomba torna indietro.
        Il passaggio annullato non conta; si puo' contestare ancora piu' indietro. */
    function contest() {
        if (!S.running) return;
        var back = contestTo(S.hist);
        if (back < 0) return;
        var now = performance.now();
        if (now - (S.lastPass || 0) < 350) return;   // doppio tocco: si torna indietro di uno solo
        S.lastPass = now;
        S.hist.pop();
        S.passes = Math.max(0, S.passes - 1);
        G.passes = Math.max(0, G.passes - 1);
        $('#g-passes').textContent = pad(S.passes);
        G.holder = back;
        renderHolder(true);
        paintPause();
        QZ.sound.wrong();
        QZ.vibrate([40, 30, 40]);
        QZ.toast('Contestata: la bomba torna a ' + G.players[back].name, { icon: 'back', type: 'bad', ms: 1600 });
        QZ.say('Contestata. La bomba torna a ' + G.players[back].name + '.');
    }
    function skip() {
        if (S.exploded || S.closed || !S.armed) return;
        // la miccia continua a bruciare: cambiare tema non salva chi ha la bomba in mano
        drawTopic();
        QZ.sound.pop();
        QZ.toast('Tema nuovo. La miccia non si è fermata.', { icon: 'shuffle' });
    }

    function quit() {
        // durante il 3-2-1 «Chiudi» e' spento: il conto alla rovescia non si puo' fermare a meta'
        if (!G || S.closed || (S.going && !S.armed)) return;
        var wasRunning = pause();
        var counts = !S.exploded;
        QZ.confirm(G.done || !counts
            ? (counts ? 'Il round in corso non conta. Si va dritti alla classifica.' : 'Si va dritti alla classifica.')
            : 'Nessun round finito: si torna alle impostazioni.', { title: 'Chiudere qui?', okLabel: 'Chiudi', cancelLabel: 'Si continua', danger: true }).then(function (ok) {
            if (ok) {
                // scoppiata e non ancora contata: il round vale
                if (S.exploded) commit();
                finish();
            } else if (wasRunning) {
                resume();
                QZ.say('Si riparte, la miccia brucia.');
            }
        });
    }

    /* ---------- Esplosione ---------- */
    function explode() {
        stopLoop();
        S.exploded = true;
        S.loser = G.holder;
        G.lens.push(S.elapsed);
        var rec = updateStats(QZ.store.get(STATS_KEY, null), S.elapsed, S.passes);
        QZ.store.set(STATS_KEY, rec.stats);
        S.fresh = rec.fresh;
        rec.fresh.forEach(function (k) { if (G.fresh.indexOf(k) < 0) G.fresh.push(k); });
        if (!G.best || S.passes > G.best.passes) G.best = { passes: S.passes, topic: S.topic.topic };
        paintPause();
        stage.classList.remove('is-hot');
        $('#boom').innerHTML = boomLED();
        stage.classList.add('is-boom');
        QZ.say('Boom! La bomba è scoppiata in mano a ' + G.players[S.loser].name + '.', true);
        QZ.sound.boom();
        QZ.vibrate([400, 80, 250]);
        if (!QZ.reducedMotion()) {
            // tutto lo stadio lampeggia: rosso, ambra, rosso, poi buio
            var f = document.createElement('div');
            f.className = 'bb-flash';
            f.setAttribute('aria-hidden', 'true');
            f.innerHTML = '<span>BOOM</span>';
            document.body.appendChild(f);
            f.addEventListener('animationend', f.remove.bind(f));
            setTimeout(function () { if (f.isConnected) f.remove(); }, 2000);
        }
        QZ.fx.shake($('#app'));
        QZ.fx.sparks(stage, 'var(--led)', 26);
        setTimeout(function () { if (!S.closed) QZ.fx.sparks(stage, 'var(--led-red)', 16); }, 160);
        var round = S;
        S.boomT = setTimeout(function () { if (S === round && !S.closed) showBoom(); }, QZ.reducedMotion() ? 400 : 1700);
    }

    var BOOM_LINES = [
        'Ce l\'aveva in mano e ha esitato. Errore fatale.',
        'Il ticchettio l\'ha sentito, il nome giusto no.',
        'Tre secondi di troppo a pensarci. Fischiato.',
        'Bloccato sul più bello, come chi sbaglia a porta vuota.',
        'Ha guardato il soffitto cercando l\'ispirazione. È arrivata la bomba.',
        'Lingua inceppata al momento sbagliato.'
    ];
    var FRESH_TXT = { fastest: 'scoppio più rapido', longest: 'miccia più lunga', bestRun: 'giro più lungo' };

    function showBoom() {
        var L = G.players[S.loser];
        var last = CFG.mode === 'points' ? G.round >= CFG.rounds : aliveIdx().length <= 2;
        var preview = G.players.map(function (p, i) { return CFG.mode === 'points' && !p.out && i !== S.loser ? 1 : 0; });
        var others = aliveIdx().filter(function (i) { return i !== S.loser; });
        if (!S.line) S.line = QZ.pick(BOOM_LINES);
        var fresh = (S.fresh || []).map(function (k) { return FRESH_TXT[k]; });
        $('#boom-host').innerHTML =
            '<div class="bb-mini">' + boomLED() + '</div>' +
            '<div class="card bb-loser">' +
            '<span class="eyebrow">' + roundLabel() + '</span>' +
            '<span class="bb-holder__kicker">' + (CFG.mode === 'elim' ? 'saltato in aria, è fuori' : 'saltato in aria') + '</span>' +
            '<h2 class="bb-holder__name" style="--c:' + L.color + '">' + nameHTML(L) + '</h2>' +
            '<p class="bb-quip">' + QZ.esc(S.line) + '</p>' +
            '<p class="muted">Scoppiata dopo ' + secs(S.elapsed) + ' e ' + plural(S.passes, 'passaggio', 'passaggi') + '. Il tema era «' + QZ.esc(S.topic.topic) + '».</p>' +
            (fresh.length ? '<p class="note">Record del telefono: ' + QZ.esc(fresh.join(', ')) + '</p>' : '') +
            (others.length ? '<div class="bb-fix"><span class="small muted">Ce l\'aveva qualcun altro? Correggi a mano:</span><div>' + others.map(function (i) {
                return '<button type="button" class="btn btn--sm" data-fix="' + i + '">' + QZ.esc(G.players[i].name) + '</button>';
            }).join('') + '</div></div>' : '') + '</div>' +
            (CFG.mode === 'points'
                ? '<div class="bb-standings">' + G.players.map(function (p, i) { return { p: p, i: i }; })
                    .sort(function (a, b) { return (b.p.score + preview[b.i]) - (a.p.score + preview[a.i]) || a.i - b.i; })
                    .map(function (x, k) {
                        return '<div class="team' + (x.i === S.loser ? ' is-out' : '') + '" style="--c:' + x.p.color + ';animation:qz-rise .35s var(--ease-out) both;animation-delay:' + (k * 50 + 150) + 'ms"><span class="team__dot"></span><span class="team__name">' + QZ.esc(x.p.name) + '</span>' +
                            (preview[x.i] ? '<span class="bb-delta" aria-label="più uno">+1</span>' : '') + '<span class="team__score">' + (x.p.score + preview[x.i]) + '</span></div>';
                    }).join('') + '</div>'
                : '<div class="bb-board">' + G.players.map(function (p, i) {
                    var out = p.out || i === S.loser;
                    return '<span class="chip' + (out ? ' is-out' : '') + '" style="--c:' + p.color + '"' + (out ? ' aria-label="' + QZ.esc(p.name) + ', fuori"' : '') + '><i aria-hidden="true"></i>' + QZ.esc(p.name) + '</span>';
                }).join('') + '</div>') +
            '<div class="row row--center">' +
            (last ? '<button type="button" class="btn btn--primary btn--lg" id="bm-end">' + QZ.icon('trophy') + 'Classifica finale</button>'
                : '<button type="button" class="btn btn--primary btn--lg" id="bm-next">' + QZ.icon('play', 'ico-fill') + 'Prossimo round</button>' +
                '<button type="button" class="btn btn--ghost btn--lg" id="bm-end">' + QZ.icon('flag') + 'Chiudi qui</button>') +
            '</div>';
        // un tocco solo per schermata: il doppio tap non deve saltare un round
        var acted = false;
        var once = function (fn) { return function () { if (acted) return; acted = true; fn(); }; };
        QZ.$$('#boom-host [data-fix]').forEach(function (b) {
            b.addEventListener('click', once(function () {
                S.loser = Number(b.dataset.fix);
                showBoom();
                QZ.say('Corretto: la bomba ce l\'aveva ' + G.players[S.loser].name + '.');
            }));
        });
        if ($('#bm-next')) $('#bm-next').addEventListener('click', once(function () { commit(); if (!isOver()) newRound(); else finish(); }));
        $('#bm-end').addEventListener('click', once(function () { commit(); finish(); }));
        if (!$('#s-boom').classList.contains('is-active')) {
            QZ.show('s-boom');
            QZ.sound.lose();
        }
        setTimeout(function () { var b = $('#bm-next') || $('#bm-end'); if (b) b.focus({ preventScroll: true }); }, 250);
    }

    function commit() {
        if (S.committed) return;
        S.committed = true;
        G.done++;
        G.players[S.loser].booms = (G.players[S.loser].booms || 0) + 1;
        if (CFG.mode === 'points') {
            G.players.forEach(function (p, i) { if (!p.out && i !== S.loser) p.score++; });
            G.holder = S.loser;   // chi perde riparte con la bomba
        } else {
            var L = G.players[S.loser];
            L.out = true;
            L.outRound = G.round;
            G.holder = nextAlive(S.loser);
        }
    }
    function isOver() {
        return CFG.mode === 'points' ? G.round >= CFG.rounds : aliveIdx().length <= 1;
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        stopLoop();
        S.closed = true;
        clearTimeout(S.boomT);
        QZ.wake.off();
        QZ.store.remove(SAVE_KEY);
        // la scheda «Partita in sospeso» va rifatta comunque: quella vecchia riprenderebbe la partita appena chiusa
        paintResume();
        if (!G || !G.done) { G = null; paintRecord(); QZ.show('s-start'); return; }
        var rows = ranking(G.players, CFG.mode);
        var top = rows.filter(function (r) { return r.v === rows[0].v; });
        var champ = top.map(function (r) { return r.name; }).join(' e ');
        var lens = G.lens.length ? G.lens : [0];
        // le mani bucate: chi e' saltato in aria piu' volte (a punti, se c'e' un solo "colpevole")
        var maxB = Math.max.apply(null, G.players.map(function (p) { return p.booms || 0; }));
        var butter = G.players.filter(function (p) { return (p.booms || 0) === maxB; });
        var r = QZ.profile.record('bomba', { xp: 15 + G.done * 6, label: G.done + ' round · vince ' + champ });
        var fresh = G.fresh.map(function (k) { return FRESH_TXT[k]; });
        var pointsWinner = CFG.mode === 'points' && G.players.filter(function (p) { return p.name === rows[0].name; })[0];
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: CFG.mode === 'elim' ? 'shield' : 'trophy',
            title: top.length > 1 ? 'Pari in vetta' : 'Vince ' + champ,
            subtitle: CFG.mode === 'elim'
                ? (top.length > 1 ? champ + ' restano in piedi.' : QZ.pick(['L\'ultimo in piedi. La bomba non l\'ha mai preso.', 'Sangue freddo da rigorista: tutti saltati, lui no.', 'Ha visto saltare tutti gli altri senza battere ciglio.']))
                : (top.length > 1 ? champ + ' chiudono a pari punti e pari scoppi.' : pointsWinner && !pointsWinner.booms
                    ? 'Mai una volta con la bomba in mano allo scoppio. Nervi d\'acciaio.'
                    : QZ.pick(['Nervi saldi e lingua veloce. La bomba l\'ha passata quasi sempre in tempo.', 'Qualche scoppio l\'ha preso, ma alla fine ride lui.'])),
            big: G.passes, bigSuffix: G.passes === 1 ? ' passaggio' : ' passaggi',
            record: r,
            // pagella: a punti conta quante volte il vincitore e' scampato allo scoppio,
            // a eliminazione quanti avversari ha visto saltare
            ratio: CFG.mode === 'points' ? (pointsWinner ? pointsWinner.score : 0) / G.done : QZ.clamp(0.5 + (G.players.length - 2) * 0.1, 0.5, 1),
            stats: [
                { label: 'Round giocati', value: G.done },
                { label: 'Miccia più lunga', value: secs(Math.max.apply(null, lens)) },
                { label: 'Scoppio più rapido', value: secs(Math.min.apply(null, lens)) },
                { label: 'Giocatori', value: G.players.length }
            ],
            extraHTML: (maxB > 1 && butter.length === 1 ? '<p class="small muted center mt-2">Mani bucate: <b>' + QZ.esc(butter[0].name) + '</b>, ' + maxB + ' scoppi in mano.</p>' : '') +
                (G.best && G.best.passes > 0 ? '<p class="small muted center mt-2">Il giro più lungo: ' + plural(G.best.passes, 'passaggio', 'passaggi') + ' su «' + QZ.esc(G.best.topic) + '».</p>' : '') +
                (fresh.length ? '<p class="center mt-2"><span class="note">Record del telefono: ' + QZ.esc(fresh.join(', ')) + '</span></p>' : '') +
                '<div class="mt-3">' + QZ.podiumHTML(rows.map(function (x) {
                    return CFG.mode === 'points' ? { name: x.name, color: x.color, score: x.score, sub: x.booms ? plural(x.booms, 'scoppio', 'scoppi') + ' in mano' : 'mai saltato in aria' } : x;
                })) + '</div>',
            share: 'Partita a Bomba su Quizzotti: ' + champ + ' ' + (top.length > 1 ? 'vincono' : 'vince') + ' dopo ' + plural(G.done, 'round', 'round') + ' e ' + plural(G.passes, 'passaggio', 'passaggi') +
                (maxB > 1 && butter.length === 1 ? ', ' + butter[0].name + ' con ' + maxB + ' scoppi in mano' : '') + '. Scoppio più rapido: ' + secs(Math.min.apply(null, lens)) + '. Chi ha i nervi più saldi?',
            onRetry: startGame,
            secondary: { label: 'Cambia giocatori', icon: 'users', onClick: function () { paintRecord(); QZ.show('s-start'); } }
        });
        paintRecord();
        G = null;
    }

    /* ---------- Tastiera ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SUMMARY')) return;
        var onBtn = t && t.closest && t.closest('button, a');
        var scr = document.querySelector('.screen.is-active');
        if (!scr) return;
        var k = e.key.toLowerCase();
        if (scr.id === 's-game') {
            if ((k === ' ' || k === 'enter') && !onBtn) { e.preventDefault(); pass(); }
            else if (k === 'p') { e.preventDefault(); togglePause(); }
            else if (k === 's') { e.preventDefault(); skip(); }
            else if (k === 'c') { e.preventDefault(); contest(); }
        } else if (scr.id === 's-ready' && (k === ' ' || k === 'enter') && !onBtn) {
            e.preventDefault(); go();
        }
    });
})();
