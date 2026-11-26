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
check(nc_close(nc_key('Ibrahimović'), nc_key('Ibrahimovic')), 'accento: stessa risposta');
check(nc_close('cassano', 'casano'), 'doppia mancante: stessa risposta');
check(nc_close('pippo', 'pipo'), 'le doppie contano anche nelle parole corte');
check(!nc_close('roma', 'rosa'), 'parole corte non avvicinate');
check(!nc_close('rossi', 'rosso'), 'Rossi e Rosso sono diversi');
check(!nc_close('conte', 'conti'), 'Conte e Conti sono diversi');
check(!nc_close('mancini', 'mancino'), 'cambia solo la vocale finale: diversi anche se lunghi');
check(!nc_close('inzaghi', 'zinzaghi'), 'iniziale diversa: diversi');
check(nc_close('maradona', 'maradina'), 'refuso in mezzo a una parola lunga');

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
check($r['opts']['foreign'] === false, 'lettere straniere spente di base');
check(nc_opts([], ['foreign' => true])['foreign'] === true, 'si accendono a mano');
check(nc_opts(['foreign' => true], [])['foreign'] === true, 'una scelta gia salvata resta');
check(nc_need(2) === 0 && nc_need(3) === 2 && nc_need(4) === 2 && nc_need(5) === 3 && nc_need(12) === 6, 'maggioranza degli altri');

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
// controllo una categoria alla volta: le altre restano coperte
check($r['revIdx'] === 0, 'il controllo parte dalla prima categoria');
$pub = nc_public($r, $a, false, 2030);
check(array_keys((array)$pub['eval']) === ['gita'], 'si vede solo la prima categoria');
check(strpos(json_encode($pub), 'Mourinho') === false, 'le risposte delle categorie dopo non escono');
check(isset(nc_vote($r, $a, $b, 'alle')['err']), 'non si vota una categoria ancora coperta');
check(isset(nc_override($r, $b, 'alle', true)['err']), 'non si corregge una categoria ancora coperta');
check(isset(nc_confirm($r)['err']), 'non si conferma prima di aver visto tutto');
nc_review_cat($r, 2);
check(array_keys((array)nc_public($r, $a, false, 2030)['eval']) === ['gita', 'sqit', 'alle'], 'avanti: scoperte le prime tre');
nc_review_cat($r, 1);
check($r['revIdx'] === 1, 'si torna indietro');
nc_review_cat($r, 99);
check($r['revIdx'] === count($r['roundCats']) - 1, 'oltre la fine si ferma sull ultima');

// contestazione: con 3 giocatori servono entrambi gli altri
nc_vote($r, $b, $c, 'gita');
check(nc_evaluate($r)['gita'][$c]['ok'] && nc_evaluate($r)['gita'][$c]['rej'] === 1, 'un voto su due non basta');
nc_vote($r, $a, $c, 'gita');
check(nc_evaluate($r)['gita'][$c]['why'] === 'bocciata', 'risposta bocciata dalla maggioranza degli altri');
nc_vote($r, $b, $c, 'gita');
nc_vote($r, $a, $c, 'gita');
check(nc_evaluate($r)['gita'][$c]['ok'], 'il voto si ritira');
check(nc_public($r, $a, false, 2030)['need'] === 2, 'la soglia arriva ai telefoni');
// il capitano ($a) non forza le proprie risposte, la TV e gli altri si'
check(isset(nc_override($r, $a, 'gita', true, $a)['err']), 'il capitano non forza le sue risposte');
check(!isset($r['override'][$a . '|gita']), 'nessuna forzatura registrata');
check(nc_override($r, $c, 'gita', true, $a)['ok'] ?? false, 'il capitano forza quelle degli altri');
nc_override($r, $c, 'gita', null, $a);
check(nc_override($r, $a, 'gita', true, '')['ok'] ?? false, 'la TV forza anche quelle del capitano');
nc_override($r, $a, 'gita', null, '');
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

