#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Testi per Google e anteprime delle pagine di gioco
   Per ogni gioco del registro QZ.GAMES (assets/qz.js) scrive nella pagina:
   - <title>, description, Open Graph e Twitter (immagine assets/og/<id>.jpg)
   - icone, manifest e preload del carattere principale (niente Google Fonts)
   - i dati strutturati (WebApplication, BreadcrumbList, FAQPage)
   - in fondo al <main> un blocco statico: come si gioca, tre domande
     frequenti e quattro link ad altri giochi (lo stesso testo del FAQPage)
   Nella home aggiorna l'elenco statico dei giochi (tra <!-- qz:elenco -->).

   Uso: node scripts/seo-pagine.js            (salta le pagine in SALTA)
        node scripts/seo-pagine.js --tutte    (anche quelle)
   Si puo' rilanciare quante volte si vuole: sostituisce, non aggiunge.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://quizotti.altervista.org/quizzotti/';
// pagine su cui sta lavorando qualcun altro: si fanno con --tutte quando sono libere
const SALTA = [];

/** Il registro dei giochi, letto direttamente da qz.js. */
function registry() {
    const src = fs.readFileSync(path.join(ROOT, 'assets/qz.js'), 'utf8');
    const m = src.match(/QZ\.GAMES = (\[[\s\S]*?\n\s*\]);/);
    if (!m) throw new Error('QZ.GAMES non trovato in assets/qz.js');
    return Function('"use strict"; return ' + m[1])();
}

/* ---------------------------------------------------------------------------
   I testi di ogni gioco. how: 4-6 righe; faq: 3 domande; more: 4 pagine.
   ------------------------------------------------------------------------- */
