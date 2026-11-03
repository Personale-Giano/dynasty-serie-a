/* ==========================================================================
   QUIZZOTTI v2 — Il cruciverba del pallone
   Dati: assets/cruciverba-schede.js (`cruciverbaSchede`), schede fisse e
   numerate costruite da scripts/build-cruciverba.js a partire da
   assets/db-cruciverba.js. Il N° 1 e' sempre la stessa griglia: una volta
   completata resta da rivedere, non da rigiocare. Ogni scheda ha il suo
   salvataggio: si puo' lasciare a meta' e riprenderla quando si vuole.
   ========================================================================== */
/* global cruciverbaSchede */
(function () {
    'use strict';

    var STEP = { a: [0, 1], d: [1, 0] };
    var OTHER = { a: 'd', d: 'a' };
    var STORE_KEY = 'qz.cruciverba.v2';

    /* =====================================================================
       LE SCHEDE
       ===================================================================== */
    var SCHEDE = (typeof cruciverbaSchede !== 'undefined' && Array.isArray(cruciverbaSchede) ? cruciverbaSchede : []).map(function (p) {
        return {
            n: p.n, title: p.title, w: p.w, h: p.h,
            words: p.words.map(function (x) { return { answer: x.answer, clue: x.clue, r: x.row, c: x.col, dir: x.dir === 'D' ? 'd' : 'a', n: x.num }; })
        };
    });
    function scheda(n) { return SCHEDE.filter(function (p) { return p.n === n; })[0] || null; }

    /** Progressi: { play: { n: partita in corso }, done: { n: esito } } */
    function getStore() {
        var x = QZ.store.get(STORE_KEY, null) || {};
        return { play: x.play || {}, done: x.done || {} };
    }
    function putStore(x) { QZ.store.set(STORE_KEY, x); }
    function validPlay(p, x) {
        return !!(p && x && Array.isArray(x.fill) && x.fill.length === p.w * p.h && Array.isArray(x.solved) && x.solved.length === p.words.length);
    }
    function nextOpen(after) {
        var st = getStore();
        var list = SCHEDE.filter(function (p) { return !st.done[p.n]; });
        return list.filter(function (p) { return p.n > (after || 0); })[0] || list[0] || null;
    }
    function votoOf(ratio) { var v = QZ.pagella(ratio).voto; return (v % 1 ? Math.floor(v) + '½' : String(v)); }

    /* =====================================================================
       STATO E MARKUP
       ===================================================================== */
    var $ = QZ.$;
    var S = null;              // scheda aperta (in gioco o in revisione)
    var clock = null;
    var starting = false;
    var cellEls = [];

    var gridEl = $('#xw-grid');
    var wrapEl = $('#xw-wrap');
    var inputEl = $('#xw-input');
    var SENT = String.fromCharCode(160);   // sentinella nel campo nascosto: serve a sentire il tasto cancella dei telefoni

    $('#medal').innerHTML = QZ.icon('xword');
    $('#rules').innerHTML = [
        ['Schede numerate:', 'il N° 1 è uguale per tutti. Una volta chiusa, la scheda resta in bacheca.'],
        ['Tocca una casella', 'e scrivi. Toccala di nuovo per passare da orizzontale a verticale.'],
        ['Parola giusta, gol:', 'si accende di verde e non si tocca più.'],
        ['Tre aiuti dalla panchina:', 'controlla, svela una lettera, svela la parola. Ognuno pesa sul voto.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    var AIDS = [
        { id: 'check', label: 'Controlla', ico: 'check', fn: aidCheck },
        { id: 'letter', label: 'Svela lettera', ico: 'eye', fn: aidLetter },
        { id: 'word', label: 'Svela parola', ico: 'bulb', fn: aidWord },
        { id: 'quit', label: 'Mi arrendo', ico: 'flag', fn: surrender, cls: 'xw-aid--quit' }
    ];
    $('#xw-aids').innerHTML = AIDS.map(function (a) {
        return '<button type="button" class="xw-aid ' + (a.cls || '') + '" data-aid="' + a.id + '"><span class="xw-aid__ico" aria-hidden="true">' + QZ.icon(a.ico) + '</span>' + a.label + '</button>';
    }).join('');
    AIDS.forEach(function (a) {
        var b = $('[data-aid="' + a.id + '"]');
        // il fuoco resta nella griglia: si aiuta e si continua a scrivere
        b.addEventListener('pointerdown', function (e) { if (S && document.activeElement === inputEl) e.preventDefault(); });
        b.addEventListener('click', a.fn);
    });

    $('#xw-prev').innerHTML = QZ.icon('left');
    $('#xw-next').innerHTML = QZ.icon('right');
    $('#xw-back').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#xw-back-2').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#xw-back').addEventListener('click', backToList);
    $('#xw-back-2').addEventListener('click', backToList);
    $('#start-btn').addEventListener('click', function () {
        var p = nextOpen(0);
        if (p) open(p.n);
    });
    $('#xw-cards').addEventListener('click', function (e) {
        var b = e.target.closest('[data-n]');
        if (b) open(Number(b.dataset.n));
    });
    paintIntro();

    function fmtTime(s) {
        s = Math.max(0, Math.floor(s));
        var m = Math.floor(s / 60);
        return (m < 10 ? '0' : '') + m + ':' + String(s % 60).padStart(2, '0');
    }
    function timeWords(s) {
        var m = Math.floor(s / 60), x = Math.floor(s % 60);
        return (m ? m + (m === 1 ? ' minuto' : ' minuti') + (x ? ' e ' : '') : '') + (x || !m ? x + (x === 1 ? ' secondo' : ' secondi') : '');
    }
    function dirName(d) { return d === 'a' ? 'orizzontale' : 'verticale'; }
    function aidsCount() { return S.aids.check + S.aids.letter + S.aids.word; }
    function canNav() { return !!(S && (!S.done || S.review)); }

    /* ---------- La copertina: le schede ---------- */
    function paintIntro() {
        var st = getStore();
        var doneN = SCHEDE.filter(function (p) { return st.done[p.n]; }).length;
        $('#xw-count').textContent = doneN + '/' + SCHEDE.length;
        $('#xw-count-sr').textContent = doneN + ' schede completate su ' + SCHEDE.length;
        var nx = nextOpen(0);
        var btn = $('#start-btn');
        btn.hidden = !nx;
        if (nx) btn.innerHTML = (validPlay(nx, st.play[nx.n]) ? 'Riprendi il N° ' + nx.n : 'Fischio d\'inizio: N° ' + nx.n) + QZ.icon('arrow');
        $('#start-record').textContent = !SCHEDE.length ? 'Le schede stanno arrivando in sala stampa: riprova tra poco.'
            : !nx ? 'Tutte le schede completate. Nuove griglie in arrivo: torna a trovarci.' : '';
        $('#xw-cards').innerHTML = SCHEDE.map(function (p, i) {
            var d = st.done[p.n], play = validPlay(p, st.play[p.n]) ? st.play[p.n] : null;
            var status, cls, action, detail = '';
            if (d) {
                cls = 'is-done';
                status = d.quit ? 'Soluzione vista' : 'Completato';
                action = 'Rivedi la soluzione';
                detail = '<span class="xw-card__led"><span class="led">' + fmtTime(d.time) + '</span>' +
                    (d.quit ? '<span class="led led--red">RESA</span>' : '<span class="led led--green">VOTO ' + QZ.esc(votoOf(d.ratio)) + '</span>') + '</span>';
            } else if (play) {
                cls = 'is-play';
                status = 'In corso';
                action = 'Riprendi';
                var solved = play.solved.filter(Boolean).length;
                detail = '<span class="xw-card__led"><span class="led">' + solved + '/' + p.words.length + '</span><span class="led">' + fmtTime(play.elapsed) + '</span></span>';
            } else {
                cls = 'is-new';
                status = 'Nuovo';
                action = 'Gioca';
            }
            var label = 'Cruciverba numero ' + p.n + ', ' + p.title + ', ' + p.words.length + ' parole. ' + status +
                (d ? (d.quit ? '' : ', voto ' + votoOf(d.ratio)) + ', tempo ' + timeWords(d.time) : play ? ', ' + play.solved.filter(Boolean).length + ' parole su ' + p.words.length : '') + '. ' + action;
            return '<li style="--i:' + i + '"><button type="button" class="xw-card ' + cls + '" data-n="' + p.n + '" aria-label="' + QZ.esc(label) + '">' +
                '<span class="xw-card__top"><span class="xw-card__n">N° ' + p.n + '</span><span class="xw-card__status">' + status + '</span></span>' +
                '<span class="xw-card__title">' + QZ.esc(p.title) + '</span>' +
                '<span class="xw-card__meta">' + p.w + '×' + p.h + ' · ' + p.words.length + ' parole</span>' +
                detail +
                '<span class="xw-card__go">' + action + QZ.icon('arrow') + '</span></button></li>';
        }).join('');
    }

    function backToList() {
        if (S && !S.done) save();
        stopClock();
        S = null;
        paintIntro();
        QZ.show('s-start');
    }

    /* =====================================================================
       FLUSSO
       ===================================================================== */
    function blank(p) {
        var size = p.w * p.h;
        return {
            fill: new Array(size).fill(''), rev: new Array(size).fill(0), solved: new Array(p.words.length).fill(0),
            aids: { check: 0, letter: 0, word: 0 }, elapsed: 0, cur: -1, dir: 'a'
        };
    }

    function open(n) {
        if (starting) return;
        var p = scheda(n);
        if (!p) return;
        var st = getStore();
        if (st.done[n]) {
            // completata: si rivede la soluzione, senza punti in palio
            var d = st.done[n], ro = blank(p);
            ro.solved = new Array(p.words.length).fill(1);
            ro.aids = d.aids || ro.aids;
            ro.elapsed = d.time || 0;
            begin(p, ro, d);
            return;
        }
        begin(p, validPlay(p, st.play[n]) ? st.play[n] : blank(p), null);
    }

    function begin(p, play, review) {
        starting = true;
        S = {
            n: p.n, p: { n: p.n, title: p.title, w: p.w, h: p.h, words: p.words.map(function (w) { return Object.assign({}, w); }) },
            fill: play.fill.slice(), rev: play.rev.slice(), solved: play.solved.slice(),
            aids: Object.assign({ check: 0, letter: 0, word: 0 }, play.aids), elapsed: play.elapsed || 0,
            cur: play.cur, dir: play.dir || 'a', done: !!review, review: review
        };
        index();
        if (review) Object.keys(S.map).forEach(function (ci) { S.fill[ci] = S.map[ci].ch; });
        $('#xw-title').textContent = 'N° ' + p.n + ' · ' + p.title;
        $('#s-game').classList.toggle('is-review', !!review);
        $('#xw-aids').hidden = !!review;
        $('#xw-back').hidden = !!review;
        $('#xw-review').hidden = !review;
        if (review) {
            $('#xw-review-txt').textContent = review.quit
                ? 'La soluzione del N° ' + p.n + '. Qui hai alzato bandiera bianca: la scheda resta in bacheca, senza voto.'
                : 'La soluzione del N° ' + p.n + ', chiuso in ' + fmtTime(review.time) + ' con voto ' + votoOf(review.ratio) + '. Niente punti da rigiocare: goditela.';
        }
        buildGrid();
        buildClues();
        QZ.show('s-game');
        if (!review) QZ.sound.start();
        var first = S.cur >= 0 && S.map[S.cur] ? S.cur : null;
        if (first == null) {
            var w0 = review ? 0 : firstUnsolved(0, 1);
            first = w0 >= 0 ? firstFreeCell(w0) : S.p.words[0].cells[0];
            S.dir = S.p.words[Math.max(0, w0)].dir;
        }
        select(first, S.dir, true);
        paintBoard();
        if (!review) { startClock(); save(); }
        setTimeout(function () {
            starting = false;
            fit();
            // sul telefono la tastiera si apre al primo tocco sulla griglia, non da sola
            if (review) $('#xw-back-2').focus({ preventScroll: true });
            else if (matchMedia('(pointer: fine)').matches) inputEl.focus({ preventScroll: true });
        }, 320);
    }

    /** Mappa casella -> parole che ci passano (orizzontale e verticale) e posizione nella parola. */
    function index() {
        var p = S.p;
        S.map = {};
        p.words.forEach(function (w, wi) {
            var s = STEP[w.dir];
            w.cells = [];
            for (var i = 0; i < w.answer.length; i++) {
                var ci = (w.r + s[0] * i) * p.w + (w.c + s[1] * i);
                w.cells.push(ci);
                var m = S.map[ci] = S.map[ci] || { ch: w.answer[i] };
                m[w.dir] = wi;
                m[w.dir + 'i'] = i;
            }
        });
        S.total = Object.keys(S.map).length;
    }

    function isLocked(ci) {
        var m = S.map[ci];
        return !!(S.rev[ci] || (m.a != null && S.solved[m.a]) || (m.d != null && S.solved[m.d]));
    }

    /* ---------- Griglia ---------- */
    function buildGrid() {
        var p = S.p;
        gridEl.style.setProperty('--cols', p.w);
        gridEl.style.setProperty('--rows', p.h);
        var nums = {};
        p.words.forEach(function (w) { nums[w.cells[0]] = w.n; });
        var html = '';
        Object.keys(S.map).map(Number).sort(function (x, y) { return x - y; }).forEach(function (ci) {
            var r = Math.floor(ci / p.w), c = ci % p.w;
            html += '<div class="xw-cell" data-ci="' + ci + '" style="grid-row:' + (r + 1) + ';grid-column:' + (c + 1) + '">' +
                (nums[ci] ? '<span class="xw-num">' + nums[ci] + '</span>' : '') + '<span class="xw-ch"></span></div>';
        });
        gridEl.innerHTML = html;
        cellEls = [];
        QZ.$$('.xw-cell', gridEl).forEach(function (el) { cellEls[Number(el.dataset.ci)] = el; });
        Object.keys(S.map).forEach(function (ci) { paintCell(Number(ci)); });
        fit();
    }

    function paintCell(ci) {
        var el = cellEls[ci];
        if (!el) return;
        var m = S.map[ci];
        el.querySelector('.xw-ch').textContent = S.fill[ci] || '';
        var solved = (m.a != null && S.solved[m.a]) || (m.d != null && S.solved[m.d]);
        el.classList.toggle('is-solved', !!solved);
        el.classList.toggle('is-rev', !!S.rev[ci]);
    }

    /** La misura delle caselle segue la larghezza disponibile (375 px compresi). */
    function fit() {
        if (!S) return;
        var p = S.p;
        var avail = wrapEl.clientWidth;
        if (!avail) return;
        var gap = avail < 420 ? 2 : 3;
        var pad = avail < 420 ? 6 : 10;
        var cs = Math.floor((avail - pad * 2 - gap * (p.w - 1)) / p.w);
        if (matchMedia('(min-width: 980px)').matches) {
            // sul desktop la griglia sta tutta nello schermo, sotto tabellone e definizione
            var top = wrapEl.getBoundingClientRect().top + window.scrollY;
            var byH = Math.floor((window.innerHeight - Math.max(top, 250) - 24 - pad * 2 - gap * (p.h - 1)) / p.h);
            cs = Math.min(cs, Math.max(30, byH));
        }
        cs = QZ.clamp(cs, 16, 50);
        gridEl.style.setProperty('--cs', cs + 'px');
        gridEl.style.setProperty('--gap', gap + 'px');
        gridEl.style.setProperty('--pad', pad + 'px');
        placeInput();
    }
    window.addEventListener('resize', function () { clearTimeout(fit.t); fit.t = setTimeout(fit, 80); });

    function placeInput() {
        var el = cellEls[S.cur];
        if (!el) return;
        var a = el.getBoundingClientRect(), b = wrapEl.getBoundingClientRect();
        inputEl.style.left = (a.left - b.left) + 'px';
        inputEl.style.top = (a.top - b.top) + 'px';
        inputEl.style.width = a.width + 'px';
        inputEl.style.height = a.height + 'px';
    }

    /* ---------- Definizioni ---------- */
    function buildClues() {
        ['a', 'd'].forEach(function (d) {
            var host = $(d === 'a' ? '#xw-across' : '#xw-down');
            host.innerHTML = S.p.words.map(function (w, wi) {
                if (w.dir !== d) return '';
                return '<li><button type="button" class="xw-clue" data-w="' + wi + '"><span class="xw-clue__n">' + w.n + '</span>' +
                    '<span class="xw-clue__t">' + QZ.esc(w.clue) + ' <span class="xw-clue__len">(' + w.answer.length + ')</span>' +
                    (S.review ? '<span class="xw-clue__ans">' + w.answer + '</span>' : '') + '</span></button></li>';
            }).join('');
        });
        QZ.$$('.xw-clue').forEach(function (b) {
            b.addEventListener('click', function () {
                var wi = Number(b.dataset.w);
                select(firstFreeCell(wi), S.p.words[wi].dir);
                inputEl.focus({ preventScroll: true });
                if (!matchMedia('(min-width: 980px)').matches) showGrid();
            });
        });
        paintClues();
    }

    /** Sul telefono, dall'elenco si torna alla griglia: appena sotto la testata e la barra della definizione. */
    function showGrid() {
        var y = wrapEl.getBoundingClientRect().top + window.scrollY - headerOffset() - $('#xw-bar').offsetHeight - 24;
        window.scrollTo({ top: Math.max(0, y), behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
    }

    /** Quanto spazio occupa in alto la testata mentre si scorre (resta ferma solo se e' davvero sticky). */
    function headerOffset() {
        var h = $('.qz-header');
        if (!h) return 0;
        var r = h.getBoundingClientRect();
        if (window.scrollY > r.height) return r.top >= 0 ? r.bottom : 0;
        return getComputedStyle(h).position === 'sticky' ? r.height : 0;
    }
    // la barra della definizione si ferma subito sotto la testata, o in cima se la testata scorre via
    var barRaf = 0;
    window.addEventListener('scroll', function () {
        if (barRaf) return;
        barRaf = requestAnimationFrame(function () {
            barRaf = 0;
            if (window.scrollY > 80) $('#xw-bar').style.top = (headerOffset() + 8) + 'px';
        });
    }, { passive: true });

    function paintClues() {
        S.p.words.forEach(function (w, wi) {
            var b = $('.xw-clue[data-w="' + wi + '"]');
            if (!b) return;
            b.classList.toggle('is-solved', !!S.solved[wi]);
            var pattern = w.cells.map(function (ci) { return S.fill[ci] || 'vuota'; }).join(', ');
            b.setAttribute('aria-label', w.n + ' ' + dirName(w.dir) + ', ' + w.answer.length + ' lettere: ' + w.clue +
                (S.solved[wi] ? '. Risolta: ' + w.answer : '. Lettere: ' + pattern));
        });
    }

    /* ---------- Selezione ---------- */
    function curWord() {
        var m = S.map[S.cur];
        return m ? m[S.dir] : -1;
    }

    function select(ci, dir, silent) {
        var m = S.map[ci];
        if (!m) return;
        var prevWord = curWord();
        S.cur = ci;
        if (dir && m[dir] != null) S.dir = dir;
        else if (m[S.dir] == null) S.dir = OTHER[S.dir];
        var wi = curWord();
        var w = S.p.words[wi];
        QZ.$$('.xw-cell.is-word, .xw-cell.is-cur', gridEl).forEach(function (el) { el.classList.remove('is-word', 'is-cur'); });
        w.cells.forEach(function (x) { cellEls[x].classList.add('is-word'); });
        cellEls[ci].classList.add('is-cur');
        placeInput();

        // la barra con la definizione corrente
        $('#xw-ref').textContent = w.n + ' ' + dirName(w.dir) + ' · ' + w.answer.length + ' lettere';
        $('#xw-clue').textContent = w.clue;
        $('#xw-led-ref').textContent = w.n + (w.dir === 'a' ? ' ORIZ.' : ' VERT.');
        $('#xw-bar').classList.toggle('is-solved', !!S.solved[wi]);
        QZ.$$('.xw-clue.is-active').forEach(function (b) { b.classList.remove('is-active'); b.removeAttribute('aria-current'); });
        var cb = $('.xw-clue[data-w="' + wi + '"]');
        if (cb) {
            cb.classList.add('is-active');
            cb.setAttribute('aria-current', 'true');
            scrollClue(cb);
        }
        var pos = m[S.dir + 'i'] + 1;
        inputEl.setAttribute('aria-label', 'Casella ' + pos + ' di ' + w.answer.length + ' del ' + w.n + ' ' + dirName(w.dir) + ': ' + w.clue + (S.fill[ci] ? '. Lettera ' + S.fill[ci] : '. Vuota'));
        if (!silent && wi !== prevWord) {
            QZ.say(w.n + ' ' + dirName(w.dir) + ', ' + w.answer.length + ' lettere: ' + w.clue + (S.solved[wi] ? '. Già risolta: ' + w.answer.split('').join(' ') : ''));
        }
        if (!silent) save();
    }

    /** Porta in vista la definizione attiva dentro la sua colonna (solo sul desktop, dove la colonna scorre). */
    function scrollClue(cb) {
        var box = $('#xw-clues');
        if (!box || box.scrollHeight <= box.clientHeight + 2) return;
        var top = cb.offsetTop, bottom = top + cb.offsetHeight;   // la colonna (.card) e' l'offsetParent
        if (top < box.scrollTop + 30) box.scrollTop = Math.max(0, top - 40);
        else if (bottom > box.scrollTop + box.clientHeight - 10) box.scrollTop = bottom - box.clientHeight + 40;
    }

    function firstFreeCell(wi) {
        var w = S.p.words[wi];
        for (var i = 0; i < w.cells.length; i++) if (!S.fill[w.cells[i]] && !isLocked(w.cells[i])) return w.cells[i];
        for (var j = 0; j < w.cells.length; j++) if (!isLocked(w.cells[j])) return w.cells[j];
        return w.cells[0];
    }

    /** Ordine di gioco: prima le orizzontali poi le verticali, saltando quelle gia' risolte. */
    function firstUnsolved(from, step) {
        var n = S.p.words.length;
        for (var k = 0; k < n; k++) {
            var wi = ((from + step * k) % n + n) % n;
            if (!S.solved[wi]) return wi;
        }
        return -1;
    }

    function jumpWord(step) {
        var wi = curWord();
        var next = firstUnsolved(wi + step, step);
        if (next < 0) next = ((wi + step) % S.p.words.length + S.p.words.length) % S.p.words.length;
        select(firstFreeCell(next), S.p.words[next].dir);
    }

    function move(dr, dc) {
        var p = S.p, r = Math.floor(S.cur / p.w), c = S.cur % p.w;
        var want = dr ? 'd' : 'a';
        // freccia di traverso: prima si cambia verso, se la casella lo permette
        if (S.dir !== want && S.map[S.cur][want] != null) { select(S.cur, want); return; }
        for (var k = 1; k < Math.max(p.w, p.h); k++) {
            var rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || cc < 0 || rr >= p.h || cc >= p.w) return;
            var ci = rr * p.w + cc;
            if (S.map[ci]) { select(ci, S.map[ci][S.dir] != null ? S.dir : want); return; }
        }
    }

    /* ---------- Scrittura ---------- */
    function nextInWord(wi, from, step) {
        var w = S.p.words[wi], i = w.cells.indexOf(from) + step;
        while (i >= 0 && i < w.cells.length) {
            if (!isLocked(w.cells[i])) return w.cells[i];
            i += step;
        }
        return -1;
    }

    function type(ch) {
        if (!S || S.done) return;
        var wi = curWord(), ci = S.cur;
        if (isLocked(ci)) {
            ci = nextInWord(wi, ci, 1);
            if (ci < 0) { ci = nextInWord(wi, -1, 1); }
            if (ci < 0) {
                // parola gia' chiusa: la lettera va alla prossima ancora aperta
                if (firstUnsolved(wi + 1, 1) < 0) return;
                jumpWord(1);
                if (!isLocked(S.cur)) type(ch);
                return;
            }
        }
        S.fill[ci] = ch;
        cellEls[ci].classList.remove('is-wrong');
        paintCell(ci);
        QZ.fx.replay(cellEls[ci], 'is-typed');
        var solvedNow = checkWordsAt(ci);
        if (S.done) return;
        if (solvedNow.indexOf(wi) >= 0) {
            var nx = firstUnsolved(wi + 1, 1);
            if (nx >= 0) select(firstFreeCell(nx), S.p.words[nx].dir);
        } else {
            var nxt = nextInWord(wi, ci, 1);
            if (nxt < 0) {
                var w = S.p.words[wi];
                var empty = w.cells.filter(function (x) { return !S.fill[x] && !isLocked(x); })[0];
                nxt = empty != null ? empty : ci;
            }
            select(nxt, S.dir, true);
            paintClues();
            save();
        }
        checkFull();
    }

    function back() {
        if (!S || S.done) return;
        var ci = S.cur;
        if (S.fill[ci] && !isLocked(ci)) {
            S.fill[ci] = '';
        } else {
            var prev = nextInWord(curWord(), ci, -1);
            if (prev < 0) return;
            if (!isLocked(prev)) S.fill[prev] = '';
            ci = prev;
            select(prev, S.dir, true);
        }
        paintCell(ci);
        paintClues();
        save();
    }

    function clearCell() {
        if (!S || S.done || isLocked(S.cur)) return;
        S.fill[S.cur] = '';
        paintCell(S.cur);
        paintClues();
        save();
    }

    /** Controlla le parole che passano da una casella: quelle complete e giuste diventano gol. */
    function checkWordsAt(ci) {
        var m = S.map[ci], done = [];
        ['a', 'd'].forEach(function (d) {
            var wi = m[d];
            if (wi == null || S.solved[wi]) return;
            var w = S.p.words[wi];
            var ok = w.cells.every(function (x, i) { return S.fill[x] === w.answer[i]; });
            if (ok) {
                var helped = w.cells.every(function (x) { return S.rev[x]; });
                solve(wi, helped ? 2 : 1);
                done.push(wi);
            }
        });
        return done;
    }

    function solve(wi, how) {
        var w = S.p.words[wi];
        S.solved[wi] = how;
        w.cells.forEach(function (x, i) {
            paintCell(x);
            var el = cellEls[x];
            el.style.setProperty('--d', (i * 40) + 'ms');
            QZ.fx.replay(el, 'is-goal');
        });
        paintClues();
        paintBoard();
        if (wi === curWord()) $('#xw-bar').classList.add('is-solved');
        var left = S.solved.filter(function (x) { return !x; }).length;
        if (how === 1) {
            QZ.sound.correct();
            QZ.vibrate(30);
            var mid = cellEls[w.cells[Math.floor(w.cells.length / 2)]];
            var x = (mid.offsetLeft + mid.offsetWidth / 2) / gridEl.offsetWidth * 100;
            var y = (mid.offsetTop + mid.offsetHeight / 2) / gridEl.offsetHeight * 100;
            QZ.fx.stamp(gridEl, left ? QZ.pick(['Gol!', 'Gol!', 'Rete!', 'Dentro!']) : 'Gol!', 'ok', {
                size: 20, rot: -4, x: QZ.clamp(x, 18, 82), y: QZ.clamp(y, 8, 92), ms: 1100, quiet: true,
                say: 'Gol! ' + w.n + ' ' + dirName(w.dir) + ': ' + w.answer + '. ' + (left ? 'Ne mancano ' + left + '.' : '')
            });
            QZ.fx.pop($('#xw-words'));
        }
        save();
        if (!left) finish('win');
    }

    var fullWarned = '';
    function checkFull() {
        if (S.done) return;
        var all = Object.keys(S.map).every(function (ci) { return S.fill[ci]; });
        if (!all) { fullWarned = ''; return; }
        var sig = S.fill.join('');
        if (sig === fullWarned) return;
        fullWarned = sig;
        QZ.toast('Griglia piena, ma qualcosa non torna. Prova «Controlla».', { icon: 'info', ms: 3200 });
        QZ.say('Griglia piena, ma qualche lettera è sbagliata.');
    }

    /* ---------- Input da tastiera e da telefono ---------- */
    inputEl.value = SENT;
    inputEl.addEventListener('keydown', function (e) {
        if (!canNav() || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        var k = e.key;
        if (k === 'Tab') {
            // Tab passa da una definizione all'altra; dall'ultima (o dalla prima con Maiusc) esce dalla griglia: nessuna trappola
            var wi = curWord(), last = S.p.words.length - 1;
            if ((!e.shiftKey && wi >= last) || (e.shiftKey && wi <= 0)) return;
            e.preventDefault();
            select(firstFreeCell(wi + (e.shiftKey ? -1 : 1)), S.p.words[wi + (e.shiftKey ? -1 : 1)].dir);
            return;
        }
        if (k === 'Escape') { e.preventDefault(); (S.review ? $('#xw-back-2') : $('[data-aid="check"]')).focus(); return; }
        if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); type(k.toUpperCase()); return; }
        var map = {
            Backspace: back, Delete: clearCell,
            ArrowLeft: function () { move(0, -1); }, ArrowRight: function () { move(0, 1); },
            ArrowUp: function () { move(-1, 0); }, ArrowDown: function () { move(1, 0); },
            Enter: function () { jumpWord(1); },
            ' ': function () { toggleDir(); }
        };
        if (map[k]) { e.preventDefault(); map[k](); }
    });
    inputEl.addEventListener('input', function () {
        if (!S || S.done) { inputEl.value = SENT; return; }
        var v = inputEl.value;
        if (!v) back();
        else {
            var letters = QZ.norm(v).toUpperCase().replace(/[^A-Z]/g, '');
            for (var i = 0; i < letters.length && !S.done; i++) type(letters[i]);
        }
        inputEl.value = SENT;
        try { inputEl.setSelectionRange(1, 1); } catch { /* campo non selezionabile */ }
    });
    inputEl.addEventListener('focus', function () { wrapEl.classList.add('is-focus'); });
    inputEl.addEventListener('blur', function () { wrapEl.classList.remove('is-focus'); });

    function toggleDir() {
        var o = OTHER[S.dir];
        if (S.map[S.cur][o] != null) select(S.cur, o);
    }

    gridEl.addEventListener('click', function (e) {
        var el = e.target.closest('.xw-cell');
        if (!el || !canNav()) return;
        var ci = Number(el.dataset.ci);
        if (ci === S.cur) toggleDir();
        else select(ci, S.dir);
        inputEl.focus({ preventScroll: true });
    });
    // il tocco sulla griglia non deve togliere il fuoco al campo (la tastiera del telefono resta su)
    gridEl.addEventListener('pointerdown', function (e) { if (document.activeElement === inputEl) e.preventDefault(); });

    $('#xw-prev').addEventListener('click', function () { if (canNav()) { jumpWord(-1); keepFocus(); } });
    $('#xw-next').addEventListener('click', function () { if (canNav()) { jumpWord(1); keepFocus(); } });
    $('#xw-bar-main').addEventListener('click', function () { if (canNav()) { toggleDir(); if (!S.review) inputEl.focus({ preventScroll: true }); } });
    ['#xw-prev', '#xw-next', '#xw-bar-main'].forEach(function (s) {
        $(s).addEventListener('pointerdown', function (e) { if (document.activeElement === inputEl) e.preventDefault(); });
    });
    /** Dopo frecce e aiuti si torna a scrivere; sul telefono la tastiera non si riapre se era chiusa. */
    function keepFocus() { if (document.activeElement === inputEl || matchMedia('(pointer: fine)').matches) inputEl.focus({ preventScroll: true }); }

    /* =====================================================================
       AIUTI
       ===================================================================== */
    function aidCheck() {
        if (!S || S.done) return;
        var wrong = [], filled = 0;
        Object.keys(S.map).forEach(function (k) {
            var ci = Number(k);
            if (!S.fill[ci] || isLocked(ci)) return;
            filled++;
            if (S.fill[ci] !== S.map[ci].ch) wrong.push(ci);
        });
        if (!filled) { QZ.toast('Prima scrivi qualcosa: non c\'è niente da controllare.', { icon: 'info' }); return; }
        S.aids.check++;
        paintBoard();
        QZ.sound.lifeline();
        if (!wrong.length) {
            QZ.toast('Tutto regolare: nessuna lettera sbagliata.', { icon: 'check', type: 'ok' });
            QZ.say('Controllo: nessuna lettera sbagliata.');
        } else {
            wrong.forEach(function (ci) {
                var el = cellEls[ci];
                el.classList.add('is-wrong');
                setTimeout(function () { el.classList.remove('is-wrong'); }, 2000);
            });
            QZ.sound.wrong();
            QZ.fx.shake(gridEl);
            var t = wrong.length === 1 ? 'Una lettera in fuorigioco.' : wrong.length + ' lettere in fuorigioco.';
            QZ.toast(t + ' Le vedi in rosso.', { icon: 'flag', type: 'bad' });
            QZ.say('Controllo: ' + t);
        }
        save();
    }

    function aidLetter() {
        if (!S || S.done) return;
        var wi = curWord(), ci = S.cur;
        if (isLocked(ci) || S.fill[ci] === S.map[ci].ch) {
            var w = S.p.words[wi];
            ci = w.cells.filter(function (x) { return !isLocked(x) && S.fill[x] !== S.map[x].ch; })[0];
            if (ci == null) ci = w.cells.filter(function (x) { return !isLocked(x); })[0];
        }
        if (ci == null) { QZ.toast('Questa parola è già a posto.', { icon: 'check' }); return; }
        S.aids.letter++;
        reveal(ci);
        QZ.sound.reveal();
        QZ.say('Lettera svelata: ' + S.map[ci].ch + '.');
        var solved = checkWordsAt(ci);
        paintBoard();
        if (S.done) return;
        if (solved.indexOf(wi) >= 0) { var nx = firstUnsolved(wi + 1, 1); if (nx >= 0) select(firstFreeCell(nx), S.p.words[nx].dir); }
        else { var nxt = nextInWord(wi, ci, 1); select(nxt >= 0 ? nxt : ci, S.dir, true); }
        paintClues();
        save();
    }

    function aidWord() {
        if (!S || S.done) return;
        var wi = curWord(), w = S.p.words[wi];
        if (S.solved[wi]) { QZ.toast('Questa parola è già risolta.', { icon: 'check' }); return; }
        S.aids.word++;
        w.cells.forEach(function (ci) { if (!isLocked(ci) && S.fill[ci] !== S.map[ci].ch) reveal(ci); });
        QZ.sound.reveal();
        S.solved[wi] = 2;
        w.cells.forEach(paintCell);
        QZ.say('Parola svelata: ' + w.n + ' ' + dirName(w.dir) + ', ' + w.answer + '.');
        // le parole incrociate possono essersi completate
        w.cells.forEach(function (ci) { if (!S.done) checkWordsAt(ci); });
        paintBoard();
        paintClues();
        if (S.done) return;
        var left = S.solved.filter(function (x) { return !x; }).length;
        if (!left) { finish('win'); return; }
        var nx = firstUnsolved(wi + 1, 1);
        if (nx >= 0) select(firstFreeCell(nx), S.p.words[nx].dir);
        save();
    }

    function reveal(ci) {
        S.fill[ci] = S.map[ci].ch;
        S.rev[ci] = 1;
        paintCell(ci);
        QZ.fx.replay(cellEls[ci], 'is-typed');
    }

    function surrender() {
        if (!S || S.done) return;
        QZ.confirm('Si scopre tutta la griglia e la partita finisce qui.', { title: 'Bandiera bianca?', okLabel: 'Mi arrendo', cancelLabel: 'Gioco ancora', danger: true }).then(function (ok) {
            if (!ok || !S || S.done) return;
            S.done = true;
            stopClock();
            QZ.say('Ecco la soluzione.');
            var cells = Object.keys(S.map).map(Number).filter(function (ci) { return S.fill[ci] !== S.map[ci].ch; });
            cells.forEach(function (ci, k) {
                setTimeout(function () {
                    S.fill[ci] = S.map[ci].ch;
                    S.rev[ci] = 1;
                    paintCell(ci);
                    cellEls[ci].classList.add('is-given');
                }, QZ.reducedMotion() ? 0 : Math.min(k * 18, 900));
            });
            setTimeout(function () { finish('quit'); }, QZ.reducedMotion() ? 900 : 2200);
        });
    }

    /* =====================================================================
       TABELLONE, CRONOMETRO, SALVATAGGIO
       ===================================================================== */
    function paintBoard() {
        var n = S.solved.filter(Boolean).length, tot = S.p.words.length;
        $('#xw-words').textContent = String(n).padStart(2, '0') + '/' + String(tot).padStart(2, '0');
        $('#xw-words').setAttribute('aria-label', n + ' parole risolte su ' + tot);
        var a = aidsCount();
        $('#xw-aids-n').textContent = a;
        $('#xw-aids-n').classList.toggle('led--red', a > 0);
        $('#xw-time').textContent = fmtTime(S.elapsed);
    }

    function startClock() {
        stopClock();
        var last = performance.now();
        clock = setInterval(function () {
            var now = performance.now();
            if (!S || S.done) return;
            if (document.hidden) { last = now; return; }
            S.elapsed += (now - last) / 1000;
            last = now;
            $('#xw-time').textContent = fmtTime(S.elapsed);
            if (Math.floor(S.elapsed) % 5 === 0) save();
        }, 1000);
    }
    function stopClock() { if (clock) clearInterval(clock); clock = null; }

    function save() {
        if (!S || S.done) return;
        var st = getStore();
        st.play[S.n] = {
            fill: S.fill, rev: S.rev, solved: S.solved, aids: S.aids,
            elapsed: Math.floor(S.elapsed), cur: S.cur, dir: S.dir
        };
        putStore(st);
    }

    /* =====================================================================
       FINE PARTITA
       ===================================================================== */
    function finish(type) {
        if (S.finished) return;
        S.done = true;
        S.finished = true;
        stopClock();
        try { inputEl.blur(); } catch { /* niente */ }
        var p = S.p, tot = p.words.length;
        var mine = S.solved.filter(function (x) { return x === 1; }).length;
        var revCells = Object.keys(S.map).filter(function (ci) { return S.rev[ci]; }).length;
        var aids = aidsCount();
        var target = S.total * 7;                      // ~7 secondi a casella: il passo di chi se la cava bene
        var speed = QZ.clamp(target / Math.max(S.elapsed, 1), 0, 1);
        var ratio;
        if (type === 'win') {
            var clean = QZ.clamp(1 - (revCells / S.total) * 1.6 - S.aids.check * 0.04, 0, 1);
            ratio = clean * (0.72 + 0.28 * speed);
        } else {
            ratio = (mine / tot) * 0.55;
        }

        // la scheda si chiude una volta sola: i punti si prendono alla prima
        var st = getStore();
        var first = !st.done[S.n];
        delete st.play[S.n];
        if (first) st.done[S.n] = { time: Math.floor(S.elapsed), ratio: Math.round(ratio * 1000) / 1000, aids: S.aids, mine: mine, tot: tot, quit: type !== 'win', date: Date.now() };
        putStore(st);
        var r = null;
        if (first) {
            var xp = mine * 5 + (type === 'win' ? 40 : 0) + (type === 'win' && !aids ? 25 : 0);
            r = QZ.profile.record('cruciverba', { xp: xp, label: 'N° ' + S.n + ' · ' + mine + '/' + tot + ' parole · ' + fmtTime(S.elapsed), score: Math.round(ratio * 100) });
        }
        var doneN = SCHEDE.filter(function (x) { return st.done[x.n]; }).length;
        var nx = nextOpen(S.n);

        var title, sub;
        if (type === 'win' && !aids) { title = 'Griglia pulita'; sub = 'Tutte e ' + tot + ' le parole senza chiedere niente alla panchina. In tribuna stampa si tolgono il cappello.'; }
        else if (type === 'win' && mine >= tot / 2) { title = 'Griglia chiusa'; sub = 'Qualche dritta dalla panchina, ma le parole decisive le hai trovate tu: ' + mine + ' su ' + tot + '.'; }
        else if (type === 'win') { title = 'Chiusa col VAR'; sub = 'La griglia è piena, ma più della metà l\'ha scritta la panchina. Nella prossima scheda prova da solo.'; }
        else if (mine) { title = 'Bandiera bianca'; sub = 'Ti fermi a ' + mine + (mine === 1 ? ' parola' : ' parole') + ' su ' + tot + '. La soluzione è qui sotto: ripassala per le prossime schede.'; }
        else { title = 'Non pervenuto'; sub = 'Nessuna parola trovata da solo. La soluzione è qui sotto: studiala e torna in campo.'; }

        setTimeout(function () {
            QZ.show('s-end');
            QZ.results($('#end-host'), {
                win: type === 'win',
                icon: type === 'win' ? 'trophy' : 'flag',
                title: title, subtitle: sub,
                record: r, ratio: ratio,
                stats: [
                    { label: 'Tempo', value: fmtTime(S.elapsed) },
                    { label: 'Parole tue', value: mine + '/' + tot },
                    { label: 'Aiuti', value: aids },
                    { label: 'Completati', value: doneN + '/' + SCHEDE.length }
                ],
                extraHTML: solutionHTML(),
                share: type === 'win'
                    ? 'Ho chiuso il Cruciverba N° ' + S.n + ' di Quizzotti in ' + fmtTime(S.elapsed) + (aids ? ' con ' + aids + (aids === 1 ? ' aiuto' : ' aiuti') : ' senza aiuti') + '. Ci provi?'
                    : 'Al Cruciverba N° ' + S.n + ' di Quizzotti ho trovato ' + mine + ' parole su ' + tot + '. Fai di meglio?',
                retryLabel: 'Torna alle schede',
                onRetry: backToList,
                secondary: nx ? { label: 'Prossimo cruciverba: N° ' + nx.n, icon: 'arrow', onClick: function () { open(nx.n); } } : null
            });
            QZ.say((type === 'win' ? 'Griglia completata in ' : 'Partita finita dopo ') + timeWords(S.elapsed) + '. Schede completate: ' + doneN + ' su ' + SCHEDE.length + '.');
        }, type === 'win' ? 1100 : 0);
    }

    /** La griglia risolta in piccolo, nel resoconto. */
    function solutionHTML() {
        var p = S.p;
        var html = '<div class="card xw-sol mt-3"><h2 class="xw-sol__title">La soluzione</h2>' +
            '<div class="xw-sol__grid" aria-hidden="true" style="--cols:' + p.w + ';--rows:' + p.h + '">';
        Object.keys(S.map).map(Number).forEach(function (ci) {
            var m = S.map[ci], r = Math.floor(ci / p.w), c = ci % p.w;
            var mineCell = (m.a != null && S.solved[m.a] === 1) || (m.d != null && S.solved[m.d] === 1);
            html += '<span class="' + (mineCell ? 'is-mine' : '') + '" style="grid-row:' + (r + 1) + ';grid-column:' + (c + 1) + '">' + m.ch + '</span>';
        });
        html += '</div><ul class="xw-sol__list">' + p.words.map(function (w, wi) {
            return '<li><b>' + w.n + (w.dir === 'a' ? ' oriz.' : ' vert.') + '</b> ' + QZ.esc(w.answer) + (S.solved[wi] === 1 ? '' : ' <span class="faint">(non tua)</span>') + '</li>';
        }).join('') + '</ul></div>';
        return html;
    }
})();
