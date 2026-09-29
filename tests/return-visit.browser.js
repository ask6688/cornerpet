// Run in an isolated playwright-cli session against Vite; never clears user storage.
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const stored = () => page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  const saved = () => page.locator('#name-feedback').getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).waitFor();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let handoffs = 0;
  await page.route('http://127.0.0.1:47823/**', async route => { handoffs++; await route.abort(); });
  await page.goto('http://127.0.0.1:5173/');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await page.getByRole('button', { name: '小蘑菇', exact: true }).click();
  await page.getByRole('button', { name: /就是它了/ }).click();
  await saved();
  await page.getByLabel('给它一个小名', { exact: true }).fill('蘑菇陪你');
  await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
  await saved();
  const model = await stored();
  assert(model.model3D.shape === 'mushroom' && model.name === '蘑菇陪你', '3D save incomplete');
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).waitFor();
  assert((await page.getByRole('heading', { level: 1 }).innerText()).includes('蘑菇陪你'), 'welcome heading missing saved name');
  assert((await page.locator('.companion-name').innerText()).includes('蘑菇陪你'), 'return visit missing saved name');
  assert(await page.locator('.welcome-pet .pet-3d').count() === 1, 'wrong home renderer');
  await page.waitForTimeout(2200); // Allow the initial WebGL scene to finish loading.
  await page.screenshot({ path: 'output/playwright/return-3d-home.png', fullPage: true });
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  assert(await page.getByLabel('给它一个小名', { exact: true }).inputValue() === '蘑菇陪你', 'resume renamed pet');
  assert(await page.getByRole('button', { name: '带它去桌面', exact: true }).isEnabled(), 'saved pet cannot leave');
  await page.getByRole('button', { name: /回到桌角/ }).click();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await page.getByRole('button', { name: '糯米团', exact: true }).click();
  await page.getByRole('button', { name: /回到桌角/ }).click();
  assert(JSON.stringify(await stored()) === JSON.stringify(model), 'unfinished replacement overwrote companion');
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
  await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
  await page.getByRole('button', { name: /请 Demo 小伙伴出场/ }).click();
  await page.getByRole('button', { name: /给它起个名字/ }).waitFor();
  // A real transaction rejection: the old record must survive; no native request is allowed.
  await page.evaluate(() => {
    window.originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') throw new DOMException('Test quota exhausted', 'QuotaExceededError');
      return window.originalTransaction.apply(this, args);
    };
  });
  await page.getByRole('button', { name: /给它起个名字/ }).click();
  await page.getByRole('button', { name: '重试保存', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '带它去桌面', exact: true }).isDisabled(), 'unsaved pet can reach desktop');
  assert(JSON.stringify(await stored()) === JSON.stringify(model), 'failed write destroyed old companion');
  assert(handoffs === 0, 'handoff occurred before persistence');
  await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalTransaction; });
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await saved();
  await page.getByLabel('给它一个小名', { exact: true }).fill('小照片');
  await saved();
  const photo = await stored();
  assert(photo.source === 'upload' && photo.image2D && photo.faceRig && !photo.model3D, 'photo metadata lost');
  // Legacy scale values survive in data but must never size the Web preview.
  await page.evaluate(async () => {
    const storage = await import('/creator/pet-storage.ts');
    const pet = await storage.restoreLocalPet();
    await storage.savePetLocally({ ...pet, scale: 1.35 });
  });
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).waitFor();
  assert((await page.getByRole('heading', { level: 1 }).innerText()).includes(photo.name), 'photo welcome heading missing saved name');
  assert(await page.locator('.image-pet-size').evaluate(el => getComputedStyle(el).transform) === 'none', 'desktop scale leaked into Web');
  for (const [width, height] of [[1440, 900], [900, 600], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home overflows ${width}`);
    await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/return-photo-home-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  assert(await page.getByLabel('给它一个小名', { exact: true }).inputValue() === photo.name, 'photo name not restored');
  assert(await page.locator('input[type=range]').count() === 0, 'Web still edits desktop size');
  assert((await stored()).image2D === photo.image2D && (await stored()).petId === photo.petId, 'photo identity/asset changed on revisit');
  // Saving latest input is ordered, even with multiple callers.
  await page.evaluate(async () => {
    const storage = await import('/creator/pet-storage.ts');
    const pet = await storage.restoreLocalPet();
    await Promise.all(['先保存', '再保存', '最后保存'].map(name => storage.savePetLocally({ ...pet, name })));
  });
  assert((await stored()).name === '最后保存', 'writes finished out of order');
  // Read errors are not rendered as an empty first visit; retry restores existing data.
  await page.addInitScript(() => {
    window.originalOpen = indexedDB.open;
    indexedDB.open = () => { throw new DOMException('Test read failure', 'UnknownError'); };
  });
  await page.reload();
  await page.getByRole('button', { name: '重新读取', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '领一只小东西回家', exact: true }).count() === 0, 'read failure shown as first visit');
  await page.evaluate(() => { indexedDB.open = window.originalOpen; });
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).waitFor();
  assert((await page.locator('.companion-name').innerText()).includes('最后保存'), 'retry lost existing pet');
  assert(errors.length === 0, errors.join('\n'));
  return { diyRevisit: true, photoRevisit: true, oldPetSurvivesFailure: true, saveGate: true, retry: true, responsive: [1440, 900, 390, 320], orderedWrites: true, errors };
}
