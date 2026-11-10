<?php
/**
 * Presidente · Serie A — storage.php
 *
 * Libreria condivisa da room.php, leaderboard.php ed errors.php: NON è un endpoint (se la si
 * chiama direttamente risponde 404). Raccoglie in un posto solo tutto quello che prima ogni
 * endpoint si riscriveva per conto suo, con buchi diversi in ognuno:
 *
 *   - DOVE vivono i dati: non più accanto ai file del sito (room_XXXX.json, data.sqlite,
 *     errors_log.json, activity.log erano scaricabili da chiunque via HTTP — e room_XXXX.json
 *     conteneva gli authToken di tutti i giocatori della stanza), ma nella sottocartella
 *     `_data/`, protetta tre volte: un .htaccess "deny all" dentro la cartella, una regola nel
 *     .htaccess principale, e — se entrambe le regole venissero ignorate dall'hosting — il
 *     fatto che ogni file dati è un `.php` che comincia con una riga `exit`: richiesto via
 *     HTTP non restituisce nulla, letto da qui si salta la prima riga e resta JSON puro.
 *   - COME si scrivono: mai più "tronca e riscrivi sul posto" (un lettore senza lock, o un
 *     processo ucciso a metà, vedeva un file vuoto/mezzo scritto: per una stanza voleva dire
 *     "Stanza non trovata" e la pulizia automatica la cancellava davvero). Ora si scrive un
 *     file temporaneo e lo si rinomina sopra quello vero (operazione atomica), sotto un lock
 *     tenuto su un file di lock separato; chi legge prende lo stesso lock in condivisione.
 *   - Rate-limit per IP (finestra fissa per chiave, letto-e-aggiornato sotto lock: prima era
 *     un leggi/riscrivi senza lock che perdeva conteggi sotto carico).
 *   - Risposte JSON coerenti (sempre {ok:false,error} con il codice HTTP giusto, mai una
 *     pagina di errore PHP con percorsi e stack trace), controllo dell'origine sulle POST,
 *     lettura del corpo con un tetto di dimensione deciso da chi chiama.
 *   - Migrazione una tantum dei dati vecchi (file JSON accanto al sito e data.sqlite, se c'era
 *     pdo_sqlite): alla prima richiesta dopo il deploy vengono portati dentro `_data/` e tolti
 *     dalla cartella pubblica. SQLite non è più usato: il motivo per cui era stato introdotto
 *     (file JSON scritto a metà) è risolto alla radice dalla scrittura atomica, e un file
 *     .sqlite non si può proteggere con il trucco della riga `exit`.
 *
 * Compatibile con PHP 7.0+ (niente sintassi più recente: l'hosting condiviso non si sceglie).
 */

if (!defined('PRESIDENTE_API')) { http_response_code(404); exit; }

define('STORE_GUARD', "<?php http_response_code(404); exit; ?>\n");

// JSON_HEX_TAG: nessun "<" o ">" compare mai nei file dati né nelle risposte (diventano
// </>, identici per chi fa JSON.parse) — così il contenuto scelto dagli utenti non
// può mai formare un tag PHP dentro un file .php né un tag HTML se una risposta venisse
// interpretata male da un browser. *_SUBSTITUTE/PARTIAL: json_encode non restituisce mai
// false per una stringa non UTF-8 (prima: false -> file riscritto vuoto -> stanza persa).
function store_json_flags() {
    $f = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_PARTIAL_OUTPUT_ON_ERROR;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) $f |= JSON_INVALID_UTF8_SUBSTITUTE;
    return $f;
}

function store_json_encode($data) {
    return json_encode($data, store_json_flags(), 128);
}

/* ---------------------------------------------------------------- risposte */

function api_bootstrap() {
    @ini_set('display_errors', '0');
    @ini_set('html_errors', '0');
    // Una scrittura iniziata va finita anche se il client chiude la connessione a metà.
    @ignore_user_abort(true);
    ob_start();
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: same-origin');
    header('Cross-Origin-Resource-Policy: same-origin');
    set_exception_handler(function ($e) { api_internal_error(); });
    register_shutdown_function(function () {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) api_internal_error();
    });
}

