import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPetModel, petDisplayMode } from '../shared/pet-config.mjs';
import { LAUNCH_URL, PET, buildLaunchUrl, configSearch, normalizePetConfig, parseLaunchUrl, parsePetSearch, dragPosition, serializePetPackage, parsePetPackage, validatePngAsset, MAX_PACKAGE_BYTES } from '../shared/pet-config.mjs';

test('web launch URL resolves to the exact shared pet; untrusted input is rejected', () => {
  assert.deepEqual(parseLaunchUrl(LAUNCH_URL), PET);
  for (const input of [null, '', 'https://adopt?v=1&pet=berry-mochi',
    'cornerpet://adopt?v=2&pet=berry-mochi', 'cornerpet://adopt?v=1&pet=other',
    `${LAUNCH_URL}&v=1`, `${LAUNCH_URL}&path=/tmp/evil.svg`, `${LAUNCH_URL}#x`,
    'cornerpet://user@adopt?v=1&pet=berry-mochi',
    'cornerpet://adopt:99?v=1&pet=berry-mochi',
    'cornerpet://adopt/other?v=1&pet=berry-mochi', 'x'.repeat(257)]) {
    assert.throws(() => parseLaunchUrl(input), String(input));
  }
});

test('DIY choices round-trip through the shared web and desktop schema', () => {
  const pet = normalizePetConfig({ name: '小屿', shape: 'star', material: 'candy', palette: 'blueberry-yogurt', mood: 'wink', accessory: 'headphones' });
  assert.deepEqual(parseLaunchUrl(buildLaunchUrl(pet)), pet);
  assert.deepEqual(parsePetSearch(configSearch(pet)), pet);
  assert.equal(parseLaunchUrl('cornerpet://adopt?v=1&pet=berry-mochi'), PET);
  assert.throws(() => parseLaunchUrl(buildLaunchUrl(pet).replace('s=star', 's=%2Ftmp%2Fevil.svg')));
});

test('drag preserves click threshold and stays within the selected display', () => {
  const start = { x: 100, y: 200, cursor: { x: 150, y: 250 } };
  const area = { x: 0, y: 25, width: 1440, height: 850 };
  const size = { width: 280, height: 320 };
  assert.equal(dragPosition(start, { x: 152, y: 252 }, area, size).moved, false);
  assert.deepEqual(dragPosition(start, { x: 170, y: 270 }, area, size), { moved: true, x: 120, y: 220 });
  assert.deepEqual(dragPosition(start, { x: 9000, y: 9000 }, area, size), { moved: true, x: 1160, y: 555 });
  assert.equal(dragPosition(start, { x: -1500, y: 100 }, { ...area, x: -1440 }, size).x, -1440);
});

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const atlas = `data:image/png;base64,${readFileSync(new URL('./samples/expression-atlas.png', import.meta.url)).toString('base64')}`;

test('a generated expression atlas travels with any PNG pet and rejects wrong sheet geometry', () => {
  const pet = createPetModel({ image2D: png, expressionAtlas: atlas, model3D: null, style: 'mochi', generationProvider: 'openai' });
  assert.equal(pet.expressionAtlas, atlas);
  assert.deepEqual(parsePetPackage(serializePetPackage(pet)), pet);
  assert.equal(normalizePetConfig({ ...pet, name: '新名字' }).expressionAtlas, atlas);
  assert.throws(() => normalizePetConfig({ ...pet, expressionAtlas: png }), /3×2/);
  assert.throws(() => normalizePetConfig({ ...pet, expressionAtlas: 'https://example.com/sheet.png' }), /PNG/);
  assert.throws(() => normalizePetConfig({ ...pet, image2D: null }), /PNG/);
});

test('image expression landmarks and Demo provenance survive saving and desktop transport', () => {
  const eye = { x: .35, y: .45, rx: .03, ry: .04, patchX: .35, patchY: .55 };
  const faceRig = { eyes: [eye, { ...eye, x: .65 }], mouth: { ...eye, x: .5, y: .6 } };
  const pet = createPetModel({ image2D: png, model3D: null, style: 'mochi', faceRig, generationProvider: 'demo' });
  assert.deepEqual(parsePetPackage(serializePetPackage(pet)), pet);
  assert.deepEqual(pet.faceRig, faceRig);
  assert.equal(pet.generationProvider, 'demo');
  assert.equal(normalizePetConfig({ ...pet, name: '小星星' }).faceRig.eyes[0].x, .35);
  const original = createPetModel({ image2D: png, model3D: null });
  assert.equal(original.faceRig, null, 'never stamp a fixed face onto arbitrary uploads');
  assert.equal(original.generationProvider, null);
  for (const invalid of [[], {}, { ...faceRig, eyes: [eye] },
    { ...faceRig, mouth: { ...eye, x: -1 } }, { ...faceRig, mouth: { ...eye, rx: .3 } },
    { ...faceRig, mouth: { ...eye, patchY: NaN } }, { ...faceRig, mouth: { ...eye, ry: 0 } }]) {
    assert.throws(() => normalizePetConfig({ ...pet, faceRig: invalid }), /表情/);
  }
  assert.throws(() => normalizePetConfig({ ...PET, faceRig }), /PNG/);
  assert.throws(() => normalizePetConfig({ ...pet, generationProvider: 'untrusted' }), /生成来源/);
  assert.equal(normalizePetConfig({ ...pet, generationProvider: 'doubao' }).generationProvider, 'doubao');
});

