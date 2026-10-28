import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneLayout, followCamera, arcHeight, platformMetrics, PLAYER_HALF_CELL, reframeCamera } from '../site/art.js';
import { Relay, platformHeight } from '../site/game.js';

const scenes = [
  { name: 'short phone', dimensions: [294, 330, 83] },
  { name: 'small phone', dimensions: [294, 396, 83] },
  { name: 'phone', dimensions: [350, 672, 83] },
  { name: 'small landscape', dimensions: [510, 240, 64] },
  { name: 'wide landscape', dimensions: [756, 310, 64] },
  { name: 'tablet', dimensions: [690, 750, 89] },
  { name: 'desktop', dimensions: [1184, 697, 89] },
  { name: 'tall desktop', dimensions: [1184, 750, 89] },
  { name: 'wide canvas', dimensions: [1920, 1000, 89] },
];

function assertFraming(camera, position, target, layout, message) {
  const playerX = layout.origin + (position - 1 - camera) * layout.cell;
  const targetX = layout.origin + (target - 1 - camera) * layout.cell;
  assert.ok(playerX - layout.cell * PLAYER_HALF_CELL >= layout.margin - 0.01, `${message}: player clips left`);
  assert.ok(playerX + layout.cell * PLAYER_HALF_CELL <= layout.width - layout.margin + 0.01, `${message}: player clips right`);
  assert.ok(targetX + layout.cell * 0.45 <= layout.width - layout.margin + 0.01, `${message}: target clips right`);
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
  const compact = sceneLayout(510, 240, 64);
  assert.ok(desktop.cell >= 160 && desktop.cell <= 190);
  assert.ok(tablet.cell >= 115 && tablet.cell < desktop.cell);
  assert.ok(desktop.platform.width > 112 * 0.78 * 1.4, 'Desktop platforms must grow materially beyond the former cap');
  assert.ok(tablet.platform.width > (690 / 8.2) * 0.78 * 1.3);
  assert.ok(phone.cell <= 70, 'A narrow phone retains space for the relay');
  assert.ok(compact.cell < phone.cell, 'Short landscapes must be limited by their height');
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
    const camera = reframeCamera(0, game.position, game.target, layout);
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
    const { base, cell, hud, floor, platform } = layout;
    const size = cell * 0.77;
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
          - Math.sin(progress * Math.PI) * arcHeight(distance, distance === 0 ? 'reveal' : 'jump', cell);
        assert.ok(top >= hud - 1, `${scene.name}: jump ${distance} intersects the HUD`);
      }
    }
    assert.ok(base + platform.shadowY + platform.shadowRadius <= floor + 0.01, `${scene.name}: shadow intersects the controls`);
    assert.ok(cell >= 28, `${scene.name}: game pieces are too small`);
  }
});

test('available width and height increase piece size smoothly through former breakpoints', () => {
  for (const height of [240, 400, 750]) {
    let previous = 0;
    for (let width = 294; width <= 1920; width++) {
      const cell = sceneLayout(width, height, 83).cell;
      assert.ok(cell + 1e-10 >= previous, `Pieces shrink at width ${width}`);
      if (previous) assert.ok(cell - previous < 0.3, `A width breakpoint jumps at ${width}`);
      previous = cell;
    }
  }
  for (const width of [350, 690, 1184]) {
    let previous = 0;
    for (let floor = 150; floor <= 850; floor++) {
      const cell = sceneLayout(width, floor + 89, 89).cell;
      assert.ok(cell + 1e-10 >= previous, `Pieces shrink at playfield height ${floor}`);
      if (previous) assert.ok(cell - previous < 0.6, `A height breakpoint jumps at ${floor}`);
      previous = cell;
    }
  }
});

test('forward camera keeps complete players and targets visible through long mixed jumps and reveals', () => {
  for (const scene of scenes) {
    const layout = sceneLayout(...scene.dimensions);
    for (const fps of [30, 60, 120, 144]) {
      let camera = 0;
      let start = 1;
      for (let jump = 0; jump < 80; jump++) {
        const distance = [1, 3, 2, 0][jump % 4];
        const target = start + distance;
        const duration = [0.62, 0.62, 0.78, 1.175][distance];
        let previousPosition = start;
        for (let time = 0; time < duration - 1e-10;) {
          const dt = Math.min(1 / fps, duration - time);
          time += dt;
          const position = start + distance * time / duration;
          const previous = camera;
          camera = followCamera(camera, position, target, layout, dt, previousPosition);
          previousPosition = position;
          assert.ok(camera >= previous, 'The camera must never pull the world backward');
          assertFraming(camera, position, target, layout, `${scene.name} at ${fps} Hz`);
        }
        start = target;
      }
    }
  }
});

test('camera response to a fixed view does not depend on display refresh rate', () => {
  const layout = sceneLayout(1184, 697, 89);
  const after = fps => {
    let camera = reframeCamera(0, 5, 7, layout);
    for (let frame = 0; frame < fps; frame++) camera = followCamera(camera, 5, 7, layout, 1 / fps);
    return camera;
  };
  assert.ok(Math.abs(after(30) - after(60)) < 1e-12);
  assert.ok(Math.abs(after(60) - after(120)) < 1e-12);
});

test('every pair of supported layouts can resize during flight or a paused reveal without clipping', () => {
  for (const scene of scenes) {
    const original = sceneLayout(...scene.dimensions);
    let camera = 0;
    let start = 1;
    for (let jump = 0; jump < 24; jump++) {
      const distance = [1, 2, 3, 0][jump % 4];
      const target = start + distance;
      const duration = [0.62, 0.62, 0.78, 1.175][distance];
      let previousPosition = start;
      for (let time = 0; time < duration - 1e-10;) {
        const dt = Math.min(1 / 60, duration - time);
        time += dt;
        const position = start + distance * time / duration;
        camera = followCamera(camera, position, target, original, dt, previousPosition);
        previousPosition = position;
        for (const destination of scenes) {
          const layout = sceneLayout(...destination.dimensions);
          const rotated = reframeCamera(camera, position, target, layout);
          assert.ok(rotated >= camera);
          assertFraming(rotated, position, target, layout, `${scene.name} to ${destination.name}, jump ${distance}`);
          assert.equal(followCamera(rotated, position, target, layout, 0), rotated, 'A paused camera must settle without drifting');
        }
      }
      start = target;
    }
  }
});

test('mystery reveals retain their native arc and timing at every display scale', () => {
  assert.equal(arcHeight(0, 'reveal', 100), 120);
  assert.equal(arcHeight(1, 'jump', 100), 82);
  assert.ok(Math.abs(arcHeight(3, 'jump', 100) - 114) < 1e-12);
  for (const scene of scenes) {
    const game = new Relay(() => 0);
    game.cellWidth = sceneLayout(...scene.dimensions).cell;
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
    game.cellWidth = sceneLayout(...scene.dimensions).cell;
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
