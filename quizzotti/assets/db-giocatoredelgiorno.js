/* ==========================================================================
   QUIZZOTTI — Database: Il Calciatore del Giorno
   Il calendario: un nome per ogni partita, nell'ordine dei giorni.
   dailyCalendar[0] e' il N° 1 (16 novembre 2026), dailyCalendar[1] il N° 2, e
   cosi' via. I dati del calciatore (squadra, ruolo, valore, nazionale,
   campionato, anno di nascita) si prendono da assets/db-giocatoributget.js:
   ogni nome qui deve esistere li', scritto uguale (lo verifica il test).

   REGOLE (il gioco e' online, i giorni passati non devono cambiare):
   - non si toglie, non si sposta e non si rinomina nessun nome gia' in lista;
   - i nuovi giorni si aggiungono SOLO IN FONDO, senza ripetere nomi gia' usati;
   - quando la lista finisce il calendario ricomincia dall'inizio (il giorno
     dopo l'ultimo torna il N° 1): 786 nomi = calendario fino al
     9 gen 2029. Meglio aggiungerne altri prima.

   Come e' fatto: i N° 1-12 sono quelli usciti col vecchio sistema (lista
   mescolata a seme fisso, abbandonata il 26 novembre 2026). Dal N° 13 solo
   calciatori famosi: valore da 18 milioni in su nel database grande (in
   Premier solo i 190 piu' noti, per non farla pesare troppo) piu' un elenco
   di campioni e nomi da Serie A con valore basso (Modric, Cristiano Ronaldo,
   Messi, Neymar, Lewandowski, De Bruyne, Salah, Benzema, Dybala...).
   Mescolati a seme fisso e distribuiti in proporzione tra i campionati (Serie A
   circa 1 giorno su 5, Premier 1 su 4), mai la stessa squadra in tre giorni
   vicini; nel primo anno i nomi piu' noti.
   ========================================================================== */

