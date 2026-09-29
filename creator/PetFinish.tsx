import { useEffect, useRef, useState } from 'react';
import { PetPreview } from './PetPreview';
import { usePetInteraction } from '../shared/usePetInteraction';
import { PET, normalizePetConfig, serializePetPackage } from '../shared/pet-config.mjs';
import { startDesktopHandoff } from './desktop-handoff';
import { PetReactionControls } from '../shared/PetReactionControls';

export function PetFinish({ pet, saveNote, saveState, onBusyChange, onChange, onRestart }: {
  pet: typeof PET; saveNote: string; saveState: 'saved' | 'saving' | 'failed'; onBusyChange: (busy: boolean) => void; onChange: (pet: typeof PET) => Promise<boolean>; onRestart: () => void;
}) {
  const { reaction, message, greet, play } = usePetInteraction();
  const [draftName, setDraftName] = useState(pet.name);
  const [composing, setComposing] = useState(false);
  const [nameError, setNameError] = useState('');
  const [handoff, setHandoff] = useState<'idle' | 'leaving' | 'arrived' | 'failed'>('idle');
  const [handoffNote, setHandoffNote] = useState('名字和模样，会一起去你的桌角');
  useEffect(() => { onBusyChange(handoff === 'leaving'); return () => onBusyChange(false); }, [handoff, onBusyChange]);
  const input = useRef<HTMLInputElement>(null);
  const normalizedName = normalizePetConfig({ name: draftName }).name;
  useEffect(() => { document.title = `${pet.name} · 桌角生物`; }, [pet.name]);
  useEffect(() => { setDraftName(pet.name); }, [pet.petId]);
  // Let IME and deletion finish in the input; normalize only a completed name.
  useEffect(() => {
    if (composing || !draftName.trim() || Array.from(draftName.trim()).length > 8 || normalizedName === pet.name) return;
    const timer = setTimeout(() => { void onChange(normalizePetConfig({ ...pet, name: draftName })); }, 450);
    return () => clearTimeout(timer);
  }, [draftName, normalizedName, composing, pet, onChange]);

  function commitName(save = true) {
    if (composing) return null;
    if (!draftName.trim() || Array.from(draftName.trim()).length > 8) {
      setNameError(!draftName.trim() ? '给它起一个小名吧' : '小名最多 8 个字'); input.current?.focus(); return null;
    }
    const next = normalizePetConfig({ ...pet, name: draftName });
    setDraftName(next.name); setNameError(''); if (save) void onChange(next);
    return next;
  }
  function bringHome() {
    if (composing || dirty || saveState !== 'saved') return;
    const next = pet;
    setHandoff('leaving'); setHandoffNote(`${next.name}正准备去你的桌角…`);
    // The first protocol navigation must retain this click's user activation.
    startDesktopHandoff(next).then(accepted => {
      setHandoff('arrived'); setHandoffNote(`CornerPet 已接住${accepted.name}，去桌角点它一下吧`);
    }).catch(reason => {
      setHandoff('failed'); setHandoffNote(reason instanceof Error ? reason.message : '暂时没有接到桌面应用，可以再试一次');
    });
  }
  function downloadHome() {
    const next = commitName(); if (!next) return;
    try {
      const url = URL.createObjectURL(new Blob([serializePetPackage(next)], { type: 'application/x-cornerpet' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `${next.name.replace(/[\\/:*?"<>|]/g, '') || '小在'}.cornerpet`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setHandoffNote('小窝已留好，双击文件，或在另一台 Mac 用 CornerPet 打开，名字和模样都会一起过去');
    } catch (reason) { setHandoffNote(reason instanceof Error ? reason.message : '保存小窝失败，请重试'); }
  }
  const dirty = !draftName.trim() || Array.from(draftName.trim()).length > 8 || normalizedName !== pet.name;
  return <section className="workbench photo-workbench finish-workbench">
    <section className={`preview ${pet.model3D ? 'viewer-preview' : 'photo-preview checker-preview'}`} aria-label="桌宠完成预览">
      <div className="preview-note"><i /> 从这一刻起，它有了自己的名字</div>
      <div className={`${pet.model3D ? 'viewer-stage' : 'photo-stage'} travel-stage${handoff === 'leaving' ? ' is-departing' : ''}`}>
        <PetPreview config={pet} reaction={reaction} message={message} onTap={greet} />
        {handoff === 'leaving' && <span className="travel-note">收拾好小心情，出发</span>}
      </div>
      <div className="pet-caption"><span>桌角住民</span><div><strong>{pet.name}</strong><small>轻轻点它一下</small></div><span>一直都在</span></div>
      <PetReactionControls play={play} disabled={handoff === 'leaving'} />
    </section>
    <section className="editor photo-editor finish-editor">
      <span className="photo-eyebrow">你们的故事，从这里开始</span>
      <h1>它诞生啦</h1><p>无论从哪里来，都有一个属于它的桌角</p>
      {pet.generationProvider === 'demo' && <p className="demo-provenance">演示伙伴 · 这是预置角色，并非根据上传照片实时生成，名字、互动和带到桌面都可以体验</p>}
      <label className="finish-name" htmlFor="pet-name">给它一个小名<input ref={input} id="pet-name" value={draftName} autoComplete="off" disabled={handoff === 'leaving'} aria-invalid={!!nameError} aria-describedby="name-feedback"
        onChange={event => { setDraftName(event.target.value); setNameError(''); }}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onBlur={() => { if (dirty && !composing) commitName(); }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && !composing) { event.preventDefault(); commitName(); } }} /></label>
      <div className="companion-save"><button className="text-button" disabled={composing || handoff === 'leaving'} onClick={() => commitName()}>{saveState === 'failed' ? '重试保存' : '保存这位伙伴'}</button><span id="name-feedback" role={saveState === 'failed' ? 'alert' : 'status'}>{nameError || (dirty ? '小名写好后会自动保存' : saveNote)}</span></div>

      <button className="bring-button" disabled={composing || dirty || saveState !== 'saved' || handoff === 'leaving'} onClick={bringHome}>{handoff === 'leaving' ? '正走向你的桌角…' : saveState === 'saving' ? '正在记住它…' : '带它去桌面'} <span aria-hidden="true">↗</span></button>
      <p className={`photo-handoff${handoff === 'failed' ? ' handoff-failed' : ''}`} role="status">{handoffNote}</p>
      <details className="handoff-help" open={handoff === 'failed' || undefined}><summary>第一次见面 / 留一份小窝</summary><p>先在这台 Mac 安装并打开 CornerPet，浏览器询问时允许打开应用和连接本机；之后两种小伙伴都能直接送到桌角</p><button className="text-button" disabled={handoff === 'leaving' || composing} onClick={downloadHome}>下载小窝文件</button></details>
      <div className="photo-secondary">{pet.image2D && <a href={pet.image2D} download={`${pet.name}.png`}>下载透明 PNG ↓</a>}<button disabled={handoff === 'leaving'} onClick={async () => { const next = commitName(false); if (next && await onChange(next)) onRestart(); }}>再创建一只</button></div>
    </section>
  </section>;
}
