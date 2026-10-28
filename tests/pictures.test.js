import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, pictureFormat, fitRect, wrapPictureText, fitPictureText, renderPicture } from '../site/pictures.js';

function drawingContext() {
  const calls = { text: [], images: [], fills: [] };
  const stateKeys = ['font', 'fillStyle', 'strokeStyle', 'textAlign', 'textBaseline', 'globalAlpha'];
  const stack = [];
  const context = {
    font: '20px sans-serif', fillStyle: '', textAlign: 'left', textBaseline: 'top', globalAlpha: 1,
    save() { stack.push(Object.fromEntries(stateKeys.map(key => [key, this[key]]))); },
    restore() { Object.assign(this, stack.pop()); },
    measureText(text) {
      const size = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 20);
      const width = Array.from(String(text)).reduce((sum, point) => sum + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(point) ? size : size * 0.53), 0);
      return { width };
    },
    fillText(text, x, y) {
      const width = this.measureText(text).width;
      const size = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 20);
      const left = x - (this.textAlign === 'center' ? width / 2 : this.textAlign === 'right' ? width : 0);
      calls.text.push({ text: String(text), x: left, y, width, height: size, font: this.font });
    },
    fillRect(...args) { calls.fills.push({ args, color: this.fillStyle }); },
    drawImage(...args) { calls.images.push(args); },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  for (const method of ['beginPath', 'closePath', 'roundRect', 'fill', 'stroke', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'clip', 'translate', 'rotate', 'scale']) context[method] = () => {};
  return { context, calls };
}

function installCanvas(t) {
  const canvases = [];
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(type) {
        assert.equal(type, 'canvas');
        const { context, calls } = drawingContext();
        const canvas = { width: 0, height: 0, calls, getContext: (kind, options) => {
          assert.equal(kind, '2d');
          assert.equal(options.alpha, false);
          return context;
        } };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'document', prior);
    else delete globalThis.document;
  });
  return canvases;
}

const copies = [
  { locale: 'en', copy: { heroFirst: 'You jump.', heroSecond: 'I catch.', tagline: 'A little trust. A little courage. A soft place to land.' } },
  { locale: 'de', copy: { heroFirst: 'Du springst.', heroSecond: 'Ich fange dich auf.', tagline: 'Ein wenig Vertrauen. Ein wenig Mut. Ein weicher Ort zum Landen.', scoreUnit: 'PUNKTE', bestLabel: 'PERSÖNLICHER REKORD', momentLabel: 'EIN MOMENT ZUM FESTHALTEN', posterLabel: 'EIN KLEINES SPIEL MIT VIEL HERZ' } },
  { locale: 'fr', copy: { heroFirst: 'Tu sautes.', heroSecond: 'Je te rattrape.', tagline: 'Un peu de confiance. Un peu de courage. Un endroit doux pour atterrir.', bestLabel: 'RECORD PERSONNEL', momentLabel: 'UN INSTANT QUI MÉRITE D’ÊTRE GARDÉ' } },
  { locale: 'ja', copy: { heroFirst: 'きみが跳ぶ。', heroSecond: 'ぼくが受けとめる。', tagline: '少しの信頼、少しの勇気。いつでも、やさしく受けとめる。', bestLabel: '自己ベスト', posterLabel: '小さなゲーム、大きなやさしさ' } },
  { locale: 'zh-Hans', copy: { heroFirst: '你跃起。', heroSecond: '我接住。', tagline: '一点信任，一点勇气。每次跃起，都有温柔的落点。', scoreUnit: '得分', bestLabel: '个人最佳' } },
];

test('export formats are bounded, immutable and have a safe fallback', () => {
  assert.deepEqual(FORMATS.map(({ id, width, height }) => [id, width, height]), [
    ['square', 1080, 1080], ['story', 1080, 1920], ['wide', 1200, 630],
  ]);
  assert.equal(pictureFormat('unknown').id, 'square');
  assert.ok(FORMATS.every(format => format.width * format.height <= 2073600 && Object.isFrozen(format)));
});

