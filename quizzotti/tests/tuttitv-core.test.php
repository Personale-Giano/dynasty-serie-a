<?php
/* Test delle regole di Tutti contro la TV (api/tuttitv-core.php).
   Lo lancia tests/tuttitv.test.js se trova un PHP; da solo: php tests/tuttitv-core.test.php */
require __DIR__ . '/../api/tuttitv-core.php';

$fail = 0;
function check($cond, $what) { global $fail; if (!$cond) { $fail++; echo "FALLITO: $what\n"; } }

mt_srand(42);
$bank = tv_load_bank(__DIR__ . '/../api/tuttitv-domande.json');
check($bank && count($bank['questions']) > 300, 'file delle domande caricato');
check(count($bank['themes']) >= 5, 'almeno 5 temi');

/** Stanza con tre giocatori collegati. */
function room3($bank, $opts = []) {
    $r = tv_new_room('ABCD', str_repeat('a', 32), 1000, $bank['themes'], $opts);
    tv_join($r, 'Fede', str_repeat('1', 32), 1000);
    tv_join($r, 'Gio', str_repeat('2', 32), 1000);
    tv_join($r, 'Ale', str_repeat('3', 32), 1000);
    return $r;
}
/** Tutti i telefoni si fanno sentire (come fa il polling). */
function seen(&$r, $now) { foreach ($r['players'] as $i => $p) $r['players'][$i]['last'] = $now; }
function cur($r) { return $r['plan'][$r['pos']]['q']; }
function wrong($q) { return ((int)$q['giusta'] + 1) % 4; }

// impostazioni
$r = tv_new_room('ABCD', str_repeat('a', 32), 1000, $bank['themes']);
check($r['opts'] === ['rounds' => 3, 'time' => 15, 'diff' => 'mista', 'themes' => []], 'impostazioni di base');
$o = tv_opts($r, $r['opts'], ['rounds' => 9, 'time' => 12, 'diff' => 'boh', 'themes' => ['seriea', 'zzz', 'seriea']]);
check($o['rounds'] === 3 && $o['time'] === 15 && $o['diff'] === 'mista', 'valori fuori lista ignorati');
check($o['themes'] === ['seriea'], 'temi sconosciuti e doppi tolti');
$o = tv_opts($r, $o, ['rounds' => 6, 'time' => 20, 'diff' => 'difficile', 'themes' => array_column($bank['themes'], 'id')]);
check($o['rounds'] === 6 && $o['time'] === 20 && $o['diff'] === 'difficile' && $o['themes'] === [], 'tutti i temi = nessun filtro');

// ingresso e capitano
check(isset(tv_start($r, 1000, $bank)['err']), 'non parte senza giocatori');
$r = room3($bank);
check(isset(tv_join($r, 'fede', str_repeat('4', 32), 1000)['err']), 'nome doppio rifiutato');
check(tv_join($r, 'Fede', str_repeat('1', 32), 1001)['pid'] === 'p1', 'rientro con lo stesso telefono');
check(tv_captain($r) === 'p1', 'il primo è capitano');

// il piano: 3 round da 5 + 2 imprevisti diversi, nessuna domanda ripetuta
check(tv_start($r, 2000, $bank)['ok'] ?? false, 'si parte');
check(count($r['plan']) === 17, 'piano da 17 domande: ' . count($r['plan']));
check(count(array_unique(array_map(function ($s) { return $s['q']['id']; }, $r['plan']))) === 17, 'domande tutte diverse');
$modes = array_values(array_filter(array_column($r['plan'], 'mode'), function ($m) { return $m !== 'normale'; }));
check(count($modes) === 2 && count(array_unique($modes)) === 2, 'due imprevisti diversi');
check($r['plan'][5]['mode'] !== 'normale' && $r['plan'][11]['mode'] !== 'normale', 'imprevisti tra un round e l\'altro');
check($r['phase'] === 'ask' && $r['pos'] === 0, 'prima domanda');
check($r['startAt'] == 2000 + TV_READY && $r['deadline'] == 2000 + TV_READY + 15, 'tempi della domanda');

