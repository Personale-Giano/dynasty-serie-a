/* ==========================================================================
   QUIZZOTTI v2 — Chi Vuol Essere Milionario
   Dati: assets/db-cvem.js (`questions`, per livello 1-15) + assets/questions-data.js
   (`QUIZ_DB`, mappato sui livelli in base alla difficolta').
   Soglie di sicurezza (livelli 5 e 10), risposte rimescolate, suspense prima
   del verdetto, domande che non si ripetono tra una partita e l'altra, tempo
   che cresce con la difficolta', tastiera A-D / 1-4, statistiche di carriera
   e revisione delle domande a fine partita.
   ========================================================================== */
(function () {
    'use strict';

    var PRIZES = [0, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
    var SAFE = [5, 10];
    var LETTERS = ['A', 'B', 'C', 'D'];
    /* Due versioni, un motore: calcio (CVEM.html) e cultura generale
       (MilionarioNormale.html, data-game="milionario", dati in db-milionario.js). */
    var NORMAL = !!document.body && document.body.getAttribute('data-game') === 'milionario';
    var GID = NORMAL ? 'milionario' : 'cvem';
    /* global milionarioData */
    var STATS_KEY = 'qz.' + GID + '.stats';
    var CAT_LABEL = { Curiosita: 'Curiosità', Loghi: 'Colori e simboli' };
    var FRIENDS = NORMAL ? ['zia Carla, che non si perde una puntata di un quiz dal 1985', 'il professore di lettere del liceo', 'tua cugina, che sa tutte le canzoni di Sanremo', 'nonno Pino, che ha letto tutta l\'enciclopedia', 'Giulia, quella che vince sempre al Trivial', 'Luca, che guarda documentari anche a colazione'] : ['lo zio Franco, che non si perde una partita dal 1978', 'Gigi del bar sotto casa', 'tua cugina, abbonata in curva', 'il mister della tua squadra di calcetto', 'nonno Pino, che ha la Gazzetta di ogni lunedì', 'Marco, quello che vince sempre il fantacalcio'];

    /* ---------- Pool domande: db-cvem + QUIZ_DB distribuito per difficolta' ---------- */
    // Il livello di una voce di QUIZ_DB dipende dal suo id (non dalla posizione nel file):
    // aggiungere domande non sposta le altre. Il livello 1 (le regole) e il 15 (la domanda
    // da un milione) restano solo a db-cvem.
    var BANDS = { facile: [2, 5], medio: [6, 10], difficile: [11, 14] };
    function hash(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    }
    var CAT_ICON = NORMAL ? milionarioData.icons : {};
    var pool = (NORMAL ? milionarioData.questions : questions).map(function (q) {
        return { level: q.level, text: q.question, options: LETTERS.map(function (l) { return q.options[l]; }), correct: LETTERS.indexOf(q.correctAnswer), cat: q.cat || '' };
    });
    if (!NORMAL && typeof QUIZ_DB !== 'undefined') {
        QUIZ_DB.forEach(function (q) {
            if (!q.opzioni || q.opzioni.length !== 4) return; // i vero/falso non servono qui
            var b = BANDS[q.difficolta] || BANDS.medio;
            pool.push({ level: b[0] + (hash(q.id) % (b[1] - b[0] + 1)), text: q.domanda, options: q.opzioni.slice(), correct: q.risposta, cat: CAT_LABEL[q.categoria] || q.categoria });
        });
    }
    var deck = new QZ.Deck(GID, pool, function (q) { return q.text; });

    /* ---------- Stato ---------- */
    var S = {};
    var timer = null;
    var starting = false; // blocca il doppio tap sul fischio d'inizio
    var $ = QZ.$;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = (NORMAL ? 'Si comincia' : 'Fischio d\'inizio') + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('crown');
    $('#rules').innerHTML = [
        ['Quindici domande,', 'da €100 al milione. Più sali, più si fanno cattive.'],
        ['Il tempo corre:', '30 secondi per le prime cinque, 40 fino alla decima, 50 per le ultime. Se scade, ' + (NORMAL ? 'la partita finisce.' : 'è fischio finale.')],
        ['Due soglie sicure', 'a €1.000 e €32.000: se sbagli dopo, quei soldi non te li toglie nessuno.'],
        ['Quattro aiuti:', '50:50, pubblico, telefonata a casa e 15 secondi in più. Uno a testa, e mentre li usi il tempo si ferma.'],
        ['Puoi ritirarti', 'quando vuoi e incassare quello che hai vinto. Il coraggio è facoltativo.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    paintCareer();

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));

    $('#ladder').innerHTML = PRIZES.slice(1).map(function (p, i) {
        var lv = i + 1;
        return '<li data-lv="' + lv + '" class="' + (SAFE.indexOf(lv) >= 0 ? 'is-safe' : '') + '"><span>' + lv + '</span><i></i><span>' + money(p) + '</span></li>';
    }).join('');

    var LIFE = [
        { id: 'fifty', label: 'Dimezza', ico: '<span>50:50</span>', fn: useFifty, aria: '50:50, toglie due risposte sbagliate' },
        { id: 'audience', label: 'Pubblico', ico: QZ.icon('chart'), fn: useAudience, aria: 'Chiedi al pubblico' },
        { id: 'phone', label: 'Telefono', ico: QZ.icon('phone'), fn: usePhone, aria: 'Telefonata a casa' },
        { id: 'time', label: '+15 s', ico: QZ.icon('hourglass'), fn: useTime, aria: 'Quindici secondi in più' },
        { id: 'quit', label: 'Ritirati', ico: QZ.icon('flag'), fn: quit, cls: 'cv-life--quit', aria: 'Ritirati e incassa' }
    ];
    $('#lifelines').innerHTML = LIFE.map(function (l) {
        return '<button type="button" class="cv-life ' + (l.cls || '') + '" data-life="' + l.id + '" aria-label="' + l.aria + '"><span class="cv-life__ico" aria-hidden="true">' + l.ico + '</span><span aria-hidden="true">' + l.label + '</span></button>';
    }).join('');
    LIFE.forEach(function (l) { $('[data-life="' + l.id + '"]').addEventListener('click', l.fn); });

    $('#answers').innerHTML = LETTERS.map(function (l, i) {
        return '<button type="button" class="answer" data-i="' + i + '" style="--i:' + i + '"><span class="answer__key">' + l + '</span><span class="answer__text"></span></button>';
    }).join('');
    var answerEls = QZ.$$('#answers .answer');
    answerEls.forEach(function (el) {
        el.addEventListener('click', function () { pick(Number(el.dataset.i)); });
    });

    $('#start-btn').addEventListener('click', start);

    document.addEventListener('keydown', function (e) {
        if (!S.active || S.hold || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        if (document.querySelector('.qz-modal')) return;
        var k = e.key.toUpperCase();
        var idx = LETTERS.indexOf(k);
        if (idx < 0 && /^[1-4]$/.test(k)) idx = Number(k) - 1;
        if (idx >= 0 && !answerEls[idx].disabled) { e.preventDefault(); pick(idx); }
    });

    /* ---------- Helper ---------- */
    function money(n) { return '€' + QZ.fmt(n); }
    function secondsFor(level) { return level <= 5 ? 30 : level <= 10 ? 40 : 50; }
    function safePrize(level) {
        var s = 0;
        SAFE.forEach(function (x) { if (level > x) s = x; });
        return s;
    }
    function phase(lv) { return lv <= 5 ? 'Riscaldamento' : lv <= 10 ? 'Primo tempo' : lv < 15 ? 'Secondo tempo' : 'La domanda da un milione'; }
    function alive() { return [0, 1, 2, 3].filter(function (i) { return S.out.indexOf(i) < 0; }); }

    /* ---------- Carriera (statistiche su questo dispositivo) ---------- */
    function career() {
        var c = QZ.store.get(STATS_KEY, null);
        return Object.assign({ games: 0, won: 0, best: 0, millions: 0, correct: 0 }, c && typeof c === 'object' ? c : {});
    }
    function paintCareer() {
        var c = career();
        var best = QZ.profile.best(GID);
        var parts = [];
        if (best) parts.push('Il tuo record: ' + best + (best === 1 ? ' domanda superata' : ' domande superate') + (c.best ? ', vincita più alta ' + money(c.best) : ''));
        if (c.games) parts.push(c.games + (c.games === 1 ? ' partita' : ' partite') + ', ' + money(c.won) + ' vinti in tutto' + (c.millions ? ', milionario ' + (c.millions === 1 ? 'una volta' : c.millions + ' volte') : ''));
        $('#start-record').textContent = parts.join(' · ');
    }

    /* ---------- Flusso ---------- */
    function start() {
        if (starting) return;
        starting = true;
        S = { level: 1, active: false, hold: 0, used: {}, correct: 0, times: [], streak: 0, q: null, out: [], log: [] };
        QZ.$$('.cv-life').forEach(function (b) { b.disabled = false; });
        QZ.$$('.cv-life .qz-mark').forEach(function (m) { m.remove(); });
        paintStreak();
        QZ.show('s-game');
        QZ.sound.start();
        QZ.sound.startMusic();
        setTimeout(function () { starting = false; load(); }, 450);
    }

    /** Se il fuoco e' rimasto su un bottone spento (o e' finito nel vuoto), torna sulla prima risposta viva. */
    function focusAnswers() {
        var a = document.activeElement;
        if (document.querySelector('.qz-modal')) return;
        if (a && a !== document.body && !a.disabled && a.offsetParent !== null) return;
        var first = answerEls.filter(function (el) { return !el.disabled; })[0];
        if (first) first.focus({ preventScroll: true });
    }

    /** Il tempo riparte solo se nessun aiuto o conferma lo tiene fermo. */
    function resume() { if (S.active && !S.hold && timer) timer.start(); }
    function hold() { S.hold++; if (timer) timer.pause(); }
    function release() { S.hold = Math.max(0, S.hold - 1); resume(); }

    function load() {
        var lv = S.level;
        var q = deck.draw(function (x) { return x.level === lv; }) || deck.draw(function (x) { return Math.abs(x.level - lv) <= 1; });
        if (!q) { finish('win'); return; }
        // rimescola le opzioni: la risposta giusta non sta sempre nella stessa posizione
        var order = QZ.shuffle([0, 1, 2, 3]);
        S.q = { text: q.text, cat: q.cat, options: order.map(function (i) { return q.options[i]; }), correct: order.indexOf(q.correct) };
        S.out = [];

        $('#q-label').textContent = String(lv).padStart(2, '0') + '/15';
        $('#q-label').setAttribute('aria-label', 'Domanda ' + lv + ' di 15');
        $('#q-safe').textContent = SAFE.indexOf(lv) >= 0 ? 'Soglia sicura' : lv === 15 ? 'Il milione' : '';
        $('#q-prize').textContent = money(PRIZES[lv]);
        QZ.fx.pop($('#q-prize'));
        $('#q-cat').innerHTML = QZ.icon(CAT_ICON[q.cat] || (NORMAL ? 'crown' : 'ball')) + QZ.esc(q.cat ? phase(lv) + ' · ' + q.cat : phase(lv));
        var qe = $('#question');
        qe.textContent = S.q.text;
        QZ.fx.replay(qe);

        answerEls.forEach(function (el, i) {
            el.className = 'answer';
            QZ.$$('.qz-mark, .qz-stamp', el).forEach(function (m) { m.remove(); });
            el.disabled = false;
            el.querySelector('.answer__text').textContent = S.q.options[i];
            QZ.fx.replay(el);
        });
        paintLadder();

        if (timer) timer.destroy();
        timer = new QZ.Timer({
            seconds: secondsFor(lv), ring: ring,
            onSecond: function (s) {
                if (s <= 5 && s > 0) QZ.sound.tick();
                if (s === 10) QZ.say('Dieci secondi.');
            },
            onExpire: function () { if (S.active) { S.active = false; reveal(-1); } }
        });
        S.active = true;
        S.hold = 0;
        focusAnswers();
        S.t0 = performance.now();
        setTimeout(resume, 350);
    }

    function pick(i) {
        if (!S.active || S.hold) return;
        S.active = false;
        timer.pause();
        S.times.push((performance.now() - S.t0) / 1000);
        answerEls.forEach(function (el) { el.disabled = true; });
        answerEls[i].classList.add('is-picked');
        QZ.sound.pop();
        // suspense: piu' alta la posta, piu' lunga l'attesa
        var wait = S.level <= 5 ? 700 : S.level <= 10 ? 1300 : 2000;
        setTimeout(function () { reveal(i); }, QZ.reducedMotion() ? 200 : wait);
    }

    function reveal(i) {
        var ok = i === S.q.correct;
        var correctEl = answerEls[S.q.correct];
        answerEls.forEach(function (el) { el.disabled = true; el.classList.remove('is-picked'); });
        correctEl.classList.add('is-correct');
        var rightTxt = LETTERS[S.q.correct] + ', ' + S.q.options[S.q.correct];
        S.log.push({ lv: S.level, text: S.q.text, right: S.q.options[S.q.correct], picked: i >= 0 ? S.q.options[i] : null, ok: ok });
        QZ.fx.stamp(correctEl, ok ? QZ.pick(['Esatto!', 'Gol!', 'Che giocata']) : 'Era questa', ok ? 'ok' : 'ink', {
            size: 22, x: 74,
            say: ok ? 'Esatto! ' + rightTxt + '. Hai vinto ' + money(PRIZES[S.level]) + '.'
                : (i >= 0 ? 'Sbagliato. ' : 'Tempo scaduto. ') + 'La risposta giusta era ' + rightTxt + '.'
        });
        if (ok) {
            S.correct++;
            S.streak++;
            paintStreak();
            QZ.sound.correct();
            QZ.vibrate(40);
            QZ.fx.sparks(correctEl);
            QZ.fx.floatText(correctEl, money(PRIZES[S.level]));
            if (SAFE.indexOf(S.level) >= 0) {
                setTimeout(function () { QZ.fx.confetti({ count: 90 }); QZ.toast(money(PRIZES[S.level]) + ' in cassaforte. Nessuno te li toglie più.', { icon: 'shield', type: 'ok' }); }, 300);
            }
            setTimeout(function () {
                if (S.level >= 15) { finish('win'); return; }
                S.level++;
                QZ.sound.levelUp();
                load();
            }, 1500);
        } else {
            if (i >= 0) { answerEls[i].classList.add('is-wrong'); QZ.fx.stamp(answerEls[i], 'Fuorigioco', 'bad', { size: 22, x: 74, say: false }); }
            else QZ.toast(NORMAL ? 'Tempo scaduto: la partita finisce qui.' : 'Fischio finale: tempo scaduto.', { icon: 'clock', type: 'bad' });
            S.timeout = i < 0;
            S.streak = 0;
            paintStreak();
            QZ.sound.wrong();
            QZ.vibrate([60, 40, 60]);
            QZ.fx.shake($('.cv-question'));
            setTimeout(function () { finish('lose'); }, 1900);
        }
    }

    function paintLadder() {
        QZ.$$('#ladder li').forEach(function (li) {
            var lv = Number(li.dataset.lv);
            li.classList.toggle('is-now', lv === S.level);
            if (lv === S.level) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
            li.classList.toggle('is-done', lv < S.level);
        });
        var now = $('#ladder li.is-now');
        if (now && window.matchMedia('(max-width: 979px)').matches) {
            // scorre solo la striscia dei premi, non la pagina
            var lad = $('#ladder');
            var left = lad.scrollLeft + now.getBoundingClientRect().left - lad.getBoundingClientRect().left - (lad.clientWidth - now.offsetWidth) / 2;
            if (lad.scrollTo) lad.scrollTo({ left: left, behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
            else lad.scrollLeft = left;
        }
    }

    function paintStreak() {
        var s = $('#streak');
        s.innerHTML = QZ.icon('flame') + '<span>' + S.streak + '</span>';
        s.classList.toggle('is-hot', S.streak >= 3);
        s.title = 'Risposte giuste di fila';
    }

    /* ---------- Aiuti ---------- */
    function spend(id) {
        if (!S.active || S.hold || S.used[id]) return false;
        S.used[id] = true;
        var btn = $('[data-life="' + id + '"]');
        // il bottone si spegne: il fuoco passa a una risposta, cosi' da tastiera non si perde
        if (document.activeElement === btn) {
            var first = alive().filter(function (i) { return !answerEls[i].disabled; })[0];
            if (first != null) answerEls[first].focus({ preventScroll: true });
        }
        btn.disabled = true;
        QZ.sound.lifeline();
        return true;
    }

    function useFifty() {
        if (!spend('fifty')) return;
        var wrong = QZ.shuffle([0, 1, 2, 3].filter(function (i) { return i !== S.q.correct; })).slice(0, 2);
        S.out = wrong;
        // il fuoco non deve restare su una risposta che sta per sparire
        if (wrong.indexOf(answerEls.indexOf(document.activeElement)) >= 0) answerEls[alive()[0]].focus({ preventScroll: true });
        wrong.forEach(function (i, k) {
            answerEls[i].disabled = true; // subito: niente tocchi sulla risposta che sta sparendo
            setTimeout(function () { answerEls[i].classList.add('is-out'); QZ.sound.whoosh(); }, k * 250);
        });
        var left = alive().map(function (i) { return LETTERS[i]; });
        QZ.say('50:50: restano la ' + left[0] + ' e la ' + left[1] + '.');
    }

    /** Percentuali intere che fanno sempre 100 (metodo dei resti piu' grandi). */
    function percentages(votes) {
        var tot = votes.reduce(function (a, b) { return a + b; }, 0) || 1;
        var raw = votes.map(function (v) { return (v / tot) * 100; });
        var pct = raw.map(Math.floor);
        var missing = 100 - pct.reduce(function (a, b) { return a + b; }, 0);
        raw.map(function (r, i) { return { i: i, rest: r - Math.floor(r) }; })
            .filter(function (x) { return votes[x.i] > 0; })
            .sort(function (a, b) { return b.rest - a.rest; })
            .slice(0, missing).forEach(function (x) { pct[x.i]++; });
        return pct;
    }

    function useAudience() {
        if (!spend('audience')) return;
        hold();
        // il pubblico e' tanto piu' affidabile quanto piu' la domanda e' facile
        var reliability = QZ.clamp(0.88 - (S.level - 1) * 0.04, 0.35, 0.88);
        var live = alive();
        var votes = [0, 0, 0, 0];
        live.forEach(function (i) { votes[i] = 5 + Math.random() * 25; });
        var favourite = Math.random() < reliability ? S.q.correct : QZ.pick(live.filter(function (i) { return i !== S.q.correct; }));
        votes[favourite] += 30 + Math.random() * 40;
        var pct = percentages(votes);
        var summary = live.map(function (i) { return LETTERS[i] + ' ' + pct[i] + '%'; }).join(', ');
        QZ.modal({
            title: 'Il pubblico ha votato',
            html: '<div class="cv-audience" role="img" aria-label="Voti del pubblico: ' + summary + '">' + LETTERS.map(function (l, i) {
                return '<div class="cv-audience__col' + (S.out.indexOf(i) >= 0 ? ' is-out' : '') + '" aria-hidden="true"><span>' + pct[i] + '%</span><div class="cv-audience__track"><div class="cv-audience__bar" data-h="' + pct[i] + '"></div></div><span>' + l + '</span></div>';
            }).join('') + '</div><p class="small muted mt-2 center">Il tempo è fermo. Il pubblico a volte sbaglia, soprattutto quando la domanda si fa cattiva.</p>',
            actions: [{ label: 'Torna alla domanda', primary: true }],
            onOpen: function (m) {
                setTimeout(function () {
                    QZ.$$('.cv-audience__bar', m).forEach(function (b, i) {
                        setTimeout(function () { b.style.height = (S.out.indexOf(i) >= 0 ? 0 : Math.max(3, Number(b.dataset.h))) + '%'; QZ.sound.tock(); }, i * 160);
                    });
                }, 150);
            }
        }).then(release);
    }

    function usePhone() {
        if (!spend('phone')) return;
        hold();
        var reliability = S.level <= 5 ? 0.95 : S.level <= 10 ? 0.75 : 0.55;
        var live = alive();
        var right = Math.random() < reliability;
        var say = right ? S.q.correct : QZ.pick(live.filter(function (i) { return i !== S.q.correct; }));
        var conf = right ? QZ.pick(['Ci metto la mano sul fuoco', 'Sono abbastanza sicuro', 'Direi', 'Mi sembra']) : QZ.pick(['Non ne sono certo, ma direi', 'Vado a sensazione', 'Forse']);
        var answerText = LETTERS[say] + ' · ' + S.q.options[say];
        var node = QZ.el('<div class="stack" style="--gap:14px;align-items:center;text-align:center">' +
            '<div class="medal" style="width:84px;animation:none">' + QZ.icon('phone') + '</div>' +
            '<p class="muted" data-msg aria-live="polite"></p></div>');
        node.querySelector('[data-msg]').textContent = 'Squilla il telefono di ' + QZ.pick(FRIENDS) + '…';
        QZ.modal({
            title: 'Telefonata a casa',
            node: node,
            actions: [{ label: 'Grazie, torno alla domanda', primary: true }],
            onOpen: function () {
                QZ.sound.tone(440, 0.4, 'sine', 0.08, 0); QZ.sound.tone(440, 0.4, 'sine', 0.08, 0.6);
                setTimeout(function () {
                    var m = node.querySelector('[data-msg]');
                    m.innerHTML = '«' + QZ.esc(conf) + ': <b style="color:var(--accent-ink)">' + QZ.esc(answerText) + '</b>»';
                    m.classList.remove('muted');
                    QZ.fx.pop(m);
                }, 1600);
            }
        }).then(release);
    }

    function useTime() {
        if (!spend('time')) return;
        timer.add(15);
        QZ.fx.floatText(ring, '+15s');
        QZ.fx.pop(ring);
        QZ.say('Quindici secondi in più: ne hai ' + Math.ceil(timer.remaining) + '.');
    }

    function quit() {
        if (!S.active || S.hold) return;
        hold();
        var won = PRIZES[S.level - 1];
        QZ.confirm(won ? 'Ti fermi qui e porti a casa ' + money(won) + '. Sicuro?' : 'Ti ritiri senza aver vinto niente. Proprio sicuro?', { title: 'Incassi?', okLabel: 'Incasso', cancelLabel: 'Rischio' }).then(function (ok) {
            if (ok && S.active) { S.active = false; QZ.sound.coin(); finish('quit'); }
            else release();
        });
    }

    /* ---------- Fine partita ---------- */
    function reviewHTML() {
        if (!S.log.length) return '';
        var rows = S.log.map(function (r) {
            var verdict = r.ok ? '' : '<div class="cv-review__bad">' + (r.picked ? 'Hai detto: ' + QZ.esc(r.picked) : 'Tempo scaduto') + '</div>';
            return '<li class="' + (r.ok ? 'is-ok' : 'is-ko') + '"><span class="cv-review__lv">' + String(r.lv).padStart(2, '0') + '</span>' +
                '<div><div class="cv-review__q">' + QZ.esc(r.text) + '</div><div class="cv-review__a">' + QZ.esc(r.right) + '</div>' + verdict + '</div></li>';
        }).join('');
        return '<details class="cv-review card mt-3"><summary>Rivedi le domande della partita (' + S.log.length + ')</summary><ol>' + rows + '</ol></details>';
    }

    function finish(type) {
        S.active = false;
        if (timer) timer.pause();
        QZ.sound.stopMusic();
        var reached = type === 'win' ? 15 : S.level - 1;           // ultimo livello superato
        var prizeLevel = type === 'lose' ? safePrize(S.level) : reached;
        var prize = PRIZES[prizeLevel];
        var avg = S.times.length ? S.times.reduce(function (a, b) { return a + b; }, 0) / S.times.length : 0;
        var xp = reached * 15 + S.correct * 3 + (type === 'win' ? 100 : 0);
        var r = QZ.profile.record(GID, { xp: xp, label: money(prize) + ' · livello ' + reached + '/15', score: reached });

        var c = career();
        var bestBefore = c.best;
        c.games++; c.won += prize; c.correct += S.correct;
        if (prize > c.best) c.best = prize;
        if (type === 'win') c.millions++;
        QZ.store.set(STATS_KEY, c);
        paintCareer();

        var how = S.timeout ? 'Il tempo ti frega alla domanda ' + S.level : 'Sbagli alla domanda ' + S.level;
        var titles = {
            win: ['Milionario!', 'Quindici su quindici. Da stasera al bar paghi tu.'],
            lose: prize
                ? ['Salvato dalla soglia', how + ', ma la soglia sicura ti para il colpo.']
                : [reached === 4 ? 'A un passo dalla soglia' : reached ? 'Fuori nel riscaldamento' : 'Fuori al primo turno', how + ' e torni a casa a mani vuote. Capita anche ai migliori.'],
            quit: [prize ? 'Incassa e saluta' : 'Ritirato a secco', 'Ti fermi alla domanda ' + S.level + '. Il coraggio è facoltativo, i soldi no.']
        };
        var used = Object.keys(S.used).length;
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: prize > 0,
            icon: type === 'win' ? 'crown' : type === 'quit' ? 'coins' : 'flag',
            title: titles[type][0],
            subtitle: titles[type][1] + (prize > bestBefore && c.games > 1 ? ' E questa è la tua vincita più alta di sempre.' : ''),
            big: prize, bigPrefix: '€',
            record: r,
            ratio: reached / 15,
            stats: [
                { label: 'Livello', value: reached + '/15' },
                { label: 'Risposte giuste', value: S.correct },
                { label: 'Tempo medio', value: avg.toFixed(1).replace('.', ',') + ' s' },
                { label: 'Aiuti usati', value: used + '/4' }
            ],
            extraHTML: reviewHTML(),
            share: type === 'win'
                ? 'Sono diventato milionario su Quizzotti: 15 domande' + (NORMAL ? ' di cultura generale' : ' di calcio') + ' su 15' + (used ? ', con ' + used + (used === 1 ? ' aiuto' : ' aiuti') : ' senza nemmeno un aiuto') + '. Riesci a battermi?'
                : 'Chi Vuol Essere Milionario su Quizzotti: ' + money(prize) + ' vinti, livello ' + reached + '/15' + (type === 'quit' ? ' e ritiro prudente' : '') + '. Fai di meglio?',
            onRetry: start
        });
        if (prize >= 1000) setTimeout(function () { QZ.fx.rain('€', type === 'win' ? 40 : 18); }, 400);
    }
})();
