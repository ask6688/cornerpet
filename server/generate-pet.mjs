const MAX_INPUT_BYTES = 3 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const STYLES = {
  mochi: 'soft mochi and matte clay toy, smooth rounded surface, tiny simple limbs',
  plush: 'pocket-sized plush toy, visible fine soft fibers and subtle handmade seams',
};
const EXPRESSION_PROMPT = 'Using the exact single character in the transparent reference PNG, create a transparent 3-column by 2-row expression sheet. Each cell is a square with one complete full-body character centered at the same scale, position, silhouette, colors, material, clothes and accessories. Only change the eyes, eyebrows, mouth and slight blush. Row 1: original; happy with smiling eyes and mouth; sleepy with half-closed eyes and a small yawn. Row 2: daydreaming with relaxed eyes; shy with downcast eyes and stronger blush; surprised with wide eyes and a small round mouth. Keep all six cells visually the same character. No overlap, background, checkerboard, labels, borders, text, extra subjects or watermark.';

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function validateGenerationInput(input) {
  if (!STYLES[input?.style]) throw failure('请选择一个生成风格');
  const match = typeof input.image === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.image);
  if (!match) throw failure('请上传带透明背景的 PNG 主体图');
  const image = Buffer.from(match[1], 'base64');
  if (!image.length || image.length > MAX_INPUT_BYTES) throw failure('上传图片过大，请换一张照片', 413);
  if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || image.length < 26 || ![4, 6].includes(image[25])) throw failure('照片主体需要透明 PNG，请重新处理');
  return { image, style: STYLES[input.style] };
}

function decodeGeneratedPng(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw failure('豆包没有返回有效的 PNG 图片', 502);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 26 || bytes.length > MAX_OUTPUT_BYTES || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw failure('豆包没有返回有效的 PNG 图片', 502);
  return bytes;
}

export function publicGenerationError(reason) {
  return reason instanceof Error && Number(reason.status) >= 400 && Number(reason.status) < 600 ? reason.message : '图片生成暂时失败，请稍后重试';
}

export function generationConfigured(apiKey = process.env.ARK_API_KEY) {
  return process.env.CORNERPET_DEMO_ONLY !== 'true' && typeof apiKey === 'string' && !!apiKey.trim() && apiKey !== 'undefined';
}

export function generationCapability() {
  return { configured: generationConfigured(), demoOnly: process.env.CORNERPET_DEMO_ONLY === 'true' };
}

export function handleGenerationCapability(request, response, next) {
  if ((request.url || '').split('?')[0] !== '/api/generation-capability') return next?.();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: '只支持 GET 请求' }));
    return;
  }
  response.end(JSON.stringify(generationCapability()));
}

export async function generatePet(input, options = {}) {
  const { style } = validateGenerationInput(input);
  const apiKey = options.apiKey ?? process.env.ARK_API_KEY;
  if (!generationConfigured(apiKey)) throw failure('图片生成服务尚未配置，请在服务端设置 ARK_API_KEY', 503);
  const model = options.model ?? process.env.ARK_IMAGE_MODEL ?? 'doubao-seedream-5-0-flash-260915';

  async function edit(image, prompt, size, errorMessage) {
    let response;
    try {
      response = await (options.fetchImpl ?? fetch)(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, image, size, background: 'transparent', output_format: 'png', response_format: 'b64_json', watermark: false }),
        signal: AbortSignal.timeout(300_000),
      });
    } catch { throw failure(errorMessage, 502); }
    let payload;
    try { payload = await response.json(); }
    catch { throw failure('豆包服务返回了无法读取的结果', 502); }
    if (!response.ok) {
      if (response.status === 401) throw failure('豆包 API 密钥无效，请检查服务端配置', 503);
      if (response.status === 403) throw failure('火山方舟账号暂时无权使用该图片模型，请检查模型权限', 503);
      if (response.status === 429) throw failure('豆包生成额度或速率已用尽，请稍后再试', 503);
      if (response.status === 400) throw failure('豆包未接受这次请求，请检查照片或模型配置', 422);
      throw failure(errorMessage, 502);
    }
    const base64 = payload?.data?.[0]?.b64_json;
    return { base64, output: decodeGeneratedPng(base64) };
  }

  const { base64, output } = await edit(input.image, `Transform the subject in the reference image into one original Corner Pet character. Preserve recognizable colors, markings, distinctive body or object shape, hairstyle or fur pattern, eyewear and clothing accents. Make it a tiny round full-body creature with ${style}. Center one complete cute character with breathing room. Preserve the real transparent background and clean alpha edges; no scene, platform, text, watermark or extra subjects.`, '1024x1024', '形象生成暂时失败，请稍后再试');
  if (output.readUInt32BE(16) !== output.readUInt32BE(20) || ![4, 6].includes(output[25])) throw failure('形象图片没有生成透明方形 PNG，请重试', 502);
  const { base64: expressionBase64, output: expressionOutput } = await edit(`data:image/png;base64,${base64}`, EXPRESSION_PROMPT, '1536x1024', '表情生成暂时失败，请重试');
  const width = expressionOutput.readUInt32BE(16), height = expressionOutput.readUInt32BE(20);
  if (width % 3 || height % 2 || width * 2 !== height * 3 || ![4, 6].includes(expressionOutput[25])) throw failure('表情图未按透明六宫格生成，请重试', 502);
  return { image: `data:image/png;base64,${base64}`, expressions: `data:image/png;base64,${expressionBase64}`, provider: 'doubao', model };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES * 1.5) throw failure('请求过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure('请求格式不正确'); }
}

export async function handleGeneratePet(request, response, next) {
  if ((request.url || '').split('?')[0] !== '/api/generate-pet') return next?.();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: '只支持 POST 请求' }));
    return;
  }
  try {
    response.end(JSON.stringify(await generatePet(await readJson(request))));
  } catch (reason) {
    response.statusCode = Number(reason?.status) || 500;
    response.end(JSON.stringify({ error: publicGenerationError(reason) }));
  }
}
