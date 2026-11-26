<?php
/* ==========================================================================
   QUIZZOTTI — Nomi, Cose, Calcio: regole della stanza (senza I/O)
   Funzioni pure su un array $r (la stanza), usate da nomicose.php e dai test
   (tests/nomicose-core.test.php). Scritto per PHP 8.0, la versione di Altervista.

   Fasi: lobby -> letter (lettera estratta, 4 s) -> play (si scrive) ->
   review (si contestano le risposte) -> results -> letter ... -> end.
   Punti per categoria: 20 se sei l'unico con una risposta valida, 10 se la
   tua risposta valida e' solo tua, 5 se qualcun altro ha scritto la stessa.
   ========================================================================== */

const NC_MAX_PLAYERS = 12;
const NC_MAX_CATS = 12;
const NC_LETTER_SECONDS = 4;
const NC_STOP_SECONDS = 10;
const NC_GRACE_SECONDS = 2;   // ultimi salvataggi dei telefoni dopo il gong
const NC_LETTERS = 'ABCDEFGHILMNOPRSTUVZ';
const NC_FOREIGN = 'JKWY';
const NC_COLORS = ['#d9342b', '#2f6fe0', '#1f9d55', '#b8800a', '#8a55e0', '#d9611c', '#1a8fbf', '#b02a5c', '#2a8f86', '#6f7a83', '#c2410c', '#4d7c0f'];

/** Testo libero pulito: niente caratteri di controllo, spazi compattati, lunghezza massima. */
function nc_clean($s, $max) {
    $s = is_string($s) ? $s : '';
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    if (mb_strlen($s) > $max) $s = mb_substr($s, 0, $max);
    return $s;
}

/** Chiave di confronto: minuscole, senza accenti, solo lettere e cifre. */
function nc_key($s) {
    $s = mb_strtolower(nc_clean($s, 80));
    $map = ['à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'ç' => 'c', 'ć' => 'c', 'č' => 'c',
        'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e', 'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i', 'ñ' => 'n',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o', 'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
        'š' => 's', 'ş' => 's', 'ž' => 'z', 'ý' => 'y', 'ÿ' => 'y', 'ğ' => 'g', 'ı' => 'i', 'ł' => 'l', 'ß' => 'ss', 'đ' => 'd'];
    $s = strtr($s, $map);
    // articoli e sigle societarie davanti non contano: "Il Milan", "AS Roma", "l'Inter"
    $s = preg_replace("/^(l|un|dell|nell)['’]\s*/u", '', $s) ?? $s;
    $s = preg_replace('/^(il|lo|la|i|gli|le|un|uno|una|ac|as|ss|ssc|ssd|us|fc|cf|sc|afc|asd)\s+/u', '', $s) ?? $s;
    return preg_replace('/[^a-z0-9]/', '', $s) ?? '';
}

/** Distanza di modifica (per "Ibrahimovic" contro "Ibrahimović" o un refuso). */
function nc_close($a, $b) {
    if ($a === $b) return true;
    if (min(strlen($a), strlen($b)) < 5) return false;
    return levenshtein($a, $b) <= 1;
}

function nc_new_room($code, $hostTok, $now, $opts = []) {
    return [
        'v' => 1, 'code' => $code, 'created' => $now, 'updated' => $now, 'hostTok' => $hostTok,
        'phase' => 'lobby',
        'opts' => nc_opts([], $opts),
        'cats' => [],
        'players' => [],
        'round' => 0, 'letter' => '', 'used' => [],
        'startAt' => 0, 'deadline' => 0, 'stopBy' => '',
        'answers' => [], 'rejects' => [], 'override' => [],
        'history' => [], 'scores' => [], 'seq' => 0,
    ];
}

function nc_opts($old, $in) {
    $o = array_merge(['rounds' => 5, 'time' => 90, 'stop' => true, 'foreign' => true], $old);
    if (isset($in['rounds']) && in_array((int)$in['rounds'], [0, 3, 5, 8, 10], true)) $o['rounds'] = (int)$in['rounds'];
    if (isset($in['time']) && in_array((int)$in['time'], [60, 90, 120, 180], true)) $o['time'] = (int)$in['time'];
    if (isset($in['stop'])) $o['stop'] = (bool)$in['stop'];
    if (isset($in['foreign'])) $o['foreign'] = (bool)$in['foreign'];
    return $o;
}

function nc_player_index($r, $pid) {
    foreach ($r['players'] as $i => $p) if ($p['id'] === $pid) return $i;
    return -1;
}

/** Il primo giocatore entrato fa da capitano: puo' comandare la partita dal telefono. */
function nc_captain($r) {
    return $r['players'] ? $r['players'][0]['id'] : '';
}

