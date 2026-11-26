/* ==========================================================================
   QUIZZOTTI v2 — Chi l'ha detto (citazioni)
   Dati: assets/db-citazioni.js (`quotes`, {cat, quote, correct, options[4]}).
   Si scrive il nome (3 punti, basta il cognome, errori di battitura
   tollerati) oppure si aprono le opzioni (1 punto). Un nome scritto e
   sbagliato costa la frase: niente opzioni di riserva, cosi' tirare a caso
   («Mourinho» a ogni frase) non conviene mai. Partite a numero fisso
   di frasi, niente frasi ripetute, confronto tollerante, aiuto "iniziali",
   serie bonus, modalita' a tempo e riepilogo finale delle frasi.
   Si sceglie da dove arrivano le voci (panchina, campo, tribuna o tutte),
   il record e' tenuto per lunghezza e per tempo (QZ.profile, modalita'
   '10', '10t', ...: le partite a tempo non si confrontano con le altre), l'archivio ricorda le
   frasi riconosciute almeno una volta e a fine partita si ripassano le
   mancate.
   Riflettori: la frase va sul maxischermo dello stadio, con le virgolette
   grandi nel colore del gioco; il nome si scrive nel campo e si "tira" col
   bottone a LED; la risposta si accende sotto, "Parole di ...", come una
   didascalia luminosa. Frase, punti e serie stanno sul tabellone.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'citazioni';
    var LETTERS = ['A', 'B', 'C', 'D'];
    var PTS = { typed: 3, hinted: 2, options: 1 };
    var KEY_SET = 'qz.citazioni.settings';
    var KEY_BEST = 'qz.citazioni.best';      // vecchi record per lunghezza {10: pt, ...}: solo lettura, a tempo e no insieme
    var KEY_ARCH = 'qz.citazioni.archivio';  // impronte delle frasi riconosciute almeno una volta
    var CATS = {
        all: { label: 'Tutte', from: '', what: 'allenatori, calciatori, presidenti, cronisti e scrittori' },
        panchina: { label: 'Panchina', from: 'Voci dalla panchina.', what: 'solo allenatori' },
        campo: { label: 'Campo', from: 'Voci dal campo.', what: 'solo calciatori' },
        tribuna: { label: 'Tribuna', from: 'Voci dalla tribuna.', what: 'presidenti, telecronisti e scrittori' }
    };
    // soprannomi celebri accettati come risposta scritta
    var NICK = {
        'zlatan ibrahimovic': ['ibra'], 'cristiano ronaldo': ['cr7'], 'jose mourinho': ['mou', 'special one'],
        'pep guardiola': ['pep'], 'zinedine zidane': ['zizou'], 'giovanni trapattoni': ['trap'],
        'diego maradona': ['pibe de oro', 'el pibe de oro'], 'gianluigi buffon': ['gigi'], 'francesco totti': ['pupone', 'er pupone'],
        'alessandro del piero': ['pinturicchio'], 'roberto baggio': ['divin codino', 'codino'], 'gennaro gattuso': ['ringhio'],
        'massimiliano allegri': ['max'], 'lionel messi': ['leo', 'pulce'], 'alex ferguson': ['fergie', 'sir alex'],
        'diego simeone': ['cholo', 'el cholo'], 'gianni agnelli': ['avvocato', 'l avvocato'], 'nereo rocco': ['paron', 'el paron'],
        'zdenek zeman': ['boemo', 'il boemo'], 'helenio herrera': ['hh', 'mago'], 'mario balotelli': ['super mario', 'supermario'],
        'oronzo cana': ['lino banfi', 'banfi'], 'franz beckenbauer': ['kaiser'], 'carlo ancelotti': ['carletto']
    };
    var PARTICLES = { de: 1, del: 1, della: 1, di: 1, da: 1, van: 1, von: 1, der: 1, la: 1, le: 1, dos: 1, das: 1 };

    // il database non deve avere frasi doppie: se ne scappa una si tiene la prima
    var seenQ = {};
    var pool = quotes.filter(function (q) {
        var k = QZ.norm(q.quote);
        if (seenQ[k]) return false;
        seenQ[k] = 1;
        return true;
    });
    var countBy = { all: pool.length };
    pool.forEach(function (q) { countBy[q.cat] = (countBy[q.cat] || 0) + 1; });

    var deck = new QZ.Deck(GAME, pool, function (q) { return q.quote; });
    var set = Object.assign({ len: 10, time: 0, cat: 'all' }, QZ.store.get(KEY_SET, {}) || {});
    if (!CATS[set.cat]) set.cat = 'all';
    if ([10, 15, 20].indexOf(set.len) < 0) set.len = 10;
    if (set.time !== 0 && set.time !== 30) set.time = 0;
    var S = { phase: 'idle' };
    var timer = null;
    var starting = false; // blocca il doppio tap sul fischio d'inizio
    var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* ---------- Archivio e record per lunghezza ---------- */
    function fingerprint(q) {
        var s = QZ.norm(q.quote), h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }
    var archive = new Set((function () { var a = QZ.store.get(KEY_ARCH, []); return Array.isArray(a) ? a : []; })());
    var validPrints = new Set(pool.map(fingerprint));
    function archived() { var n = 0; archive.forEach(function (k) { if (validPrints.has(k)) n++; }); return n; }
    function bests() { var b = QZ.store.get(KEY_BEST, {}); return b && typeof b === 'object' ? b : {}; }
    /** Modalita' del record: lunghezza, piu' "t" se a tempo (es. '15t'). */
    function recMode(len, time) { return String(len) + (time ? 't' : ''); }

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('quote');
    $('#rules').innerHTML = [
        ['Leggi la frase sul maxischermo', 'e scrivi chi l\'ha detta: basta il cognome, accenti e piccoli refusi non contano. Valgono anche i soprannomi giusti (Ibra, Trap, Ringhio…).'],
        ['A memoria: 3 punti.', 'Con le iniziali come aiutino, 2.'],
        ['Con le opzioni: 1 punto.', 'Le apri quando vuoi, prima di tirare: un nome sbagliato è fuorigioco e la frase è persa.'],
        ['Serie calda:', 'dalla terza giusta di fila, +1 a frase. A tempo, chi risponde a memoria nella prima metà prende +1 di velocità.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#g-send').innerHTML = 'TIRA' + QZ.icon('arrow');
    // il nome accessibile comincia con la parola che si vede ("Tira")
    $('#g-send').setAttribute('aria-label', 'Tira: invia la risposta');
    $('#g-options').innerHTML = QZ.icon('list') + 'Opzioni · 1 pt';
    $('#g-initials').innerHTML = QZ.icon('bulb') + 'Iniziali · −1 pt';
    $('#g-skip').innerHTML = QZ.icon('skip') + 'Passo';
    $('#g-kbd').innerHTML = 'Tastiera: <span class="kbd">Invio</span> tira, poi va avanti · <span class="kbd">1</span>–<span class="kbd">4</span> o <span class="kbd">A</span>–<span class="kbd">D</span> sceglie un\'opzione';

    function saveSet() { QZ.store.set(KEY_SET, set); }
    QZ.segmented($('#set-len'), [{ label: '10', value: 10 }, { label: '15', value: 15 }, { label: '20', value: 20 }], set.len, function (v) { set.len = v; saveSet(); paintStartInfo(); });
    QZ.segmented($('#set-time'), [{ label: 'Senza limite', value: 0 }, { label: '30 s a frase', value: 30 }], set.time, function (v) { set.time = v; saveSet(); paintStartInfo(); });
    QZ.segmented($('#set-cat'), Object.keys(CATS).map(function (k) { return { label: CATS[k].label, value: k }; }), set.cat, function (v) { set.cat = v; saveSet(); paintStartInfo(); });

    function paintStartInfo() {
        $('#cat-note').textContent = countBy[set.cat] + ' frasi · ' + CATS[set.cat].what;
        var b = QZ.profile.best(GAME, recMode(set.len, set.time));
        var n = archived();
        var bits = [];
        var oldLen = bests()[set.len], old = QZ.profile.best(GAME);
        if (b != null) bits.push('Record a ' + set.len + ' frasi' + (set.time ? ' a tempo' : ' senza limite') + ': ' + b + ' punti');
        // record di prima della divisione: restano in vista finche' non ce n'e' uno di questa modalita'
        else if (oldLen != null) bits.push('Vecchio record a ' + set.len + ' frasi: ' + oldLen + ' punti');
        else if (old != null) bits.push('Miglior partita: ' + old + ' punti');
        if (n) bits.push('Archivio: ' + n + (n === 1 ? ' frase riconosciuta' : ' frasi riconosciute') + ' su ' + pool.length);
        $('#start-record').textContent = bits.join(' · ');
    }
    paintStartInfo();

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));

    $('#g-answers').innerHTML = LETTERS.map(function (l, i) {
        return '<button type="button" class="answer" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key">' + l + '</span><span class="answer__text"></span></button>';
    }).join('');
    var answerEls = QZ.$$('#g-answers .answer');
    answerEls.forEach(function (el) { el.addEventListener('click', function () { pickOption(Number(el.dataset.i)); }); });

    // dopo "Fischio d'inizio", "Avanti", "Vediamo il voto" e "Gioca ancora" la pagina cambia sotto il dito: il secondo
    // tocco di un doppio tap finiva su quello che c'e' sotto (anche il link "Prima pagina" del pie' di pagina,
    // che faceva uscire a meta' partita). Per un attimo i tocchi su link e bottoni non valgono.
    var guardUntil = 0;
    function guard() { guardUntil = Date.now() + 450; }
    document.addEventListener('click', function (e) {
        if (Date.now() >= guardUntil || !e.target.closest || !e.target.closest('a, button, summary')) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    $('#start-btn').addEventListener('click', function () { start(); });
    $('#g-typeform').addEventListener('submit', function (e) { e.preventDefault(); submitTyped(); });
    $('#g-options').addEventListener('click', function () { if (S.phase === 'type') showOptions(); });
    $('#g-initials').addEventListener('click', useInitials);
    $('#g-skip').addEventListener('click', function () { if (S.phase === 'type' || S.phase === 'options') lose('skip'); });
    $('#g-next').addEventListener('click', function () {
        if (S.phase !== 'done') return;
        load();
        guard();
        // fuoco dato subito, dentro il tocco (non dopo un ritardo): solo cosi' sul telefono la tastiera si riapre
        if (S.phase === 'type') $('#g-input').focus({ preventScroll: true });
    });

    document.addEventListener('keydown', function (e) {
        if (S.phase !== 'options' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.qz-modal')) return;
        var k = e.key.toUpperCase();
        var idx = LETTERS.indexOf(k);
        if (idx < 0 && /^[1-4]$/.test(k)) idx = Number(k) - 1;
        if (idx >= 0) { e.preventDefault(); pickOption(idx); }
    });

    /* ---------- Confronto tollerante dei nomi ---------- */
    function tolerance(len) { return len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3; }

    /** Forme accettate per un nome: completo, cognome (anche composto) e
     *  nomi di battesimo lunghi che non compaiono nelle altre opzioni. */
    function forms(name, others) {
        var n = QZ.norm(name);
        var toks = n.split(' ').filter(Boolean);
        var out = [n].concat(NICK[n] || []);
        for (var i = 1; i < toks.length; i++) {
            var suf = toks.slice(i).join(' ');
            if (suf.replace(/ /g, '').length >= 4 && !(PARTICLES[toks[i]] && i === toks.length - 1)) out.push(suf);
        }
        var otherToks = {};
        (others || []).forEach(function (o) { QZ.norm(o).split(' ').forEach(function (t) { otherToks[t] = 1; }); });
        toks.forEach(function (t) { if (t.length >= 5 && !otherToks[t] && out.indexOf(t) < 0) out.push(t); });
        return out;
    }

    function bestDistance(u, list) {
        var best = { d: Infinity, len: 1 };
        var uc = u.replace(/ /g, '');
        list.forEach(function (f) {
            var d = Math.min(QZ.distance(u, f), QZ.distance(uc, f.replace(/ /g, '')));
            if (d < best.d) best = { d: d, len: f.replace(/ /g, '').length };
        });
        return best;
    }

    /** 1 = giusto, 2 = ci sei quasi, 3 = va bene ma serve anche il nome (cognome in comune
     *  con un'altra opzione, es. Gianni e Umberto Agnelli), 0 = sbagliato */
    function judge(input, q) {
        var u = QZ.norm(input);
        if (u.length < 2) return 0;
        var others = q.options.filter(function (o) { return o !== q.correct; });
        var mine = bestDistance(u, forms(q.correct, others));
        var theirs = bestDistance(u, [].concat.apply([], others.map(function (o) { return forms(o, [q.correct]); })));
        if (theirs.d < mine.d) return 0;
        var tol = tolerance(mine.len);
        if (mine.d <= tol) return theirs.d === mine.d ? 3 : 1;
        if (u.length >= 3 && mine.d <= tol + 1) return 2;
        return 0;
    }

    /** Iniziali come trattini da riempire, una parola per blocco (non va a capo a meta'). */
    function initials(name) {
        return name.split(/\s+/).map(function (t) {
            var letters = t.replace(/[^\p{L}]/gu, '');
            return '<span>' + QZ.esc(letters.charAt(0).toUpperCase() + new Array(letters.length).join(' _')) + '</span>';
        }).join(' ');
    }

    function two(n) { return String(n).padStart(2, '0'); }

    /* ---------- Il maxischermo ---------- */
    function paintScreen() {
        var qe = $('#g-quote');
        qe.innerHTML = '<q></q>';
        qe.querySelector('q').textContent = S.q.quote.replace(/^[«"“\s]+|[»"”\s]+$/g, '');
        qe.classList.toggle('is-long', S.q.quote.length > 130);
        QZ.fx.replay(qe);
        $('#g-num').textContent = S.review ? 'RIPASSO ' + two(S.n) : 'FRASE ' + two(S.n);
        var nm = $('#g-name');
        nm.className = 'ch-cap__name is-blank';
        nm.innerHTML = '<span class="sr-only">nome da indovinare</span>';
        QZ.$$('.qz-stamp', $('#g-stamp')).forEach(function (s) { s.remove(); });
        $('#g-card').classList.remove('is-judged');
    }

    /** La didascalia: il nome si accende sotto la frase, poi la scritta dell'esito. */
    function caption(stampText, kind, say) {
        var nm = $('#g-name');
        nm.className = 'ch-cap__name' + (kind === 'ok' ? ' is-ok' : kind === 'bad' ? ' is-bad' : '');
        nm.textContent = S.q.correct;
        QZ.fx.replay(nm);
        var n = S.n; // se nel frattempo e' gia' arrivata la frase dopo, la scritta non si accende sulla nuova
        setTimeout(function () {
            if (S.n !== n || S.phase !== 'done') return;
            $('#g-card').classList.add('is-judged'); // la scritta prende il posto del numero della frase
            QZ.fx.stamp($('#g-stamp'), stampText, kind, { size: window.innerWidth < 420 ? 18 : 22, say: say });
        }, QZ.reducedMotion() ? 0 : 160);
    }

    /* ---------- Flusso ---------- */
    /** list: frasi fisse (ripasso delle mancate); senza, partita normale dal mazzo. */
    function start(list) {
        if (starting) return;
        starting = true;
        guard();
        var review = Array.isArray(list) && list.length > 0;
        S = {
            len: review ? list.length : set.len, time: set.time, cat: review ? 'all' : set.cat,
            review: review, queue: review ? QZ.shuffle(list.slice()) : null, used: {},
            n: 0, score: 0, streak: 0, bestStreak: 0, typed: 0, opts: 0, fresh: 0, log: [], phase: 'idle'
        };
        $('#timer-cell').hidden = !S.time;
        $('#g-board').classList.toggle('has-timer', !!S.time);
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.time || 30, ring: ring,
            onSecond: function (s) { if (s <= 5 && s > 0) QZ.sound.tick(); },
            onExpire: function () { if (S.phase === 'type' || S.phase === 'options') lose('time'); }
        });
        $('#g-score').textContent = '0';
        paintStreak();
        QZ.show('s-game');
        QZ.sound.start();
        setTimeout(function () { starting = false; load(); }, 380);
    }

    function draw() {
        if (S.queue) return S.queue.shift();
        // niente frasi ripetute nella stessa partita, anche quando il mazzo si rimescola
        return deck.draw(function (q) { return (S.cat === 'all' || q.cat === S.cat) && !S.used[q.quote]; });
    }

    function load() {
        // solo a frase chiusa: il doppio tap su "Avanti" non deve saltarne una
        if (S.phase !== 'done' && S.phase !== 'idle') return;
        if (S.n >= S.len) { finish(); return; }
        var raw = draw();
        if (!raw) { finish(); return; }
        S.used[raw.quote] = 1;
        S.q = { quote: raw.quote, correct: raw.correct, cat: raw.cat, options: QZ.shuffle(raw.options.slice()) };
        S.n++;
        S.phase = 'type';
        S.hinted = false;
        S.nearUsed = false;
        S.askedFirst = false;

        var cnt = $('#g-count');
        cnt.innerHTML = two(S.n) + '<small>/' + S.len + '</small>';
        cnt.setAttribute('aria-label', 'Frase ' + S.n + ' di ' + S.len);
        $('#g-progress').style.transform = 'scaleX(' + ((S.n - 1) / S.len) + ')';
        paintScreen();

        var inp = $('#g-input');
        inp.value = '';
        inp.disabled = false;
        $('#g-typeform').hidden = false;
        $('#g-hint').hidden = true;
        $('#g-initials').disabled = false;
        $('#g-options').disabled = false;
        $('#g-answers').hidden = true;
        $('#g-result').hidden = true;
        answerEls.forEach(function (el, i) {
            el.className = 'answer';
            el.disabled = false;
            QZ.$$('.qz-mark', el).forEach(function (m) { m.remove(); });
            el.querySelector('.answer__text').textContent = S.q.options[i];
        });
        if (S.n > 1) $('#g-card').scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
        var lost = !document.activeElement || document.activeElement === document.body || document.activeElement.offsetParent === null;
        if (finePointer) setTimeout(function () { if (S.phase === 'type') inp.focus({ preventScroll: true }); }, 60);
        else if (lost) $('#g-quote').focus({ preventScroll: true }); // senza tastiera a schermo: il fuoco va sulla frase
        if (S.time) { timer.reset(S.time); timer.start(); }
    }

    function submitTyped() {
        if (S.phase !== 'type') return;
        var inp = $('#g-input');
        var val = inp.value.trim();
        if (!val) {
            QZ.fx.shake($('#g-note'));
            QZ.toast('Scrivi un nome, o chiedi le opzioni', { icon: 'type' });
            return;
        }
        var v = judge(val, S.q);
        if (v === 3 && !S.askedFirst) {
            S.askedFirst = true;
            QZ.fx.shake($('#g-note'));
            QZ.sound.tock();
            QZ.toast('Ce ne sono due con quel cognome: scrivi anche il nome', { icon: 'bulb' });
            return;
        }
        if (v === 3) {
            // di nuovo solo il cognome: potrebbe essere l'altro, si sceglie dalle opzioni (serie salva)
            QZ.toast('Senza il nome non si capisce chi è: scegli tra le opzioni', { icon: 'list' });
            showOptions();
            return;
        }
        if (v === 1) { win(S.hinted ? 'hinted' : 'typed', $('#g-note')); return; }
        if (v === 2 && !S.nearUsed) {
            S.nearUsed = true;
            QZ.fx.shake($('#g-note'));
            QZ.sound.tock();
            QZ.toast('Quasi. Controlla come si scrive', { icon: 'bulb' });
            return;
        }
        // nome sbagliato: la frase e' persa (le opzioni vanno chieste prima di tirare)
        S.guess = val;
        lose('typed');
    }

    function useInitials() {
        if (S.phase !== 'type' || S.hinted) return;
        S.hinted = true;
        $('#g-initials').disabled = true;
        var h = $('#g-hint');
        var sayInit = 'Iniziali: ' + S.q.correct.split(/\s+/).map(function (t) { return t.replace(/[^\p{L}]/gu, '').charAt(0); }).join(' ');
        h.innerHTML = '<span aria-hidden="true"><small>Iniziali</small>' + initials(S.q.correct) + '</span><span class="sr-only">' + QZ.esc(sayInit) + '</span>';
        QZ.say(sayInit);
        h.hidden = false;
        QZ.fx.replay(h);
        QZ.sound.lifeline();
        $('#g-input').focus({ preventScroll: true });
    }

    function showOptions() {
        var hadFocus = $('#g-typeform').contains(document.activeElement);
        S.phase = 'options';
        $('#g-typeform').hidden = true;
        $('#g-answers').hidden = false;
        answerEls.forEach(function (el) { QZ.fx.replay(el); });
        QZ.sound.whoosh();
        if (finePointer || hadFocus) answerEls[0].focus({ preventScroll: true });
    }

    function pickOption(i) {
        if (S.phase !== 'options') return;
        if (S.q.options[i] === S.q.correct) win('options', answerEls[i]);
        else lose('wrong', answerEls[i]);
    }

    function win(how, el) {
        S.phase = 'done';
        timer.pause();
        var pts = PTS[how];
        var bonus = [];
        S.streak++;
        if (S.streak > S.bestStreak) S.bestStreak = S.streak;
        if (S.streak >= 3) { pts++; bonus.push('serie'); }
        if (S.time && how !== 'options' && timer.remaining >= S.time / 2) { pts++; bonus.push('velocità'); }
        if (how === 'options') S.opts++; else S.typed++;
        var fp = fingerprint(S.q);
        if (!archive.has(fp)) { archive.add(fp); S.fresh++; QZ.store.set(KEY_ARCH, Array.from(archive)); } // salvato subito: vale anche se si esce a meta' partita
        addScore(pts);
        S.log.push({ q: S.q, ok: true, how: how, pts: pts });
        if (how === 'options') { el.classList.add('is-correct'); lockOptions(); }
        QZ.sound.correct();
        QZ.vibrate(40);
        QZ.fx.floatText(el, '+' + pts);
        paintStreak();
        caption(how === 'typed' ? QZ.pick(['Esatto!', 'Che memoria', 'Gol!']) : 'Esatto', 'ok', 'Esatto! L\'ha detto ' + S.q.correct + '. Più ' + pts + (pts === 1 ? ' punto.' : ' punti.'));
        var label = how === 'typed' ? QZ.pick(['Scritto a memoria', 'A memoria, senza aiuti', 'Dritto dall\'archivio']) : how === 'hinted' ? 'Con le iniziali' : 'Con le opzioni';
        var sub = bonus.length ? 'Bonus ' + bonus.join(' e ') : how === 'options' ? 'A memoria valeva il triplo.' : '';
        if (S.streak === 3) sub = 'Tre di fila: serie calda accesa, +1 a frase.';
        showResult(true, pts, label, sub);
    }

    var SAD = ['La prossima volta te la ricordi.', 'Se la segni sul taccuino, al bar fai un figurone.', 'Capita anche ai migliori. Anche a lui, probabilmente.'];

    function lose(how, el) {
        S.phase = 'done';
        timer.pause();
        var hadStreak = S.streak >= 3;
        S.streak = 0;
        paintStreak();
        S.log.push({ q: S.q, ok: false, how: how, pts: 0 });
        if (!$('#g-answers').hidden) {
            if (el) el.classList.add('is-wrong');
            answerEls.forEach(function (b, i) { if (S.q.options[i] === S.q.correct) b.classList.add('is-correct'); });
            lockOptions();
        }
        if (how === 'skip') QZ.sound.whoosh();
        else { QZ.sound.wrong(); QZ.vibrate([60, 40, 60]); QZ.fx.shake($('#g-card')); }
        caption({ wrong: 'Fuorigioco', typed: 'Fuorigioco', skip: 'Passata', time: 'Tempo!' }[how], how === 'skip' ? 'ink' : 'bad',
            { wrong: 'Sbagliato', typed: 'Sbagliato', skip: 'Frase passata', time: 'Tempo scaduto' }[how] + '. L\'ha detto ' + S.q.correct + '.');
        var label = how === 'typed' ? 'Non è ' + S.guess : { wrong: 'Niente da fare', skip: 'Frase passata', time: 'Tempo scaduto' }[how];
        var sub = hadStreak ? 'Serie calda spenta. Si riparte da zero.'
            : how === 'typed' ? 'Se non sei sicuro, apri le opzioni prima di tirare: 1 punto è meglio di zero.' : QZ.pick(SAD);
        showResult(false, 0, label, sub);
    }

    function lockOptions() {
        answerEls.forEach(function (b) {
            b.disabled = true;
            if (!b.classList.contains('is-correct') && !b.classList.contains('is-wrong')) b.classList.add('is-dim');
        });
    }

    function showResult(ok, pts, label, sub) {
        $('#g-typeform').hidden = true;
        $('#g-input').disabled = true;
        $('#g-progress').style.transform = 'scaleX(' + (S.n / S.len) + ')';
        var fb = $('#g-feedback');
        fb.className = 'card card--tight ch-verdict ' + (ok ? 'is-ok' : 'is-bad');
        fb.innerHTML =
            '<span class="ch-verdict__pts">' + (ok ? '+' + pts : '0') + '</span>' +
            '<div class="grow"><div class="ch-verdict__label">' + QZ.esc(label) + '</div>' +
            (sub ? '<div class="ch-verdict__sub">' + QZ.esc(sub) + '</div>' : '') + '</div>';
        QZ.fx.replay(fb, 'is-pop');
        $('#g-next').innerHTML = S.n >= S.len ? QZ.icon('trophy') + (S.review ? 'Fine del ripasso' : 'Vediamo il voto') : 'Avanti la prossima' + QZ.icon('arrow');
        $('#g-result').hidden = false;
        setTimeout(function () { if (S.phase === 'done') $('#g-next').focus({ preventScroll: true }); }, 80);
    }

    function addScore(pts) {
        var from = S.score;
        S.score += pts;
        var el = $('#g-score');
        QZ.fx.count(el, from, S.score, 600);
        QZ.fx.pop(el);
    }

    function paintStreak() {
        var s = $('#g-streak');
        s.innerHTML = QZ.icon('flame') + '<span>' + S.streak + '</span>';
        s.classList.toggle('is-hot', S.streak >= 3);
        s.title = 'Risposte giuste di fila';
        s.setAttribute('aria-label', 'Serie: ' + S.streak + (S.streak === 1 ? ' giusta' : ' giuste') + ' di fila');
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        S.phase = 'end';
        if (timer) timer.pause();
        var played = S.log.length || 1;
        var right = S.typed + S.opts;
        var pct = Math.round((right / played) * 100);
        var ratio = QZ.clamp(S.score / (played * PTS.typed), 0, 1);
        var missed = S.log.filter(function (l) { return !l.ok; }).map(function (l) { return l.q; });

        var r = null;
        if (!S.review) {
            var xp = S.score * 2 + S.bestStreak * 2 + (S.time ? 10 : 0);
            // record per lunghezza e tempo: 20 frasi non battono 10, e il bonus velocita' non pesa sulle partite libere
            r = QZ.profile.record(GAME, { xp: xp, label: S.score + ' punti su ' + S.len + ' frasi' + (S.time ? ' a tempo' : ''), score: S.score, mode: recMode(S.len, S.time) });
        }

        var review = '<details class="ch-review"><summary>Il riepilogo · ' + S.log.length + ' frasi</summary>' + S.log.map(function (l) {
            return '<div class="ch-review__row">' + QZ.icon(l.ok ? 'check' : 'x', l.ok ? 'ok' : 'bad') +
                '<div class="grow"><span class="sr-only">' + (l.ok ? 'Indovinata: ' : 'Mancata: ') + '</span><q>' + QZ.esc(l.q.quote) + '</q><b>' + QZ.esc(l.q.correct) + '</b>' +
                (l.pts ? '<span class="ch-review__pts">+' + l.pts + '</span>' : '') + '</div></div>';
        }).join('') + '</details>';
        var nArch = archived();
        var arch = !nArch ? '' : '<p class="small muted center ch-arch">Archivio: <b>' + nArch + '</b> ' + (nArch === 1 ? 'frase riconosciuta' : 'frasi riconosciute') + ' su ' + pool.length +
            (S.fresh ? ' · ' + S.fresh + (S.fresh === 1 ? ' nuova' : ' nuove') + ' in questa partita' : '') + '</p>';
        var again = missed.length ? '<div class="row row--center mt-2"><button type="button" class="btn" id="g-review">' + QZ.icon('refresh') +
            'Ripassa ' + (missed.length === 1 ? 'la mancata' : 'le ' + missed.length + ' mancate') + '</button></div>' : '';

        var title = S.review
            ? (pct === 100 ? 'Ripasso perfetto' : pct >= 50 ? 'Adesso va meglio' : 'Ancora un giro di taccuino')
            : pct >= 90 ? 'Archivio vivente' : pct >= 60 ? 'Orecchio fino' : pct >= 30 ? 'Qualcosa ti è sfuggito' : 'Rimandato a settembre';
        var voto = QZ.pagella(ratio).label;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: pct >= 50,
            icon: pct >= 50 ? 'quote' : 'flag',
            title: title,
            subtitle: (S.review ? 'Ripasso: ' : '') +
                (right ? (S.review ? 'ne hai' : 'Ne hai') + (right === 1 ? ' riconosciuta ' : ' riconosciute ') + right + ' su ' + played +
                    (S.typed ? ', ' + S.typed + ' scrivendo il nome a memoria.' : right === 1 ? ', con le opzioni.' : ', tutte con le opzioni.')
                    : (S.review ? 'nessuna' : 'Nessuna') + ' riconosciuta su ' + played + '.') +
                (!S.review && CATS[S.cat].from ? ' ' + CATS[S.cat].from : ''),
            big: S.score, bigSuffix: ' pt',
            record: r,
            ratio: ratio,
            stats: [
                { label: 'Scritte giuste', value: S.typed },
                { label: 'Con le opzioni', value: S.opts },
                { label: 'Serie migliore', value: S.bestStreak },
                { label: 'Precisione', value: pct + '%' }
            ],
            extraHTML: again + arch + review,
            share: S.review ? null : 'A Chi l\'ha detto su Quizzotti ho riconosciuto ' + right + ' frasi celebri su ' + S.len + ', ' + S.typed + ' a memoria: ' + S.score + ' punti, voto ' + voto + '. Tu sai chi le ha dette?',
            onRetry: function () { start(); },
            secondary: { label: 'Cambia partita', icon: 'list', onClick: function () { paintStartInfo(); QZ.show('s-start'); } }
        });
        var rv = $('#g-review');
        if (rv) rv.addEventListener('click', function () { rv.disabled = true; start(missed); });
        paintStartInfo();
    }

    // per i test automatici (node): il confronto dei nomi e' la parte delicata
    if (typeof window !== 'undefined' && window.__QZ_TEST__) window.__QZ_TEST__.citazioni = { judge: judge, forms: forms, recMode: recMode };
})();
