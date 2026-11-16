/* ==========================================================================
   QUIZZOTTI v2 — Mr. White
   Dati: assets/db-mrwhite.js (`wordsList` e `mrwhiteData`: italiani,
   stranieri, coppie per l'Infiltrato, alias per l'ultimo tiro, nome sulla
   maglia per l'aiutino). Al posto delle foto, una maglia disegnata.
   Il ruolo si accende sul maxischermo dello stadio: i civili vedono il
   calciatore con la sua maglia, Mr. White uno schermo senza segnale e
   l'eventuale Infiltrato un calciatore simile (senza saperlo).
   Si vota su un tabellone a LED: chi e' fuori si spegne.
   Ordine di parola (Mr. White non parla mai per primo), eliminazione, ultimo
   tiro per Mr. White con risposta tollerante (alias, refusi, cognomi doppi),
   piu' round con classifica, calciatori che non si ripetono tra le partite.
   La partita si salva a fine round: ricaricando la pagina si riprende.
   La logica pura sta in `core` ed e' esportata per i test con Node.
   ========================================================================== */
(function () {
    'use strict';

    /* ---------- Impostazioni: valori ammessi (un valore vecchio o rotto torna al default) ---------- */
    var CHOICES = { timer: [0, 60, 120, 180], rounds: [3, 5, 8, 0], pool: ['tutti', 'italiani', 'stranieri'] };
    var DEFAULTS = { timer: 120, rounds: 5, hint: false, mw: 1, inf: false, pool: 'tutti' };
    var MIN_P = 3, MAX_P = 12;
    function sanitizeCfg(raw) {
        var o = Object.assign({}, DEFAULTS);
        if (raw && typeof raw === 'object') {
            Object.keys(CHOICES).forEach(function (k) { if (CHOICES[k].indexOf(raw[k]) >= 0) o[k] = raw[k]; });
            if (typeof raw.hint === 'boolean') o.hint = raw.hint;
            if (typeof raw.inf === 'boolean') o.inf = raw.inf;
            var mw = Math.floor(Number(raw.mw));
            if (mw >= 1 && mw <= maxBad(MAX_P)) o.mw = mw;
        }
        return o;
    }
    /** Quanti "impostori" (Mr. White + Infiltrato) reggono n giocatori: sempre meno della meta'. */
    function maxBad(n) { return Math.max(1, Math.floor((n - 1) / 2)); }
    /** L'Infiltrato serve almeno a 5: con 3-4 giocatori resterebbe un civile solo. */
    function canInf(n) { return maxBad(n) >= 2; }
    function maxMW(n, inf) { return Math.max(1, maxBad(n) - (inf && canInf(n) ? 1 : 0)); }

    var PTS = { civWin: 100, guess: 300, mate: 100, survive: 200, wrongGuess: -50 };

    /* ---------- Risposta tollerante all'ultimo tiro ---------- */
    // lettere che la scomposizione Unicode non riduce a una lettera semplice
    var FOLD = { 'ß': 'ss', 'ø': 'o', 'æ': 'ae', 'ı': 'i', 'ł': 'l', 'đ': 'd', 'œ': 'oe', 'þ': 'th', 'ð': 'd' };
    function norm(s) {
        return String(s == null ? '' : s).toLowerCase()
            .replace(/[ßøæıłđœþð]/g, function (c) { return FOLD[c]; })
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function compact(s) { return norm(s).replace(/ /g, ''); }
    function lev(a, b) {
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
    /** Refusi ammessi: nessuno sui nomi corti, uno fino a 8 lettere, due oltre. */
    function tol(len) { return len <= 4 ? 0 : len <= 8 ? 1 : 2; }
    function near(g, c) { return Math.abs(g.length - c.length) <= tol(c.length) && lev(g, c) <= tol(c.length); }
    /** I modi brevi di dirlo: il cognome e ogni coda del nome ("Ter Stegen", "De Rossi", "Rossi"). */
    function partials(word) {
        var t = norm(word).split(' '), out = [];
        for (var k = 1; k < t.length; k++) out.push(t.slice(k).join(''));
        return out;
    }
    function shortKeys(word, alias) {
        var keys = partials(word).concat(((alias && alias[word]) || []).map(compact));
        return keys.filter(function (k, i) { return k.length >= 3 && keys.indexOf(k) === i; });
    }
    /**
     * Chi risponde a ogni forma (nome intero, cognome, alias): "Inzaghi" ne ha due, e allora serve il nome;
     * "Conte" e' Antonio Conte, quindi non puo' passare come refuso di Bruno Conti.
     */
    function buildIndex(words, alias) {
        var idx = Object.create(null);
        function add(k, w) { (idx[k] = idx[k] || []).indexOf(w) < 0 && idx[k].push(w); }
        words.forEach(function (w) {
            add(compact(w), w);
            shortKeys(w, alias).forEach(function (k) { add(k, w); });
        });
        return idx;
    }
    /**
     * 'yes' giusto, 'ambiguous' cognome giusto ma condiviso (Thuram, Inzaghi, Maldini...), 'no' sbagliato.
     */
    function checkGuess(guess, word, alias, idx) {
        var g = compact(guess);
        if (g.length < 2) return 'no';
        // il nome esatto di un altro calciatore non e' mai un refuso: Salah non e' Salas, Kane non e' Keane
        if (idx && idx[g] && idx[g].indexOf(word) < 0) return 'no';
        if (near(g, compact(word))) return 'yes';
        var res = 'no';
        var keys = shortKeys(word, alias);
        for (var i = 0; i < keys.length; i++) {
            if (!near(g, keys[i])) continue;
            if (idx && idx[keys[i]] && idx[keys[i]].length > 1) res = 'ambiguous';
            else return 'yes';
        }
        return res;
    }

    /* ---------- Aiutino: l'iniziale del nome sulla maglia ---------- */
    var PARTICLES = ['de', 'di', 'da', 'del', 'della', 'van', 'von', 'der', 'den', 'ter', 'el', 'mac', 'dos', 'do', 'du', 'la', 'le'];
    function shirtName(word, maglia) {
        if (maglia && maglia[word]) return maglia[word];
        var t = String(word).trim().split(/\s+/);
        var i = t.length - 1;
        while (i > 1 && PARTICLES.indexOf(t[i - 1].toLowerCase()) >= 0) i--;
        return t.slice(Math.max(0, i)).join(' ');
    }
    function hintLetter(word, maglia) { return shirtName(word, maglia).charAt(0).toUpperCase(); }

    /* ---------- Ruoli, esito, punti ---------- */
    /** roles: 'civ' | 'mw' | 'inf'. Esito: 'civ' (fuori tutti gli impostori), 'bad' (sono quanti i civili), null (si continua). */
    function outcome(roles, alive) {
        var bad = 0, civ = 0;
        roles.forEach(function (r, i) { if (alive[i]) { if (r === 'civ') civ++; else bad++; } });
        if (!bad) return 'civ';
        if (bad >= civ) return 'bad';
        return null;
    }
    /** Premi di fine round (la penalita' e il bonus dell'ultimo tiro si danno a parte, sul momento). */
    function settle(roles, alive, winner, how, guesser) {
        return roles.map(function (r, i) {
            if (winner === 'civ') return r === 'civ' ? PTS.civWin : 0;
            if (r === 'civ') return 0;
            if (how === 'guess') return i === guesser ? 0 : PTS.mate;
            return alive[i] ? PTS.survive : 0;
        });
    }
    /** Chi parla per primo: un giocatore in campo che non e' Mr. White, poi si segue il giro del tavolo. */
    function speakOrder(seats, roles, pick) {
        var ok = seats.filter(function (i) { return roles[i] !== 'mw'; });
        if (!ok.length) return seats.slice();
        var first = seats.indexOf(pick(ok));
        return seats.slice(first).concat(seats.slice(0, first));
    }
    /** Nomi doppi resi unici ("Luca", "Luca 2"): altrimenti punteggi e voti si confondono. */
    function uniqueNames(names) {
        var seen = {};
        return names.map(function (n) {
            var k = n.toLowerCase();
            seen[k] = (seen[k] || 0) + 1;
            return seen[k] > 1 ? n + ' ' + seen[k] : n;
        });
    }
    function rank(players) {
        return players.map(function (p, i) { return { p: p, i: i }; })
            .sort(function (a, b) { return b.p.score - a.p.score || a.i - b.i; })
            .map(function (x) { return x.p; });
    }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function shareText(ranked, rounds) {
        var top = ranked.filter(function (p) { return p.score === ranked[0].score; });
        var head = 'Mr. White su Quizzotti, ' + plural(rounds, 'round', 'round') + ': ' +
            (top.length > 1 ? 'pari in vetta tra ' + top.map(function (p) { return p.name; }).join(' e ') : 'vince ' + top[0].name) +
            ' con ' + plural(top[0].score, 'punto', 'punti') + '.';
        return head + '\n' + ranked.map(function (p, i) { return (i + 1) + '. ' + p.name + ' ' + p.score; }).join('\n') +
            '\nChi di voi bluffa meglio?';
    }

    /* ---------- Salvataggio tra un round e l'altro ---------- */
    var SAVE_MAX_AGE = 12 * 3600 * 1000;
    function snapshot(G, now) {
        return {
            v: 1, at: now, cfg: Object.assign({}, G.cfg), round: G.round, done: G.done,
            stats: Object.assign({}, G.stats),
            players: G.players.map(function (p) { return { name: p.name, color: p.color, score: p.score, mwTimes: p.mwTimes, mwWins: p.mwWins }; })
        };
    }
    function validSave(s, now) {
        if (!s || s.v !== 1 || typeof s.at !== 'number' || now - s.at > SAVE_MAX_AGE || now < s.at - 60000) return false;
        if (!s.cfg || JSON.stringify(sanitizeCfg(s.cfg)) !== JSON.stringify(Object.assign({}, DEFAULTS, s.cfg))) return false;
        if (!Array.isArray(s.players) || s.players.length < MIN_P || s.players.length > MAX_P) return false;
        if (!(s.done >= 1 && s.round === s.done)) return false;
        if (s.cfg.rounds && s.done >= s.cfg.rounds) return false;
        if (!s.stats || ['caught', 'guessed', 'civOut', 'infOut'].some(function (k) { return typeof s.stats[k] !== 'number'; })) return false;
        return s.players.every(function (p) {
            return p && typeof p.name === 'string' && p.name && typeof p.color === 'string' &&
                ['score', 'mwTimes', 'mwWins'].every(function (k) { return typeof p[k] === 'number' && isFinite(p[k]); });
        });
    }

    var core = {
        CHOICES: CHOICES, DEFAULTS: DEFAULTS, PTS: PTS, sanitizeCfg: sanitizeCfg, maxBad: maxBad, canInf: canInf, maxMW: maxMW,
        norm: norm, checkGuess: checkGuess, buildIndex: buildIndex, shirtName: shirtName, hintLetter: hintLetter,
        outcome: outcome, settle: settle, speakOrder: speakOrder, uniqueNames: uniqueNames, rank: rank,
        shareText: shareText, snapshot: snapshot, validSave: validSave
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

    /* ======================================================================
       Da qui in giu': la pagina
       ====================================================================== */
    var $ = QZ.$;
    var DATA = window.mrwhiteData || { italiani: wordsList, stranieri: [], coppie: [], alias: {}, maglia: {} };
    var ALL = wordsList.map(function (w) { return String(w).trim(); });
    var IDX = buildIndex(ALL, DATA.alias);
    var POOLS = { tutti: null, italiani: new Set(DATA.italiani), stranieri: new Set(DATA.stranieri) };
    var deck = new QZ.Deck('mrwhite', ALL);
    var pairDeck = new QZ.Deck('mrwhite-coppie', DATA.coppie || [], function (p) { return p.join('|'); });
    var CFG = sanitizeCfg(QZ.store.get('qz.mrwhite.cfg', {}));
    var SAVE_KEY = 'qz.mrwhite.save', STATS_KEY = 'qz.mrwhite.stats';
    var NUM = 'N° ' + String(QZ.GAMES.indexOf(QZ.game('mrwhite')) + 1).padStart(2, '0');

    var G = null;      // partita
    var R = null;      // round in corso
    var talk = null;   // timer della discussione
    var busy = false;

    /* ---------- Markup statico ---------- */
    $('#mw-eyebrow').textContent = NUM + ' · Da 3 a 12';
    $('#start-btn').innerHTML = 'Accendi lo schermo' + QZ.icon('arrow');
    $('#medal').innerHTML = '<span class="mw-q" aria-hidden="true">?</span>';
    $('#rules').innerHTML = [
        ['Passatevi il telefono:', 'ognuno accende il maxischermo di nascosto e vede il calciatore segreto.'],
        ['Mr. White', 'trova lo schermo senza segnale: non sa chi è il calciatore e deve fare finta di saperlo.'],
        ['Una parola a testa', 'sul calciatore, poi si vota chi buttare fuori. Pari? Si rivota tra quelli.'],
        ['Beccato?', 'Mr. White ha un ultimo tiro: se indovina il calciatore, la vince lui.'],
        ['Con l\'Infiltrato', 'uno di voi vede un calciatore simile, e non lo sa. Occhio a chi «sbaglia» di poco.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#points').innerHTML = [
        ['Civili', '+' + PTS.civWin + ' se fuori tutti gli impostori'],
        ['Mr. White', '+' + PTS.survive + ' se arriva in fondo, +' + PTS.guess + ' se indovina all\'ultimo tiro, ' + PTS.wrongGuess + ' se sbaglia'],
        ['Compagni', '+' + PTS.mate + ' agli altri impostori quando Mr. White indovina']
    ].map(function (r) { return '<li><b>' + r[0] + '</b> <span>' + r[1] + '</span></li>'; }).join('');

    function lifetime() {
        var s = QZ.store.get(STATS_KEY, null);
        return s && typeof s === 'object' && typeof s.rounds === 'number' && typeof s.mwWins === 'number' ? s : { rounds: 0, mwWins: 0 };
    }
    function paintRecord() {
        var played = QZ.profile.get().gamesPlayed.mrwhite;
        var s = lifetime();
        var txt = played ? 'Su questo telefono: ' + plural(played, 'partita giocata', 'partite giocate') : '';
        if (s.rounds) txt += (txt ? ' · ' : 'Su questo telefono: ') + 'Mr. White ha vinto ' + s.mwWins + ' round su ' + s.rounds;
        $('#start-record').textContent = txt ? txt + '.' : '';
    }
    paintRecord();

    var players = QZ.playerList($('#players-host'), { key: 'mrwhite', min: MIN_P, max: MAX_P, initial: 4, label: 'Giocatore', title: 'Giocatori (3-12)' });

    $('#mw-minus').innerHTML = QZ.icon('minus');
    $('#mw-plus').innerHTML = QZ.icon('plus');
    function infOn(n) { return CFG.inf && canInf(n); }
    function syncRoles() {
        var n = players.count();
        var max = maxMW(n, CFG.inf);
        CFG.mw = QZ.clamp(CFG.mw, 1, max);
        $('#mw-count').textContent = CFG.mw;
        $('#mw-minus').disabled = CFG.mw <= 1;
        $('#mw-plus').disabled = CFG.mw >= max;
        var box = $('#opt-inf');
        box.disabled = !canInf(n);
        box.checked = infOn(n);
        $('#inf-note').textContent = canInf(n) ? '(vede un calciatore simile)' : '(da 5 giocatori in su)';
    }
    $('#mw-minus').addEventListener('click', function () { CFG.mw--; syncRoles(); saveCfg(); QZ.sound.click(); });
    $('#mw-plus').addEventListener('click', function () { CFG.mw++; syncRoles(); saveCfg(); QZ.sound.pop(); });
    // il numero di giocatori cambia dal componente lista: ricalcola i ruoli possibili
    $('#players-host').addEventListener('click', function () { setTimeout(syncRoles, 0); });

    QZ.segmented($('#opt-timer'), [
        { label: 'Libero', value: 0 }, { label: '1 min', value: 60 }, { label: '2 min', value: 120 }, { label: '3 min', value: 180 }
    ], CFG.timer, function (v) { CFG.timer = v; saveCfg(); });
    QZ.segmented($('#opt-rounds'), [
        { label: '3', value: 3 }, { label: '5', value: 5 }, { label: '8', value: 8 }, { label: 'Senza fine', value: 0 }
    ], CFG.rounds, function (v) { CFG.rounds = v; saveCfg(); });
    QZ.segmented($('#opt-pool'), [
        { label: 'Tutti', value: 'tutti' }, { label: 'Italiani', value: 'italiani' }, { label: 'Stranieri', value: 'stranieri' }
    ], CFG.pool, function (v) { CFG.pool = v; saveCfg(); });
    $('#opt-hint').checked = CFG.hint;
    $('#opt-hint').addEventListener('change', function () { CFG.hint = $('#opt-hint').checked; saveCfg(); });
    $('#opt-inf').addEventListener('change', function () { CFG.inf = $('#opt-inf').checked; syncRoles(); saveCfg(); });
    syncRoles();
    function saveCfg() { QZ.store.set('qz.mrwhite.cfg', CFG); }

    $('#start-btn').addEventListener('click', function () { startGame(); });

    /* ---------- Partita lasciata a meta' ---------- */
    function readSave() {
        var s = QZ.store.get(SAVE_KEY, null);
        if (validSave(s, Date.now())) return s;
        if (s) QZ.store.remove(SAVE_KEY);
        return null;
    }
    function paintResume() {
        var s = readSave(), box = $('#mw-resume');
        box.hidden = !s;
        if (!s) return;
        var top = rank(s.players)[0];
        $('#mw-resume-txt').innerHTML = 'Partita lasciata a metà: <b>' + (s.cfg.rounds ? s.done + ' round su ' + s.cfg.rounds : plural(s.done, 'round giocato', 'round giocati')) +
            '</b>, in testa ' + QZ.esc(top.name) + ' con ' + plural(top.score, 'punto', 'punti') + '. Si riparte con un calciatore nuovo.';
    }
    $('#mw-resume-go').innerHTML = QZ.icon('play', 'ico-fill') + 'Riprendi';
    $('#mw-resume-no').textContent = 'Lascia stare';
    $('#mw-resume-go').addEventListener('click', function () {
        var s = readSave();
        if (!s) { paintResume(); return; }
        startGame(s);
    });
    $('#mw-resume-no').addEventListener('click', function () {
        QZ.store.remove(SAVE_KEY);
        paintResume();
        $('#start-btn').focus({ preventScroll: true });
    });
    paintResume();

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
    function alive(role) {
        var out = [];
        G.players.forEach(function (p, i) {
            if (R.alive[i] && (role == null || R.role[i] === role)) out.push(i);
        });
        return out;
    }
    function roundLabel() { return 'Round ' + G.round + (G.cfg.rounds ? '/' + G.cfg.rounds : ''); }
    function pad(n) { return String(n).padStart(2, '0'); }
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
    function save() { if (G && G.done) QZ.store.set(SAVE_KEY, snapshot(G, Date.now())); }

    /* ---------- Partita ---------- */
    function startGame(resume) {
        if (resume) {
            G = {
                cfg: sanitizeCfg(resume.cfg),
                players: resume.players.map(function (p) { return Object.assign({}, p); }),
                round: resume.round, done: resume.done,
                stats: Object.assign({}, resume.stats)
            };
        } else {
            syncRoles();
            var names = uniqueNames(players.get());
            var cfg = Object.assign({}, CFG);
            cfg.inf = infOn(names.length);
            cfg.mw = QZ.clamp(cfg.mw, 1, maxMW(names.length, cfg.inf));
            G = {
                cfg: cfg,
                players: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], score: 0, mwTimes: 0, mwWins: 0 }; }),
                round: 0, done: 0,
                stats: { caught: 0, guessed: 0, civOut: 0, infOut: 0 }
            };
            QZ.store.remove(SAVE_KEY);
        }
        busy = false;
        QZ.wake.on();
        QZ.sound.start();
        newRound();
    }

    function drawWords() {
        var pool = POOLS[G.cfg.pool];
        var inPool = pool ? function (w) { return pool.has(w); } : null;
        if (G.cfg.inf) {
            var pair = pairDeck.draw(inPool ? function (p) { return inPool(p[0]) && inPool(p[1]); } : null) || pairDeck.draw();
            if (pair) {
                var flip = Math.random() < 0.5;
                return { word: pair[flip ? 1 : 0], infWord: pair[flip ? 0 : 1] };
            }
        }
        return { word: deck.draw(inPool) || deck.draw(), infWord: null };
    }

    function newRound() {
        G.round++;
        var n = G.players.length;
        var w = drawWords();
        var bad = QZ.shuffle(G.players.map(function (_, i) { return i; }));
        var mwIdx = bad.slice(0, G.cfg.mw);
        var infIdx = w.infWord ? bad[G.cfg.mw] : -1;
        var start = (G.round - 1) % n;
        R = {
            word: w.word, infWord: w.infWord,
            role: G.players.map(function (_, i) { return mwIdx.indexOf(i) >= 0 ? 'mw' : i === infIdx ? 'inf' : 'civ'; }),
            alive: G.players.map(function () { return true; }),
            order: G.players.map(function (_, i) { return (start + i) % n; }),
            pos: 0, flipped: false, turn: 0,
            delta: G.players.map(function () { return 0; })
        };
        R.role.forEach(function (r, i) { if (r === 'mw') G.players[i].mwTimes++; });
        $('#rv-round').textContent = G.cfg.rounds ? pad(G.round) + '/' + pad(G.cfg.rounds) : pad(G.round);
        $('#rv-dots').innerHTML = R.order.map(function () { return '<i></i>'; }).join('');
        $('#rv-card').classList.remove('is-flipped');
        $('#rv-back').innerHTML = '';
        $('#rv-front').removeAttribute('aria-hidden');
        $('#rv-front').setAttribute('tabindex', '0');
        renderFront();
        QZ.show('s-reveal');
    }

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
    // il calciatore in onda: uguale per civili e Infiltrato, che non deve accorgersi di nulla
    function onAirHTML(word) {
        return '<div class="mw-screen">' +
            '<div class="mw-screen__bar"><span>MAXISCHERMO</span><b>IN ONDA</b></div>' +
            '<div class="mw-screen__body"><span class="mw-screen__k">Il calciatore segreto</span>' + shirt(word) +
            '<div class="mw-screen__name">' + QZ.esc(word) + '</div></div>' +
            '<div class="mw-screen__foot" style="font-weight:600;font-size:15px">Descrivilo con una parola, senza regalarlo a Mr. White.</div>' +
            '</div>';
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
        if (R.role[p] === 'mw') {
            var mates = G.cfg.mw > 1 ? 'In campo siete in ' + G.cfg.mw + '.' : '';
            if (R.infWord) mates += (mates ? ' ' : '') + 'C\'è anche un infiltrato che non sa di esserlo.';
            return noSignalHTML('Sei Mr. White', G.cfg.hint
                ? '<span class="note">sulla maglia: ' + QZ.esc(hintLetter(R.word, DATA.maglia)) + '…</span>' + (mates ? '<p class="mw-screen__txt">' + mates + '</p>' : '')
                : '<p class="mw-screen__txt">Non sai chi è. Ascolta, bluffa, non farti beccare.' + (mates ? ' ' + mates : '') + '</p>');
        }
        return onAirHTML(R.role[p] === 'inf' ? R.infWord : R.word);
    }

    function flipCard() {
        if (busy || R.flipped || !onScreen('s-reveal')) return;
        var i = R.order[R.pos];
        var back = $('#rv-back');
        // stessa classe per civili e Infiltrato: niente indizi nel markup
        back.className = 'flip__face flip__face--back mw-face ' + (R.role[i] === 'mw' ? 'mw-face--spy' : 'mw-face--civ');
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
        $('#tk-eyebrow').innerHTML = QZ.icon('message') + (R.turn > 1 ? 'Si riparla' : 'Si parla');
        // il primo a parlare non e' mai Mr. White, poi si segue il giro
        var order = speakOrder(alive(), R.role, QZ.pick);
        $('#tk-order').innerHTML = order.map(function (i, k) {
            var p = G.players[i];
            return '<li style="--i:' + k + '">' + av(p) + '<span class="grow">' + QZ.esc(p.name) + '</span>' + (k === 0 ? '<span class="note">comincia tu</span>' : '') + '</li>';
        }).join('');

        if (talk) talk.destroy();
        var host = $('#tk-timer');
        if (G.cfg.timer) {
            host.innerHTML = QZ.ringHTML('timer-ring--xl');
            talk = new QZ.Timer({
                seconds: G.cfg.timer, ring: QZ.ring(host.firstChild),
                onSecond: function (s) {
                    if (s <= 5 && s > 0) QZ.sound.tick();
                    if (s === 10) QZ.say('Ultimi 10 secondi.');
                },
                onExpire: function () {
                    QZ.sound.whistle();
                    QZ.vibrate([120, 60, 120]);
                    QZ.toast('Tempo. Si vota.', { icon: 'whistle' });
                    QZ.say('Tempo scaduto. Si vota.', true);
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

    /** Cronometro in avanti quando non si sceglie un tempo. */
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
        var text = G.done ? 'Il round in corso non conta. Si va dritti alla classifica.' : 'Nessun round finito: la partita non conta.';
        QZ.confirm(text, { title: 'Chiudere qui?', okLabel: 'Chiudi', cancelLabel: 'Si continua', danger: true }).then(function (ok) {
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
        QZ.$$('#vt-list .mw-ballot__row').forEach(function (b) {
            var p = G.players[Number(b.dataset.i)];
            if (b.disabled) { b.setAttribute('aria-label', p.name + ', già fuori'); return; }
            b.setAttribute('aria-label', 'Vota ' + p.name);
            b.addEventListener('click', function () { vote(Number(b.dataset.i), b); });
        });
        QZ.sound.whoosh();
        QZ.show('s-vote');
    }
    $('#vt-back').addEventListener('click', function () { if (!busy && onScreen('s-vote')) QZ.show('s-talk'); });

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
                else { row.classList.remove('is-picked'); QZ.$$('.qz-mark', box).forEach(function (m) { m.remove(); }); row.focus({ preventScroll: true }); }
            });
        }, QZ.reducedMotion() ? 0 : 750);
    }

    /* ---------- Verdetto con suspense ---------- */
    function eliminate(i) {
        var p = G.players[i];
        var role = R.role[i];
        R.alive[i] = false;
        busy = true;
        $('#vd-card').classList.remove('is-flipped');
        $('#vd-front').innerHTML = offHTML('Sul maxischermo', p, '<span>era…</span>', 'mw-screen--verdict');
        var back = $('#vd-back');
        back.className = 'flip__face flip__face--back mw-face ' + (role === 'mw' ? 'mw-face--spy' : 'mw-face--out');
        // il retro (l'esito) resta muto finche' la carta non si gira
        back.setAttribute('aria-hidden', 'true');
        $('#vd-front').removeAttribute('aria-hidden');
        if (role === 'mw') {
            back.innerHTML = noSignalHTML('Mr. White', '<p class="mw-screen__txt">' + QZ.esc(p.name) + ' non sapeva niente. Ma ha ancora un tiro.</p>', QZ.icon('target') + 'Ultimo tiro in arrivo');
        } else if (role === 'inf') {
            // il suo calciatore resta coperto: direbbe troppo a un Mr. White ancora in campo
            back.innerHTML = '<div class="mw-screen"><div class="mw-screen__bar"><span>MAXISCHERMO</span><b>SEGNALE DISTURBATO</b></div>' +
                '<div class="mw-screen__body"><span class="mw-screen__k">L\'infiltrato</span>' + av(p, 'mw-av--xl') +
                '<div class="mw-screen__name">' + QZ.esc(p.name) + '</div><p class="mw-screen__txt">Vedeva un altro calciatore, simile al vostro. Non lo sapeva nemmeno lui.</p></div>' +
                '<div class="mw-screen__foot">' + QZ.icon('eyeoff') + 'Il suo calciatore si scopre a fine round</div></div>';
        } else {
            back.innerHTML = '<div class="mw-screen"><div class="mw-screen__bar"><span>MAXISCHERMO</span><b>IN ONDA</b></div>' +
                '<div class="mw-screen__body"><span class="mw-screen__k">Uno dei vostri</span>' + av(p, 'mw-av--xl') +
                '<div class="mw-screen__name">' + QZ.esc(p.name) + '</div><p class="mw-screen__txt">Avete buttato fuori un innocente.</p></div>' +
                '<div class="mw-screen__foot">' + QZ.icon('users') + 'Sapeva chi era il calciatore</div></div>';
        }
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
            var body = back.querySelector('.mw-screen__body');
            if (role === 'mw') {
                G.stats.caught++;
                QZ.sound.reveal();
                QZ.vibrate([60, 40, 160]);
                setTimeout(function () { QZ.fx.stamp(body, 'Smascherato', 'ok', { size: 34, y: 46, say: false }); }, 550);
                setTimeout(function () { busy = false; guessPanel(i); }, 900);
            } else if (role === 'inf') {
                G.stats.infOut++;
                QZ.sound.reveal();
                QZ.vibrate([60, 40, 160]);
                setTimeout(function () { QZ.fx.stamp(body, 'Infiltrato', 'ink', { size: 34, y: 46, say: false }); }, 550);
                setTimeout(function () { busy = false; afterOut(p.name + ' era l\'infiltrato: preso. '); }, 900);
            } else {
                G.stats.civOut++;
                QZ.sound.wrong();
                QZ.vibrate([60, 40, 60]);
                setTimeout(function () { QZ.fx.stamp(body, 'Innocente', 'bad', { size: 34, y: 46, say: false }); }, 550);
                setTimeout(function () { busy = false; afterOut(p.name + ' era innocente. '); }, 900);
            }
        }, beats ? 1350 : 200);
    }

    /** Dopo un'eliminazione senza ultimo tiro: si chiude il round o si riparla. */
    function afterOut(lead) {
        var res = outcome(R.role, R.alive);
        if (res === 'civ') {
            panel('<p class="mw-msg center">Fuori tutti gli impostori. Il calciatore è salvo.</p>', 'Vedi il round', function () { endRound('civ', 'caught'); }, lead);
        } else if (res === 'bad') {
            var solo = R.role.filter(function (r) { return r !== 'civ'; }).length === 1;
            panel('<p class="mw-msg center">' + (solo ? 'Ora Mr. White e voi siete pari. Partita chiusa: l\'ha fatta franca.' : 'Ora gli impostori sono quanti voi. Partita chiusa: l\'hanno fatta franca.') + '</p>', 'Vedi il round', function () { endRound('bad', 'survive'); }, lead);
        } else {
            var mw = alive('mw').length, inf = alive('inf').length;
            var who = mw > 1 ? 'Ci sono ancora ' + mw + ' Mr. White' : mw ? 'Mr. White è ancora' : 'L\'infiltrato è ancora';
            if (mw && inf) who += (mw > 1 ? ' e l\'infiltrato' : ', e pure l\'infiltrato,');
            panel('<p class="mw-msg center">' + who + ' in campo. Altro giro di parole.</p>', 'Altro giro', startTalk, lead);
        }
    }

    // lead: l'esito da annunciare prima del messaggio (la scritta LED e' solo per gli occhi)
    function panel(html, label, fn, lead) {
        var host = $('#vd-panel');
        host.innerHTML = html + '<button type="button" class="btn btn--primary btn--lg btn--block" data-next>' + QZ.icon('arrow') + '<span></span></button>';
        host.querySelector('[data-next] span').textContent = label;
        var btn = host.querySelector('[data-next]');
        btn.addEventListener('click', function () { if (onScreen('s-verdict')) fn(); }, { once: true });
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
            '<div class="mw-guess__row"><input class="input" id="vd-input" maxlength="40" placeholder="Nome e cognome" autocapitalize="words" autocomplete="off" spellcheck="false" enterkeyhint="go">' +
            '<button class="btn btn--primary" type="submit">' + QZ.icon('ball') + 'Tira</button></div>' +
            '<p class="small muted">Vale anche il solo cognome, se non ce ne sono due uguali. Qualche refuso si perdona.</p>' +
            '<button class="btn btn--ghost btn--sm" type="button" id="vd-giveup">Non lo so, bandiera bianca</button></form>';
        var form = $('#vd-form'), input = $('#vd-input');
        QZ.say(p.name + ' era Mr. White: smascherato. Ultimo tiro: deve indovinare il calciatore.');
        setTimeout(function () { input.focus({ preventScroll: true }); }, 80);
        var shot = false;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (shot) return;
            if (!input.value.trim()) { QZ.fx.shake(input); QZ.say('Scrivi un nome, o alza bandiera bianca.'); return; }
            shot = true;
            judge(i, checkGuess(input.value, R.word, DATA.alias, IDX), input.value.trim());
        });
        $('#vd-giveup').addEventListener('click', function () { if (shot) return; shot = true; judge(i, 'no', ''); });
    }

    function judge(i, res, said) {
        var p = G.players[i];
        if (res === 'yes') {
            G.stats.guessed++;
            R.delta[i] += PTS.guess;
            QZ.sound.correct();
            panel('<div class="card mw-solution">' + shirt(R.word) +
                '<p class="mw-msg grow"><b>' + QZ.esc(p.name) + '</b> ci ha preso: era <b>' + QZ.esc(R.word) + '</b>. Che faccia tosta.</p></div>',
                'Vedi il round', function () { endRound('bad', 'guess', i); }, 'Gol! ');
            QZ.fx.stamp($('#vd-panel .mw-solution'), 'Gol!', 'bad', { size: 26, x: 80, y: 0, say: false });
            return;
        }
        R.delta[i] += PTS.wrongGuess;
        QZ.sound.buzzer();
        QZ.fx.shake($('#vd-panel'));
        // se il round va avanti (altri impostori in campo) nessun indizio: il messaggio resta neutro
        var res2 = outcome(R.role, R.alive);
        var ends = res2 !== null;
        var msg = !said ? QZ.esc(p.name) + ' alza bandiera bianca.'
            : res === 'ambiguous' && ends ? '«' + QZ.esc(said) + '»: di quel cognome ce n\'è più d\'uno, serviva anche il nome.'
                : '«' + QZ.esc(said) + '»: ' + QZ.pick(['fuori dallo specchio.', 'alto sopra la traversa.', 'para il portiere.', 'palo pieno.']);
        var override = said ? '<button type="button" class="btn btn--ghost btn--sm" id="vd-override">' + QZ.icon('check') + 'Era giusta, decide il gruppo</button>' : '';
        var next = res2 === 'civ' ? function () { endRound('civ', 'caught'); }
            : res2 === 'bad' ? function () { endRound('bad', 'survive'); }
                : startTalk;
        panel('<div class="card center stack" style="--gap:10px;align-items:center"><span class="note" style="color:var(--led-red)">' + QZ.fmt(PTS.wrongGuess) + ' punti</span><p class="mw-msg">' + msg + '</p>' + override + '</div>',
            ends ? 'Vedi il round' : 'Altro giro', next);
        var ov = $('#vd-override');
        if (ov) ov.addEventListener('click', function () {
            if (ov.disabled) return;
            ov.disabled = true;
            R.delta[i] -= PTS.wrongGuess;  // annulla la penalita' appena data
            judge(i, 'yes', said);
        });
    }

    /* ---------- Fine round ---------- */
    function endRound(winner, how, guesser) {
        if (talk) talk.pause();
        var bonus = settle(R.role, R.alive, winner, how, guesser);
        G.players.forEach(function (p, i) {
            R.delta[i] += bonus[i];
            p.score += R.delta[i];
            if (winner === 'bad' && R.role[i] === 'mw') p.mwWins++;
        });
        G.done++;
        var life = lifetime();
        life.rounds++;
        if (winner === 'bad') life.mwWins++;
        QZ.store.set(STATS_KEY, life);

        var mwNames = G.players.filter(function (_, i) { return R.role[i] === 'mw'; }).map(function (p) { return p.name; });
        var infI = R.role.indexOf('inf');
        var many = mwNames.length > 1;
        var hows = {
            caught: ['Smascherato', infI >= 0 ? (many ? 'Fuori i Mr. White' : 'Fuori Mr. White') + ' e l\'infiltrato: il gruppo ha tenuto.' : many ? 'Beccati tutti, e nessuno ha indovinato il calciatore.' : 'Beccato, e all\'ultimo tiro niente gol.'],
            guess: ['Colpo di scena', 'Beccato, ma all\'ultimo tiro ha indovinato il calciatore.'],
            survive: ['L\'ha fatta franca', 'Nessuno se n\'è accorto in tempo. Bluff da manuale.']
        };
        var title = winner === 'civ' ? 'Vincono i civili' : infI >= 0 && how === 'survive' ? 'Vincono gli impostori' : many ? 'Vincono i Mr. White' : 'Vince Mr. White';
        var more = !G.cfg.rounds || G.round < G.cfg.rounds;
        var sorted = G.players.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return b.p.score - a.p.score || a.i - b.i; });
        var tag = function (i) { return R.role[i] === 'mw' ? '<small>era Mr. White</small>' : R.role[i] === 'inf' ? '<small>era l\'infiltrato</small>' : ''; };
        $('#rd-host').innerHTML =
            '<div class="result" data-stagger>' +
            '<span class="eyebrow">Fine ' + roundLabel() + '</span>' +
            '<h2 class="result__title" tabindex="-1">' + title + '</h2>' +
            '<p class="muted result__sub">' + hows[how][1] + '</p></div>' +
            '<div class="card card--tight mw-solution" id="rd-sol">' + shirt(R.word) +
            '<div class="grow"><div class="mw-solution__k">Il calciatore era</div><div class="mw-name">' + QZ.esc(R.word) + '</div>' +
            '<div class="mt-1">' + (many ? 'I Mr. White: ' : 'Mr. White: ') + '<b>' + QZ.esc(mwNames.join(', ')) + '</b></div>' +
            (infI >= 0 ? '<div class="mt-1">L\'infiltrato, <b>' + QZ.esc(G.players[infI].name) + '</b>, vedeva <b>' + QZ.esc(R.infWord) + '</b></div>' : '') +
            '</div></div>' +
            '<div class="mw-standings" style="margin-top:6px">' + sorted.map(function (x, k) {
                var d = R.delta[x.i];
                return '<div class="team" style="--c:' + x.p.color + ';animation:qz-rise .35s var(--ease-out) both;animation-delay:' + (k * 60 + 200) + 'ms">' +
                    '<span class="team__dot"></span><span class="team__name">' + QZ.esc(x.p.name) + tag(x.i) + '</span>' +
                    (d ? '<span class="mw-delta ' + (d > 0 ? 'mw-delta--up' : 'mw-delta--down') + '">' + (d > 0 ? '+' : '') + d + '</span>' : '') +
                    '<span class="team__score">' + QZ.fmt(x.p.score) + '</span></div>';
            }).join('') + '</div>' +
            '<div class="result__actions" style="margin-top:4px">' +
            (more ? '<button type="button" class="btn btn--primary btn--lg" id="rd-next">' + QZ.icon('play', 'ico-fill') + 'Prossimo round</button>' +
                '<button type="button" class="btn btn--ghost btn--lg" id="rd-end">' + QZ.icon('flag') + 'Chiudi qui</button>'
                : '<button type="button" class="btn btn--primary btn--lg" id="rd-end">' + QZ.icon('trophy') + 'Classifica finale</button>') +
            '</div>';
        if (more) save(); else QZ.store.remove(SAVE_KEY);
        QZ.show('s-round');
        setTimeout(function () {
            // la scritta LED sul bordo basso del riquadro, senza coprire il nome
            QZ.fx.stamp($('#rd-sol'), hows[how][0], winner === 'civ' ? 'ok' : 'bad', { size: 22, x: 58, y: 100, say: false });
        }, QZ.reducedMotion() ? 0 : 650);
        if (winner === 'civ') { QZ.sound.win(); setTimeout(function () { QZ.fx.confetti({ count: 100 }); }, 300); }
        else QZ.sound.reveal();
        QZ.say(title + '. ' + hows[how][1] + ' Il calciatore era ' + R.word + '.' + (infI >= 0 ? ' L\'infiltrato vedeva ' + R.infWord + '.' : ''));
        // un tocco solo: il doppio tap non deve saltare un round o registrare due volte la partita
        var leaving = false;
        var once = function (fn) { return function () { if (leaving || !onScreen('s-round')) return; leaving = true; fn(); }; };
        if ($('#rd-next')) $('#rd-next').addEventListener('click', once(newRound));
        $('#rd-end').addEventListener('click', once(finishGame));
        setTimeout(function () { var b = $('#rd-next') || $('#rd-end'); if (b) b.focus({ preventScroll: true }); }, 250);
    }

    /* ---------- Fine partita ---------- */
    function finishGame() {
        if (talk) { talk.destroy(); talk = null; }
        QZ.wake.off();
        QZ.store.remove(SAVE_KEY);
        busy = false;
        if (!G || !G.done) { G = null; paintResume(); QZ.show('s-start'); return; }
        var sorted = rank(G.players);
        var top = sorted.filter(function (p) { return p.score === sorted[0].score; });
        var champ = top.map(function (p) { return p.name; }).join(' e ');
        var r = QZ.profile.record('mrwhite', { xp: Math.min(200, 20 + G.done * 15 + G.stats.caught * 5), label: plural(G.done, 'round', 'round') + ' · ' + (top.length > 1 ? 'pari tra ' : 'vince ') + champ });
        paintRecord();
        paintResume();
        var bluffer = G.players.filter(function (p) { return p.mwWins; }).sort(function (a, b) { return b.mwWins - a.mwWins; })[0];
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: true,
            icon: 'trophy',
            title: top.length > 1 ? 'Pari in vetta' : 'Vince ' + champ,
            subtitle: top.length > 1 ? champ + ' chiudono a pari punti dopo ' + plural(G.done, 'round', 'round') + '.'
                : QZ.pick(['Il miglior segugio, o il miglior bugiardo.', 'Faccia da poker e orecchio fino.', 'Al bar se ne parlerà per una settimana.']) + ' Dopo ' + plural(G.done, 'round', 'round') + ' non si discute.',
            big: sorted[0].score, bigSuffix: ' pt',
            record: r,
            // il voto in pagella al vincitore: 150 punti a round sono una media da campione
            ratio: QZ.clamp(sorted[0].score / (G.done * 150), 0, 1),
            stats: [
                { label: 'Round giocati', value: G.done },
                { label: 'Mr. White beccati', value: G.stats.caught },
                { label: 'Indovinati all\'ultimo', value: G.stats.guessed },
                { label: 'Innocenti fuori', value: G.stats.civOut },
                G.cfg.inf ? { label: 'Infiltrati presi', value: G.stats.infOut } : null,
                bluffer ? { label: 'Bugiardo d\'oro', value: bluffer.name } : null
            ],
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(sorted.map(function (p) {
                return { name: p.name, score: p.score, color: p.color, sub: !p.mwTimes ? 'mai Mr. White' : 'Mr. White ' + plural(p.mwTimes, 'volta', 'volte') + (p.mwWins ? ', l\'ha fatta franca ' + plural(p.mwWins, 'volta', 'volte') : ', sempre beccato') };
            }), function (s) { return QZ.fmt(s) + ' pt'; }) + '</div>',
            share: shareText(sorted, G.done),
            onRetry: function () { startGame(); },
            secondary: { label: 'Cambia giocatori', icon: 'users', onClick: function () { QZ.show('s-start'); } }
        });
    }

    /* ---------- Tastiera ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        var scr = document.querySelector('.screen.is-active:not(.is-leaving)');
        if (!scr || !R) return;
        var k = e.key;
        // Spazio e Invio su un bottone fanno il loro mestiere; le lettere e i numeri valgono ovunque
        if ((k === ' ' || k === 'Enter') && t && t.closest && t.closest('button, a, [role="button"]')) return;
        if (scr.id === 's-reveal' && (k === ' ' || k === 'Enter')) { e.preventDefault(); $('#rv-btn').click(); }
        else if (scr.id === 's-talk' && k === ' ') { e.preventDefault(); toggleTalk(); }
        else if (scr.id === 's-talk' && (k === 'v' || k === 'V')) { e.preventDefault(); openVote(); }
        else if (scr.id === 's-vote' && /^[0-9]$/.test(k)) {
            var b = $('#vt-list [data-n="' + (k === '0' ? '10' : k) + '"]');
            if (b) { e.preventDefault(); b.click(); }
        }
    });
})();
