<?php
/**
 * Presidente · Serie A — stanze multiplayer "hotseat sincrono".
 *
 * Stesso approccio minimale di leaderboard.php: niente account/login, un file JSON per
 * stanza come "database" (va benissimo per un gioco hobby su hosting condiviso), con le
 * protezioni che ha senso avere senza una vera autenticazione — validazione stretta dei
 * campi, un tetto ai giocatori per stanza, scritture atomiche sotto lock, pulizia automatica
 * delle stanze vecchie. Nessuna logica di gioco qui dentro: questo endpoint è solo il tramite
 * fra i browser.
 *
 * DOVE STANNO I DATI: in `_data/room_<CODICE>.json.php` (vedi storage.php), MAI più accanto
 * ai file del sito: prima `room_ABCD.json` si scaricava con un GET qualunque e dentro c'erano
 * gli authToken di tutti i giocatori — chiunque conoscesse il codice (cioè ogni partecipante)
 * poteva agire come l'host. Ora sul disco c'è solo l'hash del token.
 *
 * AUTENTICAZIONE: create/join restituiscono, oltre a `playerId` (pubblico: compare anche
 * nello stato condiviso della stanza, usato come targetId in kick/adoptBot/trade), un
 * `authToken` privato che NON viene mai restituito da nessun'altra chiamata. Ogni azione
 * successiva (tutte tranne create/join) deve mandare sia `playerId` che `authToken`: senza il
 * token giusto per quel playerId, l'azione fallisce con "Sessione non valida" (403). Il
 * client (ui.js) lo fa in automatico per ogni chiamata via mpApi().
 *
 * RATE-LIMIT (per IP, vedi rate_hit in storage.php):
 *   - create: 1 ogni 10s e 40 al giorno;  join: 6 ogni 10s;  state (poll): 40 ogni 5s;
 *   - tutte le POST insieme: 600 al minuto (una LAN di amici dietro lo stesso IP ci sta larga);
 *   - "colpi a vuoto" (codice inesistente o token sbagliato, da QUALUNQUE azione): 30 ogni 5
 *     minuti. Prima solo join/state erano limitate, ma ogni altra azione rispondeva 404/403
 *     senza limiti: un oracolo perfetto per indovinare i codici a 4 caratteri.
 *
 * FORMATO SU DISCO (v2). Uguale a quello che vede il client, tranne:
 *   - players[].authHash (sha256 del token) al posto del token; mai restituito;
 *   - i blocchi grossi e "opachi" — players[].state (la carriera), live.groups[] (classifiche
 *     + `resume`), results[playerId] — sono salvati come TESTO JSON, non come strutture PHP,
 *     e reinseriti tali e quali nella risposta. Due motivi: (1) passando da json_decode a
 *     json_encode PHP trasforma ogni oggetto vuoto `{}` in una lista `[]` (e viceversa non
 *     distingue), cioè il server alterava in silenzio le carriere che gli passavano
 *     attraverso; (2) ogni poll doveva decodificare e ricodificare megabyte di rosa: ora un
 *     poll è una lettura e una sostituzione di testo, e se nulla è cambiato risponde 304.
 *   - `rev`: contatore di scritture. `updatedAt` è strettamente crescente (due modifiche
 *     nello stesso secondo ottengono due valori diversi): il client decide se ridisegnare
 *     confrontando `updatedAt`, e prima una seconda modifica nello stesso secondo era
 *     invisibile fino al cambiamento successivo.
 *
 * RICHIESTE RIPETUTE: una risposta persa per strada e riprovata non deve fare danni. Sono
 * ripetibili senza effetti: startSession/nextRound (entro pochi secondi), submitResult,
 * terminate, ackResult, adoptBot, leave, respondTrade verso lo stato già raggiunto, chat e
 * proposeTrade identici a distanza di pochi secondi. join è ripetibile solo se il client
 * manda un `requestId` casuale (facoltativo): senza, un join ripetuto risponde "c'è già un
 * club con questo nome" come prima.
 *
 * POST room.php {action:'create', name, club, div, difficulty, roomName?} -> crea una stanza, ti
 *   aggiunge come host+primo giocatore
 * POST room.php {action:'join', code, name, club, div?, requestId?}  -> entra in una stanza
 *   esistente; `div` (opzionale) sceglie la propria categoria di partenza invece di ereditare
 *   sempre quella con cui la stanza è nata (utile a chi entra a dynasty già avviata)
 * POST room.php {action:'rename', code, playerId, roomName}         -> solo l'host: cambia il
 *   nome della stanza (il codice resta comunque l'unico modo di entrarci)
 * POST room.php {action:'announce', code, playerId, text}           -> solo l'host: fissa (o
 *   svuota, con text vuoto) un annuncio pinnato sopra la chat, visto da tutti finché non
 *   cambia — per regole/obiettivi della stanza che altrimenti si perderebbero nello scroll
 * POST room.php {action:'chat', code, playerId, text}               -> aggiunge un messaggio
 *   alla chat della stanza (log condiviso, ultimi 60 messaggi, nessuna logica di gioco)
 * POST room.php {action:'ready', code, playerId, ready, state?}     -> imposta il tuo stato
 *   "pronto" per la fase in cui si trova la stanza. In lobby (fase 'lobby'/'allReadyLobby') è
 *   solo un flag, nessuno stato richiesto. In sessione (fase 'session'/'readyForSim') quando
 *   ready=true, `state` è il JSON della carriera (dopo la dirigenza) che sottometti alla stanza.
 *   A simulazione in corso è rifiutata (prima riportava per errore tutta la stanza in lobby).
 * POST room.php {action:'startSession', code, playerId, force?}     -> solo l'host: chiude la
 *   lobby e apre la fase di dirigenza per tutti (fase 'session'); richiede che tutti abbiano
 *   premuto pronto in lobby, a meno di force=true
 * POST room.php {action:'pushMatchday', code, playerId, matchday, total, groups, force?} ->
 *   solo l'host: pubblica le classifiche aggiornate (una per categoria, `groups`) dopo aver
 *   simulato una giornata (fase -> 'simulating'); `matchday`/`total` sono il massimo fra tutte
 *   le categorie, per il progresso complessivo che vede l'host. Ogni `groups[i]` porta anche
 *   `resume` (i ctx completi di quel gruppo, non solo la classifica): se l'host sparisce a metà
 *   simulazione, chiunque prenda il suo posto può ricostruire la run da qui invece di restare
 *   bloccato sull'ultima giornata pubblicata.
 * POST room.php {action:'submitResult', code, playerId, results, force?} -> solo l'host:
 *   pubblica il risultato della stagione simulata (una voce per playerId), chiude il round
 *   (`done`); richiede che tutti abbiano premuto pronto in sessione, a meno di force=true.
 *   Aggiorna anche `hallOfFame` (uno storico sintetico per playerId: club, categoria,
 *   posizione, trofei di quella stagione) e `seasonAwards` (premi della stanza per quel
 *   round: capocannoniere, miglior mister, sorpresa della stagione), entrambi sopravvivono
 *   ai round successivi.
 * POST room.php {action:'ackResult', code, playerId}                 -> segnali di aver
 *   scaricato il tuo risultato di questo round (solo un flag, nessuna logica)
 * POST room.php {action:'nextRound', code, playerId, force?}         -> solo l'host: apre la
 *   stagione successiva nella stessa stanza (fase 'done' -> 'session'), richiede che tutti
 *   abbiano scaricato (ackResult), a meno di force=true
 * POST room.php {action:'terminate', code, playerId}                 -> solo l'host: chiude la
 *   dynasty per tutti prima delle 15 stagioni (fase -> 'terminated', per sempre); ciascuno
 *   vende il proprio club per conto suo (in locale, endDynasty in sim.js — non è mai stato
 *   compito di questo endpoint calcolare quanto vale un club)
 * POST room.php {action:'kick', code, playerId, targetId}           -> solo l'host: rimuove un
 *   altro giocatore dalla stanza (stessa logica di 'leave', avviata da un altro)
 * POST room.php {action:'adoptBot', code, playerId, targetId}       -> solo l'host: un
 *   giocatore che non risponde più (sparito a metà dynasty) viene marcato bot=true — da quel
 *   momento il suo club NON blocca più i controlli "tutti pronti"/"tutti hanno scaricato" e,
 *   lato client (hostBeginMatchdaySim, ui.js), esce dal gruppo di club umani per il resto della
 *   stanza: il suo posto in categoria lo riempie automaticamente un bot vero (setupHostSeason,
 *   sim.js, calcola già botCount = squadre - umani). Non reversibile: chi è stato adottato può
 *   solo uscire (leave) e provare a rientrare come nuovo giocatore.
 * POST room.php {action:'claimHost', code, playerId}                 -> chiunque sia nella
 *   stanza può proporsi come nuovo host SE l'host attuale sembra sparito: o non è più fra i
 *   giocatori (ha lasciato senza che il passaggio automatico di 'leave' sia scattato, caso
 *   raro), o la stanza non riceve nessun aggiornamento da più di $HOST_INACTIVE_SECONDS —
 *   un'euristica (qualunque azione AUTENTICATA di chiunque aggiorna updatedAt), non una vera
 *   rilevazione di presenza, ma sufficiente a sbloccare una stanza davvero ferma senza
 *   permettere a chi ha fretta di scippare un host ancora presente.
 * POST room.php {action:'proposeTrade', code, playerId, targetId, playerName, fee} -> propone
 *   una trattativa diretta a un altro umano della stanza per un suo giocatore (indicato per
 *   nome: non c'è modo di sfogliare la rosa altrui, il nome si scopre altrove, es. in chat) a
 *   un prezzo offerto. Crea una voce in room['trades'], stato 'pending'.
 * POST room.php {action:'respondTrade', code, playerId, tradeId, response, counterFee?,
 *   playerSnapshot?} -> risponde a una trattativa. Chi riceve una proposta 'pending' può
 *   accept (allegando playerSnapshot: il giocatore VERO preso dalla propria rosa, lato client),
 *   reject, o counter (counterFee, nuovo prezzo proposto); chi l'ha creata può accept/reject
 *   solo una trattativa 'countered' (la controproposta), o cancel una propria 'pending' ancora
 *   inevasa. Nessuna logica di gioco qui: la cessione vera (rimuovere/aggiungere il giocatore,
 *   spostare il budget) avviene in locale in ciascuno dei due browser (ui.js), leggendo questo
 *   stato al prossimo poll.
 * POST room.php {action:'leave', code, playerId}                    -> esci dalla stanza
 * GET  room.php?action=state&code=XXXX                               -> stato attuale (poll);
 *   con ETag: se il browser ha già l'ultima versione risponde 304 senza corpo
 *
 * Struttura a quattro fasi, che si ripete un round (una stagione) alla volta nella stessa
 * stanza: (1) lobby — tutti premono pronto, poi l'host avvia la sessione; (2) sessione —
 * ognuno gestisce la propria dirigenza per conto suo e ripreme pronto quando ha finito; (3)
 * simulazione — dalla seconda stagione in poi ciascun umano può essere in una categoria
 * diversa dagli altri (promozioni/retrocessioni individuali), quindi l'host (sim.js:
 * setupHostSeason/stepHostMatchday) raggruppa i pronti per categoria e avanza tutti i gruppi
 * di una giornata alla volta nel proprio browser, pubblicando ad ogni giornata la classifica
 * di ciascuna categoria (pushMatchday) — ognuno segue in tempo reale solo quella della
 * propria; (4) round chiuso — quando tutte le categorie hanno finito, l'host preme "Vedi
 * resoconto" (finishHostSeason + submitResult, fase `done`) e ciascuno scarica il proprio
 * risultato quando vuole (ackResult); una volta che l'hanno scaricato tutti (o l'host forza),
 * l'host apre la stagione successiva (nextRound) e si torna al punto 2 — a meno che, in
 * qualunque momento di queste quattro fasi, l'host non termini la dynasty in anticipo
 * (terminate), fase finale da cui non si torna indietro.
 */

