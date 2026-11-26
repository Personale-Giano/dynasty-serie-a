/* ==========================================================================
   QUIZZOTTI — Database: Bingo della Partita
   Eventi che possono succedere in una partita vista in TV.
   text     : breve, deve stare in una casella piccola (max 40 caratteri)
   cat      : Campo, Arbitro e VAR, Panchina, Telecronaca e TV, Tifosi
   g        : (facoltativo) argomento: in una cartella ce n'e' al massimo uno
              per argomento, cosi' non ci sono eventi che si escludono a vicenda
              o che arrivano tutti insieme con lo stesso episodio.
   p        : probabilita' stimata (in %) che succeda in una partita di Serie A
              vista in TV. Serve alla simulazione dei test e a scegliere r2.
   t        : (facoltativo) finestra [da, a] in minuti in cui puo' succedere
              (0-47 primo tempo, 47-97 secondo tempo; senza t: tutta la partita).
   rarity   : rarita' delle cartelle v1 (codici di 4 caratteri): 1 comune,
              2 medio, 3 raro. CONGELATA: cambia le cartelle dei codici vecchi.
   r2       : rarita' delle cartelle v2 (codici di 5 caratteri che iniziano
              con 2): 1 se p >= 90, 2 se p >= 70, 3 se p >= 45; senza r2 (p sotto
              45) l'evento non entra nelle v2. CONGELATA anche questa, per gli
              stessi motivi: per cambiarla serve una v3 (r3).
   f2       : (facoltativo) casella "finale" delle v2: succede quasi sempre
              (p >= 70) ma solo nell'ultima mezz'ora o ai saluti. Ogni linea
              della cartella v2 ne ha una. CONGELATO come r2.
   ritirato : versione da cui l'evento non entra piu' nelle cartelle nuove
              (2 = escluso dalle v2). Resta qui perche' le cartelle v1 lo usano.
   Ogni evento vale per tutte e due le squadre. Conta solo quello che passa
   in diretta dal fischio d'inizio ai saluti di fine partita.
   ATTENZIONE: togliere o riordinare voci, o cambiare rarity, r2, f2, g e
   ritirato, cambia le cartelle generate dai codici. Le voci nuove vanno SOLO
   in fondo, e un evento da "sostituire" si ritira (ritirato) e se ne aggiunge
   uno nuovo in fondo.
   Le v1 usano al massimo le prime 148 voci (VERSIONS[1].pool in games/bingo.js; le
   partite salvate prima di `pool` le prime 113, LEGACY_POOL); le v2 le prime
   185 (VERSIONS[2].pool): eventi aggiunti dopo entreranno solo in una v3.
   p e t servono solo alla simulazione dei test e si possono ritoccare, ma se
   p passa una soglia r2 non si cambia (il test lo segnala): o si lascia p
   dov'era, o la nuova rarita' arriva con una v3.
   ========================================================================== */

