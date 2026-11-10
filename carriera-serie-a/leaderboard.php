<?php
/**
 * Presidente · Serie A — classifica presidenti (hall of fame), condivisa.
 *
 * Endpoint minimale, senza account/login: un file JSON come "database" (dentro `_data/`, mai
 * raggiungibile via HTTP — vedi storage.php), con le protezioni che ha senso avere senza una
 * vera autenticazione: validazione stretta dei campi, nessun testo libero salvato, un tetto
 * alle voci, rate-limit per IP e controlli di PLAUSIBILITÀ sui numeri inviati.
 *
 * ONESTÀ SUI LIMITI: il gioco gira tutto nel browser, quindi il server non può sapere se una
 * carriera è stata giocata davvero — chi apre la console può inviare qualunque carriera
 * "possibile". Una firma lato client non aggiungerebbe nulla (la chiave starebbe nello stesso
 * JavaScript che chiunque può leggere). Quello che il server PUÒ fare, e fa, è rifiutare le
 * carriere impossibili per le regole del gioco (più trofei di quanti se ne possano vincere in
 * quelle stagioni, coppe europee senza aver avuto il tempo di arrivare in Serie A, una scalata
 * più veloce di una promozione a stagione), tenere una sola voce per club+presidente per
 * stagione di classifica (la migliore: niente classifica riempita dalla stessa persona) e
 * limitare gli invii per IP. Basta contro lo spam e i numeri assurdi, non contro chi bara
 * con criterio.
 *
 * GET  leaderboard.php            -> le migliori carriere (JSON), ciascuna con `boardSeason`
 *                                    (vedi leaderboard_season sotto), più `currentSeason`
 *                                    a parte per sapere qual è quella "in corso"
 * POST leaderboard.php {body JSON}-> invia una carriera (rifiutata se invalida, implausibile o
 *                                    troppo frequente dallo stesso IP), etichettata in
 *                                    automatico con la stagione di classifica corrente
 */

define('PRESIDENTE_API', true);
require_once __DIR__ . '/storage.php';
api_bootstrap();
storage_migrate_legacy();

$MAX_ENTRIES = 100;      // quante carriere restano salvate (le migliori per punteggio)
$RETURN_TOP = 50;        // quante ne restituisce la GET (il client filtra per difficoltà/categoria
                         // lato suo, vedi showGlobalLeaderboard in ui.js — deve avere abbastanza
                         // scelta oltre alla sola top 10 assoluta, non solo le migliori in assoluto)
$RATE_LIMIT_SECONDS = 300; // un invio riuscito ogni 5 minuti per IP
$DAILY_MAX = 12;           // e al più 12 al giorno per IP
$MAX_SEASONS = 15;         // MAX_SEASONS in data.js: una dynasty non dura di più
$MAX_TROPHIES_PER_SEASON = 4;   // titolo + Coppa Italia + una coppa europea + Supercoppa (sim.js)

// Stagione della CLASSIFICA (boardSeason): un concetto diverso da `season` sull'entry (quella
// è la stagione IN carriera, S.season, a cui la dynasty inviata era arrivata). boardSeason
// esiste per poter "chiudere" ogni tanto la classifica e farne ripartire una nuova, senza
// perdere lo storico. La primissima volta che questo endpoint gira con questo concetto (il
// contatore non esiste ancora da nessuna parte) si parte da 2, non da 1: tutto quello già
// salvato finora non ha un boardSeason esplicito e viene trattato come Stagione 1 (vedi il
// fallback più sotto), le carriere inviate da questo momento in poi sono Stagione 2.
// Per aprire una stagione nuova: modificare via FTP `_data/leaderboard_season.json.php`
// (la seconda riga, {"current":N}), lasciando intatta la prima riga.
function leaderboard_season() {
    $data = store_read('leaderboard_season', null);
    if (is_array($data) && isset($data['current'])) return max(1, (int) $data['current']);
    $lock = lock_acquire('leaderboard', true, 4);
    $data = store_read('leaderboard_season', null);
    if (!is_array($data) || !isset($data['current'])) { $data = ['current' => 2]; store_write('leaderboard_season', $data); }
    lock_release($lock);
    return max(1, (int) $data['current']);
}

