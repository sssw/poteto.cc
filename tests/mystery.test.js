import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay, TIMING } from '../site/game.js';

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `Expected ${expected}, received ${actual}`);
}

function advance(game, seconds) {
  let event = null;
  for (let remaining = seconds; remaining > 1e-10;) {
    const step = Math.min(remaining, 1 / 120);
    event = game.tick(step) || event;
    remaining -= step;
  }
  return event;
}

function finishFlight(game, frameTime = 1 / 120) {
  for (let frame = 0; frame < 400; frame++) {
    const event = game.tick(frameTime);
    if (event) return event;
  }
  assert.fail('Flight did not resolve');
}

function arriveAtMystery(number) {
  const values = [0.99, (number - 0.5) / 3];
  let calls = 0;
  const game = new Relay(() => { calls++; return values.shift() ?? 0; });
  game.move(1);
  assert.equal(game.platforms[0].number, 0, 'An unvisited mystery platform displays a question mark');
  assert.equal(advance(game, 0.62), 'land');
  return { game, get calls() { return calls; } };
}

test('landing on a question mark immediately reveals a stable number and starts an in-place hop', () => {
  for (const number of [1, 2, 3]) {
    const state = arriveAtMystery(number);
    const { game } = state;
    assert.equal(game.status, 'playing');
    assert.equal(game.phase, 'reveal');
    assert.equal(game.distance, 0);
    assert.equal(game.start, 2);
    assert.equal(game.target, 2);
    close(game.position, 2);
    assert.equal(game.revealNumber, number);
    assert.equal(game.platforms[0].number, number);
    assert.equal(game.numberAt(2), number);
    assert.equal(game.score, 1);
    assert.equal(game.landings, 1);
    assert.equal(state.calls, 2, 'Spawn and reveal each use exactly one random value');
    close(game.duration(), 0.62);
    close(game.flightElapsed, 1 / 120);
    assert.ok(game.progress > 0 && game.progress < 0.03);
    assert.equal(TIMING.revealHeight, 1.2);
  }
});

test('reveal resolution uses equal thirds, including the boundaries', () => {
  for (const [roll, expected] of [[0, 1], [0.333, 1], [1 / 3, 2], [0.666, 2], [2 / 3, 3], [0.999, 3]]) {
    const values = [0.99, roll];
    const game = new Relay(() => values.shift() ?? 0);
    game.move(1);
    advance(game, 0.62);
    assert.equal(game.revealNumber, expected);
    assert.equal(game.numberAt(2), expected);
  }
});

test('the complete reveal stays in one cell and immediately continues without extra points', () => {
  const state = arriveAtMystery(2);
  const { game } = state;
  advance(game, 0.2);
  close(game.position, 2);
  assert.equal(game.target, 2);
  assert.equal(game.phase, 'reveal');
  const remaining = 0.62 - game.flightElapsed;
  assert.equal(advance(game, remaining - 0.001), null);
  close(game.position, 2);
  assert.equal(game.tick(0.001), 'reveal');
  assert.equal(game.phase, 'jump');
  assert.equal(game.distance, 2);
  assert.equal(game.start, 2);
  assert.equal(game.target, 4);
  assert.equal(game.score, 1);
  assert.equal(game.landings, 1);
  assert.equal(game.revealNumber, 0);
  assert.equal(state.calls, 2, 'Completing the reveal must not roll a second number');
  close(game.elapsed, 0.62 + 0.62 - 1 / 120);
});

test('one- and two-space next platforms can be prepared during the reveal', () => {
  for (const number of [1, 2]) {
    const { game } = arriveAtMystery(number);
    assert.equal(game.move(number), true);
    const prepared = game.platforms[1];
    assert.equal(prepared.cell, 2 + number);
    assert.equal(game.target, 2, 'Preparing the next platform does not move the in-place target');
    assert.equal(finishFlight(game), 'reveal');
    assert.equal(prepared.cell, 2 + number);
    assert.equal(prepared.motion, 1);
    assert.equal(game.target, 2 + number);
    assert.equal(game.score, 1);
    assert.equal(finishFlight(game), 'land');
    assert.equal(game.landings, 2);
    assert.equal(game.score, 2);
  }
});

