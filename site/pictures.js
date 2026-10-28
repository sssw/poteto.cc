import { potato } from './art.js?v=1.2.1';

export const FORMATS = Object.freeze([
  Object.freeze({ id: 'square', width: 1080, height: 1080 }),
  Object.freeze({ id: 'story', width: 1080, height: 1920 }),
  Object.freeze({ id: 'wide', width: 1200, height: 630 }),
]);

const PALETTE = Object.freeze({
  paper: '#fbf7ed', ink: '#494b35', green: '#637a48', muted: '#7d866c',
  line: '#dce2c9', pink: '#d68b92', sky: '#eaf0d7', gold: '#f1d68d',
});
const FALLBACK_COPY = Object.freeze({
  heroFirst: 'You jump.', heroSecond: 'I catch.',
  tagline: 'Every leap deserves a soft landing.', scoreLabel: 'HAPPY BOUNCES',
  scoreUnit: 'POINTS', bestLabel: 'PERSONAL BEST', momentLabel: 'A MOMENT WORTH CATCHING',
  posterLabel: 'A LITTLE GAME WITH A LOT OF HEART', footer: 'Play a little. Smile a little.',
});
const TAU = Math.PI * 2;
const serif = locale => /^(zh|ja|ko)/i.test(locale)
  ? '"Noto Serif CJK SC", "Songti SC", "Hiragino Mincho ProN", "AppleMyungjo", serif'
  : 'Georgia, "Times New Roman", serif';
const sans = '-apple-system, "Segoe UI", "PingFang SC", "Hiragino Kaku Gothic ProN", "Malgun Gothic", sans-serif';

export function pictureFormat(id) {
  return FORMATS.find(format => format.id === id) ?? FORMATS[0];
}

export function fitRect(sourceWidth, sourceHeight, bounds) {
  if (![sourceWidth, sourceHeight, bounds.width, bounds.height].every(n => Number.isFinite(n) && n > 0)) {
    return { x: bounds.x, y: bounds.y, width: 0, height: 0 };
  }
  const ratio = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const width = sourceWidth * ratio;
  const height = sourceHeight * ratio;
  return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
}

function graphemes(text) {
  return typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment)
    : Array.from(text);
}

export function wrapPictureText(context, text, width) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    const words = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(paragraph)].map(part => part.segment)
      : paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      if (context.measureText(line + word).width <= width) { line += word; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
      const trimmed = word.trimStart();
      if (context.measureText(trimmed).width <= width) { line = trimmed; continue; }
      for (const glyph of graphemes(trimmed)) {
        if (line && context.measureText(line + glyph).width > width) { lines.push(line); line = ''; }
        line += glyph;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines.length ? lines : [''];
}

function font(size, family, weight = '400', italic = false) {
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

export function fitPictureText(context, text, bounds, options = {}) {
  const family = options.family ?? sans;
  const weight = options.weight ?? '400';
  const leading = options.leading ?? 1.22;
  const maximum = options.size ?? 40;
  const minimum = Math.min(maximum, options.minSize ?? 18);
  let chosen = minimum;
  let lines = [];
  for (let size = maximum; size >= minimum; size -= 1) {
    context.font = font(size, family, weight, options.italic);
    const candidate = wrapPictureText(context, text, bounds.width);
    if (candidate.length <= (options.maxLines ?? Infinity) && candidate.length * size * leading <= bounds.height) { chosen = size; lines = candidate; break; }
  }
  context.font = font(chosen, family, weight, options.italic);
  if (!lines.length) {
    const count = Math.max(1, Math.min(options.maxLines ?? Infinity, Math.floor(bounds.height / (chosen * leading))));
    const allLines = wrapPictureText(context, text, bounds.width);
    lines = allLines.slice(0, count);
    if (allLines.length > count) {
      let last = graphemes(lines.at(-1));
      while (last.length && context.measureText(last.join('') + '…').width > bounds.width) last.pop();
      lines[lines.length - 1] = last.join('') + '…';
    }
  }
  return { lines, size: chosen, lineHeight: chosen * leading, height: lines.length * chosen * leading };
}

function textBlock(context, text, bounds, options = {}) {
  context.save();
  const layout = fitPictureText(context, text, bounds, options);
  context.fillStyle = options.color ?? PALETTE.ink;
  context.textBaseline = 'top';
  context.textAlign = options.align ?? 'left';
  const x = bounds.x + (context.textAlign === 'center' ? bounds.width / 2 : context.textAlign === 'right' ? bounds.width : 0);
  const y = bounds.y + (options.centerY ? (bounds.height - layout.height) / 2 : 0);
  layout.lines.forEach((line, index) => context.fillText(line, x, y + index * layout.lineHeight));
  context.restore();
  return layout;
}

function rounded(context, x, y, width, height, radius, fill, stroke = null) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); }
}

