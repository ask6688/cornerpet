const MAX_BYTES = 12 * 1024 * 1024;
let worker: Worker | undefined;
let busy = false;

/** Decode and re-encode locally: normalizes orientation and drops photo metadata. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 照片');
  if (!file.size || file.size > MAX_BYTES) throw new Error('照片请控制在 12 MB 以内');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const validHeader = file.type === 'image/jpeg' ? header[0] === 255 && header[1] === 216 && header[2] === 255
    : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)
      : String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!validHeader) throw new Error('照片格式不正确，请重新导出为 JPG、PNG 或 WebP');
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new Error('这张照片无法读取，请换一张试试'); }
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) throw new Error('照片尺寸太大，请选择 4000 万像素以内的图片');
    const ratio = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器暂时无法处理图片');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('照片处理失败，请重试')), 'image/png'));
  } finally { image.close(); }
}

/** MODNet / U²-NetP run in a worker; the photo never leaves the browser. */
export async function removePhotoBackground(file: Blob, onProgress: (message: string) => void, subject: 'portrait' | 'object' = 'portrait'): Promise<Blob> {
  if (busy) throw new Error('上一张照片还在处理中，请稍等');
  if (!window.Worker || !window.OffscreenCanvas) throw new Error('请使用新版 Chrome、Edge 或 Safari 来处理照片');
  busy = true;
  try {
    worker ??= new Worker(new URL('./photo-worker.ts', import.meta.url), { type: 'module' });
    return await new Promise<Blob>((resolve, reject) => {
      const current = worker!;
      const fail = (message: string) => {
        clearTimeout(timeout);
        current.terminate();
        worker = undefined;
        reject(new Error(message));
      };
      const timeout = window.setTimeout(() => fail('处理时间有点长，请重试或换一张更简单的照片'), 120_000);
      current.onerror = () => fail('图片处理没有完成，请重试；若仍失败，请换一个浏览器');
      current.onmessage = ({ data }) => {
        if (data.progress) onProgress(data.progress);
        if (data.error) fail(data.error);
        if (data.blob instanceof Blob) {
          clearTimeout(timeout);
          current.onmessage = null;
          current.onerror = null;
          resolve(data.blob);
        }
      };
      current.postMessage({ file, subject, modelUrl: new URL(`models/${subject === 'portrait' ? 'modnet' : 'u2netp'}.onnx`, document.baseURI).href });
    });
  } finally { busy = false; }
}