define('PRESIDENTE_API', true);
require_once __DIR__ . '/storage.php';
api_bootstrap();
storage_migrate_legacy();

$MAX_PLAYERS = 6;
// Una stanza dura tutta la dynasty (fino a 15 stagioni, MAX_SEASONS in data.js), giocata con
// calma nel tempo libero: 24 ore sarebbero bastate solo per una singola sessione, qui serve
// margine per settimane/mesi di inattività fra una stagione e l'altra senza perdere la stanza.
$ROOM_TTL_SECONDS = 180 * 24 * 3600;
// Due casi in cui 180 giorni sono solo spazio sprecato: una stanza mai partita (ancora in
// lobby, magari creata per prova) e una dynasty già terminata (resta solo da vendere il club).
$LOBBY_TTL_SECONDS = 30 * 24 * 3600;
$TERMINATED_TTL_SECONDS = 60 * 24 * 3600;
$MAX_ROOMS = 3000;   // tetto di sicurezza al numero di stanze sul disco
$CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // niente 0/O/1/I, meno errori a mano
// Sotto questa inattività (nessun aggiornamento alla stanza, da chiunque) si considera l'host
// verosimilmente sparito e si accetta un claimHost da un altro giocatore. 15 minuti: abbastanza
// da non scippare un host che sta solo simulando una stagione lunga senza pubblicare ancora
// nulla, abbastanza poco da non lasciare la stanza bloccata per giorni.
$HOST_INACTIVE_SECONDS = 15 * 60;
$RETRY_GRACE_SECONDS = 30;   // entro quanto una startSession/nextRound ripetuta è "la stessa"

// Tetti al corpo della richiesta, per azione. La lobby sta larga in pochi KB; 'ready' porta
// una carriera intera (rosa, storico, ecc.); 'submitResult' i risultati di TUTTI i giocatori
// insieme e 'pushMatchday' anche i ctx completi di ogni categoria (per riprendere la
// simulazione se l'host sparisce): un tetto largo ma solo dove serve davvero.
$BODY_LIMIT_DEFAULT = 32 * 1024;
$BODY_LIMITS = ['ready' => 2 * 1024 * 1024, 'pushMatchday' => 8 * 1024 * 1024, 'submitResult' => 8 * 1024 * 1024];

/* ---------------------------------------------------------------- funzioni di servizio */

function room_valid_code($code) { return is_string($code) && preg_match('/^[A-Z0-9]{4,8}$/', $code) === 1; }
function room_valid_player_id($id) { return is_string($id) && preg_match('/^p_[0-9a-f]{12}$/', $id) === 1; }
function room_valid_token($t) { return is_string($t) && preg_match('/^[0-9a-f]{32}$/', $t) === 1; }

function gen_player_id() { return 'p_' . bin2hex(random_bytes(6)); }
// playerId è pubblico — authToken è la credenziale privata, generata solo qui: al client va
// il token, sul disco resta solo il suo hash (vedi find_authed_index).
function gen_auth_token() { return bin2hex(random_bytes(16)); }

