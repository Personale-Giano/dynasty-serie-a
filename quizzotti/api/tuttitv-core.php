<?php
/* ==========================================================================
   QUIZZOTTI — Tutti contro la TV: regole della stanza (senza I/O)
   Funzioni pure su un array $r (la stanza), usate da tuttitv.php e dai test
   (tests/tuttitv-core.test.php). Scritto per PHP 8.0, la versione di Altervista.

   Fasi: lobby -> ask (domanda: 3 s per leggerla, poi si risponde) ->
   reveal (risposta giusta, voti per opzione, classifica) -> ask ... ;
   tra un round e l'altro: twist (l'imprevisto spiegato sulla TV) -> ask
   (la domanda dell'imprevisto) -> reveal -> ask (round dopo) ... -> end.
   Il piano della partita (domande e risposte giuste) si decide all'inizio e
   resta nel file della stanza: ai telefoni e alla TV arriva solo la domanda
   in corso, e la risposta giusta solo quando la domanda e' chiusa.
   Punti: 500 + fino a 500 per la velocita', misurata sull'orario del server
   quando la risposta arriva. Solo se giusta.
   ========================================================================== */

const TV_MAX_PLAYERS = 12;
const TV_PER_ROUND = 5;
const TV_READY = 3;          // secondi per leggere la domanda prima delle risposte
const TV_REVEAL = 10;        // secondi della soluzione, poi si va avanti da soli
const TV_TWIST = 12;         // secondi della schermata dell'imprevisto
const TV_LAMPO = 5;          // secondi della domanda lampo
const TV_ONLINE = 20;        // un telefono che non si fa sentire da 20 s non si aspetta
const TV_STEAL = 200;
const TV_PENALTY = 500;
const TV_TIMES = [10, 15, 20];
const TV_DIFFS = ['facile', 'mista', 'difficile'];
const TV_TWISTS = ['doppi', 'tuttoniente', 'rubapunti', 'lampo', 'rimonta'];
const TV_COLORS = ['#d9342b', '#2f6fe0', '#1f9d55', '#b8800a', '#8a55e0', '#d9611c', '#1a8fbf', '#b02a5c', '#2a8f86', '#6f7a83', '#c2410c', '#4d7c0f'];

/** Testo libero pulito: niente caratteri di controllo, spazi compattati, lunghezza massima. */
function tv_clean($s, $max) {
    $s = is_string($s) ? $s : '';
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    if (mb_strlen($s) > $max) $s = mb_substr($s, 0, $max);
    return $s;
}

/** Legge e controlla il file delle domande (api/tuttitv-domande.json). */
function tv_load_bank($file) {
    $d = json_decode((string)@file_get_contents($file), true);
    if (!is_array($d) || empty($d['questions']) || empty($d['themes'])) return null;
    $qs = [];
    foreach ($d['questions'] as $q) {
        if (!is_array($q) || !isset($q['id'], $q['testo'], $q['opzioni'], $q['giusta'], $q['difficolta'], $q['tema'])) continue;
        if (!is_array($q['opzioni']) || count($q['opzioni']) !== 4) continue;
        $qs[] = $q;
    }
    return ['themes' => $d['themes'], 'questions' => $qs];
}

function tv_new_room($code, $hostTok, $now, $themes, $opts = []) {
    $r = [
        'v' => 1, 'code' => $code, 'created' => $now, 'updated' => $now, 'hostTok' => $hostTok,
        'phase' => 'lobby',
        'themes' => array_values(array_map(function ($t) { return ['id' => (string)$t['id'], 'name' => (string)$t['name'], 'n' => (int)($t['n'] ?? 0)]; }, $themes)),
        'opts' => [],
        'players' => [], 'scores' => [], 'seq' => 0,
        'plan' => [], 'pos' => -1, 'startAt' => 0, 'deadline' => 0, 'nextAt' => 0, 'hold' => false,
        'answers' => [], 'history' => [], 'used' => [], 'games' => 0,
    ];
    $r['opts'] = tv_opts($r, [], $opts);
    return $r;
}

