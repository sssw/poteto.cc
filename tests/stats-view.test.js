import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES } from '../site/i18n.js';
import { statsMessages, statsText } from '../site/stats-copy.js';
import { normalizeSnapshot, distributionPoints, SCORE_RANGES } from '../site/stats-view.js';

const sample = () => ({ players: 2, runs: 6, bins: [1, 2, 0, 0, 1, 0, 1, 1], updatedAt: '2026-10-30T17:00:00.000Z' });
test('community statistics never display invalid totals as real zeroes', () => {
  assert.deepEqual(normalizeSnapshot(sample()), sample());
  assert.equal(normalizeSnapshot(null), null);
  for (const patch of [
    { players: -1 }, { players: 7 }, { players: '2' }, { runs: Infinity },
    { runs: 7 }, { bins: [6] }, { bins: [1, 2, 0, 0, 1, 0, 1, -1] },
    { updatedAt: 'not a time' }, { updatedAt: 0 }, { runs: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(normalizeSnapshot({ ...sample(), ...patch }), null, JSON.stringify(patch));
  assert.deepEqual(normalizeSnapshot({ ...sample(), players: 0, runs: 0, bins: Array(8).fill(0) }).bins, Array(8).fill(0));
  const source = sample();
  const safe = normalizeSnapshot(source);
  source.bins[0] = 99;
  assert.equal(safe.bins[0], 1);
});

test('distribution uses categorical ranges and a linear scale without smoothing or invented counts', () => {
  assert.equal(SCORE_RANGES.length, 8);
  assert.equal(SCORE_RANGES.at(-1), '320+');
  const bins = [0, 1, 2, 4, 2, 1, 0, 0];
  const points = distributionPoints(bins);
  assert.equal(points.length, bins.length);
  assert.deepEqual(points.map(point => point.count), bins);
  assert.equal(points[0].y, 70);
  assert.equal(points[3].y, 17);
  assert.equal(points[2].y, 43.5);
  assert.ok(points.every(point => point.x >= 0 && point.x <= 324 && point.y >= 17 && point.y <= 70));
  assert.ok(distributionPoints(Array(8).fill(0)).every(point => point.y === 70));
});

test('all statistics copy is complete in every supported language', () => {
  const keys = Object.keys(statsMessages.en).sort();
  assert.deepEqual(Object.keys(statsMessages).sort(), LANGUAGES.map(item => item.code).sort());
  for (const { code } of LANGUAGES) {
    assert.deepEqual(Object.keys(statsMessages[code]).sort(), keys);
    for (const key of keys) {
      const value = statsMessages[code][key];
      assert.ok(typeof value === 'string' && value.trim());
      assert.ok(!/<\/?[a-z][^>]*>/i.test(value));
      assert.deepEqual([...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]), [...statsMessages.en[key].matchAll(/\{([^{}]+)\}/g)].map(match => match[1]));
    }
    assert.ok(statsText(code, 'updated', { time: 'TEST_TIME' }).includes('TEST_TIME'));
    if (code !== 'en') assert.notEqual(statsText(code, 'title'), statsText('en', 'title'));
  }
  assert.equal(statsText('invalid', 'title'), statsMessages.en.title);
  assert.equal(statsText('en', '__proto__'), '__proto__');
});
