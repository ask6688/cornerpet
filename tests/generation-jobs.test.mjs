import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startPetGeneration } from '../netlify/functions/generate-pet.mjs';
import { runPetGeneration } from '../netlify/functions/generate-pet-worker.mjs';
import { readPetGeneration } from '../netlify/functions/pet-generation.mjs';
import { cleanupPetGeneration } from '../netlify/functions/cleanup-pet-generation.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const atlas = `data:image/png;base64,${readFileSync(new URL('./samples/expression-atlas.png', import.meta.url)).toString('base64')}`;

function memoryStore() {
  const entries = new Map(); let version = 0;
  const read = key => entries.get(key);
  return {
    entries,
    async set(key, value, options = {}) {
      if (options.onlyIfMatch && read(key)?.etag !== options.onlyIfMatch) return { modified: false };
      entries.set(key, { value, metadata: options.metadata ?? {}, etag: `"${++version}"` });
      return { modified: true, etag: read(key).etag };
    },
    async setJSON(key, value, options) { return this.set(key, JSON.stringify(value), options); },
    async get(key, options = {}) {
      const value = read(key)?.value;
      if (value == null) return null;
      return options.type === 'stream' ? (value instanceof Blob ? value : new Blob([value])).stream() : value;
    },
    async getWithMetadata(key, options = {}) {
      const entry = read(key);
      return entry ? { data: options.type === 'json' ? JSON.parse(entry.value) : entry.value, metadata: entry.metadata, etag: entry.etag } : null;
    },
    async getMetadata(key) { const entry = read(key); return entry ? { metadata: entry.metadata, etag: entry.etag } : null; },
    async delete(key) { entries.delete(key); },
    async list() { return { blobs: [...entries.keys()].map(key => ({ key })) }; },
  };
}

test('test-site generation job uploads, runs once, serves both PNGs, and deletes private assets', async () => {
  const store = memoryStore(); let calls = 0;
  const start = await startPetGeneration(new Request('https://test.netlify.app/api/generate-pet', { method: 'POST', body: JSON.stringify({ image: png, style: 'mochi' }) }), {
    store, apiKey: 'test-key', fetchImpl: async () => new Response(null, { status: 202 }),
  });
  assert.equal(start.status, 202);
  const { id } = await start.json();
  const url = `https://test.netlify.app/api/pet-generation?id=${id}`;
  assert.equal((await (await readPetGeneration(new Request(url), { store })).json()).state, 'queued');
  const work = new Request('https://test.netlify.app/.netlify/functions/generate-pet-worker', { method: 'POST', body: JSON.stringify({ id }) });
  const options = { store, generate: async () => { calls++; return { image: png, expressions: atlas, model: 'stub-image-model' }; } };
  await runPetGeneration(work, options);
  await runPetGeneration(work, options);
  assert.equal(calls, 1);
  assert.deepEqual(await (await readPetGeneration(new Request(url), { store })).json(), { state: 'complete', model: 'stub-image-model' });
  for (const asset of ['image', 'expressions']) {
    const response = await readPetGeneration(new Request(`${url}&asset=${asset}`), { store });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from((asset === 'image' ? png : atlas).slice(22), 'base64'));
  }
  assert.equal((await readPetGeneration(new Request(url, { method: 'DELETE' }), { store })).status, 204);
  assert.equal(store.entries.size, 0);
});

test('missing key and failed generation return clear terminal errors', async () => {
  const store = memoryStore();
  const request = () => new Request('https://test.netlify.app/api/generate-pet', { method: 'POST', body: JSON.stringify({ image: png, style: 'mochi' }) });
  const missing = await startPetGeneration(request(), { store, apiKey: '' });
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /ARK_API_KEY/);
  const start = await startPetGeneration(request(), { store, apiKey: 'test-key', fetchImpl: async () => new Response(null, { status: 202 }) });
  const { id } = await start.json();
  await runPetGeneration(new Request('https://test.netlify.app/worker', { method: 'POST', body: JSON.stringify({ id }) }), { store, generate: async () => { throw Object.assign(new Error('图片被拒绝'), { status: 422 }); } });
  const status = await (await readPetGeneration(new Request(`https://test.netlify.app/api/pet-generation?id=${id}`), { store })).json();
  assert.deepEqual({ state: status.state, error: status.error }, { state: 'failed', error: '图片被拒绝' });
  const entry = await store.getWithMetadata(`${id}/status`, { type: 'json' });
  await store.setJSON(`${id}/status`, { ...entry.data, expiresAt: Date.now() - 1 }, { metadata: { expiresAt: Date.now() - 1 } });
  assert.equal(await cleanupPetGeneration({ store }), 1);
  assert.equal(store.entries.size, 0);
});