function gen_room_code($alphabet) {
    $code = '';
    for ($i = 0; $i < 4; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    return $code;
}

// 32 file di lock fissi (il codice sceglie il suo) invece di uno per stanza: nessun file di
// lock da creare/cancellare insieme alla stanza (cancellare un file su cui qualcuno aspetta
// il lock è una corsa classica), e il numero di file non cresce con le stanze.
function room_lock_name($code) { return 'roomlock_' . (abs(crc32($code)) % 32); }

// Stanza dal disco: array, null se non esiste. `$corrupt` true se il file c'è ma non si legge.
function room_load($code, &$corrupt = null) {
    $room = store_read('room_' . $code, null, $corrupt);
    if (!is_array($room)) return null;
    if (!is_array($room['players'] ?? null)) { $corrupt = true; return null; }
    if (($room['v'] ?? 1) < 2) $room = room_upgrade_legacy($room, $code, time());
    $room['players'] = array_values(array_filter($room['players'], 'is_array'));
    return $room;
}

// Salva e marca la modifica: rev +1, updatedAt strettamente crescente (vedi intestazione).
function room_save($code, &$room) {
    $room['rev'] = (int) ($room['rev'] ?? 0) + 1;
    $room['updatedAt'] = max(time(), (int) ($room['updatedAt'] ?? 0) + 1);
    return store_write('room_' . $code, $room);
}

// Un gruppo della simulazione live com'è salvato ({div, body, resume}) -> il JSON che vede il
// client: l'oggetto originale con `resume` (o null) rimesso in coda.
function room_group_json($g) {
    $body = is_array($g) && is_string($g['body'] ?? null) && strlen($g['body']) >= 2 && $g['body'][0] === '{' ? $g['body'] : '{}';
    $inner = substr($body, 1, -1);
    $resume = is_array($g) && is_string($g['resume'] ?? null) && $g['resume'] !== '' ? $g['resume'] : 'null';
    return '{' . $inner . ($inner === '' ? '' : ',') . '"resume":' . $resume . '}';
}

// Lo stato della stanza come lo vede il client (testo JSON). Non c'è nulla di sensibile in
// una stanza (solo nomi club/proprietario scelti apposta per essere condivisi) TRANNE le
// credenziali di ciascun giocatore, che non lasciano mai il server. I blocchi salvati come
// testo vengono reinseriti con dei segnaposto: il nonce casuale per richiesta garantisce che
// nessun testo scritto da un utente possa coincidere con un segnaposto.
function room_public_json($room) {
    $nonce = bin2hex(random_bytes(8));
    $map = [];
    $n = 0;
    $ph = function ($raw) use (&$map, &$n, $nonce) {
        $k = '@@' . $nonce . ':' . ($n++) . '@@';
        $map['"' . $k . '"'] = $raw;
        return $k;
    };
    foreach ($room['players'] as $i => $p) {
        unset($p['authHash'], $p['authToken'], $p['joinKey'], $p['lastChatAt']);
        if (isset($p['state'])) {
            if (is_string($p['state']) && $p['state'] !== '') $p['state'] = $ph($p['state']); else unset($p['state']);
        }
        $room['players'][$i] = $p;
    }
    if (isset($room['live']) && is_array($room['live'])) {
        $groups = [];
        foreach ((array) ($room['live']['groups'] ?? []) as $g) $groups[] = $ph(room_group_json($g));
        $room['live']['groups'] = $groups;
    }
    if (isset($room['results']) && is_array($room['results'])) {
        foreach ($room['results'] as $pid => $raw) {
            if (is_string($raw) && $raw !== '') $room['results'][$pid] = $ph($raw); else unset($room['results'][$pid]);
        }
    }
    unset($room['sessionStartedAt'], $room['roundOpenedAt']);
    $json = store_json_encode($room);
    return $map ? strtr($json, $map) : $json;
}

function room_respond($room, $extra = []) {
    $head = store_json_encode(array_merge(['ok' => true], $extra));
    api_send_raw(substr($head, 0, -1) . ',"room":' . room_public_json($room) . '}');
}

function room_player_index($room, $playerId) {
    foreach ($room['players'] as $i => $p) { if (($p['id'] ?? null) === $playerId) return $i; }
    return null;
}

// Verifica che $playerId esista nella stanza E che $authToken sia il suo — restituisce
// l'indice del giocatore, o null. Sul disco c'è l'hash del token: si confronta hash con hash,
// con hash_equals (tempo costante).
function find_authed_index($room, $playerId, $authToken) {
    if (!room_valid_player_id($playerId) || !room_valid_token($authToken)) return null;
    $i = room_player_index($room, $playerId);
    if ($i === null) return null;
    $stored = (string) ($room['players'][$i]['authHash'] ?? '');
    if (strlen($stored) !== 64) return null;
    return hash_equals($stored, hash('sha256', $authToken)) ? $i : null;
}

// "Colpo a vuoto": codice inesistente o credenziali sbagliate. Contati per IP, da qualunque
// azione (GET state compresa): superato il tetto, per 5 minuti non si prova più nulla.
function room_miss_guard() {
    $wait = rate_peek('room_miss', client_ip_key(), 300, 30);
    if ($wait > 0) api_fail('Troppi tentativi non validi: riprova fra qualche minuto.', 429, $wait);
}
function room_miss() { rate_hit('room_miss', client_ip_key(), 300, 30); }

// Pulizia opportunistica (niente cron su un hosting condiviso): al più una volta l'ora, in
// coda a una create/join. Si guarda la data di modifica del FILE (ogni scrittura la aggiorna:
// coincide con updatedAt) invece di aprire e decodificare ogni stanza — prima ogni create/join
// leggeva TUTTE le stanze per intero, senza lock: se in quell'istante una stanza veniva
// riscritta la si vedeva vuota e la si cancellava, viva.
function cleanup_old_rooms($ttl, $lobbyTtl, $terminatedTtl) {
    $dir = data_dir();
    $stamp = $dir . '/cleanup.stamp';
    $now = time();
    $last = @filemtime($stamp);
    if ($last !== false && ($now - $last) < 3600 && $last <= $now) return;
    @touch($stamp);
    foreach ((array) @glob($dir . '/room_*.json.php') as $f) {
        if (!preg_match('/^room_([A-Z0-9]{4,8})\.json\.php$/', basename($f), $m)) continue;
        $age = $now - (int) @filemtime($f);
        if ($age <= min($lobbyTtl, $terminatedTtl)) continue;
        $lock = lock_acquire(room_lock_name($m[1]), true, 1);
        if (!$lock) continue;   // occupata proprio ora: è viva, se ne riparla al prossimo giro
        clearstatcache(true, $f);
        $age = $now - (int) @filemtime($f);
        $drop = $age > $ttl;
        if (!$drop && $age > min($lobbyTtl, $terminatedTtl)) {
            $room = room_load($m[1], $corrupt);
            $phase = is_array($room) ? ($room['phase'] ?? 'lobby') : null;
            if ($room === null) $drop = $corrupt && $age > $lobbyTtl;   // illeggibile da un mese: non tornerà
            elseif (in_array($phase, ['lobby', 'allReadyLobby'], true) && empty($room['season']) && empty($room['hallOfFame'])) $drop = $age > $lobbyTtl;
            elseif ($phase === 'terminated') $drop = $age > $terminatedTtl;
        }
        if ($drop) store_delete('room_' . $m[1]);
        lock_release($lock);
    }
    // File temporanei rimasti da una scrittura interrotta (processo ucciso fra scrittura e rinomina).
    foreach ((array) @glob($dir . '/*.tmp*') as $f) { if (($now - (int) @filemtime($f)) > 3600) @unlink($f); }
}

function room_count() {
    $files = @glob(data_dir() . '/room_*.json.php');
    return is_array($files) ? count($files) : 0;
}

// Valore (oggetto/array decodificato in modalità oggetto) -> testo JSON da salvare tale e quale.
function raw_json($v) { return store_json_encode($v); }

// Accesso a un campo di un oggetto JSON decodificato in modalità oggetto (stdClass) o array.
function o_get($o, $key) {
    if (is_object($o)) return isset($o->$key) ? $o->$key : null;
    if (is_array($o)) return isset($o[$key]) ? $o[$key] : null;
    return null;
}
function o_num($o, $key) { $v = o_get($o, $key); return (is_int($v) || is_float($v)) && is_finite((float) $v) ? $v : null; }
// Piccola struttura (pochi campi) da modalità oggetto ad array associativo.
function to_assoc($v) {
    if (!is_object($v) && !is_array($v)) return null;
    $a = json_decode(json_encode($v), true);
    return is_array($a) ? $a : null;
}

// Tolto un giocatore (leave/kick), la stanza si adatta. Chi esce durante la sessione
// (dirigenza) non riporta gli altri in lobby: restano nella stessa fase, solo rifanno "pronto"
// perché la composizione della stanza è cambiata. Chi esce a simulazione già avviata non la
// interrompe (l'host la porta avanti comunque nel proprio browser): la fase resta
// 'simulating'. Chi esce a round chiuso ('done') non tocca il resoconto già pubblicato né lo
// stato di chi deve ancora scaricarlo. Una dynasty già terminata resta tale per sempre.
function room_after_removal(&$room) {
    $prevPhase = $room['phase'] ?? 'lobby';
    if (in_array($prevPhase, ['simulating', 'done', 'terminated'], true)) return;
    $room['phase'] = in_array($prevPhase, ['session', 'readyForSim'], true) ? 'session' : 'lobby';
    foreach ($room['players'] as &$p) { if (empty($p['bot'])) $p['ready'] = false; }
    unset($p);
}

// Un giocatore di rosa arrivato da un'altra carriera (playerSnapshot di respondTrade): non ci
// si fida della forma esatta (arriva dal browser di un altro giocatore, mai validato lato
// server come lo è invece generato da sim.js), quindi si sanifica/limita ogni campo invece di
// fidarsi ciecamente. Ritorna null se manca l'essenziale (nome/ruolo).
function clean_player_snapshot($p) {
    $p = to_assoc($p);
    if (!is_array($p)) return null;
    $n = clean_name($p['n'] ?? '', 40);
    $pos = in_array($p['pos'] ?? '', ['POR', 'DIF', 'CEN', 'ATT'], true) ? $p['pos'] : null;
    if ($n === '' || !$pos) return null;
    $ovr = max(1, min(115, p_int($p, 'ovr', 50)));
    $age = max(15, min(45, p_int($p, 'age', 25)));
    $wage = p_num($p, 'wage');
    $wage = max(0, min(5e6, $wage === null ? 0 : $wage));
    $yrs = max(1, min(6, p_int($p, 'yrs', 3)));
    $potential = max($ovr, min(115, p_int($p, 'potential', $ovr)));
    return [
        'n' => $n, 'pos' => $pos, 'ovr' => $ovr, 'age' => $age, 'wage' => $wage, 'yrs' => $yrs,
        'potential' => $potential,
        'nat' => is_array($p['nat'] ?? null) ? ['code' => clean_name($p['nat']['code'] ?? '', 4), 'name' => clean_name($p['nat']['name'] ?? '', 30), 'flag' => ''] : null,
        'seasonGoals' => 0, 'seasonAssists' => 0, 'seasonCleanSheets' => 0, 'seasonApps' => 0,
    ];
}

/* ---------------------------------------------------------------- GET: stato (poll) */

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' || $method === 'HEAD') {
    if (p_str($_GET, 'action', 16) !== 'state') api_fail('Azione non supportata.', 405);
    rate_or_fail('room_state', 5, 40, 'Troppe richieste, rallenta un po\'.');
    room_miss_guard();
    $code = strtoupper(trim(p_str($_GET, 'code', 16)));
    if ($code === '') api_fail('Codice stanza mancante.');
    if (!room_valid_code($code)) { room_miss(); api_fail('Stanza non trovata.', 404); }
    $lock = lock_or_fail(room_lock_name($code), false);
    $room = room_load($code, $corrupt);
    lock_release($lock);
    // Solo un 404 dice al client "la stanza non esiste più" (e gli fa abbandonare la sessione):
    // un file illeggibile è un 500, cioè "riprova", non "dimenticala".
    if ($room === null && $corrupt) api_fail('Stanza temporaneamente non leggibile, riprova.', 500);
    if ($room === null) { room_miss(); api_fail('Stanza non trovata.', 404); }
    // ETag = codice + contatore di scritture: il browser rimanda da solo If-None-Match e, se
    // nulla è cambiato, riceve un 304 senza corpo (fetch() restituisce comunque la copia che
    // ha già, per il client non cambia nulla) invece di riscaricare tutta la stanza ogni 3s.
    $etag = '"' . $code . '-' . (int) ($room['rev'] ?? 0) . '-' . (int) ($room['updatedAt'] ?? 0) . '"';
    header('Cache-Control: private, no-cache');
    header('ETag: ' . $etag);
    $inm = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    // Un server che comprime la risposta può marcare l'ETag come debole (W/) o aggiungergli
    // "-gzip": il browser lo rimanda così, e deve valere lo stesso.
    $norm = function ($t) { return preg_replace(['/^W\//', '/-(gzip|br|deflate)"$/'], ['', '"'], trim($t)); };
    if (is_string($inm) && $inm !== '' && in_array($etag, array_map($norm, explode(',', $inm)), true)) {
        while (ob_get_level() > 0) @ob_end_clean();
        http_response_code(304);
        exit;
    }
    room_respond($room);
}

