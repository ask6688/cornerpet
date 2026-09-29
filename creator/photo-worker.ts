import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm';
import wasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';

// Single-thread WASM works on static hosting without COOP/COEP headers.
env.wasm.numThreads = 1;
env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
let session: InferenceSession | undefined;
let activeModel = '';
const progress = (message: string) => self.postMessage({ progress: message });

self.onmessage = async ({ data }: MessageEvent<{ file: Blob; modelUrl: string; subject: 'portrait' | 'object' }>) => {
  let image: ImageBitmap | undefined;
  try {
    const portrait = data.subject === 'portrait';
    if (!session || activeModel !== data.modelUrl) {
      if (session) { await session.release(); session = undefined; }
      progress('正在认出照片里的它…');
      const response = await fetch(data.modelUrl).catch(() => { throw new Error('抠图模型加载失败，请检查网络后重试'); });
      if (!response.ok) throw new Error('抠图模型加载失败，请检查网络后重试');
      session = await InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'] });
      activeModel = data.modelUrl;
    }
    progress('正在轻轻分开它和周围…');
    image = await createImageBitmap(data.file);
    const scale = Math.min(512 / Math.min(image.width, image.height), 1024 / Math.max(image.width, image.height));
    const width = portrait ? Math.max(32, Math.floor(image.width * scale / 32) * 32) : 320;
    const height = portrait ? Math.max(32, Math.floor(image.height * scale / 32) * 32) : 320;
    const inputCanvas = new OffscreenCanvas(width, height);
    const inputContext = inputCanvas.getContext('2d')!;
    inputContext.drawImage(image, 0, 0, width, height);
    const rgba = inputContext.getImageData(0, 0, width, height).data;
    const pixels = width * height;
    const input = new Float32Array(pixels * 3);
    const mean = portrait ? [0.5, 0.5, 0.5] : [0.485, 0.456, 0.406];
    const deviation = portrait ? [0.5, 0.5, 0.5] : [0.229, 0.224, 0.225];
    let maximum = portrait ? 255 : 1;
    if (!portrait) for (let i = 0; i < rgba.length; i += 4) maximum = Math.max(maximum, rgba[i], rgba[i + 1], rgba[i + 2]);
    // Matches rembg's U²-NetP normalization (RGB / image maximum, ImageNet mean/std).
    for (let i = 0; i < pixels; i++) for (let channel = 0; channel < 3; channel++) {
      input[channel * pixels + i] = (rgba[i * 4 + channel] / maximum - mean[channel]) / deviation[channel];
    }
    const tensor = new Tensor('float32', input, [1, 3, height, width]);
    const output = await session.run({ [session.inputNames[0]]: tensor });
    const mask = output[session.outputNames[0]].data as Float32Array;
    let min = Infinity, max = -Infinity;
    for (const value of mask) { min = Math.min(min, value); max = Math.max(max, value); }
    if (!Number.isFinite(min) || max - min < 0.0001) throw new Error('还没找到清楚的主体，请换一张背景更简单的照片');
    const maskPixels = new ImageData(width, height);
    for (let i = 0; i < pixels; i++) {
      const alpha = Math.round(255 * (portrait ? mask[i] : (mask[i] - min) / (max - min)));
      maskPixels.data.set([alpha, alpha, alpha, 255], i * 4);
    }
    inputContext.putImageData(maskPixels, 0, 0);
    progress('正在把它的轮廓仔细收好…');
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(inputCanvas, 0, 0, image.width, image.height);
    const alpha = context.getImageData(0, 0, image.width, image.height).data;
    context.clearRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);
    const original = context.getImageData(0, 0, image.width, image.height);
    for (let i = 0; i < original.data.length; i += 4) original.data[i + 3] = Math.round(original.data[i + 3] * alpha[i] / 255);
    context.putImageData(original, 0, 0);
    tensor.dispose();
    for (const value of Object.values(output)) value.dispose();
    self.postMessage({ blob: await canvas.convertToBlob({ type: 'image/png' }) });
  } catch (error) {
    console.warn('Background removal failed', error);
    const message = error instanceof Error && /^(抠图模型|还没找到)/.test(error.message) ? error.message : '抠图暂时没有完成，请重试或换一个浏览器';
    self.postMessage({ error: message });
  } finally { image?.close(); }
};
