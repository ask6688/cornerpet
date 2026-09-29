import { useEffect, useRef, useState, type PointerEvent, type CSSProperties, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { PetRenderer } from '../shared/PetRenderer';
import { createPetStateMachine } from '../shared/pet-state.mjs';
import { PET } from '../shared/pet-config.mjs';
import { usePetInteraction } from '../shared/usePetInteraction';
import { DEFAULT_FOOTPRINT, DESKTOP_SIZE, bubblePlacement, imageFootprint, validFootprint } from './layout.mjs';
import './style.css';
type Rect = { x: number; y: number; width: number; height: number };

function DesktopPet() {
  const [config, setConfig] = useState<typeof PET | null>(null);
  const { reaction: clickReaction, greet: reactToClick } = usePetInteraction();
  const [behavior, setBehavior] = useState(() => createPetStateMachine().getSnapshot());
  const reaction = behavior.state === 'sleep' ? null : behavior.state === 'welcome-back' ? behavior.cue : clickReaction ?? behavior.cue;
  const message = reaction?.message ?? '';
  useEffect(() => {
    const unsubscribe = window.cornerpet.onState(setBehavior);
    window.cornerpet.getState().then(setBehavior).catch(() => {});
    return unsubscribe;
  }, []);
  async function greet() {
    try {
      const next = await window.cornerpet.interact();
      setBehavior(next);
      if (next.state !== 'welcome-back') reactToClick();
    } catch { reactToClick(); }
  }
  const [error, setError] = useState('');
  const [footprint, setFootprint] = useState<Rect>(DEFAULT_FOOTPRINT);
  const [view, setView] = useState<{ scale: number; offset: { x: number; y: number }; viewport: Rect }>({ scale: 1, offset: { x: 0, y: 0 }, viewport: { x: 0, y: 0, ...DESKTOP_SIZE } });
  const speech = useRef<HTMLDivElement>(null);
  const [speechHeight, setSpeechHeight] = useState(38);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (speech.current) setSpeechHeight(speech.current.offsetHeight); });
    if (speech.current) observer.observe(speech.current);
    return () => observer.disconnect();
  }, []);
  const pressed = useRef(false);
  useEffect(() => {
    const unsubscribe = window.cornerpet.onView(setView);
    window.cornerpet.getView().then(setView).catch(() => setError('位置暂时没能准备好'));
    window.cornerpet.getConfig().then(value => {
      setConfig(value);
      document.title = `${value.name} · 桌角生物`;
    }).catch(() => setError('角色加载失败，请重新打开桌角生物'));
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!config) return;
    let active = true;
    const apply = (rect: Rect) => {
      if (!active) return;
      const next = validFootprint(rect) ? rect : DEFAULT_FOOTPRINT;
      setFootprint(next);
      void window.cornerpet.setFootprint(next).catch(() => setError('位置暂时没能准备好'));
    };
    if (config.model3D || !config.image2D) apply(DEFAULT_FOOTPRINT);
    else {
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        const canvas = document.createElement('canvas');
        const ratio = 192 / Math.max(image.naturalWidth, image.naturalHeight);
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] < 40) continue;
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        apply(right < left ? DEFAULT_FOOTPRINT : imageFootprint(canvas.width, canvas.height, { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }));
      };
      image.onerror = () => apply(DEFAULT_FOOTPRINT);
      image.src = config.image2D;
    }
    return () => { active = false; };
  }, [config]);
  async function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = true;
    try { await window.cornerpet.startDrag(); }
    catch { pressed.current = false; setError('拖动暂时不可用'); }
  }
  async function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (!pressed.current) return;
    pressed.current = false;
    try {
      const moved = await window.cornerpet.endDrag();
      if (!moved && !cancelled) greet();
    } catch { setError('请重新打开桌角生物'); }
    if (event.currentTarget?.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const bubble = bubblePlacement(footprint, view.viewport, speechHeight);
  return <main className="desktop-pet" data-state={behavior.state} style={{ transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.scale})` }}>
    <div ref={speech} className={`pet-bubble${message || error ? ' visible' : ''}${bubble.below ? ' below' : ''}`} style={{ left: bubble.x, top: bubble.y, width: bubble.width, '--tail-x': `${bubble.tail}px` } as CSSProperties} role="status">{error || message}</div>
    {config && <div className="pet-grab" role="button" tabIndex={0} aria-label={`${config.name}：拖动移动，点击打招呼，右键调整大小或隐藏`}
      onPointerDown={start} onPointerUp={end} onPointerCancel={e => end(e, true)}
      onLostPointerCapture={e => end(e, true)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); greet(); } }}
      onContextMenu={e => { e.preventDefault(); window.cornerpet.menu(); }}>
      <PetRenderer config={{ ...config, scale: 1 }} reaction={reaction} presence={behavior.state} interactive={false} compact />
    </div>}
  </main>;
}

function SizePanel() {
  const [options, setOptions] = useState<{ scale: number; min: number; max: number } | null>(null);
  const [percent, setPercent] = useState('100');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    window.cornerpet.getScaleOptions().then(value => {
      setOptions(value);
      setPercent(String(Math.round(value.scale * 100)));
    }).catch(() => setError('大小暂时没能准备好，请关闭后再试一次'));
  }, []);
  const min = Math.round((options?.min ?? .5) * 100), max = Math.round((options?.max ?? 2.5) * 100);
  const value = Number(percent);
  const valid = percent.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
  function preview(next: string) {
    setPercent(next);
    setError('');
    const value = Number(next);
    if (next.trim() && Number.isInteger(value) && value >= min && value <= max) {
      void window.cornerpet.previewScale(value / 100).catch(() => setError('暂时没能预览这个大小，请再试一下'));
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!options || !valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await window.cornerpet.setScale(value / 100);
      window.cornerpet.closeScale();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.replace(/^.*Error invoking remote method '[^']+': (?:Error: )?/, '') : '大小暂时没能保存，请再试一次';
      setError(message);
      void window.cornerpet.getScaleOptions().then(setOptions).catch(() => {});
      setSaving(false);
    }
  }
  return <main className="size-panel" onKeyDown={event => { if (event.key === 'Escape' && !saving) window.cornerpet.closeScale(); }}>
    <form onSubmit={save}>
      <h1>让它刚好陪在身边</h1>
      <label className="size-number">小伙伴的大小
        <span><input aria-label="自定义大小百分比" type="number" min={min} max={max} step="1" value={percent} disabled={!options || saving} autoFocus onChange={event => preview(event.target.value)} />%</span>
      </label>
      <input aria-label="拖动调整大小" type="range" min={min} max={max} step="1" value={Math.min(max, Math.max(min, value || min))} disabled={!options || saving} onChange={event => preview(event.target.value)} />
      <div className="size-error" role="status">{error || (options && !valid ? `填一个 ${min} 到 ${max} 的整数就好` : '')}</div>
      <footer><button type="button" disabled={saving} onClick={() => window.cornerpet.closeScale()}>先这样</button><button type="submit" disabled={!options || !valid || saving}>{saving ? '记住这个大小…' : '就这么大'}</button></footer>
    </form>
  </main>;
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('panel') === 'size' ? <SizePanel /> : <DesktopPet />);
