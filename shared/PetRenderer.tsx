import { useEffect, useId, useRef } from 'react';
import { Pet3D, type PetScreenBounds } from './Pet3D';
import { PET, petDisplayMode } from './pet-config.mjs';
import type { PetReaction } from './usePetInteraction';
import { ImagePetFace } from './ImagePetFace';
import { DEMO_FACE_RIGS } from './image-face-rigs.mjs';
import { PET_STATE_MOODS, type PetState } from './pet-state.mjs';
import './image-pet.css';

type ImageSubject = { width: number; height: number; bounds: PetScreenBounds };
const imageSubjects = new Map<string, Promise<ImageSubject | null>>();

function imageSubject(asset: string) {
  const cached = imageSubjects.get(asset);
  if (cached) return cached;
  const image = new Image();
  image.src = asset;
  const result = image.decode().then(() => {
    const width = image.naturalWidth, height = image.naturalHeight;
    let bounds = { x: 0, y: 0, width: 1, height: 1 };
    try {
      const canvas = document.createElement('canvas');
      // ponytail: 256px alpha sampling; use native resolution if subpixel edges become necessary.
      const scale = Math.min(1, 256 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          // Match desktop subject bounds: ignore almost invisible fringes and shadows.
          if (pixels[(y * canvas.width + x) * 4 + 3] < 40) continue;
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        if (right >= left) bounds = { x: left / canvas.width, y: top / canvas.height, width: (right - left + 1) / canvas.width, height: (bottom - top + 1) / canvas.height };
      }
    } catch { /* A blocked canvas still has the image's natural bounds. */ }
    return { width, height, bounds };
  }).catch(() => null);
  if (imageSubjects.size >= 8) imageSubjects.delete(imageSubjects.keys().next().value!);
  imageSubjects.set(asset, result);
  return result;
}

function ImageBounds({ asset, onBounds }: { asset: string; onBounds: (bounds: PetScreenBounds) => void }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = marker.current;
    const motion = element?.parentElement;
    const renderer = element?.closest('.image-pet');
    if (!element || !motion || !renderer) return;
    let subject: ImageSubject | null = null, frame = 0, disposed = false;
    function resize() {
      if (!subject) return;
      const scale = Math.min(motion!.clientWidth / subject.width, motion!.clientHeight / subject.height);
      const width = subject.width * scale, height = subject.height * scale, bounds = subject.bounds;
      Object.assign(element!.style, {
        left: `${(motion!.clientWidth - width) / 2 + bounds.x * width}px`, top: `${(motion!.clientHeight - height) / 2 + bounds.y * height}px`,
        width: `${bounds.width * width}px`, height: `${bounds.height * height}px`,
      });
    }
    void imageSubject(asset).then(value => { if (!disposed) { subject = value; resize(); } });
    const observer = new ResizeObserver(resize);
    observer.observe(motion);
    function measure() {
      if (subject) {
        const box = element!.getBoundingClientRect(), origin = renderer!.getBoundingClientRect();
        onBounds({ x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height });
      }
      frame = requestAnimationFrame(measure);
    }
    frame = requestAnimationFrame(measure);
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [asset, onBounds]);
  return <span ref={marker} aria-hidden="true" data-pet-bounds style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

const expressionCells: Record<string, number> = { happy: 1, sleepy: 2, blank: 3, peek: 3, shy: 4, spotted: 5 };

function ImagePetExpressions({ atlas, mood }: { atlas: string; mood?: string }) {
  const cell = expressionCells[mood ?? ''] ?? 0;
  const clipId = useId();
  return <svg className="image-pet-art image-pet-atlas" viewBox="0 0 512 512" data-face-mood={mood ?? 'idle'} aria-hidden="true">
    <defs><clipPath id={clipId}><rect width="512" height="512" /></clipPath></defs>
    <image href={atlas} x={-(cell % 3) * 512} y={-Math.floor(cell / 3) * 512} width="1536" height="1024" clipPath={`url(#${clipId})`} />
  </svg>;
}

export function PetRenderer({ config = PET, presence = 'active', reaction, reacting = Boolean(reaction), interactive = true, compact = false, onTap, onCaptureReady, onBounds }: {
  config?: typeof PET; presence?: PetState; reacting?: boolean; reaction?: PetReaction | null; interactive?: boolean; compact?: boolean; onTap?: () => void; onCaptureReady?: (capture: () => string) => void; onBounds?: (bounds: PetScreenBounds) => void;
}) {
  const mood = reaction?.mood ?? PET_STATE_MOODS[presence];
  if (petDisplayMode(config) === '3d') return <Pet3D config={config} presence={presence} reaction={reaction} reacting={reacting} interactive={interactive} compact={compact} onTap={onTap} onCaptureReady={onCaptureReady} onBounds={onBounds} />;
  return <div className={`image-pet${reacting ? ' reacting' : ''}`} role={interactive ? 'button' : 'img'}
    data-state={presence} data-reaction={reaction?.id ?? ''} data-motion={reaction?.motion ?? ''}
    aria-label={`${config.name}，照片桌角生物${interactive ? '，点击打招呼' : ''}`} tabIndex={interactive ? 0 : undefined}
    onClick={interactive ? onTap : undefined}
    onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTap?.(); } } : undefined}>
    <div className="image-pet-size">
      <div className="image-pet-motion" key={reaction?.instanceId ?? 'idle'}>
        {config.expressionAtlas ? <ImagePetExpressions atlas={config.expressionAtlas} mood={mood} />
          : config.faceRig ? <ImagePetFace asset={config.image2D ?? ''} rig={config.generationProvider === 'demo' ? DEMO_FACE_RIGS[config.style as keyof typeof DEMO_FACE_RIGS] ?? config.faceRig : config.faceRig} mood={mood} />
          : <img className="image-pet-art" src={config.image2D ?? ''} alt="" draggable={false} />}
        {onBounds && <ImageBounds asset={config.image2D ?? ''} onBounds={onBounds} />}
      </div>
      {presence === 'sleep' && <span className="pet-zzz" aria-hidden="true">z Z z</span>}
      {reaction?.message && <div className="image-pet-sparks" key={`sparks-${reaction.instanceId}`} aria-hidden="true">
        <span>{reaction.mood === 'shy' ? '♡' : '✧'}</span><span>{reaction.mood === 'sleepy' ? 'z' : '·'}</span><span>{reaction.mood === 'happy' ? '♡' : '✧'}</span>
      </div>}
    </div>
  </div>;
}
