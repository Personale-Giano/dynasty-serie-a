/* Verifica di integrita' per i database dedicati di ciascun gioco
   (assets/db-*.js). Ogni gioco ha uno schema diverso perche' le modalita'
   sono diverse; qui si controlla che ogni file si carichi senza errori,
   esponga dati non vuoti e non contenga id/voci duplicate dove rilevante. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
    return require(path.join('..', 'assets', file));
}

function noDuplicates(list, label) {
    const dup = list.filter((v, i) => list.indexOf(v) !== i);
    assert.deepEqual(dup, [], `${label}: valori duplicati -> ${[...new Set(dup)].join(', ')}`);
}

test('db-cvem.js: domande per livello 1-15, correctAnswer in ABCD', () => {
    const { questions } = load('db-cvem.js');
    assert.ok(questions.length >= 100);
    questions.forEach((q) => {
        assert.ok(q.level >= 1 && q.level <= 15, `livello fuori range: ${q.level}`);
        assert.ok(['A', 'B', 'C', 'D'].includes(q.correctAnswer), `correctAnswer non valido: ${q.correctAnswer}`);
        assert.ok(q.options && q.options[q.correctAnswer], 'opzione corrispondente a correctAnswer assente');
    });
});

test('db-avantiunaltro.js: 120 domande con correct A/B', () => {
    const { fullDatabase } = load('db-avantiunaltro.js');
    assert.equal(fullDatabase.length, 120);
    fullDatabase.forEach((q) => {
        assert.ok(['A', 'B'].includes(q.correct), `correct non valido: ${q.correct}`);
        assert.ok(q.a && q.b, 'opzioni a/b mancanti');
    });
});

test('db-bomba.js: elenco di argomenti senza duplicati, ciascuno con categoria', () => {
    const { topics } = load('db-bomba.js');
    assert.ok(topics.length > 100);
    noDuplicates(topics.map((t) => t.topic), 'topics');
    topics.forEach((t) => {
        assert.ok(typeof t.topic === 'string' && t.topic.length > 0, 'argomento vuoto o non valido');
        assert.ok(typeof t.categoria === 'string' && t.categoria.length > 0, `categoria mancante per "${t.topic}"`);
    });
    const categorie = new Set(topics.map((t) => t.categoria));
    assert.ok(categorie.size >= 15, `attese almeno 15 categorie, trovate ${categorie.size}`);
});

test('db-citazioni.js: citazioni con risposta corretta tra le opzioni', () => {
    const { quotes } = load('db-citazioni.js');
    assert.ok(quotes.length > 100);
    quotes.forEach((q) => {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, `opzioni insufficienti per "${q.quote}"`);
        assert.ok(q.options.includes(q.correct), `risposta "${q.correct}" non tra le opzioni di "${q.quote}"`);
    });
});

test('db-giocatoributget.js: giocatori con ruolo e valore validi', () => {
    const { playersDatabase } = load('db-giocatoributget.js');
    assert.ok(playersDatabase.length > 500);
    const ruoliValidi = ['ATT', 'CEN', 'DIF', 'POR'];
    playersDatabase.forEach((p) => {
        assert.ok(ruoliValidi.includes(p.role), `ruolo non valido: ${p.role} (${p.name})`);
        assert.ok(typeof p.value === 'number' && p.value > 0, `valore non valido per ${p.name}: ${p.value}`);
    });
});

test('db-intesavincente.js: parole senza duplicati', () => {
    const { words } = load('db-intesavincente.js');
    assert.ok(words.length > 500, `attese piu di 500 parole, trovate ${words.length}`);
    noDuplicates(words, 'words');
});

test('db-jeopardy.js: 9 categorie x 50 domande, tutte con value 100-500', () => {
    const { jeopardyData } = load('db-jeopardy.js');
    assert.equal(jeopardyData.length, 9);
    const valoriAmmessi = [100, 200, 300, 400, 500];
    jeopardyData.forEach((cat) => {
        assert.equal(cat.questions.length, 50, `categoria "${cat.category}" non ha 50 domande`);
        cat.questions.forEach((q) => {
            assert.ok(valoriAmmessi.includes(q.value), `valore non valido in "${cat.category}": ${q.value}`);
            assert.ok(q.question && q.answer, `domanda o risposta mancante in "${cat.category}"`);
        });
    });
});

test('db-mrwhite.js: nomi calciatori senza duplicati ne voci scherzo residue', () => {
    const { wordsList } = load('db-mrwhite.js');
    assert.ok(wordsList.length > 200);
    noDuplicates(wordsList, 'wordsList');
    const sospette = wordsList.filter((w) => /tung tung|bandito|bananini|patapim|trallalero|sei mr\.?white/i.test(w));
    assert.deepEqual(sospette, [], `voci scherzo residue: ${sospette.join(', ')}`);
});

test('db-taboo.js: ogni voce ha parola, categoria e almeno 3 parole vietate', () => {
    const { tabooWords } = load('db-taboo.js');
    assert.ok(tabooWords.length > 400);
    noDuplicates(tabooWords.map((t) => t.word), 'tabooWords');
    tabooWords.forEach((t) => {
        assert.ok(t.word && t.word.length > 0);
        assert.ok(typeof t.categoria === 'string' && t.categoria.length > 0, `categoria mancante per "${t.word}"`);
        assert.ok(Array.isArray(t.taboo) && t.taboo.length >= 3, `"${t.word}" ha meno di 3 parole vietate`);
    });
    const categorie = new Set(tabooWords.map((t) => t.categoria));
    assert.ok(categorie.size >= 15, `attese almeno 15 categorie, trovate ${categorie.size}`);
});

test('db-sfidaeredita.js: parola/definizione senza duplicati', () => {
    const { database } = load('db-sfidaeredita.js');
    assert.ok(database.length > 400);
    database.forEach((d) => {
        assert.ok(d.word && d.def, `voce incompleta: ${JSON.stringify(d)}`);
    });
    noDuplicates(database.map((d) => d.word), 'parole sfidaeredita');
});

test('db-cruciverba.js: parole A-Z 3-13, definizioni brevi senza la risposta, categorie e difficolta valide', () => {
    const { cruciverba } = load('db-cruciverba.js');
    assert.ok(cruciverba.length >= 700, `attese almeno 700 voci, trovate ${cruciverba.length}`);
    const categorie = ['Calciatori', 'Allenatori', 'Squadre', 'Nazionali', 'Stadi', 'Coppe e trofei',
        'Soprannomi', 'Gergo e regole', 'Storia', 'Presidenti e dirigenti', 'Curiosità'];
    const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    cruciverba.forEach((e) => {
        assert.match(e.answer, /^[A-Z]{3,13}$/, `risposta non valida: ${e.answer}`);
        assert.ok(typeof e.clue === 'string' && e.clue.trim().length > 0, `definizione vuota per ${e.answer}`);
        assert.ok(e.clue.length <= 80, `definizione troppo lunga per ${e.answer} (${e.clue.length})`);
        assert.ok(!norm(e.clue).includes(e.answer), `la definizione contiene la risposta: ${e.answer}`);
        assert.ok(categorie.includes(e.cat), `categoria non valida per ${e.answer}: ${e.cat}`);
        assert.ok([1, 2, 3].includes(e.diff), `diff non valida per ${e.answer}: ${e.diff}`);
    });
    noDuplicates(cruciverba.map((e) => e.answer), 'risposte cruciverba');
});
