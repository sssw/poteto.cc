import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { handleStats, validateBatch, allowBurst } from '../server/stats.js';

const schema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
const origin = 'https://poteto.cc';
const epoch = Date.UTC(2026, 9, 30, 12);
const secret = 'test-only-secret-never-return';
const run = score => ({ score, ms: Math.max(1000, score * 500) });
const payload = (scores = [0, 6, 20]) => ({ player: randomUUID(), batch: randomUUID(), token: 'test-proof', runs: scores.map(run) });
let ipSequence = 0;
function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(schema); t.after(() => db.close());
  const queries = [], bindings = [], outgoing = [], waits = [];
  const env = { TURNSTILE_SITE_KEY: 'test-public-key', TURNSTILE_SECRET: secret, STATS_DB: {
    prepare(sql) {
      queries.push(sql);
      return {
        first: async () => db.prepare(sql).get(),
        bind(...values) { bindings.push(values); return { run: async () => ({ meta: db.prepare(sql).run(...values) }) }; },
      };
    },
  } };
  const body = payload();
  let now = epoch;
  let proof = { success: true, hostname: 'poteto.cc', action: 'stats', cdata: body.batch };
  let status = 200;
  const request = ({ url = origin + '/api/stats/submit', method = 'POST', value = body, text, headers = {} } = {}) =>
    new Request(url, { method, headers: { origin, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin',
      'CF-Connecting-IP': `192.0.2.${++ipSequence}`, ...headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: text ?? JSON.stringify(value) }) });
  const call = async (req = request(), overrides = {}) => {
    const result = await handleStats({ request: req, env, waitUntil: promise => waits.push(promise) }, {
      now: () => now, fetch: async (url, options) => {
        outgoing.push({ url, options }); return new Response(JSON.stringify(proof), { status });
      }, ...overrides,
    });
    await Promise.all(waits.splice(0)); return result;
  };
  return { db, env, queries, bindings, outgoing, body, request, call,
    setProof: value => { proof = value; }, setStatus: value => { status = value; }, setNow: value => { now = value; } };
}

test('score buckets include every boundary exactly once', () => {
  const data = payload([0, 4, 5, 9, 10, 19, 20, 39, 40, 79, 80, 159, 160, 319, 320, 100000]);
  const result = validateBatch(data);
  assert.deepEqual(result.bins, [2, 2, 2, 2, 2, 2, 2, 2]);
  assert.equal(result.count, 16);
});

test('invalid identifiers, oversized batches and implausible scores are rejected', () => {
  const data = payload([1]);
  for (const change of [
    { player: 'x' }, { batch: 'x' }, { token: '' }, { token: 'x'.repeat(2049) },
    { runs: [] }, { runs: Array(21).fill(run(1)) }, { runs: '1' },
    ...[null, { score: -1, ms: 1000 }, { score: 1.2, ms: 1000 }, { score: 100001, ms: 86400000 },
      { score: '1', ms: 1000 }, { score: 3, ms: 299 }, { score: 3, ms: 1000.2 },
      { score: 10, ms: 300 }, { score: 1, ms: 86400001 }, { score: NaN, ms: 1000 }].map(value => ({ runs: [value] })),
  ]) assert.equal(validateBatch({ ...data, ...change }), null, JSON.stringify(change));
  assert.equal(validateBatch(null), null);
  assert.equal(validateBatch({ ...data, runs: [{ score: 1, ms: 86400000 }, run(1)] }), null);
  assert.ok(validateBatch({ ...data, runs: Array(20).fill(run(1)) }));
});

test('burst shield accepts six attempts per minute and resets at the boundary', () => {
  const key = randomUUID();
  for (let i = 0; i < 6; i++) assert.equal(allowBurst(key, epoch + i), true);
  assert.equal(allowBurst(key, epoch + 59999), false);
  assert.equal(allowBurst(key, epoch + 60000), true);
  for (let i = 0; i < 2100; i++) assert.equal(allowBurst(randomUUID(), epoch), true);
});