const bingoEvents = [
  // ========== CAMPO ==========
  { text: "Calcio d'angolo nei primi 15'", rarity: 1, cat: "Campo", p: 85, t: [0, 15], r2: 2 },
  { text: "Tiro alto sopra la traversa", rarity: 1, cat: "Campo", p: 97, r2: 1 },
  { text: "Parata in tuffo del portiere", rarity: 1, cat: "Campo", p: 90, r2: 1 },
  { text: "Punizione dal limite dell'area", rarity: 1, cat: "Campo", p: 75, r2: 2 },
  { text: "Punizione che sbatte sulla barriera", rarity: 1, cat: "Campo", p: 55, r2: 3 },
  { text: "Gol nel secondo tempo", rarity: 1, cat: "Campo", p: 78, t: [47, 97], r2: 2 },
  { text: "Almeno due gol in partita", rarity: 1, cat: "Campo", p: 73, t: [20, 97], r2: 2 },
  { text: "Tiro deviato in calcio d'angolo", rarity: 1, cat: "Campo", p: 95, r2: 1 },
  { text: "Giocatore a terra, entrano i medici", rarity: 1, cat: "Campo", p: 90, r2: 1 },
  { text: "Il portiere respinge di pugno", rarity: 1, cat: "Campo", p: 80, r2: 2 },
  { text: "Gol di testa", rarity: 2, cat: "Campo", p: 38 },
  { text: "Gol da fuori area", rarity: 2, cat: "Campo", p: 30 },
  { text: "Palo o traversa", rarity: 2, cat: "Campo", g: "legni", p: 50, r2: 3 },
  { text: "Gol su calcio d'angolo", rarity: 2, cat: "Campo", p: 25, ritirato: 2 },
  { text: "Segnano tutte e due le squadre", rarity: 2, cat: "Campo", p: 52, t: [20, 97], r2: 3 },
  { text: "Almeno quattro gol in partita", rarity: 2, cat: "Campo", p: 26, ritirato: 2 },
  { text: "Gol di un giocatore entrato dopo", rarity: 2, cat: "Campo", p: 30, t: [55, 97] },
  { text: "Gol nei primi 15 minuti", rarity: 2, cat: "Campo", g: "pt", p: 34, t: [0, 15] },
  { text: "0-0 a fine primo tempo", rarity: 2, cat: "Campo", g: "pt", p: 32, t: [46, 47] },
  { text: "Gol di un difensore", rarity: 2, cat: "Campo", p: 27, ritirato: 2 },
  { text: "Scontro di teste, gioco fermo", rarity: 2, cat: "Campo", p: 35 },
  { text: "Rimessa laterale lunga in area", rarity: 2, cat: "Campo", p: 45, r2: 3 },
  { text: "Autogol", rarity: 3, cat: "Campo", p: 10, ritirato: 2 },
  { text: "Doppietta di un giocatore", rarity: 3, cat: "Campo", p: 20, ritirato: 2 },
  { text: "Gol su punizione diretta", rarity: 3, cat: "Campo", p: 6, ritirato: 2 },
  { text: "Gol nei primi 5 minuti", rarity: 3, cat: "Campo", g: "pt", p: 13, t: [0, 5], ritirato: 2 },
  { text: "Gol nel recupero del 2° tempo", rarity: 3, cat: "Campo", p: 20, t: [92, 97], ritirato: 2 },
  { text: "Gol nel recupero del 1° tempo", rarity: 3, cat: "Campo", g: "pt", p: 12, t: [45, 47], ritirato: 2 },
  { text: "Rimonta: vince chi era sotto", rarity: 3, cat: "Campo", p: 8, t: [96, 97], ritirato: 2 },
  { text: "Salvataggio sulla linea di porta", rarity: 3, cat: "Campo", p: 15, ritirato: 2 },
  { text: "Due legni nella stessa partita", rarity: 3, cat: "Campo", g: "legni", p: 15, ritirato: 2 },
  { text: "Due gol in meno di due minuti", rarity: 3, cat: "Campo", p: 10, ritirato: 2 },
  { text: "Il portiere va a saltare in area", rarity: 3, cat: "Campo", p: 5, t: [90, 97], ritirato: 2 },
  { text: "Giocatore con la testa fasciata", rarity: 3, cat: "Campo", p: 8, ritirato: 2 },
  { text: "Segna il capitano", rarity: 3, cat: "Campo", p: 30 },
  { text: "Rigore sbagliato o parato", rarity: 3, cat: "Campo", g: "rigore", p: 7, ritirato: 2 },
  { text: "Giocatore con la maschera protettiva", rarity: 3, cat: "Campo", p: 15, t: [0, 3], ritirato: 2 },

  // ========== ARBITRO E VAR ==========
  { text: "Fuorigioco fischiato", rarity: 1, cat: "Arbitro e VAR", p: 99, r2: 1 },
  { text: "Ammonizione nel primo tempo", rarity: 1, cat: "Arbitro e VAR", p: 85, t: [0, 47], r2: 2 },
  { text: "Gialli per tutte e due le squadre", rarity: 1, cat: "Arbitro e VAR", p: 82, t: [20, 97], r2: 2 },
  { text: "Spray per segnare la barriera", rarity: 1, cat: "Arbitro e VAR", p: 90, r2: 1 },
  { text: "Capannello attorno all'arbitro", rarity: 1, cat: "Arbitro e VAR", p: 85, r2: 2 },
  { text: "Recupero di 3+ minuti nel 2° tempo", rarity: 1, cat: "Arbitro e VAR", g: "rec2", p: 97, t: [91, 92], f2: true, r2: 1 },
  { text: "Rigore assegnato", rarity: 2, cat: "Arbitro e VAR", g: "rigore", p: 30 },
  { text: "L'arbitro va a rivedere al monitor", rarity: 2, cat: "Arbitro e VAR", p: 33 },
  { text: "Il VAR annulla un gol", rarity: 2, cat: "Arbitro e VAR", g: "annullato", p: 15, ritirato: 2 },
  { text: "Gol annullato per fuorigioco", rarity: 2, cat: "Arbitro e VAR", g: "annullato", p: 25, ritirato: 2 },
  { text: "Almeno sei ammonizioni", rarity: 2, cat: "Arbitro e VAR", p: 35, t: [60, 97] },
  { text: "Recupero di 5+ minuti nel 2° tempo", rarity: 2, cat: "Arbitro e VAR", g: "rec2", p: 65, t: [91, 92], r2: 3 },
  { text: "Recupero di 3+ minuti nel 1° tempo", rarity: 2, cat: "Arbitro e VAR", p: 45, t: [45, 46], r2: 3 },
  { text: "Il pallone colpisce l'arbitro", rarity: 2, cat: "Arbitro e VAR", p: 30 },
  { text: "Ammonito uno entrato dalla panchina", rarity: 2, cat: "Arbitro e VAR", p: 35, t: [60, 97] },
  { text: "Cartellino rosso", rarity: 3, cat: "Arbitro e VAR", p: 20, ritirato: 2 },
  { text: "Ammonizione nei primi 10 minuti", rarity: 3, cat: "Arbitro e VAR", p: 18, t: [0, 10], ritirato: 2 },
  { text: "Rigore concesso dopo il VAR", rarity: 3, cat: "Arbitro e VAR", g: "rigore", p: 10, ritirato: 2 },
  { text: "Il VAR toglie un rigore", rarity: 3, cat: "Arbitro e VAR", g: "rigore", p: 5, ritirato: 2 },
  { text: "Due rigori nella stessa partita", rarity: 3, cat: "Arbitro e VAR", g: "rigore", p: 4, ritirato: 2 },
  { text: "Ammonito un portiere", rarity: 3, cat: "Arbitro e VAR", p: 12, ritirato: 2 },
  { text: "Giallo per simulazione", rarity: 3, cat: "Arbitro e VAR", p: 8, ritirato: 2 },
  { text: "Giallo per la maglia tolta", rarity: 3, cat: "Arbitro e VAR", p: 5, ritirato: 2 },

  // ========== PANCHINA ==========
  { text: "Doppio cambio nello stesso momento", rarity: 1, cat: "Panchina", p: 97, t: [50, 92], f2: true, r2: 1 },
  { text: "Primo cambio prima del 60'", rarity: 1, cat: "Panchina", p: 85, t: [30, 60], r2: 2 },
  { text: "Un cambio dopo l'85'", rarity: 1, cat: "Panchina", p: 75, t: [85, 97], f2: true, r2: 2 },
  { text: "Una squadra fa tutti e 5 i cambi", rarity: 1, cat: "Panchina", p: 90, t: [70, 97], f2: true, r2: 1 },
  { text: "Inquadrano le riserve che si scaldano", rarity: 1, cat: "Panchina", p: 95, r2: 1 },
  { text: "Allenatore che urla indicazioni", rarity: 1, cat: "Panchina", p: 97, r2: 1 },
  { text: "Cambio tra primo e secondo tempo", rarity: 2, cat: "Panchina", p: 55, t: [47, 48], r2: 3 },
  { text: "Triplo cambio nello stesso momento", rarity: 2, cat: "Panchina", p: 45, t: [55, 92], r2: 3 },
  { text: "Cambio per infortunio", rarity: 2, cat: "Panchina", p: 50, r2: 3 },
  { text: "Esce il capitano: fascia a un altro", rarity: 2, cat: "Panchina", p: 55, t: [55, 95], r2: 3 },
  { text: "Stretta di mano tra gli allenatori", rarity: 2, cat: "Panchina", p: 60, t: [96, 97], r2: 3 },
  { text: "Cambio nel primo tempo", rarity: 3, cat: "Panchina", p: 30, t: [0, 47] },
  { text: "Allenatore ammonito", rarity: 3, cat: "Panchina", p: 15, ritirato: 2 },
  { text: "Allenatore con il cappellino", rarity: 3, cat: "Panchina", p: 10, ritirato: 2 },
  { text: "Inquadrano la lavagnetta tattica", rarity: 3, cat: "Panchina", p: 15, ritirato: 2 },

  // ========== TELECRONACA E TV ==========
  { text: "Replay al rallentatore di un fallo", rarity: 1, cat: "Telecronaca e TV", p: 99, r2: 1 },
  { text: "Grafica del possesso palla", rarity: 1, cat: "Telecronaca e TV", p: 97, r2: 1 },
  { text: "Parla l'inviato a bordocampo", rarity: 1, cat: "Telecronaca e TV", p: 90, r2: 1 },
  { text: "Il telecronista ricorda un ex", rarity: 1, cat: "Telecronaca e TV", p: 75, r2: 2 },
  { text: "Annunciano il migliore in campo", rarity: 1, cat: "Telecronaca e TV", p: 85, t: [85, 97], f2: true, r2: 2 },
  { text: "Replay del gol da un'altra camera", rarity: 1, cat: "Telecronaca e TV", p: 90, r2: 1 },
  { text: "Il telecronista dice «che partita!»", rarity: 2, cat: "Telecronaca e TV", p: 35, t: [45, 97] },
  { text: "Il telecronista dice «clamoroso»", rarity: 2, cat: "Telecronaca e TV", p: 45, r2: 3 },
  { text: "Il telecronista dice «mamma mia»", rarity: 2, cat: "Telecronaca e TV", p: 40 },
  { text: "Mostrano le linee del fuorigioco", rarity: 2, cat: "Telecronaca e TV", p: 55, r2: 3 },
  { text: "Nominano il fantacalcio", rarity: 2, cat: "Telecronaca e TV", p: 45, r2: 3 },
  { text: "Danno il risultato di un altro campo", rarity: 2, cat: "Telecronaca e TV", p: 55, r2: 3 },
  { text: "Il telecronista sbaglia un nome", rarity: 2, cat: "Telecronaca e TV", p: 35 },
  { text: "Inquadrano un vip in tribuna", rarity: 2, cat: "Telecronaca e TV", p: 40 },
  { text: "Inquadrano il presidente in tribuna", rarity: 2, cat: "Telecronaca e TV", p: 60, r2: 3 },
  { text: "Annunciano il numero di spettatori", rarity: 2, cat: "Telecronaca e TV", p: 75, t: [30, 97], r2: 2 },
  // dipende dal telecronista e il gergo non lo conoscono tutti: ritirato, al suo posto «Occasione da gol dopo il 90'»
  { text: "Il telecronista dice «zona Cesarini»", rarity: 3, cat: "Telecronaca e TV", p: 10, ritirato: 2 },
  { text: "Il commento tecnico: «ai miei tempi»", rarity: 3, cat: "Telecronaca e TV", p: 5, ritirato: 2 },
  { text: "«Gol dell'ex» in telecronaca", rarity: 3, cat: "Telecronaca e TV", p: 10, ritirato: 2 },
  { text: "Annunciano un esordio in Serie A", rarity: 3, cat: "Telecronaca e TV", p: 12, ritirato: 2 },
  { text: "Problemi tecnici alla diretta", rarity: 3, cat: "Telecronaca e TV", p: 5, ritirato: 2 },

  // ========== TIFOSI ==========
  { text: "Striscione inquadrato in TV", rarity: 1, cat: "Tifosi", p: 90, r2: 1 },
  { text: "Esultanza sotto la curva", rarity: 1, cat: "Tifosi", p: 85, r2: 2 },
  { text: "Tifoso con le mani nei capelli", rarity: 1, cat: "Tifosi", p: 85, r2: 2 },
  { text: "Inquadrano il settore ospiti", rarity: 1, cat: "Tifosi", p: 85, r2: 2 },
  { text: "La squadra va a salutare la curva", rarity: 1, cat: "Tifosi", p: 85, t: [96, 97], f2: true, r2: 2 },
  { text: "Inquadrano un bambino sugli spalti", rarity: 1, cat: "Tifosi", p: 80, r2: 2 },
  { text: "Fumogeni o torce accese", rarity: 2, cat: "Tifosi", p: 40 },
  { text: "Fischi a un ex in campo", rarity: 2, cat: "Tifosi", p: 20, ritirato: 2 },
  { text: "Applausi a chi esce sostituito", rarity: 2, cat: "Tifosi", p: 80, t: [55, 95], f2: true, r2: 2 },
  { text: "Tifoso inquadrato con un cartello", rarity: 2, cat: "Tifosi", p: 60, r2: 3 },
  { text: "Fischi a fine primo tempo", rarity: 2, cat: "Tifosi", p: 30, t: [46, 47] },
  { text: "Bandierone in curva inquadrato", rarity: 2, cat: "Tifosi", p: 60, r2: 3 },
  { text: "Ola sugli spalti", rarity: 3, cat: "Tifosi", p: 5, ritirato: 2 },
  { text: "Invasione di campo", rarity: 3, cat: "Tifosi", p: 2, ritirato: 2 },
  { text: "Gioco fermo per cori o oggetti", rarity: 3, cat: "Tifosi", p: 5, ritirato: 2 },
  { text: "Inquadrano la mascotte", rarity: 3, cat: "Tifosi", p: 10, ritirato: 2 },
  { text: "Inquadrano un tifoso travestito", rarity: 3, cat: "Tifosi", p: 20, ritirato: 2 },

  // ========== AGGIUNTE (novembre 2026) ==========
  // Solo in fondo: le partite salvate prima ricordano quanti eventi c'erano
  // (campo `pool`) e si rigenerano uguali.
  { text: "Gol in contropiede", rarity: 2, cat: "Campo", p: 35 },
  { text: "Tunnel a un avversario", rarity: 2, cat: "Campo", p: 45, r2: 3 },
  { text: "Gol con un tiro deviato", rarity: 2, cat: "Campo", p: 20, ritirato: 2 },
  { text: "Tentativo in rovesciata", rarity: 3, cat: "Campo", p: 20, ritirato: 2 },
  { text: "Giocatore che perde lo scarpino", rarity: 3, cat: "Campo", p: 30 },
  { text: "Si cambia il pallone", rarity: 3, cat: "Campo", p: 20, ritirato: 2 },
  { text: "Assist di tacco", rarity: 3, cat: "Campo", p: 5, ritirato: 2 },
  { text: "Gol del pareggio dopo l'80'", rarity: 3, cat: "Campo", p: 8, t: [80, 97], ritirato: 2 },
  // si sa gia' al fischio d'inizio: non e' un evento della partita
  { text: "Si gioca sotto la pioggia", rarity: 3, cat: "Campo", p: 15, t: [0, 1], ritirato: 2 },
  { text: "Proteste per un fallo di mano", rarity: 1, cat: "Arbitro e VAR", p: 80, r2: 2 },
  { text: "Rigore reclamato, si gioca", rarity: 1, cat: "Arbitro e VAR", p: 80, r2: 2 },
  { text: "Gol confermato dopo il controllo VAR", rarity: 2, cat: "Arbitro e VAR", p: 40 },
  { text: "L'arbitro fa giocare il vantaggio", rarity: 1, cat: "Arbitro e VAR", p: 97, r2: 1 },
  { text: "Giallo per proteste", rarity: 2, cat: "Arbitro e VAR", p: 50, r2: 3 },
  { text: "Giallo per perdita di tempo", rarity: 2, cat: "Arbitro e VAR", p: 45, t: [60, 97], r2: 3 },
  { text: "Gol annullato per fallo di mano", rarity: 3, cat: "Arbitro e VAR", g: "annullato", p: 5, ritirato: 2 },
  { text: "Mister inquadrato a braccia conserte", rarity: 1, cat: "Panchina", p: 90, r2: 1 },
  { text: "Il mister protesta col quarto uomo", rarity: 2, cat: "Panchina", p: 80, r2: 2 },
  { text: "Il vice parla all'orecchio del mister", rarity: 2, cat: "Panchina", p: 50, r2: 3 },
  { text: "Panchina in piedi a protestare", rarity: 2, cat: "Panchina", p: 60, r2: 3 },
  { text: "Cambio del portiere", rarity: 3, cat: "Panchina", p: 4, ritirato: 2 },
  { text: "Grafica dei tiri in porta", rarity: 1, cat: "Telecronaca e TV", p: 85, t: [30, 97], r2: 2 },
  { text: "Mostrano la classifica", rarity: 1, cat: "Telecronaca e TV", p: 75, r2: 2 },
  { text: "Il telecronista dice «pazzesco»", rarity: 2, cat: "Telecronaca e TV", p: 40 },
  { text: "Ricordano l'ultimo precedente", rarity: 2, cat: "Telecronaca e TV", p: 75, r2: 2 },
  { text: "Il commento tecnico critica l'arbitro", rarity: 2, cat: "Telecronaca e TV", p: 60, r2: 3 },
  { text: "Inquadratura dalla spidercam", rarity: 2, cat: "Telecronaca e TV", p: 70, r2: 2 },
  { text: "Si parla del mercato", rarity: 2, cat: "Telecronaca e TV", p: 55, r2: 3 },
  // dipende da regia ed emittente, e in TV si vede di rado: ritirato
  { text: "Mappa di calore di un giocatore", rarity: 3, cat: "Telecronaca e TV", p: 15, ritirato: 2 },
  { text: "Coreografia in curva", rarity: 2, cat: "Tifosi", p: 35, t: [0, 3] },
  { text: "Cori contro l'arbitro", rarity: 2, cat: "Tifosi", p: 60, r2: 3 },
  { text: "Tifosi che escono prima della fine", rarity: 2, cat: "Tifosi", p: 50, t: [80, 97], r2: 3 },
  { text: "Tifoso che prende il pallone al volo", rarity: 2, cat: "Tifosi", p: 55, r2: 3 },
  { text: "Inquadrano settori vuoti", rarity: 2, cat: "Tifosi", p: 40 },
  { text: "Applausi per un avversario", rarity: 3, cat: "Tifosi", p: 15, ritirato: 2 },

  // ========== AGGIUNTE PER LE CARTELLE v2 (26 novembre 2026) ==========
  // Le cartelle v1 non le vedono mai (si fermano alle prime 148 voci).
  // «rarity» qui serve solo alla validita' del database: conta r2.
  { text: "Occasione da gol dopo il 90'", rarity: 3, cat: "Campo", p: 50, t: [90, 97], r2: 3 },
  { text: "Gol nel primo tempo", rarity: 2, cat: "Campo", g: "pt", p: 68, t: [0, 47], r2: 3 },
  { text: "Almeno tre gol in partita", rarity: 3, cat: "Campo", p: 48, t: [40, 97], r2: 3 },
  { text: "Almeno un gol in partita", rarity: 1, cat: "Campo", p: 93, r2: 1 },
  { text: "Primo gol prima della mezz'ora", rarity: 3, cat: "Campo", g: "pt", p: 55, t: [0, 30], r2: 3 },
  { text: "Squadra in vantaggio a fine 1° tempo", rarity: 3, cat: "Campo", g: "pt", p: 55, t: [46, 47], r2: 3 },
  { text: "Calcio d'angolo nei primi 5'", rarity: 3, cat: "Campo", p: 45, t: [0, 5], r2: 3 },
  { text: "Rinvio che finisce in tribuna", rarity: 1, cat: "Campo", p: 90, r2: 1 },
  { text: "Il portiere riparte corto dal fondo", rarity: 1, cat: "Campo", p: 95, r2: 1 },
  { text: "Barriera che salta sulla punizione", rarity: 2, cat: "Campo", p: 65, r2: 3 },
  { text: "Giocatore con i crampi", rarity: 3, cat: "Campo", p: 55, t: [65, 97], r2: 3 },
  { text: "Ammonizione nel secondo tempo", rarity: 1, cat: "Arbitro e VAR", p: 92, t: [47, 97], r2: 1 },
  { text: "Almeno quattro ammonizioni", rarity: 2, cat: "Arbitro e VAR", p: 62, t: [50, 97], r2: 3 },
  { text: "Ammonito un difensore", rarity: 2, cat: "Arbitro e VAR", p: 80, r2: 2 },
  { text: "Gioco fermo per un controllo VAR", rarity: 3, cat: "Arbitro e VAR", p: 55, r2: 3 },
  { text: "Il mister abbraccia chi esce", rarity: 2, cat: "Panchina", p: 70, t: [55, 95], f2: true, r2: 2 },
  { text: "Ultimo cambio dopo il 90'", rarity: 3, cat: "Panchina", p: 40, t: [90, 97] },
  { text: "Grafica con le formazioni", rarity: 1, cat: "Telecronaca e TV", p: 95, t: [0, 5], r2: 1 },
  { text: "Grafica dei calci d'angolo", rarity: 2, cat: "Telecronaca e TV", p: 60, t: [30, 97], r2: 3 },
  { text: "Cori dopo un gol", rarity: 1, cat: "Tifosi", p: 88, r2: 2 },
  { text: "Tifosi in piedi ad applaudire", rarity: 2, cat: "Tifosi", p: 75, r2: 2 },
  { text: "Ammonizione dopo il 75'", rarity: 2, cat: "Arbitro e VAR", p: 80, t: [75, 97], f2: true, r2: 2 },
  { text: "Calcio d'angolo dopo l'80'", rarity: 2, cat: "Campo", p: 88, t: [80, 97], f2: true, r2: 2 },
  { text: "Parata del portiere dopo l'80'", rarity: 2, cat: "Campo", p: 80, t: [80, 97], f2: true, r2: 2 },
  { text: "Tiro in porta dopo l'85'", rarity: 2, cat: "Campo", p: 80, t: [85, 97], f2: true, r2: 2 },
  { text: "Un cambio dopo il 75'", rarity: 1, cat: "Panchina", p: 97, t: [75, 95], f2: true, r2: 1 },
  { text: "Grafica con le statistiche finali", rarity: 2, cat: "Telecronaca e TV", p: 85, t: [96, 97], f2: true, r2: 2 },
  { text: "Abbraccio tra avversari a fine gara", rarity: 2, cat: "Campo", p: 85, t: [96, 97], f2: true, r2: 2 },
  { text: "Fallo fischiato nel recupero", rarity: 1, cat: "Arbitro e VAR", p: 95, t: [91, 97], f2: true, r2: 1 },
  { text: "Punizione dopo l'85'", rarity: 2, cat: "Campo", p: 88, t: [85, 97], f2: true, r2: 2 },
  { text: "Giocatore a terra dopo il 75'", rarity: 2, cat: "Campo", p: 85, t: [75, 97], f2: true, r2: 2 },
  { text: "Fuorigioco dopo l'80'", rarity: 2, cat: "Arbitro e VAR", p: 75, t: [80, 97], f2: true, r2: 2 },
  { text: "Mister in piedi nel finale", rarity: 2, cat: "Panchina", p: 85, t: [80, 97], f2: true, r2: 2 },
  { text: "Inquadrano il mister al fischio finale", rarity: 2, cat: "Telecronaca e TV", p: 85, t: [96, 97], f2: true, r2: 2 },
  { text: "Il risultato cambia dopo il 70'", rarity: 3, cat: "Campo", p: 52, t: [70, 97], r2: 3 },
  { text: "Fischi per una perdita di tempo", rarity: 3, cat: "Tifosi", p: 60, t: [70, 97], r2: 3 },
  { text: "Scambio di maglie a fine partita", rarity: 3, cat: "Campo", p: 50, t: [96, 97], r2: 3 }
];

if (typeof module !== "undefined" && module.exports) { module.exports = { bingoEvents }; }