/** Impostazioni della sala d'attesa: round 2-6, secondi 10/15/20, difficolta', temi (vuoto = tutti). */
function tv_opts($r, $old, $in) {
    $o = array_merge(['rounds' => 3, 'time' => 15, 'diff' => 'mista', 'themes' => []], $old);
    if (isset($in['rounds']) && (int)$in['rounds'] >= 2 && (int)$in['rounds'] <= 6) $o['rounds'] = (int)$in['rounds'];
    if (isset($in['time']) && in_array((int)$in['time'], TV_TIMES, true)) $o['time'] = (int)$in['time'];
    if (isset($in['diff']) && in_array($in['diff'], TV_DIFFS, true)) $o['diff'] = $in['diff'];
    if (isset($in['themes']) && is_array($in['themes'])) {
        $ok = array_column($r['themes'], 'id');
        $list = [];
        foreach ($in['themes'] as $t) if (is_string($t) && in_array($t, $ok, true) && !in_array($t, $list, true)) $list[] = $t;
        // tutti accesi equivale a nessun filtro
        $o['themes'] = count($list) === count($ok) ? [] : $list;
    }
    return $o;
}

function tv_player_index($r, $pid) {
    foreach ($r['players'] as $i => $p) if ($p['id'] === $pid) return $i;
    return -1;
}

/** Il primo giocatore entrato fa da capitano: puo' comandare la partita dal telefono. */
function tv_captain($r) {
    return $r['players'] ? $r['players'][0]['id'] : '';
}

function tv_join(&$r, $name, $tok, $now) {
    $name = tv_clean($name, 16);
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
    if (count($r['players']) >= TV_MAX_PLAYERS) return ['err' => 'La stanza è piena (' . TV_MAX_PLAYERS . ' giocatori)'];
    $r['seq']++;
    $used = array_column($r['players'], 'color');
    $color = TV_COLORS[0];
    foreach (TV_COLORS as $c) if (!in_array($c, $used, true)) { $color = $c; break; }
    $pid = 'p' . $r['seq'];
    $r['players'][] = ['id' => $pid, 'name' => $name, 'color' => $color, 'tok' => $tok, 'joined' => $now, 'last' => $now];
    if (!isset($r['scores'][$pid])) $r['scores'][$pid] = 0;
    return ['pid' => $pid];
}

function tv_kick(&$r, $pid) {
    if ($r['phase'] === 'ask') return ['err' => 'Aspetta la fine della domanda'];
    $r['players'] = array_values(array_filter($r['players'], function ($p) use ($pid) { return $p['id'] !== $pid; }));
    return ['ok' => 1];
}

/** Giocatori in ordine di classifica (a pari punti, chi e' entrato prima). */
function tv_ranking($r, $scores = null) {
    $scores = $scores ?? $r['scores'];
    $list = [];
    foreach ($r['players'] as $i => $p) $list[] = ['id' => $p['id'], 's' => $scores[$p['id']] ?? 0, 'i' => $i];
    usort($list, function ($a, $b) { return $b['s'] <=> $a['s'] ?: $a['i'] <=> $b['i']; });
    return array_column($list, 'id');
}

/** Domande per la partita, con i filtri allargati se non ne bastano. */
function tv_pick(&$r, $bank, $need) {
    $themes = $r['opts']['themes'];
    $diff = ['facile' => [1], 'mista' => [1, 2, 3], 'difficile' => [3]][$r['opts']['diff']];
    $wider = ['facile' => [1, 2], 'mista' => [1, 2, 3], 'difficile' => [2, 3]][$r['opts']['diff']];
    $tries = [[$themes, $diff, true], [$themes, $wider, true], [$themes, $diff, false], [$themes, $wider, false], [[], $wider, true], [[], [1, 2, 3], false]];
    foreach ($tries as [$th, $df, $fresh]) {
        $pool = array_values(array_filter($bank['questions'], function ($q) use ($th, $df, $fresh, $r) {
            return (!$th || in_array($q['tema'], $th, true)) && in_array((int)$q['difficolta'], $df, true) && (!$fresh || !in_array($q['id'], $r['used'], true));
        }));
        if (count($pool) >= $need) {
            shuffle($pool);
            return array_slice($pool, 0, $need);
        }
    }
    return [];
}