const TESTI = {
    cvem: {
        title: 'Chi Vuol Essere Milionario calcio: quiz gratis · Quizzotti',
        desc: 'Il quiz di calcio in stile Chi Vuol Essere Milionario: 15 domande sempre più difficili, quattro aiuti e due soglie. Gioca gratis online, senza app e senza iscrizioni.',
        how: [
            'Rispondi a quindici domande di calcio, dalla più facile alla più difficile.',
            'Ogni domanda ha quattro risposte e una sola è giusta.',
            'Hai quattro aiuti da usare quando vuoi, una volta sola a partita.',
            'Due soglie sicure ti salvano una parte del montepremi se sbagli.',
            'Puoi ritirarti prima di rispondere e tenere quello che hai vinto.'
        ],
        faq: [
            ['Quanto costa giocare?', 'Niente: Quizzotti è gratis, senza app, senza account e senza pubblicità dentro il gioco. Il milione è finto, il divertimento no.'],
            ['Le domande sono sempre le stesse?', 'No. Le domande escono a caso da un archivio grande e non si ripetono finché non le hai viste quasi tutte.'],
            ['Esiste anche una versione non di calcio?', 'Sì: il Milionario normale ha le stesse regole con domande di cultura generale, dalla musica alla geografia.']
        ],
        more: ['MilionarioNormale.html', 'CadutaLibera.html', 'GiocatoreDelGiorno.html', 'Jeopardy.html']
    },
    jeopardy: {
        title: 'Jeopardy calcio: quiz a squadre gratis · Quizzotti',
        desc: 'Il Jeopardy del calcio: un tabellone a categorie (Serie A, Champions, Mondiali, calciomercato, leggende) da 100 a 500 punti. Da 1 a 6 squadre, gratis online.',
        how: [
            'Si gioca da 1 a 6 squadre, con un solo telefono o sulla TV.',
            'A turno ogni squadra sceglie una casella del tabellone: categoria e valore, da 100 a 500 punti.',
            'Risposta giusta: i punti vanno alla squadra. Sbagliata: si perdono, e gli altri possono rubarli.',
            'Da qualche parte c\'è la doppia posta: chi la trova punta quanto vuole.',
            'A tabellone pulito c\'è il gran finale, con la puntata segreta.'
        ],
        faq: [
            ['Serve un presentatore?', 'Conviene: uno legge le domande e controlla le risposte, gli altri giocano. Ma il telefono può passare di mano a ogni turno.'],
            ['Si può giocare da soli?', 'Sì, con una squadra sola per allenarsi; il bello però è sfidarsi in compagnia.'],
            ['C\'è una versione di cultura generale?', 'Sì, il Jeopardy normale: 14 categorie, dalla musica alla storia, anche con le foto.']
        ],
        more: ['JeopardyNormale.html', 'TuttiTV.html', 'Taboo.html', 'CVEM.html']
    },
    avantiunaltro: {
        title: 'Avanti un Altro calcio: il quiz al contrario · Quizzotti',
        desc: 'Il quiz di calcio al contrario, in stile Avanti un Altro: a ogni domanda scegli la risposta sbagliata per salire i gradini. Oltre 230 domande, gratis online.',
        how: [
            'A ogni domanda di calcio ci sono due risposte: una giusta e una sbagliata.',
            'Per andare avanti devi scegliere quella sbagliata.',
            'Ogni risposta azzeccata al contrario ti fa salire un gradino.',
            'Prendi quella giusta per sbaglio? Si riparte, secondo la regola che hai scelto.',
            'Si può giocare anche col tempo a risposta, per chi vuole soffrire.'
        ],
        faq: [
            ['Perché devo scegliere la risposta sbagliata?', 'È il gioco: come nel gran finale di Avanti un Altro, sapere la risposta giusta serve a evitarla.'],
            ['Quante domande ci sono?', 'Oltre 230 domande di calcio, che escono a caso e non si ripetono subito.'],
            ['Serve iscriversi?', 'No. Si apre la pagina e si gioca, anche dal telefono.']
        ],
        more: ['CadutaLibera.html', 'CVEM.html', 'Intruso.html', 'SopraOSotto.html']
    },
    citazioni: {
        title: 'Chi l\'ha detto: quiz sulle frasi celebri del calcio · Quizzotti',
        desc: 'Quiz sulle frasi celebri del calcio: leggi la citazione e indovina il calciatore o l\'allenatore che l\'ha detta. Oltre 180 frasi, scrivi il nome o usa le opzioni.',
        how: [
            'Sul tabellone appare una frase famosa del calcio.',
            'Scrivi il nome di chi l\'ha detta: un calciatore, un allenatore, un presidente.',
            'Se non ti viene, chiedi le opzioni: la risposta vale meno, ma vale.',
            'Scegli quante frasi per partita e quanto tempo hai per rispondere.'
        ],
        faq: [
            ['Devo scrivere il nome esatto?', 'Basta il cognome o il nome con cui è conosciuto: gli errori di battitura piccoli vengono perdonati.'],
            ['Che frasi ci sono?', 'Conferenze stampa, interviste a bordocampo e battute storiche, da «Zero tituli» in giù: più di 180 citazioni.'],
            ['Si gioca da soli?', 'Sì, è un quiz da soli, perfetto in pausa pranzo o in treno.']
        ],
        more: ['CVEM.html', 'Intruso.html', 'GiocatoreDelGiorno.html', 'Cruciverba.html']
    },
    taboo: {
        title: 'Taboo calcio online gratis · Quizzotti',
        desc: 'Taboo a tema calcio da giocare online con un solo telefono: fai indovinare calciatori, squadre, stadi e trofei senza dire le parole vietate. Oltre 2.800 carte.',
        how: [
            'Si gioca a squadre, da 2 a 6, passandosi un solo telefono.',
            'Chi spiega vede la parola da far indovinare e le parole vietate sotto.',
            'La sua squadra deve indovinare prima che scada il tempo.',
            'Se dice una parola vietata, l\'avversario che controlla preme il fischietto.',
            'Ogni parola indovinata è un punto; i passi sono limitati.'
        ],
        faq: [
            ['Quante carte ci sono?', 'Oltre 2.800 carte di calcio: calciatori, allenatori, squadre, stadi, trofei e modi di dire del pallone.'],
            ['Serve un tabellone o delle carte vere?', 'No, basta un telefono: carte, tempo e punteggio li tiene Quizzotti.'],
            ['Quanti giocatori servono?', 'Almeno quattro, per fare due squadre da due. Più siete, più ci si diverte.']
        ],
        more: ['IntesaVincente.html', 'MrWhite.html', 'Bomba.html', 'Catena.html']
    },
    intesavincente: {
        title: 'Intesa Vincente calcio: gioco a squadre gratis · Quizzotti',
        desc: 'Intesa Vincente a tema calcio: due suggeritori danno una parola a testa, chi indovina prenota e risponde prima del fischio. Da 2 a 6 squadre, su un solo telefono.',
        how: [
            'Ogni squadra ha due suggeritori e uno che deve indovinare.',
            'I suggeritori vedono la parola e dicono una parola a testa, a turno.',
            'Chi indovina prenota, ferma il cronometro e risponde.',
            'Chi sbaglia o tentenna perde la parola e un punto.',
            'Più parole prima del fischio, più punti per la squadra.'
        ],
        faq: [
            ['Quanti giocatori servono?', 'Almeno tre per squadra sarebbe l\'ideale; da 2 a 6 squadre.'],
            ['Si può scegliere il tempo?', 'Sì: tempo per turno, numero di giri, passi e tempo per rispondere si scelgono prima di iniziare.'],
            ['Le parole sono solo di calcio?', 'Sì: calciatori, squadre, allenatori e parole del pallone.']
        ],
        more: ['Taboo.html', 'Catena.html', 'sfidaEredita.html', 'MrWhite.html']
    },
    mrwhite: {
        title: 'Mr. White calcio: gioco di gruppo online gratis · Quizzotti',
        desc: 'Mr. White a tema calcio: tutti vedono lo stesso calciatore segreto tranne uno, che deve bluffare. Passatevi il telefono e smascheratelo. Da 3 a 12 giocatori.',
        how: [
            'Ci si passa il telefono: ognuno guarda di nascosto il calciatore segreto.',
            'Uno di voi è Mr. White: non vede niente e deve fingere di sapere.',
            'A turno ognuno dice una parola sul calciatore, senza essere troppo chiaro.',
            'Poi si vota chi è Mr. White.',
            'Se lo scoprite, ha un\'ultima occasione: indovinare il calciatore.'
        ],
        faq: [
            ['Quanti giocatori servono?', 'Da 3 a 12, con un solo telefono.'],
            ['Cos\'è l\'Infiltrato?', 'Una variante: l\'Infiltrato vede un calciatore simile ma diverso, e non sa di essere l\'Infiltrato.'],
            ['Si può aiutare Mr. White?', 'Sì, con l\'aiutino facoltativo vede l\'iniziale sulla maglia.']
        ],
        more: ['Bomba.html', 'Taboo.html', 'Bingo.html', 'NomiCose.html']
    },
    bomba: {
        title: 'Bomba: gioco di calcio di gruppo col telefono · Quizzotti',
        desc: 'Il gioco della bomba a tema calcio: esce un tema, chi ha il telefono dice una risposta giusta e lo passa. Quando la bomba scoppia, chi ce l\'ha perde. Da 2 a 12.',
        how: [
            'Esce un tema di calcio, per esempio «squadre di Serie A».',
            'Chi tiene il telefono dice una risposta giusta e lo passa al vicino.',
            'La miccia è nascosta e il ticchettio accelera.',
            'Quando la bomba scoppia, chi ce l\'ha in mano perde il round.',
            'Si sceglie il numero di round, la durata della miccia e la difficoltà dei temi.'
        ],
        faq: [
            ['Quanti giocatori servono?', 'Da 2 a 12, seduti in cerchio con un telefono solo.'],
            ['Chi decide se la risposta è giusta?', 'Il gruppo: se una risposta non va bene, chi ha la bomba deve dirne un\'altra.'],
            ['Quanto dura la miccia?', 'È casuale e non si vede: si può scegliere se corta, media o lunga.']
        ],
        more: ['MrWhite.html', 'Taboo.html', 'NomiCose.html', 'Catena.html']
    },
    sfidaeredita: {
        title: 'Derby delle Parole: quiz di calcio stile L\'Eredità · Quizzotti',
        desc: 'Il Derby delle Parole è il quiz di calcio a squadre in stile L\'Eredità: dalla definizione, lettera dopo lettera, indovina la parola prima che finisca il tuo tempo.',
        how: [
            'Due squadre, ognuna con il suo cronometro, come in una partita a scacchi.',
            'Esce una definizione di calcio e la parola si scopre una lettera alla volta.',
            'Chi la sa tira in porta: risponde e ferma il proprio tempo.',
            'Si risponde scrivendo, con un arbitro che giudica o a voce.',
            'Chi resta senza tempo perde il derby.'
        ],
        faq: [
            ['È come L\'Eredità?', 'Si ispira ai giochi di parole delle definizioni dei quiz TV come L\'Eredità, ma tutto a tema calcio e a squadre.'],
            ['Si può rispondere a voce?', 'Sì, se il browser lo permette; altrimenti si scrive, oppure decide l\'arbitro.'],
            ['Quanti giocatori servono?', 'Due squadre, anche di una persona sola ciascuna.']
        ],
        more: ['Catena.html', 'IntesaVincente.html', 'Cruciverba.html', 'Taboo.html']
    },
    giocatoributget: {
        title: 'Sfida dei Budget: gioco del calciomercato online · Quizzotti',
        desc: 'Il gioco del calciomercato: costruisci la rosa a occhio, con i valori dei calciatori nascosti, e chiudi il più vicino possibile al budget. Da 1 a 6 giocatori.',
        how: [
            'Ognuno ha un budget in milioni e una rosa da completare.',
            'A turno scegliete i calciatori, ma i cartellini sono coperti.',
            'Si scopre il valore di mercato solo alla fine.',
            'Vince chi chiude il mercato più vicino al budget.',
            'Mercato mondiale o solo italiano: si sceglie prima di iniziare.'
        ],
        faq: [
            ['Da dove vengono i valori?', 'Sono valori di mercato stimati dei calciatori, simili a quelli dei siti di calciomercato; possono non essere aggiornati all\'ultimo giorno.'],
            ['Cosa succede se sforo il budget?', 'Dipende dalla regola scelta: con «Conta la distanza» vince chi ci va più vicino, sopra o sotto; con «Chi sfora perde» chi sfora finisce in fondo.'],
            ['Si gioca da soli?', 'Sì, da 1 a 6 giocatori sullo stesso telefono.']
        ],
        more: ['SopraOSotto.html', 'GiocatoreDelGiorno.html', 'CVEM.html', 'Bingo.html']
    },
    cruciverba: {
        title: 'Cruciverba calcio online gratis · Quizzotti',
        desc: 'Il cruciverba del calcio da fare online: schede a tema su Nazionale, Champions, Mondiali, calciomercato e anni \'90, con definizioni cattive. Gratis, senza app.',
        how: [
            'Scegli una scheda a tema: Nazionale, Champions, Mondiali, mister, stadi e altro.',
            'Tocca una casella e scrivi: la definizione appare sopra la griglia.',
            'Verifica quando vuoi: le lettere giuste diventano verdi.',
            'Correggi finché tutta la griglia non è verde.',
            'Le schede sono uguali per tutti, così vi potete sfidare con gli amici.'
        ],
        faq: [
            ['Quante schede ci sono?', 'Tante, divise per tema, e ne arrivano di nuove nel tempo.'],
            ['Posso lasciare a metà e riprendere?', 'Sì, la griglia resta salvata su questo telefono.'],
            ['Si gioca bene dal telefono?', 'Sì, la griglia e la tastiera sono pensate per lo schermo piccolo.']
        ],
        more: ['GiocatoreDelGiorno.html', 'QuattroPerQuattro.html', 'Citazioni.html', 'sfidaEredita.html']
    },
    sopraosotto: {
        title: 'Sopra o Sotto: indovina il valore dei calciatori · Quizzotti',
        desc: 'Higher or lower del calcio: due calciatori, il secondo vale di più o di meno? Oltre 3.600 valori di mercato e mazzi storici con gol e presenze in Serie A.',
        how: [
            'Di un calciatore vedi il valore, dell\'altro no.',
            'Scegli: il secondo vale di più (sopra) o di meno (sotto)?',
            'Se indovini vai avanti, e il secondo diventa il primo.',
            'Più dura la serie, più i valori si avvicinano.',
            'Ci sono anche i mazzi storici: gol e presenze in Serie A, gol in nazionale, scudetti.'
        ],
        faq: [
            ['È come Higher or Lower?', 'Sì, è il gioco «più alto o più basso» applicato al calcio, in italiano.'],
            ['Si può giocare con gli amici?', 'Sì: una serie a testa sullo stesso telefono, vince la più lunga.'],
            ['I valori sono aggiornati?', 'Sono stime dei valori di mercato: possono essere diverse da quelle di oggi.']
        ],
        more: ['GiocatoriBudget.html', 'GiocatoreDelGiorno.html', 'Intruso.html', 'CadutaLibera.html']
    },
    giocatoredelgiorno: {
        title: 'Wordle del calcio: indovina il Calciatore del Giorno · Quizzotti',
        desc: 'Il Wordle del calcio in italiano: ogni giorno un calciatore segreto, uguale per tutti. Sei tentativi tra nazionale, squadra, ruolo, età e valore. Gratis, senza app.',
        how: [
            'Ogni giorno c\'è un calciatore segreto, lo stesso per tutti.',
            'Scrivi il nome di un calciatore: hai sei tentativi.',
            'Nazionale, campionato, squadra, ruolo, età e valore si colorano: verde è uguale, ambra è vicino.',
            'Le frecce dicono se il segreto è più vecchio o vale di più.',
            'Alla fine condividi la griglia con gli amici, senza spoiler.'
        ],
        faq: [
            ['È il Wordle del calcio?', 'Sì: come Wordle c\'è una sfida al giorno uguale per tutti e una griglia da condividere, ma al posto delle lettere ci sono gli indizi sul calciatore.'],
            ['A che ora cambia il calciatore?', 'A mezzanotte, ora italiana. Intanto puoi allenarti con l\'allenamento o rigiocare i giorni passati dall\'archivio.'],
            ['Tra quali calciatori si sceglie?', 'Puoi scrivere uno qualsiasi di oltre 3.600 calciatori dei campionati di tutto il mondo.']
        ],
        more: ['SopraOSotto.html', 'Cruciverba.html', 'CVEM.html', 'Intruso.html']
    },
    cadutalibera: {
        title: 'Quiz calcio: Caduta Libera gratis · Quizzotti',
        desc: 'Caduta Libera del calcio: domande a raffica, tre risposte e pochi secondi. Ogni errore apre una botola. Oltre 650 domande di calcio, gratis online.',
        how: [
            'Sei in piedi su una fila di botole.',
            'Le domande di calcio arrivano a raffica, con tre risposte e pochi secondi.',
            'Indovini e il montepremi sale.',
            'Sbagli e sotto di te si apre una botola: il passo la risparmia, ma azzera la serie.',
            'Scegli quante domande reggere, il ritmo e il pavimento.'
        ],
        faq: [
            ['È come il programma Caduta Libera?', 'Si ispira al quiz TV: domande veloci e botole che si aprono, ma tutto a tema calcio.'],
            ['Quante domande ci sono?', 'Oltre 650 domande di calcio, che non si ripetono subito.'],
            ['Posso giocare in compagnia?', 'È pensato da soli, ma ci si può sfidare a turno battendo il record.']
        ],
        more: ['CVEM.html', 'AvantiUnAltro.html', 'Intruso.html', 'TuttiTV.html']
    },
    quattro: {
        title: 'Quattro per Quattro: il gioco dei gruppi sul calcio · Quizzotti',
        desc: 'Sedici nomi di calcio, quattro gruppi nascosti: trova cosa lega calciatori, club, stadi e allenatori. Come Connections, in italiano e sul pallone. Gratis.',
        how: [
            'Sul tabellone ci sono sedici nomi di calcio.',
            'Dietro ci sono quattro gruppi da quattro, ognuno con un legame nascosto.',
            'Seleziona quattro nomi e conferma: se formano un gruppo, si fissano.',
            'Hai quattro errori a disposizione.',
            'Le schede sono numerate e uguali per tutti.'
        ],
        faq: [
            ['È come Connections?', 'Sì, è il gioco dei gruppi nascosti in stile Connections, ma in italiano e tutto sul calcio.'],
            ['Quante schede ci sono?', 'Decine di schede numerate, che si giocano in ordine o come vuoi.'],
            ['I gruppi sono difficili?', 'Ogni scheda ha un gruppo facile e uno cattivo, come vuole la tradizione.']
        ],
        more: ['Intruso.html', 'Catena.html', 'Cruciverba.html', 'GiocatoreDelGiorno.html']
    },
    intruso: {
        title: 'L\'Intruso: quiz calcio, trova chi non c\'entra · Quizzotti',
        desc: 'Sei nomi del calcio, cinque hanno qualcosa in comune e uno no: trova l\'intruso prima che scada il tempo. Quasi 300 round, tre vite, anche in sfida a due.',
        how: [
            'Sul tabellone ci sono sei nomi del calcio.',
            'Cinque hanno qualcosa in comune, uno no.',
            'Tocca l\'intruso prima che scada il tempo: 15, 10 o 6 secondi.',
            'Dopo ogni round scopri il legame tra gli altri cinque.',
            'Hai tre vite; si può giocare anche in due sullo stesso telefono.'
        ],
        faq: [
            ['Quanti round ci sono?', 'Quasi 300, con legami di ogni tipo: squadre, nazionali, ruoli, trofei.'],
            ['Si può giocare in due?', 'Sì, c\'è la sfida a due sullo stesso telefono.'],
            ['Cosa vuol dire precisione?', 'La percentuale di intrusi trovati sul totale dei round giocati.']
        ],
        more: ['QuattroPerQuattro.html', 'Catena.html', 'SopraOSotto.html', 'CadutaLibera.html']
    },
    catena: {
        title: 'La Catena: gioco di parole sul calcio a squadre · Quizzotti',
        desc: 'La catena di parole del calcio: otto parole legate, si vedono solo la prima e l\'ultima. Due squadre indovinano gli anelli mancanti. Gratis su un solo telefono.',
        how: [
            'La catena ha otto parole: ognuna è legata alla successiva.',
            'Si vedono solo la prima e l\'ultima.',
            'A turno le squadre indovinano gli anelli mancanti, aiutate dalle lettere.',
            'Il telefono lo tiene la squadra che non risponde: fa il presentatore.',
            'Si sceglie quante catene giocare e il tempo per ogni tentativo.'
        ],
        faq: [
            ['Che tipo di legami ci sono?', 'Modi di dire, soprannomi, squadre, colori: per esempio il codino porta a Baggio e Baggio al Pallone d\'Oro.'],
            ['Quanti giocatori servono?', 'Due squadre, anche di una persona ciascuna.'],
            ['Posso lasciare una partita a metà?', 'Sì, la partita resta in sospeso su questo telefono.']
        ],
        more: ['sfidaEredita.html', 'IntesaVincente.html', 'QuattroPerQuattro.html', 'Taboo.html']
    },
    bingo: {
        title: 'Bingo della Partita: il bingo del calcio davanti alla TV · Quizzotti',
        desc: 'Il bingo da fare guardando la partita: una cartella a testa con rigori, pali, gialli e frasi del telecronista. Chi fa riga e bingo per primo? Gratis, dal telefono.',
        how: [
            'Ognuno apre la pagina sul suo telefono e prende una cartella.',
            'Nelle caselle ci sono cose che succedono in partita: rigore, palo, giallo, frasi del telecronista.',
            'Durante la partita in TV segni le caselle quando succedono.',
            'Chi fa riga per primo lo dice, chi fa bingo vince.',
            'Con lo stesso codice si ritrova la stessa cartella anche su un altro telefono.'
        ],
        faq: [
            ['Serve stampare le cartelle?', 'No, la cartella è sul telefono, e lo schermo resta acceso da solo durante la partita.'],
            ['Possiamo avere cartelle diverse?', 'Sì, ognuno ne ha una sua; con un codice condiviso si gioca anche a distanza.'],
            ['Va bene per qualsiasi partita?', 'Sì: Serie A, Champions, Nazionale, anche la partita del campetto se c\'è un telecronista.']
        ],
        more: ['NomiCose.html', 'MrWhite.html', 'TuttiTV.html', 'Bomba.html']
    },
    jeopardynormale: {
        title: 'Jeopardy online: quiz di cultura generale a squadre · Quizzotti',
        desc: 'Il Jeopardy di cultura generale in italiano: 14 categorie e 1.400 domande, dalla musica alla storia, con le foto. Da 1 a 6 squadre, gratis online.',
        how: [
            'Si gioca da 1 a 6 squadre, con un telefono, un computer o sulla TV.',
            'A turno ogni squadra sceglie una casella: categoria e valore, da 100 a 500 punti.',
            'Risposta giusta: punti alla squadra. Sbagliata: punti persi, e gli altri possono rubarli.',
            'C\'è la doppia posta nascosta e, alla fine, il gran finale con la puntata segreta.',
            'Alcune domande hanno la foto: un quadro, un animale, un monumento.'
        ],
        faq: [
            ['Che categorie ci sono?', '14 categorie di cultura generale: musica, rap, cinema, storia, geografia, arte, animali, cucina e altre.'],
            ['Serve un presentatore?', 'Conviene: uno legge e controlla le risposte, gli altri giocano.'],
            ['C\'è anche la versione di calcio?', 'Sì, il Jeopardy Calcio con categorie su Serie A, Champions, Mondiali e calciomercato.']
        ],
        more: ['Jeopardy.html', 'MilionarioNormale.html', 'TuttiTV.html', 'Taboo.html']
    },
    milionario: {
        title: 'Chi Vuol Essere Milionario: quiz di cultura generale gratis · Quizzotti',
        desc: 'Quiz di cultura generale in stile Chi Vuol Essere Milionario: 15 domande su musica, sport, animali, cinema, geografia e cucina, quattro aiuti. Gratis online.',
        how: [
            'Rispondi a quindici domande di cultura generale, dalla più facile alla più difficile.',
            'Ogni domanda ha quattro risposte e una sola è giusta.',
            'Hai quattro aiuti, una volta sola ciascuno.',
            'Due soglie sicure ti salvano una parte del montepremi.',
            'Puoi ritirarti prima di rispondere e tenere la vincita.'
        ],
        faq: [
            ['Di cosa sono le domande?', 'Cultura generale: musica e rap, sport, animali, cinema, geografia e cucina.'],
            ['Si vince qualcosa?', 'No, il milione è finto: è un gioco gratis, senza account.'],
            ['C\'è la versione sul calcio?', 'Sì, Chi Vuol Essere Milionario Calcio, con le stesse regole e domande sul pallone.']
        ],
        more: ['CVEM.html', 'JeopardyNormale.html', 'CadutaLibera.html', 'Citazioni.html']
    },
    nomicose: {
        title: 'Nomi Cose Città del calcio online: Nomi, Cose, Calcio · Quizzotti',
        desc: 'Il Nomi Cose Città del calcio da giocare online: esce una lettera e tutti scrivono calciatore, squadra, allenatore, stadio. La TV fa da tabellone, i telefoni da foglio.',
        how: [
            'Apri la pagina sulla TV o sul computer: diventa il tabellone.',
            'Gli altri entrano dal telefono inquadrando il QR code.',
            'Esce una lettera e parte il cronometro.',
            'Ognuno scrive un calciatore, una squadra, un allenatore, uno stadio con quella lettera.',
            'Le risposte che ha solo uno valgono doppio.'
        ],
        faq: [
            ['Serve un\'app?', 'No: la TV apre la pagina, i telefoni entrano col QR code nel browser.'],
            ['Quanti giocatori possono giocare?', 'Da 2 a 12, ognuno col suo telefono.'],
            ['Si può giocare senza TV?', 'Sì, basta un computer o un tablet come tabellone.']
        ],
        more: ['TuttiTV.html', 'Bingo.html', 'Bomba.html', 'MrWhite.html']
    },
    tuttitv: {
        title: 'Tutti contro la TV: quiz calcio con i telefoni · Quizzotti',
        desc: 'Il quiz di calcio da salotto: la TV fa le domande, ognuno risponde dal suo telefono con quattro bottoni colorati. Vince chi sa ed è più veloce. Da 2 a 12.',
        how: [
            'Apri la pagina sulla TV o sul computer: fa le domande.',
            'Gli altri entrano dal telefono con il QR code.',
            'Il telefono diventa una pulsantiera con quattro bottoni colorati.',
            'Chi risponde giusto prende punti, chi è più veloce ne prende di più.',
            'Tra un round e l\'altro arrivano imprevisti e punti doppi.'
        ],
        faq: [
            ['Serve un\'app?', 'No, basta il browser: la TV apre la pagina, i telefoni inquadrano il QR code.'],
            ['Quanti giocatori?', 'Da 2 a 12, ognuno con il suo telefono.'],
            ['Le domande sono solo di calcio?', 'Sì, è un quiz di calcio, con domande dal Milionario e dal trivia di Quizzotti.']
        ],
        more: ['NomiCose.html', 'Jeopardy.html', 'Bingo.html', 'CVEM.html']
    }
};

