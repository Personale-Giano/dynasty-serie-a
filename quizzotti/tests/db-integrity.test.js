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

const TEMI = ['nazionale', 'champions', 'mondiali', 'bandiere', 'mercato', 'bar', 'stadi'];

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
        if (e.temi !== undefined) {
            assert.ok(Array.isArray(e.temi) && e.temi.length > 0, `temi non validi per ${e.answer}`);
            e.temi.forEach((t) => assert.ok(TEMI.includes(t), `tema sconosciuto per ${e.answer}: ${t}`));
            noDuplicates(e.temi, `temi di ${e.answer}`);
        }
    });
    noDuplicates(cruciverba.map((e) => e.answer), 'risposte cruciverba');
    // ogni tema ha abbastanza parole per costruire una scheda
    for (const t of TEMI) {
        const n = cruciverba.filter((e) => (e.temi || []).includes(t)).length;
        assert.ok(n >= 45, `tema ${t}: solo ${n} parole candidate (servono almeno 45)`);
    }
});

test('cruciverba-schede.js: 7 schede a tema coerenti, risposte uniche e prese dal database', () => {
    const { cruciverbaSchede } = load('cruciverba-schede.js');
    const { cruciverba } = load('db-cruciverba.js');
    const clueOf = new Map(cruciverba.map((x) => [x.answer, x.clue]));
    const temiOf = new Map(cruciverba.map((x) => [x.answer, x.temi || []]));
    assert.equal(cruciverbaSchede.length, 7);
    assert.deepEqual(cruciverbaSchede.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7]);
    noDuplicates(cruciverbaSchede.map((p) => p.tema), 'temi delle schede');
    const allAnswers = [];
    for (const p of cruciverbaSchede) {
        const tag = `N° ${p.n}`;
        assert.ok(p.title && typeof p.title === 'string', `${tag}: titolo mancante`);
        assert.ok(TEMI.includes(p.tema), `${tag}: tema non valido ${p.tema}`);
        assert.ok(p.sottotitolo && typeof p.sottotitolo === 'string', `${tag}: sottotitolo mancante`);
        const themed = p.words.filter((w) => (temiOf.get(w.answer) || []).includes(p.tema)).length;
        assert.ok(themed >= 9, `${tag}: solo ${themed} parole a tema ${p.tema} (ne servono almeno 9)`);
        assert.ok(p.w >= 3 && p.w <= 15 && p.h >= 3 && p.h <= 15, `${tag}: misure fuori range ${p.w}x${p.h}`);
        assert.ok(p.words.length >= 12, `${tag}: troppe poche parole`);
        const cells = new Map(); // "r,c" -> { ch, A, D }
        p.words.forEach((w, i) => {
            assert.match(w.answer, /^[A-Z]{3,15}$/, `${tag}: risposta non valida ${w.answer}`);
            assert.ok(w.dir === 'A' || w.dir === 'D', `${tag}: verso non valido`);
            assert.equal(clueOf.get(w.answer), w.clue, `${tag}: ${w.answer} assente dal database o con definizione diversa`);
            const [dr, dc] = w.dir === 'A' ? [0, 1] : [1, 0];
            const endR = w.row + dr * (w.answer.length - 1), endC = w.col + dc * (w.answer.length - 1);
            assert.ok(w.row >= 0 && w.col >= 0 && endR < p.h && endC < p.w, `${tag}: ${w.answer} esce dalla griglia`);
            for (let k = 0; k < w.answer.length; k++) {
                const key = (w.row + dr * k) + ',' + (w.col + dc * k);
                const cell = cells.get(key) || { ch: w.answer[k] };
                assert.equal(cell.ch, w.answer[k], `${tag}: incrocio con lettere diverse in ${key}`);
                assert.equal(cell[w.dir], undefined, `${tag}: due parole sovrapposte nello stesso verso in ${key}`);
                cell[w.dir] = i;
                cells.set(key, cell);
            }
            // prima e dopo la parola non ci sono lettere (parola "chiusa")
            for (const [r, c] of [[w.row - dr, w.col - dc], [endR + dr, endC + dc]]) {
                assert.ok(!p.words.some((o) => o !== w && covers(o, r, c)), `${tag}: ${w.answer} non e' delimitata`);
            }
        });
        // ogni parola ne incrocia almeno un'altra
        p.words.forEach((w, i) => {
            const crosses = [...cells.values()].some((c) => c.A !== undefined && c.D !== undefined && (c.A === i || c.D === i));
            assert.ok(crosses, `${tag}: ${w.answer} non incrocia nessuna parola`);
        });
        // numerazione da cruciverba: scansione per righe delle caselle iniziali
        const starts = [...new Set(p.words.map((w) => w.row * p.w + w.col))].sort((a, b) => a - b);
        p.words.forEach((w) => assert.equal(w.num, starts.indexOf(w.row * p.w + w.col) + 1, `${tag}: numero sbagliato per ${w.answer}`));
        // nessuna parola accidentale: ogni sequenza di 2+ lettere in riga/colonna e' una parola della scheda
        for (const [dir, dr, dc] of [['A', 0, 1], ['D', 1, 0]]) {
            for (const [key, cell] of cells) {
                const [r, c] = key.split(',').map(Number);
                if (cells.has((r - dr) + ',' + (c - dc)) || !cells.has((r + dr) + ',' + (c + dc))) continue;
                assert.ok(cell[dir] !== undefined && p.words[cell[dir]].row === r && p.words[cell[dir]].col === c, `${tag}: sequenza di lettere senza definizione da ${key} (${dir})`);
            }
        }
        allAnswers.push(...p.words.map((w) => w.answer));
    }
    noDuplicates(allAnswers, 'cruciverba-schede.js');

    function covers(w, r, c) {
        return w.dir === 'A' ? r === w.row && c >= w.col && c < w.col + w.answer.length
            : c === w.col && r >= w.row && r < w.row + w.answer.length;
    }
});
