import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay, TIMING } from '../site/game.js';
import { Garden, sceneLayout, followCamera, reframeCamera, PLAYER_HALF_CELL, trackedCameraView } from '../site/art.js';

const scenes = [
  [294, 330, 83], [294, 396, 83], [350, 672, 83],
  [510, 268, 56], [756, 338, 56], [690, 750, 89],
  [1184, 697, 89], [1184, 750, 89], [1920, 1000, 89],
];
const rates = [30, 60, 120, 144];
// A moving platform reaches 1.5 / durationPerCell at the midpoint of its eased flight.
const speedLimit = 1.5 / TIMING.platformPerCell * 1.05;

function preparedGame(pattern = [1, 3, 2, 3, 3, 0]) {
  const game = new Relay(() => 0.99);
  game.generatedThrough = 4096;
  for (let cell = 0; cell <= 4096; cell++) game.course.set(cell, 1);
  let cell = 2;
  for (let index = 0; cell < 4000; index++) {
    const kind = pattern[index % pattern.length];
    game.course.set(cell, kind);
    cell += kind || 3;
  }
  game.move(1);
  return game;
}

function coverLanding(game) {
  while (!game.platforms.some(platform => platform.cell === game.target)) {
    const front = Math.max(...game.platforms.map(platform => platform.cell));
    assert.ok(game.target > front);
    game.move(Math.min(2, game.target - front));
  }
}

function assertVisible(camera, game, layout) {
  const player = layout.origin + (game.position - 1 - camera) * layout.cell;
  const playerHalf = PLAYER_HALF_CELL * layout.verticalCell;
  assert.ok(player - playerHalf >= layout.margin - 0.01, 'Player leaves the left edge');
  assert.ok(player + playerHalf <= layout.width - layout.margin + 0.01, 'Player leaves the right edge');
  for (const platform of game.platforms) {
    const x = layout.origin + (game.visualCell(platform) - 1 - camera) * layout.cell;
    assert.ok(x - layout.platform.width / 2 >= layout.margin - 0.01, 'An actual platform leaves the left edge');
    assert.ok(x + layout.platform.width / 2 <= layout.width - layout.margin + 0.01, 'An actual platform leaves the right edge');
  }
}

function run(layout, fps, seconds = 45, pattern) {
  const game = preparedGame(pattern);
  game.cellWidth = layout.cell;
  game.verticalScale = layout.verticalCell / layout.cell;
  let camera = 0;
  let previousGoal = trackedCameraView(game, layout).goal;
  let maxStep = 0;
  const transitions = new Set();
  for (let frame = 0; frame < seconds * fps; frame++) {
    coverLanding(game);
    const previousDistance = game.distance;
    const previousPhase = game.phase;
    const previousCamera = camera;
    const event = game.tick(1 / fps);
    assert.notEqual(event, 'miss');
    const view = trackedCameraView(game, layout);
    camera = followCamera(camera, view, 1 / fps, previousGoal);
    previousGoal = view.goal;
    const step = camera - previousCamera;
    assert.ok(Math.abs(step) <= speedLimit / fps + 1e-9,
      `Camera moved ${step * layout.cell} px in one ${fps} Hz frame at ${layout.width}px`);
    maxStep = Math.max(maxStep, Math.abs(step));
    assertVisible(camera, game, layout);
    if (event && game.distance === 3) {
      transitions.add(previousPhase === 'reveal' ? 'reveal→3' : `${previousDistance}→3`);
      assert.equal(followCamera(camera, view, 0), camera,
        'A landing target change must not move a paused camera');
    }
  }
  return { game, camera, maxStep, transitions };
}

test('future three-space hints cannot move the tracked view or a paused camera', () => {
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    const game = new Relay();
    game.position = 12;
    game.platforms = [{ cell: 10, from: 10, motion: 1 }, { cell: 12, from: 12, motion: 1 }];
    game.target = 13;
    const before = trackedCameraView(game, layout);
    game.target = 15;
    const after = trackedCameraView(game, layout);
    assert.deepEqual(after, before, 'Only rendered body bounds determine camera framing');
    for (const dt of [0, -1, NaN, Infinity]) assert.equal(followCamera(10, after, dt), 10);
  }
});

test('one-, two-, consecutive-three and mystery-to-three transitions stay within normal camera speed', () => {
  const observed = new Set();
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    for (const fps of rates) {
      const result = run(layout, fps);
      result.transitions.forEach(value => observed.add(value));
      assert.ok(result.game.landings > 35);
    }
  }
  assert.deepEqual([...observed].sort(), ['1→3', '2→3', '3→3', 'reveal→3']);
});

test('mixed native gameplay has matching camera positions across common display rates', () => {
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    const baseline = run(layout, 144, 30);
    for (const fps of rates.slice(0, -1)) {
      const result = run(layout, fps, 30);
      assert.equal(result.game.landings, baseline.game.landings);
      assert.ok(Math.abs(result.game.position - baseline.game.position) < 1e-8);
      assert.ok(Math.abs(result.camera - baseline.camera) * layout.cell < 1,
        `Camera differs by more than one CSS pixel at ${fps} Hz`);
    }
  }
});

test('linear tracked-view integration is independent of frame rate even at speed changes', () => {
  const after = fps => {
    let camera = 0, goal = 0;
    for (const [distance, duration] of [[1, 0.62], [3, 1.175], [0, 0.62], [2, 0.78], [3, 1.175]]) {
      const start = goal;
      for (let time = 0; time < duration - 1e-10;) {
        const dt = Math.min(1 / fps, duration - time);
        time += dt;
        const next = start + distance * time / duration;
        camera = followCamera(camera, { goal: next, maximum: next + 2 }, dt, goal);
        goal = next;
      }
    }
    return camera;
  };
  assert.ok(Math.abs(after(30) - after(144)) < 1e-10);
});

