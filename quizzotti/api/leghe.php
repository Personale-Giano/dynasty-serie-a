<?php
/* ==========================================================================
   QUIZZOTTI — Leghe tra amici
   GET  leghe.php?code=ABC234&tok=...      -> stato della lega (completo per i membri)
   POST leghe.php  {"a":"azione", ...}
     create {name, nick, tok}              crea la lega ed entra per primo
     join   {code, nick, tok}              entra con un soprannome
     submit {codes:[...], tok, game, n, result}   risultato di un gioco del giorno
     rename {code, tok, nick} · leave {code, tok} · kick {code, tok, mid}
   Niente account: ogni telefono ha un gettone segreto (32 cifre esadecimali,
   in localStorage) e il server ne tiene solo l'impronta sha256. Le leghe
   sono file JSON in api/leghe (protetti da .htaccess), scritti sotto flock;
   una lega che nessuno tocca da 180 giorni sparisce.
   ========================================================================== */
declare(strict_types=1);
require __DIR__ . '/leghe-core.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// cartella e orologio si cambiano solo per le prove in locale (variabili d'ambiente del server)
define('LG_DIR', getenv('QZ_LEGHE_DIR') ?: __DIR__ . '/leghe');
define('LG_TEST', getenv('QZ_LEGHE_TEST') === '1');
const LG_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // niente I, L, O, 0, 1: si confondono
const LG_CODE_LEN = 6;
const LG_TTL = 15552000;              // 180 giorni senza movimenti
const LG_CREATE_PER_HOUR = 5;
const LG_JOIN_PER_HOUR = 40;
const LG_MAX_BODY = 4096;
const LG_MAX_FILE = 1000000;
const LG_MAX_CODES = 10;              // leghe per telefono a cui mandare un risultato

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_dir() {
    if (!is_dir(LG_DIR)) @mkdir(LG_DIR, 0755, true);
    $ht = LG_DIR . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
}

function league_path($code) { return LG_DIR . '/L-' . $code . '.json'; }

function norm_code($c) { return substr(preg_replace('/[^A-Z0-9]/', '', strtoupper(is_string($c) ? $c : '')) ?? '', 0, 12); }

function valid_code($c) { return is_string($c) && preg_match('/^[' . LG_CODE_CHARS . ']{' . LG_CODE_LEN . '}$/', $c) === 1; }

function valid_tok($t) { return is_string($t) && preg_match('/^[a-f0-9]{32}$/', $t) === 1; }

/** Impronta del gettone: nel file non finisce mai il gettone in chiaro. */
function tok_hash($t) { return valid_tok($t) ? hash('sha256', 'qz-leghe|' . $t) : ''; }

function read_league($code) {
    if (!valid_code($code) || !is_file(league_path($code))) return null;
    $fh = @fopen(league_path($code), 'r');
    if (!$fh) return null;
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $L = json_decode($raw ?: '', true);
    return is_array($L) ? $L : null;
}

/**
 * Apre la lega sotto lock esclusivo, passa l'array alla funzione e salva se
 * la funzione restituisce '_dirty'. Una lega rimasta vuota si cancella.
 * Restituisce [lega, risposta] oppure [null, ['err', 'gone']].
 */
function with_league($code, callable $fn, $now) {
    if (!valid_code($code)) return [null, ['err' => 'Codice lega non valido', 'gone' => 1]];
    $path = league_path($code);
    if (!is_file($path)) return [null, ['err' => 'Lega non trovata: controlla il codice', 'gone' => 1]];
    $fh = @fopen($path, 'c+');
    if (!$fh) return [null, ['err' => 'Lega non disponibile, riprova']];
    flock($fh, LOCK_EX);
    $L = json_decode(stream_get_contents($fh) ?: '', true);
    if (!is_array($L) || !isset($L['members'])) { flock($fh, LOCK_UN); fclose($fh); return [null, ['err' => 'Lega non trovata', 'gone' => 1]]; }
    $res = $fn($L);
    if (!empty($res['_dirty'])) {
        lg_compact($L, $now);
        $L['v']++;
        $L['updated'] = $now;
        $json = json_encode($L, JSON_UNESCAPED_UNICODE);
        if (strlen($json) > LG_MAX_FILE) {
            $res = ['err' => 'La lega è troppo piena: niente posto per altri risultati'];
        } elseif (!$L['members']) {
            ftruncate($fh, 0);
            $res['_delete'] = 1;
        } else {
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, $json);
            fflush($fh);
        }
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    if (!empty($res['_delete'])) @unlink($path);
    unset($res['_dirty'], $res['_delete']);
    return [$L, $res];
}

function cleanup($now) {
    foreach (glob(LG_DIR . '/L-*.json') ?: [] as $f) {
        if ($now - (int)@filemtime($f) > LG_TTL) @unlink($f);
    }
    foreach (glob(LG_DIR . '/_ip-*.json') ?: [] as $f) {
        if ($now - (int)@filemtime($f) > 7200) @unlink($f);
    }
}

/** Limite per indirizzo IP (creazioni, ingressi) nell'ultima ora. */
function rate_ok($kind, $max, $now) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $f = LG_DIR . '/_ip-' . $kind . '-' . substr(hash('sha256', $ip . 'quizzotti-leghe'), 0, 16) . '.json';
    $fh = @fopen($f, 'c+');
    if (!$fh) return true;
    flock($fh, LOCK_EX);
    $list = json_decode(stream_get_contents($fh) ?: '', true);
    $list = array_values(array_filter(is_array($list) ? $list : [], function ($t) use ($now) { return is_int($t) && $now - $t < 3600; }));
    $ok = count($list) < $max;
    if ($ok) $list[] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($list));
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ok;
}

