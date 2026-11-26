/* ==========================================================================
   QUIZZOTTI v2 — Il cruciverba del pallone
   Dati: assets/cruciverba-schede.js (`cruciverbaSchede`), schede fisse e
   numerate costruite da scripts/build-cruciverba.js a partire da
   assets/db-cruciverba.js. Ogni scheda ha un tema (Nazionale, Champions,
   Mondiali...). Il N° 1 e' sempre la stessa griglia: una volta
   completata resta da rivedere, non da rigiocare. Ogni scheda ha il suo
   salvataggio: si puo' lasciare a meta' e riprenderla quando si vuole.
   Sul telefono la parola corrente sta in grande in una striscia ferma
   sopra la tastiera (caselle tappabili) e la casella attiva resta in vista.
   ========================================================================== */
/* global cruciverbaSchede, cruciverbaErrata */
(function () {
    'use strict';

    var STEP = { a: [0, 1], d: [1, 0] };
    var OTHER = { a: 'd', d: 'a' };
    // v3: le 7 schede a tema; i progressi sulle vecchie 5 schede (v2) non valgono piu'
    var STORE_KEY = 'qz.cruciverba.v3';
    var TEMI = {
        nazionale: 'Nazionale', champions: 'Champions', mondiali: 'Mondiali', bandiere: 'Bandiere',
        mercato: 'Calciomercato', bar: 'Bar dello sport', stadi: 'Stadi e curve',
        anni90: 'Anni \'90', mister: 'Mister', estero: 'Calcio estero'
    };
    function temaLabel(id) { return TEMI[id] || ''; }

    /* =====================================================================
       LE SCHEDE
       ===================================================================== */
    // le schede pubblicate non cambiano mai (i progressi sono salvati casella per casella),
    // ma una definizione invecchiata si corregge qui: risposta -> definizione nuova
    var ERRATA = typeof cruciverbaErrata !== 'undefined' && cruciverbaErrata ? cruciverbaErrata : {};
    var SCHEDE = (typeof cruciverbaSchede !== 'undefined' && Array.isArray(cruciverbaSchede) ? cruciverbaSchede : []).map(function (p) {
        return {
            n: p.n, tema: p.tema || '', title: p.title, sottotitolo: p.sottotitolo || '', w: p.w, h: p.h,
            words: p.words.map(function (x) {
                var clue = Object.prototype.hasOwnProperty.call(ERRATA, x.answer) ? ERRATA[x.answer] : x.clue;
                return { answer: x.answer, clue: clue, r: x.row, c: x.col, dir: x.dir === 'D' ? 'd' : 'a', n: x.num };
            })
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

    /** La bacheca: griglie chiuse (rese escluse), quelle senza aiuti, voto medio e la piu' veloce. */
    function records(st) {
        var wins = SCHEDE.map(function (p) { var d = st.done[p.n]; return d && !d.quit ? { n: p.n, d: d } : null; }).filter(Boolean);
        if (!wins.length) return { wins: 0 };
        var best = wins.reduce(function (a, b) { return b.d.time < a.d.time ? b : a; });
        var media = wins.reduce(function (s, x) { return s + QZ.pagella(x.d.ratio || 0).voto; }, 0) / wins.length;
        return {
            wins: wins.length,
            clean: wins.filter(function (x) { var a = x.d.aids || {}; return !(a.letter || a.word); }).length,
            media: (Math.round(media * 10) / 10).toFixed(1).replace('.', ',').replace(',0', ''),
            best: { n: best.n, time: best.d.time || 0 }
        };
    }

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
        ['Ogni scheda ha il suo tema:', 'dalla Nazionale al calciomercato, dagli anni \'90 ai campionati esteri. Uguali per tutti; chiusa una, resta in bacheca.'],
        ['Tocca una casella', 'e scrivi. Toccala di nuovo per passare da orizzontale a verticale.'],
        ['Niente suggerimenti in corsa:', 'scrivi tutto, correggi quanto vuoi. Nessuna parola si accende prima del tempo.'],
        ['Verifica quando vuoi:', 'le lettere giuste diventano verdi, le sbagliate rosse. Correggi e riprova: tentativi infiniti, la scheda si chiude solo quando è tutta giusta.'],
        ['Due aiuti dalla panchina:', 'svela una lettera o una parola intera. Ognuno pesa sul voto.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');

    var AIDS = [
        { id: 'verify', label: 'Verifica', ico: 'check', fn: verify, cls: 'xw-aid--verify' },
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
    $('#xw-dprev').innerHTML = QZ.icon('left');
    $('#xw-dnext').innerHTML = QZ.icon('right');
    $('#xw-back').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#xw-back-2').innerHTML = QZ.icon('back') + 'Torna alle schede';
    $('#xw-back').addEventListener('click', backToList);
    $('#xw-back-2').addEventListener('click', backToList);
    // nessun ordine obbligato: il bottone porta alle schede, si sceglie quale giocare
    $('#start-btn').addEventListener('click', function () {
        var list = $('#xw-cards');
        list.scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        var first = list.querySelector('.xw-card');
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
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
        btn.innerHTML = 'Scegli la scheda' + QZ.icon('arrow');
        var rec = records(st);
        $('#start-record').textContent = !SCHEDE.length ? 'Le schede stanno arrivando in sala stampa: riprova tra poco.'
            : (!nx ? 'Tutte le schede completate. Nuove griglie in arrivo: torna a trovarci. ' : '') +
              (rec.wins ? 'In bacheca: ' + rec.wins + (rec.wins === 1 ? ' griglia chiusa' : ' griglie chiuse') +
                (rec.clean ? ', ' + rec.clean + ' senza aiuti' : '') +
                ' · voto medio ' + rec.media + ' · record di velocità ' + fmtTime(rec.best.time) + ' (N° ' + rec.best.n + ').' : '');
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
                var solved = wordsFilled(p, play.fill);
                detail = '<span class="xw-card__led"><span class="led">' + solved + '/' + p.words.length + '</span><span class="led">' + fmtTime(play.elapsed) + '</span></span>';
            } else {
                cls = 'is-new';
                status = 'Nuovo';
                action = 'Gioca';
            }
            var label = 'Cruciverba numero ' + p.n + ', tema ' + temaLabel(p.tema) + ': ' + p.title + '. ' + p.sottotitolo + '. ' + p.words.length + ' parole. ' + status +
                (d ? (d.quit ? '' : ', voto ' + votoOf(d.ratio)) + ', tempo ' + timeWords(d.time) : play ? ', ' + wordsFilled(p, play.fill) + ' parole scritte su ' + p.words.length : '') + '. ' + action;
            return '<li style="--i:' + i + '"><button type="button" class="xw-card ' + cls + '" data-n="' + p.n + '" aria-label="' + QZ.esc(label) + '">' +
                '<span class="xw-card__top"><span class="xw-card__n">N° ' + p.n + '</span><span class="xw-card__status">' + status + '</span></span>' +
                (p.tema ? '<span class="xw-card__tema">' + QZ.esc(temaLabel(p.tema)) + '</span>' : '') +
                '<span class="xw-card__title">' + QZ.esc(p.title) + '</span>' +
                (p.sottotitolo ? '<span class="xw-card__sub">' + QZ.esc(p.sottotitolo) + '</span>' : '') +
                '<span class="xw-card__meta">' + p.w + '×' + p.h + ' · ' + p.words.length + ' parole</span>' +
                detail +
                '<span class="xw-card__go">' + action + QZ.icon('arrow') + '</span></button></li>';
        }).join('');
    }

    /** Parole con tutte le caselle scritte (giuste o no: si sa solo alla verifica). */
    function wordsFilled(p, fill) {
        return p.words.filter(function (w) {
            for (var i = 0; i < w.answer.length; i++) {
                var ci = (w.r + (w.dir === 'd' ? i : 0)) * p.w + w.c + (w.dir === 'a' ? i : 0);
                if (!fill[ci]) return false;
            }
            return true;
        }).length;
    }

    function backToList() {
        if (S && !S.done) save();
        stopClock();
        S = null;
        dockPlay(false);
        paintIntro();
        QZ.show('s-start');
    }

    /* =====================================================================
       FLUSSO
       ===================================================================== */
    function blank(p) {
        var size = p.w * p.h;
        return {
            fill: new Array(size).fill(''), rev: new Array(size).fill(0), ok: new Array(size).fill(0), solved: new Array(p.words.length).fill(0),
            aids: { check: 0, letter: 0, word: 0 }, verifies: 0, elapsed: 0, cur: -1, dir: 'a'
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
            n: p.n, p: { n: p.n, tema: p.tema, title: p.title, w: p.w, h: p.h, words: p.words.map(function (w) { return Object.assign({}, w); }) },
            fill: play.fill.slice(), rev: play.rev.slice(), solved: play.solved.slice(),
            ok: Array.isArray(play.ok) && play.ok.length === play.fill.length ? play.ok.slice() : new Array(play.fill.length).fill(0),
            verifies: play.verifies || 0,
            aids: Object.assign({ check: 0, letter: 0, word: 0 }, play.aids), elapsed: play.elapsed || 0,
            cur: play.cur, dir: play.dir || 'a', done: !!review, review: review
        };
        index();
        if (review) Object.keys(S.map).forEach(function (ci) { S.fill[ci] = S.map[ci].ch; });
        $('#xw-title').textContent = 'N° ' + p.n + (p.tema ? ' · ' + temaLabel(p.tema) : '') + ' · ' + p.title;
        $('#s-game').classList.toggle('is-review', !!review);
        dockPlay(!review);
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
        return !!(S.rev[ci] || S.ok[ci] || (m.a != null && S.solved[m.a]) || (m.d != null && S.solved[m.d]));
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
        el.classList.toggle('is-solved', !!solved && !!(S.review || S.verified));
        el.classList.toggle('is-rev', !!S.rev[ci]);
        el.classList.toggle('is-right', !!S.ok[ci] && !S.rev[ci]);
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
        paintDock(true);
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

    /* ---------- La striscia della parola corrente (telefono) ---------- */
    var dockEl = $('#xw-dock');
    // fuori dalla schermata: le animazioni delle schermate (transform) sposterebbero una striscia "fixed"
    document.body.appendChild(dockEl);
    /** La striscia c'e' solo mentre si gioca una scheda (non in revisione, non nel resoconto). */
    function dockPlay(on) { document.body.classList.toggle('xw-play', !!on); if (!on) setDockVars(0); }
    var dockCells = $('#xw-dcells');
    var dockWord = -1;
    function dockOn() { return !!S && getComputedStyle(dockEl).display !== 'none'; }

    /** Le caselle grandi copiano lo stato di quelle della griglia (lettera e colori). */
    function paintDock(resize) {
        if (!dockOn()) { setDockVars(0); return; }
        var wi = curWord();
        if (wi < 0) return;
        var w = S.p.words[wi];
        if (wi !== dockWord || resize || dockCells.children.length !== w.cells.length) {
            dockWord = wi;
            dockCells.innerHTML = w.cells.map(function (ci) { return '<button type="button" class="xw-dcell" tabindex="-1" data-ci="' + ci + '"></button>'; }).join('');
            var cs = getComputedStyle(dockEl), n = w.cells.length;
            var avail = dockEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            dockCells.style.setProperty('--dcs', Math.max(18, Math.min(44, Math.floor((avail - 4 * (n - 1)) / n))) + 'px');
        }
        $('#xw-dref').textContent = w.n + ' ' + dirName(w.dir) + ' · ' + w.answer.length + ' lettere';
        $('#xw-dtxt').textContent = w.clue;
        dockEl.classList.toggle('is-solved', !!S.solved[wi]);
        QZ.$$('.xw-dcell', dockCells).forEach(function (b) {
            var src = cellEls[Number(b.dataset.ci)];
            if (!src) return;
            b.textContent = src.querySelector('.xw-ch').textContent;
            ['is-cur', 'is-right', 'is-solved', 'is-rev', 'is-wrong'].forEach(function (c) { b.classList.toggle(c, src.classList.contains(c)); });
        });
        setDockVars(dockEl.offsetHeight);
    }
    function setDockVars(h) { document.documentElement.style.setProperty('--xw-dock-h', h + 'px'); }

    /** Quanto copre la tastiera del telefono: la striscia ci si appoggia sopra. */
    function keyboardH() {
        var vv = window.visualViewport;
        return vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    }
    function placeDock() {
        var kb = keyboardH();
        document.documentElement.style.setProperty('--xw-kb', kb + 'px');
        dockEl.classList.toggle('is-keyboard', kb > 0);
    }

    /** La casella attiva non finisce mai sotto la striscia (o sotto la testata): si scorre quanto basta. */
    function keepVisible() {
        if (!dockOn() || !cellEls[S.cur]) return;
        var vv = window.visualViewport;
        var vTop = vv ? vv.offsetTop : 0, vH = vv ? vv.height : window.innerHeight;
        var r = cellEls[S.cur].getBoundingClientRect();
        var top = vTop + headerOffset() + 8;
        var bottom = vTop + vH - dockEl.offsetHeight - 10;
        var dy = r.bottom > bottom ? r.bottom - bottom : r.top < top ? r.top - top : 0;
        if (dy) window.scrollBy({ top: dy, behavior: 'auto' });
    }

    // aiuti, verifica e cancellazioni cambiano la griglia: la striscia la segue
    var dockRaf = 0;
    new window.MutationObserver(function () {
        if (dockRaf) return;
        dockRaf = requestAnimationFrame(function () { dockRaf = 0; if (S) paintDock(); });
    }).observe(gridEl, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true, characterData: true });

    if (window.visualViewport) {
        ['resize', 'scroll'].forEach(function (ev) {
            window.visualViewport.addEventListener(ev, function () {
                placeDock();
                if (ev === 'resize') { clearTimeout(placeDock.t); placeDock.t = setTimeout(function () { if (S) keepVisible(); }, 60); }
            });
        });
    }
    placeDock();

    dockCells.addEventListener('click', function (e) {
        var b = e.target.closest('.xw-dcell');
        if (!b || !canNav()) return;
        select(Number(b.dataset.ci), S.p.words[curWord()].dir);
        inputEl.focus({ preventScroll: true });
    });
    $('#xw-dprev').addEventListener('click', function () { if (canNav()) { jumpWord(-1); keepFocus(); } });
    $('#xw-dnext').addEventListener('click', function () { if (canNav()) { jumpWord(1); keepFocus(); } });
    $('#xw-dclue').addEventListener('click', function () { if (canNav()) { toggleDir(); inputEl.focus({ preventScroll: true }); } });
    // toccare la striscia non chiude la tastiera
    dockEl.addEventListener('pointerdown', function (e) { if (document.activeElement === inputEl) e.preventDefault(); });

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
        paintDock();
        keepVisible();

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
        var nxt = nextInWord(wi, ci, 1);
        if (nxt < 0) {
            var w = S.p.words[wi];
            var empty = w.cells.filter(function (x) { return !S.fill[x] && !isLocked(x); })[0];
            nxt = empty != null ? empty : ci;
        }
        select(nxt, S.dir, true);
        paintClues();
        paintBoard();
        save();
        checkFull();
    }

    function back() {
        if (!S || S.done) return;
        var ci = S.cur;
        if (S.fill[ci] && !isLocked(ci)) {
            S.fill[ci] = '';
            cellEls[ci].classList.remove('is-wrong');
        } else {
            var prev = nextInWord(curWord(), ci, -1);
            if (prev < 0) return;
            if (!isLocked(prev)) { S.fill[prev] = ''; cellEls[prev].classList.remove('is-wrong'); }
            ci = prev;
            select(prev, S.dir, true);
        }
        paintCell(ci);
        paintClues();
        paintBoard();
        save();
    }

    function clearCell() {
        if (!S || S.done || isLocked(S.cur)) return;
        S.fill[S.cur] = '';
        cellEls[S.cur].classList.remove('is-wrong');
        paintCell(S.cur);
        paintClues();
        save();
    }

    var fullWarned = '';
    function checkFull() {
        if (S.done) return;
        // l'avviso arriva una volta sola per scheda, e mai dopo una verifica
        if (fullWarned === S.n || S.verifies) return;
        var all = Object.keys(S.map).every(function (ci) { return S.fill[ci]; });
        if (!all) return;
        fullWarned = S.n;
        QZ.toast('Griglia piena. Quando sei convinto, premi «Verifica».', { icon: 'check', ms: 3400 });
        QZ.say('Griglia piena. Quando sei pronto, premi Verifica.');
        QZ.fx.pop($('[data-aid="verify"]'));
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
        if (k === 'Escape') { e.preventDefault(); (S.review ? $('#xw-back-2') : $('[data-aid="verify"]')).focus(); return; }
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
    /* ---------- La verifica: quante volte vuoi, la scheda si chiude solo tutta giusta ---------- */
    function verify() {
        if (!S || S.done) return;
        var cells = Object.keys(S.map).map(Number);
        // niente da controllare (griglia vuota, o solo lettere gia' confermate): la verifica non si conta
        // (anche le lettere rosse non ancora corrette non sono una novita')
        S.checked = S.checked || {};
        var pending = cells.some(function (ci) { return S.fill[ci] && !S.ok[ci] && !S.rev[ci] && S.checked[ci] !== S.fill[ci]; });
        var bad = cells.filter(function (ci) { return S.fill[ci] && S.checked[ci] === S.fill[ci] && S.fill[ci] !== S.map[ci].ch; });
        var knownBad = bad.length > 0;
        if (!pending && (knownBad || cells.some(function (ci) { return !S.fill[ci]; }))) {
            // le lettere gia' bocciate tornano rosse (riscriverle uguali toglie il colore)
            bad.forEach(function (ci) { if (cellEls[ci]) cellEls[ci].classList.add('is-wrong'); });
            var msg = knownBad ? 'Prima correggi le lettere rosse, poi riverifica.' : 'Niente di nuovo da verificare: scrivi qualche lettera e poi riprova.';
            QZ.toast(msg, { icon: 'check', ms: 2800 });
            QZ.say(msg);
            keepFocus();
            return;
        }
        S.verifies++;
        var wrong = [], empty = 0, newOk = 0;
        cells.forEach(function (ci) {
            if (!S.fill[ci]) { empty++; return; }
            if (S.fill[ci] === S.map[ci].ch) {
                if (!S.ok[ci]) { S.ok[ci] = 1; newOk++; }
                cellEls[ci].classList.remove('is-wrong');
            } else {
                wrong.push(ci);
                S.checked[ci] = S.fill[ci];
            }
            paintCell(ci);
        });
        // le parole tutte confermate si chiudono: si saltano scrivendo
        S.p.words.forEach(function (w, wi) {
            if (!S.solved[wi] && w.cells.every(function (x) { return S.ok[x] || S.rev[x]; })) S.solved[wi] = w.cells.every(function (x) { return S.rev[x]; }) ? 2 : 1;
        });
        var G = S;
        wrong.forEach(function (ci, k) {
            var el = cellEls[ci];
            // se nel frattempo la lettera e' stata corretta (o si e' usciti dalla scheda) non si colora
            setTimeout(function () { if (el && S === G && G.fill[ci] !== G.map[ci].ch) el.classList.add('is-wrong'); }, QZ.reducedMotion() ? 0 : Math.min(k * 25, 500));
        });
        paintClues();
        paintBoard();
        save();
        if (!wrong.length && !empty) {
            S.verified = true;
            try { inputEl.blur(); } catch { /* niente */ }
            QZ.sound.correct();
            // l'onda verde parte dall'angolo in alto a sinistra
            cells.forEach(function (ci) {
                paintCell(ci);
                var el = cellEls[ci];
                if (!el || QZ.reducedMotion()) return;
                el.style.setProperty('--d', Math.min((Math.floor(ci / S.p.w) + ci % S.p.w) * 35, 900) + 'ms');
                el.classList.add('is-goal');
            });
            QZ.fx.stamp(gridEl, 'Perfetta!', 'ok', { size: 26, x: 50, y: 50, ms: 1500, say: 'Verifica: griglia tutta giusta.' });
            finish('win');
            return;
        }
        var parts = [];
        if (wrong.length) parts.push(wrong.length === 1 ? 'una lettera sbagliata' : wrong.length + ' lettere sbagliate');
        if (empty) parts.push(empty === 1 ? 'una casella vuota' : empty + ' caselle vuote');
        var txt = parts.join(' e ');
        txt = txt.charAt(0).toUpperCase() + txt.slice(1) + '.';
        if (wrong.length) { QZ.sound.wrong(); QZ.fx.shake(gridEl); } else QZ.sound.pop();
        QZ.toast(txt + (wrong.length ? ' Le rosse sono da correggere, le verdi sono giuste.' : ' Quelle scritte sono tutte giuste.'), { icon: wrong.length ? 'flag' : 'check', type: wrong.length ? 'bad' : 'ok', ms: 3600 });
        QZ.say('Verifica numero ' + S.verifies + ': ' + txt + (newOk ? ' ' + newOk + ' lettere confermate.' : ''));
        // si riparte dalla prima casella da sistemare
        var target = wrong[0] != null ? wrong[0] : cells.filter(function (ci) { return !S.fill[ci]; })[0];
        if (target != null) {
            var m = S.map[target];
            select(target, m[S.dir] != null ? S.dir : (m.a != null ? 'a' : 'd'), true);
            keepFocus();
        }
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
        paintBoard();
        var nxt = nextInWord(wi, ci, 1);
        select(nxt >= 0 ? nxt : ci, S.dir, true);
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
        paintBoard();
        paintClues();
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
            var G = S;
            QZ.say('Ecco la soluzione.');
            var cells = Object.keys(G.map).map(Number).filter(function (ci) { return G.fill[ci] !== G.map[ci].ch; });
            // l'esito si salva subito: anche uscendo durante l'animazione la resa resta registrata
            finish('quit', QZ.reducedMotion() ? 900 : 2200);
            cells.forEach(function (ci, k) {
                setTimeout(function () {
                    if (S !== G) return;
                    G.fill[ci] = G.map[ci].ch;
                    G.rev[ci] = 1;
                    paintCell(ci);
                    if (cellEls[ci]) cellEls[ci].classList.add('is-given');
                }, QZ.reducedMotion() ? 0 : Math.min(k * 18, 900));
            });
        });
    }

    /* =====================================================================
       TABELLONE, CRONOMETRO, SALVATAGGIO
       ===================================================================== */
    function paintBoard() {
        var n = S.verified ? S.solved.filter(function (x) { return x === 1; }).length : wordsFilled(S.p, S.fill), tot = S.p.words.length;
        $('#xw-words').textContent = String(n).padStart(2, '0') + '/' + String(tot).padStart(2, '0');
        $('#xw-words').setAttribute('aria-label', n + (S.verified ? ' parole giuste su ' : ' parole scritte su ') + tot);
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
    // chiudendo la scheda del browser o passando a un'altra app non si perdono gli ultimi secondi
    document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
    window.addEventListener('pagehide', function () { save(); });

    function save() {
        if (!S || S.done) return;
        var st = getStore();
        st.play[S.n] = {
            fill: S.fill, rev: S.rev, ok: S.ok, solved: S.solved, aids: S.aids, verifies: S.verifies,
            elapsed: Math.floor(S.elapsed), cur: S.cur, dir: S.dir
        };
        putStore(st);
    }

    /* =====================================================================
       FINE PARTITA
       ===================================================================== */
    /**
     * Chiude la scheda: esito e punti si salvano SUBITO, il resoconto arriva dopo
     * `delay` ms (il tempo dell'animazione), solo se si e' ancora su questa scheda.
     */
    function finish(type, delay) {
        if (!S || S.finished) return;
        var G = S;
        G.done = true;
        G.finished = true;
        stopClock();
        try { inputEl.blur(); } catch { /* niente */ }
        var tot = G.p.words.length;
        var mine = G.solved.filter(function (x) { return x === 1; }).length;
        var revCells = Object.keys(G.map).filter(function (ci) { return G.rev[ci]; }).length;
        var aids = aidsCount();
        var target = G.total * 7;                      // ~7 secondi a casella: il passo di chi se la cava bene
        var speed = QZ.clamp(target / Math.max(G.elapsed, 1), 0, 1);
        var clean = QZ.clamp(1 - (revCells / G.total) * 1.6 - Math.max(0, G.verifies - 1) * 0.04, 0, 1);
        var ratio = type === 'win' ? clean * (0.72 + 0.28 * speed) : (mine / tot) * 0.55;
        var time = Math.floor(G.elapsed);

        // la scheda si chiude una volta sola: i punti si prendono alla prima
        var st = getStore();
        var prevBest = records(st);
        var first = !st.done[G.n];
        delete st.play[G.n];
        if (first) st.done[G.n] = { time: time, ratio: Math.round(ratio * 1000) / 1000, aids: G.aids, mine: mine, tot: tot, quit: type === 'quit', verifies: G.verifies || 0, date: Date.now() };
        putStore(st);
        var speedRecord = first && type === 'win' && prevBest.wins > 0 && time < prevBest.best.time;
        var r = null;
        if (first) {
            var xp = mine * 5 + (type === 'win' ? 40 : 0) + (type === 'win' && !aids ? 25 : 0);
            r = QZ.profile.record('cruciverba', { xp: xp, label: 'N° ' + G.n + ' ' + G.p.title + ' · ' + mine + '/' + tot + ' parole · ' + fmtTime(time), score: Math.round(ratio * 100) });
        }
        var doneN = SCHEDE.filter(function (x) { return st.done[x.n]; }).length;
        var nx = nextOpen(G.n);

        var title, sub;
        if (type === 'win' && !aids && G.verifies <= 1) { title = 'Griglia pulita'; sub = 'Tutte e ' + tot + ' le parole al primo colpo, senza chiedere niente alla panchina. In tribuna stampa si tolgono il cappello.'; }
        else if (type === 'win' && !aids) { title = 'Chiusa al ' + G.verifies + '° tentativo'; sub = 'Tutte e ' + tot + ' le parole senza aiuti, con ' + (G.verifies - 1) + (G.verifies === 2 ? ' correzione' : ' correzioni') + ' dopo la verifica. Testa e pazienza.'; }
        else if (type === 'win' && mine >= tot / 2) { title = 'Griglia chiusa'; sub = 'Qualche dritta dalla panchina, ma le parole decisive le hai trovate tu: ' + mine + ' su ' + tot + '.'; }
        else if (type === 'win') { title = 'Chiusa col VAR'; sub = 'La griglia è piena, ma più della metà l\'ha scritta la panchina. Nella prossima scheda prova da solo.'; }
        else if (mine) { title = 'Bandiera bianca'; sub = 'Ti fermi a ' + mine + (mine === 1 ? ' parola confermata' : ' parole confermate') + ' su ' + tot + '. La soluzione è qui sotto: ripassala per le prossime schede.'; }
        else { title = 'Non pervenuto'; sub = 'Nessuna parola confermata dalla verifica. La soluzione è qui sotto: studiala e torna in campo.'; }
        if (speedRecord) sub += ' E in più è il tuo record di velocità: ' + fmtTime(time) + ', meglio del N° ' + prevBest.best.n + '.';
        var voto = votoOf(ratio);

        setTimeout(function () {
            if (S !== G) return;   // nel frattempo si e' tornati alle schede: l'esito e' gia' salvato
            dockPlay(false);
            QZ.show('s-end');
            QZ.results($('#end-host'), {
                win: type === 'win',
                icon: type === 'win' ? 'trophy' : 'flag',
                title: title, subtitle: sub,
                record: r, ratio: ratio,
                stats: [
                    { label: 'Tempo', value: fmtTime(time) },
                    { label: 'Parole tue', value: mine + '/' + tot },
                    { label: 'Aiuti', value: aids },
                    { label: 'Verifiche', value: G.verifies || 0 },
                    { label: 'Completati', value: doneN + '/' + SCHEDE.length }
                ],
                extraHTML: solutionHTML(),
                share: type === 'win' && !aids ? 'Griglia perfetta al Cruciverba N° ' + G.n + ' (' + G.p.title + ') di Quizzotti: ' + fmtTime(time) + ', zero aiuti, voto ' + voto + '. Ci provi?'
                    : type === 'win'
                        ? 'Ho chiuso il Cruciverba N° ' + G.n + ' (' + G.p.title + ') di Quizzotti in ' + fmtTime(time) + ' con ' + aids + (aids === 1 ? ' aiuto' : ' aiuti') + ', voto ' + voto + '. Ci provi?'
                        : 'Al Cruciverba N° ' + G.n + ' (' + G.p.title + ') di Quizzotti ho alzato bandiera bianca a ' + mine + ' parole su ' + tot + '. Fai di meglio?',
                retryLabel: 'Torna alle schede',
                onRetry: backToList,
                secondary: nx ? { label: 'Prossimo cruciverba: N° ' + nx.n, icon: 'arrow', onClick: function () { open(nx.n); } } : null
            });
            QZ.say((type === 'win' ? 'Griglia completata in ' : 'Partita finita dopo ') + timeWords(time) + '. Schede completate: ' + doneN + ' su ' + SCHEDE.length + '.');
        }, delay != null ? delay : (QZ.reducedMotion() ? 600 : 1900));
    }

    /** La griglia risolta in piccolo, nel resoconto. */
    function solutionHTML() {
        var p = S.p;
        var html = '<div class="card xw-sol mt-3"><h2 class="xw-sol__title">La soluzione</h2>' +
            '<div class="xw-sol__grid" aria-hidden="true" style="--cols:' + p.w + ';--rows:' + p.h + '">';
        Object.keys(S.map).map(Number).forEach(function (ci) {
            var m = S.map[ci], r = Math.floor(ci / p.w), c = ci % p.w;
            var mineCell = (m.a != null && S.solved[m.a] === 1) || (m.d != null && S.solved[m.d] === 1);
            var badCell = S.verified && S.fill[ci] !== m.ch;
            html += '<span class="' + (badCell ? 'is-bad' : mineCell ? 'is-mine' : '') + '" style="grid-row:' + (r + 1) + ';grid-column:' + (c + 1) + '">' + m.ch + '</span>';
        });
        html += '</div><ul class="xw-sol__list">' + p.words.map(function (w, wi) {
            var typed = w.cells.map(function (x) { return S.fill[x] || '·'; }).join('');
            var note = S.solved[wi] === 1 ? ' <span class="ok">✓</span>'
                : S.solved[wi] === 2 ? ' <span class="faint">(svelata)</span>'
                    : S.verified && typed !== w.answer ? ' <span class="bad">✗ tu: ' + QZ.esc(typed) + '</span>' : ' <span class="faint">(non tua)</span>';
            return '<li><b>' + w.n + (w.dir === 'a' ? ' oriz.' : ' vert.') + '</b> ' + QZ.esc(w.answer) + note + '</li>';
        }).join('') + '</ul></div>';
        return html;
    }
})();