if ($method !== 'POST') { header('Allow: GET, POST'); api_fail('Metodo non supportato.', 405); }

/* ---------------------------------------------------------------- POST: azioni */

api_require_same_origin();
rate_or_fail('room_post', 60, 600, 'Troppe richieste, rallenta un po\'.');

// Il corpo si decodifica in modalità OGGETTO (non array associativo): è l'unico modo di
// distinguere `{}` da `[]` nei blocchi che vanno conservati tali e quali (vedi intestazione).
// Il primo livello diventa un array per comodità; i valori annidati restano oggetti.
$declared = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($declared > max($BODY_LIMITS)) api_fail('Corpo della richiesta troppo grande.', 413);
$in = @fopen('php://input', 'rb');
$raw = $in ? stream_get_contents($in, max($BODY_LIMITS) + 1) : '';
if ($in) fclose($in);
if (!is_string($raw)) $raw = '';
if (strlen($raw) > max($BODY_LIMITS)) api_fail('Corpo della richiesta troppo grande.', 413);
if (strlen($raw) > $BODY_LIMIT_DEFAULT) @ini_set('memory_limit', '256M');   // se l'hosting lo permette
$decoded = json_decode($raw, false, 64);
if (!is_object($decoded)) api_fail('JSON non valido.');
$body = (array) $decoded;
unset($decoded);

$action = p_str($body, 'action', 24);
$ACTIONS = ['create', 'join', 'rename', 'announce', 'chat', 'ready', 'startSession', 'pushMatchday', 'submitResult',
    'ackResult', 'nextRound', 'terminate', 'kick', 'adoptBot', 'claimHost', 'proposeTrade', 'respondTrade', 'leave'];
if (!in_array($action, $ACTIONS, true)) api_fail('Azione non riconosciuta.');
if (strlen($raw) > ($BODY_LIMITS[$action] ?? $BODY_LIMIT_DEFAULT)) api_fail('Corpo della richiesta troppo grande.', 413);
unset($raw);

if ($action === 'create') {
    rate_or_fail('room_create', 10, 1, 'Puoi creare una stanza ogni pochi secondi. Riprova a breve.');
    rate_or_fail('room_create_day', 86400, 40, 'Hai creato troppe stanze oggi. Riprova domani.');

    $name = clean_name($body['name'] ?? '', 18);
    $club = clean_name($body['club'] ?? '', 24);
    $div = p_int($body, 'div', 0);
    $difficulty = p_str($body, 'difficulty', 12);
    $roomName = clean_name($body['roomName'] ?? '', 30);
    if (!in_array($difficulty, ['facile', 'medio', 'difficile', 'estremo'], true)) $difficulty = 'medio';
    if ($name === '' || $club === '') api_fail('Nome proprietario/club mancante.');
    if ($div < 0 || $div > 5) api_fail('Categoria non valida.');

    cleanup_old_rooms($ROOM_TTL_SECONDS, $LOBBY_TTL_SECONDS, $TERMINATED_TTL_SECONDS);
    if (room_count() >= $MAX_ROOMS) api_fail('Ci sono troppe stanze aperte in questo momento, riprova più tardi.', 503, 600);

    $playerId = gen_player_id();
    $authToken = gen_auth_token();
    $now = time();
    $room = [
        'v' => 2,
        'code' => null,
        'name' => $roomName !== '' ? $roomName : null,
        'createdAt' => $now,
        'updatedAt' => $now - 1,
        'rev' => 0,
        'div' => $div,
        'difficulty' => $difficulty,
        'hostId' => $playerId,
        'phase' => 'lobby',
        'players' => [
            ['id' => $playerId, 'authHash' => hash('sha256', $authToken), 'name' => $name, 'club' => $club, 'ready' => false, 'joinedAt' => $now],
        ],
        'chat' => [],
        'hallOfFame' => [],
        'seasonAwards' => [],
        'trades' => [],
        'announcement' => null,
    ];
    // Praticamente mai più di un tentativo (4 caratteri su un alfabeto da 32 = oltre un
    // milione di combinazioni), ma non si sovrascrive mai una stanza esistente: controllo e
    // scrittura stanno sotto lo stesso lock, due create simultanee non possono prendersi lo
    // stesso codice.
    $code = null;
    for ($i = 0; $i < 12 && $code === null; $i++) {
        $try = gen_room_code($CODE_ALPHABET);
        $lock = lock_acquire(room_lock_name($try), true, 3);
        if (!$lock) continue;
        if (!store_exists('room_' . $try)) {
            $room['code'] = $try;
            if (room_save($try, $room)) $code = $try;
        }
        lock_release($lock);
    }
    if ($code === null) api_fail('Impossibile creare una stanza al momento, riprova.', 500);
    activity_log($code, 'create');
    room_respond($room, ['playerId' => $playerId, 'authToken' => $authToken]);
}

