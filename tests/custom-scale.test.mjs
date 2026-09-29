import test from 'node:test';
import assert from 'node:assert/strict';
import { PET, normalizePetConfig, parsePetPackage, serializePetPackage } from '../shared/pet-config.mjs';

test('custom desktop sizes persist for procedural and image pets within portable limits', () => {
  const image = normalizePetConfig({ type: 'image-pet', asset: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' });
  for (const pet of [PET, image]) {
    for (const scale of [.5, .75, 1, 1.25, 1.8, 2.5]) {
      const config = normalizePetConfig({ ...pet, scale });
      assert.equal(config.scale, scale);
      assert.deepEqual(parsePetPackage(serializePetPackage(config)), config);
    }
    const envelope = JSON.parse(serializePetPackage(pet));
    for (const scale of [.49, 2.51, null, '1.8']) {
      assert.throws(() => parsePetPackage(JSON.stringify({ ...envelope, pet: { ...envelope.pet, scale } })));
    }
  }
});
