// Geometry and face mounts are shared by Creator and the bundled Desktop renderer.
// Legacy shape IDs remain valid in PetConfig; unsupported old shapes keep the mochi fallback.
export const BASE_MODELS = Object.freeze([
  { value: 'mochi', label: '糯米团', note: '软软一团，慢慢发呆', palette: 'sakura-mochi', material: 'mochi', accessoryMount: [.57, .7, .55], face: { scale: 1, y: 0, surface: 'ellipsoid', radii: [1.25, .98, .92], centerY: 0 } },
  { value: 'strawberry', label: '草莓团', note: '顶着叶子的小甜心', palette: 'strawberry-milk', material: 'jelly', accessoryMount: [.57, .72, .70], face: { scale: .9, y: .03, surface: 'lathe' } },
  { value: 'toast', label: '小吐司', note: '刚晒过太阳的温暖', palette: 'sunny-blanket', material: 'cream', accessoryMount: [.57, .78, .57], face: { scale: 1, y: -.05, surface: 'flat', z: .53 } },
  { value: 'cloud', size: .85, label: '云朵', note: '轻轻飘来，陪你放空', palette: 'sea-salt-soda', material: 'mochi', accessoryMount: [.68, .68, .6], face: { scale: .94, y: -.1, surface: 'flat', z: .55 } },
  { value: 'pudding', label: '布丁', note: '晃一晃，也不着急', palette: 'lemon-mousse', material: 'jelly', accessoryMount: [.57, .54, .62], face: { scale: .94, y: -.15, surface: 'lathe' } },
  { value: 'mushroom', label: '小蘑菇', note: '撑一把自己的小伞', palette: 'fresh-peach', material: 'mochi', accessoryMount: [.6, .84, .8], face: { scale: .66, y: -.42, surface: 'ellipsoid', radii: [.61, .67, .56], centerY: -.35 } },
]);

// [radius, height]; the same profile drives the mesh and the face surface.
/** @param {number[][]} points @returns {number[][]} */
export function smoothProfile(points) {
  for (let pass = 0; pass < 3; pass++) {
    const next = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      next.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    points = [...next, points.at(-1)];
  }
  return points;
}
export const BODY_PROFILES = Object.freeze(Object.fromEntries(Object.entries({
  strawberry: [[0, -.94], [.2, -.91], [.43, -.78], [.65, -.56], [.86, -.24], [1.01, .12], [1.05, .4], [.98, .64], [.8, .82], [.5, .94], [0, .97]],
  pudding: [[0, -.92], [.84, -.92], [1.04, -.88], [1.13, -.77], [1.13, -.65], [.82, .61], [.78, .72], [.66, .79], [0, .79]],
  mushroom: [[0, .19], [.7, .19], [1.17, .22], [1.28, .29], [1.27, .39], [1.17, .62], [.99, .86], [.68, 1.06], [.32, 1.14], [0, 1.16]],
}).map(([key, points]) => [key, smoothProfile(points)])));
export function getBaseModel(shape) { return BASE_MODELS.find(model => model.value === shape) ?? BASE_MODELS[0]; }

function profileSurface(profile, x, y) {
  const index = Math.max(1, profile.findIndex(point => point[1] >= y));
  const [r0, y0] = profile[index - 1], [r1, y1] = profile[index];
  const slope = (r1 - r0) / (y1 - y0);
  const radius = r0 + (y - y0) * slope;
  const z = Math.sqrt(Math.max(.01, radius * radius - x * x));
  return { position: [x, y, z], normal: [x / z, -radius * slope / z, 1] };
}

// The mushroom wears accessories on its cap, while its face lives on the stem.
export function accessorySurface(shape) {
  const model = getBaseModel(shape);
  const [x, y] = model.accessoryMount;
  if (model.value === 'mushroom') return profileSurface(BODY_PROFILES.mushroom, x, y);
  if (model.face.surface === 'flat') return { position: model.accessoryMount, normal: [0, 0, 1] };
  return faceSurface(model.value, x, y);
}

export function faceSurface(shape, x, y) {
  const face = getBaseModel(shape).face;
  let z, dx = 0, dy = 0;
  if (face.surface === 'flat') z = face.z;
  else if (face.surface === 'ellipsoid') {
    const [a, b, c] = face.radii;
    const localY = y - face.centerY;
    z = c * Math.sqrt(Math.max(.01, 1 - (x / a) ** 2 - (localY / b) ** 2));
    dx = x * c * c / (a * a * z); dy = localY * c * c / (b * b * z);
  } else return profileSurface(BODY_PROFILES[shape], x, y);
  return { position: [x, y, z], normal: [dx, dy, 1] };
}
