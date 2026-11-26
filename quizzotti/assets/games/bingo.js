/* ==========================================================================
   QUIZZOTTI v2 — Bingo della Partita
   Dati: assets/db-bingo.js (`bingoEvents`: {text, cat, g?, p, t?, rarity, r2?, f2?, ritirato?}).
   Si gioca davanti a una partita vera in TV. Cartelle 4x4, tutte con lo
   stesso schema. Premi: Riga (una riga, colonna o diagonale), Doppia (due),
   Bingo (piena).
   Le cartelle nascono da un codice (seme): stesso codice = stessa cartella.
   Il codice dice anche la versione dell'algoritmo, e ogni versione resta
   per sempre com'e':
   - v1, codici di 4 caratteri (fino a novembre 2026): 8 comuni sulle due
     diagonali, 4 medi e 4 rari (campo `rarity`), prime 148 voci al massimo.
     Le diagonali facevano quasi sempre la riga e il bingo non usciva mai.
   - v2, codici di 5 caratteri che iniziano con 2 (es. 2K7QX): 4 caselle
     "finale" (campo `f2`), una per riga, colonna e diagonale, poi 7 comuni,
     3 medi e 2 rari (campo `r2`, scelto dalla probabilita' stimata `p`),
     niente eventi ritirati, prime 185 voci. A pari evento la riga va a chi
     ha piu' caselle segnate. Simulazione e numeri in tests/bingo.test.js.
   Due modalita':
   - Cartelle per tutti: un telefono solo, una cartella per giocatore;
     chi tiene il telefono segna gli eventi dall'elenco e il gioco controlla
     tutte le cartelle e annuncia i premi.
   - La mia cartella: ognuno sul suo telefono, con il suo codice.
   La partita resta salvata in localStorage finche' non si fischia la fine
   o si chiede una partita nuova.
   Il nucleo (generatore con seme, righe, premi) non tocca il DOM ed e'
   esportato per i test con module.exports.
   ========================================================================== */