test('portable photo pets round-trip without remote URLs or executable assets', () => {
  for (const type of ['image-pet', 'generated-pet']) {
    const pet = normalizePetConfig({ type, name: '小朋友', asset: png, style: type === 'image-pet' ? 'original' : 'plush', scale: 1.15 });
    assert.deepEqual(parsePetPackage(serializePetPackage(pet)), pet);
    assert.deepEqual(validatePngAsset(pet.asset), { width: 1, height: 1 });
    assert.throws(() => buildLaunchUrl(pet), /cornerpet/);
  }
  assert.deepEqual(parsePetPackage(serializePetPackage(PET)), PET);
  const envelope = JSON.parse(serializePetPackage(normalizePetConfig({ type: 'image-pet', asset: png })));
  for (const asset of [null, '/tmp/photo.png', 'file:///tmp/photo.png', 'https://example.com/pet.png',
    'data:image/svg+xml,<svg onload="alert(1)"/>', png.replace('iVBOR', 'AAAAA'), `${png}?x`]) {
    assert.throws(() => parsePetPackage(JSON.stringify({ ...envelope, pet: { ...envelope.pet, asset } })));
  }
  for (const changes of [{ type: 'remote-pet' }, { scale: 9 }, { style: 'script' }, { name: '\u0000恶意名字' }]) {
    assert.throws(() => parsePetPackage(JSON.stringify({ ...envelope, pet: { ...envelope.pet, ...changes } })));
  }
  const oversized = Buffer.from(png.split(',')[1], 'base64');
  oversized.writeUInt32BE(9999, 16);
  assert.throws(() => validatePngAsset(`data:image/png;base64,${oversized.toString('base64')}`), /2048/);
  assert.throws(() => parsePetPackage('x'.repeat(MAX_PACKAGE_BYTES + 1)), /过大/);
  assert.throws(() => parsePetPackage('{broken'));
  assert.equal(normalizePetConfig(null).type, 'procedural-3d');
});

test('both creation paths have stable identities; PNG can gain 3D without replacing the pet', () => {
  const upload = createPetModel({ source: 'upload', name: '小照片', image2D: png, model3D: null, style: 'plush' });
  const custom = createPetModel({ ...PET, source: 'custom', image2D: png, thumbnail: png });
  assert.notEqual(upload.petId, custom.petId);
  assert.deepEqual(Object.keys(upload), Object.keys(custom));
  for (const pet of [upload, custom]) {
    assert.deepEqual(normalizePetConfig(pet), pet);
    assert.deepEqual(parsePetPackage(serializePetPackage(pet)), pet);
    assert.equal(normalizePetConfig({ ...pet, name: '改个名字' }).petId, pet.petId);
    assert.equal(pet.animation.idle, 'breathe');
    assert.equal(pet.interaction.draggable, true);
    assert.equal(pet.personality, null);
    assert.equal(serializePetPackage(pet).split(png).length, 2, 'do not duplicate the large PNG');
  }
  const upgraded = normalizePetConfig({ ...upload, model3D: custom.model3D });
  assert.equal(petDisplayMode(upload), '2d');
  assert.equal(petDisplayMode(upgraded), '3d');
  assert.equal(upgraded.petId, upload.petId);
  assert.equal(upgraded.createdTime, upload.createdTime);
  assert.equal(upgraded.source, 'upload');
  assert.equal(upgraded.image2D, upload.image2D);
  assert.deepEqual(parsePetPackage(serializePetPackage(upgraded)), upgraded);
  assert.throws(() => normalizePetConfig({ ...upload, model3D: { kind: 'remote', url: 'https://example.com/a.glb' } }));
  assert.throws(() => normalizePetConfig({ ...upload, image2D: null }));
  assert.throws(() => normalizePetConfig({ ...upload, thumbnail: 'file:///tmp/image.png' }));
  assert.throws(() => normalizePetConfig({ ...upload, petId: '../evil' }));
});