test('a platform still moving at reveal completion retains its motion and catches the next jump', () => {
  const { game } = arriveAtMystery(2);
  advance(game, 0.4);
  game.move(2);
  const prepared = game.platforms[1];
  assert.equal(finishFlight(game), 'reveal');
  assert.ok(prepared.motion > 0 && prepared.motion < 1);
  const progress = prepared.motion;
  game.tick(1 / 120);
  assert.ok(prepared.motion > progress, 'The preparation animation must continue across the phase boundary');
  assert.equal(finishFlight(game), 'land');
  assert.equal(game.start, 4);
});

test('a three-space relay can span the reveal and the following jump in either order', () => {
  for (const [first, second] of [[1, 2], [2, 1]]) {
    const { game } = arriveAtMystery(3);
    game.move(first);
    assert.equal(finishFlight(game), 'reveal');
    assert.equal(game.target, 5);
    game.move(second);
    assert.equal(finishFlight(game), 'land');
    assert.equal(game.start, 5);
    assert.equal(game.score, 2);
  }
});

test('moving away the current platform during the in-place reveal causes a real fall', () => {
  for (const inputs of [[1, 1], [1, 2], [2, 1]]) {
    const { game } = arriveAtMystery(3);
    inputs.forEach(input => game.move(input));
    assert.equal(game.target, 2);
    assert.ok(game.platforms.every(platform => platform.cell !== 2));
    assert.equal(finishFlight(game), 'miss');
    assert.equal(game.status, 'over');
    assert.equal(game.score, 1);
    assert.equal(game.landings, 1);
  }
});

test('consecutive mysteries do not count their in-place hops toward score or the fifth-landing bonus', () => {
  const game = new Relay(() => 0.1);
  for (let cell = 2; cell <= 6; cell++) game.course.set(cell, 0);
  game.generatedThrough = 6;
  game.move(1);
  for (let landing = 1; landing <= 5; landing++) {
    assert.equal(finishFlight(game), 'land');
    assert.equal(game.phase, 'reveal');
    assert.equal(game.landings, landing);
    assert.equal(game.score, landing + Math.floor(landing / 5));
    const score = game.score;
    game.move(1);
    assert.equal(finishFlight(game), 'reveal');
    assert.equal(game.phase, 'jump');
    assert.equal(game.landings, landing);
    assert.equal(game.score, score);
  }
  assert.equal(game.score, 6);
});

test('frame remainder crosses both reveal boundaries without changing their timing', () => {
  const values = [0.99, 0.1];
  const game = new Relay(() => values.shift() ?? 0);
  game.move(1);
  advance(game, 0.6);
  assert.equal(game.tick(0.05), 'land');
  close(game.flightElapsed, 1 / 120 + 0.03);
  close(game.position, 2);
  advance(game, 0.62 - game.flightElapsed - 0.01);
  assert.equal(game.tick(0.05), 'reveal');
  close(game.flightElapsed, 0.04);
  close(game.position, 2 + 0.04 / 0.62);
  assert.equal(game.score, 1);
});

test('reset during a reveal clears the revealed number and restarts a normal opening', () => {
  const { game } = arriveAtMystery(3);
  game.move(2);
  game.reset();
  assert.equal(game.phase, 'jump');
  assert.equal(game.revealNumber, 0);
  assert.equal(game.status, 'ready');
  assert.equal(game.distance, 1);
  assert.equal(game.target, 2);
  assert.equal(game.score, 0);
  assert.equal(game.landings, 0);
  assert.deepEqual([...game.course], [[0, 1], [1, 1]]);
  assert.equal(game.move(1), true);
  assert.equal(finishFlight(game), 'land');
  assert.equal(game.score, 1);
});
