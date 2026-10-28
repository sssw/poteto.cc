import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const site = new URL('../site/', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('page and every module dependency use the same release version to avoid stale cached gameplay', () => {
  const html = readFileSync(new URL('index.html', site), 'utf8');
  const entries = [...html.matchAll(/(?:src|href)="\/([^"?]+\.(?:js|css))(\?[^" ]*)?"/g)];
  assert.equal(entries.length, 2);
  const visited = new Set();
  function inspect(path, query) {
    assert.equal(new URLSearchParams(query).get('v'), version, `Unversioned asset: ${path}`);
    const url = new URL(path, site);
    assert.ok(existsSync(fileURLToPath(url)), `Missing asset: ${path}`);
    if (!path.endsWith('.js') || visited.has(path)) return;
    visited.add(path);
    const source = readFileSync(url, 'utf8');
    for (const match of source.matchAll(/from ['"]\.\/([^?'"\s]+)(\?[^'"\s]*)?['"]/g)) {
      inspect(match[1], match[2]);
    }
  }
  for (const [, path, query] of entries) inspect(path, query);
  assert.ok(visited.has('game.js') && visited.has('art.js') && visited.has('audio.js') && visited.has('input.js'));
});
