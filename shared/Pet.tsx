import { useId } from 'react';
import { OPTIONS, PET, normalizePetConfig } from './pet-config.mjs';
import './pet.css';

const shapes = {
  mochi: { d: 'M160 75C221 70 260 112 271 181C284 254 246 286 199 289C166 292 135 289 108 287C57 283 35 246 48 187C62 117 96 78 160 75Z', top: 73, face: 202 },
  cloud: { d: 'M85 277C49 276 31 249 44 220C24 197 36 165 65 158C57 123 85 97 119 103C137 67 190 65 210 101C247 91 274 121 266 157C295 173 296 216 268 232C272 267 241 286 207 277Z', top: 74, face: 205 },
  drop: { d: 'M160 51C160 51 246 145 249 205C253 260 216 289 160 289C104 289 67 260 71 205C74 145 160 51 160 51Z', top: 52, face: 210 },
  pudding: { d: 'M91 103C94 87 111 79 160 79C209 79 226 87 229 103L255 255C258 273 239 287 160 287C81 287 62 273 65 255Z', top: 78, face: 205 },
  toast: { d: 'M79 114C65 99 72 73 94 67C109 63 125 69 137 78C151 64 174 62 189 76C210 62 240 75 241 100C241 108 238 114 233 120L247 258C249 276 231 288 160 288C89 288 71 276 73 258Z', top: 66, face: 199 },
  bun: { d: 'M53 211C53 136 95 91 160 91C225 91 267 136 267 211C267 267 229 287 160 287C91 287 53 267 53 211Z', top: 91, face: 205 },
  strawberry: { d: 'M160 77C221 77 260 116 253 176C245 240 200 286 160 298C120 286 75 240 67 176C60 116 99 77 160 77Z', top: 65, face: 193 },
  peach: { d: 'M159 94C182 67 226 75 249 112C281 164 260 251 193 283C177 291 169 291 160 286C151 291 143 291 127 283C60 251 39 164 71 112C94 75 136 67 159 94Z', top: 76, face: 201 },
  mushroom: { d: 'M65 173C43 162 52 122 73 98C95 72 125 61 160 61C195 61 225 72 247 98C268 122 277 162 255 173C244 179 224 179 207 176L221 260C224 280 199 290 160 290C121 290 96 280 99 260L113 176C96 179 76 179 65 173Z', top: 60, face: 221 },
  star: { d: 'M160 48L193 119L270 128L213 181L228 260L160 221L92 260L107 181L50 128L127 119Z', top: 48, face: 174 },
};

type PetConfig = typeof PET;

function Shape({ shape, ...props }: { shape: string } & React.SVGProps<SVGPathElement>) {
  const data = shapes[shape as keyof typeof shapes] || shapes.mochi;
  return <path d={data.d} {...props} />;
}

function Face({ mood, y, ink, cheek }: { mood: string; y: number; ink: string; cheek: string }) {
  const eyes = mood === 'sleepy' || mood === 'still'
    ? <><path d={`M116 ${y}q7 5 14 0`} /><path d={`M190 ${y}q7 5 14 0`} /></>
    : mood === 'happy'
      ? <><path d={`M116 ${y + 3}q7-9 14 0`} /><path d={`M190 ${y + 3}q7-9 14 0`} /></>
      : mood === 'sad'
        ? <><path d={`M115 ${y - 4}q8-5 15 1`} /><path d={`M190 ${y - 3}q7-6 15-1`} /><circle cx="123" cy={y + 4} r="4" /><circle cx="198" cy={y + 4} r="4" /></>
        : <><ellipse cx="123" cy={y} rx="4.5" ry={mood === 'blank' ? 5 : 6} /><ellipse cx="198" cy={y} rx="4.5" ry={mood === 'blank' ? 5 : 6} /></>;
  const mouth = mood === 'sad'
    ? `M151 ${y + 22}Q160 ${y + 13} 169 ${y + 22}`
    : mood === 'still' ? `M153 ${y + 19}h14`
      : mood === 'sleepy' ? `M153 ${y + 18}q7 4 14 0`
        : mood === 'happy' ? `M151 ${y + 17}q9 12 18 0`
          : `M153 ${y + 17}q7 7 14 0`;
  return <g className="pet-face">
    <g className="pet-cheeks" fill={cheek}><ellipse cx="101" cy={y + 16} rx="21" ry="12" /><ellipse cx="220" cy={y + 16} rx="21" ry="12" /></g>
    <g className="pet-eyes" fill={ink} stroke={ink} strokeWidth="3" strokeLinecap="round">{eyes}</g>
    <path className="pet-smile" d={mouth} fill="none" stroke={ink} strokeWidth="2.7" strokeLinecap="round" />
  </g>;
}

