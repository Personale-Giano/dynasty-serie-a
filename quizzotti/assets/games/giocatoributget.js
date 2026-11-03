/* ==========================================================================
   QUIZZOTTI v2 — Sfida dei Budget
   Dati: assets/db-giocatoributget.js (`playersDatabase`, {name, role, team,
   value} con valore in milioni di euro).
   A turno ogni giocatore sceglie N calciatori dai valori nascosti cercando
   di avvicinarsi il piu' possibile al budget. Ricerca istantanea (nome,
   squadra, ruolo, senza accenti) con lista paginata, filtro per ruolo,
   passaggio del telefono tra i turni, regola "chi sfora perde", partita in
   solitaria e rivelazione dei valori uno alla volta.
   Riflettori: il calciomercato come un tabellone dello stadio. I calciatori
   sono righe scure col ruolo a colori (POR, DIF, CEN, ATT), budget e posti
   da riempire stanno a LED, la rosa e' una distinta; alla resa dei conti i
   prezzi si accendono uno a uno, il totale corre e la barra della spesa
   sfida la linea del budget ("Centrato" / "Sforato"); il vincitore si
   illumina.
   ========================================================================== */
(function () {
    'use strict';

    var $ = QZ.$;
    var GAME = 'giocatoributget';
    var PAGE = 40;
    var BUDGET_MIN = 50, BUDGET_MAX = 1000, PICKS_MAX = 11;
    // un colore per ruolo, acceso come sul tabellone, con la scritta scura sopra
    var ROLES = {
        POR: { label: 'Portiere', c: '#ffb627', t: '#07090b' },
        DIF: { label: 'Difensore', c: '#4d8dff', t: '#07090b' },
        CEN: { label: 'Centrocampista', c: '#3ddc84', t: '#07090b' },
        ATT: { label: 'Attaccante', c: '#ff5a4a', t: '#07090b' }
    };
    var NO_ROLE = { label: '', c: '#84909a', t: '#07090b' };

    // indice di ricerca calcolato una volta sola
    var DB = playersDatabase.map(function (p, i) {
        var r = ROLES[p.role] || NO_ROLE;
        return { id: i, name: p.name, team: p.team, role: p.role, value: Number(p.value) || 0, key: QZ.norm(p.name + ' ' + p.team + ' ' + r.label + ' ' + p.role) };
    });

    var set = Object.assign({ budget: 200, picks: 3, rule: 'near' }, QZ.store.get('qz.budget.settings', {}) || {});
    var G = null;

    /* ---------- Helper ---------- */
    function r1(x) { return Math.round(x * 10) / 10; }
    function money(v) { v = r1(v); return QZ.fmt(v, v % 1 ? 1 : 0) + ' M€'; }
    function signed(v) { v = r1(v); return (v > 0 ? '+' : v < 0 ? '−' : '±') + money(Math.abs(v)); }
    function roleVars(role) { var r = ROLES[role] || NO_ROLE; return '--rc:' + r.c + ';--rt:' + r.t; }
    function roleBadge(p) { var r = ROLES[p.role] || NO_ROLE; return '<span class="bg-role" style="' + roleVars(p.role) + '" title="' + QZ.esc(r.label || p.role) + '">' + QZ.esc(p.role) + '</span>'; }
    function cur() { return G.players[G.turn]; }
    function saveSet() { QZ.store.set('qz.budget.settings', set); }

    /* ---------- Markup statico + setup ---------- */
    $('#start-btn').innerHTML = 'Apri il mercato' + QZ.icon('arrow');
    $('#start-btn-2').innerHTML = 'Si parte' + QZ.icon('arrow');
    $('#medal').innerHTML = QZ.icon('coins');
    $('#randomize').innerHTML = QZ.icon('dice') + 'A caso';
    $('#rules').innerHTML = [
        ['Cartellini coperti.', 'Scegli i calciatori senza vedere quanto costano. Vale l\'occhio, non il listino.'],
        ['Un turno a testa.', 'Fai la tua lista e passa il telefono. Chi è già preso resta all\'altro.'],
        ['Vince chi ci va più vicino', 'al budget, sopra o sotto. Con la regola dura chi sfora finisce in fondo.'],
        ['La resa dei conti:', 'i prezzi si accendono uno a uno sul tabellone, poi si tirano le somme.']
    ].map(function (r, i) {
        return '<li><span class="rules__n">' + (i + 1) + '</span><span><b>' + r[0] + '</b> ' + r[1] + '</span></li>';
    }).join('');
    $('.bg-search').insertAdjacentHTML('afterbegin', QZ.icon('search'));
    $('#p-clear').innerHTML = QZ.icon('x');
    $('#p-exit').innerHTML = QZ.icon('x');
    $('#r-skip').innerHTML = QZ.icon('skip') + 'Vai al sodo';
    $('#r-next').innerHTML = QZ.icon('trophy') + 'La classifica';
    ['budget', 'picks'].forEach(function (k) {
        $('#' + k + '-minus').innerHTML = QZ.icon('minus');
        $('#' + k + '-plus').innerHTML = QZ.icon('plus');
    });

    // initial: 2 solo alla prima visita; altrimenti playerList riempirebbe fino a 2
    // anche chi aveva salvato una partita in solitaria
    var savedNames = QZ.store.get('qz.names.budget', null);
    var plist = QZ.playerList($('#set-players'), { key: 'budget', min: 1, max: 6, initial: Array.isArray(savedNames) && savedNames.length ? 1 : 2, label: 'Giocatore', title: 'Chi gioca (1-6)' });

    var PRESETS = [100, 200, 300, 500, 1000];
    $('#budget-presets').innerHTML = PRESETS.map(function (v) { return '<button type="button" data-v="' + v + '">' + QZ.fmt(v) + ' M€</button>'; }).join('');
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
        near: 'Conta solo la distanza dal budget: sopra o sotto è uguale. La regola classica.',
        bust: 'Chi supera il budget finisce in fondo alla classifica. Come al mercato vero.'
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

    function paintStartRecord() {
        var rec = QZ.profile.best(GAME);
        $('#start-record').textContent = rec != null ? 'La tua miglior precisione: ' + rec + '%' : '';
    }
    paintStartRecord();

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
        var hand = $('#hand');
        hand.style.setProperty('--c', p.color);
        hand.innerHTML =
            '<span class="eyebrow">Turno ' + (G.turn + 1) + ' di ' + G.players.length + '</span>' +
            '<div class="bg-shirt" aria-hidden="true"><span class="bg-shirt__n">In panchina</span>' +
            '<span class="bg-shirt__dot" style="color:' + QZ.onColor(p.color) + '">' + QZ.esc(initial) + '</span><span class="bg-shirt__name">' + QZ.esc(p.name) + '</span></div>' +
            '<h2>Passa il telefono a <em>' + QZ.esc(p.name) + '</em></h2>' +
            '<p>Gli altri guardano altrove. Scegli ' + G.perUser + (G.perUser === 1 ? ' calciatore' : ' calciatori') + ' con <b>' + money(G.budget) + '</b> in cassa.' +
            (G.turn > 0 ? ' Chi è già stato preso è fuori mercato.' : '') + '</p>' +
            '<button class="btn btn--primary btn--xl" type="button" data-autofocus id="hand-go">Tocca a me' + QZ.icon('arrow') + '</button>';
        $('#hand-go').addEventListener('click', beginTurn);
        QZ.show('s-hand');
        QZ.say('Turno ' + (G.turn + 1) + ' di ' + G.players.length + ': passa il telefono a ' + p.name + '.');
        QZ.sound.whoosh();
    }

    var ROLE_OPTS = [{ label: 'Tutti', value: 'ALL' }, { label: 'POR', value: 'POR' }, { label: 'DIF', value: 'DIF' }, { label: 'CEN', value: 'CEN' }, { label: 'ATT', value: 'ATT' }];

    function beginTurn() {
        if (!G || $('#s-pick').classList.contains('is-active')) return;   // doppio tocco su "Tocca a me"
        G.closing = false;
        G.q = '';
        G.role = 'ALL';
        G.shown = PAGE;
        $('#p-search').value = '';
        $('#p-clear').hidden = true;
        QZ.segmented($('#p-roles'), ROLE_OPTS, 'ALL', function (v) {
            G.role = v;
            G.shown = PAGE;
            renderList();
        });
        // il filtro acceso prende il colore del ruolo
        QZ.$$('#p-roles button').forEach(function (b, i) { if (i) b.setAttribute('style', roleVars(ROLE_OPTS[i].value)); });
        var p = cur();
        var dot = $('#p-dot');
        dot.style.background = p.color;
        dot.style.color = QZ.onColor(p.color);
        dot.textContent = G.turn + 1;
        $('#p-name').textContent = p.name;
        $('#p-label').textContent = G.players.length > 1 ? 'Turno ' + (G.turn + 1) + ' di ' + G.players.length : 'Sta comprando';
        $('#p-budget').textContent = money(G.budget);
        renderSquad();
        renderList();
        QZ.show('s-pick');
        // "Tocca a me" sparisce con la schermata: il fuoco va alla ricerca (tastiera)
        // o al nome di chi compra (touch, senza aprire la tastiera del telefono)
        var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        setTimeout(function () { $(fine ? '#p-search' : '#p-name').focus({ preventScroll: true }); }, 260);
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
            var sub = owner != null ? 'Preso da ' + G.players[owner].name : p.team;
            return '<button type="button" class="bg-player' + (owner != null ? ' is-taken' : '') + '" data-id="' + p.id + '" aria-pressed="' + mine + '"' + (disabled ? ' disabled' : '') + '>' +
                roleBadge(p) +
                '<span class="bg-player__info"><span class="bg-player__name">' + QZ.esc(p.name) + '</span>' +
                '<span class="bg-player__team">' + QZ.esc(sub) + '</span></span>' +
                '<span class="bg-player__state"><span>' + QZ.icon(mine ? 'check' : owner != null ? 'lock' : 'plus') + '</span></span></button>';
        }).join('') : '<p class="bg-empty">Nessuno con questo nome. Prova col cognome o con la squadra.</p>';
        var n = f.list.length;
        var countTxt = (G.q || G.role !== 'ALL' ? QZ.fmt(n) + (n === 1 ? ' trovato' : ' trovati') : QZ.fmt(n) + ' calciatori') + (f.free < n ? ' · ' + (n - f.free) + ' già presi' : '');
        // e' una regione live: si riscrive solo quando il conteggio cambia davvero
        if ($('#p-count').textContent !== countTxt) $('#p-count').textContent = countTxt;
        var more = $('#p-more');
        more.hidden = n <= G.shown;
        more.textContent = 'Altri ' + Math.min(PAGE, n - G.shown) + ' (ne restano ' + (n - G.shown) + ')';
    }

    function renderSquad(added) {
        var me = cur();
        var slots = '';
        for (var i = 0; i < G.perUser; i++) {
            var p = me.picks[i];
            slots += p
                ? '<li class="bg-slot is-full' + (p === added ? ' is-new' : '') + '"><span class="bg-slot__n">' + (i + 1) + '</span>' + roleBadge(p) +
                  '<span class="bg-slot__name">' + QZ.esc(p.name) + '<small>' + QZ.esc(p.team) + '</small></span><span class="bg-slot__price">? M€</span>' +
                  '<button class="qz-iconbtn" type="button" data-remove="' + p.id + '" aria-label="Togli ' + QZ.esc(p.name) + '">' + QZ.icon('x') + '</button></li>'
                : '<li class="bg-slot is-empty"><span class="bg-slot__n">' + (i + 1) + '</span><span class="bg-slot__name">da scegliere</span></li>';
        }
        $('#p-slots').innerHTML = slots;
        var left = G.perUser - me.picks.length;
        var lf = $('#p-left');
        lf.innerHTML = left + '<small>/' + G.perUser + '</small>';
        lf.classList.toggle('is-full', left === 0);
        var btn = $('#p-confirm');
        btn.disabled = left > 0;
        btn.innerHTML = left > 0
            ? (left === 1 ? 'Ne manca 1' : 'Ne mancano ' + left)
            : QZ.icon('check') + (G.turn < G.players.length - 1 ? 'Chiudo la lista e passo' : 'Chiudo il mercato');
    }

    function toggle(id) {
        var me = cur();
        var p = DB[id];
        var i = me.picks.indexOf(p);
        var added = null;
        // la lista e la rosa si ridisegnano: ci si segna dov'era il fuoco per rimettercelo
        var act = document.activeElement;
        var fromList = act && act.closest && act.closest('#p-list');
        var fromSlots = act && act.closest && act.closest('#p-slots');
        if (i >= 0) {
            me.picks.splice(i, 1);
            QZ.sound.click();
        } else {
            if (G.takenBy[id] != null) return;
            if (me.picks.length >= G.perUser) { QZ.toast('Rosa piena. Per cambiare, prima ne togli uno.', { icon: 'info' }); return; }
            me.picks.push(p);
            added = p;
            QZ.sound.pop();
            QZ.vibrate(15);
            if (me.picks.length === G.perUser) {
                QZ.sound.coin();
                QZ.fx.pop($('#p-confirm'));
            }
        }
        renderSquad(added);
        renderList();
        var left = G.perUser - me.picks.length;
        QZ.say((added ? 'Preso ' : 'Tolto ') + p.name + '. ' + (left ? (left === 1 ? 'Ne manca 1.' : 'Ne mancano ' + left + '.') : 'Rosa completa.'));
        if (fromList) {
            var again = $('#p-list [data-id="' + id + '"]');
            (again && !again.disabled ? again : $('#p-search')).focus({ preventScroll: true });
        } else if (fromSlots) {
            ($('#p-slots [data-remove]') || $('#p-search')).focus({ preventScroll: true });
        }
    }

    function setQuery(v) {
        G.q = v;
        G.shown = PAGE;
        $('#p-clear').hidden = !v;
        queueRender();
    }

    $('#p-list').addEventListener('click', function (e) {
        var b = e.target.closest('.bg-player');
        if (b && !b.disabled) toggle(Number(b.dataset.id));
    });
    $('#p-slots').addEventListener('click', function (e) {
        var b = e.target.closest('[data-remove]');
        if (b) toggle(Number(b.dataset.remove));
    });
    $('#p-search').addEventListener('input', function (e) { setQuery(e.target.value); });
    $('#p-clear').addEventListener('click', function () {
        $('#p-search').value = '';
        setQuery('');
        $('#p-search').focus();
    });
    $('#p-search').addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.target.value = ''; setQuery(''); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var first = QZ.$$('#p-list .bg-player').filter(function (b) { return !b.disabled && b.getAttribute('aria-pressed') === 'false'; })[0];
        if (first) {
            toggle(Number(first.dataset.id));
            e.target.select();
        }
    });
    $('#p-more').addEventListener('click', function () {
        var from = G.shown;
        G.shown += PAGE;
        renderList();
        // il fuoco va sul primo dei nuovi, non resta su un bottone che puo' sparire
        var first = QZ.$$('#p-list .bg-player')[from];
        if (first) first.focus({ preventScroll: true });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== '/' || !G || !$('#s-pick').classList.contains('is-active') || document.querySelector('.qz-modal')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        $('#p-search').focus();
    });

    $('#p-confirm').addEventListener('click', function () {
        if (!G || G.closing) return;   // doppio tocco: non si salta il turno di nessuno
        var me = cur();
        if (me.picks.length !== G.perUser) return;
        G.closing = true;
        me.picks.forEach(function (p) { G.takenBy[p.id] = G.turn; });
        QZ.sound.whistle();
        G.turn++;
        if (G.turn < G.players.length) handoff();
        else reveal();
    });

    $('#p-exit').addEventListener('click', function () {
        QZ.confirm('Le liste fatte finora finiscono nel cestino.', { title: 'Abbandoni il mercato?', okLabel: 'Esco', cancelLabel: 'Resto', danger: true }).then(function (ok) {
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
        if (d === 0) return 'Budget centrato al milione';
        if (d < 0) return 'Avanzano ' + money(-d);
        return 'Sforato di ' + money(d) + (G.rule === 'bust' ? ' · fuori dai giochi' : '');
    }

    /* ---------- La resa dei conti: i prezzi si accendono uno alla volta ---------- */
    function reveal() {
        var maxSpent = Math.max.apply(null, G.players.map(spent));
        G.scale = Math.max(G.budget * 1.3, maxSpent * 1.05);
        var mark = (G.budget / G.scale) * 100;
        $('#r-sub').textContent = 'Budget ' + money(G.budget) + ' · ' + (G.rule === 'bust' ? 'chi sfora perde' : 'conta la distanza');
        $('#r-cards').innerHTML = G.players.map(function (p, pi) {
            return '<div class="card bg-rcard" data-p="' + pi + '" style="--c:' + p.color + '">' +
                '<div class="bg-rhead"><span class="team__dot" style="--c:' + p.color + '"></span><span class="bg-rhead__name">' + QZ.esc(G.players.length > 1 ? p.name : 'La tua squadra') + '</span>' +
                '<span class="bg-rhead__win led led--green" hidden>VINCE</span></div>' +
                '<ul class="bg-rlist">' + p.picks.map(function (x, xi) {
                    return '<li>' + roleBadge(x) + '<span class="grow"><b>' + QZ.esc(x.name) + '</b> <span class="small muted">· ' + QZ.esc(x.team) + '</span></span>' +
                        '<span class="bg-rval" data-v="' + xi + '">? M€</span></li>';
                }).join('') + '</ul>' +
                '<div class="bg-rtot"><span>Totale</span><b data-total>0 M€</b></div>' +
                '<div class="bg-meter" aria-hidden="true"><div class="bg-meter__fill"></div><div class="bg-meter__mark" style="left:' + mark + '%"></div></div>' +
                '<div class="bg-rfoot"><div class="bg-verdict"></div>' +
                '<span class="bg-rcard__stamp" aria-hidden="true"></span></div></div>';
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

    function stampPrice(v, x, quiet) {
        v.textContent = money(x.value);
        v.classList.add('is-shown');
        v.classList.toggle('is-big', x.value >= 50);
        v.classList.toggle('is-quiet', !!quiet);
    }

    /** Chiude il conto di un giocatore; quiet = senza animazioni ne' timbri sonori. */
    function paintDone(pi, quiet) {
        var p = G.players[pi], c = card(pi), s = spent(p), d = r1(s - G.budget);
        c.classList.remove('is-on');
        c.classList.add('is-done');
        p.picks.forEach(function (x, xi) {
            var v = c.querySelector('[data-v="' + xi + '"]');
            if (!v.classList.contains('is-shown')) stampPrice(v, x, quiet);
        });
        c.querySelector('[data-total]').textContent = money(s);
        paintMeter(c, s);
        c.classList.toggle('is-over', d > 0);
        c.classList.toggle('is-ok', Math.abs(d) <= G.budget * 0.03 && d <= 0);
        var vd = c.querySelector('.bg-verdict');
        vd.textContent = verdict(d);
        vd.className = 'bg-verdict ' + (d > 0 ? 'bad' : 'ok');
        var holder = c.querySelector('.bg-rcard__stamp');
        if (!holder.firstChild) {
            var near = Math.abs(d) <= G.budget * 0.03;
            if (near || d > 0) {
                if (quiet) {
                    holder.innerHTML = '<span class="qz-stamp qz-stamp--' + (near ? 'ok' : 'bad') + '" style="--stamp-size:18px;animation:none">' + (near ? 'Centrato' : 'Sforato') + '</span>';
                } else {
                    QZ.fx.stamp(holder, near ? 'Centrato' : 'Sforato', near ? 'ok' : 'bad', { size: 18, say: false });
                }
            }
        }
        // il conto di ognuno si annuncia per intero (chi, quanto, com'e' andata); col "vai al sodo" basta la classifica
        // (a movimento ridotto i conti si chiudono troppo in fretta: li riassume revealDone)
        if (!quiet && !QZ.reducedMotion()) QZ.say(account(pi));
    }
    function account(pi) {
        var p = G.players[pi], s = spent(p);
        return (G.players.length > 1 ? p.name + ': ' : 'Hai ') + 'speso ' + money(s) + '. ' + verdict(r1(s - G.budget)) + '.';
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
            var step = QZ.clamp(Math.round(4200 / p.picks.length), 420, 900);
            var run = 0;
            var totalEl = c.querySelector('[data-total]');
            for (var xi = 0; xi < p.picks.length; xi++) {
                var x = p.picks[xi];
                stampPrice(c.querySelector('[data-v="' + xi + '"]'), x, fast);
                QZ.sound.thud();
                if (x.value >= 50) QZ.sound.coin();
                var from = run;
                run = r1(run + x.value);
                QZ.fx.count(totalEl, from, run, step * 0.6, { decimals: run % 1 ? 1 : 0, suffix: ' M€' });
                paintMeter(c, run);
                await QZ.sleep(fast ? 30 : step);
                if (!alive()) return;
            }
            var d = r1(run - G.budget);
            paintDone(pi);
            if (Math.abs(d) <= G.budget * 0.03) QZ.sound.correct();
            else if (d > 0) { QZ.sound.wrong(); QZ.fx.shake(c); }
            await QZ.sleep(fast ? 50 : 1000);
            if (!alive()) return;
        }
        revealDone(QZ.reducedMotion());
    }

    function revealDone(full) {
        $('#r-skip').hidden = true;
        $('#r-next').hidden = false;
        // il vincitore si illumina
        if (G.players.length > 1) {
            var wc = card(ranking()[0].i);
            if (!wc.classList.contains('is-winner')) {
                wc.classList.add('is-winner');
                wc.querySelector('.bg-rhead__win').hidden = false;
                if (!full) QZ.sound.levelUp();
            }
        }
        // full: i conti non sono stati annunciati uno a uno (salto o movimento ridotto)
        var all = full ? G.players.map(function (p, pi) { return account(pi); }).join(' ') + ' ' : '';
        QZ.say('Cartellini scoperti. ' + all + (G.players.length > 1 ? 'Il più vicino al budget è ' + ranking()[0].p.name + '.' : ''));
        $('#r-next').focus({ preventScroll: true });
        QZ.fx.pop($('#r-next'));
    }

    $('#r-skip').addEventListener('click', function () {
        if (!G) return;
        G.token++;
        G.players.forEach(function (p, pi) { paintDone(pi, true); });
        revealDone(true);
    });
    $('#r-next').addEventListener('click', finish);

    /* ---------- Fine partita ---------- */
    function finish() {
        if (!G || G.finished) return;   // doppio tocco su "La classifica": un referto solo
        G.finished = true;
        QZ.wake.off();
        var rows = ranking();
        var w = rows[0];
        var acc = function (r) { return Math.max(0, r1(100 - (r.abs / G.budget) * 100)); };
        var wAcc = acc(w);
        var solo = G.players.length === 1;
        var allPicks = [].concat.apply([], G.players.map(function (p) { return p.picks.map(function (x) { return { x: x, who: p.name }; }); }));
        var top = allPicks.reduce(function (a, b) { return b.x.value > a.x.value ? b : a; }, allPicks[0]);
        var busted = w.bust && G.rule === 'bust';

        var title, sub;
        if (solo) {
            title = w.diff === 0 ? 'Colpo da maestro' : busted ? 'Il presidente non firma' : wAcc >= 95 ? 'Occhio da direttore sportivo' : wAcc >= 85 ? 'Buon fiuto' : 'Mercato da rivedere';
            sub = 'Hai speso ' + money(w.spent) + ' su ' + money(G.budget) + '. ' + verdict(w.diff) + '.';
        } else {
            title = 'Vince ' + w.p.name;
            sub = w.p.name + ' ha speso ' + money(w.spent) + ' su ' + money(G.budget) + (w.diff === 0 ? ': centrato al milione.' : ', a ' + money(w.abs) + ' dalla cifra.');
            if (busted) sub += ' Avete sforato tutti: vince chi ha esagerato di meno.';
        }

        var podium = solo ? '' : '<div class="mt-3">' + QZ.podiumHTML(rows.map(function (r) {
            return { name: r.p.name, score: signed(r.diff), color: r.p.color, sub: 'Speso ' + money(r.spent) + (r.bust && G.rule === 'bust' ? ' · sforato' : '') };
        })) + '</div>';
        var detail = '<div class="bg-detail">' + rows.map(function (r, i) {
            return '<details' + (i === 0 ? ' open' : '') + '><summary>' + QZ.esc(solo ? 'La tua squadra' : r.p.name) + ' · ' + money(r.spent) + '</summary><ul class="bg-rlist">' +
                r.p.picks.slice().sort(function (a, b) { return b.value - a.value; }).map(function (x) {
                    return '<li>' + roleBadge(x) + '<span class="grow"><b>' + QZ.esc(x.name) + '</b> <span class="small muted">· ' + QZ.esc(x.team) + '</span></span><span class="bg-rval">' + money(x.value) + '</span></li>';
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
            win: !(solo && (busted || wAcc < 80)),
            icon: w.diff === 0 ? 'target' : solo ? 'coins' : 'trophy',
            title: title,
            subtitle: sub,
            big: w.spent, bigSuffix: ' M€', bigDecimals: w.spent % 1 ? 1 : 0,
            record: r,
            // pagella: sotto il 60% di precisione e' un 4, al centesimo un 10
            ratio: busted ? 0.1 : QZ.clamp((wAcc - 60) / 40, 0, 1),
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
            retryLabel: solo ? 'Rigioca' : 'Rivincita',
            onRetry: start,
            secondary: { label: 'Cambia regole', icon: 'list', onClick: function () { QZ.show('s-start'); setTimeout(function () { $('#setup').scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }, 450); } }
        });
        paintStartRecord();
    }
})();
