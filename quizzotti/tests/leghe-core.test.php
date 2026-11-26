<?php
/* Test delle regole delle Leghe tra amici (api/leghe-core.php).
   Lo lancia tests/leghe.test.js se trova un PHP; da solo: php tests/leghe-core.test.php */
require __DIR__ . '/../api/leghe-core.php';

$fail = 0;
function check($cond, $what) { global $fail; if (!$cond) { $fail++; echo "FALLITO: $what\n"; } }
/** Istante di un'ora di Roma, es. at('2026-11-26 12:00'). */
function at($s) { return (new DateTime($s, new DateTimeZone('Europe/Rome')))->getTimestamp(); }
function gdg($win, $tries, $hints = 0) { return ['win' => $win, 'tries' => $tries, 'hints' => $hints]; }
function th($k) { return hash('sha256', 'test' . $k); }

// date e N° (il N° 1 del Calciatore del Giorno e' il 16 novembre 2026)
check(lg_rome_date(at('2026-11-26 00:30')) === '2026-11-26', 'mezzanotte e mezza a Roma e gia oggi');
check(lg_rome_date(at('2026-11-25 23:59')) === '2026-11-25', 'un minuto prima e ancora ieri');
check(lg_rome_date(at('2026-07-01 00:30')) === '2026-07-01', 'ora legale');
check(lg_n_of('giocatoredelgiorno', '2026-11-16') === 1 && lg_n_of('giocatoredelgiorno', '2026-11-26') === 11, 'N° dal giorno');
check(lg_day_of('giocatoredelgiorno', 11) === '2026-11-26', 'giorno dal N°');
check(lg_n_of('giocatoredelgiorno', '2027-04-01') === 137, 'N° dopo il cambio dell\'ora');
check(lg_monday('2026-11-26') === '2026-11-23' && lg_monday('2026-11-23') === '2026-11-23' && lg_monday('2026-11-29') === '2026-11-23', 'lunedi della settimana');
check(lg_monday('2027-01-01') === '2026-12-28', 'settimana a cavallo dell\'anno');
check(lg_is_monday('2026-11-30') && !lg_is_monday('2026-11-29'), 'e lunedi?');
check(lg_open_ns('giocatoredelgiorno', at('2026-11-26 12:00')) === [11, 10], 'oggi e ieri');
check(lg_open_ns('giocatoredelgiorno', at('2026-11-16 12:00')) === [1], 'il primo giorno solo il N° 1');

// punti del Calciatore del Giorno
$pts = function ($r) { return lg_score('giocatoredelgiorno', $r)['p'] ?? 'err'; };
check($pts(gdg(true, 1)) === 10 && $pts(gdg(true, 2)) === 8 && $pts(gdg(true, 3)) === 6, 'vittoria in 1, 2, 3');
check($pts(gdg(true, 4)) === 5 && $pts(gdg(true, 5)) === 4 && $pts(gdg(true, 6)) === 3, 'vittoria in 4, 5, 6');
check($pts(gdg(false, 6)) === 0 && $pts(gdg(false, 2, 1)) === 0, 'persa 0, anche con indizi');
check($pts(gdg(true, 3, 1)) === 5 && $pts(gdg(true, 6, 2)) === 1, '-1 per indizio');
check($pts(gdg(true, 0)) === 'err' && $pts(gdg(true, 7)) === 'err' && $pts(gdg(true, 2, 3)) === 'err', 'tentativi e indizi fuori misura');
check($pts(['win' => true, 'tries' => '2', 'hints' => 0]) === 'err', 'i numeri devono essere numeri');
check($pts(gdg(false, 0)) === 0, 'resa prima del primo tentativo');
check(lg_score('giocatoredelgiorno', gdg(true, 2, 1))['l'] === '2/6 · 1 indizio', 'etichetta');
check(lg_score('giocatoredelgiorno', gdg(false, 6))['l'] === 'X/6', 'etichetta persa');
check(isset(lg_score('boh', gdg(true, 1))['err']), 'gioco sconosciuto');

