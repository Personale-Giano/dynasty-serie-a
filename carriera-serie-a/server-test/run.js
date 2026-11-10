'use strict';
/* ============================================================
   Presidente · Serie A — server-test/run.js
   Test degli endpoint PHP (room.php, leaderboard.php, errors.php, storage.php)
   contro un server PHP locale VERO (il server integrato di PHP), non simulato:
   percorsi felici, validazione, autenticazione, attraversamento di cartelle,
   corpi troppo grandi, rate-limit, richieste ripetute, dati corrotti,
   migrazione dei dati vecchi e concorrenza (richieste parallele sulla stessa
   stanza, distribuite su più processi PHP: il server integrato di PHP serve
   una richiesta alla volta, quindi se ne avviano quattro sugli stessi dati).

   Uso:  node server-test/run.js            (cerca "php" nel PATH)
         PHP_BIN=/percorso/php node server-test/run.js
   Esce con codice 1 se un'asserzione fallisce.

   Non tocca MAI i dati veri: i server partono con PRESIDENTE_DATA_DIR puntato a
   una cartella temporanea (cancellata alla fine) e PRESIDENTE_TEST_MODE=1, che
   permette ai test di fingersi IP diversi (header X-Test-Client-Ip) — senza
   quella variabile d'ambiente l'header è ignorato, in produzione non esiste.

   Questa cartella NON va pubblicata: è da aggiungere agli "exclude" del deploy
   (il .htaccess la blocca comunque).
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const APP_DIR = path.join(__dirname, '..');
const DOC_ROOT = path.join(APP_DIR, '..');
const APP_URL = '/' + path.basename(APP_DIR);
const PHP_BIN = process.env.PHP_BIN || 'php';
const BASE_PORT = parseInt(process.env.TEST_PORT || '8143', 10);
const WORKERS = 4;
const GUARD = '<?php http_response_code(404); exit; ?>\n';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'presidente-test-'));
const DATA_DIR = path.join(TMP, 'data');
const LEGACY_DIR = path.join(TMP, 'legacy');
fs.mkdirSync(LEGACY_DIR);

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) { if (cond) passed++; else { failed++; failures.push(msg); console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')'); }
function section(name) { console.log('\n— ' + name); }

let ipCounter = 0;
function newIp() { ipCounter++; return '10.' + ((ipCounter >> 16) & 255) + '.' + ((ipCounter >> 8) & 255) + '.' + (ipCounter & 255); }
let rr = 0;
function port() { rr = (rr + 1) % WORKERS; return BASE_PORT + rr; }

async function http(method, file, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  if (opts.ip) headers['X-Test-Client-Ip'] = opts.ip;
  let body;
  if (opts.raw !== undefined) body = opts.raw;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch('http://127.0.0.1:' + (opts.port || port()) + APP_URL + '/' + file, { method, headers, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, headers: res.headers };
}
const room = (body, ip, extra) => http('POST', 'room.php', Object.assign({ body, ip }, extra || {}));
const state = (code, ip, extra) => http('GET', 'room.php?action=state&code=' + encodeURIComponent(code), Object.assign({ ip }, extra || {}));

function readStore(name) {
  const raw = fs.readFileSync(path.join(DATA_DIR, name + '.json.php'), 'utf8');
  return JSON.parse(raw.slice(raw.indexOf('\n') + 1));
}
function writeStore(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name + '.json.php'), GUARD + JSON.stringify(data));
}
function listData() { return fs.readdirSync(DATA_DIR); }

// Un giocatore = le sue credenziali + il suo IP finto. `act` aggiunge code/playerId/authToken
// come fa mpApi() in ui.js.
function player(code, res, ip) {
  const p = { code, id: res.json.playerId, token: res.json.authToken, ip };
  p.act = (action, payload, extra) => room(Object.assign({ action, code, playerId: p.id, authToken: p.token }, payload || {}), ip, extra);
  return p;
}
async function createRoom(over) {
  const ip = newIp();
  const res = await room(Object.assign({ action: 'create', name: 'Host', club: 'Club Host', div: 0, difficulty: 'medio', roomName: 'Lega test' }, over || {}), ip);
  if (!res.json || !res.json.ok) throw new Error('create fallita: ' + res.status + ' ' + res.text);
  return player(res.json.room.code, res, ip);
}
async function joinRoom(code, n, over) {
  const ip = newIp();
  const res = await room(Object.assign({ action: 'join', code, name: 'Ospite ' + n, club: 'Club ' + n }, over || {}), ip);
  if (!res.json || !res.json.ok) throw new Error('join fallita: ' + res.status + ' ' + res.text);
  return player(code, res, ip);
}
function career(club, extra) {
  return Object.assign({
    club, owner: 'Presidente', div: 0, season: 1, startDiv: 0, budget: 1500000.5,
    squad: [
      { n: 'Mario Rossi', pos: 'ATT', ovr: 61, age: 24, seasonGoals: 14, traits: {}, tags: [] },
      { n: 'Luca Bianchi', pos: 'POR', ovr: 58, age: 30, seasonGoals: 0 },
    ],
    manager: { n: 'Mister X', _ovrDelta: 3 },
    trophies: { titles: [0, 0, 0, 0, 0, 0], nat: 0, ucl: 0, uel: 0, conf: 0, total: 0 },
    flags: {}, history: [], nested: { a: {}, b: [] },
    note: 'testo con <b>markup</b> & "virgolette" — città',
  }, extra || {});
}

/* ============================================================ avvio server */