/** Il piano: round da 5 domande e, tra un round e l'altro, la domanda dell'imprevisto. */
function tv_make_plan(&$r, $bank) {
    $rounds = $r['opts']['rounds'];
    $need = $rounds * TV_PER_ROUND + ($rounds - 1);
    $qs = tv_pick($r, $bank, $need);
    if (count($qs) < $need) return false;
    $twists = TV_TWISTS;
    shuffle($twists);
    $plan = [];
    for ($k = 1; $k <= $rounds; $k++) {
        $block = array_splice($qs, 0, TV_PER_ROUND);
        // a difficolta' mista ogni round sale: prima le facili
        if ($r['opts']['diff'] === 'mista') usort($block, function ($a, $b) { return $a['difficolta'] <=> $b['difficolta']; });
        foreach ($block as $i => $q) $plan[] = ['q' => $q, 'round' => $k, 'k' => $i + 1, 'mode' => 'normale'];
        if ($k < $rounds) $plan[] = ['q' => array_shift($qs), 'round' => $k, 'k' => 0, 'mode' => $twists[($k - 1) % count($twists)]];
    }
    $r['plan'] = $plan;
    return true;
}

function tv_start(&$r, $now, $bank) {
    if ($r['phase'] !== 'lobby') return ['err' => 'La partita è già in corso'];
    if (count($r['players']) < 1) return ['err' => 'Aspetta che entri almeno un giocatore'];
    if (!tv_make_plan($r, $bank)) return ['err' => 'Non ci sono abbastanza domande con questi filtri'];
    foreach ($r['players'] as $p) $r['scores'][$p['id']] = 0;
    $r['history'] = [];
    $r['pos'] = -1;
    $r['games']++;
    tv_ask($r, 0, $now);
    return ['ok' => 1];
}

function tv_ask(&$r, $i, $now) {
    $slot = $r['plan'][$i];
    $time = $slot['mode'] === 'lampo' ? TV_LAMPO : $r['opts']['time'];
    $r['pos'] = $i;
    $r['phase'] = 'ask';
    $r['startAt'] = round($now + TV_READY, 3);
    $r['deadline'] = round($now + TV_READY + $time, 3);
    $r['answers'] = [];
    $r['hold'] = false;
    $r['used'][] = $slot['q']['id'];
    // la memoria delle domande uscite non cresce all'infinito
    if (count($r['used']) > 400) $r['used'] = array_slice($r['used'], -400);
}

/** Dopo la soluzione o l'imprevisto: la prossima domanda, l'imprevisto o la fine. */
function tv_advance(&$r, $now) {
    $n = $r['pos'] + 1;
    if ($r['phase'] === 'twist') { tv_ask($r, $n, $now); return; }
    if ($n >= count($r['plan'])) { $r['phase'] = 'end'; $r['nextAt'] = 0; return; }
    if ($r['plan'][$n]['mode'] !== 'normale') {
        $r['phase'] = 'twist';
        $r['nextAt'] = round($now + TV_TWIST, 3);
        $r['hold'] = false;
        return;
    }
    tv_ask($r, $n, $now);
}

/** Avanza le fasi a tempo. Restituisce true se la stanza e' cambiata. */
function tv_tick(&$r, $now) {
    if ($r['phase'] === 'ask' && $now >= $r['deadline']) { tv_close($r, $now); return true; }
    if (in_array($r['phase'], ['reveal', 'twist'], true) && !$r['hold'] && $now >= $r['nextAt']) { tv_advance($r, $now); return true; }
    return false;
}

function tv_online($r, $p, $now) {
    return $now - ($p['last'] ?? 0) < TV_ONLINE;
}

/** Una risposta per telefono, solo mentre la domanda e' aperta; il tempo e' quello del server. */
function tv_answer(&$r, $pid, $n, $c, $now) {
    if ($r['phase'] !== 'ask' || (int)$n !== $r['pos'] + 1) return ['err' => 'Tempo scaduto'];
    if (!is_int($c) || $c < 0 || $c > 3) return ['err' => 'Risposta non valida'];
    if ($now < $r['startAt']) return ['err' => 'Aspetta: le risposte si aprono tra un attimo'];
    if ($now > $r['deadline']) return ['err' => 'Tempo scaduto'];
    if (isset($r['answers'][$pid])) return ['err' => 'Hai già risposto'];
    $r['answers'][$pid] = ['c' => $c, 't' => round($now, 3)];
    // hanno risposto tutti quelli collegati: si chiude subito
    $all = true;
    foreach ($r['players'] as $p) {
        if (!isset($r['answers'][$p['id']]) && tv_online($r, $p, $now)) { $all = false; break; }
    }
    if ($all) tv_close($r, $now);
    return ['ok' => 1];
}