/* ---------------------------------------------------------------------------
   Costruzione
   ------------------------------------------------------------------------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

/** Il nome da mostrare nei link ad altri giochi, con una mezza riga che dice cosa sono. */
function linkLine(g) {
    const what = /Cultura generale/.test((g.tags || []).join(' ')) ? 'Cultura generale' : (g.kind === 'quiz' ? 'Quiz di calcio' : 'Gioco di calcio in compagnia');
    return { name: g.name, what: what + ' · ' + g.players };
}

function headBlock(g, t) {
    const url = SITE + g.file;
    const img = SITE + 'assets/og/' + g.id + '.jpg';
    const ogDesc = t.desc;
    return [
        '<!-- qz:testa (generato da scripts/seo-pagine.js) -->',
        `<meta property="og:image" content="${img}">`,
        '<meta property="og:image:type" content="image/jpeg">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        `<meta property="og:image:alt" content="${esc(g.name)} sul tabellone di Quizzotti">`,
        '<meta name="twitter:card" content="summary_large_image">',
        `<meta name="twitter:title" content="${esc(t.title)}">`,
        `<meta name="twitter:description" content="${esc(ogDesc)}">`,
        `<meta name="twitter:image" content="${img}">`,
        '<link rel="icon" href="favicon.ico" sizes="48x48">',
        '<link rel="icon" href="assets/icons/icon-192.png" type="image/png" sizes="192x192">',
        '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">',
        '<link rel="manifest" href="manifest.webmanifest">',
        '<link rel="preload" href="assets/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>',
        '<script type="application/ld+json">',
        jsonLd({
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'WebApplication',
                    '@id': url + '#gioco',
                    name: g.name,
                    url: url,
                    description: t.desc,
                    image: img,
                    applicationCategory: 'GameApplication',
                    applicationSubCategory: /Cultura generale/.test((g.tags || []).join(' ')) ? 'Quiz di cultura generale' : 'Gioco di calcio',
                    operatingSystem: 'Tutti (browser web)',
                    browserRequirements: 'Serve JavaScript',
                    isAccessibleForFree: true,
                    inLanguage: 'it',
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
                    isPartOf: { '@type': 'WebSite', '@id': SITE + '#sito', name: 'Quizzotti', url: SITE }
                },
                {
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        { '@type': 'ListItem', position: 1, name: 'Quizzotti', item: SITE },
                        { '@type': 'ListItem', position: 2, name: g.name, item: url }
                    ]
                },
                {
                    '@type': 'FAQPage',
                    mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
                }
            ]
        }),
        '</script>',
        '<!-- /qz:testa -->'
    ].join('\n');
}

