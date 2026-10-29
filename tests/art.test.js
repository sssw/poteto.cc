import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneLayout, followCamera, arcHeight, platformMetrics, PLAYER_HALF_CELL, reframeCamera, trackedCameraView } from '../site/art.js';
import { Relay, platformHeight } from '../site/game.js';

const scenes = [
  { name: 'short phone', dimensions: [294, 330, 83] },
  { name: 'small phone', dimensions: [294, 396, 83] },
  { name: 'phone', dimensions: [350, 672, 83] },
  { name: 'small landscape', dimensions: [510, 268, 56] },
  { name: 'wide landscape', dimensions: [756, 338, 56] },
  { name: 'tablet', dimensions: [690, 750, 89] },
  { name: 'desktop', dimensions: [1184, 697, 89] },
  { name: 'tall desktop', dimensions: [1184, 750, 89] },
  { name: 'wide canvas', dimensions: [1920, 1000, 89] },
];

function assertFraming(camera, game, layout, message) {
  const playerX = layout.origin + (game.position - 1 - camera) * layout.cell;
  const playerHalf = PLAYER_HALF_CELL * layout.verticalCell;
  assert.ok(playerX - playerHalf >= layout.margin - 0.01, `${message}: player clips left`);
  assert.ok(playerX + playerHalf <= layout.width - layout.margin + 0.01, `${message}: player clips right`);
  for (const platform of game.platforms) {
    const x = layout.origin + (game.visualCell(platform) - 1 - camera) * layout.cell;
    assert.ok(x - layout.platform.width / 2 >= layout.margin - 0.01, `${message}: actual platform clips left`);
    assert.ok(x + layout.platform.width / 2 <= layout.width - layout.margin + 0.01, `${message}: actual platform clips right`);
  }
}

function mixedGame() {
  const game = new Relay(() => 0.99);
  game.generatedThrough = 4096;
  for (let cell = 0; cell <= 4096; cell++) game.course.set(cell, 1);
  for (let cell = 2, i = 0; cell < 4000; i++) {
    const kind = [1, 3, 2, 3, 3, 0][i % 6];
    game.course.set(cell, kind);
    cell += kind || 3;
  }
  game.move(1);
  return game;
}

function finishFlight(game, fps = 120) {
  for (let frame = 0; frame < fps * 2; frame++) {
    const event = game.tick(1 / fps);
    if (event) return event;
  }
  assert.fail('A flight did not resolve within two seconds');
}

function coverLanding(game) {
  while (!game.platforms.some(platform => platform.cell === game.target)) {
    const front = Math.max(...game.platforms.map(platform => platform.cell));
    const distance = game.target - front;
    assert.ok(distance > 0, 'The next landing must remain reachable');
    assert.equal(game.move(Math.min(2, distance)), true);
  }
}

test('roomy playfields enlarge the potato, platforms and labels together without forcing compact screens', () => {
  const phone = sceneLayout(350, 672, 83);
  const tablet = sceneLayout(690, 750, 89);
  const desktop = sceneLayout(1184, 697, 89);
  const compact = sceneLayout(510, 268, 56);
  assert.ok(desktop.cell >= 160 && desktop.cell <= 190);
  assert.ok(tablet.cell >= 115 && tablet.cell < desktop.cell);
  assert.ok(desktop.platform.width > 112 * 0.78 * 1.4, 'Desktop platforms must grow materially beyond the former cap');
  assert.ok(tablet.platform.width > (690 / 8.2) * 0.78 * 1.3);
  assert.ok(phone.cell <= 70, 'A narrow phone retains space for the relay');
  assert.ok(compact.cell >= 78 && compact.cell <= 132, 'Compact landscape spacing follows the native horizontal range');
  assert.ok(compact.verticalCell < compact.cell, 'Short landscapes flatten the arc instead of crushing horizontal spacing');
  assert.ok(compact.platform.width >= 60 && compact.verticalCell * 0.77 >= 35);
  for (const key of ['width', 'height', 'badge', 'label', 'ghostLabel', 'effectScale']) {
    assert.ok(desktop.platform[key] > phone.platform[key], `${key} should grow with the scene`);
  }
});

test('platform metrics use the collision height and keep their badges and shadows inside the reserved space', () => {
  for (const cell of [28, 40, 54, 64, 82, 96, 125, 160, 180]) {
    const metrics = platformMetrics(cell);
    assert.equal(metrics.height, platformHeight(cell));
    assert.ok(metrics.height >= 30 && metrics.height <= 48);
    assert.ok(metrics.top > 0 && metrics.top <= metrics.height);
    assert.ok(metrics.label <= metrics.badge * 2);
    assert.ok(metrics.height * 0.52 - metrics.badge >= 0);
    assert.ok(metrics.height * 0.52 + metrics.badge <= metrics.height);
    assert.ok(metrics.shadowY + metrics.shadowRadius <= metrics.height + metrics.bottomPadding);
    assert.ok(metrics.ghostLabel <= metrics.label);
  }
  // The arms and stroke at maximum takeoff squash reach about 0.527 cells.
  assert.ok(PLAYER_HALF_CELL >= (54 / 90) * 0.77 * 1.14);
});

