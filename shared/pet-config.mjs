export const DESKTOP_SCALE_LIMITS = Object.freeze({ min: .5, max: 2.5 });

export const OPTIONS = Object.freeze({
  shapes: [
    { value: 'mochi', label: '糯米团', mark: '●' },
    { value: 'cloud', label: '云朵', mark: '☁' },
    { value: 'drop', label: '小水滴', mark: '◒' },
    { value: 'pudding', label: '布丁', mark: '⌒' },
    { value: 'toast', label: '吐司', mark: '▣' },
    { value: 'bun', label: '小餐包', mark: '◡' },
    { value: 'strawberry', label: '小莓果', mark: '♡' },
    { value: 'peach', label: '桃桃', mark: '♢' },
    { value: 'mushroom', label: '蘑菇', mark: '♧' },
    { value: 'star', label: '软星星', mark: '☆' },
  ],
  materials: [
    { value: 'mochi', label: '糯叽叽', note: '软软地回弹' },
    { value: 'fluffy', label: '毛茸茸', note: '边缘有点蓬' },
    { value: 'jelly', label: 'QQ 果冻', note: '透着一点光' },
    { value: 'cream', label: '轻奶油', note: '滑滑又绵密' },
    { value: 'yarn', label: '小毛线', note: '细细的织纹' },
    { value: 'candy', label: '玻璃糖', note: '亮晶晶但不吵' },
  ],
  palettes: [
    { value: 'strawberry-milk', label: '草莓奶霜', body: '#F4B9C5', light: '#FFE9EE', shade: '#EBA7B5', accent: '#C9D6B7', ink: '#5C433A', blush: '#E99AAE' },
    { value: 'sakura-mochi', label: '樱花麻薯', body: '#F6CED3', light: '#FFF0F0', shade: '#EBB7BE', accent: '#CED8BD', ink: '#5C433A', blush: '#EFAEB9' },
    { value: 'fresh-peach', label: '白桃果冻', body: '#F7C9B8', light: '#FFF0E8', shade: '#EBB3A2', accent: '#C6D6B6', ink: '#5C433A', blush: '#ECA99D' },
    { value: 'sunny-blanket', label: '香草奶油', body: '#F3E6CF', light: '#FFF8E9', shade: '#E7D2B1', accent: '#D4C6A5', ink: '#5C433A', blush: '#EFC3B8' },
    { value: 'lemon-mousse', label: '柠檬慕斯', body: '#F5E5A9', light: '#FFF7D3', shade: '#E9D491', accent: '#C9D4AE', ink: '#5C433A', blush: '#F0BFAE' },
    { value: 'matcha-cookie', label: '抹茶奶霜', body: '#C9D8B6', light: '#EDF3DF', shade: '#B5C8A0', accent: '#DFC89F', ink: '#5C433A', blush: '#E7B7AD' },
    { value: 'pistachio', label: '开心果', body: '#BFD2B4', light: '#E8F1DF', shade: '#A9C29E', accent: '#DBC49E', ink: '#5C433A', blush: '#E5B7AD' },
    { value: 'sea-salt-soda', label: '海盐苏打', body: '#C4DDE8', light: '#EBF7FA', shade: '#AECEDC', accent: '#E8C7A9', ink: '#5C433A', blush: '#EAB4B3' },
    { value: 'blueberry-yogurt', label: '蓝莓酸奶', body: '#CBC7E6', light: '#EDEBFA', shade: '#B6B1D4', accent: '#C4D2B1', ink: '#5C433A', blush: '#E6B2BD' },
    { value: 'grape-gummy', label: '葡萄奶糖', body: '#D9C5DE', light: '#F2EAF5', shade: '#C5ADD0', accent: '#BFD0B2', ink: '#5C433A', blush: '#E3ABB9' },
    { value: 'caramel-pudding', label: '焦糖布丁', body: '#EBCB9F', light: '#FFF0D8', shade: '#DDB786', accent: '#C8B690', ink: '#5C433A', blush: '#EAB1A4' },
    { value: 'sesame-paste', label: '黑芝麻牛乳', body: '#CFCBCD', light: '#F1EEF0', shade: '#B9B4B7', accent: '#D5C6AA', ink: '#5C433A', blush: '#D9A9AA' },
  ],
  moods: [
    { value: 'okay', label: '好像还不错', symbol: '˘‿˘' },
    { value: 'blank', label: '脑袋空空', symbol: '· ᴗ ·' },
    { value: 'sleepy', label: '困困', symbol: '－ ᴗ －' },
    { value: 'happy', label: '偷偷开心', symbol: '⌒‿⌒' },
    { value: 'still', label: '不太想动', symbol: 'ˍ ︿ ˍ' },
    { value: 'sad', label: '一点点委屈', symbol: '˘ ︵ ˘' },
    { value: 'spotted', label: '被发现了', symbol: '● ᴏ ●' },
    { value: 'peek', label: '偷偷看', symbol: '• ᴗ •' },
    { value: 'wink', label: 'Wink', symbol: '⌒ ᴗ •' },
    { value: 'shy', label: '有点害羞', symbol: '· ◡ ·' },
  ],
  accessories: [
    { value: 'none', label: '什么都不带', mark: '○' },
    { value: 'bow', label: '小蝴蝶结', mark: '⋈' },
    { value: 'beanie', label: '软帽子', mark: '⌒' },
    { value: 'scarf', label: '短围巾', mark: '≈' },
    { value: 'headphones', label: '小耳机', mark: 'Ω' },
    { value: 'flower', label: '一朵花', mark: '✿' },
    { value: 'starpin', label: '星星别针', mark: '★' },
  ],
});

