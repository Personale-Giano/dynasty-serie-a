/* ==========================================================================
   QUIZZOTTI — Database: Mr. White (calciatori segreti)
   Solo calciatori famosi, che un gruppo di tifosi "normali" sa descrivere
   senza difficolta' (club, nazionale, ruolo, soprannome, momenti iconici).
   678 calciatori (revisione del 16 nov 2026): 166 italiani, 512 stranieri.

   - `wordsList`: tutti i nomi (italiani + stranieri), cosi' come si vedono.
   - `mrwhiteData.italiani` / `.stranieri`: le due liste del filtro
     "Calciatori" (tra gli italiani anche gli oriundi che hanno scelto
     l'Italia, come Sívori, Altafini, Camoranesi, Jorginho).
   - `mrwhiteData.coppie`: coppie di calciatori simili (stesso club, ruolo,
     epoca o cognome) per la modalita' Infiltrato. Ogni nome sta in
     `wordsList` e compare in una coppia sola.
   - `mrwhiteData.alias`: altri modi giusti di dirlo all'ultimo tiro
     (soprannomi, nome da campo). Nome completo e cognome valgono gia'.
   - `mrwhiteData.maglia`: il nome sulla maglia quando non e' il cognome
     (serve all'aiutino con l'iniziale).
   ========================================================================== */

