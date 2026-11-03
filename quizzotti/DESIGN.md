# Quizzotti — "Riflettori"

La direzione visiva di Quizzotti. Da leggere prima di toccare una pagina.

## L'idea

**Lo stadio di sera, con i fari accesi.** Quizzotti si gioca sotto i riflettori: nero pieno, le torri dei fari agli angoli, il prato in fondo, e tutti i numeri che contano (tempo, punti, premi, classifiche) sul **tabellone luminoso a LED** come negli stadi italiani. È sportivo, fisico, riconoscibile.

Quello che **non** siamo: vetro smerigliato, sfumature viola, bagliori ovunque, card morbide e arrotondate da template SaaS. Le uniche cose che "brillano" sono quelle che brillano davvero in uno stadio: i fari e i LED del tabellone.

## Materiali

| Cosa | Come |
|---|---|
| Fondo | nero quasi pieno (`--bg`) con i coni di luce dei fari dall'alto e il prato a strisce in basso |
| Superfici | pannelli scuri (`--panel`, `--panel-2`) con bordo sottile 1px (`--line`), angoli piccoli (3–6px), **niente ombre sfocate** |
| Tabellone | sfondo nero puro, cornice grigio scuro spessa (`.board`), numeri e scritte in **DotGothic16** color LED (`--led` ambra, `--led-red`, `--led-green`) con un filo di alone: è l'unico posto dove l'alone è permesso |
| Colore del gioco | `--accent`, una tinta viva per gioco, usata per il filo a sinistra della domanda, la scelta attiva, il bottone principale (con sopra `--on-accent`, scuro) |
| Testo | `--text` (quasi bianco), `--text-2` secondario, `--muted` solo per etichette piccole |

## Caratteri

- **Archivo** (700–900) per titoli, domande, bottoni. Maiuscolo solo per etichette piccole con spaziatura larga.
- **Archivo** (400–600) per il testo.
- **DotGothic16** solo per ciò che sta su un tabellone: tempo, punteggi, premi, posizioni, lettere delle risposte, livello, esiti ("GOL!", "FUORI").

## Firme visive

- **Il tabellone** (`.board` con `.board__cell`, `.led`): tempo, domanda, punti in cifre a LED. Ogni gioco ce l'ha in alto.
- **Il filo di luce**: la domanda/carta attiva ha un filo `--accent` a sinistra (`.card--glow`).
- **Le scritte del tabellone** (`QZ.fx.stamp`): l'esito appare come una scritta a LED che si accende ("GOL!", "PALO", "FUORIGIOCO"), verde, rossa o ambra.
- **I fari** (`.qz-bg`): due torri agli angoli in alto con i coni di luce; il prato a strisce in fondo alla pagina.
- **La pagella** (`QZ.results` con `ratio`): a fine partita il voto da 4 a 10 sul tabellone, con il giudizio del cronista.

## Movimento

Secco e da stadio: le scritte LED si **accendono** (sfarfallio a scatti), i pannelli **entrano** di lato, i numeri **scorrono** come un contatore. Niente fluttuazioni infinite (eccezioni: la striscia del tabellone pubblicitario e il battito del tempo che sta per scadere). Tutto si spegne con `prefers-reduced-motion`.

## Voce

Italiano da stadio: diretto, ironico, affettuoso. Frasi corte. Gergo calcistico al posto del gergo da app.

- "Fischio d'inizio" invece di "Inizia", "Rigioca" invece di "Riprova", "Torna in panchina" invece di "Indietro".
- Errore: "Fuorigioco", "Palo", "Niente da fare". Giusto: "Gol!", "Che giocata", "Esatto".
- Mai: "Ops!", "Fantastico!!", emoji a pioggia, punti esclamativi doppi.

## Regole pratiche per le pagine

- Usa componenti e token di `assets/qz.css`; il CSS di pagina va nel `<style>` della pagina e usa solo variabili (`--bg`, `--panel`, `--line`, `--text`, `--led`, `--accent`…).
- Bordi: `1px solid var(--line)` (o `--line-2` per i bordi in evidenza). Il tabellone usa la cornice `.board`. Niente bordi chiari spessi, niente ombre colorate sfocate, niente `backdrop-filter`.
- I vecchi token della carta (`--ink`, `--card`, `--paper`, `--shadow-print*`, `--font-hand`) esistono ancora solo come alias di compatibilità: nel codice nuovo non usarli.
- Testo grande e leggibile a un metro di distanza nei giochi di gruppo (telefono sul tavolo).
- Contrasto AA: testo utile mai più scuro di `--text-2` su `--panel`. Il colore del gioco come testo è `var(--accent-ink)`.
- Timbri, segni e colori sono decorativi (`aria-hidden`): l'esito va anche **detto**, con `opts.say` di `QZ.fx.stamp` o con `QZ.say()`. Il cronometro non si annuncia a ogni secondo.
- Ogni schermata ha un solo `h1`. Comandi di gioco alti almeno 44px.
