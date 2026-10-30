import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStats, validSnapshot } from '../site/stats.js';

const KEY = 'poteto:stats';
const epoch = Date.UTC(2026, 9, 30, 12);
const snapshot = () => ({ players: 2, runs: 4, bins: [2,1,1,0,0,0,0,0], updatedAt: new Date(epoch).toISOString(), sitekey: 'test-public-key' });
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes.push([key,value]); values.set(key,value); },
    removeItem: key => values.delete(key) };
}
function fixture(t, options = {}) {
  const scheduled = [], cancelled = [], fetched = [], verified = [], rendered = [], statuses = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const timer = { callback,delay }; scheduled.push(timer); return timer; });
  t.mock.method(globalThis, 'clearTimeout', timer => cancelled.push(timer));
  let now = epoch;
  const storage = options.storage ?? memoryStorage();
  const view = { render: (...args) => rendered.push(args), setStatus: value => statuses.push(value) };
  const stats = new GameStats({ storage, view, now: () => now,
    fetcher: async (url, init) => { fetched.push({ url,init }); return new Response(JSON.stringify(url === '/api/stats' ? snapshot() : { accepted: true })); },
    verify: async (...args) => { verified.push(args); return 'test-proof'; }, ...options });
  t.after(() => stats.destroy());
  return { stats, storage, scheduled, cancelled, fetched, verified, rendered, statuses, setNow: value => { now = value; } };
}

test('cached snapshots must have safe nonnegative counts and a complete consistent histogram', () => {
  assert.ok(validSnapshot(snapshot()));
  for (const patch of [{ players: -1 }, { players: 5 }, { runs: '4' }, { runs: Infinity },
    { bins: [4] }, { bins: [2,1,0,0,0,0,0,0] }, { bins: [3,1,-1,1,0,0,0,0] },
    { updatedAt: 'invalid' }]) assert.ok(!validSnapshot({ ...snapshot(), ...patch }));
});

test('completed games only queue data; one delayed upload batches at most twenty games', async t => {
  const f = fixture(t); f.stats.snapshot = snapshot();
  for (let i = 0; i < 30; i++) f.stats.completed(i, 30000);
  assert.equal(f.fetched.length, 0); assert.equal(f.verified.length, 0);
  assert.equal(f.scheduled.length, 1); assert.equal(f.scheduled[0].delay, 1500);
  assert.equal(f.stats.queue.length, 20);
  await f.stats.flush();
  assert.equal(f.verified.length, 1); assert.equal(f.fetched.length, 1);
  assert.equal(f.fetched[0].url, '/api/stats/submit');
  const body = JSON.parse(f.fetched[0].init.body);
  assert.equal(body.runs.length, 20); assert.equal(body.runs[19].score, 19);
  assert.equal(body.batch, f.verified[0][1]); assert.equal(body.token, 'test-proof');
  assert.equal(f.fetched[0].init.credentials, 'omit');
  assert.equal(f.stats.queue.length, 0);
});

test('successful uploads wait sixty-two seconds after the response without losing the following batch', async t => {
  const f = fixture(t); f.stats.snapshot = snapshot();
  f.stats.completed(1,1000); await f.stats.flush();
  f.stats.completed(2,2000); f.setNow(epoch + 61999); await f.stats.flush();
  assert.equal(f.fetched.length, 1); assert.equal(f.stats.queue.length, 1);
  f.setNow(epoch + 62000); await f.stats.flush();
  assert.equal(f.fetched.length, 2); assert.equal(JSON.parse(f.fetched[1].init.body).runs[0].score, 2);
});

