import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { main, build } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// electron-builder packs only build.files, so an unlisted main-process module
// crashes the packaged app at launch while `npm run desktop` keeps working.
test('every module the packaged main process loads is listed in build.files', () => {
  const loaded = new Set();
  const visit = file => {
    if (loaded.has(file)) return;
    loaded.add(file);
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const [, specifier] of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    }
  };
  visit(main);
  visit('desktop/preload.cjs');
  assert.deepEqual([...loaded].filter(file => !build.files.includes(file)), []);
});