if ($action === 'join') {
    rate_or_fail('room_join', 10, 6, 'Troppi tentativi di ingresso, rallenta un po\'.');
    room_miss_guard();

    $code = strtoupper(trim(p_str($body, 'code', 16)));
    $name = clean_name($body['name'] ?? '', 18);
    $club = clean_name($body['club'] ?? '', 24);
    if ($code === '') api_fail('Codice stanza mancante.');
    if ($name === '' || $club === '') api_fail('Nome proprietario/club mancante.');
    if (!room_valid_code($code)) { room_miss(); api_fail('Stanza non trovata.', 404); }
    // Chiave di idempotenza facoltativa, scelta a caso dal client: se la risposta a un join va
    // persa e il client riprova con la stessa chiave, ritrova il suo posto (stesso playerId,
    // stesso token) invece di sbattere contro "c'è già un club con questo nome".
    $requestId = p_str($body, 'requestId', 64);
    if (!preg_match('/^[A-Za-z0-9_\-]{16,64}$/', $requestId)) $requestId = '';
    $joinKey = $requestId !== '' ? hash('sha256', $requestId) : null;

    // Anche l'ingresso in una stanza è un buon momento per la pulizia opportunistica: create
    // non è l'unica azione a poterla far scattare (altrimenti, se nessuno crea più stanze
    // nuove sull'hosting, le vecchie abbandonate non vengono mai più toccate).
    cleanup_old_rooms($ROOM_TTL_SECONDS, $LOBBY_TTL_SECONDS, $TERMINATED_TTL_SECONDS);

    $lock = lock_or_fail(room_lock_name($code));
    $room = room_load($code, $corrupt);
    if ($room === null && $corrupt) api_fail('Stanza temporaneamente non leggibile, riprova.', 500);
    if ($room === null) { room_miss(); api_fail('Stanza non trovata.', 404); }

    // Con requestId il token è derivato (HMAC col segreto del server), non casuale: una
    // richiesta ripetuta ottiene lo stesso identico token della prima, in qualunque ordine
    // arrivino le due risposte.
    $tokenFor = function ($playerId) use ($code, $requestId) {
        return $requestId !== '' ? substr(hash_hmac('sha256', 'join|' . $code . '|' . $playerId . '|' . $requestId, data_secret()), 0, 32) : gen_auth_token();
    };
    if ($joinKey !== null) {
        foreach ($room['players'] as $p) {
            if (isset($p['joinKey']) && hash_equals((string) $p['joinKey'], $joinKey)) {
                room_respond($room, ['playerId' => $p['id'], 'authToken' => $tokenFor($p['id'])]);
            }
        }
    }

    $phase = $room['phase'] ?? 'lobby';
    if ($phase === 'done') api_fail('La stanza ha già una stagione pronta, non si può più entrare.', 409);
    if ($phase === 'terminated') api_fail('La dynasty di questa stanza è stata conclusa, non si può più entrare.', 409);
    if (count($room['players']) >= $MAX_PLAYERS) api_fail('Stanza piena (massimo ' . $MAX_PLAYERS . ' giocatori).', 409);
    foreach ($room['players'] as $p) {
        if (str_lower((string) ($p['club'] ?? '')) === str_lower($club)) api_fail('C\'è già un club con questo nome nella stanza.');
    }
    // Chi entra a dynasty già avviata (fase 'session'/'readyForSim'/'simulating' di un round
    // successivo al primo) può scegliere la propria categoria di partenza, invece di ereditare
    // sempre quella con cui la stanza è nata — gli altri, ormai, potrebbero essere altrove.
    $roomDiv = max(0, min(5, (int) ($room['div'] ?? 0)));
    $div = p_int($body, 'div', $roomDiv);
    if ($div < 0 || $div > 5) $div = $roomDiv;

    $playerId = gen_player_id();
    $authToken = $tokenFor($playerId);
    $now = time();
    $player = ['id' => $playerId, 'authHash' => hash('sha256', $authToken), 'name' => $name, 'club' => $club, 'ready' => false, 'joinedAt' => $now, 'joinDiv' => $div];
    if ($joinKey !== null) $player['joinKey'] = $joinKey;
    $room['players'][] = $player;
    // È entrato qualcuno che non ha ancora premuto pronto: "tutti pronti" non è più vero.
    // Prima la fase restava 'allReadyLobby'/'readyForSim' e l'host poteva partire senza di lui.
    if ($phase === 'allReadyLobby') $room['phase'] = 'lobby';
    if ($phase === 'readyForSim') $room['phase'] = 'session';
    if (!room_save($code, $room)) api_fail('Impossibile salvare la stanza.', 500);
    lock_release($lock);
    activity_log($code, 'join');
    room_respond($room, ['playerId' => $playerId, 'authToken' => $authToken]);
}

/* ------------------------------------------------ da qui in poi: azioni autenticate */

// 'leave' e 'ackResult' non falliscono mai (stesso comportamento tollerante di sempre): se la
// stanza non c'è più o il token non torna, rispondono ok senza toccare nulla.
$lenient = in_array($action, ['leave', 'ackResult'], true);
$code = strtoupper(trim(p_str($body, 'code', 16)));
$playerId = p_str($body, 'playerId', 32);
$authToken = p_str($body, 'authToken', 64);
if ($code === '' || $playerId === '') api_fail('Richiesta non valida.');
room_miss_guard();
if (!room_valid_code($code)) { room_miss(); if ($lenient) api_send(['ok' => true]); api_fail('Stanza non trovata.', 404); }

$lock = lock_or_fail(room_lock_name($code));
$room = room_load($code, $corrupt);
if ($room === null && $corrupt) api_fail('Stanza temporaneamente non leggibile, riprova.', 500);
if ($room === null) { room_miss(); if ($lenient) api_send(['ok' => true]); api_fail('Stanza non trovata.', 404); }
$meIdx = find_authed_index($room, $playerId, $authToken);
if ($meIdx === null) { room_miss(); if ($lenient) api_send(['ok' => true]); api_fail('Sessione non valida: esci e rientra nella stanza.', 403); }
$me = $room['players'][$meIdx];
$isHost = ($room['hostId'] ?? null) === $playerId;
$phase = is_string($room['phase'] ?? null) ? $room['phase'] : 'lobby';
$now = time();

// Chiusura comune: salva (rev/updatedAt), rilascia il lock, risponde con la stanza.
$commit = function () use ($code, &$room, &$lock) {
    if (!room_save($code, $room)) api_fail('Impossibile salvare la stanza.', 500);
    lock_release($lock);
    room_respond($room);
};
// Richiesta ripetuta o senza effetto: nessuna scrittura, si risponde con la stanza com'è.
$noop = function () use (&$room, &$lock) {
    lock_release($lock);
    room_respond($room);
};

if ($action === 'rename') {
    if (!$isHost) api_fail('Solo l\'host può rinominare la stanza.', 403);
    $roomName = clean_name($body['roomName'] ?? '', 30);
    $room['name'] = $roomName !== '' ? $roomName : null;
    $commit();
}

if ($action === 'announce') {
    if (!$isHost) api_fail('Solo l\'host può fissare un annuncio.', 403);
    // Un annuncio non è un nome ma nemmeno un messaggio di chat "usa e getta": stesso testo
    // permissivo della chat (clean_line, non clean_name — niente punteggiatura stroncata), ma
    // un unico slot che resta fisso finché l'host non lo cambia o lo svuota.
    $text = clean_line($body['text'] ?? '', 200);
    $room['announcement'] = $text !== '' ? $text : null;
    $commit();
}

if ($action === 'chat') {
    // Un messaggio di chat non è un nome: clean_name toglierebbe ogni punteggiatura ed emoji.
    // clean_line toglie i caratteri di controllo (newline compresi: un messaggio sta su una
    // riga) e neutralizza "<" e ">"; l'escape per l'HTML resta comunque compito di chi mostra.
    $text = clean_line($body['text'] ?? '', 200);
    if ($text === '') api_fail('Richiesta non valida.');
    if (!isset($room['chat']) || !is_array($room['chat'])) $room['chat'] = [];
    // Lo stesso testo dallo stesso giocatore negli ultimi secondi è un invio ripetuto (doppio
    // tap, retry dopo una risposta persa): non lo si scrive due volte.
    $last = end($room['chat']);
    if (is_array($last) && ($last['id'] ?? null) === $playerId && ($last['text'] ?? null) === $text && ($now - (int) ($last['at'] ?? 0)) <= 5) $noop();
    // Un messaggio al secondo per giocatore: la chat non ha altri limiti (richiede già di
    // essere nella stanza), ma 60 messaggi a raffica cancellerebbero tutta la cronologia.
    if (($now - (int) ($me['lastChatAt'] ?? 0)) < 1) api_fail('Stai scrivendo troppo in fretta, aspetta un attimo.', 429, 1);
    $room['players'][$meIdx]['lastChatAt'] = $now;
    $room['chat'][] = ['id' => $playerId, 'name' => $me['name'] ?? '', 'club' => $me['club'] ?? '', 'text' => $text, 'at' => $now];
    // Solo gli ultimi 60 messaggi: una chat di stanza, non un archivio — tiene la stanza
    // leggera anche dopo mesi di dynasty.
    if (count($room['chat']) > 60) $room['chat'] = array_slice($room['chat'], -60);
    $commit();
}

