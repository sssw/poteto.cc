import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { canShareFile, shareAsset, pictureName } from '../site/sharing.js';

const file = new File([new Uint8Array([137, 80, 78, 71])], 'poteto.png', { type: 'image/png' });
const content = { file, title: 'Poteto — You jump. I catch.', text: 'I scored 42 on Poteto.', url: 'https://poteto.cc/?lang=fr' };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function failure(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

test('file capability requires a prepared file and both native methods, and queries files only', () => {
  const navigator = {
    share() {},
    canShare(data) {
      assert.equal(this, navigator);
      assert.deepEqual(data, { files: [file] });
      return true;
    },
  };
  assert.equal(canShareFile(navigator, file), true);
  assert.equal(canShareFile(navigator, null), false);
  assert.equal(canShareFile({ share() {} }, file), false);
  assert.equal(canShareFile({ canShare: () => true }, file), false);
  assert.equal(canShareFile({ share() {}, canShare: () => false }, file), false);
  assert.equal(canShareFile({ share() {}, canShare() { throw failure('NotAllowedError'); } }, file), false);
  assert.equal(canShareFile(undefined, file), false);
});

test('image sharing invokes the native API synchronously while user activation remains available', async () => {
  const pending = deferred();
  let activation = true;
  let calls = 0;
  const navigator = {
    canShare: () => true,
    share(data) {
      assert.equal(this, navigator);
      assert.equal(activation, true, 'Native sharing must run before the first async yield');
      assert.deepEqual(data.files, [file]);
      assert.equal(data.title, content.title);
      assert.equal(data.text, `${content.text} ${content.url}`);
      calls++;
      return pending.promise;
    },
    clipboard: { writeText() { assert.fail('File sharing must not also copy a link'); } },
  };
  const result = shareAsset({ ...content, navigator });
  assert.equal(calls, 1);
  activation = false;
  pending.resolve();
  assert.equal(await result, 'image');
});

test('a browser without file sharing uses native text and link sharing', async () => {
  let data;
  const navigator = { canShare: () => false, share(value) { data = value; return Promise.resolve(); } };
  const result = shareAsset({ ...content, navigator });
  assert.deepEqual(data, { title: content.title, text: content.text, url: content.url });
  assert.equal(await result, 'link');
});

test('a capability check that throws still permits ordinary native link sharing', async () => {
  let called = false;
  const navigator = {
    canShare() { throw failure('NotAllowedError'); },
    async share(data) { called = true; assert.equal(data.url, content.url); assert.equal(data.files, undefined); },
  };
  assert.equal(await shareAsset({ ...content, navigator }), 'link');
  assert.equal(called, true);
});

test('clipboard fallback preserves the localized message and URL when native sharing is absent', async () => {
  let copied;
  const navigator = { clipboard: { writeText(value) { copied = value; return Promise.resolve(); } } };
  const result = shareAsset({ ...content, navigator, text: '你跃起，我接住。' });
  assert.equal(copied, `你跃起，我接住。 ${content.url}`);
  assert.equal(await result, 'copied');
});

test('copy-link requests bypass native sharing, with a manual fallback if clipboard is unavailable', async () => {
  let copied;
  const navigator = {
    canShare() { assert.fail('Copy link must not probe file sharing'); },
    share() { assert.fail('Copy link must not open a share sheet'); },
    clipboard: { async writeText(value) { copied = value; } },
  };
  assert.equal(await shareAsset({ ...content, navigator, linkOnly: true }), 'copied');
  assert.equal(copied, `${content.text} ${content.url}`);
  delete navigator.clipboard;
  assert.equal(await shareAsset({ ...content, navigator, linkOnly: true }), 'manual');
  assert.equal(await shareAsset({ ...content, navigator: {} }), 'manual');
});

test('cancelling either native share sheet returns quietly without copying or other fallbacks', async () => {
  for (const supportsFiles of [true, false]) {
    let shares = 0;
    const navigator = {
      canShare: () => supportsFiles,
      share() { shares++; return Promise.reject(failure('AbortError')); },
      clipboard: { writeText() { assert.fail('Cancellation must not trigger a fallback'); } },
    };
    assert.equal(await shareAsset({ ...content, navigator }), 'cancelled');
    assert.equal(shares, 1);
  }
});

test('real native and clipboard failures propagate rather than reporting a successful share', async () => {
  for (const supportsFiles of [true, false]) {
    const error = failure('NotAllowedError');
    const navigator = {
      canShare: () => supportsFiles,
      share() { return Promise.reject(error); },
      clipboard: { writeText() { assert.fail('A rejected native share must not silently change the destination'); } },
    };
    await assert.rejects(shareAsset({ ...content, navigator }), value => value === error);
  }
  const clipboardError = failure('NotAllowedError');
  await assert.rejects(shareAsset({ ...content, navigator: { clipboard: { writeText() { throw clipboardError; } } } }), value => value === clipboardError);
});

test('picture filenames preserve supported types and languages without accepting path or markup injection', () => {
  assert.equal(pictureName('score', 'story', 'zh-Hans', 42), 'poteto-score-42-zh-Hans-story.png');
  assert.equal(pictureName('moment', 'wide', 'pt-BR', 999), 'poteto-moment-pt-BR-wide.png');
  assert.equal(pictureName('poster', 'square', 'fr', 0), 'poteto-poster-fr-square.png');
  for (const unsafe of ['../../secret', '/tmp/file', '\\network\\file', '<img src=x>', 'en?token=x', 'en\u0000.jpg']) {
    const name = pictureName(unsafe, unsafe, unsafe, 0);
    assert.equal(name, 'poteto-poster-en-square.png');
    assert.ok(!/[\\/<>\x00-\x1f]/.test(name));
  }
});

test('score filenames normalize fractional, negative and nonfinite score values', () => {
  assert.equal(pictureName('score', 'wide', 'en', 3.9), 'poteto-score-3-en-wide.png');
  assert.equal(pictureName('score', 'wide', 'en', '42'), 'poteto-score-42-en-wide.png');
  for (const value of [-1, -Infinity, Infinity, NaN, undefined, 'not-a-number']) {
    assert.equal(pictureName('score', 'wide', 'en', value), 'poteto-score-0-en-wide.png');
  }
});
