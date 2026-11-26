/* Derby delle Parole: il database deve essere giocabile (definizioni che non
   svelano la risposta, niente doppioni nemmeno con accenti diversi, caratteri
   che la tastiera italiana sa scrivere, fatti 2025-26 aggiornati) e la logica
   pura del gioco deve reggere i casi limite: refusi, risposte a voce dentro
   una frase, cognome al posto del nome intero, impostazioni salvate rotte,
   bilancio tra squadre con il campo invertito. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { database } = require(path.join('..', 'assets', 'db-sfidaeredita.js'));
const G = require(path.join('..', 'assets', 'games', 'sfidaeredita.js'));

const find = (w) => database.find((d) => d.word === w);

test('almeno 950 voci, tutte con parola e definizione che finisce col punto', () => {
    assert.ok(database.length >= 950, `solo ${database.length} voci`);
    for (const d of database) {
        assert.ok(typeof d.word === 'string' && d.word.trim() === d.word && d.word.length > 1, `parola strana: ${JSON.stringify(d)}`);
        assert.ok(d.word === d.word.toUpperCase(), `"${d.word}" non e' in maiuscolo`);
        assert.ok(typeof d.def === 'string' && d.def.length >= 15 && d.def.length <= 170, `"${d.word}": definizione di ${d.def.length} caratteri`);
        assert.match(d.def, /[.!?»]$/, `"${d.word}": definizione senza punto finale`);
    }
});

test('nessuna parola compare due volte, nemmeno con accenti, spazi o trattini diversi', () => {
    const seen = new Map();
    for (const d of database) {
        const k = G.norm(d.word).replace(/ /g, '');
        assert.ok(!seen.has(k), `"${d.word}" doppione di "${seen.get(k)}"`);
        seen.set(k, d.word);
    }
});

test('le lettere si scompongono in NFD: niente Ø, Æ, Đ, Ł che il confronto non saprebbe leggere', () => {
    for (const d of database) {
        for (const ch of d.word) {
            if (/[ '\-.]/.test(ch)) continue;
            assert.match(ch.normalize('NFD')[0], /[A-Z0-9]/, `"${d.word}": carattere "${ch}"`);
        }
    }
});

test('la definizione non contiene la risposta (ne\' una sua parola lunga)', () => {
    // parole comuni che possono comparire nella definizione senza aiutare davvero
    const ok = new Set(['della', 'delle', 'grande', 'italia']);
    for (const d of database) {
        const def = ' ' + G.norm(d.def) + ' ';
        for (const t of G.norm(d.word).split(' ')) {
            if (t.length < 5 || ok.has(t)) continue;
            assert.ok(!def.includes(' ' + t + ' '), `"${d.word}": la definizione contiene "${t}"`);
        }
    }
});

test('fatti della stagione 2025-26 aggiornati', () => {
    assert.match(find('SPAGNA').def, /2026/);                  // Mondiale 2026 vinto in finale sull'Argentina
    assert.match(find('FERRAN TORRES').def, /2026/);
    assert.match(find('UNAI EMERY').def, /Aston Villa/);       // quinta Europa League nel 2026
    assert.match(find('PARIS SAINT-GERMAIN').def, /2026/);     // seconda Champions di fila
    assert.match(find('HARRY KANE').def, /Pallone d'Oro 2026/);
    assert.match(find('KYLIAN MBAPPÉ').def, /miglior marcatore nella storia dei Mondiali/);
    assert.match(find('CRISTIAN CHIVU').def, /2026/);
    // il vecchio record di Klose non e' piu' presentato come attuale
    assert.match(find('MIROSLAV KLOSE').def, /Mbappé/);
});

test('risposte: accenti, maiuscole, apostrofi e trattini non contano', () => {
    assert.ok(G.matches('mbappe', 'MBAPPÉ'));
    assert.ok(G.matches('kylian mbappe', 'KYLIAN MBAPPÉ'));
    assert.ok(!G.matches('eto o', "SAMUEL ETO'O"));
    assert.ok(G.matches("samuel eto'o", "SAMUEL ETO'O"));
    assert.ok(G.matches('samuel etoo', "SAMUEL ETO'O"));
    assert.ok(G.matches('tikitaka', 'TIKI-TAKA'));
    assert.ok(G.matches('calcio d inizio', "CALCIO D'INIZIO"));
    assert.ok(G.matches('Maracana', 'MARACANÃ'));
});

test('risposte: un refuso passa sulle parole lunghe, non su quelle corte', () => {
    assert.ok(G.matches('fuorigoco', 'FUORIGIOCO'));
    assert.ok(G.matches('catenacco', 'CATENACCIO'));
    assert.ok(!G.matches('pali', 'PALO'));
    assert.ok(!G.matches('gal', 'GOL'));
    assert.ok(!G.matches('', 'RIGORE'));
    assert.ok(!G.matches('rigore', ''));
});

test('a voce la parola si trova anche dentro una frase', () => {
    assert.ok(G.matches('è il rigore', 'RIGORE'));
    assert.ok(G.matches('secondo me cristiano ronaldo', 'CRISTIANO RONALDO'));
    assert.ok(!G.matches('secondo me ronaldo', 'CRISTIANO RONALDO'));
});

test('fuori di poco: un pezzo di una risposta a piu\' parole, mai la risposta intera', () => {
    assert.ok(G.nearMiss('mbappe', 'KYLIAN MBAPPÉ'));
    assert.ok(G.nearMiss('bandiera', 'GOL DELLA BANDIERA'));
    assert.ok(!G.nearMiss('kylian mbappe', 'KYLIAN MBAPPÉ'));   // e' gol, non "quasi"
    assert.ok(G.nearMiss('mole', 'DERBY DELLA MOLE'));
    assert.ok(!G.nearMiss('della', 'DERBY DELLA MOLE'));           // le preposizioni non valgono
    assert.ok(!G.nearMiss('di', 'COLPO DI TACCO'));                // parole corte: niente aiutino
    assert.ok(!G.nearMiss('rigore', 'RIGORE'));                    // una parola sola: o gol o palo
    assert.ok(!G.nearMiss('totti', 'KYLIAN MBAPPÉ'));
});

test('impostazioni salvate: valori vecchi o rotti tornano al default, il microfono non si ricorda', () => {
    assert.deepEqual(G.sanitizeCfg(null), { clock: 60, speed: 1500 });
    assert.deepEqual(G.sanitizeCfg('x'), { clock: 60, speed: 1500 });
    assert.deepEqual(G.sanitizeCfg({ clock: 120, speed: 1000, mic: true }), { clock: 60, speed: 1000 });
    assert.deepEqual(G.sanitizeCfg({ clock: 90, speed: 2200 }), { clock: 90, speed: 2200 });
    assert.deepEqual(G.sanitizeCfg({ clock: '45', speed: -1 }), { clock: 60, speed: 1500 });
});

test('bilancio tra due squadre: maiuscole e campo invertito non contano', () => {
    const games = [
        { a: 'Inter', b: 'Milan', w: 0 },
        { a: 'milan', b: 'INTER', w: 0 },   // vince il Milan, in casa
        { a: 'Milan', b: 'Inter', w: 1 },   // vince l'Inter, fuori
        { a: 'Inter', b: 'Milan', w: -1 },
        { a: 'Roma', b: 'Lazio', w: 0 }
    ];
    assert.deepEqual(G.headToHead(games, 'Inter', 'Milan'), { a: 2, b: 1, x: 1, n: 4 });
    assert.deepEqual(G.headToHead(games, 'Milan', 'Inter'), { a: 1, b: 2, x: 1, n: 4 });
    assert.deepEqual(G.headToHead(games, 'Juve', 'Toro'), { a: 0, b: 0, x: 0, n: 0 });
    assert.deepEqual(G.headToHead(undefined, 'A', 'B'), { a: 0, b: 0, x: 0, n: 0 });
});

test("il punteggio in cronaca ha l'articolo giusto", () => {
    assert.equal(G.scoreLine(0, 1), 'Si va sullo 0-1');
    assert.equal(G.scoreLine(1, 0), "Si va sull'1-0");
    assert.equal(G.scoreLine(8, 3), "Si va sull'8-3");
    assert.equal(G.scoreLine(11, 2), "Si va sull'11-2");
    assert.equal(G.scoreLine(2, 2), 'Si va sul 2-2');
    assert.equal(G.scoreLine(5, 0), 'Si va sul 5-0');
});

test('celle della parola: ogni parola del database sta su una riga anche su un telefono da 320px', () => {
    const W = 320 - 32 - 24;   // margini di pagina e del pannello
    for (const d of database) {
        const lens = d.word.split(' ').map((x) => x.length);
        const { tw, gap } = G.cellSize(lens, W, 110);
        for (const n of lens) assert.ok(n * (tw + gap) - gap <= W, `"${d.word}" esce dal pannello (${tw}px)`);
        assert.ok(tw >= 12 && tw <= 48);
    }
});

test('celle della parola: le risposte lunghe restano entro l\'altezza data, le corte usano celle grandi', () => {
    assert.equal(G.cellSize([3], 300, 200).tw, 48);
    const long = G.cellSize([5, 2, 6, 6, 3, 6], 300, 160);
    const rows = 3;   // con celle piu' piccole le sei parole vanno su poche righe
    assert.ok(long.tw * 1.12 * rows <= 160 || long.tw < 30, `celle da ${long.tw}px`);
});

test('celle della parola: su un telefono da 375px nessuna risposta scende sotto i 18px', () => {
    for (const d of database) {
        const { tw } = G.cellSize(d.word.split(' ').map((x) => x.length), 375 - 32 - 24, 170);
        assert.ok(tw >= 18, `"${d.word}": celle da ${tw}px, troppo piccole da leggere`);
    }
});

test('fuori di poco: vale anche un pezzo di piu\' parole o un cognome col trattino', () => {
    assert.ok(G.nearMiss('Milinković-Savić', 'SERGEJ MILINKOVIĆ-SAVIĆ'));
    assert.ok(G.nearMiss('della bandiera', 'GOL DELLA BANDIERA'));
    assert.ok(G.nearMiss('alexander arnold', 'TRENT ALEXANDER-ARNOLD'));
    assert.ok(!G.nearMiss('sergej milinkovic savic', 'SERGEJ MILINKOVIĆ-SAVIĆ'));
});

/* ---------- Novembre 2026 (2): cognomi, tolleranza, ritmo delle lettere ---------- */
const fs = require('node:fs');
const SURN = G.surnameIndex(database, G.NOT_PEOPLE);
const ok = (said, word) => G.accepts(said, word, SURN);

