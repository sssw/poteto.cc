import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay, shareText } from '../site/game.js';

function finishFlight(game) {
  for (let frame = 0; frame < 180; frame++) {
    const event = game.tick(1 / 60);
    if (event) return event;
  }
  assert.fail('Flight did not resolve within three seconds');
}

function coverLanding(game) {
  while (!game.platforms.some(platform => platform.cell === game.target)) {
    const front = Math.max(...game.platforms.map(platform => platform.cell));
    const remaining = game.target - front;
    assert.ok(remaining > 0, 'A future landing must remain reachable');
    assert.equal(game.move(Math.min(2, remaining)), true);
  }
}

test('ready waits for input and resets to two platforms with no score', () => {
  const game = new Relay();
  const initial = JSON.stringify(game);
  for (let frame = 0; frame < 600; frame++) assert.equal(game.tick(0.05), null);
  assert.equal(JSON.stringify(game), initial);
  assert.deepEqual(game.platforms.map(p => [p.id, p.cell, p.number]), [[0, 0, 1], [1, 1, 1]]);
  assert.equal(game.status, 'ready');
  assert.equal(game.score, 0);
});

test('left and right alternate the rear platform relative to the front', () => {
  const game = new Relay();
  assert.equal(game.move(1), true);
  assert.equal(game.status, 'playing');
  assert.equal(game.target, 2);
  assert.equal(game.position, 1, 'Input moves a platform, not the potato');
  assert.deepEqual(game.platforms.map(p => p.cell), [2, 1]);
  assert.equal(game.move(2), true);
  assert.deepEqual(game.platforms.map(p => p.cell), [2, 4]);
  assert.equal(game.move(1), true);
  assert.deepEqual(game.platforms.map(p => p.cell), [5, 4]);
  assert.equal(game.moves, 3);
});

test('platform motion starts at its current visual location and reaches its target', () => {
  const game = new Relay();
  game.move(1);
  const moving = game.platforms[0];
  assert.equal(game.visualCell(moving), 0);
  game.tick(0.05);
  assert.ok(game.visualCell(moving) > 0 && game.visualCell(moving) < 2);
  for (let i = 0; i < 4; i++) game.tick(0.05);
  assert.equal(game.visualCell(moving), 2);
});

test('opening left scores once, then absent input misses the next jump', () => {
  const game = new Relay();
  game.move(1);
  assert.equal(finishFlight(game), 'land');
  assert.equal(game.score, 1);
  assert.equal(game.landings, 1);
  assert.equal(game.status, 'playing');
  assert.equal(game.target, 3, 'Successful landings start the next jump automatically');
  assert.equal(finishFlight(game), 'miss');
  assert.equal(game.status, 'over');
  assert.equal(game.score, 1);
  assert.equal(game.move(1), false);
  assert.equal(game.tick(0.05), null);
});

test('wrong opening input and excessive input remove the required landing', () => {
  for (const inputs of [[2], [2, 2], [1, 1, 1]]) {
    const game = new Relay();
    inputs.forEach(input => game.move(input));
    assert.equal(finishFlight(game), 'miss', `Inputs ${inputs} must miss cell 2`);
    assert.equal(game.score, 0);
    assert.equal(game.landings, 0);
  }
});

test('two short opening taps validly prepare two consecutive landings', () => {
  const game = new Relay();
  game.move(1);
  game.move(1);
  assert.equal(finishFlight(game), 'land');
  assert.equal(finishFlight(game), 'land');
  assert.equal(game.score, 2);
  assert.equal(finishFlight(game), 'miss');
});

test('one, two and three cell jumps resolve against the takeoff number', () => {
  for (const number of [1, 2, 3]) {
    const game = new Relay(() => 0);
    game.platforms[1].number = number;
    game.move(Math.min(number, 2));
    if (number === 3) game.move(1);
    assert.equal(game.distance, number);
    assert.equal(game.target, 1 + number);
    assert.equal(finishFlight(game), 'land');
    assert.equal(game.position, 1 + number);
    assert.equal(game.score, 1);
  }
});

test('a platform moved too late cannot catch the potato merely by logical cell', () => {
  const game = new Relay(() => 0);
  game.move(1);
  assert.equal(finishFlight(game), 'land');
  while (game.progress < 0.98) game.tick(0.01);
  game.move(1);
  assert.equal(finishFlight(game), 'miss');
});

test('long deterministic runs remain playable with bounded platform storage', () => {
  let seed = 123456789;
  const game = new Relay(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  game.move(1);
  const distances = new Set();
  for (let landing = 1; landing <= 500; landing++) {
    distances.add(game.distance);
    coverLanding(game);
    assert.equal(finishFlight(game), 'land', `Landing ${landing}`);
    assert.equal(game.landings, landing);
    assert.equal(game.score, landing + Math.floor(landing / 5));
    assert.equal(game.platforms.length, 2);
    assert.ok(Number.isFinite(game.position));
    assert.equal(game.status, 'playing');
  }
  assert.deepEqual([...distances].sort(), [1, 2, 3]);
});

test('every fifth landing awards one bonus and reset clears the full run', () => {
  const game = new Relay(() => 0);
  for (let run = 0; run < 3; run++) {
    game.move(1);
    for (let landing = 1; landing <= 10; landing++) {
      coverLanding(game);
      assert.equal(finishFlight(game), 'land');
      assert.equal(game.score, landing + Math.floor(landing / 5));
    }
    assert.equal(game.score, 12);
    game.reset();
    assert.equal(game.status, 'ready');
    assert.equal(game.score, 0);
    assert.equal(game.landings, 0);
    assert.equal(game.moves, 0);
    assert.equal(game.elapsed, 0);
    assert.equal(game.progress, 0);
    assert.equal(game.position, 1);
    assert.deepEqual(game.platforms.map(p => p.cell), [0, 1]);
  }
});

test('negative time does nothing and a large frame advances at most 50 ms', () => {
  const game = new Relay();
  game.move(1);
  game.tick(-1);
  assert.equal(game.elapsed, 0);
  assert.equal(game.progress, 0);
  game.tick(60);
  assert.equal(game.elapsed, 0.05);
  assert.ok(Math.abs(game.progress - 0.05 / game.duration()) < 1e-12);
  assert.equal(game.status, 'playing');
});

test('unsupported controls do not mutate the game', () => {
  const game = new Relay();
  const before = JSON.stringify(game);
  for (const input of [0, -1, 3, 1.5, '1', null, undefined, NaN]) {
    assert.equal(game.move(input), false);
    assert.equal(JSON.stringify(game), before);
  }
});

test('shared score is concise and contains the exact result', () => {
  assert.equal(shareText(42), 'I bounced to 42 on Poteto! Can you go further?');
});