// i giochi del giorno nuovi: N° 1 il 27 novembre 2026
foreach (['quattro', 'intruso', 'sopraosotto'] as $g) {
    check(isset(LG_GAMES[$g]) && lg_n_of($g, '2026-11-27') === 1 && lg_day_of($g, 5) === '2026-12-01', "N° di $g");
    check(lg_open_ns($g, at('2026-11-26 12:00')) === [], "$g: prima del via nessun N° aperto");
    check(lg_open_ns($g, at('2026-11-28 12:00')) === [2, 1], "$g: oggi e ieri");
}
// Scheda del giorno di Quattro per Quattro: 0 errori = 8, 1 = 6, 2 = 4, 3 = 2, persa 0
$qq = function ($r) { return lg_score('quattro', $r)['p'] ?? 'err'; };
check($qq(['win' => true, 'mistakes' => 0, 'found' => 4]) === 8 && $qq(['win' => true, 'mistakes' => 1, 'found' => 4]) === 6, 'scheda: 0 e 1 errore');
check($qq(['win' => true, 'mistakes' => 2, 'found' => 4]) === 4 && $qq(['win' => true, 'mistakes' => 3, 'found' => 4]) === 2, 'scheda: 2 e 3 errori');
check($qq(['win' => false, 'mistakes' => 4, 'found' => 3]) === 0 && $qq(['win' => false, 'mistakes' => 4, 'found' => 0]) === 0, 'scheda persa');
check($qq(['win' => true, 'mistakes' => 0]) === 8, 'scheda: found facoltativo');
check($qq(['win' => true, 'mistakes' => 4, 'found' => 4]) === 'err' && $qq(['win' => true, 'mistakes' => 1, 'found' => 3]) === 'err', 'scheda: vinta con 4 errori o 3 gruppi non esiste');
check($qq(['win' => false, 'mistakes' => 4, 'found' => 4]) === 'err' && $qq(['win' => true, 'mistakes' => '0', 'found' => 4]) === 'err', 'scheda: persa con 4 gruppi, numeri come testo');
check(lg_score('quattro', ['win' => true, 'mistakes' => 1, 'found' => 4])['l'] === '1 errore' && lg_score('quattro', ['win' => true, 'mistakes' => 0, 'found' => 4])['l'] === 'zero errori', 'scheda: etichetta');
check(lg_score('quattro', ['win' => false, 'mistakes' => 4, 'found' => 2])['l'] === 'persa · 2/4' && lg_score('quattro', ['win' => false, 'mistakes' => 4, 'found' => 2])['w'] === 0, 'scheda persa: etichetta');
// Intruso del giorno: 2 punti a intruso, vinta da 4 su 5
$ix = function ($f) { return lg_score('intruso', ['found' => $f]); };
check($ix(5)['p'] === 10 && $ix(4)['p'] === 8 && $ix(1)['p'] === 2 && $ix(0)['p'] === 0, 'intruso: punti');
check($ix(4)['w'] === 1 && $ix(3)['w'] === 0 && $ix(5)['l'] === '5/5', 'intruso: vittoria ed etichetta');
check(isset($ix(6)['err']) && isset($ix(-1)['err']) && isset($ix('5')['err']) && isset(lg_score('intruso', [])['err']), 'intruso: fuori misura');
// Sopra o Sotto del giorno: scalini sulla serie
$so = function ($s) { return lg_score('sopraosotto', ['streak' => $s])['p'] ?? 'err'; };
check($so(0) === 0 && $so(1) === 1 && $so(2) === 1 && $so(3) === 2 && $so(6) === 3 && $so(8) === 4, 'sopra o sotto: serie corte');
check($so(10) === 5 && $so(11) === 6 && $so(16) === 7 && $so(20) === 8 && $so(25) === 9 && $so(26) === 10 && $so(300) === 10, 'sopra o sotto: serie lunghe');
for ($s = 1, $ok = true; $s <= 40; $s++) if ($so($s) < $so($s - 1)) $ok = false;
check($ok, 'sopra o sotto: i punti non scendono mai allungando la serie');
check(lg_score('sopraosotto', ['streak' => 10])['w'] === 1 && lg_score('sopraosotto', ['streak' => 9])['w'] === 0 && lg_score('sopraosotto', ['streak' => 7])['l'] === '7 di fila', 'sopra o sotto: vittoria ed etichetta');
check($so(-1) === 'err' && $so(1000) === 'err' && $so('7') === 'err', 'sopra o sotto: fuori misura');
foreach (LG_GAMES as $g => $x) check(is_string($x['rules'] ?? null) && $x['rules'] !== '', "regole a parole per $g");