test('a saved rejected portrait preset recovers the approved PNG and identity', () => {
  const pet = createPetModel({ source: 'upload', name: '眼镜团', image2D: png, generationProvider: 'demo-3d', style: 'mochi', model3D: {
    kind: 'procedural', version: 2, shape: 'mochi', material: 'mochi', palette: 'fresh-peach', mood: 'blank', accessory: 'none', variant: 'portrait-glasses',
  } });
  assert.equal(petDisplayMode(pet), '2d');
  assert.equal(pet.model3D, null);
  assert.equal(pet.image2D, png);
  assert.equal(pet.name, '眼镜团');
  assert.equal(pet.generationProvider, 'demo');
  assert.deepEqual(parsePetPackage(serializePetPackage(pet)), pet);
  const saved = JSON.parse(serializePetPackage(pet));
  saved.pet.type = 'procedural-3d';
  saved.pet.model3D = { kind: 'procedural', version: 2, shape: 'mochi', material: 'mochi', palette: 'fresh-peach', mood: 'blank', accessory: 'none', variant: 'portrait-glasses' };
  saved.pet.generationProvider = 'demo-3d';
  assert.deepEqual(parsePetPackage(JSON.stringify(saved)), pet);
  assert.throws(() => buildLaunchUrl(pet), /cornerpet/);
  assert.throws(() => normalizePetConfig({ ...pet, model3D: { kind: 'procedural', version: 2, shape: 'mochi', variant: 'untrusted' } }), /3D 形象/);
  assert.throws(() => normalizePetConfig({ ...pet, model3D: { kind: 'procedural', version: 2, shape: 'mochi', variant: 'portrait-glasses' }, image2D: null }), /缺少图片/);
});

test('existing image and 3D files migrate without dropping the old visual configuration', () => {
  const choices = { shape: 'mochi', material: 'cream', palette: 'fresh-peach', mood: 'happy', accessory: 'none' };
  for (const old of [
    { version: 2, type: 'image-pet', style: 'original', asset: png, scale: 1, name: '小照片', ...choices },
    { version: 2, type: 'generated-pet', style: 'plush', asset: png, scale: 1, name: '小毛绒', ...choices },
    { version: 2, type: 'procedural-3d', style: 'original', asset: null, scale: 1, name: '小团', ...choices },
  ]) {
    const text = JSON.stringify({ format: 'cornerpet', version: 1, pet: old });
    const pet = parsePetPackage(text);
    assert.deepEqual(parsePetPackage(text), pet, 'legacy migration has deterministic identity');
    assert.deepEqual(parsePetPackage(serializePetPackage(pet)), pet);
    for (const key of ['name', 'shape', 'material', 'palette', 'mood', 'accessory', 'scale', 'style', 'asset']) assert.equal(pet[key], old[key]);
    assert.equal(petDisplayMode(pet), old.type === 'procedural-3d' ? '3d' : '2d');
  }
});

test('six base models share valid face mounts and survive both desktop transports', async () => {
  const { BASE_MODELS, faceSurface, getBaseModel } = await import('../shared/pet-models.mjs');
  assert.deepEqual(BASE_MODELS.map(model => model.value), ['mochi', 'strawberry', 'toast', 'cloud', 'pudding', 'mushroom']);
  for (const model of BASE_MODELS) {
    for (const material of ['mochi', 'jelly', 'cream', 'candy']) {
      const pet = createPetModel({ source: 'custom', shape: model.value, material, palette: model.palette, mood: 'wink', accessory: 'flower', name: model.label });
      const file = parsePetPackage(serializePetPackage(pet));
      assert.deepEqual(file, pet);
      const protocol = parseLaunchUrl(buildLaunchUrl(pet));
      assert.deepEqual(protocol.model3D, pet.model3D);
      assert.equal(petDisplayMode(file), '3d');
    }
    // All eye/blush/brow/mouth anchors lie on a finite, front-facing body surface.
    for (const x of [-.57, -.32, 0, .32, .57]) for (const y of [-.055, .21, .39]) {
      const point = faceSurface(model.value, x * model.face.scale, y * model.face.scale + model.face.y);
      assert.ok([...point.position, ...point.normal].every(Number.isFinite), model.value);
      assert.ok(point.position[2] > 0 && point.normal[2] > 0, model.value);
    }
  }
  assert.equal(getBaseModel('legacy-unknown').value, 'mochi');
});