test('NOT_PEOPLE: tutte le risposte a piu\' parole fuori dalle sezioni delle persone (e solo quelle)', () => {
    const lines = fs.readFileSync(path.join(__dirname, '..', 'assets', 'db-sfidaeredita.js'), 'utf8').split(/\r?\n/);
    const PEOPLE = /Campioni|Italia ---|Stelle|Brasile|Germania|Resto|Africa|Allenatori|Arbitri/;
    const JOURNALISTS = ['GIANNI BRERA', 'NICOLÒ CAROSIO', 'NANDO MARTELLINI', 'BRUNO PIZZUL', 'FABIO CARESSA', 'SANDRO CIOTTI'];
    const not = new Set(G.NOT_PEOPLE.map(G.norm));
    let sec = '';
    lines.forEach((l) => {
        const s = l.match(/\/\/ --- (.*) ---/);
        if (s) sec = s[0];
        const w = l.match(/word: "([^"]+)"/);
        if (!w || !w[1].includes(' ')) return;
        const person = PEOPLE.test(sec) || JOURNALISTS.includes(w[1]);
        assert.equal(not.has(G.norm(w[1])), !person, `${w[1]} (${sec}): ${person ? 'e\' una persona, togliere da' : 'non e\' una persona, aggiungere a'} NOT_PEOPLE`);
    });
    G.NOT_PEOPLE.forEach((n) => assert.ok(find(n), `NOT_PEOPLE: ${n} non c'e' nel database`));
});