test('a failed write is discarded, never replayed, and starts a one-hour cooldown', async t => {
  const calls = [];
  const f = fixture(t, { fetcher: async (url, init) => { calls.push(JSON.parse(init.body)); throw Error('connection ended'); } });
  f.stats.snapshot = snapshot(); f.stats.completed(1,1000); await f.stats.flush();
  assert.equal(calls.length, 1); assert.equal(f.stats.queue.length, 0);
  assert.equal(f.stats.nextWrite, epoch + 3600000);
  await f.stats.flush(); assert.equal(calls.length, 1);
  f.stats.completed(2,2000); f.setNow(epoch + 3599999); await f.stats.flush(); assert.equal(calls.length, 1);
  f.setNow(epoch + 3600000); await f.stats.flush();
  assert.equal(calls.length, 2); assert.notEqual(calls[0].batch, calls[1].batch);
  assert.deepEqual(calls[1].runs, [{ score: 2,ms: 2000 }]);
});

test('a rejected verification does not call the statistics write endpoint', async t => {
  const f = fixture(t, { verify: async () => null });
  f.stats.snapshot = snapshot(); f.stats.completed(1,1000); await f.stats.flush();
  assert.equal(f.fetched.length, 0); assert.equal(f.stats.queue.length, 0);
  assert.equal(f.stats.nextWrite, epoch + 3600000);
});

test('HTTP refusal gets the same cooldown and does not retry its batch', async t => {
  let count = 0;
  const f = fixture(t, { fetcher: async () => { count++; return new Response('{}',{ status: 429 }); } });
  f.stats.snapshot = snapshot(); f.stats.completed(1,1000); await f.stats.flush(); await f.stats.flush();
  assert.equal(count, 1); assert.equal(f.stats.nextWrite, epoch + 3600000);
});

test('blocked browser storage cannot interrupt queueing, uploading or disabling statistics', async t => {
  const denied = () => { throw Error('storage disabled'); };
  const f = fixture(t, { storage: { getItem: denied,setItem: denied,removeItem: denied } });
  f.stats.snapshot = snapshot(); f.stats.completed(1,1000); await f.stats.flush();
  assert.equal(f.fetched.length, 1);
  assert.doesNotThrow(() => f.stats.setEnabled(false));
  assert.equal(f.stats.enabled, false);
});

test('an inaccessible localStorage getter is contained by the default constructor', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{ configurable: true,get() { throw Error('not permitted'); } });
  t.after(() => { if(descriptor) Object.defineProperty(globalThis,'localStorage',descriptor); else delete globalThis.localStorage; });
  assert.doesNotThrow(() => { const stats = new GameStats({ enabled: false }); stats.destroy(); });
});

test('starting opted out stores no identifier and never verifies or uploads a game', async t => {
  const f = fixture(t, { enabled: false }); f.stats.snapshot = snapshot();
  f.stats.completed(1,1000); await f.stats.flush();
  assert.equal(f.storage.writes.length, 0); assert.equal(f.verified.length, 0); assert.equal(f.fetched.length, 0);
  assert.equal(f.scheduled.length, 0);
});

test('opting out clears queued games, cancels pending work and removes the stored identifier', async t => {
  const f = fixture(t); f.stats.snapshot = snapshot(); f.stats.completed(1,1000);
  assert.ok(f.storage.values.has(KEY + ':player'));
  f.stats.setEnabled(false); await f.stats.flush();
  assert.equal(f.stats.queue.length, 0); assert.equal(f.stats.timer, null);
  assert.ok(f.cancelled.includes(f.scheduled[0])); assert.ok(!f.storage.values.has(KEY + ':player'));
  assert.equal(f.fetched.length, 0);
});

test('opting out while verification is pending aborts it and prevents an upload', async t => {
  let signal, finish;
  const f = fixture(t, { verify: async (_key,_batch,received) => { signal = received; return new Promise(resolve => { finish = resolve; }); } });
  f.stats.snapshot = snapshot(); f.stats.completed(1,1000);
  const work = f.stats.flush(); assert.equal(signal.aborted,false);
  f.stats.setEnabled(false); assert.equal(signal.aborted,true);
  finish('a-result-arriving-too-late'); await work;
  assert.equal(f.fetched.length,0); assert.equal(f.stats.busy,false); assert.equal(f.stats.queue.length,0);
});