if ($action === 'ready') {
    $ready = !empty($body['ready']);
    if ($phase === 'done') api_fail('La stanza ha già una stagione pronta.', 409);
    if ($phase === 'terminated') api_fail('La dynasty di questa stanza è stata conclusa dall\'host.', 409);
    // A simulazione in corso "pronto" non ha senso — e prima faceva danni: la fase veniva
    // ricalcolata come se si fosse in lobby, riportando indietro tutta la stanza a metà stagione.
    if ($phase === 'simulating') api_fail('La simulazione è già in corso: aspetta la prossima stagione.', 409);
    if (!empty($me['bot'])) api_fail('Il tuo club è ora gestito dalla IA: esci dalla stanza e rientra per tornare a giocare.', 409);
    // In lobby "pronto" è solo un flag (si aspetta di poter avviare la sessione); in sessione
    // porta con sé la carriera (dopo la dirigenza), da qui la validazione diversa per fase.
    $inSessionStage = in_array($phase, ['session', 'readyForSim'], true);
    if ($ready && $inSessionStage) {
        // Validazione tollerante, stesso criterio già usato lato client per un file di carriera
        // importato (handleImportSaveFile in ui.js): basta che abbia una rosa e un nome club.
        $state = $body['state'] ?? null;
        if (!is_object($state) || !is_array(o_get($state, 'squad')) || !is_string(o_get($state, 'club')) || o_get($state, 'club') === '') api_fail('Carriera mancante o non valida.');
        if (count($state->squad) > 200) api_fail('Carriera mancante o non valida.');
        // `state` è tutta la carriera del giocatore: club/owner dentro `state` arrivano da un
        // salvataggio già esistente e non da un form, ma restano testo scelto dal giocatore
        // (può rinominarli in Dirigenza) e finiscono nella lobby/classifica di TUTTI: stessa
        // igiene degli altri campi. Il resto della carriera è conservato tale e quale (testo
        // JSON opaco): chi lo mostra deve fare l'escape di ogni stringa che contiene.
        $state->club = clean_name($state->club, 24);
        $state->owner = clean_name(is_string(o_get($state, 'owner')) ? $state->owner : '', 18);
        if ($state->club === '') api_fail('Nome del club non valido.');
        $room['players'][$meIdx]['state'] = raw_json($state);
    }
    $room['players'][$meIdx]['ready'] = $ready;
    $allReady = count($room['players']) > 1;
    foreach ($room['players'] as $p) { if (empty($p['ready'])) { $allReady = false; break; } }
    if ($inSessionStage) $room['phase'] = $allReady ? 'readyForSim' : 'session';
    else $room['phase'] = $allReady ? 'allReadyLobby' : 'lobby';
    $commit();
}

if ($action === 'startSession') {
    if (!$isHost) api_fail('Solo l\'host può avviare la sessione.', 403);
    if ($phase === 'session' && ($now - (int) ($room['sessionStartedAt'] ?? 0)) <= $RETRY_GRACE_SECONDS) $noop();   // richiesta ripetuta
    if (!in_array($phase, ['lobby', 'allReadyLobby'], true)) api_fail('La sessione è già stata avviata.', 409);
    if (count($room['players']) < 2) api_fail('Serve almeno un altro giocatore nella stanza.', 409);
    if ($phase !== 'allReadyLobby' && empty($body['force'])) api_fail('Non tutti i giocatori sono pronti.', 409);
    $room['phase'] = 'session';
    $room['sessionStartedAt'] = $now;
    foreach ($room['players'] as &$p) { if (empty($p['bot'])) { $p['ready'] = false; unset($p['state']); } }
    unset($p);
    $commit();
}

if ($action === 'pushMatchday') {
    $matchday = p_int($body, 'matchday', -1);
    $total = p_int($body, 'total', -1);
    $groups = $body['groups'] ?? null;
    if ($matchday < 0 || $matchday > 400 || $total < 1 || $total > 400 || !is_array($groups) || count($groups) > 12) api_fail('Richiesta non valida.');
    if (!$isHost) api_fail('Solo l\'host può avanzare la simulazione.', 403);
    if ($phase === 'done') api_fail('La stanza ha già una stagione pronta.', 409);
    if (!in_array($phase, ['readyForSim', 'simulating'], true) && !($phase === 'session' && !empty($body['force']))) {
        api_fail('Non tutti i giocatori sono pronti a simulare.', 409);
    }
    // `resume` di un gruppo può mancare (ui.js: buildLiveGroups la manda solo ogni tot
    // giornate, per non riscrivere ad ogni giornata l'intero roster di ogni umano della
    // stanza): quando manca, si tiene quella dell'ultima giornata in cui c'era, invece di
    // perderla e lasciare la ripresa (resumeMatchdaySimFromLive) senza dati.
    $prevResume = [];
    foreach ((array) ($room['live']['groups'] ?? []) as $pg) {
        if (is_array($pg) && isset($pg['div']) && is_string($pg['resume'] ?? null)) $prevResume[(int) $pg['div']] = $pg['resume'];
    }
    $stored = [];
    foreach ($groups as $g) {
        $gd = o_num($g, 'div');
        if (!is_object($g) || $gd === null || $gd < 0 || $gd > 5) api_fail('Richiesta non valida.');
        $gd = (int) $gd;
        $resume = o_get($g, 'resume');
        $resumeRaw = (is_object($resume) || is_array($resume)) ? raw_json($resume) : ($prevResume[$gd] ?? null);
        unset($g->resume);
        $stored[] = ['div' => $gd, 'body' => raw_json($g), 'resume' => $resumeRaw];
    }
    $room['phase'] = 'simulating';
    $room['live'] = ['matchday' => $matchday, 'total' => $total, 'groups' => $stored, 'updatedAt' => $now];
    $commit();
}

if ($action === 'submitResult') {
    $results = $body['results'] ?? null;
    if (is_array($results) && !count($results)) $results = new stdClass();
    if (!is_object($results)) api_fail('Richiesta non valida.');
    if (!$isHost) api_fail('Solo l\'host può pubblicare il risultato.', 403);
    // Già pubblicato: una submitResult ripetuta (risposta persa, doppio tap) non riscrive il
    // resoconto né aggiunge una seconda riga all'albo d'oro.
    if ($phase === 'done') $noop();
    if (!in_array($phase, ['session', 'readyForSim', 'simulating'], true)) api_fail('La sessione non è ancora stata avviata.', 409);
    if ($phase === 'session' && empty($body['force'])) api_fail('Non tutti i giocatori sono pronti a simulare.', 409);

    $rawResults = [];
    $ctxs = [];
    foreach ($results as $pid => $ctx) {
        $pid = (string) $pid;
        if (!room_valid_player_id($pid) || !is_object($ctx)) continue;   // chiavi inattese: ignorate
        if (count($rawResults) >= 12) break;
        $rawResults[$pid] = raw_json($ctx);
        $ctxs[$pid] = $ctx;
    }
    $room['results'] = $rawResults;
    $room['phase'] = 'done';
    unset($room['live']);

    // Albo d'oro della stanza: un riepilogo sintetico per playerId che sopravvive ai round
    // successivi (a differenza di `results`, che nextRound azzera) — l'unico posto dove
    // rimane traccia di TUTTA la dynasty vista dalla stanza, non solo dal salvataggio del
    // singolo giocatore. Non è mai calcolo di gioco: solo estrazione dei campi già pronti
    // dentro ctx._end che l'host ha calcolato — ripuliti uno per uno, perché arrivano dal
    // browser dell'host e finiscono sullo schermo di tutti.
    $intOrNull = function ($v) { return (is_int($v) || is_float($v)) && is_finite((float) $v) ? (int) max(-1000000, min(1000000, $v)) : null; };
    $nameOrNull = function ($v, $max) { $s = clean_name(is_string($v) ? $v : '', $max); return $s !== '' ? $s : null; };
    if (!isset($room['hallOfFame']) || !is_array($room['hallOfFame'])) $room['hallOfFame'] = [];
    $topScorer = null; $bestManager = null; $surprise = null; $seasonNum = null;
    foreach ($ctxs as $pid => $ctx) {
        $end = o_get($ctx, '_end');
        $owner = $nameOrNull(o_get($ctx, 'owner'), 18);
        $club = $nameOrNull(o_get($ctx, 'club'), 24);
        $season = $intOrNull(o_get($ctx, 'season'));
        if ($season !== null) $seasonNum = max($seasonNum === null ? 0 : $seasonNum, $season);
        if (is_object($end)) {
            $trophies = [];
            foreach ((array) (is_array(o_get($end, 'trophies')) ? $end->trophies : []) as $t) {
                if (is_string($t) && count($trophies) < 8) { $t = clean_line($t, 60); if ($t !== '') $trophies[] = $t; }
            }
            if (!isset($room['hallOfFame'][$pid]) || !is_array($room['hallOfFame'][$pid])) $room['hallOfFame'][$pid] = [];
            $room['hallOfFame'][$pid][] = [
                'season' => $season,
                'owner' => $owner,
                'club' => $club,
                'div' => $intOrNull(o_get($ctx, 'div')),
                'pos' => $intOrNull(o_get($end, 'pos')),
                'promoted' => !empty($end->promoted),
                'relegated' => !empty($end->relegated),
                'title' => !empty($end->title),
                'trophies' => $trophies,
            ];
            // Una riga per stagione: 15 stagioni al massimo, 40 è già un tetto largo.
            if (count($room['hallOfFame'][$pid]) > 40) $room['hallOfFame'][$pid] = array_slice($room['hallOfFame'][$pid], -40);
        }
        // Premi della stagione: calcolati qui (mai lato client) perché servono TUTTI i
        // risultati della stanza insieme, gruppi/categorie diverse comprese. Confronto fra chi
        // ha finito questo round, non fra tutta la storia della stanza.
        $squad = o_get($ctx, 'squad');
        if (is_array($squad)) {
            foreach (array_slice($squad, 0, 200) as $pl) {
                if (!is_object($pl) || o_get($pl, 'pos') === 'POR') continue;
                $g = o_num($pl, 'seasonGoals');
                if ($g !== null && $g > 0 && $g < 1000 && ($topScorer === null || $g > $topScorer['goals'])) {
                    $topScorer = ['owner' => $owner, 'club' => $club, 'player' => $nameOrNull(o_get($pl, 'n'), 40) ?? '?', 'goals' => (int) $g];
                }
            }
        }
        $mgr = o_get($ctx, 'manager');
        $mDelta = o_num($mgr, '_ovrDelta');
        if ($mDelta !== null && abs($mDelta) < 1000 && ($bestManager === null || $mDelta > $bestManager['delta'])) {
            $bestManager = ['owner' => $owner, 'club' => $club, 'mgr' => $nameOrNull(o_get($mgr, 'n'), 40) ?? '?', 'delta' => $mDelta];
        }
        $exp = o_num($end, 'exp'); $pos = o_num($end, 'pos');
        if ($exp !== null && $pos !== null) {
            $delta = $exp - $pos;
            if ($delta > 0 && $delta < 1000 && ($surprise === null || $delta > $surprise['delta'])) {
                $surprise = ['owner' => $owner, 'club' => $club, 'delta' => $delta, 'pos' => (int) $pos];
            }
        }
    }
    // Chi non è più nella stanza da tempo non deve far crescere l'albo all'infinito.
    if (count($room['hallOfFame']) > 24) $room['hallOfFame'] = array_slice($room['hallOfFame'], -24, null, true);
    if ($topScorer || $bestManager || $surprise) {
        if (!isset($room['seasonAwards']) || !is_array($room['seasonAwards'])) $room['seasonAwards'] = [];
        $room['seasonAwards'][] = ['season' => $seasonNum, 'topScorer' => $topScorer, 'bestManager' => $bestManager, 'surprise' => $surprise];
        // Stesso tetto storico dell'albo d'oro: una stanza che dura 15 stagioni non deve
        // accumulare un file all'infinito.
        if (count($room['seasonAwards']) > 20) $room['seasonAwards'] = array_slice($room['seasonAwards'], -20);
    }
    $commit();
}

