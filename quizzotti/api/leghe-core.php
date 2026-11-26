<?php
/* ==========================================================================
   QUIZZOTTI — Leghe tra amici: regole pure (senza I/O)
   Funzioni su un array $L (la lega), usate da api/leghe.php e dai test
   (tests/leghe-core.test.php). Scritto per PHP 8.0, la versione di Altervista.

   Una lega: nome, codice, fino a 30 membri (soprannome + impronta del gettone
   del telefono, mai il gettone in chiaro) e i risultati dei giochi del giorno.
   Ogni risultato vale per un gioco e un N° (la partita di quel giorno): conta
   solo il primo invio di ogni membro, e solo se il N° e' quello di oggi o di
   ieri (ora di Roma). I punti li calcola il server con la tabella del gioco.
   Classifiche per settimana (da lunedi' a domenica), mese e da sempre; il
   lunedi' esce il pagellino della settimana prima.
   I risultati piu' vecchi di LG_KEEP_DAYS giorni finiscono nei totali del
   membro (per la classifica "da sempre") e si tolgono dal file.
   ========================================================================== */

const LG_MAX_MEMBERS = 30;
const LG_KEEP_DAYS = 70;              // bastano per il mese scorso e il pagellino
const LG_NICK_MAX = 20;
const LG_NAME_MAX = 40;
const LG_PAGELLA_MIN = 3;             // sotto queste partite nella settimana: senza voto
const LG_COLORS = ['#d9342b', '#2f6fe0', '#1f9d55', '#b8800a', '#8a55e0', '#d9611c', '#1a8fbf', '#b02a5c', '#2a8f86', '#6f7a83', '#c2410c', '#4d7c0f'];

/**
 * I giochi del giorno collegati alle leghe. Per aggiungerne uno: id (lo stesso di
 * QZ.GAMES), nome, data del N° 1 (ora di Roma), la tabella dei punti a parole
 * (rules, per la pagina) e il calcolo dei punti in lg_score().
 * I punti di una partita vanno da 0 a 10.
 */
const LG_GAMES = [
    'giocatoredelgiorno' => ['name' => 'Calciatore del Giorno', 'short' => 'Del Giorno', 'start' => '2026-11-16',
        'rules' => 'Calciatore del Giorno: preso in 1 = 10 punti, 2 = 8, 3 = 6, 4 = 5, 5 = 4, 6 = 3; perso 0; -1 per ogni indizio.'],
    'quattro' => ['name' => 'Scheda del giorno', 'short' => '4 per 4', 'start' => '2026-11-27',
        'rules' => 'Scheda del giorno di Quattro per Quattro: chiusa con 0 errori = 8 punti, 1 = 6, 2 = 4, 3 = 2; persa 0.'],
    'intruso' => ['name' => 'Intruso del giorno', 'short' => 'Intruso', 'start' => '2026-11-27',
        'rules' => 'Intruso del giorno: 2 punti per intruso scovato, 10 con cinque su cinque.'],
    'sopraosotto' => ['name' => 'Sopra o Sotto del giorno', 'short' => 'Sopra o Sotto', 'start' => '2026-11-27',
        'rules' => 'Sopra o Sotto del giorno: serie di 1-2 = 1 punto, 3-4 = 2, 5-6 = 3, 7-8 = 4, 9-10 = 5, 11-13 = 6, 14-16 = 7, 17-20 = 8, 21-25 = 9, da 26 in su 10.'],
];

/** Sopra o Sotto del giorno: la serie minima per ogni punto (1 punto da 1, ..., 10 punti da 26). */
const LG_SOS_STEPS = [1, 3, 5, 7, 9, 11, 14, 17, 21, 26];

/* ---------- Date (sempre 'AAAA-MM-GG', ora di Roma) ---------- */

function lg_rome_date($ts) {
    $d = new DateTime('@' . (int)$ts);
    $d->setTimezone(new DateTimeZone('Europe/Rome'));
    return $d->format('Y-m-d');
}

function lg_utc($ymd) {
    $d = DateTime::createFromFormat('!Y-m-d', $ymd, new DateTimeZone('UTC'));
    return $d ? $d->getTimestamp() : 0;
}

function lg_add_days($ymd, $k) { return gmdate('Y-m-d', lg_utc($ymd) + (int)$k * 86400); }

function lg_days_between($a, $b) { return (int)round((lg_utc($b) - lg_utc($a)) / 86400); }

