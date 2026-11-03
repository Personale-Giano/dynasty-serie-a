/* ==========================================================================
   QUIZZOTTI v2 — Home: griglia giochi generata dal registro QZ.GAMES,
   filtri, card con luce che segue il puntatore e inclinazione 3D.
   ========================================================================== */
(function () {
    'use strict';

    var grid = QZ.$('#games');
    var profile = QZ.profile.get();

    QZ.$('#hero-eyebrow-ico').innerHTML = QZ.icon('ball');
    QZ.$('#cta-games').innerHTML = QZ.icon('play', 'ico-fill') + 'Gioca ora';
    QZ.$('#cta-random').innerHTML = QZ.icon('shuffle') + 'Gioco a sorpresa';
    QZ.$$('[data-icon]').forEach(function (el) { el.innerHTML = QZ.icon(el.dataset.icon); });
    QZ.$('#fact-level').textContent = QZ.profile.level();

    grid.innerHTML = QZ.GAMES.map(function (g, i) {
        var plays = profile.gamesPlayed[g.id] || 0;
        var best = profile.bestScores[g.id];
        return '<a class="game" href="' + g.file + '" data-kind="' + g.kind + '" style="--i:' + i + ';--c:' + g.color + ';--c-2:' + g.color2 + ';--c-rgb:' + g.rgb + '">' +
            '<div class="game__top"><div class="game__icon">' + QZ.icon(g.icon) + '</div>' +
            '<span class="chip">' + QZ.icon(g.kind === 'quiz' ? 'user' : 'users') + QZ.esc(g.players) + '</span></div>' +
            '<div><h3 class="game__title">' + QZ.esc(g.name) + '</h3>' +
            '<p class="game__desc mt-1">' + QZ.esc(g.desc) + '</p></div>' +
            '<div class="game__foot"><div>' +
            '<div class="game__tags">' + g.tags.map(function (t) { return '<span class="chip">' + QZ.esc(t) + '</span>'; }).join('') + '</div>' +
            (plays ? '<div class="game__best mt-1">' + plays + (plays === 1 ? ' partita' : ' partite') + (best && best.label ? ' · ' + QZ.esc(best.label) : '') + '</div>' : '') +
            '</div><span class="game__play" aria-hidden="true">' + QZ.icon('arrow') + '</span></div></a>';
    }).join('');

    // Marquee: nomi dei giochi ripetuti due volte per lo scorrimento infinito
    var items = QZ.GAMES.map(function (g) { return '<span>' + QZ.icon(g.icon) + QZ.esc(g.name) + '</span>'; }).join('');
    QZ.$('#marquee').innerHTML = items + items;

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
                    // riavvia l'animazione d'ingresso a cascata sulle card rimaste
                    card.style.setProperty('--i', i++);
                    card.style.animation = 'none';
                    void card.offsetWidth;
                    card.style.animation = '';
                }
            });
        });
    });

    // Gioco a sorpresa
    QZ.$('#cta-random').addEventListener('click', function () {
        var g = QZ.pick(QZ.GAMES);
        QZ.sound.whoosh();
        QZ.toast('Si gioca a ' + g.name + '!', { icon: g.icon });
        setTimeout(function () { window.location.href = g.file; }, 650);
    });

    // Luce che segue il puntatore + leggera inclinazione 3D (solo mouse)
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches && !QZ.reducedMotion();
    if (fine) {
        grid.addEventListener('pointermove', function (e) {
            var card = e.target.closest('.game');
            if (!card) return;
            var r = card.getBoundingClientRect();
            var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
            card.style.setProperty('--mx', (x * 100) + '%');
            card.style.setProperty('--my', (y * 100) + '%');
            card.style.setProperty('--rx', ((0.5 - y) * 6) + 'deg');
            card.style.setProperty('--ry', ((x - 0.5) * 8) + 'deg');
        });
        grid.addEventListener('pointerout', function (e) {
            var card = e.target.closest('.game');
            if (card && !card.contains(e.relatedTarget)) {
                card.style.setProperty('--rx', '0deg');
                card.style.setProperty('--ry', '0deg');
            }
        });
    }

    // Contatori del hero
    QZ.$$('[data-count]').forEach(function (el) {
        QZ.fx.count(el, 0, Number(el.dataset.count), 1400, { suffix: el.dataset.suffix || '' });
    });
})();
