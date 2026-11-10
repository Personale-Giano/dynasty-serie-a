<?php
/**
 * Presidente · Serie A — raccolta errori client (errors.js).
 *
 * Stesso schema di leaderboard.php (nessun account, un file JSON dentro `_data/` come
 * "database", validazione stretta, rate-limit per IP): qui l'unica azione è POST, non c'è
 * nulla da restituire in GET (i log non sono pubblici, a differenza della classifica — e da
 * questa versione non sono più nemmeno scaricabili via HTTP: per leggerli, via FTP, il file è
 * `_data/errors.json.php`, JSON dalla seconda riga in poi). Pensato per essere ignorato in
 * tranquillità se il PHP non gira (es. sviluppo locale): errors.js fallisce in silenzio.
 *
 * Un endpoint che accetta testo da chiunque è per natura un secchio per lo spam: non si può
 * impedire a qualcuno di scriverci, solo fare in modo che non serva a niente e non costi
 * niente — testo ripulito e corto, nessuna lettura pubblica, un tetto per IP, un tetto
 * GLOBALE all'ora (un flood da tanti IP non può comunque far girare il log più di così), lo
 * stesso errore ripetuto conta una volta sola (un contatore, non 300 righe uguali che
 * spingono fuori tutti gli altri) e al più 300 voci in tutto.
 *
 * POST errors.php {message, stack?, url?, source?, v?} -> registra un errore client
 */

define('PRESIDENTE_API', true);
require_once __DIR__ . '/storage.php';
api_bootstrap();
storage_migrate_legacy();

$MAX_ENTRIES = 300;        // quanti errori restano salvati (i più recenti)
$RATE_LIMIT_SECONDS = 10;  // un invio ogni 10 secondi per IP: basta a non farsi sommergere
                           // da un loop di errori dello stesso client, senza perdere segnale
                           // da client diversi che incontrano lo stesso bug nello stesso minuto
$IP_HOURLY_MAX = 30;       // e comunque non più di 30 all'ora dallo stesso IP
$GLOBAL_HOURLY_MAX = 240;  // tetto complessivo all'ora, da qualunque IP

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); api_fail('Metodo non supportato.', 405); }
api_require_same_origin();

$ipKey = client_ip_key();
$wait = max(rate_peek('err_ip', $ipKey, $RATE_LIMIT_SECONDS, 1), rate_peek('err_ip_hour', $ipKey, 3600, $IP_HOURLY_MAX));
if ($wait > 0) api_fail('Troppi invii ravvicinati.', 429, $wait);

list($body) = api_read_json_body(8192);

// Solo l'indirizzo della pagina senza query/frammento: non serve altro per capire dove è
// successo, e una query può contenere dati che non devono finire in un log.
$url = clean_text(p_str($body, 'url', 300), 300);
$url = preg_replace('/[?#].*$/s', '', $url);
if ($url !== '' && !preg_match('#^https?://#i', $url)) $url = '';

$now = time();
$entry = [
    'message' => clean_text(p_str($body, 'message', 500), 500),
    'stack' => clean_text(p_str($body, 'stack', 2000), 2000),
    'url' => $url,
    'source' => clean_text(p_str($body, 'source', 200), 200),
    'v' => clean_name(p_str($body, 'v', 24), 24),               // versione del client (?v= di ui.js), se errors.js la manda
    'ua' => clean_text((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 160),
    'ts' => $now,
    'count' => 1,
];
if (trim($entry['message']) === '') api_fail('Messaggio mancante.');

// Da qui in poi l'invio è valido: conta per i limiti (anche se poi risulta un doppione).
rate_hit('err_ip', $ipKey, $RATE_LIMIT_SECONDS, 1);
rate_hit('err_ip_hour', $ipKey, 3600, $IP_HOURLY_MAX);
if (rate_hit('err_global', 'all', 3600, $GLOBAL_HOURLY_MAX) > 0) {
    // Tetto globale raggiunto: si risponde ok (il client non deve riprovare né mostrare nulla)
    // ma non si salva.
    api_send(['ok' => true, 'dropped' => true]);
}

$lock = lock_or_fail('errors');
$entries = store_read('errors', []);
// Lo stesso errore (stesso messaggio, stessa origine, stessa versione) già presente fra i
// recenti: si aggiorna quello (contatore + ultima volta visto) invece di aggiungerne un altro.
$dupIdx = null;
for ($i = count($entries) - 1, $seen = 0; $i >= 0 && $seen < 60; $i--, $seen++) {
    $e = $entries[$i];
    if (is_array($e) && ($e['message'] ?? null) === $entry['message'] && ($e['source'] ?? '') === $entry['source'] && ($e['v'] ?? '') === $entry['v']) { $dupIdx = $i; break; }
}
if ($dupIdx !== null) {
    $dup = $entries[$dupIdx];
    $dup['count'] = min(1000000, (int) ($dup['count'] ?? 1) + 1);
    $dup['ts'] = $now;
    array_splice($entries, $dupIdx, 1);
    $entries[] = $dup;
} else {
    $entries[] = $entry;
}
// Solo i più RECENTI: a differenza della leaderboard (ordinata per punteggio), qui l'ordine
// utile è cronologico — un bug nuovo conta quanto uno vecchio, anzi di più.
if (count($entries) > $MAX_ENTRIES) $entries = array_slice($entries, -$MAX_ENTRIES);
$saved = store_write('errors', array_values($entries), true);
lock_release($lock);
if (!$saved) api_fail('Impossibile salvare al momento.', 500);

api_send(['ok' => true]);