if ($action === 'ackResult') {
    // Azione a basso rischio (solo un flag "ho visto"). Vale solo a round chiuso: fuori da
    // 'done' non c'è nulla da confermare (e un flag rimasto acceso da prima farebbe risultare
    // "già scaricato" il resoconto successivo). Già confermato: nessuna scrittura.
    if ($phase !== 'done' || !empty($me['acked'])) $noop();
    $room['players'][$meIdx]['acked'] = true;
    $commit();
}

if ($action === 'nextRound') {
    if (!$isHost) api_fail('Solo l\'host può avviare la prossima stagione.', 403);
    if ($phase === 'session' && ($now - (int) ($room['roundOpenedAt'] ?? 0)) <= $RETRY_GRACE_SECONDS) $noop();   // richiesta ripetuta
    if ($phase !== 'done') api_fail('Non c\'è nessun resoconto da chiudere.', 409);
    $allAcked = true;
    foreach ($room['players'] as $p) { if (empty($p['acked'])) { $allAcked = false; break; } }
    if (!$allAcked && empty($body['force'])) api_fail('Non tutti hanno ancora scaricato il resoconto.', 409);
    $room['phase'] = 'session';
    $room['season'] = (int) ($room['season'] ?? 1) + 1;
    $room['roundOpenedAt'] = $now;
    unset($room['results'], $room['live']);
    foreach ($room['players'] as &$p) { if (empty($p['bot'])) { $p['ready'] = false; $p['acked'] = false; unset($p['state']); } }
    unset($p);
    $commit();
}

if ($action === 'terminate') {
    if (!$isHost) api_fail('Solo l\'host può terminare la dynasty.', 403);
    if ($phase === 'terminated') $noop();   // già conclusa: ripetere non cambia nulla
    // Fase finale, senza ritorno: nessun'altra azione di gioco cambia più questa stanza da
    // qui in poi (join/ready/startSession/pushMatchday/submitResult/nextRound la rifiutano
    // tutte controllando la fase). Ognuno vende il proprio club per conto suo, in locale.
    $room['phase'] = 'terminated';
    unset($room['results'], $room['live']);
    activity_log($code, 'terminate');
    $commit();
}

if ($action === 'kick') {
    $targetId = p_str($body, 'targetId', 32);
    if ($targetId === '') api_fail('Richiesta non valida.');
    if ($targetId === $playerId) api_fail('Non puoi espellere te stesso: usa "Esci dalla stanza".');
    if (!$isHost) api_fail('Solo l\'host può espellere un giocatore.', 403);
    if (room_player_index($room, $targetId) === null) api_fail('Giocatore non trovato in questa stanza.', 404);
    $room['players'] = array_values(array_filter($room['players'], function ($p) use ($targetId) { return ($p['id'] ?? null) !== $targetId; }));
    // Stessa logica di "leave" da qui in poi: la stanza si adatta come se se ne fosse uscito
    // da solo (fase invariata a simulazione/round chiuso/terminata, altrimenti si rifà pronto).
    room_after_removal($room);
    activity_log($code, 'kick:' . $targetId);
    $commit();
}

if ($action === 'adoptBot') {
    $targetId = p_str($body, 'targetId', 32);
    if ($targetId === '') api_fail('Richiesta non valida.');
    if ($targetId === $playerId) api_fail('Non puoi adottare il tuo stesso club: usa "Esci dalla stanza" se vuoi lasciare.');
    if (!$isHost) api_fail('Solo l\'host può adottare un club rimasto senza presidente.', 403);
    if (in_array($phase, ['done', 'terminated'], true)) api_fail('Non si può adottare un club in questa fase della stanza.', 409);
    $ti = room_player_index($room, $targetId);
    if ($ti === null) api_fail('Giocatore non trovato in questa stanza.', 404);
    if (!empty($room['players'][$ti]['bot'])) $noop();   // già adottato
    // bot=true da qui in poi: pronto/scaricato per costruzione (non blocca più
    // 'allReady'/'allAcked'), mai più simulato come umano — hostBeginMatchdaySim (ui.js) lo
    // esclude esplicitamente dal gruppo, lasciando il suo posto a un bot vero.
    $room['players'][$ti]['bot'] = true;
    $room['players'][$ti]['ready'] = true;
    $room['players'][$ti]['acked'] = true;
    // Era l'unico a mancare? Allora adesso sono tutti pronti: prima la fase restava ferma su
    // 'lobby'/'session' finché qualcuno non ripremeva pronto.
    if (in_array($phase, ['lobby', 'session'], true)) {
        $allReady = count($room['players']) > 1;
        foreach ($room['players'] as $p) { if (empty($p['ready'])) { $allReady = false; break; } }
        if ($allReady) $room['phase'] = $phase === 'lobby' ? 'allReadyLobby' : 'readyForSim';
    }
    activity_log($code, 'adoptBot:' . $targetId);
    $commit();
}

if ($action === 'claimHost') {
    if ($isHost) $noop();
    $hostStillHere = room_player_index($room, $room['hostId'] ?? '') !== null;
    $inactiveLongEnough = ($now - (int) ($room['updatedAt'] ?? 0)) > $HOST_INACTIVE_SECONDS;
    if ($hostStillHere && !$inactiveLongEnough) {
        api_fail('L\'host è ancora presente nella stanza: puoi proporti solo se sparisce (assente da più di ' . round($HOST_INACTIVE_SECONDS / 60) . ' minuti) o se ha già lasciato.', 409);
    }
    $room['hostId'] = $playerId;
    activity_log($code, 'claimHost:' . $playerId);
    $commit();
}