/** Il lunedi' della settimana di quel giorno. */
function lg_monday($ymd) { return lg_add_days($ymd, 1 - (int)gmdate('N', lg_utc($ymd))); }

function lg_is_monday($ymd) { return gmdate('N', lg_utc($ymd)) === '1'; }

/** N° della partita di quel giorno per un gioco (1 = giorno di partenza). */
function lg_n_of($game, $ymd) { return lg_days_between(LG_GAMES[$game]['start'], $ymd) + 1; }

/** Giorno della partita N° n. */
function lg_day_of($game, $n) { return lg_add_days(LG_GAMES[$game]['start'], (int)$n - 1); }

/* ---------- Testi ---------- */

function lg_clean($s, $max) {
    $s = is_string($s) ? $s : '';
    $s = preg_replace('/[\x00-\x1F\x7F<>]/u', '', $s) ?? '';
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    if (mb_strlen($s) > $max) $s = trim(mb_substr($s, 0, $max));
    return $s;
}

function lg_key($s) { return mb_strtolower(lg_clean($s, 80)); }

/* ---------- Punti ---------- */

/**
 * Punti di una partita, calcolati qui e non dal telefono.
 * Restituisce ['p' => punti, 'w' => 1/0, 'l' => etichetta corta] oppure ['err' => ...].
 */
function lg_score($game, $res) {
    if (!is_array($res)) return ['err' => 'Risultato non valido'];
    if ($game === 'giocatoredelgiorno') {
        // vittoria in 1 = 10, 2 = 8, 3 = 6, 4 = 5, 5 = 4, 6 = 3; persa 0; -1 per indizio
        $win = !empty($res['win']);
        $t = $res['tries'] ?? null;
        $h = $res['hints'] ?? 0;
        if (!is_int($t) || $t < ($win ? 1 : 0) || $t > 6) return ['err' => 'Tentativi non validi'];
        if (!is_int($h) || $h < 0 || $h > 2) return ['err' => 'Indizi non validi'];
        $table = [10, 8, 6, 5, 4, 3];
        $p = $win ? max(0, $table[$t - 1] - $h) : 0;
        $l = ($win ? $t : 'X') . '/6' . ($h === 2 ? ' · 2 indizi' : ($h === 1 ? ' · 1 indizio' : ''));
        return ['p' => $p, 'w' => $win ? 1 : 0, 'l' => $l];
    }
    if ($game === 'quattro') {
        // Scheda del giorno: chiusa con 0 errori = 8, 1 = 6, 2 = 4, 3 = 2; persa (quattro errori) 0
        $win = !empty($res['win']);
        $m = $res['mistakes'] ?? null;
        $f = $res['found'] ?? ($win ? 4 : 0);
        if (!is_int($m) || $m < 0 || $m > ($win ? 3 : 4)) return ['err' => 'Errori non validi'];
        if (!is_int($f) || $f < 0 || $f > 4 || ($win && $f !== 4) || (!$win && $f === 4)) return ['err' => 'Gruppi non validi'];
        $p = $win ? 8 - 2 * $m : 0;
        $l = $win ? ($m ? $m . ($m === 1 ? ' errore' : ' errori') : 'zero errori') : 'persa · ' . $f . '/4';
        return ['p' => $p, 'w' => $win ? 1 : 0, 'l' => $l];
    }
    if ($game === 'intruso') {
        // Intruso del giorno: cinque round, 2 punti per intruso scovato; vinta con almeno 4 su 5
        $f = $res['found'] ?? null;
        if (!is_int($f) || $f < 0 || $f > 5) return ['err' => 'Round non validi'];
        return ['p' => 2 * $f, 'w' => $f >= 4 ? 1 : 0, 'l' => $f . '/5'];
    }
    if ($game === 'sopraosotto') {
        // Sopra o Sotto del giorno: punti a scalini sulla serie (LG_SOS_STEPS); vinta da 10 di fila
        $s = $res['streak'] ?? null;
        if (!is_int($s) || $s < 0 || $s > 999) return ['err' => 'Serie non valida'];
        $p = 0;
        foreach (LG_SOS_STEPS as $min) if ($s >= $min) $p++;
        return ['p' => $p, 'w' => $s >= 10 ? 1 : 0, 'l' => $s . ' di fila'];
    }
    return ['err' => 'Gioco non collegato alle leghe'];
}