// chi non ha un gettone valido vede solo lo stato minimo
$min = nc_public_min($r, 4005);
check($min['me'] === '' && !isset($min['eval']) && !isset($min['mine']) && !isset($min['history']), 'stato minimo senza risposte');
check(strpos(json_encode($min), 'Segreto') === false && strpos(json_encode($min), str_repeat('1', 32)) === false, 'niente testi ne gettoni');
check($min['letter'] === '', 'niente lettera a chi non gioca');

// due giocatori: il voto dell'unico altro non boccia, decide la TV
$d = nc_new_room('DUEE', str_repeat('d', 32), 0);
$x1 = nc_join($d, 'Uno', str_repeat('5', 32), 0)['pid'];
$x2 = nc_join($d, 'Due', str_repeat('6', 32), 0)['pid'];
nc_set_cats($d, [['id' => 'aa', 'name' => 'A'], ['id' => 'bb', 'name' => 'B'], ['id' => 'cc', 'name' => 'C']]);
nc_start_round($d, 100, 0);
nc_tick($d, 104);
nc_answer($d, $x1, ['aa' => 'Albertini'], 105);
nc_answer($d, $x2, ['aa' => 'Ancelotti'], 105);
nc_finish($d, 106);
nc_tick($d, 106 + NC_GRACE_SECONDS);
check($d['phase'] === 'review', 'in due: controllo');
nc_vote($d, $x2, $x1, 'aa');
$e = nc_evaluate($d)['aa'][$x1];
check($e['ok'] && $e['rej'] === 1, 'in due un voto da solo non boccia');
nc_override($d, $x1, 'aa', false, '');
check(nc_evaluate($d)['aa'][$x1]['why'] === 'tv', 'la TV conferma la bocciatura');

// un giocatore tolto non rientra con lo stesso telefono
nc_end($d);
check(nc_kick($d, $x2)['ok'] ?? false, 'giocatore tolto');
$back = nc_join($d, 'Due', str_repeat('6', 32), 200);
check(isset($back['err']) && !empty($back['banned']), 'il telefono tolto non rientra');
check(isset(nc_join($d, 'Altro nome', str_repeat('6', 32), 200)['err']), 'neanche cambiando nome');
check(nc_join($d, 'Due', str_repeat('7', 32), 200)['pid'] ?? false, 'un altro telefono entra');
check(isset(nc_kick($d, 'p999')['err']), 'giocatore inesistente');
check(strpos(json_encode(nc_public($d, '', true, 200)), str_repeat('6', 32)) === false, 'i gettoni esclusi non escono');
// voti di chi e' uscito non contano
$t = nc_new_room('TREE', str_repeat('t', 32), 0);
$y = [];
foreach (['A', 'B', 'C', 'D'] as $k => $nm) $y[] = nc_join($t, $nm, str_repeat((string)$k, 32), 0)['pid'];
nc_set_cats($t, [['id' => 'aa', 'name' => 'A'], ['id' => 'bb', 'name' => 'B'], ['id' => 'cc', 'name' => 'C']]);
$t['phase'] = 'review'; $t['roundCats'] = $t['cats']; $t['letter'] = 'B'; $t['revIdx'] = 2;
$t['answers'][$y[0]]['aa'] = 'Baggio';
$t['rejects'][$y[0]]['aa'] = [$y[1], 'p99'];
check(nc_evaluate($t)['aa'][$y[0]]['rej'] === 1 && nc_evaluate($t)['aa'][$y[0]]['ok'], 'contano solo i voti di chi c\'e');

// lettere: non si ripetono finché non finiscono
$r2 = nc_new_room('WXYZ', str_repeat('b', 32), 0, ['foreign' => true]);
$seen = [];
for ($i = 0; $i < strlen(NC_LETTERS) + strlen(NC_FOREIGN); $i++) $seen[] = nc_draw_letter($r2);
check(count(array_unique($seen)) === count($seen), 'nessuna lettera ripetuta nel giro');
$r3 = nc_new_room('QQQQ', str_repeat('c', 32), 0);
$seen = [];
for ($i = 0; $i < 60; $i++) $seen[] = nc_draw_letter($r3);
check(!array_intersect($seen, str_split(NC_FOREIGN)), 'di base niente J, K, W, Y');

echo $fail ? "$fail test falliti\n" : "ok\n";
exit($fail ? 1 : 0);