// anti-furbo: la risposta giusta non esce durante la domanda
$q = cur($r);
$pub = tv_public($r, 'p1', false, 2001);
check(!isset($pub['q']['giusta']) && !isset($pub['plan']) && !isset($pub['last']), 'niente risposta giusta né piano');
check(strpos(json_encode($pub), str_repeat('1', 32)) === false, 'i gettoni non escono');
check(strpos(json_encode($pub), '"giusta"') === false, 'nessun campo giusta nello stato');
check($pub['q']['opzioni'] === $q['opzioni'] && $pub['mine'] === -1, 'opzioni visibili, nessuna risposta mia');

// risposte: non prima dell'apertura, una sola, non dopo il tempo
seen($r, 2000);
check(isset(tv_answer($r, 'p1', 1, $q['giusta'], 2002)['err']), 'prima dell\'apertura non si risponde');
check(isset(tv_answer($r, 'p1', 2, $q['giusta'], 2004)['err']), 'numero di domanda sbagliato rifiutato');
check(isset(tv_answer($r, 'p1', 1, 7, 2004)['err']), 'opzione inesistente rifiutata');
check(tv_answer($r, 'p1', 1, $q['giusta'], 2003)['ok'] ?? false, 'risposta al volo');
check(isset(tv_answer($r, 'p1', 1, wrong($q), 2004)['err']), 'una sola risposta per telefono');
check(tv_public($r, 'p1', false, 2004)['mine'] === $q['giusta'], 'il telefono rivede la sua scelta');
check(tv_public($r, '', true, 2004)['players'][0]['done'] === true, 'la TV vede chi ha risposto');
tv_answer($r, 'p2', 1, $q['giusta'], 2010.5);
check($r['phase'] === 'ask', 'manca ancora uno: si aspetta');
tv_answer($r, 'p3', 1, wrong($q), 2011);
check($r['phase'] === 'reveal', 'hanno risposto tutti: soluzione subito');
$h = end($r['history']);
check($h['res']['p1']['pts'] === 1000, 'risposta immediata: 1000 punti');
check($h['res']['p2']['pts'] === 500 + (int)round(500 * 7.5 / 15), 'a metà tempo: 750 (' . $h['res']['p2']['pts'] . ')');
check($h['res']['p3']['pts'] === 0 && !$h['res']['p3']['ok'], 'sbagliata: zero');
check($h['counts'][$q['giusta']] === 2 && $h['counts'][wrong($q)] === 1, 'quante persone per opzione');
check($h['fastest'] === 'p1' && $h['res']['p1']['ms'] === 0, 'il più veloce');
$pub = tv_public($r, 'p3', false, 2012);
check($pub['q']['giusta'] === $q['giusta'] && $pub['last']['res']['p3']['ok'] === false, 'a domanda chiusa la soluzione si vede');
check($r['scores'] === ['p1' => 1000, 'p2' => 750, 'p3' => 0], 'classifica parziale');

// soluzione: va avanti da sola, si può fermare
check(!tv_tick($r, 2015), 'la soluzione resta qualche secondo');
tv_hold($r, true, 2015);
check(!tv_tick($r, 2100), 'in pausa resta lì');
tv_hold($r, false, 2100);
check(tv_tick($r, 2104) && $r['phase'] === 'ask' && $r['pos'] === 1, 'poi la domanda dopo');

// tempo scaduto: chi non ha risposto prende zero, dopo il tempo non si risponde
seen($r, 2104);
$q = cur($r);
$t0 = $r['startAt'];
tv_answer($r, 'p2', 2, $q['giusta'], $t0 + 1);
check(isset(tv_answer($r, 'p3', 2, $q['giusta'], $r['deadline'] + 0.01)['err']), 'dopo il tempo non si risponde');
check(tv_tick($r, $r['deadline']) && $r['phase'] === 'reveal', 'allo scadere si chiude');
$h = end($r['history']);
check($h['res']['p1']['c'] === -1 && $h['res']['p1']['pts'] === 0 && $h['res']['p1']['ms'] === null, 'senza risposta: zero');

// giocatore che non si fa sentire: non si aspetta
tv_next($r, 2200);
$r['players'][2]['last'] = 2200 - TV_ONLINE - 1;
$r['players'][0]['last'] = $r['players'][1]['last'] = 2200;
$q = cur($r);
tv_answer($r, 'p1', 3, $q['giusta'], $r['startAt'] + 1);
tv_answer($r, 'p2', 3, $q['giusta'], $r['startAt'] + 2);
check($r['phase'] === 'reveal', 'chi è scollegato non blocca la domanda');