function ellipse(context, x, y, rx, ry, fill) {
  context.fillStyle = fill;
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, TAU);
  context.fill();
}

function heart(context, x, y, size, rotation = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(size, size);
  context.fillStyle = PALETTE.pink;
  context.beginPath();
  context.moveTo(0, 0.8);
  context.bezierCurveTo(-1.4, -0.2, -0.7, -1.2, 0, -0.55);
  context.bezierCurveTo(0.7, -1.2, 1.4, -0.2, 0, 0.8);
  context.fill();
  context.restore();
}

function sparkle(context, x, y, size, fill = '#c5ad62') {
  context.fillStyle = fill;
  context.beginPath();
  context.moveTo(x, y - size);
  context.quadraticCurveTo(x + size * 0.15, y - size * 0.15, x + size, y);
  context.quadraticCurveTo(x + size * 0.15, y + size * 0.15, x, y + size);
  context.quadraticCurveTo(x - size * 0.15, y + size * 0.15, x - size, y);
  context.quadraticCurveTo(x - size * 0.15, y - size * 0.15, x, y - size);
  context.fill();
}

function hills(context, width, bottom, top, variant = 0) {
  const depth = bottom - top;
  ['#e1e9c9', '#cddcb0', '#b7ca98'].forEach((color, layer) => {
    context.beginPath();
    context.moveTo(0, bottom);
    for (let x = 0; x <= width + 12; x += 12) {
      const y = top + depth * (0.22 + layer * 0.21)
        + Math.sin(x / width * Math.PI * (1.3 + layer * 0.35) + layer + variant) * depth * 0.12;
      context.lineTo(x, y);
    }
    context.lineTo(width, bottom);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  });
}

function cloud(context, x, y, scale = 1) {
  ellipse(context, x, y, 54 * scale, 12 * scale, '#fffbedc9');
  ellipse(context, x - 15 * scale, y - 9 * scale, 24 * scale, 16 * scale, '#fffbedc9');
  ellipse(context, x + 14 * scale, y - 13 * scale, 22 * scale, 18 * scale, '#fffbedc9');
}

function platform(context, x, y, width, number = 1, golden = false) {
  const height = Math.max(26, width * 0.14);
  ellipse(context, x, y + height + 16, width * 0.42, 8, '#7e95552c');
  rounded(context, x - width / 2, y, width, height, height * 0.34, golden ? '#c6a162' : '#8ba76a');
  rounded(context, x - width / 2, y - 3, width, height * 0.55, height * 0.28, golden ? '#f3cf86' : '#d4e3ab');
  textBlock(context, String(number), { x: x - width / 2, y: y + height * 0.22, width, height: height * 0.75 }, {
    align: 'center', size: Math.max(20, height * 0.55), minSize: 18, weight: '700', color: '#4e633b', leading: 1,
  });
}

function flower(context, x, y, size) {
  context.strokeStyle = '#8ca571';
  context.lineWidth = 2;
  context.beginPath(); context.moveTo(x, y); context.lineTo(x, y - size * 2); context.stroke();
  for (let index = 0; index < 5; index++) {
    const angle = index * TAU / 5;
    ellipse(context, x + Math.cos(angle) * size * 0.48, y - size * 2 + Math.sin(angle) * size * 0.48,
      size * 0.4, size * 0.4, '#fffbed');
  }
  ellipse(context, x, y - size * 2, size * 0.23, size * 0.23, '#d9b65c');
}

