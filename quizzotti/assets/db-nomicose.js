/* ==========================================================================
   QUIZZOTTI — Database: Nomi, Cose, Calcio
   Le categorie di base tra cui scegliere nella stanza (le prime "di serie"
   sono accese all'inizio), le lettere che si possono estrarre e qualche
   esempio per la schermata delle regole. Le categorie inventate dai
   giocatori durante la partita non stanno qui: vivono solo nella stanza.
   ========================================================================== */

const nomicoseData = {
  // id stabile (serve alla stanza), nome mostrato, esempio con la lettera M
  categories: [
    { id: 'gita', name: 'Calciatore italiano', ex: 'Maldini', on: true },
    { id: 'gstr', name: 'Calciatore straniero', ex: 'Modrić', on: true },
    { id: 'sqit', name: 'Squadra italiana', ex: 'Monza', on: true },
    { id: 'sqst', name: 'Squadra straniera', ex: 'Marsiglia', on: true },
    { id: 'alle', name: 'Allenatore', ex: 'Mourinho', on: true },
    { id: 'stad', name: 'Stadio', ex: 'Maracanã', on: true },
    { id: 'naz', name: 'Nazionale', ex: 'Marocco', on: true },
    { id: 'port', name: 'Portiere', ex: 'Meret' },
    { id: 'dife', name: 'Difensore', ex: 'Marquinhos' },
    { id: 'cent', name: 'Centrocampista', ex: 'Modrić' },
    { id: 'atta', name: 'Attaccante', ex: 'Mbappé' },
    { id: 'legg', name: 'Leggenda (ritirata)', ex: 'Maradona' },
    { id: 'seria', name: 'Giocatore della Serie A di oggi', ex: 'McTominay' },
    { id: 'citt', name: 'Città con una squadra di calcio', ex: 'Modena' },
    { id: 'sopr', name: 'Soprannome di un calciatore', ex: 'Mago' },
    { id: 'trof', name: 'Trofeo o competizione', ex: 'Mondiale per club' },
    { id: 'pres', name: 'Presidente o dirigente', ex: 'Moratti' },
    { id: 'tele', name: 'Telecronista o giornalista', ex: 'Marianella' },
    { id: 'term', name: 'Parola del calcio', ex: 'Melina' },
    { id: 'prem', name: 'Giocatore della Premier League', ex: 'Mac Allister' },
  ],
  // lettere italiane (senza Q) piu' le straniere che nel calcio servono eccome
  letters: 'ABCDEFGHILMNOPRSTUVZ'.split(''),
  foreign: 'JKWY'.split(''),
};

if (typeof module !== 'undefined' && module.exports) { module.exports = { nomicoseData }; }
