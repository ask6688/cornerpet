// Run after `npm run pack:mac`; simulate losing screen space during a size preview.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PET, parsePetPackage, serializePetPackage } from '../shared/pet-config.mjs';
import { containPet, DEFAULT_FOOTPRINT } from '../desktop/layout.mjs';

const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const executablePath = process.env.CORNERPET_APP;
assert.ok(executablePath, 'Set CORNERPET_APP to the packaged executable');
const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'cornerpet-resize-display-')));
const storage = path.join(profile, 'last-pet.cornerpet');
await writeFile(storage, serializePetPackage({ ...PET, scale: 1.25 }));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
let app;
try {
  app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], env });
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  const page = await app.firstWindow();
  await page.locator('.pet-grab').waitFor();
  await app.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function (template) { globalThis.lastPetMenu = build.call(this, template); return globalThis.lastPetMenu; };
  });
  await page.locator('.pet-grab').click({ button: 'right', force: true });
  const opened = app.waitForEvent('window');
  await app.evaluate(() => {
    const menu = globalThis.lastPetMenu;
    menu.closePopup();
    menu.items.find(item => item.label === '调整大小').submenu.items.find(item => item.label === '自定义…').click();
  });
  const panel = await opened;
  await panel.locator('.size-panel').waitFor();
  await panel.getByRole('slider').fill('180');
  await page.waitForFunction(() => Math.abs((document.querySelector('.desktop-pet')?.getBoundingClientRect().width ?? 0) - 504) < 1);
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 1.25);

  const closed = panel.waitForEvent('close');
  const { removed, display } = await app.evaluate(({ screen }) => {
    const original = screen.getPrimaryDisplay();
    const width = original.workArea.width - 400;
    if (width < 520) throw new Error('This test needs at least 920 pt of screen width');
    const display = { ...original, bounds: { ...original.bounds, width: original.bounds.width - 400 }, workArea: { ...original.workArea, width } };
    screen.getDisplayMatching = () => display;
    return { removed: screen.emit('display-removed', {}, original), display };
  });
  assert.equal(removed, true, 'the display-removed listener ran');
  await closed;
  await page.waitForFunction(() => Math.abs((document.querySelector('.desktop-pet')?.getBoundingClientRect().width ?? 0) - 350) < 1);
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const view = await page.evaluate(() => window.cornerpet.getView());
  const area = { ...display.bounds, y: Math.max(display.bounds.y, display.workArea.y), height: display.bounds.y + display.bounds.height - Math.max(display.bounds.y, display.workArea.y) };
  const visual = { x: bounds.x + view.offset.x, y: bounds.y + view.offset.y };
  assert.deepEqual(visual, containPet(visual, area, DEFAULT_FOOTPRINT, 1.25), 'the companion remains on the surviving display');
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 1.25);
  assert.equal(parsePetPackage(await readFile(storage, 'utf8')).scale, 1.25);
  await assert.rejects(page.evaluate(() => window.cornerpet.resizeCommit(1.8)), /调整已结束/);

  // If the screen changes after Save was pressed, the in-flight save must still leave the pet visible.
  await page.locator('.pet-grab').click({ button: 'right', force: true });
  const reopened = app.waitForEvent('window');
  await app.evaluate(() => {
    const menu = globalThis.lastPetMenu;
    menu.closePopup();
    menu.items.find(item => item.label === '调整大小').submenu.items.find(item => item.label === '自定义…').click();
  });
  const savingPanel = await reopened;
  await savingPanel.locator('.size-panel').waitFor();
  await savingPanel.getByRole('slider').fill('150');
  await page.waitForFunction(() => Math.abs((document.querySelector('.desktop-pet')?.getBoundingClientRect().width ?? 0) - 420) < 1);
  await app.evaluate(() => {
    const files = process.getBuiltinModule('fs/promises'), original = files.rename;
    globalThis.saveBlocked = false;
    files.rename = async (...args) => {
      if (!globalThis.saveBlocked) {
        globalThis.saveBlocked = true;
        await new Promise(resolve => { globalThis.releaseSave = resolve; });
      }
      return original(...args);
    };
    process.getBuiltinModule('module').syncBuiltinESMExports();
  });
  await savingPanel.getByRole('button', { name: '就这么大' }).click();
  let blocked = false;
  for (let i = 0; i < 100 && !blocked; i++) {
    blocked = await app.evaluate(() => globalThis.saveBlocked);
    if (!blocked) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(blocked, 'the size save reached the disk write');
  const closedDuringSave = savingPanel.waitForEvent('close');
  const secondDisplay = await app.evaluate(({ screen }) => {
    const previous = screen.getDisplayMatching({});
    const next = { ...previous, bounds: { ...previous.bounds, width: 350 }, workArea: { ...previous.workArea, width: 350 } };
    screen.getDisplayMatching = () => next;
    screen.emit('display-removed', {}, previous);
    globalThis.releaseSave();
    return next;
  });
  await closedDuringSave;
  let preferred = 0;
  for (let i = 0; i < 100; i++) {
    preferred = (await page.evaluate(() => window.cornerpet.getConfig())).scale;
    if (preferred === 1.5) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(preferred, 1.5, 'the preference still saves at 150%');
  await page.waitForFunction(() => Math.abs((document.querySelector('.desktop-pet')?.getBoundingClientRect().width ?? 0) - 350) < 1);
  assert.equal((await page.evaluate(() => window.cornerpet.getView())).scale, 1.25, 'the actual display caps it at 125%');
  assert.equal(parsePetPackage(await readFile(storage, 'utf8')).scale, 1.5);
  const finalBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const finalView = await page.evaluate(() => window.cornerpet.getView());
  const finalArea = { ...secondDisplay.bounds, y: Math.max(secondDisplay.bounds.y, secondDisplay.workArea.y), height: secondDisplay.bounds.y + secondDisplay.bounds.height - Math.max(secondDisplay.bounds.y, secondDisplay.workArea.y) };
  const finalVisual = { x: finalBounds.x + finalView.offset.x, y: finalBounds.y + finalView.offset.y };
  assert.deepEqual(finalVisual, containPet(finalVisual, finalArea, DEFAULT_FOOTPRINT, 1.25), 'the pet remains visible after an in-flight save');

  // A new pinch starts at the displayed 125%, not the saved 150% preference.
  await page.waitForFunction(view => document.querySelector('.desktop-pet')?.style.transform === `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.scale})`, finalView);
  await page.evaluate(() => {
    const bubble = document.querySelector('.pet-bubble');
    window.sizeNotes = [];
    new MutationObserver(() => {
      const text = bubble?.textContent;
      if (/^\d+%$/.test(text)) window.sizeNotes.push(text);
    }).observe(bubble, { childList: true, characterData: true, subtree: true });
    window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 8, cancelable: true }));
  });
  let nextScale = 0;
  for (let i = 0; i < 100; i++) {
    nextScale = (await page.evaluate(() => window.cornerpet.getConfig())).scale;
    if (nextScale === 1.15) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const notes = await page.evaluate(() => window.sizeNotes);
  assert.equal(nextScale, 1.15, `the next pinch shrinks 125% by one step; feedback: ${JSON.stringify(notes)}`);
  assert.equal(notes[0], '115%', 'the first feedback starts from the displayed size');
  console.log('display removal during preview and save kept the pet visible; the next pinch used the actual size');
} finally {
  await app?.evaluate(() => globalThis.releaseSave?.()).catch(() => {});
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