/* ---------- Lega e membri ---------- */

function lg_new($code, $name, $now) {
    return [
        'v' => 1, 'code' => $code, 'name' => $name, 'created' => $now, 'updated' => $now,
        'owner' => '', 'seq' => 0, 'members' => [], 'results' => [],
    ];
}

function lg_member_index($L, $mid) {
    foreach ($L['members'] as $i => $m) if ($m['id'] === $mid) return $i;
    return -1;
}

/** Il membro con quell'impronta di gettone (stringa vuota se non c'e'). */
function lg_member_by_th($L, $th) {
    if (!is_string($th) || $th === '') return '';
    foreach ($L['members'] as $m) if (hash_equals($m['th'], $th)) return $m['id'];
    return '';
}

function lg_nick_taken($L, $nick, $except = '') {
    $k = lg_key($nick);
    foreach ($L['members'] as $m) if ($m['id'] !== $except && lg_key($m['nick']) === $k) return true;
    return false;
}

/** Entra nella lega (o rientra con lo stesso telefono). */
function lg_join(&$L, $nick, $th, $now) {
    $old = lg_member_by_th($L, $th);
    if ($old !== '') return ['ok' => 1, 'mid' => $old, 'again' => 1];
    $nick = lg_clean($nick, LG_NICK_MAX);
    if (mb_strlen($nick) < 2) return ['err' => 'Scegli un soprannome di almeno 2 lettere'];
    if (count($L['members']) >= LG_MAX_MEMBERS) return ['err' => 'Lega al completo: siete già in ' . LG_MAX_MEMBERS];
    if (lg_nick_taken($L, $nick)) return ['err' => 'Soprannome già preso in questa lega: scegline un altro'];
    $used = array_column($L['members'], 'color');
    $color = LG_COLORS[count($L['members']) % count(LG_COLORS)];
    foreach (LG_COLORS as $c) if (!in_array($c, $used, true)) { $color = $c; break; }
    $L['seq']++;
    $mid = 'm' . $L['seq'];
    $L['members'][] = ['id' => $mid, 'nick' => $nick, 'th' => $th, 'color' => $color, 'joined' => $now, 'tot' => ['p' => 0, 'g' => 0, 'w' => 0]];
    if ($L['owner'] === '') $L['owner'] = $mid;
    return ['ok' => 1, 'mid' => $mid];
}

function lg_rename(&$L, $mid, $nick) {
    $i = lg_member_index($L, $mid);
    if ($i < 0) return ['err' => 'Non sei in questa lega'];
    $nick = lg_clean($nick, LG_NICK_MAX);
    if (mb_strlen($nick) < 2) return ['err' => 'Scegli un soprannome di almeno 2 lettere'];
    if (lg_nick_taken($L, $nick, $mid)) return ['err' => 'Soprannome già preso in questa lega: scegline un altro'];
    $L['members'][$i]['nick'] = $nick;
    return ['ok' => 1];
}

/** Esce un membro (da solo o tolto da chi ha creato la lega): spariscono anche i suoi risultati. */
function lg_remove(&$L, $mid) {
    $i = lg_member_index($L, $mid);
    if ($i < 0) return ['err' => 'Membro non trovato'];
    array_splice($L['members'], $i, 1);
    $L['results'] = array_values(array_filter($L['results'], function ($r) use ($mid) { return $r['m'] !== $mid; }));
    if ($L['owner'] === $mid) $L['owner'] = $L['members'] ? $L['members'][0]['id'] : '';
    return ['ok' => 1, 'empty' => $L['members'] ? 0 : 1];
}

/* ---------- Risultati ---------- */

/** I N° accettati oggi per un gioco: quello di oggi e quello di ieri (ora di Roma). */
function lg_open_ns($game, $now) {
    $today = lg_n_of($game, lg_rome_date($now));
    return array_values(array_filter([$today, $today - 1], function ($n) { return $n >= 1; }));
}

