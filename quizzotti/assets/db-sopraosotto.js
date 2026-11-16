/* ==========================================================================
   QUIZZOTTI — Database: Sopra o Sotto, mazzo "Gol in Serie A"
   I bomber della storia del campionato con i gol segnati in Serie A.
   Solo giocatori che in Serie A hanno chiuso (ritirati o lontani da anni):
   il numero non cambia piu'. Fonte: classifica marcatori di tutti i tempi
   della Serie A (Wikipedia), controllata a novembre 2026. Esclusi apposta
   quelli ancora in attivita' o che potrebbero tornare (Lautaro, Berardi,
   Dybala, Immobile, Icardi, Belotti, Dzeko, Muriel, Zapata...).
   I valori uguali (Meazza e Altafini, 216) non finiscono mai in coppia:
   ci pensa il gioco.
   team: le squadre principali in Serie A, non l'elenco completo.
   ========================================================================== */

const sosGoalsDatabase = [
  { name: "Silvio Piola", role: "ATT", team: "Pro Vercelli, Lazio, Juventus, Novara", value: 274 },
  { name: "Francesco Totti", role: "ATT", team: "Roma", value: 250 },
  { name: "Gunnar Nordahl", role: "ATT", team: "Milan, Roma", value: 225 },
  { name: "Giuseppe Meazza", role: "ATT", team: "Inter, Milan, Juventus", value: 216 },
  { name: "José Altafini", role: "ATT", team: "Milan, Napoli, Juventus", value: 216 },
  { name: "Antonio Di Natale", role: "ATT", team: "Udinese, Empoli", value: 209 },
  { name: "Roberto Baggio", role: "ATT", team: "Fiorentina, Juventus, Bologna, Brescia", value: 205 },
  { name: "Kurt Hamrin", role: "ATT", team: "Fiorentina, Milan, Juventus", value: 190 },
  { name: "Giuseppe Signori", role: "ATT", team: "Foggia, Lazio, Bologna", value: 188 },
  { name: "Alessandro Del Piero", role: "ATT", team: "Juventus", value: 188 },
  { name: "Alberto Gilardino", role: "ATT", team: "Parma, Milan, Fiorentina, Genoa", value: 188 },
  { name: "Gabriel Batistuta", role: "ATT", team: "Fiorentina, Roma, Inter", value: 183 },
  { name: "Fabio Quagliarella", role: "ATT", team: "Sampdoria, Udinese, Napoli, Juventus", value: 182 },
  { name: "Giampiero Boniperti", role: "ATT", team: "Juventus", value: 178 },
  { name: "Amedeo Amadei", role: "ATT", team: "Roma, Inter, Napoli", value: 174 },
  { name: "Giuseppe Savoldi", role: "ATT", team: "Atalanta, Bologna, Napoli", value: 168 },
  { name: "Guglielmo Gabetto", role: "ATT", team: "Juventus, Torino", value: 164 },
  { name: "Roberto Boninsegna", role: "ATT", team: "Cagliari, Inter, Juventus", value: 163 },
  { name: "Luca Toni", role: "ATT", team: "Palermo, Fiorentina, Verona", value: 157 },
  { name: "Zlatan Ibrahimović", role: "ATT", team: "Juventus, Inter, Milan", value: 156 },
  { name: "Gigi Riva", role: "ATT", team: "Cagliari", value: 156 },
  { name: "Filippo Inzaghi", role: "ATT", team: "Atalanta, Juventus, Milan", value: 156 },
  { name: "Roberto Mancini", role: "ATT", team: "Sampdoria, Lazio", value: 156 },
  { name: "Luís Vinício", role: "ATT", team: "Napoli, Bologna, Vicenza", value: 155 },
  { name: "Hernán Crespo", role: "ATT", team: "Parma, Lazio, Inter, Milan", value: 153 },
  { name: "István Nyers", role: "ATT", team: "Inter, Roma", value: 153 },
  { name: "Omar Sívori", role: "ATT", team: "Juventus, Napoli", value: 147 },
  { name: "Christian Vieri", role: "ATT", team: "Juventus, Lazio, Inter", value: 142 },
  { name: "Marco Di Vaio", role: "ATT", team: "Parma, Juventus, Bologna", value: 142 },
  { name: "Paolo Pulici", role: "ATT", team: "Torino", value: 142 },
  { name: "Vincenzo Montella", role: "ATT", team: "Sampdoria, Roma", value: 141 },
  { name: "Enrico Chiesa", role: "ATT", team: "Sampdoria, Parma, Fiorentina", value: 139 },
  { name: "John Hansen", role: "ATT", team: "Juventus, Lazio", value: 139 },
  { name: "Roberto Pruzzo", role: "ATT", team: "Genoa, Roma", value: 133 },
  { name: "Alessandro Altobelli", role: "ATT", team: "Inter", value: 132 },
  { name: "Felice Borel", role: "ATT", team: "Juventus", value: 131 },
  { name: "Francesco Graziani", role: "ATT", team: "Torino, Fiorentina", value: 130 },
  { name: "Roberto Bettega", role: "ATT", team: "Juventus", value: 129 },
  { name: "Gianni Rivera", role: "CEN", team: "Milan", value: 128 },
  { name: "Andriy Shevchenko", role: "ATT", team: "Milan", value: 127 },
  { name: "Gonzalo Higuaín", role: "ATT", team: "Napoli, Juventus, Milan", value: 125 },
  { name: "David Trezeguet", role: "ATT", team: "Juventus", value: 123 },
  { name: "Gianluca Vialli", role: "ATT", team: "Sampdoria, Juventus", value: 123 },
  { name: "Cristiano Lucarelli", role: "ATT", team: "Livorno, Torino, Lecce", value: 120 },
  { name: "Abel Balbo", role: "ATT", team: "Udinese, Roma, Parma", value: 117 },
  { name: "Sandro Mazzola", role: "ATT", team: "Inter", value: 116 },
  { name: "Giampaolo Pazzini", role: "ATT", team: "Sampdoria, Inter, Milan, Verona", value: 115 },
  { name: "Dries Mertens", role: "ATT", team: "Napoli", value: 113 },
  { name: "Antonio Cassano", role: "ATT", team: "Bari, Roma, Sampdoria", value: 112 },
  { name: "Sergio Pellissier", role: "ATT", team: "Chievo", value: 112 },
  { name: "Edinson Cavani", role: "ATT", team: "Palermo, Napoli", value: 112 },
  { name: "Bruno Giordano", role: "ATT", team: "Lazio, Napoli", value: 110 },
  { name: "Pietro Anastasi", role: "ATT", team: "Varese, Juventus, Inter", value: 105 },
  { name: "Fabrizio Miccoli", role: "ATT", team: "Palermo, Fiorentina", value: 103 },
  { name: "Adrian Mutu", role: "ATT", team: "Fiorentina, Juventus, Parma", value: 103 },
  { name: "Oliver Bierhoff", role: "ATT", team: "Udinese, Milan", value: 102 },
  { name: "Tommaso Rocchi", role: "ATT", team: "Lazio", value: 102 },
  { name: "Pietro Paolo Virdis", role: "ATT", team: "Milan", value: 102 },
  { name: "Goran Pandev", role: "ATT", team: "Lazio, Inter, Genoa", value: 101 },
  { name: "Pierino Prati", role: "ATT", team: "Milan", value: 100 },
  { name: "Marek Hamšík", role: "CEN", team: "Napoli", value: 100 },
];

if (typeof module !== "undefined" && module.exports) { module.exports = { sosGoalsDatabase }; }
