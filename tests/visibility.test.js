import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay, TIMING, platformHeight } from '../site/game.js';
import { sceneLayout, trackedCameraView, followCamera, reframeCamera, PLAYER_HALF_CELL, arcHeight } from '../site/art.js';

const scenes = [
  [294, 396, 83], [350, 672, 83], [400, 268, 56], [432, 268, 56],
  [510, 268, 56], [756, 338, 56], [690, 750, 89], [1184, 697, 89],
];
const platformPeakSpeed = 1.5 / TIMING.platformPerCell;

function course() {
  const game = new Relay(() => 0.99);
  game.generatedThrough = 8192;
  for (let i = 0; i <= 8192; i++) game.course.set(i, 1);
  for (let cell = 2, i = 0; cell < 8000; i++) {
    const kind = [1, 3, 2, 3, 0, 2, 3, 1][i % 8];
    game.course.set(cell, kind);
    cell += kind || 3;
  }
  game.move(1);
  return game;
}

function assertBodies(camera, game, layout, label) {
  const x = cell => layout.origin + (cell - 1 - camera) * layout.cell;
  const halfPlayer = PLAYER_HALF_CELL * layout.verticalCell;
  assert.ok(x(game.position) - halfPlayer >= layout.margin - 0.01, `${label}: player left`);
  assert.ok(x(game.position) + halfPlayer <= layout.width - layout.margin + 0.01, `${label}: player right`);
  for (const platform of game.platforms) {
    const center = x(game.visualCell(platform));
    assert.ok(center - layout.platform.width / 2 >= layout.margin - 0.01, `${label}: platform ${platform.id} left`);
    assert.ok(center + layout.platform.width / 2 <= layout.width - layout.margin + 0.01, `${label}: platform ${platform.id} right`);
  }
}

function play(layout, fps, { delay, order, prepareReveal }) {
  const game = course();
  game.cellWidth = layout.cell;
  game.verticalScale = layout.verticalCell / layout.cell;
  let camera = 0;
  let previousGoal = trackedCameraView(game, layout).goal;
  let key = '', commands = 0, revealPrepared = false;
  let reveals = 0, triples = 0;
  for (let frame = 0; frame < fps * 100 && game.landings < 80; frame++) {
    const flight = `${game.start}:${game.phase}`;
    if (flight !== key) { key = flight; commands = 0; revealPrepared = false; }
    const elapsed = game.flightElapsed;
    if (game.phase === 'reveal') {
      if (prepareReveal && !revealPrepared && elapsed >= delay) {
        game.move(game.revealNumber === 3 ? order[0] : game.revealNumber);
        revealPrepared = true;
      }
    } else if (!game.platforms.some(p => p.cell === game.target)
      && elapsed >= delay + commands * 0.045) {
      const front = Math.max(...game.platforms.map(p => p.cell));
      const remaining = game.target - front;
      assert.ok(remaining > 0 && remaining <= 3, 'Correct relay inputs leave a reachable landing');
      game.move(remaining === 3 ? order[0] : remaining);
      commands++;
    }
    const before = camera;
    const event = game.tick(1 / fps);
    assert.notEqual(event, 'miss', `${layout.width}px ${fps}Hz delay ${delay}, order ${order}, landing ${game.landings}`);
    const view = trackedCameraView(game, layout);
    assert.equal(view.allFit, true, 'Valid relay courses fit all actual bodies');
    camera = followCamera(camera, view, 1 / fps, previousGoal);
    previousGoal = view.goal;
    assert.ok(Math.abs(camera - before) <= platformPeakSpeed * 1.05 / fps + 1e-9, 'Framing cannot teleport faster than moving platforms');
    assertBodies(camera, game, layout, `${layout.width}px ${fps}Hz`);
    if (event === 'reveal') reveals++;
    if (event === 'land' && game.distance === 3) triples++;
  }
  assert.equal(game.landings, 80);
  assert.ok(triples > 0 && reveals > 0);
  assert.equal(game.score, 96);
}