test('opening layout keeps both relay platforms and the two available destinations fully in view', () => {
  let ghostChecks = 0;
  for (const scene of scenes) {
    const layout = sceneLayout(...scene.dimensions);
    const game = new Relay();
    const camera = reframeCamera(0, trackedCameraView(game, layout));
    const screenX = cell => layout.origin + (cell - 1 - camera) * layout.cell;
    for (const platform of game.platforms) {
      const x = screenX(platform.cell);
      assert.ok(x - layout.platform.width / 2 >= layout.margin - 0.01,
        `${scene.name}: opening platform ${platform.id} clips the left margin`);
      assert.ok(x + layout.platform.width / 2 <= layout.width - layout.margin + 0.01,
        `${scene.name}: opening platform ${platform.id} clips the right margin`);
    }
    const front = Math.max(...game.platforms.map(platform => platform.cell));
    const rear = Math.min(...game.platforms.map(platform => platform.cell));
    const ghostHalfWidth = layout.cell * 0.37 + 0.75;
    const fullSpan = (front + 2 - rear) * layout.cell + layout.platform.width / 2 + ghostHalfWidth;
    if (fullSpan <= layout.width - 2 * layout.margin) {
      for (const step of [1, 2]) {
        const x = screenX(front + step);
        assert.ok(x - ghostHalfWidth >= layout.margin - 0.01,
          `${scene.name}: opening +${step} destination clips left`);
        assert.ok(x + ghostHalfWidth <= layout.width - layout.margin + 0.01,
          `${scene.name}: opening +${step} destination clips right`);
        ghostChecks++;
      }
    }
  }
  assert.equal(ghostChecks, scenes.length * 2, 'Every supported opening has room for both destination hints');
});

test('all jump arcs fit below the HUD and the full platform shadow stays above the controls', () => {
  for (const scene of scenes) {
    const layout = sceneLayout(...scene.dimensions);
    const { base, cell, verticalCell, hud, floor, platform } = layout;
    const size = verticalCell * 0.77;
    for (const distance of [0, 1, 2, 3]) {
      for (let frame = 0; frame <= 120; frame++) {
        const progress = frame / 120;
        const squash = Math.max(0, 1 - progress / 0.22);
        const stretch = Math.sin(progress * Math.PI) * 0.06;
        const scaleY = 1 - squash * 0.14 + stretch;
        const scaleX = 1 + squash * 0.14 - stretch * 0.5;
        const tilt = Math.sin(progress * Math.PI * 2) * 0.035;
        const headExtent = size * (0.87 * scaleY * Math.cos(tilt) + 0.60 * scaleX * Math.abs(Math.sin(tilt)));
        const top = base - size * 0.47 * scaleY - headExtent
          - Math.sin(progress * Math.PI) * arcHeight(distance, distance === 0 ? 'reveal' : 'jump', verticalCell);
        assert.ok(top >= hud - 1, `${scene.name}: jump ${distance} intersects the HUD`);
      }
    }
    assert.ok(base + platform.shadowY + platform.shadowRadius <= floor + 0.01, `${scene.name}: shadow intersects the controls`);
    assert.ok(cell >= 28, `${scene.name}: game pieces are too small`);
  }
});

test('available width and height change game geometry continuously through orientation thresholds', () => {
  for (const height of [240, 400, 450, 480, 750]) {
    let previous = null;
    for (let width = 294; width <= 1920; width++) {
      const layout = sceneLayout(width, height, 83);
      if (previous) {
        assert.ok(Math.abs(layout.cell - previous.cell) < 1, `Horizontal spacing jumps at width ${width}`);
        assert.ok(Math.abs(layout.verticalCell - previous.verticalCell) < 1, `Vertical framing jumps at width ${width}`);
      }
      previous = layout;
    }
  }
  for (const width of [350, 400, 510, 690, 1184]) {
    let previous = null;
    for (let floor = 150; floor <= 850; floor++) {
      const layout = sceneLayout(width, floor + 89, 89);
      if (previous) {
        assert.ok(layout.cell + 1e-9 >= previous.cell, `Extra height shrinks horizontal spacing at ${width}×${floor}`);
        assert.ok(layout.verticalCell + 1e-9 >= previous.verticalCell, `Extra height shrinks the visible arc at ${width}×${floor}`);
        assert.ok(Math.abs(layout.cell - previous.cell) < 1, `Horizontal spacing jumps at height ${floor}`);
        assert.ok(Math.abs(layout.verticalCell - previous.verticalCell) < 1, `Vertical framing jumps at height ${floor}`);
      }
      previous = layout;
    }
  }
});

test('camera keeps actual relay platforms and the potato visible through mixed native jumps', () => {
  for (const scene of scenes) {
    const layout = sceneLayout(...scene.dimensions);
    const game = mixedGame();
    game.cellWidth = layout.cell;
    game.verticalScale = layout.verticalCell / layout.cell;
    let camera = 0;
    let previousGoal = trackedCameraView(game, layout).goal;
    for (let frame = 0; frame < 3600; frame++) {
      coverLanding(game);
      assert.notEqual(game.tick(1 / 60), 'miss');
      const view = trackedCameraView(game, layout);
      camera = followCamera(camera, view, 1 / 60, previousGoal);
      previousGoal = view.goal;
      assertFraming(camera, game, layout, scene.name);
    }
  }
});

