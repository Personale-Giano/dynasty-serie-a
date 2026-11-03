/* ==========================================================================
   QUIZZOTTI v2 — Chi l'ha detto (citazioni)
   Dati: assets/db-citazioni.js (`quotes`, {quote, correct, options[4]}).
   Si scrive il nome (3 punti, basta il cognome, errori di battitura
   tollerati) oppure si aprono le opzioni (1 punto). Partite a numero fisso
   di frasi, niente frasi ripetute, confronto tollerante, aiuto "iniziali",
   serie bonus, modalita' a tempo e riepilogo finale delle frasi.
   Almanacco: la frase e' un ritaglio di giornale col nastro adesivo, il nome
   si scrive sul quaderno a righe e la risposta arriva come didascalia.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'citazioni';
    var LETTERS = ['A', 'B', 'C', 'D'];
    var PTS = { typed: 3, hinted: 2, options: 1 };
    // soprannomi celebri accettati come risposta scritta
    var NICK = {
        'zlatan ibrahimovic': ['ibra'], 'cristiano ronaldo': ['cr7'], 'jose mourinho': ['mou', 'special one'],
        'pep guardiola': ['pep'], 'zinedine zidane': ['zizou'], 'giovanni trapattoni': ['trap'],
        'diego maradona': ['pibe de oro', 'el pibe de oro'], 'gianluigi buffon': ['gigi'], 'francesco totti': ['pupone', 'er pupone'],
        'alessandro del piero': ['pinturicchio'], 'roberto baggio': ['divin codino', 'codino'], 'gennaro gattuso': ['ringhio'],
        'massimiliano allegri': ['max'], 'lionel messi': ['leo', 'pulce']
    };
    var PARTICLES = { de: 1, del: 1, della: 1, di: 1, da: 1, van: 1, von: 1, der: 1, la: 1, le: 1, dos: 1, das: 1 };

    // il database contiene alcune frasi doppie: si tiene la prima
    var seenQ = {};
    var pool = quotes.filter(function (q) {
        var k = QZ.norm(q.quote);
        if (seenQ[k]) return false;
        seenQ[k] = 1;
        return true;
    });
    var deck = new QZ.Deck(GAME, pool, function (q) { return q.quote; });
    var set = Object.assign({ len: 10, time: 0 }, QZ.store.get('qz.citazioni.settings', {}) || {});
    var S = {};
    var timer = null;
    var starting = false; // blocca il doppio tap sul fischio d'inizio
    var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('quote');
    $('#g-mark').innerHTML = QZ.icon('quote');
    $('#rules').innerHTML = [
        ['Leggi il virgolettato', 'e scrivi chi l\'ha detto: basta il cognome, accenti e piccoli refusi non contano.'],
        ['A memoria: 3 punti.', 'Con le iniziali come aiutino, 2.'],
        ['Con le opzioni: 1 punto.', 'Le apri quando vuoi, o arrivano da sole dopo un tentativo a vuoto.'],
        ['Serie calda:', 'dalla terza giusta di fila, +1 a frase.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('#g-send').innerHTML = 'Tira' + QZ.icon('arrow');
    // il nome accessibile comincia con la parola che si vede ("Tira")
    $('#g-send').setAttribute('aria-label', 'Tira: invia la risposta');
    $('#g-options').innerHTML = QZ.icon('list') + 'Opzioni · 1 pt';
    $('#g-initials').innerHTML = QZ.icon('bulb') + 'Iniziali · −1 pt';
    $('#g-skip').innerHTML = QZ.icon('skip') + 'Passo';
    $('#g-kbd').innerHTML = 'Tastiera: <span class="kbd">Invio</span> risponde · <span class="kbd">1</span>–<span class="kbd">4</span> sceglie un\'opzione';

    function saveSet() { QZ.store.set('qz.citazioni.settings', set); }
    QZ.segmented($('#set-len'), [{ label: '10', value: 10 }, { label: '15', value: 15 }, { label: '20', value: 20 }], set.len, function (v) { set.len = v; saveSet(); });
    QZ.segmented($('#set-time'), [{ label: 'Senza limite', value: 0 }, { label: '30 s a frase', value: 30 }], set.time, function (v) { set.time = v; saveSet(); });

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));

    $('#g-answers').innerHTML = LETTERS.map(function (l, i) {
        return '<button type="button" class="answer" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key">' + l + '</span><span class="answer__text"></span></button>';
    }).join('');
    var answerEls = QZ.$$('#g-answers .answer');
    answerEls.forEach(function (el) { el.addEventListener('click', function () { pickOption(Number(el.dataset.i)); }); });

    $('#start-btn').addEventListener('click', start);
    $('#g-typeform').addEventListener('submit', function (e) { e.preventDefault(); submitTyped(); });
    $('#g-options').addEventListener('click', function () { if (S.phase === 'type') showOptions(); });
    $('#g-initials').addEventListener('click', useInitials);
    $('#g-skip').addEventListener('click', function () { if (S.phase === 'type' || S.phase === 'options') lose('skip'); });
    $('#g-next').addEventListener('click', load);

    document.addEventListener('keydown', function (e) {
        if (S.phase !== 'options' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.querySelector('.qz-modal')) return;
        var k = e.key.toUpperCase();
        var idx = LETTERS.indexOf(k);
        if (idx < 0 && /^[1-4]$/.test(k)) idx = Number(k) - 1;
        if (idx >= 0) { e.preventDefault(); pickOption(idx); }
    });

    var rec = QZ.profile.best(GAME);
    $('#start-record').textContent = rec ? 'Il tuo record: ' + rec + ' punti' : '';

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

    /** 1 = giusto, 2 = ci sei quasi, 0 = sbagliato */
    function judge(input, q) {
        var u = QZ.norm(input);
        if (u.length < 2) return 0;
        var others = q.options.filter(function (o) { return o !== q.correct; });
        var mine = bestDistance(u, forms(q.correct, others));
        var theirs = bestDistance(u, [].concat.apply([], others.map(function (o) { return forms(o, [q.correct]); })));
        if (theirs.d < mine.d) return 0;
        var tol = tolerance(mine.len);
        if (mine.d <= tol) return 1;
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

    /* ---------- Il ritaglio ---------- */
    function paintClip() {
        var qe = $('#g-quote');
        qe.innerHTML = '<q></q>';
        qe.querySelector('q').textContent = S.q.quote.replace(/^[«"“\s]+|[»"”\s]+$/g, '');
        qe.classList.toggle('is-long', S.q.quote.length > 130);
        QZ.fx.replay(qe);
        $('#g-num').textContent = 'N° ' + String(S.n).padStart(2, '0');
        var nm = $('#g-name');
        nm.className = 'ch-clip__name is-blank';
        nm.innerHTML = '<span class="sr-only">nome da indovinare</span>';
        QZ.$$('.qz-stamp', $('#g-stamp')).forEach(function (s) { s.remove(); });
    }

    /** La didascalia: il nome si attacca sotto la frase, poi il timbro. */
    function caption(stampText, kind, say) {
        var nm = $('#g-name');
        nm.className = 'ch-clip__name';
        nm.textContent = S.q.correct;
        QZ.fx.replay(nm);
        setTimeout(function () {
            QZ.fx.stamp($('#g-stamp'), stampText, kind, { size: window.innerWidth < 420 ? 24 : 30, rot: -12, say: say });
        }, QZ.reducedMotion() ? 0 : 160);
    }

    /* ---------- Flusso ---------- */
    function start() {
        if (starting) return;
        starting = true;
        S = { len: set.len, time: set.time, n: 0, score: 0, streak: 0, bestStreak: 0, typed: 0, opts: 0, log: [], phase: 'idle' };
        $('#timer-host').hidden = !S.time;
        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: S.time || 30, ring: ring,
            onSecond: function (s) { if (s <= 5 && s > 0) QZ.sound.tick(); },
            onExpire: function () { if (S.phase === 'type' || S.phase === 'options') lose('time'); }
        });
        $('#g-score').textContent = '0 punti';
        paintStreak();
        QZ.show('s-game');
        QZ.sound.start();
        setTimeout(function () { starting = false; load(); }, 380);
    }

    function load() {
        // solo a frase chiusa: il doppio tap su "Avanti" non deve saltarne una
        if (S.phase !== 'done' && S.phase !== 'idle') return;
        if (S.n >= S.len) { finish(); return; }
        var raw = deck.draw();
        S.q = { quote: raw.quote, correct: raw.correct, options: QZ.shuffle(raw.options) };
        S.n++;
        S.phase = 'type';
        S.hinted = false;
        S.missed = false;
        S.nearUsed = false;

        $('#g-count').textContent = 'Frase ' + S.n + ' di ' + S.len;
        $('#g-progress').style.transform = 'scaleX(' + ((S.n - 1) / S.len) + ')';
        paintClip();

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
        if (finePointer) setTimeout(function () { inp.focus({ preventScroll: true }); }, 60);
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
        if (v === 1) { win(S.hinted ? 'hinted' : 'typed', $('#g-note')); return; }
        if (v === 2 && !S.nearUsed) {
            S.nearUsed = true;
            QZ.fx.shake($('#g-note'));
            QZ.sound.tock();
            QZ.toast('Quasi. Controlla come si scrive', { icon: 'bulb' });
            return;
        }
        // tentativo a vuoto: restano le opzioni per 1 punto
        S.missed = true;
        S.streak = 0;
        paintStreak();
        QZ.fx.shake($('#g-note'));
        QZ.sound.wrong();
        QZ.vibrate([50, 30, 50]);
        QZ.toast('Non è «' + val + '». Ecco le opzioni, per 1 punto', { icon: 'x', type: 'bad' });
        showOptions();
    }

    function useInitials() {
        if (S.phase !== 'type' || S.hinted) return;
        S.hinted = true;
        $('#g-initials').disabled = true;
        var h = $('#g-hint');
        var sayInit = 'Iniziali: ' + S.q.correct.split(/\s+/).map(function (t) { return t.charAt(0); }).join(' ');
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
        QZ.fx.mark(answerEls[i].querySelector('.answer__key'), 'cross', 'var(--ink)');
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
        addScore(pts);
        S.log.push({ q: S.q, ok: true, how: how, pts: pts });
        if (how === 'options') { el.classList.add('is-correct'); lockOptions(); }
        QZ.sound.correct();
        QZ.vibrate(40);
        QZ.fx.floatText(el, '+' + pts);
        paintStreak();
        caption(how === 'typed' ? QZ.pick(['Esatto!', 'Che memoria', 'Gol!']) : 'Esatto', 'ok', 'Esatto! L\'ha detto ' + S.q.correct + '. Più ' + pts + (pts === 1 ? ' punto.' : ' punti.'));
        var label = how === 'typed' ? 'Scritto a memoria' : how === 'hinted' ? 'Con le iniziali' : 'Con le opzioni';
        showResult(true, pts, label, bonus.length ? 'Bonus ' + bonus.join(' e ') : '');
    }

    function lose(how, el) {
        S.phase = 'done';
        timer.pause();
        S.streak = 0;
        paintStreak();
        S.log.push({ q: S.q, ok: false, how: how, pts: 0 });
        if (!$('#g-answers').hidden) {
            if (el) el.classList.add('is-wrong');
            answerEls.forEach(function (b) { if (b.querySelector('.answer__text').textContent === S.q.correct) b.classList.add('is-correct'); });
            lockOptions();
        }
        if (how === 'skip') QZ.sound.whoosh();
        else { QZ.sound.wrong(); QZ.vibrate([60, 40, 60]); QZ.fx.shake($('#g-card')); }
        caption({ wrong: 'Fuorigioco', skip: 'Passata', time: 'Tempo!' }[how], how === 'skip' ? 'ink' : 'bad',
            { wrong: 'Sbagliato', skip: 'Frase passata', time: 'Tempo scaduto' }[how] + '. L\'ha detto ' + S.q.correct + '.');
        var label = { wrong: 'Niente da fare', skip: 'Frase passata', time: 'Tempo scaduto' }[how];
        showResult(false, 0, label, 'La prossima volta te la ricordi.');
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
        $('#g-next').innerHTML = S.n >= S.len ? QZ.icon('trophy') + 'Vediamo il voto' : 'Avanti la prossima' + QZ.icon('arrow');
        $('#g-result').hidden = false;
        setTimeout(function () { $('#g-next').focus({ preventScroll: true }); }, 80);
    }

    function addScore(pts) {
        var from = S.score;
        S.score += pts;
        var el = $('#g-score');
        QZ.fx.count(el, from, S.score, 600, { suffix: ' punti' });
        QZ.fx.pop(el);
    }

    function paintStreak() {
        var s = $('#g-streak');
        s.innerHTML = QZ.icon('flame') + '<span>' + S.streak + '</span>';
        s.classList.toggle('is-hot', S.streak >= 3);
        s.title = 'Risposte giuste di fila';
    }

    /* ---------- Fine partita ---------- */
    function finish() {
        S.phase = 'end';
        if (timer) timer.pause();
        var right = S.typed + S.opts;
        var pct = Math.round((right / S.len) * 100);
        var xp = S.score * 2 + S.bestStreak * 2 + (S.time ? 10 : 0);
        var r = QZ.profile.record(GAME, { xp: xp, label: S.score + ' punti su ' + S.len + ' frasi', score: S.score });

        var review = '<details class="ch-review"><summary>La rassegna stampa · ' + S.len + ' frasi</summary>' + S.log.map(function (l) {
            return '<div class="ch-review__row">' + QZ.icon(l.ok ? 'check' : 'x', l.ok ? 'ok' : 'bad') +
                '<div class="grow"><span class="sr-only">' + (l.ok ? 'Indovinata: ' : 'Mancata: ') + '</span><q>' + QZ.esc(l.q.quote) + '</q><b>' + QZ.esc(l.q.correct) + '</b>' +
                (l.pts ? '<span class="ch-review__pts">+' + l.pts + '</span>' : '') + '</div></div>';
        }).join('') + '</details>';

        var title = pct >= 90 ? 'Archivio vivente' : pct >= 60 ? 'Orecchio fino' : pct >= 30 ? 'Qualcosa ti è sfuggito' : 'Rimandato a settembre';
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: pct >= 50,
            icon: pct >= 50 ? 'quote' : 'flag',
            title: title,
            subtitle: 'Ne hai riconosciute ' + right + ' su ' + S.len + ', ' + S.typed + ' scrivendo il nome a memoria.',
            big: S.score, bigSuffix: ' pt',
            record: r,
            ratio: QZ.clamp(S.score / (S.len * PTS.typed), 0, 1),
            stats: [
                { label: 'Scritte giuste', value: S.typed },
                { label: 'Con le opzioni', value: S.opts },
                { label: 'Serie migliore', value: S.bestStreak },
                { label: 'Precisione', value: pct + '%' }
            ],
            extraHTML: review,
            share: 'A Chi l\'ha detto su Quizzotti ho riconosciuto ' + right + ' frasi celebri su ' + S.len + ' (' + S.score + ' punti). Tu sai chi le ha dette?',
            onRetry: start,
            secondary: { label: 'Cambia partita', icon: 'list', onClick: function () { QZ.show('s-start'); } }
        });
        $('#start-record').textContent = 'Il tuo record: ' + QZ.profile.best(GAME) + ' punti';
    }
})();
