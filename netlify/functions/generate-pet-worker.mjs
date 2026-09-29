import { generatePet, publicGenerationError } from '../../server/generate-pet.mjs';
import { jobKey, jobStore, validJobId } from '../../server/generation-job.mjs';

export async function runPetGeneration(request, options = {}) {
  const { id } = await request.json().catch(() => ({}));
  if (!validJobId(id)) return;
  const store = options.store ?? jobStore();
  const key = jobKey(id, 'status');
  const current = await store.getWithMetadata(key, { type: 'json' });
  if (!current || current.data.state !== 'queued') return;
  const { createdAt, expiresAt } = current.data;
  const claimed = await store.setJSON(key, { state: 'processing', createdAt, expiresAt }, { metadata: { expiresAt }, onlyIfMatch: current.etag });
  if (!claimed.modified) return;
  try {
    const input = await store.get(jobKey(id, 'input'));
    if (!input) throw new Error('上传照片已过期');
    const result = await (options.generate ?? generatePet)(JSON.parse(input), { apiKey: options.apiKey ?? process.env.ARK_API_KEY, fetchImpl: options.fetchImpl });
    await Promise.all(['image', 'expressions'].map(part => store.set(jobKey(id, part), new Blob([Buffer.from(result[part].slice(22), 'base64')], { type: 'image/png' }), { metadata: { expiresAt } })));
    await store.setJSON(key, { state: 'complete', createdAt, expiresAt, model: result.model }, { metadata: { expiresAt } });
  } catch (reason) {
    await store.setJSON(key, { state: 'failed', createdAt, expiresAt, error: publicGenerationError(reason) }, { metadata: { expiresAt } });
  } finally {
    await store.delete(jobKey(id, 'input')).catch(() => {});
  }
}

export default runPetGeneration;
export const config = { background: true };