test('overlapping flush calls share one in-flight verification and request', async t => {
  let finish, checks = 0;
  const f = fixture(t, { verify: async () => { checks++; return new Promise(resolve => { finish = resolve; }); } });
  f.stats.snapshot = snapshot(); f.stats.completed(1,1000);
  const first = f.stats.flush(); await f.stats.flush();
  assert.equal(checks,1); finish('test-proof'); await first;
  assert.equal(f.fetched.length,1);
});

test('browser tabs sharing storage observe each other’s upload cooldown', async t => {
  const f = fixture(t), secondCalls = [];
  f.stats.snapshot = snapshot();
  const second = new GameStats({ storage: f.storage, now: () => epoch,
    verify: async () => 'test-proof', fetcher: async (...args) => { secondCalls.push(args); return new Response('{}'); } });
  t.after(() => second.destroy()); second.snapshot = snapshot();
  assert.equal(second.player,f.stats.player);
  f.stats.completed(1,1000); await f.stats.flush();
  second.completed(2,2000); await second.flush();
  assert.equal(secondCalls.length,0); assert.equal(second.queue.length,1);
});

test('a fresh snapshot is reused across page loads for fifteen minutes', async t => {
  const storage = memoryStorage({ [KEY + ':snapshot']: JSON.stringify({ data: snapshot(),at: epoch - 899999 }) });
  const f = fixture(t,{ storage });
  await f.stats.refresh(); assert.equal(f.fetched.length,0);
  assert.equal(f.rendered.length,1); assert.deepEqual(f.rendered[0][1],{ stale: false });
  f.setNow(epoch + 1); await f.stats.refresh(); assert.equal(f.fetched.length,1);
});

test('snapshot refreshes are deduplicated and not polled after success', async t => {
  let resolve, count = 0;
  const f = fixture(t,{ fetcher: async () => { count++; return new Promise(done => { resolve = done; }); } });
  const first = f.stats.refresh(); await f.stats.refresh(); assert.equal(count,1);
  resolve(new Response(JSON.stringify(snapshot()))); await first;
  f.setNow(epoch + 899999); await f.stats.refresh(); assert.equal(count,1);
  assert.equal(f.scheduled.length,0);
});

test('an unavailable read keeps the last known snapshot and labels it stale', async t => {
  const storage = memoryStorage({ [KEY + ':snapshot']: JSON.stringify({ data: snapshot(),at: epoch - 900001 }) });
  const f = fixture(t,{ storage,fetcher: async () => { throw Error('offline'); } });
  await f.stats.refresh();
  assert.deepEqual(f.rendered.at(-1),[snapshot(),{ stale: true }]); assert.equal(f.statuses.length,0);
});

test('unavailable or malformed reads do not fabricate zero counts or retry rapidly', async t => {
  let calls = 0;
  const f = fixture(t,{ fetcher: async () => { calls++; return new Response(JSON.stringify({ ...snapshot(),runs: 500 })); } });
  await f.stats.refresh(); await f.stats.refresh();
  assert.equal(calls,1); assert.deepEqual(f.statuses,['unavailable']); assert.equal(f.rendered.length,0);
});

test('missing verification configuration preserves the queue without spinning timers or fetching automatically', async t => {
  const f = fixture(t); f.stats.completed(1,1000);
  assert.equal(f.scheduled.length,1);
  f.scheduled[0].callback();
  await f.stats.flush(); await f.stats.flush();
  assert.equal(f.stats.queue.length,1); assert.equal(f.stats.timer,null);
  assert.equal(f.scheduled.length,1); assert.equal(f.verified.length,0); assert.equal(f.fetched.length,0);
});

test('hidden pages do not start verification or submission', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{ configurable: true,value: { hidden: true } });
  t.after(() => { if(descriptor) Object.defineProperty(globalThis,'document',descriptor); else delete globalThis.document; });
  const f = fixture(t); f.stats.snapshot = snapshot(); f.stats.completed(1,1000); await f.stats.flush();
  assert.equal(f.verified.length,0); assert.equal(f.fetched.length,0);
});

