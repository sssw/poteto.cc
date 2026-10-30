const ORIGIN = 'https://poteto.cc';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const EDGES = [5, 10, 20, 40, 80, 160, 320];
const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const reply = (data, status = 200, cache = false) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cache ? 'public, max-age=900, s-maxage=900' : 'no-store',
    ...(status === 429 ? { 'Retry-After': '3600' } : {}) },
});
export function validateBatch(value) {
  if (!value || !UUID.test(value.player) || !UUID.test(value.batch) || typeof value.token !== 'string'
    || !value.token.length || value.token.length > 2048 || !Array.isArray(value.runs)
    || value.runs.length < 1 || value.runs.length > 20) return null;
  const bins = Array(8).fill(0);
  let duration = 0;
  for (const run of value.runs) {
    if (!run || !Number.isInteger(run.score) || run.score < 0 || run.score > 100000
      || !Number.isInteger(run.ms) || run.ms < 300 || run.ms > 86400000
      || run.score > Math.floor(run.ms / 400) + 2) return null;
    duration += run.ms;
    bins[EDGES.findIndex(edge => run.score < edge) < 0 ? 7 : EDGES.findIndex(edge => run.score < edge)]++;
  }
  if (duration > 86400000) return null;
  return { player: value.player, batch: value.batch, token: value.token, count: value.runs.length, bins };
}
async function smallJSON(request) {
  if (Number(request.headers.get('content-length')) > 8192) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let length = 0, pieces = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) { await reader.cancel(); throw new Error('size'); }
    pieces.push(value);
  }
  const bytes = new Uint8Array(length); let at = 0;
  for (const piece of pieces) { bytes.set(piece, at); at += piece.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
// A bounded per-isolate shield avoids repeated external verification for obvious bursts.
// The database enforces the durable, global acceptance limits independently.
const bursts = new Map();
export function allowBurst(key, now = Date.now()) {
  const prior = bursts.get(key);
  if (prior && now - prior.at < 60000) {
    if (prior.count >= 6) return false;
    prior.count++; return true;
  }
  if (bursts.size >= 2048) bursts.delete(bursts.keys().next().value);
  bursts.set(key, { at: now, count: 1 }); return true;
}
export async function handleStats(context, services = {}) {
  const { request, env } = context;
  const url = new URL(request.url);
  const clock = services.now || Date.now;
  const fetcher = services.fetch || fetch;
  const cache = services.cache || globalThis.caches?.default;
  try {
    if (url.origin !== ORIGIN) return reply({ available: false }, 404);
    if (url.search || !['/api/stats', '/api/stats/submit'].includes(url.pathname)) return reply({ available: false }, 404);
    if (request.method === 'GET' && url.pathname === '/api/stats') {
      if (!env.STATS_DB) return reply({ available: false }, 503);
      const key = new Request(ORIGIN + '/api/stats');
      const hit = await cache?.match(key);
      if (hit) return hit;
      const row = await env.STATS_DB.prepare('SELECT * FROM totals WHERE id=1').first();
      if (!row) return reply({ available: false }, 503);
      const result = reply({ players: row.players, runs: row.runs,
        bins: Array.from({length:8},(_,i)=>row['b'+i]),
        updatedAt: new Date((row.updated || Math.floor(clock()/1000))*1000).toISOString(),
        sitekey: env.TURNSTILE_SITE_KEY || null }, 200, true);
      if (cache) context.waitUntil(cache.put(key, result.clone()));
      return result;
    }
    if (request.method !== 'POST' || url.pathname !== '/api/stats/submit') return reply({ available: false }, 405);
    if (request.headers.get('origin') !== ORIGIN
      || !['same-origin', null].includes(request.headers.get('sec-fetch-site'))
      || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return reply({ accepted: false }, 403);
    if (!env.STATS_DB || !env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY) return reply({ accepted: false }, 503);
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || !allowBurst(ip, clock())) return reply({ accepted: false }, 429);
    let batch;
    try { batch = validateBatch(await smallJSON(request)); } catch { /* Invalid bodies never reach storage. */ }
    if (!batch) return reply({ accepted: false }, 400);
    const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: batch.token }),
      signal: AbortSignal.timeout(5000),
    });
    const proof = await verification.json();
    if (!verification.ok || !proof.success || proof.hostname !== 'poteto.cc' || proof.action !== 'stats'
      || proof.cdata !== batch.batch) return reply({ accepted: false }, 403);
    const now = Math.floor(clock()/1000), day = Math.floor(now/86400);
    const player = hex(await crypto.subtle.digest('SHA-256', enc.encode('poteto-player:' + batch.player)));
    const key = await crypto.subtle.importKey('raw', enc.encode(env.TURNSTILE_SECRET), {name:'HMAC',hash:'SHA-256'},false,['sign']);
    const ipKey = 'ip:' + hex(await crypto.subtle.sign('HMAC', key, enc.encode(day + ':' + ip)));
    const result = await env.STATS_DB.prepare(
      'INSERT OR IGNORE INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(batch.batch,player,ipKey,day,now,batch.count,...batch.bins).run();
    // Triggers atomically apply totals, deduplicate the latest batch, and remove the transient row.
    return reply({ accepted: result.meta.changes > 0 }, result.meta.changes > 0 ? 200 : 429);
  } catch {
    // No request bodies, tokens, IP addresses, or database errors are returned or logged.
    return reply({ available: false }, 503);
  }
}
