import mochiPreview from '../public/examples/mochi-sprout.png';
import plushPreview from '../public/examples/plush-cloud.png';
import { DEMO_FACE_RIGS } from '../shared/image-face-rigs.mjs';
import { removePhotoBackground } from './photo-processing';

export type GenerationStyle = 'mochi' | 'plush';
export type GenerationProvider = 'demo' | 'doubao';
export type GeneratedAsset = { image: Blob; provider: GenerationProvider; notice: string; faceRig?: typeof DEMO_FACE_RIGS.mochi; expressions?: string };

// Providers only produce an asset. Naming, persistence and Desktop share PetConfig.
export interface ImageGenerator {
  generate(input: { image: Blob; style: GenerationStyle; subject?: 'portrait' | 'object'; signal?: AbortSignal; onProgress?: (message: string) => void }): Promise<GeneratedAsset>;
}

export const GENERATION_STYLES = [
  { value: 'mochi' as const, label: '糯米小团', note: '软软的，像刚捏好的麻薯', preview: mochiPreview },
  { value: 'plush' as const, label: '口袋毛绒', note: '毛茸茸，想偷偷揉一下', preview: plushPreview },
];

export const demoImageGenerator: ImageGenerator = {
  async generate({ image, style, signal }) {
    if (!image.size) throw new Error('先选一张照片，再让它变身吧');
    const preset = GENERATION_STYLES.find(item => item.value === style)!;
    const response = await fetch(preset.preview, { signal });
    if (!response.ok) throw new Error('示例小伙伴暂时没能加载，请刷新后再试');
    const generated = await response.blob();
    signal?.throwIfAborted();
    return { image: generated, provider: 'demo', faceRig: DEMO_FACE_RIGS[style], notice: 'Demo · 这是预置小伙伴，并非根据你的照片生成；照片没有上传' };
  },
};

export const imageGenerator: ImageGenerator = {
  async generate({ image, style, subject = 'portrait', signal, onProgress }) {
    if (!image.size) throw new Error('先选一张照片，再让它变身吧');
    signal?.throwIfAborted();
    onProgress?.('正在为透明背景准备轮廓…');
    const cutout = await removePhotoBackground(image, () => {}, subject);
    signal?.throwIfAborted();
    const bitmap = await createImageBitmap(cutout).catch(() => { throw new Error('照片主体无法读取，请换一张试试'); });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); throw new Error('浏览器无法准备上传照片'); }
    let upload: Blob | null = null;
    for (const edge of [1024, 768, 640, 512]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      upload = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('照片压缩失败，请重试')), 'image/png'));
      if (upload.size <= 3 * 1024 * 1024) break;
    }
    bitmap.close();
    if (!upload || upload.size > 3 * 1024 * 1024) throw new Error('照片细节太多，暂时无法上传，请换一张或裁剪后重试');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels.some((value, index) => index % 4 === 3 && value < 250)) throw new Error('没有找到清楚的主体，请换一张背景更简单的照片');
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('图片读取失败，请重试'));
      reader.readAsDataURL(upload);
    });
    signal?.throwIfAborted();
    const linkedSignal = (ms: number) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
    let response: Response;
    try {
      response = await fetch('/api/generate-pet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: source, style }), signal: linkedSignal(30_000) });
    } catch (reason) {
      signal?.throwIfAborted();
      throw new Error('暂时连不上生成服务，可以先用 Demo 小伙伴继续体验', { cause: reason });
    }
    const started = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(started.error || '生成服务暂时没有回应，可以先用 Demo 小伙伴继续体验');
    if (typeof started.image === 'string') {
      if (!started.image.startsWith('data:image/png;base64,')) throw new Error('生成服务没有返回 PNG 图片，请重试');
      const generated = await fetch(started.image, { signal }).then(value => value.blob());
      return { image: generated, provider: 'doubao', expressions: started.expressions, notice: `由 ${started.model || '豆包 Seedream'} 根据这张照片生成` };
    }
    if (typeof started.id !== 'string') throw new Error('生成服务没有返回任务编号，请重试');
    const id = encodeURIComponent(started.id);
    const endpoint = `/api/pet-generation?id=${id}`;
    const deadline = Date.now() + 12 * 60_000;
    onProgress?.('正在认出照片里的它…');
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      await new Promise(resolve => setTimeout(resolve, 2500));
      let statusResponse: Response;
      try { statusResponse = await fetch(endpoint, { signal: linkedSignal(20_000) }); }
      catch { signal?.throwIfAborted(); onProgress?.('连接暂时中断，正在继续等待结果…'); continue; }
      const status = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) {
        if (statusResponse.status >= 500) { onProgress?.('连接暂时中断，正在继续等待结果…'); continue; }
        throw new Error(status.error || '生成任务中断，请重新试一次');
      }
      if (status.state === 'failed') throw new Error(status.error || '生成任务中断，请重新试一次');
      if (status.state !== 'complete') { if (status.state === 'processing') onProgress?.('正在为它准备不同的小表情…'); continue; }
      onProgress?.('正在收好它的新模样…');
      let generated: Blob, expressionsBlob: Blob;
      try {
        const [baseResponse, expressionsResponse] = await Promise.all(['image', 'expressions'].map(asset => fetch(`${endpoint}&asset=${asset}`, { signal: linkedSignal(60_000) })));
        if (!baseResponse.ok || !expressionsResponse.ok) throw new Error('图片暂时无法下载');
        [generated, expressionsBlob] = await Promise.all([baseResponse.blob(), expressionsResponse.blob()]);
      } catch { signal?.throwIfAborted(); onProgress?.('连接暂时中断，正在继续等待结果…'); continue; }
      const expressions = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('表情图片读取失败，请重试'));
        reader.readAsDataURL(expressionsBlob);
      });
      if (generated.type !== 'image/png' || !expressions.startsWith('data:image/png;base64,')) throw new Error('生成服务返回的图片格式不正确，请重试');
      void fetch(endpoint, { method: 'DELETE', keepalive: true }).catch(() => {});
      signal?.throwIfAborted();
      return { image: generated, provider: 'doubao', expressions, notice: `由 ${status.model || '豆包 Seedream'} 根据这张照片生成` };
    }
    throw new Error('生成等待超时，请重新试一次；也可以先用 Demo 体验');
  },
};
