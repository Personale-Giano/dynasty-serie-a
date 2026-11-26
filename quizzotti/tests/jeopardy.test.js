/* Jeopardy (assets/db-jeopardy.js + assets/games/jeopardy.js): ogni casella
   del tabellone ha abbastanza domande per due tempi e un gran finale, niente
   domande ripetute, testi puliti, e ogni elemento che lo script cerca nella
   pagina esiste davvero in Jeopardy.html. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const { jeopardyData } = require(path.join(root, 'assets', 'db-jeopardy.js'));
const TIERS = [100, 200, 300, 400, 500];

test('db-jeopardy.js: 20 domande per ogni casella (categoria + valore)', () => {
    for (const cat of jeopardyData) {
        for (const t of TIERS) {
            const n = cat.questions.filter((q) => q.value === t).length;
            assert.equal(n, 20, `"${cat.category}" ${t}: ${n} domande invece di 20`);
        }
    }
});

test('db-jeopardy.js: nessuna domanda ripetuta, in tutto il database', () => {
    const seen = new Map();
    for (const cat of jeopardyData) {
        for (const q of cat.questions) {
            const key = q.question.trim().toLowerCase().replace(/\s+/g, ' ');
            assert.ok(!seen.has(key), `domanda ripetuta in "${cat.category}" e "${seen.get(key)}": ${q.question}`);
            seen.set(key, cat.category);
        }
    }
});

test('db-jeopardy.js: testi puliti (punto di domanda, niente spazi doppi, nomi categoria unici)', () => {
    assert.equal(new Set(jeopardyData.map((c) => c.category)).size, jeopardyData.length);
    for (const cat of jeopardyData) {
        for (const q of cat.questions) {
            assert.ok(/\?$/.test(q.question.trim()), `manca il punto di domanda: ${q.question}`);
            assert.ok(!/ {2}/.test(q.question) && !/ {2}/.test(q.answer), `spazi doppi: ${q.question}`);
            assert.ok(q.answer.trim().length > 0 && q.answer === q.answer.trim(), `risposta vuota o con spazi: ${q.question}`);
            assert.ok(q.question.length <= 170, `domanda troppo lunga per il maxischermo (${q.question.length}): ${q.question}`);
        }
    }
});

test('games/jeopardy.js: compila e trova nella pagina tutti gli id che usa', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'games', 'jeopardy.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'jeopardy.js' }));
    const html = fs.readFileSync(path.join(root, 'Jeopardy.html'), 'utf8');
    const ids = new Set();
    for (const m of js.matchAll(/\$\('#([a-z][\w-]*\w)['\s]/g)) ids.add(m[1]);
    ['steal', 'double', 'final'].forEach((k) => ids.add('opt-' + k)); // costruiti con 'opt-' + k
    assert.ok(ids.size > 20, 'troppi pochi id trovati: la regex non funziona piu');
    const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
    assert.deepEqual(missing, [], `id usati dallo script ma assenti nella pagina: ${missing.join(', ')}`);
});

/* ---------- Il motore: pezzi presi dal sorgente ed eseguiti in una sandbox ---------- */
const ENGINE = fs.readFileSync(path.join(root, 'assets', 'games', 'jeopardy.js'), 'utf8');

/** Il sorgente di `function name(...) {...}` (conta le graffe saltando stringhe e commenti). */
function fnSrc(name) {
    const start = ENGINE.indexOf('function ' + name + '(');
    assert.ok(start >= 0, `funzione ${name} non trovata`);
    let i = ENGINE.indexOf('{', start), depth = 0, q = null;
    for (; i < ENGINE.length; i++) {
        const ch = ENGINE[i];
        if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
        if (ch === "'" || ch === '"') q = ch;
        else if (ch === '/' && ENGINE[i + 1] === '/') i = ENGINE.indexOf('\n', i);
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return ENGINE.slice(start, i + 1);
    }
    throw new Error('graffe sbilanciate in ' + name);
}

/** Esegue le funzioni indicate in un contesto con le variabili date e restituisce il contesto. */
function sandbox(names, ctx) {
    const c = vm.createContext(Object.assign({}, ctx));
    vm.runInContext(names.map(fnSrc).join('\n') + '\n', c);
    return c;
}

