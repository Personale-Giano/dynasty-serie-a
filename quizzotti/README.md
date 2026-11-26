# Quizzotti v2

22 minigiochi gratuiti (20 di calcio più Jeopardy normale e Milionario normale, di cultura generale), ispirati a format TV italiani (Chi Vuol Essere Milionario, Jeopardy, Avanti un Altro, Taboo, Intesa Vincente, Mr. White, L'Eredità…). HTML/CSS/JS statico, senza framework né bundler: si apre `index.html` e si gioca.

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
Leghe.html                 Leghe tra amici (non è un gioco del registro): crea/entra, classifiche, pagellino
api/                       stanze dei giochi TV + telefoni (PHP 8.0 su Altervista): le stanze
                           sono file JSON in api/stanze, protetti da .htaccess, durano 2 giorni
  nomicose.php             Nomi, Cose, Calcio: risponde a TV e telefoni; nomicose-core.php ha le regole
  tuttitv.php              Tutti contro la TV (stanze tv-ABCD.json); tuttitv-core.php ha le regole
  tuttitv-domande.json     le domande del quiz con le risposte, lette solo dal PHP (api/.htaccess
                           ne vieta la lettura dal web): si rigenera con scripts/build-tuttitv.js
  leghe.php                Leghe tra amici: una lega = un file L-CODICE.json in api/leghe (protetto da
                           .htaccess, sparisce dopo 180 giorni fermo); leghe-core.php ha regole e punti
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
  build-tuttitv.js         api/tuttitv-domande.json da questions-data.js e db-cvem.js (va
                           rilanciato quando cambiano quelle domande: un test lo controlla)
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

## Leghe tra amici

`Leghe.html` + `assets/games/leghe.js` (pagina), `api/leghe.php` + `api/leghe-core.php` (server), `QZ.leagues` in `assets/qz.js` (rete e gettone).

- Si crea una lega con un nome, si condivide il codice di 6 caratteri (link `Leghe.html?c=CODICE` e QR), chi entra sceglie solo un soprannome. Niente account: ogni telefono ha un gettone segreto in `localStorage` (`qz.leghe.tok`) e il server ne tiene solo l'impronta sha256. Massimo 30 membri per lega, 10 leghe per telefono, 5 leghe create all'ora per IP.
- I giochi del giorno, a fine partita del giorno (mai in allenamento o archivio), chiamano `QZ.leagues.submit(gameId, n, result)`: il risultato va da solo a tutte le leghe del telefono. Senza leghe non parte nessuna richiesta, ma il risultato resta due giorni in `qz.leghe.sent` ed entra anche nelle leghe in cui si entra dopo; senza rete si riprova al prossimo caricamento di pagina.
- Il server conta i punti con la tabella del gioco (`lg_score()` in `leghe-core.php`, da 0 a 10 a partita), accetta un solo invio per gioco e N° per membro (vale il primo) e solo il N° di oggi o di ieri, ora di Roma. Classifiche per settimana (lunedì-domenica), mese e da sempre; il lunedì in cima alla lega c'è il pagellino della settimana prima: vincitore, media della lega, serie più lunga di giorni vinti, voto da 4 a 10 (s.v. sotto le 3 partite).
- **Collegare un nuovo gioco del giorno** (es. la Scheda del giorno di Quattro per Quattro, il Giornale di oggi): aggiungi la voce in `LG_GAMES` (id come in `QZ.GAMES`, nome, data del N° 1) e il suo calcolo in `lg_score()`, con un test in `tests/leghe-core.test.php`; nel gioco chiama `QZ.leagues.submit('id', N°, {...})` a fine partita del giorno. Finché il server non lo conosce, l'invio risponde "Gioco non collegato alle leghe" e non si ripete.
- Prove in locale: `QZ_LEGHE_TEST=1 QZ_LEGHE_DIR=/tmp/leghe php -S localhost:8263 -t quizzotti`; con `QZ_LEGHE_TEST=1` l'intestazione `X-Test-Now` (secondi Unix) sposta l'orologio del server. `tests/leghe.test.js` fa lo stesso da solo se trova un PHP.

## Aggiungere un gioco

1. Aggiungi la voce in `QZ.GAMES` (`assets/qz.js`) e il colore in `qz.css` (`[data-game="id"]`).
2. Crea `NomeGioco.html` partendo da `CVEM.html` e `assets/games/<id>.js` partendo da `assets/games/cvem.js`.
3. Crea `assets/db-<id>.js` con i dati ed esportali con `module.exports`, poi aggiungi un test in `tests/db-integrity.test.js`.
4. `npm test`: il test delle pagine verifica che registro, `data-game`, script e asset siano coerenti.

## Prima di pubblicare

```bash
node scripts/build-tuttitv.js                    # se sono cambiate le domande del Milionario o del trivia
node scripts/seo-pagine.js                       # title, anteprime, dati strutturati e testo «Come si gioca»
python scripts/immagini.py                       # icone e anteprime 1200x630 (solo se cambia un gioco o il logo)
node scripts/cache-bust.js                       # versione degli asset nei link (sempre per ultimo)
```

## Google, installazione e condivisione

- **Testi per Google**: `scripts/seo-pagine.js` contiene, per ogni gioco, title, description, le righe di «Come si gioca», tre domande frequenti e quattro «Altri giochi». Li scrive nella pagina (head, JSON-LD con WebApplication + BreadcrumbList + FAQPage, blocco statico `<section class="qz-about">` in fondo al `<main>`, visibile solo con la copertina) e aggiorna l'elenco statico dei giochi in home (`<!-- qz:elenco -->`). Un gioco nuovo va aggiunto lì; `tests/pages.test.js` controlla che tutto torni.
- **Anteprime WhatsApp**: `assets/og/<id>.jpg` (1200×630, tabellone a LED col nome del gioco), generate da `scripts/immagini.py` coi colori del registro.
- **App installabile**: `manifest.webmanifest`, icone in `assets/icons/`, `favicon.ico`, e `sw.js` (registrato da `qz.js`): pagine prima dalla rete poi dalla cache, asset con `?v=` e caratteri prima dalla cache, `api/` mai in cache. I giochi da soli già aperti una volta funzionano anche senza rete. Se si cambia la strategia, si alza `CACHE` in `sw.js`.
- **Caratteri**: Archivo (variabile) e Saira Semi Condensed 600-800 sono in `assets/fonts/` (SIL Open Font License), con `@font-face` in `qz.css`. Niente Google Fonts.
- **Apache** (`.htaccess`): https forzato, `/quizzotti/index.html` → `/quizzotti/`, `404.html`, blocco di `*.md`, `package*.json`, `scripts/`, `tests/`, cache lunga per gli asset con `?v=`. `api/` è esclusa dalle regole: non va mai bloccata né rediretta.
- **Profilo su un altro telefono**: nel profilo c'è «Esporta / Importa», un codice `QZ1.` da copiare (profilo + chiavi `qz.*`, non i mazzi `qz.deck.*`).

## Privacy

Profilo, livello, record e nomi dei giocatori restano in `localStorage` sul dispositivo. Nessun cookie e nessun tracciamento; i caratteri sono sul sito. La pagina per chi gioca è `privacy.html` (linkata nel piede). Solo i giochi TV + telefoni (Nomi, Cose, Calcio e Tutti contro la TV) passano dal server del sito: la stanza tiene i nomi scelti e le risposte della partita, e sparisce da sola dopo due giorni. Le Leghe tra amici, solo per chi entra in una lega, tengono sul server il soprannome e i risultati dei giochi del giorno (gioco, N°, punti): chi esce dalla lega porta via anche i suoi risultati.

## Note sui contenuti

I database sono generati/curati con assistenza automatica: cifre di calciomercato e alcuni record andrebbero riverificati su una fonte autorevole.
