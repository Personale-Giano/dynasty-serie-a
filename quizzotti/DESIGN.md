# Quizzotti — "L'Almanacco"

La direzione visiva di Quizzotti. Da leggere prima di toccare una pagina.

## L'idea

Quizzotti non è un'app: è **l'almanacco del calcio che trovavi in edicola**, l'album Panini con le figurine storte, la schedina del Totocalcio compilata a penna, la pagella del lunedì sulla rosea. Carta, inchiostro, pennarello, timbri. Fatto a mano, un po' imperfetto, caldo.

Quello che **non** siamo: dark mode con bagliori al neon, vetro smerigliato, gradienti viola, testo sfumato, icone che fluttuano, "eyebrow" maiuscoletti ovunque. Se un elemento sembra uscito da un template SaaS, va tolto.

## Materiali

| Cosa | Come |
|---|---|
| Fondo | carta di giornale calda (`--paper`) con grana e retino a puntini |
| Superfici | figurine color panna (`--card`) con **bordo d'inchiostro 2px** e **ombra piena spostata** (`--shadow-print`), niente sfocature |
| Angoli | piccoli (4–8px): è stampa, non un telefono |
| Colore | tinte piatte da tipografia: rosso schedina, verde prato, blu, giallo figurina. Ogni gioco ha i colori di una "maglia" (`--accent` + `--accent-2` per le strisce) |
| Testo | inchiostro caldo (`--ink`), mai nero puro |

## Caratteri

- **Barlow Condensed** (corsivo, 700–900, maiuscolo) per titoli, numeri, bottoni: il titolista della rosea.
- **Barlow** per il testo.
- **Permanent Marker** solo per gli scarabocchi: note a margine, timbri, voti, frecce. Poco, e mai per testi lunghi.

## Firme visive (usarle, non abusarne)

- **Figurina** (`.card`, `.sticker`): bordo, ombra piena, a volte ruotata di 1–2° (`--tilt`), numerino "N° 07" in alto.
- **Sciarpa** (`.scarf`): fascia a strisce diagonali nei colori del gioco, come divisore o testata.
- **Timbro** (`QZ.fx.stamp`): "ESATTO!", "FUORIGIOCO", "GOL!" che cadono sulla carta con un tonfo.
- **Segno a pennarello** (`QZ.fx.mark`): la X o il cerchio disegnati a mano sulla risposta scelta, come sulla schedina.
- **Ultim'ora** (`.ticker`): striscia rossa scorrevole tipo 90° minuto.
- **Pagella** (`QZ.results` con `ratio`): a fine partita un voto da 4 a 10 con un giudizio da giornalista.

## Movimento

Fisico e breve (150–350 ms): le figurine si **attaccano** (leggero rimbalzo e assestamento), i timbri **picchiano**, il pennarello **disegna**, i fogli **scorrono**. Niente animazioni infinite decorative (eccezione: il ticker). Tutto si spegne con `prefers-reduced-motion`.

## Voce

Italiano da bar dello sport: diretto, ironico, affettuoso. Frasi corte. Gergo calcistico al posto del gergo da app.

- "Fischio d'inizio" invece di "Inizia", "Rigioca" invece di "Riprova", "Torna in panchina" invece di "Indietro".
- Errore: "Fuorigioco!", "Palo!", "Niente da fare". Giusto: "Gol!", "Che giocata", "Esatto".
- Mai: "Ops!", "Fantastico!!", emoji a pioggia, punti esclamativi doppi.

## Regole pratiche per le pagine

- Usa i componenti e i token di `assets/qz.css`; il CSS di pagina va nel `<style>` della pagina e usa solo variabili (`--ink`, `--card`, `--accent`…), mai colori bianchi semitrasparenti da dark mode.
- Ombre: solo `var(--shadow-print)` / `var(--shadow-print-sm)` o nessuna. Niente `box-shadow` sfocati colorati, niente `filter: drop-shadow` luminosi, niente `backdrop-filter`.
- Testo grande e leggibile a un metro di distanza nei giochi di gruppo (telefono sul tavolo).
- Contrasto AA minimo su carta: il testo secondario è `--ink-2`, mai più chiaro di `--ink-3` per testo utile.