function Accessory({ kind, top, face, accent, light, shade, ink }: { kind: string; top: number; face: number; accent: string; light: string; shade: string; ink: string }) {
  if (kind === 'bow') return <g className="pet-accessory" transform={`translate(160 ${top + 9})`} stroke={ink} strokeOpacity=".18">
    <path d="M-8 2C-37-20-55-9-43 18C-32 39-12 28-4 12Z" fill={accent} /><path d="M8 2C37-20 55-9 43 18C32 39 12 28 4 12Z" fill={accent} /><circle r="12" fill={light} />
  </g>;
  if (kind === 'beanie') return <g className="pet-accessory" transform={`translate(0 ${top - 2})`}>
    <path d="M103 53C111 14 137-3 160-3C183-3 209 14 217 53Z" fill={accent} stroke={ink} strokeOpacity=".16" /><path d="M96 51Q160 37 224 51L219 70Q160 57 101 70Z" fill={shade} /><circle cx="160" cy="-5" r="13" fill={light} />
  </g>;
  if (kind === 'scarf') return <g className="pet-accessory" transform={`translate(0 ${face + 39})`}>
    <path d="M91 0Q160 18 229 0L225 27Q160 43 95 27Z" fill={accent} stroke={ink} strokeOpacity=".14" /><path d="M194 23l26 8-5 54-27-10Z" fill={shade} /><path d="M217 72l-3 16m-8-19-3 16" stroke={ink} strokeOpacity=".25" strokeWidth="2" />
  </g>;
  if (kind === 'headphones') return <g className="pet-accessory" transform={`translate(0 ${face - 28})`} fill="none" stroke={accent} strokeWidth="11" strokeLinecap="round">
    <path d="M83 38C84-17 113-42 160-42C207-42 236-17 237 38" /><rect x="72" y="27" width="25" height="47" rx="12" fill={shade} stroke="none" /><rect x="223" y="27" width="25" height="47" rx="12" fill={shade} stroke="none" />
  </g>;
  if (kind === 'flower') return <g className="pet-accessory" transform={`translate(194 ${top + 8})`}>
    {[0, 72, 144, 216, 288].map(angle => <ellipse key={angle} rx="9" ry="18" fill={light} stroke={ink} strokeOpacity=".12" transform={`rotate(${angle}) translate(0 -13)`} />)}<circle r="10" fill={accent} />
  </g>;
  if (kind === 'starpin') return <path className="pet-accessory" d="M226 187l6 12 14 2-10 10 2 14-12-7-12 7 3-14-11-10 14-2Z" fill={accent} stroke={ink} strokeOpacity=".18" />;
  return null;
}

