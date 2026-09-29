import { useEffect, useId, useState } from 'react';

export type FaceAnchor = { x: number; y: number; rx: number; ry: number; patchX: number; patchY: number };
export type ImageFaceRig = { eyes: FaceAnchor[]; mouth: FaceAnchor };

/** A tiny face rig travels with the PNG; uncalibrated photos keep their original face. */
export function ImagePetFace({ asset, rig, mood }: { asset: string; rig: ImageFaceRig; mood?: string }) {
  const id = useId().replace(/:/g, '');
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setWidth(1000 * image.naturalWidth / image.naturalHeight);
    image.src = asset;
    return () => { image.onload = null; };
  }, [asset]);
  const anchors = [...rig.eyes, rig.mouth];
  const mouth = rig.mouth;
  function patch(anchor: FaceAnchor, index: number) {
    return <image href={asset} width={width} height="1000"
      x={(anchor.x - anchor.patchX) * width} y={(anchor.y - anchor.patchY) * 1000}
      mask={`url(#${id}-patch-${index})`} />;
  }
  function eye(anchor: FaceAnchor, index: number, expression: string) {
    const x = anchor.x * width + (expression === 'peek' ? -anchor.rx * width * .28 : 0), y = anchor.y * 1000;
    const rx = anchor.rx * width * .62, ry = anchor.ry * 1000 * .63;
    const shut = expression === 'sleepy' || expression === 'happy' || expression === 'blink' || expression === 'shy';
    return <g key={index}>
      {patch(anchor, index)}
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
    <defs>
      <filter id={`${id}-feather`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.3" /></filter>
      <mask id={`${id}-alpha`} style={{ maskType: 'alpha' }}><image href={asset} width={width} height="1000" /></mask>
      {anchors.map((anchor, index) => <mask key={index} id={`${id}-patch-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height="1000">
        <ellipse cx={anchor.x * width} cy={anchor.y * 1000} rx={anchor.rx * width} ry={anchor.ry * 1000}
          fill="white" filter={`url(#${id}-feather)`} />
      </mask>)}
    </defs>
    <image href={asset} width={width} height="1000" />
    <g mask={`url(#${id}-alpha)`}>
      {mood ? <g className="image-pet-expression">
        {rig.eyes.map((anchor, index) => eye(anchor, index, mood))}
        {mood === 'shy' && rig.eyes.map((anchor, index) => <ellipse key={index}
          cx={(anchor.x + (index ? 1 : -1) * anchor.rx * 1.4) * width} cy={(anchor.y + anchor.ry * 1.6) * 1000}
          rx={anchor.rx * width * .85} ry={anchor.ry * 1000 * .3} fill="#db7e86" opacity=".3" />)}
        {patch(mouth, 2)}
        {mood === 'spotted' ? <ellipse cx={mx} cy={my} rx={mrx * .55} ry={mry} fill="#875141" />
          : <path d={`M ${mx - mrx} ${my} Q ${mx} ${my + (mood === 'happy' ? mry * 1.8 : mood === 'blank' ? 0 : mry)} ${mx + mrx} ${my}`}
            fill="none" stroke="#875141" strokeWidth="5" strokeLinecap="round" />}
      </g> : <g className="image-pet-blink">{rig.eyes.map((anchor, index) => eye(anchor, index, 'blink'))}</g>}
    </g>
  </svg>;
}
