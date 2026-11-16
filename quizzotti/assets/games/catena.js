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
   ========================================================================== */
/* global chains */
(function () {
    'use strict';

    var $ = QZ.$;
    var deck = new QZ.Deck('catena', chains, function (c) { return c.words[0] + '>' + c.words[7]; });
    var CFG = Object.assign({ n: 5 }, QZ.store.get('qz.catena.cfg', {}) || {});
    var BASE = 10, STEP = 2, MIN = 2;

    var G = null;
    var nextTo = 0;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('link');
    $('#rules').innerHTML = [
        ['Otto parole in fila,', 'ognuna legata alla successiva: un modo di dire, una parola composta, un soprannome. Si vedono la prima e l\'ultima.'],
        ['Si attacca dall\'alto o dal basso:', 'la squadra di turno prova la parola attaccata a una già scoperta. Delle altre si vede solo l\'iniziale.'],
        ['Chi tiene il telefono fa il presentatore:', 'vede la soluzione con la spiegazione del legame e decide se la risposta vale.'],
        ['Giusto? Punti e si continua.', 'Sbagliato? Si accende una lettera in più, la parola vale meno e la palla passa agli avversari.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var played = QZ.profile.get().gamesPlayed.catena;
    $('#start-record').textContent = played ? 'Su questo telefono: ' + played + (played === 1 ? ' partita giocata' : ' partite giocate') + '.' : '';

    var teams = QZ.playerList($('#teams-host'), { key: 'catena', min: 2, max: 2, initial: 2, label: 'Squadra', title: 'Le due squadre' });
    QZ.segmented($('#opt-n'), [{ label: '3 catene', value: 3 }, { label: '5 catene', value: 5 }, { label: '8 catene', value: 8 }], CFG.n, function (v) { CFG.n = v; QZ.store.set('qz.catena.cfg', CFG); });

    $('#start-btn').addEventListener('click', startGame);
    $('#dir-top').innerHTML = QZ.icon('arrow') + 'Dall\'alto';
    $('#dir-bottom').innerHTML = QZ.icon('arrow') + 'Dal basso';
    $('#dir-top .ico').style.transform = 'rotate(90deg)';
    $('#dir-bottom .ico').style.transform = 'rotate(-90deg)';
    $('#dir-top').addEventListener('click', function () { setDir('top'); });
    $('#dir-bottom').addEventListener('click', function () { setDir('bottom'); });
    $('#ok').innerHTML = QZ.icon('check') + 'Giusto';
    $('#ko').innerHTML = QZ.icon('x') + 'Sbagliato';
    $('#ok').addEventListener('click', function () { if (playing()) right(); });
    $('#ko').addEventListener('click', function () { if (playing()) wrong(''); });
    $('#try').innerHTML = 'Prova';
    $('#peek').addEventListener('click', function () { if (playing()) togglePeek(); });
    $('#give').innerHTML = QZ.icon('eye') + 'Svela la parola';
    $('#give').setAttribute('aria-label', 'Svela la parola: nessun punto, palla agli avversari');
    $('#give').addEventListener('click', giveUp);
    $('#quit').innerHTML = QZ.icon('flag') + 'Chiudi la partita';
    $('#quit').addEventListener('click', askQuit);
    $('#next').addEventListener('click', nextChain);
    $('#form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!playing()) return;
        var v = $('#guess').value.trim();
        if (!v) { QZ.fx.shake($('#guess')); return; }
        $('#guess').value = '';
        if (matches(v, word(G.target))) right(v);
        else wrong(v);
    });
    window.addEventListener('resize', fit);

    /* ---------- Helper ---------- */
    function playing() { return G && G.state === 'play'; }
    function team() { return G.teams[G.turn]; }
    function word(i) { return G.chain.words[i]; }
    function isLetter(ch) { return QZ.norm(ch) !== ''; }
    function shownCount(i) { return G.shown[i].filter(function (s, k) { return s && isLetter(word(i)[k]); }).length; }
    function value(i) { return Math.max(MIN, BASE - STEP * (shownCount(i) - 1)); }
    function feed(text, kind) {
        $('#feed').classList.remove('is-ok', 'is-bad');
        if (kind) $('#feed').classList.add('is-' + kind);
        $('#feed').textContent = text;
    }
    /** Le due parole attaccabili: la prima nascosta dall'alto e l'ultima dal basso */
    function frontier() {
        var top = -1, bottom = -1;
        for (var i = 1; i <= 6; i++) if (!G.solved[i]) { if (top < 0) top = i; bottom = i; }
        return { top: top, bottom: bottom };
    }
    /** Risposta scritta: accenti, apostrofi e piccoli refusi non contano */
    function matches(said, answer) {
        var a = QZ.norm(answer).replace(/ /g, '');
        var s = QZ.norm(said).replace(/ /g, '');
        if (!a || !s) return false;
        var tol = a.length <= 4 ? 0 : a.length <= 8 ? 1 : 2;
        return Math.abs(s.length - a.length) <= tol && QZ.distance(s, a) <= tol;
    }

    /* ---------- Partita ---------- */
    function startGame() {
        var names = teams.get();
        if (names[0].toLowerCase() === names[1].toLowerCase()) names[1] += ' 2';
        clearTimeout(nextTo);
        G = {
            teams: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i], pts: 0, found: 0, miss: 0 }; }),
            n: CFG.n, idx: 0, starter: QZ.rand(0, 1), turn: 0, state: 'play',
            gave: 0, finished: false
        };
        G.teams.forEach(function (t, i) {
            var el = $('#t' + i);
            el.style.setProperty('--c', t.color);
            el.querySelector('[data-name]').textContent = t.name;
            el.querySelector('[data-pts]').textContent = '0';
        });
        QZ.wake.on();
        QZ.show('s-game');
        newChain();
    }

    function newChain() {
        G.chain = deck.draw();
        G.solved = G.chain.words.map(function (w, i) { return i === 0 || i === 7; });
        G.gaveSet = {};
        // delle parole nascoste si vede l'iniziale (e gli spazi/apostrofi)
        G.shown = G.chain.words.map(function (w, i) {
            var first = true;
            return w.split('').map(function (ch) {
                if (i === 0 || i === 7 || !isLetter(ch)) return true;
                if (first) { first = false; return true; }
                return false;
            });
        });
        G.turn = G.idx % 2 ? 1 - G.starter : G.starter;
        G.dir = 'top';
        G.state = 'play';
        $('#done').hidden = true;
        $('#play').hidden = false;
        $('#sb-n').textContent = (G.idx + 1) + '/' + G.n;
        renderChain();
        setTimeout(fit, 300);
        retarget();
        feed(team().name + ' apre la catena. Si parte da «' + word(0) + '» o da «' + word(7) + '».');
        QZ.sound.whistle();
        paintTurn(true);
    }

    function setDir(d) {
        if (!playing()) return;
        var f = frontier();
        if (f.top === f.bottom) return;
        G.dir = d;
        QZ.sound.click();
        retarget();
    }

    function retarget() {
        var f = frontier();
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
        var f = frontier();
        QZ.$$('#chain .ct-row').forEach(function (row) {
            var i = Number(row.dataset.i);
            var open = playing() && !G.solved[i] && (i === f.top || i === f.bottom);
            var wantBtn = open && f.top !== f.bottom;
            if (wantBtn !== (row.tagName === 'BUTTON')) {
                var neo = document.createElement(wantBtn ? 'button' : 'div');
                if (wantBtn) neo.type = 'button';
                neo.className = row.className;
                neo.dataset.i = row.dataset.i;
                neo.innerHTML = row.innerHTML;
                row.replaceWith(neo);
                row = neo;
                if (wantBtn) neo.addEventListener('click', function () { setDir(i === frontier().top ? 'top' : 'bottom'); });
            }
            row.classList.toggle('is-solved', G.solved[i] && i > 0 && i < 7 && !G.gaveSet[i]);
            row.classList.toggle('is-gave', !!G.gaveSet[i]);
            row.classList.toggle('is-target', playing() && i === G.target);
            row.querySelector('.ct-row__tag').textContent = open ? (i === G.target ? '?' : (i === f.top ? '↓' : '↑')) : '';
            row.setAttribute('aria-label', rowLabel(i, open));
            if (row.tagName === 'DIV') row.setAttribute('role', 'img');
            else { row.removeAttribute('role'); row.setAttribute('aria-pressed', String(i === G.target)); }
        });
    }
    function rowLabel(i, open) {
        var w = word(i);
        if (G.solved[i]) return 'Parola ' + (i + 1) + ': ' + w;
        var shown = w.split('').map(function (c, k) { return G.shown[i][k] ? c : '_'; }).join(' ');
        return 'Parola ' + (i + 1) + ', nascosta: ' + shown + (open ? (i === G.target ? ', quella da indovinare' : ', attaccabile') : '');
    }

    // celle grandi quanto possibile: la parola piu' lunga della catena deve stare su una riga
    function fit() {
        if (!G || !G.chain) return;
        var longest = Math.max.apply(null, G.chain.words.map(function (w) { return w.length; }));
        // a schermata ancora nascosta (transizione di QZ.show) la riga misura 0: si stima dalla finestra
        var row = $('#chain .ct-row');
        var rw = row && row.clientWidth > 100 ? row.clientWidth : Math.min(window.innerWidth - 32, 640) - (window.innerWidth < 480 ? 10 : 18);
        var W = rw - (window.innerWidth < 480 ? 18 + 4 + 10 : 22 + 6 + 14) - 18;
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
        $('#value').parentNode.setAttribute('aria-label', 'La parola vale ' + v + ' punti');
    }

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

    function right(said) {
        var i = G.target, t = team(), v = value(i);
        G.solved[i] = true;
        t.pts += v;
        t.found++;
        revealWord(i);
        paintRows();
        var pts = $('#t' + G.turn + ' [data-pts]');
        pts.textContent = t.pts;
        QZ.fx.pop(pts);
        QZ.fx.floatText(pts, '+' + v);
        QZ.fx.stamp(rowEl(i), 'Giusto', 'ok', { size: 26, ms: 1100, say: false });
        QZ.sound.correct();
        QZ.vibrate([30, 40, 90]);
        feed((said ? '«' + said.toUpperCase() + '»: ' : '') + 'giusto, era «' + word(i) + '». ' + v + ' punti a ' + t.name + ', che continua.', 'ok');
        afterMove(false);
    }

    function wrong(said) {
        var i = G.target, t = team();
        t.miss++;
        // si accende la prossima lettera, mai l'ultima: la parola va sempre detta
        var hidden = [];
        G.shown[i].forEach(function (s, k) { if (!s) hidden.push(k); });
        if (hidden.length > 1) {
            var k = hidden[0];
            G.shown[i][k] = true;
            var cell = $('.ct-t[data-c="' + k + '"]', rowEl(i));
            if (cell) { cell.textContent = word(i)[k]; QZ.fx.replay(cell, 'is-on'); }
        }
        QZ.fx.stamp(rowEl(i), 'Sbagliato', 'bad', { size: 24, ms: 1100, say: false });
        QZ.fx.shake(rowEl(i));
        QZ.sound.wrong();
        QZ.vibrate([50, 30, 50]);
        G.turn = 1 - G.turn;
        feed((said ? '«' + said.toUpperCase() + '» non va. ' : 'Niente da fare. ') + 'Una lettera in più, palla a ' + team().name + '.', 'bad');
        hidePeek();
        paintRows();
        paintValue();
        paintTurn(false);
    }

    function giveUp() {
        if (!playing()) return;
        var i = G.target;
        G.solved[i] = true;
        G.gaveSet[i] = true;
        G.gave++;
        revealWord(i);
        QZ.sound.whoosh();
        G.turn = 1 - G.turn;
        feed('Svelata: era «' + word(i) + '». Nessun punto, palla a ' + team().name + '.', 'bad');
        afterMove(true);
    }

    function afterMove(turnChanged) {
        var f = frontier();
        if (f.top < 0) { chainDone(); return; }
        retarget();
        paintTurn(turnChanged);
    }

    function chainDone() {
        G.state = 'done';
        paintRows();
        [0, 1].forEach(function (i) { $('#t' + i).classList.remove('is-active'); });
        clearTimeout(nextTo);
        nextTo = setTimeout(function () {
            if (G.state !== 'done') return;
            var last = G.idx + 1 >= G.n;
            $('#play').hidden = true;
            $('#done').hidden = false;
            $('#done-eyebrow').innerHTML = QZ.icon('link') + 'Catena ' + (G.idx + 1) + ' di ' + G.n + ' chiusa';
            $('#done-title').textContent = word(0) + ' … ' + word(7);
            $('#recap').innerHTML = G.chain.links.map(function (l, k) {
                return '<li><b>' + QZ.esc(word(k)) + ' → ' + QZ.esc(word(k + 1)) + '</b><span>' + QZ.esc(l) + '</span></li>';
            }).join('');
            $('#next').innerHTML = last ? QZ.icon('whistle') + 'Fischio finale' : QZ.icon('arrow') + 'Catena successiva';
            QZ.say('Catena chiusa. ' + G.teams[0].name + ' ' + G.teams[0].pts + ', ' + G.teams[1].name + ' ' + G.teams[1].pts + '.');
            $('#done-title').focus({ preventScroll: false });
        }, QZ.reducedMotion() ? 500 : 1400);
        QZ.sound.reveal();
    }

    function nextChain() {
        if (!G || G.state !== 'done') return;
        G.idx++;
        if (G.idx >= G.n) { finish(false); return; }
        newChain();
        $('#turn-who').focus({ preventScroll: true });
    }

    function askQuit() {
        if (!G || G.finished) return;
        QZ.confirm('La partita finisce qui e vince chi ha più punti.', { title: 'Chiudere la partita?', okLabel: 'Chiudi', cancelLabel: 'Si continua', danger: true }).then(function (ok) {
            if (ok) finish(true);
        });
    }

    /* ---------- Fine partita ---------- */
    function finish(early) {
        if (G.finished) return;
        G.finished = true;
        G.state = 'over';
        clearTimeout(nextTo);
        QZ.wake.off();
        var A = G.teams[0], B = G.teams[1];
        var tie = A.pts === B.pts;
        var W = tie ? null : (A.pts > B.pts ? A : B), L = W === A ? B : A;
        var order = W === B ? [B, A] : [A, B];
        var found = A.found + B.found;
        var score = A.name + ' ' + A.pts + '-' + B.pts + ' ' + B.name;
        var r = QZ.profile.record('catena', { xp: 15 + found * 4, label: score });
        var done = early ? G.idx : G.n;
        var ratio = W ? QZ.clamp(0.4 + (W.pts - L.pts) / Math.max(20, W.pts + L.pts) + W.found * 0.02, 0, 1) : 0.5;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: W ? 'trophy' : 'whistle',
            title: W ? 'Vince ' + W.name : 'Pareggio',
            subtitle: W
                ? (early ? 'Partita chiusa in anticipo: decidono i punti.' : 'Catene chiuse, ' + W.pts + ' a ' + L.pts + '. Gli anelli li ha trovati meglio lei.')
                : 'Stessi punti per tutte e due. Si rigioca per la bella?',
            big: W ? W.pts : A.pts, bigSuffix: ' punti',
            record: r,
            ratio: ratio,
            stats: [
                { label: 'Risultato', value: A.pts + ' - ' + B.pts },
                { label: 'Catene chiuse', value: done },
                { label: 'Parole trovate', value: found },
                { label: 'Errori', value: A.miss + B.miss }
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(order.map(function (t) {
                return { name: t.name, color: t.color, score: t.pts + ' punti', sub: t.found + (t.found === 1 ? ' parola trovata' : ' parole trovate') + ' · ' + t.miss + (t.miss === 1 ? ' errore' : ' errori') };
            })) + '</div>',
            share: 'La Catena su Quizzotti: ' + score + '. Baggio, codino, pallone d\'oro… voi a che anello vi fermate?',
            onRetry: startGame,
            secondary: { label: 'Cambia squadre', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
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
        if (G.state === 'done' && k === 'enter' && !(t.closest && t.closest('button'))) { e.preventDefault(); nextChain(); return; }
        if (!playing()) return;
        if (k === 'g') { e.preventDefault(); right(); }
        else if (k === 'x') { e.preventDefault(); wrong(''); }
        else if (k === 'arrowup') { e.preventDefault(); setDir('top'); }
        else if (k === 'arrowdown') { e.preventDefault(); setDir('bottom'); }
        else if (k === 'v') { e.preventDefault(); togglePeek(); }
        else if (k === '/') { e.preventDefault(); $('#guess').focus(); }
    });
})();
