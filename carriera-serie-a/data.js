'use strict';
/* ============================================================
   Presidente · Serie A — data.js
   Dati statici del gioco: la piramide delle categorie, le rose reali usate
   come avversari, stadio/biglietti, i pool di nomi/nazionalità, i pesi per
   ruolo e le altre tabelle costanti. Nessuna logica di gioco né rendering:
   solo numeri e stringhe che sim.js e ui.js leggono.
   Caricato per primo (vedi index.html): sim.js e ui.js si aspettano che
   queste costanti esistano già nello scope globale.
   ============================================================ */

  /* ---------------- la piramide ---------------- */
  // Sei categorie, dal basso in alto. teams determina il numero di giornate ((teams-1)*2).
  // avg = il rating medio tipico della squadra in quella categoria (gli spin sono centrati lì).
  // demand = quanti tifosi verrebbero a vedere un club ben gestito a prezzi standard.
  // prize = base premio TV/montepremi di stagione, perPlace = extra per posizione scalata,
  // promoBonus arriva quando sali FUORI dalla categoria (quello della Serie B è
  // il "salto più ricco del calcio"), spin/premium = costo spin a quel livello.
  // Promozione secondo il sistema italiano reale (adattato): `promoted` salgono
  // direttamente e i successivi `playoff` posti si giocano UN posto extra a fine
  // stagione. Con `playoff` a 4 è un tabellone da 4 (semifinale + finale); con
  // `playoff` a 6, come la vera Serie B, è un tabellone da 6 (quarti fra i due
  // semi più bassi in classifica, poi semifinale con le teste di serie 3°/4°
  // già qualificate, poi finale). Eccellenza: prime 2 dirette.
  // Serie D: prime 3 + playoff (4°-7°), ultime 2 retrocedono. Serie C: prime 2 +
  // playoff (3°-6°), ultime 4 giù. Serie B: prime 2 + playoff (3°-8°, come nella
  // vera Serie B), ultime 3 giù. Serie A: ultime 3 giù. Promozione: come Eccellenza,
  // prime 2 dirette + playoff, nessuna retrocessione modellata sotto di lei.
  const DIVS = [
    { name: 'Promozione', teams: 24, avg: 48, demand: 2200, ticket: 9, prize: 0.06e6, perPlace: 3e3, promoted: 2, playoff: 4, releg: 0, promoBonus: 0.3e6, titleBonus: 0.12e6, spin: 40e3, premium: 120e3, cupBase: 18e3, admin: 60e3, mgrBase: 46, investor: 150e3 },
    { name: 'Eccellenza', teams: 24, avg: 55, demand: 4200, ticket: 14, prize: 0.15e6, perPlace: 6e3, promoted: 2, playoff: 4, releg: 3, promoBonus: 0.6e6, titleBonus: 0.25e6, spin: 75e3, premium: 225e3, cupBase: 35e3, admin: 120e3, mgrBase: 52, investor: 300e3 },
    { name: 'Serie D', teams: 24, avg: 62, demand: 7500, ticket: 17, prize: 1.0e6, perPlace: 15e3, promoted: 3, playoff: 4, releg: 2, promoBonus: 1.2e6, titleBonus: 0.5e6, spin: 200e3, premium: 600e3, cupBase: 70e3, admin: 250e3, mgrBase: 58, investor: 600e3 },
    { name: 'Serie C', teams: 24, avg: 68, demand: 13000, ticket: 21, prize: 1.6e6, perPlace: 25e3, promoted: 2, playoff: 4, releg: 4, promoBonus: 3e6, titleBonus: 1e6, spin: 500e3, premium: 2.5e6, cupBase: 140e3, admin: 450e3, mgrBase: 63, investor: 1.2e6 },
    // promoBonus riequilibrato: prima era 130e6 (quasi 4x il titleBonus di Serie A, 30e6, e più
    // del prize base di Serie A, 105e6) — un'iniezione sproporzionata rispetto a ogni altro
    // traguardo del gioco. 45e6 resta chiaramente il salto più ricco della piramide (riflette
    // il vero "paracadute" economico della promozione in A) senza eclissare tutto il resto.
    { name: 'Serie B', teams: 20, avg: 74, demand: 24000, ticket: 28, prize: 9e6, perPlace: 120e3, promoted: 2, playoff: 6, releg: 3, promoBonus: 45e6, titleBonus: 3e6, spin: 1.5e6, premium: 8e6, cupBase: 500e3, admin: 1.5e6, mgrBase: 69, investor: 5e6 },
    { name: 'Serie A', teams: 20, avg: 83, demand: 52000, ticket: 42, prize: 105e6, perPlace: 3.1e6, promoted: 0, playoff: 0, releg: 3, euroSpots: 4, uelSpots: 2, confPos: 7, promoBonus: 0, titleBonus: 30e6, spin: 6e6, premium: 30e6, cupBase: 2e6, admin: 6e6, mgrBase: 76, investor: 15e6 },
  ];

  // Calibrato sulle classifiche reali di Serie A e Serie B (medie 2023-24/2024-25): un Poisson
  // indipendente pareggia meno del vero calcio, di più quando la partita è "chiusa" (vittoria
  // di un solo gol). 0.12 avvicina il tasso di pareggio della A al ~28% reale; la B nella
  // realtà pareggia molto di più (~34%, calcio più tattico/equilibrato), da cui il boost extra.
  // Nessun dato reale per le categorie minori: restano al valore base della A.
  const RIVAL_DRAW_BOOST = [0.17, 0.17, 0.17, 0.17, 0.23, 0.17]; // Promozione..Serie A, stesso ordine di DIVS/POOLS

  // La Coppa Italia è UNA sola coppa, non sei tornei separati: nella realtà il tabellone
  // dei "grandi" (44 squadre fra Serie A/B/C) è preceduto da un intero percorso di turni
  // per chi parte dai dilettanti — chi è più in basso nella piramide deve semplicemente
  // superare più turni per arrivare alla stessa identica finale, esattamente come le
  // teste di serie di Serie A (le prime 8 dell'anno prima) entrano direttamente agli
  // ottavi mentre gli altri club entrano nei turni precedenti. Stesso trofeo in fondo al
  // percorso per tutti, solo il numero di ostacoli prima cambia con la categoria. Regola
  // reale 2024/25: gara secca fino agli ottavi, quarti e semifinale andata/ritorno,
  // finale gara secca in sede neutra (Stadio Olimpico) — qui replicata su MISURA per
  // ciascuna categoria (gli ultimi due turni prima della finale sono sempre quelli a
  // doppio confronto, quali che siano nel tabellone di quella categoria).
  const CUP_ROUNDS_BY_DIV = [
    ['Turno preliminare', 'Primo turno', 'Secondo turno', 'Trentaduesimi', 'Sedicesimi', 'Ottavi', 'Quarti', 'Semifinale', 'Finale'],
    ['Primo turno', 'Secondo turno', 'Trentaduesimi', 'Sedicesimi', 'Ottavi', 'Quarti', 'Semifinale', 'Finale'],
    ['Secondo turno', 'Trentaduesimi', 'Sedicesimi', 'Ottavi', 'Quarti', 'Semifinale', 'Finale'],
    ['Trentaduesimi', 'Sedicesimi', 'Ottavi', 'Quarti', 'Semifinale', 'Finale'],
    ['Sedicesimi', 'Ottavi', 'Quarti', 'Semifinale', 'Finale'],
    ['Ottavi', 'Quarti', 'Semifinale', 'Finale'],
  ];

  // Tetto massimo di overall raggiungibile con uno spin, per categoria: vale ALLO STESSO
  // MODO sia per i giocatori generati sia per quelli veri pescati dalle rose reali (vedi
  // spinPlayer in sim.js) — prima i giocatori veri erano di fatto limitati più in basso
  // (dalla fascia usata per cercarli) rispetto al tetto "ufficiale" applicato solo ai
  // generati, un'incoerenza. Stesso ordine di DIVS: Promozione…Serie A.
  const SPIN_CAPS = [
    { base: 64, premium: 76 },
    { base: 71, premium: 80 },
    { base: 78, premium: 85 },
    { base: 84, premium: 90 },
    { base: 90, premium: 95 },
    { base: 95, premium: 105 },
  ];

  // Il modulo scelto pesa davvero sulla partita: atk/def sono un piccolo delta aggiunto/
  // sottratto al numero atteso di gol fatti/subiti. Un modulo più offensivo (3-4-3) segna un
  // po' di più ma incassa un po' di più; uno più difensivo (5-3-2) il contrario. Il 4-3-3
  // resta il modulo "neutro" di riferimento. `need` è quanti giocatori per ruolo servono
  // davvero per schierarlo (usato sia da pickMatchLineup per chi scende in campo, sia da
  // formationFitMalus in sim.js: chi sceglie un modulo che la rosa non copre bene — es. un
  // 4-2-4 con un solo vero attaccante — gioca qualcuno fuori ruolo e ne paga un prezzo in
  // campo, non solo sulla carta).
  const FORMATION_TACTICS = {
    '433': { atk: 0, def: 0, need: { POR: 1, DIF: 4, CEN: 3, ATT: 3 } },
    '442': { atk: -0.03, def: -0.05, need: { POR: 1, DIF: 4, CEN: 4, ATT: 2 } },
    '352': { atk: 0.03, def: 0.04, need: { POR: 1, DIF: 3, CEN: 5, ATT: 2 } },
    '4231': { atk: 0.06, def: 0.02, need: { POR: 1, DIF: 4, CEN: 5, ATT: 1 } },
    '343': { atk: 0.14, def: 0.12, need: { POR: 1, DIF: 3, CEN: 4, ATT: 3 } },
    '532': { atk: -0.14, def: -0.12, need: { POR: 1, DIF: 5, CEN: 3, ATT: 2 } },
    '424': { atk: 0.22, def: 0.20, need: { POR: 1, DIF: 4, CEN: 2, ATT: 4 } },   // il più sbilanciato in avanti di tutti: 4 attaccanti, solo 2 mediani a coprire
  };

  // Istruzioni tattiche: tre leve indipendenti dal modulo, stessa convenzione di
  // FORMATION_TACTICS (atk = bonus ai gol fatti, def = quanto si incassa di più — quindi
  // NEGATIVO è più solido, non "peggiore"). `fatigue` è un costo aggiuntivo di affaticamento
  // (vedi rollAbsences in sim.js: un filo più rischio infortuni con pressing/ritmo alti), non
  // tocca il modulo/formazione, che restano scelte indipendenti e si sommano fra loro.
  const TACTIC_PRESS = {
    basso: { label: 'Basso', icon: '🐢', atk: -0.05, def: -0.07, fatigue: 0, desc: 'Si difende più bassi e compatti: meno gol fatti, meno gol subiti, squadra più fresca.' },
    medio: { label: 'Medio', icon: '⚖️', atk: 0, def: 0, fatigue: 0, desc: 'Equilibrio classico, nessun effetto particolare.' },
    alto: { label: 'Alto', icon: '🔥', atk: 0.08, def: 0.06, fatigue: 0.12, desc: 'Pressing aggressivo in avanti: più occasioni create e concesse, squadra più stanca.' },
  };
  const TACTIC_WIDTH = {
    stretta: { label: 'Stretta', icon: '➖', atk: -0.04, def: -0.05, fatigue: 0, desc: 'Gioco centrale e compatto: meno spazi in mezzo, ma anche meno ampiezza offensiva.' },
    bilanciata: { label: 'Bilanciata', icon: '⚖️', atk: 0, def: 0, fatigue: 0, desc: 'Equilibrio classico, nessun effetto particolare.' },
    larga: { label: 'Larga', icon: '↔️', atk: 0.06, def: 0.05, fatigue: 0, desc: 'Gioco sulle fasce, campo allargato: più occasioni da cross, ma corsie più scoperte in ripartenza.' },
  };
  const TACTIC_TEMPO = {
    basso: { label: 'Basso', icon: '🧊', atk: -0.04, def: -0.03, fatigue: -0.1, desc: 'Palleggio ragionato, ritmi bassi: partita più controllata, squadra si stanca meno.' },
    normale: { label: 'Normale', icon: '⚖️', atk: 0, def: 0, fatigue: 0, desc: 'Equilibrio classico, nessun effetto particolare.' },
    alto: { label: 'Alto', icon: '⚡', atk: 0.06, def: 0.04, fatigue: 0.18, desc: 'Ritmi altissimi, verticalizzazioni continue: partita spettacolare ma dispendiosa.' },
  };
  const DEFAULT_TACTIC_STYLE = { press: 'medio', width: 'bilanciata', tempo: 'normale' };

  // Personalità di club per i rivali (assegnata una volta sola per club, vedi
  // personalityFor in sim.js, persiste in POOLS per tutta la carriera): non solo un numero
  // di forza aggregato come prima, un'identità che "legge" le TUE istruzioni tattiche
  // (TACTIC_PRESS/WIDTH/TEMPO) e ti punisce un filo quando scegli l'approccio che sa
  // sfruttare meglio — vedi personalityCounter in sim.js.
  const CLUB_PERSONALITIES = {
    fisica: { label: 'Fisica', icon: '💪', desc: 'Squadra fisica e aggressiva: mette in difficoltà chi spinge su pressing o ritmo alti.', punishes: (t) => t.press === 'alto' || t.tempo === 'alto' },
    tecnica: { label: 'Tecnica', icon: '🎯', desc: 'Squadra tecnica e di qualità: brava a sfruttare gli spazi di un gioco troppo largo.', punishes: (t) => t.width === 'larga' },
    giovane: { label: 'Giovane', icon: '🌱', desc: 'Squadra giovane ed energica: corre più di chi si chiude troppo basso.', punishes: (t) => t.press === 'basso' },
  };

  // Eventi narrativi casuali: pura ambientazione fra una partita e l'altra (non toccano
  // rosa/infortuni/squalifiche, quelli restano gestiti dal motore partite), un piccolo
  // bump di umore/gradimento/budget per dare al gioco qualche "storia" oltre ai numeri di
  // bilancio. Un evento SENZA `choices` applica il suo effetto e si limita a un bottone
  // "Continua"; uno CON `choices` lascia scegliere fra 2 opzioni con esiti diversi, ed è
  // l'effetto della scelta (non un default) a essere applicato.
  const NARRATIVE_EVENTS = [
    { icon: '🔥', title: 'Striscione in curva', text: 'Un vecchio striscione della curva torna a sventolare prima della sfida più sentita: la squadra sente il calore del pubblico.', sent: 4 },
    { icon: '😠', title: 'Caso spogliatoio', text: 'Un piccolo caso spogliatoio tiene banco per qualche giorno prima di rientrare.', sent: -4 },
    { icon: '📣', title: 'Marcia dei tifosi', text: 'I tifosi organizzano una marcia di sostegno alla squadra alla vigilia di una partita delicata.', sent: 5 },
    { icon: '📰', title: 'Elogio della stampa', text: 'La stampa locale elogia la gestione economica del club.', sent: 2, budgetPct: 0.004 },
    {
      icon: '🚑', title: 'Allarme alla vigilia',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Un titolare') + ' si ferma precauzionalmente alla vigilia per un fastidio muscolare: lo staff medico preferisce non rischiare.',
      sent: -3,
    },
    { icon: '🌱', title: 'Il vivaio fa notizia', text: 'Il settore giovanile viene lodato in un articolo sulla stampa sportiva.', sent: 3 },
    { icon: '📺', title: 'Servizio TV', text: 'Un servizio TV racconta la crescita del club: la piazza si sente vista.', sent: 3 },
    { icon: '🏗️', title: 'Ritardi allo stadio', text: 'Ritardi nei lavori allo stadio fanno discutere i tifosi abbonati.', sent: -2 },
    {
      icon: '💰', title: 'Sirene di mercato',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan && p.age <= 24),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan && p.age <= 24).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => 'Un club più ricco fa la corte a ' + (ctx && ctx.player ? ctx.player.n : 'uno dei tuoi giovani migliori') + ': la piazza aspetta una tua parola.',
      choices: [
        { label: 'Rassicura pubblicamente i tifosi', sent: 4 },
        { label: 'Lascia correre le voci', sent: -3 },
      ],
    },
    {
      icon: '🤝', title: 'Offerta sponsor lampo',
      text: 'Uno sponsor locale offre un contributo una tantum per un\'iniziativa benefica legata al club.',
      choices: [
        { label: 'Accetta, i tifosi apprezzeranno', sent: 5, budgetPct: 0.008 },
        { label: 'Rifiuta, meglio restare indipendenti', sent: -1 },
      ],
    },
    {
      icon: '🟨', title: 'Polemica arbitrale',
      text: 'Le polemiche sull\'ultima direzione di gara infiammano il dibattito in città: la stampa aspetta una reazione del presidente.',
      choices: [
        { label: 'Attacca pubblicamente l\'arbitro', sent: 3, ownerRating: -2 },
        { label: 'Minimizza, testa bassa', sent: -1, ownerRating: 1 },
      ],
    },
    {
      icon: '🎽', title: 'Visita a sorpresa',
      text: 'Un ex giocatore del club, ora ritirato, si presenta a sorpresa agli allenamenti.',
      choices: [
        { label: 'Organizza un evento con i tifosi', sent: 5, budgetPct: -0.003 },
        { label: 'Una visita informale, niente di più', sent: 1 },
      ],
    },
    {
      icon: '🗞️', title: 'Cambio di proprietà nell\'aria',
      text: 'Le voci su un possibile cambio di proprietà agitano l\'ambiente per qualche giorno.',
      choices: [
        { label: 'Smentisci con una conferenza stampa', sent: 2, ownerRating: 2 },
        { label: 'Ignora le voci', sent: -3 },
      ],
    },
    {
      icon: '🎓', title: 'Talento del vivaio in pressing',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan && p.age <= 21),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan && p.age <= 21).sort((a, b) => a.age - b.age)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Un prodotto del settore giovanile') + ' chiede al mister maggiore spazio in prima squadra.',
      choices: [
        { label: 'Promettigli spazio nelle prossime partite', sent: 3 },
        { label: 'Chiedigli ancora un po\' di pazienza', sent: -2 },
      ],
    },
    {
      icon: '🎟️', title: 'Polemica sui prezzi dei biglietti',
      text: 'I tifosi protestano per il prezzo dei biglietti dell\'ultima trasferta.',
      choices: [
        { label: 'Scusati e promuovi un tetto ai prezzi', sent: 4, budgetPct: -0.005 },
        { label: 'Difendi la scelta commerciale', sent: -3, budgetPct: 0.004 },
      ],
    },
    {
      icon: '⚔️', title: 'Vigilia di derby',
      text: 'Il derby cittadino è alle porte e la tensione in città sale di ora in ora.',
      choices: [
        { label: 'Lancia un appello alla sportività', sent: 2, ownerRating: 1 },
        { label: 'Carica l\'ambiente con dichiarazioni piccanti', sent: 5, ownerRating: -2 },
      ],
    },
    {
      icon: '📸', title: 'Video virale imbarazzante',
      text: 'Un video di allenamento finito online mette in imbarazzo lo spogliatoio.',
      choices: [
        { label: 'Minimizza con ironia sui social', sent: 2 },
        { label: 'Convoca una riunione interna severa', sent: -2, ownerRating: 2 },
      ],
    },
    {
      icon: '🌧️', title: 'Il campo è da rifare',
      text: 'Il terreno di gioco è in condizioni pessime e i giocatori si lamentano apertamente.',
      choices: [
        { label: 'Investi subito in manutenzione', sent: 3, budgetPct: -0.01 },
        { label: 'Rimanda l\'intervento a fine stagione', sent: -3 },
      ],
    },
    {
      icon: '🎗️', title: 'Invito di beneficenza',
      text: 'Una onlus locale invita la squadra a disputare una partita di beneficenza.',
      choices: [
        { label: 'Accetta con entusiasmo', sent: 5, budgetPct: -0.002 },
        { label: 'Declina per il fitto calendario', sent: -1 },
      ],
    },
    {
      icon: '🕵️', title: 'Scout avversario in tribuna',
      text: 'Uno scout di un club rivale è stato avvistato allo stadio durante l\'ultimo allenamento.',
      choices: [
        { label: 'Blinda gli allenamenti agli estranei', ownerRating: 1 },
        { label: 'Non dare peso alla cosa', sent: -1 },
      ],
    },
    {
      icon: '🎂', title: 'Anniversario del club',
      text: 'Ricorre un anniversario storico della fondazione del club.',
      choices: [
        { label: 'Organizza una grande festa per i tifosi', sent: 6, budgetPct: -0.006 },
        { label: 'Una cerimonia sobria, senza spese', sent: 2 },
      ],
    },
    {
      icon: '🗯️', title: 'Giocatore nel mirino dei social',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Un big della rosa') + ' è bersaglio di critiche pesanti sui social dopo l\'ultima uscita.',
      choices: [
        { label: 'Difendilo pubblicamente', sent: 2, ownerRating: 1 },
        { label: 'Lascia correre senza commenti', sent: -2 },
      ],
    },
    {
      icon: '🏅', title: 'Premio alla carriera per il presidente',
      text: 'Un\'associazione imprenditoriale locale vuole conferirti un riconoscimento alla carriera.',
      choices: [
        { label: 'Accetta e usa il palco per parlare del club', sent: 3, ownerRating: 2 },
        { label: 'Rifiuta con umiltà, il merito è di tutti', ownerRating: 1 },
      ],
    },
    // ---- eventi che toccano leve diverse dal solo umore: tifoseria, prestigio, lo sponsor
    // in carica, o direttamente un giocatore preciso della rosa (con un vero rischio) ----
    { icon: '📱', title: 'Il club diventa virale', text: 'Un contenuto social del club fa il giro del web e porta nuovi tifosi.', fanbaseDelta: 0.02, sent: 3 },
    { icon: '🙊', title: 'Gaffe sui social ufficiali', text: 'Un post infelice dai canali ufficiali allontana alcuni simpatizzanti.', fanbaseDelta: -0.02, sent: -3 },
    { icon: '🎖️', title: 'Premio al settore giovanile', text: 'Il vivaio del club riceve un riconoscimento da un ente calcistico regionale.', prestige: 1e6, sent: 2 },
    {
      icon: '🌍', title: 'Riflettori internazionali',
      text: 'Una rivista sportiva internazionale vuole raccontare la storia del club.',
      choices: [
        { label: 'Concedi l\'intervista in esclusiva', prestige: 2e6, sent: 3 },
        { label: 'Declina, meglio la riservatezza', ownerRating: 1 },
      ],
    },
    {
      icon: '🤝', title: 'Lo sponsor chiede un incontro',
      requires: (S) => !!S.sponsor,
      text: (S) => S.sponsor.name + ' propone un rinnovo anticipato dell\'accordo attuale, a condizioni migliori per entrambi.',
      choices: [
        {
          label: 'Accetta il rinnovo anticipato',
          hint: '+2 umore, +10% incasso sponsor annuo, contratto rinnovato per intero',
          apply: (S) => {
            if (!S.sponsor) return;
            S.sponsor.perYear = Math.round(S.sponsor.perYear * 1.1 / 1e4) * 1e4;
            S.sponsor.left = S.sponsor.years;
            S.sent = clamp(S.sent + 2, 0, 100);
          },
        },
        { label: 'Aspetta la scadenza naturale', sent: 1 },
      ],
    },
    {
      icon: '🩹', title: 'Titolare acciaccato, vuole giocare',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Il tuo giocatore migliore') + ' è acciaccato ma vuole esserci nella prossima partita, nonostante il rischio.',
      choices: [
        {
          label: 'Fallo giocare titolare',
          hint: '30% di rischio infortunio (1-3 giornate, -4 umore), altrimenti +3 umore',
          apply: (S, ctx) => {
            const p = ctx && ctx.player; if (!p) return;
            if (Math.random() < 0.3) {
              p.outWeeks = Math.max(p.outWeeks || 0, 1 + rnd(3));
              S.sent = clamp(S.sent - 4, 0, 100);
              toast(p.n + ' si infortuna e salterà le prossime partite.');
            } else {
              S.sent = clamp(S.sent + 3, 0, 100);
            }
          },
        },
        { label: 'Tienilo precauzionalmente a riposo', sent: -1 },
      ],
    },
    // ---- altri dieci imprevisti, stesso mix di prima: alcuni a esito singolo, altri a
    // scelta, un paio legati a un giocatore preciso della rosa ----
    { icon: '⚽', title: 'Vittoria in amichevole a sorpresa', text: 'Un\'amichevole estiva contro una big finisce con un successo inatteso: la piazza ne parla per giorni.', sent: 4 },
    { icon: '💸', title: 'Ritardo nei pagamenti minori', text: 'Un fornitore lamenta un ritardo nei pagamenti: nulla di grave, ma la stampa locale ne fa un caso.', sent: -2, budgetPct: -0.003 },
    {
      icon: '🎂', title: 'Compleanno in gruppo',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan),
      build: (S) => ({ player: pick(S.squad.filter((p) => !p.loan)) }),
      text: (S, ctx) => 'Lo spogliatoio festeggia il compleanno di ' + (ctx && ctx.player ? ctx.player.n : 'un compagno') + ' con una piccola festa a sorpresa.',
      sent: 3,
    },
    {
      icon: '🎬', title: 'Un documentario sul club',
      text: 'Una produzione indipendente propone un documentario sulla stagione del club.',
      choices: [
        { label: 'Apri le porte alle telecamere', prestige: 1.5e6, sent: 2 },
        { label: 'Meglio restare riservati', ownerRating: 1 },
      ],
    },
    { icon: '🚌', title: 'Trasferta complicata', text: 'Uno sciopero dei trasporti rende difficile raggiungere lo stadio per l\'ultima trasferta: pochi tifosi al seguito.', sent: -2 },
    {
      icon: '🗣️', title: 'Discorso del capitano',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Il capitano') + ' tiene un discorso allo spogliatoio prima della sfida più difficile della stagione.',
      sent: 4,
    },
    {
      icon: '📵', title: 'Caso social nel settore giovanile',
      text: 'Un post polemico di un giovane del vivaio sui social fa discutere.',
      choices: [
        { label: 'Richiamo privato, si passa oltre', sent: -1 },
        { label: 'Comunicato ufficiale di scuse', sent: 2, ownerRating: -1 },
      ],
    },
    {
      icon: '🏟️', title: 'Naming rights per lo stadio',
      text: 'Un\'azienda locale propone di legare il proprio nome allo stadio per una stagione.',
      choices: [
        { label: 'Accetta l\'accordo', budgetPct: 0.01, sent: -2 },
        { label: 'Rifiuta, lo stadio resta suo', sent: 2 },
      ],
    },
    {
      icon: '😴', title: 'Un titolare chiede riposo',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Un titolare') + ' chiede di essere risparmiato nella prossima gara per stanchezza accumulata.',
      choices: [
        { label: 'Accontentalo', sent: 2 },
        { label: 'Chiedigli comunque il massimo', sent: -2 },
      ],
    },
    { icon: '🌟', title: 'Elogio dall\'estero', text: 'Una rivista sportiva straniera dedica un elogio al progetto tecnico del club.', prestige: 1e6, sent: 3 },
    // ---- altri venticinque imprevisti, per allargare il pool su una carriera di 20 stagioni
    // (con la stessa probabilità di innesco, un pool più ampio significa vederli ripetere
    // molto meno spesso) — stesso mix di sempre, nessuno con `apply` su misura oltre ai due
    // già esistenti, per restare tutti sicuri da auto-risolvere in multiplayer.
    { icon: '🎊', title: 'Festa promozione improvvisata', text: 'Un gruppo di tifosi organizza una festa spontanea sotto la sede del club dopo l\'ultimo risultato positivo.', sent: 5 },
    { icon: '🥶', title: 'Partita rinviata per neve', text: 'Il maltempo costringe a rinviare l\'ultima gara: qualche malumore fra gli abbonati per la trasferta sprecata.', sent: -2 },
    { icon: '📻', title: 'Intervista radiofonica riuscita', text: 'Un\'intervista del presidente a una radio locale viene accolta con favore dai tifosi.', sent: 3, ownerRating: 1 },
    {
      icon: '🧑‍🏫', title: 'Corso per giovani allenatori',
      text: 'Il club propone di ospitare un corso federale per giovani allenatori nel proprio centro sportivo.',
      choices: [
        { label: 'Ospitalo, ottima immagine per il club', prestige: 0.8e6, budgetPct: -0.002 },
        { label: 'Declina, servono gli spazi per la prima squadra', sent: -1 },
      ],
    },
    { icon: '🚏', title: 'Nuova linea bus per lo stadio', text: 'Il comune attiva una linea bus dedicata alle giornate di partita: più pubblico atteso.', fanbaseDelta: 0.015, sent: 2 },
    {
      icon: '🧤', title: 'Il portiere titolare in dubbio',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan && p.pos === 'POR'),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan && p.pos === 'POR').sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Il portiere titolare') + ' lamenta un fastidio alla mano dopo l\'ultimo allenamento.',
      sent: -2,
    },
    {
      icon: '🏆', title: 'Sorteggio di coppa avvincente',
      text: 'Il sorteggio del turno successivo regala un accoppiamento che fa sognare la piazza.',
      choices: [
        { label: 'Cavalca l\'entusiasmo in conferenza', sent: 4, ownerRating: 1 },
        { label: 'Abbassa le aspettative, testa bassa', ownerRating: 2 },
      ],
    },
    { icon: '🖼️', title: 'Murale in onore del club', text: 'Un artista di strada dipinge un murale dedicato al club nel quartiere dello stadio.', sent: 4, prestige: 0.4e6 },
    { icon: '📉', title: 'Calo di abbonamenti', text: 'I rinnovi degli abbonamenti procedono più a rilento del previsto quest\'anno.', sent: -3, fanbaseDelta: -0.01 },
    { icon: '📈', title: 'Boom di abbonamenti', text: 'La campagna abbonamenti va oltre ogni aspettativa: la tifoseria cresce.', sent: 3, fanbaseDelta: 0.015 },
    {
      icon: '🎮', title: 'Il club sbarca nell\'eSport',
      text: 'Una software house propone di inserire il club in un videogioco di calcio ufficiale.',
      choices: [
        { label: 'Accetta, nuova visibilità per il brand', prestige: 1e6, budgetPct: 0.003 },
        { label: 'Non è una priorità adesso', sent: -1 },
      ],
    },
    {
      icon: '🧳', title: 'Ritiro estivo in una nuova località',
      text: 'Lo staff propone di cambiare sede per il ritiro pre-campionato, più costosa ma meglio attrezzata.',
      choices: [
        { label: 'Approva la spesa extra', budgetPct: -0.006, sent: 3 },
        { label: 'Resta nella sede di sempre', sent: -1 },
      ],
    },
    { icon: '🎙️', title: 'Podcast dedicato ai tifosi', text: 'Alcuni tifosi lanciano un podcast settimanale sul club: la community si stringe attorno alla squadra.', sent: 3, fanbaseDelta: 0.01 },
    {
      icon: '🥊', title: 'Battibecco fra compagni',
      requires: (S) => S.squad && S.squad.filter((p) => !p.loan).length >= 2,
      build: (S) => { const pool = S.squad.filter((p) => !p.loan); return { a: pick(pool), b: pick(pool) }; },
      text: (S, ctx) => 'Un battibecco in allenamento fra ' + (ctx && ctx.a ? ctx.a.n : 'due compagni') + ' e un altro titolare tiene banco per un giorno prima di rientrare.',
      sent: -2,
    },
    { icon: '🏥', title: 'Donazione all\'ospedale cittadino', text: 'Il club dona parte degli incassi di una partita all\'ospedale cittadino: gesto molto apprezzato.', sent: 5, ownerRating: 2, budgetPct: -0.004 },
    {
      icon: '🎯', title: 'Il mister chiede rinforzi',
      text: 'L\'allenatore chiede pubblicamente rinforzi sul mercato per puntare più in alto.',
      choices: [
        { label: 'Promettigli supporto a gennaio', sent: 2 },
        { label: 'Ricordagli i conti del club', sent: -2, ownerRating: 1 },
      ],
    },
    { icon: '🌦️', title: 'Rinvio last minute', text: 'Un temporale improvviso rinvia la partita a pochi minuti dal fischio d\'inizio: caos organizzativo ma nessun danno.', sent: -1 },
    {
      icon: '🧵', title: 'Nuova maglia acclamata',
      text: 'La nuova maglia da trasferta conquista subito i tifosi sui social.',
      choices: [
        { label: 'Rifornisci lo store, richiesta alta', budgetPct: 0.006, sent: 2 },
        { label: 'Produzione limitata, meglio non rischiare', sent: -1 },
      ],
    },
    { icon: '🚨', title: 'Allarme meteo per la trasferta', text: 'Un\'allerta meteo complica i viaggi dei tifosi al seguito per l\'ultima trasferta.', sent: -1 },
    {
      icon: '🏫', title: 'Progetto scuole del club',
      text: 'Il settore giovanile propone un progetto di avviamento allo sport nelle scuole cittadine.',
      choices: [
        { label: 'Finanzia il progetto', budgetPct: -0.005, sent: 4, prestige: 0.5e6 },
        { label: 'Rimanda a stagione migliore', sent: -1 },
      ],
    },
    { icon: '🎤', title: 'Conferenza stampa tesa', text: 'Una domanda scomoda in conferenza stampa mette in difficoltà lo spogliatoio per qualche giorno.', sent: -2, ownerRating: -1 },
    { icon: '🤳', title: 'Sfida social fra tifoserie', text: 'Una simpatica sfida social con i tifosi di un\'altra piazza fa il giro del web.', sent: 3, fanbaseDelta: 0.01 },
    {
      icon: '💼', title: 'Offerta di co-sponsorizzazione',
      requires: (S) => !!S.sponsor,
      text: (S) => 'Un\'azienda propone un accordo di co-sponsorizzazione da affiancare a ' + S.sponsor.name + '.',
      choices: [
        { label: 'Accetta, entrate extra subito', budgetPct: 0.007, sent: -1 },
        { label: 'Rifiuta, meglio un solo main sponsor', sent: 2 },
      ],
    },
    { icon: '🧓', title: 'Ex bandiera in tribuna', text: 'Una vecchia bandiera del club, ora ritirata, assiste alla partita dalla tribuna d\'onore: standing ovation per lui.', sent: 4, prestige: 0.5e6 },
    { icon: '🛑', title: 'Sciopero dei tifosi organizzati', text: 'La curva organizzata annuncia una protesta silenziosa per la prossima partita.', sent: -4, ownerRating: -1 },
    {
      icon: '📝', title: 'Un club più ricco fa un\'offerta al tuo staff',
      // Un allenatore/DS chiaramente sopra il livello della categoria attira l'interesse di
      // chi può pagarlo di più: prima si controlla l'allenatore (il ruolo più visibile),
      // solo se non è lui abbastanza forte si guarda al direttore sportivo.
      requires: (S) => {
        const base = (DIVS[S.div] || {}).mgrBase || 70;
        return (S.manager && S.manager.rating >= base + 12) || (S.sportingDirector && S.sportingDirector.rating >= base + 8);
      },
      build: (S) => {
        const base = (DIVS[S.div] || {}).mgrBase || 70;
        return { role: (S.manager && S.manager.rating >= base + 12) ? 'manager' : 'ds' };
      },
      text: (S, ctx) => {
        const isManager = !ctx || ctx.role === 'manager';
        const person = isManager ? S.manager : S.sportingDirector;
        return 'Un club più prestigioso ha messo gli occhi su ' + (person ? person.n : 'un membro del tuo staff') + ' (' + (isManager ? 'il tuo allenatore' : 'il tuo direttore sportivo') + '): per trattenerlo serve un accordo migliore.';
      },
      choices: [
        {
          label: 'Trattienilo con un rinnovo migliore',
          hint: 'Stipendio +25% da subito',
          apply: (S, ctx) => {
            const isManager = !ctx || ctx.role === 'manager';
            const person = isManager ? S.manager : S.sportingDirector;
            if (!person) return;
            person.salary = Math.round(person.salary * 1.25 / 1e3) * 1e3;
            S.sent = clamp(S.sent + 2, 0, 100);
          },
        },
        {
          label: 'Lascialo andare',
          hint: 'Incassi un indennizzo, ma dovrai trovarne uno nuovo',
          apply: (S, ctx) => {
            const isManager = !ctx || ctx.role === 'manager';
            const person = isManager ? S.manager : S.sportingDirector;
            if (!person) return;
            S.budget += Math.round(person.salary * 0.6 / 1e3) * 1e3;
            if (isManager) {
              const base = (DIVS[S.div] || {}).mgrBase || 70;
              const r = clamp(base - 6 + rnd(10), 45, 90);
              const nat = pickNationality(S.div);
              S.manager = { n: genName(nat), rating: r, salary: mgrSalaryFor(r), nat, spec: pick(MANAGER_SPECS).key };
            } else {
              S.sportingDirector = null; S.dsOpts = null;
            }
            S.sent = clamp(S.sent - 2, 0, 100);
          },
        },
      ],
    },
    {
      icon: '🏥', title: 'Infortunio serio alla vigilia',
      // L'evento narrativo dedicato ai casi DAVVERO gravi (settimane, non partite): quelli
      // automatici di ogni giornata (rollAbsences, sim.js) restano muscolari/traumatici brevi,
      // qui invece c'è una vera scelta con un rischio reale, non solo un tiro a dadi silenzioso.
      requires: (S) => S.squad && S.squad.some((p) => !p.loan && !(p.outWeeks > 0)),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan && !(p.outWeeks > 0)).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n : 'Un titolare') + ' si ferma per un problema serio: lo staff medico propone due strade diverse per il recupero.',
      choices: [
        {
          label: 'Operare subito',
          hint: 'Stop lungo ma certo: fuori 10-14 settimane, nessun rischio di ricaduta',
          apply: (S, ctx) => {
            const p = ctx && ctx.player; if (!p) return;
            p.outWeeks = Math.max(p.outWeeks || 0, 10 + rnd(5));
            p._muscleRisk = 0;
            S.sent = clamp(S.sent - 2, 0, 100);
          },
        },
        {
          label: 'Terapie conservative',
          hint: 'Stop più corto (5-8 settimane), ma il 35% delle volte non basta e si allunga',
          apply: (S, ctx) => {
            const p = ctx && ctx.player; if (!p) return;
            let weeks = 5 + rnd(4);
            if (Math.random() < 0.35) { weeks += 6 + rnd(5); toast(p.n + ': la terapia conservativa non basta, lo stop si allunga.'); }
            p.outWeeks = Math.max(p.outWeeks || 0, weeks);
            S.sent = clamp(S.sent - 1, 0, 100);
          },
        },
      ],
    },
    {
      icon: '📝', title: 'Cessione imposta dalla proprietà',
      requires: (S) => S.squad && S.squad.filter((p) => !p.loan).length > MIN_SQUAD + 2,
      build: (S) => { const pool = S.squad.filter((p) => !p.loan).sort((a, b) => b.ovr - a.ovr); return { player: pool[Math.min(2, pool.length - 1)] }; },
      text: (S, ctx) => 'La proprietà chiede di cedere ' + (ctx && ctx.player ? ctx.player.n : 'un big della rosa') + ' per far quadrare i conti: un club è già pronto a chiudere in fretta, senza passare dal mercato vero e proprio.',
      choices: [
        {
          label: 'Accetta la cessione',
          hint: 'Incassi subito una cifra vicina al valore di mercato, ma il giocatore se ne va',
          apply: (S, ctx) => {
            const p = ctx && ctx.player; if (!p) return;
            const i = S.squad.findIndex((x) => x.pid === p.pid); if (i < 0) return;
            const fee = Math.round(playerValue(p) * (0.85 + Math.random() * 0.2));
            S.budget += fee;
            pushAlumnus(p, S);
            S.squad.splice(i, 1);
            S.sent = clamp(S.sent - 5, 0, 100);
            toast(p.n + ' ceduto per ' + fmtMoney(fee) + ': la proprietà è soddisfatta.', 'money');
          },
        },
        { label: 'Rifiuta, è incedibile', sent: 4, ownerRating: -3 },
      ],
    },
    {
      icon: '🎉', title: 'Colpo a sorpresa fuori sessione',
      requires: (S) => S.budget > 2e6 && S.squad && S.squad.length < 30,
      text: 'Un intermediario di fiducia segnala un\'occasione più unica che rara: un giocatore svincolato, chiaramente sopra la media della categoria, disposto a firmare subito — fuori da ogni finestra di mercato.',
      choices: [
        {
          label: 'Tesseralo subito',
          hint: 'Un giocatore via via più forte della media della categoria, stipendio normale',
          apply: (S) => {
            const d = DIVS[S.div] || {};
            const ovr = clamp((d.avg || 60) + 6 + rnd(8), (d.avg || 60), (d.avg || 60) + 16);
            const nat = pickNationality(S.div);
            const p = { n: genName(nat), nat, ovr, age: genAge(26, 4, 21, 32), wage: wageFor(ovr), yrs: 2 + rnd(2), pid: newPid(S), pos: randPos(S.squad, S), seasonGoals: 0, seasonAssists: 0, seasonCleanSheets: 0, seasonApps: 0 };
            S.squad.push(p);
            S.sent = clamp(S.sent + 3, 0, 100);
            toast(p.n + ' firma a parametro zero: un colpo davvero a sorpresa.', 'success');
          },
        },
        { label: 'Lascia perdere, rosa già definita', sent: -1 },
      ],
    },
    {
      icon: '⚠️', title: 'Crisi societaria vera',
      text: 'Voci sempre più insistenti parlano di una crisi di liquidità della proprietà: i tifosi chiedono chiarezza, la stampa non molla la presa.',
      choices: [
        {
          label: 'Convoca un\'assemblea pubblica con i tifosi',
          hint: 'Costi di gestione della crisi (-3% di budget), ma +4 gradimento se la affronti a viso aperto',
          apply: (S) => { S.budget = Math.round(S.budget * 0.97); S.ownerRating = clamp(S.ownerRating + 4, 0, 100); S.sent = clamp(S.sent - 2, 0, 100); },
        },
        { label: 'Nega tutto, tira dritto', sent: -6, ownerRating: -5 },
      ],
    },
    // ---- eventi a tema "attualità del calcio reale" (regolamenti, mercato, tecnologia):
    // stesso schema degli altri, solo ambientati su temi che cambiano davvero stagione
    // dopo stagione nel calcio vero, per rinfrescare periodicamente il pool. ----
    {
      icon: '📺', title: 'Nuova stagione di VAR',
      text: 'La Lega introduce un protocollo VAR più severo per questa stagione: revisioni più frequenti, tempi di attesa più lunghi. Il pubblico è diviso fra chi lo accoglie e chi lo detesta.',
      choices: [
        { label: 'Difendi pubblicamente la tecnologia', sent: 2, ownerRating: 1 },
        { label: 'Critica i tempi morti, come molti colleghi', sent: 3, ownerRating: -1 },
      ],
    },
    {
      icon: '📅', title: 'Calendario compresso',
      text: 'La federazione comprime il calendario per far spazio a un nuovo turno infrasettimanale: più partite ravvicinate da qui alla fine del girone.',
      apply: (S) => { S._congestion = (S._congestion || 0) + 1; },
    },
    {
      icon: '💼', title: 'Nuove regole di fair play finanziario',
      text: 'La Lega inasprisce i controlli sui conti dei club: chi supera certi parametri di spesa rispetto ai ricavi rischia penalizzazioni nelle prossime finestre di mercato.',
      choices: [
        { label: 'Adegua subito i conti, anche a costo di tagli', apply: (S) => { S.budget += narrativeBudgetDelta(S.budget, 0.015); S.sent = clamp(S.sent - 2, 0, 100); } },
        { label: 'Rischia, i controlli sono lenti', sent: 1, ownerRating: -2 },
      ],
    },
    {
      icon: '🌍', title: 'Nuova finestra di mercato estera',
      text: 'Cambia il regolamento sui trasferimenti internazionali: le squadre italiane possono ora tesserare più facilmente giovani promesse straniere. Gli osservatori di mezza Europa iniziano a girare per gli stadi minori.',
      sent: 1, prestige: 1e5,
    },
    {
      icon: '🎙️', title: 'Diritti TV in discussione',
      text: 'Si discute pubblicamente una revisione della ripartizione dei diritti TV fra i club, con più peso al merito sportivo e meno al bacino storico di tifosi.',
      choices: [
        { label: 'Sostieni la riforma: aiuterebbe chi cresce', sent: 2, ownerRating: 1 },
        { label: 'Difendi lo status quo, meno rischi', ownerRating: 1 },
      ],
    },
    // ---- eventi "di momento": compaiono solo quando la stagione li giustifica davvero (una
    // striscia di risultati, la classifica, i conti, l'infermeria), così quello che succede
    // fuori dal campo racconta la stagione che si sta giocando invece di pescare sempre dallo
    // stesso mazzo. Stesse regole degli altri: `requires` decide se l'evento è pescabile, ogni
    // scelta con `apply` ha il suo `hint`, e c'è sempre almeno una scelta a effetto semplice
    // (è quella usata in modalità veloce e in multiplayer, dove non si può scegliere). ----
    {
      icon: '🚀', title: 'Cinque vittorie di fila',
      requires: (S) => Array.isArray(S.last5) && S.last5.length === 5 && S.last5.every((r) => r === 1),
      text: 'Cinque successi consecutivi: in città non si parla d\'altro e lo spogliatoio chiede un riconoscimento.',
      choices: [
        { label: 'Premio partita a tutta la squadra', sent: 5, budgetPct: -0.006 },
        { label: 'Testa bassa: i conti si fanno a maggio', sent: 1, ownerRating: 2 },
      ],
    },
    {
      icon: '🧯', title: 'Crisi di risultati',
      requires: (S) => Array.isArray(S.last5) && S.last5.length === 5 && S.last5.reduce((a, b) => a + b, 0) <= -4,
      text: (S) => 'Quattro sconfitte nelle ultime cinque: la stampa chiede la testa di ' + (S.manager ? S.manager.n : 'chi siede in panchina') + ' e la curva aspetta un segnale.',
      choices: [
        { label: 'Conferma pubblica dell\'allenatore', sent: -2, ownerRating: 3 },
        { label: 'Ritiro punitivo per tutta la rosa', sent: 3, ownerRating: -2 },
      ],
    },
    {
      icon: '🎟️', title: 'Febbre da alta classifica',
      requires: (S) => S.played >= 10 && Array.isArray(S.table) && S.table.findIndex((r) => r.me) >= 0 && S.table.findIndex((r) => r.me) < 3,
      text: 'La squadra è stabilmente nelle prime tre posizioni: ai botteghini c\'è la fila e in città spuntano le bandiere ai balconi.',
      sent: 3, budgetPct: 0.006, fanbaseDelta: 0.01,
    },
    {
      icon: '📉', title: 'Aria di retrocessione',
      requires: (S) => { const d = DIVS[S.div]; if (!d || !d.releg || !(S.played >= 10) || !Array.isArray(S.table)) return false; const i = S.table.findIndex((r) => r.me); return i >= 0 && i + 1 > d.teams - d.releg; },
      text: 'La classifica piange e la zona retrocessione è una realtà: allo stadio compaiono i primi striscioni di contestazione.',
      choices: [
        { label: 'Scendi negli spogliatoi a parlare alla squadra', sent: 4, ownerRating: -1 },
        { label: 'Silenzio stampa fino a nuovo ordine', sent: -2, ownerRating: 1 },
      ],
    },
    {
      icon: '🏦', title: 'Creditori alla porta',
      requires: (S) => S.budget < 0,
      text: 'I conti in rosso non sono più un segreto: fornitori e banche chiedono garanzie, e la notizia arriva ai giornali.',
      choices: [
        { label: 'Colletta dei tifosi e dei soci storici', sent: -3, budgetPct: 0.1 },
        { label: 'Piano di rientro concordato con le banche', sent: -1, ownerRating: 2 },
      ],
    },
    {
      icon: '🧒', title: 'Il ragazzino che segna sempre',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan && p.age <= 21 && (p.seasonGoals || 0) >= 5),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan && p.age <= 21 && (p.seasonGoals || 0) >= 5).sort((a, b) => (b.seasonGoals || 0) - (a.seasonGoals || 0))[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n + ', ' + ctx.player.age + ' anni e già ' + ctx.player.seasonGoals + ' gol in stagione' : 'Un ragazzo del gruppo segna a raffica') + ': gli osservatori delle nazionali giovanili sono di casa al campo d\'allenamento.',
      sent: 3, fanbaseDelta: 0.01,
    },
    {
      icon: '🏟️', title: 'Tutto esaurito',
      requires: (S) => S.played >= 4 && estAttendanceFor(S.ticket, S).pct >= 0.99,
      text: 'Lo stadio è pieno da settimane e fuori dai cancelli resta sempre qualcuno senza biglietto.',
      choices: [
        { label: 'Maxischermo in piazza per chi resta fuori', sent: 4, budgetPct: -0.003, fanbaseDelta: 0.01 },
        { label: 'Ritocca i prezzi per le prossime gare', sent: -3, budgetPct: 0.008 },
      ],
    },
    {
      icon: '🚑', title: 'Infermeria piena',
      requires: (S) => S.squad && S.squad.filter((p) => p.outWeeks > 0).length >= 3,
      text: (S) => 'Gli infortunati sono ' + S.squad.filter((p) => p.outWeeks > 0).length + ' e lo staff medico non riesce a stare dietro a tutti.',
      choices: [
        {
          label: 'Chiama un consulente esterno',
          hint: 'Costa l\'1% della cassa: ogni infortunato rientra una partita prima',
          apply: (S) => {
            S.budget += narrativeBudgetDelta(S.budget, -0.01);
            S.squad.forEach((p) => { if (p.outWeeks > 0) p.outWeeks--; });
          },
        },
        { label: 'Ci si arrangia con chi c\'è', sent: -1 },
      ],
    },
    {
      icon: '⚖️', title: 'Ricorso contro la squalifica',
      requires: (S) => S.squad && S.squad.some((p) => p.suspMatches > 0),
      build: (S) => ({ player: S.squad.filter((p) => p.suspMatches > 0).sort((a, b) => b.ovr - a.ovr)[0] }),
      text: (S, ctx) => 'Il giudice sportivo ha fermato ' + (ctx && ctx.player ? ctx.player.n : 'un tuo giocatore') + ': i legali del club pensano che ci siano i margini per un ricorso.',
      choices: [
        {
          label: 'Presenta ricorso',
          hint: '50%: squalifica cancellata. Altrimenti -2 gradimento per la figuraccia',
          apply: (S, ctx) => {
            const p = ctx && ctx.player; if (!p) return;
            if (Math.random() < 0.5) { p.suspMatches = 0; toast('Ricorso accolto: ' + p.n + ' è subito a disposizione.', 'success'); }
            else { S.ownerRating = clamp(S.ownerRating - 2, 0, 100); toast('Ricorso respinto: la squalifica di ' + p.n + ' resta.', 'error'); }
          },
        },
        { label: 'Accetta la decisione', ownerRating: 1 },
      ],
    },
    {
      icon: '👴', title: 'L\'ultimo giro del veterano',
      requires: (S) => S.squad && S.squad.some((p) => !p.loan && p.age >= 34),
      build: (S) => ({ player: S.squad.filter((p) => !p.loan && p.age >= 34).sort((a, b) => b.age - a.age)[0] }),
      text: (S, ctx) => (ctx && ctx.player ? ctx.player.n + ', ' + ctx.player.age + ' anni,' : 'Il più anziano della rosa') + ' lascia intendere in un\'intervista che questa potrebbe essere la sua ultima stagione.',
      choices: [
        { label: 'Organizza una giornata in suo onore', sent: 4, budgetPct: -0.003 },
        { label: 'Se ne parlerà a fine stagione', sent: -1 },
      ],
    },
    {
      icon: '🏆', title: 'Aria di coppa',
      requires: (S) => !!(S.cups && S.cups.nat && !S.cups.nat.out && !S.cups.nat.won && S.cups.nat.at >= 2),
      text: (S) => 'Il cammino in Coppa Italia continua: per la piazza i ' + String(S.cups.nat.rounds[S.cups.nat.at] || 'prossimi turni').toLowerCase() + ' sono già l\'evento dell\'anno.',
      sent: 3, fanbaseDelta: 0.01,
    },
    {
      icon: '🔝', title: 'La rivale storica nel mirino',
      requires: (S) => Array.isArray(S.rivalries) && S.rivalries.length > 0 && Array.isArray(S.table) && S.table.some((r) => S.rivalries.indexOf(r.name) !== -1),
      build: (S) => ({ rival: S.table.filter((r) => S.rivalries.indexOf(r.name) !== -1)[0] }),
      text: (S, ctx) => 'In città si guarda solo una classifica: quella con ' + (ctx && ctx.rival ? ctx.rival.name : 'la rivale di sempre') + '. I tifosi vogliono chiudere davanti, costi quel che costi.',
      choices: [
        { label: 'Promettilo pubblicamente', sent: 4, ownerRating: -1 },
        { label: 'Una partita alla volta', ownerRating: 1 },
      ],
    },
  ];

  // Ogni allenatore (generato o candidato) ha una specializzazione, oltre al rating: un
  // piccolo tratto distintivo, non un moltiplicatore che rende uno strettamente più forte
  // di un altro.
  const MANAGER_SPECS = [
    { key: 'builder', label: 'Costruttore di giovani', icon: '🌱', desc: 'I suoi under 23 crescono un filo più in fretta a fine stagione.' },
    { key: 'motivator', label: 'Motivatore', icon: '🔥', desc: 'Dimezza il contraccolpo da doppia promozione consecutiva e tiene la squadra sul pezzo quando l\'umore è a terra.' },
    { key: 'tactician', label: 'Tattico', icon: '📋', desc: 'Un piccolo bonus di rendimento in campo, sempre.' },
    { key: 'medic', label: 'Preparatore di ferro', icon: '🩺', desc: 'Uno staff medico-atletico di alto livello: la rosa si infortuna e si squalifica un po\' meno spesso.' },
    { key: 'negotiator', label: 'Negoziatore', icon: '💬', desc: 'Sa trattare bene con i giocatori: i rinnovi di contratto costano un po\' meno.' },
  ];

  // Staff tecnico, secondo ruolo assumibile oltre l'allenatore: non tocca la squadra in campo,
  // solo il mercato in uscita (offerte che arrivano per i tuoi giocatori). Chiavi diverse da
  // MANAGER_SPECS di proposito, anche se lette da una lookup separata (dsSpecOf, ui.js): niente
  // ambiguità visiva fra "il negoziatore dell'allenatore" e questo.
  const DS_SPECS = [
    { key: 'sales_expert', label: 'Esperto di cessioni', icon: '💰', desc: 'Offerte in uscita più alte per i tuoi giocatori più richiesti.' },
    { key: 'scout_network', label: 'Rete di osservatori', icon: '🔭', desc: 'Più club rivali si fanno avanti per i tuoi giocatori migliori.' },
    { key: 'all_rounder', label: 'Uomo di fiducia', icon: '⚖️', desc: 'Nessuna specializzazione spiccata, ma costa un po\' meno.' },
  ];

  // Preparatore atletico: terzo ruolo di staff, opzionale come il direttore sportivo, ma
  // sul fisico della squadra invece che sul mercato in uscita — si somma (non sostituisce) al
  // manager "medic" e alla scelta tattica di ritmo/pressing per chi vuole spingere di più.
  const FITNESS_SPECS = [
    { key: 'recovery', label: 'Specialista del recupero', icon: '🩹', desc: 'Affaticamento da calendario congestionato ridotto sensibilmente.' },
    { key: 'injury_prevention', label: 'Prevenzione infortuni', icon: '🛡️', desc: 'Meno infortuni muscolari, in partita e per il pressing/ritmo alti.' },
    { key: 'peak_form', label: 'Preparazione di punta', icon: '📈', desc: 'La forma dei giocatori regredisce più lentamente verso la media dopo una prestazione.' },
  ];

  // Derby/rivalità storiche: coppie di nomi già presenti nei POOLS di qualche categoria
  // (vere per Serie A/B/C, plausibili per geografia nelle categorie con nomi di fantasia).
  // Il match conta come derby quando ENTRAMBI i nomi di una coppia si affrontano nella
  // stessa stagione — indipendentemente da quale POOLS li contiene in quel momento, dato
  // che la piramide viva può spostarli di categoria negli anni.
  const DERBIES = [
    ['Inter', 'Milan'], ['Roma', 'Lazio'], ['Torino', 'Juventus'],
    ['Avellino', 'Benevento'], ['Padova', 'Vicenza'], ['Salernitana', 'Cavese'],
    ['Perugia', 'Ternana'], ['Catania', 'Messina'],
    ['Frascati', 'Marino'], ['Fiumicino', 'Ostia Antica'],
    ['Anzio', 'Aprilia'], ['Formia', 'Gaeta'],
    ['Chieri', 'Bra'], ['Recanatese', 'Castelfidardo'],
  ];
  function isDerby(nameA, nameB) { return DERBIES.some(([a, b]) => (a === nameA && b === nameB) || (a === nameB && b === nameA)); }

  const WORTH_BASE = [1.5e6, 4e6, 10e6, 25e6, 90e6, 450e6];

  const TROPHY_WORTH = [0.25e6, 0.6e6, 1.5e6, 4e6, 20e6, 280e6];   // il valore di brand duraturo di uno scudetto/titolo, per categoria

  // Le tre coppe europee raggiungibili solo dalla Serie A: 1°-4° Champions League,
  // 5° Europa League, 6° Conference League. Ogni livello ha un montepremi, un premio
  // per turno superato, un bonus per la vittoria finale e una forza degli avversari
  // proporzionalmente più bassa scendendo di coppa.
  const EURO_COMPS = {
    ucl: { name: 'Champions League', flag: '🌍', entry: 40e6, roundWin: 15e6, titleBonus: 60e6, prestige: 320e6, oppBase: 78, attBoost: 1.08, qualPrestige: 25e6, qualBump: 5, gloryBump: 12, growWon: 0.03, growPlaying: 0.01, color: 'var(--dyn)' },
    uel: { name: 'Europa League', flag: '🟠', entry: 12e6, roundWin: 5e6, titleBonus: 20e6, prestige: 90e6, oppBase: 70, attBoost: 1.04, qualPrestige: 10e6, qualBump: 3, gloryBump: 8, growWon: 0.02, growPlaying: 0.007, color: 'var(--gold)' },
    conf: { name: 'Conference League', flag: '🟢', entry: 4e6, roundWin: 1.8e6, titleBonus: 8e6, prestige: 30e6, oppBase: 63, attBoost: 1.02, qualPrestige: 5e6, qualBump: 2, gloryBump: 5, growWon: 0.012, growPlaying: 0.004, color: 'var(--good)' },
  };

  // In che coppa entra una Serie A che chiude in questa posizione, o null se nessuna.
  function euroTierFor(pos) { return pos <= 4 ? 'ucl' : pos === 5 ? 'uel' : pos === 6 ? 'conf' : null; }

  const POOLS = [
    [ // Promozione (un gradino sotto l'Eccellenza). Valori `s` allargati (~+15% di scarto
      // dalla media, coda ulteriormente abbassata): anche le categorie minori vere sono
      // polarizzate — la Serie D 2024-25 ha visto un'ultima classificata chiudere con appena
      // 12 punti su 38 partite contro i ~76 di media dei campioni dei 9 gironi.
      { n: 'Torrenova', s: 56 }, { n: 'Palmarola', s: 55 }, { n: 'Casal Bernocchi', s: 55 }, { n: 'Ostia Antica', s: 54 },
      { n: 'Bufalotta', s: 54 }, { n: 'Fiumicino', s: 52 }, { n: 'Ardea', s: 52 }, { n: 'Cerveteri', s: 51 },
      { n: 'Nettuno', s: 51 }, { n: 'Velletri', s: 50 }, { n: 'Genzano', s: 50 }, { n: 'Marino', s: 50 },
      { n: 'Zagarolo', s: 49 }, { n: 'Palestrina', s: 49 }, { n: 'Frascati', s: 48 }, { n: 'Ciampino', s: 48 },
      { n: 'Monterotondo Scalo', s: 48 }, { n: 'Fonte Nuova', s: 47 }, { n: 'Mentana', s: 47 }, { n: 'Palombara', s: 45 },
      { n: 'Tivoli Terme', s: 45 }, { n: 'Vicovaro Alta', s: 42 }, { n: 'Subiaco', s: 40 }, { n: 'Cave', s: 36 },
    ],
    [ // Eccellenza — stesso criterio di allargamento di Promozione.
      { n: 'Nuova Florida', s: 64 }, { n: 'Vis Artena', s: 63 }, { n: 'Aurelia Antica', s: 62 }, { n: 'Boreale', s: 61 },
      { n: 'Grifone Gialloverde', s: 59 }, { n: 'Real Monterotondo', s: 59 }, { n: 'Palocco', s: 58 }, { n: 'Almas Roma', s: 58 },
      { n: 'Atletico Morena', s: 57 }, { n: 'San Basilio', s: 57 }, { n: 'Vicovaro', s: 56 }, { n: 'Guidonia Montecelio', s: 56 },
      { n: 'Colleferro', s: 55 }, { n: 'Anzio', s: 55 }, { n: 'Aprilia', s: 55 }, { n: 'Pomezia', s: 54 },
      { n: 'Cynthialbalonga', s: 54 }, { n: 'Ladispoli', s: 53 }, { n: 'Boca Fiumicino', s: 53 }, { n: 'Tor Sapienza', s: 51 },
      { n: 'Santa Marinella', s: 51 }, { n: 'Formia', s: 48 }, { n: 'Fondi', s: 46 }, { n: 'Gaeta', s: 43 },
    ],
    [ // Serie D — stesso criterio di allargamento.
      { n: 'Fiorenzuola', s: 70 }, { n: 'San Giuliano City', s: 69 }, { n: 'Chieri', s: 68 }, { n: 'Bra', s: 68 },
      { n: 'Derthona', s: 66 }, { n: 'Lavagnese', s: 66 }, { n: 'Legnago Salus', s: 66 }, { n: 'Ostiamare', s: 65 },
      { n: 'Sarnese', s: 64 }, { n: 'Nardò', s: 64 }, { n: 'Gravina', s: 64 }, { n: 'Fasano', s: 63 },
      { n: 'Nocerina', s: 63 }, { n: 'Gelbison', s: 62 }, { n: 'Manfredonia', s: 62 }, { n: 'Sancataldese', s: 61 },
      { n: 'Vigor Senigallia', s: 61 }, { n: 'Castelfidardo', s: 61 }, { n: 'Recanatese', s: 60 }, { n: 'Termoli', s: 60 },
      { n: 'Notaresco', s: 58 }, { n: 'Montevarchi', s: 56 }, { n: 'Poggibonsi', s: 54 }, { n: 'Trastevere', s: 50 },
    ],
    [ // Serie C — stesso criterio di allargamento. Nessun nome qui può comparire anche in un
      // altro girone: Padova, Vicenza, Avellino e Benevento erano elencate sia qui sia in Serie B
      // (dove giocano davvero nel 2026/27), e con la piramide viva finivano per incontrare il
      // proprio doppione nello stesso campionato — due "Padova" in classifica, e una stagione
      // con due giornate in meno (e un crash a fine calendario) per chi aveva scelto proprio
      // quel nome per il suo club. Sostituite da quattro piazze storiche di pari forza; i
      // salvataggi vecchi vengono ripuliti al caricamento (POOL_RENAMES qui sotto).
      { n: 'Salernitana', s: 77 }, { n: 'Cittadella', s: 76 }, { n: 'Triestina', s: 75 }, { n: 'Pescara', s: 74 },
      { n: 'Ternana', s: 74 }, { n: 'Perugia', s: 72 }, { n: 'Foggia', s: 72 }, { n: 'Cosenza', s: 71 },
      { n: 'Catania', s: 71 }, { n: 'Cavese', s: 70 }, { n: 'Casertana', s: 70 }, { n: 'Turris', s: 69 },
      { n: 'Monopoli', s: 69 }, { n: 'Picerno', s: 68 }, { n: 'Crotone', s: 68 }, { n: 'Taranto', s: 67 },
      { n: 'Latina', s: 67 }, { n: 'Giugliano', s: 66 }, { n: 'Sorrento', s: 66 }, { n: 'Potenza', s: 64 },
      { n: 'Cerignola', s: 64 }, { n: 'Messina', s: 61 }, { n: 'Trapani', s: 59 }, { n: 'Rimini', s: 55 },
    ],
    [ // Serie B (20 club reali stagione 2026/27, come il vero campionato). Valori `s` allargati
      // (~+18% di scarto dalla media) rispetto all'originale: le classifiche vere di Serie B
      // sono più larghe (dal 82 del primo al 30 dell'ultima nel 2024-25) di quanto un girone
      // troppo compatto producesse, pur restando un campionato molto più equilibrato della A.
      { n: 'Verona', s: 84 }, { n: 'Empoli', s: 83 }, { n: 'Sampdoria', s: 81 }, { n: 'Palermo', s: 80 },
      { n: 'Cremonese', s: 78 }, { n: 'Catanzaro', s: 77 }, { n: 'Modena', s: 77 }, { n: 'Pisa', s: 76 },
      { n: 'Cesena', s: 76 }, { n: 'Juve Stabia', s: 75 }, { n: 'Sudtirol', s: 75 }, { n: 'Carrarese', s: 73 },
      { n: 'Mantova', s: 73 }, { n: 'Padova', s: 71 }, { n: 'Ascoli', s: 71 }, { n: 'Avellino', s: 70 },
      { n: 'Benevento', s: 70 }, { n: 'Vicenza', s: 69 }, { n: 'Arezzo', s: 69 }, { n: 'Entella', s: 68 },
    ],
    [ // Serie A (massima serie). Valori `s` allargati (stiramento ~1.3x dalla media, coda
      // ulteriormente abbassata per le ultime 3): le classifiche vere di Serie A sono molto più
      // polarizzate di un ventaglio lineare — un gruppo di testa/Europa nettamente staccato dal
      // resto, e le ultime spesso crollano isolate (es. 2024-25: 82 punti il campione, 18 punti
      // l'ultima, oltre 60 punti di scarto — la vecchia distribuzione ne produceva solo ~56 di
      // media simulata contro i ~70 osservati sulle ultime due stagioni reali).
      { n: 'Napoli', s: 98 }, { n: 'Inter', s: 95 }, { n: 'Juventus', s: 95 }, { n: 'Milan', s: 91 },
      { n: 'Atalanta', s: 91 }, { n: 'Roma', s: 89 }, { n: 'Fiorentina', s: 88 }, { n: 'Bologna', s: 85 },
      { n: 'Lazio', s: 84 }, { n: 'Torino', s: 83 }, { n: 'Udinese', s: 82 }, { n: 'Genoa', s: 80 },
      { n: 'Sassuolo', s: 80 }, { n: 'Frosinone', s: 79 }, { n: 'Cagliari', s: 78 }, { n: 'Monza', s: 78 },
      { n: 'Parma', s: 76 }, { n: 'Lecce', s: 73 }, { n: 'Venezia', s: 70 }, { n: 'Como', s: 65 },
    ],
  ];

  // Doppioni storici fra i gironi (vedi il commento sulla Serie C qui sopra): quando un
  // salvataggio precedente porta ancora lo stesso nome in due categorie, quello della
  // categoria indicata viene ribattezzato così al caricamento (sanitizePools, sim.js).
  const POOL_RENAMES = { 3: { Padova: 'Salernitana', Vicenza: 'Cittadella', Avellino: 'Cosenza', Benevento: 'Cavese' } };

  // Regioni scelte in fase di creazione del club, per le due categorie che il vero sistema
  // calcistico italiano organizza su base regionale (Promozione ed Eccellenza — Serie D e su
  // sono invece gironi/campionati nazionali, restano sempre gli stessi qualunque regione si
  // scelga). Ogni regione ripropone lo STESSO ventaglio di forza (`s`) di POOLS[0]/POOLS[1],
  // solo con nomi di club diversi: la scelta è identitaria/di ambientazione, non tocca il
  // bilanciamento. Le prime due voci di ciascuna regione sono clonate da POOLS invece che
  // duplicate qui a mano, cosicché restino sempre la fonte di verità di riferimento (Lazio) —
  // regionApplyPool (ui.js) clona sempre da qui prima di scrivere su POOLS, non tiene mai un
  // riferimento condiviso, altrimenti cambiare regione più volte corromperebbe questi template.
  const REGIONS = [
    { key: 'lazio', label: 'Lazio', promozione: POOLS[0].map((c) => ({ ...c })), eccellenza: POOLS[1].map((c) => ({ ...c })) },
    {
      key: 'lombardia', label: 'Lombardia',
      promozione: [
        { n: 'Legnano', s: 56 }, { n: 'Gallarate', s: 55 }, { n: 'Busto Arsizio', s: 55 }, { n: 'Saronno', s: 54 },
        { n: 'Rho', s: 54 }, { n: 'Cinisello Balsamo', s: 52 }, { n: 'Sesto San Giovanni', s: 52 }, { n: 'Cologno Monzese', s: 51 },
        { n: 'Seregno', s: 51 }, { n: 'Desio', s: 50 }, { n: 'Lissone', s: 50 }, { n: 'Vimercate', s: 50 },
        { n: 'Concorezzo', s: 49 }, { n: 'Arcore', s: 49 }, { n: 'Giussano', s: 48 }, { n: 'Mariano Comense', s: 48 },
        { n: 'Cantù', s: 48 }, { n: 'Meda', s: 47 }, { n: 'Seveso', s: 47 }, { n: 'Cesano Maderno', s: 45 },
        { n: 'Bovisio Masciago', s: 45 }, { n: 'Gorla Minore', s: 42 }, { n: 'Fagnano Olona', s: 40 }, { n: 'Marnate', s: 36 },
      ],
      eccellenza: [
        { n: 'Abbiategrasso', s: 64 }, { n: 'Magenta', s: 63 }, { n: 'Vigevano', s: 62 }, { n: 'Voghera', s: 61 },
        { n: 'Lodi', s: 59 }, { n: 'Crema', s: 59 }, { n: 'Treviglio', s: 58 }, { n: 'Romano di Lombardia', s: 58 },
        { n: 'Chiari', s: 57 }, { n: 'Palazzolo sull\'Oglio', s: 57 }, { n: 'Gardone Val Trompia', s: 56 }, { n: 'Chiavenna', s: 56 },
        { n: 'Sondrio', s: 55 }, { n: 'Tirano', s: 55 }, { n: 'Merate', s: 55 }, { n: 'Cassano d\'Adda', s: 54 },
        { n: 'Melzo', s: 54 }, { n: 'Trezzano sul Naviglio', s: 53 }, { n: 'Corsico', s: 53 }, { n: 'Cesano Boscone', s: 51 },
        { n: 'Rozzano', s: 51 }, { n: 'Opera', s: 48 }, { n: 'San Donato Milanese', s: 46 }, { n: 'Segrate', s: 43 },
      ],
    },
    {
      key: 'campania', label: 'Campania',
      promozione: [
        { n: 'Portici', s: 56 }, { n: 'Ercolano', s: 55 }, { n: 'Torre del Greco', s: 55 }, { n: 'Torre Annunziata', s: 54 },
        { n: 'Castellammare di Stabia', s: 54 }, { n: 'Scafati', s: 52 }, { n: 'Angri', s: 52 }, { n: 'Nocera Inferiore', s: 51 },
        { n: 'Nocera Superiore', s: 51 }, { n: 'Sarno', s: 50 }, { n: 'Cava de\' Tirreni', s: 50 }, { n: 'Battipaglia', s: 50 },
        { n: 'Eboli', s: 49 }, { n: 'Agropoli', s: 49 }, { n: 'San Giorgio a Cremano', s: 48 }, { n: 'Casoria', s: 48 },
        { n: 'Afragola', s: 48 }, { n: 'Caivano', s: 47 }, { n: 'Acerra', s: 47 }, { n: 'Marigliano', s: 45 },
        { n: 'Nola', s: 45 }, { n: 'Palma Campania', s: 42 }, { n: 'Poggiomarino', s: 40 }, { n: 'Boscoreale', s: 36 },
      ],
      eccellenza: [
        { n: 'Pomigliano d\'Arco', s: 64 }, { n: 'Volla', s: 63 }, { n: 'Casalnuovo di Napoli', s: 62 }, { n: 'Arzano', s: 61 },
        { n: 'Grumo Nevano', s: 59 }, { n: 'Frattamaggiore', s: 59 }, { n: 'Frattaminore', s: 58 }, { n: 'San Giuseppe Vesuviano', s: 58 },
        { n: 'Ottaviano', s: 57 }, { n: 'Somma Vesuviana', s: 57 }, { n: 'Boscotrecase', s: 56 }, { n: 'Vico Equense', s: 56 },
        { n: 'Sant\'Antonio Abate', s: 55 }, { n: 'Gragnano', s: 55 }, { n: 'Vallo della Lucania', s: 55 }, { n: 'Capaccio Paestum', s: 54 },
        { n: 'Roccadaspide', s: 54 }, { n: 'Sala Consilina', s: 53 }, { n: 'Polla', s: 53 }, { n: 'Mercato San Severino', s: 51 },
        { n: 'Baronissi', s: 51 }, { n: 'Pagani', s: 48 }, { n: 'San Marzano sul Sarno', s: 46 }, { n: 'Striano', s: 43 },
      ],
    },
  ];

  // Derby regionali per Lombardia/Campania, stesso identico criterio delle 4 coppie Lazio
  // già in DERBIES sopra (comuni confinanti/gemelli, tutti in Promozione in quella regione):
  // aggiunte alla stessa lista globale invece che a una lista per regione, perché scattano da
  // sole solo quando ENTRAMBI i nomi sono davvero in gioco — coppie di un'altra regione restano
  // semplicemente inerti quando quella regione non è quella scelta, senza bisogno di alcuna
  // logica condizionale in isDerby.
  DERBIES.push(
    ['Legnano', 'Busto Arsizio'], ['Seregno', 'Desio'], ['Cinisello Balsamo', 'Sesto San Giovanni'], ['Cesano Maderno', 'Bovisio Masciago'],
    ['Torre del Greco', 'Torre Annunziata'], ['Portici', 'Ercolano'], ['Nocera Inferiore', 'Nocera Superiore'], ['Scafati', 'Angri'],
  );

  // Rose reali (Serie A/B, club europei), Squadra Icone, allenatori/direttori sportivi
  // reali: SERIE_A_ROSTERS, SERIE_B_ROSTERS, EURO_ROSTERS, ICON_PLAYERS, REAL_MANAGERS,
  // REAL_DS vivono in rosters.js (caricato subito dopo questo file, vedi index.html), non
  // più qui — è l'unico file da toccare per aggiornarli a ogni mercato/stagione reale,
  // senza sfiorare le costanti del motore che seguono.

  /* ---------------- stadio + biglietti ---------------- */
  // cost = il prezzo per fare l'upgrade A quel livello da quello sotto.
  const STADIUM = [
    { cap: 3500, cost: 0 }, { cap: 6000, cost: 1.2e6 }, { cap: 10000, cost: 3e6 }, { cap: 18000, cost: 8e6 },
    { cap: 28000, cost: 20e6 }, { cap: 42000, cost: 55e6 }, { cap: 60000, cost: 130e6 }, { cap: 80000, cost: 260e6 },
    { cap: 100000, cost: 420e6 },
  ];

  // fanGrow: il prezzo dei biglietti modella quanto velocemente cresce la TIFOSERIA ogni
  // stagione. Prezzi bassi riempiono lo stadio e fanno crescere nuovi tifosi; i prezzi
  // premium spremono il pubblico che già hai e frenano la crescita (e la fanno calare
  // in una stagione negativa).
  const TICKETS = [
    { k: 'cheap', label: 'Popolare', mult: 0.75, sent: 3, demand: 1.08, fanGrow: 0.012, hint: 'I tifosi accorrono, la tifoseria cresce più in fretta' },
    { k: 'std', label: 'Standard', mult: 1.0, sent: 0, demand: 1.0, fanGrow: 0.005, hint: 'Il prezzo giusto' },
    { k: 'high', label: 'Alto', mult: 1.3, sent: -3, demand: 0.93, fanGrow: -0.003, hint: 'Più incasso a biglietto, la crescita rallenta' },
    { k: 'prem', label: 'Premium', mult: 1.6, sent: -6, demand: 0.85, fanGrow: -0.012, hint: 'Incasso massimo, la tifoseria si ferma' },
  ];

  /* ---------------- nomi ---------------- */
  // Ampio mix di provenienze (come una vera rosa di Serie A/B): italiani, spagnoli/
  // latinoamericani, portoghesi/brasiliani, francesi, africani, balcanici, scandinavi,
  // tedeschi/olandesi. Pool grande apposta, per evitare che gli stessi nomi tornino
  // sempre negli stessi due-tre giocatori.
  const FIRST = [
    'Marco', 'Luca', 'Matteo', 'Andrea', 'Davide', 'Simone', 'Alessandro', 'Francesco', 'Lorenzo', 'Gabriele',
    'Riccardo', 'Federico', 'Nicolò', 'Giacomo', 'Tommaso', 'Leonardo', 'Antonio', 'Giuseppe', 'Salvatore', 'Vincenzo',
    'Stefano', 'Roberto', 'Paolo', 'Fabio', 'Daniele', 'Emanuele', 'Cristian', 'Manuel', 'Samuele', 'Mattia',
    'Giovanni', 'Filippo', 'Alessio', 'Emiliano', 'Massimo', 'Pietro', 'Enrico', 'Angelo',
    'Diego', 'Pablo', 'Rafael', 'Sergio', 'Javier', 'Alvaro', 'Carlos', 'Fernando', 'Ricardo', 'Miguel',
    'Juan', 'Rodrigo', 'Adrian', 'Gonzalo',
    'Thiago', 'Pedro', 'Bruno', 'Gustavo', 'Vinicius', 'Joao', 'Tiago', 'Eduardo', 'Wesley', 'Anderson', 'Felipe',
    'Antoine', 'Hugo', 'Lucas', 'Mathis', 'Theo', 'Enzo', 'Kylian', 'Adama', 'Moussa', 'Mamadou',
    'Karim', 'Youssef', 'Ibrahim', 'Mohamed', 'Amadou', 'Sadio', 'Ousmane', 'Cheikh', 'Boubacar', 'Idrissa',
    'Kwame', 'Kofi', 'Emmanuel', 'Victor', 'Chidi', 'Emeka',
    'Marko', 'Luka', 'Ivan', 'Stefan', 'Nemanja', 'Milan', 'Dusan', 'Filip', 'Dario', 'Bojan',
    'Aleksandar', 'Vladimir', 'Andrei', 'Radu',
    'Erik', 'Jonas', 'Nils', 'Anders', 'Magnus', 'Henrik', 'Lars', 'Sven', 'Oscar', 'Viktor',
    'Kevin', 'Michael', 'Lukas', 'Maximilian', 'Julian', 'Niklas', 'Daan', 'Sem', 'Wout', 'Ruud',
    'James', 'William', 'Thomas', 'Charlie', 'Jack', 'Harry', 'George', 'Oliver', 'Jacob', 'Ethan',
    'Ryan', 'Connor', 'Callum', 'Liam', 'Owen', 'Reece',
    'Emre', 'Cenk', 'Burak', 'Kerem', 'Arda', 'Ozan', 'Baris', 'Umut', 'Kaan',
    'Nikos', 'Dimitris', 'Kostas', 'Panagiotis', 'Giorgos', 'Christos', 'Vassilis',
    'Piotr', 'Krzysztof', 'Tomasz', 'Wojciech', 'Jakub', 'Marek', 'Pavel', 'Petr', 'Tomas', 'Ondrej',
    'Giorgi', 'Levan', 'Khvicha', 'Saba', 'Zurab',
    'Takumi', 'Kaoru', 'Hidemasa', 'Ritsu', 'Daizen', 'Minjae', 'Seunghyun',
    'Nahuel', 'Facundo', 'Franco', 'Agustin', 'Santiago', 'Nicolas', 'Ezequiel', 'Jonathan', 'Yerry', 'Duvan', 'Radamel',
    'Wilfried', 'Serge', 'Franck', 'Habib', 'Souleymane', 'Hamari', 'Alassane',
    'Rasmus', 'Mikkel', 'Casper', 'Jesper', 'Simon', 'Andreas', 'Fredrik',
    'Ahmed', 'Hassan', 'Yusuf', 'Omar', 'Ali', 'Tarik', 'Elias', 'Noah', 'Gabriel', 'Matheus',
    'Sean', 'Aidan', 'Declan', 'Conor', 'Cian', 'Ruairi', 'Rory', 'Euan', 'Fraser', 'Lewis', 'Gethin',
    'Achraf', 'Hakim', 'Sofyan', 'Nabil', 'Yassine', 'Anas', 'Zakaria', 'Walid', 'Amine', 'Rachid',
    'Mehdi', 'Sardar', 'Alireza', 'Saman',
    'Andriy', 'Oleksandr', 'Taras', 'Yevhen', 'Vitaliy', 'Denys', 'Artem',
    'Ante', 'Josip', 'Mario', 'Domagoj', 'Sime', 'Ivo',
    'Mihai', 'Alexandru', 'Florin', 'Constantin',
    'Yannick', 'Thibault', 'Axel', 'Jelle', 'Mats', 'Timothy',
    'Gylfi', 'Kolbeinn', 'Birkir', 'Aron',
    'Rui', 'Nuno', 'Goncalo', 'Diogo', 'Vitor', 'Nelson', 'Renato',
    'Cristobal', 'Maximiliano', 'Braian', 'Lautaro',
    'Tobias', 'Elliot', 'Freddie', 'Alfie', 'Arthur', 'Louis', 'Leon', 'Finn', 'Otto', 'Felix',
    'Junior', 'Patrick', 'Isaac', 'Caleb', 'Jayden', 'Malik', 'Xavier', 'Marcelo', 'Rogerio', 'Jorge',
    'Ismael', 'Yassin', 'Karam', 'Bilal', 'Tariq', 'Reda',
    'Dawit', 'Yonas', 'Tewodros',
    'Levi', 'Jayce', 'Micah',
    'Bogdan', 'Cezar', 'Kian', 'Zayn', 'Idris',
 ,
    'Iker', 'Unai', 'Aitor', 'Mikel', 'Asier', 'Ander', 'Gorka', 'Inigo', 'Rodri', 'Nico', 'Bernardo', 'Duarte', 'Vitorino', 'Edu', 'Exequiel', 'Alan', 'Marcos', 'Angel', 'Luiz', 'Everton', 'Richarlison', 'Casemiro', 'Fabinho', 'Alisson', 'Ederson', 'Danilo', 'Alex', 'Randal', 'Presnel', 'Aurelien', 'Benjamin', 'Christopher', 'Jules', 'Pape', 'Ismaila', 'Boulaye', 'Nampalys', 'Cheikhou', 'Krepin', 'Dejan', 'Sasa', 'Aleksa', 'Uros', 'Strahinja', 'Nikola', 'Andrija', 'Erling', 'Martin', 'Kristoffer', 'Sander', 'Ola', 'Alexander', 'Leo', 'Emil', 'Sindre', 'Timo', 'Kai', 'Joshua', 'Leroy', 'Ilkay', 'Frenkie', 'Matthijs', 'Denzel', 'Cody', 'Steven', 'Memphis', 'Xavi', 'Donyell', 'Justin', 'Quinten', 'Joaquin', 'Hernan', 'Ramiro', 'Cristhian', 'Yerson', 'Cristopher', 'Emerson', 'Wanderson', 'Robson', 'Fabricio', 'Leandro', 'Rodolfo', 'Joel', 'Bastien', 'Malo', 'Warren', 'Stephane', 'Wissam', 'Karl', 'Bakary', 'Yacouba', 'Souleyman', 'Amara', 'Djibril', 'Vaclav', 'Radek', 'Jaroslav', 'Tibor', 'Zoltan', 'Bela',
  ];

  const LAST = [
    'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco',
    'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti',
    'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone',
    'Longo', 'Gentile', 'Villa', 'Ferro', 'Marchetti', 'Bellini', 'Monti', 'Vitale', 'Amato', 'Testa',
    'Bianco', 'Vitali', 'Pellegrini', 'Sala', 'Farina', 'Rizzi', 'Gatti', 'Serra', 'Coppola', 'De Santis',
    'D\'Angelo', 'Marini', 'Grasso', 'Valentini', 'Messina', 'Fabbri', 'Guerra', 'Rossetti', 'Parisi', 'Sorrentino',
    'Grimaldi', 'De Angelis', 'Palumbo', 'Riva', 'Basile', 'Milani', 'Bianchini', 'Piras', 'Ferretti', 'Bernardi',
    'Neri', 'Piazza', 'Cattaneo', 'Negri', 'Orlando', 'Pagano', 'Rossini', 'D\'Amico', 'Trevisan', 'Angelini',
    'Battaglia', 'Beretta', 'Bevilacqua', 'Bianconi', 'Bonetti', 'Borrelli', 'Bosco', 'Cannavaro', 'Capasso', 'Caputo',
    'Carbone', 'Cassano', 'Cervi', 'Chiesa', 'Cirillo', 'Colella', 'Colonna', 'Corsini', 'Damiani', 'D\'Amato',
    'De Rosa', 'Di Marco', 'Di Stefano', 'Donati', 'Fabbrini', 'Fanelli', 'Federici', 'Ferrante', 'Fiore', 'Franceschini',
    'Franco', 'Gasperini', 'Genovese', 'Gianni', 'Grieco', 'Guidi', 'Iacobelli', 'Iannucci', 'Leoni', 'Lombardo',
    'Lorenzini', 'Maggi', 'Malavolti', 'Manzo', 'Marra', 'Melis', 'Meloni', 'Merlo', 'Mirabelli', 'Montanari',
    'Morandi', 'Nardi', 'Natali', 'Palermo', 'Palmieri', 'Pasquali', 'Pastore', 'Perrone', 'Piscopo', 'Pozzi',
    'Abate', 'Acquaviva', 'Agostini', 'Albanese', 'Aloisi', 'Amoroso', 'Ancona', 'Antonelli', 'Arena', 'Baldini',
    'Baresi', 'Bartolini', 'Battistini', 'Bellucci', 'Belotti', 'Benedetti', 'Bergamini', 'Berardi', 'Bertini', 'Bettini',
    'Biondi', 'Boni', 'Bordin', 'Borghi', 'Bosi', 'Bracci', 'Brambilla', 'Bruni', 'Buonocore', 'Cacciatore',
    'Calabrese', 'Calderone', 'Calvi', 'Camisa', 'Campana', 'Cannizzo', 'Capobianco', 'Capra', 'Caravaggio', 'Cardinale',
    'Carnevale', 'Carraro', 'Carrera', 'Casadei', 'Casali', 'Castellano', 'Catalano', 'Cavalieri', 'Cavallaro', 'Cavalli',
    'Ceccarelli', 'Cecchini', 'Celentano', 'Cerruti', 'Chiara', 'Cianci', 'Cimino', 'Cinquegrana', 'Cipolla', 'Cocco',
    'Colangelo', 'Coletti', 'Collura', 'Comi', 'Conte', 'Coppa', 'Corradi', 'Corsi', 'Cosentino', 'Costanzo',
    'Crescenzi', 'Crisci', 'Cucinotta', 'Curti', 'D\'Alessandro', 'D\'Amore', 'D\'Antonio', 'D\'Auria', 'D\'Errico', 'D\'Onofrio',
    'De Bernardi', 'De Bonis', 'De Filippo', 'De Giorgio', 'De Grandis', 'De Marchi', 'De Martino', 'De Nardis', 'De Paoli', 'De Vito',
    'Del Bono', 'Del Vecchio', 'Della Rocca', 'Di Bari', 'Di Bella', 'Di Biase', 'Di Carlo', 'Di Costanzo', 'Di Fabio', 'Di Gennaro',
    'Di Giacomo', 'Di Giovanni', 'Di Lorenzo', 'Di Maggio', 'Di Matteo', 'Di Nardo', 'Di Palma', 'Di Pasquale', 'Di Salvo', 'Errico',
    'Esposti', 'Fabiani', 'Falco', 'Falcone', 'Fanti', 'Farinelli', 'Fattori', 'Favaro', 'Fazio', 'Ferraresi',
    'Ferrarese', 'Ferraro', 'Fiorentino', 'Fiorillo', 'Fiorini', 'Foglia', 'Forlani', 'Fornaciari', 'Forte', 'Fossati',
    'Fracassi', 'Franzese', 'Frattini', 'Fresu', 'Frigo', 'Fumagalli', 'Gabrielli', 'Gagliardi', 'Galante', 'Galasso',
    'Gallina', 'Gambino', 'Gargano', 'Gasparini', 'Gatto', 'Gavioli', 'Gazzola', 'Ghezzi', 'Giacobbe', 'Giampaolo',
    'Giannetti', 'Giannini', 'Gioia', 'Giuliani', 'Golino', 'Gori', 'Governatori', 'Graziani', 'Guarino', 'Guerrieri',
    'Guglielmi', 'Iadanza', 'Ianniello', 'Improta', 'Innocenti', 'Lai', 'Landi', 'Lanza', 'La Rocca', 'Lauria',
    'Liguori', 'Loi', 'Lucchesi', 'Luongo', 'Maccarone', 'Magni', 'Maiorano', 'Manca', 'Manni', 'Mantovani',
    'Marsili', 'Martino', 'Marzano', 'Mastrangelo', 'Matarazzo', 'Mazza', 'Mazzarella', 'Mazzei', 'Mazzola', 'Menegatti',
    'Miceli', 'Michelini', 'Minervini', 'Mistretta', 'Modica', 'Montefiori', 'Montesano', 'Morbidelli', 'Morra', 'Muscara',
    'Nappi', 'Nardelli', 'Nastasi', 'Nenci', 'Nobile', 'Nole', 'Nucci', 'Nuti', 'Onorati', 'Orsini',
    'Ottaviani', 'Pace', 'Pagliuca', 'Palazzolo', 'Pandolfi', 'Pane', 'Panetta', 'Panzeri', 'Papa', 'Papini',
    'Pasini', 'Piroddi', 'Passeri', 'Pastorelli', 'Patrizi', 'Pecoraro', 'Pellizzari', 'Peluso', 'Pennisi', 'Perri',
    'Petrucci', 'Piccinini', 'Pignatelli', 'Pilotti', 'Pinna', 'Pontecorvo', 'Piovan', 'Pistoia', 'Pizzo', 'Poggi',
    'Polverini', 'Porcelli', 'Prete', 'Puglisi', 'Quaranta', 'Quattrone', 'Ranieri', 'Rea', 'Renzi', 'Ricciardelli',
    'Abbate', 'Accardi', 'Adamo', 'Agnello', 'Alberti', 'Albini', 'Alighieri', 'Amadei', 'Ambrosini', 'Ammirati',
    'Anastasi', 'Andreoli', 'Angeloni', 'Ansaldo', 'Ardito', 'Arici', 'Ariosto', 'Armani', 'Arrighi', 'Ascoli',
    'Attanasio', 'Avanzi', 'Avolio', 'Baccarini', 'Baldacci', 'Ballerini', 'Balzano', 'Banfi', 'Baraldi', 'Barchi',
    'Barone', 'Bartoli', 'Basili', 'Bassani', 'Bassi', 'Bassini', 'Battaglini', 'Bazzi', 'Bedini', 'Bellandi',
    'Belletti', 'Bellomo', 'Benassi', 'Bencini', 'Bendinelli', 'Benigni', 'Bentivoglio', 'Bergonzi', 'Berlinguer', 'Bertacchini',
    'Bertoli', 'Bettoni', 'Biagi', 'Bianchetti', 'Bibbiani', 'Bignami', 'Binetti', 'Boccaccio', 'Boccardi', 'Bolognesi',
    'Bonanni', 'Bonaventura', 'Bonvicini', 'Borelli', 'Borgognoni', 'Borsani', 'Bortolotti', 'Bosisio', 'Bragagnolo', 'Brescia',
    'Bresciani', 'Brizzi', 'Bruschi', 'Buccella', 'Bucci', 'Buonarroti', 'Buratti', 'Caccamo', 'Cadeddu', 'Caiazzo',
    'Calandra', 'Calisti', 'Calo', 'Camozzi', 'Campagnolo', 'Canale', 'Candela', 'Cantone', 'Capaldo', 'Capponi',
    'Caravella', 'Carini', 'Carminati', 'Carraresi', 'Casaburi', 'Cascio', 'Casolari', 'Castiglia', 'Castiglione', 'Catania',
    'Cattani', 'Cavaliere', 'Cazzaniga', 'Cecchetti', 'Ceccotti', 'Celi', 'Cesari', 'Chiaramonte', 'Chiodini', 'Ciampa',
    'Ciampi', 'Ciccone', 'Ciccotti', 'Cioffi', 'Ciotti', 'Cocchi', 'Colacino', 'Colamarino', 'Collina', 'Comencini',
    'Coniglio', 'Consoli', 'Contestabile', 'Cordaro', 'Cordisco', 'Corradini', 'Cortese', 'Costantini', 'Cottone', 'Crescimanno',
    'Crippa', 'Curcio', 'Dallara', 'Daniele', 'De Ceglie', 'De Cesare', 'De Lisi', 'De Rossi', 'De Simone', 'De Vecchi',
    'Della Valle', 'Denti', 'Diotallevi', 'Domenici', 'Donnini', 'Doria', 'Dossena', 'Fabris', 'Faccioli', 'Falbo',
    'Martinez', 'Fernandez', 'Garcia', 'Sanchez', 'Rodriguez', 'Lopez', 'Gonzalez', 'Perez', 'Diaz', 'Alonso',
    'Torres', 'Ramirez', 'Ortiz', 'Silva', 'Santos', 'Oliveira', 'Pereira', 'Carvalho', 'Fonseca', 'Ribeiro',
    'Moreira', 'Teixeira', 'Almeida', 'Dubois', 'Moreau', 'Laurent', 'Lefebvre', 'Girard', 'Bernard', 'Petit',
    'Roux', 'Fournier', 'Mercier', 'Nkomo', 'Diallo', 'Traore', 'Mensah', 'Okafor', 'Eze', 'Adeyemi',
    'Kone', 'Toure', 'Camara', 'Bakayoko', 'Diarra', 'Sow', 'Sarr', 'Ndiaye', 'Cisse', 'Kovac',
    'Novak', 'Jankovic', 'Petrovic', 'Ivanovic', 'Radovic', 'Dragic', 'Vukovic', 'Popescu', 'Ionescu', 'Nagy',
    'Kowalski', 'Nowak', 'Jansen', 'Andersen', 'Nielsen', 'Hansen', 'Larsen', 'Karlsson', 'Eriksson', 'Johansson',
    'Berg', 'Lund', 'Muller', 'Schmidt', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Bakker', 'Visser',
    'Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright',
    'White', 'Green', 'Hall', 'Wood', 'Clarke', 'Turner', 'Hill', 'Ward', 'Baker', 'Cooper',
    'Yilmaz', 'Demir', 'Kaya', 'Celik', 'Sahin', 'Aydin', 'Ozturk', 'Arslan', 'Papadopoulos', 'Georgiou',
    'Ioannou', 'Nikolaou', 'Kaminski', 'Wojcik', 'Lewandowski', 'Zielinski', 'Novotny', 'Dvorak', 'Prochazka', 'Svoboda',
    'Kvaratskhelia', 'Mamardashvili', 'Sarkisyan', 'Petrosyan', 'Tanaka', 'Sato', 'Suzuki', 'Kim', 'Lee', 'Park',
    'Acosta', 'Benitez', 'Cabrera', 'Duarte', 'Espinoza', 'Flores', 'Herrera', 'Medina', 'Paredes', 'Rojas',
    'Vidal', 'Zapata', 'Mbeki', 'Diakite', 'Coulibaly', 'Keita', 'Konate', 'Fofana', 'Balde', 'Mane',
    'Adekunle', 'Nwosu', 'Chukwu', 'Solberg', 'Halvorsen', 'Pedersen', 'Olsen', 'Svensson', 'Lindqvist', 'Makinen',
    'Virtanen', 'Kelly', 'Murphy', 'Walsh', 'McCarthy', 'Byrne', 'Doyle', 'Kennedy', 'Fitzgerald', 'Whelan',
    'Brennan', 'Benali', 'Boumediene', 'Cherif', 'Haddad', 'Mansouri', 'Saadi', 'Belkacem', 'Ferhat', 'Amrani',
    'Bouazza', 'Ghods', 'Nekounam', 'Azmoun', 'Shevchenko', 'Yarmolenko', 'Konoplyanka', 'Zinchenko', 'Petrov', 'Ivanov',
    'Sokolov', 'Modric', 'Rakitic', 'Mandzukic', 'Kalinic', 'Brekalo', 'Vlasic', 'Barisic', 'Stanciu', 'Chiriches',
    'Sanmartean', 'Marin', 'Dragomir', 'Vermeulen', 'Vandenberghe', 'Peeters', 'Willems', 'Mertens', 'Janssens', 'Claes',
    'Wouters', 'Sigurdsson', 'Thorarinsson', 'Bjarnason', 'Finnbogason', 'Gudjohnsen', 'Cardoso', 'Machado', 'Nunes', 'Rocha',
    'Pinto', 'Barbosa', 'Correia', 'Vieira', 'Faria', 'Antunes', 'Gimenez', 'Arce', 'Chavez', 'Vargas',
    'Salazar', 'Aguilar', 'Reyes', 'Contreras', 'Munoz', 'Castro', 'Abubakar', 'Chukwuemeka', 'Onwuachi', 'Obi',
    'Effiong', 'Yaboah', 'Appiah', 'Boateng', 'Adjei', 'Owusu', 'Reid', 'Stewart', 'Watson', 'Mitchell',
    'Campbell', 'Anderson', 'Palmer', 'Foster', 'Cross', 'Hood', 'Marsh', 'Chapman', 'Dyer', 'Osei',
    'Amankwah', 'Aramburu', 'Zubimendi', 'Merino', 'Oyarzabal', 'Barrenetxea', 'Kubo', 'Pacheco', 'Fernandes', 'Guimaraes',
    'Cancelo', 'Semedo', 'Guerreiro', 'Fonte', 'Firmino', 'Coutinho', 'Neymar', 'Marquinhos', 'Alex Sandro', 'Kounde',
    'Upamecano', 'Saliba', 'Kimpembe', 'Digne', 'Coman', 'Nkunku', 'Barcola', 'Diaby', 'Diakhaby', 'Doucoure',
    'Bissouma', 'Kalulu', 'Krunic', 'Vlahovic', 'Kostic', 'Milenkovic', 'Sucic', 'Majer', 'Ivanusec', 'Perisic',
    'Brozovic', 'Kovacic', 'Pasalic', 'Skriniar', 'Hancko', 'Duda', 'Schick', 'Coufal', 'Soucek', 'Hlozek',
    'Sadilek', 'Provod', 'Mandi', 'Boudaoui', 'Zaha', 'Doucet', 'Delort', 'Boudebouz', 'Feghouli', 'Belaili',
    'Bounedjah', 'Mahrez', 'Bennacer', 'Elmas', 'Aleksandrov', 'Bozhinov', 'Berkovec', 'Radoslavov', 'Nedelev', 'Delev',
    'Petrescu', 'Balaur', 'Radu', 'Tanase', 'Cicaldau', 'Sorescu', 'Burca', 'Racovitan', 'Screciu', 'Baze',
    'Hoxha', 'Cikalleshi', 'Ismajli', 'Mavraj', 'Xhaka', 'Shaqiri', 'Embolo', 'Akanji', 'Widmer', 'Freuler',
    'Zakaria', 'Elvedi', 'Zuber', 'Fassnacht', 'Frei', 'Ajeti', 'Gavranovic', 'Stocker', 'Lang', 'Sommer',
    'Vargas', 'Morales', 'Jimenez', 'Ruiz', 'Hernandez', 'Gutierrez', 'Navarro', 'Romero', 'Molina', 'Delgado',
    'Ortega', 'Marquez', 'Iglesias', 'Nunez', 'Cortes', 'Guerrero', 'Vega', 'Ramos', 'Soto', 'Bravo',
    'Rios', 'Araujo', 'Monteiro', 'Cunha', 'Pinheiro', 'Freitas', 'Neves', 'Lima', 'Batista', 'Farias',
    'Xavier', 'Bastos', 'Soares', 'Tavares', 'Amaral', 'Peixoto', 'Dias', 'Braga', 'Miranda', 'Azevedo',
    'Paiva', 'Lambert', 'Rousseau', 'Vincent', 'Fontaine', 'Chevalier', 'Robin', 'Morel', 'Garnier', 'Faure',
    'Andre', 'Blanc', 'Guerin', 'Boyer', 'Barbier', 'Rey', 'Leroy', 'Colin', 'Renard', 'Perrin',
    'Marchand', 'Fischer', 'Meyer', 'Wolf', 'Schroeder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krueger',
    'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Schmitt', 'Klein', 'Kraus', 'Vogel', 'Friedrich',
    'Seidel', 'Robinson', 'Harrison', 'Morgan', 'Bell', 'Cook', 'Bailey', 'Rogers', 'Bennett', 'Gray',
    'James', 'Watkins', 'Price', 'Owen', 'Phillips', 'Shaw', 'Fisher', 'Graham', 'Reynolds', 'Ellis',
    'Marshall', 'Ryan', 'O\'Connor', 'O\'Brien', 'Sullivan', 'Gallagher', 'Flynn', 'McDonnell', 'Nolan', 'Hogan',
    'Quinn', 'Peters', 'De Vries', 'Van Dijk', 'Van den Berg', 'Jacobs', 'De Jong', 'Meijer', 'De Boer', 'Kuipers',
    'Van Leeuwen', 'Sorensen', 'Christensen', 'Gustavsson', 'Nilsson', 'Persson', 'Jonsson', 'Vestergaard', 'Kristiansen', 'Moller',
    'Bergstrom', 'Kowalczyk', 'Zajac', 'Wisniewski', 'Dabrowski', 'Krajnc', 'Horvat', 'Simic', 'Maric', 'Jovanovic',
    'Stankovic', 'Todorov', 'Dimitrov', 'Angelov', 'Georgiev', 'Konstantinou', 'Christodoulou', 'Antoniou', 'Dimitriou', 'Pappas',
    'Vasileiou', 'Kilic', 'Aksoy', 'Polat', 'Ozkan', 'Cetin', 'Dogan', 'Yamamoto', 'Watanabe', 'Ito',
    'Nakamura', 'Kobayashi', 'Kato', 'Choi', 'Jung', 'Kang', 'Wang', 'Khalil', 'Hassan', 'Mahmoud',
    'Youssef', 'Karimi', 'Rahimi', 'Hosseini', 'Bensalem', 'Zidane', 'Bouzid', 'Adebayo', 'Okonkwo', 'Nwachukwu',
    'Danso', 'Asante', 'Mwangi', 'Otieno', 'Diagne', 'Faye', 'Thiam', 'Ferreira', 'Costa Silva', 'Gomes',
    'Henrique', 'Baptista', 'Serrano', 'Leiva', 'Cardenas', 'Escobar', 'Paredes Ruiz', 'Sotelo', 'Barrios', 'Cifuentes',
    'Bermudez', 'Renner', 'Brandt', 'Kruger', 'Bergmann', 'Schulze', 'Richter', 'Kohler', 'Ziegler', 'Stein',
    'Vogt', 'Harding', 'Wallace', 'Stevens', 'Warren', 'Holland', 'Newton', 'Barrett', 'Hutton', 'Pearce',
    'Sharp', 'Kavanagh', 'Molloy', 'Casey', 'Naughton', 'Hennessy', 'Lynch', 'Delaney', 'Cassidy', 'McKenna',
    'Duffy', 'Van der Meer', 'De Groot', 'Vermeer', 'Dekker', 'Smit', 'Van Dam', 'Mulder', 'Post', 'Kramer',
    'De Wit', 'Backman', 'Lindgren', 'Holm', 'Sandberg', 'Forsberg', 'Ekstrom', 'Palmqvist', 'Dahl', 'Wikstrom',
    'Blomqvist', 'Duque', 'Franca', 'Assis', 'Cavaco', 'Salgado', 'Moutinho', 'Rebelo', 'Mata', 'Pinho',
    'Cordeiro', 'Villalobos', 'Zambrano', 'Arellano', 'Bustos', 'Cardona', 'Godoy', 'Lozano', 'Mena', 'Ovalle',
    'Quiroga', 'Renaud', 'Chauvin', 'Aubert', 'Gauthier', 'Marchal', 'Noel', 'Picard', 'Tessier', 'Caron',
    'Lucena', 'Krieger', 'Hahn', 'Beck', 'Frank', 'Winkler', 'Busch', 'Albrecht', 'Pohl', 'Sauer',
    'Ludwig', 'Bird', 'Chambers', 'Perkins', 'Webb', 'Simpson', 'Holmes', 'Pearson', 'Dawson', 'Sinclair',
    'Grant',
  ];

  // Le prime voci di FIRST/LAST sono italiane in senso stretto (usate per i nazionali
  // italiani); il resto del pool è il mix multinazionale già esistente, riusato per
  // ogni giocatore straniero a prescindere dalla nazionalità estratta.
  const ITA_FIRST = FIRST.slice(0, 38), ITA_LAST = LAST.slice(0, 540);

  const FOREIGN_FIRST = FIRST.slice(38), FOREIGN_LAST = LAST.slice(540);

  /* ---------------- nazionalità ---------------- */
  // In Eccellenza la rosa è quasi tutta italiana; salendo di categoria la quota di
  // stranieri cresce, fino a rispecchiare una vera Serie A. NATIONS è la lista degli
  // esteri possibili (bandiera + nome); ITA è gestita a parte perché è sempre la più comune.
  const ITA_NAT = { code: 'ITA', name: 'Italia', flag: '🇮🇹' };

  const NATIONS = [
    { code: 'ESP', name: 'Spagna', flag: '🇪🇸' }, { code: 'ARG', name: 'Argentina', flag: '🇦🇷' },
    { code: 'BRA', name: 'Brasile', flag: '🇧🇷' }, { code: 'POR', name: 'Portogallo', flag: '🇵🇹' },
    { code: 'FRA', name: 'Francia', flag: '🇫🇷' }, { code: 'SEN', name: 'Senegal', flag: '🇸🇳' },
    { code: 'CIV', name: 'Costa d\'Avorio', flag: '🇨🇮' }, { code: 'MLI', name: 'Mali', flag: '🇲🇱' },
    { code: 'GHA', name: 'Ghana', flag: '🇬🇭' }, { code: 'NGA', name: 'Nigeria', flag: '🇳🇬' },
    { code: 'SRB', name: 'Serbia', flag: '🇷🇸' }, { code: 'CRO', name: 'Croazia', flag: '🇭🇷' },
    { code: 'ROU', name: 'Romania', flag: '🇷🇴' }, { code: 'SWE', name: 'Svezia', flag: '🇸🇪' },
    { code: 'NOR', name: 'Norvegia', flag: '🇳🇴' }, { code: 'DEN', name: 'Danimarca', flag: '🇩🇰' },
    { code: 'GER', name: 'Germania', flag: '🇩🇪' }, { code: 'NED', name: 'Olanda', flag: '🇳🇱' },
    { code: 'ENG', name: 'Inghilterra', flag: '🏴' }, { code: 'SCO', name: 'Scozia', flag: '🏴' },
    { code: 'IRL', name: 'Irlanda', flag: '🇮🇪' }, { code: 'TUR', name: 'Turchia', flag: '🇹🇷' },
    { code: 'GRE', name: 'Grecia', flag: '🇬🇷' }, { code: 'POL', name: 'Polonia', flag: '🇵🇱' },
    { code: 'CZE', name: 'Rep. Ceca', flag: '🇨🇿' }, { code: 'GEO', name: 'Georgia', flag: '🇬🇪' },
    { code: 'JPN', name: 'Giappone', flag: '🇯🇵' }, { code: 'KOR', name: 'Corea del Sud', flag: '🇰🇷' },
    { code: 'COL', name: 'Colombia', flag: '🇨🇴' }, { code: 'CHI', name: 'Cile', flag: '🇨🇱' },
    { code: 'MAR', name: 'Marocco', flag: '🇲🇦' }, { code: 'ALG', name: 'Algeria', flag: '🇩🇿' },
    { code: 'IRN', name: 'Iran', flag: '🇮🇷' }, { code: 'UKR', name: 'Ucraina', flag: '🇺🇦' },
    { code: 'ISL', name: 'Islanda', flag: '🇮🇸' }, { code: 'BEL', name: 'Belgio', flag: '🇧🇪' },
    // Aggiunte per coprire le nazionalità reali dei giocatori delle rose vere (Serie A,
    // Serie B, club europei): stessa struttura, solo più varietà geografica.
    { code: 'URU', name: 'Uruguay', flag: '🇺🇾' }, { code: 'SUI', name: 'Svizzera', flag: '🇨🇭' },
    { code: 'AUT', name: 'Austria', flag: '🇦🇹' }, { code: 'HUN', name: 'Ungheria', flag: '🇭🇺' },
    { code: 'USA', name: 'Stati Uniti', flag: '🇺🇸' }, { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
    { code: 'MEX', name: 'Messico', flag: '🇲🇽' }, { code: 'VEN', name: 'Venezuela', flag: '🇻🇪' },
    { code: 'ECU', name: 'Ecuador', flag: '🇪🇨' }, { code: 'DOM', name: 'Rep. Dominicana', flag: '🇩🇴' },
    { code: 'JAM', name: 'Giamaica', flag: '🇯🇲' }, { code: 'SUR', name: 'Suriname', flag: '🇸🇷' },
    { code: 'CUW', name: 'Curaçao', flag: '🇨🇼' },
    { code: 'CMR', name: 'Camerun', flag: '🇨🇲' }, { code: 'EGY', name: 'Egitto', flag: '🇪🇬' },
    { code: 'TUN', name: 'Tunisia', flag: '🇹🇳' }, { code: 'BFA', name: 'Burkina Faso', flag: '🇧🇫' },
    { code: 'GUI', name: 'Guinea', flag: '🇬🇳' }, { code: 'GNB', name: 'Guinea-Bissau', flag: '🇬🇼' },
    { code: 'GAM', name: 'Gambia', flag: '🇬🇲' }, { code: 'GAB', name: 'Gabon', flag: '🇬🇦' },
    { code: 'EQG', name: 'Guinea Equatoriale', flag: '🇬🇶' }, { code: 'CPV', name: 'Capo Verde', flag: '🇨🇻' },
    { code: 'ANG', name: 'Angola', flag: '🇦🇴' }, { code: 'MOZ', name: 'Mozambico', flag: '🇲🇿' },
    { code: 'COD', name: 'RD Congo', flag: '🇨🇩' }, { code: 'CGO', name: 'Congo', flag: '🇨🇬' },
    { code: 'CHA', name: 'Ciad', flag: '🇹🇩' }, { code: 'ZAM', name: 'Zambia', flag: '🇿🇲' },
    { code: 'UGA', name: 'Uganda', flag: '🇺🇬' }, { code: 'TOG', name: 'Togo', flag: '🇹🇬' },
    { code: 'MTN', name: 'Mauritania', flag: '🇲🇷' }, { code: 'NIG', name: 'Niger', flag: '🇳🇪' },
    { code: 'LBR', name: 'Liberia', flag: '🇱🇷' },
    { code: 'RUS', name: 'Russia', flag: '🇷🇺' }, { code: 'ARM', name: 'Armenia', flag: '🇦🇲' },
    { code: 'AZE', name: 'Azerbaigian', flag: '🇦🇿' }, { code: 'ISR', name: 'Israele', flag: '🇮🇱' },
    { code: 'ALB', name: 'Albania', flag: '🇦🇱' }, { code: 'KVX', name: 'Kosovo', flag: '🇽🇰' },
    { code: 'MKD', name: 'Macedonia del Nord', flag: '🇲🇰' }, { code: 'MNE', name: 'Montenegro', flag: '🇲🇪' },
    { code: 'BIH', name: 'Bosnia ed Erzegovina', flag: '🇧🇦' }, { code: 'SVN', name: 'Slovenia', flag: '🇸🇮' },
    { code: 'SVK', name: 'Slovacchia', flag: '🇸🇰' }, { code: 'BUL', name: 'Bulgaria', flag: '🇧🇬' },
    { code: 'MDA', name: 'Moldavia', flag: '🇲🇩' }, { code: 'LTU', name: 'Lituania', flag: '🇱🇹' },
    { code: 'LVA', name: 'Lettonia', flag: '🇱🇻' }, { code: 'LUX', name: 'Lussemburgo', flag: '🇱🇺' },
    { code: 'CYP', name: 'Cipro', flag: '🇨🇾' }, { code: 'FRO', name: 'Isole Faroe', flag: '🇫🇴' },
    { code: 'GIB', name: 'Gibilterra', flag: '🇬🇮' }, { code: 'WAL', name: 'Galles', flag: '🏴' },
    { code: 'NIR', name: 'Irlanda del Nord', flag: '🇬🇧' },
    { code: 'FIN', name: 'Finlandia', flag: '🇫🇮' }, { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
    { code: 'NZL', name: 'Nuova Zelanda', flag: '🇳🇿' }, { code: 'IDN', name: 'Indonesia', flag: '🇮🇩' },
    // Aggiunte per la Squadra Icone (leggende ritirate): nazionalità sudamericane e altre
    // non ancora coperte dalle rose reali contemporanee.
    { code: 'PAR', name: 'Paraguay', flag: '🇵🇾' }, { code: 'PER', name: 'Perù', flag: '🇵🇪' },
    { code: 'BOL', name: 'Bolivia', flag: '🇧🇴' }, { code: 'CRC', name: 'Costa Rica', flag: '🇨🇷' },
    { code: 'HON', name: 'Honduras', flag: '🇭🇳' }, { code: 'KSA', name: 'Arabia Saudita', flag: '🇸🇦' },
    { code: 'RSA', name: 'Sudafrica', flag: '🇿🇦' },
  ];

  // Bandiere disegnate a SVG (non emoji): su Windows i flag emoji spesso non hanno un
  // glifo dedicato e il sistema mostra il codice ISO in lettere ("IT", "ES", ...) al posto
  // della bandiera. Ogni voce è una ricetta semplificata (strisce/croce/cerchio/stella)
  // nei colori veri della bandiera, disegnata da flagSVG in sim.js.
  const FLAG_SPECS = {
    ITA: { type: 'v', colors: ['#009246', '#F1F2F1', '#CE2B37'] },
    ESP: { type: 'h', colors: ['#AA151B', '#F1BF00', '#AA151B'] },
    ARG: { type: 'h', colors: ['#74ACDF', '#F1F2F1', '#74ACDF'] },
    BRA: { type: 'h', colors: ['#009B3A', '#FEDF00', '#009B3A'] },
    POR: { type: 'v', colors: ['#006600', '#FF0000'] },
    FRA: { type: 'v', colors: ['#0055A4', '#F1F2F1', '#EF4135'] },
    SEN: { type: 'h', colors: ['#00853F', '#FDEF42', '#E31B23'] },
    CIV: { type: 'v', colors: ['#F77F00', '#F1F2F1', '#009E60'] },
    MLI: { type: 'v', colors: ['#14B53A', '#FCD116', '#CE1126'] },
    GHA: { type: 'h', colors: ['#CE1126', '#FCD116', '#006B3F'] },
    NGA: { type: 'v', colors: ['#008751', '#F1F2F1', '#008751'] },
    SRB: { type: 'h', colors: ['#C6363C', '#0C4076', '#F1F2F1'] },
    CRO: { type: 'h', colors: ['#FF0000', '#F1F2F1', '#171796'] },
    ROU: { type: 'v', colors: ['#002B7F', '#FCD116', '#CE1126'] },
    SWE: { type: 'cross', base: '#006AA7', cross: '#FECC02' },
    NOR: { type: 'cross', base: '#EF2B2D', cross: '#F1F2F1', outline: '#002868' },
    DEN: { type: 'cross', base: '#C60C30', cross: '#F1F2F1' },
    GER: { type: 'h', colors: ['#000000', '#DD0000', '#FFCE00'] },
    NED: { type: 'h', colors: ['#AE1C28', '#F1F2F1', '#21468B'] },
    ENG: { type: 'cross', base: '#F1F2F1', cross: '#CE1124' },
    SCO: { type: 'saltire', base: '#0065BF', cross: '#F1F2F1' },
    IRL: { type: 'v', colors: ['#169B62', '#F1F2F1', '#FF883E'] },
    TUR: { type: 'star', base: '#E30A17', starColor: '#F1F2F1' },
    GRE: { type: 'h', colors: ['#0D5EAF', '#F1F2F1', '#0D5EAF', '#F1F2F1', '#0D5EAF'] },
    POL: { type: 'h', colors: ['#F1F2F1', '#DC143C'] },
    CZE: { type: 'h', colors: ['#F1F2F1', '#D7141A'] },
    GEO: { type: 'star', base: '#F1F2F1', starColor: '#FF0000' },
    JPN: { type: 'circle', base: '#F1F2F1', circleColor: '#BC002D' },
    KOR: { type: 'circle', base: '#F1F2F1', circleColor: '#0047A0' },
    COL: { type: 'h', colors: ['#FCD116', '#FCD116', '#003893', '#CE1126'] },
    CHI: { type: 'h', colors: ['#F1F2F1', '#D52B1E'] },
    MAR: { type: 'star', base: '#C1272D', starColor: '#006233' },
    ALG: { type: 'v', colors: ['#006233', '#F1F2F1'] },
    IRN: { type: 'h', colors: ['#239F40', '#F1F2F1', '#DA0000'] },
    UKR: { type: 'h', colors: ['#005BBB', '#FFD500'] },
    ISL: { type: 'cross', base: '#02529C', cross: '#DC1E35', outline: '#F1F2F1' },
    BEL: { type: 'v', colors: ['#000000', '#FDDA24', '#EF3340'] },
    // Le nazionalità sotto mancavano del tutto da questa mappa: senza una ricetta qui
    // flagOf ripiega sull'emoji bandiera (vedi sim.js), che su molti sistemi (Windows in
    // testa) per parecchi di questi paesi non ha un glifo dedicato e mostra il codice ISO
    // in lettere al posto della bandiera — la causa delle "bandiere sbagliate" segnalate.
    URU: { type: 'h', colors: ['#F1F2F1', '#0038A8', '#F1F2F1', '#0038A8', '#F1F2F1'] },
    SUI: { type: 'cross', base: '#D52B1E', cross: '#F1F2F1' },
    AUT: { type: 'h', colors: ['#ED2939', '#F1F2F1', '#ED2939'] },
    HUN: { type: 'h', colors: ['#CE2939', '#F1F2F1', '#477050'] },
    USA: { type: 'h', colors: ['#B22234', '#F1F2F1', '#B22234', '#F1F2F1', '#B22234'] },
    CAN: { type: 'v', colors: ['#FF0000', '#F1F2F1', '#FF0000'] },
    MEX: { type: 'v', colors: ['#006847', '#F1F2F1', '#CE1126'] },
    VEN: { type: 'h', colors: ['#FFCC00', '#00247D', '#CF142B'] },
    ECU: { type: 'h', colors: ['#FFDD00', '#FFDD00', '#034EA2', '#EF3340'] },
    DOM: { type: 'cross', base: '#CE1126', cross: '#F1F2F1', outline: '#002D62' },
    JAM: { type: 'saltire', base: '#009B3A', cross: '#FED100' },
    SUR: { type: 'h', colors: ['#377E3F', '#F1F2F1', '#B40A2D', '#F1F2F1', '#377E3F'] },
    CUW: { type: 'h', colors: ['#002B7F', '#F9E814', '#002B7F'] },
    CMR: { type: 'v', colors: ['#007A5E', '#CE1126', '#FCD116'] },
    EGY: { type: 'h', colors: ['#CE1126', '#F1F2F1', '#000000'] },
    TUN: { type: 'circle', base: '#E70013', circleColor: '#F1F2F1' },
    BFA: { type: 'h', colors: ['#EF2B2D', '#009739'] },
    GUI: { type: 'v', colors: ['#CE1126', '#FCD116', '#009460'] },
    GNB: { type: 'v', colors: ['#CE1126', '#FCD116', '#009739'] },
    GAM: { type: 'h', colors: ['#CE1126', '#0C1C8C', '#3A7728'] },
    GAB: { type: 'h', colors: ['#009E60', '#FCD116', '#3A75C4'] },
    EQG: { type: 'h', colors: ['#3E9A00', '#F1F2F1', '#E32118'] },
    CPV: { type: 'h', colors: ['#003893', '#F1F2F1', '#CF142B', '#F1F2F1', '#003893'] },
    ANG: { type: 'h', colors: ['#CE1126', '#000000'] },
    MOZ: { type: 'h', colors: ['#009739', '#000000', '#FCD116'] },
    COD: { type: 'star', base: '#007FFF', starColor: '#F7D618' },
    CGO: { type: 'saltire', base: '#009543', cross: '#DC241F' },
    CHA: { type: 'v', colors: ['#002664', '#FECB00', '#C60C30'] },
    ZAM: { type: 'v', colors: ['#198A00', '#DE2010', '#000000', '#EF7D00'] },
    UGA: { type: 'h', colors: ['#000000', '#FCDC04', '#D90000', '#000000', '#FCDC04', '#D90000'] },
    TOG: { type: 'h', colors: ['#006A4E', '#FFCE00', '#006A4E', '#FFCE00', '#006A4E'] },
    MTN: { type: 'star', base: '#00A95C', starColor: '#FFC400' },
    NIG: { type: 'h', colors: ['#E05206', '#F1F2F1', '#0DB02B'] },
    LBR: { type: 'h', colors: ['#BF0A30', '#F1F2F1', '#BF0A30', '#F1F2F1', '#BF0A30'] },
    RUS: { type: 'h', colors: ['#F1F2F1', '#0039A6', '#D52B1E'] },
    ARM: { type: 'h', colors: ['#D90012', '#0033A0', '#F2A800'] },
    AZE: { type: 'h', colors: ['#00B9E4', '#EF3340', '#509E2F'] },
    ISR: { type: 'star', base: '#F1F2F1', starColor: '#0038B8' },
    ALB: { type: 'h', colors: ['#E41E20'] },
    KVX: { type: 'star', base: '#244AA5', starColor: '#FFD700' },
    MKD: { type: 'star', base: '#D20000', starColor: '#FFE600' },
    MNE: { type: 'star', base: '#C40308', starColor: '#D4AF37' },
    BIH: { type: 'star', base: '#002395', starColor: '#FECB00' },
    SVN: { type: 'h', colors: ['#F1F2F1', '#005DA4', '#ED1C24'] },
    SVK: { type: 'h', colors: ['#F1F2F1', '#0B4EA2', '#EE1C25'] },
    BUL: { type: 'h', colors: ['#F1F2F1', '#00966E', '#D62612'] },
    MDA: { type: 'v', colors: ['#0046AE', '#FFD200', '#CC092F'] },
    LTU: { type: 'h', colors: ['#FDB913', '#006A44', '#C1272D'] },
    LVA: { type: 'h', colors: ['#9E3039', '#F1F2F1', '#9E3039'] },
    LUX: { type: 'h', colors: ['#ED2939', '#F1F2F1', '#00A1DE'] },
    CYP: { type: 'circle', base: '#F1F2F1', circleColor: '#D57800' },
    FRO: { type: 'cross', base: '#F1F2F1', cross: '#EF3340', outline: '#0071BC' },
    GIB: { type: 'h', colors: ['#F1F2F1', '#DA291C'] },
    WAL: { type: 'h', colors: ['#F1F2F1', '#00B140'] },
    NIR: { type: 'cross', base: '#F1F2F1', cross: '#E2001A' },
    FIN: { type: 'cross', base: '#F1F2F1', cross: '#003580' },
    AUS: { type: 'star', base: '#00008B', starColor: '#F1F2F1' },
    NZL: { type: 'star', base: '#00247D', starColor: '#CC142B' },
    IDN: { type: 'h', colors: ['#CE1126', '#F1F2F1'] },
    PAR: { type: 'h', colors: ['#D52B1E', '#F1F2F1', '#0038A8'] },
    PER: { type: 'v', colors: ['#D91023', '#F1F2F1', '#D91023'] },
    BOL: { type: 'h', colors: ['#D52B1E', '#F9E300', '#007934'] },
    CRC: { type: 'h', colors: ['#002B7F', '#F1F2F1', '#CE1126', '#F1F2F1', '#002B7F'] },
    HON: { type: 'h', colors: ['#0073CF', '#F1F2F1', '#0073CF'] },
    KSA: { type: 'h', colors: ['#006C35'] },
    RSA: { type: 'h', colors: ['#000000', '#FFB612', '#007A4D'] },
  };

  // Quota di italiani per categoria (indice = S.div, 0=Eccellenza … 4=Serie A): scende
  // gradualmente, come la vera piramide del calcio italiano.
  const ITA_SHARE = [0.98, 0.97, 0.90, 0.75, 0.55, 0.35];

  const CREST_DEFAULT = { shape: 'shield', colors: ['#f0c869', '#7a4f16'] };

  // Coppe europee: club veri, divisi per fascia di forza (in linea con oppBase di
  // EURO_COMPS). genEuroClub pesca dalla fascia della coppa in corso; il generatore
  // prefisso+città resta solo come riserva se una fascia dovesse esaurirsi.
  const EURO_CLUBS = {
    ucl: [
      { n: 'Real Madrid', s: 95 }, { n: 'Manchester City', s: 94 }, { n: 'Bayern Monaco', s: 92 },
      { n: 'Paris Saint-Germain', s: 91 }, { n: 'Liverpool', s: 90 }, { n: 'Barcellona', s: 90 },
      { n: 'Arsenal', s: 88 }, { n: 'Chelsea', s: 85 }, { n: 'Borussia Dortmund', s: 85 },
      { n: 'Atletico Madrid', s: 86 }, { n: 'Bayer Leverkusen', s: 84 }, { n: 'Manchester United', s: 83 },
      { n: 'Tottenham', s: 83 }, { n: 'Benfica', s: 81 }, { n: 'Porto', s: 80 }, { n: 'Ajax', s: 79 },
      { n: 'Sporting Lisbona', s: 82 }, { n: 'RB Lipsia', s: 82 }, { n: 'Marsiglia', s: 80 }, { n: 'Monaco', s: 79 },
    ],
    uel: [
      { n: 'West Ham', s: 76 }, { n: 'Villarreal', s: 78 }, { n: 'Real Sociedad', s: 76 },
      { n: 'Eintracht Francoforte', s: 77 }, { n: 'Rangers', s: 72 }, { n: 'Celtic', s: 73 },
      { n: 'Feyenoord', s: 77 }, { n: 'PSV Eindhoven', s: 78 }, { n: 'Olympiacos', s: 74 },
      { n: 'Fenerbahce', s: 76 }, { n: 'Galatasaray', s: 77 }, { n: 'Besiktas', s: 73 },
      { n: 'Sporting Braga', s: 73 }, { n: 'Slavia Praga', s: 71 }, { n: 'Dinamo Zagabria', s: 72 },
      { n: 'Shakhtar Donetsk', s: 74 }, { n: 'Club Brugge', s: 75 }, { n: 'Anderlecht', s: 72 },
      { n: 'Young Boys', s: 71 }, { n: 'Salisburgo', s: 78 },
    ],
    conf: [
      { n: 'Aberdeen', s: 63 }, { n: 'Molde', s: 62 }, { n: 'AZ Alkmaar', s: 68 }, { n: 'Nizza', s: 69 },
      { n: 'Lens', s: 70 }, { n: 'Konyaspor', s: 62 }, { n: 'Legia Varsavia', s: 65 }, { n: 'Slovan Bratislava', s: 63 },
      { n: 'Cluj', s: 61 }, { n: 'Ludogorets', s: 64 }, { n: 'Gent', s: 66 }, { n: 'Vitoria Guimaraes', s: 65 },
      { n: 'Maccabi Tel Aviv', s: 62 }, { n: 'Rakow Czestochowa', s: 60 }, { n: 'APOEL', s: 58 },
      { n: 'Zorya Luhansk', s: 59 }, { n: 'Apollon Limassol', s: 58 }, { n: 'Silkeborg', s: 60 },
      { n: 'Vikingur Reykjavik', s: 57 }, { n: 'Lincoln Red Imps', s: 54 },
    ],
  };

  const EURO_CLUB_PREFIX = ['Dynamo', 'Slavia', 'Sporting', 'Real', 'Atletico', 'Union', 'Rapid', 'Steaua', 'Partizan', 'Spartak', 'Legia', 'CSKA', 'Olympique', 'Girondins', 'Racing', 'FC'];

  const EURO_CITIES = ['Praga', 'Varsavia', 'Vienna', 'Zagabria', 'Belgrado', 'Sofia', 'Bucarest', 'Atene', 'Lisbona', 'Porto', 'Bruges', 'Rotterdam', 'Basilea', 'Zurigo', 'Salisburgo', 'Copenaghen', 'Oslo', 'Stoccolma', 'Helsinki', 'Bratislava', 'Budapest', 'Istanbul', 'Mosca', 'Kiev'];

  /* ---------------- ruoli + marcatori ---------------- */
  // Ogni giocatore ha un ruolo che ne condiziona la probabilità di segnare: gli
  // attaccanti vanno in gol molto più spesso, i centrocampisti con moderazione, i
  // difensori raramente, i portieri quasi mai (un'autorete avversaria a parte).
  const POS_LABEL = { POR: 'Portiere', DIF: 'Difensore', CEN: 'Centrocampista', ATT: 'Attaccante' };

  const POS_SCORE_WEIGHT = { POR: 0.04, DIF: 1.1, CEN: 3.2, ATT: 8.5 };

  // Distribuzione "di base" di un ruolo in una rosa, prima di guardare ai bisogni della
  // squadra (portieri pochi, difensori e centrocampisti il grosso, attaccanti un po' meno).
  const POS_BASE_WEIGHT = { POR: 0.10, DIF: 0.35, CEN: 0.30, ATT: 0.25 };
  // Tetto massimo per ruolo: oltre questo numero, quel ruolo non viene più estratto (né
  // dagli spin né dagli svincolati né dal settore giovanile), a prescindere dal peso.
  const POS_CAP = { POR: 4, DIF: 8, CEN: 8, ATT: 6 };

  // Chi serve l'assist: i centrocampisti ne fanno di più di chiunque, gli attaccanti un
  // po' meno (spesso sono loro a essere serviti), i difensori raramente, i portieri quasi
  // mai. Non può essere lo stesso giocatore che ha segnato.
  const POS_ASSIST_WEIGHT = { POR: 0.03, DIF: 1.0, CEN: 3.4, ATT: 2.2 };

  // ---- crescita/calo dell'overall a fine stagione ----
  // Quanto ci si aspetta da un giocatore nel suo ruolo in una stagione da titolare fisso
  // (gol + 0.7 per assist): chi ha giocato meno partite viene giudicato su un'asticella
  // proporzionalmente più bassa (le sue presenze reali su quelle della squadra), non
  // sullo stesso metro di chi ha giocato sempre. Così un panchinaro che rende molto nelle
  // poche gare avute può crescere anche più di un titolare che ha deluso.
  const POS_PROD_BASELINE = { POR: 0, DIF: 2.5, CEN: 6, ATT: 12 };

  // Un pool più ampio per fascia (era 6-7 nomi, ora 12-13): su 20 stagioni di negoziazioni
  // sponsor, il pool piccolo era il più a rischio ripetizione di tutto il gioco.
  const SPONSOR_BRANDS = {
    community: ['Panetteria del Borgo', 'Assicurazioni del Porto', 'Latteria Locale', 'Birrificio Vecchio Mulino', 'Autofficina Collina', 'Pasticceria Reale', 'Ferramenta Centrale', 'Macelleria San Rocco', 'Farmacia Comunale', 'Vivaio Fioranova', 'Cartoleria Progresso', 'Gelateria Artigiana', 'Tabaccheria Stazione'],
    regional: ['Gruppo Adriatica', 'Edilizia del Nord', 'Distretto Energia', 'Cantine Riunite Sud', 'Trasporti Peninsulare', 'Confidi Regionale', 'Agroalimentare Vallata', 'Consorzio Termale', 'Metalmeccanica Valdarno', 'Ceramiche Colline', 'Ittica Tirrenica', 'Cooperativa Lattiero-Casearia'],
    standard: ['NordGate Energia', 'Corona Telecom', 'Vetro Vertice', 'Redline Logistica', 'Ancora Finanza', 'Orizzonte Assicurazioni', 'Ampere Utilities', 'Portale Immobiliare', 'Cargo Adriatico', 'Rete Sanitaria Plus', 'Fibra Nazionale', 'Mercurio Leasing'],
    betting: ['ScommettiBene', 'FortunaKick', 'GoalRush Casinò', 'BetNazione', 'SpinWin', 'JackpotArena', 'PuntaFacile', 'RedDice Bet', 'AllInSport', 'VittoriaLive', 'BetOlimpo', 'CashGoal'],
    global: ['Atlas Global', 'Vantage Air', 'Nimbus Tech', 'Meridian Bank', 'Solaris Motori', 'Zenith Capital', 'Orbit Dynamics', 'Helios Group', 'Titan Aerospace', 'Quantum Financial', 'Continental Shipping', 'Apex Semiconductors'],
    // Sponsor di stadio (naming rights) e sponsor tecnico (fornitore materiale sportivo):
    // due accordi indipendenti da quello di maglia, con lo stesso `mk()` di sponsorOffers
    // ma pescati da questi pool invece che da SPONSOR_BRANDS.standard/regional/ecc.
    stadium: ['Arena Costruzioni', 'Domus Impianti', 'Stadium Energia', 'Real Estate Adriatica', 'Gruppo Infrastrutture', 'Fortezza Assicurazioni', 'Terra Costruzioni', 'Impianti del Sud', 'Cementi Alpini', 'Acciaierie Riunite'],
    tech: ['Velox Sport', 'Dynamis Athletic', 'Corsa Technical', 'Pantera Sportswear', 'Ignis Kit', 'Aurora Teamwear', 'Scatto Sport', 'Cardo Athletic', 'Vetta Sportswear', 'Bravos Kit'],
  };

  // Ogni offerta sponsor (maglia/stadio/tecnico) porta anche un "perk" pescato da qui, non solo
  // un importo: un effetto di gioco vero, non economico, che dura quanto l'accordo — così
  // scegliere fra due offerte non è mai solo "quale paga di più", ognuna ha un carattere
  // diverso (vedi sponsorPerkValue in sim.js per come i campi numerici vengono letti e
  // sommati). `neutral` (nessun effetto) resta sempre un'opzione valida, non uno spreco.
  const SPONSOR_PERKS = {
    kit: [
      { key: 'community', label: 'Sponsor di comunità', icon: '🤝', desc: 'La tifoseria cresce un filo più in fretta ogni stagione mentre l\'accordo è attivo.', fanbaseGrowBonus: 0.006 },
      { key: 'global', label: 'Sponsor internazionale', icon: '🌍', desc: 'Il marchio globale costruisce prestigio di club ogni stagione, anche a bocce ferme.', prestigePerSeason: 1.2e5 },
      { key: 'betting', label: 'Sponsor di scommesse', icon: '🎰', desc: 'Paga meglio di chiunque altro, ma una parte della tifoseria non lo digerisce: umore in leggero calo ogni stagione.', sentDeltaPerSeason: -1 },
      { key: 'neutral', label: 'Sponsor storico', icon: '🏛️', desc: 'Nessun effetto particolare oltre ai soldi: un accordo solido e senza sorprese.' },
    ],
    stadium: [
      { key: 'construction', label: 'Gruppo costruzioni', icon: '🏗️', desc: 'Sconto sui lavori di ampliamento dello stadio per tutta la durata dell\'accordo.', stadiumUpgradeDiscount: 0.15 },
      { key: 'hospitality', label: 'Gruppo ospitalità', icon: '🍽️', desc: 'Il pacchetto hospitality attira più pubblico del solito, a parità di prezzo del biglietto.', demandBonus: 0.03 },
      { key: 'neutral', label: 'Sponsor storico', icon: '🏛️', desc: 'Nessun effetto particolare oltre ai soldi: un accordo solido e senza sorprese.' },
    ],
    tech: [
      { key: 'medical', label: 'Tecnologia sportiva', icon: '🦵', desc: 'Materiali migliori, meno infortuni muscolari per tutta la squadra.', injuryDiscount: 0.12 },
      { key: 'performance', label: 'Fornitore di alte prestazioni', icon: '⚡', desc: 'Kit da gara pensati per lo sprint: un filo di brillantezza in più in campo.', teamEffBonus: 0.4 },
      { key: 'neutral', label: 'Fornitore storico', icon: '🏛️', desc: 'Nessun effetto particolare oltre ai soldi: un accordo solido e senza sorprese.' },
    ],
  };

  // Fondi/investitori che propongono un patto pluriennale: iniezione di cassa subito + un
  // top-up ogni stagione, in cambio di un obiettivo di categoria da raggiungere entro un
  // numero di stagioni dato — se non lo raggiungi in tempo perdi il club (cessione forzata),
  // se lo raggiungi incassi anche un bonus finale. Un rischio vero, non solo un altro conto
  // in banca: per questo resta sempre opzionale e mai proposto due volte identico.
  const INVESTOR_FUNDS = ['Meridian Capital Partners', 'Silverline Holding', 'Fondo Nuova Proprietà', 'Cardinal Sports Equity', 'Northbridge Investment Group', 'Fenice Capital', 'Orizzonte Sportivo SGR', 'Blackpine Ventures'];


  /* ---------------- stato ---------------- */
  const MAX_SEASONS = 15;

  /* ---------------- settore giovanile / scouting ---------------- */
  // Un investimento persistente (4 livelli) che rende ogni spin migliore in media e più
  // affidabile (meno varianza), e alza la chance del "colpo" da titoli di giornale. Dal
  // livello 2 in su può anche regalare un giovane di prospettiva gratis a inizio stagione.
  const SCOUT_TIERS = [
    { name: 'Nessuno', bonus: 0, varDelta: 0, gem: 0, prospectChance: 0 },
    { name: 'Base', bonus: 2, varDelta: -0.6, gem: 0.02, prospectChance: 0.28 },
    { name: 'Avanzato', bonus: 4, varDelta: -1.1, gem: 0.05, prospectChance: 0.48 },
    { name: 'Elite', bonus: 7, varDelta: -1.6, gem: 0.09, prospectChance: 0.72 },
  ];

  const MIN_SQUAD = 16;

  // Il capitano deve avere più di questa età: uno spogliatoio non affida la fascia a un
  // ragazzino, per quanto forte. In cambio, indossarla vale +1 OVR effettivo (captainBonus,
  // sim.js) sulla forza della squadra in campo.
  const CAPTAIN_MIN_AGE = 22;

  // Traguardi di carriera (diversi dai trofei di club, già nella Bacheca trofei): puramente
  // di prestigio personale, sbloccati una volta sola e per sempre (checkAchievements, sim.js),
  // mostrati come seconda scheda della stessa bacheca (showTrophyCase, ui.js).
  const ACHIEVEMENTS = [
    { key: 'first_promo', icon: '⬆️', title: 'Si comincia a salire', desc: 'Ottieni la tua prima promozione di categoria.' },
    { key: 'from_bottom', icon: '🌱', title: 'Dal fondo alla vetta', desc: 'Parti dalla Promozione e arriva in Serie A con lo stesso club.' },
    { key: 'serie_a', icon: '🇮🇹', title: 'Sei arrivato', desc: 'Porta il tuo club in Serie A.' },
    { key: 'scudetto', icon: '🥇', title: 'Scudetto', desc: 'Vinci il campionato di Serie A.' },
    { key: 'coppa_italia', icon: '🏆', title: 'Coppa nazionale', desc: 'Vinci la Coppa Italia.' },
    { key: 'coppa_europea', icon: '🌍', title: 'Notti europee', desc: 'Vinci una coppa europea.' },
    { key: 'treble', icon: '👑', title: 'Tripletta', desc: 'Vinci scudetto, Coppa Italia e Champions League nella stessa stagione.' },
    { key: 'no_releg_10', icon: '🧱', title: 'Un decennio di stabilità', desc: '10 stagioni di fila senza mai retrocedere.' },
    { key: 'legend_squad', icon: '⭐', title: 'Squadra di fenomeni', desc: 'Metti insieme 3 giocatori reali o leggende in rosa nella stessa stagione.' },
    { key: 'dynasty_complete', icon: '🏁', title: 'Fine di un\'era', desc: 'Porta a termine tutte le stagioni della dynasty.' },
    { key: 'hardcore_survivor', icon: '🔥', title: 'Sopravvissuto', desc: 'Porta a termine un\'intera dynasty in modalità Hardcore.' },
    { key: 'youth_movement', icon: '🧒', title: 'Movimento giovanile', desc: 'Vinci il campionato o ottieni una promozione con una rosa dall\'età media sotto i 23 anni.' },
    { key: 'frugal_champion', icon: '🪙', title: 'Vittoria a costo zero', desc: 'Vinci il campionato o ottieni una promozione con una rosa più debole della media di categoria.' },
    { key: 'perfect_season', icon: '🛡️', title: 'Stagione perfetta', desc: 'Chiudi un intero campionato senza mai perdere una partita.' },
    { key: 'century_club', icon: '💯', title: 'Club dei cento', desc: 'Raggiungi 100 punti o più in una singola stagione di campionato.' },
    { key: 'goal_machine', icon: '⚽', title: 'Macchina da gol', desc: 'Segna 80 gol o più in una singola stagione di campionato.' },
    { key: 'iron_defense', icon: '🧱', title: 'Muro di gomma', desc: 'Subisci meno di 20 gol in una stagione di campionato da almeno 30 giornate.' },
    { key: 'investor_trust', icon: '🏦', title: 'Fiducia ripagata', desc: 'Porta a termine con successo un patto con un fondo d\'investimento.' },
    { key: 'homegrown_hero', icon: '🌟', title: 'Prodotto del vivaio', desc: 'Un giocatore uscito dal tuo settore giovanile raggiunge 85 di overall mentre è ancora in rosa.' },
  ];

  // Difficoltà scelta all'avvio della carriera (vedi startDynasty in sim.js): ogni voce
  // ritocca budget di partenza, forza effettiva percepita in campo (teamEffDelta, positivo
  // aiuta noi/penalizza gli avversari, negativo il contrario), quanto pesano gli imprevisti
  // (infortuni/squalifiche più o meno frequenti, partite più o meno imprevedibili) e gli
  // stipendi richiesti dai giocatori. "Medio" è il bilanciamento di base del gioco.
  // Ogni fascia è stata alzata leggermente (5-8% circa su ogni fattore, incluso Medio) rispetto
  // al bilanciamento precedente: il gioco risultava troppo permissivo su tutti i livelli, non
  // solo su quello facile.
  const DIFFICULTIES = [
    {
      key: 'facile', label: 'Facile', blurb: 'Più margine economico, avversari più abbordabili, meno imprevisti.',
      budgetMult: 1.28, teamEffDelta: 4, injuryMult: 0.75, varianceMult: 0.88, wageMult: 0.95,
      scoutCostMult: 0.88, sponsorMult: 1.10, mgrCostMult: 0.93, prospectMult: 1.12, promoStreakMalusMult: 0.68,
      patienceMult: 0.68, eventMult: 0.78,
    },
    {
      key: 'medio', label: 'Medio', blurb: 'Il bilanciamento classico del gioco, senza sconti né penalità.',
      budgetMult: 0.95, teamEffDelta: 0, injuryMult: 1.06, varianceMult: 1.05, wageMult: 1.04,
      scoutCostMult: 1.05, sponsorMult: 0.94, mgrCostMult: 1.04, prospectMult: 0.92, promoStreakMalusMult: 1.08,
      patienceMult: 1.08, eventMult: 1.08,
    },
    {
      key: 'difficile', label: 'Difficile', blurb: 'Budget più risicato, avversari più ostici, qualche imprevisto di troppo.',
      budgetMult: 0.70, teamEffDelta: -4, injuryMult: 1.42, varianceMult: 1.26, wageMult: 1.17,
      scoutCostMult: 1.26, sponsorMult: 0.82, mgrCostMult: 1.17, prospectMult: 0.78, promoStreakMalusMult: 1.4,
      patienceMult: 1.4, eventMult: 1.34,
    },
    {
      key: 'estremo', label: 'Estremo', blurb: 'Si parte con pochissimo, ogni partita è in salita e gli imprevisti sono la norma.',
      budgetMult: 0.5, teamEffDelta: -8, injuryMult: 1.78, varianceMult: 1.47, wageMult: 1.31,
      scoutCostMult: 1.52, sponsorMult: 0.69, mgrCostMult: 1.36, prospectMult: 0.58, promoStreakMalusMult: 1.82,
      patienceMult: 1.72, eventMult: 1.72,
    },
  ];

  /* ---------------- avvio + acquisizione ---------------- */
  // Non si sceglie più un club con un nome già dato: si sceglie una SITUAZIONE di
  // partenza (che tipo di presidenza sarà). Il nome del club lo decide chi gioca, nel
  // campo qui sopra, pre-compilato con un suggerimento a caso.
  // Ogni situazione ha una variante di titolo/racconto per fascia di categoria (bassa:
  // Eccellenza-Serie C, media: Serie B, alta: Serie A): gli stessi 4 archetipi economici,
  // ma raccontati in modo che abbia senso anche partendo già in alto — "piccola realtà" o
  // "provincia" restano credibili in Serie A (Cagliari, Lecce...) ma con un altro nome e
  // un'altra storia, non lo stesso testo pensato per l'Eccellenza.
  const SITUATIONS = [
    {
      key: 'gigante', strRange: [46, 54], budgetRange: [1.1e6, 1.6e6], stadiumTier: 1, stadiumChance: 0.7, fanbaseRange: [1.15, 1.35],
      variants: {
        low: { title: 'Gigante in declino', blurb: 'Una piazza che sogna ancora la Serie A: tanta tifoseria, casse quasi vuote.' },
        mid: { title: 'Nobile decaduta', blurb: 'Una big retrocessa che non si è ancora ripresa: tanta tifoseria, conti in affanno.' },
        high: { title: 'Big in crisi', blurb: 'Un nome che pesa in Europa ma le ultime stagioni sono state dure: tifoseria enorme, casse in rosso.' },
      },
    },
    {
      key: 'piccola', strRange: [42, 50], budgetRange: [2.0e6, 2.8e6], stadiumTier: 0, stadiumChance: 0, fanbaseRange: [0.85, 1.0],
      variants: {
        low: { title: 'Piccola realtà solida', blurb: 'Pochi tifosi ma conti sempre in ordine: un progetto costruito con pazienza.' },
        mid: { title: 'Matricola tranquilla', blurb: 'Pochi clamori ma bilanci sani: una salvezza onesta come obiettivo minimo.' },
        high: { title: 'Provinciale di lusso', blurb: 'Una piazza raccolta ma organizzata: bilanci in ordine anche nella categoria più cara d\'Europa.' },
      },
    },
    {
      key: 'matricola', strRange: [44, 52], budgetRange: [2.5e6, 3.3e6], stadiumTier: 0, stadiumChance: 0.2, fanbaseRange: [0.9, 1.05],
      variants: {
        low: { title: 'Matricola ambiziosa', blurb: 'Presidente facoltoso, fame di categoria superiore: il budget più alto sul tavolo.' },
        mid: { title: 'Progetto ambizioso', blurb: 'Un fondo con soldi veri punta dritto alla Serie A: il budget più alto sul tavolo.' },
        high: { title: 'Nuova proprietà facoltosa', blurb: 'Un fondo straniero ha appena rilevato il club con ambizioni europee: il budget più alto sul tavolo.' },
      },
    },
    {
      key: 'provincia', strRange: [43, 51], budgetRange: [1.6e6, 2.1e6], stadiumTier: 0, stadiumChance: 0, fanbaseRange: [0.95, 1.1],
      variants: {
        low: { title: 'Club di provincia stabile', blurb: 'Nessun lusso, ma né debiti né sorprese: si parte alla pari con tutti.' },
        mid: { title: 'Onesta realtà di categoria', blurb: 'Nessun lusso, ma né debiti né sorprese: una stagione tranquilla è già un successo.' },
        high: { title: 'Piazza storica in equilibrio', blurb: 'Nessun lusso, ma né debiti né sorprese: la permanenza tranquilla è l\'obiettivo.' },
      },
    },
  ];