const values = Object.fromEntries(Object.entries(OPTIONS).map(([key, list]) => [key, new Set(list.map(item => item.value))]));
const defaults = { shape: 'mochi', material: 'mochi', palette: 'strawberry-milk', mood: 'blank', accessory: 'none' };

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '') : '';
  return Array.from(name).slice(0, 8).join('') || '莓呆';
}

// Old links have no identity metadata. Their deterministic ID keeps migration stable;
// new creations use a UUID and their actual creation time.
function legacyId(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `legacy-${(hash >>> 0).toString(16)}`;
}

/** Image-relative landmarks and nearby texture samples; never executable asset data. */
function normalizeFaceRig(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || !Array.isArray(value.eyes) || value.eyes.length !== 2) throw new Error('图片表情位置无效');
  function region(part) {
    if (!part || typeof part !== 'object') throw new Error('图片表情位置无效');
    const fields = ['x', 'y', 'rx', 'ry', 'patchX', 'patchY'];
    if (fields.some(key => !Number.isFinite(part[key]) || part[key] < 0 || part[key] > 1) ||
        part.rx <= 0 || part.ry <= 0 || part.rx > .1 || part.ry > .1) throw new Error('图片表情位置无效');
    return Object.freeze({ x: part.x, y: part.y, rx: part.rx, ry: part.ry, patchX: part.patchX, patchY: part.patchY });
  }
  return Object.freeze({ eyes: Object.freeze(value.eyes.map(region)), mouth: region(value.mouth) });
}