test('valid submission writes only hashed identity and aggregated bins, then deletes transient input', async t => {
  const f = fixture(t), response = await f.call();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(f.bindings[0][1], /^[a-f0-9]{64}$/);
  assert.match(f.bindings[0][2], /^ip:[a-f0-9]{64}$/);
  assert.equal(f.outgoing[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const proofBody = JSON.parse(f.outgoing[0].options.body);
  assert.deepEqual(proofBody, { secret, response: f.body.token });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 0);
  assert.equal(f.db.prepare('SELECT runs FROM totals').get().runs, 3);
  const rows = JSON.stringify({ players: f.db.prepare('SELECT * FROM players').all(), limits: f.db.prepare('SELECT * FROM limits').all() });
  assert.ok(!rows.includes(f.body.player) && !rows.includes(secret) && !rows.includes('192.0.2.'));
});

for (const [label, options, status] of [
  ['foreign hostname', { url: 'https://preview.pages.dev/api/stats/submit' }, 404],
  ['plain HTTP', { url: 'http://poteto.cc/api/stats/submit' }, 404],
  ['query cache busting', { url: origin + '/api/stats?x=1', method: 'GET' }, 404],
  ['unknown endpoint', { url: origin + '/api/stats/other' }, 404],
  ['unsupported method', { method: 'PUT' }, 405],
  ['write to read endpoint', { url: origin + '/api/stats' }, 405],
  ['read from write endpoint', { method: 'GET' }, 405],
  ['cross-origin request', { headers: { origin: 'https://example.org' } }, 403],
  ['cross-site browser request', { headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
  ['form request', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 403],
  ['missing IP', { headers: { 'CF-Connecting-IP': '' } }, 429],
  ['bad JSON', { text: '{' }, 400],
  ['oversized declared body', { headers: { 'Content-Length': '8193' } }, 400],
  ['oversized streamed body', { text: ' '.repeat(8193) }, 400],
  ['malformed values', { value: { token: 'x' } }, 400],
]) test(`statistics rejects ${label} before database access or external verification`, async t => {
  const f = fixture(t), response = await f.call(f.request(options));
  assert.equal(response.status, status);
  assert.equal(f.queries.length, 0); assert.equal(f.outgoing.length, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

for (const [label, change] of [
  ['failed token', { success: false }], ['wrong hostname', { hostname: 'example.org' }],
  ['wrong action', { action: 'login' }], ['wrong batch', { cdata: randomUUID() }],
]) test(`statistics rejects ${label} without a write`, async t => {
  const f = fixture(t);
  f.setProof({ success: true, hostname: 'poteto.cc', action: 'stats', cdata: f.body.batch, ...change });
  const response = await f.call();
  assert.equal(response.status, 403); assert.equal(f.bindings.length, 0);
});

test('failed verification transport and database errors have private, non-cacheable responses', async t => {
  const f = fixture(t);
  const response = await f.call(undefined, { fetch: async () => { throw Error(secret + ' private details'); } });
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { available: false });
  assert.equal(f.bindings.length, 0);
  f.env.STATS_DB.prepare = () => { throw Error('private database path'); };
  const read = await f.call(f.request({ method: 'GET', url: origin + '/api/stats' }));
  assert.equal(read.status, 503); assert.deepEqual(await read.json(), { available: false });
});

test('unsuccessful verification HTTP status does not accept a success-shaped body', async t => {
  const f = fixture(t); f.setStatus(500);
  assert.equal((await f.call()).status, 403); assert.equal(f.bindings.length, 0);
});

test('configuration missing secrets fails closed only for statistics', async t => {
  const f = fixture(t); delete f.env.TURNSTILE_SECRET;
  const response = await f.call();
  assert.equal(response.status, 503); assert.equal(f.outgoing.length, 0); assert.equal(f.queries.length, 0);
});

test('duplicate verified batch cannot increment totals twice', async t => {
  const f = fixture(t);
  assert.equal((await f.call()).status, 200);
  f.setNow(epoch + 60001);
  const response = await f.call();
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '3600');
  assert.equal(f.db.prepare('SELECT runs FROM totals').get().runs, 3);
});

test('concurrent submissions for one browser atomically accept at most one batch', async t => {
  const f = fixture(t);
  const results = await Promise.all(Array.from({ length: 5 }, () => f.call()));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429, 429, 429, 429]);
  assert.equal(f.db.prepare('SELECT runs FROM totals').get().runs, 3);
});

test('public snapshot reads one aggregate row, contains no identities and caches for fifteen minutes', async t => {
  const f = fixture(t), keys = [], put = [];
  const cache = { match: async key => { keys.push(key.url); }, put: async (key, value) => { put.push({ url: key.url, value }); } };
  const response = await f.call(f.request({ method: 'GET', url: origin + '/api/stats' }), { cache });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=900, s-maxage=900');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), { players: 0, runs: 0, bins: Array(8).fill(0), updatedAt: new Date(epoch).toISOString(), sitekey: 'test-public-key' });
  assert.deepEqual(keys, [origin + '/api/stats']); assert.equal(put[0].url, origin + '/api/stats');
  assert.equal(f.queries.length, 1); assert.equal(f.outgoing.length, 0);
  const cached = await f.call(f.request({ method: 'GET', url: origin + '/api/stats' }), { cache: { match: async () => put[0].value.clone() } });
  assert.equal(cached.status, 200); assert.equal(f.queries.length, 1);
});

test('IP rate-limit keys rotate daily while anonymous browser deduplication stays stable', async t => {
  const f = fixture(t), sameIP = { 'CF-Connecting-IP': '198.51.100.47' };
  assert.equal((await f.call(f.request({ headers: sameIP }))).status, 200);
  f.body.batch = randomUUID(); f.setProof({ success: true, hostname: 'poteto.cc', action: 'stats', cdata: f.body.batch });
  f.setNow(epoch + 86400000);
  assert.equal((await f.call(f.request({ headers: sameIP }))).status, 200);
  assert.equal(f.bindings[0][1], f.bindings[1][1]); assert.notEqual(f.bindings[0][2], f.bindings[1][2]);
  assert.equal(f.db.prepare('SELECT players FROM totals').get().players, 1);
});