function nc_join(&$r, $name, $tok, $now) {
    $name = nc_clean($name, 16);
    if ($name === '') return ['err' => 'Scrivi il tuo nome'];
    // stesso telefono che rientra (ricarica, schermo spento): tiene posto e punti
    foreach ($r['players'] as $i => $p) {
        if ($p['tok'] !== $tok) continue;
        foreach ($r['players'] as $q) {
            if ($q['tok'] !== $tok && mb_strtolower($q['name']) === mb_strtolower($name)) return ['err' => 'Nome già preso: scegline un altro'];
        }
        $r['players'][$i]['name'] = $name;
        $r['players'][$i]['last'] = $now;
        return ['pid' => $p['id']];
    }
    foreach ($r['players'] as $p) if (mb_strtolower($p['name']) === mb_strtolower($name)) return ['err' => 'Nome già preso: scegline un altro'];
    if (count($r['players']) >= NC_MAX_PLAYERS) return ['err' => 'La stanza è piena (' . NC_MAX_PLAYERS . ' giocatori)'];
    $r['seq']++;
    $used = array_column($r['players'], 'color');
    $color = NC_COLORS[0];
    foreach (NC_COLORS as $c) if (!in_array($c, $used, true)) { $color = $c; break; }
    $pid = 'p' . $r['seq'];
    $r['players'][] = ['id' => $pid, 'name' => $name, 'color' => $color, 'tok' => $tok, 'joined' => $now, 'last' => $now];
    if (!isset($r['scores'][$pid])) $r['scores'][$pid] = 0;
    return ['pid' => $pid];
}

function nc_set_cats(&$r, $cats) {
    if (!in_array($r['phase'], ['lobby', 'results'], true)) return ['err' => 'Le categorie si cambiano tra un round e l\'altro'];
    $out = [];
    $seen = [];
    foreach ((array)$cats as $c) {
        if (!is_array($c)) continue;
        $id = preg_replace('/[^a-z0-9]/', '', (string)($c['id'] ?? '')) ?? '';
        $name = nc_clean($c['name'] ?? '', 34);
        if ($id === '' || $name === '' || isset($seen[$id])) continue;
        $seen[$id] = 1;
        $out[] = ['id' => substr($id, 0, 12), 'name' => $name];
        if (count($out) >= NC_MAX_CATS) break;
    }
    $r['cats'] = $out;
    return ['ok' => 1];
}

function nc_add_cat(&$r, $name) {
    if (!in_array($r['phase'], ['lobby', 'results'], true)) return ['err' => 'Le categorie si aggiungono tra un round e l\'altro'];
    $name = nc_clean($name, 34);
    if (mb_strlen($name) < 2) return ['err' => 'Nome della categoria troppo corto'];
    if (count($r['cats']) >= NC_MAX_CATS) return ['err' => 'Massimo ' . NC_MAX_CATS . ' categorie'];
    foreach ($r['cats'] as $c) if (nc_key($c['name']) === nc_key($name)) return ['err' => 'C\'è già questa categoria'];
    $r['seq']++;
    $r['cats'][] = ['id' => 'x' . $r['seq'], 'name' => $name];
    return ['ok' => 1];
}

function nc_remove_cat(&$r, $id) {
    if (!in_array($r['phase'], ['lobby', 'results'], true)) return ['err' => 'Le categorie si cambiano tra un round e l\'altro'];
    $r['cats'] = array_values(array_filter($r['cats'], function ($c) use ($id) { return $c['id'] !== $id; }));
    return ['ok' => 1];
}

/** Estrae una lettera non ancora uscita (quando finiscono, si ricomincia). */
function nc_draw_letter(&$r, $rand = null) {
    $pool = str_split(NC_LETTERS . ($r['opts']['foreign'] ? NC_FOREIGN : ''));
    $left = array_values(array_diff($pool, $r['used']));
    if (!$left) { $r['used'] = []; $left = $pool; }
    $i = $rand !== null ? $rand % count($left) : random_int(0, count($left) - 1);
    $r['used'][] = $left[$i];
    return $left[$i];
}

function nc_start_round(&$r, $now, $rand = null) {
    if (!in_array($r['phase'], ['lobby', 'results'], true)) return ['err' => 'Il round è già in corso'];
    if (count($r['players']) < 1) return ['err' => 'Aspetta che entri almeno un giocatore'];
    if (count($r['cats']) < 3) return ['err' => 'Servono almeno 3 categorie'];
    if ($r['opts']['rounds'] > 0 && $r['round'] >= $r['opts']['rounds']) return ['err' => 'Partita finita: guardate la classifica'];
    $r['round']++;
    $r['letter'] = nc_draw_letter($r, $rand);
    $r['phase'] = 'letter';
    $r['startAt'] = $now + NC_LETTER_SECONDS;
    $r['deadline'] = $r['startAt'] + $r['opts']['time'];
    $r['stopBy'] = '';
    $r['answers'] = [];
    $r['rejects'] = [];
    $r['override'] = [];
    $r['roundCats'] = $r['cats'];
    return ['ok' => 1];
}

