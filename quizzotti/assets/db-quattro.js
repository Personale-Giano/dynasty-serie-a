/* ==========================================================================
   QUIZZOTTI — Quattro per Quattro: le schede
   --------------------------------------------------------------------------
   ATTENZIONE: database A SOLA AGGIUNTA.
   Le schede pubblicate NON vanno modificate, corrette, riordinate o tolte:
   i progressi dei giocatori sono salvati per numero di scheda (qz.quattro.v1)
   e tests/quattro.test.js controlla l'impronta (sha256) delle schede 1..N.
   Le schede nuove si aggiungono IN FONDO con il numero successivo; poi si
   aggiorna nel test il conteggio e l'impronta.

   Ogni scheda: 4 gruppi da 4 nomi, difficoltà d da 1 (facile) a 4
   (difficilissimo). Ogni nome deve appartenere a UN SOLO gruppo: nessun
   nome può soddisfare anche l'etichetta di un altro gruppo della scheda.
   Fatti aggiornati al 16 novembre 2026 (Spagna campione del mondo 2026,
   Inter campione d'Italia 2025-26, PSG campione d'Europa 2025 e 2026).
   ========================================================================== */
var quattroSchede = [
    {
        n: 1, tema: 'azzurri', titolo: 'Notte di Berlino',
        gruppi: [
            { d: 1, nome: 'Animali simbolo di un club', voci: ['Lupa', 'Aquila', 'Zebra', 'Biscione'] },
            { d: 2, nome: 'Stadi intitolati a una persona', voci: ['Maradona', 'Meazza', 'Ferraris', 'Franchi'] },
            { d: 3, nome: 'Italiani vincitori del Pallone d\'Oro', voci: ['Rivera', 'Rossi', 'Baggio', 'Cannavaro'] },
            { d: 4, nome: 'Rigori segnati nella finale di Berlino 2006', voci: ['Pirlo', 'Materazzi', 'De Rossi', 'Grosso'] }
        ]
    },
    {
        n: 2, tema: 'serie-a', titolo: 'Panchine e bandiere',
        gruppi: [
            { d: 1, nome: 'Tutta la carriera in un solo club', voci: ['Facchetti', 'Totti', 'Bergomi', 'Baresi'] },
            { d: 2, nome: 'Commissari tecnici dell\'Italia', voci: ['Bearzot', 'Vicini', 'Zoff', 'Prandelli'] },
            { d: 3, nome: 'Campioni d\'Europa in panchina con un club italiano', voci: ['Capello', 'Mourinho', 'Rocco', 'Ancelotti'] },
            { d: 4, nome: 'Di nome fanno Alessandro', voci: ['Del Piero', 'Nesta', 'Costacurta', 'Bastoni'] }
        ]
    },
    {
        n: 3, tema: 'estero', titolo: 'Oltremanica e dintorni',
        gruppi: [
            { d: 1, nome: 'Club inglesi', voci: ['Chelsea', 'Liverpool', 'Fulham', 'Aston Villa'] },
            { d: 2, nome: 'Stadi spagnoli', voci: ['Bernabéu', 'Camp Nou', 'Mestalla', 'Metropolitano'] },
            { d: 3, nome: 'Vincitori del Pallone d\'Oro', voci: ['Messi', 'Modrić', 'Benzema', 'Owen'] },
            { d: 4, nome: 'Soprannomi di club inglesi', voci: ['Gunners', 'Toffees', 'Magpies', 'Hammers'] }
        ]
    },
    {
        n: 4, tema: 'storia', titolo: 'Il giro del mondo',
        gruppi: [
            { d: 1, nome: 'Nazionali campioni del mondo', voci: ['Uruguay', 'Inghilterra', 'Brasile', 'Germania'] },
            { d: 2, nome: 'Hanno ospitato un Mondiale senza mai vincerlo', voci: ['Svezia', 'Cile', 'Svizzera', 'Messico'] },
            { d: 3, nome: 'Città che hanno ospitato una finale mondiale', voci: ['Pasadena', 'Yokohama', 'Lusail', 'Saint-Denis'] },
            { d: 4, nome: 'Capocannonieri di un Mondiale', voci: ['Schillaci', 'Fontaine', 'Klose', 'Kempes'] }
        ]
    },
    {
        n: 5, tema: 'serie-a', titolo: 'Tutti i soprannomi',
        gruppi: [
            { d: 1, nome: 'Simboli di un club', voci: ['Grifone', 'Ciuccio', 'Biscione', 'Diavolo'] },
            { d: 2, nome: 'Soprannomi di calciatori', voci: ['Pupone', 'Codino', 'Pinturicchio', 'Spillo'] },
            { d: 3, nome: 'Soprannomi di allenatori', voci: ['Special One', 'Mago', 'Paron', 'Trap'] },
            { d: 4, nome: 'Derby della…', voci: ['Madonnina', 'Mole', 'Lanterna', 'Capitale'] }
        ]
    },
    {
        n: 6, tema: 'estero', titolo: 'Sudamericani d\'Italia',
        gruppi: [
            { d: 1, nome: 'Brasiliani passati dal Milan', voci: ['Kakà', 'Ronaldinho', 'Dida', 'Pato'] },
            { d: 2, nome: 'Argentini dell\'Inter', voci: ['Zanetti', 'Cambiasso', 'Milito', 'Samuel'] },
            { d: 3, nome: 'Uruguaiani in Serie A', voci: ['Recoba', 'Francescoli', 'Cavani', 'Fonseca'] },
            { d: 4, nome: 'Brasiliani della Roma', voci: ['Falcão', 'Aldair', 'Cerezo', 'Alisson'] }
        ]
    },
    {
        n: 7, tema: 'storia', titolo: 'Coppe dimenticate',
        gruppi: [
            { d: 1, nome: 'Italiane vincitrici della Coppa delle Coppe', voci: ['Fiorentina', 'Sampdoria', 'Lazio', 'Parma'] },
            { d: 2, nome: 'Una sola Coppa dei Campioni in bacheca', voci: ['Celtic', 'Feyenoord', 'Steaua', 'Stella Rossa'] },
            { d: 3, nome: 'Hanno vinto la Coppa delle Coppe da allenatori', voci: ['Boškov', 'Eriksson', 'Scala', 'Trapattoni'] },
            { d: 4, nome: 'Titolari della Samp nella finale di Wembley 1992', voci: ['Pagliuca', 'Vierchowod', 'Lombardo', 'Mancini'] }
        ]
    },
    {
        n: 8, tema: 'serie-a', titolo: 'Portieri, bomber e giramondo',
        gruppi: [
            { d: 1, nome: 'Portieri della Nazionale', voci: ['Buffon', 'Zenga', 'Donnarumma', 'Zoff'] },
            { d: 2, nome: 'Capocannonieri della Serie A', voci: ['Immobile', 'Toni', 'Di Natale', 'Signori'] },
            { d: 3, nome: 'Hanno giocato in Juve, Inter e Milan', voci: ['Ibrahimović', 'Vieri', 'Pirlo', 'Davids'] },
            { d: 4, nome: 'Hanno giocato nel Bari', voci: ['Cassano', 'Platt', 'Ventola', 'Ranocchia'] }
        ]
    },
    {
        n: 9, tema: 'estero', titolo: 'Viaggio in Europa',
        gruppi: [
            { d: 1, nome: 'Club portoghesi', voci: ['Benfica', 'Porto', 'Sporting', 'Braga'] },
            { d: 2, nome: 'Club tedeschi', voci: ['Schalke', 'Werder', 'Amburgo', 'Stoccarda'] },
            { d: 3, nome: 'Club olandesi', voci: ['Ajax', 'PSV', 'Feyenoord', 'AZ'] },
            { d: 4, nome: 'Club scozzesi', voci: ['Celtic', 'Rangers', 'Hibernian', 'Aberdeen'] }
        ]
    },
    {
        n: 10, tema: 'curiosita', titolo: 'Colori sociali',
        gruppi: [
            { d: 1, nome: 'Bianconeri', voci: ['Juventus', 'Udinese', 'Cesena', 'Ascoli'] },
            { d: 2, nome: 'Rossoblù', voci: ['Bologna', 'Genoa', 'Cagliari', 'Crotone'] },
            { d: 3, nome: 'Nerazzurri', voci: ['Inter', 'Atalanta', 'Pisa', 'Latina'] },
            { d: 4, nome: 'Gialloblù', voci: ['Verona', 'Parma', 'Modena', 'Chievo'] }
        ]
    },
    {
        n: 11, tema: 'azzurri', titolo: 'Quattro Mondiali',
        gruppi: [
            { d: 1, nome: 'Campioni del mondo 2006', voci: ['Gattuso', 'Zambrotta', 'Toni', 'Iaquinta'] },
            { d: 2, nome: 'Campioni del mondo 1982', voci: ['Zoff', 'Gentile', 'Tardelli', 'Conti'] },
            { d: 3, nome: 'Convocati a Italia \'90', voci: ['Schillaci', 'Giannini', 'Ferri', 'Zenga'] },
            { d: 4, nome: 'Campioni del mondo negli anni \'30', voci: ['Meazza', 'Piola', 'Combi', 'Ferrari'] }
        ]
    },
    {
        n: 12, tema: 'estero', titolo: 'Premier all\'italiana',
        gruppi: [
            { d: 1, nome: 'Stadi inglesi', voci: ['Anfield', 'Old Trafford', 'Stamford Bridge', 'Villa Park'] },
            { d: 2, nome: 'Leggende del Manchester United', voci: ['Giggs', 'Scholes', 'Cantona', 'Rooney'] },
            { d: 3, nome: 'Italiani campioni d\'Inghilterra in panchina', voci: ['Ranieri', 'Mancini', 'Ancelotti', 'Conte'] },
            { d: 4, nome: 'Italiani in campo con il Chelsea', voci: ['Zola', 'Di Matteo', 'Vialli', 'Jorginho'] }
        ]
    },
    {
        n: 13, tema: 'serie-a', titolo: 'Giù al Sud',
        gruppi: [
            { d: 1, nome: 'Squadre siciliane', voci: ['Palermo', 'Catania', 'Messina', 'Trapani'] },
            { d: 2, nome: 'Squadre pugliesi', voci: ['Bari', 'Lecce', 'Foggia', 'Taranto'] },
            { d: 3, nome: 'Squadre calabresi', voci: ['Reggina', 'Crotone', 'Cosenza', 'Catanzaro'] },
            { d: 4, nome: 'Nel nome del club la città non c\'è', voci: ['Juventus', 'Sampdoria', 'Lazio', 'Südtirol'] }
        ]
    },
    {
        n: 14, tema: 'storia', titolo: 'Squadre leggendarie',
        gruppi: [
            { d: 1, nome: 'Il Milan di Sacchi', voci: ['Van Basten', 'Rijkaard', 'Tassotti', 'Ancelotti'] },
            { d: 2, nome: 'La Juve campione d\'Europa 1985', voci: ['Platini', 'Boniek', 'Scirea', 'Cabrini'] },
            { d: 3, nome: 'La Grande Inter di Herrera', voci: ['Facchetti', 'Suárez', 'Corso', 'Burgnich'] },
            { d: 4, nome: 'Il Grande Torino', voci: ['Bacigalupo', 'Loik', 'Gabetto', 'Ossola'] }
        ]
    },
    {
        n: 15, tema: 'curiosita', titolo: 'Affari di famiglia',
        gruppi: [
            { d: 1, nome: 'Portieri dell\'Inter', voci: ['Zenga', 'Julio Cesar', 'Handanović', 'Toldo'] },
            { d: 2, nome: 'Padre e figlio entrambi in Serie A', voci: ['Maldini', 'Chiesa', 'Weah', 'Simeone'] },
            { d: 3, nome: 'Fratelli entrambi in Serie A, ma non gemelli', voci: ['Inzaghi', 'Baresi', 'Lucarelli', 'Cannavaro'] },
            { d: 4, nome: 'Fratelli gemelli', voci: ['De Boer', 'Bender', 'Zenoni', 'Filippini'] }
        ]
    },
    {
        n: 16, tema: 'estero', titolo: 'Notti di Liga',
        gruppi: [
            { d: 1, nome: 'Club spagnoli', voci: ['Sevilla', 'Valencia', 'Villarreal', 'Betis'] },
            { d: 2, nome: 'Leggende del Barcellona', voci: ['Xavi', 'Iniesta', 'Puyol', 'Busquets'] },
            { d: 3, nome: 'Leggende del Real Madrid', voci: ['Raúl', 'Casillas', 'Di Stéfano', 'Ramos'] },
            { d: 4, nome: 'Italiani passati dal Real Madrid, in campo o in panchina', voci: ['Cannavaro', 'Panucci', 'Cassano', 'Capello'] }
        ]
    },
    {
        n: 17, tema: 'serie-a', titolo: 'Cambi di maglia',
        gruppi: [
            { d: 1, nome: 'Hanno giocato nel Napoli', voci: ['Cavani', 'Higuaín', 'Lavezzi', 'Hamšík'] },
            { d: 2, nome: 'Hanno giocato nella Lazio', voci: ['Nesta', 'Nedvěd', 'Klose', 'Immobile'] },
            { d: 3, nome: 'Hanno giocato nella Fiorentina', voci: ['Rui Costa', 'Antognoni', 'Vlahović', 'Ribéry'] },
            { d: 4, nome: 'Hanno giocato nella Roma', voci: ['Montella', 'Falcão', 'Candela', 'Nainggolan'] }
        ]
    },
    {
        n: 18, tema: 'curiosita', titolo: 'Date da ricordare',
        gruppi: [
            { d: 1, nome: 'Mondiali vinti dall\'Italia', voci: ['1934', '1938', '1982', '2006'] },
            { d: 2, nome: 'Finali perse dall\'Italia tra Mondiali ed Europei', voci: ['1970', '1994', '2000', '2012'] },
            { d: 3, nome: 'Scudetti del Napoli', voci: ['1987', '1990', '2023', '2025'] },
            { d: 4, nome: 'Coppa dei Campioni vinta da Inter o Juve', voci: ['1964', '1965', '1985', '1996'] }
        ]
    },
    {
        n: 19, tema: 'storia', titolo: 'Palloni d\'Oro di club',
        gruppi: [
            { d: 1, nome: 'Pallone d\'Oro vinto con il Barcellona', voci: ['Messi', 'Ronaldinho', 'Rivaldo', 'Stoičkov'] },
            { d: 2, nome: 'Pallone d\'Oro vinto con il Real Madrid', voci: ['Modrić', 'Benzema', 'Di Stéfano', 'Figo'] },
            { d: 3, nome: 'Pallone d\'Oro vinto con il Milan', voci: ['Rivera', 'Van Basten', 'Kakà', 'Shevchenko'] },
            { d: 4, nome: 'Pallone d\'Oro vinto con la Juventus', voci: ['Platini', 'Zidane', 'Nedvěd', 'Sivori'] }
        ]
    },
    {
        n: 20, tema: 'azzurri', titolo: 'Europei azzurri',
        gruppi: [
            { d: 1, nome: 'Campioni d\'Europa 2021', voci: ['Donnarumma', 'Insigne', 'Barella', 'Chiesa'] },
            { d: 2, nome: 'Campioni d\'Europa 1968', voci: ['Riva', 'Zoff', 'Facchetti', 'Anastasi'] },
            { d: 3, nome: 'In campo nella finale persa di Euro 2000', voci: ['Del Piero', 'Totti', 'Delvecchio', 'Toldo'] },
            { d: 4, nome: 'In campo nella finale persa di Euro 2012', voci: ['Balotelli', 'Cassano', 'Pirlo', 'Montolivo'] }
        ]
    },
    {
        n: 21, tema: 'estero', titolo: 'Francia e Germania',
        gruppi: [
            { d: 1, nome: 'Tedeschi campioni del mondo 2014', voci: ['Neuer', 'Lahm', 'Müller', 'Götze'] },
            { d: 2, nome: 'Francesi campioni del mondo 1998', voci: ['Zidane', 'Desailly', 'Thuram', 'Barthez'] },
            { d: 3, nome: 'Francesi campioni del mondo 2018', voci: ['Mbappé', 'Griezmann', 'Pogba', 'Kanté'] },
            { d: 4, nome: 'Tedeschi campioni del mondo 1990', voci: ['Matthäus', 'Brehme', 'Klinsmann', 'Völler'] }
        ]
    },
    {
        n: 22, tema: 'serie-a', titolo: 'Allenatori da scudetto',
        gruppi: [
            { d: 1, nome: 'Scudetto in panchina con il Milan', voci: ['Sacchi', 'Zaccheroni', 'Pioli', 'Rocco'] },
            { d: 2, nome: 'Scudetto in panchina con il Napoli', voci: ['Bianchi', 'Bigon', 'Spalletti', 'Conte'] },
            { d: 3, nome: 'Scudetto in panchina con la Fiorentina o la Lazio', voci: ['Bernardini', 'Pesaola', 'Maestrelli', 'Eriksson'] },
            { d: 4, nome: 'Scudetto con Torino, Cagliari, Verona o Samp', voci: ['Radice', 'Scopigno', 'Bagnoli', 'Boškov'] }
        ]
    },
    {
        n: 23, tema: 'curiosita', titolo: 'Lo zoo del pallone',
        gruppi: [
            { d: 1, nome: 'Animali simbolo di club italiani', voci: ['Galletto', 'Rondinella', 'Delfino', 'Picchio'] },
            { d: 2, nome: 'Soprannomi animali di calciatori', voci: ['Pulce', 'Airone', 'Cobra', 'Cigno'] },
            { d: 3, nome: 'Soprannomi di club inglesi', voci: ['Foxes', 'Wolves', 'Canaries', 'Seagulls'] },
            { d: 4, nome: 'Cognomi che sono animali al plurale', voci: ['Gatti', 'Volpi', 'Galli', 'Orsi'] }
        ]
    },
    {
        n: 24, tema: 'estero', titolo: 'Sudamerica',
        gruppi: [
            { d: 1, nome: 'Club brasiliani', voci: ['Flamengo', 'Santos', 'Corinthians', 'Palmeiras'] },
            { d: 2, nome: 'Club argentini', voci: ['Boca', 'River', 'San Lorenzo', 'Independiente'] },
            { d: 3, nome: 'Stadi sudamericani', voci: ['Maracanã', 'Bombonera', 'Centenario', 'Monumental'] },
            { d: 4, nome: 'Club uruguaiani', voci: ['Peñarol', 'Nacional', 'Defensor', 'Danubio'] }
        ]
    },
    {
        n: 25, tema: 'serie-a', titolo: 'Gente da gol',
        gruppi: [
            { d: 1, nome: 'Capocannonieri italiani della Serie A', voci: ['Signori', 'Di Natale', 'Toni', 'Vieri'] },
            { d: 2, nome: 'Capocannonieri stranieri della Serie A', voci: ['Batistuta', 'Bierhoff', 'Higuaín', 'Cavani'] },
            { d: 3, nome: 'In gol in una finale di Champions con un club italiano', voci: ['Milito', 'Massaro', 'Ravanelli', 'Mandžukić'] },
            { d: 4, nome: 'Portieri andati in gol', voci: ['Rampulla', 'Taibi', 'Brignoli', 'Provedel'] }
        ]
    },
    {
        n: 26, tema: 'estero', titolo: 'Leggende per bandiera',
        gruppi: [
            { d: 1, nome: 'Leggende olandesi', voci: ['Cruijff', 'Bergkamp', 'Robben', 'Van Persie'] },
            { d: 2, nome: 'Leggende portoghesi', voci: ['Eusébio', 'Figo', 'Rui Costa', 'Pepe'] },
            { d: 3, nome: 'Leggende croate', voci: ['Modrić', 'Šuker', 'Boban', 'Prosinečki'] },
            { d: 4, nome: 'Leggende belghe', voci: ['Scifo', 'Hazard', 'De Bruyne', 'Ceulemans'] }
        ]
    },
    {
        n: 27, tema: 'serie-a', titolo: 'Traditori o quasi',
        gruppi: [
            { d: 1, nome: 'Hanno giocato nell\'Inter e nel Milan', voci: ['Seedorf', 'Pirlo', 'Cassano', 'Balotelli'] },
            { d: 2, nome: 'Hanno giocato nella Roma e nella Lazio', voci: ['Kolarov', 'Pedro', 'Peruzzi', 'Mihajlović'] },
            { d: 3, nome: 'Hanno giocato nel Napoli e nella Juve', voci: ['Higuaín', 'Zoff', 'Ferrara', 'Altafini'] },
            { d: 4, nome: 'Hanno giocato nella Juve e nel Torino', voci: ['Immobile', 'Ogbonna', 'Zaza', 'Dino Baggio'] }
        ]
    },
    {
        n: 28, tema: 'estero', titolo: 'Notti di Champions',
        gruppi: [
            { d: 1, nome: 'Almeno cinque Coppe dei Campioni', voci: ['Real Madrid', 'Bayern', 'Liverpool', 'Barcellona'] },
            { d: 2, nome: 'Finaliste che non l\'hanno mai vinta', voci: ['Atlético', 'Valencia', 'Arsenal', 'Tottenham'] },
            { d: 3, nome: 'Una Coppa dei Campioni sola, e basta', voci: ['Marsiglia', 'PSV', 'Amburgo', 'Dortmund'] },
            { d: 4, nome: 'Città di una finale di Champions dal 2010', voci: ['Cardiff', 'Kiev', 'Istanbul', 'Lisbona'] }
        ]
    },
    {
        n: 29, tema: 'azzurri', titolo: 'Dal dischetto e dintorni',
        gruppi: [
            { d: 1, nome: 'Portieri titolari dell\'Italia a un Mondiale', voci: ['Albertosi', 'Zenga', 'Pagliuca', 'Buffon'] },
            { d: 2, nome: 'Capitani azzurri che hanno alzato un trofeo', voci: ['Facchetti', 'Zoff', 'Cannavaro', 'Chiellini'] },
            { d: 3, nome: 'In gol in una semifinale mondiale', voci: ['Rivera', 'Schillaci', 'Rossi', 'Grosso'] },
            { d: 4, nome: 'Rigore sbagliato in una lotteria azzurra', voci: ['Donadoni', 'Di Biagio', 'Zaza', 'Pellè'] }
        ]
    },
    {
        n: 30, tema: 'curiosita', titolo: 'Parole di campo',
        gruppi: [
            { d: 1, nome: 'Ruoli in campo', voci: ['Libero', 'Mediano', 'Regista', 'Terzino'] },
            { d: 2, nome: 'Decisioni dell\'arbitro', voci: ['Fuorigioco', 'Ammonizione', 'Espulsione', 'Vantaggio'] },
            { d: 3, nome: 'Zone del campo', voci: ['Area', 'Dischetto', 'Lunetta', 'Bandierina'] },
            { d: 4, nome: 'Colpi d\'autore', voci: ['Rovesciata', 'Cucchiaio', 'Rabona', 'Trivela'] }
        ]
    },
    {
        n: 31, tema: 'estero', titolo: 'Panchine del mondo',
        gruppi: [
            { d: 1, nome: 'Hanno allenato il Barcellona', voci: ['Guardiola', 'Cruijff', 'Rijkaard', 'Luis Enrique'] },
            { d: 2, nome: 'Hanno allenato il Real Madrid', voci: ['Zidane', 'Benítez', 'Mourinho', 'Ancelotti'] },
            { d: 3, nome: 'Ct campioni del mondo', voci: ['Löw', 'Scaloni', 'Scolari', 'Deschamps'] },
            { d: 4, nome: 'Hanno guidato la Nazionale inglese', voci: ['Keegan', 'Eriksson', 'Hodgson', 'Southgate'] }
        ]
    },
    {
        n: 32, tema: 'serie-a', titolo: 'Provinciali di lusso',
        gruppi: [
            { d: 1, nome: 'Hanno giocato nell\'Udinese', voci: ['Zico', 'Di Natale', 'Sánchez', 'Handanović'] },
            { d: 2, nome: 'Hanno giocato nel Parma', voci: ['Asprilla', 'Thuram', 'Zola', 'Crespo'] },
            { d: 3, nome: 'Hanno giocato nell\'Atalanta', voci: ['Doni', 'Gómez', 'Iličić', 'Lookman'] },
            { d: 4, nome: 'Il Chievo dei miracoli', voci: ['Corini', 'Eriberto', 'Marazzina', 'Perrotta'] }
        ]
    },
    {
        n: 33, tema: 'curiosita', titolo: 'Il nome sullo stadio',
        gruppi: [
            { d: 1, nome: 'Il nome di uno sponsor', voci: ['Mapei', 'Gewiss', 'Allianz', 'Bluenergy'] },
            { d: 2, nome: 'Intitolati a un presidente', voci: ['Dall\'Ara', 'Tardini', 'Massimino', 'Barbera'] },
            { d: 3, nome: 'Intitolati a un calciatore', voci: ['Scida', 'Piola', 'Rigamonti', 'Menti'] },
            { d: 4, nome: 'Dedicati a chi non fu né calciatore né dirigente', voci: ['Garibaldi', 'Sinigaglia', 'Penzo', 'Liberati'] }
        ]
    },
    {
        n: 34, tema: 'estero', titolo: 'Come li chiamano',
        gruppi: [
            { d: 1, nome: 'Soprannomi di nazionali campioni del mondo', voci: ['Seleção', 'Albiceleste', 'Furia Roja', 'Bleus'] },
            { d: 2, nome: 'Soprannomi di fuoriclasse stranieri', voci: ['Fenomeno', 'Kaiser', 'Pibe de Oro', 'Perla Nera'] },
            { d: 3, nome: 'Soprannomi di club stranieri', voci: ['Blaugrana', 'Colchoneros', 'Xeneizes', 'Gunners'] },
            { d: 4, nome: 'Soprannomi di nazionali africane', voci: ['Leoni Indomabili', 'Super Eagles', 'Elefanti', 'Black Stars'] }
        ]
    },
    {
        n: 35, tema: 'azzurri', titolo: 'Un Mondiale per gruppo',
        gruppi: [
            { d: 1, nome: 'Campioni del mondo 1982', voci: ['Scirea', 'Cabrini', 'Graziani', 'Antognoni'] },
            { d: 2, nome: 'Convocati a Usa \'94', voci: ['Casiraghi', 'Signori', 'Benarrivo', 'Berti'] },
            { d: 3, nome: 'Convocati a Francia \'98', voci: ['Vieri', 'Di Biagio', 'Pessotto', 'Inzaghi'] },
            { d: 4, nome: 'In campo nella finale di Messico \'70', voci: ['Boninsegna', 'Riva', 'Mazzola', 'Albertosi'] }
        ]
    },
    {
        n: 36, tema: 'estero', titolo: 'Leggende di Premier',
        gruppi: [
            { d: 1, nome: 'Leggende del Liverpool', voci: ['Gerrard', 'Dalglish', 'Rush', 'Salah'] },
            { d: 2, nome: 'Leggende dell\'Arsenal', voci: ['Henry', 'Bergkamp', 'Adams', 'Wright'] },
            { d: 3, nome: 'Leggende del Chelsea', voci: ['Lampard', 'Terry', 'Drogba', 'Zola'] },
            { d: 4, nome: 'Leggende del Manchester United', voci: ['Charlton', 'Best', 'Robson', 'Rooney'] }
        ]
    },
    {
        n: 37, tema: 'serie-a', titolo: 'Napoli, quattro squadre',
        gruppi: [
            { d: 1, nome: 'Il Napoli del primo scudetto (1987)', voci: ['Maradona', 'Giordano', 'Carnevale', 'Bagni'] },
            { d: 2, nome: 'Il Napoli dello scudetto 2023', voci: ['Osimhen', 'Kim', 'Zieliński', 'Lozano'] },
            { d: 3, nome: 'Il Napoli della Coppa Italia 2012', voci: ['Cavani', 'Lavezzi', 'Hamšík', 'De Sanctis'] },
            { d: 4, nome: 'Il Napoli dello scudetto 2025', voci: ['McTominay', 'Lukaku', 'Buongiorno', 'Neres'] }
        ]
    },
    {
        n: 38, tema: 'serie-a', titolo: 'La fascia al braccio',
        gruppi: [
            { d: 1, nome: 'Capitani della Juventus', voci: ['Del Piero', 'Buffon', 'Chiellini', 'Scirea'] },
            { d: 2, nome: 'Capitani della Roma', voci: ['Totti', 'De Rossi', 'Di Bartolomei', 'Giannini'] },
            { d: 3, nome: 'Capitani dell\'Inter', voci: ['Zanetti', 'Facchetti', 'Bergomi', 'Handanović'] },
            { d: 4, nome: 'Capitani del Milan', voci: ['Maldini', 'Rivera', 'Ambrosini', 'Romagnoli'] }
        ]
    },
    {
        n: 39, tema: 'curiosita', titolo: 'In bacheca',
        gruppi: [
            { d: 1, nome: 'Trofei per nazionali', voci: ['Mondiale', 'Europeo', 'Copa América', 'Nations League'] },
            { d: 2, nome: 'Trofei europei per club', voci: ['Champions', 'Europa League', 'Conference League', 'Supercoppa europea'] },
            { d: 3, nome: 'Premi individuali', voci: ['Pallone d\'Oro', 'Scarpa d\'Oro', 'Golden Boy', 'The Best'] },
            { d: 4, nome: 'Trofei italiani', voci: ['Scudetto', 'Coppa Italia', 'Supercoppa italiana', 'Torneo di Viareggio'] }
        ]
    },
    {
        n: 40, tema: 'estero', titolo: 'Città con tanti derby',
        gruppi: [
            { d: 1, nome: 'Club di Londra', voci: ['Arsenal', 'Tottenham', 'West Ham', 'Crystal Palace'] },
            { d: 2, nome: 'Club di Istanbul', voci: ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Başakşehir'] },
            { d: 3, nome: 'Club di Buenos Aires', voci: ['Boca Juniors', 'River Plate', 'San Lorenzo', 'Huracán'] },
            { d: 4, nome: 'Club della regione di Madrid', voci: ['Atlético', 'Rayo Vallecano', 'Getafe', 'Leganés'] }
        ]
    },
    {
        n: 41, tema: 'curiosita', titolo: 'Nomi di battesimo',
        gruppi: [
            { d: 1, nome: 'Si chiamano Roberto', voci: ['Baggio', 'Donadoni', 'Di Matteo', 'Pruzzo'] },
            { d: 2, nome: 'Si chiamano Francesco', voci: ['Totti', 'Toldo', 'Acerbi', 'Coco'] },
            { d: 3, nome: 'Si chiamano Fabio', voci: ['Capello', 'Grosso', 'Quagliarella', 'Liverani'] },
            { d: 4, nome: 'Si chiamano Paolo', voci: ['Maldini', 'Di Canio', 'Montero', 'Pulici'] }
        ]
    },
    {
        n: 42, tema: 'storia', titolo: 'Le maglie dei campioni',
        gruppi: [
            { d: 1, nome: 'Squadre di Maradona', voci: ['Napoli', 'Siviglia', 'Boca', 'Argentinos Juniors'] },
            { d: 2, nome: 'Squadre di Ibrahimović', voci: ['Malmö', 'Ajax', 'LA Galaxy', 'PSG'] },
            { d: 3, nome: 'Squadre di Ronaldo il Fenomeno', voci: ['Cruzeiro', 'PSV', 'Corinthians', 'Real Madrid'] },
            { d: 4, nome: 'Squadre di Roberto Baggio', voci: ['Vicenza', 'Fiorentina', 'Bologna', 'Brescia'] }
        ]
    },
    /* ---------- dal N° 43: aggiunte del 16 novembre 2026 ---------- */
    {
        n: 43, tema: 'storia', titolo: 'Notti di finale',
        gruppi: [
            { d: 1, nome: 'Campioni del mondo nel Mondiale di casa', voci: ['Uruguay', 'Inghilterra', 'Argentina', 'Francia'] },
            { d: 2, nome: 'Finaliste mondiali che non l\'hanno mai vinto', voci: ['Olanda', 'Ungheria', 'Svezia', 'Croazia'] },
            { d: 3, nome: 'Stadi di una finale mondiale', voci: ['Wembley', 'Azteca', 'Rose Bowl', 'Lužniki'] },
            { d: 4, nome: 'In gol in una finale mondiale', voci: ['Tardelli', 'Götze', 'Hurst', 'Materazzi'] }
        ]
    },
    {
        n: 44, tema: 'serie-a', titolo: 'Su e giù per lo Stivale',
        gruppi: [
            { d: 1, nome: 'Squadre toscane', voci: ['Fiorentina', 'Empoli', 'Livorno', 'Siena'] },
            { d: 2, nome: 'Squadre lombarde', voci: ['Atalanta', 'Como', 'Monza', 'Cremonese'] },
            { d: 3, nome: 'Squadre venete', voci: ['Vicenza', 'Padova', 'Venezia', 'Cittadella'] },
            { d: 4, nome: 'Squadre emiliane', voci: ['Sassuolo', 'Spal', 'Reggiana', 'Carpi'] }
        ]
    },
    {
        n: 45, tema: 'serie-a', titolo: 'Venuti dal Nord',
        gruppi: [
            { d: 1, nome: 'Olandesi del Milan', voci: ['Gullit', 'Seedorf', 'Kluivert', 'Van Bommel'] },
            { d: 2, nome: 'Tedeschi dell\'Inter', voci: ['Matthäus', 'Brehme', 'Rummenigge', 'Sammer'] },
            { d: 3, nome: 'Svedesi in Serie A', voci: ['Liedholm', 'Nordahl', 'Brolin', 'Kulusevski'] },
            { d: 4, nome: 'Danesi in Serie A', voci: ['Elkjær', 'Tomasson', 'Kjær', 'Højlund'] }
        ]
    },
    {
        n: 46, tema: 'azzurri', titolo: 'Maglia azzurra',
        gruppi: [
            { d: 1, nome: 'Tra i cinque migliori marcatori della Nazionale', voci: ['Riva', 'Meazza', 'Piola', 'Del Piero'] },
            { d: 2, nome: 'Più di 115 presenze in azzurro', voci: ['Cannavaro', 'Maldini', 'Bonucci', 'De Rossi'] },
            { d: 3, nome: 'Ct dell\'Italia dal 2000 in poi', voci: ['Trapattoni', 'Donadoni', 'Ventura', 'Spalletti'] },
            { d: 4, nome: 'Oriundi in azzurro', voci: ['Camoranesi', 'Thiago Motta', 'Eder', 'Retegui'] }
        ]
    },
    {
        n: 47, tema: 'curiosita', titolo: 'Lavagna tattica',
        gruppi: [
            { d: 1, nome: 'Moduli di gioco', voci: ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'] },
            { d: 2, nome: 'Si riparte da palla ferma', voci: ['Punizione', 'Calcio d\'angolo', 'Rimessa laterale', 'Calcio di rinvio'] },
            { d: 3, nome: 'Movimenti senza palla', voci: ['Inserimento', 'Taglio', 'Diagonale', 'Incrocio'] },
            { d: 4, nome: 'Filosofie di gioco', voci: ['Catenaccio', 'Tiki-taka', 'Zona', 'Calcio totale'] }
        ]
    },
    {
        n: 48, tema: 'estero', titolo: 'Stadi d\'Europa',
        gruppi: [
            { d: 1, nome: 'Stadi tedeschi', voci: ['Allianz Arena', 'Signal Iduna Park', 'Weserstadion', 'BayArena'] },
            { d: 2, nome: 'Stadi scozzesi', voci: ['Celtic Park', 'Ibrox', 'Hampden Park', 'Pittodrie'] },
            { d: 3, nome: 'Stadi portoghesi', voci: ['Da Luz', 'Dragão', 'Alvalade', 'Bessa'] },
            { d: 4, nome: 'Stadi olandesi', voci: ['De Kuip', 'Philips Stadion', 'Cruijff Arena', 'AFAS Stadion'] }
        ]
    },
    {
        n: 49, tema: 'serie-a', titolo: 'Numeri da record',
        gruppi: [
            { d: 1, nome: 'Più di 550 presenze in Serie A', voci: ['Buffon', 'Maldini', 'Zanetti', 'Zoff'] },
            { d: 2, nome: 'Più di 200 gol in Serie A', voci: ['Nordahl', 'Meazza', 'Altafini', 'Di Natale'] },
            { d: 3, nome: 'Capocannonieri della Serie A con la Lazio', voci: ['Chinaglia', 'Giordano', 'Signori', 'Crespo'] },
            { d: 4, nome: 'Campioni d\'Italia con la Sampdoria nel 1991', voci: ['Vialli', 'Cerezo', 'Dossena', 'Pari'] }
        ]
    },
    {
        n: 50, tema: 'azzurri', titolo: 'Gioie e dolori azzurri',
        gruppi: [
            { d: 1, nome: 'Città di una finale vinta dall\'Italia', voci: ['Roma', 'Madrid', 'Berlino', 'Londra'] },
            { d: 2, nome: 'Battute dall\'Italia in una finale, tra Mondiali ed Europei', voci: ['Jugoslavia', 'Germania Ovest', 'Inghilterra', 'Ungheria'] },
            { d: 3, nome: 'Ci hanno lasciato a casa nelle qualificazioni mondiali', voci: ['Irlanda del Nord', 'Svezia', 'Macedonia del Nord', 'Bosnia'] },
            { d: 4, nome: 'Ct azzurri fuori ai gironi di un Mondiale', voci: ['Fabbri', 'Valcareggi', 'Lippi', 'Prandelli'] }
        ]
    },
    {
        n: 51, tema: 'storia', titolo: 'Maestri di panchina',
        gruppi: [
            { d: 1, nome: 'Coppa dei Campioni vinta da giocatore e da allenatore', voci: ['Ancelotti', 'Zidane', 'Rijkaard', 'Cruijff'] },
            { d: 2, nome: 'Allenatori di un triplete', voci: ['Ferguson', 'Heynckes', 'Hiddink', 'Stein'] },
            { d: 3, nome: 'Ct campioni d\'Europa', voci: ['Aragonés', 'Rehhagel', 'Fernando Santos', 'De la Fuente'] },
            { d: 4, nome: 'Stranieri campioni d\'Italia in panchina', voci: ['Herrera', 'Liedholm', 'Eriksson', 'Boškov'] }
        ]
    },
    {
        n: 52, tema: 'serie-a', titolo: 'Africa in Serie A',
        gruppi: [
            { d: 1, nome: 'Nigeriani in Serie A', voci: ['Osimhen', 'Kanu', 'Martins', 'Taribo West'] },
            { d: 2, nome: 'Camerunensi in Serie A', voci: ['Eto\'o', 'Anguissa', 'M\'Boma', 'Song'] },
            { d: 3, nome: 'Ivoriani in Serie A', voci: ['Kessié', 'Gervinho', 'Kouamé', 'Ndicka'] },
            { d: 4, nome: 'Senegalesi in Serie A', voci: ['Koulibaly', 'Keita Baldé', 'Niang', 'Boulaye Dia'] }
        ]
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { quattroSchede: quattroSchede };
}