// Errore imprevisto (eccezione, fatal, memoria finita): mai dettagli al client, solo un JSON
// generico con 500 — il client lo tratta come un problema temporaneo e riprova.
function api_internal_error() {
    while (ob_get_level() > 0) @ob_end_clean();
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo '{"ok":false,"error":"Errore interno del server, riprova tra poco."}';
    exit;
}

function api_fail($msg, $code = 400, $retryAfter = 0) {
    while (ob_get_level() > 0) @ob_end_clean();
    http_response_code($code);
    if ($retryAfter > 0) header('Retry-After: ' . (int) $retryAfter);
    echo store_json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function api_send($data) {
    api_send_raw(store_json_encode($data));
}

function api_send_raw($json) {
    while (ob_get_level() > 0) @ob_end_clean();
    echo $json;
    exit;
}

/* ---------------------------------------------------------------- richiesta */

// Una POST "semplice" (text/plain) parte da qualunque sito senza preflight CORS: non può
// leggere la risposta né rubare un authToken (non ci sono cookie, la credenziale sta nel
// corpo), ma può consumare il rate-limit della vittima o creare stanze/voci a suo nome (IP).
// I browser mandano sempre Origin sulle POST cross-origin: se c'è e non è il nostro host, no.
// Chi non manda Origin (curl, script) passa: non è una difesa contro di loro, e non serve.
function api_require_same_origin() {
    // Sec-Fetch-Site lo scrive il browser e una pagina non può falsificarlo: se dice
    // "same-origin" la richiesta parte dal gioco, punto — non serve confrontare nomi di host
    // (che un proxy davanti all'hosting potrebbe riscrivere). "none" = azione diretta dell'utente.
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if ($site === 'same-origin' || $site === 'none') return;
    if (is_string($site) && $site !== '') api_fail('Origine non consentita.', 403);
    // Browser senza Sec-Fetch-Site (vecchi Safari): si confronta l'host di Origin con il nostro,
    // in tutte le forme in cui il server può conoscerlo.
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!is_string($origin) || $origin === '') return;
    $oh = @parse_url($origin, PHP_URL_HOST);
    if (!is_string($oh) || $oh === '') api_fail('Origine non consentita.', 403);
    $oh = strtolower($oh);
    foreach (['HTTP_HOST', 'SERVER_NAME', 'HTTP_X_FORWARDED_HOST'] as $k) {
        $h = $_SERVER[$k] ?? '';
        if (!is_string($h) || $h === '') continue;
        $h = strtolower(trim(explode(',', $h)[0]));
        if ($oh === preg_replace('/:\d+$/', '', $h)) return;
    }
    api_fail('Origine non consentita.', 403);
}

// Corpo JSON con un tetto deciso da chi chiama. Restituisce [array associativo, testo grezzo].
function api_read_json_body($maxBytes) {
    $declared = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($declared > $maxBytes) api_fail('Corpo della richiesta troppo grande.', 413);
    $in = @fopen('php://input', 'rb');
    $raw = $in ? stream_get_contents($in, $maxBytes + 1) : '';
    if ($in) fclose($in);
    if (!is_string($raw)) $raw = '';
    if (strlen($raw) > $maxBytes) api_fail('Corpo della richiesta troppo grande.', 413);
    $body = json_decode($raw, true, 64);
    if (!is_array($body)) api_fail('JSON non valido.');
    return [$body, $raw];
}

// Parametri: mai fidarsi del tipo (un array al posto di una stringa faceva esplodere trim()
// con un errore fatale e, a display_errors acceso, una pagina con percorsi del server).
function p_str($arr, $key, $maxLen = 200) {
    $v = is_array($arr) && isset($arr[$key]) ? $arr[$key] : '';
    if (is_int($v) || is_float($v)) $v = (string) $v;
    if (!is_string($v)) return '';
    if (strlen($v) > $maxLen * 4) $v = substr($v, 0, $maxLen * 4);
    return $v;
}

