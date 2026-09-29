import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { addAfterEffect, Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, Line, OrbitControls } from '@react-three/drei';
import { BackSide, Box3, MathUtils, Matrix4, Quaternion, Vector3, type Group, type Mesh } from 'three';
import { OPTIONS, PET, normalizePetConfig } from './pet-config.mjs';
import { Pet } from './Pet';
import { BodyGeometry, PetAccessory } from './PetBodies';
import { BASE_MODELS, getBaseModel, faceSurface } from './pet-models.mjs';
import type { PetReaction } from './usePetInteraction';
import { PET_STATE_MOODS, type PetState } from './pet-state.mjs';
import { petMotionAt } from './pet-interaction.mjs';
import './pet-3d.css';

type PetConfig = typeof PET;
export type PetScreenBounds = { x: number; y: number; width: number; height: number };
type Point = [number, number, number];
const FACE_INK = '#5C433A';
const FaceModel = createContext(BASE_MODELS[0]);
const ReducedMotion = createContext(false);

function SurfacePatch({ x, y, lift = .018, children }: { x: number; y: number; lift?: number; children: ReactNode }) {
  const model = useContext(FaceModel);
  const placement = useMemo(() => {
    const point = faceSurface(model.value, x * model.face.scale, y * model.face.scale + model.face.y);
    const normal = new Vector3(...point.normal as Point).normalize();
    return { position: new Vector3(...point.position as Point).addScaledVector(normal, lift), quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal) };
  }, [model, x, y, lift]);
  return <group position={placement.position} quaternion={placement.quaternion} scale={model.face.scale}>{children}</group>;
}

function FaceStroke({ x, y, points, ink = FACE_INK, width = 2.7 }: { x: number; y: number; points: Point[]; ink?: string; width?: number }) {
  return <SurfacePatch x={x} y={y} lift={.024}><Line renderOrder={10} points={points} color={ink} lineWidth={width} toneMapped={false} depthTest depthWrite={false} transparent opacity={.999} /></SurfacePatch>;
}

function OpenEye({ x, y, size = 1, glance = 0 }: { x: number; y: number; size?: number; glance?: number }) {
  const eye = useRef<Group>(null);
  const reducedMotion = useContext(ReducedMotion);
  useFrame(({ clock }, delta) => {
    if (!eye.current) return;
    const blink = !reducedMotion && clock.elapsedTime % 5.1 > 4.88 ? .08 : 1;
    eye.current.scale.y = MathUtils.damp(eye.current.scale.y, blink, 30, delta);
  });
  return <SurfacePatch x={x + glance} y={y}>
    <group ref={eye} scale={[size * .72, size, 1]}>
      <mesh renderOrder={10}>
        <circleGeometry args={[.074, 32]} />
        <meshBasicMaterial color={FACE_INK} toneMapped={false} depthTest depthWrite={false} transparent opacity={.999} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh renderOrder={11} position={[.018, .025, .003]} scale={[.28, .28, 1]}>
        <circleGeometry args={[.074, 20]} />
        <meshBasicMaterial color="#FFFDF9" toneMapped={false} depthTest depthWrite={false} transparent opacity={.999} />
      </mesh>
    </group>
  </SurfacePatch>;
}

function ClosedEye({ x, y, kind = 'soft' }: { x: number; y: number; kind?: 'soft' | 'happy' | 'half' }) {
  const points: Point[] = kind === 'happy'
    ? [[-.075, -.015, 0], [-.04, .019, .002], [0, .038, .004], [.04, .019, .002], [.075, -.015, 0]]
    : kind === 'half'
      ? [[-.07, .008, 0], [-.035, -.002, .001], [0, -.006, .002], [.035, -.002, .001], [.07, .008, 0]]
      : [[-.075, .018, 0], [-.04, -.004, .002], [0, -.015, .004], [.04, -.004, .002], [.075, .018, 0]];
  return <FaceStroke x={x} y={y} points={points} width={2.5} />;
}