// Una voce letta dal file: solo i campi noti, con i tipi giusti. Se il file fosse stato
// modificato a mano (o migrato da una versione vecchia) non si rimanda mai al client un campo
// inatteso o un testo non ripulito.
function leaderboard_normalize($e) {
    if (!is_array($e)) return null;
    $club = clean_name($e['club'] ?? '', 24);
    $owner = clean_name($e['owner'] ?? '', 18);
    if ($club === '' || $owner === '') return null;
    $tb = null;
    if (isset($e['trophyBreakdown']) && is_array($e['trophyBreakdown'])) {
        $t = $e['trophyBreakdown'];
        $titles = is_array($t['titles'] ?? null) ? array_values($t['titles']) : [];
        $titles = array_pad(array_slice(array_map(function ($v) { return max(0, min(60, (int) $v)); }, $titles), 0, 6), 6, 0);
        $tb = ['titles' => $titles];
        foreach (['nat', 'ucl', 'uel', 'conf'] as $k) $tb[$k] = max(0, min(60, (int) ($t[$k] ?? 0)));
    }
    $difficulty = in_array($e['difficulty'] ?? '', ['facile', 'medio', 'difficile', 'estremo'], true) ? $e['difficulty'] : 'medio';
    return [
        'club' => $club,
        'owner' => $owner,
        'div' => max(0, min(5, (int) ($e['div'] ?? 0))),
        'startDiv' => max(0, min(5, (int) ($e['startDiv'] ?? ($e['div'] ?? 0)))),
        'season' => max(1, min(60, (int) ($e['season'] ?? 1))),
        'boardSeason' => max(1, (int) ($e['boardSeason'] ?? 1)),   // senza campo = Stagione 1, vedi sopra
        'trophies' => max(0, min(500, (int) ($e['trophies'] ?? 0))),
        'worth' => max(0, min(1e13, (float) ($e['worth'] ?? 0))),
        'difficulty' => $difficulty,
        'score' => (int) ($e['score'] ?? 0),
        'ts' => (int) ($e['ts'] ?? 0),
        'trophyBreakdown' => $tb,
    ];
}

function leaderboard_read() {
    $out = [];
    foreach (store_read('leaderboard', []) as $e) {
        $n = leaderboard_normalize($e);
        if ($n) $out[] = $n;
    }
    // Ordine stabile: a parità di punteggio resta davanti chi è arrivato prima.
    usort($out, function ($a, $b) {
        if ($a['score'] !== $b['score']) return $b['score'] <=> $a['score'];
        return $a['ts'] <=> $b['ts'];
    });
    return $out;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' || $method === 'HEAD') {
    $entries = leaderboard_read();
    api_send(['ok' => true, 'entries' => array_slice($entries, 0, $RETURN_TOP), 'currentSeason' => leaderboard_season()]);
}

if ($method !== 'POST') { header('Allow: GET, POST'); api_fail('Metodo non supportato.', 405); }
api_require_same_origin();

// ---- rate limit per IP ----
// Tre livelli: (1) i tentativi in generale, validi o no — chi martella l'endpoint con corpi
// sbagliati non deve poterlo fare all'infinito; (2) un invio RIUSCITO ogni 5 minuti e (3) un
// tetto giornaliero. (2) e (3) si contano solo a invio salvato, più sotto: un errore di
// validazione non brucia il turno di chi poi corregge e rimanda.
$ipKey = client_ip_key();
rate_or_fail('lb_try', 60, 20, 'Troppe richieste, riprova tra un minuto.');
$wait = max(rate_peek('lb_ok', $ipKey, $RATE_LIMIT_SECONDS, 1), rate_peek('lb_day', $ipKey, 86400, $DAILY_MAX));
if ($wait > 0) api_fail('Puoi inviare una carriera ogni pochi minuti. Riprova più tardi.', 429, $wait);

// ---- validazione stretta del corpo ----
list($body) = api_read_json_body(4096);

$club = clean_name($body['club'] ?? '', 24);
$owner = clean_name($body['owner'] ?? '', 18);
$div = p_int($body, 'div', -1);
// Da dove si è partiti (S.startDiv, già tracciato lato client per l'achievement "from_bottom"):
// facoltativo per compatibilità con client vecchi che non lo mandano ancora, in quel caso non
// si assume alcuna scalata (stesso comportamento di prima, nessun bonus/penalità).
$startDiv = p_int($body, 'startDiv', $div);
$season = p_int($body, 'season', -1);
$trophies = p_int($body, 'trophies', 0);
$worth = p_num($body, 'worth');
if ($worth === null) $worth = 0.0;
$difficulty = p_str($body, 'difficulty', 12);

if ($club === '' || $owner === '') api_fail('Nome club/proprietario mancante.');
if ($div < 0 || $div > 5) api_fail('Categoria non valida.');
if ($startDiv < 0 || $startDiv > 5) $startDiv = $div;
// +1 di margine: a carriera chiusa S.season può già puntare alla stagione successiva.
if ($season < 1 || $season > $MAX_SEASONS + 1) api_fail('Stagione non valida.');
if ($worth < 0 || $worth > 1e13) api_fail('Valore club non valido.');
if (!in_array($difficulty, ['facile', 'medio', 'difficile', 'estremo'], true)) $difficulty = 'medio';