test('destroying a page during verification aborts work, clears its queue and prevents new timers', async t => {
  let finish, signal;
  const f = fixture(t,{ verify: async (_key,_batch,received) => { signal=received; return new Promise(resolve => { finish=resolve; }); } });
  f.stats.snapshot=snapshot(); f.stats.completed(1,1000);
  const work=f.stats.flush(); f.stats.completed(2,2000);
  const scheduledBefore=f.scheduled.length;
  f.stats.destroy(); assert.equal(signal.aborted,true);
  assert.equal(f.stats.queue.length,0); assert.equal(f.stats.timer,null);
  finish('late-verification-result'); await work;
  f.stats.completed(3,3000); await f.stats.flush();
  assert.equal(f.fetched.length,0); assert.equal(f.stats.queue.length,0);
  assert.equal(f.scheduled.length,scheduledBefore);
});

test('restoring a suspended page enables new optional uploads without reviving discarded games', async t => {
  const f=fixture(t); f.stats.snapshot=snapshot(); f.stats.completed(1,1000);
  f.stats.destroy(); f.stats.resume(); f.stats.completed(2,2000); await f.stats.flush();
  assert.equal(f.fetched.length,1);
  assert.deepEqual(JSON.parse(f.fetched[0].init.body).runs,[{score:2,ms:2000}]);
});

test('destroying during an upload aborts the fetch signal and does not replay the ambiguous batch', async t => {
  let signal, reject, requests=0;
  const f=fixture(t,{ fetcher: async (_url,init) => {
    requests++; signal=init.signal;
    return new Promise((_resolve,fail) => { reject=fail; signal.addEventListener('abort',()=>fail(Error('aborted')),{once:true}); });
  } });
  f.stats.snapshot=snapshot(); f.stats.completed(1,1000);
  const work=f.stats.flush(); await Promise.resolve();
  assert.equal(signal.aborted,false); f.stats.destroy(); assert.equal(signal.aborted,true);
  await work; f.stats.resume(); await f.stats.flush();
  assert.equal(requests,1); assert.equal(f.stats.queue.length,0);
});

test('invalid completed-game values never poison a valid batch', async t => {
  const f=fixture(t); f.stats.snapshot=snapshot();
  for(const [score,ms] of [[1,NaN],[1,Infinity],[1,-Infinity],[1,299],[1,86400001],
    [-1,1000],[1.5,1000],[NaN,1000],[Infinity,1000],[100001,86400000],[100,400]]) f.stats.completed(score,ms);
  assert.equal(f.stats.queue.length,0); assert.equal(f.scheduled.length,0);
  f.stats.completed(1,1000.4); await f.stats.flush();
  assert.deepEqual(JSON.parse(f.fetched[0].init.body).runs,[{score:1,ms:1000}]);
});

test('disable then re-enable cannot accept an old verification after its controller was aborted', async t => {
  let finish;
  const f=fixture(t,{ verify: async ()=>new Promise(resolve=>{finish=resolve;}) });
  f.stats.snapshot=snapshot(); f.stats.completed(1,1000); const work=f.stats.flush();
  f.stats.setEnabled(false); f.stats.setEnabled(true); finish('late-proof'); await work;
  assert.equal(f.fetched.length,0); assert.equal(f.stats.queue.length,0);
});

test('slow verification followed by fast verification still leaves a full minute between server submissions', async t => {
  let checks=0, now=epoch;
  const submitted=[];
  const f=fixture(t,{ now:()=>now,
    verify:async()=>{ if(checks++===0) now+=10000; return 'test-proof'; },
    fetcher:async()=>{ submitted.push(now); now+=1000; return new Response('{"accepted":true}'); },
  });
  f.stats.snapshot=snapshot(); f.stats.completed(1,1000); await f.stats.flush();
  assert.deepEqual(submitted,[epoch+10000]);
  assert.equal(f.stats.nextWrite,epoch+73000);
  assert.equal(JSON.parse(f.storage.getItem(KEY+':nextWrite')),epoch+73000);
  f.stats.completed(2,2000);
  now=epoch+60000; await f.stats.flush(); assert.equal(submitted.length,1);
  now=epoch+72999; await f.stats.flush(); assert.equal(submitted.length,1);
  now=epoch+73000; await f.stats.flush();
  assert.equal(submitted.length,2); assert.ok(submitted[1]-submitted[0]>=62000);
});

