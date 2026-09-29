import { Quaternion, Vector2, Vector3, Shape } from 'three';
import { OPTIONS, PET } from './pet-config.mjs';
import { BODY_PROFILES, getBaseModel, faceSurface, accessorySurface } from './pet-models.mjs';
import { BodyMaterial } from './PetMaterials';

type Point = [number, number, number];
type Config = typeof PET;
const profiles = Object.fromEntries(Object.entries(BODY_PROFILES).map(([key, points]) => [key, points.map(([r, y]) => new Vector2(r, y))]));
const cap = profiles.mushroom;

const bread = new Shape();
bread.moveTo(-.82, -.87); bread.quadraticCurveTo(-1, -.87, -1, -.68);
bread.lineTo(-1, .52); bread.bezierCurveTo(-1.18, .92, -.65, 1.16, -.18, .93);
bread.quadraticCurveTo(0, .85, .18, .93); bread.bezierCurveTo(.65, 1.16, 1.18, .92, 1, .52);
bread.lineTo(1, -.68); bread.quadraticCurveTo(1, -.87, .82, -.87); bread.closePath();
const cloud = new Shape();
cloud.moveTo(-.9, -.68);
cloud.bezierCurveTo(-1.5, -.69, -1.55, .12, -1.05, .25);
cloud.bezierCurveTo(-1.16, .82, -.51, 1.08, -.19, .73);
cloud.bezierCurveTo(.17, 1.17, .88, 1.04, .88, .47);
cloud.bezierCurveTo(1.54, .53, 1.55, -.25, 1.11, -.43);
cloud.quadraticCurveTo(1.08, -.69, .75, -.68);
cloud.closePath();
const star = new Shape();
const starPoints = Array.from({ length: 10 }, (_, i) => new Vector2(
  Math.cos(Math.PI / 2 + i * Math.PI / 5) * (i % 2 ? .115 : .25),
  Math.sin(Math.PI / 2 + i * Math.PI / 5) * (i % 2 ? .115 : .25),
));
const starStart = starPoints[9].clone().lerp(starPoints[0], .5);
star.moveTo(starStart.x, starStart.y);
starPoints.forEach((point, i) => {
  const end = point.clone().lerp(starPoints[(i + 1) % 10], .5);
  star.quadraticCurveTo(point.x, point.y, end.x, end.y);
});
star.closePath();

