<?php
/* ==========================================================================
   QUIZZOTTI — Nomi, Cose, Calcio: la stanza condivisa tra TV e telefoni
   GET  nomicose.php?code=ABCD&tok=...&v=12   -> stato (o {"u":1} se invariato)
   POST nomicose.php  {"a":"azione", "code":..., "tok":..., ...}
   Le stanze sono file JSON in api/stanze (protetti da .htaccess), uno per
   codice, scritti sotto flock. Spariscono da sole dopo due giorni.
   ========================================================================== */
declare(strict_types=1);
require __DIR__ . '/nomicose-core.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const NC_DIR = __DIR__ . '/stanze';
const NC_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // niente I e O, si confondono con 1 e 0
const NC_TTL = 172800;                              // 2 giorni
const NC_CREATE_PER_HOUR = 30;

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_dir() {
    if (!is_dir(NC_DIR)) @mkdir(NC_DIR, 0755, true);
    $ht = NC_DIR . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
}

function room_path($code) { return NC_DIR . '/' . $code . '.json'; }

function valid_code($c) { return is_string($c) && preg_match('/^[A-Z]{4}$/', $c); }

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
    foreach (glob(NC_DIR . '/*.json') ?: [] as $f) {
        if ($now - (int)@filemtime($f) > NC_TTL) @unlink($f);
    }
}

function rate_ok() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $f = NC_DIR . '/_ip-' . substr(hash('sha256', $ip . 'quizzotti'), 0, 16) . '.json';
    $list = is_file($f) ? (json_decode((string)@file_get_contents($f), true) ?: []) : [];
    $now = time();
    $list = array_values(array_filter($list, function ($t) use ($now) { return $now - $t < 3600; }));
    if (count($list) >= NC_CREATE_PER_HOUR) return false;
    $list[] = $now;
    @file_put_contents($f, json_encode($list));
    return true;
}

function who($r, $tok) {
    $isHost = is_string($tok) && $tok !== '' && hash_equals($r['hostTok'], $tok);
    $me = '';
    foreach ($r['players'] as $p) if (is_string($tok) && $tok !== '' && hash_equals($p['tok'], $tok)) $me = $p['id'];
    $boss = $isHost || ($me !== '' && $me === nc_captain($r));
    return [$me, $isHost, $boss];
}

ensure_dir();
$now = time();

/** Stato per chi chiede: completo per la TV e i giocatori, minimo per chi non ha un gettone valido. */
function state_for($r, $tok, $now) {
    [$me, $isHost] = who($r, $tok);
    if ($me === '' && !$isHost) return nc_public_min($r, $now);
    return nc_public($r, $me, $isHost, $now);
}

/**
 * Lettura veloce, senza lock esclusivo: legge la stanza sotto lock condiviso e,
 * se non c'e' niente da scrivere (nessun passaggio di fase a tempo, presenza
 * del giocatore aggiornata da meno di 8 secondi), risponde subito.
 * Restituisce null quando serve il percorso con la scrittura.
 */
function read_fast($code, $tok, $v, $now) {
    if (!valid_code($code)) out(['err' => 'Codice stanza non valido'], 400);
    $path = room_path($code);
    if (!is_file($path)) out(['err' => 'Stanza non trovata: controlla il codice', 'gone' => 1], 404);
    $fh = @fopen($path, 'r');
    if (!$fh) return null;
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $r = json_decode($raw ?: '', true);
    if (!is_array($r)) return null;   // il percorso lento sa dire "stanza rovinata"
    $copy = $r;
    if (nc_tick($copy, $now)) return null;
    [$me] = who($r, $tok);
    if ($me !== '') {
        $i = nc_player_index($r, $me);
        if ($now - ($r['players'][$i]['last'] ?? 0) >= 8) return null;
    }
    if ($v === $r['v']) out(['u' => 1, 'now' => $now]);
    out(state_for($r, $tok, $now));
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = strtoupper((string)($_GET['code'] ?? ''));
    $tok = (string)($_GET['tok'] ?? '');
    $v = (int)($_GET['v'] ?? -1);
    read_fast($code, $tok, $v, $now);   // esce da sola quando basta leggere
    [$r, $res] = with_room($code, function (&$r) use ($tok, $now, $v) {
        $changed = nc_tick($r, $now);
        [$me] = who($r, $tok);
        $touch = false;
        if ($me !== '') {
            $i = nc_player_index($r, $me);
            if ($now - ($r['players'][$i]['last'] ?? 0) >= 8) { $r['players'][$i]['last'] = $now; $touch = true; }
        }
        return ['_dirty' => $changed, '_touch' => $touch, 'same' => !$changed && $v === $r['v']];
    });
    if ($res['same']) out(['u' => 1, 'now' => $now]);
    out(state_for($r, $tok, $now));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['err' => 'Metodo non ammesso'], 405);
