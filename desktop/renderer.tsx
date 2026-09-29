import { useEffect, useRef, useState, type PointerEvent, type CSSProperties, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { PetRenderer } from '../shared/PetRenderer';
import { createPetStateMachine } from '../shared/pet-state.mjs';
import { DESKTOP_SCALE_LIMITS, PET } from '../shared/pet-config.mjs';
import { usePetInteraction } from '../shared/usePetInteraction';
import { DEFAULT_FOOTPRINT, DESKTOP_SIZE, bubblePlacement, imageFootprint, pinchDisplay, pinchStep, settleScale, validFootprint } from './layout.mjs';
import './style.css';
type Rect = { x: number; y: number; width: number; height: number };
type Limits = { min: number; max: number };
type View = { scale: number; offset: { x: number; y: number }; viewport: Rect };
type Anchor = { x: number; y: number; ax: number };
type Pinch = { raw: number; start: number; limits: Limits; begun: Promise<boolean>; anchor?: Anchor; body?: Rect; final?: number; settle?: ReturnType<typeof setTimeout> };
const viewTransform = (view: View) => `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.scale})`;
const RESIZE_HINT = '想换个大小？在我身上双指捏一捏，或者右键我～';

function resizeLabel(display: ReturnType<typeof pinchDisplay>) {
  if (display.edge === 'max') return '已经最大啦';
  if (display.edge === 'min') return '已经最小啦';
  return display.snapped ? '刚刚好' : `${Math.round(display.scale * 100)}%`;
}

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
  const [view, setView] = useState<View>({ scale: 1, offset: { x: 0, y: 0 }, viewport: { x: 0, y: 0, ...DESKTOP_SIZE } });
  const speech = useRef<HTMLDivElement>(null);
  const [speechHeight, setSpeechHeight] = useState(38);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (speech.current) setSpeechHeight(speech.current.offsetHeight); });
    if (speech.current) observer.observe(speech.current);
    return () => observer.disconnect();
  }, []);
  const pressed = useRef(false);
  const [resizeNote, setResizeNote] = useState('');
  const [hinting, setHinting] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const petLayer = useRef<HTMLElement>(null);
  const viewScale = useRef(1);
  const limits = useRef<Limits>({ min: DESKTOP_SCALE_LIMITS.min, max: DESKTOP_SCALE_LIMITS.max });
  const pinch = useRef<Pinch | null>(null);
  // A pinch being saved keeps the layout until the window has shrunk back around its fixed point.
  const settling = useRef<Pinch | null>(null);
  const heldView = useRef<View | null>(null);
  const commitPinch = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { viewScale.current = view.scale; }, [view.scale]);
  useEffect(() => window.cornerpet.onResizeHint(() => {
    clearTimeout(hintTimer.current);
    setHinting(true);
    // A quick flick is recognised only as the drag ends; the hint must still fade.
    if (!pressed.current) hintTimer.current = setTimeout(() => setHinting(false), 3000);
  }), []);
  useEffect(() => {
    window.cornerpet.getScaleOptions().then(options => { limits.current = { min: options.min, max: options.max }; }).catch(() => {});
    function show(text: string, linger = false) {
      clearTimeout(noteTimer.current);
      setResizeNote(text);
      if (linger) noteTimer.current = setTimeout(() => setResizeNote(''), 1200);
    }
    // Place the pet around the pinch's fixed point from this window's own position, so the first
    // frame after the window grows or shrinks is already right. No message to the main process.
    function layout() {
      const gesture = pinch.current ?? settling.current;
      if (!gesture?.anchor || !gesture.body || !petLayer.current) return;
      const { anchor, body } = gesture, scale = gesture.final ?? pinchDisplay(gesture.raw, gesture.limits).scale;
      const x = anchor.x - (body.x + anchor.ax * body.width) * scale - window.screenX;
      const y = anchor.y - (body.y + body.height) * scale - window.screenY;
      petLayer.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    // Hand the layout back to the main process's view once the window has settled.
    function release(gesture: Pinch) {
      if (settling.current !== gesture) return;
      settling.current = null;
      const apply = (value: View) => {
        heldView.current = null;
        if (petLayer.current) petLayer.current.style.transform = viewTransform(value);
        setView(value);
      };
      if (heldView.current) apply(heldView.current);
      else window.cornerpet.getView().then(apply).catch(() => {});
    }
    const settled = (gesture: Pinch) => gesture.final !== undefined && Math.abs(innerWidth - DESKTOP_SIZE.width * gesture.final) <= 1;
    function onResize() {
      layout();
      if (settling.current && settled(settling.current)) release(settling.current);
    }
    async function commit(gesture: Pinch) {
      if (pinch.current !== gesture) return;
      pinch.current = null;
      clearTimeout(gesture.settle);
      settling.current = gesture;
      if (!(await gesture.begun)) {
        // A drag owned the window, so nothing grew and nothing is saved.
        show('');
        release(gesture);
        return;
      }
      try {
        gesture.final = await window.cornerpet.resizeCommit(settleScale(gesture.raw, gesture.limits));
        show(resizeLabel(pinchDisplay(gesture.final, gesture.limits)), true);
      } catch {
        gesture.final = gesture.start;
        await window.cornerpet.resizeCancel().catch(() => {});
        show('大小暂时没能记住，再捏一下试试', true);
      }
      layout();
      if (settled(gesture)) release(gesture);
      else setTimeout(() => release(gesture), 600);
    }
    commitPinch.current = async () => { if (pinch.current) await commit(pinch.current); };
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (pressed.current || settling.current) return;
      if (!document.hasFocus()) window.cornerpet.focusPet();
      let gesture = pinch.current;
      if (!gesture) {
        const started: Pinch = { raw: viewScale.current, start: viewScale.current, limits: limits.current, begun: Promise.resolve(false) };
        started.begun = window.cornerpet.resizeBegin().then(reply => {
          if (!reply) return false;
          started.anchor = reply.anchor;
          started.body = reply.footprint;
          started.limits = reply.limits;
          started.raw = Math.min(reply.limits.max, Math.max(reply.limits.min, started.raw));
          layout();
          return true;
        }).catch(() => false);
        gesture = pinch.current = started;
        setHinting(false);
      }
      const current = gesture;
      current.raw = pinchStep(current.raw, event.deltaY, current.limits);
      show(resizeLabel(pinchDisplay(current.raw, current.limits)));
      layout();
      clearTimeout(current.settle);
      current.settle = setTimeout(() => void commit(current), 400);
    }
    addEventListener('wheel', onWheel, { passive: false });
    addEventListener('resize', onResize);
    return () => { removeEventListener('wheel', onWheel); removeEventListener('resize', onResize); clearTimeout(noteTimer.current); clearTimeout(hintTimer.current); };
  }, []);
  useEffect(() => {
    // While a pinch owns the layout, the main process's view waits until the window has settled.
    const receive = (value: View) => { if (pinch.current || settling.current) heldView.current = value; else setView(value); };
    const unsubscribe = window.cornerpet.onView(receive);
    window.cornerpet.getView().then(receive).catch(() => setError('位置暂时没能准备好'));
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
    try {
      // Saving a size ends any drag, so a pinch still settling is saved before this one begins.
      await commitPinch.current();
      // A quick tap can end while that save is still running; then there is no drag to start.
      if (!pressed.current) return;
      await window.cornerpet.startDrag();
    }
    catch { pressed.current = false; setError('拖动暂时不可用'); }
  }
  async function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (!pressed.current) return;
    pressed.current = false;
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHinting(false), 3000);
    try {
      const moved = await window.cornerpet.endDrag();
      if (!moved && !cancelled) greet();
    } catch { setError('请重新打开桌角生物'); }
    if (event.currentTarget?.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const speechText = error || resizeNote || (hinting ? RESIZE_HINT : '') || message;
  const bubble = bubblePlacement(footprint, view.viewport, speechHeight);
  return <main ref={petLayer} className="desktop-pet" data-state={behavior.state} style={{ transform: viewTransform(view) }}>
    <div ref={speech} className={`pet-bubble${speechText ? ' visible' : ''}${bubble.below ? ' below' : ''}`} style={{ left: bubble.x, top: bubble.y, width: bubble.width, '--tail-x': `${bubble.tail}px` } as CSSProperties} role="status">{speechText}</div>
    {config && <div className="pet-grab" role="button" tabIndex={0} aria-label={`${config.name}：拖动移动，点击打招呼，双指捏合或右键调整大小`}
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
