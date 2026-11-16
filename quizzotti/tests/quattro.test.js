/* Quattro per Quattro (assets/db-quattro.js): struttura delle schede e
   impronta di quelle gia' pubblicate. Il database e' a sola aggiunta: i
   progressi dei giocatori sono salvati per numero di scheda, quindi le
   schede 1..N non devono cambiare. Quando si aggiungono schede nuove in
   fondo, si aggiunge qui una riga a PUBBLICATE con il nuovo totale e la
   sua impronta (le righe vecchie restano). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const { quattroSchede } = require(path.join('..', 'assets', 'db-quattro.js'));

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TEMI = ['serie-a', 'azzurri', 'estero', 'storia', 'curiosita'];

test('almeno 40 schede, numerate da 1 senza buchi', () => {
    assert.ok(Array.isArray(quattroSchede));
    assert.ok(quattroSchede.length >= 40, `solo ${quattroSchede.length} schede`);
    quattroSchede.forEach((p, i) => assert.equal(p.n, i + 1, `scheda in posizione ${i + 1} ha numero ${p.n}`));
});

test('ogni scheda: titolo, tema, 4 gruppi da 4 nomi con etichetta', () => {
    for (const p of quattroSchede) {
        const at = `N° ${p.n}`;
        assert.ok(typeof p.titolo === 'string' && p.titolo.trim(), `${at}: titolo vuoto`);
        assert.ok(TEMI.includes(p.tema), `${at}: tema sconosciuto ${p.tema}`);
        assert.equal(p.gruppi.length, 4, `${at}: servono 4 gruppi`);
        for (const g of p.gruppi) {
            assert.ok(typeof g.nome === 'string' && g.nome.trim().length >= 3, `${at}: etichetta vuota`);
            assert.equal(g.voci.length, 4, `${at} «${g.nome}»: servono 4 nomi`);
            g.voci.forEach((v) => assert.ok(typeof v === 'string' && v.trim() && v === v.trim(), `${at} «${g.nome}»: nome vuoto o con spazi`));
        }
    }
});

test('difficoltà 1, 2, 3 e 4 tutte presenti, una per gruppo', () => {
    for (const p of quattroSchede) {
        assert.deepEqual(p.gruppi.map((g) => g.d).sort(), [1, 2, 3, 4], `N° ${p.n}: difficoltà non valide`);
    }
});

test('16 nomi distinti per scheda (anche senza accenti e maiuscole) ed etichette diverse', () => {
    for (const p of quattroSchede) {
        const voci = p.gruppi.flatMap((g) => g.voci).map(norm);
        const dup = voci.filter((v, i) => voci.indexOf(v) !== i);
        assert.deepEqual(dup, [], `N° ${p.n}: nomi ripetuti -> ${dup.join(', ')}`);
        const nomi = p.gruppi.map((g) => norm(g.nome));
        assert.equal(new Set(nomi).size, 4, `N° ${p.n}: due gruppi con la stessa etichetta`);
    }
});

test('nessun titolo di scheda ripetuto', () => {
    const t = quattroSchede.map((p) => norm(p.titolo));
    assert.equal(new Set(t).size, t.length);
});

test('le schede pubblicate non sono cambiate (impronta sha256)', () => {
    const PUBBLICATE = [
        { fino: 42, sha256: '38c50cf59d8bda38279c1d411d61701939a453f7ff02c6da49c29a0cbc296799' }
    ];
    for (const { fino, sha256 } of PUBBLICATE) {
        assert.ok(quattroSchede.length >= fino, `mancano schede: erano ${fino}`);
        const got = crypto.createHash('sha256').update(JSON.stringify(quattroSchede.slice(0, fino))).digest('hex');
        assert.equal(got, sha256, `le schede N° 1-${fino} sono cambiate rispetto a quelle pubblicate`);
    }
});