// il corpo e' JSON sia con fetch (application/json) sia con navigator.sendBeacon
// (text/plain, quando il telefono chiude la pagina); per sicurezza anche un campo "d" in un form
$body = (string)file_get_contents('php://input');
if (trim($body) === '' && isset($_POST['d'])) $body = (string)$_POST['d'];
if (strncmp($body, "\xEF\xBB\xBF", 3) === 0) $body = substr($body, 3);
$in = json_decode($body, true);
if (!is_array($in)) out(['err' => 'Richiesta non valida'], 400);
$a = (string)($in['a'] ?? '');

if ($a === 'create') {
    if (!rate_ok()) out(['err' => 'Troppe stanze create: riprova tra un po\''], 429);
    cleanup();
    @unlink(NC_DIR . '/_ping.json');
    $hostTok = bin2hex(random_bytes(16));
    for ($try = 0; $try < 30; $try++) {
        $code = '';
        for ($i = 0; $i < 4; $i++) $code .= NC_CODE_CHARS[random_int(0, strlen(NC_CODE_CHARS) - 1)];
        $fh = @fopen(room_path($code), 'x');   // 'x': fallisce se il codice esiste gia'
        if (!$fh) continue;
        $r = nc_new_room($code, $hostTok, $now, (array)($in['opts'] ?? []));
        nc_set_cats($r, (array)($in['cats'] ?? []));
        fwrite($fh, json_encode($r, JSON_UNESCAPED_UNICODE));
        fclose($fh);
        out(['code' => $code, 'tok' => $hostTok, 'state' => nc_public($r, '', true, $now)]);
    }
    out(['err' => 'Non riesco a creare la stanza, riprova'], 503);
}

$code = strtoupper((string)($in['code'] ?? ''));
$tok = (string)($in['tok'] ?? '');

if ($a === 'join') {
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) out(['err' => 'Telefono non riconosciuto, ricarica la pagina'], 400);
    [$r, $res] = with_room($code, function (&$r) use ($in, $tok, $now) {
        nc_tick($r, $now);
        return nc_join($r, (string)($in['name'] ?? ''), $tok, $now) + ['_dirty' => true];
    });
    if (isset($res['err'])) out($res, 400);
    out(['pid' => $res['pid'], 'state' => nc_public($r, $res['pid'], false, $now)]);
}

$BOSS = ['opts', 'cats', 'removecat', 'start', 'finish', 'revcat', 'confirm', 'override', 'end', 'rematch', 'kick'];
[$r, $res] = with_room($code, function (&$r) use ($a, $in, $tok, $now, $BOSS) {
    nc_tick($r, $now);
    [$me, $isHost, $boss] = who($r, $tok);
    if (in_array($a, $BOSS, true) && !$boss) return ['err' => 'Solo la TV o il capitano possono farlo'];
    if (!$boss && $me === '') return ['err' => 'Entra prima nella stanza'];
    switch ($a) {
        case 'opts':
            if (!in_array($r['phase'], ['lobby', 'results'], true)) return ['err' => 'Le regole si cambiano tra un round e l\'altro'];
            $r['opts'] = nc_opts($r['opts'], (array)($in['opts'] ?? []));
            return ['ok' => 1];
        case 'cats': return nc_set_cats($r, (array)($in['cats'] ?? []));
        case 'addcat': return nc_add_cat($r, (string)($in['name'] ?? ''));
        case 'removecat': return nc_remove_cat($r, (string)($in['id'] ?? ''));
        case 'start': return nc_start_round($r, $now);
        case 'answer':
            if ($me === '') return ['err' => 'Solo i giocatori scrivono'];
            return nc_answer($r, $me, (array)($in['answers'] ?? []), $now);
        case 'stop': return $me === '' ? ['err' => 'Solo i giocatori'] : nc_stop($r, $me, $now);
        case 'vote': return $me === '' ? ['err' => 'Solo i giocatori votano'] : nc_vote($r, $me, (string)($in['pid'] ?? ''), (string)($in['cat'] ?? ''));
        case 'override':
            $val = $in['value'] ?? null;
            // la TV decide su tutte; il capitano su tutte tranne le sue
            return nc_override($r, (string)($in['pid'] ?? ''), (string)($in['cat'] ?? ''), $val === null ? null : (bool)$val, $isHost ? '' : $me);
        case 'finish': return nc_finish($r, $now);
        case 'revcat': return nc_review_cat($r, (int)($in['idx'] ?? 0));
        case 'confirm': return nc_confirm($r);
        case 'end': return nc_end($r);
        case 'rematch': return nc_rematch($r);
        case 'kick': return nc_kick($r, (string)($in['pid'] ?? ''));
    }
    return ['err' => 'Azione sconosciuta'];
});
if (isset($res['err'])) out($res, 400);
[$me, $isHost] = who($r, $tok);
out(['ok' => 1, 'state' => nc_public($r, $me, $isHost, $now)]);