const servers = [];
function startServers() {
  const env = Object.assign({}, process.env, { PRESIDENTE_DATA_DIR: DATA_DIR, PRESIDENTE_LEGACY_DIR: LEGACY_DIR, PRESIDENTE_TEST_MODE: '1' });
  for (let i = 0; i < WORKERS; i++) {
    const p = spawn(PHP_BIN, ['-d', 'display_errors=1', '-d', 'post_max_size=16M', '-d', 'memory_limit=256M', '-S', '127.0.0.1:' + (BASE_PORT + i), '-t', DOC_ROOT], { env, stdio: 'ignore' });
    p.on('error', (e) => { console.error('Impossibile avviare PHP (' + PHP_BIN + '): ' + e.message + '\nImposta PHP_BIN=/percorso/php'); process.exit(2); });
    servers.push(p);
  }
}
async function waitServers() {
  for (let i = 0; i < WORKERS; i++) {
    let up = false;
    for (let t = 0; t < 60 && !up; t++) {
      try { await fetch('http://127.0.0.1:' + (BASE_PORT + i) + APP_URL + '/manifest.json'); up = true; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!up) throw new Error('Il server PHP sulla porta ' + (BASE_PORT + i) + ' non risponde.');
  }
}
function cleanup() {
  servers.forEach((p) => { try { p.kill(); } catch (e) {} });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

/* ============================================================ test */

function seedLegacy() {
  // Dati nel formato (e nel posto) della versione precedente: file JSON accanto al sito.
  fs.writeFileSync(path.join(LEGACY_DIR, 'leaderboard_data.json'), JSON.stringify([
    { club: 'Vecchia Gloria', owner: 'Nonno', div: 5, startDiv: 0, season: 15, trophies: 3, worth: 5e8, difficulty: 'medio', score: 18000, ts: 1700000000, trophyBreakdown: null },
    { club: '<script>alert(1)</script>', owner: 'Hacker"', div: 1, season: 2, trophies: 0, worth: 1, difficulty: 'medio', score: 500, ts: 1700000001 },
  ]));
  fs.writeFileSync(path.join(LEGACY_DIR, 'leaderboard_season_data.json'), JSON.stringify({ current: 3 }));
  fs.writeFileSync(path.join(LEGACY_DIR, 'errors_log.json'), JSON.stringify([{ message: 'vecchio errore', stack: '', url: '', source: '', ts: 1700000000 }]));
  fs.writeFileSync(path.join(LEGACY_DIR, 'activity.log'), '2025-01-01T00:00:00+00:00 OLDR create\n');
  fs.writeFileSync(path.join(LEGACY_DIR, 'leaderboard_rate.json'), '{}');
  fs.writeFileSync(path.join(LEGACY_DIR, 'room_rate_join.json'), '{"bucket":1,"counts":{}}');
  fs.writeFileSync(path.join(LEGACY_DIR, 'room_.json'), '');
  fs.writeFileSync(path.join(LEGACY_DIR, 'room_ZZZZ.json'), '');
  fs.writeFileSync(path.join(LEGACY_DIR, 'room_OLDR.json'), JSON.stringify({
    code: 'OLDR', name: 'Stanza vecchia', createdAt: 1700000000, updatedAt: Math.floor(Date.now() / 1000) - 60, div: 0, difficulty: 'medio',
    hostId: 'p_aaaaaaaaaaaa', phase: 'session',
    players: [
      { id: 'p_aaaaaaaaaaaa', authToken: 'a'.repeat(32), name: 'Vecchio', club: 'Vecchio FC', ready: true, joinedAt: 1700000000, state: career('Vecchio FC') },
      { id: 'p_bbbbbbbbbbbb', authToken: 'b'.repeat(32), name: 'Altro', club: 'Altro FC', ready: false, joinedAt: 1700000001 },
    ],
    chat: [], hallOfFame: [], seasonAwards: [], trades: [], announcement: null,
  }));
}

async function testMigration() {
  section('Migrazione dei dati vecchi');
  const lb = await http('GET', 'leaderboard.php', { ip: newIp() });
  eq(lb.status, 200, 'leaderboard GET dopo la migrazione');
  ok(lb.json.entries.some((e) => e.club === 'Vecchia Gloria' && e.score === 18000), 'la classifica vecchia è stata migrata');
  ok(lb.json.entries.every((e) => !/[<>"]/.test(e.club + e.owner)), 'i nomi migrati sono ripuliti in uscita');
  eq(lb.json.currentSeason, 3, 'la stagione di classifica è stata migrata');
  eq(fs.readdirSync(LEGACY_DIR), [], 'nessun file di dati resta nella cartella pubblica');
  ok(fs.existsSync(path.join(DATA_DIR, 'legacy', 'leaderboard_data.json.php')), 'gli originali sono stati spostati in _data/legacy');
  eq(readStore('errors').length, 1, 'il log errori vecchio è stato migrato');

  const st = await state('OLDR', newIp());
  eq(st.status, 200, 'la stanza vecchia è leggibile');
  eq(st.json.room.players.length, 2, 'la stanza vecchia ha i suoi giocatori');
  eq(st.json.room.players[0].state.club, 'Vecchio FC', 'la carriera sottomessa nella stanza vecchia è intatta');
  ok(!st.text.includes('authToken') && !st.text.includes('authHash'), 'nessuna credenziale nello stato pubblico');
  ok(!fs.readFileSync(path.join(DATA_DIR, 'room_OLDR.json.php'), 'utf8').includes('a'.repeat(32)), 'il token in chiaro non è più sul disco');
  const chat = await room({ action: 'chat', code: 'OLDR', playerId: 'p_aaaaaaaaaaaa', authToken: 'a'.repeat(32), text: 'ci sono ancora' }, newIp());
  eq(chat.status, 200, 'chi era nella stanza vecchia resta autenticato con il suo token');
  const bad = await room({ action: 'chat', code: 'OLDR', playerId: 'p_aaaaaaaaaaaa', authToken: 'b'.repeat(32), text: 'x' }, newIp());
  eq(bad.status, 403, 'il token di un altro giocatore non vale');
}

async function testLibrary() {
  section('storage.php e cartella dati');
  const lib = await http('GET', 'storage.php');
  eq([lib.status, lib.text], [404, ''], 'storage.php chiamato direttamente: 404, nessun contenuto');
  ok(fs.existsSync(path.join(DATA_DIR, '.htaccess')) && /denied|Deny from all/.test(fs.readFileSync(path.join(DATA_DIR, '.htaccess'), 'utf8')), 'la cartella dati ha il suo .htaccess "deny"');
  ok(fs.existsSync(path.join(DATA_DIR, 'index.html')), 'la cartella dati ha un index.html vuoto (niente elenco file)');
  for (const f of listData().filter((n) => n.endsWith('.json.php') || n.endsWith('.log.php'))) {
    ok(fs.readFileSync(path.join(DATA_DIR, f), 'utf8').startsWith(GUARD), 'il file dati ' + f + ' comincia con la riga di guardia');
  }
  ok(fs.readFileSync(path.join(DATA_DIR, 'secret.php'), 'utf8').startsWith('<?php return '), 'il segreto del server è un file PHP (mai leggibile via HTTP)');
  ok(fs.existsSync(path.join(APP_DIR, '_data', '.htaccess')) && fs.existsSync(path.join(APP_DIR, '_data', 'index.html')), 'nel repository _data/ contiene già .htaccess e index.html');
  eq(fs.readdirSync(path.join(APP_DIR, '_data')).sort(), ['.htaccess', 'index.html'], 'la cartella _data/ del repository non contiene dati');
}

async function testRoomHappyPath() {
  section('Stanza: percorso completo (le stesse richieste di ui.js)');
  const host = await createRoom();
  const code = host.code;
  ok(/^[A-HJ-NP-Z2-9]{4}$/.test(code), 'codice stanza di 4 caratteri dall\'alfabeto senza 0/O/1/I');
  ok(/^p_[0-9a-f]{12}$/.test(host.id) && /^[0-9a-f]{32}$/.test(host.token), 'create restituisce playerId e authToken');

  let st = await state(code, host.ip);
  eq(st.status, 200, 'GET state');
  eq([st.json.room.phase, st.json.room.hostId, st.json.room.name, st.json.room.players.length], ['lobby', host.id, 'Lega test', 1], 'stato iniziale della stanza');
  ok(!st.text.includes(host.token) && !/authToken|authHash|joinKey/.test(st.text), 'lo stato non contiene credenziali');
  const onDisk = fs.readFileSync(path.join(DATA_DIR, 'room_' + code + '.json.php'), 'utf8');
  ok(!onDisk.includes(host.token), 'sul disco non c\'è il token in chiaro');
  ok(!fs.readdirSync(APP_DIR).some((f) => /^room_.*\.json$/.test(f) || /\.sqlite$/.test(f) || /_rate\.json$/.test(f) || f === 'activity.log'), 'nessun file di dati accanto ai file del sito');

  // Un file dati chiesto via HTTP SENZA la protezione del .htaccess (il server integrato di
  // PHP lo ignora): la riga di guardia deve bastare da sola. Se ne mette una copia sotto la
  // radice del sito giusto il tempo di chiederla.
  const probe = path.join(__dirname, 'tmp-guard-check.json.php');
  fs.writeFileSync(probe, onDisk);
  const leak = await http('GET', 'server-test/tmp-guard-check.json.php');
  fs.unlinkSync(probe);
  eq([leak.status, leak.text], [404, ''], 'un file dati eseguito via HTTP risponde 404 e non rivela nulla');

  const guest = await joinRoom(code, 1, { div: '2' });
  st = await state(code, guest.ip);
  eq(st.json.room.players.map((p) => p.club), ['Club Host', 'Club 1'], 'join aggiunge il giocatore');
  eq(st.json.room.players[1].joinDiv, 2, 'join accetta div come stringa numerica (valore di un <select>)');

  // lobby: pronto è solo un flag
  let r = await host.act('ready', { ready: true });
  eq([r.status, r.json.room.phase], [200, 'lobby'], 'un solo pronto: ancora lobby');
  r = await guest.act('ready', { ready: true });
  eq(r.json.room.phase, 'allReadyLobby', 'tutti pronti: allReadyLobby');
  r = await guest.act('ready', { ready: false });
  eq(r.json.room.phase, 'lobby', 'pronto ritirato: di nuovo lobby');
  r = await host.act('startSession');
  eq(r.status, 409, 'startSession senza tutti pronti e senza force: 409');
  r = await guest.act('startSession', { force: true });
  eq(r.status, 403, 'startSession da chi non è host: 403');
  r = await host.act('startSession', { force: true });
  eq([r.status, r.json.room.phase, r.json.room.players.every((p) => !p.ready)], [200, 'session', true], 'startSession forzata apre la sessione');
  r = await host.act('startSession', { force: true });
  eq([r.status, r.json.room.phase], [200, 'session'], 'startSession ripetuta subito: nessun errore, nessun effetto');

  // chat, annuncio, rinomina
  r = await guest.act('chat', { text: '  ciao <b>a</b> tutti!\n3 > 2 😀  ' });
  eq(r.json.room.chat[0].text, 'ciao ‹b›a‹/b› tutti! 3 › 2 😀', 'chat: una riga, niente tag, emoji e punteggiatura intatte');
  eq([r.json.room.chat[0].name, r.json.room.chat[0].club], ['Ospite 1', 'Club 1'], 'chat: nome e club li mette il server');
  r = await guest.act('announce', { text: 'non sono host' });
  eq(r.status, 403, 'announce da chi non è host: 403');
  r = await host.act('announce', { text: '</textarea><img src=x onerror=alert(1)>' });
  ok(r.status === 200 && !/[<>]/.test(r.json.room.announcement), 'annuncio: "<" e ">" neutralizzati');
  r = await host.act('announce', { text: '' });
  eq(r.json.room.announcement, null, 'annuncio vuoto: rimosso');
  r = await host.act('rename', { roomName: 'Nuovo "nome" <i>' });
  eq(r.json.room.name, 'Nuovo nome i', 'rename: nome ripulito');

  // sessione: pronto porta la carriera
  r = await host.act('ready', { ready: true });
  eq(r.status, 400, 'pronto in sessione senza carriera: 400');
  r = await host.act('ready', { ready: true, state: career('Club <i>Host</i>', { owner: 'Capo "Ultrà" D\'Amico' }) });
  eq([r.status, r.json.room.phase], [200, 'session'], 'pronto con carriera, manca l\'altro');
  const mine = r.json.room.players[0].state;
  eq([mine.club, mine.owner], ['Club iHosti', 'Capo Ultrà D\'Amico'], 'club/owner dentro la carriera sono ripuliti');
  eq(mine.note, 'testo con <b>markup</b> & "virgolette" — città', 'il resto della carriera torna identico, carattere per carattere');
  ok(r.text.includes('"flags":{}') && r.text.includes('"history":[]') && r.text.includes('"nested":{"a":{},"b":[]}') && r.text.includes('"traits":{}'), 'oggetti vuoti {} e liste vuote [] della carriera non vengono scambiati');
  eq(mine.budget, 1500000.5, 'i numeri della carriera non cambiano');
  ok(!r.text.includes('<'), 'nessun "<" letterale nella risposta (JSON_HEX_TAG)');
  r = await guest.act('ready', { ready: true, state: career('Club 1', { div: 0 }) });
  eq(r.json.room.phase, 'readyForSim', 'tutti pronti con carriera: readyForSim');

  // simulazione
  const group = (md, resume) => ({ div: 0, divName: 'Promozione', matchday: md, total: 46, table: [{ club: 'Club Host', pts: md * 3, gd: md, isHuman: true }], news: {}, resume });
  r = await guest.act('pushMatchday', { matchday: 1, total: 46, groups: [group(1, null)] });
  eq(r.status, 403, 'pushMatchday da chi non è host: 403');
  r = await host.act('pushMatchday', { matchday: 1, total: 46, groups: [group(1, { ctxs: [career('Club Host')], bots: [], playerIds: [host.id] })], force: false });
  eq([r.status, r.json.room.phase, r.json.room.live.matchday], [200, 'simulating', 1], 'pushMatchday: fase simulating');
  eq(r.json.room.live.groups[0].resume.playerIds, [host.id], 'resume salvato');
  r = await host.act('pushMatchday', { matchday: 2, total: 46, groups: [group(2, null)], force: false });
  eq([r.json.room.live.groups[0].matchday, r.json.room.live.groups[0].table[0].pts], [2, 6], 'seconda giornata pubblicata');
  eq(r.json.room.live.groups[0].resume.playerIds, [host.id], 'resume mancante: resta quello della giornata precedente');
  ok(r.text.includes('"news":{}'), 'oggetto vuoto dentro un gruppo live conservato');
  r = await guest.act('ready', { ready: false });
  eq(r.status, 409, 'pronto a simulazione in corso: rifiutato');
  st = await state(code, guest.ip);
  eq(st.json.room.phase, 'simulating', '…e la stanza NON torna in lobby');
  const late = await joinRoom(code, 2);
  st = await state(code, late.ip);
  eq([st.json.room.phase, st.json.room.players.length], ['simulating', 3], 'join a simulazione in corso: ammesso, fase invariata');
  r = await late.act('leave');
  eq(r.status, 200, 'leave');

  // risultati
  const results = {};
  results[host.id] = career('Club Host', { season: 1, manager: { n: 'Mister <u>Uno</u>', _ovrDelta: 5 }, _end: { pos: 2, exp: 9, promoted: true, relegated: false, title: false, trophies: ['Coppa <b>Italia</b>'] } });
  results[guest.id] = career('Club 1', { season: 1, _end: { pos: 11, exp: 10, promoted: false, relegated: false, title: false, trophies: [] } });
  results.chiave_inventata = { evil: true };
  r = await guest.act('submitResult', { results, force: true });
  eq(r.status, 403, 'submitResult da chi non è host: 403');
  r = await host.act('submitResult', { results, force: true });
  eq([r.status, r.json.room.phase, 'live' in r.json.room], [200, 'done', false], 'submitResult chiude il round');
  eq(Object.keys(r.json.room.results).sort(), [host.id, guest.id].sort(), 'results: solo chiavi che sono playerId');
  eq(r.json.room.results[host.id]._end.trophies, ['Coppa <b>Italia</b>'], 'results: la carriera torna identica (è un blocco opaco)');
  const hof = r.json.room.hallOfFame[host.id];
  eq([hof.length, hof[0].pos, hof[0].promoted, hof[0].club, hof[0].trophies], [1, 2, true, 'Club Host', ['Coppa ‹b›Italia‹/b›']], 'albo d\'oro: campi estratti e ripuliti');
  const aw = r.json.room.seasonAwards[0];
  eq([aw.topScorer.player, aw.topScorer.goals, aw.bestManager.mgr, aw.bestManager.delta, aw.surprise.club, aw.surprise.delta], ['Mario Rossi', 14, 'Mister uUnou', 5, 'Club Host', 7], 'premi della stagione calcolati e ripuliti');
  r = await host.act('submitResult', { results, force: true });
  eq([r.status, r.json.room.hallOfFame[host.id].length, r.json.room.seasonAwards.length], [200, 1, 1], 'submitResult ripetuta: nessun doppione in albo d\'oro e premi');
  const blocked = await room({ action: 'join', code, name: 'Tardi', club: 'Tardi FC' }, newIp());
  eq(blocked.status, 409, 'join a round chiuso: 409');

  r = await host.act('nextRound');
  eq(r.status, 409, 'nextRound prima che tutti abbiano scaricato: 409');
  r = await host.act('ackResult');
  r = await guest.act('ackResult');
  eq(r.json.room.players.every((p) => p.acked), true, 'ackResult di tutti');
  r = await host.act('nextRound');
  eq([r.status, r.json.room.phase, r.json.room.season, 'results' in r.json.room, r.json.room.players.some((p) => p.state || p.ready || p.acked)], [200, 'session', 2, false, false], 'nextRound apre la stagione 2 e azzera pronti/carriere');
  r = await host.act('nextRound');
  eq([r.status, r.json.room.season], [200, 2], 'nextRound ripetuta subito: la stagione non avanza due volte');
  r = await guest.act('ackResult');
  eq(r.json.room.players[1].acked, false, 'ackResult fuori da un round chiuso non lascia il flag acceso');

  // terminate
  r = await guest.act('terminate');
  eq(r.status, 403, 'terminate da chi non è host: 403');
  r = await host.act('terminate');
  eq([r.status, r.json.room.phase], [200, 'terminated'], 'terminate');
  r = await host.act('terminate');
  eq(r.status, 200, 'terminate ripetuta: ok');
  r = await host.act('ready', { ready: true });
  eq(r.status, 409, 'pronto in una dynasty terminata: 409');
  ok(fs.readFileSync(path.join(DATA_DIR, 'activity.log.php'), 'utf8').includes(code + ' terminate'), 'log attività scritto dentro la cartella dati');
}

async function testUpdatedAtAndEtag() {
  section('updatedAt crescente, ETag e 304');
  const host = await createRoom();
  const guest = await joinRoom(host.code, 1);
  const seen = [];
  for (let i = 0; i < 4; i++) { const r = await host.act('announce', { text: 'giro ' + i }); seen.push(r.json.room.updatedAt); }
  ok(seen.every((v, i) => i === 0 || v > seen[i - 1]), 'quattro modifiche nello stesso secondo hanno quattro updatedAt diversi (' + seen.join(',') + ')');
  const a = await state(host.code, guest.ip);
  const etag = a.headers.get('etag');
  ok(!!etag && /no-cache/.test(a.headers.get('cache-control') || ''), 'state ha un ETag e Cache-Control: no-cache');
  const b = await state(host.code, guest.ip, { headers: { 'If-None-Match': etag } });
  eq([b.status, b.text], [304, ''], 'stesso ETag: 304 senza corpo');
  const b2 = await state(host.code, guest.ip, { headers: { 'If-None-Match': '"altro", W/' + etag.replace(/"$/, '-gzip"') } });
  eq(b2.status, 304, 'ETag rimandato come debole e con "-gzip" (server che comprime): vale lo stesso');
  await guest.act('chat', { text: 'novità' });
  const c = await state(host.code, guest.ip, { headers: { 'If-None-Match': etag } });
  eq([c.status, c.json.room.chat.length], [200, 1], 'stanza cambiata: 200 con il nuovo stato');
  ok(c.headers.get('etag') !== etag, 'ETag diverso dopo una modifica');
  eq(c.headers.get('x-content-type-options'), 'nosniff', 'header nosniff sulle risposte API');
}

async function testValidation() {
  section('Validazione e formati sbagliati');
  const ip = () => newIp();
  let r = await http('POST', 'room.php', { raw: '{non json', ip: ip() });
  eq([r.status, r.json && r.json.ok], [400, false], 'JSON non valido: 400 con corpo JSON');
  r = await http('POST', 'room.php', { raw: '[1,2,3]', ip: ip() });
  eq(r.status, 400, 'corpo JSON che non è un oggetto: 400');
  r = await http('POST', 'room.php', { raw: '', ip: ip() });
  eq(r.status, 400, 'corpo vuoto: 400');
  r = await http('POST', 'room.php', { raw: '{"a":'.repeat(200) + '1' + '}'.repeat(200), ip: ip() });
  eq(r.status, 400, 'JSON annidato a dismisura: 400');
  r = await room({ action: 'esplodi' }, ip());
  eq(r.status, 400, 'azione sconosciuta: 400');
  r = await room({ action: ['create'] }, ip());
  eq(r.status, 400, 'azione che non è una stringa: 400');
  r = await room({ action: 'create', name: '', club: 'X' }, ip());
  eq(r.status, 400, 'create senza nome: 400');
  r = await room({ action: 'create', name: '<<<>>>', club: '!!!' }, ip());
  eq(r.status, 400, 'create con nomi fatti solo di caratteri vietati: 400');
  r = await room({ action: 'create', name: 'A', club: 'B', div: 9 }, ip());
  eq(r.status, 400, 'create con categoria inesistente: 400');
  r = await room({ action: 'create', name: { a: 1 }, club: ['x'], div: 0 }, ip());
  eq(r.status, 400, 'create con nome/club di tipo sbagliato: 400, non un errore 500');
  const hip = ip();
  r = await room({ action: 'create', name: 'x'.repeat(500) + ' <b>Zoë</b> ' + 'y'.repeat(500), club: 'Çlub d\'Été – 1908 ⚽', div: 1, difficulty: 'impossibile' }, hip);
  eq([r.status, r.json.room.players[0].name.length, r.json.room.players[0].club, r.json.room.difficulty], [200, 18, 'Çlub d\'Été 1908', 'medio'], 'create: nomi tagliati e ripuliti, difficoltà sconosciuta -> medio');
  const host = player(r.json.room.code, r, hip);

  r = await http('GET', 'room.php', { ip: ip() });
  eq(r.status, 405, 'GET senza action=state: 405');
  r = await http('GET', 'room.php?action=state', { ip: ip() });
  eq(r.status, 400, 'state senza codice: 400');
  r = await http('GET', 'room.php?action=state&code[]=AAAA', { ip: ip() });
  eq([r.status, r.json && r.json.ok], [400, false], 'state con code[] (array): 400 JSON, non un errore fatale');
  r = await http('PUT', 'room.php', { body: {}, ip: ip() });
  eq(r.status, 405, 'metodo PUT: 405');
  r = await http('DELETE', 'leaderboard.php', { ip: ip() });
  eq(r.status, 405, 'DELETE sulla classifica: 405');

  r = await host.act('chat', { text: '   \n\t  ' });
  eq(r.status, 400, 'chat vuota: 400');
  r = await host.act('chat', { text: ['a'] });
  eq(r.status, 400, 'chat con testo non stringa: 400');
  r = await host.act('chat', { text: 'x'.repeat(5000) });
  eq([r.status, r.json.room.chat[0].text.length], [200, 200], 'chat lunga: tagliata a 200 caratteri');
  r = await host.act('kick', { targetId: host.id });
  eq(r.status, 400, 'kick di sé stessi: 400');
  r = await host.act('kick', { targetId: 'p_000000000000' });
  eq(r.status, 404, 'kick di un giocatore inesistente: 404');
  r = await host.act('pushMatchday', { matchday: 1, total: 0, groups: [] });
  eq(r.status, 400, 'pushMatchday con total 0: 400');
  r = await host.act('pushMatchday', { matchday: 1, total: 38, groups: 'x' });
  eq(r.status, 400, 'pushMatchday con groups non lista: 400');
  r = await host.act('submitResult', { results: 'x' });
  eq(r.status, 400, 'submitResult con results non oggetto: 400');
  r = await host.act('respondTrade', { tradeId: 't_zzz', response: 'accept' });
  eq(r.status, 400, 'respondTrade con id malformato: 400');
  r = await host.act('proposeTrade', { targetId: host.id, playerName: 'Tizio', fee: 10 });
  eq(r.status, 400, 'proposeTrade a sé stessi: 400');

  section('Corpi troppo grandi');
  r = await host.act('rename', { roomName: 'x', padding: 'p'.repeat(40 * 1024) });
  eq(r.status, 413, 'azione leggera con corpo da 40 KB: 413');
  r = await host.act('ready', { ready: true, state: career('X', { blob: 'b'.repeat(2 * 1024 * 1024 + 10) }) });
  eq(r.status, 413, 'ready con carriera oltre 2 MB: 413');
  r = await http('POST', 'room.php', { raw: '{"action":"pushMatchday","x":"' + 'z'.repeat(8 * 1024 * 1024 + 100) + '"}', ip: host.ip });
  eq(r.status, 413, 'corpo oltre 8 MB: 413');
  r = await http('POST', 'leaderboard.php', { raw: JSON.stringify({ club: 'A', owner: 'B', pad: 'x'.repeat(5000) }), ip: ip() });
  eq(r.status, 413, 'classifica con corpo oltre 4 KB: 413');
  r = await http('POST', 'errors.php', { raw: JSON.stringify({ message: 'm', pad: 'x'.repeat(9000) }), ip: ip() });
  eq(r.status, 413, 'errors con corpo oltre 8 KB: 413');
  const big = career('Club Grande', { blob: 'è'.repeat(600 * 1024) });   // ~1,2 MB, dentro il tetto
  const h2 = await createRoom(); const g2 = await joinRoom(h2.code, 1);
  await h2.act('startSession', { force: true });
  r = await h2.act('ready', { ready: true, state: big });
  eq([r.status, r.json && r.json.room.players[0].state.blob.length], [200, 600 * 1024], 'carriera da 1,2 MB: accettata e restituita intera');
  await g2.act('leave'); await h2.act('leave');
}

async function testAuth() {
  section('Autenticazione e ruoli');
  const host = await createRoom();
  const guest = await joinRoom(host.code, 1);
  const as = (id, token, action, payload, ip) => room(Object.assign({ action, code: host.code, playerId: id, authToken: token }, payload || {}), ip || newIp());
  let r = await as(host.id, undefined, 'chat', { text: 'x' });
  eq(r.status, 403, 'azione senza authToken: 403');
  r = await as(host.id, guest.token, 'rename', { roomName: 'scippo' });
  eq(r.status, 403, 'playerId dell\'host con il token di un altro: 403');
  r = await as(host.id, '0'.repeat(32), 'terminate');
  eq(r.status, 403, 'token inventato: 403');
  r = await as(host.id, host.token.toUpperCase() === host.token ? host.token + 'x' : host.token.toUpperCase(), 'chat', { text: 'x' });
  eq(r.status, 403, 'token alterato (maiuscole): 403');
  r = await as(host.id, { $ne: null }, 'chat', { text: 'x' });
  eq(r.status, 403, 'token che non è una stringa: 403');
  r = await as('p_ffffffffffff', host.token, 'chat', { text: 'x' });
  eq(r.status, 403, 'playerId inesistente: 403');
  r = await as(host.id, host.token, 'chat', { text: 'ok' }, newIp());
  eq(r.status, 200, 'credenziali giuste: 200 (da qualunque IP)');

  for (const [action, payload] of [['rename', { roomName: 'x' }], ['announce', { text: 'x' }], ['startSession', { force: true }], ['nextRound', { force: true }], ['terminate', {}], ['kick', { targetId: host.id }], ['adoptBot', { targetId: host.id }], ['pushMatchday', { matchday: 1, total: 38, groups: [{ div: 0 }], force: true }], ['submitResult', { results: {}, force: true }]]) {
    r = await guest.act(action, payload);
    eq(r.status, 403, action + ' da un non-host: 403');
  }
  r = await guest.act('claimHost');
  eq(r.status, 409, 'claimHost con host presente e attivo: 409');

  // leave/ackResult tolleranti: ok ma senza effetto
  r = await as(guest.id, '0'.repeat(32), 'leave');
  eq([r.status, r.json.ok], [200, true], 'leave con token sbagliato: ok…');
  let st = await state(host.code, host.ip);
  eq(st.json.room.players.length, 2, '…ma nessuno è stato fatto uscire');
  const before = st.json.room.updatedAt;
  r = await as(guest.id, '0'.repeat(32), 'ackResult');
  st = await state(host.code, host.ip);
  eq(st.json.room.updatedAt, before, 'ackResult non autenticata non tocca la stanza (prima ne spostava updatedAt)');

  // kick, poi il token dell'espulso non vale più
  r = await host.act('kick', { targetId: guest.id });
  eq([r.status, r.json.room.players.length], [200, 1], 'kick dell\'host');
  r = await guest.act('chat', { text: 'sono ancora qui?' });
  eq(r.status, 403, 'chi è stato espulso non può più agire');

  // trattative: solo le due parti
  const a = await joinRoom(host.code, 2); const b = await joinRoom(host.code, 3);
  r = await a.act('proposeTrade', { targetId: b.id, playerName: 'Mario Rossi', fee: 1000, offerPlayerName: '', offerPlayerSnapshot: null });
  eq([r.status, r.json.room.trades.length, r.json.room.trades[0].status], [200, 1, 'pending'], 'proposeTrade');
  const tid = r.json.room.trades[0].id;
  r = await a.act('proposeTrade', { targetId: b.id, playerName: 'Mario Rossi', fee: 1000, offerPlayerName: '', offerPlayerSnapshot: null });
  eq(r.json.room.trades.length, 1, 'proposeTrade identica ripetuta: nessun doppione');
  r = await host.act('respondTrade', { tradeId: tid, response: 'reject' });
  eq(r.status, 403, 'respondTrade da un terzo: 403');
  r = await a.act('respondTrade', { tradeId: tid, response: 'accept', playerSnapshot: { n: 'Mario Rossi', pos: 'ATT' } });
  eq(r.status, 409, 'il compratore non può accettare la propria proposta');
  r = await b.act('respondTrade', { tradeId: tid, response: 'accept', playerSnapshot: { n: 'Finto', pos: 'XXX' } });
  eq(r.status, 400, 'accept con giocatore non valido: 400');
  r = await b.act('respondTrade', { tradeId: tid, response: 'counter', counterFee: 2500, playerSnapshot: { n: 'Mario <b>Rossi</b>', pos: 'ATT', ovr: 999, age: 3, wage: 1e12, yrs: 99, potential: 5, nat: { code: 'IT', name: 'Italia', flag: '<svg onload=x>' }, extra: 'via' } });
  const t = r.json.room.trades[0];
  eq([t.status, t.counterFee, t.playerSnapshot.n, t.playerSnapshot.ovr, t.playerSnapshot.age, t.playerSnapshot.wage, t.playerSnapshot.yrs, t.playerSnapshot.nat.flag, 'extra' in t.playerSnapshot], ['countered', 2500, 'Mario bRossib', 115, 15, 5e6, 6, '', false], 'counter: giocatore allegato ripulito e limitato campo per campo');
  r = await a.act('respondTrade', { tradeId: tid, response: 'accept' });
  eq([r.json.room.trades[0].status, r.json.room.trades[0].fee], ['accepted', 2500], 'il compratore accetta la controproposta al nuovo prezzo');
  r = await a.act('respondTrade', { tradeId: tid, response: 'accept' });
  eq(r.status, 200, 'accept ripetuta: ok senza effetto');
  r = await b.act('respondTrade', { tradeId: tid, response: 'reject' });
  eq(r.status, 409, 'reject di una trattativa già chiusa: 409');
  for (let i = 0; i < 3; i++) await a.act('proposeTrade', { targetId: b.id, playerName: 'Altro ' + i, fee: i });
  r = await a.act('proposeTrade', { targetId: b.id, playerName: 'Quarto', fee: 1 });
  eq(r.status, 409, 'più di 3 trattative in sospeso con la stessa persona: 409');
  r = await a.act('proposeTrade', { targetId: b.id, playerName: 'Neg', fee: -5 });
  eq(r.status, 400, 'offerta negativa: 400');
  r = await a.act('proposeTrade', { targetId: b.id, playerName: 'Inf', fee: '1e999' });
  eq(r.status, 400, 'offerta infinita: 400');
}

async function testTraversal() {
  section('Attraversamento di cartelle e codici inventati');
  const strip = (l) => l.filter((n) => !/^rate_|\.lock$|\.tmp/.test(n));
  const before = strip(listData().sort());
  const rootBefore = fs.readdirSync(APP_DIR).sort();
  const tmpBefore = fs.readdirSync(TMP).sort();
  const evil = ['../secret', '..\\..\\x', '....//....//etc/passwd', 'AB/CD', 'AB%2FCD', 'ABCD.json', 'ABCD\u0000', 'A'.repeat(300), '%00', '*', 'room_', '.htaccess', 'AAAAAAAAA', 'àèìò', 'AB CD'];
  let allRejected = true;
  for (const code of evil) {
    const ip = newIp();
    const s = await state(code, ip);
    const j = await room({ action: 'join', code, name: 'X', club: 'Y' }, ip);
    const c = await room({ action: 'chat', code, playerId: 'p_000000000000', authToken: '0'.repeat(32), text: 'x' }, ip);
    const l = await room({ action: 'leave', code, playerId: 'p_000000000000', authToken: '0'.repeat(32) }, ip);
    const a = await room({ action: 'ackResult', code, playerId: '../../x', authToken: '0'.repeat(32) }, ip);
    if (![400, 404].includes(s.status) || ![400, 404].includes(j.status) || ![400, 404].includes(c.status) || l.status !== 200 || a.status !== 200) { allRejected = false; console.log('    codice ' + JSON.stringify(code.slice(0, 30)) + ' -> ' + [s.status, j.status, c.status, l.status, a.status]); }
  }
  ok(allRejected, 'ogni codice malformato è rifiutato (400/404); leave/ackResult restano tolleranti e non fanno nulla');
  // codici ben formati ma inesistenti: prima ogni azione creava un file vuoto room_<codice>.json
  for (const code of ['QQQQ', 'WXYZ', 'ABCDEFGH']) {
    const ip = newIp();
    await room({ action: 'chat', code, playerId: 'p_000000000000', authToken: '0'.repeat(32), text: 'x' }, ip);
    await room({ action: 'leave', code, playerId: 'p_000000000000', authToken: '0'.repeat(32) }, ip);
    await room({ action: 'join', code, name: 'X', club: 'Y' }, ip);
  }
  eq(strip(listData().sort()), before, 'nessun file nuovo nella cartella dati per codici inesistenti o malformati');
  eq(fs.readdirSync(APP_DIR).sort(), rootBefore, 'nessun file nuovo nella cartella del sito');
  eq(fs.readdirSync(TMP).sort(), tmpBefore, 'nessun file fuori dalla cartella dati');
  ok(listData().every((n) => /^[A-Za-z0-9_.\-]+$/.test(n)), 'solo nomi di file "puliti" nella cartella dati');
}

async function testConcurrency() {
  section('Concorrenza (richieste parallele sulla stessa stanza, su 4 processi PHP)');
  // 12 join insieme su una stanza con 1 posto occupato: ne entrano esattamente 5.
  const host = await createRoom();
  const joins = await Promise.all(Array.from({ length: 12 }, (_, i) => room({ action: 'join', code: host.code, name: 'P' + i, club: 'Parallelo ' + i }, newIp())));
  const okJoins = joins.filter((r) => r.status === 200);
  eq([okJoins.length, joins.filter((r) => r.status === 409).length], [5, 7], '12 join simultanei: 5 entrano, 7 trovano la stanza piena');
  let st = await state(host.code, host.ip);
  eq(st.json.room.players.length, 6, 'la stanza ha esattamente 6 giocatori');
  eq(new Set(st.json.room.players.map((p) => p.id)).size, 6, 'nessun giocatore perso o duplicato');
  const players = [host].concat(okJoins.map((r) => player(host.code, r, newIp())));

  // tutti scrivono in chat nello stesso istante, per più giri: nessun messaggio perso
  let sent = 0;
  for (let round = 0; round < 3; round++) {
    const rs = await Promise.all(players.map((p, i) => p.act('chat', { text: 'giro ' + round + ' da ' + i })));
    sent += rs.filter((r) => r.status === 200).length;
    await new Promise((r) => setTimeout(r, 1100));
  }
  st = await state(host.code, host.ip);
  eq([sent, st.json.room.chat.length], [18, 18], '18 messaggi di chat simultanei: tutti salvati');
  const stamps = (await Promise.all(players.map((p) => p.act('ready', { ready: true })))).map((r) => r.json.room.updatedAt);
  eq(new Set(stamps).size, 6, '6 "pronto" simultanei: 6 updatedAt distinti (scritture in fila, non sovrapposte)');
  st = await state(host.code, host.ip);
  eq([st.json.room.phase, st.json.room.players.filter((p) => p.ready).length], ['allReadyLobby', 6], 'tutti i "pronto" simultanei sono arrivati');

  // 16 create insieme: 16 codici diversi
  const creates = await Promise.all(Array.from({ length: 16 }, (_, i) => room({ action: 'create', name: 'C' + i, club: 'Creato ' + i, div: 0 }, newIp())));
  eq([creates.filter((r) => r.status === 200).length, new Set(creates.map((r) => r.json && r.json.room && r.json.room.code)).size], [16, 16], '16 create simultanee: 16 stanze con codici diversi');

  // mentre l'host riscrive di continuo una stanza pesante, chi fa polling non vede MAI
  // "stanza non trovata" né JSON a metà (prima: file troncato e riscritto sul posto, letto senza lock)
  await host.act('startSession', { force: true });
  const heavy = career('Club Host', { blob: 'x'.repeat(400 * 1024) });
  let writing = true, writes = 0;
  const writer = (async () => { while (writing) { const r = await host.act('ready', { ready: true, state: Object.assign({}, heavy, { n: writes }) }); if (r.status === 200) writes++; } })();
  let polls = 0, bad = 0;
  const pollers = Array.from({ length: 6 }, () => (async () => {
    const ip = newIp();
    for (let i = 0; i < 25; i++) {
      const r = await state(host.code, ip);
      polls++;
      if (r.status !== 200 || !r.json || !r.json.ok || r.json.room.players.length !== 6) { bad++; if (bad < 4) console.log('    poll anomalo: ' + r.status + ' ' + r.text.slice(0, 120)); }
    }
  })());
  await Promise.all(pollers);
  writing = false; await writer;
  ok(writes >= 5, 'lo scrittore ha completato ' + writes + ' scritture pesanti durante il polling');
  eq([polls, bad], [150, 0], '150 poll durante le scritture: nessun 404/500/JSON rotto');
  ok(!listData().some((n) => /\.tmp/.test(n)), 'nessun file temporaneo rimasto dopo le scritture');

  // classifica: 10 invii simultanei da IP diversi, tutti salvati
  const posts = await Promise.all(Array.from({ length: 10 }, (_, i) => http('POST', 'leaderboard.php', { ip: newIp(), body: { club: 'Simultaneo ' + i, owner: 'Tizio', div: 2, startDiv: 0, season: 5, trophies: i % 3, worth: 1e6 * i, difficulty: 'medio' } })));
  eq(posts.filter((r) => r.status === 200).length, 10, '10 invii simultanei alla classifica: tutti accettati');
  const lb = await http('GET', 'leaderboard.php', { ip: newIp() });
  eq(lb.json.entries.filter((e) => /^Simultaneo /.test(e.club)).length, 10, '…e tutti presenti (nessuno sovrascritto)');
  // errori: 10 invii simultanei dello stesso errore -> una riga, contatore 10
  await Promise.all(Array.from({ length: 10 }, () => http('POST', 'errors.php', { ip: newIp(), body: { message: 'errore simultaneo', source: 'ui.js:1:1' } })));
  const row = readStore('errors').filter((e) => e.message === 'errore simultaneo');
  eq([row.length, row[0] && row[0].count], [1, 10], '10 segnalazioni simultanee dello stesso errore: una riga con contatore 10');
}

async function testRateLimits() {
  section('Rate-limit');
  const ip = newIp();
  let r = await room({ action: 'create', name: 'A', club: 'B', div: 0 }, ip);
  eq(r.status, 200, 'prima create');
  const code = r.json.room.code;
  r = await room({ action: 'create', name: 'A', club: 'B', div: 0 }, ip);
  eq([r.status, parseInt(r.headers.get('retry-after'), 10) > 0, r.json.ok], [429, true, false], 'seconda create dallo stesso IP entro 10s: 429 con Retry-After');

  const jip = newIp();
  const st = [];
  for (let i = 0; i < 8; i++) st.push((await room({ action: 'join', code, name: 'J' + i, club: 'Uguale' }, jip)).status);
  ok(st.slice(0, 6).every((s) => s !== 429) && st.slice(6).every((s) => s === 429), 'join: 6 tentativi ogni 10s per IP, poi 429 (' + st.join(',') + ')');

  const sip = newIp();
  const polls = await Promise.all(Array.from({ length: 50 }, () => state(code, sip, { port: BASE_PORT })));
  eq([polls.filter((p) => p.status === 200).length, polls.filter((p) => p.status === 429).length], [40, 10], 'state: 40 richieste ogni 5s per IP, il resto 429');

  // colpi a vuoto: dopo 30 codici/token sbagliati l'IP è fermo per tutte le azioni
  const mip = newIp();
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const miss = [];
  for (let i = 0; i < 32; i++) miss.push((await room({ action: 'chat', code: 'X' + abc[i % 24] + abc[(i * 7) % 24] + abc[(i * 5) % 24], playerId: 'p_000000000000', authToken: '0'.repeat(32), text: 'x' }, mip)).status);
  eq([miss.slice(0, 30).every((s) => s === 404), miss[30], miss[31]], [true, 429, 429], 'indovinare codici con azioni POST: 30 tentativi, poi 429');
  eq((await state(code, mip)).status, 429, '…e da lì anche state è bloccata per quell\'IP');
  eq((await state(code, newIp())).status, 200, 'gli altri IP non ne risentono');

  // chat: un messaggio al secondo per giocatore
  const cip = newIp();
  const chatter = player(code, await room({ action: 'join', code, name: 'Chat', club: 'Chiacchiere' }, cip), cip);
  eq((await chatter.act('chat', { text: 'uno' })).status, 200, 'primo messaggio');
  eq((await chatter.act('chat', { text: 'due' })).status, 429, 'secondo messaggio nello stesso secondo: 429');
  const dup = await chatter.act('chat', { text: 'uno' });
  eq([dup.status, dup.json.room.chat.length], [200, 1], 'stesso messaggio ripetuto subito: ok senza doppione');

  // classifica: un invio riuscito ogni 5 minuti; gli errori di validazione non bruciano il turno
  const lip = newIp();
  const entry = { club: 'Limite', owner: 'Tizio', div: 1, startDiv: 0, season: 3, trophies: 1, worth: 1e6, difficulty: 'medio' };
  eq((await http('POST', 'leaderboard.php', { ip: lip, body: Object.assign({}, entry, { div: 9 }) })).status, 400, 'invio non valido');
  eq((await http('POST', 'leaderboard.php', { ip: lip, body: entry })).status, 200, 'poi l\'invio corretto passa (l\'errore non ha bruciato il turno)');
  r = await http('POST', 'leaderboard.php', { ip: lip, body: Object.assign({}, entry, { club: 'Limite Due' }) });
  eq([r.status, parseInt(r.headers.get('retry-after'), 10) > 0], [429, true], 'secondo invio entro 5 minuti: 429');
  const fip = newIp(); const fl = [];
  for (let i = 0; i < 22; i++) fl.push((await http('POST', 'leaderboard.php', { ip: fip, raw: '{rotto' })).status);
  eq([fl.slice(0, 20).every((s) => s === 400), fl[20], fl[21]], [true, 429, 429], 'classifica: 20 tentativi al minuto per IP (anche se non validi), poi 429');

  const eip = newIp();
  eq((await http('POST', 'errors.php', { ip: eip, body: { message: 'boom 1' } })).status, 200, 'primo errore');
  eq((await http('POST', 'errors.php', { ip: eip, body: { message: 'boom 2' } })).status, 429, 'secondo errore entro 10s dallo stesso IP: 429');

  // IPv6: il limite vale per il /64, non per il singolo indirizzo
  eq((await http('POST', 'errors.php', { ip: '2001:db8:1:2:aaaa::1', body: { message: 'v6 a' } })).status, 200, 'errore da un indirizzo IPv6');
  eq((await http('POST', 'errors.php', { ip: '2001:db8:1:2:bbbb::9', body: { message: 'v6 b' } })).status, 429, 'altro indirizzo dello stesso /64: stesso limite');
  eq((await http('POST', 'errors.php', { ip: '2001:db8:1:3::1', body: { message: 'v6 c' } })).status, 200, 'un /64 diverso ha il suo limite');

  ok(!fs.readdirSync(DATA_DIR).filter((n) => /^rate_/.test(n) && n.endsWith('.json.php')).some((n) => /10\.\d+\.\d+\.\d+|2001:db8/.test(fs.readFileSync(path.join(DATA_DIR, n), 'utf8'))), 'nei file di rate-limit non c\'è nessun IP in chiaro');
}

async function testLifecycle() {
  section('Ciclo di vita della stanza');
  const host = await createRoom();
  const a = await joinRoom(host.code, 1); const b = await joinRoom(host.code, 2);
  // join mentre tutti sono pronti: la stanza non resta "tutti pronti"
  await host.act('ready', { ready: true }); await a.act('ready', { ready: true });
  let r = await b.act('ready', { ready: true });
  eq(r.json.room.phase, 'allReadyLobby', 'tutti pronti');
  const c = await joinRoom(host.code, 3);
  let st = await state(host.code, host.ip);
  eq(st.json.room.phase, 'lobby', 'entra un quarto giocatore: la stanza non è più "tutti pronti"');
  // adoptBot dell'unico non pronto: ora sono tutti pronti
  r = await host.act('adoptBot', { targetId: c.id });
  eq([r.status, r.json.room.phase, r.json.room.players[3].bot], [200, 'allReadyLobby', true], 'adoptBot dell\'unico che mancava: tutti pronti');
  r = await host.act('adoptBot', { targetId: c.id });
  eq(r.status, 200, 'adoptBot ripetuta: ok');
  r = await c.act('ready', { ready: false });
  eq(r.status, 409, 'un club adottato dalla IA non può più cambiare il proprio "pronto"');
  r = await a.act('proposeTrade', { targetId: c.id, playerName: 'Tizio', fee: 1 });
  eq(r.status, 404, 'niente trattative con un club adottato dalla IA');

  // l'host esce: passa a un umano, mai al bot; la fase torna lobby e i pronti si azzerano
  r = await host.act('leave');
  eq([r.status, r.json.room.hostId, r.json.room.phase, r.json.room.players.filter((p) => !p.bot).some((p) => p.ready)], [200, a.id, 'lobby', false], 'l\'host esce: il ruolo passa al primo umano rimasto');
  r = await host.act('chat', { text: 'x' });
  eq(r.status, 403, 'l\'ex host non è più nella stanza');
  r = await host.act('leave');
  eq([r.status, r.json.ok], [200, true], 'leave ripetuta: ok');
  r = await b.act('claimHost');
  eq(r.status, 409, 'claimHost con host attivo: 409');
  // host fermo da più di 15 minuti (si sposta indietro updatedAt nel file, come se il tempo fosse passato)
  const data = readStore('room_' + host.code);
  data.updatedAt = Math.floor(Date.now() / 1000) - 16 * 60;
  writeStore('room_' + host.code, data);
  r = await b.act('claimHost');
  eq([r.status, r.json.room.hostId], [200, b.id], 'claimHost dopo 15 minuti di silenzio: accettato');
  ok(r.json.room.updatedAt >= Math.floor(Date.now() / 1000) - 2, 'updatedAt torna all\'ora corrente dopo un salto');
  r = await b.act('claimHost');
  eq(r.status, 200, 'claimHost da chi è già host: ok');

  // orologio del server tornato indietro: updatedAt nel futuro non blocca né rompe nulla
  const data2 = readStore('room_' + host.code);
  data2.updatedAt = Math.floor(Date.now() / 1000) + 3600;
  writeStore('room_' + host.code, data2);
  r = await b.act('announce', { text: 'dopo il salto' });
  eq([r.status, r.json.room.updatedAt > data2.updatedAt], [200, true], 'updatedAt nel futuro (orologio tornato indietro): resta crescente, nessun errore');

  // escono tutti: la stanza sparisce
  await a.act('leave'); await b.act('leave');
  r = await c.act('leave');
  eq([r.status, r.json.ok, 'room' in r.json], [200, true, false], 'esce l\'ultimo');
  eq((await state(host.code, newIp())).status, 404, 'stanza vuota: cancellata (404)');
  ok(!fs.existsSync(path.join(DATA_DIR, 'room_' + host.code + '.json.php')), 'il file della stanza non c\'è più');

  // join ripetuto con requestId: stesso posto, stesse credenziali
  const h2 = await createRoom();
  const jip = newIp(); const reqId = 'req_' + 'k'.repeat(24);
  const j1 = await room({ action: 'join', code: h2.code, name: 'Retry', club: 'Riprova FC', requestId: reqId }, jip);
  const j2 = await room({ action: 'join', code: h2.code, name: 'Retry', club: 'Riprova FC', requestId: reqId }, jip);
  eq([j1.status, j2.status, j2.json.playerId === j1.json.playerId, j2.json.authToken === j1.json.authToken, j2.json.room.players.length], [200, 200, true, true, 2], 'join ripetuto con lo stesso requestId: stesso giocatore, stesso token, nessun doppione');
  const j3 = await room({ action: 'join', code: h2.code, name: 'Retry', club: 'Riprova FC' }, newIp());
  eq(j3.status, 400, 'join ripetuto senza requestId: "c\'è già un club con questo nome" (come prima)');
  const j4 = await room({ action: 'join', code: h2.code, name: 'Altro', club: 'Altro FC', requestId: 'req_' + 'z'.repeat(24) }, newIp());
  ok(j4.status === 200 && j4.json.playerId !== j1.json.playerId, 'un requestId diverso è un giocatore diverso');
  eq((await player(h2.code, j2, jip).act('chat', { text: 'funziona' })).status, 200, 'il token ottenuto dal join ripetuto funziona');
  ok(!/joinKey/.test((await state(h2.code, jip)).text), 'la chiave di idempotenza non compare nello stato pubblico');

  section('Pulizia delle stanze vecchie');
  const old = await createRoom(); const young = await createRoom(); const started = await createRoom();
  const g = await joinRoom(started.code, 1); await started.act('startSession', { force: true });
  const days = (n) => new Date(Date.now() - n * 86400 * 1000);
  const f = (code) => path.join(DATA_DIR, 'room_' + code + '.json.php');
  fs.utimesSync(f(old.code), days(31), days(31));        // lobby mai partita, ferma da 31 giorni
  fs.utimesSync(f(started.code), days(100), days(100));  // dynasty avviata, ferma da 100 giorni: resta
  fs.writeFileSync(f('DEAD'), GUARD + '{"v":2,"code":"DEAD","phase":"session","players":[{"id":"p_111111111111"}]}');
  fs.utimesSync(f('DEAD'), days(181), days(181));        // oltre i 180 giorni: via comunque
  const leftover = path.join(DATA_DIR, 'room_XXXX.json.php.tmpdeadbeef');
  fs.writeFileSync(leftover, 'resto di una scrittura interrotta');
  fs.utimesSync(leftover, days(1), days(1));
  try { fs.unlinkSync(path.join(DATA_DIR, 'cleanup.stamp')); } catch (e) {}
  await createRoom();   // fa scattare la pulizia
  eq([fs.existsSync(f(old.code)), fs.existsSync(f(young.code)), fs.existsSync(f(started.code)), fs.existsSync(f('DEAD'))], [false, true, true, false], 'pulizia: via la lobby abbandonata e la stanza scaduta, restano quella recente e la dynasty avviata');
  ok(!listData().some((n) => /\.tmp/.test(n)), 'pulizia: via anche i file temporanei rimasti');
  eq((await g.act('chat', { text: 'ancora vivi' })).status, 200, 'la dynasty avviata è ancora utilizzabile dopo la pulizia');
}

async function testLeaderboard() {
  section('Classifica');
  const base = { club: 'Atletico Test', owner: 'Mario D\'Amico', div: 5, startDiv: 0, season: 15, trophies: 6, worth: 3.2e8, difficulty: 'difficile', trophyBreakdown: { titles: [1, 1, 0, 1, 0, 1], nat: 1, ucl: 1, uel: 0, conf: 0, total: 6 } };
  const post = (over, ip, extra) => http('POST', 'leaderboard.php', Object.assign({ ip: ip || newIp(), body: Object.assign({}, base, over || {}) }, extra || {}));
  let r = await post();
  eq([r.status, r.json.entry.score, r.json.entry.boardSeason, r.json.entry.trophyBreakdown.titles], [200, Math.round((6 * 5000 + 5 * 500 + 5 * 500 + 320) * 1.35), 3, [1, 1, 0, 1, 0, 1]], 'invio valido: punteggio calcolato dal server');
  r = await post({ club: '<script>alert(1)</script>Borgo', owner: '  Zoë   "la"   Regina  ', div: '3', startDiv: 3, trophies: 0, trophyBreakdown: undefined, difficulty: 'sconosciuta', score: 99999999 });
  eq([r.status, r.json.entry.club, r.json.entry.owner, r.json.entry.div, r.json.entry.difficulty, r.json.entry.score < 100000], [200, 'scriptalert1scriptBorgo', 'Zoë la Regina', 3, 'medio', true], 'nomi ripuliti, difficoltà sconosciuta -> medio, il punteggio inviato dal client è ignorato');
  const reject = async (over, why) => { const x = await post(over); eq([x.status, x.json && x.json.ok], [400, false], 'rifiutato: ' + why); };
  await reject({ club: '' }, 'club mancante');
  await reject({ owner: '!!!' }, 'presidente fatto solo di caratteri vietati');
  await reject({ div: 6 }, 'categoria inesistente');
  await reject({ div: 'abc' }, 'categoria non numerica');
  await reject({ season: 0 }, 'stagione 0');
  await reject({ season: 60 }, 'stagione oltre la durata di una dynasty');
  await reject({ worth: -1 }, 'valore negativo');
  await reject({ worth: 1e14 }, 'valore assurdo');
  await reject({ trophies: 61, trophyBreakdown: undefined }, 'più di 4 trofei a stagione');
  await reject({ trophies: -1, trophyBreakdown: undefined }, 'trofei negativi');
  await reject({ season: 2, div: 5, startDiv: 0, trophies: 0, trophyBreakdown: undefined }, 'dalla Promozione alla Serie A in 2 stagioni');
  await reject({ season: 6, trophies: 3, trophyBreakdown: { titles: [1, 0, 0, 0, 0, 0], nat: 0, ucl: 2, uel: 0, conf: 0 } }, 'due Champions con una sola stagione possibile in Serie A');
  await reject({ trophies: 2, trophyBreakdown: { titles: [1, 1, 1, 1, 1, 1], nat: 0, ucl: 0, uel: 0, conf: 0 } }, 'dettaglio trofei maggiore del totale');
  await reject({ season: 3, div: 3, trophies: 12, trophyBreakdown: { titles: [3, 0, 0, 0, 0, 0], nat: 3, ucl: 0, uel: 0, conf: 0 } }, 'totale trofei non spiegato dal dettaglio');
  await reject({ season: 3, startDiv: 5, trophies: 4, trophyBreakdown: { titles: [0, 0, 0, 0, 0, 4], nat: 0, ucl: 0, uel: 0, conf: 0 } }, 'più titoli che stagioni');
  r = await post({ club: 'Vecchio Client', startDiv: undefined, trophyBreakdown: undefined, trophies: 2 });
  eq([r.status, r.json.entry.startDiv], [200, 5], 'client vecchio senza startDiv/dettaglio: accettato, nessuna scalata assunta');

  // una voce per club+presidente: resta la migliore
  r = await post({ trophies: 2, trophyBreakdown: undefined });
  eq(r.status, 200, 'stessa carriera inviata di nuovo con punteggio più basso: ok');
  let lb = await http('GET', 'leaderboard.php', { ip: newIp() });
  let same = lb.json.entries.filter((e) => e.club === 'Atletico Test');
  eq([same.length, same[0].trophies], [1, 6], '…ma in classifica resta una sola voce, la migliore');
  r = await post({ club: 'ATLETICO test', trophies: 9, trophyBreakdown: undefined });
  lb = await http('GET', 'leaderboard.php', { ip: newIp() });
  same = lb.json.entries.filter((e) => e.club.toLowerCase() === 'atletico test');
  eq([same.length, same[0].trophies], [1, 9], 'un invio migliore (anche con maiuscole diverse) sostituisce il precedente');
  ok(lb.json.entries.every((e, i, a) => i === 0 || a[i - 1].score >= e.score), 'classifica ordinata per punteggio');
  ok(lb.json.entries.length <= 50 && lb.json.currentSeason === 3, 'al più 50 voci restituite, con la stagione corrente');
  ok(/no-store/.test(lb.headers.get('cache-control') || ''), 'la classifica non va in cache');

  // tetto alle voci salvate
  const many = readStore('leaderboard');
  for (let i = 0; i < 150; i++) many.push({ club: 'Riempitivo ' + i, owner: 'Bot', div: 0, startDiv: 0, season: 1, boardSeason: 3, trophies: 0, worth: 0, difficulty: 'facile', score: i, ts: 1 });
  writeStore('leaderboard', many);
  await post({ club: 'Ultimo Arrivato', trophies: 1, trophyBreakdown: undefined });
  eq(readStore('leaderboard').length, 100, 'sul disco restano al più 100 voci (le migliori)');

  section('Origine delle richieste (CSRF)');
  r = await post({ club: 'Da Fuori' }, null, { headers: { Origin: 'https://sito-cattivo.example' } });
  eq(r.status, 403, 'POST con Origin di un altro sito: 403');
  r = await post({ club: 'Da Fuori' }, null, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  eq(r.status, 403, 'POST con Sec-Fetch-Site: cross-site: 403');
  r = await post({ club: 'Da Fuori' }, null, { headers: { 'Sec-Fetch-Site': 'same-site' } });
  eq(r.status, 403, 'POST da un altro sottodominio dello stesso hosting (same-site): 403');
  r = await post({ club: 'Da Fuori' }, null, { headers: { Origin: 'null' } });
  eq(r.status, 403, 'POST con Origin "null" (pagina sandbox/file): 403');
  r = await room({ action: 'create', name: 'A', club: 'B', div: 0 }, newIp(), { headers: { Origin: 'https://sito-cattivo.example' } });
  eq(r.status, 403, 'room.php: POST con Origin di un altro sito: 403');
  r = await http('POST', 'errors.php', { ip: newIp(), body: { message: 'x' }, headers: { Origin: 'http://127.0.0.1.evil.example' } });
  eq(r.status, 403, 'errors.php: Origin che "somiglia" al nostro host: 403');
  r = await post({ club: 'Da Dentro' }, null, { port: BASE_PORT, headers: { Origin: 'http://127.0.0.1:' + BASE_PORT, 'Sec-Fetch-Site': 'same-origin' } });
  eq(r.status, 200, 'POST con Origin del nostro stesso host: accettata');
  r = await post({ club: 'Safari Vecchio' }, null, { port: BASE_PORT, headers: { Origin: 'http://127.0.0.1:' + BASE_PORT } });
  eq(r.status, 200, 'browser senza Sec-Fetch-Site: basta che l\'host di Origin sia il nostro');
  r = await post({ club: 'Finto Proxy' }, null, { headers: { Origin: 'https://sito-cattivo.example', 'X-Forwarded-Host': 'altro.example' } });
  eq(r.status, 403, 'Origin estraneo con X-Forwarded-Host diverso: 403');
  r = await http('POST', 'leaderboard.php', { ip: newIp(), raw: JSON.stringify(Object.assign({}, base, { club: 'Testo Semplice' })), headers: { 'Content-Type': 'text/plain' } });
  eq(r.status, 200, 'POST senza Origin (curl, script): passa — non è da lì che arriva un CSRF');
  ok(!(await http('GET', 'leaderboard.php', { ip: newIp(), headers: { Origin: 'https://sito-cattivo.example' } })).headers.get('access-control-allow-origin'), 'nessun header CORS: un altro sito non può leggere le risposte');
}

async function testCorruption() {
  section('Dati corrotti');
  const host = await createRoom();
  const file = path.join(DATA_DIR, 'room_' + host.code + '.json.php');
  fs.writeFileSync(file, GUARD + '{"code":"' + host.code + '","players":[{"id":');
  let r = await state(host.code, host.ip);
  eq([r.status, r.json && r.json.ok], [500, false], 'stanza con file rovinato: 500 "riprova" (non 404: il client non deve buttare la sessione)');
  r = await host.act('chat', { text: 'x' });
  eq([r.status, r.json && r.json.ok], [500, false], 'azione su stanza rovinata: 500 JSON');
  fs.writeFileSync(file, '');
  eq((await state(host.code, host.ip)).status, 500, 'stanza con file vuoto: 500');
  fs.unlinkSync(file);

  // classifica rovinata: si riparte dalla copia di riserva
  const good = readStore('leaderboard').length;
  ok(good > 0 && fs.existsSync(path.join(DATA_DIR, 'leaderboard.json.php.bak')), 'la classifica ha una copia di riserva');
  fs.writeFileSync(path.join(DATA_DIR, 'leaderboard.json.php'), GUARD + '[{"club":"tronc');
  r = await http('GET', 'leaderboard.php', { ip: newIp() });
  ok(r.status === 200 && r.json.entries.length > 0, 'classifica rovinata: risponde comunque, dalla copia di riserva (' + (r.json && r.json.entries.length) + ' voci)');
  r = await http('POST', 'leaderboard.php', { ip: newIp(), body: { club: 'Dopo il guasto', owner: 'Tizio', div: 0, season: 1, trophies: 0, worth: 1, difficulty: 'facile' } });
  eq(r.status, 200, 'e si può di nuovo scrivere');
  ok(readStore('leaderboard').length >= good - 1, 'le voci recuperate dalla riserva sono state conservate');
  const bak = fs.readFileSync(path.join(DATA_DIR, 'leaderboard.json.php.bak'), 'utf8');
  ok(!bak.includes('"tronc'), 'il file rovinato non ha sovrascritto la copia di riserva');
  // voci "strane" scritte a mano nel file: mai rimandate al client così come sono
  const entries = readStore('leaderboard');
  entries.push({ club: '<img src=x onerror=alert(1)>', owner: 'A"B', div: 'tre', season: -5, trophies: 1e9, worth: 'tanto', score: 999999999, difficulty: 'dio', extra: { x: 1 } }, 'non un oggetto', null);
  writeStore('leaderboard', entries);
  r = await http('GET', 'leaderboard.php', { ip: newIp() });
  const odd = r.json.entries[0];
  eq([r.status, odd.club, odd.owner, odd.div, odd.season, odd.trophies, odd.difficulty, 'extra' in odd], [200, 'img srcx onerroralert1', 'AB', 0, 1, 500, 'medio', false], 'voce manomessa nel file: normalizzata in uscita');
  fs.writeFileSync(path.join(DATA_DIR, 'rate_room_state.json.php'), 'spazzatura');
  eq((await state('NONE', newIp())).status, 404, 'file di rate-limit rovinato: l\'endpoint funziona lo stesso');
}

async function testErrors() {
  section('Raccolta errori');
  let r = await http('GET', 'errors.php', { ip: newIp() });
  eq(r.status, 405, 'GET: 405 (il log non è pubblico)');
  r = await http('POST', 'errors.php', { ip: newIp(), body: { stack: 'solo stack' } });
  eq(r.status, 400, 'senza messaggio: 400');
  r = await http('POST', 'errors.php', { ip: newIp(), body: { message: ['a'] } });
  eq(r.status, 400, 'messaggio non stringa: 400');
  const before = readStore('errors').length;
  const payload = { message: 'TypeError: x is <b>undefined</b>\u0000\u0007', stack: 'at f (ui.js:10:5)\n\tat <anonymous>', url: 'https://esempio.it/gioco/index.html?token=segreto#frag', source: 'ui.js:10:5', v: '73', extra: 'ignorato' };
  r = await http('POST', 'errors.php', { ip: newIp(), body: payload, headers: { 'User-Agent': 'TestAgent/1.0 <script>' } });
  eq(r.status, 200, 'errore valido: salvato');
  let log = readStore('errors');
  const e = log[log.length - 1];
  eq([log.length, e.message, e.stack, e.url, e.v, e.count, e.ua, 'extra' in e], [before + 1, 'TypeError: x is ‹b›undefined‹/b›', 'at f (ui.js:10:5)\n\tat ‹anonymous›', 'https://esempio.it/gioco/index.html', '73', 1, 'TestAgent/1.0 ‹script›', false], 'testo ripulito (niente tag né caratteri di controllo), URL senza query, campi extra scartati');
  ok(!fs.readFileSync(path.join(DATA_DIR, 'errors.json.php'), 'utf8').slice(GUARD.length).includes('<'), 'nessun "<" nel file del log');
  for (let i = 0; i < 3; i++) await http('POST', 'errors.php', { ip: newIp(), body: payload });
  log = readStore('errors');
  eq([log.length, log[log.length - 1].count], [before + 1, 4], 'lo stesso errore da 4 client: una riga sola con il contatore a 4');
  r = await http('POST', 'errors.php', { ip: newIp(), body: { message: 'indirizzo strano', url: 'javascript:alert(1)' } });
  eq(readStore('errors').pop().url, '', 'URL che non è http(s): scartato');
  // tetto alle voci e tetto globale all'ora
  const many = []; for (let i = 0; i < 320; i++) many.push({ message: 'vecchio ' + i, stack: '', url: '', source: '', v: '', ts: 1, count: 1 });
  writeStore('errors', many);
  await http('POST', 'errors.php', { ip: newIp(), body: { message: 'nuovo di zecca' } });
  log = readStore('errors');
  eq([log.length, log[log.length - 1].message, log[0].message], [300, 'nuovo di zecca', 'vecchio 21'], 'restano le 300 voci più recenti');
  const rate = readStore('rate_err_global'); rate.all = [Math.floor(Date.now() / 1000), 240]; writeStore('rate_err_global', rate);
  r = await http('POST', 'errors.php', { ip: newIp(), body: { message: 'oltre il tetto globale' } });
  eq([r.status, r.json.ok, r.json.dropped, readStore('errors').pop().message], [200, true, true, 'nuovo di zecca'], 'tetto globale all\'ora raggiunto: risposta ok ma nulla viene salvato');
}

async function testInfoLeaks() {
  section('Nessuna informazione sul server nelle risposte');
  const auth = '"code":"OLDR","playerId":"p_aaaaaaaaaaaa","authToken":"' + 'a'.repeat(32) + '"';
  const probes = [
    await http('POST', 'room.php', { raw: '{"action":"create","name":{"a":[1,2,{"b":null}]},"club":12.5,"div":"x"}', ip: newIp() }),
    await http('GET', 'room.php?action[]=state&code[][x]=1', { ip: newIp() }),
    await http('POST', 'leaderboard.php', { raw: '{"club":{"x":1},"owner":[[]],"div":{},"season":[],"trophies":"NaN","worth":"1e999","trophyBreakdown":"x"}', ip: newIp() }),
    await http('POST', 'leaderboard.php', { raw: '{"club":"A","owner":"B","div":1,"season":2,"trophies":1,"worth":1,"trophyBreakdown":{"titles":{"a":"x"},"nat":[],"ucl":{},"uel":null,"conf":"9"}}', ip: newIp() }),
    await http('POST', 'errors.php', { raw: '{"message":{"x":1},"stack":[1]}', ip: newIp() }),
    await http('POST', 'room.php', { raw: '{"action":"ready","code":{"x":1},"playerId":["a"],"state":[]}', ip: newIp() }),
    await http('POST', 'room.php', { raw: '{"action":"ready",' + auth + ',"ready":true,"state":{"club":["x"],"squad":{"a":1}}}', ip: newIp() }),
    await http('POST', 'room.php', { raw: '{"action":"respondTrade",' + auth + ',"tradeId":{"x":1},"response":[]}', ip: newIp() }),
    await http('POST', 'room.php', { raw: '{"action":"proposeTrade",' + auth + ',"targetId":"p_bbbbbbbbbbbb","playerName":"Tizio","fee":5,"offerPlayerName":"Caio","offerPlayerSnapshot":"x"}', ip: newIp() }),
    await http('POST', 'room.php', { raw: '{"action":"pushMatchday",' + auth + ',"matchday":1,"total":38,"groups":[1,"x",null,[],{"div":"y"}],"force":true}', ip: newIp() }),
    await http('POST', 'room.php', { raw: '{"action":"submitResult",' + auth + ',"results":{"p_aaaaaaaaaaaa":{"squad":"x","manager":7,"_end":{"trophies":{"a":1},"pos":"x","exp":[]},"season":"due"},"p_bbbbbbbbbbbb":null},"force":true}', ip: newIp() }),
  ];
  let clean = true;
  probes.forEach((p, i) => {
    const leaks = /Warning|Notice|Fatal|Deprecated|Stack trace|on line \d|\.php\b|[A-Za-z]:\\\\|\/home\/|\/var\//.test(p.text);
    if (leaks || !p.json || typeof p.json.ok !== 'boolean' || p.status >= 500) { clean = false; console.log('    sonda ' + i + ': ' + p.status + ' ' + p.text.slice(0, 200)); }
  });
  ok(clean, 'input malformati di ogni tipo: sempre JSON {ok:…}, mai un avviso PHP, un percorso o un 500');
  ok(probes.every((p) => /application\/json/.test(p.headers.get('content-type') || '')), 'sempre Content-Type: application/json');
}

/* ============================================================ */

(async () => {
  seedLegacy();
  startServers();
  try {
    await waitServers();
    await testMigration();
    await testLibrary();
    await testRoomHappyPath();
    await testUpdatedAtAndEtag();
    await testValidation();
    await testAuth();
    await testTraversal();
    await testConcurrency();
    await testRateLimits();
    await testLifecycle();
    await testLeaderboard();
    await testCorruption();
    await testErrors();
    await testInfoLeaks();
  } catch (e) {
    failed++; failures.push('ECCEZIONE: ' + (e && e.stack || e));
    console.log('\nECCEZIONE: ' + (e && e.stack || e));
  } finally {
    cleanup();
  }
  console.log('\n' + passed + ' asserzioni superate, ' + failed + ' fallite.');
  if (failed) { console.log('\nFallite:\n- ' + failures.join('\n- ')); process.exit(1); }
})();
