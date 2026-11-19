#!/usr/bin/env node
// CiteCheck web demo API: GET /api/advisory/status, POST /api/advisory/check. Binds to 127.0.0.1 or a private docker network only.
// It never logs request bodies, keys or IP addresses.
import http from 'node:http';
import { createAdvisory, createRateLimiter, LIMITS } from './advisory.mjs';

export function clientIp(req) {
  // Behind the Cloudflare tunnel, CF-Connecting-IP is set by Cloudflare. Nginx forwards it as X-Real-IP.
  const h = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'];
  return (typeof h === 'string' && h.length < 64 ? h : req.socket.remoteAddress) || 'unknown';
}

export function createApiServer({ env = process.env, corpus, fetchImpl, now } = {}) {
  const limiter = createRateLimiter({ dailyCap: Number(env.ADVISORY_DAILY_CAP) || LIMITS.dailyCap, now });
  const adv = createAdvisory({ env, corpus, limiter, fetchImpl, log: (m) => console.log(m) });
  const send = (res, { status, json }) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(json)); };
  return http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (req.method === 'GET' && (p === '/api/advisory/status' || p === '/api/health')) return send(res, adv.status());
    if (req.method === 'POST' && p === '/api/advisory/check') {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 8192) { req.destroy(); } else chunks.push(c); });
      req.on('end', async () => {
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = null; }
        send(res, await adv.check(body, clientIp(req)));
      });
      return;
    }
    send(res, { status: 404, json: { error: 'NOT_FOUND' } });
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { corpus } = await import('../dist/core/index.js').catch(() => import('../../src/core/index.js'));
  const port = Number(process.env.PORT || 8080); const host = process.env.HOST || '127.0.0.1';
  createApiServer({ corpus }).listen(port, host, () => console.log(`citecheck-api on ${host}:${port}, advisory ${process.env.ADVISORY_ENABLED === '1' ? 'switch on' : 'OFF'}`));
}
