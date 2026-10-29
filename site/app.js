import { Relay, TIMING } from './game.js?v=1.3.3';
import { Garden } from './art.js?v=1.3.3';
import { Soundtrack } from './audio.js?v=1.3.3';
import { bindMoveButton, bindGameGestures } from './input.js?v=1.3.3';
import { LANGUAGES, normalizeLocale, resolveLocale, t, formatNumber, localeUrl } from './i18n.js?v=1.3.3';
import { PictureSharing } from './sharing.js?v=1.3.3';

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
const requestedLocale = new URLSearchParams(location.search).get('lang');
let localeChoice = normalizeLocale(requestedLocale) || store.read('language', 'en');
let locale = resolveLocale({ requested: requestedLocale, saved: localeChoice, browserLanguages: navigator.languages });
const tr = (key, params) => t(locale, key, params);
const number = value => formatNumber(locale, value);
const game = new Relay();
const garden = new Garden($('scene'));
const audio = new Soundtrack();
let best = Number(store.read('best', 0)) || 0;
let muted = store.read('muted', false);
let gentle = store.read('gentle', matchMedia('(prefers-reduced-motion: reduce)').matches);
let active = false, paused = false, last = 0, lastDraw = 0, overDelay = 0;
let toastTimer, runWasRecord = false, lastMoment = null, captureOnFrame = true;
const sharePanel = new PictureSharing({ getContext: sharingContext, getLocale: () => locale });
$('best').textContent = number(best);

function preferences() {
  audio.setMuted(muted);
  garden.reduced = gentle;
  document.body.classList.toggle('gentle', gentle);
  $('sound').setAttribute('aria-label', tr(muted ? 'soundOff' : 'soundOn'));
  $('sound').setAttribute('aria-pressed', String(muted));
  $('sound').title = tr(muted ? 'soundOff' : 'soundOn');
  $('music-setting').checked = !muted;
  $('motion-setting').checked = gentle;
}
applyLocale();
function soundStart() { Promise.resolve(audio.start()).catch(() => {}); }
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
}
function applyLocale() {
  document.documentElement.lang = LANGUAGES.find(item => item.code === locale)?.htmlLang || 'en';
  document.title = tr('pageTitle');
  document.querySelector('.wordmark').href = locale === 'en' ? '/' : '/?lang=' + encodeURIComponent(locale);
  document.querySelector('meta[name="description"]').content = tr('metaDescription');
  document.querySelector('meta[property="og:title"]').content = tr('pageTitle');
  document.querySelector('meta[property="og:description"]').content = tr('metaDescription');
  document.querySelector('meta[property="og:url"]').content = localeUrl(locale);
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', tr(element.dataset.i18nAria)); });
  const options = [{ code: 'auto', label: tr('systemLanguage') }, ...LANGUAGES];
  $('language').replaceChildren(...options.map(item => {
    const option = document.createElement('option');
    option.value = item.code;
    option.textContent = item.label;
    return option;
  }));
  $('language').value = localeChoice === 'auto' ? 'auto' : locale;
  garden.caption = tr('spudCaption');
  $('best').textContent = number(best);
  preferences();
  updateScore();
  renderResult();
  sharePanel.localize();
}
function updateScore() {
  $('score').textContent = number(game.score);
  const label = !active ? tr('adventure')
    : game.status === 'ready' ? tr('startHint')
      : game.status === 'over' ? tr('tryAgain')
        : game.phase === 'reveal' ? tr('revealed', { count: number(game.revealNumber) })
          : game.distance === 3 ? tr('nextThree')
            : tr(game.distance === 1 ? 'nextOne' : 'nextMany', { count: number(game.distance) });
  $('jump-label').textContent = label;
  $('jump-label').dataset.distance = game.phase === 'reveal' ? 'reveal' : game.distance;
  $('jump-label').dataset.phase = game.phase;
}
function renderResult() {
  $('final-score').textContent = number(game.score);
  $('result-kicker').textContent = tr(runWasRecord ? 'recordKicker' : 'resultKicker');
  $('result-title').textContent = tr(runWasRecord ? 'recordTitle' : 'resultTitle');
  $('result-detail').textContent = game.score === 0 ? tr('resultZero')
    : tr(game.landings === 1 ? 'resultOne' : 'resultMany', { count: number(game.landings) });
}
function captureScene() {
  const source = $('scene');
  const ratio = source.width / Math.max(1, source.clientWidth);
  const height = Math.max(1, Math.round(source.height - $('controls').getBoundingClientRect().height * ratio));
  const snapshot = document.createElement('canvas');
  snapshot.width = source.width;
  snapshot.height = height;
  snapshot.getContext('2d').drawImage(source, 0, 0, source.width, height, 0, 0, source.width, height);
  return snapshot;
}
function sharingContext() {
  if (active && !paused) advance(performance.now());
  garden.draw(game, 0, active);
  const snapshot = game.status === 'over' && lastMoment ? lastMoment : captureScene();
  setPause(true);
  return { snapshot, score: game.score, best: Math.max(best, game.score), landings: game.landings };
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
  document.body.classList.remove('keyboard-navigation');
  game.reset();
  garden.resetCamera();
  garden.fall = 0;
  garden.particles = [];
  active = true;
  paused = false;
  overDelay = 0;
  runWasRecord = false;
  lastMoment = null;
  captureOnFrame = true;
  last = lastDraw = performance.now();
  document.body.classList.add('playing');
  $('welcome').hidden = $('result').hidden = $('pause-screen').hidden = true;
  $('pause').hidden = false;
  $('controls').classList.add('teaching');
  $('left').disabled = $('right').disabled = false;
  $('effects').replaceChildren();
  audio.setIntensity(0);
  audio.setPaused(false);
  soundStart();
  updateScore();
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
  if (!active || paused || $('settings').open || sharePanel.dialog.open || game.status === 'over') return;
  advance(performance.now());
  if (game.move(steps)) {
    document.body.classList.remove('keyboard-navigation');
    hearts(steps);
    pulse($(steps === 1 ? 'left' : 'right'), 'tapped');
    audio.move(steps);
    updateScore();
  }
}
function setPause(value, focus = true) {
  if (!active || game.status === 'over') return;
  if (value && !paused) advance(performance.now());
  if (game.status === 'over') return;
  paused = value;
  audio.setPaused(value);
  $('pause-screen').hidden = !value;
  $('pause').hidden = value;
  if (value) {
    if (focus) $('resume').focus({ preventScroll: true });
  } else {
    last = lastDraw = performance.now();
    soundStart();
    if (focus) $('left').focus({ preventScroll: true });
  }
}
function finish() {
  runWasRecord = game.score > best;
  if (runWasRecord) {
    best = game.score;
    store.write('best', best);
    $('best').textContent = number(best);
  }
  renderResult();
  $('result').hidden = false;
  $('pause').hidden = true;
  $('left').disabled = $('right').disabled = true;
  audio.setPaused(true);
  $('retry').focus({ preventScroll: true });
}

