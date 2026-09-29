import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatePet } from '../server/generate-pet.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const atlas = `data:image/png;base64,${readFileSync(new URL('./samples/expression-atlas.png', import.meta.url)).toString('base64')}`;

test('Doubao edits a transparent photo subject, then produces a six-expression sheet', async () => {
  const requests = [];
  const result = await generatePet({ image: png, style: 'plush' }, { apiKey: 'test-key', model: 'test-image-model', fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ data: [{ b64_json: requests.length === 1 ? png.slice(22) : atlas.slice(22) }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.url === 'https://ark.cn-beijing.volces.com/api/v3/images/generations' && request.options.headers.Authorization === 'Bearer test-key' && JSON.parse(request.options.body).background === 'transparent' && JSON.parse(request.options.body).output_format === 'png'));
  const first = JSON.parse(requests[0].options.body), second = JSON.parse(requests[1].options.body);
  assert.match(first.prompt, /plush toy/);
  assert.equal(first.image, png);
  assert.equal(second.size, '1536x1024');
  assert.match(second.prompt, /happy.*sleepy.*daydreaming.*shy.*surprised/);
  assert.equal(second.image, png);
  assert.equal(result.image, png);
  assert.equal(result.expressions, atlas);
  assert.equal(result.provider, 'doubao');
  await assert.rejects(() => generatePet({ image: png, style: 'mochi' }, { apiKey: '' }), /ARK_API_KEY/);
  await assert.rejects(() => generatePet({ image: png, style: 'mochi' }, { apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ data: [{ b64_json: png.slice(22) }] })) }), /表情图/);
});
