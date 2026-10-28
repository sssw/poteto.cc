import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay, TIMING, shareText } from '../site/game.js';

function close(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message} Expected ${expected}, received ${actual}`);
}

function advance(game, seconds) {
  let left = seconds;
  let event = null;
  while (left > 1e-10) {
    const step = Math.min(left, 1 / 120);
    event = game.tick(step) || event;
    left -= step;
  }
  return event;
}

function finishFlight(game, frameTime = 1 / 60) {
  for (let frame = 0; frame < 400; frame++) {
    const event = game.tick(frameTime);
    if (event) return event;
  }
  assert.fail('Flight did not resolve');
}

function coverLanding(game) {
  while (!game.platforms.some(platform => platform.cell === game.target)) {
    const front = Math.max(...game.platforms.map(platform => platform.cell));
    const remaining = game.target - front;
    assert.ok(remaining > 0, 'A future landing must remain reachable');
    assert.equal(game.move(Math.min(2, remaining)), true);
  }
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test('ready waits for input and resets to two platforms with no score', () => {
  const game = new Relay(() => 0);
  const initial = structuredClone(game.platforms);
  for (let frame = 0; frame < 600; frame++) assert.equal(game.tick(0.05), null);
  assert.deepEqual(game.platforms, initial);
  assert.deepEqual(game.platforms.map(p => [p.id, p.cell, p.number]), [[0, 0, 1], [1, 1, 1]]);
  assert.equal(game.status, 'ready');
  assert.equal(game.elapsed, 0);
  assert.equal(game.score, 0);
});

test('left and right alternate the rear platform relative to the front', () => {
  const game = new Relay(() => 0);
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

test('one, two and three space flights finish at the native durations', () => {
  for (const [number, seconds] of [[1, 0.62], [2, 0.78], [3, 1.175]]) {
    const game = new Relay(() => 0);
    game.platforms[1].number = number;
    game.move(Math.min(number, 2));
    if (number === 3) game.move(1);
    close(game.duration(), seconds);
    assert.equal(game.target, 1 + number);
    assert.equal(advance(game, seconds - 0.001), null);
    assert.equal(game.landings, 0);
    assert.equal(game.tick(0.001), 'land');
    assert.equal(game.start, 1 + number);
    assert.equal(game.score, 1);
    close(game.position, 1 + number);
    close(game.elapsed, seconds);
  }
});

test('platforms travel at 180 ms per physical cell with an eased lifted midpoint', () => {
  for (const [steps, cells] of [[1, 2], [2, 3]]) {
    const game = new Relay(() => 0);
    game.move(steps);
    const platform = game.platforms[0];
    close(platform.duration, 0.18 * cells);
    close(game.visualCell(platform), 0);
    close(game.visualLift(platform), 0);
    advance(game, platform.duration / 4);
    close(game.visualCell(platform), cells * 0.15625);
    advance(game, platform.duration / 4);
    close(game.visualCell(platform), cells / 2);
    close(game.visualLift(platform), 0.16);
    advance(game, platform.duration / 2);
    close(game.visualCell(platform), cells);
    close(game.visualLift(platform), 0);
  }
});

test('retargeting an airborne platform preserves its current position and height', () => {
  const game = new Relay(() => 0);
  game.move(1);
  advance(game, 0.1);
  const platform = game.platforms[0];
  const cell = game.visualCell(platform);
  const lift = game.visualLift(platform);
  game.move(2);
  game.move(1);
  assert.equal(platform.cell, 5);
  close(game.visualCell(platform), cell);
  close(game.visualLift(platform), lift);
  close(platform.duration, (5 - cell) * 0.18);
  game.tick(1 / 120);
  assert.ok(game.visualCell(platform) > cell);
  assert.ok(Math.abs(game.visualLift(platform) - lift) < 0.01);
});

test('opening left scores once, then absent input misses the automatic next flight', () => {
  const game = new Relay(() => 0);
  game.move(1);
  assert.equal(finishFlight(game), 'land');
  assert.equal(game.landings, 1);
  assert.equal(game.target, 3);
  assert.equal(game.status, 'playing');
  assert.equal(finishFlight(game), 'miss');
  assert.equal(game.status, 'over');
  assert.equal(game.score, 1);
  assert.equal(game.move(1), false);
  assert.equal(game.tick(0.05), null);
});

test('wrong opening input and excessive input remove the required landing', () => {
  for (const inputs of [[2], [2, 2], [1, 1, 1]]) {
    const game = new Relay(() => 0);
    inputs.forEach(input => game.move(input));
    assert.equal(finishFlight(game), 'miss', `Inputs ${inputs} must miss cell 2`);
    assert.equal(game.score, 0);
    assert.equal(game.landings, 0);
  }
});

test('two short opening taps validly prepare two consecutive landings', () => {
  const game = new Relay(() => 0);
  game.move(1);
  game.move(1);
  assert.equal(finishFlight(game), 'land');
  assert.equal(finishFlight(game), 'land');
  assert.equal(game.score, 2);
  assert.equal(finishFlight(game), 'miss');
});

test('three-space relays work in either input order with a short gap between taps', () => {
  for (const inputs of [[1, 2], [2, 1]]) {
    const game = new Relay(() => 0);
    game.platforms[1].number = 3;
    game.move(inputs[0]);
    advance(game, 0.15);
    game.move(inputs[1]);
    assert.equal(game.target, 4);
    assert.equal(finishFlight(game), 'land');
    assert.equal(game.start, 4);
    assert.equal(game.landings, 1);
  }
});

test('physical contact permits a nearly arrived platform but rejects a late move', () => {
  for (const [delay, expected] of [[0.28, 'land'], [0.45, 'miss']]) {
    const game = new Relay(() => 0);
    game.move(1);
    advance(game, 0.62);
    advance(game, delay);
    game.move(1);
    assert.equal(finishFlight(game), expected, `Move after ${delay} seconds`);
    assert.equal(game.landings, expected === 'land' ? 2 : 1);
  }
});

test('touchdown requires vertical support as well as the horizontal target', () => {
  const game = new Relay(() => 0);
  game.move(1);
  const platform = game.platforms[0];
  platform.from = 2;
  platform.cell = 2;
  platform.fromLift = 0.2;
  platform.motion = 0;
  assert.equal(game.visualCell(platform), game.target);
  assert.equal(game.supportivePlatform(), undefined);
  platform.fromLift = 0.05;
  assert.equal(game.supportivePlatform(), platform);
});

test('native 4:4:2:1 platform weights are available immediately and cells remain stable', () => {
  for (const [roll, expected] of [[0, 1], [3.999 / 11, 1], [4 / 11, 2], [7.999 / 11, 2], [8 / 11, 3], [9.999 / 11, 3], [10 / 11, 0], [0.999, 0]]) {
    let calls = 0;
    const game = new Relay(() => { calls++; return roll; });
    game.move(1);
    assert.equal(game.platforms[0].number, expected);
    assert.equal(game.numberAt(2), expected);
    assert.equal(calls, 1, 'Reading an existing cell must not reroll it');
  }
  const samples = [0.1, 0.6, 0.85];
  const game = new Relay(() => samples.shift());
  assert.equal(game.numberAt(4), 3);
  assert.equal(game.numberAt(2), 1);
  assert.equal(game.numberAt(3), 2);
  assert.equal(samples.length, 0);
});

test('carryover keeps thirty-second runs at the same cadence across display refresh rates', () => {
  const snapshots = [];
  for (const hz of [30, 60, 120, 144]) {
    const game = new Relay(() => 0);
    game.move(1);
    for (let frame = 0; frame < hz * 30; frame++) {
      coverLanding(game);
      assert.notEqual(game.tick(1 / hz), 'miss');
    }
    close(game.elapsed, 30);
    assert.equal(game.landings, 48);
    close(game.flightElapsed, 30 - 48 * 0.62);
    assert.equal(game.score, 57);
    snapshots.push(game.position);
  }
  snapshots.forEach(position => close(position, snapshots[0]));
});

test('frame remainder immediately advances the next bounce without an idle frame', () => {
  const game = new Relay(() => 0);
  game.move(1);
  advance(game, 0.6);
  assert.equal(game.tick(0.05), 'land');
  close(game.flightElapsed, 0.03);
  close(game.progress, 0.03 / 0.62);
  close(game.position, 2 + 0.03 / 0.62);
});

test('long mixed runs remain playable and keep platform and course storage bounded', () => {
  const distances = new Set();
  for (const hz of [30, 60, 120, 144]) {
    const game = new Relay(seededRandom(123456789));
    let reveals = 0;
    game.move(1);
    for (let landing = 1; landing <= 500; landing++) {
      if (game.phase === 'reveal') {
        const previousScore = game.score;
        assert.equal(finishFlight(game, 1 / hz), 'reveal');
        reveals++;
        assert.equal(game.score, previousScore);
      }
      distances.add(game.distance);
      coverLanding(game);
      assert.equal(finishFlight(game, 1 / hz), 'land', `Landing ${landing} at ${hz} Hz`);
      assert.equal(game.landings, landing);
      assert.equal(game.score, landing + Math.floor(landing / 5));
      assert.equal(game.platforms.length, 2);
      assert.ok(game.course.size <= 8, 'Past cells must not accumulate indefinitely');
      assert.ok(Number.isFinite(game.position));
    }
    assert.ok(reveals > 0, 'The seeded run must exercise mystery reveals');
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
    assert.equal(game.flightElapsed, 0);
    assert.equal(game.phase, 'jump');
    assert.equal(game.revealNumber, 0);
    assert.equal(game.position, 1);
    assert.deepEqual(game.platforms.map(p => p.cell), [0, 1]);
    assert.deepEqual([...game.course], [[0, 1], [1, 1]]);
  }
});

test('invalid time is ignored and a stalled frame is bounded by the native frame clamp', () => {
  const game = new Relay(() => 0);
  game.move(1);
  for (const delta of [-1, 0, NaN, Infinity, -Infinity]) game.tick(delta);
  assert.equal(game.elapsed, 0);
  assert.equal(game.progress, 0);
  game.tick(60);
  close(game.elapsed, 1 / 15);
  close(game.progress, (1 / 15) / 0.62);
  assert.equal(TIMING.maxFrame, 1 / 15);
  assert.equal(game.status, 'playing');
});

test('unsupported controls do not mutate the game', () => {
  const game = new Relay(() => 0);
  const before = JSON.stringify(game);
  for (const input of [0, -1, 3, 1.5, '1', null, undefined, NaN]) {
    assert.equal(game.move(input), false);
    assert.equal(JSON.stringify(game), before);
  }
});

test('shared score is concise and contains the exact result', () => {
  assert.equal(shareText(42), 'I bounced to 42 on Poteto! Can you go further?');
});
