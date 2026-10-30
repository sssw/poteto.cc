import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('site');
const checksRoot = resolve('tests/browser');
const checksEnabled = process.argv.includes('--checks');
const statsFixture = process.argv.includes('--stats-fixture');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/stats' && statsFixture) {
      const body = await readFile(resolve('tests/fixtures/stats.json'));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(body); return;
    }
    const checks = checksEnabled && pathname.startsWith('/checks/');
    const directory = checks ? checksRoot : root;
    const relative = checks ? pathname.slice('/checks'.length) : pathname;
    const path = resolve(directory, '.' + relative.replace(/\/$/, '/index.html'));
    if (!path.startsWith(directory + sep)) throw new Error('Invalid path');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'text/plain', 'Cache-Control':'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
