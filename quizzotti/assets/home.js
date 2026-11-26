/* ==========================================================================
   QUIZZOTTI — Prima pagina: l'album dei giochi generato dal registro
   QZ.GAMES, la sfida del giorno, gli ultimi giochi, i filtri, la striscia
   dell'ultim'ora e il gioco a sorpresa.
   ========================================================================== */
(function () {
    'use strict';

    var grid = QZ.$('#games');
    var FILTER_KEY = 'qz.home.filter';
    var GROUPS = [
        { kind: 'quiz', title: 'Da solo', sub: 'In pausa pranzo, in treno, prima di dormire.' },
        { kind: 'party', title: 'In compagnia', sub: 'Un telefono solo, da passarsi sul divano.' }
    ];
    var count = { all: QZ.GAMES.length, quiz: 0, party: 0 };
    QZ.GAMES.forEach(function (g) { count[g.kind] = (count[g.kind] || 0) + 1; });
    // argomento: i giochi di cultura generale hanno il tag, tutti gli altri sono di calcio
    function topicOf(g) { return (g.tags || []).indexOf('Cultura generale') !== -1 ? 'cultura' : 'calcio'; }
    var tcount = { calcio: 0, cultura: 0 };
    QZ.GAMES.forEach(function (g) { tcount[topicOf(g)]++; });

    QZ.$('#cta-games').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    QZ.$('#cta-random').innerHTML = QZ.icon('dice') + 'Gioco a sorpresa';
    QZ.$$('[data-icon]').forEach(function (el) { el.innerHTML = QZ.icon(el.dataset.icon); });
    QZ.$$('[data-n]').forEach(function (el) { el.textContent = count[el.dataset.n] || 0; });
    QZ.$$('[data-tn]').forEach(function (el) { el.textContent = tcount[el.dataset.tn] || 0; });
    // il numero dei giochi nel tabellino viene dal registro, non dal testo della pagina
    var factGames = QZ.$('#fact-games');
    if (factGames) factGames.dataset.count = QZ.GAMES.length;

    function sameDay(ts) {
        if (!ts) return false;
        var a = new Date(ts), b = new Date();
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }

    /* ---------- L'album dei giochi, in due gruppi ---------- */
    function cardHTML(g, profile) {
        var i = QZ.GAMES.indexOf(g);
        var plays = profile.gamesPlayed[g.id] || 0;
        return '<a class="game" href="' + g.file + '" data-kind="' + g.kind + '" data-topic="' + topicOf(g) + '" data-id="' + g.id + '" style="--c:' + g.color + ';--c-2:' + g.color2 + '">' +
            '<div class="game__band"><span class="game__num">N° ' + String(i + 1).padStart(2, '0') + '</span>' +
            (g.daily ? '<span class="game__daily">Ogni giorno</span>' : '') +
            '<span class="game__icon" style="color:' + g.on + '">' + QZ.icon(g.icon) + '</span></div>' +
            '<div class="game__body">' +
            '<h4 class="game__title">' + QZ.esc(g.name) + '</h4>' +
            '<p class="game__desc">' + QZ.esc(g.desc) + '</p>' +
            '<div class="game__foot"><span class="game__players">' + QZ.icon(g.kind === 'quiz' ? 'user' : 'users') + QZ.esc(g.players) + '</span>' +
            (plays ? '<span class="game__plays">' + QZ.icon('check') + plural(plays, 'giocato una volta', 'partite') + '</span>' : '') +
            '<span class="game__play" aria-hidden="true">Gioca' + QZ.icon('arrow') + '</span></div>' +
            '</div></a>';
    }

    function renderGrid() {
        var profile = QZ.profile.get();
        grid.innerHTML = GROUPS.map(function (grp) {
            var list = QZ.GAMES.filter(function (g) { return g.kind === grp.kind; });
            if (!list.length) return '';
            return '<div class="games__group" data-kind="' + grp.kind + '">' +
                '<h3>' + grp.title + ' <span class="games__n">' + list.length + '</span></h3>' +
                '<p class="faint">' + grp.sub + '</p></div>' +
                list.map(function (g) { return cardHTML(g, profile); }).join('');
        }).join('');
    }

    /* ---------- La sfida del giorno e "riprendi da dove eri" ---------- */
    function renderToday() {
        var profile = QZ.profile.get();
        var daily = QZ.GAMES.filter(function (g) { return g.daily; })[0];
        var box = QZ.$('#today-daily');
        if (!daily) { QZ.$('#today').hidden = true; return; }
        // il Giornale di oggi (Oggi.html) raccoglie tutti i giochi del giorno, uguali per tutti
        box.href = 'Oggi.html';
        box.style.setProperty('--c', daily.color);
        var date = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        var done = sameDay(profile.lastPlayed[daily.id]);
        QZ.$('#today-date').textContent = 'Il Giornale di oggi · ' + date;
        QZ.$('#today-title').textContent = 'I giochi del giorno';
        QZ.$('#today-text').textContent = done
            ? 'Il Calciatore del Giorno è fatto: ti aspettano la Scheda di Quattro per Quattro, l\'Intruso e Sopra o Sotto del giorno.'
            : 'Il Calciatore del Giorno, la Scheda di Quattro per Quattro, l\'Intruso e Sopra o Sotto: uguali per tutti, una volta al giorno.';
        QZ.$('#today-go').innerHTML = (done ? 'Continua il Giornale' : 'Apri il Giornale') + QZ.icon('arrow');
        box.classList.toggle('is-done', done);

        // gli ultimi tre giochi aperti, dal piu' recente (la sfida del giorno ha gia' il suo posto)
        var recent = QZ.GAMES.filter(function (g) { return profile.lastPlayed[g.id] && !g.daily; })
            .sort(function (a, b) { return profile.lastPlayed[b.id] - profile.lastPlayed[a.id]; })
            .slice(0, 3);
        var wrap = QZ.$('#today-recent');
        wrap.hidden = !recent.length;
        QZ.$('#recent-list').innerHTML = recent.map(function (g) {
            return '<a class="today__chip" href="' + g.file + '" style="--c:' + g.color + '">' +
                '<span class="today__chip-icon" aria-hidden="true">' + QZ.icon(g.icon) + '</span>' + QZ.esc(g.name) + '</a>';
        }).join('');
        QZ.$('#fact-level').textContent = QZ.profile.level();
    }

    renderGrid();
    renderToday();
    // profilo azzerato dalla bacheca o partita finita in un'altra scheda
    document.addEventListener('qz:profile', function () { renderToday(); renderGrid(); applyFilter(current, false); });

    /* ---------- Ultim'ora: due copie in fila per lo scorrimento senza stacchi ---------- */
    var news = [
        'Taboo: vietato dire «difesa» quando spieghi il catenaccio',
        'Mr. White è tra voi, e sorride',
        'Al Milionario la prima soglia sicura è a mille euro',
        'Bomba: la miccia è più corta di quanto sembra',
        'Avanti un Altro: sbagliare non è mai stato così difficile',
        'Derby delle Parole: chi la sa, tira in porta',
        'Sfida dei Budget: il presidente ha chiuso i cordoni della borsa',
        'Jeopardy: la doppia posta è nascosta da qualche parte',
        'Jeopardy normale: 14 categorie e 1.400 domande, con le foto',
        'Milionario normale: un milione di euro finti in cultura generale',
        'Nomi, Cose, Calcio: la TV fa da tabellone, i telefoni da foglio',
        'Cruciverba: doppia papera in finale di Champions, sei lettere',
        'Calciatore del Giorno: oggi tocca a uno nuovo, e domani pure',
        'Sopra o Sotto: il valore di mercato non guarda in faccia nessuno',
        'Caduta Libera: la botola si apre anche se passi troppo',
        'Quattro per Quattro: ne manca uno, come sempre',
        "L'Intruso: cinque sono amici, il sesto è un imbucato",
        'La Catena: da Baggio al codino è un attimo',
        'Bingo della Partita: il palo vale una casella'
    ];
    var items = news.map(function (n) { return '<span>' + QZ.esc(n) + '</span>'; }).join('');
    QZ.$('#ticker').innerHTML = items + items;

    /* ---------- Filtri (ricordati su questo telefono) e ricerca ---------- */
    var filters = QZ.$$('#filters button');
    var topics = QZ.$$('#topics button');
    var search = QZ.$('#games-q');
    var TOPIC_KEY = 'qz.home.topic';
    var current = 'all';
    var topic = 'all';
    var query = '';
    // per cercare senza badare a maiuscole e accenti («citta» trova «città»)
    function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
    var haystack = {};
    QZ.GAMES.forEach(function (g) { haystack[g.id] = norm([g.name, g.short, g.desc, g.players, (g.tags || []).join(' ')].join(' ')); });
    function visible(g) {
        if (current !== 'all' && g.kind !== current) return false;
        if (topic !== 'all' && topicOf(g) !== topic) return false;
        var q = norm(query);
        if (!q) return true;
        return q.split(' ').every(function (w) { return haystack[g.id].indexOf(w) !== -1; });
    }
    function applyFilter(f, animate) {
        if (!count[f]) f = 'all';
        current = f;
        filters.forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.f === f)); });
        topics.forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.t === topic)); });
        var i = 0;
        var shown = {};
        QZ.$$('.game', grid).forEach(function (card) {
            var show = visible(QZ.game(card.dataset.id) || {});
            // hidden: le figurine filtrate spariscono davvero, anche per i lettori di schermo
            card.hidden = !show;
            card.classList.toggle('is-hidden', !show);
            if (show) {
                shown[card.dataset.kind] = (shown[card.dataset.kind] || 0) + 1;
                // le figurine rimaste entrano una dopo l'altra
                card.style.setProperty('--i', i++);
                if (animate) {
                    card.style.animation = 'none';
                    void card.offsetWidth;
                    card.style.animation = '';
                }
            }
        });
        QZ.$$('.games__group', grid).forEach(function (h) {
            var n = shown[h.dataset.kind] || 0;
            h.hidden = !n;
            h.classList.toggle('is-hidden', !n);
            var badge = h.querySelector('.games__n');
            if (badge) badge.textContent = n;
        });
        var empty = QZ.$('.games-empty', grid);
        if (!i && !empty) {
            empty = QZ.el('<p class="games-empty"></p>');
            grid.appendChild(empty);
        }
        if (empty) {
            empty.hidden = !!i;
            empty.textContent = norm(query) ? 'Nessun gioco con «' + query.trim() + '». Prova un\'altra parola.' : 'Nessun gioco con questi filtri.';
        }
        return i;
    }
    function announce(n) {
        var parts = [];
        if (current !== 'all') parts.push(current === 'quiz' ? 'da solo' : 'in compagnia');
        if (topic !== 'all') parts.push(topic === 'calcio' ? 'di calcio' : 'di cultura generale');
        if (norm(query)) parts.push('con «' + query.trim() + '»');
        QZ.$('#filter-status').textContent = (parts.length ? 'Giochi ' + parts.join(', ') : 'Tutti i giochi') + ': ' + n;
    }
    filters.forEach(function (b) {
        b.addEventListener('click', function () {
            var n = applyFilter(b.dataset.f, true);
            QZ.store.set(FILTER_KEY, current);
            announce(n);
        });
    });
    topics.forEach(function (b) {
        b.addEventListener('click', function () {
            topic = b.dataset.t;
            var n = applyFilter(current, true);
            QZ.store.set(TOPIC_KEY, topic);
            announce(n);
        });
    });
    var searchTimer = null;
    if (search) {
        search.addEventListener('input', function () {
            query = search.value;
            var n = applyFilter(current, false);
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { announce(n); }, 500);
        });
        // Invio: se resta un gioco solo, si apre
        search.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var cards = QZ.$$('.game:not([hidden])', grid);
            if (cards.length === 1) window.location.href = cards[0].getAttribute('href');
        });
    }
    topic = QZ.store.get(TOPIC_KEY, 'all');
    if (topic !== 'calcio' && topic !== 'cultura') topic = 'all';
    applyFilter(QZ.store.get(FILTER_KEY, 'all'), false);

    /* ---------- Gioco a sorpresa: si pesca una figurina ---------- */
    var drawing = false;
    QZ.$('#cta-random').addEventListener('click', function () {
        // un tocco solo: col doppio tap si pescavano due figurine e due pagine
        if (drawing) return;
        drawing = true;
        // si pesca tra i giochi visibili col filtro scelto, e mai quello appena giocato
        var pool = QZ.GAMES.filter(visible);
        if (!pool.length) pool = QZ.GAMES.slice();
        var last = QZ.store.get('qz.home.lastRandom', null);
        if (pool.length > 1) pool = pool.filter(function (g) { return g.id !== last; });
        var g = QZ.pick(pool);
        QZ.store.set('qz.home.lastRandom', g.id);
        var card = QZ.$('.game[data-id="' + g.id + '"]', grid);
        if (!card) { window.location.href = g.file; return; }
        card.scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        setTimeout(function () {
            QZ.fx.stamp(card, 'Si gioca a questo!', 'ink', { size: 24, say: 'Si gioca a ' + g.name + '!' });
            setTimeout(function () { window.location.href = g.file; }, 900);
        }, 450);
    });
    // tornando indietro dalla pagina del gioco (cache del browser) il bottone deve funzionare di nuovo
    window.addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        drawing = false;
        QZ.$$('.qz-stamp', grid).forEach(function (s) { s.remove(); });
        renderToday();
    });

    /* ---------- Contatori del tabellino ---------- */
    QZ.$$('[data-count]').forEach(function (el) {
        QZ.fx.count(el, 0, Number(el.dataset.count), 1200, { suffix: el.dataset.suffix || '' });
    });
})();
