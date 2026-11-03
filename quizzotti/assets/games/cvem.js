/* ==========================================================================
   QUIZZOTTI v2 — Chi Vuol Essere Milionario
   Dati: assets/db-cvem.js (`questions`, per livello 1-15) + assets/questions-data.js
   (`QUIZ_DB`, mappato sui livelli in base alla difficolta').
   Novita' rispetto alla v1: soglie di sicurezza (livelli 5 e 10), risposte
   rimescolate, suspense prima del verdetto, domande che non si ripetono tra
   una partita e l'altra, tempo che cresce con la difficolta', tastiera A-D.
   ========================================================================== */
(function () {
    'use strict';

    var PRIZES = [0, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
    var SAFE = [5, 10];
    var LETTERS = ['A', 'B', 'C', 'D'];

    /* ---------- Pool domande: db-cvem + QUIZ_DB distribuito per difficolta' ---------- */
    var pool = questions.map(function (q) {
        return { level: q.level, text: q.question, options: LETTERS.map(function (l) { return q.options[l]; }), correct: LETTERS.indexOf(q.correctAnswer), cat: '' };
    });
    if (typeof QUIZ_DB !== 'undefined') {
        var bands = { facile: [1, 5], medio: [6, 10], difficile: [11, 15] };
        QUIZ_DB.forEach(function (q, i) {
            if (!q.opzioni || q.opzioni.length !== 4) return;
            var b = bands[q.difficolta] || [6, 10];
            pool.push({ level: b[0] + (i % (b[1] - b[0] + 1)), text: q.domanda, options: q.opzioni.slice(), correct: q.risposta, cat: q.categoria });
        });
    }
    var deck = new QZ.Deck('cvem', pool, function (q) { return q.text; });

    /* ---------- Stato ---------- */
    var S = {};
    var timer = null;
    var starting = false; // blocca il doppio tap sul fischio d'inizio
    var $ = QZ.$;

    /* ---------- Markup statico ---------- */
    $('#start-btn').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('crown');
    $('#rules').innerHTML = [
        ['Quindici domande,', 'da €100 al milione. Più sali, più si fanno cattive.'],
        ['Due soglie sicure', 'a €1.000 e €32.000: se sbagli dopo, quei soldi non te li toglie nessuno.'],
        ['Quattro aiuti:', '50:50, pubblico, telefonata a casa e 15 secondi in più. Uno a testa.'],
        ['Puoi ritirarti', 'quando vuoi e incassare quello che hai vinto. Il coraggio è facoltativo.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    var rec = QZ.profile.best('cvem');
    $('#start-record').textContent = rec ? 'Il tuo record: livello ' + rec + '/15 · ' + money(PRIZES[rec]) : '';

    $('#timer-host').innerHTML = QZ.ringHTML();
    var ring = QZ.ring($('#timer-host .timer-ring'));

    $('#ladder').innerHTML = PRIZES.slice(1).map(function (p, i) {
        var lv = i + 1;
        return '<li data-lv="' + lv + '" class="' + (SAFE.indexOf(lv) >= 0 ? 'is-safe' : '') + '"><span>' + lv + '</span><i></i><span>' + money(p) + '</span></li>';
    }).join('');

    var LIFE = [
        { id: 'fifty', label: '50:50', ico: '<span>50:50</span>', fn: useFifty },
        { id: 'audience', label: 'Pubblico', ico: QZ.icon('chart'), fn: useAudience },
        { id: 'phone', label: 'Telefono', ico: QZ.icon('phone'), fn: usePhone },
        { id: 'time', label: '+15 s', ico: QZ.icon('hourglass'), fn: useTime },
        { id: 'quit', label: 'Ritirati', ico: QZ.icon('flag'), fn: quit, cls: 'cv-life--quit' }
    ];
    $('#lifelines').innerHTML = LIFE.map(function (l) {
        return '<button type="button" class="cv-life ' + (l.cls || '') + '" data-life="' + l.id + '"><span class="cv-life__ico" aria-hidden="true">' + l.ico + '</span>' + l.label + '</button>';
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
        if (!S.active || e.ctrlKey || e.metaKey || e.altKey) return;
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

    /* ---------- Flusso ---------- */
    function start() {
        if (starting) return;
        starting = true;
        S = { level: 1, active: false, used: {}, correct: 0, times: [], streak: 0, q: null };
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
        var alive = answerEls.filter(function (el) { return !el.disabled; })[0];
        if (alive) alive.focus({ preventScroll: true });
    }

    function load() {
        var lv = S.level;
        var q = deck.draw(function (x) { return x.level === lv; }) || deck.draw(function (x) { return Math.abs(x.level - lv) <= 1; });
        if (!q) { finish('win'); return; }
        // rimescola le opzioni: la risposta giusta non sta sempre nella stessa posizione
        var order = QZ.shuffle([0, 1, 2, 3]);
        S.q = { text: q.text, cat: q.cat, options: order.map(function (i) { return q.options[i]; }), correct: order.indexOf(q.correct) };

        $('#q-label').textContent = 'Domanda ' + lv + ' di 15' + (SAFE.indexOf(lv) >= 0 ? ' · soglia sicura' : '');
        $('#q-prize').textContent = money(PRIZES[lv]);
        QZ.fx.pop($('#q-prize'));
        $('#q-cat').innerHTML = QZ.icon('ball') + QZ.esc(q.cat || (lv <= 5 ? 'Riscaldamento' : lv <= 10 ? 'Primo tempo' : 'Finale'));
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
            onSecond: function (s) { if (s <= 5 && s > 0) QZ.sound.tick(); },
            onExpire: function () { if (S.active) { S.active = false; reveal(-1); } }
        });
        S.active = true;
        focusAnswers();
        S.t0 = performance.now();
        setTimeout(function () { if (S.active) timer.start(); }, 350);
    }

    function pick(i) {
        if (!S.active) return;
        S.active = false;
        timer.pause();
        S.times.push((performance.now() - S.t0) / 1000);
        answerEls.forEach(function (el) { el.disabled = true; });
        answerEls[i].classList.add('is-picked');
        QZ.fx.mark(answerEls[i].querySelector('.answer__key'), 'cross', 'var(--ink)');
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
        QZ.fx.stamp(correctEl, ok ? QZ.pick(['Esatto!', 'Gol!', 'Che giocata']) : 'Era questa', ok ? 'ok' : 'ink', {
            size: 24,
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
            if (i >= 0) { answerEls[i].classList.add('is-wrong'); QZ.fx.stamp(answerEls[i], 'Fuorigioco', 'bad', { size: 24, say: false }); }
            else QZ.toast('Fischio finale: tempo scaduto.', { icon: 'clock', type: 'bad' });
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
            now.scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
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
        if (!S.active || S.used[id]) return false;
        S.used[id] = true;
        var btn = $('[data-life="' + id + '"]');
        // il bottone si spegne: il fuoco passa a una risposta, cosi' da tastiera non si perde
        if (document.activeElement === btn) {
            var alive = answerEls.filter(function (el) { return !el.disabled && !el.classList.contains('is-out'); })[0];
            if (alive) alive.focus({ preventScroll: true });
        }
        btn.disabled = true;
        QZ.fx.mark(btn, 'cross');
        QZ.sound.lifeline();
        return true;
    }

    function useFifty() {
        if (!spend('fifty')) return;
        var wrong = QZ.shuffle([0, 1, 2, 3].filter(function (i) { return i !== S.q.correct; })).slice(0, 2);
        // il fuoco non deve restare su una risposta che sta per sparire
        if (wrong.indexOf(answerEls.indexOf(document.activeElement)) >= 0) {
            var keep = [0, 1, 2, 3].filter(function (i) { return wrong.indexOf(i) < 0; })[0];
            answerEls[keep].focus({ preventScroll: true });
        }
        wrong.forEach(function (i, k) {
            setTimeout(function () { answerEls[i].classList.add('is-out'); answerEls[i].disabled = true; QZ.sound.whoosh(); }, k * 250);
        });
        var left = [0, 1, 2, 3].filter(function (i) { return wrong.indexOf(i) < 0; }).map(function (i) { return LETTERS[i]; });
        QZ.say('50:50: restano la ' + left[0] + ' e la ' + left[1] + '.');
        S.fiftyOut = wrong;
    }

    function useAudience() {
        if (!spend('audience')) return;
        timer.pause();
        // il pubblico e' tanto piu' affidabile quanto piu' la domanda e' facile
        var reliability = QZ.clamp(0.85 - (S.level - 1) * 0.04, 0.3, 0.85);
        var alive = [0, 1, 2, 3].filter(function (i) { return !answerEls[i].classList.contains('is-out'); });
        var votes = [0, 0, 0, 0];
        alive.forEach(function (i) { votes[i] = 5 + Math.random() * 25; });
        var favourite = Math.random() < reliability ? S.q.correct : QZ.pick(alive.filter(function (i) { return i !== S.q.correct; }));
        votes[favourite] += 30 + Math.random() * 40;
        var tot = votes.reduce(function (a, b) { return a + b; }, 0);
        var pct = votes.map(function (v) { return Math.round((v / tot) * 100); });
        QZ.modal({
            title: 'Il pubblico ha votato',
            html: '<div class="cv-audience">' + LETTERS.map(function (l, i) {
                return '<div class="cv-audience__col"><span class="muted">' + pct[i] + '%</span><div class="cv-audience__track"><div class="cv-audience__bar" data-h="' + pct[i] + '"></div></div><span>' + l + '</span></div>';
            }).join('') + '</div>',
            actions: [{ label: 'Torna alla domanda', primary: true }],
            onOpen: function (m) {
                setTimeout(function () {
                    QZ.$$('.cv-audience__bar', m).forEach(function (b, i) {
                        setTimeout(function () { b.style.height = Math.max(3, Number(b.dataset.h)) + '%'; QZ.sound.tock(); }, i * 160);
                    });
                }, 150);
            }
        }).then(function () { if (S.active) timer.start(); });
    }

    function usePhone() {
        if (!spend('phone')) return;
        timer.pause();
        var reliability = S.level <= 5 ? 0.95 : S.level <= 10 ? 0.75 : 0.55;
        var alive = [0, 1, 2, 3].filter(function (i) { return !answerEls[i].classList.contains('is-out'); });
        var right = Math.random() < reliability;
        var say = right ? S.q.correct : QZ.pick(alive.filter(function (i) { return i !== S.q.correct; }));
        var conf = right ? QZ.pick(['Ci metto la mano sul fuoco', 'Sono abbastanza sicuro', 'Direi', 'Mi sembra']) : QZ.pick(['Non ne sono certo, ma direi', 'Vado a sensazione:', 'Forse']);
        var answerText = LETTERS[say] + ' · ' + S.q.options[say];
        var node = QZ.el('<div class="stack" style="--gap:14px;align-items:center;text-align:center">' +
            '<div class="medal" style="width:84px;animation:none">' + QZ.icon('phone') + '</div>' +
            '<p class="muted" data-msg aria-live="polite">Sto chiamando il tuo amico esperto…</p></div>');
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
        }).then(function () { if (S.active) timer.start(); });
    }

    function useTime() {
        if (!spend('time')) return;
        timer.add(15);
        QZ.fx.floatText(ring, '+15s');
        QZ.fx.pop(ring);
        QZ.say('Quindici secondi in più: ne hai ' + Math.ceil(timer.remaining) + '.');
    }

    function quit() {
        if (!S.active) return;
        timer.pause();
        S.active = false;
        var won = PRIZES[S.level - 1];
        QZ.confirm(won ? 'Ti fermi qui e porti a casa ' + money(won) + '. Sicuro?' : 'Ti ritiri senza aver vinto niente. Proprio sicuro?', { title: 'Incassi?', okLabel: 'Incasso', cancelLabel: 'Rischio' }).then(function (ok) {
            if (ok) { QZ.sound.coin(); finish('quit'); }
            else { S.active = true; timer.start(); }
        });
    }

    /* ---------- Fine partita ---------- */
    function finish(type) {
        S.active = false;
        if (timer) timer.pause();
        QZ.sound.stopMusic();
        var reached = type === 'win' ? 15 : S.level - 1;           // ultimo livello superato
        var prizeLevel = type === 'lose' ? safePrize(S.level) : reached;
        var prize = PRIZES[prizeLevel];
        var avg = S.times.length ? S.times.reduce(function (a, b) { return a + b; }, 0) / S.times.length : 0;
        var xp = reached * 15 + S.correct * 3 + (type === 'win' ? 100 : 0);
        var r = QZ.profile.record('cvem', { xp: xp, label: money(prize) + ' · livello ' + reached + '/15', score: reached });

        var titles = {
            win: ['Milionario!', 'Quindici su quindici. Da stasera al bar paghi tu.'],
            lose: [prize ? 'Salvato dalla soglia' : 'Fuori al primo turno', prize ? 'Sbagli alla domanda ' + S.level + ', ma la soglia sicura ti para il colpo.' : 'Sbagli alla domanda ' + S.level + ' e torni a casa a mani vuote. Capita anche ai migliori.'],
            quit: ['Incassa e saluta', 'Ti fermi alla domanda ' + S.level + '. Il coraggio è facoltativo, i soldi no.']
        };
        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: prize > 0,
            icon: type === 'win' ? 'crown' : type === 'quit' ? 'coins' : 'flag',
            title: titles[type][0],
            subtitle: titles[type][1],
            big: prize, bigPrefix: '€',
            record: r,
            ratio: reached / 15,
            stats: [
                { label: 'Livello', value: reached + '/15' },
                { label: 'Risposte giuste', value: S.correct },
                { label: 'Tempo medio', value: avg.toFixed(1).replace('.', ',') + ' s' },
                { label: 'Aiuti usati', value: Object.keys(S.used).length + '/4' }
            ],
            share: type === 'win'
                ? 'Sono diventato milionario su Quizzotti: 15 domande di calcio su 15! Riesci a battermi?'
                : 'Ho vinto ' + money(prize) + ' a Chi Vuol Essere Milionario su Quizzotti, arrivando al livello ' + reached + '/15. Fai di meglio?',
            onRetry: start
        });
        if (prize >= 1000) setTimeout(function () { QZ.fx.rain('€', type === 'win' ? 40 : 18); }, 400);
    }
})();