function headline(context, copy, bounds, locale, maximum = 94, align = 'center') {
  const family = serif(locale);
  const italic = !/^(zh|ja|ko)/i.test(locale);
  let size = maximum;
  let first, second;
  for (; size >= 22; size--) {
    context.font = font(size, family);
    first = wrapPictureText(context, copy.heroFirst, bounds.width);
    context.font = font(size, family, '400', italic);
    second = wrapPictureText(context, copy.heroSecond, bounds.width);
    if ((first.length + second.length) * size * 1.12 + size * 0.08 <= bounds.height) break;
  }
  size = Math.max(22, size);
  const height = (first.length + second.length) * size * 1.12 + size * 0.08;
  let y = bounds.y + (bounds.height - height) / 2;
  const x = bounds.x + (align === 'center' ? bounds.width / 2 : 0);
  context.save();
  context.textAlign = align;
  context.textBaseline = 'top';
  for (const [lines, slanted, color] of [[first, false, PALETTE.ink], [second, italic, PALETTE.green]]) {
    context.font = font(size, family, '400', slanted);
    context.fillStyle = color;
    for (const line of lines) { context.fillText(line, x, y); y += size * 1.12; }
    y += size * 0.04;
  }
  context.restore();
}

function header(context, width, wide) {
  const margin = wide ? 68 : 76;
  const y = wide ? 64 : 98;
  potato(context, margin + 17, y, wide ? 31 : 39, 0, false, { tilt: -0.10 });
  textBlock(context, 'poteto.cc', { x: margin + 49, y: y - 24, width: 300, height: 60 }, {
    size: wide ? 31 : 39, minSize: 27, weight: '700', leading: 1.15,
  });
  sparkle(context, width - margin - 8, y - 4, wide ? 13 : 16);
}

function footer(context, width, height, copy, wide) {
  const margin = wide ? 72 : 76;
  const y = height - (wide ? 62 : 77);
  textBlock(context, copy.footer, { x: margin, y, width: width - margin * 2 - 190, height: 38 }, {
    size: wide ? 17 : 22, minSize: 14, color: PALETTE.muted, leading: 1.15,
  });
  textBlock(context, 'poteto.cc', { x: width - margin - 175, y: y - 2, width: 175, height: 38 }, {
    size: wide ? 20 : 25, minSize: 18, weight: '600', align: 'right', color: PALETTE.green, leading: 1.15,
  });
}

function bestPill(context, value, copy, x, y, width, height) {
  rounded(context, x, y, width, height, height / 2, '#fffbed', PALETTE.line);
  textBlock(context, copy.bestLabel, { x: x + 24, y: y + 17, width: width * 0.63 - 24, height: height - 28 }, {
    size: 19, minSize: 12, weight: '600', color: PALETTE.muted, leading: 1.12, centerY: true,
  });
  textBlock(context, value, { x: x + width * 0.64, y: y + 10, width: width * 0.36 - 25, height: height - 16 }, {
    family: '"Times New Roman", Georgia, serif', size: height * 0.56, minSize: 17, align: 'right', color: PALETTE.green, leading: 1.1, centerY: true, maxLines: 1,
  });
}

function drawPoster(context, format, copy, locale) {
  const { width: w, height: h, id } = format;
  if (id === 'wide') {
    hills(context, w, h - 32, 423);
    textBlock(context, copy.posterLabel, { x: 76, y: 143, width: 520, height: 42 }, { size: 17, minSize: 12, weight: '600', color: PALETTE.muted });
    headline(context, copy, { x: 76, y: 195, width: 568, height: 173 }, locale, 72, 'left');
    textBlock(context, copy.tagline, { x: 80, y: 395, width: 510, height: 72 }, { size: 24, minSize: 18, color: PALETTE.muted });
    ellipse(context, 1008, 177, 48, 48, PALETTE.gold);
    cloud(context, 786, 165, 0.78);
    platform(context, 888, 462, 220);
    potato(context, 890, 340, 204, 0, false, { tilt: 0.05 });
    heart(context, 728, 324, 15, -0.17);
    heart(context, 1043, 361, 20, 0.18);
    flower(context, 692, 520, 10);
    flower(context, 1100, 503, 8);
    return;
  }
  const story = id === 'story';
  const top = story ? 285 : 175;
  textBlock(context, copy.posterLabel, { x: 110, y: top, width: w - 220, height: story ? 70 : 44 }, {
    size: story ? 25 : 19, minSize: 15, weight: '600', align: 'center', color: PALETTE.muted,
  });
  headline(context, copy, { x: 96, y: story ? 380 : 236, width: w - 192, height: story ? 286 : 220 }, locale, story ? 124 : 94);
  textBlock(context, copy.tagline, { x: 138, y: story ? 723 : 475, width: w - 276, height: story ? 118 : 76 }, {
    size: story ? 34 : 27, minSize: 21, align: 'center', color: PALETTE.muted, leading: 1.35,
  });
  hills(context, w, h - 48, story ? 1125 : 680, 0.65);
  ellipse(context, story ? 850 : 855, story ? 1060 : 635, story ? 67 : 46, story ? 67 : 46, PALETTE.gold);
  cloud(context, story ? 230 : 252, story ? 1120 : 636, story ? 1.5 : 0.85);
  cloud(context, 840, story ? 1365 : 826, story ? 1.2 : 0.7);
  const y = story ? 1340 : 760;
  const size = story ? 340 : 220;
  platform(context, 550, story ? 1535 : 875, story ? 330 : 235);
  potato(context, 550, y, size, 0, false, { tilt: -0.04 });
  heart(context, story ? 287 : 338, story ? 1310 : 755, story ? 27 : 20, -0.18);
  heart(context, story ? 790 : 727, story ? 1250 : 708, story ? 33 : 23, 0.15);
  sparkle(context, story ? 350 : 366, story ? 1118 : 642, 11);
  flower(context, 195, h - 150, story ? 13 : 9);
  flower(context, 840, h - 170, story ? 15 : 10);
}