/** Punti di una risposta giusta: 500 + fino a 500 in base al tempo rimasto. */
function tv_speed_points($deadline, $time, $t) {
    $left = max(0.0, min(1.0, ($deadline - $t) / max(1, $time)));
    return 500 + (int)round(500 * $left);
}

/** Chiude la domanda: punti, imprevisto, storico. */
function tv_close(&$r, $now) {
    if ($r['phase'] !== 'ask') return ['err' => 'Nessuna domanda aperta'];
    $slot = $r['plan'][$r['pos']];
    $q = $slot['q'];
    $mode = $slot['mode'];
    $time = $r['deadline'] - $r['startAt'];
    $before = $r['scores'];
    $rank = tv_ranking($r, $before);
    $half = (int)ceil(count($rank) / 2);
    $counts = [0, 0, 0, 0];
    $res = [];
    $fastest = '';
    foreach ($r['players'] as $p) {
        $pid = $p['id'];
        $a = $r['answers'][$pid] ?? null;
        $c = $a ? $a['c'] : -1;
        $ok = $a && $c === (int)$q['giusta'];
        if ($a) $counts[$c]++;
        $base = $ok ? tv_speed_points($r['deadline'], $time, $a['t']) : 0;
        $pts = $base;
        if ($mode === 'doppi') $pts = $base * 2;
        elseif ($mode === 'tuttoniente') $pts = $ok ? $base * 2 : ($a ? -TV_PENALTY : 0);
        elseif ($mode === 'lampo') $pts = $ok ? 1000 : 0;
        elseif ($mode === 'rimonta' && $ok && array_search($pid, $rank, true) >= $half) $pts = $base * 3;
        // il punteggio non va sotto zero
        $old = $before[$pid] ?? 0;
        $pts = max(-$old, $pts);
        if ($ok && ($fastest === '' || $a['t'] < $r['answers'][$fastest]['t'])) $fastest = $pid;
        $res[$pid] = ['c' => $c, 'ok' => $ok, 'ms' => $a ? (int)round(($a['t'] - $r['startAt']) * 1000) : null, 'base' => $base, 'pts' => $pts];
    }
    $steal = null;
    if ($mode === 'rubapunti' && $fastest !== '' && count($rank) > 1) {
        $victim = $rank[0] === $fastest ? $rank[1] : $rank[0];
        $have = ($before[$victim] ?? 0) + $res[$victim]['pts'];
        $n = min(TV_STEAL, max(0, $have));
        $res[$fastest]['pts'] += $n;
        $res[$victim]['pts'] -= $n;
        $steal = ['by' => $fastest, 'from' => $victim, 'n' => $n];
    }
    foreach ($res as $pid => $x) $r['scores'][$pid] = ($before[$pid] ?? 0) + $x['pts'];
    $r['history'][] = [
        'n' => $r['pos'] + 1, 'round' => $slot['round'], 'k' => $slot['k'], 'mode' => $mode,
        'id' => $q['id'], 'testo' => $q['testo'], 'opzioni' => $q['opzioni'], 'giusta' => (int)$q['giusta'],
        'tema' => $q['tema'], 'difficolta' => (int)$q['difficolta'], 'time' => $time,
        'counts' => $counts, 'res' => $res, 'steal' => $steal, 'fastest' => $fastest,
    ];
    $r['phase'] = 'reveal';
    $r['deadline'] = min($r['deadline'], round($now, 3));
    $r['nextAt'] = round($now + TV_REVEAL, 3);
    $r['hold'] = false;
    return ['ok' => 1];
}