function infoBlock(g, t, byFile) {
    const more = t.more.map((f) => {
        const o = byFile[f];
        if (!o) throw new Error(`${g.id}: link ad altri giochi verso una pagina che non c'è (${f})`);
        const l = linkLine(o);
        return `      <li><a href="${f}">${esc(l.name)}<span>${esc(l.what)}</span></a></li>`;
    });
    return [
        '  <!-- qz:info (generato da scripts/seo-pagine.js: i testi si cambiano lì) -->',
        '  <section class="qz-about" aria-label="Informazioni sul gioco">',
        '    <div>',
        `      <h2>Come si gioca a ${esc(g.name)}</h2>`,
        '      <ol class="qz-about__steps">',
        ...t.how.map((h) => `        <li>${esc(h)}</li>`),
        '      </ol>',
        '    </div>',
        '    <div>',
        '      <h2>Domande frequenti</h2>',
        ...t.faq.map(([q, a]) => `      <details class="qz-about__faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`),
        '    </div>',
        '    <nav class="qz-about__more" aria-label="Altri giochi">',
        '      <h2>Altri giochi</h2>',
        '      <ul>',
        ...more,
        '      </ul>',
        '    </nav>',
        '  </section>',
        '  <!-- /qz:info -->'
    ].join('\n');
}

