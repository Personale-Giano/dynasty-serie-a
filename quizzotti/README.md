# Quizzotti v2

10 minigiochi di calcio gratuiti, ispirati a format TV italiani (Chi Vuol Essere Milionario, Jeopardy, Avanti un Altro, Taboo, Intesa Vincente, Mr. White, L'Eredità…). HTML/CSS/JS statico, senza framework né bundler: si apre `index.html` e si gioca.

La v2 è un rifacimento completo: nuovo design "Notte di Coppa" (fari dello stadio, oro del logo, un colore d'accento per ogni gioco), animazioni ovunque, un solo motore condiviso al posto del codice duplicato in ogni pagina.

## Avvio rapido

Non serve build: apri `index.html`, oppure servi la cartella con un server statico (dalla radice del repo: `node server.js`, poi http://localhost:8099/quizzotti/).

```bash
npm install     # solo per test e lint
npm test        # test automatici (node:test)
npm run check   # test + lint JS + lint CSS
```

## Struttura

```
index.html                 home (griglia giochi generata dal registro)
CVEM.html, Jeopardy.html…  una pagina per gioco, con <body data-game="id">
assets/
  qz.css                   design system unico (token, componenti, animazioni)
  qz.js                    motore condiviso: registro giochi, header/launcher/footer,
                           icone SVG, suoni, profilo XP, timer, effetti, modali
  home.js                  logica della home
  games/<id>.js            logica di ciascun gioco
  db-<gioco>.js            database dei contenuti (invariati rispetto alla v1)
  questions-data.js        trivia condiviso (usato da CVEM) + quiz-engine.js
scripts/
  cache-bust.js            aggiunge ?v=hash agli asset (da lanciare prima di pubblicare)
  set-domain.js            imposta il dominio reale in sitemap.xml/robots.txt
tests/                     integrità dei database + coerenza pagine/registro
```

## Come funziona una pagina di gioco

```html
<body data-game="cvem">
  <main id="app" class="qz-main">
    <section class="screen is-active" id="s-start">…</section>
    <section class="screen" id="s-game">…</section>
    <section class="screen" id="s-end">…</section>
  </main>
  <script src="assets/qz.js" defer></script>
  <script src="assets/db-cvem.js" defer></script>
  <script src="assets/games/cvem.js" defer></script>
</body>
```

- **Header, menu giochi, footer e sfondo** li genera `qz.js`: non vanno scritti nelle pagine. Per aggiungere o rinominare un gioco basta modificare `QZ.GAMES` in `assets/qz.js` (home, launcher e profilo si aggiornano da soli).
- **Colore del gioco**: `data-game` sul `<body>` attiva il suo accento (`--accent`) definito in `qz.css`; bottoni, timer e risposte lo ereditano.
- **API principali** (`window.QZ`): `show(screenId)`, `Timer`, `ringHTML()/ring()`, `sound.*`, `fx.*` (coriandoli, scintille, testo volante, shake…), `toast`, `modal`, `confirm`, `countdown`, `share`, `wake` (schermo sempre acceso), `playerList`, `segmented`, `results`, `podiumHTML`, `Deck` (estrazioni senza ripetizioni tra una partita e l'altra), `profile.record(id, {xp, label, score})`.

## Aggiungere un gioco

1. Aggiungi la voce in `QZ.GAMES` (`assets/qz.js`) e il colore in `qz.css` (`[data-game="id"]`).
2. Crea `NomeGioco.html` partendo da `CVEM.html` e `assets/games/<id>.js` partendo da `assets/games/cvem.js`.
3. Crea `assets/db-<id>.js` con i dati ed esportali con `module.exports`, poi aggiungi un test in `tests/db-integrity.test.js`.
4. `npm test`: il test delle pagine verifica che registro, `data-game`, script e asset siano coerenti.

## Prima di pubblicare

```bash
node scripts/cache-bust.js                       # versione degli asset nei link
node scripts/set-domain.js https://iltuodominio.it   # sitemap e robots
```

## Privacy

Profilo, livello, record e nomi dei giocatori restano in `localStorage` sul dispositivo. Nessun tracciamento, nessun server.

## Note sui contenuti

I database sono generati/curati con assistenza automatica: cifre di calciomercato e alcuni record andrebbero riverificati su una fonte autorevole.
