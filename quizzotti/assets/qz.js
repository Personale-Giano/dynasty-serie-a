/* ==========================================================================
   QUIZZOTTI v2 — Motore condiviso
   Un solo script per home e 10 giochi: header/menu/footer generati da qui
   (niente piu' HTML duplicato in ogni pagina), icone SVG inline (niente
   Font Awesome), suoni sintetizzati, profilo XP, timer, effetti e
   componenti UI. Ogni pagina dichiara il suo gioco con <body data-game="id">.
   ========================================================================== */
(function (global) {
    'use strict';

    var doc = global.document;
    var QZ = {};

    /* ---------------------------------------------------------------------
       Registro giochi: unica fonte di verita' per home, launcher e profilo
       ------------------------------------------------------------------- */
    QZ.GAMES = [
        { id: 'cvem', file: 'CVEM.html', name: 'Chi Vuol Essere Milionario', short: 'Milionario', icon: 'crown', color: '#ffb627', color2: '#ffd36e', on: '#07090b', rgb: '255, 182, 39', players: 'Da solo', kind: 'quiz', desc: 'Quindici domande, quattro aiuti, un milione di euro finti. Il sudore invece è vero.', tags: ['Quiz', 'Aiuti', '15 livelli'] },
        { id: 'jeopardy', file: 'Jeopardy.html', name: 'Jeopardy', short: 'Jeopardy', icon: 'grid', color: '#4d8dff', color2: '#9cc0ff', on: '#07090b', rgb: '77, 141, 255', players: '1-6 squadre', kind: 'party', desc: 'Il tabellone a categorie per la serata con gli amici. Chi sbaglia, paga in punti.', tags: ['Squadre', 'Categorie', 'Punti'] },
        { id: 'avantiunaltro', file: 'AvantiUnAltro.html', name: 'Avanti un Altro', short: 'Avanti un Altro', icon: 'fastforward', color: '#ff7a2f', color2: '#ffb07f', on: '#07090b', rgb: '255, 122, 47', players: 'Da solo', kind: 'quiz', desc: 'Qui vince chi sbaglia: scegli sempre la risposta sbagliata. Facile a dirsi.', tags: ['Quiz', 'Al contrario', 'Velocità'] },
        { id: 'citazioni', file: 'Citazioni.html', name: "Chi l'ha detto", short: "Chi l'ha detto", icon: 'quote', color: '#b48cff', color2: '#d8c4ff', on: '#07090b', rgb: '180, 140, 255', players: 'Da solo', kind: 'quiz', desc: '«Zero tituli», «Why always me?»… Le frasi le conosci. Ma chi le ha dette?', tags: ['Frasi celebri', 'Quiz'] },
        { id: 'taboo', file: 'Taboo.html', name: 'Taboo', short: 'Taboo', icon: 'ban', color: '#ff4b5c', color2: '#ff98a2', on: '#07090b', rgb: '255, 75, 92', players: '2-6 squadre', kind: 'party', desc: 'Fai indovinare «Catenaccio» senza dire difesa, Italia e chiuso. Auguri.', tags: ['Squadre', 'Parole', 'Timer'] },
        { id: 'intesavincente', file: 'IntesaVincente.html', name: 'Intesa Vincente', short: 'Intesa Vincente', icon: 'users', color: '#2fd0ff', color2: '#8fe6ff', on: '#07090b', rgb: '47, 208, 255', players: '2-6 squadre', kind: 'party', desc: 'Uno spiega, gli altri prenotano e rispondono. Il cronometro non fa sconti.', tags: ['Squadre', 'Parole', 'Timer'] },
        { id: 'mrwhite', file: 'MrWhite.html', name: 'Mr. White', short: 'Mr. White', icon: 'spy', color: '#e8eef2', color2: '#ffffff', on: '#07090b', rgb: '232, 238, 242', players: '3+ giocatori', kind: 'party', desc: 'Tutti sanno chi è il calciatore segreto. Tutti tranne uno, che fa finta di saperlo.', tags: ['Bluff', 'Deduzione', 'Ruoli'] },
        { id: 'bomba', file: 'Bomba.html', name: 'Bomba', short: 'Bomba', icon: 'bomb', color: '#ff4b3a', color2: '#ffa094', on: '#07090b', rgb: '255, 75, 58', players: '2+ giocatori', kind: 'party', desc: 'Un tema e una bomba che passa di mano in mano. Quando scoppia, qualcuno ci resta.', tags: ['Turni', 'Tempo', 'Eliminazione'] },
        { id: 'sfidaeredita', file: 'sfidaEredita.html', name: 'Derby delle Parole', short: 'Derby', icon: 'ball', color: '#3ddc84', color2: '#9cf0c0', on: '#07090b', rgb: '61, 220, 132', players: '2 squadre', kind: 'party', desc: 'Una definizione, le lettere che spuntano piano piano. Chi la sa, tira in porta.', tags: ['Definizioni', 'Squadre', 'Voce'] },
        { id: 'giocatoributget', file: 'GiocatoriBudget.html', name: 'Sfida dei Budget', short: 'Budget', icon: 'coins', color: '#c6f04d', color2: '#e0f8a0', on: '#07090b', rgb: '198, 240, 77', players: '1-6 giocatori', kind: 'party', desc: 'Fai mercato a occhio: i prezzi sono nascosti e il presidente non perdona.', tags: ['Mercato', 'Strategia', 'Budget'] }
    ];

    QZ.game = function (id) {
        for (var i = 0; i < QZ.GAMES.length; i++) if (QZ.GAMES[i].id === id) return QZ.GAMES[i];
        return null;
    };

    /* Colori per squadre/giocatori (party game) */
    // colori delle maglie: tutti reggono un numero bianco sopra
    QZ.TEAM_COLORS = ['#d9342b', '#2f6fe0', '#1f9d55', '#b8800a', '#8a55e0', '#d9611c', '#1a8fbf', '#b02a5c', '#2a8f86', '#6f7a83'];
    /** Colore del testo da stampare su una tinta: inchiostro sulle tinte chiare (oro, arancio), panna sulle scure. */
    QZ.onColor = function (hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        if (!m) return '#fbf6ec';
        var lum = [m[1], m[2], m[3]].map(function (h) {
            var v = parseInt(h, 16) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        var L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
        // contrasto con la panna (#fbf6ec, L~0.92) contro quello con l'inchiostro (#1d1913, L~0.011)
        return (0.97 / (L + 0.05)) >= ((L + 0.05) / 0.061) ? '#fbf6ec' : '#1d1913';
    };

    /* ---------------------------------------------------------------------
       Icone SVG (24x24, tratto) — QZ.icon('nome', 'classe-extra')
       ------------------------------------------------------------------- */
    var ICONS = {
        home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
        play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/>',
        star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
        trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/>',
        volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
        mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        left: '<path d="m15 18-6-6 6-6"/>',
        right: '<path d="m9 18 6-6-6-6"/>',
        arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
        skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
        fastforward: '<path d="m13 19 9-7-9-7z"/><path d="m2 19 9-7-9-7z"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        spy: '<circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M14 15a2 2 0 0 0-4 0"/><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2"/><path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2"/>',
        ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
        coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
        crown: '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.29l4.27-3.66a.5.5 0 0 1 .82.5l-2.83 10.25a1 1 0 0 1-.96.75H5.8a1 1 0 0 1-.96-.75L2.01 6a.5.5 0 0 1 .82-.5l4.27 3.66a1 1 0 0 0 1.52-.29z"/><path d="M5 21h14"/>',
        bomb: '<circle cx="11" cy="13" r="9"/><path d="m14.35 4.65 1.95-1.95a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 2-1.5 1.5"/>',
        ball: '<circle cx="12" cy="12" r="10"/><path d="m12 7 4.25 3.1-1.62 5H9.37l-1.62-5z"/><path d="M12 7V2.5"/><path d="m16.25 10.1 4.4-1.45"/><path d="m14.63 15.1 2.72 3.75"/><path d="m9.37 15.1-2.72 3.75"/><path d="M7.75 10.1 3.35 8.65"/>',
        quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
        refresh: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
        chart: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
        hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
        flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        minus: '<path d="M5 12h14"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
        sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
        eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
        eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
        shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
        micoff: '<path d="m2 2 20 20"/><path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
        pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
        shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
        zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
        heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
        type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
        shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
        tv: '<rect width="20" height="15" x="2" y="7" rx="2"/><path d="m17 2-5 5-5-5"/>',
        external: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
        message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
        lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        whistle: '<circle cx="8" cy="15" r="6"/><path d="M14 13h7V9H9.5"/><path d="M8 15h.01"/>',
        gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
        list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
        smartphone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01"/><path d="M16 8h.01"/><path d="M12 12h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/>',
        wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>'
    };

    QZ.icon = function (name, cls) {
        var body = ICONS[name] || ICONS.help;
        return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
    };

    /* ---------------------------------------------------------------------
       Utility DOM e varie
       ------------------------------------------------------------------- */
    QZ.$ = function (sel, root) { return (root || doc).querySelector(sel); };
    QZ.$$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };

    /** Crea un elemento da una stringa HTML (primo nodo). */
    QZ.el = function (html) {
        var t = doc.createElement('template');
        t.innerHTML = String(html).trim();
        return t.content.firstElementChild;
    };

    /** Escape per inserire testo dei database dentro innerHTML. */
    QZ.esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    QZ.shuffle = function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };
    QZ.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    QZ.rand = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };
    QZ.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    QZ.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    // Formato italiano con separatore delle migliaia anche a 4 cifre (1.000, non 1000)
    QZ.fmt = function (n, decimals) {
        var parts = Math.abs(Number(n)).toFixed(decimals || 0).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return (Number(n) < 0 ? '-' : '') + parts.join(',');
    };
    /** Normalizza testo per confronti tolleranti (accenti, maiuscole, punteggiatura). */
    QZ.norm = function (s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    };
    /** Distanza di Levenshtein, per accettare piccoli errori di battitura. */
    QZ.distance = function (a, b) {
        a = QZ.norm(a); b = QZ.norm(b);
        if (a === b) return 0;
        var prev = [], cur = [], i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur = [i];
            for (j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            prev = cur;
        }
        return prev[b.length];
    };

    /**
     * Mazzo senza ripetizioni che sopravvive tra le partite: estrae elementi
     * mai visti finche' il pool non si esaurisce, poi rimescola. Ricorda gli
     * ultimi estratti in localStorage, cosi' ricaricando la pagina non si
     * rivedono subito le stesse domande.
     */
    QZ.Deck = function (key, items, keyFn) {
        this.key = 'qz.deck.' + key;
        this.items = items;
        this.keyFn = keyFn || function (x) { return typeof x === 'string' ? x : JSON.stringify(x); };
        var seen = QZ.store.get(this.key, []);
        this.seen = new Set(Array.isArray(seen) ? seen : []);
    };
    QZ.Deck.prototype.draw = function (filterFn) {
        var self = this;
        var pool = this.items.filter(function (x) { return (!filterFn || filterFn(x)); });
        if (!pool.length) return null;
        var fresh = pool.filter(function (x) { return !self.seen.has(self.keyFn(x)); });
        if (!fresh.length) {
            pool.forEach(function (x) { self.seen.delete(self.keyFn(x)); });
            fresh = pool;
        }
        var item = QZ.pick(fresh);
        this.seen.add(this.keyFn(item));
        var arr = Array.from(this.seen);
        if (arr.length > 1500) arr = arr.slice(arr.length - 1500);
        QZ.store.set(this.key, arr);
        return item;
    };

    /* ---------------------------------------------------------------------
       Storage locale sicuro (modalita' privata, quota piena: non esplode)
       ------------------------------------------------------------------- */
    QZ.store = {
        get: function (k, fallback) {
            try {
                var raw = global.localStorage.getItem(k);
                return raw == null ? fallback : JSON.parse(raw);
            } catch { return fallback; }
        },
        set: function (k, v) {
            try { global.localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ }
        }
    };

    /**
     * Annuncio per i lettori di schermo (regione live nascosta): esiti, punteggi,
     * turni. Quello che si vede soltanto (timbri, segni, colori) passa da qui.
     * QZ.say('Gol! Risposta giusta'), QZ.say('Tempo scaduto', true) per l'urgenza.
     */
    QZ.say = (function () {
        var regions = {};
        var timers = {};
        function region(kind) {
            if (regions[kind] && regions[kind].isConnected) return regions[kind];
            var r = doc.createElement('div');
            r.className = 'sr-only';
            r.setAttribute('aria-live', kind);
            r.setAttribute('aria-atomic', 'true');
            doc.body.appendChild(r);
            regions[kind] = r;
            return r;
        }
        var pending = { polite: [], assertive: [] };
        return function (msg, assertive) {
            if (!msg || !doc.body) return;
            var kind = assertive ? 'assertive' : 'polite';
            var r = region(kind);
            // messaggi ravvicinati (esito + punteggio + turno) escono in un annuncio solo,
            // invece di cancellarsi a vicenda; svuotare prima fa rileggere anche un testo uguale
            pending[kind].push(String(msg));
            r.textContent = '';
            clearTimeout(timers[kind]);
            timers[kind] = setTimeout(function () { r.textContent = pending[kind].join(' '); pending[kind] = []; }, 90);
        };
    })();

    QZ.reducedMotion = function () {
        return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    };

    QZ.vibrate = function (pattern) {
        try { if (navigator.vibrate && QZ.sound.enabled()) navigator.vibrate(pattern); } catch { /* non supportato */ }
    };

    /* ---------------------------------------------------------------------
       Audio sintetizzato (Web Audio API) — QZ.sound.correct() ecc.
       ------------------------------------------------------------------- */
    QZ.sound = (function () {
        var AC = global.AudioContext || global.webkitAudioContext;
        var ctx = null, master = null;
        var muted = QZ.store.get('qz.muted', false);

        function getCtx() {
            if (!AC) return null;
            if (!ctx) {
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0.9;
                master.connect(ctx.destination);
            }
            return ctx;
        }
        // Safari/iOS e i browser in-app creano il contesto sospeso: si aspetta
        // davvero il resume prima di schedulare, altrimenti il suono resta muto.
        function run(fn) {
            // a pagina nascosta il contesto e' fermo: i suoni si accumulerebbero e partirebbero tutti insieme al ritorno
            if (muted || doc.hidden) return;
            var c = getCtx();
            if (!c) return;
            if (c.state === 'running') { fn(c); return; }
            c.resume().then(function () { fn(c); }).catch(function () { /* audio bloccato */ });
        }
        function tone(freq, dur, type, peak, delay, slideTo) {
            run(function (c) {
                var t0 = c.currentTime + (delay || 0);
                var o = c.createOscillator(), g = c.createGain();
                o.type = type || 'sine';
                o.frequency.setValueAtTime(freq, t0);
                if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
                g.gain.setValueAtTime(0.0001, t0);
                g.gain.linearRampToValueAtTime(peak || 0.2, t0 + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                o.connect(g).connect(master);
                o.start(t0);
                o.stop(t0 + dur + 0.05);
            });
        }
        function noise(dur, peak, freq, delay, type) {
            run(function (c) {
                var t0 = c.currentTime + (delay || 0);
                var n = Math.floor(c.sampleRate * dur);
                var buf = c.createBuffer(1, n, c.sampleRate);
                var d = buf.getChannelData(0);
                for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
                var src = c.createBufferSource();
                src.buffer = buf;
                var f = c.createBiquadFilter();
                f.type = type || 'lowpass';
                f.frequency.value = freq || 500;
                var g = c.createGain();
                g.gain.setValueAtTime(peak || 0.4, t0);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                src.connect(f).connect(g).connect(master);
                src.start(t0);
            });
        }
        function arp(notes, step, dur, type, peak) {
            notes.forEach(function (f, i) { tone(f, dur, type, peak, i * step); });
        }

        var S = {
            enabled: function () { return !muted; },
            setMuted: function (m) {
                muted = !!m;
                QZ.store.set('qz.muted', muted);
                if (muted) S.stopMusic();
                doc.dispatchEvent(new CustomEvent('qz:sound', { detail: { muted: muted } }));
            },
            toggle: function () { S.setMuted(!muted); return !muted; },
            unlock: function () { if (!muted) run(function () {}); },
            click: function () { tone(660, 0.05, 'triangle', 0.08); },
            pop: function () { tone(520, 0.09, 'sine', 0.16, 0, 980); },
            tick: function () { tone(1800, 0.04, 'square', 0.07); },
            tock: function () { tone(1200, 0.04, 'square', 0.06); },
            whoosh: function () { noise(0.35, 0.18, 1800, 0, 'bandpass'); },
            correct: function () { arp([659.25, 830.61, 987.77, 1318.5], 0.07, 0.18, 'triangle', 0.17); },
            wrong: function () { tone(196, 0.32, 'sawtooth', 0.14, 0, 110); tone(185, 0.32, 'square', 0.06, 0.03, 98); },
            buzzer: function () { tone(140, 0.6, 'sawtooth', 0.18); tone(147, 0.6, 'square', 0.08); },
            coin: function () { tone(988, 0.08, 'square', 0.12); tone(1319, 0.18, 'square', 0.12, 0.07); },
            lifeline: function () { arp([880, 1174.7, 1568], 0.06, 0.16, 'sine', 0.15); },
            levelUp: function () { arp([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, 0.2, 'triangle', 0.16); },
            start: function () { arp([392, 523.25, 659.25, 783.99], 0.08, 0.2, 'square', 0.09); },
            countdown: function () { tone(880, 0.12, 'square', 0.1); },
            go: function () { tone(1318.5, 0.35, 'square', 0.12); tone(659.25, 0.35, 'triangle', 0.12); },
            win: function () {
                arp([523.25, 659.25, 783.99, 1046.5], 0.11, 0.24, 'triangle', 0.16);
                arp([783.99, 1046.5, 1318.5, 1568], 0.11, 0.4, 'sine', 0.12);
                noise(0.6, 0.08, 6000, 0.5, 'highpass');
            },
            lose: function () { arp([392, 349.23, 311.13, 261.63], 0.16, 0.34, 'sawtooth', 0.11); },
            boom: function () { noise(1.1, 0.7, 260); tone(70, 0.9, 'sine', 0.5, 0, 30); noise(0.5, 0.25, 2200, 0.05, 'bandpass'); },
            whistle: function () { tone(2400, 0.18, 'sine', 0.12, 0, 2600); tone(2500, 0.5, 'sine', 0.12, 0.22, 2300); },
            thud: function () { tone(120, 0.12, 'sine', 0.22, 0, 60); noise(0.07, 0.16, 900); },
            reveal: function () { arp([440, 554.37, 659.25, 880], 0.05, 0.3, 'sine', 0.12); },
            tone: tone,
            noise: noise
        };

        /* musica d'atmosfera generativa leggera (CVEM) */
        var musicTimer = null;
        S.startMusic = function () {
            if (muted || musicTimer) return;
            var seq = [220, 261.63, 329.63, 392, 329.63, 261.63, 246.94, 293.66];
            var i = 0;
            (function step() {
                tone(seq[i % seq.length], 1.4, 'sine', 0.035);
                tone(seq[i % seq.length] / 2, 1.8, 'triangle', 0.025);
                i++;
                musicTimer = setTimeout(step, 1000);
            })();
        };
        S.stopMusic = function () { if (musicTimer) clearTimeout(musicTimer); musicTimer = null; };

        // Sblocco precoce alla prima interazione + risveglio dopo cambio app
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
            doc.addEventListener(ev, S.unlock, { once: true, passive: true });
        });
        doc.addEventListener('visibilitychange', function () {
            if (!doc.hidden) S.unlock();
            else if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {});
        });
        return S;
    })();

    /* ---------------------------------------------------------------------
       Profilo XP condiviso (solo localStorage, nessun server)
       Compatibile con la chiave del vecchio sito: il progresso non si perde.
       ------------------------------------------------------------------- */
    QZ.profile = (function () {
        var KEY = 'quizzottiProfile';
        var BASE = 60;
        function empty() { return { totalXP: 0, gamesPlayed: {}, bestScores: {}, lastPlayed: {}, records: {} }; }
        function get() { return Object.assign(empty(), QZ.store.get(KEY, {}) || {}); }
        function levelFor(xp) { return Math.max(1, Math.floor(Math.sqrt(xp / BASE)) + 1); }
        function xpFor(level) { return Math.pow(level - 1, 2) * BASE; }
        function progress(p) {
            var lv = levelFor(p.totalXP), a = xpFor(lv), b = xpFor(lv + 1);
            return { level: lv, pct: Math.round(((p.totalXP - a) / (b - a)) * 100), toNext: b - p.totalXP };
        }
        /**
         * Registra una partita conclusa.
         * @param {string} gameId id del registro QZ.GAMES
         * @param {{xp:number,label:string,score?:number,higherIsBetter?:boolean}} r
         * @returns {{xp:number, levelUp:boolean, newRecord:boolean, level:number}}
         */
        function record(gameId, r) {
            r = r || {};
            var p = get();
            var before = levelFor(p.totalXP);
            var xp = Math.max(0, Math.round(r.xp || 0));
            p.totalXP += xp;
            p.gamesPlayed[gameId] = (p.gamesPlayed[gameId] || 0) + 1;
            p.lastPlayed[gameId] = Date.now();
            var prev = p.bestScores[gameId];
            if (!prev || xp > prev.xp) p.bestScores[gameId] = { xp: xp, label: r.label || '', date: Date.now() };
            var newRecord = false;
            if (typeof r.score === 'number') {
                var hib = r.higherIsBetter !== false;
                var old = p.records[gameId];
                if (old == null || (hib ? r.score > old : r.score < old)) {
                    newRecord = old != null; // la prima partita non e' un "record battuto"
                    p.records[gameId] = r.score;
                }
            }
            QZ.store.set(KEY, p);
            var after = levelFor(p.totalXP);
            renderBadge(true);
            if (after > before) {
                setTimeout(function () {
                    QZ.sound.levelUp();
                    QZ.toast('Livello ' + after + ' raggiunto!', { icon: 'star', type: 'ok' });
                }, 900);
            }
            return { xp: xp, levelUp: after > before, newRecord: newRecord, level: after };
        }
        function record_(gameId) { return get().records[gameId]; }
        function reset() { QZ.store.set(KEY, empty()); renderBadge(); }

        function renderBadge(bump) {
            var b = doc.getElementById('qz-level');
            if (!b) return;
            var p = get(), pr = progress(p);
            b.style.setProperty('--p', pr.pct);
            b.querySelector('[data-lv]').textContent = pr.level;
            b.querySelector('[data-xp]').textContent = QZ.fmt(p.totalXP) + ' XP';
            // il nome comincia con quello che si legge sul bottone ("Liv. 3"), poi dice cosa apre
            b.setAttribute('aria-label', 'Liv. ' + pr.level + ', ' + QZ.fmt(p.totalXP) + ' XP: apri il tuo album');
            if (bump) { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); }
        }

        function open() {
            var p = get(), pr = progress(p);
            var total = Object.keys(p.gamesPlayed).reduce(function (s, k) { return s + p.gamesPlayed[k]; }, 0);
            var got = QZ.GAMES.filter(function (g) { return p.gamesPlayed[g.id]; }).length;
            // ogni gioco giocato almeno una volta accende il suo posto in bacheca
            var album = QZ.GAMES.map(function (g, i) {
                var has = !!p.gamesPlayed[g.id];
                return '<div class="album__slot' + (has ? ' is-got' : '') + '" style="--c:' + g.color + (has ? ';color:' + g.on : '') + '" title="' + QZ.esc(g.name) + '">' +
                    '<b>N° ' + String(i + 1).padStart(2, '0') + '</b>' + QZ.icon(g.icon) + '<span>' + QZ.esc(has ? g.short : 'spento') + '</span></div>';
            }).join('');
            var rows = QZ.GAMES.filter(function (g) { return p.gamesPlayed[g.id]; }).map(function (g) {
                var best = p.bestScores[g.id];
                return '<div class="profile-game">' +
                    '<div class="profile-game__icon" style="background:' + g.color + ';color:' + g.on + '">' + QZ.icon(g.icon) + '</div>' +
                    '<div class="grow"><div style="font-weight:800">' + QZ.esc(g.name) + '</div>' +
                    '<div class="small muted">' + p.gamesPlayed[g.id] + (p.gamesPlayed[g.id] === 1 ? ' partita' : ' partite') + (best && best.label ? ' · ' + QZ.esc(best.label) : '') + '</div></div></div>';
            }).join('');
            var body =
                '<div class="row row--nowrap" style="--gap:16px;margin:4px 0 6px">' +
                '<div class="pagella__voto" style="width:78px;height:78px;font-size:34px">' + pr.level + '</div>' +
                '<div class="grow"><div class="display" style="font-size:30px;font-style:italic;line-height:1">LIVELLO ' + pr.level + ' · ' + QZ.fmt(p.totalXP) + ' XP</div>' +
                '<div class="small muted">Ancora ' + QZ.fmt(pr.toNext) + ' XP per salire · ' + total + (total === 1 ? ' partita' : ' partite') + '</div>' +
                '<div class="progress mt-1"><div class="progress__fill" style="transform:scaleX(' + pr.pct / 100 + ')"></div></div></div></div>' +
                '<div class="row row--between mt-2"><span class="label">La bacheca</span><span class="note" style="font-size:16px">' + (got === 10 ? 'TUTTI ACCESI' : got + '/10 ACCESI') + '</span></div>' +
                '<div class="album">' + album + '</div>' +
                (rows ? '<div class="profile-games">' + rows + '</div>' : '<p class="muted mt-2">La bacheca è ancora spenta: ogni gioco che provi accende il suo posto.</p>') +
                '<p class="small faint mt-2">Tutto resta su questo telefono. Niente account, niente server.</p>';
            QZ.modal({
                title: 'Il tuo profilo',
                html: body,
                actions: [
                    { label: 'Azzera tutto', ghost: true, onClick: function () {
                        return QZ.confirm('Spegnere la bacheca e azzerare livello e record? Non si torna indietro.', { okLabel: 'Azzera', danger: true }).then(function (ok) {
                            if (ok) { reset(); QZ.toast('Profilo azzerato. Si riparte da capo.', { icon: 'refresh' }); }
                        });
                    } },
                    { label: 'Chiudi', primary: true }
                ]
            });
        }
        return { get: get, record: record, best: record_, reset: reset, open: open, renderBadge: renderBadge, level: function () { return levelFor(get().totalXP); } };
    })();

    /* ---------------------------------------------------------------------
       Schermate: QZ.show('s-game') con transizione in uscita/entrata
       ------------------------------------------------------------------- */
    var historyArmed = false;
    QZ.show = function (id, opts) {
        opts = opts || {};
        var next = typeof id === 'string' ? doc.getElementById(id) : id;
        if (!next) return;
        // Lasciata la copertina, il tasto Indietro del browser riporta alla copertina del
        // gioco (ricaricandola: timer, suoni e stato ripartono puliti) invece di uscire.
        var first = QZ.$('.screen');
        if (!historyArmed && first && next !== first && global.history && global.history.pushState) {
            historyArmed = true;
            try {
                global.history.pushState({ qzPlay: 1 }, '');
                global.addEventListener('popstate', function (e) {
                    if (!(e.state && e.state.qzPlay)) global.location.reload();
                });
            } catch { /* history non disponibile */ }
        }
        var current = QZ.$$('.screen.is-active').filter(function (s) { return s !== next; });
        var enter = function () {
            current.forEach(function (s) { s.classList.remove('is-active', 'is-leaving'); });
            next.classList.remove('is-leaving');
            next.classList.remove('is-active');
            void next.offsetWidth;
            next.classList.add('is-active');
            if (!next.querySelector('h1')) {
                var gg = QZ.game(doc.body.dataset.game);
                if (gg) next.insertAdjacentHTML('afterbegin', '<h1 class="sr-only" data-qz-h1>' + QZ.esc(gg.name) + '</h1>');
            }
            if (opts.scroll !== false) global.scrollTo({ top: 0, behavior: QZ.reducedMotion() ? 'auto' : 'smooth' });
            var focusEl = next.querySelector('[data-autofocus]');
            if (focusEl) setTimeout(function () { focusEl.focus({ preventScroll: true }); }, 60);
        };
        if (current.length && !QZ.reducedMotion()) {
            current.forEach(function (s) { s.classList.add('is-leaving'); });
            setTimeout(enter, 200);
        } else {
            enter();
        }
    };

    /* ---------------------------------------------------------------------
       Timer preciso (rAF), con anello o barra, pausa automatica in background
       new QZ.Timer({ seconds, ring: el|null, bar: el|null, label: el|null,
                      onTick(rem), onSecond(sec), onExpire(), warnAt, dangerAt })
       ------------------------------------------------------------------- */
    QZ.Timer = function (o) {
        this.o = o || {};
        this.duration = this.o.seconds || 30;
        this.remaining = this.duration;
        this.running = false;
        this._raf = 0;
        this._last = 0;
        this._lastSec = Math.ceil(this.remaining);
        this.warnAt = this.o.warnAt != null ? this.o.warnAt : 0.5;
        this.dangerAt = this.o.dangerAt != null ? this.o.dangerAt : 0.25;
        var self = this;
        this._onVis = function () {
            if (doc.hidden && self.running && self.o.pauseHidden !== false) { self.pause(); self._autoPaused = true; }
            else if (!doc.hidden && self._autoPaused) { self._autoPaused = false; self.start(); }
        };
        doc.addEventListener('visibilitychange', this._onVis);
        this.render();
    };
    QZ.Timer.prototype.render = function () {
        var o = this.o, ratio = Math.max(0, this.remaining / this.duration);
        var host = o.ring || o.bar;
        // gira a ogni frame: il testo e le classi si toccano solo quando cambia il secondo
        var sec = String(Math.ceil(this.remaining));
        var secChanged = sec !== this._painted;
        this._painted = sec;
        if (o.ring) {
            if (!this._fill) { this._fill = o.ring.querySelector('.t-fill'); this._ringLabel = o.ring.querySelector('.timer-ring__label'); }
            if (this._fill) this._fill.style.strokeDashoffset = String(this._fill.__len * (1 - ratio));
            if (this._ringLabel && secChanged) this._ringLabel.textContent = sec;
        }
        if (o.bar) {
            if (!this._barFill) this._barFill = o.bar.querySelector('.timer-bar__fill');
            if (this._barFill) this._barFill.style.transform = 'scaleX(' + ratio + ')';
        }
        if (o.label && secChanged) o.label.textContent = sec;
        if (host && secChanged) {
            host.classList.toggle('is-warn', ratio <= this.warnAt && ratio > this.dangerAt);
            host.classList.toggle('is-danger', ratio <= this.dangerAt && this.remaining > 0);
        }
    };
    QZ.Timer.prototype.start = function () {
        if (this.running || this.remaining <= 0) return this;
        if (doc.hidden && this.o.pauseHidden !== false) { this._autoPaused = true; return this; }
        this.running = true;
        this._last = performance.now();
        var self = this;
        var frame = function (ts) {
            if (!self.running) return;
            self.remaining = Math.max(0, self.remaining - (ts - self._last) / 1000);
            self._last = ts;
            self.render();
            var sec = Math.ceil(self.remaining);
            if (sec !== self._lastSec) { self._lastSec = sec; if (self.o.onSecond) self.o.onSecond(sec); }
            if (self.o.onTick) self.o.onTick(self.remaining);
            if (self.remaining <= 0) {
                self.running = false;
                if (self.o.onExpire) self.o.onExpire();
                return;
            }
            self._raf = requestAnimationFrame(frame);
        };
        this._raf = requestAnimationFrame(frame);
        return this;
    };
    QZ.Timer.prototype.pause = function () { this.running = false; cancelAnimationFrame(this._raf); return this; };
    QZ.Timer.prototype.reset = function (seconds) {
        this.pause();
        if (seconds != null) this.duration = seconds;
        this.remaining = this.duration;
        this._lastSec = Math.ceil(this.remaining);
        this._painted = null;
        this.render();
        return this;
    };
    QZ.Timer.prototype.add = function (s) {
        this.remaining = Math.min(this.duration + s, this.remaining + s);
        if (this.remaining > this.duration) this.duration = this.remaining;
        this._painted = null;
        this.render();
        return this;
    };
    QZ.Timer.prototype.elapsed = function () { return this.duration - this.remaining; };
    QZ.Timer.prototype.destroy = function () { this.pause(); this._autoPaused = false; doc.removeEventListener('visibilitychange', this._onVis); };

    /** HTML dell'anello timer; poi QZ.ring(el) per inizializzarlo. */
    QZ.ringHTML = function (extraCls) {
        return '<div class="timer-ring ' + (extraCls || '') + '" role="timer" aria-live="off">' +
            '<svg viewBox="0 0 100 100"><circle class="t-track" cx="50" cy="50" r="44"/><circle class="t-fill" cx="50" cy="50" r="44"/></svg>' +
            '<div class="timer-ring__label">0</div></div>';
    };
    QZ.ring = function (el) {
        var c = el.querySelector('.t-fill');
        var len = 2 * Math.PI * 44;
        c.__len = len;
        c.style.strokeDasharray = String(len);
        c.style.strokeDashoffset = '0';
        return el;
    };

    /* ---------------------------------------------------------------------
       Effetti: coriandoli, scintille, testo volante, lampo, contatore
       ------------------------------------------------------------------- */
    QZ.fx = {};

    QZ.fx.confetti = function (opts) {
        if (QZ.reducedMotion()) return;
        opts = opts || {};
        var count = opts.count || 160;
        var colors = opts.colors || ['#ffb627', '#ffffff', '#3ddc84', '#ff4b3a', '#4d8dff', '#ffd36e'];
        var cv = doc.createElement('canvas');
        cv.className = 'qz-confetti';
        cv.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(cv);
        var dpr = Math.min(2, global.devicePixelRatio || 1);
        var W = global.innerWidth, H = global.innerHeight;
        cv.width = W * dpr; cv.height = H * dpr;
        var g = cv.getContext('2d');
        g.scale(dpr, dpr);
        var origin = opts.origin || { x: 0.5, y: 0.35 };
        var parts = [];
        for (var i = 0; i < count; i++) {
            var a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 10;
            parts.push({
                x: W * origin.x, y: H * origin.y,
                vx: Math.cos(a) * v * (opts.spread || 1), vy: Math.sin(a) * v - 7,
                w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
                r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
                c: colors[i % colors.length], shape: Math.random() < 0.3 ? 1 : 0
            });
        }
        var t0 = performance.now(), life = opts.duration || 3200;
        (function frame(ts) {
            var k = (ts - t0) / life;
            g.clearRect(0, 0, W, H);
            parts.forEach(function (p) {
                p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
                p.x += p.vx; p.y += p.vy; p.r += p.vr;
                g.save();
                g.globalAlpha = Math.max(0, 1 - k * k);
                g.translate(p.x, p.y);
                g.rotate(p.r);
                g.fillStyle = p.c;
                if (p.shape) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
                else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
                g.restore();
            });
            if (k < 1) requestAnimationFrame(frame); else cv.remove();
        })(t0);
    };

    /** Pioggia di emoji/simboli dall'alto (es. € in CVEM). */
    QZ.fx.rain = function (symbol, count) {
        if (QZ.reducedMotion()) return;
        count = count || 24;
        for (var i = 0; i < count; i++) {
            (function (i) {
                setTimeout(function () {
                    var s = doc.createElement('div');
                    s.textContent = symbol;
                    s.setAttribute('aria-hidden', 'true');
                    s.style.cssText = 'position:fixed;top:-60px;left:' + (Math.random() * 100) + 'vw;z-index:965;pointer-events:none;font-size:' + (22 + Math.random() * 26) + 'px;font-family:var(--font-display);font-style:italic;font-weight:900;color:var(--accent);-webkit-text-stroke:1.5px var(--ink);text-shadow:2px 2px 0 var(--ink);transition:transform ' + (2 + Math.random() * 1.6) + 's linear, opacity .4s ease ' + 2.2 + 's';
                    doc.body.appendChild(s);
                    requestAnimationFrame(function () {
                        s.style.transform = 'translateY(' + (global.innerHeight + 120) + 'px) rotate(' + (Math.random() * 720 - 360) + 'deg)';
                        s.style.opacity = '0';
                    });
                    setTimeout(function () { s.remove(); }, 4200);
                }, i * 90);
            })(i);
        }
    };

    QZ.fx.sparks = function (el, color, n) {
        if (!el || QZ.reducedMotion()) return;
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        n = n || 18;
        for (var i = 0; i < n; i++) {
            var s = doc.createElement('span');
            s.className = 'qz-spark';
            var a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = 50 + Math.random() * 80;
            s.style.left = cx + 'px'; s.style.top = cy + 'px';
            s.style.background = color || (i % 3 ? 'var(--accent)' : 'var(--card)');
            s.style.setProperty('--dx', Math.cos(a) * d + 'px');
            s.style.setProperty('--dy', Math.sin(a) * d + 'px');
            s.style.setProperty('--rot', (Math.random() * 360) + 'deg');
            doc.body.appendChild(s);
            s.addEventListener('animationend', s.remove.bind(s));
        }
    };

    QZ.fx.floatText = function (el, text, bad) {
        if (!el) return;
        var r = el.getBoundingClientRect();
        var f = doc.createElement('div');
        f.className = 'qz-float' + (bad ? ' qz-float--bad' : '');
        f.textContent = text;
        f.style.left = (r.left + r.width / 2) + 'px';
        f.style.top = (r.top + r.height / 2 - 20) + 'px';
        doc.body.appendChild(f);
        f.addEventListener('animationend', f.remove.bind(f));
    };

    QZ.fx.flash = function (color) {
        if (QZ.reducedMotion()) return;
        var f = doc.createElement('div');
        f.className = 'qz-flash';
        f.style.background = color || 'rgba(var(--accent-rgb), .28)';
        doc.body.appendChild(f);
        f.addEventListener('animationend', f.remove.bind(f));
    };

    /**
     * Timbro sulla carta: QZ.fx.stamp(el, 'Gol!', 'ok' | 'bad' | 'ink', {rot, size, ms, quiet, x, y, say}).
     * Si appoggia dentro l'elemento (che diventa position:relative se serve).
     * Il timbro e' decorativo (aria-hidden): il suo testo viene annunciato con QZ.say,
     * oppure opts.say (stringa) al suo posto; opts.say === false quando l'esito
     * e' gia' annunciato altrove.
     */
    QZ.fx.stamp = function (el, text, kind, opts) {
        if (!el) return null;
        opts = opts || {};
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        QZ.$$('.qz-stamp', el).forEach(function (x) { x.remove(); });
        var s = doc.createElement('span');
        s.className = 'qz-stamp qz-stamp--' + (kind || 'bad');
        s.textContent = text;
        s.setAttribute('aria-hidden', 'true');
        s.style.setProperty('--rot', (opts.rot != null ? opts.rot : (Math.random() * 14 - 18)) + 'deg');
        if (opts.size) s.style.setProperty('--stamp-size', opts.size + 'px');
        // posizione opzionale in percentuale dell'elemento (default: al centro)
        if (opts.x != null) s.style.left = opts.x + '%';
        if (opts.y != null) s.style.top = opts.y + '%';
        el.appendChild(s);
        if (opts.say !== false) QZ.say(typeof opts.say === 'string' ? opts.say : text);
        if (!opts.quiet) QZ.sound.thud();
        if (opts.ms) setTimeout(function () { s.remove(); }, opts.ms);
        return s;
    };

    /**
     * Segno a pennarello disegnato sopra un elemento: 'circle' (cerchiato),
     * 'cross' (la X della schedina) o 'tick'. Colore opzionale (default rosso);
     * opts.static disegna il segno gia' finito, senza animazione.
     */
    QZ.fx.mark = function (el, kind, color, opts) {
        opts = opts || {};
        if (!el) return null;
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        QZ.$$('.qz-mark', el).forEach(function (x) { x.remove(); });
        var j = function (n) { return (n + Math.random() * 6 - 3).toFixed(1); };
        var d = kind === 'cross'
            ? 'M' + j(14) + ' ' + j(12) + ' L' + j(86) + ' ' + j(88) + ' M' + j(84) + ' ' + j(14) + ' L' + j(16) + ' ' + j(86)
            : kind === 'tick'
                ? 'M18 52 L42 78 L86 18'
                : 'M50 6 C80 4 97 26 95 52 C93 80 70 96 46 94 C20 92 3 72 6 46 C9 22 28 8 56 9';
        var svg = QZ.el('<svg class="qz-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" vector-effect="non-scaling-stroke"/></svg>');
        if (color) svg.style.setProperty('--mark', color);
        el.appendChild(svg);
        // lunghezza del tratto in pixel reali (il viewBox e' stirato sull'elemento)
        var r = el.getBoundingClientRect();
        var path = svg.querySelector('path');
        // a disegno finito il tratteggio va tolto, altrimenti si spezza se l'elemento cambia misura
        var settle = function () { path.style.animation = 'none'; path.style.strokeDasharray = 'none'; path.style.strokeDashoffset = '0'; };
        if (opts.static || QZ.reducedMotion()) settle();
        else {
            path.style.setProperty('--len', Math.ceil((r.width + r.height) * 2.4));
            path.addEventListener('animationend', settle, { once: true });
        }
        return svg;
    };

    QZ.fx.shake = function (el) {
        if (!el) return;
        el.classList.remove('is-shake'); el.getBoundingClientRect(); /* reflow, anche su SVG */ el.classList.add('is-shake');
        setTimeout(function () { el.classList.remove('is-shake'); }, 520);
    };
    QZ.fx.pop = function (el) {
        if (!el) return;
        el.classList.remove('is-pop'); el.getBoundingClientRect(); /* reflow, anche su SVG */ el.classList.add('is-pop');
    };
    /** Rimette in moto un'animazione d'ingresso CSS (.is-in) su un elemento riutilizzato. */
    QZ.fx.replay = function (el, cls) {
        if (!el) return;
        cls = cls || 'is-in';
        el.classList.remove(cls); el.getBoundingClientRect(); /* reflow, anche su SVG */ el.classList.add(cls);
    };

    QZ.fx.count = function (el, from, to, ms, opts) {
        if (!el) return;
        opts = opts || {};
        var t0 = performance.now(), dur = QZ.reducedMotion() ? 1 : (ms || 900);
        (function frame(ts) {
            var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
            el.textContent = (opts.prefix || '') + QZ.fmt(from + (to - from) * e, opts.decimals) + (opts.suffix || '');
            if (k < 1) requestAnimationFrame(frame);
        })(t0);
    };

    /* ---------------------------------------------------------------------
       Toast, modale, conferma, countdown
       ------------------------------------------------------------------- */
    QZ.toast = function (msg, o) {
        o = o || {};
        var wrap = doc.querySelector('.qz-toasts');
        if (!wrap) { wrap = QZ.el('<div class="qz-toasts" role="status" aria-live="polite"></div>'); doc.body.appendChild(wrap); }
        var t = QZ.el('<div class="qz-toast' + (o.type ? ' qz-toast--' + o.type : '') + '">' + QZ.icon(o.icon || 'info') + '<span></span></div>');
        t.querySelector('span').textContent = msg;
        wrap.appendChild(t);
        setTimeout(function () {
            t.classList.add('is-out');
            setTimeout(function () { t.remove(); }, 260);
        }, o.ms || 2400);
    };

    /**
     * Modale accessibile. actions: [{label, primary, ghost, danger, icon, value, onClick}]
     * Restituisce una Promise risolta col value dell'azione scelta (o null).
     */
    var modalSeq = 0;
    /** Tiene il Tab dentro un dialogo (modale, raccoglitore dei giochi). */
    function trapTab(e, box) {
        var f = QZ.$$('button, input, a[href], select, textarea, [tabindex]:not([tabindex="-1"])', box).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (!box.contains(doc.activeElement)) { e.preventDefault(); f[0].focus(); return; }
        if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }

    QZ.modal = function (o) {
        return new Promise(function (resolve) {
            var lastFocus = doc.activeElement;
            var m = QZ.el(
                '<div class="qz-modal" role="dialog" aria-modal="true"' + (o.title ? ' aria-labelledby="qz-modal-t' + (++modalSeq) + '"' : ' aria-label="' + QZ.esc(o.label || 'Avviso') + '"') + '>' +
                '<div class="qz-modal__scrim"></div>' +
                '<div class="qz-modal__box">' +
                (o.dismissable === false ? '' : '<button class="qz-iconbtn qz-modal__close" type="button" aria-label="Chiudi">' + QZ.icon('x') + '</button>') +
                (o.title ? '<h2></h2>' : '') +
                '<div class="qz-modal__body"></div>' +
                '<div class="qz-modal__actions"></div></div></div>'
            );
            if (o.title) { m.querySelector('h2').textContent = o.title; m.querySelector('h2').id = 'qz-modal-t' + modalSeq; }
            var body = m.querySelector('.qz-modal__body');
            if (o.html) body.innerHTML = o.html;
            else if (o.node) body.appendChild(o.node);
            else if (o.text) { var p = doc.createElement('p'); p.className = 'muted'; p.textContent = o.text; body.appendChild(p); }
            var acts = m.querySelector('.qz-modal__actions');
            var done = false;
            function close(val) {
                if (done) return;
                done = true;
                m.classList.add('is-closing');
                doc.removeEventListener('keydown', onKey);
                setTimeout(function () {
                    m.remove();
                    // se dalla risposta e' nata un'altra finestra (es. conferma), il fuoco resta li'
                    var other = QZ.$$('.qz-modal').some(function (x) { return !x.classList.contains('is-closing'); });
                    // ...e non torna su un bottone sparito con la schermata (resterebbe sul body)
                    if (!other && lastFocus && lastFocus.focus && lastFocus.isConnected && lastFocus.offsetParent !== null) lastFocus.focus({ preventScroll: true });
                }, 200);
                resolve(val === undefined ? null : val);
            }
            (o.actions || [{ label: 'OK', primary: true }]).forEach(function (a) {
                var b = QZ.el('<button type="button" class="btn ' + (a.primary ? 'btn--primary' : a.danger ? 'btn--bad' : a.ghost ? 'btn--ghost' : '') + '">' + (a.icon ? QZ.icon(a.icon) : '') + '<span></span></button>');
                b.querySelector('span').textContent = a.label;
                b.addEventListener('click', function () {
                    var r = a.onClick ? a.onClick() : undefined;
                    if (r === false) return;
                    close(a.value !== undefined ? a.value : a.label);
                });
                acts.appendChild(b);
            });
            if (!acts.children.length) acts.remove();
            function onKey(e) {
                if (e.key === 'Escape' && o.dismissable !== false) close(null);
                if (e.key === 'Tab') trapTab(e, m);
            }
            doc.addEventListener('keydown', onKey);
            if (o.dismissable !== false) {
                m.querySelector('.qz-modal__scrim').addEventListener('click', function () { close(null); });
                m.querySelector('.qz-modal__close').addEventListener('click', function () { close(null); });
            }
            doc.body.appendChild(m);
            var first = m.querySelector('.qz-modal__actions .btn--primary') || m.querySelector('.qz-modal__actions .btn') || m.querySelector('button');
            if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
            if (o.onOpen) o.onOpen(m, close);
            if (o.autoClose) setTimeout(function () { close(null); }, o.autoClose);
        });
    };

    QZ.confirm = function (text, o) {
        o = o || {};
        return QZ.modal({
            title: o.title || 'Sei sicuro?', text: text,
            actions: [{ label: o.cancelLabel || 'Annulla', ghost: true, value: false }, { label: o.okLabel || 'Conferma', primary: !o.danger, danger: !!o.danger, value: true }]
        }).then(function (v) { return v === true; });
    };

    /** Conto alla rovescia 3-2-1-VIA a schermo intero. */
    QZ.countdown = function (from, goText) {
        from = from || 3;
        return new Promise(function (resolve) {
            var ov = QZ.el('<div class="qz-countdown" aria-live="assertive"></div>');
            doc.body.appendChild(ov);
            var n = from;
            (function step() {
                ov.innerHTML = '';
                var s = doc.createElement('span');
                s.textContent = n > 0 ? n : (goText || 'VIA!');
                ov.appendChild(s);
                if (n > 0) QZ.sound.countdown(); else QZ.sound.go();
                QZ.vibrate(n > 0 ? 30 : 80);
                if (n-- > 0) setTimeout(step, 750);
                else setTimeout(function () { ov.remove(); resolve(); }, 550);
            })();
        });
    };

    /* ---------------------------------------------------------------------
       Condivisione (Web Share API, fallback appunti + toast)
       ------------------------------------------------------------------- */
    QZ.share = function (text, title) {
        var url = global.location.href.split('#')[0];
        if (navigator.share) {
            return navigator.share({ title: title || 'Quizzotti', text: text, url: url }).catch(function () {});
        }
        var full = text + '\n' + url;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(full).then(function () {
                QZ.toast('Risultato copiato negli appunti', { icon: 'check', type: 'ok' });
            }, function () { QZ.toast('Condivisione non disponibile', { icon: 'x', type: 'bad' }); });
        }
        QZ.toast('Condivisione non disponibile', { icon: 'x', type: 'bad' });
        return Promise.resolve();
    };

    /* ---------------------------------------------------------------------
       Schermo sempre acceso durante le partite di gruppo (Wake Lock API)
       ------------------------------------------------------------------- */
    QZ.wake = (function () {
        var lock = null, want = false;
        function req() {
            if (!want || !('wakeLock' in navigator) || doc.hidden) return;
            navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {});
        }
        doc.addEventListener('visibilitychange', req);
        return {
            on: function () { want = true; req(); },
            off: function () { want = false; if (lock) { lock.release().catch(function () {}); lock = null; } }
        };
    })();

    /* ---------------------------------------------------------------------
       Componente: lista nomi giocatori/squadre con +/- e memoria locale
       QZ.playerList(container, { key, min, max, initial, label, placeholder })
       -> { get(): string[], set(names) }
       ------------------------------------------------------------------- */
    QZ.playerList = function (host, o) {
        o = o || {};
        var min = o.min || 2, max = o.max || 10;
        var label = o.label || 'Giocatore';
        var saved = o.key ? QZ.store.get('qz.names.' + o.key, null) : null;
        var names = Array.isArray(saved) && saved.length >= min ? saved.slice(0, max) : [];
        var initial = o.initial || min;
        // una lista salvata vale cosi' com'e': si completa solo fino al minimo
        while (names.length < (saved && names.length ? min : initial)) names.push('');
        host.innerHTML =
            '<div class="row row--between" style="margin-bottom:10px"><span class="label">' + QZ.esc(o.title || (label + ' (' + min + '-' + max + ')')) + '</span>' +
            '<div class="stepper"><button type="button" data-act="minus" aria-label="Rimuovi">' + QZ.icon('minus') + '</button><output data-count></output>' +
            '<button type="button" data-act="plus" aria-label="Aggiungi">' + QZ.icon('plus') + '</button></div></div>' +
            '<div class="players"></div>';
        var list = host.querySelector('.players');
        var out = host.querySelector('[data-count]');
        function save() { if (o.key) QZ.store.set('qz.names.' + o.key, names); }
        function render(animateLast) {
            list.innerHTML = '';
            names.forEach(function (n, i) {
                var tint = QZ.TEAM_COLORS[i % QZ.TEAM_COLORS.length];
                var row = QZ.el('<div class="players__row"><div class="players__dot" aria-hidden="true" style="background:' + tint + ';color:' + QZ.onColor(tint) + '">' + (i + 1) + '</div>' +
                    '<input class="input" maxlength="18" autocomplete="off" aria-label="' + QZ.esc(label) + ' ' + (i + 1) + '"></div>');
                if (!animateLast || i < names.length - 1) row.style.animation = 'none';
                var inp = row.querySelector('input');
                inp.value = n;
                inp.placeholder = label + ' ' + (i + 1);
                inp.addEventListener('input', function () { names[i] = inp.value; save(); });
                list.appendChild(row);
            });
            out.textContent = names.length;
            host.querySelector('[data-act=minus]').disabled = names.length <= min;
            host.querySelector('[data-act=plus]').disabled = names.length >= max;
        }
        host.querySelector('[data-act=minus]').addEventListener('click', function () { if (names.length > min) { names.pop(); save(); render(); QZ.sound.click(); } });
        host.querySelector('[data-act=plus]').addEventListener('click', function () {
            if (names.length < max) { names.push(''); save(); render(true); QZ.sound.pop(); var ins = list.querySelectorAll('input'); ins[ins.length - 1].focus(); }
        });
        render();
        return {
            get: function () {
                return names.map(function (n, i) { return (n || '').trim() || (label + ' ' + (i + 1)); });
            },
            count: function () { return names.length; },
            set: function (arr) { names = arr.slice(0, max); render(); save(); }
        };
    };

    /** Segmented control: QZ.segmented(el, values, current, onChange) */
    QZ.segmented = function (host, options, current, onChange) {
        host.classList.add('segmented');
        host.setAttribute('role', 'group');
        host.innerHTML = '';
        var value = current;
        options.forEach(function (op) {
            var b = doc.createElement('button');
            b.type = 'button';
            b.textContent = op.label;
            b.setAttribute('aria-pressed', String(op.value === value));
            b.addEventListener('click', function () {
                value = op.value;
                QZ.$$('button', host).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
                b.setAttribute('aria-pressed', 'true');
                QZ.sound.click();
                if (onChange) onChange(value);
            });
            host.appendChild(b);
        });
        return { get: function () { return value; } };
    };

    /** Classifica finale animata: rows [{name, score, color?, sub?}] gia' ordinate. */
    QZ.podiumHTML = function (rows, fmtScore) {
        return '<div class="podium">' + rows.map(function (r, i) {
            return '<div class="podium__row" style="--i:' + i + '"><div class="podium__pos">' + (i + 1) + '</div>' +
                (r.color ? '<span class="team__dot" style="--c:' + r.color + '"></span>' : '') +
                '<div class="podium__name">' + QZ.esc(r.name) + (r.sub ? '<div class="small muted" style="font-weight:600">' + QZ.esc(r.sub) + '</div>' : '') + '</div>' +
                '<div class="podium__score">' + QZ.esc(fmtScore ? fmtScore(r.score) : r.score) + '</div></div>';
        }).join('') + '</div>';
    };

    /**
     * Schermata risultati standard.
     * QZ.results(host, { win, icon, title, subtitle, big, bigFrom, bigPrefix, bigSuffix,
     *   stats:[{label,value}], extraHTML, record:{newRecord,xp}, share:'testo',
     *   ratio (0-1: aggiunge il voto in pagella), onRetry, retryLabel,
     *   secondary:{label, icon, onClick} })
     */
    /**
     * Il voto in pagella, da 4 a 10 a mezzi punti, con il giudizio del cronista.
     * ratio: quanto e' andata bene la partita, da 0 a 1.
     */
    QZ.pagella = function (ratio) {
        var r = QZ.clamp(Number(ratio) || 0, 0, 1);
        var v = Math.round((4 + r * 6) * 2) / 2;
        var bank = v >= 9.5 ? ['Prestazione da Pallone d\'Oro. Si alza tutto lo stadio.', 'Partita perfetta. Il mister non ha niente da dire, e infatti tace.', 'Imbattibile. A fine gara gli chiedono la maglia.']
            : v >= 8 ? ['Trascinatore. Qualche sbavatura, ma la partita la decide lui.', 'Testa alta e piedi buoni. Applausi.', 'Sempre nel vivo del gioco. Da convocare.']
                : v >= 6.5 ? ['Fa il suo, senza strafare. Il pubblico apprezza.', 'Partita ordinata, qualche errore di troppo nel finale.', 'Sufficienza piena. Può dare di più, e lo sa.']
                    : v >= 5.5 ? ['Si vede a sprazzi. Troppo poco per lasciare il segno.', 'Ci prova, ma sbaglia l\'ultimo passaggio. Rimandato.', 'Né carne né pesce. Serve una settimana di allenamento.']
                        : ['Non pervenuto. Sostituito all\'intervallo.', 'Giornata storta: la palla non gira, e lui nemmeno.', 'Si salva solo per l\'impegno. Da rivedere.'];
        return { voto: v, txt: bank[Math.floor(Math.random() * bank.length)], label: (v % 1 ? Math.floor(v) + '½' : String(v)) };
    };

    QZ.results = function (host, o) {
        var g = QZ.game(doc.body.dataset.game) || {};
        host.innerHTML =
            '<div class="result" data-stagger>' +
            '<div class="result__badge' + (o.win === false ? ' result__badge--bad' : '') + '">' + QZ.icon(o.icon || (o.win === false ? 'flag' : 'trophy')) + '</div>' +
            '<h1 class="result__title" tabindex="-1"></h1>' +
            '<p class="muted result__sub" style="max-width:52ch"></p>' +
            (o.big != null ? '<div class="result__big">0</div>' : '') +
            (o.ratio != null ? (function () {
                var pg = QZ.pagella(o.ratio);
                return '<div class="pagella"><div class="pagella__voto" aria-label="Voto ' + pg.voto + '">' + pg.label + '</div>' +
                    '<div><div class="pagella__label">Il voto in pagella</div><p class="pagella__text">' + QZ.esc(pg.txt) + '</p></div></div>';
            })() : '') +
            (o.record && (o.record.newRecord || o.record.xp) ?
                '<div class="row row--center result__best">' +
                (o.record.newRecord ? '<span class="note" style="font-size:22px">nuovo record!</span>' : '') +
                (o.record.xp ? '<span class="chip">' + QZ.icon('star') + '+' + o.record.xp + ' XP</span>' : '') + '</div>' : '') +
            '</div>' +
            (o.stats && o.stats.filter(Boolean).length ? '<div class="stats mt-3">' + o.stats.filter(function (x) { return x && x.value != null; }).map(function (s) {
                return '<div class="stat"><div class="stat__label">' + QZ.esc(s.label) + '</div><div class="stat__value">' + QZ.esc(s.value) + '</div></div>';
            }).join('') + '</div>' : '') +
            (o.extraHTML || '') +
            '<div class="result__actions">' +
            '<button type="button" class="btn btn--primary btn--lg" data-retry>' + QZ.icon('refresh') + (QZ.esc(o.retryLabel || 'Rigioca')) + '</button>' +
            (o.secondary ? '<button type="button" class="btn btn--lg" data-secondary>' + (o.secondary.icon ? QZ.icon(o.secondary.icon) : '') + QZ.esc(o.secondary.label) + '</button>' : '') +
            (o.share ? '<button type="button" class="btn btn--lg" data-share>' + QZ.icon('share') + 'Condividi</button>' : '') +
            '<a class="btn btn--ghost btn--lg" href="index.html#giochi">' + QZ.icon('grid') + 'Cambia gioco</a>' +
            '</div>';
        var titleEl = host.querySelector('.result__title');
        titleEl.textContent = o.title || '';
        // l'h1 di riserva della schermata non serve piu': il titolo del resoconto e' l'h1
        var scr = host.closest('.screen');
        if (scr) QZ.$$('[data-qz-h1]', scr).forEach(function (h) { h.remove(); });
        // il bottone appena premuto e' sparito con la schermata precedente: il fuoco va sul titolo
        // (dopo il cambio schermata, che senza movimento ridotto dura ~200 ms)
        setTimeout(function () {
            // (una conferma che si sta chiudendo non conta: e' spesso lei ad aver portato qui)
            var openModal = QZ.$$('.qz-modal').some(function (x) { return !x.classList.contains('is-closing'); });
            if (titleEl.isConnected && titleEl.offsetParent !== null && !openModal) titleEl.focus({ preventScroll: true });
        }, QZ.reducedMotion() ? 60 : 280);
        host.querySelector('.result__sub').textContent = o.subtitle || '';
        if (o.big != null) {
            QZ.fx.count(host.querySelector('.result__big'), o.bigFrom || 0, o.big, 1300, { prefix: o.bigPrefix, suffix: o.bigSuffix, decimals: o.bigDecimals });
        }
        // un tocco solo: il doppio tap non deve far partire due partite
        var used = false;
        var once = function (fn) { return function () { if (used) return; used = true; if (fn) fn(); }; };
        host.querySelector('[data-retry]').addEventListener('click', once(o.onRetry));
        var sec = host.querySelector('[data-secondary]');
        if (sec) sec.addEventListener('click', once(o.secondary.onClick));
        var sh = host.querySelector('[data-share]');
        if (sh) sh.addEventListener('click', function () { QZ.share(o.share, 'Quizzotti · ' + (g.name || '')); });
        if (o.win !== false) {
            QZ.sound.win();
            setTimeout(function () { QZ.fx.confetti(); }, 250);
        } else {
            QZ.sound.lose();
        }
    };

    /* ---------------------------------------------------------------------
       Shell: sfondo, header, launcher giochi, footer
       ------------------------------------------------------------------- */
    function buildShell() {
        var body = doc.body;
        var gameId = body.dataset.game || '';
        var g = QZ.game(gameId);
        var isHome = body.dataset.page === 'home';

        var gp = QZ.profile.get().gamesPlayed;
        var played = Object.keys(gp).reduce(function (n, k) { return n + gp[k]; }, 0);
        var today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        body.insertAdjacentHTML('afterbegin',
            '<a href="#app" class="skip-link">Vai al contenuto</a>' +
            '<div class="qz-bg" aria-hidden="true"><div class="qz-bg__light qz-bg__light--l"></div><div class="qz-bg__light qz-bg__light--r"></div>' +
            '<div class="qz-bg__tower qz-bg__tower--l">' + '<i></i>'.repeat(8) + '</div><div class="qz-bg__tower qz-bg__tower--r">' + '<i></i>'.repeat(8) + '</div>' +
            '<div class="qz-bg__pitch"></div></div>' +
            '<header class="qz-header"><div class="qz-header__bar">' +
            '<a class="qz-brand" href="index.html" aria-label="Quizzotti, torna alla prima pagina">' +
            '<img src="logo1.webp" alt="" width="44" height="44" decoding="async">' +
            '<span class="qz-brand__text"><span class="qz-brand__name">Quiz<b>zotti</b></span>' +
            '<span class="qz-brand__tag">' + (g ? 'Gioco ' + String(QZ.GAMES.indexOf(g) + 1).padStart(2, '0') + ' · ' + QZ.esc(g.name) : QZ.esc(today) + ' · edizione n° ' + (played + 1)) + '</span></span>' +
            '</a>' +
            '<div class="qz-header__spacer"></div>' +
            '<button class="qz-iconbtn" type="button" data-sound aria-label="Audio"></button>' +
            '<button class="qz-iconbtn" type="button" data-launcher aria-haspopup="dialog">' + QZ.icon('grid') + '<span class="qz-iconbtn__label">Giochi</span></button>' +
            '<button class="qz-level" id="qz-level" type="button"><span class="qz-level__ring"><span data-lv>1</span></span><span data-xp>0 XP</span></button>' +
            '</div></header>');

        var launcher = QZ.el(
            '<div class="qz-launcher" role="dialog" aria-modal="true" aria-label="Tutti i giochi">' +
            '<div class="qz-launcher__scrim"></div>' +
            '<div class="qz-launcher__sheet">' +
            '<div class="qz-launcher__head"><h2>A cosa giochiamo?</h2><button class="qz-iconbtn" type="button" data-close aria-label="Chiudi">' + QZ.icon('x') + '</button></div>' +
            '<div class="qz-launcher__grid">' +
            QZ.GAMES.map(function (x, i) {
                return '<a class="qz-tile" href="' + x.file + '" style="--i:' + i + ';--c:' + x.color + ';--c-2:' + x.color2 + ';--tilt:' + (i % 2 ? 1 : -1) + 'deg"' + (x.id === gameId ? ' aria-current="page"' : '') + '>' +
                    '<span class="qz-tile__icon" style="color:' + x.on + '">' + QZ.icon(x.icon) + '</span>' +
                    '<span class="qz-tile__name">' + QZ.esc(x.name) + '</span>' +
                    '<span class="qz-tile__meta">' + QZ.esc(x.players) + '</span></a>';
            }).join('') +
            '</div>' +
            (isHome ? '' : '<a class="btn btn--ghost btn--block mt-2" href="index.html">' + QZ.icon('home') + 'Torna alla prima pagina</a>') +
            '</div></div>');
        body.appendChild(launcher);

        var footer = QZ.el(
            '<footer class="qz-footer"><div class="qz-footer__inner">' +
            '<span class="qz-footer__sign">Si gioca sotto i riflettori. Niente app, niente account.</span>' +
            '<nav class="qz-footer__links" aria-label="Collegamenti">' +
            '<a href="index.html">Prima pagina</a><a href="index.html#giochi">Tutti i giochi</a>' +
            '<a href="../carriera-serie-a/">Presidente · Serie A</a>' +
            '</nav>' +
            '<span>Quizzotti © ' + new Date().getFullYear() + '</span>' +
            '</div></footer>');
        body.appendChild(footer);

        // Audio
        var sBtn = doc.querySelector('[data-sound]');
        function paintSound() {
            var on = QZ.sound.enabled();
            sBtn.innerHTML = QZ.icon(on ? 'volume' : 'mute');
            sBtn.setAttribute('aria-label', on ? 'Disattiva audio' : 'Attiva audio');
            sBtn.setAttribute('aria-pressed', String(!on));
        }
        sBtn.addEventListener('click', function () { var on = QZ.sound.toggle(); paintSound(); if (on) QZ.sound.pop(); });
        paintSound();

        // Launcher
        var openBtn = doc.querySelector('[data-launcher]');
        function openL() { launcher.classList.add('is-open'); QZ.sound.whoosh(); setTimeout(function () { launcher.querySelector('[data-close]').focus(); }, 60); doc.addEventListener('keydown', escL); }
        function closeL() { launcher.classList.remove('is-open'); doc.removeEventListener('keydown', escL); openBtn.focus({ preventScroll: true }); }
        function escL(e) { if (e.key === 'Escape') closeL(); else if (e.key === 'Tab') trapTab(e, launcher.querySelector('.qz-launcher__sheet')); }
        openBtn.addEventListener('click', openL);
        launcher.querySelector('[data-close]').addEventListener('click', closeL);
        launcher.querySelector('.qz-launcher__scrim').addEventListener('click', closeL);

        // Profilo
        doc.getElementById('qz-level').addEventListener('click', QZ.profile.open);
        QZ.profile.renderBadge();

        // Anelli timer gia' presenti nel markup
        QZ.$$('.timer-ring').forEach(QZ.ring);

        // Suono leggero su tutti i bottoni
        doc.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('.btn, .segmented button, .filters button');
            if (b && !b.disabled && !b.hasAttribute('data-silent')) QZ.sound.click();
        });
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', buildShell);
    else buildShell();

    global.QZ = QZ;
})(window);
