/* ==========================================================================
   QUIZZOTTI — Prima pagina: l'album dei giochi generato dal registro
   QZ.GAMES, i filtri, la striscia dell'ultim'ora e il gioco a sorpresa.
   ========================================================================== */
(function () {
    'use strict';

    var grid = QZ.$('#games');
    var profile = QZ.profile.get();
    // inclinazioni fisse ma irregolari: le figurine non sono mai attaccate dritte
    var TILTS = [-1.4, 0.9, -0.6, 1.3, -1.1, 0.5, 1.6, -0.8, 0.7, -1.5];

    QZ.$('#cta-games').innerHTML = 'Fischio d\'inizio' + QZ.icon('arrow');
    QZ.$('#cta-random').innerHTML = QZ.icon('dice') + 'Gioco a sorpresa';
    QZ.$$('[data-icon]').forEach(function (el) { el.innerHTML = QZ.icon(el.dataset.icon); });
    QZ.$('#fact-level').textContent = QZ.profile.level();

    grid.innerHTML = QZ.GAMES.map(function (g, i) {
        var plays = profile.gamesPlayed[g.id] || 0;
        return '<a class="game" href="' + g.file + '" data-kind="' + g.kind + '" style="--i:' + i + ';--tilt:' + TILTS[i] + 'deg;--c:' + g.color + ';--c-2:' + g.color2 + '">' +
            '<div class="game__band"><span class="game__num">N° ' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="game__icon" style="color:' + g.on + '">' + QZ.icon(g.icon) + '</span></div>' +
            (plays ? '<span class="note game__best">giocato ' + (plays === 1 ? 'una volta' : plays + ' volte') + '</span>' : '') +
            '<div class="game__body">' +
            '<h3 class="game__title">' + QZ.esc(g.name) + '</h3>' +
            '<p class="game__desc">' + QZ.esc(g.desc) + '</p>' +
            '<div class="game__foot"><span class="game__players">' + QZ.icon(g.kind === 'quiz' ? 'user' : 'users') + QZ.esc(g.players) + '</span>' +
            '<span class="game__play">Gioca' + QZ.icon('arrow') + '</span></div>' +
            '</div></a>';
    }).join('');

    // Ultim'ora: due copie in fila per lo scorrimento senza stacchi
    var news = [
        'Taboo: vietato dire «difesa» quando spieghi il catenaccio',
        'Mr. White è tra voi, e sorride',
        'Al Milionario la prima soglia sicura è a mille euro',
        'Bomba: la miccia è più corta di quanto sembra',
        'Avanti un Altro: sbagliare non è mai stato così difficile',
        'Derby delle Parole: chi la sa, tira in porta',
        'Sfida dei Budget: il presidente ha chiuso i cordoni della borsa',
        'Jeopardy: la doppia posta è nascosta da qualche parte'
    ];
    var items = news.map(function (n) { return '<span>' + QZ.esc(n) + '</span>'; }).join('');
    QZ.$('#ticker').innerHTML = items + items;

    // Filtri
    var filters = QZ.$$('#filters button');
    filters.forEach(function (b) {
        b.addEventListener('click', function () {
            filters.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            var f = b.dataset.f, i = 0;
            QZ.$$('.game', grid).forEach(function (card) {
                var show = f === 'all' || card.dataset.kind === f;
                card.classList.toggle('is-hidden', !show);
                if (show) {
                    // le figurine rimaste si riattaccano una dopo l'altra
                    card.style.setProperty('--i', i++);
                    card.style.animation = 'none';
                    card.getBoundingClientRect();
                    card.style.animation = '';
                }
            });
        });
    });

    // Gioco a sorpresa: si pesca una figurina
    var drawing = false;
    QZ.$('#cta-random').addEventListener('click', function () {
        // un tocco solo: col doppio tap si pescavano due figurine e due pagine
        if (drawing) return;
        drawing = true;
        var g = QZ.pick(QZ.GAMES);
        var card = QZ.$$('.game', grid)[QZ.GAMES.indexOf(g)];
        card.scrollIntoView({ behavior: QZ.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        setTimeout(function () {
            QZ.fx.stamp(card, 'Si gioca a questo!', 'ink', { size: 24, say: 'Si gioca a ' + g.name + '!' });
            setTimeout(function () { window.location.href = g.file; }, 900);
        }, 450);
    });

    // Contatori del tabellino
    QZ.$$('[data-count]').forEach(function (el) {
        QZ.fx.count(el, 0, Number(el.dataset.count), 1200, { suffix: el.dataset.suffix || '' });
    });
})();