/** La TV o il capitano: avanti subito (soluzione, imprevisto) o chiudi la domanda. */
function tv_next(&$r, $now) {
    if ($r['phase'] === 'ask') return tv_close($r, $now);
    if (!in_array($r['phase'], ['reveal', 'twist'], true)) return ['err' => 'Niente da mandare avanti'];
    tv_advance($r, $now);
    return ['ok' => 1];
}

/** Pausa: la soluzione o l'imprevisto restano sullo schermo finche' non si riparte. */
function tv_hold(&$r, $on, $now) {
    if (!in_array($r['phase'], ['reveal', 'twist'], true)) return ['err' => 'Ora non si può mettere in pausa'];
    $r['hold'] = (bool)$on;
    if (!$r['hold']) $r['nextAt'] = round($now + 4, 3);
    return ['ok' => 1];
}

function tv_end(&$r, $now) {
    if ($r['phase'] === 'ask') tv_close($r, $now);
    if ($r['phase'] === 'lobby' || $r['phase'] === 'end') return ['err' => 'La partita non è in corso'];
    $r['phase'] = 'end';
    $r['nextAt'] = 0;
    return ['ok' => 1];
}

/** Rivincita: stessi giocatori e impostazioni, punti azzerati, domande nuove. */
function tv_rematch(&$r) {
    if ($r['phase'] !== 'end') return ['err' => 'La partita non è finita'];
    $r['phase'] = 'lobby';
    $r['plan'] = []; $r['pos'] = -1; $r['history'] = []; $r['answers'] = [];
    foreach ($r['players'] as $p) $r['scores'][$p['id']] = 0;
    return ['ok' => 1];
}

/** La domanda in corso come la vede chi chiede: la risposta giusta solo a domanda chiusa. */
function tv_public_q($r, $withAnswer) {
    $slot = $r['plan'][$r['pos']] ?? null;
    if (!$slot) return null;
    $q = ['n' => $r['pos'] + 1, 'round' => $slot['round'], 'k' => $slot['k'], 'mode' => $slot['mode'],
        'testo' => $slot['q']['testo'], 'opzioni' => $slot['q']['opzioni'], 'tema' => $slot['q']['tema'], 'difficolta' => (int)$slot['q']['difficolta']];
    if ($withAnswer) $q['giusta'] = (int)$slot['q']['giusta'];
    return $q;
}

/** Cosa vede chi chiede: niente gettoni, niente piano, niente risposte altrui durante la domanda. */
function tv_public($r, $me, $isHost, $now) {
    $players = [];
    foreach ($r['players'] as $p) {
        $players[] = ['id' => $p['id'], 'name' => $p['name'], 'color' => $p['color'], 'score' => $r['scores'][$p['id']] ?? 0,
            'online' => tv_online($r, $p, $now), 'done' => $r['phase'] === 'ask' && isset($r['answers'][$p['id']])];
    }
    $out = [
        'v' => $r['v'], 'code' => $r['code'], 'now' => round($now, 3), 'phase' => $r['phase'], 'opts' => $r['opts'],
        'themes' => $r['themes'], 'players' => $players, 'captain' => tv_captain($r), 'me' => $me, 'host' => $isHost,
        'total' => count($r['plan']), 'rounds' => $r['opts']['rounds'], 'pos' => $r['pos'],
        'startAt' => $r['startAt'], 'deadline' => $r['deadline'], 'nextAt' => $r['nextAt'], 'hold' => $r['hold'], 'games' => $r['games'],
    ];
    if ($r['phase'] === 'ask') {
        $out['q'] = tv_public_q($r, false);
        $out['answered'] = count($r['answers']);
        $out['mine'] = $me !== '' && isset($r['answers'][$me]) ? $r['answers'][$me]['c'] : -1;
    }
    if ($r['phase'] === 'reveal') {
        $out['q'] = tv_public_q($r, true);
        $out['last'] = end($r['history']) ?: null;
    }
    if ($r['phase'] === 'twist') {
        $next = $r['plan'][$r['pos'] + 1] ?? null;
        $out['twist'] = $next ? $next['mode'] : '';
        $out['twistRound'] = $next ? $next['round'] : 0;
        $out['last'] = end($r['history']) ?: null;
    }
    if ($r['phase'] === 'end') $out['history'] = $r['history'];
    return $out;
}
