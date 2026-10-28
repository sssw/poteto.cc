import { Relay, TIMING, shareText } from './game.js';
import { Garden } from './art.js';
import { Soundtrack } from './audio.js';
import { bindMoveButton } from './input.js';

const $ = id => document.getElementById(id);
const store = {
  read(key, fallback) {
    try {
      const value = localStorage.getItem('poteto:' + key);
      return value === null ? fallback : JSON.parse(value);
    } catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem('poteto:' + key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
  },
};
const game = new Relay();
const garden = new Garden($('scene'));
const audio = new Soundtrack();
let best = Number(store.read('best', 0)) || 0;
let muted = store.read('muted', false);
let gentle = store.read('gentle', matchMedia('(prefers-reduced-motion: reduce)').matches);
let active = false, paused = false, last = 0, lastDraw = 0, overDelay = 0;
let toastTimer, shareBusy = false;
$('best').textContent = best;

function preferences() {
  audio.setMuted(muted);
  garden.reduced = gentle;
  document.body.classList.toggle('gentle', gentle);
  $('sound').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
  $('sound').setAttribute('aria-pressed', String(muted));
  $('sound').title = muted ? 'Sound off' : 'Sound on';
  $('music-setting').checked = !muted;
  $('motion-setting').checked = gentle;
}
preferences();
function soundStart() { Promise.resolve(audio.start()).catch(() => {}); }
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
}
function updateScore() {
  $('score').textContent = game.score;
  $('jump-label').textContent = game.phase === 'reveal'
    ? `Revealed: ${game.revealNumber} · In-place bounce`
    : game.distance === 3 ? 'Next: 3 · +1 then +2' : `Next: ${game.distance} ${game.distance === 1 ? 'space' : 'spaces'}`;
  $('jump-label').dataset.distance = game.phase === 'reveal' ? 'reveal' : game.distance;
  $('jump-label').dataset.phase = game.phase;
}
function pulse(element, className) {
  if (gentle || !element.animate) return;
  for (const animation of element.getAnimations()) {
    if (animation.id === 'poteto-pulse') animation.cancel();
  }
  const frames = className === 'score-pop'
    ? [{ transform: 'scale(1.2)', color: '#657f43' }, { transform: 'scale(1)' }]
    : [{ backgroundColor: '#dce7bf' }, { backgroundColor: 'transparent' }];
  const animation = element.animate(frames, { duration: className === 'score-pop' ? 220 : 180, easing: 'ease-out' });
  animation.id = 'poteto-pulse';
}
function newGame() {
  game.reset();
  garden.camera = 0;
  garden.fall = 0;
  garden.particles = [];
  active = true;
  paused = false;
  overDelay = 0;
  last = lastDraw = performance.now();
  document.body.classList.add('playing');
  $('welcome').hidden = $('result').hidden = $('pause-screen').hidden = true;
  $('pause').hidden = false;
  $('controls').classList.add('teaching');
  $('share-copy').hidden = true;
  $('share-status').textContent = '';
  $('left').disabled = $('right').disabled = false;
  $('effects').replaceChildren();
  audio.setIntensity(0);
  audio.setPaused(false);
  soundStart();
  updateScore();
  $('jump-label').textContent = 'Tap left to start · Match 1';
  $('left').focus({ preventScroll: true });
}
function hearts(steps) {
  for (let i = 0; i < steps; i++) {
    const heart = document.createElement('span');
    heart.className = 'heart-pop';
    heart.textContent = '♥';
    heart.style.left = `${steps === 1 ? 23 : 73 + i * 3}%`;
    heart.style.setProperty('--drift', `${i ? 22 : -18}px`);
    heart.style.setProperty('--turn', `${i ? 14 : -12}deg`);
    heart.style.animationDelay = `${i * 0.055}s`;
    $('effects').append(heart);
    setTimeout(() => heart.remove(), 850);
  }
  while ($('effects').childElementCount > 24) $('effects').firstElementChild.remove();
}
function move(steps) {
  if (!active || paused || $('settings').open || game.status === 'over') return;
  advance(performance.now());
  if (game.move(steps)) {
    hearts(steps);
    pulse($(steps === 1 ? 'left' : 'right'), 'tapped');
    audio.move(steps);
    updateScore();
  }
}
function setPause(value) {
  if (!active || game.status === 'over') return;
  if (value && !paused) advance(performance.now());
  if (game.status === 'over') return;
  paused = value;
  audio.setPaused(value);
  $('pause-screen').hidden = !value;
  $('pause').hidden = value;
  if (value) $('resume').focus({ preventScroll: true });
  else {
    last = lastDraw = performance.now();
    soundStart();
    $('left').focus({ preventScroll: true });
  }
}
function finish() {
  const record = game.score > best;
  if (record) {
    best = game.score;
    store.write('best', best);
    $('best').textContent = best;
  }
  $('final-score').textContent = game.score;
  $('result-kicker').textContent = record ? 'A NEW PERSONAL BEST' : 'ONE LOVELY LITTLE RUN';
  $('result-title').textContent = record ? 'Look at you grow!' : 'Oop. A little tumble.';
  $('result-detail').textContent = game.score === 0 ? 'Match the number on your potato’s platform.' : `${game.landings} happy ${game.landings === 1 ? 'bounce' : 'bounces'}. Another little adventure?`;
  $('result').hidden = false;
  $('pause').hidden = true;
  $('left').disabled = $('right').disabled = true;
  audio.setPaused(true);
  $('retry').focus({ preventScroll: true });
}
async function share(score) {
  if (shareBusy) return;
  shareBusy = true;
  const text = score === null ? 'Small potato. Big leap. Play Poteto!' : shareText(score);
  const url = 'https://poteto.cc/';
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(`${text} ${url}`);
      $('share-status').textContent = 'Score and link copied!';
      toast(score === null ? 'Link copied. Spread a little joy.' : 'Score and link copied!');
    } else if (navigator.share) {
      try { await navigator.share({ title: 'Poteto', text, url }); }
      catch (error) { if (error.name !== 'AbortError') throw error; }
    } else throw new Error('Clipboard unavailable');
  } catch {
    if (score !== null) {
      $('share-copy').hidden = false;
      $('share-copy').value = `${text} ${url}`;
      $('share-copy').focus();
      $('share-copy').select();
      $('share-status').textContent = 'Copy your score and link below.';
    } else toast('Share this link: poteto.cc');
  } finally { shareBusy = false; }
}

