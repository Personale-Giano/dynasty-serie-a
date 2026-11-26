#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Domande di «Tutti contro la TV»
   Le domande le sceglie il server (api/tuttitv.php), cosi' la risposta giusta
   non arriva mai ai telefoni prima della fine della domanda: per questo il PHP
   legge un file JSON e non i database JavaScript del sito.
   Questo script costruisce api/tuttitv-domande.json da:
     assets/questions-data.js  (QUIZ_DB: domanda, opzioni[], risposta, difficolta, categoria)
     assets/db-cvem.js         (questions: level 1-15, question, options A-D, correctAnswer)
   Solo domande a 4 opzioni; i doppioni (stesso testo) si tengono una volta.
   Ogni voce: id, testo, opzioni[4], giusta (indice 0-3), difficolta (1-3), tema.
   Un test (tests/tuttitv.test.js) controlla che il file sia aggiornato.

   Uso: node scripts/build-tuttitv.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'api', 'tuttitv-domande.json');

/** I temi, nell'ordine in cui compaiono nella sala d'attesa. */
const THEMES = [
    { id: 'seriea', name: 'Serie A' },
    { id: 'coppe', name: 'Champions e coppe' },
    { id: 'nazionali', name: 'Nazionali e Mondiali' },
    { id: 'estero', name: 'Calcio estero' },
    { id: 'mercato', name: 'Calciomercato' },
    { id: 'storia', name: 'Storia e record' },
    { id: 'simboli', name: 'Stemmi e soprannomi' },
    { id: 'curiosita', name: 'Curiosità e regole' }
];

const FROM_CATEGORY = {
    'Mondiali': 'nazionali',
    'Champions League': 'coppe',
    'Calciomercato': 'mercato',
    'Record': 'storia',
    'Storia': 'storia',
    'Loghi': 'simboli',
    'Curiosita': 'curiosita'
};

const RE = {
    coppe: /Champions|Coppa dei Campioni|Europa League|Coppa UEFA|Coppa delle Coppe|Conference League|Supercoppa europea|Supercoppa UEFA|Intercontinentale|Mondiale per club|Mitropa|Pallone d'Oro/i,
    nazionali: /Mondial|Europe[oi]|nazionale|Azzurri|Nations League|Copa Am[eé]rica|Coppa d'Africa|Coppa d'Asia|ct\b|commissario tecnico/i,
    mercato: /mercato|acquist|ceduto|cessione|trasferiment|prestito|clausola|milioni di euro|pagat/i,
    curiosita: /regol|cartellin|arbitr|fuorigioco|\bVAR\b|calcio di rigore|tempi supplementari|intervallo|giocatori per squadra|sostituzion|guardalinee|dischetto|corner|calcio d'angolo|rimessa/i,
    seriea: /Serie A|scudett|Coppa Italia|Serie B|campionato italiano|Supercoppa italiana|\b(Juventus|Inter|Milan|Napoli|Roma|Lazio|Fiorentina|Torino|Atalanta|Bologna|Genoa|Sampdoria|Udinese|Parma|Verona|Cagliari|Lecce|Sassuolo|Empoli|Como|Monza)\b/i,
    estero: /Premier|Liga\b|Bundesliga|Ligue 1|Eredivisie|Real Madrid|Barcellona|Bayern|Manchester|Liverpool|Chelsea|Arsenal|PSG|Paris Saint|Ajax|Benfica|Porto|Borussia|Atl[eé]tico|Celtic|Boca|River/i
};

function themeOf(text, category) {
    if (category && FROM_CATEGORY[category]) return FROM_CATEGORY[category];
    for (const id of ['coppe', 'nazionali', 'mercato', 'curiosita']) if (RE[id].test(text)) return id;
    // un anno prima del 1990 nella domanda: e' storia
    const years = (text.match(/\b(18|19)\d\d\b/g) || []).map(Number);
    if (years.some((y) => y < 1990)) return 'storia';
    if (RE.seriea.test(text)) return 'seriea';
    if (RE.estero.test(text)) return 'estero';
    return category === 'Campionati' ? 'seriea' : 'curiosita';
}

function clean(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function key(s) { return clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }

function load() {
    const QUIZ_DB = require(path.join(ROOT, 'assets', 'questions-data.js'));
    const { questions } = require(path.join(ROOT, 'assets', 'db-cvem.js'));
    const out = [];
    const seen = new Set();
    const add = (q) => {
        const k = key(q.testo);
        if (seen.has(k)) return;
        if (q.opzioni.length !== 4 || q.opzioni.some((o) => !o) || q.giusta < 0 || q.giusta > 3) return;
        if (new Set(q.opzioni.map(key)).size !== 4) return;
        seen.add(k);
        out.push(q);
    };
    const DIFF = { facile: 1, medio: 2, difficile: 3 };
    QUIZ_DB.forEach((q) => {
        if (!Array.isArray(q.opzioni) || q.opzioni.length !== 4) return;
        // la categoria «Campionati» mescola Serie A ed estero: decide il testo
        const cat = q.categoria === 'Campionati' ? null : q.categoria;
        const all = q.domanda + ' ' + q.opzioni.join(' ');
        add({
            id: 'qd-' + q.id,
            testo: clean(q.domanda),
            opzioni: q.opzioni.map(clean),
            giusta: q.risposta,
            difficolta: DIFF[q.difficolta] || 2,
            tema: cat ? themeOf(all, cat) : (RE.seriea.test(q.domanda) || !RE.estero.test(all) ? 'seriea' : 'estero')
        });
    });
    questions.forEach((q) => {
        const letters = ['A', 'B', 'C', 'D'];
        const opzioni = letters.map((l) => clean(q.options[l] || ''));
        const testo = clean(q.question);
        add({
            id: 'mi-' + crypto.createHash('sha1').update(testo).digest('hex').slice(0, 8),
            testo,
            opzioni,
            giusta: letters.indexOf(q.correctAnswer),
            difficolta: q.level <= 5 ? 1 : q.level <= 10 ? 2 : 3,
            tema: themeOf(testo + ' ' + opzioni.join(' '))
        });
    });
    return out;
}

/** Il testo del file: una domanda per riga, cosi' i cambiamenti si leggono nel diff. */
function build() {
    const qs = load();
    const used = new Set(qs.map((q) => q.tema));
    const themes = THEMES.filter((t) => used.has(t.id)).map((t) => ({ id: t.id, name: t.name, n: qs.filter((q) => q.tema === t.id).length }));
    const lines = qs.map((q) => '    ' + JSON.stringify(q));
    return '{\r\n  "note": "Generato da scripts/build-tuttitv.js: non modificare a mano",\r\n' +
        '  "themes": ' + JSON.stringify(themes) + ',\r\n' +
        '  "questions": [\r\n' + lines.join(',\r\n') + '\r\n  ]\r\n}\r\n';
}

module.exports = { build, themeOf, THEMES, OUT };

if (require.main === module) {
    const txt = build();
    fs.writeFileSync(OUT, txt, 'utf8');
    const data = JSON.parse(txt);
    console.log(`${data.questions.length} domande in ${path.relative(ROOT, OUT)}`);
    data.themes.forEach((t) => {
        const d = [1, 2, 3].map((x) => data.questions.filter((q) => q.tema === t.id && q.difficolta === x).length);
        console.log(`  ${t.name.padEnd(24)} ${String(t.n).padStart(4)}  (facili ${d[0]}, medie ${d[1]}, difficili ${d[2]})`);
    });
}
