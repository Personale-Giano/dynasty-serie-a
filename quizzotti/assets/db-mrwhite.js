/* ==========================================================================
   QUIZZOTTI — Database: Mr.White (nomi calciatori)
   Solo calciatori famosi, che un gruppo di tifosi "normali" sa descrivere
   senza difficolta' (club, nazionale, ruolo, soprannome, momenti iconici).
   ========================================================================== */

const wordsList = [
  // --- Leggende italiane ---
  "Alessandro Del Piero", "Francesco Totti", "Roberto Baggio", "Gianluigi Buffon", "Paolo Maldini", "Fabio Cannavaro",
  "Andrea Pirlo", "Gennaro Gattuso", "Alessandro Nesta", "Filippo Inzaghi", "Christian Vieri", "Franco Baresi",
  "Gianni Rivera", "Giuseppe Bergomi", "Dino Zoff", "Paolo Rossi", "Roberto Mancini", "Gianluca Vialli",
  "Gigi Riva", "Gianfranco Zola", "Walter Zenga", "Daniele De Rossi", "Giorgio Chiellini", "Leonardo Bonucci",
  "Antonio Cassano", "Luca Toni", "Marco Materazzi", "Fabio Grosso", "Antonio Di Natale", "Gianluca Zambrotta",
  "Mauro Camoranesi", "Alberto Gilardino", "Claudio Marchisio", "Mario Balotelli", "Ciro Immobile", "Lorenzo Insigne",
  "Marco Verratti", "Stephan El Shaarawy", "Andrea Belotti", "Domenico Berardi", "Salvatore Schillaci", "Roberto Bettega",
  "Javier Zanetti", "Simone Perrotta", "Gianluca Pagliuca", "Massimo Ambrosini",

  // --- Italiani di oggi ---
  "Gianluigi Donnarumma", "Nicolò Barella", "Federico Chiesa", "Sandro Tonali", "Alessandro Bastoni", "Federico Dimarco",
  "Giovanni Di Lorenzo", "Davide Frattesi", "Moise Kean", "Mateo Retegui", "Giacomo Raspadori", "Manuel Locatelli",
  "Riccardo Calafiori", "Gianluca Scamacca", "Lorenzo Pellegrini", "Bryan Cristante", "Matteo Politano", "Jorginho",
  "Nicolò Zaniolo", "Federico Bernardeschi", "Leonardo Spinazzola", "Alex Meret", "Riccardo Orsolini", "Francesco Acerbi",
  "Destiny Udogie", "Andrea Cambiaso", "Guglielmo Vicario", "Alessandro Buongiorno", "Samuele Ricci",

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
  "Fabio Quagliarella", "Hernanes", "Miroslav Klose", "Radja Nainggolan", "Kevin-Prince Boateng", "Dejan Stanković",

  // --- Protagonisti recenti della Serie A ---
  "Lautaro Martínez", "Marcus Thuram", "Khvicha Kvaratskhelia", "Victor Osimhen", "Rafael Leão", "Theo Hernández",
  "Mike Maignan", "Christian Pulisic", "Dušan Vlahović", "Kenan Yıldız", "Scott McTominay", "Kevin De Bruyne",
  "Luka Modrić", "Ademola Lookman", "Teun Koopmeiners", "Tijjani Reijnders", "Rasmus Højlund", "Denzel Dumfries",
  "Henrikh Mkhitaryan", "Stanislav Lobotka", "Yann Sommer", "Nico Paz", "Artem Dovbyk",
  "Matías Soulé", "Mohamed Salah", "Alisson Becker", "Antonio Rüdiger", "Achraf Hakimi",

  // --- Leggende mondiali ---
  "Pelé", "Johan Cruijff", "Franz Beckenbauer", "Alfredo Di Stéfano", "Ferenc Puskás", "Eusébio",
  "George Best", "Romário", "Rivaldo", "Roberto Carlos", "Cafu", "Luís Figo",
  "Raúl", "Iker Casillas", "Carles Puyol", "Xavi", "Andrés Iniesta", "Fernando Torres",
  "David Villa", "Thierry Henry", "Eric Cantona", "Dennis Bergkamp", "David Beckham", "Wayne Rooney",
  "Steven Gerrard", "Frank Lampard", "Didier Drogba", "Ryan Giggs", "Paul Scholes", "Oliver Kahn",
  "Peter Schmeichel", "Michael Owen", "Petr Čech", "Philipp Lahm", "Bastian Schweinsteiger", "Arjen Robben",
  "Franck Ribéry", "Robin van Persie", "Ruud van Nistelrooy", "Carlos Tevez", "Juan Román Riquelme", "Diego Forlán",
  "Mesut Özil", "Javier Mascherano", "Gerard Piqué", "Sergio Busquets", "Dani Alves", "Marcelo",
  "Gareth Bale", "Eden Hazard", "Sergio Agüero", "Luis Suárez", "Radamel Falcao", "James Rodríguez",

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
  "Alexander Isak", "Michael Olise", "Désiré Doué", "Vitinha", "João Neves", "Alessandro Florenzi",
];

const playerImages = {};

if (typeof module !== "undefined" && module.exports) { module.exports = { wordsList, playerImages }; }
