/* ==========================================================================
   QUIZZOTTI v2 — La Catena
   Dati: assets/db-catena.js (`chains`: { words[8], links[7] }).
   Otto parole legate a due a due; si vedono la prima e l'ultima, delle sei
   in mezzo solo l'iniziale. La squadra di turno attacca la catena dall'alto
   o dal basso (la parola subito dopo/prima di una già scoperta); chi tiene
   il telefono fa il presentatore: vede soluzione e spiegazione del legame e
   preme Giusto o Sbagliato (oppure si scrive la risposta).
   Giusto: punti alla squadra (10, meno 2 per ogni lettera regalata, minimo 2)
   e si continua. Sbagliato: si accende una lettera in più e la palla passa.
   Vince chi ha più punti dopo 3, 5 o 8 catene.
   Novembre 2026: verdetti protetti dal doppio tocco, tasto "Annulla" per il
   presentatore che ha sbagliato bottone, partita salvata a ogni mossa (si
   riprende dopo una ricarica o il tasto Indietro: chiave qz.catena.partita),
   serie più lunga di ogni squadra, punti catena per catena e bilancio tra le
   due squadre su questo telefono (chiave qz.catena.albo).
   ========================================================================== */
/* global chains */
(function () {
    'use strict';

    /* ======================================================================
       Logica pura (senza pagina): la provano i test in tests/catena.test.js
       ====================================================================== */
    var BASE = 10, STEP = 2, MIN = 2;
    var SAVE_KEY = 'qz.catena.partita', ALBO_KEY = 'qz.catena.albo';
    var SAVE_TTL = 12 * 3600 * 1000;

    function norm(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
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
    function isLetter(ch) { return norm(ch) !== ''; }
    // "il pallone", "l'oro", "la pecora": l'articolo davanti non conta
    var LEAD = /^(il|lo|la|i|gli|le|l|un|uno|una|di|del|dello|della|dei|degli|delle|a|al|allo|alla|ai|agli|alle|in|nel|nella)\s+/;
    function bare(s) {
        var n = norm(s), prev;
        do { prev = n; n = n.replace(LEAD, ''); } while (n !== prev);
        return n.replace(/ /g, '');
    }
    /** Risposta scritta: accenti, apostrofi, articoli e piccoli refusi non contano */
    function matches(said, answer) {
        var a = norm(answer).replace(/ /g, '');
        if (!a) return false;
        var tol = a.length <= 4 ? 0 : a.length <= 8 ? 1 : 2;
        return [norm(said).replace(/ /g, ''), bare(said)].some(function (s) {
            return !!s && Math.abs(s.length - a.length) <= tol && distance(s, a) <= tol;
        });
    }
    /** Lettere visibili all'inizio: tutto per prima e ultima, l'iniziale (più spazi e apostrofi) per le altre */
    function initialShown(words) {
        return words.map(function (w, i) {
            var first = true;
            return w.split('').map(function (ch) {
                if (i === 0 || i === words.length - 1 || !isLetter(ch)) return true;
                if (first) { first = false; return true; }
                return false;
            });
        });
    }
    function shownLetters(w, shown) {
        return w.split('').filter(function (ch, k) { return shown[k] && isLetter(ch); }).length;
    }
    /** Quanto vale la parola: 10 con la sola iniziale, 2 in meno per ogni lettera regalata, mai sotto 2 */
    function valueOf(w, shown) { return Math.max(MIN, BASE - STEP * (shownLetters(w, shown) - 1)); }
    /** Accende la prossima lettera nascosta, mai l'ultima: la parola va sempre detta. Restituisce l'indice o -1 */
    function revealNext(shown) {
        var hidden = [];
        shown.forEach(function (s, k) { if (!s) hidden.push(k); });
        if (hidden.length <= 1) return -1;
        shown[hidden[0]] = true;
        return hidden[0];
    }
    /** Le due parole attaccabili: la prima nascosta dall'alto e l'ultima dal basso (-1 a catena chiusa) */
    function frontier(solved) {
        var top = -1, bottom = -1;
        for (var i = 1; i < solved.length - 1; i++) if (!solved[i]) { if (top < 0) top = i; bottom = i; }
        return { top: top, bottom: bottom };
    }
    function chainKey(c) { return c.words[0] + '>' + c.words[7]; }

    /** Una partita salvata è buona solo se è recente, coerente e la sua catena esiste ancora */
    function checkSave(s, list, now) {
        if (!s || typeof s !== 'object' || s.v !== 1) return null;
        if (!(now - Number(s.ts) < SAVE_TTL) || !Array.isArray(s.teams) || s.teams.length !== 2) return null;
        if ([3, 5, 8].indexOf(s.n) < 0 || !(s.idx >= 0 && s.idx < s.n)) return null;
        if (s.state !== 'play' && s.state !== 'done') return null;
        if (s.starter !== 0 && s.starter !== 1) return null;
        var chain = null;
        for (var i = 0; i < list.length; i++) if (chainKey(list[i]) === s.chain) { chain = list[i]; break; }
        if (!chain) return null;
        var okArr = function (a, len) { return Array.isArray(a) && a.length === len; };
        if (!okArr(s.solved, 8) || !okArr(s.gave, 8) || !okArr(s.shown, 8)) return null;
        for (var k = 0; k < 8; k++) if (!okArr(s.shown[k], chain.words[k].length)) return null;
        if (!s.teams.every(function (t) { return t && typeof t.name === 'string' && t.pts >= 0; })) return null;
        if (s.state === 'play' && frontier(s.solved).top < 0) return null;
        return chain;
    }

    /** Bilancio tra due squadre: la chiave non dipende dall'ordine né dalle maiuscole */
    function pairKey(a, b) { return [norm(a), norm(b)].sort().join(' | '); }
    function alboAdd(albo, a, b, ptsA, ptsB) {
        albo = albo && typeof albo === 'object' && !Array.isArray(albo) ? albo : {};
        var k = pairKey(a, b);
        var r = albo[k] && typeof albo[k] === 'object' ? albo[k] : { w: {}, d: 0, n: 0 };
        if (!r.w || typeof r.w !== 'object') r.w = {};
        r.n = (r.n || 0) + 1;
        if (ptsA === ptsB) r.d = (r.d || 0) + 1;
        else { var win = norm(ptsA > ptsB ? a : b); r.w[win] = (r.w[win] || 0) + 1; }
        // la coppia appena giocata va in fondo; non cresce all'infinito: restano le 30 più recenti
        delete albo[k];
        var keys = Object.keys(albo);
        keys.slice(0, Math.max(0, keys.length - 29)).forEach(function (x) { delete albo[x]; });
        albo[k] = r;
        return { albo: albo, rec: r };
    }

    var core = {
        norm: norm, distance: distance, matches: matches, bare: bare, initialShown: initialShown,
        valueOf: valueOf, revealNext: revealNext, frontier: frontier, chainKey: chainKey,
        checkSave: checkSave, pairKey: pairKey, alboAdd: alboAdd, SAVE_TTL: SAVE_TTL
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Pagina
       ====================================================================== */
    var $ = QZ.$;
    var deck = new QZ.Deck('catena', chains, chainKey);
    var CFG = Object.assign({ n: 5 }, QZ.store.get('qz.catena.cfg', {}) || {});
    if ([3, 5, 8].indexOf(CFG.n) < 0) CFG.n = 5;
    var LOCK_MS = 650;

    var G = null;
    var nextTo = 0, fitTo = 0;
    var undoStack = [];

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('link');
    $('#rules').innerHTML = [
        ['Otto parole in fila,', 'ognuna legata alla successiva: un modo di dire, una parola composta, un soprannome. Si vedono la prima e l\'ultima.'],
        ['Si attacca dall\'alto o dal basso:', 'la squadra di turno prova la parola attaccata a una già scoperta. Delle altre si vede solo l\'iniziale.'],
        ['Chi tiene il telefono fa il presentatore:', 'vede la soluzione con la spiegazione del legame e decide se la risposta vale. Ha sbagliato bottone? C\'è «Annulla».'],
        ['Giusto? 10 punti e si continua.', 'Sbagliato? Si accende una lettera in più, la parola vale 2 punti in meno e la palla passa agli avversari.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var played = QZ.profile.get().gamesPlayed.catena;
    $('#start-record').textContent = played ? 'Su questo telefono: ' + played + (played === 1 ? ' partita giocata' : ' partite giocate') + ', ' + chains.length + ' catene in archivio.' : chains.length + ' catene in archivio, nessuna uguale all\'altra.';

    var teams = QZ.playerList($('#teams-host'), { key: 'catena', min: 2, max: 2, initial: 2, label: 'Squadra', title: 'Le due squadre' });
    QZ.segmented($('#opt-n'), [{ label: '3 catene', value: 3 }, { label: '5 catene', value: 5 }, { label: '8 catene', value: 8 }], CFG.n, function (v) { CFG.n = v; QZ.store.set('qz.catena.cfg', CFG); });

    $('#start-btn').addEventListener('click', function () { startGame(); });
    $('#resume-btn').addEventListener('click', resumeGame);
    $('#dir-top').innerHTML = QZ.icon('arrow') + 'Dall\'alto';
    $('#dir-bottom').innerHTML = QZ.icon('arrow') + 'Dal basso';
    $('#dir-top .ico').style.transform = 'rotate(90deg)';
    $('#dir-bottom .ico').style.transform = 'rotate(-90deg)';
    $('#dir-top').addEventListener('click', function () { setDir('top'); });
    $('#dir-bottom').addEventListener('click', function () { setDir('bottom'); });
    $('#ok').innerHTML = QZ.icon('check') + 'Giusto';
    $('#ko').innerHTML = QZ.icon('x') + 'Sbagliato';
    $('#ok').addEventListener('click', function () { right(''); });
    $('#ko').addEventListener('click', function () { wrong(''); });
    $('#try').innerHTML = 'Prova';
    $('#peek').addEventListener('click', function () { if (playing()) togglePeek(); });
    $('#give').innerHTML = QZ.icon('eye') + 'Svela la parola';
    $('#give').setAttribute('aria-label', 'Svela la parola: nessun punto, palla agli avversari');
    $('#give').addEventListener('click', giveUp);
    $('#undo').innerHTML = QZ.icon('back') + 'Annulla';
    $('#undo').addEventListener('click', undo);
    $('#quit').innerHTML = QZ.icon('flag') + 'Chiudi la partita';
    $('#quit').addEventListener('click', askQuit);
    $('#next').addEventListener('click', nextChain);
    $('#form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!playing()) return;
        var v = $('#guess').value.trim();
        if (!v) { QZ.fx.shake($('#guess')); return; }
        if (locked()) return;
        $('#guess').value = '';
        if (matches(v, word(G.target))) right(v);
        else wrong(v);
    });
    window.addEventListener('resize', function () { clearTimeout(fitTo); fitTo = setTimeout(fit, 80); });
    paintResume();

    /* ---------- Helper ---------- */
    function playing() { return G && G.state === 'play'; }
    function team() { return G.teams[G.turn]; }
    function word(i) { return G.chain.words[i]; }
    function value(i) { return valueOf(word(i), G.shown[i]); }
    // un verdetto alla volta: il doppio tocco su Giusto regalava anche la parola dopo
    function locked() {
        var now = Date.now();
        if (now < (G.lockUntil || 0)) return true;
        G.lockUntil = now + LOCK_MS;
        return false;
    }
    function feed(text, kind) {
        $('#feed').classList.remove('is-ok', 'is-bad');
        if (kind) $('#feed').classList.add('is-' + kind);
        $('#feed').textContent = text;
    }

    /* ---------- Salvataggio e ripresa ---------- */
    function snapshot() {
        return {
            v: 1, ts: Date.now(), chain: chainKey(G.chain),
            teams: G.teams.map(function (t) { return { name: t.name, color: t.color, pts: t.pts, found: t.found, miss: t.miss, run: t.run, best: t.best }; }),
            n: G.n, idx: G.idx, starter: G.starter, turn: G.turn, state: G.state, dir: G.dir,
            gaveTot: G.gaveTot, cp: G.cp.slice(), hist: G.hist.slice(), feed: G.feedText || '', feedKind: G.feedKind || '',
            solved: G.solved.slice(), gave: G.gave.slice(), shown: G.shown.map(function (r) { return r.slice(); })
        };
    }
    function save() { if (G && !G.finished) QZ.store.set(SAVE_KEY, snapshot()); }
    function restore(s, chain) {
        G = {
            teams: s.teams.map(function (t, i) {
                return { name: t.name, color: t.color || QZ.TEAM_COLORS[i], pts: t.pts || 0, found: t.found || 0, miss: t.miss || 0, run: t.run || 0, best: t.best || 0 };
            }),
            n: s.n, idx: s.idx, starter: s.starter, turn: s.turn === 1 ? 1 : 0, state: s.state, dir: s.dir === 'bottom' ? 'bottom' : 'top',
            gaveTot: s.gaveTot || 0, cp: Array.isArray(s.cp) ? s.cp.slice() : [0, 0], hist: Array.isArray(s.hist) ? s.hist.slice() : [],
            chain: chain, solved: s.solved.slice(), gave: s.gave.slice(), shown: s.shown.map(function (r) { return r.slice(); }),
            finished: false, lockUntil: 0, feedText: s.feed, feedKind: s.feedKind
        };
    }
    function savedGame() {
        var s = QZ.store.get(SAVE_KEY, null);
        var chain = checkSave(s, chains, Date.now());
        if (!chain && s) QZ.store.remove(SAVE_KEY);
        return chain ? { s: s, chain: chain } : null;
    }
    function paintResume() {
        var sg = savedGame();
        $('#resume').hidden = !sg;
        if (!sg) return;
        var t = sg.s.teams;
        $('#resume-btn').innerHTML = QZ.icon('play') + 'Riprendi la partita';
        $('#resume-info').textContent = t[0].name + ' ' + t[0].pts + ' - ' + t[1].pts + ' ' + t[1].name + ' · catena ' + (sg.s.idx + 1) + ' di ' + sg.s.n;
    }
    function resumeGame() {
        var sg = savedGame();
        if (!sg) { paintResume(); return; }
        clearTimeout(nextTo);
        restore(sg.s, sg.chain);
        if (G.state === 'play') { G.feedText = 'Si riprende da dove eravate: tocca a ' + team().name + '.'; G.feedKind = ''; }
        undoStack = [];
        QZ.wake.on();
        QZ.show('s-game');
        paintAll();
        if (G.state === 'done') showRecap();
        else QZ.say('Partita ripresa. Tocca a ' + team().name + '.');
    }

    /* ---------- Partita ---------- */
    function startGame() {
        var names = teams.get();
        if (norm(names[0]) === norm(names[1])) names[1] += ' 2';
        clearTimeout(nextTo);
        G = {
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i], pts: 0, found: 0, miss: 0, run: 0, best: 0 }; }),
            n: CFG.n, idx: 0, starter: QZ.rand(0, 1), turn: 0, state: 'play',
            gaveTot: 0, hist: [], finished: false, lockUntil: 0
        };
        QZ.wake.on();
        QZ.show('s-game');
        newChain();
    }

    function newChain() {
        G.chain = deck.draw();
        G.solved = G.chain.words.map(function (w, i) { return i === 0 || i === 7; });
        G.gave = G.chain.words.map(function () { return false; });
        G.shown = initialShown(G.chain.words);
        G.cp = [0, 0];
        G.teams.forEach(function (t) { t.run = 0; });
        G.turn = G.idx % 2 ? 1 - G.starter : G.starter;
        G.dir = 'top';
        G.state = 'play';
        undoStack = [];
        feed(team().name + ' apre la catena. Si parte da «' + word(0) + '» o da «' + word(7) + '».');
        G.feedText = $('#feed').textContent; G.feedKind = '';
        paintAll();
        QZ.sound.whistle();
        QZ.say('Catena ' + (G.idx + 1) + ' di ' + G.n + ': da ' + word(0) + ' a ' + word(7) + '. Tocca a ' + team().name + '.');
        save();
    }

    /** Ridisegna tutto dallo stato: serve all'inizio, alla ripresa e dopo un Annulla */
    function paintAll() {
        G.teams.forEach(function (t, i) {
            var el = $('#t' + i);
            el.style.setProperty('--c', t.color);
            el.querySelector('[data-name]').textContent = t.name;
            el.querySelector('[data-pts]').textContent = t.pts;
        });
        $('#done').hidden = G.state !== 'done';
        $('#play').hidden = G.state === 'done';
        $('#sb-n').textContent = (G.idx + 1) + '/' + G.n;
        renderChain();
        clearTimeout(fitTo);
        fitTo = setTimeout(fit, 300);
        if (G.state === 'play') retarget();
        else paintRows();
        if (G.feedText != null) feed(G.feedText, G.feedKind);
        paintTurn(false);
        paintUndo();
    }

    function setDir(d) {
        if (!playing()) return;
        var f = frontier(G.solved);
        if (f.top === f.bottom || G.dir === d) return;
        G.dir = d;
        QZ.sound.click();
        retarget();
        save();
    }

    function retarget() {
        var f = frontier(G.solved);
        G.target = G.dir === 'bottom' ? f.bottom : f.top;
        var single = f.top === f.bottom;
        $('#dir').hidden = single;
        $('#dir-top').setAttribute('aria-pressed', String(G.dir === 'top'));
        $('#dir-bottom').setAttribute('aria-pressed', String(G.dir === 'bottom'));
        hidePeek();
        paintRows();
        paintValue();
    }

    function renderChain() {
        var html = '';
        G.chain.words.forEach(function (w, i) {
            var end = i === 0 || i === 7;
            var cells = '', k = 0;
            for (var c = 0; c < w.length; c++) {
                var ch = w[c];
                if (!isLetter(ch)) { cells += '<span class="ct-t is-gap" data-c="' + c + '">' + (ch === ' ' ? '' : QZ.esc(ch)) + '</span>'; continue; }
                cells += '<span class="ct-t" data-c="' + c + '" style="--i:' + (k++) + '">' + (G.shown[i][c] ? QZ.esc(ch) : '') + '</span>';
            }
            html += '<div class="ct-row' + (end ? ' is-end' : '') + '" data-i="' + i + '"><span class="ct-row__n" aria-hidden="true">' + (i + 1) + '</span><span class="ct-word" aria-hidden="true">' + cells + '</span><span class="ct-row__tag" aria-hidden="true"></span></div>';
        });
        $('#chain').innerHTML = html;
        fit();
    }

    /** Le righe attaccabili diventano bottoni; quella scelta ha il filo del colore del gioco */
    function paintRows() {
        var f = frontier(G.solved);
        QZ.$$('#chain .ct-row').forEach(function (row) {
            var i = Number(row.dataset.i);
            var open = playing() && !G.solved[i] && (i === f.top || i === f.bottom);
            var wantBtn = open && f.top !== f.bottom;
            if (wantBtn !== (row.tagName === 'BUTTON')) {
                var hadFocus = document.activeElement === row;
                var neo = document.createElement(wantBtn ? 'button' : 'div');
                if (wantBtn) neo.type = 'button';
                neo.className = row.className;
                neo.dataset.i = row.dataset.i;
                neo.innerHTML = row.innerHTML;
                row.replaceWith(neo);
                row = neo;
                if (wantBtn) neo.addEventListener('click', function () { var ff = frontier(G.solved); setDir(i === ff.top ? 'top' : 'bottom'); });
                if (hadFocus) $('#ok').focus({ preventScroll: true });
            }
            row.classList.toggle('is-solved', G.solved[i] && i > 0 && i < 7 && !G.gave[i]);
            row.classList.toggle('is-gave', !!G.gave[i]);
            row.classList.toggle('is-target', playing() && i === G.target);
            row.querySelector('.ct-row__tag').textContent = open ? (i === G.target ? '?' : (i === f.top ? '↓' : '↑')) : '';
            row.setAttribute('aria-label', rowLabel(i, open));
            if (row.tagName === 'DIV') row.setAttribute('role', 'img');
            else { row.removeAttribute('role'); row.setAttribute('aria-pressed', String(i === G.target)); }
        });
    }
    function rowLabel(i, open) {
        var w = word(i);
        if (G.solved[i]) return 'Parola ' + (i + 1) + ': ' + w + (G.gave[i] ? ', svelata' : '');
        var shown = w.split('').map(function (c, k) { return G.shown[i][k] ? c : '_'; }).join(' ');
        return 'Parola ' + (i + 1) + ', nascosta: ' + shown + (open ? (i === G.target ? ', quella da indovinare' : ', attaccabile') : '');
    }

    // celle grandi quanto possibile: la parola più lunga della catena deve stare su una riga
    function fit() {
        if (!G || !G.chain) return;
        var longest = Math.max.apply(null, G.chain.words.map(function (w) { return w.length; }));
        // a schermata ancora nascosta (transizione di QZ.show) la riga misura 0: si stima dalla finestra
        var row = $('#chain .ct-row');
        var vw = document.documentElement.clientWidth || window.innerWidth;
        var rw = row && row.clientWidth > 100 ? row.clientWidth : Math.min(vw - 32, 640) - (vw < 480 ? 10 : 18);
        var W = rw - (vw < 480 ? 18 + 4 + 10 : 22 + 6 + 14) - 18;
        var tw = Math.floor((W - (longest - 1) * 3) / longest);
        $('#chain').style.setProperty('--tw', QZ.clamp(tw, 14, 34) + 'px');
    }

    function paintTurn(announce) {
        [0, 1].forEach(function (i) { $('#t' + i).classList.toggle('is-active', i === G.turn && G.state === 'play'); });
        var t = team();
        $('#turn-who').innerHTML = 'Tocca a <span>' + QZ.esc(t.name) + '</span>';
        $('#turn-who').style.setProperty('--c', t.color);
        if (announce) QZ.say('Tocca a ' + t.name + '.');
    }
    function paintValue() {
        if (G.target < 0) return;
        var v = value(G.target);
        $('#value').textContent = v;
        $('#value').parentNode.setAttribute('aria-label', 'La parola vale ' + v + (v === 1 ? ' punto' : ' punti'));
    }
    function paintUndo() { $('#undo').disabled = !undoStack.length; }

    /* ---------- Il presentatore ---------- */
    function hidePeek() {
        $('#sol').hidden = true;
        $('#peek').innerHTML = QZ.icon('eye') + 'Soluzione';
        $('#peek').setAttribute('aria-expanded', 'false');
    }
    function togglePeek() {
        if (!$('#sol').hidden) { hidePeek(); return; }
        var i = G.target;
        var from = G.dir === 'bottom' && G.solved[i + 1] ? i + 1 : (G.solved[i - 1] ? i - 1 : i + 1);
        var link = from < i ? G.chain.links[i - 1] : G.chain.links[i];
        $('#sol-word').textContent = word(i);
        $('#sol-why').textContent = 'Legata a «' + word(from) + '»: ' + link + '.';
        $('#sol').hidden = false;
        $('#peek').innerHTML = QZ.icon('eyeoff') + 'Nascondi';
        $('#peek').setAttribute('aria-expanded', 'true');
    }

    /* ---------- Verdetti ---------- */
    function rowEl(i) { return $('#chain .ct-row[data-i="' + i + '"]'); }
    function revealWord(i) {
        G.shown[i] = G.shown[i].map(function () { return true; });
        QZ.$$('.ct-t', rowEl(i)).forEach(function (cell) {
            var c = Number(cell.dataset.c);
            if (isLetter(word(i)[c])) cell.textContent = word(i)[c];
        });
    }
    function pushUndo() {
        undoStack.push(snapshot());
        if (undoStack.length > 30) undoStack.shift();
    }
    function setFeed(text, kind) { G.feedText = text; G.feedKind = kind || ''; feed(text, kind); }

    function right(said) {
        if (!playing() || (!said && locked())) return;
        pushUndo();
        var i = G.target, t = team(), v = value(i);
        G.solved[i] = true;
        t.pts += v;
        t.found++;
        t.run++;
        if (t.run > t.best) t.best = t.run;
        G.cp[G.turn] += v;
        revealWord(i);
        paintRows();
        var pts = $('#t' + G.turn + ' [data-pts]');
        pts.textContent = t.pts;
        QZ.fx.pop(pts);
        QZ.fx.floatText(pts, '+' + v);
        QZ.fx.stamp(rowEl(i), 'Giusto', 'ok', { size: 26, ms: 1100, say: false });
        QZ.sound.correct();
        QZ.vibrate([30, 40, 90]);
        var more = frontier(G.solved).top >= 0;
        var run = t.run >= 3 ? ' Sono ' + t.run + ' di fila!' : '';
        setFeed((said ? '«' + said.toUpperCase() + '»: ' : '') + 'giusto, era «' + word(i) + '». ' + v + ' punti a ' + t.name + (more ? ', che continua.' : '.') + run, 'ok');
        afterMove(false);
    }

    function wrong(said) {
        if (!playing() || (!said && locked())) return;
        pushUndo();
        var i = G.target, t = team();
        t.miss++;
        t.run = 0;
        var k = revealNext(G.shown[i]);
        if (k >= 0) {
            var cell = $('.ct-t[data-c="' + k + '"]', rowEl(i));
            if (cell) { cell.textContent = word(i)[k]; QZ.fx.replay(cell, 'is-on'); }
        }
        QZ.fx.stamp(rowEl(i), 'Sbagliato', 'bad', { size: 24, ms: 1100, say: false });
        QZ.fx.shake(rowEl(i));
        QZ.sound.wrong();
        QZ.vibrate([50, 30, 50]);
        G.turn = 1 - G.turn;
        setFeed((said ? '«' + said.toUpperCase() + '» non va. ' : 'Niente da fare. ') + (k >= 0 ? 'Una lettera in più, palla a ' : 'Lettere finite, palla a ') + team().name + '.', 'bad');
        hidePeek();
        paintRows();
        paintValue();
        paintTurn(false);
        paintUndo();
        save();
    }

    function giveUp() {
        if (!playing() || locked()) return;
        pushUndo();
        var i = G.target;
        G.solved[i] = true;
        G.gave[i] = true;
        G.gaveTot++;
        team().run = 0;
        revealWord(i);
        QZ.sound.whoosh();
        G.turn = 1 - G.turn;
        setFeed('Svelata: era «' + word(i) + '». Nessun punto, palla a ' + team().name + '.', 'bad');
        afterMove(true);
    }

    function undo() {
        if (!G || G.finished || !undoStack.length) return;
        var s = undoStack.pop();
        // un Annulla subito dopo l'ultima parola riapre la catena: il riepilogo non parte più
        clearTimeout(nextTo);
        restore(s, G.chain);
        G.lockUntil = Date.now() + 250;
        paintAll();
        QZ.sound.click();
        QZ.say('Annullato. ' + G.feedText);
        save();
    }

    function afterMove(turnChanged) {
        var f = frontier(G.solved);
        if (f.top < 0) { chainDone(); return; }
        retarget();
        paintTurn(turnChanged);
        paintUndo();
        save();
    }

    function chainDone() {
        G.state = 'done';
        G.hist.push({ first: word(0), last: word(7), a: G.cp[0], b: G.cp[1] });
        paintRows();
        paintUndo();
        [0, 1].forEach(function (i) { $('#t' + i).classList.remove('is-active'); });
        save();
        clearTimeout(nextTo);
        nextTo = setTimeout(function () { if (G && G.state === 'done') showRecap(); }, QZ.reducedMotion() ? 500 : 1400);
        QZ.sound.reveal();
    }

    function showRecap() {
        undoStack = [];
        paintUndo();
        var last = G.idx + 1 >= G.n;
        $('#play').hidden = true;
        $('#done').hidden = false;
        $('#done-eyebrow').innerHTML = QZ.icon('link') + 'Catena ' + (G.idx + 1) + ' di ' + G.n + ' chiusa';
        $('#done-title').textContent = word(0) + ' … ' + word(7);
        var gave = G.gave.filter(Boolean).length;
        var A = G.teams[0], B = G.teams[1];
        $('#done-pts').textContent = 'In questa catena: ' + A.name + ' +' + G.cp[0] + ', ' + B.name + ' +' + G.cp[1] + (gave ? ' · ' + gave + (gave === 1 ? ' parola svelata' : ' parole svelate') : '') + '.';
        $('#recap').innerHTML = G.chain.links.map(function (l, k) {
            var bad = G.gave[k + 1] ? ' class="is-gave"' : '';
            return '<li' + bad + '><b>' + QZ.esc(word(k)) + ' → ' + QZ.esc(word(k + 1)) + '</b><span>' + QZ.esc(l) + '</span></li>';
        }).join('');
        $('#next').innerHTML = last ? QZ.icon('whistle') + 'Fischio finale' : QZ.icon('arrow') + 'Catena successiva';
        QZ.say('Catena chiusa. ' + A.name + ' ' + A.pts + ', ' + B.name + ' ' + B.pts + '.');
        $('#done-title').focus({ preventScroll: false });
    }

    function nextChain() {
        if (!G || G.state !== 'done' || $('#done').hidden || locked()) return;
        G.idx++;
        if (G.idx >= G.n) { G.idx = G.n - 1; finish(false); return; }
        newChain();
        $('#turn-who').focus({ preventScroll: true });
    }

    function askQuit() {
        if (!G || G.finished) return;
        QZ.confirm('La partita finisce qui e vince chi ha più punti.', { title: 'Chiudere la partita?', okLabel: 'Chiudi', cancelLabel: 'Si continua', danger: true }).then(function (ok) {
            if (ok && G && !G.finished) finish(true);
        });
    }

    /* ---------- Fine partita ---------- */
    function finish(early) {
        if (G.finished) return;
        var closed = G.hist.length;
        G.finished = true;
        G.state = 'over';
        clearTimeout(nextTo);
        QZ.store.remove(SAVE_KEY);
        undoStack = [];
        QZ.wake.off();
        var A = G.teams[0], B = G.teams[1];
        var tie = A.pts === B.pts;
        var W = tie ? null : (A.pts > B.pts ? A : B), L = W === A ? B : A;
        var order = W === B ? [B, A] : [A, B];
        var found = A.found + B.found;
        var score = A.name + ' ' + A.pts + '-' + B.pts + ' ' + B.name;
        // una partita chiusa prima di finire la prima catena non conta nel bilancio
        var counted = closed > 0;
        var r = QZ.profile.record('catena', { xp: 15 + found * 4, label: score });
        var albo = null;
        if (counted) {
            var res = alboAdd(QZ.store.get(ALBO_KEY, {}), A.name, B.name, A.pts, B.pts);
            QZ.store.set(ALBO_KEY, res.albo);
            albo = res.rec;
        }
        var ratio = W ? QZ.clamp(0.4 + (W.pts - L.pts) / Math.max(20, W.pts + L.pts) + W.found * 0.02, 0, 1) : 0.5;
        var best = Math.max(A.best, B.best);
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: W ? 'trophy' : 'whistle',
            title: W ? 'Vince ' + W.name : 'Pareggio',
            subtitle: W
                ? (early ? 'Partita chiusa in anticipo: decidono i punti, ' + W.pts + ' a ' + L.pts + '.' : subtitleFor(W, L))
                : (found ? 'Stessi punti per tutte e due. Si rigioca per la bella?' : 'Nessuna parola trovata: zero a zero e tutti a casa.'),
            big: W ? W.pts : A.pts, bigSuffix: ' punti',
            record: r,
            ratio: ratio,
            stats: [
                { label: 'Risultato', value: A.pts + ' - ' + B.pts },
                { label: 'Catene chiuse', value: closed + ' di ' + G.n },
                { label: 'Parole trovate', value: found + (G.gaveTot ? ' (+' + G.gaveTot + (G.gaveTot === 1 ? ' svelata)' : ' svelate)') : '') },
                { label: 'Serie più lunga', value: best ? best + ' di fila' : '—' }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(order.map(function (t) {
                return { name: t.name, color: t.color, score: t.pts + ' punti', sub: t.found + (t.found === 1 ? ' parola trovata' : ' parole trovate') + ' · ' + t.miss + (t.miss === 1 ? ' errore' : ' errori') };
            })) + '</div>' + histHTML(A, B) + alboHTML(A, B, albo),
            share: shareText(A, B, W, closed),
            onRetry: function () { startGame(); },
            secondary: { label: 'Cambia squadre', icon: 'users', onClick: function () { paintResume(); QZ.show('s-start'); } }
        });
    }
    function subtitleFor(W, L) {
        var gap = W.pts - L.pts;
        if (gap <= 4) return W.pts + ' a ' + L.pts + ': decisa sugli ultimi anelli, col cuore in gola.';
        if (gap >= 30) return W.pts + ' a ' + L.pts + ': una goleada, partita mai in discussione.';
        return 'Catene chiuse, ' + W.pts + ' a ' + L.pts + ': ' + W.name + ' ha letto meglio gli anelli.';
    }
    function histHTML(A, B) {
        if (!G.hist.length) return '';
        return '<div class="card mt-3"><span class="label">Catena per catena · ' + QZ.esc(A.name) + ' - ' + QZ.esc(B.name) + '</span><ul class="ct-hist">' + G.hist.map(function (h, i) {
            return '<li><span class="ct-hist__n">' + (i + 1) + '</span><span class="ct-hist__w">' + QZ.esc(h.first) + ' … ' + QZ.esc(h.last) + '</span>' +
                '<span class="ct-hist__p" aria-label="' + QZ.esc(A.name + ' ' + h.a + ', ' + B.name + ' ' + h.b) + '">' + h.a + ' - ' + h.b + '</span></li>';
        }).join('') + '</ul></div>';
    }
    function alboHTML(A, B, rec) {
        if (!rec || rec.n < 2) return '';
        var wa = rec.w[norm(A.name)] || 0, wb = rec.w[norm(B.name)] || 0;
        var hi = wa >= wb ? [A, wa] : [B, wb], lo = wa >= wb ? [B, wb] : [A, wa];
        var vit = function (n) { return n + (n === 1 ? ' vittoria' : ' vittorie'); };
        var txt = 'in ' + rec.n + ' sfide ' + vit(hi[1]) + ' per ' + QZ.esc(hi[0].name) + ', ' + vit(lo[1]) + ' per ' + QZ.esc(lo[0].name) +
            (rec.d ? ', ' + rec.d + (rec.d === 1 ? ' pareggio' : ' pareggi') : '') + (wa === wb ? '. Tutto in equilibrio.' : '.');
        return '<p class="ct-albo mt-3">' + QZ.icon('chart') + '<span><b>Bilancio su questo telefono:</b> ' + txt + '</span></p>';
    }
    function shareText(A, B, W, closed) {
        var first = G.hist[0];
        var hook = first ? 'Da «' + first.first + '» a «' + first.last + '» in sei anelli' : 'Baggio, codino, pallone d\'oro…';
        return 'La Catena su Quizzotti: ' + A.name + ' ' + A.pts + '-' + B.pts + ' ' + B.name + ' in ' + closed + (closed === 1 ? ' catena' : ' catene') + (W ? ', vince ' + W.name : ', pareggio') + '. ' + hook + ': voi ci arrivate?';
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
        var onBtn = t && t.closest && t.closest('button, a');
        if (k === 'z' || (k === 'backspace' && !onBtn)) { if (undoStack.length) { e.preventDefault(); undo(); } return; }
        if (G.state === 'done' && k === 'enter' && !onBtn) { e.preventDefault(); nextChain(); return; }
        if (!playing()) return;
        if (k === 'g') { e.preventDefault(); right(''); }
        else if (k === 'x') { e.preventDefault(); wrong(''); }
        else if (k === 'arrowup') { e.preventDefault(); setDir('top'); }
        else if (k === 'arrowdown') { e.preventDefault(); setDir('bottom'); }
        else if (k === 'v') { e.preventDefault(); togglePeek(); }
        else if (k === '/') { e.preventDefault(); $('#guess').focus(); }
    });
})();