if ($action === 'proposeTrade') {
    $targetId = p_str($body, 'targetId', 32);
    $playerName = clean_name($body['playerName'] ?? '', 40);
    $fee = p_num($body, 'fee');
    if ($targetId === '' || $playerName === '') api_fail('Richiesta non valida.');
    if ($targetId === $playerId) api_fail('Non puoi proporre una trattativa a te stesso.');
    if ($fee === null || $fee < 0 || $fee > 2e9) api_fail('Offerta non valida.');
    // Scambio giocatore-per-giocatore (opzionale, in aggiunta o al posto del cash): a differenza
    // del giocatore RICHIESTO (playerName, che solo il venditore può verificare/allegare —
    // arriva alla risposta), quello OFFERTO in cambio è già nella rosa del proponente: può
    // allegarne subito lo snapshot vero, non serve aspettare nessuno.
    $offerPlayerName = clean_name($body['offerPlayerName'] ?? '', 40);
    $offerPlayerSnapshot = $offerPlayerName !== '' ? clean_player_snapshot($body['offerPlayerSnapshot'] ?? null) : null;
    if ($offerPlayerName !== '' && !$offerPlayerSnapshot) api_fail('Il giocatore che offri in cambio non è valido.');

    $ti = room_player_index($room, $targetId);
    if ($ti === null || !empty($room['players'][$ti]['bot'])) api_fail('Destinatario non trovato o non più in gioco.', 404);
    if (!in_array($phase, ['session', 'readyForSim', 'lobby', 'allReadyLobby'], true)) api_fail('Le trattative si fanno solo in dirigenza, non a simulazione in corso.', 409);
    if (!isset($room['trades']) || !is_array($room['trades'])) $room['trades'] = [];
    // Un tetto alle trattative pendenti per coppia (stesso proponente+destinatario) evita che
    // un rifiuto ripetuto (o un giocatore molesto) faccia crescere la lista senza fine.
    $pendingSamePair = 0;
    foreach ($room['trades'] as $t) {
        if (($t['fromId'] ?? null) !== $playerId || ($t['toId'] ?? null) !== $targetId || !in_array($t['status'] ?? '', ['pending', 'countered'], true)) continue;
        $pendingSamePair++;
        // Stessa identica proposta di pochi secondi fa: è una richiesta ripetuta, non una seconda.
        if (($t['status'] ?? '') === 'pending' && ($t['playerName'] ?? null) === $playerName && (float) ($t['fee'] ?? -1) === (float) $fee
            && ($t['offerPlayerName'] ?? null) === ($offerPlayerName !== '' ? $offerPlayerName : null) && ($now - (int) ($t['createdAt'] ?? 0)) <= 15) $noop();
    }
    if ($pendingSamePair >= 3) api_fail('Hai già troppe trattative in sospeso con questo giocatore: aspetta una risposta.', 409);
    $room['trades'][] = [
        'id' => 't_' . bin2hex(random_bytes(6)),
        'fromId' => $playerId, 'fromClub' => $me['club'] ?? '?',
        'toId' => $targetId, 'toClub' => $room['players'][$ti]['club'] ?? '?',
        'playerName' => $playerName, 'fee' => $fee, 'counterFee' => null,
        'offerPlayerName' => $offerPlayerName !== '' ? $offerPlayerName : null,
        'offerPlayerSnapshot' => $offerPlayerSnapshot,
        'status' => 'pending', 'playerSnapshot' => null,
        'createdAt' => $now, 'updatedAt' => $now,
    ];
    if (count($room['trades']) > 80) $room['trades'] = array_slice($room['trades'], -80);
    $commit();
}

if ($action === 'respondTrade') {
    $tradeId = p_str($body, 'tradeId', 32);
    $response = p_str($body, 'response', 12);
    if (!preg_match('/^t_[0-9a-f]{12}$/', $tradeId) || !in_array($response, ['accept', 'reject', 'counter', 'cancel'], true)) api_fail('Richiesta non valida.');
    if (!isset($room['trades']) || !is_array($room['trades'])) $room['trades'] = [];
    $idx = null;
    foreach ($room['trades'] as $i => $t) { if (is_array($t) && ($t['id'] ?? null) === $tradeId) { $idx = $i; break; } }
    if ($idx === null) api_fail('Trattativa non trovata.', 404);
    $t = $room['trades'][$idx];
    $status = (string) ($t['status'] ?? '');
    $isSeller = ($t['toId'] ?? null) === $playerId;
    $isBuyer = ($t['fromId'] ?? null) === $playerId;
    if (!$isSeller && !$isBuyer) api_fail('Questa trattativa non ti riguarda.', 403);
    // Risposta ripetuta: la trattativa è già nello stato che questa risposta avrebbe prodotto.
    if (['accept' => 'accepted', 'reject' => 'rejected', 'cancel' => 'cancelled'][$response] ?? null) {
        if ($status === ['accept' => 'accepted', 'reject' => 'rejected', 'cancel' => 'cancelled'][$response]) $noop();
    }

    if ($response === 'cancel') {
        if (!$isBuyer || $status !== 'pending') api_fail('Puoi annullare solo una tua proposta ancora in sospeso.', 409);
        $room['trades'][$idx]['status'] = 'cancelled';
    } elseif ($response === 'accept') {
        // 'pending' si accetta solo dal venditore (allega il giocatore vero), 'countered' solo
        // dal compratore (accetta il nuovo prezzo, il giocatore l'ha già allegato il venditore).
        if ($status === 'pending' && $isSeller) {
            $snap = clean_player_snapshot($body['playerSnapshot'] ?? null);
            if (!$snap) api_fail('Giocatore non valido: assicurati che il nome corrisponda a uno della tua rosa.');
            $room['trades'][$idx]['playerSnapshot'] = $snap;
            $room['trades'][$idx]['status'] = 'accepted';
        } elseif ($status === 'countered' && $isBuyer) {
            // Lo snapshot è già stato allegato dal venditore al momento della controproposta
            // (vedi 'counter' più sotto): qui il compratore chiude solo sul prezzo, non serve
            // un secondo giro dal venditore per confermare la cessione.
            if (empty($t['playerSnapshot'])) api_fail('Trattativa incompleta: manca il giocatore, chiedi al venditore di rifare la controproposta.', 409);
            $room['trades'][$idx]['status'] = 'accepted';
            $room['trades'][$idx]['fee'] = $t['counterFee'] ?? ($t['fee'] ?? 0);
        } else {
            api_fail('Non puoi accettare questa trattativa in questo momento.', 409);
        }
    } elseif ($response === 'reject') {
        if (!in_array($status, ['pending', 'countered'], true)) api_fail('Questa trattativa non è più aperta.', 409);
        $room['trades'][$idx]['status'] = 'rejected';
    } else {
        $counterFee = p_num($body, 'counterFee');
        // Controproposta ripetuta identica: già registrata.
        if ($isSeller && $status === 'countered' && $counterFee !== null && (float) ($t['counterFee'] ?? -1) === (float) $counterFee) $noop();
        if (!$isSeller || $status !== 'pending') api_fail('Puoi controproporre solo una richiesta ricevuta e ancora in sospeso.', 409);
        if ($counterFee === null || $counterFee < 0 || $counterFee > 2e9) api_fail('Controproposta non valida.');
        // Il venditore allega già qui il giocatore vero (come per un accept diretto): se il
        // compratore accetta la controproposta, la cessione è già pronta, senza un secondo
        // giro di conferma.
        $snap = clean_player_snapshot($body['playerSnapshot'] ?? null);
        if (!$snap) api_fail('Giocatore non valido: assicurati che il nome corrisponda a uno della tua rosa.');
        $room['trades'][$idx]['playerSnapshot'] = $snap;
        $room['trades'][$idx]['counterFee'] = $counterFee;
        $room['trades'][$idx]['status'] = 'countered';
    }
    $room['trades'][$idx]['updatedAt'] = $now;
    $commit();
}

if ($action === 'leave') {
    $room['players'] = array_values(array_filter($room['players'], function ($p) use ($playerId) { return ($p['id'] ?? null) !== $playerId; }));
    if (!count($room['players'])) {
        // L'ultimo a uscire si porta via la stanza — sotto lo stesso lock, così un join che
        // arriva nello stesso istante trova "stanza non trovata" invece di scrivere in un
        // file già cancellato.
        store_delete('room_' . $code);
        lock_release($lock);
        activity_log($code, 'closed');
        api_send(['ok' => true]);
    }
    if ($isHost) {
        // L'host passa a chi resta da più tempo, ma mai a un club adottato come bot (nessuno
        // davanti allo schermo da quella postazione) se c'è almeno un'alternativa umana.
        $nextHost = null;
        foreach ($room['players'] as $p) { if (empty($p['bot'])) { $nextHost = $p['id']; break; } }
        $room['hostId'] = $nextHost !== null ? $nextHost : $room['players'][0]['id'];
    }
    room_after_removal($room);
    $commit();
}

api_fail('Azione non riconosciuta.');