/** Avanza le fasi a tempo. Restituisce true se la stanza e' cambiata. */
function nc_tick(&$r, $now) {
    if ($r['phase'] === 'letter' && $now >= $r['startAt']) { $r['phase'] = 'play'; return true; }
    if ($r['phase'] === 'play' && $now >= $r['deadline'] + NC_GRACE_SECONDS) { $r['phase'] = 'review'; return true; }
    return false;
}

function nc_answer(&$r, $pid, $answers, $now) {
    if (!in_array($r['phase'], ['letter', 'play'], true) || $now > $r['deadline'] + NC_GRACE_SECONDS) return ['err' => 'Il tempo è scaduto'];
    $mine = $r['answers'][$pid] ?? [];
    foreach ($r['roundCats'] as $c) {
        if (array_key_exists($c['id'], (array)$answers)) $mine[$c['id']] = nc_clean($answers[$c['id']], 40);
    }
    $r['answers'][$pid] = $mine;
    return ['ok' => 1];
}

/** "Stop!": chi ha riempito tutte le caselle ferma il round (restano 10 secondi a tutti). */
function nc_stop(&$r, $pid, $now) {
    if ($r['phase'] !== 'play' || !$r['opts']['stop']) return ['err' => 'Ora non si può fermare'];
    if ($r['stopBy'] !== '') return ['ok' => 1];
    $mine = $r['answers'][$pid] ?? [];
    foreach ($r['roundCats'] as $c) if (($mine[$c['id']] ?? '') === '') return ['err' => 'Per dire stop devi riempire tutte le caselle'];
    $r['stopBy'] = $pid;
    $r['deadline'] = min($r['deadline'], $now + NC_STOP_SECONDS);
    return ['ok' => 1];
}

/** La TV o il capitano chiudono il round prima del tempo (restano i secondi di tolleranza). */
function nc_finish(&$r, $now) {
    if (!in_array($r['phase'], ['letter', 'play'], true)) return ['err' => 'Nessun round in corso'];
    $r['phase'] = 'play';
    $r['deadline'] = min($r['deadline'], $now);
    return ['ok' => 1];
}

/** Risposta che rispetta la lettera (dopo articoli e sigle). */
function nc_letter_ok($answer, $letter) {
    $k = nc_key($answer);
    return $k !== '' && strtoupper($k[0]) === $letter;
}

/** Contestazione: un voto per giocatore su una risposta altrui (si ritocca per togliere). */
function nc_vote(&$r, $voter, $target, $cat) {
    if ($r['phase'] !== 'review') return ['err' => 'Si contesta solo durante il controllo'];
    if ($voter === $target || nc_player_index($r, $target) < 0) return ['err' => 'Voto non valido'];
    $list = $r['rejects'][$target][$cat] ?? [];
    $i = array_search($voter, $list, true);
    if ($i === false) $list[] = $voter; else array_splice($list, $i, 1);
    $r['rejects'][$target][$cat] = array_values($list);
    return ['ok' => 1];
}

/** La TV o il capitano possono forzare: valida (true), non valida (false), torna al voto (null). */
function nc_override(&$r, $target, $cat, $value) {
    if ($r['phase'] !== 'review') return ['err' => 'Si corregge solo durante il controllo'];
    $k = $target . '|' . $cat;
    if ($value === null) unset($r['override'][$k]); else $r['override'][$k] = (bool)$value;
    return ['ok' => 1];
}

/** Stato di ogni risposta del round: testo, valida, motivo, punti. */
function nc_evaluate($r) {
    $players = array_column($r['players'], 'id');
    $n = count($players);
    $need = max(1, (int)ceil(($n - 1) / 2));   // contestazioni per bocciare
    $out = [];
    foreach ($r['roundCats'] ?? [] as $c) {
        $cid = $c['id'];
        $rows = [];
        foreach ($players as $pid) {
            $txt = $r['answers'][$pid][$cid] ?? '';
            $rej = count($r['rejects'][$pid][$cid] ?? []);
            $why = '';
            if ($txt === '') $why = 'vuota';
            elseif (!nc_letter_ok($txt, $r['letter'])) $why = 'lettera';
            elseif ($rej >= $need) $why = 'bocciata';
            $ov = $r['override'][$pid . '|' . $cid] ?? null;
            $valid = $why === '';
            if ($ov !== null && $txt !== '') { $valid = $ov; $why = $ov ? '' : 'tv'; }
            $rows[$pid] = ['t' => $txt, 'ok' => $valid, 'why' => $why, 'rej' => $rej, 'pts' => 0, 'dup' => 0];
        }
        // raggruppa le valide uguali (o quasi uguali)
        $valid = array_keys(array_filter($rows, function ($x) { return $x['ok']; }));
        $keys = [];
        foreach ($valid as $pid) $keys[$pid] = nc_key($rows[$pid]['t']);
        foreach ($valid as $pid) {
            $same = 0;
            foreach ($valid as $q) if ($q !== $pid && nc_close($keys[$pid], $keys[$q])) $same++;
            $rows[$pid]['dup'] = $same;
            $rows[$pid]['pts'] = count($valid) === 1 ? 20 : ($same ? 5 : 10);
        }
        $out[$cid] = $rows;
    }
    return $out;
}

