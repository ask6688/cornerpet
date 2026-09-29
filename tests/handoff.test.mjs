import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { buildConnectUrl, parseConnectUrl, HANDOFF_PATH } from '../shared/desktop-connect.mjs';
import { PET, createPetModel, serializePetPackage, MAX_PACKAGE_BYTES } from '../shared/pet-config.mjs';
import { createHandoffServer, parseDesktopPackage } from '../desktop/handoff.mjs';

const origin = 'https://studio.example.com';
const token = 'a'.repeat(64);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const image = Buffer.from(png.split(',')[1], 'base64');
const atlasImage = readFileSync(new URL('./samples/expression-atlas.png', import.meta.url));
const atlas = `data:image/png;base64,${atlasImage.toString('base64')}`;
const decode = bytes => bytes.equals(image) ? { width: 1, height: 1 } : bytes.equals(atlasImage) ? { width: 1536, height: 1024 } : null;

test('pairing links contain only a strong capability and exact secure web origin', () => {
  for (const site of [origin, 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173']) {
    assert.deepEqual(parseConnectUrl(buildConnectUrl({ token, origin: site })), { token, origin: site });
  }
  for (const site of ['null', 'file:///tmp/site', 'http://evil.example', `${origin}/`, `${origin}/path`, `${origin}?x`, 'https://user@studio.example.com']) {
    assert.throws(() => buildConnectUrl({ token, origin: site }));
  }
  const url = buildConnectUrl({ token, origin });
  for (const bad of [`${url}&token=${token}`, `${url}&file=/tmp/a`, `${url}#secret`, url.replace('connect?', 'connect/path?'), url.replace('connect?', 'user@connect?'), url.replace('v=1', 'v=2'), url.replace(token, 'short'), url.replace('cornerpet:', 'https:')]) {
    assert.throws(() => parseConnectUrl(bad));
  }
});

test('file and HTTP imports decode every PNG, including procedural thumbnails', () => {
  const photo = createPetModel({ source: 'upload', model3D: null, image2D: png });
  assert.deepEqual(parseDesktopPackage(serializePetPackage(photo), decode), photo);
  const expressive = createPetModel({ ...photo, expressionAtlas: atlas });
  assert.deepEqual(parseDesktopPackage(serializePetPackage(expressive), decode), expressive);
  assert.throws(() => parseDesktopPackage(serializePetPackage(expressive), bytes => bytes.equals(image) ? { width: 1, height: 1 } : null), /无法解码/);
  assert.deepEqual(parseDesktopPackage(serializePetPackage(PET), decode), PET);
  const broken = Buffer.from(image); broken.fill(0, 33);
  const invalid = `data:image/png;base64,${broken.toString('base64')}`;
  for (const pet of [createPetModel({ ...photo, image2D: invalid }), createPetModel({ ...PET, thumbnail: invalid })]) {
    assert.throws(() => parseDesktopPackage(serializePetPackage(pet), decode), /无法解码/);
  }
  assert.throws(() => parseDesktopPackage('x'.repeat(MAX_PACKAGE_BYTES + 1), decode));
});

test('loopback handoff authorizes one origin, bounds input, and acknowledges actual adoption', async () => {
  const adopted = [];
  const bridge = createHandoffServer({ port: 0, adopt: async text => {
    const pet = parseDesktopPackage(text, decode);
    await new Promise(resolve => setTimeout(resolve, 10));
    adopted.push(pet);
    return pet;
  } });
  const address = await bridge.listen();
  assert.equal(address.address, '127.0.0.1');
  const request = ({ method = 'POST', path = HANDOFF_PATH, headers = {}, body = serializePetPackage(PET), chunks } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, path, method, headers: {
      Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers,
    } }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
    });
    req.on('error', reject);
    if (chunks) { for (const chunk of chunks) req.write(chunk); req.end(); }
    else req.end(body);
  });
  try {
    assert.equal((await request()).status, 403);
    bridge.pair(buildConnectUrl({ token, origin }));
    for (const site of ['null', 'https://studio.example.com.evil.test', 'https://other.example.com']) {
      const result = await request({ headers: { Origin: site } });
      assert.equal(result.status, 403);
      assert.equal(result.headers['access-control-allow-origin'], undefined);
    }
    const preflight = await request({ method: 'OPTIONS', body: '', headers: {
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type', 'Access-Control-Request-Private-Network': 'true',
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);
    assert.equal(preflight.headers['access-control-allow-private-network'], 'true');
    assert.equal((await request({ method: 'OPTIONS', body: '', headers: { 'Access-Control-Request-Method': 'PUT' } })).status, 400);
    assert.equal((await request({ headers: { Host: 'evil.test' } })).status, 400);
    assert.equal((await request({ method: 'GET', body: '' })).status, 405);
    assert.equal((await request({ path: '/v1/pet?file=/tmp/a' })).status, 404);
    assert.equal((await request({ headers: { Authorization: `Bearer ${'b'.repeat(64)}` } })).status, 401);
    assert.equal((await request({ headers: { 'Content-Type': 'text/plain' } })).status, 415);
    for (const pet of [PET, createPetModel({ source: 'upload', model3D: null, image2D: png, style: 'plush', name: '小照片' })]) {
      const result = await request({ body: serializePetPackage(pet) });
      assert.equal(result.status, 200);
      assert.deepEqual(JSON.parse(result.text), { ok: true, petId: pet.petId, name: pet.name });
      assert.deepEqual(adopted.at(-1), pet);
    }
    assert.equal((await request({ body: '{broken' })).status, 400);
    assert.equal((await request({ body: Buffer.from([0xff]) })).status, 400);
    const broken = Buffer.from(image); broken.fill(0, 33);
    const malformed = createPetModel({ source: 'upload', model3D: null, image2D: `data:image/png;base64,${broken.toString('base64')}` });
    assert.equal((await request({ body: serializePetPackage(malformed) })).status, 400);
    const remote = JSON.parse(serializePetPackage(malformed)); remote.pet.image2D = 'https://evil.example/photo.png';
    assert.equal((await request({ body: JSON.stringify(remote) })).status, 400);
    assert.equal((await request({ body: '', headers: { 'Content-Length': String(MAX_PACKAGE_BYTES + 1) } })).status, 413);
    assert.equal((await request({ chunks: [Buffer.alloc(MAX_PACKAGE_BYTES), Buffer.from('!')], headers: { 'Transfer-Encoding': 'chunked' } })).status, 413);
    assert.equal(adopted.length, 2, 'invalid packages must never adopt a pet');
    bridge.pair(buildConnectUrl({ token: 'b'.repeat(64), origin }));
    assert.equal((await request()).status, 401, 'old capabilities expire immediately');
  } finally { await bridge.close(); }
});