// fine del round 1 -> imprevisto
while ($r['pos'] < 4) { tv_next($r, 2300); tv_next($r, 2300); }
check($r['phase'] === 'reveal' && $r['pos'] === 4, 'quinta domanda chiusa');
tv_next($r, 2400);
check($r['phase'] === 'twist', 'tra un round e l\'altro c\'è l\'imprevisto');
$pub = tv_public($r, '', true, 2400);
check($pub['twist'] === $r['plan'][5]['mode'] && $pub['twistRound'] === 1, 'la TV sa quale imprevisto arriva');
check(strpos(json_encode($pub), '"giusta"') === false || isset($pub['last']), 'durante l\'imprevisto niente domanda nuova');
check(!isset($pub['q']), 'la domanda dell\'imprevisto non si vede ancora');
check(tv_tick($r, 2400 + TV_TWIST) && $r['phase'] === 'ask' && $r['pos'] === 5, 'poi la domanda dell\'imprevisto');
check(tv_public($r, '', true, 2413)['q']['mode'] === $r['plan'][5]['mode'], 'la domanda porta la sua regola');

/** Gioca la domanda in corso con le risposte date: [pid => [giusta?, secondi dopo l'apertura]]. */
function play(&$r, $answers) {
    seen($r, $r['startAt']);
    $q = cur($r);
    foreach ($answers as $pid => [$ok, $dt]) tv_answer($r, $pid, $r['pos'] + 1, $ok ? (int)$q['giusta'] : wrong($q), $r['startAt'] + $dt);
    if ($r['phase'] === 'ask') tv_close($r, $r['deadline']);
    return end($r['history']);
}
/** Mette la stanza su una domanda con l'imprevisto voluto e i punteggi dati. */
function rigged($bank, $mode, $scores) {
    $r = room3($bank);
    tv_start($r, 5000, $bank);
    $r['plan'][0]['mode'] = $mode;
    tv_ask($r, 0, 5000);
    $r['scores'] = $scores;
    return $r;
}

// punti doppi
$r = rigged($bank, 'doppi', ['p1' => 0, 'p2' => 0, 'p3' => 0]);
$h = play($r, ['p1' => [true, 0], 'p2' => [false, 1]]);
check($h['res']['p1']['pts'] === 2000 && $h['res']['p2']['pts'] === 0, 'punti doppi');

// tutto o niente: chi sbaglia perde 500, ma non va sotto zero; chi non risponde non perde
$r = rigged($bank, 'tuttoniente', ['p1' => 2000, 'p2' => 300, 'p3' => 900]);
$h = play($r, ['p1' => [false, 1], 'p2' => [false, 1], 'p3' => [true, 0]]);
check($h['res']['p1']['pts'] === -500 && $r['scores']['p1'] === 1500, 'tutto o niente: -500');
check($h['res']['p2']['pts'] === -300 && $r['scores']['p2'] === 0, 'mai sotto zero');
check($h['res']['p3']['pts'] === 2000, 'tutto o niente: giusta vale doppio');
$r = rigged($bank, 'tuttoniente', ['p1' => 2000, 'p2' => 300, 'p3' => 900]);
$h = play($r, ['p3' => [true, 0]]);
check($h['res']['p1']['pts'] === 0, 'tutto o niente: chi non risponde non perde');

// rubapunti: il più veloce a rispondere giusto ruba 200 al primo
$r = rigged($bank, 'rubapunti', ['p1' => 3000, 'p2' => 1000, 'p3' => 500]);
$h = play($r, ['p1' => [true, 5], 'p2' => [true, 4], 'p3' => [true, 1]]);
check($h['steal'] === ['by' => 'p3', 'from' => 'p1', 'n' => 200], 'Ale ruba a Fede');
check($r['scores']['p3'] === 500 + $h['res']['p3']['base'] + 200, 'il ladro prende 200');
check($r['scores']['p1'] === 3000 + $h['res']['p1']['base'] - 200, 'il primo perde 200');
$r = rigged($bank, 'rubapunti', ['p1' => 3000, 'p2' => 1000, 'p3' => 500]);
$h = play($r, ['p1' => [true, 0], 'p2' => [false, 0]]);
check($h['steal']['from'] === 'p2' && $h['steal']['by'] === 'p1', 'se il più veloce è già primo, ruba al secondo');
$r = rigged($bank, 'rubapunti', ['p1' => 3000, 'p2' => 1000, 'p3' => 500]);
$h = play($r, ['p1' => [false, 0]]);
check($h['steal'] === null, 'nessuna risposta giusta: niente furto');