const fakeQZ = {
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    fmt: (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
    icon: () => '', clamp: (v, a, b) => Math.max(a, Math.min(b, v))
};

test('games/jeopardy.js: blocco di ~400 ms contro il doppio tocco su ogni bottone che cambia', () => {
    const guard = Number((ENGINE.match(/var TAP_GUARD = (\d+);/) || [])[1]);
    assert.ok(guard >= 300 && guard <= 600, `TAP_GUARD fuori misura: ${guard}`);
    // chi riceve un tocco controlla il blocco...
    ['openCell', 'reveal', 'onJudge', 'book', 'wagerGo', 'onFinalGo', 'onFinalClick', 'finalReveal'].forEach((f) => {
        assert.match(fnSrc(f), /locked\(\)/, `${f} non controlla il blocco anti doppio tocco`);
    });
    // ...e chi cambia i bottoni lo riarma
    ['openCell', 'reveal', 'judge', 'wagerGo', 'setGo', 'book'].forEach((f) => {
        assert.match(fnSrc(f), /lock\(\);/, `${f} non riarma il blocco`);
    });
    // la scadenza del tempo scopre la risposta anche dentro il blocco
    assert.match(ENGINE, /S\.timeUp = true;\s*reveal\(true\);/);
    assert.match(ENGINE, /finalReveal\(true\);/);
});

test('games/jeopardy.js: la rubata si prenota a risposta coperta e si giudica dopo', () => {
    // la risposta si scopre in un solo punto, e la prenotazione vale solo prima
    assert.equal(ENGINE.split("$('#q-ans').hidden = false").length - 1, 1);
    assert.match(fnSrc('reveal'), /\$\('#q-ans'\)\.hidden = false/);
    assert.match(fnSrc('book'), /S\.phase !== 'question'/);
    assert.match(fnSrc('showQuestion'), /\$\('#steal-book'\)\.hidden = !S\.q\.canSteal/);
    // sbagliata con una prenotazione: si giudica la rubata; sbagliata anche quella costa come un errore
    assert.match(fnSrc('judge'), /if \(thief >= 0\) \{[\s\S]*S\.phase = 'steal-judge'/);
    const steal = fnSrc('judgeSteal');
    assert.match(steal, /t\.wrong\+\+;\s*if \(S\.o\.penalty\) addScore\(j, -S\.q\.points\);/);
    assert.match(steal, /S\.q\.cell\.by = j;\s*addScore\(j, S\.q\.points\);/);
    // niente rubata sulla doppia posta
    assert.match(fnSrc('openCell'), /canSteal = S\.o\.steal && S\.teams\.length > 1 && !isDouble/);
});

test('games/jeopardy.js: doppia posta, si punta da 0 al massimo tra punteggio e casella piu\' alta', () => {
    const c = sandbox(['wagerMax', 'mult'], { TIERS: [100, 200, 300, 400, 500], S: { round: 1 } });
    assert.equal(c.wagerMax({ score: -300 }), 500);
    assert.equal(c.wagerMax({ score: 1700 }), 1700);
    c.S.round = 2;
    assert.equal(c.wagerMax({ score: 300 }), 1000);
    // la puntata sbagliata si perde sempre, anche con "Non perde nulla"
    assert.match(fnSrc('judge'), /var pays = S\.o\.penalty \|\| S\.q\.double;/);
});

test('games/jeopardy.js: secondo tempo con categorie nuove solo se ce ne sono abbastanza', () => {
    const cats = (n) => Array.from({ length: n }, (_, i) => 'C' + i);
    const c = sandbox(['freshCats'], { CATS: cats(14), S: { cats: cats(5) } });
    assert.deepEqual(Array.from(c.freshCats()), cats(14).slice(5));
    c.CATS = cats(9);
    assert.equal(c.freshCats(), null, '9 categorie e 5 in gioco: 4 nuove non bastano');
    c.S.cats = cats(4);
    assert.equal(c.freshCats().length, 5);
});

test('games/jeopardy.js: le foto delle categorie in gioco si precaricano, poche alla volta e una volta sola', () => {
    const made = [];
    function FakeImage() { made.push(this); }
    const POOL = [
        { cat: 'A', img: 'a1.webp' }, { cat: 'A', img: 'a2.webp' }, { cat: 'A', img: null }, { cat: 'A', img: 'a1.webp' },
        { cat: 'B', img: 'b1.webp' }, { cat: 'C', img: 'c1.webp' }, { cat: 'A', img: 'a3.webp' }, { cat: 'A', img: 'a4.webp' }
    ];
    const c = sandbox(['preloadPhotos', 'pumpPreload'], { POOL, window: { Image: FakeImage } });
    vm.runInContext('var preloaded = {}, preloadQueue = [], preloadBusy = 0, preloadKeep = [];', c);
    c.preloadPhotos(['A', 'B']);
    assert.equal(made.length, 3, 'al massimo tre download insieme');
    let im;
    while ((im = made.find((x) => !x.done))) { im.done = true; im.onload(); }
    assert.deepEqual(made.map((x) => x.src).sort(), ['a1.webp', 'a2.webp', 'a3.webp', 'a4.webp', 'b1.webp']);
    c.preloadPhotos(['A', 'C']);
    assert.deepEqual(made.slice(5).map((x) => x.src), ['c1.webp'], 'una foto gia\' scaricata non si riscarica');
    assert.match(fnSrc('renderBoard'), /preloadPhotos\(S\.cats\)/);
});

test('games/jeopardy.js: il gran finale si salva (domanda, puntate, esiti) e si riprende', () => {
    const teams = [{ name: 'A', score: 900 }, { name: 'B', score: 100 }];
    const c = sandbox(['snapshot', 'validFin'], {
        FIN_STAGES: ['final-bet', 'final-q', 'final-judge', 'final-done'], CATS: ['SERIE A', 'CALCIO'],
        S: {
            phase: 'final-q', o: {}, round: 1, rounds: 1, cats: ['SERIE A', 'CALCIO'], teams, active: 0, asked: 25, cells: {}, doubleKey: null,
            fin: { item: { cat: 'SERIE A', q: 'Domanda?', a: 'Risposta' }, bets: [700, null], res: [null, null] }
        }
    });
    const d = JSON.parse(JSON.stringify(c.snapshot('final')));
    assert.deepEqual(d.fin, { stage: 'final-q', cat: 'SERIE A', q: 'Domanda?', a: 'Risposta', bets: [700, null], res: [null, null] });
    assert.equal(c.snapshot('board').fin, undefined, 'fuori dal finale niente blocco fin');
    assert.equal(c.validFin(d.fin, 2), true);
    // vecchi salvataggi (senza fin) o rovinati: il finale riparte da capo invece di rompersi
    assert.equal(c.validFin(undefined, 2), false);
    assert.equal(c.validFin(Object.assign({}, d.fin, { bets: [700] }), 2), false);
    assert.equal(c.validFin(Object.assign({}, d.fin, { bets: [-5, null] }), 2), false);
    assert.equal(c.validFin(Object.assign({}, d.fin, { stage: 'boh' }), 2), false);
    assert.equal(c.validFin(Object.assign({}, d.fin, { cat: 'INVENTATA' }), 2), false);
    assert.match(fnSrc('resume'), /if \(validFin\(d\.fin, S\.teams\.length\)\) resumeFinal\(d\.fin\);\s*else startFinal\(\);/);
    // dopo aver dato i punti si salva lo stato chiuso: una ricarica non li ridà
    assert.match(fnSrc('resumeFinal'), /f\.stage === 'final-done'\) \{ finish\(\);/);
    assert.match(fnSrc('finalSettle'), /save\('final'\)/);
});

test('games/jeopardy.js: le puntate del gran finale restano nascoste fino alla risposta', () => {
    const html = {}, go = { disabled: false };
    const c = sandbox(['renderBets', 'missingBets', 'plural'], {
        QZ: fakeQZ, $: (sel) => (sel === '#f-go' ? go : { set innerHTML(v) { html[sel] = v; } }),
        S: { phase: 'final-bet', teams: [{ name: 'Rossi', score: 2700, color: '#f00' }, { name: 'Verdi', score: 300, color: '#0f0' }], fin: { bets: [1850, null], res: [null, null] } }
    });
    c.renderBets();
    assert.doesNotMatch(html['#f-bets'], /1\.850/, 'la cifra si vede prima della risposta');
    assert.match(html['#f-bets'], /puntata fatta/);
    assert.match(html['#f-bets'], /manca la puntata/);
    c.S.phase = 'final-judge';
    c.renderBets();
    assert.match(html['#f-bets'], /punta 1\.850/);
    assert.match(html['#f-bets'], /data-betset="1"/, 'la puntata scritta sul foglio si inserisce dopo');
    assert.doesNotMatch(html['#f-bets'], /data-betset="0"/, 'dopo la risposta una puntata fatta non si cambia piu\'');
    assert.equal(go.disabled, true);
    c.S.fin.bets[1] = 300;
    c.S.fin.res = [true, false];
    c.renderBets();
    assert.equal(go.disabled, false);
});

test('games/jeopardy.js: comandi della puntata (±100, ±500, metà, tutto, cifra scritta)', () => {
    const b = fnSrc('betControl');
    ["'-500'", "'-100'", "'100'", "'500'", "'half'", "'all'"].forEach((d) => assert.ok(b.includes(d), `manca il comando ${d}`));
    assert.match(b, /type="number" inputmode="numeric"/);
    assert.match(b, /QZ\.clamp\(Math\.round\(Number\(n\) \|\| 0\), 0, max\)/);
});

test('db-jeopardy.js: risposte varie (Milan, Real Madrid e Inter al massimo 8 volte) e niente domande a scelta tra due', () => {
    const count = new Map();
    for (const cat of jeopardyData) {
        for (const q of cat.questions) {
            const a = q.answer.replace(/\s*\(.*?\)\s*/g, ' ').trim();
            count.set(a, (count.get(a) || 0) + 1);
            const ans = a.toLowerCase().replace(/^(il|la|lo|l'|i|gli|le|un|una|con|senza) /, '');
            const binary = ans.length > 1 && / o /.test(q.question) && q.question.toLowerCase().includes(ans);
            assert.ok(!binary, `domanda a scelta tra due: ${q.question}`);
        }
    }
    ['Milan', 'Real Madrid', 'Inter'].forEach((t) => assert.ok((count.get(t) || 0) <= 8, `${t}: ${count.get(t)} risposte`));
    const top = [...count.entries()].sort((x, y) => y[1] - x[1])[0];
    assert.ok(top[1] <= 12, `risposta troppo frequente: ${top[0]} (${top[1]})`);
});