function FaceLayer({ mood, blush }: { mood: string; blush: string }) {
  const layer = useRef<Group>(null);
  const forward = useRef(new Vector3());
  const toCamera = useRef(new Vector3());
  const worldPosition = useRef(new Vector3());
  const worldRotation = useRef(new Quaternion());
  useFrame(({ camera }) => {
    if (!layer.current) return;
    layer.current.getWorldQuaternion(worldRotation.current);
    layer.current.getWorldPosition(worldPosition.current);
    forward.current.set(0, 0, 1).applyQuaternion(worldRotation.current);
    toCamera.current.copy(camera.position).sub(worldPosition.current).normalize();
    layer.current.visible = forward.current.dot(toCamera.current) > .02;
  });

  const eyeY = .21;
  const glance = mood === 'peek' ? -.045 : 0;
  const spotted = mood === 'spotted';
  const closed = mood === 'sleepy' || mood === 'happy';
  const half = mood === 'okay' || mood === 'still';
  const mouth = mood === 'sad'
    ? [[-.11, -.018, 0], [-.055, .028, .002], [0, .055, .004], [.055, .028, .002], [.11, -.018, 0]] as Point[]
    : mood === 'blank' || mood === 'still'
      ? [[-.07, 0, 0], [.07, 0, 0]] as Point[]
      : mood === 'sleepy'
        ? [[-.07, .008, 0], [-.035, -.006, .001], [0, -.015, .002], [.035, -.006, .001], [.07, .008, 0]] as Point[]
        : mood === 'peek'
          ? [[-.035, 0, 0], [.045, -.008, 0]] as Point[]
          : [[-.11, .025, 0], [-.055, -.022, .002], [0, -.052, .004], [.055, -.022, .002], [.11, .025, 0]] as Point[];

  function eye(side: 'left' | 'right') {
    const x = side === 'left' ? -.32 : .32;
    if (mood === 'wink' && side === 'left') return <ClosedEye key={side} x={x} y={eyeY} kind="happy" />;
    if (closed) return <ClosedEye key={side} x={x} y={eyeY} kind={mood === 'happy' ? 'happy' : 'soft'} />;
    if (half) return <ClosedEye key={side} x={x} y={eyeY} kind="half" />;
    return <OpenEye key={side} x={x} y={eyeY} glance={glance} size={spotted ? 1.24 : mood === 'sad' ? .88 : 1} />;
  }

  return <group ref={layer} renderOrder={4}>
    <SurfacePatch x={-.57} y={-.015} lift={.021}>
      <mesh renderOrder={10} scale={[.15, mood === 'shy' ? .07 : .052, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial color={blush} transparent opacity={mood === 'shy' ? .42 : .27} toneMapped={false} depthTest depthWrite={false} />
      </mesh>
    </SurfacePatch>
    <SurfacePatch x={.57} y={-.015} lift={.021}>
      <mesh renderOrder={10} scale={[.15, mood === 'shy' ? .07 : .052, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial color={blush} transparent opacity={mood === 'shy' ? .42 : .27} toneMapped={false} depthTest depthWrite={false} />
      </mesh>
    </SurfacePatch>
    {eye('left')}{eye('right')}
    {spotted
      ? <SurfacePatch x={0} y={-.055} lift={.024}><mesh renderOrder={10}><ringGeometry args={[.026, .04, 28]} /><meshBasicMaterial color={FACE_INK} toneMapped={false} depthTest depthWrite={false} transparent opacity={.999} /></mesh></SurfacePatch>
      : <FaceStroke x={0} y={-.055} points={mouth} />}
    {mood === 'sad' && <>
      <FaceStroke x={-.32} y={.39} points={[[-.09, -.015, 0], [0, .025, .002], [.09, .005, 0]]} width={2.1} />
      <FaceStroke x={.32} y={.39} points={[[-.09, .005, 0], [0, .025, .002], [.09, -.015, 0]]} width={2.1} />
    </>}
  </group>;
}

function CharacterBounds({ root, shape, accessory, onBounds }: { root: RefObject<Group | null>; shape: string; accessory: string; onBounds: (bounds: PetScreenBounds) => void }) {
  const get = useThree(state => state.get);
  useEffect(() => {
    const character = root.current;
    if (!character) return;
    character.updateWorldMatrix(true, true);
    const inverse = character.matrixWorld.clone().invert();
    const local = new Box3(), relative = new Matrix4();
    character.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) local.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative.multiplyMatrices(inverse, mesh.matrixWorld)));
    });
    if (local.isEmpty()) return;
    // Cache geometry once per silhouette; animation and orbit only project eight corners.
    const corners = [local.min.x, local.max.x].flatMap(x => [local.min.y, local.max.y].flatMap(y => [local.min.z, local.max.z].map(z => new Vector3(x, y, z))));
    const point = new Vector3();
    return addAfterEffect(() => {
      const { camera, size } = get();
      character.updateWorldMatrix(true, false);
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const corner of corners) {
        point.copy(corner).applyMatrix4(character.matrixWorld).project(camera);
        const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (![left, top, right, bottom].every(Number.isFinite)) return;
      left = MathUtils.clamp(left, 0, size.width); right = MathUtils.clamp(right, 0, size.width);
      top = MathUtils.clamp(top, 0, size.height); bottom = MathUtils.clamp(bottom, 0, size.height);
      onBounds({ x: left, y: top, width: right - left, height: bottom - top });
    });
  }, [root, shape, accessory, get, onBounds]);
  return null;
}