// lampo: 5 secondi, 1000 tondi
$r = rigged($bank, 'lampo', ['p1' => 0, 'p2' => 0, 'p3' => 0]);
check($r['deadline'] - $r['startAt'] == TV_LAMPO, 'la lampo dura 5 secondi');
$h = play($r, ['p1' => [true, 4], 'p2' => [true, 0]]);
check($h['res']['p1']['pts'] === 1000 && $h['res']['p2']['pts'] === 1000, 'lampo: 1000 a chi risponde giusto');

// rimonta: chi sta nella metà bassa prende il triplo
$r = rigged($bank, 'rimonta', ['p1' => 3000, 'p2' => 1000, 'p3' => 500]);
$h = play($r, ['p1' => [true, 0], 'p2' => [true, 0], 'p3' => [true, 0]]);
check($h['res']['p1']['pts'] === 1000 && $h['res']['p2']['pts'] === 1000 && $h['res']['p3']['pts'] === 3000, 'rimonta: triplo solo all\'ultimo');

// partita intera: si arriva alla fine e la rivincita riparte da zero
$r = room3($bank, ['rounds' => 2, 'time' => 10, 'diff' => 'facile', 'themes' => ['nazionali']]);
tv_start($r, 9000, $bank);
check(count($r['plan']) === 11, '2 round: 10 domande + 1 imprevisto');
check(count(array_filter($r['plan'], function ($s) { return $s['q']['tema'] === 'nazionali' && (int)$s['q']['difficolta'] === 1; })) === 11, 'filtri rispettati');
$t = 9000;
$guard = 0;
while ($r['phase'] !== 'end' && $guard++ < 100) {
    if ($r['phase'] === 'ask') play($r, ['p1' => [true, 1], 'p2' => [true, 3], 'p3' => [false, 2]]);
    else { $t = max($t, $r['nextAt']); tv_tick($r, $t); }
}
check($r['phase'] === 'end' && count($r['history']) === 11, 'partita finita con 11 domande giocate');
check($r['scores']['p1'] > $r['scores']['p2'] && $r['scores']['p3'] === 0, 'classifica finale');
$pub = tv_public($r, '', true, $t);
check(count($pub['history']) === 11, 'a fine partita arriva lo storico per le statistiche');
$used = $r['used'];
check(isset(tv_opts($r, $r['opts'], [])['rounds']), 'impostazioni leggibili a fine partita');
tv_rematch($r);
check($r['phase'] === 'lobby' && $r['scores']['p1'] === 0 && !$r['history'], 'rivincita azzerata');
tv_start($r, 20000, $bank);
$again = array_map(function ($s) { return $s['q']['id']; }, $r['plan']);
check(!array_intersect($again, $used), 'nella rivincita domande nuove');

// filtri troppo stretti: si allargano invece di fermarsi
$r = room3($bank, ['rounds' => 6, 'diff' => 'difficile', 'themes' => ['simboli']]);
check(tv_start($r, 1000, $bank)['ok'] ?? false, 'pochi stemmi difficili: si allarga');
check(count($r['plan']) === 35, '6 round: 30 domande + 5 imprevisti');
$modes = array_values(array_filter(array_column($r['plan'], 'mode'), function ($m) { return $m !== 'normale'; }));
check(count(array_unique($modes)) === 5, 'cinque imprevisti tutti diversi');

// fine anticipata e giocatori tolti
$r = room3($bank);
tv_start($r, 1000, $bank);
check(isset(tv_kick($r, 'p2')['err']), 'durante la domanda non si toglie nessuno');
tv_end($r, 1005);
check($r['phase'] === 'end' && count($r['history']) === 1, 'fine anticipata: la domanda aperta si chiude');
tv_kick($r, 'p2');
check(count($r['players']) === 2, 'giocatore tolto');

echo $fail ? "$fail test falliti\n" : "ok\n";
exit($fail ? 1 : 0);
