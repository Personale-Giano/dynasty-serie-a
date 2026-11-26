<?php
/* ==========================================================================
   QUIZZOTTI — Tutti contro la TV: la stanza condivisa tra TV e telefoni
   GET  tuttitv.php?code=ABCD&tok=...&v=12   -> stato (o {"u":1} se invariato)
   POST tuttitv.php  {"a":"azione", "code":..., "tok":..., ...}
   Le stanze sono file JSON in api/stanze (protetti da .htaccess), con il
   prefisso tv- per non incrociarsi con quelle di Nomi, Cose, Calcio, scritti
   sotto flock. Spariscono da sole dopo due giorni. Le domande le legge da
   api/tuttitv-domande.json (generato da scripts/build-tuttitv.js).
   ========================================================================== */
declare(strict_types=1);
require __DIR__ . '/tuttitv-core.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const TV_DIR = __DIR__ . '/stanze';
const TV_BANK = __DIR__ . '/tuttitv-domande.json';
const TV_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // niente I e O, si confondono con 1 e 0
const TV_TTL = 172800;                              // 2 giorni
const TV_CREATE_PER_HOUR = 30;

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_dir() {
    if (!is_dir(TV_DIR)) @mkdir(TV_DIR, 0755, true);
    $ht = TV_DIR . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
}

function room_path($code) { return TV_DIR . '/tv-' . $code . '.json'; }

function valid_code($c) { return is_string($c) && preg_match('/^[A-Z]{4}$/', $c); }

function bank() {
    static $b = null;
    if ($b === null) $b = tv_load_bank(TV_BANK);
    if (!$b) out(['err' => 'Domande non disponibili, riprova più tardi'], 503);
    return $b;
}

/** Apre la stanza sotto lock esclusivo, passa l'array alla funzione e salva se cambia. */
function with_room($code, callable $fn) {
    if (!valid_code($code)) out(['err' => 'Codice stanza non valido'], 400);
    $path = room_path($code);
    if (!is_file($path)) out(['err' => 'Stanza non trovata: controlla il codice', 'gone' => 1], 404);
    $fh = fopen($path, 'c+');
    if (!$fh) out(['err' => 'Stanza non disponibile, riprova'], 503);
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $r = json_decode($raw ?: '', true);
    if (!is_array($r)) { flock($fh, LOCK_UN); fclose($fh); out(['err' => 'Stanza rovinata, creane una nuova', 'gone' => 1], 410); }
    $before = $r['v'];
    $res = $fn($r);
    $dirty = !empty($res['_dirty']) || (isset($res['ok']) && !isset($res['err']));
    if ($dirty || !empty($res['_touch'])) {
        if ($dirty) { $r['v'] = $before + 1; $r['updated'] = time(); }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($r, JSON_UNESCAPED_UNICODE));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    unset($res['_dirty'], $res['_touch']);
    return [$r, $res];
}

function cleanup() {
    $now = time();
    foreach (glob(TV_DIR . '/tv-*.json') ?: [] as $f) {
        if ($now - (int)@filemtime($f) > TV_TTL) @unlink($f);
    }
}

function rate_ok() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $f = TV_DIR . '/_tvip-' . substr(hash('sha256', $ip . 'quizzotti-tv'), 0, 16) . '.json';
    $list = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
    $now = time();
    $list = array_values(array_filter($list, function ($t) use ($now) { return $now - $t < 3600; }));
    if (count($list) >= TV_CREATE_PER_HOUR) return false;
    $list[] = $now;
    @file_put_contents($f, json_encode($list));
    return true;
}

function who($r, $tok) {
    $isHost = is_string($tok) && $tok !== '' && hash_equals($r['hostTok'], $tok);
    $me = '';
    foreach ($r['players'] as $p) if (is_string($tok) && $tok !== '' && hash_equals($p['tok'], $tok)) $me = $p['id'];
    $boss = $isHost || ($me !== '' && $me === tv_captain($r));
    return [$me, $isHost, $boss];
}

