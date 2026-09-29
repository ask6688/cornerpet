import { JOB_WAIT_MS, deleteJob, jobKey, jobStore, json, validJobId } from '../../server/generation-job.mjs';

export async function readPetGeneration(request, options = {}) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!validJobId(id)) return json({ error: '生成任务编号无效' }, 400);
  const store = options.store ?? jobStore();
  if (request.method === 'DELETE') {
    await deleteJob(store, id);
    return new Response(null, { status: 204 });
  }
  const entry = await store.getWithMetadata(jobKey(id, 'status'), { type: 'json' });
  if (!entry) return json({ error: '生成任务不存在或已结束' }, 404);
  const status = entry.data;
  if (Date.now() > status.expiresAt) {
    await deleteJob(store, id);
    return json({ error: '生成结果已过期，请重新上传照片' }, 410);
  }
  if (status.state !== 'complete' && Date.now() - status.createdAt > JOB_WAIT_MS) return json({ error: '生成等待超时，请重新试一次' }, 504);
  const asset = searchParams.get('asset');
  if (!asset) return json({ state: status.state, error: status.error, model: status.model });
  if (!['image', 'expressions'].includes(asset)) return json({ error: '图片类型无效' }, 400);
  if (status.state !== 'complete') return json({ error: '图片还在生成中' }, 409);
  const stream = await store.get(jobKey(id, asset), { type: 'stream' });
  if (!stream) return json({ error: '图片结果暂时无法读取，请重试' }, 503);
  return new Response(stream, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export default readPetGeneration;
export const config = { path: '/api/pet-generation', method: ['GET', 'DELETE'] };