export function normalizePetConfig(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const modern = value.version === 3 || 'model3D' in value || 'image2D' in value;
  const choices = value.model3D ?? value;
  const appearance = {
    shape: values.shapes.has(choices.shape) ? choices.shape : defaults.shape,
    material: values.materials.has(choices.material) ? choices.material : defaults.material,
    palette: values.palettes.has(choices.palette) ? choices.palette : defaults.palette,
    mood: values.moods.has(choices.mood) ? choices.mood : defaults.mood,
    accessory: values.accessories.has(choices.accessory) ? choices.accessory : defaults.accessory,
  };
  if (value.model3D != null && (value.model3D.kind !== 'procedural' || ![1, 2].includes(value.model3D.version))) throw new Error('不支持的 3D 模型');
  const variant = value.model3D?.variant;
  if (variant != null && variant !== 'portrait-glasses') throw new Error('不支持的 3D 形象');
  if (value.model3D && (value.model3D.version === 2) !== (variant === 'portrait-glasses')) throw new Error('不支持的 3D 形象');
  if (variant && appearance.shape !== 'mochi') throw new Error('不支持的 3D 形象');
  if (variant && !value.image2D) throw new Error('旧版照片桌宠缺少图片');
  // The rejected portrait preset was saved as 3D; retain its approved PNG and identity.
  const model3D = !variant && (modern ? value.model3D != null : !['image-pet', 'generated-pet'].includes(value.type))
    ? Object.freeze({ kind: 'procedural', version: 1, ...appearance }) : null;
  const image2D = modern ? value.image2D ?? null : model3D ? null : value.asset;
  if (image2D !== null || !model3D) validatePngAsset(image2D);
  const thumbnail = value.thumbnail ?? image2D;
  if (thumbnail !== null) validatePngAsset(thumbnail);
  const faceRig = normalizeFaceRig(value.faceRig);
  if (faceRig && !image2D) throw new Error('图片表情需要对应的 PNG');
  const expressionAtlas = value.expressionAtlas ?? null;
  if (expressionAtlas !== null) {
    if (!image2D || faceRig) throw new Error('图片表情资产需要独立的基础 PNG');
    const base = validatePngAsset(image2D);
    const atlas = validatePngAsset(expressionAtlas);
    if (base.width !== base.height || atlas.width % 3 || atlas.height % 2 || atlas.width * 2 !== atlas.height * 3) throw new Error('图片表情资产需为 3×2 方格 PNG');
  }
  const generationProvider = variant && value.generationProvider === 'demo-3d' ? 'demo' : value.generationProvider ?? null;
  if (generationProvider !== null && !['demo', 'openai', 'doubao'].includes(generationProvider)) throw new Error('不支持的生成来源');
  const type = model3D ? 'procedural-3d' : value.style && value.style !== 'original' ? 'generated-pet' : value.type === 'generated-pet' ? 'generated-pet' : 'image-pet';
  const source = value.source ?? (model3D ? '3d' : 'upload');
  if (!['upload', 'custom', '3d'].includes(source)) throw new Error('不支持的桌宠来源');
  const petId = value.petId ?? legacyId([type, value.name, image2D, appearance]);
  const createdTime = value.createdTime ?? '1970-01-01T00:00:00.000Z';
  if (typeof petId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(petId) || typeof createdTime !== 'string' || !Number.isFinite(Date.parse(createdTime)) || new Date(createdTime).toISOString() !== createdTime) throw new Error('桌宠身份数据无效');
  if (value.animation && value.animation.idle !== 'breathe' || value.interaction && (value.interaction.tap !== 'bounce' || value.interaction.draggable !== true) || value.personality != null) throw new Error('不支持的桌宠行为配置');
  return Object.freeze({
    version: 3,
    petId, source, createdTime,
    /** @type {string | null} */
    image2D,
    model3D,
    /** @type {string | null} */
    thumbnail,
    faceRig,
    expressionAtlas,
    /** @type {'demo' | 'openai' | 'doubao' | null} */
    generationProvider,
    animation: Object.freeze({ idle: 'breathe' }),
    interaction: Object.freeze({ tap: 'bounce', draggable: true }),
    personality: null,
    // Compatibility fields consumed by the unchanged Electron main process.
    id: 'diy',
    type,
    /** @type {string | null} */
    asset: model3D ? null : image2D,
    style: ['original', 'mochi', 'plush'].includes(value.style) ? value.style : 'original',
    // Legacy field retained for portable files; desktop size only, never Web framing.
    scale: Number.isFinite(value.scale) ? Math.min(DESKTOP_SCALE_LIMITS.max, Math.max(DESKTOP_SCALE_LIMITS.min, value.scale)) : 1,
    name: cleanName(value.name),
    ...appearance,
  });
}

export function createPetModel(value = {}) {
  return normalizePetConfig({ ...value, petId: globalThis.crypto.randomUUID(), createdTime: new Date().toISOString() });
}

export function petDisplayMode(config) {
  return config.model3D ? '3d' : '2d';
}

export const PET = normalizePetConfig({ name: '莓呆' });

function paramsFor(config) {
  const pet = normalizePetConfig(config);
  if (pet.type !== 'procedural-3d') throw new Error('照片桌宠请使用 .cornerpet 文件带到桌面');
  return new URLSearchParams({
    v: '2', s: pet.shape, m: pet.material, c: pet.palette,
    e: pet.mood, a: pet.accessory, n: pet.name,
  });
}

export function buildLaunchUrl(config) {
  return `cornerpet://adopt?${paramsFor(config)}`;
}

export const LAUNCH_URL = buildLaunchUrl(PET);

export function configSearch(config) {
  return paramsFor(config).toString();
}

function strictConfig(params) {
  const expected = ['v', 's', 'm', 'c', 'e', 'a', 'n'];
  if ([...params].length !== expected.length || expected.some(key => params.getAll(key).length !== 1) || params.get('v') !== '2') {
    throw new Error('不支持的角色链接');
  }
  const raw = { shape: params.get('s'), material: params.get('m'), palette: params.get('c'), mood: params.get('e'), accessory: params.get('a'), name: params.get('n') };
  if (!values.shapes.has(raw.shape) || !values.materials.has(raw.material) || !values.palettes.has(raw.palette) ||
      !values.moods.has(raw.mood) || !values.accessories.has(raw.accessory) || cleanName(raw.name) !== raw.name) {
    throw new Error('不支持的角色配置');
  }
  return normalizePetConfig(raw);
}