test('both real platforms stay fully visible with delayed inputs, either triple order, and reveal preparation', () => {
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    for (const fps of [30, 60, 120, 144]) {
      for (const order of [[1, 2], [2, 1]]) {
        for (const delay of [0, 0.08, 0.12]) play(layout, fps, { delay, order, prepareReveal: delay === 0.08 });
      }
    }
  }
});

test('tracking uses interpolated platform bodies, not their far-away command destinations', () => {
  const layout = sceneLayout(350, 672, 83);
  const game = new Relay();
  game.position = 10;
  game.target = 13;
  game.platforms = [
    { cell: 200, from: 9, motion: 0, fromLift: 0 },
    { cell: 10, from: 10, motion: 1, fromLift: 0 },
  ];
  const view = trackedCameraView(game, layout);
  assert.equal(view.allFit, true);
  assert.ok(view.right < 11);
  assertBodies(reframeCamera(0, view), game, layout, 'Moving rear platform');
});

test('impossible over-input spans preserve the player and nearest rear platform instead of following the distant platform', () => {
  const layout = sceneLayout(350, 672, 83);
  const game = new Relay();
  game.position = 10;
  game.platforms = [{ cell: 10, from: 10, motion: 1 }, { cell: 200, from: 200, motion: 1 }];
  const view = trackedCameraView(game, layout);
  assert.equal(view.allFit, false);
  const camera = reframeCamera(0, view);
  const player = layout.origin + (game.position - 1 - camera) * layout.cell;
  const half = Math.max(PLAYER_HALF_CELL * layout.verticalCell, layout.platform.width / 2);
  assert.ok(player - half >= layout.margin - 0.01);
  assert.ok(player + half <= layout.width - layout.margin + 0.01);
  assert.ok(view.goal < 12);
});

test('compact landscapes retain readable platform length and travel distance while fitting a shallower arc', () => {
  for (const dimensions of [[432, 268, 56], [510, 268, 56], [756, 338, 56]]) {
    const layout = sceneLayout(...dimensions);
    assert.ok(layout.cell >= 78 && layout.cell <= 132);
    assert.ok(layout.platform.width >= 60);
    assert.equal(layout.platform.width, layout.cell * 0.78);
    assert.ok(layout.verticalCell < layout.cell);
    assert.ok(layout.verticalCell * 0.77 >= 35);
    assert.ok(arcHeight(3, 'jump', layout.verticalCell) < arcHeight(3, 'jump', layout.cell));
    assert.ok(layout.base - layout.verticalCell * (0.77 * 1.42 + 1.2) >= layout.hud - 0.01);
    assert.ok(layout.base + layout.platform.shadowY + layout.platform.shadowRadius <= layout.floor);
    const game = new Relay(() => 0);
    game.cellWidth = layout.cell;
    game.verticalScale = layout.verticalCell / layout.cell;
    for (const [distance, duration] of [[1, 0.62], [2, 0.78], [3, 1.175]]) {
      game.distance = distance;
      assert.ok(Math.abs(game.duration() - duration) < 1e-12);
    }
  }
});

test('flattened platform lift and vertical landing tolerance use the same screen-space scale', () => {
  const game = new Relay();
  game.cellWidth = 110;
  game.target = 2;
  game.platforms = [
    { cell: 2, from: 1, motion: 0.73, fromLift: 0 },
    { cell: 0, from: 0, motion: 1, fromLift: 0 },
  ];
  const moving = game.platforms[0];
  const tolerance = Math.max(8, platformHeight(game.cellWidth) * 0.24);
  assert.ok(game.visualLift(moving) * game.cellWidth > tolerance);
  assert.equal(game.supportivePlatform(), undefined);
  game.verticalScale = 0.6;
  assert.ok(game.visualLift(moving) * game.cellWidth * game.verticalScale < tolerance);
  assert.equal(game.supportivePlatform(), moving);
  moving.motion = 0.55;
  assert.equal(game.supportivePlatform(), undefined, 'Vertical compression must not relax horizontal support');
});
