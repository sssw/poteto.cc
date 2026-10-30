import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
const base = 20000 * 86400 + 1000;
function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(schema); t.after(() => db.close());
  let sequence = 0;
  const submit = ({ player = 'p', ip = 'ip:test', at = base, batch = 'batch-' + (++sequence), bins = [1,0,0,0,0,0,0,0] } = {}) =>
    db.prepare('INSERT OR IGNORE INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(batch,player,ip,Math.floor(at/86400),at,bins.reduce((a,b)=>a+b,0),...bins).changes;
  const totals = () => db.prepare('SELECT * FROM totals WHERE id=1').get();
  return { db, submit, totals };
}

test('schema initialization is repeatable without resetting accumulated totals', t => {
  const f = fixture(t); f.submit(); f.db.exec(schema);
  assert.equal(f.totals().runs, 1); assert.equal(f.totals().players, 1);
});

test('one atomic insert updates histogram and unique players without retaining individual scores', t => {
  const f = fixture(t), bins = [1,2,3,4,1,2,3,4];
  assert.equal(f.submit({ bins }), 1);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => f.totals()['b' + i]), bins);
  assert.equal(f.totals().runs, 20); assert.equal(f.totals().players, 1);
  f.submit({ at: base + 60 });
  assert.equal(f.totals().runs, 21); assert.equal(f.totals().players, 1);
  f.submit({ player: 'another', at: base + 61 });
  assert.equal(f.totals().players, 2);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 0);
});

test('minute limit accepts the exact sixty-second boundary and blocks earlier requests without writes', t => {
  const f = fixture(t); f.submit({ batch: 'a' });
  const before = f.db.prepare('SELECT total_changes() n').get().n;
  assert.equal(f.submit({ at: base + 59 }), 0);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
  assert.equal(f.submit({ at: base + 60 }), 1);
  assert.equal(f.totals().runs, 2);
});

test('last accepted batch replay is rejected even after the minute window', t => {
  const f = fixture(t); f.submit({ batch: 'same' });
  assert.equal(f.submit({ batch: 'same', at: base + 120 }), 0);
  assert.equal(f.totals().runs, 1);
});

test('per-browser cap accepts exactly 240 completed games per UTC day', t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) assert.equal(f.submit({ bins: [20,0,0,0,0,0,0,0], at: base + i * 60 }), 1);
  assert.equal(f.submit({ at: base + 720 }), 0);
  assert.equal(f.totals().runs, 240);
  assert.equal(f.submit({ at: base + 86400 }), 1);
  assert.equal(f.totals().players, 1); assert.equal(f.totals().runs, 241);
  assert.equal(f.db.prepare('SELECT runs FROM players WHERE id=?').get('p').runs, 1);
});

test('per-browser batch cap accepts exactly sixty batches per UTC day', t => {
  const f = fixture(t);
  for (let i = 0; i < 60; i++) assert.equal(f.submit({ at: base + i * 60 }), 1);
  assert.equal(f.submit({ at: base + 3600 }), 0);
  assert.equal(f.totals().runs, 60);
});

test('per-source daily limit holds across changing browsers', t => {
  const f = fixture(t);
  for (let i = 0; i < 120; i++) assert.equal(f.submit({ player: 'p' + i }), 1);
  assert.equal(f.submit({ player: 'p120' }), 0);
  assert.equal(f.totals().runs, 120); assert.equal(f.totals().players, 120);
  assert.equal(f.submit({ player: 'p120', at: base + 86400 }), 1);
});

test('global daily cap survives rotating browser and source identities and resets next UTC day', t => {
  const f = fixture(t);
  for (let i = 0; i < 4000; i++) assert.equal(f.submit({ player: 'p' + i, ip: 'ip:' + i }), 1);
  const before = f.db.prepare('SELECT total_changes() n').get().n;
  assert.equal(f.submit({ player: 'p4000', ip: 'ip:4000' }), 0);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
  assert.equal(f.totals().runs, 4000);
  assert.equal(f.submit({ player: 'p4000', ip: 'ip:4000', at: base + 86400 }), 1);
  assert.equal(f.totals().runs, 4001);
});

test('bounded stale-limit cleanup preserves current and previous day entries', t => {
  const f = fixture(t), day = Math.floor(base/86400);
  for (let i = 0; i < 10; i++) f.db.prepare('INSERT INTO limits VALUES(?,?,?)').run('old-' + i,day-2,1);
  f.db.prepare('INSERT INTO limits VALUES(?,?,?)').run('yesterday',day-1,120);
  f.submit();
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM limits WHERE day=?').get(day-2).n, 6);
  assert.equal(f.db.prepare('SELECT batches FROM limits WHERE id=?').get('yesterday').batches, 120);
  assert.equal(f.db.prepare('SELECT batches FROM limits WHERE id=?').get('global').batches, 1);
  const plan = f.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM limits WHERE day<? LIMIT 4').all(day-1);
  assert.ok(plan.some(row => /limits_day/.test(row.detail)));
});

test('trigger failure rolls back totals, player identity, and budgets as one statement', t => {
  const f = fixture(t);
  f.db.exec("CREATE TRIGGER reject_player BEFORE INSERT ON players BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END;");
  assert.throws(() => f.submit(), /simulated storage failure/);
  assert.equal(f.totals().runs, 0); assert.equal(f.totals().players, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM limits').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM players').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 0);
});

test('accepted batches use a constant number of row mutations independent of score count', t => {
  const f = fixture(t);
  let prior = f.db.prepare('SELECT total_changes() n').get().n;
  f.submit();
  const one = f.db.prepare('SELECT total_changes() n').get().n - prior;
  prior = f.db.prepare('SELECT total_changes() n').get().n;
  f.submit({ bins: [20,0,0,0,0,0,0,0], at: base + 60 });
  const twenty = f.db.prepare('SELECT total_changes() n').get().n - prior;
  assert.equal(one, 6); assert.equal(twenty, 6);
  // SQLite total_changes excludes index writes. D1 also charges secondary-index maintenance;
  // current-day limit changes touch at most two index entries, plus at most four cleanup rows.
  assert.ok((6 + 2 + 4 * 2) * 4000 < 100000);
});
