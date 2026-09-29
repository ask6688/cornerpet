import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const RESIZE_HINT_LIMIT = 3;
export const DEFAULT_HINT_STATE = Object.freeze({ shown: 0 });

export function normalizeHintState(value) {
  const shown = Number.isInteger(value?.shown) && value.shown >= 0 ? Math.min(value.shown, RESIZE_HINT_LIMIT) : 0;
  return Object.freeze({ shown });
}

// The pet explains resizing on the first few drags, whether or not someone has resized it yet.
export function nextResizeHint(state, { sleeping = false, pinching = false } = {}) {
  const current = normalizeHintState(state);
  if (current.shown >= RESIZE_HINT_LIMIT || sleeping || pinching) return { show: false, state: current };
  return { show: true, state: Object.freeze({ ...current, shown: current.shown + 1 }) };
}

export function createResizeHintStore(directory) {
  const file = path.join(directory, 'resize-hint.json');
  let writing = Promise.resolve();
  return {
    async read() {
      try { return normalizeHintState(JSON.parse(await readFile(file, 'utf8'))); }
      catch { return DEFAULT_HINT_STATE; }
    },
    save(state) {
      const text = JSON.stringify(normalizeHintState(state));
      // Serialized atomic replacements, like the saved pet: the newest state always wins.
      writing = writing.catch(() => {}).then(async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(`${file}.tmp`, text, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
      return writing;
    },
  };
}