// Protocol links only carry allow-listed procedural choices, never asset URLs.
export function parseLaunchUrl(value) {
  if (typeof value !== 'string' || value.length > 512) throw new Error('无效的角色链接');
  const url = new URL(value);
  if (url.protocol !== 'cornerpet:' || url.hostname !== 'adopt' || url.port || url.username || url.password ||
      url.hash || (url.pathname && url.pathname !== '/')) throw new Error('不支持的角色链接');
  if (url.search === '?v=1&pet=berry-mochi') return PET;
  return strictConfig(url.searchParams);
}

export function parsePetSearch(search) {
  return strictConfig(new URLSearchParams(search));
}

export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = Math.ceil(MAX_ASSET_BYTES / 3) * 12 + 4096;

export function validatePngAsset(value) {
  const prefix = 'data:image/png;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix) || value.length > MAX_PACKAGE_BYTES) {
    throw new Error('桌宠资产必须是小于 8 MB 的透明 PNG');
  }
  const encoded = value.slice(prefix.length);
  const bytes = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || bytes < 45 || bytes > MAX_ASSET_BYTES) {
    throw new Error('PNG 数据无效或过大');
  }
  const header = Uint8Array.from(atob(encoded.slice(0, 44)), char => char.charCodeAt(0));
  if ([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82].some((byte, index) => header[index] !== byte)) {
    throw new Error('文件不是有效的 PNG');
  }
  const view = new DataView(header.buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > 2048 || height > 2048) throw new Error('图片尺寸需在 2048 × 2048 以内');
  return { width, height };
}

export function serializePetPackage(config) {
  const pet = normalizePetConfig(config);
  // Store PNG bytes only once. Runtime compatibility aliases are reconstructed on read.
  const { asset, thumbnail, ...data } = pet;
  const text = JSON.stringify({ format: 'cornerpet', version: 1, pet: { ...data, thumbnail: thumbnail === pet.image2D ? undefined : thumbnail } });
  if (new TextEncoder().encode(text).length > MAX_PACKAGE_BYTES) throw new Error('桌宠文件过大');
  return text;
}

export function parsePetPackage(text) {
  if (typeof text !== 'string' || text.length > MAX_PACKAGE_BYTES) throw new Error('桌宠文件过大');
  const data = JSON.parse(text);
  if (!data || data.format !== 'cornerpet' || data.version !== 1 || !data.pet ||
      typeof data.pet !== 'object' || Array.isArray(data.pet)) throw new Error('不支持的桌宠文件');
  const raw = data.pet;
  if (!['procedural-3d', 'image-pet', 'generated-pet'].includes(raw.type) ||
      !['original', 'mochi', 'plush'].includes(raw.style) ||
      !Number.isFinite(raw.scale) || raw.scale < DESKTOP_SCALE_LIMITS.min || raw.scale > DESKTOP_SCALE_LIMITS.max ||
      typeof raw.name !== 'string' || cleanName(raw.name) !== raw.name) throw new Error('不支持的桌宠配置');
  if (raw.version === 3) {
    if ('asset' in raw || !raw.petId || !raw.createdTime || !raw.source || !('image2D' in raw) || !('model3D' in raw)) throw new Error('统一桌宠数据无效');
    const pet = normalizePetConfig(raw);
    if (pet.type !== raw.type && !(raw.type === 'procedural-3d' && raw.model3D?.variant === 'portrait-glasses' && pet.type === 'generated-pet')) throw new Error('桌宠类型与视觉资产不匹配');
    return pet;
  }
  if (raw.version !== 2) throw new Error('不支持的桌宠版本');
  if (raw.type === 'procedural-3d' && raw.asset !== null) throw new Error('程序化角色不能引用外部资产');
  return normalizePetConfig(raw);
}

export function dragPosition(start, cursor, area, size) {
  const dx = cursor.x - start.cursor.x;
  const dy = cursor.y - start.cursor.y;
  return {
    moved: Math.hypot(dx, dy) >= 5,
    x: Math.round(Math.max(area.x, Math.min(start.x + dx, area.x + Math.max(0, area.width - size.width)))),
    y: Math.round(Math.max(area.y, Math.min(start.y + dy, area.y + Math.max(0, area.height - size.height)))),
  };
}
