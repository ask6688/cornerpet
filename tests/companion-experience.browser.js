// playwright-cli -s=experience run-code "$(cat tests/companion-experience.browser.js)"
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.studio-welcome').waitFor();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  const dock = page.getByRole('navigation', { name: '小生物定制' });
  await page.locator('.base-model-grid').getByRole('button', { name: /糯米团/ }).click();
  await dock.getByRole('button', { name: '颜色', exact: true }).click();
  await page.getByRole('button', { name: '海盐苏打', exact: true }).click();
  await page.getByRole('button', { name: /就是它了 · 起个名字/ }).click();
  const name = page.getByRole('textbox', { name: '给它一个小名' });
  const previousName = await name.inputValue();
  await name.fill(''); await page.waitForTimeout(600);
  assert(await name.inputValue() === '', 'Clearing name restored default');
  await name.dispatchEvent('compositionstart'); await name.fill('tuan');
  await page.waitForTimeout(600);
  assert(await page.evaluate(async () => (await (await import('/creator/pet-storage.ts')).restoreLocalPet()).name) === previousName, 'IME intermediate name was saved');
  await name.fill('团团'); await name.dispatchEvent('compositionend', { data: '团团' });
  await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
  await page.getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).first().waitFor();
  const before = await page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  assert(before.name === '团团' && before.palette === 'sea-salt-soda', 'Name or appearance failed persistence');
  const creature = page.locator('.travel-stage .pet-3d');
  let last;
  for (let i = 0; i < 5; i++) {
    await creature.press('Enter');
    const current = await creature.getAttribute('data-reaction');
    assert(current && current !== last, 'Response repeated / absent'); last = current;
  }
  await page.waitForTimeout(1900);
  assert(await creature.getAttribute('data-reaction') === '', 'Transient response failed to end');
  const afterTaps = await page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  assert(JSON.stringify(afterTaps) === JSON.stringify(before), 'Click mutated saved companion');
  await page.screenshot({ path: 'output/playwright/experience-named-3d.png', fullPage: true });
  // A failed browser write must be visible, and retry must work.
  await page.evaluate(() => { window.qaPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await name.fill('小海盐'); await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
  await page.getByText(/这次没有保存成功/).first().waitFor();
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.qaPut; delete window.qaPut; });
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await page.getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).first().waitFor();
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  assert(await name.inputValue() === '小海盐', 'Name not restored on new page');
  const restored = await page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  assert(restored.petId === before.petId && restored.createdTime === before.createdTime && JSON.stringify(restored.model3D) === JSON.stringify(before.model3D), 'Identity/config changed on refresh');
  // Names are compared using the shared canonical form, without an autosave loop.
  await page.evaluate(() => {
    window.qaNameWrites = 0; window.qaNamePut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { window.qaNameWrites++; return window.qaNamePut.apply(this, args); };
  });
  try {
    await name.fill('  小海盐  '); await page.waitForTimeout(1200);
    assert(await page.evaluate(() => window.qaNameWrites) === 0, 'Whitespace-only change rewrote the saved pet');
    await name.fill('  小\u0001海盐  '); await page.waitForTimeout(1200);
    assert(await page.evaluate(() => window.qaNameWrites) === 0, 'Control-character cleanup caused repeated writes');
    await name.fill('  奶盐团  '); await page.waitForTimeout(1600);
    assert(await page.evaluate(() => window.qaNameWrites) === 1, 'A new trimmed name should autosave exactly once');
    assert(await page.evaluate(async () => (await (await import('/creator/pet-storage.ts')).restoreLocalPet()).name) === '奶盐团', 'Canonical name was not saved');
    assert(!await page.getByText('小名写好后会自动保存', { exact: true }).count(), 'Canonical name still appears unsaved');
  } finally {
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.qaNamePut; delete window.qaNamePut; delete window.qaNameWrites; });
  }
  // Returning home immediately must let the blur-triggered IndexedDB write finish.
  await page.evaluate(() => { window.qaSameDocument = true; });
  await name.fill('小海盐');
  await page.getByRole('link', { name: '桌角生物首页', exact: true }).click();
  assert(await page.evaluate(() => window.qaSameDocument) === true, 'Brand navigation reloaded the document during save');
  await page.getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).first().waitFor();
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  assert(await name.inputValue() === '小海盐', 'Quick home navigation lost the pending name');
  await page.getByText('第一次见面 / 留一份小窝', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载小窝文件', exact: true }).click();
  await (await download).saveAs('output/playwright/experience-saved-3d.cornerpet');
  // Photos larger than localStorage's usual quota must also survive reopening.
  const large = await page.evaluate(async () => {
    const { createPetModel } = await import('/shared/pet-config.mjs');
    const { savePetLocally, restoreLocalPet } = await import('/creator/pet-storage.ts');
    const saved = await restoreLocalPet();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1280;
    const context = canvas.getContext('2d'); const pixels = context.createImageData(1280, 1280);
    for (let offset = 0; offset < pixels.data.length; offset += 65536) crypto.getRandomValues(pixels.data.subarray(offset, Math.min(offset + 65536, pixels.data.length)));
    context.putImageData(pixels, 0, 0);
    const png = canvas.toDataURL('image/png');
    const pet = createPetModel({ type: 'image-pet', image2D: png, model3D: null, source: 'upload', name: '大照片' });
    try {
      await savePetLocally(pet); const loaded = await restoreLocalPet();
      return { bytes: png.length, same: loaded.image2D === png && loaded.name === pet.name && loaded.petId === pet.petId };
    } finally { await savePetLocally(saved); }
  });
  assert(large.bytes > 5 * 1024 * 1024 && large.same, 'Large photo persistence not verified');
  assert(errors.length === 0, errors.join('\n'));
  return { result: 'PASS: clear+Chinese composition, canonical-name autosave deduplication, quick home navigation, explicit/auto save, failure visibility/retry, reload identity, random transient reactions, portable backup, large photo storage', photoBytes: large.bytes };
}