test('persone: basta il cognome se nessun altro nel database lo porta', () => {
    assert.ok(ok('mbappe', 'KYLIAN MBAPPÉ'));
    assert.ok(ok('de rossi', 'DANIELE DE ROSSI'));
    assert.ok(ok('derossi', 'DANIELE DE ROSSI'));
    assert.ok(ok('riquelme', 'JUAN ROMÁN RIQUELME'));
    assert.ok(ok('del piero', 'ALESSANDRO DEL PIERO'));
    assert.ok(ok('milinkovic savic', 'SERGEJ MILINKOVIĆ-SAVIĆ'));
    assert.ok(ok('maradona', 'DIEGO MARADONA'), 'lo stadio Maradona non e\' un omonimo');
    assert.ok(ok('secondo me e mbappe', 'KYLIAN MBAPPÉ'), 'a voce anche dentro una frase');
    // omonimi: serve il nome
    assert.ok(!ok('inzaghi', 'SIMONE INZAGHI'));
    assert.ok(!ok('rossi', 'PAOLO ROSSI'));
    assert.ok(!ok('rossi', 'DANIELE DE ROSSI'));
    assert.ok(!ok('ronaldo', 'CRISTIANO RONALDO'), 'c\'e\' anche Ronaldo Nazario');
    assert.ok(!ok('martinez', 'LAUTARO MARTÍNEZ'));
    assert.ok(!ok('cole', 'ASHLEY COLE'), 'c\'e\' anche Cole Palmer');
    assert.ok(ok('simone inzaghi', 'SIMONE INZAGHI'));
    // il nome di battesimo non basta mai
    assert.ok(!ok('kylian', 'KYLIAN MBAPPÉ'));
    // le cose non sono persone: un pezzo resta "fuori di poco"
    assert.ok(!ok('berlino', 'NOTTE DI BERLINO'));
    assert.ok(!ok('olimpico', 'GOL OLIMPICO'));
    assert.ok(!ok('madrid', 'REAL MADRID'));
    assert.ok(!ok('franchi', 'ARTEMIO FRANCHI'));
    assert.ok(G.nearMiss('berlino', 'NOTTE DI BERLINO'));
});

