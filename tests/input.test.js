import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMoveButton } from '../site/input.js';

function harness() {
  const button = new EventTarget();
  button.disabled = false;
  let count = 0;
  bindMoveButton(button, () => { count++; });
  return {
    button,
    get count() { return count; },
    fire(type, fields = {}) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, fields);
      button.dispatchEvent(event);
      return event;
    },
  };
}

test('mouse and touch activate on press rather than waiting for release', () => {
  for (const pointerType of ['mouse', 'touch', 'pen']) {
    const h = harness();
    const down = h.fire('pointerdown', { button: 0, pointerType });
    assert.equal(h.count, 1);
    assert.equal(down.defaultPrevented, true);
    h.fire('pointerup', { button: 0, pointerType });
    h.fire('click', { detail: 1, pointerType });
    assert.equal(h.count, 1, 'The compatibility click must not repeat the platform move');
  }
});

test('touch compatibility clicks with zero detail still cannot double a move', () => {
  const h = harness();
  h.fire('pointerdown', { button: 0, pointerType: 'touch' });
  h.fire('click', { detail: 0, pointerType: 'touch' });
  assert.equal(h.count, 1);
});

test('keyboard and assistive clicks work without a preceding pointer event', () => {
  const h = harness();
  h.fire('click', { detail: 0 });
  h.fire('click', { detail: 0, pointerType: '' });
  assert.equal(h.count, 2);
});

test('right and middle mouse buttons never move the platforms', () => {
  const h = harness();
  for (const button of [1, 2]) {
    const event = h.fire('pointerdown', { button, pointerType: 'mouse' });
    assert.equal(event.defaultPrevented, false);
    h.fire('click', { detail: 1, pointerType: 'mouse' });
  }
  assert.equal(h.count, 0);
});

test('disabled controls ignore both pointer and keyboard activation', () => {
  const h = harness();
  h.button.disabled = true;
  h.fire('pointerdown', { button: 0, pointerType: 'touch' });
  h.fire('click', { detail: 0 });
  assert.equal(h.count, 0);
  h.button.disabled = false;
  h.fire('click', { detail: 0 });
  assert.equal(h.count, 1);
});

test('rapid inputs and a second finger are not discarded or duplicated', () => {
  const h = harness();
  for (let i = 0; i < 40; i++) {
    const pointerId = i % 2 + 1;
    h.fire('pointerdown', { button: 0, pointerType: 'touch', pointerId, isPrimary: pointerId === 1 });
    h.fire('pointerup', { button: 0, pointerType: 'touch', pointerId });
    h.fire('click', { detail: 1, pointerType: 'touch', pointerId });
  }
  assert.equal(h.count, 40);
});