test('native last-pet storage survives restart for 3D and PNG and atomically keeps the newest pet', async () => {
  const { mkdtemp, readFile, rm, stat, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createPetStorage } = await import('../desktop/pet-storage.mjs');
  const directory = await mkdtemp(path.join(tmpdir(), 'cornerpet-storage-test-'));
  try {
    const storage = createPetStorage(directory);
    const photo = createPetModel({ source: 'upload', model3D: null, image2D: png, name: '照片名字' });
    const custom = createPetModel({ ...PET, name: '团子名字' });
    for (const pet of [photo, custom]) {
      await storage.save(pet);
      assert.deepEqual(parseDesktopPackage(await createPetStorage(directory).read(), decode), pet);
    }
    await Promise.all([storage.save(custom), storage.save(photo)]);
    assert.deepEqual(parseDesktopPackage(await storage.read(), decode), photo);
    const file = path.join(directory, 'last-pet.cornerpet');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await writeFile(`${file}.tmp`, '{interrupted');
    assert.deepEqual(parseDesktopPackage(await storage.read(), decode), photo, 'an interrupted temp write leaves the last complete pet');
    await writeFile(file, 'x'.repeat(MAX_PACKAGE_BYTES + 1));
    await assert.rejects(storage.read(), /过大/);
    await storage.save(custom);
    assert.deepEqual(parseDesktopPackage(await readFile(file, 'utf8'), decode), custom);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