function Creature({ config, presence, reacting, reaction, onTap, onBounds }: { config: PetConfig; presence: PetState; reacting: boolean; reaction?: PetReaction | null; onTap?: () => void; onBounds?: (bounds: PetScreenBounds) => void }) {
  const root = useRef<Group>(null);
  const reactionStart = useRef(0);
  const sleepAmount = useRef(0);
  const wasReacting = useRef(false);
  const previousReaction = useRef(reaction);
  const reducedMotion = useContext(ReducedMotion);
  const palette = OPTIONS.palettes.find(item => item.value === config.palette)!;

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    if (!root.current) return;
    if (reacting && (!wasReacting.current || previousReaction.current !== reaction)) reactionStart.current = time;
    wasReacting.current = reacting;
    previousReaction.current = reaction;
    sleepAmount.current = MathUtils.damp(sleepAmount.current, presence === 'sleep' ? 1 : 0, 4, delta);
    const sleep = sleepAmount.current;
    if (reducedMotion) {
      root.current.position.set(0, presence === 'sleep' ? -.08 : 0, 0);
      root.current.rotation.set(0, 0, 0);
      root.current.scale.set(1, 1, 1);
      return;
    }
    root.current.position.y = Math.sin(time * (presence === 'sleep' ? .85 : 1.35)) * (.035 - sleep * .025) - sleep * .08;
    // Every frame starts from rest, including when an interaction is interrupted.
    root.current.rotation.set(0, 0, Math.sin(time * .68) * .018 * (1 - sleep));
    const t = time - reactionStart.current;
    const breath = Math.sin(time * 1.35) * .007;
    let target: [number, number, number] = [1 - breath * .4 + sleep * .025, 1 + breath - sleep * .05, 1];
    let damping = 9;
    if (reacting) {
      if (config.material === 'jelly') {
        const wave = Math.exp(-2.2 * t) * Math.cos(18 * t);
        target = [1 + .085 * wave, 1 - .115 * wave, 1 - .045 * wave]; damping = 14;
      } else if (config.material === 'cream') {
        const wave = Math.exp(-4.8 * t) * Math.cos(9 * t);
        target = [1 + .045 * wave, 1 - .065 * wave, 1 + .025 * wave]; damping = 11;
      } else if (config.material === 'candy') {
        const wave = Math.exp(-7.5 * t) * Math.cos(17 * t);
        target = [1 + .018 * wave, 1 - .018 * wave, 1 + .012 * wave]; damping = 18;
      } else {
        const wave = Math.exp(-3.3 * t) * Math.cos(11 * t);
        target = [1 + .07 * wave, 1 - .105 * wave, 1 + .04 * wave]; damping = 11;
      }
      const pose = petMotionAt(reaction?.motion ?? '', t * 1000, reaction?.duration ?? 1800);
      root.current.position.y += pose.y;
      root.current.rotation.x = pose.rx;
      root.current.rotation.y = pose.ry;
      root.current.rotation.z += pose.rz;
    }
    root.current.scale.set(
      MathUtils.damp(root.current.scale.x, target[0], damping, delta),
      MathUtils.damp(root.current.scale.y, target[1], damping, delta),
      MathUtils.damp(root.current.scale.z, target[2], damping, delta),
    );
  });

  return <group ref={root} onClick={event => { event.stopPropagation(); if (event.delta < 4) onTap?.(); }}>
    <group scale={getBaseModel(config.shape).size ?? 1}>
    <BodyGeometry config={config} />
    <PetAccessory config={config} />
    <FaceModel.Provider value={getBaseModel(config.shape)}><FaceLayer mood={reaction?.mood ?? PET_STATE_MOODS[presence] ?? config.mood} blush={palette.blush} /></FaceModel.Provider>
    </group>
    {onBounds && <CharacterBounds root={root} shape={config.shape} accessory={config.accessory} onBounds={onBounds} />}
  </group>;
}