// soprannomi e membri
check(lg_clean("  Fede\x07  <b>  ", 20) === 'Fede b', 'testo pulito');
$L = lg_new('ABC234', 'Calcetto del giovedì', at('2026-11-23 10:00'));
$a = lg_join($L, 'Fede', th(1), at('2026-11-23 10:00'))['mid'];
$b = lg_join($L, 'Gio', th(2), at('2026-11-23 10:00'))['mid'];
$c = lg_join($L, 'Ale', th(3), at('2026-11-23 10:00'))['mid'];
check($L['owner'] === $a, 'chi crea e il primo');
check(isset(lg_join($L, 'fede', th(4), 0)['err']), 'soprannome doppio');
check(isset(lg_join($L, 'F', th(4), 0)['err']), 'soprannome troppo corto');
check(lg_join($L, 'Altro nome', th(2), 0)['mid'] === $b, 'rientro con lo stesso telefono');
check(count($L['members']) === 3, 'tre membri');
check(lg_member_by_th($L, th(3)) === $c && lg_member_by_th($L, th(9)) === '' && lg_member_by_th($L, '') === '', 'gettoni');
check(count(array_unique(array_column($L['members'], 'color'))) === 3, 'colori diversi');
check(lg_rename($L, $c, 'Alessio')['ok'] ?? false, 'cambio soprannome');
check(isset(lg_rename($L, $c, 'GIO')['err']), 'cambio su un soprannome preso');
$full = lg_new('FULL22', 'Piena', 0);
for ($i = 0; $i < LG_MAX_MEMBERS; $i++) lg_join($full, 'Membro ' . $i, th('f' . $i), 0);
check(count($full['members']) === 30 && isset(lg_join($full, 'Uno di troppo', th('x'), 0)['err']), 'al massimo 30');

// invii: solo oggi e ieri, uno per gioco e N°
$G = 'giocatoredelgiorno';
$mon = at('2026-11-23 20:00');   // N° 8
check(isset(lg_submit($L, $a, $G, 6, gdg(true, 1), $mon)['err']), 'l\'altro ieri non vale');
check(isset(lg_submit($L, $a, $G, 9, gdg(true, 1), $mon)['err']), 'domani non vale');
check(isset(lg_submit($L, 'm99', $G, 8, gdg(true, 1), $mon)['err']), 'solo i membri');
check(isset(lg_submit($L, $a, 'boh', 8, gdg(true, 1), $mon)['err']), 'gioco sconosciuto');
check(isset(lg_submit($L, $a, $G, '8', gdg(true, 1), $mon)['err']), 'N° come testo');
check(lg_submit($L, $a, $G, 8, gdg(true, 2), $mon)['p'] === 8, 'primo invio');
check(lg_submit($L, $a, $G, 8, gdg(true, 1), $mon)['dup'] === 1 && count($L['results']) === 1, 'il secondo non conta');
check(lg_submit($L, $a, $G, 7, gdg(true, 3), $mon)['p'] === 6, 'ieri vale ancora');
check($L['results'][1]['d'] === '2026-11-22', 'la partita di ieri finisce nel giorno di ieri');
check(lg_submit($L, $a, $G, 8, gdg(true, 3), at('2026-11-24 00:05'))['dup'] === 1, 'dopo mezzanotte lo stesso N° resta doppio');