/** Registra il risultato di un membro. Il primo invio per gioco e N° vale, gli altri no. */
function lg_submit(&$L, $mid, $game, $n, $res, $now) {
    if (!is_string($game) || !isset(LG_GAMES[$game])) return ['err' => 'Gioco non collegato alle leghe'];
    if (lg_member_index($L, $mid) < 0) return ['err' => 'Non sei in questa lega'];
    if (!is_int($n) || !in_array($n, lg_open_ns($game, $now), true)) return ['err' => 'Partita chiusa: valgono solo quella di oggi e quella di ieri'];
    foreach ($L['results'] as $r) {
        if ($r['m'] === $mid && $r['g'] === $game && $r['n'] === $n) return ['dup' => 1, 'p' => $r['p']];
    }
    $s = lg_score($game, $res);
    if (isset($s['err'])) return $s;
    $L['results'][] = ['m' => $mid, 'g' => $game, 'n' => $n, 'd' => lg_day_of($game, $n), 'p' => $s['p'], 'w' => $s['w'], 'l' => $s['l'], 'at' => $now];
    return ['ok' => 1, 'p' => $s['p']];
}

/** Sposta nei totali dei membri i risultati piu' vecchi di LG_KEEP_DAYS giorni. */
function lg_compact(&$L, $now) {
    $limit = lg_add_days(lg_rome_date($now), -LG_KEEP_DAYS);
    $idx = [];
    foreach ($L['members'] as $i => $m) $idx[$m['id']] = $i;
    $keep = [];
    $moved = 0;
    foreach ($L['results'] as $r) {
        if ($r['d'] >= $limit) { $keep[] = $r; continue; }
        $moved++;
        if (!isset($idx[$r['m']])) continue;
        $t = &$L['members'][$idx[$r['m']]]['tot'];
        $t['p'] += $r['p']; $t['g']++; $t['w'] += $r['w'];
        unset($t);
    }
    if ($moved) $L['results'] = $keep;
    return $moved;
}

/* ---------- Classifiche ---------- */

/** Giorni di fila con almeno una vittoria (la serie piu' lunga) tra i giorni dati. */
function lg_best_streak($winDays) {
    $days = array_values(array_unique($winDays));
    sort($days);
    $best = 0; $cur = 0; $prev = '';
    foreach ($days as $d) {
        $cur = ($prev !== '' && lg_days_between($prev, $d) === 1) ? $cur + 1 : 1;
        $best = max($best, $cur);
        $prev = $d;
    }
    return $best;
}

/**
 * Classifica tra due giorni compresi ($from e $to 'AAAA-MM-GG'; $from = '' vuol dire
 * da sempre, coi totali gia' compattati). Righe: id, nick, color, p, g, w, avg, streak, pos.
 * Ordine: punti, poi vittorie, poi meno partite (media piu' alta), poi soprannome.
 */
function lg_standings($L, $from, $to) {
    $rows = [];
    $wins = [];
    foreach ($L['members'] as $m) {
        $t = $from === '' ? $m['tot'] : ['p' => 0, 'g' => 0, 'w' => 0];
        $rows[$m['id']] = ['id' => $m['id'], 'nick' => $m['nick'], 'color' => $m['color'], 'p' => $t['p'], 'g' => $t['g'], 'w' => $t['w']];
        $wins[$m['id']] = [];
    }
    foreach ($L['results'] as $r) {
        if (!isset($rows[$r['m']]) || ($from !== '' && $r['d'] < $from) || $r['d'] > $to) continue;
        $x = &$rows[$r['m']];
        $x['p'] += $r['p']; $x['g']++; $x['w'] += $r['w'];
        unset($x);
        if ($r['w']) $wins[$r['m']][] = $r['d'];
    }
    foreach ($rows as $id => &$x) {
        $x['avg'] = $x['g'] ? round($x['p'] / $x['g'], 1) : 0;
        $x['streak'] = lg_best_streak($wins[$id]);
    }
    unset($x);
    $rows = array_values($rows);
    usort($rows, function ($a, $b) {
        // chi non ha giocato va in fondo
        $ga = $a['g'] ?: PHP_INT_MAX;
        $gb = $b['g'] ?: PHP_INT_MAX;
        return [$b['p'], $b['w'], $ga, lg_key($a['nick'])] <=> [$a['p'], $a['w'], $gb, lg_key($b['nick'])];
    });
    // a parita' di punti, vittorie e partite si e' a pari merito
    $pos = 0;
    foreach ($rows as $i => &$x) {
        if ($i === 0 || $x['p'] !== $rows[$i - 1]['p'] || $x['w'] !== $rows[$i - 1]['w'] || $x['g'] !== $rows[$i - 1]['g']) $pos = $i + 1;
        $x['pos'] = $pos;
    }
    unset($x);
    return $rows;
}

