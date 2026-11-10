'use strict';
/* ============================================================
   Presidente · Serie A — errors.js
   Raccolta minima degli errori JS lato client: nessuna libreria di terze
   parti, solo window.onerror/unhandledrejection che salvano un log corto
   (ultimi 20) in localStorage — utile per il presidente stesso ("perché mi
   si è chiuso il gioco?") e, se il server risponde (errors.php, opzionale
   come leaderboard.php: fallisce in silenzio se il PHP non gira, es. in
   locale), un invio best-effort per farli vedere anche a chi mantiene il
   gioco. Mai un blocco per l'utente: ogni passo è avvolto in try/catch.
   Caricato per primo (vedi index.html), prima di data.js/sim.js/ui.js,
   così cattura anche eventuali errori di caricamento degli altri script.

   Cosa parte verso il server, e cosa no: messaggio, stack, file:riga e la
   versione del gioco (il "?v=" di ui.js). Dell'indirizzo della pagina solo
   origine e percorso, mai query o frammento. Nessun dato della carriera.
   Lo stesso errore si manda una volta sola per sessione (un errore che si
   ripete a ogni frame non deve diventare cento richieste), al più 5 errori
   diversi per sessione, e mai errori nati dentro estensioni del browser.
   ============================================================ */
(function () {
  var STORE_KEY = 'dsa_error_log';
  var MAX_ENTRIES = 20;
  var REPORT_ENDPOINT = 'errors.php';
  var sentThisSession = 0, MAX_SENT_PER_SESSION = 5;   // non spammare il server per un errore che si ripete a ogni frame
  var seen = {};                                       // messaggio+origine già visti in questa sessione
  var seenCount = 0;

  function readLog() {
    try { var raw = localStorage.getItem(STORE_KEY); var arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }
  function writeLog(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(-MAX_ENTRIES))); } catch (e) { /* storage piena o non disponibile: pazienza, il log resta solo in console */ }
  }

  // Versione del gioco in esecuzione: il "?v=N" con cui index.html ha caricato ui.js (o, se
  // ui.js non è ancora in pagina, questo stesso file). Serve a capire, leggendo il log, se un
  // errore viene da una versione vecchia rimasta in cache o da quella appena pubblicata.
  function clientVersion() {
    try {
      var scripts = document.getElementsByTagName('script'), found = '';
      for (var i = 0; i < scripts.length; i++) {
        var m = /(?:^|\/)(ui|errors)\.js\?(?:.*&)?v=([A-Za-z0-9.\-]{1,20})/.exec(scripts[i].src || '');
        if (m) { found = m[2]; if (m[1] === 'ui') break; }
      }
      return found;
    } catch (e) { return ''; }
  }

  function pageUrl() {
    try { return location.origin + location.pathname; } catch (e) { return ''; }
  }

  function record(entry) {
    try {
      entry.message = String(entry.message == null ? '' : entry.message).slice(0, 500);
      entry.stack = String(entry.stack == null ? '' : entry.stack).slice(0, 2000);
      entry.source = String(entry.source == null ? '' : entry.source).slice(0, 200);
      // "Script error." senza altro è un errore di uno script di un altro sito (pubblicità,
      // estensioni): il browser non dice nulla di utile, non vale né il log né l'invio.
      if (!entry.message || (entry.message === 'Script error.' && !entry.stack)) return;
      if (/^(chrome|moz|safari|safari-web)-extension:/.test(entry.source) || /-extension:\/\//.test(entry.stack)) return;
      var key = entry.message + '|' + entry.source;
      var repeat = Object.prototype.hasOwnProperty.call(seen, key);
      if (!repeat && seenCount < 200) { seen[key] = 1; seenCount++; }
      entry.ts = Date.now();
      entry.url = pageUrl();
      entry.v = clientVersion();
      entry.ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      if (!repeat) {
        var log = readLog();
        log.push(entry);
        writeLog(log);
        maybeReport(entry);
      }
    } catch (e) { /* il logger stesso non deve MAI far fallire altro codice */ }
  }

  // Invio best-effort al server: come submitToLeaderboard (ui.js), fallisce in silenzio se
  // il PHP non risponde (es. sviluppo locale senza server PHP) — non è mai bloccante e non
  // mostra mai un errore all'utente per un errore di rete nel logger di errori stesso.
  function maybeReport(entry) {
    if (typeof fetch !== 'function' || sentThisSession >= MAX_SENT_PER_SESSION) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    sentThisSession++;
    try {
      fetch(REPORT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'same-origin',
        body: JSON.stringify({ message: entry.message, stack: entry.stack, url: entry.url, source: entry.source, v: entry.v }),
      }).catch(function () {});
    } catch (e) {}
  }

  window.addEventListener('error', function (ev) {
    // Un evento 'error' senza messaggio è il caricamento fallito di una risorsa (immagine,
    // script): non arriva fin qui (non risale la pagina), ma per sicurezza non lo si registra.
    if (!ev || (!ev.message && !ev.error)) return;
    record({ message: ev.message || (ev.error && ev.error.message), source: (ev.filename || '') + ':' + (ev.lineno || '') + ':' + (ev.colno || ''), stack: ev.error && ev.error.stack });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    record({ message: 'Promise non gestita: ' + (reason && reason.message ? reason.message : String(reason)), stack: reason && reason.stack, source: 'unhandledrejection' });
  });

  // Esposto per debug manuale dalla console (es. supporto remoto: "apri la console e scrivi
  // DynErrorLog.dump()") e per un'eventuale futura voce "Segnala un problema" in UI.
  window.DynErrorLog = {
    dump: function () { return readLog(); },
    clear: function () { try { localStorage.removeItem(STORE_KEY); } catch (e) {} },
  };
})();