/* global bingoEvents */
(function () {
    'use strict';

    /* ======================================================================
       Nucleo: generatore deterministico e regole
       ==================================================================== */
    var Core = (function () {
        // niente 0/O e 1/I: il codice si detta a voce senza equivoci
        var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var SIZE = 4;
        // eventi del database prima dell'aggiornamento di novembre 2026: le partite
        // salvate senza `pool` si rigenerano su questi, cosi' le cartelle non cambiano
        var LEGACY_POOL = 113;
        /*
         * Le versioni dell'algoritmo. Una versione pubblicata non si tocca piu':
         * schema, numero di eventi e campo della rarita' decidono le cartelle
         * dei codici gia' dati. Per cambiare qualcosa si aggiunge una versione.
         * pattern: classe per casella, riga per riga (puo' uscire specchiato):
         * 1 comune, 2 medio, 3 raro (dal campo `tier` dell'evento), 4 finale
         * (eventi col campo `late`: succedono quasi sempre, ma solo verso la fine).
         * pool: quante voci del database guarda, al massimo.
         */
        var VERSIONS = {
            // righe e colonne con 2 comuni, 1 medio e 1 raro, diagonali con 4 comuni
            1: {
                pool: 148, tier: 'rarity', mix: { 1: 8, 2: 4, 3: 4 },
                pattern: [
                    1, 3, 2, 1,
                    2, 1, 1, 3,
                    3, 1, 1, 2,
                    1, 2, 3, 1
                ]
            },
            // ogni riga, colonna e diagonale ha una casella "finale" (4), quindi
            // nessuna linea si chiude nel primo tempo; solo 2 rari, in righe e
            // colonne diverse e fuori dalle diagonali, perche' il bingo deve poter
            // uscire. Diagonali: 2 finale, 1 comune, 1 medio. Nessuna scorciatoia.
            // Numeri della simulazione nei test (tests/bingo.test.js).
            2: {
                pool: 185, tier: 'r2', late: 'f2', mix: { 4: 4, 1: 7, 2: 3, 3: 2 },
                pattern: [
                    4, 1, 3, 1,
                    1, 2, 4, 1,
                    1, 4, 1, 3,
                    2, 2, 1, 4
                ]
            }
        };
        var CURRENT = 2;
        var MIX = VERSIONS[1].mix, PATTERN = VERSIONS[1].pattern; // nomi storici della v1
        var LINES = (function () {
            var l = [], r, c;
            for (r = 0; r < SIZE; r++) { var row = []; for (c = 0; c < SIZE; c++) row.push(r * SIZE + c); l.push(row); }
            for (c = 0; c < SIZE; c++) { var col = []; for (r = 0; r < SIZE; r++) col.push(r * SIZE + c); l.push(col); }
            var d1 = [], d2 = [];
            for (r = 0; r < SIZE; r++) { d1.push(r * SIZE + r); d2.push(r * SIZE + (SIZE - 1 - r)); }
            l.push(d1, d2);
            return l;
        })();

        function hash(str) {
            var h = 2166136261 >>> 0;
            for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
            return h >>> 0;
        }
        // mulberry32: piccolo, veloce e uguale su tutti i browser
        function rng(seed) {
            var a = seed >>> 0;
            return function () {
                a = (a + 0x6D2B79F5) >>> 0;
                var t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
        function shuffle(arr, rnd) {
            var a = arr.slice();
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(rnd() * (i + 1));
                var t = a[i]; a[i] = a[j]; a[j] = t;
            }
            return a;
        }
        function normCode(s) { return String(s == null ? '' : s).toUpperCase().replace(/[\s\-_.]/g, ''); }
        /** Versione dell'algoritmo di un codice: 1 (4 caratteri), 2 (5, il primo e' 2), 0 se non valido. */
        function codeVersion(s) {
            s = normCode(s);
            var body, v;
            if (s.length === 4) { body = s; v = 1; }
            else if (s.length === 5 && s[0] !== '1' && VERSIONS[s[0]]) { body = s.slice(1); v = Number(s[0]); }
            else return 0;
            for (var i = 0; i < body.length; i++) if (ALPHA.indexOf(body[i]) < 0) return 0;
            return v;
        }
        function validCode(s) { return codeVersion(s) > 0; }
        /** Codice nuovo a caso, della versione corrente (o di quella chiesta). */
        function randomCode(rnd, version) {
            rnd = rnd || Math.random;
            version = version || CURRENT;
            var s = version === 1 ? '' : String(version);
            for (var i = 0; i < 4; i++) s += ALPHA[Math.floor(rnd() * ALPHA.length)];
            return s;
        }
        /** Classe (1-4, vedi pattern) di un evento nelle cartelle di una versione; 0 se non ci entra. */
        function classOf(e, version) {
            var v = VERSIONS[version] || VERSIONS[1];
            if (version > 1 && e.ritirato && e.ritirato <= version) return 0;
            var r = rarityOf(e, version);
            if (!r) return 0;
            return v.late && e[v.late] ? 4 : r;
        }
        /** Rarita' da mostrare (1-3) di un evento nelle cartelle di una versione; 0 se non ci entra. */
        function rarityOf(e, version) {
            var r = e[(VERSIONS[version] || VERSIONS[1]).tier];
            return r === 1 || r === 2 || r === 3 ? r : 0;
        }

        /**
         * La cartella del codice: 16 eventi (oggetti del database) in ordine di
         * casella, riga per riga. Stesso codice e stesso database = stessa cartella.
         * pool: quanti eventi c'erano quando e' nata la partita (conta solo per la
         * v1, le partite salvate lo ricordano); non supera mai il pool della versione.
         */
        function makeCard(code, events, pool) {
            var version = codeVersion(code);
            if (!version) throw new Error('Bingo: codice non valido');
            var V = VERSIONS[version];
            var max = version === 1 && pool > 0 ? Math.min(pool, V.pool) : V.pool;
            if (max < events.length) events = events.slice(0, max);
            var rnd = rng(hash('bingo-partita/' + version + ':' + normCode(code)));
            // classi dalla piu' alta alla piu' bassa: nella v1 3, 2, 1 (prima i rari,
            // i piu' vincolati dagli argomenti), nella v2 4, 3, 2, 1
            var order = Object.keys(V.mix).map(Number).sort(function (a, b) { return b - a; });
            var pools = {}, picked = {}, next = {}, groups = {};
            order.forEach(function (k) { pools[k] = []; picked[k] = []; next[k] = 0; });
            events.forEach(function (e) { var k = classOf(e, version); if (pools[k]) pools[k].push(e); });
            order.forEach(function (r) {
                var list = shuffle(pools[r], rnd);
                for (var i = 0; i < list.length && picked[r].length < V.mix[r]; i++) {
                    var e = list[i];
                    if (e.g && groups[e.g]) continue;
                    picked[r].push(e);
                    if (e.g) groups[e.g] = true;
                }
                if (picked[r].length < V.mix[r]) throw new Error('Bingo: pochi eventi di classe ' + r);
            });
            var mirror = rnd() < 0.5;
            var cells = [];
            for (var i = 0; i < SIZE * SIZE; i++) {
                var r = Math.floor(i / SIZE), c = i % SIZE;
                var rar = V.pattern[mirror ? r * SIZE + (SIZE - 1 - c) : i];
                cells.push(picked[rar][next[rar]++]);
            }
            return cells;
        }

        /**
         * Stato di una cartella (array di testi) dato l'insieme dei testi segnati.
         * hot: caselle libere che, segnate, chiuderebbero almeno una linea.
         */
        function evaluate(cardTexts, isMarked) {
            var on = cardTexts.map(function (t) { return !!isMarked(t); });
            var done = [], hot = {};
            LINES.forEach(function (line) {
                var missing = line.filter(function (i) { return !on[i]; });
                if (!missing.length) done.push(line);
                else if (missing.length === 1) hot[missing[0]] = true;
            });
            var inLine = {};
            done.forEach(function (line) { line.forEach(function (i) { inLine[i] = true; }); });
            var count = on.filter(Boolean).length;
            return { on: on, lines: done.length, inLine: inLine, hot: hot, hotCount: Object.keys(hot).length, count: count, full: count === cardTexts.length };
        }

        /** Il prossimo premio a portata di una casella: 'riga' | 'doppia' | 'bingo' | null. */
        function oneAway(ev) {
            if (ev.full) return null;
            if (ev.count === ev.on.length - 1) return 'bingo';
            if (!ev.hotCount) return null;
            return ev.lines === 0 ? 'riga' : ev.lines === 1 ? 'doppia' : null;
        }

        var PRIZES = [
            { id: 'riga', name: 'Riga', test: function (ev) { return ev.lines >= 1; } },
            { id: 'doppia', name: 'Doppia', test: function (ev) { return ev.lines >= 2; } },
            { id: 'bingo', name: 'Bingo', test: function (ev) { return ev.full; } }
        ];

        /**
         * Chi ha vinto cosa, rigiocando gli eventi nell'ordine in cui sono stati
         * segnati: ogni premio va a chi lo raggiunge per primo (a pari evento,
         * a tutti). cards: array di array di testi; order: testi segnati in ordine.
         * tiebreak (cartelle v2): a pari evento vince chi ha piu' caselle segnate,
         * e solo se anche quelle sono pari il premio e' di tutti.
         * -> { riga: {step, winners:[indici]} | null, doppia: ..., bingo: ... }
         */
        function prizes(cards, order, tiebreak) {
            var res = { riga: null, doppia: null, bingo: null };
            var set = {};
            for (var s = 0; s < order.length; s++) {
                set[order[s]] = true;
                var evs = cards.map(function (c) { return evaluate(c, function (t) { return set[t]; }); });
                PRIZES.forEach(function (p) {
                    if (res[p.id]) return;
                    var w = [];
                    evs.forEach(function (ev, i) { if (p.test(ev)) w.push(i); });
                    if (tiebreak && w.length > 1) {
                        var most = Math.max.apply(null, w.map(function (i) { return evs[i].count; }));
                        w = w.filter(function (i) { return evs[i].count === most; });
                    }
                    if (w.length) res[p.id] = { step: s, winners: w };
                });
                if (res.bingo) break;
            }
            return res;
        }

        return {
            ALPHA: ALPHA, SIZE: SIZE, MIX: MIX, LEGACY_POOL: LEGACY_POOL, PATTERN: PATTERN, LINES: LINES, PRIZES: PRIZES,
            VERSIONS: VERSIONS, CURRENT: CURRENT,
            hash: hash, rng: rng, normCode: normCode, validCode: validCode, codeVersion: codeVersion, randomCode: randomCode,
            classOf: classOf, rarityOf: rarityOf, makeCard: makeCard, evaluate: evaluate, oneAway: oneAway, prizes: prizes
        };
    })();

    if (typeof module !== 'undefined' && module.exports) { module.exports = Core; }
    if (typeof document === 'undefined' || typeof QZ === 'undefined') return;

    /* ======================================================================
       Interfaccia
       ==================================================================== */
    var $ = QZ.$;
    var EVENTS = bingoEvents;
    var BY_TEXT = {};
    EVENTS.forEach(function (e) { BY_TEXT[e.text] = e; });
    var CATS = ['Campo', 'Arbitro e VAR', 'Panchina', 'Telecronaca e TV', 'Tifosi'];
    var KEY = 'qz.bingo.partita';
    var OPT_KEY = 'qz.bingo.opts';
    var opts = Object.assign({ mode: 'table' }, QZ.store.get(OPT_KEY, {}) || {});

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function cardTexts(code, pool) { return Core.makeCard(code, EVENTS, pool).map(function (e) { return e.text; }); }
    function poolOf(s) { var n = Number(s && s.pool); return n > 0 && n <= EVENTS.length ? Math.floor(n) : Math.min(Core.LEGACY_POOL, EVENTS.length); }
    function rulesHTML(list) {
        return list.map(function (r, i) {
            return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
        }).join('');
    }
    function pipsHTML(r) {
        return '<span class="bg-cell__pips" aria-hidden="true">' + [1, 2, 3].map(function (k) { return '<i' + (k <= r ? ' class="on"' : '') + '></i>'; }).join('') + '</span>';
    }
    var RARITY_WORD = { 1: 'comune', 2: 'media', 3: 'rara' };
    // quante caselle rare ha una cartella di quella versione
    function raresOf(version) { return Core.VERSIONS[version].pattern.filter(function (k) { return k === 3; }).length; }
    function rarity(t, version) { return BY_TEXT[t] ? Core.rarityOf(BY_TEXT[t], version) || 1 : 1; }
    // versione delle cartelle della partita in corso (al tavolo sono tutte della stessa)
    function gameVer(g) { g = g || S; return Core.codeVersion(g.mode === 'table' ? g.players[0].code : g.code) || 1; }
    // dalla v2, a pari evento la riga va a chi ha piu' caselle segnate
    function tablePrizes(g) { g = g || S; return Core.prizes(cards, g.marked, gameVer(g) > 1); }

    /** HTML di una cartella. interactive: caselle-bottone con data-i. version: delle rarita' mostrate. */
    function cardHTML(texts, ev, interactive, version) {
        return texts.map(function (t, i) {
            var e = { rarity: rarity(t, version) };
            var on = ev.on[i], line = ev.inLine[i], hot = !on && ev.hot && ev.hot[i];
            var cls = 'bg-cell' + (on ? ' is-on' : '') + (line ? ' is-line' : '') + (hot ? ' is-hot' : '');
            var label = QZ.esc(t) + ', ' + RARITY_WORD[e.rarity] + (on ? ', segnato' : '') + (line ? ', in riga' : '') + (hot ? ', manca solo questa per chiudere una linea' : '');
            return interactive
                ? '<button type="button" class="' + cls + '" data-i="' + i + '" data-r="' + e.rarity + '" aria-pressed="' + on + '" aria-label="' + label + '" data-silent>' + pipsHTML(e.rarity) + '<span aria-hidden="true">' + QZ.esc(t) + '</span></button>'
                : '<div class="' + cls + '" data-r="' + e.rarity + '" role="img" aria-label="' + label + '">' + pipsHTML(e.rarity) + '<span aria-hidden="true">' + QZ.esc(t) + '</span></div>';
        }).join('');
    }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Distribuisci le cartelle' + QZ.icon('arrow');
    $('#resume-btn').innerHTML = QZ.icon('play') + 'Riprendi';
    $('#medal').innerHTML = QZ.icon('ticket');
    $('#rules').innerHTML = rulesHTML([
        ['Una cartella a testa,', '16 caselle: cose che succedono quasi sempre, altre così così e due rare. In ogni riga, colonna e diagonale c\'è una cosa da finale di partita: la riga non si chiude nel primo tempo. Stesso schema per tutti.'],
        ['Succede in TV?', 'Si segna. Vale per tutte e due le squadre, dal fischio d\'inizio ai saluti finali.'],
        ['Riga, doppia, bingo:', 'il primo che chiude una riga, una colonna o una diagonale fa riga; con due fa doppia; con la cartella piena fa bingo. Se lo stesso evento fa vincere due persone, vince chi ha più caselle segnate.'],
        ['Al fischio finale', 'si fa la classifica. Se nessuno ha fatto bingo, conta il premio più alto e poi le caselle segnate.']
    ]);

    var playersList = QZ.playerList($('#players-host'), { key: 'bingo', min: 2, max: 10, initial: 3, label: 'Giocatore', title: 'Giocatori (2-10)' });

    var MODE_HINT = {
        table: 'Un telefono solo per tutti. Chi lo tiene segna gli eventi dall\'elenco e il gioco controlla tutte le cartelle.',
        mine: 'Ognuno sul suo telefono. La cartella ha un codice di 5 caratteri: dettalo agli amici e potranno controllarla.'
    };
    function paintMode() {
        $('#mode-hint').textContent = MODE_HINT[opts.mode];
        $('#players-host').hidden = opts.mode !== 'table';
        $('#code-field').hidden = opts.mode !== 'mine';
        $('#start-btn').innerHTML = (opts.mode === 'table' ? 'Distribuisci le cartelle' : 'Dammi la cartella') + QZ.icon('arrow');
    }
    QZ.segmented($('#opt-mode'), [{ label: 'Cartelle per tutti', value: 'table' }, { label: 'La mia cartella', value: 'mine' }], opts.mode, function (v) {
        opts.mode = v; QZ.store.set(OPT_KEY, opts); paintMode();
    });
    paintMode();
    $('#code-in').addEventListener('input', function () {
        var v = Core.normCode(this.value).slice(0, 5);
        if (v !== this.value) this.value = v;
    });

    $('#t-undo').innerHTML = QZ.icon('back') + 'Annulla';
    $('#t-undo').setAttribute('aria-label', 'Annulla l\'ultimo evento segnato');
    $('#t-end').innerHTML = QZ.icon('whistle') + 'Fischio finale';
    $('#t-new').innerHTML = QZ.icon('refresh') + 'Nuova partita';
    $('#m-undo').innerHTML = QZ.icon('back') + 'Annulla l\'ultimo';
    $('#m-check').innerHTML = QZ.icon('search') + 'Controlla un amico';
    $('#m-end').innerHTML = QZ.icon('whistle') + 'Fischio finale';
    $('#m-new').innerHTML = QZ.icon('refresh') + 'Nuova partita';

    /* ---------- Stato e salvataggio ---------- */
    var S = null;          // partita in corso (salvata)
    var cards = [];        // modalita' tavolo: testi delle cartelle
    var mineCard = [];     // modalita' mia: testi della cartella
    var prevPrizes = null; // ultimo calcolo dei premi, per annunciare solo i nuovi
    var prevMine = { lines: 0, full: false };

    function save() { if (S) { S.at = Date.now(); QZ.store.set(KEY, S); } }
    function load() {
        var s = QZ.store.get(KEY, null);
        if (!s || typeof s !== 'object') return null;
        try {
            if (s.mode === 'table' && Array.isArray(s.players) && s.players.length >= 2 && Array.isArray(s.marked)) {
                if (!s.players.every(function (p) { return p && Core.validCode(p.code); })) return null;
                s.players.forEach(function (p, i) {
                    p.name = String(p.name || '').trim() || 'Giocatore ' + (i + 1);
                    if (typeof p.color !== 'string') p.color = QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length];
                });
                s.marked = s.marked.filter(function (t, k) { return BY_TEXT[t] && s.marked.indexOf(t) === k; });
                s.pool = poolOf(s);
                return s;
            }
            if (s.mode === 'mine' && Core.validCode(s.code) && Array.isArray(s.marked)) {
                s.marked = s.marked.filter(function (i, k) { return Number.isInteger(i) && i >= 0 && i < 16 && s.marked.indexOf(i) === k; });
                s.pool = poolOf(s);
                return s;
            }
        } catch { /* salvataggio rovinato */ }
        return null;
    }
    function clear() { S = null; QZ.store.set(KEY, null); }

    /* ---------- Statistiche di questo telefono ---------- */
    var STATS_KEY = 'qz.bingo.stats';
    function getStats() {
        var st = QZ.store.get(STATS_KEY, null);
        st = st && typeof st === 'object' ? st : {};
        return { games: Number(st.games) || 0, bingo: Number(st.bingo) || 0, best: Number(st.best) || 0 };
    }
    function bumpStats(o) {
        var st = getStats();
        st.games++;
        if (o.bingo) st.bingo++;
        if (o.best > st.best) st.best = o.best;
        QZ.store.set(STATS_KEY, st);
        paintStats();
        return st;
    }
    function paintStats() {
        var st = getStats(), el = $('#bg-stats');
        el.hidden = !st.games;
        if (st.games) el.textContent = 'Su questo telefono: ' + plural(st.games, 'partita', 'partite') + ', ' + plural(st.bingo, 'bingo uscito', 'bingo usciti') + (st.best ? ', miglior cartella personale ' + st.best + '/16' : '') + '.';
    }
    paintStats();

    function paintResume() {
        var s = load();
        $('#resume').hidden = !s;
        if (!s) return;
        var when = s.at ? new Date(s.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
        $('#resume-txt').textContent = (s.mode === 'table'
            ? 'Cartelle per tutti, ' + plural(s.players.length, 'giocatore', 'giocatori') + ', ' + plural(s.marked.length, 'evento segnato', 'eventi segnati')
            : 'La mia cartella ' + s.code + ', ' + plural(s.marked.length, 'casella segnata', 'caselle segnate')) + (when ? ' · ultimo segno alle ' + when : '') + '.';
    }
    paintResume();

    $('#resume-btn').addEventListener('click', function () {
        var s = load();
        if (!s) { paintResume(); return; }
        S = s;
        enter(false);
    });

    var starting = false; // il doppio tocco su "Distribuisci" non deve aprire la conferma sopra la partita appena nata
    $('#start-btn').addEventListener('click', function () {
        if (starting) return;
        var go = function () {
            if (opts.mode === 'table') {
                var names = playersList.get();
                var used = {};
                S = {
                    mode: 'table', marked: [], pool: EVENTS.length,
                    players: names.map(function (n, i) {
                        var c;
                        do { c = Core.randomCode(); } while (used[c]);
                        used[c] = true;
                        return { name: n, code: c, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length] };
                    })
                };
            } else {
                var typed = Core.normCode($('#code-in').value);
                if (typed && !Core.validCode(typed)) {
                    QZ.toast('Codice non valido: 5 caratteri che iniziano con 2 (o 4 per le cartelle vecchie), senza 0, O, 1 e I', { icon: 'x', type: 'bad', ms: 4200 });
                    QZ.fx.shake($('#code-in'));
                    $('#code-in').focus();
                    return;
                }
                S = { mode: 'mine', code: typed || Core.randomCode(), marked: [], pool: EVENTS.length };
                $('#code-in').value = '';
            }
            starting = true;
            setTimeout(function () { starting = false; }, 700);
            save();
            QZ.sound.whistle();
            enter(true);
        };
        if (load()) {
            QZ.confirm('C\'è già una partita in corso. Se ne cominci una nuova, quella si perde.', { title: 'Partita nuova?', okLabel: 'Comincia da capo', danger: true }).then(function (ok) { if (ok) go(); });
        } else go();
    });

    function enter(fresh) {
        QZ.wake.on();
        if (S.mode === 'table') {
            cards = S.players.map(function (p) { return cardTexts(p.code, S.pool); });
            prevPrizes = tablePrizes();
            $('#t-filter').value = '';
            renderTable();
            QZ.show('s-table');
            if (fresh) QZ.toast('Cartelle pronte: ' + plural(S.players.length, 'giocatore', 'giocatori'), { icon: 'ticket', type: 'ok' });
        } else {
            mineCard = cardTexts(S.code, S.pool);
            var ev0 = mineEval();
            prevMine = { lines: ev0.lines, full: ev0.full };
            renderMine();
            QZ.show('s-mine');
            if (fresh) QZ.toast('La tua cartella: codice ' + S.code, { icon: 'ticket', type: 'ok', ms: 3200 });
        }
    }

    function newGame() {
        QZ.confirm('Le cartelle e i segni di questa partita spariscono.', { title: 'Nuova partita?', okLabel: 'Sì, da capo', danger: true }).then(function (ok) {
            if (!ok) return;
            clear();
            QZ.wake.off();
            closeFull();
            paintResume();
            QZ.show('s-start');
        });
    }
    $('#t-new').addEventListener('click', newGame);
    $('#m-new').addEventListener('click', newGame);

    /* ======================================================================
       Cartelle per tutti
       ==================================================================== */
    function isMarked(t) { return S.marked.indexOf(t) >= 0; }
    function evals() { return cards.map(function (c) { return Core.evaluate(c, isMarked); }); }
    function names(idx) { return idx.map(function (i) { return S.players[i].name; }).join(' e '); }

    var hotEv = {}; // testo evento -> premio (1 riga, 2 doppia, 3 bingo) che farebbe vincere a qualcuno
    var PRIZE_IDS = Core.PRIZES.map(function (x) { return x.id; });
    var NEXT_WORD = { riga: 'alla riga', doppia: 'alla doppia', bingo: 'al bingo' };
    function renderTable(pz) {
        var evs = evals();
        $('#t-count').textContent = S.marked.length;
        pz = pz || tablePrizes();
        hotEv = {};
        Core.PRIZES.forEach(function (p) {
            var cell = $('#t-p-' + p.id);
            var w = pz[p.id];
            cell.classList.toggle('is-on', !!w);
            cell.querySelector('b').textContent = w ? names(w.winners) : '—';
        });
        // giocatori
        $('#t-players').innerHTML = S.players.map(function (p, i) {
            var ev = evs[i];
            var won = Core.PRIZES.filter(function (x) { return pz[x.id] && pz[x.id].winners.indexOf(i) >= 0; }).map(function (x) { return x.name; });
            var mini = ev.on.map(function (on, k) { return '<i class="' + (ev.inLine[k] ? 'line' : on ? 'on' : '') + '"></i>'; }).join('');
            // "manca 1" solo per un premio ancora da assegnare
            var next = Core.oneAway(ev);
            if (next && pz[next]) next = null;
            var hotTxt = next ? 'manca 1 ' + NEXT_WORD[next] : '';
            if (next) {
                var rank = PRIZE_IDS.indexOf(next) + 1;
                cards[i].forEach(function (t, k) {
                    if (ev.on[k] || (next !== 'bingo' && !ev.hot[k])) return;
                    if (!hotEv[t] || hotEv[t] < rank) hotEv[t] = rank;
                });
            }
            return '<button type="button" class="bg-player' + (next ? ' is-hot' : '') + '" data-p="' + i + '" style="--c:' + p.color + '" aria-label="' + QZ.esc(p.name) + ': ' + ev.count + ' su 16, ' + plural(ev.lines, 'riga', 'righe') + (won.length ? ', ha vinto ' + won.join(', ') : '') + (hotTxt ? ', ' + hotTxt : '') + '. Apri la cartella">' +
                '<span class="bg-mini" aria-hidden="true">' + mini + '</span>' +
                '<span class="bg-player__name"><b>' + QZ.esc(p.name) + '</b><small>Codice ' + p.code + ' · ' + plural(ev.lines, 'riga', 'righe') +
                (won.length ? '<span class="bg-tag">' + QZ.esc(won.join(' · ')) + '</span>' : '') +
                (hotTxt ? '<span class="bg-hot">' + hotTxt + '</span>' : '') + '</small></span>' +
                '<span class="bg-player__count" aria-hidden="true">' + ev.count + '/16</span></button>';
        }).join('');
        renderEvents();
        $('#t-undo').disabled = !S.marked.length;
    }

    function renderEvents() {
        var q = QZ.norm($('#t-filter').value);
        // eventi presenti in almeno una cartella, con chi li ha
        var who = {};
        cards.forEach(function (c, i) { c.forEach(function (t) { (who[t] = who[t] || []).push(i); }); });
        var html = CATS.map(function (cat) {
            var list = EVENTS.filter(function (e) { return e.cat === cat && who[e.text] && (!q || QZ.norm(e.text).indexOf(q) >= 0); });
            if (!list.length) return '';
            var v = gameVer();
            list.sort(function (a, b) { return rarity(a.text, v) - rarity(b.text, v); });
            return '<div class="bg-group"><h3>' + QZ.esc(cat) + '</h3><div class="bg-evs">' + list.map(function (e) {
                var on = isMarked(e.text);
                var w = who[e.text];
                return '<button type="button" class="bg-ev" data-t="' + QZ.esc(e.text) + '" aria-pressed="' + on + '" data-silent>' +
                    '<span class="bg-ev__box" aria-hidden="true">' + QZ.icon('check') + '</span>' +
                    '<span class="bg-ev__txt">' + QZ.esc(e.text) + '<span class="sr-only">, nelle cartelle di ' + QZ.esc(names(w)) + (!on && hotEv[e.text] ? ', vale ' + Core.PRIZES[hotEv[e.text] - 1].name.toLowerCase() : '') + '</span></span>' +
                    (!on && hotEv[e.text] ? '<span class="bg-ev__hot" aria-hidden="true">' + Core.PRIZES[hotEv[e.text] - 1].name + '</span>' : '') +
                    '<span class="bg-ev__who" aria-hidden="true">' + w.map(function (i) { return '<i style="--c:' + S.players[i].color + '" title="' + QZ.esc(S.players[i].name) + '"></i>'; }).join('') + '</span></button>';
            }).join('') + '</div></div>';
        }).join('');
        $('#t-events').innerHTML = html || '<p class="bg-empty">Nessun evento delle cartelle corrisponde alla ricerca.</p>';
    }

    function toggleEvent(text, fromEl) {
        if (!S || S.mode !== 'table' || !BY_TEXT[text]) return;
        var at = S.marked.indexOf(text);
        if (at >= 0) {
            S.marked.splice(at, 1);
            QZ.sound.click();
            QZ.say('Tolto: ' + text);
        } else {
            S.marked.push(text);
            QZ.sound.pop();
            QZ.vibrate(20);
            var n = cards.filter(function (c) { return c.indexOf(text) >= 0; }).length;
            QZ.say('Segnato: ' + text + ', su ' + plural(n, 'cartella', 'cartelle'));
        }
        save();
        afterTableChange();
        // dopo il ridisegno il fuoco torna sullo stesso evento
        if (fromEl && fromEl.dataset) {
            var sel = fromEl.classList.contains('bg-ev') ? '.bg-ev' : null;
            if (sel) {
                var again = QZ.$$(sel, $('#t-events')).filter(function (b) { return b.dataset.t === text; })[0];
                if (again) { again.focus({ preventScroll: true }); QZ.fx.pop(again.querySelector('.bg-ev__box')); }
            }
        }
    }

    function afterTableChange() {
        var pz = tablePrizes();
        renderTable(pz);
        if (fullIdx != null) renderFull();
        var gained = Core.PRIZES.filter(function (p) { return pz[p.id] && !prevPrizes[p.id]; });
        prevPrizes = pz;
        if (!gained.length) return;
        // con un evento solo possono arrivare piu' premi insieme: si festeggia il piu' alto
        // e nel messaggio si dicono tutti
        var top = gained[gained.length - 1];
        var whoOf = function (p) { return pz[p.id].winners.map(function (i) { return S.players[i].name; }).join(' e '); };
        var extra = gained.slice(0, -1).map(function (p) { return p.name.toLowerCase() + ' per ' + whoOf(p); });
        announce(top, pz[top.id].winners.map(function (i) { return S.players[i].name; }), extra);
    }

    function announce(prize, who, extra) {
        var whoTxt = who.join(' e ');
        var host = fullIdx != null ? $('.bg-full__top') : (S.mode === 'table' ? $('#table-hud') : $('#mine-hud'));
        var stamp = prize.id === 'bingo' ? 'BINGO!' : prize.id === 'doppia' ? 'DOPPIA!' : 'RIGA!';
        var say = S.mode === 'table' ? prize.name + ' per ' + whoTxt + (extra && extra.length ? ', e ' + extra.join(', ') : '') : prize.name + '!';
        QZ.fx.stamp(host, stamp, 'ok', { say: say, ms: 2200, size: 34, rot: -4 });
        if (prize.id === 'bingo') {
            QZ.sound.win();
            QZ.fx.confetti();
            QZ.vibrate([60, 40, 120]);
        } else {
            QZ.sound.correct();
            QZ.fx.confetti({ count: prize.id === 'doppia' ? 110 : 70, colors: ['#e3e85a', '#ffffff', '#3ddc84'] });
            QZ.vibrate([40, 30, 40]);
        }
        var msg = S.mode === 'table'
            ? (prize.id === 'bingo' ? 'Bingo! ' + whoTxt + (who.length > 1 ? ' hanno' : ' ha') + ' la cartella piena' : prize.name + ' per ' + whoTxt) + (extra && extra.length ? ' (e ' + extra.join(', ') + ')' : '')
            : (prize.id === 'bingo' ? 'Bingo! Cartella piena' : prize.id === 'doppia' ? 'Doppia! Seconda riga chiusa' : 'Riga! Fallo sapere agli altri');
        QZ.toast(msg, { icon: 'trophy', type: 'ok', ms: 3600 });
    }

    $('#t-events').addEventListener('click', function (e) {
        var b = e.target.closest('.bg-ev');
        if (b) toggleEvent(b.dataset.t, b);
    });
    $('#t-players').addEventListener('click', function (e) {
        var b = e.target.closest('.bg-player');
        if (b) openFull(Number(b.dataset.p), b);
    });
    $('#t-filter').addEventListener('input', renderEvents);
    $('#t-undo').addEventListener('click', undo);
    $('#t-end').addEventListener('click', function () { askFinish(); });

    function undo() {
        if (!S || !S.marked.length) return;
        var last = S.marked.pop();
        save();
        QZ.sound.click();
        if (S.mode === 'table') {
            QZ.toast('Tolto: ' + last, { icon: 'back' });
            QZ.say('Tolto: ' + last);
            afterTableChange();
        } else {
            QZ.toast('Tolto: ' + mineCard[last], { icon: 'back' });
            QZ.say('Tolto: ' + mineCard[last]);
            afterMineChange();
        }
    }

    /* ---------- La cartella a schermo intero ---------- */
    var full = QZ.el(
        '<div class="bg-full" role="dialog" aria-modal="true" aria-labelledby="bg-full-name" hidden>' +
        '<div class="bg-full__in">' +
        '<div class="bg-full__top"><h2 id="bg-full-name"></h2><span class="bg-code" id="bg-full-code"></span>' +
        '<button class="qz-iconbtn" type="button" id="bg-full-close" aria-label="Chiudi la cartella">' + QZ.icon('x') + '</button></div>' +
        '<div class="bg-card" id="bg-full-card" role="group"></div>' +
        '<p class="bg-full__status" id="bg-full-status"></p>' +
        '<div class="bg-full__nav" id="bg-full-nav">' +
        '<button class="btn btn--lg" type="button" id="bg-full-prev">' + QZ.icon('left') + 'Prima</button>' +
        '<button class="btn btn--lg" type="button" id="bg-full-next">Dopo' + QZ.icon('right') + '</button></div>' +
        '</div></div>');
    document.body.appendChild(full);
    var fullIdx = null;      // indice giocatore (tavolo) o 'friend'
    var friend = null;       // { code, texts } per "controlla un amico"
    var fullReturn = null;

    function openFull(idx, from) {
        fullIdx = idx;
        fullReturn = from || document.activeElement;
        full.hidden = false;
        document.body.classList.add('bg-locked');
        renderFull();
        setTimeout(function () { $('#bg-full-close').focus({ preventScroll: true }); }, 30);
        QZ.sound.whoosh();
    }
    function closeFull() {
        if (fullIdx == null) return;
        fullIdx = null;
        friend = null;
        full.hidden = true;
        document.body.classList.remove('bg-locked');
        if (fullReturn && fullReturn.isConnected && fullReturn.offsetParent !== null) fullReturn.focus({ preventScroll: true });
        fullReturn = null;
    }
    function renderFull() {
        var top = $('.bg-full__top', full);
        var cardEl = $('#bg-full-card');
        if (fullIdx === 'friend') {
            var evF = Core.evaluate(friend.texts, function () { return false; });
            top.style.setProperty('--c', 'var(--accent)');
            $('#bg-full-name').textContent = 'Cartella di un amico';
            $('#bg-full-code').textContent = friend.code;
            cardEl.setAttribute('aria-label', 'Cartella con codice ' + friend.code);
            cardEl.innerHTML = cardHTML(friend.texts, evF, false, Core.codeVersion(friend.code));
            $('#bg-full-status').textContent = 'Stesso codice, stessa cartella: confrontala con la sua.';
            $('#bg-full-nav').hidden = true;
            return;
        }
        var p = S.players[fullIdx];
        var ev = Core.evaluate(cards[fullIdx], isMarked);
        top.style.setProperty('--c', p.color);
        $('#bg-full-name').textContent = p.name;
        $('#bg-full-code').textContent = p.code;
        cardEl.setAttribute('aria-label', 'Cartella di ' + p.name);
        cardEl.innerHTML = cardHTML(cards[fullIdx], ev, true, Core.codeVersion(p.code));
        $('#bg-full-status').textContent = ev.count + ' su 16 · ' + plural(ev.lines, 'riga', 'righe') + ' · tocca una casella per segnarla su tutte le cartelle';
        $('#bg-full-nav').hidden = S.players.length < 2;
    }
    $('#bg-full-close').addEventListener('click', closeFull);
    $('#bg-full-prev').addEventListener('click', function () { if (typeof fullIdx === 'number') { fullIdx = (fullIdx - 1 + S.players.length) % S.players.length; renderFull(); QZ.sound.click(); } });
    $('#bg-full-next').addEventListener('click', function () { if (typeof fullIdx === 'number') { fullIdx = (fullIdx + 1) % S.players.length; renderFull(); QZ.sound.click(); } });
    $('#bg-full-card').addEventListener('click', function (e) {
        var b = e.target.closest('button.bg-cell');
        if (!b || typeof fullIdx !== 'number') return;
        var i = Number(b.dataset.i);
        toggleEvent(cards[fullIdx][i]);
        var again = $('#bg-full-card button[data-i="' + i + '"]');
        if (again) { again.focus({ preventScroll: true }); QZ.fx.pop(again); }
    });
    document.addEventListener('keydown', function (e) {
        if (full.hidden || document.querySelector('.qz-modal')) return;
        if (e.key === 'Escape') { e.preventDefault(); closeFull(); }
        else if (e.key === 'Tab') {
            var f = QZ.$$('button', full).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
            if (!f.length) return;
            if (!full.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
            else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        } else if (typeof fullIdx === 'number' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !(e.target.closest && e.target.closest('.bg-card'))) {
            e.preventDefault();
            $(e.key === 'ArrowRight' ? '#bg-full-next' : '#bg-full-prev').click();
        }
    });

    /* ======================================================================
       La mia cartella
       ==================================================================== */
    function mineEval() { return Core.evaluate(mineCard, function (t) { return S.marked.indexOf(mineCard.indexOf(t)) >= 0; }); }

    function renderMine() {
        var ev = mineEval();
        $('#m-code').textContent = S.code;
        $('#m-count').textContent = ev.count + '/16';
        $('#m-lines').textContent = ev.full ? 'BINGO' : ev.lines;
        var next = Core.oneAway(ev);
        // il bordo tratteggiato solo se quella casella fa vincere qualcosa (dopo la doppia conta solo il bingo)
        if (!next) ev.hot = {};
        $('#m-card').innerHTML = cardHTML(mineCard, ev, true, gameVer());
        $('#m-hint').textContent = next
            ? (next === 'bingo' ? 'Manca una casella al bingo. Occhio alla TV.' : 'Ancora una casella e fai ' + next + ': va bene una di quelle col bordo tratteggiato.')
            : ev.full ? 'Cartella piena. Adesso fischia la fine e goditi la gloria.'
                : 'Tocca una casella quando succede, ritocca per toglierla. Detta il codice ' + S.code + ' agli amici: con quel codice esce questa cartella.';
        $('#m-undo').disabled = !S.marked.length;
    }

    function afterMineChange() {
        renderMine();
        var ev = mineEval();
        var was = prevMine;
        prevMine = { lines: ev.lines, full: ev.full };
        if (ev.full && !was.full) announce(Core.PRIZES[2], []);
        else if (ev.lines >= 2 && was.lines < 2) announce(Core.PRIZES[1], []);
        else if (ev.lines >= 1 && was.lines < 1) announce(Core.PRIZES[0], []);
    }

    $('#m-card').addEventListener('click', function (e) {
        var b = e.target.closest('button.bg-cell');
        if (!b || !S || S.mode !== 'mine') return;
        var i = Number(b.dataset.i);
        var at = S.marked.indexOf(i);
        if (at >= 0) { S.marked.splice(at, 1); QZ.sound.click(); QZ.say('Tolto: ' + mineCard[i]); }
        else { S.marked.push(i); QZ.sound.pop(); QZ.vibrate(20); QZ.say('Segnato: ' + mineCard[i]); }
        save();
        afterMineChange();
        var again = $('#m-card button[data-i="' + i + '"]');
        if (again) { again.focus({ preventScroll: true }); QZ.fx.pop(again); }
    });
    $('#m-undo').addEventListener('click', undo);
    $('#m-end').addEventListener('click', function () { askFinish(); });

    $('#m-check').addEventListener('click', function () {
        var node = QZ.el('<form class="stack" style="--gap:12px" novalidate>' +
            '<label class="label" for="bg-friend">Il codice del tuo amico</label>' +
            '<input class="input bg-code-input" id="bg-friend" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="····">' +
            '<p class="small muted" id="bg-friend-msg">Il codice che vede in alto sulla sua cartella (5 caratteri, o 4 per le cartelle vecchie).</p></form>');
        var inp = node.querySelector('input');
        inp.addEventListener('input', function () { var v = Core.normCode(inp.value).slice(0, 5); if (v !== inp.value) inp.value = v; });
        function tryOpen() {
            var code = Core.normCode(inp.value);
            if (!Core.validCode(code)) {
                node.querySelector('#bg-friend-msg').textContent = 'Codice non valido: 5 caratteri che iniziano con 2 (o 4 per le cartelle vecchie), senza 0, O, 1 e I.';
                QZ.fx.shake(inp);
                inp.focus();
                return false;
            }
            friend = { code: code, texts: cardTexts(code, S ? S.pool : EVENTS.length) };
            setTimeout(function () { openFull('friend', $('#m-check')); }, 220);
            return true;
        }
        node.addEventListener('submit', function (e) { e.preventDefault(); var ok = tryOpen(); if (ok) { var x = document.querySelector('.qz-modal .qz-modal__close'); if (x) x.click(); } });
        QZ.modal({
            title: 'Controlla una cartella',
            node: node,
            actions: [{ label: 'Annulla', ghost: true }, { label: 'Mostra la cartella', primary: true, onClick: tryOpen }],
            onOpen: function () { setTimeout(function () { inp.focus(); }, 80); }
        });
    });

    // frecce dentro una cartella: ci si muove di casella in casella come su una griglia
    document.addEventListener('keydown', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button.bg-cell') : null;
        if (!b || e.altKey || e.ctrlKey || e.metaKey) return;
        var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -Core.SIZE, ArrowDown: Core.SIZE }[e.key];
        if (!step) return;
        var i = Number(b.dataset.i), j = i + step;
        if (j < 0 || j >= Core.SIZE * Core.SIZE || (Math.abs(step) === 1 && Math.floor(j / Core.SIZE) !== Math.floor(i / Core.SIZE))) return;
        var to = b.parentNode.querySelector('button[data-i="' + j + '"]');
        if (to) { e.preventDefault(); to.focus(); }
    });

    document.addEventListener('keydown', function (e) {
        if (!S || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || document.querySelector('.qz-modal')) return;
        if (e.target.closest && e.target.closest('input, textarea')) return;
        if (!$('#s-table').classList.contains('is-active') && !$('#s-mine').classList.contains('is-active')) return;
        e.preventDefault();
        undo();
    });

    /* ======================================================================
       Fischio finale
       ==================================================================== */
    function askFinish() {
        QZ.confirm('La partita si chiude e si fa la classifica. Le cartelle non si potranno più segnare.', { title: 'Fischio finale?', okLabel: 'Fischia' }).then(function (ok) { if (ok) finish(); });
    }

    function finish() {
        if (!S) return;
        closeFull();
        QZ.wake.off();
        QZ.sound.whistle();
        var g = S;
        clear();
        paintResume();
        QZ.show('s-end');
        if (g.mode === 'table') finishTable(g); else finishMine(g);
    }

    function finishTable(g) {
        var marked = function (t) { return g.marked.indexOf(t) >= 0; };
        var evs = cards.map(function (c) { return Core.evaluate(c, marked); });
        var pz = tablePrizes(g);
        var rows = g.players.map(function (p, i) {
            var won = Core.PRIZES.filter(function (x) { return pz[x.id] && pz[x.id].winners.indexOf(i) >= 0; });
            var best = won.reduce(function (m, x) { return Math.max(m, Core.PRIZES.indexOf(x) + 1); }, 0);
            return { p: p, ev: evs[i], won: won, best: best };
        });
        rows.sort(function (a, b) { return b.best - a.best || b.ev.lines - a.ev.lines || b.ev.count - a.ev.count; });
        var top = rows[0];
        var tie = rows.filter(function (r) { return r.best === top.best && r.ev.lines === top.ev.lines && r.ev.count === top.ev.count; });
        var winName = tie.map(function (r) { return r.p.name; }).join(' e ');
        var title = tie.length > 1 ? 'Pari: ' + winName : (top.best ? 'Vince ' + top.p.name : 'Vince ' + top.p.name + ' ai punti');
        var sub = !g.marked.length ? 'Nessun evento segnato: avete guardato la partita o il telefono?'
            : pz.bingo ? 'Cartella piena: roba che si racconta per anni.'
            : pz.doppia ? 'Niente bingo, ma la doppia è arrivata. Partita vera.'
                : pz.riga ? 'Una riga e poco altro: la partita non ha regalato niente.'
                    : 'Nessuna riga: una partita bloccata, decidono le caselle segnate.';
        var r = QZ.profile.record('bingo', {
            xp: g.marked.length ? Math.min(120, 20 + g.marked.length * 2 + (pz.riga ? 10 : 0) + (pz.bingo ? 30 : 0)) : 5,
            label: (tie.length > 1 ? 'Pari tra ' + winName : 'Vince ' + top.p.name) + ' · ' + plural(g.marked.length, 'evento', 'eventi')
        });
        bumpStats({ bingo: !!pz.bingo });
        QZ.results($('#end-host'), {
            win: true,
            icon: 'ticket',
            title: title,
            subtitle: sub,
            big: g.marked.length, bigSuffix: g.marked.length === 1 ? ' evento' : ' eventi',
            record: r,
            stats: Core.PRIZES.map(function (x) { return { label: x.name, value: pz[x.id] ? g.players.filter(function (p, i) { return pz[x.id].winners.indexOf(i) >= 0; }).map(function (p) { return p.name; }).join(', ') : '—' }; })
                .concat([{ label: 'Eventi rari usciti', value: g.marked.filter(function (t) { return rarity(t, gameVer(g)) === 3; }).length }]),
            extraHTML: '<div class="mt-3">' + QZ.podiumHTML(rows.map(function (x) {
                return { name: x.p.name, score: x.ev.count, color: x.p.color, sub: (x.won.length ? x.won.map(function (w) { return w.name; }).join(' · ') + ' · ' : '') + plural(x.ev.lines, 'riga', 'righe') + ' · codice ' + x.p.code };
            }), function (s) { return s + '/16'; }) + '</div>',
            share: (pz.bingo ? 'Bingo' : pz.riga ? 'Riga' : 'Partita a secco') + ' al Bingo della Partita su Quizzotti: ' + title.toLowerCase() + ' con ' + plural(top.ev.count, 'casella', 'caselle') + ' su 16.',
            retryLabel: 'Altra partita',
            onRetry: function () { QZ.show('s-start'); }
        });
    }

    function finishMine(g) {
        var ev = Core.evaluate(mineCard, function (t) { return g.marked.indexOf(mineCard.indexOf(t)) >= 0; });
        var prize = ev.full ? 'Bingo' : ev.lines >= 2 ? 'Doppia' : ev.lines === 1 ? 'Riga' : null;
        var r = QZ.profile.record('bingo', {
            xp: ev.count ? Math.min(120, 15 + ev.count * 3 + Math.min(ev.lines, 3) * 10 + (ev.full ? 30 : 0)) : 5,
            label: (prize || 'Niente riga') + ' · ' + ev.count + '/16'
        });
        var st = bumpStats({ bingo: ev.full, best: ev.count });
        // la cartella in quadratini, da incollare nel gruppo: giallo segnato, verde in riga
        var grid = [0, 1, 2, 3].map(function (row) {
            return [0, 1, 2, 3].map(function (c) { var k = row * 4 + c; return ev.inLine[k] ? '🟩' : ev.on[k] ? '🟨' : '⬛'; }).join('');
        }).join('\n');
        QZ.results($('#end-host'), {
            win: !!prize,
            icon: prize ? 'ticket' : 'flag',
            title: prize ? (prize === 'Bingo' ? 'Bingo!' : prize + ' fatta') : 'Niente riga',
            subtitle: prize === 'Bingo' ? 'Cartella ' + g.code + ' piena: adesso mostrala agli altri, prima che dicano che hai barato.'
                : prize ? 'Cartella ' + g.code + ': adesso vediamo come è andata agli altri.'
                    : ev.count ? 'Cartella ' + g.code + ': la partita non ti ha dato una mano. Capita.'
                        : 'Cartella ' + g.code + ' immacolata: o era una partita di una noia mortale, o guardavi altro.',
            big: ev.count, bigSuffix: '/16',
            record: r,
            stats: [
                { label: 'Righe chiuse', value: ev.lines },
                { label: 'Rari presi', value: mineCard.filter(function (t, i) { return ev.on[i] && rarity(t, gameVer(g)) === 3; }).length + '/' + raresOf(gameVer(g)) },
                { label: 'Codice', value: g.code },
                { label: 'Miglior cartella', value: st.best + '/16' }
            ],
            share: 'Bingo della Partita su Quizzotti: ' + (prize ? prize.toLowerCase() : 'niente riga') + ' con ' + plural(ev.count, 'casella', 'caselle') + ' su 16 (cartella ' + g.code + ').\n' + grid,
            retryLabel: 'Altra partita',
            onRetry: function () { QZ.show('s-start'); }
        });
    }
})();
