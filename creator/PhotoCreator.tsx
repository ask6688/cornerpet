import { useEffect, useRef, useState } from 'react';
import { PetPreview } from './PetPreview';
import { usePetInteraction } from '../shared/usePetInteraction';
import { PetReactionControls } from '../shared/PetReactionControls';
import { createPetModel, normalizePetConfig, PET } from '../shared/pet-config.mjs';
import { preparePhoto, removePhotoBackground } from './photo-processing';
import { GENERATION_STYLES, demoImageGenerator, imageGenerator, type GeneratedAsset, type GenerationProvider, type GenerationStyle } from './image-generator';
import { ManualEraser } from './ManualEraser';
import { petImageAssets } from './pet-assets';
import './photo-creator.css';

const progressNotes: Record<string, string> = {
  '正在轻轻接住这张照片…': '先让它在这里歇一小会',
  '正在认出照片里的它…': '第一次见面，会多等一小会',
  '正在轻轻分开它和周围…': '照片只留在这台设备里',
  '正在为透明背景准备轮廓…': '先在本机抠图，再将主体交给豆包生成',
  '正在把它的轮廓仔细收好…': '马上就能看见完整的它',
  '正在让它慢慢长成桌角生物…': '再给它一点点时间',
  '正在为它准备不同的小表情…': '这一张会有开心、困困、发呆、害羞和惊讶',
  '正在收好它的新模样…': '马上就能预览和互动',
  '连接暂时中断，正在继续等待结果…': '不会重新提交照片或重复生成',
  '正在请小伙伴慢慢走过来…': '很快就能见面',
  '正在铺开一张小画纸…': '不喜欢的地方，可以轻轻擦掉',
  '正在收好刚刚的小修改…': '它的模样不会弄丢',
};