// Numero finito o null: accetta numeri JSON e stringhe numeriche (un <select> manda "3").
function p_num($arr, $key) {
    $v = is_array($arr) && isset($arr[$key]) ? $arr[$key] : null;
    if (is_string($v) && strlen($v) <= 32 && is_numeric(trim($v))) $v = (float) trim($v);
    if (!is_int($v) && !is_float($v)) return null;
    $f = (float) $v;
    if (is_nan($f) || is_infinite($f)) return null;
    return $f;
}

function p_int($arr, $key, $default = null) {
    $f = p_num($arr, $key);
    if ($f === null || abs($f) > 9e15) return $default;
    return (int) $f;
}

function str_cut($v, $maxLen) {
    if (function_exists('mb_substr')) return mb_substr($v, 0, $maxLen, 'UTF-8');
    // Senza mbstring: taglio per caratteri UTF-8 interi, mai a metà di una sequenza.
    if (preg_match('/^.{0,' . (int) $maxLen . '}/us', $v, $m)) return $m[0];
    return substr($v, 0, $maxLen);
}

function str_lower($v) {
    return function_exists('mb_strtolower') ? mb_strtolower($v, 'UTF-8') : strtolower($v);
}

// Nome (club/proprietario/giocatore): solo lettere (anche accentate), cifre, spazi e una
// manciata di segni comuni, lunghezza limitata. Niente HTML, niente markup, niente virgolette
// doppie. L'apostrofo resta (D'Ambrosio): chi lo mostra DEVE comunque fare l'escape.
function clean_name($v, $maxLen) {
    $v = is_string($v) ? $v : '';
    if (strlen($v) > 2000) $v = substr($v, 0, 2000);
    $r = @preg_replace('/[^\p{L}\p{N} .\'\-]/u', '', $v);
    if ($r === null) return '';   // UTF-8 non valido: si scarta, non si salva spazzatura
    $r = trim(preg_replace('/\s+/', ' ', $r));
    return trim(str_cut($r, $maxLen));
}

// Testo libero su una riga (chat, annuncio): via i caratteri di controllo e quelli "invisibili"
// usati per falsificare l'ordine del testo; "<" e ">" diventano le virgolette singole
// tipografiche (‹ ›), così un messaggio resta leggibile ("3 › 2") ma non può mai diventare un
// tag anche se un punto del client dimenticasse l'escape.
function clean_line($v, $maxLen) {
    $v = is_string($v) ? $v : '';
    if (strlen($v) > 8000) $v = substr($v, 0, 8000);
    $r = @preg_replace('/[\x00-\x1F\x7F\x{0080}-\x{009F}\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2060}-\x{2069}\x{FEFF}]+/u', ' ', $v);
    if ($r === null) return '';
    $r = str_replace(['<', '>'], ["\xE2\x80\xB9", "\xE2\x80\xBA"], $r);
    $r = trim(preg_replace('/ {2,}/', ' ', $r));
    return trim(str_cut($r, $maxLen));
}

// Testo tecnico su più righe (messaggio/stack di un errore): newline e tab restano.
function clean_text($v, $maxLen) {
    $v = is_string($v) ? $v : '';
    if (strlen($v) > $maxLen * 4 + 64) $v = substr($v, 0, $maxLen * 4 + 64);
    $r = @preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $v);
    if ($r === null) return '';
    $r = str_replace(['<', '>'], ["\xE2\x80\xB9", "\xE2\x80\xBA"], $r);
    return str_cut($r, $maxLen);
}

/* ---------------------------------------------------------------- cartella dati */

