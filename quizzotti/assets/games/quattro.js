/* ==========================================================================
   QUIZZOTTI v2 — Quattro per Quattro
   Dati: assets/db-quattro.js (`quattroSchede`), schede fisse e numerate.
   Sedici nomi, quattro gruppi nascosti da quattro, difficolta' da 1 a 4
   (verde, ambra, blu, rosso). Si scelgono quattro caselle e si conferma:
   gruppo giusto = striscia colorata; tre su quattro = "Ne manca uno!";
   quattro errori e la scheda e' persa. Ogni scheda si gioca una volta:
   il risultato resta salvato per numero (qz.quattro.v1) e si rivede.
   ========================================================================== */
/* global quattroSchede */
(function () {
    'use strict';

    var STORE_KEY = 'qz.quattro.v1';
    var MAX_ERR = 4;
    var EMOJI = { 1: '🟩', 2: '🟨', 3: '🟦', 4: '🟥' };   // verde, giallo, blu, rosso
    var LIVELLO = { 1: 'facile', 2: 'medio', 3: 'difficile', 4: 'difficilissimo' };
    var TEMI = { 'serie-a': 'Serie A', azzurri: 'Azzurri', estero: 'Estero', storia: 'Storia', curiosita: 'Curiosità' };

    var SCHEDE = (typeof quattroSchede !== 'undefined' && Array.isArray(quattroSchede) ? quattroSchede : []).filter(function (p) {
        return p && Array.isArray(p.gruppi) && p.gruppi.length === 4;
    });
    function scheda(n) { return SCHEDE.filter(function (p) { return p.n === n; })[0] || null; }

    /** Progressi: { play: { n: partita in corso }, done: { n: esito } } */
    function getStore() {
        var x = QZ.store.get(STORE_KEY, null) || {};
        return { play: x.play || {}, done: x.done || {} };
    }
    function putStore(x) { QZ.store.set(STORE_KEY, x); }
    function nextOpen(after) {
        var st = getStore();
        var list = SCHEDE.filter(function (p) { return !st.done[p.n]; });
        return list.filter(function (p) { return p.n > (after || 0); })[0] || list[0] || null;
    }
    function allVoci(p) { var a = []; p.gruppi.forEach(function (g) { a = a.concat(g.voci); }); return a; }
    function validPlay(p, x) {
        if (!x || !Array.isArray(x.order) || !Array.isArray(x.solved) || !Array.isArray(x.tries)) return false;
        var all = allVoci(p);
        return x.order.every(function (v) { return all.indexOf(v) >= 0; }) && x.order.length + x.solved.length * 4 === 16;
    }

    /* =====================================================================
       STATO E MARKUP
       ===================================================================== */
    var $ = QZ.$;
    var S = null;
    var filter = 'all';
    var busy = false;

    var gridEl = $('#qq-grid');
    var areaEl = $('#qq-area');
    var solvedEl = $('#qq-solved');

    $('#medal').innerHTML = QZ.icon('layers');
    $('#rules').innerHTML = [
        ['Sedici nomi, quattro gruppi.', 'Ogni nome sta in un gruppo solo, anche quando sembra stare bene in due: le trappole sono volute.'],
        ['Scegli quattro caselle', 'e premi «Conferma». Se il gruppo è giusto si chiude in una striscia con il legame scritto sopra.'],
        ['Tre su quattro?', 'Il tabellone ti avvisa: «Ne manca uno!». Ma vale comunque come errore.'],
        ['Quattro errori', 'e la scheda è persa: i gruppi mancanti si scoprono da soli.'],
        ['Quattro colori:', 'verde il gruppo più facile, poi ambra, blu e rosso, il più cattivo. Ogni scheda si gioca una volta, uguale per tutti.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    $('#qq-shuffle').innerHTML = QZ.icon('shuffle') + 'Mescola';
    $('#qq-clear').innerHTML = QZ.icon('x') + 'Deseleziona';
    $('#qq-submit').innerHTML = QZ.icon('check') + 'Conferma';
    $('#qq-back').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#qq-back-2').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#qq-shuffle').addEventListener('click', shuffle);
    $('#qq-clear').addEventListener('click', clearSel);
    $('#qq-submit').addEventListener('click', submit);
    $('#qq-back').addEventListener('click', backToList);
    $('#qq-back-2').addEventListener('click', backToList);
    $('#start-btn').addEventListener('click', function () {
        var nx = nextOpen(0);
        if (nx) open(nx.n);
    });
    $('#qq-cards').addEventListener('click', function (e) {
        var b = e.target.closest('[data-n]');
        if (b) open(Number(b.dataset.n));
    });
    QZ.segmented($('#qq-filter'), [
        { value: 'all', label: 'Tutte' }, { value: 'todo', label: 'Da giocare' }, { value: 'done', label: 'Giocate' }
    ], filter, function (v) { filter = v; paintIntro(); });
    paintIntro();

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    /* ---------- La copertina: le schede ---------- */
    function paintIntro() {
        var st = getStore();
        var played = SCHEDE.filter(function (p) { return st.done[p.n]; });
        var won = played.filter(function (p) { return st.done[p.n].win; }).length;
        $('#qq-count').textContent = played.length + '/' + SCHEDE.length;
        $('#qq-count-sr').textContent = played.length + ' schede giocate su ' + SCHEDE.length + ', ' + won + ' chiuse';
        var nx = nextOpen(0);
        var btn = $('#start-btn');
        btn.hidden = !nx;
        if (nx) btn.innerHTML = (st.play[nx.n] ? 'Riprendi il N° ' : 'Gioca il N° ') + nx.n + QZ.icon('arrow');
        $('#start-record').textContent = !SCHEDE.length ? 'Le schede sono ancora in tipografia: riprova tra poco.'
            : !nx ? 'Tutte le schede giocate: ' + won + ' chiuse su ' + SCHEDE.length + '. Nuove schede in arrivo.'
                : played.length ? 'Fin qui: ' + won + ' chiuse e ' + (played.length - won) + ' perse su ' + plural(played.length, 'scheda giocata', 'schede giocate') + '.' : '';

        var list = SCHEDE.filter(function (p) {
            return filter === 'all' || (filter === 'done' ? !!st.done[p.n] : !st.done[p.n]);
        });
        if (!list.length) {
            $('#qq-cards').innerHTML = '<li class="muted">' + (filter === 'done' ? 'Ancora nessuna scheda giocata. Il fischio d\'inizio aspetta te.' : 'Le hai giocate tutte. Chapeau.') + '</li>';
            return;
        }
        $('#qq-cards').innerHTML = list.map(function (p, i) {
            var d = st.done[p.n], play = validPlay(p, st.play[p.n]) ? st.play[p.n] : null;
            var cls, status, dots = '';
            if (d) {
                cls = d.win ? 'is-win' : 'is-lost';
                status = d.win ? (d.mistakes ? 'Chiusa' : 'Perfetta') : 'Persa';
                dots = p.gruppi.map(function (g, gi) {
                    return '<i class="' + (d.solved.indexOf(gi) >= 0 ? 'd' + g.d : '') + '"></i>';
                }).join('');
            } else if (play) {
                cls = 'is-play';
                status = 'In corso';
                dots = p.gruppi.map(function (g, gi) { return '<i class="' + (play.solved.indexOf(gi) >= 0 ? 'd' + g.d : '') + '"></i>'; }).join('');
            } else {
                cls = 'is-new';
                status = 'Nuova';
            }
            var label = 'Scheda numero ' + p.n + ', ' + (TEMI[p.tema] || '') + ': ' + p.titolo + '. ' + status +
                (d ? (d.win ? ', ' + plural(d.mistakes, 'errore', 'errori') : ', ' + d.solved.length + ' gruppi su 4') + '. Rivedi la soluzione'
                    : play ? ', ' + play.solved.length + ' gruppi su 4, ' + plural(play.mistakes, 'errore', 'errori') + '. Riprendi' : '. Gioca');
            return '<li style="--i:' + i + '"><button type="button" class="qq-card ' + cls + '" data-n="' + p.n + '" aria-label="' + QZ.esc(label) + '">' +
                '<span class="qq-card__top"><span class="qq-card__n">N° ' + p.n + '</span><span class="qq-card__status">' + status + '</span></span>' +
                '<span class="qq-card__tema">' + QZ.esc(TEMI[p.tema] || '') + '</span>' +
                '<span class="qq-card__title">' + QZ.esc(p.titolo) + '</span>' +
                (dots ? '<span class="qq-card__dots" aria-hidden="true">' + dots + '</span>' : '') +
                '</button></li>';
        }).join('');
    }

    function backToList() {
        if (S && !S.done) save();
        var n = S ? S.n : null;
        S = null;
        paintIntro();
        QZ.show('s-start');
        if (n != null) {
            setTimeout(function () {
                var b = $('.qq-card[data-n="' + n + '"]');
                if (b) { b.scrollIntoView({ block: 'center' }); b.focus({ preventScroll: true }); }
            }, QZ.reducedMotion() ? 60 : 280);
        }
    }

    /* =====================================================================
       FLUSSO
       ===================================================================== */
    function open(n) {
        if (busy) return;
        var p = scheda(n);
        if (!p) return;
        var st = getStore();
        var group = {};
        p.gruppi.forEach(function (g, gi) { g.voci.forEach(function (v) { group[v] = gi; }); });
        S = { n: n, p: p, group: group, sel: [], done: false, review: null };
        if (st.done[n]) {
            var d = st.done[n];
            S.done = true;
            S.review = d;
            S.solved = d.solved.slice();
            S.mistakes = d.mistakes;
            S.tries = d.tries || [];
            S.order = [];
        } else if (validPlay(p, st.play[n])) {
            var x = st.play[n];
            S.order = x.order.slice();
            S.solved = x.solved.slice();
            S.mistakes = x.mistakes || 0;
            S.tries = x.tries.slice();
            S.guessed = (x.guessed || []).slice();
        } else {
            S.order = QZ.shuffle(allVoci(p));
            S.solved = [];
            S.mistakes = 0;
            S.tries = [];
            S.guessed = [];
        }
        $('#qq-title').textContent = 'N° ' + p.n + ' · ' + (TEMI[p.tema] || '') + ' · ' + p.titolo;
        $('#qq-n').textContent = 'N° ' + p.n;
        $('#qq-actions').hidden = S.done;
        $('#qq-back').hidden = S.done;
        $('#qq-kbd').hidden = S.done;
        $('#qq-review').hidden = !S.done;
        solvedEl.innerHTML = '';
        if (S.done) {
            S.solved.forEach(function (gi) { addStrip(gi, false, true); });
            p.gruppi.forEach(function (g, gi) { if (S.solved.indexOf(gi) < 0) addStrip(gi, true, true); });
            var d2 = S.review;
            $('#qq-review-txt').innerHTML = QZ.esc(d2.win
                ? 'Il N° ' + p.n + ' l\'hai chiuso con ' + plural(d2.mistakes, 'errore', 'errori') + '. Ogni scheda si gioca una volta sola: qui resta la soluzione, con i tuoi tentativi.'
                : 'Il N° ' + p.n + ' ti è sfuggito: ' + plural(d2.solved.length, 'gruppo trovato', 'gruppi trovati') + ' su quattro. Le strisce tratteggiate sono quelle scoperte dal tabellone.') +
                triesHTML(S.tries, p);
            $('#qq-hint').textContent = '';
        } else {
            S.solved.forEach(function (gi) { addStrip(gi, false, true); });
            $('#qq-hint').textContent = S.solved.length ? 'Si riparte da dove avevi lasciato.' : 'Scegli quattro caselle che hanno qualcosa in comune.';
            QZ.sound.start();
        }
        renderGrid();
        paintBoard();
        QZ.show('s-game');
        if (!S.done) save();
        requestAnimationFrame(fitTiles);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTiles);
        setTimeout(function () {
            fitTiles();
            if (S && S.done) $('#qq-back-2').focus({ preventScroll: true });
            else if (matchMedia('(pointer: fine)').matches) { var t = $('.qq-tile', gridEl); if (t) t.focus({ preventScroll: true }); }
        }, QZ.reducedMotion() ? 60 : 300);
    }

    /* ---------- Caselle ---------- */
    /** Ogni nome sta nella sua casella senza spezzare le parole: si stringe il carattere finche' non entra. */
    function fitTiles() {
        if (!gridEl.clientWidth) return;          // schermata ancora nascosta: si misura dopo
        QZ.$$('.qq-tile', gridEl).forEach(function (b) {
            var t = b.firstChild;
            b.style.fontSize = '';
            var size = parseFloat(getComputedStyle(b).fontSize);
            var room = b.clientWidth - 4, roomH = b.clientHeight - 6;
            while (size > 10 && (t.scrollWidth > room || t.offsetHeight > roomH)) {
                size -= 0.5;
                b.style.fontSize = size + 'px';
            }
        });
    }
    window.addEventListener('resize', function () { clearTimeout(fitTiles.t); fitTiles.t = setTimeout(fitTiles, 80); });
    function renderGrid() {
        gridEl.hidden = !S.order.length;
        gridEl.innerHTML = S.order.map(function (v, i) {
            var on = S.sel.indexOf(v) >= 0;
            return '<button type="button" class="qq-tile" data-i="' + i + '" aria-pressed="' + on + '"><span class="qq-tile__t">' + QZ.esc(v) + '</span></button>';
        }).join('');
        fitTiles();
        paintActions();
    }
    function paintSel() {
        QZ.$$('.qq-tile', gridEl).forEach(function (b) {
            b.setAttribute('aria-pressed', String(S.sel.indexOf(S.order[Number(b.dataset.i)]) >= 0));
        });
        paintActions();
    }
    function paintActions() {
        if (!S || S.done) return;
        $('#qq-submit').disabled = S.sel.length !== 4 || busy;
        $('#qq-clear').disabled = !S.sel.length || busy;
        $('#qq-shuffle').disabled = busy;
        $('#qq-submit').setAttribute('aria-label', 'Conferma il gruppo (' + S.sel.length + ' su 4 scelte)');
    }

    gridEl.addEventListener('click', function (e) {
        var b = e.target.closest('.qq-tile');
        if (b) toggle(Number(b.dataset.i));
    });
    gridEl.addEventListener('keydown', function (e) {
        var b = e.target.closest('.qq-tile');
        if (!b || !S || S.done) return;
        var i = Number(b.dataset.i), n = S.order.length, to = -1;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (S.sel.length === 4 && S.sel.indexOf(S.order[i]) >= 0) submit();
            else toggle(i);
            return;
        }
        if (e.key === 'ArrowRight') to = Math.min(n - 1, i + 1);
        else if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
        else if (e.key === 'ArrowDown') to = i + 4 < n ? i + 4 : i;
        else if (e.key === 'ArrowUp') to = i - 4 >= 0 ? i - 4 : i;
        if (to >= 0) {
            e.preventDefault();
            var t = $('.qq-tile[data-i="' + to + '"]', gridEl);
            if (t) t.focus();
        }
    });
    document.addEventListener('keydown', function (e) {
        if (!S || S.done || !$('#s-game').classList.contains('is-active')) return;
        if (e.key === 'Escape' && S.sel.length && !document.querySelector('.qz-modal')) { e.preventDefault(); clearSel(); }
    });

    function toggle(i) {
        if (!S || S.done || busy) return;
        var v = S.order[i];
        if (v == null) return;
        var k = S.sel.indexOf(v);
        if (k >= 0) S.sel.splice(k, 1);
        else if (S.sel.length >= 4) {
            $('#qq-hint').textContent = 'Quattro alla volta: togline una prima di sceglierne un\'altra.';
            QZ.say('Hai già scelto quattro caselle.');
            QZ.fx.pop($('#qq-submit'));
            return;
        } else S.sel.push(v);
        QZ.sound.click();
        paintSel();
        var left = 4 - S.sel.length;
        $('#qq-hint').textContent = left ? (S.sel.length ? 'Ancora ' + (left === 1 ? 'una' : left) + '.' : 'Scegli quattro caselle che hanno qualcosa in comune.') : 'Quattro scelte: premi «Conferma».';
        if (!left) QZ.fx.pop($('#qq-submit'));
    }

    function clearSel() {
        if (!S || S.done || busy || !S.sel.length) return;
        S.sel = [];
        paintSel();
        $('#qq-hint').textContent = 'Selezione azzerata.';
        QZ.say('Selezione azzerata.');
    }

    function shuffle() {
        if (!S || S.done || busy) return;
        S.order = QZ.shuffle(S.order.slice());
        renderGrid();
        QZ.$$('.qq-tile', gridEl).forEach(function (b) { QZ.fx.replay(b, 'is-bump'); });
        QZ.sound.click();
        QZ.say('Caselle mescolate.');
        save();
    }

    /* ---------- Conferma ---------- */
    function submit() {
        if (!S || S.done || busy || S.sel.length !== 4) return;
        var key = S.sel.slice().sort().join('|');
        if (S.guessed.indexOf(key) >= 0) {
            QZ.toast('Questa quaterna l\'hai già provata. Niente errore, cambia qualcosa.', { icon: 'info', ms: 3000 });
            QZ.say('Combinazione già provata, non conta come errore.');
            return;
        }
        S.guessed.push(key);
        var gis = S.sel.map(function (v) { return S.group[v]; });
        S.tries.push(gis.slice());
        var count = {};
        gis.forEach(function (g) { count[g] = (count[g] || 0) + 1; });
        var best = -1, max = 0;
        Object.keys(count).forEach(function (g) { if (count[g] > max) { max = count[g]; best = Number(g); } });

        if (max === 4) {
            solve(best);
            return;
        }
        S.mistakes++;
        QZ.sound.wrong();
        QZ.vibrate(80);
        QZ.fx.shake(gridEl);
        paintBoard();
        var left = MAX_ERR - S.mistakes;
        var leftTxt = left ? (left === 1 ? ' Ultimo errore a disposizione.' : ' Ne restano ' + left + '.') : '';
        if (max === 3) {
            QZ.fx.stamp(areaEl, 'Ne manca uno!', 'ink', { size: 26, x: 50, y: 50, ms: 1300, quiet: true, say: 'Ne manca uno! Tre su quattro sono giuste.' + leftTxt });
            $('#qq-hint').textContent = 'Tre su quattro: una delle scelte è di troppo.' + leftTxt;
        } else {
            QZ.fx.stamp(areaEl, 'Fuori', 'bad', { size: 30, x: 50, y: 50, ms: 1100, quiet: true, say: 'Fuori: non è un gruppo.' + leftTxt });
            $('#qq-hint').textContent = 'Non è un gruppo.' + leftTxt;
        }
        save();
        if (S.mistakes >= MAX_ERR) lose();
    }

    function solve(gi) {
        busy = true;
        paintActions();
        S.solved.push(gi);
        var g = S.p.gruppi[gi];
        QZ.sound.correct();
        QZ.$$('.qq-tile', gridEl).forEach(function (b) {
            if (S.sel.indexOf(S.order[Number(b.dataset.i)]) >= 0) b.classList.add('is-out');
        });
        QZ.say('Gruppo giusto, livello ' + LIVELLO[g.d] + ': ' + g.nome + '. ' + g.voci.join(', ') + '.');
        $('#qq-hint').textContent = S.solved.length < 4 ? 'Gol! ' + (4 - S.solved.length === 1 ? 'Ne resta uno.' : 'Ne restano ' + (4 - S.solved.length) + '.') : 'Tutti e quattro.';
        setTimeout(function () {
            S.order = S.order.filter(function (v) { return g.voci.indexOf(v) < 0; });
            S.sel = [];
            addStrip(gi, false);
            renderGrid();
            paintBoard();
            busy = false;
            paintActions();
            save();
            if (S.solved.length === 4) win();
            else {
                var t = $('.qq-tile', gridEl);
                if (t && matchMedia('(pointer: fine)').matches) t.focus({ preventScroll: true });
            }
        }, QZ.reducedMotion() ? 0 : 320);
    }

    function addStrip(gi, given, quiet) {
        var g = S.p.gruppi[gi];
        var el = document.createElement('div');
        el.className = 'qq-strip d' + g.d + (given ? ' is-given' : '');
        if (quiet) el.style.animation = 'none';
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Gruppo ' + LIVELLO[g.d] + (given ? ', scoperto dal tabellone' : '') + ': ' + g.nome + '. ' + g.voci.join(', '));
        el.innerHTML = '<span class="qq-strip__name">' + QZ.esc(g.nome) + '</span><span class="qq-strip__voci">' + QZ.esc(g.voci.join(' · ')) + '</span>';
        solvedEl.appendChild(el);
    }

    function paintBoard() {
        $('#qq-groups').textContent = S.solved.length + '/4';
        var lives = '';
        for (var i = 0; i < MAX_ERR; i++) lives += '<i class="' + (i < S.mistakes ? 'is-off' : '') + '"></i>';
        $('#qq-lives').innerHTML = lives;
        $('#qq-lives').setAttribute('aria-label', plural(S.mistakes, 'errore', 'errori') + ' su ' + MAX_ERR);
    }

    function save() {
        if (!S || S.done) return;
        var st = getStore();
        st.play[S.n] = { order: S.order, solved: S.solved, mistakes: S.mistakes, tries: S.tries, guessed: S.guessed };
        putStore(st);
    }

    /* =====================================================================
       FINE PARTITA
       ===================================================================== */
    function win() {
        S.done = true;
        QZ.fx.stamp(areaEl, S.mistakes ? 'Gol!' : 'Perfetta!', 'ok', { size: 34, x: 50, y: 40, ms: 1400, say: 'Scheda chiusa.' });
        setTimeout(function () { finish(true); }, QZ.reducedMotion() ? 300 : 1300);
    }

    function lose() {
        S.done = true;
        busy = true;
        $('#qq-hint').textContent = 'Quattro errori: il tabellone scopre i gruppi mancanti.';
        QZ.say('Quattro errori, scheda persa. Ecco i gruppi mancanti.');
        S.sel = [];
        paintSel();
        var rest = S.p.gruppi.map(function (g, gi) { return gi; }).filter(function (gi) { return S.solved.indexOf(gi) < 0; })
            .sort(function (a, b) { return S.p.gruppi[a].d - S.p.gruppi[b].d; });
        var step = QZ.reducedMotion() ? 0 : 650;
        rest.forEach(function (gi, k) {
            setTimeout(function () {
                var g = S.p.gruppi[gi];
                S.order = S.order.filter(function (v) { return g.voci.indexOf(v) < 0; });
                addStrip(gi, true);
                renderGrid();
            }, 500 + k * step);
        });
        setTimeout(function () { busy = false; finish(false); }, 900 + rest.length * step + (QZ.reducedMotion() ? 0 : 900));
    }

    function shareText() {
        var p = S.p;
        var rows = S.tries.map(function (t) { return t.map(function (gi) { return EMOJI[p.gruppi[gi].d]; }).join(''); });
        return 'Quattro per Quattro N° ' + p.n + '\n' + rows.join('\n') + '\n' +
            (S.solved.length === 4 ? (S.mistakes ? 'Chiusa con ' + plural(S.mistakes, 'errore', 'errori') + '.' : 'Zero errori.') : 'Persa con ' + S.solved.length + ' gruppi su 4.') + ' Tu?';
    }

    function triesHTML(tries, p) {
        if (!tries || !tries.length) return '';
        return '<div class="qq-tries mt-2" aria-hidden="true">' + tries.map(function (t) {
            return '<div class="qq-tries__row">' + t.map(function (gi) { return '<i class="d' + p.gruppi[gi].d + '"></i>'; }).join('') + '</div>';
        }).join('') + '</div>';
    }

    function finish(won) {
        if (S.finished) return;
        S.finished = true;
        S.done = true;
        var p = S.p, n = S.n, found = S.solved.length, err = S.mistakes;
        var ratio = won ? QZ.clamp(1 - err * 0.14, 0, 1) : found * 0.12;
        var st = getStore();
        var first = !st.done[n];
        delete st.play[n];
        if (first) st.done[n] = { win: won, mistakes: err, solved: S.solved.slice(), tries: S.tries, ratio: Math.round(ratio * 1000) / 1000, date: Date.now() };
        putStore(st);
        var r = null;
        if (first) {
            r = QZ.profile.record('quattro', {
                xp: found * 8 + (won ? 30 : 0) + (won && !err ? 20 : 0),
                label: 'N° ' + n + ' ' + p.titolo + ' · ' + (won ? 'chiusa con ' + plural(err, 'errore', 'errori') : 'persa, ' + found + '/4 gruppi'),
                score: Math.round(ratio * 100)
            });
        }
        var played = SCHEDE.filter(function (x) { return st.done[x.n]; }).length;
        var nx = nextOpen(n);

        var title, sub;
        if (won && !err) { title = 'Partita perfetta'; sub = 'Quattro gruppi, zero errori. Le trappole le hai viste tutte da lontano.'; }
        else if (won && err < 3) { title = 'Gol!'; sub = 'Scheda chiusa con ' + plural(err, 'errore', 'errori') + '. Qualche brivido, ma il risultato è in cassaforte.'; }
        else if (won) { title = 'Al novantesimo'; sub = 'Chiusa con tre errori sul groppone: vittoria sporca, ma i tre punti contano uguale.'; }
        else if (found >= 2) { title = 'Fuori ai rigori'; sub = 'Ne hai trovati ' + found + ' su quattro. Gli altri sono qui sotto: occhio alle trappole, la prossima volta.'; }
        else if (found === 1) { title = 'Partita in salita'; sub = 'Un gruppo solo prima del quarto errore. La soluzione è qui sotto: studiala e torna in campo.'; }
        else { title = 'Notte fonda'; sub = 'Nessun gruppo trovato. Capita anche ai migliori: la soluzione è qui sotto.'; }

        var solHTML = '<div class="card qq-sol mt-3"><h2>Come è andata</h2>' +
            '<ul class="qq-legend" aria-hidden="true">' + [1, 2, 3, 4].map(function (d) { return '<li><i class="d' + d + '"></i>' + LIVELLO[d] + '</li>'; }).join('') + '</ul>' +
            triesHTML(S.tries, p) +
            '<p class="sr-only">' + QZ.esc(plural(S.tries.length, 'tentativo', 'tentativi') + ', ' + plural(err, 'errore', 'errori') + '.') + '</p>' +
            '<div class="stack" style="--gap:8px">' + p.gruppi.map(function (g, gi) {
                var mine = S.solved.indexOf(gi) >= 0;
                return '<div class="qq-strip d' + g.d + (mine ? '' : ' is-given') + '" style="animation:none"><span class="qq-strip__name">' + QZ.esc(g.nome) + '</span>' +
                    '<span class="qq-strip__voci">' + QZ.esc(g.voci.join(' · ')) + (mine ? '' : ' (scoperto)') + '</span></div>';
            }).join('') + '</div></div>';

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: won,
            icon: won ? 'trophy' : 'flag',
            title: title, subtitle: sub,
            record: r, ratio: ratio,
            stats: [
                { label: 'Gruppi', value: found + '/4' },
                { label: 'Errori', value: err + '/' + MAX_ERR },
                { label: 'Tentativi', value: S.tries.length },
                { label: 'Giocate', value: played + '/' + SCHEDE.length }
            ],
            extraHTML: solHTML,
            share: shareText(),
            retryLabel: 'Torna alle schede',
            onRetry: backToList,
            secondary: nx ? { label: 'Prossima: N° ' + nx.n, icon: 'arrow', onClick: function () { open(nx.n); } } : null
        });
        QZ.say((won ? 'Scheda chiusa' : 'Scheda persa') + ': ' + found + ' gruppi su 4, ' + plural(err, 'errore', 'errori') + '. Schede giocate: ' + played + ' su ' + SCHEDE.length + '.');
    }
})();
