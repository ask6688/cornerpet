import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RESIZE_HINT_LIMIT, DEFAULT_HINT_STATE, nextResizeHint, learnedResizeHint, createResizeHintStore } from '../desktop/resize-hint.mjs';

test('the resize hint appears at most three times, then never again', () => {
  let state = DEFAULT_HINT_STATE, shown = 0;
  for (let drag = 0; drag < 6; drag++) {
    const next = nextResizeHint(state);
    if (next.show) shown++;
    state = next.state;
  }
  assert.equal(shown, RESIZE_HINT_LIMIT);
  assert.deepEqual(state, { shown: 3, learned: false });
});

test('a pet that was resized once, is asleep, or is being pinched stays quiet', () => {
  assert.deepEqual(nextResizeHint(learnedResizeHint(DEFAULT_HINT_STATE)), { show: false, state: { shown: 0, learned: true } });
  for (const context of [{ sleeping: true }, { pinching: true }]) {
    assert.deepEqual(nextResizeHint(DEFAULT_HINT_STATE, context), { show: false, state: DEFAULT_HINT_STATE });
  }
  assert.deepEqual(learnedResizeHint({ shown: 2, learned: false }), { shown: 2, learned: true });
});

test('hand-edited or damaged hint state falls back to safe values', () => {
  for (const value of [undefined, null, [], 'x', { shown: '3' }, { shown: -1 }, { shown: 1.5 }, { learned: 'yes' }]) {
    assert.deepEqual(nextResizeHint(value), { show: true, state: { shown: 1, learned: false } });
  }
  assert.deepEqual(nextResizeHint({ shown: 99 }), { show: false, state: { shown: 3, learned: false } });
});

test('hint state survives a restart, keeps the newest write and reads a broken file as fresh', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cornerpet-hint-'));
  try {
    assert.deepEqual(await createResizeHintStore(path.join(directory, 'missing')).read(), DEFAULT_HINT_STATE);
    const store = createResizeHintStore(directory);
    await Promise.all([store.save({ shown: 1, learned: false }), store.save({ shown: 2, learned: false }), store.save({ shown: 2, learned: true })]);
    assert.deepEqual(await createResizeHintStore(directory).read(), { shown: 2, learned: true });
    writeFileSync(path.join(directory, 'resize-hint.json'), '{not json');
    assert.deepEqual(await createResizeHintStore(directory).read(), DEFAULT_HINT_STATE);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