test('the CDN Age header consumes the same fifteen-minute cache lifetime as browser storage', async t => {
  let calls=0;
  const f=fixture(t,{ fetcher:async()=>{
    calls++;
    return new Response(JSON.stringify(snapshot()),{headers:{Age:calls===1?'840':'0'}});
  } });
  await f.stats.refresh();
  assert.equal(calls,1);
  assert.equal(f.stats.fetchedAt,epoch-840000);
  assert.equal(f.stats.lastRead,epoch-840000);
  assert.equal(JSON.parse(f.storage.getItem(KEY+':snapshot')).at,epoch-840000);
  f.setNow(epoch+59000); await f.stats.refresh(); assert.equal(calls,1);
  f.setNow(epoch+60000); await f.stats.refresh(); assert.equal(calls,2);
  assert.equal(f.stats.fetchedAt,epoch+60000);
  await f.stats.refresh(); assert.equal(calls,2);
});

for (const [label,body] of [['HTML','<!doctype html><title>Poteto</title>'],['empty object','{}'],
  ['refusal','{"accepted":false}'],['string flag','{"accepted":"true"}'],['null','null']]) {
  test(`an HTTP 200 ${label} response is not treated as an accepted upload`,async t=>{
    let calls=0;
    const f=fixture(t,{fetcher:async()=>{calls++;return new Response(body,{status:200});}});
    f.stats.snapshot=snapshot(); f.stats.completed(1,1000); await f.stats.flush();
    assert.equal(f.stats.nextWrite,epoch+3600000);
    assert.equal(f.stats.queue.length,0);
    await f.stats.flush(); assert.equal(calls,1);
  });
}

test('a game completed before the initial snapshot arrives is uploaded after configuration becomes available',async t=>{
  let finishRead;
  const calls=[];
  const f=fixture(t,{fetcher:async(url,init)=>{
    calls.push({url,init});
    if(url==='/api/stats') return new Promise(resolve=>{finishRead=resolve;});
    return new Response('{"accepted":true}');
  }});
  const loading=f.stats.refresh();
  f.stats.completed(1,1000); f.scheduled[0].callback();
  assert.equal(f.stats.queue.length,1); assert.equal(f.stats.timer,null);
  assert.equal(calls.length,1); assert.equal(f.verified.length,0);
  finishRead(new Response(JSON.stringify(snapshot()))); await loading;
  assert.equal(f.scheduled.length,2); assert.equal(f.scheduled[1].delay,1500);
  assert.equal(calls.length,1);
  await f.stats.flush();
  assert.equal(calls.length,2); assert.equal(calls[1].url,'/api/stats/submit');
  assert.deepEqual(JSON.parse(calls[1].init.body).runs,[{score:1,ms:1000}]);
});

test('an unavailable initial read is retried only by a later explicit refresh after fifteen minutes',async t=>{
  let reads=0;
  const f=fixture(t,{fetcher:async()=>{
    reads++;
    if(reads===1) throw Error('offline');
    return new Response(JSON.stringify(snapshot()));
  }});
  await f.stats.refresh(); f.stats.completed(1,1000); f.scheduled[0].callback();
  assert.equal(reads,1); assert.equal(f.stats.timer,null); assert.equal(f.stats.queue.length,1);
  f.setNow(epoch+899999); await f.stats.refresh(); assert.equal(reads,1);
  f.setNow(epoch+900000); await f.stats.refresh();
  assert.equal(reads,2); assert.equal(f.scheduled.length,2); assert.equal(f.stats.queue.length,1);
});