$('play').addEventListener('click', newGame);
$('retry').addEventListener('click', newGame);
bindGameGestures(document.querySelector('.game'), [$('scene'), $('controls')]);
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
$('share').addEventListener('click', () => sharePanel.open('score'));
$('share-home').addEventListener('click', () => sharePanel.open(active ? 'moment' : 'poster'));
$('save-moment').addEventListener('click', () => sharePanel.open('moment'));
$('language').addEventListener('focus', () => setPause(true, false));
$('language').addEventListener('change', () => {
  setPause(true, false);
  localeChoice = $('language').value;
  store.write('language', localeChoice);
  locale = resolveLocale({ saved: localeChoice, browserLanguages: navigator.languages });
  const url = new URL(location.href);
  if (localeChoice === 'auto' || locale === 'en') url.searchParams.delete('lang');
  else url.searchParams.set('lang', locale);
  history.replaceState(null, '', url);
  applyLocale();
  toast(tr('languageChanged'));
});
window.addEventListener('languagechange', () => {
  if (localeChoice !== 'auto') return;
  setPause(true, false);
  locale = resolveLocale({ saved: 'auto', browserLanguages: navigator.languages });
  applyLocale();
});
document.addEventListener('pointerdown', () => {
  document.body.classList.remove('keyboard-navigation');
}, { capture: true });
document.addEventListener('keydown', event => {
  if (event.key === 'Tab') document.body.classList.add('keyboard-navigation');
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || $('settings').open || sharePanel.dialog.open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
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
  if (paused || $('settings').open || sharePanel.dialog.open || document.hidden) return;
  const event = game.tick(dt);
  if (event === 'land') {
    captureOnFrame = true;
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
    $('jump-label').textContent = tr('tryAgain');
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
  garden.draw(game, paused || $('settings').open || sharePanel.dialog.open || document.hidden ? 0 : dt, active);
  if (captureOnFrame && active && game.status !== 'over') {
    lastMoment = captureScene();
    captureOnFrame = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
