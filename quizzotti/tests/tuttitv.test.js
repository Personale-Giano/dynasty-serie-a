/* Tutti contro la TV: file delle domande aggiornato e pulito, pagina con tutti
   gli id usati dallo script, imprevisti uguali tra client e server, e le regole
   della stanza (api/tuttitv-core.php) provate con PHP se ce n'e' uno sul
   computer (variabile PHP_BIN o il PHP dell'Istituto). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n');
const builder = require(path.join(root, 'scripts', 'build-tuttitv.js'));

test('api/tuttitv-domande.json è aggiornato (node scripts/build-tuttitv.js)', () => {
    assert.equal(lf(read('api/tuttitv-domande.json')), lf(builder.build()),
        'il file delle domande non corrisponde ai database: rilancia node scripts/build-tuttitv.js');
});

test('api/tuttitv-domande.json: domande a 4 opzioni, id unici, temi noti', () => {
    const data = JSON.parse(read('api/tuttitv-domande.json'));
    const qs = data.questions;
    assert.ok(qs.length >= 400, `troppe poche domande: ${qs.length}`);
    assert.equal(new Set(qs.map((q) => q.id)).size, qs.length, 'id doppi');
    const themes = new Set(data.themes.map((t) => t.id));
    assert.ok(themes.size >= 5);
    qs.forEach((q) => {
        assert.match(q.id, /^(qd|mi)-[\w-]+$/);
        assert.ok(q.testo.length >= 10, q.id);
        assert.equal(q.opzioni.length, 4, q.id);
        assert.equal(new Set(q.opzioni).size, 4, `opzioni uguali in ${q.id}`);
        assert.ok(Number.isInteger(q.giusta) && q.giusta >= 0 && q.giusta <= 3, q.id);
        assert.ok([1, 2, 3].includes(q.difficolta), q.id);
        assert.ok(themes.has(q.tema), `${q.id}: tema ${q.tema}`);
    });
    data.themes.forEach((t) => assert.equal(t.n, qs.filter((q) => q.tema === t.id).length, t.id));
    // ogni difficolta' ha abbastanza domande per la partita piu' lunga (6 round: 35)
    [1, 2, 3].forEach((d) => assert.ok(qs.filter((q) => q.difficolta === d).length >= 35, `difficoltà ${d}`));
});

test('build-tuttitv.js: i temi si ricavano dal testo delle domande del Milionario', () => {
    assert.equal(builder.themeOf('Chi ha vinto la Champions League 2010?'), 'coppe');
    assert.equal(builder.themeOf('Chi era il ct dell\'Italia campione del Mondiale 2006?'), 'nazionali');
    assert.equal(builder.themeOf('Quale squadra vinse lo scudetto 1924-25?'), 'storia');
    assert.equal(builder.themeOf('Di che colore è il cartellino per l\'espulsione?'), 'curiosita');
    assert.equal(builder.themeOf('Quante volte ha vinto lo scudetto il Napoli?'), 'seriea');
});

test('le domande con le risposte non sono leggibili dal web', () => {
    assert.match(read('api/.htaccess'), /<Files "tuttitv-domande\.json">[\s\S]*Require all denied[\s\S]*<\/Files>/);
    const api = read('api/tuttitv.php');
    assert.match(api, /Require all denied/, 'stanze protette');
    assert.match(api, /'\/tv-' \. \$code/, 'stanze con il prefisso tv-, separate da Nomi Cose');
});

test('games/tuttitv.js: compila e trova nella pagina tutti gli id che usa', () => {
    const js = read('assets/games/tuttitv.js');
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'tuttitv.js' }));
    const html = read('TuttiTV.html');
    const ids = new Set();
    for (const m of js.matchAll(/\$\('#([a-z][\w-]*\w)[' .]/g)) ids.add(m[1]);
    for (const m of js.matchAll(/show\('([a-z][\w-]*)'/g)) ids.add(m[1]);
    for (const m of js.matchAll(/'(#[a-z][\w-]*\w)'/g)) ids.add(m[1].slice(1));
    assert.ok(ids.size > 40, 'troppi pochi id trovati');
    const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
    assert.deepEqual(missing, []);
});

test('imprevisti: almeno 3, gli stessi nel client e nel server', () => {
    const php = read('api/tuttitv-core.php');
    const m = php.match(/TV_TWISTS = \[([^\]]+)\]/);
    const server = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    const js = read('assets/games/tuttitv.js');
    const block = js.match(/var TWISTS = \{([\s\S]*?)\n {4}\};/)[1];
    const client = [...block.matchAll(/^ {8}([a-z]+): \{/gm)].map((x) => x[1]);
    assert.ok(server.length >= 3);
    assert.deepEqual(client, server);
});

test('api/tuttitv: PHP compatibile con la 8.0', () => {
    const both = read('api/tuttitv.php') + read('api/tuttitv-core.php');
    // Altervista ha PHP 8.0: niente enum, readonly, never, array_is_list
    assert.doesNotMatch(both, /\benum\s+\w+|\breadonly\b|\):\s*never\b|array_is_list/);
});

function findPhp() {
    const cands = [process.env.PHP_BIN, path.join(root, '..', '..', 'istituto-amaretti', 'tools', 'php', 'php.exe'), 'php'].filter(Boolean);
    for (const c of cands) {
        const r = spawnSync(c, ['-v'], { encoding: 'utf8' });
        if (r.status === 0) return c;
    }
    return null;
}

test('api/tuttitv-core.php: regole della stanza (con PHP)', (t) => {
    const php = findPhp();
    if (!php) { t.skip('PHP non trovato'); return; }
    const r = spawnSync(php, [path.join(__dirname, 'tuttitv-core.test.php')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^ok/m);
    for (const f of ['tuttitv.php', 'tuttitv-core.php']) {
        const l = spawnSync(php, ['-l', path.join(root, 'api', f)], { encoding: 'utf8' });
        assert.equal(l.status, 0, l.stdout + l.stderr);
    }
});