function setMeta(html, attr, key, value) {
    const re = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="[^"]*">`);
    if (!re.test(html)) throw new Error('manca <meta ' + attr + '="' + key + '">');
    return html.replace(re, `<meta ${attr}="${key}" content="${esc(value)}">`);
}

function updatePage(g, t, byFile) {
    const file = path.join(ROOT, g.file);
    const orig = fs.readFileSync(file, 'utf8');
    const crlf = orig.includes('\r\n');
    let html = orig.replace(/\r\n/g, '\n');

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(t.title)}</title>`);
    html = setMeta(html, 'name', 'description', t.desc);
    html = setMeta(html, 'property', 'og:title', t.title);
    html = setMeta(html, 'property', 'og:description', t.desc);
    // via il vecchio: blocco generato, Google Fonts, icone, immagini e twitter scritti a mano
    html = html.replace(/<!-- qz:testa[\s\S]*?<!-- \/qz:testa -->\n?/, '');
    html = html.replace(/^.*(fonts\.googleapis\.com|fonts\.gstatic\.com).*\n/gm, '');
    html = html.replace(/^<!-- caratteri:.*\n/gm, '');
    html = html.replace(/^<meta property="og:image[^"]*" content="[^"]*">\n/gm, '');
    html = html.replace(/^<meta name="twitter:[a-z]+" content="[^"]*">\n/gm, '');
    html = html.replace(/^<link rel="(icon|apple-touch-icon|manifest)"[^>]*>\n/gm, '');
    html = html.replace(/^<link rel="preload" href="assets\/fonts\/[^"]*"[^>]*>\n/gm, '');
    html = html.replace(/(<link rel="stylesheet" href="assets\/qz\.css[^"]*">)/, headBlock(g, t) + '\n$1');

    html = html.replace(/\n {2}<!-- qz:info[\s\S]*?<!-- \/qz:info -->\n/, '\n');
    const at = html.lastIndexOf('</main>');
    if (at === -1) throw new Error(g.file + ': manca </main>');
    html = html.slice(0, at).replace(/\s*$/, '\n\n') + infoBlock(g, t, byFile) + '\n\n' + html.slice(at);

    if (crlf) html = html.replace(/\n/g, '\r\n');
    if (html !== orig) fs.writeFileSync(file, html, 'utf8');
    return html !== orig;
}

/** Nella home: l'elenco statico dei giochi, leggibile anche senza JavaScript. */
function updateHome(games) {
    const file = path.join(ROOT, 'index.html');
    const orig = fs.readFileSync(file, 'utf8');
    const crlf = orig.includes('\r\n');
    let html = orig.replace(/\r\n/g, '\n');
    const list = games.map((g) => {
        const l = linkLine(g);
        return `        <li><a href="${g.file}">${esc(l.name)}</a> <span>· ${esc(l.what)}</span></li>`;
    }).join('\n');
    const re = /(<!-- qz:elenco[^>]*-->)[\s\S]*?(\s*<!-- \/qz:elenco -->)/;
    if (!re.test(html)) throw new Error('index.html: mancano i segnaposto <!-- qz:elenco --> <!-- /qz:elenco -->');
    html = html.replace(re, (m, a, b) => a + '\n' + list + b);
    if (crlf) html = html.replace(/\n/g, '\r\n');
    if (html !== orig) fs.writeFileSync(file, html, 'utf8');
    return html !== orig;
}

function main() {
    const all = process.argv.includes('--tutte');
    const games = registry();
    const byFile = Object.fromEntries(games.map((g) => [g.file, g]));
    let n = 0;
    for (const g of games) {
        const t = TESTI[g.id];
        if (!t) throw new Error('mancano i testi per ' + g.id + ' in scripts/seo-pagine.js');
        if (t.how.length < 4 || t.how.length > 6 || t.faq.length !== 3 || t.more.length !== 4) throw new Error(g.id + ': servono 4-6 righe, 3 domande e 4 link');
        if (t.more.includes(g.file)) throw new Error(g.id + ': un link ad altri giochi porta alla pagina stessa');
        if (!all && SALTA.includes(g.file)) { console.log('  saltata ' + g.file); continue; }
        if (updatePage(g, t, byFile)) { n++; console.log('  aggiornata ' + g.file); }
    }
    if (updateHome(games)) console.log('  aggiornata index.html (elenco dei giochi)');
    console.log(`Fatto: ${n} pagine di gioco cambiate.`);
}

if (require.main === module) main();
module.exports = { TESTI, SALTA, registry };
