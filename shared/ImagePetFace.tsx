import { useEffect, useState } from 'react';

export type FaceAnchor = { x: number; y: number; rx: number; ry: number; patchX: number; patchY: number };
export type ImageFaceRig = { eyes: FaceAnchor[]; mouth: FaceAnchor };

const preparedFaces = new Map<string, Promise<{ width: number; clean: string }>>();

function prepareFace(asset: string, rig: ImageFaceRig) {
  const key = asset + JSON.stringify(rig);
  const cached = preparedFaces.get(key);
  if (cached) return cached;
  const prepared = (async () => {
    const image = new Image();
    image.src = asset;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法准备图片表情');
    context.drawImage(image, 0, 0);
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const clean = new ImageData(new Uint8ClampedArray(original.data), canvas.width, canvas.height);
    const { width, height } = canvas;
    const pixel = (data: Uint8ClampedArray, x: number, y: number, channel: number) => data[(Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)))) * 4 + channel];
    for (const anchor of [...rig.eyes, rig.mouth]) {
      const cx = anchor.x * width, cy = anchor.y * height, rx = anchor.rx * width, ry = anchor.ry * height;
      const px = anchor.patchX * width, py = anchor.patchY * height;
      const correction = [0, 1, 2].map(channel => {
        let base = 0, horizontal = 0, vertical = 0;
        for (let i = 0; i < 32; i++) {
          const angle = i * Math.PI / 16, x = Math.cos(angle), y = Math.sin(angle);
          const difference = pixel(original.data, cx + x * rx, cy + y * ry, channel) - pixel(original.data, px + x * rx, py + y * ry, channel);
          base += difference; horizontal += difference * x; vertical += difference * y;
        }
        return [base / 32, horizontal / 16, vertical / 16];
      });
      for (let y = Math.max(0, Math.floor(cy - ry * 1.12)); y < Math.min(height, Math.ceil(cy + ry * 1.12)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx * 1.12)); x < Math.min(width, Math.ceil(cx + rx * 1.12)); x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, distance = Math.hypot(dx, dy);
          if (distance >= 1.12) continue;
          const edge = Math.min(1, (1.12 - distance) / .22);
          const blend = edge * edge * (3 - 2 * edge), index = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            const [base, horizontal, vertical] = correction[channel];
            const color = pixel(original.data, px + x - cx, py + y - cy, channel) + base + horizontal * dx + vertical * dy;
            clean.data[index + channel] = original.data[index + channel] * (1 - blend) + color * blend;
          }
        }
      }
    }
    context.putImageData(clean, 0, 0);
    return { width: 1000 * width / height, clean: canvas.toDataURL('image/png') };
  })();
  if (preparedFaces.size >= 4) preparedFaces.delete(preparedFaces.keys().next().value!);
  preparedFaces.set(key, prepared);
  return prepared;
}

/** A tiny face rig travels with the PNG; uncalibrated photos keep their original face. */
export function ImagePetFace({ asset, rig, mood }: { asset: string; rig: ImageFaceRig; mood?: string }) {
  const [prepared, setPrepared] = useState<{ width: number; clean: string } | null>(null);
  useEffect(() => {
    let active = true;
    void prepareFace(asset, rig).then(value => { if (active) setPrepared(value); }).catch(() => {});
    return () => { active = false; };
  }, [asset, rig]);
  const width = prepared?.width ?? 1000;
  const mouth = rig.mouth;
  function eye(anchor: FaceAnchor, index: number, expression: string) {
    const x = anchor.x * width + (expression === 'peek' ? -anchor.rx * width * .28 : 0), y = anchor.y * 1000;
    const rx = anchor.rx * width * .62, ry = anchor.ry * 1000 * .63;
    const shut = expression === 'sleepy' || expression === 'happy' || expression === 'blink' || expression === 'shy';
    return <g key={index}>
      {shut ? <path d={`M ${x - rx} ${y} Q ${x} ${y + (expression === 'happy' ? -ry : expression === 'sleepy' ? ry * .08 : ry * .55)} ${x + rx} ${y}`}
        fill="none" stroke="#69432f" strokeWidth="6" strokeLinecap="round" /> : <>
        <ellipse cx={x} cy={y} rx={rx * (expression === 'spotted' ? .78 : .6)} ry={ry * (expression === 'blank' ? .55 : 1)} fill="#69432f" />
        {expression === 'spotted' && <ellipse cx={x + rx * .2} cy={y - ry * .35} rx={rx * .22} ry={ry * .23} fill="#fff8ee" />}
      </>}
    </g>;
  }
  const mx = mouth.x * width, my = mouth.y * 1000;
  const mrx = mouth.rx * width * .58, mry = mouth.ry * 1000 * .42;
  return <svg className="image-pet-art image-pet-face" viewBox={`0 0 ${width} 1000`} aria-hidden="true" data-face-mood={mood ?? 'idle'}>
    <image href={asset} width={width} height="1000" />
    {prepared && (mood ? <g className="image-pet-expression">
        <image href={prepared.clean} width={width} height="1000" />
        {rig.eyes.map((anchor, index) => eye(anchor, index, mood))}
        {mood === 'shy' && rig.eyes.map((anchor, index) => <ellipse key={index}
          cx={(anchor.x + (index ? 1 : -1) * anchor.rx * 1.4) * width} cy={(anchor.y + anchor.ry * 1.6) * 1000}
          rx={anchor.rx * width * .85} ry={anchor.ry * 1000 * .3} fill="#db7e86" opacity=".3" />)}
        {mood === 'spotted' ? <ellipse cx={mx} cy={my} rx={mrx * .55} ry={mry} fill="#875141" />
          : <path d={`M ${mx - mrx} ${my} Q ${mx} ${my + (mood === 'happy' ? mry * 1.8 : mood === 'blank' ? 0 : mry)} ${mx + mrx} ${my}`}
            fill="none" stroke="#875141" strokeWidth="5" strokeLinecap="round" />}
      </g> : <g className="image-pet-blink"><image href={prepared.clean} width={width} height="1000" />{rig.eyes.map((anchor, index) => eye(anchor, index, 'blink'))}<path d={`M ${mx - mrx} ${my} Q ${mx} ${my + mry} ${mx + mrx} ${my}`} fill="none" stroke="#875141" strokeWidth="5" strokeLinecap="round" /></g>)}
  </svg>;
}
