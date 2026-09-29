// Run after packaging/installing, with the ordinary App quit; restores the user's pet in finally.
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { normalizePetConfig, serializePetPackage, parsePetPackage } from '../shared/pet-config.mjs';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const executablePath = process.env.CORNERPET_APP;
assert.ok(executablePath, 'Set CORNERPET_APP to the packaged executable');
const storage = `${process.env.HOME}/Library/Application Support/cornerpet/last-pet.cornerpet`;
const backup = `${process.cwd()}/output/playwright/fit-scale-before.cornerpet`;
await copyFile(storage, backup);
const original = parsePetPackage(await readFile(backup, 'utf8'));
let app, page, restored = false;
const results = [];
async function start() {
  app = await _electron.launch({ executablePath, args: [] });
  page = await app.firstWindow();
  await page.locator('.pet-grab').waitFor();
  await app.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function(template) { globalThis.lastPetMenu = build.call(this, template); return globalThis.lastPetMenu; };
  });
}
async function importFile(file, expectedId) {
  await Promise.all([page.waitForEvent('load'), app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), file)]);
  await page.locator('.pet-grab').waitFor();
  await page.waitForFunction(id => window.cornerpet.getConfig().then(pet => pet.petId === id), expectedId);
}
async function showSize() {
  await page.locator('.pet-grab').click({ button: 'right', force: true });
  const panelEvent = app.waitForEvent('window');
  await app.evaluate(() => {
    const menu = globalThis.lastPetMenu;
    menu.closePopup();
    menu.items.find(item => item.label === '调整大小').submenu.items.find(item => item.label === '自定义…').click();
  });
  const panel = await panelEvent;
  await panel.locator('.size-panel').waitFor();
  await panel.getByRole('spinbutton').waitFor();
  await panel.waitForFunction(() => !document.querySelector('input[type=number]').disabled);
  return panel;
}
async function applySize(percent) {
  const panel = await showSize();
  await panel.getByRole('spinbutton', { name: '自定义大小百分比' }).fill(String(percent));
  await Promise.all([panel.waitForEvent('close'), panel.getByRole('button', { name: '就这么大' }).click()]);
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, percent / 100);
  assert.equal((await page.evaluate(() => window.cornerpet.getView())).scale, percent / 100);
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('panel=size')).getBounds());
  assert.equal(bounds.width, Math.round(280 * percent / 100));
  assert.equal(bounds.height, Math.round(320 * percent / 100));
  assert.equal(parsePetPackage(await readFile(storage, 'utf8')).scale, percent / 100);
}
try {
  await start();
  assert.deepEqual(await page.evaluate(() => window.cornerpet.getConfig()), original);
  for (const [shape, accessory] of [['strawberry', 'flower'], ['mushroom', 'bow'], ['pudding', 'flower']]) {
    const pet = normalizePetConfig({ shape, accessory, material: 'mochi', palette: 'sakura-mochi', name: '贴合验收', petId: `fit-size-${shape}`, scale: 1.25 });
    const file = `${process.cwd()}/output/playwright/fit-native-${shape}.cornerpet`;
    await writeFile(file, serializePetPackage(pet));
    await importFile(file, pet.petId);
    assert.deepEqual(await page.evaluate(() => window.cornerpet.getConfig()), pet);
    await page.waitForTimeout(450);
    await page.screenshot({ path: `output/playwright/fit-native-${shape}.png`, omitBackground: true });
  }
  let panel = await showSize();
  const max = Number(await panel.getByRole('spinbutton').getAttribute('max'));
  for (const invalid of ['', '49', String(max + 1), '180.5']) {
    await panel.getByRole('spinbutton').fill(invalid);
    assert.equal(await panel.getByRole('button', { name: '就这么大' }).isDisabled(), true);
  }
  const panelBounds = await (await app.browserWindow(panel)).evaluate(window => window.getBounds());
  await panel.getByRole('slider').fill('180');
  assert.equal(await panel.getByRole('spinbutton').inputValue(), '180');
  await page.waitForFunction(() => window.cornerpet.getView().then(view => view.scale === 1.8));
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 1.25);
  assert.equal(parsePetPackage(await readFile(storage, 'utf8')).scale, 1.25);
  assert.deepEqual(await (await app.browserWindow(panel)).evaluate(window => window.getBounds()), panelBounds);
  assert.equal(await panel.getByText('按这个屏幕留一点空间', { exact: false }).count(), 0);
  await panel.screenshot({ path: 'output/playwright/custom-size-panel.png' });
  await Promise.all([panel.waitForEvent('close'), panel.getByRole('button', { name: '先这样' }).click()]);
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 1.25);
  assert.equal((await page.evaluate(() => window.cornerpet.getView())).scale, 1.25);
  for (const percent of [50, 200, max]) {
    await applySize(percent);
    await page.locator('.pet-grab').press('Enter');
    await page.waitForTimeout(250);
    const stage = await page.locator('.pet-grab').boundingBox(), canvas = await page.locator('canvas').boundingBox();
    assert.ok(Math.abs(stage.width - canvas.width) < 1 && Math.abs(stage.height - canvas.height) < 1);
    await page.screenshot({ path: `output/playwright/custom-size-3d-${percent}.png`, omitBackground: true });
    results.push({ mode: '3d', percent });
  }
  await assert.rejects(page.evaluate(() => window.cornerpet.setScale(2.51)), /大小请在/);
  const persisted = await page.evaluate(() => window.cornerpet.getConfig());
  await app.close(); app = null;
  await start();
  assert.deepEqual(await page.evaluate(() => window.cornerpet.getConfig()), persisted);
  assert.equal((await page.evaluate(() => window.cornerpet.getView())).scale, persisted.scale);
  const png = `data:image/png;base64,${(await readFile('public/examples/mochi-sprout.png')).toString('base64')}`;
  const image = normalizePetConfig({ type: 'image-pet', asset: png, name: '照片验收', petId: 'fit-size-image', scale: 1 });
  const imageFile = `${process.cwd()}/output/playwright/fit-native-image.cornerpet`;
  await writeFile(imageFile, serializePetPackage(image));
  await importFile(imageFile, image.petId);
  await applySize(200);
  await page.locator('.pet-grab').press('Enter');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'output/playwright/custom-size-photo-200.png', omitBackground: true });
  results.push({ mode: 'image', percent: 200 });
  // Recalling the same photo must keep its desktop-only preference.
  await importFile(imageFile, image.petId);
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 2);
  await importFile(backup, original.petId);
  await page.evaluate(scale => window.cornerpet.setScale(scale), original.scale);
  assert.deepEqual(await page.evaluate(() => window.cornerpet.getConfig()), original);
  assert.deepEqual(parsePetPackage(await readFile(storage, 'utf8')), original);
  restored = true;
  await writeFile('output/playwright/fit-scale-native-results.json', JSON.stringify({ results, max, livePreview: true, previewNotSaved: true, cancel: true, invalid: true, restart: true, samePetRecall: true, originalRestored: true }, null, 2));
  console.log(JSON.stringify({ results, max, livePreview: true, previewNotSaved: true, cancel: true, invalid: true, restart: true, samePetRecall: true, originalRestored: true }));
} finally {
  if (app) await app.close();
  if (!restored) await copyFile(backup, storage);
}
