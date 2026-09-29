import { parsePetPackage, serializePetPackage, type PET } from '../shared/pet-config.mjs';

// One local companion, including its PNG. IndexedDB avoids localStorage's small
// string quota; no server, account or cross-device syncing is involved.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('cornerpet-companion', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pets');
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('请关闭旧的桌角生物页面后重试保存')); };
  });
}

let writes: Promise<void> = Promise.resolve();
export function savePetLocally(pet: typeof PET): Promise<void> {
  const text = serializePetPackage(pet);
  // Preserve call order even when opening a database is delayed. A failed write
  // leaves the previous committed companion intact and does not block retries.
  writes = writes.catch(() => {}).then(() => writePet(text));
  return writes;
}

async function writePet(text: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('pets', 'readwrite');
      transaction.objectStore('pets').put(text, 'companion');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('本地保存未完成'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function restoreLocalPet(): Promise<typeof PET | null> {
  let storageError: unknown;
  try {
    const db = await database();
    try {
      const text = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('pets').objectStore('pets').get('companion');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (text != null) return parsePetPackage(text);
    } finally { db.close(); }
  } catch (error) { storageError = error; }
  // Existing installations keep their previous saved pet; do not delete legacy
  // storage until the user has a working, verified replacement.
  for (const key of ['cornerpet:created', 'cornerpet:photo']) {
    try { const text = localStorage.getItem(key); if (text) return parsePetPackage(text); } catch { /* Try the other legacy draft. */ }
  }
  if (storageError) throw storageError;
  return null;
}