test('framing on a real resize is separate from frozen or resumed gameplay', () => {
  const original = sceneLayout(1184, 697, 89);
  const result = run(original, 60, 15);
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    const view = trackedCameraView(result.game, layout);
    const camera = reframeCamera(result.camera, view);
    assertVisible(camera, result.game, layout);
    for (let frame = 0; frame < 120; frame++) assert.equal(followCamera(camera, view, 0), camera);
    const resumed = followCamera(camera, view, 1 / 60);
    assert.ok(Math.abs(resumed - camera) <= speedLimit / 60, 'Resuming after a resize must not launch a rapid camera correction');
    assertVisible(resumed, result.game, layout);
  }
});

function mockGarden(t, dimensions) {
  let bounds = { width: dimensions[0], height: dimensions[1], top: 0, left: 0 };
  let controlHeight = dimensions[2];
  const gradient = { addColorStop() {} };
  const context = new Proxy({ createLinearGradient: () => gradient }, {
    get(target, property) { return property in target ? target[property] : () => {}; },
  });
  const controls = { getBoundingClientRect: () => ({ height: controlHeight }) };
  const canvas = {
    width: 0, height: 0,
    ownerDocument: { getElementById: id => id === 'controls' ? controls : null },
    getContext: () => context,
    getBoundingClientRect: () => bounds,
  };
  for (const [name, value] of Object.entries({ window: { devicePixelRatio: 1 }, ResizeObserver: class { observe() {} } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  return { garden: new Garden(canvas), resize(width, height, controlsHeight = controlHeight) { bounds = { ...bounds, width, height }; controlHeight = controlsHeight; } };
}

test('the renderer never invokes resize framing for ordinary landing or reveal transitions', t => {
  const { garden, resize } = mockGarden(t, [350, 672, 83]);
  const game = preparedGame();
  let events = 0;
  garden.draw(game, 0, true);
  for (let frame = 0; frame < 2400; frame++) {
    coverLanding(game);
    const event = game.tick(1 / 120);
    const previous = garden.camera;
    garden.draw(game, 1 / 120, true);
    assert.ok(Math.abs(garden.camera - previous) <= speedLimit / 120 + 1e-9);
    if (event) {
      events++;
      const stopped = garden.camera;
      garden.draw(game, 0, true);
      assert.equal(garden.camera, stopped, 'A still preview must not reframe after landing');
    }
  }
  assert.ok(events > 20);
  resize(690, 750);
  garden.resize();
  garden.draw(game, 0, true);
  const resized = garden.camera;
  garden.draw(game, 0, true);
  assert.equal(garden.camera, resized);
  garden.resetCamera();
  game.reset();
  garden.draw(game, TIMING.maxFrame, true);
  assert.equal(garden.camera, 0);
  assert.equal(garden.cameraGoal, trackedCameraView(game, sceneLayout(690, 750, 83)).goal);
});

test('uneven rendering intervals keep actual platforms visible without a three-space camera snap', () => {
  const intervals = [1 / 144, 1 / 60, 1 / 120, 1 / 30, TIMING.maxFrame];
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    const game = preparedGame();
    game.cellWidth = layout.cell;
    game.verticalScale = layout.verticalCell / layout.cell;
    let camera = 0;
    let previousGoal = trackedCameraView(game, layout).goal;
    for (let frame = 0; frame < 1800; frame++) {
      coverLanding(game);
      const dt = intervals[frame % intervals.length];
      assert.notEqual(game.tick(dt), 'miss');
      const view = trackedCameraView(game, layout);
      const next = followCamera(camera, view, dt, previousGoal);
      assert.ok(Math.abs(next - camera) <= speedLimit * dt + 1e-9);
      assertVisible(next, game, layout);
      camera = next;
      previousGoal = view.goal;
    }
    assert.ok(game.landings > 30);
  }
});


test('portrait to compact landscape and back keeps rendering and landing geometry synchronized', t => {
  const { garden, resize } = mockGarden(t, [350, 672, 83]);
  const game = preparedGame();
  garden.draw(game, 0, true);
  for (const dimensions of [[350, 672, 83], [510, 268, 56], [350, 672, 83]]) {
    resize(...dimensions);
    garden.resize();
    garden.draw(game, 0, true);
    const layout = sceneLayout(...dimensions);
    assert.equal(game.cellWidth, layout.cell);
    assert.equal(game.verticalScale, layout.verticalCell / layout.cell);
    if (dimensions[0] === 510) assert.ok(game.verticalScale < 1);
    else assert.equal(game.verticalScale, 1);
    assertVisible(garden.camera, game, layout);
    const frozen = { camera: garden.camera, score: game.score, elapsed: game.elapsed, position: game.position };
    for (let frame = 0; frame < 120; frame++) garden.draw(game, 0, true);
    assert.deepEqual({ camera: garden.camera, score: game.score, elapsed: game.elapsed, position: game.position }, frozen);
    for (let frame = 0; frame < 180; frame++) {
      coverLanding(game);
      assert.notEqual(game.tick(1 / 60), 'miss');
      garden.draw(game, 1 / 60, true);
      assertVisible(garden.camera, game, layout);
    }
  }
  assert.ok(game.landings > 6);
});
