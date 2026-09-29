import { randomUUID } from 'node:crypto';
import { validateGenerationInput, publicGenerationError } from '../../server/generate-pet.mjs';
import { JOB_TTL_MS, deleteJob, jobKey, jobStore, json } from '../../server/generation-job.mjs';

export async function startPetGeneration(request, options = {}) {
  const apiKey = options.apiKey ?? process.env.ARK_API_KEY;
  if (!apiKey) return json({ error: '图片生成服务尚未配置。请先在服务端设置 ARK_API_KEY。' }, 503);
  let id;
  const store = options.store ?? jobStore();
  try {
    const raw = await request.text();
    if (raw.length > 5 * 1024 * 1024) return json({ error: '照片上传数据过大，请换一张试试' }, 413);
    const input = JSON.parse(raw);
    validateGenerationInput(input);
    id = randomUUID();
    const createdAt = Date.now(), expiresAt = createdAt + JOB_TTL_MS;
    await store.set(jobKey(id, 'input'), raw, { metadata: { expiresAt } });
    await store.setJSON(jobKey(id, 'status'), { state: 'queued', createdAt, expiresAt }, { metadata: { expiresAt } });
    const worker = await (options.fetchImpl ?? fetch)(new URL('/.netlify/functions/generate-pet-worker', request.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    });
    if (worker.status !== 202) throw new Error('后台任务没有启动');
    return json({ id }, 202);
  } catch (reason) {
    if (id) await deleteJob(store, id).catch(() => {});
    if (reason instanceof SyntaxError) return json({ error: '上传数据格式不正确' }, 400);
    return json({ error: publicGenerationError(reason) }, Number(reason?.status) || 502);
  }
}

export default startPetGeneration;
export const config = {
  path: '/api/generate-pet',
  method: 'POST',
  rateLimit: { windowLimit: 6, windowSize: 180, aggregateBy: ['ip', 'domain'] },
};
