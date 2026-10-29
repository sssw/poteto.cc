import { bindMoveButton, bindGameGestures } from '/input.js';
import { Relay } from '/game.js';
import { inputScenarios } from './scenarios.js';

const $ = id => document.getElementById(id);
$('browser').textContent = navigator.userAgent;
const emit = (target, type, fields = {}) => {
  const options = { bubbles: true, cancelable: fields.cancelable ?? true, ...fields };
  const event = type.startsWith('pointer') || type === 'click'
    ? new PointerEvent(type, options) : new Event(type, options);
  target.dispatchEvent(event);
  return event;
};
$('run').addEventListener('click', () => {
  try {
    const cases = inputScenarios({ bindMoveButton, bindGameGestures, Relay }, () => document.createElement('button'), emit);
    const styles = ['html', 'body', '.game', '.controls', '.move', '.scroll-check'].map(selector => ({ selector, touchAction: getComputedStyle(document.querySelector(selector)).touchAction }));
    if (styles.some(item => !['none', 'manipulation'].includes(item.touchAction))) throw new Error('A touch region has an unexpected gesture policy');
    $('report').textContent = JSON.stringify({ passed: cases.length, failed: 0, cases, styles }, null, 2);
    $('report').dataset.passed = String(cases.length);
  } catch (error) {
    $('report').textContent = error.stack;
    $('report').dataset.passed = '0';
  }
});

const counts = { commands: 0, spaces: 0, left: 0, right: 0, contacts: [], recentEvents: [] };
const update = () => { $('native-result').textContent = JSON.stringify(counts, null, 2); };
bindGameGestures($('pad'), [$('controls')]);
for (const [side, spaces] of [['left', 1], ['right', 2]]) {
  const button = $(side);
  bindMoveButton(button, () => {
    counts.commands++;
    counts.spaces += spaces;
    counts[side]++;
    update();
  });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    button.addEventListener(type, event => {
      counts.contacts = counts.contacts.filter(id => id !== event.pointerId);
      if (type === 'pointerdown') counts.contacts.push(event.pointerId);
      counts.recentEvents.push(`${type} ${event.pointerType} ${event.pointerId} ${side}`);
      counts.recentEvents = counts.recentEvents.slice(-8);
      update();
    });
  }
}
$('reset').addEventListener('click', () => {
  Object.assign(counts, { commands: 0, spaces: 0, left: 0, right: 0, contacts: [], recentEvents: [] });
  update();
});
const viewport = () => {
  $('viewport').textContent = JSON.stringify({ width: innerWidth, height: innerHeight, scale: visualViewport?.scale ?? 1, commandsAtResize: counts.commands });
};
window.addEventListener('resize', viewport);
window.visualViewport?.addEventListener('resize', viewport);
update();
viewport();
