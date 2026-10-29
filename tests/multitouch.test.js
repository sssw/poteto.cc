import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMoveButton, bindGameGestures } from '../site/input.js';
import { Relay } from '../site/game.js';
import { sceneLayout, trackedCameraView, reframeCamera } from '../site/art.js';
import { inputScenarios } from './browser/scenarios.js';

function emit(target, type, fields = {}) {
  const event = new Event(type, { cancelable: fields.cancelable ?? true });
  const { cancelable, ...rest } = fields;
  Object.assign(event, rest);
  target.dispatchEvent(event);
  return event;
}

test('rapid and overlapping contacts reach the game model exactly once', () => {
  const results = inputScenarios({ bindMoveButton, bindGameGestures, Relay }, () => new EventTarget(), emit);
  assert.equal(results.length, 8);
  assert.ok(results.every(result => result.passed));
});

test('orientation changes between overlapping presses and releases preserve commands and progress', () => {
  for (const order of [[1, 2], [2, 1]]) {
    const game = new Relay(() => 0);
    game.course.set(2, 3);
    game.generatedThrough = 2;
    game.move(1);
    for (let i = 0; i < 62; i++) game.tick(0.01);
    assert.equal(game.landings, 1);
    const surfaces = [new EventTarget(), new EventTarget()];
    surfaces.forEach((surface, i) => bindMoveButton(surface, () => game.move(i + 1)));
    bindGameGestures(new EventTarget(), surfaces);
    emit(surfaces[order[0] - 1], 'pointerdown', { button: 0, pointerType: 'touch', pointerId: 1, isPrimary: true });
    for (const [width, height, controls] of [[510, 268, 56], [350, 672, 83]]) {
      const before = { moves: game.moves, progress: game.progress, score: game.score };
      const layout = sceneLayout(width, height, controls);
      game.cellWidth = layout.cell;
      game.verticalScale = layout.verticalCell / layout.cell;
      const camera = reframeCamera(0, trackedCameraView(game, layout));
      assert.ok(Number.isFinite(camera));
      assert.deepEqual({ moves: game.moves, progress: game.progress, score: game.score }, before);
    }
    emit(surfaces[order[1] - 1], 'pointerdown', { button: 0, pointerType: 'touch', pointerId: 2, isPrimary: false });
    for (const id of [2, 1]) {
      const surface = surfaces[order[id - 1] - 1];
      emit(surface, 'pointerup', { button: 0, pointerType: 'touch', pointerId: id });
      emit(surface, 'touchend');
      emit(surface, 'click', { detail: 1, pointerType: 'touch' });
    }
    assert.equal(game.moves, 3);
    assert.ok(game.platforms.some(p => p.cell === game.target));
    for (let i = 0; i < 118; i++) assert.notEqual(game.tick(0.01), 'miss');
    assert.equal(game.landings, 2);
  }
});
