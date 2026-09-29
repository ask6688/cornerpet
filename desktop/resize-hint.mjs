import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const RESIZE_HINT_LIMIT = 3;
export const DEFAULT_HINT_STATE = Object.freeze({ shown: 0, learned: false });

export function normalizeHintState(value) {
  const shown = Number.isInteger(value?.shown) && value.shown >= 0 ? Math.min(value.shown, RESIZE_HINT_LIMIT) : 0;
  return Object.freeze({ shown, learned: value?.learned === true });
}

// The pet explains resizing a few times, and never again once someone has used it.
export function nextResizeHint(state, { sleeping = false, pinching = false } = {}) {
  const current = normalizeHintState(state);
  if (current.learned || current.shown >= RESIZE_HINT_LIMIT || sleeping || pinching) return { show: false, state: current };
  return { show: true, state: Object.freeze({ ...current, shown: current.shown + 1 }) };
}

export function learnedResizeHint(state) {
  return Object.freeze({ ...normalizeHintState(state), learned: true });
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