// Shrink, swap at the smallest point, then grow. One Canvas/WebGL context stays alive.
function ModelTransition({ config, ready, children }: { config: PetConfig; ready: { current: boolean }; children: (pet: PetConfig) => ReactNode }) {
  const [shown, setShown] = useState(config);
  const root = useRef<Group>(null);
  const progress = useRef(1);
  const reducedMotion = useContext(ReducedMotion);
  useFrame((_, delta) => {
    const changing = shown.shape !== config.shape;
    if (reducedMotion) {
      if (changing) setShown(config);
      progress.current = 1;
      ready.current = !changing;
      root.current?.scale.setScalar(1);
      return;
    }
    progress.current = MathUtils.clamp(progress.current + (changing ? -1 : 1) * delta / .18, 0, 1);
    if (changing && progress.current === 0) setShown(config);
    const t = progress.current;
    ready.current = !changing && t === 1;
    root.current?.scale.setScalar(.02 + .98 * t * t * (3 - 2 * t));
  });
  const visible = shown.shape === config.shape ? config : shown;
  return <group ref={root}>{children(visible)}</group>;
}

// Fit the viewer to its current container; camera framing is never pet data.
function ViewerControls({ interactive, compact }: { interactive: boolean; compact: boolean }) {
  const { camera, size } = useThree();
  const distance = compact ? 5.45 : Math.max(5.45, 1.75 / (Math.tan(Math.PI / 10) * size.width / Math.max(1, size.height)));
  useEffect(() => {
    if (!compact) { camera.position.set(0, .12, distance); camera.lookAt(0, 0, 0); }
  }, [camera, compact, distance, size.width, size.height]);
  return interactive ? <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={.07} minDistance={distance * .77} maxDistance={distance * 1.25} minPolarAngle={Math.PI * .32} maxPolarAngle={Math.PI * .68} /> : null;
}

