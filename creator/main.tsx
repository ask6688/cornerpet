import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BASE_MODELS, getBaseModel } from '../shared/pet-models.mjs';
import { Pet } from '../shared/Pet';
import { OPTIONS, PET, createPetModel, normalizePetConfig } from '../shared/pet-config.mjs';
import './style.css';
import { PhotoCreator } from './PhotoCreator';
import { PetFinish } from './PetFinish';
import { petImageAssets } from './pet-assets';
import { restoreLocalPet, savePetLocally } from './pet-storage';
import { usePetInteraction } from '../shared/usePetInteraction';
import { PetPreview } from './PetPreview';
import { PetReactionControls } from '../shared/PetReactionControls';
import mochiIllustration from '../public/examples/mochi-sprout.png';

const materialIds = ['mochi', 'jelly', 'cream', 'candy'];
const moodIds = ['okay', 'happy', 'blank', 'sleepy', 'spotted', 'sad', 'peek', 'wink', 'shy'];
const materials = OPTIONS.materials.filter(item => materialIds.includes(item.value));
const moods = OPTIONS.moods.filter(item => moodIds.includes(item.value));
const palettes = OPTIONS.palettes;
type PetConfig = typeof PET;
const studioSections = [
  { label: '形态', mark: '◯', title: '它想长成什么样？', note: '圆一点，软一点，都是可爱的开头' },
  { label: '材质', mark: '〰', title: '摸起来会是什么感觉？', note: '试一试，再轻轻点它一下' },
  { label: '颜色', mark: '◒', title: '揉进一点喜欢的颜色', note: '今天想要草莓奶霜，还是海盐苏打？' },
  { label: '表情', mark: '◡', title: '今天它是什么心情？', note: '不用很热闹，发会儿呆也很好' },
  { label: '配饰', mark: '✿', title: '捎上一点小心思', note: '带一朵花，或者简简单单地出发' },
];

function initialPet(): PetConfig {
  try {
    const saved = localStorage.getItem('cornerpet:3d');
    return saved ? normalizePetConfig(JSON.parse(saved)) : createPetModel({ ...PET, source: 'custom' });
  } catch { return createPetModel({ ...PET, source: 'custom' }); }
}

