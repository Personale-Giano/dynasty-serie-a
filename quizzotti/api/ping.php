<?php
// Prova temporanea: PHP attivo e cartella scrivibile per le stanze multigiocatore.
header('Content-Type: application/json');
$dir = __DIR__ . '/stanze';
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$ok = @file_put_contents($dir . '/_ping.json', json_encode(['t' => time()])) !== false;
echo json_encode(['php' => PHP_VERSION, 'scrive' => $ok, 'flock' => function_exists('flock')]);
