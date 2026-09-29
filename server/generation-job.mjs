import { getStore } from '@netlify/blobs';

export const JOB_TTL_MS = 60 * 60 * 1000;
export const JOB_WAIT_MS = 12 * 60 * 1000;
export const validJobId = id => typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
export const jobStore = () => getStore({ name: 'cornerpet-generation-jobs', consistency: 'strong' });
export const jobKey = (id, part) => `${id}/${part}`;

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function deleteJob(store, id) {
  await Promise.all(['input', 'status', 'image', 'expressions'].map(part => store.delete(jobKey(id, part))));
}