$('play').addEventListener('click', newGame);
$('retry').addEventListener('click', newGame);
bindMoveButton($('left'), () => move(1));
bindMoveButton($('right'), () => move(2));
$('scene').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  const bounds = $('scene').getBoundingClientRect();
  move(event.clientX - bounds.left < bounds.width / 2 ? 1 : 2);
});
$('pause').addEventListener('click', () => setPause(true));
$('resume').addEventListener('click', () => setPause(false));
$('sound').addEventListener('click', () => {
  muted = !muted;
  store.write('muted', muted);
  preferences();
  if (!muted) soundStart();
});
$('music-setting').addEventListener('change', () => {
  muted = !$('music-setting').checked;
  store.write('muted', muted);
  preferences();
  if (!muted) soundStart();
});
$('motion-setting').addEventListener('change', () => {
  gentle = $('motion-setting').checked;
  store.write('gentle', gentle);
  preferences();
});
$('about').addEventListener('click', () => {
  setPause(true);
  $('settings').showModal();
});
$('close-settings').addEventListener('click', () => $('settings').close());
$('settings').addEventListener('click', event => {
  if (event.target !== $('settings')) return;
  const bounds = $('settings').getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('settings').close();
});
$('share').addEventListener('click', () => share(game.score));
$('share-home').addEventListener('click', () => { setPause(true); share(null); });
document.addEventListener('keydown', event => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || $('settings').open || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === ' ' && event.target.closest('button,a,input') && !event.target.closest('.move')) return;
  if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(key) && active) {
    event.preventDefault();
    if (key === ' ') setPause(!paused);
    else move(key === 'arrowleft' || key === 'a' ? 1 : 2);
  }
  if (key === 'escape' && active && !paused) setPause(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { setPause(true); audio.setPaused(true); }
  else if (!active) audio.setPaused(false);
});
window.addEventListener('pagehide', () => audio.setPaused(true));
window.addEventListener('blur', () => { if (active) setPause(true); });

function advance(now) {
  const dt = last ? Math.max(0, Math.min((now - last) / 1000, TIMING.maxFrame)) : 0;
  last = Math.max(last, now);
  if (paused || $('settings').open || document.hidden) return;
  const event = game.tick(dt);
  if (event === 'land') {
    audio.setIntensity(Math.min(1, game.score / 24));
    if (game.phase === 'reveal') audio.reveal(game.revealNumber);
    else audio.land(game.landings);
    garden.burst(game.start);
    pulse($('score'), 'score-pop');
    updateScore();
    if (game.landings >= 4) $('controls').classList.remove('teaching');
  }
  if (event === 'reveal') {
    audio.land(0);
    garden.burst(game.start);
    updateScore();
  }
  if (event === 'miss') {
    audio.fail();
    overDelay = 0.46;
    $('controls').classList.remove('teaching');
    $('jump-label').textContent = 'Another little adventure?';
  } else if (overDelay > 0) {
    overDelay -= dt;
    if (overDelay <= 0) finish();
  }
}
function frame() {
  // Inputs and rendering share the same clock; an older RAF timestamp must not replay time.
  const now = performance.now();
  const dt = lastDraw ? Math.max(0, Math.min((now - lastDraw) / 1000, TIMING.maxFrame)) : 0;
  lastDraw = now;
  advance(now);
  garden.draw(game, paused || $('settings').open || document.hidden ? 0 : dt, active);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