function drawScore(context, format, copy, locale, score, best) {
  const { width: w, height: h, id } = format;
  if (id === 'wide') {
    hills(context, w, h - 32, 455, 0.5);
    textBlock(context, copy.posterLabel, { x: 76, y: 143, width: 480, height: 40 }, { size: 17, minSize: 13, color: PALETTE.muted, weight: '600' });
    headline(context, copy, { x: 76, y: 193, width: 490, height: 170 }, locale, 67, 'left');
    rounded(context, 662, 133, 463, 377, 31, '#fffbee', PALETTE.line);
    textBlock(context, score, { x: 694, y: 159, width: 399, height: 205 }, { family: '"Times New Roman", Georgia, serif', size: 178, minSize: 45, align: 'center', color: PALETTE.green, leading: 1.05, centerY: true, maxLines: 1 });
    textBlock(context, copy.scoreUnit, { x: 694, y: 365, width: 399, height: 40 }, { size: 20, minSize: 14, align: 'center', color: PALETTE.muted, weight: '600' });
    bestPill(context, best, copy, 715, 426, 357, 58);
    platform(context, 323, 493, 153);
    potato(context, 325, 435, 102, 0, false, { tilt: -0.08 });
    heart(context, 206, 430, 17, -0.2);
    sparkle(context, 451, 436, 12);
    return;
  }
  const story = id === 'story';
  textBlock(context, copy.posterLabel, { x: 108, y: story ? 254 : 168, width: w - 216, height: 55 }, {
    size: story ? 26 : 19, minSize: 14, align: 'center', color: PALETTE.muted, weight: '600',
  });
  headline(context, copy, { x: 100, y: story ? 355 : 228, width: w - 200, height: story ? 246 : 150 }, locale, story ? 96 : 66);
  textBlock(context, score, { x: 120, y: story ? 686 : 419, width: w - 240, height: story ? 354 : 246 }, {
    family: '"Times New Roman", Georgia, serif', size: story ? 310 : 217, minSize: 57, align: 'center', color: PALETTE.green, leading: 1.05, centerY: true, maxLines: 1,
  });
  textBlock(context, copy.scoreUnit, { x: 150, y: story ? 1055 : 673, width: w - 300, height: 55 }, {
    size: story ? 30 : 23, minSize: 17, align: 'center', color: PALETTE.muted, weight: '600',
  });
  bestPill(context, best, copy, story ? 266 : 310, story ? 1163 : 751, story ? 548 : 460, story ? 88 : 68);
  hills(context, w, h - 48, story ? 1450 : 899, 1.7);
  platform(context, w / 2, story ? 1653 : 961, story ? 252 : 149);
  potato(context, w / 2, story ? 1530 : 913, story ? 225 : 90, 0, false, { tilt: 0.07 });
  heart(context, story ? 333 : 396, story ? 1480 : 893, story ? 25 : 16, -0.18);
  heart(context, story ? 762 : 682, story ? 1540 : 868, story ? 31 : 20, 0.1);
  sparkle(context, 224, story ? 805 : 491, story ? 17 : 13);
  sparkle(context, 859, story ? 947 : 592, story ? 13 : 10);
}

