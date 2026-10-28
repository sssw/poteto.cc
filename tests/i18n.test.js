import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, messages, normalizeLocale, resolveLocale, t, formatNumber, localeUrl } from '../site/i18n.js';

const placeholders = value => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();

test('every supported language has a complete, nonempty dictionary with matching interpolation fields', () => {
  const keys = Object.keys(messages.en).sort();
  assert.equal(LANGUAGES.length, 9);
  assert.equal(new Set(LANGUAGES.map(language => language.code)).size, 9);
  assert.deepEqual(Object.keys(messages).sort(), LANGUAGES.map(language => language.code).sort());
  for (const { code, label, htmlLang } of LANGUAGES) {
    assert.ok(label.length > 0);
    assert.equal(normalizeLocale(htmlLang), code);
    assert.deepEqual(Object.keys(messages[code]).sort(), keys, code);
    for (const key of keys) {
      const value = messages[code][key];
      assert.equal(typeof value, 'string', `${code}.${key}`);
      assert.ok(value.trim().length > 0, `${code}.${key}`);
      assert.deepEqual(placeholders(value), placeholders(messages.en[key]), `${code}.${key}`);
      assert.ok(!/[{}]/.test(value.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, '')), `${code}.${key} has an unmatched placeholder`);
      assert.ok(!/<\/?[a-z][^>]*>/i.test(value), `${code}.${key} must be plain text`);
    }
  }
});

test('poetic headings and sharing copy are localized, with a stable English default', () => {
  assert.equal(t('en', 'heroFirst'), 'You jump.');
  assert.equal(t('en', 'heroSecond'), 'I catch.');
  for (const { code } of LANGUAGES.filter(language => language.code !== 'en')) {
    for (const key of ['heroFirst', 'heroSecond', 'tagline', 'shareTitle', 'shareScoreText', 'download', 'rules']) {
      assert.notEqual(t(code, key), t('en', key), `${code}.${key} must not fall back to English`);
    }
  }
  assert.equal(t('unavailable', 'heroFirst'), 'You jump.');
  assert.equal(t(undefined, 'pageTitle'), messages.en.pageTitle);
  assert.equal(t('en', 'missingKey'), 'missingKey');
  assert.equal(t('en', '__proto__'), '__proto__');
});

test('locale matching respects explicit Chinese scripts, common regions and browser extensions', () => {
  for (const [input, expected] of [
    ['en-US', 'en'], [' EN_gb ', 'en'], ['zh', 'zh-Hans'], ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'], ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'],
    ['zh-Hans-HK', 'zh-Hans'], ['zh-Hant-CN', 'zh-Hant'], ['ja-JP', 'ja'], ['ko-KR', 'ko'],
    ['es-MX', 'es'], ['fr-CA', 'fr'], ['de-AT', 'de'], ['de-DE-u-nu-latn', 'de'],
    ['pt', 'pt-BR'], ['pt-BR', 'pt-BR'], ['pt-PT', 'pt-BR'],
  ]) assert.equal(normalizeLocale(input), expected, input);
  for (const input of [null, undefined, 42, {}, '', 'auto', 'ru-RU', 'ar', 'en--US', '<script>', 'https://example.com']) {
    assert.equal(normalizeLocale(input), null, String(input));
  }
});

test('URL choices win over saved language and browser matching requires an explicit automatic preference', () => {
  assert.equal(resolveLocale(), 'en');
  assert.equal(resolveLocale({ browserLanguages: ['ja-JP'] }), 'en');
  assert.equal(resolveLocale({ requested: 'es-MX', saved: 'fr', browserLanguages: ['ja'] }), 'es');
  assert.equal(resolveLocale({ requested: 'invalid', saved: 'zh-TW', browserLanguages: ['ja'] }), 'zh-Hant');
  assert.equal(resolveLocale({ saved: 'auto', browserLanguages: ['ru-RU', 'fr-CA', 'ja'] }), 'fr');
  assert.equal(resolveLocale({ requested: 'en', saved: 'auto', browserLanguages: ['ja'] }), 'en');
  assert.equal(resolveLocale({ saved: 'auto', browserLanguages: ['unsupported'] }), 'en');
  assert.equal(resolveLocale({ saved: 'auto', browserLanguages: null }), 'en');
  assert.equal(resolveLocale({ saved: 'unknown', browserLanguages: ['ko'] }), 'en');
});

test('interpolation accepts only own fields and returns literal text for DOM or canvas rendering', () => {
  const literal = '<img src=x onerror=alert(1)> & $& {count}';
  assert.equal(t('en', 'nextOne', { count: literal }), `Next: ${literal} space`);
  assert.equal(t('en', 'nextOne', Object.create({ count: 3 })), 'Next: {count} space');
  assert.equal(t('en', 'nextOne', null), 'Next: {count} space');
  for (const { code } of LANGUAGES) {
    const number = formatNumber(code, 1234);
    const result = t(code, 'shareScoreText', { score: number });
    assert.ok(result.includes(number));
    assert.ok(!result.includes('{score}'));
  }
});

test('numbers use the selected locale and invalid values safely display zero', () => {
  assert.equal(formatNumber('en', 1234567), '1,234,567');
  assert.equal(formatNumber('de', 1234567), '1.234.567');
  assert.equal(formatNumber('zh-Hans', 1234), '1,234');
  assert.equal(formatNumber('unavailable', 1234), '1,234');
  for (const value of [NaN, Infinity, -Infinity, undefined, 'not a number', Symbol('invalid')]) {
    assert.equal(formatNumber('en', value), '0');
  }
});

test('share links contain only a supported language on the fixed public origin', () => {
  assert.equal(localeUrl('en-US'), 'https://poteto.cc/');
  assert.equal(localeUrl('zh-TW'), 'https://poteto.cc/?lang=zh-Hant');
  for (const { code } of LANGUAGES) {
    const url = new URL(localeUrl(code));
    assert.equal(url.origin, 'https://poteto.cc');
    assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('lang'), code === 'en' ? null : code);
  }
  for (const value of ['https://evil.example/', 'en&token=secret', 'javascript:alert(1)', '<img>', null]) {
    assert.equal(localeUrl(value), 'https://poteto.cc/');
  }
});