const dailyCalendar = [
  "João Félix",                  // N° 1 · 16 nov 2026
  "Myles Lewis-Skelly",          // N° 2 · 17 nov 2026
  "Alejandro Garnacho",          // N° 3 · 18 nov 2026
  "Wataru Endō",                 // N° 4 · 19 nov 2026
  "Jesper Karlström",            // N° 5 · 20 nov 2026
  "Miloš Kerkez",                // N° 6 · 21 nov 2026
  "Estêvão",                     // N° 7 · 22 nov 2026
  "Achraf Hakimi",               // N° 8 · 23 nov 2026
  "Predrag Rajković",            // N° 9 · 24 nov 2026
  "Lewis Dunk",                  // N° 10 · 25 nov 2026
  "Diego Gómez",                 // N° 11 · 26 nov 2026
  "Maxim De Cuyper",             // N° 12 · 27 nov 2026
  "Bukayo Saka",                 // N° 13 · 28 nov 2026
  "Jamie Vardy",                 // N° 14 · 29 nov 2026
  "Giacomo Raspadori",           // N° 15 · 30 nov 2026
  "Alejandro Grimaldo",          // N° 16 · 1 dic 2026
  "Felix Nmecha",                // N° 17 · 2 dic 2026
  "Leon Goretzka",               // N° 18 · 3 dic 2026
  "Ferran Torres",               // N° 19 · 4 dic 2026
  "Ollie Watkins",               // N° 20 · 5 dic 2026
  "Nicolò Zaniolo",              // N° 21 · 6 dic 2026
  "Dean Henderson",              // N° 22 · 7 dic 2026
  "Jan Oblak",                   // N° 23 · 8 dic 2026
  "Jarell Quansah",              // N° 24 · 9 dic 2026
  "Kieran Trippier",             // N° 25 · 10 dic 2026
  "Marco Carnesecchi",           // N° 26 · 11 dic 2026
  "Abdukodir Khusanov",          // N° 27 · 12 dic 2026
  "Fabinho",                     // N° 28 · 13 dic 2026
  "Mario Gila",                  // N° 29 · 14 dic 2026
  "Ian Maatsen",                 // N° 30 · 15 dic 2026
  "Senny Mayulu",                // N° 31 · 16 dic 2026
  "Lamine Yamal",                // N° 32 · 17 dic 2026
  "Serhou Guirassy",             // N° 33 · 18 dic 2026
  "Yankuba Minteh",              // N° 34 · 19 dic 2026
  "Andrea Belotti",              // N° 35 · 20 dic 2026
  "Martin Baturina",             // N° 36 · 21 dic 2026
  "Conor Bradley",               // N° 37 · 22 dic 2026
  "N'Golo Kanté",                // N° 38 · 23 dic 2026
  "Nico Williams",               // N° 39 · 24 dic 2026
  "Lorenzo Lucca",               // N° 40 · 25 dic 2026
  "Daniel Svensson",             // N° 41 · 26 dic 2026
  "Honest Ahanor",               // N° 42 · 27 dic 2026
  "Robin Risser",                // N° 43 · 28 dic 2026
  "Neymar",                      // N° 44 · 29 dic 2026
  "Yann Bisseck",                // N° 45 · 30 dic 2026
  "Matt O'Riley",                // N° 46 · 31 dic 2026
  "Marc Cucurella",              // N° 47 · 1 gen 2027
  "Ismael Saibari",              // N° 48 · 2 gen 2027
  "Georgiy Sudakov",             // N° 49 · 3 gen 2027
  "Benjamin Šeško",              // N° 50 · 4 gen 2027
  "Giovanni Di Lorenzo",         // N° 51 · 5 gen 2027
  "Ángel Di María",              // N° 52 · 6 gen 2027
  "Moisés Caicedo",              // N° 53 · 7 gen 2027
  "Andy Diouf",                  // N° 54 · 8 gen 2027
  "Matvey Safonov",              // N° 55 · 9 gen 2027
  "Alejandro Balde",             // N° 56 · 10 gen 2027
  "Christian Kofane",            // N° 57 · 11 gen 2027
  "Mason Mount",                 // N° 58 · 12 gen 2027
  "Tomás Araújo",                // N° 59 · 13 gen 2027
  "Franck Kessié",               // N° 60 · 14 gen 2027
  "Mikkel Damsgaard",            // N° 61 · 15 gen 2027
  "Gabri Veiga",                 // N° 62 · 16 gen 2027
  "Georges Mikautadze",          // N° 63 · 17 gen 2027
  "Moussa Diaby",                // N° 64 · 18 gen 2027
  "Davide Frattesi",             // N° 65 · 19 gen 2027
  "Julio Enciso",                // N° 66 · 20 gen 2027
  "Warren Zaïre-Emery",          // N° 67 · 21 gen 2027
  "Matteo Guendouzi",            // N° 68 · 22 gen 2027
  "Antonee Robinson",            // N° 69 · 23 gen 2027
  "Gianluca Scamacca",           // N° 70 · 24 gen 2027
  "Carlos Espí",                 // N° 71 · 25 gen 2027
  "Castello Lukeba",             // N° 72 · 26 gen 2027
  "Jarrod Bowen",                // N° 73 · 27 gen 2027
  "Jordan Henderson",            // N° 74 · 28 gen 2027
  "Matías Soulé",                // N° 75 · 29 gen 2027
  "Alex Sandro",                 // N° 76 · 30 gen 2027
  "Nordi Mukiele",               // N° 77 · 31 gen 2027
  "Federico Valverde",           // N° 78 · 1 feb 2027
  "David Alaba",                 // N° 79 · 2 feb 2027
  "Malik Tillman",               // N° 80 · 3 feb 2027
  "Amine Gouiri",                // N° 81 · 4 feb 2027
  "Jaka Bijol",                  // N° 82 · 5 feb 2027
  "Alessio Romagnoli",           // N° 83 · 6 feb 2027
  "Teun Koopmeiners",            // N° 84 · 7 feb 2027
  "Dango Ouattara",              // N° 85 · 8 feb 2027
  "Antony",                      // N° 86 · 9 feb 2027
  "Robert Lewandowski",          // N° 87 · 10 feb 2027
  "Guéla Doué",                  // N° 88 · 11 feb 2027
  "Anthony Elanga",              // N° 89 · 12 feb 2027
  "Rasmus Højlund",              // N° 90 · 13 feb 2027
  "Maximiliano Araújo",          // N° 91 · 14 feb 2027
  "João Neves",                  // N° 92 · 15 feb 2027
  "João Gomes",                  // N° 93 · 16 feb 2027
  "John Stones",                 // N° 94 · 17 feb 2027
  "Wojciech Szczęsny",           // N° 95 · 18 feb 2027
  "Harry Kane",                  // N° 96 · 19 feb 2027
  "Kingsley Coman",              // N° 97 · 20 feb 2027
  "Noussair Mazraoui",           // N° 98 · 21 feb 2027
  "Charles De Ketelaere",        // N° 99 · 22 feb 2027
  "Marco Palestra",              // N° 100 · 23 feb 2027
  "Victor Froholdt",             // N° 101 · 24 feb 2027
  "Brahim Díaz",                 // N° 102 · 25 feb 2027
  "Afonso Moreira",              // N° 103 · 26 feb 2027
  "Willy Gnonto",                // N° 104 · 27 feb 2027
  "Piero Hincapié",              // N° 105 · 28 feb 2027
  "Vitinha",                     // N° 106 · 1 mar 2027
  "Andreas Schjelderup",         // N° 107 · 2 mar 2027
  "Charalampos Kostoulas",       // N° 108 · 3 mar 2027
  "Samuel Chukwueze",            // N° 109 · 4 mar 2027
  "Frenkie de Jong",             // N° 110 · 5 mar 2027
  "Rúben Neves",                 // N° 111 · 6 mar 2027
  "Neil El Aynaoui",             // N° 112 · 7 mar 2027
  "Mikel Merino",                // N° 113 · 8 mar 2027
  "Nicolò Barella",              // N° 114 · 9 mar 2027
  "Diogo Costa",                 // N° 115 · 10 mar 2027
  "Cole Palmer",                 // N° 116 · 11 mar 2027
  "Ayase Ueda",                  // N° 117 · 12 mar 2027
  "Bernardo Silva",              // N° 118 · 13 mar 2027
  "Ivan Provedel",               // N° 119 · 14 mar 2027
  "Maximilian Beier",            // N° 120 · 15 mar 2027
  "Kai Havertz",                 // N° 121 · 16 mar 2027
  "José Manuel López",           // N° 122 · 17 mar 2027
  "Éderson",                     // N° 123 · 18 mar 2027
  "Antoine Semenyo",             // N° 124 · 19 mar 2027
  "Santiago Giménez",            // N° 125 · 20 mar 2027
  "Karim Adeyemi",               // N° 126 · 21 mar 2027
  "Luis Díaz",                   // N° 127 · 22 mar 2027
  "Nicolas Jackson",             // N° 128 · 23 mar 2027
  "Nick Woltemade",              // N° 129 · 24 mar 2027
  "Pavel Šulc",                  // N° 130 · 25 mar 2027
  "Mateo Retegui",               // N° 131 · 26 mar 2027
  "Joshua Zirkzee",              // N° 132 · 27 mar 2027
  "Raphinha",                    // N° 133 · 28 mar 2027
  "Fikayo Tomori",               // N° 134 · 29 mar 2027
  "Tijjani Reijnders",           // N° 135 · 30 mar 2027
  "Jamal Musiala",               // N° 136 · 31 mar 2027
  "Harvey Barnes",               // N° 137 · 1 apr 2027
  "Douglas Luiz",                // N° 138 · 2 apr 2027
  "Vitor Roque",                 // N° 139 · 3 apr 2027
  "Bradley Barcola",             // N° 140 · 4 apr 2027
  "Rodri",                       // N° 141 · 5 apr 2027
  "Lucas Hernández",             // N° 142 · 6 apr 2027
  "Igor Matanović",              // N° 143 · 7 apr 2027
  "Lorenzo Pellegrini",          // N° 144 · 8 apr 2027
  "Rico Lewis",                  // N° 145 · 9 apr 2027
  "Victor Osimhen",              // N° 146 · 10 apr 2027
  "Calvin Bassey",               // N° 147 · 11 apr 2027
  "Federico Gatti",              // N° 148 · 12 apr 2027
  "Isco",                        // N° 149 · 13 apr 2027
  "William Gomes",               // N° 150 · 14 apr 2027
  "Josip Stanišić",              // N° 151 · 15 apr 2027
  "Leny Yoro",                   // N° 152 · 16 apr 2027
  "Ilya Zabarnyi",               // N° 153 · 17 apr 2027
  "Giovanni Simeone",            // N° 154 · 18 apr 2027
  "Felipe Anderson",             // N° 155 · 19 apr 2027
  "Joe Rodon",                   // N° 156 · 20 apr 2027
  "Arda Güler",                  // N° 157 · 21 apr 2027
  "Bilal El Khannouss",          // N° 158 · 22 apr 2027
  "Koni De Winter",              // N° 159 · 23 apr 2027
  "Stefan de Vrij",              // N° 160 · 24 apr 2027
  "Noni Madueke",                // N° 161 · 25 apr 2027
  "Nemanja Matić",               // N° 162 · 26 apr 2027
  "Johan Manzambi",              // N° 163 · 27 apr 2027
  "Kyle Walker",                 // N° 164 · 28 apr 2027
  "Antonio Rüdiger",             // N° 165 · 29 apr 2027
  "Mika Godts",                  // N° 166 · 30 apr 2027
  "Deniz Undav",                 // N° 167 · 1 mag 2027
  "Martin Ødegaard",             // N° 168 · 2 mag 2027
  "Romelu Lukaku",               // N° 169 · 3 mag 2027
  "Henrikh Mkhitaryan",          // N° 170 · 4 mag 2027
  "Matheus Cunha",               // N° 171 · 5 mag 2027
  "Yan Diomande",                // N° 172 · 6 mag 2027
  "Simon Adingra",               // N° 173 · 7 mag 2027
  "Alessandro Bastoni",          // N° 174 · 8 mag 2027
  "Nico Schlotterbeck",          // N° 175 · 9 mag 2027
  "Morgan Gibbs-White",          // N° 176 · 10 mag 2027
  "Désiré Doué",                 // N° 177 · 11 mag 2027
  "Danilo Santos",               // N° 178 · 12 mag 2027
  "Daniel Maldini",              // N° 179 · 13 mag 2027
  "Erling Haaland",              // N° 180 · 14 mag 2027
  "Ibrahima Konaté",             // N° 181 · 15 mag 2027
  "Nicolas Seiwald",             // N° 182 · 16 mag 2027
  "Dušan Vlahović",              // N° 183 · 17 mag 2027
  "Romeo Lavia",                 // N° 184 · 18 mag 2027
  "Alex Meret",                  // N° 185 · 19 mag 2027
  "Yoane Wissa",                 // N° 186 · 20 mag 2027
  "Thomas Müller",               // N° 187 · 21 mag 2027
  "Mikel Oyarzabal",             // N° 188 · 22 mag 2027
  "Nicolò Fagioli",              // N° 189 · 23 mag 2027
  "Aleksandar Pavlović",         // N° 190 · 24 mag 2027
  "Ismaëlo Ganiou",              // N° 191 · 25 mag 2027
  "Nico González",               // N° 192 · 26 mag 2027
  "Joel Ordóñez",                // N° 193 · 27 mag 2027
  "Benjamin Pavard",             // N° 194 · 28 mag 2027
  "Ismaïla Sarr",                // N° 195 · 29 mag 2027
  "Natan",                       // N° 196 · 30 mag 2027
  "Hirving Lozano",              // N° 197 · 31 mag 2027
  "Edin Džeko",                  // N° 198 · 1 giu 2027
  "Carlos Augusto",              // N° 199 · 2 giu 2027
  "Patrick Dorgu",               // N° 200 · 3 giu 2027
  "Folarin Balogun",             // N° 201 · 4 giu 2027
  "Vangelis Pavlidis",           // N° 202 · 5 giu 2027
  "Alexander Isak",              // N° 203 · 6 giu 2027
  "Strahinja Pavlović",          // N° 204 · 7 giu 2027
  "Dani Olmo",                   // N° 205 · 8 giu 2027
  "Alphonso Davies",             // N° 206 · 9 giu 2027
  "Jørgen Strand Larsen",        // N° 207 · 10 giu 2027
  "Jakub Kiwior",                // N° 208 · 11 giu 2027
  "David de Gea",                // N° 209 · 12 giu 2027
  "Andrey Santos",               // N° 210 · 13 giu 2027
  "Marcos Llorente",             // N° 211 · 14 giu 2027
  "Richard Ríos",                // N° 212 · 15 giu 2027
  "Bryan Cristante",             // N° 213 · 16 giu 2027
  "Jamie Leweling",              // N° 214 · 17 giu 2027
  "Rúben Dias",                  // N° 215 · 18 giu 2027
  "Willian Pacho",               // N° 216 · 19 giu 2027
  "Marco Reus",                  // N° 217 · 20 giu 2027
  "Kenan Yıldız",                // N° 218 · 21 giu 2027
  "Manuel Ugarte",               // N° 219 · 22 giu 2027
  "Thibaut Courtois",            // N° 220 · 23 giu 2027
  "Rodrigo De Paul",             // N° 221 · 24 giu 2027
  "Julian Ryerson",              // N° 222 · 25 giu 2027
  "Dominik Szoboszlai",          // N° 223 · 26 giu 2027
  "Andrea Cambiaso",             // N° 224 · 27 giu 2027
  "Tyler Morton",                // N° 225 · 28 giu 2027
  "Gabriel Martinelli",          // N° 226 · 29 giu 2027
  "Sávio",                       // N° 227 · 30 giu 2027
  "João Cancelo",                // N° 228 · 1 lug 2027
  "Guglielmo Vicario",           // N° 229 · 2 lug 2027
  "Joshua Kimmich",              // N° 230 · 3 lug 2027
  "Quinten Timber",              // N° 231 · 4 lug 2027
  "Karim Benzema",               // N° 232 · 5 lug 2027
  "Pierre Kalulu",               // N° 233 · 6 lug 2027
  "Geovany Quenda",              // N° 234 · 7 lug 2027
  "Lee Kang-in",                 // N° 235 · 8 lug 2027
  "Mohamed Salah",               // N° 236 · 9 lug 2027
  "Nathaniel Brown",             // N° 237 · 10 lug 2027
  "Mile Svilar",                 // N° 238 · 11 lug 2027
  "Ezri Konsa",                  // N° 239 · 12 lug 2027
  "Maghnes Akliouche",           // N° 240 · 13 lug 2027
  "Jorginho",                    // N° 241 · 14 lug 2027
  "Justin Kluivert",             // N° 242 · 15 lug 2027
  "Nico Paz",                    // N° 243 · 16 lug 2027
  "Jude Bellingham",             // N° 244 · 17 lug 2027
  "Gregor Kobel",                // N° 245 · 18 lug 2027
  "Kerem Aktürkoğlu",            // N° 246 · 19 lug 2027
  "Jean-Philippe Mateta",        // N° 247 · 20 lug 2027
  "Leonardo Balerdi",            // N° 248 · 21 lug 2027
  "Reece James",                 // N° 249 · 22 lug 2027
  "Nicolò Tresoldi",             // N° 250 · 23 lug 2027
  "Anthony Gordon",              // N° 251 · 24 lug 2027
  "Joaquín Panichelli",          // N° 252 · 25 lug 2027
  "Curtis Jones",                // N° 253 · 26 lug 2027
  "Antonio Nusa",                // N° 254 · 27 lug 2027
  "Marcus Rashford",             // N° 255 · 28 lug 2027
  "Marc-André ter Stegen",       // N° 256 · 29 lug 2027
  "Wesley",                      // N° 257 · 30 lug 2027
  "Levi Colwill",                // N° 258 · 31 lug 2027
  "Alberto Moleiro",             // N° 259 · 1 ago 2027
  "Wilfried Singo",              // N° 260 · 2 ago 2027
  "Kim Min-jae",                 // N° 261 · 3 ago 2027
  "Ayyoub Bouaddi",              // N° 262 · 4 ago 2027
  "Luka Modrić",                 // N° 263 · 5 ago 2027
  "Khvicha Kvaratskhelia",       // N° 264 · 6 ago 2027
  "Thiago Silva",                // N° 265 · 7 ago 2027
  "Pedro Neto",                  // N° 266 · 8 ago 2027
  "Dean Huijsen",                // N° 267 · 9 ago 2027
  "Donyell Malen",               // N° 268 · 10 ago 2027
  "Angelo Stiller",              // N° 269 · 11 ago 2027
  "Noah Okafor",                 // N° 270 · 12 ago 2027
  "Ricardo Pepi",                // N° 271 · 13 ago 2027
  "Francisco Conceição",         // N° 272 · 14 ago 2027
  "António Silva",               // N° 273 · 15 ago 2027
  "Williot Swedberg",            // N° 274 · 16 ago 2027
  "Givairo Read",                // N° 275 · 17 ago 2027
  "Olivier Giroud",              // N° 276 · 18 ago 2027
  "Christoph Baumgartner",       // N° 277 · 19 ago 2027
  "James Garner",                // N° 278 · 20 ago 2027
  "Nicolò Rovella",              // N° 279 · 21 ago 2027
  "Rafael Leão",                 // N° 280 · 22 ago 2027
  "Brian Brobbey",               // N° 281 · 23 ago 2027
  "Jules Koundé",                // N° 282 · 24 ago 2027
  "Manuel Locatelli",            // N° 283 · 25 ago 2027
  "Casemiro",                    // N° 284 · 26 ago 2027
  "Ibrahim Maza",                // N° 285 · 27 ago 2027
  "Conor Gallagher",             // N° 286 · 28 ago 2027
  "Giorgio Scalvini",            // N° 287 · 29 ago 2027
  "Igor Paixão",                 // N° 288 · 30 ago 2027
  "Leandro Barreiro",            // N° 289 · 31 ago 2027
  "Matías Fernández-Pardo",      // N° 290 · 1 set 2027
  "Orri Óskarsson",              // N° 291 · 2 set 2027
  "Waldemar Anton",              // N° 292 · 3 set 2027
  "Mike Maignan",                // N° 293 · 4 set 2027
  "Ethan Ampadu",                // N° 294 · 5 set 2027
  "Rodrigo Zalazar",             // N° 295 · 6 set 2027
  "Jonathan David",              // N° 296 · 7 set 2027
  "Igor Jesus",                  // N° 297 · 8 set 2027
  "Aleksandar Stanković",        // N° 298 · 9 set 2027
  "Barış Alper Yılmaz",          // N° 299 · 10 set 2027
  "Kaishu Sano",                 // N° 300 · 11 set 2027
  "Sander Berge",                // N° 301 · 12 set 2027
  "Denis Zakaria",               // N° 302 · 13 set 2027
  "Riccardo Orsolini",           // N° 303 · 14 set 2027
  "Luis Javier Suárez",          // N° 304 · 15 set 2027
  "Ibrahim Mbaye",               // N° 305 · 16 set 2027
  "Pablo Barrios",               // N° 306 · 17 set 2027
  "André-Frank Zambo Anguissa",  // N° 307 · 18 set 2027
  "Alexis Sánchez",              // N° 308 · 19 set 2027
  "Dayot Upamecano",             // N° 309 · 20 set 2027
  "Neco Williams",               // N° 310 · 21 set 2027
  "Vanderson",                   // N° 311 · 22 set 2027
  "Randal Kolo Muani",           // N° 312 · 23 set 2027
  "Edinson Cavani",              // N° 313 · 24 set 2027
  "Harry Wilson",                // N° 314 · 25 set 2027
  "Denzel Dumfries",             // N° 315 · 26 set 2027
  "Jonathan Tah",                // N° 316 · 27 set 2027
  "Carlos Baleba",               // N° 317 · 28 set 2027
  "Isak Hien",                   // N° 318 · 29 set 2027
  "Theo Hernández",              // N° 319 · 30 set 2027
  "Marc Bernal",                 // N° 320 · 1 ott 2027
  "João Pedro",                  // N° 321 · 2 ott 2027
  "Leandro Trossard",            // N° 322 · 3 ott 2027
  "Diego Moreira",               // N° 323 · 4 ott 2027
  "Hiroki Itō",                  // N° 324 · 5 ott 2027
  "Murillo",                     // N° 325 · 6 ott 2027
  "Aleksandr Golovin",           // N° 326 · 7 ott 2027
  "Danilo",                      // N° 327 · 8 ott 2027
  "Marcus Thuram",               // N° 328 · 9 ott 2027
  "Boubacar Kamara",             // N° 329 · 10 ott 2027
  "Gabriel Jesus",               // N° 330 · 11 ott 2027
  "Mario Götze",                 // N° 331 · 12 ott 2027
  "Hakim Ziyech",                // N° 332 · 13 ott 2027
  "Elliot Anderson",             // N° 333 · 14 ott 2027
  "Mario Pašalić",               // N° 334 · 15 ott 2027
  "Unai Simón",                  // N° 335 · 16 ott 2027
  "Ousmane Diomande",            // N° 336 · 17 ott 2027
  "Ángel Correa",                // N° 337 · 18 ott 2027
  "Nicola Zalewski",             // N° 338 · 19 ott 2027
  "Fabián Ruiz",                 // N° 339 · 20 ott 2027
  "Jonathan Burkardt",           // N° 340 · 21 ott 2027
  "Matheus Nunes",               // N° 341 · 22 ott 2027
  "Yann Sommer",                 // N° 342 · 23 ott 2027
  "Gonçalo Ramos",               // N° 343 · 24 ott 2027
  "Jorrel Hato",                 // N° 344 · 25 ott 2027
  "Takefusa Kubo",               // N° 345 · 26 ott 2027
  "Lionel Messi",                // N° 346 · 27 ott 2027
  "Gianluca Mancini",            // N° 347 · 28 ott 2027
  "Konstantinos Karetsas",       // N° 348 · 29 ott 2027
  "Micky van de Ven",            // N° 349 · 30 ott 2027
  "Hákon Arnar Haraldsson",      // N° 350 · 31 ott 2027
  "Roger Ibañez",                // N° 351 · 1 nov 2027
  "Granit Xhaka",                // N° 352 · 2 nov 2027
  "Ruben Loftus-Cheek",          // N° 353 · 3 nov 2027
  "Robin Le Normand",            // N° 354 · 4 nov 2027
  "Ethan Nwaneri",               // N° 355 · 5 nov 2027
  "Richarlison",                 // N° 356 · 6 nov 2027
  "Ivan Toney",                  // N° 357 · 7 nov 2027
  "Domenico Berardi",            // N° 358 · 8 nov 2027
  "Cristian Romero",             // N° 359 · 9 nov 2027
  "Gianluigi Donnarumma",        // N° 360 · 10 nov 2027
  "Antoine Griezmann",           // N° 361 · 11 nov 2027
  "Lucas Da Cunha",              // N° 362 · 12 nov 2027
  "Timothy Weah",                // N° 363 · 13 nov 2027
  "Diogo Dalot",                 // N° 364 · 14 nov 2027
  "Christopher Nkunku",          // N° 365 · 15 nov 2027
  "Zeno Debast",                 // N° 366 · 16 nov 2027
  "Leonardo Spinazzola",         // N° 367 · 17 nov 2027
  "Alisson Becker",              // N° 368 · 18 nov 2027
  "Marc Pubill",                 // N° 369 · 19 nov 2027
  "Luis Suárez",                 // N° 370 · 20 nov 2027
  "Jobe Bellingham",             // N° 371 · 21 nov 2027
  "Brennan Johnson",             // N° 372 · 22 nov 2027
  "Moise Kean",                  // N° 373 · 23 nov 2027
  "Marquinhos",                  // N° 374 · 24 nov 2027
  "Leroy Sané",                  // N° 375 · 25 nov 2027
  "David Raya",                  // N° 376 · 26 nov 2027
  "Julián Alvarez",              // N° 377 · 27 nov 2027
  "Máximo Perrone",              // N° 378 · 28 nov 2027
  "Ermedin Demirović",           // N° 379 · 29 nov 2027
  "Caoimhín Kelleher",           // N° 380 · 30 nov 2027
  "Gianluca Prestianni",         // N° 381 · 1 dic 2027
  "Gleison Bremer",              // N° 382 · 2 dic 2027
  "Dani Vivian",                 // N° 383 · 3 dic 2027
  "Youri Tielemans",             // N° 384 · 4 dic 2027
  "Mason Greenwood",             // N° 385 · 5 dic 2027
  "Lamine Camara",               // N° 386 · 6 dic 2027
  "Matteo Politano",             // N° 387 · 7 dic 2027
  "Jan Paul van Hecke",          // N° 388 · 8 dic 2027
  "Konrad Laimer",               // N° 389 · 9 dic 2027
  "Milan Škriniar",              // N° 390 · 10 dic 2027
  "Joan García",                 // N° 391 · 11 dic 2027
  "Mats Wieffer",                // N° 392 · 12 dic 2027
  "Rodrigo Mora",                // N° 393 · 13 dic 2027
  "İlkay Gündoğan",              // N° 394 · 14 dic 2027
  "Maximilian Mittelstädt",      // N° 395 · 15 dic 2027
  "Mateus Fernandes",            // N° 396 · 16 dic 2027
  "Samuele Ricci",               // N° 397 · 17 dic 2027
  "Esteban Lepaul",              // N° 398 · 18 dic 2027
  "Marc Guéhi",                  // N° 399 · 19 dic 2027
  "Roberto Firmino",             // N° 400 · 20 dic 2027
  "Pierre-Emerick Aubameyang",   // N° 401 · 21 dic 2027
  "Jesús Rodríguez",             // N° 402 · 22 dic 2027
  "William Saliba",              // N° 403 · 23 dic 2027
  "Said El Mala",                // N° 404 · 24 dic 2027
  "Son Heung-min",               // N° 405 · 25 dic 2027
  "Yerry Mina",                  // N° 406 · 26 dic 2027
  "Matty Cash",                  // N° 407 · 27 dic 2027
  "Abde Ezzalzouli",             // N° 408 · 28 dic 2027
  "Yunus Akgün",                 // N° 409 · 29 dic 2027
  "Hamza Igamane",               // N° 410 · 30 dic 2027
  "Xavi Simons",                 // N° 411 · 31 dic 2027
  "Manuel Neuer",                // N° 412 · 1 gen 2028
  "Noa Lang",                    // N° 413 · 2 gen 2028
  "Orkun Kökçü",                 // N° 414 · 3 gen 2028
  "Ben White",                   // N° 415 · 4 gen 2028
  "Rodrygo",                     // N° 416 · 5 gen 2028
  "Pape Matar Sarr",             // N° 417 · 6 gen 2028
  "Ivan Perišić",                // N° 418 · 7 gen 2028
  "Mohammed Kudus",              // N° 419 · 8 gen 2028
  "Johan Bakayoko",              // N° 420 · 9 gen 2028
  "Arkadiusz Milik",             // N° 421 · 10 gen 2028
  "Koke",                        // N° 422 · 11 gen 2028
  "Maxence Lacroix",             // N° 423 · 12 gen 2028
  "Samu Aghehowa",               // N° 424 · 13 gen 2028
  "Ousmane Dembélé",             // N° 425 · 14 gen 2028
  "Federico Bernardeschi",       // N° 426 · 15 gen 2028
  "Mamadou Sangaré",             // N° 427 · 16 gen 2028
  "Patrik Schick",               // N° 428 · 17 gen 2028
  "Sadio Mané",                  // N° 429 · 18 gen 2028
  "Pape Gueye",                  // N° 430 · 19 gen 2028
  "Rio Ngumoha",                 // N° 431 · 20 gen 2028
  "Billy Gilmour",               // N° 432 · 21 gen 2028
  "Leandro Paredes",             // N° 433 · 22 gen 2028
  "David Raum",                  // N° 434 · 23 gen 2028
  "Enzo Fernández",              // N° 435 · 24 gen 2028
  "Nuno Mendes",                 // N° 436 · 25 gen 2028
  "Assane Diao",                 // N° 437 · 26 gen 2028
  "Francisco Trincão",           // N° 438 · 27 gen 2028
  "Vitaliy Mykolenko",           // N° 439 · 28 gen 2028
  "Morten Hjulmand",             // N° 440 · 29 gen 2028
  "Federico Dimarco",            // N° 441 · 30 gen 2028
  "Yasin Ayari",                 // N° 442 · 31 gen 2028
  "Marko Arnautović",            // N° 443 · 1 feb 2028
  "Michael Olise",               // N° 444 · 2 feb 2028
  "Kylian Mbappé",               // N° 445 · 3 feb 2028
  "Mattia Zaccagni",             // N° 446 · 4 feb 2028
  "Bart Verbruggen",             // N° 447 · 5 feb 2028
  "Cristiano Ronaldo",           // N° 448 · 6 feb 2028
  "Loïs Openda",                 // N° 449 · 7 feb 2028
  "Adam Wharton",                // N° 450 · 8 feb 2028
  "Aleix García",                // N° 451 · 9 feb 2028
  "Nikola Krstović",             // N° 452 · 10 feb 2028
  "Lutsharel Geertruida",        // N° 453 · 11 feb 2028
  "Fermín López",                // N° 454 · 12 feb 2028
  "James Maddison",              // N° 455 · 13 feb 2028
  "Ardon Jashari",               // N° 456 · 14 feb 2028
  "Memphis Depay",               // N° 457 · 15 feb 2028
  "Mateo Kovačić",               // N° 458 · 16 feb 2028
  "Joey Veerman",                // N° 459 · 17 feb 2028
  "Lucas Høgsberg",              // N° 460 · 18 feb 2028
  "Evan Ndicka",                 // N° 461 · 19 feb 2028
  "Crysencio Summerville",       // N° 462 · 20 feb 2028
  "Giorgi Mamardashvili",        // N° 463 · 21 feb 2028
  "Andrei Rațiu",                // N° 464 · 22 feb 2028
  "Serge Gnabry",                // N° 465 · 23 feb 2028
  "Emiliano Martínez",           // N° 466 · 24 feb 2028
  "Nicolás González",            // N° 467 · 25 feb 2028
  "Hugo Lloris",                 // N° 468 · 26 feb 2028
  "Johnny Cardoso",              // N° 469 · 27 feb 2028
  "Alex Scott",                  // N° 470 · 28 feb 2028
  "Trevoh Chalobah",             // N° 471 · 29 feb 2028
  "Marco Asensio",               // N° 472 · 1 mar 2028
  "Dilane Bakwa",                // N° 473 · 2 mar 2028
  "Kevin Danso",                 // N° 474 · 3 mar 2028
  "Finn Jeltsch",                // N° 475 · 4 mar 2028
  "Stephan El Shaarawy",         // N° 476 · 5 mar 2028
  "Anatoliy Trubin",             // N° 477 · 6 mar 2028
  "Bruno Guimarães",             // N° 478 · 7 mar 2028
  "David Hancko",                // N° 479 · 8 mar 2028
  "Philippe Coutinho",           // N° 480 · 9 mar 2028
  "Piotr Zieliński",             // N° 481 · 10 mar 2028
  "Habib Diarra",                // N° 482 · 11 mar 2028
  "Rômulo",                      // N° 483 · 12 mar 2028
  "Gessime Yassine",             // N° 484 · 13 mar 2028
  "Cucho Hernández",             // N° 485 · 14 mar 2028
  "Dominic Solanke",             // N° 486 · 15 mar 2028
  "Sergiño Dest",                // N° 487 · 16 mar 2028
  "Pedro Gonçalves",             // N° 488 · 17 mar 2028
  "Viktor Gyökeres",             // N° 489 · 18 mar 2028
  "Leon Avdullahu",              // N° 490 · 19 mar 2028
  "Gonçalo Inácio",              // N° 491 · 20 mar 2028
  "Yunus Musah",                 // N° 492 · 21 mar 2028
  "Eduardo Camavinga",           // N° 493 · 22 mar 2028
  "Lucas Bergvall",              // N° 494 · 23 mar 2028
  "Álvaro Morata",               // N° 495 · 24 mar 2028
  "Jhon Lucumí",                 // N° 496 · 25 mar 2028
  "Karim Coulibaly",             // N° 497 · 26 mar 2028
  "Tyler Adams",                 // N° 498 · 27 mar 2028
  "Fisnik Asllani",              // N° 499 · 28 mar 2028
  "Sergej Milinković-Savić",     // N° 500 · 29 mar 2028
  "David Neres",                 // N° 501 · 30 mar 2028
  "Jérémy Doku",                 // N° 502 · 31 mar 2028
  "Endrick",                     // N° 503 · 1 apr 2028
  "Geny Catamo",                 // N° 504 · 2 apr 2028
  "Matthijs de Ligt",            // N° 505 · 3 apr 2028
  "Scott McTominay",             // N° 506 · 4 apr 2028
  "Can Uzun",                    // N° 507 · 5 apr 2028
  "Iago Aspas",                  // N° 508 · 6 apr 2028
  "Kobbie Mainoo",               // N° 509 · 7 apr 2028
  "Kalidou Koulibaly",           // N° 510 · 8 apr 2028
  "Charlie Cresswell",           // N° 511 · 9 apr 2028
  "Kevin De Bruyne",             // N° 512 · 10 apr 2028
  "Aaron Hickey",                // N° 513 · 11 apr 2028
  "Tom Bischof",                 // N° 514 · 12 apr 2028
  "Luis Alberto",                // N° 515 · 13 apr 2028
  "Petar Sučić",                 // N° 516 · 14 apr 2028
  "Giuliano Simeone",            // N° 517 · 15 apr 2028
  "Jurriën Timber",              // N° 518 · 16 apr 2028
  "Ruud Nijstad",                // N° 519 · 17 apr 2028
  "Albert Gudmundsson",          // N° 520 · 18 apr 2028
  "Pau Torres",                  // N° 521 · 19 apr 2028
  "Edmond Tapsoba",              // N° 522 · 20 apr 2028
  "Mamadou Coulibaly",           // N° 523 · 21 apr 2028
  "Valentin Atangana",           // N° 524 · 22 apr 2028
  "Gerard Martín",               // N° 525 · 23 apr 2028
  "Nikola Milenković",           // N° 526 · 24 apr 2028
  "Kerim Alajbegović",           // N° 527 · 25 apr 2028
  "Florian Wirtz",               // N° 528 · 26 apr 2028
  "Konstantinos Mavropanos",     // N° 529 · 27 apr 2028
  "Lennart Karl",                // N° 530 · 28 apr 2028
  "Matteo Darmian",              // N° 531 · 29 apr 2028
  "Ademola Lookman",             // N° 532 · 30 apr 2028
  "Destiny Udogie",              // N° 533 · 1 mag 2028
  "Taty Castellanos",            // N° 534 · 2 mag 2028
  "Martial Godo",                // N° 535 · 3 mag 2028
  "Weston McKennie",             // N° 536 · 4 mag 2028
  "Dan Ndoye",                   // N° 537 · 5 mag 2028
  "Noah Atubolu",                // N° 538 · 6 mag 2028
  "Enzo Millot",                 // N° 539 · 7 mag 2028
  "Dani Carvajal",               // N° 540 · 8 mag 2028
  "Omar Marmoush",               // N° 541 · 9 mag 2028
  "Manu Koné",                   // N° 542 · 10 mag 2028
  "Maurício",                    // N° 543 · 11 mag 2028
  "Valentino Livramento",        // N° 544 · 12 mag 2028
  "Yuito Suzuki",                // N° 545 · 13 mag 2028
  "Pervis Estupiñán",            // N° 546 · 14 mag 2028
  "Nathan Ngoy",                 // N° 547 · 15 mag 2028
  "Trent Alexander-Arnold",      // N° 548 · 16 mag 2028
  "Mohamed Kader Meïté",         // N° 549 · 17 mag 2028
  "Amine Adli",                  // N° 550 · 18 mag 2028
  "Hakan Çalhanoğlu",            // N° 551 · 19 mag 2028
  "Dominic Calvert-Lewin",       // N° 552 · 20 mag 2028
  "Ibrahima Ba",                 // N° 553 · 21 mag 2028
  "Kacper Potulski",             // N° 554 · 22 mag 2028
  "Eric García",                 // N° 555 · 23 mag 2028
  "Lautaro Martínez",            // N° 556 · 24 mag 2028
  "Cody Gakpo",                  // N° 557 · 25 mag 2028
  "Eduard Spertsyan",            // N° 558 · 26 mag 2028
  "Jean-Clair Todibo",           // N° 559 · 27 mag 2028
  "Amad Diallo",                 // N° 560 · 28 mag 2028
  "Santiago Castro",             // N° 561 · 29 mag 2028
  "Albian Hajdari",              // N° 562 · 30 mag 2028
  "Dorgeles Nene",               // N° 563 · 31 mag 2028
  "Vinícius Jr.",                // N° 564 · 1 giu 2028
  "Phil Foden",                  // N° 565 · 2 giu 2028
  "Artem Dovbyk",                // N° 566 · 3 giu 2028
  "Aleksey Batrakov",            // N° 567 · 4 giu 2028
  "Chris Richards",              // N° 568 · 5 giu 2028
  "Rocco Reitz",                 // N° 569 · 6 giu 2028
  "Paulo Dybala",                // N° 570 · 7 giu 2028
  "Álex Baena",                  // N° 571 · 8 giu 2028
  "Mohamed Amoura",              // N° 572 · 9 giu 2028
  "Yeremi Pino",                 // N° 573 · 10 giu 2028
  "Roger Fernandes",             // N° 574 · 11 giu 2028
  "Christian Pulisic",           // N° 575 · 12 giu 2028
  "Pedro Porro",                 // N° 576 · 13 giu 2028
  "Jonas Urbig",                 // N° 577 · 14 giu 2028
  "Franculino",                  // N° 578 · 15 giu 2028
  "Aurélien Tchouaméni",         // N° 579 · 16 giu 2028
  "Jérémy Jacquet",              // N° 580 · 17 giu 2028
  "Kenneth Taylor",              // N° 581 · 18 giu 2028
  "Carlos Forbs",                // N° 582 · 19 giu 2028
  "Kévin Danois",                // N° 583 · 20 giu 2028
  "Rayan",                       // N° 584 · 21 giu 2028
  "Miguel Gutiérrez",            // N° 585 · 22 giu 2028
  "Duván Zapata",                // N° 586 · 23 giu 2028
  "Kees Smit",                   // N° 587 · 24 giu 2028
  "Gavi",                        // N° 588 · 25 giu 2028
  "Joško Gvardiol",              // N° 589 · 26 giu 2028
  "Omari Hutchinson",            // N° 590 · 27 giu 2028
  "Yuri Alberto",                // N° 591 · 28 giu 2028
  "Harry Maguire",               // N° 592 · 29 giu 2028
  "Philipp Treu",                // N° 593 · 30 giu 2028
  "Renato Veiga",                // N° 594 · 1 lug 2028
  "Niccolò Pisilli",             // N° 595 · 2 lug 2028
  "Ola Aina",                    // N° 596 · 3 lug 2028
  "Thiago Almada",               // N° 597 · 4 lug 2028
  "Matthis Abline",              // N° 598 · 5 lug 2028
  "Gabriel Gudmundsson",         // N° 599 · 6 lug 2028
  "Francesco Pio Esposito",      // N° 600 · 7 lug 2028
  "Ramon Hendriks",              // N° 601 · 8 lug 2028
  "Archie Brown",                // N° 602 · 9 lug 2028
  "Álvaro Carreras",             // N° 603 · 10 lug 2028
  "Luka Vušković",               // N° 604 · 11 lug 2028
  "Franco Mastantuono",          // N° 605 · 12 lug 2028
  "Lucca Brughmans",             // N° 606 · 13 lug 2028
  "Riccardo Calafiori",          // N° 607 · 14 lug 2028
  "Elye Wahi",                   // N° 608 · 15 lug 2028
  "Joane Gadou",                 // N° 609 · 16 lug 2028
  "Adrien Rabiot",               // N° 610 · 17 lug 2028
  "Pau Cubarsí",                 // N° 611 · 18 lug 2028
  "Sergi Altimira",              // N° 612 · 19 lug 2028
  "Brenden Aaronson",            // N° 613 · 20 lug 2028
  "Ange-Yoan Bonny",             // N° 614 · 21 lug 2028
  "Joelinton",                   // N° 615 · 22 lug 2028
  "André",                       // N° 616 · 23 lug 2028
  "Wouter Burger",               // N° 617 · 24 lug 2028
  "Éder Militão",                // N° 618 · 25 lug 2028
  "Bazoumana Touré",             // N° 619 · 26 lug 2028
  "Stanislav Lobotka",           // N° 620 · 27 lug 2028
  "Lesley Ugochukwu",            // N° 621 · 28 lug 2028
  "Lucas Beraldo",               // N° 622 · 29 lug 2028
  "Federico Chiesa",             // N° 623 · 30 lug 2028
  "Giannis Konstantelias",       // N° 624 · 31 lug 2028
  "Alexis Saelemaekers",         // N° 625 · 1 ago 2028
  "Lucas Paquetá",               // N° 626 · 2 ago 2028
  "Pedri",                       // N° 627 · 3 ago 2028
  "Amadou Onana",                // N° 628 · 4 ago 2028
  "Manuel Akanji",               // N° 629 · 5 ago 2028
  "Ernest Poku",                 // N° 630 · 6 ago 2028
  "Max Dowman",                  // N° 631 · 7 ago 2028
  "Noahkai Banks",               // N° 632 · 8 ago 2028
  "Patrick Zabi",                // N° 633 · 9 ago 2028
  "Yassir Zabiri",               // N° 634 · 10 ago 2028
  "Gabriel Sara",                // N° 635 · 11 ago 2028
  "Lisandro Martínez",           // N° 636 · 12 ago 2028
  "Jonathan Rowe",               // N° 637 · 13 ago 2028
  "Anton Stach",                 // N° 638 · 14 ago 2028
  "Alan Varela",                 // N° 639 · 15 ago 2028
  "Jacobo Ramón",                // N° 640 · 16 ago 2028
  "Facundo Medina",              // N° 641 · 17 ago 2028
  "Thiago Pitarch",              // N° 642 · 18 ago 2028
  "Oscar Bobb",                  // N° 643 · 19 ago 2028
  "Gerson",                      // N° 644 · 20 ago 2028
  "Ismaël Koné",                 // N° 645 · 21 ago 2028
  "Arthur Avom",                 // N° 646 · 22 ago 2028
  "Declan Rice",                 // N° 647 · 23 ago 2028
  "Assan Ouédraogo",             // N° 648 · 24 ago 2028
  "Kodai Sano",                  // N° 649 · 25 ago 2028
  "Javi Rodríguez",              // N° 650 · 26 ago 2028
  "Khéphren Thuram",             // N° 651 · 27 ago 2028
  "Martín Zubimendi",            // N° 652 · 28 ago 2028
  "Gjivai Zechiël",              // N° 653 · 29 ago 2028
  "Jarrad Branthwaite",          // N° 654 · 30 ago 2028
  "Djed Spence",                 // N° 655 · 31 ago 2028
  "Loïc Badé",                   // N° 656 · 1 set 2028
  "Rudy Matondo",                // N° 657 · 2 set 2028
  "Jon Martín",                  // N° 658 · 3 set 2028
  "Jeremie Frimpong",            // N° 659 · 4 set 2028
  "Matheus Martinelli",          // N° 660 · 5 set 2028
  "Antonio Vergara",             // N° 661 · 6 set 2028
  "Alex Iwobi",                  // N° 662 · 7 set 2028
  "Younes Ebnoutalib",           // N° 663 · 8 set 2028
  "Joaquin Seys",                // N° 664 · 9 set 2028
  "Oumar Solet",                 // N° 665 · 10 set 2028
  "Javi Guerra",                 // N° 666 · 11 set 2028
  "Alexis Mac Allister",         // N° 667 · 12 set 2028
  "Iván Fresneda",               // N° 668 · 13 set 2028
  "Lucas Chevalier",             // N° 669 · 14 set 2028
  "Pietro Comuzzo",              // N° 670 · 15 set 2028
  "Rayan Cherki",                // N° 671 · 16 set 2028
  "Nnamdi Collins",              // N° 672 · 17 set 2028
  "Lucien Agoumé",               // N° 673 · 18 set 2028
  "Samuel Lino",                 // N° 674 · 19 set 2028
  "Ibrahim Sangaré",             // N° 675 · 20 set 2028
  "Lloyd Kelly",                 // N° 676 · 21 set 2028
  "Kaio Jorge",                  // N° 677 · 22 set 2028
  "Andrew Robertson",            // N° 678 · 23 set 2028
  "Equi Fernández",              // N° 679 · 24 set 2028
  "Alessandro Buongiorno",       // N° 680 · 25 set 2028
  "Raúl Asencio",                // N° 681 · 26 set 2028
  "Mathys Detourbet",            // N° 682 · 27 set 2028
  "Ryan Gravenberch",            // N° 683 · 28 set 2028
  "Oskar Pietuszewski",          // N° 684 · 29 set 2028
  "Anastasios Douvikas",         // N° 685 · 30 set 2028
  "Igor Thiago",                 // N° 686 · 1 ott 2028
  "Samuele Inácio",              // N° 687 · 2 ott 2028
  "Mauro Júnior",                // N° 688 · 3 ott 2028
  "Mamadou Sarr",                // N° 689 · 4 ott 2028
  "Luis Henrique",               // N° 690 · 5 ott 2028
  "Nathan Collins",              // N° 691 · 6 ott 2028
  "Borja Sainz",                 // N° 692 · 7 ott 2028
  "Ismaël Doukouré",             // N° 693 · 8 ott 2028
  "Bryan Mbeumo",                // N° 694 · 9 ott 2028
  "Álex Jiménez",                // N° 695 · 10 ott 2028
  "Dženan Pejčinović",           // N° 696 · 11 ott 2028
  "Ander Barrenetxea",           // N° 697 · 12 ott 2028
  "Ladislav Krejčí",             // N° 698 · 13 ott 2028
  "Morgan Rogers",               // N° 699 · 14 ott 2028
  "Armand Laurienté",            // N° 700 · 15 ott 2028
  "Malick Thiaw",                // N° 701 · 16 ott 2028
  "Luciano Valente",             // N° 702 · 17 ott 2028
  "Fábio Silva",                 // N° 703 · 18 ott 2028
  "Jon Gorrotxategi",            // N° 704 · 19 ott 2028
  "Daniele Ghilardi",            // N° 705 · 20 ott 2028
  "Eli Junior Kroupi",           // N° 706 · 21 ott 2028
  "Diego Coppola",               // N° 707 · 22 ott 2028
  "Alberto Costa",               // N° 708 · 23 ott 2028
  "Davide Bartesaghi",           // N° 709 · 24 ott 2028
  "Lewis Hall",                  // N° 710 · 25 ott 2028
  "Kennet Eichhorn",             // N° 711 · 26 ott 2028
  "Issa Doumbia",                // N° 712 · 27 ott 2028
  "Carlos Romero",               // N° 713 · 28 ott 2028
  "Iliman Ndiaye",               // N° 714 · 29 ott 2028
  "Alisson Santos",              // N° 715 · 30 ott 2028
  "Galeno",                      // N° 716 · 31 ott 2028
  "Ronald Araújo",               // N° 717 · 1 nov 2028
  "Samir El Mourabet",           // N° 718 · 2 nov 2028
  "Paul Nebel",                  // N° 719 · 3 nov 2028
  "Arthur Atta",                 // N° 720 · 4 nov 2028
  "Oihan Sancet",                // N° 721 · 5 nov 2028
  "Rayan Aït-Nouri",             // N° 722 · 6 nov 2028
  "Anis Hadj Moussa",            // N° 723 · 7 nov 2028
  "Konstantinos Koulierakis",    // N° 724 · 8 nov 2028
  "Gabriel Magalhães",           // N° 725 · 9 nov 2028
  "Ruben van Bommel",            // N° 726 · 10 nov 2028
  "Brajan Gruda",                // N° 727 · 11 nov 2028
  "Yeremay Hernández",           // N° 728 · 12 nov 2028
  "Cher Ndour",                  // N° 729 · 13 nov 2028
  "Kaoru Mitoma",                // N° 730 · 14 nov 2028
  "Paul Wanner",                 // N° 731 · 15 nov 2028
  "Samson Baidoo",               // N° 732 · 16 nov 2028
  "Jordan Pickford",             // N° 733 · 17 nov 2028
  "Beto",                        // N° 734 · 18 nov 2028
  "Chrislain Matsima",           // N° 735 · 19 nov 2028
  "Harvey Elliott",              // N° 736 · 20 nov 2028
  "Darwin Núñez",                // N° 737 · 21 nov 2028
  "Ferdi Kadıoğlu",              // N° 738 · 22 nov 2028
  "Sam Beukema",                 // N° 739 · 23 nov 2028
  "Mohamed Simakan",             // N° 740 · 24 nov 2028
  "Virgil van Dijk",             // N° 741 · 25 nov 2028
  "Mikey Moore",                 // N° 742 · 26 nov 2028
  "Eliezer Mayenda",             // N° 743 · 27 nov 2028
  "Roberto Fernández",           // N° 744 · 28 nov 2028
  "Alphadjo Cissè",              // N° 745 · 29 nov 2028
  "Sandro Tonali",               // N° 746 · 30 nov 2028
  "Alessandro Circati",          // N° 747 · 1 dic 2028
  "Jeff Ekhator",                // N° 748 · 2 dic 2028
  "Nico O'Reilly",               // N° 749 · 3 dic 2028
  "Breno Bidon",                 // N° 750 · 4 dic 2028
  "Ezechiel Banzuzi",            // N° 751 · 5 dic 2028
  "Xavi Espart",                 // N° 752 · 6 dic 2028
  "Jack Grealish",               // N° 753 · 7 dic 2028
  "Oliver Provstgaard",          // N° 754 · 8 dic 2028
  "Tolu Arokodare",              // N° 755 · 9 dic 2028
  "Abdelhamid Ait Boudlal",      // N° 756 · 10 dic 2028
  "Kevin Schade",                // N° 757 · 11 dic 2028
  "Maxime Estève",               // N° 758 · 12 dic 2028
  "Christ Inao Oulaï",           // N° 759 · 13 dic 2028
  "Troy Parrott",                // N° 760 · 14 dic 2028
  "Pedro Guilherme",             // N° 761 · 15 dic 2028
  "Hugo Ekitiké",                // N° 762 · 16 dic 2028
  "Jayden Addai",                // N° 763 · 17 dic 2028
  "Chibuike Nwaiwu",             // N° 764 · 18 dic 2028
  "Cristhian Mosquera",          // N° 765 · 19 dic 2028
  "Nathan De Cat",               // N° 766 · 20 dic 2028
  "Rodrigo Mendoza",             // N° 767 · 21 dic 2028
  "Pablo Pagis",                 // N° 768 · 22 dic 2028
  "Tammy Abraham",               // N° 769 · 23 dic 2028
  "Mandela Keita",               // N° 770 · 24 dic 2028
  "El Chadaille Bitshiabu",      // N° 771 · 25 dic 2028
  "Daniel Muñoz",                // N° 772 · 26 dic 2028
  "Mateo Pellegrino",            // N° 773 · 27 dic 2028
  "Arne Engels",                 // N° 774 · 28 dic 2028
  "Eliesse Ben Seghir",          // N° 775 · 29 dic 2028
  "Santiago Mouriño",            // N° 776 · 30 dic 2028
  "Zion Suzuki",                 // N° 777 · 31 dic 2028
  "Lorenzo Bernasconi",          // N° 778 · 1 gen 2029
  "Malcom",                      // N° 779 · 2 gen 2029
  "Guillaume Restes",            // N° 780 · 3 gen 2029
  "Christos Tzolis",             // N° 781 · 4 gen 2029
  "Derry Scherhant",             // N° 782 · 5 gen 2029
  "Mikel Jauregizar",            // N° 783 · 6 gen 2029
  "Thomas Kristensen",           // N° 784 · 7 gen 2029
  "Fer López",                   // N° 785 · 8 gen 2029
  "Eberechi Eze"                 // N° 786 · 9 gen 2029
];

if (typeof module !== "undefined" && module.exports) { module.exports = { dailyCalendar }; }