test('camera response to a fixed tracked view does not depend on display refresh rate', () => {
  const layout = sceneLayout(1184, 697, 89);
  const game = new Relay();
  game.position = 6;
  game.platforms = [{ cell: 4, from: 4, motion: 1 }, { cell: 6, from: 6, motion: 1 }];
  const view = trackedCameraView(game, layout);
  const after = fps => {
    let camera = reframeCamera(0, view);
    for (let frame = 0; frame < fps; frame++) camera = followCamera(camera, view, 1 / fps);
    return camera;
  };
  assert.ok(Math.abs(after(30) - after(60)) < 1e-12);
  assert.ok(Math.abs(after(60) - after(120)) < 1e-12);
});

test('resizing paused or moving gameplay reframes actual bodies without leaving either platform behind', () => {
  for (const scene of scenes) {
    const layout = sceneLayout(...scene.dimensions);
    const game = mixedGame();
    game.cellWidth = layout.cell;
    game.verticalScale = layout.verticalCell / layout.cell;
    let camera = 0;
    let previousGoal = trackedCameraView(game, layout).goal;
    for (let frame = 0; frame < 1800; frame++) {
      coverLanding(game);
      assert.notEqual(game.tick(1 / 60), 'miss');
      const view = trackedCameraView(game, layout);
      camera = followCamera(camera, view, 1 / 60, previousGoal);
      previousGoal = view.goal;
      if (frame % 15 !== 0) continue;
      for (const destination of scenes) {
        const resized = sceneLayout(...destination.dimensions);
        const nextView = trackedCameraView(game, resized);
        assert.equal(nextView.allFit, true);
        const framed = reframeCamera(camera, nextView);
        assertFraming(framed, game, resized, `${scene.name} to ${destination.name}`);
        assert.equal(followCamera(framed, nextView, 0), framed);
      }
    }
  }
});

test('mystery reveals retain their native arc and timing at every display scale', () => {
  assert.equal(arcHeight(0, 'reveal', 100), 120);
  assert.equal(arcHeight(1, 'jump', 100), 82);
  assert.ok(Math.abs(arcHeight(3, 'jump', 100) - 114) < 1e-12);
  for (const scene of scenes) {
    const game = new Relay(() => 0);
    const layout = sceneLayout(...scene.dimensions);
    game.cellWidth = layout.cell;
    game.verticalScale = layout.verticalCell / layout.cell;
    game.course.set(2, 0);
    game.generatedThrough = 2;
    game.move(1);
    assert.equal(finishFlight(game), 'land');
    assert.equal(game.phase, 'reveal');
    assert.equal(game.duration(), 0.62);
    const score = game.score;
    assert.equal(finishFlight(game), 'reveal');
    assert.equal(game.score, score);
  }
});

test('rescaled collision geometry preserves long playable runs with all platform kinds', () => {
  for (const scene of scenes) {
    let seed = 23456789;
    const game = new Relay(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    });
    const layout = sceneLayout(...scene.dimensions);
    game.cellWidth = layout.cell;
    game.verticalScale = layout.verticalCell / layout.cell;
    game.move(1);
    const kinds = new Set();
    let reveals = 0;
    while (game.landings < 150) {
      const revealing = game.phase === 'reveal';
      kinds.add(game.distance);
      coverLanding(game);
      assert.equal(finishFlight(game), revealing ? 'reveal' : 'land', scene.name);
      if (revealing) reveals++;
      assert.equal(game.score, game.landings + Math.floor(game.landings / 5));
      assert.equal(game.platforms.length, 2);
    }
    assert.deepEqual([...kinds].sort(), [0, 1, 2, 3]);
    assert.ok(reveals > 0);
  }
});

test('welcome scene platforms and their shadows fit within the illustration area', () => {
  for (const [width, height, controls] of [[294, 490, 83], [350, 510, 83], [510, 310, 64], [1184, 480, 89]]) {
    const layout = sceneLayout(width, height, controls, false);
    const rearX = layout.origin - layout.cell;
    assert.ok(rearX - layout.platform.width / 2 >= 0);
    assert.ok(layout.base + layout.platform.shadowY + layout.platform.shadowRadius <= layout.floor);
  }
});

test('stacked welcome copy leaves room for the complete idle character and both platforms', () => {
  for (const [width, height, control, copyBottom] of [[294, 490, 83, 280], [350, 510, 83, 275], [350, 510, 83, 300]]) {
    const layout = sceneLayout(width, height, control, false, copyBottom);
    assert.ok(layout.idleSize >= 40);
    assert.ok(layout.base - layout.idleSize * 1.42 - layout.idleBounce >= copyBottom + 12 - 1e-9);
    assert.ok(layout.base + layout.platform.shadowY + layout.platform.shadowRadius <= layout.floor);
  }
});