// In produzione è sempre `_data/` accanto a questo file. Le due variabili d'ambiente servono
// solo ai test (server-test/): nessuna richiesta HTTP può impostarle.
function data_dir() {
    static $dir = null;
    if ($dir !== null) return $dir;
    $env = getenv('PRESIDENTE_DATA_DIR');
    $dir = ($env !== false && $env !== '') ? rtrim(str_replace('\\', '/', $env), '/') : __DIR__ . '/_data';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if (!is_dir($dir)) api_fail('Archivio dati non disponibile.', 503, 30);
    // Ricreati se mancano (cartella nuova, o cancellati per errore via FTP).
    if (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "# Dati del gioco: mai serviti via HTTP.\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    if (!is_file($dir . '/index.html')) @file_put_contents($dir . '/index.html', '');
    return $dir;
}

function test_mode() {
    return getenv('PRESIDENTE_TEST_MODE') === '1';
}

// Segreto del server (mai esposto): sala gli hash degli IP, così un file di rate-limit finito
// in mani sbagliate non si può invertire provando i 4 miliardi di indirizzi IPv4.
function data_secret() {
    static $secret = null;
    if ($secret !== null) return $secret;
    $file = data_dir() . '/secret.php';
    $val = is_file($file) ? @include $file : null;
    if (!is_string($val) || strlen($val) < 32) {
        $lock = lock_acquire('secret', true, 5);
        $val = is_file($file) ? @include $file : null;
        if (!is_string($val) || strlen($val) < 32) {
            $val = bin2hex(random_bytes(32));
            $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
            if (@file_put_contents($tmp, "<?php return '" . $val . "';\n") === false || !@rename($tmp, $file)) @unlink($tmp);
        }
        lock_release($lock);
    }
    $secret = $val;
    return $secret;
}

/* ---------------------------------------------------------------- lock + file */

// Lock su un file separato (mai sul file dati: quello viene sostituito per rinomina). Attesa
// con un tetto: meglio un 503 "riprova" che una richiesta appesa finché l'hosting la uccide.
function lock_acquire($name, $exclusive = true, $timeoutSeconds = 8) {
    $fp = @fopen(data_dir() . '/' . $name . '.lock', 'c');
    if (!$fp) return false;
    $mode = ($exclusive ? LOCK_EX : LOCK_SH) | LOCK_NB;
    $deadline = microtime(true) + $timeoutSeconds;
    $wait = 2000;
    while (!@flock($fp, $mode)) {
        if (microtime(true) >= $deadline) { fclose($fp); return false; }
        usleep($wait);
        if ($wait < 40000) $wait *= 2;
    }
    return $fp;
}

function lock_release($fp) {
    if ($fp) { @flock($fp, LOCK_UN); @fclose($fp); }
}

function lock_or_fail($name, $exclusive = true) {
    $fp = lock_acquire($name, $exclusive);
    if (!$fp) api_fail('Server occupato, riprova tra qualche secondo.', 503, 3);
    return $fp;
}

function store_path($name) {
    return data_dir() . '/' . $name . '.json.php';
}

function store_exists($name) {
    return is_file(store_path($name));
}

// Contenuto JSON grezzo di un file dati (senza la riga di guardia), o null se non c'è.
function store_read_raw($name) {
    $path = store_path($name);
    if (!is_file($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') return null;
    $nl = strpos($raw, "\n");
    if ($nl === false || strncmp($raw, '<?php', 5) !== 0) return null;
    return substr($raw, $nl + 1);
}

// Array salvato sotto `$name`. File mancante -> $default. File illeggibile/corrotto -> si
// prova la copia di riserva (.bak, vedi store_write), altrimenti $default: un file rovinato
// non deve mai diventare un errore 500 permanente. `$corrupt` (per riferimento) dice a chi
// chiama se il file c'era ma non era valido, per i casi in cui "mancante" e "rotto" vanno
// trattati diversamente (una stanza rotta non è "stanza non trovata").
function store_read($name, $default, &$corrupt = null) {
    $corrupt = false;
    $raw = store_read_raw($name);
    if ($raw !== null) {
        $data = json_decode($raw, true, 128);
        if (is_array($data)) return $data;
    }
    if ($raw !== null || is_file(store_path($name))) $corrupt = true;
    $bak = store_path($name) . '.bak';
    if (is_file($bak)) {
        $braw = @file_get_contents($bak);
        $nl = $braw === false ? false : strpos($braw, "\n");
        if ($nl !== false) {
            $data = json_decode(substr($braw, $nl + 1), true, 128);
            if (is_array($data)) { $corrupt = false; return $data; }
        }
    }
    return $default;
}

// Scrittura atomica: file temporaneo + rinomina. `$backup` tiene anche una copia .bak della
// versione precedente (per i file piccoli e preziosi: classifica, log errori).
function store_write($name, $data, $backup = false) {
    $json = store_json_encode($data);
    if (!is_string($json) || $json === '') return false;
    return store_write_raw($name, $json, $backup);
}

function store_write_raw($name, $json, $backup = false) {
    $path = store_path($name);
    $payload = STORE_GUARD . $json;
    $tmp = $path . '.tmp' . bin2hex(random_bytes(4));
    $written = @file_put_contents($tmp, $payload);
    if ($written !== strlen($payload)) { @unlink($tmp); return false; }   // disco pieno/quota: il file vero resta intatto
    // La riserva si aggiorna solo con una versione SANA: se il file corrente è rovinato, la
    // copia buona di prima non va persa sovrascrivendola con quella rotta.
    if ($backup && is_file($path)) {
        $cur = store_read_raw($name);
        if ($cur !== null && is_array(json_decode($cur, true, 128))) @copy($path, $path . '.bak');
    }
    // Su Linux rename() sopra un file esistente è atomico; su Windows (solo sviluppo locale)
    // può fallire se un altro processo ha il file aperto in quell'istante: qualche tentativo.
    for ($i = 0; $i < 6; $i++) {
        if (@rename($tmp, $path)) return true;
        usleep(15000);
    }
    $ok = @copy($tmp, $path);
    @unlink($tmp);
    return $ok;
}

function store_delete($name) {
    $path = store_path($name);
    @unlink($path . '.bak');
    return !is_file($path) || @unlink($path);
}

/* ---------------------------------------------------------------- IP + rate-limit */

function client_ip() {
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    if (test_mode() && !empty($_SERVER['HTTP_X_TEST_CLIENT_IP'])) $ip = (string) $_SERVER['HTTP_X_TEST_CLIENT_IP'];
    // IPv6: chi ha un indirizzo ha di solito un intero /64 a disposizione — si limita il
    // prefisso, non il singolo indirizzo, altrimenti il limite si aggira cambiando suffisso.
    if (strpos($ip, ':') !== false && function_exists('inet_pton')) {
        $bin = @inet_pton($ip);
        if ($bin !== false && strlen($bin) === 16) $ip = 'v6:' . bin2hex(substr($bin, 0, 8));
    }
    return $ip;
}

// Non salviamo mai l'IP in chiaro: un HMAC troncato con il segreto del server.
function client_ip_key() {
    static $key = null;
    if ($key === null) $key = substr(hash_hmac('sha256', client_ip(), data_secret()), 0, 24);
    return $key;
}

// Finestra fissa per chiave: al più `$max` colpi ogni `$window` secondi. Restituisce 0 se il
// colpo è ammesso (e lo conta), altrimenti i secondi da aspettare. `$commit=false` guarda
// soltanto, senza contare (per i limiti che contano solo i fallimenti, vedi rate_peek).
// Tutto sotto lock esclusivo: leggi-modifica-scrivi senza lock perdeva conteggi.
// Orologio che torna indietro (NTP): una finestra "nel futuro" viene azzerata, non blocca.
function rate_hit($name, $key, $window, $max, $commit = true) {
    $store = 'rate_' . $name;
    $lock = lock_acquire($store, true, 4);
    if (!$lock) return 0;   // limiter non disponibile: si lascia passare, non si blocca il gioco
    $now = time();
    $data = store_read($store, []);
    $e = isset($data[$key]) && is_array($data[$key]) && count($data[$key]) === 2 ? $data[$key] : null;
    if ($e === null || $e[0] > $now || ($now - $e[0]) >= $window) $e = [$now, 0];
    $waitFor = 0;
    if ($e[1] >= $max) {
        $waitFor = max(1, $window - ($now - $e[0]));
    } elseif ($commit) {
        $e[1]++;
        $data[$key] = $e;
        // Voci scadute via ad ogni scrittura: il file non cresce mai oltre gli IP attivi nella
        // finestra. Tetto di sicurezza per un flood distribuito: si riparte da zero.
        foreach ($data as $k => $v) {
            if (!is_array($v) || count($v) !== 2 || $v[0] > $now || ($now - $v[0]) >= $window) unset($data[$k]);
        }
        if (count($data) > 20000) $data = [$key => $e];
        store_write($store, $data);
    }
    lock_release($lock);
    return $waitFor;
}

function rate_peek($name, $key, $window, $max) {
    return rate_hit($name, $key, $window, $max, false);
}

function rate_or_fail($name, $window, $max, $msg) {
    $wait = rate_hit($name, client_ip_key(), $window, $max);
    if ($wait > 0) api_fail($msg, 429, $wait);
}

/* ---------------------------------------------------------------- log attività */

// Log minimo, append-only, best-effort (mai bloccante), per capire da fuori cosa è successo a
// una stanza. Ora dentro `_data/` (prima era scaricabile da chiunque e conteneva i codici di
// tutte le stanze, cioè la chiave per entrarci) e con un tetto: superato, il file corrente
// diventa ".1" (uno solo di storico) e si ricomincia.
function activity_log($code, $action) {
    $file = data_dir() . '/activity.log.php';
    $size = @filesize($file);
    if ($size !== false && $size > 512 * 1024) { @rename($file, data_dir() . '/activity.1.log.php'); $size = false; }
    $line = date('c') . ' ' . $code . ' ' . preg_replace('/[^A-Za-z0-9_:\-]/', '', (string) $action) . "\n";
    @file_put_contents($file, ($size === false || $size === 0 ? STORE_GUARD : '') . $line, FILE_APPEND | LOCK_EX);
}

/* ---------------------------------------------------------------- migrazione dati vecchi */

// Fino alla versione precedente i dati vivevano accanto ai file del sito. Alla prima richiesta
// dopo il deploy (una volta sola: poi c'è il file-segnale) si portano dentro `_data/`:
//   leaderboard_data.json / leaderboard_season_data.json / errors_log.json / data.sqlite
//     -> leaderboard, leaderboard_season, errors (uniti, senza doppioni)
//   room_XXXX.json -> room_XXXX nel formato nuovo (gli authToken diventano hash: chi è in una
//     stanza resta dentro con il token che ha già)
//   *_rate.json, room_rate_*.json -> cancellati (ripartono da zero)
//   activity.log e gli originali migrati -> spostati in `_data/legacy/` (copia di sicurezza,
//     non più raggiungibile via HTTP); se lo spostamento non riesce si prova a cancellarli.
function storage_migrate_legacy() {
    $dir = data_dir();
    $flag = $dir . '/migrated.flag';
    if (is_file($flag)) return;
    $lock = lock_acquire('migrate', true, 15);
    if (!$lock) return;   // ci riprova la prossima richiesta
    if (is_file($flag)) { lock_release($lock); return; }

    $env = getenv('PRESIDENTE_LEGACY_DIR');
    $old = ($env !== false && $env !== '') ? rtrim(str_replace('\\', '/', $env), '/') : __DIR__;
    $readOld = function ($file) {
        if (!is_file($file)) return null;
        $raw = @file_get_contents($file);
        $d = ($raw === false || $raw === '') ? null : json_decode($raw, true);
        return is_array($d) ? $d : null;
    };

    $lb = $readOld($old . '/leaderboard_data.json');
    $season = $readOld($old . '/leaderboard_season_data.json');
    $errors = $readOld($old . '/errors_log.json');
    $sqlite = $old . '/data.sqlite';
    if (is_file($sqlite) && extension_loaded('pdo_sqlite')) {
        try {
            $pdo = new PDO('sqlite:' . $sqlite);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $get = function ($n) use ($pdo) {
                $st = $pdo->prepare('SELECT value FROM blob_store WHERE name = :n');
                $st->execute([':n' => $n]);
                $v = $st->fetchColumn();
                $d = $v === false ? null : json_decode($v, true);
                return is_array($d) ? $d : null;
            };
            $merge = function ($a, $b) {
                $seen = []; $out = [];
                foreach (array_merge(is_array($a) ? $a : [], is_array($b) ? $b : []) as $e) {
                    if (!is_array($e)) continue;
                    $k = ($e['club'] ?? '') . '|' . ($e['owner'] ?? '') . '|' . ($e['message'] ?? '') . '|' . ($e['ts'] ?? '');
                    if (isset($seen[$k])) continue;
                    $seen[$k] = true; $out[] = $e;
                }
                return $out;
            };
            $lb = $merge($get('leaderboard'), $lb);
            $errors = $merge($get('errors'), $errors);
            $s = $get('leaderboard_season');
            if (is_array($s) && isset($s['current'])) $season = $s;
            $pdo = null; $get = null;
        } catch (Exception $e) { /* SQLite illeggibile: restano i dati dei file JSON */ }
    }
    if (is_array($lb) && count($lb) && !store_exists('leaderboard')) store_write('leaderboard', array_values($lb), true);
    if (is_array($season) && isset($season['current']) && !store_exists('leaderboard_season')) store_write('leaderboard_season', ['current' => (int) $season['current']]);
    if (is_array($errors) && count($errors) && !store_exists('errors')) store_write('errors', array_slice(array_values($errors), -300), true);

    foreach ((array) @glob($old . '/room_*.json') as $f) {
        $base = basename($f);
        if (preg_match('/^room_([A-Z0-9]{4})\.json$/', $base, $m)) {
            $room = $readOld($f);
            if (is_array($room) && is_array($room['players'] ?? null) && count($room['players']) && !store_exists('room_' . $m[1])) {
                $room = room_upgrade_legacy($room, $m[1], @filemtime($f));
                if (!store_write('room_' . $m[1], $room)) continue;   // non migrata: l'originale resta dov'è
            }
            @unlink($f);
        } elseif (preg_match('/^room_rate_[a-z]+\.json$/', $base) || preg_match('/^room_[A-Z0-9]*\.json$/', $base)) {
            @unlink($f);   // file di rate-limit e file vuoti creati per errore dalla versione precedente
        }
    }

    $legacy = $dir . '/legacy';
    foreach (['leaderboard_data.json', 'leaderboard_season_data.json', 'errors_log.json', 'data.sqlite', 'data.sqlite-wal', 'data.sqlite-shm', 'activity.log'] as $n) {
        if (!is_file($old . '/' . $n)) continue;
        if (!is_dir($legacy)) @mkdir($legacy, 0755, true);
        if (!@rename($old . '/' . $n, $legacy . '/' . $n . '.php')) @unlink($old . '/' . $n);
    }
    foreach (['leaderboard_rate.json', 'errors_rate.json'] as $n) @unlink($old . '/' . $n);

    @file_put_contents($flag, date('c') . "\n");
    lock_release($lock);
}

// Stanza nel formato vecchio -> formato nuovo (vedi room.php per la struttura): token in
// chiaro -> hash, i blocchi grossi (carriere, classifiche live, risultati) -> testo JSON.
function room_upgrade_legacy($room, $code, $mtime) {
    $enc = function ($v) { return store_json_encode($v); };
    $room['v'] = 2;
    $room['code'] = $code;
    $room['rev'] = 1;
    if (empty($room['updatedAt'])) $room['updatedAt'] = $mtime ? (int) $mtime : time();
    $players = [];
    foreach ($room['players'] as $p) {
        if (!is_array($p) || !is_string($p['id'] ?? null)) continue;
        if (isset($p['authToken'])) { $p['authHash'] = hash('sha256', (string) $p['authToken']); unset($p['authToken']); }
        if (isset($p['state']) && is_array($p['state'])) $p['state'] = $enc($p['state']); else unset($p['state']);
        $players[] = $p;
    }
    $room['players'] = $players;
    if (isset($room['results']) && is_array($room['results'])) {
        foreach ($room['results'] as $pid => $ctx) $room['results'][$pid] = $enc($ctx);
    }
    if (isset($room['live']) && is_array($room['live']) && is_array($room['live']['groups'] ?? null)) {
        $groups = [];
        foreach ($room['live']['groups'] as $g) {
            if (!is_array($g)) continue;
            $resume = isset($g['resume']) && is_array($g['resume']) ? $enc($g['resume']) : null;
            unset($g['resume']);
            $groups[] = ['div' => (int) ($g['div'] ?? 0), 'body' => $enc((object) $g), 'resume' => $resume];
        }
        $room['live']['groups'] = $groups;
    }
    return $room;
}