export function BodyGeometry({ config }: { config: Config }) {
  const palette = OPTIONS.palettes.find(item => item.value === config.palette)!;
  const kind = config.material;
  const shape = getBaseModel(config.shape).value;
  const material = (color = palette.body) => <BodyMaterial kind={kind} color={color} />;
  function ball(key: string, position: Point, scale: Point, color = palette.body, rotation: Point = [0, 0, 0]) {
    return <mesh key={key} position={position} scale={scale} rotation={rotation} renderOrder={kind === 'candy' ? 2 : 0}><sphereGeometry args={[1, 40, 28]} />{material(color)}</mesh>;
  }
  const feet = (spacing = .46, color = palette.body) => [-1, 1].map(side => ball(`foot${side}`, [side * spacing, -.94, .13], [.28, .14, .36], color));
  const arms = (width: number, y = -.27) => [-1, 1].map(side => ball(`arm${side}`, [side * width, y, 0], [.14, .29, .17], palette.body, [0, 0, side * .3]));
  const leaves = (count: number) => Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    return ball(`leaf${i}`, [Math.cos(angle) * .24, .99, Math.sin(angle) * .22], [.32, .085, .15], palette.accent, [0, -angle, .16]);
  });
  if (shape === 'strawberry') return <>
    <mesh><latheGeometry args={[profiles.strawberry, 64]} />{material()}</mesh>
    {feet(.36)}{arms(.93)}{leaves(5)}
    {[-.72, -.37, 0, .37, .72].map((x, i) => {
      const point = faceSurface('strawberry', x, .57 + (i % 2) * .13);
      const position = new Vector3(...point.position as Point).addScaledVector(new Vector3(...point.normal as Point).normalize(), .012).toArray() as Point;
      return ball(`seed${i}`, position, [.032, .057, .025], '#FFF2CD', [0, x * .6, -.15]);
    })}
    {[-1, 1].map(side => {
      const point = faceSurface('strawberry', side * .54, -.45);
      return ball(`seedlow${side}`, [point.position[0], point.position[1], point.position[2] + .012], [.028, .055, .025], '#FFF2CD', [0, side * .6, -.1]);
    })}
  </>;
  if (shape === 'toast') return <>
    <mesh position={[0, 0, -.33]}><extrudeGeometry args={[bread, { depth: .66, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 5, steps: 1, curveSegments: 20 }]} />{material(palette.shade)}</mesh>
    {[-1, 1].map(side => <mesh key={side} position={[0, -.015, side * .43]} scale={[.89, .86, 1]} rotation={[0, side === -1 ? Math.PI : 0, 0]}><extrudeGeometry args={[bread, { depth: .04, bevelEnabled: true, bevelThickness: .06, bevelSize: .045, bevelSegments: 4, steps: 1, curveSegments: 20 }]} />{material()}</mesh>)}
    {feet()}{arms(1.03)}
  </>;
  if (shape === 'cloud') return <>
    <mesh position={[0, 0, -.35]}><extrudeGeometry args={[cloud, { depth: .7, bevelEnabled: true, bevelThickness: .2, bevelSize: .12, bevelSegments: 8, steps: 1, curveSegments: 24 }]} />{material()}</mesh>{feet(.43)}
  </>;
  if (shape === 'pudding') return <>
    <mesh><latheGeometry args={[profiles.pudding, 64]} />{material()}</mesh>
    {ball('caramel', [0, .76, 0], [.8, .11, .8], palette.shade)}
    {ball('drip', [-.43, .62, .57], [.15, .22, .13], palette.shade)}
    {feet()}{arms(.98, -.4)}
  </>;
  if (shape === 'mushroom') return <>
    {ball('stem', [0, -.35, 0], [.61, .67, .56], palette.light)}
    <mesh><latheGeometry args={[cap, 64]} />{material()}</mesh>
    {[[-.57, .81, .17], [.63, .59, .12], [.09, 1.04, .14]].map(([x, y, size], i) => {
      const index = cap.findIndex(point => point.y >= y);
      const a = cap[index - 1], b = cap[index];
      const radius = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
      const z = Math.sqrt(radius * radius - x * x);
      return ball(`spot${i}`, [x, y, z + .018], [size, size * .65, .045], palette.light, [-.65, x * .5, 0]);
    })}
    {feet(.29, palette.light)}
  </>;
  return <>
    {ball('body', [0, 0, 0], [1.25, .98, .92])}{feet()}{arms(1.06)}
  </>;
}

// Accessories use the same material system and sit above each model's face.
export function PetAccessory({ config }: { config: Config }) {
  const palette = OPTIONS.palettes.find(item => item.value === config.palette)!;
  const accessory = config.accessory;
  if (!['flower', 'bow', 'starpin'].includes(accessory)) return null;
  const surface = accessorySurface(config.shape);
  const normal = new Vector3(...surface.normal as Point).normalize();
  // The back of each ornament rests just outside the surface, rather than its centre being buried.
  const clearance = accessory === 'bow' ? .1 : accessory === 'flower' ? .055 : .035;
  const position = new Vector3(...surface.position as Point).addScaledVector(normal, clearance);
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
  const mat = <BodyMaterial kind={config.material} color={palette.accent} />;
  return <group position={position} quaternion={quaternion}>
  {accessory === 'flower' && <group rotation={[0, 0, -.15]}>
    {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI * .4) * .15, Math.sin(i * Math.PI * .4) * .15, 0]} scale={[.12, .12, .045]}><sphereGeometry args={[1, 20, 12]} />{mat}</mesh>)}
    <mesh position={[0, 0, .04]}><sphereGeometry args={[.08, 20, 12]} /><BodyMaterial kind={config.material} color="#FFF2C9" /></mesh>
  </group>}
  {accessory === 'bow' && <group rotation={[0, 0, -.27]}>
    {[-1, 1].map(side => <mesh key={side} position={[side * .14, 0, 0]} scale={[.19, .14, .075]} rotation={[0, 0, side * -.3]}><sphereGeometry args={[1, 24, 16]} />{mat}</mesh>)}
    <mesh scale={[.09, .1, .09]}><sphereGeometry args={[1, 20, 12]} />{mat}</mesh>
  </group>}
  {accessory === 'starpin' && <mesh rotation={[0, 0, -.15]}>
    <extrudeGeometry args={[star, { depth: .035, bevelEnabled: true, bevelThickness: .025, bevelSize: .012, bevelSegments: 3, steps: 1, curveSegments: 8 }]} />{mat}
  </mesh>}
  </group>;
}