export function PhotoCreator({ onBusyChange, onReady }: { onBusyChange: (busy: boolean) => void; onReady: (pet: typeof PET) => void }) {
  const { reaction, message, greet, play } = usePetInteraction();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<'original' | 'generated'>('generated');
  const [style, setStyle] = useState<GenerationStyle>('mochi');
  const [provider, setProvider] = useState<GenerationProvider>('demo');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [apiChecked, setApiChecked] = useState(false);
  const [subject, setSubject] = useState<'portrait' | 'object'>('portrait');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<typeof PET | null>(null);
  const [cutout, setCutout] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const providerChosen = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => { onBusyChange(busy || !!cutout); }, [busy, cutout, onBusyChange]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/generation-capability', { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(status => {
        if (controller.signal.aborted) return;
        const configured = status?.configured === true;
        setApiConfigured(configured);
        if (configured && !providerChosen.current) setProvider('doubao');
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setApiChecked(true); });
    return () => controller.abort();
  }, []);
  function reset() { setResult(null); setError(''); }
  function begin() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError('');
    return controller.signal;
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    const signal = begin(); setProgress('正在轻轻接住这张照片…');
    try {
      const prepared = await preparePhoto(file);
      signal.throwIfAborted();
      setPhoto(prepared); setSource(URL.createObjectURL(prepared)); reset();
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : '照片读取失败'); }
    finally { if (!signal.aborted) { setBusy(false); if (input.current) input.current.value = ''; } }
  }
  async function finish(blob: Blob, signal: AbortSignal, generated?: GeneratedAsset) {
    const assets = await petImageAssets(blob);
    signal.throwIfAborted();
    setResult(result && !generated ? normalizePetConfig({ ...result, ...assets, expressionAtlas: null }) : createPetModel({
      ...assets, model3D: null, source: 'upload', name: '小在',
      type: generated ? 'generated-pet' : 'image-pet', style: generated ? style : 'original',
      generationProvider: generated?.provider ?? null, faceRig: generated?.faceRig ?? null, expressionAtlas: generated?.expressions ?? null,
    }));
    if (!result || generated) play('showcase');
  }
  async function create(selectedProvider = provider) {
    if (!photo || busy) return;
    const signal = begin();
    try {
      setProgress(mode === 'original' ? '正在认出照片里的它…' : selectedProvider !== 'doubao' ? '正在请小伙伴慢慢走过来…' : '正在让它慢慢长成桌角生物…');
      if (mode === 'original') {
        const removed = await removePhotoBackground(photo, message => { if (!signal.aborted) setProgress(message); }, subject);
        signal.throwIfAborted(); setCutout(removed);
      } else {
        const generated = await (selectedProvider === 'demo' ? demoImageGenerator : imageGenerator).generate({ image: photo, style, subject, signal, onProgress: message => { if (!signal.aborted) setProgress(message); } });
        await finish(generated.image, signal, generated);
      }
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : '这次没能完成，可以再试一次'); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  async function applyErase(blob: Blob) {
    if (busy) return;
    const signal = begin(); setProgress('正在收好刚刚的小修改…');
    try { await finish(blob, signal); setCutout(null); }
    catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : '保存失败，请重试'); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  async function edit() {
    if (!result?.image2D || busy) return;
    const signal = begin(); setProgress('正在铺开一张小画纸…');
    try { const blob = await fetch(result.image2D, { signal }).then(response => response.blob()); signal.throwIfAborted(); setCutout(blob); }
    catch { if (!signal.aborted) setError('图片无法读取，请重新生成'); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  return <>
    <section className="workbench photo-workbench">
      <section className={`preview photo-preview${result ? ' checker-preview' : ''}`} aria-label="照片桌宠实时预览">
        <div className="preview-note"><i /> {result ? result.generationProvider?.startsWith('demo') ? '示例小伙伴，先来陪你体验' : '熟悉的它，已经在这里了' : '给喜欢的它，留一个小角落'}</div>
        <div className="photo-stage">
          {result ? <PetPreview config={result} reaction={reaction} message={message} onTap={greet} /> : source
            ? <div className="source-frame"><img src={source} alt="你上传的原始照片" /><span>这就是，原来的它</span></div>
            : <div className="empty-photo"><div className="paper-photo"><span>◡</span><i>a little piece of your world</i></div><p>把想念，放在身边</p><small>人、宠物，或舍不得的小物件</small></div>}
          {busy && <div className="processing-note" role="status">{progress}<small>{progressNotes[progress] ?? '这一步会把照片交给图片生成服务'}</small></div>}
        </div>
        <div className="pet-caption"><span>{result?.generationProvider?.startsWith('demo') ? '预置小伙伴 · 非照片生成' : '照片里的小世界'}</span><strong>{result ? '准备见面' : '留个位置给它'}</strong></div>
        {result && <PetReactionControls play={play} disabled={busy} />}
      </section>
      <section className="editor photo-editor" aria-labelledby="photo-title">
        <div className="photo-eyebrow">一张照片 · 一点陪伴</div>
        <div className="editor-heading"><div><h1 id="photo-title">带一个喜欢的它来</h1><p>让照片里的小世界，住进你的桌角</p></div></div>
        <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传照片" disabled={busy} onChange={event => void upload(event.target.files?.[0])} />
        <button className="upload-card" disabled={busy} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}>
          {source ? <img src={source} alt="已选择的照片" /> : <span className="upload-mark">＋</span>}
          <span><b>{source ? '照片已经在这里了' : '放一张喜欢的照片'}</b><small>{source ? '点击换一张' : '轻轻拖进来，或点这里挑一张'}</small><em>JPG / PNG / WebP · 最大 12 MB</em></span>
        </button>
        <div className="control-title photo-mode-title"><h2>想让它怎样陪着你？</h2></div>
        <div className="photo-mode-options" role="group" aria-label="照片处理方式">
          <button disabled={busy} className={mode === 'original' ? 'selected' : ''} aria-pressed={mode === 'original'} onClick={() => { setMode('original'); reset(); }}><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="5" width="26" height="31" rx="3" fill="#F5E7D6" /><path d="M12 27c3-7 5-9 8-9s5 2 8 9" fill="#D6DDD0" /><circle cx="16" cy="14" r="3" fill="#DBB5A2" /></svg><b>保留它</b><small>还是熟悉的模样，<br />只是离你近一点</small></button>
          <button disabled={busy} className={mode === 'generated' ? 'selected' : ''} aria-pressed={mode === 'generated'} onClick={() => { setMode('generated'); reset(); }}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 25C5 14 11 7 20 7s15 7 14 18c0 7-6 9-14 9S6 32 6 25Z" fill="#E7C6BA" /><path d="M14 21v1m12-1v1m-8 4q2 2 4 0" fill="none" stroke="#806558" strokeWidth="1.8" strokeLinecap="round" /></svg><b>捏成桌角生物</b><small>带着它的小特点，<br />变成软软的新朋友</small></button>
        </div>
        {mode === 'original' ? <div className="subject-picker"><span>照片里是</span><button disabled={busy} aria-pressed={subject === 'portrait'} onClick={() => { setSubject('portrait'); reset(); }}>人物</button><button disabled={busy} aria-pressed={subject === 'object'} onClick={() => { setSubject('object'); reset(); }}>宠物 · 小物</button></div>
          : <div className="generation-options">
            <div className="style-picker" role="group" aria-label="生成风格">{GENERATION_STYLES.map(item => <button disabled={busy} key={item.value} className={style === item.value ? 'selected' : ''} aria-pressed={style === item.value} onClick={() => { setStyle(item.value); reset(); }}><img src={item.preview} alt={`${item.label}预置示例`} /><span><b>{item.label}</b><small>{item.note}</small></span></button>)}</div>
            <div className="generation-provider" role="group" aria-label="生成方式"><button disabled={busy} aria-pressed={provider === 'demo'} onClick={() => { providerChosen.current = true; setProvider('demo'); reset(); }}>先体验 Demo</button><button disabled={busy || !apiConfigured} aria-pressed={provider === 'doubao'} onClick={() => { providerChosen.current = true; setProvider('doubao'); reset(); }}>用照片真实生成</button></div>
            {provider === 'doubao' && <div className="subject-picker"><span>照片里是</span><button disabled={busy} aria-pressed={subject === 'portrait'} onClick={() => { setSubject('portrait'); reset(); }}>人物</button><button disabled={busy} aria-pressed={subject === 'object'} onClick={() => { setSubject('object'); reset(); }}>宠物 · 小物</button></div>}
            <p className="generation-note">{!apiChecked ? '正在检查图片生成服务；预置 Demo 仍可体验' : provider === 'demo' ? apiConfigured ? '当前选择预置 Demo，不会读取照片特征；你也可以切换到照片真实生成' : '未配置图片生成 API，当前使用预置 Demo；结果不会根据照片生成，照片也不会上传' : '已检测到服务端配置；点击后先在浏览器抠出主体，再发送到豆包图片服务。真实效果仍待验证，失败时可改用 Demo'}</p>
          </div>}
        {error && <div className="photo-error" role="alert">{error}{mode === 'generated' && provider === 'doubao' && !busy && <button onClick={() => { setProvider('demo'); void create('demo'); }}>先用 Demo 小伙伴继续 →</button>}</div>}
        {result && <p className="generation-result-note" role="status">{result.generationProvider === 'demo' ? 'Demo 结果 · 这是预置小伙伴，并非根据你的照片生成，可以修整、命名，再带到桌面' : ['doubao', 'openai'].includes(result.generationProvider ?? '') ? '已根据照片生成，可以擦掉多余的部分，再给它起个名字' : '透明底已经准备好了，可以继续修整，再给它起个名字'}</p>}
        {result ? <><button className="bring-button" disabled={busy} onClick={() => onReady(result)}>给它起个名字 <span>→</span></button><div className="photo-secondary"><button disabled={busy} onClick={() => void edit()}>擦掉多余的部分</button><button disabled={busy} onClick={reset}>重新制作</button></div></>
          : <button className="bring-button" disabled={!photo || busy} onClick={() => void create()}>{busy ? '再等它一小会…' : mode === 'original' ? '把它留下来' : '创建我的桌角生物'} <span>→</span></button>}
      </section>
    </section>
    {cutout && <ManualEraser image={cutout} busy={busy} onCancel={() => { request.current?.abort(); setBusy(false); setCutout(null); }} onApply={blob => void applyErase(blob)} />}
  </>;
}
