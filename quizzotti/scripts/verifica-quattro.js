#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Verifica delle schede di Quattro per Quattro (dal N° 53)
   --------------------------------------------------------------------------
   Regola d'oro: ogni nome sta in UN SOLO gruppo della sua scheda. Qui sotto,
   per ogni scheda nuova, ci sono i FATTI controllati (in rete, novembre 2026)
   con cui lo script decide a quali etichette appartiene ciascuno dei 16 nomi:
   - per i gruppi "a elenco chiuso" (Pallone d'Oro, capocannonieri, convocati
     di un torneo...) l'elenco COMPLETO dei vincitori/convocati (LISTE);
   - per i gruppi "ad attributo" (nazionalita', paese o regione del club,
     campionati in cui si e' giocato...) il valore di ciascun nome, scritto a
     mano: piu' valori se il nome soddisfa piu' etichette della scheda.
   Un nome che soddisfa due etichette della sua scheda e' un errore.
   Le "trappole" sono legami falsi ma sensati (es. «hanno giocato nella
   Roma»): per ognuna c'e' l'elenco dei nomi della scheda che la soddisfano.
   Una trappola e' buona se prende 2 o 3 nomi di almeno due gruppi diversi:
   con 4 nomi diventerebbe un quinto gruppo valido.
   Sono controllate anche le schede 8 e 29 (congelate): li' due nomi stanno
   in due gruppi e il gioco li gestisce con l'errata (quattroErrata).

   Uso: node scripts/verifica-quattro.js   (esce con 1 se trova errori)
   Lo usa anche tests/quattro.test.js.
   ========================================================================== */
'use strict';

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------------------------------------------------------------- LISTE */
const L = {
    // Pallone d'Oro 1956-2026 (France Football; 2020 non assegnato; 2026 Kane)
    PALLONE_ORO: ['Matthews', 'Di Stéfano', 'Kopa', 'Suárez', 'Sívori', 'Masopust', 'Yashin', 'Law', 'Eusébio', 'Charlton',
        'Albert', 'Best', 'Rivera', 'Müller', 'Cruijff', 'Beckenbauer', 'Blochin', 'Simonsen', 'Keegan', 'Rummenigge', 'Rossi',
        'Platini', 'Belanov', 'Gullit', 'Van Basten', 'Matthäus', 'Papin', 'Baggio', 'Stoičkov', 'Weah', 'Sammer', 'Ronaldo',
        'Zidane', 'Rivaldo', 'Figo', 'Owen', 'Nedvěd', 'Shevchenko', 'Ronaldinho', 'Cannavaro', 'Kaká', 'Cristiano Ronaldo',
        'Messi', 'Modrić', 'Benzema', 'Rodri', 'Dembélé', 'Kane'],
    // Golden Boy (Tuttosport) 2003-2026
    GOLDEN_BOY: ['Van der Vaart', 'Rooney', 'Messi', 'Fàbregas', 'Agüero', 'Anderson', 'Pato', 'Balotelli', 'Götze', 'Isco',
        'Pogba', 'Sterling', 'Martial', 'Renato Sanches', 'Mbappé', 'De Ligt', 'João Félix', 'Haaland', 'Pedri', 'Gavi',
        'Bellingham', 'Lamine Yamal', 'Doué', 'Cubarsí'],
    // Scarpa d'Oro 1967-68 / 2025-26 (anche i premi condivisi)
    SCARPA_ORO: ['Eusébio', 'Žekov', 'Müller', 'Skoblar', 'Yazalde', 'Georgescu', 'Kaiafas', 'Krankl', 'Kist', 'Vandenbergh',
        'Slavkov', 'Kieft', 'Gomes', 'Rush', 'Van Basten', 'Polster', 'Çolak', 'Mateuț', 'Stoičkov', 'Hugo Sánchez', 'Pančev',
        'Ronaldo', 'Machlas', 'Jardel', 'Phillips', 'Larsson', 'Makaay', 'Henry', 'Forlán', 'Toni', 'Totti',
        'Cristiano Ronaldo', 'Messi', 'Suárez', 'Immobile', 'Lewandowski', 'Haaland', 'Kane', 'Mbappé'],
    // Premio Puskas FIFA 2009-2025
    PUSKAS: ['Cristiano Ronaldo', 'Altıntop', 'Neymar', 'Stoch', 'Ibrahimović', 'James Rodríguez', 'Wendell Lira', 'Faiz Subri',
        'Giroud', 'Salah', 'Zsóri', 'Son', 'Lamela', 'Oleksy', 'Madruga', 'Garnacho', 'Montiel'],
    // Capocannonieri della Serie A 1929-30 / 2025-26, per club con cui hanno vinto la classifica
    CAPO: {
        Fiorentina: ['Petrone', 'Milani', 'Orlando', 'Batistuta', 'Toni'],
        Roma: ['Volk', 'Guaita', 'Da Costa', 'Manfredini', 'Pruzzo', 'Totti', 'Džeko'],
        Torino: ['Gabetto', 'Mazzola', 'Pulici', 'Graziani', 'Immobile'],
        Bologna: ['Schiavio', 'Puricelli', 'Pivatelli', 'Nielsen', 'Savoldi'],
        Inter: ['Meazza', 'Nyers', 'Angelillo', 'Mazzola', 'Boninsegna', 'Serena', 'Vieri', 'Ibrahimović', 'Icardi', 'Lautaro'],
        Juventus: ['Borel', 'Boniperti', 'Hansen', 'Charles', 'Sívori', 'Bettega', 'Platini', 'Trezeguet', 'Del Piero', 'Cristiano Ronaldo'],
        Milan: ['Boffi', 'Nordahl', 'Altafini', 'Prati', 'Rivera', 'Virdis', 'Van Basten', 'Shevchenko', 'Ibrahimović'],
        Lazio: ['Piola', 'Chinaglia', 'Giordano', 'Signori', 'Crespo', 'Immobile'],
        Napoli: ['Maradona', 'Cavani', 'Higuaín', 'Osimhen'],
        Sampdoria: ['Brighenti', 'Vialli', 'Quagliarella'],
        Cagliari: ['Riva'],
        // Vicenza, Bari, Atalanta, Udinese, Piacenza, Livorno, Verona (Toni 2015: il Verona pero' ha uno scudetto)
        MAI_CAMPIONI: ['Vinício', 'Rossi', 'Protti', 'Inzaghi', 'Bierhoff', 'Amoroso', 'Hübner', 'Lucarelli', 'Di Natale', 'Retegui']
    },
    // Convocati dell'Italia (fonte: liste ufficiali dei tornei)
    ITA_1998: ['Toldo', 'Bergomi', 'Maldini', 'Cannavaro', 'Costacurta', 'Nesta', 'Pessotto', 'Torricelli', 'Albertini', 'Del Piero',
        'Dino Baggio', 'Pagliuca', 'Cois', 'Di Biagio', 'Di Livio', 'Di Matteo', 'Moriero', 'Baggio', 'Inzaghi', 'Chiesa', 'Vieri', 'Buffon'],
    ITA_2002: ['Buffon', 'Panucci', 'Maldini', 'Coco', 'Cannavaro', 'Zanetti', 'Del Piero', 'Gattuso', 'Inzaghi', 'Totti', 'Doni',
        'Abbiati', 'Nesta', 'Di Biagio', 'Iuliano', 'Di Livio', 'Tommasi', 'Delvecchio', 'Zambrotta', 'Montella', 'Vieri', 'Toldo', 'Materazzi'],
    ITA_2010: ['Buffon', 'Maggio', 'Criscito', 'Chiellini', 'Cannavaro', 'De Rossi', 'Pepe', 'Gattuso', 'Iaquinta', 'Di Natale',
        'Gilardino', 'Marchetti', 'Bocchetti', 'De Sanctis', 'Marchisio', 'Camoranesi', 'Palombo', 'Quagliarella', 'Zambrotta',
        'Pazzini', 'Pirlo', 'Montolivo', 'Bonucci'],
    ITA_2014: ['Buffon', 'De Sciglio', 'Chiellini', 'Darmian', 'Thiago Motta', 'Candreva', 'Abate', 'Marchisio', 'Balotelli', 'Cassano',
        'Cerci', 'Sirigu', 'Perin', 'Aquilani', 'Barzagli', 'De Rossi', 'Immobile', 'Parolo', 'Bonucci', 'Paletta', 'Pirlo', 'Insigne', 'Verratti'],
    EURO_1988: ['Zenga', 'Baresi', 'Bergomi', 'Cravero', 'Ferrara', 'Ferri', 'Francini', 'Maldini', 'Ancelotti', 'De Agostini',
        'De Napoli', 'Tacconi', 'Fusi', 'Giannini', 'Romano', 'Altobelli', 'Donadoni', 'Mancini', 'Rizzitelli', 'Vialli'],
    EURO_1996: ['Peruzzi', 'Apolloni', 'Maldini', 'Carboni', 'Costacurta', 'Nesta', 'Donadoni', 'Mussi', 'Torricelli', 'Albertini',
        'Dino Baggio', 'Toldo', 'Rossitto', 'Del Piero', 'Di Livio', 'Di Matteo', 'Fuser', 'Casiraghi', 'Chiesa', 'Ravanelli', 'Zola', 'Bucci'],
    EURO_2016: ['Buffon', 'De Sciglio', 'Chiellini', 'Darmian', 'Ogbonna', 'Candreva', 'Zaza', 'Florenzi', 'Pellè', 'Thiago Motta',
        'Immobile', 'Sirigu', 'Marchetti', 'Sturaro', 'Barzagli', 'De Rossi', 'Éder', 'Parolo', 'Bonucci', 'Insigne', 'Bernardeschi',
        'El Shaarawy', 'Giaccherini'],
    EURO_2021: ['Donnarumma', 'Sirigu', 'Meret', 'Di Lorenzo', 'Florenzi', 'Toloi', 'Bonucci', 'Chiellini', 'Acerbi', 'Bastoni',
        'Emerson', 'Spinazzola', 'Jorginho', 'Verratti', 'Barella', 'Locatelli', 'Pessina', 'Cristante', 'Castrovilli', 'Insigne',
        'Chiesa', 'Berardi', 'Bernardeschi', 'Raspadori', 'Immobile', 'Belotti'],
    EURO_2024: ['Donnarumma', 'Di Lorenzo', 'Dimarco', 'Buongiorno', 'Calafiori', 'Gatti', 'Frattesi', 'Jorginho', 'Scamacca',
        'Pellegrini', 'Raspadori', 'Vicario', 'Darmian', 'Chiesa', 'Bellanova', 'Cristante', 'Mancini', 'Barella', 'Retegui',
        'Zaccagni', 'Fagioli', 'El Shaarawy', 'Bastoni', 'Cambiaso', 'Folorunsho', 'Meret'],
    ITA_2006: ['Buffon', 'Zaccardo', 'Grosso', 'De Rossi', 'Cannavaro', 'Barzagli', 'Del Piero', 'Gattuso', 'Toni', 'Totti',
        'Gilardino', 'Peruzzi', 'Nesta', 'Amelia', 'Iaquinta', 'Camoranesi', 'Barone', 'Inzaghi', 'Zambrotta', 'Perrotta', 'Pirlo',
        'Oddo', 'Materazzi'],
    // Nazionali: Europei 1960-2024, Copa America 1916-2024, Coppa d'Africa 1957-2025, Coppa d'Asia 1956-2023
    EUROPEI: ['Unione Sovietica', 'Spagna', 'Italia', 'Germania', 'Cecoslovacchia', 'Francia', 'Paesi Bassi', 'Danimarca', 'Grecia', 'Portogallo'],
    COPA_AMERICA: ['Uruguay', 'Argentina', 'Brasile', 'Paraguay', 'Perù', 'Bolivia', 'Colombia', 'Cile'],
    COPPA_AFRICA: ['Egitto', 'Sudan', 'Etiopia', 'Ghana', 'Congo', 'Marocco', 'Nigeria', 'Camerun', 'Algeria', 'Costa d\'Avorio',
        'Sudafrica', 'Tunisia', 'Zambia', 'Senegal', 'RD Congo'],
    COPPA_ASIA: ['Corea del Sud', 'Israele', 'Iran', 'Kuwait', 'Arabia Saudita', 'Giappone', 'Iraq', 'Australia', 'Qatar'],
    // Paesi che hanno ospitato (anche in parte) un Mondiale 1930-2026
    OSPITI_MONDIALE: ['Uruguay', 'Italia', 'Francia', 'Brasile', 'Svizzera', 'Svezia', 'Cile', 'Inghilterra', 'Messico', 'Germania',
        'Argentina', 'Spagna', 'Stati Uniti', 'Corea del Sud', 'Giappone', 'Sudafrica', 'Russia', 'Qatar', 'Canada'],
    // Ospitanti di un Europeo 1960-2024 (Euro 2020 compreso)
    OSPITI_EUROPEO: ['Francia', 'Spagna', 'Italia', 'Belgio', 'Jugoslavia', 'Germania', 'Inghilterra', 'Svezia', 'Paesi Bassi',
        'Portogallo', 'Austria', 'Svizzera', 'Polonia', 'Ucraina', 'Danimarca', 'Scozia', 'Ungheria', 'Romania', 'Azerbaigian', 'Russia', 'Irlanda'],
    // Campioni del mondo nel Mondiale di casa
    MONDIALE_IN_CASA: ['Uruguay', 'Italia', 'Inghilterra', 'Germania', 'Argentina', 'Francia'],
    // Mondiali organizzati in piu' paesi: 2002 e 2026
    MONDIALE_CONDIVISO: ['Corea del Sud', 'Giappone', 'Stati Uniti', 'Messico', 'Canada'],
    // Mondiale 2030 (anche le tre partite del centenario) e 2034
    MONDIALI_2030_2034: ['Spagna', 'Portogallo', 'Marocco', 'Uruguay', 'Argentina', 'Paraguay', 'Arabia Saudita'],
    // Campioni del mondo (giocatori dei nomi in gioco)
    CAMPIONI_MONDO: ['Neuer', 'Taffarel', 'Henry', 'Iniesta', 'Podolski', 'Maier', 'Breitner', 'Hoeneß', 'Schwarzenbeck',
        'Passarella', 'Ardiles', 'Valdano', 'Burruchaga', 'Schiavio', 'Graziani', 'Camoranesi', 'Perrotta', 'Toni', 'Barzagli', 'Zambrotta',
        'Cafu', 'Altobelli', 'Combi', 'Olivieri']
};

/* ----------------------------------------------------- VERIFICA PER SCHEDA
   g: per ogni gruppo un elenco (L.*) oppure un codice; a: { nome: codice | [codici] }.
   t: trappole { nome, membri }. Chiave: titolo della scheda. */
const V = {};

V['Lontano dall\'Europa'] = {
    g: ['SAU', 'MLS', L_LIB(), 'JPN'],
    a: { 'Al-Nassr': 'SAU', 'Al-Hilal': 'SAU', 'Al-Ittihad': 'SAU', 'Al-Ahli': 'SAU', 'Inter Miami': 'MLS', 'LA Galaxy': 'MLS', 'Toronto FC': 'MLS',
        'Columbus Crew': 'MLS', 'Kashima Antlers': 'JPN', 'Urawa Reds': 'JPN', 'Vissel Kobe': 'JPN', 'Gamba Osaka': 'JPN',
        Internacional: 'BRA', Olimpia: 'PAR', 'Colo-Colo': 'CHI', 'LDU Quito': 'ECU' },
    t: [{ nome: '«Inter» nel nome', membri: ['Inter Miami', 'Internacional'] }]
};
function L_LIB() {
    // Vincitrici della Copa Libertadores 1960-2025
    return ['Peñarol', 'Nacional', 'Independiente', 'Racing', 'Estudiantes', 'Santos', 'Flamengo', 'Palmeiras', 'São Paulo', 'Grêmio',
        'Internacional', 'Corinthians', 'Cruzeiro', 'Vasco da Gama', 'Atlético Mineiro', 'Fluminense', 'Botafogo', 'Boca Juniors',
        'River Plate', 'Argentinos Juniors', 'Vélez', 'San Lorenzo', 'Olimpia', 'Colo-Colo', 'Atlético Nacional', 'Once Caldas', 'LDU Quito'];
}

V['Scudetti a peso'] = {
    // scudetti al 2025-26: Juventus 36, Inter 21, Milan 19, Genoa 9, Torino e Bologna 7, Pro Vercelli 7, Napoli 4, Roma 3,
    // Lazio e Fiorentina 2, Cagliari, Verona, Sampdoria, Casale, Novese 1. Coppa Italia: Atalanta 1963, Parma 1992-99-2002, Vicenza 1997, Venezia 1941
    g: ['9+', '2-4', '1', 'CI'],
    a: { Juventus: '9+', Inter: '9+', Milan: '9+', Genoa: '9+', Lazio: '2-4', Fiorentina: '2-4', Roma: '2-4', Napoli: '2-4',
        Cagliari: '1', Verona: '1', Sampdoria: '1', Casale: '1', Atalanta: 'CI', Parma: 'CI', Vicenza: 'CI', Venezia: 'CI' },
    t: [{ nome: 'Squadre lombarde', membri: ['Inter', 'Milan', 'Atalanta'] }, { nome: 'Squadre venete', membri: ['Verona', 'Vicenza', 'Venezia'] }]
};

V['Cognomi da vocabolario'] = {
    g: ['colore', 'citta', 'cibo', 'mestiere'],
    a: { Rossi: 'colore', Bianchi: 'colore', Neri: 'colore', Verdi: 'colore', Ferrara: 'citta', Palermo: 'citta', Foggia: 'citta', Lodi: 'citta',
        Fagioli: 'cibo', Pepe: 'cibo', Lasagna: 'cibo', Farina: 'cibo', Pastore: 'mestiere', Cacciatore: 'mestiere', Abate: 'mestiere', Cardinale: 'mestiere' },
    // Pastore (Palermo 2009-11) e Simone Pepe (Palermo 2004-06): c'entrano col Palermo, la casella «Palermo» (Martín) no
    t: [{ nome: 'Hanno giocato nel Palermo', membri: ['Pastore', 'Pepe'] }]
};

V['Mondiali dimenticati'] = {
    g: [L.ITA_2014, L.ITA_2010, L.ITA_2002, L.ITA_1998],
    t: [{ nome: 'Portieri', membri: ['Perin', 'Abbiati'] }]
};

V['Ai confini dell\'Est'] = {
    g: ['GRE', 'UKR', 'CRO', 'CZE'],
    a: { Olympiacos: 'GRE', Panathinaikos: 'GRE', PAOK: 'GRE', 'AEK Atene': 'GRE', Shakhtar: 'UKR', 'Dynamo Kiev': 'UKR', Dnipro: 'UKR',
        Metalist: 'UKR', 'Dinamo Zagabria': 'CRO', 'Hajduk Spalato': 'CRO', Rijeka: 'CRO', Osijek: 'CRO', 'Sparta Praga': 'CZE',
        'Slavia Praga': 'CZE', 'Viktoria Plzeň': 'CZE', 'Baník Ostrava': 'CZE' },
    t: [{ nome: '«Dinamo» o «Dynamo» nel nome', membri: ['Dynamo Kiev', 'Dinamo Zagabria'] }]
};

V['Bacheca personale'] = {
    g: [L.PALLONE_ORO, L.GOLDEN_BOY, L.SCARPA_ORO, L.PUSKAS],
    t: [{ nome: 'Hanno giocato nel Milan', membri: ['Weah', 'Shevchenko', 'Giroud'] }]
};

V['Il presidente'] = {
    // Milan: Rizzoli 1954-63, Farina 1982-86, Berlusconi 1986-2017, Scaroni dal 2018; Inter: Fraizzoli 1968-84, Pellegrini 1984-95,
    // Thohir 2013-18, Zhang 2018-24; Roma: Anzalone 1971-79, Viola 1979-91, Franco Sensi 1993-2008, Friedkin dal 2020;
    // Lazio: Lenzini 1965-80, Chinaglia 1983-86, Cragnotti 1992-2003, Lotito dal 2004. Nessuno ha presieduto due di questi club.
    g: ['MIL', 'INT', 'ROM', 'LAZ'],
    a: { Berlusconi: 'MIL', Farina: 'MIL', Rizzoli: 'MIL', Scaroni: 'MIL', Fraizzoli: 'INT', Pellegrini: 'INT', Thohir: 'INT', Zhang: 'INT',
        Viola: 'ROM', Sensi: 'ROM', Anzalone: 'ROM', Friedkin: 'ROM', Lenzini: 'LAZ', Cragnotti: 'LAZ', Lotito: 'LAZ', Chinaglia: 'LAZ' },
    t: [{ nome: 'Presidenti stranieri', membri: ['Thohir', 'Zhang', 'Friedkin'] }]
};

V['Cuore d\'Europa'] = {
    g: ['FRA', 'BEL', 'SUI', 'AUT'],
    a: { Marsiglia: 'FRA', Lione: 'FRA', Nizza: 'FRA', Lilla: 'FRA', Anderlecht: 'BEL', 'Club Brugge': 'BEL', 'Standard Liegi': 'BEL', Genk: 'BEL',
        Basilea: 'SUI', 'Young Boys': 'SUI', Grasshoppers: 'SUI', Servette: 'SUI', 'Rapid Vienna': 'AUT', Salisburgo: 'AUT', 'Sturm Graz': 'AUT', LASK: 'AUT' },
    // Marsiglia: Champions 1993; Anderlecht: Coppa delle Coppe 1976 e 1978, Coppa UEFA 1983. Le altre: nessuna coppa UEFA
    t: [{ nome: 'Hanno vinto una coppa europea', membri: ['Marsiglia', 'Anderlecht'] }]
};

V['Il calcio in quattro lingue'] = {
    g: ['en', 'it', 'es', 'de'],
    a: { Corner: 'en', Cross: 'en', Assist: 'en', Penalty: 'en', Catenaccio: 'it', Tifosi: 'it', Libero: 'it', Fantasista: 'it',
        Arquero: 'es', Delantero: 'es', Volante: 'es', Lateral: 'es', Gegenpressing: 'de', Raumdeuter: 'de', Elfmeter: 'de', Abseits: 'de' },
    t: [{ nome: 'Vogliono dire «rigore»', membri: ['Penalty', 'Elfmeter'] }]
};

V['Squadre da sogno'] = {
    // rose: Inter 2009-10, Milan 2006-07, Lazio 1999-2000, Roma 2000-01 (per ogni nome: in quali di queste rose c'era)
    g: ['INT10', 'MIL07', 'LAZ00', 'ROM01'],
    a: { 'Lúcio': 'INT10', Sneijder: 'INT10', Pandev: 'INT10', Maicon: 'INT10', Oddo: 'MIL07', Jankulovski: 'MIL07', Ambrosini: 'MIL07',
        Gilardino: 'MIL07', Pancaro: 'LAZ00', Couto: 'LAZ00', 'Bokšić': 'LAZ00', Almeyda: 'LAZ00', Zebina: 'ROM01', Tommasi: 'ROM01',
        Candela: 'ROM01', Delvecchio: 'ROM01' },
    // Lúcio (Juve 2012), Bokšić (Juve 1996-97), Zebina (Juve 2004-10)
    t: [{ nome: 'Hanno giocato nella Juventus', membri: ['Lúcio', 'Bokšić', 'Zebina'] }]
};

V['Fuoriclasse dell\'Est'] = {
    g: ['POL', 'UKR', 'ROU', 'BUL'],
    a: { Lewandowski: 'POL', Boniek: 'POL', 'Szczęsny': 'POL', 'Zieliński': 'POL', Rebrov: 'UKR', Mudryk: 'UKR', Malinovskyi: 'UKR',
        Zinchenko: 'UKR', Hagi: 'ROU', Mutu: 'ROU', Chivu: 'ROU', Popescu: 'ROU', 'Stoičkov': 'BUL', Berbatov: 'BUL', Balakov: 'BUL', Letchkov: 'BUL' },
    t: [{ nome: 'Hanno giocato nell\'Inter', membri: ['Chivu', 'Mutu', 'Zieliński'] },
        { nome: 'Hanno giocato nella Roma', membri: ['Chivu', 'Szczęsny', 'Boniek'] }]
};

V['Italiani d\'esportazione'] = {
    // campionati esteri della carriera (tra Premier, Liga, Bundesliga e Ligue 1)
    g: ['PL', 'LIGA', 'BUN', 'L1'],
    a: { 'Di Canio': 'PL', Jorginho: 'PL', Tonali: 'PL', Udogie: 'PL', Cassano: 'LIGA', Torricelli: 'LIGA', Abbiati: 'LIGA', Zambrotta: 'LIGA',
        Toni: 'BUN', Barzagli: 'BUN', Grifo: 'BUN', Bonucci: 'BUN', Verratti: 'L1', 'De Sciglio': 'L1', Pellegri: 'L1', 'El Shaarawy': 'L1' },
    t: [{ nome: 'Hanno giocato nella Roma', membri: ['Cassano', 'El Shaarawy', 'Toni'] },
        { nome: 'Campioni del mondo 2006', lista: 'ITA_2006' },
        { nome: 'Campioni d\'Europa 2021', lista: 'EURO_2021' }]
};

V['Feste mondiali'] = {
    g: ['canzone', 'pallone', 'mascMond', 'mascEuro'],
    a: { 'Waka Waka': 'canzone', 'Un\'estate italiana': 'canzone', 'La copa de la vida': 'canzone', 'Live It Up': 'canzone',
        Etrusco: 'pallone', Tango: 'pallone', Jabulani: 'pallone', Brazuca: 'pallone', Ciao: 'mascMond', Footix: 'mascMond',
        Naranjito: 'mascMond', Zakumi: 'mascMond', Berni: 'mascEuro', Goaliath: 'mascEuro', 'Super Victor': 'mascEuro', 'Albärt': 'mascEuro' },
    t: [{ nome: 'Italia \'90', membri: ['Un\'estate italiana', 'Etrusco', 'Ciao'] },
        { nome: 'Sudafrica 2010', membri: ['Waka Waka', 'Jabulani', 'Zakumi'] }]
};

V['Freddo del Nord'] = {
    g: ['RUS', 'POL', 'DEN', 'NOR'],
    a: { Zenit: 'RUS', 'Spartak Mosca': 'RUS', 'CSKA Mosca': 'RUS', Krasnodar: 'RUS', 'Legia Varsavia': 'POL', 'Lech Poznań': 'POL',
        'Wisła Cracovia': 'POL', 'Górnik Zabrze': 'POL', Midtjylland: 'DEN', Aalborg: 'DEN', Odense: 'DEN', 'AGF Aarhus': 'DEN',
        Rosenborg: 'NOR', Molde: 'NOR', 'Bodø/Glimt': 'NOR', Brann: 'NOR' },
    t: [{ nome: 'Club di una capitale', membri: ['Spartak Mosca', 'CSKA Mosca', 'Legia Varsavia'] }]
};

V['Province d\'Italia'] = {
    g: ['LIG', 'PIE', 'MAR', 'ABR'],
    a: { Genoa: 'LIG', Sampdoria: 'LIG', Entella: 'LIG', Savona: 'LIG', Novara: 'PIE', Alessandria: 'PIE', 'Pro Vercelli': 'PIE', Cuneo: 'PIE',
        Ancona: 'MAR', Ascoli: 'MAR', Sambenedettese: 'MAR', Fermana: 'MAR', Pescara: 'ABR', 'L\'Aquila': 'ABR', Teramo: 'ABR', Chieti: 'ABR' },
    t: [{ nome: 'Hanno vinto uno scudetto', membri: ['Pro Vercelli', 'Genoa', 'Sampdoria'] }]
};

V['Anni da almanacco'] = {
    // fondazione: Genoa 1893, Juventus 1897, Milan 1899, Torino 1906, Inter 1908, Bologna e Casale 1909, Roma 1927 (rifondazioni
    // escluse: Bologna 1993, Fiorentina 2002, Napoli 2004, Torino 2005); Spagna: 1964, 2008, 2012, 2024; Milan: 1963, 1969, 1989,
    // 1990, 1994, 2003, 2007; Pallone d'Oro rossonero: 1969, 1987, 1988, 1989, 1992, 1995, 2004, 2007
    g: [['1892', '1893', '1897', '1899', '1900', '1906', '1908', '1909', '1913', '1920', '1926', '1927', '1946'],
        ['1964', '2008', '2012', '2024'],
        ['1963', '1969', '1989', '1990', '1994', '2003', '2007'],
        ['1969', '1987', '1988', '1989', '1992', '1995', '2004', '2007']],
    t: [{ nome: 'Scudetti del Napoli', membri: ['1987', '1990'] }]
};

V['Stadi lontani'] = {
    g: ['BRA', 'FRA', 'TUR', 'GRE'],
    a: { 'Maracanã': 'BRA', Morumbi: 'BRA', 'Mineirão': 'BRA', 'Beira-Rio': 'BRA', 'Vélodrome': 'FRA', 'Parc des Princes': 'FRA',
        'Allianz Riviera': 'FRA', Bollaert: 'FRA', 'Şükrü Saracoğlu': 'TUR', 'Atatürk Olimpiyat': 'TUR', 'Rams Park': 'TUR', 'İnönü': 'TUR',
        Karaiskakis: 'GRE', Toumba: 'GRE', Leoforos: 'GRE', OAKA: 'GRE' },
    // finali di Coppa dei Campioni/Champions: Parc des Princes 1956, 1975, 1981; OAKA 1983, 1994, 2007; Atatürk 2005, 2023
    t: [{ nome: 'Hanno ospitato una finale di Champions', membri: ['Parc des Princes', 'Atatürk Olimpiyat', 'OAKA'] }]
};

V['Europei senza coppa'] = {
    g: [L.EURO_2016, L.EURO_2024, L.EURO_1996, L.EURO_1988],
    // Éder nato a Lauro Müller (Brasile), Retegui a San Fernando (Argentina); gli altri in Italia
    t: [{ nome: 'Nati in Sudamerica', membri: ['Éder', 'Retegui'] }]
};

V['Nomi di battesimo, il ritorno'] = {
    g: ['Andrea', 'Marco', 'Christian', 'Gianluca'],
    a: { Belotti: 'Andrea', Petagna: 'Andrea', Cambiaso: 'Andrea', Carnevale: 'Andrea', 'Di Vaio': 'Marco', Simone: 'Marco', Borriello: 'Marco',
        Reus: 'Marco', Panucci: 'Christian', Maggio: 'Christian', Eriksen: 'Christian', 'Kouamé': 'Christian', Scamacca: 'Gianluca',
        Lapadula: 'Gianluca', Caprari: 'Gianluca', Pessotto: 'Gianluca' },
    t: [{ nome: 'Hanno giocato nel Napoli', membri: ['Petagna', 'Borriello', 'Maggio'] }]
};

V['Africa nel mondo'] = {
    g: ['EGY', 'GHA', 'ALG', 'MAR'],
    a: { Salah: 'EGY', Marmoush: 'EGY', Elneny: 'EGY', Aboutrika: 'EGY', Essien: 'GHA', Gyan: 'GHA', Appiah: 'GHA', Muntari: 'GHA',
        Mahrez: 'ALG', Bennacer: 'ALG', Ghezzal: 'ALG', Madjer: 'ALG', Hakimi: 'MAR', Ziyech: 'MAR', Bounou: 'MAR', Benatia: 'MAR' },
    t: [{ nome: 'Hanno giocato nel Milan', membri: ['Essien', 'Muntari', 'Bennacer'] },
        { nome: 'Hanno giocato nell\'Inter', membri: ['Muntari', 'Hakimi'] }]
};

V['Britannici e alpini'] = {
    g: ['SCO', 'WAL', 'SUI', 'AUT'],
    a: { McTominay: 'SCO', Gilmour: 'SCO', Souness: 'SCO', Jordan: 'SCO', Charles: 'WAL', Rush: 'WAL', Ramsey: 'WAL', Ampadu: 'WAL',
        Behrami: 'SUI', Freuler: 'SUI', Sommer: 'SUI', Ndoye: 'SUI', 'Arnautović': 'AUT', Polster: 'AUT', Prohaska: 'AUT', Posch: 'AUT' },
    t: [{ nome: 'Hanno giocato nell\'Inter', membri: ['Arnautović', 'Prohaska', 'Sommer'] },
        { nome: 'Hanno giocato nel Napoli', membri: ['McTominay', 'Gilmour', 'Behrami'] }]
};

V['Nazionali in bacheca'] = {
    g: [L.EUROPEI, L.COPA_AMERICA, L.COPPA_AFRICA, L.COPPA_ASIA],
    t: [{ nome: 'Hanno ospitato un Mondiale', lista: 'OSPITI_MONDIALE' }]
};

V['Americhe'] = {
    g: ['MEX', 'USA', 'COL', 'CHI'],
    a: { Chicharito: 'MEX', 'Márquez': 'MEX', Lozano: 'MEX', Ochoa: 'MEX', Pulisic: 'USA', McKennie: 'USA', Donovan: 'USA', Howard: 'USA',
        Valderrama: 'COL', 'James Rodríguez': 'COL', Higuita: 'COL', Asprilla: 'COL', Vidal: 'CHI', 'Sánchez': 'CHI', Zamorano: 'CHI', Pulgar: 'CHI' },
    t: [{ nome: 'Hanno giocato nella Juventus', membri: ['McKennie', 'Vidal'] }]
};

V['Scritte sul petto'] = {
    // Juventus: Ariston 1981-89, Upim 1989-92, Sony 1995-98, Jeep dal 2012; Milan: Ennedue 1982-84, Mediolanum anni '80-'90,
    // Opel 1994-2006, Emirates dal 2010; Inter: FitGar 1991-92, Pirelli 1995-2021, Paramount+ 2023-24, Betsson dal 2024;
    // Napoli: Buitoni 1985-88, Mars 1988-91, Voiello anni '90, Lete 2004-22
    g: ['JUV', 'MIL', 'INT', 'NAP'],
    a: { Ariston: 'JUV', Upim: 'JUV', Sony: 'JUV', Jeep: 'JUV', Ennedue: 'MIL', Mediolanum: 'MIL', Opel: 'MIL', Emirates: 'MIL',
        FitGar: 'INT', Pirelli: 'INT', 'Paramount+': 'INT', Betsson: 'INT', Buitoni: 'NAP', Mars: 'NAP', Voiello: 'NAP', Lete: 'NAP' },
    t: [{ nome: 'Marchi di automobili', membri: ['Jeep', 'Opel'] }]
};

V['Passaporti di Serie A'] = {
    g: ['BEL', 'SRB', 'POR', 'BIH'],
    a: { Lukaku: 'BEL', Mertens: 'BEL', Nainggolan: 'BEL', 'De Ketelaere': 'BEL', 'Vlahović': 'SRB', Kolarov: 'SRB', 'Jugović': 'SRB',
        'Ljajić': 'SRB', Cancelo: 'POR', 'Mário Rui': 'POR', Dimas: 'POR', 'Paulo Sousa': 'POR', 'Džeko': 'BIH', 'Pjanić': 'BIH',
        'Kolašinac': 'BIH', 'Lulić': 'BIH' },
    t: [{ nome: 'Hanno giocato nel Napoli', membri: ['Lukaku', 'Mertens', 'Mário Rui'] }]
};

V['Panchine straniere'] = {
    g: ['ESP', 'GER', 'POR', 'ARG'],
    a: { Guardiola: 'ESP', Arteta: 'ESP', Emery: 'ESP', 'Xabi Alonso': 'ESP', Klopp: 'GER', Nagelsmann: 'GER', Rangnick: 'GER', 'Löw': 'GER',
        'Villas-Boas': 'POR', Amorim: 'POR', Fonseca: 'POR', 'Jorge Jesus': 'POR', Pochettino: 'ARG', Bielsa: 'ARG', Gallardo: 'ARG', Scaloni: 'ARG' },
    t: [{ nome: 'Hanno vinto la Champions in panchina', membri: ['Guardiola', 'Klopp'] }]
};

V['Dinastie d\'Europa'] = {
    g: ['RM', 'AJAX', 'BAY', 'LIV'],
    a: { 'Puskás': 'RM', Gento: 'RM', Kopa: 'RM', 'Santamaría': 'RM', Neeskens: 'AJAX', Krol: 'AJAX', Keizer: 'AJAX', Haan: 'AJAX',
        Maier: 'BAY', Breitner: 'BAY', 'Hoeneß': 'BAY', Schwarzenbeck: 'BAY', Clemence: 'LIV', Heighway: 'LIV', McDermott: 'LIV', Case: 'LIV' },
    t: [{ nome: 'Portieri', membri: ['Maier', 'Clemence'] }]
};

V['Cognomi di club'] = {
    // Real Sociedad, Real Betis, Real Zaragoza, Real Oviedo; Sporting CP (Lisbona), SC Braga, Sporting Kansas City, Sporting Charleroi;
    // Dynamo Kiev, Dynamo Dresda, Dinamo Zagabria, Dinamo Brest; Racing Strasburgo, Racing Genk, Racing Club (Avellaneda), Racing Ferrol
    g: ['Real', 'Sporting', 'Dinamo', 'Racing'],
    a: { Sociedad: 'Real', Betis: 'Real', Saragozza: 'Real', Oviedo: 'Real', Lisbona: 'Sporting', Braga: 'Sporting', 'Kansas City': 'Sporting',
        Charleroi: 'Sporting', Kiev: 'Dinamo', Dresda: 'Dinamo', Zagabria: 'Dinamo', Brest: 'Dinamo', Strasburgo: 'Racing', Genk: 'Racing',
        Avellaneda: 'Racing', Ferrol: 'Racing' },
    t: [{ nome: 'Capitali', membri: ['Lisbona', 'Kiev', 'Zagabria'] }, { nome: 'Città spagnole', membri: ['Saragozza', 'Oviedo', 'Ferrol'] }]
};

V['Bomber di città'] = {
    g: [L.CAPO.Fiorentina, L.CAPO.Roma, L.CAPO.Torino, L.CAPO.Bologna],
    t: [{ nome: 'Campioni del mondo', lista: 'CAMPIONI_MONDO' }]
};

V['Derby del mondo'] = {
    g: ['ESP', 'GBR', 'SUD', 'GER'],
    a: { 'El Clásico': 'ESP', 'Derbi madrileño': 'ESP', 'El Gran Derbi': 'ESP', 'Derbi vasco': 'ESP', 'North London': 'GBR', Merseyside: 'GBR',
        'Tyne-Wear': 'GBR', 'Old Firm': 'GBR', 'Superclásico': 'SUD', 'Fla-Flu': 'SUD', Grenal: 'SUD', 'Choque-Rei': 'SUD',
        'Der Klassiker': 'GER', Revierderby: 'GER', Nordderby: 'GER', Rheinderby: 'GER' },
    t: [{ nome: '«Classico» nel nome', membri: ['El Clásico', 'Superclásico', 'Der Klassiker'] }]
};

V['Finali azzurre'] = {
    // finali: Mondiali 1934, 1938, 1970, 1982, 1994, 2006; Europei 1968 (e ripetizione), 2000, 2012, 2021
    g: [['Orsi', 'Schiavio', 'Colaussi', 'Piola', 'Domenghini', 'Riva', 'Anastasi', 'Boninsegna', 'Rossi', 'Tardelli', 'Altobelli',
        'Delvecchio', 'Materazzi', 'Bonucci'],
    ['Combi', 'Olivieri', 'Zoff', 'Albertosi', 'Pagliuca', 'Toldo', 'Buffon', 'Donnarumma'],
    ['Pozzo', 'Valcareggi', 'Bearzot', 'Sacchi', 'Zoff', 'Lippi', 'Prandelli', 'Mancini'],
    ['Baresi', 'Massaro', 'Baggio', 'Belotti', 'Jorginho']],
    t: [{ nome: 'Campioni d\'Europa 2021', lista: 'EURO_2021' }]
};

V['Nomi d\'arte'] = {
    g: ['BRA', 'ESP', 'POR', 'ITA'],
    a: { Zico: 'BRA', Cafu: 'BRA', Dida: 'BRA', Hulk: 'BRA', Koke: 'ESP', Joselu: 'ESP', Nolito: 'ESP', Isco: 'ESP', Nani: 'POR', Deco: 'POR',
        Vitinha: 'POR', Danny: 'POR', 'João Pedro': 'ITA', Amauri: 'ITA', 'Éder': 'ITA', Emerson: 'ITA' },
    t: [{ nome: 'Hanno giocato nella Roma', membri: ['Cafu', 'Emerson'] }]
};

V['Bomber delle grandi'] = {
    g: [L.CAPO.Inter, L.CAPO.Juventus, L.CAPO.Milan, L.CAPO.MAI_CAMPIONI],
    t: []
};

V['Numeri uno del mondo'] = {
    g: ['ESP', 'GER', 'BRA', 'ENG'],
    a: { Zubizarreta: 'ESP', Iribar: 'ESP', 'De Gea': 'ESP', 'Cañizares': 'ESP', Neuer: 'GER', Kahn: 'GER', Lehmann: 'GER', Schumacher: 'GER',
        Taffarel: 'BRA', Alisson: 'BRA', Ederson: 'BRA', 'Júlio César': 'BRA', Shilton: 'ENG', Seaman: 'ENG', Pickford: 'ENG', Hart: 'ENG' },
    t: [{ nome: 'Campioni del mondo', lista: 'CAMPIONI_MONDO' }]
};

V['Padroni di casa'] = {
    g: [L.MONDIALE_IN_CASA, L.OSPITI_EUROPEO.filter((x) => L.OSPITI_MONDIALE.indexOf(x) < 0), L.MONDIALE_CONDIVISO, L.MONDIALI_2030_2034],
    t: []
};

V['Piccole grandi nazioni'] = {
    g: ['WAL', 'NIR', 'ISL', 'FIN'],
    a: { Bale: 'WAL', Giggs: 'WAL', Southall: 'WAL', Hughes: 'WAL', Best: 'NIR', Jennings: 'NIR', Lafferty: 'NIR', Healy: 'NIR',
        Gudjohnsen: 'ISL', Sigurdsson: 'ISL', Finnbogason: 'ISL', 'Halldórsson': 'ISL', Litmanen: 'FIN', 'Hyypiä': 'FIN', Pukki: 'FIN', Forssell: 'FIN' },
    t: [{ nome: 'Hanno giocato nel Manchester United', membri: ['Giggs', 'Hughes', 'Best'] },
        { nome: 'Portieri', membri: ['Southall', 'Jennings', 'Halldórsson'] }]
};

V['Il secondo nome'] = {
    g: ['United', 'City', 'Rovers', 'Athletic'],
    a: { Leeds: 'United', Newcastle: 'United', 'West Ham': 'United', Southend: 'United', Leicester: 'City', Norwich: 'City', Hull: 'City',
        Stoke: 'City', Blackburn: 'Rovers', Tranmere: 'Rovers', Doncaster: 'Rovers', 'Forest Green': 'Rovers', Charlton: 'Athletic',
        Oldham: 'Athletic', Wigan: 'Athletic', Dunfermline: 'Athletic' },
    t: [{ nome: 'Club di Londra', membri: ['West Ham', 'Charlton'] }]
};

V['Stadi di provincia'] = {
    // Cremonese, Brescia, Como, Atalanta / Empoli, Pisa, Livorno, Lucchese / Bari, Lecce, Foggia, Taranto / Parma, Modena, SPAL, Sassuolo
    g: ['LOM', 'TOS', 'PUG', 'EMI'],
    a: { Zini: 'LOM', Rigamonti: 'LOM', Sinigaglia: 'LOM', Gewiss: 'LOM', Castellani: 'TOS', 'Arena Garibaldi': 'TOS', Picchi: 'TOS',
        'Porta Elisa': 'TOS', 'San Nicola': 'PUG', 'Via del Mare': 'PUG', Zaccheria: 'PUG', Iacovone: 'PUG', Tardini: 'EMI', Braglia: 'EMI',
        Mazza: 'EMI', Mapei: 'EMI' },
    t: []
};

V['Ultime fermate'] = {
    g: ['MLS', 'SAU', 'JPN', 'QAT'],
    a: { Beckham: 'MLS', Henry: 'MLS', Gerrard: 'MLS', Lampard: 'MLS', Benzema: 'SAU', 'Mané': 'SAU', 'Brozović': 'SAU', Henderson: 'SAU',
        Iniesta: 'JPN', Podolski: 'JPN', Lineker: 'JPN', 'Stojković': 'JPN', Batistuta: 'QAT', 'Raúl': 'QAT', Sneijder: 'QAT', Cazorla: 'QAT' },
    t: [{ nome: 'Campioni del mondo', lista: 'CAMPIONI_MONDO' }]
};

V['Radici azzurre'] = {
    g: ['SAR', 'SIC', 'PUG', 'EST'],
    a: { Zola: 'SAR', Matteoli: 'SAR', Barella: 'SAR', Sirigu: 'SAR', Anastasi: 'SIC', Furino: 'SIC', Coco: 'SIC', Galia: 'SIC',
        Conte: 'PUG', Rizzitelli: 'PUG', Causio: 'PUG', 'Pellè': 'PUG', Camoranesi: 'EST', Perrotta: 'EST', 'Thiago Motta': 'EST', Amauri: 'EST' },
    t: []
};

V['Africa di club'] = {
    g: ['EGY', 'MAR', 'TUN', 'RSA'],
    a: { 'Al Ahly': 'EGY', Zamalek: 'EGY', Pyramids: 'EGY', Ismaily: 'EGY', 'Raja Casablanca': 'MAR', Wydad: 'MAR', 'FAR Rabat': 'MAR',
        'RS Berkane': 'MAR', 'Espérance': 'TUN', 'Étoile du Sahel': 'TUN', 'Club Africain': 'TUN', 'CS Sfaxien': 'TUN',
        'Kaizer Chiefs': 'RSA', 'Orlando Pirates': 'RSA', 'Mamelodi Sundowns': 'RSA', 'SuperSport United': 'RSA' },
    t: []
};

V['Panchine del centro-sud'] = {
    // club allenati tra Napoli, Roma, Lazio e Fiorentina (solo da allenatore)
    g: ['NAP', 'ROM', 'LAZ', 'FIO'],
    a: { Conte: 'NAP', Calzona: 'NAP', Bigon: 'NAP', Donadoni: 'NAP', Mourinho: 'ROM', 'Di Francesco': 'ROM', Juric: 'ROM', 'De Rossi': 'ROM',
        'Simone Inzaghi': 'LAZ', 'Petković': 'LAZ', Ballardini: 'LAZ', Papadopulo: 'LAZ', Italiano: 'FIO', Palladino: 'FIO', Iachini: 'FIO',
        'Mihajlović': 'FIO' },
    t: [{ nome: 'Hanno allenato l\'Inter', membri: ['Conte', 'Mourinho', 'Simone Inzaghi'] },
        { nome: 'Hanno giocato nella Lazio', membri: ['Simone Inzaghi', 'Mihajlović'] }]
};

V['Asia e Oceania di club'] = {
    g: ['AUS', 'CHN', 'KOR', 'QAT'],
    a: { 'Melbourne Victory': 'AUS', 'Sydney FC': 'AUS', 'Western Sydney': 'AUS', 'Perth Glory': 'AUS', Guangzhou: 'CHN', 'Shanghai Port': 'CHN',
        'Shandong Taishan': 'CHN', 'Beijing Guoan': 'CHN', Jeonbuk: 'KOR', Ulsan: 'KOR', 'Pohang Steelers': 'KOR', 'FC Seoul': 'KOR',
        'Al-Sadd': 'QAT', 'Al-Duhail': 'QAT', 'Al-Gharafa': 'QAT', 'Al-Rayyan': 'QAT' },
    t: [{ nome: 'Una capitale nel nome', membri: ['Beijing Guoan', 'FC Seoul'] }]
};

V['Sudamerica d\'autore'] = {
    g: ['ARG', 'BRA', 'URU', 'PAR'],
    a: { Passarella: 'ARG', Ardiles: 'ARG', Valdano: 'ARG', Burruchaga: 'ARG', 'Sócrates': 'BRA', Careca: 'BRA', 'Júnior': 'BRA', Dirceu: 'BRA',
        Francescoli: 'URU', 'Rubén Sosa': 'URU', 'Rubén Paz': 'URU', Aguilera: 'URU', Chilavert: 'PAR', Gamarra: 'PAR', Arce: 'PAR', Romerito: 'PAR' },
    t: [{ nome: 'Hanno giocato nell\'Inter', membri: ['Passarella', 'Rubén Sosa', 'Gamarra'] },
        { nome: 'Hanno giocato nella Fiorentina', membri: ['Sócrates', 'Passarella'] }]
};

V['Dizionario del pallone'] = {
    g: ['calcio', 'portiere', 'allenatore', 'fuorigioco'],
    a: { 'Fútbol': 'calcio', Futebol: 'calcio', 'Fußball': 'calcio', Voetbal: 'calcio', Portero: 'portiere', Goleiro: 'portiere', Torwart: 'portiere',
        Keeper: 'portiere', Entrenador: 'allenatore', 'Técnico': 'allenatore', Trainer: 'allenatore', Coach: 'allenatore',
        'Fuera de juego': 'fuorigioco', Impedimento: 'fuorigioco', Buitenspel: 'fuorigioco', 'Hors-jeu': 'fuorigioco' },
    t: [{ nome: 'Parole tedesche', membri: ['Fußball', 'Torwart', 'Trainer'] }]
};

V['Germania in quattro regioni'] = {
    g: ['RUHR', 'BAV', 'NORD', 'EST'],
    a: { Dortmund: 'RUHR', Schalke: 'RUHR', Bochum: 'RUHR', Duisburg: 'RUHR', Bayern: 'BAV', Norimberga: 'BAV', Augusta: 'BAV',
        'Greuther Fürth': 'BAV', Amburgo: 'NORD', 'Werder Brema': 'NORD', 'St. Pauli': 'NORD', 'Holstein Kiel': 'NORD', 'RB Lipsia': 'EST',
        'Dynamo Dresda': 'EST', 'Hansa Rostock': 'EST', 'Energie Cottbus': 'EST' },
    t: []
};

V['Spagna in quattro regioni'] = {
    g: ['AND', 'PV', 'VAL', 'GAL'],
    a: { Siviglia: 'AND', 'Real Betis': 'AND', 'Málaga': 'AND', Cadice: 'AND', 'Athletic Bilbao': 'PV', 'Real Sociedad': 'PV', Eibar: 'PV',
        'Alavés': 'PV', Valencia: 'VAL', Villarreal: 'VAL', Levante: 'VAL', Elche: 'VAL', 'Celta Vigo': 'GAL', Deportivo: 'GAL',
        Compostela: 'GAL', Lugo: 'GAL' },
    t: [{ nome: '«Real» nel nome', membri: ['Real Betis', 'Real Sociedad'] }]
};

V['Il mondo in quattro confederazioni'] = {
    g: ['CONCACAF', 'AFC', 'CAF', 'OFC'],
    a: { 'Costa Rica': 'CONCACAF', Honduras: 'CONCACAF', Giamaica: 'CONCACAF', Panama: 'CONCACAF', Australia: 'AFC', Iran: 'AFC',
        Uzbekistan: 'AFC', Giordania: 'AFC', 'Capo Verde': 'CAF', Mali: 'CAF', 'Burkina Faso': 'CAF', Gabon: 'CAF',
        'Nuova Zelanda': 'OFC', Tahiti: 'OFC', Figi: 'OFC', 'Isole Salomone': 'OFC' },
    t: []
};

/* Le due schede congelate con il problema noto (servono a provare l'errata) */
V['Portieri, bomber e giramondo'] = {
    g: [['Buffon', 'Zenga', 'Donnarumma', 'Zoff', 'Peruzzi', 'Pagliuca', 'Albertosi', 'Toldo'],
        [].concat.apply([], Object.keys(L.CAPO).map((k) => L.CAPO[k])),
        // hanno giocato in Juventus, Inter e Milan
        ['Ibrahimović', 'Vieri', 'Pirlo', 'Davids', 'Boninsegna', 'Bonucci', 'Cuadrado', 'Baggio', 'Seedorf'],
        ['Cassano', 'Platt', 'Ventola', 'Ranocchia', 'Bonucci', 'Protti', 'Boban']],
    t: []
};
V['Dal dischetto e dintorni'] = {
    g: [['Combi', 'Olivieri', 'Albertosi', 'Zoff', 'Zenga', 'Pagliuca', 'Buffon', 'Sirigu'],
        ['Combi', 'Meazza', 'Facchetti', 'Zoff', 'Cannavaro', 'Chiellini'],
        ['Guaita', 'Colaussi', 'Meazza', 'Boninsegna', 'Burgnich', 'Riva', 'Rivera', 'Rossi', 'Schillaci', 'Baggio', 'Grosso', 'Del Piero'],
        ['Donadoni', 'Serena', 'Baresi', 'Massaro', 'Baggio', 'Albertini', 'Di Biagio', 'Maldini', 'De Rossi', 'Di Natale', 'Montolivo',
            'Zaza', 'Pellè', 'Bonucci', 'Darmian', 'Belotti', 'Jorginho', 'Locatelli']],
    t: []
};

/* ------------------------------------------------------------------ MOTORE */
function has(list, v) {
    const k = norm(v);
    return list.some((x) => norm(x) === k);
}
/** Le etichette (indici dei gruppi) che il nome v soddisfa secondo i fatti. */
function etichette(def, v) {
    const out = [];
    def.g.forEach((g, gi) => {
        if (Array.isArray(g)) { if (has(g, v)) out.push(gi); return; }
        const a = def.a || {};
        const key = Object.keys(a).find((k) => norm(k) === norm(v));
        const val = key == null ? [] : [].concat(a[key]);
        if (val.indexOf(g) >= 0) out.push(gi);
    });
    return out;
}

/**
 * Controlla le schede: restituisce { errori: [...], doppi: { titolo: [nomi in due gruppi] } }.
 * opts.dal: primo numero da controllare a fondo (default 53).
 */
function verifica(schede, opts) {
    opts = opts || {};
    const dal = opts.dal || 53;
    const errori = [];
    const doppi = {};
    schede.forEach((p) => {
        const def = V[p.titolo];
        const nuova = p.n >= dal;
        if (!def) { if (nuova) errori.push(`N° ${p.n} «${p.titolo}»: mancano i fatti per la verifica`); return; }
        const voci = p.gruppi.map((g) => g.voci);
        voci.forEach((vs, gi) => vs.forEach((v) => {
            const e = etichette(def, v);
            if (e.indexOf(gi) < 0) errori.push(`N° ${p.n}: «${v}» non risulta nel gruppo «${p.gruppi[gi].nome}»`);
            const altri = e.filter((x) => x !== gi);
            if (altri.length) {
                (doppi[p.titolo] = doppi[p.titolo] || []).push(v);
                if (nuova) errori.push(`N° ${p.n}: «${v}» sta anche in «${altri.map((x) => p.gruppi[x].nome).join('», «')}»`);
            }
        }));
        if (!nuova) return;
        // trappole: 2 o 3 nomi, da almeno due gruppi diversi
        (def.t || []).forEach((t) => {
            const tutte = voci.reduce((a, b) => a.concat(b), []);
            const membri = t.lista ? tutte.filter((v) => has(L[t.lista], v)) : t.membri;
            membri.forEach((m) => { if (!has(tutte, m)) errori.push(`N° ${p.n}: la trappola «${t.nome}» cita «${m}», che non è nella scheda`); });
            const gruppi = new Set(membri.map((m) => voci.findIndex((vs) => has(vs, m))));
            if (membri.length < 2 || membri.length > 3) errori.push(`N° ${p.n}: la trappola «${t.nome}» prende ${membri.length} nomi (servono 2 o 3)`);
            if (gruppi.size < 2) errori.push(`N° ${p.n}: la trappola «${t.nome}» sta tutta in un gruppo`);
        });
    });
    return { errori, doppi };
}

module.exports = { V, L, verifica, etichette, norm };

if (require.main === module) {
    const path = require('path');
    const { quattroSchede } = require(path.join(__dirname, '..', 'assets', 'db-quattro.js'));
    const r = verifica(quattroSchede);
    const nuove = quattroSchede.filter((p) => p.n >= 53);
    const trap = nuove.reduce((s, p) => s + ((V[p.titolo] || {}).t || []).length, 0);
    console.log(`Schede controllate: ${nuove.length} (dal N° 53), trappole: ${trap}.`);
    Object.keys(r.doppi).forEach((t) => console.log(`Nomi in due gruppi in «${t}»: ${r.doppi[t].join(', ')}`));
    if (r.errori.length) { console.log(r.errori.join('\n')); process.exit(1); }
    console.log('Nessun nome in due gruppi nelle schede nuove.');
}
