import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export function ManualEraser({ image, onApply, onCancel, busy = false }: { image: Blob; onApply: (image: Blob) => void; onCancel: () => void; busy?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<ImageBitmap | null>(null);
  const history = useRef<ImageData[]>([]);
  const [brush, setBrush] = useState(52);
  const [drawing, setDrawing] = useState(false);
  const [ready, setReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const active = useRef(true);
  const [encoding, setEncoding] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function cancel() { active.current = false; onCancel(); }

  function redraw() {
    const target = canvas.current, bitmap = original.current;
    if (!target || !bitmap) return;
    const context = target.getContext('2d')!;
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0);
    history.current = []; setCanUndo(false);
  }
  useEffect(() => {
    let disposed = false;
    createImageBitmap(image).then(bitmap => {
      if (disposed) return bitmap.close();
      original.current = bitmap;
      const target = canvas.current!;
      target.width = bitmap.width; target.height = bitmap.height;
      redraw(); setReady(true);
    });
    return () => { disposed = true; original.current?.close(); original.current = null; };
  }, [image]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onCancel]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const target = canvas.current!, rect = target.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * target.width / rect.width, y: (event.clientY - rect.top) * target.height / rect.height };
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!ready || busy || encoding) return;
    const target = canvas.current!, context = target.getContext('2d')!, at = point(event);
    history.current.push(context.getImageData(0, 0, target.width, target.height));
    if (history.current.length > 6) history.current.shift();
    setCanUndo(true);
    target.setPointerCapture(event.pointerId);
    context.globalCompositeOperation = 'destination-out';
    context.lineCap = context.lineJoin = 'round'; context.lineWidth = brush;
    context.beginPath(); context.moveTo(at.x, at.y); context.lineTo(at.x + .01, at.y + .01); context.stroke();
    setDrawing(true);
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = canvas.current!.getContext('2d')!, at = point(event);
    context.lineTo(at.x, at.y); context.stroke();
  }
  function undo() {
    const snapshot = history.current.pop(), target = canvas.current;
    if (snapshot && target) { const context = target.getContext('2d')!; context.globalCompositeOperation = 'source-over'; context.putImageData(snapshot, 0, 0); setCanUndo(history.current.length > 0); }
  }
  function apply() {
    if (busy || encoding) return;
    setEncoding(true);
    canvas.current?.toBlob(blob => { if (active.current) { setEncoding(false); if (blob) onApply(blob); } }, 'image/png');
  }

  return <div className="eraser-backdrop" role="dialog" aria-modal="true" aria-labelledby="eraser-title">
    <section className="eraser-dialog">
      <header><div><span>透明底修整</span><h2 id="eraser-title">擦掉多余的部分</h2><p>在画面上涂抹，只会擦除，不会改变留下来的它</p></div><button onClick={cancel} aria-label="关闭擦除工具">×</button></header>
      <div className="eraser-canvas"><canvas ref={canvas} onPointerDown={start} onPointerMove={move} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} /></div>
      <footer><label>橡皮大小 <input type="range" min="16" max="130" value={brush} onChange={event => setBrush(Number(event.target.value))} /><b>{brush}px</b></label><div><button onClick={undo} disabled={!canUndo || busy || encoding}>撤销一步</button><button onClick={redraw} disabled={!ready || busy || encoding}>重新来过</button><button className="eraser-apply" onClick={apply} disabled={!ready || busy || encoding}>修好了</button></div></footer>
    </section>
  </div>;
}