// ---- plausibilità: quello che le regole del gioco rendono impossibile ----
$played = min($season, $MAX_SEASONS);                 // stagioni giocate, al massimo
if ($trophies < 0 || $trophies > $played * $MAX_TROPHIES_PER_SEASON) api_fail('Trofei non validi.');
// Una promozione a stagione, non di più.
if ($div - $startDiv > $played) api_fail('Scalata non plausibile per le stagioni giocate.');
// Stagioni passate in Serie A, al massimo: quelle giocate meno quelle servite per arrivarci.
$maxTopSeasons = max(0, $played - (5 - $startDiv));

// Dettaglio trofei (S.trophies lato client): facoltativo, solo per la card di dettaglio del
// podio nella classifica globale — il punteggio usa $trophies, ma se il dettaglio c'è deve
// tornare con il totale e con le regole (un titolo/coppa nazionale/coppa europea a stagione).
$tbIn = isset($body['trophyBreakdown']) && is_array($body['trophyBreakdown']) ? $body['trophyBreakdown'] : null;
$trophyBreakdown = null;
if ($tbIn) {
    $capInt = function ($v) { return (is_int($v) || is_float($v)) ? max(0, min(60, (int) $v)) : 0; };
    $titles = isset($tbIn['titles']) && is_array($tbIn['titles']) ? array_values($tbIn['titles']) : [];
    $titles = array_map($capInt, array_slice($titles, 0, 6));
    $titles = array_pad($titles, 6, 0);
    $trophyBreakdown = [
        'titles' => $titles,
        'nat' => $capInt($tbIn['nat'] ?? 0),
        'ucl' => $capInt($tbIn['ucl'] ?? 0),
        'uel' => $capInt($tbIn['uel'] ?? 0),
        'conf' => $capInt($tbIn['conf'] ?? 0),
    ];
    $sumTitles = array_sum($titles);
    $euro = $trophyBreakdown['ucl'] + $trophyBreakdown['uel'] + $trophyBreakdown['conf'];
    $sumAll = $sumTitles + $trophyBreakdown['nat'] + $euro;
    // Il totale conta anche la Supercoppa (al più una a stagione), che nel dettaglio non c'è.
    if ($sumTitles > $played || $trophyBreakdown['nat'] > $played || $euro > $maxTopSeasons || $titles[5] > $maxTopSeasons
        || $sumAll > $trophies || $trophies - $sumAll > $played) {
        api_fail('Trofei non coerenti con la carriera.');
    }
}

// Punteggio semplice e difficile da "barare" gonfiando un solo numero: pesa soprattutto i
// trofei (il vero traguardo di una carriera), poi la categoria raggiunta, poi quanto si è
// scalata la piramide dal punto di partenza (climb: chi parte già in Serie A e ci resta non
// deve valere quanto chi ci arriva dalla Promozione), poi il valore del club come spareggio.
$diffMult = ['facile' => 0.8, 'medio' => 1.0, 'difficile' => 1.35, 'estremo' => 1.7][$difficulty];
$climb = max(0, $div - $startDiv);
$score = (int) round(($trophies * 5000 + $div * 500 + $climb * 500 + min($worth, 2e9) / 1e6) * $diffMult);

$now = time();
$boardSeason = leaderboard_season();
$entry = [
    'club' => $club,
    'owner' => $owner,
    'div' => $div,
    'startDiv' => $startDiv,
    'season' => $season,
    'boardSeason' => $boardSeason,
    'trophies' => $trophies,
    'worth' => $worth,
    'difficulty' => $difficulty,
    'score' => $score,
    'ts' => $now,
    'trophyBreakdown' => $trophyBreakdown,
];

// Leggi-modifica-scrivi sotto lock esclusivo: due invii simultanei non si sovrascrivono più.
$lock = lock_or_fail('leaderboard');
$entries = leaderboard_read();
// Una sola voce per club+presidente (senza distinguere maiuscole) per stagione di classifica:
// resta la migliore. Vale anche come idempotenza: un invio ripetuto (doppio tap, retry dopo
// una risposta persa) non crea doppioni.
$sameKey = str_lower($club) . '|' . str_lower($owner);
$kept = [];
$better = false;
foreach ($entries as $e) {
    if ($e['boardSeason'] === $boardSeason && (str_lower($e['club']) . '|' . str_lower($e['owner'])) === $sameKey) {
        if ($e['score'] >= $score) { $better = true; $kept[] = $e; }
        continue;
    }
    $kept[] = $e;
}
if (!$better) $kept[] = $entry;
usort($kept, function ($a, $b) {
    if ($a['score'] !== $b['score']) return $b['score'] <=> $a['score'];
    return $a['ts'] <=> $b['ts'];
});
$kept = array_slice($kept, 0, $MAX_ENTRIES);
$saved = $better || store_write('leaderboard', $kept, true);
lock_release($lock);
if (!$saved) api_fail('Impossibile salvare al momento.', 500);

rate_hit('lb_ok', $ipKey, $RATE_LIMIT_SECONDS, 1);
rate_hit('lb_day', $ipKey, 86400, $DAILY_MAX);

api_send(['ok' => true, 'entry' => $entry]);
