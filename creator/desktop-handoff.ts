import { PET, serializePetPackage } from '../shared/pet-config.mjs';
import { HANDOFF_URL, buildConnectUrl, validateConnectOrigin } from '../shared/desktop-connect.mjs';

let connection: { token: string; origin: string } | undefined;

/** Call directly from a click handler: the first protocol launch needs user activation. */
export function startDesktopHandoff(pet: typeof PET): Promise<{ petId: string; name: string }> {
  try { return beginHandoff(pet); }
  catch (error) { return Promise.reject(error); }
}

function beginHandoff(pet: typeof PET): Promise<{ petId: string; name: string }> {
  const body = serializePetPackage(pet);
  const origin = validateConnectOrigin(window.location.origin);
  if (!connection || connection.origin !== origin) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    connection = { token, origin };
  }
  // Every explicit click can wake an app that was quit; the token is reused in this tab.
  // Only a short capability/origin pair travels through the OS protocol handler.
  try { window.location.assign(buildConnectUrl(connection)); }
  catch {
    connection = undefined;
    return Promise.reject(new Error('浏览器没能打开 CornerPet，请先安装桌面小窝，或下载小窝文件后双击打开'));
  }
  const paired = connection!;
  return deliver().catch(error => { if (connection === paired) connection = undefined; throw error; });

  async function deliver() {
    const deadline = performance.now() + 20_000;
    while (performance.now() < deadline) {
      let response: Response | undefined;
      try {
        response = await fetch(HANDOFF_URL, {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
          headers: { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' }, body,
          signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - performance.now()))),
        });
      } catch { /* App startup or a browser local-network permission prompt may still be pending. */ }
      if (response?.ok) {
        const receipt = await response.json();
        if (receipt.ok !== true || receipt.petId !== pet.petId || receipt.name !== pet.name) throw new Error('桌面小窝未确认接收到这只小生物，请重试');
        return { petId: receipt.petId as string, name: receipt.name as string };
      }
      if (response?.status === 413) throw new Error('这只小生物的文件太大了，请缩小照片后再试');
      if (response?.status === 400 || response?.status === 415) throw new Error('桌面小窝暂时无法读取这只小生物，请更新 CornerPet 或下载小窝文件');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('没能连上桌面小窝，请确认已安装并打开 CornerPet，并允许浏览器访问本地网络，再点一次试试，也可以下载小窝文件后双击打开');
  }
}
