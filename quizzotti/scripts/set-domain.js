#!/usr/bin/env node
/* ==========================================================================
   QUIZZOTTI — Imposta il dominio di produzione
   sitemap.xml, robots.txt e i meta Open Graph (og:image, og:url) richiedono
   URL assoluti con un dominio reale, che questo progetto non conosce
   finche' non viene pubblicato. Questo script li imposta tutti in un solo
   comando (si puo' rilanciare: aggiorna gli og:url gia' presenti).

   Uso: node scripts/set-domain.js https://iltuodominio.it
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLACEHOLDER = 'https://SOSTITUISCI-CON-IL-TUO-DOMINIO.it';

const domain = process.argv[2];
if (!domain) {
    console.error('Uso: node scripts/set-domain.js https://iltuodominio.it');
    process.exit(1);
}
if (!/^https?:\/\/[^/]+$/.test(domain)) {
    console.error('Il dominio deve essere un URL assoluto senza percorso finale, es: https://iltuodominio.it');
    process.exit(1);
}

['sitemap.xml', 'robots.txt'].forEach((file) => {
    const filePath = path.join(ROOT, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const count = (content.match(new RegExp(PLACEHOLDER, 'g')) || []).length;
    content = content.split(PLACEHOLDER).join(domain);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(file + ': sostituite ' + count + ' occorrenze del placeholder con ' + domain);
});

// Open Graph: i social vogliono URL assoluti per og:image e og:url
fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).forEach((file) => {
    const filePath = path.join(ROOT, file);
    let html = fs.readFileSync(filePath, 'utf8');
    const pageUrl = domain + '/' + file;
    html = html.replace(/<meta property="og:image" content="(?:https?:\/\/[^"]*\/)?([^"/]+)">/, (m, img) => '<meta property="og:image" content="' + domain + '/' + img + '">');
    if (/<meta property="og:url" content="[^"]*">/.test(html)) {
        html = html.replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + pageUrl + '">');
    } else {
        html = html.replace(/(<meta property="og:type" content="website">)/, '$1\n<meta property="og:url" content="' + pageUrl + '">');
    }
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(file + ': og:image e og:url assoluti su ' + domain);
});
