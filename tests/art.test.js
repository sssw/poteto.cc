import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneLayout, followCamera, arcHeight } from '../site/art.js';

const scenes = [
  [294, 330, 83], [350, 672, 83], [510, 215, 64],
  [760, 285, 64], [690, 750, 89], [1170, 697, 89],
];

test('all jump arcs fit below the HUD and above controls at supported screen sizes', () => {
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    const { base, cell, hud, floor } = layout;
    const size = cell * 0.77;
    for (const distance of [0, 1, 2, 3]) {
      for (let frame = 0; frame <= 120; frame++) {
        const progress = frame / 120;
        const squash = Math.max(0, 1 - progress / 0.22);
        const stretch = Math.sin(progress * Math.PI) * 0.06;
        const scaleY = 1 - squash * 0.14 + stretch;
        const top = base - size * 1.34 * scaleY
          - Math.sin(progress * Math.PI) * arcHeight(distance, distance === 0 ? 'reveal' : 'jump', cell);
        assert.ok(top >= hud - 1, `${dimensions}: jump ${distance} intersects the HUD`);
      }
    }
    assert.ok(base + 29 <= floor, `${dimensions}: platforms intersect the controls`);
    assert.ok(cell >= 28, `${dimensions}: game pieces are too small`);
  }
});

test('forward camera keeps the potato and three-space target on screen across long runs', () => {
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    let camera = 0;
    let start = 1;
    for (let jump = 0; jump < 100; jump++) {
      const distance = jump % 3 + 1;
      const target = start + distance;
      for (let frame = 0; frame <= 120; frame++) {
        const position = start + distance * frame / 120;
        const previous = camera;
        camera = followCamera(camera, position, target, layout, 1 / 120);
        assert.ok(camera >= previous, 'The camera must never pull the world backward');
        const playerX = layout.origin + (position - 1 - camera) * layout.cell;
        const targetX = layout.origin + (target - 1 - camera) * layout.cell;
        assert.ok(playerX - layout.cell * 0.48 >= layout.margin - 0.01);
        assert.ok(playerX + layout.cell * 0.48 <= layout.width - layout.margin + 0.01);
        assert.ok(targetX + layout.cell * 0.45 <= layout.width - layout.margin + 0.01);
      }
      start = target;
    }
  }
});

test('camera response does not depend on display refresh rate', () => {
  const layout = sceneLayout(1170, 697, 89);
  const after = fps => {
    let camera = 0;
    for (let frame = 0; frame < fps; frame++) {
      camera = followCamera(camera, 5, 7, layout, 1 / fps);
    }
    return camera;
  };
  assert.ok(Math.abs(after(30) - after(60)) < 1e-12);
  assert.ok(Math.abs(after(60) - after(120)) < 1e-12);
});

test('rotating between supported layouts keeps the camera moving forward without clipping the player', () => {
  let camera = 0;
  for (let step = 0; step < 100; step++) {
    const position = 1 + step * 0.5;
    const layout = sceneLayout(...scenes[step % scenes.length]);
    const previous = camera;
    camera = followCamera(camera, position, position + 3, layout, 1 / 60);
    const playerX = layout.origin + (position - 1 - camera) * layout.cell;
    assert.ok(camera >= previous);
    assert.ok(playerX - layout.cell * 0.48 >= layout.margin - 0.01);
  }
});


test('mystery reveal uses the native 1.2-cell in-place arc', () => {
  assert.equal(arcHeight(0, 'reveal', 100), 120);
  assert.equal(arcHeight(1, 'jump', 100), 82);
  assert.ok(Math.abs(arcHeight(3, 'jump', 100) - 114) < 1e-12);
  for (const dimensions of scenes) {
    const layout = sceneLayout(...dimensions);
    let camera = followCamera(0, 30, 30, layout, 1 / 60);
    for (let frame = 0; frame <= 75; frame++) {
      camera = followCamera(camera, 30, 30, layout, 1 / 120);
      const x = layout.origin + (30 - 1 - camera) * layout.cell;
      assert.ok(x - layout.cell * 0.48 >= layout.margin - 0.01);
      assert.ok(x + layout.cell * 0.48 <= layout.width - layout.margin + 0.01);
    }
  }
});
