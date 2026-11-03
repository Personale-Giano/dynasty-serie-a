/* ==========================================================================
   QUIZZOTTI v2 — Bomba
   Dati: assets/db-bomba.js (`topics`: { categoria, topic }).
   Novita' rispetto alla v1: si vede chi ha la bomba e si passa con un tasto
   (nella v1 la rotazione era invisibile e il perdente si sceglieva a mano),
   miccia nascosta con ticchettio che accelera, pausa, scelta delle categorie,
   modalita' a punti o a eliminazione con fine partita, temi senza ripetizioni.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('bomba', topics, function (t) { return t.topic; });
    var CATS = [];
    topics.forEach(function (t) { if (CATS.indexOf(t.categoria) < 0) CATS.push(t.categoria); });
    var FUSES = { short: [15, 40], mid: [30, 90], long: [60, 120] };   // secondi (v1: 30-90)
    var CFG = Object.assign({ mode: 'points', rounds: 10, fuse: 'mid', cats: null }, QZ.store.get('qz.bomba.cfg', {}) || {});

    var G = null;   // partita
    var S = {};     // round in corso
    var fuseEl = $('#fuse'), sparkEl = $('#spark'), stage = $('#stage');
    var fuseLen = fuseEl.getTotalLength();

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = QZ.icon('bomb') + 'Accendi la partita';
    $('#medal').innerHTML = QZ.icon('bomb');
    $('#rules').innerHTML = [
        ['Esce un tema', 'di calcio: giocatori di una squadra, stadi, allenatori…'],
        ['Chi ha la bomba', 'nomina qualcosa di valido e preme «Passa», poi dà il telefono al vicino.'],
        ['Niente ripetizioni:', 'una risposta già detta o sbagliata non vale, si riprova.'],
        ['Miccia nascosta:', 'nessuno sa quando scoppia. Chi la tiene in mano perde il round.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var played = QZ.profile.get().gamesPlayed.bomba;
    $('#start-record').textContent = played ? 'Partite giocate su questo dispositivo: ' + played : '';

    var players = QZ.playerList($('#players-host'), { key: 'bomba', min: 2, max: 12, initial: 3, label: 'Giocatore', title: 'Giocatori (2-12)' });

    var MODE_DESC = {
        points: 'Chi non ha la bomba quando esplode prende un punto. Vince chi ne ha di più alla fine.',
        elim: 'Chi resta con la bomba in mano è eliminato. L\'ultimo sopravvissuto vince.'
    };
    QZ.segmented($('#opt-mode'), [{ label: 'A punti', value: 'points' }, { label: 'Eliminazione', value: 'elim' }], CFG.mode, function (v) {
        CFG.mode = v; saveCfg(); paintMode();
    });
    QZ.segmented($('#opt-rounds'), [{ label: '5', value: 5 }, { label: '10', value: 10 }, { label: '15', value: 15 }], CFG.rounds, function (v) { CFG.rounds = v; saveCfg(); });
    QZ.segmented($('#opt-fuse'), [{ label: 'Corta', value: 'short' }, { label: 'Media', value: 'mid' }, { label: 'Lunga', value: 'long' }], CFG.fuse, function (v) { CFG.fuse = v; saveCfg(); });
    function paintMode() {
        $('#mode-desc').textContent = MODE_DESC[CFG.mode];
        $('#rounds-wrap').hidden = CFG.mode !== 'points';
    }
    paintMode();

    // categorie: tutte attive di default, almeno una sempre selezionata
    var sel = new Set((Array.isArray(CFG.cats) ? CFG.cats : CATS).filter(function (c) { return CATS.indexOf(c) >= 0; }));
    if (!sel.size) CATS.forEach(function (c) { sel.add(c); });
    $('#cats-ico').innerHTML = QZ.icon('right');
    $('#cats').innerHTML = '<button type="button" data-all>Tutti</button>' + CATS.map(function (c) {
        var n = topics.filter(function (t) { return t.categoria === c; }).length;
        return '<button type="button" data-cat="' + QZ.esc(c) + '">' + QZ.esc(c) + ' <span class="faint">' + n + '</span></button>';
    }).join('');
    $('#cats').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-all')) {
            if (sel.size === CATS.length) { sel = new Set([CATS[0]]); } else CATS.forEach(function (c) { sel.add(c); });
        } else {
            var c = b.getAttribute('data-cat');
            if (sel.has(c)) {
                if (sel.size === 1) { QZ.toast('Serve almeno un tema', { icon: 'info' }); return; }
                sel.delete(c);
            } else sel.add(c);
        }
        QZ.sound.click();
        CFG.cats = sel.size === CATS.length ? null : Array.from(sel);
        saveCfg();
        paintCats();
    });
    function paintCats() {
        QZ.$$('#cats [data-cat]').forEach(function (b) { b.setAttribute('aria-pressed', String(sel.has(b.getAttribute('data-cat')))); });
        $('#cats [data-all]').setAttribute('aria-pressed', String(sel.size === CATS.length));
        $('#cats-label').textContent = sel.size === CATS.length ? 'Temi: tutti (' + CATS.length + ' categorie)' : 'Temi: ' + sel.size + ' categori' + (sel.size === 1 ? 'a' : 'e') + ' su ' + CATS.length;
    }
    paintCats();
    function saveCfg() { QZ.store.set('qz.bomba.cfg', CFG); }

    $('#start-btn').addEventListener('click', startGame);
    $('#rd-go').innerHTML = QZ.icon('flame') + 'Accendi la miccia';
    $('#rd-go').addEventListener('click', go);
    $('#g-pass').innerHTML = QZ.icon('arrow') + 'Passa la bomba';
    $('#g-pass').addEventListener('click', pass);
    $('#g-skip').innerHTML = QZ.icon('shuffle');
    $('#g-skip').addEventListener('click', skip);
    $('#g-pause').addEventListener('click', togglePause);
    $('#g-quit').innerHTML = QZ.icon('x');
    $('#g-quit').addEventListener('click', function () {
        if (S.running) pause();
        QZ.confirm('Il round in corso non verrà conteggiato.', { title: 'Terminare la partita?', okLabel: 'Termina', danger: true }).then(function (ok) {
            if (ok) finish();
        });
    });
    $('#pause-chip').innerHTML = QZ.icon('pause') + 'In pausa · il tema è nascosto';
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
    function secs(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
    function roundLabel() { return 'Round ' + G.round + (CFG.mode === 'points' ? '/' + CFG.rounds : ''); }
    function boardHTML(holder, preview) {
        return G.players.map(function (p, i) {
            var pts = CFG.mode === 'points' ? ' <b>' + (p.score + (preview && preview[i] || 0)) + '</b>' : '';
            return '<span class="chip' + (i === holder ? ' is-hold' : '') + (p.out ? ' is-out' : '') + '" style="--c:' + p.color + '"><i></i>' + QZ.esc(p.name) + pts + '</span>';
        }).join('');
    }

    /* ---------- Partita ---------- */
    function startGame() {
        var seen = {};
        var names = players.get().map(function (n) {
            var k = n.toLowerCase();
            seen[k] = (seen[k] || 0) + 1;
            return seen[k] > 1 ? n + ' ' + seen[k] : n;
        });
        G = {
            players: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, out: false, outRound: 0 }; }),
            round: 0, done: 0, holder: QZ.rand(0, names.length - 1), passes: 0, lens: []
        };
        QZ.wake.on();
        QZ.sound.start();
        newRound();
    }

    function newRound() {
        G.round++;
        stopLoop();
        S = { running: false, passes: 0, committed: false };
        var h = G.players[G.holder];
        $('#rd-eyebrow').innerHTML = QZ.icon('flag') + roundLabel() + (CFG.mode === 'elim' ? ' · in gioco ' + aliveIdx().length : '');
        $('#rd-title').textContent = 'Inizia ' + h.name;
        $('#rd-sub').textContent = 'Il tema si scopre quando si accende la miccia. ' + h.name + ', prendi il telefono!';
        $('#rd-board').innerHTML = boardHTML(G.holder);
        QZ.show('s-ready');
    }

    function go() {
        stage.classList.remove('is-boom', 'is-hot');
        $('#game').classList.remove('bb-paused');
        $('#g-pass').disabled = true;
        $('#g-round').innerHTML = QZ.icon('flag') + '<b>' + roundLabel() + '</b>';
        drawTopic();
        resetFuse();
        renderHolder(false);
        QZ.show('s-game');
        setTimeout(function () {
            QZ.countdown(3, 'VIA!').then(function () {
                $('#g-pass').disabled = false;
                $('#g-pass').focus({ preventScroll: true });
                S.armed = true;
                startLoop();
            });
        }, 450);
    }

    function drawTopic() {
        var t = deck.draw(function (x) { return sel.has(x.categoria); }) || deck.draw();
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
        stage.style.setProperty('--heat', 0);
    }
    function drawFuse(b) {
        var vis = fuseLen * (1 - 0.88 * Math.min(1, b));
        fuseEl.style.strokeDasharray = vis + ' ' + fuseLen;
        var pt = fuseEl.getPointAtLength(vis);
        sparkEl.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    }
    function interval(q) {
        return Math.max(110, 900 - 790 * Math.pow(q, 1.25)) * (0.9 + Math.random() * 0.2);
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
        S.elapsed += Math.min(250, ts - S.last);   // niente salti se il frame arriva tardi
        S.last = ts;
        var vis = S.elapsed / S.max;
        var q = Math.min(1, 0.5 * vis + 0.5 * (S.elapsed / S.fuse));
        drawFuse(vis);
        stage.style.setProperty('--heat', q.toFixed(3));
        stage.classList.toggle('is-hot', q > 0.72 && !QZ.reducedMotion());
        if (ts >= S.nextTick) {
            S.tock = !S.tock;
            if (S.tock) QZ.sound.tick(); else QZ.sound.tock();
            QZ.fx.replay(stage, 'is-tick');
            S.nextTick = ts + interval(q);
        }
        if (S.elapsed >= S.fuse) { explode(); return; }
        S.raf = requestAnimationFrame(loop);
    }

    function pause() {
        if (!S.running) return;
        stopLoop();
        $('#game').classList.add('bb-paused');
        paintPause();
    }
    function resume() {
        if (S.running || S.exploded || !$('#game').classList.contains('bb-paused')) return;
        $('#game').classList.remove('bb-paused');
        startLoop();
        S.nextTick = S.last + 300;
    }
    function togglePause() {
        if (S.exploded || !S.armed) return;
        if (S.running) pause(); else resume();
        QZ.sound.click();
    }
    function paintPause() {
        var paused = !S.running && $('#game').classList.contains('bb-paused');
        $('#g-pause').innerHTML = QZ.icon(paused ? 'play' : 'pause');
        $('#g-pause').setAttribute('aria-label', paused ? 'Riprendi' : 'Pausa');
        $('#g-pass').disabled = paused || !!S.exploded || !S.running;
    }
    // cambio app o schermo spento: la bomba si ferma
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.running) pause(); });

    /* ---------- Passaggi ---------- */
    function renderHolder(anim) {
        var h = G.players[G.holder];
        var el = $('#g-holder');
        el.textContent = h.name;
        el.style.setProperty('--c', h.color);
        var nx = nextAlive(G.holder);
        $('#g-next').textContent = nx !== G.holder ? 'Poi tocca a ' + G.players[nx].name : '';
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
        G.holder = nextAlive(G.holder);
        renderHolder(true);
        QZ.sound.whoosh();
        QZ.vibrate(15);
    }
    function skip() {
        if (S.exploded || (!S.running && !$('#game').classList.contains('bb-paused'))) return;
        drawTopic();
        resetFuse();
        S.passes = 0;
        QZ.toast('Nuovo tema, nuova miccia', { icon: 'shuffle' });
    }

    /* ---------- Esplosione ---------- */
    function explode() {
        stopLoop();
        S.exploded = true;
        S.loser = G.holder;
        G.lens.push(S.elapsed);
        $('#g-pass').disabled = true;
        stage.classList.remove('is-hot');
        stage.classList.add('is-boom');
        QZ.sound.boom();
        QZ.vibrate([400, 80, 250]);
        QZ.fx.flash('rgba(255, 130, 50, .9)');
        QZ.fx.shake($('#app'));
        QZ.fx.sparks(stage, '#ffb020', 34);
        setTimeout(function () { QZ.fx.sparks(stage, '#ff5a3c', 20); }, 160);
        setTimeout(showBoom, QZ.reducedMotion() ? 400 : 1700);
    }

    function showBoom() {
        var L = G.players[S.loser];
        var last = CFG.mode === 'points' ? G.round >= CFG.rounds : aliveIdx().length <= 2;
        var preview = G.players.map(function (p, i) { return CFG.mode === 'points' && !p.out && i !== S.loser ? 1 : 0; });
        var others = aliveIdx().filter(function (i) { return i !== S.loser; });
        $('#boom-host').innerHTML =
            '<div class="result" data-stagger>' +
            '<div class="result__badge result__badge--bad">' + QZ.icon('bomb') + '</div>' +
            '<span class="eyebrow">' + roundLabel() + ' · ' + QZ.esc(S.topic.topic) + '</span>' +
            '<h2 class="result__title">BOOM!</h2>' +
            '<p class="muted">Esplosa dopo ' + secs(S.elapsed) + ' e ' + S.passes + ' passaggi' + (S.passes === 1 ? 'o' : '') + '.</p></div>' +
            '<div class="card card--glow bb-loser">' +
            '<span class="label">' + (CFG.mode === 'elim' ? 'Eliminato' : 'Ha perso il round') + '</span>' +
            '<div class="bb-holder__name" style="--c:' + L.color + '">' + QZ.esc(L.name) + '</div>' +
            (others.length ? '<span class="small muted">Non era in mano sua? Correggi:</span><div class="bb-fix">' + others.map(function (i) {
                return '<button type="button" class="btn btn--sm" data-fix="' + i + '">' + QZ.esc(G.players[i].name) + '</button>';
            }).join('') + '</div>' : '') + '</div>' +
            (CFG.mode === 'points'
                ? '<div class="bb-standings">' + G.players.map(function (p, i) { return { p: p, i: i }; })
                    .sort(function (a, b) { return (b.p.score + preview[b.i]) - (a.p.score + preview[a.i]); })
                    .map(function (x, k) {
                        return '<div class="team' + (x.i === S.loser ? ' is-out' : '') + '" style="--c:' + x.p.color + ';animation:qz-rise .45s var(--ease-out) both;animation-delay:' + (k * 50 + 150) + 'ms"><span class="team__dot"></span><span class="team__name">' + QZ.esc(x.p.name) + '</span>' +
                            (preview[x.i] ? '<span class="bb-delta">+1</span>' : '') + '<span class="team__score">' + (x.p.score + preview[x.i]) + '</span></div>';
                    }).join('') + '</div>'
                : '<div class="bb-board">' + G.players.map(function (p, i) {
                    var out = p.out || i === S.loser;
                    return '<span class="chip' + (out ? ' is-out' : '') + '" style="--c:' + p.color + '"><i></i>' + QZ.esc(p.name) + '</span>';
                }).join('') + '</div>') +
            '<div class="row row--center">' +
            (last ? '<button type="button" class="btn btn--primary btn--lg" id="bm-end">' + QZ.icon('trophy') + 'Classifica finale</button>'
                : '<button type="button" class="btn btn--primary btn--lg" id="bm-next">' + QZ.icon('play', 'ico-fill') + 'Prossimo round</button>' +
                '<button type="button" class="btn btn--ghost btn--lg" id="bm-end">' + QZ.icon('flag') + 'Termina qui</button>') +
            '</div>';
        QZ.$$('#boom-host [data-fix]').forEach(function (b) {
            b.addEventListener('click', function () { S.loser = Number(b.dataset.fix); showBoom(); });
        });
        if ($('#bm-next')) $('#bm-next').addEventListener('click', function () { commit(); if (!isOver()) newRound(); else finish(); });
        $('#bm-end').addEventListener('click', function () { commit(); finish(); });
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
        QZ.wake.off();
        if (!G || !G.done) { QZ.show('s-start'); return; }
        var rows;
        if (CFG.mode === 'points') {
            rows = G.players.slice().sort(function (a, b) { return b.score - a.score; })
                .map(function (p) { return { name: p.name, color: p.color, score: p.score + ' pt', v: p.score }; });
        } else {
            rows = G.players.slice().sort(function (a, b) {
                return (a.out ? a.outRound : 999) < (b.out ? b.outRound : 999) ? 1 : -1;
            }).map(function (p) { return { name: p.name, color: p.color, score: p.out ? 'Fuori al round ' + p.outRound : 'In piedi', v: p.out ? p.outRound : 999 }; });
        }
        var top = rows.filter(function (r) { return r.v === rows[0].v; });
        var champ = top.map(function (r) { return r.name; }).join(' e ');
        var lens = G.lens.length ? G.lens : [0];
        var r = QZ.profile.record('bomba', { xp: 15 + G.done * 6, label: G.done + ' round · vince ' + champ });
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: CFG.mode === 'elim' ? 'shield' : 'trophy',
            title: top.length > 1 ? 'Pari in vetta!' : 'Vince ' + champ + '!',
            subtitle: CFG.mode === 'elim'
                ? (top.length > 1 ? champ + ' restano in piedi.' : 'L\'ultimo sopravvissuto: la bomba non l\'ha mai fregato.')
                : (top.length > 1 ? champ + ' chiudono a pari punti.' : 'Nervi saldi e lingua veloce: nessuno ha passato la bomba meglio.'),
            big: G.passes, bigSuffix: G.passes === 1 ? ' passaggio' : ' passaggi',
            record: r,
            stats: [
                { label: 'Round giocati', value: G.done },
                { label: 'Round più lungo', value: secs(Math.max.apply(null, lens)) },
                { label: 'Scoppio più rapido', value: secs(Math.min.apply(null, lens)) },
                { label: 'Giocatori', value: G.players.length }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(rows) + '</div>' +
                '<div class="row row--center mt-2"><button type="button" class="btn btn--ghost" id="end-setup">' + QZ.icon('users') + 'Cambia giocatori</button></div>',
            share: 'Partita a Bomba su Quizzotti: ' + champ + ' ' + (top.length > 1 ? 'vincono' : 'vince') + ' dopo ' + G.done + ' round e ' + G.passes + ' passaggi. Chi tiene i nervi più saldi?',
            onRetry: startGame
        });
        $('#end-setup').addEventListener('click', function () { QZ.show('s-start'); });
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
        } else if (scr.id === 's-ready' && (k === ' ' || k === 'enter') && !onBtn) {
            e.preventDefault(); go();
        }
    });
})();