test('persone: ogni persona del database ha un nome intero che vale, e quasi tutte un cognome', () => {
    const people = Object.keys(SURN);
    assert.ok(people.length > 500, `persone: ${people.length}`);
    const withSurname = people.filter((k) => SURN[k].length > 0).length;
    assert.ok(withSurname / people.length > 0.9, `con cognome: ${withSurname}/${people.length}`);
    database.forEach((d) => assert.ok(ok(d.word, d.word), d.word));
});

test('tolleranza: niente refusi sotto le 7 lettere e mai sull\'ultima', () => {
    assert.equal(G.tolerance(6), 0);
    assert.equal(G.tolerance(7), 1);
    assert.ok(!G.matches('rossi', 'ROSSO'));
    assert.ok(!G.matches('rigori', 'RIGORE'));
    assert.ok(!G.matches('rossoneri', 'ROSSONERO'), 'ultima lettera diversa');
    assert.ok(!G.matches('fuorigioci', 'FUORIGIOCO'));
    assert.ok(G.matches('rosoneri', 'ROSSONERI'), 'una lettera mancante in mezzo, parola lunga');
    assert.ok(G.matches('fuorigoco', 'FUORIGIOCO'));
    assert.ok(!G.matches('palla', 'PALLO'));
});

test('ritmo delle lettere legato alla lunghezza: corte piu\' piano, lunghe piu\' in fretta', () => {
    G.SPEEDS.forEach((sp) => {
        assert.equal(G.letterDelay(10, sp), sp);
        assert.ok(G.letterDelay(4, sp) > sp);
        assert.ok(G.letterDelay(20, sp) < sp);
        assert.ok(G.letterDelay(2, sp) <= sp * 1.6 && G.letterDelay(40, sp) >= sp * 0.4, 'entro i limiti');
        for (let n = 3; n < 30; n++) assert.ok(G.letterDelay(n + 1, sp) <= G.letterDelay(n, sp));
    });
});

test('pagina: voce giudicata anche sui provvisori, arbitro in mano all\'altra squadra', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'games', 'sfidaeredita.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'sfidaEredita.html'), 'utf8');
    assert.match(js, /else if \(accepts\(text, G\.word\.word, SURNAMES\)\)/, 'il provvisorio giusto deve dare gol');
    assert.match(js, /setInterval\(revealLetter, letterDelay\(/);
    assert.match(html, /id="ref-who"/);
    assert.match(js, /G\.teams\[1 - G\.turn\]/);
});