/** Voto in pagella da 4 a 10 (mezzi voti) dalla media punti; s.v. con poche partite. */
function lg_voto($avg, $games) {
    if ($games < LG_PAGELLA_MIN) return null;
    return round((4 + 6 * min(1, max(0, $avg) / 8)) * 2) / 2;
}

/**
 * Pagellino della settimana prima di quella di oggi (da lunedi' a domenica):
 * vincitore (o vincitori a pari punti), media della lega, serie piu' lunga e il voto di
 * ciascuno. null se in quella settimana nessuno ha giocato.
 */
function lg_pagellino($L, $now) {
    $from = lg_add_days(lg_monday(lg_rome_date($now)), -7);
    $to = lg_add_days($from, 6);
    $rows = array_values(array_filter(lg_standings($L, $from, $to), function ($x) { return $x['g'] > 0; }));
    if (!$rows) return null;
    $games = array_sum(array_column($rows, 'g'));
    $points = array_sum(array_column($rows, 'p'));
    $winners = array_values(array_filter($rows, function ($x) { return $x['pos'] === 1; }));
    $best = max(array_column($rows, 'streak'));
    $streak = null;
    if ($best > 0) {
        foreach ($rows as $x) if ($x['streak'] === $best) { $streak = ['id' => $x['id'], 'nick' => $x['nick'], 'days' => $best]; break; }
    }
    foreach ($rows as &$x) $x['voto'] = lg_voto($x['avg'], $x['g']);
    unset($x);
    return [
        'from' => $from, 'to' => $to,
        'winners' => array_map(function ($x) { return ['id' => $x['id'], 'nick' => $x['nick'], 'p' => $x['p']]; }, $winners),
        'avg' => round($points / $games, 1), 'games' => $games, 'players' => count($rows),
        'streak' => $streak, 'rows' => $rows,
    ];
}

/** Ultimi risultati (oggi e ieri), dal piu' recente: chi ha gia' giocato. */
function lg_recent($L, $now) {
    $today = lg_rome_date($now);
    $since = lg_add_days($today, -1);
    $nick = [];
    foreach ($L['members'] as $m) $nick[$m['id']] = $m['nick'];
    $out = [];
    foreach ($L['results'] as $r) {
        if ($r['d'] < $since || $r['d'] > $today || !isset($nick[$r['m']])) continue;
        $out[] = ['m' => $r['m'], 'g' => $r['g'], 'n' => $r['n'], 'd' => $r['d'], 'p' => $r['p'], 'w' => $r['w'], 'l' => $r['l'], 'at' => $r['at']];
    }
    usort($out, function ($a, $b) { return $b['at'] <=> $a['at']; });
    return array_slice($out, 0, 60);
}

/** Lo stato della lega per un membro ($mid) o, per chi non c'e', solo nome e posti. */
function lg_public($L, $mid, $now) {
    $base = ['code' => $L['code'], 'name' => $L['name'], 'count' => count($L['members']), 'max' => LG_MAX_MEMBERS];
    if ($mid === '' || lg_member_index($L, $mid) < 0) return $base + ['member' => 0];
    $today = lg_rome_date($now);
    $week = lg_monday($today);
    $month = substr($today, 0, 8) . '01';
    $games = [];
    // i giochi non ancora partiti (N° 1 nel futuro) non si mostrano
    foreach (LG_GAMES as $id => $g) {
        $n = lg_n_of($id, $today);
        if ($n >= 1) $games[$id] = ['name' => $g['name'], 'short' => $g['short'], 'n' => $n, 'rules' => $g['rules']];
    }
    return $base + [
        'member' => 1, 'me' => $mid, 'owner' => $L['owner'], 'created' => $L['created'],
        'today' => $today, 'monday' => lg_is_monday($today) ? 1 : 0, 'games' => $games,
        'members' => array_map(function ($m) { return ['id' => $m['id'], 'nick' => $m['nick'], 'color' => $m['color']]; }, $L['members']),
        'week' => ['from' => $week, 'to' => $today, 'rows' => lg_standings($L, $week, $today)],
        'month' => ['from' => $month, 'to' => $today, 'rows' => lg_standings($L, $month, $today)],
        'all' => ['from' => '', 'to' => $today, 'rows' => lg_standings($L, '', $today)],
        'pagellino' => lg_pagellino($L, $now),
        'recent' => lg_recent($L, $now),
    ];
}