export function Pet({ reacting = false, config = PET, mood }: { reacting?: boolean; config?: PetConfig; mood?: string }) {
  const pet = normalizePetConfig(config) as PetConfig;
  const palette = OPTIONS.palettes.find(item => item.value === pet.palette)!;
  const shape = shapes[pet.shape as keyof typeof shapes] || shapes.mochi;
  const id = useId().replace(/:/g, '');
  const shapeLabel = OPTIONS.shapes.find(item => item.value === pet.shape)?.label;
  const materialLabel = OPTIONS.materials.find(item => item.value === pet.material)?.label;
  const bodyFilter = pet.material === 'fluffy' ? `url(#${id}-fluffy)` : undefined;
  return (
    <svg className={`pet-art material-${pet.material}${reacting ? ' is-happy' : ''}`} viewBox="0 0 320 340"
      role="img" aria-label={`${pet.name}，一只${materialLabel}${shapeLabel}桌角生物`}>
      <defs>
        <radialGradient id={`${id}-body`} cx="34%" cy="23%" r="82%"><stop stopColor={palette.light} /><stop offset=".62" stopColor={palette.body} /><stop offset="1" stopColor={palette.shade} /></radialGradient>
        <radialGradient id={`${id}-shadow`}><stop stopColor={palette.ink} stopOpacity=".16" /><stop offset="1" stopColor={palette.ink} stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".7" /><stop offset=".45" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor={palette.light} stopOpacity=".3" /></linearGradient>
        <pattern id={`${id}-yarn`} width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M0 3h13M0 9h13" stroke={palette.ink} strokeOpacity=".13" strokeWidth="1.4" /></pattern>
        <filter id={`${id}-fluffy`} x="-15%" y="-15%" width="130%" height="130%"><feTurbulence baseFrequency=".025" numOctaves="2" seed="4" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="4" /></filter>
      </defs>
      <ellipse className="pet-shadow" cx="160" cy="297" rx="105" ry="16" fill={`url(#${id}-shadow)`} />
      <g className="pet-breathe">
        <g className="pet-reaction">
          <Shape shape={pet.shape} fill={`url(#${id}-body)`} fillOpacity={pet.material === 'candy' ? .86 : 1} stroke={palette.ink} strokeOpacity=".18" strokeWidth="1.7" strokeLinejoin="round" filter={bodyFilter} />
          {pet.material === 'yarn' && <Shape shape={pet.shape} fill={`url(#${id}-yarn)`} stroke="none" />}
          {(pet.material === 'jelly' || pet.material === 'candy') && <Shape shape={pet.shape} fill={`url(#${id}-shine)`} opacity={pet.material === 'candy' ? .55 : .3} stroke="none" />}
          {pet.material === 'cream' && <path d={`M101 ${shape.top + 49}Q129 ${shape.top + 27} 157 ${shape.top + 47}Q184 ${shape.top + 65} 218 ${shape.top + 42}`} fill="none" stroke={palette.light} strokeWidth="13" strokeLinecap="round" opacity=".65" />}
          {pet.material === 'fluffy' && <Shape shape={pet.shape} fill="none" stroke={palette.light} strokeWidth="6" strokeDasharray="1 10" strokeLinecap="round" opacity=".75" />}
          <path d={`M104 ${shape.top + 55}Q119 ${shape.top + 35} 141 ${shape.top + 36}`} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity={pet.material === 'candy' ? .58 : .26} />
          {pet.shape === 'pudding' && <path d="M82 113Q160 139 238 113L233 86Q160 68 87 86Z" fill={palette.accent} opacity=".72" />}
          {pet.shape === 'toast' && <path d="M91 124Q160 91 229 124L238 257Q160 279 82 257Z" fill="none" stroke={palette.light} strokeWidth="9" opacity=".36" />}
          {pet.shape === 'bun' && <g fill="none" stroke={palette.shade} strokeWidth="3" strokeLinecap="round" opacity=".45"><path d="M119 113q-16 31-9 63" /><path d="M160 102v66" /><path d="M201 113q16 31 9 63" /></g>}
          {pet.shape === 'strawberry' && <g fill={palette.accent} stroke={palette.ink} strokeOpacity=".12"><path d="M160 88c-28 2-44-13-42-32 22 0 37 10 42 32Z" /><path d="M158 88c-6-24 8-39 27-40 1 21-8 34-27 40Z" /><path d="M161 89c13-17 33-17 45-4-11 16-29 19-45 4Z" /></g>}
          {pet.shape === 'peach' && <path d="M160 96q-13 49 0 91" fill="none" stroke={palette.shade} strokeWidth="3" strokeLinecap="round" opacity=".35" />}
          {pet.shape === 'mushroom' && <path d="M70 160Q160 122 250 160" fill="none" stroke={palette.light} strokeWidth="8" opacity=".5" />}
          <Face mood={mood ?? pet.mood} y={shape.face} ink={palette.ink} cheek={palette.shade} />
          <g className="pet-arms" fill="none" stroke={palette.ink} strokeOpacity=".34" strokeWidth="2.8" strokeLinecap="round"><path d={`M77 ${shape.face + 36}q2 17 15 20`} /><path d={`M243 ${shape.face + 34}q-2 17-15 20`} /></g>
          <Accessory kind={pet.accessory} top={shape.top} face={shape.face} accent={palette.accent} light={palette.light} shade={palette.shade} ink={palette.ink} />
        </g>
      </g>
    </svg>
  );
}
