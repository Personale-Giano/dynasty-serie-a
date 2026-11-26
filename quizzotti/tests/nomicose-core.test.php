<?php
/* Test delle regole di Nomi, Cose, Calcio (api/nomicose-core.php).
   Lo lancia tests/nomicose.test.js se trova un PHP; da solo: php tests/nomicose-core.test.php */
require __DIR__ . '/../api/nomicose-core.php';

$fail = 0;
function check($cond, $what) { global $fail; if (!$cond) { $fail++; echo "FALLITO: $what\n"; } }

// chiavi di confronto e lettera
check(nc_key('Il Milan') === 'milan', 'articolo tolto');
check(nc_key("l'Inter") === 'inter', "l' tolto");
check(nc_key('AS Roma') === 'roma', 'sigla tolta');
check(nc_key('Modrić') === 'modric', 'accenti tolti');
check(nc_letter_ok('Il Milan', 'M'), 'lettera dopo articolo');
check(!nc_letter_ok('Real Madrid', 'M'), 'lettera sbagliata');
check(nc_close('ibrahimovic', 'ibrahimovich'), 'refuso accettato');
check(!nc_close('roma', 'rosa'), 'parole corte non avvicinate');

// stanza, ingresso, capitano
$r = nc_new_room('ABCD', str_repeat('a', 32), 1000);
check(isset(nc_start_round($r, 1000)['err']), 'non parte senza giocatori');
$j1 = nc_join($r, 'Fede', str_repeat('1', 32), 1000);
$j2 = nc_join($r, 'Gio', str_repeat('2', 32), 1000);
$j3 = nc_join($r, 'Ale', str_repeat('3', 32), 1000);
check(isset(nc_join($r, 'fede', str_repeat('4', 32), 1000)['err']), 'nome doppio rifiutato');
check(nc_join($r, 'Fede', str_repeat('1', 32), 1001)['pid'] === $j1['pid'], 'rientro con lo stesso telefono');
check(nc_captain($r) === $j1['pid'], 'il primo è capitano');
check(count($r['players']) === 3, 'tre giocatori');

// categorie
check(isset(nc_start_round($r, 1000)['err']), 'servono 3 categorie');
nc_set_cats($r, [['id' => 'gita', 'name' => 'Calciatore italiano'], ['id' => 'sqit', 'name' => 'Squadra italiana'], ['id' => 'alle', 'name' => 'Allenatore']]);
check(nc_add_cat($r, 'Portiere')['ok'] ?? false, 'categoria aggiunta');
check(isset(nc_add_cat($r, 'portiere')['err']), 'categoria doppia rifiutata');
check(count($r['cats']) === 4, 'quattro categorie');

// round: lettera, tempo, risposte
nc_start_round($r, 2000, 10);   // indice 10 tra le lettere libere -> 'M'
check($r['letter'] === 'M', 'lettera estratta: ' . $r['letter']);
check($r['phase'] === 'letter', 'fase lettera');
check(!nc_tick($r, 2001) && $r['phase'] === 'letter', 'la lettera resta 4 secondi');
check(nc_tick($r, 2004) && $r['phase'] === 'play', 'poi si gioca');
[$a, $b, $c] = [$j1['pid'], $j2['pid'], $j3['pid']];
$cats = array_column($r['cats'], 'id');
nc_answer($r, $a, ['gita' => 'Maldini', 'sqit' => 'Milan', 'alle' => 'Mourinho', 'x' . $r['seq'] => 'Meret'], 2010);
nc_answer($r, $b, ['gita' => 'Maldini', 'sqit' => 'Monza', 'alle' => 'Real Madrid'], 2010);
nc_answer($r, $c, ['gita' => 'Mancini', 'sqit' => 'Il Milan'], 2010);
check(isset(nc_stop($r, $b, 2011)['err']), 'stop solo con tutte le caselle');
check(nc_stop($r, $a, 2011)['ok'] ?? false, 'stop di chi ha finito');
check($r['deadline'] === 2011 + NC_STOP_SECONDS, 'dopo lo stop restano 10 secondi');
check(isset(nc_answer($r, $b, ['gita' => 'x'], 2011 + NC_STOP_SECONDS + NC_GRACE_SECONDS + 1)['err']), 'dopo il gong non si scrive');
check(nc_tick($r, 2011 + NC_STOP_SECONDS + NC_GRACE_SECONDS) && $r['phase'] === 'review', 'si passa al controllo');

