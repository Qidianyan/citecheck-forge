#!/usr/bin/env node
// Tiny static server for web/dist. Binds to 127.0.0.1 by default; refuses path traversal.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

export function createServer(root) {
  const base = path.resolve(root);
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('bad request'); return; }
    if (p.includes('\0') || p.split('/').includes('..')) { res.writeHead(403).end('forbidden'); return; }
    let file = path.resolve(base, '.' + p);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403).end('forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || path.basename(file).startsWith('.')) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const port = Number(arg('--port', 8787)); const host = arg('--host', '127.0.0.1');
  const root = arg('--root', path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist'));
  createServer(root).listen(port, host, () => console.log(`CiteCheck web: http://${host}:${port}/  (root ${root})`));
}