export function Pet3D({ config = PET, presence = 'active', reaction, reacting = Boolean(reaction), interactive = true, compact = false, onTap, onCaptureReady, onBounds }: {
  config?: PetConfig; presence?: PetState; reacting?: boolean; reaction?: PetReaction | null; interactive?: boolean; compact?: boolean; onTap?: () => void; onCaptureReady?: (capture: () => string) => void; onBounds?: (bounds: PetScreenBounds) => void;
}) {
  const transitionReady = useRef(true);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const pet = normalizePetConfig(config) as PetConfig;
  const material = OPTIONS.materials.find(item => item.value === pet.material)?.label;
  const palette = OPTIONS.palettes.find(item => item.value === pet.palette)!;
  return <div className="pet-3d" role={interactive ? 'button' : 'img'} tabIndex={interactive ? 0 : undefined} aria-label={`${pet.name}，一只${material}3D${getBaseModel(pet.shape).label}桌角生物${interactive ? '，点击打招呼' : ''}`}
    onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTap?.(); } } : undefined}
    data-state={presence} data-face-mood={reaction?.mood ?? PET_STATE_MOODS[presence] ?? pet.mood} data-reaction={reaction?.id ?? ''}>
    {presence === 'sleep' && <span className="pet-zzz" aria-hidden="true">z Z z</span>}
    <Canvas fallback={<Pet config={pet} reacting={reacting} mood={reaction?.mood ?? PET_STATE_MOODS[presence]} />} dpr={compact ? [1, 1.25] : [1, 1.6]} camera={{ position: [0, .12, 5.45], fov: 36 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl, scene, camera }) => {
        gl.setClearColor(0x000000, 0);
        onCaptureReady?.(() => { if (!transitionReady.current) throw new Error('小生物还在变身，请稍等一下再试'); gl.render(scene, camera); return gl.domElement.toDataURL('image/png'); });
      }}>
      <ReducedMotion.Provider value={reducedMotion}>
      <ambientLight intensity={.92} />
      <directionalLight position={[3, 5, 4]} intensity={2.35} color="#FFF8EF" />
      <pointLight position={[-3, 1, 2]} intensity={6.5} distance={7} color={palette.light} />
      <ModelTransition config={pet} ready={transitionReady}>{visible => <Creature config={visible} presence={presence} reacting={reacting} reaction={reaction} onTap={onTap} onBounds={onBounds} />}</ModelTransition>
      {!compact && <ContactShadows key={pet.shape + pet.material} position={[0, -1.1, 0]} opacity={pet.material === 'candy' ? .13 : .24} scale={4.5} blur={3.1} far={3.2} resolution={256} frames={40} color="#70594F" />}
      <Environment key={pet.material === 'candy' ? 'glass' : 'soft'} resolution={pet.material === 'candy' ? 256 : 64}>
        {pet.material === 'candy' && <mesh><sphereGeometry args={[30, 24, 16]} /><meshBasicMaterial color="#A59E98" side={BackSide} toneMapped={false} /></mesh>}
        <Lightformer form="circle" intensity={3.8} color="#FFFFFF" position={[-1.8, 3.4, 4]} rotation={[0, .2, -.22]} scale={[.42, 1.2, 1]} />
        <Lightformer form="circle" intensity={2.4} color="#FFF7EE" position={[2.4, 2.8, 3]} scale={[.72, .44, 1]} />
        <Lightformer form={pet.material === 'candy' ? 'circle' : 'rect'} intensity={1.25} color={palette.light} position={[-4, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={pet.material === 'candy' ? [.7, 1.8, 1] : [3, 4, 1]} />
        <Lightformer form={pet.material === 'candy' ? 'circle' : 'rect'} intensity={1} color="#E5F1EC" position={[4, 0, -2]} rotation={[0, -Math.PI / 2, 0]} scale={pet.material === 'candy' ? [.9, 2, 1] : [3, 4, 1]} />
        {pet.material === 'candy' && <>
          <Lightformer form="circle" intensity={5} position={[-2, 2, 4]} scale={[.6, .9, 1]} />
          <Lightformer form="circle" intensity={4} position={[1, 3, 4]} scale={[.45, .6, 1]} />
        </>}
      </Environment>
      <ViewerControls interactive={interactive} compact={compact} />
      </ReducedMotion.Provider>
    </Canvas>
  </div>;
}