// controllo e punti
$ev = nc_evaluate($r);
check($ev['gita'][$a]['pts'] === 5 && $ev['gita'][$b]['pts'] === 5, 'Maldini doppio: 5 a testa');
check($ev['gita'][$c]['pts'] === 10, 'Mancini unico: 10');
check($ev['sqit'][$a]['pts'] === 5 && $ev['sqit'][$c]['pts'] === 5, 'Milan e Il Milan sono la stessa risposta');
check($ev['alle'][$b]['why'] === 'lettera' && $ev['alle'][$b]['pts'] === 0, 'Real Madrid con la M non vale');
check($ev['alle'][$a]['pts'] === 20, 'unica risposta valida della categoria: 20');
$port = 'x' . $r['seq'];
check($ev[$port][$a]['pts'] === 20, 'categoria aggiunta conta');
// contestazione: con 3 giocatori basta 1 voto
nc_vote($r, $b, $c, 'gita');
check(nc_evaluate($r)['gita'][$c]['why'] === 'bocciata', 'risposta bocciata dal voto');
nc_vote($r, $b, $c, 'gita');
check(nc_evaluate($r)['gita'][$c]['ok'], 'il voto si ritira');
check(isset(nc_vote($r, $a, $a, 'gita')['err']), 'non si vota se stessi');
nc_override($r, $b, 'alle', true);
check(nc_evaluate($r)['alle'][$b]['ok'], 'la TV può rimettere valida');
nc_override($r, $b, 'alle', null);
nc_confirm($r);
check($r['phase'] === 'results', 'risultati');
check($r['scores'][$a] === 5 + 5 + 20 + 20, 'totale Fede: ' . $r['scores'][$a]);
check($r['scores'][$c] === 10 + 5, 'totale Ale: ' . $r['scores'][$c]);
check(count($r['history']) === 1, 'storico del round');

// fine partita e rivincita
$r['opts']['rounds'] = 1;
check(isset(nc_start_round($r, 3000)['err']), 'oltre i round previsti non si parte');
nc_end($r);
check($r['phase'] === 'end', 'fine');
nc_rematch($r);
check($r['phase'] === 'lobby' && $r['scores'][$a] === 0 && $r['round'] === 0, 'rivincita azzerata');

// le risposte degli altri restano nascoste durante il round
$r['opts']['rounds'] = 5;
nc_start_round($r, 4000, 0);
nc_tick($r, 4004);
nc_answer($r, $b, ['gita' => 'Segreto'], 4005);
$pub = nc_public($r, $a, false, 4005);
check(!isset($pub['eval']) && json_encode($pub['mine']) === '{}', 'niente risposte altrui in gioco');
check(strpos(json_encode($pub), 'Segreto') === false, 'il testo altrui non esce');
check(strpos(json_encode($pub), str_repeat('1', 32)) === false, 'i gettoni non escono');
$tv = nc_public($r, '', true, 4005);
check($tv['players'][1]['filled'] === 1, 'la TV vede quante caselle sono piene');

// lettere: non si ripetono finché non finiscono
$r2 = nc_new_room('WXYZ', str_repeat('b', 32), 0);
$seen = [];
for ($i = 0; $i < strlen(NC_LETTERS) + strlen(NC_FOREIGN); $i++) $seen[] = nc_draw_letter($r2);
check(count(array_unique($seen)) === count($seen), 'nessuna lettera ripetuta nel giro');

echo $fail ? "$fail test falliti\n" : "ok\n";
exit($fail ? 1 : 0);