function Creator({ onReady, onBusyChange, onBack }: { onBack: () => void; onReady: (pet: PetConfig) => void; onBusyChange: (busy: boolean) => void }) {
  const [pet, setPet] = useState<PetConfig>(initialPet);
  const [stage, setStage] = useState(0);
  const section = studioSections[stage];

  const model = getBaseModel(pet.shape);
  const { reaction, reacting, message, greet, play, stop } = usePetInteraction('showcase');
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const capture = useRef<(() => string) | null>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const materialName = materials.find(item => item.value === pet.material)?.label;
  const moodName = OPTIONS.moods.find(item => item.value === pet.mood)?.label;
  const paletteName = palettes.find(item => item.value === pet.palette)?.label;

  useEffect(() => {
    try { localStorage.setItem('cornerpet:3d', JSON.stringify(pet)); setStorageError(false); }
    catch { setStorageError(true); }
    document.title = `${pet.name} · 3D 桌角生物`;
  }, [pet]);
  function choose(field: 'material' | 'mood' | 'palette' | 'accessory', value: string) {
    if (field === 'mood') stop();
    setPet(current => normalizePetConfig({ ...current, model3D: { ...current.model3D, [field]: value } }) as PetConfig);
  }
  function selectModel(value: string) {
    if (value === pet.shape) return;
    const next = getBaseModel(value);
    play('showcase');
    setPet(current => normalizePetConfig({ ...current, model3D: { ...current.model3D, shape: next.value, palette: next.palette, material: next.material } }));
  }
  async function complete() {
    setPreparing(true); onBusyChange(true); setError('');
    try {
      let blob: Blob;
      if (capture.current) blob = await fetch(capture.current()).then(response => response.blob());
      else {
        const svg = viewer.current?.querySelector('svg');
        if (!svg) throw new Error('小团还在准备中，请稍等一下');
        const copy = svg.cloneNode(true) as SVGSVGElement;
        copy.setAttribute('width', '640'); copy.setAttribute('height', '640');
        blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' });
      }
      const assets = await petImageAssets(blob);
      // Each completed custom creation is a new pet; its visual draft remains reusable.
      onReady(createPetModel({ ...pet, ...assets, source: 'custom' }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '准备图片失败，请重试'); }
    finally { setPreparing(false); onBusyChange(false); }
  }

  return <section className="toy-workshop" aria-label="小生物的桌角">
    <div className="workshop-heading"><div><span className="hand-note">慢慢捏，不着急</span><h1>让一点想象，长出模样</h1></div><button className="text-button" disabled={preparing} onClick={onBack}>← 回到桌角</button></div>
    <div className="workshop-layout">
      <nav className="material-dock" aria-label="小生物定制"><span className="dock-note">随手挑一点</span>{studioSections.map((item, index) => <button key={item.label} aria-pressed={stage === index} aria-controls="studio-options" disabled={preparing} onClick={() => setStage(index)}><span aria-hidden="true">{item.mark}</span><b>{item.label}</b></button>)}</nav>
      <section className="creature-display" aria-label="3D 角色实时预览">
        <div className="display-label"><span className="alive-dot" /> 一只小生命，正在慢慢成形</div>
        <span className="doodle sparkle-one" aria-hidden="true">✧</span><span className="doodle sparkle-two" aria-hidden="true">✳</span>
        <div className="viewer-stage" ref={viewer}>
          <PetPreview config={pet} reaction={reaction} message={message} onTap={greet} onCaptureReady={value => { capture.current = value; }} />
        </div>
        <div className="orbit-hint">你可以点点我哦</div>
        <PetReactionControls play={play} disabled={preparing} />
        <div className="specimen-label"><span className="hand-note">我的小小伙伴</span><strong>{model.label}</strong></div>
      </section>
      <section className="choice-paper" aria-labelledby="lab-title">
        <span className="paper-tape" aria-hidden="true" />
        <div className="paper-heading"><span className="hand-note">关于它的{section.label}</span><h2 id="lab-title">{section.title}</h2><p>{section.note}</p></div>
        <div id="studio-options" className="studio-options" key={stage}>
          {stage === 0 && <div className="base-model-grid" aria-label="基础形态">{BASE_MODELS.map(item => <button key={item.value} aria-pressed={pet.shape === item.value} className={pet.shape === item.value ? 'selected' : ''} onClick={() => selectModel(item.value)}>
            <span className="base-model-art" aria-hidden="true"><Pet config={normalizePetConfig({ shape: item.value, palette: item.palette, material: 'mochi', mood: 'blank', accessory: 'none' })} /></span><b>{item.label}</b><small>{item.note}</small>
          </button>)}</div>}
          {stage === 1 && <div className="material-pills">{materials.map(item => <button key={item.value} className={pet.material === item.value ? 'selected' : ''} aria-pressed={pet.material === item.value} onClick={() => choose('material', item.value)}><span className={`material-sample sample-${item.value}`} aria-hidden="true" /><b>{item.label}</b><small>{item.note}</small></button>)}</div>}
          {stage === 2 && <div className="studio-colors">{palettes.map(item => <button key={item.value} className={pet.palette === item.value ? 'selected' : ''} aria-pressed={pet.palette === item.value} onClick={() => choose('palette', item.value)}><span className="color-daub" aria-hidden="true" style={{ background: `linear-gradient(145deg, ${item.light}, ${item.body} 62%, ${item.shade})` }} /><b>{item.label}</b></button>)}</div>}
          {stage === 3 && <div className="mood-pills">{moods.map(item => <button key={item.value} className={pet.mood === item.value ? 'selected' : ''} aria-pressed={pet.mood === item.value} onClick={() => choose('mood', item.value)}><span>{item.symbol}</span>{item.label}</button>)}</div>}
          {stage === 4 && <div className="accessory-pills">{OPTIONS.accessories.filter(item => ['none', 'bow', 'flower', 'starpin'].includes(item.value)).map(item => <button key={item.value} aria-pressed={pet.accessory === item.value} className={pet.accessory === item.value ? 'selected' : ''} onClick={() => choose('accessory', item.value)}><span aria-hidden="true">{item.mark}</span><b>{item.label}</b><small>{item.value === 'none' ? '简简单单，也很可爱' : item.value === 'bow' ? '一点认真打扮的心情' : item.value === 'flower' ? '捎来一朵小小春天' : '别一颗小星星，陪你发亮'}</small></button>)}</div>}
        </div>
        <p className="choice-note" aria-live="polite">{[model.note, `${model.label} · ${materialName}`, `今天是${paletteName}的颜色`, moodName, '一点点喜欢，都是它的样子'][stage]}</p>
      </section>
    </div>
    <div className="workshop-bottom"><p><span aria-hidden="true">⌁</span> 没有标准答案，喜欢就好</p><button className="bring-button" disabled={preparing || reacting} onClick={() => void complete()}>{preparing ? '正在接住它…' : '就是它了 · 起个名字'} <span aria-hidden="true">↗</span></button></div>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {storageError && <p className="launch-status">浏览器暂时不能保存设置，刷新前请先把它带到桌面</p>}
  </section>;
}

// A visit through the studio only tells the opening once. No saved-pet data is changed.
let openingSeen = false;

function StudioWelcome({ onCustom, onPhoto, pet, onResume }: { onCustom: () => void; onPhoto: () => void; pet: PetConfig | null; onResume: () => void }) {
  const [opening, setOpening] = useState(() => !pet && !openingSeen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const { reaction, message, greet, play } = usePetInteraction(opening ? undefined : 'showcase');
  const [beat, setBeat] = useState(0);
  const [paths, setPaths] = useState(false);
  const invitation = useRef<HTMLButtonElement>(null);
  const pathsTitle = useRef<HTMLHeadingElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const welcomePet = normalizePetConfig({ shape: 'mochi', palette: 'sakura-mochi', material: 'jelly', mood: 'shy', accessory: 'none', name: '小团' });

  const finishOpening = useCallback(() => {
    const focusInvitation = document.activeElement === skip.current || document.activeElement?.classList.contains('story-next');
    play('showcase'); setOpening(false);
    if (focusInvitation) requestAnimationFrame(() => invitation.current?.focus());
  }, [play]);
  const advanceStory = useCallback(() => {
    if (beat < 4) setBeat(current => current + 1);
    else finishOpening();
  }, [beat, finishOpening]);
  useEffect(() => {
    openingSeen = true;
    if (!opening) return;
    // Each page gets its own reading time, including after a manual turn.
    const timer = setTimeout(advanceStory, [3600, 2000, 3100, 3600, 3700][beat]);
    return () => clearTimeout(timer);
  }, [opening, beat, advanceStory]);
  useEffect(() => {
    if (!opening) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', finishOpening);
    return () => preference.removeEventListener('change', finishOpening);
  }, [opening, finishOpening]);
  useEffect(() => { if (paths) { pathsTitle.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); } }, [paths]);

  function returnToCorner() { play('showcase'); setPaths(false); requestAnimationFrame(() => invitation.current?.focus()); }

  if (paths) return <section className="story-paths" aria-labelledby="paths-title">
    <button className="text-button story-back" onClick={returnToCorner}>← 回到小桌角</button>
    <header className="paths-heading"><span className="hand-note">每一场相遇，都有它的来处</span><h1 id="paths-title" ref={pathsTitle} tabIndex={-1}>它想从哪里来到你身边？</h1><p>跟着一点点喜欢，选一条小路</p></header>
    <div className="story-path-grid">
      <button className="story-path imagination-path" aria-labelledby="imagination-title" onClick={onCustom}>
        <span className="path-art imagination-art" aria-hidden="true">
          <span className="thought-line">一个念头，圆滚滚</span>
          <span className="path-cloud"><Pet config={normalizePetConfig({ shape: 'cloud', palette: 'sunny-blanket', mood: 'sleepy' })} /></span>
          <span className="path-mochi"><Pet config={normalizePetConfig({ shape: 'mochi', palette: 'sakura-mochi', mood: 'happy' })} /></span>
          <svg className="path-pencil" viewBox="0 0 130 30" fill="none"><path d="M12 7H105V23H12Z" fill="#D6B68B" /><path d="M12 7L0 15L12 23" fill="#F3DFC0" /><path d="M4 12L0 15L4 18" fill="#7C6653" /><path d="M105 7H118Q125 7 125 15T118 23H105Z" fill="#DDBCB2" /><path d="M15 11H103" stroke="#F9E6C8" strokeWidth="3" /></svg>
          <span className="path-spark">✧</span>
        </span>
        <span className="path-copy"><span className="path-label hand-note">揉一点想象</span><strong id="imagination-title">从想象里长出来</strong><span className="path-description">从一个小小念头开始，<br />慢慢捏出只属于你的小家伙</span><span className="path-invitation">去捏捏看 <span aria-hidden="true">↗</span></span></span>
      </button>
      <button className="story-path memory-path" aria-labelledby="memory-title" onClick={onPhoto}>
        <span className="path-art memory-art" aria-hidden="true">
          <span className="photo-keepsake"><span className="keepsake-tape" /><img src={mochiIllustration} alt="" /><span className="hand-note">喜欢的它，想每天见</span></span>
          <span className="photo-corner-note hand-note">把熟悉的模样，<br />放近一点</span><span className="path-spark">✧</span>
        </span>
        <span className="path-copy"><span className="path-label hand-note">捎一份喜欢</span><strong id="memory-title">把生活里的它带回来</strong><span className="path-description">一张舍不得划走的照片，<br />也能住成桌角的小小陪伴</span><span className="path-invitation">去挑一张 <span aria-hidden="true">↗</span></span></span>
      </button>
    </div>
    <p className="paths-footnote hand-note">从哪里来都好，这里总会给它留个位置</p>
  </section>;

  const storyLines = [
    ['我的桌角以前什么都没有', '只有一点阳光，和慢慢经过的时间'],
    ['后来...', '好像有什么，轻轻靠近了……'],
    ['啪嗒', '多了一只小东西'],
    ['它有时候会发呆，', '脑袋空空的，也不知道在想什么'],
    ['有时候会偷偷睡着', '嘘……让它再眯一小会儿'],
  ];
  return <section className={`studio-welcome storybook-home${opening ? ' is-opening' : ''}`} data-story-beat={opening ? beat : 'home'} aria-label="桌角生物的小世界">
    {opening && <button ref={skip} className="text-button story-skip" onClick={finishOpening}>跳过这小段 <span aria-hidden="true">↗</span></button>}
    <div className="story-heading" aria-live="polite" aria-atomic="true">
      <span className="hand-note story-eyebrow">桌角里的小小故事</span>
      <h1 key={opening ? beat : 'home'}>{opening ? storyLines[beat][0] : pet ? `欢迎回来，${pet.name}还在这里` : '小小一只，刚好陪你'}</h1>
      <p>{opening ? storyLines[beat][1] : pet ? '你不在的时候，它也乖乖守着这一小块' : '发呆也好，忙碌也好，它就在你身边，安静待着'}</p>
    </div>
    <div className="welcome-scene">
      <div className="desk-tableau">
        <div className="desk-daylight" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="desk-mat" aria-hidden="true" />
        <svg className="desk-sprig" viewBox="0 0 92 125" fill="none" aria-hidden="true"><path d="M47 91C48 71 49 46 36 19M47 71C57 56 64 38 66 26" stroke="#9A9E7F" strokeWidth="2" strokeLinecap="round" /><path d="M40 40C18 39 14 24 22 20C31 18 40 30 40 40Z" fill="#C5CBB2" /><path d="M48 60C28 58 26 43 33 40C43 38 49 53 48 60ZM56 54C55 32 67 24 73 30C78 38 66 52 56 54Z" fill="#B5BEA0" /><path d="M28 87Q46 82 65 87L60 118Q47 124 34 118Z" fill="#E6D9C5" /><path d="M29 88Q47 94 64 88" stroke="#D3C4B0" strokeWidth="1.5" /></svg>
        <div className={`welcome-pet${opening && beat < 2 ? ' not-arrived' : opening ? ' just-arrived' : ''}`} aria-hidden={opening && beat < 2}>
          <PetPreview message={message} config={pet ?? welcomePet} presence={opening && beat === 4 ? 'sleep' : opening && beat === 3 ? 'short-idle' : 'active'} reaction={reaction} interactive={!opening} onTap={opening ? undefined : greet} />
        </div>
        {opening && beat < 2 && <span className="empty-corner hand-note">这里，原本空空的</span>}
        {opening && beat === 2 && <span className="landing-sound hand-note" aria-hidden="true">啪嗒</span>}
        {!opening && <><span className="desk-note hand-note">不用很热闹，<br />也有陪伴</span><svg className="tiny-footprints" viewBox="0 0 92 30" fill="#C9B598" aria-hidden="true"><ellipse cx="12" cy="20" rx="7" ry="4" transform="rotate(-25 12 20)" /><ellipse cx="35" cy="9" rx="7" ry="4" transform="rotate(-10 35 9)" /><ellipse cx="60" cy="18" rx="7" ry="4" transform="rotate(-15 60 18)" /><ellipse cx="82" cy="7" rx="7" ry="4" /></svg></>}
      </div>
      {!opening && pet && <div className="welcome-caption"><strong className="companion-name">{pet.name}</strong><button className="resume-companion" onClick={onResume}>让它继续陪伴你吧 <span aria-hidden="true">↗</span></button></div>}
    </div>
    {!opening && <div className="story-invitation">
      {!pet && <span className="pet-touch-note">轻轻戳它一下，它会回应你的</span>}
      <button ref={invitation} className="bring-button story-start" onClick={() => setPaths(true)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19v-7M12 13C5 13 4 8 5 5C10 5 13 8 12 13ZM12 10C12 5 16 3 20 4C20 8 17 12 12 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>领一只小东西回家<span aria-hidden="true">↗</span></button>
      <span className="invitation-afterword hand-note">给桌角那一点点空，找个软乎乎的理由</span>
    </div>}
    {opening && <><p className="opening-footnote hand-note">点一下，听下一小段</p><button className="story-next" aria-label="继续这个小故事" onClick={advanceStory} /></>}
  </section>;
}

function App() {
  const [step, setStep] = useState<'choose' | 'upload' | 'custom' | 'finish'>('choose');
  const [pet, setPet] = useState<PetConfig | null>(null);
  const [savedPet, setSavedPet] = useState<PetConfig | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const saveRequest = useRef(0);
  useEffect(() => {
    let active = true;
    setLoaded(false); setRestoreError(false);
    restoreLocalPet().then(value => { if (active) { setPet(value); setSavedPet(value); setSaveState('saved'); setSaveNote(value ? '已恢复上次的小伙伴' : ''); } })
      .catch(() => { if (active) { setRestoreError(true); setSaveNote('暂时读不到本地的小伙伴，没有清除或替换任何角色'); } })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [restoreAttempt]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); if (step === 'choose') document.title = '桌角生物 · 小小桌角'; }, [step]);
  const savePet = useCallback(async (next: PetConfig) => {
    const request = ++saveRequest.current;
    setPet(next); setSaveState('saving'); setSaveNote('正在记住它的名字和模样…');
    try {
      await savePetLocally(next);
      setSavedPet(next);
      if (next.model3D) {
        try { localStorage.setItem('cornerpet:3d', JSON.stringify(normalizePetConfig({ ...next, image2D: null, thumbnail: null }))); } catch { /* The complete pet is already saved in IndexedDB. */ }
      }
      if (request === saveRequest.current) { setSaveState('saved'); setSaveNote('已保存在这个浏览器，下次打开还能见到它'); }
      return true;
    } catch {
      if (request === saveRequest.current) { setSaveState('failed'); setSaveNote('这次没有保存成功，暂时不能带到桌面，可以重试保存，或导出 .cornerpet 角色文件备份'); }
      return false;
    }
  }, []);
  function ready(next: PetConfig) { void savePet(next); setStep('finish'); }
  return <main className={`studio-shell${step === 'choose' ? ' is-home' : ''}`}>
    <header className="masthead"><a className="brand" href="/" aria-label="桌角生物首页" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); if (!busy && saveState !== 'saving') setStep('choose'); } }}><span className="brand-mark" aria-hidden="true">⌞</span><span>桌角生物<small>CORNER COMPANIONS</small></span></a><p>{step === 'choose' ? '很小的陪伴，很长的日常' : '给喜欢的它，留一个小角落'}</p><span className="studio-open"><i /> 小小桌角 · 安静陪伴</span></header>
    {step !== 'choose' && step !== 'custom' && <div className="page-note"><button className="text-button" disabled={busy || saveState === 'saving'} onClick={() => setStep('choose')}>← 回到桌角</button><span className="hand-note">{step === 'upload' ? '喜欢的模样，值得留下' : '从此，桌角多了一点陪伴'}</span></div>}
    {!loaded && <p className="launch-status" role="status">正在看看小伙伴有没有回来…</p>}
    {loaded && restoreError && <section className="restore-notice" role="alert"><span className="hand-note">小伙伴的房门，暂时没能打开</span><h1>稍等一下，再接它回来</h1><p>{saveNote}</p><button className="bring-button" onClick={() => setRestoreAttempt(value => value + 1)}>重新读取</button></section>}
    {loaded && !restoreError && step === 'choose' && <StudioWelcome onCustom={() => setStep('custom')} onPhoto={() => setStep('upload')} pet={savedPet} onResume={() => { setPet(savedPet); setSaveState('saved'); setSaveNote('已恢复上次的小伙伴'); setStep('finish'); }} />}
    {step === 'upload' && <PhotoCreator onBusyChange={setBusy} onReady={ready} />}
    {step === 'custom' && <Creator onBack={() => setStep('choose')} onBusyChange={setBusy} onReady={ready} />}
    {step === 'finish' && pet && <PetFinish pet={pet} saveState={saveState} onBusyChange={setBusy} saveNote={saveNote} onChange={savePet} onRestart={() => setStep('choose')} />}
    <footer className="studio-footer"><span>{saveNote || '有些陪伴，不需要很多话'}</span><span>给每一个小生命，留一个桌角</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
