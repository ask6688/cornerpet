import path from 'node:path';
import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { MAX_PACKAGE_BYTES, serializePetPackage } from '../shared/pet-config.mjs';

export async function readPetFile(file) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_PACKAGE_BYTES) throw new Error('桌宠文件过大或无效');
    // Bound the read too: another process may grow the file after stat.
    const buffer = Buffer.alloc(MAX_PACKAGE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_PACKAGE_BYTES) throw new Error('桌宠文件过大');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}

export function createPetStorage(directory) {
  const file = path.join(directory, 'last-pet.cornerpet');
  let writing = Promise.resolve();
  return {
    read: () => readPetFile(file),
    save(pet) {
      const text = serializePetPackage(pet);
      // One atomic replacement, serialized so an older write cannot overwrite the newest pet.
      writing = writing.catch(() => {}).then(async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(`${file}.tmp`, text, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
      return writing;
    },
  };
}