function snapshotFrame(context, snapshot, bounds, radius = 26) {
  rounded(context, bounds.x, bounds.y, bounds.width, bounds.height, radius, '#eaf0db', '#cddaba');
  context.save();
  context.beginPath();
  context.roundRect(bounds.x + 3, bounds.y + 3, bounds.width - 6, bounds.height - 6, radius - 2);
  context.clip();
  if (snapshot && Number.isFinite(snapshot.width) && Number.isFinite(snapshot.height) && snapshot.width > 0 && snapshot.height > 0) {
    const rect = fitRect(snapshot.width, snapshot.height, {
      x: bounds.x + 12, y: bounds.y + 12, width: bounds.width - 24, height: bounds.height - 24,
    });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(snapshot, rect.x, rect.y, rect.width, rect.height);
  } else {
    const size = Math.min(bounds.width * 0.32, bounds.height * 0.45);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height * 0.57;
    platform(context, x, y + size * 0.55, size * 1.1);
    potato(context, x, y, size, 0, false, { tilt: -0.05 });
  }
  context.restore();
}

function drawMoment(context, format, copy, locale, score, best, snapshot) {
  const { width: w, height: h, id } = format;
  if (id === 'wide') {
    textBlock(context, copy.momentLabel, { x: 76, y: 145, width: 420, height: 50 }, { size: 17, minSize: 13, color: PALETTE.muted, weight: '600' });
    headline(context, copy, { x: 76, y: 216, width: 410, height: 173 }, locale, 62, 'left');
    textBlock(context, `${copy.scoreUnit}  ${score}`, { x: 80, y: 425, width: 408, height: 65 }, { size: 35, minSize: 20, color: PALETTE.green, weight: '600' });
    snapshotFrame(context, snapshot, { x: 548, y: 128, width: 578, height: 390 });
    return;
  }
  const story = id === 'story';
  textBlock(context, copy.momentLabel, { x: 110, y: story ? 252 : 166, width: w - 220, height: 55 }, { size: story ? 25 : 18, minSize: 14, color: PALETTE.muted, weight: '600', align: 'center' });
  headline(context, copy, { x: 110, y: story ? 350 : 225, width: w - 220, height: story ? 236 : 125 }, locale, story ? 95 : 57);
  snapshotFrame(context, snapshot, { x: 76, y: story ? 654 : 388, width: w - 152, height: story ? 960 : 489 });
  const statsY = story ? 1684 : 915;
  textBlock(context, `${copy.scoreUnit}  ${score}`, { x: 82, y: statsY, width: 440, height: 60 }, { size: story ? 39 : 34, minSize: 19, color: PALETTE.green, weight: '600' });
  textBlock(context, `${copy.bestLabel}  ${best}`, { x: 550, y: statsY + 6, width: 448, height: 52 }, { size: story ? 25 : 21, minSize: 14, align: 'right', color: PALETTE.muted, weight: '600' });
}

function displayNumber(value, supplied, locale) {
  if (supplied !== undefined && supplied !== null && String(supplied).trim()) return String(supplied);
  const number = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  try { return new Intl.NumberFormat(locale).format(number); }
  catch { return String(number); }
}

export function renderPicture(options = {}) {
  const format = pictureFormat(options.format);
  const kind = ['score', 'moment', 'poster'].includes(options.kind) ? options.kind : 'poster';
  const locale = typeof options.locale === 'string' ? options.locale : 'en';
  const copy = { ...FALLBACK_COPY };
  for (const key of Object.keys(copy)) {
    if (typeof options.copy?.[key] === 'string' && options.copy[key].trim()) copy[key] = options.copy[key];
  }
  const canvas = document.createElement('canvas');
  canvas.width = format.width;
  canvas.height = format.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas is unavailable');
  const { width, height } = format;
  const wide = format.id === 'wide';
  const inset = wide ? 30 : 46;
  context.fillStyle = PALETTE.paper;
  context.fillRect(0, 0, width, height);
  rounded(context, inset, inset, width - inset * 2, height - inset * 2, wide ? 30 : 39, PALETTE.paper, PALETTE.line);
  context.save();
  context.beginPath();
  context.roundRect(inset + 1, inset + 1, width - inset * 2 - 2, height - inset * 2 - 2, wide ? 29 : 38);
  context.clip();
  const score = displayNumber(options.score, options.scoreText, locale);
  const best = displayNumber(options.best, options.bestText, locale);
  if (kind === 'poster') drawPoster(context, format, copy, locale);
  else if (kind === 'score') drawScore(context, format, copy, locale, score, best);
  else drawMoment(context, format, copy, locale, score, best, options.snapshot);
  context.restore();
  header(context, width, wide);
  footer(context, width, height, copy, wide);
  return canvas;
}