ensure_dir();
$now = time();
if (LG_TEST && isset($_SERVER['HTTP_X_TEST_NOW'])) $now = (int)$_SERVER['HTTP_X_TEST_NOW'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = norm_code($_GET['code'] ?? '');
    if (!valid_code($code)) out(['err' => 'Codice lega non valido', 'gone' => 1], 400);
    $L = read_league($code);
    if (!$L) out(['err' => 'Lega non trovata: controlla il codice', 'gone' => 1], 404);
    $mid = lg_member_by_th($L, tok_hash((string)($_GET['tok'] ?? '')));
    out(lg_public($L, $mid, $now));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['err' => 'Metodo non ammesso'], 405);
$body = (string)file_get_contents('php://input', false, null, 0, LG_MAX_BODY + 1);
if (strlen($body) > LG_MAX_BODY) out(['err' => 'Richiesta troppo grande'], 413);
if (strncmp($body, "\xEF\xBB\xBF", 3) === 0) $body = substr($body, 3);
$in = json_decode($body, true);
if (!is_array($in)) out(['err' => 'Richiesta non valida'], 400);
$a = (string)($in['a'] ?? '');
$tok = (string)($in['tok'] ?? '');
$th = tok_hash($tok);
if ($th === '') out(['err' => 'Telefono non riconosciuto: ricarica la pagina'], 400);

if ($a === 'create') {
    $name = lg_clean($in['name'] ?? '', LG_NAME_MAX);
    if (mb_strlen($name) < 3) out(['err' => 'Dai un nome alla lega (almeno 3 lettere)'], 400);
    $L = lg_new('', $name, $now);
    $j = lg_join($L, (string)($in['nick'] ?? ''), $th, $now);
    if (isset($j['err'])) out($j, 400);
    if (!rate_ok('create', LG_CREATE_PER_HOUR, $now)) out(['err' => 'Troppe leghe create da qui: riprova tra un\'ora'], 429);
    cleanup($now);
    for ($try = 0; $try < 30; $try++) {
        $code = '';
        for ($i = 0; $i < LG_CODE_LEN; $i++) $code .= LG_CODE_CHARS[random_int(0, strlen(LG_CODE_CHARS) - 1)];
        $fh = @fopen(league_path($code), 'x');   // 'x': fallisce se il codice esiste gia'
        if (!$fh) continue;
        $L['code'] = $code;
        fwrite($fh, json_encode($L, JSON_UNESCAPED_UNICODE));
        fclose($fh);
        out(['ok' => 1, 'code' => $code, 'mid' => $j['mid'], 'state' => lg_public($L, $j['mid'], $now)]);
    }
    out(['err' => 'Non riesco a creare la lega, riprova'], 503);
}

if ($a === 'submit') {
    $codes = array_values(array_unique(array_filter(array_map('norm_code', is_array($in['codes'] ?? null) ? $in['codes'] : []), 'valid_code')));
    if (!$codes) out(['err' => 'Nessuna lega'], 400);
    $codes = array_slice($codes, 0, LG_MAX_CODES);
    $game = (string)($in['game'] ?? '');
    $n = $in['n'] ?? null;
    $result = $in['result'] ?? null;
    $per = [];
    foreach ($codes as $code) {
        [, $res] = with_league($code, function (&$L) use ($th, $game, $n, $result, $now) {
            $mid = lg_member_by_th($L, $th);
            if ($mid === '') return ['err' => 'Non sei in questa lega', 'gone' => 1];
            $r = lg_submit($L, $mid, $game, $n, $result, $now);
            if (isset($r['ok'])) $r['_dirty'] = 1;
            return $r;
        }, $now);
        $per[$code] = $res;
    }
    out(['ok' => 1, 'res' => $per]);
}

$code = norm_code($in['code'] ?? '');
if (!valid_code($code)) out(['err' => 'Codice lega non valido: sono 6 caratteri'], 400);

if ($a === 'join') {
    if (!rate_ok('join', LG_JOIN_PER_HOUR, $now)) out(['err' => 'Troppi tentativi da qui: riprova tra un po\''], 429);
    [$L, $res] = with_league($code, function (&$L) use ($in, $th, $now) {
        $r = lg_join($L, (string)($in['nick'] ?? ''), $th, $now);
        if (isset($r['ok']) && empty($r['again'])) $r['_dirty'] = 1;
        return $r;
    }, $now);
    if (isset($res['err'])) out($res, isset($res['gone']) ? 404 : 400);
    out(['ok' => 1, 'code' => $code, 'mid' => $res['mid'], 'state' => lg_public($L, $res['mid'], $now)]);
}

[$L, $res] = with_league($code, function (&$L) use ($a, $in, $th) {
    $me = lg_member_by_th($L, $th);
    if ($me === '') return ['err' => 'Non sei in questa lega', 'gone' => 1];
    switch ($a) {
        case 'rename': $r = lg_rename($L, $me, (string)($in['nick'] ?? '')); break;
        case 'leave': $r = lg_remove($L, $me); break;
        case 'kick':
            if ($L['owner'] !== $me) return ['err' => 'Solo chi ha creato la lega può togliere qualcuno'];
            $mid = (string)($in['mid'] ?? '');
            if ($mid === $me) return ['err' => 'Per uscire usa «Esci dalla lega»'];
            $r = lg_remove($L, $mid);
            break;
        default: return ['err' => 'Azione sconosciuta'];
    }
    if (isset($r['ok'])) $r['_dirty'] = 1;
    $r['me'] = $me;
    return $r;
}, $now);
if (isset($res['err'])) out($res, isset($res['gone']) ? 404 : 400);
if ($a === 'leave') out(['ok' => 1, 'left' => 1]);
out(['ok' => 1, 'state' => lg_public($L, $res['me'], $now)]);