// una settimana intera: lun 23 - dom 29 novembre (N° 8-14)
// Fede: vince tutti i giorni tranne giovedi; Gio: gioca poco ma bene; Alessio: perde sempre
$week = [
    '2026-11-24' => [$a => gdg(true, 4), $b => gdg(true, 1), $c => gdg(false, 6)],
    '2026-11-25' => [$a => gdg(true, 3, 1), $c => gdg(false, 6)],
    '2026-11-26' => [$a => gdg(false, 6), $b => gdg(true, 2), $c => gdg(false, 6)],
    '2026-11-27' => [$a => gdg(true, 2), $c => gdg(false, 6)],
    '2026-11-28' => [$a => gdg(true, 5)],
    '2026-11-29' => [$a => gdg(true, 2), $c => gdg(true, 6, 2)],
];
foreach ($week as $day => $list) {
    foreach ($list as $mid => $res) {
        $r = lg_submit($L, $mid, $G, lg_n_of($G, $day), $res, at($day . ' 21:00'));
        check(isset($r['ok']), "invio $day $mid");
    }
}
// giovedi 26: classifica della settimana in corso
$st = lg_standings($L, '2026-11-23', '2026-11-26');
check($st[0]['id'] === $a && $st[0]['p'] === 8 + 5 + 5 + 0 && $st[0]['g'] === 4, 'Fede in testa a giovedi: ' . json_encode($st[0]));
check($st[1]['id'] === $b && $st[1]['p'] === 18 && $st[1]['avg'] === 9.0, 'Gio secondo');
// nota: Fede ha anche il N° 7 (domenica 22) che non e' di questa settimana
$st = lg_standings($L, '2026-11-23', '2026-11-29');
check($st[0]['p'] === 8 + 5 + 5 + 0 + 8 + 4 + 8 && $st[0]['w'] === 6 && $st[0]['g'] === 7, 'Fede a fine settimana');
check($st[0]['streak'] === 3, 'serie piu lunga di Fede: venerdi, sabato, domenica (' . $st[0]['streak'] . ')');
check($st[2]['id'] === $c && $st[2]['p'] === 1 && $st[2]['streak'] === 1, 'Alessio ultimo');
check(array_column($st, 'pos') === [1, 2, 3], 'posizioni');

// pagellino: il lunedi 30 parla della settimana 23-29
$P = lg_pagellino($L, at('2026-11-30 09:00'));
check($P['from'] === '2026-11-23' && $P['to'] === '2026-11-29', 'pagellino della settimana prima');
check(count($P['winners']) === 1 && $P['winners'][0]['nick'] === 'Fede' && $P['winners'][0]['p'] === 38, 'vincitore');
check($P['games'] === 14 && $P['players'] === 3 && $P['avg'] === round(57 / 14, 1), 'media della lega: ' . $P['avg']);
check($P['streak']['nick'] === 'Fede' && $P['streak']['days'] === 3, 'serie piu lunga');
check($P['rows'][0]['voto'] !== null && $P['rows'][1]['voto'] === null, 'Gio con due partite e senza voto');
check($P['rows'][2]['voto'] === 4.0, 'Alessio prende 4: ' . json_encode($P['rows'][2]['voto']));
check(lg_pagellino($L, at('2026-12-03 09:00'))['from'] === '2026-11-23', 'tutta la settimana dopo resta lo stesso pagellino');
check(lg_pagellino($L, at('2026-12-07 09:00')) === null, 'settimana senza partite: niente pagellino');
check(lg_pagellino($L, at('2026-11-23 09:00'))['to'] === '2026-11-22', 'il lunedi 23 il pagellino della settimana del 16');
check(lg_voto(8, 5) === 10.0 && lg_voto(0, 5) === 4.0 && lg_voto(5, 5) === 8.0 && lg_voto(5, 2) === null, 'voti');

// pari merito in testa: due vincitori
$T = lg_new('TIE234', 'Pari', 0);
$x = lg_join($T, 'Primo', th('t1'), 0)['mid'];
$y = lg_join($T, 'Secondo', th('t2'), 0)['mid'];
$z = lg_join($T, 'Terzo', th('t3'), 0)['mid'];
lg_submit($T, $x, $G, 9, gdg(true, 2), at('2026-11-24 12:00'));
lg_submit($T, $y, $G, 9, gdg(true, 2), at('2026-11-24 12:00'));
$P = lg_pagellino($T, at('2026-11-30 12:00'));
check(count($P['winners']) === 2 && $P['players'] === 2, 'due vincitori a pari punti');
$st = lg_standings($T, '2026-11-23', '2026-11-29');
check(array_column($st, 'pos') === [1, 1, 3] && $st[2]['id'] === $z, 'pari merito e chi non gioca in fondo');

