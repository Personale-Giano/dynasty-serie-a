# Quizzotti v2

21 minigiochi gratuiti (19 di calcio più Jeopardy normale e Milionario normale, di cultura generale), ispirati a format TV italiani (Chi Vuol Essere Milionario, Jeopardy, Avanti un Altro, Taboo, Intesa Vincente, Mr. White, L'Eredità…). HTML/CSS/JS statico, senza framework né bundler: si apre `index.html` e si gioca.

La v2 è un rifacimento completo. L'identità visiva si chiama **"Riflettori"**: lo stadio di sera, con i fari, il prato e tutti i numeri sul tabellone a LED. Le regole di stile e di tono sono in [DESIGN.md](DESIGN.md): leggerlo prima di toccare una pagina.

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
api/                       stanze di Nomi, Cose, Calcio (PHP 8.0 su Altervista): nomicose.php
                           risponde a TV e telefoni, nomicose-core.php ha le regole; le stanze
                           sono file JSON in api/stanze, protetti da .htaccess, durano 2 giorni
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
- **Home**: la sfida del giorno, "riprendi da dove eri" (ultimi tre giochi dal profilo), i giochi divisi tra *Da solo* e *In compagnia* con i filtri (ricordati in `qz.home.filter`). Il JSON-LD della home elenca i giochi: se cambia il registro va aggiornato (lo controlla `tests/pages.test.js`).
- **API principali** (`window.QZ`): `show(screenId)`, `Timer`, `ringHTML()/ring()`, `sound.*`, `fx.*` (coriandoli, scintille, testo volante, shake…), `toast`, `modal`, `confirm`, `countdown`, `share`, `wake` (schermo sempre acceso), `playerList`, `segmented`, `results`, `podiumHTML`, `Deck` (estrazioni senza ripetizioni tra una partita e l'altra), `profile.record(id, {xp, label, score})`.
- **Dettagli utili del motore**:
  - `Deck.draw(filtro)` non ripete mai la stessa carta due volte di fila, nemmeno quando il mazzo si rimescola; `Deck.remaining(filtro)` dice quante carte mai viste restano.
  - `store.get/set/remove` non esplodono mai (modalità privata, memoria piena); `set` restituisce `false` se non è riuscito a salvare.
  - Dopo ogni `profile.record()` o azzeramento parte l'evento `qz:profile` su `document` (anche quando la partita finisce in un'altra scheda).
  - `show()`: se arrivano due cambi di schermata ravvicinati vince l'ultimo; se il fuoco era su un bottone sparito, passa all'`h1` della nuova schermata (oppure a `[data-autofocus]`).
  - Le modali si possono impilare (es. `confirm` sopra una modale): Esc e Tab comandano solo quella in cima.
  - `share()` prova la condivisione del telefono, poi gli appunti, poi la copia alla vecchia maniera; non ripete il link se è già nel testo.
- **Registro**: `daily: true` segna il gioco quotidiano (la home lo mette in evidenza come "La sfida di oggi").

## Aggiungere un gioco

1. Aggiungi la voce in `QZ.GAMES` (`assets/qz.js`) e il colore in `qz.css` (`[data-game="id"]`).
2. Crea `NomeGioco.html` partendo da `CVEM.html` e `assets/games/<id>.js` partendo da `assets/games/cvem.js`.
3. Crea `assets/db-<id>.js` con i dati ed esportali con `module.exports`, poi aggiungi un test in `tests/db-integrity.test.js`.
4. `npm test`: il test delle pagine verifica che registro, `data-game`, script e asset siano coerenti.

## Prima di pubblicare

```bash
node scripts/cache-bust.js                       # versione degli asset nei link
```

## Privacy

Profilo, livello, record e nomi dei giocatori restano in `localStorage` sul dispositivo. Nessun tracciamento, nessun server.

## Note sui contenuti

I database sono generati/curati con assistenza automatica: cifre di calciomercato e alcuni record andrebbero riverificati su una fonte autorevole.