var mrwhiteData = {
  italiani: [
    // --- Leggende italiane ---
    "Alessandro Del Piero", "Francesco Totti", "Roberto Baggio", "Gianluigi Buffon", "Paolo Maldini", "Fabio Cannavaro",
    "Andrea Pirlo", "Gennaro Gattuso", "Alessandro Nesta", "Filippo Inzaghi", "Christian Vieri", "Franco Baresi",
    "Gianni Rivera", "Giuseppe Bergomi", "Dino Zoff", "Paolo Rossi", "Roberto Mancini", "Gianluca Vialli",
    "Gigi Riva", "Gianfranco Zola", "Walter Zenga", "Daniele De Rossi", "Giorgio Chiellini", "Leonardo Bonucci",
    "Antonio Cassano", "Luca Toni", "Marco Materazzi", "Fabio Grosso", "Antonio Di Natale", "Gianluca Zambrotta",
    "Mauro Camoranesi", "Alberto Gilardino", "Claudio Marchisio", "Mario Balotelli", "Ciro Immobile", "Lorenzo Insigne",
    "Marco Verratti", "Stephan El Shaarawy", "Andrea Belotti", "Domenico Berardi", "Salvatore Schillaci", "Roberto Bettega",
    "Simone Perrotta", "Gianluca Pagliuca", "Massimo Ambrosini", "Alessandro Florenzi", "Giacinto Facchetti", "Sandro Mazzola",
    "Giuseppe Meazza", "Silvio Piola", "Gaetano Scirea", "Claudio Gentile", "Marco Tardelli", "Bruno Conti",
    "Antonio Cabrini", "Alessandro Altobelli", "Giancarlo Antognoni", "Giuseppe Signori", "Attilio Lombardo", "Demetrio Albertini",
    "Ciro Ferrara", "Fabrizio Ravanelli", "Vincenzo Montella", "Christian Panucci", "Angelo Peruzzi", "Francesco Toldo",
    "Dario Hübner", "Giuseppe Giannini", "Roberto Donadoni", "Mauro Tassotti", "Alessandro Costacurta", "Sebastian Giovinco",
    "Graziano Pellè", "Antonio Candreva", "Andrea Barzagli", "Simone Inzaghi", "Marco Di Vaio", "Stefano Tacconi",
    "Francesco Graziani", "Roberto Boninsegna", "Gabriele Oriali", "Massimo Oddo", "Enrico Chiesa", "Angelo Di Livio",
    "Riccardo Montolivo", "Emanuele Giaccherini", "Pierluigi Casiraghi", "Aldo Serena", "Fabio Quagliarella", "Thiago Motta",
    "Omar Sívori", "José Altafini", "Paolo Di Canio", "Giuseppe Rossi", "Vincenzo Iaquinta", "Simone Zaza",
    "Antonio Conte", "Roberto Di Matteo", "Nicola Berti", "Luigi Di Biagio", "Moreno Torricelli", "Pietro Anastasi",
    "Giampiero Boniperti", "Valentino Mazzola", "Tarcisio Burgnich", "Marco Delvecchio", "Daniele Massaro", "Christian Abbiati",
    "Morgan De Sanctis", "Salvatore Sirigu", "Giampaolo Pazzini", "Franco Causio", "Pietro Vierchowod", "Cesare Maldini",
    "Dino Baggio", "Giacomo Bonaventura", "Giacomo Bulgarelli", "Mattia De Sciglio", "Domenico Criscito", "Alessio Romagnoli",

    // --- Italiani di oggi ---
    "Gianluigi Donnarumma", "Nicolò Barella", "Federico Chiesa", "Sandro Tonali", "Alessandro Bastoni", "Federico Dimarco",
    "Giovanni Di Lorenzo", "Davide Frattesi", "Moise Kean", "Mateo Retegui", "Giacomo Raspadori", "Manuel Locatelli",
    "Riccardo Calafiori", "Gianluca Scamacca", "Lorenzo Pellegrini", "Bryan Cristante", "Matteo Politano", "Jorginho",
    "Nicolò Zaniolo", "Federico Bernardeschi", "Leonardo Spinazzola", "Alex Meret", "Riccardo Orsolini", "Francesco Acerbi",
    "Destiny Udogie", "Andrea Cambiaso", "Guglielmo Vicario", "Alessandro Buongiorno", "Samuele Ricci", "Mattia Zaccagni",
    "Matteo Darmian", "Davide Calabria", "Gianluca Mancini", "Nicolò Rovella", "Wilfried Gnonto", "Francesco Pio Esposito",
    "Giorgio Scalvini", "Emerson Palmieri", "Federico Gatti", "Nicolò Fagioli", "Michele Di Gregorio", "Lorenzo Lucca",
    "Daniel Maldini", "Matteo Pessina", "Rafael Tolói", "Mattia Perin",
  ],

  stranieri: [
    // --- Stranieri che hanno fatto la storia della Serie A ---
    "Diego Maradona", "Michel Platini", "Marco van Basten", "Ruud Gullit", "Frank Rijkaard", "Gabriel Batistuta",
    "Zinedine Zidane", "Ronaldo Nazário", "Kaká", "Andriy Shevchenko", "Zlatan Ibrahimović", "Pavel Nedvěd",
    "David Trezeguet", "Hernán Crespo", "Clarence Seedorf", "Edgar Davids", "Lilian Thuram", "Diego Milito",
    "Samuel Eto'o", "Wesley Sneijder", "Juan Sebastián Verón", "Gonzalo Higuaín", "Paulo Dybala", "Edinson Cavani",
    "Marek Hamšík", "Dries Mertens", "Kalidou Koulibaly", "George Weah", "Ronaldinho", "Alexandre Pato",
    "Lothar Matthäus", "Jürgen Klinsmann", "Rui Costa", "Adriano", "Miralem Pjanić", "Arturo Vidal",
    "Paul Pogba", "Mario Mandžukić", "Juan Cuadrado", "Wojciech Szczęsny", "Samir Handanović", "Edin Džeko",
    "Mauro Icardi", "Ivan Perišić", "Romelu Lukaku", "Josip Iličić", "Papu Gómez", "Duván Zapata",
    "Sergej Milinković-Savić", "Luis Alberto", "Cristiano Ronaldo", "Olivier Giroud", "Hakan Çalhanoğlu", "Milan Škriniar",
    "Hernanes", "Miroslav Klose", "Radja Nainggolan", "Kevin-Prince Boateng", "Dejan Stanković", "Javier Zanetti",
    "Mohamed Salah", "John Charles", "Karl-Heinz Rummenigge", "Andreas Brehme", "Zico", "Paulo Roberto Falcão",
    "Careca", "Sócrates", "Michael Laudrup", "Jürgen Kohler", "Rudi Völler", "Dejan Savićević",
    "Zvonimir Boban", "Marcel Desailly", "Oliver Bierhoff", "Patrick Vieira", "Iván Zamorano", "Álvaro Recoba",
    "Youri Djorkaeff", "Marcelo Salas", "Alen Bokšić", "Siniša Mihajlović", "Diego Simeone", "Claudio Caniggia",
    "Abel Balbo", "Jaap Stam", "Walter Samuel", "Iván Córdoba", "Esteban Cambiasso", "Júlio César",
    "Maicon", "Lúcio", "Aldair", "Vincent Candela", "Ezequiel Lavezzi", "José Callejón",
    "Pepe Reina", "Kostas Manolas", "Medhi Benatia", "Blaise Matuidi", "Sami Khedira", "Alex Sandro",
    "Stephan Lichtsteiner", "Douglas Costa", "Robinho", "Mark van Bommel", "Krzysztof Piątek", "Franck Kessié",
    "Ismaël Bennacer", "Fikayo Tomori", "Simon Kjær", "Luis Muriel", "Kim Min-jae", "Hirving Lozano",
    "Arkadiusz Milik", "Chris Smalling", "Tammy Abraham", "Felipe Anderson", "Lucas Leiva", "Stefan de Vrij",
    "Marcelo Brozović", "Christian Eriksen", "Hidetoshi Nakata", "Keisuke Honda", "Enzo Francescoli", "Cristian Chivu",
    "Alexis Sánchez", "Philippe Coutinho", "Rodrigo Bentancur", "Rubén Sosa", "Daniel Passarella", "Toninho Cerezo",
    "Hans-Peter Briegel", "Preben Elkjær", "Ruud Krol", "Kurt Hamrin", "Nils Liedholm", "Gunnar Nordahl",
    "Juan Alberto Schiaffino", "Zbigniew Boniek", "Paolo Montero", "Igor Tudor", "Faustino Asprilla", "Tomas Brolin",
    "Claudio Taffarel", "Dida", "Leonardo", "Serginho", "Fernando Couto", "Kakha Kaladze",
    "Jon Dahl Tomasson", "Yuto Nagatomo", "Taribo West", "Obafemi Martins", "Mirko Vučinić", "Stevan Jovetić",
    "Erik Lamela", "Kwadwo Asamoah", "Sulley Muntari", "Gökhan Inler", "Adrian Mutu", "Claudio López",
    "Javier Pastore", "Rodrigo Palacio", "Goran Pandev", "Diego Godín", "Patrice Evra", "Carlos Bacca",
    "Lucas Paquetá", "Felipe Melo", "Fernando Redondo", "Gaizka Mendieta", "Hakan Şükür", "Ricardo Quaresma",
    "Nigel de Jong", "Dunga", "Alemão", "Brian Laudrup", "Andreas Möller", "Thomas Hässler",
    "Paul Ince", "David Suazo",

    // --- Protagonisti recenti della Serie A ---
    "Lautaro Martínez", "Marcus Thuram", "Khvicha Kvaratskhelia", "Victor Osimhen", "Rafael Leão", "Theo Hernández",
    "Mike Maignan", "Christian Pulisic", "Dušan Vlahović", "Kenan Yıldız", "Scott McTominay", "Kevin De Bruyne",
    "Luka Modrić", "Ademola Lookman", "Teun Koopmeiners", "Tijjani Reijnders", "Rasmus Højlund", "Denzel Dumfries",
    "Henrikh Mkhitaryan", "Stanislav Lobotka", "Yann Sommer", "Nico Paz", "Artem Dovbyk", "Matías Soulé",
    "Jamie Vardy", "David de Gea", "Jonathan David", "Kyle Walker", "Weston McKennie", "Charles De Ketelaere",
    "Francisco Conceição", "Ruben Loftus-Cheek", "Alexis Saelemaekers", "Santiago Giménez", "Piotr Zieliński", "Gleison Bremer",
    "André Onana", "Benjamin Pavard", "Marko Arnautović", "Adrien Rabiot", "Christopher Nkunku", "Brahim Díaz",
    "Leandro Paredes", "Khéphren Thuram", "Nico González", "André-Frank Zambo Anguissa", "Giovanni Simeone", "Robin Gosens",
    "Joshua Zirkzee", "Matteo Guendouzi", "Taty Castellanos",

    // --- Leggende mondiali ---
    "Pelé", "Johan Cruyff", "Franz Beckenbauer", "Alfredo Di Stéfano", "Ferenc Puskás", "Eusébio",
    "George Best", "Romário", "Rivaldo", "Roberto Carlos", "Cafu", "Luís Figo",
    "Raúl", "Iker Casillas", "Carles Puyol", "Xavi", "Andrés Iniesta", "Fernando Torres",
    "David Villa", "Thierry Henry", "Eric Cantona", "Dennis Bergkamp", "David Beckham", "Wayne Rooney",
    "Steven Gerrard", "Frank Lampard", "Didier Drogba", "Ryan Giggs", "Paul Scholes", "Oliver Kahn",
    "Peter Schmeichel", "Michael Owen", "Petr Čech", "Philipp Lahm", "Bastian Schweinsteiger", "Arjen Robben",
    "Franck Ribéry", "Robin van Persie", "Ruud van Nistelrooy", "Carlos Tevez", "Juan Román Riquelme", "Diego Forlán",
    "Mesut Özil", "Javier Mascherano", "Gerard Piqué", "Sergio Busquets", "Dani Alves", "Marcelo",
    "Gareth Bale", "Eden Hazard", "Sergio Agüero", "Luis Suárez", "Radamel Falcao", "James Rodríguez",
    "Bobby Charlton", "Bobby Moore", "Gerd Müller", "Lev Yashin", "Garrincha", "Hristo Stoichkov",
    "Gheorghe Hagi", "Bebeto", "Kenny Dalglish", "Ian Rush", "Kevin Keegan", "Gary Lineker",
    "Alan Shearer", "Paul Gascoigne", "Patrick Kluivert", "Edwin van der Sar", "Ronald Koeman", "Fabien Barthez",
    "Robert Pirès", "Claude Makélélé", "Laurent Blanc", "Jean-Pierre Papin", "Didier Deschamps", "Deco",
    "Fernando Hierro", "Fernando Morientes", "David Silva", "Cesc Fàbregas", "Xabi Alonso", "Yaya Touré",
    "Michael Essien", "Jay-Jay Okocha", "Roger Milla", "Park Ji-sung", "Hugo Sánchez", "Rafael Márquez",
    "Carlos Valderrama", "René Higuita", "Davor Šuker", "Nemanja Vidić", "Rio Ferdinand", "John Terry",
    "Ashley Cole", "Jamie Carragher", "Vincent Kompany", "Michael Ballack", "Lukas Podolski", "Dimitar Berbatov",
    "Klaas-Jan Huntelaar", "Dirk Kuyt", "Mario Kempes", "Jairzinho", "Roberto Rivelino", "Johan Neeskens",
    "Sepp Maier", "Paul Breitner", "Matthias Sammer", "Jari Litmanen", "Henrik Larsson", "Roy Keane",
    "Gordon Banks", "Robbie Fowler", "Ole Gunnar Solskjær", "Nicolas Anelka", "Marc Overmars", "Rafael van der Vaart",
    "Pablo Aimar", "Javier Saviola", "Martín Palermo", "Juninho Pernambucano", "Tim Cahill", "Cuauhtémoc Blanco",
    "Santi Cazorla", "Jesús Navas",

    // --- Stelle di oggi e di ieri l'altro ---
    "Lionel Messi", "Neymar", "Kylian Mbappé", "Erling Haaland", "Sergio Ramos", "Toni Kroos",
    "Manuel Neuer", "Thomas Müller", "Robert Lewandowski", "Karim Benzema", "Virgil van Dijk", "Harry Kane",
    "Antoine Griezmann", "N'Golo Kanté", "Ángel Di María", "Thiago Silva", "Casemiro", "Hugo Lloris",
    "Jude Bellingham", "Lamine Yamal", "Pedri", "Vinícius Júnior", "Bukayo Saka", "Phil Foden",
    "Cole Palmer", "Jamal Musiala", "Florian Wirtz", "Rodri", "Declan Rice", "Martin Ødegaard",
    "Federico Valverde", "Ousmane Dembélé", "Bruno Fernandes", "Bernardo Silva", "Son Heung-min", "Sadio Mané",
    "Joshua Kimmich", "Alphonso Davies", "Thibaut Courtois", "Jan Oblak", "Marc-André ter Stegen", "Emiliano Martínez",
    "Julián Álvarez", "Enzo Fernández", "Alexis Mac Allister", "Raphinha", "Rodrygo", "Gavi",
    "Nico Williams", "Dani Olmo", "Álvaro Morata", "Trent Alexander-Arnold", "Marcus Rashford", "Jack Grealish",
    "Raheem Sterling", "Riyad Mahrez", "Marquinhos", "Raphaël Varane", "Kingsley Coman", "Leroy Sané",
    "Mario Götze", "Marco Reus", "Ilkay Gündoğan", "Frenkie de Jong", "Matthijs de Ligt", "Viktor Gyökeres",
    "Alexander Isak", "Michael Olise", "Désiré Doué", "Vitinha", "João Neves", "Alisson Becker",
    "Antonio Rüdiger", "Achraf Hakimi", "Joško Gvardiol", "Dominik Szoboszlai", "Arda Güler", "Rodrigo De Paul",
    "Nicolás Otamendi", "Lisandro Martínez", "Cristian Romero", "Darwin Núñez", "Ronald Araújo", "Gabriel Martinelli",
    "Bruno Guimarães", "Endrick", "Éder Militão", "Gabriel Jesus", "Richarlison", "João Félix",
    "Rúben Dias", "João Cancelo", "Nuno Mendes", "Martín Zubimendi", "Aurélien Tchouaméni", "Eduardo Camavinga",
    "William Saliba", "Kai Havertz", "Leon Goretzka", "Serge Gnabry", "Luis Díaz", "Cody Gakpo",
    "Xavi Simons", "Jordan Pickford", "John Stones", "Jordan Henderson", "Mason Mount", "Andrew Robertson",
    "Dejan Kulusevski", "Yassine Bounou", "Hakim Ziyech", "Pierre-Emerick Aubameyang", "Granit Xhaka", "Xherdan Shaqiri",
    "Jordi Alba", "Ivan Rakitić", "Memphis Depay", "Georginio Wijnaldum", "Mats Hummels", "Jérôme Boateng",
    "Javier Hernández", "Pepe", "Roberto Firmino", "David Luiz", "Guillermo Ochoa", "Diego Costa",
    "Juan Mata", "Isco", "Koke", "Dani Carvajal", "Mateo Kovačić", "Harry Maguire",
    "Ederson Moraes", "Jérémy Doku", "Bradley Barcola", "Rayan Cherki", "Hugo Ekitiké", "Benjamin Šeško",
    "Eberechi Eze", "Kobbie Mainoo", "Alejandro Garnacho", "Moisés Caicedo", "Marc Cucurella", "Pau Cubarsí",
    "Jules Koundé", "Dayot Upamecano", "Ryan Gravenberch", "Dean Huijsen", "Fermín López", "Ferran Torres",
    "Mikel Oyarzabal",
  ],

  coppie: [
    // stesso cognome, padre e figlio, stessa squadra o stesso ruolo nella stessa epoca
    ["Filippo Inzaghi", "Simone Inzaghi"], ["Federico Chiesa", "Enrico Chiesa"], ["Paolo Maldini", "Cesare Maldini"],
    ["Roberto Mancini", "Gianluca Vialli"], ["Gianni Rivera", "Sandro Mazzola"], ["Franco Baresi", "Alessandro Costacurta"],
    ["Alessandro Nesta", "Fabio Cannavaro"], ["Francesco Totti", "Daniele De Rossi"], ["Alessandro Del Piero", "Roberto Baggio"],
    ["Gianluigi Buffon", "Gianluigi Donnarumma"], ["Andrea Pirlo", "Marco Verratti"], ["Gennaro Gattuso", "Massimo Ambrosini"],
    ["Christian Vieri", "Luca Toni"], ["Lorenzo Insigne", "Ciro Immobile"], ["Giorgio Chiellini", "Leonardo Bonucci"],
    ["Mario Balotelli", "Antonio Cassano"], ["Nicolò Barella", "Sandro Tonali"], ["Alessandro Bastoni", "Riccardo Calafiori"],
    ["Paolo Rossi", "Salvatore Schillaci"], ["Dino Zoff", "Angelo Peruzzi"], ["Walter Zenga", "Gianluca Pagliuca"],
    ["Giacinto Facchetti", "Giuseppe Bergomi"], ["Fabio Grosso", "Marco Materazzi"], ["Antonio Di Natale", "Fabio Quagliarella"],
    ["Gigi Riva", "Roberto Boninsegna"], ["Giuseppe Meazza", "Silvio Piola"], ["Gaetano Scirea", "Claudio Gentile"],
    ["Marco Tardelli", "Bruno Conti"], ["Dino Baggio", "Demetrio Albertini"],
    ["Lionel Messi", "Cristiano Ronaldo"], ["Pelé", "Diego Maradona"], ["Kylian Mbappé", "Erling Haaland"],
    ["Lautaro Martínez", "Marcus Thuram"], ["Lilian Thuram", "Khéphren Thuram"], ["Romelu Lukaku", "Dušan Vlahović"],
    ["Victor Osimhen", "Khvicha Kvaratskhelia"], ["Zinedine Zidane", "Michel Platini"], ["Marco van Basten", "Ruud Gullit"],
    ["Frank Rijkaard", "Clarence Seedorf"], ["Kaká", "Ronaldinho"], ["Andriy Shevchenko", "George Weah"],
    ["Gabriel Batistuta", "Hernán Crespo"], ["Pavel Nedvěd", "Edgar Davids"], ["David Trezeguet", "Thierry Henry"],
    ["Javier Zanetti", "Esteban Cambiasso"], ["Diego Milito", "Samuel Eto'o"], ["Wesley Sneijder", "Mesut Özil"],
    ["Paulo Dybala", "Gonzalo Higuaín"], ["Marek Hamšík", "Dries Mertens"], ["Kalidou Koulibaly", "Kim Min-jae"],
    ["Rafael Leão", "Theo Hernández"], ["Mike Maignan", "Yann Sommer"], ["Kevin De Bruyne", "Luka Modrić"],
    ["Lamine Yamal", "Nico Williams"], ["Xavi", "Andrés Iniesta"], ["Sergio Ramos", "Gerard Piqué"],
    ["Iker Casillas", "Thibaut Courtois"], ["Manuel Neuer", "Oliver Kahn"], ["Thomas Müller", "Robert Lewandowski"],
    ["Harry Kane", "Wayne Rooney"], ["Steven Gerrard", "Frank Lampard"], ["David Beckham", "Ryan Giggs"],
    ["Eric Cantona", "Dennis Bergkamp"], ["Didier Drogba", "Yaya Touré"], ["Ronaldo Nazário", "Romário"],
    ["Roberto Carlos", "Cafu"], ["Neymar", "Vinícius Júnior"], ["Mohamed Salah", "Sadio Mané"],
    ["Luis Suárez", "Edinson Cavani"], ["Sergio Agüero", "Carlos Tevez"], ["Jude Bellingham", "Jamal Musiala"],
    ["Rodri", "Sergio Busquets"], ["Toni Kroos", "Bastian Schweinsteiger"], ["Virgil van Dijk", "Rúben Dias"],
    ["Zlatan Ibrahimović", "Olivier Giroud"], ["Johan Cruyff", "Franz Beckenbauer"], ["Gerd Müller", "Miroslav Klose"],
    ["Fernando Torres", "David Villa"], ["Hakan Çalhanoğlu", "Henrikh Mkhitaryan"], ["Kenan Yıldız", "Francisco Conceição"],
    ["Scott McTominay", "Stanislav Lobotka"], ["Ademola Lookman", "Charles De Ketelaere"], ["Paul Pogba", "Arturo Vidal"],
    ["Miralem Pjanić", "Claudio Marchisio"], ["Edin Džeko", "Mauro Icardi"], ["Ivan Perišić", "Marcelo Brozović"],
    ["Sergej Milinković-Savić", "Luis Alberto"], ["Michael Laudrup", "Brian Laudrup"], ["Diego Simeone", "Giovanni Simeone"],
    ["Bukayo Saka", "Phil Foden"], ["Pedri", "Gavi"], ["Achraf Hakimi", "Nuno Mendes"]
  ],

  alias: {
    "Ronaldo Nazário": ["Ronaldo", "Il Fenomeno", "Ronaldo il Fenomeno"],
    "Cristiano Ronaldo": ["CR7"],
    "Johan Cruyff": ["Cruijff"],
    "Vinícius Júnior": ["Vinicius", "Vini Jr"],
    "Kim Min-jae": ["Kim"],
    "Son Heung-min": ["Son"],
    "Park Ji-sung": ["Park"],
    "Alisson Becker": ["Alisson"],
    "Emerson Palmieri": ["Emerson"],
    "Papu Gómez": ["Papu", "Alejandro Gómez"],
    "Javier Hernández": ["Chicharito"],
    "Zinedine Zidane": ["Zizou"],
    "Zlatan Ibrahimović": ["Zlatan", "Ibra"],
    "Khvicha Kvaratskhelia": ["Kvara"],
    "Filippo Inzaghi": ["Pippo Inzaghi", "Superpippo"],
    "Gigi Riva": ["Luigi Riva", "Rombo di tuono"],
    "Gabriel Batistuta": ["Batigol"],
    "Diego Maradona": ["Pibe de Oro"],
    "Alessandro Del Piero": ["Pinturicchio"],
    "Roberto Baggio": ["Divin Codino"],
    "Javier Zanetti": ["Pupi"],
    "Salvatore Schillaci": ["Totò Schillaci"],
    "André-Frank Zambo Anguissa": ["Frank Anguissa"],
    "Taty Castellanos": ["Valentín Castellanos"],
    "Juninho Pernambucano": ["Juninho"],
    "Lionel Messi": ["Leo Messi"],
    "Bernardo Silva": ["Bernardo"],
    "Brahim Díaz": ["Brahim"],
    "Fermín López": ["Fermín"],
    "Ederson Moraes": ["Ederson"]
  },

  maglia: {
    "Ronaldo Nazário": "Ronaldo",
    "Vinícius Júnior": "Vinícius",
    "Kim Min-jae": "Kim",
    "Son Heung-min": "Son",
    "Park Ji-sung": "Park",
    "Alisson Becker": "Alisson",
    "Emerson Palmieri": "Emerson",
    "Juninho Pernambucano": "Juninho",
    "André-Frank Zambo Anguissa": "Anguissa",
    // nome e cognome insieme sulla schiena, o solo il nome
    "Luis Alberto": "Luis Alberto",
    "Rui Costa": "Rui Costa",
    "Roberto Carlos": "Roberto Carlos",
    "Júlio César": "Júlio César",
    "Alex Sandro": "Alex Sandro",
    "Douglas Costa": "Douglas Costa",
    "Felipe Anderson": "Felipe Anderson",
    "Felipe Melo": "Felipe Melo",
    "Lucas Leiva": "Lucas Leiva",
    "Thiago Silva": "Thiago Silva",
    "Dani Alves": "Dani Alves",
    "Dani Olmo": "Dani Olmo",
    "Jordi Alba": "Jordi Alba",
    "Xabi Alonso": "Xabi Alonso",
    "Santi Cazorla": "Santi Cazorla",
    "Jesús Navas": "Jesús Navas",
    "Lamine Yamal": "Lamine Yamal",
    "Nico Williams": "Nico Williams",
    "Nico Paz": "Nico Paz",
    "Bernardo Silva": "Bernardo",
    "Brahim Díaz": "Brahim",
    "Fermín López": "Fermín",
    "Ederson Moraes": "Ederson"
  }
};

const wordsList = mrwhiteData.italiani.concat(mrwhiteData.stranieri);

// le foto dei calciatori non ci sono: il gioco disegna una maglia (resta per compatibilita')
const playerImages = {};

if (typeof module !== "undefined" && module.exports) { module.exports = { wordsList, playerImages, mrwhiteData }; }