// mese e da sempre, con i risultati vecchi compattati
$L2 = $L;
$moved = lg_compact($L2, at('2027-02-10 12:00'));   // piu' di 70 giorni dopo
check($moved === count($L['results']) && $L2['results'] === [], 'tutto compattato');
$all1 = lg_standings($L, '', '2027-02-10');
$all2 = lg_standings($L2, '', '2027-02-10');
check(array_column($all1, 'p') === array_column($all2, 'p') && array_column($all1, 'g') === array_column($all2, 'g'), 'da sempre: stessi totali dopo la compattazione');
check(lg_compact($L2, at('2027-02-10 12:00')) === 0, 'la seconda volta non c\'e niente da spostare');
$L3 = $L;
check(lg_compact($L3, at('2026-12-01 12:00')) === 0, 'risultati recenti non si toccano');
$mo = lg_standings($L, '2026-11-01', '2026-11-30');
check($mo[0]['p'] === 38 + 6, 'il mese conta anche domenica 22');

// stato pubblico
$pub = lg_public($L, $b, at('2026-11-30 09:00'));
check($pub['member'] === 1 && $pub['monday'] === 1 && $pub['me'] === $b, 'stato per un membro, di lunedi');
check($pub['games'][$G]['n'] === 15, 'N° di oggi');
check($pub['games']['quattro']['n'] === 4 && $pub['games']['sopraosotto']['n'] === 4 && $pub['games']['intruso']['rules'] !== '', 'N° di oggi dei giochi del giorno nuovi');
check(!isset(lg_public($L, $b, at('2026-11-26 09:00'))['games']['quattro']), 'prima del via la Scheda del giorno non si mostra');

// un giorno con tre giochi del giorno: punti sommati nella classifica
$D = lg_new('DAY234', 'Giornale', 0);
$u = lg_join($D, 'Uno', th('d1'), 0)['mid'];
$now = at('2026-11-28 21:00');   // N° 13 del Calciatore, N° 2 degli altri
check(lg_submit($D, $u, 'quattro', 2, ['win' => true, 'mistakes' => 1, 'found' => 4], $now)['p'] === 6, 'invio della scheda');
check(lg_submit($D, $u, 'intruso', 2, ['found' => 3], $now)['p'] === 6, 'invio dell\'intruso');
check(lg_submit($D, $u, 'sopraosotto', 2, ['streak' => 12], $now)['p'] === 6, 'invio di sopra o sotto');
check(lg_submit($D, $u, 'sopraosotto', 2, ['streak' => 40], $now)['dup'] === 1, 'sopra o sotto: vale il primo invio');
check(isset(lg_submit($D, $u, 'intruso', 3, ['found' => 3], $now)['err']), 'intruso: domani non vale');
$st = lg_standings($D, '2026-11-23', '2026-11-29');
check($st[0]['p'] === 18 && $st[0]['g'] === 3 && $st[0]['w'] === 2, 'classifica con tre giochi: ' . json_encode($st[0]));
check(!isset($pub['members'][0]['th']) && strpos(json_encode($pub), th(1)) === false, 'le impronte dei gettoni non escono mai');
check($pub['week']['from'] === '2026-11-30' && $pub['month']['from'] === '2026-11-01', 'periodi');
$out = lg_public($L, '', at('2026-11-30 09:00'));
check($out['member'] === 0 && !isset($out['members']) && $out['count'] === 3 && $out['name'] === 'Calcetto del giovedì', 'chi non e membro vede solo nome e posti');
$rec = lg_public($L, $a, at('2026-11-29 22:00'))['recent'];
check(count($rec) === 3 && $rec[0]['d'] >= '2026-11-28', 'ultimi risultati di oggi e ieri');
check(count(lg_public($L, $a, at('2026-11-26 22:00'))['recent']) === 5, 'guardando giovedi non escono i risultati dei giorni dopo');

// uscita: spariscono i risultati, il ruolo di chi ha creato passa al prossimo
$n0 = count($L['results']);
check(lg_remove($L, $a)['ok'] === 1 && $L['owner'] === $b, 'esce chi ha creato');
check(count($L['results']) < $n0 && !in_array($a, array_column($L['results'], 'm'), true), 'risultati tolti');
lg_remove($L, $b);
check(lg_remove($L, $c)['empty'] === 1 && $L['owner'] === '', 'lega vuota');

echo $fail ? "$fail test falliti\n" : "ok\n";
exit($fail ? 1 : 0);
