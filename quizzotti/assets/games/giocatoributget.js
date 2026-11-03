/* ==========================================================================
   QUIZZOTTI v2 — Sfida dei Budget
   Dati: assets/db-giocatoributget.js (`playersDatabase`, {name, role, team,
   value} con valore in milioni di euro).
   A turno ogni giocatore sceglie N calciatori dai valori nascosti cercando
   di avvicinarsi il piu' possibile al budget. Novita' rispetto alla v1:
   ricerca istantanea (nome, squadra, ruolo, senza accenti) con lista
   paginata invece di 1.269 card ridisegnate a ogni tasto, filtro per
   ruolo, passaggio del telefono tra i turni, regola "chi sfora perde",
   partita in solitaria e rivelazione dei valori uno alla volta.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'giocatoributget';
    var PAGE = 40;
    var BUDGET_MIN = 50, BUDGET_MAX = 1000, PICKS_MAX = 11;
    var ROLES = {
        POR: { label: 'Portiere', c: '#f5c542' },
        DIF: { label: 'Difensore', c: '#4f8cff' },
        CEN: { label: 'Centrocampista', c: '#2ee59d' },
        ATT: { label: 'Attaccante', c: '#ff4d6d' }
    };

    // indice di ricerca calcolato una volta sola
    var DB = playersDatabase.map(function (p, i) {
        var r = ROLES[p.role] || { label: p.role, c: '#a3abbd' };
        return { id: i, name: p.name, team: p.team, role: p.role, value: Number(p.value) || 0, key: QZ.norm(p.name + ' ' + p.team + ' ' + r.label) };
    });

    var set = Object.assign({ budget: 200, picks: 3, rule: 'near' }, QZ.store.get('qz.budget.settings', {}) || {});
    var G = null;

    /* ---------- Helper ---------- */
    function r1(x) { return Math.round(x * 10) / 10; }
    function money(v) { v = r1(v); return QZ.fmt(v, v % 1 ? 1 : 0) + ' M€'; }
    function signed(v) { v = r1(v); return (v > 0 ? '+' : v < 0 ? '−' : '±') + money(Math.abs(v)); }
    function roleBadge(p) { var r = ROLES[p.role] || {}; return '<span class="bg-role" style="--rc:' + (r.c || '#a3abbd') + '" title="' + QZ.esc(r.label || p.role) + '">' + QZ.esc(p.role) + '</span>'; }
    function cur() { return G.players[G.turn]; }
    function saveSet() { QZ.store.set('qz.budget.settings', set); }

    /* ---------- Markup statico + setup ---------- */
    $('#start-btn').innerHTML = QZ.icon('play', 'ico-fill') + 'Apri il mercato';
    $('#start-btn-2').innerHTML = QZ.icon('play', 'ico-fill') + 'Inizia la sfida';
    $('#medal').innerHTML = QZ.icon('coins');
    $('#randomize').innerHTML = QZ.icon('dice') + 'A caso';
    $('#rules').innerHTML = [
        ['Prezzi coperti:', 'scegli i calciatori senza vedere il loro valore di mercato.'],
        ['Un turno a testa:', 'completa la tua rosa, poi passa il telefono. Chi è già preso non si può scegliere.'],
        ['Avvicinati al budget:', 'vince chi chiude il mercato più vicino alla cifra.'],
        ['La resa dei conti:', 'i valori vengono svelati uno alla volta, fino alla classifica.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('.bg-search').insertAdjacentHTML('afterbegin', QZ.icon('search'));
    $('#p-exit').innerHTML = QZ.icon('x');
    $('#r-skip').innerHTML = QZ.icon('skip') + 'Salta animazione';
    $('#r-next').innerHTML = QZ.icon('trophy') + 'Classifica finale';
    ['budget', 'picks'].forEach(function (k) {
        $('#' + k + '-minus').innerHTML = QZ.icon('minus');
        $('#' + k + '-plus').innerHTML = QZ.icon('plus');
    });

    var plist = QZ.playerList($('#set-players'), { key: 'budget', min: 1, max: 6, initial: 2, label: 'Giocatore', title: 'Giocatori (1-6)' });

    var PRESETS = [100, 200, 300, 500, 1000];
    $('#budget-presets').innerHTML = PRESETS.map(function (v) { return '<button type="button" data-v="' + v + '">' + v + ' M€</button>'; }).join('');
    $('#budget-presets').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        setBudget(Number(b.dataset.v));
        QZ.sound.click();
    });
    $('#budget-minus').addEventListener('click', function () { setBudget(set.budget - (set.budget > 300 ? 50 : 10)); QZ.sound.click(); });
    $('#budget-plus').addEventListener('click', function () { setBudget(set.budget + (set.budget >= 300 ? 50 : 10)); QZ.sound.click(); });
    $('#picks-minus').addEventListener('click', function () { setPicks(set.picks - 1); QZ.sound.click(); });
    $('#picks-plus').addEventListener('click', function () { setPicks(set.picks + 1); QZ.sound.click(); });

    function setBudget(v) {
        set.budget = QZ.clamp(Math.round(v / 5) * 5, BUDGET_MIN, BUDGET_MAX);
        $('#budget-out').innerHTML = set.budget + '<small> M€</small>';
        $('#budget-minus').disabled = set.budget <= BUDGET_MIN;
        $('#budget-plus').disabled = set.budget >= BUDGET_MAX;
        QZ.$$('#budget-presets button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.v) === set.budget)); });
        saveSet();
    }
    function setPicks(v) {
        set.picks = QZ.clamp(v, 1, PICKS_MAX);
        $('#picks-out').textContent = set.picks;
        $('#picks-minus').disabled = set.picks <= 1;
        $('#picks-plus').disabled = set.picks >= PICKS_MAX;
        saveSet();
    }
    var RULE_HELP = {
        near: 'Conta solo la distanza dal budget, sopra o sotto è uguale (regola classica).',
        bust: 'Chi supera il budget finisce in fondo alla classifica, come al mercato vero.'
    };
    QZ.segmented($('#set-rule'), [{ label: 'Conta la distanza', value: 'near' }, { label: 'Chi sfora perde', value: 'bust' }], set.rule, function (v) {
        set.rule = v;
        $('#rule-help').textContent = RULE_HELP[v];
        saveSet();
    });
    $('#rule-help').textContent = RULE_HELP[set.rule] || RULE_HELP.near;
    setBudget(set.budget);
    setPicks(set.picks);

    // stessi intervalli della v1: budget 50-500 (multipli di 5), 1-6 calciatori
    $('#randomize').addEventListener('click', function () {
        setBudget(50 + QZ.rand(0, 90) * 5);
        setPicks(QZ.rand(1, 6));
        QZ.fx.pop($('#budget-out'));
        QZ.fx.pop($('#picks-out'));
        QZ.sound.pop();
    });

    var rec = QZ.profile.best(GAME);
    $('#start-record').textContent = rec != null ? 'La tua miglior precisione: ' + rec + '%' : '';

    $('#start-btn').addEventListener('click', start);
    $('#start-btn-2').addEventListener('click', start);

    /* ---------- Partita ---------- */
    function start() {
        var names = plist.get();
        G = {
            players: names.map(function (n, i) { return { name: n, color: QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length], picks: [] }; }),
            budget: set.budget, perUser: set.picks, rule: set.rule,
            turn: 0, order: QZ.shuffle(DB), takenBy: {}, q: '', role: 'ALL', shown: PAGE, token: 0
        };
        QZ.wake.on();
        QZ.sound.start();
        if (G.players.length > 1) handoff();
        else beginTurn();
    }

    function handoff() {
        var p = cur();
        var initial = (p.name.trim().charAt(0) || '?').toUpperCase();
        $('#hand').style.setProperty('--c', p.color);
        $('#hand').innerHTML =
            '<span class="eyebrow">Turno ' + (G.turn + 1) + ' di ' + G.players.length + '</span>' +
            '<div class="bg-avatar">' + QZ.esc(initial) + '</div>' +
            '<h2>Passa il telefono a <em>' + QZ.esc(p.name) + '</em></h2>' +
            '<p class="muted">Gli altri non sbircino! Scegli ' + G.perUser + (G.perUser === 1 ? ' calciatore' : ' calciatori') + ' con un budget di <b>' + money(G.budget) + '</b>.' +
            (G.turn > 0 ? ' I calciatori già presi dagli altri sono bloccati.' : '') + '</p>' +
            '<button class="btn btn--primary btn--xl" type="button" data-autofocus id="hand-go">' + QZ.icon('smartphone') + 'Sono ' + QZ.esc(p.name) + ', via!</button>';
        $('#hand-go').addEventListener('click', beginTurn);
        QZ.show('s-hand');
        QZ.sound.whoosh();
    }

    function beginTurn() {
        G.q = '';
        G.role = 'ALL';
        G.shown = PAGE;
        $('#p-search').value = '';
        QZ.segmented($('#p-roles'), [{ label: 'Tutti', value: 'ALL' }, { label: 'POR', value: 'POR' }, { label: 'DIF', value: 'DIF' }, { label: 'CEN', value: 'CEN' }, { label: 'ATT', value: 'ATT' }], 'ALL', function (v) {
            G.role = v;
            G.shown = PAGE;
            renderList();
        });
        var p = cur();
        var dot = $('#p-dot');
        dot.style.background = p.color;
        dot.textContent = G.turn + 1;
        $('#p-name').textContent = p.name;
        renderSquad();
        renderList();
        QZ.show('s-pick');
    }

    /** Calciatori filtrati: liberi prima, gia' presi dagli altri in fondo. */
    function filtered() {
        var terms = QZ.norm(G.q).split(' ').filter(Boolean);
        var role = G.role;
        var free = [], taken = [];
        for (var i = 0; i < G.order.length; i++) {
            var p = G.order[i];
            if (role !== 'ALL' && p.role !== role) continue;
            var ok = true;
            for (var t = 0; t < terms.length; t++) if (p.key.indexOf(terms[t]) < 0) { ok = false; break; }
            if (!ok) continue;
            (G.takenBy[p.id] != null ? taken : free).push(p);
        }
        return { list: free.concat(taken), free: free.length };
    }

    var renderQueued = false;
    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(function () { renderQueued = false; renderList(); });
    }

    function renderList() {
        var me = cur();
        var full = me.picks.length >= G.perUser;
        var f = filtered();
        var list = f.list.slice(0, G.shown);
        $('#p-list').innerHTML = list.length ? list.map(function (p) {
            var mine = me.picks.indexOf(p) >= 0;
            var owner = G.takenBy[p.id];
            var disabled = owner != null || (full && !mine);
            var sub = owner != null ? 'Già preso da ' + G.players[owner].name : p.team;
            return '<button type="button" class="bg-player" data-id="' + p.id + '" aria-pressed="' + mine + '"' + (disabled ? ' disabled' : '') + '>' +
                roleBadge(p) +
                '<span class="bg-player__info"><span class="bg-player__name" style="display:block">' + QZ.esc(p.name) + '</span>' +
                '<span class="bg-player__team" style="display:block">' + QZ.esc(sub) + '</span></span>' +
                '<span class="bg-player__state">' + QZ.icon(mine ? 'check' : owner != null ? 'lock' : 'plus') + '</span></button>';
        }).join('') : '<p class="bg-empty">Nessun calciatore trovato. Prova con il cognome o il nome della squadra.</p>';
        var n = f.list.length;
        $('#p-count').textContent = (G.q || G.role !== 'ALL' ? n + ' trovati' : QZ.fmt(n) + ' calciatori') + (f.free < n ? ' · ' + (n - f.free) + ' già presi' : '');
        var more = $('#p-more');
        more.hidden = n <= G.shown;
        more.textContent = 'Mostra altri ' + Math.min(PAGE, n - G.shown) + ' (' + (n - G.shown) + ' rimasti)';
    }

    function renderSquad() {
        var me = cur();
        var slots = '';
        for (var i = 0; i < G.perUser; i++) {
            var p = me.picks[i];
            slots += p
                ? '<div class="bg-slot is-full">' + roleBadge(p) + '<span class="bg-slot__name">' + QZ.esc(p.name) + '<small>' + QZ.esc(p.team) + '</small></span>' +
                  '<button class="qz-iconbtn" type="button" data-remove="' + p.id + '" aria-label="Togli ' + QZ.esc(p.name) + '">' + QZ.icon('x') + '</button></div>'
                : '<div class="bg-slot">' + QZ.icon('plus') + 'Posto ' + (i + 1) + ' libero</div>';
        }
        var box = $('#p-slots');
        box.innerHTML = slots;
        box.style.gridTemplateColumns = G.perUser > 4 && window.innerWidth >= 380 && window.innerWidth < 980 ? 'repeat(2, minmax(0, 1fr))' : '';
        $('#p-chips').innerHTML =
            '<span class="chip chip--accent">' + QZ.icon('coins') + 'Budget ' + money(G.budget) + '</span>' +
            '<span class="chip">' + QZ.icon('users') + me.picks.length + '/' + G.perUser + ' scelti</span>' +
            (G.players.length > 1 ? '<span class="chip">' + QZ.icon('flag') + 'Turno ' + (G.turn + 1) + '/' + G.players.length + '</span>' : '');
        var left = G.perUser - me.picks.length;
        var btn = $('#p-confirm');
        btn.disabled = left > 0;
        btn.innerHTML = left > 0
            ? 'Mancano ' + left + (left === 1 ? ' calciatore' : ' calciatori')
            : QZ.icon('check') + (G.turn < G.players.length - 1 ? 'Conferma e passa' : 'Conferma la squadra');
    }

    function toggle(id) {
        var me = cur();
        var p = DB[id];
        var i = me.picks.indexOf(p);
        if (i >= 0) {
            me.picks.splice(i, 1);
            QZ.sound.click();
        } else {
            if (G.takenBy[id] != null) return;
            if (me.picks.length >= G.perUser) { QZ.toast('Rosa completa: togli qualcuno per cambiare', { icon: 'info' }); return; }
            me.picks.push(p);
            QZ.sound.pop();
            QZ.vibrate(15);
            if (me.picks.length === G.perUser) {
                QZ.sound.coin();
                QZ.fx.pop($('#p-confirm'));
            }
        }
        renderSquad();
        renderList();
    }

    $('#p-list').addEventListener('click', function (e) {
        var b = e.target.closest('.bg-player');
        if (b && !b.disabled) toggle(Number(b.dataset.id));
    });
    $('#p-slots').addEventListener('click', function (e) {
        var b = e.target.closest('[data-remove]');
        if (b) toggle(Number(b.dataset.remove));
    });
    $('#p-search').addEventListener('input', function (e) {
        G.q = e.target.value;
        G.shown = PAGE;
        queueRender();
    });
    $('#p-search').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var first = QZ.$$('#p-list .bg-player').filter(function (b) { return !b.disabled && b.getAttribute('aria-pressed') === 'false'; })[0];
        if (first) {
            toggle(Number(first.dataset.id));
            e.target.select();
        }
    });
    $('#p-more').addEventListener('click', function () {
        G.shown += PAGE;
        renderList();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== '/' || !G || !$('#s-pick').classList.contains('is-active')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        $('#p-search').focus();
    });

    $('#p-confirm').addEventListener('click', function () {
        var me = cur();
        if (me.picks.length !== G.perUser) return;
        me.picks.forEach(function (p) { G.takenBy[p.id] = G.turn; });
        QZ.sound.whistle();
        G.turn++;
        if (G.turn < G.players.length) handoff();
        else reveal();
    });

    $('#p-exit').addEventListener('click', function () {
        QZ.confirm('Le squadre scelte finora andranno perse.', { title: 'Uscire dalla partita?', okLabel: 'Esci', cancelLabel: 'Resto', danger: true }).then(function (ok) {
            if (!ok) return;
            QZ.wake.off();
            G = null;
            QZ.show('s-start');
        });
    });

    /* ---------- Classifica ---------- */
    function spent(p) { return r1(p.picks.reduce(function (s, x) { return s + x.value; }, 0)); }

    function ranking() {
        var rows = G.players.map(function (p, i) {
            var s = spent(p), d = r1(s - G.budget);
            return { p: p, i: i, spent: s, diff: d, abs: Math.abs(d), bust: d > 0 };
        });
        rows.sort(function (a, b) {
            if (G.rule === 'bust' && a.bust !== b.bust) return a.bust ? 1 : -1;
            return a.abs - b.abs || a.i - b.i;
        });
        return rows;
    }

    function verdict(d) {
        if (d === 0) return 'Budget centrato in pieno!';
        if (d < 0) return 'Sotto di ' + money(-d);
        return 'Sforato di ' + money(d) + (G.rule === 'bust' ? ' · fuori dai giochi' : '');
    }

    /* ---------- La resa dei conti: valori svelati uno alla volta ---------- */
    function reveal() {
        var maxSpent = Math.max.apply(null, G.players.map(spent));
        G.scale = Math.max(G.budget * 1.3, maxSpent * 1.05);
        var mark = (G.budget / G.scale) * 100;
        $('#r-sub').textContent = 'Budget ' + money(G.budget) + ' · ' + (G.rule === 'bust' ? 'chi sfora perde' : 'conta la distanza');
        $('#r-cards').innerHTML = G.players.map(function (p, pi) {
            return '<div class="card card--tight bg-rcard" data-p="' + pi + '" style="--c:' + p.color + '">' +
                '<div class="bg-rhead"><span class="team__dot" style="--c:' + p.color + '"></span><b class="grow" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + QZ.esc(p.name) + '</b>' +
                '<span class="bg-rtotal" data-total>? M€</span></div>' +
                '<ul class="bg-rlist">' + p.picks.map(function (x, xi) {
                    return '<li>' + roleBadge(x) + '<span class="grow">' + QZ.esc(x.name) + ' <span class="small muted">· ' + QZ.esc(x.team) + '</span></span><span class="bg-rval" data-v="' + xi + '">? M€</span></li>';
                }).join('') + '</ul>' +
                '<div class="bg-meter" aria-hidden="true"><div class="bg-meter__fill"></div><div class="bg-meter__mark" style="left:calc(' + mark + '% - 1.5px)"></div></div>' +
                '<div class="bg-verdict" aria-live="polite"></div></div>';
        }).join('');
        $('#r-skip').hidden = false;
        $('#r-next').hidden = true;
        QZ.show('s-reveal');
        QZ.sound.reveal();
        var token = ++G.token;
        setTimeout(function () { runReveal(token); }, 700);
    }

    function card(pi) { return $('#r-cards [data-p="' + pi + '"]'); }

    function paintMeter(c, value) {
        var fill = c.querySelector('.bg-meter__fill');
        fill.style.width = Math.min(100, (value / G.scale) * 100) + '%';
        fill.classList.toggle('is-over', value > G.budget);
    }

    function paintDone(pi) {
        var p = G.players[pi], c = card(pi), s = spent(p), d = r1(s - G.budget);
        c.classList.remove('is-on');
        c.classList.add('is-done');
        p.picks.forEach(function (x, xi) {
            var v = c.querySelector('[data-v="' + xi + '"]');
            v.textContent = money(x.value);
            v.classList.add('is-shown');
        });
        c.querySelector('[data-total]').textContent = money(s);
        paintMeter(c, s);
        var vd = c.querySelector('.bg-verdict');
        vd.textContent = verdict(d);
        vd.className = 'bg-verdict ' + (d > 0 ? 'bad' : 'ok');
    }

    async function runReveal(token) {
        var alive = function () { return G && G.token === token; };
        var fast = QZ.reducedMotion();
        for (var pi = 0; pi < G.players.length; pi++) {
            var p = G.players[pi], c = card(pi);
            c.classList.add('is-on');
            c.scrollIntoView({ behavior: fast ? 'auto' : 'smooth', block: 'center' });
            await QZ.sleep(fast ? 50 : 600);
            if (!alive()) return;
            var step = QZ.clamp(Math.round(4200 / p.picks.length), 380, 900);
            var run = 0;
            var totalEl = c.querySelector('[data-total]');
            for (var xi = 0; xi < p.picks.length; xi++) {
                var x = p.picks[xi];
                var v = c.querySelector('[data-v="' + xi + '"]');
                var dec = x.value % 1 ? 1 : 0;
                v.classList.add('is-shown');
                QZ.fx.count(v, 0, x.value, step * 0.7, { decimals: dec, suffix: ' M€' });
                var from = run;
                run = r1(run + x.value);
                QZ.fx.count(totalEl, from, run, step * 0.7, { decimals: run % 1 ? 1 : 0, suffix: ' M€' });
                paintMeter(c, run);
                if (x.value >= 50) { QZ.sound.coin(); QZ.fx.sparks(v, null, 10); } else QZ.sound.tock();
                await QZ.sleep(fast ? 30 : step);
                if (!alive()) return;
            }
            var d = r1(run - G.budget);
            paintDone(pi);
            if (Math.abs(d) <= G.budget * 0.03) { QZ.sound.correct(); QZ.fx.sparks(totalEl, null, 22); }
            else if (d > 0) { QZ.sound.wrong(); QZ.fx.shake(c); }
            else QZ.sound.pop();
            await QZ.sleep(fast ? 50 : 900);
            if (!alive()) return;
        }
        revealDone();
    }

    function revealDone() {
        $('#r-skip').hidden = true;
        $('#r-next').hidden = false;
        $('#r-next').focus({ preventScroll: true });
        QZ.fx.pop($('#r-next'));
    }

    $('#r-skip').addEventListener('click', function () {
        if (!G) return;
        G.token++;
        G.players.forEach(function (p, pi) { paintDone(pi); });
        revealDone();
    });
    $('#r-next').addEventListener('click', finish);

    /* ---------- Fine partita ---------- */
    function finish() {
        QZ.wake.off();
        var rows = ranking();
        var w = rows[0];
        var acc = function (r) { return Math.max(0, r1(100 - (r.abs / G.budget) * 100)); };
        var wAcc = acc(w);
        var solo = G.players.length === 1;
        var allPicks = [].concat.apply([], G.players.map(function (p) { return p.picks.map(function (x) { return { x: x, who: p.name }; }); }));
        var top = allPicks.reduce(function (a, b) { return b.x.value > a.x.value ? b : a; }, allPicks[0]);

        var title, sub;
        if (solo) {
            title = w.diff === 0 ? 'Colpo da maestro!' : w.bust && G.rule === 'bust' ? 'Budget sforato' : wAcc >= 95 ? 'Occhio da direttore sportivo' : wAcc >= 85 ? 'Buon fiuto di mercato' : 'Mercato da rivedere';
            sub = 'Hai speso ' + money(w.spent) + ' su ' + money(G.budget) + ': ' + (w.diff === 0 ? 'centro perfetto!' : verdict(w.diff).toLowerCase() + '.');
        } else {
            title = 'Vince ' + w.p.name;
            sub = w.p.name + ' ha speso ' + money(w.spent) + ' su un budget di ' + money(G.budget) + (w.diff === 0 ? ': centro perfetto!' : ', a ' + money(w.abs) + ' di distanza.');
            if (G.rule === 'bust' && w.bust) sub += ' Avete sforato tutti: vince chi ha esagerato di meno.';
        }

        var podium = solo ? '' : '<div class="mt-3">' + QZ.podiumHTML(rows.map(function (r) {
            return { name: r.p.name, score: signed(r.diff), color: r.p.color, sub: 'Speso ' + money(r.spent) + (r.bust && G.rule === 'bust' ? ' · sforato' : '') };
        })) + '</div>';
        var detail = '<div class="bg-detail">' + rows.map(function (r, i) {
            return '<details' + (i === 0 ? ' open' : '') + '><summary>' + QZ.esc(solo ? 'La tua squadra' : r.p.name) + ' · ' + money(r.spent) + '</summary><ul class="bg-rlist">' +
                r.p.picks.slice().sort(function (a, b) { return b.value - a.value; }).map(function (x) {
                    return '<li>' + roleBadge(x) + '<span class="grow">' + QZ.esc(x.name) + ' <span class="small muted">· ' + QZ.esc(x.team) + '</span></span><span class="bg-rval is-shown" style="animation:none">' + money(x.value) + '</span></li>';
                }).join('') + '</ul></details>';
        }).join('') + '</div>';

        var picksTot = G.players.length * G.perUser;
        var xp = 10 + picksTot + Math.round(wAcc / 4) + (w.diff === 0 ? 25 : 0) + (solo ? 0 : G.players.length * 3);
        var r = QZ.profile.record(GAME, {
            xp: xp,
            label: (solo ? 'Precisione ' : 'Vince ' + w.p.name + ' · ') + QZ.fmt(wAcc, wAcc % 1 ? 1 : 0) + '%' + (solo ? '' : ' di precisione'),
            score: Math.round(wAcc)
        });

        QZ.show('s-end');
        QZ.results($('#end-host'), {
            win: !(solo && ((w.bust && G.rule === 'bust') || wAcc < 80)),
            icon: w.diff === 0 ? 'target' : solo ? 'coins' : 'trophy',
            title: title,
            subtitle: sub,
            big: w.spent, bigSuffix: ' M€', bigDecimals: w.spent % 1 ? 1 : 0,
            record: r,
            stats: [
                { label: 'Budget', value: money(G.budget) },
                { label: solo ? 'Distanza' : 'Distanza vincitore', value: signed(w.diff) },
                { label: 'Precisione', value: QZ.fmt(wAcc, wAcc % 1 ? 1 : 0) + '%' },
                { label: top ? 'Il più caro · ' + top.x.name.split(' ').slice(-1)[0] : 'Il più caro', value: top ? money(top.x.value) : '—' }
            ],
            extraHTML: podium + detail,
            share: solo
                ? 'Alla Sfida dei Budget di Quizzotti ho costruito una squadra da ' + money(w.spent) + ' con un budget di ' + money(G.budget) + ' (precisione ' + QZ.fmt(wAcc, wAcc % 1 ? 1 : 0) + '%). Ci vai più vicino?'
                : w.p.name + ' ha vinto la Sfida dei Budget su Quizzotti: ' + money(w.spent) + ' spesi su ' + money(G.budget) + '. Rivincita?',
            retryLabel: 'Nuova partita',
            onRetry: function () { QZ.show('s-start'); }
        });
        $('#start-record').textContent = 'La tua miglior precisione: ' + QZ.profile.best(GAME) + '%';
    }
})();
