/* Nomi, Cose, Calcio: categorie di base pulite, pagina con tutti gli id usati
   dallo script, e le regole della stanza (api/nomicose-core.php) provate con
   PHP se ce n'e' uno sul computer (variabile PHP_BIN o il PHP dell'Istituto). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const { nomicoseData } = require(path.join(root, 'assets', 'db-nomicose.js'));

test('db-nomicose.js: categorie con id unici e nomi corti, almeno 7 accese', () => {
    const c = nomicoseData.categories;
    assert.ok(c.length >= 15);
    assert.equal(new Set(c.map((x) => x.id)).size, c.length);
    c.forEach((x) => {
        assert.match(x.id, /^[a-z0-9]{2,12}$/);
        assert.ok(x.name.length <= 34, x.name);
        assert.equal(x.ex[0].toUpperCase(), 'M', `esempio con la M: ${x.ex}`);
    });
    const on = c.filter((x) => x.on).length;
    assert.ok(on >= 7 && on <= 12);
});

test('db-nomicose.js: lettere uguali a quelle del server', () => {
    const php = fs.readFileSync(path.join(root, 'api', 'nomicose-core.php'), 'utf8');
    assert.match(php, new RegExp(`NC_LETTERS = '${nomicoseData.letters.join('')}'`));
    assert.match(php, new RegExp(`NC_FOREIGN = '${nomicoseData.foreign.join('')}'`));
});

test('games/nomicose.js: compila e trova nella pagina tutti gli id che usa', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'games', 'nomicose.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'nomicose.js' }));
    const html = fs.readFileSync(path.join(root, 'NomiCose.html'), 'utf8');
    const ids = new Set();
    for (const m of js.matchAll(/\$\('#([a-z][\w-]*\w)[' .]/g)) ids.add(m[1]);
    for (const m of js.matchAll(/QZ\.show\('([a-z][\w-]*)'/g)) ids.add(m[1]);
    assert.ok(ids.size > 40, 'troppi pochi id trovati');
    const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(html));
    assert.deepEqual(missing, []);
});

test('api/nomicose.php: le stanze non sono leggibili dal web e il PHP è compatibile con la 8.0', () => {
    const api = fs.readFileSync(path.join(root, 'api', 'nomicose.php'), 'utf8');
    assert.match(api, /Require all denied/);
    const both = api + fs.readFileSync(path.join(root, 'api', 'nomicose-core.php'), 'utf8');
    // Altervista ha PHP 8.0: niente enum, readonly, never, match su tipi nuovi
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

test('api/nomicose-core.php: regole della stanza (con PHP)', (t) => {
    const php = findPhp();
    if (!php) { t.skip('PHP non trovato'); return; }
    const r = spawnSync(php, [path.join(__dirname, 'nomicose-core.test.php')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^ok/m);
    for (const f of ['nomicose.php', 'nomicose-core.php']) {
        const l = spawnSync(php, ['-l', path.join(root, 'api', f)], { encoding: 'utf8' });
        assert.equal(l.status, 0, l.stdout + l.stderr);
    }
});