ensure_dir();
$now = microtime(true);   // al millesimo: la velocita' delle risposte si misura qui

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = strtoupper((string)($_GET['code'] ?? ''));
    $tok = (string)($_GET['tok'] ?? '');
    $v = (int)($_GET['v'] ?? -1);
    [$r, $res] = with_room($code, function (&$r) use ($tok, $now, $v) {
        $changed = tv_tick($r, $now);
        [$me] = who($r, $tok);
        $touch = false;
        if ($me !== '') {
            $i = tv_player_index($r, $me);
            if ($now - ($r['players'][$i]['last'] ?? 0) >= 8) { $r['players'][$i]['last'] = $now; $touch = true; }
        }
        return ['_dirty' => $changed, '_touch' => $touch, 'same' => !$changed && $v === $r['v']];
    });
    if ($res['same']) out(['u' => 1, 'now' => round($now, 3)]);
    [$me, $isHost] = who($r, $tok);
    out(tv_public($r, $me, $isHost, $now));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['err' => 'Metodo non ammesso'], 405);
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) out(['err' => 'Richiesta non valida'], 400);
$a = (string)($in['a'] ?? '');

if ($a === 'create') {
    if (!rate_ok()) out(['err' => 'Troppe stanze create: riprova tra un po\''], 429);
    cleanup();
    $b = bank();
    $hostTok = bin2hex(random_bytes(16));
    for ($try = 0; $try < 30; $try++) {
        $code = '';
        for ($i = 0; $i < 4; $i++) $code .= TV_CODE_CHARS[random_int(0, strlen(TV_CODE_CHARS) - 1)];
        $fh = @fopen(room_path($code), 'x');   // 'x': fallisce se il codice esiste gia'
        if (!$fh) continue;
        $r = tv_new_room($code, $hostTok, $now, $b['themes'], (array)($in['opts'] ?? []));
        fwrite($fh, json_encode($r, JSON_UNESCAPED_UNICODE));
        fclose($fh);
        out(['code' => $code, 'tok' => $hostTok, 'state' => tv_public($r, '', true, $now)]);
    }
    out(['err' => 'Non riesco a creare la stanza, riprova'], 503);
}

$code = strtoupper((string)($in['code'] ?? ''));
$tok = (string)($in['tok'] ?? '');

if ($a === 'join') {
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) out(['err' => 'Telefono non riconosciuto, ricarica la pagina'], 400);
    [$r, $res] = with_room($code, function (&$r) use ($in, $tok, $now) {
        tv_tick($r, $now);
        return tv_join($r, (string)($in['name'] ?? ''), $tok, $now) + ['_dirty' => true];
    });
    if (isset($res['err'])) out($res, 400);
    out(['pid' => $res['pid'], 'state' => tv_public($r, $res['pid'], false, $now)]);
}

// mt_rand (usato da shuffle) con un seme imprevedibile: le domande non si indovinano
mt_srand(random_int(0, PHP_INT_MAX));
$BOSS = ['opts', 'start', 'next', 'close', 'hold', 'end', 'rematch', 'kick'];
[$r, $res] = with_room($code, function (&$r) use ($a, $in, $tok, $now, $BOSS) {
    tv_tick($r, $now);
    [$me, , $boss] = who($r, $tok);
    // chi manda qualcosa e' collegato, anche se il polling e' rimasto indietro
    if ($me !== '') $r['players'][tv_player_index($r, $me)]['last'] = $now;
    if (in_array($a, $BOSS, true) && !$boss) return ['err' => 'Solo la TV o il capitano possono farlo'];
    if (!$boss && $me === '') return ['err' => 'Entra prima nella stanza'];
    switch ($a) {
        case 'opts':
            if (!in_array($r['phase'], ['lobby', 'end'], true)) return ['err' => 'Le impostazioni si cambiano prima della partita'];
            $r['opts'] = tv_opts($r, $r['opts'], (array)($in['opts'] ?? []));
            return ['ok' => 1];
        case 'start': return tv_start($r, $now, bank());
        case 'answer':
            if ($me === '') return ['err' => 'Solo i giocatori rispondono'];
            $c = $in['c'] ?? null;
            return tv_answer($r, $me, (int)($in['n'] ?? 0), is_int($c) ? $c : -1, $now);
        case 'next': return tv_next($r, $now);
        case 'close': return $r['phase'] === 'ask' ? tv_close($r, $now) : ['err' => 'Nessuna domanda aperta'];
        case 'hold': return tv_hold($r, !empty($in['on']), $now);
        case 'end': return tv_end($r, $now);
        case 'rematch': return tv_rematch($r);
        case 'kick': return tv_kick($r, (string)($in['pid'] ?? ''));
    }
    return ['err' => 'Azione sconosciuta'];
});
if (isset($res['err'])) out($res, 400);
[$me, $isHost] = who($r, $tok);
out(['ok' => 1, 'state' => tv_public($r, $me, $isHost, $now)]);
