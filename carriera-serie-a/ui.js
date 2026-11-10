'use strict';
/* ============================================================
   Presidente · Serie A — ui.js
   Tutto ciò che tocca il DOM: le schermate (setup, sala del consiglio,
   stagione, fine stagione, fine dinastia), overlay/toast, lo stemma
   procedurale, le sparkline e le celebrazioni. Si appoggia alle funzioni
   di motore definite in sim.js (spinPlayer, startSeason, simMatch, ...) e
   alle costanti di data.js. Caricato per ultimo: avvia il gioco con la
   chiamata a boot() in fondo al file.
   ============================================================ */

  let crestUid = 0;

  // Nomi scritti dal giocatore (presidente, club): via i tre caratteri che servono a uscire da
  // un testo o da un attributo HTML. Non sostituisce escapeHtml dove si disegna (resta la
  // difesa vera), ma questi nomi finiscono dentro il salvataggio e da lì in decine di template
  // del gioco in singolo: meglio che non ci entrino affatto. Sostituiti con sosia innocui, così
  // "<b>x</b>" resta leggibile come testo invece di sparire.
  const cleanText = (v) => String(v == null ? '' : v).replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '”');

  // Stessa pulizia, in profondità e sul posto, per ciò che arriva da FUORI: la stanza letta dal
  // server (carriere degli altri in players[].state, classifiche live, risultati simulati dal
  // browser dell'host, trattative), un file di carriera importato, un salvataggio riaperto. Una
  // carriera "scaricata" dopo la simulazione diventa S, e S viene disegnato ovunque senza
  // escaping (nomi di giocatori, allenatori, sponsor, stadio...): un host malevolo poteva
  // infilarci markup che si eseguiva nel browser di tutti gli altri. Si puliscono valori E
  // chiavi (alcune mappe, es. lo storico derby, usano nomi di club come chiave e li mostrano).
  // `skip`: campi di primo livello da lasciare intatti (chat e annuncio: testo libero che ha
  // senso mostrare com'è, e che viene sempre disegnato con escapeHtml).
  function cleanForeign(v, skip, depth) {
    depth = depth || 0;
    if (typeof v === 'string') return /[<>"]/.test(v) ? cleanText(v) : v;
    if (!v || typeof v !== 'object' || depth > 40) return v;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = cleanForeign(v[i], null, depth + 1); return v; }
    Object.keys(v).forEach((k) => {
      if (skip && skip.indexOf(k) !== -1) return;
      const val = cleanForeign(v[k], null, depth + 1);
      if (/[<>"]/.test(k)) { delete v[k]; v[cleanText(k)] = val; } else v[k] = val;
    });
    return v;
  }
  const cleanRoom = (room) => cleanForeign(room, ['chat', 'announcement', 'name']);

  // "Riduci animazioni" del sistema operativo: i CSS spengono da soli transizioni e coriandoli
  // (styles.css, prefers-reduced-motion), qui lo stesso per ciò che è animato via JS (contatori
  // di budget/indicatori, coriandoli creati a mano). Letta ad ogni uso, non una volta sola:
  // l'utente può cambiarla a gioco aperto.
  const prefersReducedMotion = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  // Un bottone che avvia una chiamata di rete (crea/entra in una stanza, invia in classifica)
  // resta disattivato finché la chiamata non risponde: prima un doppio tocco, o un secondo
  // tocco "perché non succede niente" su rete lenta, faceva partire due richieste (due stanze,
  // due carriere create). `fn` è la funzione async originale, invariata.
  function withBusy(btn, fn) {
    return async function () {
      if (!btn || btn.dataset.busy) return;
      btn.dataset.busy = '1'; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      const label = btn.innerHTML; btn.innerHTML = '⏳ Un attimo…';
      try { await fn.apply(this, arguments); }
      finally { if (btn.isConnected) { delete btn.dataset.busy; btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; } }
    };
  }

  // Escaping per testo libero non fidato inserito via innerHTML (es. i messaggi di chat: dal
  // lato server ora arrivano puliti solo dai caratteri di controllo, non da <, >, & o virgolette
  // — l'escaping va fatto qui, in fase di rendering, non troncando il testo a monte.
  const escapeHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // I tre "disegni" disponibili: contorno + un piccolo emblema a stella interno, entrambi
  // riempiti con lo stesso gradiente a 2 colori scelto dal presidente.
  function crestInner(shape, gradId) {
    if (shape === 'round') {
      return `<circle cx="60" cy="63" r="56" fill="url(#${gradId})" fill-opacity=".18" stroke="url(#${gradId})" stroke-width="3.5"/>
        <path d="M60 33 L67 53 L88 54 L71 67 L77 88 L60 76 L43 88 L49 67 L32 54 L53 53 Z" fill="url(#${gradId})"/>`;
    }
    if (shape === 'hex') {
      return `<path d="M60 4 L108 30 V90 L60 116 L12 90 V30 Z" fill="url(#${gradId})" fill-opacity=".18" stroke="url(#${gradId})" stroke-width="3.5"/>
        <path d="M60 32 L67 52 L88 53 L71 66 L77 87 L60 75 L43 87 L49 66 L32 53 L53 52 Z" fill="url(#${gradId})"/>`;
    }
    return `<path d="M60 4 L112 26 V64 C112 96 90 120 60 134 C30 120 8 96 8 64 V26 Z" fill="url(#${gradId})" fill-opacity=".18" stroke="url(#${gradId})" stroke-width="3.5"/>
      <path d="M60 40 L67 60 L88 61 L71 74 L77 95 L60 83 L43 95 L49 74 L32 61 L53 60 Z" fill="url(#${gradId})"/>`;
  }

  // Illustrazione dello stadio: la "ciotola" (ellissi concentriche attorno al campo) guadagna
  // un anello ogni 2 livelli di ampliamento (STADIUM in data.js ne ha 9), fino a un tetto di 4
  // — cresce visibilmente con la capienza invece di restare sempre lo stesso disegno. A destra
  // un gauge a ciambella mostra l'affluenza attesa alla fascia di prezzo scelta ORA (fillPct,
  // 0-1): oro per il pubblico atteso, grigio per i posti che resterebbero vuoti.
  function stadiumSVG(tier, fillPct) {
    const rings = clamp(1 + Math.floor(tier / 2), 1, 4);
    let bowl = '';
    for (let i = rings - 1; i >= 0; i--) {
      const rx = 62 + i * 15, ry = 38 + i * 9;
      bowl += `<ellipse cx="70" cy="72" rx="${rx}" ry="${ry}" fill="none" stroke="var(--c1)" stroke-opacity="${0.5 - i * 0.1}" stroke-width="9"/>`;
    }
    bowl += `<ellipse cx="70" cy="72" rx="40" ry="24" fill="#2a7d3f" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>`;
    bowl += `<line x1="70" y1="48" x2="70" y2="96" stroke="rgba(255,255,255,.5)" stroke-width="1"/>`;
    bowl += `<circle cx="70" cy="72" r="7" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1"/>`;
    const r = 30, circ = 2 * Math.PI * r;
    const filled = circ * clamp(fillPct, 0, 1), empty = circ - filled;
    const pct = Math.round(clamp(fillPct, 0, 1) * 100);
    const gauge = `
      <g transform="translate(230,72)">
        <circle r="${r}" fill="none" stroke="rgba(20,22,26,.1)" stroke-width="10"/>
        <circle r="${r}" fill="none" stroke="var(--c1)" stroke-width="10" stroke-dasharray="${filled.toFixed(1)} ${empty.toFixed(1)}" stroke-linecap="round" transform="rotate(-90)"/>
        <text text-anchor="middle" dy="5" font-size="18" font-weight="900" fill="var(--txt)" font-family="var(--sans)">${pct}%</text>
      </g>
      <text x="230" y="118" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--muted)" font-family="var(--sans)">affluenza attesa</text>`;
    return `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:150px" role="img" aria-label="Stadio, ${rings} anelli, affluenza attesa ${pct}%">${bowl}${gauge}</svg>`;
  }

  function crestMarkup(shape, colors, cls) {
    const id = 'cg' + (crestUid++);
    const c = colors && colors.length === 2 ? colors : CREST_DEFAULT.colors;
    return `<svg viewBox="0 0 120 138" xmlns="http://www.w3.org/2000/svg" class="${cls || ''}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c[0]}" /><stop offset="1" stop-color="${c[1]}" />
      </linearGradient></defs>
      ${crestInner(shape || CREST_DEFAULT.shape, id)}
    </svg>`;
  }

  // Aggiorna lo stemma nella barra home con quello del club attivo (o quello di
  // default finché non esiste ancora una carriera).
  function syncHomeCrest() {
    const wrap = $('owHomeCrestWrap'); if (!wrap) return;
    const shape = (S && S.crestShape) || CREST_DEFAULT.shape;
    const colors = (S && S.crestColors) || CREST_DEFAULT.colors;
    wrap.innerHTML = crestMarkup(shape, colors, '');
    const lbl = $('owHomeLabel'); if (lbl) lbl.textContent = (S && S.club) || 'Presidente';
    const sub = $('owHomeSub'); if (sub) sub.textContent = S ? divOf().name + ' · Stagione ' + S.season + '/' + (S.maxSeasons || MAX_SEASONS) : 'Presidente · Serie A';
    applyClubTheme(S && S.crestColors);
  }

  /* ---------------- colori sociali ----------------
     I due colori dello stemma diventano i colori di tutta l'interfaccia (variabili --c1/--c2 in
     styles.css). Il presidente può sceglierne qualunque coppia, anche gialla o bianca: da qui
     escono anche il colore del testo da metterci sopra (--on-c1/--on-c2) e una versione
     abbastanza scura del primario da usare come testo su fondo chiaro (--c1-ink). */
  const THEME_FALLBACK = ['#1f4fb4', '#0d1f4d'];
  function hexRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  function relLum(rgb) {
    const ch = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  const contrastRatio = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const RGB_WHITE = [255, 255, 255], RGB_INK = [20, 22, 26], RGB_PAPER = [247, 245, 240];
  const inkOn = (rgb) => (contrastRatio(rgb, RGB_WHITE) >= contrastRatio(rgb, RGB_INK) ? '#ffffff' : '#14161a');
  // Scurisce il colore finché si legge come testo sul fondo chiaro (contrasto almeno 4.5:1).
  function readableOnLight(rgb) {
    let out = rgb;
    for (let t = 0.05; t <= 1 && contrastRatio(out, RGB_PAPER) < 4.5; t += 0.05) out = mixRgb(rgb, RGB_INK, t);
    return out;
  }
  let lastTheme = '';
  function applyClubTheme(colors) {
    const c = colors && colors.length === 2 && hexRgb(colors[0]) && hexRgb(colors[1]) ? colors : THEME_FALLBACK;
    const key = c.join('|'); if (key === lastTheme) return; lastTheme = key;
    const c1 = hexRgb(c[0]), c2 = hexRgb(c[1]);
    const root = document.documentElement.style;
    root.setProperty('--c1', rgbHex(c1));
    root.setProperty('--c2', rgbHex(c2));
    root.setProperty('--on-c1', inkOn(c1));
    root.setProperty('--on-c2', inkOn(c2));
    root.setProperty('--c1-ink', rgbHex(readableOnLight(c1)));
    root.setProperty('--c1-dark', rgbHex(mixRgb(c1, [0, 0, 0], 0.3)));
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', rgbHex(c1));
  }

  // Colore del badge overall in base a quanto è alto: scarso (grigio) → discreto
  // (bianco) → buono (azzurro) → ottimo (verde) → fuoriclasse (oro), sulla scala
  // 40-99 usata dal gioco.
  function ovrTier(ovr) {
    if (ovr > 100) return { c: 'var(--purple)', bg: 'rgba(116,64,200,.13)' };
    if (ovr >= 85) return { c: 'var(--gold)', bg: 'rgba(255,190,40,.2)' };
    if (ovr >= 75) return { c: 'var(--good)', bg: 'rgba(14,138,76,.12)' };
    if (ovr >= 65) return { c: 'var(--blue)', bg: 'rgba(36,89,201,.12)' };
    if (ovr >= 55) return { c: 'var(--txt)', bg: 'rgba(20,22,26,.08)' };
    return { c: 'var(--muted)', bg: 'rgba(20,22,26,.045)' };
  }

  const ovrBadge = (ovr) => { const t = ovrTier(ovr); return `background:${t.bg};color:${t.c}`; };
  // Potenziale nascosto (sim.js:genPotential/potentialRange): mai il numero vero, solo una
  // fascia — così un giovane resta davvero una scommessa, non un dato già scoperto in rosa.
  const potentialBadge = (p) => { const r = potentialRange(p); return r ? ` · potenziale ${r.lo}-${r.hi}` : ''; };
  const specOf = (spec) => MANAGER_SPECS.find((s) => s.key === spec) || MANAGER_SPECS[0];
  const dsSpecOf = (spec) => DS_SPECS.find((s) => s.key === spec) || DS_SPECS[0];
  const fitnessSpecOf = (spec) => FITNESS_SPECS.find((s) => s.key === spec) || FITNESS_SPECS[0];

  /* ---------------- tutorial ----------------
     Un carosello di schermate (icona + titolo + testo), richiamabile dalla home prima di
     comprare il club: copre l'intero giro di una carriera, dalla piramide delle categorie
     al multiplayer. Le "immagini" sono piccole illustrazioni SVG inline nello stile del
     gioco (nessun asset esterno da caricare), non screenshot — coerenti con la palette e
     rese leggere anche su mobile.
  */
  const TUTORIAL_STEPS = [
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--gold)" stroke-width="4" opacity=".35"/><path d="M60 24 L69 50 L97 51 L74 67 L82 94 L60 78 L38 94 L46 67 L23 51 L51 50 Z" fill="var(--gold)"/></svg>`,
      title: 'Benvenuto, presidente',
      text: 'Sei il presidente di un club che parte dal basso della piramide italiana. Ogni scelta è tua: mercato, allenatore, sponsor, stadio, tattica. L\'obiettivo? Portarlo più in alto che puoi — o venderlo quando il prezzo è giusto.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="90" width="80" height="14" rx="3" fill="var(--muted)" opacity=".5"/><rect x="28" y="72" width="64" height="14" rx="3" fill="var(--dyn)" opacity=".6"/><rect x="36" y="54" width="48" height="14" rx="3" fill="var(--dyn)" opacity=".8"/><rect x="44" y="36" width="32" height="14" rx="3" fill="var(--gold)" opacity=".9"/><rect x="50" y="18" width="20" height="14" rx="3" fill="var(--gold)"/></svg>`,
      title: 'La piramide delle categorie',
      text: 'Sei categorie, dalla Promozione alla Serie A. All\'inizio scegli da dove partire, la difficoltà e una "situazione di partenza" (budget, tifoseria e stadio diversi): ognuna racconta una storia diversa dello stesso club.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="28" width="84" height="64" rx="12" fill="none" stroke="var(--gold)" stroke-width="4"/><circle cx="42" cy="60" r="14" fill="var(--dyn)"/><circle cx="60" cy="60" r="14" fill="var(--good)"/><circle cx="78" cy="60" r="14" fill="var(--coppa)"/><rect x="50" y="96" width="20" height="10" rx="3" fill="var(--muted)"/></svg>`,
      title: 'Costruisci la rosa',
      text: 'Il mercato funziona a "spin": uno base e uno di lusso, sempre più cari a ogni acquisto. Ogni tanto pescano un giocatore vero (o una leggenda ritirata, una volta in Serie A) invece che generato. Il settore giovanile e lo scouting migliorano le probabilità di trovare un talento.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><path d="M14 92 C14 50 40 24 60 24 C80 24 106 50 106 92" fill="none" stroke="var(--dyn)" stroke-width="6"/><rect x="24" y="80" width="72" height="14" rx="3" fill="var(--good)" opacity=".85"/><circle cx="60" cy="52" r="9" fill="var(--gold)"/></svg>`,
      title: 'Allenatore, sponsor, stadio',
      text: 'Ogni allenatore ha una specializzazione (chi fa crescere i giovani, chi tratta meglio i rinnovi, chi motiva lo spogliatoio...). Lo sponsor porta introiti fissi a stagione. Ampliare lo stadio alza la capienza e gli incassi — ma costa, e va ripagato con i risultati.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="16" width="92" height="88" rx="6" fill="none" stroke="var(--good)" stroke-width="3"/><line x1="14" y1="60" x2="106" y2="60" stroke="var(--good)" stroke-width="3"/><circle cx="60" cy="60" r="12" fill="none" stroke="var(--good)" stroke-width="3"/><circle cx="40" cy="34" r="6" fill="var(--gold)"/><circle cx="80" cy="34" r="6" fill="var(--gold)"/><circle cx="60" cy="24" r="6" fill="var(--gold)"/><circle cx="40" cy="86" r="6" fill="var(--coppa)"/><circle cx="80" cy="86" r="6" fill="var(--coppa)"/></svg>`,
      title: 'Formazione e partite',
      text: 'Scegli il modulo e, se vuoi, la probabile formazione titolare. Le partite si simulano da sole — ma con marcatori, assist, infortuni e cartellini veri, giocatore per giocatore: le statistiche di ognuno crescono stagione dopo stagione.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><path d="M40 24 H80 V44 C80 58 70 66 60 66 C50 66 40 58 40 44 Z" fill="var(--gold)"/><path d="M40 30 C26 30 26 50 42 50" fill="none" stroke="var(--gold)" stroke-width="5"/><path d="M80 30 C94 30 94 50 78 50" fill="none" stroke="var(--gold)" stroke-width="5"/><rect x="54" y="66" width="12" height="18" fill="var(--dyn)"/><rect x="42" y="84" width="36" height="10" rx="3" fill="var(--dyn-deep)"/></svg>`,
      title: 'Coppa Italia e coppe europee',
      text: 'La Coppa Italia si gioca ogni stagione, dalla Promozione in su. Arrivato in Serie A ti giochi anche Champions, Europa o Conference League in base al piazzamento: 5° e 6° posto in Europa League, 7° in Conference, le prime 4 (o la coppa vinta) in Champions.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><polyline points="18,86 42,62 60,74 100,30" fill="none" stroke="var(--good)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="30" r="9" fill="var(--gold)"/><circle cx="60" cy="74" r="6" fill="var(--good)"/><circle cx="42" cy="62" r="6" fill="var(--good)"/></svg>`,
      title: 'Fine stagione',
      text: 'A fine campionato contano promozione/retrocessione, i playoff, e se hai centrato l\'obiettivo dichiarato a inizio stagione. Tutto questo muove l\'umore dei tifosi e il gradimento della proprietà — troppo basso, e rischi l\'esonero o guai economici.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="26" width="80" height="72" rx="8" fill="none" stroke="var(--dyn)" stroke-width="4"/><line x1="20" y1="46" x2="100" y2="46" stroke="var(--dyn)" stroke-width="4"/><line x1="38" y1="16" x2="38" y2="34" stroke="var(--gold)" stroke-width="5" stroke-linecap="round"/><line x1="82" y1="16" x2="82" y2="34" stroke="var(--gold)" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="64" r="5" fill="var(--muted)"/><circle cx="60" cy="64" r="5" fill="var(--good)"/><circle cx="80" cy="64" r="5" fill="var(--muted)"/><circle cx="40" cy="80" r="5" fill="var(--muted)"/><circle cx="60" cy="80" r="5" fill="var(--muted)"/><circle cx="80" cy="80" r="5" fill="var(--gold)"/></svg>`,
      title: 'Fra una stagione e l\'altra',
      text: 'I contratti in scadenza vanno rinnovati o si perdono a zero. C\'è un mercato di gennaio a metà stagione, e uno estivo più ricco fra un anno e l\'altro. Ogni tanto scatta un "imprevisto" — un evento narrativo con conseguenze reali, a volte con una scelta da fare.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="42" r="16" fill="var(--gold)"/><path d="M14 96 C14 74 26 64 40 64 C54 64 66 74 66 96 Z" fill="var(--gold)" opacity=".85"/><circle cx="82" cy="46" r="13" fill="var(--coppa)"/><path d="M60 98 C60 80 70 70 82 70 C94 70 104 80 104 98 Z" fill="var(--coppa)" opacity=".85"/></svg>`,
      title: 'Gioca con gli amici',
      text: 'Due modalità: hotseat locale (più carriere sullo stesso dispositivo, a turno) o stanze online — crei o entri con un codice, ognuno gestisce il proprio club, poi l\'host avvia la stagione condivisa e i risultati arrivano a tutti insieme.',
    },
    {
      icon: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="14" x2="30" y2="104" stroke="var(--muted)" stroke-width="4"/><path d="M30 18 L90 18 L74 34 L90 50 L30 50 Z" fill="var(--gold)"/></svg>`,
      title: 'Pronti a cominciare',
      text: 'Il resto lo scopri giocando: ogni categoria, ogni situazione di partenza, ogni carriera racconta qualcosa di diverso. Buona fortuna, presidente.',
    },
  ];
  let tutorialStep = 0;

  function openTutorial() {
    tutorialStep = 0;
    renderTutorialStep();
  }

  function renderTutorialStep() {
    const n = TUTORIAL_STEPS.length;
    const s = TUTORIAL_STEPS[tutorialStep];
    const isFirst = tutorialStep === 0, isLast = tutorialStep === n - 1;
    overlay(`
      <div class="ow-tut-illust">${s.icon}</div>
      <h2>${s.title}</h2>
      <p>${s.text}</p>
      <div class="ow-tut-dots" role="img" aria-label="Passo ${tutorialStep + 1} di ${n}">${TUTORIAL_STEPS.map((_, i) => `<span class="${i === tutorialStep ? 'on' : ''}"></span>`).join('')}</div>
      <div class="ow-tut-nav">
        ${!isFirst ? '<button class="dyn-btn" id="tutPrev">← Indietro</button>' : ''}
        <button class="dyn-btn dyn-btn-primary" id="tutNext">${isLast ? '🎉 Inizia!' : 'Avanti →'}</button>
      </div>
      ${!isLast ? '<button type="button" class="ow-tut-skip" id="tutSkip">Salta il tutorial</button>' : ''}
    `);
    const prevBtn = $('tutPrev'); if (prevBtn) prevBtn.onclick = () => { tutorialStep--; renderTutorialStep(); };
    $('tutNext').onclick = () => { if (isLast) closeOverlay(); else { tutorialStep++; renderTutorialStep(); } };
    const skipBtn = $('tutSkip'); if (skipBtn) skipBtn.onclick = closeOverlay;
  }

  // Riprende una carriera salvata: per id specifico (scelto dall'elenco carriere) o,
  // omesso, l'ultimo slot attivo (comportamento storico di "Continua").
  function resumeDynasty(id) {
    const s = id ? loadSaveSlot(id) : loadSave();
    if (!s) return;
    S = cleanForeign(s);   // anche un salvataggio nato prima di questi controlli viene ripulito alla riapertura
    if (id) { try { localStorage.setItem('dsa_active_save', id); } catch (e) {} }
    loadPoolsForSlot(S._saveId || id);
    normSquad();
    const sc = S._screen || 'owBoardScreen';
    if (sc === 'owSeasonEndScreen' && S._end) { renderSeasonEnd(); }
    else if (sc === 'owSeasonScreen' && (S.seasonActive || (S._playoffState && !S._playoffState.done))) {
      show('owSeasonScreen'); $('owLog').innerHTML = '';
      (S.results || []).forEach(logMatch);
      if (S._playoffState) (S._playoffState.rounds || []).forEach(logPlayoffEntry);
      renderHud(); renderCups(); renderSeasonTarget();
      if (S.seasonActive && S.played === (gp() >> 1) && !S.winterDone) openWinter();
    }
    else { renderBoard(); }
    // Spin pagato ma rimasto a metà (pagina chiusa col popup dello scout aperto): il motore lo
    // ha già rimborsato per intero al caricamento (resolvePendingSpin, sim.js) e lascia la
    // cifra in S._spinRefunded proprio perché qui lo si possa dire, una volta sola.
    if (S._spinRefunded) {
      toast('↩️ Lo spin interrotto ti è stato rimborsato: +' + fmtMoney(S._spinRefunded) + '.', 'money');
      S._spinRefunded = null; saveGame();
    }
  }

  // Pannello hotseat: più proprietari (=più slot) che si passano il dispositivo a turno.
  // Non tocca l'architettura del salvataggio, orchestra solo quale slot va ripreso quando:
  // il puntatore di turno avanza appena qualcuno TOCCA "inizia il turno", non quando esce
  // dalla carriera (vedi commento su HOTSEAT_KEY in sim.js) — così qualunque via d'uscita
  // dal gioco lascia comunque pronto il turno di chi segue.
  function renderHotseatPanel() {
    const wrap = $('hotseatWrap'); if (!wrap) return;
    const idx = readSavesIndex();
    let h = readHotseat();
    if (h) {
      // Pota gli slot che nel frattempo sono spariti (carriera venduta/eliminata): una
      // sessione con meno di 2 giocatori rimasti non è più una sessione hotseat.
      h.ids = h.ids.filter((id) => idx.some((m) => m.id === id));
      if (h.ids.length < 2) { clearHotseat(); h = null; }
      else { h.turn = ((h.turn % h.ids.length) + h.ids.length) % h.ids.length; writeHotseat(h); }
    }
    if (h) {
      const metaOf = (id) => idx.find((m) => m.id === id);
      const nextMeta = metaOf(h.ids[h.turn]);
      wrap.innerHTML = `
        <div class="ow-hotseat">
          <div class="dyn-aggr-label" style="text-align:center;margin:6px 0 8px">🎮 Sessione hotseat</div>
          <button type="button" class="dyn-btn dyn-btn-primary" id="hotseatNextBtn">📱 Passa il dispositivo — tocca per il turno di ${(nextMeta && nextMeta.owner) || 'Giocatore'} (${(nextMeta && nextMeta.club) || 'Club'})</button>
          <div class="ow-hotseat-order">${h.ids.map((id, i) => { const m = metaOf(id); return `<span class="${i === h.turn ? 'on' : ''}">${(m && m.club) || '?'}</span>`; }).join(' → ')}</div>
          <button type="button" class="dyn-mini ow-danger" id="hotseatEndBtn">Termina sessione hotseat</button>
        </div>`;
      $('hotseatNextBtn').onclick = () => {
        const cur = readHotseat(); if (!cur) return;
        const id = cur.ids[cur.turn];
        cur.turn = (cur.turn + 1) % cur.ids.length;
        writeHotseat(cur);
        resumeDynasty(id);
      };
      $('hotseatEndBtn').onclick = () => { clearHotseat(); renderHotseatPanel(); };
    } else {
      wrap.innerHTML = idx.length >= 2
        ? `<button type="button" class="dyn-mini" id="hotseatCreateBtn" style="margin:8px auto 0;display:block">🎮 Crea sessione hotseat</button>`
        : '';
      const btn = $('hotseatCreateBtn');
      if (btn) btn.onclick = openHotseatPicker;
    }
  }

  // Scelta di chi partecipa (fra le carriere già salvate) e in che ordine gioca: l'ordine
  // di spunta diventa l'ordine di turno.
  function openHotseatPicker() {
    const idx = readSavesIndex().slice().sort((a, b) => b.updated - a.updated);
    const picked = [];
    overlay(`<h2>🎮 Crea sessione hotseat</h2>
      <p class="ow-sub">Spunta le carriere che si alternano sullo stesso dispositivo, nell'ordine in cui le spunti.</p>
      <div class="dyn-modal-actions" style="gap:6px">
        ${idx.map((m) => `<label class="ow-fin-row" style="cursor:pointer"><input type="checkbox" data-pick="${m.id}" style="margin-right:8px" /><span>${m.club || 'Club'}<small style="display:block;color:var(--muted)">${m.owner || ''}</small></span></label>`).join('')}
      </div>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovHotseatStart">Inizia sessione</button>
        <button class="dyn-btn" id="ovHotseatCancel">Annulla</button>
      </div>`);
    $('owOverlayModal').querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('change', () => {
      const id = el.dataset.pick;
      if (el.checked) picked.push(id); else { const i = picked.indexOf(id); if (i >= 0) picked.splice(i, 1); }
    }));
    $('ovHotseatStart').onclick = () => {
      if (picked.length < 2) { toast('Scegli almeno due carriere per la sessione hotseat.'); return; }
      writeHotseat({ ids: picked.slice(), turn: 0 });
      closeOverlay();
      renderHotseatPanel();
      toast('Sessione hotseat creata: ' + picked.length + ' giocatori.');
    };
    $('ovHotseatCancel').onclick = closeOverlay;
  }

  /* ---------------- multiplayer: stanze condivise ----------------
     Identità (nome/club) e stato per persona sincronizzati via room.php (stesso pattern
     minimale di leaderboard.php — un file JSON per stanza, niente account). La stanza vive per
     più stagioni di fila (nextRound), un round alla volta, in quattro fasi:

     1) Lobby: ognuno preme "Pronto" (solo un flag). Quando lo sono tutti l'host preme "Avvia
        sessione" (fase -> 'session'), oppure forza l'avvio anche se qualcuno manca.
     2) Sessione: ognuno gestisce la propria dirigenza per conto suo (con gli strumenti
        single-player normali, Sala del Consiglio — nessuna UI di creazione club separata, si
        riusa il sistema di salvataggio multi-slot esistente: readSavesIndex/loadSaveSlot), poi
        ripreme "Pronto" sottomettendo la carriera. Quando lo sono tutti l'host preme "Inizia
        simulazione" (o forza con chi è pronto).
     3) Simulazione: dalla seconda stagione in poi ciascun umano può essere in una categoria
        diversa dagli altri (promozioni/retrocessioni individuali) — l'host raggruppa i pronti
        per categoria (hostBeginMatchdaySim) e avanza TUTTI i gruppi di una giornata alla volta
        (stepHostMatchday, sim.js — Fase 2b) pubblicando ad ogni giornata la classifica di
        ciascun gruppo (pushMatchday): ognuno vede solo quella della propria categoria mentre
        aspetta. Quando tutte le categorie hanno finito, l'host preme "Vedi resoconto"
        (finishHostSeason + submitResult) e pubblica il risultato di tutti.
     4) Round chiuso: ciascuno scarica il proprio risultato quando vuole (resta agganciato alla
        stessa stanza/salvataggio, non se ne va); quando tutti hanno scaricato (o l'host forza)
        l'host apre la prossima stagione (nextRound), si torna al punto 2 con le carriere già
        avanzate di un anno. La dynasty dura come in singolo, fino a MAX_SEASONS (15): quando
        chi ha giocato l'ultimo round era già alla stagione 15, "Avvia la prossima stagione"
        sparisce e la stanza finisce lì (room.php: TTL lungo apposta, 180 giorni, per
        sopravvivere a settimane/mesi fra una stagione e l'altra). L'host può anche terminarla
        prima, in qualunque fase (terminate, con conferma, confirmTerminateDynasty): la stanza
        passa a 'terminated' per sempre e ciascuno vende il proprio club (mpSellAndEnd) per
        conto suo, esattamente come "Vendi il club" in singolo.
  */
  const MP_SESSION_KEY = 'dsa_mp_session';
  let mpPollTimer = null;
  // Fase vista nell'ultimo render, per suonare una notifica solo quando la stanza CAMBIA
  // fase (non ad ogni poll che ridisegna la stessa fase).
  let mpLastPhase = null;
  // Le simulazioni giornata-per-giornata in corso, SOLO nella scheda dell'host (setupHostSeason
  // + stepHostMatchday, sim.js): una per ogni categoria in cui gioca almeno un umano pronto
  // questo turno (dalla seconda stagione in poi, promozioni/retrocessioni individuali possono
  // separare i giocatori su categorie diverse). Non è persistita da nessuna parte, vive finché
  // questa pagina resta aperta.
  let mpHostRuns = null;

  function readMpSession() { try { return JSON.parse(localStorage.getItem(MP_SESSION_KEY)); } catch (e) { return null; } }
  function writeMpSession(s) { try { localStorage.setItem(MP_SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
  function clearMpSession() { try { localStorage.removeItem(MP_SESSION_KEY); } catch (e) {} }
  function stopMpPolling() { if (mpPollTimer) { clearTimeout(mpPollTimer); mpPollTimer = null; } }

  async function mpApi(action, payload) {
    const body = Object.assign({ action }, payload);
    // Ogni azione (tranne create/join, che non hanno ancora una sessione) porta con sé
    // l'authToken della sessione corrente: da questa versione playerId da solo non basta più
    // come credenziale lato server (vedi find_authed_player, room.php). Un solo punto
    // centrale invece di doverlo aggiungere a mano a ogni chiamata mpApi sparsa nel file.
    if (action !== 'create' && action !== 'join' && body.authToken == null) {
      const sess = readMpSession();
      if (sess && sess.authToken) body.authToken = sess.authToken;
    }
    // fetch() rifiuta con un TypeError in inglese ("Failed to fetch") quando la rete non c'è:
    // finiva tale e quale nel toast. Un messaggio nostro, e distinto dal caso "il server ha
    // risposto ma non con quello che ci aspettavamo" (es. hosting senza PHP, pagina d'errore).
    let res;
    try { res = await fetch('room.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { const err = new Error('Rete non raggiungibile: controlla la connessione e riprova.'); err.networkError = true; throw err; }
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) throw serverError(res, data, 'Il server delle stanze non risponde in questo momento. Riprova fra poco.');
    if (data.room) cleanRoom(data.room);
    return data;
  }

  // Un errore del server in un messaggio da mostrare. Il server risponde sempre in JSON
  // { ok:false, error } con un testo già in italiano: si usa quello, e solo se manca si ripiega
  // su una frase per codice (409 azione non più valida in questa fase, 413 corpo troppo grande,
  // 429 troppe richieste, 503 server occupato). Con 429/503 il server dice anche fra quanto
  // riprovare (Retry-After): lo si aggiunge al messaggio se il testo non lo dice già, e lo si
  // lascia sull'errore (err.retryAfter, in secondi) per chi deve rallentare da solo (il poll).
  function serverError(res, data, fallback) {
    const status = res ? res.status : 0;
    const ra = res && res.headers ? parseInt(res.headers.get('Retry-After') || '', 10) : NaN;
    let msg = (data && typeof data.error === 'string' && data.error) || '';
    if (!msg) {
      msg = status === 429 ? 'Troppe richieste in poco tempo.'
        : status === 503 ? 'Server occupato.'
        : status === 413 ? 'Dati troppo grandi per il server: la richiesta non è stata accettata.'
        : status === 409 ? 'Questa azione non è più possibile in questa fase della stanza.'
        : fallback;
    }
    if ((status === 429 || status === 503) && !/riprova/i.test(msg)) {
      msg += ra > 0 ? ' Riprova fra ' + (ra >= 90 ? Math.round(ra / 60) + ' minuti' : ra + ' second' + (ra === 1 ? 'o' : 'i')) + '.' : ' Riprova fra poco.';
    }
    const err = new Error(msg);
    err.status = status;
    if (ra > 0) err.retryAfter = ra;
    return err;
  }

  // Dopo un 409 la stanza che abbiamo sullo schermo è vecchia (es. "Sono pronto" premuto mentre
  // l'host aveva già avviato la simulazione): oltre al messaggio, si rilegge lo stato vero e si
  // ridisegna la lobby, invece di lasciare un bottone che continuerebbe a fallire.
  async function mpRefreshAfterConflict(code, playerId, e) {
    if (!e || e.status !== 409) return;
    try { const fresh = await mpFetchState(code); renderLobby(fresh, playerId); } catch (e2) {}
  }

  // Identificativo di una richiesta "entra nella stanza": se la risposta si perde per strada e
  // si riprova, il server riconosce lo stesso requestId e restituisce lo STESSO giocatore invece
  // di rispondere "c'è già un club con questo nome" (o di crearne un secondo). Resta lo stesso
  // finché non cambiano codice/nome/club o finché l'ingresso non riesce.
  let mpJoinRequest = null;
  function joinRequestId(key) {
    if (mpJoinRequest && mpJoinRequest.key === key) return mpJoinRequest.id;
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let id = '';
    try { const b = new Uint8Array(32); crypto.getRandomValues(b); b.forEach((x) => { id += A[x & 63]; }); }
    catch (e) { for (let i = 0; i < 32; i++) id += A[Math.floor(Math.random() * 64)]; }
    mpJoinRequest = { key, id };
    return id;
  }

  async function mpFetchState(code) {
    let res;
    try {
      res = await fetch('room.php?action=state&code=' + encodeURIComponent(code));
    } catch (e) {
      const err = new Error('Rete non raggiungibile.');
      err.networkError = true;
      throw err;
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) {
      const err = serverError(res, data, 'Il server delle stanze non risponde in questo momento.');
      // Solo un 404 esplicito dal server vuol dire davvero "la stanza non esiste più" —
      // qualunque altro fallimento (rete assente, 429 di rate-limit, 500, risposta non
      // valida) è temporaneo: chi lo riceve NON deve perdere la propria sessione multiplayer
      // per un blip di connessione (vedi resumeLobby).
      err.roomNotFound = res.status === 404;
      throw err;
    }
    return cleanRoom(data.room);
  }

  function openMultiplayerHub() {
    const sess = readMpSession();
    if (sess && sess.code && sess.playerId) { resumeLobby(sess.code, sess.playerId); return; }
    overlay(`<h2>👥 Gioca con gli amici</h2>
      <p class="ow-sub">Una stanza condivisa in due passi: prima tutti premono Pronto e l'host avvia la sessione; poi ognuno gestisce il proprio club per conto suo (con gli strumenti soliti) e ripreme Pronto quando ha finito. Appena lo sono tutti, l'host avvia la simulazione e ciascuno scarica il proprio risultato quando vuole.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="mpCreateBtn">🆕 Crea una stanza</button>
        <button class="dyn-btn" id="mpJoinBtn">🔑 Entra con un codice</button>
        <button class="dyn-btn" id="ovClose">Chiudi</button>
      </div>`);
    $('mpCreateBtn').onclick = openMpCreateForm;
    $('mpJoinBtn').onclick = openMpJoinForm;
    $('ovClose').onclick = closeOverlay;
  }

  // Crea SUBITO una carriera vera per la stanza (categoria/difficoltà della stanza, una
  // situazione di partenza a caso, come le altre create in singolo): nessuna carriera da
  // scegliere/gestire a parte, entrare nella stanza significa avere già un club pronto da
  // rifinire (comprare giocatori, allenatore, sponsor) prima di premere Pronto.
  function createRoomCareer(name, club, div, difficulty) {
    const t = pick(genTakeovers(div));
    startDynasty(name, t, club, div, difficulty);
    saveGame();
    return S._saveId;
  }

  function openMpCreateForm() {
    overlay(`<h2>🆕 Crea una stanza</h2>
      <label class="dyn-field"><span>Nome della stanza (facoltativo)</span><input id="mpRoomName" type="text" maxlength="30" placeholder="Es. Lega degli amici" autocomplete="off" /></label>
      <label class="dyn-field"><span>Il tuo nome</span><input id="mpName" type="text" maxlength="18" placeholder="Il tuo nome" autocomplete="off" /></label>
      <label class="dyn-field"><span>Nome del tuo club</span><input id="mpClub" type="text" maxlength="24" placeholder="Nome del club" autocomplete="off" /></label>
      <label class="dyn-field"><span>Categoria di partenza (condivisa da tutti)</span>
        <select id="mpDiv">${DIVS.map((d, i) => `<option value="${i}">${d.name}</option>`).join('')}</select>
      </label>
      <label class="dyn-field"><span>Difficoltà (condivisa da tutti)</span>
        <select id="mpDiff">${DIFFICULTIES.map((d) => `<option value="${d.key}" ${d.key === 'medio' ? 'selected' : ''}>${d.label}</option>`).join('')}</select>
      </label>
      <p class="ow-sub">Appena crei la stanza ti assegniamo subito un club nuovo in questa categoria: potrai rifinirlo (giocatori, allenatore, sponsor) prima di premere Pronto.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="mpCreateGo">Crea stanza</button>
        <button class="dyn-btn" id="mpBack" data-esc>Indietro</button>
      </div>`);
    $('mpCreateGo').onclick = withBusy($('mpCreateGo'), async () => {
      const name = cleanText(($('mpName').value || '').trim()), club = cleanText(($('mpClub').value || '').trim());
      if (!name || !club) { toast('Inserisci nome e club.', 'error'); (name ? $('mpClub') : $('mpName')).focus(); return; }
      const div = +$('mpDiv').value, difficulty = $('mpDiff').value;
      const roomName = ($('mpRoomName').value || '').trim();
      try {
        const data = await mpApi('create', { name, club, div, difficulty, roomName });
        // Nome e club come li ha registrati il server (che li ripulisce a modo suo): la carriera
        // locale deve chiamarsi ESATTAMENTE come il giocatore nella stanza, perché classifica
        // live e risultati si ritrovano per nome del club.
        const mine = (data.room.players || []).find((p) => p.id === data.playerId) || {};
        const saveId = createRoomCareer(mine.name || name, mine.club || club, div, difficulty);
        writeMpSession({ code: data.room.code, playerId: data.playerId, authToken: data.authToken, saveId });
        mpLastPhase = null;
        renderLobby(data.room, data.playerId);
      } catch (e) { toast(e.message || 'Impossibile creare la stanza.', 'error'); }
    });
    $('mpBack').onclick = openMultiplayerHub;
  }

  function openMpJoinForm() {
    overlay(`<h2>🔑 Entra in una stanza</h2>
      <label class="dyn-field"><span>Codice stanza</span><input id="mpCode" type="text" maxlength="4" placeholder="ABCD" style="text-transform:uppercase" autocomplete="off" /></label>
      <label class="dyn-field"><span>Il tuo nome</span><input id="mpName" type="text" maxlength="18" placeholder="Il tuo nome" autocomplete="off" /></label>
      <label class="dyn-field"><span>Nome del tuo club</span><input id="mpClub" type="text" maxlength="24" placeholder="Nome del club" autocomplete="off" /></label>
      <label class="dyn-field"><span>Categoria di partenza</span>
        <select id="mpJoinDiv"><option value="">Stessa della stanza</option>${DIVS.map((d, i) => `<option value="${i}">${d.name}</option>`).join('')}</select>
      </label>
      <p class="ow-sub">Appena entri ti assegniamo subito un club nuovo: potrai rifinirlo prima di premere Pronto. Se la dynasty è già avanti e gli altri sono ormai in categorie diverse, scegli pure la tua invece di ereditare quella con cui la stanza è nata.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="mpJoinGo">Entra</button>
        <button class="dyn-btn" id="mpBack" data-esc>Indietro</button>
      </div>`);
    $('mpJoinGo').onclick = withBusy($('mpJoinGo'), async () => {
      const code = ($('mpCode').value || '').trim().toUpperCase();
      const name = cleanText(($('mpName').value || '').trim()), club = cleanText(($('mpClub').value || '').trim());
      const divVal = $('mpJoinDiv').value;
      if (!code || !name || !club) { toast('Compila tutti i campi.', 'error'); return; }
      try {
        const payload = { code, name, club, requestId: joinRequestId(code + '|' + name + '|' + club) };
        if (divVal !== '') payload.div = +divVal;
        const data = await mpApi('join', payload);
        mpJoinRequest = null;
        const me = data.room.players.find((p) => p.id === data.playerId);
        const div = (me && me.joinDiv != null) ? me.joinDiv : data.room.div;
        const saveId = createRoomCareer((me && me.name) || name, (me && me.club) || club, div, data.room.difficulty);
        writeMpSession({ code, playerId: data.playerId, authToken: data.authToken, saveId });
        mpLastPhase = null;
        renderLobby(data.room, data.playerId);
      } catch (e) { toast(e.message || 'Impossibile entrare nella stanza.', 'error'); }
    });
    $('mpBack').onclick = openMultiplayerHub;
  }

  async function resumeLobby(code, playerId) {
    try {
      const room = await mpFetchState(code);
      if (!room.players.some((p) => p.id === playerId)) { clearMpSession(); openMultiplayerHub(); return; }
      renderLobby(room, playerId);
    } catch (e) {
      // Prima qualunque errore (anche solo la rete assente in quel momento) cancellava la
      // sessione multiplayer e riportava alla schermata "crea/entra" — un timeout temporaneo
      // alla riapertura dell'app perdeva il codice stanza senza spiegazione. Ora si cancella
      // la sessione SOLO se il server ha risposto esplicitamente "stanza non trovata" (404);
      // per ogni altro errore si offre di riprovare, senza perdere nulla.
      if (e.roomNotFound) { clearMpSession(); openMultiplayerHub(); return; }
      showMpConnectionError(code, playerId, e.message);
    }
  }

  // Schermata di riprova quando non si riesce a contattare il server per aggiornare/riaprire
  // una stanza (rete assente, server momentaneamente giù, rate-limit): la sessione resta
  // salvata, l'utente sceglie se riprovare o abbandonarla esplicitamente.
  function showMpConnectionError(code, playerId, detail) {
    overlay(`<h2>⚠️ Connessione al server non riuscita</h2>
      <p class="ow-sub" style="text-align:center">${detail ? escapeHtml(detail) : 'Non riesco a contattare il server in questo momento.'} La tua sessione multiplayer resta salvata: riprova quando la connessione torna, o esci se preferisci ricominciare da qui.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="mpRetryBtn">🔄 Riprova</button>
        <button class="dyn-btn" id="mpLeaveSessionBtn">Esci dalla sessione</button>
      </div>`);
    $('mpRetryBtn').onclick = () => { closeOverlay(); resumeLobby(code, playerId); };
    $('mpLeaveSessionBtn').onclick = () => { closeOverlay(); clearMpSession(); openMultiplayerHub(); };
  }

  function renderLobby(room, playerId) {
    stopMpPolling();
    const me = room.players.find((p) => p.id === playerId);
    const isHost = room.hostId === playerId;
    const done = room.phase === 'done';
    const inLobbyStage = room.phase === 'lobby' || room.phase === 'allReadyLobby';
    const inSessionStage = room.phase === 'session' || room.phase === 'readyForSim';
    const inSimStage = room.phase === 'simulating';
    const allLobbyReady = room.phase === 'allReadyLobby';
    const allSessionReady = room.phase === 'readyForSim';
    const readyCount = room.players.filter((p) => p.ready).length;
    const total = room.players.length;
    const ackedCount = room.players.filter((p) => p.acked).length;
    const allAcked = total > 0 && ackedCount === total;
    const live = room.live || null;
    // "Vedi resoconto" richiede che TUTTE le categorie coinvolte abbiano finito le proprie
    // giornate: live.matchday/live.total sono già il massimo fra tutte (vedi pushMatchdaySnapshot).
    const simDone = !!(live && live.matchday >= live.total);
    // Dalla seconda stagione in poi ciascun umano può essere in una categoria diversa dagli
    // altri (promozioni/retrocessioni individuali): ognuno vede SOLO il gruppo/categoria a cui
    // appartiene lui, non un'unica classifica condivisa. L'appartenenza si legge dalla propria
    // ultima carriera sottomessa (me.state.div), ancora presente durante tutta la simulazione.
    const myDiv = me && me.state ? me.state.div : null;
    const myGroup = live && live.groups ? live.groups.find((g) => g.div === myDiv) : null;
    const myGroupDone = !!(myGroup && myGroup.matchday >= myGroup.total);
    // La dynasty dura come in singolo, fino a MAX_SEASONS: quando chi ha giocato questo round
    // era già all'ultima stagione, non ha senso offrire "Avvia la prossima stagione" — la
    // stanza si chiude qui, ognuno scarica il proprio resoconto finale.
    const participants = room.players.filter((p) => p.state);
    const dynastyOver = done && participants.length > 0 && participants.every((p) => p.state.season >= MAX_SEASONS);
    // L'host può terminare la dynasty in anticipo (prima delle 20 stagioni): fase finale, da
    // cui non si torna indietro — ognuno vende il proprio club per conto suo.
    const terminated = room.phase === 'terminated';

    let stageLabel = '';
    if (terminated) stageLabel = '🛑 L\'host ha concluso la dynasty di questa stanza in anticipo: vendi il tuo club quando vuoi per chiudere la tua carriera.';
    else if (inLobbyStage) stageLabel = '⏳ In attesa che tutti siano pronti, poi l\'host avvia la sessione.';
    else if (inSessionStage) stageLabel = '🏟️ Sessione avviata: gestisci il tuo club, poi ripremi Pronto quando hai finito.';
    else if (inSimStage) {
      if (!myGroup) stageLabel = '⚽ Simulazione in corso — non fai parte di questo turno.';
      else stageLabel = myGroupDone ? '🏁 La tua stagione è simulata: in attesa che l\'host pubblichi il resoconto di tutti.' : ('⚽ Simulazione in corso — ' + (myGroup.divName || '') + ', giornata ' + myGroup.matchday + '/' + myGroup.total + '.');
    } else if (dynastyOver) stageLabel = '🏆 Dynasty conclusa dopo ' + MAX_SEASONS + ' stagioni! Scarica il tuo resoconto finale quando vuoi.';
    else if (done) stageLabel = '🏁 Stagione pronta! Scarica il tuo risultato quando vuoi.';

    // Un suono (e, se concesso, una notifica di sistema se la scheda è in background) solo
    // quando la fase è appena cambiata rispetto all'ultimo render — non ad ogni poll che
    // ridisegna la stessa fase — così anche chi non ha appena cliccato un bottone si accorge
    // che la stanza è passata avanti anche senza tenere la pagina in primo piano.
    if (mpLastPhase !== null && mpLastPhase !== room.phase) {
      if (DynSound) {
        if (room.phase === 'session' || room.phase === 'simulating' || room.phase === 'done') DynSound.chime();
        else if (room.phase === 'allReadyLobby' || room.phase === 'readyForSim') DynSound.notify();
        else if (room.phase === 'terminated') DynSound.sadDown();
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        try { new Notification('👥 Stanza ' + room.code, { body: stageLabel || 'Qualcosa è cambiato nella stanza.' }); } catch (e) {}
      }
    }
    mpLastPhase = room.phase;

    // Durante la simulazione niente più elenco "chi è pronto": al suo posto la classifica
    // della TUA categoria, che si aggiorna ad ogni giornata che l'host manda avanti — con
    // l'ultimo risultato che hai giocato in evidenza (buildMatchdayNews), sfide fra presidenti
    // segnalate a parte invece di passare come una partita come le altre.
    const playersListHTML = `<div class="dyn-modal-actions" style="gap:6px">
        ${room.players.map((p) => `<div class="ow-fin-row"><span>${escapeHtml(p.club)}${p.id === room.hostId ? ' 👑' : ''}${p.bot ? ' 🤖' : ''}<small style="display:block;color:var(--muted)">${escapeHtml(p.name)}</small></span><b class="${p.ready ? 'good' : ''}">${p.bot ? '🤖 Bot' : p.ready ? '✅ Pronto' : '⏳ In attesa'}</b>${isHost && p.id !== playerId && !p.bot ? `<button class="ow-x" data-kick="${escapeHtml(p.id)}" title="Espelli dalla stanza" aria-label="Espelli ${escapeHtml(p.club)} dalla stanza">✖</button><button class="ow-x" data-adopt="${escapeHtml(p.id)}" title="Non risponde più? Fai giocare il suo club alla IA per il resto della stanza">🤖</button>` : ''}</div>`).join('')}
      </div>
      ${!isHost ? `<button class="dyn-mini" id="mpClaimHostBtn" title="Solo se l'host sembra sparito da un po'">👑 L'host non risponde: prendi il comando</button>` : ''}`;
    const myNews = myGroup && myGroup.news ? myGroup.news.find((n) => me && n.club === me.club) : null;
    const newsHTML = myNews ? `<div class="ow-fin-row" style="margin-bottom:6px"><span>${myNews.vsHuman ? '🤝 Sfida fra presidenti vs ' + escapeHtml(myNews.vsHumanClub) : (myNews.home ? 'In casa vs ' : 'In trasferta vs ') + escapeHtml(myNews.opp)}</span><b class="${myNews.res === 'W' ? 'good' : myNews.res === 'L' ? 'bad' : ''}">${escapeHtml(myNews.gf)}-${escapeHtml(myNews.ga)}</b></div>` : '';
    // Scouting sul prossimo avversario (renderScouting, single player, stesso principio):
    // qui il dato arriva già pronto dallo snapshot dell'host (buildMatchdayNews), perché il
    // tuo ctx.opps/ctx.fixtures veri non esistono in questo browser durante la simulazione.
    const scoutDef = myNews && myNews.nextOpp ? CLUB_PERSONALITIES[myNews.nextOpp.personality] : null;
    const scoutHTML = myNews && myNews.nextOpp ? `<div class="ow-scout-card" style="margin:0 0 6px">
      <div class="ow-scout-row"><span>${myNews.nextOpp.home ? '🏠 Prossima in casa vs' : '✈️ Prossima in trasferta vs'} <b>${escapeHtml(myNews.nextOpp.name)}</b></span></div>
      ${scoutDef ? `<div class="ow-scout-row ow-scout-report"><span>${scoutDef.icon} ${scoutDef.label}</span><small>${scoutDef.desc}</small></div>` : ''}
    </div>` : '';
    // Classifica intera della TUA categoria (tutte le squadre, non solo gli umani della
    // stanza): stesse zone colorate (promozione/playoff/retrocessione/coppe) della classifica
    // del singolo giocatore, con le righe umane in evidenza (classe "me") invece di una sola.
    const d = DIVS[myDiv] || {};
    const liveTableHTML = `${newsHTML}${scoutHTML}<div style="max-height:44vh;overflow:auto;margin:0 -6px">
      ${myGroup ? `<table class="dyn-table"><thead><tr><th>Squadra</th><th>Mister</th><th class="num">Pt</th><th class="num">DR</th></tr></thead><tbody>${myGroup.table.map((r, i) => {
        const zone = (d.euroSpots && i < d.euroSpots) ? 'ucl' : (d.uelSpots && i >= d.euroSpots && i < d.euroSpots + d.uelSpots) ? 'uel' : (d.confPos && i === d.confPos - 1) ? 'conf' : (d.promoted && i < d.promoted) ? 'ucl' : (d.playoff && i >= d.promoted && i < d.promoted + d.playoff) ? 'po' : (d.releg && i >= d.teams - d.releg) ? 'rel' : '';
        return `<tr class="${r.isHuman ? 'me' : ''} ${zone}"><td>${i + 1}. ${escapeHtml(r.club)}</td><td style="font-size:11px;color:var(--muted)">${r.mgr ? escapeHtml(r.mgr) : '-'}</td><td class="num">${escapeHtml(r.pts)}</td><td class="num">${r.gd > 0 ? '+' : ''}${escapeHtml(r.gd)}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="ow-sub">In attesa che l\'host avvii la simulazione…</div>'}
      </div>`;
    // Trattative dirette fra umani (room.trades, respondTrade/proposeTrade in room.php): niente
    // rosa altrui da sfogliare (non esiste una vista per quello), il nome del giocatore lo si
    // scopre altrove (chat, conoscenza della stanza) — qui solo la trattativa in sé. Ha senso
    // solo mentre si è nella propria dirigenza (S deve essere DAVVERO la carriera di chi guarda,
    // vedi mySaveActive), mai durante la simulazione o a round chiuso.
    const mpSessForTrades = readMpSession();
    const mySaveActive = !!(mpSessForTrades && mpSessForTrades.code === room.code && S && S._saveId && S._saveId === mpSessForTrades.saveId);
    const showTrades = !inSimStage && !done && !terminated;
    const trades = room.trades || [];
    const otherHumans = room.players.filter((p) => p.id !== playerId && !p.bot);
    const incoming = trades.filter((t) => t.toId === playerId && t.status === 'pending');
    const counters = trades.filter((t) => t.toId === playerId && t.status === 'countered');
    const myProposals = trades.filter((t) => t.fromId === playerId && (t.status === 'pending' || t.status === 'countered'));
    const appliedIds = (S && S._appliedTrades) || [];
    const toReceive = trades.filter((t) => t.fromId === playerId && t.status === 'accepted' && t.playerSnapshot && appliedIds.indexOf(t.id) === -1);
    const toFinalizeSale = trades.filter((t) => t.toId === playerId && t.status === 'accepted' && t.playerSnapshot && appliedIds.indexOf(t.id) === -1);
    // Cosa c'è davvero sul piatto: solo cash, solo scambio, o entrambi — una frase sola invece
    // di ripetere la stessa logica in ogni riga (in arrivo, controproposte, mie proposte...).
    const tradeOfferLabel = (t, feeAmount) => {
      const parts = [];
      if (t.offerPlayerName) parts.push('<b>' + escapeHtml(t.offerPlayerName) + '</b>');
      if (feeAmount > 0 || !t.offerPlayerName) parts.push('<b>' + fmtMoney(feeAmount) + '</b>');
      return parts.join(' + ');
    };
    const tradesHTML = !showTrades ? '' : `
      <div class="ow-sec-title" style="margin-top:10px">🤝 Trattative di mercato</div>
      ${!mySaveActive ? '<div class="ow-sub">Apri la tua carriera (torna in Dirigenza da un\'altra carriera, poi rientra qui) per proporre o rispondere a una trattativa.</div>' : `
        ${toReceive.length ? toReceive.map((t) => `<div class="ow-fin-row" style="background:rgba(14,138,76,.1);border-radius:8px"><span>📥 ${escapeHtml(t.playerSnapshot.n)} da ${escapeHtml(t.toClub)}${t.offerPlayerName ? ' (in cambio di ' + escapeHtml(t.offerPlayerName) + ')' : ''}, accordo raggiunto</span><button class="dyn-mini" data-recv="${escapeHtml(t.id)}">Ricevi${t.fee > 0 ? ' · ' + fmtMoney(t.fee) : ''}</button></div>`).join('') : ''}
        ${toFinalizeSale.length ? toFinalizeSale.map((t) => `<div class="ow-fin-row" style="background:rgba(14,138,76,.1);border-radius:8px"><span>💷 Accordo raggiunto con ${escapeHtml(t.fromClub)} per ${escapeHtml(t.playerSnapshot.n)}${t.offerPlayerName ? ' (ricevi anche ' + escapeHtml(t.offerPlayerName) + ')' : ''}</span><button class="dyn-mini" data-finalize="${escapeHtml(t.id)}">Conferma cessione${t.fee > 0 ? ' · +' + fmtMoney(t.fee) : ''}</button></div>`).join('') : ''}
        ${incoming.map((t) => `<div class="ow-fin-row" style="align-items:flex-start"><span>${escapeHtml(t.fromClub)} offre ${tradeOfferLabel(t, t.fee)} per <b>${escapeHtml(t.playerName)}</b></span><span style="display:flex;gap:4px"><button class="dyn-mini" data-tacc="${escapeHtml(t.id)}">Accetta</button><button class="dyn-mini" data-tcnt="${escapeHtml(t.id)}">🤝</button><button class="dyn-mini ow-reject" data-trej="${escapeHtml(t.id)}">Rifiuta</button></span></div>`).join('')}
        ${counters.map((t) => `<div class="ow-fin-row"><span>Hai già controproposto ${tradeOfferLabel({ ...t, offerPlayerName: null }, t.counterFee)} a ${escapeHtml(t.fromClub)} per ${escapeHtml(t.playerName)}${t.offerPlayerName ? ' (in cambio di ' + escapeHtml(t.offerPlayerName) + ')' : ''}: in attesa</span></div>`).join('')}
        ${myProposals.map((t) => `<div class="ow-fin-row" style="align-items:flex-start"><span>${t.status === 'countered' ? `${escapeHtml(t.toClub)} contropropone ${fmtMoney(t.counterFee)} per ${escapeHtml(t.playerName)}` : `In attesa: ${tradeOfferLabel(t, t.fee)} a ${escapeHtml(t.toClub)} per ${escapeHtml(t.playerName)}`}</span><span style="display:flex;gap:4px">${t.status === 'countered' ? `<button class="dyn-mini" data-tacccnt="${escapeHtml(t.id)}">Accetta</button><button class="dyn-mini ow-reject" data-trej="${escapeHtml(t.id)}">Rifiuta</button>` : `<button class="dyn-mini ow-reject" data-tcancel="${escapeHtml(t.id)}">Annulla</button>`}</span></div>`).join('')}
        ${otherHumans.length ? `
        <div class="ow-fin-row" style="flex-wrap:wrap;gap:6px">
          <select id="mpTradeTarget" aria-label="Club a cui proporre" style="flex:1;min-width:110px">${otherHumans.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.club)}</option>`).join('')}</select>
          <input id="mpTradePlayer" type="text" maxlength="40" placeholder="Nome giocatore richiesto" style="flex:1;min-width:110px" />
        </div>
        <div class="ow-fin-row" style="flex-wrap:wrap;gap:6px">
          <input id="mpTradeOfferPlayer" type="text" maxlength="40" placeholder="Un tuo giocatore in cambio (opzionale)" style="flex:1;min-width:110px" />
          <input id="mpTradeFee" type="number" min="0" step="10000" placeholder="+ cash (opzionale)" style="width:130px" />
          <button class="dyn-btn" id="mpTradeSend">Proponi</button>
        </div>` : '<div class="ow-sub">Nessun altro club umano nella stanza al momento.</div>'}
      `}`;
    // Annuncio fisso dell'host: a differenza della chat (che scorre e si perde), resta pinnato
    // finché l'host non lo cambia — regole della stanza, obiettivo condiviso della dynasty, ecc.
    const announceHTML = `
      ${room.announcement ? `<div class="ow-sec-title" style="margin-top:10px">📌 Annuncio dell'host</div><div class="ow-fin-row" style="background:rgba(201,144,47,.12);border-radius:8px">${escapeHtml(room.announcement)}</div>` : ''}
      ${isHost ? `<button class="dyn-mini" id="mpAnnounceBtn" style="margin-top:${room.announcement ? '6px' : '10px'}">📌 ${room.announcement ? 'Modifica annuncio' : 'Fissa un annuncio'}</button>` : ''}`;
    // Chat semplicissima della stanza: ultimi messaggi (room.chat, room.php li tiene già
    // limitati agli ultimi 60) più un campo per scriverne uno nuovo — visibile in ogni fase,
    // per coordinarsi senza dover uscire dall'app.
    const chat = room.chat || [];
    const chatHTML = `
      <div class="ow-sec-title" style="margin-top:10px">💬 Chat della stanza</div>
      <div id="mpChatLog" style="max-height:100px;overflow:auto;font-size:12px;background:rgba(127,127,127,.08);border-radius:8px;padding:6px 8px;margin-bottom:6px">
        ${chat.length ? chat.map((m) => `<div style="margin-bottom:2px"><b>${escapeHtml(m.club || m.name)}:</b> ${escapeHtml(m.text)}</div>`).join('') : '<div class="ow-sub" style="margin:0">Nessun messaggio ancora.</div>'}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input id="mpChatInput" type="text" maxlength="200" placeholder="Scrivi un messaggio…" autocomplete="off" style="flex:1;min-width:0" />
        <button class="dyn-btn dyn-btn-primary" id="mpChatSend">Invia</button>
      </div>`;
    const canNotify = typeof Notification !== 'undefined';

    overlay(`
      <h2>👥 ${room.name ? escapeHtml(room.name) : ('Stanza ' + escapeHtml(room.code))}${isHost ? ` <button class="ow-x" id="mpRenameBtn" title="Rinomina stanza" style="font-size:13px;vertical-align:middle">✏️</button>` : ''}</h2>
      <p class="ow-sub">${(DIVS[room.div] || {}).name || ''} · condividi il codice <b>${escapeHtml(room.code)}</b> con chi manca.</p>
      <p class="ow-sub" style="text-align:center">${escapeHtml(stageLabel)}</p>
      ${inSimStage ? liveTableHTML : playersListHTML}
      ${tradesHTML}
      ${announceHTML}
      ${chatHTML}
      <div class="dyn-modal-actions">
        ${terminated ? `
          <button class="dyn-btn dyn-btn-primary" id="mpSellEndBtn">💷 Vendi il club e concludi la carriera</button>
        ` : done ? `
          <div class="ow-sub" style="text-align:center">${ackedCount}/${total} hanno scaricato il resoconto</div>
          <button class="dyn-btn dyn-btn-primary" id="mpDownloadBtn">📥 Scarica il tuo risultato</button>
          ${dynastyOver ? `<div class="ow-sub" style="text-align:center">🏆 Nessuna stagione successiva: la dynasty di questa stanza finisce qui.</div>` : `
            ${isHost ? `<button class="dyn-btn dyn-btn-primary" id="mpNextRoundBtn" ${allAcked ? '' : 'disabled'}>▶️ Avvia la prossima stagione${allAcked ? '' : ' (' + ackedCount + '/' + total + ')'}</button>` : ''}
            ${isHost && !allAcked ? `<button class="dyn-btn" id="mpForceNextRoundBtn">⏭️ Forza senza aspettare tutti</button>` : ''}
          `}
        ` : inSimStage ? `
          ${isHost ? (!mpHostRuns
            ? `<button class="dyn-btn dyn-btn-primary" id="mpResumeSimBtn">🔄 Riprendi la simulazione da qui</button>`
            : simDone
              ? `<button class="dyn-btn dyn-btn-primary" id="mpFinishBtn">🏁 Vedi resoconto</button>`
              : `<button class="dyn-btn dyn-btn-primary" id="mpNextDayBtn">▶️ Prossima giornata${live ? ' (' + escapeHtml(live.matchday) + '/' + escapeHtml(live.total) + ')' : ''}</button>`)
            : `<div class="ow-sub">⏳ L'host sta simulando le giornate, aggiornamento automatico.</div>`}
        ` : `
          ${inSessionStage && !(me && me.ready) ? `<button class="dyn-btn dyn-btn-primary" id="mpManageBtn">🏟️ Gestisci la tua squadra</button>` : ''}
          <button class="dyn-btn ${inSessionStage && !(me && me.ready) ? '' : (me && me.ready ? '' : 'dyn-btn-primary')}" id="mpReadyBtn">${me && me.ready ? 'Non sono più pronto' : '✅ Sono pronto'}</button>
          ${isHost && inLobbyStage ? `<button class="dyn-btn dyn-btn-primary" id="mpStartSessionBtn" ${allLobbyReady ? '' : 'disabled'}>▶️ Avvia sessione${allLobbyReady ? '' : ' (' + readyCount + '/' + total + ' pronti)'}</button>` : ''}
          ${isHost && inLobbyStage && !allLobbyReady && total > 1 ? `<button class="dyn-btn" id="mpForceSessionBtn">⏭️ Forza avvio senza aspettare tutti</button>` : ''}
          ${isHost && inSessionStage ? `<button class="dyn-btn dyn-btn-primary" id="mpStartSimBtn" ${allSessionReady ? '' : 'disabled'}>▶️ Inizia simulazione${allSessionReady ? '' : ' (' + readyCount + '/' + total + ' pronti)'}</button>` : ''}
          ${isHost && inSessionStage && !allSessionReady && readyCount > 0 ? `<button class="dyn-btn" id="mpForceSimBtn">⏭️ Forza simulazione senza aspettare tutti</button>` : ''}
        `}
        <button class="dyn-btn" id="mpHofBtn">🏆 Albo d'oro della stanza</button>
        ${canNotify && Notification.permission === 'default' ? `<button class="dyn-btn" id="mpNotifyBtn">🔔 Avvisami se cambia qualcosa</button>` : ''}
        ${isHost && !terminated ? `<button class="dyn-btn ow-danger" id="mpTerminateBtn">🛑 Termina la dynasty per tutti</button>` : ''}
        <button class="dyn-btn ow-danger" id="mpLeaveBtn">Esci dalla stanza</button>
      </div>`);
    const chatLogEl = $('mpChatLog'); if (chatLogEl) chatLogEl.scrollTop = chatLogEl.scrollHeight;
    const renameBtn = $('mpRenameBtn');
    if (renameBtn) renameBtn.onclick = () => confirmRenameRoom(room, playerId);
    const announceBtn = $('mpAnnounceBtn');
    if (announceBtn) announceBtn.onclick = () => confirmAnnounce(room, playerId);
    document.querySelectorAll('#owOverlayModal [data-kick]').forEach((el) => el.addEventListener('click', () => confirmKickPlayer(room, playerId, el.dataset.kick)));
    document.querySelectorAll('#owOverlayModal [data-adopt]').forEach((el) => el.addEventListener('click', () => confirmAdoptBot(room, playerId, el.dataset.adopt)));
    const claimHostBtn = $('mpClaimHostBtn');
    if (claimHostBtn) claimHostBtn.addEventListener('click', async () => {
      try { const data = await mpApi('claimHost', { code: room.code, playerId }); toast('👑 Ora sei tu l\'host di questa stanza.', 'success'); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile prendere il comando della stanza.', 'error'); }
    });
    const tradeSendBtn = $('mpTradeSend');
    if (tradeSendBtn) tradeSendBtn.onclick = async () => {
      const targetId = $('mpTradeTarget').value;
      const playerName = ($('mpTradePlayer').value || '').trim();
      const offerPlayerName = ($('mpTradeOfferPlayer').value || '').trim();
      const fee = Math.max(0, Math.round(+($('mpTradeFee').value || 0)));
      if (!playerName) { toast('Scrivi il nome del giocatore che vuoi ottenere.', 'error'); return; }
      let offerPlayerSnapshot = null;
      if (offerPlayerName) {
        const op = S.squad.find((p) => p.n.toLowerCase() === offerPlayerName.toLowerCase());
        if (!op) { toast('Non trovi "' + offerPlayerName + '" nella tua rosa: controlla il nome esatto.', 'error'); return; }
        offerPlayerSnapshot = { n: op.n, pos: op.pos, ovr: op.ovr, age: op.age, wage: op.wage, yrs: op.yrs, potential: op.potential, nat: op.nat };
      }
      if (!offerPlayerName && fee <= 0) { toast('Offri almeno un giocatore o una cifra in cash.', 'error'); return; }
      try {
        const data = await mpApi('proposeTrade', { code: room.code, playerId, targetId, playerName, fee, offerPlayerName, offerPlayerSnapshot });
        toast('Proposta inviata.', 'success'); renderLobby(data.room, playerId);
      } catch (e) { toast(e.message || 'Impossibile inviare la proposta.', 'error'); }
    };
    // Accetta una richiesta ricevuta (io sono il venditore): il giocatore va cercato per nome
    // nella MIA rosa vera (S.squad) — è l'unico posto dove esiste davvero, chi propone non lo
    // vede. Se non lo trovo (nome scritto male, già venduto altrove) non posso accettare alla
    // cieca: meglio avvisare che inviare una trattativa che il server rifiuterebbe comunque.
    // Accettare/controproporre non tocca ancora la rosa: solo segnala l'accordo al server. La
    // cessione vera (splice + credito) avviene con un secondo click esplicito su "Conferma
    // cessione" (data-finalize, sotto) quando l'accordo è definitivo — stessa idea del
    // compratore che clicca "Ricevi" (data-recv): mai una mutazione di rosa/budget silenziosa
    // al solo arrivo di un poll.
    document.querySelectorAll('#owOverlayModal [data-tacc]').forEach((el) => el.addEventListener('click', async () => {
      const t = trades.find((x) => x.id === el.dataset.tacc); if (!t) return;
      const p = S.squad.find((x) => x.n.toLowerCase() === t.playerName.toLowerCase());
      if (!p) { toast('Non trovo "' + escapeHtml(t.playerName) + '" nella tua rosa: controlla il nome esatto, o rifiuta la proposta.', 'error'); return; }
      try {
        const data = await mpApi('respondTrade', { code: room.code, playerId, tradeId: t.id, response: 'accept', playerSnapshot: { n: p.n, pos: p.pos, ovr: p.ovr, age: p.age, wage: p.wage, yrs: p.yrs, potential: p.potential, nat: p.nat } });
        toast('Accordo raggiunto con ' + escapeHtml(t.fromClub) + ': conferma la cessione qui sotto per finalizzarla.', 'success');
        renderLobby(data.room, playerId);
      } catch (e) { toast(e.message || 'Impossibile accettare la proposta.', 'error'); }
    }));
    document.querySelectorAll('#owOverlayModal [data-finalize]').forEach((el) => el.addEventListener('click', () => {
      const t = trades.find((x) => x.id === el.dataset.finalize); if (!t || !t.playerSnapshot) return;
      const i = S.squad.findIndex((p) => p.n.toLowerCase() === t.playerSnapshot.n.toLowerCase());
      if (i < 0) { toast('Il giocatore non è più nella tua rosa (già venduto altrove?): la trattativa resta bloccata, contatta l\'host.', 'error'); return; }
      const p = S.squad[i];
      pushAlumnus(p); S.budget += t.fee; S.squad.splice(i, 1);
      // Scambio: se la trattativa portava anche un giocatore in cambio, si aggrega ora alla rosa.
      if (t.offerPlayerSnapshot) S.squad.push({ ...t.offerPlayerSnapshot, pid: newPid(), seasonGoals: 0, seasonAssists: 0, seasonCleanSheets: 0, seasonApps: 0, outWeeks: 0, suspMatches: 0 });
      if (!S._appliedTrades) S._appliedTrades = [];
      S._appliedTrades.push(t.id);
      saveGame();
      toast('Ceduto ' + p.n + ' a ' + escapeHtml(t.fromClub) + (t.fee > 0 ? ' per ' + fmtMoney(t.fee) : '') + (t.offerPlayerSnapshot ? ', in cambio di ' + escapeHtml(t.offerPlayerSnapshot.n) : '') + '.', 'money');
      renderLobby(room, playerId);
    }));
    document.querySelectorAll('#owOverlayModal [data-trej]').forEach((el) => el.addEventListener('click', async () => {
      try { const data = await mpApi('respondTrade', { code: room.code, playerId, tradeId: el.dataset.trej, response: 'reject' }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile rifiutare la proposta.', 'error'); }
    }));
    document.querySelectorAll('#owOverlayModal [data-tcancel]').forEach((el) => el.addEventListener('click', async () => {
      try { const data = await mpApi('respondTrade', { code: room.code, playerId, tradeId: el.dataset.tcancel, response: 'cancel' }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile annullare la proposta.', 'error'); }
    }));
    // Il compratore accetta la controproposta: il venditore ha già allegato il giocatore vero
    // al momento di controproporre (room.php: 'counter' richiede uno snapshot esattamente come
    // 'accept'), quindi qui basta chiudere sul prezzo — la cessione è già pronta, comparirà fra
    // "da ricevere" (toReceive) al prossimo render.
    document.querySelectorAll('#owOverlayModal [data-tacccnt]').forEach((el) => el.addEventListener('click', async () => {
      try { const data = await mpApi('respondTrade', { code: room.code, playerId, tradeId: el.dataset.tacccnt, response: 'accept' }); toast('Controproposta accettata.', 'success'); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile accettare la controproposta.', 'error'); }
    }));
    document.querySelectorAll('#owOverlayModal [data-tcnt]').forEach((el) => el.addEventListener('click', () => confirmCounterTrade(room, playerId, trades.find((x) => x.id === el.dataset.tcnt))));
    // Il giocatore arrivato con una trattativa accettata (toReceive sopra): un ultimo click
    // esplicito prima di toccare la rosa, mai automatico al solo poll — stessa cautela di
    // downloadMyResult, che pure richiede un click per applicare un cambiamento di stato.
    document.querySelectorAll('#owOverlayModal [data-recv]').forEach((el) => el.addEventListener('click', () => {
      const t = trades.find((x) => x.id === el.dataset.recv); if (!t || !t.playerSnapshot) return;
      const snap = t.playerSnapshot;
      S.squad.push(markSigned({ ...snap, pid: newPid(), seasonGoals: 0, seasonAssists: 0, seasonCleanSheets: 0, seasonApps: 0, outWeeks: 0, suspMatches: 0 }, t.fee));
      S.budget -= t.fee;
      // Scambio: il giocatore che avevi offerto in cambio esce ora dalla tua rosa (già ceduto
      // dal venditore con "Conferma cessione"). Se non lo trovi più (venduto nel frattempo per
      // un'altra via), non si blocca comunque la ricezione: hai già il tuo, resta solo un
      // disallineamento minore da sistemare a mano.
      let offerNote = '';
      if (t.offerPlayerSnapshot) {
        const oi = S.squad.findIndex((p) => p.n.toLowerCase() === t.offerPlayerSnapshot.n.toLowerCase());
        if (oi >= 0) { pushAlumnus(S.squad[oi]); S.squad.splice(oi, 1); offerNote = ', ceduto ' + t.offerPlayerSnapshot.n + ' in cambio'; }
      }
      if (!S._appliedTrades) S._appliedTrades = [];
      S._appliedTrades.push(t.id);
      saveGame();
      toast(snap.n + ' si aggrega alla rosa' + (t.fee > 0 ? ': -' + fmtMoney(t.fee) : '') + offerNote + '.', 'spend');
      renderLobby(room, playerId);
    }));
    const chatSendBtn = $('mpChatSend');
    const chatInput = $('mpChatInput');
    if (chatSendBtn) chatSendBtn.onclick = async () => {
      const text = (chatInput.value || '').trim();
      if (!text) return;
      chatInput.value = '';
      chatSendBtn.disabled = true;
      try { const data = await mpApi('chat', { code: room.code, playerId, text }); renderLobby(data.room, playerId); }
      catch (e) {
        // Il messaggio torna nel campo: prima spariva e andava riscritto da capo.
        toast(e.message || 'Messaggio non inviato.', 'error');
        if (chatInput.isConnected && !chatInput.value) chatInput.value = text;
        if (chatSendBtn.isConnected) setTimeout(() => { chatSendBtn.disabled = false; }, e.retryAfter ? Math.min(e.retryAfter, 10) * 1000 : 0);
      }
    };
    if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSendBtn.click(); } });
    const hofBtn = $('mpHofBtn');
    if (hofBtn) hofBtn.onclick = () => showHallOfFame(room, playerId);
    const notifyBtn = $('mpNotifyBtn');
    if (notifyBtn) notifyBtn.onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} renderLobby(room, playerId); };
    const resumeSimBtn = $('mpResumeSimBtn');
    if (resumeSimBtn) resumeSimBtn.onclick = () => resumeMatchdaySimFromLive(room, playerId);
    const manageBtn = $('mpManageBtn');
    if (manageBtn) manageBtn.onclick = () => {
      const sess = readMpSession();
      if (!sess || !sess.saveId) { toast('Nessuna carriera associata a questa stanza.'); return; }
      stopMpPolling();
      closeOverlay();
      resumeDynasty(sess.saveId);
    };
    const readyBtn = $('mpReadyBtn');
    if (readyBtn) readyBtn.onclick = async () => {
      if (me && me.ready) {
        try { const data = await mpApi('ready', { code: room.code, playerId, ready: false }); if (DynSound) DynSound.tap(); renderLobby(data.room, playerId); }
        catch (e) { toast(e.message || 'Errore di rete.', 'error'); mpRefreshAfterConflict(room.code, playerId, e); }
        return;
      }
      if (inLobbyStage) {
        try { const data = await mpApi('ready', { code: room.code, playerId, ready: true }); if (DynSound) DynSound.tap(); renderLobby(data.room, playerId); }
        catch (e) { toast(e.message || 'Errore di rete.', 'error'); mpRefreshAfterConflict(room.code, playerId, e); }
        return;
      }
      const sess = readMpSession();
      const state = sess && sess.saveId ? loadSaveSlot(sess.saveId) : null;
      if (!state) { toast('Nessuna carriera associata a questa stanza: esci e rientra per ricrearne una.', 'error'); return; }
      if (state.seasonActive) { toast('La tua carriera per questa stanza ha già iniziato la stagione: torna in Dirigenza, non premere ancora "Inizia Stagione".', 'error'); return; }
      // Stesso controllo di startSeason() (sim.js): budget/rosa insufficienti altrimenti
      // farebbero fallire in silenzio la tua simulazione nel browser dell'host.
      if (state.squad.length < MIN_SQUAD) { toast('Ti servono almeno ' + MIN_SQUAD + ' giocatori per iniziare la prossima stagione. Ingaggia svincolati gratis se sei a corto.', 'error'); return; }
      const billCheck = kickoffBill(state);
      if (state.budget < billCheck) { toast('Ti mancano ' + fmtMoney(billCheck - state.budget) + ' per il monte ingaggi della prossima stagione: vendi giocatori o trova soldi prima di essere pronto.', 'error'); return; }
      try {
        const data = await mpApi('ready', { code: room.code, playerId, ready: true, state });
        if (DynSound) DynSound.tap();
        renderLobby(data.room, playerId);
      } catch (e) { toast(e.message || 'Impossibile sottomettere la carriera.', 'error'); mpRefreshAfterConflict(room.code, playerId, e); }
    };
    const startSessionBtn = $('mpStartSessionBtn');
    if (startSessionBtn) startSessionBtn.onclick = async () => {
      try { const data = await mpApi('startSession', { code: room.code, playerId }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile avviare la sessione.', 'error'); }
    };
    const forceSessionBtn = $('mpForceSessionBtn');
    if (forceSessionBtn) forceSessionBtn.onclick = async () => {
      try { const data = await mpApi('startSession', { code: room.code, playerId, force: true }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile avviare la sessione.', 'error'); }
    };
    const startSimBtn = $('mpStartSimBtn');
    if (startSimBtn) startSimBtn.onclick = () => hostBeginMatchdaySim(room, playerId, false);
    const forceSimBtn = $('mpForceSimBtn');
    if (forceSimBtn) forceSimBtn.onclick = () => hostBeginMatchdaySim(room, playerId, true);
    const nextDayBtn = $('mpNextDayBtn');
    if (nextDayBtn) nextDayBtn.onclick = async () => {
      if (!mpHostRuns) { toast('Simulazione non trovata in questa scheda: riaprila dalla scheda con cui l\'hai avviata.', 'error'); return; }
      nextDayBtn.disabled = true;
      try {
        // Ogni categoria avanza di una giornata per conto suo: chi ha meno giornate totali
        // (categorie con meno squadre) semplicemente smette di avanzare prima delle altre.
        mpHostRuns.forEach((run) => { if (run.matchday < run.total) stepHostMatchday(run); });
        // Un suono diverso quando questa giornata ha visto almeno una sfida diretta fra due
        // presidenti (vsHuman, sim.js: stepHostMatchday) — il momento più bello del
        // multiplayer, non deve passare come una giornata come le altre.
        const anyHumanClash = mpHostRuns.some((run) => run.ctxs.some((c) => { const r = c.results[c.results.length - 1]; return r && r.vsHuman; }));
        if (DynSound) { if (anyHumanClash) DynSound.chime(); else DynSound.tap(); }
        await pushMatchdaySnapshot(room, playerId, mpHostRuns, true);
      } catch (e) { toast(e.message || 'Errore di rete.', 'error'); nextDayBtn.disabled = false; }
    };
    const finishBtn = $('mpFinishBtn');
    if (finishBtn) finishBtn.onclick = async () => {
      if (!mpHostRuns) { toast('Simulazione non trovata in questa scheda: riaprila dalla scheda con cui l\'hai avviata.', 'error'); return; }
      finishBtn.disabled = true;
      try {
        mpHostRuns.forEach((run) => finishHostSeason(run));
        // Supercoppa dei Presidenti: un'amichevole in più fra i due umani meglio piazzati DELLO
        // STESSO gruppo (categorie diverse non si incrociano) — va risolta qui, gruppo per
        // gruppo, PRIMA di endSeason (che legge il flag _supercoppaWon e lo trasforma in un
        // trofeo vero, stesso trattamento di scudetto/Coppa Italia).
        const supercoppaResults = mpHostRuns.map((run) => resolveSupercoppa(run)).filter(Boolean);
        // Coppa Italia e coppe europee non sono un bracket condiviso (ogni umano ha il suo,
        // vedi resolveMultiplayerTrophies): senza questo passaggio due presidenti di gruppi
        // diversi della stessa stanza potrebbero risultare entrambi vincitori dello stesso
        // trofeo nella stessa stagione. Va fatto QUI, con tutti i gruppi della stanza insieme
        // e PRIMA di chiudere la stagione di ciascuno (endSeason), l'unico momento in cui i
        // flag `cups.*.won` diventano trofei/soldi permanenti in carriera.
        const allHumanCtxs = mpHostRuns.reduce((a, run) => a.concat(run.ctxs), []);
        resolveMultiplayerTrophies(allHumanCtxs);
        allHumanCtxs.forEach((ctx) => { if (ctx.seasonActive && ctx.played >= gp(ctx)) endSeason(ctx); });
        supercoppaResults.forEach((r) => toast('🏆 Supercoppa dei Presidenti: ' + r.winnerClub + ' batte ' + r.loserClub + ' ' + r.gf + '-' + r.ga + (r.pens ? ' (rigori)' : ''), 'success'));
        const results = {};
        mpHostRuns.forEach((run) => {
          run.playerIds.forEach((pid, i) => { results[pid] = run.ctxs[i]; });
        });
        const data = await mpApi('submitResult', { code: room.code, playerId, results, force: true });
        mpHostRuns = null;
        if (DynSound) DynSound.whistle();
        renderLobby(data.room, playerId);
      } catch (e) { toast(e.message || 'Impossibile pubblicare il resoconto.', 'error'); finishBtn.disabled = false; }
    };
    const downloadBtn = $('mpDownloadBtn');
    if (downloadBtn) downloadBtn.onclick = () => downloadMyResult(room, playerId);
    const nextRoundBtn = $('mpNextRoundBtn');
    if (nextRoundBtn) nextRoundBtn.onclick = async () => {
      try { const data = await mpApi('nextRound', { code: room.code, playerId }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile avviare la prossima stagione.', 'error'); }
    };
    const forceNextRoundBtn = $('mpForceNextRoundBtn');
    if (forceNextRoundBtn) forceNextRoundBtn.onclick = async () => {
      try { const data = await mpApi('nextRound', { code: room.code, playerId, force: true }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile avviare la prossima stagione.', 'error'); }
    };
    const terminateBtn = $('mpTerminateBtn');
    if (terminateBtn) terminateBtn.onclick = () => confirmTerminateDynasty(room, playerId);
    const sellEndBtn = $('mpSellEndBtn');
    if (sellEndBtn) sellEndBtn.onclick = () => mpSellAndEnd(room, playerId);
    $('mpLeaveBtn').onclick = async () => {
      stopMpPolling();
      try { await mpApi('leave', { code: room.code, playerId }); } catch (e) {}
      clearMpSession();
      mpLastPhase = null;
      mpHostRuns = null;
      closeOverlay();
    };
    // La stanza continua a cambiare anche a stagione pubblicata (l'host può aprire la
    // prossima appena tutti hanno scaricato): niente più stop del poll su "done". Il ritmo si
    // allunga da solo (fino a un tetto di 15s) finché non cambia nulla — confrontando
    // `updatedAt`, che ogni azione che tocca la stanza aggiorna — e torna subito a 3s appena
    // succede qualcosa: niente più un poll fisso a raffica per ore su una lobby ferma.
    const schedulePoll = (lastUpdatedAt, delay, failCount) => {
      failCount = failCount || 0;
      mpPollTimer = setTimeout(async () => {
        try {
          const fresh = await mpFetchState(room.code);
          if (!fresh.players.some((p) => p.id === playerId)) { stopMpPolling(); clearMpSession(); toast('Sei stato rimosso dalla stanza.'); closeOverlay(); return; }
          // Prima non c'era alcun segnale se il poll si arenava: chi guardava non poteva
          // distinguere "tutto fermo perché non è cambiato nulla" da "il poll non arriva più".
          // Un avviso solo dopo qualche fallimento di fila (non al primo, per non spammare per
          // un singolo blip), e uno di conferma quando la connessione torna.
          if (failCount >= 3) toast('✅ Connessione ristabilita.', 'success');
          if (fresh.updatedAt !== lastUpdatedAt) { renderLobby(fresh, playerId); return; }
          schedulePoll(lastUpdatedAt, Math.min(Math.round(delay * 1.6), 15000), 0);
        } catch (e) {
          if (e && e.roomNotFound) { stopMpPolling(); clearMpSession(); toast('La stanza non esiste più.', 'error'); closeOverlay(); return; }
          const nextFail = failCount + 1;
          if (nextFail === 3) toast('⚠️ Connessione instabile: continuo a riprovare in automatico.', 'error');
          // 429/503 con Retry-After: il server chiede di rallentare, il poll aspetta almeno
          // quanto indicato (con un tetto di un minuto) invece di insistere ogni 3 secondi.
          if (e && e.retryAfter) delay = Math.max(delay, Math.min(e.retryAfter, 60) * 1000);
          schedulePoll(lastUpdatedAt, delay, nextFail);   // rete assente per un giro: si riprova senza rallentare
        }
      }, delay);
    };
    schedulePoll(room.updatedAt, 3000, 0);
  }

  // Conferma per l'host: chiude la dynasty di questa stanza per sempre, prima delle 20
  // stagioni (MAX_SEASONS) — stesso stile di conferma di confirmSell/confirmResign, ma qui
  // vale per tutta la stanza, non solo per chi la preme.
  function confirmTerminateDynasty(room, playerId) {
    overlay(`
      <h2>🛑 Termina la dynasty per tutti</h2>
      <p>Chiude la stanza <b>${escapeHtml(room.code)}</b> per sempre, prima delle ${MAX_SEASONS} stagioni: ogni giocatore dovrà vendere il proprio club per chiudere la carriera. Non si può annullare.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn ow-danger" id="ovTerminateGo">Termina per tutti</button>
        <button class="dyn-btn" id="ovTerminateNo">Annulla</button>
      </div>`);
    $('ovTerminateGo').onclick = async () => {
      try {
        const data = await mpApi('terminate', { code: room.code, playerId });
        mpHostRuns = null;
        renderLobby(data.room, playerId);
      } catch (e) { toast(e.message || 'Impossibile terminare la dynasty.', 'error'); renderLobby(room, playerId); }
    };
    $('ovTerminateNo').onclick = () => renderLobby(room, playerId);
  }

  // Quando l'host ha terminato la dynasty in anticipo: ognuno vende il PROPRIO club (dalla
  // propria carriera salvata, l'ultima gestita in locale) per chiudere la carriera — stesso
  // esito/schermata finale (renderEnd, sim.js: endDynasty) di "Vendi il club" in singolo,
  // semplice riusata qui invece di duplicarla.
  function mpSellAndEnd(room, playerId) {
    const sess = readMpSession();
    const state = sess && sess.saveId ? loadSaveSlot(sess.saveId) : null;
    if (!state) { toast('Nessuna carriera associata a questa stanza.', 'error'); return; }
    S = state;
    normSquad();
    const worth = computeWorth();
    overlay(`
      <h2>💷 Vendi il club</h2>
      <p>L'host ha concluso la dynasty di questa stanza. Una cordata offre <b>${fmtMoney(worth)}</b> per ${escapeHtml(S.club)}: vendere chiude qui la tua carriera, con lo storico di tutte le stagioni giocate.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovMpSell">Vendi per ${fmtMoney(worth)}</button>
        <button class="dyn-btn" id="ovMpBack">Torna alla stanza</button>
      </div>`);
    $('ovMpSell').onclick = () => {
      closeOverlay();
      stopMpPolling();
      clearMpSession();
      endDynasty('sold', worth);
    };
    $('ovMpBack').onclick = () => renderLobby(room, playerId);
  }

  // Solo l'host: cambia il nome della stanza (il codice resta comunque l'unico modo di
  // entrarci — il nome è solo un'etichetta comoda al posto del codice a 4 lettere).
  function confirmRenameRoom(room, playerId) {
    overlay(`
      <h2>✏️ Rinomina stanza</h2>
      <label class="dyn-field"><span>Nome della stanza</span><input id="mpRenameInput" type="text" maxlength="30" value="${escapeHtml(room.name || '')}" placeholder="Es. Lega degli amici" autocomplete="off" /></label>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovRenameGo">Salva</button>
        <button class="dyn-btn" id="ovRenameNo">Annulla</button>
      </div>`);
    $('ovRenameGo').onclick = async () => {
      const roomName = ($('mpRenameInput').value || '').trim();
      try { const data = await mpApi('rename', { code: room.code, playerId, roomName }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile rinominare la stanza.', 'error'); renderLobby(room, playerId); }
    };
    $('ovRenameNo').onclick = () => renderLobby(room, playerId);
  }

  // Stesso schema di confirmRenameRoom: un textarea invece di un input a riga singola, dato
  // che un annuncio ("obiettivo della stagione", "regole della lega") è spesso più lungo di un
  // nome stanza. Vuoto = rimuove l'annuncio pinnato.
  function confirmAnnounce(room, playerId) {
    overlay(`
      <h2>📌 Annuncio della stanza</h2>
      <p class="ow-sub">Resta pinnato sopra la chat per tutti finché non lo cambi o lo svuoti.</p>
      <label class="dyn-field"><span>Testo dell'annuncio</span><textarea id="mpAnnounceInput" maxlength="200" rows="3" placeholder="Es. Obiettivo di stagione: tutti in Serie A entro l'anno 10">${escapeHtml(room.announcement || '')}</textarea></label>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovAnnounceGo">Salva</button>
        ${room.announcement ? '<button class="dyn-btn ow-danger" id="ovAnnounceClear">Rimuovi annuncio</button>' : ''}
        <button class="dyn-btn" id="ovAnnounceNo">Annulla</button>
      </div>`);
    $('ovAnnounceGo').onclick = async () => {
      const text = ($('mpAnnounceInput').value || '').trim();
      try { const data = await mpApi('announce', { code: room.code, playerId, text }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile salvare l\'annuncio.', 'error'); renderLobby(room, playerId); }
    };
    const clearBtn = $('ovAnnounceClear');
    if (clearBtn) clearBtn.onclick = async () => {
      try { const data = await mpApi('announce', { code: room.code, playerId, text: '' }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile rimuovere l\'annuncio.', 'error'); renderLobby(room, playerId); }
    };
    $('ovAnnounceNo').onclick = () => renderLobby(room, playerId);
  }

  // Solo l'host: espelle un altro giocatore dalla stanza (stessa richiesta di conferma delle
  // altre azioni senza ritorno di questa stanza).
  function confirmKickPlayer(room, playerId, targetId) {
    const target = room.players.find((p) => p.id === targetId);
    overlay(`
      <h2>✖ Espelli dalla stanza</h2>
      <p>Rimuove <b>${target ? escapeHtml(target.club) : 'questo giocatore'}</b>${target ? ' (' + escapeHtml(target.name) + ')' : ''} dalla stanza. Non si può annullare.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn ow-danger" id="ovKickGo">Espelli</button>
        <button class="dyn-btn" id="ovKickNo">Annulla</button>
      </div>`);
    $('ovKickGo').onclick = async () => {
      try { const data = await mpApi('kick', { code: room.code, playerId, targetId }); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile espellere il giocatore.', 'error'); renderLobby(room, playerId); }
    };
    $('ovKickNo').onclick = () => renderLobby(room, playerId);
  }

  // Controproposta su una trattativa in arrivo (io sono il venditore): stesso schema di
  // confirmKickPlayer/confirmAdoptBot, un piccolo overlay al posto di un window.prompt() nativo
  // (mai usato altrove in questo gioco). Il giocatore va allegato già qui (room.php lo
  // richiede per passare a 'countered'), quindi si cerca subito nella rosa vera come per
  // "Accetta".
  function confirmCounterTrade(room, playerId, trade) {
    if (!trade) return;
    overlay(`
      <h2>🤝 Controproponi</h2>
      <p>${escapeHtml(trade.fromClub)} offre ${fmtMoney(trade.fee)}${trade.offerPlayerName ? ' + ' + escapeHtml(trade.offerPlayerName) : ''} per ${escapeHtml(trade.playerName)}. Il giocatore offerto in cambio resta lo stesso, quanto cash vuoi chiedere in più?</p>
      <div class="ow-fin-row"><input id="mpCounterFee" type="number" min="0" step="10000" value="${Math.round(trade.fee * 1.25)}" style="width:100%" /></div>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovCounterGo">Invia controproposta</button>
        <button class="dyn-btn" id="ovCounterNo">Annulla</button>
      </div>`);
    $('ovCounterGo').onclick = async () => {
      const p = S.squad.find((x) => x.n.toLowerCase() === trade.playerName.toLowerCase());
      if (!p) { toast('Non trovo "' + escapeHtml(trade.playerName) + '" nella tua rosa: controlla il nome esatto, o rifiuta la proposta.', 'error'); renderLobby(room, playerId); return; }
      const counterFee = Math.max(0, Math.round(+($('mpCounterFee').value || 0)));
      try {
        const data = await mpApi('respondTrade', { code: room.code, playerId, tradeId: trade.id, response: 'counter', counterFee, playerSnapshot: { n: p.n, pos: p.pos, ovr: p.ovr, age: p.age, wage: p.wage, yrs: p.yrs, potential: p.potential, nat: p.nat } });
        toast('Controproposta inviata: ' + fmtMoney(counterFee) + '.', 'success');
        renderLobby(data.room, playerId);
      } catch (e) { toast(e.message || 'Impossibile inviare la controproposta.', 'error'); renderLobby(room, playerId); }
    };
    $('ovCounterNo').onclick = () => renderLobby(room, playerId);
  }

  // Adozione bot (room.php: action=adoptBot): per un giocatore che non risponde più da un po'
  // (a differenza di "Espelli", il suo club NON sparisce dalla stanza — resta in gioco, ma
  // guidato dalla IA per il resto della dynasty, invece di bloccare "tutti pronti"/"tutti hanno
  // scaricato" all'infinito). Non reversibile, da qui la conferma esplicita come per kick.
  function confirmAdoptBot(room, playerId, targetId) {
    const target = room.players.find((p) => p.id === targetId);
    overlay(`
      <h2>🤖 Adotta come bot</h2>
      <p>Se <b>${target ? escapeHtml(target.club) : 'questo giocatore'}</b>${target ? ' (' + escapeHtml(target.name) + ')' : ''} non risponde più, il suo club può continuare a giocare guidato dalla IA per il resto della stanza, invece di bloccare gli altri. Non si può annullare: se torna, può solo uscire e provare a rientrare come nuovo giocatore.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovAdoptGo">Adotta come bot</button>
        <button class="dyn-btn" id="ovAdoptNo">Annulla</button>
      </div>`);
    $('ovAdoptGo').onclick = async () => {
      try { const data = await mpApi('adoptBot', { code: room.code, playerId, targetId }); toast((target ? escapeHtml(target.club) : 'Il club') + ' è ora controllato dalla IA.', 'success'); renderLobby(data.room, playerId); }
      catch (e) { toast(e.message || 'Impossibile adottare il club.', 'error'); renderLobby(room, playerId); }
    };
    $('ovAdoptNo').onclick = () => renderLobby(room, playerId);
  }

  // Albo d'oro della stanza: lo storico sintetico per playerId che room.php accumula ad ogni
  // submitResult (room.hallOfFame) — sopravvive ai round successivi, a differenza di
  // `results` che nextRound azzera, quindi è l'unico posto dove si vede l'intera dynasty
  // vista dalla stanza invece che dal solo salvataggio del singolo giocatore.
  function showHallOfFame(room, playerId) {
    const hof = room.hallOfFame || {};
    const awards = (room.seasonAwards || []).slice().reverse();
    const rows = room.players.map((p) => ({ p, seasons: Array.isArray(hof[p.id]) ? hof[p.id] : [] }))
      .concat(Object.keys(hof).filter((pid) => !room.players.some((p) => p.id === pid))
        .map((pid) => { const hs = Array.isArray(hof[pid]) ? hof[pid] : []; return { p: { id: pid, name: '(uscito dalla stanza)', club: (hs[0] && hs[0].club) || '?' }, seasons: hs }; }));
    const awardsHTML = awards.length ? `<div class="ow-sec" style="margin-bottom:12px">
        <div class="ow-sec-title">🏅 Premi della stagione</div>
        ${awards.map((a) => `<div class="ow-fin-row" style="align-items:flex-start"><span>Stagione ${escapeHtml(a.season ?? '-')}</span>
            <span style="text-align:right;font-size:12px;line-height:1.5">
              ${a.topScorer ? `⚽ Capocannoniere: <b>${escapeHtml(a.topScorer.player)}</b> (${escapeHtml(a.topScorer.club)}) · ${escapeHtml(a.topScorer.goals)} gol<br>` : ''}
              ${a.bestManager ? `🧠 Miglior mister: <b>${escapeHtml(a.bestManager.mgr)}</b> (${escapeHtml(a.bestManager.club)})<br>` : ''}
              ${a.surprise ? `🎉 Sorpresa della stagione: <b>${escapeHtml(a.surprise.club)}</b> (${escapeHtml(ord(+a.surprise.pos || 0))} posto)` : ''}
            </span></div>`).join('')}
      </div>` : '';
    overlay(`
      <h2>🏆 Albo d'oro della stanza</h2>
      <div style="max-height:62vh;overflow:auto;margin:0 -6px">
        ${awardsHTML}
        ${rows.length ? rows.map(({ p, seasons }) => {
          const titles = seasons.filter((s) => s.title).length;
          const trophyCount = seasons.reduce((a, s) => a + (Array.isArray(s.trophies) ? s.trophies.length : 0), 0);
          return `<div class="ow-sec" style="margin-bottom:12px">
            <div class="ow-sec-title">${escapeHtml(p.club)}<small style="display:block;color:var(--muted);font-weight:normal">${escapeHtml(p.name)}</small></div>
            <div class="ow-fin-row"><span>Stagioni giocate</span><b>${seasons.length}</b></div>
            <div class="ow-fin-row"><span>Titoli vinti</span><b>${titles}</b></div>
            <div class="ow-fin-row"><span>Trofei totali</span><b>${trophyCount}</b></div>
            ${seasons.length ? `<div style="overflow-x:auto"><table class="dyn-table"><thead><tr><th>S</th><th>Categoria</th><th class="num">Pos</th><th>Trofei</th></tr></thead><tbody>
              ${seasons.map((s) => `<tr><td>${escapeHtml(s.season ?? '-')}${s.promoted ? ' ⬆️' : s.relegated ? ' ⬇️' : ''}</td><td>${escapeHtml((DIVS[s.div] || {}).name || s.div)}</td><td class="num">${escapeHtml(s.pos ?? '-')}</td><td style="font-size:11px">${Array.isArray(s.trophies) && s.trophies.length ? escapeHtml(s.trophies.join(', ')) : '-'}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="ow-sub">Ancora nessuna stagione conclusa.</div>'}
          </div>`;
        }).join('') : '<div class="ow-sub">Ancora nessuna stagione conclusa in questa stanza.</div>'}
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovHofClose">Chiudi</button></div>`);
    $('ovHofClose').onclick = () => renderLobby(room, playerId);
  }

  // Classifica di UNA categoria: la stagione intera (tutti i club, bot compresi — gli stessi
  // che ctx.table già tiene per ciascun umano di quel gruppo, con le squadre più scarse del
  // pool sostituite dagli umani in fase di setup), non solo i club umani di quel gruppo. Si
  // parte dalla ctx.table di un umano qualsiasi del gruppo (bot e "io" già corretti dentro
  // computeTable), e si sovrascrivono le righe degli ALTRI umani dello stesso gruppo coi loro
  // pts/gd reali: dentro quella ctx.table contano solo gli scontri diretti già giocati con
  // loro, non il loro punteggio vero nell'intero campionato (la correzione completa arriva
  // solo a fine stagione in finishHostSeason, qui va rifatta ad ogni giornata per lo stesso
  // motivo).
  function buildLiveTable(run) {
    const base = (run.ctxs[0] && run.ctxs[0].table) || [];
    const humanByClub = new Map(run.ctxs.map((c) => [c.club, c]));
    return base.map((row) => {
      const h = humanByClub.get(row.name);
      if (h) return { club: h.club, pts: h.pts, gd: h.gf - h.ga, mgr: h.manager ? h.manager.n : '', isHuman: true };
      return { club: row.name, pts: row.pts, gd: row.gd, mgr: row.mgr ? row.mgr.n : '', isHuman: false };
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd);
  }

  // L'ultima giornata giocata da ciascun umano del gruppo, per il piccolo "notiziario" che
  // ognuno vede sopra la propria classifica — con le sfide dirette fra presidenti (vsHuman,
  // sim.js: stepHostMatchday) segnalate a parte invece di passare come una partita come le altre.
  function buildMatchdayNews(run) {
    return run.ctxs.map((c) => {
      const row = (c.results || [])[c.results.length - 1];
      if (!row) return null;
      // Scouting sul prossimo avversario (renderScouting, single player, stesso principio):
      // in multiplayer nessun umano diverso dall'host ha mai ctx.opps/ctx.fixtures in locale
      // (vivono solo nella memoria del browser host durante la simulazione), quindi va
      // calcolato QUI, lato host, e spedito dentro lo snapshot leggero — altrimenti chi non è
      // host non potrebbe mai vederlo.
      let nextOpp = null;
      if (c.seasonActive && c.played < c.fixtures.length) {
        const fx = c.fixtures[c.played], opp = c.opps[fx.opp];
        if (opp) nextOpp = { name: opp.name, home: fx.home, personality: opp.personality };
      }
      return { club: c.club, opp: row.opp, home: row.home, gf: row.gf, ga: row.ga, res: row.res, vsHuman: !!row.vsHuman, vsHumanClub: row.vsHumanClub || null, nextOpp };
    }).filter(Boolean);
  }

  // Una "run" per categoria (`runs`, array): ognuna col proprio numero di giornate totali
  // (categorie con meno squadre finiscono prima). Il progresso complessivo che l'host vede sul
  // suo bottone è il massimo fra tutte — "fatto" scatta solo quando lo sono TUTTE. `resume`
  // porta anche i ctx completi del gruppo (non solo la classifica): se l'host sparisce a metà
  // simulazione, chiunque prenda il suo posto può ricostruire la run da lì (resumeMatchdaySimFromLive)
  // invece di restare bloccato sull'ultima giornata pubblicata.
  // `resume` (i ctx completi, roster compresi) è l'unica parte pesante di ogni giornata: con
  // più categorie/umani nella stanza, mandarlo per intero ad OGNI giornata è quello che rende
  // "Prossima giornata" lento (JSON enorme da serializzare, spedire, riscrivere su disco con
  // lock, e che ogni scheda in poll deve poi riscaricare). Serve solo per ricostruire la run se
  // l'host sparisce a metà simulazione, quindi basta rinfrescarlo ogni tot giornate (e sempre
  // alla prima e all'ultima): room.php tiene quello precedente per le giornate di mezzo invece
  // di perderlo, si perde al più qualche giornata di "ripresa" in un caso già raro.
  const LIVE_RESUME_EVERY = 3;
  function buildLiveGroups(runs) {
    return runs.map((run) => ({
      div: run.div,
      divName: (DIVS[run.div] || {}).name || ('Categoria ' + run.div),
      matchday: run.matchday,
      total: run.total,
      table: buildLiveTable(run),
      news: buildMatchdayNews(run),
      resume: (run.matchday <= 1 || run.matchday >= run.total || run.matchday % LIVE_RESUME_EVERY === 0)
        ? { ctxs: run.ctxs, bots: run.bots, playerIds: run.playerIds }
        : null,
    }));
  }

  async function pushMatchdaySnapshot(room, playerId, runs, force) {
    const groups = buildLiveGroups(runs);
    const matchday = Math.max(...groups.map((g) => g.matchday));
    const total = Math.max(...groups.map((g) => g.total));
    const data = await mpApi('pushMatchday', { code: room.code, playerId, matchday, total, groups, force: !!force });
    renderLobby(data.room, playerId);
  }

  // Se l'host di questa scheda non ha (più) la simulazione in memoria — perché l'ha aperta di
  // nuovo dopo un ricaricamento, o perché il ruolo di host è appena passato a lei/lui dopo che
  // l'host originale è uscito a metà simulazione (room.php: leave) — la ricostruisce dall'ultimo
  // `resume` pubblicato, invece di restare bloccati per sempre sull'ultima giornata vista.
  function resumeMatchdaySimFromLive(room, playerId) {
    const groups = (room.live && room.live.groups) || [];
    const runs = groups.map((g) => {
      if (!g.resume || !Array.isArray(g.resume.ctxs) || !g.resume.ctxs.length) return null;
      const ctxs = g.resume.ctxs;
      return {
        ctxs,
        bots: g.resume.bots || [],
        playerIds: g.resume.playerIds || [],
        fixtures: ctxs.map((c) => c.fixtures),
        div: g.div,
        matchday: g.matchday,
        total: g.total,
      };
    }).filter(Boolean);
    if (!runs.length) { toast('Nessun dato di ripresa disponibile: bisognerà aspettare il prossimo "Vedi resoconto" forzato o ricominciare da un nuovo round.', 'error'); return; }
    mpHostRuns = runs;
    toast('Simulazione ripresa dall\'ultima giornata pubblicata.', 'success');
    renderLobby(room, playerId);
  }

  // L'host: raggruppa i giocatori pronti per categoria (dalla seconda stagione in poi possono
  // essere in categorie diverse: promozioni/retrocessioni individuali), prepara una stagione
  // condivisa per gruppo (setupHostSeason, sim.js — Fase 2b) e simula subito la prima giornata
  // di ciascuna, poi mostra il pannello di controllo (renderLobby, fase 'simulating') con cui
  // avanzare una giornata alla volta su TUTTE le categorie insieme, ognuno vedendo solo la
  // classifica della propria. Le "run" vivono solo nella scheda dell'host: se la ricarica, deve
  // riaprire la stanza da lì per continuare (limite noto, accettabile per un gioco hobby senza
  // backend con stato persistente).
  async function hostBeginMatchdaySim(room, playerId, force) {
    // Chi non ha ancora ripremuto Pronto in sessione resta fuori da questa stagione — se
    // l'host forza l'avvio, si procede solo con chi ha davvero sottomesso una carriera. Chi è
    // stato adottato come bot (adoptBot, room.php) è SEMPRE escluso qui, anche se il suo
    // `state`/`ready` di prima dell'adozione sono ancora quelli: il suo posto in categoria lo
    // riempie da solo un bot vero (setupHostSeason calcola botCount = squadre - umani), non ha
    // più senso simularlo come fosse ancora un club umano.
    // La stanza che l'host ha sullo schermo può essere vecchia di parecchi secondi (il poll
    // rallenta fino a 15s quando non cambia nulla): chi si è dichiarato pronto nel frattempo
    // restava fuori dalla simulazione, soprattutto con "Forza", e a fine stagione si trovava
    // senza risultato da scaricare. Prima di partire si rilegge lo stato vero; se la rete non
    // risponde si prosegue con quello che si ha, come prima.
    try { room = await mpFetchState(room.code); } catch (e) {}
    const readyPlayers = room.players.filter((p) => p.ready && p.state && !p.bot);
    if (readyPlayers.length < 1) { toast('Nessuno è ancora pronto.', 'error'); return; }
    const btn = $('mpStartSimBtn') || $('mpForceSimBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Avvio in corso…'; }
    try {
      const byDiv = new Map();
      readyPlayers.forEach((p) => {
        const div = p.state.div;
        if (!byDiv.has(div)) byDiv.set(div, []);
        byDiv.get(div).push(p);
      });
      const runs = [];
      byDiv.forEach((players, div) => {
        const ctxs = players.map((p) => JSON.parse(JSON.stringify(p.state)));
        const run = setupHostSeason(ctxs, div, room.difficulty);
        run.div = div;
        run.playerIds = players.map((p) => p.id);
        stepHostMatchday(run);
        runs.push(run);
      });
      mpHostRuns = runs;
      await pushMatchdaySnapshot(room, playerId, runs, !!force);
    } catch (e) {
      toast(e.message || 'Impossibile avviare la simulazione.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '▶️ Inizia simulazione'; }
    }
  }

  // Applica il proprio "pezzo" del risultato condiviso al salvataggio locale — stesso slot
  // (_saveId) della carriera sottomessa, quindi lo sovrascrive. La sessione multiplayer NON si
  // chiude: la stanza continua per la prossima stagione (nextRound), quindi si segnala solo di
  // aver scaricato (ackResult) e si resta agganciati alla stessa stanza/salvataggio.
  function downloadMyResult(room, playerId) {
    const result = room.results && room.results[playerId];
    if (!result) { toast('Nessun risultato per te in questa stagione: non eri fra i pronti quando l\'host ha avviato la simulazione. Rientri dalla prossima.', 'error'); return; }
    stopMpPolling();
    mpLastPhase = null;
    closeOverlay();
    if (DynSound) DynSound.kickoff();
    S = cleanForeign(result);   // simulata nel browser dell'host: mai fidarsi delle stringhe che contiene
    normSquad();
    saveGame();
    mpApi('ackResult', { code: room.code, playerId }).catch(() => {});
    if (S._end) renderSeasonEnd(); else renderBoard();
  }

  // Elenco "Le tue carriere" nella schermata di setup: una card per slot salvato, con
  // ripresa/esportazione/eliminazione — sostituisce il vecchio, unico bottone "Continua"
  // che con un solo slot cancellava le altre carriere iniziandone una nuova.
  function renderSaveSlots() {
    const wrap = $('saveSlotsWrap'); if (!wrap) return;
    const idx = readSavesIndex().slice().sort((a, b) => b.updated - a.updated);
    wrap.innerHTML = !idx.length ? '' : `
      <div class="dyn-aggr-label" style="text-align:center;margin:6px 0 8px">Le tue carriere</div>
      <div class="ow-saveslots">
        ${idx.map((m) => `
          <div class="ow-saveslot${m.hardcore ? ' hardcore' : ''}">
            <div class="info">
              <b>${m.hardcore ? '🔥 ' : ''}${m.club || 'Club'}</b>
              <small>${(DIVS[m.div] || {}).name || ''} · Stagione ${m.season || 1}${m.owner ? ' · ' + m.owner : ''}</small>
            </div>
            <div class="act">
              <button type="button" class="dyn-mini" data-resume="${m.id}">▶️ Continua</button>
              <button type="button" class="dyn-mini" data-exportslot="${m.id}" title="Scarica un file di backup" aria-label="Scarica un backup di ${escapeHtml(m.club || 'Club')}">⬇️</button>
              <button type="button" class="dyn-mini ow-danger" data-delslot="${m.id}" title="Elimina questa carriera" aria-label="Elimina la carriera di ${escapeHtml(m.club || 'Club')}">🗑️</button>
            </div>
          </div>`).join('')}
      </div>
      ${idx.length >= 2 ? '<button type="button" class="dyn-mini" id="compareCareersBtn" style="width:100%;margin-bottom:8px">📊 Confronta le carriere</button>' : ''}
      <label class="dyn-mini ow-import-label">⬆️ Importa carriera da file<input type="file" id="importSaveInput" accept="application/json" hidden /></label>`;
    const compareBtn = $('compareCareersBtn');
    if (compareBtn) compareBtn.addEventListener('click', compareCareers);
    wrap.querySelectorAll('[data-resume]').forEach((el) => el.addEventListener('click', () => resumeDynasty(el.dataset.resume)));
    wrap.querySelectorAll('[data-exportslot]').forEach((el) => el.addEventListener('click', () => exportSaveSlot(el.dataset.exportslot)));
    wrap.querySelectorAll('[data-delslot]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.delslot;
      overlay(`<h2>Eliminare questa carriera?</h2><p>Non si può annullare — valuta di esportarla prima.</p>
        <div class="dyn-modal-actions">
          <button class="dyn-btn" id="ovCancelDelSlot">Annulla</button>
          <button class="dyn-btn ow-danger" id="ovConfirmDelSlot">Sì, elimina per sempre</button>
        </div>`);
      $('ovConfirmDelSlot').onclick = () => { deleteSaveSlot(id); closeOverlay(); renderSaveSlots(); };
      $('ovCancelDelSlot').onclick = closeOverlay;
    }));
    const imp = $('importSaveInput');
    if (imp) imp.addEventListener('change', handleImportSaveFile);
    renderHotseatPanel();
  }

  // Confronto fra tutte le carriere salvate: readSavesIndex() tiene solo metadati leggeri
  // (club/categoria/stagione), qui si rilegge per intero ogni singolo salvataggio da
  // localStorage (dsa_save_<id>) per i numeri veri (trofei, traguardi, categoria più alta mai
  // raggiunta) — accettabile perché sono poche decine di slot al massimo, letti una tantum
  // solo quando l'utente chiede esplicitamente il confronto, non ad ogni render della lista.
  function compareCareers() {
    const idx = readSavesIndex();
    const rows = idx.map((m) => {
      let save = null;
      try { save = JSON.parse(localStorage.getItem(saveSlotKey(m.id))); } catch (e) {}
      if (!save) return null;
      const topDivIdx = (save.history || []).reduce((a, hh) => Math.max(a, DIVS.findIndex((x) => x.name === hh.div)), save.div || 0);
      return {
        club: save.club || m.club || 'Club', owner: save.owner || m.owner || '',
        div: (DIVS[save.div] || {}).name || '', season: save.season || 1,
        trophies: (save.trophies && save.trophies.total) || 0,
        achievements: (save.achievements || []).length,
        topDiv: (DIVS[topDivIdx] || {}).name || '',
      };
    }).filter(Boolean);
    if (!rows.length) { toast('Nessuna carriera leggibile da confrontare.', 'error'); return; }
    rows.sort((a, b) => b.trophies - a.trophies || b.achievements - a.achievements);
    overlay(`<h2>📊 Confronta le carriere</h2>
      <div style="max-height:56vh;overflow:auto;margin:-6px -6px 14px">
        ${rows.map((r) => `<div class="ow-fin-row" style="align-items:flex-start">
          <span style="text-align:left"><b>${escapeHtml(r.club)}</b><small style="display:block;color:var(--muted)">${escapeHtml(r.owner)} · ${r.div} · Stagione ${r.season}</small></span>
          <b style="text-align:right;white-space:nowrap">🏆 ${r.trophies} · 🏅 ${r.achievements}/${ACHIEVEMENTS.length}<small style="display:block;color:var(--muted);font-weight:600">Top: ${r.topDiv}</small></b>
        </div>`).join('')}
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
  }

  // Card riassuntiva della stagione appena chiusa, disegnata su un canvas e scaricata come
  // PNG: niente libreria esterna (jsPDF/html2canvas), solo Canvas 2D nativo — pensata per
  // essere condivisa fuori dal gioco (storia social, chat), non solo per uso interno.
  function exportSeasonCard() {
    const e = S._end, d = divOf();
    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1c1610'); grad.addColorStop(1, '#0b0906');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(201,144,47,.55)'; ctx.lineWidth = 6; ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9902f'; ctx.font = '700 28px Inter, Arial, sans-serif'; ctx.fillText('PRESIDENTE · SERIE A', W / 2, 108);
    ctx.fillStyle = '#ffd24a'; ctx.font = '900 60px Georgia, serif'; ctx.fillText(S.club, W / 2, 186);
    ctx.fillStyle = '#a89680'; ctx.font = '600 26px Inter, Arial, sans-serif'; ctx.fillText('Stagione ' + S.season + ' · ' + d.name, W / 2, 226);
    const headline = e.treble ? 'TRIPLETE!' : e.title ? (S.div === 5 ? 'SCUDETTO!' : ('CAMPIONI DI ' + d.name.toUpperCase()) + '!') : e.promoted ? 'PROMOZIONE!' : e.relegated ? 'RETROCESSIONE' : (ord(e.pos) + ' POSTO');
    ctx.fillStyle = '#ffffff'; ctx.font = '900 78px Georgia, serif'; ctx.fillText(headline, W / 2, 336);
    ctx.fillStyle = '#e8ddcf'; ctx.font = '700 32px Inter, Arial, sans-serif'; ctx.fillText(ord(e.pos) + ' posto · ' + S.pts + ' punti', W / 2, 400);
    let y = 470;
    if (e.trophies.length) {
      ctx.fillStyle = '#ffd24a'; ctx.font = '800 30px Inter, Arial, sans-serif';
      e.trophies.forEach((t) => { ctx.fillText('🏆 ' + t, W / 2, y); y += 46; });
    } else {
      ctx.fillStyle = '#a89680'; ctx.font = '600 26px Inter, Arial, sans-serif';
      ctx.fillText('Nessun trofeo questa stagione', W / 2, y); y += 46;
    }
    const topScorer = S.squad.filter((p) => p.pos !== 'POR').sort((a, b) => (b.seasonGoals || 0) - (a.seasonGoals || 0))[0];
    if (topScorer && topScorer.seasonGoals > 0) {
      y += 20;
      ctx.fillStyle = '#6fb3ff'; ctx.font = '700 28px Inter, Arial, sans-serif';
      ctx.fillText('⚽ Capocannoniere: ' + topScorer.n + ' (' + topScorer.seasonGoals + ')', W / 2, y);
      y += 50;
    }
    if (e.newAchievements && e.newAchievements.length) {
      y += 10;
      ctx.fillStyle = '#ff9f43'; ctx.font = '700 26px Inter, Arial, sans-serif';
      e.newAchievements.forEach((key) => {
        const a = ACHIEVEMENTS.find((x) => x.key === key);
        if (a) { ctx.fillText('🏅 ' + a.title, W / 2, y); y += 40; }
      });
    }
    y += 10;
    ctx.fillStyle = '#28d9a0'; ctx.font = '800 30px Inter, Arial, sans-serif';
    ctx.fillText('Valore del club: ' + fmtMoney(e.worth), W / 2, y);

    const finish = () => {
      ctx.fillStyle = '#6b5a44'; ctx.font = '600 20px Inter, Arial, sans-serif';
      ctx.fillText('presidente-serie-a', W / 2, H - 40);
      canvas.toBlob((blob) => {
        if (!blob) { toast('Impossibile generare l\'immagine.'); return; }
        const file = new File([blob], 'presidente-' + S.club.replace(/[^a-z0-9]+/gi, '_') + '-stagione' + S.season + '.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Presidente · Serie A', text: headline + ' — ' + S.club }).catch(() => {});
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    };
    try {
      const svgBlob = new Blob([crestMarkup(S.crestShape, S.crestColors, '')], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => { const cw = 150, ch = 172; ctx.drawImage(img, W / 2 - cw / 2, H - ch - 94, cw, ch); URL.revokeObjectURL(url); finish(); };
      img.onerror = finish;
      img.src = url;
    } catch (e2) { finish(); }
  }

  // Card riassuntiva dell'INTERA carriera (non la singola stagione), disegnata allo stesso
  // modo di exportSeasonCard: richiamabile solo a fine dinastia (venduto/pensione/dimesso/
  // cacciato/amministrazione controllata), quando la storia è ormai chiusa e S.history
  // contiene tutte le stagioni giocate.
  function exportCareerCard() {
    const how = S._how;
    const worth = computeWorth();
    const honours = [];
    S.trophies.titles.forEach((n, i) => { if (n) honours.push(n + 'x Titolo ' + (DIVS[i] ? DIVS[i].name : '')); });
    if (S.trophies.nat) honours.push(S.trophies.nat + 'x Coppa Italia');
    ['ucl', 'uel', 'conf'].forEach((k) => { if (S.trophies[k]) honours.push(S.trophies[k] + 'x ' + EURO_COMPS[k].name); });
    const topDiv = S.history.reduce((a, hh) => Math.max(a, DIVS.findIndex((x) => x.name === hh.div)), S.div);
    const heads = {
      sold: 'CLUB VENDUTO', retired: 'FINE CARRIERA', resigned: 'DIMISSIONI', forced: 'CACCIATO DAI TIFOSI', admin: 'AMMINISTRAZIONE CONTROLLATA',
    };
    const headline = heads[how] || 'FINE CARRIERA';

    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1c1610'); grad.addColorStop(1, '#0b0906');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(201,144,47,.55)'; ctx.lineWidth = 6; ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9902f'; ctx.font = '700 28px Inter, Arial, sans-serif'; ctx.fillText('PRESIDENTE · SERIE A', W / 2, 108);
    ctx.fillStyle = '#ffd24a'; ctx.font = '900 58px Georgia, serif'; ctx.fillText(S.club, W / 2, 186);
    ctx.fillStyle = '#a89680'; ctx.font = '600 26px Inter, Arial, sans-serif'; ctx.fillText(S.owner + ' · ' + S.history.length + ' stagion' + (S.history.length === 1 ? 'e' : 'i'), W / 2, 226);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 66px Georgia, serif'; ctx.fillText(headline, W / 2, 320);
    ctx.fillStyle = '#e8ddcf'; ctx.font = '700 30px Inter, Arial, sans-serif';
    ctx.fillText(how === 'sold' ? 'Venduto per ' + fmtMoney(S._sale) : 'Valore finale ' + fmtMoney(worth), W / 2, 372);

    let y = 440;
    ctx.fillStyle = '#6fb3ff'; ctx.font = '700 28px Inter, Arial, sans-serif';
    ctx.fillText('Livello massimo: ' + DIVS[Math.max(0, topDiv)].name, W / 2, y); y += 44;
    ctx.fillText('Valore massimo: ' + fmtMoney(S.peakWorth), W / 2, y); y += 60;

    if (honours.length) {
      ctx.fillStyle = '#ffd24a'; ctx.font = '800 30px Inter, Arial, sans-serif';
      honours.forEach((t) => { ctx.fillText('🏆 ' + t, W / 2, y); y += 46; });
    } else {
      ctx.fillStyle = '#a89680'; ctx.font = '600 26px Inter, Arial, sans-serif';
      ctx.fillText('Nessun trofeo in bacheca', W / 2, y); y += 46;
    }
    y += 20;
    ctx.fillStyle = '#28d9a0'; ctx.font = '800 30px Inter, Arial, sans-serif';
    ctx.fillText(S.history.filter((hh) => hh.promoted).length + ' promozioni conquistate', W / 2, y);
    y += 44;
    if (S.achievements && S.achievements.length) {
      ctx.fillStyle = '#ff9f43'; ctx.font = '700 26px Inter, Arial, sans-serif';
      ctx.fillText('🏅 ' + S.achievements.length + '/' + ACHIEVEMENTS.length + ' traguardi sbloccati', W / 2, y);
    }

    const finish = () => {
      ctx.fillStyle = '#6b5a44'; ctx.font = '600 20px Inter, Arial, sans-serif';
      ctx.fillText('presidente-serie-a', W / 2, H - 40);
      canvas.toBlob((blob) => {
        if (!blob) { toast('Impossibile generare l\'immagine.'); return; }
        const file = new File([blob], 'presidente-' + S.club.replace(/[^a-z0-9]+/gi, '_') + '-carriera.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Presidente · Serie A', text: headline + ' — ' + S.club }).catch(() => {});
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    };
    try {
      const svgBlob = new Blob([crestMarkup(S.crestShape, S.crestColors, '')], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => { const cw = 150, ch = 172; ctx.drawImage(img, W / 2 - cw / 2, H - ch - 94, cw, ch); URL.revokeObjectURL(url); finish(); };
      img.onerror = finish;
      img.src = url;
    } catch (e2) { finish(); }
  }

  // Versione del formato del file di backup esportato (diversa da SAVE_FORMAT_VERSION in
  // sim.js, che riguarda lo slot in localStorage): finora mai controllata in import, quindi un
  // futuro cambio di forma del bundle avrebbe rotto in silenzio l'importazione di file vecchi
  // (o prodotto uno stato incompleto con quelli nuovi). Da qui in poi almeno un avviso.
  const EXPORT_BUNDLE_VERSION = 1;

  // Backup di uno slot: un unico file .json con salvataggio + piramide, scaricabile e
  // ri-importabile (anche su un altro dispositivo/browser).
  function exportSaveSlot(id) {
    try {
      const raw = localStorage.getItem(saveSlotKey(id)); if (!raw) return;
      const save = JSON.parse(raw);
      const poolsRaw = localStorage.getItem(savePoolsKey(id));
      const bundle = JSON.stringify({ v: EXPORT_BUNDLE_VERSION, exportedAt: Date.now(), save, pools: poolsRaw ? JSON.parse(poolsRaw) : null });
      const blob = new Blob([bundle], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'presidente-' + String(save.club || 'club').replace(/[^a-z0-9]+/gi, '_') + '-s' + (save.season || 1) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast('Impossibile esportare questa carriera.'); }
  }

  function handleImportSaveFile(ev) {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = cleanForeign(JSON.parse(reader.result));   // un file può arrivare da chiunque
        const save = bundle && bundle.save ? bundle.save : bundle;   // tollerante a un vecchio export "nudo"
        if (!save || !save.squad || !save.club) { toast('File non riconosciuto.', 'error'); return; }
        if (bundle && bundle.v && bundle.v > EXPORT_BUNDLE_VERSION) { toast('⚠️ Questo file è stato esportato da una versione più recente del gioco: l\'importazione prosegue, ma alcuni dati potrebbero non essere compatibili.', 'error'); }
        const id = 'sv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        save._saveId = id;
        localStorage.setItem(saveSlotKey(id), JSON.stringify(save));
        if (bundle && bundle.pools) localStorage.setItem(savePoolsKey(id), JSON.stringify(bundle.pools));
        const idx = readSavesIndex();
        idx.push({ id, owner: save.owner, club: save.club, div: save.div, season: save.season, updated: Date.now() });
        writeSavesIndex(idx);
        toast('Carriera importata: ' + save.club + '.');
        renderSaveSlots();
      } catch (e) { toast('File non valido.'); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  }

  let takeovers = null, selTakeover = -1;

  // Categoria di partenza scelta in fase di creazione (indice in DIVS, 0=Eccellenza).
  let startDiv = 0;
  // Regione scelta in fase di creazione: ha senso solo per Promozione/Eccellenza (0/1), le
  // uniche due categorie della piramide che il gioco tratta come regionali — vedi REGIONS
  // in data.js. Determina sia il cast di rivali (POOLS[0]/POOLS[1], scambiati in place da
  // applyStartRegion) sia quali coppie di DERBIES possono scattare durante la carriera.
  let startRegion = REGIONS[0].key;
  // L'ultimo nome club suggerito in automatico (mai quello scritto a mano dal giocatore):
  // solo per sapere se ri-suggerire un nome nuovo quando cambia la regione è sicuro, cioè
  // se il campo contiene ancora esattamente quel suggerimento e non del testo proprio.
  let lastSuggestedClub = null;
  let startDifficulty = 'medio';
  // Durata della dynasty (solo singolo: le stanze multiplayer restano fisse a MAX_SEASONS,
  // una scelta condivisa da tutto il gruppo non ha senso renderla individuale). 20 resta il
  // default "canonico", 8/12 per chi vuole arrivare in fondo a una carriera senza il
  // grande impegno di tempo delle 20 stagioni intere.
  const SEASON_LENGTHS = [8, 12, 15];
  let startSeasons = 20;
  // Modalità Hardcore: un interruttore ortogonale alla difficoltà (che tocca solo i numeri
  // economici/simulazione) — qui è una regola di meta-gioco, cessioni giocatore/club senza
  // conferma (irreversibili sul colpo) e un badge "🔥 Hardcore" ben visibile in Dirigenza.
  let startHardcore = false;

  // Stato dello stemma in fase di creazione del club (prima che esista S).
  let crestShape = CREST_DEFAULT.shape, crestColors = randCrestColors();

  // Filtro/ordinamento della lista rosa in sala del consiglio: solo preferenza di vista,
  // non tocca lo stato di gioco.
  let squadRoleFilter = 'ALL', squadSortDesc = true;

  // Tab attiva in Dirigenza: solo preferenza di vista, non persistita.
  let boardTab = 'finanze';

  function renderDivPicker() {
    const grid = $('divPicker'); if (!grid) return;
    grid.innerHTML = DIVS.map((d, i) => `<button type="button" class="ow-div-pick ${startDiv === i ? 'on' : ''}" aria-pressed="${startDiv === i}" data-startdiv="${i}">${d.name}</button>`).join('');
    grid.querySelectorAll('.ow-div-pick').forEach((el) => el.addEventListener('click', () => {
      startDiv = +el.dataset.startdiv;
      grid.querySelectorAll('.ow-div-pick').forEach((x) => { const on = +x.dataset.startdiv === startDiv; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (DynSound) DynSound.tap();
      takeovers = genTakeovers(startDiv); selTakeover = -1; renderTakeovers();
      syncRegionPickerVisibility();
    }));
  }

  // Scambia in place il cast di rivali di Promozione/Eccellenza (POOLS[0]/POOLS[1]) con quello
  // della regione scelta, sempre CLONANDO dal template REGIONS — mai un riferimento condiviso,
  // altrimenti scegliere una regione ne muterebbe per sempre il template in data.js (POOLS viene
  // poi modificato in place stagione dopo stagione da simulatePyramidMovement/evolveRivalStrengths).
  // Nessun'altra funzione del motore ha bisogno di sapere quale regione è attiva: derby/rivali/
  // mercato leggono tutti POOLS[div] come sempre, e trovano già il cast giusto.
  function applyStartRegion(key) {
    // Qui resta solo il nome suggerito: il cast di rivali lo monta startDynasty(…, region) nel
    // motore (resetPools, sim.js), che riparte comunque dalla piramide pulita. Prima questa
    // funzione riscriveva anche POOLS sul posto, un secondo punto in cui tenere allineata la
    // stessa logica. Il suggerimento si pesca direttamente dal cast della regione.
    const region = REGIONS.find((r) => r.key === key) || REGIONS[0];
    const clubInput = $('owClubName');
    if (clubInput && startDiv <= 1 && (!clubInput.value || clubInput.value === lastSuggestedClub)) {
      const cast = startDiv === 0 ? region.promozione : region.eccellenza;
      lastSuggestedClub = pick(cast && cast.length ? cast : POOLS[startDiv]).n;
      clubInput.value = lastSuggestedClub;
    }
  }

  function syncRegionPickerVisibility() {
    const wrap = $('regionPicker'), label = $('regionPickerLabel');
    const show = startDiv <= 1;
    if (wrap) wrap.classList.toggle('hidden', !show);
    if (label) label.classList.toggle('hidden', !show);
    if (show) applyStartRegion(startRegion);
  }

  function renderRegionPicker() {
    const grid = $('regionPicker'); if (!grid) return;
    grid.innerHTML = REGIONS.map((r) => `<button type="button" class="ow-div-pick ${startRegion === r.key ? 'on' : ''}" aria-pressed="${startRegion === r.key}" data-region="${r.key}">${r.label}</button>`).join('');
    grid.querySelectorAll('.ow-div-pick').forEach((el) => el.addEventListener('click', () => {
      startRegion = el.dataset.region;
      grid.querySelectorAll('.ow-div-pick').forEach((x) => { const on = x.dataset.region === startRegion; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      applyStartRegion(startRegion);
      if (DynSound) DynSound.tap();
    }));
    syncRegionPickerVisibility();
  }

  function renderDiffPicker() {
    const grid = $('diffPicker'); if (!grid) return;
    // Il testo di sapore da solo non dice quanto pesa davvero ogni livello: il tooltip mette
    // i numeri concreti dietro "più margine economico"/"meno imprevisti" ecc.
    const diffTip = (d) => 'Budget ' + Math.round(d.budgetMult * 100) + '% · Forza propria ' + (d.teamEffDelta >= 0 ? '+' : '') + d.teamEffDelta + ' · Stipendi ' + Math.round(d.wageMult * 100) + '% · Infortuni ' + Math.round(d.injuryMult * 100) + '% · Eventi ' + Math.round(d.eventMult * 100) + '% · Pazienza proprietà ' + Math.round(d.patienceMult * 100) + '%';
    grid.innerHTML = DIFFICULTIES.map((d) => `
      <button type="button" class="ow-diff-pick ${startDifficulty === d.key ? 'on' : ''}" aria-pressed="${startDifficulty === d.key}" data-diff="${d.key}" title="${diffTip(d)}">
        <b>${d.label}</b><small>${d.blurb}</small>
      </button>`).join('');
    grid.querySelectorAll('.ow-diff-pick').forEach((el) => el.addEventListener('click', () => {
      startDifficulty = el.dataset.diff;
      grid.querySelectorAll('.ow-diff-pick').forEach((x) => { const on = x.dataset.diff === startDifficulty; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (DynSound) DynSound.tap();
    }));
  }

  function renderSeasonsPicker() {
    const grid = $('seasonsPicker'); if (!grid) return;
    grid.innerHTML = SEASON_LENGTHS.map((n) => `<button type="button" class="ow-div-pick ${startSeasons === n ? 'on' : ''}" aria-pressed="${startSeasons === n}" data-seasons="${n}">${n} stagioni</button>`).join('');
    grid.querySelectorAll('[data-seasons]').forEach((el) => el.addEventListener('click', () => {
      startSeasons = +el.dataset.seasons;
      grid.querySelectorAll('[data-seasons]').forEach((x) => { const on = +x.dataset.seasons === startSeasons; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (DynSound) DynSound.tap();
    }));
  }

  function renderTakeovers() {
    const grid = $('takeoverGrid');
    grid.innerHTML = takeovers.map((t, i) => `
      <button type="button" class="ow-takeover ${selTakeover === i ? 'on' : ''}" aria-pressed="${selTakeover === i}" data-i="${i}">
        <b>${t.title}</b>
        <small>${t.blurb}</small>
        <span class="ow-tk-row"><span>Budget</span><b>${fmtMoney(t.budget)}</b></span>
        <span class="ow-tk-row"><span>Stadio</span><b>${STADIUM[t.stadiumTier].cap.toLocaleString('it-IT')} posti</b></span>
        <span class="ow-tk-row"><span>Tifoseria</span><b>${t.fanbase >= 1.12 ? 'Ampia' : t.fanbase >= 1.0 ? 'Discreta' : 'Modesta'}</b></span>
      </button>`).join('');
    grid.querySelectorAll('.ow-takeover').forEach((el) => el.addEventListener('click', () => {
      selTakeover = +el.dataset.i;
      grid.querySelectorAll('.ow-takeover').forEach((x) => { const on = +x.dataset.i === selTakeover; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (DynSound) DynSound.tap();
    }));
  }

  function updateCrestPreview() {
    const wrap = $('crestPreviewWrap'); if (wrap) wrap.innerHTML = crestMarkup(crestShape, crestColors, 'setup-crest');
    applyClubTheme(crestColors);
    const c1 = $('crestColor1'), c2 = $('crestColor2');
    if (c1) c1.value = crestColors[0]; if (c2) c2.value = crestColors[1];
    document.querySelectorAll('.ow-crest-shape').forEach((el) => { const on = el.dataset.shape === crestShape; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
  }

  // Un doppio tocco su "Compra il club" creava due carriere identiche (due slot salvati):
  // startDynasty non è idempotente e il secondo click arrivava prima del cambio schermata.
  let startingDynasty = false;

  function boot() {
    renderDivPicker();
    renderRegionPicker();
    renderDiffPicker();
    renderSeasonsPicker();
    takeovers = genTakeovers(startDiv); renderTakeovers();
    if (!$('owClubName').value) { lastSuggestedClub = pick(POOLS[startDiv]).n; $('owClubName').value = lastSuggestedClub; }   // suggerimento a caso, modificabile
    updateCrestPreview();
    document.querySelectorAll('.ow-crest-shape').forEach((el) => el.addEventListener('click', () => { crestShape = el.dataset.shape; updateCrestPreview(); }));
    const c1 = $('crestColor1'), c2 = $('crestColor2');
    if (c1) c1.addEventListener('input', (e) => { crestColors[0] = e.target.value; updateCrestPreview(); });
    if (c2) c2.addEventListener('input', (e) => { crestColors[1] = e.target.value; updateCrestPreview(); });
    const crestReroll = $('crestRerollBtn');
    if (crestReroll) crestReroll.addEventListener('click', () => { crestColors = randCrestColors(); updateCrestPreview(); });
    $('owRerollBtn').addEventListener('click', () => { takeovers = genTakeovers(startDiv); selTakeover = -1; renderTakeovers(); toast('Nuove condizioni di partenza sul tavolo.'); });
    // Con gli slot multipli, comprare un nuovo club non minaccia mai le carriere già
    // salvate (restano nell'elenco "Le tue carriere" qui sotto): nessuna conferma di
    // sovrascrittura da chiedere.
    const hardcoreChk = $('hardcoreChk'), hardcoreToggle = $('hardcoreToggle');
    if (hardcoreChk) hardcoreChk.addEventListener('change', () => {
      startHardcore = hardcoreChk.checked;
      if (hardcoreToggle) hardcoreToggle.classList.toggle('on', startHardcore);
      if (DynSound) DynSound.tap();
    });
    $('owStartBtn').addEventListener('click', () => {
      if (selTakeover < 0) {
        // Il bottone è in fondo a una pagina lunga, la griglia da scegliere è sopra e spesso
        // fuori schermo: oltre a dirlo, ci si riporta lì.
        toast('Scegli prima una situazione di partenza.', 'error');
        const grid = $('takeoverGrid');
        if (grid) { grid.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); const first = grid.querySelector('.ow-takeover'); if (first) first.focus({ preventScroll: true }); }
        return;
      }
      // Una sola dynasty Hardcore per volta: vero spirito "una vita sola", niente farm di
      // tentativi in parallelo. Non cancella nulla, blocca solo la creazione di una seconda
      // finché quella in corso non finisce (a fine carriera esce comunque dall'indice, vedi
      // clearSave() in endDynasty).
      if (startHardcore && readSavesIndex().some((m) => m.hardcore)) {
        toast('🔥 Hai già una dynasty Hardcore in corso: portala a termine (o abbandonala) prima di iniziarne un\'altra.', 'error');
        return;
      }
      if (startingDynasty) return;
      startingDynasty = true; setTimeout(() => { startingDynasty = false; }, 1000);
      startDynasty(cleanText(($('owName').value || '').trim()) || 'Il Presidente', takeovers[selTakeover], cleanText(($('owClubName').value || '').trim()), startDiv, startDifficulty, startSeasons, startHardcore, startDiv <= 1 ? startRegion : null);
    });
    $('owHomeBtn').addEventListener('click', () => { saveGame(); location.href = 'index.html'; });
    renderSaveSlots();
    window.addEventListener('pagehide', saveGame);
    const soundBtn = $('owSoundBtn');
    if (soundBtn) {
      const syncSoundBtn = () => { const muted = DynSound && DynSound.isMuted(); soundBtn.textContent = muted ? '🔇' : '🔊'; soundBtn.classList.toggle('muted', !!muted); soundBtn.setAttribute('aria-pressed', String(!muted)); soundBtn.setAttribute('aria-label', muted ? 'Audio disattivato: attivalo' : 'Audio attivo: disattivalo'); soundBtn.title = muted ? 'Audio disattivato' : 'Audio attivo'; };
      syncSoundBtn();
      soundBtn.addEventListener('click', () => { if (DynSound) DynSound.toggleMuted(); syncSoundBtn(); });
    }
    const trophyCaseBtn = $('owTrophyCaseBtn');
    if (trophyCaseBtn) trophyCaseBtn.addEventListener('click', showTrophyCase);
    const leaderboardBtn = $('owGlobalLeaderboardBtn');
    if (leaderboardBtn) leaderboardBtn.addEventListener('click', showGlobalLeaderboard);
    // Stesso bottone, anche sulla schermata iniziale: prima la classifica globale era
    // raggiungibile solo dalla topbar, visibile solo a carriera già avviata — così è
    // consultabile anche prima di comprare un club.
    const homeLeaderboardBtn = $('owHomeLeaderboardBtn');
    if (homeLeaderboardBtn) homeLeaderboardBtn.addEventListener('click', showGlobalLeaderboard);
    const notifBtn = $('owNotifBtn');
    if (notifBtn) notifBtn.addEventListener('click', openReminders);
    const mpBtn = $('owMultiplayerBtn');
    if (mpBtn) mpBtn.addEventListener('click', openMultiplayerHub);
    const tutBtn = $('owTutorialBtn');
    if (tutBtn) tutBtn.addEventListener('click', openTutorial);
    $('owNextBtn').addEventListener('click', () => { S._bulkFrom = null; if (S._playoffState && !S._playoffState.done) playNextPlayoffStepUI(); else maybePressConference(() => simMatch()); });
    $('owSimBtn').addEventListener('click', () => simToEnd());
    $('owTableBtn').addEventListener('click', showTable);
    $('owClubBtn').addEventListener('click', showClub);
    bindGlobalKeys();
  }

  // Tastiera, registrata una volta sola:
  // - Invio o Spazio sulla schermata partite (a nessun modale aperto e senza un campo o un
  //   bottone a fuoco) giocano la prossima partita: su desktop una stagione da 46 giornate
  //   si avanza senza dover tenere il mouse fermo sul bottone;
  // - Invio/Spazio attivano gli elementi resi "bottone" via role (righe della rosa, pedine
  //   della formazione, pillola della coppa europea), che essendo dei <div>/<span> non
  //   reagiscono da soli alla tastiera come un <button> vero.
  function bindGlobalKeys() {
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target;
      if (t && t.matches && t.matches('[role="button"]:not(button)')) { ev.preventDefault(); t.click(); return; }
      if (t && t.closest && t.closest('button, a, input, select, textarea, label, [role="button"], [role="tab"]')) return;
      if (!$('owOverlay').classList.contains('hidden')) return;
      if ($('owSeasonScreen').classList.contains('hidden')) return;
      const next = $('owNextBtn');
      if (next && !next.disabled) { ev.preventDefault(); next.click(); }
    });
  }

  /* ---------------- sala del consiglio ---------------- */
  function ladderHTML() {
    return `<div class="ow-ladder">${DIVS.map((d, i) => `<span class="ow-rung ${i === S.div ? 'on' : ''} ${i < S.div ? 'done' : ''}">${d.name}</span>`).join('<span class="ow-arrow">›</span>')}</div>`;
  }

  function meterHTML(label, v, warn) {
    const col = v >= 60 ? 'var(--dyn)' : v >= 35 ? 'var(--gold)' : 'var(--bad)';
    return `<div class="ow-meter"><span class="lbl">${label}</span><span class="bar"><span class="fill" style="width:${v}%;background:${col}"></span></span><span class="val" style="color:${col}">${Math.round(v)}${warn ? ' ⚠️' : ''}</span></div>`;
  }

  // Moduli disponibili per l'anteprima formazione: ogni riga è [ruolo, quanti, ruoloFlex,
  // quantiFlex], dall'attacco (in alto) al portiere (in basso). `quantiFlex` sono gli slot
  // "esterni" di quella riga (ai lati, i primi che finiscono nella visuale) che possono
  // essere presi anche da `ruoloFlex` se il migliore disponibile lì è più forte di un
  // centrocampista puro: un esterno può benissimo essere un attaccante di ruolo. Un ruolo
  // che compare in due righe (es. i due mediani vs i tre trequartisti nel 4-2-3-1) si
  // "divide" prendendo i migliori per la riga più avanzata e i successivi per quella più
  // arretrata: una semplificazione ragionevole dato che il gioco non distingue
  // centrocampisti offensivi/difensivi come ruoli separati.
  const FORMATIONS = {
    '433': { label: '4-3-3', rows: [['ATT', 3], ['CEN', 3], ['DIF', 4], ['POR', 1]] },
    '442': { label: '4-4-2', rows: [['ATT', 2], ['CEN', 4, 'ATT', 2], ['DIF', 4], ['POR', 1]] },
    '352': { label: '3-5-2', rows: [['ATT', 2], ['CEN', 5, 'ATT', 2], ['DIF', 3], ['POR', 1]] },
    '4231': { label: '4-2-3-1', rows: [['ATT', 1], ['CEN', 3, 'ATT', 2], ['CEN', 2], ['DIF', 4], ['POR', 1]] },
    '343': { label: '3-4-3', rows: [['ATT', 3], ['CEN', 4, 'ATT', 2], ['DIF', 3], ['POR', 1]] },
    '532': { label: '5-3-2', rows: [['ATT', 2], ['CEN', 3], ['DIF', 5], ['POR', 1]] },
    '424': { label: '4-2-4', rows: [['ATT', 4], ['CEN', 2], ['DIF', 4], ['POR', 1]] },
  };
  // Modulo scelto per l'anteprima: solo preferenza di vista, non persistito.
  let previewFormation = '433';
  // Chi hai selezionato per uno scambio titolare/panchina (pid), o null se non stai
  // scambiando nessuno. Anche questo solo stato di vista, non persistito.
  let selectedPreviewPid = null;

  // Probabile formazione: solo un'anteprima (i migliori per overall in ciascun ruolo, gli
  // stessi criteri di pickMatchLineup ma senza il margine di casualità a partita). Non
  // incide sulle presenze/statistiche: è solo una vista d'insieme.
  function previewLineup() {
    const byPos = { POR: [], DIF: [], CEN: [], ATT: [] };
    S.squad.forEach((p) => { if (byPos[p.pos]) byPos[p.pos].push(p); });
    Object.keys(byPos).forEach((k) => byPos[k].sort((a, b) => b.ovr - a.ovr));
    return byPos;
  }
  // Stessi colori per ruolo dei tag POR/DIF/CEN/ATT già usati nella rosa (verde, azzurro,
  // bronzo, arancione), non quelli di qualità dell'overall: sul campo il colore identifica
  // subito il reparto, a colpo d'occhio.
  // Anello colorato + alone scuro (li stacca dal verde del campo) + ombra portata più
  // marcata, per farli risaltare bene anche su un campo scuro.
  const ROLE_BADGE = {
    POR: 'color:#0a3d2a;box-shadow:0 0 0 2px var(--good),0 0 0 5px rgba(0,0,0,.4),0 5px 12px rgba(0,0,0,.7)',
    DIF: 'color:#0a3350;box-shadow:0 0 0 2px #6fb3ff,0 0 0 5px rgba(0,0,0,.4),0 5px 12px rgba(0,0,0,.7)',
    CEN: 'color:#3a2405;box-shadow:0 0 0 2px var(--dyn),0 0 0 5px rgba(0,0,0,.4),0 5px 12px rgba(0,0,0,.7)',
    ATT: 'color:#4a0505;box-shadow:0 0 0 2px var(--bad),0 0 0 5px rgba(0,0,0,.4),0 5px 12px rgba(0,0,0,.7)',
  };
  function pitchRowHTML(list, count) {
    const chips = [];
    for (let i = 0; i < count; i++) {
      const p = list[i];
      const isCap = p && p.pid === S.captainPid;
      chips.push(p
        ? `<div class="ow-pitch-chip${p.pid === selectedPreviewPid ? ' sel' : ''}" role="button" tabindex="0" aria-pressed="${p.pid === selectedPreviewPid}" data-pid="${p.pid}" title="${p.n} · ${p.ovr}${isCap ? ' · Capitano' : ''} · tocca per scambiare">
            <span class="ovr" style="${ROLE_BADGE[p.pos] || ''}">${p.ovr}</span><span class="nm">${flagOf(p)}${p.n.split(' ').slice(-1)[0]}${isCap ? ' <span class="ow-pitch-cap" title="Capitano">©</span>' : ''}</span></div>`
        : '<div class="ow-pitch-chip empty"><span class="ovr">–</span><span class="nm">—</span></div>');
    }
    return `<div class="ow-pitch-row">${chips.join('')}</div>`;
  }
  // Costruisce una riga con slot flessibili: `pureN` (n - flexN) posti restano di `role`
  // (i centrali), i restanti `flexN` posti (gli esterni, ai lati della riga) vanno ai
  // migliori disponibili fra chi è rimasto di `role` e di `flexRole`, chiunque dei due
  // abbia l'overall più alto. Ogni giocatore usato avanza il cursore del SUO ruolo reale,
  // così non viene ripescato in una riga successiva.
  function buildFlexRow(byPos, cursor, role, n, flexRole, flexN) {
    const pureN = n - flexN;
    const pure = byPos[role].slice(cursor[role], cursor[role] + pureN);
    cursor[role] += pure.length;
    const pool = byPos[role].slice(cursor[role]).map((p) => ({ p, src: role }))
      .concat(byPos[flexRole].slice(cursor[flexRole]).map((p) => ({ p, src: flexRole })))
      .sort((a, b) => b.p.ovr - a.p.ovr)
      .slice(0, flexN);
    pool.forEach((m) => { cursor[m.src]++; });
    const flexPlayers = pool.map((m) => m.p);
    const half = Math.ceil(flexPlayers.length / 2);
    return flexPlayers.slice(0, half).concat(pure, flexPlayers.slice(half));
  }
  // Undici (o meno, a seconda del modulo) migliori disponibili per il modulo dato, in
  // ordine di riga: solo pid, null dove il ruolo non ha abbastanza giocatori.
  function computeAutoXI(key) {
    const f = FORMATIONS[key] || FORMATIONS['433'];
    const byPos = previewLineup();
    const cursor = { POR: 0, DIF: 0, CEN: 0, ATT: 0 };
    const pids = [];
    f.rows.forEach(([role, n, flexRole, flexN]) => {
      const list = flexN ? buildFlexRow(byPos, cursor, role, n, flexRole, flexN) : byPos[role].slice(cursor[role], cursor[role] + n);
      if (!flexN) cursor[role] += n;
      for (let i = 0; i < n; i++) pids.push(list[i] ? list[i].pid : null);
    });
    return pids;
  }
  // La formazione mostrata è quella scelta a mano (S.previewXI), finché resta valida per
  // il modulo attuale e tutti i pid sono ancora in rosa; altrimenti si ricalcola quella
  // automatica e diventa la nuova base. Così gli scambi fatti a mano restano finché non
  // cambi modulo o venda/perda uno dei titolari scelti.
  function getPreviewXI() {
    const f = FORMATIONS[previewFormation] || FORMATIONS['433'];
    const totalSlots = f.rows.reduce((a, r) => a + r[1], 0);
    const stored = S.previewXI;
    if (stored && stored.key === previewFormation && Array.isArray(stored.pids) && stored.pids.length === totalSlots) {
      if (stored.pids.every((pid) => pid == null || S.squad.some((p) => p.pid === pid))) return stored.pids;
    }
    const auto = computeAutoXI(previewFormation);
    S.previewXI = { key: previewFormation, pids: auto };
    return auto;
  }
  function pitchHTML(key, pids) {
    const f = FORMATIONS[key] || FORMATIONS['433'];
    let idx = 0;
    const rows = f.rows.map(([role, n]) => {
      const slotPids = pids.slice(idx, idx + n); idx += n;
      const players = slotPids.map((pid) => (pid != null ? S.squad.find((p) => p.pid === pid) : null));
      return pitchRowHTML(players, n);
    }).join('');
    return `<div class="ow-pitch">${rows}</div>`;
  }
  // Panchina: tutta la rosa che non è fra i titolari del modulo scelto, ordinata per ruolo
  // e overall. Ogni riga è cliccabile come i giocatori in campo, per lo scambio.
  // Panchina "vera": non tutta la rosa rimasta, solo i migliori candidati a subentrare per
  // ruolo (1 portiere, 2 difensori, 2 centrocampisti, 2 attaccanti), come una vera lista
  // convocati — altrimenti con una rosa piena si riempirebbe di 15+ giocatori.
  const BENCH_QUOTA = { POR: 1, DIF: 2, CEN: 2, ATT: 2 };
  function benchHTML(xiPids) {
    const xiSet = new Set(xiPids.filter((x) => x != null));
    const order = { POR: 0, DIF: 1, CEN: 2, ATT: 3 };
    const available = S.squad.filter((p) => !xiSet.has(p.pid)).sort((a, b) => (order[a.pos] - order[b.pos]) || (b.ovr - a.ovr));
    const bench = [];
    Object.keys(BENCH_QUOTA).forEach((role) => { bench.push(...available.filter((p) => p.pos === role).slice(0, BENCH_QUOTA[role])); });
    if (!bench.length) return '<div class="ow-sub" style="margin-top:8px">Nessun altro giocatore in panchina.</div>';
    return `
      <div class="ow-bench-title">🔁 Panchina — tocca un giocatore e poi uno in campo per scambiarli</div>
      <div class="ow-bench-list">${bench.map((p) => `
        <div class="ow-bench-chip${p.pid === selectedPreviewPid ? ' sel' : ''}" role="button" tabindex="0" aria-pressed="${p.pid === selectedPreviewPid}" aria-label="${escapeHtml(p.n)}, ${POS_LABEL[p.pos]}, ${p.ovr}: panchina" data-pid="${p.pid}">
          <span class="ovr" style="${ROLE_BADGE[p.pos] || ''}">${p.ovr}</span>
          <span class="postag postag-${p.pos}">${p.pos}</span>
          <span class="nm">${flagOf(p)}${p.n}</span>
        </div>`).join('')}</div>`;
  }
  function formationPickerHTML() {
    return `<div class="ow-formation-picker">${Object.keys(FORMATIONS).map((k) => `<button type="button" class="ow-formation-pick ${previewFormation === k ? 'on' : ''}" aria-pressed="${previewFormation === k}" data-formation="${k}">${FORMATIONS[k].label}</button>`).join('')}</div>`;
  }

  // Istruzioni tattiche (pressing/ampiezza/ritmo): tre gruppi di pillole indipendenti dal
  // modulo, stesso stile visivo di formationPickerHTML. `group` è press/width/tempo, `opts` è
  // TACTIC_PRESS/WIDTH/TEMPO (data.js).
  function tacticPickerHTML(title, group, opts) {
    const cur = (S.tacticStyle || DEFAULT_TACTIC_STYLE)[group];
    return `<div class="ow-sub" style="margin-top:8px">${title}</div>
      <div class="ow-formation-picker">${Object.keys(opts).map((k) => `<button type="button" class="ow-formation-pick ${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" data-tactic="${group}" data-tactic-val="${k}" title="${opts[k].desc}">${opts[k].icon} ${opts[k].label}</button>`).join('')}</div>`;
  }

  // Sparkline SVG minimale (nessuna libreria): un'area + linea che mostra l'andamento
  // di una serie di valori stagione per stagione, usata nella bacheca di fine carriera.
  function sparklineSVG(values, color) {
    const w = 320, h = 54, pad = 4;
    if (!values || values.length < 2) return '<div class="ow-sub">Non ancora abbastanza stagioni per un grafico.</div>';
    const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1;
    const stepX = (w - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)]);
    const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
    const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 3.4 : 1.8}" fill="${color}"/>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="ow-spark" preserveAspectRatio="none" role="img" aria-label="Andamento: da ${values[0]} a ${values[values.length - 1]} in ${values.length} punti">
      <path d="${area}" fill="${color}" fill-opacity=".14" stroke="none"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
  }
  // Etichetta + sparkline: prima definita solo dentro renderEnd() (bacheca di fine carriera),
  // promossa qui per essere riusabile anche dalla tab Finanze durante la carriera.
  const sparkRow = (label, values, color) => `
    <div class="ow-spark-row"><span class="lbl">${label}</span></div>
    ${sparklineSVG(values, color)}`;

  // Coriandoli CSS per i momenti che contano (promozione, scudetto, coppe): niente
  // canvas o librerie, solo elementi assoluti con un'animazione di caduta.
  function fireConfetti(container) {
    if (!container || prefersReducedMotion()) return;
    const wrap = document.createElement('div'); wrap.className = 'confetti-wrap';
    const colors = ['#ffd24a', '#c9902f', '#f0c869', '#ff2d78', '#28d9a0'];
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('span'); el.className = 'confetti-piece';
      el.style.left = (Math.random() * 100) + '%';
      el.style.background = pick(colors);
      el.style.animationDelay = (Math.random() * 0.5) + 's';
      el.style.animationDuration = (2 + Math.random() * 1.2) + 's';
      wrap.appendChild(el);
    }
    container.appendChild(wrap);
    setTimeout(() => wrap.remove(), 4200);
  }

  function celebrate(panelEl) {
    if (!panelEl) return;
    panelEl.classList.add('celebrate');
    fireConfetti(panelEl);
  }

  // Buonuscita per esonerare allenatore/DS/preparatore: il 30% classico, il 50% in hardcore —
  // le assunzioni pesano di più, non si cambia idea a cuor leggero.
  const severanceRate = () => (S.hardcore ? 0.5 : 0.3);

  // Ordine fisso delle tab della Dirigenza, usato dallo swipe orizzontale (bindBoardDelegation)
  // per sapere qual è la tab "successiva"/"precedente" — le stesse 4 chiavi di TABS in
  // renderBoard, ma qui accessibile senza dover ricostruire quell'array locale.
  const BOARD_TAB_ORDER = ['finanze', 'rosa', 'stadio', 'sponsor'];

  // Anima un numero testuale da `from` a `to` in `duration` ms (ease-out), invece del solito
  // scatto istantaneo: usata per Budget/Libero da spendere nella sticky bar. Se `from` è null
  // (primo render della sessione, nessun valore precedente da cui partire) mostra `to` subito,
  // senza animare — altrimenti sembrerebbe un conteggio da zero, non un cambiamento reale.
  function animateNumber(el, from, to, duration, fmt) {
    if (!el) return;
    if (from == null || from === to || prefersReducedMotion()) { el.textContent = fmt(to); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Stessa idea di animateNumber ma per un ow-meter (barra + valore): anima sia la larghezza
  // del riempimento sia il numero, ricalcolando il colore soglia ad ogni frame (stessa
  // formula di meterHTML) così la barra cambia colore nel momento esatto in cui attraversa
  // una soglia, invece di scattare al colore finale fin da subito.
  function animateMeterFill(fillEl, valEl, from, to, duration, warnSuffix) {
    if (!fillEl) return;
    const colorFor = (v) => (v >= 60 ? 'var(--dyn)' : v >= 35 ? 'var(--gold)' : 'var(--bad)');
    if (from == null || from === to || prefersReducedMotion()) {
      fillEl.style.width = to + '%'; fillEl.style.background = colorFor(to);
      if (valEl) valEl.textContent = Math.round(to) + warnSuffix; if (valEl) valEl.style.color = colorFor(to);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      fillEl.style.width = v + '%'; fillEl.style.background = colorFor(v);
      if (valEl) { valEl.textContent = Math.round(v) + warnSuffix; valEl.style.color = colorFor(v); }
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Valori mostrati all'ultimo render, per sapere da dove far partire l'animazione del
  // prossimo: cache di modulo apposta (non su S), sono solo uno stato di presentazione,
  // non vanno in localStorage insieme alla carriera.
  let lastShownBudget = null, lastShownFree = null, lastShownSaveId = null;
  const lastShownMeter = { sent: null, ownerRating: null };

  // Richiamata subito dopo aver ricostruito l'HTML della board: anima i numeri che sono
  // appena cambiati invece di lasciarli scattare al valore finale.
  function enhanceBoardNumbers(body, free) {
    const cells = body.querySelectorAll('.ow-stickybar .cell');
    if (cells[0]) animateNumber(cells[0].querySelector('b'), lastShownBudget, S.budget, 500, fmtMoney);
    if (cells[2]) animateNumber(cells[2].querySelector('b'), lastShownFree, free, 500, fmtMoney);
    // "Cosa è appena cambiato": accanto all'etichetta Budget compare per un paio di secondi la
    // differenza col valore mostrato prima (+€140k verde, -€47k rosso). Il numero grande si
    // limitava a scorrere fino al nuovo totale, senza dire di quanto. Solo se la carriera è la
    // stessa del render precedente (cambiando slot non è una variazione, è un altro club).
    const sameCareer = lastShownSaveId === (S._saveId || null);
    if (cells[0] && sameCareer && lastShownBudget != null && lastShownBudget !== S.budget) {
      const diff = S.budget - lastShownBudget, lbl = cells[0].querySelector('span');
      if (lbl) lbl.insertAdjacentHTML('beforeend', `<em class="ow-delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '-'}${fmtMoney(Math.abs(diff))}</em>`);
    }
    lastShownSaveId = S._saveId || null;
    lastShownBudget = S.budget; lastShownFree = free;

    if (boardTab === 'finanze') {
      const meters = body.querySelectorAll('#boardTabBody .ow-meter');
      const order = [['sent', S.sent, S.sent < 30], ['ownerRating', S.ownerRating, S.ownerRating < 35]];
      meters.forEach((m, i) => {
        const entry = order[i]; if (!entry) return;
        const [key, val, warn] = entry;
        // Suona solo al MOMENTO in cui si entra in zona critica (prima era sopra soglia, ora
        // no), mai ad ogni render mentre ci si resta già sotto — altrimenti sarebbe un suono
        // ripetuto ad ogni click finché il valore non risale.
        const wasWarn = lastShownMeter[key] != null && lastShownMeter[key] < (key === 'sent' ? 30 : 35);
        if (warn && !wasWarn && DynSound) DynSound.alarm();
        animateMeterFill(m.querySelector('.fill'), m.querySelector('.val'), lastShownMeter[key], val, 500, warn ? ' ⚠️' : '');
        lastShownMeter[key] = val;
      });
    }
  }

  // Un solo listener delegato per la board (click + change), registrato una sola volta
  // invece che ri-registrato ad ogni renderBoard(): prima ogni singolo click che causava un
  // re-render (cambio tab, filtro rosa, vendita giocatore...) ricostruiva l'intero innerHTML
  // di #boardBody e poi ri-collegava ~30 querySelectorAll().forEach(addEventListener), anche
  // quando era cambiato un solo elemento. Qui gli handler rileggono sempre lo stato corrente
  // (S, mpSess, ecc.) al momento del click invece di catturarlo per closure, quindi restano
  // validi identici dopo qualunque renderBoard() successivo.
  let boardDelegationBound = false;
  function bindBoardDelegation() {
    if (boardDelegationBound) return;
    boardDelegationBound = true;
    const body = $('boardBody');

    body.addEventListener('click', (ev) => {
      const on = (sel) => ev.target.closest(sel);
      let el;

      if ((el = on('[data-tab]'))) { if (boardTab !== el.dataset.tab && DynSound) DynSound.tap(); boardTab = el.dataset.tab; renderBoard(); return; }

      // Primi passi (solo prima stagione): ogni voce porta alla tab dove si fa quella cosa.
      if ((el = on('[data-guide-tab]'))) { boardTab = el.dataset.guideTab; renderBoard(); const tabs = body.querySelector('.ow-tabs'); if (tabs) tabs.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); return; }
      if (on('#guideDismissBtn')) { setGuideDismissed(); renderBoard(); return; }

      // Scheda giocatore: tocca la riga per aprirla, ma non se il tocco è su uno dei bottoni
      // di azione della riga stessa (Vendi/Rinnova/Riscatta), che hanno il loro handler.
      if ((el = on('.ow-player[data-pid]')) && !ev.target.closest('button')) { openPlayerDetail(+el.dataset.pid); return; }

      // La cessione è irreversibile: prima di eseguirla chiediamo conferma con l'overlay
      // (stesso pattern di "Vendi il club"/"Dimettiti"), per evitare che un tap sbagliato sul
      // 💷 nella lista rosa costi un giocatore per sempre.
      if ((el = on('.ow-x'))) {
        const p = S.squad.find((x) => x.pid === +el.dataset.rel); if (!p) return;
        const fee = quickSaleFee(p);
        const capped = quickSaleCapped(p) && fee < Math.round(playerValue(p) * 0.3);
        const isFlag = isClubFlag(p);
        // Bandiera del club (isClubFlag, sim.js): cederla non è mai gratis in termini di
        // umore, quanti soldi porti o quanto sia normale nel resto della carriera — i tifosi
        // ci restano male a prescindere.
        const sellFlagPlayer = () => {
          const i = S.squad.findIndex((x) => x.pid === p.pid); if (i < 0) return;
          pushAlumnus(p); S.squad.splice(i, 1); S.offers = (S.offers || []).filter((o) => o.pid !== p.pid); S.budget += fee;
          noteSaleRecord(p, fee, null);   // primato "cessione più ricca" (sim.js)
          if (isFlag) S.sent = clamp(S.sent - 4, 0, 100);
          toast('Ceduto ' + p.n + ' per ' + fmtMoney(fee) + (isFlag ? '. I tifosi non l\'hanno presa bene: era una bandiera.' : '.'), isFlag ? 'error' : 'money');
          renderBoard(); saveGame();
        };
        // Hardcore: cessione immediata, senza il passaggio dall'overlay di conferma — ogni
        // scelta sulla rosa è definitiva sul colpo, coerente con l'interruttore scelto alla
        // creazione della carriera.
        if (S.hardcore) { sellFlagPlayer(); return; }
        overlay(`<h2>Cedere ${p.n}?</h2>
          <div class="ow-spin-card">
            <div class="big" style="color:${ovrTier(p.ovr).c}">${p.ovr}</div>
            <div class="nm">${flagOf(p)}${p.n}${isFlag ? ' 🏳️' : ''}</div>
            <div class="meta">età ${p.age} · ${POS_LABEL[p.pos]}</div>
            <div class="meta">Incassi <b>${fmtMoney(fee)}</b> — non si può annullare</div>
            ${capped ? `<div class="meta">Appena arrivato e mai sceso in campo: ${p.paidFee ? 'recuperi al massimo il 40% di quanto è costato' : 'è arrivato gratis, nessuno paga per averlo'}.</div>` : ''}
            ${isFlag ? '<div class="meta" style="color:var(--bad)">🏳️ È una bandiera del club: i tifosi reagiranno male alla cessione.</div>' : ''}
          </div>
          <div class="dyn-modal-actions">
            <button class="dyn-btn dyn-btn-primary" id="ovConfirmRel">Cedi per ${fmtMoney(fee)}</button>
            <button class="dyn-btn" id="ovCancelRel">Annulla</button>
          </div>`);
        $('ovConfirmRel').onclick = () => { closeOverlay(); sellFlagPlayer(); };
        $('ovCancelRel').onclick = closeOverlay;
        return;
      }

      // Rinnova un contratto: nella lista rosa il bottone compare solo per chi è in scadenza
      // (finalYear); per tutti gli altri il rinnovo resta possibile ma solo aprendo la scheda
      // del giocatore (tocca la riga), per non affollare la lista di bottoni "Rinnova" inutili
      // su una rosa intera. Sempre un aumento, più ripido per i giovani talenti; se non
      // rinnovi in tempo lo perdi a parametro zero.
      // Scoping su [data-renew] (non solo la classe .ow-renew): il bottone di riscatto qui
      // sotto riusa la STESSA classe CSS per lo stile (niente a che fare con la logica), e con
      // un dispatcher a catena come questo il primo match vince — .ow-renew da solo avrebbe
      // sempre intercettato anche i click sul riscatto, che qui non ha data-renew (undefined
      // → "giocatore non trovato" → return silenzioso, il vero handler sotto non veniva mai
      // raggiunto). Bug reale introdotto dal passaggio a delegation: nel vecchio codice erano
      // due addEventListener indipendenti sullo stesso bottone, coesistevano senza conflitto.
      if ((el = on('[data-renew]'))) {
        const p = S.squad.find((x) => x.pid === +el.dataset.renew); if (!p) return;
        openRenewOverlay(p); return;
      }

      // Riscatta un giocatore in prestito a titolo definitivo: se non lo fai entro l'inizio
      // della stagione, torna al suo club (vedi startSeason).
      if ((el = on('[data-buyback]'))) {
        const p = S.squad.find((x) => x.pid === +el.dataset.buyback); if (!p) return;
        const fee = loanBuybackFee(p);
        if (S.budget < fee) { toast('Non hai abbastanza per riscattarlo.', 'error'); return; }
        S.budget -= fee; p.loan = false; p.yrs = 3 + rnd(2); markSigned(p, fee);
        toast(p.n + ' riscattato a titolo definitivo per ' + fmtMoney(fee) + '.', 'spend');
        renderBoard(); saveGame(); return;
      }

      // Accetta un'offerta: incassi la cifra, il giocatore parte. Vendere un vero big infastidisce l'ambiente.
      if ((el = on('.ow-accept'))) {
        const pid = +el.dataset.acc; const o = (S.offers || []).find((x) => x.pid === pid);
        const i = S.squad.findIndex((x) => x.pid === pid); if (!o || i < 0) return;
        const p = S.squad[i];
        pushAlumnus(p); S.budget += o.fee; S.squad.splice(i, 1); S.offers = S.offers.filter((x) => x.pid !== pid);
        noteSaleRecord(p, o.fee, o.club);
        if (p.ovr >= divOf().avg + 6) S.sent = clamp(S.sent - 3, 0, 100);
        toast('Venduto ' + p.n + ' al ' + o.club + ' per ' + fmtMoney(o.fee) + '.', 'money'); renderBoard(); saveGame(); return;
      }

      // Un po' di leva negoziale invece di prendere-o-lasciare: rilanciare una sola volta per
      // offerta (per non ridurla a un loop di "chiedi sempre di più senza rischio") — il
      // compratore può alzare l'offerta o ritirarsi del tutto.
      if ((el = on('[data-counter]'))) {
        if (S.hardcore) return;   // il bottone non c'è già in hardcore, guardia difensiva
        const pid = +el.dataset.counter; const o = (S.offers || []).find((x) => x.pid === pid); if (!o || o.countered) return;
        const p = S.squad.find((x) => x.pid === pid);
        o.countered = true;
        if (Math.random() < 0.65) {
          const higher = Math.round(o.fee * (1.15 + Math.random() * 0.15) / 1e4) * 1e4;
          o.fee = higher;
          toast(o.club + ' alza l\'offerta a ' + fmtMoney(higher) + (p ? ' per ' + p.n : '') + '.', 'money');
        } else {
          S.offers = S.offers.filter((x) => x.pid !== pid);
          toast(o.club + ' si ritira dopo il rilancio: niente offerta' + (p ? ' per ' + p.n : '') + '.', 'error');
        }
        renderBoard(); saveGame(); return;
      }

      if ((el = on('.ow-reject'))) {
        const pid = +el.dataset.rej; const o = (S.offers || []).find((x) => x.pid === pid); if (!o) return;
        const p = S.squad.find((x) => x.pid === pid);
        S.offers = S.offers.filter((x) => x.pid !== pid);
        toast('Rifiuti l\'offerta del ' + o.club + (p ? ' per ' + p.n : '') + '.'); renderBoard(); saveGame(); return;
      }

      if ((el = on('.ow-hire'))) {
        const m = S.mgrOpts[+el.dataset.hire]; if (!m) return;
        const sev = Math.round(S.manager.salary * severanceRate());
        if (S.budget < sev) { toast('Non puoi permetterti la buonuscita.', 'error'); return; }
        S.budget -= sev; S.manager = m; S.mgrOpts = null;
        toast(m.n + ' prende in carico la squadra. Buonuscita pagata: ' + fmtMoney(sev), 'spend'); renderBoard(); saveGame(); return;
      }

      if ((el = on('.ow-hire-ds'))) {
        const m = (S.dsOpts || [])[+el.dataset.hireds]; if (!m) return;
        S.sportingDirector = m; S.dsOpts = null;
        toast(m.n + ' è il nuovo direttore sportivo.', 'success'); renderBoard(); saveGame(); return;
      }

      if (on('#dsFireBtn')) {
        const sev = Math.round(S.sportingDirector.salary * severanceRate());
        if (S.budget < sev) { toast('Non puoi permetterti la buonuscita.', 'error'); return; }
        S.budget -= sev; S.sportingDirector = null; S.dsOpts = null;
        toast('Direttore sportivo licenziato. Buonuscita pagata: ' + fmtMoney(sev), 'spend'); renderBoard(); saveGame(); return;
      }

      if ((el = on('.ow-hire-fit'))) {
        const m = (S.fitOpts || [])[+el.dataset.hirefit]; if (!m) return;
        S.fitnessCoach = m; S.fitOpts = null;
        toast(m.n + ' è il nuovo preparatore atletico.', 'success'); renderBoard(); saveGame(); return;
      }

      if (on('#fitFireBtn')) {
        const sev = Math.round(S.fitnessCoach.salary * severanceRate());
        if (S.budget < sev) { toast('Non puoi permetterti la buonuscita.', 'error'); return; }
        S.budget -= sev; S.fitnessCoach = null; S.fitOpts = null;
        toast('Preparatore atletico licenziato. Buonuscita pagata: ' + fmtMoney(sev), 'spend'); renderBoard(); saveGame(); return;
      }

      if ((el = on('.ow-offer[data-sp]'))) {
        const o = S.sponsorOpts[+el.dataset.sp]; if (!o) return;
        S.sponsor = o; S.sponsorOpts = null;
        toast('Firmato con ' + o.name + ' (maglia) per ' + fmtMoney(o.perYear) + ' all\'anno.', 'success'); renderBoard(); saveGame(); return;
      }
      if ((el = on('.ow-offer[data-stsp]'))) {
        const o = S.stadiumSponsorOpts[+el.dataset.stsp]; if (!o) return;
        S.stadiumSponsor = o; S.stadiumSponsorOpts = null;
        toast('Firmato con ' + o.name + ' (stadio) per ' + fmtMoney(o.perYear) + ' all\'anno.', 'success'); renderBoard(); saveGame(); return;
      }
      if ((el = on('.ow-offer[data-tesp]'))) {
        const o = S.techSponsorOpts[+el.dataset.tesp]; if (!o) return;
        S.techSponsor = o; S.techSponsorOpts = null;
        toast('Firmato con ' + o.name + ' (tecnico) per ' + fmtMoney(o.perYear) + ' all\'anno.', 'success'); renderBoard(); saveGame(); return;
      }

      if ((el = on('[data-inv]'))) {
        const o = (S.investorOpts || [])[+el.dataset.inv]; if (!o) return;
        // È l'unico bottone della Dirigenza che può costare il club intero (cessione forzata se
        // l'obiettivo salta) e non si può disdire: un tocco sbagliato scorrendo la pagina non
        // deve bastare. Stessa conferma di "Vendi il club", con le condizioni ripetute in chiaro.
        const seasons = o.deadlineSeason - S.season;
        overlay(`<h2>🏦 Firmare con ${escapeHtml(o.name)}?</h2>
          <p>Incassi <b>${fmtMoney(o.injection)}</b> subito e <b>${fmtMoney(o.yearly)}</b> ogni stagione. In cambio devi arrivare in <b>${DIVS[o.targetDiv].name}</b> entro ${seasons} stagion${seasons === 1 ? 'e' : 'i'} (stagione ${o.deadlineSeason}).</p>
          <div class="ow-warn" style="margin:0 0 14px;text-align:left">⚠️ Se non ci arrivi in tempo il fondo impone la <b>cessione forzata del club</b>: la carriera finisce lì. Il patto non si può sciogliere.</div>
          <div class="dyn-modal-actions">
            <button class="dyn-btn dyn-btn-primary" id="ovInvGo">Firma il patto</button>
            <button class="dyn-btn" id="ovInvNo">Ci penso ancora</button>
          </div>`);
        $('ovInvNo').onclick = closeOverlay;
        $('ovInvGo').onclick = () => {
          closeOverlay();
          if (S.investorDeal || !(S.investorOpts || []).includes(o)) return;
          S.investorDeal = o; S.investorOpts = null; S.budget += o.injection;
          toast(o.name + ' investe: +' + fmtMoney(o.injection) + ' subito. Obiettivo: ' + DIVS[o.targetDiv].name + ' entro la stagione ' + o.deadlineSeason + '.', 'success'); renderBoard(); saveGame();
        };
        return;
      }
      if (on('#investorDismissBtn')) { S.investorOpts = null; renderBoard(); saveGame(); return; }

      if (on('#upgradeBtn')) {
        const nx = STADIUM[S.stadiumTier + 1]; if (!nx) return;
        const cost = stadiumUpgradeCost(nx); if (S.budget < cost) return;
        spendGuard(cost, 'L\'ampliamento', '', () => {
          S.budget -= cost; S.stadiumTier++; S.stadiumSpent += cost; S.sent = clamp(S.sent + 3, 0, 100);
          toast('Le ruspe entrano in azione. Nuova capienza: ' + nx.cap.toLocaleString('it-IT'), 'spend'); renderBoard(); saveGame();
        });
        return;
      }

      if ((el = on('.ow-ticket'))) { S.ticket = +el.dataset.tk; renderBoard(); saveGame(); if (DynSound) DynSound.tap(); return; }

      if (on('#stadiumNameSaveBtn')) {
        const val = ($('stadiumNameInput').value || '').trim().slice(0, 40);
        S.stadiumName = val || null;
        toast('Nome dello stadio aggiornato.', 'success'); renderBoard(); saveGame(); return;
      }

      if (on('#spinStdBtn')) { doSpin(false); return; }
      if (on('#spinPremBtn')) { doSpin(true); return; }
      if (on('#spinPremRoleBtn')) { doSpin(true, true); return; }
      if (on('#spinStdRoleBtn')) { doSpin(false, true); return; }
      if (on('#freeAgentBtn')) { pickFreeAgentRole(); return; }


      if (on('#scoutUpgBtn')) {
        const lvl = (S.scoutLevel || 0) + 1, cost = scoutUpgradeCost(lvl); if (S.budget < cost) return;
        spendGuard(cost, 'L\'investimento nel settore giovanile', '', () => {
          S.budget -= cost; S.scoutLevel = lvl;
          toast('Settore giovanile potenziato: ' + SCOUT_TIERS[lvl].name + '.'); renderBoard(); saveGame();
        });
        return;
      }

      if ((el = on('[data-scoutsign]'))) {
        const i = +el.dataset.scoutsign;
        const p = S.scoutProspects && S.scoutProspects[i]; if (!p) return;
        p.homegrown = true;   // per l'achievement "Prodotto del vivaio" (sim.js, endSeason)
        S.squad.push(markSigned(p, 0));
        toast(p.n + ' entra in prima squadra dal settore giovanile.', 'success');
        S.scoutProspects = []; renderBoard(); saveGame(); return;
      }

      if ((el = on('[data-youthpromote]'))) {
        const p = promoteYouthPlayer(+el.dataset.youthpromote); if (!p) return;
        markSigned(p, 0);
        toast(p.n + ' sale in prima squadra dal vivaio.', 'success'); renderBoard(); saveGame(); return;
      }
      if ((el = on('[data-youthrelease]'))) {
        const pid = +el.dataset.youthrelease;
        const i = (S.youthSquad || []).findIndex((p) => p.pid === pid); if (i < 0) return;
        const p = S.youthSquad.splice(i, 1)[0];
        toast(p.n + ' viene rilasciato dal vivaio.'); renderBoard(); saveGame(); return;
      }

      if ((el = on('[data-role]'))) { squadRoleFilter = el.dataset.role; renderBoard(); if (DynSound) DynSound.tap(); return; }
      if (on('#squadSortBtn')) { squadSortDesc = !squadSortDesc; renderBoard(); return; }

      if ((el = on('[data-formation]'))) { previewFormation = el.dataset.formation; S.formation = previewFormation; selectedPreviewPid = null; renderBoard(); saveGame(); if (DynSound) DynSound.tap(); return; }

      if ((el = on('[data-tactic]'))) {
        if (!S.tacticStyle) S.tacticStyle = { ...DEFAULT_TACTIC_STYLE };
        S.tacticStyle[el.dataset.tactic] = el.dataset.tacticVal;
        renderBoard(); saveGame(); if (DynSound) DynSound.tap(); return;
      }

      // Scambio titolare/panchina: primo tocco seleziona, secondo tocco su un altro giocatore
      // scambia i due (stesso giocatore due volte = deseleziona). Funziona anche titolare
      // con titolare, per riordinare la formazione a piacere. Scoping esplicito ai chip di
      // campo/panchina (.ow-pitch-chip/.ow-bench-chip): un `[data-pid]` senza classe avrebbe
      // intercettato per errore anche le righe della lista rosa (stesso attributo, classe
      // .ow-player), che finivano per attivare ANCHE questo scambio oltre ad aprire la scheda
      // giocatore — un bug preesistente, corretto come effetto collaterale di questo scoping.
      if ((el = on('.ow-pitch-chip[data-pid], .ow-bench-chip[data-pid]'))) {
        const pid = +el.dataset.pid;
        if (selectedPreviewPid == null) { selectedPreviewPid = pid; renderBoard(); return; }
        if (selectedPreviewPid === pid) { selectedPreviewPid = null; renderBoard(); return; }
        const xi = S.previewXI.pids;
        const idxA = xi.indexOf(selectedPreviewPid), idxB = xi.indexOf(pid);
        if (idxA >= 0 && idxB >= 0) { xi[idxA] = pid; xi[idxB] = selectedPreviewPid; }
        else if (idxA >= 0) { xi[idxA] = pid; }
        else if (idxB >= 0) { xi[idxB] = selectedPreviewPid; }
        selectedPreviewPid = null;
        renderBoard(); saveGame(); return;
      }

      if (on('#resetXIBtn')) { S.previewXI = null; selectedPreviewPid = null; renderBoard(); saveGame(); return; }

      if (on('#mpBoardReadyBtn')) {
        const mpSess = readMpSession(); if (!mpSess) return;
        (async () => {
          // Stesso controllo di startSeason() (sim.js) prima di lasciar partire la stagione in
          // singolo: lì un budget/rosa insufficiente blocca "Inizia Stagione" con un avviso. In
          // multiplayer "Inizia Stagione" non esiste più (la stagione la avvia l'host per tutti),
          // quindi lo stesso controllo va fatto qui, altrimenti la tua simulazione fallirebbe in
          // silenzio nel browser dell'host (startSeason si ferma senza toast per un ctx remoto).
          if (S.squad.length < MIN_SQUAD) { toast('Ti servono almeno ' + MIN_SQUAD + ' giocatori per iniziare la prossima stagione. Ingaggia svincolati gratis se sei a corto.', 'error'); return; }
          const bill = kickoffBill();
          if (S.budget < bill) { toast('Ti mancano ' + fmtMoney(bill - S.budget) + ' per il monte ingaggi della prossima stagione: vendi giocatori o trova soldi prima di essere pronto.', 'error'); return; }
          saveGame();
          try {
            const data = await mpApi('ready', { code: mpSess.code, playerId: mpSess.playerId, ready: true, state: S });
            if (DynSound) DynSound.tap();
            stopMpPolling();
            renderLobby(data.room, mpSess.playerId);
          } catch (e) { toast(e.message || 'Impossibile sottomettere la carriera.', 'error'); mpRefreshAfterConflict(mpSess.code, mpSess.playerId, e); }
        })();
        return;
      }

      if (on('#mpBoardBackBtn')) {
        const mpSess = readMpSession(); if (!mpSess) return;
        (async () => {
          try {
            const room = await mpFetchState(mpSess.code);
            stopMpPolling();
            renderLobby(room, mpSess.playerId);
          } catch (e) { toast('Impossibile aggiornare lo stato della stanza.', 'error'); }
        })();
        return;
      }

      if (on('#startSeasonBtn')) {
        const why = startSeason();   // 'squad' | 'budget' se non è partita, altrimenti null
        if (why) { startBlockInfo = { why, sig: startBlockSig() }; renderBoard(); if (DynSound) DynSound.error(); }
        else { startBlockInfo = null; if (DynSound) DynSound.kickoff(); }
        return;
      }
      if (on('#sellBtn')) { confirmSell(); return; }
      if (on('#resignBtn')) { confirmResign(); return; }
    });

    // Tastiera sulla board: frecce sinistra/destra fra le tab (come ci si aspetta da un gruppo
    // di schede), Invio nel campo del nome dello stadio per salvarlo senza cercare il bottone.
    body.addEventListener('keydown', (ev) => {
      const t = ev.target;
      if (t && t.matches && t.matches('.ow-tab') && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'Home' || ev.key === 'End')) {
        const idx = BOARD_TAB_ORDER.indexOf(boardTab), last = BOARD_TAB_ORDER.length - 1;
        const nextIdx = ev.key === 'Home' ? 0 : ev.key === 'End' ? last : ev.key === 'ArrowRight' ? (idx >= last ? 0 : idx + 1) : (idx <= 0 ? last : idx - 1);
        ev.preventDefault();
        boardTab = BOARD_TAB_ORDER[nextIdx]; renderBoard();
        const nt = body.querySelector('.ow-tab.on'); if (nt) nt.focus({ preventScroll: true });
        return;
      }
      if (t && t.id === 'stadiumNameInput' && ev.key === 'Enter') { ev.preventDefault(); const sb = $('stadiumNameSaveBtn'); if (sb) sb.click(); }
    });

    body.addEventListener('change', (ev) => {
      if (ev.target.id === 'turboModeChk') { S.turboMode = ev.target.checked; toast(S.turboMode ? '⏩ Modalità veloce attiva.' : 'Modalità veloce disattivata.'); saveGame(); return; }
    });

    // Swipe orizzontale per cambiare tab (Finanze/Rosa/Stadio/Sponsor) su mobile, in aggiunta
    // al tocco sui pulsanti tab. Soglie: almeno 60px orizzontali e non più di 60px di deriva
    // verticale, altrimenti è uno scroll della lista, non uno swipe — { passive: true } perché
    // non serve mai bloccare lo scroll verticale nativo.
    const SWIPE_MIN_DX = 60, SWIPE_MAX_DY = 60;
    let touchStartX = null, touchStartY = null;
    body.addEventListener('touchstart', (ev) => {
      if (ev.touches.length !== 1) { touchStartX = null; return; }
      touchStartX = ev.touches[0].clientX; touchStartY = ev.touches[0].clientY;
    }, { passive: true });
    body.addEventListener('touchend', (ev) => {
      if (touchStartX == null) return;
      const t = ev.changedTouches[0];
      const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
      touchStartX = touchStartY = null;
      if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dy) > SWIPE_MAX_DY) return;
      const idx = BOARD_TAB_ORDER.indexOf(boardTab); if (idx < 0) return;
      const nextIdx = dx < 0 ? idx + 1 : idx - 1;   // swipe a sinistra = tab successivo
      if (nextIdx < 0 || nextIdx >= BOARD_TAB_ORDER.length) return;
      boardTab = BOARD_TAB_ORDER[nextIdx];
      renderBoard();
    }, { passive: true });
  }

  // renderBoard() ricostruisce tutto l'HTML della board: chi usa la tastiera perdeva il focus
  // ad ogni azione (il bottone appena premuto veniva distrutto e ricreato, il focus tornava in
  // cima alla pagina). Prima del render si prende nota di "quale" elemento aveva il focus, con
  // un selettore che lo ritrovi anche nel nuovo HTML (id, oppure classe + data-attributi);
  // dopo, glielo si restituisce. Se quell'elemento non esiste più (es. offerta appena accettata)
  // il focus va alla tab attiva, non nel vuoto.
  function boardFocusKey(body) {
    const a = document.activeElement;
    if (!a || a === document.body || !body.contains(a)) return null;
    if (a.id) return '#' + a.id;
    const data = Object.keys(a.dataset || {}).map((k) => '[data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + '="' + String(a.dataset[k]).replace(/"/g, '\\"') + '"]').join('');
    if (!data) return '.ow-tab.on';
    const cls = (a.className && typeof a.className === 'string') ? a.className.split(/\s+/).filter((c) => c && c !== 'on' && c !== 'sel' && c !== 'final')[0] : '';
    return (cls ? '.' + cls : a.tagName.toLowerCase()) + data;
  }

  // "Primi passi": solo nella prima estate di una carriera nuova, tre cose da fare prima del
  // calcio d'inizio con la spunta che si accende da sola man mano. Chi apre il gioco per la
  // prima volta si trova davanti quattro tab piene di numeri e nessuna indicazione su cosa sia
  // obbligatorio (niente), cosa convenga (sponsor, rinnovi) e come si va avanti. Si può
  // nascondere; la scelta è per dispositivo (localStorage), non dentro il salvataggio.
  const GUIDE_KEY = 'dsa_ui_guide_off';
  let guideDismissedMem = false;
  function guideDismissed() { if (guideDismissedMem) return true; try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return false; } }
  function setGuideDismissed() { guideDismissedMem = true; try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {} }
  function guideHTML(fyCount, broke) {
    if (S.season !== 1 || (S.history && S.history.length) || guideDismissed()) return '';
    const sponsorsDone = !!(S.sponsor && S.stadiumSponsor && S.techSponsor);
    const squadDone = S.squad.length >= MIN_SQUAD && !fyCount;
    const steps = [
      { tab: 'sponsor', done: sponsorsDone, t: 'Firma i tre sponsor', s: 'Soldi garantiti ogni stagione: maglia, stadio, tecnico.' },
      { tab: 'rosa', done: squadDone, t: 'Sistema la rosa', s: S.squad.length < MIN_SQUAD ? 'Ti servono almeno ' + MIN_SQUAD + ' giocatori: gli svincolati sono gratis.' : fyCount ? fyCount + ' contratt' + (fyCount === 1 ? 'o' : 'i') + ' in scadenza: rinnova chi vuoi tenere, poi rinforzati con gli spin.' : 'Rinnovi a posto. Se avanza cassa, uno spin può rinforzarti.' },
      { tab: 'finanze', done: !broke, t: 'Tieni in cassa il costo d\'avvio', s: broke ? 'Ora non basta: vendi qualcuno o scegli uno staff più economico.' : 'Gli stipendi si pagano al calcio d\'inizio: sei coperto.' },
    ];
    return `<div class="ow-guide" role="region" aria-label="Primi passi">
      <div class="ow-guide-head"><span class="ow-guide-title">Primi passi</span><button type="button" class="ow-guide-x" id="guideDismissBtn">Nascondi</button></div>
      ${steps.map((st, i) => `<button type="button" class="ow-guide-step${st.done ? ' done' : ''}" data-guide-tab="${st.tab}"><span class="ck" aria-hidden="true">${st.done ? '✓' : i + 1}</span><span>${st.t}${st.done ? '<span class="sr-only"> (fatto)</span>' : ''}<small>${st.s}</small></span></button>`).join('')}
      <div class="ow-sub" style="margin:8px 0 6px">Poi premi <b>Inizia Stagione</b>, sempre qui in basso.</div>
    </div>`;
  }

  // Esito dell'ultimo "Inizia Stagione" non riuscito (vedi la nota accanto al bottone).
  let startBlockInfo = null;
  const startBlockSig = () => (S._saveId || '') + '|' + S.season + '|' + S.squad.length + '|' + S.budget;

  function renderBoard() {
    syncNotifDot();
    const d = divOf(), body = $('boardBody');
    const focusKey = boardFocusKey(body);
    // Carriera legata a una stanza multiplayer ancora aperta: niente "Inizia Stagione" qui
    // (la stagione la avvia l'host per tutti insieme), solo "Sono pronto" che torna alla
    // lobby con la carriera sottomessa.
    const mpSess = readMpSession();
    const mpBoard = !!(mpSess && mpSess.saveId === S._saveId);
    normSquad();
    previewFormation = S.formation;   // il modulo mostrato riflette quello persistito (ora pesa in partita)
    maybeScoutProspect();
    advanceYouthSquad();
    // Bonus investitore: prima era un bottone (più una casella "prendilo sempre"), ma prenderlo
    // era sempre la scelta giusta, quindi un click senza decisione. Ora arriva da solo all'apertura
    // della Dirigenza, una volta a stagione, e resta scritto nel bilancio.
    if (!S.investorUsed) {
      const amount = Math.round(divOf().investor * diffOf().sponsorMult / 1e4) * 1e4;
      S.investorUsed = true; S.investorAmount = amount; S.budget += amount;
      toast('Un investitore stacca l\'assegno di inizio stagione: +' + fmtMoney(amount), 'money');
      saveGame();
    }
    const fyCount = S.squad.filter(finalYear).length;
    if (!S.sponsorOpts && !S.sponsor) S.sponsorOpts = sponsorOffers();
    if (!S.stadiumSponsorOpts && !S.stadiumSponsor) S.stadiumSponsorOpts = stadiumSponsorOffers();
    if (!S.techSponsorOpts && !S.techSponsor) S.techSponsorOpts = techSponsorOffers();
    // Il fondo d'investimento non si ripropone da solo ogni stagione come gli sponsor: è un
    // impegno pluriennale serio (rischio di perdere il club), quindi le proposte restano finché
    // non le accetti o le rifiuti esplicitamente, non vengono rigenerate a ogni render.
    if (!S.investorDeal && !S.investorOpts) S.investorOpts = investorDealOffers();
    if (!S.mgrOpts) {
      S.mgrOpts = [genManager(0), genManager(3), genManager(6)];
      // Una tua ex leggenda può presentarsi fra i candidati (mai al posto di tutti e tre,
      // giusto un'opzione in più): un piccolo momento di continuità con la storia del club.
      const legend = legendManagerCandidate();
      if (legend) S.mgrOpts[rnd(S.mgrOpts.length)] = legend;
    }
    if (!S.sportingDirector && !S.dsOpts) S.dsOpts = [genSportingDirector(0), genSportingDirector(4)];
    if (!S.fitnessCoach && !S.fitOpts) S.fitOpts = [genFitnessCoach(0), genFitnessCoach(4)];
    const bill = kickoffBill();
    const free = freeToSpend();
    const broke = S.budget < bill;
    // Prima del dirupo binario "due stagioni in rosso = amministrazione controllata forzata",
    // un vero meccanismo intermedio: appena chiusa la prima stagione in rosso, il mercato in
    // entrata si blocca (niente spin, niente svincolati, niente ampliamento stadio) finché il
    // budget non torna positivo — costringe a vendere/tagliare i costi subito, con qualcosa da
    // FARE oltre a sperare che il taglio automatico del debito a inizio stagione basti da solo.
    const debtEmbargo = !!S.debtSeasons;
    const worth = computeWorth(); S.peakWorth = Math.max(S.peakWorth, worth);
    const next = STADIUM[S.stadiumTier + 1];
    const squadFiltered = S.squad.slice()
      .filter((p) => squadRoleFilter === 'ALL' || p.pos === squadRoleFilter)
      .sort((a, b) => squadSortDesc ? b.ovr - a.ovr : a.ovr - b.ovr);
    const squadRows = squadFiltered.length ? squadFiltered.map((p) => {
      const fy = !p.loan && finalYear(p);
      return `
      <div class="ow-player${fy ? ' final' : ''}" role="button" tabindex="0" aria-label="Scheda di ${escapeHtml(p.n)}, ${POS_LABEL[p.pos]}, ${p.ovr}${fy ? ', contratto in scadenza' : ''}" data-pid="${p.pid}">
        <div class="ow-player-row1">
          <span class="ovr" style="${ovrBadge(p.ovr)}" title="${p.pid === S.captainPid ? 'Capitano: +1 OVR' : ''}">${p.pid === S.captainPid ? p.ovr + 1 : p.ovr}</span>
          <span class="postag postag-${p.pos}">${p.pos}</span>
          <span class="nm">${flagOf(p)}${p.n}${p.pid === S.captainPid ? ' <span title="Capitano">©</span>' : ''}${hasChemistryPartner(p) ? ' <span title="Coppia d\'attacco affiatata: si cercano a memoria">🔗</span>' : ''}${isClubFlag(p) ? ' <span title="Bandiera del club: in rosa da almeno ' + FLAG_TENURE_SEASONS + ' stagioni">🏳️</span>' : ''}<small>età ${p.age}${potentialBadge(p)}</small></span>
          ${p.outWeeks > 0 ? `<span class="stat-tag inj" title="Infortunato">🚑 ${p.outWeeks}</span>` : p.suspMatches > 0 ? '<span class="stat-tag susp" title="Squalificato">🟥</span>' : p.loanedOut ? '<span class="stat-tag" title="In prestito altrove fino a fine stagione">📤 prestito fuori</span>' : (p.fatigue || 0) >= 65 ? `<span class="stat-tag" title="Affaticato: più a rischio infortunio, reso leggermente meno nelle prossime partite">🥵 ${Math.round(p.fatigue)}</span>` : ''}
        </div>
        <div class="ow-player-row2">
          <span class="ow-player-row2-left">
            ${p.loan ? '<span class="yy loan" title="Torna al suo club se non riscattato">prestito</span>' : `<span class="yy${fy ? ' fy' : ''}" title="Anni di contratto rimasti">${p.yrs}a</span>`}
            <span class="wg">${fmtYr(p.wage)}</span>
          </span>
          ${fy ? `<button class="ow-renew" data-renew="${p.pid}" title="Offri un nuovo contratto">Rinnova</button>` : ''}
          ${p.loan ? `<button class="ow-renew" data-buyback="${p.pid}" title="Riscatta a titolo definitivo, altrimenti torna al suo club a inizio stagione">💰 Riscatta · ${fmtMoney(loanBuybackFee(p))}</button>` : `<button class="ow-x" data-rel="${p.pid}" title="Vendi">💷</button>`}
        </div>
      </div>`;
    }).join('') : '<div class="ow-sub" style="margin:10px 0">Nessun giocatore in questo ruolo.</div>';
    const estRevenue = estSeasonRevenue();
    const scout = scoutTier(), scoutLv = S.scoutLevel || 0, nextScoutCost = scoutLv < SCOUT_TIERS.length - 1 ? scoutUpgradeCost(scoutLv + 1) : null;

    const financeHTML = `
      <div class="ow-sec ow-status">
        <div class="ow-bigmoney"><span>Valore del club</span><b>${fmtMoney(worth)}</b></div>
        ${S.history && S.history.length ? sparkRow('Andamento budget (fine stagione + oggi)', S.history.map((hh) => hh.budget != null ? hh.budget : 0).concat([S.budget]), 'var(--good)') : ''}
        <div class="ow-fin-row" style="padding:2px 0 6px"><span>Indice tifoseria (cresce con successo e prezzi equi)</span><b>${S.fanbase.toFixed(2)}</b></div>
        ${S.euro ? '<div class="ow-euroflag">' + EURO_COMPS[S.euroComp].flag + ' ' + EURO_COMPS[S.euroComp].name + ' questa stagione · grandi notti, grandi soldi</div>' : ''}
        ${meterHTML('Umore tifosi', S.sent, S.sent < 30)}
        ${meterHTML('Gradimento proprietario', S.ownerRating, S.ownerRating < 35)}
        ${S.ownerRating < 35 ? '<div class="ow-warn">⚠️ I tifosi ti vogliono fuori. Sotto 25 a fine stagione sarai costretto a dimetterti.</div>' : ''}
        ${S.debtSeasons ? '<div class="ow-warn">⚠️ Hai chiuso la scorsa stagione in rosso: mercato in entrata bloccato finché il budget non torna positivo (vedi Rosa). Un\'altra stagione in debito significa amministrazione controllata.</div>' : ''}
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">📋 Bilancio di stagione</div>
        <div class="ow-fin-row"><span>Stipendi giocatori (${S.squad.length} giocatori, pagati all'avvio)</span><b>${fmtMoney(wageBill())}</b></div>
        <div class="ow-fin-row"><span>Stipendio allenatore (pagato all'avvio)</span><b>${fmtMoney(S.manager.salary)}</b></div>
        ${S.sportingDirector ? `<div class="ow-fin-row"><span>Stipendio direttore sportivo (pagato all'avvio)</span><b>${fmtMoney(S.sportingDirector.salary)}</b></div>` : ''}
        ${S.fitnessCoach ? `<div class="ow-fin-row"><span>Stipendio preparatore atletico (pagato all'avvio)</span><b>${fmtMoney(S.fitnessCoach.salary)}</b></div>` : ''}
        <div class="ow-fin-row total ${broke ? 'bad' : ''}"><span>Costo d'avvio</span><b>${fmtMoney(bill)}</b></div>
        <div class="ow-fin-row"><span>Ricavi di stagione (stima)</span><b>${fmtMoney(estRevenue)}</b></div>
        ${broke ? '<div class="ow-warn">⚠️ Ti mancano <b>' + fmtMoney(bill - S.budget) + '</b> per coprire il costo d\'avvio. Ricorda: gli spin spendono cassa anche se rifiuti il giocatore. Vendi giocatori (💷) o assumi un allenatore più economico prima dell\'inizio.</div>' : ''}
        ${S.investorAmount ? `<div class="ow-fin-row"><span>💼 Bonus investitore (già in cassa)</span><b class="good">+${fmtMoney(S.investorAmount)}</b></div>` : ''}
        <label class="ow-sub" style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer" title="Salta i mini-resoconti partita, il mercato di gennaio e il riassunto a inizio stagione; chi è a fine carriera resta sempre 'un'altra stagione'. Utile per arrivare in fondo alle 20 stagioni il più in fretta possibile."><input type="checkbox" id="turboModeChk" ${S.turboMode ? 'checked' : ''} /> ⏩ Modalità veloce: salta interruzioni non essenziali (gennaio incluso)</label>
      </div>
      ${S.offers && S.offers.length ? `
      <div class="ow-sec">
        <div class="ow-sec-title">📨 Offerte di mercato</div>
        <div class="ow-sub">Club rivali vogliono i tuoi giocatori migliori. Incassa per una cifra, rilanciane una più alta (una sola volta, rischi che si ritirino), o rifiuta per tenere unita la rosa.</div>
        ${S.offers.map((o) => {
          const p = S.squad.find((x) => x.pid === o.pid); if (!p) return '';
          return `<div class="ow-bid">
            <div class="who"><span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span><span class="postag postag-${p.pos}">${p.pos}</span><span class="nm">${flagOf(p)}${p.n}<small>età ${p.age} · ${o.club} si fa avanti</small></span></div>
            <div class="act"><span class="fee">${fmtMoney(o.fee)}</span>
              <button class="dyn-mini ow-accept" data-acc="${o.pid}">Accetta</button>
              ${!o.countered && !S.hardcore ? `<button class="dyn-mini" data-counter="${o.pid}" title="Chiedi di più: potrebbero accettare o ritirarsi">🤝 Rilancia</button>` : ''}
              <button class="dyn-mini ow-reject" data-rej="${o.pid}">Rifiuta</button></div>
          </div>`;
        }).join('')}
      </div>` : ''}
      <div class="ow-sec">
        <div class="ow-sec-title">🏦 Fondo d'investimento</div>
        ${S.investorDeal ? (() => {
          const dl = S.investorDeal;
          const left = dl.deadlineSeason - S.season;
          return `
          <div class="ow-invdeal">
            <div class="ow-invdeal-head"><b>${dl.name}</b><span class="ow-invdeal-badge ${left <= 1 ? 'urgent' : ''}">${left <= 0 ? 'ultima chiamata' : left + ' stagion' + (left === 1 ? 'e' : 'i') + ' rimast' + (left === 1 ? 'a' : 'e')}</span></div>
            <div class="ow-invdeal-row"><span>🎯 Obiettivo</span><b>${DIVS[dl.targetDiv].name} entro la stagione ${dl.deadlineSeason}</b></div>
            <div class="ow-invdeal-row"><span>📈 Ogni stagione</span><b class="good">+${fmtMoney(dl.yearly)}</b></div>
            <div class="ow-invdeal-row"><span>🏆 Bonus se centri l'obiettivo</span><b class="good">+${fmtMoney(dl.completionBonus)}</b></div>
            <div class="ow-invdeal-row bad-row"><span>⚠️ Se non arrivi in tempo</span><b class="bad">cessione forzata del club</b></div>
          </div>`;
        })() : (S.investorOpts && S.investorOpts.length) ? `
          <div class="ow-sub">Un patto pluriennale serio: cassa subito e un top-up ogni stagione, in cambio di un obiettivo di categoria entro una scadenza — se non lo raggiungi in tempo, cessione forzata del club. Il bonus finale, da solo, può valere più del club oggi.</div>
          ${S.investorOpts.map((o, i) => {
            const seasons = o.deadlineSeason - S.season;
            return `<div class="ow-invoffer">
            <div class="ow-invdeal-head"><b>${o.name}</b><span class="money">+${fmtMoney(o.injection)} subito</span></div>
            <div class="ow-invdeal-row"><span>🎯 Obiettivo</span><b>${DIVS[o.targetDiv].name} entro ${seasons} stagion${seasons === 1 ? 'e' : 'i'} (stagione ${o.deadlineSeason})</b></div>
            <div class="ow-invdeal-row"><span>📈 Ogni stagione</span><b class="good">+${fmtMoney(o.yearly)}</b></div>
            <div class="ow-invdeal-row"><span>🏆 Bonus se centri l'obiettivo</span><b class="good">+${fmtMoney(o.completionBonus)}</b></div>
            <div class="ow-invdeal-row bad-row"><span>⚠️ Se non arrivi in tempo</span><b class="bad">cessione forzata del club</b></div>
            <button class="dyn-btn dyn-btn-primary" data-inv="${i}" style="margin-top:8px;width:100%">Accetta il patto</button>
          </div>`;
          }).join('')}
          <button class="dyn-mini" id="investorDismissBtn" style="margin-top:6px">Non interessa, per ora</button>
        ` : `<div class="ow-sub">Nessun fondo interessato al momento.</div>`}
      </div>`;

    const xiPids = getPreviewXI();
    const rosaHTML = `
      <div class="ow-sec">
        <div class="ow-sec-title">🧠 Allenatore</div>
        <div class="ow-mgr"><span class="ovr">${S.manager.rating}</span><span class="nm">${flagOf(S.manager)}${S.manager.n}<small>${fmtMoney(S.manager.salary)}/anno · ${specOf(S.manager.spec).icon} ${specOf(S.manager.spec).label}</small></span><span class="tag">In carica</span></div>
        <div class="ow-sub" title="${specOf(S.manager.spec).desc}">${specOf(S.manager.spec).icon} ${specOf(S.manager.spec).desc}</div>
        <div class="ow-sub">Candidati (l'esonero paga il 30% di buonuscita):</div>
        ${S.mgrOpts.map((m, i) => `<div class="ow-mgr cand"><span class="ovr">${m.rating}</span><span class="nm">${flagOf(m)}${m.n}${m.exPlayer ? ' <small title="Una tua ex leggenda">🎓</small>' : ''}<small>${fmtMoney(m.salary)}/anno · ${specOf(m.spec).icon} ${specOf(m.spec).label}${m.exPlayer ? ' · Ex giocatore del club' : ''}</small></span><button class="dyn-mini ow-hire" data-hire="${i}">Assumi</button></div>`).join('')}
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">📋 Direttore sportivo</div>
        ${S.sportingDirector ? `
          <div class="ow-mgr"><span class="ovr">${S.sportingDirector.rating}</span><span class="nm">${flagOf(S.sportingDirector)}${S.sportingDirector.n}<small>${fmtMoney(S.sportingDirector.salary)}/anno · ${dsSpecOf(S.sportingDirector.spec).icon} ${dsSpecOf(S.sportingDirector.spec).label}</small></span><span class="tag">In carica</span></div>
          <div class="ow-sub" title="${dsSpecOf(S.sportingDirector.spec).desc}">${dsSpecOf(S.sportingDirector.spec).icon} ${dsSpecOf(S.sportingDirector.spec).desc}</div>
          <button class="dyn-mini ow-danger" id="dsFireBtn">Licenzia (buonuscita 30%)</button>
        ` : `
          <div class="ow-sub">Ruolo opzionale: si occupa del mercato in uscita, non tocca la squadra in campo.</div>
          ${(S.dsOpts || []).map((m, i) => `<div class="ow-mgr cand"><span class="ovr">${m.rating}</span><span class="nm">${flagOf(m)}${m.n}<small>${fmtMoney(m.salary)}/anno · ${dsSpecOf(m.spec).icon} ${dsSpecOf(m.spec).label}</small></span><button class="dyn-mini ow-hire-ds" data-hireds="${i}">Assumi</button></div>`).join('')}
        `}
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">🩺 Preparatore atletico</div>
        ${S.fitnessCoach ? `
          <div class="ow-mgr"><span class="ovr">${S.fitnessCoach.rating}</span><span class="nm">${flagOf(S.fitnessCoach)}${S.fitnessCoach.n}<small>${fmtMoney(S.fitnessCoach.salary)}/anno · ${fitnessSpecOf(S.fitnessCoach.spec).icon} ${fitnessSpecOf(S.fitnessCoach.spec).label}</small></span><span class="tag">In carica</span></div>
          <div class="ow-sub" title="${fitnessSpecOf(S.fitnessCoach.spec).desc}">${fitnessSpecOf(S.fitnessCoach.spec).icon} ${fitnessSpecOf(S.fitnessCoach.spec).desc}</div>
          <button class="dyn-mini ow-danger" id="fitFireBtn">Licenzia (buonuscita 30%)</button>
        ` : `
          <div class="ow-sub">Ruolo opzionale: lavora sul fisico della squadra (affaticamento, infortuni, tenuta della forma), non tocca il mercato.</div>
          ${(S.fitOpts || []).map((m, i) => `<div class="ow-mgr cand"><span class="ovr">${m.rating}</span><span class="nm">${flagOf(m)}${m.n}<small>${fmtMoney(m.salary)}/anno · ${fitnessSpecOf(m.spec).icon} ${fitnessSpecOf(m.spec).label}</small></span><button class="dyn-mini ow-hire-fit" data-hirefit="${i}">Assumi</button></div>`).join('')}
        `}
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">🔭 Settore giovanile</div>
        <div class="ow-scout-tier" title="${'+' + scout.bonus + ' OVR medio sugli spin · ' + Math.round(scout.prospectChance * 100) + '% di chance a stagione di un prospetto del vivaio · ' + Math.round(scout.gem * 100) + '% di chance di un vero colpo'}${nextScoutCost != null ? ' · il livello successivo (' + SCOUT_TIERS[scoutLv + 1].name + '): +' + SCOUT_TIERS[scoutLv + 1].bonus + ' OVR, ' + Math.round(SCOUT_TIERS[scoutLv + 1].prospectChance * 100) + '% prospetto, ' + Math.round(SCOUT_TIERS[scoutLv + 1].gem * 100) + '% colpo' : ''}">
          <div><div class="lv">${scout.name}</div><div class="ds">Spin migliori in media (+${scout.bonus} OVR) e più affidabili${scoutLv ? ', più chance di un prospetto gratis a inizio stagione' : ''}</div></div>
          ${nextScoutCost != null ? `<button class="dyn-mini" id="scoutUpgBtn" ${S.budget < nextScoutCost ? 'disabled' : ''}>⬆️ ${fmtMoney(nextScoutCost)}</button>` : '<span class="tag">Max</span>'}
        </div>
        ${S.scoutProspects && S.scoutProspects.length ? `
        <div class="ow-sub" style="margin:8px 0 4px">Il vivaio presenta ${S.scoutProspects.length} promesse: scegline una da aggregare alla rosa, le altre restano altrove.</div>
        ${S.scoutProspects.map((p, i) => `
        <div class="ow-jan-card">
          <div class="ow-jan-head">
            <span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span>
            <span class="postag postag-${p.pos}">${p.pos}</span>
            <span class="nm">${flagOf(p)}${p.n}<small>${POS_LABEL[p.pos]} · età ${p.age} · promessa del vivaio${potentialBadge(p)}</small></span>
          </div>
          <button class="dyn-btn dyn-btn-primary" data-scoutsign="${i}">Aggrega alla rosa · Gratis</button>
        </div>`).join('')}` : ''}
        ${S.youthSquad && S.youthSquad.length ? `
        <div class="ow-sub" style="margin:10px 0 4px">🌱 Vivaio (${S.youthSquad.length}/${YOUTH_SQUAD_CAP}): crescono stagione dopo stagione finché non li promuovi o li rilasci — oltre i ${YOUTH_RELEASE_AGE} anni si svincolano da soli se restano lì.</div>
        ${S.youthSquad.map((p) => `
        <div class="ow-jan-card">
          <div class="ow-jan-head">
            <span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span>
            <span class="postag postag-${p.pos}">${p.pos}</span>
            <span class="nm">${flagOf(p)}${p.n}<small>${POS_LABEL[p.pos]} · età ${p.age}${potentialBadge(p)}</small></span>
          </div>
          <div class="ow-jan-actions">
            <button class="dyn-mini" data-youthpromote="${p.pid}">⬆️ Promuovi in prima squadra</button>
            <button class="dyn-mini ow-danger" data-youthrelease="${p.pid}">Rilascia</button>
          </div>
        </div>`).join('')}` : ''}
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">🎰 Rosa + spin</div>
        <div class="ow-sub">Rosa ${S.squad.length < MIN_SQUAD ? '<b style="color:var(--bad)">' + S.squad.length + ' su ' + MIN_SQUAD + ' giocatori necessari</b>' : S.squad.length + ' giocatori'} · rating <b>${squadStr()}</b> · media di categoria ${d.avg}${fyCount ? ' · <b style="color:var(--gold)">' + fyCount + ' in scadenza</b> (Rinnova o li perdi a zero)' : ''} · tocca 💷 per vendere</div>
        ${debtEmbargo ? '<div class="ow-warn">🔒 Mercato in entrata bloccato: club in rosso, niente spin/svincolati/ampliamenti finché il budget non torna positivo. Vendi o taglia i costi.</div>' : ''}
        <div class="ow-spins${S.stdRoleUsed ? ' one' : ''}" style="margin-bottom:8px">
          <button class="dyn-btn" id="spinStdBtn" ${(debtEmbargo || S.budget < spinCostNow(false)) ? 'disabled' : ''} title="${debtEmbargo ? 'Bloccato: club in rosso' : ''}">🎰 Spin giocatore · ${fmtMoney(spinCostNow(false))}</button>
          ${!S.stdRoleUsed ? `<button class="dyn-btn ow-role-btn" id="spinStdRoleBtn" ${(debtEmbargo || S.budget < spinCostNow(false)) ? 'disabled' : ''} title="${debtEmbargo ? 'Bloccato: club in rosso' : 'Scegli il ruolo per questo spin, disponibile una sola volta a stagione'}">🎯 Scegli ruolo</button>` : ''}
        </div>
        <div class="ow-spins${S.premiumRoleUsed ? ' one' : ''}">
          <button class="dyn-btn" id="spinPremBtn" ${(debtEmbargo || S.budget < spinCostNow(true)) ? 'disabled' : ''} title="${debtEmbargo ? 'Bloccato: club in rosso' : ''}">💎 Spin di lusso · ${fmtMoney(spinCostNow(true))}</button>
          ${!S.premiumRoleUsed ? `<button class="dyn-btn ow-role-btn" id="spinPremRoleBtn" ${(debtEmbargo || S.budget < spinCostNow(true)) ? 'disabled' : ''} title="${debtEmbargo ? 'Bloccato: club in rosso' : 'Scegli il ruolo per questo spin di lusso, disponibile una sola volta a stagione'}">🎯 Scegli ruolo</button>` : ''}
        </div>
        <div class="ow-sub" style="margin:0 0 8px">${S.spinsBought ? 'Affaticamento scout: i prezzi sono saliti perché hai già fatto ' + S.spinsBought + ' spin quest\'estate.' : 'Ogni spin di questa estate costa più del precedente.'} ${S.stdRoleUsed ? 'Hai già scelto il ruolo per lo spin normale.' : 'Il prossimo spin normale ti lascia scegliere il ruolo.'} ${S.premiumRoleUsed ? 'Hai già scelto il ruolo per lo spin di lusso.' : 'Lo spin di lusso è casuale, a meno che tu non scelga tu il ruolo (una sola volta a stagione).'}</div>
        <button class="dyn-btn ow-investor" id="freeAgentBtn" ${debtEmbargo ? 'disabled title="Bloccato: club in rosso"' : ''}>🖊️ Ingaggia uno svincolato · Gratis</button>
        <div class="ow-squad-filters">
          ${['ALL', 'POR', 'DIF', 'CEN', 'ATT'].map((k) => `<button class="ow-filter-pill ${squadRoleFilter === k ? 'on' : ''}" data-role="${k}">${k === 'ALL' ? 'Tutti' : k}</button>`).join('')}
          <button class="ow-filter-pill ow-filter-sort" id="squadSortBtn" title="Ordina per overall">OVR ${squadSortDesc ? '▼' : '▲'}</button>
        </div>
        ${squadRoleFilter !== 'ALL' ? `<div class="ow-sub" style="margin:-4px 0 6px">${squadFiltered.length} di ${S.squad.length} giocatori</div>` : ''}
        <div class="ow-squadlist">${squadRows}</div>
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">⚽ Formazione e modulo (${FORMATIONS[previewFormation].label})</div>
        <div class="ow-sub">Il modulo non è solo estetico: uno più offensivo (3-4-3) segna di più ma incassa di più, uno più difensivo (5-3-2) il contrario.</div>
        ${formationPickerHTML()}
        ${pitchHTML(previewFormation, xiPids)}
        ${benchHTML(xiPids)}
        <button class="dyn-mini" id="resetXIBtn" style="margin-top:10px;width:100%">🔄 Formazione automatica</button>
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">🧭 Istruzioni tattiche</div>
        <div class="ow-sub">Si sommano al modulo, non lo sostituiscono: più aggressive = più gol fatti e subiti (e squadra più stanca), più prudenti il contrario.</div>
        ${tacticPickerHTML('Pressing', 'press', TACTIC_PRESS)}
        ${tacticPickerHTML('Ampiezza', 'width', TACTIC_WIDTH)}
        ${tacticPickerHTML('Ritmo', 'tempo', TACTIC_TEMPO)}
      </div>`;

    const curEst = estAttendanceFor(S.ticket);
    const homeAdvPct = Math.round((homeAdvantage() - 1) * 100);
    const stadioHTML = `
      <div class="ow-sec">
        <div class="ow-sec-title">🏟️ ${escapeHtml(stadiumDisplayName())}</div>
        ${S.stadiumSponsor ? `<div class="ow-sub">Nome da naming right dello sponsor di stadio, finché l'accordo dura. Il nome storico resta salvato sotto.</div>` : ''}
        <div class="ow-stadium-visual">${stadiumSVG(S.stadiumTier, curEst.pct)}</div>
        <div class="ow-fin-row"><span>Capienza</span><b>${capOf().toLocaleString('it-IT')} posti</b></div>
        <div class="ow-fin-row"><span>Affluenza attesa a questo prezzo</span><b>${curEst.att.toLocaleString('it-IT')} (${Math.round(curEst.pct * 100)}%)</b></div>
        <div class="ow-fin-row" title="Capienza e umore dei tifosi: un fattore campo più alto aiuta soprattutto nelle partite in casa più equilibrate."><span>🏠 Fattore campo</span><b class="${homeAdvPct >= 0 ? 'good' : 'bad'}">${homeAdvPct >= 0 ? '+' : ''}${homeAdvPct}%</b></div>
        ${S.stadiumRecordAtt ? `<div class="ow-fin-row"><span>🏆 Record d'affluenza</span><b>${S.stadiumRecordAtt.toLocaleString('it-IT')} <small style="color:var(--muted);font-weight:700">(stagione ${S.stadiumRecordSeason})</small></b></div>` : ''}
        ${next ? (() => { const cost = stadiumUpgradeCost(next); const discounted = cost < next.cost; return `<button class="dyn-btn ow-upg" id="upgradeBtn" ${(debtEmbargo || S.budget < cost) ? 'disabled' : ''} title="${debtEmbargo ? 'Bloccato: club in rosso' : discounted ? 'Sconto dello sponsor di stadio già applicato' : ''}">Amplia a ${next.cap.toLocaleString('it-IT')} posti · ${discounted ? `<s style="opacity:.6">${fmtMoney(next.cost)}</s> ` : ''}${fmtMoney(cost)}</button>${debtEmbargo ? '<div class="ow-sub" style="margin-top:6px">🔒 Bloccato finché il club è in rosso.</div>' : S.budget < cost ? '<div class="ow-sub" style="margin-top:6px">Ti mancano ' + fmtMoney(cost - S.budget) + ' per aprire il cantiere.</div>' : ''}`; })() : '<div class="ow-sub">Lo stadio è alla sua dimensione massima.</div>'}
        <div class="ow-sub" style="margin-top:10px">Prezzi biglietti (i tifosi reagiscono, la domanda cambia):</div>
        <div class="ow-tickets">${TICKETS.map((t, i) => { const est = estAttendanceFor(i); return `<button class="ow-ticket ${S.ticket === i ? 'on' : ''}" data-tk="${i}"><b>${t.label}</b><small>€${Math.round(d.ticket * t.mult)} medio · ${t.hint}</small><small class="ow-ticket-est">~${est.att.toLocaleString('it-IT')} spett. (${Math.round(est.pct * 100)}%) · ${fmtMoney(est.revenuePerGame)}/gara</small></button>`; }).join('')}</div>
      </div>
      <div class="ow-sec">
        <div class="ow-sec-title">✏️ Nome storico dello stadio</div>
        <div class="ow-sub">Usato quando non hai un accordo di naming right attivo con uno sponsor di stadio.</div>
        <div class="ow-fin-row"><input id="stadiumNameInput" class="ow-text-input" type="text" maxlength="40" aria-label="Nome storico dello stadio" autocomplete="off" value="${escapeHtml(S.stadiumName || ('Stadio ' + S.club))}" placeholder="Stadio ${escapeHtml(S.club)}" /></div>
        <button class="dyn-mini" id="stadiumNameSaveBtn" style="margin-top:6px">Salva nome</button>
      </div>`;

    // Un unico stampo per i tre slot (maglia/stadio/tecnico): mostra l'accordo attivo con le
    // sue clausole, oppure la lista di offerte da scegliere. `key` è il campo su S, `dataAttr`
    // il data-attribute usato dai bottoni per non far collidere i tre gruppi di offerte.
    const sponsorSlotHTML = (title, key, optsKey, dataAttr, sentNote) => {
      const active = S[key];
      if (active) {
        const clauseBits = [];
        if (active.clauseWin) clauseBits.push('🏆 +' + fmtMoney(active.clauseWin) + ' se vinci il campionato o sei promosso');
        if (active.clauseEuro) clauseBits.push('⭐ +' + fmtMoney(active.clauseEuro) + ' se ti qualifichi in Europa');
        const perk = active.perk;
        return `<div class="ow-sec">
          <div class="ow-sec-title">${title}</div>
          <div class="ow-fin-row"><span>${active.name} (${active.left} ann${active.left === 1 ? 'o' : 'i'} rimasti${sentNote && active.sent ? ', ' + (active.sent > 0 ? 'i tifosi approvano' : 'i tifosi disapprovano') : ''})</span><b>${fmtMoney(active.perYear)}/anno</b></div>
          ${clauseBits.length ? `<div class="ow-sub">${clauseBits.join(' · ')}</div>` : ''}
          ${perk ? `<div class="ow-sub" title="${escapeHtml(perk.desc)}">${perk.icon} <b>${perk.label}</b>${perk.key !== 'neutral' ? ': ' + escapeHtml(perk.desc) : ''}</div>` : ''}
        </div>`;
      }
      const opts = S[optsKey] || [];
      return `<div class="ow-sec">
        <div class="ow-sec-title">${title}</div>
        <div class="ow-sub">Nessun accordo attivo. Scegline uno (importo fisso + clausole + un effetto di gioco diverso per ciascuno):</div>
        ${opts.map((o, i) => `
        <button class="ow-offer" data-${dataAttr}="${i}"><span class="info"><b>${o.name}</b><small>${[o.years + ' anni', sentNote && o.sent ? (o.sent > 0 ? 'i tifosi approvano' : 'i tifosi disapprovano') : '', '🏆 +' + fmtMoney(o.clauseWin) + ' vittoria', '⭐ +' + fmtMoney(o.clauseEuro) + ' Europa', o.perk ? o.perk.icon + ' ' + o.perk.label : ''].filter(Boolean).map((x) => '<span class="ow-nw">' + x + '</span>').join(' · ')}</small>${o.perk && o.perk.key !== 'neutral' ? `<small class="ow-sponsor-perk-desc">${escapeHtml(o.perk.desc)}</small>` : ''}</span><span class="money">${fmtMoney(o.perYear)}/anno</span></button>`).join('')}
      </div>`;
    };
    const sponsorHTML = sponsorSlotHTML('👕 Sponsor di maglia', 'sponsor', 'sponsorOpts', 'sp', true)
      + sponsorSlotHTML('🏟️ Sponsor di stadio', 'stadiumSponsor', 'stadiumSponsorOpts', 'stsp', false)
      + sponsorSlotHTML('👟 Sponsor tecnico', 'techSponsor', 'techSponsorOpts', 'tesp', false);

    // Perché "Inizia Stagione" non è partita, scritto accanto al bottone e non solo in un toast
    // che sparisce. Il motivo lo dice startSeason() (sim.js: 'squad' | 'budget'), qui non si
    // rifà nessun controllo: la nota resta finché rosa e cassa sono quelle del tentativo fallito
    // e sparisce da sola appena una delle due cambia (o si cambia carriera).
    if (startBlockInfo && startBlockInfo.sig !== startBlockSig()) startBlockInfo = null;
    const startBlock = !startBlockInfo ? ''
      : startBlockInfo.why === 'squad' ? 'Ti servono almeno ' + MIN_SQUAD + ' giocatori (ne hai ' + S.squad.length + '): ingaggia svincolati gratis in Rosa.'
      : 'Ti mancano ' + fmtMoney(bill - S.budget) + ' per il costo d\'avvio: vendi qualcuno in Rosa o scegli uno staff più economico.';
    const TABS = [
      { key: 'finanze', label: '💰 Finanze', html: financeHTML, warn: broke || S.ownerRating < 35 || !!S.debtSeasons || !!(S.offers && S.offers.length) },
      { key: 'rosa', label: '👥 Rosa', html: rosaHTML, warn: S.squad.length < MIN_SQUAD || fyCount > 0 || !!(S.scoutProspects && S.scoutProspects.length) },
      { key: 'stadio', label: '🏟️ Stadio', html: stadioHTML, warn: false },
      { key: 'sponsor', label: '🤝 Sponsor', html: sponsorHTML, warn: !S.sponsor || !S.stadiumSponsor || !S.techSponsor },
    ];
    if (!TABS.some((t) => t.key === boardTab)) boardTab = 'finanze';
    const activeTab = TABS.find((t) => t.key === boardTab);

    body.innerHTML = `
      <div class="ow-stickybar">
        <div class="cell main"><span>Budget</span><b class="${S.budget < 0 ? 'bad' : ''}">${fmtMoney(S.budget)}</b></div>
        <div class="cell"><span>Costo d'avvio</span><b>${fmtMoney(bill)}</b></div>
        <div class="cell free"><span>Libero da spendere</span><b class="${free < 0 ? 'bad' : ''}">${fmtMoney(free)}</b></div>
      </div>
      ${crestMarkup(S.crestShape, S.crestColors, 'ow-board-crest')}
      <div class="dyn-top"><div class="dyn-top-title">Dirigenza${S.hardcore ? ' <span class="ow-invpill" style="display:inline-block;vertical-align:middle;font-size:11px;padding:2px 8px" title="Cessioni immediate, spin senza rimborso, niente rilancio sulle offerte, niente scorciatoie sulla cassa, +25% rischio infortuni, imprevisti negativi più pesanti, buonuscita staff al 50%">🔥 Hardcore</span>' : ''}</div><div class="dyn-top-sub">${S.owner} · ${S.club} · Stagione ${S.season} di ${S.maxSeasons || MAX_SEASONS}</div></div>
      ${ladderHTML()}
      ${S.investorDeal ? (() => { const left = S.investorDeal.deadlineSeason - S.season; return `<div class="ow-invpill${left <= 1 ? ' urgent' : ''}" title="Fondo d'investimento: ${S.investorDeal.name}">🏦 Obiettivo fondo: ${DIVS[S.investorDeal.targetDiv].name} entro la stagione ${S.investorDeal.deadlineSeason} (${left <= 0 ? 'ultima chiamata' : 'mancano ' + left + ' stagion' + (left === 1 ? 'e' : 'i')})</div>`; })() : ''}
      ${guideHTML(fyCount, broke)}
      <div class="ow-tabs" role="tablist" aria-label="Sezioni della dirigenza">${TABS.map((t) => `<button type="button" role="tab" aria-selected="${boardTab === t.key}" aria-controls="boardTabBody" tabindex="${boardTab === t.key ? 0 : -1}" class="ow-tab ${boardTab === t.key ? 'on' : ''}" data-tab="${t.key}">${t.label}${t.warn ? '<span class="dot" aria-hidden="true"></span><span class="sr-only"> (da controllare)</span>' : ''}</button>`).join('')}</div>
      <div id="boardTabBody" role="tabpanel" class="ow-tab-enter">${activeTab.html}</div>
      <div class="ow-cta-sticky">
      ${startBlock ? `<div class="ow-cta-note" id="startBlockNote">${startBlock}</div>` : ''}
      ${mpBoard ? `
        <button class="dyn-btn dyn-btn-primary" id="mpBoardReadyBtn">✅ Sono pronto</button>
        <button class="dyn-btn" id="mpBoardBackBtn">🔙 Torna alla stanza</button>
      ` : `<button type="button" class="dyn-btn dyn-btn-primary" id="startSeasonBtn"${startBlock ? ' aria-describedby="startBlockNote"' : ''}>Inizia Stagione ${S.season} · ${d.name}</button>`}
      </div>
      <div class="ow-exit-row">
        <button class="dyn-btn" id="sellBtn">💷 Vendi il club · ${fmtMoney(worth)}</button>
        <button class="dyn-btn" id="resignBtn">Dimettiti</button>
      </div>`;
    enhanceBoardNumbers(body, free);
    bindBoardDelegation();
    show('owBoardScreen'); saveGame();
    if (focusKey) {
      let target = null;
      try { target = body.querySelector(focusKey); } catch (e) {}
      if (!target || target.disabled) target = body.querySelector('.ow-tab.on');
      if (target) target.focus({ preventScroll: true });
    }
  }

  // Controllo preventivo per le grandi spese: se l'acquisto lascerebbe la cassa sotto
  // il costo d'avvio (stipendi + allenatore), dillo IN NUMERI prima di prendere i soldi.
  function spendGuard(cost, label, extra, go) {
    const after = S.budget - cost, bill = kickoffBill();
    if (after >= bill) { go(); return; }
    // Hardcore: niente scorciatoia "Fallo comunque" — se non copri il costo d'avvio, prima
    // vendi/sistemi la cassa, poi spendi. Nessuna via di mezzo con conseguenze rimandate.
    if (S.hardcore) {
      overlay(`
        <h2>🔥 Cassa insufficiente</h2>
        <p>${label} costa <b>${fmtMoney(cost)}</b>, lasciando <b>${fmtMoney(after)}</b> in banca. Il costo d'avvio (stipendi + allenatore) è <b>${fmtMoney(bill)}</b>: in modalità Hardcore non puoi procedere finché non copri la differenza. Vendi giocatori (💷) o sistema la cassa prima.</p>
        <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovHold">Ho capito</button></div>`);
      $('ovHold').onclick = closeOverlay;
      return;
    }
    overlay(`
      <h2>⚠️ Attenzione alla cassa</h2>
      <p>${label} costa <b>${fmtMoney(cost)}</b>, lasciando <b>${fmtMoney(after)}</b> in banca. Il costo d'avvio (stipendi + allenatore) è <b>${fmtMoney(bill)}</b>, quindi saresti <b>${fmtMoney(bill - after)}</b> corto per iniziare la stagione.${extra ? ' ' + extra : ''} Puoi vendere giocatori (💷) per recuperare.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovGoAnyway">Fallo comunque</button>
        <button class="dyn-btn" id="ovHold">Aspetta</button>
      </div>`);
    $('ovGoAnyway').onclick = () => { closeOverlay(); go(); };
    $('ovHold').onclick = closeOverlay;
  }

  // chooseRole=true è il percorso esplicito dal pulsante "🎯 Scegli ruolo" (presente sia per
  // lo spin normale che per quello di lusso): il bottone principale di ciascuno resta sempre
  // casuale, senza aprire nulla.
  // Quanto si è pagato per avere un giocatore, annotato alla firma (spin, svincolato, vivaio,
  // mercato di gennaio, riscatto, scambio): serve a quickSaleFee qui sotto. I salvataggi
  // vecchi non hanno il campo e restano come prima (paidFee undefined = nessun tetto).
  function markSigned(p, paid) {
    p.joinedSeason = S.season;
    p.paidFee = Math.max(0, Math.round(paid || 0));
    return p;
  }

  // Cessione rapida (💷 in rosa): il 30% del valore di mercato. Ma chi è arrivato in QUESTA
  // stagione e non ha ancora giocato un minuto non può rendere più del 40% di quanto è costato:
  // senza questo tetto bastava ingaggiare svincolati gratis (o pescare uno spin fortunato) e
  // rivenderli subito per fare cassa all'infinito. Il 40% è lo stesso rimborso di uno spin
  // rifiutato: firmare e rivendere non conviene mai più che passare.
  function quickSaleCapped(p) {
    return p.paidFee != null && p.joinedSeason === S.season && !((p.seasonApps || 0) + (p.careerApps || 0));
  }
  function quickSaleFee(p) {
    const fee = Math.round(playerValue(p) * 0.3);
    return quickSaleCapped(p) ? Math.min(fee, Math.round(p.paidFee * 0.4)) : fee;
  }

  function doSpin(premium, chooseRole) {
    const cost = spinCostNow(premium);
    if (S.budget < cost) { toast('Budget non sufficiente.'); return; }
    const roleUsed = premium ? S.premiumRoleUsed : S.stdRoleUsed;
    if (chooseRole && !roleUsed) { pickSpinRole(premium, cost); return; }
    spendGuard(cost, premium ? 'Uno spin di lusso' : 'Uno spin', 'Se rifiuti il giocatore ti torna solo il 40% dello spin.', () => runSpin(premium, cost));
  }

  // Gli spin (normale e di lusso) sono illimitati (costano sempre di più, uno per tipo) e per
  // difetto pescano un ruolo a caso: solo premendo apposta "🎯 Scegli ruolo" (una sola volta
  // a stagione PER TIPO di spin) si sceglie chi cercare.
  function pickSpinRole(premium, cost) {
    const counts = { POR: 0, DIF: 0, CEN: 0, ATT: 0 };
    S.squad.forEach((p) => { if (counts[p.pos] != null) counts[p.pos]++; });
    const ROLE_ICON = { POR: '🧤', DIF: '🛡️', CEN: '👟', ATT: '⚽' };
    const label = premium ? 'spin di lusso' : 'spin';
    overlay(`
      <h2>🎯 Scegli il ruolo</h2>
      <p>Lo scout andrà a cercare un giocatore per lo ${label} in questo ruolo. Puoi farlo una sola volta a stagione: i prossimi ${label} torneranno casuali.</p>
      <div class="ow-role-grid">
        ${['POR', 'DIF', 'CEN', 'ATT'].map((r) => `<button class="ow-role-pick postag-${r}" data-role="${r}" ${counts[r] >= POS_CAP[r] ? 'disabled' : ''}>
          <span class="ow-role-ico">${ROLE_ICON[r]}</span><span class="ow-role-lbl">${POS_LABEL[r]}</span>${counts[r] >= POS_CAP[r] ? '<small>al completo</small>' : ''}
        </button>`).join('')}
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn" id="ovRoleCancel">Annulla</button></div>`);
    $('owOverlayModal').querySelectorAll('.ow-role-pick').forEach((btn) => {
      btn.addEventListener('click', () => { const role = btn.dataset.role; closeOverlay(); spendGuard(cost, premium ? 'Uno spin di lusso' : 'Uno spin', 'Se rifiuti il giocatore ti torna solo il 40% dello spin.', () => runSpin(premium, cost, role)); });
    });
    $('ovRoleCancel').onclick = closeOverlay;
  }

  // Anche uno svincolato (gratis) lascia scegliere il ruolo, invece di uscire a caso.
  function pickFreeAgentRole() {
    const counts = { POR: 0, DIF: 0, CEN: 0, ATT: 0 };
    S.squad.forEach((p) => { if (counts[p.pos] != null) counts[p.pos]++; });
    const ROLE_ICON = { POR: '🧤', DIF: '🛡️', CEN: '👟', ATT: '⚽' };
    overlay(`
      <h2>🖊️ Ingaggia uno svincolato</h2>
      <p>Scegli il ruolo dello svincolato da tesserare gratis.</p>
      <div class="ow-role-grid">
        ${['POR', 'DIF', 'CEN', 'ATT'].map((r) => `<button class="ow-role-pick postag-${r}" data-role="${r}" ${counts[r] >= POS_CAP[r] ? 'disabled' : ''}>
          <span class="ow-role-ico">${ROLE_ICON[r]}</span><span class="ow-role-lbl">${POS_LABEL[r]}</span>${counts[r] >= POS_CAP[r] ? '<small>al completo</small>' : ''}
        </button>`).join('')}
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn" id="ovFaRoleCancel">Annulla</button></div>`);
    $('owOverlayModal').querySelectorAll('.ow-role-pick').forEach((btn) => {
      btn.addEventListener('click', () => { const role = btn.dataset.role; closeOverlay(); confirmFreeAgent(role); });
    });
    $('ovFaRoleCancel').onclick = closeOverlay;
  }

  // Prima c'era una seconda finestra con il solo tasto "OK" (e chiudendola senza premerlo lo
  // svincolato andava perso): ora il tesseramento è immediato e il giocatore compare in rosa.
  function confirmFreeAgent(role) {
    const p = freeAgent(role);
    S.squad.push(markSigned(p, 0));
    toast('🖊️ Tesserato lo svincolato ' + p.n + ' (' + POS_LABEL[p.pos] + ', ' + p.ovr + ' · ' + fmtYr(p.wage) + ')', 'success');
    renderBoard(); saveGame();
  }

  function runSpin(premium, cost, role) {
    const d = divOf();
    S.budget -= cost;
    S.spinsBought = (S.spinsBought || 0) + 1;
    if (role) { if (premium) S.premiumRoleUsed = true; else S.stdRoleUsed = true; }
    const p = spinPlayer(premium, role);
    S._spin = p; S._spinCost = cost; saveGame();   // _spinCost: il rimborso esatto se la pagina si chiude ora (resolvePendingSpin, sim.js)
    overlay(`
      <h2>${premium ? '💎 Lo scout torna' : '🎰 Lo scout torna'}</h2>
      <div class="ow-spin-card${p.real ? ' is-real' : ''}">
        ${p.icon ? '<div class="real-badge icon-badge">🏆 LEGGENDA</div>' : p.real && p.fromClub ? `<div class="real-badge">🌟 GIOCATORE REALE · da ${p.fromClub}</div>` : ''}
        <div class="big" style="color:${ovrTier(p.ovr).c}">${p.ovr}</div>
        <div class="nm">${flagOf(p)}${p.n} <span class="postag postag-${p.pos}" style="vertical-align:middle">${p.pos}</span></div>
        <div class="meta">${POS_LABEL[p.pos]} · età ${p.age} · chiede <b>${fmtYr(p.wage)}</b>${potentialBadge(p)}</div>
        <div class="meta">Hai <b>${fmtMoney(freeToSpend())}</b> liberi dopo gli stipendi</div>
        ${p.ovr >= d.avg + 7 ? '<div class="gem">⭐ Un colpo da titoli di giornale per questo livello</div>' : ''}
      </div>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovSign">Ingaggialo</button>
        <button class="dyn-btn" id="ovPass">Passa${S.hardcore ? ' (nessun rimborso)' : ''}</button>
      </div>`);
    // Un piccolo momento in più quando lo spin pesca qualcosa di speciale: un giocatore
    // vero (o un'icona) suona diverso e si accende di coriandoli, non solo un bordo colorato.
    if (DynSound) { if (p.real) DynSound.spinRevealReal(); else DynSound.spinReveal(); }
    if (p.real || p.icon) { const card = $('owOverlayModal').querySelector('.ow-spin-card'); if (card) fireConfetti(card); }
    $('ovSign').onclick = () => {
      S.squad.push(markSigned(p, cost));
      if (p.ovr >= d.avg + 7) S.sent = clamp(S.sent + 2, 0, 100);
      S._spin = null; S._spinCost = null; closeOverlay(); toast(p.n + ' firma.', 'success'); renderBoard(); saveGame();
    };
    $('ovPass').onclick = () => {
      // Hardcore: ogni spin è una scommessa vera, senza paracadute — passare non restituisce
      // nulla, coerente con "ogni scelta è definitiva".
      const refund = S.hardcore ? 0 : Math.round(cost * 0.4);
      S.budget += refund;
      // Se questo spin era a ruolo scelto e il giocatore trovato non convince, passare
      // "restituisce" anche la scelta del ruolo: non ha senso bruciare l'unico uso stagionale
      // per un giocatore che poi non si prende — resta comunque un nuovo spin a pagamento.
      if (role) { if (premium) S.premiumRoleUsed = false; else S.stdRoleUsed = false; }
      S._spin = null; S._spinCost = null; closeOverlay();
      toast(S.hardcore ? 'Passi. Nessun rimborso in modalità Hardcore.' : 'Passi. Lo scout ti restituisce ' + fmtMoney(refund) + ' (40% dello spin).' + (role ? ' Puoi ancora scegliere il ruolo.' : ''), 'money');
      renderBoard(); saveGame();
    };
  }

  // L'overlay di rinnovo vero e proprio: richiamato sia dal bottone "Rinnova" in lista (solo
  // per chi è in scadenza) sia dalla scheda giocatore (per chiunque, in ogni momento).
  function openRenewOverlay(p) {
    const nw = renewWage(p), ny = renewYears(p);
    overlay(`
      <h2>📝 Nuovo contratto</h2>
      <div class="ow-spin-card">
        <div class="big" style="color:${ovrTier(p.ovr).c}">${p.ovr}</div>
        <div class="nm">${flagOf(p)}${p.n}</div>
        <div class="meta">età ${p.age} · guadagna <b>${fmtYr(p.wage)}</b>, ${p.yrs} ann${p.yrs === 1 ? 'o' : 'i'} rimasti</div>
        <div class="meta">Chiede <b class="${nw < p.wage ? 'good' : ''}">${fmtYr(nw)}</b> per <b>${ny} anni</b>${nw < p.wage ? ' <span class="tag" title="Il suo valore di mercato è sceso: accetta di guadagnare meno per restare">📉 taglio volontario</span>' : ''}</div>
        <div class="meta">Hai <b>${fmtMoney(freeToSpend())}</b> liberi dopo gli stipendi</div>
      </div>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovRenew">Accetta l'accordo</button>
        <button class="dyn-btn" id="ovNoRenew">Non ora</button>
      </div>`);
    $('ovRenew').onclick = () => { p.wage = nw; p.yrs = ny; closeOverlay(); toast(p.n + ' firma un nuovo contratto di ' + ny + ' anni.', 'success'); renderBoard(); saveGame(); };
    $('ovNoRenew').onclick = closeOverlay;
  }

  // Scheda dettagliata di un calciatore in rosa: anagrafica, contratto e statistiche della
  // stagione in corso, richiamabile toccando la sua riga nell'elenco Rosa.
  function openPlayerDetail(pid) {
    const p = S.squad.find((x) => x.pid === pid); if (!p) return;
    if (p.joinedSeason == null) p.joinedSeason = S.season;
    const isGK = p.pos === 'POR';
    const seasons = Math.max(1, (S.season - p.joinedSeason) + 1);
    const totalApps = (p.careerApps || 0) + (p.seasonApps || 0);
    const totalGoals = (p.careerGoals || 0) + (p.seasonGoals || 0);
    const totalAssists = (p.careerAssists || 0) + (p.seasonAssists || 0);
    const totalCleanSheets = (p.careerCleanSheets || 0) + (p.seasonCleanSheets || 0);
    const tenureRow = `<div class="ow-fin-row"><span>In squadra da</span><b>${seasons} stagion${seasons === 1 ? 'e' : 'i'}</b></div>`;
    const statRows = isGK
      ? `${tenureRow}
         <div class="ow-fin-row"><span>Presenze totali</span><b>🎽 ${totalApps}</b></div>
         <div class="ow-fin-row"><span>Clean sheet totali</span><b>🧤 ${totalCleanSheets}</b></div>`
      : `${tenureRow}
         <div class="ow-fin-row"><span>Presenze totali</span><b>🎽 ${totalApps}</b></div>
         <div class="ow-fin-row"><span>Gol totali</span><b>⚽ ${totalGoals}</b></div>
         <div class="ow-fin-row"><span>Assist totali</span><b>👟 ${totalAssists}</b></div>`;
    overlay(`
      <h2>Scheda giocatore</h2>
      <div class="ow-spin-card${p.real ? ' is-real' : ''}">
        ${p.icon ? '<div class="real-badge icon-badge">🏆 LEGGENDA</div>' : p.real && p.fromClub ? `<div class="real-badge">🌟 GIOCATORE REALE · da ${p.fromClub}</div>` : ''}
        <div class="big" style="color:${ovrTier(p.ovr).c}">${p.pid === S.captainPid ? p.ovr + 1 : p.ovr}${p.pid === S.captainPid ? ' <small title="Il capitano gioca con +1 OVR">© +1</small>' : ''}</div>
        <div class="nm">${flagOf(p)}${p.n}${p.pid === S.captainPid ? ' ©' : ''} <span class="postag postag-${p.pos}" style="vertical-align:middle">${p.pos}</span></div>
        <div class="meta">${POS_LABEL[p.pos]} · ${p.nat ? p.nat.name : '-'} · età ${p.age}${potentialBadge(p)}</div>
      </div>
      <div class="ow-sec" style="margin-top:4px">
        ${statRows}
        <div class="ow-fin-row"><span>Stipendio</span><b>${fmtYr(p.wage)}</b></div>
        <div class="ow-fin-row"><span>Contratto</span><b>${p.loan ? 'In prestito' : p.yrs + ' ann' + (p.yrs === 1 ? 'o' : 'i') + ' rimast' + (p.yrs === 1 ? 'o' : 'i')}</b></div>
        <div class="ow-fin-row"><span>Valore di mercato stimato</span><b>${fmtMoney(playerValue(p))}</b></div>
        ${p.outWeeks > 0 ? `<div class="ow-fin-row bad"><span>Infortunato</span><b>🚑 fuori ${p.outWeeks} partit${p.outWeeks === 1 ? 'a' : 'e'}</b></div>` : ''}
        ${p.suspMatches > 0 ? `<div class="ow-fin-row bad"><span>Squalificato</span><b>🟥 salta la prossima</b></div>` : ''}
        <div class="ow-fin-row"><span>Fascia di capitano</span><b>${p.pid === S.captainPid ? '© È lui/lei il capitano (+1 OVR)' : p.age > CAPTAIN_MIN_AGE ? 'Non è il capitano' : `Non è il capitano (serve più di ${CAPTAIN_MIN_AGE} anni)`}</b></div>
      </div>
      <div class="dyn-modal-actions">
        ${!p.loan ? `<button class="dyn-btn dyn-btn-primary" id="ovDetailRenew">📝 Rinnova</button>` : ''}
        ${p.pid !== S.captainPid && !p.loan && p.age > CAPTAIN_MIN_AGE ? `<button class="dyn-btn" id="ovDetailCaptain">© Nomina capitano</button>` : ''}
        <button class="dyn-btn" id="ovDetailClose">Chiudi</button>
      </div>`);
    $('ovDetailClose').onclick = closeOverlay;
    const renewBtn = $('ovDetailRenew');
    if (renewBtn) renewBtn.onclick = () => openRenewOverlay(p);
    const captainBtn = $('ovDetailCaptain');
    if (captainBtn) captainBtn.onclick = () => {
      if (p.age <= CAPTAIN_MIN_AGE) { toast('Il capitano deve avere più di ' + CAPTAIN_MIN_AGE + ' anni.', 'error'); return; }
      S.captainPid = p.pid; toast(p.n + ' è il nuovo capitano.', 'success'); closeOverlay(); renderBoard(); saveGame();
    };
  }

  function confirmSell() {
    const worth = computeWorth();
    overlay(`
      <h2>💷 Vendi il club</h2>
      <p>Una cordata offre <b>${fmtMoney(worth)}</b> per ${S.club}. Vendere chiude qui la tua carriera.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovSell">Vendi per ${fmtMoney(worth)}</button>
        <button class="dyn-btn" id="ovNo">Tieni il club</button>
      </div>`);
    $('ovSell').onclick = () => { closeOverlay(); endDynasty('sold', worth); };
    $('ovNo').onclick = closeOverlay;
  }

  function confirmResign() {
    overlay(`
      <h2>Dimettiti da presidente</h2>
      <p>Vuoi lasciare ${S.club} senza nient'altro che i ricordi? Il club non viene venduto, te ne vai e basta.</p>
      <div class="dyn-modal-actions">
        <button class="dyn-btn dyn-btn-primary" id="ovGo">Dimettiti</button>
        <button class="dyn-btn" id="ovNo">Resta</button>
      </div>`);
    $('ovGo').onclick = () => { closeOverlay(); endDynasty('resigned', 0); };
    $('ovNo').onclick = closeOverlay;
  }

  // Popup di un evento narrativo: un modale più "pesante" del solito (icona grande, bordo
  // colorato, animazione d'ingresso), che richiede un click esplicito per proseguire — una X
  // in alto a destra per i semplici avvisi, oppure le scelte stesse quando ce ne sono (niente
  // scorciatoia per saltarle: la scelta stessa è il "premi un bottone per continuare").
  // Riassunto testuale ed esplicito del bonus/malus numerico di un evento o di una sua
  // scelta (sent/budgetPct/ownerRating/fanbaseDelta/prestige): niente più effetti "a
  // sorpresa" nascosti nel codice, l'utente vede il numero prima o subito dopo aver scelto.
  // Gli effetti con `apply(S, ctx)` custom (sponsor, infortunio) non hanno numeri fissi da
  // mostrare qui: usano un `hint` scritto a mano in NARRATIVE_EVENTS.
  function narrativeEffectSummary(eff, inline) {
    if (!eff) return '';
    if (eff.hint) return inline ? `<span class="ow-eff-hint">${eff.hint}</span>` : eff.hint;
    const parts = [];
    if (eff.sent) parts.push((eff.sent > 0 ? '+' : '') + eff.sent + ' umore');
    if (eff.budgetPct) parts.push((eff.budgetPct > 0 ? '+' : '') + (Math.round(eff.budgetPct * 1000) / 10) + '% budget');
    if (eff.ownerRating) parts.push((eff.ownerRating > 0 ? '+' : '') + eff.ownerRating + ' reputazione');
    if (eff.fanbaseDelta) parts.push((eff.fanbaseDelta > 0 ? '+' : '') + eff.fanbaseDelta + ' bacino tifosi');
    if (eff.prestige) parts.push((eff.prestige > 0 ? '+' : '') + fmtMoney(eff.prestige) + ' prestigio');
    if (!parts.length) return '';
    return inline ? `<span class="ow-eff-hint">${parts.join(' · ')}</span>` : parts.join(' · ');
  }

  // Testo del mini-resoconto: 1-2 frasi costruite sui gol REALI di questa partita (min/nome,
  // già in row.goalsFor/goalsAgainst), non un testo generico — l'ultimo gol segnato decide il
  // tono del racconto.
  function matchRecapText(row) {
    const all = (row.goalsFor || []).map((g) => ({ ...g, us: true })).concat((row.goalsAgainst || []).map((g) => ({ ...g, us: false }))).sort((a, b) => a.min - b.min);
    if (!all.length) return 'Una partita bloccata, senza reti, decisa sui dettagli fino al triplice fischio.';
    const last = all[all.length - 1];
    if (last.us) return row.gf > row.ga ? `Il punto pesante lo mette ${last.name} al ${last.min}': gestione del vantaggio fino alla fine.` : `${last.name} riacciuffa il pareggio al ${last.min}': un finale di quelli che restano sullo stomaco.`;
    return row.ga > row.gf ? `${row.opp} passa in vantaggio con ${last.name} al ${last.min}' e non si volta più.` : `${row.opp} riagguanta il pareggio con ${last.name} al ${last.min}': un punto che pesa da entrambe le parti.`;
  }

  function openMatchRecapOverlay(row, ctx) {
    const finish = () => { closeOverlay(); ctx._pause = false; checkSeasonMilestones(ctx); };
    overlay(`
      <div class="ow-event-modal">
        <div class="ow-event-icon">${row.res === 'W' ? '🟢' : row.res === 'L' ? '🔴' : '⚪'}</div>
        <h2>${row.gf}-${row.ga} vs ${row.opp}</h2>
        <p>${matchRecapText(row)}</p>
        <p class="ow-sub">Partita in bilico fino alla fine: come gestisci il gruppo in vista della prossima gara?</p>
        <div class="dyn-modal-actions">
          <button type="button" class="dyn-btn" data-recap="rest">😌 Consolida (turno di scarico)</button>
          <button type="button" class="dyn-btn dyn-btn-primary" data-recap="normal">➡️ Si continua così</button>
          <button type="button" class="dyn-btn" data-recap="push">🔥 Cavalca l'entusiasmo</button>
        </div>
      </div>`);
    $('owOverlayModal').querySelectorAll('[data-recap]').forEach((btn) => btn.addEventListener('click', () => {
      const choice = btn.dataset.recap;
      if (choice === 'rest') { ctx._congestion = Math.max(0, (ctx._congestion || 0) - 1); toast('Turno di scarico: squadra un po\' più fresca per la prossima.', 'success'); }
      else if (choice === 'push') { ctx.sent = clamp(ctx.sent + 3, 0, 100); ctx._congestion = (ctx._congestion || 0) + 1; toast('L\'entusiasmo cresce in curva, ma le gambe si fanno sentire.', 'money'); }
      saveGame();
      finish();
    }));
  }

  // Batosta pesante (maybeRivalryPrompt, sim.js): offre di trasformarla in una rivalità
  // sentita, con lo stesso effetto di un derby storico da qui in poi (ctx.rivalries, letto in
  // simMatch) — ma è una scelta, non un automatismo della classifica.
  function openRivalryPromptOverlay(row, ctx) {
    const finish = () => { closeOverlay(); ctx._pause = false; checkSeasonMilestones(ctx); };
    overlay(`
      <div class="ow-event-modal">
        <div class="ow-event-icon">🔴</div>
        <h2>${row.gf}-${row.ga} vs ${row.opp}</h2>
        <p>Una batosta di quelle che restano sullo stomaco. Vuoi che ${row.opp} diventi una rivalità sentita? Da qui in poi ogni sfida conterà come un derby: un filo di umore in più in palio e uno storico dei confronti che cresce stagione dopo stagione.</p>
        <div class="dyn-modal-actions">
          <button type="button" class="dyn-btn dyn-btn-primary" data-rivalry="yes">🔥 Sì, è una rivalità</button>
          <button type="button" class="dyn-btn" data-rivalry="no">Lascia perdere</button>
        </div>
      </div>`);
    $('owOverlayModal').querySelectorAll('[data-rivalry]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.rivalry === 'yes') {
        if (!ctx.rivalries) ctx.rivalries = [];
        if (ctx.rivalries.indexOf(row.opp) === -1) ctx.rivalries.push(row.opp);
        toast('🔥 ' + row.opp + ' è ora una rivalità sentita.', 'success');
      }
      saveGame();
      finish();
    }));
  }

  function openNarrativeEventOverlay(ev) {
    const hasChoices = Array.isArray(ev.choices) && ev.choices.length > 0;
    // `build` fissa UNA volta sola (all'apertura) i dettagli concreti dell'evento — es. quale
    // giocatore è coinvolto — così il testo mostrato e l'effetto della scelta parlano dello
    // stesso identico giocatore, invece di ripescarne uno a caso in due momenti diversi.
    const ctx = typeof ev.build === 'function' ? ev.build(S) : null;
    const text = typeof ev.text === 'function' ? ev.text(S, ctx) : ev.text;
    if (!hasChoices) applyNarrativeEffect(ev, ctx);   // un solo esito: si applica subito, il popup lo racconta
    const finish = () => { closeOverlay(); S._pause = false; checkSeasonMilestones(); };
    const outcomeSummary = !hasChoices ? narrativeEffectSummary(ev) : '';
    overlay(`
      <div class="ow-event-modal">
        ${!hasChoices ? '<button type="button" class="ow-modal-x" id="ovEventX" aria-label="Chiudi">✕</button>' : ''}
        <div class="ow-event-icon">${ev.icon || '📰'}</div>
        <h2>${ev.title || 'Imprevisto'}</h2>
        <p>${text}</p>
        ${outcomeSummary ? `<p class="ow-sub">${outcomeSummary}</p>` : ''}
        <div class="dyn-modal-actions">
          ${hasChoices
            ? ev.choices.map((c, i) => `<button type="button" class="dyn-btn ${i === 0 ? 'dyn-btn-primary' : ''}" data-choice="${i}">${c.label}${narrativeEffectSummary(c, true)}</button>`).join('')
            : '<button type="button" class="dyn-btn dyn-btn-primary" id="ovEventClose">Continua</button>'}
        </div>
      </div>`);
    if (hasChoices) {
      $('owOverlayModal').querySelectorAll('[data-choice]').forEach((btn) => btn.addEventListener('click', () => {
        applyNarrativeEffect(ev.choices[+btn.dataset.choice], ctx);
        finish();
      }));
    } else {
      $('ovEventClose').onclick = finish;
      $('ovEventX').onclick = finish;
    }
  }

  // Chi ha raggiunto l'età del ritiro (36+) non se ne va più in automatico all'inizio della
  // stagione: il presidente decide, uno alla volta — un'altra stagione (il suo rendimento
  // resta comunque in calo, come già mostrato dalla freccia nelle statistiche di fine anno)
  // o una partita d'addio davanti ai tifosi. Chiamata da advance() (sim.js) al posto di
  // renderBoard() quando c'è almeno un giocatore in questa situazione; richiama se stessa
  // sul resto dell'elenco finché non ne resta nessuno, poi apre la Dirigenza normale.
  // Tutti i giocatori a fine carriera in UNA finestra (prima: una finestra per ciascuno, in fila).
  // Per ognuno si sceglie "addio" o "un'altra stagione"; di partenza è proposto l'addio.
  function openRetirementOverlay(players) {
    const list = (players || []).filter((p) => S.squad.some((x) => x.pid === p.pid));
    if (!list.length) { closeOverlay(); if (S._seasonRecap) openSeasonRecapOverlay(S._seasonRecap); else renderBoard(); return; }
    const keep = {};
    const row = (p) => `<div class="ow-retire-row" data-pid="${p.pid}">
        <span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span>
        <span class="nm">${flagOf(p)}${escapeHtml(p.n)}<small>${POS_LABEL[p.pos]} · ${p.age} anni · ${(p.careerApps || 0) + (p.seasonApps || 0)} presenze</small></span>
        <span class="ow-retire-pick" role="group" aria-label="Scelta per ${escapeHtml(p.n)}">
          <button type="button" class="ow-formation-pick on" data-ret="bye" aria-pressed="true">Addio</button>
          <button type="button" class="ow-formation-pick" data-ret="stay" aria-pressed="false">Resta</button>
        </span>
      </div>`;
    overlay(`
      <h2>🎽 Fine carriera in vista</h2>
      <p>${list.length === 1 ? 'Un giocatore ha' : list.length + ' giocatori hanno'} raggiunto l'età del ritiro. Chi resta gioca un'altra stagione (ma continua a calare); chi saluta ha la sua partita d'addio davanti ai tifosi.</p>
      <div class="ow-retire-list">${list.map(row).join('')}</div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovRetireGo">Conferma</button></div>`);
    const modal = $('owOverlayModal');
    modal.querySelectorAll('[data-ret]').forEach((btn) => btn.addEventListener('click', () => {
      const r = btn.closest('.ow-retire-row'); const pid = r.dataset.pid;
      keep[pid] = btn.dataset.ret === 'stay';
      r.querySelectorAll('[data-ret]').forEach((x) => { const on = x === btn; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (DynSound) DynSound.tap();
    }));
    $('ovRetireGo').onclick = () => {
      const byes = [];
      list.forEach((p) => {
        if (keep[p.pid]) { p._retiring = false; return; }
        const i = S.squad.findIndex((x) => String(x.pid) === String(p.pid));
        if (i >= 0) { pushAlumnus(p, S, true); S.squad.splice(i, 1); byes.push(p.n); }
      });
      if (byes.length) {
        S.sent = clamp(S.sent + 4, 0, 100);
        toast('Partita d\'addio per ' + byes.join(', ') + ': i tifosi salutano con affetto.', 'success');
        if (DynSound) DynSound.trophy();
      } else toast('Restano tutti un\'altra stagione.', 'success');
      saveGame();
      openRetirementOverlay([]);
    };
  }

  // Riassunto "cosa è cambiato" a inizio stagione (S._seasonRecap, costruito in advance()):
  // rinnovi scaduti, giocatori chiaramente calati, rivali che si sono rinforzati — tutto in
  // un'unica schermata prima della Dirigenza, invece di scoprirlo navigando le tab una per una.
  function openSeasonRecapOverlay(recap) {
    const rows = [];
    if (recap.freedContracts && recap.freedContracts.length) rows.push(`<div class="ow-sec"><div class="ow-sec-title">📄 Rinnovi scaduti</div><div class="ow-sub">${recap.freedContracts.map(escapeHtml).join(', ')} ${recap.freedContracts.length === 1 ? 'è partito' : 'sono partiti'} a parametro zero.</div></div>`);
    if (recap.decliningPlayers && recap.decliningPlayers.length) rows.push(`<div class="ow-sec"><div class="ow-sec-title">📉 In calo</div>${recap.decliningPlayers.map((p) => `<div class="ow-fin-row"><span>${escapeHtml(p.n)}</span><b class="bad">${p.delta}</b></div>`).join('')}</div>`);
    if (recap.risingRivals && recap.risingRivals.length) rows.push(`<div class="ow-sec"><div class="ow-sec-title">📈 Rivali rinforzati</div>${recap.risingRivals.map((r) => `<div class="ow-fin-row"><span>${escapeHtml(r.n)}</span><b class="good">+${r.delta}</b></div>`).join('')}</div>`);
    if (recap.marketRumors && recap.marketRumors.length) rows.push(`<div class="ow-sec"><div class="ow-sec-title">📰 Voci di mercato</div>${recap.marketRumors.map((r) => `<div class="ow-fin-row"><span>${escapeHtml(r.player)} (${r.ovr})</span><b style="font-weight:700;font-size:11px;color:var(--muted)">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</b></div>`).join('')}</div>`);
    S._seasonRecap = null;
    overlay(`<h2>🗞️ Cosa è cambiato</h2>
      <div class="ow-sub" style="text-align:center">Prima di scendere in Dirigenza, un riepilogo dell'estate appena passata.</div>
      ${rows.join('')}
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovRecapClose">Vai in Dirigenza</button></div>`);
    $('ovRecapClose').onclick = () => { closeOverlay(); renderBoard(); };
  }

  function openWinter() {
    S._pause = true;
    if (!S._janCands) S._janCands = [spinPlayer(false, undefined, 3), spinPlayer(false, undefined, 3), spinPlayer(false, undefined, 3)];
    if (S._janSwitchUsed == null) S._janSwitchUsed = false;
    if (!S._janMgrCands) {
      S._janMgrCands = [genManager(2), genManager(5)];
      const legend = legendManagerCandidate();
      if (legend) S._janMgrCands[rnd(S._janMgrCands.length)] = legend;
    }
    renderWinterOverlay();
  }

  function renderWinterOverlay() {
    const d = divOf();
    const cands = S._janCands || [];
    const mgrCands = S._janMgrCands || [];
    const cardHTML = (p, i) => {
      const loanCost = janLoanCost(p), buyTotal = loanCost + janTransferFee(p);
      return `
      <div class="ow-jan-card${p.real ? ' is-real' : ''}">
        ${p.real && p.fromClub ? `<div class="real-badge real-badge-inline">🌟 GIOCATORE REALE · da ${p.fromClub}</div>` : ''}
        <div class="ow-jan-head">
          <span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span>
          <span class="postag postag-${p.pos}">${p.pos}</span>
          <span class="nm">${flagOf(p)}${p.n}<small>${POS_LABEL[p.pos]} · età ${p.age} · chiede ${fmtYr(p.wage)}${potentialBadge(p)}</small></span>
          ${!S._janSwitchUsed ? `<button class="ow-jan-switch" data-jan-switch="${i}" title="Cambia questo giocatore (una sola volta)">🔄</button>` : ''}
        </div>
        <div class="ow-jan-actions">
          <button class="dyn-mini" data-jan-loan="${i}" ${S.budget < loanCost ? 'disabled' : ''}>🏷️ Prestito · ${fmtMoney(loanCost)}</button>
          <button class="dyn-mini" data-jan-buy="${i}" ${S.budget < buyTotal ? 'disabled' : ''}>💰 Acquisto · ${fmtMoney(buyTotal)}</button>
        </div>
      </div>`;
    };
    const outCands = S.squad.filter((p) => outgoingLoanEligible(p));
    const outAlready = S.squad.filter((p) => p.loanedOut).length;
    const outLoanHTML = outCands.length ? `
      <div class="ow-sub" style="margin:10px 0 6px;text-align:left">📤 Prestiti in uscita (max 3 a finestra, ${outAlready}/3 usati): poco spazio finora, possono farsi le ossa altrove fino a fine stagione (tornano automaticamente la prossima).</div>
      ${outCands.map((p) => `
      <div class="ow-jan-card">
        <div class="ow-jan-head">
          <span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span>
          <span class="postag postag-${p.pos}">${p.pos}</span>
          <span class="nm">${flagOf(p)}${p.n}<small>${POS_LABEL[p.pos]} · età ${p.age} · ${p.seasonApps || 0} presenze finora</small></span>
        </div>
        <button class="dyn-mini" data-jan-loanout="${p.pid}" ${outAlready >= 3 ? 'disabled' : ''}>📤 Manda in prestito · +${fmtMoney(outgoingLoanFee(p))}</button>
      </div>`).join('')}` : '';
    overlay(`
      <h2>❄️ Il mercato di gennaio</h2>
      <p>A metà strada. ${ord(currentPos())} in ${d.name}. Budget ${fmtMoney(S.budget)}.</p>
      ${cands.length ? cands.map(cardHTML).join('') : '<div class="ow-sub">Nessun altro candidato in questa finestra.</div>'}
      ${outLoanHTML}
      <div class="ow-mgr"><span class="ovr" style="${ovrBadge(S.manager.rating)}">${S.manager.rating}</span><span class="nm">${flagOf(S.manager)}${S.manager.n}<small>${specOf(S.manager.spec).icon} ${specOf(S.manager.spec).label} · Allenatore in carica</small></span><span class="tag">In carica</span></div>
      <div class="ow-sub" style="margin:8px 0 6px;text-align:left">Esonera (30% di buonuscita) e nomina:</div>
      ${mgrCands.map((m, i) => `<div class="ow-mgr cand"><span class="ovr" style="${ovrBadge(m.rating)}">${m.rating}</span><span class="nm">${flagOf(m)}${m.n}${m.exPlayer ? ' <small title="Una tua ex leggenda">🎓</small>' : ''}<small>${fmtMoney(m.salary)}/anno, metà pagata subito · ${specOf(m.spec).icon} ${specOf(m.spec).label}${m.exPlayer ? ' · Ex giocatore del club' : ''}</small></span><button class="dyn-mini" data-wh="${i}" title="${specOf(m.spec).desc}">Assumi</button></div>`).join('')}
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovPlayOn">Continua così</button></div>`);
    $('ovPlayOn').onclick = () => { S.winterDone = true; S._pause = false; S._janCands = null; S._janSwitchUsed = false; S._janMgrCands = null; closeOverlay(); saveGame();
      if (S.played >= gp()) endSeason();
      else if (typeof S._bulkFrom === 'number') simToEnd();   // era partito "Simula": riprende da solo
    };
    document.querySelectorAll('#owOverlayModal [data-jan-loan]').forEach((el) => el.addEventListener('click', () => {
      const i = +el.dataset.janLoan, p = S._janCands[i]; if (!p) return;
      const cost = janLoanCost(p);
      if (S.budget < cost) { toast('Non puoi coprire il suo stipendio.', 'error'); return; }
      S.budget -= cost; p.loan = true; S.squad.push(p);
      S._janCands.splice(i, 1);
      toast(p.n + ' arriva in prestito fino a fine stagione.', 'spend');
      saveGame(); renderWinterOverlay();
    }));
    document.querySelectorAll('#owOverlayModal [data-jan-buy]').forEach((el) => el.addEventListener('click', () => {
      const i = +el.dataset.janBuy, p = S._janCands[i]; if (!p) return;
      const cost = janLoanCost(p) + janTransferFee(p);
      if (S.budget < cost) { toast('Non hai abbastanza per acquistarlo a titolo definitivo.', 'error'); return; }
      S.budget -= cost; S.squad.push(markSigned(p, cost));
      S._janCands.splice(i, 1);
      toast(p.n + ' firma a titolo definitivo.', 'spend');
      saveGame(); renderWinterOverlay();
    }));
    document.querySelectorAll('#owOverlayModal [data-jan-loanout]').forEach((el) => el.addEventListener('click', () => {
      const p = S.squad.find((x) => x.pid === +el.dataset.janLoanout); if (!p || !outgoingLoanEligible(p)) return;
      const outSoFar = S.squad.filter((x) => x.loanedOut).length;
      if (outSoFar >= 3) { toast('Massimo 3 giocatori in prestito in uscita per finestra.', 'error'); return; }
      const fee = outgoingLoanFee(p);
      p.loanedOut = true; S.budget += fee;
      toast(p.n + ' va in prestito fino a fine stagione: +' + fmtMoney(fee) + '.', 'money');
      saveGame(); renderWinterOverlay();
    }));
    document.querySelectorAll('#owOverlayModal [data-jan-switch]').forEach((el) => el.addEventListener('click', () => {
      if (S._janSwitchUsed) return;
      const i = +el.dataset.janSwitch; if (!S._janCands[i]) return;
      const old = S._janCands[i];
      S._janCands[i] = spinPlayer(false, undefined, 3);
      S._janSwitchUsed = true;
      if (DynSound) DynSound.tap();
      toast('Cambi ' + old.n + ' con un altro candidato.');
      saveGame(); renderWinterOverlay();
    }));
    document.querySelectorAll('#owOverlayModal [data-wh]').forEach((el) => el.addEventListener('click', () => {
      const m = S._janMgrCands[+el.dataset.wh]; if (!m) return;
      const cost = Math.round(S.manager.salary * severanceRate()) + Math.round(m.salary * 0.5);
      if (S.budget < cost) { toast('Non puoi permetterti il cambio (buonuscita + metà stipendio).', 'error'); return; }
      S.budget -= cost; S.manager = m;
      if (!S._seasonManagers) S._seasonManagers = [];
      S._seasonManagers.push(m.n);
      toast(m.n + ' prende il timone a stagione in corso.', 'spend');
      saveGame(); renderWinterOverlay();
    }));
  }

  // Un punteggio di rigori plausibile al posto del solo tag "(rigori)" — non decide MAI
  // l'esito (quello è già deciso altrove, qui c'è solo `r.won`), lo racconta soltanto: un
  // 5-4/4-3/ecc. coerente col vincitore, fissato la prima volta perché non cambi ad ogni
  // rirender della stessa schermata.
  function fmtPenScore(r) {
    if (r._penScore) return r._penScore;
    const loserMakes = 2 + rnd(3);
    const winnerMakes = loserMakes + 1 + (Math.random() < 0.3 ? 1 : 0);
    r._penScore = r.won ? (winnerMakes + '-' + loserMakes) : (loserMakes + '-' + winnerMakes);
    return r._penScore;
  }

  function renderSeasonEnd() {
    const e = S._end, d = divOf(), body = $('owSeasonEndBody');
    const banner = e.fate === 'forced' ? ['😡 I tifosi hanno parlato', 'Gradimento troppo basso. Sei costretto a dimetterti.']
      : e.fate === 'admin' ? ['🏦 Amministrazione controllata', 'Due stagioni in rosso. La banca chiede i conti.']
      : e.investorFailedPenalty ? ['📉 Obiettivo del fondo mancato', e.investorFailedName + ' si ritira e pretende indietro ' + fmtMoney(e.investorFailedPenalty) + ': un colpo pesante alle casse.']
      : e.investorCompleted ? ['🎯 Obiettivo del fondo raggiunto!', e.investorCompleted.name + ' incassa il patto: bonus finale di ' + fmtMoney(e.investorCompleted.completionBonus) + '.']
      : e.promoted ? ['🎉 PROMOZIONE', e.playoff && e.playoff.won ? 'Su tramite i playoff dopo un ' + ord(e.pos) + ' posto!' : e.title ? 'Campioni di ' + d.name + '!' : 'Promossi al ' + ord(e.pos) + ' posto!']
      : e.playoff && !e.playoff.won ? ['💔 Delusione playoff', 'Eliminati ' + (() => { const st = e.playoff.rounds[e.playoff.rounds.length - 1].stage.replace(' (aggregato)', ''); return st === 'Finale' ? 'in finale' : st === 'Semifinale' ? 'in semifinale' : 'ai quarti'; })() + ' playoff dopo un ' + ord(e.pos) + ' posto.']
      : e.relegated ? ['📉 Retrocessione', 'Giù al ' + ord(e.pos) + ' posto. I tifosi soffrono.']
      : e.title ? ['🏆 CAMPIONI', 'Vincitori di ' + d.name + '!']
      : ['Stagione ' + S.season + ' completata', ord(e.pos) + ' in ' + d.name + ' (i tifosi si aspettavano il ' + ord(e.exp) + ')'];
    const trophyChips = e.trophies.length ? e.trophies.map((t) => `<span class="trophy">🏆 ${t}</span>`).join('') : '<span class="trophy none">Nessun trofeo</span>';
    // Righe del playoff: una gamba (andata/ritorno) mostra solo il punteggio, il verdetto
    // arriva con la riga "(aggregato)" subito dopo con la ragione (differenza reti, miglior
    // piazzato, supplementari/rigori); il turno preliminare e il vecchio tabellone da 4
    // restano gara secca con l'eventuale nota su chi passa a parità.
    const playoffHTML = e.playoff ? `
        <div class="ow-sec-title" style="margin-top:12px">🏟️ I playoff</div>
        ${e.playoff.rounds.map((r) => {
          const usSc = fmtScorers(r.goalsFor), themSc = fmtScorers(r.goalsAgainst);
          if (r.leg) {
            return `<div class="ow-fin-row" style="flex-direction:column;align-items:stretch;gap:3px">
              <div style="display:flex;justify-content:space-between"><span>${r.stage} · ${r.leg} vs ${r.opp}</span><b>${r.gf}-${r.ga}</b></div>
              ${(usSc || themSc) ? `<div class="mrow-scorers">${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}</div>` : ''}
            </div>`;
          }
          const note = r.aggregate ? (' (aggregato' + (r.tiebreak === 'pens' ? ', supplementari · rigori ' + fmtPenScore(r) : r.tiebreak === 'seed' ? ', meglio piazzato in classifica' : r.tiebreak === 'dr' ? ', differenza reti' : '') + ')')
            : r.seedWin ? (r.extra ? ' (supplementari, meglio piazzato)' : ' (meglio piazzato)')
            : r.pens ? ' (rigori ' + fmtPenScore(r) + ')' : '';
          return `<div class="ow-fin-row" style="flex-direction:column;align-items:stretch;gap:3px">
            <div style="display:flex;justify-content:space-between"><span>${r.stage} vs ${r.opp}</span><b class="${r.won ? 'good' : 'bad'}">${r.won ? 'V' : 'P'} ${r.gf}-${r.ga}${note}</b></div>
            ${(usSc || themSc) ? `<div class="mrow-scorers">${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}</div>` : ''}
          </div>`;
        }).join('')}` : '';
    // Classifica finale del campionato appena chiuso: a colpo d'occhio, senza dover
    // riaprire il tabellone dalla sala del consiglio.
    const tableRecapHTML = `
        <div class="ow-sec-title" style="margin-top:12px">📋 Classifica finale · ${d.name}</div>
        <div style="max-height:44vh;overflow:auto;margin:0 -6px">${tableHTML()}</div>`;
    // Percorso in coppa, turno per turno: solo se ci sono stati turni da mostrare (niente
    // se il presidente non è nemmeno iscritto a una coppa europea quest'anno).
    const cupPathRow = (r) => `<div class="ow-fin-row"><span>${r.round}${r.opp ? ' vs ' + r.opp : ''}</span><b class="${r.won ? 'good' : 'bad'}">${r.gf}-${r.ga}${r.note ? ' · ' + r.note : ''}</b></div>`;
    const natPath = (e.cupPaths && e.cupPaths.nat) || [];
    const euroPath = (e.cupPaths && e.cupPaths.euro) || [];
    const cupPathHTML = (natPath.length ? `<div class="ow-sec-title" style="margin-top:12px">🇮🇹 Percorso in Coppa Italia</div>${natPath.map(cupPathRow).join('')}` : '')
      + (euroPath.length ? `<div class="ow-sec-title" style="margin-top:12px">${EURO_COMPS[e.euroCompWon].flag} Percorso in ${EURO_COMPS[e.euroCompWon].name}</div>${euroPath.map(cupPathRow).join('')}` : '');
    // Giocatori di movimento: marcatori, assistman e chiunque abbia comunque messo
    // piede in campo (anche solo da subentrato), non solo chi ha segnato o assistito. I
    // portieri hanno una statistica loro: i clean sheet, molto più significativi di un
    // gol che quasi non segnano mai.
    const scorers = S.squad.filter((p) => p.pos !== 'POR' && (p.seasonGoals > 0 || p.seasonAssists > 0 || p.seasonApps > 0))
      .sort((a, b) => b.seasonGoals - a.seasonGoals || b.seasonAssists - a.seasonAssists || (b.seasonApps || 0) - (a.seasonApps || 0) || b.ovr - a.ovr);
    const keepers = S.squad.filter((p) => p.pos === 'POR').sort((a, b) => (b.seasonApps || 0) - (a.seasonApps || 0) || (b.seasonCleanSheets || 0) - (a.seasonCleanSheets || 0) || b.ovr - a.ovr);
    const gkStarterPid = keepers.length ? keepers[0].pid : null;   // più presenze in stagione = titolare di fatto
    const topScorer = scorers.find((p) => p.seasonGoals > 0);
    // La variazione di overall della stagione appena chiusa: verde/su se è cresciuto,
    // rosso/giù se è calato, grigio se è rimasto stabile.
    const ovrDeltaHTML = (p) => {
      const d = p._ovrDelta || 0;
      const col = d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--muted)';
      const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '—';
      return `<span class="ovr-delta" style="color:${col}">${arrow}${Math.abs(d)}</span>`;
    };
    // Righe su due livelli: sopra overall+ruolo+nome COMPLETO (senza troncarlo), sotto le
    // statistiche più piccole. Coi tanti dati per riga (delta, overall, ruolo, nome, gol,
    // assist, presenze) su una riga sola il cognome finiva quasi sempre tagliato.
    const statRowHTML = (leftHTML, statsInner) => `
      <div class="ow-stat-row">
        <div class="ow-stat-row-top">${leftHTML}</div>
        <div class="ow-stat-row-bottom">${statsInner}</div>
      </div>`;
    const statsHTML = `
      <div class="ow-sec">
        <div class="ow-sec-title">📊 Statistiche giocatori</div>
        ${scorers.length ? `
          <div class="ow-sub">Marcatori e assist di ${S.club}${topScorer ? ' · capocannoniere ' + topScorer.n + ' (' + topScorer.seasonGoals + ')' : ''}</div>
          <div class="ow-squadlist" style="max-height:none">${scorers.map((p) => statRowHTML(
            `${ovrDeltaHTML(p)}<span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span><span class="postag postag-${p.pos}">${p.pos}</span><span class="nm">${flagOf(p)}${p.n}</span>`,
            `<span style="color:var(--gold)">⚽ ${p.seasonGoals || 0}</span><span>👟 ${p.seasonAssists || 0}</span><span title="Presenze">🎽 ${p.seasonApps || 0}</span>`
          )).join('')}
          </div>` : '<div class="ow-sub">Nessun marcatore o assistman di rilievo questa stagione.</div>'}
        ${keepers.length ? `
          <div class="ow-sub" style="margin-top:10px">Portieri</div>
          <div class="ow-squadlist" style="max-height:none">${keepers.map((p) => statRowHTML(
            `${ovrDeltaHTML(p)}<span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span><span class="nm">${flagOf(p)}${p.n}<small>${p.pid === gkStarterPid ? 'Titolare' : 'Riserva'}</small></span>`,
            `<span style="color:var(--good)">🧤 ${p.seasonCleanSheets || 0} clean sheet</span><span title="Presenze">🎽 ${p.seasonApps || 0}</span>`
          )).join('')}
          </div>` : ''}
      </div>`;
    // Squadra della stagione: gli 11 migliori DELLA TUA rosa (non un'ideale di tutta la
    // categoria — i rivali/bot non hanno una rosa di individui, solo un numero di forza
    // complessivo, vedi rivals() in sim.js), un 4-3-3 scelto per overall con un piccolo peso
    // per chi ha inciso di più nel proprio ruolo (gol per gli attaccanti, assist a centrocampo,
    // clean sheet in porta).
    const xiShape = { POR: 1, DIF: 4, CEN: 3, ATT: 3 };
    const xiScore = (p) => p.ovr + (p.pos === 'ATT' ? (p.seasonGoals || 0) * 0.3 : p.pos === 'CEN' ? (p.seasonAssists || 0) * 0.3 : p.pos === 'POR' ? (p.seasonCleanSheets || 0) * 0.3 : 0);
    const bestXiHTML = `
      <div class="ow-sec">
        <div class="ow-sec-title">⭐ Squadra della stagione</div>
        <div class="ow-sub">L'undici migliore che hai schierato quest'anno</div>
        ${Object.keys(xiShape).map((role) => {
          const picks = S.squad.filter((p) => p.pos === role).sort((a, b) => xiScore(b) - xiScore(a)).slice(0, xiShape[role]);
          return picks.map((p) => statRowHTML(
            `<span class="ovr" style="${ovrBadge(p.ovr)}">${p.ovr}</span><span class="postag postag-${p.pos}">${p.pos}</span><span class="nm">${flagOf(p)}${p.n}</span>`,
            `${p.pos === 'ATT' ? '<span style="color:var(--gold)">⚽ ' + (p.seasonGoals || 0) + '</span>' : p.pos === 'CEN' ? '<span>👟 ' + (p.seasonAssists || 0) + '</span>' : p.pos === 'POR' ? '<span style="color:var(--good)">🧤 ' + (p.seasonCleanSheets || 0) + '</span>' : ''}`
          )).join('');
        }).join('')}
      </div>`;
    // Un'animazione speciale per OGNI coppa/titolo vinto in questa stagione, non solo per i
    // 4 grandi momenti: scudetto (di qualunque categoria, non solo Serie A), Coppa Italia,
    // e ciascuna delle tre coppe europee ha il suo banner dedicato. Il Tripletе le sostituisce
    // tutte con un unico banner riassuntivo (altrimenti sarebbe la stessa notizia 3 volte).
    const bigMoments = [];
    if (e.treble) {
      bigMoments.push({ cls: 'treble', icon: '👑', title: 'TRIPLETE!', sub: d.name + ' + Coppa Italia + Champions League nella stessa stagione.' });
    } else {
      if (e.title) bigMoments.push({ cls: 'scudetto', icon: S.div === 5 ? '🏆' : '🥇', title: S.div === 5 ? 'SCUDETTO!' : 'CAMPIONI DI ' + d.name.toUpperCase() + '!', sub: 'Vincitori di ' + d.name + '.' });
      if (e.natWon) bigMoments.push({ cls: 'nat', icon: '🇮🇹', title: 'COPPA ITALIA', sub: 'Trofeo in bacheca, e qualificazione europea in tasca.' });
      if (e.euroWon) {
        const ec = EURO_COMPS[e.euroCompWon];
        const info = {
          ucl: { cls: 'ucl', title: 'CAMPIONI D\'EUROPA', sub: ec.name + ' alzata al cielo.' },
          uel: { cls: 'uel', title: 'EUROPA LEAGUE!', sub: ec.name + ' alzata al cielo.' },
          conf: { cls: 'conf', title: 'CONFERENCE LEAGUE!', sub: ec.name + ' alzata al cielo — e un posto in Europa League l\'anno prossimo.' },
        }[e.euroCompWon];
        if (info) bigMoments.push({ cls: info.cls, icon: ec.flag, title: info.title, sub: info.sub });
      }
    }
    const bigMomentHTML = bigMoments.map((m) => `
      <div class="ow-trophy-moment ${m.cls}">
        <div class="ow-trophy-icon">${m.icon}</div>
        <div class="ow-trophy-title">${m.title}</div>
        <div class="ow-trophy-sub">${m.sub}</div>
      </div>`).join('');
    body.innerHTML = `
      <div class="dyn-top"><div class="dyn-top-title">${banner[0]}</div><div class="dyn-top-sub">${banner[1]}</div></div>
      ${bigMomentHTML}
      ${(e.newRecords && e.newRecords.length) ? `
      <div class="ow-records-new" role="group" aria-label="Nuovi primati del club">
        <div class="ow-records-new-title">📈 Nuov${e.newRecords.length === 1 ? 'o primato' : 'i primati'} del club</div>
        ${e.newRecords.map((r) => `<div class="ow-fin-row"><span><span aria-hidden="true">${escapeHtml(r.icon)}</span> ${escapeHtml(r.label)}</span><b>${escapeHtml(r.value)}</b></div>`).join('')}
      </div>` : ''}
      <div class="dyn-panel">
        <div class="dyn-trophies">${trophyChips}</div>
        ${playoffHTML}
        ${cupPathHTML}
        ${(e.mpEvents && e.mpEvents.length) ? `
          <div class="ow-sec-title" style="margin-top:12px">📰 Cronaca della stagione</div>
          ${e.mpEvents.map((ev) => `<div class="ow-fin-row" style="align-items:flex-start"><span>${escapeHtml(ev.icon || '📰')} <b>${escapeHtml(ev.title || '')}</b><small style="display:block;color:var(--muted)">${escapeHtml(ev.text || '')}</small></span></div>`).join('')}
        ` : ''}
        ${tableRecapHTML}
        <div class="ow-sec-title" style="margin-top:12px">📋 Bilancio economico</div>
        ${e.statement.map((r) => r[1] === 0 && r[0].indexOf('avvio') > 0 ? `<div class="ow-fin-row memo"><span>${r[0]}</span><b>già pagati</b></div>` : `<div class="ow-fin-row"><span>${r[0]}</span><b class="${r[1] < 0 ? 'bad' : ''}">${r[1] < 0 ? '-' : '+'}${fmtMoney(Math.abs(r[1]))}</b></div>`).join('')}
        <div class="ow-fin-row total"><span>Saldo di stagione</span><b class="${e.net < 0 ? 'bad' : ''}">${e.net < 0 ? '-' : '+'}${fmtMoney(Math.abs(e.net))}</b></div>
        <div class="ow-fin-row total"><span>Budget attuale</span><b class="${S.budget < 0 ? 'bad' : ''}">${fmtMoney(S.budget)}</b></div>
        <div class="ow-sec-title" style="margin-top:12px">📣 L'umore</div>
        ${e.sentItems.length ? e.sentItems.map((s) => `<div class="ow-fin-row"><span>${s[0]}</span><b class="${s[1] < 0 ? 'bad' : 'good'}">${s[1] > 0 ? '+' : ''}${s[1]}</b></div>`).join('') : '<div class="ow-sub">Un\'estate tranquilla in curva.</div>'}
        ${meterHTML('Umore tifosi', S.sent, S.sent < 30)}
        ${meterHTML('Gradimento (' + (e.ratingDelta >= 0 ? '+' : '') + e.ratingDelta + ')', S.ownerRating, S.ownerRating < 35)}
        <div class="ow-fin-row"><span>Indice tifoseria</span><b class="${(e.fbDelta || 0) < 0 ? 'bad' : 'good'}">${S.fanbase.toFixed(2)} (${(e.fbDelta || 0) >= 0 ? '+' : ''}${(e.fbDelta || 0).toFixed(2)})</b></div>
        ${e.euroQual ? '<div class="ow-fin-row"><span>' + EURO_COMPS[e.euroQual].flag + ' Qualificazione europea</span><b class="good">' + EURO_COMPS[e.euroQual].name + ' la prossima stagione</b></div>' : ''}
        <div class="ow-fin-row total" style="margin-top:10px"><span>Valore del club</span><b>${fmtMoney(e.worth)}</b></div>
      </div>
      ${statsHTML}
      ${bestXiHTML}
      <button class="dyn-btn" id="owShareBtn">📤 Condividi la stagione</button>
      <div class="ow-cta-sticky"><button type="button" class="dyn-btn dyn-btn-primary" id="owEndBtn">${e.fate ? 'Affronta le conseguenze' : S.season >= (S.maxSeasons || MAX_SEASONS) ? 'Concludi la tua carriera' : 'Torna in sala del consiglio'}</button></div>`;
    $('owShareBtn').onclick = exportSeasonCard;
    if (e.promoted || e.title || e.trophies.length) celebrate(body.querySelector('.dyn-panel'));
    body.querySelectorAll('.ow-trophy-moment').forEach((bm) => { fireConfetti(bm); setTimeout(() => fireConfetti(bm), 550); });
    if (DynSound) {
      if (bigMoments.length || e.promoted) DynSound.trophy();
      else if (e.relegated || e.fate || e.investorFailedPenalty || (e.playoff && !e.playoff.won)) DynSound.sadDown();
      else DynSound.calmEnd();
    }
    $('owEndBtn').onclick = () => {
      // advance() non va chiamata due volte: un doppio tocco farebbe saltare un'intera estate.
      if ($('owEndBtn').dataset.busy) return; $('owEndBtn').dataset.busy = '1';
      if (e.fate === 'forced') { endDynasty('forced', 0); return; }
      if (e.fate === 'admin') { endDynasty('admin', 0); return; }
      if (S.season >= (S.maxSeasons || MAX_SEASONS)) { endDynasty('retired', 0); return; }
      advance();
    };
    show('owSeasonEndScreen');
  }

  function renderEnd() {
    const body = $('owEndBody'), how = S._how, worth = computeWorth();
    const heads = {
      sold: ['💷 VENDUTO', S.owner + ' vende ' + S.club + ' per ' + fmtMoney(S._sale) + (S.history.length ? ' dopo ' + S.history.length + ' stagion' + (S.history.length === 1 ? 'e' : 'i') + '.' : ' prima ancora della prima stagione.')],
      retired: ['🎖️ Fine dynasty', S.owner + ' lascia ' + S.club + ' dopo le ' + (S.maxSeasons || MAX_SEASONS) + ' stagioni complete.'],
      resigned: ['Ti sei dimesso', S.owner + ' si dimette da presidente di ' + S.club + '.'],
      forced: ['😡 Cacciato', 'I tifosi hanno cacciato ' + S.owner + ' da ' + S.club + '.'],
      admin: ['🏦 Amministrazione controllata', S.club + ' ha finito i soldi sotto la tua gestione.'],
      investor: ['📉 Cessione forzata', 'Il fondo d\'investimento ha ceduto ' + S.club + ' dopo l\'obiettivo mancato.'],
    };
    const h = heads[how] || heads.retired;
    const honours = [];
    S.trophies.titles.forEach((n, i) => { if (n) honours.push(n + 'x Titolo ' + (DIVS[i] ? DIVS[i].name : '')); });
    if (S.trophies.nat) honours.push(S.trophies.nat + 'x Coppa Italia');
    ['ucl', 'uel', 'conf'].forEach((k) => { if (S.trophies[k]) honours.push(S.trophies[k] + 'x ' + EURO_COMPS[k].name); });
    const topDiv = S.history.reduce((a, hh) => Math.max(a, DIVS.findIndex((x) => x.name === hh.div)), S.div);
    const promotions = S.history.filter((hh) => hh.promoted).length;
    // I migliori di sempre: chi è ancora in rosa (totali di carriera + stagione in corso) più
    // chi se n'è andato nel frattempo (venduto, svincolato, ritirato — vedi pushAlumnus),
    // altrimenti solo chi è rimasto fino all'ultimo giorno finirebbe in bacheca.
    const allTime = (S.squad || []).map((p) => ({
      n: p.n, pos: p.pos,
      apps: (p.careerApps || 0) + (p.seasonApps || 0),
      goals: (p.careerGoals || 0) + (p.seasonGoals || 0),
      assists: (p.careerAssists || 0) + (p.seasonAssists || 0),
      cleanSheets: (p.careerCleanSheets || 0) + (p.seasonCleanSheets || 0),
    })).concat(S.alumni || [])
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.apps - a.apps)
      .slice(0, 5);
    body.innerHTML = `
      <div class="dyn-top">${crestMarkup(S.crestShape, S.crestColors, 'ow-hero-crest')}<div class="dyn-top-title">${h[0]}</div><div class="dyn-top-sub">${h[1]}</div></div>
      <div class="dyn-panel">
        <div class="pl-hero"><div class="big" style="font-size:56px">${fmtMoney(how === 'sold' ? S._sale : worth)}</div><div class="cap">${how === 'sold' ? 'PREZZO DI VENDITA' : 'VALORE FINALE DEL CLUB'}</div></div>
        <div class="dyn-trophies">${honours.length ? honours.map((x) => `<span class="trophy">🏆 ${x}</span>`).join('') : '<span class="trophy none">Nessun trofeo</span>'}</div>
        <div class="dyn-stat-row" style="grid-template-columns:1fr 1fr 1fr">
          <div class="dyn-stat"><span>Stagioni</span><b>${S.history.length}</b></div>
          <div class="dyn-stat"><span>Promozioni</span><b>${promotions}</b></div>
          <div class="dyn-stat"><span>Valore massimo</span><b>${fmtMoney(S.peakWorth)}</b></div>
        </div>
        <div class="dyn-verdict">Livello massimo: <b>${DIVS[Math.max(0, topDiv)].name}</b> · Stadio: <b>${capOf().toLocaleString('it-IT')} posti</b> · Trofei: <b>${S.trophies.total}</b></div>
      </div>
      ${allTime.length ? `
      <div class="pl-card" style="padding:14px 12px">
        <div class="dyn-top-sub" style="text-align:left;margin-bottom:8px">I migliori di sempre</div>
        ${allTime.map((p) => `<div class="ow-fin-row"><span>${p.n}<small style="display:block;color:var(--muted)">${POS_LABEL[p.pos] || p.pos} · 🎽 ${p.apps} presenz${p.apps === 1 ? 'a' : 'e'}</small></span><b>${p.pos === 'POR' ? '🧤 ' + p.cleanSheets : '⚽ ' + p.goals + ' · 👟 ' + p.assists}</b></div>`).join('')}
      </div>` : ''}
      <div class="pl-card" style="padding:14px 12px">
        <div class="dyn-top-sub" style="text-align:left;margin-bottom:10px">La bacheca, stagione per stagione</div>
        ${sparkRow('Posizione in classifica (su, meglio)', S.history.map((hh) => -hh.pos), 'var(--gold)')}
        ${sparkRow('Valore del club', S.history.map((hh) => hh.worth), 'var(--dyn)')}
        ${sparkRow('Budget a fine stagione', S.history.map((hh) => hh.budget != null ? hh.budget : 0), 'var(--good)')}
      </div>
      <div class="pl-card" style="padding:14px 12px">
        <div class="dyn-top-sub" style="text-align:left;margin-bottom:8px">La storia, stagione per stagione</div>
        <div style="overflow-x:auto">
          <table class="dyn-table"><thead><tr><th>S</th><th>Categoria</th><th class="num">Pos</th><th class="num">Media</th><th>Allenatore</th><th class="num">Saldo</th><th class="num">Valore</th><th>Trofei</th></tr></thead>
          <tbody>${S.history.map((hh) => `<tr><td>${hh.season}${hh.promoted ? ' ⬆️' : hh.relegated ? ' ⬇️' : ''}</td><td>${hh.div}</td><td class="num">${hh.pos}</td><td class="num">${hh.ppg != null ? hh.ppg.toFixed(2) : '-'}</td><td style="font-size:11px">${hh.mgr || '-'}</td><td class="num">${hh.net < 0 ? '-' : ''}${fmtMoney(Math.abs(hh.net))}</td><td class="num">${fmtMoney(hh.worth)}</td><td style="font-size:11px">${hh.trophies.length ? hh.trophies.join(', ') : '-'}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>
      <button class="dyn-btn" id="owShareCareerBtn">📤 Condividi la carriera</button>
      <button class="dyn-btn" id="owShareLbBtn">🌍 Invia alla classifica globale</button>
      <button class="dyn-btn" id="owAgainBtn">Nuova carriera</button>
      <a class="dyn-back" href="index.html">Torna alla schermata iniziale</a>`;
    if (S.trophies.total > 0 || how === 'retired') celebrate(body.querySelector('.dyn-panel'));
    $('owAgainBtn').onclick = () => location.reload();
    $('owShareCareerBtn').onclick = exportCareerCard;
    $('owShareLbBtn').onclick = submitToLeaderboard;
    show('owEndScreen');
  }

  // Promemoria: raccoglie in un unico posto le cose che meritano attenzione ma che altrimenti
  // si scoprono solo navigando le tab una per una (contratti in scadenza, infortunati/
  // squalificati che rientrano a breve, offerte di mercato o del fondo d'investimento ancora
  // da decidere). Nessuno stato nuovo: legge solo campi già esistenti su S.
  function buildReminders() {
    if (!S || !S.squad) return [];
    const items = [];
    const expiring = S.squad.filter((p) => !p.loan && finalYear(p));
    if (expiring.length) items.push({ icon: '📄', text: (expiring.length === 1 ? expiring[0].n + ' è' : expiring.length + ' giocatori sono') + ' in scadenza di contratto: rinnova o li perdi a parametro zero.' });
    const soonBack = S.squad.filter((p) => p.outWeeks > 0 && p.outWeeks <= 2);
    if (soonBack.length) items.push({ icon: '🚑', text: soonBack.map((p) => p.n + ' (' + p.outWeeks + ' settiman' + (p.outWeeks === 1 ? 'a' : 'e') + ')').join(', ') + ' torna' + (soonBack.length === 1 ? '' : 'no') + ' a breve dall\'infortunio.' });
    const suspended = S.squad.filter((p) => p.suspMatches > 0);
    if (suspended.length) items.push({ icon: '🟥', text: suspended.map((p) => p.n).join(', ') + ' salta' + (suspended.length === 1 ? '' : 'no') + ' la prossima per squalifica.' });
    if (S.offers && S.offers.length) items.push({ icon: '📨', text: S.offers.length + ' offert' + (S.offers.length === 1 ? 'a' : 'e') + ' di mercato in sospeso per i tuoi giocatori.' });
    if (S.investorOpts && S.investorOpts.length && !S.investorDeal) items.push({ icon: '🏦', text: 'Un fondo d\'investimento aspetta una risposta in Finanze.' });
    if (S.scoutProspects && S.scoutProspects.length) items.push({ icon: '🔭', text: 'Il settore giovanile ha una promessa pronta da aggregare alla rosa, in Rosa.' });
    return items;
  }
  function syncNotifDot() {
    const dot = $('owNotifDot'); if (!dot) return;
    const n = (S && S.squad && !S.over) ? buildReminders().length : 0;
    dot.style.display = n ? '' : 'none';
    // Il pallino rosso da solo non esiste per uno screen reader: il numero va nel nome.
    const bell = $('owNotifBtn'); if (bell) bell.setAttribute('aria-label', n ? 'Promemoria: ' + n + ' da vedere' : 'Promemoria');
  }
  function openReminders() {
    const items = buildReminders();
    const canNotify = typeof Notification !== 'undefined';
    overlay(`<h2>🔔 Promemoria</h2>
      ${items.length ? items.map((r) => `<div class="ow-fin-row" style="align-items:flex-start"><span style="flex:0 0 auto">${r.icon}</span><span style="text-align:left">${r.text}</span></div>`).join('') : '<div class="ow-sub" style="text-align:center">Tutto sotto controllo, nessun promemoria al momento.</div>'}
      ${canNotify && Notification.permission === 'default' ? `<div class="ow-sub" style="margin-top:10px">Vuoi essere avvisato anche quando non hai il gioco in primo piano (es. rinnovi in scadenza)?</div><button class="dyn-btn" id="remindersNotifyBtn" style="margin-top:6px">🔔 Avvisami anche a schermo spento</button>` : ''}
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
    const notifyBtn = $('remindersNotifyBtn');
    if (notifyBtn) notifyBtn.onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} openReminders(); };
  }

  // Estende lo stesso pattern già usato per la lobby multiplayer (notifica reale quando
  // cambia qualcosa nella stanza a tab nascosta) ai promemoria di carriera singola
  // (buildReminders: rinnovi in scadenza, mercato di gennaio, offerte in sospeso...): un solo
  // avviso per ogni volta che la tab torna nascosta, non uno ad ogni secondo di inattività.
  let _remindersNotifiedThisHide = false;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { _remindersNotifiedThisHide = false; return; }
    if (_remindersNotifiedThisHide) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!S || !S.squad) return;
    const items = buildReminders();
    if (!items.length) return;
    _remindersNotifiedThisHide = true;
    try {
      new Notification('⚽ ' + S.club + ' — ' + items.length + ' promemoria', {
        body: items.map((r) => r.icon + ' ' + r.text).join('\n').slice(0, 200),
      });
    } catch (e) {}
  });

  // Classifica globale condivisa (leaderboard.php lato server): un invio a fine carriera
  // (facoltativo) e una lista consultabile in ogni momento dal topbar. Fallisce in
  // silenzio-ma-avvisato se il server non risponde (es. in locale, dove il PHP non gira).
  async function submitToLeaderboard() {
    const btn = $('owShareLbBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Invio…'; }
    try {
      const res = await fetch('leaderboard.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club: S.club, owner: S.owner, div: S.div, startDiv: S.startDiv, season: S.season, trophies: S.trophies.total, worth: computeWorth(), difficulty: S.difficulty, trophyBreakdown: S.trophies }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok) { toast('🌍 Carriera inviata alla classifica globale!', 'success'); if (btn) btn.textContent = '✓ Inviata'; }
      else { toast(serverError(res, data, 'Invio non riuscito.').message, 'error'); if (btn) { btn.disabled = false; btn.textContent = '🌍 Invia alla classifica globale'; } }
    } catch (err) {
      toast('Impossibile contattare la classifica globale al momento.');
      if (btn) { btn.disabled = false; btn.textContent = '🌍 Invia alla classifica globale'; }
    }
  }

  // Un colore per fascia di difficoltà (badge nella classifica globale): stessa idea delle
  // zone colorate della classifica di campionato, qui applicata alla difficoltà con cui è
  // stata giocata la carriera — un pareggio semplice ha meno merito di uno in Estremo.
  const DIFF_COLOR = { facile: 'var(--good)', medio: 'var(--muted)', difficile: 'var(--gold)', estremo: 'var(--bad)' };

  // Filtri della classifica globale (stato di modulo, non persistito: si azzerano riaprendola):
  // un solo punteggio composito con un moltiplicatore per difficoltà (leaderboard.php) resta
  // comunque un confronto sporco fra una run "Estremo" e una "Facile" — qui si può restringere
  // a una sola difficoltà, o a una sola categoria di arrivo, invece di vedere solo la top 10
  // assoluta. `lbEntries` tiene tutte le voci scaricate una volta sola: cambiare filtro
  // ri-renderizza SENZA un nuovo fetch.
  let lbEntries = [];
  let lbFilterDiff = 'all';
  let lbFilterDiv = 'all';
  // boardSeason (server, leaderboard.php): un concetto diverso da e.season (quella è la
  // stagione IN carriera). Serve a poter "chiudere" la classifica ogni tanto senza perdere lo
  // storico — di default si mostra solo quella in corso (lbCurrentSeason, dal server), con un
  // selettore per rivedere le stagioni passate.
  let lbCurrentSeason = 1;
  let lbFilterSeason = 1;

  const diffOfEntry = (key) => DIFFICULTIES.find((d) => d.key === key) || { label: 'Media', key: 'medio' };
  const diffBadge = (key) => { const d = diffOfEntry(key); return `<span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:800;border:1px solid ${DIFF_COLOR[d.key] || 'var(--line)'};color:${DIFF_COLOR[d.key] || 'var(--muted)'}">${d.label}</span>`; };

  function renderLeaderboardBody() {
    const filtered = lbEntries.filter((e) => (e.boardSeason || 1) === lbFilterSeason && (lbFilterDiff === 'all' || e.difficulty === lbFilterDiff) && (lbFilterDiv === 'all' || e.div === +lbFilterDiv));
    const top10 = filtered.slice(0, 10);
    const medal = ['🥇', '🥈', '🥉'];
    // Podio per i primi 3: il 1° al centro e più grande, come un vero podio, ordinato con
    // CSS `order` (nel markup restano comunque nell'ordine di merito, screen reader inclusi).
    const podium = top10.slice(0, 3).map((e, i) => `
      <div data-lbpodium="${i}" title="Tocca per i dettagli" style="cursor:pointer;order:${i === 0 ? 2 : i === 1 ? 1 : 3};flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:${i === 0 ? '14px 6px 10px' : '8px 6px'};border-radius:12px;background:${i === 0 ? 'rgba(255,190,40,.2)' : 'rgba(20,22,26,.04)'};border:1px solid ${i === 0 ? 'var(--gold)' : 'var(--line)'}">
        <div style="font-size:${i === 0 ? '34px' : '24px'};line-height:1">${medal[i]}</div>
        <div style="font-weight:900;font-size:${i === 0 ? '14px' : '12px'};text-align:center;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${escapeHtml(e.club)}</div>
        <div style="font-size:10px;color:var(--muted);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${escapeHtml(e.owner)}</div>
        ${diffBadge(e.difficulty)}
        <div style="font-weight:900;color:var(--gold);font-size:${i === 0 ? '17px' : '14px'};font-variant-numeric:tabular-nums">${Math.round(e.score).toLocaleString('it-IT')} <span style="font-size:.6em;font-weight:800;opacity:.75">PA</span></div>
      </div>`).join('');
    const restRows = top10.slice(3).map((e, i) => `
      <div class="ow-fin-row" style="align-items:center">
        <span style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="flex:0 0 auto;width:22px;text-align:center;color:var(--muted);font-weight:800">${i + 4}</span>
          <span style="min-width:0;text-align:left"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.club)}</b>
            <small style="display:flex;gap:6px;align-items:center;color:var(--muted);margin-top:2px">${escapeHtml(e.owner)} · ${(DIVS[e.div] || {}).name || ''} · 🏆 ${escapeHtml(e.trophies)} ${diffBadge(e.difficulty)}</small>
          </span>
        </span>
        <b class="good" style="flex:0 0 auto;font-variant-numeric:tabular-nums">${Math.round(e.score).toLocaleString('it-IT')} <span style="font-size:.75em;opacity:.75">PA</span></b>
      </div>`).join('');
    const diffPills = ['all'].concat(DIFFICULTIES.map((d) => d.key)).map((k) => `<button type="button" class="ow-filter-pill ${lbFilterDiff === k ? 'on' : ''}" data-lbdiff="${k}">${k === 'all' ? 'Tutte' : diffOfEntry(k).label}</button>`).join('');
    const divPills = ['all'].concat(DIVS.map((d, i) => i)).map((k) => `<button type="button" class="ow-filter-pill ${lbFilterDiv === String(k) ? 'on' : ''}" data-lbdiv="${k}">${k === 'all' ? 'Tutte' : DIVS[k].name}</button>`).join('');
    // Le stagioni di classifica presenti fra le voci scaricate (di solito solo 1-2: quella
    // chiusa e quella in corso), più recente per prima — mai solo quella corrente, altrimenti
    // una classifica appena "chiusa" sparirebbe dal selettore finché nessuno invia più nulla.
    const seasons = Array.from(new Set(lbEntries.map((e) => e.boardSeason || 1).concat([lbCurrentSeason]))).sort((a, b) => b - a);
    const seasonPills = seasons.map((s) => `<button type="button" class="ow-filter-pill ${lbFilterSeason === s ? 'on' : ''}" data-lbseason="${escapeHtml(s)}">Stagione ${escapeHtml(s)}${s === lbCurrentSeason ? ' (in corso)' : ''}</button>`).join('');
    overlay(`<h2>🌍 Classifica presidenti</h2>
      <div class="ow-sub" style="text-align:center">Le migliori 10 carriere condivise da chi gioca, filtrabili per stagione di classifica, difficoltà e categoria raggiunta · punteggio in PA (Punti Aura)</div>
      ${seasons.length > 1 ? `<div class="ow-sub" style="margin:8px 0 2px">Stagione di classifica</div><div class="ow-squad-filters">${seasonPills}</div>` : ''}
      <div class="ow-sub" style="margin:8px 0 2px">Difficoltà</div>
      <div class="ow-squad-filters">${diffPills}</div>
      <div class="ow-sub" style="margin:8px 0 2px">Categoria</div>
      <div class="ow-squad-filters">${divPills}</div>
      ${podium ? `<div style="display:flex;align-items:flex-end;gap:8px;margin:14px 0 6px">${podium}</div>` : ''}
      <div style="max-height:38vh;overflow:auto;margin:10px -6px 4px;display:flex;flex-direction:column;gap:2px">${restRows || (podium ? '' : `<div class="ow-sub" style="margin:14px 0">${lbEntries.length ? 'Nessuna carriera in questo filtro.' : 'Ancora nessuna carriera condivisa: sii il primo a fine partita.'}</div>`)}</div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
    document.querySelectorAll('#owOverlayModal [data-lbseason]').forEach((el) => el.addEventListener('click', () => { lbFilterSeason = +el.dataset.lbseason; renderLeaderboardBody(); }));
    document.querySelectorAll('#owOverlayModal [data-lbdiff]').forEach((el) => el.addEventListener('click', () => { lbFilterDiff = el.dataset.lbdiff; renderLeaderboardBody(); }));
    document.querySelectorAll('#owOverlayModal [data-lbdiv]').forEach((el) => el.addEventListener('click', () => { lbFilterDiv = el.dataset.lbdiv; renderLeaderboardBody(); }));
    document.querySelectorAll('#owOverlayModal [data-lbpodium]').forEach((el) => el.addEventListener('click', () => { const e = top10[+el.dataset.lbpodium]; if (e) showLeaderboardDetail(e); }));
  }

  // Dettaglio di una voce del podio: scompone il totale trofei in scudetti/promozioni per
  // categoria, Coppa Italia e coppe europee — dati inviati solo da chi ha condiviso DOPO
  // questo aggiornamento (trophyBreakdown), quindi una voce più vecchia mostra solo il totale
  // già visibile in classifica, con una nota invece di far finta di avere un dettaglio che
  // semplicemente non è mai stato mandato dal client a suo tempo.
  function showLeaderboardDetail(e) {
    const tb = e.trophyBreakdown;
    const rows = [];
    if (tb && Array.isArray(tb.titles)) {
      tb.titles.forEach((n, i) => { if (n > 0 && DIVS[i]) rows.push(['🏆 Titoli in ' + DIVS[i].name, n]); });
      if (tb.nat > 0) rows.push(['🇮🇹 Coppa Italia', tb.nat]);
      if (tb.ucl > 0) rows.push(['⭐ ' + (EURO_COMPS.ucl ? EURO_COMPS.ucl.name : 'Champions League'), tb.ucl]);
      if (tb.uel > 0) rows.push(['🟠 ' + (EURO_COMPS.uel ? EURO_COMPS.uel.name : 'Europa League'), tb.uel]);
      if (tb.conf > 0) rows.push(['🟢 ' + (EURO_COMPS.conf ? EURO_COMPS.conf.name : 'Conference League'), tb.conf]);
    }
    overlay(`<h2>${escapeHtml(e.club)}</h2>
      <div class="ow-sub" style="text-align:center">${escapeHtml(e.owner)} · ${(DIVS[e.div] || {}).name || ''} · stagione ${escapeHtml(e.season)} ${diffBadge(e.difficulty)}</div>
      <div class="ow-sec" style="margin-top:10px">
        <div class="ow-fin-row"><span>Punteggio</span><b class="good">${Math.round(e.score).toLocaleString('it-IT')} PA</b></div>
        <div class="ow-fin-row"><span>Valore del club</span><b>${escapeHtml(fmtMoney(+e.worth || 0))}</b></div>
        <div class="ow-fin-row"><span>Trofei totali</span><b>🏆 ${escapeHtml(e.trophies)}</b></div>
        ${rows.length ? rows.map(([label, n]) => `<div class="ow-fin-row"><span>${label}</span><b>${escapeHtml(n)}</b></div>`).join('') : `<div class="ow-sub" style="margin-top:8px">${tb ? 'Nessun trofeo specifico oltre al totale.' : 'Dettaglio trofei non disponibile per questa carriera (condivisa prima di questo aggiornamento).'}</div>`}
      </div>
      <div class="dyn-modal-actions">
        <button class="dyn-btn" id="ovBack">← Torna alla classifica</button>
      </div>`);
    $('ovBack').onclick = renderLeaderboardBody;
  }

  async function showGlobalLeaderboard() {
    lbFilterDiff = 'all'; lbFilterDiv = 'all';
    overlay(`<h2>🌍 Classifica presidenti</h2><div class="ow-sub" style="text-align:center">Caricamento…</div><div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
    try {
      const res = await fetch('leaderboard.php');
      const data = await res.json();
      if (!data || !data.ok) throw new Error('bad response');
      lbEntries = Array.isArray(data.entries) ? data.entries.filter((e) => e && typeof e === 'object') : [];
      lbCurrentSeason = data.currentSeason || 1;
      lbFilterSeason = lbCurrentSeason;   // di default si mostra la stagione in corso
      renderLeaderboardBody();
    } catch (err) {
      overlay(`<h2>🌍 Classifica presidenti</h2><div class="ow-sub" style="text-align:center">Non riesco a caricarla al momento. Riprova più tardi.</div><div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
      $('ovClose').onclick = closeOverlay;
    }
  }

  /* ---------------- nuova versione pronta ----------------
     Il service worker nuovo non prende più il controllo da solo a metà partita: chiede alla
     pagina (SW_UPDATE_READY), index.html risponde "aspetta" (SW_UPDATE_DEFER) e tiene da parte
     il worker in window.__swWaiting. Qui si decide QUANDO lasciarlo subentrare (il ricaricamento
     vero lo fa poi il listener `controllerchange` già presente in index.html):
     - sulla schermata iniziale, a nessun modale aperto, subito: lì non c'è niente da perdere;
     - a carriera aperta mai da soli. Compare una nota discreta "Nuova versione pronta" con un
       bottone Aggiorna, visibile solo fra una stagione e l'altra (Dirigenza, fine stagione, fine
       carriera): durante il campionato o con un modale aperto resta nascosta, e ricompare al
       primo momento buono. La carriera viene salvata prima di ricaricare. */
  function swUpdateWaiting() { return !!window.__swWaiting; }
  function applySwUpdate() {
    try { if (S && S.squad && !S.over) saveGame(); } catch (e) {}
    const note = $('owUpdateNote'); if (note) note.classList.add('hidden');
    if (typeof window.__applySwUpdate === 'function') window.__applySwUpdate();
  }
  function syncUpdateNote() {
    const note = $('owUpdateNote'); if (!note) return;
    if (!swUpdateWaiting()) { note.classList.add('hidden'); return; }
    const modalOpen = !$('owOverlay').classList.contains('hidden');
    const onSetup = !$('owSetupScreen').classList.contains('hidden');
    if (onSetup && !modalOpen) { applySwUpdate(); return; }
    const midSeason = !$('owSeasonScreen').classList.contains('hidden');
    note.classList.toggle('hidden', onSetup || midSeason || modalOpen);
  }
  window.__onSwUpdateReady = syncUpdateNote;
  (function () { const b = $('owUpdateBtn'); if (b) b.addEventListener('click', applySwUpdate); })();

  /* ================= RENDER ================= */
  function show(id) {
    const el = $(id), wasHidden = el.classList.contains('hidden');
    document.querySelectorAll('.dyn-screen').forEach((s) => s.classList.add('hidden'));
    el.classList.remove('hidden');
    if (wasHidden) {
      window.scrollTo(0, 0); // solo al cambio schermata: un re-render della stessa schermata non deve far saltare lo scroll in cima
      // Al cambio schermata il focus restava sul bottone appena premuto, ormai nascosto: da
      // tastiera/screen reader ci si ritrovava "da nessuna parte". Riparte dalla nuova schermata
      // (i <main> hanno tabindex=-1), a meno che un modale aperto non lo stia già gestendo.
      if ($('owOverlay').classList.contains('hidden')) el.focus({ preventScroll: true });
    }
    const tb = $('owTopbar'); if (tb) tb.classList.remove('hidden');
    if (S) { S._screen = id; saveGame(); }
    syncHomeCrest();
    syncUpdateNote();
  }

  function renderHud() {
    renderSeasonTarget();   // a che punto sei rispetto all'obiettivo cambia a ogni giornata
    syncNotifDot();
    $('hudSeason').textContent = S.season + '/' + (S.maxSeasons || MAX_SEASONS);
    $('hudPlayed').textContent = S.played + '/' + gp();
    const pos = S.table ? (S.table.findIndex((t) => t.me) + 1) : 0;
    // Freccia di classifica come in TV: quante posizioni guadagnate o perse con l'ultima giornata.
    if (S.played === 0) { S._posTrack = null; }
    else if (pos && (!S._posTrack || S._posTrack.played !== S.played)) {
      const prev = S._posTrack ? S._posTrack.pos : pos;
      S._posTrack = { played: S.played, pos, delta: prev - pos };
    }
    const dl = S._posTrack && S._posTrack.played === S.played ? S._posTrack.delta : 0;
    $('hudPos').innerHTML = (pos ? ord(pos) : '-') + (dl ? ` <i class="ow-pos-delta ${dl > 0 ? 'up' : 'down'}" title="${dl > 0 ? 'Guadagnate' : 'Perse'} ${Math.abs(dl)} posizioni dall'ultimo aggiornamento">${dl > 0 ? '▲' : '▼'}${Math.abs(dl)}</i>` : '');
    $('hudPts').textContent = S.pts;
    $('owDivChip').textContent = divOf().name;
    $('owBudgetChip').querySelector('b').textContent = fmtMoney(S.budget);
    const pp = projectedPos();
    $('owProjChip').querySelector('b').textContent = pp ? ord(pp) : '-';
    $('owWorthChip').querySelector('b').textContent = fmtMoney(computeWorth());
    const inPlayoff = S._playoffState && !S._playoffState.done;
    $('owNextBtn').disabled = inPlayoff ? false : (!S.seasonActive || S.played >= gp());
    $('owSimBtn').disabled = inPlayoff || !S.seasonActive || S.played >= gp();
    $('owNextBtn').textContent = inPlayoff ? '🏟️ Gioca la prossima gara di playoff' : (S.played >= gp() ? 'Stagione completata' : 'Gioca prossima partita');
    renderForm();
  }

  // Forma recente (ultime 5 di campionato, la più recente a destra col bordo) e avanzamento
  // della stagione: due cose che prima si ricavavano solo scorrendo il log partita per partita
  // o facendo a mente "23 su 46". S.results è già l'elenco usato per ridisegnare il log.
  function renderForm() {
    const el = $('owForm'); if (!el) return;
    // allResults (sim.js): campionato e coppe/playoff in ordine cronologico, ognuna con `comp`.
    const res = allResults(S).filter((r) => r && r.res);
    if (!res.length) { el.innerHTML = ''; return; }
    const last = res.slice(-5), IT = { W: 'V', D: 'N', L: 'P' }, WORD = { W: 'vittoria', D: 'pareggio', L: 'sconfitta' };
    const isCup = (r) => r.comp && r.comp !== 'league';
    const COMP_WORD = { nat: 'Coppa Italia', ucl: 'Champions League', uel: 'Europa League', conf: 'Conference League', playoff: 'playoff' };
    const pct = Math.round(clamp(S.played / gp(), 0, 1) * 100);
    el.innerHTML = `<span class="ow-form-lbl">Forma</span>
      <span class="ow-form-dots" role="img" aria-label="Ultime ${last.length} partite: ${last.map((r) => (WORD[r.res] || '') + (isCup(r) ? ' in ' + (COMP_WORD[r.comp] || 'coppa') : '')).join(', ')}">${last.map((r) => `<span class="ow-form-dot ${r.res}${isCup(r) ? ' cup comp-' + escapeHtml(r.comp) : ''}" aria-hidden="true" title="${escapeHtml((isCup(r) ? (COMP_WORD[r.comp] || 'Coppa') + ' · ' : '') + r.gf + '-' + r.ga + ' vs ' + r.opp)}">${IT[r.res] || '·'}</span>`).join('')}</span>
      <span class="ow-progress" role="progressbar" aria-label="Stagione giocata" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
      <span class="ow-progress-lbl">${pct}%</span>`;
  }

  // Annuncio per screen reader del risultato appena uscito: il log è una lista che cresce in
  // testa e viene anche ridisegnata per intero (ripresa del salvataggio, fine simulazione), per
  // cui renderlo "live" leggerebbe decine di righe. Qui passa solo l'ULTIMO messaggio: chiamate
  // ravvicinate (46 partite ridisegnate in un colpo) si sovrascrivono e ne resta una.
  let liveT = null;
  function announceLive(msg) {
    const el = $('owLive'); if (!el) return;
    clearTimeout(liveT);
    liveT = setTimeout(() => { el.textContent = msg; }, 120);
  }

  // Piccolo promemoria persistente dell'obiettivo dichiarato a inizio stagione (vedi
  // seasonTarget in sim.js), visibile per tutta la durata del campionato — durante il playoff
  // (stagione già chiusa, obiettivo ormai deciso) mostra invece chi si affronta nella prossima
  // gara, la stessa vetrina usata per l'obiettivo.
  function renderSeasonTarget() {
    const el = $('owSeasonTarget'); if (!el) return;
    if (S._playoffState && !S._playoffState.done) {
      const next = S._playoffState.queue[0];
      const oppName = next ? (S.table[next.oppPos - 1] || {}).name : null;
      el.innerHTML = `<span class="ow-target-pill playoff">🏟️ Playoff${oppName ? ': ' + next.stage + ' vs ' + oppName : ' in corso'}</span>`;
      return;
    }
    const t = S.seasonTargetInfo;
    if (!t) { el.innerHTML = ''; return; }
    // Non solo l'etichetta: a che punto sei rispetto all'obiettivo, in posizione e punti, così
    // ogni giornata ha qualcosa in palio (prima era una pillola fissa per tutta la stagione).
    const d = divOf();
    const line = t.key === 'vertice' ? (d.promoted || (t.label.indexOf('scudetto') !== -1 ? 1 : 4))
      : t.key === 'playoff' ? d.promoted + d.playoff
      : t.key === 'salvezza' ? d.teams - d.releg
      : d.releg ? d.teams - d.releg : Math.ceil(d.teams / 2);
    let status = '';
    if (S.table && S.played > 0) {
      const myPos = S.table.findIndex((r) => r.me) + 1;
      const me = S.table[myPos - 1], ref = S.table[line - 1], out = S.table[line];
      if (me && ref) {
        if (myPos <= line) {
          const margin = out ? me.pts - out.pts : 0;
          status = `<span class="ow-target-status ok">✓ In linea · ${margin > 0 ? margin + ' punt' + (margin === 1 ? 'o' : 'i') + ' di margine' : 'nessun margine'}</span>`;
        } else {
          const gap = ref.pts - me.pts;
          status = `<span class="ow-target-status bad">Fuori obiettivo · ${gap > 0 ? gap + ' punt' + (gap === 1 ? 'o' : 'i') + ' dalla ' + line + 'ª' : 'a pari punti con la ' + line + 'ª'}</span>`;
        }
      }
    }
    el.innerHTML = `<div class="ow-target"><span class="ow-target-pill ${t.key}">🎯 Obiettivo: ${t.label}</span>${status}</div>`;
  }

  // Scouting report sul prossimo avversario: CLUB_PERSONALITIES (data.js) esiste già e
  // "legge" le tue istruzioni tattiche dentro simMatch, ma prima il giocatore non lo sapeva
  // mai in anticipo — le scelte tattiche erano informate solo a posteriori (dal risultato).
  // Nessun calcolo nuovo: solo mostrare dati già presenti su ctx.opps prima del fischio
  // d'inizio invece che lasciarli usati solo internamente dal motore.
  function renderScouting() {
    const el = $('owScouting'); if (!el) return;
    if (S._playoffState && !S._playoffState.done) { el.innerHTML = ''; return; }
    if (!S.seasonActive || S.played >= gp() || !S.fixtures || !S.opps) { el.innerHTML = ''; return; }
    const fx = S.fixtures[S.played];
    const opp = fx && S.opps[fx.opp];
    if (!opp) { el.innerHTML = ''; return; }
    const def = CLUB_PERSONALITIES[opp.personality];
    const isRival = isDerby(S.club, opp.name) || (S.rivalries && S.rivalries.indexOf(opp.name) !== -1);
    // La scheda avversario ora serve a qualcosa: dice se le TUE istruzioni tattiche gli fanno
    // comodo e permette di adattarle qui, partita per partita, senza tornare in Dirigenza.
    const style = S.tacticStyle || DEFAULT_TACTIC_STYLE;
    const punished = !!(def && def.punishes(style));
    const tacticLabel = (st) => 'pressing ' + TACTIC_PRESS[st.press].label.toLowerCase() + ' · gioco ' + TACTIC_WIDTH[st.width].label.toLowerCase() + ' · ritmo ' + TACTIC_TEMPO[st.tempo].label.toLowerCase();
    const tacticTxt = tacticLabel(style);
    el.innerHTML = `<div class="ow-scout-card${punished ? ' warn' : ''}">
      <div class="ow-scout-row"><span>${fx.home ? '🏠 Prossima in casa vs' : '✈️ Prossima in trasferta vs'} <b>${escapeHtml(opp.name)}</b>${isRival ? ' <span title="Rivalità sentita">🔥</span>' : ''}</span></div>
      ${def ? `<div class="ow-scout-row ow-scout-report"><span>${def.icon} ${def.label}</span><small>${def.desc}</small></div>` : ''}
      ${def ? `<div class="ow-scout-row ow-scout-tactic"><small>La tua tattica: <b>${tacticTxt}</b></small>${punished
        ? `<div class="ow-scout-adapt"><span>⚠️ Così gli fai un favore</span><button type="button" class="dyn-mini" id="owAdaptTactic">Adatta la tattica</button></div>`
        : '<span class="ow-scout-ok">✓ Nessun vantaggio per loro</span>'}</div>` : ''}
    </div>`;
    const adapt = $('owAdaptTactic');
    if (adapt) adapt.onclick = () => {
      // Torna alla scelta neutra solo sulla voce che l'avversario punisce, una alla volta.
      const next = { ...style };
      for (const g of ['press', 'tempo', 'width']) {
        if (!def.punishes(next)) break;
        const trial = { ...next, [g]: DEFAULT_TACTIC_STYLE[g] };
        if (trial[g] !== next[g]) Object.assign(next, trial);
      }
      S.tacticStyle = next; saveGame(); renderScouting();
      toast('Tattica adattata: ' + tacticLabel(next));
      if (DynSound) DynSound.tap();
    };
  }

  // Digest a fine "Simula fino a fine stagione" (buildBulkDigest, sim.js): un piccolo
  // riepilogo invece di ripartire subito dalla board senza sapere cosa è successo.
  // Stesso riepilogo, ma quando "Simula" arriva fino all'ultima giornata: un riquadro in cima
  // alla fine stagione invece di un'altra finestra da chiudere.
  function showSeasonEndDigest(items) {
    const body = $('owSeasonEndBody'); if (!body || !items || !items.length) return;
    const old = body.querySelector('.ow-digest'); if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'ow-sec ow-digest';
    box.innerHTML = '<div class="ow-sec-title">📰 Le partite simulate</div>' + items.map((it) => '<div class="ow-fin-row"><span>' + it.icon + ' ' + escapeHtml(it.text) + '</span></div>').join('');
    const anchor = body.querySelector('.dyn-panel');
    if (anchor) body.insertBefore(box, anchor); else body.prepend(box);
  }

  function openBulkDigestOverlay(items) {
    overlay(`
      <div class="ow-event-modal">
        <div class="ow-event-icon">📰</div>
        <h2>Cosa è successo</h2>
        ${items.map((it) => `<p class="ow-sub" style="text-align:center">${it.icon} ${escapeHtml(it.text)}</p>`).join('')}
        <div class="dyn-modal-actions"><button type="button" class="dyn-btn dyn-btn-primary" id="ovDigestClose">Continua</button></div>
      </div>`);
    $('ovDigestClose').onclick = closeOverlay;
  }

  // Conferenza stampa pre-partita: solo prima dei big match (derby/rivalità, o posta in palio
  // nel finale di stagione — stessa soglia di seasonStakesBoost già usata per calibrare la
  // varianza in sim.js), con un tetto per stagione per restare un momento raro, non un click
  // extra ad ogni giornata qualunque. `go` è la chiamata a simMatch(), eseguita subito se non
  // c'è conferenza, altrimenti dopo la scelta. Solo single player: il flusso "un click, una
  // partita" (owNextBtn) non esiste in multiplayer, dove l'host avanza intere giornate in
  // blocco (stepHostMatchday) senza un checkpoint per-partita da poter mettere in pausa.
  function maybePressConference(go) {
    if (S.turboMode || !S.fixtures || !S.opps || S.played >= S.fixtures.length) { go(); return; }
    const fx = S.fixtures[S.played], opp = S.opps[fx.opp];
    if (!opp) { go(); return; }
    const isDerbyMatch = isDerby(S.club, opp.name) || (S.rivalries && S.rivalries.indexOf(opp.name) !== -1);
    const highStakes = seasonStakesBoost(S) > 1;
    if ((!isDerbyMatch && !highStakes) || (S._pressCountSeason || 0) >= 3 || !matchPopupAllowed(S)) { go(); return; }
    S._pressCountSeason = (S._pressCountSeason || 0) + 1; useMatchPopup(S);
    openPressConferenceOverlay(opp, isDerbyMatch, go);
  }

  function openPressConferenceOverlay(opp, isDerbyMatch, go) {
    overlay(`
      <div class="ow-event-modal">
        <div class="ow-event-icon">🎙️</div>
        <h2>Conferenza stampa</h2>
        <p>${isDerbyMatch ? 'Derby alle porte contro ' + escapeHtml(opp.name) + ': i microfoni sono tutti per te.' : 'Una partita che pesa contro ' + escapeHtml(opp.name) + ': i giornalisti vogliono sapere come la vivi.'} Cosa dici?</p>
        <div class="dyn-modal-actions">
          <button type="button" class="dyn-btn" data-press="cauto">😐 Resto con i piedi per terra</button>
          <button type="button" class="dyn-btn dyn-btn-primary" data-press="aggressivo">🔥 Andiamo a prenderci i 3 punti</button>
          <button type="button" class="dyn-btn" data-press="umile">🙏 Rispetto per l'avversario</button>
        </div>
      </div>`);
    $('owOverlayModal').querySelectorAll('[data-press]').forEach((btn) => btn.addEventListener('click', () => {
      const choice = btn.dataset.press;
      if (choice === 'aggressivo') { S.sent = clamp(S.sent + 2, 0, 100); S.ownerRating = clamp(S.ownerRating - 1, 0, 100); toast('La piazza si scalda: aspettative alte per stasera.', 'money'); }
      else if (choice === 'umile') { S.ownerRating = clamp(S.ownerRating + 1, 0, 100); toast('Un profilo basso: la proprietà apprezza.', 'success'); }
      else { toast('Nessun titolo di giornale oggi: giusto concentrarsi sul campo.'); }
      closeOverlay();
      saveGame();
      go();
    }));
  }

  function renderCups() {
    const wrap = $('owCups'); if (!S.cups) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = Object.entries(S.cups).map(([key, c]) => {
      const compClass = key === 'nat' ? 'nat' : (S.euroComp || '');
      const st = (c.won ? 'win' : c.out ? 'out' : '') + (compClass ? ' ' + compClass : '');
      let label;
      if (c.won) label = 'Vincitori';
      else if (c.out) label = c.phase === 'league' ? 'Eliminati nella fase campionato' : c.phase === 'playoff' ? 'Eliminati allo spareggio' : (c.rounds[c.at - 1] || 'Eliminati');
      else if (c.phase === 'league') label = 'Fase campionato: ' + (c.leaguePts || 0) + 'pt (' + c.leagueAt + '/' + c.legLen + ')';
      else if (c.phase === 'playoff') label = 'Spareggio ottavi';
      else label = c.at ? c.rounds[c.at - 1] : 'Iscritti';
      const clickable = key === 'euro' && (c.leaguePath && c.leaguePath.length);
      return `<span class="cup-pill ${st}${clickable ? ' clickable' : ''}" ${clickable ? 'data-euro-league="1" role="button" tabindex="0" title="Apri il percorso europeo"' : ''}>${c.name}: <b>${label}</b></span>`;
    }).join('');
    if (wrap.querySelector('[data-euro-league]')) wrap.querySelector('[data-euro-league]').onclick = showEuroLeagueTable;
  }

  // "Classifica" della fase a girone unico europea: non è un vero girone da 4 squadre con
  // avversari fissi (nel formato UEFA reale ogni squadra pesca avversari diversi), quindi
  // non esiste una tabella multi-club onesta da mostrare — si mostra invece il percorso
  // partita per partita del presidente, con la sua evoluzione punti e le soglie di
  // qualificazione (ottavi diretti / spareggio / eliminazione), utile quanto una classifica.
  function showEuroLeagueTable() {
    const cup = S.cups.euro; if (!cup) return;
    const ec = EURO_COMPS[S.euroComp];
    const top8 = cup.legLen === 6 ? 12 : 15, playoffLine = cup.legLen === 6 ? 6 : 9;
    const rows = (cup.leaguePath || []).map((r) => `<tr class="${r.res === 'W' ? 'me' : ''}"><td>G${r.mw} vs ${r.opp}</td><td class="num">${r.gf}-${r.ga}</td><td class="num">${r.ptsSoFar}</td></tr>`).join('');
    overlay(`<h2>${ec.flag} ${ec.name}</h2>
      <div class="ow-sub" style="text-align:center">Fase campionato: <b>${cup.leaguePts}pt</b> su ${cup.legLen} partite · ${top8}+pt ottavi diretti, ${playoffLine}+pt spareggio</div>
      <div style="max-height:52vh;overflow:auto;margin:8px -6px 14px">
        <table class="dyn-table"><thead><tr><th>Partita</th><th class="num">Risultato</th><th class="num">Pt</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
  }

  function logMatch(m) {
    const row = document.createElement('div'); row.className = 'mrow res-' + m.res;
    const usSc = fmtScorers(m.goalsFor), themSc = fmtScorers(m.goalsAgainst);
    const scorersHTML = (usSc || themSc) ? `<div class="mrow-scorers">
        ${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}
        ${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}
      </div>` : '';
    const eventsHTML = (m.events && m.events.length) ? `<div class="mrow-scorers">${m.events.map((ev) => `<div class="sc them">${ev.kind === 'inj' ? '🚑' : '🟥'} ${flagOf(ev)}${ev.n} ${ev.kind === 'inj' ? (ev.type === 'traumatic' ? 'infortunio serio, fuori ' : 'problema muscolare, fuori ') + ev.weeks + ' partit' + (ev.weeks === 1 ? 'a' : 'e') : 'squalificato per la prossima'}</div>`).join('')}</div>` : '';
    row.innerHTML = `<div class="mrow-mw">G${m.mw}</div>
      <div class="mrow-main"><div class="mrow-fix"><span class="ha ${m.home ? 'home' : 'away'}">${m.home ? 'C' : 'T'}</span> vs ${m.opp}${m.oppPersonality && CLUB_PERSONALITIES[m.oppPersonality] ? ` <span title="${CLUB_PERSONALITIES[m.oppPersonality].desc}">${CLUB_PERSONALITIES[m.oppPersonality].icon}</span>` : ''}${m.derby ? ` <span class="mrow-derby" title="Bilancio testa a testa in questa rivalità, da quando la segui">🔥 DERBY${m.derbyRecord ? ' (' + m.derbyRecord.w + 'V ' + m.derbyRecord.d + 'N ' + m.derbyRecord.l + 'P)' : ''}</span>` : ''}</div>${scorersHTML}${eventsHTML}</div>
      <div class="mrow-res ${m.res}">${m.gf}-${m.ga}</div>`;
    $('owLog').prepend(row);
    announceLive('Giornata ' + m.mw + ': ' + (m.res === 'W' ? 'vittoria' : m.res === 'L' ? 'sconfitta' : 'pareggio') + ' ' + m.gf + ' a ' + m.ga + ' contro ' + m.opp + '.');
  }

  // Icona + classe colore per la competizione di una riga del log: ogni coppa ha la stessa
  // tinta usata già nei pallini sopra il log (dyn-cups), così il colpo d'occhio è coerente.
  const COMP_ICON = { nat: '🇮🇹', ucl: '🌍', uel: '🟠', conf: '🟢' };
  function compBadge(compKey) {
    if (!compKey) return '';
    const icon = COMP_ICON[compKey] || '';
    return icon ? '<span class="mrow-comp-ico">' + icon + '</span>' : '';
  }
  function compClass(compKey) { return compKey ? ' comp-' + compKey : ''; }

  // Partita di girone europeo: a differenza di logCup non è "passa/eliminato" ma un
  // risultato con punteggio di classifica, perché nella fase a gironi si può anche pareggiare.
  function logEuroGroup(name, round, res, gf, ga, goalsFor, goalsAgainst, oppName, ptsSoFar, compKey) {
    const row = document.createElement('div'); row.className = 'mrow cup' + compClass(compKey);
    const usSc = fmtScorers(goalsFor), themSc = fmtScorers(goalsAgainst);
    const scorersHTML = (usSc || themSc) ? `<div class="mrow-scorers">
        ${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}
        ${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}
      </div>` : '';
    const label = res === 'W' ? 'Vittoria' : res === 'D' ? 'Pareggio' : 'Sconfitta';
    row.innerHTML = `<div class="mrow-mw">${compBadge(compKey)}${name.split(' ')[0]}</div>
      <div class="mrow-main"><div class="mrow-fix">${name} ${round} <span class="ha">vs ${oppName}</span></div><div class="mrow-you">${label} · ${ptsSoFar} pt nel girone</div>${scorersHTML}</div>
      <div class="mrow-res ${res}">${gf}-${ga}</div>`;
    $('owLog').prepend(row);
  }

  // Una singola gara di un doppio confronto (andata/ritorno, come ottavi/quarti/semifinale
  // e lo spareggio pre-ottavi nel formato UEFA reale): solo il punteggio, senza verdetto
  // "passa/eliminato" perché quello si decide sull'aggregato, loggato subito dopo con logCup.
  function logCupLeg(name, round, legLabel, gf, ga, goalsFor, goalsAgainst, oppName, compKey) {
    const row = document.createElement('div'); row.className = 'mrow cup leg' + compClass(compKey);
    const usSc = fmtScorers(goalsFor), themSc = fmtScorers(goalsAgainst);
    const scorersHTML = (usSc || themSc) ? `<div class="mrow-scorers">
        ${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}
        ${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}
      </div>` : '';
    row.innerHTML = `<div class="mrow-mw">${compBadge(compKey)}${name.split(' ')[0]}</div>
      <div class="mrow-main"><div class="mrow-fix">${name} ${round} · ${legLabel} <span class="ha">vs ${oppName}</span></div>${scorersHTML}</div>
      <div class="mrow-res">${gf}-${ga}</div>`;
    $('owLog').prepend(row);
  }

  function logCup(name, round, won, gf, ga, goalsFor, goalsAgainst, oppName, compKey) {
    const row = document.createElement('div'); row.className = 'mrow cup' + compClass(compKey);
    const usSc = fmtScorers(goalsFor), themSc = fmtScorers(goalsAgainst);
    const scorersHTML = (usSc || themSc) ? `<div class="mrow-scorers">
        ${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}
        ${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}
      </div>` : '';
    row.innerHTML = `<div class="mrow-mw">${compBadge(compKey)}${name.split(' ')[0]}</div>
      <div class="mrow-main"><div class="mrow-fix">${name} ${round}${oppName ? ' <span class="ha">vs ' + oppName + '</span>' : ''}</div><div class="mrow-you">${won ? (gf === ga ? 'Passa ai rigori' : 'Passa il turno') : (gf === ga ? 'Eliminato ai rigori' : 'Eliminato')}</div>${scorersHTML}</div>
      <div class="mrow-res ${won ? 'W' : 'L'}">${gf}-${ga}</div>`;
    $('owLog').prepend(row);
  }

  // Una gara/gamba di playoff (playNextPlayoffStep, sim.js), loggata nello stesso stile delle
  // coppe: una gamba di andata/ritorno mostra solo il punteggio (il verdetto arriva con la riga
  // "aggregato" subito dopo), una gara secca o il turno preliminare mostrano già l'esito.
  function logPlayoffEntry(m) {
    const row = document.createElement('div'); row.className = 'mrow cup';
    const usSc = fmtScorers(m.goalsFor || []), themSc = fmtScorers(m.goalsAgainst || []);
    const scorersHTML = (usSc || themSc) ? `<div class="mrow-scorers">
        ${usSc ? '<div class="sc us">⚽ ' + usSc + '</div>' : ''}
        ${themSc ? '<div class="sc them">🥅 ' + themSc + '</div>' : ''}
      </div>` : '';
    if (m.leg) {
      row.innerHTML = `<div class="mrow-mw">🏟️ PO</div>
        <div class="mrow-main"><div class="mrow-fix">${m.stage} · ${m.leg} <span class="ha">vs ${m.opp}</span></div>${scorersHTML}</div>
        <div class="mrow-res">${m.gf}-${m.ga}</div>`;
    } else if (m.aggregate) {
      const note = m.tiebreak === 'pens' ? ' (rigori)' : m.tiebreak === 'seed' ? ' (meglio piazzato)' : m.tiebreak === 'dr' ? ' (differenza reti)' : '';
      row.innerHTML = `<div class="mrow-mw">🏟️ PO</div>
        <div class="mrow-main"><div class="mrow-fix">${m.stage} <span class="ha">vs ${m.opp}</span></div><div class="mrow-you">${m.won ? 'Passa il turno' : 'Eliminato'}${note}</div></div>
        <div class="mrow-res ${m.won ? 'W' : 'L'}">${m.gf}-${m.ga}</div>`;
    } else {
      const note = m.extra ? ' (supplementari)' : m.seedWin ? ' (meglio piazzato)' : m.pens ? ' (rigori)' : '';
      row.innerHTML = `<div class="mrow-mw">🏟️ PO</div>
        <div class="mrow-main"><div class="mrow-fix">${m.stage} <span class="ha">vs ${m.opp}</span></div><div class="mrow-you">${m.won ? 'Vince' : 'Eliminato'}${note}</div>${scorersHTML}</div>
        <div class="mrow-res ${m.won ? 'W' : 'L'}">${m.gf}-${m.ga}</div>`;
    }
    $('owLog').prepend(row);
  }

  // Un click su "Gioca la prossima gara di playoff": una sola gara/gamba per chiamata
  // (playNextPlayoffStep, sim.js), loggata subito. Quando la coda si esaurisce (vittoria della
  // finale o eliminazione), richiama endSeason: la seconda chiamata trova ctx._playoffState.done
  // e completa il resoconto di fine stagione da lì (vedi sim.js).
  function playNextPlayoffStepUI() {
    const res = playNextPlayoffStep(S);
    if (!res) return;
    if (res.entry) logPlayoffEntry(res.entry);
    if (DynSound && res.entry && res.entry.gf > 0) DynSound.goal();
    if (res.done) { if (DynSound) DynSound.whistle(); endSeason(S); return; }
    saveGame();
    renderHud(); renderSeasonTarget();
  }

  // Niente più "Media" (punti a partita) riga per riga: con un solo divisore condiviso
  // (le partite giocate DA TE) applicato al punteggio di squadre che magari non hanno nemmeno
  // giocato lo stesso numero di gare in quel preciso istante, il numero era più fuorviante che
  // utile per gli avversari. La propria media, quella vera, si trova ora nel resoconto di fine
  // carriera (renderEnd, stagione per stagione) insieme all'allenatore di quella stagione.
  function tableHTML() {
    const d = divOf();
    // Posizione in una colonna sua (numeri incolonnati), allenatore sotto il nome invece che
    // in una quarta colonna: a 375px quattro colonne mandavano a capo sia i nomi sia i mister.
    // Giocate/Vinte/Nulle/Perse (e gol fatti:subiti dove c'è spazio) arrivano da computeTable
    // (sim.js). Una classifica congelata da un salvataggio vecchio può non averle (null): in
    // quel caso le colonne spariscono per intero, non si mostrano trattini a metà tabella.
    const full = S.table.length > 0 && S.table.every((t) => t.played != null && t.w != null && t.d != null && t.l != null);
    const goals = full && S.table.every((t) => t.gf != null && t.ga != null);
    return `<table class="dyn-table${full ? ' full' : ''}"><thead><tr><th scope="col"><span class="sr-only">Posizione</span>#</th><th scope="col">Squadra</th><th scope="col" class="num" title="Punti">Pt</th>${full ? '<th scope="col" class="num st" title="Partite giocate">G</th><th scope="col" class="num st" title="Vinte">V</th><th scope="col" class="num st" title="Nulle (pareggi)">N</th><th scope="col" class="num st" title="Perse">P</th>' : ''}${goals ? '<th scope="col" class="num tgoals" title="Gol fatti : gol subiti">GF:GS</th>' : ''}<th scope="col" class="num" title="Differenza reti">DR</th></tr></thead><tbody>${S.table.map((t, i) => {
      const zone = (d.euroSpots && i < d.euroSpots) ? 'ucl' : (d.uelSpots && i >= d.euroSpots && i < d.euroSpots + d.uelSpots) ? 'uel' : (d.confPos && i === d.confPos - 1) ? 'conf' : (d.promoted && i < d.promoted) ? 'ucl' : (d.playoff && i >= d.promoted && i < d.promoted + d.playoff) ? 'po' : (d.releg && i >= d.teams - d.releg) ? 'rel' : '';
      return `<tr class="${t.me ? 'me' : ''} ${zone}"${t.me ? ' aria-current="true"' : ''}><td class="pos">${i + 1}</td><td class="tname">${t.name}${t.mgr ? '<small>' + t.mgr.n + '</small>' : ''}</td><td class="num pts">${t.pts}</td>${full ? `<td class="num st">${t.played}</td><td class="num st">${t.w}</td><td class="num st">${t.d}</td><td class="num st">${t.l}</td>` : ''}${goals ? `<td class="num tgoals">${t.gf}:${t.ga}</td>` : ''}<td class="num">${t.gd > 0 ? '+' : ''}${t.gd}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function showTable() {
    computeTable();
    const d = divOf();
    const key = [d.euroSpots ? '<span style="color:var(--dyn)">▎Champions League</span>' : '', d.uelSpots ? '<span style="color:var(--gold)">▎Europa League</span>' : '', d.confPos ? '<span style="color:var(--good)">▎Conference League</span>' : '', d.promoted ? '<span style="color:var(--dyn)">▎promozione</span>' : '', d.playoff ? '<span style="color:var(--gold)">▎playoff</span>' : '', d.releg ? '<span style="color:var(--bad)">▎retrocessione</span>' : ''].filter(Boolean).join(' &nbsp; ');
    overlay(`<h2>${d.name}</h2><div class="ow-sub" style="text-align:center">${key}</div><div style="max-height:62vh;overflow:auto;margin:-6px -6px 14px">${tableHTML()}</div><div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
    // In una categoria da 20+ squadre la propria riga può essere fuori dal riquadro: la si porta
    // al centro, così "dove sono?" ha risposta senza scorrere.
    const meRow = $('owOverlayModal').querySelector('tr.me');
    if (meRow && meRow.scrollIntoView) meRow.scrollIntoView({ block: 'center' });
  }

  // Bacheca trofei: richiamabile in ogni momento dal topbar (non solo nel riepilogo di
  // fine carriera), con il totale per competizione e lo storico stagione per stagione.
  function showTrophyCase(tab) {
    tab = tab === 'traguardi' ? 'traguardi' : 'trofei';
    if (!S || !S.trophies) {
      overlay(`<h2>🏆 Bacheca trofei</h2><p class="ow-sub" style="text-align:center">Nessuna carriera attiva al momento.</p><div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
      $('ovClose').onclick = closeOverlay;
      return;
    }
    const tabsHTML = `<div class="dyn-modal-actions" style="gap:6px;margin-bottom:10px">
        <button class="dyn-btn${tab === 'trofei' ? ' dyn-btn-primary' : ''}" id="ovTabTrofei">🏆 Trofei</button>
        <button class="dyn-btn${tab === 'traguardi' ? ' dyn-btn-primary' : ''}" id="ovTabTraguardi">🏅 Traguardi</button>
      </div>`;
    let bodyHTML;
    if (tab === 'traguardi') {
      const unlocked = S.achievements || [];
      const sorted = ACHIEVEMENTS.slice().sort((a, b) => (unlocked.indexOf(b.key) !== -1) - (unlocked.indexOf(a.key) !== -1));
      bodyHTML = `<div class="ow-sub" style="text-align:center">${unlocked.length}/${ACHIEVEMENTS.length} traguardi sbloccati con ${S.club}</div>
      <div style="max-height:52vh;overflow:auto;margin:10px -6px 4px">
        ${sorted.map((a) => {
          const done = unlocked.indexOf(a.key) !== -1;
          return `<div class="ow-fin-row"${done ? '' : ' style="opacity:.5"'}><span>${done ? a.icon : '🔒'} ${a.title}<small style="display:block;color:var(--muted)">${a.desc}</small></span></div>`;
        }).join('')}
      </div>`;
    } else {
      const t = S.trophies;
      const rows = [];
      DIVS.forEach((d, i) => { if (t.titles[i]) rows.push(['🏆 ' + d.name + ' - Titolo', t.titles[i]]); });
      if (t.nat) rows.push(['🇮🇹 Coppa Italia', t.nat]);
      if (t.ucl) rows.push(['🌍 ' + EURO_COMPS.ucl.name, t.ucl]);
      if (t.uel) rows.push(['🟠 ' + EURO_COMPS.uel.name, t.uel]);
      if (t.conf) rows.push(['🟢 ' + EURO_COMPS.conf.name, t.conf]);
      const timeline = (S.history || []).filter((h) => h.trophies && h.trophies.length).slice().reverse();
      bodyHTML = `<div class="ow-sub" style="text-align:center">${t.total} trofe${t.total === 1 ? 'o' : 'i'} in ${S.season} stagion${S.season === 1 ? 'e' : 'i'} con ${S.club}</div>
      <div style="max-height:52vh;overflow:auto;margin:10px -6px 4px">
        ${rows.length ? rows.map((r) => `<div class="ow-fin-row"><span>${r[0]}</span><b class="good">${r[1]}×</b></div>`).join('') : '<div class="ow-sub" style="margin:14px 0">Ancora nessun trofeo: il momento buono arriverà.</div>'}
        ${timeline.length ? `<div class="ow-sec-title" style="margin-top:14px">Stagione per stagione</div>${timeline.map((h) => `<div class="ow-fin-row"><span>Stagione ${h.season} · ${h.div}</span><b class="good">${h.trophies.join(', ')}</b></div>`).join('')}` : ''}
      </div>`;
    }
    overlay(`<h2>${tab === 'traguardi' ? '🏅 Traguardi' : '🏆 Bacheca trofei'}</h2>
      ${tabsHTML}
      ${bodyHTML}
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = closeOverlay;
    $('ovTabTrofei').onclick = () => showTrophyCase('trofei');
    $('ovTabTraguardi').onclick = () => showTrophyCase('traguardi');
  }

  function showClub() {
    const worth = computeWorth();
    overlay(`
      <h2>${S.club}</h2>
      <div style="display:flex;justify-content:center;margin:2px 0 10px">${crestMarkup(S.crestShape, S.crestColors, 'ow-club-crest-preview')}</div>
      <div class="ow-fin-row"><span>Budget</span><b>${fmtMoney(S.budget)}</b></div>
      <div class="ow-fin-row"><span>Valore del club</span><b>${fmtMoney(worth)}</b></div>
      <div class="ow-fin-row"><span>Stadio</span><b>${capOf().toLocaleString('it-IT')} posti</b></div>
      ${meterHTML('Umore tifosi', S.sent, S.sent < 30)}
      ${meterHTML('Gradimento proprietario', S.ownerRating, S.ownerRating < 35)}
      <div class="dyn-modal-actions" style="margin-top:12px">
        <button class="dyn-btn" id="ovEditCrest">🎨 Modifica stemma</button>
        <button class="dyn-btn" id="ovClubRecords">📜 Primati del club</button>
        ${S.derbyRecord && Object.keys(S.derbyRecord).length ? '<button class="dyn-btn" id="ovDerbyHistory">🥊 Storico derby</button>' : ''}
        <button class="dyn-btn" id="ovSellNow">💷 Vendi per ${fmtMoney(worth)}</button>
        <button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button>
      </div>`);
    $('ovClose').onclick = closeOverlay;
    $('ovSellNow').onclick = () => { closeOverlay(); confirmSell(); };
    $('ovEditCrest').onclick = showCrestEditor;
    $('ovClubRecords').onclick = () => showClubRecords();
    const derbyBtn = $('ovDerbyHistory');
    if (derbyBtn) derbyBtn.onclick = showDerbyHistory;
  }

  // Primati del club (clubRecordsList, sim.js) e i migliori di sempre con questa maglia
  // (clubLegends: chi è in rosa più chi se n'è andato), per gol, presenze, assist o partite a
  // porta inviolata. Il motore li tiene aggiornati partita dopo partita; qui solo la vista.
  const LEGEND_BY = [['goals', '⚽ Gol'], ['apps', '🎽 Presenze'], ['assists', '👟 Assist'], ['cleanSheets', '🧤 Porta inviolata']];
  function showClubRecords(by) {
    by = LEGEND_BY.some((x) => x[0] === by) ? by : 'goals';
    const recs = clubRecordsList(S) || [], legends = clubLegends(S, by, 5) || [];
    overlay(`<h2>📜 Primati del club</h2>
      <div class="ow-sub" style="text-align:center">La storia di ${escapeHtml(S.club)} sotto la tua presidenza</div>
      <div class="ow-records-scroll">
        ${recs.length ? recs.map((r) => `<div class="ow-fin-row ow-rec"><span><span aria-hidden="true">${escapeHtml(r.icon)}</span> ${escapeHtml(r.label)}${r.detail ? '<small>' + escapeHtml(r.detail) + '</small>' : ''}</span><b>${escapeHtml(r.value)}</b></div>`).join('')
          : '<div class="ow-sub" style="margin:14px 0;text-align:center">Ancora nessun primato: si scrivono giocando. Torna qui dopo le prime partite.</div>'}
        <div class="ow-sec-title" style="margin:16px 0 8px;text-align:left">I migliori di sempre</div>
        <div class="ow-squad-filters" role="group" aria-label="Classifica per">${LEGEND_BY.map(([k, lbl]) => `<button type="button" class="ow-filter-pill ${by === k ? 'on' : ''}" aria-pressed="${by === k}" data-legend="${k}">${lbl}</button>`).join('')}</div>
        ${legends.length ? legends.map((x, i) => `<div class="ow-fin-row ow-rec"><span><span class="ow-rec-rank">${i + 1}</span> ${flagOf(x)}${escapeHtml(x.n)} <span class="postag postag-${escapeHtml(x.pos)}">${escapeHtml(x.pos)}</span>${x.current ? '' : '<small>ex giocatore</small>'}</span><b>${escapeHtml(x.v)}</b></div>`).join('')
          : '<div class="ow-sub" style="margin:10px 0">Nessuno ancora in questa classifica.</div>'}
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovRecBack" data-esc>← Il mio club</button></div>`);
    $('ovRecBack').onclick = showClub;
    $('owOverlayModal').querySelectorAll('[data-legend]').forEach((el) => el.addEventListener('click', () => {
      const keep = $('owOverlayModal').querySelector('.ow-records-scroll').scrollTop;
      showClubRecords(el.dataset.legend);
      const sc = $('owOverlayModal').querySelector('.ow-records-scroll'); if (sc) sc.scrollTop = keep;
      const cur = $('owOverlayModal').querySelector('[data-legend].on'); if (cur) cur.focus({ preventScroll: true });
    }));
  }

  // Il bilancio testa a testa di ogni derby storico (S.derbyRecord, sim.js: simMatch) esiste
  // già da tempo ma restava sepolto nel log partita: qui una vista dedicata, ordinata dal
  // derby più giocato al meno giocato.
  function showDerbyHistory() {
    const entries = Object.entries(S.derbyRecord || {}).sort((a, b) => (b[1].w + b[1].d + b[1].l) - (a[1].w + a[1].d + a[1].l));
    overlay(`<h2>🥊 Storico derby</h2>
      <div class="ow-sub" style="text-align:center">Bilancio testa a testa con ${S.club} contro le rivali storiche</div>
      <div style="max-height:58vh;overflow:auto;margin:10px -6px 4px">
        ${entries.length ? entries.map(([opp, r]) => `<div class="ow-fin-row"><span>${opp}</span><b>${r.w}V ${r.d}N ${r.l}P</b></div>`).join('') : '<div class="ow-sub" style="margin:14px 0">Nessun derby giocato ancora.</div>'}
      </div>
      <div class="dyn-modal-actions"><button class="dyn-btn dyn-btn-primary" id="ovClose">Chiudi</button></div>`);
    $('ovClose').onclick = () => { closeOverlay(); showClub(); };
  }

  // Riapre lo stesso editor visto in fase di creazione (forma + due colori), ma per il
  // club già in carriera: prima non c'era modo di rivedere lo stemma dopo averlo scelto.
  function showCrestEditor() {
    let shape = S.crestShape, colors = S.crestColors.slice();
    const syncPreview = () => {
      const wrap = $('editCrestPreview'); if (wrap) wrap.innerHTML = crestMarkup(shape, colors, 'setup-crest');
      $('owOverlayModal').querySelectorAll('.ow-crest-shape').forEach((el) => el.classList.toggle('on', el.dataset.shape === shape));
    };
    overlay(`
      <h2>Modifica stemma</h2>
      <span id="editCrestPreview" style="display:flex;justify-content:center;margin:2px 0 14px">${crestMarkup(shape, colors, 'setup-crest')}</span>
      <div class="ow-crest-picker">
        <div class="ow-crest-shapes">
          <button type="button" class="ow-crest-shape" data-shape="shield">Scudo</button>
          <button type="button" class="ow-crest-shape" data-shape="round">Tondo</button>
          <button type="button" class="ow-crest-shape" data-shape="hex">Esagono</button>
        </div>
        <div class="ow-crest-colors">
          <label class="ow-crest-swatch"><span>Primario</span><input type="color" id="editCrestColor1" value="${colors[0]}" /></label>
          <label class="ow-crest-swatch"><span>Secondario</span><input type="color" id="editCrestColor2" value="${colors[1]}" /></label>
        </div>
        <button type="button" class="ow-crest-reroll" id="editCrestReroll">🎲 Colori casuali</button>
      </div>
      <div class="dyn-modal-actions" style="margin-top:12px">
        <button class="dyn-btn dyn-btn-primary" id="ovCrestSave">Salva</button>
        <button class="dyn-btn" id="ovCrestCancel" data-esc>Annulla</button>
      </div>`);
    syncPreview();
    $('owOverlayModal').querySelectorAll('.ow-crest-shape').forEach((el) => el.addEventListener('click', () => { shape = el.dataset.shape; syncPreview(); }));
    $('editCrestColor1').addEventListener('input', (e) => { colors[0] = e.target.value; syncPreview(); });
    $('editCrestColor2').addEventListener('input', (e) => { colors[1] = e.target.value; syncPreview(); });
    $('editCrestReroll').addEventListener('click', () => { colors = randCrestColors(); $('editCrestColor1').value = colors[0]; $('editCrestColor2').value = colors[1]; syncPreview(); });
    $('ovCrestSave').onclick = () => { S.crestShape = shape; S.crestColors = colors; closeOverlay(); syncHomeCrest();
      // "Il mio club" si apre anche dalla schermata partite: renderBoard() qui riportava in
      // Dirigenza a campionato in corso (con "Inizia Stagione" di nuovo premibile). Si
      // ridisegna la board solo se è davvero la schermata in cui ci si trova.
      if (S._screen === 'owBoardScreen') renderBoard();
      saveGame(); toast('Nuovo stemma salvato.', 'success'); };
    $('ovCrestCancel').onclick = showClub;
  }

  /* ---------------- overlay / toast ---------------- */
  // Selettore dei soli elementi che possono ricevere il focus da tastiera, usato sia per il
  // focus iniziale sia per il focus trap qui sotto.
  const FOCUSABLE_SEL = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Chi aveva il focus PRIMA di aprire l'overlay, per restituirglielo alla chiusura — senza,
  // chi naviga da tastiera/screen reader si ritrova a ripartire dall'inizio della pagina ogni
  // volta che chiude un modale.
  let lastFocusedBeforeOverlay = null;
  let overlayFocusTrapBound = false;

  // Il modale non aveva alcun ruolo ARIA né gestione del focus: si apriva senza spostarcelo
  // dentro (uno screen reader restava "fuori"), non intrappolava Tab al suo interno (si poteva
  // tabulare nella pagina sottostante mentre il modale era aperto) e non lo restituiva alla
  // chiusura. Niente Escape-to-close qui apposta: alcuni overlay (es. lo spin dopo aver già
  // scalato il costo, o un evento narrativo a scelta obbligata) non hanno un'azione "annulla"
  // neutra — chiuderli da fuori lascerebbe lo stato a metà (costo scalato, nessuna scelta
  // applicata). Un tasto Escape "sicuro" richiederebbe marcare esplicitamente quali overlay
  // sono annullabili, fuori scope per questo fix mirato al solo focus.
  function overlay(html) {
    const modal = $('owOverlayModal');
    modal.innerHTML = html;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.tabIndex = -1;
    // Titolo del modale come nome accessibile del dialog (prima veniva annunciato "dialog" e basta).
    const h2 = modal.querySelector('h2');
    if (h2) { h2.id = 'owOverlayTitle'; modal.setAttribute('aria-labelledby', 'owOverlayTitle'); } else modal.removeAttribute('aria-labelledby');
    // Chi aveva il focus va ricordato solo quando si apre da chiuso: un modale che ne sostituisce
    // un altro (tutorial, passo dopo passo; conferma dentro "Il mio club") troverebbe come
    // "elemento precedente" un bottone del modale appena distrutto, e alla chiusura il focus
    // non tornerebbe più a chi aveva aperto il primo.
    if ($('owOverlay').classList.contains('hidden')) lastFocusedBeforeOverlay = document.activeElement;
    $('owOverlay').classList.remove('hidden');
    document.body.classList.add('ov-open');   // la pagina sotto non scorre mentre il modale è aperto
    syncUpdateNote();
    modal.scrollTop = 0;                      // un modale nuovo parte dall'inizio, non da dove era scorso il precedente
    const first = modal.querySelector(FOCUSABLE_SEL);
    (first || modal).focus({ preventScroll: true });
    bindOverlayFocusTrap();
  }

  function closeOverlay() {
    $('owOverlay').classList.add('hidden');
    document.body.classList.remove('ov-open');
    syncUpdateNote();
    const modal = $('owOverlayModal');
    modal.removeAttribute('role'); modal.removeAttribute('aria-modal');
    if (lastFocusedBeforeOverlay && document.body.contains(lastFocusedBeforeOverlay)) {
      lastFocusedBeforeOverlay.focus({ preventScroll: true });
    }
    lastFocusedBeforeOverlay = null;
  }

  // Tab/Shift+Tab restano dentro il modale finché è aperto, invece di uscire nella board
  // sottostante. Registrato una sola volta (stesso pattern di bindBoardDelegation): controlla
  // ad ogni pressione se l'overlay è visibile, quindi non serve ri-agganciarlo ad ogni overlay().
  function bindOverlayFocusTrap() {
    if (overlayFocusTrapBound) return;
    overlayFocusTrapBound = true;
    // Esc e tocco sullo sfondo chiudono SOLO i modali che hanno un'uscita neutra, e lo fanno
    // premendo proprio quel bottone: si considera "uscita neutra" un bottone il cui handler è
    // closeOverlay puro (Chiudi/Annulla/Non ora/Salta) oppure marcato data-esc. Così non serve
    // un elenco a mano di quali overlay sono annullabili (il motivo per cui Esc mancava): lo
    // spin già pagato, l'evento a scelta obbligata, il mercato di gennaio non hanno un bottone
    // del genere e restano chiudibili solo scegliendo, come prima.
    const dismissBtn = () => Array.from($('owOverlayModal').querySelectorAll('button')).find((b) => !b.disabled && (b.onclick === closeOverlay || b.hasAttribute('data-esc')));
    $('owOverlay').addEventListener('click', (ev) => {
      if (ev.target !== $('owOverlay')) return;
      const b = dismissBtn(); if (b) b.click();
    });
    document.addEventListener('keydown', (ev) => {
      const overlayEl = $('owOverlay');
      if (!overlayEl || overlayEl.classList.contains('hidden')) return;
      if (ev.key === 'Escape') { const b = dismissBtn(); if (b) { ev.preventDefault(); b.click(); } return; }
      if (ev.key !== 'Tab') return;
      const modal = $('owOverlayModal');
      // Focus finito fuori dal modale (es. l'elemento a fuoco è stato rimosso): lo si riporta dentro.
      if (!modal.contains(document.activeElement)) { ev.preventDefault(); (modal.querySelector(FOCUSABLE_SEL) || modal).focus(); return; }
      const focusables = Array.from(modal.querySelectorAll(FOCUSABLE_SEL));
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
  }

  // Se arriva un nuovo toast mentre uno è ancora visibile, lo sostituisce subito (niente
  // coda che rallenta): resta comunque a schermo abbastanza a lungo da poterlo leggere.
  let toastT = null;

  // `kind` è opzionale e sceglie un suono coerente col messaggio: 'money' (incasso),
  // 'spend' (pagamento), 'success' (conferma), 'error' (azione non valida/rete). Senza
  // `kind` il toast resta silenzioso come prima, per non riempire di suoni ogni messaggio.
  function toast(msg, kind) {
    const t = $('owToast');
    // Solo testo, mai markup: nei toast finiscono nomi di club e giocatori (anche altrui, in
    // multiplayer) e messaggi d'errore del server. Alcuni chiamanti passano già testo "escapato"
    // con escapeHtml: le cinque entità che produce tornano caratteri, così non si vede "&lt;".
    t.textContent = String(msg == null ? '' : msg).replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[m]));
    if (kind) t.dataset.kind = kind; else delete t.dataset.kind;   // bordo colorato per tipo (styles.css)
    t.classList.remove('hidden');
    // Un tocco lo chiude subito (registrato una volta sola): non si deve aspettare che sparisca.
    if (!t.dataset.bound) { t.dataset.bound = '1'; t.addEventListener('click', () => { clearTimeout(toastT); t.classList.add('hidden'); }); }
    clearTimeout(toastT);
    // Durata proporzionale alla lunghezza: 3,8s fissi erano troppi per "Passi." e troppo pochi
    // per i messaggi di tre righe (aumenti da promozione, contratti scaduti).
    const len = t.textContent.length;
    toastT = setTimeout(() => t.classList.add('hidden'), Math.max(2600, Math.min(7500, 1800 + len * 45)));
    if (DynSound && kind) {
      if (kind === 'money') DynSound.coin();
      else if (kind === 'spend') DynSound.cashOut();
      else if (kind === 'success') DynSound.chime();
      else if (kind === 'error') DynSound.error();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