test('contain geometry keeps the complete portrait or landscape game frame', () => {
  for (const [width, height] of [[350, 590], [1170, 610], [2000, 2000]]) {
    const box = { x: 70, y: 100, width: 800, height: 450 };
    const fit = fitRect(width, height, box);
    assert.ok(Math.abs(fit.width / fit.height - width / height) < 1e-12);
    assert.ok(fit.x >= box.x && fit.y >= box.y);
    assert.ok(fit.x + fit.width <= box.x + box.width + 1e-8);
    assert.ok(fit.y + fit.height <= box.y + box.height + 1e-8);
  }
  assert.deepEqual(fitRect(0, 100, { x: 1, y: 2, width: 50, height: 80 }), { x: 1, y: 2, width: 0, height: 0 });
});

test('word wrapping handles no-space scripts, long words and complete graphemes', () => {
  const { context } = drawingContext();
  const samples = ['One careful leap after another', 'Donaudampfschifffahrtsgesellschaft', '每次跃起都有温柔的落点', 'きみが跳ぶぼくが受けとめる', 'A family 👨‍👩‍👧‍👦 together'];
  for (const text of samples) {
    const lines = wrapPictureText(context, text, 150);
    assert.ok(lines.length > 0);
    assert.ok(lines.every(line => context.measureText(line).width <= 150), text);
    assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
    assert.ok(lines.every(line => !line.startsWith('\u200d') && !line.endsWith('\u200d')));
  }
});

test('text fitting stays inside its box and keeps scores on one line', () => {
  const { context } = drawingContext();
  const result = fitPictureText(context, '1,234,567,890', { width: 840, height: 260 }, { size: 220, minSize: 35, maxLines: 1 });
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0], '1,234,567,890');
  assert.ok(context.measureText(result.lines[0]).width <= 840);
  assert.ok(result.height <= 260);
  const long = fitPictureText(context, 'A very long phrase '.repeat(25), { width: 240, height: 90 }, { size: 40, minSize: 18 });
  assert.ok(long.height <= 90);
  assert.ok(long.lines.at(-1).endsWith('…'));
});

test('all card templates render at every size with translated text and bounded labels', t => {
  installCanvas(t);
  for (const format of FORMATS) {
    for (const kind of ['poster', 'score', 'moment']) {
      for (const translation of copies) {
        const canvas = renderPicture({ kind, format: format.id, ...translation, score: 123, best: 987, snapshot: null });
        assert.equal(canvas.width, format.width);
        assert.equal(canvas.height, format.height);
        assert.equal(canvas.calls.fills[0].color, '#fbf7ed');
        assert.ok(canvas.calls.text.some(call => call.text === 'poteto.cc'));
        for (const call of canvas.calls.text) {
          assert.ok(call.x >= 20, `${kind}/${format.id}/${translation.locale}: ${call.text} starts outside`);
          assert.ok(call.x + call.width <= format.width - 20, `${kind}/${format.id}/${translation.locale}: ${call.text} ends outside`);
          assert.ok(call.y >= 20 && call.y + call.height <= format.height - 20, `${kind}/${format.id}/${translation.locale}: ${call.text} overflows vertically`);
        }
      }
    }
  }
});

test('snapshot export only reads the source and retains its entire aspect ratio', t => {
  installCanvas(t);
  const snapshot = Object.freeze({ width: 350, height: 590 });
  for (const format of FORMATS) {
    const canvas = renderPicture({ kind: 'moment', format: format.id, snapshot, score: 38, best: 40 });
    assert.equal(canvas.calls.images.length, 1);
    const [image, , , width, height] = canvas.calls.images[0];
    assert.equal(image, snapshot);
    assert.ok(Math.abs(width / height - 350 / 590) < 1e-12);
  }
});

test('score cards honor formatted numbers and invalid inputs never print NaN', t => {
  installCanvas(t);
  const canvas = renderPicture({ kind: 'score', format: 'square', score: 1234, scoreText: '1.234', bestText: '9.876', locale: 'de' });
  assert.ok(canvas.calls.text.some(call => call.text === '1.234'));
  assert.ok(canvas.calls.text.some(call => call.text === '9.876'));
  const safe = renderPicture({ kind: 'score', format: 'wide', score: NaN, best: Infinity });
  assert.ok(safe.calls.text.every(call => !/NaN|Infinity/.test(call.text)));
  assert.ok(safe.calls.text.some(call => call.text === '0'));
});