function nc_confirm(&$r) {
    if ($r['phase'] !== 'review') return ['err' => 'Niente da confermare'];
    $ev = nc_evaluate($r);
    $pts = [];
    foreach ($r['players'] as $p) $pts[$p['id']] = 0;
    foreach ($ev as $rows) foreach ($rows as $pid => $x) $pts[$pid] = ($pts[$pid] ?? 0) + $x['pts'];
    foreach ($pts as $pid => $v) $r['scores'][$pid] = ($r['scores'][$pid] ?? 0) + $v;
    $r['history'][] = ['round' => $r['round'], 'letter' => $r['letter'], 'cats' => $r['roundCats'], 'eval' => $ev, 'points' => $pts, 'stopBy' => $r['stopBy']];
    $r['phase'] = 'results';
    return ['ok' => 1];
}

function nc_end(&$r) {
    if ($r['phase'] === 'review') nc_confirm($r);
    if (!in_array($r['phase'], ['lobby', 'results'], true)) return ['err' => 'Finite prima il round in corso'];
    $r['phase'] = 'end';
    return ['ok' => 1];
}

/** Rivincita: stessi giocatori e categorie, punteggi azzerati. */
function nc_rematch(&$r) {
    if ($r['phase'] !== 'end') return ['err' => 'La partita non è finita'];
    $r['phase'] = 'lobby';
    $r['round'] = 0; $r['used'] = []; $r['history'] = []; $r['letter'] = '';
    foreach ($r['players'] as $p) $r['scores'][$p['id']] = 0;
    return ['ok' => 1];
}

function nc_kick(&$r, $pid) {
    if (!in_array($r['phase'], ['lobby', 'results', 'end'], true)) return ['err' => 'Si toglie un giocatore solo tra un round e l\'altro'];
    $r['players'] = array_values(array_filter($r['players'], function ($p) use ($pid) { return $p['id'] !== $pid; }));
    return ['ok' => 1];
}

/**
 * Cosa vede chi chiede: niente gettoni, e durante il round le risposte degli altri
 * restano nascoste (alla TV arriva solo quante caselle ha riempito ciascuno).
 */
function nc_public($r, $me, $isHost, $now) {
    $players = [];
    foreach ($r['players'] as $p) {
        $filled = 0;
        foreach ($r['roundCats'] ?? [] as $c) if (($r['answers'][$p['id']][$c['id']] ?? '') !== '') $filled++;
        $players[] = ['id' => $p['id'], 'name' => $p['name'], 'color' => $p['color'], 'score' => $r['scores'][$p['id']] ?? 0,
            'filled' => $filled, 'online' => $now - ($p['last'] ?? 0) < 20];
    }
    $out = [
        'v' => $r['v'], 'code' => $r['code'], 'now' => $now, 'phase' => $r['phase'], 'opts' => $r['opts'],
        'cats' => $r['cats'], 'roundCats' => $r['roundCats'] ?? [], 'players' => $players, 'captain' => nc_captain($r),
        'round' => $r['round'], 'letter' => in_array($r['phase'], ['lobby'], true) ? '' : $r['letter'], 'used' => $r['used'],
        'startAt' => $r['startAt'], 'deadline' => $r['deadline'], 'stopBy' => $r['stopBy'],
        'me' => $me, 'host' => $isHost,
    ];
    if (in_array($r['phase'], ['letter', 'play'], true)) {
        $out['mine'] = $me !== '' ? ($r['answers'][$me] ?? new stdClass()) : new stdClass();
    }
    if ($r['phase'] === 'review') {
        $out['eval'] = nc_evaluate($r);
        $out['myVotes'] = [];
        foreach ($r['rejects'] as $target => $cats) foreach ($cats as $cid => $voters) {
            if (in_array($me, $voters, true)) $out['myVotes'][] = $target . '|' . $cid;
        }
        $out['override'] = $r['override'];
    }
    if (in_array($r['phase'], ['results', 'end'], true)) $out['history'] = $r['history'];
    return $out;
}
