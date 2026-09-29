import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion, SphereGeometry, Vector3 } from 'three';
import { accessorySurface, BASE_MODELS, BODY_PROFILES } from '../shared/pet-models.mjs';

test('curved accessory mounts keep flower petals and bows outside the body and pudding caramel', () => {
  for (const model of BASE_MODELS) {
    const surface = accessorySurface(model.value);
    assert.ok([...surface.position, ...surface.normal].every(Number.isFinite), model.value);
    assert.ok(surface.normal[2] > 0, `${model.value}: face outward`);
  }

  const geometry = new SphereGeometry(1, 40, 24);
  const vertices = geometry.getAttribute('position');
  const parts = {
    flower: [
      ...Array.from({ length: 5 }, (_, i) => ({
        position: [Math.cos(i * Math.PI * .4) * .15, Math.sin(i * Math.PI * .4) * .15, 0],
        scale: [.12, .12, .045], angle: 0,
      })),
      { position: [0, 0, .04], scale: [.08, .08, .08], angle: 0 },
    ],
    bow: [
      ...[-1, 1].map(side => ({ position: [side * .14, 0, 0], scale: [.19, .14, .075], angle: side * -.3 })),
      { position: [0, 0, 0], scale: [.09, .1, .09], angle: 0 },
    ],
  };
  for (const shape of ['strawberry', 'pudding', 'mushroom']) {
    const surface = accessorySurface(shape);
    const normal = new Vector3(...surface.normal).normalize();
    const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
    const profile = BODY_PROFILES[shape];
    for (const kind of ['flower', 'bow']) {
      const position = new Vector3(...surface.position).addScaledVector(normal, kind === 'bow' ? .1 : .055);
      const decoration = new Euler(0, 0, kind === 'bow' ? -.27 : -.15);
      for (const part of parts[kind]) for (let index = 0; index < vertices.count; index++) {
        const point = new Vector3().fromBufferAttribute(vertices, index)
          .multiply(new Vector3(...part.scale)).applyEuler(new Euler(0, 0, part.angle))
          .add(new Vector3(...part.position)).applyEuler(decoration).applyQuaternion(orientation).add(position);
        const segment = profile.findIndex(([, y]) => y >= point.y);
        if (segment > 0) {
          const [r0, y0] = profile[segment - 1], [r1, y1] = profile[segment];
          const radius = r0 + (point.y - y0) * (r1 - r0) / (y1 - y0);
          assert.ok(Math.hypot(point.x, point.z) > radius, `${shape}/${kind}: accessory enters the body`);
        }
        if (shape === 'pudding') {
          const outsideCaramel = (point.x / .8) ** 2 + ((point.y - .76) / .11) ** 2 + (point.z / .8) ** 2;
          assert.ok(outsideCaramel > 1, `${shape}/${kind}: accessory enters caramel topping`);
        }
      }
    }
  }
  geometry.dispose();
});
