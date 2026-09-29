import { deleteJob, jobStore, validJobId } from '../../server/generation-job.mjs';

export async function cleanupPetGeneration(options = {}) {
  const store = options.store ?? jobStore();
  const { blobs } = await store.list();
  let removed = 0;
  for (const { key } of blobs) {
    if (!key.endsWith('/status')) continue;
    const id = key.slice(0, -7);
    if (!validJobId(id)) continue;
    const metadata = await store.getMetadata(key);
    if (metadata?.metadata?.expiresAt < Date.now()) {
      await deleteJob(store, id);
      removed++;
    }
    if (removed >= 50) break;
  }
  return removed;
}

export default async () => { await cleanupPetGeneration(); };
export const config = { schedule: '@hourly' };
